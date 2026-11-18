# Master Game Design Document: *Marchlands*

**Genre:** Turn-Based 4X Frontier Strategy  
**Platform:** Mobile-First Progressive Web App (PWA)  
**Target Session Length:** 45–60+ Minutes (Persistent Multi-Session Save & Resume)  
**Map Scale & Players:** 22x22 Grid | 4–5 Houses (1 Player + 3–4 AI Rivals)

---

## 1. High-Concept Vision & Design Pillars

*Marchlands* is a persistent, save-and-resume 4X frontier strategy game built natively for mobile browsers. Leading **House Vane** or rival noble Houses across a fog-shrouded wilderness, players carve physical settlements directly onto the terrain, adapt their strategy through randomized Royal Decree drafts, and wage a multi-session campaign for territorial supremacy.

### Core Design Pillars
1. **Physical Settlement Building:** Cities are spatial engines on the map grid rather than abstract menus. Farms, lumber yards, ironworks, and palisades occupy real tiles—creating adjacency combos, physical choke points, and raidable supply territory.
2. **Asymmetric Factions & Milestone Drafting:** Every playable House brings a distinct starting kit, while 1-of-3 randomized Royal Decree drafts prevent solved opening build orders and force adaptation to the local terrain.
3. **Strict Army Caps & Deterministic Tactics:** Each Keep supports only 3–4 active units, trading late-game unit spam for tight positional chess governed by terrain modifiers and a deterministic counter-triangle.

---

## 2. World Setting & Visual Direction

* **Grounded Medieval / Low-Fantasy Frontier:** Untamed timberlands, winding river valleys, scarce iron ridges, and weathered ancient watchtowers. Magic is absent or subtle—power comes from grain stores, forged steel, stone walls, and frontier logistics.
* **PWA-Optimized Visual Language:** Clean, high-contrast 2D top-down grid rendered with earthy topographic terrain tiles, distinct heraldic faction colors, and crisp vector iconography that remains immediately legible on phone screens without heavy 3D assets.

---

## 3. Campaign Scale & Victory Conditions

* **Map Parameters:** 22x22 square tile grid populated with 4 or 5 total Houses (Player + 3–4 AI rivals), neutral frontier villages, ancient watchtowers, relic ruins, and outlaw camps.
* **Victory Conditions (Checked at End of Turn):**
  * **Conquest:** Eliminate all rival House Capitals.
  * **Territorial Supremacy:** Control at least **65% of all settled Keeps** on the map at the end of any turn (preventing tedious late-game cleanup once a campaign is decisively won).

---

## 4. Playable Factions & AI Personalities

Every House shares the core ruleset and is defined by **1 Passive Trait**, **1 Unique Tile Building**, and **1 Signature Unit**. When controlled by the computer, each rival House executes weighted Utility AI heuristics tailored to its archetype.

| House | Archetype & Kit | Signature Unit | AI Personality |
| :--- | :--- | :--- | :--- |
| **House Vane** *(Flagship)* | **Woodland Wardens** — *Passive:* +1 Materials from untouched Forest tiles. *Building:* **Forester's Lodge** (produces Food + Materials without clearing forest). | **Longbowman** (3-tile range; +25% attack when firing from Forest or Hill tiles). | **Balanced Scout** — Prioritizes Watchtowers, forest chokepoints, and ranged positioning. |
| **House Ironhelm** | **Mountain Masons** — *Passive:* Palisades and Towers cost 30% fewer Materials. *Building:* **Deep Smeltery** (extracts double Materials + Coin on Mountain/Iron tiles). | **Oathsworn Halberdier** (+40% defense when adjacent to friendly walls or Keeps). | **Defensive Turtle** — Fortifies borders early and punishes overextended attackers. |
| **House Aurelia** | **River Covenant** — *Passive:* +1 Coin per river-adjacent tile improvement. *Building:* **River Tollhouse** (generates +3 Coin and acts as a bridge for friendly units). | **Gilded Lancer** (Heavy Cavalry; gains +1 movement when starting its turn near a river). | **Economic Expansionist** — Rushes neutral villages and hoards Coin for Royal Decrees. |
| **House Corvus** | **Ashland Raiders** — *Passive:* Pillaging enemy improvements or clearing Outlaw Camps yields double Coin and Materials. *Building:* **War Camp** (+1 Army Cap for its Keep). | **Dusk Outrider** (Light Cavalry; ignores forest movement penalties and can disengage after attacking). | **Aggressive Raider** — Hunts Outlaw Camps early and raids undefended outer farms. |
| **House Solis** | **Highland Sun-Sworn** — *Passive:* All units and Keeps gain +1 sight radius. *Building:* **Signal Bastion** (clears a 5x5 fog radius and boosts adjacent units' attack by +15%). | **Vanguard Spearman** (Anti-cavalry phalanx; immune to flanking bonuses). | **Opportunistic Tactician** — Snipes weakened units and contests central landmarks. |

---

## 5. Core Gameplay Loops & Economy

### Turn-by-Turn Structure
1. **Harvest & Upkeep Phase:** Each Keep tallies **Food**, **Materials**, and **Coin** from its active tiles and adjacency bonuses. Tier-2 and signature units deduct Coin upkeep. Surplus Food fills the Keep's Growth Bar.
2. **Command Phase (Player):** Spend Materials to construct tile buildings or train units at Keeps; move and attack with active units; resolve triggered Milestone Drafts.
3. **Auto-Save & Rival Turn:** Full game state commits immediately to `IndexedDB`, followed sequentially by each AI House's turn.

### Tactical Three-Resource Loop

| Resource | Primary Sources | Primary Sinks | Strategic Tension |
| :--- | :--- | :--- | :--- |
| **Food** | Farms, River Fisheries, Forester's Lodges | Keep Level-Ups (Growth Bar), Peaceful Annexations | Pushes border expansion from 3x3 to 5x5 and triggers Milestone Drafts. |
| **Materials** | Lumber Mills, Quarries, Iron Mines | Tile Buildings, Palisades, Unit Recruitment | Forces a direct choice every turn between economic infrastructure and military troops. |
| **Coin** | Keeps, Tollhouses, Markets, Outlaw Bounties | Elite Unit Upkeep, Draft Rerolls, Village Annexations | Caps late-game elite unit spam; expanding without Coin income stalls your army. |

---

## 6. Physical Settlement & Adjacency Engine

### Keep Borders & Leveling
* **Tier-1 Keep:** Claims a **3x3 territory** (8 workable tiles around the Keep).
* **Tier-2 Stronghold:** Reached upon filling the Keep's Food Growth Bar; expands borders to **5x5** (24 workable tiles), increases Army Cap from 3 to 4, and triggers a Royal Decree Draft.

### Spatial Adjacency Matrix

| Improvement | Placement Requirement | Adjacency Effect |
| :--- | :--- | :--- |
| **Farm** | Plains / Grassland | **+2 Food** when placed adjacent to a River tile. |
| **Lumber Mill** | Plains / Forest Edge | **+2 Materials** when placed adjacent to 2 or more Forest tiles. |
| **Smithy** | Open Keep Tile | Unlocks Heavy Infantry/Cavalry recruitment at that Keep when adjacent to both an **Iron Mine** and a **Lumber Mill**. |
| **Palisade Wall / Watchtower** | Border Tile | Occupies the tile, blocks enemy movement across it, and grants **+30% defense** to friendly units standing behind it. |

---

## 7. Milestone Drafting (1-of-3 Royal Decrees)

* **Anti-Softlock Baseline:** Every House begins Turn 1 with **Basic Farm** and **Timber Camp** unlocked so early RNG never traps its economy.
* **Draft Trigger:** Whenever any Keep levels up—or whenever the Royal Treasury accumulates a Coin milestone—a **1-of-3 Royal Decree Draft** modal opens.
* **Draft Pool Categories:**
  * **Infrastructure Blueprints:** *Iron Mine, Smithy, Palisade Wall, Marketplace, Granary, Watchtower.*
  * **Military Unlocks:** *Crossbowmen, Heavy Knights, Siege Rams, Field Medics.*
  * **Kingdom Doctrines (Passives):** *Crop Rotation (+1 Food per Farm), Forced March (+1 Infantry Movement), Veteran Drill (+15% Unit Attack), Supply Lines (-1 Coin Upkeep).*

---

## 8. Tactical Combat & Frontier Map Ecosystem

### Strict Keep Army Caps & Counter-Triangle
* **Army Caps:** A Tier-1 Keep supports **3 active units**; a Tier-2 Stronghold supports **4 active units**. Keeps at capacity cannot train new units until an existing unit is lost or disbanded.
* **Deterministic Counter-Triangle:** Combat resolves deterministically using Attack vs. Defense scaled by current unit HP percentage, modified by a 40% advantage triangle:
  * **Spearmen** deal **+40% damage** to **Cavalry**.
  * **Cavalry** deal **+40% damage** to **Archers & Siege**.
  * **Archers & Infantry** deal **+40% damage** to **Spearmen**.
* **Terrain Modifiers:**
  * **Hills:** +20% defense and +1 attack range for ranged units.
  * **Forests:** +25% defense and blocks Cavalry movement/charges.

### Neutral Map Features (22x22 Frontier)
1. **Independent Frontier Villages:** Neutral settlements scattered across the map. Players can capture them militarily or **annex them peacefully** by spending Food + Coin to convert them immediately into a new Tier-1 Keep with intact buildings.
2. **Ancient Watchtowers:** Neutral stone towers on elevated tiles. Moving a unit onto one permanently clears a **7x7 fog radius** around it.
3. **Relic Ruins:** Weathered ruins that grant an immediate burst of Coin, Materials, or a free **Royal Decree Draft** when explored.
4. **Outlaw Camps:** Hostile bandit encampments guarding high-yield Iron Ridges or Relic Ruins. Clearing a camp awards a lump-sum Coin bounty and opens surrounding high-value tiles for settlement.

---

## 9. PWA Technical Architecture & Multi-Session Persistence

* **Core Stack:** React + TypeScript + Vite + Tailwind CSS + `vite-plugin-pwa`, paired with `idb` for asynchronous `IndexedDB` persistence.
* **Bulletproof Multi-Session Save System:**
  * Represent the entire game state as a single serializable JSON tree (`mapGrid`, `houses`, `keeps`, `units`, `unlockedDecrees`, `turnNumber`, `rngSeed`).
  * Auto-save asynchronously to `IndexedDB` after **every player action and AI turn**, invoking `navigator.storage.persist()` on launch so mobile browsers do not evict save data under storage pressure.
  * Provide **3 Manual Save Slots** plus **Export/Import Save JSON** strings in the pause menu as a zero-server backup.
* **Mobile-First Touch Controls:**
  * **Two-Tap State Machine:** Tap a unit or tile once to inspect stats/actions in a bottom drawer; tap a highlighted valid target tile to execute movement, combat, or construction.
  * **Viewport Hardening:** Pinch-and-pan map container with `user-scalable=no`, `touch-action: manipulation` (preventing accidental double-tap zoom), and safe-area inset padding for notched phones.
