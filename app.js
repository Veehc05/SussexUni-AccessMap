// Sussex campus (roughly)

// Narrower east–west, taller north–south
const sussexBounds = L.latLngBounds(
  [50.8598, -0.0940], // south-west: includes Falmer station
  [50.8755, -0.0795]  // north-east: includes Stanmer Court
);

const sussexCampusCenter = [50.8676, -0.0870];

const map = L.map("map", {
  zoomControl: true,
  minZoom: 14,
  maxZoom: 20,
  maxBounds: sussexBounds,
  maxBoundsViscosity: 1.0,
  inertia: false
}).setView(sussexCampusCenter, 16);

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
  {
    minZoom: 14,
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  }
).addTo(map);

// -------------------------
// Stored map data and layers
// -------------------------

let routesLayer = null;
let poiLayer = null;

let routeData = null;
let poiData = null;

// -------------------------
// Route styles
// -------------------------

const DEFAULT_ROUTE_STYLE = {
  weight: 5,
  opacity: 0.75
};

const SELECTED_ROUTE_STYLE = {
  weight: 8,
  opacity: 1
};

// -------------------------
// Icons
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

  main_entrance: L.icon({
    iconUrl: "./icons/main_entrance.svg",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  })
};

// Fallback for unknown POI types
const DEFAULT_ICON = ICONS.main_accessible_entrance;

// -------------------------
// Routes
// -------------------------

async function loadRoutes() {
  const response = await fetch("./data/routes.geojson");

  if (!response.ok) {
    throw new Error(
      `Failed to load routes.geojson: ${response.status}`
    );
  }

  routeData = await response.json();

  routesLayer = L.geoJSON(routeData, {
    style: DEFAULT_ROUTE_STYLE,

    onEachFeature: (feature, layer) => {
      const properties = feature.properties || {};

      const title =
        properties.name ?? "Accessible route";

      const description =
        properties.description ?? "";

      const notes =
        properties.notes ?? "No additional notes provided.";

      const stepFree =
        properties.step_free === true ? "Yes" : "No or unknown";

      layer.bindPopup(`
        <strong>${title}</strong><br />
        Step-free: ${stepFree}<br />
        ${description ? `${description}<br />` : ""}
        ${notes}
      `);
    }
  }).addTo(map);

  initialiseRoutePlanner();

  // Initially zoom to the available route data
  try {
    const bounds = routesLayer.getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [20, 20]
      });
    }
  } catch (error) {
    console.warn("Could not fit map to route bounds.", error);
  }
}

// -------------------------
// POIs and filtering
// -------------------------

function getActivePoiTypes() {
  const activeTypes = new Set();

  const hasAnyFilter =
    document.getElementById("filterLift") ||
    document.getElementById("filterMainAccEntrance") ||
    document.getElementById("filterSpecificAccEntrance") ||
    document.getElementById("filterMainEntrance");

  // No filters in the HTML means show everything
  if (!hasAnyFilter) {
    return null;
  }

  if (document.getElementById("filterLift")?.checked) {
    activeTypes.add("lift");
  }

  if (
    document.getElementById("filterMainAccEntrance")?.checked
  ) {
    activeTypes.add("main_accessible_entrance");
  }

  if (
    document.getElementById("filterSpecificAccEntrance")?.checked
  ) {
    activeTypes.add("specific_accessible_entrance");
  }

  if (
    document.getElementById("filterMainEntrance")?.checked
  ) {
    activeTypes.add("main_entrance");
  }

  return activeTypes;
}

function renderPOIs() {
  if (!poiData) {
    return;
  }

  if (poiLayer) {
    map.removeLayer(poiLayer);
  }

  const activeTypes = getActivePoiTypes();
  const shouldFilter = activeTypes instanceof Set;

  poiLayer = L.geoJSON(poiData, {
    filter: (feature) => {
      if (!shouldFilter) {
        return true;
      }

      const poiType = feature?.properties?.poi_type;
      return activeTypes.has(poiType);
    },

    pointToLayer: (feature, latlng) => {
      const properties = feature.properties || {};
      const poiType = properties.poi_type;
      const icon = ICONS[poiType] || DEFAULT_ICON;

      return L.marker(latlng, {
        icon,
        title: properties.name || "Point of interest"
      });
    },

    onEachFeature: (feature, layer) => {
      const properties = feature.properties || {};

      const name =
        properties.name ?? "Point of interest";

      const description =
        properties.description ?? "";

      const poiType =
        properties.poi_type ?? "";

      layer.bindPopup(`
        <strong>${name}</strong><br />
        ${poiType ? `Type: ${formatPoiType(poiType)}<br />` : ""}
        ${description}
      `);
    }
  });

  const showPOIs =
    document.getElementById("poisToggle")?.checked ?? true;

  if (showPOIs) {
    poiLayer.addTo(map);
  }
}

async function loadPOIs() {
  const response = await fetch("./data/pois.geojson");

  if (!response.ok) {
    throw new Error(
      `Failed to load pois.geojson: ${response.status}`
    );
  }

  poiData = await response.json();

  renderPOIs();
  initialiseRoutePlanner();
}

// -------------------------
// Route planner
// -------------------------

const routeFromSelect =
  document.getElementById("routeFrom");

const routeToSelect =
  document.getElementById("routeTo");

const stepFreeOnlyCheckbox =
  document.getElementById("stepFreeOnly");

const findRouteButton =
  document.getElementById("findRouteButton");

const routeResult =
  document.getElementById("routeResult");

function formatPoiType(poiType) {
  return String(poiType || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function getRoutePlannerPOIs() {
  if (!poiData?.features) {
    return [];
  }

  /*
   * Indoor lifts are excluded from this first outdoor
   * route planner. They remain visible on the map.
   */
  return poiData.features
    .filter(feature => {
      const properties = feature.properties || {};

      return (
        properties.id &&
        properties.name &&
        properties.poi_type !== "lift"
      );
    })
    .sort((firstFeature, secondFeature) => {
      const firstName =
        firstFeature.properties.name || "";

      const secondName =
        secondFeature.properties.name || "";

      return firstName.localeCompare(secondName);
    });
}

function populateRouteSelect(
  selectElement,
  placeholderText,
  poiFeatures
) {
  if (!selectElement) {
    return;
  }

  const previousValue = selectElement.value;

  selectElement.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderText;

  selectElement.appendChild(placeholder);

  poiFeatures.forEach(feature => {
    const properties = feature.properties || {};

    const option = document.createElement("option");
    option.value = properties.id;
    option.textContent = properties.name;

    selectElement.appendChild(option);
  });

  const previousOptionStillExists = Array.from(
    selectElement.options
  ).some(option => option.value === previousValue);

  if (previousOptionStillExists) {
    selectElement.value = previousValue;
  }
}

function initialiseRoutePlanner() {
  /*
   * Wait until both files have loaded. This function is
   * called after each file loads, so their loading order
   * does not matter.
   */
  if (!poiData || !routeData) {
    return;
  }

  const plannerPOIs = getRoutePlannerPOIs();

  populateRouteSelect(
    routeFromSelect,
    "Choose a starting point",
    plannerPOIs
  );

  populateRouteSelect(
    routeToSelect,
    "Choose a destination",
    plannerPOIs
  );
}

function resetRouteStyles() {
  if (!routesLayer) {
    return;
  }

  routesLayer.eachLayer(layer => {
    if (typeof layer.setStyle === "function") {
      layer.setStyle(DEFAULT_ROUTE_STYLE);
    }
  });
}

function showRouteResult(message, isError = false) {
  if (!routeResult) {
    return;
  }

  routeResult.textContent = message;
  routeResult.classList.toggle("error", isError);
}

function findMatchingRoute(
  fromId,
  toId,
  stepFreeOnly
) {
  if (!routeData?.features) {
    return null;
  }

  return routeData.features.find(feature => {
    const properties = feature.properties || {};

    /*
     * Treat predefined routes as reversible for now.
     * This allows Falmer House → Library and
     * Library → Falmer House to use the same line.
     */
    const matchesForward =
      properties.from_id === fromId &&
      properties.to_id === toId;

    const matchesReverse =
      properties.from_id === toId &&
      properties.to_id === fromId;

    const matchesDirection =
      matchesForward || matchesReverse;

    const matchesStepFreePreference =
      !stepFreeOnly ||
      properties.step_free === true;

    return (
      matchesDirection &&
      matchesStepFreePreference
    );
  });
}

function findRouteLayer(routeFeature) {
  if (!routesLayer) {
    return null;
  }

  let matchingLayer = null;
  const selectedRouteId =
    routeFeature.properties?.id;

  routesLayer.eachLayer(layer => {
    const layerRouteId =
      layer.feature?.properties?.id;

    if (
      selectedRouteId &&
      layerRouteId === selectedRouteId
    ) {
      matchingLayer = layer;
    }
  });

  return matchingLayer;
}

function ensureRoutesAreVisible() {
  const routesToggle =
    document.getElementById("routesToggle");

  if (routesToggle) {
    routesToggle.checked = true;
  }

  if (
    routesLayer &&
    !map.hasLayer(routesLayer)
  ) {
    routesLayer.addTo(map);
  }
}

function displaySelectedRoute(routeFeature) {
  resetRouteStyles();
  ensureRoutesAreVisible();

  const matchingLayer =
    findRouteLayer(routeFeature);

  if (!matchingLayer) {
    showRouteResult(
      "The route was found in the data, but its map layer could not be displayed.",
      true
    );

    return;
  }

  if (typeof matchingLayer.setStyle === "function") {
    matchingLayer.setStyle(SELECTED_ROUTE_STYLE);
    matchingLayer.bringToFront();
  }

  const routeBounds = matchingLayer.getBounds?.();

  if (routeBounds?.isValid()) {
    map.fitBounds(routeBounds, {
      padding: [40, 40],
      maxZoom: 18
    });
  }

  matchingLayer.openPopup();

  const properties =
    routeFeature.properties || {};

  const routeName =
    properties.name || "Selected route";

  const notes =
    properties.notes || "";

  showRouteResult(
    notes
      ? `Route found: ${routeName}. ${notes}`
      : `Route found: ${routeName}.`
  );
}

function handleFindRoute() {
  const fromId =
    routeFromSelect?.value || "";

  const toId =
    routeToSelect?.value || "";

  const stepFreeOnly =
    stepFreeOnlyCheckbox?.checked ?? true;

  resetRouteStyles();

  if (!fromId || !toId) {
    showRouteResult(
      "Choose both a starting point and a destination.",
      true
    );

    return;
  }

  if (fromId === toId) {
    showRouteResult(
      "Choose two different locations.",
      true
    );

    return;
  }

  const matchingRoute = findMatchingRoute(
    fromId,
    toId,
    stepFreeOnly
  );

  if (!matchingRoute) {
    showRouteResult(
      stepFreeOnly
        ? "A step-free route between these locations has not yet been mapped."
        : "A route between these locations has not yet been mapped.",
      true
    );

    return;
  }

  displaySelectedRoute(matchingRoute);
}

findRouteButton?.addEventListener(
  "click",
  handleFindRoute
);

// Clear the previous result when either selection changes
[routeFromSelect, routeToSelect].forEach(selectElement => {
  selectElement?.addEventListener("change", () => {
    resetRouteStyles();
    showRouteResult("");
  });
});

stepFreeOnlyCheckbox?.addEventListener(
  "change",
  () => {
    resetRouteStyles();
    showRouteResult("");
  }
);

// -------------------------
// Load data
// -------------------------

loadRoutes().catch(error => {
  console.error(error);

  showRouteResult(
    "Could not load route data.",
    true
  );

  alert(
    "Could not load route data. Check the browser console for details."
  );
});

loadPOIs().catch(error => {
  console.error(error);

  showRouteResult(
    "Could not load location data.",
    true
  );

  alert(
    "Could not load POI data. Check the browser console for details."
  );
});

// -------------------------
// Layer toggles
// -------------------------

document
  .getElementById("routesToggle")
  ?.addEventListener("change", event => {
    const showRoutes = event.target.checked;

    if (!routesLayer) {
      return;
    }

    if (showRoutes) {
      routesLayer.addTo(map);
    } else {
      map.removeLayer(routesLayer);
    }
  });

document
  .getElementById("poisToggle")
  ?.addEventListener("change", event => {
    const showPOIs = event.target.checked;

    if (!showPOIs) {
      if (poiLayer) {
        map.removeLayer(poiLayer);
      }

      return;
    }

    // Re-rendering ensures current filters are respected
    renderPOIs();
  });

// -------------------------
// POI filter listeners
// -------------------------

[
  "filterLift",
  "filterMainAccEntrance",
  "filterSpecificAccEntrance",
  "filterMainEntrance"
].forEach(id => {
  document
    .getElementById(id)
    ?.addEventListener(
      "change",
      renderPOIs
    );
});

// -------------------------
// Collapsible sidebar
// -------------------------

const sidebarToggleButton =
  document.getElementById("sidebarToggle");

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle(
    "sidebar-collapsed",
    collapsed
  );

  if (sidebarToggleButton) {
    sidebarToggleButton.textContent =
      collapsed ? "☰ Info" : "✕ Close";

    sidebarToggleButton.setAttribute(
      "aria-expanded",
      collapsed ? "false" : "true"
    );
  }

  // Leaflet needs a resize nudge after layout changes
  setTimeout(() => {
    map.invalidateSize();
  }, 50);
}

sidebarToggleButton?.addEventListener(
  "click",
  () => {
    const isCollapsed =
      document.body.classList.contains(
        "sidebar-collapsed"
      );

    setSidebarCollapsed(!isCollapsed);
  }
);

// Automatically collapse the sidebar on narrower screens
if (
  window.matchMedia?.("(max-width: 900px)").matches
) {
  setSidebarCollapsed(true);
}    iconUrl: "./icons/lift.svg",
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
