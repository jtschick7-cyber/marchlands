Spec Version: 2.0

# Artifact #1: Marchlands v2.0 Mathematical Balance & HTK Model

All numeric values below are canonical initial tuning constants stored in `src/data/` and verified through `scripts/sim.ts` and `scripts/genHtkTable.ts`.

---

## 1. Deterministic Combat Math (v2.0)

* **Counter-Triangle (`CounterMult = 1.40`):**
  * `spearman` counters `cavalry` (+ **Brace** at pre-hit HP)
  * `infantry` counters `spearman`
  * `ranged` counters `infantry` (`1.65` vs `infantry` with *Bodkin Volleys*)
  * `cavalry` counters `ranged` and `siege`
  * `commander` and `siege` are neutral against unit classes (`1.00`).
* **Crossbow Armor-Piercing:** `crossbowman` ignores `30%` of target's base Defense when `target.defense >= 5`.
* **Additive Bonus Buckets (clamped `[−0.50, +1.50]`):**
  * `AtkBonusSum` includes: Hills downhill (`+0.15`), unbridged River attack (`−0.25`), Flanking (`+0.15`), Cavalry Lance Charge (`+0.20` after `≥ 2` open/road tiles), Watchtower ranged bonus (`+0.15`), Commander aura (`+0.10`), Signal Bastion (`+0.15`/`+0.20`), Longbowman terrain (`+0.10`), active Commander skills, Doctrines, Battle Honors, Supply-Severed (`−0.25`), Mutiny (`−0.25`).
  * `DefBonusSum` includes: Terrain + additive Fortification cover (capped at `0.60`, or `0.70` with *Stone Curtain*), Fortify/Phalanx (`+0.15` / `+0.25`), Commander aura (`+0.10`), Oathsworn (`+0.40`), Garrison Seat (`+0.10`), Battle Honors, Supply-Severed (`−0.25`).
* **Damage Equation (`COMBAT_DAMAGE_SCALE = 2.2`):**
  `EffAtk = BaseAtk × (hp / maxHp) × (1 + AtkBonusSum) × CounterMult`
  `EffDef = EffectiveBaseDef × (hp / maxHp) × (1 + DefBonusSum) × TargetCounterMult`
  `Damage = Math.max(1, Math.round((EffAtk / (EffAtk + EffDef)) × EffAtk × 2.2))`
* **Ranged-vs-Wall Reduction:** Attacks from `ranged` units against a defender standing on a friendly `palisade` (Lv1/Lv2) deal `25%` less damage (`Math.max(1, Math.round(dmg * 0.75))`).
* **Non-Siege Structure Penalty:** Non-siege units attacking Keeps, Outposts, Palisades, Watchtowers, or Stone Bridges deal **`50%` damage** (`Math.max(1, Math.round(dmg * 0.5))`). Melee non-siege attackers striking unmanned Palisades/Stone Walls take **`2` spike damage** (cannot bypass Steadfast if full HP—applies as flat structure recoil).
* **One-Shot Protection (Steadfast):** Full-HP units cannot drop below `1 HP` in one hit unless struck by a melee (`range === 1`) unit with counter advantage (`CounterMult > 1.0`).
* **Overwatch Reaction Volley:** Fires at `85%` damage (`110%` with *Bodkin Volleys*) against the first enemy entering range + LOS during the rival's turn, then clears `isOverwatch`.
* **Infantry Shield Push:** When a surviving `infantry` attacker deals strictly more damage than it takes in melee (`attackerDamage > retaliationDamage`) and the defender survives (and is not on a Keep or fortified Phalanx), the defender is pushed `1` tile directly away along `(sign(dx), sign(dy))` if that tile is in bounds, passable for the defender, and unoccupied.

---

## 2. Unit Roster (15 Trainable/Event Units + 5 Lord-Commanders)

| Unit ID | Class | House | HP | Atk | Struct Atk | Def | Mov | Rng | Mat / Iron | Coin Upk | Local Unlock |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `militia` | infantry | All | 24 | 4 | — | 3 | 2 | 1 | `6 / 0` | 0 | Keep T1 |
| `spearman` | spearman | All | 28 | 6 | — | 6 | 2 | 1 | `10 / 0` | 1 | Keep T1 |
| `sapper_crew` | siege | All | 22 | 2 | 7 | 3 | 2 | 1 | `10 / 1` | 1 | Keep T1 |
| `archer` | ranged | All | 20 | 6 | — | 2 | 2 | 2 | `10 / 0` | 1 | Barracks |
| `men_at_arms` | infantry | All | 28 | 7 | — | 6 | 2 | 1 | `10 / 4` | 2 | Barracks |
| `crossbowman` | ranged | All | 22 | 8 | — | 3 | 2 | 2 | `12 / 5` | 2 | Barracks + Smithy |
| `knight` | cavalry | All | 32 | 9 | — | 6 | 3 | 1 | `14 / 8` | 4 | Smithy Combo |
| `siege_ram` | siege | All | 30 | 4 | 10 | 5 | 1 | 1 | `14 / 6` | 2 | Siege Workshop |
| `trebuchet` | siege | All | 24 | 5 | 12 | 2 | 1 | 3 | `18 / 10` | 3 | Grand Foundry / Engine Yard |
| `longbowman` | ranged | Vane | 20 | 7 | — | 2 | 2 | 3 | `14 / 2` | 2 | Barracks (Vane) |
| `oathsworn_halberdier` | spearman | Ironhelm | 32 | 7 | — | 7 | 2 | 1 | `12 / 4` | 2 | Barracks (Ironhelm) |
| `gilded_lancer` | cavalry | Aurelia | 34 | 10 | — | 6 | 3 | 1 | `15 / 7` | 3 | Smithy Combo (Aurelia) |
| `dusk_outrider` | cavalry | Corvus | 26 | 8 | — | 4 | 4 | 1 | `12 / 3` | 2 | Barracks (Corvus) |
| `vanguard_spearman` | spearman | Solis | 30 | 8 | — | 7 | 2 | 1 | `12 / 3` | 2 | Barracks (Solis) |
| `free_company_spearman` | spearman | Event | 28 | 8 | — | 6 | 2 | 1 | `—` (`20C`) | 2 | Event Hire |
| `lord_commander` | commander | All (1/House) | 34 | 8 | — | 6 | 2* | 1 | — | 2 | Starts at Capital (`3` Mov for Corvus/Aurelia) |

---

## 3. Keep Progression, Outposts & Economy Tables

### Starting State
* `Materials: 16`, `Iron: 4`, `Coin: 14`, Capital `foodProgress: 0 / 30`, `Lord-Commander` spawned on Capital tile (ready on Turn 1).

### Keep Tier Scaling
| Tier | Border | Army Cap | Base HP (Regen) | Base Yield (F/M/I/C) | Garrison Attack | Upgrade Threshold |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Tier 1 Keep** | `3×3` | `3` | `36 (+4)` | `2 / 2 / 0 / 3` | Melee `5` Atk | `30 Food` → Tier 2 |
| **Tier 2 Stronghold** | `5×5` | `4` | `48 (+5)` | `4 / 3 / 0 / 5` | Melee `6` Atk | `90 Food + 10 Iron` → Tier 3 |
| **Tier 3 Grand Citadel** | `7×7` | `5` | `64 (+6)` | `6 / 4 / 0 / 8` | Range-2 Arrow Slits (`6` Atk, 1/turn) | `75 Food` → Royal Surplus (`+15C, +2 Favor`) |

* **Tier-2 Specializations:** `garrison` (`+1` Cap, `+14` HP, `+2` regen, `+10%` Def, `+2` Wall cap), `market_town` (`+5C/t`, Markets `+2C`, `-20%` Annex Coin), `granary_seat` (`+3F/t`, Farms `+1F`, Winter shield, `-15%` growth thresholds), `forge_seat` (`+1 Iron/t`, Mines/Quarries `+1` yield, `-2` Iron unit discount).
* **Tier-3 Citadel Charters:** `war_college` (recruits start Rank 1), `grand_exchange` (`+8C/t`, `-1C` building upkeep in territory), `royal_bastion` (walls upgrade to Stone free & auto-repair `+3 HP/t`), `high_armory` (`+2` Max HP & `-1C` upkeep on local recruits).
* **Frontier Outpost:** Max `2` per House (`3` with *Border Wardens*); cost `12 Mat + 12 Coin`; claims sticky `3×3`; `20 HP`, `4 Def`, `+0.30` cover; Winter shelter & Reinforce hub; cannot train units.

### Scoring (Chronicle & Live HUD)
* Territory: `+1`/owned tile (`+1` bonus per Lv2 improvement)
* Keeps & Outposts: `+40`/Keep, `+20` extra/Tier-2, `+50` extra/Tier-3 Citadel, `+15`/Outpost
* Decrees: `+15` per enacted Doctrine
* Military: `+5`/enemy unit destroyed, `+30`/Keep captured, `+20`/enemy Commander wounded
* Exploration: `+1` per `6` tiles revealed
* Landmarks: `+15`/Ruin, `+20`/Camp, `+10`/Watchtower first reached, `+15` first High Seat capture
* Crown: `+2`/lifetime Favor; Treasury (game end): `+1` per `10` Coin + `+2` per `1` Iron held
