<script>
  import { onMount, onDestroy } from "svelte";
  import { player } from "$lib/stores/player";
  import { librarySongs } from "$lib/stores/library";
    import { goto } from "$app/navigation";

  let audioEl = $state(null);
  let { hidden = false } = $props();

  let barWrap = $state(null);
  let dragging = $state(false);
  let dragProgress = $state(0);


  const progress = $derived(
    dragging
      ? dragProgress
      : $player.duration > 0
        ? $player.currentTime / $player.duration
        : 0,
  );

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function progressFromEvent(e) {
    const rect = barWrap.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    return rect.width > 0 ? x / rect.width : 0;
  }

  function handlePointerDown(e) {
    dragging = true;
    dragProgress = progressFromEvent(e);
    barWrap.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragging) return;
    dragProgress = progressFromEvent(e);
  }

  function handlePointerUp(e) {
    if (!dragging) return;
    dragging = false;
    player.seek(dragProgress);
    barWrap.releasePointerCapture(e.pointerId);
  }

  function handlePlayPause() {
    if ($player.isPlaying) player.pause();
    else player.play();
  }

  function previewSong(song) {
    player.loadSong(song.handle, {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      albumArt: "/images/plhd.png", // swap for album artwork lookup once wired
    });
  }

  // ---------- local <audio> element wiring ----------

  function handleTimeUpdate() {
    player.setTime(audioEl.currentTime, audioEl.duration || 0);
  }

  function handleLoadedMetadata() {
    player.setTime(audioEl.currentTime, audioEl.duration || 0);
  }

  function handlePlay() {
    player.setPlaying(true);
  }

  function handlePause() {
    player.setPlaying(false);
  }

  function handleEnded() {
    player.setPlaying(false);
  }

  onMount(() => {
    player.attachPlayer(audioEl);
  });
</script>

<audio
  bind:this={audioEl}
  ontimeupdate={handleTimeUpdate}
  onloadedmetadata={handleLoadedMetadata}
  onplay={handlePlay}
  onpause={handlePause}
  onended={handleEnded}
  style="display:none;"
></audio>

<div class="player rim" class:hidden>
  <div class="meta">
    <img class="albumArt rim" src={$player.albumArt} alt="Album Art" onclick={() => goto("/app/nowplaying")} />
    <div class="text">
      <h1 class="title">{$player.title || "Nothing playing"}</h1>
      <p class="artist">{$player.artist}</p>
    </div>
  </div>

  <div class="tracker">
    <div class="time-row">
      <span class="time">
        {formatTime(
          dragging ? dragProgress * $player.duration : $player.currentTime,
        )}
      </span>
      <div
        class="bar-wrap"
        bind:this={barWrap}
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
      >
        <div class="bar-fill" style="width: {progress * 100}%;"></div>
      </div>
      <span class="time">{formatTime($player.duration)}</span>
    </div>
  </div>

  <div class="controls">
    <button class="prev"
      ><p>◀</p>
      <p>◀</p></button
    >
    <button
      class="play"
      class:paused={$player.isPlaying}
      onclick={handlePlayPause}
    >
      {$player.isPlaying ? "Ⅱ" : "►"}
    </button>
    <button class="next"
      ><p>►</p>
      <p>►</p></button
    >
    <button class="lyrics">Lyrics</button>
  </div>
</div>

<style>

    .player.hidden {
      display: none;
    }

  .player {
    display: flex;
    position: relative;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 20px;
    padding-inline: 20px;
    height: 80px;
    width: 100%;
    background: linear-gradient(to bottom, #ffffff, #bababa);
    color: #000000;
    z-index: 10;
  }

  .meta {
    display: flex;
    position: relative;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    gap: 10px;
    min-width: 265px;
  }

  .albumArt {
    width: 50px;
    height: 50px;
    transform: rotate(-05deg);
    box-shadow: 0px 0px 8px #00000070;
    transition: all 0.5s ease;
    z-index: 50;
  }

  .albumArt:hover {
    transform: rotate(0deg) scale(2) translateX(10px) translateY(-15px);
    transition: all 0.2s ease;
    cursor: pointer;
    box-shadow: 0px 0px 8px #00000070;
  }

  .albumArt:active {
    width: 50px;
    height: 50px;
    transform: rotate(-05deg);
    box-shadow: 0px 0px 8px #00000070;
    transition: all 0.5s ease;
    z-index: 50;
  }

  .text {
    width: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .title {
    font-size: 15px;
    font-weight: 500;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .artist {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    font-size: 13px;
    font-weight: 400;
    opacity: 0.5;
  }

  .tracker {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 100%;
  }

  .time-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  .time {
    font-size: 11px;
    opacity: 0.5;
    min-width: 32px;
    text-align: center;
    flex-shrink: 0;
  }

  .bar-wrap {
    display: flex;
    flex-direction: row;
    align-items: center;
    color: #fff;
    opacity: 0.7;
    transition:
      opacity 0.2s ease,
      transform 0.2s cubic-bezier(0, 1.29, 0.47, 1.48);
    background: linear-gradient(
      to bottom,
      #ffffff42,
      #7c7c7c55 20% 80%,
      #ffffff42
    );
    box-shadow:
      inset 0 1px 1px #ffffff1e,
      inset 0 -1px 1px #ffffff1e,
      1px 0 1px #0000004a,
      -1px 0 1px #0000004a;
    padding: 2px;
    -webkit-backdrop-filter: blur(10px) !important;
    backdrop-filter: blur(10px) !important;
    z-index: 100;
    width: 100%;
    height: 15px;
  }

  .bar-wrap:hover {
    transform: scale(1.01);
    cursor: pointer;
  }

  .bar-fill {
    background: linear-gradient(to right, #fff 20% 97%, #fff0);
    height: 10px;
    filter: blur(2px);
    mix-blend-mode: plus-lighter;
  }

  .controls {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    position: relative;
    text-align: center;
  }

  .play {
    font-weight: 400;
    height: 36px;
    width: 36px;
    align-items: center !important;
    justify-content: center !important;
  }

  .play.paused {
    font-weight: 900;
  }

  .next {
    height: 36px;
    width: 36px;
    display: flex;
    flex-direction: row;
    align-items: center;
  }

  .next p {
    margin-inline: -2px !important;
  }

  .prev {
    height: 36px;
    width: 36px;
    display: flex;
    flex-direction: row;
    align-items: center;
  }

  .prev p {
    margin-inline: -2px !important;
  }
</style>
