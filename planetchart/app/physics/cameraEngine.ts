// Camera Engine - Orbital Follow & Smooth Transitions
// Implements smooth camera tracking, orbital lock, and zoom controls

import type { CameraState } from "@/types/galaxy";
import { uiConfig } from "@/config/uiConfig";

// ===== CAMERA CONFIGURATION =====
const CAMERA_CONFIG = {
    // Follow mode settings
    followLerpSpeed: 0.12,        // How fast camera catches up to target (0-1, higher = faster)
    followZoomDistance: 0.15,     // Zoom level when following a planet
    followSunZoomDistance: 0.08,  // Zoom level when following the sun
    
    // Transition smoothing
    transitionDuration: 1000,     // ms for smooth zoom transitions
    zoomLerpSpeed: 0.15,          // Zoom interpolation speed - SMOOTH zoom while following
    
    // Zoom limits - EXPANDED for full galaxy view
    minZoom: 0.003,               // Allow extreme zoom out to see entire galaxy
    maxZoom: 3.0,                 // Allow close-up viewing of small moons
    
    // Orbit offset - adds slight offset to following position
    orbitViewOffset: 0,           // No offset = planet centered perfectly
    
    // Cinematic transition settings - SMOOTH ARC
    cinematicDuration: 3500,      // Total transition time in ms (slower, more cinematic)
    galaxyOverviewZoom: 0.012,    // Zoom level at apex of the arc
    arcHeight: 0.6,               // How much to "lift" the camera path (0-1, higher = more arc)
};

export { CAMERA_CONFIG };

// ===== CINEMATIC TRANSITION TYPES =====
export type CameraTransitionPhase = 'idle' | 'zoom-out' | 'pan' | 'zoom-in';

export type CameraTransition = {
    active: boolean;
    phase: CameraTransitionPhase;
    progress: number;              // 0-1 overall progress
    startTime: number;
    duration: number;
    
    // Start state
    startX: number;
    startY: number;
    startZoom: number;
    
    // Target state
    targetNodeId: string;
    targetX: number;
    targetY: number;
    targetZoom: number;
    
    // Center (sun) for midpoint
    centerX: number;
    centerY: number;
};

/**
 * Create a new cinematic camera transition
 * This creates the "swoosh" effect: zoom out → pan via center → zoom in
 */
export function createCinematicTransition(
    currentCamera: { x: number; y: number; zoom: number },
    targetNodeX: number,
    targetNodeY: number,
    targetNodeId: string,
    targetZoom: number,
    sunX: number = 0,
    sunY: number = 0,
    duration: number = CAMERA_CONFIG.cinematicDuration
): CameraTransition {
    return {
        active: true,
        phase: 'zoom-out',
        progress: 0,
        startTime: performance.now(),
        duration,
        
        startX: currentCamera.x,
        startY: currentCamera.y,
        startZoom: currentCamera.zoom,
        
        targetNodeId,
        targetX: targetNodeX,
        targetY: targetNodeY,
        targetZoom,
        
        centerX: sunX,
        centerY: sunY,
    };
}

/**
 * Easing function for smooth animation (ease-in-out sine - very smooth)
 */
function easeInOutSine(t: number): number {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * Easing function for smooth animation (ease-in-out cubic)
 */
function easeInOutCubic(t: number): number {
    return t < 0.5 
        ? 4 * t * t * t 
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Smooth step function - very gentle S-curve
 */
function smoothStep(t: number): number {
    return t * t * (3 - 2 * t);
}

/**
 * Parabolic arc function - like throwing a ball
 * Returns height (0-1) for a given progress (0-1)
 * Peak is at t=0.5
 */
function parabolicArc(t: number): number {
    // 4t(1-t) gives a perfect parabola peaking at 1 when t=0.5
    return 4 * t * (1 - t);
}

/**
 * Update cinematic transition - call every frame
 * Uses a smooth PARABOLIC ARC like throwing a ball through the air
 * - Position interpolates smoothly from start to target
 * - Zoom follows a parabolic arc: zooms out at the apex, in at the ends
 */
export function updateCinematicTransition(
    transition: CameraTransition,
    currentTime: number,
    currentTargetX: number,  // Live position (for orbiting targets)
    currentTargetY: number
): { 
    camera: { x: number; y: number; zoom: number }; 
    transition: CameraTransition;
    complete: boolean;
} {
    const elapsed = currentTime - transition.startTime;
    const rawProgress = Math.min(1, elapsed / transition.duration);
    
    // Use smooth sine easing for overall progress - very gentle acceleration/deceleration
    const progress = easeInOutSine(rawProgress);
    
    // Determine phase for UI display (but movement is continuous)
    let phase: CameraTransitionPhase;
    if (rawProgress < 0.33) {
        phase = 'zoom-out';
    } else if (rawProgress < 0.67) {
        phase = 'pan';
    } else {
        phase = 'zoom-in';
    }
    
    // ========== SMOOTH PARABOLIC ZOOM ==========
    // Zoom follows a parabola: starts at startZoom, peaks at overviewZoom, ends at targetZoom
    // The "height" of the arc represents how zoomed out we are
    
    const arcHeight = parabolicArc(progress); // 0 at start/end, 1 at middle
    
    // Interpolate between the "ground level" zooms (start/target) based on progress
    const groundZoom = transition.startZoom + (transition.targetZoom - transition.startZoom) * progress;
    
    // The overview zoom represents our "apex" - how high we go
    const overviewZoom = CAMERA_CONFIG.galaxyOverviewZoom;
    
    // Calculate how much we need to "lift" from ground to reach overview
    // Only lift if overview is smaller (more zoomed out) than ground
    const maxLift = Math.max(0, groundZoom - overviewZoom);
    
    // Apply the arc to zoom - we subtract because smaller zoom = more zoomed out = "higher"
    const zoom = groundZoom - (maxLift * arcHeight * CAMERA_CONFIG.arcHeight);
    
    // ========== SMOOTH CURVED POSITION ==========
    // Position follows a curved path, not straight line
    // We curve toward the center (sun) during the middle of the journey
    
    // Start and end camera positions (accounting for zoom at those points)
    const startCamX = transition.startX;
    const startCamY = transition.startY;
    const endCamX = -currentTargetX * transition.targetZoom;
    const endCamY = -currentTargetY * transition.targetZoom;
    
    // Center point (sun) - this is our curve attractor
    const centerCamX = -transition.centerX * overviewZoom;
    const centerCamY = -transition.centerY * overviewZoom;
    
    // Quadratic Bezier curve: start → center (control point) → end
    // B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
    const t = progress;
    const mt = 1 - t;
    
    // How much the path curves toward center (0 = straight line, 1 = full curve through center)
    const curveFactor = CAMERA_CONFIG.arcHeight;
    
    // Control point is pulled toward center based on curve factor
    const controlX = startCamX + (centerCamX - startCamX) * curveFactor + (endCamX - startCamX) * 0.5 * (1 - curveFactor);
    const controlY = startCamY + (centerCamY - startCamY) * curveFactor + (endCamY - startCamY) * 0.5 * (1 - curveFactor);
    
    // Quadratic Bezier interpolation
    const bezierX = mt * mt * startCamX + 2 * mt * t * controlX + t * t * endCamX;
    const bezierY = mt * mt * startCamY + 2 * mt * t * controlY + t * t * endCamY;
    
    // Adjust position for current zoom level (since we're zooming during the flight)
    // The bezier gives us a nice curved path, but we need to account for zoom changes
    const zoomRatio = zoom / transition.targetZoom;
    const x = -currentTargetX * zoom + (bezierX - endCamX) * (1 - progress);
    const y = -currentTargetY * zoom + (bezierY - endCamY) * (1 - progress);
    
    // Blend between bezier path and direct tracking based on progress
    // Early: follow bezier curve, Late: track target directly
    const trackingBlend = smoothStep(progress);
    const directX = -currentTargetX * zoom;
    const directY = -currentTargetY * zoom;
    
    const finalX = bezierX * (1 - trackingBlend * 0.5) + directX * (trackingBlend * 0.5) + 
                   (directX - bezierX) * progress * progress;
    const finalY = bezierY * (1 - trackingBlend * 0.5) + directY * (trackingBlend * 0.5) + 
                   (directY - bezierY) * progress * progress;
    
    const complete = rawProgress >= 1;
    
    return {
        camera: { x: finalX, y: finalY, zoom },
        transition: {
            ...transition,
            progress: rawProgress,
            phase,
            active: !complete,
        },
        complete,
    };
}

/**
 * Create default camera state
 */
export function createDefaultCamera(): CameraState {
    return {
        x: 0,
        y: 0,
        zoom: uiConfig.defaultZoom,
        vx: 0,
        vy: 0,
        followNodeId: null,
    };
}

/**
 * Calculate target camera position for following a node
 * Returns the camera offset needed to center the node on screen
 */
export function calculateFollowPosition(
    nodeX: number,
    nodeY: number,
    viewportWidth: number,
    viewportHeight: number,
    zoom: number
): { x: number; y: number } {
    // Camera position is the offset needed to center the node
    // Node is at (nodeX, nodeY) in world space
    // We need camera at (-nodeX * zoom, -nodeY * zoom) to center it
    // But since viewport is centered, we just need the negative node position
    return {
        x: -nodeX * zoom,
        y: -nodeY * zoom,
    };
}

/**
 * Smoothly interpolate camera to target position
 * Uses lerp (linear interpolation) with configurable speed
 */
export function lerpCamera(
    current: { x: number; y: number; zoom: number },
    target: { x: number; y: number; zoom: number },
    speed: number
): { x: number; y: number; zoom: number } {
    return {
        x: current.x + (target.x - current.x) * speed,
        y: current.y + (target.y - current.y) * speed,
        zoom: current.zoom + (target.zoom - current.zoom) * speed,
    };
}

/**
 * Calculate ideal zoom level for viewing a node based on its size
 */
export function calculateIdealZoom(
    nodeRadius: number,
    nodeType: 'sun' | 'planet' | 'moon',
    viewportWidth: number,
    viewportHeight: number
): number {
    const minViewportDim = Math.min(viewportWidth, viewportHeight);
    
    // We want the node to take up about 20-30% of the viewport
    const targetVisualSize = minViewportDim * 0.25;
    const idealZoom = targetVisualSize / (nodeRadius * 2);
    
    // Clamp to reasonable range based on node type
    if (nodeType === 'sun') {
        return Math.max(0.02, Math.min(0.15, idealZoom));
    } else if (nodeType === 'planet') {
        return Math.max(0.05, Math.min(0.5, idealZoom));
    } else {
        return Math.max(0.2, Math.min(1.5, idealZoom));
    }
}

/**
 * Focus camera on a specific node with smooth transition
 * Returns new camera state
 */
export function focusOnNode(
    camera: CameraState,
    nodeX: number,
    nodeY: number,
    nodeRadius: number,
    nodeType: 'sun' | 'planet' | 'moon',
    viewportWidth: number,
    viewportHeight: number
): CameraState {
    const targetZoom = calculateIdealZoom(nodeRadius, nodeType, viewportWidth, viewportHeight);
    
    return {
        ...camera,
        x: -nodeX * targetZoom,
        y: -nodeY * targetZoom,
        zoom: targetZoom,
    };
}

/**
 * Update camera in follow mode - should be called every frame
 * Smoothly tracks the followed node as it orbits
 */
export function updateFollowCamera(
    camera: { x: number; y: number; zoom: number },
    targetNodeX: number,
    targetNodeY: number,
    currentZoom: number,
    lerpSpeed: number = CAMERA_CONFIG.followLerpSpeed
): { x: number; y: number; zoom: number } {
    // Target position: center the node on screen
    const targetX = -targetNodeX * currentZoom;
    const targetY = -targetNodeY * currentZoom;
    
    // Smoothly interpolate to target
    return {
        x: camera.x + (targetX - camera.x) * lerpSpeed,
        y: camera.y + (targetY - camera.y) * lerpSpeed,
        zoom: currentZoom,
    };
}

