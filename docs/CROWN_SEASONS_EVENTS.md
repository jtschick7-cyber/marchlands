Spec Version: 2.0

# Marchlands v2.0: The Crown, Seasons & Frontier Events

---

## 1. The Crown: Royal Favor, Writs, Audience & Regent's Mandate

* **Crown Writs:** Published every `6` turns starting Turn `3` (`3` active Writs per cycle; final cycle suppressed on final turn of Chronicle mode). First-come rewards scaled for v2.0 (including Iron rewards on `writ_iron` and `writ_capture`).
* **Crown Audience (max 1 action/turn per House; `-1` Favor with *Regent's Envoy*):**
  * **Royal Reroll (`3` Favor):** Switch the active Doctrine Pair modal to a different unclaimed pair.
  * **Petition a Charter (`8` Favor):** Queue an immediate Doctrine Pair Draft (`pendingDraftCount += 1`).
  * **Crown Grant (`4` Favor):** Receive `+15 Materials` or `+15 Coin`.
  * **Emergency Iron Shipment (`5` Favor):** Receive `+6 Iron`.
* **Regent's Mandate (Dominion Mode Only):**
  * **Grand (`34×34`):** Hold **`≥ 60` Favor**, **`≥ 6` Keeps**, and **`≥ 2` Tier-3 Citadels** for **`6` consecutive turns** (Cooldown on break: `8` turns).
  * **Standard (`28×28`):** `≥ 45` Favor, `≥ 5` Keeps, `≥ 1` Tier-3 Citadel, held `5` turns.
  * **Compact (`22×22`):** `≥ 35` Favor, `≥ 4` Keeps, `≥ 1` Tier-2+ Stronghold, held `4` turns.
  * The **Central Ruined High Seat** grants `+1 Favor` on even turns and `+3 Coin/turn`, helping any House contest Favor without acting as a Mandate shortcut.

---

## 2. Seasonal Calendar & Winter Provisioning

3 turns per season (`Spring → Summer → Autumn → Winter`, 12 turns/year):
* **Spring (Thaw):** Farms `+1` Food; unbridged Rivers cost `3` Mov (`1` on Stone Bridge / Tollhouse).
* **Summer (Campaigning):** All units `+1` sight.
* **Autumn (Harvest):** Farms, Logging Camps, Forester's Lodges, and Granaries `+1` Food.
* **Winter (Hard Frost):** Farms `−2` Food (min `0`), all units `−1` Mov (min `1`, negated by *Hardened Marchers*), Rivers freeze (`1` Mov).
  * **Winter Attrition (`2` dmg; `4` during *The Long Frost*):** Applies to units outside friendly territory (unless sheltered on/within `1` tile of a friendly Watchtower/Bastion, Outpost, Stone Silo radius, or adjacent to their Lord-Commander).
  * **Winter Provisioning:** If a Keep's Winter Food yield is `<= 0` AND its territory lacks a `granary` (or `granary_seat` spec / `manor estate` Lv2 farm), units homed to that Keep also suffer `2` Winter attrition anywhere except directly on a Keep/Outpost tile and cannot passively heal during Winter.

---

## 3. Frontier Events (14 Seasonal Events)

Drawn at each season change (Turns `4, 7, 10, ...`, no repeat within 4 seasons), preserving all 14 v1 events tuned to v2.0 resource values (`evt_free_company` `20 Coin`, `evt_plague` `10 Food`, `evt_iron_strike` revealing a crucial unowned Hills Iron Deposit).
