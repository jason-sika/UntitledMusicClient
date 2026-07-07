// src/lib/stores/player.js
import { writable } from 'svelte/store';

function createPlayerStore() {
    const { subscribe, update } = writable({
        videoId: null,
        title: '',
        artist: '',
        albumArt: '/images/plhd.png',
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        ready: false,
    });

    let ytPlayer = null;

    function attachPlayer(instance) {
        ytPlayer = instance;
        update((s) => ({ ...s, ready: true }));
    }

    function detachPlayer() {
        ytPlayer = null;
        update((s) => ({ ...s, ready: false }));
    }

    function loadVideo(videoId, meta = {}) {
        if (!ytPlayer) return;

        // stop whatever's currently playing before swapping tracks
        ytPlayer.stopVideo();

        update((s) => ({
            ...s,
            videoId,
            title: meta.title ?? '',
            artist: meta.artist ?? '',
            albumArt: meta.albumArt ?? '/images/plhd.png',
            currentTime: 0,
            duration: 0,
            isPlaying: false,
        }));

        ytPlayer.loadVideoById(videoId); // autoplays by default once cued
    }

    function play() {
        ytPlayer?.playVideo();
    }

    function pause() {
        ytPlayer?.pauseVideo();
    }

    function seek(fraction) {
        update((s) => {
            if (ytPlayer && s.duration > 0) {
                ytPlayer.seekTo(s.duration * fraction, true);
            }
            return s;
        });
    }

    function setPlaying(isPlaying) {
        update((s) => ({ ...s, isPlaying }));
    }

    function setTime(currentTime, duration) {
        update((s) => ({ ...s, currentTime, duration }));
    }

    return { subscribe, attachPlayer, detachPlayer, loadVideo, play, pause, seek, setPlaying, setTime };
}

export const player = createPlayerStore();