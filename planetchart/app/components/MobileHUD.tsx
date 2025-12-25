"use client";

import { memo, useMemo, useState, useCallback } from "react";
import type { GalaxyData, GalaxyNode, WeightMode } from "@/types/galaxy";
import type { QualityMode } from "@/types/performance";
import type { PrimaryProvider } from "@/types/providers";
import { PrimaryProviderSelect } from "@/components/PrimaryProviderSelect";

interface MobileHUDProps {
  planets: GalaxyNode[];
  sun: GalaxyNode;
  nodes: GalaxyNode[];
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
  qualityMode: QualityMode;
  qualityReasons: string[];
  primaryProvider: PrimaryProvider;
  onPrimaryProviderChange: (provider: PrimaryProvider) => void;
  providerMeta?: GalaxyData['meta'];
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
  nodes,
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
  qualityMode,
  qualityReasons,
  primaryProvider,
  onPrimaryProviderChange,
  providerMeta,
}: MobileHUDProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chains' | 'settings'>('chains');
  const [searchQuery, setSearchQuery] = useState('');

  const allNodes = [sun, ...planets];

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as GalaxyNode[];

    const scored: Array<{ node: GalaxyNode; score: number }> = [];

    for (const node of nodes) {
      const data = node.data as unknown as Record<string, unknown>;
      const symbol = (('symbol' in node.data ? node.data.symbol : null) as string | null)
        || (('name' in node.data ? node.data.name : null) as string | null)
        || node.id;
      const name = ('name' in node.data ? node.data.name : null) as string | null;
      const address = (typeof data.address === 'string' ? data.address : null)
        || (typeof data.contractAddress === 'string' ? data.contractAddress : null)
        || (typeof data.tokenAddress === 'string' ? data.tokenAddress : null)
        || null;
      const tags = data.tags;

      const parts: string[] = [node.id, symbol];
      if (name) parts.push(name);
      if (typeof address === 'string') parts.push(address);
      if (Array.isArray(tags)) parts.push(...tags.filter((t) => typeof t === 'string'));
      if (typeof tags === 'string') parts.push(tags);

      const normalizedParts = parts
        .filter(Boolean)
        .map((p) => String(p).toLowerCase());

      let bestScore = 0;
      for (const p of normalizedParts) {
        if (p === q) {
          bestScore = Math.max(bestScore, 100);
        } else if (p.startsWith(q)) {
          bestScore = Math.max(bestScore, 70);
        } else if (p.includes(q)) {
          bestScore = Math.max(bestScore, 40);
        }
      }

      if (bestScore > 0) {
        // Prefer moons (tokens) slightly when searching by address.
        const looksLikeAddress = q.startsWith('0x') || q.length >= 20;
        if (looksLikeAddress && node.type === 'moon') bestScore += 5;
        scored.push({ node, score: bestScore });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((s) => s.node);
  }, [nodes, searchQuery]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchQuery('');
  }, []);

  const handleNodeClick = useCallback((nodeId: string, isFollowing: boolean) => {
    onFollowPlanet(isFollowing ? null : nodeId);
    // Don't close - let user see the result
  }, [onFollowPlanet]);

  const handleSearchPick = useCallback((nodeId: string) => {
    onFollowPlanet(nodeId);
    handleClose();
  }, [handleClose, onFollowPlanet]);

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
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-linear-to-br from-purple-600 to-indigo-700 border border-purple-400/30 shadow-2xl flex items-center justify-center fab-glow touch-target pointer-events-auto"
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
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-white/50 mb-2 uppercase tracking-wide">
                      Search
                    </label>
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search chains or tokens…"
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    />
                  </div>

                  {searchQuery.trim() ? (
                    <div className="space-y-2">
                      {searchResults.length === 0 ? (
                        <div className="text-sm text-white/40 px-1">
                          No matches
                        </div>
                      ) : (
                        searchResults.map((node) => {
                          const symbol = ('symbol' in node.data ? node.data.symbol : null)
                            || ('name' in node.data ? node.data.name : null)
                            || node.id.toUpperCase();
                          const label = node.type === 'moon' ? 'Token' : node.type === 'planet' ? 'Chain' : 'Sun';
                          const isFollowing = followingId === node.id;

                          return (
                            <button
                              key={`search-${node.id}`}
                              onClick={() => handleSearchPick(node.id)}
                              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-colors touch-target ${
                                isFollowing
                                  ? 'bg-cyan-500/20 border-cyan-400/30 text-cyan-200'
                                  : 'bg-white/5 border-white/10 text-white/80 active:bg-white/10'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{symbol}</div>
                                <div className="text-[11px] uppercase tracking-wide text-white/40">{label}</div>
                              </div>
                              <div className="text-xs text-white/40">Go</div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : (
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
                                ? 'bg-linear-to-br from-cyan-500/30 to-purple-500/30 border-cyan-400/50 shadow-lg' 
                                : 'bg-white/5 border-white/10 active:bg-white/10'
                              }
                              border
                            `}
                          >
                            {/* Icon */}
                            <div className={`
                              relative w-12 h-12 rounded-full overflow-hidden
                              ${isSun ? 'bg-linear-to-br from-yellow-400 to-orange-500' : 'bg-white/10'}
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
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Primary provider selector */}
                  <div>
                    <label className="block text-xs text-white/50 mb-2 uppercase tracking-wide">
                      Primary Data Provider
                    </label>
                    <PrimaryProviderSelect
                      value={primaryProvider}
                      onChange={onPrimaryProviderChange}
                      variant="mobile"
                      title="Choose which provider to trust first when values conflict"
                    />

                    {providerMeta?.lockedPrimaryProvider === 'coinmarketcap' && primaryProvider === 'coinmarketcap' && (
                      <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-red-200/80 font-semibold">Locked</div>
                        <div className="text-[11px] text-white/60 mt-1 leading-snug">
                          CoinMarketCap is owner-only on this plan. Showing fallback data.
                        </div>
                        <div className="mt-2">
                          <div className="h-2 rounded bg-red-500/20 blur-[1px]" />
                          <div className="h-2 rounded bg-red-500/15 blur-[1px] mt-1 w-5/6" />
                        </div>
                      </div>
                    )}
                    <div className="text-[11px] text-white/40 mt-2">
                      Uses your selected provider when values conflict; fills missing metrics from others.
                    </div>
                  </div>

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
                           mode === 'Volume24h' ? '📈 24H DEX Vol' :
                           '📉 24h Change'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rendering profile */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-xs text-white/50 mb-1 uppercase tracking-wide">
                      Rendering Profile
                    </div>
                    <div className={`text-sm font-semibold ${qualityMode === 'lite' ? 'text-amber-200' : 'text-emerald-200'}`}>
                      {qualityMode === 'lite' ? 'Lite Mode' : 'Full Fidelity'}
                    </div>
                    {qualityMode === 'lite' && qualityReasons.length > 0 && (
                      <ul className="mt-2 text-[11px] text-white/60 list-disc pl-4 space-y-1">
                        {qualityReasons.slice(0, 3).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                        {qualityReasons.length > 3 && (
                          <li className="text-white/40">+{qualityReasons.length - 3} more</li>
                        )}
                      </ul>
                    )}
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
