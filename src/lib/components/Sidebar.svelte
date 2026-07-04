<div class="sidebar">
  <div class="you">
    <img
      class="profilePicture rim"
      src="/images/plhd.png"
      alt="Profile Picture"
    />
    <div class="text">
      <h1 class="Name">Fede P</h1>
      <p class="currentPlayer">Youtube Music [WIP]</p>
    </div>
    <div class="settings rim">
      <img src="/images/plhd.png" alt="Settings" />
    </div>
  </div>
  <div class="tabview online rim">
    <div class="tabswitch">
      <a class="tab active">Home</a>
      <a class="tab">Library</a>
      <a class="tab">Search</a>
    </div>
  </div>
  <div class="tabview library rim">
    <div class="tabswitch">
      <a class="tab active">Playlists</a>
      <a class="tab">Albums</a>
      <a class="tab">Songs</a>
      <a class="tab">Artists</a>
    </div>
    <div class="playlist"></div>
  </div>
</div>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
    gap: 0px;
    height: 100%;
    width: 265px;
    background: linear-gradient(to bottom, #ffffff70, #cecece70);
    color: #000000;
  }

  .you {
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    padding-inline: 20px;
    padding-block: 15px;
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
    gap: 10px;
    height: 80px;
    width: 100%;
  }

  .Name {
    font-size: 20px;
    font-weight: 500;
    opacity: 0.7;
  }

  .currentPlayer {
    font-size: 13px;
    font-weight: 400;
    opacity: 0.5;
  }

  .profilePicture {
    width: 35px;
    height: 35px;
    object-fit: cover;
  }

  .settings {
    width: 35px;
    height: 35px;
  }

  .settings img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .tabview {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
    gap: 10px;
    height: 100%;
    width: 100%;
  }

  .tabswitch {
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 20px 20px 10px 20px;
    overflow: scroll;
  }

  a.tab {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    width: 100%;
    font-family: "InterVariable", sans-serif !important;
    font-size: 24px;
    font-weight: 300;
    opacity: 0.2;
  }

  a.tab.active {
    opacity: 0.7;
  }
</style>
