<script>
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";

  let friendshipId = $derived($page.url.searchParams.get("id"));
  let displayname = $derived($page.url.searchParams.get("name") || "this user");
  let status = $state("confirm"); // confirm | removing | done | error
  let error = $state("");

  function goBack() {
    if (window.opener) {
      window.close();
    } else {
      goto("/app");
    }
  }

  async function confirmRemove() {
    if (!friendshipId) {
      error = "Missing friendship reference.";
      status = "error";
      return;
    }
    status = "removing";
    error = "";
    try {
      const res = await fetch(
        "https://backend.umc.jasonsika.com/api/friends/remove",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendshipId }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error = data?.error || "Could not remove friend.";
        status = "error";
        return;
      }
      status = "done";
      if (window.opener) {
        window.opener.postMessage(
          { type: "friend-removed", friendshipId },
          "*",
        );
      }
    } catch {
      error = "Network error — could not reach the server.";
      status = "error";
    }
  }
</script>

<div class="website">
  <h1 class="bgtext">Untitled Music Client</h1>
  <div class="login rim" class:errorS={status === "error"}>
    {#if status === "confirm" || status === "removing"}
      <p>Remove Friend</p>
      <p class="response">
        Remove {displayname} as a friend? They won't be notified, but you'll need
        to send a new request to reconnect later.
      </p>
      {#if status === "removing"}
        <li class="loading-gap-dots">
          <span></span><span></span><span></span>
        </li>
      {:else}
        <div class="confirmrow">
          <button type="button" onclick={confirmRemove}>Ok</button>
          <button type="button" onclick={goBack}>Decline</button>
        </div>
      {/if}
    {:else if status === "done"}
      <p>Friend removed</p>
      <p class="response success">
        {displayname} has been removed from your friends.
      </p>
      <button type="button" onclick={goBack}>pls go back ↖</button>
    {:else if status === "error"}
      <p>Something went wrong</p>
      <p class="response error">{error}</p>
      <div class="confirmrow">
        <button type="button" onclick={confirmRemove}>Try again</button>
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
