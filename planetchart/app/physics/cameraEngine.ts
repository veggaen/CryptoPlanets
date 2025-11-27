// Camera Engine - Orbital Follow & Smooth Transitions
// Implements smooth camera tracking, orbital lock, and zoom controls

import type { CameraState } from "@/types/galaxy";
import { uiConfig } from "@/config/uiConfig";

// ===== CAMERA CONFIGURATION =====
const CAMERA_CONFIG = {
    // Follow mode settings
    followLerpSpeed: 0.08,        // How fast camera catches up to target (0-1, higher = faster)
    followZoomDistance: 0.15,     // Zoom level when following a planet
    followSunZoomDistance: 0.08,  // Zoom level when following the sun
    
    // Transition smoothing
    transitionDuration: 1000,     // ms for smooth zoom transitions
    zoomLerpSpeed: 0.05,          // Zoom interpolation speed
    
    // Zoom limits - EXPANDED for full galaxy view
    minZoom: 0.005,               // Allow extreme zoom out to see entire galaxy
    maxZoom: 2.0,                 // Allow close-up viewing
    
    // Orbit offset - adds slight offset to following position
    orbitViewOffset: 0,           // No offset = planet centered perfectly
};

export { CAMERA_CONFIG };

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

