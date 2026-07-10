<!-- lib/components/ImageCropper.svelte -->
<script>
  let { file, aspect = 1, outputWidth = 800, onCancel, onCropped } = $props();

  let imgEl = $state(null);
  let frameEl = $state(null);
  let naturalW = $state(0);
  let naturalH = $state(0);
  let zoom = $state(1);
  let offsetX = $state(0);
  let offsetY = $state(0);
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let imgUrl = $state("");
  let saving = $state(false);
  let ready = $state(false);

  const frameW = 340;
  const frameH = Math.round(340 / aspect);
  const outputHeight = Math.round(outputWidth / aspect);

  $effect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    imgUrl = url;
    ready = false;
    naturalW = 0;
    naturalH = 0;
    return () => URL.revokeObjectURL(url);
  });

  // Fires once imgEl is bound AND the src is set. Handles the case where the
  // image is already `complete` by the time this runs (blob: URLs can finish
  // decoding before the onload attribute gets attached), so we don't rely on
  // the load event alone.
  $effect(() => {
    if (!imgEl || !imgUrl) return;
    if (imgEl.complete && imgEl.naturalWidth) {
      applyLoadedDimensions();
      return;
    }
    const handleLoad = () => applyLoadedDimensions();
    imgEl.addEventListener("load", handleLoad);
    return () => imgEl.removeEventListener("load", handleLoad);
  });

  function applyLoadedDimensions() {
    naturalW = imgEl.naturalWidth;
    naturalH = imgEl.naturalHeight;
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    ready = naturalW > 0 && naturalH > 0;
  }

  function baseScale() {
    if (!naturalW || !naturalH) return 0;
    return Math.max(frameW / naturalW, frameH / naturalH);
  }

  function totalScale() {
    return baseScale() * zoom;
  }

  function clampOffsets() {
    const s = totalScale();
    if (!s) return;
    const dispW = naturalW * s;
    const dispH = naturalH * s;
    const maxX = Math.max(0, (dispW - frameW) / 2);
    const maxY = Math.max(0, (dispH - frameH) / 2);
    offsetX = Math.min(maxX, Math.max(-maxX, offsetX));
    offsetY = Math.min(maxY, Math.max(-maxY, offsetY));
  }

  function onPointerDown(e) {
    if (!ready) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    frameEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    offsetX += e.clientX - lastX;
    offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    clampOffsets();
  }

  function onPointerUp(e) {
    dragging = false;
    frameEl.releasePointerCapture(e.pointerId);
  }

  function onZoomChange(e) {
    zoom = Number(e.target.value);
    clampOffsets();
  }

  async function confirmCrop() {
    if (!ready || saving) return;
    saving = true;
    try {
      const s = totalScale();
      const dispW = naturalW * s;
      const dispH = naturalH * s;
      const imgLeft = (frameW - dispW) / 2 + offsetX;
      const imgTop = (frameH - dispH) / 2 + offsetY;

      const sx = Math.max(0, -imgLeft / s);
      const sy = Math.max(0, -imgTop / s);
      const sw = frameW / s;
      const sh = frameH / s;

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.92),
      );
      const cropped = new File([blob], file.name.replace(/\.\w+$/, ".webp"), {
        type: "image/webp",
      });
      onCropped(cropped);
    } finally {
      saving = false;
    }
  }
</script>

<div class="overlay">
  <div class="modal rim">
    <p class="title">Crop image</p>

    <div
      class="frame"
      bind:this={frameEl}
      style="width:{frameW}px; height:{frameH}px;"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    >
      {#if imgUrl}
        <img
          bind:this={imgEl}
          src={imgUrl}
          alt=""
          draggable="false"
          style="
            width:{ready ? naturalW * totalScale() : 0}px;
            height:{ready ? naturalH * totalScale() : 0}px;
            left:{frameW / 2 + offsetX}px;
            top:{frameH / 2 + offsetY}px;
          "
        />
      {/if}
      {#if !ready}
        <p class="loadingLabel">Loading...</p>
      {/if}
    </div>

    <input
      type="range"
      min="1"
      max="3"
      step="0.01"
      value={zoom}
      oninput={onZoomChange}
      disabled={!ready}
      class="zoomSlider"
    />

    <div class="actions">
      <button class="friendbtn" onclick={onCancel} disabled={saving}>Cancel</button>
      <button class="friendbtn" onclick={confirmCrop} disabled={saving || !ready}>
        {saving ? "Saving..." : "Use Photo"}
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 800;
  }
  .modal {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 24px;
    background: linear-gradient(to bottom, #ffffff, #f2f2f2);
  }
  .title {
    font-family: "InterVariable", sans-serif;
    font-size: 18px;
    font-weight: 300;
  }
  .frame {
    position: relative;
    overflow: hidden;
    background: #000;
    touch-action: none;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .frame img {
    position: absolute;
    transform: translate(-50%, -50%);
    user-select: none;
    pointer-events: none;
  }
  .loadingLabel {
    position: absolute;
    color: #ffffff80;
    font-size: 13px;
  }
  .zoomSlider {
    width: 100%;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .friendbtn {
    font-size: 14px;
    padding: 8px 16px;
    cursor: pointer;
  }
</style>
