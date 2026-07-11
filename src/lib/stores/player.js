import { writable } from 'svelte/store';
import { sendDiscordActivity, clearDiscordActivity } from '$lib/discord.js';

async function reportListeningStatus(track) {
  try {
    await fetch('https://backend.umc.jasonsika.com/api/presence/listening', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track }), // track: { title, artist, songId } | null
    });
  } catch {
    // best-effort, same posture as the other presence calls
  }
}

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

  // Kept in sync via the subscribe below so Discord notifications (and
  // anything else that needs a synchronous read) don't have to thread
  // state through every call site.
  let snapshot;
  subscribe((s) => { snapshot = s; });

  let audioEl = null;
  let currentObjectUrl = null;
  let queue = [];
  let queueIndex = -1;

  // Whether to push listening activity to Discord at all — mirrors the
  // user's shareListenActivity setting. Off by default until the app
  // explicitly enables it (see AccountSettings.svelte), so we never leak
  // listening activity before we know the user's preference.
  let discordEnabled = false;

  function setDiscordEnabled(enabled) {
    discordEnabled = enabled;
    if (!enabled) {
      clearDiscordActivity();
      reportListeningStatus(null);
    } else {
      notifyDiscord();
      notifyListening();
    }
  }

  // Call only on discrete state changes (song loaded, play, pause, stop) —
  // never from the per-frame ticker, or the debounce in discord.js would
  // never get a quiet moment to actually fire.
  function notifyDiscord() {
    if (!discordEnabled) return;
    if (!snapshot.title) return;

    sendDiscordActivity({
      title: snapshot.title,
      artist: snapshot.artist,
      // Local library art is a blob: URL and useless to Discord's CDN —
      // only forward it if it's already a real, fetchable URL.
      albumArt: snapshot.albumArt?.startsWith('http') ? snapshot.albumArt : '',
      isPlaying: snapshot.isPlaying,
      currentTime: snapshot.currentTime,
      duration: snapshot.duration,
    });
  }

  // Broadcasts "currently listening" to friends, independent of Discord.
  // Gated on the same discordEnabled flag — it's really "shareListenActivity"
  // under the hood (see the Settings.svelte toggle label), so one flag
  // correctly governs both destinations.
  function notifyListening() {
    if (!discordEnabled) return;
    if (!snapshot.title) {
      reportListeningStatus(null);
      return;
    }
    reportListeningStatus({
      songId: snapshot.songId,
      title: snapshot.title,
      artist: snapshot.artist,
    });
  }

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
    clearDiscordActivity();
    reportListeningStatus(null);
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
    notifyDiscord(); // reflect the new track even if autoplay ends up blocked below
    notifyListening();


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
    audioEl?.play().catch(() => { });
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
    notifyDiscord();
    notifyListening();
  }

  function setTime(currentTime, duration) {
    update((s) => ({ ...s, currentTime, duration }));
    if ('mediaSession' in navigator && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({ duration, position: currentTime, playbackRate: 1 });
      } catch { }
    }
    // Deliberately NOT calling notifyDiscord() here — this fires many times
    // a second while playing, which would starve the debounce and mean
    // presence never actually gets sent. Discord's own elapsed-time display
    // is driven off the start/end timestamps sent in notifyDiscord(), not
    // by us polling it.
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
    setDiscordEnabled,
  };
}

export const player = createPlayerStore();