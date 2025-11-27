"use client";

import { memo, useState, useCallback } from "react";
import type { GalaxyNode, WeightMode } from "@/types/galaxy";

interface MobileHUDProps {
  planets: GalaxyNode[];
  sun: GalaxyNode;
  followingId: string | null;
  onFollowPlanet: (nodeId: string | null) => void;
  zoom: number;
  weightMode: WeightMode;
  onWeightModeChange: (mode: WeightMode) => void;
  hideStables: boolean;
  hideWrapped: boolean;
  onToggleStables: () => void;
  onToggleWrapped: () => void;
  followingInfo: { symbol: string; type: string } | null;
}

/**
 * MobileHUD - Futuristic mobile interface for galaxy navigation
 * Features:
 * - Floating action button (FAB) with glow effect
 * - Bottom sheet with chain navigation
 * - Compact following indicator
 * - Touch-optimized buttons
 */
const MobileHUD = memo(({
  planets,
  sun,
  followingId,
  onFollowPlanet,
  zoom,
  weightMode,
  onWeightModeChange,
  hideStables,
  hideWrapped,
  onToggleStables,
  onToggleWrapped,
  followingInfo,
}: MobileHUDProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chains' | 'settings'>('chains');

  const allNodes = [sun, ...planets];

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleNodeClick = useCallback((nodeId: string, isFollowing: boolean) => {
    onFollowPlanet(isFollowing ? null : nodeId);
    // Don't close - let user see the result
  }, [onFollowPlanet]);

  return (
    <>
      {/* Compact Following Indicator - Top of screen */}
      {followingInfo && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/20 backdrop-blur-xl border border-cyan-400/30">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-cyan-300 text-sm font-medium">{followingInfo.symbol}</span>
            <button
              onClick={() => onFollowPlanet(null)}
              className="ml-1 text-cyan-400/60 hover:text-red-400 transition-colors touch-target flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Zoom Indicator - Bottom left */}
      <div className="fixed bottom-20 left-4 z-40 pointer-events-none">
        <div className="text-xs text-white/40 bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm">
          {(zoom * 100).toFixed(0)}%
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-700 border border-purple-400/30 shadow-2xl flex items-center justify-center fab-glow touch-target pointer-events-auto"
        aria-label="Open navigation menu"
      >
        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Bottom Sheet Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm pointer-events-auto"
          onClick={handleClose}
        >
          {/* Bottom Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 mobile-sheet-enter max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="w-12 h-1 rounded-full bg-white/20" />
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-white/10 px-4">
              <button
                onClick={() => setActiveTab('chains')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'chains'
                    ? 'text-cyan-400 border-b-2 border-cyan-400'
                    : 'text-white/50'
                }`}
              >
                🪐 Chains
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'settings'
                    ? 'text-purple-400 border-b-2 border-purple-400'
                    : 'text-white/50'
                }`}
              >
                ⚙️ Settings
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'chains' ? (
                <div className="grid grid-cols-3 gap-3">
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
                        onClick={() => handleNodeClick(node.id, isFollowing)}
                        className={`
                          flex flex-col items-center gap-2 p-3 rounded-2xl
                          transition-all duration-200 touch-target
                          ${isFollowing 
                            ? 'bg-gradient-to-br from-cyan-500/30 to-purple-500/30 border-cyan-400/50 shadow-lg' 
                            : 'bg-white/5 border-white/10 active:bg-white/10'
                          }
                          border
                        `}
                      >
                        {/* Icon */}
                        <div className={`
                          relative w-12 h-12 rounded-full overflow-hidden
                          ${isSun ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-white/10'}
                          ${isFollowing ? 'ring-2 ring-cyan-400/50' : ''}
                        `}>
                          {icon ? (
                            <img 
                              src={icon} 
                              alt={symbol}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white">
                              {symbol.substring(0, 2)}
                            </div>
                          )}
                          
                          {isFollowing && (
                            <div className="absolute inset-0 rounded-full animate-ping bg-cyan-400/30" />
                          )}
                        </div>

                        {/* Label */}
                        <span className={`
                          text-xs font-medium
                          ${isFollowing ? 'text-cyan-300' : 'text-white/70'}
                        `}>
                          {symbol}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Weight Mode Selector */}
                  <div>
                    <label className="block text-xs text-white/50 mb-2 uppercase tracking-wide">
                      Size Metric
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['MarketCap', 'TVL', 'Volume24h', 'Change24h'] as WeightMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => onWeightModeChange(mode)}
                          className={`
                            py-3 px-4 rounded-xl text-sm font-medium transition-all touch-target
                            ${weightMode === mode
                              ? 'bg-purple-500/30 border-purple-400/50 text-purple-300'
                              : 'bg-white/5 border-white/10 text-white/60 active:bg-white/10'
                            }
                            border
                          `}
                        >
                          {mode === 'MarketCap' ? '📊 Market Cap' :
                           mode === 'TVL' ? '🔒 TVL' :
                           mode === 'Volume24h' ? '📈 24h Volume' :
                           '📉 24h Change'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Token Filters */}
                  <div>
                    <label className="block text-xs text-white/50 mb-2 uppercase tracking-wide">
                      Token Filters
                    </label>
                    <div className="flex gap-3">
                      <button
                        onClick={onToggleStables}
                        className={`
                          flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all touch-target
                          ${hideStables
                            ? 'bg-red-500/20 border-red-400/30 text-red-300'
                            : 'bg-green-500/20 border-green-400/30 text-green-300'
                          }
                          border
                        `}
                      >
                        {hideStables ? '🚫' : '✅'} Stables
                      </button>
                      <button
                        onClick={onToggleWrapped}
                        className={`
                          flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all touch-target
                          ${hideWrapped
                            ? 'bg-red-500/20 border-red-400/30 text-red-300'
                            : 'bg-green-500/20 border-green-400/30 text-green-300'
                          }
                          border
                        `}
                      >
                        {hideWrapped ? '🚫' : '✅'} Wrapped
                      </button>
                    </div>
                  </div>

                  {/* Release Camera Button */}
                  {followingId && (
                    <button
                      onClick={() => {
                        onFollowPlanet(null);
                        handleClose();
                      }}
                      className="w-full py-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 font-medium touch-target active:bg-red-500/30"
                    >
                      🎯 Release Camera
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={handleClose}
                className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-white/70 font-medium touch-target active:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

MobileHUD.displayName = 'MobileHUD';

export default MobileHUD;
