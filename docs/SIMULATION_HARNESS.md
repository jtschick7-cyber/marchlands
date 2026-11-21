Spec Version: 2.0

# Marchlands v2.0: Headless Simulation Harness & Balance Gates

---

## 1. CLI Runner

```bash
node scripts/sim.ts --games 50 --seed 1 --houses 5 --mode dominion|chronicle \
  [--map grand|standard|compact] [--maxTurns 220] [--difficulty normal] [--out sim-reports/]
```

* Defaults to `--map grand` (`34×34`), `--maxTurns 220` in Dominion mode, and `72` turns (Standard Chronicle) in Chronicle mode.

---

## 2. Invariant Checks (Every Turn of Every Game)

1. No negative resources (`materials >= 0`, `iron >= 0`, `coin >= 0`, `favor >= 0`).
2. Every unit in bounds (`0 <= x, y < gridSize`), never on Mountain, zero tile overlaps.
3. Keep Army Caps respected (+ documented over-cap exceptions: War Camp loss, Garrison capture, Free Company, Lord-Commander exempt).
4. Owned tile `keepId` / `outpostId` referential integrity (Watchtower border-projection tiles may have `keepId === null && outpostId === null` with valid `ownerHouseId`).
5. `JSON.parse(JSON.stringify(state))` deep-equals `state` (100% JSON-serializable).
6. Determinism replay hash check (`1` in every `10` games).
7. AI turns strictly within `MAX_AI_ACTIONS = 16`, `2,000` combat resolutions, and `8,000ms` watchdog.

---

## 3. v2.0 Balance Gates (Grand `34×34`, 5-House Normal)

| Gate | Target |
| :--- | :--- |
| Invariant failures | `0` |
| Win rate per House (5-House Dominion) | `12–28%` each |
| Dominion median game length (`34×34`) | `85–130` turns |
| Dominion stalemate rate | `< 5%` |
| Victory type mix (Dominion) | No single type `> 75%` |
| Mandate break rate (when claimed) | `> 15%` (not auto-win) |
| Chronicle (Turn 72) 1st-to-5th score spread | `≥ 25%` of 1st place |
| Tier-2 Specialization pick rates (4 specs) | Each `≥ 10%` |
| Siege units trained per game (Sappers + Rams + Trebuchets) | `≥ 2.0` / game |
| Median Decrees owned at game end | `4–8` (exclusive build commitment) |
| AI turn time p95 (Node, `34×34`) | `< 250 ms` (Normal); `< 500 ms` (Hard) |
| AI focus-fire rate (Normal) | `≥ 45%` |
| AI piecemeal rate (Normal) | `≤ 20%` |

### CI Smoke Test
Vitest test running `3` seeded `34×34` games capped at `60` turns (plus `2` `22×22` Compact games) with `0` invariant failures and 100% determinism in `< 30s`.
