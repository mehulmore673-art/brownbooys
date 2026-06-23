// src/utils/razorpay.js
export function loadRazorpayScript() {
  return new Promise((resolve) => {
    // FIX — only short-circuit if the script previously loaded
    // successfully (window.Razorpay exists). If a prior attempt left a
    // <script> tag in the DOM but it was blocked (ad-blocker / network
    // issue), window.Razorpay won't exist — remove the stale tag and
    // retry instead of resolving true forever.
    const existing = document.getElementById("razorpay-script");
    if (existing) {
      if (typeof window.Razorpay === "function") { resolve(true); return; }
      existing.remove();
    }
    const s    = document.createElement("script");
    s.id       = "razorpay-script";
    s.src      = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload   = () => resolve(typeof window.Razorpay === "function");
    s.onerror  = () => resolve(false);
    document.body.appendChild(s);
  });
}
