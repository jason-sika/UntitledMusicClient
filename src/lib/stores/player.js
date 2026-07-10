import { writable } from 'svelte/store';

function createPlayerStore() {
  const { subscribe, update } = writable({
    songId: null,
    title: '',
    artist: '',
    albumArt: '/images/plhd.png',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    ready: false,
  });

  let audioEl = null;
  let currentObjectUrl = null;
  let queue = [];
  let queueIndex = -1;

  function setMediaSessionMetadata(meta) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title || 'Unknown title',
      artist: meta.artist || 'Unknown artist',
      album: meta.album || '',
      artwork: [
        { src: meta.albumArt || '/images/plhd.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  }

  function setMediaSessionState(isPlaying) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }

  function attachPlayer(instance) {
    audioEl = instance;
    update((s) => ({ ...s, ready: true }));
    startTicker();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => play());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null && audioEl) {
          audioEl.currentTime = details.seekTime;
        }
      });
    }
  }

  function detachPlayer() {
    stopTicker();
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    audioEl = null;
    update((s) => ({ ...s, ready: false }));
  }

  // `song` can be a File, or a FileSystemFileHandle (has .getFile()) —
  // matches what scanLibrary()/importSong() hand back for Songs/ entries.
  async function loadSong(song, meta = {}) {
    if (!audioEl) return;
    audioEl.pause();

    let file = song;
    if (song?.getFile) {
      file = await song.getFile();
    }

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    const url = URL.createObjectURL(file);
    currentObjectUrl = url;

    update((s) => ({
      ...s,
      songId: meta.songId ?? null,
      title: meta.title ?? '',
      artist: meta.artist ?? '',
      albumArt: meta.albumArt ?? '/images/plhd.png',
      currentTime: 0,
      duration: 0,
      isPlaying: false,
    }));

    audioEl.src = url;
    setMediaSessionMetadata(meta);
    audioEl.play().catch(() => {
      // autoplay can be blocked without a user gesture — isPlaying
      // stays false and the play button just shows "play" as normal
    });
  }

  // items: [{ song, meta }, ...]. Loads items[startIndex] and remembers the
  // rest so playNext()/playPrevious() (and the OS media-key handlers) work.
  function loadQueue(items, startIndex = 0) {
    queue = items;
    queueIndex = startIndex;
    const current = queue[queueIndex];
    if (current) loadSong(current.song, current.meta);
  }

  function playNext() {
    if (queueIndex + 1 < queue.length) {
      queueIndex += 1;
      loadSong(queue[queueIndex].song, queue[queueIndex].meta);
    }
  }

  function playPrevious() {
    if (queueIndex > 0) {
      queueIndex -= 1;
      loadSong(queue[queueIndex].song, queue[queueIndex].meta);
    }
  }

  function play() {
    audioEl?.play().catch(() => {});
  }

  function pause() {
    audioEl?.pause();
  }

  let rafId = null;

  function startTicker() {
    if (rafId) return;
    const tick = () => {
      if (audioEl && !audioEl.paused) {
        update((s) => {
          // avoid work if duration isn't known yet
          return { ...s, currentTime: audioEl.currentTime };
        });
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopTicker() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function seek(fraction) {
    update((s) => {
      if (audioEl && s.duration > 0) {
        audioEl.currentTime = s.duration * fraction;
      }
      return s;
    });
  }

  function setPlaying(isPlaying) {
    update((s) => ({ ...s, isPlaying }));
    setMediaSessionState(isPlaying);
  }

  function setTime(currentTime, duration) {
    update((s) => ({ ...s, currentTime, duration }));
    if ('mediaSession' in navigator && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({ duration, position: currentTime, playbackRate: 1 });
      } catch {}
    }
  }

  return {
    subscribe,
    attachPlayer,
    detachPlayer,
    loadSong,
    loadQueue,
    playNext,
    playPrevious,
    play,
    pause,
    seek,
    setPlaying,
    setTime,
  };
}

export const player = createPlayerStore();
