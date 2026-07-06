import { writable } from 'svelte/store';

function createPresenceStore() {
    const { subscribe, update, set } = writable({});
    let eventSource = null;

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
                data.statuses.forEach((s) => (statuses[s.userId] = s.online));
                update((current) => ({ ...current, ...statuses }));
            } else if (data.type === 'status') {
                update((current) => ({ ...current, [data.userId]: data.online }));
            }
        };
        // EventSource auto-reconnects on drop by default — no manual retry needed
    }

    function disconnect() {
        eventSource?.close();
        eventSource = null;
        set({});
    }

    return { subscribe, connect, disconnect };
}

export const presence = createPresenceStore();