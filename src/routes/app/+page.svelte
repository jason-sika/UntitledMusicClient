<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import Player from "$lib/components/Player.svelte";
  import Sidebar from "$lib/components/Sidebar-old.svelte";

  let checked = $state(false);

  onMount(async () => {
    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        credentials: "include",
      });

      if (!res.ok) {
        goto("/login"); // not /app/login, to avoid the loop
        return;
      }

      const data = await res.json();

      if (!data?.user) {
        goto("/login");
      } else {
        checked = true;
      }
    } catch (err) {
      // network error, server down, bad JSON, etc. — fail safe to login
      goto("/login");
    }
  });
</script>

{#if checked}
  <div class="website">
    <div class="appview">
      <Sidebar />
      <div class="content"></div>
    </div>
    <Player />
  </div>
{/if}

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
