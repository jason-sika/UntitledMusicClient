<script>
  let { form } = $props();
  let error = $state("");
  let success = $state("");

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value;
    const password = form.password.value;

    const res = await fetch("https://backend.umc.jasonsika.com/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // required so the cookie gets set/sent cross-origin
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      error = data.error;
    } else {
      success = "Logged in!";
      // e.g. goto('/app')
    }
  }
</script>

<div class="website">
  <h1>Untitled Music Client</h1>
  <div class="login rim">
    <p>Log In</p>
    <form class="form" on:submit={handleSubmit}>
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
      <button type="submit">Log In</button>
    </form>
    {#if form?.success}<p style="color:green">{form.success}</p>{/if}
    {#if form?.error}<p style="color:red">{form.error}</p>{/if}
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

  .login {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    max-width: 350px !important;
    padding: 20px;
    gap: 10px;
    z-index: 1;
    backdrop-filter: blur(10px);
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
  }

  .login p {
    font-size: 2rem;
    font-weight: 300;
    margin-bottom: 1rem;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  input {
    all: unset;
  }

  .formInput {
    position: relative;
    font-family: "InterVariable", sans-serif;
    padding: 0.5rem;
    font-size: 1rem;
    background: linear-gradient(to top, #ffffff70, #eeeeee70);
    border: none !important;
    cursor: text;
    border-radius: 0px !important;
  }

  button {
    font-family: "InterVariable", sans-serif;
    padding: 0.5rem;
    font-size: 1rem;
    cursor: pointer;
  }

  .website h1 {
    font-size: 5rem;
    font-weight: 400;
    margin-bottom: -30px !important;
    text-wrap: nowrap;
    opacity: 0;
    z-index: 0;
    animation: fadeIn2 1s ease-in-out forwards;
    animation-delay: 1s;
  }

  @keyframes fadeIn2 {
    0% {
      opacity: 0;
      transform: translateY(50px);
      filter: blur(10px);
    }
    100% {
      opacity: 0.2;
      transform: translateY(0);
      filter: blur(0);
    }
  }
</style>
