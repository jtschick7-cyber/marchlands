Spec Version: 0.2

# Artifact #5: Marchlands UX Microcopy, Tooltips & Mobile Onboarding

This document defines all player-facing UI copy, compact mobile tooltip strings, combat/adjacency preview labels, the 3-card interactive onboarding primer, recap & Crown strings, and end-of-campaign summary templates for *Marchlands*. Every string is calibrated for **375x812 mobile viewports**—keeping labels punchy, scannable in under two seconds, and grounded in the game's low-fantasy frontier tone.

---

## 1. Top HUD & Resource Bar Microcopy

When the player taps any resource pill or status badge in the `TopHud`, display a compact popover with these exact strings:

| HUD Element | Compact Label | Tap-to-Inspect Popover String |
| :--- | :--- | :--- |
| **Food Pill** | `+{netFood}` | **Food:** Total Food income per turn across all Keeps. Each Keep's Food fills its own growth bar (`3x3 -> 5x5`) and funds peaceful village annexations. |
| **Materials Pill** | `{materials}` `(+{netMat})` | **Materials:** Spent on tile improvements, defensive palisades, and training military units. |
| **Coin Pill** | `{coin}` `(+{netCoin})` | **Coin:** Pays elite unit upkeep each turn and counts toward lifetime Coin milestones for Royal Decree drafts. |
| **Favor Pill** | `{favor}` | **Royal Favor:** Earned by completing Crown Writs and events. Spend in **Crown Audience** or hold `30+` with `4+` Keeps to claim the Regent's Mandate. |
| **Keeps Badge** | `{ownedKeeps}/{totalKeeps}` | **Dominion / Chronicle:** Hold `≥ 65%` of owned Keeps (min `5`) or eliminate all rivals in Dominion; score highest by Turn 36 in Chronicle. |
| **Season Badge** | `{seasonIcon} {season} ({turnsLeft}t)` | **Season & Year:** `Year {year} • {season}`. Shows active seasonal modifiers and turns remaining until the next season and Frontier Event. |
| **Score Badge** | `{score} pts` | **Realm Score:** Live Chronicle score across Territory, Keeps, Decrees, Military, Exploration, Landmarks, and Crown Favor. |
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
* **Neutral Frontier Village Adjacent:** *"Spend {annexFood} Food (from unit's home Keep) + {annexCoin} Coin to annex peacefully, or attack to seize by force."*

### Undo Button & Commit-Point Tooltips
* **Active Undo:** `Undo ({undoCount})` — *"Reverts your last action this turn."*
* **Disabled (Commit Point Reached):** `Undo (0)` with reason tooltip:
  * *Fog/Visibility:* `"New ground was revealed"`
  * *Combat/Pillage/Raze:* `"Blood was drawn"`
  * *PRNG Consumed:* `"The die is cast"`
  * *Turn Boundary / Modal / Annexation:* `"A new turn has begun"` (or `"Action cannot be undone"`)

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
* `river`: `River Ford (+0% Def | {riverMovCost} Mov Cost)`
* `hills`: `High Ground (+20% Def | +1 Ranged Reach)`
* `forest`: `Dense Timber (+25% Def | Blocks Cavalry)`
* `palisade`: `Timber Palisade (+30% Def | Blocks Enemy Passage)`
* `watchtower`: `Stone Watchtower (+30% Def | 5x5 Vision)`
* `keep`: `Fortified Keep (+35% Def | {keepHp}/{maxKeepHp} Garrison HP)`

### Combat Forecast Lines
* **Lethal Blow Forecast:** `DECISIVE STRIKE — Target will be destroyed!`
* **One-Shot Protection Forecast:** `Survives at 1 HP (Steadfast)`
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
* **Body:** Every Keep upgrade and Coin milestone triggers a **1-of-3 Royal Decree Draft**—unlocking new blueprints, elite troops, and kingdom passives. Scout **Watchtowers**, raid **Outlaw Camps**, complete **Crown Writs**, and annex **Frontier Villages** to rule the March.
* **Key Tip Pill:** *Win by Conquest, Supremacy (65% & 5+ Keeps), Regent's Mandate, or Turn-36 Chronicle Score.*

---

## 6. Title Screen, Resume, Modals & End-of-Campaign Templates

### Title Screen & Multi-Session Resume Card
* **Game Subtitle:** *A Persistent Frontier Strategy Game*
* **Resume Card Header:** `Resume Chronicle — {houseName}`
* **Resume Card Subtext:** `Turn {turnNumber} • {mode} • {ownedKeeps} Keeps Held • Last played {relativeTime}`
* **New Campaign Setup Prompt:** *"Choose your Noble House, campaign mode (Dominion or 36-Turn Chronicle), AI difficulty (Easy, Normal, or Hard), and rival count (4 or 5 Houses). Your campaign saves automatically after every move."*

### Tier-2 Keep Specialization Modal (`phase === 'specialization_modal'`)
* **Modal Title:** `Charter Your Stronghold`
* **Subtitle:** *"{keepName} has grown to a Tier-2 Stronghold. Choose its permanent charter before drafting a Royal Decree."*
* **Garrison Seat:**
  * *Effect:* `Cap 4→5 • Keep HP 20→30 (+6 regen) • +10% Def in territory • Palisade cap 5`
  * *Flavor:* *"Thickened curtain walls, deep cisterns, and a permanent muster yard turn a frontier keep into an iron gate."*
* **Market Town:**
  * *Effect:* `+4 Coin/turn • Markets +2 Coin • -20% Coin on Peaceful Annexation`
  * *Flavor:* *"Chartered stalls and toll-scales draw river merchants from across the southern shires."*
* **Granary Seat:**
  * *Effect:* `+2 Food/turn • Farms +1 Food • Repeat-draft threshold 36→28 Food`
  * *Flavor:* *"Stone-lined cellars and salted stores keep the surrounding hamlets fed through the longest frost."*

### Victory Template: Classic Conquest (`victoryType === 'conquest'`)
* **Banner Title:** **THE MARCHLANDS KNEEL**
* **Subtitle:** *Conquest Victory — Turn {turnNumber}*
* **Narrative Summary:** *"Every rival banner has fallen before {houseName}. From the battlements of {capitalName}, your wardens look out over a pacified frontier united under one steel law."*

### Victory Template: Territorial Supremacy (`victoryType === 'supremacy'`)
* **Banner Title:** **SOVEREIGN OF THE FRONTIER**
* **Subtitle:** *Territorial Supremacy — Turn {turnNumber}*
* **Narrative Summary:** *"Controlling {ownedKeeps} of {totalKeeps} frontier Keeps ({supremacyPercent}%), {houseName} commands every river ford, iron ridge, and trade road. Remaining rivals sue for vassalage rather than face inevitable ruin."*

### Victory Template: Regent's Mandate (`victoryType === 'mandate'`)
* **Banner Title:** **WARDEN BY ROYAL MANDATE**
* **Subtitle:** *Regent's Mandate Victory — Turn {turnNumber}*
* **Narrative Summary:** *"Holding {favor} Royal Favor and {ownedKeeps} Keeps for three unyielding turns, {houseName} receives the Regent Council's seal as sovereign protector of the Marchlands."*

### Victory Template: Chronicle Score (`victoryType === 'score'`)
* **Banner Title:** **CHRONICLE OF THE THREE YEARS**
* **Subtitle:** *Chronicle Victory — Turn 36 ({score} pts)*
* **Narrative Summary:** *"When the third winter closes on Turn 36, {houseName} stands foremost in the Regent's ledger—measured in land, stone, steel, and royal favor."*
* **Final Ranking Table:** Displays all Houses ranked 1st–5th with per-category score breakdown (*Territory, Keeps, Decrees, Military, Exploration, Landmarks, Crown, Treasury*).

### Defeat Template: House Eliminated (`isEliminated === true`)
* **Banner Title:** **YOUR BANNER FALLS**
* **Subtitle:** *House Eliminated — Turn {turnNumber}*
* **Narrative Summary:** *"The gates of your final stronghold have been breached, and the standard of {houseName} lies in the ash. Yet every frontier campaign writes a new chronicle—muster your wardens and ride again."*

### Post-Match Chronicle Ledger (Displayed on All End Screens)
* **Ruling House:** `{houseName}`
* **Mode & Difficulty:** `{mode} • {difficulty}`
* **Campaign Duration:** `{turnNumber} Turns`
* **Settlements Held:** `{ownedKeeps} / {totalKeeps} Keeps`
* **Royal Decrees Enacted:** `{decreeCount} / 24`
* **Map Seed:** `{rngSeed}` *(Tap to copy seed for replay)*

---

## 7. "Previously in the March…" Recap

* **Modal Title (On Campaign Resume):** `Previously in the March…`
* **Last-Played Subtext:** `Last played {relativeTime}` *(derived from save metadata `savedAtIso` outside `GameState`)*
* **Dismiss Button:** `Take Command`
* **In-Turn Panel Header:** `Since your last turn` *(collapsible; shows Sections 2–3 only; collapsed by default if player opts out in settings)*
* **Recap Sections (max 6 lines each; tapping a line with `tileKey` pans camera to that tile):**
  1. **Your Realm:** Turn, Season & Year, resources with net income/turn, Keeps held, Score rank, Favor rank.
  2. **Since You Last Ruled:** Fog-visible rival actions prioritized by attacks on you → Keeps captured/lost → annexations → eliminations → Writ completions.
  3. **Threats:** Enemy units within `3` tiles of your territory; your Keeps below full HP; active Mandate Claimant.
  4. **Awaiting Your Word:** Pending drafts and specializations, active Writs with progress (e.g. `"Blood the Levies: 1 / 3"`), next season & active event effects, turns left (Chronicle).

---

## 8. Crown, Writs & Frontier Event Microcopy

* **Crown Audience Panel (1 action per turn):**
  * `Royal Reroll (3 Favor)` — *"Redraw the current 3-card Royal Decree hand."*
  * `Petition a Charter (8 Favor)` — *"Queue an immediate Royal Decree Draft."*
  * `Crown Grant (4 Favor)` — *"Receive +15 Materials or +15 Coin."*
* **Mandate Banner (When a Claimant is Active):** `MANDATE CLAIMED — {claimantHouseName} holds the Regent's Mandate ({turnsRemaining} turns to victory)`
* **Season Banner (Turn Start on Season Change):** `{seasonName} Arrives — Year {year}` + active seasonal modifier summary.
* **Frontier Event Modal (`phase === 'event_modal'`):** Displays Event Title, Season badge, Vignette, Mechanical Effect, and deterministic choice buttons (e.g., `Pay {cost} Coin`, `Lose 2 Favor`, `Hire Free Company (15 Coin)`, `Decline`).
