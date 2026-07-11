<script>
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";

  let status = $state("");
  let reason = $state("");
  let currentCount = $state(2);
  let interval;

  const messages = {
    linked: "Discord connected!",
    error: "Something went wrong connecting Discord.",
  };

  function goBack() {
    if (window.opener) {
      window.close();
    } else {
      // Not opened as a popup (e.g. someone hit this URL directly) —
      // nothing sensible to close, so just send them somewhere useful.
      goto("/app/settings");
    }
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    status = params.get("status") === "linked" ? "linked" : "error";
    reason = params.get("reason") ?? "";

    interval = setInterval(() => {
      currentCount -= 1;
      if (currentCount <= 0) {
        clearInterval(interval);
        goBack();
      }
    }, 1000);
  });

  onDestroy(() => {
    clearInterval(interval);
  });
</script>

<div class="website">
  <h1 class="bgtext">Untitled Music Client</h1>
  <div class="login rim">
    <p>{messages[status]}</p>
    {#if status === "error" && reason}
      <p class="response error">({reason})</p>
    {/if}
    {#if currentCount > 0}
      <li class="loading-gap-dots">
        <span></span><span></span><span></span>
        <p class="response">{currentCount}</p>
      </li>
    {:else}
      <button type="button" onclick={goBack}>pls go back ↖</button>
    {/if}
  </div>
</div>

<style>
  .website {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100dvh !important;
    width: 100dvw !important;
  }
</style>
