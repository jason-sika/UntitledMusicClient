import { writable } from 'svelte/store';
import { playbackSync } from './playbackSync';
import { browser } from '$app/environment';

function sanitize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function escapeXml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function secToTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(3);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(parseFloat(s).toFixed(3)).padStart(6, '0')}`;
}

function lrcToTtml(lrc) {
  const parsed = lrc
    .split('\n')
    .map((line) => {
      const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)/);
      if (!match) return null;

      const begin = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
      const text = match[3].trim();
      if (!text) return null;

      return { begin, text };
    })
    .filter(Boolean);

  const body = parsed
    .map(({ begin, text }, index) => {
      const end = parsed[index + 1]?.begin ?? begin + 4;
      return `<p begin="${secToTime(begin)}" end="${secToTime(end)}">${escapeXml(text)}</p>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xml:lang="en" xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
    ${body}
    </div>
  </body>
</tt>`;
}

function plainToTtml(text) {
  const body = text
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      const begin = secToTime(index * 3);
      const end = secToTime((index + 1) * 3);
      return `<p begin="${begin}" end="${end}">${escapeXml(line.trim())}</p>`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xml:lang="en" xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
    ${body}
    </div>
  </body>
</tt>`;
}

async function fetchLrcLibTtml(song, artist) {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: song
  });

  const res = await fetch(`https://lrclib.net/api/get?${params}`);
  if (!res.ok) throw new Error('Lyrics not found');

  const data = await res.json();
  if (data.syncedLyrics) return lrcToTtml(data.syncedLyrics);
  if (data.plainLyrics) return plainToTtml(data.plainLyrics);

  throw new Error('Lyrics not found');
}

function createLyricsStore() {
  const { subscribe, set } = writable({ src: '', ttmlString: '', loading: false, error: '', currentUrl: '', currentKey: '' });
  let lastKey = '';
  let initialized = false;

  return {
    subscribe: (run) => {
      if (browser && !initialized && playbackSync?.subscribe) {
        initialized = true;
        playbackSync.subscribe(async (sync) => {
          const { device } = sync;
          if (!device?.title || !device?.artist || !device?.available) return;

          const key = `${device.title}::${device.artist}::${device.album || ''}`;
          if (key === lastKey) return;
          lastKey = key;

          set({ src: '', ttmlString: '', loading: true, error: '', currentUrl: '', currentKey: '' });

          try {
            const params = new URLSearchParams({
              song: device.title,
              artist: device.artist,
              album: device.album || ''
            });

            const lookupRes = await fetch(`https://server.jasonsika.com/lyrics-lookup?${params}`);

            if (lookupRes.ok) {
              const data = await lookupRes.json();
              if (data.url) {
                set({ src: `https://server.jasonsika.com${data.url}`, ttmlString: '', loading: false, error: '', currentUrl: data.url, currentKey: key });
                return;
              }
            }

            // Fallback to LRCLIB
            const ttmlText = await fetchLrcLibTtml(device.title, device.artist);
            set({ src: '', ttmlString: ttmlText, loading: false, error: '', currentUrl: '', currentKey: key });

          } catch (e) {
            set({ src: '', ttmlString: '', loading: false, error: e.message, currentUrl: '', currentKey: key });
            //                                                                              keep key ↑ so lyricsMatchDevice stays true and error is visible
          }
        });
      }
      return subscribe(run);
    }
  };
}

export const lyrics = createLyricsStore();
