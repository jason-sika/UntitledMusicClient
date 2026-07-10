<script>
  import { playbackSync } from "$lib/stores/playbackSync";
  import { nowPlaying } from "$lib/stores/nowPlaying.js";
  import { lyrics } from "$lib/stores/lyrics";
  import NowPlayingFull from "$lib/components/NowPlayingFull.svelte";

  let lyricsState = $derived($lyrics);
  let device = $derived($playbackSync.device);
</script>

<div class="music-page">
  {#key lyricsState.currentKey}
    <NowPlayingFull
      src={lyricsState.src ?? ""}
      ttmlString={lyricsState.ttmlString ?? ""}
    />
  {/key}
</div>

<style>
  .music-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100dvh;
    gap: 20px;
    transition: all 0.5s ease;
  }

  @media (max-width: 1079px) {
    .music-page {
      flex-direction: column;
      padding: 0px;
      gap: 20px;
    }
  }
</style>
