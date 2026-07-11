import { writable } from 'svelte/store';
import { notifications } from './notifications.js';
import { feed } from './feed.js';

function createPresenceStore() {
    const { subscribe, update, set } = writable({});
    const { subscribe: subscribeNowPlaying, update: updateNowPlaying, set: setNowPlaying } = writable({});
    let eventSource = null;
    let visibilityHandler = null;
    let exitHandler = null;
    let heartbeat = null;
    const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tabsKey = 'umc-presence-tabs';
    const staleAfterMs = 15000;

    function readTabs() {
        try {
            return JSON.parse(localStorage.getItem(tabsKey) || '{}');
        } catch {
            return {};
        }
    }

    function writeTabs(tabs) {
        try {
            localStorage.setItem(tabsKey, JSON.stringify(tabs));
        } catch {
            // localStorage may be unavailable in private modes; presence still works.
        }
    }

    function pruneTabs(tabs) {
        const now = Date.now();
        return Object.fromEntries(
            Object.entries(tabs).filter(([, lastSeen]) => now - lastSeen < staleAfterMs)
        );
    }

    function registerTab() {
        const tabs = pruneTabs(readTabs());
        tabs[tabId] = Date.now();
        writeTabs(tabs);
    }

    function unregisterTab() {
        const tabs = pruneTabs(readTabs());
        delete tabs[tabId];
        writeTabs(tabs);
        return Object.keys(tabs).length === 0;
    }

    function reportAway(away) {
        fetch('https://backend.umc.jasonsika.com/api/presence/away', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ away }),
        }).catch(() => { });
    }

    function reportOfflineOnExit() {
        const body = JSON.stringify({ status: 'offline' });
        navigator.sendBeacon?.(
            'https://backend.umc.jasonsika.com/api/presence/status',
            new Blob([body], { type: 'application/json' })
        );

        fetch('https://backend.umc.jasonsika.com/api/presence/status', {
            method: 'POST',
            credentials: 'include',
            keepalive: true,
            body,
        }).catch(() => { });

        fetch('https://backend.umc.jasonsika.com/api/presence/status', {
            method: 'POST',
            credentials: 'include',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body,
        }).catch(() => { });
    }

    function openOfflinePopup() {
        try {
            window.open(
                '/auth/presence/offline',
                'umc-presence-offline',
                'popup=yes,width=260,height=160,left=0,top=0'
            );
        } catch {
            // Browsers may block popups during unload; keepalive requests above are fallback.
        }
    }

    function connect() {
        if (eventSource) return;
        registerTab();
        heartbeat = setInterval(registerTab, 5000);

        eventSource = new EventSource(
            'https://backend.umc.jasonsika.com/api/presence/stream',
            { withCredentials: true }
        );

        eventSource.onmessage = (e) => {
            const data = JSON.parse(e.data);
            switch (data.type) {
                case 'init': {
                    const statuses = {};
                    const tracks = {};
                    data.statuses.forEach((s) => {
                        statuses[s.userId] = s.status;
                        tracks[s.userId] = s.track;
                    });
                    update((current) => ({ ...current, ...statuses }));
                    updateNowPlaying((current) => ({ ...current, ...tracks }));
                    break;
                }
                case 'status':
                    update((current) => ({ ...current, [data.userId]: data.status }));
                    break;
                case 'listening':
                    updateNowPlaying((current) => ({
                        ...current,
                        [data.userId]: data.track ?? null,
                    }));
                    break;
                case 'notification:new':
                    notifications.add(data.notification);
                    break;
                case 'notification:read':
                    notifications.markRead(data.id);
                    break;
                case 'notification:deleted':
                    notifications.remove(data.id);
                    break;
                case 'notifications:cleared':
                    notifications.clear();
                    break;
                case 'feed:item':
                    feed.add(data.item);
                    break;
                case 'feed:removed':
                    feed.remove(data.id);
                    break;
            }
        };

        visibilityHandler = () => reportAway(document.hidden);
        document.addEventListener('visibilitychange', visibilityHandler);

        exitHandler = () => {
            const isLastTab = unregisterTab();
            if (isLastTab) {
                reportOfflineOnExit();
                openOfflinePopup();
            }
            eventSource?.close();
            eventSource = null;
        };
        window.addEventListener('pagehide', exitHandler);
        window.addEventListener('beforeunload', exitHandler);
    }

    function disconnect() {
        eventSource?.close();
        eventSource = null;
        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
            visibilityHandler = null;
        }
        if (exitHandler) {
            window.removeEventListener('pagehide', exitHandler);
            window.removeEventListener('beforeunload', exitHandler);
            exitHandler = null;
        }
        if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
        set({});
        setNowPlaying({});
    }

    async function setStatus(status) {
        await fetch('https://backend.umc.jasonsika.com/api/presence/status', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
    }

    async function watch(userId) {
        try {
            const res = await fetch('https://backend.umc.jasonsika.com/api/presence/watch', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            const data = await res.json();
            if (data?.status) {
                update((current) => ({ ...current, [userId]: data.status }));
            }
        } catch {
            // leave whatever's already in the store
        }
    }

    function unwatch(userId) {
        fetch('https://backend.umc.jasonsika.com/api/presence/watch', {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        }).catch(() => { });
    }

    return {
        subscribe,
        connect,
        disconnect,
        setStatus,
        watch,
        unwatch,
        nowPlaying: { subscribe: subscribeNowPlaying },
    };
}

export const presence = createPresenceStore();