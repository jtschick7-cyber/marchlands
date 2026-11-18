Spec Version: 0.2

# Artifact #4: Marchlands Visual Design Token & Heraldry Sheet

This document defines the complete color system, typography scale, fog-of-war overlays, and minimalist SVG glyph specifications for *Marchlands*. All tokens are engineered for high-contrast readability on 375x812 mobile viewports, full colorblind accessibility (Protanopia, Deuteranopia, and Tritanopia safe), and zero external image dependencies.

---

## 1. Colorblind-Safe House Heraldry Palette

To prevent faction confusion on dense 22x22 boards, the 5 Houses are separated by **both hue and luminance** (ranging from dark crimson and deep teal to high-luminance ivory) and paired with a unique geometric heraldic sigil.

| House ID | House Name | Primary Banner | Light Territory Tint | Dark Stroke / Border | Badge Text / Icon | Heraldic Sigil Shape (24x24 SVG) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `vane` | **House Vane** | `#0F766E` *(Deep Pine Teal)* | `#CCFBF1` | `#115E59` | `#FFFFFF` | **Antler Chevron** — Three-pronged upward stag antlers inside a pointed heater shield. |
| `ironhelm` | **House Ironhelm** | `#1D4ED8` *(Steel Cobalt)* | `#DBEAFE` | `#1E3A8A` | `#FFFFFF` | **Anvil & Hammer** — Broad flat-topped anvil silhouette inside a square tower shield. |
| `aurelia` | **House Aurelia** | `#D97706` *(Burnished Amber)* | `#FEF3C7` | `#92400E` | `#1C1917` | **River Crown** — Three-peaked coronet above two horizontal wave bars inside a roundel. |
| `corvus` | **House Corvus** | `#B91C1C` *(Ashland Crimson)* | `#FEE2E2` | `#7F1D1D` | `#FFFFFF` | **Diving Raven** — Sharp downward-sweeping twin wings inside a diamond lozenge. |
| `solis` | **House Solis** | `#F8FAFC` *(Sunlit Ivory)* | `#F1F5F9` | `#0F172A` | `#0F172A` | **Eight-Ray Sunburst** — Solid central disc (`#CA8A04`) with 8 triangular rays inside an octagonal badge. |

### Territory Border Rendering Rules
* **Keep Ownership Outline:** Draw a `2.5px` dashed inner border in the owning House's **Primary Banner** color along the outer perimeter edges of a Keep's claimed `3x3` or `5x5` tiles (only on edges adjacent to unowned tiles or tiles belonging to another Keep).
* **Owned Tile Wash:** Apply a subtle `12%` opacity wash of the House's **Primary Banner** color over owned tiles so underlying terrain remains instantly recognizable.

---

## 2. Topographic Terrain & Resource Deposit Tokens

Terrain tiles use low-saturation, earthy medieval cartography tones so high-contrast unit tokens, Keep banners, and tactical highlight rings always pop cleanly on mobile screens.

| Terrain / Feature | Base Tile Fill | Inner Contour / Stroke | Tactical Note & Visual Cue |
| :--- | :--- | :--- | :--- |
| `plains` | `#D6D3C4` *(Warm Parchment)* | `#C7C3B0` | Subtle stipple dots (`1px`, opacity `0.35`); clean open ground. |
| `forest` | `#7C9A73` *(Muted Sage)* | `#527049` | Cluster of 3 layered evergreen triangle silhouettes in `#4A6741`. |
| `hills` | `#B8A98A` *(Ochre Ridge)* | `#8C7C5E` | Two overlapping curved topographic ridge arcs (`1.5px` stroke). |
| `mountain` | `#646870` *(Granite Slate)* | `#3F434A` | Twin jagged peak triangles with `#E2E8F0` snow/ridge highlight cap. |
| `river` | `#4B89AC` *(Ford Blue)* | `#336B8B` | Animated or static parallel ripple curves (`1px` `#93C5FD` stroke); connects seamlessly to adjacent `river` tiles. |
| `hasIronDeposit` | *(Overlay on Hills/Mountain)* | `#1E293B` | Embedded metallic ore cluster (`#94A3B8` faceted hexagon with `#38BDF8` glint) in the tile's bottom-right corner. |

---

## 3. Fog-of-War & Tactical Interaction Overlays

All grid overlays render as crisp SVG/CSS layers stacked cleanly above terrain and improvements without obscuring map topology.

| State / Overlay Layer | Visual Styling (CSS / SVG) | Z-Index Layer | Purpose |
| :--- | :--- | :---: | :--- |
| `unexplored` | Solid `#18181B` *(Charcoal Shroud)* with subtle `#27272A` parchment grid lines | `40` | Completely hides terrain, landmarks, and enemy units until scouted. |
| `explored` | `rgba(15, 23, 42, 0.48)` *(Dimmed Dusk Veil)* + `grayscale(35%)` | `30` | Shows remembered terrain, Keeps, and static landmarks; hides current enemy unit positions. |
| `visible` | `opacity: 0` (Full color clarity) | — | Active line-of-sight from friendly Keeps, Watchtowers, and units. |
| `selectedCoord` | `3px` solid `#FACC15` *(Bright Gold)* pulsing outer tile frame | `25` | Highlights the currently inspected tile or active unit. |
| `reachableCoords` | `rgba(56, 189, 248, 0.28)` fill + `2px` `#0284C7` inner border | `20` | Valid movement destinations from BFS pathfinding. |
| `attackableCoords` | `rgba(239, 68, 68, 0.32)` fill + `2px` `#DC2626` corner brackets | `22` | Valid enemy units, Keeps, or Palisades within attack range. |
| `buildPreview` | `rgba(34, 197, 94, 0.28)` fill + floating green `+Yield` pill badge | `24` | Valid buildable tiles inside a Keep's radius showing live adjacency bonus. |

---

## 4. Mobile HUD & UI Chrome Design Tokens

### Core UI Surfaces & Resource Colors
* **App Background (Canvas Gutter):** `#0F172A` *(Deep Slate Night)*
* **Top HUD & Bottom Drawer Surface:** `#1E293B` *(Dark Iron Slate)* with `1px solid #334155` border and `backdrop-blur-md`
* **Primary Modal Card (Royal Decrees & Ruins):** `#FAF7F0` *(Aged Vellum)* surface with `#1C1917` *(Ink Black)* serif headers and `#B45309` *(Wax Seal Bronze)* accents
* **Resource Pill Tokens:**
  * **Food:** `#16A34A` *(Harvest Green)* — Wheat sheaf icon
  * **Materials:** `#D97706` *(Timber & Iron Amber)* — Crossed log & ingot icon
  * **Coin:** `#EAB308` *(Crown Gold)* — Stamped coin icon

### Typography & Mobile Touch Ergonomics
* **Headings / Decree Titles:** `'Cinzel', 'Georgia', serif` — `600/700` weight, tight tracking (`-0.01em`)
* **UI Controls, Stats & Yield Numbers:** `'Inter', system-ui, sans-serif` with `font-variant-numeric: tabular-nums` so resource counters never jitter on update
* **Minimum Touch Target:** Every interactive button, drawer tab, and decree card must maintain at least `44px x 44px` hit area with `8px` minimum gap between adjacent controls
* **Base Grid Tile Size:** `48px x 48px` at `1.0x` zoom (supports pinch-to-zoom from `0.65x` strategic overview up to `2.0x` close inspection)

---

## 5. Minimalist SVG Glyph Specifications (48x48 Tile Anatomy)

Every tile renders on a standardized `48x48` coordinate grid (`viewBox="0 0 48 48"`), layered from bottom to top so unit silhouettes never collide with improvement icons or HP bars.

### Tile Layer Stack (48x48 Canvas)
1. **Base Terrain Layer (`0,0` to `48,48`):** Full-bleed terrain fill + topographic contour strokes.
2. **Improvement / Landmark Slot (Bottom-Left `x: 4, y: 24`, `20x20` box):** Renders built improvements or neutral landmarks so they remain visible even when a friendly unit stands on the tile.
3. **Keep Structure Slot (Center `x: 8, y: 8`, `32x32` box):** Renders Tier-1 wooden palisade keep (single central tower) or Tier-2 stone stronghold (twin crenelated towers + House banner pennant) with a top-centered `keepHp` bar (`32px` wide, `4px` tall).
4. **Unit Token Slot (Center-Right `x: 12, y: 6`, `28x28` circular/shield token):**
   * Token fill = Owning House **Primary Banner** color; `2px` border = `#FFFFFF` (active/ready to act) or `#64748B` muted gray (exhausted: `hasMoved && hasAttacked`).
   * **Unit HP Bar:** Directly beneath unit token (`y: 36`, `26px` wide, `3.5px` tall) in `#22C55E` (>50% HP), `#F59E0B` (25–50% HP), or `#EF4444` (<25% HP).
   * **Status Pip:** Small `8x8` red exclamation badge at top-right (`x: 34, y: 6`) if the unit is **Supply-Severed** (`homeKeepId === 'orphaned'`) or **Mutiny-Weakened**.

### Vector Icon Blueprints (`24x24` Standardized Silhouettes)

#### Unit Class & Signature Silhouettes (Rendered inside Unit Token)
* `militia` (`infantry`): Simple round buckler shield + short hand-axe silhouette.
* `spearman` (`spearman`): Diagonal long spear shaft with triangular spearhead + vertical kite shield.
* `archer` (`ranged`): Curved hunting bow arc with nocked arrow pointing up-right.
* `crossbowman` (`ranged`): Horizontal T-shaped heavy arbalest stock and prod.
* `knight` (`cavalry`): Armored warhorse head profile with plumed helm crest.
* `sapper_crew` (`siege`): Mattock crossed over a ladder, inside the siege-class token frame.
* `siege_ram` (`siege`): Wheeled A-frame timber roof housing a horizontal iron-tipped battering log.
* `longbowman` *(Vane)*: Tall vertical warbow with dual fletched arrows.
* `oathsworn_halberdier` *(Ironhelm)*: Broad crescent halberd axe-blade atop a heavy tower shield.
* `gilded_lancer` *(Aurelia)*: Charger silhouette with a pennanted jousting lance.
* `dusk_outrider` *(Corvus)*: Hooded rider silhouette with twin curved sabers.
* `vanguard_spearman` *(Solis)*: Sun-crested hoplite shield crossed by an upright pike.

#### Improvements & Neutral Landmarks (`20x20` Corner Glyphs)
* `farm`: Three golden wheat stalks tied at the base (`#EAB308`).
* `lumber_mill`: Circular buzzsaw / stacked timber logs (`#92400E`).
* `iron_mine`: Arched timber mine entrance with crossed pickaxes (`#334155`).
* `smithy`: Glowing forge hearth (`#EA580C`) beside a small anvil.
* `market`: Striped merchant pavilion awning (`#DC2626` & `#FEF3C7`).
* `granary`: Domed stone grain silo with arched doorway (`#D6D3D1`).
* `palisade`: Row of 4 vertical sharpened wooden stakes spanning the tile edge (`#78350F`).
* `watchtower`: Tall narrow stone beacon tower with top brazier flame (`#F97316`).
* `foresters_lodge` *(Vane)*: Timber A-frame cabin nestled between two pine trees.
* `deep_smeltery` *(Ironhelm)*: Stone blast-furnace chimney emitting a small ember spark.
* `river_tollhouse` *(Aurelia)*: Arched stone bridge with a central coin-stamped gatehouse.
* `war_camp` *(Corvus)*: Crimson war-tent flanked by two upright banner spears.
* `signal_bastion` *(Solis)*: White stone obelisk topped with a glowing golden sun-mirror.
* `frontier_village`: Cluster of three small thatched-roof cottages (`#F5F5F4` with `#78350F` roofs).
* `ancient_watchtower`: Weathered mossy stone tower with unlit brazier (`#94A3B8`).
* `relic_ruin`: Broken classical stone archway and fallen column (`#CBD5E1`).
* `outlaw_camp`: Tattered black-and-red tent (`#18181B` / `#DC2626`) with crossed daggers.
