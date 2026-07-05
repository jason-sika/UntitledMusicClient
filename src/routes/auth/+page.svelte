<script>
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";

  let currentCount = $state(5);
  let interval;

  function goBack() {
    if (window.opener) {
      window.close();
    } else {
      goto("/app");
    }
  }

  onMount(() => {
    interval = setInterval(() => {
      currentCount -= 1;
      if (currentCount <= 0) {
        clearInterval(interval);
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
    <p>YouTube Link</p>
    <p class="response">YouTube Linking is not open rn sorry</p>
    {#if currentCount > 0}
      <li class="loading-gap-dots">
        <span></span><span></span><span></span>

        <p class="response">{currentCount}</p>
      </li>
    {/if}
    {#if currentCount <= 0}
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
