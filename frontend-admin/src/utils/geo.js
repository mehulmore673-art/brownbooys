// src/utils/geo.js

/**
 * mapsLink(lat, lon)
 * Returns a Google Maps directions URL to the customer's location.
 * Used in AdminPanel to open delivery addresses in one tap.
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
