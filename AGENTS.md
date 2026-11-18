# AGENTS.md — Marchlands Repository Constitution

This file defines mandatory architectural boundaries, determinism rules, state persistence guarantees, and mobile PWA standards for **Marchlands**. Every AI coding agent operating in this repository must read and obey these rules alongside the specification documents in `docs/`:

* `docs/GDD.md` — Master Game Design Document
* `docs/BALANCE_MODEL.md` — Combat HTK Equations, Unit Stats & Economy Curves
* `docs/CONTENT_CATALOG.md` — 24 Royal Decrees, 12 Relic Ruins & Keep Name Pools
* `docs/EDGE_CASE_RULINGS.md` — Canonical Rulings for Captures, Orphans, Caps & AI Safety
* `docs/DESIGN_TOKENS.md` — Colorblind-Safe Heraldry, Terrain Palette & SVG Anatomy
* `docs/UX_MICROCOPY.md` — Mobile HUD Labels, Tooltips & Onboarding Copy

---

## 1. Strict Architectural & Dependency Boundaries

Code is organized into five unidirectional layers. **Dependencies may only flow downward** (`components -> storage / engine -> data -> types`).

    src/types/       -> Pure TypeScript interfaces & union types ONLY (zero runtime code)
    src/data/        -> Static readonly game tables & definitions (imports types only)
    src/engine/      -> Pure deterministic state reducers & AI logic (imports data, types)
    src/storage/     -> IndexedDB persistence & save validation (imports engine, types)
    src/components/  -> React UI, SVG renderers & touch handlers (imports storage, engine, data, types)

### Hard Layer Prohibitions
* **`src/engine/` is strictly headless:** Zero imports from `react`, `react-dom`, `idb`, or browser globals (`window`, `document`, `localStorage`, `indexedDB`, `navigator`). Every function in `src/engine/` must run cleanly in a headless Node/Vitest environment.
* **`src/components/` contains zero game math:** Never calculate combat damage, adjacency yields, BFS movement paths, fog-of-war visibility, or victory thresholds inside React components. Components dispatch player intents to `src/engine/` and render the returned `GameState`.
* **Single Source of Truth:** Never duplicate type definitions or magic numbers across files. All state shapes live in `src/types/game.ts`, and all balance constants live in `src/data/`.

---

## 2. Determinism & Immutable State Rules

* **Banned Randomness:** `Math.random()` is **strictly forbidden** anywhere in `src/`. All procedural map generation, Relic Ruin rolls, and Royal Decree draft draws must use the seeded `Mulberry32` PRNG in `src/engine/prng.ts` derived from `GameState.rngSeed` and deterministic turn/action counters.
* **Strict Immutability:** Every state transition function in `src/engine/` must follow `(state: GameState, ...args) => GameState` without mutating input objects or nested arrays in place.
* **100% JSON-Serializable `GameState`:** `GameState` must contain **only** JSON primitives (`string`, `number`, `boolean`, `null`), plain arrays, and plain `Record<string, T>` objects keyed by `"x,y"` (`CoordKey`) or entity IDs.
  * **Banned inside `GameState`:** `Map`, `Set`, `Date` objects, class instances, `undefined` property values, and functions.
* **Ephemeral UI State Isolation:** Selection cursors, reachable tile highlights, and build previews belong exclusively in `UiInteractionState` inside React memory and must **never** be written to `GameState` or `IndexedDB`.

---

## 3. Canonical Game Rules Enforcement

Do not invent ad-hoc mechanics or simplify edge cases. Implement the exact rules defined in `docs/BALANCE_MODEL.md` and `docs/EDGE_CASE_RULINGS.md`:

* **Keep Garrison & Capture:** Keeps have `20 Max Garrison HP` (regenerating `+4 HP/turn` if unhit). Neutralizing a Keep sets `keepHp = 10` for the captor and converts faction-unique buildings into their standard equivalents (`foresters_lodge -> lumber_mill`, `deep_smeltery -> iron_mine`, `river_tollhouse -> market`; `war_camp` and `signal_bastion` are destroyed).
* **Sticky Territory Claims:** Tile `keepId` ownership is first-claim locked. Upgrading a Keep from Tier 1 (`3x3`) to Tier 2 (`5x5`) claims only unclaimed surrounding tiles (`tile.keepId === null`).
* **Orphaned Unit Re-Homing:** When a Keep is captured, displaced units automatically re-home to open Army Cap slots on remaining friendly Keeps (highest `Material Cost` first). Remaining excess units become `homeKeepId = 'orphaned'` with the **Supply-Severed** debuff (`-25% Atk/Def`, no healing) rather than being deleted.
* **Coin Floor & Mutiny:** `house.resources.coin` is clamped at `>= 0`. If upkeep exceeds income + treasury, set `coin = 0` and apply **Mutiny** (`8` true damage and `-25% Atk` for 1 turn) to that House's highest-upkeep unit.
* **Integer Draft Queue:** Track pending milestone drafts via `house.pendingDraftCount: number` (never a single boolean). If a House has unlocked all 24 decrees, convert any draft trigger into `+15 Coin` and `+10 Materials`.
* **AI Turn Termination Guardrails:** `src/engine/utilityAi.ts` must enforce single-pass unit actions (`hasMoved` / `hasAttacked`), `MAX_AI_ACTIONS = 12` per House per turn, synchronous AI decree selection, and an `8,000ms` `try / finally` watchdog timeout so `phase === 'ai_turn'` can never softlock.

---

## 4. IndexedDB & Multi-Session Persistence Safety

* **Storage Engine:** Use the `idb` library in `src/storage/persistence.ts` targeting database `marchlands_db` with an explicit `CURRENT_SCHEMA_VERSION` constant.
* **Storage Eviction Protection:** Invoke `navigator.storage?.persist?.()` on app initialization so mobile browsers protect multi-session campaigns from automatic eviction.
* **Atomic Save Boundaries:** Trigger an asynchronous `saveAutosave(gameState)` write immediately after:
  1. Every completed player action (move, attack, build, train, annex, end turn).
  2. Every Royal Decree draft selection.
  3. Every completed AI House turn.
* **Hydration & Import Validation:** Before loading any state from `IndexedDB` or the manual **Import Save JSON** input, validate required top-level keys (`version`, `gridSize === 22`, `tiles`, `keeps`, `units`, `houses`, `activeHouseId`) and reject malformed payloads gracefully without crashing the app.
* **Non-Blocking Error Handling:** Wrap all `IndexedDB` reads and writes in `try / catch`. If storage fails (e.g., private browsing quota), keep the in-memory session running and display a non-blocking warning toast.

---

## 5. Mobile PWA & `375x812` Viewport Standards

* **Baseline Viewport:** Design and verify all layouts at **`375px x 812px`** (mobile portrait) with zero horizontal page scroll (`overflow-x: hidden`).
* **Browser Gesture Locking:** `index.html` and global CSS must enforce `user-scalable=no`, `maximum-scale=1.0`, `touch-action: manipulation` (eliminating 300ms tap delay and accidental double-tap zoom), and `overscroll-behavior: none` (preventing pull-to-refresh mid-turn).
* **Safe-Area Insets:** Pad `TopHud` with `env(safe-area-inset-top)` and `BottomDrawer` / modals with `env(safe-area-inset-bottom)` for notched phones.
* **Touch Ergonomics:** Every interactive button, unit selector, and decree card must have at least a **`44px x 44px`** touch target with at least **`8px`** spacing between adjacent controls.
* **Two-Tap Grid Disambiguation:** In `MapBoard.tsx`, distinguish pan/pinch gestures from tile taps using an `8px` pointer-movement threshold so dragging across the 22x22 map never triggers unintended unit moves or builds.
* **Zero External Raster Assets:** All terrain tiles, borders, improvements, landmarks, heraldic shields, and unit tokens must render via crisp inline SVG (`48x48` tile `viewBox`) using the exact colorblind-safe hex palette in `docs/DESIGN_TOKENS.md`.

---

## 6. Testing & Verification Protocol

Before considering any feature or phase complete, verify all four gates:

1. **Type Safety:** `npx tsc --noEmit` passes with zero errors or `@ts-ignore` suppressions.
2. **Headless Engine Tests (`Vitest`):** Maintain automated tests in `src/engine/__tests__/` verifying:
   * Seeded `mapGen` determinism across identical seeds.
   * Spatial adjacency yield calculations (`Farm + River`, `Lumber Mill + 2 Forests`, `Smithy + Iron Mine + Lumber Mill`).
   * Deterministic combat HTK ratios and `+40%` Counter-Triangle math.
   * Keep capture, sticky `keepId` borders, orphaned unit re-homing, and `pendingDraftCount` queuing.
   * AI turn completion and Victory (`conquest` and `65% supremacy`) detection.
3. **Production PWA Build:** `npm run build` succeeds cleanly and generates the `vite-plugin-pwa` service worker and web manifest without warnings.
4. **Mobile Viewport Audit:** Confirm no clipped text, overlapping drawers, or sub-`44px` buttons at `375x812`.
