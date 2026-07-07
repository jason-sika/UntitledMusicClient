<script>
  import { onMount, onDestroy } from "svelte";
  import { player } from "$lib/stores/player";

  let playerHost = $state(null);
  let ytPlayer;
  let pollInterval;

  let barWrap = $state(null);
  let dragging = $state(false);
  let dragProgress = $state(0);
  let query = $state("");
  let searchResults = $state([]);
  let searching = $state(false);

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

  function loadYouTubeAPI() {
    return new Promise((resolve) => {
      if (window.YT?.Player) {
        resolve(window.YT);
        return;
      }
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    });
  }

  onMount(async () => {
    const YT = await loadYouTubeAPI();

    ytPlayer = new YT.Player(playerHost, {
      height: "0",
      width: "0",
      playerVars: { autoplay: 0 },
      events: {
        onReady: () => player.attachPlayer(ytPlayer),
        onStateChange: (e) => {
          player.setPlaying(e.data === YT.PlayerState.PLAYING);
          if (e.data === YT.PlayerState.ENDED) {
            // no queue system yet — just stop cleanly at the end
            player.setPlaying(false);
          }
        },
      },
    });

    pollInterval = setInterval(() => {
      if (ytPlayer?.getCurrentTime) {
        player.setTime(ytPlayer.getCurrentTime(), ytPlayer.getDuration());
      }
    }, 500);
  });

  onDestroy(() => {
    clearInterval(pollInterval);
    player.detachPlayer();
  });
</script>

<div bind:this={playerHost} style="display:none;"></div>
<div class="player rim">
  <div class="meta">
    <img class="albumArt rim" src={$player.albumArt} alt="Album Art" />
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
    <button class="prev">Prev</button>
    <button
      class="play"
      class:paused={$player.isPlaying}
      onclick={handlePlayPause}
    >
      {$player.isPlaying ? "Ⅱ" : "►"}
    </button>
    <button class="next">Next</button>
    <button class="lyrics">Lyrics</button>
  </div>
</div>

<style>
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
    background: linear-gradient(to bottom, #ffffff70, #cecece70);
    color: #000000;
  }

  .meta {
    display: flex;
    position: relative;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    gap: 20px;
    min-width: 265px;
  }

  .albumArt {
    width: 50px;
    height: 50px;
  }

  .text {
    width: 100%;
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

  /* ============================================================
     TRACKER — progress bar
     ============================================================ */
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

  /* ============================================================
     CONTROLS
     ============================================================ */
  .controls {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    position: relative; /* anchor point for the dropdown */
  }

  .play {
    font-weight: 400;
  }

  .play.paused {
    font-weight: 900;
  }
</style>
