<script>
  import { createCollection } from "$lib/libraryFs.js";

  let { onClose, rootHandle, kind, onCreated } = $props();

  let name = $state("");
  let year = $state("");
  let genre = $state("");
  let saving = $state(false);
  let error = $state("");

  async function submit() {
    if (saving) return;
    error = "";
    if (!name.trim()) {
      error = `${kind} name is required.`;
      return;
    }
    saving = true;
    try {
      const id = await createCollection(rootHandle, kind, name.trim());
      onCreated({ id, name: name.trim(), year, genre });
      onClose();
    } catch (err) {
      error = err?.message || `Could not create this ${kind.toLowerCase()}.`;
    } finally {
      saving = false;
    }
  }
</script>

<div class="flowbox">
  <div class="pingwrapper">
    <div class="rim card" class:errorS={error}>
      <div class="toptitle">
        <p style="width: 100%; text-align: left;">New {kind}</p>
        <button class="close" onclick={onClose}
          ><img src="/assets/cross.svg" alt="Close" /></button
        >
      </div>

      <p class="hint">Give your new {kind.toLowerCase()} a name to get started.</p>

      <div class="formInput rim">
        <input
          type="text"
          placeholder="{kind} name..."
          bind:value={name}
          maxlength="120"
        />
      </div>

      {#if error}<p class="response error">{error}</p>{/if}

      <div class="actionsRow">
        <button type="button" class="skip rim" onclick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" class="send rim" onclick={submit} disabled={saving}>
          {saving ? "Creating..." : `Create ${kind}`}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .flowbox {
    position: absolute;
    top: 0;
    left: 0;
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
    0% { background-color: #ffffff00; }
    100% { background-color: #ffffff; }
  }

  .pingwrapper {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    width: 400px;
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
    0% { opacity: 0.5; filter: blur(5px); transform: scale(0.9); }
    100% { opacity: 1; filter: blur(0px); transform: scale(1); }
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

  .formInput input {
    all: unset;
    width: 100%;
    font-family: "InterVariable", sans-serif;
  }

  .response.error {
    color: #c0392b;
    font-size: 13px;
    width: 100%;
    text-align: left;
  }

  .actionsRow {
    display: flex;
    flex-direction: row;
    gap: 10px;
    width: 100%;
  }

  .skip {
    flex: 1;
    text-align: center;
    justify-content: center;
    padding: 10px;
    font-weight: 500;
    opacity: 0.6;
  }

  .send {
    flex: 2;
    text-align: center;
    justify-content: center;
    padding: 10px;
    font-weight: 500;
  }

  .send:disabled,
  .skip:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
