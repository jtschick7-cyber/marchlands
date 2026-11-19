Spec Version: 0.3

# Marchlands: Two-Layer AI Architecture

This document defines the headless, deterministic, fog-honest AI architecture in `src/engine/`. All numeric values are initial tuning values and belong in `src/data/` as named constants.

---

## 1. Module Split (`src/engine/`)

* `src/engine/ai/influence.ts` — Builds per-turn spatial maps from the AI House's **fog-honest** view:
  * **Class-Aware Threat Map (`TileThreat`):** For each tile, computes a 4-class tuple of the maximum damage any visible enemy unit could deal to a canonical defender of each class standing on that tile next turn (including terrain/fortification `DefBonus`, enemy movement, range, and Zone of Control):
    ```ts
    export interface TileThreat {
      vsSpearman: number; // Canonical Spearman (Def 6)
      vsCavalry: number;  // Canonical Knight (Def 5)
      vsRanged: number;   // Canonical Archer (Def 2); also used by Siege units
      vsInfantry: number; // Canonical Men-at-Arms (Def 5)
    }
    ```
    Tactical evaluation and threat avoidance read the field matching the evaluating unit's class (`siege` reads `vsRanged`).
  * **Value Map:** Economic value of tiles (improvement yield) plus Keep and landmark value.
  * **Frontier Map:** Distance from the AI House's territory to the nearest rival territory.
* `src/engine/ai/strategic.ts` — Runs once at the start of each AI turn and writes `house.aiPlan`.
* `src/engine/ai/tactical.ts` — Plans and executes combat, capture, pillage, and positioning for the turn's units via lightweight beam search (`TacticalSimState`) and canonical replay.
* `src/engine/ai/economy.ts` — Scores and executes building construction, unit training, annexations, Keep specializations, Royal Decree drafts, Crown Audience actions, opportunistic Keep re-homing, and Frontier Event choices using personality weights on a **`0–100` utility scale**.
* `src/engine/utilityAi.ts` — Single entry point `runAiTurn(state, houseId) → GameState`. Execution order:
  1. `strategic` (update `house.aiPlan`)
  2. `tactical` (joint combat, capture, pillage, & positioning plan)
  3. `economy` (unified post-combat pass: unit training, building construction, annexations, Crown Audience — sharing the `MAX_AI_ACTIONS = 12` cap; plus optional opportunistic manual Keep re-homing when a unit sits on a frontline Keep with open cap while its home Keep is full, which does not consume `MAX_AI_ACTIONS`)
  4. End turn

---

## 2. Strategic Layer (`ai/strategic.ts`)

### Posture Selection & Hysteresis
* **Postures** (`house.aiPlan.posture`), picked from scores weighted by personality:
  * `'defend'`: Total enemy threat on own territory exceeds nearby friendly military strength.
  * `'claim'`: Regent's Mandate conditions are within reach (`favor >= 22` and `keeps >= 4`), **Dominion mode only**.
  * `'attack'`: A reachable target Keep scores above the attack threshold.
  * `'expand'`: Default fallback; prioritize Frontier Villages, Relic Ruins, Ancient Watchtowers, Outlaw Camps, and fog frontiers.
* **Hysteresis:** Once chosen, a posture is held for at least **3 turns** (`postureLockedUntilTurn`), **unless** an owned Keep is attacked, which forces `'defend'` immediately.

### Target Keep, Rally Point & Muster Rule
* **Target Keep:** Maximize `(Keep value + specialization value + Mandate-claimant bonus) / (distance × defensive strength)`. Defensive strength comes from the threat map and visible garrison. A rival Mandate Claimant receives a large priority bonus.
* **Rally Point:** A tile in own or neutral territory, `3–5` tiles from the target Keep, with the lowest threat-map value.
* **Muster Rule (with Timeout & Engage-if-Attacked):** `house.aiPlan` tracks `rallyStartedTurn: number | null` (set when entering `'attack'` posture or picking a new target Keep; cleared when leaving `'attack'`). In `'attack'` posture (Normal and Hard difficulty), units gather at the rally point and advance as soon as **any** of these triggers:
  1. `>= 3` friendly units (or the full army if total units `< 3`) are within `2` tiles of `rallyPoint`, **OR**
  2. `turnNumber - rallyStartedTurn >= 3` (`3`-turn muster timeout), **OR**
  3. Any friendly unit within `3` tiles of `rallyPoint` took combat damage since the AI's previous turn (**engage-if-attacked**).

### `'expand'` Posture Target Assignment
* When `posture === 'expand'` (or for non-attacking units without a defense/rally assignment), assign each unit a deduplicated target destination from fog-honest visible/frontier objectives scored by distance and personality:
  1. Visible unclaimed `frontier_village` (annexable or capturable)
  2. Visible unexplored `relic_ruin`
  3. Visible `ancient_watchtower` (unrevealed or unoccupied for ongoing yield)
  4. Visible `outlaw_camp` (when nearby friendly strength exceeds Bandit threat; high weight for Corvus)
  5. Nearest passable explored tile adjacent to at least `1` `unexplored` tile (fog frontier)

---

## 3. Tactical Layer (`ai/tactical.ts`)

### Lightweight Combat Projection (`TacticalSimState`) & Action Pruning
* **No Full `GameState` Cloning in Search:** Beam search operates on a stripped-down `TacticalSimState` containing only:
  * Active visible units (minimal combat struct: `id, houseId, typeId, x, y, hp, maxHp, hasMoved, hasAttacked, isOrphaned, isMutinied`),
  * Relevant Keeps (`id, ownerId, x, y, keepHp, maxKeepHp, specialization`),
  * Relevant Neutral Villages (`tileKey -> villageHp`) and destructible fortifications (`tileKey -> { hp, ownerId, type }`),
  * Precomputed House combat modifier flags (from decrees/effects) and a shared immutable reference to static terrain/defense lookup tables.
* **Unit Ordering & Candidate Pruning:**
  * Build candidate actions for every unit that can act: `(unit, destinationTile, target | none)` using reachable tiles only, respecting ZoC and action-order rules (`BALANCE_MODEL.md` §1b).
  * Iterate attacking units in fixed heuristic order (**Ranged → Siege → Melee finishers → Cavalry → Remaining melee**, capped at search depth **`6`**) instead of searching all unit permutations.
  * Prune each unit's candidate actions before branching to its top `K` local-score actions (`K = 2` Easy, `K = 4` Normal, `K = 6` Hard), always retaining at least `1` hold/reposition candidate.
  * **Beam width:** Depends on difficulty (`1` Easy, `4` Normal, `8` Hard).
  * **Optional Pair-Swap Pass:** Run an O(N) adjacent pair-swap pass at the end of beam search if combat-resolution budget remains (`< 2,000`).
* **Plan Evaluation Function:**
  `3 × (value of enemy units killed) + 1 × (damage dealt) + 4 × (Keep HP removed or Keep captured) − 2 × (damage taken from retaliation) − 1.5 × (sum over own units of end-tile class-matched threat ÷ unit HP)`
  * `Unit value = Material cost + 4 × Coin upkeep`
  * Personality weights scale the risk term (Ironhelm is most risk-averse; Corvus is least risk-averse).
* **Search Budget:** At most **`2,000` simulated combat resolutions per House turn**. When the budget runs out, execute the best plan found so far.
* **Canonical Replay:** Apply the chosen plan's actions sequentially to the real `GameState` through the standard engine action reducers so fog reveals, Chronicle events, Salvage, and captures stay 100% consistent.

### Positioning for Non-Attacking Units
* Move toward the assigned `'expand'` objective, rally point, or target, choosing the reachable tile with the lowest `class-matched threat ÷ HP`.
* Treat tiles where `class-matched threat >= current HP` as forbidden, **except** in `'attack'` posture when the tile is adjacent to the target Keep.
* Keep `ranged` units behind `melee` units (prefer tiles with a friendly melee unit between them and the enemy).
* **Determinism:** Ties are broken deterministically by `unit.id`, then `tileKey` (`"x,y"`). **Zero unseeded randomness.**

---

## 4. Difficulty Levels (`GameState.difficulty`)

Selected at new-game setup alongside `mode`. Fog of war is **honest at every difficulty**.

| Level | Beam Width | Candidate Cap (`K`) | Threat Avoidance | Muster Rule | Economy |
| :--- | :---: | :---: | :--- | :---: | :--- |
| **Easy** | `1` *(greedy)* | `2` | Ignores threat map `50%` of the time *(seeded)* | Off | Standard |
| **Normal** | `4` | `4` | On | On | Standard |
| **Hard** | `8` | `6` | On | On | `+15%` Materials & Coin income |

---

## 5. Termination Guardrails

1. **Single Plan Entry per Unit:** Each unit commits to exactly one plan entry per turn (at most one move and one attack). The plan is computed jointly on `TacticalSimState`, then replayed canonically through engine reducers.
2. **Economy Action Cap:** Post-combat economy actions (unit training, building construction, annexations, Crown Audience) share `MAX_AI_ACTIONS = 12` per House turn, or stop when the best action scores below `MIN_ACTION_SCORE = 5` (on the `0–100` utility scale). Opportunistic manual Keep re-homing does not consume `MAX_AI_ACTIONS`.
3. **Tactical Search Budget:** `2,000` simulated combat resolutions per House turn is a hard cap.
4. **Synchronous Decisions:** AI drafts, Keep specializations, Frontier Event choices, and Crown Audience actions resolve synchronously in memory and never open a modal.
5. **Web Worker & `8,000ms` Watchdog:** In the browser, `runAiTurn` runs inside a **Web Worker**. An `8,000ms` watchdog timer guards execution. If it fires, the main thread discards the worker's partial result, ends that House's turn with **no AI actions**, logs a ChronicleEvent, autosaves to `IndexedDB`, and advances to the next House. In the simulation harness, any watchdog trip counts as an invariant failure.
