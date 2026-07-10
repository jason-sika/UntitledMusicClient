// Library folder structure: init, scan, import, delete, and collection edits.

const LIST_MD_NAME = "list.md";
const ALBUMS_DIR = "Albums";
const PLAYLISTS_DIR = "Playlists";
const SONGS_DIR = "Songs";
const ASSETS_DIR = "Assets";
const SONG_COVER_NAME = "cover.webp";

// ---------- low-level fs helpers ----------

async function getOrCreateDir(parentHandle, name) {
  return parentHandle.getDirectoryHandle(name, { create: true });
}

async function fileExists(parentHandle, name) {
  try {
    await parentHandle.getFileHandle(name, { create: false });
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(dirHandle, name) {
  try {
    const fileHandle = await dirHandle.getFileHandle(name, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

async function writeTextFile(dirHandle, name, contents) {
  const fileHandle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function writeBinaryFile(dirHandle, name, file) {
  const fileHandle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

// ---------- list.md (YAML frontmatter) ----------

function parseFrontmatter(text) {
  if (!text) return {};
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const body = match[1];
  const result = {};
  let currentKey = null;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (/^\s*-\s+/.test(line) && currentKey) {
      const val = line.replace(/^\s*-\s+/, "").trim();
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(val);
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const value = kv[2].trim();
      result[currentKey] = value; // was: value === "" ? [] : value
    }
  }
  return result;
}

function stringifyFrontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${item}`);
    } else {
      lines.push(`${key}: ${value ?? ""}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

// ---------- root library init / scan ----------

export async function initLibrary(rootHandle) {
  const songsDir = await getOrCreateDir(rootHandle, SONGS_DIR);
  const albumsDir = await getOrCreateDir(rootHandle, ALBUMS_DIR);
  const playlistsDir = await getOrCreateDir(rootHandle, PLAYLISTS_DIR);

  const hadListMd = await fileExists(rootHandle, LIST_MD_NAME);
  if (!hadListMd) {
    await writeTextFile(
      rootHandle,
      LIST_MD_NAME,
      stringifyFrontmatter({ albums: [], playlists: [] }),
    );
  }

  return { songsDir, albumsDir, playlistsDir, firstRun: !hadListMd };
}

export async function scanLibrary(rootHandle) {
  const { songsDir, albumsDir, playlistsDir } = await initLibrary(rootHandle);

  const rootListText = await readTextFile(rootHandle, LIST_MD_NAME);
  const rootList = parseFrontmatter(rootListText);
  const albumIds = Array.isArray(rootList.albums) ? rootList.albums : [];
  const playlistIds = Array.isArray(rootList.playlists) ? rootList.playlists : [];

  const albums = [];
  for (const id of albumIds) {
    const album = await scanCollection(albumsDir, id, "Album");
    if (album) albums.push(album);
  }

  const playlists = [];
  for (const id of playlistIds) {
    const playlist = await scanCollection(playlistsDir, id, "Playlist");
    if (playlist) playlists.push(playlist);
  }

  const songs = await scanSongs(songsDir);

  return { songsDir, albumsDir, playlistsDir, albums, playlists, songs };
}

export async function getSongsDir(rootHandle) {
  return getOrCreateDir(rootHandle, SONGS_DIR);
}

export async function scanSongsOnly(rootHandle) {
  const songsDir = await getSongsDir(rootHandle);
  return scanSongs(songsDir);
}

async function scanCollection(parentDir, id, kind) {
  let collectionDir;
  try {
    collectionDir = await parentDir.getDirectoryHandle(id, { create: false });
  } catch {
    return null;
  }

  const listText = await readTextFile(collectionDir, LIST_MD_NAME);
  const list = parseFrontmatter(listText);

  let artworkUrl = null;
  let animatedArtUrl = null;
  let bannerUrl = null;
  try {
    const assetsDir = await collectionDir.getDirectoryHandle(ASSETS_DIR, { create: false });
    const artworkName = `${kind}_Artwork.webp`;
    const animatedName = `${kind}_AnimatedArt.mp4`;
    const bannerName = `${kind}_Banner.webp`;
    if (await fileExists(assetsDir, artworkName)) {
      const fh = await assetsDir.getFileHandle(artworkName);
      artworkUrl = URL.createObjectURL(await fh.getFile());
    }
    if (await fileExists(assetsDir, animatedName)) {
      const fh = await assetsDir.getFileHandle(animatedName);
      animatedArtUrl = URL.createObjectURL(await fh.getFile());
    }
    if (await fileExists(assetsDir, bannerName)) {
      const fh = await assetsDir.getFileHandle(bannerName);
      bannerUrl = URL.createObjectURL(await fh.getFile());
    }
  } catch {
    // no Assets/ folder yet — all optional, fine
  }
  const rawTracks = parseTrackList(list, kind);
   const tracks = dedupeTracks(rawTracks);

   if (tracks.length !== rawTracks.length) {
     // self-heal the on-disk file so duplicate songIds don't reappear on every load
     list.tracks = stringifyTrackList(tracks, kind);
     await writeTextFile(collectionDir, LIST_MD_NAME, stringifyFrontmatter(list));
   }

   return {
     id,
     kind,
     name: list.name ?? "",
     year: list.year ?? "",
     genre: list.genre ?? "",
     artists: Array.isArray(list.artists) ? list.artists : list.artists ? [list.artists] : [],
     tracks,
     artworkUrl,
     animatedArtUrl,
     bannerUrl,
   };
 }

// Public single-collection loader — used by the Album/Playlist page.
export async function getCollection(rootHandle, kind, id) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await getOrCreateDir(rootHandle, dirName);
  return scanCollection(parentDir, id, kind);
}

function parseTrackList(list, kind) {
  const raw = Array.isArray(list.tracks) ? list.tracks : [];
  return raw.map((entry) => {
    const parts = entry.split("|").map((p) => p.trim());
    if (kind === "Album") {
      return { songId: Number(parts[0]), track: Number(parts[1] ?? 1), disc: Number(parts[2] ?? 1) };
    }
    return { songId: Number(parts[0]), track: Number(parts[1] ?? 1) };
  });
}

function dedupeTracks(tracks) {
  const seen = new Set();
  return tracks.filter((t) => {
    if (seen.has(t.songId)) return false;
    seen.add(t.songId);
    return true;
  });
}

function stringifyTrackList(tracks, kind) {
  return tracks.map((t) =>
    kind === "Album" ? `${t.songId}|${t.track}|${t.disc}` : `${t.songId}|${t.track}`,
  );
}

// ---------- songs: one folder per song ----------
// Songs/<title>_<artist>_(<id>)/song.<ext>
// Songs/<title>_<artist>_(<id>)/cover.webp   (optional)

const SONG_DIR_RE = /^(.+)_(.+)_\((\d+)\)$/;

function parseSongDirName(name) {
  const match = name.match(SONG_DIR_RE);
  if (!match) return null;
  const [, title, artist, id] = match;
  return { id: Number(id), title: unslugify(title), artist: unslugify(artist) };
}

function slugify(str) {
  return str
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "-");
}

function unslugify(str) {
  return str.replace(/-/g, " ");
}

async function scanSongs(songsDir) {
  const songs = [];
  for await (const [name, handle] of songsDir.entries()) {
    if (handle.kind !== "directory") continue;
    const parsed = parseSongDirName(name);
    if (!parsed) continue;

    let audioHandle = null;
    let ext = "";
    let hasCover = false;

    for await (const [childName, childHandle] of handle.entries()) {
      if (childHandle.kind !== "file") continue;
      if (childName === SONG_COVER_NAME) {
        hasCover = true;
        continue;
      }
      audioHandle = childHandle;
      ext = (childName.split(".").pop() || "").toLowerCase();
    }

    if (!audioHandle) continue; // empty/broken folder — skip, don't crash

    songs.push({
      ...parsed,
      dirname: name,
      ext,
      hasCover,
      handle: audioHandle,
    });
  }
  return songs;
}

async function nextSongId(songsDir) {
  let max = 0;
  for await (const [name, handle] of songsDir.entries()) {
    if (handle.kind !== "directory") continue;
    const match = name.match(/\((\d+)\)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

// ---------- import ----------

export async function importSong(songsDir, file, metadata) {
  const { title, artist } = metadata;
  if (!title?.trim() || !artist?.trim()) {
    throw new Error("Title and artist are required.");
  }

  const id = await nextSongId(songsDir);
  const ext = (file.name.split(".").pop() || "audio").toLowerCase();
  const dirname = `${slugify(title)}_${slugify(artist)}_(${id})`;

  const songDir = await getOrCreateDir(songsDir, dirname);
  await writeBinaryFile(songDir, `song.${ext}`, file);

  return { id, dirname, title: title.trim(), artist: artist.trim(), ext };
}

export async function saveSongCover(songsDir, dirname, coverFile) {
  const songDir = await songsDir.getDirectoryHandle(dirname, { create: false });
  await writeBinaryFile(songDir, SONG_COVER_NAME, coverFile);
  return SONG_COVER_NAME;
}

export async function getSongCoverUrl(songsDir, dirname) {
  try {
    const songDir = await songsDir.getDirectoryHandle(dirname, { create: false });
    const fh = await songDir.getFileHandle(SONG_COVER_NAME, { create: false });
    return URL.createObjectURL(await fh.getFile());
  } catch {
    return null;
  }
}

// ---------- delete ----------

export async function deleteSong(songsDir, song) {
  await songsDir.removeEntry(song.dirname, { recursive: true });
}

// ---------- rename (used when a collection's artist field is edited) ----------

export async function renameSongFile(songsDir, song, { title, artist } = {}) {
  const newTitle = title ?? song.title;
  const newArtist = artist ?? song.artist;
  const newDirname = `${slugify(newTitle)}_${slugify(newArtist)}_(${song.id})`;
  if (newDirname === song.dirname) return song.dirname;

  const oldDir = await songsDir.getDirectoryHandle(song.dirname, { create: false });
  const newDir = await getOrCreateDir(songsDir, newDirname);

  for await (const [childName, childHandle] of oldDir.entries()) {
    if (childHandle.kind !== "file") continue;
    const file = await childHandle.getFile();
    await writeBinaryFile(newDir, childName, file);
  }

  await songsDir.removeEntry(song.dirname, { recursive: true });

  return newDirname;
}

// ---------- collection creation / edits ----------

export async function createCollection(rootHandle, kind, name) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await rootHandle.getDirectoryHandle(dirName, { create: true });

  const id = crypto.randomUUID().slice(0, 8);
  const collectionDir = await getOrCreateDir(parentDir, id);
  await getOrCreateDir(collectionDir, ASSETS_DIR);
  await writeTextFile(
    collectionDir,
    LIST_MD_NAME,
    stringifyFrontmatter({ name: name ?? "", year: "", genre: "", artists: [], tracks: [] }),
  );

  const rootListText = await readTextFile(rootHandle, LIST_MD_NAME);
  const rootList = parseFrontmatter(rootListText);
  const key = kind === "Album" ? "albums" : "playlists";
  const ids = Array.isArray(rootList[key]) ? rootList[key] : [];
  ids.push(id);
  rootList[key] = ids;
  await writeTextFile(rootHandle, LIST_MD_NAME, stringifyFrontmatter(rootList));

  return id;
}

export async function setCollectionTracks(rootHandle, kind, id, tracks) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  const collectionDir = await parentDir.getDirectoryHandle(id, { create: false });

  const listText = await readTextFile(collectionDir, LIST_MD_NAME);
  const list = parseFrontmatter(listText) ?? {};
  list.tracks = stringifyTrackList(tracks, kind);
  await writeTextFile(collectionDir, LIST_MD_NAME, stringifyFrontmatter(list));
}

// Appends one song to a collection's track list (used by the import flow).
export async function addSongToCollection(rootHandle, kind, id, songId, trackMeta = {}) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  const collectionDir = await parentDir.getDirectoryHandle(id, { create: false });

  const listText = await readTextFile(collectionDir, LIST_MD_NAME);
  const list = parseFrontmatter(listText) ?? {};
  const tracks = parseTrackList(list, kind);

  if (tracks.some((t) => t.songId === songId)) {
    // Already in this collection — nothing to do.
    return;
  }

  const nextTrackNum =
    tracks.reduce((max, t) => Math.max(max, t.track), 0) + 1;

  tracks.push(
    kind === "Album"
      ? { songId, track: trackMeta.track ?? nextTrackNum, disc: trackMeta.disc ?? 1 }
      : { songId, track: trackMeta.track ?? nextTrackNum },
  );
  list.tracks = stringifyTrackList(tracks, kind);
  await writeTextFile(collectionDir, LIST_MD_NAME, stringifyFrontmatter(list));
}

// Updates name/year/genre/artists in a collection's list.md. Does not touch
// the track list. Does NOT rename song files itself — the caller (the
// collection page) does that via renameSongFile when artists actually change,
// since that's a per-song filesystem operation, not a list.md concern.
export async function updateCollectionMeta(rootHandle, kind, id, meta) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  const collectionDir = await parentDir.getDirectoryHandle(id, { create: false });

  const listText = await readTextFile(collectionDir, LIST_MD_NAME);
  const list = parseFrontmatter(listText) ?? {};
  if (meta.name !== undefined) list.name = meta.name;
  if (meta.year !== undefined) list.year = meta.year;
  if (meta.genre !== undefined) list.genre = meta.genre;
  if (meta.artists !== undefined) list.artists = meta.artists;
  await writeTextFile(collectionDir, LIST_MD_NAME, stringifyFrontmatter(list));
}

// assetType: "artwork" | "animated" | "banner"
export async function saveCollectionAsset(rootHandle, kind, id, assetType, file) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  const collectionDir = await parentDir.getDirectoryHandle(id, { create: false });
  const assetsDir = await getOrCreateDir(collectionDir, ASSETS_DIR);

  const names = {
    artwork: `${kind}_Artwork.webp`,
    animated: `${kind}_AnimatedArt.mp4`,
    banner: `${kind}_Banner.webp`,
  };
  const name = names[assetType];
  if (!name) throw new Error("Unknown asset type.");

  await writeBinaryFile(assetsDir, name, file);
  return name;
}

export async function deleteCollection(rootHandle, kind, id) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  await parentDir.removeEntry(id, { recursive: true });

  const rootListText = await readTextFile(rootHandle, LIST_MD_NAME);
  const rootList = parseFrontmatter(rootListText) ?? {};
  const key = kind === "Album" ? "albums" : "playlists";
  const ids = Array.isArray(rootList[key]) ? rootList[key] : [];
  rootList[key] = ids.filter((existingId) => existingId !== id);
  await writeTextFile(rootHandle, LIST_MD_NAME, stringifyFrontmatter(rootList));
}

export async function removeSongFromCollection(rootHandle, kind, id, songId) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  const collectionDir = await parentDir.getDirectoryHandle(id, { create: false });

  const listText = await readTextFile(collectionDir, LIST_MD_NAME);
  const list = parseFrontmatter(listText) ?? {};
  const tracks = parseTrackList(list, kind).filter((t) => t.songId !== songId);
  list.tracks = stringifyTrackList(tracks, kind);
  await writeTextFile(collectionDir, LIST_MD_NAME, stringifyFrontmatter(list));
}

// direction: "up" | "down". Swaps track numbers with the adjacent track in
// display order. For albums, only swaps within the same disc — moving a
// track across discs would need explicit disc reassignment, not a simple swap.
export async function moveTrackInCollection(rootHandle, kind, id, songId, direction) {
  const dirName = kind === "Album" ? ALBUMS_DIR : PLAYLISTS_DIR;
  const parentDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  const collectionDir = await parentDir.getDirectoryHandle(id, { create: false });

  const listText = await readTextFile(collectionDir, LIST_MD_NAME);
  const list = parseFrontmatter(listText) ?? {};
  const tracks = parseTrackList(list, kind);

  const sorted = [...tracks].sort(
    (a, b) => (a.disc ?? 1) - (b.disc ?? 1) || a.track - b.track,
  );
  const idx = sorted.findIndex((t) => t.songId === songId);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return; // already at an edge
  if ((sorted[idx].disc ?? 1) !== (sorted[swapIdx].disc ?? 1)) return; // don't cross discs

  const tmp = sorted[idx].track;
  sorted[idx].track = sorted[swapIdx].track;
  sorted[swapIdx].track = tmp;

  list.tracks = stringifyTrackList(sorted, kind);
  await writeTextFile(collectionDir, LIST_MD_NAME, stringifyFrontmatter(list));
}
