// src/admin/useShopControls.js
// ── Shop open/close + delivery on/off logic ───────────────────
import { useCallback } from "react";
import { adminFetch }  from "./adminFetch";

/**
 * useShopControls({ shopSettings, setShopSettings, addToast })
 * Returns: { toggleShop, toggleDelivery, saveSettings }
 */
export function useShopControls({ shopSettings, setShopSettings, addToast }) {

  const toggleShop = useCallback(async () => {
    try {
      const next = { ...shopSettings, shopOpen: !shopSettings.shopOpen };
      const res  = await adminFetch("/api/shop", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(next),
      });
      if (!res.ok) { addToast("❌ Could not update shop.", "error"); return; }
      addToast(`🏪 Shop is now ${next.shopOpen ? "OPEN" : "CLOSED"}`, "success");
      setShopSettings(next);
    } catch (err) {
      addToast("📡 " + (err.message || "Server unreachable."), "error", 6000);
    }
  }, [shopSettings, setShopSettings, addToast]);

  const toggleDelivery = useCallback(async () => {
    try {
      const next = { ...shopSettings, deliveryOn: !shopSettings.deliveryOn };
      const res  = await adminFetch("/api/shop", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(next),
      });
      if (!res.ok) { addToast("❌ Could not update delivery.", "error"); return; }
      addToast(`🛵 Delivery is now ${next.deliveryOn ? "ON" : "OFF"}`, "success");
      setShopSettings(next);
    } catch (err) {
      addToast("📡 " + (err.message || "Server unreachable."), "error", 6000);
    }
  }, [shopSettings, setShopSettings, addToast]);

  const saveSettings = useCallback(async () => {
    try {
      const res = await adminFetch("/api/shop", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(shopSettings),
      });
      if (!res.ok) { addToast("❌ Failed to save settings.", "error"); return; }
      addToast("✅ Settings saved.", "success");
    } catch (err) {
      addToast("📡 " + (err.message || "Server unreachable."), "error", 6000);
    }
  }, [shopSettings, addToast]);

  return { toggleShop, toggleDelivery, saveSettings };
}
