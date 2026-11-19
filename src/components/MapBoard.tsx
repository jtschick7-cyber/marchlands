/**
 * Marchlands (Spec v0.3) — 22x22 Inline SVG MapBoard
 *
 * Renders the 22x22 frontier on 48x48 tile viewBox coordinates with:
 * - Pan & pinch-to-zoom (0.65x - 2.0x)
 * - 8px pointer-movement threshold distinguishing drag from tile tap
 * - Exact DESIGN_TOKENS.md terrain, sticky Keep borders, Keep/Unit tokens,
 *   fog-of-war overlays, and tactical highlights.
 * Zero game math: all reachable/attackable/buildable sets are passed in from engine queries.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CoordKey,
  FogStatus,
  GameState,
  HouseId,
  KeepState,
  TileState,
  UnitState,
} from '../types/game.ts';
import { GRID_SIZE, HOUSES } from '../data/index.ts';
import type { BuildPreviewInfo } from '../engine/queries.ts';
import {
  ImprovementGlyphSvg,
  LandmarkGlyphSvg,
  UnitSilhouetteSvg,
} from './svg/HeraldrySvg.tsx';

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
  readonly focusTileKey: CoordKey | null;
  readonly focusNonce: number;
  readonly onTileTap: (tileKey: CoordKey) => void;
}

function TerrainTileSvg({ tile }: { readonly tile: TileState }) {
  const ox = tile.x * TILE_SIZE;
  const oy = tile.y * TILE_SIZE;

  let fill = '#D6D3C4';
  if (tile.terrain === 'forest') fill = '#7C9A73';
  else if (tile.terrain === 'hills') fill = '#B8A98A';
  else if (tile.terrain === 'mountain') fill = '#646870';
  else if (tile.terrain === 'river') fill = '#4B89AC';

  return (
    <g transform={`translate(${ox},${oy})`}>
      <rect width={TILE_SIZE} height={TILE_SIZE} fill={fill} stroke="#1E293B" strokeOpacity="0.16" strokeWidth="0.6" />

      {tile.terrain === 'plains' && (
        <g fill="#C7C3B0" opacity="0.55">
          <circle cx="12" cy="14" r="1" />
          <circle cx="32" cy="22" r="1" />
          <circle cx="20" cy="36" r="1" />
          <circle cx="38" cy="10" r="1" />
        </g>
      )}

      {tile.terrain === 'forest' && (
        <g fill="#4A6741" stroke="#527049" strokeWidth="0.8">
          <polygon points="14,26 20,11 26,26" />
          <polygon points="24,30 31,14 38,30" />
          <polygon points="9,34 15,21 21,34" />
        </g>
      )}

      {tile.terrain === 'hills' && (
        <g fill="none" stroke="#8C7C5E" strokeWidth="1.6" strokeLinecap="round">
          <path d="M6 30 Q18 16 30 30" />
          <path d="M18 36 Q31 20 42 36" />
        </g>
      )}

      {tile.terrain === 'mountain' && (
        <g>
          <polygon points="6,40 19,12 32,40" fill="#3F434A" />
          <polygon points="20,40 32,16 44,40" fill="#4B5059" />
          <polygon points="16,18 19,12 22,18" fill="#E2E8F0" />
          <polygon points="29.5,21 32,16 34.5,21" fill="#E2E8F0" />
        </g>
      )}

      {tile.terrain === 'river' && (
        <g fill="none" stroke="#93C5FD" strokeWidth="1.2" strokeLinecap="round" opacity="0.8">
          <path d="M4 16 Q14 12 24 16 T44 16" />
          <path d="M4 30 Q14 26 24 30 T44 30" />
        </g>
      )}

      {tile.hasIronDeposit && (
        <g transform="translate(33, 33)">
          <polygon
            points="6,0 12,3.5 12,9.5 6,13 0,9.5 0,3.5"
            fill="#94A3B8"
            stroke="#1E293B"
            strokeWidth="1"
          />
          <polygon points="6,2 10,4.5 6,7" fill="#38BDF8" opacity="0.85" />
        </g>
      )}
    </g>
  );
}

function KeepStructureSvg({ keep }: { readonly keep: KeepState }) {
  const c = HOUSES[keep.ownerHouseId].colors;
  const ox = keep.x * TILE_SIZE;
  const oy = keep.y * TILE_SIZE;
  const hpRatio = Math.max(0, Math.min(1, keep.keepHp / keep.maxKeepHp));
  const hpColor = hpRatio > 0.5 ? '#22C55E' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';

  return (
    <g transform={`translate(${ox},${oy})`} pointerEvents="none">
      {/* Keep HP bar */}
      <rect x="8" y="3" width="32" height="4" rx="1.5" fill="#0F172A" opacity="0.85" />
      <rect x="8.5" y="3.5" width={31 * hpRatio} height="3" rx="1" fill={hpColor} />

      {/* Tier-1 wooden palisade or Tier-2 twin stone stronghold */}
      {keep.tier === 1 ? (
        <g transform="translate(8, 9)">
          <rect x="7" y="9" width="18" height="19" rx="1.5" fill="#78350F" stroke="#1C1917" strokeWidth="1.3" />
          <rect x="10" y="4" width="12" height="7" fill={c.primary} stroke={c.darkStroke} strokeWidth="1.2" />
          <rect x="13" y="18" width="6" height="10" rx="2" fill="#1C1917" />
        </g>
      ) : (
        <g transform="translate(8, 9)">
          <rect x="3" y="10" width="26" height="18" rx="1.5" fill="#94A3B8" stroke="#1E293B" strokeWidth="1.3" />
          <rect x="3" y="4" width="9" height="9" fill="#CBD5E1" stroke="#1E293B" strokeWidth="1.2" />
          <rect x="20" y="4" width="9" height="9" fill="#CBD5E1" stroke="#1E293B" strokeWidth="1.2" />
          <rect x="12" y="17" width="8" height="11" rx="2.5" fill="#1E293B" />
          {/* House banner pennant */}
          <path d="M16 1 V11 M16 1 L24 4 L16 7" fill={c.primary} stroke={c.darkStroke} strokeWidth="1.1" />
        </g>
      )}
    </g>
  );
}

function UnitTokenSvg({ unit }: { readonly unit: UnitState }) {
  const c = HOUSES[unit.houseId].colors;
  const ox = unit.x * TILE_SIZE;
  const oy = unit.y * TILE_SIZE;
  const exhausted = unit.hasMoved && unit.hasAttacked;
  const hpRatio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
  const hpColor = hpRatio > 0.5 ? '#22C55E' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
  const hasPenalty = unit.homeKeepId === 'orphaned' || unit.isMutinied;

  return (
    <g transform={`translate(${ox},${oy})`} pointerEvents="none" opacity={exhausted ? 0.78 : 1}>
      {/* Circular/shield token at x:12, y:6, 28x28 */}
      <circle
        cx="26"
        cy="20"
        r="13.5"
        fill={c.primary}
        stroke={exhausted ? '#64748B' : '#FFFFFF'}
        strokeWidth="2.2"
      />
      <g transform="translate(14, 8)">
        <UnitSilhouetteSvg unitId={unit.typeId} color={c.badgeText} />
      </g>

      {/* Unit HP bar at y:36, 26px wide */}
      <rect x="13" y="36" width="26" height="4" rx="1.5" fill="#0F172A" opacity="0.9" />
      <rect x="13.5" y="36.5" width={25 * hpRatio} height="3" rx="1" fill={hpColor} />

      {/* Supply-Severed / Mutiny pip */}
      {hasPenalty && (
        <g transform="translate(34, 5)">
          <circle cx="4" cy="4" r="4.5" fill="#DC2626" stroke="#FFFFFF" strokeWidth="1" />
          <text x="4" y="6.8" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#FFFFFF">
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
  focusTileKey,
  focusNonce,
  onTileTap,
}: MapBoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1.0);
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

  const centerOnTile = useCallback((tileKey: CoordKey, targetZoom?: number) => {
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
  }, [state.tiles, zoom]);

  // Center on capital on initial mount or when focusTileKey changes
  useEffect(() => {
    if (focusTileKey) {
      centerOnTile(focusTileKey);
    }
  }, [focusTileKey, focusNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const fogMap = useMemo(() => state.fog[viewerHouseId] ?? {}, [state.fog, viewerHouseId]);
  const tilesArray = useMemo(() => Object.values(state.tiles), [state.tiles]);

  // Precompute Keep lookup by tileKey
  const keepByTile = useMemo(() => {
    const m = new Map<CoordKey, KeepState>();
    for (const k of Object.values(state.keeps)) {
      m.set(k.tileKey, k);
    }
    return m;
  }, [state.keeps]);

  // Visible units (fog-honest: only render enemy units on 'visible' tiles)
  const visibleUnits = useMemo(() => {
    return Object.values(state.units).filter((u) => {
      if (u.houseId === viewerHouseId) return true;
      return fogMap[u.tileKey] === 'visible';
    });
  }, [state.units, viewerHouseId, fogMap]);

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
    const capital = Object.values(state.keeps).find(
      (k) => k.ownerHouseId === viewerHouseId && k.isCapital,
    ) ?? Object.values(state.keeps).find((k) => k.ownerHouseId === viewerHouseId);
    if (capital) {
      centerOnTile(capital.tileKey);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full overflow-hidden bg-[#0F172A] select-none"
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
          {/* Layer 1: Base Terrain & Owned Territory Wash */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'unexplored') return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            const ownerColor = tile.ownerHouseId ? HOUSES[tile.ownerHouseId].colors.primary : null;

            return (
              <g key={`t_${tile.key}`}>
                <TerrainTileSvg tile={tile} />
                {ownerColor && (
                  <rect
                    x={ox}
                    y={oy}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                    fill={ownerColor}
                    fillOpacity="0.12"
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
            const topDiff = state.tiles[`${tile.x},${tile.y - 1}`]?.keepId !== tile.keepId;
            const bottomDiff = state.tiles[`${tile.x},${tile.y + 1}`]?.keepId !== tile.keepId;
            const leftDiff = state.tiles[`${tile.x - 1},${tile.y}`]?.keepId !== tile.keepId;
            const rightDiff = state.tiles[`${tile.x + 1},${tile.y}`]?.keepId !== tile.keepId;

            return (
              <g
                key={`b_${tile.key}`}
                stroke={color}
                strokeWidth="2.5"
                strokeDasharray="5 3"
                pointerEvents="none"
              >
                {topDiff && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + 1.5} />}
                {bottomDiff && <line x1={ox + 1.5} y1={oy + TILE_SIZE - 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
                {leftDiff && <line x1={ox + 1.5} y1={oy + 1.5} x2={ox + 1.5} y2={oy + TILE_SIZE - 1.5} />}
                {rightDiff && <line x1={ox + TILE_SIZE - 1.5} y1={oy + 1.5} x2={ox + TILE_SIZE - 1.5} y2={oy + TILE_SIZE - 1.5} />}
              </g>
            );
          })}

          {/* Layer 3: Improvements & Landmarks (Bottom-Left 20x20 slot) */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'unexplored') return null;
            const hasKeep = keepByTile.has(tile.key);
            if (hasKeep) return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;

            if (tile.improvement) {
              return (
                <g key={`imp_${tile.key}`} transform={`translate(${ox + 4},${oy + 24})`} pointerEvents="none">
                  <rect width="20" height="20" rx="3" fill="#0F172A" fillOpacity="0.45" />
                  <ImprovementGlyphSvg id={tile.improvement} />
                </g>
              );
            }

            if (tile.landmark !== 'none' && !tile.landmarkCleared) {
              return (
                <g key={`lm_${tile.key}`} transform={`translate(${ox + 4},${oy + 24})`} pointerEvents="none">
                  <rect width="20" height="20" rx="3" fill="#0F172A" fillOpacity="0.45" />
                  <LandmarkGlyphSvg landmark={tile.landmark} />
                </g>
              );
            }
            return null;
          })}

          {/* Layer 4: Keeps */}
          {Array.from(keepByTile.values()).map((keep) => {
            const fog: FogStatus = fogMap[keep.tileKey] ?? 'unexplored';
            if (fog === 'unexplored') return null;
            return <KeepStructureSvg key={keep.id} keep={keep} />;
          })}

          {/* Layer 5: Fog of War (Unexplored Charcoal & Explored Dusk Veil) */}
          {tilesArray.map((tile) => {
            const fog: FogStatus = fogMap[tile.key] ?? 'unexplored';
            if (fog === 'visible') return null;
            const ox = tile.x * TILE_SIZE;
            const oy = tile.y * TILE_SIZE;
            if (fog === 'unexplored') {
              return (
                <rect
                  key={`fog_${tile.key}`}
                  x={ox}
                  y={oy}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  fill="#18181B"
                  stroke="#27272A"
                  strokeWidth="0.8"
                  pointerEvents="none"
                />
              );
            }
            return (
              <rect
                key={`fog_${tile.key}`}
                x={ox}
                y={oy}
                width={TILE_SIZE}
                height={TILE_SIZE}
                fill="#0F172A"
                fillOpacity="0.48"
                pointerEvents="none"
              />
            );
          })}

          {/* Layer 6: Visible Units */}
          {visibleUnits.map((u) => (
            <UnitTokenSvg key={u.id} unit={u} />
          ))}

          {/* Layer 7: Tactical Overlays (Reachable, Attackable, Build Preview, Selected) */}
          {Array.from(reachableKeys).map((k) => {
            const t = state.tiles[k];
            if (!t) return null;
            return (
              <rect
                key={`reach_${k}`}
                x={t.x * TILE_SIZE + 2}
                y={t.y * TILE_SIZE + 2}
                width={TILE_SIZE - 4}
                height={TILE_SIZE - 4}
                rx="3"
                fill="#38BDF8"
                fillOpacity="0.28"
                stroke="#0284C7"
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
                  rx="3"
                  fill="#EF4444"
                  fillOpacity="0.32"
                />
                <path
                  d={`M${ox + 3} ${oy + 12} V${oy + 3} H${ox + 12} M${ox + 36} ${oy + 3} H${ox + 45} V${oy + 12} M${ox + 3} ${oy + 36} V${oy + 45} H${ox + 12} M${ox + 36} ${oy + 45} H${ox + 45} V${oy + 36}`}
                  stroke="#DC2626"
                  strokeWidth="2.4"
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
            const pill = parts.join(' ') || 'OK';

            return (
              <g key={`bld_${k}`} pointerEvents="none">
                <rect
                  x={ox + 2}
                  y={oy + 2}
                  width={TILE_SIZE - 4}
                  height={TILE_SIZE - 4}
                  rx="3"
                  fill="#22C55E"
                  fillOpacity="0.28"
                  stroke="#16A34A"
                  strokeWidth="2"
                />
                <rect x={ox + 4} y={oy + 4} width="40" height="14" rx="7" fill="#15803D" />
                <text
                  x={ox + 24}
                  y={oy + 14}
                  textAnchor="middle"
                  fontSize="9"
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
              rx="4"
              fill="none"
              stroke="#FACC15"
              strokeWidth="3"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>

      {/* Floating Zoom & Recenter Controls (>= 44x44 touch targets, 8px gap) */}
      <div className="absolute right-2 bottom-2 flex flex-col gap-2 z-20">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Number((z + 0.25).toFixed(2))))}
          className="touch-target flex items-center justify-center rounded-lg bg-[#1E293B]/90 border border-[#334155] text-slate-100 text-lg font-bold shadow-md active:bg-slate-700"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Number((z - 0.25).toFixed(2))))}
          className="touch-target flex items-center justify-center rounded-lg bg-[#1E293B]/90 border border-[#334155] text-slate-100 text-lg font-bold shadow-md active:bg-slate-700"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={handleRecenter}
          className="touch-target flex items-center justify-center rounded-lg bg-[#1E293B]/90 border border-[#334155] text-slate-100 text-xs font-semibold shadow-md active:bg-slate-700"
          aria-label="Center on capital"
        >
          Keep
        </button>
      </div>
    </div>
  );
}
