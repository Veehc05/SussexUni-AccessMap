// Sussex campus (roughly)
const sussexCampusCenter = [50.8676, -0.0870];

const map = L.map("map", { zoomControl: true }).setView(sussexCampusCenter, 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routesLayer = null;
let poiLayer = null;

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
  }).addTo(map);

  // Zoom to route extent
  try {
    const b = routesLayer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [20, 20] });
  } catch (_) {}
}

async function loadPOIs() {
  const res = await fetch("./data/pois.geojson");
  if (!res.ok) throw new Error("Failed to load pois.geojson");

  const geojson = await res.json();

  poiLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => L.marker(latlng),
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const name = p.name ?? "POI";
      const desc = p.description ?? "";
      const poiType = p.poi_type ?? ""; // <-- use poi_type (recommended)

      layer.bindPopup(`
        <strong>${name}</strong><br/>
        ${poiType ? `Type: ${poiType}<br/>` : ""}
        ${desc}
      `);
    }
  }).addTo(map);
}

// Load data
loadRoutes().catch(err => {
  console.error(err);
  alert("Could not load route data. Check console for details.");
});

loadPOIs().catch(err => {
  console.error(err);
  alert("Could not load POI data. Check console for details.");
});

// Layer toggles (make sure these IDs exist in index.html)
document.getElementById("routesToggle")?.addEventListener("change", (e) => {
  const show = e.target.checked;
  if (!routesLayer) return;
  show ? routesLayer.addTo(map) : map.removeLayer(routesLayer);
});

document.getElementById("poisToggle")?.addEventListener("change", (e) => {
  const show = e.target.checked;
  if (!poiLayer) return;
  show ? poiLayer.addTo(map) : map.removeLayer(poiLayer);
});


// -------------------------
// Collapsible sidebar logic
// -------------------------
const sidebarToggleBtn = document.getElementById("sidebarToggle");

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);

  if (sidebarToggleBtn) {
    sidebarToggleBtn.textContent = collapsed ? "☰ Info" : "✕ Close";
    sidebarToggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  // Leaflet needs a resize nudge after layout changes
  setTimeout(() => map.invalidateSize(), 50);
}

sidebarToggleBtn?.addEventListener("click", () => {
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  setSidebarCollapsed(!collapsed);
});

// Optional: auto-collapse on smaller screens
if (window.matchMedia?.("(max-width: 900px)").matches) {
  setSidebarCollapsed(true);
}
