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
  UnitSilhouetteSvg,
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
    fillUrl = 'url(#grad-plains)';
  } else if (season === 'winter') {
    fillUrl = 'url(#grad-plains-winter)';
  } else if (season === 'autumn') {
    fillUrl = 'url(#grad-plains-autumn)';
  }

  // Deterministic pine tree palette by season
  const treeDark =
    season === 'autumn' ? '#7C4A22' : season === 'winter' ? '#36504B' : '#3A5834';
  const treeMid =
    season === 'autumn' ? '#A45A28' : season === 'winter' ? '#4F6F67' : '#4E7044';
  const treeLight =
    season === 'autumn' ? '#CA7E32' : season === 'winter' ? '#CBD5E1' : '#658C59';

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

      {/* Forest: layered 3D shaded conifer canopies */}
      {tile.terrain === 'forest' && (
        <g pointerEvents="none">
          <ellipse cx="16" cy="27" rx="8" ry="2.8" fill="#1F331E" opacity="0.28" />
          <ellipse cx="32" cy="31" rx="9" ry="3" fill="#1F331E" opacity="0.28" />
          <ellipse cx="14" cy="36" rx="7" ry="2.4" fill="#1F331E" opacity="0.24" />
          {/* Back pine */}
          <polygon points="10,25 16,10 22,25" fill={treeDark} />
          <polygon points="13,25 16,10 21,25" fill={treeMid} opacity="0.7" />
          {/* Tall right pine */}
          <polygon points="23,30 31,11 39,30" fill={treeDark} />
          <polygon points="26,30 31,11 37,30" fill={treeMid} />
          <polygon points="28,21 31,11 34,21" fill={treeLight} opacity="0.7" />
          {/* Foreground left pine */}
          <polygon points="7,35 14,19 21,35" fill={treeMid} />
          <polygon points="10.5,27 14,19 17.5,27" fill={treeLight} opacity="0.75" />
          {/* Extra sapling for variety */}
          {h % 2 === 0 && <polygon points="33,21 37,12 41,21" fill={treeDark} opacity="0.85" />}
        </g>
      )}

      {/* Hills: sunlit west & shaded east topographic mounds */}
      {tile.terrain === 'hills' && (
        <g pointerEvents="none">
          <path
            d="M4 33 Q17 15 31 33 Z"
            fill={season === 'winter' ? '#94A3B8' : '#A49374'}
            opacity="0.75"
          />
          <path
            d="M17 20 Q24 22 31 33 L17 33 Z"
            fill="#6E5F45"
            opacity="0.24"
          />
          <path
            d="M15 39 Q29 19 44 39 Z"
            fill={season === 'winter' ? '#CBD5E1' : '#C4B596'}
            opacity="0.85"
          />
          <path
            d="M29 24 Q37 28 44 39 L29 39 Z"
            fill="#6E5F45"
            opacity="0.22"
          />
          <path
            d="M5 33 Q17 16 30 33"
            fill="none"
            stroke="#78684D"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.65"
          />
          <path
            d="M16 39 Q29 20 43 39"
            fill="none"
            stroke="#78684D"
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity="0.75"
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

      {/* Auto-tiled Seamless River Channel with Banks & Shimmer */}
      {tile.terrain === 'river' && (
        <g pointerEvents="none">
          {/* Outer sandy bank & water arms connecting to adjacent river tiles */}
          <g
            stroke={season === 'winter' ? '#94A3B8' : '#C2B28F'}
            strokeWidth="28"
            strokeLinecap="round"
            fill="none"
          >
            <line x1="24" y1="24" x2="24" y2="24" />
            {riverMask.n && <line x1="24" y1="24" x2="24" y2="0" />}
            {riverMask.s && <line x1="24" y1="24" x2="24" y2="48" />}
            {riverMask.w && <line x1="24" y1="24" x2="0" y2="24" />}
            {riverMask.e && <line x1="24" y1="24" x2="48" y2="24" />}
            {!riverMask.n && !riverMask.s && !riverMask.e && !riverMask.w && (
              <line x1="8" y1="24" x2="40" y2="24" />
            )}
          </g>
          {/* Main river water channel */}
          <g
            stroke={season === 'winter' ? '#6096BA' : '#3B7EA1'}
            strokeWidth="22"
            strokeLinecap="round"
            fill="none"
          >
            <line x1="24" y1="24" x2="24" y2="24" />
            {riverMask.n && <line x1="24" y1="24" x2="24" y2="0" />}
            {riverMask.s && <line x1="24" y1="24" x2="24" y2="48" />}
            {riverMask.w && <line x1="24" y1="24" x2="0" y2="24" />}
            {riverMask.e && <line x1="24" y1="24" x2="48" y2="24" />}
            {!riverMask.n && !riverMask.s && !riverMask.e && !riverMask.w && (
              <line x1="8" y1="24" x2="40" y2="24" />
            )}
          </g>
          {/* Deep center current */}
          <g
            stroke={season === 'winter' ? '#467B9E' : '#2A6384'}
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
          >
            <line x1="24" y1="24" x2="24" y2="24" />
            {riverMask.n && <line x1="24" y1="24" x2="24" y2="0" />}
            {riverMask.s && <line x1="24" y1="24" x2="24" y2="48" />}
            {riverMask.w && <line x1="24" y1="24" x2="0" y2="24" />}
            {riverMask.e && <line x1="24" y1="24" x2="48" y2="24" />}
          </g>
          {/* Animated surface shimmer */}
          <g
            className="river-shimmer"
            fill="none"
            stroke={season === 'winter' ? '#E0F2FE' : '#BAE6FD'}
            strokeWidth="1.15"
            strokeLinecap="round"
          >
            <path d="M16 20 Q24 17.5 32 20" />
            <path d="M18 28 Q24 25.5 31 28" />
          </g>
        </g>
      )}

      {/* Embedded Metallic Iron Vein Deposit */}
      {tile.hasIronDeposit && (
        <g transform="translate(31, 31)" pointerEvents="none">
          <ellipse cx="7" cy="11.5" rx="6.5" ry="2.4" fill="#0F172A" opacity="0.35" />
          <polygon
            points="7,0.5 13,4 13,10 7,13.5 1,10 1,4"
            fill="#64748B"
            stroke="#0F172A"
            strokeWidth="1.1"
          />
          <polygon points="7,1.5 12,4.5 7,7.5 2,4.5" fill="#CBD5E1" opacity="0.85" />
          <polygon points="7,3 10.5,5 7,7" fill="#38BDF8" />
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
      {/* Active Ready Pulse Ring */}
      {isViewerUnit && isActionable && (
        <circle
          className="unit-ready-ring"
          cx="26"
          cy="20"
          r="16.2"
          fill="none"
          stroke="#FDE047"
          strokeWidth="1.6"
        />
      )}

      {/* Token Drop Shadow */}
      <ellipse cx="26" cy="34" rx="11.5" ry="3.2" fill="#0F172A" opacity="0.4" />

      {/* Heraldic Shield-Medallion Base */}
      <g filter="url(#token-shadow)">
        <path
          d="M12.5 9.5 Q26 5.5 39.5 9.5 V20.5 C39.5 28 33.8 32.5 26 35 C18.2 32.5 12.5 28 12.5 20.5 Z"
          fill={c.primary}
          stroke={
            unit.isFortified
              ? '#34D399'
              : dimmed
                ? '#64748B'
                : '#FEF9C3'
          }
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <path
          d="M14.5 11.2 Q26 7.8 37.5 11.2 V20 C37.5 26.2 32.5 30.2 26 32.4 C19.5 30.2 14.5 26.2 14.5 20 Z"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.22"
          strokeWidth="0.9"
        />
      </g>

      {/* Unit Silhouette */}
      <g transform="translate(14, 8)">
        <UnitSilhouetteSvg unitId={unit.typeId} color={c.badgeText} />
      </g>

      {/* Unit HP Bar */}
      <rect x="12" y="36.5" width="28" height="4.8" rx="2" fill="#0F172A" opacity="0.95" />
      <rect x="12.8" y="37.3" width={26.4 * hpRatio} height="3.2" rx="1.2" fill={hpColor} />

      {/* Veterancy Chevrons (Top-Left) */}
      {rank > 0 && (
        <g transform="translate(8, 5)">
          <circle
            cx="5"
            cy="5"
            r="5.5"
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

      {/* Fortified Bastion Badge (Bottom-Right) */}
      {unit.isFortified && (
        <g transform="translate(34, 24)">
          <path
            d="M5 0.5 L9.5 2.5 V5.5 C9.5 8 7.6 9.6 5 10.6 C2.4 9.6 0.5 8 0.5 5.5 V2.5 Z"
            fill="#065F46"
            stroke="#34D399"
            strokeWidth="1.2"
          />
          <path d="M3.2 5.4 L4.6 6.8 L7.2 3.8" stroke="#D1FAE5" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </g>
      )}

      {/* Supply-Severed / Mutiny Warning Pip (Top-Right) */}
      {hasPenalty && (
        <g transform="translate(35, 4)">
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
