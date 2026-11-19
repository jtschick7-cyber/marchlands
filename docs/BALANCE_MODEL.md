Spec Version: 0.3

# Artifact #1: Marchlands Mathematical Balance & Hits-to-Kill (HTK) Model

This document defines the exact deterministic combat formulas, movement and action rules, unit stat blocks, spatial economy yields, Turn 1–10 pacing curves, and scoring formulas for *Marchlands*. All numeric values are initial tuning values and belong in `src/data/` as named constants (never inline).

---

## 1. Deterministic Combat Engine Math

Combat uses a ratio-based deterministic formula scaled by current HP percentage (`hp / maxHp`). No random damage rolls occur.

### Damage Equations & Modifier Stacking
All percentage modifiers are **additive within one bucket**. The Counter-Triangle multiplier applies **multiplicatively** afterwards.

* **Counter-Triangle Multiplier (`CounterMult` / `TargetCounterMult`):**
  * `CounterMult = 1.40` (+40%) when the **attacker** has the advantaged matchup; otherwise `1.00`.
  * `TargetCounterMult = 1.40` (+40%) when the **defender** has the advantaged matchup; otherwise `1.00`.
  * `spearman` counters `cavalry`
  * `cavalry` counters `ranged` and `siege`
  * `ranged` and `infantry` counter `spearman`
* **Additive Bonus Buckets (clamped to `[−0.50, +1.50]`):**
  * `AtkBonusSum` = sum of all attack % modifiers (e.g., *Veteran Drill* `+0.15`, Longbowman terrain `+0.25`, *Signal Bastion* `+0.15`, Flanking `+0.15`, Supply-Severed `−0.25`, Mutiny `−0.25`, etc.).
  * `DefBonusSum` = sum of all defense % modifiers (terrain/fortification, *Shield Wall* `+0.20`, Oathsworn `+0.40`, Garrison specialization `+0.10`, Supply-Severed `−0.25`, etc.).
* **Effective Attack (`EffAtk`):**
  `EffAtk = Unit.attack × (Unit.hp / Unit.maxHp) × (1 + AtkBonusSum) × CounterMult`
* **Effective Defense (`EffDef`):**
  `EffDef = Target.defense × (Target.hp / Target.maxHp) × (1 + DefBonusSum) × TargetCounterMult`
* **Primary Strike Damage:**
  `Damage = Math.max(1, Math.round((EffAtk / (EffAtk + EffDef)) × EffAtk × 3.0))` *(where `Math.round` rounds `.5` up)*
* **Retaliation Damage (Melee Defense Only) & Spearman "Brace":**
  * Triggers only if the defender survives (`hpAfter > 0`), the attacker is within the defender's `range`, and the attacker is not a `siege` unit.
  * Uses the exact same equations with roles swapped, using the defender's **post-hit HP** (`hpAfter / maxHp`).
  * **Spearman "Brace" vs. Cavalry:** When a `spearman` unit (`spearman`, `oathsworn_halberdier`, `vanguard_spearman`, `free_company_spearman`) retaliates against a melee `cavalry` attack (`range === 1`, attacker class `cavalry`), the surviving Spearman calculates its retaliation `EffAtk` using its **pre-hit HP ratio** (`hpBefore / maxHp`) instead of `hpAfter / maxHp`. Wounded Spearmen brace at their pre-hit HP (not `maxHp`). All other melee retaliations still use `hpAfter / maxHp`.
    * *Verified Full-HP Plains Trades:* `knight` (`8/5/25`) vs. `spearman` (`6/6/22`) -> Knight deals `12` (`10/22`), Spearman braces at `22/22` and retaliates for `16` (`9/25`). `gilded_lancer` (`9/5/26`) vs. `spearman` -> Lancer deals `14` (`8/22`), Spearman retaliates for `16` (`10/26`). `dusk_outrider` (`7/4/20`) vs. `spearman` -> Outrider deals `10` (`12/22`), Spearman retaliates for `17` (`3/20`).
* **One-Shot Protection (Steadfast):**
  * If a unit is at **full HP** (`hp === maxHp`) when it is hit, the hit cannot take it below **1 HP** unless the attacker is a **melee unit (`range === 1`) with counter advantage (`CounterMult > 1.0`)** in that attack.
  * Ranged units (`range >= 2`: `archer`, `crossbowman`, `longbowman`) can **never** one-shot a full-HP unit, even with counter advantage (`1.40`) or *Bodkin Quivers* (`1.65`).
  * Applies to primary strikes **and** retaliation. Does not apply to Keeps, structures, Neutral Villages, Bandits, true damage (Mutiny, *Grumbling in the Ranks* event), or Winter attrition.
  * Intended melee counter one-shots still happen (e.g., `knight` → `archer`).

### Terrain & Fortification Modifiers (`DefBonus`)
Terrain and fortification bonuses **do not stack with each other**. A unit uses the **single highest** of its tile's terrain bonus and its fortification bonus, and then adds every other modifier source.

| Source | `DefBonus` | Notes |
| :--- | :---: | :--- |
| **Plains / River** | `+0.00` | Standard |
| **Hills** | `+0.20` | Grants `+1` Attack Range to `ranged` units |
| **Forest** | `+0.25` | Blocks entry for standard `cavalry` |
| **Neutral Frontier Village** *(garrison)* | `+0.20` | Applies to the neutral village garrison (non-stacking with terrain) |
| **Palisade / Watchtower** *(unit standing **on** the tile)* | `+0.30` | `+0.45` with *Mortar & Stonework*; Palisade blocks enemy movement |
| **Ancient Watchtower** *(unit standing **on** the tile)* | `+0.30` | Non-stacking with terrain; grants ongoing Coin & Favor while occupied |
| **Friendly Keep / Stronghold tile** | `+0.35` | `+0.45` with *Mortar & Stonework* |

* **Unmanned Fortification Defense (Raze Fortification):** Unmanned `palisade` and `watchtower` structures use flat `12 Structure HP` and `4 Defense` with `0.00 DefBonus` when targeted by **Raze Fortification** (`+0.30` / `+0.45` `DefBonus` applies only to units standing on them; *Mortar & Stonework* still applies its `25%` siege damage reduction to structure damage).

---

## 1b. Movement & Action Rules

### Movement Costs (Movement Points)
Movement is 8-directional (Chebyshev), matching adjacency rules.

| Terrain | Cost | Notes |
| :--- | :---: | :--- |
| **Plains** | `1` | |
| **Hills** | `2` | |
| **Forest** | `2` | `cavalry` cannot enter. Exception: `dusk_outrider` enters for `1`. |
| **River** | `2` | Aurelia's `river_tollhouse` makes it `1` for friendly units. Seasons modify this (Spring `3`, Winter `1`). |
| **Mountain** | `—` | Impassable to all units. Blocks ranged line of sight. |

* **Minimum-Move Rule:** A unit that has not moved this turn can always enter one adjacent passable tile, even if the cost exceeds its movement.

### Action Order & Zone of Control
* **Action Order:** Each turn a unit may **Move then Attack**, **Attack only**, or **Move only**. It cannot move after attacking.
  * *Exception:* **Dusk Outrider** may spend its remaining movement after attacking ("disengage").
  * "Attack" includes attacking a unit or Keep, **Raze Fortification**, and **Pillage**.
* **Zone of Control (ZoC):** A unit that enters a tile adjacent to an enemy unit or enemy Keep must stop there.
  * *Exception:* **Dusk Outrider** ignores ZoC. Starting a turn already inside ZoC does not stop a unit from moving away.
* **Flanking:** When attacking, the attacker gains **+0.15 `AtkBonus`** if the defender is adjacent to at least one *other* unit of the attacker's House. Does not stack beyond `+0.15`. **Vanguard Spearman** is immune (attackers never gain flanking against it). Flanking does not apply to attacks on Keeps or structures.
* **Melee Advance:** Killing a unit does not move the attacker onto its tile. The only exceptions are **Keep capture**, **violent Frontier Village seizure**, and **clearing an Outlaw Camp**.
* **Pillage:** A unit standing on an **enemy-owned tile with an economic improvement** (`farm`, `lumber_mill`, `iron_mine`, `smithy`, `market`, `granary`, or any faction-unique economic building) may use its attack action to Pillage.
  * Removes the improvement (`tile.improvement = null`; the tile remains owned by the enemy).
  * The pillaging House gains `Math.floor(improvementMatCost * 0.5)` Materials plus `3` Coin. **House Corvus doubles both.**
  * Keeps, Palisades, and Watchtowers cannot be pillaged (use **Raze Fortification** or Keep attacks instead). Logs a `pillage` ChronicleEvent.
* **Keep Defense Values:** A Keep's garrison has `Defense 5`, `Attack 4`, and `maxKeepHp 24` (`34` with Garrison Seat specialization). It uses the Keep `+0.35` `DefBonus` and the standard combat formula with `keepHp / maxKeepHp` as its HP ratio. On capture, `keepHp` is restored to `Math.floor(maxKeepHp / 2)` (`12` for standard Keeps; `17` for Garrison Seats). `siege` units deal their structure Attack (`siege_ram` 8, `sapper_crew` 6) and take zero retaliation (`siege_ram` neutralizes a full standard Keep in 2 hits: `13` then `17`; a Garrison Seat in 3 hits: `13`, `16`, lethal).
* **Neutral Frontier Village Defense Values:** An unclaimed `frontier_village` has `villageHp = 12` (`maxVillageHp = 12`, regenerating `+3 HP` at the start of each full round if undamaged during the previous round), `Attack 3`, `Defense 4`, and `+0.20 DefBonus` (non-stacking with terrain). It retaliates against melee (`range === 1`) attacks unless struck by `siege`, is not protected by One-Shot Protection, and cannot be entered while `villageHp > 0`. Reducing `villageHp` to `0` converts it into a Tier-1 Keep at `8/24 HP` and deducts `2` Royal Favor (clamped at `0`).
* **Training, Summoning Sickness & Manual Re-homing:** Training at a Keep requires the Keep center tile to be unoccupied. Newly trained units (and any hired `free_company_spearman`) spawn with **summoning sickness** (`hasMoved = true`, `hasAttacked = true`) and do not heal at the end of their spawn turn. Any friendly unit (except `free_company_spearman`) standing **on** a friendly Keep tile where `unit.homeKeepId !== keep.id` may use **Re-home Here** (`0` resources, `0` actions, non-commit/undoable) if that Keep has an open Army Cap slot, automatically clearing `'orphaned'` status.
* **Healing:** A unit that neither moved nor attacked heals `3 HP` (`6 HP` with *Field Chirurgeons*). A unit on a friendly Keep tile heals `+3 HP` more. Supply-Severed units and newly spawned units on their spawn turn do not heal.

---

## 2. Complete Unit Roster & Economy Costs

| Unit ID | Class | House | Max HP | Atk | Def | Mov | Rng | Mat Cost | Coin Upkeep | Unlock Requirement |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `militia` | `infantry` | All | 20 | 4 | 3 | 2 | 1 | 6 | 0 | Unlocked Turn 1 |
| `spearman` | `spearman` | All | 22 | 6 | 6 | 2 | 1 | 10 | 1 | Unlocked Turn 1 |
| `sapper_crew` | `siege` | All | 18 | 6* | 3 | 2 | 1 | 10 | 1 | Unlocked Turn 1 |
| `archer` | `ranged` | All | 16 | 6 | 2 | 2 | 2 | 10 | 1 | Decree: *Fletchers' Guild* *(excluded for Vane)* |
| `crossbowman` | `ranged` | All | 18 | 8 | 3 | 2 | 2 | 14 | 2 | Decree: *Steel Arbalests* |
| `men_at_arms` | `infantry` | All | 22 | 7 | 5 | 2 | 1 | 12 | 1 | Decree: *Chartered Men-at-Arms* |
| `knight` | `cavalry` | All | 25 | 8 | 5 | 3 | 1 | 18 | 3 | Decree: *Chivalric Order* *(excluded for Aurelia)* + Smithy Combo |
| `siege_ram` | `siege` | All | 24 | 8* | 4 | 1 | 1 | 16 | 2 | Decree: *Siege Engineers* |
| `longbowman` | `ranged` | Vane | 16 | 7 | 2 | 2 | 3 | 13 | 2 | House Vane Signature (+25% Atk in Forest/Hills) |
| `oathsworn_halberdier` | `spearman` | Ironhelm | 24 | 6 | 7 | 2 | 1 | 13 | 2 | House Ironhelm Signature (+40% Def near Keep/Wall) |
| `gilded_lancer` | `cavalry` | Aurelia | 26 | 9 | 5 | 3 | 1 | 20 | 3 | House Aurelia Signature (+1 Mov near River) + Smithy Combo (no decree gate; Aurelia starts with Iron Mine & Smithy decrees) |
| `dusk_outrider` | `cavalry` | Corvus | 20 | 7 | 4 | 4 | 1 | 14 | 2 | House Corvus Signature (Ignores Forest & ZoC; disengage) |
| `vanguard_spearman` | `spearman` | Solis | 24 | 7 | 6 | 2 | 1 | 13 | 2 | House Solis Signature (Flank-immune; +1 Sight) |
| `free_company_spearman` | `spearman` | Event | 22 | 8 | 6 | 2 | 1 | — | 1 | Event: *A Free Company Rides North* (15 Coin; no Army Cap; cannot re-home; disbands if orphaned) |

*\*Note on Siege Units:*
* `siege_ram`: Deals `8` base Attack against Keeps, Palisades, and Watchtowers (`16` base damage vs. `palisade`, `12` with *Mortar & Stonework* — guaranteed **1-hit raze**; 2-hit neutralize on standard Keeps; 3-hit on Garrison Seats); deals `4` base Attack against biological units.
* `sapper_crew`: Deals `6` base Attack against Keeps, Palisades, and Watchtowers (`11` base damage vs. `palisade`, `8` with *Mortar & Stonework* — **2-hit raze**); deals `2` base Attack against biological units.

---

## 3. Verified Hits-to-Kill (HTK) Matrix

*This table is generated by `scripts/genHtkTable.ts`, which calls the real engine combat function (including One-Shot Protection, adding a column for when it triggers). Never edit it by hand.* Engine tests assert against the engine's output, not against document numbers.

---

## 4. Keep Progression, Economy & Spatial Adjacency Values

### Starting House State (Turn 1)
* **Starting Resources:** `Materials: 12`, `Coin: 10`. There is **no house-level Food treasury**—each Keep's Food yield goes directly into **that Keep's growth bar** (Capital Growth starts at `0 / 18`). The HUD's Food figure displays total Food income per turn across all Keeps.
* **Coin Draft Milestones:** Checked against `house.lifetimeCoinEarned` (all gross Coin gained from Keep income, buildings, Watchtower occupation, bounties, ruins, and events; spending and upkeep are never subtracted). Tracked via `house.coinMilestonesClaimed` (starts at `0`) and `house.nextCoinMilestone` (starts at `25`). Whenever `lifetimeCoinEarned >= nextCoinMilestone`: increment `pendingDraftCount += 1`, increment `coinMilestonesClaimed += 1`, and advance `nextCoinMilestone += 20 * (coinMilestonesClaimed + 1)`. Resulting gross Coin thresholds: `25 -> 65 (+40) -> 125 (+60) -> 205 (+80) -> 305 (+100) -> 425 (+120) -> 565 (+140)...`
* **Peaceful Village Annexation Cost:** `15 Coin` (house treasury) plus `12 Food` taken from the growth bar of the friendly Keep with `foodProgress >= requiredFood` that is **closest (Chebyshev distance) to the Frontier Village** (tie-break by highest `foodProgress`, then `keep.id`). If no single friendly Keep has `foodProgress >= requiredFood`, Peaceful Annexation is disabled. *Crown Envoys* reduces this to `9 Coin + 7 Food`. Owning at least one **Market Town** Keep reduces the Coin cost by `20%` (additive with *Crown Envoys*; total discount capped at `50%`).
* **Ancient Watchtower Occupation Yield:** During the Harvest & Upkeep Phase, each `ancient_watchtower` occupied by a friendly unit grants `+2 Coin` every turn (counts toward `lifetimeCoinEarned`), plus `+1 Royal Favor` on even turns (`turnNumber % 2 === 0`; counts toward `stats.lifetimeFavor`).

### Keep Tier Scaling
| Keep Tier | Border Radius | Workable Tiles | Army Cap | Base Food / Turn | Base Mat / Turn | Base Coin / Turn | Next Level Food Threshold |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Tier-1 Keep** | 3x3 | 8 | 3 Units | +2 | +2 | +3 | 18 Food |
| **Tier-2 Stronghold** | 5x5 | 24 | 4 Units | +4 | +3 | +5 | 36 Food *(1st repeat: Draft + 5 Coin; subsequent: Royal Surplus +10 Coin, +2 Favor)* |

### Tier-2 Keep Specialization
When a Keep reaches Tier 2, its owner chooses **one permanent specialization** before the Royal Decree Draft that the level-up also triggers:

| Specialization | Effects |
| :--- | :--- |
| **Garrison Seat** | Army Cap `4 -> 5`. `maxKeepHp` `24 -> 34`; Keep regeneration `+4 -> +6`. Friendly units inside this Keep's territory gain `+0.10 DefBonus`. Palisade cap in this territory `4 -> 5`. |
| **Market Town** | `+4 Coin/turn`. Markets in this territory yield `+2 Coin` more. While the House owns at least one Market Town, Peaceful Annexation costs `20%` less Coin (does not stack across multiple Market Towns; adds to *Crown Envoys*, total discount capped at `50%`). |
| **Granary Seat** | `+2 Food/turn`. Farms in this territory yield `+1 Food`. This Keep's repeat-milestone threshold drops `36 -> 28` Food. |

### Improvement Costs, Base Yields & Spatial Adjacencies
| Improvement ID | Mat Cost | Valid Terrain | Base Yield / Turn | Spatial Adjacency / Special Rule |
| :--- | :---: | :--- | :--- | :--- |
| `farm` | 6 | Plains | +2 Food | **+2 Food** if adjacent to any `river` tile |
| `lumber_mill` | 6 | Plains, Hills | +2 Materials | **+2 Materials** if adjacent to 2 or more `forest` tiles |
| `iron_mine` | 8 | Hills/Mountain w/ Iron | +3 Materials | Requires `hasIronDeposit === true` on tile |
| `smithy` | 10 | Plains, Hills | +1 Materials | Adjacent to `iron_mine` (or `deep_smeltery`) AND `lumber_mill`: unlocks `knight` / `gilded_lancer` training at Keep |
| `market` | 8 | Plains | +3 Coin | **+1 Coin** per adjacent `farm` or `river` tile |
| `granary` | 8 | Plains | +2 Food | **+1 Food** to every adjacent `farm` or `foresters_lodge` |
| `palisade` | 5* | Any non-Mountain | — | Blocks enemy movement; grants **+0.30 `DefBonus`** to friendly unit standing **on** the tile (*Ironhelm cost: 3 Mat*) |
| `watchtower` | 7* | Plains, Hills | — | Clears 5x5 fog radius; grants **+0.30 `DefBonus`** to friendly unit standing **on** the tile (*Ironhelm cost: 5 Mat*) |
| `foresters_lodge` | 8 | Forest | +2 Food, +2 Mat | **House Vane:** Preserves Forest tile (stacks with Vane's +1 Mat passive) |
| `deep_smeltery` | 10 | Mountain / Iron | +4 Mat, +2 Coin | **House Ironhelm:** Can be built on bare Mountain tiles even without Iron; satisfies `smithy`'s `iron_mine` adjacency requirement |
| `river_tollhouse` | 8 | River | +3 Coin | **House Aurelia:** Acts as a walkable bridge (`1` Mov cost) for friendly units |
| `war_camp` | 14 | Plains, Hills | +1 Materials | **House Corvus:** Increases parent Keep's Army Cap by `+1`. Max **1 per Keep**, max **2 per House**. |
| `signal_bastion` | 9 | Hills, Plains | +1 Coin | **House Solis:** Clears 5x5 fog; grants **+0.15 `AtkBonus`** to adjacent friendly units |

---

## 5. Turn 1–10 Economy Pacing Benchmark (House Vane Illustrative Model)

*Note: This illustrative table reflects the per-Keep Food growth-bar model (no house-level Food treasury) and Spring/Summer baseline conditions. It will be regenerated by the simulation harness (`scripts/sim.ts`) once the engine is built.*

Assumes House Vane starts with a Capital containing 2 Forest tiles (`+2 Mat/turn` passive), 1 River-adjacent Plains tile, and 1 standard Plains tile within its initial 3x3 territory.

| Turn | Net Income (F / M / C) | Action Taken | End Treasury (Mat / Coin) | Capital Growth Bar | Milestone / Strategic State |
| :---: | :---: | :--- | :---: | :---: | :--- |
| **1** | +2 / +4 / +3 | Build `farm` on River Plains (`-6 Mat`) | 10 / 13 | 2 / 18 | Farm online (`+4 Food/turn` w/ River) |
| **2** | +6 / +4 / +3 | Build `lumber_mill` next to 2 Forests (`-6 Mat`) | 8 / 16 | 8 / 18 | Mill online (`+4 Mat/turn` w/ Adjacency) |
| **3** | +6 / +8 / +3 | Train `spearman` (`-10 Mat`, `-1 Coin/turn`) | 6 / 19 | 14 / 18 | First scout/escort unit deployed (Cap 1/3) |
| **4** | +6 / +8 / +2 | Build `foresters_lodge` in Forest (`-8 Mat`) | 6 / 21 | **2 / 36** | **Tier-2 Stronghold!** Specialization + **Draft #1** |
| **5** | +10 / +11 / +4 | Train `longbowman` (`-13 Mat`, `-2 Coin/turn`) | 4 / **25** | 12 / 36 | **25 Coin Milestone -> Draft #2!** (Cap 2/4) |
| **6** | +10 / +11 / +2 | Build `market` next to River (`-8 Mat`) | 7 / 27 | 22 / 36 | Market online (`+4 Coin/turn`) offsets upkeep |
| **7** | +10 / +11 / +6 | Train `spearman` (`-10 Mat`, `-1 Coin/turn`) | 8 / 33 | 32 / 36 | 3-unit strike group ready (Cap 3/4) |
| **8** | +10 / +11 / +5 | 1st Tier-2 Repeat Milestone (`+5 Coin`); save for Annexation | 19 / 43 | **6 / 36** | **Draft #3** triggered by Capital `36 Food` bar |
| **9** | +10 / +11 / +5 | Annex neutral Frontier Village (`-12 F` from bar, `-15 C`) | 30 / 33 | 4 / 36 | **2nd Keep online!** Economy doubles |

---

## 6. Scoring (Chronicle & Live HUD)

Score is computed by a pure function `src/engine/scoring.ts → computeScore(state, houseId)` and shown live in the HUD in both modes, though it only decides the winner in **Chronicle** mode (ending after Turn 33). Scoring reads `house.stats` counters directly and never recalculates history.

| Category | Points |
| :--- | :--- |
| **Territory** | `+1` per owned tile |
| **Keeps** | `+40` per Keep owned; `+20` extra per Tier-2 Keep |
| **Decrees** | `+10` per **enacted** decree beyond starting decrees: `Math.max(0, house.decreeIds.length - house.startingDecreeCount) * 10` (`startingDecreeCount = 2` for Aurelia; `0` for all other Houses) |
| **Military** | `+5` per enemy unit destroyed; `+30` per enemy Keep captured (counted when captured, kept even if the Keep is lost later) |
| **Exploration** | `+1` per `4` tiles ever revealed (rounded down) |
| **Landmarks** | `+15` per Relic Ruin explored; `+20` per Outlaw Camp cleared; `+10` per Ancient Watchtower first reached |
| **Crown** | `+2` per point of **lifetime** Royal Favor earned |
| **Treasury** | `+1` per `10` Coin held at game end *(end-of-game only)* |

* **Tiebreakers (Chronicle):** More Keeps → higher `lifetimeCoinEarned` → House turn order.
