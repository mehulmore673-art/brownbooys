// src/hooks/useToasts.js
import { useState, useCallback } from "react";

/**
 * useToasts()
 * Returns { toasts, add(msg, type?, duration?), remove(id) }
 * type: "success" | "error" | "warning" | "info"  (default "info")
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((msg, type = "info", duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }
    return id;
  }, []);

  const remove = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, add, remove };
}
