// Phase 1: Configuration - Physics Constants
// All physics-related tunable values for the galaxy simulation
// Based on N-body lite with soft repulsion and damping

export const physicsConfig = {
    // ===== Debug Aids =====
    enableOrbitDebug: false,
    orbitDebugRadiusThreshold: 120,   // px change within single frame before logging
    orbitDebugAngleThreshold: 0.25,   // radians change before logging (~14 degrees)
    railSnapLerp: 0.1,                // How aggressively nodes slide back to rail when calm (1 = instant)

    // ===== Orbital Motion (Deterministic) =====
    baseChainAngularVel: 0.00014,   // Lowered to ease planet drift
    baseTokenAngularVel: 0.0005,    // Moons orbit at calmer pace
    orbitSpeedFalloff: 0.28,        // Sharper falloff keeps distant objects slower

    // ===== Gravity & Physics (N-Body Lite) =====
    sunGravity: 0.015,              // REDUCED - gentle pull, not a vortex
    planetGravity: 0.008,           // REDUCED - planets gently pull moons
    moonGravity: 0.002,             // REDUCED - moons gently pull asteroids
    friction: 0.94,                 // Added drag to bleed energy faster
    moonFriction: 0.84,             // More loss for moons to prevent whiplash
    repulsion: 8.0,                 // STRONG repulsion for 9x scale - prevent pass-through
    repulsionCrossChain: 2.0,       // Cross-chain repulsion - visible but weaker
    damper: 0.85,                   // Higher damping = more grinding, less bouncing

    // ===== Stability & Limits =====
    orbitCorrectionStrength: 0.05,  // Slightly stronger correction to stop over-shoots
    maxVelocity: 3.2,               // Lower cap to avoid sudden darts

    // ===== Planetary Field (Option B) =====
    fieldInnerPadding: 140,         // Gap from planet surface to moon field start (px)
    fieldBaseThickness: 900,        // Base width of the controllable moon field (px)
    fieldPerMoonSpread: 18,         // Widens the band per moon to honor option B density scaling
    fieldMoonSizeSpread: 1.15,      // Extra width per px of average moon radius
    fieldInnerSizeBias: 0.28,       // Push inner wall outward based on moon radius
    fieldOuterSizeBias: 1.1,        // Push outer wall outward based on moon radius
    fieldSpringStrength: 0.3,       // How hard calm moons steer back inside the band (0-1)
    fieldRelaxRate: 0.06,           // Rate deterministic orbit eases toward field midpoint
    fieldVelocitySpring: 0.016,     // Radial acceleration applied in free flight when breaching
    fieldBoundaryDamping: 0.88,     // Damping when bouncing off the field boundary

    // ===== Collision & Visuals =====
    collidePadding: 40,             // Extra spacing for collision detection (px) - 9x scale
    collisionGlowDecay: 0.92,       // How fast collision glow fades (per frame)

    // ===== Bounds (Prevent Escape) ===== - 9x SCALE (MASSIVE SPACE)
    galaxyBounds: 150000,           // Max distance from center (px) - HUGE space, no walls
    boundsSoftness: 0.05,           // Very soft boundary push

    // ===== Object Limits =====
    maxChains: 16,                  // Maximum number of chains to display
    tokensPerChain: 24,             // Maximum tokens per chain

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
    moonOrbitRadiusVariance: 600,   // Tighten variance to keep belts cohesive
    moonOrbitEccentricity: 0.14,    // Further trim eccentricity to reduce erratic swings

    // ===== Moon Ring System =====
    moonSlotsPerRing: 8,            // Slots per ring for moon distribution
    moonRingStep: 540,              // Distance between moon rings (px) - 9x spread
    
    // ===== Moon Physics (Asteroid Field) =====
    moonGravitationalPull: 0.00055, // Softer cross-moon tug to avoid jitter
    moonOrbitCorrection: 0.0024,    // Slightly stronger pull back toward base orbit
    moonMaxOrbitDeviation: 1500,    // Clamp excursions sooner
    moonVelocityDamping: 0.989,     // Extra damping per tick to bleed energy
    moonAngleWobble: 0.05,          // Further reduce random wobble per tick

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
