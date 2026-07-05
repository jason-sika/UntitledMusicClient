<script>
  import { goto } from "$app/navigation";

  let error = $state("");
  let success = $state("");
  let username = $state("@");
  let loading = $state(false);

  function formatUsername(e) {
    let value = e.target.value.toLowerCase();
    value = "@" + value.replace(/@/g, "");
    username = value;
    e.target.value = value;
  }

  function handleKeydown(e) {
    const input = e.target;
    if (
      (e.key === "Backspace" || e.key === "Delete") &&
      input.selectionStart <= 1 &&
      input.selectionEnd <= 1
    ) {
      e.preventDefault();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    error = "";
    success = "";
    loading = true;

    const form = e.target;
    const displayname = form.displayname.value;
    const email = form.email.value;
    const password = form.password.value;

    let res;
    try {
      res = await fetch("https://backend.umc.jasonsika.com/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayname, username, email, password }),
      });
    } catch (err) {
      error = "Network error — could not reach the server.";
      loading = false;
      return;
    }

    if (res.status === 404) {
      error = "Signup endpoint not found (404).";
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
      error = data?.error || `Signup failed (status ${res.status}).`;
      loading = false;
    } else {
      success = "Account created — check your email to verify!";
      goto(`/register/verify?email=${encodeURIComponent(email)}`);
      // loading stays true — we're navigating away
    }
  }
</script>

<div class="website">
  <h1 class="bgtext">Untitled Music Client</h1>
  <div class="login rim" class:errorS={error} class:successS={success}>
    <p>Sign Up</p>
    <form class="form" onsubmit={handleSubmit}>
      <div class="formInput rim">
        <input
          name="displayname"
          type="text"
          placeholder="Display Name"
          required
        />
      </div>
      <div class="formInput rim">
        <input
          name="username"
          type="text"
          placeholder="@username"
          bind:value={username}
          oninput={formatUsername}
          onkeydown={handleKeydown}
          required
        />
      </div>
      <div class="formInput rim">
        <input name="email" type="email" placeholder="Email" required />
      </div>
      <div class="formInput rim">
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? "Signing up..." : "Let's go ->"}
      </button>
    </form>
    {#if success}<p class="response success">{success}</p>{/if}
    {#if error}<p class="response error">{error}</p>{/if}
    {#if loading}<li class="loading-gap-dots">
        <span></span><span></span><span></span>
      </li>{/if}
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
