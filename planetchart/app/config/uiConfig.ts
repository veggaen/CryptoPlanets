// Phase 1: Configuration - UI/UX Constants
// Zoom, pan, fonts, LOD thresholds, and visual settings

export const uiConfig = {
    // ===== Zoom Settings =====
    minZoom: 0.3,                   // Minimum zoom level (zoomed out)
    maxZoom: 3.0,                   // Maximum zoom level (zoomed in)
    zoomStep: 0.1,                  // Zoom increment per scroll tick
    zoomSmoothness: 0.15,           // Interpolation factor for smooth zoom (0-1)
    defaultZoom: 1.0,               // Initial zoom level

    // ===== Pan/Camera Settings =====
    panDragInertia: 0.92,           // How much velocity persists after drag release
    panFriction: 0.95,              // Deceleration rate for pan inertia
    panSmoothness: 0.2,             // Interpolation for smooth camera movement

    // ===== Font Sizes (base, scaled by zoom) =====
    sunFontSize: 24,                // BTC text size (px)
    planetSymbolSize: 16,           // Chain symbol (e.g., "ETH")
    planetDataSize: 11,             // Secondary planet info (price, %)
    tokenSymbolSize: 10,            // Token symbol
    tokenDataSize: 8,               // Token secondary info

    // ===== Level of Detail (LOD) Thresholds =====
    hideTokensZoomThreshold: 0.7,   // Hide moons when zoom < this value
    simplifyOrbitsZoomThreshold: 0.5, // Simplify orbital trails when zoom < this
    hidePlanetLabelsZoom: 0.4,      // Hide planet text labels when zoom < this
    showTokenLabelsZoom: 1.5,       // Show token labels when zoom > this

    // ===== Colors & Backgrounds =====
    backgroundColor: "#000000",      // Main background color
    gridColor: "rgba(255,255,255,0.05)", // Optional grid overlay
    trailOpacity: 0.2,              // Opacity of orbital trails
    trailWidth: 1,                  // Width of orbital trail lines (px)

    // ===== Interaction =====
    hoverScalePlanet: 1.04,         // Scale multiplier on planet hover
    hoverScaleToken: 1.1,           // Scale multiplier on token hover
    hoverTransitionDuration: 0.25,  // Hover animation duration (seconds)
    clickSelectDuration: 0.3,       // Click/select animation duration (seconds)

    // ===== Layout =====
    headerPadding: 20,              // Top header padding (px)
    controlsPadding: 16,            // Control panel padding (px)
    tooltipOffset: 10,              // Distance from cursor for tooltips (px)

    // ===== Animation =====
    fadeInDuration: 0.6,            // Fade-in time for new objects (seconds)
    fadeInStagger: 0.04,            // Delay between each object fade-in (seconds)
    metricChangeDuration: 0.8,      // Duration when switching weight modes (seconds)

    // ===== Performance =====
    renderThrottleMs: 16,           // Min ms between renders (60fps)
    maxVisibleTokens: 500,          // Limit total rendered tokens for performance
} as const;

// Type helper
export type UIConfig = typeof uiConfig;
