<div class="player rim">
  <div class="meta">
    <img class="albumArt rim" src="/images/plhd.png" alt="Album Art" />
    <div class="text">
      <h1 class="title">Track Title</h1>
      <p class="artist">Artist Name</p>
    </div>
  </div>
  <div class="scrobbler">
    <span class="current-time">0:00</span>
    <div class="progress-bar">
      <div class="progress"></div>
    </div>
    <span class="duration">3:45</span>
  </div>
  <div class="controls">
    <button class="prev">Prev</button>
    <button class="play">Play</button>
    <button class="next">Next</button>
    <button class="shuffle">Lyrics</button>
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
    height: 80px;
    width: 100%;
    background: linear-gradient(to bottom, #ffffff70, #cecece70);
    color: #000000;
  }

  .albumArt {
    width: 20px;
    height: 20px;
  }
</style>
