<script>
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";

  let userId = $derived($page.url.searchParams.get("id"));
  let status = $state("confirm"); // confirm | sending | sent | error
  let error = $state("");

  function goBack() {
    if (window.opener) {
      window.close();
    } else {
      goto("/app");
    }
  }

  async function confirmDelete() {
    if (!userId) {
      error = "Missing account reference.";
      status = "error";
      return;
    }
    status = "sending";
    error = "";
    try {
      const res = await fetch(
        "https://backend.umc.jasonsika.com/api/account/delete/request",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error = data?.error || "Could not send confirmation email.";
        status = "error";
        return;
      }
      status = "sent";
    } catch {
      error = "Network error — could not reach the server.";
      status = "error";
    }
  }
</script>

<div class="website">
  <h1 class="bgtext">Untitled Music Client</h1>
  <div class="login rim" class:errorS={status === "error"}>
    {#if status === "confirm" || status === "sending"}
      <p>Delete Account</p>
      <p class="response">
        This will permanently delete your account. We'll email you a
        confirmation link before anything actually happens.
      </p>
      {#if status === "sending"}
        <li class="loading-gap-dots">
          <span></span><span></span><span></span>
        </li>
      {:else}
        <div class="confirmrow">
          <button type="button" onclick={confirmDelete}>Ok</button>
          <button type="button" onclick={goBack}>Decline</button>
        </div>
      {/if}
    {:else if status === "sent"}
      <p>Check your email</p>
      <p class="response success">
        We've sent a confirmation link to your email. Click it to finish
        deleting your account.
      </p>
      <button type="button" onclick={goBack}>pls go back ↖</button>
    {:else if status === "error"}
      <p>Something went wrong</p>
      <p class="response error">{error}</p>
      <div class="confirmrow">
        <button type="button" onclick={confirmDelete}>Try again</button>
        <button type="button" onclick={goBack}>Cancel</button>
      </div>
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

  .confirmrow {
    display: flex;
    flex-direction: row;
    gap: 10px;
    width: 100%;
  }

  .confirmrow button {
    flex: 1;
  }

  button {
    text-align: center;
    align-items: center;
    justify-content: center;
  }
</style>
