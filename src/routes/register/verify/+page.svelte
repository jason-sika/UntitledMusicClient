<script>
  import { goto } from "$app/navigation";
  let { data } = $props();
  let email = $state(data?.email ?? "");
  let code = $state("");
  let error = $state("");
  let success = $state("");
  let loading = $state(false);
  let resending = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    error = "";
    success = "";
    loading = true;

    let res;
    try {
      res = await fetch("https://backend.umc.jasonsika.com/api/verifymail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
    } catch (err) {
      error = "Something went wrong with the servers [SERV_DOWN]";
      loading = false;
      return;
    }

    if (res.status === 404) {
      error = "Couldn't verify [404]";
      loading = false;
      return;
    }

    let data = null;
    try {
      data = await res.json();
    } catch {
      error = `Unexpected response from server (status ${res.status}).`;
      loading = false;
      return;
    }

    if (!res.ok) {
      error = data?.error || `Verification failed (status ${res.status}).`;
      loading = false;
    } else {
      success = "Logging you in...";
      goto("/app");
      // loading stays true here — we're navigating away
    }
  }

  async function handleResend() {
    error = "";
    resending = true;
    try {
      const res = await fetch(
        "https://backend.umc.jasonsika.com/api/resendcode",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        error = data?.error || "Could not resend code.";
      } else {
        success = "New code sent!";
      }
    } catch {
      error = "Network error — could not reach the server.";
    } finally {
      resending = false;
    }
  }
</script>

<div class="website">
  <h1 class="bgtext">Untitled Music Client</h1>
  <div class="login rim" class:errorS={error} class:successS={success}>
    <p>Verify Email</p>
    <form class="form" onsubmit={handleSubmit}>
      <div class="formInput rim">
        <input
          name="email"
          type="email"
          placeholder="Email"
          bind:value={email}
          required
        />
      </div>
      <div class="formInput rim">
        <input
          name="code"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          placeholder="6-digit code"
          bind:value={code}
          required
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? "Verifying..." : "Verify ->"}
      </button>
    </form>
    {#if success}<p class="response success">{success}</p>{/if}
    {#if error}<p class="response error">{error}</p>{/if}
    {#if loading}<li class="loading-gap-dots">
        <span></span><span></span><span></span>
      </li>{/if}
    <button
      type="button"
      class="resend"
      onclick={handleResend}
      disabled={resending}
    >
      {resending ? "Sending..." : "Resend code"}
    </button>
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

  .resend {
    background: none;
    border: none;
    font-size: 0.85rem;
    opacity: 0.6;
    text-decoration: underline;
    margin-top: 0.5rem;
  }

  .resend:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
