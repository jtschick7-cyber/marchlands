Spec Version: 2.0

# Marchlands v2.0: Two-Layer Fog-Honest AI Architecture

---

## 1. Performance & Spatial Indexing (`src/engine/spatialIndex.ts`)

Because v2.0 defaults to `34×34` (`1,156` tiles) and `100+` turn games, hot-path loops must avoid scanning `Object.values(state.tiles)` repeatedly. `buildSpatialIndex(state)` builds an ephemeral, non-persisted lookup once per turn/phase:
* `unitByTileKey: Record<CoordKey, UnitState>`
* `keepByTileKey: Record<CoordKey, KeepState>`
* `outpostByTileKey: Record<CoordKey, OutpostState>`
* `tilesByKeepId: Record<string, TileState[]>`
* `tilesByOutpostId: Record<string, TileState[]>`
* `tilesByOwner: Record<HouseId, TileState[]>`

---

## 2. Two-Layer AI Upgrades (`src/engine/ai/`)

1. **Influence (`ai/influence.ts`):** Builds 4-class `TileThreat` (including active enemy Overwatch tiles & Tier-3 Keep Arrow Slits threat!), economic Value map (weighting unowned Iron Deposits & the Central High Seat), and Frontier distance map.
2. **Strategic (`ai/strategic.ts`):** Posture selection (`expand | defend | attack | claim`) with `3`-turn hysteresis, Muster Rule (`3`-turn timeout & engage-if-attacked), High Seat & Iron Ridge targeting, and aggressive coalition targeting of any Mandate Claimant.
3. **Tactical (`ai/tactical.ts`):**
   * Lightweight `TacticalSimState` beam search (`2,000` combat resolution cap, `K = 2/4/6`, beam `1/4/8`).
   * **v2.0 Tactical Additions:** Fires **Lord-Commander active Command Skills** when cluster value exceeds threshold; triggers **Tier-3 Keep Arrow Slits** on nearby enemies; **Deploys Trebuchets** within range `3` of enemy Keeps/Walls; activates **Ranged Overwatch** when holding chokepoints; builds **Frontier Outposts** on remote Iron Deposits; uses **Paid Field Reinforce** on high-value wounded veterans/Commanders; respects Wall Links and Shield Push.
4. **Economy (`ai/economy.ts`):**
   * Unified post-combat loop capped at `MAX_AI_ACTIONS = 16` (`MIN_ACTION_SCORE = 5`).
   * Synchronously resolves Tier-2 Specializations (4 options), Tier-3 Citadel Charters (4 options), Exclusive Doctrine Pairs (8 pairs), Battle Honors, and Commander Marshal Traits.
   * Budgets **Iron** and **Coin upkeep** safely (building Iron Mines & Markets early, local **Barracks / Smithy / Siege Workshop** per Keep, **Roads** linking frontline Keeps, **Level-2 upgrades** on high-yield tiles, **Stone Walls & Bastion Towers** on frontier borders, and **Tier-3 Keep upgrades** at `90 Food + 10 Iron`).
5. **Termination Guardrails:** Single plan entry per unit, `2,000` combat resolution cap, `MAX_AI_ACTIONS = 16`, synchronous AI decisions, `8,000ms` Web Worker watchdog.
