/**
 * Marchlands (Spec v0.3) — 22x22 Cartographic Inline SVG MapBoard
 *
 * Upgraded visual rendering (100% inline SVG, zero external rasters):
 * - Gradients & seasonal atmosphere (Spring / Summer / Autumn / Winter)
 * - Auto-tiled seamless rivers with banks and shimmer ripples
 * - Deterministic per-tile terrain details (no Math.random())
 * - Feathered cartographic Fog of War
 * - Detailed Tier-1 & Tier-2 Keeps with on-map nameplates & Food bars
 * - Heraldic shield-medallion Unit tokens with Veterancy chevrons, Fortify badges,
 *   ready-pulse rings, smooth movement transitions & floating action callouts
 * - Toggleable tile yield badges on owned territory
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CoordKey,
  FogStatus,
  GameState,
  HouseId,
  KeepState,
  Season,
  TileState,
  UnitState,
} from '../types/game.ts';
import { BANDIT_MAX_HP, GRID_SIZE, HOUSES, VILLAGE_MAX_HP } from '../data/index.ts';
import { getUnitRank } from '../engine/combat.ts';
import { computeTileYield } from '../engine/economy.ts';
import {
  canUnitAct,
  getKeepFoodThreshold,
  type BuildPreviewInfo,
} from '../engine/queries.ts';
import { getSeason } from '../engine/stateHelpers.ts';
import {
  ImprovementGlyphSvg,
  LandmarkGlyphSvg,
  UnitFigureSvg,
} from './svg/HeraldrySvg.tsx';
import type { MapFloatingPopup } from './uiTypes.ts';

const TILE_SIZE = 48;
const BOARD_PX = GRID_SIZE * TILE_SIZE;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.0;
const DRAG_THRESHOLD_PX = 8;

interface MapBoardProps {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly selectedTileKey: CoordKey | null;
  readonly reachableKeys: ReadonlySet<CoordKey>;
  readonly attackableKeys: ReadonlySet<CoordKey>;
  readonly buildPreviews: ReadonlyMap<CoordKey, BuildPreviewInfo>;
  readonly showYieldOverlay: boolean;
  readonly floatingPopups: readonly MapFloatingPopup[];
  readonly focusTileKey: CoordKey | null;
  readonly focusNonce: number;
  readonly onToggleYieldOverlay: () => void;
  readonly onTileTap: (tileKey: CoordKey) => void;
}

/** Pure deterministic visual hash (0..99) for organic tile variation. */
function tileHash(x: number, y: number): number {
  return ((x * 73 + y * 137 + x * y * 19) & 0x7fffffff) % 100;
}

/**
 * Builds smooth organic SVG river channel paths for any N/S/E/W connection topology
 * so rivers flow naturally around bends instead of stiff 90-degree pipes.
 */
function buildRiverPaths(
  mask: { n: boolean; s: boolean; e: boolean; w: boolean },
  h: number,
): { readonly main: string; readonly shimmer: string; readonly hasPool: boolean } {
  const { n, s, e, w } = mask;
  const count = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);
  const bend = (h % 2 === 0 ? 1 : -1) * (2.5 + (h % 3));

  if (count === 0) {
    return {
      main: 'M14 25 Q24 19 34 25',
      shimmer: 'M18 24 Q24 22 30 24',
      hasPool: true,
    };
  }

  if (count === 1) {
    if (n) return { main: `M24 0 Q${24 + bend} 14 24 27`, shimmer: 'M24 5 V19', hasPool: true };
    if (s) return { main: `M24 48 Q${24 + bend} 34 24 21`, shimmer: 'M24 29 V43', hasPool: true };
    if (w) return { main: `M0 24 Q14 ${24 + bend} 27 24`, shimmer: 'M5 24 H19', hasPool: true };
    return { main: `M48 24 Q34 ${24 + bend} 21 24`, shimmer: 'M29 24 H43', hasPool: true };
  }

  if (count === 2) {
    // Straight meanders
    if (n && s) {
      return {
        main: `M24 0 C${24 - bend} 16 ${24 + bend} 32 24 48`,
        shimmer: `M${24 - bend * 0.4} 9 C${24 - bend * 0.7} 20 ${24 + bend * 0.7} 28 ${24 + bend * 0.3} 39`,
        hasPool: false,
      };
    }
    if (w && e) {
      return {
        main: `M0 24 C16 ${24 - bend} 32 ${24 + bend} 48 24`,
        shimmer: `M9 ${24 - bend * 0.4} C20 ${24 - bend * 0.7} 28 ${24 + bend * 0.7} 39 ${24 + bend * 0.3}`,
        hasPool: false,
      };
    }
    // Sweeping smooth river bends (no hard 90-deg corners)
    if (n && e) return { main: 'M24 0 Q24 24 48 24', shimmer: 'M26 7 Q28 21 41 22', hasPool: false };
    if (n && w) return { main: 'M24 0 Q24 24 0 24', shimmer: 'M22 7 Q20 21 7 22', hasPool: false };
    if (s && e) return { main: 'M24 48 Q24 24 48 24', shimmer: 'M26 41 Q28 27 41 26', hasPool: false };
    return { main: 'M24 48 Q24 24 0 24', shimmer: 'M22 41 Q20 27 7 26', hasPool: false };
  }

  if (count === 3) {
    // Smooth main trunk + gracefully curved tributary joining the confluence
    if (!w) {
      return {
        main: 'M24 0 Q22 24 24 48 M24 24 Q34 24 48 24',
        shimmer: 'M24 7 V41 M30 24 H42',
        hasPool: true,
      };
    }
    if (!e) {
      return {
        main: 'M24 0 Q26 24 24 48 M24 24 Q14 24 0 24',
        shimmer: 'M24 7 V41 M6 24 H18',
        hasPool: true,
      };
    }
    if (!n) {
      return {
        main: 'M0 24 Q24 26 48 24 M24 24 Q24 34 24 48',
        shimmer: 'M7 24 H41 M24 30 V42',
        hasPool: true,
      };
    }
    return {
      main: 'M0 24 Q24 22 48 24 M24 24 Q24 14 24 0',
      shimmer: 'M7 24 H41 M24 6 V18',
      hasPool: true,
    };
  }

  // 4-way river confluence
  return {
    main: 'M24 0 V48 M0 24 H48',
    shimmer: 'M24 7 V41 M7 24 H41',
    hasPool: true,
  };
}

/** Layered conifer evergreen with trunk and scalloped bough tiers. */
function LayeredPine({
  x,
  y,
  scale = 1,
  dark,
  mid,
  light,
  snow,
}: {
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly dark: string;
  readonly mid: string;
  readonly light: string;
  readonly snow: boolean;
}) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy="1.8" rx="6.2" ry="2" fill="#17281B" opacity="0.3" />
      <rect x="-1.1" y="-2.5" width="2.2" height="4.2" rx="0.5" fill="#5C3A21" />
      {/* Lower bough tier */}
      <path d="M-6.4 -1.8 Q0 -3.5 6.4 -1.8 L3.6 -7.2 H-3.6 Z" fill={dark} />
      <path d="M-5.2 -2.2 L0 -7.5 L0 -1.8 Z" fill={mid} opacity="0.7" />
      {/* Middle bough tier */}
      <path d="M-5.2 -6.2 Q0 -7.6 5.2 -6.2 L2.5 -11.6 H-2.5 Z" fill={mid} />
      <path d="M-4.3 -6.5 L0 -11.8 L0 -6.2 Z" fill={light} opacity="0.65" />
      {/* Crown tip */}
      <path d="M-3.5 -10.5 Q0 -11.6 3.5 -10.5 L0 -15.6 Z" fill={light} />
      {snow && (
        <path d="M-2.4 -11.6 L0 -15.6 L2.4 -11.6 Q0 -12.3 -2.4 -11.6 Z" fill="#F1F5F9" opacity="0.92" />
      )}
    </g>
  );
}

/** Rounded deciduous oak/birch woodland tree with shaded canopy puffs. */
function DeciduousTree({
  x,
  y,
  scale = 1,
  dark,
  mid,
  light,
}: {
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly dark: string;
  readonly mid: string;
  readonly light: string;
}) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <ellipse cx="0" cy="1.6" rx="5.8" ry="1.9" fill="#17281B" opacity="0.28" />
      <path d="M-1.1 1.4 L-0.8 -4.5 H0.8 L1.1 1.4 Z" fill="#5C3A21" />
      {/* Base shadowed canopy */}
      <circle cx="0" cy="-7.2" r="5.4" fill={dark} />
      <circle cx="-3.2" cy="-5.8" r="3.6" fill={dark} />
      <circle cx="3.3" cy="-5.8" r="3.5" fill={dark} />
      {/* Mid foliage puffs */}
      <circle cx="-1" cy="-8.2" r="4.4" fill={mid} />
      <circle cx="2.5" cy="-7" r="3" fill={mid} />
      {/* Sunlit top-left highlight puff */}
      <circle cx="-2.2" cy="-9.4" r="2.6" fill={light} opacity="0.88" />
    </g>
  );
}

function TerrainTileSvg({
  tile,
  season,
  riverMask,
}: {
  readonly tile: TileState;
  readonly season: Season;
  readonly riverMask: { n: boolean; s: boolean; e: boolean; w: boolean };
}) {
  const ox = tile.x * TILE_SIZE;
  const oy = tile.y * TILE_SIZE;
  const h = tileHash(tile.x, tile.y);

  let fillUrl = 'url(#grad-plains)';
  if (tile.terrain === 'forest') {
    fillUrl =
      season === 'autumn'
        ? 'url(#grad-forest-autumn)'
        : season === 'winter'
          ? 'url(#grad-forest-winter)'
          : 'url(#grad-forest)';
  } else if (tile.terrain === 'hills') {
    fillUrl = season === 'winter' ? 'url(#grad-hills-winter)' : 'url(#grad-hills)';
  } else if (tile.terrain === 'mountain') {
    fillUrl = 'url(#grad-mountain)';
  } else if (tile.terrain === 'river') {
    fillUrl =
      season === 'winter'
        ? 'url(#grad-plains-winter)'
        : season === 'autumn'
          ? 'url(#grad-plains-autumn)'
          : 'url(#grad-plains)';
  } else if (season === 'winter') {
    fillUrl = 'url(#grad-plains-winter)';
  } else if (season === 'autumn') {
    fillUrl = 'url(#grad-plains-autumn)';
  }

  // Seasonal conifer + deciduous foliage palettes
  const pineDark = season === 'winter' ? '#253D3B' : '#26442A';
  const pineMid = season === 'winter' ? '#3B5C56' : '#3A623B';
  const pineLight = season === 'winter' ? '#587E77' : '#53824E';

  const oakDark =
    season === 'autumn' ? '#8A3E1B' : season === 'winter' ? '#475569' : '#355A31';
  const oakMid =
    season === 'autumn' ? '#C25E24' : season === 'winter' ? '#64748B' : '#4E7C41';
  const oakLight =
    season === 'autumn' ? '#E59A38' : season === 'winter' ? '#CBD5E1' : '#74A35B';

  const riverPaths = tile.terrain === 'river' ? buildRiverPaths(riverMask, h) : null;

  return (
    <g transform={`translate(${ox},${oy})`}>
      <rect
        width={TILE_SIZE}
        height={TILE_SIZE}
        fill={fillUrl}
        stroke="#1E293B"
        strokeOpacity="0.14"
        strokeWidth="0.55"
      />

      {/* Plains: rolling meadow contours & organic grass tufts */}
      {tile.terrain === 'plains' && (
        <g pointerEvents="none">
          <path
            d={h % 2 === 0 ? 'M6 34 Q18 30 30 35' : 'M14 14 Q26 11 40 15'}
            fill="none"
            stroke={season === 'winter' ? '#CBD5E1' : '#B8B29A'}
            strokeWidth="0.9"
            opacity="0.5"
          />
          <g
            stroke={season === 'winter' ? '#94A3B8' : '#9E9A80'}
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.55"
          >
            <path d={`M${9 + (h % 7)} ${15 + (h % 5)} l-1.5 -3 M${9 + (h % 7)} ${15 + (h % 5)} l1.5 -2.5`} />
            <path d={`M${30 + (h % 9)} ${33 + (h % 6)} l-1.4 -2.8 M${30 + (h % 9)} ${33 + (h % 6)} l1.6 -2.4`} />
          </g>
          {h > 62 && season === 'spring' && (
            <g opacity="0.65">
              <circle cx={14 + (h % 14)} cy={26 + (h % 10)} r="1.1" fill="#FDE047" />
              <circle cx={18 + (h % 12)} cy={24 + (h % 12)} r="0.9" fill="#FEF08A" />
            </g>
          )}
        </g>
      )}

      {/* Forest: lush mixed conifer & deciduous canopy groves rooted on mossy woodland floor */}
      {tile.terrain === 'forest' && (
        <g pointerEvents="none">
          {/* Soft woodland floor undergrowth shadow */}
          <ellipse
            cx="24"
            cy="29"
            rx="19"
            ry="13"
            fill={season === 'autumn' ? '#5C4024' : '#243D24'}
            opacity="0.22"
          />
          {h % 3 === 0 ? (
            <>
              <DeciduousTree x={15} y={23} scale={0.95} dark={oakDark} mid={oakMid} light={oakLight} />
              <LayeredPine x={33} y={25} scale={0.95} dark={pineDark} mid={pineMid} light={pineLight} snow={season === 'winter'} />
              <LayeredPine x={13} y={36} scale={0.9} dark={pineDark} mid={pineMid} light={pineLight} snow={season === 'winter'} />
              <DeciduousTree x={30} y={38} scale={1.0} dark={oakDark} mid={oakMid} light={oakLight} />
            </>
          ) : h % 3 === 1 ? (
            <>
              <LayeredPine x={16} y={22} scale={0.92} dark={pineDark} mid={pineMid} light={pineLight} snow={season === 'winter'} />
              <DeciduousTree x={33} y={24} scale={0.95} dark={oakDark} mid={oakMid} light={oakLight} />
              <DeciduousTree x={18} y={36} scale={1.02} dark={oakDark} mid={oakMid} light={oakLight} />
              <LayeredPine x={35} y={38} scale={0.9} dark={pineDark} mid={pineMid} light={pineLight} snow={season === 'winter'} />
            </>
          ) : (
            <>
              <LayeredPine x={25} y={21} scale={0.95} dark={pineDark} mid={pineMid} light={pineLight} snow={season === 'winter'} />
              <DeciduousTree x={12} y={31} scale={0.92} dark={oakDark} mid={oakMid} light={oakLight} />
              <DeciduousTree x={36} y={32} scale={0.9} dark={oakDark} mid={oakMid} light={oakLight} />
              <LayeredPine x={24} y={39} scale={0.96} dark={pineDark} mid={pineMid} light={pineLight} snow={season === 'winter'} />
            </>
          )}
        </g>
      )}

      {/* Hills: sculpted multi-ridge highland topography with sunlit crests & rocky scree */}
      {tile.terrain === 'hills' && (
        <g pointerEvents="none">
          {/* Far highland ridge */}
          <path
            d={h % 2 === 0 ? 'M3 29 C10 15 21 15 31 28 Z' : 'M15 27 C24 14 35 14 45 28 Z'}
            fill={season === 'winter' ? '#94A3B8' : '#A99672'}
          />
          <path
            d={h % 2 === 0 ? 'M17 17 C22 18 27 22 31 28 L17 28 Z' : 'M30 16 C36 18 41 22 45 28 L30 28 Z'}
            fill="#5C4D36"
            opacity="0.26"
          />
          {/* Foreground rolling ridge */}
          <path
            d={h % 2 === 0 ? 'M11 40 C20 22 34 22 45 40 Z' : 'M3 40 C13 22 27 22 38 40 Z'}
            fill={season === 'winter' ? '#CBD5E1' : '#C7B691'}
          />
          {/* Sunlit western crest sheen */}
          <path
            d={h % 2 === 0 ? 'M14 38 C20 26 26 24 29 25 C24 27 21 32 19 38 Z' : 'M6 38 C12 26 18 24 21 25 C16 27 13 32 11 38 Z'}
            fill={season === 'winter' ? '#F8FAFC' : '#E5DAC0'}
            opacity="0.55"
          />
          {/* Shaded eastern slope */}
          <path
            d={h % 2 === 0 ? 'M29 25 C35 27 41 33 45 40 L28 40 Z' : 'M21 25 C27 27 34 33 38 40 L20 40 Z'}
            fill="#5C4D36"
            opacity="0.24"
          />
          {/* Subtle cartographic contour rim & scree lines */}
          <path
            d={h % 2 === 0 ? 'M4 29 C10 16 21 16 30 28 M12 40 C20 23 34 23 44 40' : 'M16 27 C24 15 35 15 44 28 M4 40 C13 23 27 23 37 40'}
            fill="none"
            stroke="#6E5D43"
            strokeWidth="1.05"
            strokeLinecap="round"
            opacity="0.65"
          />
          <path
            d={h % 2 === 0 ? 'M21 34 Q25 32.5 29 34' : 'M14 34 Q18 32.5 22 34'}
            fill="none"
            stroke="#7C6A4E"
            strokeWidth="0.9"
            opacity="0.55"
          />
        </g>
      )}

      {/* Mountain: dramatic twin alpine ridges with sunlit faces & snowcaps */}
      {tile.terrain === 'mountain' && (
        <g pointerEvents="none">
          <ellipse cx="24" cy="41" rx="20" ry="3.5" fill="#1E293B" opacity="0.32" />
          {/* Left main peak */}
          <polygon points="3,41 18,9 33,41" fill="#474C56" />
          <polygon points="18,9 33,41 21,41" fill="#2F333B" />
          <polygon points="14.2,17 18,9 21.8,17 19.5,15.5 18,18 16.2,15.8" fill="#F1F5F9" />
          {/* Right peak */}
          <polygon points="18,41 32,14 45,41" fill="#5B616E" />
          <polygon points="32,14 45,41 34,41" fill="#373B44" />
          <polygon points="28.6,21 32,14 35.4,21 33.4,19.5 32,21.5 30.3,19.8" fill="#E2E8F0" />
        </g>
      )}

      {/* Organic Curved River Spline with Verdant Verge, Pebble Shore, Water Depths & Flow Streaks */}
      {tile.terrain === 'river' && riverPaths && (
        <g pointerEvents="none">
          {/* 1. Damp verdant riverbank verge */}
          <path
            d={riverPaths.main}
            fill="none"
            stroke={season === 'winter' ? '#B0C4D4' : '#9EB18A'}
            strokeWidth="27"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.6"
          />
          {/* 2. Warm sand/pebble shore bank */}
          <path
            d={riverPaths.main}
            fill="none"
            stroke={season === 'winter' ? '#CBD5E1' : '#C9B996'}
            strokeWidth="22"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 3. Shallow coastal turquoise edge */}
          <path
            d={riverPaths.main}
            fill="none"
            stroke={season === 'winter' ? '#7FB3D5' : '#4E98BA'}
            strokeWidth="17.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 4. Rich mid-channel water */}
          <path
            d={riverPaths.main}
            fill="none"
            stroke={season === 'winter' ? '#568BB0' : '#2E7096'}
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Confluence / spring pool smoothing */}
          {riverPaths.hasPool && (
            <>
              <circle cx="24" cy="24" r="9.5" fill={season === 'winter' ? '#7FB3D5' : '#4E98BA'} />
              <circle cx="24" cy="24" r="6.5" fill={season === 'winter' ? '#568BB0' : '#2E7096'} />
            </>
          )}
          {/* 5. Directional flowing current specular highlights */}
          <path
            className="river-shimmer"
            d={riverPaths.shimmer}
            fill="none"
            stroke={season === 'winter' ? '#E0F2FE' : '#BAE6FD'}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeDasharray="4.5 4.5"
          />
          {/* Tiny riverbank reed tufts along opposite shore */}
          {!riverMask.n && !riverMask.w && (
            <path d="M8 10 L7 6.5 M8 10 L9.5 7 M11 9.5 L11.5 6.5" stroke="#4D6B43" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
          )}
          {!riverMask.s && !riverMask.e && (
            <path d="M39 40 L38 36.5 M39 40 L40.5 37 M42 39.5 L42.5 36.5" stroke="#4D6B43" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
          )}
        </g>
      )}

      {/* Grounded Medieval Iron Ore Crag & Exposed Metallic Vein Seam */}
      {tile.hasIronDeposit && (
        <g transform="translate(24, 24)" pointerEvents="none">
          {/* Rust-ochre iron earth staining & rock shadow */}
          <ellipse cx="10.5" cy="17.2" rx="10.5" ry="3.2" fill="#5C2D16" opacity="0.34" />
          {/* Dark iron-slate rocky outcrop */}
          <polygon
            points="1.5,17 4.5,8.5 10,5.5 16.5,8 20.5,16.5 15,18.5 6,18.5"
            fill="#334155"
            stroke="#0F172A"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* Sunlit upper rock facet */}
          <polygon points="4.5,8.5 10,5.5 14.5,9.5 9.5,13 3.5,13.5" fill="#475569" />
          {/* Raw forged-steel metallic ore seams embedded in rock */}
          <path
            d="M6.5 14.5 L9.8 8.5 L12.8 11 L15.5 9.2"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7.2 14.2 L10 9.2 L12.6 11.4"
            fill="none"
            stroke="#F8FAFC"
            strokeWidth="0.75"
            strokeLinecap="round"
          />
          {/* Warm rust-iron mineral streak */}
          <path
            d="M11 15.8 L14.5 12.8 L17.5 14.5"
            fill="none"
            stroke="#C2410C"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.85"
          />
          {/* Small metallic ore nuggets at crag base */}
          <polygon points="3.5,17.5 5.5,15.5 8,17.5" fill="#64748B" stroke="#0F172A" strokeWidth="0.7" />
          <polygon points="15,17.8 17.2,15.4 19.6,17.8" fill="#94A3B8" stroke="#0F172A" strokeWidth="0.7" />
        </g>
      )}
    </g>
  );
}

function KeepStructureSvg({
  keep,
  hasUnitOnTile,
}: {
  readonly keep: KeepState;
  readonly hasUnitOnTile: boolean;
}) {
  const c = HOUSES[keep.ownerHouseId].colors;
  const ox = keep.x * TILE_SIZE;
  const oy = keep.y * TILE_SIZE;
  const hpRatio = Math.max(0, Math.min(1, keep.keepHp / keep.maxKeepHp));
  const hpColor = hpRatio > 0.5 ? '#22C55E' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
  const foodThreshold = getKeepFoodThreshold(keep);
  const foodRatio = Math.max(0, Math.min(1, keep.foodProgress / Math.max(1, foodThreshold)));
  const shortName = keep.name.length > 11 ? `${keep.name.slice(0, 10)}…` : keep.name;

  return (
    <g transform={`translate(${ox},${oy})`} pointerEvents="none">
      {/* Keep HP bar */}
      <rect x="7" y="2" width="34" height="4.5" rx="2" fill="#0F172A" opacity="0.92" />
      <rect x="7.8" y="2.8" width={32.4 * hpRatio} height="2.9" rx="1.2" fill={hpColor} />

      {/* Ground shadow */}
      <ellipse cx="24" cy="37.5" rx="16.5" ry="4.5" fill="#0F172A" opacity="0.36" />

      {/* Tier-1 Timber Motte-and-Bailey OR Tier-2 Twin-Tower Stone Citadel */}
      {keep.tier === 1 ? (
        <g transform="translate(8, 8)" filter="url(#keep-shadow)">
          {/* Timber curtain palisade */}
          <rect x="4" y="15" width="24" height="14" rx="1.5" fill="#78350F" stroke="#29150A" strokeWidth="1.2" />
          {/* Central wooden donjon */}
          <rect x="9" y="8" width="14" height="18" rx="1" fill="#92400E" stroke="#29150A" strokeWidth="1.2" />
          <polygon points="7,9 16,2 25,9" fill={c.primary} stroke={c.darkStroke} strokeWidth="1.2" />
          {/* Gatehouse arch */}
          <path d="M13 29 V22 A3 3 0 0 1 19 22 V29 Z" fill="#1C1917" />
          {/* Torchlight windows */}
          <rect x="11.5" y="12" width="2.2" height="3" fill="#FDE047" />
          <rect x="18.3" y="12" width="2.2" height="3" fill="#FDE047" />
        </g>
      ) : (
        <g transform="translate(6, 7)" filter="url(#keep-shadow)">
          {/* Stone curtain wall */}
          <rect x="4" y="12" width="28" height="18" rx="1.5" fill="#94A3B8" stroke="#1E293B" strokeWidth="1.2" />
          <rect x="4" y="12" width="28" height="4" fill="#CBD5E1" opacity="0.6" />
          {/* Left & Right crenelated towers */}
          <rect x="2" y="5" width="10" height="25" rx="1" fill="#CBD5E1" stroke="#1E293B" strokeWidth="1.2" />
          <rect x="24" y="5" width="10" height="25" rx="1" fill="#CBD5E1" stroke="#1E293B" strokeWidth="1.2" />
          {/* Tower battlements */}
          <path d="M2 5 V2.5 H5 V5 H9 V2.5 H12 V5 M24 5 V2.5 H27 V5 H31 V2.5 H34 V5" fill="#E2E8F0" stroke="#1E293B" strokeWidth="1" />
          {/* Portcullis archway */}
          <path d="M13.5 30 V20.5 A4.5 4.5 0 0 1 22.5 20.5 V30 Z" fill="#0F172A" />
          <path d="M16 17 V30 M20 17 V30 M13.5 23 H22.5" stroke="#475569" strokeWidth="0.8" />
          {/* Flowing House Banner Pennant */}
          <path d="M18 0.5 V13" stroke="#FEF3C7" strokeWidth="1.3" />
          <path d="M18 1 L28 4.2 L18 7.5 Z" fill={c.primary} stroke={c.darkStroke} strokeWidth="1" />
          {/* Specialization Crest Dot */}
          {keep.specialization !== 'none' && (
            <circle
              cx="18"
              cy="14.5"
              r="2.6"
              fill={
                keep.specialization === 'garrison'
                  ? '#38BDF8'
                  : keep.specialization === 'market_town'
                    ? '#FACC15'
                    : '#4ADE80'
              }
              stroke="#0F172A"
              strokeWidth="0.9"
            />
          )}
        </g>
      )}

      {/* On-Map Keep Nameplate + Miniature Food Bar (hidden only if cluttered? Always clear below tile!) */}
      {!hasUnitOnTile && (
        <g transform="translate(24, 41)">
          <rect
            x="-23"
            y="0"
            width="46"
            height="12"
            rx="4"
            fill="#0F172A"
            fillOpacity="0.88"
            stroke={c.primary}
            strokeWidth="1"
          />
          <text
            x="0"
            y="7.4"
            textAnchor="middle"
            fontSize="6.6"
            fontWeight="700"
            fill="#F8FAFC"
            letterSpacing="0.02em"
          >
            {shortName} {keep.tier === 2 ? '★' : ''}
          </text>
          {/* Mini Food Progress Bar */}
          <rect x="-19" y="9.2" width="38" height="1.8" rx="0.9" fill="#1E293B" />
          <rect x="-19" y="9.2" width={38 * foodRatio} height="1.8" rx="0.9" fill="#22C55E" />
        </g>
      )}
    </g>
  );
}

function UnitTokenSvg({
  unit,
  isActionable,
  isViewerUnit,
}: {
  readonly unit: UnitState;
  readonly isActionable: boolean;
  readonly isViewerUnit: boolean;
}) {
  const c = HOUSES[unit.houseId].colors;
  const ox = unit.x * TILE_SIZE;
  const oy = unit.y * TILE_SIZE;
  const hpRatio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
  const hpColor = hpRatio > 0.5 ? '#22C55E' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
  const hasPenalty = unit.homeKeepId === 'orphaned' || unit.isMutinied;
  const rank = getUnitRank(unit.xp ?? 0);
  const dimmed = isViewerUnit && !isActionable && !unit.isFortified;

  return (
    <g
      className="unit-token-smooth"
      style={{ transform: `translate(${ox}px, ${oy}px)` }}
      pointerEvents="none"
      opacity={dimmed ? 0.76 : 1}
    >
      {/* Active Ready Pulse Ring around Tabletop Base */}
      {isViewerUnit && isActionable && (
        <ellipse
          className="unit-ready-ring"
          cx="25"
          cy="34"
          rx="16.5"
          ry="6.6"
          fill="none"
          stroke="#FDE047"
          strokeWidth="1.7"
        />
      )}

      {/* Grounded Shadow & Tabletop Miniature Pedestal Disc */}
      <ellipse cx="25" cy="35.6" rx="14.2" ry="5" fill="#020617" opacity="0.45" />
      <ellipse
        cx="25"
        cy="34"
        rx="13.5"
        ry="4.8"
        fill={c.primary}
        stroke={
          unit.isFortified
            ? '#34D399'
            : dimmed
              ? '#64748B'
              : '#FEF9C3'
        }
        strokeWidth="1.8"
      />
      <ellipse
        cx="25"
        cy="33.4"
        rx="10.2"
        ry="3.1"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.28"
        strokeWidth="0.9"
      />

      {/* Illustrated Miniature Soldier / Rider / Siege Figure */}
      <g transform="translate(7, 2)" filter="url(#token-shadow)">
        <UnitFigureSvg unitId={unit.typeId} houseId={unit.houseId} />
      </g>

      {/* Fortified Entrenchment Stakes along Front Edge */}
      {unit.isFortified && (
        <g stroke="#451A03" strokeWidth="0.85" fill="#B45309">
          <polygon points="12,37 14,32.5 15.8,37" />
          <polygon points="18,38.2 20,33.2 21.8,38.2" />
          <polygon points="28.2,38.2 30,33.2 32,38.2" />
          <polygon points="34.2,37 36,32.5 38,37" />
        </g>
      )}

      {/* Unit HP Bar */}
      <rect x="11" y="39.5" width="28" height="4.8" rx="2" fill="#0F172A" opacity="0.95" />
      <rect x="11.8" y="40.3" width={26.4 * hpRatio} height="3.2" rx="1.2" fill={hpColor} />

      {/* Veterancy Chevrons (Top-Left) */}
      {rank > 0 && (
        <g transform="translate(4, 3)">
          <circle
            cx="5"
            cy="5"
            r="5.2"
            fill="#0F172A"
            stroke={rank === 2 ? '#FACC15' : '#CBD5E1'}
            strokeWidth="1.2"
          />
          {rank === 1 ? (
            <path d="M2.5 6.2 L5 3.4 L7.5 6.2" stroke="#E2E8F0" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <g stroke="#FACC15" strokeWidth="1.35" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.6 5.2 L5 2.7 L7.4 5.2" />
              <path d="M2.6 7.6 L5 5.1 L7.4 7.6" />
            </g>
          )}
        </g>
      )}

      {/* Supply-Severed / Mutiny Warning Pip (Top-Right) */}
      {hasPenalty && (
        <g transform="translate(35, 3)">
          <circle cx="4.5" cy="4.5" r="4.8" fill="#DC2626" stroke="#FFFFFF" strokeWidth="1.1" />
          <text x="4.5" y="7.2" textAnchor="middle" fontSize="7.2" fontWeight="bold" fill="#FFFFFF">
            !
          </text>
        </g>
      )}
    </g>
  );
}

export function MapBoard({
  state,
  viewerHouseId,
  selectedTileKey,
  reachableKeys,
  attackableKeys,
  buildPreviews,
  showYieldOverlay,
  floatingPopups,
  focusTileKey,
  focusNonce,
  onToggleYieldOverlay,
  onTileTap,
}: MapBoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1.1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Pointer gesture tracking for pan, pinch-to-zoom, and 8px tap disambiguation
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragOriginRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
    moved: boolean;
  } | null>(null);
  const pinchStartRef = useRef<{
    dist: number;
    origZoom: number;
  } | null>(null);

  const centerOnTile = useCallback(
    (tileKey: CoordKey, targetZoom?: number) => {
      const el = containerRef.current;
      const tile = state.tiles[tileKey];
      if (!el || !tile) return;
      const rect = el.getBoundingClientRect();
      const z = targetZoom ?? zoom;
      const tileCenterX = (tile.x + 0.5) * TILE_SIZE * z;
      const tileCenterY = (tile.y + 0.5) * TILE_SIZE * z;
      setOffset({
        x: Math.round(rect.width / 2 - tileCenterX),
        y: Math.round(rect.height / 2 - tileCenterY),
      });
    },
    [state.tiles, zoom],
  );

  useEffect(() => {
    if (focusTileKey) {
      centerOnTile(focusTileKey);
    }
  }, [focusTileKey, focusNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const season = getSeason(state.turnNumber);
  const fogMap = useMemo(() => state.fog[viewerHouseId] ?? {}, [state.fog, viewerHouseId]);
  const tilesArray = useMemo(() => Object.values(state.tiles), [state.tiles]);

  const keepByTile = useMemo(() => {
    const m = new Map<CoordKey, KeepState>();
    for (const k of Object.values(state.keeps)) {
      m.set(k.tileKey, k);
    }
    return m;
  }, [state.keeps]);

  const visibleUnits = useMemo(() => {
    return Object.values(state.units).filter((u) => {
      if (u.houseId === viewerHouseId) return true;
      return fogMap[u.tileKey] === 'visible';
    });
  }, [state.units, viewerHouseId, fogMap]);

  const occupiedTileKeys = useMemo(() => {
    const s = new Set<CoordKey>();
    for (const u of visibleUnits) {
      s.add(u.tileKey);
    }
    return s;
  }, [visibleUnits]);

  const actionableIds = useMemo(() => {
    const s = new Set<string>();
    if (state.activeHouseId !== viewerHouseId || state.phase !== 'player_command') return s;
    for (const u of visibleUnits) {
      if (u.houseId === viewerHouseId && canUnitAct(state, u)) {
        s.add(u.id);
      }
    }
    return s;
  }, [state, viewerHouseId, visibleUnits]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragOriginRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origOffsetX: offset.x,
        origOffsetY: offset.y,
        moved: false,
      };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      pinchStartRef.current = { dist: Math.max(1, dist), origZoom: zoom };
      if (dragOriginRef.current) {
        dragOriginRef.current.moved = true;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, pinchStartRef.current.origZoom * (dist / pinchStartRef.current.dist)),
      );
      setZoom(nextZoom);
      return;
    }

    const drag = dragOriginRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }
    if (drag.moved) {
      setOffset({
        x: drag.origOffsetX + dx,
        y: drag.origOffsetY + dy,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragOriginRef.current;
    const wasTap =
      drag !== null &&
      drag.pointerId === e.pointerId &&
      !drag.moved &&
      pointersRef.current.size === 1;

    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      dragOriginRef.current = null;
    }

    if (wasTap && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const boardX = (e.clientX - rect.left - offset.x) / zoom;
      const boardY = (e.clientY - rect.top - offset.y) / zoom;
      const tx = Math.floor(boardX / TILE_SIZE);
      const ty = Math.floor(boardY / TILE_SIZE);
      if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE) {
        onTileTap(`${tx},${ty}`);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((z * factor).toFixed(2)))));
  };

  const handleRecenter = () => {
    const capital =
      Object.values(state.keeps).find((k) => k.ownerHouseId === viewerHouseId && k.isCapital) ??
      Object.values(state.keeps).find((k) => k.ownerHouseId === viewerHouseId);
    if (capital) {
      centerOnTile(capital.tileKey);
    }
  };

  const seasonalAtmosphere =
    season === 'winter'
      ? 'rgba(186, 230, 253, 0.08)'
      : season === 'autumn'
        ? 'rgba(217, 119, 6, 0.07)'
        : season === 'summer'
          ? 'rgba(250, 204, 21, 0.05)'
          : 'rgba(34, 197, 94, 0.04)';

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full overflow-hidden bg-[#0B1120] select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <div
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          transformOrigin: '0 0',
          width: BOARD_PX,
          height: BOARD_PX,
        }}
      >
        <svg
          width={BOARD_PX}
          height={BOARD_PX}
          viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}
          role="img"
          aria-label="Marchlands 22 by 22 frontier map"
        >
          <defs>
            {/* Terrain Gradients */}
            <linearGradient id="grad-plains" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#DFDCCB" />
              <stop offset="100%" stopColor="#CCC7B2" />
            </linearGradient>
            <linearGradient id="grad-plains-autumn" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E1D5B8" />
              <stop offset="100%" stopColor="#CCB995" />
            </linearGradient>
            <linearGradient id="grad-plains-winter" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>
            <linearGradient id="grad-forest" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#89A87E" />
              <stop offset="100%" stopColor="#6B8B63" />
            </linearGradient>
            <linearGradient id="grad-forest-autumn" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#A68B64" />
              <stop offset="100%" stopColor="#826747" />
            </linearGradient>
            <linearGradient id="grad-forest-winter" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8FA6A1" />
              <stop offset="100%" stopColor="#6D8480" />
            </linearGradient>
            <linearGradient id="grad-hills" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#C7B898" />
              <stop offset="100%" stopColor="#A99877" />
            </linearGradient>
            <linearGradient id="grad-hills-winter" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#CBD5E1" />
              <stop offset="100%" stopColor="#94A3B8" />
            </linearGradient>
            <linearGradient id="grad-mountain" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#777D88" />
              <stop offset="100%" stopColor="#565B64" />
            </linearGradient>

            {/* Cartographic Unexplored Parchment-Night Pattern */}
            <pattern id="fog-pattern" width="48" height="48" patternUnits="userSpaceOnUse">
              <rect width="48" height="48" fill="#131722" />
              <path d="M48 0 H0 V48" fill="none" stroke="#1E2536" strokeWidth="0.8" />
              <path d="M22 24 H26 M24 22 V26" stroke="#252E42" strokeWidth="0.7" />
            </pattern>

            {/* Soft Drop Shadows */}
            <filter id="token-shadow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="1.8" stdDeviation="1.4" floodColor="#020617" floodOpacity="0.55" />
            </filter>
            <filter id="keep-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#020617" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Outer Cartographic Frame */}
          <rect width={BOARD_PX} height={BOARD_PX} fill="url(#fog-pattern)" />

          {/* Layer 1: Base Terrain & Owned Territory Wash */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'unexplored') return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            const ownerColor = tile.ownerHouseId ? HOUSES[tile.ownerHouseId].colors.primary : null;
            const riverMask =
              tile.terrain === 'river'
                ? {
                    n: state.tiles[`${tile.x},${tile.y - 1}`]?.terrain === 'river',
                    s: state.tiles[`${tile.x},${tile.y + 1}`]?.terrain === 'river',
                    e: state.tiles[`${tile.x + 1},${tile.y}`]?.terrain === 'river',
                    w: state.tiles[`${tile.x - 1},${tile.y}`]?.terrain === 'river',
                  }
                : { n: false, s: false, e: false, w: false };

            return (
              <g key={`t_${tile.key}`}>
                <TerrainTileSvg tile={tile} season={season} riverMask={riverMask} />
                {ownerColor && (
                  <rect
                    x={ox}
                    y={oy}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                    fill={ownerColor}
                    fillOpacity="0.13"
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}

          {/* Layer 2: Sticky Keep Perimeter Dashed Borders */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'unexplored' || !tile.keepId || !tile.ownerHouseId) return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            const color = HOUSES[tile.ownerHouseId].colors.primary;
            const dark = HOUSES[tile.ownerHouseId].colors.darkStroke;
            const topDiff = state.tiles[`${tile.x},${tile.y - 1}`]?.keepId !== tile.keepId;
            const bottomDiff = state.tiles[`${tile.x},${tile.y + 1}`]?.keepId !== tile.keepId;
            const leftDiff = state.tiles[`${tile.x - 1},${tile.y}`]?.keepId !== tile.keepId;
            const rightDiff = state.tiles[`${tile.x + 1},${tile.y}`]?.keepId !== tile.keepId;

            if (!topDiff && !bottomDiff && !leftDiff && !rightDiff) return null;

            return (
              <g key={`b_${tile.key}`} pointerEvents="none">
                <g stroke={dark} strokeWidth="3.6" strokeOpacity="0.45" strokeDasharray="6 3">
                  {topDiff && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + 1.5} />}
                  {bottomDiff && <line x1={ox + 1.5} y1={oy + TILE_SIZE - 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                  {leftDiff && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + 1.5} y2={oy + TILE_SIZE - 1.5} />}
                  {rightDiff && <line x1={ox + TILE_SIZE - 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                </g>
                <g stroke={color} strokeWidth="2.3" strokeDasharray="6 3">
                  {topDiff && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + 1.5} />}
                  {bottomDiff && <line x1={ox + 1.5} y1={oy + TILE_SIZE - 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                  {leftDiff && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + 1.5} y2={oy + TILE_SIZE - 1.5} />}
                  {rightDiff && <line x1={ox + TILE_SIZE - 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                </g>
              </g>
            );
          })}

          {/* Layer 3: Improvements & Landmarks (Grounded Illustrations + Landmark HP Bars) */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'unexplored' || keepByTile.has(tile.key)) return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;

            if (tile.improvement) {
              return (
                <g
                  key={`imp_${tile.key}`}
                  transform={`translate(${ox + 3},${oy + 21}) scale(0.96)`}
                  pointerEvents="none"
                >
                  <ImprovementGlyphSvg id={tile.improvement} />
                </g>
              );
            }

            if (tile.landmark !== 'none' && !tile.landmarkCleared) {
              const hpRatio =
                tile.landmark === 'frontier_village' && tile.villageHp !== null
                  ? tile.villageHp / VILLAGE_MAX_HP
                  : tile.landmark === 'outlaw_camp' && tile.banditHp !== null
                    ? tile.banditHp / BANDIT_MAX_HP
                    : null;

              return (
                <g key={`lm_${tile.key}`} pointerEvents="none">
                  <g transform={`translate(${ox + 11},${oy + 13}) scale(1.1)`}>
                    <LandmarkGlyphSvg landmark={tile.landmark} />
                  </g>
                  {hpRatio !== null && (
                    <g transform={`translate(${ox + 10}, ${oy + 4})`}>
                      <rect width="28" height="4" rx="1.8" fill="#0F172A" opacity="0.9" />
                      <rect
                        x="0.8"
                        y="0.8"
                        width={Math.max(0, Math.min(1, hpRatio)) * 26.4}
                        height="2.4"
                        rx="1"
                        fill={tile.landmark === 'outlaw_camp' ? '#EF4444' : '#F59E0B'}
                      />
                    </g>
                  )}
                </g>
              );
            }
            return null;
          })}

          {/* Layer 3b: Optional Owned Tile Yield Badges */}
          {showYieldOverlay &&
            tilesArray.map((tile) => {
              if (tile.ownerHouseId !== viewerHouseId || keepByTile.has(tile.key)) return null;
              if (fogMap[tile.key] === 'unexplored') return null;
              const y = computeTileYield(state, tile.key);
              if (y.food === 0 && y.materials === 0 && y.coin === 0) return null;
              const ox = tile.x * TILE_SIZE;
              const oy = tile.y * TILE_SIZE;
              const chips: Array<{ text: string; fill: string }> = [];
              if (y.food > 0) chips.push({ text: `+${y.food}`, fill: '#16A34A' });
              if (y.materials > 0) chips.push({ text: `+${y.materials}`, fill: '#D97706' });
              if (y.coin > 0) chips.push({ text: `+${y.coin}`, fill: '#CA8A04' });

              return (
                <g key={`yld_${tile.key}`} transform={`translate(${ox + 3}, ${oy + 3})`} pointerEvents="none">
                  {chips.map((ch, idx) => (
                    <g key={idx} transform={`translate(${idx * 14.5}, 0)`}>
                      <rect width="13.5" height="9.5" rx="3" fill="#0F172A" fillOpacity="0.82" stroke={ch.fill} strokeWidth="0.8" />
                      <text x="6.75" y="7.1" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#F8FAFC">
                        {ch.text}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}

          {/* Layer 4: Keeps */}
          {Array.from(keepByTile.values()).map((keep) => {
            const fog: FogStatus = fogMap[keep.tileKey] ?? 'unexplored';
            if (fog === 'unexplored') return null;
            return (
              <KeepStructureSvg
                key={keep.id}
                keep={keep}
                hasUnitOnTile={occupiedTileKeys.has(keep.tileKey)}
              />
            );
          })}

          {/* Layer 4b: Subtle Seasonal Atmosphere Tint */}
          <rect
            width={BOARD_PX}
            height={BOARD_PX}
            fill={seasonalAtmosphere}
            pointerEvents="none"
          />

          {/* Layer 5: Organic Fog of War (Unexplored Shroud + Feathered Edges + Explored Dusk Veil) */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'visible') return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            if (fog === 'unexplored') {
              return null; // Base board already renders fog-pattern
            }
            // Explored (remembered) dusk veil + soft shadow edges against unexplored neighbors
            const nUnexp = fogMap[`${tile.x},${tile.y - 1}`] === 'unexplored';
            const sUnexp = fogMap[`${tile.x},${tile.y + 1}`] === 'unexplored';
            const wUnexp = fogMap[`${tile.x - 1},${tile.y}`] === 'unexplored';
            const eUnexp = fogMap[`${tile.x + 1},${tile.y}`] === 'unexplored';

            return (
              <g key={`fog_${tile.key}`} pointerEvents="none">
                <rect
                  x={ox}
                  y={oy}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  fill="#0B1325"
                  fillOpacity="0.46"
                />
                {nUnexp && <rect x={ox} y={oy} width={TILE_SIZE} height="5" fill="#131722" opacity="0.55" />}
                {sUnexp && <rect x={ox} y={oy + TILE_SIZE - 5} width={TILE_SIZE} height="5" fill="#131722" opacity="0.55" />}
                {wUnexp && <rect x={ox} y={oy} width="5" height={TILE_SIZE} fill="#131722" opacity="0.55" />}
                {eUnexp && <rect x={ox + TILE_SIZE - 5} y={oy} width="5" height={TILE_SIZE} fill="#131722" opacity="0.55" />}
              </g>
            );
          })}

          {/* Soft feather on visible tiles bordering unexplored shroud */}
          {tilesArray.map((tile) => {
            if (fogMap[tile.key] !== 'visible') return null;
            const nUnexp = fogMap[`${tile.x},${tile.y - 1}`] === 'unexplored';
            const sUnexp = fogMap[`${tile.x},${tile.y + 1}`] === 'unexplored';
            const wUnexp = fogMap[`${tile.x - 1},${tile.y}`] === 'unexplored';
            const eUnexp = fogMap[`${tile.x + 1},${tile.y}`] === 'unexplored';
            if (!nUnexp && !sUnexp && !wUnexp && !eUnexp) return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            return (
              <g key={`fedge_${tile.key}`} pointerEvents="none">
                {nUnexp && <rect x={ox} y={oy} width={TILE_SIZE} height="4" fill="#131722" opacity="0.45" />}
                {sUnexp && <rect x={ox} y={oy + TILE_SIZE - 4} width={TILE_SIZE} height="4" fill="#131722" opacity="0.45" />}
                {wUnexp && <rect x={ox} y={oy} width="4" height={TILE_SIZE} fill="#131722" opacity="0.45" />}
                {eUnexp && <rect x={ox + TILE_SIZE - 4} y={oy} width="4" height={TILE_SIZE} fill="#131722" opacity="0.45" />}
              </g>
            );
          })}

          {/* Layer 6: Visible Units */}
          {visibleUnits.map((u) => (
            <UnitTokenSvg
              key={u.id}
              unit={u}
              isActionable={actionableIds.has(u.id)}
              isViewerUnit={u.houseId === viewerHouseId}
            />
          ))}

          {/* Layer 7: Tactical Overlays (Reachable, Attackable, Build Preview, Selected) */}
          {Array.from(reachableKeys).map((k) => {
            const t = state.tiles[k];
            if (!t) return null;
            return (
              <rect
                key={`reach_${k}`}
                x={t.x * TILE_SIZE + 2.5}
                y={t.y * TILE_SIZE + 2.5}
                width={TILE_SIZE - 5}
                height={TILE_SIZE - 5}
                rx="4"
                fill="#38BDF8"
                fillOpacity="0.26"
                stroke="#0EA5E9"
                strokeWidth="2"
                pointerEvents="none"
              />
            );
          })}

          {Array.from(attackableKeys).map((k) => {
            const t = state.tiles[k];
            if (!t) return null;
            const ox = t.x * TILE_SIZE;
            const oy = t.y * TILE_SIZE;
            return (
              <g key={`atk_${k}`} pointerEvents="none">
                <rect
                  x={ox + 2}
                  y={oy + 2}
                  width={TILE_SIZE - 4}
                  height={TILE_SIZE - 4}
                  rx="4"
                  fill="#EF4444"
                  fillOpacity="0.32"
                />
                <path
                  d={`M${ox + 3} ${oy + 12} V${oy + 3} H${ox + 12} M${ox + 36} ${oy + 3} H${ox + 45} V${oy + 12} M${ox + 3} ${oy + 36} V${oy + 45} H${ox + 12} M${ox + 36} ${oy + 45} H${ox + 45} V${oy + 36}`}
                  stroke="#DC2626"
                  strokeWidth="2.5"
                  fill="none"
                />
              </g>
            );
          })}

          {Array.from(buildPreviews.entries()).map(([k, preview]) => {
            const t = state.tiles[k];
            if (!t || !preview.canBuild) return null;
            const ox = t.x * TILE_SIZE;
            const oy = t.y * TILE_SIZE;
            const parts: string[] = [];
            if (preview.deltaYield.food > 0) parts.push(`+${preview.deltaYield.food}F`);
            if (preview.deltaYield.materials > 0) parts.push(`+${preview.deltaYield.materials}M`);
            if (preview.deltaYield.coin > 0) parts.push(`+${preview.deltaYield.coin}C`);
            const pill = parts.join(' ') || 'BUILD';

            return (
              <g key={`bld_${k}`} pointerEvents="none">
                <rect
                  x={ox + 2}
                  y={oy + 2}
                  width={TILE_SIZE - 4}
                  height={TILE_SIZE - 4}
                  rx="4"
                  fill="#22C55E"
                  fillOpacity="0.28"
                  stroke="#16A34A"
                  strokeWidth="2"
                />
                <rect x={ox + 3} y={oy + 3} width="42" height="14" rx="7" fill="#14532D" stroke="#4ADE80" strokeWidth="0.9" />
                <text
                  x={ox + 24}
                  y={oy + 12.8}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="700"
                  fill="#FFFFFF"
                >
                  {pill}
                </text>
              </g>
            );
          })}

          {selectedTileKey && state.tiles[selectedTileKey] && (
            <rect
              className="selected-tile-frame"
              x={state.tiles[selectedTileKey]!.x * TILE_SIZE + 1.5}
              y={state.tiles[selectedTileKey]!.y * TILE_SIZE + 1.5}
              width={TILE_SIZE - 3}
              height={TILE_SIZE - 3}
              rx="5"
              fill="none"
              stroke="#FACC15"
              strokeWidth="3"
              pointerEvents="none"
            />
          )}

          {/* Layer 8: Floating Action & Combat Callouts */}
          {floatingPopups.map((p) => {
            const t = state.tiles[p.tileKey];
            if (!t) return null;
            const cx = t.x * TILE_SIZE + 24;
            const cy = t.y * TILE_SIZE + 14;
            return (
              <g key={p.id} transform={`translate(${cx}, ${cy})`} pointerEvents="none">
                <g className="map-float-callout">
                  <rect
                    x="-26"
                    y="-10"
                    width="52"
                    height="15"
                    rx="7"
                    fill="#0F172A"
                    fillOpacity="0.92"
                    stroke={p.color}
                    strokeWidth="1.2"
                  />
                  <text
                    x="0"
                    y="0.5"
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="800"
                    fill={p.color}
                  >
                    {p.text}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating Map Controls: Zoom, Recenter & Tile Yield Toggle (>= 44x44 targets, 8px gaps) */}
      <div className="absolute right-2 bottom-2 flex flex-col gap-2 z-20">
        <button
          type="button"
          onClick={onToggleYieldOverlay}
          className={`touch-target flex items-center justify-center rounded-xl border text-[11px] font-bold shadow-lg active:scale-95 transition ${
            showYieldOverlay
              ? 'bg-emerald-900/90 border-emerald-400/80 text-emerald-100'
              : 'bg-[#162033]/92 border-slate-600 text-slate-300'
          }`}
          aria-label="Toggle tile yields overlay"
        >
          Yields
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))))}
          className="touch-target flex items-center justify-center rounded-xl bg-[#162033]/92 border border-slate-600 text-slate-100 text-lg font-bold shadow-lg active:bg-slate-700"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.25).toFixed(2))))}
          className="touch-target flex items-center justify-center rounded-xl bg-[#162033]/92 border border-slate-600 text-slate-100 text-lg font-bold shadow-lg active:bg-slate-700"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleRecenter}
          className="touch-target flex items-center justify-center rounded-xl bg-[#162033]/92 border border-amber-500/50 text-amber-200 text-xs font-bold shadow-lg active:bg-slate-700"
          aria-label="Center on capital"
        >
          Keep
        </button>
      </div>
    </div>
  );
}
