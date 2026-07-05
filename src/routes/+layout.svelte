<!-- src/routes/app/+layout.svelte -->
<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import "../app.css";
  let { children } = $props();
</script>

{@render children()}
