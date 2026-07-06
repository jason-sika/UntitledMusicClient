import { writable } from 'svelte/store';

function createPresenceStore() {
    const { subscribe, update, set } = writable({});
    let eventSource = null;
    let visibilityHandler = null;
    let exitHandler = null;

    function reportAway(away) {
        fetch('https://backend.umc.jasonsika.com/api/presence/away', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ away }),
        }).catch(() => { });
    }

    function reportOfflineOnExit() {
        fetch('https://backend.umc.jasonsika.com/api/presence/status', {
            method: 'POST',
            credentials: 'include',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'offline' }),
        }).catch(() => { });
    }

    function connect() {
        if (eventSource) return;
        eventSource = new EventSource(
            'https://backend.umc.jasonsika.com/api/presence/stream',
            { withCredentials: true }
        );

        eventSource.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'init') {
                const statuses = {};
                data.statuses.forEach((s) => (statuses[s.userId] = s.status));
                update((current) => ({ ...current, ...statuses }));
            } else if (data.type === 'status') {
                update((current) => ({ ...current, [data.userId]: data.status }));
            }
        };

        visibilityHandler = () => reportAway(document.hidden);
        document.addEventListener('visibilitychange', visibilityHandler);

        exitHandler = () => reportOfflineOnExit();
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
        set({});
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

    return { subscribe, connect, disconnect, setStatus, watch, unwatch };
}

export const presence = createPresenceStore();
