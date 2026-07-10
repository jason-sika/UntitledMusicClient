<script>
  import { onMount, getContext } from "svelte";
  import { goto } from "$app/navigation";
  import { player } from "$lib/stores/player";
  import { librarySongs } from "$lib/stores/library";
  import { scanLibrary, deleteSong, renameSongFile, getSongCoverUrl } from "$lib/libraryFs.js";
  import ImportSongModal from "$lib/components/ImportSongModal.svelte";
  import AddCollectionModal from "$lib/components/AddCollectionModal.svelte";
  import EditSongModal from "$lib/components/EditSongModal.svelte";

  let checked = $state(false);

  let row1closed = $state(false);
  let row2closed = $state(false);
  let row3closed = $state(false);

  const library = getContext("libraryHandle");

  let songsDir = $state(null);
  let albums = $state([]);
  let playlists = $state([]);
  let songs = $state([]);
  let libraryError = $state("");
  let query = $state("");
  let searchOpen = $state(false);

  let importFiles = $state(null);
  let addCollectionKind = $state(null); // "Album" | "Playlist" | null
  let editingSong = $state(null); // song object | null

  async function loadLibrary() {
    if (!library?.handle) return;
    try {
      const result = await scanLibrary(library.handle);
      songsDir = result.songsDir;
      albums = result.albums;
      playlists = result.playlists;
      songs = result.songs;
      librarySongs.set(result.songs);
      libraryError = "";
    } catch (err) {
      console.error("Failed to scan library:", err);
      libraryError = "Could not read your library folder.";
    }
  }

  function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen) query = "";
  }


  const searchResults = $derived(
    query.trim()
      ? $librarySongs.filter((s) => {
          const q = query.trim().toLowerCase();
          return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
        })
      : [],
  );

  async function handleImportClick() {
    if (!songsDir) return;
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Audio files",
            accept: {
              "audio/*": [".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"],
            },
          },
        ],
      });
      importFiles = await Promise.all(handles.map((h) => h.getFile()));
    } catch (err) {
      if (err.name !== "AbortError") console.error(err);
    }
  }

  function handleImported() {
    importFiles = null;
    loadLibrary();
  }

  async function playSong(song) {
    let albumArt = "/images/plhd.png";
    try {
      const coverUrl = await getSongCoverUrl(songsDir, song.dirname); // was song.filename
      if (coverUrl) albumArt = coverUrl;
    } catch (err) {
      console.error("Failed to load cover:", err);
    }

    player.loadSong(song.handle, {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      albumArt,
    });
  }

  async function handleDeleteSong(song) {
    if (!songsDir) return;
    if (!confirm(`Delete "${song.title}"? This can't be undone.`)) return;
    try {
      await deleteSong(songsDir, song);
      await loadLibrary();
    } catch (err) {
      console.error("Failed to delete song:", err);
    }
  }

  function openAddAlbum() {
    addCollectionKind = "Album";
  }

  function openAddPlaylist() {
    addCollectionKind = "Playlist";
  }

  function handleCollectionCreated() {
    loadLibrary();
  }

  function openEditSong(song) {
    editingSong = song;
  }

  function handleSongSaved() {
    loadLibrary();
  }

  onMount(async () => {
    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        credentials: "include",
      });

      if (!res.ok) {
        goto("/login");
        return;
      }

      const data = await res.json();

      if (!data?.user) {
        goto("/login");
        return;
      }

      checked = true;
      await loadLibrary();
    } catch (err) {
      goto("/login");
    }
  });
</script>

{#if checked}
  <div class="homepage">
    <div class="library">
      <div class="titleBar">
          <p>Library</p>
          <div class="rightButtonWrap">
              <button class="searchWrapper forceActive" onclick={toggleSearch}>
                <input
                  type="text"
                  placeholder="Search your library..."
                  bind:value={query}
                  autofocus
                />
                {#if searchOpen}
                  <div class="searchDropdown rim">
                    <div class="searchDropList">
                      {#if query.trim() && searchResults.length === 0}
                        <p class="searchState">No matches in your library.</p>
                      {:else}
                        {#each searchResults as song (song.id)}
                          <div class="searchResultRow">
                            <div class="resultText">
                              <p class="resultTitle">{song.title}</p>
                              <p class="resultArtist">{song.artist}</p>
                            </div>
                            <button class="previewBtn" onclick={() => previewSong(song)} aria-label="Preview">
                              ►
                            </button>
                          </div>
                        {/each}
                      {/if}
                    </div>
                  </div>
                {/if}
              </button>
              <button class="backBtn" onclick={handleImportClick} disabled={!songsDir}> ⤓ Import </button>
              <button class="backBtn"> ❖ Library Settings </button>
          </div>
      </div>

      {#if libraryError}
        <p class="libError">{libraryError}</p>
      {/if}

      <div class="rowWrapper">
        <div class="songRow row rim" class:row1closed>
          <div class="titleBarRow">
              <p>Songs {songs.length ? `(${songs.length})` : ""}</p>
              <div class="rightButtonWrap">
                  <button class="backBtn" onclick={() => (row1closed = !row1closed)}>
                    <p>{row1closed ? "Open Tab ►" : "Close ▼"}</p>
                  </button>
              </div>
          </div>

          {#if !row1closed}
            <div class="songList">
              {#if songs.length === 0}
                <p class="emptyState">No songs yet — import some to get started.</p>
              {:else}
                {#each songs as song (song.id)}
                  <div class="songItem" class:nowPlaying={$player.songId === song.id}>
                    <button
                      class="playBtn"
                      onclick={() => playSong(song)}
                      aria-label="Play {song.title}"
                    >
                      {$player.songId === song.id && $player.isPlaying ? "Ⅱ" : "►"}
                    </button>
                    <div class="songText">
                      <p class="songTitle">{song.title}</p>
                      <p class="songArtist">{song.artist}</p>
                    </div>
                    <p class="songExt">{song.ext}</p>
                    <button
                      class="editBtn"
                      onclick={() => openEditSong(song)}
                      aria-label="Edit {song.title}"
                    >
                      ✎
                    </button>
                    <button
                      class="deleteBtn"
                      onclick={() => handleDeleteSong(song)}
                      aria-label="Delete {song.title}"
                    >
                      ✕
                    </button>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
      </div>
        <div class="albumRow row rim" class:row2closed>
            <div class="titleBarRow">
                <p>Albums {albums.length ? `(${albums.length})` : ""}</p>
                <div class="rightButtonWrap">
                    <button class="backBtn" onclick={openAddAlbum}> + Add Album </button>
                    <button class="backBtn" onclick={() => (row2closed = !row2closed)}>
                      <p>{row2closed ? "Open Tab ►" : "Close ▼"}</p>
                    </button>
                </div>
            </div>

          {#if !row2closed}
            <div class="collectionList">
              {#if albums.length === 0}
                <p class="emptyState">No albums yet.</p>
              {:else}
              {#each albums as album (album.id)}
                <button class="collectionItem" onclick={() => goto(`/app/album/${album.id}`)}>
                  <img src={album.artworkUrl || "/images/plhd.png"} alt="Album Art" />
                  <p class="songTitle">{album.name || "Untitled Album"}</p>
                  {#if album.year}<p class="songExt">{album.year}</p>{/if}
                </button>
              {/each}
              {/if}
            </div>
          {/if}
      </div>
        <div class="playlistRow row rim" class:row3closed>
            <div class="titleBarRow">
                <p>Playlists {playlists.length ? `(${playlists.length})` : ""}</p>
                <div class="rightButtonWrap">
                    <button class="backBtn" onclick={openAddPlaylist}> + Add Playlist </button>
                    <button class="backBtn" onclick={() => (row3closed = !row3closed)}>
                      <p>{row3closed ? "Open Tab ►" : "Close ▼"}</p>
                    </button>
                </div>
            </div>

          {#if !row3closed}
            <div class="collectionList">
              {#if playlists.length === 0}
                <p class="emptyState">No playlists yet.</p>
              {:else}
              {#each playlists as playlist (playlist.id)}
                <button class="collectionItem" onclick={() => goto(`/app/playlist/${playlist.id}`)}>
                  <img src={playlist.artworkUrl || "/images/plhd.png"} alt="Playlist Art" />
                  <p class="songTitle">{playlist.name || "Untitled Playlist"}</p>
                </button>
              {/each}
              {/if}
            </div>
          {/if}
      </div>
      </div>
    </div>
    <div class="feed rim">
        <div class="titleBar">
            <p>Your Feed</p>
        </div>
        <div class="feedContent">

        </div>
    </div>
  </div>
  {/if}

{#if importFiles?.length}
  <ImportSongModal
    files={importFiles}
    {songsDir}
    rootHandle={library.handle}
    {albums}
    onClose={() => (importFiles = null)}
    onImported={handleImported}
  />
{/if}

{#if addCollectionKind}
  <AddCollectionModal
    kind={addCollectionKind}
    rootHandle={library.handle}
    onClose={() => (addCollectionKind = null)}
    onCreated={handleCollectionCreated}
  />
{/if}

{#if editingSong}
  <EditSongModal
    song={editingSong}
    {songsDir}
    rootHandle={library.handle}
    {albums}
    {playlists}
    onClose={() => (editingSong = null)}
    onSaved={handleSongSaved}
  />
{/if}

<style>
    button p {
        font-size: 1rem !important;
    }

    .homepage {
        display: flex;
        flex-direction: row;
        width: 100%;
        height: 100%;
    }

    .feed {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 265px !important;
        background: linear-gradient(to bottom, #ffffff, #eeeeee);
        height: 100%;
    }

    .row {
        position: relative;
        background: linear-gradient(to bottom, #ffffff, #eeeeee);
    }

    .titleBarRow {
        width: 100%;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
    }

    .titleBarRow p {
        all: unset;
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        width: fit-content;
        font-family: "InterVariable", sans-serif !important;
        font-size: 24px;
        font-weight: 300;
        opacity: 0.7;
        transition: opacity 0.15s ease;
        scroll-margin-inline: 20px;
    }

    .rowWrapper {
        display: flex;
        flex-direction: column;
        gap: 0px;
    }

    .library {
        flex: 1;
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        padding: 0px 20px 0 20px;
        overflow: scroll;
    }

    .titleBar p {
        all: unset;
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        width: fit-content;
        font-family: "InterVariable", sans-serif !important;
        font-size: 24px;
        font-weight: 300;
        opacity: 0.7;
        transition: opacity 0.15s ease;
        scroll-margin-inline: 20px;
    }

    .titleBar {
        width: 100%;
        display: flex;
        flex-direction: row;
        height: fit-content;
        padding: 20px 15px;
        justify-content: space-between;
        align-items: center;
    }

    .forceActive {
        transform: translateY(2px);
        box-shadow: 0 0px 1px 1px rgba(0, 0, 0, 0.32), inset 0 0px 2px 1px rgba(0, 0, 0, 0.32), inset 0 2px 0px 1px rgba(0, 0, 0, 0.2);
        background: linear-gradient(to bottom, #EEEEEE70,  #FFFFFF70);
    }

    .forceActive input {
        filter: drop-shadow(0px 3px 2px #00000050);
    }

    .libError {
        font-size: 13px;
        color: #c0392b;
        padding: 0 15px;
    }

    .songList {
        display: flex;
        flex-direction: column;
        padding: 0 15px 15px 15px;
        gap: 2px;
    }

    .emptyState {
        font-size: 13px;
        opacity: 0.5;
        padding: 10px 5px;
    }

    .songItem {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 12px;
        padding: 8px;
        transition: background 0.15s ease;
    }

    .songItem:hover {
        background: #00000008;
    }

    .songItem.nowPlaying {
        background: #00000012;
    }

    .playBtn {
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(to bottom, #ffffff, #dedede);
    }

    .songText {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
        text-align: left;
    }

    .songTitle {
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .songArtist {
        font-size: 12px;
        opacity: 0.5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .songExt {
        font-size: 10px;
        opacity: 0.35;
        text-transform: uppercase;
        flex-shrink: 0;
    }

    .deleteBtn {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        opacity: 0.4;
        background: transparent;
        border: none;
    }

    .deleteBtn:hover {
        opacity: 1;
        color: #c0392b;
    }

    .editBtn {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        opacity: 0.4;
        background: transparent;
        border: none;
    }

    .editBtn:hover {
        opacity: 1;
    }

    .collectionList {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        padding: 0 15px 15px 15px;
        gap: 10px;
    }

    .collectionItem {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        width: 210px;
        padding: 8px;
        text-align: left;
        background: transparent;
        border: none;
        transition: background 0.15s ease;
    }

    .collectionItem img {
        width: 200px;
        height: 200px;
        aspect-ratio: 1 / 1;
        object-fit: cover;
    }

    .collectionItem:hover {
        background: #00000008;
    }

    .searchWrapper {
        position: relative;
        z-index: 20;
    }

    .searchDropdown {
      position: absolute;
      display: flex;
      top: 40px;
      left: 0;
      flex-direction: column;
      width: 320px;
      max-height: 360px;
      padding: 10px;
      gap: 8px;
      backdrop-filter: blur(10px);
      background: linear-gradient(to bottom, #ffffffd0, #eeeeeed0);
      box-shadow: 0 4px 16px #00000030;
      z-index: 10;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      transform: opacity: 1;
    }

    .searchDropList {
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
    }

    .searchState {
      font-size: 12px;
      opacity: 0.5;
      padding: 8px 4px;
      text-align: center;
    }

    .searchResultRow {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      padding: 6px;
    }

    .resultText {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
      text-align: left;
    }

    .resultTitle {
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .resultArtist {
      font-size: 11px;
      opacity: 0.5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .previewBtn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
</style>
