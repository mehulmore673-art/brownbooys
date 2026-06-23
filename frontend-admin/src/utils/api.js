// src/utils/api.js
import { API_BASE } from "./constants";

/**
 * Thin fetch wrapper. Throws an Error with server message on failure.
 */
export async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
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
  try {
    const res = await fetch(API_BASE + path);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
