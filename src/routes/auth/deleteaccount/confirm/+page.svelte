<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";

  let token = $derived($page.url.searchParams.get("token"));
  let status = $state("confirming"); // confirming | done | error
  let error = $state("");

  onMount(async () => {
    if (!token) {
      error = "Missing or invalid confirmation link.";
      status = "error";
      return;
    }
    try {
      const res = await fetch(
        "https://backend.umc.jasonsika.com/api/account/delete/confirm",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error = data?.error || "This link is invalid or has expired.";
        status = "error";
        return;
      }
      status = "done";
    } catch {
      error = "Network error — could not reach the server.";
      status = "error";
    }
  });

  function goHome() {
    goto("/");
  }
</script>

<div class="website">
  <h1 class="bgtext">Untitled Music Client</h1>
  <div class="login rim" class:errorS={status === "error"}>
    {#if status === "confirming"}
      <p>Deleting your account…</p>
      <li class="loading-gap-dots">
        <span></span><span></span><span></span>
      </li>
    {:else if status === "done"}
      <p>Account deleted</p>
      <p class="response success">
        Your account has been permanently deleted. Sorry to see you go.
      </p>
      <button type="button" onclick={goHome}>Home ↖</button>
    {:else if status === "error"}
      <p>Couldn't delete account</p>
      <p class="response error">{error}</p>
      <button type="button" onclick={goHome}>Home ↖</button>
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
