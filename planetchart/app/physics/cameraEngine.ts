// Phase 1: Camera Engine (Stub)
// Camera pan/zoom/inertia logic - REAL IMPLEMENTATION IN PHASE 2

import type { CameraState, CameraInput } from "@/types/galaxy";
import { uiConfig } from "@/config/uiConfig";
import { debugLog } from "@/utils/debug";

/**
 * Update camera state based on input
 * Phase 2: Will implement smooth zoom, pan inertia, targeting
 */
export function updateCamera(
    camera: CameraState,
    input: CameraInput,
    dt: number
): CameraState {
    debugLog('camera', `updateCamera called with input type: ${input.type} (Phase 1 stub)`);

    // Phase 1: Return unchanged camera
    throw new Error("Not implemented: Phase 2 - updateCamera");
}

/**
 * Initialize camera to default state
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
 * Focus camera on a specific node
 * Phase 2: Will smoothly pan/zoom to node
 */
export function focusOnNode(camera: CameraState, nodeX: number, nodeY: number): CameraState {
    debugLog('camera', `focusOnNode called (Phase 1 stub)`);

    // Phase 1: Stub
    return camera;
}
