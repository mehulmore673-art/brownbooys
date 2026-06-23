// src/components/DeliveryLocator.jsx
import React, { useState } from "react";
import { getDeliveryLocation, mapsLink } from "../utils/geo";

export default function DeliveryLocator({ shopSettings, delivery, onUpdate, addToast }) {
  const [loading, setLoading] = useState(false);

  const detect = async () => {
    setLoading(true);
    try {
      const loc = await getDeliveryLocation(shopSettings);
      onUpdate(loc);
      addToast(`📍 Location: ${loc.distanceKm} km away`, "success", 4000);
    } catch (err) {
      addToast(err.message || "Could not detect location.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="delivery-locator">
      {/* Auto-detect button */}
      <button
        className="btn-add delivery-locator__detect"
        onClick={detect}
        disabled={loading}
        type="button"
      >
        {loading ? (
          <>
            <span className="spinner spinner--sm" />
            Detecting location…
          </>
        ) : (
          "📍 Auto-detect my location"
        )}
      </button>

      {/* Manual address fallback */}
      <div className="form-group delivery-locator__manual">
        <label className="form-label">Or enter address manually</label>
        <input
          className="form-input"
          placeholder="Street, Area, City…"
          value={delivery.address || ""}
          onChange={(e) => onUpdate({ ...delivery, address: e.target.value })}
        />
      </div>

      {/* Location preview card */}
      {delivery.latitude && (
        <div className="delivery-locator__card glass-panel">
          <div className="delivery-locator__card-top">
            <div className="delivery-locator__addr-wrap">
              <span className="delivery-locator__addr-label">📍 Detected address</span>
              <span className="delivery-locator__addr-text">
                {delivery.address || `${delivery.latitude?.toFixed(4)}, ${delivery.longitude?.toFixed(4)}`}
              </span>
            </div>
            <a
              href={mapsLink(delivery.latitude, delivery.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-add delivery-locator__map-btn"
            >
              🗺️ Map
            </a>
          </div>

          <div className="delivery-locator__stats">
            <div className="delivery-locator__stat">
              <span className="delivery-locator__stat-label">Distance</span>
              <span className="delivery-locator__stat-value gradient-text">
                {delivery.distanceKm} km
              </span>
            </div>
            <div className="delivery-locator__stat">
              <span className="delivery-locator__stat-label">Delivery charge</span>
              <span
                className="delivery-locator__stat-value"
                style={{ color: delivery.charge === 0 ? "#3dc96e" : "var(--text-white)" }}
              >
                {delivery.charge === 0 ? "🎉 Free" : `₹${delivery.charge}`}
              </span>
            </div>
          </div>

          {delivery.distanceKm > 15 && (
            <div className="alert alert--warning delivery-locator__warn">
              <span className="alert__icon">⚠️</span>
              <span className="alert__text">
                {delivery.distanceKm} km away — delivery may take longer.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
