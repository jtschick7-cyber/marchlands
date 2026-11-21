Spec Version: 2.0

# Marchlands Changelog

## v2.0 (Grand Frontier Overhaul)

* **Four-Resource Economy (`Iron`):** Added scarce `Iron` resource gating armored/siege units, Stone Walls, Citadels, and paid heavy unit reinforcement (no negative Iron bankruptcy). Added Coin upkeep on advanced/Lv2 buildings, slower free passive healing (`2 HP`) paired with active **Paid Field Reinforce** (`+8 HP`), and **Winter Provisioning** tying Granaries & Food balance to Winter army survival.
* **Whole-Map Terrain Building, Roads & Outposts:** Added terrain-native improvements for Forest (**Logging Camp** + **Clear Timber**), Hills (**Stone Quarry**, **Highland Pasture**), River (**River Fishery**, **Stone Bridge**), Mountain (**Peak Beacon**), plus local military buildings (**Barracks**, **Siege Workshop**), Level-2 upgrades across all core improvements, **Road overlays**, and **Frontier Outposts** (max `2` per House).
* **Keep Tier 3 & Citadels:** Expanded Keep progression to Tier 3 (`7×7` sticky borders, `64 HP`, Range-2 Arrow Slits volley, `90 Food + 10 Iron`), added 4th Tier-2 specialization (**Forge Seat**), and added 4 Tier-3 **Citadel Charters** (*War College*, *Grand Exchange*, *Royal Bastion*, *High Armory*).
* **High-Impact Fortifications:** Made Wall cover additive over terrain (`+20%`/`+30%`), added `-25%` ranged damage reduction, flank immunity, **orthogonal Wall Linking** (diagonal block), `50%` non-siege structure damage penalty + `2` melee spike damage, Watchtower border projection (`7×7` sight, `+1` ranged Range/Atk, Winter shelter), and Stone Bastion end-of-turn volleys.
* **Deterministic Tech vs. Exclusive Royal Decrees:** Moved baseline buildings and units into deterministic Keep Tiers and local military buildings; redesigned Royal Decrees into **8 Mutually Exclusive Doctrine Pairs (16 bold doctrines)** yielding `6–8` impactful picks per campaign.
* **Lord-Commanders:** Added 1 unique grounded Marshal per House with 1-tile leadership aura, 4-turn signature Command Skill (including reworked Vane *Warden's Volley*), Levels 1–3 Marshal Traits, and `5`-turn Wounded + Ransom (`+3 Favor, +15 Coin`) loop.
* **Combat Overhaul & Class Tactical Actions:** Closed the 4-way counter loop (`Ranged → Infantry`, Crossbow `30%` armor-pierce), lowered `COMBAT_DAMAGE_SCALE` to `2.2` for `3–4` hit tactical trades, added River/Hills attack modifiers, **Phalanx Brace**, **Shield Push**, **Lance Charge**, **Ranged Overwatch**, **Trebuchet Deploy/Bombard**, and branching **Battle Honors**.
* **Grand Scale (`34×34`, `100+` Turns) & Central High Seat:** Defaulted v2.0 to `34×34` (`22×22` & `28×28` presets retained), added the balanced **Central Ruined High Seat**, scaled Dominion/Chronicle victory conditions, and added `src/engine/spatialIndex.ts` for fast `34×34` AI execution.

### v2.0 Headless Simulation Balance Pass (Step 9 Gates — 2026-11-21)
* **Spatial Index & AI Optimizations (`spatialIndex.ts`, `ai/strategic.ts`, `ai/tactical.ts`, `ai/economy.ts`):** Split `WeakMap` indexes by sub-record (`tiles`, `units`, `keeps`, `outposts`), added static terrain-improvement tables and zero-allocation `computeTileYield` overrides, fixed AI military building priorities (`barracks`, `smithy`, `siege_workshop`) and combined-arms unit training, ordered frontline Siege units after Ranged/Melee/Cavalry so defenders on Keeps are cleared before Rams/Trebuchets strike, fixed whole-empire `defend` locks, removed muster freeze against active Mandate Claimants, and immediately broke Regent's Mandate upon losing any Keep in `captureKeep`.
* **Economy & Faction Tuning (`constants.ts`, `improvements.ts`, `units.ts`, `economy.ts`):** Capped Ironhelm bare-mountain `deep_smeltery` at `2`/Keep, Aurelia `Grand Customhouse` Favor at `+1`/Keep per 4 turns, Solis `signal_bastion` under per-Keep Watchtower caps, Wall caps at `2/4/6`, Keep Tier-1/2/3 HP at `36/48/64` (`+14` Garrison), `NON_SIEGE_STRUCTURE_DAMAGE_MULT = 0.60`, and tuned `grand` Dominion thresholds (`supremacyKeepShare = 0.48`, `supremacyMinKeeps5 = 11`, `mandateMinFavor = 120`, `mandateMinKeeps = 9`, `mandateMinTier3Citadels = 3`, `mandateHoldTurns = 9`).
* **All 12/12 Grand (`34×34`) Dominion Gates + 8/8 Chronicle Gates PASSED (`0` invariant violations, `100%` determinism):**
  * **5-House Dominion Win Rates (25 games):** `vane 24.0%`, `ironhelm 16.0%`, `aurelia 24.0%`, `corvus 24.0%`, `solis 12.0%` (target `12–28%` each).
  * **Pacing & Victory Mix:** Median length `89` turns (`p10=48, p90=116`, target `85–130`), `0.0%` stalemate (`0/25`, target `< 5%`), `28.0%` Supremacy / `72.0%` Mandate (no type `> 75%`), `28.0%` Mandate break rate (`7/25`, target `> 15%`), `100%` High Seat capture rate.
  * **Strategic Depth & AI:** Specializations `38.0% / 17.6% / 18.5% / 25.9%` (all `≥ 10%`), `82.04` Siege/game (`12.0` Sapper, `64.0` Ram, `6.04` Trebuchet), median `8` Decrees, AI turn `p95 = 71.5 ms` (`< 250 ms`), focus-fire `55.6%` (`≥ 45%`), piecemeal `1.4%` (`≤ 20%`).
  * **Chronicle (15 games, Turn 72):** `0` violations, `89.9%` median 1st-to-last score spread (`≥ 25%`), `p95 = 67.5 ms`.

---

## v0.3

### Part 1 — Combat, Units & Tactical Rules
* **C1 — Spearman "Brace" Retaliation Against Cavalry:** Surviving `spearman` units retaliating against melee `cavalry` attacks calculate retaliation `EffAtk` using their pre-hit HP ratio (`hpBefore / maxHp`). Added `PIKE BRACE` combat preview badge.
* **C2 — Melee-Only Bypass for One-Shot Protection (Steadfast):** Restricted Steadfast bypass to melee attackers (`range === 1`) with counter advantage (`CounterMult > 1.0`); ranged units can never one-shot a full-HP unit. Removed the v0.2 Longbowman one-shot example.
* **C3 — Soften Siege Ram Burst & Raise Base Keep HP:** Raised `maxKeepHp` from `20`/`30` to `24`/`34`, set capture HP to `Math.floor(maxKeepHp / 2)` (`12`/`17`), lowered `siege_ram` structure Attack from `10` to `8`, and clarified unmanned fortification defense (`12 HP`, `4 Def`, `0.00 DefBonus`, *Mortar & Stonework* `25%` siege reduction still applies).
* **C4 — Men-at-Arms (`men_at_arms`):** Added mid-tier `infantry` unit (`22 HP, 7 Atk, 5 Def, 2 Mov, 12 Mat, 1 Coin`) unlocked by new Military Charter `decree_sword_guilds` (*Chartered Men-at-Arms*), expanding the pool to `25` decrees, with SVG blueprint in `DESIGN_TOKENS.md`.
* **C5 — Summoning Sickness & Training Tile Rules:** Newly trained units and hired `free_company_spearman` spawn with `hasMoved = true` and `hasAttacked = true` (no spawn-turn healing); training requires an unoccupied Keep center tile; defined `evt_free_company` Capital spawn fallback.
* **C6 — Manual Keep Re-Homing:** Allowed friendly units (except `free_company_spearman`) standing on a friendly Keep with open Army Cap to **Re-home Here** for `0` resources and `0` actions (non-commit/undoable, clears `'orphaned'`).

### Part 2 — Progression, Economy & Faction Balance
* **C7 — Slow Mid-Game Decree Draft Inflation:** Changed Coin milestones to escalating intervals (`coinMilestonesClaimed`, `nextCoinMilestone += 20 * (coinMilestonesClaimed + 1)`: `25 -> 65 -> 125 -> 205...`) and capped Tier-2 Keep repeat drafts to the first repeat (`repeatMilestonesClaimed === 0`); subsequent repeats award **Royal Surplus** (`+10 Coin`, `+2 Royal Favor`, no draft).
* **C8 — Exclude Redundant Military Charters & Fix Starting Decree Score:** Added `excludedHouseIds` on `DecreeDef` (`decree_fletchers_guild` excluded for Vane; `decree_chivalric_order` excluded for Aurelia; `24` eligible for Vane/Aurelia, `25` for others) and `startingDecreeCount` (`2` for Aurelia) so starting decrees do not award free Chronicle points.
* **C9 — Relax Peaceful Annexation Food Sourcing:** Peaceful Annexation automatically draws `12` Food from the closest (Chebyshev) friendly Keep with `foodProgress >= requiredFood` (tie-break highest `foodProgress`, then `keep.id`) instead of requiring the annexing unit's `homeKeepId`.

### Part 3 — Map Generation, Villages & Landmarks
* **C10 — Neutral Frontier Village Combat Stats & Seizure Trade-Offs:** Added `tile.villageHp` (`12 HP`, `3 Atk`, `4 Def`, `+0.20 DefBonus`, `+3 HP/round` regen); Peaceful Annexation yields a `24/24 HP` Keep + `+1 Royal Favor`, while violent seizure yields an `8/24 HP` Keep and `-2 Royal Favor`.
* **C11 — Smithy Adjacency for `deep_smeltery` & Capital `mapGen` Geometry Guarantee:** Allowed `deep_smeltery` to satisfy `smithy`'s `iron_mine` adjacency, and required every Capital's `5x5` to contain a valid Iron Deposit -> Smithy -> Lumber Mill adjacency chain (never relaxed for Aurelia).
* **C12 — Ongoing Value for Ancient Watchtowers:** Made `7x7` fog reveal per-House (first House overall still earns `+10` Landmark score), added `+0.30 DefBonus` when standing on one, and added `+2 Coin/turn` plus `+1 Royal Favor` on even turns while occupied.

### Part 4 — Campaign Calendar & Chronicle Mode
* **C13 — End Chronicle Mode on Turn 33:** Shortened Chronicle mode from `Turn 36` to `Turn 33` (end of Year 3 Autumn — *Chronicle of the Three Harvests*) and suppressed Turn 33 Writ publication in Chronicle mode (`5` clean Writ cycles).

### Part 5 — AI Architecture Refinements
* **C14 — Class-Aware AI Threat Map:** Replaced scalar Spearman threat map with 4-class `TileThreat` (`vsSpearman`, `vsCavalry`, `vsRanged`, `vsInfantry`).
* **C15 — Lightweight Combat Projection & Action Pruning:** Replaced full `GameState` cloning in tactical beam search with `TacticalSimState`, fixed heuristic unit ordering, top-`K` candidate pruning (`K = 2/4/6`), optional O(N) pair-swap pass, and canonical replay.
* **C16 — Post-Combat AI Unit Training:** Reordered `runAiTurn` to `strategic -> tactical -> economy -> end turn` with optional opportunistic manual Keep re-homing.
* **C17 — Explicit AI `'expand'` Targets & Muster Timeout:** Added deduplicated fog-honest `'expand'` target assignment and `rallyStartedTurn` with `3`-turn Muster timeout and engage-if-attacked trigger.

---

## v0.2

### Part A — Canonical Corrections & Missing Mechanics
* **A1 — Modifier Stacking Rule:** Changed percentage attack/defense bonuses to additive buckets clamped to `[−0.50, +1.50]` with Counter-Triangle (`1.40`) multiplying afterwards, unified terrain/fortification to non-stacking `DefBonus`, and replaced the hand-written HTK table with `scripts/genHtkTable.ts`.
* **A2 — Food Model:** Removed house-level Food treasury so Food flows directly into each Keep's growth bar; updated Peaceful Annexation (`15 Coin` + `12 Food` from the annexing unit's `homeKeepId` growth bar) and the Turn 1–10 pacing benchmark.
* **A3 — Coin Draft Milestones:** Tracked gross Coin earned in `house.lifetimeCoinEarned` and next threshold in `house.nextCoinMilestone` (`25, 60, 95, 130…`).
* **A4 — Naming and Data Consistency:** Standardized on `Lumber Mill`, removed `Field Medics`, replaced `Open Keep Tile` with `Plains, Hills` for Smithy, replaced `Draft Rerolls` with `Crown Audience` Coin/Favor sinks, and aligned Turn-1 starting unlocks.
* **A5 — Victory Conditions:** Replaced Capital-only Conquest with 0-Keep elimination, added `≥ 5` Keeps minimum to Supremacy (`≥ 65%` of owned Keeps), and defined mode-specific Dominion/Chronicle victory priority.
* **A6 — Missing Combat and Movement Mechanics:** Added terrain movement costs, minimum-move rule, Move-then-Attack order, Zone of Control, Flanking (`+0.15`), melee non-advance, Pillage, Keep defense values (`Def 5`, `Atk 4`), `standing on` palisade wording, healing rules, and Outlaw Camp non-respawn rule.
* **A7 — Map Generation Specification:** Defined deterministic `mapGen(seed, houseCount)` terrain mix, capital spacing, per-House terrain guarantees, Frontier Village distribution, landmarks, Iron Deposits, and 50-attempt retry/relaxation order.

### Part B — New Features
* **B1 — Tier-2 Keep Specialization:** Added permanent Tier-2 Keep charters (*Garrison Seat*, *Market Town*, *Granary Seat*) resolved in `'specialization_modal'` before Royal Decree drafts.
* **B2 — Game Modes (Dominion & Chronicle):** Added open-ended `dominion` mode and 36-turn scored `chronicle` mode with `src/engine/scoring.ts → computeScore(state, houseId)`.
* **B3 — The Crown (Royal Favor, Writs & Regent's Mandate):** Added `Royal Favor`, 12 rotating public `Crown Writs`, `Crown Audience` actions, and the `Regent's Mandate` Dominion victory path.
* **B4 — "Previously in the March" Recap:** Added the 300-entry fog-filtered `chronicle` ring buffer and `buildRecap(state, viewerHouseId, sinceTurn)` for resume and turn-start recaps.
* **B5 — Undo for Actions That Revealed Nothing New:** Added `isCommitPoint` and an ephemeral 20-snapshot React-memory undo stack for non-commit player actions.
* **B6 — Seasons and Frontier Events:** Added the 3-turn seasonal calendar (*Spring, Summer, Autumn, Winter*) and 14 seeded `Frontier Events` with `activeEffects` and `'event_modal'`.
* **B7 — Headless AI-vs-AI Simulation Harness:** Specified the mandatory 11-step build order, `scripts/sim.ts` CLI runner, per-turn invariants, report metrics, and balance gates required before UI work begins.

### Part E — Approved Review Fixes
* **E1 — Draft Category Guarantee:** Guaranteed 1 Infrastructure, 1 Military, and 1 Doctrine card per 3-card draft hand (fallback order Doctrine → Infrastructure → Military).
* **E2 — Aurelia Signature Prerequisites:** Granted House Aurelia `decree_iron_prospecting` and `decree_master_smiths` at Turn 1 so Gilded Lancers are not double-gated by decrees.
* **E3 — War Camp Tuning:** Raised `war_camp` cost from `9` to `14` Materials and capped it at `1` per Keep and `2` per House.
* **E4 — Two-Layer AI Architecture:** Defined `ai/influence.ts`, `ai/strategic.ts`, `ai/tactical.ts` (beam search with `2,000` combat resolution cap), `ai/economy.ts` (`0–100` utility scale), `difficulty` (`easy`/`normal`/`hard`), and Web Worker + `8,000ms` watchdog guardrails.
* **E5 — One-Shot Protection:** Prevented full-HP units from being reduced below `1 HP` in a single hit unless the attacker has `CounterMult = 1.40` (primary strikes & retaliation).
* **E6 — Guaranteed Siege Access (Sapper Crew):** Added `sapper_crew` (`10` Mat, `6` structure Atk, 2-hit raze, no retaliation) as a Turn-1 base siege unit for all Houses.

---

## Balance passes

### Pass 1 (Step 9 Headless Simulation Tuning — 2026-11-19)

**Data & AI Tuning Changes (`src/data/`, plus tactical candidate deduplication & Easy economy multiplier):**
* **House Vane nerf (`units.ts`, `improvements.ts`, `constants.ts`):** `longbowman` `attack 7 -> 5`, `maxHp 16 -> 14`, `matCost 13 -> 19`, `coinUpkeep 2 -> 3`, `LONGBOWMAN_TERRAIN_ATK_BONUS 0.25 -> 0.10`; `foresters_lodge` `matCost 8 -> 10`, `baseFood 2 -> 1`, `baseMaterials 2 -> 1`.
* **Other Houses buffed to parity (`units.ts`, `improvements.ts`, `constants.ts`):** `oathsworn_halberdier` `attack 6 -> 7`, `matCost 13 -> 12`, `coinUpkeep 2 -> 1`, `deep_smeltery` `matCost 10 -> 8`; `gilded_lancer` `matCost 20 -> 17`, `coinUpkeep 3 -> 2`; `dusk_outrider` `matCost 14 -> 11`, `coinUpkeep 2 -> 1`; `vanguard_spearman` `attack 7 -> 8`, `defense 6 -> 7`, `matCost 13 -> 11`, `coinUpkeep 2 -> 1`, `signal_bastion` `matCost 9 -> 7`, `+1 Food / +1 Mat / +2 Coin`, `SIGNAL_BASTION_ADJ_ATK_BONUS 0.15 -> 0.20`.
* **Mandate pacing (`constants.ts`, `content.ts`):** `KEEP_REPEAT_SURPLUS_FAVOR 2 -> 0`; trimmed select Writ Favor rewards (`writ_victories 4 -> 3`, `writ_muster 3 -> 2`, `writ_iron 4 -> 3`) so Dominion games reach median 40–80 turns with balanced Supremacy/Mandate mix.
* **AI tactical coordination & difficulty scaling (`aiWeights.ts`, `constants.ts`, `tactical.ts`, `economy.ts`):** Lowered `riskAversion` (`0.70–1.35 -> 0.25–0.45`) and balanced House aggression weights; added `AI_MUSTER_MIN_UNITS = 2`, `AI_FOCUS_FIRE_WOUNDED_BONUS = 45`, `AI_SAME_TURN_FOCUS_BONUS = 35`, `AI_ALLY_FOLLOWUP_BONUS = 18`, `AI_SIM_FOCUS_FIRE_BONUS = 22`, `AI_SIM_FOCUS_KILL_BONUS = 36`; deduplicated tactical beam candidates by `(kind, targetId)`; set `AI_DIFFICULTY_CONFIG.easy.economyMultiplier = 0.70`.

**Before vs. After Metrics (5-House Normal Dominion, 5-House Normal Chronicle, 4-House Mixed Difficulty):**

| Gate | Target | Baseline (Before) | Post-Tuning (After) | Status |
| :--- | :--- | :--- | :--- | :---: |
| Invariant failures | `0` | `0` (25 games) | `0` (50+50+60 games) | **PASS** |
| Win rate per House (5-House Dominion) | `12–28%` each | `vane 84.0%, ironhelm 0.0%, aurelia 4.0%, corvus 8.0%, solis 4.0%` | `vane 18.0%, ironhelm 26.0%, aurelia 22.0%, corvus 14.0%, solis 20.0%` | **PASS** |
| Dominion median game length | `40–80` turns | `29` turns (`p10=22, p90=40`) | `43` turns (`p10=26, p90=94`) | **PASS** |
| Dominion stalemate rate | `< 5%` | `0.0%` | `4.0%` (`2/50`) | **PASS** |
| Victory type mix (Dominion) | No type `> 70%` | `mandate 72.0%, supremacy 28.0%` | `supremacy 66.0%, mandate 34.0%` | **PASS** |
| Chronicle (Turn 33) 1st-to-5th score spread | `≥ 25%` of 1st | `91.2%` median | `88.4%` median | **PASS** |
| Each specialization pick rate | `≥ 15%` | `54.1% / 27.0% / 18.9%` | `56.9% / 24.0% / 19.1%` | **PASS** |
| AI turn time p95 | `< 250 ms` (Normal) / `< 500 ms` (Hard) | `77.2 ms` (Normal) | `84.4 ms` (Normal) / `69.5 ms` (Hard) | **PASS** |
| AI focus-fire rate (Normal) | `≥ 50%` | `47.2%` (Dom) / `49.6%` (Chr) | `50.4%` (Dom) / `51.2%` (Chr) | **PASS** |
| AI piecemeal rate (Normal) | `≤ 20%` | `7.3%` (Dom) / `7.7%` (Chr) | `5.4%` (Dom) / `7.1%` (Chr) | **PASS** |
| Mixed difficulty (`hard-vs-normal`) | `≥ 60%` | `60.0%` (`12/20`) | `66.7%` (`20/30`) | **PASS** |
| Mixed difficulty (`normal-vs-easy`) | `≥ 60%` | `35.0%` (`7/20`) | `80.0%` (`24/30`) | **PASS** |

---

## Implementation Milestones

### Steps 10–11 — Persistence, AI Web Worker & Mobile-First PWA (2026-11-19)
* **IndexedDB Persistence (`src/storage/persistence.ts`):** Added `idb` storage targeting `marchlands_db` (`CURRENT_SCHEMA_VERSION`), storing `SaveMetadata` alongside `GameState`, with `saveAutosave`, `loadAutosave`, manual save slots, `exportSaveJson`, `importSaveJson` (`specVersion === '0.3'` validation), non-blocking error handling, and `navigator.storage?.persist?.()`.
* **AI Web Worker (`src/workers/aiWorker.ts`, `src/workers/runAiTurnWithWatchdog.ts`):** Offloaded `runAiTurn` to an ES-module Web Worker with an `8,000ms` watchdog that discards partial results, logs `ai_watchdog_timeout`, and advances cleanly on timeout/error.
* **Headless UI Queries (`src/engine/queries.ts`):** Isolated net income, attack target enumeration, build adjacency previews, supremacy shares, and undo commit-point reasons inside `src/engine/` to keep `src/components/` free of game math.
* **Mobile PWA Shell (`src/components/`, `src/App.tsx`, `vite.config.ts`, `index.html`, `src/index.css`):** Built `MapBoard` (`48x48` inline SVG, pan/pinch-zoom, `8px` tap threshold, exact `DESIGN_TOKENS.md` palette), `TopHud`, `BottomDrawer` (combat preview with `STEADFAST` / `PIKE BRACE`, build/train/annex/pillage/re-home, 20-snapshot Undo), `TitleScreen`, all v0.3 modals (`specialization_modal`, `draft_modal`, `event_modal`, Crown Council, fog-filtered Recap, 3-card Field Guide, `game_over` Chronicle breakdown), and `vite-plugin-pwa` manifest + service worker. Verified `0` TypeScript errors, `0` ESLint errors, `36/36` Vitest tests passing, clean production PWA build, and `375x812` mobile viewport audit (`0` horizontal overflow, `0` sub-`44px` buttons).
