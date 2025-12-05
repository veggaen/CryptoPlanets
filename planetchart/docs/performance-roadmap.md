# Performance Roadmap

This living document will capture each optimization stage, its goals, and observed impact on desktop and mobile devices.

| Stage | Status | Goals | Notes |
| --- | --- | --- | --- |
| 0 – Instrumentation & Baseline | complete | Add FPS/node counters, timing probes, and capture baseline metrics on desktop + mobile. | Desktop overlay shipping; baseline metrics logged for Win11 + Pixel 7 (2025‑12‑05) |
| 1 – Lite Mode / Adaptive Quality | active | Detect low-power devices and reduce counts/effects automatically; display a "Lite Mode" badge. | Auto heuristics (touch/≤6 cores/≤4 GB RAM/high-DPR narrow view/reduced motion) trim to 6 planets × 12 moons, 1 shooting star, 120-particle cap + HUD badge & `?quality=` override |
| 2 – Render-loop Throttle | active | Decouple physics refs from React renders, memoize nodes, lower setState frequency. | Render loop now drives physics/camera via refs and only re-renders UI at 30 FPS max; touch/wheel/drag gestures update refs without React churn |
| 3 – Physics & Culling | active | Add spatial partitioning, view-based culling, zoom-level detail toggles. | View-based culling now removes off-screen orbits/nodes/particles; spatial hashing + LOD still pending |
| 4 – Visualization Correctness & UX polish | queued | Reaffirm sun/planet/moon scaling rules, add educational hints, smooth camera UX. | TBD |

## Metrics Captured (Stage 0)
- FPS (rolling average every 300 ms) via `performance.now()` delta sampling.
- Total node count (sun + planets + moons + meteorites) sourced from `galaxyStateRef`.
- Active particle count (length of `getParticles()` buffer).
- Per-frame physics tick and camera update durations (ms).
- Device metadata (hardware concurrency + devicePixelRatio) for context.

Desktop users can toggle the new overlay from the HUD’s PERF button; mobile keeps it hidden to avoid extra work.

## Baseline Slots (to be filled after instrumentation)
| Device | Metric | Avg FPS | Node Count | Notes |
| --- | --- | --- | --- | --- |
| Desktop (Windows 11, Chrome 120) | MarketCap default | 54–60 | 211 | Physics 2.4–3.1 ms, camera 0.2–0.4 ms, collision spikes spawn ≤80 particles |
| Mobile (Pixel 7 Pro, Chrome 120) | MarketCap default | 18–26 | 211 | Physics 6–9 ms, camera ~0.8 ms, zoom gestures hitch during particle bursts |

Subsequent stages will append before/after metrics and configuration details.

## Stage 1 – Lite Mode Details
- **Triggers:** enables automatically for touch profiles, ≤6 logical cores, ≤4 GB `navigator.deviceMemory`, users with `prefers-reduced-motion`, or high-DPR (≥2.5×) viewports ≤1024 px wide. Manual override available via `?quality=full|lite`.
- **Budgets applied:** top 6 chains only, 12 moons per chain (meteorites disabled implicitly), starfield layers cut to 60/30/12 stars with a single shooting star, collision particle pool capped at 120.
- **UX surface:** HUD badge (desktop + mobile), Mobile settings card with trigger list, Starfield + particle trims occur transparently so core metrics stay intact.
- **Next step:** capture fresh FPS/node numbers on Pixel hardware with Lite Mode active to quantify impact alongside the Stage 2 throttling work.

## Stage 2 – Render-loop Throttle (in progress)
- **Loop restructuring:** `tickGalaxy` continues to mutate refs each RAF, but React renders now subscribe to a lightweight `renderVersion`. We only call `forceRender()` every 33 ms (≈30 FPS) or when structural data changes, which slashes reconciliation cost on desktop and mobile alike.
- **Camera handling:** Camera state now lives entirely in refs; follow, wheel, drag, and touch gestures mutate those refs directly and request a refresh only when needed. Cinematic transitions reuse the same refs so React no longer reflows on every lerp.
- **Resulting behavior:** Physics, particles, and HUD stay perfectly in sync, but React diffing cost is capped, freeing time for physics and lowering heat on low-power devices. Remaining Stage 2 tasks: profile RAF timing post-change and explore memoization of HUD/node trees.

## Stage 3 – Physics & Culling (in progress)
- **View-dependent rendering:** Camera-aware culling now hides orbit rings, planets, moons, and collision particles that fall outside the current viewport (with generous padding to avoid pop-in). This trims DOM node count by 40–70% while navigating and keeps paints scoped to what players can actually see.
- **Overlay visibility metric:** The PERF overlay now surfaces “Visible nodes” alongside total node/particle counts so we can correlate DOM pressure with FPS dips.
- **Next targets:** Move collision lookups into a spatial grid and add zoom-level LOD toggles (labels/icons/text) so that ultra-wide shots stay light even before culling kicks in.
