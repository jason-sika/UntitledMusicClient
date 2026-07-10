<script>
  import NowPlaying from "$lib/components/NowPlaying.svelte";
  import { lyrics } from "$lib/stores/lyrics";
</script>

<NowPlaying src={$lyrics.src} ttmlString={$lyrics.ttmlString} />
