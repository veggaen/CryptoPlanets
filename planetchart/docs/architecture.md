# CryptoPlanets Architecture (Phase 1 Notes)

_Last updated: 2025-12-05_

## Data Flow: API → Galaxy State → Rendering
1. **API aggregation (`app/api/galaxy/route.ts`)**
   - Handles every external request (DefiLlama, CoinGecko, DexScreener, PulseChain services).
   - Applies filter flags (`hideStables`, `hideWrapped`) at fetch time and caches results for 60 s (stale allowed to 5 min).
   - Computes per-chain weight for the requested metric and returns a normalized `GalaxyData` payload.
2. **Client loader (`app/services/dataLoader.ts`)**
   - Fetches unfiltered data from `/api/galaxy`, caches it per metric for 60 s, and applies stable/wrapped filters instantly on the client for snappy toggles.
   - Exposes `prefetchAllModes()` for background hydration and `loadGalaxyData()` for the main UI.
3. **State initialization (`app/physics/galaxyEngine.ts` `initGalaxyState`)**
   - Picks the sun (largest weight) and builds `GalaxyNode` objects for sun, planets, moons, meteorites.
   - Precomputes orbit slots, radii, and base masses; stores `baseOrbitRadii` map for later relaxation.
4. **Main component (`app/components/CryptoPlanets.tsx`)**
   - Calls `loadGalaxyData()` when metric or filters change, then `initGalaxyState()` and stores the result in React state + refs.
   - Kicks off the animation loop (`tickGalaxy`, camera follow) and renders nodes through lightweight DOM subcomponents (sun/planet/moon) plus HUD/menus.
5. **Rendering**
   - React renders static structure; actual positions are driven by inline styles (`left`, `top`, transforms) updated as state mutates.
   - Collision particles come from `getParticles()` (in `collision.ts`), and the starfield is an independent canvas/DOM animation.

## Entity Determination Rules
- **Sun selection**: whichever `GalaxyData` entry (BTC or any chain) has the highest weight for the active metric becomes the sun. If BTC is sun it has no moons; if a chain beats BTC it inherits its ERC-20 moons directly (already supported via `parentId`).
- **Planets**: remaining chains sorted by weight; orbit radii = `basePlanetOrbit + index * planetOrbitStep`.
- **Moons**: top `tokensPerChain` tokens per chain, slotted into rings (`moonSlotsPerRing`, `moonRingStep`). Radii use log-scale mapping against global market-cap bounds; ring metadata stores `slotIndex`, `slotSpan`, etc. for collision/slot-release logic.
- **Filters**: Stablecoins/wrapped toggles run inside the loader (client) and API (server) so the dataset and UI stay consistent.

## Physics Loop
- `tickGalaxy()` runs every animation frame:
  - Skips sun (pinned at origin), updates planets deterministically.
  - For moons: blends deterministic orbital motion with collision-induced free-flight via timers (`freeOrbitTimer`, `railBlendTimer`).
  - Applies Option B “planetary fields” per moon to keep them between an inner/outer band derived from moon count + sizes.
  - Calls collision pipeline (`resolveAllCollisions`, `applyProximityGlow`, `updateParticles`). Collision code does O(N²) pair checks today.
- Camera loop (`cameraEngine.ts`)
  - `updateFollowCamera`, cinematic transitions, and manual pan/zoom logic live in React component but math is centralized in camera engine helpers.
  - Camera state is stored both in React state and refs (`cameraRef`, `followingIdRef`) so physics can run without forcing React re-render each tick (although we still call `setGalaxyState` every frame—see bottlenecks).

## Rendering & UI
- React tree: `CryptoPlanets` → node components + HUD + radial menu + mobile HUD.
- Each node component memoizes only partially (sun/planet/moon components are functional components without `React.memo`, so prop changes trigger full re-render).
- HUD includes metric selector, stables/wrapped toggles, follow status, camera tips, etc. Mobile HUD mirrors the functionality with touch gestures.
- Starfield (`app/components/Starfield.tsx`) draws thousands of stars with CSS animations; particles add additional DOM nodes during collisions.

## Known Bottlenecks / Pain Points
1. **Per-frame React state churn**
   - `tickGalaxy` mutates `galaxyStateRef`, then `setGalaxyState({ ...galaxyStateRef.current })` every RAF, forcing React to diff large node arrays at 60 FPS.
   - Camera state `setCamera` also runs per frame, compounding work.
2. **Collision complexity**
   - `resolveAllCollisions` iterates over every pair of nodes (O(N²)). With ~200 nodes this is manageable on desktop but stalls low-end/mobile devices.
3. **Visual load**
   - Starfield (hundreds/thousands of DOM elements) + particle effects + full-resolution gradients keep the GPU busy even when the camera is idle.
4. **Physics constants**
   - High-frequency springs + free-flight blending cost repeated trig/`Math` calls and make mobile devices drop frames.
5. **No adaptive quality**
   - Regardless of hardware, we always render all chains, moons, particle effects, and starfield detail.
6. **Instrumenting difficulty**
   - There is no FPS/node counter or logging, so it’s hard to measure whether a change helps; this is what Stage 0 will address next.

These notes will evolve as we introduce the staged performance roadmap.
