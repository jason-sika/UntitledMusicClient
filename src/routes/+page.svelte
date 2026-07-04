<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
</script>

<div class="website">
  <div class="side1">
    <div class="top">
      <h1 class="title">Untitled Music Client</h1>
      <div class="watermark">
        <p class="by">BY</p>
        <p class="js">JASONSIKA</p>
        <p class="tn">TN</p>
      </div>
    </div>
    <div class="bottom">
      <p class="desc">Listen to music through the most popular providers there is.
Without changing interfaces, with the same features.</p>
      <div class="buttonwrapper">
        <button onclick={() => goto('/app')}>Go To App</button>
        <button onclick={() => goto('https://github.com/jason-sika/UntitledMusicClient')}>GitHub</button>
      </div>
    </div>
  </div>
  <div class="side2">
    <h1>Enjoy music once again.</h1>
    <img src="/images/image.png" alt="umcUI" />
  </div>
</div>

<style>
  .website {
    display: flex;
    flex-direction: row;
    height: 100dvh !important;
    width: 100dvw !important;
  }

  .side1 {
    display: flex;
    flex-direction: column;
    justify-content: end;
    align-items: start;
    gap: 40px;
    height: 100%;
    width: 50dvw !important;
    padding: 50px;
    text-align: left;
  }

  .top {
    display: flex;
    flex-direction: column;
    gap: 0px;
  }

  .title {
    font-size: 36px;
    font-weight: 500;
    margin-bottom: 20px;
  }

  .watermark {
    display: flex;
    flex-direction: row;
    gap: 0px;
    align-items: baseline;
  }

  .watermark p {
    display: inline-block;
    margin: 0;
  }

  .watermark .by {
    font-size: 20px;
    font-weight: 500;
    margin-right: 5px !important;
    opacity: 0.5;
  }

  .watermark .js {
    font-size: 20px;
    font-weight: 900;
    opacity: 0.5;
  }

  .watermark .tn {
    font-size: 15px;
    font-weight: 900;
    opacity: 0.5;
  }

  .bottom {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .desc {
    white-space: pre-line;
    font-size: 18px;
    font-weight: 400;
    opacity: 0.7;
  }

  .side2 {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: start;
    height: 100% !important;
    width: 50dvw !important;
  }

  .side2 img {
    width: 150%;
    aspect-ratio: 16 / 9 !important;
    object-fit: cover;
    box-shadow: 0px 20px 50px rgba(0, 0, 0, 0.2);
    z-index: 1;
  }

  .side2 h1 {
    font-size: 5rem;
    font-weight: 200;
    margin-bottom: -30px !important;
    text-wrap: nowrap;
    opacity: 0.2;
    z-index: 0;
  }
</style>