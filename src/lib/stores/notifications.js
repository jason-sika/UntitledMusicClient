// src/lib/stores/notifications.js
import { writable } from 'svelte/store';

function createNotificationsStore() {
    const { subscribe, update, set } = writable([]);

    function setAll(list) {
        set(list);
    }

    function add(notification) {
        update((list) => [notification, ...list]);
    }

    function markRead(id) {
        update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    }

    function remove(id) {
        update((list) => list.filter((n) => n.id !== id));
    }

    function clear() {
        set([]);
    }

    return { subscribe, setAll, add, markRead, remove, clear };
}

export const notifications = createNotificationsStore();