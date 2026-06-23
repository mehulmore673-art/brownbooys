// src/components/ToastContainer.jsx
import React from "react";

const ICONS = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };

/**
 * ToastContainer
 * Props: toasts — [{ id, msg, type }]
 *        removeToast — fn(id)
 */
export default function ToastContainer({ toasts, removeToast }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type || "info"} fade-in-right`}>
          <span className="toast__icon">{ICONS[t.type] || "ℹ️"}</span>
          <span className="toast__text">{t.msg}</span>
          <button
            className="modal__close"
            onClick={() => removeToast(t.id)}
            aria-label="Dismiss"
          >✕</button>
        </div>
      ))}
    </div>
  );
}
