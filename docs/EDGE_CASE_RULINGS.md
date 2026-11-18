# Artifact #3: Marchlands Edge-Case & Exploit Red-Teaming Rulings

This document establishes deterministic rulings for every high-risk interaction, exploit vector, and state-machine edge case in *Marchlands*. Every ruling maps directly to `GameState` fields (`keeps`, `units`, `tiles`, `houses`, `phase`) so the game engine never softlocks, corrupts `IndexedDB` saves, or allows degenerate strategies.

---

## 1. Keep Capture, Territory Overlaps & Village Annexation

### Ruling 1.1: Keep Capture Mechanics (Conquest of Settlements)
* **The Ambiguity:** Can a unit walk onto an undefended Keep and capture it immediately, or do Keeps have garrison HP?
* **The Ruling:**
  1. Every Keep has **20 Garrison HP** (`keepHp` / `maxKeepHp: 20`). A Keep cannot be entered by an enemy unit while `keepHp > 0` or while a friendly unit occupies the Keep's center tile.
  2. Enemy units adjacent to a Keep (or within `range` for Ranged/Siege) may **Attack the Keep**. The Keep retaliates with `4 Base Attack` (scaled by `keepHp / 20` and `+35%` Keep defense) unless struck by a `siege` unit (`Siege Ram` deals `10 Base Attack` and takes zero retaliation).
  3. When `keepHp` reaches `0`, the Keep is **Neutralized** (`keepHp = 10` restored to the attacker's House, `ownerId` transfers immediately to the attacking House, and the attacking melee unit advances onto the Keep tile if unoccupied).
  4. **Regeneration:** Any Keep that did not take damage during the previous round regenerates `+4 Keep HP` at the start of its owner's turn (up to `20`).
  5. **Tile Ownership Transfer:** Upon capture, all tiles within the Keep's current radius (`3x3` for Tier 1, `5x5` for Tier 2) transfer `ownerHouseId` to the new owner, keeping intact economic improvements (`farm`, `lumber_mill`, `iron_mine`, `smithy`, `market`, `granary`). Faction-unique improvements convert into their standard equivalent (`foresters_lodge -> lumber_mill`, `deep_smeltery -> iron_mine`, `river_tollhouse -> market`, `war_camp` and `signal_bastion` are destroyed).

### Ruling 1.2: Overlapping Keep Borders (3x3 and 5x5 Collisions)
* **The Ambiguity:** What happens when two Keeps are 4–6 tiles apart and a Tier-1 Keep upgrades to a Tier-2 Stronghold (`5x5` radius), overlapping tiles already claimed by another Keep?
* **The Ruling:** **First-Claim Lock.** Tile `keepId` assignment is sticky. When a Keep expands to `5x5`, it claims only surrounding tiles where `tile.keepId === null`. It never steals a tile already assigned to an existing friendly or enemy Keep. If a Keep is destroyed or neutralized, its `keepId` tiles remain bound to that Keep's coordinates.

### Ruling 1.3: Peaceful Frontier Village Annexation Rules
* **The Ambiguity:** Can a player annex a Frontier Village while enemies are standing on or adjacent to it?
* **The Ruling:** Peaceful Annexation (`12 Food + 15 Coin`, or `7 Food + 9 Coin` with *Crown Envoys*) requires all three conditions:
  1. At least one friendly unit is orthogonally or diagonally adjacent (`Chebyshev distance === 1`) to the `frontier_village` tile.
  2. Zero enemy units are within `Chebyshev distance <= 1` of the village (no contested annexations).
  3. The village tile itself is unoccupied (or occupied by the annexing friendly unit).
  * **Effect:** Converts `landmark` to `'none'`, sets `landmarkCleared = true`, creates a new Tier-1 `Keep` assigned the next name from the House's name pool, and reveals a `3x3` fog radius.

---

## 2. Orphaned Units & Army Cap Enforcement

### Ruling 2.1: What Happens to Units When Their `homeKeepId` Keep is Captured?
* **The Ambiguity:** If House Ironhelm loses a Keep that was supporting 3 active units (`supportedUnitIds.length === 3`), do those units vanish, freeze, or stay on the board?
* **The Ruling:** **Automatic Reassignment First, Supply-Severed Debuff Second.**
  1. **Step A (Re-homing):** Immediately upon Keep loss, the engine checks all remaining Keeps owned by the defending House that have open Army Cap slots (`supportedUnitIds.length < getKeepArmyCap(keep)`). Orphaned units are automatically reassigned (`unit.homeKeepId = newKeep.id`) in order of highest unit `Material Cost` first.
  2. **Step B (Orphaned / Supply-Severed State):** Any remaining units that exceed the House's total remaining Army Cap are **not** deleted mid-combat. Instead, their `homeKeepId` is set to `'orphaned'`, applying the **Supply-Severed** status:
     * `-25% Attack` and `-25% Defense`
     * Cannot heal at end of turn
     * Still requires normal `Coin` upkeep
     * Automatically re-homes into the next Keep that frees up an Army Cap slot (either via unit death or Keep capture/upgrade).
  3. **Step C (Total House Elimination):** If a House loses its **last** Keep (`remainingKeeps.length === 0`), `house.isEliminated = true` triggers immediately, and all remaining units belonging to that House are removed from the board.

### Ruling 2.2: Destruction of House Corvus's `war_camp` (+1 Army Cap)
* **The Ruling:** If a `war_camp` is pillaged while its parent Keep supports `4/4` (Tier 1) or `5/5` (Tier 2) units, existing units remain assigned to that Keep (`4/3` over-cap) without penalty, but the Keep cannot train new units until its count drops below its new cap.

---

## 3. Palisade Fortifications & Anti-Griefing Rules

### Ruling 3.1: Preventing "Palisade Cage" Griefing Around Enemy Capitals
* **The Ambiguity:** Without limits, a rich player could build 8 Palisades completely encircling an enemy Capital's `3x3` border, trapping enemy units forever without capturing the Keep.
* **The Ruling:**
  1. **Strict Border Ownership:** Improvements (`palisade`, `watchtower`, etc.) can **only** be built on tiles where `tile.ownerHouseId === activeHouseId` and `tile.keepId !== null`. Players can never build Palisades inside neutral wilderness or enemy borders.
  2. **Per-Keep Fortification Cap:** Each Keep may support a maximum of **2 Palisades** (Tier 1) or **4 Palisades** (Tier 2) within its territory.
  3. **Destroying & Pillaging Enemy Palisades:** Any enemy unit adjacent to a `palisade` or `watchtower` may spend its attack action to **Raze Fortification** (Palisades have `12 Structure HP` and `4 Defense`; `Siege Rams` destroy them in 1 hit; melee units destroy them in 2 hits). Once razed, `tile.improvement` resets to `null`.
  4. **Friendly Movement:** Friendly units move through their own `palisade` tiles normally without penalty; only enemy units are blocked from entering or pathing through an intact enemy `palisade`.

---

## 4. Economy, Bankruptcy & Resource Overflow

### Ruling 4.1: Coin Bankruptcy (Negative Treasury Prevention)
* **The Ambiguity:** What happens during the Start-of-Turn Harvest & Upkeep Phase if a player's elite unit Coin upkeep exceeds their Coin income + current Coin treasury?
* **The Ruling:** `house.resources.coin` is clamped at a minimum of `0`—it never goes negative.
  1. At turn start, total Coin income is added first, then total unit Coin upkeep is subtracted.
  2. If `coin < 0`, `coin` is set to `0` and **Mutiny / Desertion** triggers: the highest-upkeep unit belonging to that House takes `8 True Damage` (bypassing defense) and receives `-25% Attack` for that turn. If this damage reduces the unit to `<= 0 HP`, the unit disbands due to unpaid wages (freeing its Army Cap slot and logging a clear message in `actionLog`).

### Ruling 4.2: Food Surplus Overflow on Keep Level-Up
* **The Ruling:** When a Keep's `foodProgress` meets or exceeds `foodThreshold` (`18` for Tier 1 -> Tier 2; `36` for Tier 2 repeatable drafts), excess Food carries over (`newProgress = foodProgress - foodThreshold`) rather than being truncated to `0`.
* **Tier-2 Repeat Milestone:** Because `Tier 2` is the maximum physical border size (`5x5`), filling the `36 Food` bar on a Tier-2 Stronghold keeps the Keep at Tier 2, resets `foodProgress` with overflow carryover, awards `+5 Coin` to the treasury, and queues a **1-of-3 Royal Decree Draft**.

---

## 5. Milestone Draft Queue & Simultaneous Trigger Rulings

### Ruling 5.1: Multiple Drafts Triggered on the Same Turn
* **The Ambiguity:** A player's start-of-turn harvest might level up two Keeps simultaneously while also crossing a `coinDraftMilestone` (3 drafts in one turn), or a unit might step on a *Charter Archive* Relic Ruin mid-turn.
* **The Ruling:**
  1. Replace single-boolean draft flags with an integer counter on `HouseState`: `pendingDraftCount: number` (initialized to `0`).
  2. Every Keep level-up, `coinDraftMilestone` threshold crossed, or Decree-granting Relic Ruin increments `house.pendingDraftCount += 1`.
  3. Whenever `house.pendingDraftCount > 0` during a player's turn and `pendingDraftChoices === null`, the engine rolls 3 unique unowned decrees into `pendingDraftChoices` and transitions `phase` to `'draft_modal'`.
  4. Selecting a decree decrements `pendingDraftCount -= 1`. If `pendingDraftCount > 0` remains, the modal immediately rolls the next 3-card hand before returning `phase` to `'player_command'`.

### Ruling 5.2: Exhausting the 24-Decree Pool
* **The Ruling:** If a House owns `22` or more of the `24` decrees when a draft triggers, the modal displays however many unowned decrees remain (`1` or `2` cards). If a House owns all `24` decrees (`unownedPool.length === 0`), any subsequent draft trigger automatically converts into a **Royal Treasury Windfall** (`+15 Coin` and `+10 Materials`) without opening an empty modal.

---

## 6. Tactical Combat, Movement & Sight Edge Cases

### Ruling 6.1: Ranged Retaliation & Elevation Line-of-Sight
* **The Ruling:**
  1. **No Ranged Counter-Sniping:** Ranged units (`archer`, `crossbowman`, `longbowman`) **never** deal retaliation damage when attacked in melee (`Chebyshev distance === 1`), even though their `range` is `2–3`. Only units with `range === 1` retaliate in melee.
  2. **Hill Range Bonus:** A ranged unit standing on a `hills` tile gains `+1` maximum attack range (`2 -> 3` for Archers/Crossbowmen; `3 -> 4` for Longbowmen). Hills do not allow shooting over `mountain` tiles—`mountain` tiles block ranged line-of-sight unless the attacker is also on a `hills` tile.

### Ruling 6.2: River Movement & House Aurelia's `river_tollhouse`
* **The Ruling:**
  1. Standard `river` tiles cost `2 Movement Points` to enter (ending movement for a `2-mov` infantry unit unless entering from adjacent land with full `2/2` movement) and cannot have standard improvements built on them.
  2. House Aurelia's `river_tollhouse` converts that `river` tile into a `1 Movement Point` bridge for **friendly** units (`ownerHouseId === unit.ownerId`), while remaining `2 Movement Points` for enemy units.

### Ruling 6.3: Outlaw Camp Spawning & Clearing Rules
* **The Ruling:**
  1. Outlaw Camps (`landmark === 'outlaw_camp'`) spawn only during `mapGen.ts` at least `4` tiles away from any starting House Capital. They do not respawn mid-game.
  2. Each Outlaw Camp is guarded by a neutral **Outlaw Bandit** (`18 HP`, `6 Atk`, `4 Def`, `infantry` class, stationary on the camp tile). Defeating the Bandit moves the victorious melee unit onto the camp tile (or clears it from range), sets `landmarkCleared = true`, awards `+12 Coin` (`+24 Coin` for House Corvus), and unlocks the tile for normal Keep border expansion.

---

## 7. AI Turn Execution & Anti-Softlock Safeguards

### Ruling 7.1: Guaranteed AI Turn Termination (Zero Infinite Loops)
* **The Ambiguity:** A buggy Utility AI loop evaluating "move unit back and forth" or failing to spend resources can hang `phase === 'ai_turn'` indefinitely on mobile browsers.
* **The Ruling:** Every AI House turn (`runAiTurn(state, houseId)`) must enforce four strict guardrails:
  1. **Single-Pass Unit Evaluation:** Each AI unit may execute at most **1 Move** (`hasMoved = true`) and **1 Attack** (`hasAttacked = true`) per turn. Units never re-evaluate movement after moving.
  2. **Hard Action Cap:** Cap total economy/build/recruit actions per AI House per turn at `MAX_AI_ACTIONS = 12`. Once reached—or once the highest-scoring legal action falls below `MIN_ACTION_SCORE = 5`—the AI immediately terminates its loop.
  3. **Instant AI Draft Resolution:** AI Houses never enter `'draft_modal'`. Whenever an AI House triggers a Royal Decree Draft, `utilityAi.ts` scores 3 random unowned decrees using its `aiPersonality` weights, applies the highest-scoring decree synchronously in memory, and continues.
  4. **Watchdog Timer & Auto-Save Boundary:** Wrap the async visual AI step-runner in a `try / finally` block with an `8,000ms` safety timeout. If any animation or step stalls, the `finally` block resolves remaining AI logic synchronously, advances `activeHouseId` to the next living House, commits the updated `GameState` to `IndexedDB`, and restores `phase = 'player_command'`.

### Ruling 7.2: Victory Check Priority (Simultaneous Conquest & Supremacy)
* **The Ruling:** Victory conditions are evaluated at the **end of every House's turn** (both Player and AI) in strict priority order:
  1. **Elimination Check:** Any House with `0` Keeps is marked `isEliminated = true`.
  2. **Conquest Victory:** If only `1` non-eliminated House remains (`livingHouses.length === 1`), that House immediately wins with `victoryType = 'conquest'`.
  3. **Supremacy Victory:** Otherwise, compute `keepShare = houseKeeps.length / totalSettledKeepsOnMap`. If any House holds `keepShare >= 0.65` (rounded to 2 decimal places), that House immediately wins with `victoryType = 'supremacy'`. (If two Houses somehow cross `0.65` simultaneously—mathematically impossible since `0.65 + 0.65 > 1.0`—the active turn House wins.)
