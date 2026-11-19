Spec Version: 0.3

# Artifact #3: Marchlands Edge-Case & Exploit Red-Teaming Rulings

This document establishes deterministic rulings for every high-risk interaction, exploit vector, and state-machine edge case in *Marchlands*. Every ruling maps directly to `GameState` fields (`keeps`, `units`, `tiles`, `houses`, `crown`, `phase`) so the game engine never softlocks, corrupts `IndexedDB` saves, or allows degenerate strategies.

---

## 1. Keep Capture, Territory Overlaps & Village Annexation

### Ruling 1.1: Keep Capture Mechanics (Conquest of Settlements)
* **The Ambiguity:** Can a unit walk onto an undefended Keep and capture it immediately, or do Keeps have garrison HP?
* **The Ruling:**
  1. Every Keep has Garrison HP (`keepHp` / `maxKeepHp`: `24` standard, `34` with **Garrison Seat** specialization). A Keep cannot be entered by an enemy unit while `keepHp > 0` or while a friendly unit occupies the Keep's center tile.
  2. Enemy units adjacent to a Keep (or within `range` for Ranged/Siege) may **Attack the Keep**. The Keep garrison has `Defense 5`, `Attack 4`, and uses the Keep `+0.35` `DefBonus` (`keepHp / maxKeepHp` as its HP ratio). It retaliates unless struck by a `siege` unit (`siege_ram` deals `8` base Attack and `sapper_crew` deals `6` base Attack, both taking zero retaliation).
  3. When `keepHp` reaches `0`, the Keep is **Neutralized** (`keepHp = Math.floor(maxKeepHp / 2)` — `12` for standard Keeps, `17` for Garrison Seats — restored to the attacker's House, `ownerId` transfers immediately to the attacking House, and the attacking melee unit advances onto the Keep tile if unoccupied).
  4. **Regeneration:** Any Keep that did not take damage during the previous round regenerates `+4 Keep HP` (`+6` for Garrison Seat) at the start of its owner's turn (up to `maxKeepHp`).
  5. **Tile Ownership Transfer:** Upon capture, all tiles within the Keep's current radius (`3x3` for Tier 1, `5x5` for Tier 2) transfer `ownerHouseId` to the new owner, keeping intact economic improvements (`farm`, `lumber_mill`, `iron_mine`, `smithy`, `market`, `granary`). Faction-unique improvements convert into their standard equivalent (`foresters_lodge -> lumber_mill`, `deep_smeltery -> iron_mine`, `river_tollhouse -> market`; `war_camp` and `signal_bastion` are destroyed).

### Ruling 1.2: Overlapping Keep Borders (3x3 and 5x5 Collisions)
* **The Ambiguity:** What happens when two Keeps are 4–6 tiles apart and a Tier-1 Keep upgrades to a Tier-2 Stronghold (`5x5` radius), overlapping tiles already claimed by another Keep?
* **The Ruling:** **First-Claim Lock.** Tile `keepId` assignment is sticky. When a Keep expands to `5x5`, it claims only surrounding tiles where `tile.keepId === null`. It never steals a tile already assigned to an existing friendly or enemy Keep. If a Keep is destroyed or neutralized, its `keepId` tiles remain bound to that Keep's coordinates.

### Ruling 1.3: Frontier Village Annexation & Violent Seizure Rules
* **The Ambiguity:** Can a player annex a Frontier Village while enemies are standing on or adjacent to it, which Keep pays the Food, and what happens if a village is attacked instead?
* **The Ruling (Peaceful Annexation):** Peaceful Annexation costs `15 Coin` (from house treasury) plus `12 Food` taken from the growth bar of the friendly Keep with `foodProgress >= requiredFood` that is **closest (Chebyshev distance) to the Frontier Village** (tie-break by highest `foodProgress`, then `keep.id`). If no single friendly Keep has `foodProgress >= requiredFood`, Peaceful Annexation is disabled. *Crown Envoys* reduces this to `9 Coin + 7 Food`. Owning at least one **Market Town** Keep reduces Coin cost by `20%` (additive with *Crown Envoys*; total discount capped at `50%`). All three conditions are required:
  1. At least one friendly unit is orthogonally or diagonally adjacent (`Chebyshev distance === 1`) to the `frontier_village` tile.
  2. Zero enemy units are within `Chebyshev distance <= 1` of the village (no contested annexations).
  3. The village tile itself is unoccupied (neutral villages cannot be entered while `villageHp > 0`).
  * **Effect:** Converts `landmark` to `'none'`, sets `landmarkCleared = true` and `villageHp = null`, creates a new Tier-1 `Keep` at **full `24/24 HP`** assigned the next name from the House's name pool, grants **`+1 Royal Favor`**, reveals a `3x3` fog radius, and satisfies `writ_annex`.
* **The Ruling (Neutral Garrison & Violent Seizure):**
  1. Unclaimed `frontier_village` tiles initialize `tile.villageHp = 12` (`null` otherwise or once cleared). The neutral garrison has `maxVillageHp = 12` (regenerates `+3 HP` at the start of each full round if undamaged during the previous round), `Attack 3`, `Defense 4`, and `+0.20 DefBonus` (non-stacking with terrain).
  2. It retaliates against melee (`range === 1`) attacks unless struck by `siege`, is **not** protected by One-Shot Protection, and cannot be entered while `villageHp > 0`.
  3. Reducing `villageHp` to `0` converts the village into a Tier-1 `Keep` owned by the attacker at **damaged `8/24 HP`**, deducts **`2 Royal Favor`** from the attacker (clamped at `0`), clears `landmark` (`villageHp = null`), reveals `3x3` fog, advances the attacking melee unit onto the tile if unoccupied, assigns the next House settlement name, and satisfies `writ_annex`.

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

### Ruling 2.3: Summoning Sickness, Spawn Placement & Manual Keep Re-Homing
* **Summoning Sickness & Spawn Placement:**
  1. Every newly trained unit (and any `free_company_spearman` hired via event) spawns with **summoning sickness**: `hasMoved = true` and `hasAttacked = true` on the turn it is created, and does not trigger end-of-turn stationary healing on its spawn turn.
  2. Training at a Keep requires the Keep center tile to be unoccupied by another unit.
  3. *A Free Company Rides North* (`evt_free_company`) spawns `free_company_spearman` on the House's Capital tile if unoccupied; otherwise on the nearest unoccupied passable tile inside the Capital's territory (tie-break by `tileKey`). If no tile is available, the hire option is disabled.
  4. Training a unit remains a **non-commit** (undoable) action unless it reveals fog.
* **Manual Keep Re-Homing:**
  1. Any friendly unit (except `free_company_spearman`) currently standing **on** a friendly Keep tile where `unit.homeKeepId !== keep.id` may use the **Re-home Here** action if that Keep has an open Army Cap slot (`supportedUnitIds.length < getKeepArmyCap(keep)`).
  2. Costs `0` resources and `0` actions (does not require or consume movement or attack; usable even if exhausted).
  3. **Non-commit action:** Can be undone via Undo.
  4. Automatically clears `'orphaned'` (Supply-Severed) status if the unit was orphaned.

---

## 3. Palisade Fortifications & Anti-Griefing Rules

### Ruling 3.1: Preventing "Palisade Cage" Griefing Around Enemy Capitals
* **The Ambiguity:** Without limits, a rich player could build 8 Palisades completely encircling an enemy Capital's `3x3` border, trapping enemy units forever without capturing the Keep.
* **The Ruling:**
  1. **Strict Border Ownership:** Improvements (`palisade`, `watchtower`, etc.) can **only** be built on tiles where `tile.ownerHouseId === activeHouseId` and `tile.keepId !== null`. Players can never build Palisades inside neutral wilderness or enemy borders.
  2. **Per-Keep Fortification Cap:** Each Keep may support a maximum of **2 Palisades** (Tier 1), **4 Palisades** (Tier 2), or **5 Palisades** (Tier 2 Garrison Seat) within its territory.
  3. **Destroying Enemy Palisades & Watchtowers:** Any enemy unit adjacent to a `palisade` or `watchtower` may spend its attack action to **Raze Fortification**. Unmanned `palisade` and `watchtower` structures use flat `12` Structure HP and `4` Defense with `0.00 DefBonus` (`+0.30`/`+0.45` `DefBonus` applies only to units standing on them; *Mortar & Stonework* still applies its `25%` siege damage reduction to structure damage). `siege_ram` (`8` structure Atk) destroys them in **1 hit** (`16` base, `12` with *Mortar & Stonework*); `sapper_crew` (`6` structure Atk: `11` base, `8` with *Mortar & Stonework*) and melee units destroy them in **2 hits**. Once razed, `tile.improvement` resets to `null`.
  4. **Friendly Movement:** Friendly units move through their own `palisade` tiles normally without penalty; only enemy units are blocked from entering or pathing through an intact enemy `palisade`.

---

## 4. Economy, Bankruptcy & Resource Overflow

### Ruling 4.1: Coin Bankruptcy (Negative Treasury Prevention)
* **The Ambiguity:** What happens during the Start-of-Turn Harvest & Upkeep Phase if a player's elite unit Coin upkeep exceeds their Coin income + current Coin treasury?
* **The Ruling:** `house.resources.coin` is clamped at a minimum of `0`—it never goes negative.
  1. At turn start, total Coin income is added first, then total unit Coin upkeep is subtracted.
  2. If `coin < 0`, `coin` is set to `0` and **Mutiny / Desertion** triggers: the highest-upkeep unit belonging to that House takes `8 True Damage` (bypassing defense and One-Shot Protection) and receives `-25% Attack` (`-0.25 AtkBonus`) for that turn. If this damage reduces the unit to `<= 0 HP`, the unit disbands due to unpaid wages (freeing its Army Cap slot and logging a `mutiny` ChronicleEvent).

### Ruling 4.2: Food Surplus Overflow & Tier-2 Repeat Milestone Cap
* **The Ruling:** When a Keep's `foodProgress` meets or exceeds `foodThreshold` (`18` for Tier 1 -> Tier 2; `36` for Tier 2 repeat milestones, or `28` with **Granary Seat** specialization), excess Food carries over (`newProgress = foodProgress - foodThreshold`) rather than being truncated to `0`.
* **Tier-2 Repeat Milestone Cap (`keep.repeatMilestonesClaimed`):** Because `Tier 2` is the maximum physical border size (`5x5`), each Keep tracks `repeatMilestonesClaimed: number` (starts at `0`). Filling the `36 Food` (`28` for Granary Seat) bar on a Tier-2 Stronghold keeps the Keep at Tier 2, carries over excess Food, and increments `repeatMilestonesClaimed += 1`:
  * **First repeat (`repeatMilestonesClaimed === 0`):** Awards `+5 Coin` and queues **1 Royal Decree Draft** (`pendingDraftCount += 1`).
  * **Subsequent repeats (`repeatMilestonesClaimed >= 1`):** Awards **Royal Surplus** (`+10 Coin` and `+2 Royal Favor`), with **no** Royal Decree Draft.

---

## 5. Milestone Draft Queue & Simultaneous Trigger Rulings

### Ruling 5.1: Multiple Drafts Triggered on the Same Turn
* **The Ambiguity:** A player's start-of-turn harvest might level up two Keeps simultaneously while also crossing an escalating `lifetimeCoinEarned` milestone (`nextCoinMilestone`)—or a unit might step on a *Charter Archive* Relic Ruin mid-turn.
* **The Ruling:**
  1. Replace single-boolean draft flags with an integer counter on `HouseState`: `pendingDraftCount: number` (initialized to `0`).
  2. Every Keep level-up to Tier 2, a Tier-2 Keep's **first** repeat Food bar (`repeatMilestonesClaimed === 0`), every escalating `lifetimeCoinEarned >= nextCoinMilestone` threshold crossed (`coinMilestonesClaimed += 1`, `nextCoinMilestone += 20 * (coinMilestonesClaimed + 1)`: `25 -> 65 -> 125 -> 205 -> 305...`), Decree-granting Relic Ruin, or *Petition a Charter* Crown Audience action increments `house.pendingDraftCount += 1`.
  3. Whenever `house.pendingDraftCount > 0` during a player's turn and `pendingDraftChoices === null` (and `pendingSpecializationKeepIds.length === 0`), the engine draws a 3-card hand using the **Draft Category Guarantee** (1 Infrastructure Blueprint, 1 Military Charter, 1 Kingdom Doctrine from unowned **eligible** decrees — filtering out any decree whose `excludedHouseIds` contains that House; fallback priority **Doctrine → Infrastructure → Military**, no duplicates in one hand) into `pendingDraftChoices` and transitions `phase` to `'draft_modal'`. **Royal Reroll** (`3` Favor) follows the same rule and may offer cards from the previous hand again.
  4. Selecting a decree decrements `pendingDraftCount -= 1`. If `pendingDraftCount > 0` remains, the modal immediately rolls the next 3-card hand before returning `phase` to `'player_command'`.

### Ruling 5.2: Exhausting the Eligible Decree Pool (25 Total)
* **The Ruling:** The full pool contains `25` Royal Decrees (`decree_fletchers_guild` is excluded for House Vane; `decree_chivalric_order` is excluded for House Aurelia -> `24` eligible decrees for Vane & Aurelia, `25` for Ironhelm, Corvus & Solis). If fewer than `3` unowned eligible decrees remain across all categories when a draft triggers, the modal displays however many unowned eligible decrees remain (`1` or `2` cards). If a House owns all of its eligible decrees (`unownedEligiblePool.length === 0`), any subsequent draft trigger automatically converts into a **Royal Treasury Windfall** (`+15 Coin` and `+10 Materials`) without opening an empty modal.

---

## 6. Tactical Combat, Movement, Undo & Sight Edge Cases

### Ruling 6.1: Ranged Retaliation, Spearman "Brace" & Elevation Line-of-Sight
* **The Ruling:**
  1. **No Ranged Counter-Sniping:** Ranged units (`archer`, `crossbowman`, `longbowman`) **never** deal retaliation damage when attacked in melee (`Chebyshev distance === 1`), even though their `range` is `2–3`. Only units with `range === 1` retaliate in melee.
  2. **Spearman "Brace" Retaliation Against Cavalry:** When a `spearman` unit (`spearman`, `oathsworn_halberdier`, `vanguard_spearman`, `free_company_spearman`) survives (`hpAfter > 0`) and retaliates against a melee `cavalry` attack (`range === 1`, attacker class `cavalry`), it calculates its retaliation `EffAtk` using its **pre-hit HP ratio** (`hpBefore / maxHp`) instead of `hpAfter / maxHp`. Wounded Spearmen brace at their pre-hit HP (not `maxHp`). All other melee retaliations still use `hpAfter / maxHp`.
  3. **Hill Range Bonus:** A ranged unit standing on a `hills` tile gains `+1` maximum attack range (`2 -> 3` for Archers/Crossbowmen; `3 -> 4` for Longbowmen). Hills do not allow shooting over `mountain` tiles—`mountain` tiles block ranged line-of-sight unless the attacker is also on a `hills` tile.

### Ruling 6.2: Movement Costs, ZoC, Action Order & Pillage
* **The Ruling:**
  1. **Movement Costs:** Plains `1`, Hills `2`, Forest `2` (`cavalry` cannot enter; `dusk_outrider` enters for `1`), River `2` (Aurelia's `river_tollhouse` makes it `1` for friendly units; Spring `3`, Winter `1`), Mountain impassable. **Minimum-move rule:** a unit that has not moved this turn can always enter one adjacent passable tile even if the cost exceeds its movement.
  2. **Action Order:** Move then Attack, Attack only, or Move only. No movement after attacking (except `dusk_outrider` "disengage"). "Attack" includes attacking a unit, Keep, or Neutral Frontier Village, **Raze Fortification**, and **Pillage**.
  3. **Zone of Control (ZoC):** Entering a tile adjacent to an enemy unit or enemy Keep ends movement immediately (`dusk_outrider` ignores ZoC). Starting a turn inside ZoC does not prevent moving away.
  4. **Flanking & Melee Advance:** Attackers gain `+0.15 AtkBonus` if the defender is adjacent to another unit of the attacker's House (non-stacking; `vanguard_spearman` is immune; does not apply to Keeps/structures). Killing a unit does not advance the attacker onto its tile (exceptions: Keep capture, violent Frontier Village seizure, and clearing an Outlaw Camp).
  5. **Pillage:** A unit standing on an enemy-owned tile with an economic improvement may spend its attack action to Pillage (`tile.improvement = null`, tile stays enemy-owned), gaining `Math.floor(improvementMatCost * 0.5)` Materials + `3` Coin (**House Corvus doubles both**), and logging a `pillage` ChronicleEvent. Keeps, Palisades, and Watchtowers cannot be pillaged.

### Ruling 6.3: Outlaw Camp Spawning & Clearing Rules
* **The Ruling:**
  1. Outlaw Camps (`landmark === 'outlaw_camp'`) spawn during `mapGen` at least `4` tiles away from any starting House Capital. They do not respawn mid-game **except** through the *Outlaw Resurgence* Frontier Event (which spawns `1` camp with a Bandit on an empty, unowned, passable tile `≥ 4` tiles from any Keep).
  2. Each Outlaw Camp is guarded by a neutral **Outlaw Bandit** (`18 HP`, `6 Atk`, `4 Def`, `infantry` class, stationary on the camp tile). Defeating the Bandit moves the victorious melee unit onto the camp tile (or clears it from range), sets `landmarkCleared = true`, awards `+12 Coin` (`+24 Coin` for House Corvus), and unlocks the tile for normal Keep border expansion.

### Ruling 6.4: Undo & Commit Points
* **The Ruling:** Player actions during the current turn (moves, constructing improvements, training units, manual Keep Re-homing, and Crown Grant) may be undone from an ephemeral stack of up to `20` `GameState` snapshots held in React memory (never persisted to `GameState` or `IndexedDB`), as long as no **Commit Point** was created.
* `isCommitPoint(prevState, nextState, action, viewerHouseId): boolean` returns `true` (clearing the undo stack and preventing undo of that action) if:
  1. The player's revealed-tile set grows, **or** a new enemy unit, enemy improvement, or landmark becomes visible.
  2. Any attack, Keep attack, Village attack, Raze, or Pillage occurs.
  3. A unit enters a Relic Ruin, Ancient Watchtower, or Outlaw Camp tile.
  4. An annexation occurs.
  5. Any draft, specialization, event-choice, or Writ-tithe resolution occurs.
  6. Any PRNG value is consumed (`nextState.rngCounter !== prevState.rngCounter`).
  7. End Turn occurs.
* Undoing restores the snapshot and immediately autosaves it. Reloading the app empties the undo stack. AI Houses never use undo.

### Ruling 6.5: One-Shot Protection (Steadfast)
* **The Ruling:** If a unit is at **full HP** (`hp === maxHp`) when hit, the hit cannot reduce it below `1 HP` unless the attacker is a **melee unit (`range === 1`) with counter advantage (`CounterMult > 1.0`)** in that attack. Ranged units (`range >= 2`) can **never** one-shot a full-HP unit, even with counter advantage (`1.40`) or *Bodkin Quivers* (`1.65`).
* Applies to primary strikes **and** retaliation. Does not apply to Keeps, structures, Neutral Villages, Outlaw Bandits, true damage (Mutiny, *Grumbling in the Ranks*), or Winter attrition.

### Ruling 6.6: Ancient Watchtowers (Per-House Reveal & Ongoing Occupation)
* **The Ruling:**
  1. Moving onto an `ancient_watchtower` permanently clears a `7x7` fog radius for the visiting House. Each House triggers its own `7x7` reveal on its first visit (tracked per-House via `revealedByHouseIds` rather than blocking future Houses with `landmarkCleared`).
  2. Only the **first House** overall to reach a given Ancient Watchtower earns the `+10` Chronicle Landmark score (tracked via `firstVisitedByHouseId` on the tile/landmark).
  3. A unit standing on an `ancient_watchtower` receives `+0.30 DefBonus` (non-stacking with terrain).
  4. During the **Harvest & Upkeep Phase**, each `ancient_watchtower` occupied by a friendly unit grants its owner **`+2 Coin`** every turn (counts toward `lifetimeCoinEarned`), plus **`+1 Royal Favor` on even turns** (`turnNumber % 2 === 0`; counts toward `stats.lifetimeFavor`).

---

## 7. AI Turn Execution & Anti-Softlock Safeguards

### Ruling 7.1: Guaranteed AI Turn Termination (Two-Layer AI Guardrails)
* **The Ruling:** Every AI House turn (`runAiTurn(state, houseId)`) executes in order **`strategic -> tactical -> economy -> end turn`** (using the 4-class `TileThreat` map, lightweight `TacticalSimState` beam search with candidate pruning, and `3`-turn / engage-if-attacked Muster timeout) and enforces five strict guardrails (see `docs/AI_ARCHITECTURE.md`):
  1. **Single Plan Entry per Unit:** Each unit commits to at most one move and one attack per turn. The tactical plan is computed jointly via beam search on `TacticalSimState`, then replayed canonically through engine reducers.
  2. **Hard Economy Action Cap:** Post-combat economy actions (unit training, building construction, annexations, Crown Audience) share `MAX_AI_ACTIONS = 12` per House turn, or stop when the best action scores below `MIN_ACTION_SCORE = 5` (on a `0–100` utility scale). Opportunistic manual Keep re-homing does not consume `MAX_AI_ACTIONS`.
  3. **Tactical Search Budget:** Tactical beam search is capped at `2,000` simulated combat resolutions per House turn. When exhausted, the best plan found so far is executed.
  4. **Synchronous AI Decisions:** AI drafts, Keep specializations, Frontier Event choices, and Crown Audience actions resolve synchronously in memory and never open a modal.
  5. **Web Worker & `8,000ms` Watchdog:** In the browser, `runAiTurn` executes inside a Web Worker with an `8,000ms` watchdog timer. If it fires, the main thread discards the worker's partial result, ends that House's turn with **no AI actions**, logs a ChronicleEvent, commits the autosave to `IndexedDB`, and advances to the next living House. In the simulation harness, any watchdog trip counts as an invariant failure.

### Ruling 7.2: Victory Check Priority (Dominion & Chronicle)
* **The Ruling:** Victory conditions are evaluated at the **end of every House's turn** (both Player and AI) in strict priority order:
  1. **Elimination Check:** Any House with `0` Keeps is marked `isEliminated = true`. If the human player's House is eliminated, the game ends immediately with the Defeat screen, regardless of mode.
  2. **Conquest Victory (`victoryType = 'conquest'`):** If only `1` non-eliminated House remains (`livingHouses.length === 1`), that House immediately wins (in both Dominion and Chronicle modes; in Chronicle, the winner ranks 1st).
  3. **Regent's Mandate (`victoryType = 'mandate'`, Dominion only):** Checked for the active Claimant at the end of its 3rd turn after claiming (`≥ 30` Favor and `≥ 4` Keeps).
  4. **Supremacy Victory (`victoryType = 'supremacy'`, Dominion only):** Compute `keepShare = houseKeeps.length / totalOwnedKeeps` (neutral Frontier Villages are not counted). If any House holds `keepShare >= 0.65` **and** owns `≥ 5` Keeps, that House immediately wins.
  5. **Chronicle Score (`victoryType = 'score'`, Chronicle only):** Runs **only** after the final House finishes **Turn 33** (end of Year 3 Autumn; Turn 33 Writ publication is suppressed in Chronicle mode). Highest score wins (tiebreakers: more Keeps → higher `lifetimeCoinEarned` → House turn order).

---

## 8. Map Generation Guarantees (`mapGen(seed, houseCount)`)
* **The Ruling:** `mapGen(seed, houseCount)` is strictly deterministic via `Mulberry32` and enforces:
  1. **Terrain Mix (±3%):** Plains 40%, Forest 22%, Hills 14%, River 10% (1–2 connected edge-to-edge paths), Mountain 8%, remainder Plains.
  2. **Capitals:** `≥ 7` tiles apart (Chebyshev) and `≥ 3` tiles from the map edge.
  3. **Faction Terrain Guarantees (inside capital's `5x5`):** Vane `≥ 3` Forest; Ironhelm `≥ 1` Mountain and `≥ 1` Iron Deposit (Ironhelm's `deep_smeltery` also satisfies `smithy`'s `iron_mine` adjacency); Aurelia `≥ 1` River inside the `3x3`; Corvus `≥ 1` Outlaw Camp within `6` tiles; Solis `≥ 2` Hills; **Every House** `≥ 1` river-adjacent Plains tile and `≥ 1` Plains tile adjacent to `2` Forests inside the `3x3`.
  4. **Capital Smithy Geometry Guarantee:** Inside every Capital's `5x5` territory, the guaranteed Iron Deposit tile must be adjacent (8-directional Chebyshev) to at least one `plains` or `hills` tile (valid `smithy` slot, excluding the Capital tile) that is itself adjacent to at least one *other* `plains` or `hills` tile (valid `lumber_mill` slot, excluding the Capital tile), with all three tiles inside that Capital's `5x5` area.
  5. **Frontier Villages:** `2 × houseCount + 2` total; `≥ 4` tiles from any capital, `≥ 3` tiles from each other, and each House has `≥ 2` villages closer to its capital than to any other capital.
  6. **Landmarks & Iron Deposits:** `4` Ancient Watchtowers (on Hills), `8` Relic Ruins (drawn from `12` without replacement), `houseCount + 1` Outlaw Camps, `1` Iron Deposit per capital `5x5` plus `4–6` elsewhere (at least half adjacent to an Outlaw Camp).
  7. **Fairness Retry:** Retry with `seed + attempt` up to `50` attempts. After `50`, relax in order: (1) terrain mix tolerance, (2) Corvus camp distance, (3) non-Aurelia Smithy geometry. **Never** relax the Frontier Village guarantee or Aurelia's Smithy geometry.
