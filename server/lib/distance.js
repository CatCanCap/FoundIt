// Straight-line distance in metres between two { lat, lng } points (haversine).
// Good enough to pick the nearest collection point on a campus this small;
// Mapbox gives the real walking route in the browser.
function metresBetween(a, b) {
  const R = 6371000;
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = { metresBetween };
