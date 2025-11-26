// Phase 1: Configuration - Physics Constants
// All physics-related tunable values for the galaxy simulation
// Based on N-body lite with soft repulsion and damping

export const physicsConfig = {
    // ===== Orbital Motion (Deterministic) =====
    baseChainAngularVel: 0.0005,    // Base angular velocity for chain orbits (radians/frame)
    baseTokenAngularVel: 0.002,     // Tokens orbit faster than planets
    orbitSpeedFalloff: 0.15,        // How much orbit speed decreases with distance

    // ===== Gravity & Physics (N-Body Lite) =====
    sunGravity: 0.1,                // Gravity constant for Sun pulling everything
    planetGravity: 0.02,            // Gravity constant for Planets pulling Moons
    moonGravity: 0.005,             // Gravity constant for Moons pulling Asteroids
    friction: 0.99,                 // Velocity damping per tick (0.99 = 1% loss)
    moonFriction: 0.95,             // ADDED: Extra friction for fast-orbiting moons
    repulsion: 4,                   // Soft repulsion force strength (reduced for gentleness)
    damper: 0.5,                    // Collision velocity damping (0-1, for inelastic collisions)

    // ===== Stability & Limits =====
    orbitCorrectionStrength: 0.05,  // Strength of "tether" to ideal orbit (restored from 0.01)
    maxVelocity: 15,                // Cap on maximum velocity to prevent explosions

    // ===== Collision & Visuals =====
    collidePadding: 2,              // Extra spacing for collision detection (px)
    collisionGlowDecay: 0.9,        // How fast collision glow fades (per frame)

    // ===== Object Limits =====
    maxChains: 10,                  // Maximum number of chains to display
    tokensPerChain: 20,             // Maximum tokens per chain

    // ===== Size Ranges =====
    minPlanetRadius: 30,            // Smallest planet size (px)
    maxPlanetRadius: 120,           // Largest planet size (px)
    minTokenRadius: 4,              // Smallest token/moon size (px)
    maxTokenRadius: 15,             // Largest token/moon size (px)
    asteroidBaseRadius: 2,          // Base radius for asteroids/meteorites

    // ===== BTC (Sun) Properties =====
    sunRadius: 160,                 // Sun's visual radius (px)
    sunMass: 1000,                  // Mass for gravity calculations
    sunGlowRadius: 50,              // Extra visual glow around sun (px)

    // ===== Orbit Radius Calculation =====
    basePlanetOrbit: 500,           // Base orbit for first planet (px)
    planetOrbitStep: 250,           // Additional radius per planet (px)
    planetSafetyPadding: 80,        // Extra padding between planet systems (px)

    // ===== Token/Moon Orbit =====
    baseMoonOrbitRadius: 60,        // Starting radius for moon belt from planet center (px)

    // ===== Moon Ring System =====
    moonSlotsPerRing: 8,            // Number of moon slots per ring/belt
    moonRingStep: 35,               // Distance between moon rings (px)

    // ===== Moons vs Meteorites =====
    maxMoonsPerPlanet: 12,          // Max liquid tokens (moons) per chain
    maxMeteoritesPerPlanet: 30,     // Max illiquid tokens (meteorites) per chain
    moonMinRadius: 8,               // Minimum moon radius (px)
    moonMaxRadius: 24,              // Maximum moon radius (px)
    meteoriteMinRadius: 1.5,        // Minimum meteorite radius (px)
    meteoriteMaxRadius: 4,          // Maximum meteorite radius (px)
    meteoriteOrbitRadius: 15,       // Orbit radius around parent moon (px)

    // ===== Performance =====
    updateInterval: 16,             // Target ms per physics tick (60fps = 16.67ms)
    maxDeltaTime: 32,               // Cap delta time to prevent large jumps (ms)
} as const;

// Type helper for accessing config values
export type PhysicsConfig = typeof physicsConfig;
