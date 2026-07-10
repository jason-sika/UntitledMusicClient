<!-- Playback3.svelte -->
<script>
  import { player } from "$lib/stores/player";

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const pct = $derived(
    $player.duration > 0 ? (($player.currentTime / $player.duration) * 100).toFixed(2) : 0,
  );
</script>

<div class="tracker" class:paused={!$player.isPlaying}>
  <div class="time-row">
    <span class="time">{formatTime($player.currentTime)}</span>
    <span class="time">{formatTime($player.duration)}</span>
  </div>
  <div class="bar-wrap">
    <div class="bar-fill" style="width: {pct}%"></div>
  </div>
</div>

<style>
  .tracker {
    --primary-color: #ff6f9a;
    --secondary-color: #ff0537;
    --half-color: #ff053731;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
    margin-top: 10px;
  }

  .time-row {
    display: flex;
    flex-direction: row;
    gap: 10px;
    justify-content: space-between;
    width: 100%;
  }

  .time {
    font-size: 11px;
    color: #ffffff7f;
    font-variant-numeric: tabular-nums;
  }

  .bar-wrap {
    display: flex;
    flex-direction: row;
    gap: 10px;
    width: 100%;
    overflow: visible;
    color: #ffffff;
    cursor: default;
    opacity: 0.7;
    transition: opacity 0.2s ease;
    background: linear-gradient(
      to bottom,
      #ffffff42 0%,
      #7c7c7c55 20%,
      #7c7c7c55 80%,
      #ffffff42 100%
    );
    box-shadow:
      inset 0px 1px 1px 0px #ffffff1e,
      inset 0px -1px 1px 0px #ffffff1e,
      1px 0px 1px 0px #0000004a,
      -1px 0px 1px 0px #0000004a;
    padding: 5px 5px;
    backdrop-filter: blur(10px) !important;
    z-index: 100;
    border-radius: 100px;
    align-content: center;
    justify-content: flex-start;
    align-items: center;
  }

  .bar-wrap:hover {
    color: #ffffff;
    opacity: 1;
    background: linear-gradient(
      to bottom,
      #ffffff9e 0%,
      #ffffff55 20%,
      #ffffff52 80%,
      #ffffff9e 100%
    );
    box-shadow:
      inset 0px 1px 1px 0px #ffffff7f,
      inset 0px -1px 1px 0px #ffffff7f,
      1px 0px 1px 0px #000000,
      -1px 0px 1px 0px #000000,
      0px 3px 2px 0px #ffffff16;
    transition: all 0.2s ease;
    transform: scale(1.05);
  }

  .bar-fill {
    background: linear-gradient(
      to right,
      rgb(255, 255, 255) 20%,
      rgb(255, 255, 255) 97%,
      rgba(255, 255, 255, 0) 100%
    );
    height: 5px;
    transition: width 0.2s linear;
    filter: blur(2px);
    mix-blend-mode: plus-lighter;
  }

  @media (max-width: 1079px) {
    .time-row {
      font-size: 10px;
    }
  }
</style>
