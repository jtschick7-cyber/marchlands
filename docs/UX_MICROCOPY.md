# Artifact #5: Marchlands UX Microcopy, Tooltips & Mobile Onboarding

This document defines all player-facing UI copy, compact mobile tooltip strings, combat/adjacency preview labels, the 3-card interactive onboarding primer, and end-of-campaign summary templates for *Marchlands*. Every string is calibrated for **375x812 mobile viewports**—keeping labels punchy, scannable in under two seconds, and grounded in the game's low-fantasy frontier tone.

---

## 1. Top HUD & Resource Bar Microcopy

When the player taps any resource pill or status badge in the `TopHud`, display a compact popover with these exact strings:

| HUD Element | Compact Label | Tap-to-Inspect Popover String |
| :--- | :--- | :--- |
| **Food Pill** | `{food}` `(+{netFood})` | **Food:** Grows Keeps into Tier-2 Strongholds (5x5 borders) and funds peaceful village annexations. |
| **Materials Pill** | `{materials}` `(+{netMat})` | **Materials:** Spent on tile improvements, defensive palisades, and training military units. |
| **Coin Pill** | `{coin}` `(+{netCoin})` | **Coin:** Pays elite unit upkeep each turn and unlocks Royal Decree drafts at treasury milestones. |
| **Keeps Badge** | `{ownedKeeps}/{totalKeeps}` | **Supremacy Progress:** Hold **65%** of all settled Keeps at turn end—or capture every rival Capital—to win. |
| **Turn Counter** | `Turn {turnNumber}` | **Campaign Chronicle:** Auto-saved after every move. Safe to close or switch apps anytime. |
| **End Turn Button** | `End Turn` / `Next Unit` | Smart button: cycles to your next idle unit (`Next Unit`), then switches to `End Turn` once all units have acted. |

---

## 2. Two-Tap State Machine & Bottom Drawer Prompts

Contextual guidance lines displayed at the top of the `BottomDrawer` so mobile players always know what their second tap will do:

* **No Selection (Idle Board):** *"Tap any friendly Keep, unit, or frontier tile to inspect."*
* **Friendly Unit Selected (Can Move & Attack):** *"Tap a blue tile to march, or a red-bracketed target to strike."*
* **Friendly Unit Selected (Moved, Can Still Attack):** *"Unit positioned. Tap a red target within range to attack, or tap elsewhere to hold."*
* **Friendly Unit Exhausted:** *"Orders complete for this turn. Rests at turn end (+3 HP if stationary)."*
* **Open Owned Tile Selected:** *"Select an improvement below to preview adjacency bonuses on this tile."*
* **Keep Selected (Open Army Cap):** *"Train troops ({usedCap}/{maxCap} Cap) or inspect border growth ({foodProgress}/{foodThreshold} Food)."*
* **Keep Selected (Army Cap Full):** *"Garrison full ({maxCap}/{maxCap}). Upgrade Keep to Tier 2 or lose a unit to train more."*
* **Neutral Frontier Village Adjacent:** *"Spend {annexFood} Food + {annexCoin} Coin to annex peacefully, or attack to seize by force."*

---

## 3. Combat & Counter-Triangle Tooltip Strings

Displayed inside the `BottomDrawer` combat preview card whenever a player selects a friendly unit and taps (or previews) an enemy unit, Keep, or Palisade:

### Counter-Triangle Badges
* **Advantaged (`+40%`):** `COUNTER ADVANTAGE (+40% ATK & DEF)`
  * *Spearman vs. Cavalry:* *"Pike wall braces against the charge."*
  * *Cavalry vs. Ranged/Siege:* *"Shock riders overrun exposed archers."*
  * *Ranged/Infantry vs. Spearman:* *"Volleys and blades break the shield line."*
* **Disadvantaged (`-40%`):** `COUNTER DISADVANTAGE (Enemy +40%)`
* **Neutral Matchup:** `EVEN MATCHUP (1.0x)`

### Terrain & Fortification Defense Badges
* `plains`: `Open Ground (+0% Def)`
* `river`: `River Ford (+0% Def | 2 Mov Cost)`
* `hills`: `High Ground (+20% Def | +1 Ranged Reach)`
* `forest`: `Dense Timber (+25% Def | Blocks Cavalry)`
* `palisade`: `Timber Palisade (+30% Def | Blocks Enemy Passage)`
* `watchtower`: `Stone Watchtower (+30% Def | 5x5 Vision)`
* `keep`: `Fortified Keep (+35% Def | {keepHp}/20 Garrison HP)`

### Combat Forecast Lines
* **Lethal Blow Forecast:** `DECISIVE STRIKE — Target will be destroyed!`
* **Retaliation Warning:** `Enemy will retaliate for ~{retaliationDmg} dmg.`
* **Safe Ranged Strike:** `Ranged Volley — No enemy retaliation.`
* **Siege Structure Strike:** `Battering Assault — Deals heavy structure damage with zero retaliation.`

---

## 4. Spatial Adjacency & Improvement Tooltip Strings

Displayed live on the map tile badge and inside the `BottomDrawer` build preview before the player confirms construction:

### Live Adjacency Bonus Callouts
* **Farm + River:** `+2 Food (River Irrigation)`
* **Lumber Mill + 2 Forests:** `+2 Materials (Deep Timber)`
* **Smithy + Iron Mine + Lumber Mill:** `FORGE ACTIVE — Unlocks Heavy Cavalry at this Keep`
* **Market + Farm/River:** `+{bonusCoin} Coin (Trade Crossroads)`
* **Granary + Adjacent Farms:** `+1 Food to each neighboring Farm`
* **Palisade Placement:** `Blocks enemy movement | +30% Def to defenders`
* **Forester's Lodge (Vane):** `+2 Food, +2 Mat | Preserves Forest (+1 Mat Passive)`
* **Deep Smeltery (Ironhelm):** `+4 Mat, +2 Coin | Operates on bare Mountain`
* **River Tollhouse (Aurelia):** `+3 Coin | Acts as a bridge for friendly units`
* **War Camp (Corvus):** `+1 Materials | Raises this Keep's Army Cap by +1`
* **Signal Bastion (Solis):** `+1 Coin | Reveals 5x5 fog & grants +15% Atk adjacent`

### Invalid Action / Toast Alerts
* **Outside Borders:** *"Must be built inside a friendly Keep's territory."*
* **Missing Iron Deposit:** *"Iron Mines require a visible Iron Vein on Hills or Mountains."*
* **Palisade Limit Reached:** *"Keep fortification limit reached ({current}/{max} Palisades)."*
* **Cavalry Forest Block:** *"Heavy cavalry cannot enter dense forest tiles."*
* **Supply-Severed Status:** *"Supply Severed! Home Keep lost—unit suffers -25% Atk/Def until re-homed."*
* **Coin Mutiny Alert:** *"Treasury empty! Unpaid wages caused {unitName} to lose 8 HP to desertion."*
* **Autosave Confirmation:** *"Chronicle Saved • Turn {turnNumber}"*

---

## 5. 3-Card Interactive "How to Play" Mobile Primer

Shown automatically on the player's first campaign launch (and accessible anytime via `Menu -> Field Guide`). Styled as 3 swipeable vellum cards with large vector diagrams and a `Next` / `Begin Campaign` CTA.

### Card 1: Carve Your Frontier
* **Headline:** Build Directly on the Land
* **Body:** Your Keeps aren't menus—they are living territories. Place **Farms** beside rivers and **Lumber Mills** beside forests to trigger spatial adjacency bonuses. Fill a Keep's **Food** bar to expand its borders from **3x3 to 5x5**.
* **Key Tip Pill:** *Materials build structures & troops • Coin pays upkeep & unlocks Decrees.*

### Card 2: Command Tight Squads
* **Headline:** Outsmart, Never Out-Spam
* **Body:** Each Keep supports only **3 to 4 active units**, keeping every skirmish fast and tactical. Use terrain cover and the **Counter-Triangle** (`+40%` damage) to shatter larger warbands.
* **Key Tip Pill:** *Spearmen > Cavalry > Archers & Siege > Spearmen*

### Card 3: Draft Decrees & Claim the March
* **Headline:** Adapt to the Wilderness
* **Body:** Every Keep upgrade and Coin milestone triggers a **1-of-3 Royal Decree Draft**—unlocking new blueprints, elite troops, and kingdom passives. Scout **Watchtowers**, raid **Outlaw Camps**, and annex **Frontier Villages** to rule the March.
* **Key Tip Pill:** *Win by capturing all Capitals OR holding 65% of all Keeps.*

---

## 6. Title Screen, Resume & End-of-Campaign Templates

### Title Screen & Multi-Session Resume Card
* **Game Subtitle:** *A Persistent Frontier Strategy Game*
* **Resume Card Header:** `Resume Chronicle — {houseName}`
* **Resume Card Subtext:** `Turn {turnNumber} • {ownedKeeps} Keeps Held • Saved {relativeTime}`
* **New Campaign Setup Prompt:** *"Choose your Noble House and rival count (4 or 5 Houses). Your campaign saves automatically after every move."*

### Victory Template: Classic Conquest (`victoryType === 'conquest'`)
* **Banner Title:** **THE MARCHLANDS KNEEL**
* **Subtitle:** *Conquest Victory — Turn {turnNumber}*
* **Narrative Summary:** *"Every rival banner has fallen before {houseName}. From the battlements of {capitalName}, your wardens look out over a pacified frontier united under one steel law."*

### Victory Template: Territorial Supremacy (`victoryType === 'supremacy'`)
* **Banner Title:** **SOVEREIGN OF THE FRONTIER**
* **Subtitle:** *Territorial Supremacy — Turn {turnNumber}*
* **Narrative Summary:** *"Controlling {ownedKeeps} of {totalKeeps} frontier Keeps ({supremacyPercent}%), {houseName} commands every river ford, iron ridge, and trade road. Remaining rivals sue for vassalage rather than face inevitable ruin."*

### Defeat Template: House Eliminated (`isEliminated === true`)
* **Banner Title:** **YOUR BANNER FALLS**
* **Subtitle:** *House Eliminated — Turn {turnNumber}*
* **Narrative Summary:** *"The gates of your final stronghold have been breached, and the standard of {houseName} lies in the ash. Yet every frontier campaign writes a new chronicle—muster your wardens and ride again."*

### Post-Match Chronicle Ledger (Displayed on All End Screens)
* **Ruling House:** `{houseName}`
* **Campaign Duration:** `{turnNumber} Turns`
* **Settlements Held:** `{ownedKeeps} / {totalKeeps} Keeps`
* **Royal Decrees Enacted:** `{decreeCount} / 24`
* **Map Seed:** `{rngSeed}` *(Tap to copy seed for replay)*
