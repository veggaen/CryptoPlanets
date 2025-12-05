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
- New (2025‑12‑05): the PERF overlay now keeps a 10 s rolling history, surfaces avg/min/max FPS and physics timings, and adds a “Copy summary” action that logs + copies the latest window for pasting into this doc without relying on screenshots.

Desktop users can toggle the new overlay from the HUD’s PERF button; mobile keeps it hidden to avoid extra work.

## Baseline Slots (to be filled after instrumentation)
| Device | Metric | Avg FPS | Node Count | Notes |
| --- | --- | --- | --- | --- |
| Desktop (Windows 11, Chrome 120) | MarketCap default | 54–60 | 211 | Physics 2.4–3.1 ms, camera 0.2–0.4 ms, collision spikes spawn ≤80 particles |
| Mobile (Pixel 7 Pro, Chrome 120) | MarketCap default | 18–26 | 211 | Physics 6–9 ms, camera ~0.8 ms, zoom gestures hitch during particle bursts |
| Desktop (Win11, Chrome 120) | MarketCap + view culling | 41.3 (32.6–46.5) | 144 total / 31 visible avg | Perf overlay summary (10 s, 33 samples): physics 0.72 ms avg / 1.5 ms peak, particles ≤25, indicates DOM/render work is current bottleneck |

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
- **Zoom-aware LOD:** Planet and moon components now drop price/metric/ratio text (and soften shadows) whenever camera zoom is below 0.04–0.055. This cuts 3–5 DOM children per body during wide shots without changing close-up fidelity, reducing layout/paint churn when ~30+ nodes are visible.
- **Motion calming + particle trims:** Lower orbital/angular velocities, stronger friction, and softened camera lerps reduce perceived jitter while also preventing sudden DOM churn from frantic recentering. Collision shake intensity was halved and the particle pool cap dropped to 180 so impact bursts no longer spike paints; cinematic transitions now run over 4.2 s with a flatter arc to keep horizon drift gentle.
- **Input UX smoothing:** Left-click now summons the radial actions (follow/release/etc.), and the follow logic skips wide cinematic arcs whenever the target is already framed at a similar zoom. This keeps focus changes snappy when users are already zoomed into a moon and further reduces sudden camera swoops that previously caused motion complaints.
- **Low-zoom moon culling:** When zoom drops under 0.035 we now keep only the top 60 moons (by radius) in the DOM, slashing visible-node counts during wide shots without touching physics so FPS stays steadier even with 100+ potential nodes in view.

## Prioritized Performance Levers (2025-12-05)
| Priority | Lever | Expected Impact | Effort | Signals driving prioritization |
| --- | --- | --- | --- | --- |
| 1 | Slim the DOM footprint of `PlanetNode`/`MoonNode` trees | Reduce paint/composite cost by 8–12 ms when ≥30 nodes are visible, target 55 FPS on desktop | high | PERF overlay shows physics ≤1.5 ms while FPS still dips to 32 FPS; devtools paint profiler highlights text stacks + multiple shadows per node |
| 2 | Move badges/labels/metrics into a single canvas overlay | Eliminate ~4 DOM children per body, keep typography crisp without flexbox reflows | medium | Fonts + gradients recalculated per node; GPU timeline flags layout thrash when metric mode flips |
| 3 | Zoom-level LOD toggles for typography/icons | Drop to glyph-only markers when zoomed out; restore full UI once zoom >0.05 | medium | Visible-node average is 31 but orbit sweeps briefly show 45+; distant moons still render full text despite occupying <30 px |
| 4 | Spatial hash for collision + particle triggers | Avoid O(n²) proximity checks during meteor swarms, freeing budget for richer effects | medium | Collision debug logs show 300+ pair checks whenever multiple chains align, even though physics time is low today |
| 5 | Workerize galaxy data shaping + filtering | Unblocks main thread during weight-mode swaps, making metric toggles instant on mobile | low | Switching metrics still flashes loading spinner for 250–300 ms while we recompute chain layouts in the main thread |

## Implementation Plan (next 2 stages)
1. **Stage 3B – DOM slimming sprint**
	- Profile node markup in React DevTools “Why did this render?” and Chrome Performance to catalog expensive elements.
	- Replace nested flex wrappers with absolute-positioned spans driven by CSS variables; convert glow/backdrop layers into pseudo elements.
	- Add visual regression stories (Chromatic or Storybook screenshots) to ensure the simplified markup preserves branding.
	- Success criteria: copyable PERF summary reports ≥52 FPS average on Win11 baseline with unchanged physics metrics.
2. **Stage 3C – LOD + canvas overlay**
	- Build a lightweight canvas HUD that receives projected positions + metric payloads each RAF and draws labels/icons there.
	- Gate the existing DOM-based labels behind zoom thresholds and reuse the overlay for hover/focus hints.
	- Wire LOD thresholds into `VIEW_CULL_PADDING_PX` logic so culling + LOD swap together.
	- Success criteria: visible node spikes (45+) no longer drop below 40 FPS on desktop; mobile stays ≥24 FPS.
3. **Stage 4 Kickoff – UX polish & pipeline hygiene**
	- Introduce the spatial hash + workerized data prep while the canvas overlay soaks; both changes are isolated and can be toggled with feature flags.
	- Refresh docs with new metrics, then promote the overlay/canvas mode to default once QA validates text clarity.
	- Success criteria: weight-mode toggles run without spinner on desktop, physics spikes stay under 2 ms even during collision storms.
