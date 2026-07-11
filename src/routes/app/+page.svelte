<script>
  import { onMount, getContext } from "svelte";
  import { goto } from "$app/navigation";
  import { player } from "$lib/stores/player";
  import { feed as feedStore } from "$lib/stores/feed";
  import { librarySongs } from "$lib/stores/library";
  import {
    scanLibrary,
    deleteSong,
    renameSongFile,
    getSongCoverUrl,
    backfillMissingCovers,
    scanFolderForAudio,
    filterAudioFileList,
  } from "$lib/libraryFs.js";
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
  let folderWarning = $state("");
  let folderInputRef;

  // --- cover backfill prompt ---
  const COVER_PROMPT_DISMISS_KEY = "umc_coverPromptDismissed";
  let showCoverPrompt = $state(false);
  let coverBackfilling = $state(false);
  let coverProgress = $state({ done: 0, total: 0 });
  let missingCoverCount = $derived(songs.filter((s) => !s.hasCover).length);

  let feedItems = $derived($feedStore);
  let feedPrefs = $state({
    showFeedImports: true,
    showFeedListening: true,
    showFeedLikes: true,
    showFeedPresence: true,
  });
  let loadingFeed = $state(true);

  const feedTypeMeta = {
    library_add: { icon: "/images/notifications/import.png", verb: "added" },
    listen: {
      icon: "/images/notifications/listening.png",
      verb: "is listening to",
    },
    album_publish: {
      icon: "/images/notifications/import.png",
      verb: "published an album:",
    },
    playlist_publish: {
      icon: "/images/notifications/import.png",
      verb: "published a playlist:",
    },
    like: { icon: "/images/notifications/like.png", verb: "liked" },
    presence_change: { icon: "/images/notifications/presence.png", verb: null },
  };

  function feedPrefKey(kind) {
    return {
      library_add: "showFeedImports",
      listen: "showFeedListening",
      album_publish: "showFeedImports",
      playlist_publish: "showFeedImports",
      like: "showFeedLikes",
      presence_change: "showFeedPresence",
    }[kind];
  }

  async function handleImportFolderClick() {
    if (!songsDir) return;
    folderWarning = "";

    if ("showDirectoryPicker" in window) {
      let dirHandle;
      try {
        dirHandle = await window.showDirectoryPicker();
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
        return;
      }
      const { files, skippedDrm, skippedUnknown } =
        await scanFolderForAudio(dirHandle);
      applyFolderScanResult(files, skippedDrm, skippedUnknown);
    } else {
      // Fallback for contexts where directory picking isn't available
      // (mirrors the same FileSystemHandle limitations you've hit with Helium
      // elsewhere) — falls back to a plain webkitdirectory input.
      folderInputRef.click();
    }
  }

  function handleFolderInputChange(e) {
    const { files, skippedDrm, skippedUnknown } = filterAudioFileList(
      e.target.files,
    );
    e.target.value = "";
    applyFolderScanResult(files, skippedDrm, skippedUnknown);
  }

  function applyFolderScanResult(files, skippedDrm, skippedUnknown) {
    if (skippedDrm.length) {
      folderWarning = `Skipped ${skippedDrm.length} DRM-protected file${skippedDrm.length > 1 ? "s" : ""} (Apple Music/iTunes downloads can't be imported).`;
    }
    if (!files.length) {
      folderWarning =
        folderWarning || "No supported audio files found in that folder.";
      return;
    }
    importFiles = files;
  }

  const visibleFeedItems = $derived(
    feedItems.filter((item) => feedPrefs[feedPrefKey(item.kind)] !== false),
  );

  async function loadFeed(userData) {
    loadingFeed = true;
    feedPrefs = {
      showFeedImports: userData?.showFeedImports ?? true,
      showFeedListening: userData?.showFeedListening ?? true,
      showFeedLikes: userData?.showFeedLikes ?? true,
      showFeedPresence: userData?.showFeedPresence ?? true,
    };
    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/feed", {
        credentials: "include",
      });
      const data = await res.json();
      feedStore.setAll(data?.items ?? []);
    } catch (err) {
      console.error("Failed to load feed:", err);
    } finally {
      loadingFeed = false;
    }
  }

  function feedItemText(item) {
    if (item.kind === "presence_change") {
      return `is now ${item.data?.refId ?? "online"}`;
    }
    const meta = feedTypeMeta[item.kind];
    const song = item.data?.refTitle
      ? `${item.data.refTitle}${item.data.refArtist ? ` — ${item.data.refArtist}` : ""}`
      : "";
    return `${meta?.verb ?? ""} ${song}`.trim();
  }

  function maybeShowCoverPrompt() {
    if (coverBackfilling) return;
    try {
      if (sessionStorage.getItem(COVER_PROMPT_DISMISS_KEY)) return;
    } catch {
      // sessionStorage unavailable — just fall through and ask anyway
    }
    showCoverPrompt = missingCoverCount > 0;
  }

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
      maybeShowCoverPrompt();
    } catch (err) {
      console.error("Failed to scan library:", err);
      libraryError = "Could not read your library folder.";
    }
  }

  async function acceptCoverBackfill() {
    showCoverPrompt = false;
    coverBackfilling = true;
    coverProgress = { done: 0, total: missingCoverCount };
    try {
      await backfillMissingCovers(songsDir, songs, {
        onCoverAdded: (song) => {
          song.hasCover = true;
          songs = songs; // trigger reactivity on the mutated array
          librarySongs.set(songs);
        },
        onProgress: (done, total) => {
          coverProgress = { done, total };
        },
      });
    } finally {
      coverBackfilling = false;
    }
  }

  function declineCoverBackfill() {
    showCoverPrompt = false;
    try {
      sessionStorage.setItem(COVER_PROMPT_DISMISS_KEY, "1");
    } catch {
      // sessionStorage unavailable — nothing to persist, just close it
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
          return (
            s.title.toLowerCase().includes(q) ||
            s.artist.toLowerCase().includes(q)
          );
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
      loadFeed(data.user);
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
                        <button
                          class="previewBtn"
                          onclick={() => playSong(song)}
                          aria-label="Preview"
                        >
                        </button>
                      </div>
                    {/each}
                  {/if}
                </div>
              </div>
            {/if}
          </button>
          <button
            class="backBtn"
            onclick={handleImportClick}
            disabled={!songsDir}
          >
            ⤓ Import
          </button>
          <button
            class="backBtn"
            onclick={handleImportFolderClick}
            disabled={!songsDir}
          >
            ⤓ Import Folder
          </button>
          <input
            type="file"
            webkitdirectory
            multiple
            class="hiddenFileInput"
            bind:this={folderInputRef}
            onchange={handleFolderInputChange}
          />
          <button
            class="backBtn"
            onclick={acceptCoverBackfill}
            disabled={!songsDir || coverBackfilling || missingCoverCount === 0}
          >
            {coverBackfilling
              ? `⟳ Fetching ${coverProgress.done}/${coverProgress.total}`
              : "⟳ Fetch Covers"}
          </button>
          <button class="backBtn"> ❖ Library Settings </button>
        </div>
      </div>

      {#if libraryError}
        <p class="libError">{libraryError}</p>
      {/if}
      {#if folderWarning}
        <p class="libError">{folderWarning}</p>
      {/if}

      {#if showCoverPrompt}
        <div class="coverPrompt rim">
          <p class="coverPromptText">
            {missingCoverCount}
            {missingCoverCount === 1 ? "song is" : "songs are"} missing cover art.
            Fetch covers automatically?
          </p>
          <div class="coverPromptActions">
            <button class="backBtn" onclick={declineCoverBackfill}>
              Not now
            </button>
            <button class="backBtn" onclick={acceptCoverBackfill}>
              Fetch Covers
            </button>
          </div>
        </div>
      {/if}

      {#if coverBackfilling}
        <div class="coverPrompt rim">
          <p class="coverPromptText">
            Fetching covers… {coverProgress.done}/{coverProgress.total}
          </p>
        </div>
      {/if}

      <div class="rowWrapper">
        <div class="songRow row rim" class:row1closed>
          <div class="titleBarRow">
            <p>Songs {songs.length ? `(${songs.length})` : ""}</p>
            <div class="rightButtonWrap">
              <button
                class="backBtn"
                onclick={() => (row1closed = !row1closed)}
              >
                <p>{row1closed ? "Open Tab ►" : "Close ▼"}</p>
              </button>
            </div>
          </div>

          {#if !row1closed}
            <div class="songList">
              {#if songs.length === 0}
                <p class="emptyState">
                  No songs yet — import some to get started.
                </p>
              {:else}
                {#each songs as song (song.id)}
                  <div
                    class="songItem"
                    class:nowPlaying={$player.songId === song.id}
                  >
                    <button
                      class="playBtn"
                      onclick={() => playSong(song)}
                      aria-label="Play {song.title}"
                    >
                      {$player.songId === song.id && $player.isPlaying
                        ? "Ⅱ"
                        : "►"}
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
              <button class="backBtn" onclick={openAddAlbum}>
                + Add Album
              </button>
              <button
                class="backBtn"
                onclick={() => (row2closed = !row2closed)}
              >
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
                  <button
                    class="collectionItem"
                    onclick={() => goto(`/app/album/${album.id}`)}
                  >
                    <img
                      src={album.artworkUrl || "/images/plhd.png"}
                      alt="Album Art"
                    />
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
              <button class="backBtn" onclick={openAddPlaylist}>
                + Add Playlist
              </button>
              <button
                class="backBtn"
                onclick={() => (row3closed = !row3closed)}
              >
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
                  <button
                    class="collectionItem"
                    onclick={() => goto(`/app/playlist/${playlist.id}`)}
                  >
                    <img
                      src={playlist.artworkUrl || "/images/plhd.png"}
                      alt="Playlist Art"
                    />
                    <p class="songTitle">
                      {playlist.name || "Untitled Playlist"}
                    </p>
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
        {#if loadingFeed}
          <p class="feedEmptyState">Loading...</p>
        {:else if visibleFeedItems.length === 0}
          <p class="feedEmptyState">Nothing from your friends yet.</p>
        {:else}
          {#each visibleFeedItems as item (item.id)}
            <div class="feedRow rim">
              <div class="feedActorWrap rim">
                <img
                  class="feedActorPfp rim"
                  src={item.actorPfp || "/images/plhd.png"}
                  alt=""
                />
              </div>
              <div class="feedText">
                <p class="feedLine">
                  <span class="feedActorName"
                    >@{item.actorUsername ?? "Someone"}</span
                  >
                  {feedItemText(item)}
                </p>
              </div>
              {#if item.data?.coverUrl}
                <img class="feedCover" src={item.data.coverUrl} alt="" />
              {/if}
            </div>
          {/each}
        {/if}
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

    .hiddenFileInput { display: none; }

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

    .coverPrompt {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 15px;
        margin: 0 0 10px 0;
        padding: 12px 15px;
        background: linear-gradient(to bottom, #ffffff, #eeeeee);
    }

    .coverPromptText {
        font-size: 13px;
        opacity: 0.75;
    }

    .coverPromptActions {
        display: flex;
        flex-direction: row;
        gap: 8px;
        flex-shrink: 0;
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

.feed {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 265px !important;
  flex-shrink: 0;           /* prevent it from being squeezed OR from growing */
  background: linear-gradient(to bottom, #ffffff, #eeeeee);
  height: 100%;
}

.feedContent {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 1px 10px 15px 10px;
  overflow-y: auto;
  overflow-x: hidden;       /* was missing — this is likely the main fix */
  width: 100%;
  box-sizing: border-box;
}


.feedRow {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: start;
  gap: 10px;
  padding: 8px 10px;
  width: 100%;
  min-width: 0;             /* lets the flex child below actually shrink */
  box-sizing: border-box;
  transition: background 0.15s ease;
  background: linear-gradient(to bottom, #ffffff, #eeeeee);
}

.feedRow:hover {
  background: #00000008;
}

.feedActorWrap {
  flex-shrink: 0;
}

.feedActorPfp {
  width: 28px;
  height: 28px;
  object-fit: cover;
  background-color: white;
}


.feedText {
  flex: 1;
  min-width: 0;
  overflow: hidden;         /* was missing on the wrapper, only had it on feedLine */
}

.feedLine {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  opacity: 0.7;
  white-space: wrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feedActorName {
  font-weight: 500;
  opacity: 1;
}

.feedCover {
  width: 28px;
  height: 28px;
  object-fit: cover;
  flex-shrink: 0;
}

.feedEmptyState {
  font-size: 12px;
  opacity: 0.4;
  padding: 10px;
  text-align: center;
}
</style>
