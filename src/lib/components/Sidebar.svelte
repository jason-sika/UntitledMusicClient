<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import Settings from "./Settings.svelte";

  let showSettings = $state(false);
  let user = $state(null);
  let friends = $state([]);
  let loadingFriends = $state(true);

  let activeTopTab = $state("Library");
  let activeLibraryTab = $state("Playlists");

  function userprofile(username) {
    if (username) {
      goto(`/app/${username}`);
    }
  }

  onMount(async () => {
    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        credentials: "include",
      });
      const data = await res.json();
      user = data?.user ?? null;
    } catch {
      user = null;
    }

    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/friends", {
        credentials: "include",
      });
      const data = await res.json();
      friends = data?.friends ?? [];
    } catch {
      friends = [];
    } finally {
      loadingFriends = false;
    }
  });
</script>

{#if showSettings}
  <Settings
    onClose={() => (showSettings = false)}
    currentDisplayname={user?.displayname ?? ""}
    currentUsername={user ? `@${user.username}` : "@"}
    {user}
  />
{/if}

<div class="sidebar">
  <div class="you rim">
    <div class="profilePicture rim">
      <img
        class="profilePicture"
        src={user?.pfpUrl || "/images/plhd.png"}
        alt="Profile picture"
        onclick={() => userprofile(user?.username)}
        style="cursor: pointer;"
      />
    </div>
    <div
      class="text"
      onclick={() => userprofile(user?.username)}
      style="cursor: pointer;"
    >
      <h1 class="Name">{user?.displayname ?? "Loading..."}</h1>
      <p class="currentPlayer">
        {user ? `@${user.username}` : ""}
      </p>
    </div>
    <button class="settings rim" onclick={() => (showSettings = true)}
      >Settings</button
    >
  </div>

  <div class="tabview online rim">
    <div
      class="tabswitch"
      onwheel={(e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          e.currentTarget.scrollLeft += e.deltaY;
        }
      }}
    >
      <button
        class="tab"
        class:active={activeTopTab === "Library"}
        onclick={() => (activeTopTab = "Library")}>Library</button
      >
      <button
        class="tab"
        class:active={activeTopTab === "Friends"}
        onclick={() => (activeTopTab = "Friends")}>Friends</button
      >
    </div>

    {#if activeTopTab === "Library"}
      <div class="tabcontent">
        <p class="empty-state">Your library will show here.</p>
      </div>
    {:else if activeTopTab === "Friends"}
      <div class="friends">
        {#if loadingFriends}
          <p class="empty-state">Loading friends...</p>
        {:else if friends.length === 0}
          <p class="empty-state">No friends yet.</p>
        {:else}
          {#each friends as friend}
            <div
              class="friend you"
              onclick={() => userprofile(friend.username)}
            >
              <div class="profilePicture rim">
                <img
                  class="profilePicture rim"
                  src={friend.pfpUrl || "/images/plhd.png"}
                  alt="Profile picture"
                />
              </div>
              <div class="text">
                <h1 class="Name">{friend.displayname}</h1>
                <p class="subtitle currentPlayer">@{friend.username}</p>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="tabview library rim">
    <div
      class="tabswitch"
      onwheel={(e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          e.currentTarget.scrollLeft += e.deltaY;
        }
      }}
    >
      <button
        class="tab"
        class:active={activeLibraryTab === "Playlists"}
        onclick={() => (activeLibraryTab = "Playlists")}>Playlists</button
      >
      <button
        class="tab"
        class:active={activeLibraryTab === "Albums"}
        onclick={() => (activeLibraryTab = "Albums")}>Albums</button
      >
      <button
        class="tab"
        class:active={activeLibraryTab === "Songs"}
        onclick={() => (activeLibraryTab = "Songs")}>Songs</button
      >
      <button
        class="tab"
        class:active={activeLibraryTab === "Artists"}
        onclick={() => (activeLibraryTab = "Artists")}>Artists</button
      >
    </div>

    {#if activeLibraryTab === "Playlists"}
      <div class="playlist">
        <p class="empty-state">No playlists yet.</p>
      </div>
    {:else if activeLibraryTab === "Albums"}
      <div class="playlist">
        <p class="empty-state">No albums yet.</p>
      </div>
    {:else if activeLibraryTab === "Songs"}
      <div class="playlist">
        <p class="empty-state">No songs yet.</p>
      </div>
    {:else if activeLibraryTab === "Artists"}
      <div class="playlist">
        <p class="empty-state">No artists yet.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
    gap: 0px;
    height: 100%;
    width: 265px;
    background: linear-gradient(to bottom, #ffffff70, #cecece70);
    color: #000000;
  }

  .you {
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    padding-inline: 20px;
    padding-block: 15px;
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
    gap: 10px;
    height: 80px;
    width: 100%;
  }

  .text {
    width: 100%;
  }

  .Name {
    font-size: 20px;
    font-weight: 500;
    opacity: 0.7;
  }

  .currentPlayer {
    font-size: 13px;
    font-weight: 400;
    opacity: 0.5;
  }

  .profilePicture {
    position: relative;
    width: 35px;
    height: 35px;
    object-fit: cover;
  }

  .settings {
    font-size: 12px;
    padding: 5px 10px;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    display: flex;
  }

  .tabview {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
    gap: 10px;
    height: 100%;
    width: 100%;
  }

  .tabswitch {
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 20px 20px 10px 20px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tab {
    all: unset;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    width: fit-content;
    font-family: "InterVariable", sans-serif !important;
    font-size: 24px;
    font-weight: 300;
    opacity: 0.2;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .tab.active {
    opacity: 0.7;
  }

  .tabcontent {
    width: 100%;
    flex: 1;
    overflow-y: auto;
  }

  .friends {
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 4px;
    padding: 0 10px 10px 10px;
    overflow-y: auto;
  }

  .friend {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s ease;
  }

  .friend:hover {
    background: #00000010;
  }

  .friend .Name {
    font-size: 14px;
  }

  .friend .subtitle {
    font-size: 11px;
  }

  .empty-state {
    font-size: 12px;
    opacity: 0.4;
    padding: 10px;
    text-align: center;
  }

  .playlist {
    width: 100%;
    flex: 1;
    overflow-y: auto;
  }
</style>
