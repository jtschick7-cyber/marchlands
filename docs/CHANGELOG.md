Spec Version: 0.3

# Marchlands Changelog

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

*(No post-v0.3 simulation tuning passes recorded yet.)*
