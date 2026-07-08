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

<div class="sidebar">
  <div class="tabview online rim">
    <div
      class="tabswitch"
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
              <div class="bubble rim">
                <button
                  class="bubble-dismiss"
                  onclick={() => dismissBubble(item.id)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
                <div class="bubbleProfile">
                  <div class="profilePicture rim">
                    <img
                      class="profilePicture"
                      src={item.notification.actorPfp || "/images/plhd.png"}
                      alt="Profile picture"
                    />
                  </div>
                  <div class="text">
                    <h1 class="Name">
                      {item.notification.actorUsername ?? "Someone"}
                    </h1>
                    <p class="subtitle">
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
        class="tab"
        class:active={activeTopTab === "Friends"}
        onclick={(e) => {
          activeTopTab = "Friends";
          scrollTabToStart(e);
        }}>Friends</button
      >

      <button
        class="tab"
        class:active={activeTopTab === "Notification"}
        class:unreadTab={unreadCount > 0}
        onclick={(e) => {
          activeTopTab = "Notification";
          scrollTabToStart(e);
        }}
      >
        Notification{#if unreadCount > 0}<span class="unread-dot"></span>{/if}
      </button>

      <button
        class="tab"
        class:active={activeTopTab === "Find"}
        onclick={(e) => {
          activeTopTab = "Find";
          scrollTabToStart(e);
        }}>Find</button
      >
    </div>

    {#if activeTopTab === "Friends"}
      <div class="friends">
        {#if loadingFriends}
          <p class="empty-state">Loading friends...</p>
        {:else if friends.length === 0}
          <p class="empty-state">No friends yet.</p>
        {:else}
          {#each friends as friend}
            <div
              class="friend you"
              onclick={() => userprofile(friend.username)}
            >
              <div class="profilePicture rim" style="position: relative;">
                <img
                  class="profilePicture rim"
                  src={friend.pfpUrl || "/images/plhd.png"}
                  alt="Profile picture"
                />
                <img
                  class="status-icon"
                  src={statusIcons[presenceStatus(friend)]}
                  alt=""
                />
              </div>
              <div class="text notiftext">
                <h1 class="Name">{friend.displayname}</h1>
                <p class="subtitle subtitle">@{friend.username}</p>
              </div>
            </div>
          {/each}
        {/if}
        <div class="clear-all-fade"></div>
      </div>
    {:else if activeTopTab === "Find"}
      <div class="searchtab">
        <div class="formInput searchinput">
          <input
            type="text"
            placeholder="@username..."
            bind:value={query}
            oninput={handleFindInput}
          />
        </div>

        <div class="searchresults">
          {#if !query.startsWith("@")}
            <p class="empty-state"></p>
          {:else if query.slice(1).trim().length < 1}
            <p class="empty-state">Type a name after @</p>
          {:else if searching}
            <p class="empty-state">Finding...</p>
          {:else if searchResults.length === 0}
            <p class="empty-state">No users found.</p>
          {:else}
            {#each searchResults as result}
              <div
                class="stackV"
                onclick={() => selectFindResult(result.username)}
              >
                {#if result.bannerUrl}
                  <img
                    class="profileBanner"
                    src={result.bannerUrl}
                    alt="Profile Banner"
                  />
                {/if}
                <div class="someone you">
                  <div class="profilePicture rim" style="position: relative;">
                    <img
                      class="profilePicture rim"
                      src={result.pfpUrl || "/images/plhd.png"}
                      alt="Profile picture"
                    />
                    <img
                      class="status-icon"
                      src={statusIcons[presenceStatus(result)]}
                      alt=""
                    />
                  </div>
                  <div class="text notiftext">
                    <h1 class="Name">{result.displayname}</h1>
                    <p class="subtitle subtitle">@{result.username}</p>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
        <div class="clear-all-fade"></div>
      </div>
    {:else if activeTopTab === "Notification"}
      <div class="feed">
        <div class="list">
          {#if loadingNotifications}
            <p class="empty-state">Loading...</p>
          {:else if notifications.length === 0}
            <p class="empty-state">No notifications yet.</p>
          {:else}
            {#each notifications as notification}
              <div
                class="notification rim"
                class:unread={!notification.read}
                onclick={() => handleNotificationClick(notification)}
              >
                <button
                  class="dismiss-btn"
                  onclick={(e) => dismissNotification(e, notification)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
                <div class="notifBody">
                  <div class="stackH">
                    <div class="notification_image">
                      <img
                        class="profilePicture"
                        src={notificationIcons[notification.type] ||
                          "/images/plhd.png"}
                        alt=""
                      />
                    </div>
                    {#if notification.actorPfp || notification.actorUsername}
                      <div class="altuser_image rim">
                        <img
                          class="profilePicture rim"
                          src={notification.actorPfp || "/images/plhd.png"}
                          alt=""
                        />
                      </div>
                    {/if}
                    <div class="text notiftext">
                      <h1 class="Title">{notification.title}</h1>
                      <p class="subtitle">{notification.subtitle}</p>
                    </div>
                    {#if !notification.read}
                      <span class="unread-dot"></span>
                    {/if}
                  </div>
                </div>
                {#if notification.type === "friend_request" && notification.data?.friendshipId}
                  <div class="notifActions">
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
                    class="notifActions"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <button onclick={() => (pongTarget = notification)}
                      >Pong</button
                    >
                  </div>
                {:else if notification.type === "pong"}
                  <div
                    class="notifActions"
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
          <div class="clear-all-fade">
            <button class="clear-all" onclick={clearAllNotifications}>
              Clear all
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="tabview library rim">
    <div
      class="tabswitch"
      onwheel={(e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          e.currentTarget.scrollLeft += e.deltaY;
        }
      }}
    >
      <button
        class="tab"
        class:active={activeLibraryTab === "Playlists"}
        onclick={(e) => {
          activeLibraryTab = "Playlists";
          scrollTabToStart(e);
        }}>Playlists</button
      >

      <button
        class="tab"
        class:active={activeLibraryTab === "Albums"}
        onclick={(e) => {
          activeLibraryTab = "Albums";
          scrollTabToStart(e);
        }}>Albums</button
      >

      <button
        class="tab"
        class:active={activeLibraryTab === "Songs"}
        onclick={(e) => {
          activeLibraryTab = "Songs";
          scrollTabToStart(e);
        }}>Songs</button
      >

      <button
        class="tab"
        class:active={activeLibraryTab === "Artists"}
        onclick={(e) => {
          activeLibraryTab = "Artists";
          scrollTabToStart(e);
        }}>Artists</button
      >
    </div>

    {#if activeLibraryTab === "Playlists"}
      <div class="playlist">
        <p class="empty-state">No playlists yet.</p>
      </div>
    {:else if activeLibraryTab === "Albums"}
      <div class="playlist">
        <p class="empty-state">No albums yet.</p>
      </div>
    {:else if activeLibraryTab === "Songs"}
      <div class="playlist">
        <p class="empty-state">No songs yet.</p>
      </div>
    {:else if activeLibraryTab === "Artists"}
      <div class="playlist">
        <p class="empty-state">No artists yet.</p>
      </div>
    {/if}
  </div>
  <div class="you rim">
    <div class="accountprev">
      <div class="profilePicture rim">
        <img
          class="profilePicture"
          src={user?.pfpUrl || "/images/plhd.png"}
          alt="Profile picture"
          onclick={() => userprofile(user?.username)}
          style="cursor: pointer;"
        />
      </div>
      <div
        class="text"
        onclick={() => userprofile(user?.username)}
        style="cursor: pointer;"
      >
        <h1 class="Name">{user?.displayname ?? "Loading..."}</h1>
        <p class="subtitle">
          {user ? `@${user.username}` : ""}
        </p>
      </div>
      <button class="settings" onclick={() => (showSettings = true)}>
        <img class="status-icon2" src="/images/settings.png" alt="" /></button
      >
      <div class="select rim">
        <img
          class="status-icon2"
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
      </div>
    </div>
  </div>
</div>

<style>
  /* ============================================================
     LAYOUT — SIDEBAR SHELL
     ============================================================ */
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

  /* ============================================================
     ACCOUNT PREVIEW ("you" bar at the top)
     ============================================================ */
  .you {
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

  .accountprev {
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    width: 100%;
    gap: 10px;
  }

  .accountprev .text:hover ~ .settings {
    pointer-events: none;
    opacity: 0 !important;
    width: 0px !important;
    overflow: hidden;
    display: none;
  }

  .settings {
    font-size: 12px;
    padding: 10px 10px;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    display: flex;
    pointer-events: all;
    opacity: 1 !important;
  }

  .select {
    position: relative;
    font-size: 12px;
    padding: 10px 10px;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    display: flex;
    pointer-events: all;
    opacity: 1 !important;
    background: linear-gradient(to bottom, #ffffff70, #cecece70);
  }

  .select select {
    all: unset;
    position: absolute;
    height: 100%;
    width: 100% !important;
    opacity: 0;
    cursor: pointer;
  }

  .status-icon2 {
    position: relative;
    width: 15px;
    height: 15px;
    z-index: 20;
    pointer-events: none;
  }

  /* ============================================================
     SHARED TEXT BLOCKS (name / subtitle / hover expansion)
     used by: account preview, friend rows, search rows
     ============================================================ */
  .text {
    width: 100%;
    min-width: 0;
    flex: 1;
    height: 100%;
    overflow: hidden;
    position: relative;
    transition: all 1s ease;
    z-index: 1;
  }

  .text:hover {
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

  .Name {
    font-size: 15px;
    font-weight: 500;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .subtitle,
  .friend .Name,
  .someone .text h1 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .subtitle {
    font-size: 13px;
    font-weight: 400;
    opacity: 0.5;
  }

  .profilePicture {
    position: relative;
    width: 35px;
    height: 35px;
    object-fit: cover;
    background-color: white;
  }

  /* text variant used inside notification/friend/search rows,
     where we don't want the hover-expand behavior from .text */
  .notiftext {
    background: none !important;
    padding: 0px !important;
    width: 100%;
    min-width: 0;
    flex: 1;
    height: 100%;
    overflow: hidden;
    position: relative;
    transition: all 1s ease;
    z-index: 1;
  }

  .notiftext:hover {
    padding: 0px !important;
    height: 100%;
    display: block;
    z-index: 1;
  }

  .notiftext .Name {
    text-overflow: clip !important;
  }

  .text,
  .notiftext {
    height: auto;
  }

  .bubbleStack {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 10px;
    left: 265px;
    top: 10px;
    margin-left: 24px;
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

  .bubble {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 265px;
    padding: 10px;
    z-index: 100;
    background: linear-gradient(to bottom, #ffffff, #eeeeee);
  }

  .bubble p {
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

  .bubbleProfile {
    display: flex;
    flex-direction: row;
    gap: 5px;
  }

  .bubble-dismiss {
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

  .bubble-dismiss:hover {
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
     TABS (top-level: Library/Friends/Notification/Find,
            bottom-level: Playlists/Albums/Songs/Artists)
     ============================================================ */
  .tabview {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
    background: linear-gradient(to bottom, #ffffff70, #eeeeee70);
    gap: 0px;
    height: 45.8% !important;
    width: 100%;
  }

  .tabswitch {
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

  .tab {
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

  .tab.active {
    opacity: 0.7;
  }

  .tab::after {
    all: unset;
  }

  .tab::before {
    all: unset;
  }

  .tabcontent {
    width: 100%;
    flex: 1;
    overflow-y: auto;
  }

  /* small red dot on a tab label (e.g. "Notification") when it has unread items */
  .unread-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #e33;
    margin-left: 4px;
    vertical-align: middle;
  }

  .status-icon {
    position: absolute;
    bottom: -4px;
    right: -6px;
    width: 15px;
    height: 15px;
    z-index: 20;
  }

  /* ============================================================
     FRIENDS TAB
     ============================================================ */
  .friends {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 4px;
    padding: 1px 0px 20px 0px;
    overflow-y: auto;
  }

  .friend {
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

  .friend:hover {
    background: #00000010;
  }

  .friend .Name {
    font-size: 14px;
  }

  .friend .subtitle {
    font-size: 11px;
  }

  /* ============================================================
     SEARCH TAB
     ============================================================ */
  .searchtab {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 0px;
    padding: 1px 0px 0px 0px;
    overflow-y: auto;
    background: white;
  }

  .searchinput {
    width: 100%;
    padding-inline: 20px;
    background: none !important;
  }

  .searchinput input {
    all: unset;
    width: 100%;
  }

  .searchresults {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0px;
    overflow-y: auto;
    flex: 1;
  }

  /* result card: optional banner image stacked above the profile row */
  .stackV {
    display: flex;
    flex-direction: column;
    justify-content: center;
    cursor: pointer;
    padding-top: 20px;
    background: white;
  }

  .profileBanner {
    margin-inline: 20px;
    margin-block: -20px;
    height: 40px !important;
    object-fit: cover;
  }

  .someone {
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

  .someone .profilePicture {
    object-fit: cover;
    outline: 3px solid white;
    background-color: #efefef;
  }

  .someone .text {
    font-size: 15px;
  }

  .someone .text h1,
  .someone .text p {
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

  /* ============================================================
     FEED TAB (notifications)
     ============================================================ */
  .feed {
    position: relative; /* anchor for the fade footer */
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 4px;
    padding: 1px 0px 0px 0px;
    overflow-y: auto;
  }

  .list {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 0px;
    padding: 1px 0px 60px 0px; /* bottom padding matches fade height so last card isn't hidden behind it */
    overflow-y: auto;
  }

  .clear-all-fade {
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
    pointer-events: none; /* let scroll/clicks pass through the empty area */
    z-index: 20;
  }

  .clear-all {
    pointer-events: all; /* ...except the button itself */
    font-size: 12px;
    opacity: 0.7;
    padding: 4px 8px;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .clear-all:hover {
    opacity: 1;
  }

  .notification {
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

  .notifBody {
    overflow: hidden;
    border-radius: inherit;
  }

  .notification:hover {
    background: #00000010;
  }

  .notification.unread {
    background: linear-gradient(to bottom, #fff9f0, #fef3e2);
  }

  .notification.unread:hover {
    background: #f5e6cc;
  }

  .dismiss-btn {
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

  .dismiss-btn:hover {
    opacity: 0.8;
    background: #00000010;
  }

  .stackH {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 12px 15px;
    gap: 10px;
  }

  .notification_image,
  .altuser_image {
    display: flex;
    flex-direction: column;
    padding: 0;
    position: relative;
    height: fit-content;
    flex-shrink: 0;
  }

  .notification_image {
    height: 50px;
    width: 50px;
    position: absolute;
    top: -7px;
    right: -7px;
    mask-image: linear-gradient(
      to bottom,
      black 0%,
      black 10%,
      transparent 90%
    );
  }

  .notification_image img {
    height: 50px;
    width: 50px;
    background: none;
  }

  /* per-notification unread indicator, sits at the end of the row */
  .stackH .unread-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    margin-left: auto;
  }

  .notifActions {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 10px 15px 10px 15px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .notifActions button {
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

  .notifActions button:first-child {
    background: #2b6cb0;
    color: white;
  }

  .notifActions button:last-child {
    background: #00000010;
    color: #000;
  }

  .notifActions button:hover {
    opacity: 0.85;
  }

  .unreadTab {
    color: #e33 !important;
  }

  /* ============================================================
     LIBRARY TAB (Playlists/Albums/Songs/Artists)
     ============================================================ */
  .playlist {
    width: 100%;
    flex: 1;
    overflow-y: auto;
  }

  /* ============================================================
     SHARED — empty/loading states across all tabs
     ============================================================ */
  .empty-state {
    font-size: 12px;
    opacity: 0.4;
    padding: 10px;
    text-align: center;
  }
</style>
