Spec Version: 0.3

# AGENTS.md — Marchlands Repository Constitution

This file defines mandatory architectural boundaries, determinism rules, state persistence guarantees, and mobile PWA standards for **Marchlands**. Every AI coding agent operating in this repository must read and obey these rules alongside the specification documents in `docs/`:

* `docs/GDD.md` — Master Game Design Document
* `docs/BALANCE_MODEL.md` — Combat HTK Equations, Unit Stats, Economy Curves & Scoring
* `docs/CONTENT_CATALOG.md` — 25 Royal Decrees, 12 Relic Ruins, Keep Name Pools, 14 Frontier Events & 12 Crown Writs
* `docs/EDGE_CASE_RULINGS.md` — Canonical Rulings for Captures, Orphans, Caps, Undo & AI Safety
* `docs/DESIGN_TOKENS.md` — Colorblind-Safe Heraldry, Terrain Palette & SVG Anatomy
* `docs/UX_MICROCOPY.md` — Mobile HUD Labels, Tooltips & Onboarding Copy
* `docs/CROWN_SEASONS_EVENTS.md` — Royal Favor, Crown Writs, Regent's Mandate, Seasons & Frontier Events
* `docs/AI_ARCHITECTURE.md` — Two-Layer Fog-Honest AI Architecture & Termination Guardrails
* `docs/SIMULATION_HARNESS.md` — Headless AI-vs-AI Simulation Harness & Balance Gates
* `docs/CHANGELOG.md` — Spec & Balance Pass Changelog

---

## 1. Strict Architectural & Dependency Boundaries

Code is organized into five unidirectional layers. **Dependencies may only flow downward** (`components -> storage / engine -> data -> types`).

    src/types/       -> Pure TypeScript interfaces & union types ONLY (zero runtime code)
    src/data/        -> Static readonly game tables & definitions (imports types only)
    src/engine/      -> Pure deterministic state reducers & AI logic (imports data, types)
      ai/influence.ts, ai/strategic.ts, ai/tactical.ts, ai/economy.ts, utilityAi.ts (single entry: runAiTurn)
    src/storage/     -> IndexedDB persistence & save validation (imports engine, types)
    src/components/  -> React UI, SVG renderers & touch handlers (imports storage, engine, data, types)

### Hard Layer Prohibitions
* **`src/engine/` is strictly headless:** Zero imports from `react`, `react-dom`, `idb`, or browser globals (`window`, `document`, `localStorage`, `indexedDB`, `navigator`). Every function in `src/engine/` must run cleanly in a headless Node/Vitest environment.
* **`src/components/` contains zero game math:** Never calculate combat damage, adjacency yields, BFS movement paths, fog-of-war visibility, or victory thresholds inside React components. Components dispatch player intents to `src/engine/` and render the returned `GameState`.
* **Single Source of Truth:** Never duplicate type definitions or magic numbers across files. All state shapes live in `src/types/game.ts`, and all balance constants live in `src/data/`.

### 1b. Mandatory Build Order
1. `src/types` → 2. `src/data` → 3. `src/engine/prng.ts` → 4. `mapGen` → 5. Core rules (movement, ZoC, combat, economy, capture, fog) → 6. Keep specializations, Crown, seasons, and Frontier Events → 7. Scoring and victory → 8. AI (`docs/AI_ARCHITECTURE.md`) → 9. **Simulation harness and balance gates** → 10. `src/storage` → 11. `src/components` (UI).

**No React component may be written until Step 9's simulation gates pass or are explicitly waived by the human.**

---

## 2. Determinism & Immutable State Rules

* **Banned Randomness:** `Math.random()` is **strictly forbidden** anywhere in `src/`. All procedural map generation, Relic Ruin rolls, and Royal Decree draft draws must use the seeded `Mulberry32` PRNG in `src/engine/prng.ts` derived from `GameState.rngSeed` and deterministic turn/action counters.
* **Strict Immutability:** Every state transition function in `src/engine/` must follow `(state: GameState, ...args) => GameState` without mutating input objects or nested arrays in place.
* **100% JSON-Serializable `GameState`:** `GameState` must contain **only** JSON primitives (`string`, `number`, `boolean`, `null`), plain arrays, and plain `Record<string, T>` objects keyed by `"x,y"` (`CoordKey`) or entity IDs.
  * **Banned inside `GameState`:** `Map`, `Set`, `Date` objects, class instances, `undefined` property values, and functions.
* **Ephemeral UI State Isolation:** Selection cursors, reachable tile highlights, and build previews belong exclusively in `UiInteractionState` inside React memory and must **never** be written to `GameState` or `IndexedDB`. The undo stack (`EDGE_CASE_RULINGS.md` Ruling 6.4) is ephemeral UI state: up to `20` `GameState` snapshots in React memory, never persisted.

### Consolidated `GameState` Additions (`src/types/game.ts`)
* **`GameState`:** `mode: 'dominion' | 'chronicle'`, `difficulty: 'easy' | 'normal' | 'hard'`, `specVersion: '0.3'`, `crown: { activeWrits: { writId: string; publishedTurn: number; completedByHouseId: string | null }[]; nextWritTurn: number; recentWritIds: string[]; claimantHouseId: string | null; claimStartTurn: number | null; claimCooldowns: Record<string, number> }`, `activeEffects: { id: string; effectId: string; houseId: string | null; expiresAfterTurn: number }[]`, `recentEventIds: string[]`, `chronicle: ChronicleEvent[]` (ring buffer, max `300`), `rngCounter: number`, `pendingEventChoice: { eventId: string; houseId: string; options: string[] } | null`.
* **`HouseState`:** `favor: number`, `audienceUsedThisTurn: boolean`, `lifetimeCoinEarned: number`, `coinMilestonesClaimed: number`, `nextCoinMilestone: number`, `startingDecreeCount: number` (`2` for Aurelia; `0` for others), `pendingSpecializationKeepIds: string[]`, `stats: { unitsDestroyed: number; keepsCaptured: number; ruinsExplored: number; campsCleared: number; watchtowersReached: number; tilesRevealed: number; lifetimeFavor: number }`, `aiPlan: { posture: 'expand' | 'defend' | 'attack' | 'claim'; targetKeepId: string | null; rallyTileKey: CoordKey | null; rallyStartedTurn: number | null; plannedOnTurn: number; postureLockedUntilTurn: number } | null`. **Removed:** house-level `resources.food` treasury (Food lives in `keep.foodProgress`).
* **`KeepState`:** `specialization: 'none' | 'garrison' | 'market_town' | 'granary_seat'`, `maxKeepHp: number` (`24`, or `34` for Garrison Seat), `repeatMilestonesClaimed: number`.
* **`TileState`:** `villageHp: number | null` (`12` for unclaimed `frontier_village`; `null` otherwise), per-House Watchtower reveal tracking (`revealedByHouseIds`) and `firstVisitedByHouseId` for `+10` Landmark score.
* **Unions:** `Phase` adds `'specialization_modal' | 'event_modal'`; `victoryType` adds `'mandate' | 'score'`; `UnitId` adds `'sapper_crew' | 'free_company_spearman' | 'men_at_arms'`.
* **Save Metadata (stored next to `GameState` in IndexedDB, NOT inside it):** `{ slotId: string; savedAtIso: string; turnNumber: number; houseId: string; mode: string }`.

---

## 3. Canonical Game Rules Enforcement

Do not invent ad-hoc mechanics or simplify edge cases. Implement the exact rules defined in `docs/BALANCE_MODEL.md`, `docs/EDGE_CASE_RULINGS.md`, `docs/CROWN_SEASONS_EVENTS.md`, and `docs/AI_ARCHITECTURE.md`:

* **Additive Modifier Stacking, Spearman Brace & One-Shot Protection (A1, E5, C1, C2):** Percentage bonuses sum within `AtkBonusSum` and `DefBonusSum` (clamped to `[−0.50, +1.50]`), then Counter-Triangle (`1.40`) multiplies afterwards (`BALANCE_MODEL.md` §1). Terrain and fortification do not stack (highest single bonus applies). Surviving `spearman` units retaliating against melee `cavalry` use their **pre-hit HP ratio** (`hpBefore / maxHp`, Spearman Brace). Full-HP units hit cannot drop below `1 HP` unless the attacker is a **melee unit (`range === 1`) with counter advantage (`CounterMult > 1.0`)** — ranged units never one-shot full-HP targets (excludes Keeps, structures, Neutral Villages, Bandits, true damage, Winter attrition).
* **Per-Keep Food Model, Escalating Coin Milestones & Annexation (A2, A3, C7, C9):** There is no house-level Food treasury; Food fills each Keep's `foodProgress`. Peaceful Annexation spends `15 Coin` + `12 Food` from the closest (Chebyshev) friendly Keep with enough Food (tie-break highest `foodProgress`, then `keep.id`) (`EDGE_CASE_RULINGS.md` 1.3). Coin milestones escalate (`25 -> 65 -> 125 -> 205…`, `nextCoinMilestone += 20 * (coinMilestonesClaimed + 1)`). Tier-2 Keep repeat Food bars award `+5 Coin` + Draft on the 1st repeat (`repeatMilestonesClaimed === 0`), then **Royal Surplus** (`+10 Coin`, `+2 Favor`, no draft) on subsequent repeats.
* **Movement, ZoC, Action Order & Pillage (A6):** Terrain movement costs (Plains `1`, Hills/Forest/River `2`, Mountain impassable; minimum-move rule), Zone of Control stops entry adjacent to enemies (`dusk_outrider` exempt), no move after attack (`dusk_outrider` exempt), Flanking `+0.15` (`vanguard_spearman` immune), and Pillage on enemy economic improvements (`BALANCE_MODEL.md` §1b).
* **Keep Garrison, Villages, Capture & Specialization (B1, A6, C3, C10, C11):** Keeps have `24 Max Garrison HP` (`34` for Garrison Seat), regenerating `+4 HP/turn` (`+6` for Garrison Seat) if unhit. Neutralizing a Keep sets `keepHp = Math.floor(maxKeepHp / 2)` (`12`/`17`) for the captor, preserves its specialization, and converts faction-unique buildings (`foresters_lodge -> lumber_mill`, `deep_smeltery -> iron_mine`, `river_tollhouse -> market`; `war_camp` and `signal_bastion` destroyed). `siege_ram` has `8` structure Attack; unmanned `palisade`/`watchtower` structures use `12 HP, 4 Def, 0.00 DefBonus`. Neutral Frontier Villages have `12 HP, 3 Atk, 4 Def, +0.20 DefBonus`; peaceful annex = `24/24 HP` + `+1 Favor`, violent seizure = `8/24 HP` + `-2 Favor`. `deep_smeltery` satisfies `smithy`'s `iron_mine` adjacency. Tier-2 Keep specialization resolves in `'specialization_modal'` before any draft (`EDGE_CASE_RULINGS.md` 1.4).
* **Sticky Territory Claims:** Tile `keepId` ownership is first-claim locked. Upgrading a Keep from Tier 1 (`3x3`) to Tier 2 (`5x5`) claims only unclaimed surrounding tiles (`tile.keepId === null`).
* **Training, Summoning Sickness, Orphans & Manual Re-Homing (C5, C6):** Newly trained units (and hired `free_company_spearman`) spawn on an unoccupied Keep center tile with summoning sickness (`hasMoved = true`, `hasAttacked = true`, no spawn-turn healing). When a Keep is captured, displaced units automatically re-home to open Army Cap slots on remaining friendly Keeps (highest `Material Cost` first); excess units become `homeKeepId = 'orphaned'` with **Supply-Severed** (`-25% Atk/Def`, no healing) rather than being deleted (`free_company_spearman` disbands if orphaned). Friendly units (except `free_company_spearman`) standing on a friendly Keep with open Army Cap may manually **Re-home Here** (`0` resources/actions, undoable, clears `'orphaned'`).
* **Coin Floor & Mutiny:** `house.resources.coin` is clamped at `>= 0`. If upkeep exceeds income + treasury, set `coin = 0` and apply **Mutiny** (`8` true damage and `-25% Atk` for 1 turn) to that House's highest-upkeep unit.
* **Integer Draft Queue, Exclusions & Men-at-Arms (E1, E2, C4, C8):** Track pending milestone drafts via `house.pendingDraftCount: number`. Pool has **25 Royal Decrees** (including `decree_sword_guilds` unlocking `men_at_arms`); `excludedHouseIds` excludes `decree_fletchers_guild` for Vane and `decree_chivalric_order` for Aurelia (`24` eligible for Vane & Aurelia, `25` for others). Each 3-card hand offers 1 Infrastructure, 1 Military, and 1 Doctrine from unowned eligible decrees (fallback **Doctrine → Infrastructure → Military**). House Aurelia starts owning `decree_iron_prospecting` and `decree_master_smiths` (`startingDecreeCount = 2`, excluded from Chronicle decree score). Exhausting a House's eligible pool converts triggers into `+15 Coin` and `+10 Materials`.
* **War Camp Limits & Sapper Crew (E3, E6):** `war_camp` costs `14` Mat, max `1` per Keep, max `2` per House. Every House unlocks `sapper_crew` (`10` Mat, `6` structure Atk, 2-hit raze, no retaliation) on Turn 1.
* **Crown, Seasons, Watchtowers & Chronicle Turn 33 (B3, B6, C12, C13):** Public Crown Writs publish every 6 turns starting Turn 3 (Turn 33 publication suppressed in Chronicle mode, which ends after **Turn 33**); Crown Audience allows 1 action/turn; Regent's Mandate requires `≥ 30` Favor & `≥ 4` Keeps held for 3 turns in Dominion mode. Seasons cycle every 3 turns with modifiers and Frontier Events (`docs/CROWN_SEASONS_EVENTS.md`). Ancient Watchtowers grant per-House `7x7` reveal (first House overall earns `+10` Landmark score), `+0.30 DefBonus`, and `+2 Coin/turn` (`+1 Favor` on even turns) while occupied.
* **AI Turn Order & Termination Guardrails (E4, C14–C17):** `src/engine/utilityAi.ts` (`runAiTurn`) runs **`strategic -> tactical -> economy -> end turn`** using 4-class `TileThreat`, lightweight `TacticalSimState` beam search with top-`K` candidate pruning, explicit `'expand'` targets, and `3`-turn / engage-if-attacked Muster timeout, enforcing: (1) single plan entry per unit per turn; (2) `MAX_AI_ACTIONS = 12` and `MIN_ACTION_SCORE = 5` (0–100 scale); (3) `2,000` simulated combat resolution budget; (4) synchronous AI drafts, specializations, events, and Audience decisions; (5) Web Worker execution with an `8,000ms` watchdog that discards partial results, ends the turn with no AI actions, logs a ChronicleEvent, autosaves, and advances (`docs/AI_ARCHITECTURE.md`).

---

## 4. IndexedDB & Multi-Session Persistence Safety

* **Storage Engine:** Use the `idb` library in `src/storage/persistence.ts` targeting database `marchlands_db` with an explicit `CURRENT_SCHEMA_VERSION` constant. Save metadata (`savedAtIso`) is stored outside `GameState`.
* **Storage Eviction Protection:** Invoke `navigator.storage?.persist?.()` on app initialization so mobile browsers protect multi-session campaigns from automatic eviction.
* **Atomic Save Boundaries:** Trigger an asynchronous `saveAutosave(gameState)` write immediately after:
  1. Every completed player action (move, attack, build, train, annex, end turn).
  2. Every Royal Decree draft selection.
  3. Every Keep specialization choice, Frontier Event choice, Crown Audience action, and undo.
  4. Every completed AI House turn.
* **Hydration & Import Validation:** Before loading any state from `IndexedDB` or the manual **Import Save JSON** input, validate required top-level keys (`version`, `specVersion === '0.3'`, `mode`, `difficulty`, `gridSize === 22`, `tiles`, `keeps`, `units`, `houses`, `activeHouseId`, `crown`, `chronicle`) and reject mismatched `specVersion` or malformed payloads gracefully without crashing the app (there are no older saves to migrate).
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

Before considering any feature or phase complete, verify all five gates:

1. **Type Safety:** `npx tsc --noEmit` passes with zero errors or `@ts-ignore` suppressions.
2. **Headless Engine Tests (`Vitest`):** Maintain automated tests in `src/engine/__tests__/` verifying:
   * Seeded `mapGen` determinism across identical seeds and fairness guarantees across `500` consecutive seeds.
   * Spatial adjacency yield calculations (`Farm + River`, `Lumber Mill + 2 Forests`, `Smithy + Iron Mine + Lumber Mill`).
   * Deterministic combat HTK ratios, additive modifier stacking, `+40%` Counter-Triangle math, and One-Shot Protection (E5).
   * Sapper Crew damage and 2-hit raze rules (E6).
   * Keep capture, sticky `keepId` borders, orphaned unit re-homing, `pendingDraftCount` queuing, Draft Category Guarantee (E1), Aurelia starting decrees (E2), and War Camp limits (E3).
   * `isCommitPoint` undo rules, `buildRecap` fog filtering, season modifiers, event determinism, Writ completion, Mandate claim/break/win, and Chronicle scoring.
   * AI tactical search determinism, budget limits (`2,000` resolutions / `MAX_AI_ACTIONS = 12`), and Victory (`conquest`, `65% & 5+ Keeps supremacy`, `mandate`, `score`) detection.
3. **Simulation Harness:** CI smoke test (`5` seeded games capped at `60` turns, `< 30s`) passes with `0` invariant failures; the full harness report meets `docs/SIMULATION_HARNESS.md` balance gates.
4. **Production PWA Build:** `npm run build` succeeds cleanly and generates the `vite-plugin-pwa` service worker and web manifest without warnings.
5. **Mobile Viewport Audit:** Confirm no clipped text, overlapping drawers, or sub-`44px` buttons at `375x812`.
