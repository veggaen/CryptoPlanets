// Phase 1: Debug & Logging Infrastructure
// Professional debugging tools with toggleable flags and URL parameter support

// ===== Debug Flags =====
// Control which areas produce debug output
export const DEBUG_FLAGS = {
    physics: false,        // Physics engine calculations
    data: false,           // API calls and data transformations
    camera: false,         // Camera/zoom/pan updates
    render: false,         // React rendering cycles
    collisions: false,     // Collision detection details
    performance: false,    // Performance metrics
    api: false,            // API service calls
};

type DebugArea = keyof typeof DEBUG_FLAGS;

// ===== Core Debug Logger =====
/**
 * Conditional logging based on debug flags
 * Only logs if the corresponding flag is enabled
 * 
 * Usage:
 *   debugLog('physics', 'Tick:', nodes.length, 'nodes');
 *   debugLog('data', 'Fetched chains:', chains);
 */
export function debugLog(area: DebugArea, ...args: any[]): void {
    if (!DEBUG_FLAGS[area]) return;

    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1); // HH:MM:SS.mmm
    const prefix = `[${timestamp}] [${area.toUpperCase()}]`;

    // eslint-disable-next-line no-console
    console.log(prefix, ...args);
}

// ===== Performance Timing =====
const timers = new Map<string, number>();

/**
 * Start a performance timer
 * 
 * Usage:
 *   debugTime('physics-tick', 'physics');
 *   // ... do work ...
 *   debugTimeEnd('physics-tick', 'physics');
 */
export function debugTime(label: string, area: DebugArea): void {
    if (!DEBUG_FLAGS[area] && !DEBUG_FLAGS.performance) return;
    timers.set(label, performance.now());
}

export function debugTimeEnd(label: string, area: DebugArea): void {
    if (!DEBUG_FLAGS[area] && !DEBUG_FLAGS.performance) return;

    const start = timers.get(label);
    if (start === undefined) {
        debugLog(area, `Timer '${label}' was never started`);
        return;
    }

    const elapsed = performance.now() - start;
    debugLog(area, `⏱️  ${label}: ${elapsed.toFixed(2)}ms`);
    timers.delete(label);
}

// ===== Debug Assertions =====
/**
 * Assert a condition is true, log error if false
 * Only runs when debug flag is enabled
 */
export function debugAssert(
    area: DebugArea,
    condition: boolean,
    message: string
): void {
    if (!DEBUG_FLAGS[area]) return;

    if (!condition) {
        console.error(`[${area.toUpperCase()}] Assertion failed: ${message}`);
        console.trace();
    }
}

// ===== Debug State Inspection =====
/**
 * Pretty-print an object for debugging
 */
export function debugInspect(area: DebugArea, label: string, obj: any): void {
    if (!DEBUG_FLAGS[area]) return;

    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.group(`[${timestamp}] [${area.toUpperCase()}] ${label}`);
    console.dir(obj, { depth: 3 });
    console.groupEnd();
}

// ===== URL Parameter Support =====
/**
 * Enable debug flags via URL parameters
 * Example: ?debug=physics,data
 * Example: ?debug=all
 */
if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const debugParam = params.get('debug');

    if (debugParam) {
        if (debugParam === 'all') {
            // Enable all debug flags
            Object.keys(DEBUG_FLAGS).forEach((key) => {
                DEBUG_FLAGS[key as DebugArea] = true;
            });
            console.log('[DEBUG] All debug flags enabled via ?debug=all');
        } else {
            // Enable specific flags
            const areas = debugParam.split(',').map(s => s.trim());
            areas.forEach((area) => {
                if (area in DEBUG_FLAGS) {
                    DEBUG_FLAGS[area as DebugArea] = true;
                    console.log(`[DEBUG] Enabled ${area} via URL param`);
                } else {
                    console.warn(`[DEBUG] Unknown debug area: ${area}`);
                }
            });
        }
    }
}

// ===== LocalStorage Persistence =====
/**
 * Save/load debug flags from localStorage
 */
export function saveDebugFlags(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('cryptoplanets_debug', JSON.stringify(DEBUG_FLAGS));
    console.log('[DEBUG] Flags saved to localStorage');
}

export function loadDebugFlags(): void {
    if (typeof window === 'undefined') return;

    const saved = localStorage.getItem('cryptoplanets_debug');
    if (!saved) return;

    try {
        const parsed = JSON.parse(saved);
        Object.keys(DEBUG_FLAGS).forEach((key) => {
            if (key in parsed) {
                DEBUG_FLAGS[key as DebugArea] = parsed[key];
            }
        });
        console.log('[DEBUG] Flags loaded from localStorage');
    } catch (error) {
        console.error('[DEBUG] Failed to load flags from localStorage', error);
    }
}

// Auto-load on initialization
if (typeof window !== 'undefined') {
    loadDebugFlags();
}

// ===== Global Debug Helper =====
// Expose to window for console access
if (typeof window !== 'undefined') {
    (window as any).debugFlags = DEBUG_FLAGS;
    (window as any).enableDebug = (area: DebugArea | 'all') => {
        if (area === 'all') {
            Object.keys(DEBUG_FLAGS).forEach(key => {
                DEBUG_FLAGS[key as DebugArea] = true;
            });
        } else {
            DEBUG_FLAGS[area] = true;
        }
        saveDebugFlags();
        console.log(`[DEBUG] Enabled: ${area}`);
    };
    (window as any).disableDebug = (area: DebugArea | 'all') => {
        if (area === 'all') {
            Object.keys(DEBUG_FLAGS).forEach(key => {
                DEBUG_FLAGS[key as DebugArea] = false;
            });
        } else {
            DEBUG_FLAGS[area] = false;
        }
        saveDebugFlags();
        console.log(`[DEBUG] Disabled: ${area}`);
    };

    console.log('[DEBUG] Type enableDebug("physics") or disableDebug("all") in console');
}
