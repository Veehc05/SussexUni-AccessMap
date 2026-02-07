// Sussex campus (roughly)

// Narrower east–west, taller north–south
const sussexBounds = L.latLngBounds(
  [50.8598, -0.0940], // south-west (includes Falmer station)
  [50.8755, -0.0795]  // north-east (includes Stanmer Court)
);


const sussexCampusCenter = [50.8676, -0.0870];

const map = L.map("map", {
  zoomControl: true,
  maxBounds: sussexBounds,
  maxBoundsViscosity: 1.0, 
  inertia: false
}).setView(sussexCampusCenter, 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  minZoom: 8,
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);


let routesLayer = null;
let poiLayer = null;
let poiData = null; // store loaded POIs so we can re-filter without refetching

// -------------------------
// Icons (define once)
// -------------------------
const ICONS = {
  lift: L.icon({
    iconUrl: "./icons/lift.svg",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  }),
  main_accessible_entrance: L.icon({
    iconUrl: "./icons/main_accessible_entrance.svg",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  }),
  specific_accessible_entrance: L.icon({
    iconUrl: "./icons/specific_accessible_entrance.svg",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  }),
  // Optional icon/type if you’re using it:
  main_entrance: L.icon({
    iconUrl: "./icons/main_entrance.svg",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  })
};

// Fallback if a POI has an unknown poi_type
const DEFAULT_ICON = ICONS.main_accessible_entrance;

// -------------------------
// Routes
// -------------------------
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

// -------------------------
// POIs (with filtering)
// -------------------------
function getActivePoiTypes() {
  const active = new Set();

  // If filters aren't present in the HTML yet, default to "show all"
  const hasAnyFilter =
    document.getElementById("filterLift") ||
    document.getElementById("filterMainAccEntrance") ||
    document.getElementById("filterSpecificAccEntrance") ||
    document.getElementById("filterMainEntrance");

  if (!hasAnyFilter) {
    return null; // special value meaning "no filtering"
  }

  if (document.getElementById("filterLift")?.checked) active.add("lift");
  if (document.getElementById("filterMainAccEntrance")?.checked) active.add("main_accessible_entrance");
  if (document.getElementById("filterSpecificAccEntrance")?.checked) active.add("specific_accessible_entrance");
  if (document.getElementById("filterMainEntrance")?.checked) active.add("main_entrance");

  return active;
}

function renderPOIs() {
  if (!poiData) return;

  // Remove existing layer if present
  if (poiLayer) map.removeLayer(poiLayer);

  const activeTypes = getActivePoiTypes();
  const doFilter = activeTypes instanceof Set;

  poiLayer = L.geoJSON(poiData, {
    filter: (feature) => {
      if (!doFilter) return true; // show all when filters not configured
      const t = feature?.properties?.poi_type;
      return activeTypes.has(t);
    },

    pointToLayer: (feature, latlng) => {
      const poiType = feature?.properties?.poi_type;
      const icon = ICONS[poiType] || DEFAULT_ICON;
      return L.marker(latlng, { icon });
    },

    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const name = p.name ?? "POI";
      const desc = p.description ?? "";
      const poiType = p.poi_type ?? "";

      layer.bindPopup(`
        <strong>${name}</strong><br/>
        ${poiType ? `Type: ${poiType}<br/>` : ""}
        ${desc}
      `);
    }
  });

  // Respect the main POI toggle
  const showPois = document.getElementById("poisToggle")?.checked ?? true;
  if (showPois) {
    poiLayer.addTo(map);
  }
}

async function loadPOIs() {
  const res = await fetch("./data/pois.geojson");
  if (!res.ok) throw new Error("Failed to load pois.geojson");

  poiData = await res.json();
  renderPOIs();
}

// -------------------------
// Load data
// -------------------------
loadRoutes().catch(err => {
  console.error(err);
  alert("Could not load route data. Check console for details.");
});

loadPOIs().catch(err => {
  console.error(err);
  alert("Could not load POI data. Check console for details.");
});

// -------------------------
// Layer toggles
// -------------------------
document.getElementById("routesToggle")?.addEventListener("change", (e) => {
  const show = e.target.checked;
  if (!routesLayer) return;
  show ? routesLayer.addTo(map) : map.removeLayer(routesLayer);
});

// Updated POI toggle so it plays nicely with re-rendering
document.getElementById("poisToggle")?.addEventListener("change", (e) => {
  const show = e.target.checked;

  if (!show) {
    if (poiLayer) map.removeLayer(poiLayer);
    return;
  }

  // Re-render ensures filters are respected
  renderPOIs();
});

// Filter checkbox listeners (safe even if the elements don't exist yet)
["filterLift", "filterMainAccEntrance", "filterSpecificAccEntrance", "filterMainEntrance"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", () => renderPOIs());
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
