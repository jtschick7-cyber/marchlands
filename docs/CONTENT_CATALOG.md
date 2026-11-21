Spec Version: 2.0

# Artifact #2: Marchlands v2.0 Content & Flavor Catalog

---

## 1. The 8 Mutually Exclusive Doctrine Pairs (16 Royal Decrees)

Core buildings and units unlock deterministically through Keep Tiers and local Keep buildings. Royal Decrees trigger **6–8 times per 100-turn campaign** (first Tier-2 Stronghold, first Tier-3 Citadel, escalating `lifetimeCoinEarned` milestones `60 -> 150 -> 280 -> 450 -> 660...`, and Charter Relic Ruins). Each draft offers cards from **unclaimed pairs**; enacting one side **permanently locks its rival** (`lockedDecreeIds`).

| Pair ID | Option A (`decreeId`) | Option B (`decreeId`) |
| :--- | :--- | :--- |
| `pair_army` | `decree_feudal_levies` — **Feudal Levy Muster:** Tier-1 units (`militia`, `spearman`, `archer`, `sapper_crew`) cost `-2 Mat`; Tier-2+ Keeps gain `+1` Army Cap. | `decree_standing_corps` — **Standing Professional Corps:** Rank 1+ units gain `+15% Atk` & `+10% Def`; `+50%` combat XP; Field Reinforce costs `-25%`. |
| `pair_warfare` | `decree_stone_curtain` — **Stone Curtain:** Fortifications & Keeps gain `+20%` Max HP; Stone Wall upgrade `-2 Iron`; Bastion volleys deal `+2` damage; max cover cap `0.70`. | `decree_mobile_vanguard` — **Mobile Vanguard:** `+1` bonus Road travel; Cavalry Lance Charge `+15%` extra Atk; Infantry gain `+1` Mov when starting on Plains. |
| `pair_economy` | `decree_chartered_guilds` — **Chartered Guilds:** Markets & Guildhalls `+2 Coin`; Peaceful Annexation `-30%` Coin & Food; Lv2 Markets have `0` upkeep. | `decree_royal_extraction` — **Royal Extraction:** Iron Mines & Deep Smelteries `+1 Iron`; Quarries & Mills `+1 Mat`; Smithies & Siege Workshops `-2 Iron`. |
| `pair_winter` | `decree_winter_granaries` — **Winter Granaries:** Granaries & Silos extend Winter immunity `+1` tile and add `+2 HP` passive healing within radius. | `decree_hardened_marchers` — **Hardened Marchers:** Units ignore Winter `-1` Mov penalty, halve Winter attrition, and gain `+15%` Atk during Winter. |
| `pair_crown` | `decree_regents_envoy` — **Regent's Envoy:** `+50%` Favor (rounded up) from Writs & Watchtowers; Crown Audience actions cost `-1` Favor. | `decree_iron_sovereign` — **Iron Sovereign:** `+10%` combat Atk/Def vs Houses with strictly more Favor; double Pillaging & Commander Ransom Coin; violent seizure loses `0` Favor. |
| `pair_firepower` | `decree_bodkin_volleys` — **Bodkin Volleys:** Ranged Overwatch deals `110%` damage (up from `85%`); Ranged counter multiplier vs Infantry rises `1.40 -> 1.65`. | `decree_grand_bombardment` — **Grand Bombardment:** Trebuchets deal `3` splash damage to enemies adjacent to target; Siege Rams & Sappers gain `+2` structure Atk. |
| `pair_medicine` | `decree_field_surgeons` — **Field Chirurgeons:** Stationary passive healing `+3 HP/turn`; active Field Reinforce restores `+12 HP` instead of `+8`. | `decree_salvage_crews` — **Battlefield Salvage:** Slaying enemy units grants `+4 Mat` (`+1 Iron` if target costs Iron); clearing Outlaw Camps grants `+2 Iron`. |
| `pair_frontier` | `decree_border_wardens` — **Border Wardens:** Outpost cap rises `2 -> 3`; Watchtowers & Bastions gain `+1` sight and cost `-2 Mat`. | `decree_royal_roads` — **Royal Road Network:** Roads cost `1 Mat`; units starting a turn on a Road gain `+1` Mov. |

---

## 2. Lord-Commanders & Branching Marshal Traits

Each House fields `1` named **Lord-Commander** starting at its Capital on Turn 1.
* **Vane — Warden-Marshal:** *Warden's Volley* (`4t` CD) — Reveals `7×7`; allies within `2` tiles ignore Forest move cost and gain `+15%` Atk in Forest/Hills this turn; friendly `ranged` units within `2` tiles gain `+1` Range until next turn and immediately arm **Overwatch** even after moving/attacking.
* **Ironhelm — Stone-Thane:** *Hold the Line* (`4t` CD) — Adjacent friendly units immediately **Fortify** (even if acted), gain `+25%` Def until next turn, and heal `+4 HP`.
* **Aurelia — Grand Syndic:** *Golden Banner* (`4t` CD) — Spend `6 Coin` to immediately heal all adjacent friendly units `+7 HP` and clear Mutiny/Supply penalties.
* **Corvus — Ash-Reaver:** *Raider's Horn* (`4t` CD) — Adjacent friendly units gain `+1` Mov and ignore ZoC this turn; pillaging heals `+6 HP`.
* **Solis — Sun-Lord:** *Beacon Mark* (`4t` CD) — Marks a visible enemy within `3` tiles; all attacks against it this turn ignore terrain/fort cover and gain `+20%` Atk.

### Marshal Traits (Level 2 at `6 XP`, Level 3 at `14 XP`)
* **Level 2 Choice:** `trait_castellan` (*Castellan:* Aura grants `+15%` extra Def when adjacent to a friendly Keep/Wall/Outpost) **vs.** `trait_vanguard` (*Vanguard:* Commander `+1` Mov; aura grants `+10%` extra Atk on offense).
* **Level 3 Choice:** `trait_siege_master` (*Siege Master:* Adjacent Siege units gain `+2` structure Atk & Trebuchets deploy free) **vs.** `trait_quartermaster` (*Quartermaster:* Field Reinforce adjacent to Commander costs `0` Coin & `0` Materials, Iron still applies).

---

## 3. Branching Unit Battle Honors (Rank 1 at `3 XP`, Rank 2 at `8 XP`)

Each rank increases `maxHp` by `+2` (healing `+2`) and lets the player choose 1 of 2 class honors:
* **Infantry:** R1 `honor_wallbreaker` (`+25%` structure dmg) vs `honor_stalwart` (`+15%` Def); R2 `honor_shock_blade` (`+15%` Atk) vs `honor_iron_guard` (immune to Shield Push & `-15%` ranged dmg taken).
* **Spearman:** R1 `honor_pike_wall` (`+15%` Def & `+10%` Brace) vs `honor_march_guard` (`+1` Mov); R2 `honor_phalanx_master` (`+15%` Atk) vs `honor_bulwark` (`+4` Max HP).
* **Ranged:** R1 `honor_marksman` (`+15%` Atk) vs `honor_skirmisher` (`+1` Mov); R2 `honor_deadeye` (`+15%` Overwatch dmg & armor-pierce) vs `honor_high_watch` (`+1` Sight & `+10%` Def).
* **Cavalry:** R1 `honor_shock_lancer` (`+15%` Charge Atk) vs `honor_outrider` (`+1` Sight & ignore Hills move cost); R2 `honor_barded_steed` (`+20%` Def) vs `honor_raider` (double Pillage yield & heal `+3 HP` on kill).
* **Siege:** R1 `honor_breacher` (`+2` Structure Atk) vs `honor_field_engineer` (`+1` Mov); R2 `honor_heavy_mantlet` (`+25%` Def) vs `honor_rapid_crew` (`+15%` Atk & Trebuchet splash `+2`).

---

## 4. Relic Ruins, Frontier Events & Crown Writs (v2.0 Updates)

* **12 Relic Ruins:** `ruin_sunken_armory` (`+12 Mat, +4 Iron`), `ruin_iron_foundry` (`+8 Mat, +5 Iron` + adds Iron Deposit), `ruin_charter_archive` & `ruin_war_council_hall` (immediate Doctrine Pair Draft), plus Coin/Food/Vision/Heal/Movement relics.
* **14 Frontier Events:** Retain all 14 seasonal events, scaling `evt_free_company` (`20 Coin`), `evt_iron_strike` (crucial Iron vein discovery!), and `evt_plague` (`10 Food`).
* **12 Crown Writs:** Retain all 12 Writs, scaling `writ_strongholds` (`2` Tier-2+ Keeps), `writ_iron` (`2` Iron Mines/Smelteries, `+4 Favor + 3 Iron`), `writ_muster` (`8` units), `writ_tithe` (`30 Coin -> +4 Favor`), and `writ_capture` (`+6 Favor + 3 Iron`).
