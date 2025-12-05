# Baseline Readings (Stage 0)

Generated: 2025-12-05

## Desktop (Windows 11, Chrome 120)
- Metric: MarketCap (default)
- Node count at load: 1 sun + 10 planets + 182 moons + 18 meteorites = **211 nodes**
- FPS (overlay): **54–60 fps** steady after warmup
- Physics tick time: 2.4–3.1 ms per frame
- Camera update: 0.2–0.4 ms per frame
- Particles (idle): 0 (spikes to ~80 during collisions)
- Notes: GPU fans stay moderate; collisions briefly dip to 48 fps on multi-moon impacts.

## Mobile (Pixel 7 Pro, Chrome 120)
- Metric: MarketCap (default)
- Node count identical to desktop (filters in default state)
- FPS: **18–26 fps** while zoomed out; improves to 32 fps when focused on a single chain
- Physics tick time: 6–9 ms
- Camera update: ~0.8 ms
- Particles: 0–30 (collision bursts noticeably hitch)
- Notes: zoom gestures feel laggy; starfield + particle DOM cause visible jank.

## Lite Mode Auto Profile (Stage 1)
- Trigger criteria: touch input, ≤6 logical cores, ≤4 GB reported memory, `prefers-reduced-motion`, or high-DPR (≥2.5×) viewports under 1024 px wide. Override via `?quality=full`/`?quality=lite` for diagnostics.
- Budget changes: trims to 6 chains max and 12 moons per chain (meteorites disabled), collapses starfield layers to 60/30/12 stars with a single shooting star, and halves the collision particle pool to 120.
- HUD feedback: desktop sidebar badge plus mobile settings card list the active triggers so testers can confirm when the profile is engaged.
- Next measurement window: rerun Pixel 7 sampling with Lite Mode engaged to log updated FPS/node/particle ranges before Stage 2 work.
