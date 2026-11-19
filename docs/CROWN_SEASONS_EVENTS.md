Spec Version: 0.3

# Marchlands: The Crown, Seasons & Frontier Events

This document specifies the **Crown** (Royal Favor, Crown Writs, Crown Audience, Regent's Mandate), the **3-Turn Seasonal Calendar**, and **Frontier Events**. All numeric values are initial tuning values and belong in `src/data/` as named constants.

---

## 1. The Crown: Royal Favor, Writs & Regent's Mandate

### Royal Favor
* Tracked per House via `house.favor` (current, spendable) and `house.stats.lifetimeFavor` (total ever earned; used for Chronicle scoring).
* Every House's current Favor is public and displayed in the HUD rival panel.
* **Sources & Penalties:** Crown Writs, Frontier Events, **Peaceful Frontier Village Annexation** (`+1` Favor), **Ancient Watchtower occupation** (`+1` Favor on even turns, `turnNumber % 2 === 0`, counted in `stats.lifetimeFavor`), and Tier-2 Keep **Royal Surplus** (`+2` Favor on 2nd+ repeat milestones). **Violent Frontier Village seizure** deducts `2` Favor (clamped at `0`).

### Crown Writs (Public Objectives)
* At the start of **Turn 3**, and every **6 turns** thereafter (Turns 3, 9, 15, …), the Crown publishes **3 Writs** drawn with the seeded PRNG from the 12-Writ pool below.
* **Chronicle Mode Finale Rule:** Because Chronicle mode ends after **Turn 33** (end of Year 3 Autumn), new Writ publication on Turn `33` is suppressed (`if (mode === 'chronicle' && turnNumber === 33) skip publication`). The Turn `27` Writs remain active through the Turn `33` finale, giving `5` clean Writ cycles (Turns `3, 9, 15, 21, 27`).
* A Writ cannot be published again until **2 more publications** have passed (tracked in `crown.recentWritIds`).
* Each Writ is **first-come**: the first House to complete it receives the full reward. Later finishers in the same window receive nothing. Writs expire when the next publication happens.
* Completion is checked at the **end of each House's turn**. "Within this window" means since the Writ was published.

| ID | Writ | Requirement | Reward |
| :--- | :--- | :--- | :--- |
| `writ_clear_camp` | Rid the Roads of Brigands | Clear an Outlaw Camp | `4` Favor + `6` Coin |
| `writ_annex` | Bring the Elders to Heel | Annex or capture a Frontier Village | `5` Favor |
| `writ_watch` | Light the Beacons | Hold units on `2` Ancient Watchtowers at the same time | `4` Favor |
| `writ_strongholds` | Raise the Banners | Own `2` Tier-2 Keeps | `5` Favor |
| `writ_victories` | Blood the Levies | Destroy `3` enemy units | `4` Favor + `6` Mat |
| `writ_markets` | Fill the Royal Coffers | Own `2` Markets | `3` Favor + `8` Coin |
| `writ_relics` | Recover the Old Charters | Explore `2` Relic Ruins | `4` Favor |
| `writ_muster` | Show the Crown's Strength | End a turn with `6` or more units | `3` Favor |
| `writ_tithe` | Pay the Regent's Tithe | Voluntarily pay `20` Coin *(button on the Writ card)* | `3` Favor |
| `writ_iron` | Secure the Iron Veins | Own `2` Iron Mines *(Deep Smelteries count)* | `4` Favor |
| `writ_raze` | Break the Usurper's Walls | Raze an enemy Palisade or Watchtower | `3` Favor + `5` Mat |
| `writ_capture` | Punish the Disloyal | Capture an enemy Keep | `6` Favor |

### Crown Audience (Spend Favor)
Available at most **once per turn per House** (`house.audienceUsedThisTurn: boolean`).

| Action | Cost | Effect |
| :--- | :---: | :--- |
| **Royal Reroll** | `3` Favor | Reroll the current 3-card draft hand using the seeded PRNG (follows Draft Category Guarantee; may offer cards from the previous hand again). |
| **Petition a Charter** | `8` Favor | Immediately add a pending draft (`pendingDraftCount += 1`). |
| **Crown Grant** | `4` Favor | Gain `+15` Materials **or** `+15` Coin. |

### Regent's Mandate (Dominion Mode Only)
* **Claim:** At the end of its own turn, a House with **`≥ 30` current Favor** and **`≥ 4` Keeps** is announced as the **Claimant** (`crown.claimantHouseId`). All Houses are notified and a `mandate_claimed` ChronicleEvent is logged.
* **Win:** If the Claimant still has `≥ 30` Favor and `≥ 4` Keeps at the end of its **3rd turn after the claim**, it wins immediately with `victoryType = 'mandate'`.
* **Broken Claim:** If either condition fails at the end of any of the Claimant's turns, the claim ends (`mandate_broken` logged). That House cannot claim again for **6 turns** (`crown.claimCooldowns`).
* **Exclusivity:** Only one Claimant may hold the Mandate at a time. If two Houses qualify, the one that qualified first holds the claim.
* **AI Rules:**
  * While a rival is Claimant, every AI House adds a large utility bonus for attacking that Claimant's units and Keeps.
  * An AI House only spends Favor if doing so does not drop it below `30` while pursuing a claim.
  * AI personalities define weights for Writ pursuit (Aurelia highest overall, Corvus highest on combat Writs), Audience spending, and Mandate pursuit (Aurelia is most likely to pursue the Mandate).

### State Schema
* `GameState.crown`: `{ activeWrits: { writId: string; publishedTurn: number; completedByHouseId: string | null }[]; nextWritTurn: number; recentWritIds: string[]; claimantHouseId: string | null; claimStartTurn: number | null; claimCooldowns: Record<string, number> }`
* `HouseState`: `favor: number`, `audienceUsedThisTurn: boolean`

---

## 2. Seasonal Calendar

* **Cycle:** Turns `1–3` **Spring**, `4–6` **Summer**, `7–9` **Autumn**, `10–12` **Winter**, then repeating. One year = `12` turns. *(Chronicle mode ends after Turn `33` — the end of Year 3 Autumn, before the 3rd Winter frost arrives.)*
* **Derivation (never stored separately):**
  * `season = ['spring', 'summer', 'autumn', 'winter'][Math.floor((turnNumber - 1) / 3) % 4]`
  * `year = Math.floor((turnNumber - 1) / 12) + 1`
* **HUD & Recap:** The HUD displays the current season icon and turns left until the next season. The recap announces the coming season one turn ahead.
* **Turn-Order Note:** Season modifiers apply during the **Harvest & Upkeep Phase** of the first turn of that season.

| Season | Modifiers |
| :--- | :--- |
| **Spring (Thaw)** | Farms `+1` Food. Rivers are in flood: River movement cost **`3`** *(Tollhouse bridges still cost `1` for friendly units)*. |
| **Summer (Campaigning)** | Baseline, no economic changes. All units **`+1` sight**. |
| **Autumn (Harvest)** | Farms and Forester's Lodges `+1` Food; Granaries `+1` Food. |
| **Winter (Hard Frost)** | Farms `−2` Food (minimum `0`). All units **`−1` movement** (minimum `1`). **Attrition:** a unit that ends its turn outside its own House's territory takes `2` damage (cannot take it below `1` HP). Rivers freeze: River movement cost **`1`**. |

---

## 3. Frontier Events

* At the start of each new season (Turns `4, 7, 10, …`), the engine draws **1 event**, weighted by season, from the pool below using the seeded PRNG.
* **No-Repeat Rule:** An event cannot repeat within **4 seasons** (tracked in `GameState.recentEventIds`).
* **Deterministic Targeting:** `"Leader"` = highest score; `"Trailing"` = lowest score. Ties are broken by House turn order.
* **Choice Events:** Open phase `'event_modal'` for the human player (`GameState.pendingEventChoice`). AI Houses choose synchronously using personality weights.
* **Timed Effects:** Stored in `GameState.activeEffects: { id: string; effectId: string; houseId: string | null; expiresAfterTurn: number }[]`.

| ID | Event | Seasons | Target | Effect |
| :--- | :--- | :--- | :--- | :--- |
| `evt_royal_levy` | Royal Levy | Any | All Houses | Choose: pay `min(20, floor(coin × 0.2))` Coin **or** lose `2` Favor |
| `evt_bountiful_harvest` | Bountiful Harvest | Autumn | All Houses | `+4` Food to every Keep's growth bar |
| `evt_blight` | Blight in the Fields | Spring, Summer | Leader | Their Farms `−1` Food for `3` turns |
| `evt_hard_frost` | The Long Frost | Winter | All Houses | Winter attrition is `4` instead of `2` this season |
| `evt_outlaw_resurgence` | Outlaw Resurgence | Any | Map | Spawn `1` Outlaw Camp (with Bandit) on an empty, unowned, passable tile `≥ 4` tiles from any Keep. Skip if none qualifies. |
| `evt_free_company` | A Free Company Rides North | Summer, Autumn | Trailing | Choose: hire a **Free Company Spearman** (`free_company_spearman`: Spearman stats, `+2` Atk) for `15` Coin, **or** decline. Spawns on Capital tile if unoccupied (else nearest unoccupied passable tile in Capital territory, tie-break `tileKey`; option disabled if none available) with summoning sickness. Doesn't count toward Army Cap, can't be re-homed, costs `1` Coin upkeep, disbands if orphaned. |
| `evt_tournament` | The Regent's Tournament | Summer | All Houses | Choose: pay `10` Coin for `2` Favor, or decline |
| `evt_plague` | Lowland Fever | Any except Winter | House with most Keeps | Each of its Keeps loses `6` growth-bar Food (minimum `0`) |
| `evt_pilgrims` | Pilgrim Caravans | Spring, Summer | All Houses | `+2` Coin per Market owned (once) |
| `evt_timber_boom` | Timber Boom | Spring, Autumn | All Houses | Lumber Mills `+1` Materials for `3` turns |
| `evt_iron_strike` | A New Vein Struck | Any | Map | One unowned Hills tile gets `hasIronDeposit = true` and is revealed to all Houses |
| `evt_deserters` | Grumbling in the Ranks | Any | House with highest total upkeep | Choose: pay `2×` this turn's upkeep in Coin, **or** its highest-upkeep unit takes `6` true damage (can't take it below `1` HP) |
| `evt_inspection` | Royal Inspection | Any | Lowest Favor | `+3` Favor (catch-up) |
| `evt_fair_season` | Fair Season | Summer, Autumn | All Houses | Markets `+2` Coin for `3` turns |
