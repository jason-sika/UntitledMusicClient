<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

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
  <div class="content"></div>
{/if}

<style>
</style>
