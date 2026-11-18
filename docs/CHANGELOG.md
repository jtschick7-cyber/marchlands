Spec Version: 0.2

# Marchlands Changelog

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

*(No post-v0.2 simulation tuning passes recorded yet.)*
