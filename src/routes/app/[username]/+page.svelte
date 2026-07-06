<script>
  import { onMount, onDestroy } from "svelte";
  import Player from "$lib/components/Player.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import { presence } from "$lib/stores/presence";

  let { data } = $props();

  let statusMap = $derived($presence);
  let status = $derived(statusMap[data.user?.id] ?? "offline");

  let currentUser = $state(null);
  let requestState = $state("none");
  let friendshipId = $state(null);
  let working = $state(false);
  let loadingRelationship = $state(true);

  const isOwnProfile = $derived(currentUser?.username === data.user?.username);
  const statusIcons = {
    online: "/images/status/online.png",
    away: "/images/status/away.png",
    dnd: "/images/status/dnd.png",
    offline: "/images/status/offline.png",
  };

  // re-fetch relationship state whenever the profile we're looking at changes —
  // onMount only fires once per component instance, and SvelteKit reuses this
  // instance when navigating between /app/[username] routes
  $effect(() => {
    const targetId = data.user?.id;
    if (!targetId || data.notFound) return;

    requestState = "none";
    friendshipId = null;
    loadingRelationship = true;

    let cancelled = false;

    (async () => {
      try {
        const meRes = await fetch("https://backend.umc.jasonsika.com/api/me", {
          credentials: "include",
        });
        const meData = await meRes.json();
        if (cancelled) return;
        currentUser = meData?.user ?? null;

        if (currentUser && currentUser.username !== data.user.username) {
          const friendsRes = await fetch(
            "https://backend.umc.jasonsika.com/api/friends",
            { credentials: "include" },
          );
          const friendsData = await friendsRes.json();
          if (cancelled) return;

          const asFriend = friendsData.friends?.find(
            (f) => f.userId === targetId,
          );
          const asIncoming = friendsData.incomingRequests?.find(
            (f) => f.userId === targetId,
          );
          const asOutgoing = friendsData.outgoingRequests?.find(
            (f) => f.userId === targetId,
          );

          if (asFriend) {
            requestState = "friends";
            friendshipId = asFriend.friendshipId;
          } else if (asIncoming) {
            requestState = "incoming";
            friendshipId = asIncoming.friendshipId;
          } else if (asOutgoing) {
            requestState = "pending";
            friendshipId = asOutgoing.friendshipId;
          }
        }
      } finally {
        if (!cancelled) loadingRelationship = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  // watch this specific profile's live status; re-subscribe whenever the
  // profile being viewed changes, and unwatch the previous one automatically
  $effect(() => {
    const targetId = data.user?.id;
    if (!targetId || data.notFound) return;

    presence.watch(targetId);
    return () => presence.unwatch(targetId);
  });

  onMount(() => {
    const handler = (e) => {
      if (
        e.data?.type === "friend-removed" &&
        e.data.friendshipId === friendshipId
      ) {
        requestState = "none";
        friendshipId = null;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  });

  function openRemoveFriendPopup() {
    if (!friendshipId) return;
    const width = 420;
    const height = 320;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      `/friends/remove?id=${friendshipId}&name=${encodeURIComponent(data.user.displayname)}`,
      "remove-friend",
      `width=${width},height=${height},left=${left},top=${top}`,
    );
  }

  async function sendFriendRequest() {
    if (working) return;
    working = true;
    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/friends", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.user.username }),
      });
      if (res.ok) {
        const result = await res.json();
        requestState = "pending";
        friendshipId = result.friendshipId ?? friendshipId;
      }
    } finally {
      working = false;
    }
  }

  async function acceptRequest() {
    if (working || !friendshipId) return;
    working = true;
    try {
      const res = await fetch(
        "https://backend.umc.jasonsika.com/api/friends/accept",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendshipId }),
        },
      );
      if (res.ok) {
        requestState = "friends";
      }
    } finally {
      working = false;
    }
  }

  async function removeFriend() {
    if (working || !friendshipId) return;
    working = true;
    try {
      const res = await fetch(
        "https://backend.umc.jasonsika.com/api/friends/remove",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendshipId }),
        },
      );
      if (res.ok) {
        requestState = "none";
        friendshipId = null;
      }
    } finally {
      working = false;
    }
  }
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
          <div class="pfpwrap">
            <img
              class="pfp rim"
              src={data.user.pfpUrl || "/images/plhd.png"}
              alt="Profile picture"
            />
            <img class="status-icon" src={statusIcons[status]} alt="" />
          </div>
          <div class="info">
            <h1>{data.user.displayname}</h1>
            <p class="username">@{data.user.username}</p>
          </div>
          <div class="tags">
            {#each data.user.tags ?? [] as tag}
              <span
                class="tag"
                style={tag.color
                  ? `background: ${tag.color}20; color: ${tag.color};`
                  : ""}
              >
                {tag.label}
              </span>
            {/each}
          </div>

          {#if !loadingRelationship && !isOwnProfile}
            <div class="actions">
              {#if requestState === "friends"}
                <button class="friendbtn rim" onclick={openRemoveFriendPopup}>
                  Remove Friend
                </button>
              {:else if requestState === "pending"}
                <button class="friendbtn rim" disabled>Request Sent</button>
              {:else if requestState === "incoming"}
                <button
                  class="friendbtn rim"
                  onclick={acceptRequest}
                  disabled={working}
                >
                  {working ? "Accepting..." : "Accept Request"}
                </button>
              {:else}
                <button
                  class="friendbtn rim"
                  onclick={sendFriendRequest}
                  disabled={working}
                >
                  {working ? "Sending..." : "Add Friend"}
                </button>
              {/if}
            </div>
          {/if}
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

  .profilepage {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
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
    flex-wrap: wrap;
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

  .tags {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .tag {
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 999px;
    background: #00000010;
    color: #000000;
    white-space: nowrap;
  }

  .actions {
    margin-left: auto;
  }

  .friendbtn {
    font-size: 14px;
    padding: 8px 16px;
    cursor: pointer;
  }

  .friendbtn:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .pfpwrap {
    position: relative;
    flex-shrink: 0;
  }

  .status-icon {
    position: absolute;
    bottom: -5px;
    right: -15px;
    width: 35px;
    height: 35px;
    z-index: 20;
  }
</style>
