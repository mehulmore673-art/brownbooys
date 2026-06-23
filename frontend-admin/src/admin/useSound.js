// src/admin/useSound.js
// ── Sound system for admin new-order alerts ───────────────────
import { useRef, useEffect, useCallback } from "react";

/**
 * useSound(muted)
 * Returns { playBeep, startRepeating, stopRepeating }.
 * Pass the current `soundMuted` boolean; the hook tracks it via a ref
 * so the returned functions never need to be re-created (safe [] dep
 * on useCallback).
 *
 * FEATURE — repeating alert: startRepeating() re-plays the
 * notification sound every REPEAT_INTERVAL_MS until stopRepeating()
 * is called (or the component unmounts). Used so a new order keeps
 * alerting the admin instead of playing once and going silent if
 * missed — call stopRepeating() once there are no more orders
 * waiting to be accepted (status still "Pending"/"Paid").
 */
const REPEAT_INTERVAL_MS = 8000; // re-alert every 8s while orders await acceptance

export function useSound(muted) {
  const audioRef       = useRef(null);
  const soundMutedRef  = useRef(muted);
  const repeatTimerRef = useRef(null);
  const unlockedRef    = useRef(false);

  // Keep ref in sync synchronously on every render — not inside useEffect,
  // so the ref is always up-to-date before any event handler runs.
  soundMutedRef.current = muted;

  // Pre-load the notification sound once on mount
  useEffect(() => {
    const audio = new Audio("/order-notification.wav");
    audio.preload = "auto";
    audioRef.current = audio;

    // FIX — browsers block audio.play() until the page has received at
    // least one real user gesture (click/tap/keypress) this session.
    // Without this, the FIRST automatic alert (whether a single new-
    // order beep or our repeating "ring until accepted" alert) fails
    // silently — audio.play() rejects and only a console warning is
    // logged, which the admin never sees. That defeats the whole point
    // of a continuous alert. We "unlock" playback proactively on the
    // very first interaction anywhere in the admin panel (e.g. clicking
    // Login), by playing-and-immediately-pausing a muted instance, so
    // by the time a real alert needs to fire, the browser has already
    // granted permission for the rest of the session.
    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      try {
        const a = audioRef.current;
        if (a) {
          a.muted = true;
          a.play()
            .then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
            .catch(() => { a.muted = false; }); // even if this attempt fails, don't leave it muted
        }
      } catch { /* no-op — worst case, first real alert still attempts normally */ }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    // Stop any pending repeat alert if the admin panel unmounts
    // (e.g. logout) so it doesn't keep firing in the background.
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      if (repeatTimerRef.current) {
        clearInterval(repeatTimerRef.current);
        repeatTimerRef.current = null;
      }
    };
  }, []);

  const playBeep = useCallback(() => {
    if (soundMutedRef.current) return;
    try {
      const audio = audioRef.current;
      if (!audio) return;
      // Reset to start so rapid orders can re-trigger it
      audio.currentTime = 0;
      audio.play().catch(() => {
        console.warn("🔇 New-order sound needs a click on the page to enable (browser audio policy).");
      });
    } catch (e) {
      console.warn("playBeep error:", e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — reads refs only, no re-creation needed

  // FIX — continuous alert until admin accepts the order. Starting it
  // again while already running is a safe no-op (won't stack timers).
  const startRepeating = useCallback(() => {
    if (repeatTimerRef.current) return; // already running
    repeatTimerRef.current = setInterval(() => {
      playBeep();
    }, REPEAT_INTERVAL_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRepeating = useCallback(() => {
    if (repeatTimerRef.current) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  return { playBeep, startRepeating, stopRepeating };
}
