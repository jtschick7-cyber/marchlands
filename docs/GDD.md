Spec Version: 0.2

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
3. **Strict Army Caps & Deterministic Tactics:** Each Keep supports only 3–4 active units (5 with Garrison Seat specialization), trading late-game unit spam for tight positional chess governed by terrain modifiers and a deterministic counter-triangle.

---

## 2. World Setting & Visual Direction

* **Grounded Medieval / Low-Fantasy Frontier:** Untamed timberlands, winding river valleys, scarce iron ridges, and weathered ancient watchtowers. Magic is absent or subtle—power comes from grain stores, forged steel, stone walls, and frontier logistics.
* **The Dying King & the Regent Council:** The old King is dying without an heir. The Regent Council rules in his name and has opened the Marchlands by royal writ. Every House that rides north serves the Crown in name and its own ambition in fact. Royal Decrees are the Council's grants. Writs are its demands. Whoever earns enough of the Regent's favor may yet be named the March's sovereign and the throne's protector.
* **PWA-Optimized Visual Language:** Clean, high-contrast 2D top-down grid rendered with earthy topographic terrain tiles, distinct heraldic faction colors, and crisp vector iconography that remains immediately legible on phone screens without heavy 3D assets.

---

## 3. Campaign Scale, Game Modes & Victory Conditions

* **Map Parameters:** 22x22 square tile grid populated with 4 or 5 total Houses (Player + 3–4 AI rivals), neutral frontier villages, ancient watchtowers, relic ruins, and outlaw camps.
* **Game Modes (`GameState.mode`):**
  * **Dominion (`'dominion'`):** Open-ended campaign won via Conquest, Territorial Supremacy, or Regent's Mandate. No turn limit (the simulation harness uses a safety cap of 150 turns).
  * **Chronicle (`'chronicle'`):** Scored campaign ending after the last House finishes **Turn 36** (3 in-game years). The highest score wins (see `BALANCE_MODEL.md` §6). Conquest still ends the game early (the winner ranks 1st); Supremacy and Mandate are disabled.

| Condition | Dominion Mode | Chronicle Mode |
| :--- | :---: | :---: |
| **Conquest:** Every rival House eliminated (a House is eliminated at `0` Keeps; losing a capital alone does not eliminate it) | ✅ | ✅ *(ends early; winner ranks 1st)* |
| **Supremacy:** Own `≥ 65%` of all Keeps owned by any non-eliminated House **and** own `≥ 5` Keeps at turn end *(neutral villages are not counted)* | ✅ | ❌ |
| **Regent's Mandate:** Hold Claim (`≥ 30` Favor & `≥ 4` Keeps) for 3 turns (see `CROWN_SEASONS_EVENTS.md`) | ✅ | ❌ |
| **Score at Turn Limit (Turn 36):** Highest score wins | ❌ | ✅ |

* **Victory Priority Order (at the end of each House's turn):** Elimination check → Conquest → Mandate → Supremacy. The Score check runs only after the final House's turn on Turn 36.
* **Player Defeat:** If the human player's House is eliminated (`0` Keeps), the game ends with the Defeat screen, regardless of mode.

---

## 4. Playable Factions & AI Personalities

Every House shares the core ruleset and is defined by **1 Passive Trait**, **1 Unique Tile Building**, and **1 Signature Unit**. When controlled by the computer, each rival House's AI personality acts through the two-layer AI architecture (`docs/AI_ARCHITECTURE.md`).

| House | Archetype & Kit | Signature Unit | AI Personality |
| :--- | :--- | :--- | :--- |
| **House Vane** *(Flagship)* | **Woodland Wardens** — *Passive:* +1 Materials from untouched Forest tiles. *Building:* **Forester's Lodge** (produces Food + Materials without clearing forest). | **Longbowman** (3-tile range; +25% attack when firing from Forest or Hill tiles). | **Balanced Scout** — Prioritizes Watchtowers, forest chokepoints, and ranged positioning. |
| **House Ironhelm** | **Mountain Masons** — *Passive:* Palisades and Towers cost 30% fewer Materials. *Building:* **Deep Smeltery** (extracts double Materials + Coin on Mountain/Iron tiles). | **Oathsworn Halberdier** (+40% defense when adjacent to friendly walls or Keeps). | **Defensive Turtle** — Fortifies borders early and punishes overextended attackers. |
| **House Aurelia** | **River Covenant** — *Passive:* +1 Coin per river-adjacent tile improvement. *Building:* **River Tollhouse** (generates +3 Coin and acts as a bridge for friendly units). *Starts owning **Royal Mining Charter** and **Guild of Master Smiths**.* | **Gilded Lancer** (Heavy Cavalry; gains +1 movement when starting its turn near a river). | **Economic Expansionist** — Rushes neutral villages, hoards Coin, and pursues the Regent's Mandate. |
| **House Corvus** | **Ashland Raiders** — *Passive:* Pillaging enemy improvements or clearing Outlaw Camps yields double Coin and Materials. *Building:* **War Camp** (`14` Mat; +1 Army Cap for its Keep; max 1 per Keep, max 2 per House). | **Dusk Outrider** (Light Cavalry; ignores forest penalties & ZoC; can disengage after attacking). | **Aggressive Raider** — Hunts Outlaw Camps early and raids undefended outer farms. |
| **House Solis** | **Highland Sun-Sworn** — *Passive:* All units and Keeps gain +1 sight radius. *Building:* **Signal Bastion** (clears a 5x5 fog radius and boosts adjacent units' attack by +15%). | **Vanguard Spearman** (Anti-cavalry phalanx; immune to flanking bonuses). | **Opportunistic Tactician** — Snipes weakened units and contests central landmarks. |

---

## 5. Core Gameplay Loops & Economy

### Turn-by-Turn Structure
1. **Harvest & Upkeep Phase:** Each Keep tallies **Food**, **Materials**, and **Coin** from its active tiles, adjacency bonuses, and active Season/Event modifiers. Tier-2 and signature units deduct Coin upkeep. Each Keep's Food yield goes directly into **that Keep's Growth Bar** (there is no house-level Food treasury).
2. **Command Phase (Player):** Spend Materials to construct tile buildings or train units at Keeps; move and attack with active units; resolve triggered Milestone Drafts, Keep Specializations, Frontier Events, and Crown Audience actions.
3. **Auto-Save & Rival Turn:** Full game state commits immediately to `IndexedDB`, followed sequentially by each AI House's turn.

### Tactical Three-Resource Loop

| Resource | Primary Sources | Primary Sinks | Strategic Tension |
| :--- | :--- | :--- | :--- |
| **Food** | Farms, River Fisheries, Forester's Lodges | Keep Level-Ups (per-Keep Growth Bar), Peaceful Annexations (`12` Food from annexing unit's `homeKeepId` bar) | Pushes border expansion from 3x3 to 5x5 and triggers Milestone Drafts. |
| **Materials** | Lumber Mills, Quarries, Iron Mines | Tile Buildings, Palisades, Unit Recruitment | Forces a direct choice every turn between economic infrastructure and military troops. |
| **Coin** | Keeps, Tollhouses, Markets, Outlaw Bounties | Elite Unit Upkeep, Village Annexations, Crown Audience Actions (see Royal Favor) | Caps late-game elite unit spam; expanding without Coin income stalls your army. |

### 5b. Seasons & Frontier Events
The Marchlands cycle through **3-turn Seasons** (**Spring**, **Summer**, **Autumn**, **Winter** — a 12-turn year) with distinct economic, movement, sight, and Winter attrition modifiers. At the start of each new season (Turns 4, 7, 10…), the engine draws one **Frontier Event** using the seeded PRNG. See `docs/CROWN_SEASONS_EVENTS.md` for full rules.

---

## 6. Physical Settlement & Adjacency Engine

### Keep Borders & Leveling
* **Tier-1 Keep:** Claims a **3x3 territory** (8 workable tiles around the Keep).
* **Tier-2 Stronghold:** Reached upon filling the Keep's Food Growth Bar (`18` Food); expands borders to **5x5** (24 workable tiles), increases Army Cap from `3` to `4`, triggers a **Stronghold Specialization** choice, and then triggers a Royal Decree Draft.

### Stronghold Specialization (Tier-2)
When a Keep reaches Tier 2, its owner chooses **one permanent specialization** before the Royal Decree Draft that the level-up also triggers:
* **Garrison Seat:** Army Cap `4 -> 5`, `maxKeepHp` `20 -> 30`, Keep regen `+4 -> +6`, friendly units inside this Keep's territory gain `+0.10 DefBonus`, Palisade cap `4 -> 5`.
* **Market Town:** `+4 Coin/turn`, Markets in this territory yield `+2 Coin` more, and Peaceful Annexation costs `20%` less Coin while the House owns at least one Market Town.
* **Granary Seat:** `+2 Food/turn`, Farms in this territory yield `+1 Food`, and this Keep's repeat-draft threshold drops `36 -> 28` Food.

### Spatial Adjacency Matrix

| Improvement | Placement Requirement | Adjacency Effect |
| :--- | :--- | :--- |
| **Farm** | Plains | **+2 Food** when placed adjacent to a River tile. |
| **Lumber Mill** | Plains, Hills | **+2 Materials** when placed adjacent to 2 or more Forest tiles. |
| **Smithy** | Plains, Hills | Unlocks Heavy Cavalry (`knight` / `gilded_lancer`) recruitment at that Keep when adjacent to both an **Iron Mine** and a **Lumber Mill**. |
| **Palisade Wall / Watchtower** | Border Tile | Occupies the tile, blocks enemy movement across it (Palisade), and grants **+0.30 `DefBonus`** to friendly units **standing on** the tile. |

---

## 7. Milestone Drafting (1-of-3 Royal Decrees)

* **Starting Unlocks:** Every House begins Turn 1 with **Farm**, **Lumber Mill**, **Militia**, **Spearman**, and **Sapper Crew** unlocked, plus that House's unique building and signature unit. **House Aurelia** also starts owning *Royal Mining Charter* (`decree_iron_prospecting`) and *Guild of Master Smiths* (`decree_master_smiths`).
* **Draft Trigger:** Whenever any Keep levels up (after its specialization is chosen), whenever `house.lifetimeCoinEarned` crosses a milestone (`25, 60, 95, 130…`, `+35` each), or when exploring a Decree-granting Relic Ruin, a **1-of-3 Royal Decree Draft** modal opens.
* **Draft Category Guarantee:** Each 3-card hand offers **1 Infrastructure Blueprint**, **1 Military Charter**, and **1 Kingdom Doctrine** drawn from unowned decrees. When a category is exhausted, its slot fills from remaining categories in priority order **Doctrine → Infrastructure → Military** (no duplicates).
* **Draft Pool Categories:**
  * **Infrastructure Blueprints:** *Iron Mine, Smithy, Palisade Wall, Marketplace, Granary, Watchtower.*
  * **Military Charters:** *Archers, Crossbowmen, Heavy Knights, Siege Rams.* *(Sapper Crews are unlocked Turn 1; healing is covered by the Field Chirurgeons doctrine.)*
  * **Kingdom Doctrines (Passives):** *Three-Field Rotation (+1 Food per Farm/Forester's Lodge), Forced March (+1 Infantry/Spearman Movement), Veteran Drill (+15% Unit Attack), Quartermaster Ledger (-1 Coin Upkeep), Field Chirurgeons (6 HP heal when stationary), etc.*

### 7b. The Crown: Royal Favor, Writs & Regent's Mandate
The Regent Council publishes public **Crown Writs** every 6 turns starting Turn 3. Completing Writs earns **Royal Favor**, which Houses can spend on **Crown Audience** actions (Royal Reroll, Petition a Charter, Crown Grant) or accumulate to claim the **Regent's Mandate** (`≥ 30` Favor and `≥ 4` Keeps held for 3 turns in Dominion mode). See `docs/CROWN_SEASONS_EVENTS.md`.

---

## 8. Tactical Combat & Frontier Map Ecosystem

### Strict Keep Army Caps & Counter-Triangle
* **Army Caps:** A Tier-1 Keep supports **3 active units**; a Tier-2 Stronghold supports **4 active units** (`5` with Garrison Seat). Keeps at capacity cannot train new units until an existing unit is lost or disbanded.
* **Deterministic Counter-Triangle:** Combat resolves deterministically using Attack vs. Defense scaled by current unit HP percentage, additive modifier buckets, One-Shot Protection, and a multiplicative 40% advantage triangle:
  * **Spearmen** deal **+40% damage** to **Cavalry**.
  * **Cavalry** deal **+40% damage** to **Archers & Siege**.
  * **Archers & Infantry** deal **+40% damage** to **Spearmen**.
* **Guaranteed Siege Access:** Every House can train **Sapper Crews** from Turn 1 (`10` Mat, `6` structure Attack, 2-hit raze on Palisades/Watchtowers), while **Siege Rams** (`Siege Engineers` decree) remain the stronger 1-hit siege option.
* **Terrain Modifiers:**
  * **Hills:** `+0.20 DefBonus` and `+1` attack range for ranged units.
  * **Forests:** `+0.25 DefBonus` and blocks Cavalry movement/charges (except `dusk_outrider`).

### Neutral Map Features (22x22 Frontier)
1. **Independent Frontier Villages:** Neutral settlements scattered across the map. Players can capture them militarily or **annex them peacefully** by spending `15 Coin` + `12 Food` (from the annexing unit's `homeKeepId` growth bar) to convert them immediately into a new Tier-1 Keep with intact buildings.
2. **Ancient Watchtowers:** Neutral stone towers on elevated tiles. Moving a unit onto one permanently clears a **7x7 fog radius** around it.
3. **Relic Ruins:** Weathered ruins that grant an immediate burst of Coin, Materials, or a free **Royal Decree Draft** when explored.
4. **Outlaw Camps:** Hostile bandit encampments guarding high-yield Iron Ridges or Relic Ruins. Clearing a camp awards a lump-sum Coin bounty and opens surrounding high-value tiles for settlement.

### 8b. Map Generation (`mapGen(seed, houseCount)`)
`mapGen(seed, houseCount)` must be deterministic using `Mulberry32`:
* **Terrain Mix (±3%):** Plains 40%, Forest 22%, Hills 14%, River 10%, Mountain 8%, remainder Plains. Rivers are 1–2 connected river paths running edge to edge.
* **Capitals:** Placed at least `7` tiles apart (Chebyshev) and at least `3` tiles from the map edge.
* **Faction Terrain Guarantees (within each capital's 5x5 area):** Vane `≥ 3` Forest; Ironhelm `≥ 1` Mountain and `≥ 1` Iron Deposit; Aurelia `≥ 1` River inside the 3x3; Corvus `≥ 1` Outlaw Camp within `6` tiles of the capital; Solis `≥ 2` Hills; **Every House** `≥ 1` river-adjacent Plains tile and `≥ 1` Plains tile next to `2` Forests inside the 3x3.
* **Frontier Villages:** `2 × houseCount + 2` in total. Each House must have **at least 2 villages** closer to its capital than to any other capital. Villages sit at least `4` tiles from any capital and at least `3` tiles from each other.
* **Landmarks & Iron Deposits:** `4` Ancient Watchtowers (on Hills), `8` Relic Ruins (drawn from 12 without replacement), `houseCount + 1` Outlaw Camps. `1` Iron Deposit inside each capital's 5x5, plus `4–6` elsewhere (at least half next to an Outlaw Camp).
* **Fairness Retry:** If any guarantee fails, regenerate with `seed + attempt` for up to `50` attempts. After that, relax guarantees in order: terrain mix tolerance, then Corvus camp distance. Never relax the village guarantee.

---

## 9. PWA Technical Architecture & Multi-Session Persistence

* **Core Stack:** React + TypeScript + Vite + Tailwind CSS + `vite-plugin-pwa`, paired with `idb` for asynchronous `IndexedDB` persistence.
* **Bulletproof Multi-Session Save System:**
  * Represent the entire game state as a single serializable JSON tree (`tiles`, `houses`, `keeps`, `units`, `crown`, `chronicle`, `turnNumber`, `rngSeed`, etc.).
  * Auto-save asynchronously to `IndexedDB` after **every player action, specialization choice, event choice, Crown Audience action, undo, and AI turn**, invoking `navigator.storage.persist()` on launch so mobile browsers do not evict save data under storage pressure.
  * Provide **3 Manual Save Slots** plus **Export/Import Save JSON** strings in the pause menu as a zero-server backup.
* **"Previously in the March…" Recap:**
  * The engine appends fog-filtered `ChronicleEvent` entries to `GameState.chronicle` (ring buffer, max `300` entries).
  * `buildRecap(state, viewerHouseId, sinceTurn)` builds a 4-section summary (*Your Realm*, *Since You Last Ruled*, *Threats*, *Awaiting Your Word*) shown automatically on campaign resume and via a collapsible *"Since your last turn"* panel at turn start. Tapping a line with a `tileKey` pans the camera to that tile.
* **Mobile-First Touch Controls & Undo:**
  * **Two-Tap State Machine:** Tap a unit or tile once to inspect stats/actions in a bottom drawer; tap a highlighted valid target tile to execute movement, combat, or construction.
  * **Undo System:** An ephemeral stack of up to `20` `GameState` snapshots in React memory lets the player undo moves, building construction, unit training, and Crown Grants as long as no commit point (`isCommitPoint`) was triggered (revealing new ground/entities, combat, landmarks, annexation, modals, PRNG draws, or End Turn).
  * **Viewport Hardening:** Pinch-and-pan map container with `user-scalable=no`, `touch-action: manipulation` (preventing accidental double-tap zoom), and safe-area inset padding for notched phones.
