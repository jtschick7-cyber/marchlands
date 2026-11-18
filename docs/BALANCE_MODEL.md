# Artifact #1: Marchlands Mathematical Balance & Hits-to-Kill (HTK) Model

This document defines the exact deterministic combat formulas, unit stat blocks, spatial economy yields, and Turn 1–12 pacing curves for *Marchlands*. All values are tuned for a 22x22 map with 3–4 unit Keep caps so engagements resolve cleanly in 2–3 hits without stalemate stalemates or runaway turn-5 snowballs.

---

## 1. Deterministic Combat Engine Math

Combat uses a ratio-based deterministic formula scaled by current HP percentage (`hp / maxHp`). No random damage rolls occur.

### Damage Equations
* **Counter-Triangle Multiplier (`CounterMult`):** `1.40` (+40%) whenever a unit is in an advantaged matchup (applies to **both** Attack and Defense); `1.00` otherwise.
  * `spearman` counters `cavalry`
  * `cavalry` counters `ranged` and `siege`
  * `ranged` and `infantry` counter `spearman`
* **Effective Attack (`EffAtk`):**
  `EffAtk = Unit.attack * (Unit.hp / Unit.maxHp) * CounterMult * PassiveAtkMult`
* **Effective Defense (`EffDef`):**
  `EffDef = Target.defense * (Target.hp / Target.maxHp) * TargetCounterMult * TerrainDefMult * PassiveDefMult`
* **Primary Strike Damage:**
  `Damage = Math.max(1, Math.round((EffAtk / (EffAtk + EffDef)) * EffAtk * 3.0))`
* **Retaliation Damage (Melee Defense Only):**
  * Triggers only if the defender survives (`hpAfter > 0`), the attacker is within the defender's `range`, and the attacker is not a `siege` unit.
  * Uses the defender's **post-hit HP** (`hpAfter / maxHp`), rewarding decisive first strikes:
  * `RetAtk = Target.attack * (hpAfter / Target.maxHp) * TargetCounterMult * PassiveAtkMult`
  * `RetDef = Unit.defense * (Unit.hp / Unit.maxHp) * CounterMult * AttackerTerrainDefMult`
  * `Retaliation = Math.max(1, Math.round((RetAtk / (RetAtk + RetDef)) * RetAtk * 3.0))`

### Terrain & Fortification Modifiers (`TerrainDefMult`)
* **Plains / River:** `1.00` (Standard)
* **Hills:** `1.20` (+20% Defense; grants `+1` Attack Range to `ranged` units)
* **Forest:** `1.25` (+25% Defense; blocks entry for standard `cavalry`)
* **Palisade Wall / Watchtower:** `1.30` (+30% Defense; blocks enemy movement across tile)
* **Friendly Keep / Stronghold:** `1.35` (+35% Defense)

---

## 2. Complete Unit Roster & Economy Costs

| Unit ID | Class | House | Max HP | Atk | Def | Mov | Rng | Mat Cost | Coin Upkeep | Unlock Requirement |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `militia` | `infantry` | All | 20 | 4 | 3 | 2 | 1 | 6 | 0 | Unlocked Turn 1 |
| `spearman` | `spearman` | All | 22 | 6 | 6 | 2 | 1 | 10 | 1 | Unlocked Turn 1 |
| `archer` | `ranged` | All | 16 | 6 | 2 | 2 | 2 | 10 | 1 | Decree: *Fletchers' Guild* |
| `crossbowman` | `ranged` | All | 18 | 8 | 3 | 2 | 2 | 14 | 2 | Decree: *Steel Arbalests* |
| `knight` | `cavalry` | All | 25 | 8 | 5 | 3 | 1 | 18 | 3 | Decree: *Chivalric Order* + Smithy Combo |
| `siege_ram` | `siege` | All | 24 | 10* | 4 | 1 | 1 | 16 | 2 | Decree: *Siege Engineers* |
| `longbowman` | `ranged` | Vane | 16 | 7 | 2 | 2 | 3 | 13 | 2 | House Vane Signature (+25% Atk in Forest/Hills) |
| `oathsworn_halberdier` | `spearman` | Ironhelm | 24 | 6 | 7 | 2 | 1 | 13 | 2 | House Ironhelm Signature (+40% Def near Keep/Wall) |
| `gilded_lancer` | `cavalry` | Aurelia | 26 | 9 | 5 | 3 | 1 | 20 | 3 | House Aurelia Signature (+1 Mov near River) + Smithy |
| `dusk_outrider` | `cavalry` | Corvus | 20 | 7 | 4 | 4 | 1 | 14 | 2 | House Corvus Signature (Ignores Forest; disengage) |
| `vanguard_spearman` | `spearman` | Solis | 24 | 7 | 6 | 2 | 1 | 13 | 2 | House Solis Signature (Flank-immune; +1 Sight) |

*\*Note on Siege Ram: Deals `10` base Attack against Keeps, Palisades, and Watchtowers; deals `4` base Attack against biological units.*

---

## 3. Verified Hits-to-Kill (HTK) Matrix

All figures below are computed directly from the Section 1 equations assuming full starting HP on both sides.

| Attacker | Defender | Defender Terrain | Counter Active? | Hit 1 Dmg | Retaliation Dmg | Hit 2 Dmg | Expected HTK | Tactical Role Check |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `militia` (20 HP) | `militia` (20 HP) | Plains (1.0x) | No | 7 | 4 | 6 | **3 Hits** | Even mirror attrition |
| `spearman` (22 HP) | `knight` (25 HP) | Plains (1.0x) | Yes (+40%) | 16 | 2 | 19 | **2 Hits** | Hard counter punishes Cavalry |
| `knight` (25 HP) | `spearman` (22 HP) | Plains (1.0x) | Yes (Def +40%) | 12 | 4 | 11 | **2–3 Hits** | Spearman survives charge & holds line |
| `knight` (25 HP) | `archer` (16 HP) | Plains (1.0x) | Yes (+40%) | 29 | 0 | — | **1 Hit** | Cavalry deletes exposed Ranged |
| `dusk_outrider` (20 HP) | `archer` (16 HP) | Forest (1.25x) | Yes (+40%) | 23 | 0 | — | **1 Hit** | Corvus outrider ambushes forest archers |
| `archer` (16 HP) | `spearman` (22 HP) | Plains (1.0x) | Yes (+40%) | 15 | 0 | 15 | **2 Hits** | Ranged softens Spear wall safely |
| `longbowman` (16 HP) | `spearman` (22 HP) | Plains (1.0x) | Yes (+40% +25%) | 23 | 0 | — | **1 Hit** | Vane Hill/Forest sniper one-shots Spear |
| `crossbowman` (18 HP) | `oathsworn_halberdier` (24 HP) | Palisade (1.70x*) | Yes (+40%) | 16 | 0 | 16 | **2 Hits** | Ironhelm wall defense prevents 1-shot |
| `knight` (25 HP) | `oathsworn_halberdier` (24 HP) | Palisade (2.10x*) | Yes (Def +40%) | 9 | 6 | 9 | **3 Hits** | Ironhelm choke point is nearly unbreakable |

*\*Oathsworn Halberdier stacks +30% Palisade/Keep terrain with +40% Oathsworn passive (`1.0 + 0.30 + 0.40 = 1.70x`), plus `1.40x` Counter Defense vs Cavalry (`1.70 * 1.40 = 2.38x` effective defense).*

---

## 4. Keep Progression, Economy & Spatial Adjacency Values

### Starting House State (Turn 1)
* **Starting Resources:** `Food: 0` (Capital Growth `0 / 18`), `Materials: 12`, `Coin: 10`
* **First Coin Draft Milestone:** `25 Coin` (subsequent milestones increment by `+35 Coin`: `25 -> 60 -> 95 -> 130...`)
* **Peaceful Village Annexation Cost:** `12 Food + 15 Coin` (requires friendly unit adjacent to neutral Frontier Village; converts immediately into a Tier-1 Keep)

### Keep Tier Scaling
| Keep Tier | Border Radius | Workable Tiles | Army Cap | Base Food / Turn | Base Mat / Turn | Base Coin / Turn | Next Level Food Threshold |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tier-1 Keep** | 3x3 | 8 | 3 Units | +2 | +2 | +3 | 18 Food |
| **Tier-2 Stronghold** | 5x5 | 24 | 4 Units | +4 | +3 | +5 | 36 Food (Grants Draft Only) |

### Improvement Costs, Base Yields & Spatial Adjacencies
| Improvement ID | Mat Cost | Valid Terrain | Base Yield / Turn | Spatial Adjacency / Special Rule |
| :--- | :---: | :--- | :--- | :--- |
| `farm` | 6 | Plains | +2 Food | **+2 Food** if adjacent to any `river` tile |
| `lumber_mill` | 6 | Plains, Hills | +2 Materials | **+2 Materials** if adjacent to 2 or more `forest` tiles |
| `iron_mine` | 8 | Hills/Mountain w/ Iron | +3 Materials | Requires `hasIronDeposit === true` on tile |
| `smithy` | 10 | Plains, Hills | +1 Materials | Adjacent to `iron_mine` AND `lumber_mill`: unlocks `knight` / `gilded_lancer` training at Keep |
| `market` | 8 | Plains | +3 Coin | **+1 Coin** per adjacent `farm` or `river` tile |
| `granary` | 8 | Plains | +2 Food | **+1 Food** to every adjacent `farm` or `foresters_lodge` |
| `palisade` | 5* | Any non-Mountain | — | Blocks enemy movement; grants **+30% Defense** (*Ironhelm cost: 3 Mat*) |
| `watchtower` | 7* | Plains, Hills | — | Clears 5x5 fog radius; grants **+30% Defense** (*Ironhelm cost: 5 Mat*) |
| `foresters_lodge` | 8 | Forest | +2 Food, +2 Mat | **House Vane:** Preserves Forest tile (stacks with Vane's +1 Mat passive) |
| `deep_smeltery` | 10 | Mountain / Iron | +4 Mat, +2 Coin | **House Ironhelm:** Can be built on bare Mountain tiles even without Iron |
| `river_tollhouse` | 8 | River | +3 Coin | **House Aurelia:** Acts as a walkable bridge for friendly units |
| `war_camp` | 9 | Plains, Hills | +1 Materials | **House Corvus:** Increases parent Keep's Army Cap by `+1` |
| `signal_bastion` | 9 | Hills, Plains | +1 Coin | **House Solis:** Clears 5x5 fog; grants **+15% Attack** to adjacent friendly units |

---

## 5. Turn 1–10 Economy Pacing Simulation (House Vane Benchmark)

Assumes House Vane starts with a Capital containing 2 Forest tiles (`+2 Mat/turn` passive), 1 River-adjacent Plains tile, and 1 standard Plains tile within its initial 3x3 territory.

| Turn | Net Income (F / M / C) | Action Taken | End Treasury (F / M / C) | Keep Growth | Milestone / Strategic State |
| :---: | :---: | :--- | :---: | :---: | :--- |
| **1** | +2 / +4 / +3 | Build `farm` on River Plains (`-6 Mat`) | 2 / 10 / 13 | 2 / 18 | Farm online (`+4 Food/turn` w/ River) |
| **2** | +6 / +4 / +3 | Build `lumber_mill` next to 2 Forests (`-6 Mat`) | 8 / 8 / 16 | 8 / 18 | Mill online (`+4 Mat/turn` w/ Adjacency) |
| **3** | +6 / +8 / +3 | Train `spearman` (`-10 Mat`, `-1 Coin/turn`) | 14 / 6 / 19 | 14 / 18 | First scout/escort unit deployed (Cap 1/3) |
| **4** | +6 / +8 / +2 | Build `foresters_lodge` in Forest (`-8 Mat`) | 20 / 6 / 21 | **2 / 36** | **Tier-2 Stronghold!** Borders 5x5; **Draft #1** |
| **5** | +10 / +11 / +4 | Train `longbowman` (`-13 Mat`, `-2 Coin/turn`) | 12 / 4 / **25** | 12 / 36 | **25 Coin Milestone -> Draft #2!** (Cap 2/4) |
| **6** | +10 / +11 / +2 | Build `market` next to River (`-8 Mat`) | 22 / 7 / 27 | 22 / 36 | Market online (`+4 Coin/turn`) offsets upkeep |
| **7** | +10 / +11 / +6 | Train `spearman` (`-10 Mat`, `-1 Coin/turn`) | 32 / 8 / 33 | 32 / 36 | 3-unit strike group ready (Cap 3/4) |
| **8** | +10 / +11 / +5 | Annex neutral Frontier Village (`-12 F, -15 C`) | 30 / 19 / 23 | 30 / 36 | **2nd Keep online!** Economy doubles |

**Pacing Takeaway:** The player upgrades their Capital and triggers their first two Royal Decree Drafts by **Turns 4–5**, fields a 3-unit tactical squad by **Turn 7**, and secures a second Keep by **Turn 8**—putting them directly on collision course with rival Houses around Turns 9–12.
