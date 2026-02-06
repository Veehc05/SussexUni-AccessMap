// Sussex campus (roughly) — you can adjust after you draw your GeoJSON route
const sussexCampusCenter = [50.8676, -0.0870];

const map = L.map("map", {
  zoomControl: true
}).setView(sussexCampusCenter, 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routesLayer = null;

async function loadRoutes() {
  const res = await fetch("./data/routes.geojson");
  if (!res.ok) throw new Error("Failed to load routes.geojson");

  const geojson = await res.json();

  routesLayer = L.geoJSON(geojson, {
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      const title = props.name ?? "Accessible route";
      const notes = props.notes ?? "No notes provided.";
      const stepFree = props.step_free === true ? "Yes" : "Unknown";

      layer.bindPopup(`
        <strong>${title}</strong><br/>
        Step-free: ${stepFree}<br/>
        ${notes}
      `);
    }
  });

  routesLayer.addTo(map);

  // Zoom to route extent
  try {
    map.fitBounds(routesLayer.getBounds(), { padding: [20, 20] });
  } catch (_) {}
}

loadRoutes().catch(err => {
  console.error(err);
  alert("Could not load route data. Check console for details.");
});

document.getElementById("routesToggle").addEventListener("change", (e) => {
  const show = e.target.checked;
  if (!routesLayer) return;
  if (show) routesLayer.addTo(map);
  else map.removeLayer(routesLayer);
});
