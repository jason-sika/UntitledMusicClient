<script>
  import { renameSongFile, saveSongCover, addSongToCollection } from "$lib/libraryFs.js";
  import ImageCropper from "$lib/components/ImageCropper.svelte";

  let { onClose, songsDir, rootHandle, albums = [], playlists = [], song, onSaved } = $props();

  let title = $state(song.title);
  let artist = $state(song.artist);
  let albumId = $state("");
  let playlistId = $state("");
  let coverFile = $state(null);
  let saving = $state(false);
  let error = $state("");

  let cropFile = $state(null);

  function handleCoverChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    cropFile = file;
  }

  function onCropped(croppedFile) {
    coverFile = croppedFile;
    cropFile = null;
  }

  async function submit() {
    if (saving) return;
    error = "";
    if (!title.trim() || !artist.trim()) {
      error = "Title and artist are required.";
      return;
    }
    saving = true;
    try {
      const newDirname = await renameSongFile(songsDir, song, {
        title: title.trim(),
        artist: artist.trim(),
      });

      if (coverFile) {
        await saveSongCover(songsDir, newDirname, coverFile);
      }
      if (albumId) {
        await addSongToCollection(rootHandle, "Album", albumId, song.id);
      }
      if (playlistId) {
        await addSongToCollection(rootHandle, "Playlist", playlistId, song.id);
      }

      onSaved({ ...song, title: title.trim(), artist: artist.trim(), dirname: newDirname });
      onClose();
    } catch (err) {
      error = err?.message || "Could not save changes.";
    } finally {
      saving = false;
    }
  }
</script>s

<div class="flowbox">
  <div class="pingwrapper">
    <div class="rim card" class:errorS={error}>
      <div class="toptitle">
        <p style="width: 100%; text-align: left;">Edit Song</p>
        <button class="close" onclick={onClose}
          ><img src="/assets/cross.svg" alt="Close" /></button
        >
      </div>

      <p class="hint">
        Editing details for <strong>{song.title}</strong> by <strong>{song.artist}</strong>.
      </p>

      <div class="formInput rim">
        <input type="text" placeholder="Song title..." bind:value={title} maxlength="120" />
      </div>
      <div class="formInput rim">
        <input type="text" placeholder="Artist..." bind:value={artist} maxlength="120" />
      </div>

      <div class="formInput rim">
        <select bind:value={albumId}>
          <option value="">Add to album...</option>
          {#each albums as album (album.id)}
            <option value={album.id}>{album.name || "Untitled Album"}</option>
          {/each}
        </select>
      </div>

      <div class="formInput rim">
        <select bind:value={playlistId}>
          <option value="">Add to playlist...</option>
          {#each playlists as playlist (playlist.id)}
            <option value={playlist.id}>{playlist.name || "Untitled Playlist"}</option>
          {/each}
        </select>
      </div>

      <label class="formInput rim coverRow">
        <span class="coverLabel">
          {coverFile ? coverFile.name : "Replace cover (optional)"}
        </span>
        <input type="file" accept="image/*" onchange={handleCoverChange} />
      </label>

      {#if error}<p class="response error">{error}</p>{/if}

      <div class="actionsRow">
        <button type="button" class="skip rim" onclick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" class="send rim" onclick={submit} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
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
    0% { background-color: #ffffff00; }
    100% { background-color: #ffffff; }
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
    0% { opacity: 0.5; filter: blur(5px); transform: scale(0.9); }
    100% { opacity: 1; filter: blur(0px); transform: scale(1); }
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
  }

  .coverLabel {
    font-size: 13px;
    opacity: 0.6;
  }

  .coverRow input[type="file"] {
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
