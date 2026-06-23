// src/utils/constants.js
// FIX — reads from REACT_APP_API_BASE (set in Netlify/Vercel build env)
// so the same code works for local dev, staging, and production.
export const API_BASE =
  process.env.REACT_APP_API_BASE || "https://brownbooys-backend-api.onrender.com";
