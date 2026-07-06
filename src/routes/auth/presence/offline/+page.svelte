<script>
  import { onMount } from "svelte";

  onMount(async () => {
    try {
      await fetch("https://backend.umc.jasonsika.com/api/presence/status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "offline" }),
      });
    } finally {
      window.close();
    }
  });
</script>

<div class="offline"></div>

<style>
  .offline {
    width: 100dvw;
    height: 100dvh;
    background: #fff;
  }
</style>
