<script>
  import { page } from "$app/stores";
  import CollectionPage from "$lib/components/CollectionPage.svelte";
</script>

<CollectionPage kind="Playlist" id={$page.params.id} />
