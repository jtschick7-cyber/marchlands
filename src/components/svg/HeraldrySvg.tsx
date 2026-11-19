/**
 * Marchlands (Spec v0.3) — Inline SVG Heraldry, Unit Silhouettes & Tile Glyphs
 *
 * Exact colorblind-safe hex palette and 24x24 / 20x20 blueprints from docs/DESIGN_TOKENS.md.
 * Zero external raster images.
 */

import type { HouseId, ImprovementId, LandmarkType, Season, UnitId } from '../../types/game.ts';
import { HOUSES } from '../../data/index.ts';

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
      className="shrink-0"
    >
      {houseId === 'vane' && (
        <>
          <path
            d="M4 3 H20 V12 C20 17 16 20 12 22 C8 20 4 17 4 12 Z"
            fill={c.primary}
            stroke={c.darkStroke}
            strokeWidth="1.5"
          />
          <path
            d="M12 17 V11 M12 12 L8 8 M12 12 L16 8 M9.5 9.5 L7 10 M14.5 9.5 L17 10 M12 11 L12 6.5"
            stroke={c.badgeText}
            strokeWidth="1.6"
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
            rx="2"
            fill={c.primary}
            stroke={c.darkStroke}
            strokeWidth="1.5"
          />
          <path
            d="M6.5 11 H17.5 L15.5 14 H14 V16.5 H16 V18 H8 V16.5 H10 V14 H8.5 Z M11 6.5 H13 V10 H11 Z M9.5 6.5 H14.5 V8 H9.5 Z"
            fill={c.badgeText}
          />
        </>
      )}
      {houseId === 'aurelia' && (
        <>
          <circle cx="12" cy="12" r="9.5" fill={c.primary} stroke={c.darkStroke} strokeWidth="1.5" />
          <path d="M7 13 L8.5 8 L11 11 L12 7.5 L13 11 L15.5 8 L17 13 Z" fill={c.badgeText} />
          <path
            d="M7 15.5 Q9.5 14.2 12 15.5 T17 15.5 M7 17.8 Q9.5 16.5 12 17.8 T17 17.8"
            stroke={c.badgeText}
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
      {houseId === 'corvus' && (
        <>
          <polygon
            points="12,2.5 21.5,12 12,21.5 2.5,12"
            fill={c.primary}
            stroke={c.darkStroke}
            strokeWidth="1.5"
          />
          <path
            d="M12 16 L7 9.5 L10.5 11 L12 7.5 L13.5 11 L17 9.5 Z"
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
            strokeWidth="1.5"
          />
          <circle cx="12" cy="12" r="3.4" fill="#CA8A04" />
          <path
            d="M12 5 V7.5 M12 16.5 V19 M5 12 H7.5 M16.5 12 H19 M7 7 L8.8 8.8 M15.2 15.2 L17 17 M17 7 L15.2 8.8 M8.8 15.2 L7 17"
            stroke="#CA8A04"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/**
 * 24x24 standardized unit class & signature silhouettes rendered inside unit tokens.
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
          <circle cx="9.5" cy="13.5" r="4.5" fill={color} fillOpacity="0.2" />
          <path d="M14.5 18 L18.5 7 M16.5 7 L20 9.5" />
        </g>
      );
    case 'men_at_arms':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 6 H15 V12.5 C15 15.5 13 17.5 11 19 C9 17.5 7 15.5 7 12.5 Z" fill={color} fillOpacity="0.2" />
          <path d="M6 18 L19 5 M15 5 H19 V9" />
        </g>
      );
    case 'spearman':
    case 'free_company_spearman':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 19 L18 5" />
          <polygon points="18.5,4.5 14.8,6.2 16.8,8.2" fill={color} />
          <path d="M8 10 H13 V15.5 L10.5 18.5 L8 15.5 Z" fill={color} fillOpacity="0.25" />
        </g>
      );
    case 'vanguard_spearman':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10.5" cy="13.5" r="5" fill={color} fillOpacity="0.2" />
          <circle cx="10.5" cy="13.5" r="1.4" fill={color} />
          <path d="M16.5 19 V5" />
          <polygon points="16.5,4 14.5,7.5 18.5,7.5" fill={color} />
        </g>
      );
    case 'archer':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6 Q15 12 8 18" />
          <path d="M8 6 L8 18" strokeWidth="1" />
          <path d="M7 12 L18 7.5" />
          <polygon points="19,7 15.5,6.8 16.8,9.4" fill={color} />
        </g>
      );
    case 'longbowman':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 4 Q15.5 12 9 20" />
          <path d="M9 4 V20" strokeWidth="1" />
          <path d="M6 10 L18.5 7.5 M6 14 L18.5 11.5" />
        </g>
      );
    case 'crossbowman':
      return (
        <g fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13 H19" />
          <path d="M14 7 Q18 13 14 19" />
          <path d="M14 7 L9 13 L14 19" strokeWidth="1.1" />
        </g>
      );
    case 'knight':
    case 'gilded_lancer':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 18 V12 L10.5 8 L15 7 L17.5 10 L15 12.5 L15.5 18 Z" fill={color} fillOpacity="0.25" />
          {unitId === 'gilded_lancer' && <path d="M5 16 L20 6 M16 6 L19.5 6 L18 9" />}
        </g>
      );
    case 'dusk_outrider':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 17 Q12 11 18 6 M18 17 Q12 11 6 6" />
          <circle cx="12" cy="8" r="2.2" fill={color} />
        </g>
      );
    case 'oathsworn_halberdier':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6.5" y="9" width="7" height="10" rx="1" fill={color} fillOpacity="0.25" />
          <path d="M16.5 19 V5" />
          <path d="M16.5 7 C19.5 7 20 11 16.5 12 Z" fill={color} />
        </g>
      );
    case 'sapper_crew':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 18 L18 6 M13 6 Q18 6 18 11" />
          <path d="M8 7 V18 M12 7 V18 M8 10 H12 M8 14 H12" strokeWidth="1.3" />
        </g>
      );
    case 'siege_ram':
      return (
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13 L12 6 L19 13" />
          <path d="M4.5 14 H19.5" strokeWidth="2.6" />
          <circle cx="8" cy="17.5" r="2" />
          <circle cx="16" cy="17.5" r="2" />
        </g>
      );
  }
}

/**
 * 20x20 corner glyphs for Improvements & Landmarks (rendered inside tile slot x:4, y:24).
 */
export function ImprovementGlyphSvg({ id }: { readonly id: ImprovementId }) {
  switch (id) {
    case 'farm':
      return (
        <g stroke="#EAB308" strokeWidth="1.7" strokeLinecap="round" fill="none">
          <path d="M10 17 V5 M6 16 L7 7 M14 16 L13 7 M6 15 H14" />
        </g>
      );
    case 'lumber_mill':
      return (
        <g>
          <circle cx="10" cy="10" r="6" fill="#92400E" stroke="#FEF3C7" strokeWidth="1.2" />
          <circle cx="10" cy="10" r="2" fill="#FEF3C7" />
        </g>
      );
    case 'iron_mine':
      return (
        <g>
          <path d="M4 17 V10 A6 6 0 0 1 16 10 V17 Z" fill="#334155" stroke="#94A3B8" strokeWidth="1.3" />
          <path d="M7 14 L13 8 M13 14 L7 8" stroke="#E2E8F0" strokeWidth="1.4" />
        </g>
      );
    case 'smithy':
      return (
        <g>
          <rect x="4" y="11" width="12" height="5" rx="1" fill="#334155" />
          <circle cx="10" cy="7" r="3.5" fill="#EA580C" />
        </g>
      );
    case 'market':
      return (
        <g>
          <path d="M3 10 L5 5 H15 L17 10 Z" fill="#DC2626" stroke="#FEF3C7" strokeWidth="1.2" />
          <rect x="5" y="10" width="10" height="7" fill="#FEF3C7" />
          <path d="M8 5 V10 M12 5 V10" stroke="#FEF3C7" strokeWidth="1.3" />
        </g>
      );
    case 'granary':
      return (
        <g>
          <path d="M5 17 V10 A5 5 0 0 1 15 10 V17 Z" fill="#D6D3D1" stroke="#57534E" strokeWidth="1.3" />
          <rect x="8.5" y="12" width="3" height="5" fill="#57534E" />
        </g>
      );
    case 'palisade':
      return (
        <g stroke="#78350F" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 16 V6 M8 16 V5 M12 16 V5 M16 16 V6" />
          <path d="M3 12 H17" stroke="#A16207" strokeWidth="1.5" />
        </g>
      );
    case 'watchtower':
      return (
        <g>
          <rect x="7" y="7" width="6" height="10" fill="#64748B" stroke="#1E293B" strokeWidth="1.2" />
          <circle cx="10" cy="5" r="2.6" fill="#F97316" />
        </g>
      );
    case 'foresters_lodge':
      return (
        <g>
          <polygon points="5,17 8,10 11,17" fill="#115E59" />
          <polygon points="10,17 14,9 18,17" fill="#0F766E" />
          <polygon points="3,16 6.5,11 10,16" fill="#92400E" />
        </g>
      );
    case 'deep_smeltery':
      return (
        <g>
          <path d="M6 17 L8 6 H12 L14 17 Z" fill="#1E3A8A" stroke="#DBEAFE" strokeWidth="1.1" />
          <circle cx="10" cy="4" r="2" fill="#F97316" />
        </g>
      );
    case 'river_tollhouse':
      return (
        <g>
          <path d="M3 15 Q10 9 17 15" stroke="#92400E" strokeWidth="2.5" fill="none" />
          <rect x="7.5" y="5" width="5" height="6" fill="#D97706" stroke="#FEF3C7" strokeWidth="1" />
        </g>
      );
    case 'war_camp':
      return (
        <g>
          <polygon points="4,16 10,6 16,16" fill="#B91C1C" stroke="#FEE2E2" strokeWidth="1.2" />
          <path d="M3 16 V5 M17 16 V5" stroke="#FEE2E2" strokeWidth="1.3" />
        </g>
      );
    case 'signal_bastion':
      return (
        <g>
          <polygon points="8,17 9,7 11,7 12,17" fill="#F8FAFC" stroke="#0F172A" strokeWidth="1.1" />
          <circle cx="10" cy="5" r="2.8" fill="#EAB308" />
        </g>
      );
  }
}

export function LandmarkGlyphSvg({ landmark }: { readonly landmark: LandmarkType }) {
  switch (landmark) {
    case 'frontier_village':
      return (
        <g>
          <rect x="3" y="10" width="6" height="6" fill="#F5F5F4" stroke="#78350F" strokeWidth="1" />
          <polygon points="2,10 6,6 10,10" fill="#78350F" />
          <rect x="10" y="11" width="7" height="5" fill="#F5F5F4" stroke="#78350F" strokeWidth="1" />
          <polygon points="9,11 13.5,7 18,11" fill="#92400E" />
        </g>
      );
    case 'ancient_watchtower':
      return (
        <g>
          <rect x="6.5" y="5" width="7" height="12" fill="#94A3B8" stroke="#334155" strokeWidth="1.2" />
          <path d="M6 5 H14 M8 8 H12" stroke="#1E293B" strokeWidth="1.3" />
        </g>
      );
    case 'relic_ruin':
      return (
        <g stroke="#CBD5E1" strokeWidth="1.6" fill="none">
          <path d="M5 16 V9 A5 5 0 0 1 15 9 V16" />
          <path d="M3 16 H17" />
        </g>
      );
    case 'outlaw_camp':
      return (
        <g>
          <polygon points="3,16 10,6 17,16" fill="#18181B" stroke="#DC2626" strokeWidth="1.4" />
          <path d="M7 14 L13 9 M13 14 L7 9" stroke="#DC2626" strokeWidth="1.5" />
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
