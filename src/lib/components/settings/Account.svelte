<script>
  import { goto } from "$app/navigation";
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
  let pfpInput = $state(null);
  let bannerInput = $state(null);
  let uploadingPfp = $state(false);
  let uploadingBanner = $state(false);
  let pfpUrl = $state(user?.pfpUrl);
  let bannerUrl = $state(user?.bannerUrl);

  async function handleUpload(file, endpoint, onSuccess, setUploading) {
    if (!file) return;
    error = "";
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        `https://backend.umc.jasonsika.com/api/upload/${endpoint}`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        },
      );
      const data = await res.json();

      if (!res.ok) {
        error = data?.error || "Upload failed.";
      } else {
        onSuccess(data.url);
      }
    } catch {
      error = "Network error.";
    } finally {
      setUploading(false);
    }
  }

  function handlePfpChange(e) {
    handleUpload(
      e.target.files[0],
      "pfp",
      (url) => (pfpUrl = url),
      (val) => (uploadingPfp = val),
    );
  }

  function handleBannerChange(e) {
    handleUpload(
      e.target.files[0],
      "banner",
      (url) => (bannerUrl = url),
      (val) => (uploadingBanner = val),
    );
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

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
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
      youtubeConnected = !!data?.user?.youtubeConnected;
    } catch {
      // ignore
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
    {#if uploadingBanner}<p class="uploading-label">Uploading...</p>{/if}
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
    {#if uploadingPfp}<p class="uploading-label">Uploading...</p>{/if}
  </button>

  {#if error}<p class="response error">{error}</p>{/if}

  <p style="font-size: 10px; width: 100%; text-align: left;">Other</p>
  <button class="logout rim" onclick={handleLogout}>Logout -></button>
  <button class="delete-account rim" onclick={openDeleteAccountPopup}
    >Delete Account -></button
  >
  <p class="wip" style="font-size: 10px; width: 100%; text-align: left;">
    Player Connection
  </p>
  <button
    class="connect rim youtube"
    onclick={connectYoutube}
    disabled={youtubeConnected}
  >
    <p>{youtubeConnected ? "YouTube Connected ✓" : "Connect YouTube"}</p>
  </button>
  <button class="connect rim wip spotify"> Connect Spotify </button>
  <button class="connect rim wip appleMusic"> Connect Apple Music </button>
</div>

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

  .logout {
    background: linear-gradient(to bottom, #ffffff70, #edcccc70);
    color: #621515;
  }

  .delete-account {
    background: linear-gradient(to bottom, #ffffff70, #edcccc70);
    color: #621515;
  }

  .connect {
    color: #ffffff;
  }

  .connect p {
    mix-blend-mode: plus-lighter;
  }

  .youtube {
    background: linear-gradient(to bottom, #ffaaaa, #e16060);
  }

  .appleMusic {
    background: linear-gradient(to bottom, #ffa5a570, #ff333370);
  }

  .spotify {
    background: linear-gradient(to bottom, #b0ff8570, #00981c70);
  }

  select {
    all: unset;
    width: 100%;
  }

  img.pfp {
    height: 70px;
    width: 70px;
    object-fit: cover;
    justify-self: center;
    margin: 0 !important;
  }
</style>
