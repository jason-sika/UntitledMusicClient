<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import ImageCropper from "$lib/components/ImageCropper.svelte";
  import {
    getDiscordStatus,
    linkDiscord,
    linkDiscordFullPage,
    unlinkDiscord,
  } from "$lib/discord.js";
  import { player } from "$lib/stores/player.js";

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
  let pfpInput = $state(null);
  let bannerInput = $state(null);
  let uploadingPfp = $state(false);
  let uploadingBanner = $state(false);
  let pfpUrl = $state(user?.pfpUrl);
  let bannerUrl = $state(user?.bannerUrl);
  let pfpStatus = $state("");
  let bannerStatus = $state("");

  let cropTarget = $state(null); // "pfp" | "banner" | null
  let cropFile = $state(null);

  // --- Discord connection ---
  let discordLinked = $state(false);
  let discordId = $state("");
  let discordBusy = $state(false);
  let discordError = $state("");

  // --- Privacy: share listening activity (gates both the Discord presence
  // updates and, per your schema, presumably the activity feed too) ---
  let shareListenActivity = $state(user?.shareListenActivity ?? true);
  let shareSaving = $state(false);

  let feedDisplayPrefs = $state({
    showFeedImports: user?.showFeedImports ?? true,
    showFeedListening: user?.showFeedListening ?? true,
    showFeedLikes: user?.showFeedLikes ?? true,
    showFeedPresence: user?.showFeedPresence ?? true,
  });
  let feedPrefSaving = $state({});

  const feedToggleConfig = [
    { key: "showFeedImports", label: "Song imports" },
    { key: "showFeedListening", label: "Currently listening updates" },
    { key: "showFeedLikes", label: "Song likes (pings/pongs)" },
    { key: "showFeedPresence", label: "Online / away / DND changes" },
  ];

  async function handleFeedPrefToggle(key, e) {
    const next = e.target.checked;
    const prev = feedDisplayPrefs[key];
    feedDisplayPrefs = { ...feedDisplayPrefs, [key]: next };
    feedPrefSaving = { ...feedPrefSaving, [key]: true };

    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) {
        feedDisplayPrefs = { ...feedDisplayPrefs, [key]: prev };
      }
    } catch {
      feedDisplayPrefs = { ...feedDisplayPrefs, [key]: prev };
    } finally {
      feedPrefSaving = { ...feedPrefSaving, [key]: false };
    }
  }

  onMount(async () => {
    // Reflect the user's saved preference into the player store immediately,
    // so it doesn't start pushing presence updates before we know whether
    // that's actually wanted.
    player.setDiscordEnabled(shareListenActivity);

    const status = await getDiscordStatus();
    discordLinked = status.linked;
    discordId = status.discordUserId ?? "";
  });

  async function handleDiscordConnect() {
    discordError = "";
    discordBusy = true;

    const opened = await linkDiscord();
    if (!opened) {
      // Popup blocked — fall back to taking over the tab. This does leave
      // the settings modal, but it's the only option once the browser has
      // refused the popup.
      discordBusy = false;
      linkDiscordFullPage();
      return;
    }

    // Popup closed (either the user finished the flow and the callback
    // page auto-closed it, or they closed it manually mid-flow) — either
    // way, re-check actual status rather than assuming success.
    const status = await getDiscordStatus();
    discordLinked = status.linked;
    discordId = status.discordUserId ?? "";
    discordBusy = false;

    if (!discordLinked) {
      discordError = "Discord wasn't connected. Try again.";
    }
  }

  async function handleDiscordDisconnect() {
    discordError = "";
    discordBusy = true;
    const ok = await unlinkDiscord();
    discordBusy = false;
    if (!ok) {
      discordError = "Could not disconnect Discord. Try again.";
      return;
    }
    discordLinked = false;
    discordId = "";
  }

  async function handleShareToggle(e) {
    const next = e.target.checked;
    shareListenActivity = next;
    player.setDiscordEnabled(next);

    shareSaving = true;
    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ shareListenActivity: next }),
      });
      if (!res.ok) {
        // Revert the toggle if the save failed, so the UI doesn't lie
        // about what's actually persisted server-side.
        shareListenActivity = !next;
        player.setDiscordEnabled(!next);
      }
    } catch {
      shareListenActivity = !next;
      player.setDiscordEnabled(!next);
    } finally {
      shareSaving = false;
    }
  }

  async function preResizeIfStatic(file) {
    const isAnimated = file.type === "image/gif" || file.type === "image/webp";
    if (isAnimated) return file;

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );

    return new File([blob], file.name, { type: "image/webp" });
  }

  async function handleUpload(
    file,
    endpoint,
    onSuccess,
    setUploading,
    setStatus,
  ) {
    if (!file) return;
    error = "";
    setUploading(true);

    const isAnimated = file.type === "image/gif" || file.type === "image/webp";
    setStatus("Uploading...");

    try {
      const prepared = isAnimated ? file : await preResizeIfStatic(file);
      const formData = new FormData();
      formData.append("file", prepared);

      const res = await fetch(
        `https://backend.umc.jasonsika.com/api/upload/${endpoint}`,
        { method: "POST", credentials: "include", body: formData },
      );
      const data = await res.json();

      if (!res.ok) {
        error = data?.error || "Upload failed.";
        setUploading(false);
        setStatus("");
        return;
      }

      setStatus(isAnimated ? "Processing animation..." : "Processing...");
      await pollJobStatus(data.jobId, onSuccess, setUploading, setStatus);
    } catch {
      error = "Network error.";
      setUploading(false);
      setStatus("");
    }
  }

  async function pollJobStatus(jobId, onSuccess, setUploading, setStatus) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      try {
        const res = await fetch(
          `https://backend.umc.jasonsika.com/api/upload/status/${jobId}`,
          { credentials: "include" },
        );
        const job = await res.json();

        if (job.status === "done") {
          onSuccess(job.url);
          setUploading(false);
          setStatus("");
          return;
        }
        if (job.status === "error") {
          error = job.error || "Processing failed.";
          setUploading(false);
          setStatus("");
          return;
        }
        if (i === 10) {
          setStatus("Still working on it...");
        }
      } catch {
        // transient network hiccup, keep trying
      }
    }

    error = "Processing is taking longer than expected.";
    setUploading(false);
    setStatus("");
  }

  function handlePfpChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // animated gifs/webp skip cropping — they go straight through as before
    if (file.type === "image/gif" || file.type === "image/webp") {
      handleUpload(
        file,
        "pfp",
        (url) => (pfpUrl = url),
        (v) => (uploadingPfp = v),
        (m) => (pfpStatus = m),
      );
      return;
    }
    cropTarget = "pfp";
    cropFile = file;
  }

  function handleBannerChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type === "image/gif" || file.type === "image/webp") {
      handleUpload(
        file,
        "banner",
        (url) => (bannerUrl = url),
        (v) => (uploadingBanner = v),
        (m) => (bannerStatus = m),
      );
      return;
    }
    cropTarget = "banner";
    cropFile = file;
  }

  function onCropped(croppedFile) {
    const target = cropTarget;
    cropTarget = null;
    cropFile = null;
    if (target === "pfp") {
      handleUpload(
        croppedFile,
        "pfp",
        (url) => (pfpUrl = url),
        (v) => (uploadingPfp = v),
        (m) => (pfpStatus = m),
      );
    } else if (target === "banner") {
      handleUpload(
        croppedFile,
        "banner",
        (url) => (bannerUrl = url),
        (v) => (uploadingBanner = v),
        (m) => (bannerStatus = m),
      );
    }
  }

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

  function openDeleteAccountPopup() {
    if (!user?.id) return;
    const width = 900;
    const height = 500;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      `/auth/deleteaccount?id=${user.id}`,
      "delete-account",
      `width=${width},height=${height},left=${left},top=${top}`,
    );
  }
</script>

<div class="pageS">
  <div class="toptitle">
    <p style="width: 100%; text-align: left;">Account</p>
  </div>
  <p style="font-size: 10px; width: 100%; text-align: left;">
    Change Account Credentials
  </p>
  <form class="form" onsubmit={handleSubmit}>
    <div class="formInput rim">
      <input
        name="displayname"
        type="text"
        placeholder="Display Name"
        bind:value={displayname}
      />
    </div>
    <div class="formInput rim">
      <input
        name="username"
        type="text"
        placeholder="@username"
        bind:value={username}
        oninput={formatUsername}
        onkeydown={handleKeydown}
      />
    </div>
    <button type="submit" disabled={loading}>
      {loading ? "Saving..." : "Save"}
    </button>
  </form>

  <p style="font-size: 10px; width: 100%; text-align: left;">
    Profile Customisation
  </p>

  <input
    type="file"
    accept="image/*"
    bind:this={bannerInput}
    onchange={handleBannerChange}
    style="display: none;"
  />
  <button
    type="button"
    class="banner-upload rim"
    onclick={() => bannerInput.click()}
    style="background-image: {bannerUrl ? `url(${bannerUrl})` : 'none'}"
  >
    {#if uploadingBanner}<p class="uploading-label">{bannerStatus}</p>{/if}
  </button>

  <input
    type="file"
    accept="image/*"
    bind:this={pfpInput}
    onchange={handlePfpChange}
    style="display: none;"
  />
  <button type="button" class="pfp-upload" onclick={() => pfpInput.click()}>
    <img
      class="pfp rim"
      src={pfpUrl || "/images/plhd.png"}
      alt="Profile picture"
    />
    {#if uploadingPfp}<p class="uploading-label">{pfpStatus}</p>{/if}
  </button>

  {#if error}<p class="response error">{error}</p>{/if}

  <p style="font-size: 10px; width: 100%; text-align: left;">Connections</p>

  <div class="connection-row rim">
    <div class="connection-info">
      <p class="connection-name">Discord</p>
      <p class="connection-status">
        {#if discordLinked}
          Connected{discordId ? ` (${discordId})` : ""}
        {:else}
          Not connected
        {/if}
      </p>
    </div>
    {#if discordLinked}
      <button
        type="button"
        class="rim danger"
        disabled={discordBusy}
        onclick={handleDiscordDisconnect}
      >
        {discordBusy ? "Disconnecting..." : "Disconnect"}
      </button>
    {:else}
      <button
        type="button"
        class="rim"
        disabled={discordBusy}
        onclick={handleDiscordConnect}
      >
        {discordBusy ? "Connecting..." : "Connect"}
      </button>
    {/if}
  </div>
  {#if discordError}<p class="response error">{discordError}</p>{/if}

  <label class="toggle-row">
    <input
      type="checkbox"
      checked={shareListenActivity}
      onchange={handleShareToggle}
      disabled={shareSaving}
    />
    <span>Share what I'm listening to (feed &amp; Discord presence)</span>
  </label>
  <p style="font-size: 10px; width: 100%; text-align: left;">Feed</p>

  {#each feedToggleConfig as { key, label }}
    <label class="toggle-row">
      <input
        type="checkbox"
        checked={feedDisplayPrefs[key]}
        onchange={(e) => handleFeedPrefToggle(key, e)}
        disabled={feedPrefSaving[key]}
      />
      <span>Show {label} in my feed</span>
    </label>
  {/each}

  <p style="font-size: 10px; width: 100%; text-align: left;">Other</p>
  <button class="logout danger" onclick={handleLogout}>Logout -></button>
  <button class="delete-account danger" onclick={openDeleteAccountPopup}
    >Delete Account -></button
  >
</div>

{#if cropTarget}
  <ImageCropper
    file={cropFile}
    aspect={cropTarget === "banner" ? 16 / 5 : 1}
    outputWidth={cropTarget === "banner" ? 1600 : 800}
    onCancel={() => {
      cropTarget = null;
      cropFile = null;
    }}
    {onCropped}
  />
{/if}

<style>
  .pageS {
    display: flex;
    flex-direction: column;
    align-items: start;
    justify-content: start;
    width: 100%;
    height: 100%;
    padding: 20px;
    gap: 10px;
    overflow: scroll;
    scroll-behavior: smooth;
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
    font-size: 2rem;
    font-weight: 300;
    margin-bottom: 1rem;
  }

  .banner-upload {
    all: unset;
    position: relative;
    display: flex;
    width: 100%;
    height: 120px;
    min-height: 120px;
    flex-shrink: 0;
    background-size: cover;
    background-position: center;
    background-color: #cecece;
    cursor: pointer;
    align-items: center;
    justify-content: center;
  }

  .pfp-upload {
    all: unset;
    position: relative;
    cursor: pointer;
    display: inline-flex;
  }

  .uploading-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    color: white;
    font-size: 0.85rem;
    margin: 0;
  }

  .connection-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .connection-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  input[type="checkbox"] {
    background-color: grey;
    cursor: default;
    appearance: auto;
    box-sizing: border-box;
    padding: initial;
    border: initial;
  }

  .connection-name {
    font-size: 0.9rem;
    margin: 0;
  }

  .connection-status {
    font-size: 0.75rem;
    opacity: 0.7;
    margin: 0;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    width: 100%;
  }

  .logout {
    background: linear-gradient(to bottom, #ffffff70, #edcccc70);
    color: #621515;
  }

  .delete-account {
    background: linear-gradient(to bottom, #ffffff70, #edcccc70);
    color: #621515;
  }

  img.pfp {
    height: 70px;
    width: 70px;
    object-fit: cover;
    justify-self: center;
    margin: 0 !important;
  }
</style>
