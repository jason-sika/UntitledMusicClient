<script>
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import Settings from "./Settings.svelte";
  import { presence } from "$lib/stores/presence";
  import { fade } from "svelte/transition";
  import PongModal from "./PongModal.svelte";
  import PingModal from "./PingModal.svelte";
  import { notifications as notificationsStore } from "$lib/stores/notifications";

  let notifications = $derived($notificationsStore);

  let pingAgainTarget = $state(null);

  let pongTarget = $state(null); // the notification currently being replied to

  let showSettings = $state(false);
  let user = $state(null);
  let friends = $state([]);
  let loadingFriends = $state(true);

  let activeTopTab = $state("Friends");
  let activeLibraryTab = $state("Playlists");
  let hasLoadedNotifications = $state(false);
  let sfx;
  function playNotifSound() {
    sfx.currentTime = 0;
    sfx.play().catch(() => {}); // swallow autoplay-block errors
  }

  // search state
  let query = $state("");
  let searchResults = $state([]);
  let searching = $state(false);
  let searchDebounce;
  let loadingNotifications = $state(false);
  /** @type {Record<string, "online" | "away" | "dnd" | "offline">} */
  let onlineStatus = $derived($presence);
  // --- ping/pong toast bubbles ---
  const MAX_BUBBLES = 4;
  const BUBBLE_LIFETIME_MS = 8000;
  const BUBBLE_FRESHNESS_MS = 15000; // ignore old notifications loaded in bulk (e.g. from loadNotifications)

  let bubbles = $state([]); // [{ id, notification }]
  let seenBubbleIds = new Set();
  let bubbleTimeouts = new Map();

  function isFreshNotification(n) {
    const created = n.createdAt ?? n.created_at ?? n.timestamp;
    if (!created) return true; // no timestamp field to check, don't block on it
    return Date.now() - new Date(created).getTime() < BUBBLE_FRESHNESS_MS;
  }

  function pushBubble(notification) {
    bubbles = [...bubbles, { id: notification.id, notification }];
    playNotifSound();
    if (bubbles.length > MAX_BUBBLES) {
      const [oldest, ...rest] = bubbles;
      bubbles = rest;
      dismissBubble(oldest.id, true);
    }
    const timeout = setTimeout(
      () => dismissBubble(notification.id),
      BUBBLE_LIFETIME_MS,
    );
    bubbleTimeouts.set(notification.id, timeout);
  }

  function dismissBubble(id, skipFilter = false) {
    if (!skipFilter) bubbles = bubbles.filter((b) => b.id !== id);
    const t = bubbleTimeouts.get(id);
    if (t) {
      clearTimeout(t);
      bubbleTimeouts.delete(id);
    }
  }

  $effect(() => {
    for (const n of notifications) {
      if (
        (n.type === "ping" || n.type === "pong") &&
        !seenBubbleIds.has(n.id)
      ) {
        seenBubbleIds.add(n.id);
        if (isFreshNotification(n)) pushBubble(n);
      }
    }
  });
  const unreadCount = $derived(notifications.filter((n) => !n.read).length);

  const ACTIONABLE_TYPES = new Set(["friend_request", "ping", "pong"]);

  const notificationIcons = {
    friend_request: "/images/notifications/friendrequest.png",
    friend_removal: "/images/notifications/friendremoval.png",
    friend_declined: "/images/notifications/friendremoval.png",
    account_created: "/images/notifications/accountcreated.png",
    tag_assigned: "/images/notifications/tagassigned.png",
    ping: "/images/notifications/ping.png", // your own asset
    pong: "/images/notifications/pong.png", // your own asset
  };

  const statusIcons = {
    online: "/images/status/online.png",
    away: "/images/status/away.png",
    dnd: "/images/status/dnd.png",
    offline: "/images/status/offline.png",
  };

  const MAX_PING_LENGTH = 240;

  /** @param {{ userId?: string, id?: string } | null | undefined} person */
  function presenceUserId(person) {
    return person?.userId ?? person?.id ?? null;
  }

  /**
   * @param {{ userId?: string, id?: string, status?: string } | null | undefined} person
   * @returns {"online" | "away" | "dnd" | "offline"}
   */
  function presenceStatus(person) {
    const userId = presenceUserId(person);
    const status = (userId && onlineStatus[userId]) || person?.status;
    if (
      status === "online" ||
      status === "away" ||
      status === "dnd" ||
      status === "offline"
    ) {
      return status;
    }
    return "offline";
  }

  /** @param {{ userId?: string, id?: string } | null | undefined} person */
  function watchPresence(person) {
    const userId = presenceUserId(person);
    if (userId) presence.watch(userId);
  }

  /** @param {{ userId?: string, id?: string } | null | undefined} person */
  function unwatchPresence(person) {
    const userId = presenceUserId(person);
    if (userId) presence.unwatch(userId);
  }

  function isActionable(notification) {
    return (
      ACTIONABLE_TYPES.has(notification.type) && notification.data?.friendshipId
    );
  }

  function scrollTabToStart(e) {
    e.currentTarget.scrollIntoView({
      inline: "start",
      block: "nearest",
      behavior: "smooth",
    });
  }

  // separate effect: mark read shortly after viewing, so the badge doesn't vanish instantly
  $effect(() => {
    if (activeTopTab === "Notification" && notifications.some((n) => !n.read)) {
      const timeout = setTimeout(markAllRead, 1000);
      return () => clearTimeout(timeout);
    }
  });

  function userprofile(username) {
    if (username) {
      goto(`/app/${username}`);
    }
  }

  function handleFindInput() {
    clearTimeout(searchDebounce);

    if (!query.startsWith("@")) {
      searchResults = [];
      return;
    }

    const term = query.slice(1).trim();
    if (term.length < 1) {
      searchResults = [];
      return;
    }

    searchDebounce = setTimeout(() => runFind(term), 200);
  }

  async function runFind(term) {
    searching = true;
    try {
      const res = await fetch(
        `https://backend.umc.jasonsika.com/api/search/users?q=${encodeURIComponent(term)}`,
        { credentials: "include" },
      );
      const data = await res.json();
      const newResults = data.users || [];

      // unwatch whoever was previously shown, watch the new batch
      searchResults.forEach(unwatchPresence);
      newResults.forEach(watchPresence);

      searchResults = newResults;
    } catch {
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  $effect(() => {
    if (
      activeTopTab === "Notification" &&
      !hasLoadedNotifications &&
      !loadingNotifications
    ) {
      loadNotifications();
    }
  });

  async function handleNotificationClick(notification) {
    if (isActionable(notification)) {
      markNotificationRead(notification);
      return;
    }
    notificationsStore.remove(notification.id);
    try {
      await fetch(
        `https://backend.umc.jasonsika.com/api/notifications/${notification.id}`,
        { method: "DELETE", credentials: "include" },
      );
    } catch {}
  }

  async function respondToRequest(notification, accept) {
    const friendshipId = notification.data?.friendshipId;
    if (!friendshipId) return;

    const endpoint = accept ? "friends/accept" : "friends/remove";

    try {
      const res = await fetch(
        `https://backend.umc.jasonsika.com/api/${endpoint}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendshipId }),
        },
      );
      if (res.ok) {
        notificationsStore.remove(notification.id);
        if (accept) {
          const friendsRes = await fetch(
            "https://backend.umc.jasonsika.com/api/friends",
            { credentials: "include" },
          );
          const data = await friendsRes.json();
          const newFriends = data?.friends ?? [];
          newFriends.forEach(watchPresence);
          friends = newFriends;
        }
      }
    } catch {
      // could add a toast here
    }
  }

  async function markPingRead(notification) {
    const pingId = notification.data?.pingId;
    if (!pingId) return;
    notificationsStore.remove(notification.id);
    try {
      await fetch(`https://backend.umc.jasonsika.com/api/ping/${pingId}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {}
  }

  function handlePongSent(notification) {
    notificationsStore.remove(notification.id);
  }

  async function dismissNotification(e, notification) {
    e.stopPropagation();
    notificationsStore.remove(notification.id);
    try {
      await fetch(
        `https://backend.umc.jasonsika.com/api/notifications/${notification.id}`,
        { method: "DELETE", credentials: "include" },
      );
    } catch {}
  }

  async function clearAllNotifications() {
    if (notifications.length === 0) return;
    const previous = notifications;
    notificationsStore.clear();
    try {
      await fetch("https://backend.umc.jasonsika.com/api/notifications", {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      notificationsStore.setAll(previous);
    }
  }

  async function markNotificationRead(notification) {
    if (notification.read) return;
    notificationsStore.markRead(notification.id);
    try {
      await fetch(
        `https://backend.umc.jasonsika.com/api/notifications/${notification.id}`,
        { method: "PATCH", credentials: "include" },
      );
    } catch {}
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    unread.forEach((n) => notificationsStore.markRead(n.id));
    await Promise.all(
      unread.map((n) =>
        fetch(`https://backend.umc.jasonsika.com/api/notifications/${n.id}`, {
          method: "PATCH",
          credentials: "include",
        }),
      ),
    );
  }

  async function loadNotifications() {
    loadingNotifications = true;
    try {
      const res = await fetch(
        "https://backend.umc.jasonsika.com/api/notifications",
        { credentials: "include" },
      );
      const data = await res.json();
      notificationsStore.setAll(data?.notifications ?? []);
    } catch {
      notificationsStore.setAll([]);
    } finally {
      loadingNotifications = false;
      hasLoadedNotifications = true;
    }
  }

  function selectFindResult(username) {
    query = "";
    searchResults = [];
    userprofile(username);
  }

  onMount(async () => {
    presence.connect();

    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/me", {
        credentials: "include",
      });
      const data = await res.json();
      user = data?.user ?? null;
    } catch {
      user = null;
    }

    try {
      const res = await fetch("https://backend.umc.jasonsika.com/api/friends", {
        credentials: "include",
      });
      const data = await res.json();
      friends = data?.friends ?? [];
      friends.forEach(watchPresence);
    } catch {
      friends = [];
    } finally {
      loadingFriends = false;
    }
  });

  onDestroy(() => {
    friends.forEach(unwatchPresence);
    searchResults.forEach(unwatchPresence);
    presence.disconnect();
    bubbleTimeouts.forEach(clearTimeout);
  });
</script>

{#if showSettings}
  <Settings
    onClose={() => (showSettings = false)}
    currentDisplayname={user?.displayname ?? ""}
    currentUsername={user ? `@${user.username}` : "@"}
    {user}
  />
{/if}

{#if pongTarget}
  <PongModal
    onClose={() => (pongTarget = null)}
    onSent={() => handlePongSent(pongTarget)}
    pingId={pongTarget.data?.pingId}
    senderUsername={pongTarget.actorUsername}
  />
{/if}

{#if pingAgainTarget}
  <PingModal
    onClose={() => (pingAgainTarget = null)}
    targetUsername={pingAgainTarget.actorUsername}
    targetDisplayname={pingAgainTarget.actorUsername}
  />
{/if}
<audio
  bind:this={sfx}
  src="/sounds/notification.wav"
  preload="auto"
  style="display: none;"
></audio>
<div class="sidebarShell">
  <div class="topTabView rim">
    <div
      class="topTabSwitch"
      onwheel={(e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          e.currentTarget.scrollLeft += e.deltaY;
        }
      }}
    >
      {#if bubbles.length > 0}
        <div class="bubbleStack">
          {#each bubbles as item (item.id)}
            <div class="bubbleWrapper" out:fade={{ duration: 200 }}>
              <div class="bubbleCard rim">
                <button
                  class="bubbleDismissBtn"
                  onclick={() => dismissBubble(item.id)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
                <div class="bubbleProfileRow">
                  <div class="bubblePfpWrap rim">
                    <img
                      class="bubblePfp"
                      src={item.notification.actorPfp || "/images/plhd.png"}
                      alt="Profile picture"
                    />
                  </div>
                  <div class="bubbleText">
                    <h1 class="bubbleName">
                      {item.notification.actorUsername ?? "Someone"}
                    </h1>
                    <p class="bubbleSubtitle">
                      {item.notification.type === "ping"
                        ? "sent you a ping"
                        : "ponged you back"}
                    </p>
                  </div>
                </div>
                {#if item.notification.subtitle}
                  <p class="bubbleMessage">{item.notification.subtitle}</p>
                {/if}
                <div class="bubbleActions">
                  {#if item.notification.type === "ping"}
                    <button
                      onclick={() => {
                        pongTarget = item.notification;
                        dismissBubble(item.id);
                      }}
                    >
                      Pong
                    </button>
                  {:else if item.notification.type === "pong"}
                    <button
                      onclick={() => {
                        pingAgainTarget = item.notification;
                        dismissBubble(item.id);
                      }}
                    >
                      Ping again
                    </button>
                  {/if}
                </div>
              </div>
              <div class="bubbleSquare rim"></div>
            </div>
          {/each}
        </div>
      {/if}
      <button
        class="topTab"
        class:topTabActive={activeTopTab === "Friends"}
        onclick={(e) => {
          activeTopTab = "Friends";
          scrollTabToStart(e);
        }}>Friends</button
      >

      <button
        class="topTab"
        class:topTabActive={activeTopTab === "Notification"}
        class:topTabUnread={unreadCount > 0}
        onclick={(e) => {
          activeTopTab = "Notification";
          scrollTabToStart(e);
        }}
      >
        Notification{#if unreadCount > 0}<span class="topTabUnreadDot"
          ></span>{/if}
      </button>

      <button
        class="topTab"
        class:topTabActive={activeTopTab === "Find"}
        onclick={(e) => {
          activeTopTab = "Find";
          scrollTabToStart(e);
        }}>Find</button
      >
    </div>

    {#if activeTopTab === "Friends"}
      <div class="friendsList">
        {#if loadingFriends}
          <p class="friendsEmptyState">Loading friends...</p>
        {:else if friends.length === 0}
          <p class="friendsEmptyState">No friends yet.</p>
        {:else}
          {#each friends as friend}
            <div class="friendRow" onclick={() => userprofile(friend.username)}>
              <div class="friendPfpWrap rim">
                <img
                  class="friendPfp rim"
                  src={friend.pfpUrl || "/images/plhd.png"}
                  alt="Profile picture"
                />
                <img
                  class="friendStatusIcon"
                  src={statusIcons[presenceStatus(friend)]}
                  alt=""
                />
              </div>
              <div class="friendText">
                <h1 class="friendName">{friend.displayname}</h1>
                <p class="friendSubtitle">@{friend.username}</p>
              </div>
            </div>
          {/each}
        {/if}
        <div class="friendsFade"></div>
      </div>
    {:else if activeTopTab === "Find"}
      <div class="searchPanel">
        <div class="searchInputWrap">
          <input
            type="text"
            placeholder="@username..."
            bind:value={query}
            oninput={handleFindInput}
          />
        </div>

        <div class="searchResultsList">
          {#if !query.startsWith("@")}
            <p class="searchEmptyState"></p>
          {:else if query.slice(1).trim().length < 1}
            <p class="searchEmptyState">Type a name after @</p>
          {:else if searching}
            <p class="searchEmptyState">Finding...</p>
          {:else if searchResults.length === 0}
            <p class="searchEmptyState">No users found.</p>
          {:else}
            {#each searchResults as result}
              <div
                class="searchResultCard"
                onclick={() => selectFindResult(result.username)}
              >
                {#if result.bannerUrl}
                  <img
                    class="searchBanner"
                    src={result.bannerUrl}
                    alt="Profile Banner"
                  />
                {/if}
                <div class="searchRow">
                  <div class="searchPfpWrap rim">
                    <img
                      class="searchPfp rim"
                      src={result.pfpUrl || "/images/plhd.png"}
                      alt="Profile picture"
                    />
                    <img
                      class="searchStatusIcon"
                      src={statusIcons[presenceStatus(result)]}
                      alt=""
                    />
                  </div>
                  <div class="searchText">
                    <h1 class="searchName">{result.displayname}</h1>
                    <p class="searchSubtitle">@{result.username}</p>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
        <div class="searchFade"></div>
      </div>
    {:else if activeTopTab === "Notification"}
      <div class="notifPanel">
        <div class="notifList">
          {#if loadingNotifications}
            <p class="notifEmptyState">Loading...</p>
          {:else if notifications.length === 0}
            <p class="notifEmptyState">No notifications yet.</p>
          {:else}
            {#each notifications as notification}
              <div
                class="notifCard"
                class:notifCardUnread={!notification.read}
                onclick={() => handleNotificationClick(notification)}
              >
                <button
                  class="notifDismissBtn"
                  onclick={(e) => dismissNotification(e, notification)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
                <div class="notifCardBody">
                  <div class="notifRow">
                    <div class="notifTypeIconWrap">
                      <img
                        class="notifTypeIcon"
                        src={notificationIcons[notification.type] ||
                          "/images/plhd.png"}
                        alt=""
                      />
                    </div>
                    {#if notification.actorPfp || notification.actorUsername}
                      <div class="notifActorPfpWrap rim">
                        <img
                          class="notifActorPfp rim"
                          src={notification.actorPfp || "/images/plhd.png"}
                          alt=""
                        />
                      </div>
                    {/if}
                    <div class="notifText">
                      <h1 class="notifTitle">{notification.title}</h1>
                      <p class="notifSubtitle">{notification.subtitle}</p>
                    </div>
                    {#if !notification.read}
                      <span class="notifRowUnreadDot"></span>
                    {/if}
                  </div>
                </div>
                {#if notification.type === "friend_request" && notification.data?.friendshipId}
                  <div class="notifActionsRow">
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        respondToRequest(notification, true);
                      }}
                    >
                      Accept
                    </button>
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        respondToRequest(notification, false);
                      }}
                    >
                      Decline
                    </button>
                  </div>
                {:else if notification.type === "ping"}
                  <div
                    class="notifActionsRow"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <button onclick={() => (pongTarget = notification)}
                      >Pong</button
                    >
                  </div>
                {:else if notification.type === "pong"}
                  <div
                    class="notifActionsRow"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <button onclick={() => (pingAgainTarget = notification)}
                      >Ping again</button
                    >
                    <button onclick={() => markPingRead(notification)}
                      >Mark as read</button
                    >
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>

        {#if notifications.length > 0}
          <div class="notifFade">
            <button class="notifClearAllBtn" onclick={clearAllNotifications}>
              Clear all
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="acctBar rim">
    <div class="acctRow">
      <div class="acctPfpWrap rim">
        <img
          class="acctPfp"
          src={user?.pfpUrl || "/images/plhd.png"}
          alt="Profile picture"
          onclick={() => userprofile(user?.username)}
          style="cursor: pointer;"
        />
      </div>
      <div
        class="acctText"
        onclick={() => userprofile(user?.username)}
        style="cursor: pointer;"
      >
        <h1 class="acctName">{user?.displayname ?? "Loading..."}</h1>
        <p class="acctSubtitle">
          {user ? `@${user.username}` : ""}
        </p>
      </div>
      <button class="acctSettingsBtn" onclick={() => (showSettings = true)}>
        <img
          class="acctSettingsIcon"
          src="/images/settings.png"
          alt=""
        /></button
      >
      <button class="acctStatusSelect">
        <img
          class="acctStatusIcon"
          src={statusIcons[user?.status ?? "online"]}
          alt=""
        />
        <select
          onchange={(e) => presence.setStatus(e.target.value)}
          value={user?.status ?? "online"}
        >
          <option value="online">Online</option>
          <option value="away">Away</option>
          <option value="dnd">Do Not Disturb</option>
        </select>
      </button>
    </div>
  </div>
</div>

<style>
  /* ============================================================
     LAYOUT — SIDEBAR SHELL
     ============================================================ */
  .sidebarShell {
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

  /* ============================================================
     ACCOUNT BAR ("you" bar at the top)
     ============================================================ */
  .acctBar {
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    padding-inline: 20px;
    padding-block: 15px;
    background: linear-gradient(to bottom, #ffffff, #eeeeee);
    height: 80px;
    width: 100%;
  }

  .acctRow {
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    width: 100%;
    gap: 10px;
  }

  .acctRow .acctText:hover ~ .acctSettingsBtn {
    pointer-events: none;
    opacity: 0 !important;
    width: 0px !important;
    overflow: hidden;
    display: none;
  }

  .acctPfpWrap {
    position: relative;
  }

  .acctPfp {
    width: 35px;
    height: 35px;
    object-fit: cover;
    background-color: white;
  }

  .acctText {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    flex: 1;
    height: auto;
    overflow: hidden;
    position: relative;
    transition: all 1s ease;
    z-index: 1;
  }

  .acctText:hover {
    position: relative;
    width: 100%;
    height: fit-content;
    display: flex;
    flex-direction: column;
    justify-content: center;
    transition: all 1s ease;
    padding-right: 20px;
    z-index: 2;
  }

  .acctName {
    font-size: 15px;
    font-weight: 500;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .acctSubtitle {
    font-size: 13px;
    font-weight: 400;
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .acctSettingsBtn {
    font-size: 12px;
    padding: 5px 5px;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    display: flex;
    pointer-events: all;
    opacity: 1 !important;
  }

  .acctStatusSelect {
    position: relative;
    font-size: 12px;
    padding: 5px 5px;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    display: flex;
    pointer-events: all;
    opacity: 1 !important;
  }

  .acctStatusSelect select {
    all: unset;
    position: absolute;
    height: 100%;
    width: 100% !important;
    opacity: 0;
    cursor: pointer;
  }

  .acctSettingsIcon,
  .acctStatusIcon {
    position: relative;
    width: 20px;
    height: 20px;
    z-index: 20;
    pointer-events: none;
    filter: drop-shadow(0px 1px 5px #00000070);
  }

  /* ============================================================
     PING/PONG TOAST BUBBLES
     ============================================================ */
  .bubbleStack {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 10px;
    left: 265px;
    top: 10px;
    margin-left: 20px !important;
    z-index: 100;
  }

  .bubbleWrapper {
    position: relative;
    display: flex;
    flex-direction: row;
    gap: 5px;
    animation: bubblepop 1s
      linear(
        0,
        0.002 0.3%,
        0.01 0.7%,
        0.02 1%,
        0.038 1.4%,
        0.089 2.2%,
        0.157 3%,
        0.315 4.5%,
        0.663 7.4%,
        0.798 8.6%,
        0.92 9.8%,
        1.023 11%,
        1.106 12.2%,
        1.139 12.8%,
        1.167 13.4%,
        1.19 14%,
        1.208 14.6%,
        1.221 15.2%,
        1.231 15.9%,
        1.235 16.6%,
        1.234 17.3%,
        1.227 18.1%,
        1.216 18.9%,
        1.2 19.7%,
        1.179 20.6%,
        1.055 25.1%,
        1.028 26.2%,
        1.004 27.3%,
        0.981 28.6%,
        0.964 29.9%,
        0.952 31.2%,
        0.946 32.5%,
        0.945 34%,
        0.949 35.7%,
        0.959 37.5%,
        0.986 41.8%,
        0.999 44%,
        1.008 46.5%,
        1.012 49.1%,
        1.012 52.5%,
        1 60.7%,
        0.997 65.5%,
        1.001 81.8%,
        1
      );
  }

  @keyframes bubblepop {
    0% {
      transform-origin: 0% 20%;
      transform: scale(0.2);
      opacity: 0.2;
    }
    100% {
      transform-origin: 0% 20%;
      transform: scale(1);
      opacity: 1;
    }
  }

  .bubbleCard {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 265px;
    padding: 10px;
    z-index: 100;
    background: linear-gradient(to bottom, #ffffff, #eeeeee);
  }

  .bubbleCard p {
    z-index: 21;
  }

  .bubbleSquare {
    position: absolute;
    top: 20px;
    left: -10px;
    width: 20px;
    height: 20px;
    z-index: 99;
    transform: rotate(45deg);
    background: linear-gradient(to bottom, #ffffff, #eeeeee);
  }

  .bubbleProfileRow {
    display: flex;
    flex-direction: row;
    gap: 5px;
  }

  .bubblePfpWrap {
    position: relative;
  }

  .bubblePfp {
    width: 35px;
    height: 35px;
    object-fit: cover;
    background-color: white;
  }

  .bubbleText {
    display: flex;
    flex-direction: column;
  }

  .bubbleName {
    font-size: 15px;
    font-weight: 500;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .bubbleSubtitle {
    font-size: 13px;
    font-weight: 400;
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .bubbleDismissBtn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    line-height: 1;
    opacity: 0.3;
    background: none;
    border-radius: 50%;
    z-index: 2;
  }

  .bubbleDismissBtn:hover {
    opacity: 0.8;
    background: #00000010;
  }

  .bubbleMessage {
    font-size: 13px;
    opacity: 0.7;
    margin: 0;
  }

  .bubbleActions {
    display: flex;
    gap: 8px;
  }

  .bubbleActions button {
    font-size: 12px;
    font-weight: 500;
    padding: 5px 8px;
    border: none;
    cursor: pointer;
    background: #2b6cb0;
    color: white;
    transition: opacity 0.15s ease;
  }

  .bubbleActions button:hover {
    opacity: 0.85;
  }

  /* ============================================================
     TOP TAB SWITCHER (Friends/Notification/Find)
     ============================================================ */
  .topTabView {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
    gap: 0px;
    height: 100% !important;
    width: 100%;
  }

  .topTabSwitch {
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 80px !important;
    padding: 20px 20px 10px 20px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .topTab {
    all: unset;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    width: fit-content;
    font-family: "InterVariable", sans-serif !important;
    font-size: 24px;
    font-weight: 300;
    opacity: 0.2;
    cursor: pointer;
    transition: opacity 0.15s ease;
    scroll-margin-inline: 20px;
  }

  .topTabActive {
    opacity: 0.7;
  }

  .topTabUnread {
    color: #e33 !important;
  }

  .topTabUnreadDot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #e33;
    margin-left: 4px;
    vertical-align: middle;
  }

  /* ============================================================
     FRIENDS TAB
     ============================================================ */
  .friendsList {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 4px;
    padding: 1px 0px 20px 0px;
    overflow-y: auto;
  }

  .friendRow {
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    padding-inline: 20px;
    padding-block: 5px;
    background: none !important;
    gap: 10px;
    height: fit-content;
    width: 100%;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .friendRow:hover {
    background: #00000010;
  }

  .friendPfpWrap {
    display: flex;
    flex-direction: row;
    position: relative;
    width: 35px;
    height: 35px;
  }

  .friendPfp {
    width: 35px;
    height: 35px;
    object-fit: cover;
    background-color: white;
  }

  .friendStatusIcon {
    position: absolute;
    bottom: -4px;
    right: -6px;
    width: 15px;
    height: 15px;
    z-index: 20;
  }

  .friendText {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .friendName {
    font-size: 14px;
    font-weight: 500;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .friendSubtitle {
    font-size: 11px;
    font-weight: 400;
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .friendsFade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 60px;
    pointer-events: none;
    -webkit-mask-image: linear-gradient(to top, black, transparent);
    mask-image: linear-gradient(to top, black, transparent);
    -webkit-backdrop-filter: blur(50px);
    backdrop-filter: blur(50px);
    filter: saturate(3) brightness(1.5);
    z-index: 20;
  }

  .friendsEmptyState {
    font-size: 12px;
    opacity: 0.4;
    padding: 10px;
    text-align: center;
  }

  /* ============================================================
     SEARCH / FIND TAB
     ============================================================ */
  .searchPanel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 0px;
    padding: 1px 0px 0px 0px;
    overflow-y: auto;
    background: white;
  }

  .searchInputWrap {
    width: 100%;
    padding-inline: 20px;
    background: none !important;
  }

  .searchInputWrap input {
    all: unset;
    width: 100%;
  }

  .searchResultsList {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0px;
    overflow-y: auto;
    flex: 1;
  }

  .searchResultCard {
    display: flex;
    flex-direction: column;
    justify-content: center;
    cursor: pointer;
    padding-top: 20px;
    background: white;
  }

  .searchBanner {
    margin-inline: 20px;
    margin-block: -20px;
    height: 40px !important;
    object-fit: cover;
  }

  .searchRow {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 10px 30px;
    cursor: pointer;
    transition: background 0.15s ease;
    background: none !important;
    height: fit-content;
  }

  .searchPfpWrap {
    position: relative;
  }

  .searchPfp {
    width: 35px;
    height: 35px;
    object-fit: cover;
    outline: 3px solid white;
    background-color: #efefef;
  }

  .searchStatusIcon {
    position: absolute;
    bottom: -4px;
    right: -6px;
    width: 15px;
    height: 15px;
    z-index: 20;
  }

  .searchText {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    font-size: 15px;
  }

  .searchName,
  .searchSubtitle {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-shadow:
      0px 0px 5px rgb(255, 255, 255),
      0px 0px 5px rgb(255, 255, 255),
      0px 0px 5px rgb(255, 255, 255),
      0px 0px 5px rgb(255, 255, 255),
      0px 0px 5px rgb(255, 255, 255),
      0px 0px 5px rgb(255, 255, 255);
    color: #00000070;
    opacity: 1 !important;
  }

  .searchName {
    font-weight: 500;
  }

  .searchSubtitle {
    font-weight: 400;
  }

  .searchFade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 60px;
    pointer-events: none;
    -webkit-mask-image: linear-gradient(to top, black, transparent);
    mask-image: linear-gradient(to top, black, transparent);
    -webkit-backdrop-filter: blur(50px);
    backdrop-filter: blur(50px);
    filter: saturate(3) brightness(1.5);
    z-index: 20;
  }

  .searchEmptyState {
    font-size: 12px;
    opacity: 0.4;
    padding: 10px;
    text-align: center;
  }

  /* ============================================================
     NOTIFICATION TAB
     ============================================================ */
  .notifPanel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 4px;
    padding: 1px 0px 0px 0px;
    overflow-y: auto;
  }

  .notifList {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 0px;
    padding: 1px 0px 60px 0px;
    overflow-y: auto;
  }

  .notifFade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 60px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 0 10px 10px 10px;
    box-sizing: border-box;
    -webkit-mask-image: linear-gradient(to top, black, transparent);
    mask-image: linear-gradient(to top, black, transparent);
    -webkit-backdrop-filter: blur(50px);
    backdrop-filter: blur(50px);
    filter: saturate(3) brightness(1.5);
    pointer-events: none;
    z-index: 20;
  }

  .notifClearAllBtn {
    pointer-events: all;
    font-size: 12px;
    opacity: 0.7;
    padding: 4px 8px;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .notifClearAllBtn:hover {
    opacity: 1;
  }

  .notifCard {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: fit-content !important;
    background: linear-gradient(to bottom, #ffffff, #eeeeee);
    cursor: pointer;
    transition: background 0.15s ease;
    z-index: 1;
  }

  .notifCard:hover {
    background: #00000010;
  }

  .notifCardUnread {
    background: linear-gradient(to bottom, #fff9f0, #fef3e2);
  }

  .notifCardUnread:hover {
    background: #f5e6cc;
  }

  .notifCardBody {
    overflow: hidden;
    border-radius: inherit;
  }

  .notifDismissBtn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    line-height: 1;
    opacity: 0.3;
    background: none;
    border-radius: 50%;
    z-index: 2;
  }

  .notifDismissBtn:hover {
    opacity: 0.8;
    background: #00000010;
  }

  .notifRow {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 12px 15px;
    gap: 10px;
  }

  .notifTypeIconWrap {
    display: flex;
    flex-direction: column;
    padding: 0;
    position: absolute;
    top: -7px;
    right: -7px;
    height: 50px;
    width: 50px;
    flex-shrink: 0;
    mask-image: linear-gradient(
      to bottom,
      black 0%,
      black 10%,
      transparent 90%
    );
  }

  .notifTypeIcon {
    height: 50px;
    width: 50px;
    background: none;
  }

  .notifActorPfpWrap {
    display: flex;
    flex-direction: column;
    padding: 0;
    position: relative;
    height: fit-content;
    flex-shrink: 0;
  }

  .notifActorPfp {
    width: 35px;
    height: 35px;
    object-fit: cover;
    background-color: white;
  }

  .notifText {
    display: block;
    width: 100%;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .notifTitle {
    font-size: 15px;
    font-weight: 500;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    max-width: 100%;
  }

  .notifSubtitle {
    font-size: 13px;
    font-weight: 400;
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .notifRowUnreadDot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #e33;
    margin-left: auto;
  }

  .notifActionsRow {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 10px 15px 10px 15px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .notifActionsRow button {
    flex: 1 1 0;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    padding: 6px 10px;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s ease;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }

  .notifActionsRow button:first-child {
    background: #2b6cb0;
    color: white;
  }

  .notifActionsRow button:last-child {
    background: #00000010;
    color: #000;
  }

  .notifActionsRow button:hover {
    opacity: 0.85;
  }

  .notifEmptyState {
    font-size: 12px;
    opacity: 0.4;
    padding: 10px;
    text-align: center;
  }
</style>
