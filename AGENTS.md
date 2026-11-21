Spec Version: 2.0

# AGENTS.md — Marchlands Repository Constitution

This file defines mandatory architectural boundaries, determinism rules, state persistence guarantees, and mobile PWA standards for **Marchlands v2.0**. Every AI coding agent operating in this repository must read and obey these rules alongside the specification documents in `docs/`:

* `docs/GDD.md` — Master Game Design Document (v2.0)
* `docs/BALANCE_MODEL.md` — Combat HTK Equations, Unit Stats, 4-Resource Economy & Scoring
* `docs/CONTENT_CATALOG.md` — 8 Exclusive Doctrine Pairs (16 Decrees), 5 Lord-Commanders, Battle Honors, 12 Relic Ruins, 14 Frontier Events & 12 Crown Writs
* `docs/EDGE_CASE_RULINGS.md` — Canonical Rulings for Citadels, Outposts, Wall Links, Overwatch, Push, Commanders, Undo & AI Safety
* `docs/DESIGN_TOKENS.md` — Colorblind-Safe Heraldry, Terrain Palette & SVG Anatomy
* `docs/UX_MICROCOPY.md` — Mobile HUD Labels, Tooltips & Onboarding Copy
* `docs/CROWN_SEASONS_EVENTS.md` — Royal Favor, Crown Writs, Regent's Mandate, Seasons & Frontier Events
* `docs/AI_ARCHITECTURE.md` — Two-Layer Fog-Honest AI Architecture, Spatial Indexing & Termination Guardrails
* `docs/SIMULATION_HARNESS.md` — Headless AI-vs-AI Simulation Harness & v2.0 Balance Gates
* `docs/CHANGELOG.md` — Spec & Balance Pass Changelog

---

## 1. Strict Architectural & Dependency Boundaries

Code is organized into five unidirectional layers. **Dependencies may only flow downward** (`components -> storage / engine -> data -> types`).

    src/types/       -> Pure TypeScript interfaces & union types ONLY (zero runtime code)
    src/data/        -> Static readonly game tables & definitions (imports types only)
    src/engine/      -> Pure deterministic state reducers, spatial indexing & AI logic (imports data, types)
      spatialIndex.ts, ai/influence.ts, ai/strategic.ts, ai/tactical.ts, ai/economy.ts, utilityAi.ts (single entry: runAiTurn)
    src/storage/     -> IndexedDB persistence & save validation (imports engine, types)
    src/components/  -> React UI, SVG renderers & touch handlers (imports storage, engine, data, types)

### Hard Layer Prohibitions
* **`src/engine/` is strictly headless:** Zero imports from `react`, `react-dom`, `idb`, or browser globals (`window`, `document`, `localStorage`, `indexedDB`, `navigator`). Every function in `src/engine/` must run cleanly in a headless Node/Vitest environment.
* **`src/components/` contains zero game math:** Never calculate combat damage, adjacency yields, BFS/Dijkstra movement paths, fog-of-war visibility, or victory thresholds inside React components. Components dispatch player intents to `src/engine/` and render the returned `GameState`.
* **Single Source of Truth:** Never duplicate type definitions or magic numbers across files. All state shapes live in `src/types/game.ts`, and all balance constants live in `src/data/`.

### 1b. Mandatory Build Order
1. `src/types` → 2. `src/data` → 3. `src/engine/prng.ts` & `spatialIndex.ts` → 4. `mapGen` (`22x22` / `28x28` / `34x34`) → 5. Core rules (movement, Roads, Wall Links, Overwatch, combat, Push, Charge, Trebuchet, 4-resource economy, Iron, Outposts, capture, fog) → 6. Keep Tier 3, Lv2 building upgrades, Lord-Commanders, Exclusive Doctrine Pairs, Battle Honors, Crown, seasons, and Frontier Events → 7. Scoring and victory → 8. AI (`docs/AI_ARCHITECTURE.md`) → 9. **Simulation harness and v2.0 balance gates** → 10. `src/storage` → 11. `src/components` (UI).

**No React component may be modified until Step 9's simulation gates pass or are explicitly waived by the human.**

---

## 2. Determinism & Immutable State Rules

* **Banned Randomness:** `Math.random()` is **strictly forbidden** anywhere in `src/`. All procedural map generation, Relic Ruin rolls, and Royal Decree draft draws must use the seeded `Mulberry32` PRNG in `src/engine/prng.ts` derived from `GameState.rngSeed` and deterministic turn/action counters.
* **Strict Immutability:** Every state transition function in `src/engine/` must follow `(state: GameState, ...args) => GameState` without mutating input objects or nested arrays in place.
* **100% JSON-Serializable `GameState`:** `GameState` must contain **only** JSON primitives (`string`, `number`, `boolean`, `null`), plain arrays, and plain `Record<string, T>` objects keyed by `"x,y"` (`CoordKey`) or entity IDs.
  * **Banned inside `GameState`:** `Map`, `Set`, `Date` objects, class instances, `undefined` property values, and functions.
* **Ephemeral UI State Isolation:** Selection cursors, reachable tile highlights, build previews, and the `20`-snapshot undo stack belong exclusively in React memory and must **never** be written to `GameState` or `IndexedDB`.

### Consolidated `GameState` Schema (`src/types/game.ts`, `specVersion: '2.0'`)
* **`GameState`:** `version: 2`, `specVersion: '2.0'`, `mode: 'dominion' | 'chronicle'`, `chronicleLimit: 48 | 72 | 108`, `mapPreset: 'compact' | 'standard' | 'grand'`, `gridSize: 22 | 28 | 34`, `difficulty: 'easy' | 'normal' | 'hard'`, `outposts: Record<string, OutpostState>`, `commanders: Record<string, CommanderState>`, `highSeatTileKey: CoordKey | null`, `highSeatFirstCapturedBy: HouseId | null`, `crown`, `activeEffects`, `recentEventIds`, `chronicle` (max `300`), `rngCounter`, `pendingDraftChoices: DecreeId[] | null`, `pendingEventChoice`.
* **`HouseState`:** `resources: { materials: number; iron: number; coin: number }` (no house-level Food treasury), `favor`, `audienceUsedThisTurn`, `lifetimeCoinEarned`, `coinMilestonesClaimed`, `nextCoinMilestone`, `decreeIds`, `lockedDecreeIds`, `startingDecreeCount` (`0` in v2.0), `pendingDraftCount`, `pendingSpecializationKeepIds`, `pendingCitadelKeepIds`, `pendingHonorUnitIds`, `pendingCommanderTrait`, `stats`, `writProgress`, `aiPlan`.
* **`KeepState`:** `tier: 1 | 2 | 3`, `specialization: 'none' | 'garrison' | 'market_town' | 'granary_seat' | 'forge_seat'`, `citadelCharter: 'none' | 'war_college' | 'grand_exchange' | 'royal_bastion' | 'high_armory'`, `maxKeepHp` (`36 / 48 / 64`, `+14` for Garrison Seat), `garrisonVolleyUsedThisTurn: boolean`, `isHighSeat: boolean`, `repeatMilestonesClaimed`.
* **`OutpostState`:** `{ id, name, ownerHouseId, tileKey, x, y, hp, maxHp, damagedLastRound }`.
* **`CommanderState`:** `{ houseId, unitId: string | null, xp, level: 1 | 2 | 3, traits: CommanderTraitId[], skillCooldown: number, woundedTurnsRemaining: number, skillActiveUntilTurn: number, markedTargetUnitId: string | null }`.
* **`TileState`:** `improvementLevel: 1 | 2`, `hasRoad: boolean`, `outpostId: string | null`, `villageHp: number | null`, `highSeatHp: number | null`, `highSeatDamagedLastRound: boolean`.
* **`UnitState`:** `isOverwatch: boolean`, `isDeployed: boolean`, `movedOpenTilesThisTurn: number`, `battleHonors: BattleHonorId[]`, `isCommander: boolean`, `overwatchRangeBonusUntilTurn: number`.
* **Unions:** `Phase` includes `'specialization_modal' | 'citadel_modal' | 'honor_modal' | 'commander_trait_modal' | 'event_modal' | 'draft_modal'`; `UnitClass` adds `'commander'`; `UnitId` adds `'trebuchet'` and `'lord_commander'`.
* **Save Metadata (stored next to `GameState` in IndexedDB, NOT inside it):** `{ slotId, savedAtIso, turnNumber, houseId, mode, mapPreset }`.

---

## 3. Canonical Game Rules Enforcement (v2.0)

* **4-Resource Economy & Iron Scarcity:** Stockpiled `Iron` is spent on armored/siege units, Smithies, Siege Workshops, Stone Curtain Walls, Stone Bastion Towers, Tier-3 Citadels (`10 Iron`), and paid heavy unit reinforcement (no negative Iron bankruptcy). Advanced/Lv2 buildings carry Coin upkeep; unpaid Coin wages trigger Mutiny (`8` true damage, `-25%` Atk).
* **Winter Provisioning & Paid Field Reinforce:** Passive stationary healing is `2 HP/turn` (`+3` on Keep/Outpost, `+2` Fortify). Active **Field Reinforce** restores `+8 HP` for `4 Coin + 3 Mat` (standard) or `5 Coin + 1 Iron` (armored/siege). During Winter, Keeps without net Food `>= 0` or an owned Granary/Stone Silo leave homed units vulnerable to Winter attrition even inside friendly territory (except on the Keep tile) and prevent healing.
* **Whole-Map Building, Roads, Clear Timber & Frontier Outposts:** Generic improvements exist for every terrain (`logging_camp`, `stone_quarry`, `highland_pasture`, `river_fishery`, `stone_bridge`, `peak_beacon`, `barracks`, `siege_workshop`, plus v1 buildings) with Level-2 upgrades (`improvementLevel: 1 | 2`). **Roads** (`hasRoad: true`, `3 Mat`) reduce terrain move cost to `1` and grant `+1` road travel bonus when starting & moving on Roads. **Clear Timber** (`4 Coin`) converts unimproved Forest to Plains (`+6 Mat`). **Frontier Outposts** (max `2` per House, `3` with Border Wardens) claim `3×3` neutral pockets (`outpostId`), act as Winter shelter & reinforce hubs, and cannot train units.
* **Local Military Unlocks & Keep Tier 3:** `barracks`, `smithy` (adjacent to Iron Mine/Deep Smeltery + Lumber Mill/Stone Quarry), and `siege_workshop` unlock units **locally at their parent Keep**. Tier-1 (`3×3`, `36 HP`, `Cap 3`) → Tier-2 (`5×5`, `48 HP`, `Cap 4`, `30 Food`, 4 Specializations including `forge_seat`) → Tier-3 Grand Citadel (`7×7` sticky borders, `64 HP`, `Cap 5`, `90 Food + 10 Iron`, Range-2 Arrow Slits volley, 4 Citadel Charters).
* **Fortifications, Wall Links & Watchtowers:** Palisade (`+0.20`) and Stone Wall (`+0.30`) stack **additively** on top of terrain cover (capped at `0.60`, `0.70` with Stone Curtain), grant flank immunity and `-25%` incoming ranged damage. Two orthogonally adjacent enemy walls **block diagonal movement** between them. Non-siege deals `50%` damage to fortifications/Keeps and takes `2` spike damage in melee vs unmanned walls. Watchtowers (`7×7` sight, buildable on border or `1` tile outside, `+1` ranged Range & `+15%` Atk, Winter shelter) upgrade to Stone Bastion Towers firing an automatic `3`-dmg end-of-turn border volley.
* **Combat Overhaul & Class Actions:** Closed 4-way counter loop (`spearman → cavalry → ranged/siege`, `infantry → spearman`, `ranged → infantry`, Crossbow ignores `30%` Def vs `Def >= 5`, `siege` 100% vs structures). `COMBAT_DAMAGE_SCALE = 2.2`, One-Shot Protection retained, Spearman Phalanx Brace, Infantry Shield Push (1 tile knockback on winning melee trade), Cavalry Lance Charge (`+20%` Atk after `>= 2` open/road tiles), Ranged Overwatch (`85%` reaction volley on first enemy entering range), Trebuchet 1-turn Deploy + range-3 Bombard, River attack `-25%`, Hills downhill `+15%`, Branching Battle Honors at Rank 1/2.
* **Lord-Commanders (1 per House):** Exempt from Army Cap, `2 Coin` upkeep, 1-tile aura (`+10%` Atk/Def, Winter/Mutiny shield), 4-turn signature Command Skill (Vane *Warden's Volley*, Ironhelm *Hold the Line*, Aurelia *Golden Banner*, Corvus *Raider's Horn*, Solis *Beacon Mark*), Levels 1–3 Marshal Traits, and `5`-turn Wounded + Ransom (`+3 Favor, +15 Coin`) on defeat.
* **Mutually Exclusive Royal Decrees (8 Pairs = 16 Doctrines):** Triggered `6–8` times per campaign; choosing one decree permanently locks its opposite (`lockedDecreeIds`).
* **34×34 Scale, High Seat & Victory:** `34×34` Grand March default (`22×22` & `28×28` presets available). Central Ruined High Seat (`42 HP` neutral Tier-2 fortress) grants `+3 Coin/turn`, `+1 Favor` on even turns, and `+15` one-time Chronicle Landmark score—never an auto-win or Mandate shortcut. Dominion Supremacy: `>= 75%` of owned Keeps & `>= 10` Keeps (`>= 8` in 4-House, scaled for Compact/Standard). Regent's Mandate: `>= 60` Favor + `>= 6` Keeps + `>= 2` Tier-3 Citadels held for `6` turns (scaled on smaller presets). Chronicle: `48 / 72 / 108` turns.
* **AI Guardrails & Spatial Indexing:** `src/engine/spatialIndex.ts` eliminates `O(N)` tile scans on `34×34`. `runAiTurn` enforces `MAX_AI_ACTIONS = 16` (scaled for 34×34), `2,000` tactical combat resolutions, synchronous modal decisions, and `8,000ms` Web Worker watchdog.

---

## 4. IndexedDB & Multi-Session Persistence Safety

* **Storage Engine:** `idb` in `src/storage/persistence.ts` targeting `marchlands_db` with `CURRENT_SCHEMA_VERSION = 2`.
* **Eviction Protection:** Call `navigator.storage?.persist?.()` on initialization.
* **Atomic Save Boundaries:** Autosave asynchronously after every completed player action, modal choice, undo, and AI turn.
* **Strict `specVersion === '2.0'` Validation:** Reject v0.3 or malformed payloads cleanly without crashing; validate `gridSize` in `{22, 28, 34}` and required `2.0` keys (`outposts`, `commanders`, `crown`, `chronicle`).

---

## 5. Mobile PWA & `375x812` Viewport Standards

* Zero horizontal scroll (`overflow-x: hidden`), gesture locking (`user-scalable=no`, `touch-action: manipulation`, `overscroll-behavior: none`), safe-area insets, `>= 44px × 44px` touch targets (`>= 8px` gap), `8px` pan-vs-tap threshold, quick-jump/minimap navigation for `34×34`, compact 4-resource `TopHud`, and zero external raster assets (pure inline SVG).

---

## 6. Testing & Verification Protocol

1. **Type Safety:** `npx tsc --noEmit` passes with zero errors.
2. **Headless Engine Tests (`Vitest`):** Unit tests in `src/engine/__tests__/` covering `34×34` mapGen fairness, 4-resource yields & Iron sinks, Lv2 upgrades, Roads, Clear Timber, Frontier Outposts, Wall Linking, Bastion volleys, 4-way counter combat, Shield Push, Charge, Overwatch, Trebuchet Deploy, Keep Tier 3 & Arrow Slits, Lord-Commanders, Exclusive Doctrine Pairs, Battle Honors, Winter Provisioning, AI guardrails, and Victory conditions.
3. **Simulation Harness:** CI smoke test passes with `0` invariant failures; full `34×34` Dominion & Chronicle suites pass `docs/SIMULATION_HARNESS.md` v2.0 gates.
4. **Production PWA Build:** `npm run build` and `npm run lint` pass cleanly.
5. **Mobile Viewport Audit:** Zero clipped text, zero horizontal overflow, zero sub-`44px` controls at `375×812`.
