"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { GalaxyData } from "@/types/galaxy";
import type { GalaxyNode } from "@/types/galaxy";
import type { QualityMode } from "@/types/performance";
import type { PrimaryProvider } from "@/types/providers";
import { PrimaryProviderSelect } from "@/components/PrimaryProviderSelect";

interface GalaxyHUDProps {
  planets: GalaxyNode[];
  sun: GalaxyNode;
  followingId: string | null;
  onFollowPlanet: (nodeId: string | null) => void;
  zoom: number;
  qualityMode: QualityMode;
  qualityReasons: string[];
  primaryProvider: PrimaryProvider;
  onPrimaryProviderChange: (provider: PrimaryProvider) => void;
  providerMeta?: GalaxyData['meta'];
}

/**
 * GalaxyHUD - Futuristic navigation bar for chain selection
 * Displays glowing buttons for each chain (planet) in the galaxy
 */
const GalaxyHUD = memo(({ planets, sun, followingId, onFollowPlanet, zoom, qualityMode, qualityReasons, primaryProvider, onPrimaryProviderChange, providerMeta }: GalaxyHUDProps) => {
  // Get all navigable nodes (sun + planets)
  const allNodes = [sun, ...planets];

  const [cmcLockedInfoPinned, setCmcLockedInfoPinned] = useState(false);
  const [cmcLockedInfoHover, setCmcLockedInfoHover] = useState(false);
  const showCmcLockedInfo = cmcLockedInfoPinned || cmcLockedInfoHover;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const updateScrollVars = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const pct = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    el.style.setProperty('--scroll-pct', `${Math.round(pct * 100)}%`);
  }, []);

  useEffect(() => {
    updateScrollVars();
  }, [updateScrollVars, planets.length, qualityMode, followingId]);

  return (
    <div className="fixed left-4 top-32 z-50 pointer-events-auto" data-menu-ignore="true">
      {/* Main HUD Container */}
      <div className="flex flex-col gap-2 p-2 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl h-[70vh] max-h-[calc(100vh-9rem)] overflow-hidden min-h-0 w-44">
        {/* Title */}
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 text-center mb-1 font-medium">
          Navigate
        </div>

        {qualityMode === 'lite' && (
          <div className="mb-1 p-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-100/90">
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200 font-semibold">Lite Mode</div>
            {qualityReasons.length > 0 && (
              <div className="text-[10px] text-amber-100/80 mt-0.5">
                {qualityReasons[0]}
                {qualityReasons.length > 1 ? ` +${qualityReasons.length - 1} more` : ''}
              </div>
            )}
          </div>
        )}

        {/* Primary provider selector */}
        <div className="px-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/35 text-center mb-1 font-medium">
            Primary Data
          </div>
          <PrimaryProviderSelect
            value={primaryProvider}
            onChange={onPrimaryProviderChange}
            variant="desktop"
            title="Choose which provider to trust first when values conflict"
          />

          {providerMeta?.lockedPrimaryProvider === 'coinmarketcap' && primaryProvider === 'coinmarketcap' && (
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.3em] text-red-200/80 font-semibold">Locked</div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-6 h-6 -mr-1 -mt-1 rounded-md text-white/45 hover:text-white/70 hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-white/15"
                  aria-label="Why CoinMarketCap is locked"
                  aria-expanded={showCmcLockedInfo}
                  onClick={() => setCmcLockedInfoPinned((v) => !v)}
                  onMouseEnter={() => setCmcLockedInfoHover(true)}
                  onMouseLeave={() => setCmcLockedInfoHover(false)}
                  onFocus={() => setCmcLockedInfoHover(true)}
                  onBlur={() => setCmcLockedInfoHover(false)}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9 8a1 1 0 1 1 2 0v6a1 1 0 1 1-2 0V8Zm1-3.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              <div className="text-[11px] text-white/60 mt-1 leading-snug">
                CoinMarketCap is owner-only. Showing fallback data.
              </div>

              {showCmcLockedInfo && (
                <div
                  className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2"
                  onMouseEnter={() => setCmcLockedInfoHover(true)}
                  onMouseLeave={() => setCmcLockedInfoHover(false)}
                >
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-semibold">
                    Cost note
                  </div>
                  <div className="mt-1 text-[11px] text-white/70 leading-snug">
                    CoinMarketCap API access is paid. Enabling public access can cost the owner roughly <span className="text-white/85 font-medium">$948–$3,588/year</span>
                    <span className="text-white/60"> (plan-dependent)</span> plus maintenance.
                  </div>
                  <div className="mt-1 text-[11px] text-white/60 leading-snug">
                    This is just one provider—infra and other APIs add more. Tips help keep features online.
                  </div>
                </div>
              )}

              <div className="mt-1">
                <div className="h-2 rounded bg-red-500/20 blur-[1px]" />
                <div className="h-2 rounded bg-red-500/15 blur-[1px] mt-1 w-5/6" />
              </div>
            </div>
          )}
        </div>

        {/* Chain Buttons (scrollable) */}
        <div
          ref={scrollRef}
          onScroll={updateScrollVars}
          className="hud-scrollbar flex flex-col gap-1.5 overflow-y-auto min-h-0 flex-1"
          data-menu-ignore="true"
        >
          {allNodes.map((node) => {
            const symbol = ('symbol' in node.data ? node.data.symbol : null)
              || ('name' in node.data ? node.data.name : null)
              || node.id.toUpperCase();
            
            const icon = ('icon' in node.data && typeof node.data.icon === 'string')
              ? node.data.icon
              : null;

            const isFollowing = followingId === node.id;
            const isSun = node.type === 'sun';

            return (
              <button
                key={node.id}
                onClick={() => onFollowPlanet(isFollowing ? null : node.id)}
                className={`
                  group relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl
                  transition-all duration-300 ease-out
                  ${isFollowing 
                    ? 'bg-linear-to-r from-cyan-500/30 to-purple-500/30 border-cyan-400/50 shadow-lg shadow-cyan-500/20' 
                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                  }
                  border backdrop-blur-sm
                `}
                title={isFollowing ? `Unfollow ${symbol}` : `Follow ${symbol}`}
              >
                {/* Glow effect when active */}
                {isFollowing && (
                  <div className="absolute inset-0 rounded-xl bg-linear-to-r from-cyan-400/20 to-purple-400/20 blur-xl -z-10" />
                )}

                {/* Icon */}
                <div className={`
                  relative w-7 h-7 rounded-full overflow-hidden
                  ${isSun ? 'bg-linear-to-br from-yellow-400 to-orange-500' : 'bg-white/10'}
                  ${isFollowing ? 'ring-2 ring-cyan-400/50' : ''}
                  transition-all duration-300
                  group-hover:scale-110
                `}>
                  {icon ? (
                    <img 
                      src={icon} 
                      alt={symbol}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
                      {symbol.substring(0, 2)}
                    </div>
                  )}
                  
                  {/* Pulse animation when following */}
                  {isFollowing && (
                    <div className="absolute inset-0 rounded-full animate-ping bg-cyan-400/30" />
                  )}
                </div>

                {/* Label */}
                <span className={`
                  text-[13px] font-medium transition-colors duration-200
                  ${isFollowing ? 'text-cyan-300' : 'text-white/70 group-hover:text-white'}
                `}>
                  {symbol}
                </span>

                {/* Following indicator */}
                {isFollowing && (
                  <div className="ml-auto flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[10px] text-cyan-400/80 uppercase tracking-[0.2em]">Lock</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/10 my-1" />

        {/* Unfollow All Button */}
        {followingId && (
          <button
            onClick={() => onFollowPlanet(null)}
            className="
              flex items-center justify-center gap-2 px-3 py-2 rounded-xl
              bg-red-500/10 border border-red-500/20
              text-red-400 text-sm font-medium
              hover:bg-red-500/20 hover:border-red-500/30
              transition-all duration-200
            "
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Release Camera
          </button>
        )}

        {/* Zoom indicator */}
        <div className="text-[10px] text-white/30 text-center mt-1">
          {(zoom * 100).toFixed(0)}% zoom
        </div>
      </div>
    </div>
  );
});

GalaxyHUD.displayName = 'GalaxyHUD';

export default GalaxyHUD;
