// Phase 1: Configuration - Physics Constants
// All physics-related tunable values for the galaxy simulation
// Based on D3-force style with no bouncy/spring effects

export const physicsConfig = {
    // ===== Orbital Motion (Deterministic) =====
    baseChainAngularVel: 0.0005,    // Base angular velocity for chain orbits (radians/frame)
    baseTokenAngularVel: 0.002,     // Tokens orbit faster than planets
    orbitSpeedFalloff: 0.15,        // How much orbit speed decreases with distance

    // ===== Collision Wobble (Visual Only) =====
    wobbleDecay: 0.95,              // Rapid decay for wobble velocity
    wobbleStrength: 0.05,           // Strength of repulsion when overlapping
    collidePadding: 8,              // Extra spacing for collision detection (px)
    collisionIterations: 2,         // Number of collision checks per frame

    // ===== Object Limits =====
    maxChains: 10,                  // Maximum number of chains to display
    tokensPerChain: 20,             // Maximum tokens per chain

    // ===== Size Ranges =====
    minPlanetRadius: 30,            // Smallest planet size (px)
    maxPlanetRadius: 120,           // Largest planet size (px)
    minTokenRadius: 4,              // Smallest token/moon size (px)
    maxTokenRadius: 15,             // Largest token/moon size (px)

    // ===== BTC (Sun) Properties =====
    sunRadius: 160,                 // Sun's visual radius (px)
    sunMass: 1000,                  // Mass for gravity calculations

    // ===== Orbit Radius Calculation =====
    minOrbitRadius: 280,            // Minimum orbit distance from sun (px)
    orbitSpacing: 140,              // Distance between concentric chain orbits (px)

    // ===== Token/Moon Orbit =====
    tokenOrbitMinRadius: 50,        // Min distance from parent planet (px)
    tokenOrbitMaxRadius: 110,       // Max distance from parent planet (px)

    // ===== Performance =====
    updateInterval: 16,             // Target ms per physics tick (60fps = 16.67ms)
    maxDeltaTime: 32,               // Cap delta time to prevent large jumps (ms)
} as const;

// Type helper for accessing config values
export type PhysicsConfig = typeof physicsConfig;
