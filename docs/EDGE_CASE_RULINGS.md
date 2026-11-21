Spec Version: 2.0

# Artifact #3: Marchlands v2.0 Edge-Case & Exploit Rulings

---

## 1. Keep Tier 3, Capture, High Seat & Frontier Outposts

### Ruling 1.1: Keep Capture, Arrow Slits & Tier-3 Citadels
* **Keep HP & Capture:** Tier 1 `36 HP`, Tier 2 `48 HP`, Tier 3 `64 HP` (`+14` Garrison Seat; `+20%` with *Stone Curtain*). On capture, `keepHp = Math.floor(maxKeepHp / 2)`, specialization & citadel charter are preserved, and faction-unique buildings convert to standard equivalents (`foresters_lodge -> logging_camp`, `deep_smeltery -> iron_mine`, `river_tollhouse -> stone_bridge`, `war_camp` and `signal_bastion` destroyed).
* **Tier-3 Citadel Upgrade:** When a Tier-2 Keep reaches `foodProgress >= 90` (`76` with Granary Seat) and the House holds `≥ 10 Iron`, the Keep may upgrade to Tier 3 (`upgradeKeepToTier3`, deducting `90 Food` and `10 Iron`, expanding sticky borders to `7×7`, raising `maxKeepHp`, and queueing `'citadel_modal'`). If Iron is insufficient when Food fills, excess Food accumulates cleanly until the player or AI triggers the upgrade.
* **Tier-3 Garrison Arrow Slits:** Once per turn (`!keep.garrisonVolleyUsedThisTurn`), a Tier-3 Citadel may fire a Range-2 arrow volley (`6` Atk, zero retaliation) at any visible enemy unit within `2` tiles + LOS (not consuming any unit's action).
* **Central Ruined High Seat:** Spawns near map center on `34×34` (and `28×28`) as a neutral Tier-2 fortress (`highSeatHp = 42`, `6` Def, `+0.35` cover, `5` melee Atk, `+4 HP/round` regen when unhit). Reducing `highSeatHp` to `0` converts it into a Tier-2 Keep (`21/48 HP`, `isHighSeat = true`) claiming sticky `5×5` territory, granting `+3 Coin/turn`, `+1 Favor` on even turns, and `+15` one-time Chronicle Landmark score (`highSeatFirstCapturedBy`). Never bypasses Supremacy or Regent's Mandate.

### Ruling 1.2: Frontier Outposts
* Max `2` Outposts per House (`3` with *Border Wardens*). Built by a non-siege friendly unit on or adjacent to an unowned, passable, non-landmark tile `≥ 4` tiles from any Keep and `≥ 3` from any existing Outpost (`12 Mat + 12 Coin`, consumes unit's attack action).
* Claims sticky `3×3` territory (`tile.outpostId = outpost.id`, `tile.keepId = null`, `tile.ownerHouseId = houseId`).
* Cannot train units, does not count as a Keep toward Supremacy/Mandate/Elimination (losing all Keeps still eliminates a House and clears its Outposts).
* Has `20 HP`, `4 Def`, `+0.30` cover, `+3 HP/round` unhit regen. Reducing `outpost.hp` to `0` transfers the Outpost and its `3×3` tiles to the attacker (at `10/20 HP`) or destroys it if the attacker is already at Outpost cap.

### Ruling 1.3: Watchtower Border Projection & Bastion Volleys
* Player-built `watchtower` may be placed inside owned territory OR on an **unowned, passable, non-landmark tile adjacent (Chebyshev `1`) to owned territory** (`tile.ownerHouseId` becomes active House, `tile.keepId = null`, `tile.outpostId = null`; subject to the nearest Keep's Watchtower cap).
* Upgraded **Stone Bastion Towers** (`improvement === 'watchtower' && improvementLevel === 2`) automatically deal `3` damage (`5` with *Stone Curtain*; respects Steadfast if full HP—cannot one-shot full HP) at the end of their owner's turn to the lowest-HP visible enemy unit within `1` tile (tie-break `unit.id`).

---

## 2. Wall Linking, Overwatch, Shield Push & Trebuchet Deploy

### Ruling 2.1: Orthogonal Wall Linking (Diagonal Block)
* Moving diagonally from `(x, y)` to `(x + dx, y + dy)` (`|dx| === 1 && |dy| === 1`) is **blocked** if BOTH orthogonal shoulder tiles `(x + dx, y)` and `(x, y + dy)` contain intact enemy `palisade` tiles (Lv1 or Lv2). Friendly units move through their own walls freely.

### Ruling 2.2: Ranged Overwatch
* A `ranged` unit that has not attacked this turn may activate **Overwatch** (`isOverwatch = true`, sets `hasAttacked = true`, `remainingMovement = 0`).
* During rival movement (`moveUnit`), after stepping to `destKey`, check all enemy `isOverwatch` units in deterministic `unit.id` order whose range + LOS covers `destKey` (and `fog[watcher.houseId][destKey] === 'visible'`). The **first** qualifying Overwatch unit fires a reaction volley (`85%` damage, `110%` with *Bodkin Volleys*; respects Steadfast) and clears `isOverwatch = false`. If the moving unit dies, movement terminates cleanly before landmark discovery.
* Overwatch expires automatically at the start of the watcher's next turn.

### Ruling 2.3: Infantry Shield Push
* Triggers when a surviving `infantry` attacker (`range === 1`) attacks a non-Keep, non-fortified-Phalanx, non-`honor_iron_guard` defender in melee, deals `attackerDamage > retaliationDamage`, and the defender survives (`defenderHpAfter > 0`).
* Destination push tile is `(def.x + sign(def.x - atk.x), def.y + sign(def.y - atk.y))`. Push occurs ONLY if that tile is in bounds, unoccupied, and `isTilePassableForUnit(state, defender, pushTile)` is true. Pushing clears `isFortified`, `isOverwatch`, and `isDeployed` on the pushed unit.

### Ruling 2.4: Trebuchet Deploy
* `trebuchet` cannot attack while `isDeployed === false`. Spending its turn action (`deployTrebuchet`) sets `isDeployed = true`, `hasAttacked = true`, `remainingMovement = 0` (except adjacent to a Level-3 `trait_siege_master` Commander, where Deploy is free!). Moving a Trebuchet sets `isDeployed = false`.

---

## 3. Lord-Commanders, Local Unlocks & 4-Resource Rules

### Ruling 3.1: Lord-Commanders
* Each House starts with `1` `lord_commander` unit on its Capital tile (does not count toward Army Cap, `2 Coin` upkeep, cannot be manually disbanded).
* **Wounded & Ransom:** When a Commander reaches `0 HP`, the unit is removed from `state.units`, `commander.unitId = null`, `commander.woundedTurnsRemaining = 5`, and the slaying House receives `+3 Favor` and `+15 Coin` (`+30 Coin` with *Iron Sovereign*). Each start of owner's turn decrements `woundedTurnsRemaining`; at `0`, the Commander automatically rallies at the Capital (or nearest unoccupied tile in Capital/first Keep territory). If `woundedTurnsRemaining <= 2`, owner may pay `15 Coin` to rally early.
* **Elimination:** If a House loses its last Keep (`0` Keeps), it is eliminated immediately even if its Commander is alive.

### Ruling 3.2: Iron & Coin Rules
* **Iron has zero negative upkeep:** `house.resources.iron >= 0` always. Running out of Iron stops crafting/upgrading/reinforcing Iron-gated items without mutinying existing armies.
* **Coin Bankruptcy (Mutiny):** Both unit Coin wages and building Coin upkeep are deducted at turn start. If `coin < 0`, clamp `coin = 0` and apply Mutiny (`8` true damage, `-25%` Atk) to the highest-upkeep non-Commander unit (if only Commander exists, Commander takes `8` damage down to `1 HP`).
* **Local Military Building Loss:** If a Keep's `barracks`, `smithy`, or `siege_workshop` is pillaged/demolished, existing units remain intact, but that Keep cannot train those units until rebuilt.

---

## 4. Exclusive Doctrine Pairs, Undo & `34×34` MapGen

### Ruling 4.1: Exclusive Doctrine Pairs
* Enacting one decree of a pair adds its paired opposite to `house.lockedDecreeIds` permanently. Drafts draw from unclaimed pairs (offering `2` opposing cards from a single pair, or `1` card from each of up to `2` pairs — canonical v2 rule: **present 1 complete unclaimed Doctrine Pair per draft, or 2 cards from distinct pairs**, so players always face a crisp A-vs-B dilemma; **Royal Reroll** switches to a different unclaimed pair!). Wait—offering **2 choices of a single unclaimed pair** (A vs B) makes the mutually-exclusive tradeoff 100% transparent on a `375px` mobile screen! If all 8 pairs are claimed, extra triggers grant Royal Windfall (`+15 Coin, +10 Mat, +3 Iron`).

### Ruling 4.2: Undo Commit Points
* Unchanged from v0.3, plus activating Commander skills, Clear Timber, building Outposts, Paid Reinforce, Keep Tier-3 upgrade, and Battle Honor / Trait selections count as commit points when they alter combat/fog/PRNG or irreversibly transform terrain.

### Ruling 4.3: Map Preset Generation (`22×22`, `28×28`, `34×34`)
* Terrain mix (`±3%`): Plains 46%, Forest 22%, Hills 14%, River 10% (2 connected edge-to-edge rivers), Mountain 8%.
* **Grand (`34×34`):** Capitals `≥ 11` apart, `≥ 4` from edges; `4 × houseCount` Villages (`≥ 3` closest per House); `1` Iron per Capital `5×5` (with Smithy triple guarantee) + `10–12` contested Iron Deposits; `6` Ancient Watchtowers; `12` Relic Ruins; `8` Outlaw Camps; `1` Central Ruined High Seat within `2` tiles of map center.
* **Standard (`28×28`):** Capitals `≥ 9` apart; `3 × houseCount` Villages (`≥ 2` closest); `7–9` extra Iron; `5` Watchtowers; `10` Ruins; `6` Camps; `1` High Seat.
* **Compact (`22×22`):** Capitals `≥ 7` apart; `2 × houseCount + 2` Villages (`≥ 2` closest); `4–6` extra Iron; `4` Watchtowers; `8` Ruins; `houseCount + 1` Camps; no High Seat (or optional).
