Spec Version: 0.2

# Artifact #3: Marchlands Edge-Case & Exploit Red-Teaming Rulings

This document establishes deterministic rulings for every high-risk interaction, exploit vector, and state-machine edge case in *Marchlands*. Every ruling maps directly to `GameState` fields (`keeps`, `units`, `tiles`, `houses`, `crown`, `phase`) so the game engine never softlocks, corrupts `IndexedDB` saves, or allows degenerate strategies.

---

## 1. Keep Capture, Territory Overlaps & Village Annexation

### Ruling 1.1: Keep Capture Mechanics (Conquest of Settlements)
* **The Ambiguity:** Can a unit walk onto an undefended Keep and capture it immediately, or do Keeps have garrison HP?
* **The Ruling:**
  1. Every Keep has Garrison HP (`keepHp` / `maxKeepHp`: `20` standard, `30` with **Garrison Seat** specialization). A Keep cannot be entered by an enemy unit while `keepHp > 0` or while a friendly unit occupies the Keep's center tile.
  2. Enemy units adjacent to a Keep (or within `range` for Ranged/Siege) may **Attack the Keep**. The Keep garrison has `Defense 5`, `Attack 4`, and uses the Keep `+0.35` `DefBonus` (`keepHp / maxKeepHp` as its HP ratio). It retaliates unless struck by a `siege` unit (`siege_ram` deals `10` base Attack and `sapper_crew` deals `6` base Attack, both taking zero retaliation).
  3. When `keepHp` reaches `0`, the Keep is **Neutralized** (`keepHp = 10` restored to the attacker's House, `ownerId` transfers immediately to the attacking House, and the attacking melee unit advances onto the Keep tile if unoccupied).
  4. **Regeneration:** Any Keep that did not take damage during the previous round regenerates `+4 Keep HP` (`+6` for Garrison Seat) at the start of its owner's turn (up to `maxKeepHp`).
  5. **Tile Ownership Transfer:** Upon capture, all tiles within the Keep's current radius (`3x3` for Tier 1, `5x5` for Tier 2) transfer `ownerHouseId` to the new owner, keeping intact economic improvements (`farm`, `lumber_mill`, `iron_mine`, `smithy`, `market`, `granary`). Faction-unique improvements convert into their standard equivalent (`foresters_lodge -> lumber_mill`, `deep_smeltery -> iron_mine`, `river_tollhouse -> market`; `war_camp` and `signal_bastion` are destroyed).

### Ruling 1.2: Overlapping Keep Borders (3x3 and 5x5 Collisions)
* **The Ambiguity:** What happens when two Keeps are 4–6 tiles apart and a Tier-1 Keep upgrades to a Tier-2 Stronghold (`5x5` radius), overlapping tiles already claimed by another Keep?
* **The Ruling:** **First-Claim Lock.** Tile `keepId` assignment is sticky. When a Keep expands to `5x5`, it claims only surrounding tiles where `tile.keepId === null`. It never steals a tile already assigned to an existing friendly or enemy Keep. If a Keep is destroyed or neutralized, its `keepId` tiles remain bound to that Keep's coordinates.

### Ruling 1.3: Peaceful Frontier Village Annexation Rules
* **The Ambiguity:** Can a player annex a Frontier Village while enemies are standing on or adjacent to it?
* **The Ruling:** Peaceful Annexation costs `15 Coin` (from house treasury) plus `12 Food` taken from the growth bar of the annexing unit's `homeKeepId` (if that Keep's growth bar has `< 12` Food, annexation is not allowed). *Crown Envoys* reduces this to `9 Coin + 7 Food`. Owning at least one **Market Town** Keep reduces Coin cost by `20%` (additive with *Crown Envoys*; total discount capped at `50%`). All three conditions are required:
  1. At least one friendly unit is orthogonally or diagonally adjacent (`Chebyshev distance === 1`) to the `frontier_village` tile.
  2. Zero enemy units are within `Chebyshev distance <= 1` of the village (no contested annexations).
  3. The village tile itself is unoccupied (or occupied by the annexing friendly unit).
  * **Effect:** Converts `landmark` to `'none'`, sets `landmarkCleared = true`, creates a new Tier-1 `Keep` assigned the next name from the House's name pool, and reveals a `3x3` fog radius.

### Ruling 1.4: Tier-2 Keep Specialization
* **The Ruling:**
  1. **Queue:** A Keep that levels up to Tier 2 is added to `house.pendingSpecializationKeepIds`. Each pending specialization resolves (in phase `'specialization_modal'`) **before** any pending Royal Decree Draft.
  2. **Capture:** A captured Keep **keeps its specialization**. If its new owner is over the Garrison army cap afterwards, Ruling 2.2's over-cap rule applies.
  3. **Corvus War Camp Stacking:** A War Camp's `+1` Army Cap adds to **Garrison Seat** (a Garrison Seat with a War Camp supports `6` units).
  4. **AI Selection:** AI Houses choose specializations synchronously via personality weights (Ironhelm → Garrison Seat; Aurelia → Market Town; Vane & Solis → scored by threat level and economy; Corvus → Garrison Seat in frontier Keeps, Market Town otherwise).

---

## 2. Orphaned Units & Army Cap Enforcement

### Ruling 2.1: What Happens to Units When Their `homeKeepId` Keep is Captured?
* **The Ambiguity:** If House Ironhelm loses a Keep that was supporting 3 active units (`supportedUnitIds.length === 3`), do those units vanish, freeze, or stay on the board?
* **The Ruling:** **Automatic Reassignment First, Supply-Severed Debuff Second.**
  1. **Step A (Re-homing):** Immediately upon Keep loss, the engine checks all remaining Keeps owned by the defending House that have open Army Cap slots (`supportedUnitIds.length < getKeepArmyCap(keep)`). Orphaned units are automatically reassigned (`unit.homeKeepId = newKeep.id`) in order of highest unit `Material Cost` first.
  2. **Step B (Orphaned / Supply-Severed State):** Any remaining units that exceed the House's total remaining Army Cap are **not** deleted mid-combat. Instead, their `homeKeepId` is set to `'orphaned'`, applying the **Supply-Severed** status:
     * `-25% Attack` (`-0.25 AtkBonus`) and `-25% Defense` (`-0.25 DefBonus`)
     * Cannot heal at end of turn
     * Still requires normal `Coin` upkeep
     * Automatically re-homes into the next Keep that frees up an Army Cap slot (either via unit death or Keep capture/upgrade).
     * *Exception:* `free_company_spearman` (from *A Free Company Rides North*) does not count toward Army Cap, cannot be re-homed, and disbands immediately if orphaned.
  3. **Step C (Total House Elimination):** If a House loses its **last** Keep (`remainingKeeps.length === 0`), `house.isEliminated = true` triggers immediately, and all remaining units belonging to that House are removed from the board.

### Ruling 2.2: House Corvus's `war_camp` Limits & Destruction
* **The Ruling:**
  1. `war_camp` costs `14` Materials.
  2. **At most 1 War Camp per Keep** (its `+1` Army Cap never stacks within one territory).
  3. **At most 2 War Camps per House** at any time. A destroyed or pillaged War Camp frees a slot.
  4. If a `war_camp` is pillaged or captured while its parent Keep supports `4/4` (Tier 1) or `5/5` (Tier 2) units, existing units remain assigned to that Keep (`4/3` over-cap) without penalty, but the Keep cannot train new units until its count drops below its new cap.

---

## 3. Palisade Fortifications & Anti-Griefing Rules

### Ruling 3.1: Preventing "Palisade Cage" Griefing Around Enemy Capitals
* **The Ambiguity:** Without limits, a rich player could build 8 Palisades completely encircling an enemy Capital's `3x3` border, trapping enemy units forever without capturing the Keep.
* **The Ruling:**
  1. **Strict Border Ownership:** Improvements (`palisade`, `watchtower`, etc.) can **only** be built on tiles where `tile.ownerHouseId === activeHouseId` and `tile.keepId !== null`. Players can never build Palisades inside neutral wilderness or enemy borders.
  2. **Per-Keep Fortification Cap:** Each Keep may support a maximum of **2 Palisades** (Tier 1), **4 Palisades** (Tier 2), or **5 Palisades** (Tier 2 Garrison Seat) within its territory.
  3. **Destroying Enemy Palisades & Watchtowers:** Any enemy unit adjacent to a `palisade` or `watchtower` may spend its attack action to **Raze Fortification** (Palisades have `12` Structure HP and `4` Defense; `siege_ram` destroys them in **1 hit**; `sapper_crew` and melee units destroy them in **2 hits**). Once razed, `tile.improvement` resets to `null`.
  4. **Friendly Movement:** Friendly units move through their own `palisade` tiles normally without penalty; only enemy units are blocked from entering or pathing through an intact enemy `palisade`.

---

## 4. Economy, Bankruptcy & Resource Overflow

### Ruling 4.1: Coin Bankruptcy (Negative Treasury Prevention)
* **The Ambiguity:** What happens during the Start-of-Turn Harvest & Upkeep Phase if a player's elite unit Coin upkeep exceeds their Coin income + current Coin treasury?
* **The Ruling:** `house.resources.coin` is clamped at a minimum of `0`—it never goes negative.
  1. At turn start, total Coin income is added first, then total unit Coin upkeep is subtracted.
  2. If `coin < 0`, `coin` is set to `0` and **Mutiny / Desertion** triggers: the highest-upkeep unit belonging to that House takes `8 True Damage` (bypassing defense and One-Shot Protection) and receives `-25% Attack` (`-0.25 AtkBonus`) for that turn. If this damage reduces the unit to `<= 0 HP`, the unit disbands due to unpaid wages (freeing its Army Cap slot and logging a `mutiny` ChronicleEvent).

### Ruling 4.2: Food Surplus Overflow on Keep Level-Up
* **The Ruling:** When a Keep's `foodProgress` meets or exceeds `foodThreshold` (`18` for Tier 1 -> Tier 2; `36` for Tier 2 repeatable drafts, or `28` with **Granary Seat** specialization), excess Food carries over (`newProgress = foodProgress - foodThreshold`) rather than being truncated to `0`.
* **Tier-2 Repeat Milestone:** Because `Tier 2` is the maximum physical border size (`5x5`), filling the `36 Food` (`28` for Granary Seat) bar on a Tier-2 Stronghold keeps the Keep at Tier 2, resets `foodProgress` with overflow carryover, awards `+5 Coin` to the treasury, and queues a **1-of-3 Royal Decree Draft**.

---

## 5. Milestone Draft Queue & Simultaneous Trigger Rulings

### Ruling 5.1: Multiple Drafts Triggered on the Same Turn
* **The Ambiguity:** A player's start-of-turn harvest might level up two Keeps simultaneously while also crossing a `lifetimeCoinEarned` milestone (`nextCoinMilestone`)—or a unit might step on a *Charter Archive* Relic Ruin mid-turn.
* **The Ruling:**
  1. Replace single-boolean draft flags with an integer counter on `HouseState`: `pendingDraftCount: number` (initialized to `0`).
  2. Every Keep level-up, `lifetimeCoinEarned >= nextCoinMilestone` threshold crossed, Decree-granting Relic Ruin, or *Petition a Charter* Crown Audience action increments `house.pendingDraftCount += 1`.
  3. Whenever `house.pendingDraftCount > 0` during a player's turn and `pendingDraftChoices === null` (and `pendingSpecializationKeepIds.length === 0`), the engine draws a 3-card hand using the **Draft Category Guarantee** (1 Infrastructure Blueprint, 1 Military Charter, 1 Kingdom Doctrine from unowned decrees; fallback priority **Doctrine → Infrastructure → Military**, no duplicates in one hand) into `pendingDraftChoices` and transitions `phase` to `'draft_modal'`. **Royal Reroll** (`3` Favor) follows the same rule and may offer cards from the previous hand again.
  4. Selecting a decree decrements `pendingDraftCount -= 1`. If `pendingDraftCount > 0` remains, the modal immediately rolls the next 3-card hand before returning `phase` to `'player_command'`.

### Ruling 5.2: Exhausting the 24-Decree Pool
* **The Ruling:** If fewer than `3` unowned decrees remain across all categories when a draft triggers, the modal displays however many unowned decrees remain (`1` or `2` cards). If a House owns all `24` decrees (`unownedPool.length === 0`), any subsequent draft trigger automatically converts into a **Royal Treasury Windfall** (`+15 Coin` and `+10 Materials`) without opening an empty modal.

---

## 6. Tactical Combat, Movement, Undo & Sight Edge Cases

### Ruling 6.1: Ranged Retaliation & Elevation Line-of-Sight
* **The Ruling:**
  1. **No Ranged Counter-Sniping:** Ranged units (`archer`, `crossbowman`, `longbowman`) **never** deal retaliation damage when attacked in melee (`Chebyshev distance === 1`), even though their `range` is `2–3`. Only units with `range === 1` retaliate in melee.
  2. **Hill Range Bonus:** A ranged unit standing on a `hills` tile gains `+1` maximum attack range (`2 -> 3` for Archers/Crossbowmen; `3 -> 4` for Longbowmen). Hills do not allow shooting over `mountain` tiles—`mountain` tiles block ranged line-of-sight unless the attacker is also on a `hills` tile.

### Ruling 6.2: Movement Costs, ZoC, Action Order & Pillage
* **The Ruling:**
  1. **Movement Costs:** Plains `1`, Hills `2`, Forest `2` (`cavalry` cannot enter; `dusk_outrider` enters for `1`), River `2` (Aurelia's `river_tollhouse` makes it `1` for friendly units; Spring `3`, Winter `1`), Mountain impassable. **Minimum-move rule:** a unit that has not moved this turn can always enter one adjacent passable tile even if the cost exceeds its movement.
  2. **Action Order:** Move then Attack, Attack only, or Move only. No movement after attacking (except `dusk_outrider` "disengage"). "Attack" includes attacking a unit or Keep, **Raze Fortification**, and **Pillage**.
  3. **Zone of Control (ZoC):** Entering a tile adjacent to an enemy unit or enemy Keep ends movement immediately (`dusk_outrider` ignores ZoC). Starting a turn inside ZoC does not prevent moving away.
  4. **Flanking & Melee Advance:** Attackers gain `+0.15 AtkBonus` if the defender is adjacent to another unit of the attacker's House (non-stacking; `vanguard_spearman` is immune; does not apply to Keeps/structures). Killing a unit does not advance the attacker onto its tile (exceptions: Keep capture and clearing an Outlaw Camp).
  5. **Pillage:** A unit standing on an enemy-owned tile with an economic improvement may spend its attack action to Pillage (`tile.improvement = null`, tile stays enemy-owned), gaining `Math.floor(improvementMatCost * 0.5)` Materials + `3` Coin (**House Corvus doubles both**), and logging a `pillage` ChronicleEvent. Keeps, Palisades, and Watchtowers cannot be pillaged.

### Ruling 6.3: Outlaw Camp Spawning & Clearing Rules
* **The Ruling:**
  1. Outlaw Camps (`landmark === 'outlaw_camp'`) spawn during `mapGen` at least `4` tiles away from any starting House Capital. They do not respawn mid-game **except** through the *Outlaw Resurgence* Frontier Event (which spawns `1` camp with a Bandit on an empty, unowned, passable tile `≥ 4` tiles from any Keep).
  2. Each Outlaw Camp is guarded by a neutral **Outlaw Bandit** (`18 HP`, `6 Atk`, `4 Def`, `infantry` class, stationary on the camp tile). Defeating the Bandit moves the victorious melee unit onto the camp tile (or clears it from range), sets `landmarkCleared = true`, awards `+12 Coin` (`+24 Coin` for House Corvus), and unlocks the tile for normal Keep border expansion.

### Ruling 6.4: Undo & Commit Points
* **The Ruling:** Player actions during the current turn (moves, constructing improvements, training units, and Crown Grant) may be undone from an ephemeral stack of up to `20` `GameState` snapshots held in React memory (never persisted to `GameState` or `IndexedDB`), as long as no **Commit Point** was created.
* `isCommitPoint(prevState, nextState, action, viewerHouseId): boolean` returns `true` (clearing the undo stack and preventing undo of that action) if:
  1. The player's revealed-tile set grows, **or** a new enemy unit, enemy improvement, or landmark becomes visible.
  2. Any attack, Keep attack, Raze, or Pillage occurs.
  3. A unit enters a Relic Ruin, Ancient Watchtower, or Outlaw Camp tile.
  4. An annexation occurs.
  5. Any draft, specialization, event-choice, or Writ-tithe resolution occurs.
  6. Any PRNG value is consumed (`nextState.rngCounter !== prevState.rngCounter`).
  7. End Turn occurs.
* Undoing restores the snapshot and immediately autosaves it. Reloading the app empties the undo stack. AI Houses never use undo.

### Ruling 6.5: One-Shot Protection (Steadfast)
* **The Ruling:** If a unit is at **full HP** (`hp === maxHp`) when hit, the hit cannot reduce it below `1 HP` unless the attacker has the counter advantage (`CounterMult === 1.40`) in that attack.
* Applies to primary strikes **and** retaliation. Does not apply to Keeps, structures, Outlaw Bandits, true damage (Mutiny, *Grumbling in the Ranks*), or Winter attrition.

---

## 7. AI Turn Execution & Anti-Softlock Safeguards

### Ruling 7.1: Guaranteed AI Turn Termination (Two-Layer AI Guardrails)
* **The Ruling:** Every AI House turn (`runAiTurn(state, houseId)`) must enforce five strict guardrails (see `docs/AI_ARCHITECTURE.md`):
  1. **Single Plan Entry per Unit:** Each unit commits to at most one move and one attack per turn. The tactical plan is computed jointly via beam search, and each unit acts once.
  2. **Hard Economy Action Cap:** Economy actions are capped at `MAX_AI_ACTIONS = 12` per House turn, or stop when the best action scores below `MIN_ACTION_SCORE = 5` (on a `0–100` utility scale).
  3. **Tactical Search Budget:** Tactical beam search is capped at `2,000` simulated combat resolutions per House turn. When exhausted, the best plan found so far is executed.
  4. **Synchronous AI Decisions:** AI drafts, Keep specializations, Frontier Event choices, and Crown Audience actions resolve synchronously in memory and never open a modal.
  5. **Web Worker & `8,000ms` Watchdog:** In the browser, `runAiTurn` executes inside a Web Worker with an `8,000ms` watchdog timer. If it fires, the main thread discards the worker's partial result, ends that House's turn with **no AI actions**, logs a ChronicleEvent, commits the autosave to `IndexedDB`, and advances to the next living House. In the simulation harness, any watchdog trip counts as an invariant failure.

### Ruling 7.2: Victory Check Priority (Dominion & Chronicle)
* **The Ruling:** Victory conditions are evaluated at the **end of every House's turn** (both Player and AI) in strict priority order:
  1. **Elimination Check:** Any House with `0` Keeps is marked `isEliminated = true`. If the human player's House is eliminated, the game ends immediately with the Defeat screen, regardless of mode.
  2. **Conquest Victory (`victoryType = 'conquest'`):** If only `1` non-eliminated House remains (`livingHouses.length === 1`), that House immediately wins (in both Dominion and Chronicle modes; in Chronicle, the winner ranks 1st).
  3. **Regent's Mandate (`victoryType = 'mandate'`, Dominion only):** Checked for the active Claimant at the end of its 3rd turn after claiming (`≥ 30` Favor and `≥ 4` Keeps).
  4. **Supremacy Victory (`victoryType = 'supremacy'`, Dominion only):** Compute `keepShare = houseKeeps.length / totalOwnedKeeps` (neutral Frontier Villages are not counted). If any House holds `keepShare >= 0.65` **and** owns `≥ 5` Keeps, that House immediately wins.
  5. **Chronicle Score (`victoryType = 'score'`, Chronicle only):** Runs **only** after the final House finishes **Turn 36**. Highest score wins (tiebreakers: more Keeps → higher `lifetimeCoinEarned` → House turn order).

---

## 8. Map Generation Guarantees (`mapGen(seed, houseCount)`)
* **The Ruling:** `mapGen(seed, houseCount)` is strictly deterministic via `Mulberry32` and enforces:
  1. **Terrain Mix (±3%):** Plains 40%, Forest 22%, Hills 14%, River 10% (1–2 connected edge-to-edge paths), Mountain 8%, remainder Plains.
  2. **Capitals:** `≥ 7` tiles apart (Chebyshev) and `≥ 3` tiles from the map edge.
  3. **Faction Terrain Guarantees (inside capital's `5x5`):** Vane `≥ 3` Forest; Ironhelm `≥ 1` Mountain and `≥ 1` Iron Deposit; Aurelia `≥ 1` River inside the `3x3`; Corvus `≥ 1` Outlaw Camp within `6` tiles; Solis `≥ 2` Hills; **Every House** `≥ 1` river-adjacent Plains tile and `≥ 1` Plains tile adjacent to `2` Forests inside the `3x3`.
  4. **Frontier Villages:** `2 × houseCount + 2` total; `≥ 4` tiles from any capital, `≥ 3` tiles from each other, and each House has `≥ 2` villages closer to its capital than to any other capital.
  5. **Landmarks & Iron Deposits:** `4` Ancient Watchtowers (on Hills), `8` Relic Ruins (drawn from `12` without replacement), `houseCount + 1` Outlaw Camps, `1` Iron Deposit per capital `5x5` plus `4–6` elsewhere (at least half adjacent to an Outlaw Camp).
  6. **Fairness Retry:** Retry with `seed + attempt` up to `50` attempts. After `50`, relax in order: terrain mix tolerance, then Corvus camp distance. **Never** relax the village guarantee.
