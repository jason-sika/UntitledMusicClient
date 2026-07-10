// $lib/albumArt.js
// Shared artwork-fetch logic, adapted from playbackSync.js's enrichArtwork().
const SEARCH_BASE = "https://pull.jasonsika.com/api/search";
const ANIMATED_BASE = "https://server.jasonsika.com";

// Looks up artwork (and animated art, if available) for an artist/album.
// Returns { album_art, animated_art } as URLs — throws if nothing is found.
export async function fetchAlbumArtFromServer(artist, album) {
  const searchRes = await fetch(
    `${SEARCH_BASE}?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`,
  );
  if (!searchRes.ok) throw new Error("Artwork search failed.");
  const d = await searchRes.json();

  let album_art = d.album_art || "";
  let animated_art = "";

  // Only try animated-art lookup when we got an Apple Music source URL —
  // Deezer URLs don't work with this endpoint (same caveat as playbackSync.js)
  if (d.url && d.url.includes("music.apple.com")) {
    const artRes = await fetch(
      `${ANIMATED_BASE}/animated-art-lookup?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&url=${encodeURIComponent(d.url)}`,
    );
    if (artRes.ok) {
      const artData = await artRes.json();
      if (artData.animatedUrl) animated_art = `${ANIMATED_BASE}${artData.animatedUrl}`;
      if (artData.staticUrl && !album_art) album_art = `${ANIMATED_BASE}${artData.staticUrl}`;
    }
  }

  // If the "static" art is actually an mp4 from our server, it's animated — promote it
  if (album_art.startsWith(ANIMATED_BASE) && album_art.endsWith(".mp4")) {
    animated_art = album_art;
    album_art = "";
  }

  if (!album_art && !animated_art) {
    throw new Error("No artwork found for that artist/album.");
  }

  return { album_art, animated_art };
}

// Downloads a URL into a File object so it can be handed to saveCollectionAsset,
// which expects a File/Blob (writeBinaryFile just streams it to disk as-is).
export async function urlToFile(url, filename, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not download artwork file.");
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type });
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
}
