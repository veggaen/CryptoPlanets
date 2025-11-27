// Phase 1: Configuration - Physics Constants
// All physics-related tunable values for the galaxy simulation
// Based on N-body lite with soft repulsion and damping

export const physicsConfig = {
    // ===== Orbital Motion (Deterministic) =====
    baseChainAngularVel: 0.0002,    // Base angular velocity for chain orbits (radians/frame)
    baseTokenAngularVel: 0.0008,    // Moons orbit at comfortable visible speed
    orbitSpeedFalloff: 0.2,         // How much orbit speed decreases with distance

    // ===== Gravity & Physics (N-Body Lite) =====
    sunGravity: 0.015,              // REDUCED - gentle pull, not a vortex
    planetGravity: 0.008,           // REDUCED - planets gently pull moons
    moonGravity: 0.002,             // REDUCED - moons gently pull asteroids
    friction: 0.96,                 // MORE friction for stability (4% loss per tick)
    moonFriction: 0.88,             // HEAVY friction for moons (12% loss) - prevents bounce storms
    repulsion: 8.0,                 // STRONG repulsion for 9x scale - prevent pass-through
    repulsionCrossChain: 2.0,       // Cross-chain repulsion - visible but weaker
    damper: 0.85,                   // Higher damping = more grinding, less bouncing

    // ===== Stability & Limits =====
    orbitCorrectionStrength: 0.04,  // 80/20 BLEND: 4% correction per tick pulls back to orbit
    maxVelocity: 4,                 // LOWER cap - prevent explosions, keep motion slow/cosmic

    // ===== Collision & Visuals =====
    collidePadding: 40,             // Extra spacing for collision detection (px) - 9x scale
    collisionGlowDecay: 0.92,       // How fast collision glow fades (per frame)

    // ===== Bounds (Prevent Escape) ===== - 9x SCALE (MASSIVE SPACE)
    galaxyBounds: 150000,           // Max distance from center (px) - HUGE space, no walls
    boundsSoftness: 0.05,           // Very soft boundary push

    // ===== Object Limits =====
    maxChains: 10,                  // Maximum number of chains to display
    tokensPerChain: 20,             // Maximum tokens per chain

    // ===== Size Ranges (SQRT SCALING) - 9x SCALE =====
    // BTC sun radius 5400px => ETH (5x smaller cap) => radius = 5400/sqrt(5) = ~2415px
    minPlanetRadius: 720,           // Smallest planet size (px) - 9x
    maxPlanetRadius: 3150,          // Largest planet size (px) - 9x MASSIVE planets
    minTokenRadius: 45,             // Smallest token/moon size (px) - 9x
    maxTokenRadius: 360,            // Largest token/moon size (px) - 9x room for differentiation
    asteroidBaseRadius: 27,         // Base radius for asteroids/meteorites - 9x

    // ===== BTC (Sun) Properties =====
    sunRadius: 5400,                // Sun's visual radius (px) - 9x MASSIVE
    sunMass: 1000,                  // Mass for gravity calculations
    sunGlowRadius: 1350,            // Extra visual glow around sun (px) - 9x

    // ===== Orbit Radius Calculation ===== - 9x SCALE
    basePlanetOrbit: 10800,         // Base orbit for first planet (px) - 9x far from massive sun
    planetOrbitStep: 6300,          // Additional radius per planet (px) - 9x
    planetSafetyPadding: 1800,      // Extra padding between planet systems (px) - 9x

    // ===== Token/Moon Orbit ===== - 9x SCALE
    baseMoonOrbitRadius: 1080,      // Starting radius for moon belt from planet edge (px) - 9x
    moonOrbitRadiusVariance: 720,   // Random variance in orbit radius (px) - 9x creates messy field
    moonOrbitEccentricity: 0.25,    // Max orbit eccentricity (0 = circle, 1 = very elliptical)

    // ===== Moon Ring System =====
    moonSlotsPerRing: 8,            // Slots per ring for moon distribution
    moonRingStep: 540,              // Distance between moon rings (px) - 9x spread
    
    // ===== Moon Physics (Asteroid Field) =====
    moonGravitationalPull: 0.0008,  // How much moons pull on each other
    moonOrbitCorrection: 0.002,     // Gentle pull back toward base orbit
    moonMaxOrbitDeviation: 2000,    // Max distance from base orbit before strong pull back (px)
    moonVelocityDamping: 0.995,     // Slight velocity decay per tick
    moonAngleWobble: 0.15,          // Random wobble in orbit angle per tick

    // ===== Moons vs Meteorites =====
    maxMoonsPerPlanet: 24,          // Max moons per planet - matches tokensPerChain in dataConfig
    maxMeteoritesPerPlanet: 8,      // Fewer meteorites
    moonMinRadius: 72,              // Minimum moon radius (px) - 9x
    moonMaxRadius: 450,             // Maximum moon radius (px) - 9x BIG moons
    meteoriteMinRadius: 27,         // Minimum meteorite radius (px) - 9x
    meteoriteMaxRadius: 72,         // Maximum meteorite radius (px) - 9x
    meteoriteOrbitRadius: 270,      // Orbit radius around parent moon (px) - 9x

    // ===== Performance =====
    updateInterval: 16,             // Target ms per physics tick (60fps = 16.67ms)
    maxDeltaTime: 32,               // Cap delta time to prevent large jumps (ms)
} as const;

// Type helper for accessing config values
export type PhysicsConfig = typeof physicsConfig;
