Spec Version: 0.3

# Artifact #2: Marchlands Content & Flavor Catalog

This catalog defines the complete narrative and mechanical content pools for *Marchlands*: **25 Royal Decrees**, **12 Relic Ruin Encounters**, **50 House-Specific Settlement Names** (10 per House), **14 Frontier Events**, and **12 Crown Writs**. All entries match the grounded, low-fantasy medieval frontier tone and map directly to the game engine's state schema.

---

## 1. The 25 Royal Decrees (Milestone Draft Pool)

Every House starts Turn 1 with **Farm**, **Lumber Mill**, **Militia**, **Spearman**, **Sapper Crew**, and its faction-unique building and signature unit unlocked. **House Aurelia** also starts owning `decree_iron_prospecting` (*Royal Mining Charter*) and `decree_master_smiths` (*Guild of Master Smiths*), which are removed from Aurelia's draft pool and do **not** count toward its Chronicle decree score (`startingDecreeCount = 2`).

* **Sapper Crew (Base Siege Unit, Turn 1):** *"Mantlets, mattocks and fire-hardened ladders — no wall on the frontier was ever built tall enough."*
* **Draft Category Guarantee & Faction Exclusions:** `DecreeDef` supports optional `excludedHouseIds?: HouseId[]`. Redundant military charters are excluded from their House's draft pool (`decree_fletchers_guild`: `['vane']`; `decree_chivalric_order`: `['aurelia']`) and do not count toward its eligible pool (`24` eligible for Vane & Aurelia; `25` eligible for Ironhelm, Corvus & Solis). Each 3-card draft hand offers **1 Infrastructure Blueprint**, **1 Military Charter**, and **1 Kingdom Doctrine** drawn with the seeded PRNG from that House's *unowned eligible* decrees in each category. When a category runs out, its slot fills from remaining categories in priority order **Doctrine → Infrastructure → Military**, with no duplicates in one hand. **Royal Reroll** (3 Favor) follows the same rule and may offer cards from the previous hand again.

### Category A: Infrastructure Blueprints (6 Decrees)

| ID | Decree Title | Flavor Lore | Exact Mechanical Effect |
| :--- | :--- | :--- | :--- |
| `decree_iron_prospecting` | **Royal Mining Charter** | *"He who controls the iron veins of the ridge commands the rhythm of every forge in the valley."* | Unlocks construction of the **Iron Mine** improvement (`8 Mat`, requires Iron Deposit, `+3 Materials/turn`). |
| `decree_master_smiths` | **Guild of Master Smiths** | *"Bellows fed by river timber and ridge ore turn raw pig-iron into plate fit for noble shock cavalry."* | Unlocks construction of the **Smithy** improvement (`10 Mat`, `+1 Materials/turn`; enables **Knight** / **Gilded Lancer** training when adjacent to both an Iron Mine (or Deep Smeltery) and a Lumber Mill). |
| `decree_timber_palisades` | **Border Palisade Edict** | *"Sharpened oak trunks sunk six feet deep have broken more warbands than gold ever bought."* | Unlocks construction of the **Palisade Wall** (`5 Mat` / `3 Mat` for Ironhelm; blocks enemy unit movement and grants `+30% Defense` to friendly units standing **on** the tile). |
| `decree_frontier_towers` | **Watchmen of the March** | *"A single beacon lit upon a stone tower warns the valley three days before riders crest the hills."* | Unlocks construction of the **Watchtower** (`7 Mat` / `5 Mat` for Ironhelm; permanently reveals a 5x5 fog radius and grants `+30% Defense`). |
| `decree_chartered_markets` | **Chartered Trade Markets** | *"Where roads cross and grain wagons gather, the Crown's tax collectors are never far behind."* | Unlocks construction of the **Market** (`8 Mat`, `+3 Coin/turn`, plus `+1 Coin/turn` per adjacent Farm or River tile). |
| `decree_stone_granaries` | **Tithe Granaries** | *"Dry cellars and salted stores ensure a hard frost breeds loyalty rather than famine."* | Unlocks construction of the **Granary** (`8 Mat`, `+2 Food/turn`, plus `+1 Food/turn` to every adjacent Farm or Forester's Lodge). |

### Category B: Military Charters (5 Decrees)

| ID | Decree Title | Flavor Lore | Exact Mechanical Effect |
| :--- | :--- | :--- | :--- |
| `decree_fletchers_guild` | **Fletchers' Guild** | *"Seasoned ash shafts and goose-feather fletching turn woodsmen into disciplined volley archers."* | Unlocks recruitment of the **Archer** unit (`10 Mat`, `1 Coin upkeep`, Ranged class, Range 2). *Excluded for House Vane (`excludedHouseIds: ['vane']`).* |
| `decree_steel_arbalests` | **Steel Arbalests** | *"A windlass crossbow requires half the training of a warbow and punches cleanly through shield walls."* | Unlocks recruitment of the **Crossbowman** unit (`14 Mat`, `2 Coin upkeep`, Ranged class, Range 2, High Attack). |
| `decree_sword_guilds` | **Chartered Men-at-Arms** | *"Mail hauberks, poleaxes, and heavy longswords turn seasoned footmen into wall-breakers who cleave straight through pike lines."* | Unlocks recruitment of the **Men-at-Arms** unit (`12 Mat`, `1 Coin upkeep`, `infantry` class, counters `spearman`). |
| `decree_chivalric_order` | **Chivalric Order** | *"Barded warhorses and heavy lances shatter archer lines before a second volley can be loosed."* | Unlocks recruitment of the **Knight** unit (`18 Mat`, `3 Coin upkeep`, Cavalry class; requires a Keep with an active Smithy adjacency combo). *Excluded for House Aurelia (`excludedHouseIds: ['aurelia']`).* |
| `decree_siege_engineers` | **Siege Engineers** | *"Iron-capped battering rams wheeled under timber roofs reduce stubborn palisades to splinters."* | Unlocks recruitment of the **Siege Ram** unit (`16 Mat`, `2 Coin upkeep`, Siege class; `8 Attack` vs. Keeps, Palisades, and Watchtowers). |

### Category C: Kingdom Doctrines & Passives (14 Decrees)

| ID | Decree Title | Flavor Lore | Exact Mechanical Effect |
| :--- | :--- | :--- | :--- |
| `decree_crop_rotation` | **Three-Field Rotation** | *"Resting one strip in clover while sowing two in barley doubles the yield of river loam."* | All existing and future **Farms** and **Forester's Lodges** generate `+1 Food/turn`. |
| `decree_coppice_forestry` | **Coppice Forestry** | *"Harvesting timber in managed cycles keeps the sawmills fed without stripping the canopy bare."* | All existing and future **Lumber Mills** generate `+1 Materials/turn`. |
| `decree_forced_march` | **Forced March** | *"Light packs and double-time drums push foot soldiers across leagues of mud before dusk."* | All `infantry` and `spearman` units gain `+1 Movement` (does not apply to `cavalry`, `ranged`, or `siege`). |
| `decree_veteran_drill` | **Veteran Drill** | *"Daily spear-line formations on the muster field steady green levies under pressure."* | All friendly military units gain `+15% Attack` during primary strikes and retaliations. |
| `decree_shield_wall` | **Locked Shield Wall** | *"Overlapping oak boards turn a spear line into a mobile wooden rampart."* | Friendly `spearman` and `infantry` units gain `+20% Defense` when adjacent to at least one other friendly unit. |
| `decree_supply_lines` | **Quartermaster Ledger** | *"Standardized wagon manifests cut spoilage and graft across every garrison."* | Reduces the per-turn **Coin upkeep** of all friendly units by `1` (to a minimum of `0 Coin/turn`). |
| `decree_crown_envoys` | **Crown Envoys** | *"Silken banners, salt gifts, and royal tax exemptions persuade frontier elders to kneel without bloodshed."* | Reduces the cost of **Peaceful Village Annexation** by `40%` (from `12 Food + 15 Coin` down to `7 Food + 9 Coin`). |
| `decree_border_levies` | **Frontier Muster** | *"Every hearth in a newly raised keep owes forty days of spear service to the banner."* | Training `militia` and `spearman` units costs `2 fewer Materials` (minimum `4 Mat`). |
| `decree_field_surgeons` | **Field Chirurgeons** | *"Boiled linen, willow bark, and cautery irons keep seasoned soldiers alive between skirmishes."* | Friendly units that end their turn without moving or attacking heal `6 HP` instead of the standard `3 HP`. |
| `decree_highland_scouts` | **Outrider Cartography** | *"Surveyors riding ahead of the column chart every ridge, ford, and ambush hollow."* | All friendly units gain `+1 Sight Radius`, and `cavalry` units gain `+15% Attack` when attacking on Plains tiles. |
| `decree_toll_roads` | **Royal Road Tolls** | *"Cobbled milestones and guarded river ferries turn domestic travel into steady silver."* | Every **Keep** and **Stronghold** generates `+2 Coin/turn`. |
| `decree_salvage_crews` | **Battlefield Salvage** | *"Stripping shattered shields, arrowheads, and felled timbers turns victory into immediate material."* | Defeating an enemy unit or clearing an **Outlaw Camp** awards `+4 Materials` directly to your treasury. |
| `decree_fletcher_volleys` | **Bodkin Quivers** | *"Narrow, hardened iron tips find the seams in heavy mail and tower shields."* | Friendly `ranged` units increase their Counter-Triangle bonus against `spearman` units from `+40%` to `+65%`. |
| `decree_masonry_reinforcement` | **Mortar & Stonework** | *"Packing timber palisades with river stone stops battering rams dead in their tracks."* | Friendly **Keeps**, **Palisades**, and **Watchtowers** grant `+45% Defense` (up from `+30%`/`+35%`) and take `25% less damage` from `siege` units. |

---

## 2. Relic Ruin Discovery Encounters (12 Events)

When a unit moves onto an unexplored **Relic Ruin** tile, the ruin is marked `landmarkCleared = true`, a short modal/toast displays the narrative vignette below, and the reward is applied immediately.

| ID | Ruin Title | Discovery Vignette | Immediate Mechanical Reward |
| :--- | :--- | :--- | :--- |
| `ruin_sunken_armory` | **The Sunken Armory** | *"Beneath a collapsed stone lintel, your scouts unearth oiled crates of pre-collapse broadheads and forged iron ingots."* | Grants `+14 Materials` immediately. |
| `ruin_tax_vault` | **The Old Mint Vault** | *"Behind a rusted iron grate in a ruined customs house lie stacked chests of stamped silver crowns."* | Grants `+18 Coin` immediately. |
| `ruin_monastic_cellar` | **Abbey Cellars** | *"Sealed casks of smoked grain, dried orchard fruit, and salted stores remain untouched beneath the roofless cloister."* | Grants `+14 Food` to the nearest friendly Keep's Growth Bar. |
| `ruin_charter_archive` | **The Burnt Chancellery** | *"Inside a fireproof bronze reliquary, your chroniclers recover intact administrative charters from the First Kingdom."* | Triggers an immediate **1-of-3 Royal Decree Draft**. |
| `ruin_surveyors_cairn` | **Surveyor's Cairn** | *"Etched slate maps atop an ancient boundary cairn reveal every river bend and mountain pass for leagues around."* | Permanently clears a **9x9 fog radius** centered on the ruin tile. |
| `ruin_mercenary_cache` | **Free-Company Hoard** | *"A forgotten outlaw stash hidden inside a hollow watchtower yields both minted coin and usable timber."* | Grants `+10 Coin` and `+8 Materials`. |
| `ruin_apothecary_shrine` | **Hearth-Warden's Shrine** | *"Clean spring water and preserved medicinal herbs restore your weary vanguard to full fighting strength."* | Heals the discovering unit to `100% Max HP` and grants `+5 Food`. |
| `ruin_iron_foundry` | **Collapsed Bloomery** | *"Excavating an ancient hillside furnace exposes rich, partially smelted iron blooms ready for the anvil."* | Grants `+16 Materials` and converts the tile into an Iron Deposit (`hasIronDeposit = true`). |
| `ruin_wayfarer_tomb` | **Barrow of the March-Lord** | *"A weathered stone effigy clutches an engraved war-horn and a purse of tribute silver."* | Grants `+12 Coin` and restores the discovering unit's movement (`hasMoved = false` for this turn). |
| `ruin_seed_vault` | **The Root-Cellar of Oakhaven** | *"Clay amphorae sealed with beeswax hold hardy heirloom seed stock suited for frontier soil."* | Grants `+10 Food` to the nearest Keep and `+6 Coin`. |
| `ruin_beacon_rotunda` | **Collapsed Signal Rotunda** | *"Polished bronze mirrors salvaged from the dome allow your scouts to spot movement across the valley."* | Permanently clears a **7x7 fog radius** and grants `+8 Coin`. |
| `ruin_war_council_hall` | **The Pact Stone** | *"Carved into the monolith are the ancient laws of frontier governance, inspiring your commanders."* | Triggers an immediate **1-of-3 Royal Decree Draft** and grants `+5 Coin`. |

---

## 3. Thematic Settlement Name Pools (10 Names per House)

Entry **#1** for each House is always assigned to its **Starting Capital**. Entries **#2–#10** are assigned sequentially whenever that House peacefully annexes or militarily captures a Frontier Village.

### House Vane (Woodland Wardens)
1. **Briarwatch** *(Capital)*
2. Greenhollow
3. Fernford
4. Mossgate
5. Thornwick
6. Elderwood
7. Bramblekeep
8. Willowmere
9. Ashgrove
10. Hart's Rest

### House Ironhelm (Mountain Masons)
1. **Anvilgard** *(Capital)*
2. Craghold
3. Deepdelve
4. Ironford
5. Stonebridge
6. Hammerfall
7. Grimpeak
8. Orehaven
9. Bastion Ridge
10. Slatewatch

### House Aurelia (River Covenant)
1. **Goldwater** *(Capital)*
2. Tollbridge
3. Silverford
4. Clearwater
5. Crownhaven
6. Ferrygate
7. Amberstrand
8. Minted Reach
9. Sunbrook
10. Pearlwater

### House Corvus (Ashland Raiders)
1. **Cinderhold** *(Capital)*
2. Blackbarrow
3. Ashfort
4. Raven's Roost
5. Scorchvale
6. Duskwatch
7. Ironbrand
8. Bleakspire
9. Bloodford
10. Embergate

### House Solis (Highland Sun-Sworn)
1. **Dawnspire** *(Capital)*
2. Suncrest
3. Highbeacon
4. Solace Keep
5. Brightridge
6. Daybreak
7. Goldcrest
8. Starwatch
9. Zenith Hold
10. Lightford

---

## 4. Frontier Events (14 Seasonal Events)

At the start of each new season (Turns 4, 7, 10…), one Frontier Event is drawn using the seeded PRNG (no repeat within 4 seasons).

| ID | Event Title | Seasons | Target | Vignette | Effect |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `evt_royal_levy` | **Royal Levy** | Any | All Houses | *"Sealed writs from the Regent's Exchequer arrive by hard-ridden courier, demanding silver for the capital's coffers."* | Choose: pay `min(20, floor(coin × 0.2))` Coin **or** lose `2` Favor. |
| `evt_bountiful_harvest` | **Bountiful Harvest** | Autumn | All Houses | *"Warm late rains and fat barley heads fill every threshing floor before the first frost."* | `+4` Food to every Keep's growth bar. |
| `evt_blight` | **Blight in the Fields** | Spring, Summer | Leader | *"Rust-spotted stalks and sour damp creep through the richest valley plots, sparing no granary."* | Leader's Farms `−1` Food for `3` turns. |
| `evt_hard_frost` | **The Long Frost** | Winter | All Houses | *"North winds lock the river fords in iron ice, biting deep into every camp outside stone walls."* | Winter attrition is `4` instead of `2` this season. |
| `evt_outlaw_resurgence` | **Outlaw Resurgence** | Any | Map | *"Broken men and deserters gather beneath tattered black banners in the unclaimed timberlands."* | Spawn `1` Outlaw Camp (with Bandit) on an empty, unowned, passable tile `≥ 4` tiles from any Keep. Skip if none qualifies. |
| `evt_free_company` | **A Free Company Rides North** | Summer, Autumn | Trailing | *"Ash-stained pikes and seasoned sellswords offer their blades to the House most hungry for steel."* | Choose: hire a **Free Company Spearman** (Spearman stats, `+2` Atk) for `15` Coin, **or** decline. Doesn't count toward Army Cap, can't be re-homed, costs `1` Coin upkeep, disbands if orphaned. |
| `evt_tournament` | **The Regent's Tournament** | Summer | All Houses | *"Pavilion tents rise along the King's Road, where gilded lances win more standing than quiet thrift."* | Choose: pay `10` Coin for `2` Favor, or decline. |
| `evt_plague` | **Lowland Fever** | Any except Winter | Most Keeps | *"Marsh mist settles over crowded ditches, spoiling stored grain and thinning the watch."* | Each Keep of the House with the most Keeps loses `6` growth-bar Food (minimum `0`). |
| `evt_pilgrims` | **Pilgrim Caravans** | Spring, Summer | All Houses | *"Shrine-bound wagons swell the market roads, leaving stamped silver at every tollgate."* | `+2` Coin per Market owned (once). |
| `evt_timber_boom` | **Timber Boom** | Spring, Autumn | All Houses | *"Dry riverbeds and steady winds let sawyers haul twice the heartwood out of the ridges."* | Lumber Mills `+1` Materials for `3` turns. |
| `evt_iron_strike` | **A New Vein Struck** | Any | Map | *"A rockslide on the high crags lays bare a gleaming seam of grey bog-iron."* | One unowned Hills tile gets `hasIronDeposit = true` and is revealed to all Houses. |
| `evt_deserters` | **Grumbling in the Ranks** | Any | Highest Upkeep | *"Sullen captains count copper at the pay-table while boots rot in the mud."* | Choose: pay `2×` this turn's upkeep in Coin, **or** highest-upkeep unit takes `6` true damage (can't take it below `1` HP). |
| `evt_inspection` | **Royal Inspection** | Any | Lowest Favor | *"A Regent's herald rides into the lesser court, noting dutiful service overlooked by louder rivals."* | `+3` Favor (catch-up). |
| `evt_fair_season` | **Fair Season** | Summer, Autumn | All Houses | *"Clear passes and calm waters bring merchant trains from the southern cities."* | Markets `+2` Coin for `3` turns. |

---

## 5. Crown Writs (12 Public Objectives)

Published in sets of `3` at Turn 3 and every `6` turns thereafter (no repeat until `2` publications have passed). First-come reward; expires on the next publication.

| ID | Writ Title | Flavor Line | Requirement | Reward |
| :--- | :--- | :--- | :--- | :--- |
| `writ_clear_camp` | **Rid the Roads of Brigands** | *"Hang the highwaymen from their own ridge-poles and the Crown will remember your zeal."* | Clear an Outlaw Camp | `4` Favor + `6` Coin |
| `writ_annex` | **Bring the Elders to Heel** | *"Unclaimed hamlets pay no tax; bring their hearths under a chartered banner."* | Annex or capture a Frontier Village | `5` Favor |
| `writ_watch` | **Light the Beacons** | *"Two stone towers burning through the dusk prove your wardens hold the high passes."* | Hold units on `2` Ancient Watchtowers at the same time | `4` Favor |
| `writ_strongholds` | **Raise the Banners** | *"Timber palisades are for squatters; the Council honors Houses that raise stone strongholds."* | Own `2` Tier-2 Keeps | `5` Favor |
| `writ_victories` | **Blood the Levies** | *"Letters of commendation are written in enemy steel, not parchment."* | Destroy `3` enemy units | `4` Favor + `6` Mat |
| `writ_markets` | **Fill the Royal Coffers** | *"Chartered markets keep coin moving north and silver flowing back to the Regent."* | Own `2` Markets | `3` Favor + `8` Coin |
| `writ_relics` | **Recover the Old Charters** | *"Beneath fallen arches lie seals older than the current dynasty; bring them to light."* | Explore `2` Relic Ruins | `4` Favor |
| `writ_muster` | **Show the Crown's Strength** | *"Parade six banners under arms so every rival counts your spears twice."* | End a turn with `6` or more units | `3` Favor |
| `writ_tithe` | **Pay the Regent's Tithe** | *"Gold speaks louder than oaths when the Exchequer calls the roll."* | Voluntarily pay `20` Coin (button on Writ card) | `3` Favor |
| `writ_iron` | **Secure the Iron Veins** | *"He who feeds the royal smithies holds the Council's ear."* | Own `2` Iron Mines (Deep Smelteries count) | `4` Favor |
| `writ_raze` | **Break the Usurper's Walls** | *"Tear down a rival's timberwork and let the wind whistle through his border."* | Raze an enemy Palisade or Watchtower | `3` Favor + `5` Mat |
| `writ_capture` | **Punish the Disloyal** | *"Seize a rival's stronghold and the Regent will call it justice."* | Capture an enemy Keep | `6` Favor |
