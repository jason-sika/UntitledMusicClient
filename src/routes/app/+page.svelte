<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import Player from "$lib/components/Player.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
</script>

<div class="website">
  <div class="appview">
    <Sidebar />
    <div class="content"></div>
  </div>
  <Player />
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
    width: 100%;
  }
</style>
