Spec Version: 0.2

# Marchlands: Two-Layer AI Architecture

This document defines the headless, deterministic, fog-honest AI architecture in `src/engine/`. All numeric values are initial tuning values and belong in `src/data/` as named constants.

---

## 1. Module Split (`src/engine/`)

* `src/engine/ai/influence.ts` — Builds per-turn spatial maps from the AI House's **fog-honest** view:
  * **Threat Map:** For each tile, the maximum damage any visible enemy unit could deal to a standard Spearman there next turn, using the real combat function with each enemy's movement, range, and Zone of Control (ZoC).
  * **Value Map:** Economic value of tiles (improvement yield) plus Keep and landmark value.
  * **Frontier Map:** Distance from the AI House's territory to the nearest rival territory.
* `src/engine/ai/strategic.ts` — Runs once at the start of each AI turn and writes `house.aiPlan`.
* `src/engine/ai/tactical.ts` — Plans and executes combat and positioning for the turn's units via beam search.
* `src/engine/ai/economy.ts` — Scores and executes building construction, unit training, annexations, Keep specializations, Royal Decree drafts, Crown Audience actions, and Frontier Event choices using personality weights on a **`0–100` utility scale**.
* `src/engine/utilityAi.ts` — Single entry point `runAiTurn(state, houseId) → GameState`. Execution order:
  1. `strategic` (update `house.aiPlan`)
  2. `economy` (pre-combat: unit training)
  3. `tactical` (joint attack-order & positioning plan)
  4. `economy` (post-combat: builds, annexations, Audience)
  5. End turn

---

## 2. Strategic Layer (`ai/strategic.ts`)

### Posture Selection & Hysteresis
* **Postures** (`house.aiPlan.posture`), picked from scores weighted by personality:
  * `'defend'`: Total enemy threat on own territory exceeds nearby friendly military strength.
  * `'claim'`: Regent's Mandate conditions are within reach (`favor >= 22` and `keeps >= 4`), **Dominion mode only**.
  * `'attack'`: A reachable target Keep scores above the attack threshold.
  * `'expand'`: Default fallback; prioritize Frontier Villages, Outlaw Camps, and Relic Ruins.
* **Hysteresis:** Once chosen, a posture is held for at least **3 turns** (`postureLockedUntilTurn`), **unless** an owned Keep is attacked, which forces `'defend'` immediately.

### Target Keep, Rally Point & Muster Rule
* **Target Keep:** Maximize `(Keep value + specialization value + Mandate-claimant bonus) / (distance × defensive strength)`. Defensive strength comes from the threat map and visible garrison. A rival Mandate Claimant receives a large priority bonus.
* **Rally Point:** A tile in own or neutral territory, `3–5` tiles from the target Keep, with the lowest threat-map value.
* **Muster Rule:** In `'attack'` posture (Normal and Hard difficulty), units gather at the rally point and **do not advance until `>= 3` units (or the entire army if smaller) are within `2` tiles of it**, preventing piecemeal attacks.

---

## 3. Tactical Layer (`ai/tactical.ts`)

### Attack-Order Beam Search
* Build candidate actions for every unit that can act: `(unit, destinationTile, target | none)` using reachable tiles only, respecting ZoC and action-order rules (`BALANCE_MODEL.md` §1b).
* Run a **beam search** over unit orderings with the real deterministic combat function, applying each action to a cloned state:
  * **Beam width:** Depends on difficulty (`1` Easy, `4` Normal, `8` Hard).
  * **Search depth:** Number of units that can attack, capped at **`6`**.
  * **Move-Generation Ordering Heuristic:** Ranged units first → Siege → Melee finishers → Cavalry.
* **Plan Evaluation Function:**
  `3 × (value of enemy units killed) + 1 × (damage dealt) + 4 × (Keep HP removed or Keep captured) − 2 × (damage taken from retaliation) − 1.5 × (sum over own units of end-tile threat ÷ unit HP)`
  * `Unit value = Material cost + 4 × Coin upkeep`
  * Personality weights scale the risk term (Ironhelm is most risk-averse; Corvus is least risk-averse).
* **Search Budget:** At most **`2,000` simulated combat resolutions per House turn**. When the budget runs out, execute the best plan found so far.

### Positioning for Non-Attacking Units
* Move toward the rally point or target, choosing the reachable tile with the lowest `threat ÷ HP`.
* Treat tiles where `threat >= current HP` as forbidden, **except** in `'attack'` posture when the tile is adjacent to the target Keep.
* Keep `ranged` units behind `melee` units (prefer tiles with a friendly melee unit between them and the enemy).
* **Determinism:** Ties are broken deterministically by `unit.id`, then `tileKey` (`"x,y"`). **Zero unseeded randomness.**

---

## 4. Difficulty Levels (`GameState.difficulty`)

Selected at new-game setup alongside `mode`. Fog of war is **honest at every difficulty**.

| Level | Beam Width | Threat Avoidance | Muster Rule | Economy |
| :--- | :---: | :--- | :---: | :--- |
| **Easy** | `1` *(greedy)* | Ignores threat map `50%` of the time *(seeded)* | Off | Standard |
| **Normal** | `4` | On | On | Standard |
| **Hard** | `8` | On | On | `+15%` Materials & Coin income |

---

## 5. Termination Guardrails

1. **Single Plan Entry per Unit:** Each unit commits to exactly one plan entry per turn (at most one move and one attack). The plan is computed jointly, and each unit acts once.
2. **Economy Action Cap:** Economy actions are capped at `MAX_AI_ACTIONS = 12` per House turn, or stop when the best action scores below `MIN_ACTION_SCORE = 5` (on the `0–100` utility scale).
3. **Tactical Search Budget:** `2,000` simulated combat resolutions per House turn is a hard cap.
4. **Synchronous Decisions:** AI drafts, Keep specializations, Frontier Event choices, and Crown Audience actions resolve synchronously in memory and never open a modal.
5. **Web Worker & `8,000ms` Watchdog:** In the browser, `runAiTurn` runs inside a **Web Worker**. An `8,000ms` watchdog timer guards execution. If it fires, the main thread discards the worker's partial result, ends that House's turn with **no AI actions**, logs a ChronicleEvent, autosaves to `IndexedDB`, and advances to the next House. In the simulation harness, any watchdog trip counts as an invariant failure.
