import { writable } from 'svelte/store';

// Populated by whoever calls scanLibrary() (currently the /app homepage).
// Shape: [{ id, title, artist, ext, filename, handle }, ...]
export const librarySongs = writable([]);
