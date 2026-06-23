// src/utils/geo.js

/**
 * mapsLink(lat, lon)
 * Returns a Google Maps directions URL to a given location.
 */
export function mapsLink(lat, lon) {
  if (!lat || !lon) return "#";
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

/**
 * haversineKm(lat1, lon1, lat2, lon2)
 * Straight-line distance in km between two coordinates.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

/**
 * calcDeliveryCharge(distanceKm, shopSettings)
 * First `deliveryBaseKm` km are free; ₹deliveryRatePerKm per km after that.
 * Mirrors backend/utils/distance.js so the customer sees the same number
 * the backend will (eventually) validate.
 */
export function calcDeliveryCharge(distanceKm, shopSettings = {}) {
  const base = shopSettings.deliveryBaseKm    ?? 5;
  const rate = shopSettings.deliveryRatePerKm ?? 5;
  if (distanceKm <= base) return 0;
  return Math.ceil((distanceKm - base) * rate);
}

/**
 * getDeliveryLocation(shopSettings)
 * Uses the browser Geolocation API to detect the customer's current
 * position, computes distance from the shop (via shopSettings.shopLatitude/
 * shopLongitude) and the resulting delivery charge.
 *
 * Returns: { latitude, longitude, address, distanceKm, charge }
 * Throws an Error with a user-friendly message on failure.
 */
export function getDeliveryLocation(shopSettings = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        let distanceKm = 0;
        // FIX — previously used `if (shopSettings.shopLatitude && shopSettings.shopLongitude)`
        // which treats 0 as falsy. The default shop coordinates before the admin sets
        // their real location are 0,0 (ocean off Africa — never a valid Indian address).
        // When both are 0, skip the Haversine calc and throw a clear error to the customer
        // instead of silently showing "0 km — Free delivery" which is misleading.
        const shopLat = Number(shopSettings.shopLatitude);
        const shopLon = Number(shopSettings.shopLongitude);
        if (shopLat !== 0 && shopLon !== 0) {
          distanceKm = haversineKm(
            shopSettings.shopLatitude, shopSettings.shopLongitude,
            latitude, longitude
          );
        } else {
          // Shop coordinates not configured yet — bail out with a clear
          // message rather than showing misleading "0 km — Free delivery"
          reject(new Error("Delivery distance cannot be calculated yet. The shop owner needs to set the shop location in the admin panel."));
          return;
        }
        const charge = calcDeliveryCharge(distanceKm, shopSettings);

        // Best-effort reverse geocoding via OpenStreetMap Nominatim (no API key).
        // Falls back to lat/lng text if it fails or is slow.
        let address = "";
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=0`,
            { signal: controller.signal, headers: { "Accept-Language": "en" } }
          );
          clearTimeout(timeout);
          if (res.ok) {
            const data = await res.json();
            address = data?.display_name || "";
          }
        } catch {
          // Reverse geocoding is best-effort only — ignore failures.
        }

        resolve({ latitude, longitude, address, distanceKm, charge });
      },
      (err) => {
        let message = "Could not detect your location.";
        if (err.code === err.PERMISSION_DENIED) {
          message = "Location permission denied. Please enable location access or enter your address manually.";
        } else if (err.code === err.TIMEOUT) {
          message = "Location request timed out. Please try again.";
        }
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
