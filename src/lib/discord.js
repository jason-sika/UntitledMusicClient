// $lib/discord.js
// Thin client for the backend's /api/discord/* routes. Adjust API_BASE if
// your frontend/backend aren't on separate domains like in AccountSettings.svelte.

const API_BASE = 'https://backend.umc.jasonsika.com';

export async function getDiscordStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/discord/status`, { credentials: 'include' });
        if (!res.ok) return { linked: false };
        return await res.json();
    } catch {
        return { linked: false };
    }
}

// Opens Discord's OAuth flow in a popup (matching the pattern used for
// account deletion) instead of navigating the whole tab away. Resolves
// `true` once the popup closes — including via the auto-close on the
// /auth/discord-callback landing page — or `false` if the browser blocked
// the popup outright, in which case callers should fall back to a normal
// redirect.
export function linkDiscord() {
    return new Promise((resolve) => {
        const width = 500;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
            `${API_BASE}/api/discord/link`,
            'discord-link',
            `width=${width},height=${height},left=${left},top=${top}`,
        );

        if (!popup) {
            resolve(false); // popup blocked — caller should fall back to full redirect
            return;
        }

        // We can't read popup.location while it's on discord.com or the
        // backend domain (cross-origin), but polling .closed works regardless
        // of origin — that's what tells us the flow finished.
        const timer = setInterval(() => {
            if (popup.closed) {
                clearInterval(timer);
                resolve(true);
            }
        }, 400);
    });
}

// Fallback for when the popup was blocked — same destination, but takes
// over the current tab instead.
export function linkDiscordFullPage() {
    window.location.href = `${API_BASE}/api/discord/link`;
}

export async function unlinkDiscord() {
    try {
        const res = await fetch(`${API_BASE}/api/discord/unlink`, {
            method: 'POST',
            credentials: 'include',
        });
        return res.ok;
    } catch {
        return false;
    }
}

let sendTimer = null;

// Debounced so rapid play/pause/song-change bursts (e.g. skipping through
// a queue) collapse into a single request instead of spamming the bridge.
// Callers should NOT call this on every playback tick — only on discrete
// state changes (song loaded, play, pause, stop).
export function sendDiscordActivity(payload) {
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(() => {
        fetch(`${API_BASE}/api/discord/activity`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(() => {
            // Best-effort — a failed presence update shouldn't surface as a UI error.
        });
    }, 150);
}

export function clearDiscordActivity() {
    sendDiscordActivity({ title: '' }); // empty title === isClear on the bridge side
}