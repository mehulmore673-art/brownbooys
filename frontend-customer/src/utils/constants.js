// src/utils/constants.js
// Single source of truth for the backend URL.
// FIX — reads from REACT_APP_API_BASE (set in Netlify/Vercel build env)
// so the same code works for local dev, staging, and production
// without editing source. Falls back to the production backend URL.
export const API_BASE =
  process.env.REACT_APP_API_BASE || "https://brownbooys-backend-api.onrender.com";
