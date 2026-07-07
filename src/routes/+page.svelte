<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  let checked = $state(false);
  let button = $state("");

  onMount(async () => {
    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        credentials: "include",
      });

      if (!res.ok) {
        button = "Login";
        return;
      }

      const data = await res.json();

      if (!data?.user) {
        button = "Login";
      } else {
        button = "Go to App";
        checked = true;
      }
    } catch (err) {
      // network error, server down, bad JSON, etc. — fail safe to login
      button = "Login";
    }
  });
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
      <p class="desc">-Project moving to something else, stay tuned</p>
      <div class="buttonwrapper">
        <button onclick={() => goto("/app")}>{button}</button>
        <button
          onclick={() =>
            window.open(
              "https://github.com/jason-sika/UntitledMusicClient",
              "_blank",
            )}>GitHub</button
        >
      </div>
    </div>
  </div>
  <div class="side2">
    <h1>Enjoy music once again.</h1>
    <img src="/images/plhd.png" alt="umcUI" />
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
    opacity: 0;
    text-align: left;
    animation: fadeIn3 1s ease-in-out forwards;
    animation-delay: 1s;
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
    opacity: 0;
    text-align: left;
    animation: fadeIn3 1s ease-in-out forwards;
    animation-delay: 1s;
  }

  .watermark {
    display: flex;
    flex-direction: row;
    gap: 0px;
    align-items: baseline;
    opacity: 0;
    text-align: left;
    animation: fadeIn3 1s ease-in-out forwards;
    animation-delay: 1.2s;
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
    opacity: 0;
    text-align: left;
    animation: fadeIn4 1s ease-in-out forwards;
    animation-delay: 1.5s;
  }

  .buttonwrapper {
    display: flex;
    flex-direction: row;
    gap: 10px;
    opacity: 0;
    text-align: left;
    animation: fadeIn3 1s ease-in-out forwards;
    animation-delay: 1.7s;
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
    opacity: 0;
    animation: fadeIn 1s ease-in-out forwards;
    animation-delay: 1s;
  }

  @keyframes fadeIn {
    0% {
      opacity: 0;
      transform: translateY(50px);
      filter: blur(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }

  .side2 h1 {
    font-size: 5rem;
    font-weight: 200;
    margin-bottom: -30px !important;
    text-wrap: nowrap;
    opacity: 0;
    z-index: 0;
    animation: fadeIn2 1s ease-in-out forwards;
    animation-delay: 1s;
  }

  @keyframes fadeIn2 {
    0% {
      opacity: 0;
      transform: translateX(50px);
      filter: blur(10px);
    }
    100% {
      opacity: 0.2;
      transform: translateX(0);
      filter: blur(0);
    }
  }

  @keyframes fadeIn3 {
    0% {
      opacity: 0;
      transform: translateX(-50px);
      filter: blur(10px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
      filter: blur(0);
    }
  }

  @keyframes fadeIn4 {
    0% {
      opacity: 0;
      transform: translateX(-50px);
      filter: blur(10px);
    }
    100% {
      opacity: 0.7;
      transform: translateX(0);
      filter: blur(0);
    }
  }

  @media (max-width: 1170px) {
    .website {
      flex-direction: column;
      gap: 0px;
    }

    .side1,
    .side2 {
      width: 100% !important;
      height: 50dvh !important;
      align-items: center;
      justify-content: center;
    }

    .side2 {
      max-height: 50dvh !important;
      align-items: center;
      justify-content: start;
    }

    .side2 img {
      width: 150% !important;
      aspect-ratio: 16 / 9 !important;
      object-fit: cover;
    }

    .side2 h1 {
      font-size: 3rem;
      margin-block: -10px !important;
      animation-delay: 1.1s;
    }

    * {
      text-align: center !important;
      justify-content: center;
      align-items: center;
    }

    @keyframes fadeIn2 {
      0% {
        opacity: 0;
        transform: translateY(50px);
        filter: blur(10px);
      }
      100% {
        opacity: 0.2;
        transform: translateY(0);
        filter: blur(0);
      }
    }

    @keyframes fadeIn3 {
      0% {
        opacity: 0;
        transform: translateY(-50px);
        filter: blur(10px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
        filter: blur(0);
      }
    }

    @keyframes fadeIn4 {
      0% {
        opacity: 0;
        transform: translateY(-50px);
        filter: blur(10px);
      }
      100% {
        opacity: 0.7;
        transform: translateY(0);
        filter: blur(0);
      }
    }
  }
</style>
