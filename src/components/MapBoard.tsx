/**
 * Marchlands (Spec v2.0) — Dynamic 22x22 / 28x28 / 34x34 Cartographic Inline SVG MapBoard
 *
 * Upgraded v2.0 visual rendering (100% inline SVG, zero external rasters):
 * - Dynamic state.gridSize support (22x22 Compact, 28x28 Standard, 34x34 Grand March)
 * - Connected cobbled Road network, Orthogonal Wall Links, Level-2 'II' badges
 * - Frontier Outposts (3x3 territories + structure HP bars), Central Ruined High Seat
 * - Tier-1, Tier-2 & Tier-3 Grand Citadel architecture + Forge Seat crest
 * - Lord-Commander crown badge, Ranged Overwatch stance ring, Deployed Trebuchet brace
 * - 4-Resource yield badges (Food, Materials, Iron, Coin)
 * - Interactive 34x34 Tactical Minimap & Quick-Jump bar (Capital, Commander, Keeps, Outposts, High Seat)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CoordKey,
  FogStatus,
  GameState,
  HouseId,
  KeepState,
  OutpostState,
  Season,
  TileState,
  UnitState,
} from '../types/game.ts';
import {
  BANDIT_MAX_HP,
  HIGH_SEAT_MAX_HP,
  HOUSES,
  IMPROVEMENTS,
  OUTPOST_MAX_HP,
  VILLAGE_MAX_HP,
} from '../data/index.ts';
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
const MAX_ZOOM = 2.0;
const DRAG_THRESHOLD_PX = 8;

interface MapBoardProps {
  readonly state: GameState;
  readonly viewerHouseId: HouseId;
  readonly selectedTileKey: CoordKey | null;
  readonly reachableKeys: ReadonlySet<CoordKey>;
  readonly attackableKeys: ReadonlySet<CoordKey>;
  readonly specialTargetKeys?: ReadonlySet<CoordKey>;
  readonly specialTargetKind?: 'outpost' | 'volley' | 'beacon' | null;
  readonly buildPreviews: ReadonlyMap<CoordKey, BuildPreviewInfo>;
  readonly showYieldOverlay: boolean;
  readonly showMinimap?: boolean;
  readonly showZoomButtons?: boolean;
  readonly floatingPopups: readonly MapFloatingPopup[];
  readonly focusTileKey: CoordKey | null;
  readonly focusNonce: number;
  readonly onToggleYieldOverlay: () => void;
  readonly onToggleMinimap?: () => void;
  readonly onTileTap: (tileKey: CoordKey) => void;
}

/** Pure deterministic visual hash (0..99) for organic tile variation. */
function tileHash(x: number, y: number): number {
  return ((x * 73 + y * 137 + x * y * 19) & 0x7fffffff) % 100;
}

interface WorldRiverNetwork {
  readonly mainPath: string;
  readonly terminalOuterPath: string;
  readonly terminalInnerPath: string;
  readonly springPools: ReadonlyArray<{ x: number; y: number }>;
  readonly poolCenters: ReadonlyArray<{ x: number; y: number }>;
  readonly wavelets: ReadonlyArray<{ d: string; opacity: number }>;
  readonly wideCorners: ReadonlyArray<{ x: number; y: number }>;
  readonly reedSpots: ReadonlyArray<{ x: number; y: number }>;
}

/**
 * Builds ONE unified world-space SVG river network across all explored river tiles.
 * Uses clean C1-continuous curves with solid pre-blended layer colors, and smoothly
 * tapers interior river terminals into narrower spring tips/ponds rather than blunt bars.
 */
function buildWorldRiverNetwork(
  allTiles: Record<CoordKey, TileState>,
  exploredRiverTiles: readonly TileState[],
  gridSize: number,
): WorldRiverNetwork {
  const mainSegs: string[] = [];
  const terminalOuterSegs: string[] = [];
  const terminalInnerSegs: string[] = [];
  const springPools: Array<{ x: number; y: number }> = [];
  const poolCenters: Array<{ x: number; y: number }> = [];
  const wavelets: Array<{ d: string; opacity: number }> = [];
  const wideCorners: Array<{ x: number; y: number }> = [];
  const reedSpots: Array<{ x: number; y: number }> = [];

  for (const tile of exploredRiverTiles) {
    const ox = tile.x * TILE_SIZE;
    const oy = tile.y * TILE_SIZE;
    const cx = ox + 24;
    const cy = oy + 24;
    const h = tileHash(tile.x, tile.y);
    const sway = (h % 2 === 0 ? 1 : -1) * (2.6 + (h % 3) * 0.8);

    const n = tile.y === 0 || allTiles[`${tile.x},${tile.y - 1}`]?.terrain === 'river';
    const s = tile.y === gridSize - 1 || allTiles[`${tile.x},${tile.y + 1}`]?.terrain === 'river';
    const w = tile.x === 0 || allTiles[`${tile.x - 1},${tile.y}`]?.terrain === 'river';
    const e = tile.x === gridSize - 1 || allTiles[`${tile.x + 1},${tile.y}`]?.terrain === 'river';

    // Fill 2x2 river cluster corners smoothly so wide bends become natural river basins
    if (n && e && allTiles[`${tile.x + 1},${tile.y - 1}`]?.terrain === 'river') {
      wideCorners.push({ x: ox + 48, y: oy });
    }

    const ny = tile.y === 0 ? oy - 14 : oy;
    const sy = tile.y === gridSize - 1 ? oy + 62 : oy + 48;
    const wx = tile.x === 0 ? ox - 14 : ox;
    const ex = tile.x === gridSize - 1 ? ox + 62 : ox + 48;

    const count = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);

    if (count === 0) {
      // Isolated spring pond
      springPools.push({ x: cx, y: cy });
    } else if (count === 1) {
      // Interior river terminal: smoothly taper from edge into a gentle spring tip/pond
      if (n) {
        mainSegs.push(`M${cx},${ny} L${cx},${oy + 6}`);
        terminalOuterSegs.push(`M${cx},${oy + 4} Q${cx + sway * 0.5},${oy + 14} ${cx},${oy + 22}`);
        terminalInnerSegs.push(`M${cx},${oy + 16} Q${cx - sway * 0.3},${oy + 24} ${cx},${oy + 30}`);
        springPools.push({ x: cx, y: oy + 29 });
      } else if (s) {
        mainSegs.push(`M${cx},${sy} L${cx},${oy + 42}`);
        terminalOuterSegs.push(`M${cx},${oy + 44} Q${cx + sway * 0.5},${oy + 34} ${cx},${oy + 26}`);
        terminalInnerSegs.push(`M${cx},${oy + 32} Q${cx - sway * 0.3},${oy + 24} ${cx},${oy + 18}`);
        springPools.push({ x: cx, y: oy + 19 });
      } else if (w) {
        mainSegs.push(`M${wx},${cy} L${ox + 6},${cy}`);
        terminalOuterSegs.push(`M${ox + 4},${cy} Q${ox + 14},${cy + sway * 0.5} ${ox + 22},${cy}`);
        terminalInnerSegs.push(`M${ox + 16},${cy} Q${ox + 24},${cy - sway * 0.3} ${ox + 30},${cy}`);
        springPools.push({ x: ox + 29, y: cy });
      } else {
        mainSegs.push(`M${ex},${cy} L${ox + 42},${cy}`);
        terminalOuterSegs.push(`M${ox + 44},${cy} Q${ox + 34},${cy + sway * 0.5} ${ox + 26},${cy}`);
        terminalInnerSegs.push(`M${ox + 32},${cy} Q${ox + 24},${cy - sway * 0.3} ${ox + 18},${cy}`);
        springPools.push({ x: ox + 19, y: cy });
      }
    } else if (count === 2) {
      if (n && s) {
        mainSegs.push(
          `M${cx},${ny} C${cx},${oy + 11} ${cx + sway},${oy + 17} ${cx},${cy} C${cx - sway},${oy + 31} ${cx},${oy + 37} ${cx},${sy}`,
        );
      } else if (w && e) {
        mainSegs.push(
          `M${wx},${cy} C${ox + 11},${cy} ${ox + 17},${cy + sway} ${cx},${cy} C${ox + 31},${cy - sway} ${ox + 37},${cy} ${ex},${cy}`,
        );
      } else if (n && e) {
        mainSegs.push(`M${cx},${ny} Q${cx},${cy} ${ex},${cy}`);
      } else if (n && w) {
        mainSegs.push(`M${cx},${ny} Q${cx},${cy} ${wx},${cy}`);
      } else if (s && e) {
        mainSegs.push(`M${cx},${sy} Q${cx},${cy} ${ex},${cy}`);
      } else {
        mainSegs.push(`M${cx},${sy} Q${cx},${cy} ${wx},${cy}`);
      }
    } else {
      if (n && s) mainSegs.push(`M${cx},${ny} L${cx},${sy}`);
      if (w && e) mainSegs.push(`M${wx},${cy} L${ex},${cy}`);
      if (n && e) mainSegs.push(`M${cx},${ny} Q${cx},${cy} ${ex},${cy}`);
      if (n && w) mainSegs.push(`M${cx},${ny} Q${cx},${cy} ${wx},${cy}`);
      if (s && e) mainSegs.push(`M${cx},${sy} Q${cx},${cy} ${ex},${cy}`);
      if (s && w) mainSegs.push(`M${cx},${sy} Q${cx},${cy} ${wx},${cy}`);
      poolCenters.push({ x: cx, y: cy });
    }

    // Staggered, asymmetric gentle water wavelets
    const wShiftX = ((h % 7) - 3) * 1.2;
    const wShiftY = (((h >> 1) % 7) - 3) * 1.2;
    if (n && s && !e && !w) {
      wavelets.push({
        d: `M${cx - 4.5 + wShiftX * 0.4},${oy + 12} Q${cx - 0.5 + wShiftX * 0.4},${oy + 10.6} ${cx + 3.5 + wShiftX * 0.4},${oy + 12}`,
        opacity: 0.55,
      });
      wavelets.push({
        d: `M${cx - 2 - wShiftX * 0.3},${oy + 28} Q${cx + 2 - wShiftX * 0.3},${oy + 26.6} ${cx + 6 - wShiftX * 0.3},${oy + 28}`,
        opacity: 0.46,
      });
      if (h % 2 === 0) {
        wavelets.push({
          d: `M${cx - 5.5},${oy + 39} Q${cx - 2},${oy + 37.8} ${cx + 1.5},${oy + 39}`,
          opacity: 0.42,
        });
      }
    } else if (w && e && !n && !s) {
      wavelets.push({
        d: `M${ox + 10},${cy - 3.5 + wShiftY * 0.4} Q${ox + 15},${cy - 5 + wShiftY * 0.4} ${ox + 20},${cy - 3.5 + wShiftY * 0.4}`,
        opacity: 0.55,
      });
      wavelets.push({
        d: `M${ox + 26},${cy + 3.5 - wShiftY * 0.3} Q${ox + 31.5},${cy + 2 - wShiftY * 0.3} ${ox + 37},${cy + 3.5 - wShiftY * 0.3}`,
        opacity: 0.46,
      });
    } else if (count >= 2) {
      wavelets.push({
        d: `M${cx - 4.5 + wShiftX * 0.3},${cy - 1.5} Q${cx},${cy - 3.3} ${cx + 4.5 + wShiftX * 0.3},${cy - 1.5}`,
        opacity: 0.52,
      });
      wavelets.push({
        d: `M${cx - 2.5},${cy + 4} Q${cx + 1.5},${cy + 2.5} ${cx + 5.5},${cy + 4}`,
        opacity: 0.44,
      });
    } else {
      // Delicate spring ripple
      wavelets.push({
        d: `M${cx - 3},${cy} Q${cx},${cy - 1.8} ${cx + 3},${cy}`,
        opacity: 0.5,
      });
    }

    // Subtle bankside reeds on dry outer corners
    if (!n && !w && h % 2 === 0) {
      reedSpots.push({ x: ox + 7, y: oy + 10 });
    }
    if (!s && !e && h % 2 === 1) {
      reedSpots.push({ x: ox + 40, y: oy + 40 });
    }
  }

  return {
    mainPath: mainSegs.join(' '),
    terminalOuterPath: terminalOuterSegs.join(' '),
    terminalInnerPath: terminalInnerSegs.join(' '),
    springPools,
    poolCenters,
    wavelets,
    wideCorners,
    reedSpots,
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
}: {
  readonly tile: TileState;
  readonly season: Season;
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

  return (
    <g transform={`translate(${ox},${oy})`}>
      <rect
        width={TILE_SIZE}
        height={TILE_SIZE}
        fill={fillUrl}
        stroke="#1E2430"
        strokeOpacity={tile.terrain === 'river' ? '0.025' : '0.055'}
        strokeWidth="0.45"
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

      {/* Grounded Medieval Iron Ore Crag & Exposed Metallic Vein Seam */}
      {tile.hasIronDeposit && (
        <g transform="translate(24, 24)" pointerEvents="none">
          {/* Rust-ochre iron earth staining & rock shadow */}
          <ellipse cx="10.5" cy="17.2" rx="10.5" ry="3.2" fill="#5C2D16" opacity="0.34" />
          {/* Dark iron-slate rocky outcrop */}
          <polygon
            points="1.5,17 4.5,8.5 10,5.5 16.5,8 20.5,16.5 15,18.5 6,18.5"
            fill="#334155"
            stroke="#1E2430"
            strokeWidth="0.8"
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

function StructureHpBarSvg({
  hpRatio,
  fillColor,
}: {
  readonly hpRatio: number;
  readonly fillColor: string;
}) {
  const clamped = Math.max(0, Math.min(1, hpRatio));
  return (
    <g pointerEvents="none">
      {/* Tiny minimalist shield/tower icon distinguishing Structure HP from Unit HP */}
      <path
        d="M3.2 2.2 H8.2 V5.1 C8.2 6.4 6.9 7.3 5.7 7.8 C4.5 7.3 3.2 6.4 3.2 5.1 Z"
        fill="#16181D"
        stroke="#CBD5E1"
        strokeWidth="0.65"
        strokeLinejoin="round"
      />
      <rect x="4.8" y="3.4" width="1.8" height="2.4" rx="0.4" fill="#CBD5E1" opacity="0.85" />
      {/* Framed Structure HP bar */}
      <rect
        x="9.8"
        y="2"
        width="34"
        height="5.2"
        rx="1.8"
        fill="#16181D"
        fillOpacity="0.94"
        stroke="#CBD5E1"
        strokeOpacity="0.55"
        strokeWidth="0.65"
      />
      <rect x="10.7" y="2.9" width={32.2 * clamped} height="3.4" rx="1" fill={fillColor} />
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

  return (
    <g transform={`translate(${ox},${oy})`} pointerEvents="none">
      {/* Distinct Structure HP bar (always full opacity at top of tile) */}
      <StructureHpBarSvg hpRatio={hpRatio} fillColor={hpColor} />

      {/* Underlying Keep geometry — slightly dimmed when occupied so garrisoned unit pops */}
      <g opacity={hasUnitOnTile ? 0.78 : 1}>
        {/* Ground shadow */}
        <ellipse cx="24" cy="37.5" rx="16.5" ry="4.5" fill="#1E2430" opacity="0.32" />

        {/* Tier-1 Timber Motte-and-Bailey OR Tier-2 Twin-Tower Stone Citadel */}
        {keep.tier === 1 ? (
          <g transform="translate(8, 8)" filter="url(#keep-shadow)">
            {/* Timber curtain palisade */}
            <rect x="4" y="15" width="24" height="14" rx="1.5" fill="#78350F" stroke="#3B2314" strokeWidth="0.95" />
            {/* Central wooden donjon */}
            <rect x="9" y="8" width="14" height="18" rx="1" fill="#92400E" stroke="#3B2314" strokeWidth="0.95" />
            <polygon points="7,9 16,2 25,9" fill={c.primary} stroke={c.darkStroke} strokeWidth="0.95" />
            {/* Gatehouse arch */}
            <path d="M13 29 V22 A3 3 0 0 1 19 22 V29 Z" fill="#1E2430" />
            {/* Torchlight windows */}
            <rect x="11.5" y="12" width="2.2" height="3" fill="#FDE047" />
            <rect x="18.3" y="12" width="2.2" height="3" fill="#FDE047" />
          </g>
        ) : (
          <g transform="translate(6, 7)" filter="url(#keep-shadow)">
            {/* Stone curtain wall */}
            <rect x="4" y="12" width="28" height="18" rx="1.5" fill="#94A3B8" stroke="#1E2430" strokeWidth="0.95" />
            <rect x="4" y="12" width="28" height="4" fill="#CBD5E1" opacity="0.6" />
            {/*Left & Right crenelated towers */}
            <rect x="2" y="5" width="10" height="25" rx="1" fill="#CBD5E1" stroke="#1E2430" strokeWidth="0.95" />
            <rect x="24" y="5" width="10" height="25" rx="1" fill="#CBD5E1" stroke="#1E2430" strokeWidth="0.95" />
            {/* Tier-3 Grand Citadel central sovereign spire & golden crown trim */}
            {keep.tier >= 3 && (
              <>
                <rect x="11.5" y="1.5" width="13" height="28.5" rx="1" fill="#E2E8F0" stroke="#1E2430" strokeWidth="0.95" />
                <polygon points="10.5,2.2 18,-3.2 25.5,2.2" fill={c.primary} stroke="#FACC15" strokeWidth="0.95" />
                <rect x="3.5" y="11.5" width="29" height="1.8" fill="#FACC15" opacity="0.85" />
              </>
            )}
            {/* Tower battlements */}
            <path d="M2 5 V2.5 H5 V5 H9 V2.5 H12 V5 M24 5 V2.5 H27 V5 H31 V2.5 H34 V5" fill="#E2E8F0" stroke="#1E2430" strokeWidth="0.82" />
            {/* Portcullis archway */}
            <path d="M13.5 30 V20.5 A4.5 4.5 0 0 1 22.5 20.5 V30 Z" fill="#1E2430" />
            <path d="M16 17 V30 M20 17 V30 M13.5 23 H22.5" stroke="#475569" strokeWidth="0.7" />
            {/* Flowing House Banner Pennant */}
            <path d="M18 0.5 V13" stroke="#FEF3C7" strokeWidth="1.15" />
            <path d="M18 1 L28 4.2 L18 7.5 Z" fill={c.primary} stroke={c.darkStroke} strokeWidth="0.85" />
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
                      : keep.specialization === 'forge_seat'
                        ? '#60A5FA'
                        : '#4ADE80'
                }
                stroke="#1E2430"
                strokeWidth="0.75"
              />
            )}
          </g>
        )}
      </g>
    </g>
  );
}

function OutpostStructureSvg({
  outpost,
  hasUnitOnTile,
}: {
  readonly outpost: OutpostState;
  readonly hasUnitOnTile: boolean;
}) {
  const c = HOUSES[outpost.ownerHouseId].colors;
  const ox = outpost.x * TILE_SIZE;
  const oy = outpost.y * TILE_SIZE;
  const hpRatio = Math.max(0, Math.min(1, outpost.hp / Math.max(1, outpost.maxHp || OUTPOST_MAX_HP)));
  const hpColor = hpRatio > 0.5 ? '#22C55E' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';

  return (
    <g transform={`translate(${ox},${oy})`} pointerEvents="none">
      <StructureHpBarSvg hpRatio={hpRatio} fillColor={hpColor} />
      <g opacity={hasUnitOnTile ? 0.78 : 1} transform="translate(9, 10)" filter="url(#keep-shadow)">
        <ellipse cx="15" cy="26" rx="13" ry="3.5" fill="#1E2430" opacity="0.32" />
        {/* Timber stockade ring */}
        <rect x="3" y="14" width="24" height="12" rx="1.2" fill="#78350F" stroke="#3B2314" strokeWidth="0.9" />
        {/* Watch-turret & faction pennant */}
        <rect x="9.5" y="6" width="11" height="18" rx="1" fill="#94A3B8" stroke="#1E2430" strokeWidth="0.9" />
        <polygon points="8,7 15,1.5 22,7" fill={c.primary} stroke={c.darkStroke} strokeWidth="0.9" />
        <rect x="13.2" y="18" width="3.6" height="8" fill="#1E2430" />
      </g>
    </g>
  );
}

/**
 * Keep nameplate + miniature Food progress bar rendered in Layer 7b (above the yellow
 * tile-selection outline) so selection borders never clip or obscure Keep names.
 */
function KeepNameplateSvg({
  keep,
  hasUnitOnTile,
}: {
  readonly keep: KeepState;
  readonly hasUnitOnTile: boolean;
}) {
  const c = HOUSES[keep.ownerHouseId].colors;
  const ox = keep.x * TILE_SIZE;
  const oy = keep.y * TILE_SIZE;
  const foodThreshold = getKeepFoodThreshold(keep);
  const foodRatio = Math.max(0, Math.min(1, keep.foodProgress / Math.max(1, foodThreshold)));
  const shortName = keep.name.length > 11 ? `${keep.name.slice(0, 10)}…` : keep.name;
  const borderAccent = keep.ownerHouseId === 'solis' ? '#E4C56F' : c.primary;
  // Offset slightly further below when a garrisoned unit's HP bar sits at y=39.8..44.2
  const plateY = hasUnitOnTile ? 45.5 : 42.5;

  return (
    <g transform={`translate(${ox + 24}, ${oy + plateY})`} pointerEvents="none">
      <rect
        x="-23"
        y="0"
        width="46"
        height="12.5"
        rx="4"
        fill="#16181D"
        fillOpacity="0.93"
        stroke={borderAccent}
        strokeWidth="0.95"
      />
      <text
        x="0"
        y="7.6"
        textAnchor="middle"
        fontSize="6.6"
        fontWeight="700"
        fill="#F8FAFC"
        letterSpacing="0.02em"
      >
        {shortName} {keep.tier === 3 ? '★★' : keep.tier === 2 ? '★' : ''}
      </text>
      {/* Mini Food Progress Bar */}
      <rect x="-19" y="9.6" width="38" height="1.7" rx="0.85" fill="#2A2E38" />
      <rect x="-19" y="9.6" width={38 * foodRatio} height="1.7" rx="0.85" fill="#22C55E" />
    </g>
  );
}

function UnitTokenSvg({
  unit,
  isActionable,
  isViewerUnit,
  isOnStructure,
}: {
  readonly unit: UnitState;
  readonly isActionable: boolean;
  readonly isViewerUnit: boolean;
  readonly isOnStructure: boolean;
}) {
  const c = HOUSES[unit.houseId].colors;
  const ox = unit.x * TILE_SIZE;
  const oy = unit.y * TILE_SIZE;
  const hpRatio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
  const hpColor = hpRatio > 0.5 ? '#22C55E' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
  const hasPenalty = unit.homeKeepId === 'orphaned' || unit.isMutinied;
  const rank = getUnitRank(unit.xp ?? 0);
  const acted = isViewerUnit && !isActionable && !unit.isFortified;
  const ringFill = unit.houseId === 'solis' ? '#E4C56F' : c.primary;

  return (
    <g
      className="unit-token-smooth"
      style={{ transform: `translate(${ox}px, ${oy}px)` }}
      pointerEvents="none"
      opacity={acted ? 0.84 : 1}
      filter={acted ? 'url(#unit-acted-filter)' : undefined}
    >
      {/* Active Ready Pulse Ring around Tabletop Base */}
      {isViewerUnit && isActionable && (
        <ellipse
          className="unit-ready-ring"
          cx="24.5"
          cy="32.8"
          rx="15.8"
          ry="5.8"
          fill="none"
          stroke="#FDE047"
          strokeWidth="1.65"
        />
      )}

      {/* Grounded Shadow & 3D-Beveled Tabletop Miniature Base (positioned above HP bar with >= 2px gap) */}
      <ellipse cx="24.5" cy="34.8" rx="13.8" ry="4.4" fill="#13151A" opacity="0.45" />
      <ellipse cx="24.5" cy="33.7" rx="13.3" ry="4.2" fill="#1E2430" />
      <ellipse
        cx="24.5"
        cy="32.5"
        rx="12.7"
        ry="4.0"
        fill={ringFill}
        stroke={
          unit.isFortified
            ? '#34D399'
            : isViewerUnit && isActionable
              ? '#FEF08A'
              : '#1E2430'
        }
        strokeWidth={isViewerUnit && isActionable ? '1.5' : '1.15'}
      />
      <ellipse
        cx="24.5"
        cy="32.1"
        rx="9.4"
        ry="2.5"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={acted ? '0.18' : '0.32'}
        strokeWidth="0.75"
      />

      {/* Crisp Ready-to-Act Pip on right rim of foot ring */}
      {isViewerUnit && isActionable && (
        <polygon
          points="38.2,30.3 40.4,32.5 38.2,34.7 36,32.5"
          fill="#FDE047"
          stroke="#1E2430"
          strokeWidth="0.8"
        />
      )}

      {/* Sharpened Miniature Soldier / Rider / Siege Figure (with pale cream halo when on a structure) */}
      <g
        transform="translate(5.5, 0) scale(1.05)"
        filter={isOnStructure ? 'url(#unit-structure-halo)' : 'url(#token-shadow)'}
      >
        <UnitFigureSvg unitId={unit.typeId} houseId={unit.houseId} />
      </g>

      {/* Deployed Trebuchet Siege Timber Outriggers */}
      {unit.isDeployed && (
        <g stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round">
          <path d="M9 35.5 L15 31.5 M39 35.5 L33 31.5 M24.5 37 V33" />
        </g>
      )}

      {/* Ranged Overwatch Vigilance Ring */}
      {unit.isOverwatch && (
        <ellipse
          cx="24.5"
          cy="32.8"
          rx="15.2"
          ry="5.4"
          fill="none"
          stroke="#38BDF8"
          strokeWidth="1.6"
          strokeDasharray="3 2"
        />
      )}

      {/* Fortified Entrenchment Stakes along Front Edge */}
      {unit.isFortified && (
        <g stroke="#3B2314" strokeWidth="0.75" fill="#B45309">
          <polygon points="11.5,35.8 13.5,31.4 15.4,35.8" />
          <polygon points="17.5,36.8 19.5,32.2 21.4,36.8" />
          <polygon points="27.6,36.8 29.5,32.2 31.5,36.8" />
          <polygon points="33.6,35.8 35.5,31.4 37.5,35.8" />
        </g>
      )}

      {/* Crisp Unit HP Bar — cleanly separated beneath the foot ring (2px+ vertical gap) */}
      <rect x="11" y="39.8" width="27" height="4.4" rx="2.2" fill="#16181D" stroke="#383B44" strokeWidth="0.55" />
      <rect x="11.8" y="40.6" width={25.4 * hpRatio} height="2.8" rx="1.2" fill={hpColor} />
      <rect x="11.8" y="40.6" width={25.4 * hpRatio} height="0.95" rx="0.5" fill="#FFFFFF" opacity="0.28" />

      {/* Lord-Commander Crown Crest OR Veterancy Chevrons (Top-Left) */}
      {unit.isCommander ? (
        <g transform="translate(3.5, 2.5)">
          <circle cx="5.5" cy="5.5" r="5.5" fill="#16181D" stroke="#FACC15" strokeWidth="1.2" />
          <polygon points="2.5,7.6 3.3,3.8 5.5,5.6 7.7,3.8 8.5,7.6" fill="#FACC15" />
        </g>
      ) : (
        rank > 0 && (
          <g transform="translate(4, 3)">
            <circle
              cx="5"
              cy="5"
              r="5.0"
              fill="#16181D"
              stroke={rank === 2 ? '#FACC15' : '#CBD5E1'}
              strokeWidth="1.05"
            />
            {rank === 1 ? (
              <path d="M2.5 6.2 L5 3.4 L7.5 6.2" stroke="#E2E8F0" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <g stroke="#FACC15" strokeWidth="1.25" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.6 5.2 L5 2.7 L7.4 5.2" />
                <path d="M2.6 7.6 L5 5.1 L7.4 7.6" />
              </g>
            )}
          </g>
        )
      )}

      {/* Overwatch / Deployed Pip (Top-Right when no penalty) */}
      {!hasPenalty && (unit.isOverwatch || unit.isDeployed) && (
        <g transform="translate(34.5, 2.8)">
          <circle
            cx="4.8"
            cy="4.8"
            r="4.8"
            fill="#0F172A"
            stroke={unit.isOverwatch ? '#38BDF8' : '#F59E0B'}
            strokeWidth="1.05"
          />
          <circle
            cx="4.8"
            cy="4.8"
            r="2"
            fill={unit.isOverwatch ? '#38BDF8' : '#F59E0B'}
          />
        </g>
      )}

      {/* Supply-Severed / Mutiny Warning Pip (Top-Right) */}
      {hasPenalty && (
        <g transform="translate(35, 3)">
          <circle cx="4.5" cy="4.5" r="4.6" fill="#DC2626" stroke="#FAF7F0" strokeWidth="0.95" />
          <text x="4.5" y="7.1" textAnchor="middle" fontSize="7.0" fontWeight="bold" fill="#FFFFFF">
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
  specialTargetKeys,
  specialTargetKind = null,
  buildPreviews,
  showYieldOverlay,
  showZoomButtons = false,
  showMinimap = false,
  floatingPopups,
  focusTileKey,
  focusNonce,
  onToggleYieldOverlay,
  onToggleMinimap,
  onTileTap,
}: MapBoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const keepCycleIdxRef = useRef(0);
  const [zoom, setZoom] = useState(1.1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const gridSize = state.gridSize;
  const boardPx = gridSize * TILE_SIZE;
  const minZoom = gridSize >= 34 ? 0.42 : 0.65;

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

  const exploredTiles = useMemo(
    () => tilesArray.filter((t) => (fogMap[t.key] ?? 'unexplored') !== 'unexplored'),
    [tilesArray, fogMap],
  );

  const riverNetwork = useMemo(() => {
    const exploredRivers = exploredTiles.filter((t) => t.terrain === 'river');
    return buildWorldRiverNetwork(state.tiles, exploredRivers, gridSize);
  }, [state.tiles, exploredTiles, gridSize]);

  const keepByTile = useMemo(() => {
    const m = new Map<CoordKey, KeepState>();
    for (const k of Object.values(state.keeps)) {
      m.set(k.tileKey, k);
    }
    return m;
  }, [state.keeps]);

  const outpostByTile = useMemo(() => {
    const m = new Map<CoordKey, OutpostState>();
    for (const o of Object.values(state.outposts)) {
      m.set(o.tileKey, o);
    }
    return m;
  }, [state.outposts]);

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
        minZoom,
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
      if (tx >= 0 && tx < gridSize && ty >= 0 && ty < gridSize) {
        onTileTap(`${tx},${ty}`);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.max(minZoom, Math.min(MAX_ZOOM, Number((z * factor).toFixed(2)))));
  };

  const ownedKeeps = useMemo(
    () =>
      Object.values(state.keeps)
        .filter((k) => k.ownerHouseId === viewerHouseId)
        .sort((a, b) => (a.isCapital ? -1 : b.isCapital ? 1 : a.id.localeCompare(b.id))),
    [state.keeps, viewerHouseId],
  );

  const ownedOutposts = useMemo(
    () => Object.values(state.outposts).filter((o) => o.ownerHouseId === viewerHouseId),
    [state.outposts, viewerHouseId],
  );

  const commanderUnit = useMemo(() => {
    const cmd = state.commanders[viewerHouseId];
    return cmd?.unitId ? state.units[cmd.unitId] ?? null : null;
  }, [state.commanders, state.units, viewerHouseId]);

  const handleCycleKeep = () => {
    if (ownedKeeps.length === 0) return;
    const idx = keepCycleIdxRef.current % ownedKeeps.length;
    const target = ownedKeeps[idx]!;
    keepCycleIdxRef.current = (idx + 1) % ownedKeeps.length;
    centerOnTile(target.tileKey);
    onTileTap(target.tileKey);
  };

  const selectedKeepId = useMemo(() => {
    if (!selectedTileKey) return null;
    const k = keepByTile.get(selectedTileKey);
    return k ? k.id : null;
  }, [selectedTileKey, keepByTile]);

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
      className="relative flex-1 w-full overflow-hidden bg-[#13151A] select-none"
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
          width: boardPx,
          height: boardPx,
        }}
      >
        <svg
          width={boardPx}
          height={boardPx}
          viewBox={`0 0 ${boardPx} ${boardPx}`}
          role="img"
          aria-label={`Marchlands ${gridSize} by ${gridSize} frontier map`}
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

            {/* Warm Deep Charcoal Unexplored Fog Pattern */}
            <pattern id="fog-pattern" width="48" height="48" patternUnits="userSpaceOnUse">
              <rect width="48" height="48" fill="#13151A" />
              <path d="M48 0 H0 V48" fill="none" stroke="#1E2128" strokeWidth="0.7" />
              <path d="M22 24 H26 M24 22 V26" stroke="#252932" strokeWidth="0.65" />
            </pattern>

            {/* Soft Feathered Fog Edge Gradients (replaces razor-sharp 90deg fog borders) */}
            <linearGradient id="fog-fade-n" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#13151A" stopOpacity="0.92" />
              <stop offset="55%" stopColor="#13151A" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#13151A" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="fog-fade-s" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#13151A" stopOpacity="0.92" />
              <stop offset="55%" stopColor="#13151A" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#13151A" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="fog-fade-w" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#13151A" stopOpacity="0.92" />
              <stop offset="55%" stopColor="#13151A" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#13151A" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="fog-fade-e" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="#13151A" stopOpacity="0.92" />
              <stop offset="55%" stopColor="#13151A" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#13151A" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="fog-corner-nw" cx="0" cy="0" r="1">
              <stop offset="0%" stopColor="#13151A" stopOpacity="0.88" />
              <stop offset="55%" stopColor="#13151A" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#13151A" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="fog-corner-ne" cx="1" cy="0" r="1">
              <stop offset="0%" stopColor="#13151A" stopOpacity="0.88" />
              <stop offset="55%" stopColor="#13151A" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#13151A" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="fog-corner-sw" cx="0" cy="1" r="1">
              <stop offset="0%" stopColor="#13151A" stopOpacity="0.88" />
              <stop offset="55%" stopColor="#13151A" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#13151A" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="fog-corner-se" cx="1" cy="1" r="1">
              <stop offset="0%" stopColor="#13151A" stopOpacity="0.88" />
              <stop offset="55%" stopColor="#13151A" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#13151A" stopOpacity="0" />
            </radialGradient>

            {/* Soft Drop Shadows & Garrisoned Unit Pale Cream Keyline Halo */}
            <filter id="token-shadow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="1.4" stdDeviation="1.05" floodColor="#13151A" floodOpacity="0.52" />
            </filter>
            <filter id="unit-structure-halo" x="-30%" y="-30%" width="160%" height="160%">
              <feMorphology in="SourceAlpha" operator="dilate" radius="1.45" result="dilated" />
              <feFlood floodColor="#FAF7F0" floodOpacity="0.94" result="haloColor" />
              <feComposite in="haloColor" in2="dilated" operator="in" result="halo" />
              <feDropShadow in="halo" dx="0" dy="1.2" stdDeviation="1" floodColor="#13151A" floodOpacity="0.5" result="haloShadow" />
              <feMerge>
                <feMergeNode in="haloShadow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="unit-acted-filter">
              <feColorMatrix type="saturate" values="0.65" />
            </filter>
            <filter id="keep-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.8" stdDeviation="1.4" floodColor="#13151A" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Outer Cartographic Frame */}
          <rect width={boardPx} height={boardPx} fill="url(#fog-pattern)" />

          {/* Layer 1: Base Terrain Tiles (Plains, Forest, Hills, Mountain, Meadow under Rivers) */}
          {exploredTiles.map((tile) => (
            <TerrainTileSvg key={`t_${tile.key}`} tile={tile} season={season} />
          ))}

          {/* Layer 1b: Carved Organic River Network with Smoothly Tapered Spring Terminals */}
          {(riverNetwork.mainPath.length > 0 ||
            riverNetwork.terminalOuterPath.length > 0 ||
            riverNetwork.springPools.length > 0) && (
            <g pointerEvents="none">
              {/* Pass 1: Soft verdant meadow verge */}
              {riverNetwork.mainPath.length > 0 && (
                <path
                  d={riverNetwork.mainPath}
                  fill="none"
                  stroke={
                    season === 'winter'
                      ? '#B8C8D6'
                      : season === 'autumn'
                        ? '#C1BA9A'
                        : '#B3C0A0'
                  }
                  strokeWidth="31"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.terminalOuterPath.length > 0 && (
                <path
                  d={riverNetwork.terminalOuterPath}
                  fill="none"
                  stroke={
                    season === 'winter'
                      ? '#B8C8D6'
                      : season === 'autumn'
                        ? '#C1BA9A'
                        : '#B3C0A0'
                  }
                  strokeWidth="22"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.springPools.map((pt, i) => (
                <circle
                  key={`sp_v_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="10.5"
                  fill={
                    season === 'winter'
                      ? '#B8C8D6'
                      : season === 'autumn'
                        ? '#C1BA9A'
                        : '#B3C0A0'
                  }
                />
              ))}

              {/* Pass 2: Warm pebble-sand shore bank */}
              {riverNetwork.mainPath.length > 0 && (
                <path
                  d={riverNetwork.mainPath}
                  fill="none"
                  stroke={season === 'winter' ? '#CBD5E1' : '#C3B28D'}
                  strokeWidth="25.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.terminalOuterPath.length > 0 && (
                <path
                  d={riverNetwork.terminalOuterPath}
                  fill="none"
                  stroke={season === 'winter' ? '#CBD5E1' : '#C3B28D'}
                  strokeWidth="17.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.terminalInnerPath.length > 0 && (
                <path
                  d={riverNetwork.terminalInnerPath}
                  fill="none"
                  stroke={season === 'winter' ? '#CBD5E1' : '#C3B28D'}
                  strokeWidth="12.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.springPools.map((pt, i) => (
                <circle
                  key={`sp_b_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="8"
                  fill={season === 'winter' ? '#CBD5E1' : '#C3B28D'}
                />
              ))}
              {riverNetwork.wideCorners.map((pt, i) => (
                <circle
                  key={`wc_b_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="14"
                  fill={season === 'winter' ? '#CBD5E1' : '#C3B28D'}
                />
              ))}

              {/* Pass 3: Recessed northwest bank shadow */}
              <g transform="translate(-0.8, -1)">
                {riverNetwork.mainPath.length > 0 && (
                  <path
                    d={riverNetwork.mainPath}
                    fill="none"
                    stroke={season === 'winter' ? '#5884A4' : '#2C678A'}
                    strokeWidth="22.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {riverNetwork.terminalOuterPath.length > 0 && (
                  <path
                    d={riverNetwork.terminalOuterPath}
                    fill="none"
                    stroke={season === 'winter' ? '#5884A4' : '#2C678A'}
                    strokeWidth="14.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </g>

              {/* Pass 4: Continuous shallow turquoise-cerulean water body */}
              {riverNetwork.mainPath.length > 0 && (
                <path
                  d={riverNetwork.mainPath}
                  fill="none"
                  stroke={season === 'winter' ? '#7CB4D6' : '#4E9EC2'}
                  strokeWidth="21.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.terminalOuterPath.length > 0 && (
                <path
                  d={riverNetwork.terminalOuterPath}
                  fill="none"
                  stroke={season === 'winter' ? '#7CB4D6' : '#4E9EC2'}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.terminalInnerPath.length > 0 && (
                <path
                  d={riverNetwork.terminalInnerPath}
                  fill="none"
                  stroke={season === 'winter' ? '#7CB4D6' : '#4E9EC2'}
                  strokeWidth="9.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.springPools.map((pt, i) => (
                <circle
                  key={`sp_s_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="6"
                  fill={season === 'winter' ? '#7CB4D6' : '#4E9EC2'}
                />
              ))}
              {riverNetwork.poolCenters.map((pt, i) => (
                <circle
                  key={`pl_s_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="11.5"
                  fill={season === 'winter' ? '#7CB4D6' : '#4E9EC2'}
                />
              ))}
              {riverNetwork.wideCorners.map((pt, i) => (
                <circle
                  key={`wc_s_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="11.5"
                  fill={season === 'winter' ? '#7CB4D6' : '#4E9EC2'}
                />
              ))}

              {/* Pass 5: Unbroken deep-channel water core */}
              {riverNetwork.mainPath.length > 0 && (
                <path
                  d={riverNetwork.mainPath}
                  fill="none"
                  stroke={season === 'winter' ? '#5A90B5' : '#3179A1'}
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.terminalOuterPath.length > 0 && (
                <path
                  d={riverNetwork.terminalOuterPath}
                  fill="none"
                  stroke={season === 'winter' ? '#5A90B5' : '#3179A1'}
                  strokeWidth="7.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.terminalInnerPath.length > 0 && (
                <path
                  d={riverNetwork.terminalInnerPath}
                  fill="none"
                  stroke={season === 'winter' ? '#5A90B5' : '#3179A1'}
                  strokeWidth="4.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {riverNetwork.springPools.map((pt, i) => (
                <circle
                  key={`sp_d_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.2"
                  fill={season === 'winter' ? '#5A90B5' : '#3179A1'}
                />
              ))}
              {riverNetwork.poolCenters.map((pt, i) => (
                <circle
                  key={`pl_d_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="7"
                  fill={season === 'winter' ? '#5A90B5' : '#3179A1'}
                />
              ))}
              {riverNetwork.wideCorners.map((pt, i) => (
                <circle
                  key={`wc_d_${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="7.5"
                  fill={season === 'winter' ? '#5A90B5' : '#3179A1'}
                />
              ))}

              {/* Pass 6: Staggered asymmetric water wavelets & bankside cattail reeds */}
              <g
                className="river-shimmer"
                fill="none"
                stroke={season === 'winter' ? '#E0F2FE' : '#BAE6FD'}
                strokeWidth="1.25"
                strokeLinecap="round"
              >
                {riverNetwork.wavelets.map((w, i) => (
                  <path key={`wv_${i}`} d={w.d} opacity={w.opacity} />
                ))}
              </g>
              {riverNetwork.reedSpots.map((r, i) => (
                <g
                  key={`reed_${i}`}
                  transform={`translate(${r.x},${r.y})`}
                  stroke={season === 'winter' ? '#64748B' : '#45683B'}
                  strokeWidth="1"
                  strokeLinecap="round"
                  opacity="0.78"
                >
                  <path d="M0 0 L-1.3 -3.8 M0 0 L1.2 -3.3 M3 -0.4 L3.7 -3.6" />
                  <circle cx="-1.3" cy="-3.8" r="0.7" fill="#78350F" stroke="none" />
                </g>
              ))}
            </g>
          )}

          {/* Layer 1c: Owned Territory Wash (House Solis uses warm sunlit gold for Winter snow contrast) */}
          {exploredTiles.map((tile) => {
            if (!tile.ownerHouseId) return null;
            const isSolis = tile.ownerHouseId === 'solis';
            return (
              <rect
                key={`own_${tile.key}`}
                x={tile.x * TILE_SIZE}
                y={tile.y * TILE_SIZE}
                width={TILE_SIZE}
                height={TILE_SIZE}
                fill={isSolis ? '#E4C56F' : HOUSES[tile.ownerHouseId].colors.primary}
                fillOpacity={isSolis ? (season === 'winter' ? '0.22' : '0.16') : '0.13'}
                pointerEvents="none"
              />
            );
          })}

          {/* Layer 1d: Cobbled Frontier Roads & Orthogonal Wall Links */}
          {exploredTiles.map((tile) => {
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            const cx = ox + 24;
            const cy = oy + 24;

            const nTile = state.tiles[`${tile.x},${tile.y - 1}`];
            const sTile = state.tiles[`${tile.x},${tile.y + 1}`];
            const wTile = state.tiles[`${tile.x - 1},${tile.y}`];
            const eTile = state.tiles[`${tile.x + 1},${tile.y}`];

            const isRoadConnect = (t: TileState | undefined) =>
              t !== undefined && (t.hasRoad || keepByTile.has(t.key) || outpostByTile.has(t.key));

            const isWallLink = (t: TileState | undefined) =>
              tile.improvement === 'palisade' &&
              t !== undefined &&
              t.improvement === 'palisade' &&
              t.ownerHouseId === tile.ownerHouseId;

            if (!tile.hasRoad && tile.improvement !== 'palisade') return null;

            const roadN = tile.hasRoad && isRoadConnect(nTile);
            const roadS = tile.hasRoad && isRoadConnect(sTile);
            const roadW = tile.hasRoad && isRoadConnect(wTile);
            const roadE = tile.hasRoad && isRoadConnect(eTile);

            const wallE = isWallLink(eTile);
            const wallS = isWallLink(sTile);

            return (
              <g key={`rd_wl_${tile.key}`} pointerEvents="none">
                {tile.hasRoad && (
                  <g opacity="0.88">
                    <circle cx={cx} cy={cy} r="5.2" fill="#8C7A61" stroke="#4D4233" strokeWidth="1" />
                    {roadN && <line x1={cx} y1={cy} x2={cx} y2={oy} stroke="#8C7A61" strokeWidth="7" strokeLinecap="round" />}
                    {roadS && <line x1={cx} y1={cy} x2={cx} y2={oy + TILE_SIZE} stroke="#8C7A61" strokeWidth="7" strokeLinecap="round" />}
                    {roadW && <line x1={cx} y1={cy} x2={ox} y2={cy} stroke="#8C7A61" strokeWidth="7" strokeLinecap="round" />}
                    {roadE && <line x1={cx} y1={cy} x2={ox + TILE_SIZE} y2={cy} stroke="#8C7A61" strokeWidth="7" strokeLinecap="round" />}
                    {roadN && <line x1={cx} y1={cy} x2={cx} y2={oy} stroke="#C9B99B" strokeWidth="4" strokeDasharray="3 3" />}
                    {roadS && <line x1={cx} y1={cy} x2={cx} y2={oy + TILE_SIZE} stroke="#C9B99B" strokeWidth="4" strokeDasharray="3 3" />}
                    {roadW && <line x1={cx} y1={cy} x2={ox} y2={cy} stroke="#C9B99B" strokeWidth="4" strokeDasharray="3 3" />}
                    {roadE && <line x1={cx} y1={cy} x2={ox + TILE_SIZE} y2={cy} stroke="#C9B99B" strokeWidth="4" strokeDasharray="3 3" />}
                  </g>
                )}
                {wallE && (
                  <line
                    x1={ox + 34}
                    y1={oy + 31}
                    x2={ox + TILE_SIZE + 14}
                    y2={oy + 31}
                    stroke={tile.improvementLevel === 2 ? '#94A3B8' : '#7C4D2B'}
                    strokeWidth="4.8"
                    strokeLinecap="round"
                  />
                )}
                {wallS && (
                  <line
                    x1={ox + 24}
                    y1={oy + 34}
                    x2={ox + 24}
                    y2={oy + TILE_SIZE + 18}
                    stroke={tile.improvementLevel === 2 ? '#94A3B8' : '#7C4D2B'}
                    strokeWidth="4.8"
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}

          {/* Layer 2: Merged Contiguous Friendly Territory Borders (outer faction perimeter only) */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'unexplored' || !tile.ownerHouseId) return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            const isSolis = tile.ownerHouseId === 'solis';
            const color = isSolis ? '#E4C56F' : HOUSES[tile.ownerHouseId].colors.primary;
            const dark = isSolis ? '#1E2430' : HOUSES[tile.ownerHouseId].colors.darkStroke;

            const nTile = state.tiles[`${tile.x},${tile.y - 1}`];
            const sTile = state.tiles[`${tile.x},${tile.y + 1}`];
            const wTile = state.tiles[`${tile.x - 1},${tile.y}`];
            const eTile = state.tiles[`${tile.x + 1},${tile.y}`];

            // Bold outer faction perimeter: only where neighbor does NOT belong to same faction
            const topOuter = nTile?.ownerHouseId !== tile.ownerHouseId;
            const bottomOuter = sTile?.ownerHouseId !== tile.ownerHouseId;
            const leftOuter = wTile?.ownerHouseId !== tile.ownerHouseId;
            const rightOuter = eTile?.ownerHouseId !== tile.ownerHouseId;

            // Optional faint internal Keep-specific hairline ONLY when that Keep is actively selected
            const isSelectedKeepTile = selectedKeepId !== null && tile.keepId === selectedKeepId;
            const topInternal = isSelectedKeepTile && !topOuter && nTile?.keepId !== tile.keepId;
            const bottomInternal = isSelectedKeepTile && !bottomOuter && sTile?.keepId !== tile.keepId;
            const leftInternal = isSelectedKeepTile && !leftOuter && wTile?.keepId !== tile.keepId;
            const rightInternal = isSelectedKeepTile && !rightOuter && eTile?.keepId !== tile.keepId;

            if (
              !topOuter &&
              !bottomOuter &&
              !leftOuter &&
              !rightOuter &&
              !topInternal &&
              !bottomInternal &&
              !leftInternal &&
              !rightInternal
            ) {
              return null;
            }

            return (
              <g key={`b_${tile.key}`} pointerEvents="none">
                {(topOuter || bottomOuter || leftOuter || rightOuter) && (
                  <>
                    <g
                      stroke={dark}
                      strokeWidth={isSolis ? '3.8' : '3.5'}
                      strokeOpacity={isSolis ? '0.82' : '0.48'}
                      strokeDasharray="6 3"
                    >
                      {topOuter && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + 1.5} />}
                      {bottomOuter && <line x1={ox + 1.5} y1={oy + TILE_SIZE - 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                      {leftOuter && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + 1.5} y2={oy + TILE_SIZE - 1.5} />}
                      {rightOuter && <line x1={ox + TILE_SIZE - 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                    </g>
                    <g stroke={color} strokeWidth="2.2" strokeDasharray="6 3">
                      {topOuter && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + 1.5} />}
                      {bottomOuter && <line x1={ox + 1.5} y1={oy + TILE_SIZE - 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                      {leftOuter && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + 1.5} y2={oy + TILE_SIZE - 1.5} />}
                      {rightOuter && <line x1={ox + TILE_SIZE - 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                    </g>
                  </>
                )}
                {(topInternal || bottomInternal || leftInternal || rightInternal) && (
                  <g stroke={color} strokeWidth="1" strokeOpacity="0.24" strokeDasharray="3 3">
                    {topInternal && <line x1={ox + 1} y1={oy + 0.5} x2={ox + TILE_SIZE - 1} y2={oy + 0.5} />}
                    {bottomInternal && <line x1={ox + 1} y1={oy + TILE_SIZE - 0.5} x2={ox + TILE_SIZE - 1} y2={oy + TILE_SIZE - 0.5} />}
                    {leftInternal && <line x1={ox + 0.5} y1={oy + 1} x2={ox + 0.5} y2={oy + TILE_SIZE - 1} />}
                    {rightInternal && <line x1={ox + TILE_SIZE - 0.5} y1={oy + 1} x2={ox + TILE_SIZE - 0.5} y2={oy + TILE_SIZE - 1} />}
                  </g>
                )}
              </g>
            );
          })}

          {/* Layer 3: Improvements & Landmarks (Grounded Illustrations + Distinct Structure HP Bars) */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'unexplored' || keepByTile.has(tile.key) || outpostByTile.has(tile.key)) return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            const hasUnit = occupiedTileKeys.has(tile.key);

            if (tile.improvement) {
              const impDef = IMPROVEMENTS[tile.improvement];
              const maxFortHp =
                (tile.improvementLevel === 2 && impDef.upgrade?.maxFortificationHp
                  ? impDef.upgrade.maxFortificationHp
                  : impDef.maxFortificationHp) ?? 14;
              const showFortHp =
                tile.fortificationHp !== null && tile.fortificationHp < maxFortHp;
              return (
                <g key={`imp_${tile.key}`} pointerEvents="none">
                  <g
                    transform={`translate(${ox + 3},${oy + 21}) scale(0.96)`}
                    opacity={hasUnit ? 0.78 : 1}
                  >
                    <ImprovementGlyphSvg id={tile.improvement} level={tile.improvementLevel} />
                  </g>
                  {tile.improvementLevel === 2 && (
                    <g transform={`translate(${ox + 33}, ${oy + 14})`}>
                      <rect width="12" height="9" rx="2.5" fill="#1E2128" stroke="#E8C97E" strokeWidth="0.8" />
                      <text x="6" y="6.8" textAnchor="middle" fontSize="6" fontWeight="800" fill="#FDE047">
                        II
                      </text>
                    </g>
                  )}
                  {showFortHp && tile.fortificationHp !== null && (
                    <g transform={`translate(${ox}, ${oy})`}>
                      <StructureHpBarSvg
                        hpRatio={tile.fortificationHp / maxFortHp}
                        fillColor={
                          tile.fortificationHp / maxFortHp > 0.5
                            ? '#22C55E'
                            : tile.fortificationHp / maxFortHp > 0.25
                              ? '#F59E0B'
                              : '#EF4444'
                        }
                      />
                    </g>
                  )}
                </g>
              );
            }

            if (tile.landmark !== 'none' && !tile.landmarkCleared) {
              const hpRatio =
                tile.landmark === 'high_seat' && tile.highSeatHp !== null
                  ? tile.highSeatHp / HIGH_SEAT_MAX_HP
                  : tile.landmark === 'frontier_village' && tile.villageHp !== null
                    ? tile.villageHp / VILLAGE_MAX_HP
                    : tile.landmark === 'outlaw_camp' && tile.banditHp !== null
                      ? tile.banditHp / BANDIT_MAX_HP
                      : null;

              return (
                <g key={`lm_${tile.key}`} pointerEvents="none">
                  <g
                    transform={`translate(${ox + 11},${oy + 13}) scale(1.1)`}
                    opacity={hasUnit ? 0.78 : 1}
                  >
                    <LandmarkGlyphSvg landmark={tile.landmark} />
                  </g>
                  {hpRatio !== null && (
                    <g transform={`translate(${ox}, ${oy})`}>
                      <StructureHpBarSvg
                        hpRatio={hpRatio}
                        fillColor={
                          tile.landmark === 'outlaw_camp'
                            ? '#EF4444'
                            : tile.landmark === 'high_seat'
                              ? '#E8C97E'
                              : '#F59E0B'
                        }
                      />
                    </g>
                  )}
                </g>
              );
            }
            return null;
          })}

          {/* Layer 3b: Accessible Owned Tile Yield Badges (Monochrome Micro-Icons + Color Accents) */}
          {showYieldOverlay &&
            tilesArray.map((tile) => {
              if (tile.ownerHouseId !== viewerHouseId || keepByTile.has(tile.key) || outpostByTile.has(tile.key))
                return null;
              if (fogMap[tile.key] === 'unexplored') return null;
              const y = computeTileYield(state, tile.key);
              if (y.food === 0 && y.materials === 0 && y.iron === 0 && y.coin === 0) return null;
              const ox = tile.x * TILE_SIZE;
              const oy = tile.y * TILE_SIZE;
              const chips: Array<{ kind: 'food' | 'mat' | 'iron' | 'coin'; text: string; stroke: string; accent: string }> = [];
              if (y.food > 0) chips.push({ kind: 'food', text: `+${y.food}`, stroke: '#22C55E', accent: '#4ADE80' });
              if (y.materials > 0) chips.push({ kind: 'mat', text: `+${y.materials}`, stroke: '#EA580C', accent: '#FB923C' });
              if (y.iron > 0) chips.push({ kind: 'iron', text: `+${y.iron}`, stroke: '#3B82F6', accent: '#60A5FA' });
              if (y.coin > 0) chips.push({ kind: 'coin', text: `+${y.coin}`, stroke: '#EAB308', accent: '#FDE047' });

              const isCompact = chips.length >= 3;
              const chipW = isCompact ? 14.8 : 18.2;
              const chipGap = isCompact ? 0.7 : 1.4;
              const startX = isCompact ? 1.2 : 2.5;

              return (
                <g key={`yld_${tile.key}`} transform={`translate(${ox + startX}, ${oy + 2.5})`} pointerEvents="none">
                  {chips.map((ch, idx) => (
                    <g key={ch.kind} transform={`translate(${idx * (chipW + chipGap)}, 0)`}>
                      <rect
                        width={chipW}
                        height="10.2"
                        rx="3"
                        fill="#16181D"
                        fillOpacity="0.88"
                        stroke={ch.stroke}
                        strokeWidth="0.75"
                      />
                      {/* Ultra-clean monochrome minimalist micro-icon (Food sprout / Materials cube / Iron ingot / Coin circle) */}
                      <g transform={isCompact ? 'translate(1.4, 2.1) scale(0.75)' : 'translate(2.1, 1.8) scale(0.84)'}>
                        {ch.kind === 'food' && (
                          <path
                            d="M4 7.4 V2.2 M4 5.2 C1.8 4.8 1.5 2.7 3 2 C3.8 2.5 4 3.8 4 5.2 M4 4.2 C6.2 3.8 6.5 1.8 5 1.1 C4.2 1.6 4 2.9 4 4.2"
                            fill="none"
                            stroke={ch.accent}
                            strokeWidth="1.25"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        {ch.kind === 'mat' && (
                          <g fill="none" stroke={ch.accent} strokeWidth="1.05" strokeLinejoin="round">
                            <polygon points="4,1 7.2,2.7 4,4.4 0.8,2.7" fill={ch.accent} fillOpacity="0.35" />
                            <path d="M0.8 2.7 V5.8 L4 7.5 L7.2 5.8 V2.7 M4 4.4 V7.5" />
                          </g>
                        )}
                        {ch.kind === 'iron' && (
                          <polygon
                            points="4,1 7,4.2 4,7.4 1,4.2"
                            fill={ch.accent}
                            fillOpacity="0.45"
                            stroke={ch.accent}
                            strokeWidth="1.1"
                          />
                        )}
                        {ch.kind === 'coin' && (
                          <g>
                            <circle cx="4" cy="4.2" r="3" fill="none" stroke={ch.accent} strokeWidth="1.15" />
                            <circle cx="4" cy="4.2" r="1.1" fill={ch.accent} />
                          </g>
                        )}
                      </g>
                      <text
                        x={isCompact ? 10.6 : 12.8}
                        y="7.4"
                        textAnchor="middle"
                        fontSize={isCompact ? '5.6' : '6.2'}
                        fontWeight="700"
                        fill="#F8FAFC"
                      >
                        {ch.text}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}

          {/* Layer 4: Keeps & Frontier Outposts (Architecture + Structure HP Bar) */}
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
          {Array.from(outpostByTile.values()).map((outpost) => {
            const fog: FogStatus = fogMap[outpost.tileKey] ?? 'unexplored';
            if (fog === 'unexplored') return null;
            return (
              <OutpostStructureSvg
                key={outpost.id}
                outpost={outpost}
                hasUnitOnTile={occupiedTileKeys.has(outpost.tileKey)}
              />
            );
          })}

          {/* Layer 4b: Subtle Seasonal Atmosphere Tint */}
          <rect
            width={boardPx}
            height={boardPx}
            fill={seasonalAtmosphere}
            pointerEvents="none"
          />

          {/* Layer 5: Organic Fog of War (Unexplored Shroud + Feathered Mist Edges + Explored Dusk Veil) */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'visible') return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            if (fog === 'unexplored') {
              // Cover unexplored tiles adjacent (orthogonal or diagonal) to explored tiles so rivers stay strictly fog-honest
              const bordersExplored =
                (fogMap[`${tile.x},${tile.y - 1}`] ?? 'unexplored') !== 'unexplored' ||
                (fogMap[`${tile.x},${tile.y + 1}`] ?? 'unexplored') !== 'unexplored' ||
                (fogMap[`${tile.x - 1},${tile.y}`] ?? 'unexplored') !== 'unexplored' ||
                (fogMap[`${tile.x + 1},${tile.y}`] ?? 'unexplored') !== 'unexplored' ||
                (fogMap[`${tile.x - 1},${tile.y - 1}`] ?? 'unexplored') !== 'unexplored' ||
                (fogMap[`${tile.x + 1},${tile.y - 1}`] ?? 'unexplored') !== 'unexplored' ||
                (fogMap[`${tile.x - 1},${tile.y + 1}`] ?? 'unexplored') !== 'unexplored' ||
                (fogMap[`${tile.x + 1},${tile.y + 1}`] ?? 'unexplored') !== 'unexplored';
              if (!bordersExplored) return null;
              return (
                <rect
                  key={`unexp_${tile.key}`}
                  x={ox}
                  y={oy}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  fill="url(#fog-pattern)"
                  pointerEvents="none"
                />
              );
            }
            // Explored (remembered) dusk veil
            return (
              <rect
                key={`fog_${tile.key}`}
                x={ox}
                y={oy}
                width={TILE_SIZE}
                height={TILE_SIZE}
                fill="#13151A"
                fillOpacity="0.44"
                pointerEvents="none"
              />
            );
          })}

          {/* Soft Feathered Mist & Rounded Corner Transitions along Discovered-to-Unexplored Borders */}
          {exploredTiles.map((tile) => {
            const nUnexp = (fogMap[`${tile.x},${tile.y - 1}`] ?? 'unexplored') === 'unexplored';
            const sUnexp = (fogMap[`${tile.x},${tile.y + 1}`] ?? 'unexplored') === 'unexplored';
            const wUnexp = (fogMap[`${tile.x - 1},${tile.y}`] ?? 'unexplored') === 'unexplored';
            const eUnexp = (fogMap[`${tile.x + 1},${tile.y}`] ?? 'unexplored') === 'unexplored';
            const nwUnexp = (fogMap[`${tile.x - 1},${tile.y - 1}`] ?? 'unexplored') === 'unexplored';
            const neUnexp = (fogMap[`${tile.x + 1},${tile.y - 1}`] ?? 'unexplored') === 'unexplored';
            const swUnexp = (fogMap[`${tile.x - 1},${tile.y + 1}`] ?? 'unexplored') === 'unexplored';
            const seUnexp = (fogMap[`${tile.x + 1},${tile.y + 1}`] ?? 'unexplored') === 'unexplored';

            if (!nUnexp && !sUnexp && !wUnexp && !eUnexp && !nwUnexp && !neUnexp && !swUnexp && !seUnexp) {
              return null;
            }
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            const edgeW = 10;
            const cornerR = 11;

            return (
              <g key={`fedge_${tile.key}`} pointerEvents="none">
                {nUnexp && <rect x={ox} y={oy} width={TILE_SIZE} height={edgeW} fill="url(#fog-fade-n)" />}
                {sUnexp && <rect x={ox} y={oy + TILE_SIZE - edgeW} width={TILE_SIZE} height={edgeW} fill="url(#fog-fade-s)" />}
                {wUnexp && <rect x={ox} y={oy} width={edgeW} height={TILE_SIZE} fill="url(#fog-fade-w)" />}
                {eUnexp && <rect x={ox + TILE_SIZE - edgeW} y={oy} width={edgeW} height={TILE_SIZE} fill="url(#fog-fade-e)" />}
                {/* Soften concave/convex 90deg corners with radial mist */}
                {(nwUnexp || (nUnexp && wUnexp)) && (
                  <rect x={ox} y={oy} width={cornerR} height={cornerR} fill="url(#fog-corner-nw)" />
                )}
                {(neUnexp || (nUnexp && eUnexp)) && (
                  <rect x={ox + TILE_SIZE - cornerR} y={oy} width={cornerR} height={cornerR} fill="url(#fog-corner-ne)" />
                )}
                {(swUnexp || (sUnexp && wUnexp)) && (
                  <rect x={ox} y={oy + TILE_SIZE - cornerR} width={cornerR} height={cornerR} fill="url(#fog-corner-sw)" />
                )}
                {(seUnexp || (sUnexp && eUnexp)) && (
                  <rect x={ox + TILE_SIZE - cornerR} y={oy + TILE_SIZE - cornerR} width={cornerR} height={cornerR} fill="url(#fog-corner-se)" />
                )}
              </g>
            );
          })}

          {/* Layer 6: Visible Units */}
          {visibleUnits.map((u) => {
            const tile = state.tiles[u.tileKey];
            const isOnStructure =
              keepByTile.has(u.tileKey) ||
              outpostByTile.has(u.tileKey) ||
              (tile !== undefined &&
                (tile.improvement !== null ||
                  (tile.landmark !== 'none' && !tile.landmarkCleared)));
            return (
              <UnitTokenSvg
                key={u.id}
                unit={u}
                isActionable={actionableIds.has(u.id)}
                isViewerUnit={u.houseId === viewerHouseId}
                isOnStructure={isOnStructure}
              />
            );
          })}

          {/* Layer 7: Tactical Overlays (Reachable, Attackable, Special Target, Build Preview, Selected) */}
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

          {specialTargetKeys &&
            Array.from(specialTargetKeys).map((k) => {
              const t = state.tiles[k];
              if (!t) return null;
              const ox = t.x * TILE_SIZE;
              const oy = t.y * TILE_SIZE;
              const isOutpost = specialTargetKind === 'outpost';
              return (
                <g key={`spec_${k}`} pointerEvents="none">
                  <rect
                    x={ox + 2.5}
                    y={oy + 2.5}
                    width={TILE_SIZE - 5}
                    height={TILE_SIZE - 5}
                    rx="4"
                    fill={isOutpost ? '#10B981' : '#F59E0B'}
                    fillOpacity="0.3"
                    stroke={isOutpost ? '#34D399' : '#FACC15'}
                    strokeWidth="2.2"
                    strokeDasharray={isOutpost ? '4 2' : undefined}
                  />
                  <rect
                    x={ox + 5}
                    y={oy + 4}
                    width="38"
                    height="12"
                    rx="6"
                    fill="#16181D"
                    stroke={isOutpost ? '#34D399' : '#FACC15'}
                    strokeWidth="0.9"
                  />
                  <text
                    x={ox + 24}
                    y={oy + 12.2}
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="800"
                    fill="#FAF7F0"
                  >
                    {isOutpost ? 'OUTPOST' : specialTargetKind === 'volley' ? 'VOLLEY' : 'MARK'}
                  </text>
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
            if (preview.deltaYield.iron > 0) parts.push(`+${preview.deltaYield.iron}Ir`);
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
              strokeWidth="2.6"
              pointerEvents="none"
            />
          )}

          {/* Layer 7b: Keep Nameplates (rendered ABOVE selection frame so yellow borders never clip names) */}
          {Array.from(keepByTile.values()).map((keep) => {
            const fog: FogStatus = fogMap[keep.tileKey] ?? 'unexplored';
            if (fog === 'unexplored') return null;
            return (
              <KeepNameplateSvg
                key={`np_${keep.id}`}
                keep={keep}
                hasUnitOnTile={occupiedTileKeys.has(keep.tileKey)}
              />
            );
          })}

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
                    fill="#16181D"
                    fillOpacity="0.93"
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

      {/* Collapsible Quick-Jump & Minimap Radar Panel (Top-Left for 34x34 Navigation) */}
      {showMinimap && (
        <div
          className="absolute left-2 top-2 z-20 w-52 rounded-xl bg-[#16181D]/92 backdrop-blur-md border border-[#383B44] p-2.5 shadow-2xl"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Frontier Radar ({gridSize}×{gridSize})
            </span>
            {onToggleMinimap && (
              <button
                type="button"
                onClick={onToggleMinimap}
                className="touch-target w-11 h-11 flex items-center justify-center rounded-lg bg-[#23262E] border border-[#383B44] text-xs text-stone-300 hover:text-stone-100"
                aria-label="Close radar"
              >
                ✕
              </button>
            )}
          </div>
          <svg
            viewBox={`0 0 ${gridSize} ${gridSize}`}
            className="w-full h-36 rounded-lg bg-[#0F1115] border border-[#2C3039] mb-2 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mx = Math.floor(((e.clientX - rect.left) / rect.width) * gridSize);
              const my = Math.floor(((e.clientY - rect.top) / rect.height) * gridSize);
              const key: CoordKey = `${Math.max(0, Math.min(gridSize - 1, mx))},${Math.max(0, Math.min(gridSize - 1, my))}`;
              centerOnTile(key);
              onTileTap(key);
            }}
          >
            {exploredTiles.map((t) => (
              <rect
                key={`mm_${t.key}`}
                x={t.x}
                y={t.y}
                width="1"
                height="1"
                fill={
                  t.ownerHouseId
                    ? HOUSES[t.ownerHouseId].colors.primary
                    : t.terrain === 'river'
                      ? '#38BDF8'
                      : t.terrain === 'mountain'
                        ? '#64748B'
                        : '#334155'
                }
                fillOpacity={t.ownerHouseId ? '0.85' : '0.5'}
              />
            ))}
            {state.highSeatTileKey && (fogMap[state.highSeatTileKey] ?? 'unexplored') !== 'unexplored' && state.tiles[state.highSeatTileKey] && (
              <circle
                cx={state.tiles[state.highSeatTileKey]!.x + 0.5}
                cy={state.tiles[state.highSeatTileKey]!.y + 0.5}
                r="1.3"
                fill="#FACC15"
                stroke="#13151A"
                strokeWidth="0.35"
              />
            )}
            {Array.from(keepByTile.values()).map((k) => {
              if ((fogMap[k.tileKey] ?? 'unexplored') === 'unexplored') return null;
              return (
                <rect
                  key={`mmk_${k.id}`}
                  x={k.x - 0.45}
                  y={k.y - 0.45}
                  width="1.9"
                  height="1.9"
                  fill={k.ownerHouseId ? HOUSES[k.ownerHouseId].colors.primary : '#FAF7F0'}
                  stroke="#13151A"
                  strokeWidth="0.35"
                />
              );
            })}
          </svg>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            {ownedKeeps[0] && (
              <button
                type="button"
                onClick={() => {
                  centerOnTile(ownedKeeps[0]!.tileKey);
                  onTileTap(ownedKeeps[0]!.tileKey);
                }}
                className="touch-target min-h-[44px] px-2 py-1 rounded-lg bg-[#23262E] border border-amber-500/40 text-amber-200 font-semibold truncate text-left"
              >
                ★ Capital
              </button>
            )}
            {commanderUnit && (
              <button
                type="button"
                onClick={() => {
                  centerOnTile(commanderUnit.tileKey);
                  onTileTap(commanderUnit.tileKey);
                }}
                className="touch-target min-h-[44px] px-2 py-1 rounded-lg bg-[#23262E] border border-sky-400/40 text-sky-200 font-semibold truncate text-left"
              >
                ♛ Marshal
              </button>
            )}
            {state.highSeatTileKey && (
              <button
                type="button"
                onClick={() => {
                  centerOnTile(state.highSeatTileKey!);
                  onTileTap(state.highSeatTileKey!);
                }}
                className="touch-target min-h-[44px] px-2 py-1 rounded-lg bg-[#23262E] border border-stone-600 text-stone-200 font-semibold truncate text-left"
              >
                👑 High Seat
              </button>
            )}
            {ownedOutposts[0] && (
              <button
                type="button"
                onClick={() => {
                  centerOnTile(ownedOutposts[0]!.tileKey);
                  onTileTap(ownedOutposts[0]!.tileKey);
                }}
                className="touch-target min-h-[44px] px-2 py-1 rounded-lg bg-[#23262E] border border-emerald-500/40 text-emerald-200 font-semibold truncate text-left"
              >
                ⚑ Outpost ({ownedOutposts.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compact Translucent Icon-Only Floating Map Controls (44x44px, 8px gaps, bottom-right) */}
      <div
        className="absolute right-2 bottom-2 flex flex-col gap-2 z-20"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {showZoomButtons && (
          <>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))))}
              className="touch-target w-11 h-11 flex items-center justify-center rounded-xl bg-[#1E2128]/78 backdrop-blur-sm border border-[#383B44]/90 text-stone-200 shadow-lg active:scale-95 transition"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M9 4 V14 M4 9 H14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(minZoom, Number((z - 0.25).toFixed(2))))}
              className="touch-target w-11 h-11 flex items-center justify-center rounded-xl bg-[#1E2128]/78 backdrop-blur-sm border border-[#383B44]/90 text-stone-200 shadow-lg active:scale-95 transition"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 9 H14" />
              </svg>
            </button>
          </>
        )}

        {onToggleMinimap && (
          <button
            type="button"
            onClick={onToggleMinimap}
            className={`touch-target w-11 h-11 flex items-center justify-center rounded-xl border backdrop-blur-sm shadow-lg active:scale-95 transition ${
              showMinimap
                ? 'bg-amber-950/80 border-amber-400/75 text-amber-300'
                : 'bg-[#1E2128]/78 border-[#383B44]/90 text-stone-300'
            }`}
            aria-label="Toggle frontier radar and quick jump"
            aria-pressed={showMinimap}
            title="Frontier Radar & Quick Jump"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="6.8" stroke="currentColor" strokeWidth="1.45" />
              <polygon points="10,5.2 12.2,10 10,14.8 7.8,10" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleYieldOverlay}
          className={`touch-target w-11 h-11 flex items-center justify-center rounded-xl border backdrop-blur-sm shadow-lg active:scale-95 transition ${
            showYieldOverlay
              ? 'bg-emerald-950/80 border-emerald-400/75 text-emerald-300'
              : 'bg-[#1E2128]/78 border-[#383B44]/90 text-stone-300'
          }`}
          aria-label="Toggle tile yields overlay"
          aria-pressed={showYieldOverlay}
          title={showYieldOverlay ? 'Hide tile yields' : 'Show tile yields'}
        >
          {/* Minimalist Sprout / Yield Icon */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 16 V6.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M10 12.2 C6.2 11.6 5.2 8.4 7 6.8 C8.8 7.5 9.8 9.8 10 12.2 Z"
              fill="currentColor"
              fillOpacity="0.28"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path
              d="M10 10.2 C13.8 9.6 14.8 6.4 13 4.8 C11.2 5.5 10.2 7.8 10 10.2 Z"
              fill="currentColor"
              fillOpacity="0.28"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M6.8 16 H13.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleCycleKeep}
          className="touch-target w-11 h-11 flex items-center justify-center rounded-xl bg-[#1E2128]/78 backdrop-blur-sm border border-[#D4AF5A]/50 text-[#E8C97E] shadow-lg active:scale-95 transition"
          aria-label="Cycle friendly Keeps"
          title="Cycle Keeps"
        >
          {/* Minimalist Castle / Keep Icon */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4 16 V7.5 H6.5 V9.5 H8.8 V6.5 H11.2 V9.5 H13.5 V7.5 H16 V16 Z"
              fill="currentColor"
              fillOpacity="0.22"
              stroke="currentColor"
              strokeWidth="1.45"
              strokeLinejoin="round"
            />
            <path
              d="M8.5 16 V12.8 A1.5 1.5 0 0 1 11.5 12.8 V16"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
