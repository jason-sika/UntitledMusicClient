import { writable } from 'svelte/store';
import { player } from './player';
import { browser } from '$app/environment';

// sanitize, escapeXml, secToTime, lrcToTtml, plainToTtml, fetchLrcLibTtml — unchanged, keep as-is

function createLyricsStore() {
  const { subscribe, set } = writable({ src: '', ttmlString: '', loading: false, error: '', currentUrl: '', currentKey: '' });
  let lastKey = '';
  let initialized = false;

  return {
    subscribe: (run) => {
      if (browser && !initialized) {
        initialized = true;
        player.subscribe(async (p) => {
          if (!p.title || !p.artist) return;

          const key = `${p.title}::${p.artist}`;
          if (key === lastKey) return;
          lastKey = key;

          set({ src: '', ttmlString: '', loading: true, error: '', currentUrl: '', currentKey: '' });

          try {
            const params = new URLSearchParams({
              song: p.title,
              artist: p.artist,
              album: ''
            });

            const lookupRes = await fetch(`https://server.jasonsika.com/lyrics-lookup?${params}`);

            if (lookupRes.ok) {
              const data = await lookupRes.json();
              if (data.url) {
                set({ src: `https://server.jasonsika.com${data.url}`, ttmlString: '', loading: false, error: '', currentUrl: data.url, currentKey: key });
                return;
              }
            }

            const ttmlText = await fetchLrcLibTtml(p.title, p.artist);
            set({ src: '', ttmlString: ttmlText, loading: false, error: '', currentUrl: '', currentKey: key });
          } catch (e) {
            set({ src: '', ttmlString: '', loading: false, error: e.message, currentUrl: '', currentKey: key });
          }
        });
      }
      return subscribe(run);
    }
  };
}

export const lyrics = createLyricsStore();
