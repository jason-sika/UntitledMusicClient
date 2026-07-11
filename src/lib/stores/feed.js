import { writable } from 'svelte/store';

function createFeedStore() {
    const { subscribe, update, set } = writable([]);

    function add(item) {
        update((items) => {
            if (items.some((i) => i.id === item.id)) return items;
            return [item, ...items].slice(0, 100);
        });
    }

    function remove(id) {
        update((items) => items.filter((i) => i.id !== id));
    }

    function setAll(items) {
        set(items ?? []);
    }

    function clear() {
        set([]);
    }

    return { subscribe, add, remove, setAll, clear };
}

export const feed = createFeedStore();