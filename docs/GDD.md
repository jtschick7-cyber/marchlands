Spec Version: 2.0

# Master Game Design Document: *Marchlands v2.0*

**Genre:** Turn-Based 4X Frontier Strategy  
**Platform:** Mobile-First Progressive Web App (PWA)  
**Target Session Length:** 90–150+ Minutes (Persistent Multi-Session Save & Resume)  
**Map Scale & Players:** `34×34` Grand March default (`22×22` Compact & `28×28` Standard presets) | 4–5 Houses (1 Player + 3–4 AI Rivals)

---

## 1. High-Concept Vision & Design Pillars

*Marchlands v2.0* is a persistent, save-and-resume medieval frontier strategy game built natively for mobile browsers. Leading one of five noble Houses across a vast `34×34` fog-shrouded frontier, players carve multi-tier settlements across every terrain type, fight over scarce **Iron ridges**, construct linked stone border walls and road networks, lead armies with unique **Lord-Commanders**, and commit to bold mutually-exclusive **Royal Doctrines** across 100+ turn campaigns.

### Core Design Pillars
1. **Whole-Map Spatial Building & Multi-Tier Strongholds:** Every terrain tile supports meaningful improvements, roads, or upgrades. Keeps evolve across **3 Tiers (`3×3 → 5×5 → 7×7`)** with local military unlock buildings and Level-2 tile upgrades, turning each settlement into a distinct Forge Keep, Muster Keep, or Trade Hub.
2. **True Four-Resource Scarcity (`Food`, `Materials`, `Iron`, `Coin`):** Scarce `Iron` gates armored units, Stone Walls, Citadels, and elite reinforcements, while building Coin upkeep, paid Field Reinforcement, and Winter Provisioning keep economic choices weighty past Turn 100.
3. **Combined-Arms Deterministic Tactics & Lord-Commanders:** Strict Keep Army Caps trade late-game unit spam for tight positional chess featuring a closed 4-way counter loop, slower `3–4` hit tactical trades, class tactical actions (Phalanx Brace, Shield Push, Lance Charge, Overwatch, Trebuchet Deploy), linked border walls, and 1 grounded **Lord-Commander** per House.

---

## 2. Campaign Scale, Game Modes & Victory Conditions

* **Map Presets (`GameState.mapPreset`):**
  * **Grand March (`'grand'`, `34×34`, default):** `1,156` tiles, `20` Frontier Villages (5-House), `10–12` contested Iron Deposits, `6` Ancient Watchtowers, `12` Relic Ruins, `8` Outlaw Camps, and `1` **Central Ruined High Seat**. Target Dominion length: `85–130` turns.
  * **Standard (`'standard'`, `28×28`):** `784` tiles, scaled landmarks and victory bars.
  * **Compact (`'compact'`, `22×22`):** `484` tiles, faster campaigns.
* **Game Modes (`GameState.mode`):**
  * **Dominion (`'dominion'`):** Open-ended campaign won via Conquest, Territorial Supremacy, or Regent's Mandate.
  * **Chronicle (`'chronicle'`):** Scored campaign with selectable length (`48`, `72`, or `108` turns — 4, 6, or 9 full seasonal years; default `72` turns). Conquest still ends early.

| Condition | Grand (`34×34`) Dominion | Chronicle Mode |
| :--- | :---: | :---: |
| **Conquest:** Last living House (`0` Keeps eliminates a House) | ✅ | ✅ *(ends early)* |
| **Supremacy:** Own `≥ 75%` of all owned Keeps **and** `≥ 10` Keeps (`≥ 8` in 4-House; scaled on smaller presets) | ✅ | ❌ |
| **Regent's Mandate:** Hold `≥ 60` Favor, `≥ 6` Keeps, and `≥ 2` Tier-3 Citadels for `6` consecutive turns | ✅ | ❌ |
| **Score at Turn Limit (`48` / `72` / `108`):** Highest score wins | ❌ | ✅ |

* **Central Ruined High Seat:** Neutral Tier-2 fortress (`42 HP`, `6` Def, `+0.35` cover) near map center. Once captured, acts as a normal Tier-2 Keep (upgradable to Tier 3) granting `+3 Coin/turn`, `+1 Favor` on even turns, and `+15` one-time Chronicle Landmark score. It is **never** an auto-win or Regent's Mandate shortcut.

---

## 3. Playable Factions, Unique Kits & Lord-Commanders

| House | Passive & Unique Building (Lv1 → Lv2) | Signature Unit | Lord-Commander & 4-Turn Active Skill |
| :--- | :--- | :--- | :--- |
| **House Vane** *(Woodland Wardens)* | `+1 Mat` per Forest tile. **Forester's Lodge → Warden's Enclave** (Forest: Food + Mat + ambush cover). | **Longbowman** (Range 3; `+10%` Atk in Forest/Hills; Barracks). | **Warden-Marshal — *Warden's Volley*:** Reveals `7×7`; allies within 2 tiles ignore Forest move cost & gain `+15%` Forest/Hills Atk; ranged allies within 2 tiles gain `+1` Range & arm **Overwatch** even after acting. |
| **House Ironhelm** *(Mountain Masons)* | Palisades/Watchtowers `-30%` Mat. **Deep Smeltery → Runed Furnace** (Mountain/Iron: high Iron + Coin; satisfies Smithy). | **Oathsworn Halberdier** (`+40%` Def near friendly Walls/Keeps; Barracks). | **Stone-Thane — *Hold the Line*:** Adjacent allies immediately **Fortify** (even if acted), gain `+25%` Def, and heal `+4 HP`. |
| **House Aurelia** *(River Covenant)* | `+1 Coin` per river-adjacent improvement. **River Tollhouse → Grand Customhouse** (River bridge + high Coin). | **Gilded Lancer** (Heavy Cav; `+1` Mov near River; Smithy Combo). | **Grand Syndic — *Golden Banner*:** Spend `6 Coin` to heal all adjacent allies `+7 HP` and cleanse Mutiny/Supply penalties. |
| **House Corvus** *(Ashland Raiders)* | Double Coin & Mat from Pillaging & Outlaw Camps. **War Camp → Reaver Stockade** (`+1` Keep Cap; max 1/Keep, 3/House). | **Dusk Outrider** (Light Cav; ignores Forest & ZoC; disengage; Barracks). | **Ash-Reaver — *Raider's Horn*:** Adjacent allies gain `+1` Mov and ignore ZoC this turn; pillaging heals `+6 HP`. |
| **House Solis** *(Highland Sun-Sworn)* | `+1` sight radius for all units & Keeps. **Signal Bastion → Solar Citadel Spire** (`7×7` sight + adjacent Atk aura). | **Vanguard Spearman** (Flank-immune; `+1` Sight; Barracks). | **Sun-Lord — *Beacon Mark*:** Marks a visible enemy within 3 tiles; attacks against it ignore terrain/fort cover and gain `+20%` Atk this turn. |

---

## 4. Core Loops: 4-Resource Economy, Keep Tier 3 & Upgrades

* **Four Resources:** `Food` (per-Keep growth bars & Winter Provisioning), `Materials` (construction, Roads, Outposts, levies, repairs), `Iron` (armored/siege forging, Stone Walls, Citadels, heavy Reinforce), and `Coin` (army wages, advanced building upkeep, annexations, Reinforce, ransoms).
* **Whole-Map Terrain Building:** Plains (Farm, Market, Granary, Barracks, Smithy, Siege Workshop), Forest (**Logging Camp** or **Clear Timber** `4 Coin → Plains + 6 Mat`), Hills (**Stone Quarry**, **Highland Pasture**, Iron Mine, Watchtower, Barracks/Smithy), River (**River Fishery**, **Stone Bridge**, Tollhouse), Mountain (Iron Mine, **Peak Beacon**, Deep Smeltery).
* **Roads & Frontier Outposts:** Cheap **Road overlays** (`3 Mat`, preserves tile building) enable `34×34` logistics (`1` Mov cost + `+1` road travel bonus). **Frontier Outposts** (max `2` per House, `12 Mat + 12 Coin`) claim neutral `3×3` resource pockets (Iron ridges / river chokes), provide Winter shelter & reinforcement, and cannot train units.
* **Keep Tiers & Specializations:**
  * **Tier 1 (`3×3`, `36 HP`, `Cap 3`):** Grows at `30 Food`.
  * **Tier 2 (`5×5`, `48 HP`, `Cap 4`):** Picks 1 of 4 specializations (*Garrison Seat*, *Market Town*, *Granary Seat*, ***Forge Seat***). Upgrades to Tier 3 at `90 Food + 10 Iron`.
  * **Tier 3 Grand Citadel (`7×7`, `64 HP`, `Cap 5`):** Gains Range-2 Arrow Slits volley and picks 1 of 4 **Citadel Charters** (*War College*, *Grand Exchange*, *Royal Bastion*, *High Armory*).
* **Deterministic Progression vs. Exclusive Royal Decrees:** Core units & buildings unlock deterministically through Keep Tiers and local Keep military buildings (**Barracks**, **Smithy**, **Siege Workshop**). **Royal Decrees** become **6–8 weighty decisions per game** drawn from **8 mutually exclusive Doctrine Pairs**—choosing one side permanently locks its rival.

---

## 5. Combat, Fortifications, Seasons & Crown

* **Closed 4-Way Counter Loop + Siege:** `Spearman > Cavalry > Ranged & Siege`, `Infantry > Spearman`, `Ranged > Infantry` (Crossbows also pierce `30%` of Defense on `Def ≥ 5` targets), `Siege > Fortifications & Keeps` (non-siege deals `50%` vs structures).
* **Tactical Depth:** `COMBAT_DAMAGE_SCALE = 2.2` (`3–4` hit trades), One-Shot Protection, River attack `-25%`, Hills downhill `+15%`, Class Tactical Actions (**Phalanx Brace**, **Shield Push**, **Lance Charge**, **Overwatch**, **Trebuchet Deploy**), and **Branching Battle Honors** at Rank 1 and Rank 2.
* **Fortifications:** Additive Wall cover (`+20%` Palisade / `+30%` Stone Wall on top of terrain), `-25%` incoming ranged damage, flank immunity, **orthogonal Wall Linking** blocking diagonal passage, `2` melee spike damage vs unmanned walls, and **Watchtowers → Stone Bastion Towers** (`7×7` sight, buildable 1 tile outside border, `+1` ranged range, Winter shelter, automatic `3`-dmg Bastion border volley).
* **Seasons & Crown:** 3-turn seasons with **Winter Provisioning** (Granaries & Food balance protect armies in Winter), 14 Frontier Events, 12 Crown Writs, Crown Audience (including `5 Favor → +6 Iron` Emergency Iron Shipment), and Regent's Mandate.
