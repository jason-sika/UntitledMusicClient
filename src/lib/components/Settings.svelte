<script>
  import { goto } from "$app/navigation";
  import AccountSettings from "$lib/components/settings/Account.svelte";
  let {
    onClose,
    currentDisplayname = "",
    currentUsername = "@",
    user = null,
  } = $props();

  let displayname = $state(currentDisplayname);
  let username = $state(currentUsername);
  let error = $state("");
  let success = $state("");
  let loading = $state(false);
  let youtubeConnected = $state(false);
  let currentPage = $state("AccountSettings");

  function formatUsername(e) {
    let value = "@" + e.target.value.toLowerCase().replace(/@/g, "");
    username = value;
    e.target.value = value;
  }

  function handleKeydown(e) {
    const input = e.target;
    if (
      (e.key === "Backspace" || e.key === "Delete") &&
      input.selectionStart <= 1 &&
      input.selectionEnd <= 1
    ) {
      e.preventDefault();
    }
  }

  async function handleLogout() {
    try {
      await fetch("https://backend.umc.jasonsika.com/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // even if the request fails, still send them to login
    }
    goto("/");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    error = "";
    success = "";
    loading = true;

    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayname,
          username: username.replace(/^@/, ""),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        error = data?.error || "Could not update profile.";
      } else {
        success = "Saved!";
      }
    } catch {
      error = "Network error — could not reach the server.";
    } finally {
      loading = false;
    }
  }

  function connectYoutube() {
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      "/auth",
      "youtube-auth",
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    // poll to detect when the popup closes (simplest approach)
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        // refresh connection status, e.g. re-check /api/me or a "youtube linked" flag
        checkYoutubeStatus();
      }
    }, 500);
  }

  async function checkYoutubeStatus() {
    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        credentials: "include",
      });
      const data = await res.json();
      youtubeConnected = !!data?.user?.youtubeConnected; // depends on what /api/me returns
    } catch {
      // re-fetch user/account state to reflect the new connection
    }
  }
</script>

<div class="flowbox">
  <div class="settingswrapper">
    <div class="rim left" class:errorS={error} class:successS={success}>
      <div class="toptitle">
        <p style="width: 100%; text-align: left;">Settings</p>
        <button class="close" onclick={onClose}
          ><img src="/assets/cross.svg" alt="Dropdown" /></button
        >
      </div>
      <p class="wip" style="font-size: 10px; width: 100%; text-align: left;">
        Themes
      </p>
      <div
        class="formInput rim wip"
        style="display: flex; flex-direction: row; align-items: center; gap: 5px;"
      >
        <select name="themes" id="themes">
          <option value="light">Light Mode</option>
          <option value="dark">Dark Mode</option>
          <option value="auto">Automatic</option>
        </select>
        <img src="/assets/dropdown.svg" alt="Dropdown" />
      </div>
      <p class="wip" style="font-size: 10px; width: 100%; text-align: left;">
        Player [COMING SOON]
      </p>
      <div
        class="formInput rim wip"
        style="display: flex; flex-direction: row; align-items: center; gap: 5px;"
      >
        <select name="player" id="players">
          <option value="light">YouTube Music</option>
        </select>
        <img src="/assets/dropdown.svg" alt="Dropdown" />
      </div>
      {#if success}<p class="response success">{success}</p>{/if}
      {#if error}<p class="response error">{error}</p>{/if}
      {#if loading}<li class="loading-gap-dots">
          <span></span><span></span><span></span>
        </li>{/if}
    </div>
    <div class="rim right">
      {#if currentPage === "AccountSettings"}
        <AccountSettings
          {onClose}
          {currentDisplayname}
          {currentUsername}
          {user}
        />
      {/if}
    </div>
  </div>
</div>

<style>
  .flowbox {
    position: fixed;
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

  .settingswrapper {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    height: 70dvh;
    width: 70dvw;
  }

  .settingswrapper {
    animation: popup 0.2s ease-out;
  }

  .left {
    height: 100%;
    align-items: center;
    justify-content: start;
    animation: none !important;
  }

  .right {
    position: relative;
    width: 700px;
    height: 100%;
    background-color: #ffffff;
  }

  select {
    all: unset;
    width: 100%;
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
  }

  .close img {
    height: 10px;
    width: 10px;
    justify-self: center;
    margin: 0 !important;
  }
</style>
