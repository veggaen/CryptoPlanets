"use client";

import { memo } from "react";
import type { GalaxyNode } from "@/types/galaxy";
import type { QualityMode } from "@/types/performance";

interface GalaxyHUDProps {
  planets: GalaxyNode[];
  sun: GalaxyNode;
  followingId: string | null;
  onFollowPlanet: (nodeId: string | null) => void;
  zoom: number;
  qualityMode: QualityMode;
  qualityReasons: string[];
}

/**
 * GalaxyHUD - Futuristic navigation bar for chain selection
 * Displays glowing buttons for each chain (planet) in the galaxy
 */
const GalaxyHUD = memo(({ planets, sun, followingId, onFollowPlanet, zoom, qualityMode, qualityReasons }: GalaxyHUDProps) => {
  // Get all navigable nodes (sun + planets)
  const allNodes = [sun, ...planets];

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-50 pointer-events-auto">
      {/* Main HUD Container */}
      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
        {/* Title */}
        <div className="text-[10px] uppercase tracking-widest text-white/40 text-center mb-1 font-medium">
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

        {/* Chain Buttons */}
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
                group relative flex items-center gap-2 px-3 py-2 rounded-xl
                transition-all duration-300 ease-out
                ${isFollowing 
                  ? 'bg-gradient-to-r from-cyan-500/30 to-purple-500/30 border-cyan-400/50 shadow-lg shadow-cyan-500/20' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                }
                border backdrop-blur-sm
              `}
              title={isFollowing ? `Unfollow ${symbol}` : `Follow ${symbol}`}
            >
              {/* Glow effect when active */}
              {isFollowing && (
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-400/20 to-purple-400/20 blur-xl -z-10" />
              )}

              {/* Icon */}
              <div className={`
                relative w-8 h-8 rounded-full overflow-hidden
                ${isSun ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-white/10'}
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
                text-sm font-medium transition-colors duration-200
                ${isFollowing ? 'text-cyan-300' : 'text-white/70 group-hover:text-white'}
              `}>
                {symbol}
              </span>

              {/* Following indicator */}
              {isFollowing && (
                <div className="ml-auto flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[10px] text-cyan-400/80 uppercase tracking-wide">Lock</span>
                </div>
              )}
            </button>
          );
        })}

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
