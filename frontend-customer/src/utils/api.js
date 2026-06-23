// src/utils/api.js
import { API_BASE } from "./constants";

// FIX — Render's free tier puts the backend to sleep after inactivity
// and takes ~30-60s to "cold start" back up. Previously, fetch() had no
// timeout, so a sleeping backend just hung silently or eventually threw
// a generic browser network error ("Failed to create payment order" /
// "Server unreachable") with no indication of *why*. Now we apply a
// generous timeout and detect the cold-start case specifically so the
// customer sees "waking up the server, please retry in a moment"
// instead of a dead-end error.
const COLD_START_TIMEOUT_MS = 45000; // covers Render free-tier worst case (~30-60s)

function isLikelyColdStart(err) {
  return err?.name === "AbortError" || /Failed to fetch|NetworkError/i.test(err?.message || "");
}

/**
 * Thin fetch wrapper. Throws an Error with server message on failure.
 */
export async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COLD_START_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(API_BASE + path, { ...options, signal: controller.signal });
  } catch (err) {
    if (isLikelyColdStart(err)) {
      throw new Error("The server is waking up — this can take up to a minute on first use. Please try again in a few seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  let body;
  try   { body = await res.json(); }
  catch { body = {}; }
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/** Headers for admin-authenticated requests (JSON body). */
export function adminJsonHeaders() {
  return {
    "Content-Type":     "application/json",
    "x-admin-password": localStorage.getItem("adminToken") || "",
  };
}

/** Headers for admin-authenticated requests (FormData body — no Content-Type). */
export function adminFormHeaders() {
  return { "x-admin-password": localStorage.getItem("adminToken") || "" };
}

/** Safe fetch — returns null on any error (for polling loops). */
export async function safeFetch(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COLD_START_TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}
