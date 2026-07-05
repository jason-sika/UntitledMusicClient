<!-- src/routes/app/+layout.svelte -->
<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import "../app.css";
  let { children } = $props();
</script>

{@render children()}
<div class="flowbox">
  <p>
    this was not meant for mobile. please use a desktop. If you're a desktop
    user, please make your browser window larger.
  </p>
</div>

<style>
  .flowbox {
    display: none;
  }

  .flowbox p {
    display: none;
  }

  @media (max-width: 810px) {
    .flowbox {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      background-color: #ffffff;
      height: 100dvh !important;
      width: 100dvw !important;
      z-index: 100;
      padding: 50px;
      animation: fadein 0.2s ease-in;
      color: black;
    }

    .flowbox p {
      display: block;
      animation: fadein 0.2s ease-in;
    }
  }

  @keyframes fadein {
    0% {
      background-color: #ffffff00;
    }
    100% {
      background-color: #ffffff;
    }
  }
</style>
