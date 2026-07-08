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
  let currentPage = $state("AccountSettings");
  let pfpInput = $state(null);
  let bannerInput = $state(null);
  let uploadingPfp = $state(false);
  let uploadingBanner = $state(false);
  let pfpUrl = $state(user?.pfpUrl);
  let bannerUrl = $state(user?.bannerUrl);
  let pfpStatus = $state("");
  let bannerStatus = $state("");

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
      const prepared = await preResizeIfStatic(file);
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
    const maxAttempts = 60; // ~2 minutes at 2s intervals
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
        // still "processing" — nudge the message a little past ~20s so a long
        // wait doesn't look stuck, without needing real progress from the server
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
    handleUpload(
      e.target.files[0],
      "pfp",
      (url) => (pfpUrl = url),
      (val) => (uploadingPfp = val),
      (msg) => (pfpStatus = msg),
    );
  }

  function handleBannerChange(e) {
    handleUpload(
      e.target.files[0],
      "banner",
      (url) => (bannerUrl = url),
      (val) => (uploadingBanner = val),
      (msg) => (bannerStatus = msg),
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

  <p style="font-size: 10px; width: 100%; text-align: left;">Other</p>
  <button class="logout rim" onclick={handleLogout}>Logout -></button>
  <button class="delete-account rim" onclick={openDeleteAccountPopup}
    >Delete Account -></button
  >
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

  img.pfp {
    height: 70px;
    width: 70px;
    object-fit: cover;
    justify-self: center;
    margin: 0 !important;
  }
</style>
