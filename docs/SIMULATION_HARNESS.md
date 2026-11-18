Spec Version: 0.2

# Marchlands: Headless Simulation Harness & Balance Gates

This document specifies the headless AI-vs-AI simulation harness built and verified **before any React UI work begins**.

---

## 1. Mandatory Build Order

1. `src/types`
2. `src/data`
3. `src/engine/prng.ts`
4. `mapGen`
5. Core rules (movement, ZoC, combat, economy, capture, fog)
6. Keep specializations, Crown, seasons, and Frontier Events
7. Scoring and victory
8. AI (`docs/AI_ARCHITECTURE.md`)
9. **Simulation harness and balance gates**
10. `src/storage`
11. `src/components` (UI)

**Hard Gate:** No React component may be written until **Step 9's balance gates pass** or the human explicitly waives a gate.

---

## 2. CLI Runner

```bash
npx tsx scripts/sim.ts --games 200 --seed 1 --houses 5 --mode dominion|chronicle \
  [--maxTurns 150] [--difficulty normal] [--out sim-reports/]
```

* Every House is AI-controlled, using its own personality. AI fog is honest: each AI decides only from what it can see.
* Game *i* uses seed `seed + i`. House seating rotates so every House plays from every start position.

---

## 3. Invariant Checks

Checked on **every turn of every game**. Any failure aborts that game and is reported with `seed` and `turnNumber`:

1. No negative resources (`materials >= 0`, `coin >= 0`, `favor >= 0`).
2. No unit outside the `22x22` map or on an impassable (`mountain`) tile; no two units on the same tile.
3. Unit counts per Keep stay within cap, plus documented over-cap exceptions (`war_camp` loss, Garrison capture, `free_company_spearman`).
4. Every owned tile's `keepId` points to an existing Keep.
5. Serialization round-trip: `JSON.parse(JSON.stringify(state))` deep-equals `state`.
6. **Determinism:** Replaying the same seed produces an identical final-state hash (checked `1` in every `20` games).
7. Every AI turn ends within `MAX_AI_ACTIONS` (`12`) and the `2,000` combat resolution budget; the watchdog never fires.

---

## 4. Report Outputs

Written to `sim-reports/<timestamp>.json` plus a human-readable `.md` summary:

* Win rate by House and by victory type; win rate by start position.
* Game length: median, p10, p90; stalemate rate (hit `--maxTurns`, or no Keep changed hands for `25` turns).
* Turn each House reaches Tier 2 (median); specialization pick rate and win rate per specialization.
* Decree pick rate and win rate when owned; Writ completion rate per Writ; Mandate claims, wins, and broken claims.
* Event frequency and choice selection rates.
* First-contact turn (first attack between Houses); units alive per House over time.
* AI turn time per House: p50, p95, max.
* **AI coordination metrics:**
  * *Focus-fire rate:* share of AI kills where `2` or more AI units damaged the victim that turn.
  * *Piecemeal rate:* share of AI attack turns where exactly one unit attacked and was killed by retaliation or by the next enemy turn.
* **One-Shot Protection triggers** per game; **Sapper Crew vs. Siege Ram** usage; **War Camp** count per Corvus game.

---

## 5. Balance Gates (Initial Targets)

Run the full gate suite at **Normal** difficulty. Also run `50` games at Easy and Hard and verify that in mixed-difficulty test games, Hard AIs beat Normal AIs, and Normal AIs beat Easy AIs, at least **`60%`** of the time.

| Gate | Target |
| :--- | :--- |
| Win rate per House (5-House Dominion) | `12–28%` each (`20%` is perfectly fair) |
| Dominion median game length | `40–80` turns |
| Dominion stalemate rate | `< 5%` |
| Victory type mix (Dominion) | No single type `> 70%` |
| Chronicle: score spread between 1st and 5th | `≥ 25%` of 1st place's score |
| Each specialization's pick rate | `≥ 15%` |
| AI turn time p95 (Node, desktop) | `< 250 ms` per House (Normal); `< 500 ms` (Hard) |
| AI focus-fire rate (Normal) | `≥ 50%` |
| AI piecemeal rate (Normal) | `≤ 20%` |
| Invariant failures | `0` |

### CI Smoke Test
A Vitest test running `5` seeded games capped at `60` turns. Asserts `0` invariant failures and full determinism, finishing in **`< 30` seconds**.

### Tuning Workflow
When a gate fails, change constants in `src/data/` only, re-run the harness, and record each change and its before/after metrics in `docs/CHANGELOG.md` under **Balance passes**.
