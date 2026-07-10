<script>
  import { getContext, onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    getCollection,
    updateCollectionMeta,
    saveCollectionAsset,
    scanSongsOnly,
    getSongsDir,
    renameSongFile,
    addSongToCollection,
    removeSongFromCollection,
    moveTrackInCollection,
    deleteCollection,
  } from "$lib/libraryFs.js";
  import { fetchAlbumArtFromServer, urlToFile } from "$lib/albumArt.js";
  import { player } from "$lib/stores/player";
  import { librarySongs } from "$lib/stores/library";
  import ImageCropper from "$lib/components/ImageCropper.svelte";

  let { kind, id } = $props(); // kind: "Album" | "Playlist"

  const library = getContext("libraryHandle");
  let fetchingArt = $state(false);

  let collection = $state(null);
  let allSongs = $state([]);
  let loading = $state(true);
  let notFound = $state(false);
  let saving = $state(false);
  let error = $state("");

  let editing = $state(false);
  let editName = $state("");
  let editYear = $state("");
  let editGenre = $state("");
  let editArtists = $state("");

  let addSongId = $state("");

  let cropTarget = $state(null); // "banner" | "artwork" | "animated" | null
  let cropFile = $state(null);

  function handleAssetUpload(assetType, e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    console.log("handleAssetUpload fired", assetType, file);
    if (!file) return;
    if (assetType === "animated") {
      saveAsset(assetType, file);
      return;
    }
    cropTarget = assetType;
    cropFile = file;
    console.log("cropTarget set to", cropTarget);
  }

  async function saveAsset(assetType, assetFile) {
    saving = true;
    error = "";
    try {
      await saveCollectionAsset(library.handle, kind, id, assetType, assetFile);
      await load();
    } catch (err) {
      console.error("Failed to upload asset:", err);
      error = "Could not upload that file.";
    } finally {
      saving = false;
    }
  }

  function onCropped(croppedFile) {
    const assetType = cropTarget;
    cropTarget = null;
    cropFile = null;
    saveAsset(assetType, croppedFile);
  }

  const tracks = $derived(
    (collection?.tracks ?? [])
      .map((t) => ({ ...t, song: allSongs.find((s) => s.id === t.songId) }))
      .filter((t) => t.song)
      .sort((a, b) => (a.disc ?? 1) - (b.disc ?? 1) || a.track - b.track),
  );

  const availableSongs = $derived(
    allSongs.filter((s) => !tracks.some((t) => t.songId === s.id)),
  );

  async function load() {
    if (!library?.handle) return;
    loading = true;
    error = "";
    try {
      const [col, songs] = await Promise.all([
        getCollection(library.handle, kind, id),
        scanSongsOnly(library.handle),
      ]);
      allSongs = songs;
      librarySongs.set(songs);
      if (!col) {
        notFound = true;
      } else {
        collection = col;
        resetEditFields(col);
      }
    } catch (err) {
      console.error("Failed to load collection:", err);
      error = "Could not load this page.";
    } finally {
      loading = false;
    }
  }

  function resetEditFields(col) {
    editName = col.name ?? "";
    editYear = col.year ?? "";
    editGenre = col.genre ?? "";
    editArtists = (col.artists ?? []).join(", ");
  }

  function startEditing() {
    resetEditFields(collection);
    editing = true;
  }

  function cancelEditing() {
    editing = false;
    error = "";
  }

  async function saveEdits() {
    if (saving) return;
    saving = true;
    error = "";
    try {
      const newArtists = editArtists
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const artistsChanged =
        JSON.stringify(newArtists) !== JSON.stringify(collection.artists ?? []);

      await updateCollectionMeta(library.handle, kind, id, {
        name: editName.trim(),
        year: editYear.trim(),
        genre: editGenre.trim(),
        artists: newArtists,
      });

      if (artistsChanged && newArtists.length > 0) {
        const songsDir = await getSongsDir(library.handle);
        const newArtistLabel = newArtists.join(", ");
        for (const t of tracks) {
          await renameSongFile(songsDir, t.song, { artist: newArtistLabel });
        }
      }

      editing = false;
      await load();
    } catch (err) {
      console.error("Failed to save changes:", err);
      error = "Could not save changes.";
    } finally {
      saving = false;
    }
  }

  async function handleDeleteCollection() {
    if (!confirm(`Delete this ${kind.toLowerCase()}? This can't be undone.`)) return;
    saving = true;
    error = "";
    try {
      await deleteCollection(library.handle, kind, id);
      goto("/app");
    } catch (err) {
      console.error("Failed to delete collection:", err);
      error = "Could not delete this collection.";
      saving = false;
    }
  }

  async function handleAddSong() {
    if (!addSongId) return;
    error = "";
    try {
      await addSongToCollection(library.handle, kind, id, Number(addSongId));
      addSongId = "";
      await load();
    } catch (err) {
      console.error("Failed to add song:", err);
      error = "Could not add that song.";
    }
  }

  async function handleFetchArtFromServer() {
    if (fetchingArt || saving) return;
    fetchingArt = true;
    error = "";
    try {
      const searchArtist = collection.artists?.[0] || tracks[0]?.song?.artist || "";
      if (!searchArtist) {
        throw new Error("Add an artist to this collection first.");
      }
      if (!collection.name) {
        throw new Error("Add an album/playlist name first.");
      }

      const { album_art, animated_art } = await fetchAlbumArtFromServer(
        searchArtist,
        collection.name,
      );

      if (animated_art) {
        const file = await urlToFile(animated_art, "animated.mp4");
        await saveCollectionAsset(library.handle, kind, id, "animated", file);
      }
      if (album_art) {
        const file = await urlToFile(album_art, "artwork.webp");
        await saveCollectionAsset(library.handle, kind, id, "artwork", file);
      }

      await load();
    } catch (err) {
      console.error("Failed to fetch artwork from server:", err);
      error = err.message || "Could not fetch artwork from server.";
    } finally {
      fetchingArt = false;
    }
  }

  async function handleRemoveTrack(songId) {
    if (!confirm(`Remove this song from the ${kind.toLowerCase()}?`)) return;
    error = "";
    try {
      await removeSongFromCollection(library.handle, kind, id, songId);
      await load();
    } catch (err) {
      console.error("Failed to remove track:", err);
      error = "Could not remove that song.";
    }
  }

  async function handleMoveTrack(songId, direction) {
    error = "";
    try {
      await moveTrackInCollection(library.handle, kind, id, songId, direction);
      await load();
    } catch (err) {
      console.error("Failed to reorder track:", err);
      error = "Could not reorder that song.";
    }
  }

  function buildQueueItems(list) {
    return list.map((t) => ({
      song: t.song.handle,
      meta: {
        songId: t.song.id,
        title: t.song.title,
        artist: t.song.artist,
        albumArt: collection?.artworkUrl ?? "/images/plhd.png",
      },
    }));
  }

  function playTrack(song) {
    const idx = tracks.findIndex((t) => t.songId === song.id);
    player.loadQueue(buildQueueItems(tracks), idx === -1 ? 0 : idx);
  }

  function playAll() {
    if (tracks.length === 0) return;
    player.loadQueue(buildQueueItems(tracks), 0);
  }

  function playShuffled() {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    player.loadQueue(buildQueueItems(shuffled), 0);
  }

  onMount(load);
</script>

{#if loading}
  <div class="notfound"><p>Loading...</p></div>
{:else if notFound}
  <div class="notfound"><p>This {kind.toLowerCase()} doesn't exist.</p></div>
{:else}
  <div class="profilepage">
    <div
      class="banner"
      style="background-image: {collection.bannerUrl ? `url(${collection.bannerUrl})` : 'none'};"
    >
      <button class="backBtn" onclick={() => goto("/app")}> ← Back to Library </button>
      {#if editing}
        <label class="assetUpload bannerUpload rim">
          Change Banner
          <input type="file" accept="image/*" onchange={(e) => handleAssetUpload("banner", e)} />
        </label>
      {/if}
    </div>

    <div class="profileheader">
      <div class="pfpwrap">
        {#if collection.animatedArtUrl}
          <video
            class="pfp rim"
            src={collection.animatedArtUrl}
            autoplay
            loop
            muted
            playsinline
          ></video>
        {:else}
          <img
            class="pfp rim"
            src={collection.artworkUrl || "/images/plhd.png"}
            alt="{kind} cover"
          />
        {/if}
        {#if editing}
          <label class="assetUpload coverUpload rim">
            ✎
            <input type="file" accept="image/*" onchange={(e) => handleAssetUpload("artwork", e)} />
          </label>
        {/if}
      </div>

      <div class="info">
        {#if editing}
          <input class="editTitle" bind:value={editName} placeholder="{kind} title" />
          <div class="tags">
            <input class="editSmall" bind:value={editYear} placeholder="Year" />
            <input class="editSmall" bind:value={editGenre} placeholder="Genre" />
            <input class="editSmall wide" bind:value={editArtists} placeholder="Artists, comma separated" />
          </div>
        {:else}
          <h1>{collection.name || `Untitled ${kind}`}</h1>
          <div class="tags">
            {#if collection.year}<div class="tag rim"><p>{collection.year}</p></div>{/if}
            {#if collection.genre}<div class="tag rim"><p>{collection.genre}</p></div>{/if}
            {#if collection.artists?.length}<p class="username">{collection.artists.join(", ")}</p>{/if}
          </div>
        {/if}
      </div>

      <div class="actions">
              {#if editing}
                <button class="friendbtn" onclick={saveEdits} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button class="friendbtn" onclick={cancelEditing} disabled={saving}>Cancel</button>
                <button class="friendbtn dangerBtn" onclick={handleDeleteCollection} disabled={saving}>
                  Delete
                </button>
              {:else}
                <button class="friendbtn" onclick={startEditing}>Edit</button>
              {/if}
              <button class="friendbtn" onclick={handleFetchArtFromServer} disabled={saving || fetchingArt}>
                {fetchingArt ? "Fetching Art..." : "Fetch Art from Server"}
              </button>
              <button class="btn2" onclick={playAll} disabled={tracks.length === 0}>
                ► Play All
              </button>
              <button class="btn2" onclick={playShuffled} disabled={tracks.length === 0}>
                ⤭ Shuffle
              </button>
            </div>
          </div>

          {#if editing}
            <button class="animatedUpload rim">
        {collection.animatedArtUrl ? "Replace Animated Cover" : "Add Animated Cover (optional)"}
              <input type="file" accept="video/mp4" onchange={(e) => handleAssetUpload("animated", e)} />
            </button>
          {/if}

    {#if error}<p class="libError">{error}</p>{/if}

    <div class="trackListHeader">
      <p class="trackCount">
        {tracks.length} song{tracks.length === 1 ? "" : "s"}
      </p>
    </div>

    {#if availableSongs.length > 0}
      <div class="addSongRow">
        <select class="addSongSelect " bind:value={addSongId}>
          <option value="">Add a song...</option>
          {#each availableSongs as s (s.id)}
            <option value={s.id}>{s.title} — {s.artist}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="trackList">
      {#if tracks.length === 0}
        <p class="emptyState">No songs in this {kind.toLowerCase()} yet.</p>
      {:else}
        {#each tracks as t, i (t.songId)}
          <div class="songItem" class:nowPlaying={$player.songId === t.songId}>
            <button class="playBtn" onclick={() => playTrack(t.song)} aria-label="Play {t.song.title}">
              {$player.songId === t.songId && $player.isPlaying ? "Ⅱ" : "►"}
            </button>
            <p class="trackNum">{t.track}</p>
            <div class="songText">
              <p class="songTitle">{t.song.title}</p>
              <p class="songArtist">{t.song.artist}</p>
            </div>
            <div class="trackActions">
              <button
                class="miniBtn"
                onclick={() => handleMoveTrack(t.songId, "up")}
                disabled={i === 0}
                aria-label="Move up"
              >
                ▲
              </button>
              <button
                class="miniBtn"
                onclick={() => handleMoveTrack(t.songId, "down")}
                disabled={i === tracks.length - 1}
                aria-label="Move down"
              >
                ▼
              </button>
              <button
                class="miniBtn"
                onclick={() => handleRemoveTrack(t.songId)}
                aria-label="Remove from {kind.toLowerCase()}"
              >
                ✕
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
      </div>

      {#if cropTarget}
        <ImageCropper
          file={cropFile}
          aspect={cropTarget === "banner" ? 16 / 5 : 1}
          outputWidth={cropTarget === "banner" ? 1600 : 800}
          onCancel={() => { cropTarget = null; cropFile = null; }}
          {onCropped}
        />
      {/if}
    {/if}

<style>
  .profilepage { position: relative; display: flex; flex-direction: column; flex: 1; min-width: 0; align-items: start;
      justify-content: start; }
  .notfound { display: flex; flex: 1; align-items: center; justify-content: center; height: 100dvh; }
  .banner {
    position: relative;
    height: 300px;
    width: 100%;
    background: linear-gradient(to bottom, #ffffff70, #cecece70);
    background-size: cover;
    background-position: center;
    background-color: #efefef;
  }
  .profileheader {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: 1rem;
    padding: 0 2rem;
    margin-top: -150px !important;
    flex-wrap: wrap;
  }
  .backBtn { position: absolute; top: 20px; left: 20px; }
  .btn2 { position: relative;}
  .pfp { width: 300px; height: 300px; object-fit: cover; outline: 8px solid white; background-color: #efefef; }
  .info { display: flex; flex-direction: column; gap: 6px; }
  .info h1 { font-size: 1.8rem; font-weight: 500; }
  .username { opacity: 0.6; font-size: 13px; }
  .tags { display: flex; flex-direction: row; flex-wrap: wrap; gap: 5px; align-items: center; }
  .tag { position: relative; font-size: 12px; font-weight: 500; padding: 4px 10px; background: linear-gradient(to bottom, #ffffff70, #cecece70); color: #000000; white-space: nowrap; }
  .actions { position: relative; margin-left: auto; display: flex; gap: 8px; }
  .friendbtn { position: relative; font-size: 14px; padding: 8px 16px; cursor: pointer; }
  .friendbtn:disabled { cursor: default; opacity: 0.7; }
  .dangerBtn { color: #c0392b; }
  .pfpwrap { position: relative; flex-shrink: 0; }

  .editTitle { all: unset; font-size: 1.8rem; font-weight: 500; border-bottom: 1px solid #00000030; padding-bottom: 2px; }
  .editSmall { all: unset; font-size: 12px; padding: 4px 10px; background: #ffffff70; border: 1px solid #00000020; }
  .editSmall.wide { min-width: 220px; }

  .assetUpload {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: linear-gradient(to bottom, #ffffff, #dedede);
    font-size: 12px;
  }
  .assetUpload input { display: none; }
  .bannerUpload { top: 20px; right: 20px; padding: 8px 14px; }
  .coverUpload { bottom: 0; right: 0; width: 28px; height: 28px; }

  .animatedUpload {
    display: block;
    width: fit-content;
    margin: 10px 2rem 0 2rem;
    padding: 8px 14px;
    font-size: 12px;
    cursor: pointer;
    background: linear-gradient(to bottom, #ffffff, #dedede);
  }
  .animatedUpload input { display: none; }

  .libError { font-size: 13px; color: #c0392b; padding: 10px 2rem 0 2rem; }

  .trackListHeader {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 20px 2rem 0 2rem;
    height: fit-content;
  }
  .trackCount { font-size: 13px; opacity: 0.5; }
  .rightButtonWrap { display: flex; flex-direction: row; gap: 8px; }

  .addSongRow {
    display: flex;
    flex-direction: row;
    gap: 8px;
    padding: 10px 2rem 0 2rem;
    align-items: center;
  }
  .addSongSelect {
    all: unset;
    flex: 1;
    font-size: 13px;
    padding: 6px 10px;
    background: #ffffff70;
    border: 1px solid #00000020;
  }

  .trackList { display: flex; flex-direction: column; padding: 20px 2rem; gap: 2px; }
  .emptyState { font-size: 13px; opacity: 0.5; padding: 10px 5px; }

  .songItem { display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 8px; transition: background 0.15s ease; }
  .songItem:hover { background: #00000008; }
  .songItem.nowPlaying { background: #00000012; }
  .playBtn { width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(to bottom, #ffffff, #dedede); }
  .trackNum { font-size: 12px; opacity: 0.4; width: 20px; text-align: center; flex-shrink: 0; }
  .songText { display: flex; flex-direction: column; min-width: 0; flex: 1; text-align: left; }
  .songTitle { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .songArtist { font-size: 12px; opacity: 0.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .trackActions { display: flex; flex-direction: row; gap: 2px; flex-shrink: 0; }
  .miniBtn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    opacity: 0.4;
    background: transparent;
    border: none;
  }
  .miniBtn:hover:not(:disabled) { opacity: 1; }
  .miniBtn:disabled { opacity: 0.15; cursor: default; }
</style>
