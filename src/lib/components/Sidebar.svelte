<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import Settings from "./Settings.svelte";

  let showSettings = $state(false);
  let user = $state(null);

  function userprofile() {
    if (user?.username) {
      goto(`/${user.username}`);
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
  <div class="you">
    <div class="profilePicture rim">
      <img
        class="profilePicture rim"
        src={user?.pfpUrl || "/images/plhd.png"}
        alt="Profile picture"
        onclick={userprofile}
        style="cursor: pointer;"
      />
    </div>
    <div class="text" onclick={userprofile} style="cursor: pointer;">
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
    <div class="tabswitch">
      <a class="tab active">Home</a>
      <a class="tab">Library</a>
      <a class="tab">Search</a>
    </div>
  </div>
  <div class="tabview library rim">
    <div class="tabswitch">
      <a class="tab active">Playlists</a>
      <a class="tab">Albums</a>
      <a class="tab">Songs</a>
      <a class="tab">Artists</a>
    </div>
    <div class="playlist"></div>
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
    overflow: scroll;
  }

  a.tab {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    width: 100%;
    font-family: "InterVariable", sans-serif !important;
    font-size: 24px;
    font-weight: 300;
    opacity: 0.2;
  }

  a.tab.active {
    opacity: 0.7;
  }
</style>
