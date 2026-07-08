<script>
  import { page } from "$app/stores";
  import Player from "$lib/components/Player.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import "../app.css";
  let { children } = $props();

  const EXEMPT_PREFIXES = ["/auth", "/friends"];

  let showFlowbox = $derived(
    !EXEMPT_PREFIXES.some((prefix) => $page.url.pathname.startsWith(prefix)),
  );

  let hiddenPaths = ["/", "/auth", "/friends", "/register", "/login"];
  let showAppComponents = $derived(hiddenPaths.includes($page.url.pathname));
</script>

<div class="website">
  {#if showAppComponents}
    <Player />
  {/if}
  <div class="appview">
    {#if showAppComponents}
      <Sidebar />
      <SearchBar />
    {/if}
    {@render children()}
    {#if showFlowbox}
      <div class="flowbox">
        <p>
          this was not meant for mobile. please use a desktop. If you're a
          desktop user, please make your browser window larger.
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .website {
    display: flex;
    flex-direction: column;
    height: 100dvh !important;
    width: 100dvw !important;
  }

  .appview {
    display: flex;
    flex-direction: row;
    height: 100%;
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
</style>
