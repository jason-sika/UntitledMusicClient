<script>
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import Settings from "./Settings.svelte";
  import { presence } from "$lib/stores/presence";

  const unreadCount = $derived(notifications.filter((n) => !n.read).length);

  let showSettings = $state(false);
  let user = $state(null);
  let friends = $state([]);
  let loadingFriends = $state(true);

  let activeTopTab = $state("Friends");
  let activeLibraryTab = $state("Playlists");

  // search state
  let query = $state("");
  let searchResults = $state([]);
  let searching = $state(false);
  let searchDebounce;
  let notifications = $state([]);
  let loadingNotifications = $state(false);
  let onlineStatus = $derived($presence);

  const ACTIONABLE_TYPES = new Set(["friend_request"]);

  const notificationIcons = {
    friend_request: "/images/notifications/friendrequest.png",
    friend_removal: "/images/notifications/friendremoval.png",
    friend_declined: "/images/notifications/friendremoval.png", // reuse until you have a dedicated asset
    account_created: "/images/notifications/accountcreated.png",
    tag_assigned: "/images/notifications/tagassigned.png",
  };

  function isActionable(notification) {
    return (
      ACTIONABLE_TYPES.has(notification.type) && notification.data?.friendshipId
    );
  }

  async function handleNotificationClick(notification) {
    if (isActionable(notification)) {
      // actionable notifications only get marked read on click —
      // Accept/Decline are what actually resolve/remove them
      markNotificationRead(notification);
      return;
    }

    // non-actionable: clicking deletes it outright
    notifications = notifications.filter((n) => n.id !== notification.id);

    try {
      await fetch(
        `https://backend.umc.jasonsika.com/api/notifications/${notification.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
    } catch {
      // could add a toast here; notification is already gone from the UI
    }
  }

  function scrollTabToStart(e) {
    e.currentTarget.scrollIntoView({
      inline: "start",
      block: "nearest",
      behavior: "smooth",
    });
  }

  async function loadNotifications() {
    loadingNotifications = true;
    try {
      const res = await fetch(
        "https://backend.umc.jasonsika.com/api/notifications",
        {
          credentials: "include",
        },
      );
      const data = await res.json();
      notifications = data?.notifications ?? [];
    } catch {
      notifications = [];
    } finally {
      loadingNotifications = false;
    }
  }

  async function markNotificationRead(notification) {
    if (notification.read) return;

    // optimistic update
    notifications = notifications.map((n) =>
      n.id === notification.id ? { ...n, read: true } : n,
    );

    try {
      await fetch(
        `https://backend.umc.jasonsika.com/api/notifications/${notification.id}`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
    } catch {
      // could add a toast here
    }
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    notifications = notifications.map((n) => ({ ...n, read: true })); // optimistic

    await Promise.all(
      unread.map((n) =>
        fetch(`https://backend.umc.jasonsika.com/api/notifications/${n.id}`, {
          method: "PATCH",
          credentials: "include",
        }),
      ),
    );
  }

  $effect(() => {
    if (
      activeTopTab === "Notification" &&
      notifications.length === 0 &&
      !loadingNotifications
    ) {
      loadNotifications();
    }
  });

  // separate effect: mark read shortly after viewing, so the badge doesn't vanish instantly
  $effect(() => {
    if (activeTopTab === "Notification" && notifications.some((n) => !n.read)) {
      const timeout = setTimeout(markAllRead, 1000);
      return () => clearTimeout(timeout);
    }
  });

  // fetch feed only the first time that tab is opened
  $effect(() => {
    if (
      activeTopTab === "Notification" &&
      notifications.length === 0 &&
      !loadingNotifications
    ) {
      loadNotifications();
    }
  });

  function userprofile(username) {
    if (username) {
      goto(`/app/${username}`);
    }
  }

  function handleSearchInput() {
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

    searchDebounce = setTimeout(() => runSearch(term), 200);
  }

  async function runSearch(term) {
    searching = true;
    try {
      const res = await fetch(
        `https://backend.umc.jasonsika.com/api/search/users?q=${encodeURIComponent(term)}`,
        { credentials: "include" },
      );
      const data = await res.json();
      searchResults = data.users || [];
    } catch {
      searchResults = [];
    } finally {
      searching = false;
    }
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
        notifications = notifications.filter((n) => n.id !== notification.id);
        if (accept) {
          const friendsRes = await fetch(
            "https://backend.umc.jasonsika.com/api/friends",
            {
              credentials: "include",
            },
          );
          const data = await friendsRes.json();
          friends = data?.friends ?? [];
        }
      }
    } catch {
      // could add a toast here
    }
  }

  function selectSearchResult(username) {
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
    } catch {
      friends = [];
    } finally {
      loadingFriends = false;
    }
  });

  onDestroy(() => {
    presence.disconnect();
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

<div class="sidebar">
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
      <button class="settings rim" onclick={() => (showSettings = true)}
        >Settings</button
      >
    </div>
  </div>

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
        onclick={(e) => {
          activeTopTab = "Notification";
          scrollTabToStart(e);
        }}
      >
        Notification{#if unreadCount > 0}<span class="unread-dot"></span>{/if}
      </button>

      <button
        class="tab"
        class:active={activeTopTab === "Search"}
        onclick={(e) => {
          activeTopTab = "Search";
          scrollTabToStart(e);
        }}>Search</button
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
                {#if onlineStatus[friend.id]}
                  <span class="online-dot"></span>
                {/if}
              </div>
              <div class="text notiftext">
                <h1 class="Name">{friend.displayname}</h1>
                <p class="subtitle subtitle">@{friend.username}</p>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    {:else if activeTopTab === "Search"}
      <div class="searchtab">
        <div class="formInput rim searchinput">
          <input
            type="text"
            placeholder="@ to find people"
            bind:value={query}
            oninput={handleSearchInput}
          />
        </div>

        <div class="searchresults rim">
          {#if !query.startsWith("@")}
            <p class="empty-state">Type @ to search for people</p>
          {:else if query.slice(1).trim().length < 1}
            <p class="empty-state">Type a name after @</p>
          {:else if searching}
            <p class="empty-state">Searching...</p>
          {:else if searchResults.length === 0}
            <p class="empty-state">No users found.</p>
          {:else}
            {#each searchResults as result}
              <div
                class="stackV"
                onclick={() => selectSearchResult(result.username)}
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
                    {#if result.online}
                      <span class="online-dot"></span>
                    {/if}
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
      </div>
    {:else if activeTopTab === "Notification"}
      <div class="feed">
        <div class="feed rim">
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
                {/if}
              </div>
            {/each}
          {/if}
        </div>
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
    padding: 5px 10px;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    display: flex;
    pointer-events: all;
    opacity: 1 !important;
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
    background: linear-gradient(to bottom, #ffffff, #eeeeee);
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

  .notiftext .Name {
    text-overflow: clip !important;
  }

  /* ============================================================
     TABS (top-level: Library/Friends/Notification/Search,
            bottom-level: Playlists/Albums/Songs/Artists)
     ============================================================ */
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

  .online-dot {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #2ecc71;
    border: 2px solid #ffffff;
  }

  .pfpwrap {
    position: relative;
    flex-shrink: 0;
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
    padding: 1px 10px 10px 10px;
    overflow-y: auto;
  }

  .friend {
    position: relative;
    display: flex;
    flex-direction: row;
    justify-content: start;
    align-items: center;
    padding-inline: 10px;
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
    padding: 1px 10px 10px 10px;
  }

  .searchinput {
    width: 100%;
  }

  .searchinput input {
    all: unset;
    width: 100%;
  }

  .searchresults {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    flex: 1;
  }

  /* result card: optional banner image stacked above the profile row */
  .stackV {
    display: flex;
    flex-direction: column;
    justify-content: center;
    cursor: pointer;
  }

  .profileBanner {
    width: 100%;
    height: 80px;
    object-fit: cover;
  }

  .someone {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 10px 10px;
    cursor: pointer;
    transition: background 0.15s ease;
    height: fit-content;
  }

  .someone .text h1 {
    font-size: 15px;
  }

  /* ============================================================
     FEED TAB (notifications)
     ============================================================ */
  .feed {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 4px;
    padding: 1px 10px 10px 10px;
    overflow-y: auto;
  }

  .notification {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    background: linear-gradient(to bottom, #ffffff, #eeeeee);
    cursor: pointer;
    transition: background 0.15s ease;
    overflow: hidden;
    z-index: 1;
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

  .stackH {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding: 12px 15px;
    gap: 10px;
  }

  .notification_image,
  .altuser_image {
    flex-shrink: 0;
  }

  .notification_image {
    height: 50px;
    width: 50px;
    position: absolute;
    top: -10px;
    left: -10px;
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
    gap: 8px;
    padding: 0 15px 12px 15px;
  }

  .notifActions button {
    font-size: 13px;
    font-weight: 500;
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s ease;
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
