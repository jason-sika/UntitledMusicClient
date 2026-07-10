<script>
  import { page } from "$app/stores";
  import CollectionPage from "$lib/components/CollectionPage.svelte";
</script>

<CollectionPage kind="Album" id={$page.params.id} />
