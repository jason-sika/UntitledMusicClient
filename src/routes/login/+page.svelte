<script>
  import { goto } from "$app/navigation";

  let error = $state("");
  let success = $state("");
  let loading = $state(false);

  async function handleSubmit(e) {
    e.preventDefault();
    error = "";
    success = "";
    loading = true;

    const form = e.target;
    const email = form.email.value;
    const password = form.password.value;

    let res;
    try {
      res = await fetch("https://backend.umc.jasonsika.com/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      error = "Network error — could not reach the server.";
      loading = false;
      return;
    }

    if (res.status === 404) {
      error = "Login endpoint not found (404).";
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
      error = data?.error || `Login failed (status ${res.status}).`;
      loading = false;
    } else {
      success = "Logged in!";
      goto("/app");
      // loading stays true — we're navigating away
    }
  }
</script>

<div class="website">
  <h1 class="bgtext">Untitled Music Client</h1>
  <div class="login rim" class:errorS={error} class:successS={success}>
    <p>Log In</p>
    <form class="form" onsubmit={handleSubmit}>
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
        {loading ? "Logging in..." : "Let's go ->"}
      </button>
    </form>
    <p class="response success">No account? <a href="/register">Sign up</a></p>
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
