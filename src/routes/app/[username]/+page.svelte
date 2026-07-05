<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import Player from "$lib/components/Player.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  let { data } = $props();
</script>

<div class="website">
  <div class="appview">
    <Sidebar />
    {#if data.notFound}
      <div class="notfound">
        <p>This user doesn't exist.</p>
      </div>
    {:else}
      <div class="profilepage">
        <div
          class="banner"
          style="background-image: {data.user.bannerUrl
            ? `url(${data.user.bannerUrl})`
            : 'none'}; object-fit: cover;"
        ></div>
        <div class="profileheader">
          <img
            class="pfp rim"
            src={data.user.pfpUrl || "/images/plhd.png"}
            alt="Profile picture"
          />
          <div class="info">
            <h1>{data.user.displayname}</h1>
            <p class="username">@{data.user.username}</p>
          </div>
        </div>
      </div>
    {/if}
  </div>
  <Player />
</div>

<style>
  .website {
    display: flex;
    flex-direction: column;
    height: 100dvh !important;
    width: 100dvw !important;
  }

  .appview {
    display: flex;
    flex-direction: row;
    height: 100%;
    width: 100% !important;
  }

  .notfound {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100dvh;
  }

  .profilepage {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .profilepage {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0; /* prevents flex overflow issues with wide content like images */
  }

  .notfound {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    height: 100dvh;
  }

  .banner {
    height: 200px;
    width: 100%;
    background: linear-gradient(to bottom, #ffffff70, #cecece70);
    background-size: cover;
    background-position: center;
  }

  .profileheader {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: 1rem;
    padding: 0 2rem;
    margin-top: -40px;
  }

  .pfp {
    width: 100px;
    height: 100px;
    object-fit: cover;
    border: 4px solid white;
  }

  .info h1 {
    font-size: 1.8rem;
    font-weight: 500;
  }

  .username {
    opacity: 0.6;
  }
</style>
