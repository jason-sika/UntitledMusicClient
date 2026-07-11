<script>
  import {
    importSong,
    saveSongCover,
    addSongToCollection,
  } from "$lib/libraryFs.js";
  import ImageCropper from "$lib/components/ImageCropper.svelte";
  import { fetchAlbumArtFromServer, urlToFile } from "$lib/albumArt.js";

  let {
    onClose,
    songsDir,
    rootHandle,
    albums = [],
    playlists = [],
    files,
    onImported,
  } = $props();

  let index = $state(0);
  let title = $state("");
  let artist = $state("");
  let albumId = $state("");
  let playlistId = $state("");
  let coverFile = $state(null);
  let saving = $state(false);
  let error = $state("");
  let imported = $state([]);

  let cropFile = $state(null); // raw file awaiting crop, or null

  // Hidden file input triggered programmatically by its button — buttons
  // can't proxy-open a file picker the way <label> elements do.
  let coverInputRef;

  function prefillFromFilename(file) {
    const base = file.name.replace(/\.[^/.]+$/, "");
    const parts = base.split(/\s*-\s*/);
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    } else {
      title = base.trim();
      artist = "";
    }
  }

  $effect(() => {
    if (files[index]) prefillFromFilename(files[index]);
  });

  const currentFile = $derived(files[index]);
  const isLast = $derived(index === files.length - 1);

  function handleCoverChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    cropFile = file; // opens the cropper
  }

  async function reportImportToBackend(result) {
    try {
      await fetch("https://backend.umc.jasonsika.com/api/library/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: result.id,
          title: result.title,
          artist: result.artist,
          fileExt: result.ext,
        }),
      });
    } catch {
      // Best-effort — the song is already safely imported locally even if
      // this fails, so we don't want a network hiccup to look like an
      // import error to the user.
    }
  }

  async function autoFetchCover(result) {
    // Only attempt this when the user didn't manually provide a cover.
    if (coverFile) return;

    // Always search by artist + song title. If this song is going into an
    // album, pass the album name too for a more specific match — the search
    // endpoint accepts artist+song, artist+album, or all three together.
    const selectedAlbum = albums.find((a) => a.id === albumId);

    try {
      const { album_art } = await fetchAlbumArtFromServer(
        result.artist,
        result.title,
        selectedAlbum?.name || "",
      );
      if (!album_art) return; // animated-only result, nothing static to save as cover.webp

      const file = await urlToFile(album_art, "cover.webp");
      await saveSongCover(songsDir, result.dirname, file);
    } catch {
      // Best-effort — no artwork found, or the fetch failed. The song is
      // already imported successfully regardless; it just won't have a cover.
    }
  }

  async function submitCurrent() {
    if (saving) return;
    error = "";
    if (!title.trim() || !artist.trim()) {
      error = "Title and artist are required.";
      return;
    }
    saving = true;
    try {
      const result = await importSong(songsDir, currentFile, { title, artist });

      if (coverFile) {
        await saveSongCover(songsDir, result.dirname, coverFile);
      } else {
        await autoFetchCover(result);
      }

      if (albumId) {
        await addSongToCollection(rootHandle, "Album", albumId, result.id);
      }
      if (playlistId) {
        await addSongToCollection(
          rootHandle,
          "Playlist",
          playlistId,
          result.id,
        );
      }

      reportImportToBackend(result);

      imported = [...imported, result];
      if (isLast) {
        onImported(imported);
        onClose();
      } else {
        index += 1;
        title = "";
        artist = "";
        albumId = "";
        playlistId = "";
        coverFile = null;
      }
    } catch (err) {
      error = err?.message || "Could not import this song.";
    } finally {
      saving = false;
    }
  }

  function onCropped(croppedFile) {
    coverFile = croppedFile;
    cropFile = null;
  }

  function skipCurrent() {
    error = "";
    if (isLast) {
      onImported(imported);
      onClose();
    } else {
      index += 1;
      title = "";
      artist = "";
      albumId = "";
      playlistId = "";
      coverFile = null;
    }
  }
</script>

<div class="flowbox">
  <div class="pingwrapper">
    <div class="rim card" class:errorS={error}>
      <div class="toptitle">
        <p style="width: 100%; text-align: left;">
          Import Song {files.length > 1 ? `(${index + 1}/${files.length})` : ""}
        </p>
        <button class="close" onclick={onClose}
          ><img src="/assets/cross.svg" alt="Close" /></button
        >
      </div>

      <p class="hint">
        Add details for <strong>{currentFile?.name}</strong> before it's added to
        your library.
      </p>

      <div class="formInput rim">
        <input
          type="text"
          placeholder="Song title..."
          bind:value={title}
          maxlength="120"
        />
      </div>
      <div class="formInput rim">
        <input
          type="text"
          placeholder="Artist..."
          bind:value={artist}
          maxlength="120"
        />
      </div>

      <div class="formInput rim">
        <select bind:value={albumId}>
          <option value="">No album</option>
          {#each albums as album (album.id)}
            <option value={album.id}>{album.name || "Untitled Album"}</option>
          {/each}
        </select>
      </div>

      <div class="formInput rim">
        <select bind:value={playlistId}>
          <option value="">No playlist</option>
          {#each playlists as playlist (playlist.id)}
            <option value={playlist.id}
              >{playlist.name || "Untitled Playlist"}</option
            >
          {/each}
        </select>
      </div>

      <button
        type="button"
        class="formInput rim coverRow"
        onclick={() => coverInputRef.click()}
      >
        <span class="coverLabel">
          {coverFile ? coverFile.name : "Song cover (optional)"}
        </span>
      </button>
      <input
        type="file"
        accept="image/*"
        class="hiddenFileInput"
        bind:this={coverInputRef}
        onchange={handleCoverChange}
      />

      {#if error}<p class="response error">{error}</p>{/if}

      <div class="actionsRow">
        <button
          type="button"
          class="skip rim"
          onclick={skipCurrent}
          disabled={saving}
        >
          Skip
        </button>
        <button
          type="button"
          class="send rim"
          onclick={submitCurrent}
          disabled={saving}
        >
          {saving ? "Adding..." : isLast ? "Add to Library" : "Add & Next"}
        </button>
      </div>
    </div>
  </div>
</div>
{#if cropFile}
  <ImageCropper
    file={cropFile}
    aspect={1}
    outputWidth={800}
    onCancel={() => (cropFile = null)}
    {onCropped}
  />
{/if}

<style>
  /* unchanged — same as before */
  .flowbox {
    position: absolute;
    top: 0;
    left: 0;
    inset: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    background-color: #ffffff;
    height: 100dvh !important;
    width: 100dvw !important;
    z-index: 100;
    animation: fadein 0.2s ease-in;
  }

  @keyframes fadein {
    0% {
      background-color: #ffffff00;
    }
    100% {
      background-color: #ffffff;
    }
  }

  .pingwrapper {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    width: 400px;
    animation: popup 0.2s ease-out;
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 20px;
    gap: 10px;
    z-index: 1;
    backdrop-filter: blur(10px);
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
  }

  @keyframes popup {
    0% {
      opacity: 0.5;
      filter: blur(5px);
      transform: scale(0.9);
    }
    100% {
      opacity: 1;
      filter: blur(0px);
      transform: scale(1);
    }
  }

  .toptitle {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .toptitle p {
    width: 100%;
    font-size: 1.4rem;
    font-weight: 300;
  }

  .close {
    height: 35px;
    width: 35px;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1 / 1 !important;
    background: linear-gradient(to bottom, #ffffff, #cecece);
    border: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .close img {
    height: 10px;
    width: 10px;
    justify-self: center;
    margin: 0 !important;
  }

  .hint {
    font-size: 13px;
    opacity: 0.6;
    width: 100%;
    text-align: left;
  }

  .formInput {
    width: 100%;
  }

  .formInput input,
  .formInput select {
    all: unset;
    width: 100%;
    font-family: "InterVariable", sans-serif;
  }

  .coverRow {
    display: flex;
    flex-direction: row;
    align-items: center;
    cursor: pointer;
    text-align: left;
    justify-content: flex-start;
  }

  .coverLabel {
    font-size: 13px;
    opacity: 0.6;
  }

  .hiddenFileInput {
    display: none;
  }

  .response.error {
    color: #c0392b;
    font-size: 13px;
    width: 100%;
    text-align: left;
  }

  .actionsRow {
    display: flex;
    flex-direction: row;
    gap: 10px;
    width: 100%;
  }

  .skip {
    flex: 1;
    text-align: center;
    justify-content: center;
    padding: 10px;
    font-weight: 500;
    opacity: 0.6;
  }

  .send {
    flex: 2;
    text-align: center;
    justify-content: center;
    padding: 10px;
    font-weight: 500;
  }

  .send:disabled,
  .skip:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
