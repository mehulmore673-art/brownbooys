// src/admin/adminFetch.js
// ── Authenticated fetch wrapper for all admin API calls ───────
import { API_BASE } from "../utils/constants";

// Dedup flag: prevents multiple parallel 401 responses from firing
// multiple "session expired" toasts when loadAll's Promise.all gets
// several 401s at once after a token expiry.
let _unauthorizedFired = false;

// FIX — Render's free tier can put the backend to sleep, or briefly
// recycle the instance, causing requests to hang or fail with a raw
// network error. Previously adminFetch had no timeout, so a sleeping
// backend just hung indefinitely or surfaced a bare "Server
// unreachable" toast with no useful explanation (e.g. banner upload).
// We add a generous timeout and tag the resulting Response-shaped
// object so callers can show a clearer "server is waking up" message
// instead of a dead-end error.
//
// FIX — file uploads (banner images, menu item images) need a longer
// timeout than plain JSON requests: a cold start can already eat
// 30-60s, and the actual multipart upload to Cloudinary still has to
// happen on top of that, especially on a slow connection. 45s was
// cutting uploads off mid-transfer and showing a misleading "waking
// up" message for what was really just a slow upload in progress.
const COLD_START_TIMEOUT_MS = 45000;
const UPLOAD_TIMEOUT_MS     = 90000;

/**
 * Thin event bus so any 401/403 response triggers a global logout
 * without importing React state here.
 * AdminPanel listens for "admin:unauthorized" and calls setAuthed(false).
 */
export function adminFetch(path, options = {}) {
  const token = localStorage.getItem("adminToken") || "";
  const isUpload = typeof FormData !== "undefined" && options.body instanceof FormData;
  const timeoutMs = isUpload ? UPLOAD_TIMEOUT_MS : COLD_START_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(API_BASE + path, {
    ...options,
    signal: controller.signal,
    headers: {
      ...(options.headers || {}),
      "Authorization": token ? `Bearer ${token}` : "",
    },
  }).then((res) => {
    clearTimeout(timer);
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("adminToken");
      // Only fire the event once per session expiry, even if multiple
      // parallel requests all return 401 simultaneously.
      if (!_unauthorizedFired) {
        _unauthorizedFired = true;
        window.dispatchEvent(new Event("admin:unauthorized"));
        // Reset after a short delay so future logins work correctly.
        setTimeout(() => { _unauthorizedFired = false; }, 3000);
      }
    }
    return res;
  }).catch((err) => {
    clearTimeout(timer);
    if (err?.name === "AbortError" || /Failed to fetch|NetworkError/i.test(err?.message || "")) {
      // FIX — for uploads specifically, don't word this as "please try
      // again" the same way as a plain GET/JSON failure: the offers/
      // menu-image POST routes are NOT idempotent (each successful
      // request creates a new banner / new Cloudinary image), so if the
      // request actually reached the server before the client gave up,
      // blindly retrying could create a duplicate. Tell the admin to
      // check the list first instead of just "try again."
      const msg = isUpload
        ? "Upload timed out — the server may still be waking up or the upload may have completed. Please check the list below before uploading again, to avoid a duplicate."
        : "Server is waking up (this can take up to a minute on Render's free tier). Please try again in a few seconds.";
      throw new Error(msg);
    }
    throw err;
  });
}
