<script>
  let { onClose, targetUsername = "", targetDisplayname = "" } = $props();

  const MAX_PING_LENGTH = 240;

  let message = $state("");
  let sending = $state(false);
  let error = $state("");
  let success = $state("");

  async function sendPing() {
    if (sending) return;
    error = "";
    success = "";
    sending = true;

    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/ping", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: targetUsername,
          message: message.trim() || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        error = data?.error || "Could not send ping.";
      } else {
        success = "Ping sent!";
        message = "";
        setTimeout(onClose, 900);
      }
    } catch {
      error = "Network error — could not reach the server.";
    } finally {
      sending = false;
    }
  }
</script>

<div class="flowbox">
  <div class="pingwrapper">
    <div class="rim card" class:errorS={error} class:successS={success}>
      <div class="toptitle">
        <p style="width: 100%; text-align: left;">
          Ping @{targetUsername}
        </p>
        <button class="close" onclick={onClose}
          ><img src="/assets/cross.svg" alt="Close" /></button
        >
      </div>

      <p class="hint">
        Send {targetDisplayname || `@${targetUsername}`} a ping — with a message,
        or just to say hi.
      </p>

      <div class="formInput rim">
        <textarea
          placeholder="Message (optional)..."
          maxlength={MAX_PING_LENGTH}
          bind:value={message}
          rows="3"></textarea>
      </div>
      <p class="charcount">{message.length}/{MAX_PING_LENGTH}</p>

      {#if success}<p class="response success">{success}</p>{/if}
      {#if error}<p class="response error">{error}</p>{/if}

      <button
        type="button"
        class="send rim"
        onclick={sendPing}
        disabled={sending}
      >
        {sending ? "Sending..." : "Send Ping"}
      </button>
    </div>
  </div>
</div>

<style>
  .flowbox {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    background-color: #ffffff;
    height: 100dvh !important;
    width: 100dvw !important;
    z-index: 100;
    animation: fadein 0.2s ease-in;
  }

  @keyframes fadein {
    0% {
      background-color: #ffffff00;
    }
    100% {
      background-color: #ffffff;
    }
  }

  .pingwrapper {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    width: 400px;
  }

  .pingwrapper {
    animation: popup 0.2s ease-out;
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 20px;
    gap: 10px;
    z-index: 1;
    backdrop-filter: blur(10px);
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
  }

  @keyframes popup {
    0% {
      opacity: 0.5;
      filter: blur(5px);
      transform: scale(0.9);
    }
    100% {
      opacity: 1;
      filter: blur(0px);
      transform: scale(1);
    }
  }

  .toptitle {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .toptitle p {
    width: 100%;
    font-size: 1.4rem;
    font-weight: 300;
  }

  .close {
    height: 35px;
    width: 35px;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1 / 1 !important;
    background: linear-gradient(to bottom, #ffffff, #cecece);
    border: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .close img {
    height: 10px;
    width: 10px;
    justify-self: center;
    margin: 0 !important;
  }

  .hint {
    font-size: 13px;
    opacity: 0.6;
    width: 100%;
    text-align: left;
  }

  .formInput {
    width: 100%;
  }

  .formInput textarea {
    all: unset;
    width: 100%;
    resize: none;
    font-family: "InterVariable", sans-serif;
  }

  .charcount {
    width: 100%;
    text-align: right;
    font-size: 11px;
    opacity: 0.4;
  }

  .send {
    width: 100%;
    text-align: center;
    justify-content: center;
    padding: 10px;
    font-weight: 500;
  }

  .send:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
