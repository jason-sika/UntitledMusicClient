<script>
  import { page } from "$app/stores";
  import { setContext } from "svelte";
  import Player from "$lib/components/Player.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import "../app.css";
  import {
    fsSupported,
    getSavedLibraryHandle,
    checkPermission,
    pickLibraryFolder,
    requestPermission,
  } from "$lib/fsAccess.js";

  let { children } = $props();

  const EXEMPT_PREFIXES = ["/auth", "/friends"];
  let showFlowbox = $derived(
    !EXEMPT_PREFIXES.some((prefix) => $page.url.pathname.startsWith(prefix)),
  );
  let hiddenPaths = ["/", "/auth", "/friends", "/register", "/login", "/app/nowplaying"];
  let showAppComponents = $derived(!hiddenPaths.includes($page.url.pathname));

  // --- Local folder gate, scoped to /app and anything under it ---
  let inAppSection = $derived($page.url.pathname.startsWith("/app"));

  // "idle" | "checking" | "unsupported" | "missing" | "needs-permission" | "granted"
  let gateStatus = $state("idle");
  let libraryHandle = $state(null);
  let pickerBusy = $state(false);
  let pickerError = $state("");
  let gateEvaluated = false; // guards against re-running once granted

  setContext("libraryHandle", {
    get handle() {
      return libraryHandle;
    },
  });

  $effect(() => {
    const root = document.documentElement;
    const path = $page.url.pathname;

    if (path === "/lyrics") {
      root.style.setProperty("--active-word", "#ffffff");
      root.style.setProperty("--lyrics-font-size", "40px");
      root.style.setProperty(
        "--lyrics-upcoming-color",
        "rgba(255, 255, 255, 0.289)",
      );
      root.style.setProperty(
        "--lyrics-past-color",
        "rgba(255, 255, 255, 0.75)",
      );
    } else if (path === "/app/nowplaying") {
      root.style.setProperty("--active-word", "#ffffff");
      root.style.setProperty("--lyrics-font-size", "2em");
      root.style.setProperty(
        "--lyrics-upcoming-color",
        "rgba(255, 255, 255, 0.289)",
      );
      root.style.setProperty(
        "--lyrics-past-color",
        "rgba(255, 255, 255, 0.75)",
      );
    } else if (path === "/") {
      root.style.setProperty("--active-word", "var(--first)");
      root.style.setProperty("--lyrics-font-size", "20px");
      root.style.setProperty("--lyrics-upcoming-color", "var(--third)");
      root.style.setProperty("--lyrics-past-color", "var(--second)");
    }
  });

  async function evaluateFolderGate() {
    gateStatus = "checking";
    if (!fsSupported()) {
      gateStatus = "unsupported";
      return;
    }
    const saved = await getSavedLibraryHandle(); // now never throws
    if (!saved) {
      gateStatus = "missing";
      return;
    }
    const perm = await checkPermission(saved); // now never throws
    if (perm === "granted") {
      libraryHandle = saved;
      gateStatus = "granted";
    } else if (perm === "error") {
      libraryHandle = null;
      gateStatus = "missing"; // handle was unusable, just ask again
    } else {
      libraryHandle = saved;
      gateStatus = "needs-permission";
    }
  }

  async function grantAccess() {
    pickerError = "";
    pickerBusy = true;
    try {
      if (gateStatus === "needs-permission" && libraryHandle) {
        const perm = await requestPermission(libraryHandle);
        if (perm === "granted") {
          gateStatus = "granted";
        } else {
          pickerError = "Permission denied. Try again or pick a different folder.";
        }
      } else {
        const handle = await pickLibraryFolder();
        libraryHandle = handle;
        gateStatus = "granted";
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        pickerError = "Something went wrong opening the folder picker.";
        console.error(err);
      }
    } finally {
      pickerBusy = false;
    }
  }

  // Fires the moment the pathname enters /app, and stays resolved
  // for every route underneath it — doesn't re-check once granted.
  $effect(() => {
    if (inAppSection && !gateEvaluated) {
      gateEvaluated = true;
      evaluateFolderGate();
    }
    if (!inAppSection) {
      // leaving /app entirely resets the gate so it re-checks next time in
      gateEvaluated = false;
      gateStatus = "idle";
    }
  });

  let blockingGate = $derived(
    inAppSection && gateStatus !== "granted" && gateStatus !== "idle",
  );
</script>

<div class="website">
  <div class="appview">
    {#if showAppComponents}
      <Sidebar />
      <SearchBar />
    {/if}

    {#if inAppSection && blockingGate}
      <div class="gateScreen">
        <div class="gateCard">
          {#if gateStatus === "checking"}
            <p class="gateTitle">Checking library access…</p>
          {:else if gateStatus === "unsupported"}
            <p class="gateTitle">Folder access isn't supported</p>
            <p class="gateBody">
              This browser doesn't support local folder access. Try UMC in a
              Chromium-based browser (Chrome, Edge, Brave) to use your local
              library.
            </p>
          {:else}
            <p class="gateTitle">
              {gateStatus === "needs-permission"
                ? "Reconnect your music folder"
                : "Choose your music folder"}
            </p>
            <p class="gateBody">
              {gateStatus === "needs-permission"
                ? "UMC needs permission again to read your local library."
                : "Pick the folder on your disk where your music lives. Your files stay on this device."}
            </p>
            <button class="gateBtn" onclick={grantAccess} disabled={pickerBusy}>
              {pickerBusy
                ? "Waiting…"
                : gateStatus === "needs-permission"
                  ? "Grant Access"
                  : "Choose Folder"}
            </button>
            {#if pickerError}
              <p class="gateError">{pickerError}</p>
            {/if}
          {/if}
        </div>
      </div>
    {:else}
      {@render children()}
    {/if}

    {#if showFlowbox}
      <div class="flowbox">
        <p>
          this was not meant for mobile. please use a desktop. If you're a
          desktop user, please make your browser window larger.
        </p>
      </div>
    {/if}
  </div>
  <Player hidden={!showAppComponents} />
</div>

<style>
    .website {
      display: flex;
      flex-direction: column;
      height: 100dvh !important;
    }

    .appview {
      display: flex;
      flex-direction: row;
      flex: 1 1 0;      /* grow/shrink to fill remaining space after Player */
      min-height: 0;    /* the actual fix — overrides the default auto min-height */
      overflow: hidden;  /* or auto, depending on whether appview itself should scroll */
      width: 100% !important;
    }

  .flowbox {
    display: none;
  }
  .flowbox p {
    display: none;
  }
  @media (max-width: 810px) {
    .flowbox {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      background-color: #ffffff;
      height: 100dvh !important;
      width: 100dvw !important;
      z-index: 100;
      padding: 50px;
      animation: fadein 0.2s ease-in;
      color: black;
    }
    .flowbox p {
      display: block;
      animation: fadein 0.2s ease-in;
    }
  }
  @keyframes fadein {
    0% {
      background-color: #ffffff00;
    }
    100% {
      background-color: #ffffff;
    }
  }
  .gateScreen {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: linear-gradient(to bottom, #ffffff, #eeeeee);
  }
  .gateCard {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 500px;
    text-align: center;
    padding: 32px;
  }
  .gateTitle {
    font-family: "InterVariable", sans-serif;
    font-size: 40px;
    font-weight: 300;
  }
  .gateBody {
    font-family: "InterVariable", sans-serif;
    font-size: 14px;
    opacity: 0.7;
  }
  .gateBtn {
    margin-top: 8px;
    padding: 10px 20px;
    cursor: pointer;
  }
  .gateBtn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .gateError {
    color: #c0392b;
    font-size: 13px;
  }
</style>
