/**
 * Marchlands (Spec v0.3) — Inline SVG Heraldry, Unit Silhouettes, Tile Illustrations & HUD Icons
 *
 * Exact colorblind-safe hex palette from docs/DESIGN_TOKENS.md.
 * Zero external raster images — 100% crisp inline vector art.
 */

import type { HouseId, ImprovementId, LandmarkType, Season, UnitId } from '../../types/game.ts';
import { HOUSES } from '../../data/index.ts';

export type HudIconKind =
  | 'food'
  | 'materials'
  | 'coin'
  | 'favor'
  | 'score'
  | 'keep'
  | 'shield'
  | 'sword'
  | 'crown'
  | 'realm';

export function ResourceIconSvg({
  kind,
  size = 14,
  className = 'shrink-0',
}: {
  readonly kind: HudIconKind;
  readonly size?: number;
  readonly className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
    >
      {kind === 'food' && (
        <g stroke="#22C55E" strokeWidth="1.4" strokeLinecap="round" fill="none">
          <path d="M8 14 V3" />
          <path d="M8 11 C5 10.5 4.2 8.2 5.2 6.8 C6.5 7.4 7.5 8.8 8 10" fill="#16A34A" fillOpacity="0.45" />
          <path d="M8 9.5 C11 9 11.8 6.8 10.8 5.4 C9.5 6 8.5 7.4 8 8.5" fill="#16A34A" fillOpacity="0.45" />
          <path d="M8 6.5 C6 5.8 5.8 3.8 7 2.8 C7.7 3.6 8 4.8 8 6.5" fill="#4ADE80" fillOpacity="0.55" />
        </g>
      )}
      {kind === 'materials' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <polygon points="2.5,11 5.5,6.5 11.5,6.5 13.5,11" fill="#D97706" stroke="#FEF3C7" strokeWidth="1" />
          <path d="M4.5 11 H11.5 M6 4 L12 9.5" stroke="#F59E0B" strokeWidth="1.4" />
          <polygon points="3.5,13 5,10 11,10 12.5,13" fill="#B45309" stroke="#FDE68A" strokeWidth="0.8" />
        </g>
      )}
      {kind === 'coin' && (
        <g>
          <circle cx="8" cy="8" r="6" fill="#EAB308" stroke="#FEF08A" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="3.6" fill="none" stroke="#92400E" strokeWidth="1" />
          <path d="M6.2 8.8 L7 6.3 L8 7.5 L9 6.3 L9.8 8.8 Z" fill="#92400E" />
        </g>
      )}
      {kind === 'favor' && (
        <g fill="none" stroke="#C084FC" strokeWidth="1.35" strokeLinecap="round">
          <path d="M5.5 13 C3 10.5 3 6 5.5 3.5" />
          <path d="M10.5 13 C13 10.5 13 6 10.5 3.5" />
          <path d="M6.5 13.5 H9.5" />
          <polygon points="8,4.2 8.9,6.6 11.3,6.8 9.4,8.3 10,10.7 8,9.4 6,10.7 6.6,8.3 4.7,6.8 7.1,6.6" fill="#E9D5FF" stroke="none" />
        </g>
      )}
      {kind === 'score' && (
        <g>
          <path d="M3.5 2.5 H12.5 V10.5 L8 14 L3.5 10.5 Z" fill="#0284C7" stroke="#BAE6FD" strokeWidth="1.1" />
          <polygon points="8,4.5 8.8,6.7 11,6.8 9.2,8.1 9.8,10.2 8,9 6.2,10.2 6.8,8.1 5,6.8 7.2,6.7" fill="#FEF08A" />
        </g>
      )}
      {kind === 'keep' && (
        <g fill="#E2E8F0" stroke="#475569" strokeWidth="0.9" strokeLinejoin="round">
          <path d="M3 14 V6 H5 V8 H7 V5 H9 V8 H11 V6 H13 V14 Z" />
          <rect x="6.5" y="10" width="3" height="4" rx="1" fill="#0F172A" stroke="none" />
        </g>
      )}
      {kind === 'shield' && (
        <path
          d="M8 2 L13 4.2 V8.2 C13 11.2 10.9 13.2 8 14.3 C5.1 13.2 3 11.2 3 8.2 V4.2 Z"
          fill="#10B981"
          fillOpacity="0.28"
          stroke="#34D399"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
      {kind === 'sword' && (
        <g stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 12.5 L12.5 3.5" />
          <path d="M9.5 3.5 H12.5 V6.5" />
          <path d="M4.5 9.5 L6.5 11.5" />
        </g>
      )}
      {kind === 'crown' && (
        <path
          d="M2.5 11.5 L3.8 5.2 L6.6 8 L8 4 L9.4 8 L12.2 5.2 L13.5 11.5 Z M3 13 H13"
          fill="#F59E0B"
          stroke="#FEF3C7"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      )}
      {kind === 'realm' && (
        <g fill="none" stroke="#93C5FD" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3.5 H13 V12.5 H3 Z" fill="#1E3A8A" fillOpacity="0.45" />
          <path d="M8 3.5 V12.5 M5 6.5 H6.8 M5 9 H6.8 M9.5 6.5 H11.2 M9.5 9 H11.2" />
        </g>
      )}
    </svg>
  );
}

export function HouseSigilSvg({
  houseId,
  size = 24,
}: {
  readonly houseId: HouseId;
  readonly size?: number;
}) {
  const c = HOUSES[houseId].colors;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label={HOUSES[houseId].name}
      className="shrink-0 drop-shadow-sm"
    >
      {houseId === 'vane' && (
        <>
          <path
            d="M4 3 H20 V12 C20 17 16 20 12 22 C8 20 4 17 4 12 Z"
            fill={c.primary}
            stroke={c.darkStroke}
            strokeWidth="1.6"
          />
          <path
            d="M5.5 4.5 H18.5 V11.5 C18.5 15.8 15.2 18.4 12 20.1 C8.8 18.4 5.5 15.8 5.5 11.5 Z"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.22"
            strokeWidth="0.9"
          />
          <path
            d="M12 17 V11 M12 12 L8 8 M12 12 L16 8 M9.5 9.5 L7 10 M14.5 9.5 L17 10 M12 11 L12 6.5"
            stroke={c.badgeText}
            strokeWidth="1.65"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
      {houseId === 'ironhelm' && (
        <>
          <rect
            x="3.5"
            y="3"
            width="17"
            height="18"
            rx="2.2"
            fill={c.primary}
            stroke={c.darkStroke}
            strokeWidth="1.6"
          />
          <rect
            x="5"
            y="4.5"
            width="14"
            height="15"
            rx="1.2"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.22"
            strokeWidth="0.9"
          />
          <path
            d="M6.5 11 H17.5 L15.5 14 H14 V16.5 H16 V18 H8 V16.5 H10 V14 H8.5 Z M11 6.5 H13 V10 H11 Z M9.5 6.5 H14.5 V8 H9.5 Z"
            fill={c.badgeText}
          />
        </>
      )}
      {houseId === 'aurelia' && (
        <>
          <circle cx="12" cy="12" r="9.5" fill={c.primary} stroke={c.darkStroke} strokeWidth="1.6" />
          <circle cx="12" cy="12" r="7.8" fill="none" stroke="#FEF3C7" strokeOpacity="0.4" strokeWidth="0.9" />
          <path d="M7 13 L8.5 8 L11 11 L12 7.5 L13 11 L15.5 8 L17 13 Z" fill={c.badgeText} />
          <path
            d="M7 15.5 Q9.5 14.2 12 15.5 T17 15.5 M7 17.8 Q9.5 16.5 12 17.8 T17 17.8"
            stroke={c.badgeText}
            strokeWidth="1.35"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
      {houseId === 'corvus' && (
        <>
          <polygon
            points="12,2.3 21.7,12 12,21.7 2.3,12"
            fill={c.primary}
            stroke={c.darkStroke}
            strokeWidth="1.6"
          />
          <polygon
            points="12,4.3 19.7,12 12,19.7 4.3,12"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.22"
            strokeWidth="0.9"
          />
          <path
            d="M12 16.2 L7 9.5 L10.5 11 L12 7.5 L13.5 11 L17 9.5 Z"
            fill={c.badgeText}
          />
        </>
      )}
      {houseId === 'solis' && (
        <>
          <polygon
            points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8"
            fill={c.primary}
            stroke={c.darkStroke}
            strokeWidth="1.6"
          />
          <circle cx="12" cy="12" r="3.4" fill="#CA8A04" />
          <path
            d="M12 5 V7.5 M12 16.5 V19 M5 12 H7.5 M16.5 12 H19 M7 7 L8.8 8.8 M15.2 15.2 L17 17 M17 7 L15.2 8.8 M8.8 15.2 L7 17"
            stroke="#CA8A04"
            strokeWidth="1.65"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/**
 * 36x36 sharpened, cel-shaded miniature soldier / rider / siege engine figures.
 * Uses sculpted armor/boots, two-tone drapery shading, crisp metallic glints,
 * and bold dark tabletop ink outlines for instant clarity on 48x48 map tiles.
 */
export function UnitFigureSvg({
  unitId,
  houseId,
}: {
  readonly unitId: UnitId;
  readonly houseId: HouseId;
}) {
  const c = HOUSES[houseId].colors;
  const primary = c.primary;
  const accent = c.lightTint;
  const darkTrim = c.darkStroke;
  const ink = '#0B1120';
  const steelHi = '#F8FAFC';
  const steel = '#CBD5E1';
  const steelDark = '#64748B';
  const leather = '#78350F';
  const wood = '#92400E';
  const skin = '#F2CBA5';
  const skinShade = '#D9A77B';
  const gold = '#FACC15';
  const goldDark = '#B45309';

  switch (unitId) {
    case 'militia':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Sculpted boots in braced stance */}
          <path d="M13.2 25.5 H16.6 L16.2 31.8 H12.4 L13.2 29.8 Z" fill="#334155" />
          <path d="M19.2 25.5 H22.6 L23.5 31.8 H19.6 L19.4 29.8 Z" fill="#1E293B" />
          {/* Raised bearded wood-axe */}
          <path d="M22.5 23 L29 8.2" stroke={wood} strokeWidth="2.1" />
          <path d="M27.2 9 C31.2 8.2 33 11.4 31.2 15.6 L26.3 13.4 Z" fill={steel} />
          <path d="M30.5 9.6 C31.8 11.3 31.6 13.4 30.6 14.8" fill="none" stroke={steelHi} strokeWidth="0.85" />
          {/* Cel-shaded gambeson tunic */}
          <path d="M12.2 16 L17.8 14.6 L23.2 16 L24.2 26.4 H11.4 Z" fill={primary} />
          <path d="M18 14.8 L23.2 16 L24.2 26.4 H18 Z" fill={darkTrim} opacity="0.4" stroke="none" />
          {/* Cinched leather belt & brass buckle */}
          <rect x="11.6" y="21.4" width="12.4" height="2.2" rx="0.5" fill={leather} />
          <rect x="16.8" y="21.2" width="2.2" height="2.6" rx="0.4" fill={gold} strokeWidth="0.6" />
          {/* Head & stitched leather coif */}
          <circle cx="17.8" cy="11.2" r="3.6" fill={skin} />
          <path d="M19 8.6 A3.4 3.4 0 0 1 19 14.2" fill={skinShade} stroke="none" opacity="0.55" />
          <path d="M13.8 10.8 C14 6.6 21.6 6.6 21.8 10.8 L20.8 11.4 H14.8 Z" fill={leather} />
          <path d="M15.4 8.2 Q17.6 7.4 19.6 8.2" fill="none" stroke="#B45309" strokeWidth="0.8" />
          {/* Round iron-rimmed buckler */}
          <circle cx="11.2" cy="21.5" r="4.8" fill="#B45309" strokeWidth="1.05" />
          <circle cx="11.2" cy="21.5" r="3.4" fill={primary} stroke={steel} strokeWidth="0.8" />
          <circle cx="11.2" cy="21.5" r="1.2" fill={steelHi} stroke={ink} strokeWidth="0.55" />
        </g>
      );

    case 'men_at_arms':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Flowing dark cloak */}
          <path d="M12.5 15.5 L8 28.5 L15.5 27.5 Z" fill={darkTrim} />
          {/* Armored steel greaves */}
          <path d="M13.2 25.5 H16.8 L16.2 32.2 H12.4 Z" fill={steel} />
          <path d="M19.2 25.5 H22.8 L23.6 32.2 H19.6 Z" fill={steelDark} />
          {/* Gleaming two-handed longsword */}
          <polygon points="22.8,20.2 30.8,4.6 32.4,5.6 24.4,21.2" fill={steel} />
          <path d="M24.2 18.8 L31.2 5.4" stroke={steelHi} strokeWidth="0.8" />
          <path d="M21.2 18 L26.5 20.6" stroke={gold} strokeWidth="2.1" />
          <path d="M21 22.8 L23.5 19.5" stroke={leather} strokeWidth="2" />
          {/* Plate breastplate & House surcoat */}
          <path d="M11.8 15.2 H23.6 L24.6 26.8 H11 Z" fill={primary} />
          <path d="M18.2 15.2 H23.6 L24.6 26.8 H18.2 Z" fill={darkTrim} opacity="0.42" stroke="none" />
          <path d="M12.2 15.2 H23.2 V19.6 L17.8 21.4 L12.2 19.6 Z" fill={steel} />
          <rect x="11.6" y="21.6" width="12.6" height="2" fill={leather} />
          <rect x="16.8" y="21.3" width="2.2" height="2.6" fill={gold} strokeWidth="0.6" />
          {/* Fluted steel pauldrons */}
          <path d="M9.6 17.5 C9.6 14.5 13.8 14.2 14.2 17.5 Z" fill={steel} />
          <path d="M21.2 17.5 C21.6 14.2 25.8 14.5 25.8 17.5 Z" fill={steelDark} />
          {/* Visored armet helm with dark eye-slit & crest glint */}
          <path d="M13.8 14 V9.4 A4 4 0 0 1 21.8 9.4 V14 L17.8 15 Z" fill={steel} />
          <path d="M17.8 5.6 A4 4 0 0 1 21.8 9.4 V14 L17.8 15 Z" fill={steelDark} opacity="0.45" stroke="none" />
          <path d="M15 10.6 H20.6" stroke={ink} strokeWidth="1.5" />
          <path d="M15.2 7.8 Q17.2 6.8 19.2 7.5" fill="none" stroke={steelHi} strokeWidth="0.85" />
          {/* Steel-rimmed heater shield */}
          <path d="M7.8 17.4 H15.4 V22.4 C15.4 25.2 13.5 27.1 11.6 28.2 C9.7 27.1 7.8 25.2 7.8 22.4 Z" fill={primary} stroke={steelHi} strokeWidth="1.15" />
          <path d="M11.6 18.6 V26.8 M9 22 H14.2" stroke={accent} strokeWidth="0.95" opacity="0.8" />
        </g>
      );

    case 'spearman':
    case 'free_company_spearman':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Planted greaves & boots */}
          <path d="M13.2 25.5 H16.6 L16.2 32 H12.4 Z" fill="#334155" />
          <path d="M19.2 25.5 H22.6 L23.6 32 H19.6 Z" fill="#1E293B" />
          {/* Towering ashwood pike + gleaming steel leaf-head */}
          <path d="M23.5 32.5 L27.6 3.5" stroke={wood} strokeWidth="2" />
          <polygon points="27.9,1 25.2,7.8 27.4,7 30.2,8.1" fill={steel} />
          <path d="M27.8 2.2 L26.5 6.8" stroke={steelHi} strokeWidth="0.8" />
          {unitId === 'free_company_spearman' && (
            <path d="M26.6 8.5 L33 10.2 L28.5 11.4 L32.2 12.6 L26.2 12.2 Z" fill={gold} strokeWidth="0.75" />
          )}
          {/* Shaded House tabard & steel gorget */}
          <path d="M12.2 15.6 H23.2 L24.2 26.6 H11.2 Z" fill={primary} />
          <path d="M18 15.6 H23.2 L24.2 26.6 H18 Z" fill={darkTrim} opacity="0.4" stroke="none" />
          <path d="M13.2 15.5 Q17.8 18.2 22.2 15.5" fill={steel} />
          <rect x="11.6" y="21.5" width="12.2" height="2" fill={leather} />
          {/* Head & brimmed steel kettle helm */}
          <circle cx="17.8" cy="11.8" r="3.2" fill={skin} />
          <path d="M15 11.4 H20.6" stroke={ink} strokeWidth="1" opacity="0.45" />
          <path d="M11.6 10.8 Q17.8 5.6 24 10.8 L22.8 11.8 Q17.8 10.4 12.8 11.8 Z" fill={steel} />
          <path d="M14.5 8.5 Q17.5 7 20.5 8.5" fill="none" stroke={steelHi} strokeWidth="0.85" />
          {unitId === 'free_company_spearman' && (
            <path d="M19.8 7.5 C23 4.8 25.2 6.2 24.4 9.2" fill="none" stroke={gold} strokeWidth="1.9" />
          )}
          {/* Tall steel-rimmed kite shield */}
          <path d="M7.6 15.8 H15.4 V22.8 L11.5 29 L7.6 22.8 Z" fill={primary} stroke={steelHi} strokeWidth="1.15" />
          <path d="M11.5 15.8 H15.4 V22.8 L11.5 29 Z" fill={darkTrim} opacity="0.35" stroke="none" />
          <path d="M11.5 17.5 V26.8" stroke={accent} strokeWidth="1.15" />
        </g>
      );

    case 'vanguard_spearman':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Gilded greaves */}
          <path d="M13.4 25.5 H16.8 L16.2 32 H12.6 Z" fill={steel} />
          <path d="M19.2 25.5 H22.6 L23.6 32 H19.8 Z" fill={steelDark} />
          {/* Upright golden-headed ceremonial pike */}
          <path d="M25.8 32.5 V3.5" stroke={wood} strokeWidth="2" />
          <polygon points="25.8,0.8 23.4,7.8 25.8,6.8 28.2,7.8" fill={gold} />
          <path d="M25.8 2 V6.2" stroke="#FEF9C3" strokeWidth="0.8" />
          {/* Ivory phalanx tunic & gold trim */}
          <path d="M12.2 15.6 H23.2 L24.2 27 H11.2 Z" fill={primary} />
          <path d="M12 24.8 H23.5" stroke={gold} strokeWidth="1.4" />
          {/* Radiating sunburst crest helm */}
          <path d="M13 9.2 C13.8 4.2 21.8 4.2 22.6 9.2 Z" fill={gold} />
          <path d="M14.2 14 V9.5 A3.6 3.6 0 0 1 21.4 9.5 V14 Z" fill={steel} />
          <path d="M15.2 11.2 H20.4 M17.8 11.2 V13.6" stroke={ink} strokeWidth="1.35" />
          {/* Radiant hoplite shield */}
          <circle cx="12.2" cy="22" r="6" fill={primary} stroke={gold} strokeWidth="1.6" />
          <circle cx="12.2" cy="22" r="2.4" fill={gold} stroke={goldDark} strokeWidth="0.8" />
          <circle cx="11.5" cy="21.2" r="0.8" fill="#FEF9C3" stroke="none" />
        </g>
      );

    case 'oathsworn_halberdier':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Heavy fortress greaves */}
          <path d="M13 25.5 H17 L16.5 32.2 H12.4 Z" fill={steel} />
          <path d="M19 25.5 H23 L23.8 32.2 H19.5 Z" fill={steelDark} />
          {/* Towering steel halberd */}
          <path d="M26.5 32.5 V3.8" stroke={wood} strokeWidth="2.1" />
          <polygon points="26.5,1 24.7,6.4 28.3,6.4" fill={steelHi} />
          <path d="M26.5 6.4 C32.6 6.8 33.2 13.5 26.5 14.6 Z" fill={steel} />
          <path d="M30.8 8 C31.8 9.8 31.6 12.2 29.8 13.4" fill="none" stroke={steelHi} strokeWidth="0.85" />
          <path d="M26.5 9.2 L23.5 10.6 L26.5 12 Z" fill={steelDark} />
          {/* Heavy steel cuirass & House surcoat */}
          <path d="M11.2 15 H24 L25 27 H10.2 Z" fill={primary} />
          <path d="M11.5 15 H23.6 V20.5 H11.5 Z" fill={steel} />
          <path d="M17.8 15 H23.6 V20.5 H17.8 Z" fill={steelDark} opacity="0.45" stroke="none" />
          {/* Great helm with visor cross & crown rim */}
          <rect x="13.8" y="6.8" width="8" height="7.6" rx="2" fill={steel} />
          <path d="M14.8 10.2 H20.8 M17.8 8.4 V13.2" stroke={ink} strokeWidth="1.4" />
          <path d="M14.8 8 H18.5" stroke={steelHi} strokeWidth="0.85" />
          {/* Reinforced tower shield */}
          <rect x="7" y="15.5" width="8.5" height="13.6" rx="1.6" fill={primary} stroke={steelHi} strokeWidth="1.25" />
          <path d="M11.2 15.5 H15.5 V29.1 H11.2 Z" fill={darkTrim} opacity="0.32" stroke="none" />
          <path d="M8.8 22.3 H13.6 M11.2 17.8 V26.8" stroke={accent} strokeWidth="1.35" />
        </g>
      );

    case 'archer':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Braced ranger boots */}
          <path d="M11.5 25.5 H14.8 L13.5 32 H10.2 Z" fill="#475569" />
          <path d="M17.2 25.5 H20.4 L22.2 32 H18.8 Z" fill="#334155" />
          {/* Arrow quiver on back */}
          <path d="M8.5 12.2 L12.2 21.5" stroke={leather} strokeWidth="3.2" />
          <path d="M7.6 10.6 L9.8 12 M9.6 9.8 L11.4 11.4" stroke="#FEF08A" strokeWidth="1.2" />
          {/* Shaded ranger tunic & shoulder cape */}
          <path d="M11 15.2 L16.2 13.8 L21.2 16 L21.8 26.6 H10.6 Z" fill={primary} />
          <path d="M16.5 14 L21.2 16 L21.8 26.6 H16.5 Z" fill={darkTrim} opacity="0.38" stroke="none" />
          <rect x="10.8" y="21.2" width="10.8" height="1.9" fill={leather} />
          {/* Hooded ranger head */}
          <circle cx="16" cy="11.2" r="3.3" fill={skin} />
          <path d="M11.6 12 C12 6.6 19.4 6.6 20 11.6 L15.5 9.6 Z" fill={primary} />
          <path d="M13 8.2 Q15.5 7 18 8.2" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.65" />
          {/* Taut recurve bow & nocked arrow */}
          <path d="M22.8 7 Q31.2 17 22.8 27.5" fill="none" stroke={wood} strokeWidth="2.3" />
          <path d="M22.8 7 L18.8 17.2 L22.8 27.5" fill="none" stroke={steelHi} strokeWidth="0.85" />
          <path d="M17.5 17.2 H31.5" stroke="#FDE68A" strokeWidth="1.5" />
          <polygon points="33.5,17.2 29.4,15.4 29.4,19" fill={steelHi} />
        </g>
      );

    case 'longbowman':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Ranger boots */}
          <path d="M11.2 25.5 H14.5 L13 32.2 H9.8 Z" fill="#334155" />
          <path d="M16.8 25.5 H20 L21.8 32.2 H18.4 Z" fill="#1E293B" />
          {/* Woodland hooded mantle */}
          <path d="M9.2 15.2 L15.5 13.4 L21 15.8 L21.8 27 H9.2 Z" fill={primary} />
          <path d="M9.2 15.2 L15.5 13.4 L18.5 17.8 L9.8 20.5 Z" fill={darkTrim} />
          <path d="M10.5 22.2 H21" stroke={leather} strokeWidth="1.6" />
          {/* Deep ranger hood */}
          <circle cx="15.5" cy="11" r="3.2" fill={skin} />
          <path d="M11 12.2 C11.2 6.2 19.2 6.2 19.8 11.4 L15.4 9.2 Z" fill={darkTrim} />
          {/* Towering yew warbow */}
          <path d="M23.2 3.2 Q32.2 17 23.2 31.2" fill="none" stroke="#B45309" strokeWidth="2.4" />
          <path d="M23.2 3.2 L18.6 17 L23.2 31.2" fill="none" stroke={steelHi} strokeWidth="0.9" />
          <path d="M17.4 17 H32.2" stroke="#FEF08A" strokeWidth="1.55" />
          <polygon points="34.2,17 30,15.2 30,18.8" fill={steelHi} />
        </g>
      );

    case 'crossbowman':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Armored boots */}
          <path d="M11.5 25.8 H15 L14.5 32.2 H11 Z" fill={steelDark} />
          <path d="M17.5 25.8 H21 L21.6 32.2 H18 Z" fill="#334155" />
          {/* Padded surcoat & steel breastplate */}
          <path d="M10.4 15.5 H21.6 L22.4 26.8 H9.8 Z" fill={primary} />
          <path d="M16 15.5 H21.6 L22.4 26.8 H16 Z" fill={darkTrim} opacity="0.4" stroke="none" />
          {/* Steel sallet helm */}
          <circle cx="16" cy="11.5" r="3.2" fill={skin} />
          <path d="M11 11 C11.4 6.6 20.6 6.6 21.4 11.4 L19.8 12.4 H11.6 Z" fill={steel} />
          <path d="M13.6 8.6 Q16.2 7.5 18.8 8.6" fill="none" stroke={steelHi} strokeWidth="0.85" />
          {/* Heavy steel windlass arbalest */}
          <rect x="14.5" y="17.2" width="16.5" height="2.8" rx="0.8" fill={wood} />
          <path d="M25.5 10.6 Q31.2 18.5 25.5 26.4" fill="none" stroke={steel} strokeWidth="2.4" />
          <path d="M25.5 10.6 L18.5 18.6 L25.5 26.4" fill="none" stroke={steelHi} strokeWidth="0.9" />
          <polygon points="34,18.6 30,16.8 30,20.4" fill={gold} />
        </g>
      );

    case 'knight':
    case 'gilded_lancer':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Flowing horse tail */}
          <path d="M8.5 21.5 C5 22 4 25.5 5.8 28.5 C7.5 27 8.5 25 9 23 Z" fill="#29150A" />
          {/* Sculpted warhorse legs & hooves */}
          <path d="M9.6 25.5 H12.4 L10.2 32.5 H7.8 Z" fill="#451A03" />
          <path d="M13.5 26 H16 L15.2 32.5 H12.8 Z" fill="#29150A" />
          <path d="M20.8 26 H23.4 L24.6 32.5 H22 Z" fill="#451A03" />
          <path d="M24.2 25 H26.8 L29.6 31.8 H27 Z" fill="#29150A" />
          {/* Warhorse draped in scalloped House caparison barding */}
          <path d="M8 20.5 Q17.5 18 27 20 L28 26.8 L24.5 25.8 L21.5 26.8 L18 25.8 L14.5 26.8 L11 25.8 L7.5 26.8 Z" fill={primary} />
          <path d="M8.2 25.4 H27.2" stroke={gold} strokeWidth="1.2" />
          {/* Muscular horse neck, arched mane & steel chamfron */}
          <path d="M23 20.5 L26.5 11.8 L32.2 14.8 L30.2 18.8 L26 18 Z" fill="#78350F" />
          <path d="M26.2 11.8 L32.2 14.8 L30.5 16.5 L25.8 14.2 Z" fill={steel} />
          <path d="M27.2 12.8 L31 14.6" stroke={steelHi} strokeWidth="0.75" />
          {/* Armored Mounted Knight */}
          <path d="M13.6 14 H21.4 L22.2 21.5 H13 Z" fill={steel} />
          <path d="M15.2 14 H20 V21.5 H15.2 Z" fill={primary} />
          <path d="M14.4 13.2 V8.8 A3.2 3.2 0 0 1 20.8 8.8 V13.2 Z" fill={steel} />
          <path d="M15.5 10.4 H19.8" stroke={ink} strokeWidth="1.35" />
          <path d="M15.5 7.4 Q17.6 6.4 19.4 7.4" fill="none" stroke={steelHi} strokeWidth="0.8" />
          {/* Sweeping knightly helmet plume */}
          <path d="M16 7 C11.5 4.2 8.2 6.8 7.5 10.6 C10.8 10 13.8 9.2 16 8.8 Z" fill={unitId === 'gilded_lancer' ? gold : primary} />
          {/* Couched Pennanted Jousting Lance OR Raised Broadsword */}
          {unitId === 'gilded_lancer' ? (
            <g>
              <path d="M9.5 18.8 L35 8.8" stroke={gold} strokeWidth="2.1" />
              <polygon points="27.2,11.8 32.5,14.2 26,15.5" fill={primary} stroke={gold} strokeWidth="0.85" />
            </g>
          ) : (
            <g>
              <polygon points="20.4,16.8 25.8,4.6 27.4,5.4 22,17.4" fill={steelHi} />
              <path d="M19.5 13.6 L23.5 15.2" stroke={gold} strokeWidth="1.9" />
            </g>
          )}
        </g>
      );

    case 'dusk_outrider':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Flowing shadow tail */}
          <path d="M8.2 21.8 C4.6 22.2 3.8 25.2 5.4 28 C7.2 26.8 8.2 24.8 8.8 23 Z" fill="#0F172A" />
          {/* Swift dark warhorse legs */}
          <path d="M9.2 25.8 H11.8 L8.5 32.2 H6.4 Z" fill="#1E293B" />
          <path d="M13.5 26.2 H15.8 L14.6 32.4 H12.4 Z" fill="#0F172A" />
          <path d="M21 26.2 H23.5 L25.2 32.2 H22.8 Z" fill="#1E293B" />
          <path d="M24.5 25.2 H27 L30.6 31.2 H28.2 Z" fill="#0F172A" />
          {/* Lean raven-dark steed */}
          <path d="M8 21.2 Q17.5 18.6 26.8 20.6 L27.4 26.4 H8 Z" fill="#334155" />
          <path d="M23.2 20.6 L27.5 12.2 L32.6 15.2 L30.4 18.6 L26 18 Z" fill="#1E293B" />
          {/* Billowing crimson/House raider cloak */}
          <path d="M16 13.8 L5.5 18.6 L9 23.4 L19.2 21 Z" fill={primary} />
          <path d="M15 14.5 L8.5 20.5 L12.5 22 Z" fill={darkTrim} opacity="0.45" stroke="none" />
          {/* Hooded raider torso & cowl */}
          <path d="M14.2 13.8 H20.8 L21.4 21.5 H13.8 Z" fill={primary} />
          <path d="M14.2 13.2 C14.2 7.4 20.8 7.4 21.2 13.2 L17.6 14 Z" fill={darkTrim} />
          {/* Twin gleaming curved sabers */}
          <path d="M20 16.5 Q26.2 11.2 29.2 5.6" fill="none" stroke={steelHi} strokeWidth="2.1" />
          <path d="M13.8 17 Q8.8 11.8 6.8 6.8" fill="none" stroke={steel} strokeWidth="1.9" />
        </g>
      );

    case 'sapper_crew':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Assault siege ladder leaning behind */}
          <path d="M7.5 31.5 L14.2 6.5 M13.2 31.5 L19.8 6.5" stroke={wood} strokeWidth="1.9" />
          <path d="M9 26.2 H14.8 M10.5 21 H16.3 M12 15.8 H17.8 M13.6 10.6 H19.2" stroke="#D97706" strokeWidth="1.35" />
          {/* Braced engineer boots */}
          <path d="M17.2 25.8 H20.4 L20 32.2 H16.6 Z" fill="#334155" />
          <path d="M22.2 25.8 H25.4 L26 32.2 H22.6 Z" fill="#1E293B" />
          {/* House engineer tunic & leather apron */}
          <path d="M16 15.8 H26 L26.8 26.8 H15.2 Z" fill={primary} />
          <path d="M18.2 19.5 H24 V26.8 H18.2 Z" fill={leather} />
          {/* Iron-capped engineer helm */}
          <circle cx="21" cy="11.6" r="3.2" fill={skin} />
          <path d="M16.6 11.2 Q21 6.4 25.4 11.2 Z" fill={steelDark} />
          <path d="M18.5 8.8 Q21 7.6 23.2 8.8" fill="none" stroke={steel} strokeWidth="0.85" />
          {/* Heavy demolition mattock */}
          <path d="M24 22.8 L31.6 10.8" stroke={wood} strokeWidth="2.1" />
          <path d="M27.2 8.8 Q32.2 9.4 33.8 14.5" fill="none" stroke={steelHi} strokeWidth="2.5" />
        </g>
      );

    case 'siege_ram':
      return (
        <g stroke={ink} strokeWidth="0.95" strokeLinejoin="round" strokeLinecap="round">
          {/* Streaming House pennant atop roof */}
          <path d="M18 2.8 V10.5" stroke={wood} strokeWidth="1.6" />
          <polygon points="18,3 28.5,5.8 18,8.6" fill={primary} stroke={darkTrim} strokeWidth="0.9" />
          {/* Reinforced iron-banded timber A-frame roof */}
          <polygon points="5.2,20.5 18,9.5 30.8,20.5" fill="#92400E" />
          <polygon points="18,9.5 30.8,20.5 20.5,20.5" fill="#78350F" />
          <path d="M10.5 16 L18 9.5 L25.5 16" fill="none" stroke={steelDark} strokeWidth="1.5" />
          <rect x="7.2" y="20.5" width="21.6" height="7.5" rx="1" fill="#B45309" />
          <rect x="7.2" y="20.5" width="21.6" height="2.4" fill={primary} />
          {/* Heavy hanging iron-capped battering ram beam */}
          <rect x="3.5" y="22.5" width="26" height="4" rx="1" fill="#451A03" />
          <polygon points="29.5,21.6 34.8,24.5 29.5,27.4" fill={steel} />
          <path d="M30.2 22.8 L33.5 24.5" stroke={steelHi} strokeWidth="0.9" />
          {/* Heavy iron-rimmed spoked wheels */}
          <circle cx="11.5" cy="29.8" r="3.8" fill="#78350F" stroke={steelDark} strokeWidth="1.35" />
          <circle cx="11.5" cy="29.8" r="1.2" fill={steelHi} stroke={ink} strokeWidth="0.6" />
          <circle cx="24.5" cy="29.8" r="3.8" fill="#78350F" stroke={steelDark} strokeWidth="1.35" />
          <circle cx="24.5" cy="29.8" r="1.2" fill={steelHi} stroke={ink} strokeWidth="0.6" />
        </g>
      );
  }
}

/**
 * 24x24 standardized unit class & signature silhouettes (kept for compact badges).
 */
export function UnitSilhouetteSvg({
  unitId,
  color,
}: {
  readonly unitId: UnitId;
  readonly color: string;
}) {
  switch (unitId) {
    case 'militia':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9.5" cy="13.5" r="4.4" fill={color} fillOpacity="0.22" />
          <circle cx="9.5" cy="13.5" r="1.2" fill={color} />
          <path d="M14.5 18 L18.5 6.8" />
          <path d="M16 7.2 C18.5 7 20 8.5 19 10.6 L16.7 9.5 Z" fill={color} />
        </g>
      );
    case 'men_at_arms':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 6.5 H14.5 V12.5 C14.5 15.4 12.7 17.4 10.8 18.8 C8.9 17.4 7 15.4 7 12.5 Z" fill={color} fillOpacity="0.24" />
          <path d="M6.5 18 L18.8 5.2 M14.8 5.2 H18.8 V9.2 M7.2 14.5 L9.5 16.8" />
        </g>
      );
    case 'spearman':
    case 'free_company_spearman':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.8 19 L18.2 5" />
          <polygon points="18.8,4.2 14.8,6.1 17.1,8.3" fill={color} />
          <path d="M7.5 10 H13.2 V15.5 L10.35 18.8 L7.5 15.5 Z" fill={color} fillOpacity="0.28" />
        </g>
      );
    case 'vanguard_spearman':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10.2" cy="13.5" r="5" fill={color} fillOpacity="0.22" />
          <circle cx="10.2" cy="13.5" r="1.5" fill={color} />
          <path d="M16.5 19.2 V4.8" />
          <polygon points="16.5,3.8 14.4,7.6 18.6,7.6" fill={color} />
        </g>
      );
    case 'archer':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 5.5 Q15.5 12 8 18.5" />
          <path d="M8 5.5 L8 18.5" strokeWidth="1.05" />
          <path d="M7 12 L18.2 7.2" />
          <polygon points="19.2,6.8 15.6,6.6 17,9.3" fill={color} />
        </g>
      );
    case 'longbowman':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.8 3.8 Q15.8 12 8.8 20.2" />
          <path d="M8.8 3.8 V20.2" strokeWidth="1" />
          <path d="M6 10 L18.8 7.2 M6 14.2 L18.8 11.4" />
          <polygon points="19.4,7 16.8,6.5 17.5,8.6" fill={color} />
        </g>
      );
    case 'crossbowman':
      return (
        <g fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 H19" />
          <path d="M14 6.5 Q18.2 12.5 14 18.5" />
          <path d="M14 6.5 L8.8 12.5 L14 18.5" strokeWidth="1.1" />
          <polygon points="19.5,12.5 16.8,11.2 16.8,13.8" fill={color} />
        </g>
      );
    case 'knight':
    case 'gilded_lancer':
      return (
        <g fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.8 18.2 V12 L10.3 8 L14.8 6.8 L17.6 10 L14.9 12.5 L15.5 18.2 Z" fill={color} fillOpacity="0.28" />
          <path d="M10.5 7.8 C10.5 5.5 13 5 14.2 6.5" strokeWidth="1.4" />
          {unitId === 'gilded_lancer' && <path d="M4.8 16.5 L20 5.5 M16 5.5 L19.8 5.5 L18 8.8" />}
        </g>
      );
    case 'dusk_outrider':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.5 17.5 Q12 11 18.5 5.5 M18.5 17.5 Q12 11 5.5 5.5" />
          <circle cx="12" cy="8.2" r="2.3" fill={color} />
        </g>
      );
    case 'oathsworn_halberdier':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="8.8" width="7.2" height="10.2" rx="1.2" fill={color} fillOpacity="0.28" />
          <path d="M16.5 19.2 V4.8" />
          <path d="M16.5 6.8 C19.8 6.8 20.2 11 16.5 12 Z" fill={color} />
        </g>
      );
    case 'sapper_crew':
      return (
        <g fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.8 18.2 L18.2 5.8 M13 5.8 Q18.2 5.8 18.2 11" />
          <path d="M7.5 6.8 V18.2 M11.8 6.8 V18.2 M7.5 10 H11.8 M7.5 14 H11.8" strokeWidth="1.3" />
        </g>
      );
    case 'siege_ram':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13 L12 5.8 L19 13" fill={color} fillOpacity="0.2" />
          <path d="M4.2 14 H19.8" strokeWidth="2.8" />
          <circle cx="8" cy="17.8" r="2" />
          <circle cx="16" cy="17.8" r="2" />
        </g>
      );
  }
}

/**
 * Grounded miniature architectural illustrations (24x24 viewBox) for Improvements.
 */
export function ImprovementGlyphSvg({ id }: { readonly id: ImprovementId }) {
  switch (id) {
    case 'farm':
      return (
        <g>
          {/* Plowed golden field base */}
          <ellipse cx="12" cy="18.5" rx="10" ry="3.8" fill="#A16207" fillOpacity="0.55" />
          <path d="M4 18 Q12 15.5 20 18" stroke="#CA8A04" strokeWidth="1.4" fill="none" />
          <path d="M5 15.5 Q12 13.5 19 15.5" stroke="#EAB308" strokeWidth="1.3" fill="none" />
          {/* Golden wheat sheaves */}
          <g stroke="#FACC15" strokeWidth="1.5" strokeLinecap="round" fill="none">
            <path d="M8 16.5 L7 8 M12 16.5 V6.5 M16 16.5 L17 8" />
            <path d="M6 12 H18" stroke="#92400E" strokeWidth="1.4" />
          </g>
          <circle cx="12" cy="6" r="1.4" fill="#FEF08A" />
          <circle cx="7" cy="7.6" r="1.2" fill="#FEF08A" />
          <circle cx="17" cy="7.6" r="1.2" fill="#FEF08A" />
        </g>
      );
    case 'lumber_mill':
      return (
        <g>
          <ellipse cx="12" cy="19" rx="9.5" ry="3.2" fill="#1C1917" fillOpacity="0.35" />
          {/* Timber mill shed */}
          <rect x="4.5" y="10.5" width="10" height="8" rx="1" fill="#92400E" stroke="#451A03" strokeWidth="1.1" />
          <polygon points="3.5,11 9.5,5.5 15.5,11" fill="#B45309" stroke="#451A03" strokeWidth="1.1" />
          {/* Circular saw / stacked logs */}
          <circle cx="16.8" cy="14.8" r="4.2" fill="#E2E8F0" stroke="#334155" strokeWidth="1.2" />
          <circle cx="16.8" cy="14.8" r="1.4" fill="#475569" />
          <circle cx="7.5" cy="17.2" r="1.6" fill="#D97706" stroke="#451A03" strokeWidth="0.8" />
          <circle cx="10.5" cy="17.2" r="1.6" fill="#D97706" stroke="#451A03" strokeWidth="0.8" />
        </g>
      );
    case 'iron_mine':
      return (
        <g>
          <ellipse cx="12" cy="19" rx="9.5" ry="3" fill="#0F172A" fillOpacity="0.4" />
          {/* Stone hillside arch */}
          <path d="M4 18.5 V10.5 A8 8 0 0 1 20 10.5 V18.5 Z" fill="#475569" stroke="#1E293B" strokeWidth="1.2" />
          <path d="M7.5 18.5 V12.5 A4.5 4.5 0 0 1 16.5 12.5 V18.5 Z" fill="#0F172A" />
          {/* Timber beam frame & crossed pickaxe glint */}
          <path d="M7.5 18.5 V11 H16.5 V18.5" stroke="#92400E" strokeWidth="1.6" fill="none" />
          <polygon points="12,13.5 14,15 12,16.5 10,15" fill="#38BDF8" />
        </g>
      );
    case 'smithy':
      return (
        <g>
          <ellipse cx="12" cy="19.2" rx="9.5" ry="3" fill="#0F172A" fillOpacity="0.4" />
          {/* Stone forge chimney */}
          <path d="M5 18.5 V9.5 H13 V18.5 Z" fill="#475569" stroke="#1E293B" strokeWidth="1.2" />
          <rect x="6.5" y="4.5" width="4" height="5.5" fill="#64748B" stroke="#1E293B" strokeWidth="1" />
          {/* Glowing hearth */}
          <path d="M7 18.5 V13.5 A2 2 0 0 1 11 13.5 V18.5 Z" fill="#F97316" />
          <circle cx="9" cy="15.2" r="1.4" fill="#FEF08A" />
          {/* Anvil */}
          <path d="M14 14.5 H20.5 L19 16.8 H18 V18.5 H15 V16.8 Z" fill="#1E293B" stroke="#CBD5E1" strokeWidth="0.9" />
        </g>
      );
    case 'market':
      return (
        <g>
          <ellipse cx="12" cy="19.2" rx="9.5" ry="3" fill="#1C1917" fillOpacity="0.35" />
          {/* Wooden stall base */}
          <rect x="5" y="11.5" width="14" height="7" rx="1" fill="#FEF3C7" stroke="#78350F" strokeWidth="1.1" />
          {/* Striped merchant awning */}
          <path d="M3 12 L5.2 6 H18.8 L21 12 Z" fill="#DC2626" stroke="#7F1D1D" strokeWidth="1.1" />
          <path d="M8 6 L7.3 12 M12 6 V12 M16 6 L16.7 12" stroke="#FEF3C7" strokeWidth="1.8" />
          {/* Gold coin emblem */}
          <circle cx="12" cy="15.2" r="2.1" fill="#EAB308" stroke="#92400E" strokeWidth="0.9" />
        </g>
      );
    case 'granary':
      return (
        <g>
          <ellipse cx="12" cy="19.2" rx="9" ry="3" fill="#1C1917" fillOpacity="0.35" />
          {/* Domed stone silo */}
          <path d="M5.5 18.5 V10.5 A6.5 6.5 0 0 1 18.5 10.5 V18.5 Z" fill="#E7E5E4" stroke="#44403C" strokeWidth="1.2" />
          <path d="M5.5 11.5 H18.5" stroke="#A8A29E" strokeWidth="1.1" />
          <path d="M9.8 18.5 V14 A2.2 2.2 0 0 1 14.2 14 V18.5 Z" fill="#57534E" />
          <circle cx="12" cy="7.8" r="1.4" fill="#16A34A" />
        </g>
      );
    case 'palisade':
      return (
        <g>
          <ellipse cx="12" cy="19" rx="10" ry="2.8" fill="#1C1917" fillOpacity="0.35" />
          <g stroke="#451A03" strokeWidth="0.9" fill="#92400E">
            <polygon points="3.5,18.5 3.5,7 5.5,4.5 7.5,7 7.5,18.5" />
            <polygon points="8,18.5 8,6 10,3.5 12,6 12,18.5" />
            <polygon points="12.5,18.5 12.5,6 14.5,3.5 16.5,6 16.5,18.5" />
            <polygon points="17,18.5 17,7 19,4.5 21,7 21,18.5" />
          </g>
          <rect x="3" y="11" width="18.5" height="2.4" rx="0.8" fill="#B45309" stroke="#451A03" strokeWidth="0.8" />
        </g>
      );
    case 'watchtower':
      return (
        <g>
          <ellipse cx="12" cy="19.5" rx="7.5" ry="2.5" fill="#0F172A" fillOpacity="0.4" />
          <path d="M8 19 L9 7.5 H15 L16 19 Z" fill="#94A3B8" stroke="#1E293B" strokeWidth="1.2" />
          <rect x="7" y="6" width="10" height="3" rx="0.6" fill="#CBD5E1" stroke="#1E293B" strokeWidth="1" />
          {/* Brazier flame */}
          <path d="M12 2.2 C14.5 4.2 14.5 6.2 12 6.5 C9.5 6.2 9.5 4.2 12 2.2 Z" fill="#F97316" />
          <circle cx="12" cy="4.8" r="1.2" fill="#FEF08A" />
        </g>
      );
    case 'foresters_lodge':
      return (
        <g>
          <polygon points="3,18.5 6.5,8.5 10,18.5" fill="#0F766E" stroke="#134E4A" strokeWidth="0.9" />
          <polygon points="14,18.5 17.5,8.5 21,18.5" fill="#115E59" stroke="#134E4A" strokeWidth="0.9" />
          <polygon points="6.5,18.5 12,9.5 17.5,18.5" fill="#92400E" stroke="#451A03" strokeWidth="1.1" />
          <rect x="10.5" y="14" width="3" height="4.5" fill="#FEF08A" />
        </g>
      );
    case 'deep_smeltery':
      return (
        <g>
          <path d="M5.5 19 L8 5.5 H16 L18.5 19 Z" fill="#1E3A8A" stroke="#0F172A" strokeWidth="1.2" />
          <path d="M9.5 19 V13.5 A2.5 2.5 0 0 1 14.5 13.5 V19 Z" fill="#F97316" />
          <circle cx="12" cy="15.5" r="1.5" fill="#FEF08A" />
          <circle cx="12" cy="3.5" r="2.2" fill="#FB923C" />
        </g>
      );
    case 'river_tollhouse':
      return (
        <g>
          <path d="M2.5 17.5 Q12 10 21.5 17.5" stroke="#B45309" strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <path d="M2.5 17.5 Q12 10 21.5 17.5" stroke="#FEF3C7" strokeWidth="1" fill="none" strokeDasharray="2 2" />
          <rect x="8" y="6" width="8" height="7" rx="1" fill="#D97706" stroke="#78350F" strokeWidth="1.1" />
          <polygon points="7,6.5 12,3 17,6.5" fill="#92400E" />
          <circle cx="12" cy="9.5" r="1.6" fill="#FEF08A" />
        </g>
      );
    case 'war_camp':
      return (
        <g>
          <ellipse cx="12" cy="19.2" rx="9.5" ry="2.8" fill="#1C1917" fillOpacity="0.4" />
          <path d="M4.5 18.5 V5 M19.5 18.5 V5" stroke="#FEE2E2" strokeWidth="1.4" strokeLinecap="round" />
          <polygon points="4.5,5 8,6.5 4.5,8" fill="#EF4444" />
          <polygon points="19.5,5 16,6.5 19.5,8" fill="#EF4444" />
          <polygon points="5.5,18.5 12,6.5 18.5,18.5" fill="#B91C1C" stroke="#7F1D1D" strokeWidth="1.2" />
          <polygon points="10.2,18.5 12,13 13.8,18.5" fill="#1C1917" />
        </g>
      );
    case 'signal_bastion':
      return (
        <g>
          <ellipse cx="12" cy="19.5" rx="7.5" ry="2.5" fill="#0F172A" fillOpacity="0.35" />
          <polygon points="8.5,19 10,6.5 14,6.5 15.5,19" fill="#F8FAFC" stroke="#334155" strokeWidth="1.1" />
          <circle cx="12" cy="5.2" r="3.2" fill="#FACC15" stroke="#CA8A04" strokeWidth="1" />
          <circle cx="12" cy="5.2" r="1.4" fill="#FFFBEB" />
        </g>
      );
  }
}

/**
 * Grounded miniature architectural illustrations (24x24 viewBox) for Neutral Landmarks.
 */
export function LandmarkGlyphSvg({ landmark }: { readonly landmark: LandmarkType }) {
  switch (landmark) {
    case 'frontier_village':
      return (
        <g>
          <ellipse cx="12" cy="19.5" rx="10" ry="3" fill="#1C1917" fillOpacity="0.32" />
          {/* Left cottage */}
          <rect x="3.5" y="12.5" width="7" height="6" fill="#FAF7F0" stroke="#78350F" strokeWidth="1" />
          <polygon points="2.5,13 7,8.5 11.5,13" fill="#B45309" stroke="#78350F" strokeWidth="0.9" />
          <rect x="6" y="15.2" width="2" height="3.3" fill="#78350F" />
          {/* Right cottage */}
          <rect x="11.5" y="11" width="8.5" height="7.5" fill="#F5F5F4" stroke="#78350F" strokeWidth="1" />
          <polygon points="10.5,11.5 15.75,6.8 21,11.5" fill="#92400E" stroke="#78350F" strokeWidth="0.9" />
          <rect x="14.5" y="14.5" width="2.4" height="4" fill="#78350F" />
          <rect x="17.6" y="13.2" width="1.5" height="1.5" fill="#FDE047" />
        </g>
      );
    case 'ancient_watchtower':
      return (
        <g>
          <ellipse cx="12" cy="19.8" rx="8" ry="2.6" fill="#0F172A" fillOpacity="0.4" />
          <path d="M7.5 19.2 L8.8 5.5 H15.2 L16.5 19.2 Z" fill="#94A3B8" stroke="#334155" strokeWidth="1.2" />
          <path d="M6.8 5.5 H17.2 M7.5 5.5 V3.8 M10.5 5.5 V3.8 M13.5 5.5 V3.8 M16.5 5.5 V3.8" stroke="#334155" strokeWidth="1.3" />
          {/* Moss & beacon glow */}
          <path d="M8.8 14 Q11 12.5 12.5 15" stroke="#15803D" strokeWidth="1.4" fill="none" />
          <circle cx="12" cy="9.2" r="1.8" fill="#38BDF8" />
        </g>
      );
    case 'relic_ruin':
      return (
        <g>
          <ellipse cx="12" cy="19.5" rx="9.5" ry="2.8" fill="#0F172A" fillOpacity="0.35" />
          {/* Classical stone archway */}
          <path d="M5 18.5 V10 A7 7 0 0 1 19 10 V18.5" stroke="#E2E8F0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M5 18.5 V10 A7 7 0 0 1 19 10 V18.5" stroke="#64748B" strokeWidth="0.9" fill="none" />
          {/* Mystical relic ember */}
          <polygon points="12,10.5 14,13.5 12,16.5 10,13.5" fill="#38BDF8" stroke="#E0F2FE" strokeWidth="0.8" />
          <path d="M3 18.8 H21" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      );
    case 'outlaw_camp':
      return (
        <g>
          <ellipse cx="12" cy="19.5" rx="9.5" ry="2.8" fill="#0F172A" fillOpacity="0.45" />
          {/* Tattered bandit tent */}
          <polygon points="3.5,18.8 12,6 20.5,18.8" fill="#18181B" stroke="#EF4444" strokeWidth="1.4" strokeLinejoin="round" />
          <polygon points="9.5,18.8 12,13.2 14.5,18.8" fill="#7F1D1D" />
          {/* Crossed crimson blades */}
          <path d="M8.5 12.2 L15.5 8.2 M15.5 12.2 L8.5 8.2" stroke="#FCA5A5" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
    case 'none':
      return null;
  }
}

export function SeasonIconSvg({ season, size = 16 }: { readonly season: Season; readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      {season === 'spring' && (
        <path d="M8 14 V6 M8 9 C5 9 4 6 6 4 C8 5 8 7 8 9 M8 8 C11 8 12 5 10 3 C8 4 8 6 8 8" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      )}
      {season === 'summer' && (
        <>
          <circle cx="8" cy="8" r="3.2" fill="#EAB308" />
          <path d="M8 1.5 V3.5 M8 12.5 V14.5 M1.5 8 H3.5 M12.5 8 H14.5 M3.4 3.4 L4.8 4.8 M11.2 11.2 L12.6 12.6 M12.6 3.4 L11.2 4.8 M4.8 11.2 L3.4 12.6" stroke="#FACC15" strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}
      {season === 'autumn' && (
        <path d="M8 2 C12 4 13 9 8 13 C3 9 4 4 8 2 Z M8 6 V14" fill="#D97706" stroke="#FEF3C7" strokeWidth="1" />
      )}
      {season === 'winter' && (
        <path d="M8 2 V14 M2 8 H14 M3.8 3.8 L12.2 12.2 M12.2 3.8 L3.8 12.2" stroke="#38BDF8" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}
