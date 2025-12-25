"use client";

import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  GalaxyState,
  GalaxyNode,
  WeightMode,
  GalaxyData,
  TokenData,
  ChainData,
  BTCData,
} from "@/types/galaxy";
import { loadGalaxyData, type VolumeSource } from "@/services/dataLoader";
import { initGalaxyState, tickGalaxy } from "@/physics/galaxyEngine";
import { CAMERA_CONFIG, updateFollowCamera, calculateIdealZoom, createCinematicTransition, updateCinematicTransition, CameraTransition } from "@/physics/cameraEngine";
import { getParticles, getShakeOffset, Particle, setParticleBudget, collisionConfig } from "@/physics/collision";
import { uiConfig } from "@/config/uiConfig";
import type { QualityMode } from "@/types/performance";
import type { PrimaryProvider } from "@/types/providers";
import { normalizePrimaryProvider } from "@/types/providers";
import { formatCompactUSD, formatPercentChange } from "@/utils/formatters";
import Starfield from "./Starfield";
import Footer from "./Footer";
import GalaxyHUD from "./GalaxyHUD";
import RadialMenu from "./RadialMenu";
import MobileHUD from "./MobileHUD";
import DeckGalaxyPrototype from "./DeckGalaxyPrototype";

const QUALITY_BUDGETS = {
  lite: {
    maxChains: 6,
    tokensPerChain: 12,
    particleCap: 120,
  },
  full: {
    particleCap: collisionConfig.maxParticles,
  },
} as const;

const RENDER_FRAME_INTERVAL_LITE = 1000 / 30; // 30 FPS cap for React renders (lite mode)
const VIEW_CULL_PADDING_PX = 220;
const METRIC_LABELS: Record<WeightMode, string> = {
  MarketCap: "MCap",
  TVL: "",
  Volume24h: "24H Vol",
  Change24h: "",
  Change7d: "7d",
  Change30d: "30d",
};

type DetailTier = "minimal" | "medium" | "full";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const DETAIL_THRESHOLDS = {
  planet: { full: 0.055, medium: 0.04 },
  moon: { full: 0.045, medium: 0.032 },
} as const;

const planetLabelConfig = uiConfig.nodeLabels.planet;
const moonLabelConfig = uiConfig.nodeLabels.moon;
const moonCullConfig = uiConfig.moonLowZoomCull;

function getDetailTier(zoom: number, thresholds: { full: number; medium: number }): DetailTier {
  if (zoom >= thresholds.full) {
    return "full";
  }
  if (zoom >= thresholds.medium) {
    return "medium";
  }
  return "minimal";
}

type MetricTrend = "up" | "down" | "neutral";
type NodeMetricDisplay = {
  label: string;
  text: string;
  accent: string;
  trend: MetricTrend;
};

const POSITIVE_ACCENT = "#86efac";
const NEGATIVE_ACCENT = "#f87171";
const NEUTRAL_ACCENT = "#f1f5f9";
const ZERO_ACCENT = "#facc15";
const PERF_SUMMARY_WINDOW_MS = 10_000;
const CLICK_DRAG_TOLERANCE_PX = 4;

function isUiEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('[data-menu-ignore="true"]'));
}

type PerfSample = {
  timestamp: number;
  fps: number;
  nodes: number;
  visibleNodes: number;
  particles: number;
  physicsMs: number;
  cameraMs: number;
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveMetricValue(node: GalaxyNode, mode: WeightMode): number | null {
  const data = node.data as Record<string, unknown>;

  switch (mode) {
    case "MarketCap": {
      const cap = asNumber(data.marketCap);
      return cap !== null && cap > 0 ? cap : null;
    }
    case "TVL": {
      const tvlKind = typeof data.tvlKind === "string" ? data.tvlKind : null;
      const tvl = asNumber(data.tvl);
      const liquidity = asNumber(data.liquidity);
      const marketCap = asNumber(data.marketCap);

      if (node.type === "planet") {
        if (tvlKind === "unknown") return null;
        return tvl !== null && tvl > 0 ? tvl : null;
      }
      if (node.type === "moon") {
        return liquidity !== null && liquidity > 0 ? liquidity : null;
      }
      if (node.type === "sun") {
        return marketCap !== null && marketCap > 0 ? marketCap : null;
      }

      if (tvl !== null && tvl > 0) return tvl;
      if (liquidity !== null && liquidity > 0) return liquidity;
      if (marketCap !== null && marketCap > 0) return marketCap;
      return null;
    }
    case "Volume24h": {
      const kind = typeof data.volume24hKind === 'string' ? data.volume24hKind : null;
      if (kind === 'unknown') return null;
      const vol = asNumber(data.volume24h);
      return vol !== null && vol > 0 ? vol : null;
    }
    case "Change24h": {
      const kind = typeof data.change24hKind === "string" ? data.change24hKind : null;
      const change = asNumber(data.change24h);
      if (node.type === "planet" && kind === "unknown") return null;
      return change;
    }
    case "Change7d": {
      return asNumber(data.change7d);
    }
    case "Change30d": {
      return asNumber(data.change30d);
    }
    default:
      return null;
  }
}

function getNodeMetricDisplay(node: GalaxyNode, mode: WeightMode): NodeMetricDisplay | null {
  const rawValue = resolveMetricValue(node, mode);
  if (rawValue === null) {
    return null;
  }

  if (mode === "MarketCap") {
    const data = node.data as Record<string, unknown>;
    const kind = typeof data.marketCapKind === "string" ? data.marketCapKind : null;
    const label = kind === "fdv" ? "FDV" : kind === "estimated" ? "Est" : METRIC_LABELS[mode];
    return {
      label,
      text: formatCompactUSD(Math.abs(rawValue)),
      accent: NEUTRAL_ACCENT,
      trend: "neutral",
    };
  }

  if (mode === "Volume24h") {
    return {
      label: "",
      text: formatCompactUSD(Math.abs(rawValue)),
      accent: NEUTRAL_ACCENT,
      trend: "neutral",
    };
  }

  if (mode.startsWith("Change")) {
    const trend: MetricTrend = rawValue > 0 ? "up" : rawValue < 0 ? "down" : "neutral";
    const accent = trend === "up" ? POSITIVE_ACCENT : trend === "down" ? NEGATIVE_ACCENT : ZERO_ACCENT;
    return {
      label: METRIC_LABELS[mode],
      text: formatPercentChange(rawValue),
      accent,
      trend,
    };
  }

  return {
    label: METRIC_LABELS[mode],
    text: formatCompactUSD(Math.abs(rawValue)),
    accent: NEUTRAL_ACCENT,
    trend: "neutral",
  };
}

function formatMetricLine(display: NodeMetricDisplay): string {
  if (!display.label) return display.text;
  return display.label === "MCap" ? display.text : `${display.label}: ${display.text}`;
}

type SearchSuggestion = {
  id: string;
  kind: "sun" | "planet" | "moon";
  primary: string;
  secondary: string | null;
  address: string | null;
  icon: string | null;
  terms: string[];
  chainId: string | null;
  chainSymbol: string | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
};

function normalizeSearchQuery(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().trim();
}

function looksLikeHexAddress(value: string): boolean {
  return /^0x[a-f0-9]{6,}$/i.test(value.trim());
}

function looksLikeEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function looksLikeBase58Address(value: string): boolean {
  const v = value.trim();
  // Common Solana mint/pubkey format (base58, typically 32-44 chars)
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
}

function looksLikeAnyAddress(value: string): boolean {
  const v = value.trim();
  if (v.length < 10) return false;
  if (v.includes(' ')) return false;
  return true;
}

function shortAddress(value: string): string {
  const v = value.trim();
  if (v.length <= 14) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return false;
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack[j] === needle[i]) {
      i += 1;
    }
  }
  return i === needle.length;
}

function scoreSuggestion(query: string, suggestion: SearchSuggestion): number {
  if (!query) return -Infinity;

  const primary = suggestion.primary.toLowerCase();
  const secondary = (suggestion.secondary ?? "").toLowerCase();
  const addressRaw = suggestion.address ?? "";
  const address = addressRaw.toLowerCase();
  const terms = suggestion.terms.map(normalizeSearchToken);

  const typeBoost = suggestion.kind === "sun" ? 30 : suggestion.kind === "planet" ? 20 : 10;

  // Address targeting (0x…)
  if (looksLikeHexAddress(query)) {
    if (address && address === query) return 1200 + typeBoost;
    if (address && address.startsWith(query)) return 1100 + typeBoost;
    if (address && address.includes(query)) return 980 + typeBoost;
  }

  // Generic address targeting (works for non-0x addresses too; case-insensitive).
  if (!looksLikeHexAddress(query) && looksLikeAnyAddress(query)) {
    if (addressRaw && address === query) return 1150 + typeBoost;
    if (addressRaw && address.startsWith(query)) return 1020 + typeBoost;
    if (addressRaw && address.includes(query)) return 900 + typeBoost;
  }

  if (primary === query) return 1000 + typeBoost;
  if (secondary === query) return 930 + typeBoost;
  if (terms.includes(query)) return 900 + typeBoost;
  if (primary.startsWith(query)) return 850 + typeBoost;
  if (secondary.startsWith(query)) return 760 + typeBoost;
  if (terms.some(t => t.startsWith(query))) return 720 + typeBoost;
  if (primary.includes(query)) return 620 + typeBoost;
  if (secondary.includes(query)) return 540 + typeBoost;
  if (terms.some(t => t.includes(query))) return 500 + typeBoost;

  const compactQuery = query.replace(/\s+/g, "");
  const compactPrimary = primary.replace(/\s+/g, "");
  const compactSecondary = secondary.replace(/\s+/g, "");

  if (isSubsequence(compactQuery, compactPrimary)) return 430 + typeBoost;
  if (isSubsequence(compactQuery, compactSecondary)) return 380 + typeBoost;

  return -Infinity;
}

function toSearchSuggestion(node: GalaxyNode): SearchSuggestion {
  const data = node.data as Record<string, unknown>;
  const symbol = typeof data.symbol === "string" && data.symbol.trim().length ? data.symbol.trim() : null;
  const name = typeof data.name === "string" && data.name.trim().length ? data.name.trim() : null;
  const icon = typeof data.icon === "string" && data.icon.trim().length ? data.icon.trim() : null;
  const contractRaw = typeof data.contractAddress === "string" && data.contractAddress.trim().length ? data.contractAddress.trim() : null;
  const legacyAddressRaw = typeof data.address === "string" && data.address.trim().length ? data.address.trim() : null;
  const candidate = contractRaw ?? legacyAddressRaw;
  const address = candidate && (looksLikeEvmAddress(candidate) || looksLikeBase58Address(candidate)) ? candidate : null;
  const primary = symbol ?? name ?? node.id.toUpperCase();
  const secondary = symbol && name ? name : symbol ? node.id.toUpperCase() : null;

  const kind: SearchSuggestion["kind"] =
    node.type === "sun" || node.type === "planet" || node.type === "moon" ? node.type : "moon";

  const terms: string[] = [];
  if (symbol) terms.push(symbol);
  if (name) terms.push(name);
  terms.push(node.id);
  if (address) terms.push(address);
  if (kind === "planet") {
    // Treat chain identifiers as tag-like search terms.
    const chainSymbol = typeof data.symbol === "string" ? data.symbol : null;
    const chainName = typeof data.name === "string" ? data.name : null;
    if (chainSymbol) terms.push(chainSymbol);
    if (chainName) terms.push(chainName);
  }
  if (kind === "moon") {
    // Add parent chain id as a tag-like term for token searches.
    if (typeof node.parentId === "string" && node.parentId.trim()) {
      terms.push(node.parentId);
    }
  }

  const chainId = kind === 'moon' ? (typeof node.parentId === 'string' ? node.parentId : null) : (kind === 'planet' ? node.id : null);
  const chainSymbol = kind === 'planet'
    ? (typeof data.symbol === 'string' ? data.symbol : null)
    : null;

  const liquidityUsd = asNumber(data.liquidity);
  const volume24hUsd = asNumber(data.volume24h);
  const change24hPct = asNumber(data.change24h);

  return {
    id: node.id,
    kind,
    primary,
    secondary,
    address,
    icon,
    terms,
    chainId,
    chainSymbol,
    liquidityUsd,
    volume24hUsd,
    change24hPct,
  };
}

function labelKind(kind: SearchSuggestion["kind"]): string {
  if (kind === "sun") return "SUN";
  if (kind === "planet") return "CHAIN";
  return "TOKEN";
}

function readStringProp(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const found = record[key];
  return typeof found === 'string' && found.trim().length ? found : null;
}

function FloatingSearch({
  nodes,
  onTarget,
}: {
  nodes: readonly GalaxyNode[];
  onTarget: (nodeId: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const copiedAddressTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedAddressTimeoutRef.current) {
        window.clearTimeout(copiedAddressTimeoutRef.current);
        copiedAddressTimeoutRef.current = null;
      }
    };
  }, []);

  const handleCopyAddress = useCallback((event: React.MouseEvent | React.KeyboardEvent, address: string) => {
    event.preventDefault();
    event.stopPropagation();

    const acknowledge = () => {
      setCopiedAddress(address);
      if (copiedAddressTimeoutRef.current) {
        window.clearTimeout(copiedAddressTimeoutRef.current);
      }
      copiedAddressTimeoutRef.current = window.setTimeout(() => setCopiedAddress(null), 1200);
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(address).then(acknowledge).catch(() => acknowledge());
      return;
    }

    try {
      const el = document.createElement('textarea');
      el.value = address;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch {
      // ignore
    }

    acknowledge();
  }, []);

  const suggestions = useMemo(() => {
    const normalized = normalizeSearchQuery(query);
    if (!normalized) return [] as SearchSuggestion[];

    const planetsById = new Map(
      nodes
        .filter((n) => n.type === 'planet')
        .map((n) => [n.id, n] as const)
    );

    const scored = nodes
      .filter((node) => node.type === "sun" || node.type === "planet" || node.type === "moon")
      .map((node) => {
        const suggestion = toSearchSuggestion(node);
        if (suggestion.kind === 'moon' && suggestion.chainId) {
          const planet = planetsById.get(suggestion.chainId);
          const pdata = (planet?.data ?? null) as unknown;
          const planetSymbol = readStringProp(pdata, 'symbol');
          const planetName = readStringProp(pdata, 'name');
          suggestion.chainSymbol = planetSymbol;
          if (planetSymbol) suggestion.terms.push(planetSymbol);
          if (planetName) suggestion.terms.push(planetName);
        }
        return suggestion;
      })
      .map((suggestion) => ({
        suggestion,
        score: scoreSuggestion(normalized, suggestion),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((entry) => entry.suggestion);

    return scored;
  }, [nodes, query]);

  const effectiveActiveIndex = suggestions.length
    ? Math.max(0, Math.min(activeIndex, suggestions.length - 1))
    : 0;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapper.contains(target)) return;
      setIsOpen(false);
      setActiveIndex(0);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const commitSelection = useCallback(
    (selection: SearchSuggestion | null) => {
      if (!selection) return;
      onTarget(selection.id);
      setQuery(selection.primary);
      setIsOpen(false);
      setActiveIndex(0);
      inputRef.current?.blur();
    },
    [onTarget]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(0);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((prev) => {
          if (!suggestions.length) return 0;
          return Math.min(prev + 1, suggestions.length - 1);
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const selection = suggestions[effectiveActiveIndex] ?? suggestions[0] ?? null;
        commitSelection(selection);
      }
    },
    [commitSelection, effectiveActiveIndex, suggestions]
  );

  const showDropdown = isOpen && suggestions.length > 0;

  return (
    <div
      ref={wrapperRef}
      data-menu-ignore="true"
      className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[min(560px,92vw)] pointer-events-auto"
    >
      <div className="relative">
        <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setIsOpen(Boolean(normalizeSearchQuery(next)));
            setActiveIndex(0);
          }}
          onFocus={() => setIsOpen(Boolean(normalizeSearchQuery(query)))}
          onKeyDown={handleKeyDown}
          placeholder="Search chains or tokens…"
          className="w-full bg-black/60 backdrop-blur-md border border-white/10 text-white pl-10 pr-4 py-3 rounded-2xl text-sm font-semibold shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          inputMode="search"
        />

        {showDropdown && (
          <div className="absolute left-0 right-0 mt-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            {suggestions.slice(0, 8).map((suggestion, idx) => {
              const isActive = idx === effectiveActiveIndex;
              const chainBadge = suggestion.kind === 'moon'
                ? (suggestion.chainSymbol ?? (suggestion.chainId ? suggestion.chainId.toUpperCase() : null))
                : (suggestion.kind === 'planet' ? (suggestion.chainSymbol ?? suggestion.primary) : null);

              const hasLiquidity = typeof suggestion.liquidityUsd === 'number' && suggestion.liquidityUsd > 0;
              const hasVol = typeof suggestion.volume24hUsd === 'number' && suggestion.volume24hUsd > 0;
              const hasChange = typeof suggestion.change24hPct === 'number' && Number.isFinite(suggestion.change24hPct);

              const metaChips: Array<{
                key: string;
                text: string;
                tone: 'neutral' | 'pos' | 'neg';
                icon: React.ReactNode;
              }> = [];

              if (suggestion.address) {
                metaChips.push({
                  key: 'addr',
                  text: shortAddress(suggestion.address),
                  tone: 'neutral',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 10h8a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-8a2 2 0 012-2z" />
                    </svg>
                  ),
                });
              }

              if (hasLiquidity) {
                metaChips.push({
                  key: 'liq',
                  text: `Liq ${formatCompactUSD(suggestion.liquidityUsd!)}`,
                  tone: 'neutral',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2s6 6.5 6 11a6 6 0 11-12 0c0-4.5 6-11 6-11z" />
                    </svg>
                  ),
                });
              }

              if (hasVol) {
                metaChips.push({
                  key: 'vol',
                  text: `Vol ${formatCompactUSD(suggestion.volume24hUsd!)}`,
                  tone: 'neutral',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19V9" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 19V13" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M22 19V7" />
                    </svg>
                  ),
                });
              }

              if (hasChange) {
                const v = suggestion.change24hPct as number;
                const tone: 'neutral' | 'pos' | 'neg' = v > 0 ? 'pos' : v < 0 ? 'neg' : 'neutral';
                metaChips.push({
                  key: 'chg',
                  text: `24h ${formatPercentChange(v)}`,
                  tone,
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 14l6-6 4 4 6-6" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 8v6h-6" />
                    </svg>
                  ),
                });
              }

              const fallbackLetters = String(suggestion.primary || '?').slice(0, 2).toUpperCase();
              const kindLabel = labelKind(suggestion.kind);

              return (
                <button
                  key={suggestion.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitSelection(suggestion)}
                  className={`w-full text-left px-3.5 py-2.5 flex items-center gap-3 transition-colors ${
                    isActive ? "bg-white/10" : "bg-transparent hover:bg-white/5"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center shrink-0 ${isActive ? 'ring-2 ring-cyan-400/25' : ''}`}>
                    {suggestion.icon ? (
                      <img src={suggestion.icon} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-bold text-white/70">{fallbackLetters}</span>
                    )}
                  </div>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-white truncate">
                      {suggestion.primary}
                      {chainBadge && suggestion.kind === 'moon' && (
                        <span className="ml-2 inline-flex items-center align-middle text-[10px] font-bold tracking-[0.22em] text-white/55">
                          {chainBadge.toUpperCase()}
                        </span>
                      )}
                    </span>
                    {metaChips.length > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {metaChips.slice(0, 4).map((chip) => {
                          const toneClass =
                            chip.tone === 'pos'
                              ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-200'
                              : chip.tone === 'neg'
                                ? 'bg-red-500/10 border-red-400/20 text-red-200'
                                : 'bg-white/5 border-white/10 text-white/55';

                          const isAddressChip = chip.key === 'addr' && Boolean(suggestion.address);
                          const addressRaw = suggestion.address ?? '';
                          const addressCopied = isAddressChip && copiedAddress === addressRaw;

                          return (
                            <span
                              key={chip.key}
                              role={isAddressChip ? 'button' : undefined}
                              tabIndex={isAddressChip ? 0 : undefined}
                              onMouseDown={
                                isAddressChip
                                  ? (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }
                                  : undefined
                              }
                              onClick={
                                isAddressChip
                                  ? (e) => handleCopyAddress(e, addressRaw)
                                  : undefined
                              }
                              onKeyDown={
                                isAddressChip
                                  ? (e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        handleCopyAddress(e, addressRaw);
                                      }
                                    }
                                  : undefined
                              }
                              title={isAddressChip ? (addressCopied ? 'Copied' : 'Copy address') : undefined}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${toneClass}`}
                            >
                              <span className="text-current/70">{chip.icon}</span>
                              <span className={isAddressChip ? 'truncate underline decoration-white/15 underline-offset-2' : 'truncate'}>
                                {addressCopied ? 'Copied' : chip.text}
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    ) : suggestion.secondary ? (
                      <span className="block text-[12px] text-white/55 truncate">{suggestion.secondary}</span>
                    ) : null}
                  </span>

                  {isActive && (
                    <span className="shrink-0 text-[10px] font-bold tracking-[0.22em] text-white/35 border border-white/10 bg-white/5 px-2 py-1 rounded-lg">
                      ↵
                    </span>
                  )}

                  <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold tracking-[0.22em] border ${
                    isActive ? 'bg-cyan-500/10 border-cyan-400/20 text-cyan-200/80' : 'bg-white/5 border-white/10 text-white/45'
                  }`}>
                    {kindLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function getNodeSymbolLabel(node: GalaxyNode): string {
  const data = node.data as Record<string, unknown>;
  const symbol = typeof data.symbol === "string" && data.symbol.trim().length > 0
    ? data.symbol
    : null;
  const name = typeof data.name === "string" && data.name.trim().length > 0
    ? data.name
    : null;
  return symbol ?? name ?? node.id.toUpperCase();
}

type QualityOverride = "full" | "lite" | null;

function evaluateQualityMode(override: QualityOverride): { mode: QualityMode; reasons: string[] } {
  if (override === "full" || override === "lite") {
    return {
      mode: override,
      reasons: ["URL override"],
    };
  }

  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { mode: "full", reasons: [] };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };

  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 0;
  const touchProfile = Boolean(nav.maxTouchPoints && nav.maxTouchPoints > 1) || Boolean(nav.userAgentData?.mobile);
  const deviceMemory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined;
  const dpr = typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1;
  const viewportWidth = typeof window.innerWidth === "number" ? window.innerWidth : 1920;
  const reducedMotion = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  const triggers = {
    touch: touchProfile,
    cores: cores > 0 && cores <= 6,
    memory: typeof deviceMemory === "number" && deviceMemory <= 4,
    reducedMotion,
    viewportDensity: viewportWidth <= 1024 && dpr >= 2.5,
  };

  const shouldLite = Object.values(triggers).some(Boolean);

  if (!shouldLite) {
    return { mode: "full", reasons: [] };
  }

  const reasons: string[] = [];
  if (triggers.touch) reasons.push("Touch input profile");
  if (triggers.cores) reasons.push(`${cores || "?"} logical cores reported`);
  if (triggers.memory && typeof deviceMemory === "number") reasons.push(`${deviceMemory}GB device memory profile`);
  if (triggers.reducedMotion) reasons.push("Prefers reduced motion");
  if (triggers.viewportDensity) reasons.push(`Viewport ${viewportWidth}px @ ${dpr.toFixed(1)}× DPR`);

  return { mode: "lite", reasons };
}

// ============================================================================
// PERFORMANCE OPTIMIZATIONS (agar.io inspired):
// 1. NO Framer Motion - direct CSS transforms only
// 2. Minimal re-renders with proper memoization
// 3. GPU-accelerated transforms with translate3d
// 4. Simplified DOM structure
// ============================================================================

// --- Planet/Sun Component ---
const PlanetNode = ({ 
  node,
  weightMode,
  detailLevel,
}: { 
  node: GalaxyNode;
  weightMode: WeightMode;
  detailLevel: number;
}) => {
  const [isRatioHovered, setIsRatioHovered] = useState(false);
  const isSun = node.type === 'sun';
  const size = node.radius * 2;
  const glowIntensity = node.collisionGlow || 0;
  const metricDisplay = getNodeMetricDisplay(node, weightMode);
  const detailTier = isSun ? 'full' : getDetailTier(detailLevel, DETAIL_THRESHOLDS.planet);

  // Get symbol, price, and icon from data
  const symbol = ('symbol' in node.data ? node.data.symbol : null) 
    || ('name' in node.data ? node.data.name : null) 
    || 'BTC';
  
  const price = ('price' in node.data && typeof node.data.price === 'number') 
    ? node.data.price 
    : null;

  const icon = ('icon' in node.data && typeof node.data.icon === 'string')
    ? node.data.icon
    : null;

  const priceDisplay = price !== null
    ? (price < 1 
        ? `$${price.toPrecision(4)}` 
        : `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    : null;

  // Size ratio display - hover to toggle between "x > next" and "x to BTC"
  const formatMultiplier = (mult: number) => {
    if (mult >= 1000000) return `${(mult / 1000000).toFixed(1)}M`;
    if (mult >= 1000) return `${(mult / 1000).toFixed(1)}K`;
    return mult.toFixed(1);
  };
  
  // Check if this node CAN show the alternate "x to BTC" view (not sun, has sunMultiplier)
  const hasAlternateView = !isSun && !!node.sunMultiplier && node.sunMultiplier > 1;
  
  // Determine which view to show based on hover state
  const showSunMultiplier = isRatioHovered && hasAlternateView;
  
  let sizeRatioDisplay: string | null = null;
  
  if (showSunMultiplier) {
    // Show "Xx to BTC" mode on hover
    sizeRatioDisplay = `${formatMultiplier(node.sunMultiplier!)}x → BTC`;
  } else if (node.sizeRatio && node.nextEntitySymbol && node.sizeRatio > 1.01) {
    // Show default "x > next" mode
    sizeRatioDisplay = `${node.sizeRatio.toFixed(2)}x > ${node.nextEntitySymbol}`;
  }

  const fontSize = Math.max(planetLabelConfig.tickerMin, Math.round(size * planetLabelConfig.tickerScale));
  const priceFontSize = Math.max(planetLabelConfig.priceMin, Math.round(size * planetLabelConfig.priceScale));
  const ratioFontSize = Math.max(planetLabelConfig.ratioMin, Math.round(size * planetLabelConfig.ratioScale));
  const iconSize = Math.max(planetLabelConfig.iconMin, Math.round(size * planetLabelConfig.iconScale));
  const metricFontSize = Math.max(planetLabelConfig.metricMin, Math.round(size * planetLabelConfig.metricScale));
  const metricColor = metricDisplay?.accent ?? '#f8fafc';

  const showIcon = Boolean(icon) && (planetLabelConfig.alwaysShowIcon || detailTier !== 'minimal');
  const showPriceDetail = detailTier !== 'minimal' && Boolean(priceDisplay);
  const showMetricDetail = detailTier === 'full' && Boolean(metricDisplay);
  const showRatioDetail = detailTier === 'full' && Boolean(sizeRatioDisplay);

  const tickerShadow = detailTier === 'full'
    ? '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000'
    : detailTier === 'medium'
      ? '2px 2px 0 #000, -2px -2px 0 #000'
      : '1px 1px 0 #000';
  const supportingShadow = detailTier === 'full'
    ? '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000'
    : detailTier === 'medium'
      ? '1px 1px 0 #000, -1px -1px 0 #000'
      : '1px 1px 0 #000';

  return (
    <div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        transform: 'translate(-50%, -50%)',
        zIndex: isSun ? 10 : 20,
      }}
    >
      {/* Corona for sun */}
      {isSun && (
        <div
          style={{
            position: 'absolute',
            width: size * 3,
            height: size * 3,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(251, 191, 36, 0.2) 0%, rgba(217, 119, 6, 0.05) 50%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
      )}
      
      {/* Main body */}
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '50%',
          background: isSun
            ? 'radial-gradient(circle at 30% 30%, #fbbf24, #d97706)'
            : node.color.includes('gradient') 
              ? node.color 
              : `linear-gradient(135deg, ${node.color}, ${node.color}dd)`,
          boxShadow: isSun
            ? '0 0 60px 25px rgba(251, 191, 36, 0.5), inset 0 0 20px rgba(255,255,255,0.2)'
            : glowIntensity > 0.05 
              ? `0 0 20px rgba(255,255,255,${glowIntensity * 0.5})`
              : '0 0 15px rgba(255,255,255,0.15)',
          border: isSun ? '2px solid rgba(255,200,100,0.3)' : '1px solid rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Background icon - behind text, centered, 50% opacity */}
        {showIcon && icon && (
          <img
            src={icon}
            alt=""
            style={{
              position: 'absolute',
              width: iconSize,
              height: iconSize,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: 0.4,
              zIndex: 0,
              pointerEvents: 'none',
              borderRadius: '50%',
            }}
          />
        )}
        <span
          style={{
            fontSize,
            fontWeight: 800,
            color: uiConfig.planetTickerColor,
            textShadow: tickerShadow,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            letterSpacing: '-0.02em',
            lineHeight: 1,
            zIndex: 1,
            position: 'relative',
          }}
        >
          {symbol}
        </span>
        {showPriceDetail && priceDisplay && (
          <span
            style={{
              fontSize: priceFontSize,
              fontWeight: 700,
              color: uiConfig.planetPriceColor,
              textShadow: supportingShadow,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              marginTop: 8,
              lineHeight: 1,
              zIndex: 1,
              position: 'relative',
            }}
          >
            {priceDisplay}
          </span>
        )}
        {showMetricDetail && metricDisplay && (
          <span
            style={{
              fontSize: metricFontSize,
              fontWeight: 700,
              color: metricColor,
              textShadow: supportingShadow,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              marginTop: 6,
              lineHeight: 1,
              zIndex: 1,
              position: 'relative',
              letterSpacing: '0.01em',
            }}
          >
            {formatMetricLine(metricDisplay)}
          </span>
        )}
        {/* Size ratio display - hover to toggle view */}
        {showRatioDetail && sizeRatioDisplay && (
          <span
            onMouseEnter={hasAlternateView ? () => setIsRatioHovered(true) : undefined}
            onMouseLeave={hasAlternateView ? () => setIsRatioHovered(false) : undefined}
            style={{
              fontSize: ratioFontSize,
              fontWeight: 700,
              color: showSunMultiplier ? '#f59e0b' : uiConfig.planetSizeRatioColor,
              textShadow: supportingShadow,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              marginTop: 8,
              lineHeight: 1,
              zIndex: 100,
              position: 'relative',
              opacity: 0.9,
              cursor: hasAlternateView ? 'pointer' : 'default',
              transition: 'color 0.2s ease',
              pointerEvents: 'auto',
            }}
          >
            {sizeRatioDisplay}
          </span>
        )}
      </div>
    </div>
  );
};

// --- Moon Component ---
const MoonNode = ({ 
  node,
  weightMode,
  detailLevel,
}: { 
  node: GalaxyNode;
  weightMode: WeightMode;
  detailLevel: number;
}) => {
  const [isRatioHovered, setIsRatioHovered] = useState(false);
  const size = node.radius * 2; // diameter
  const ticker = 'symbol' in node.data ? node.data.symbol : '';
  const price = ('price' in node.data && typeof node.data.price === 'number') ? node.data.price : null;
  const icon = ('icon' in node.data && typeof node.data.icon === 'string') ? node.data.icon : null;
  const glowIntensity = node.collisionGlow || 0;
  const metricDisplay = getNodeMetricDisplay(node, weightMode);
  const detailTier = getDetailTier(detailLevel, DETAIL_THRESHOLDS.moon);

  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${(p / 1000).toFixed(1)}k`;
    if (p >= 1) return `$${p.toFixed(2)}`;
    if (p >= 0.01) return `$${p.toFixed(4)}`;
    if (p >= 0.0001) return `$${p.toFixed(6)}`;
    return `$${p.toPrecision(3)}`;
  };
  
  // Format large multipliers (K, M)
  const formatMultiplier = (mult: number) => {
    if (mult >= 1000000) return `${(mult / 1000000).toFixed(1)}M`;
    if (mult >= 1000) return `${(mult / 1000).toFixed(1)}K`;
    return mult.toFixed(1);
  };

  // Improved font sizing: scale proportionally with moon size
  // Larger moons should have larger, more readable text
  const tickerLen = Math.max(1, ticker.length);
  
  // Base font size scales with diameter - use 28% of diameter as baseline
  // Longer tickers get slightly smaller font but not as aggressively
  const lengthFactor = Math.max(0.6, 1 - (tickerLen - 3) * 0.06); // 3-char = 1.0, 5-char = 0.88, 7-char = 0.76
  const baseFontSize = size * moonLabelConfig.tickerScale * lengthFactor;
  const fontSize = Math.max(
    moonLabelConfig.tickerMin,
    Math.min(moonLabelConfig.tickerMax, Math.round(baseFontSize))
  );
  const priceFontSize = Math.max(
    moonLabelConfig.priceMin,
    Math.min(moonLabelConfig.priceMax, Math.round(fontSize * moonLabelConfig.priceScale))
  );
  const ratioFontSize = Math.max(
    moonLabelConfig.ratioMin,
    Math.min(moonLabelConfig.ratioMax, Math.round(fontSize * moonLabelConfig.ratioScale))
  );
  const metricFontSize = Math.max(
    moonLabelConfig.metricMin,
    Math.min(moonLabelConfig.metricMax, Math.round(fontSize * moonLabelConfig.metricScale))
  );
  
  // Icon scales with moon size
  const iconSize = Math.max(moonLabelConfig.iconMin, Math.round(size * moonLabelConfig.iconScale));
  
  // Only show price on larger moons where it's readable
  const canShowPrice = size > 35 && fontSize >= 12;
  const canShowMetric = Boolean(metricDisplay) && (size > 24 || detailLevel >= DETAIL_THRESHOLDS.moon.medium);
  
  // Size ratio display - hover to toggle between "x > next" and "x to BTC"
  // Check if this node CAN show the alternate "x to BTC" view
  const hasAlternateView = !!node.sunMultiplier && node.sunMultiplier > 1;
  
  // Determine which view to show based on hover state
  const showSunMultiplier = isRatioHovered && hasAlternateView;
  
  let sizeRatioDisplay: string | null = null;
  
  if (showSunMultiplier) {
    // Show "Xx to BTC" mode on hover
    sizeRatioDisplay = `${formatMultiplier(node.sunMultiplier!)}x → BTC`;
  } else if (node.sizeRatio && node.nextEntitySymbol && node.sizeRatio > 1.01) {
    // Show default "x > next" mode
    sizeRatioDisplay = `${node.sizeRatio.toFixed(2)}x > ${node.nextEntitySymbol}`;
  }

  const showIcon = Boolean(icon) && (moonLabelConfig.alwaysShowIcon || detailTier !== 'minimal');
  const showPriceDetail = detailTier !== 'minimal' && canShowPrice && price !== null;
  const showMetricDetail = detailTier !== 'minimal' && canShowMetric && Boolean(metricDisplay);
  const showRatioDetail = detailTier === 'full' && Boolean(sizeRatioDisplay);

  const tickerShadow = detailTier === 'full'
    ? '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000'
    : detailTier === 'medium'
      ? '1px 1px 0 #000, -1px -1px 0 #000'
      : '1px 1px 0 #000';
  const supportingShadow = detailTier === 'full'
    ? '1px 1px 0 #000, -1px -1px 0 #000'
    : '1px 1px 0 #000';

  return (
    <div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        transform: 'translate(-50%, -50%)',
        zIndex: 30,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: node.color,
          border: '1px solid rgba(255,255,255,0.3)',
          boxShadow: glowIntensity > 0.05 
            ? `0 0 ${10 + glowIntensity * 15}px rgba(255,255,255,${glowIntensity * 0.5})` 
            : '0 0 8px rgba(0,0,0,0.5), inset 0 -2px 6px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Background icon for moons */}
        {showIcon && icon && (
          <img
            src={icon}
            alt=""
            style={{
              position: 'absolute',
              width: iconSize,
              height: iconSize,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: 0.35,
              zIndex: 0,
              pointerEvents: 'none',
              borderRadius: '50%',
            }}
          />
        )}
        {ticker && (
          <>
            <span
              style={{
                fontSize,
                fontWeight: 800,
                color: uiConfig.planetTickerColor,
                textShadow: tickerShadow,
                lineHeight: 1.1,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                letterSpacing: '-0.01em',
                zIndex: 1,
                position: 'relative',
              }}
            >
              {ticker}
            </span>
            {showPriceDetail && price !== null && (
              <span
                style={{
                  fontSize: priceFontSize,
                  fontWeight: 700,
                  color: uiConfig.planetPriceColor,
                  textShadow: supportingShadow,
                  lineHeight: 1.1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  zIndex: 1,
                  position: 'relative',
                }}
              >
                {formatPrice(price)}
              </span>
            )}
            {showMetricDetail && metricDisplay && (
              <span
                style={{
                  fontSize: metricFontSize,
                  fontWeight: 600,
                  color: metricDisplay.accent,
                  textShadow: supportingShadow,
                  lineHeight: 1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  zIndex: 1,
                  position: 'relative',
                  marginTop: 2,
                  letterSpacing: '0.01em',
                }}
              >
                {formatMetricLine(metricDisplay)}
              </span>
            )}
            {showRatioDetail && sizeRatioDisplay && (
              <span
                onMouseEnter={hasAlternateView ? () => setIsRatioHovered(true) : undefined}
                onMouseLeave={hasAlternateView ? () => setIsRatioHovered(false) : undefined}
                style={{
                  fontSize: ratioFontSize,
                  fontWeight: 600,
                  color: showSunMultiplier ? '#f59e0b' : uiConfig.planetSizeRatioColor,
                  textShadow: supportingShadow,
                  lineHeight: 1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  zIndex: 100,
                  position: 'relative',
                  marginTop: 2,
                  opacity: 0.9,
                  cursor: hasAlternateView ? 'pointer' : 'default',
                  transition: 'color 0.2s ease',
                  pointerEvents: 'auto',
                }}
              >
                {sizeRatioDisplay}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// --- Orbit Ring ---
const OrbitRing = memo(({ radius }: { radius: number }) => (
  <div
    style={{
      position: 'absolute',
      left: -radius,
      top: -radius,
      width: radius * 2,
      height: radius * 2,
      borderRadius: '50%',
      border: '1px solid rgba(255,255,255,0.05)',
      pointerEvents: 'none',
    }}
  />
));

OrbitRing.displayName = 'OrbitRing';

// --- Particle Layer for collision effects ---
const ParticleLayer = memo(({ particles }: { particles: readonly Particle[] }) => (
  <>
    {particles.map((p, i) => {
      // Different rendering based on particle type
      if (p.type === 'spark') {
        return (
          <div
            key={`spark-${i}`}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              backgroundColor: p.color,
              opacity: p.alpha,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
        );
      } else if (p.type === 'smoke') {
        return (
          <div
            key={`smoke-${i}`}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${p.color}${Math.round(p.alpha * 80).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
        );
      } else {
        // debris - trail effect
        return (
          <div
            key={`debris-${i}`}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size * 0.5,
              borderRadius: '50%',
              backgroundColor: p.color,
              opacity: p.alpha,
              boxShadow: `0 0 ${p.size}px ${p.color}, ${-p.vx * 0.02}px ${-p.vy * 0.02}px ${p.size * 3}px ${p.color}40`,
              transform: `translate(-50%, -50%) rotate(${Math.atan2(p.vy, p.vx)}rad)`,
              pointerEvents: 'none',
            }}
          />
        );
      }
    })}
  </>
));

ParticleLayer.displayName = 'ParticleLayer';

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CryptoPlanets() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  
  // Track if we've processed the initial URL params
  const initialUrlProcessed = useRef(false);
  const pendingFollowId = useRef<string | null>(null);

  const [renderVersion, setRenderVersion] = useState(0);
  const forceRender = useCallback(() => {
    setRenderVersion((v) => (v + 1) % 1_000_000);
  }, []);
  const [weightMode, setWeightMode] = useState<WeightMode>("MarketCap");
  const [volumeSource, setVolumeSource] = useState<VolumeSource>('dex');
  const [primaryProvider, setPrimaryProvider] = useState<PrimaryProvider>('auto');
  const [apiMeta, setApiMeta] = useState<GalaxyData['meta'] | null>(null);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.05 });
  const camera = cameraRef.current;
  const [isLoading, setIsLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [perfCopied, setPerfCopied] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [showGpuPrototype, setShowGpuPrototype] = useState(false);
  const [chartPickerNodeId, setChartPickerNodeId] = useState<string | null>(null);
  const shouldRenderDomNodes = !showGpuPrototype;
  const domInteractionsDisabled = showGpuPrototype;
  
  // Token filter state (default: hide stablecoins and wrapped)
  const [hideStables, setHideStables] = useState(true);
  const [hideWrapped, setHideWrapped] = useState(true);

  const [showPerfOverlay, setShowPerfOverlay] = useState(false);
  const [perfStats, setPerfStats] = useState({
    fps: 0,
    nodes: 0,
    visibleNodes: 0,
    particles: 0,
    physicsMs: 0,
    cameraMs: 0,
  });
  const [perfSummary, setPerfSummary] = useState({
    sampleCount: 0,
    windowMs: 0,
    avgFps: 0,
    minFps: 0,
    maxFps: 0,
    avgPhysics: 0,
    maxPhysics: 0,
    avgVisibleNodes: 0,
  });
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === "undefined" ? 1920 : window.innerWidth,
    height: typeof window === "undefined" ? 1080 : window.innerHeight,
  }));
  const perfSampleRef = useRef({
    frames: 0,
    lastTimestamp: typeof performance !== 'undefined' ? performance.now() : 0,
    lastPhysics: 0,
    lastCamera: 0,
  });
  const perfSamplesRef = useRef<PerfSample[]>([]);
  const latestVisibleNodesRef = useRef(0);
  const perfSummaryRef = useRef(perfSummary);
  const perfCopyTimeoutRef = useRef<number | null>(null);
  const copyValueTimeoutRef = useRef<number | null>(null);
  const galaxyStateRef = useRef<GalaxyState | null>(null);
  const galaxyState = galaxyStateRef.current;

  const gpuPrototypeNodes = useMemo(() => {
    if (!galaxyState) return [] as GalaxyNode[];
    return [
      galaxyState.sunNode,
      ...galaxyState.planetNodes,
      ...galaxyState.moonNodes,
    ];
  }, [galaxyState, renderVersion]);
  const deckViewState = useMemo(() => {
    const safeZoom = Math.max(camera.zoom, 0.0001);
    const target: [number, number, number] = [
      -camera.x / safeZoom,
      -camera.y / safeZoom,
      0,
    ];
    const deckZoom = Number.isFinite(safeZoom) ? Math.log2(safeZoom) : -4;
    return {
      target,
      zoom: Number.isFinite(deckZoom) ? deckZoom : -7,
    };
  }, [camera.x, camera.y, camera.zoom, renderVersion]);
  const [deviceInfo, setDeviceInfo] = useState<{ cores: number | null; dpr: number }>({
    cores: null,
    dpr: 1,
  });
  const [displayRefreshHz, setDisplayRefreshHz] = useState<number | null>(null);
  const [qualityMode, setQualityMode] = useState<QualityMode>("full");
  const [qualityReasons, setQualityReasons] = useState<string[]>([]);
  
  // Camera follow state
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [targetZoom, setTargetZoom] = useState<number>(0.05);
  const followingIdRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    followingIdRef.current = followingId;
  }, [followingId]);

  // Cinematic transition state
  const transitionRef = useRef<CameraTransition | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Radial menu state
  const [radialMenu, setRadialMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    nodeId: string | null;
    nodeSymbol: string;
    nodeIcon: string | null;
    nodeType: 'sun' | 'planet' | 'moon' | 'meteorite' | null;
    view: 'actions' | 'details';
  }>({ isOpen: false, x: 0, y: 0, nodeId: null, nodeSymbol: '', nodeIcon: null, nodeType: null, view: 'actions' });

  const showRadialMenuForNode = useCallback((node: GalaxyNode, clientX: number, clientY: number) => {
    const data = node.data as unknown as { icon?: unknown };
    const icon = typeof data.icon === 'string' ? data.icon : null;
    setRadialMenu({
      isOpen: true,
      x: clientX,
      y: clientY,
      nodeId: node.id,
      nodeSymbol: getNodeSymbolLabel(node),
      nodeIcon: icon,
      nodeType: node.type,
      view: 'actions',
    });
  }, []);
  
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDeviceInfo({
      cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? null : null,
      dpr: window.devicePixelRatio || 1,
    });
    perfSampleRef.current.lastTimestamp = performance.now();
  }, []);

  // Estimate the active display refresh rate (can't be queried directly in browsers).
  // Uses rAF interval timing while the tab is visible.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return;

    let rafId = 0;
    let last = 0;
    const deltas: number[] = [];

    const computeHz = () => {
      if (deltas.length < 20) return null;
      const sorted = [...deltas].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] || 0;
      if (!Number.isFinite(median) || median <= 0) return null;
      const hz = 1000 / median;
      // Very high refresh rates exist (360/480). Clamp to a sane range.
      return clampNumber(hz, 30, 480);
    };

    const step = (t: number) => {
      if (document.visibilityState !== 'visible') {
        rafId = window.requestAnimationFrame(step);
        return;
      }

      if (last) {
        const dt = t - last;
        // Ignore huge spikes (tab switch / breakpoint / hiccup).
        if (dt > 0.5 && dt < 100) {
          deltas.push(dt);
          if (deltas.length > 120) deltas.shift();
        }

        const hz = computeHz();
        if (hz) {
          setDisplayRefreshHz((prev) => {
            if (!prev) return hz;
            // Avoid thrash from tiny measurement jitter.
            return Math.abs(prev - hz) < 2 ? prev : hz;
          });
        }
      }
      last = t;
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);

    const handleVisibility = () => {
      // Reset sampling when returning to foreground.
      deltas.length = 0;
      last = 0;
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('resize', handleVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('resize', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateViewport = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        setViewportSize(prev => (
          prev.width === rect.width && prev.height === rect.height
            ? prev
            : { width: rect.width, height: rect.height }
        ));
      } else {
        const width = window.innerWidth;
        const height = window.innerHeight;
        setViewportSize(prev => (
          prev.width === width && prev.height === height
            ? prev
            : { width, height }
        ));
      }
    };

    updateViewport();

    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        setViewportSize(prev => (
          prev.width === width && prev.height === height
            ? prev
            : { width, height }
        ));
      });
      observer.observe(containerRef.current);
    } else {
      window.addEventListener('resize', updateViewport);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', updateViewport);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const overrideParam = searchParams.get('quality');
    const override: QualityOverride = overrideParam === 'lite' || overrideParam === 'full' ? overrideParam : null;

    const applyQualityMode = () => {
      const { mode, reasons } = evaluateQualityMode(override);
      setQualityMode(mode);
      setQualityReasons(reasons);
    };

    applyQualityMode();

    if (override) {
      return;
    }

    let resizeFrame = 0;
    const handleResize = () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(applyQualityMode);
    };

    window.addEventListener('resize', handleResize);

    const motionQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    const handleMotionPreference = () => applyQualityMode();

    if (motionQuery) {
      if (typeof motionQuery.addEventListener === 'function') {
        motionQuery.addEventListener('change', handleMotionPreference);
      } else if (typeof motionQuery.addListener === 'function') {
        motionQuery.addListener(handleMotionPreference);
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (motionQuery) {
        if (typeof motionQuery.removeEventListener === 'function') {
          motionQuery.removeEventListener('change', handleMotionPreference);
        } else if (typeof motionQuery.removeListener === 'function') {
          motionQuery.removeListener(handleMotionPreference);
        }
      }
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
    };
  }, [searchParams]);

  // Load + persist primary data provider preference
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('planetchart:primaryProvider');
      if (stored) setPrimaryProvider(normalizePrimaryProvider(stored));
    } catch {
      // ignore
    }
  }, []);

  const updatePrimaryProvider = useCallback((next: PrimaryProvider) => {
    setPrimaryProvider(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('planetchart:primaryProvider', next);
    } catch {
      // ignore
    }
  }, []);
  
  const isCircleVisible = useCallback((x: number, y: number, radius: number) => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return true;
    }

    const halfWidth = viewportSize.width / 2;
    const halfHeight = viewportSize.height / 2;
    const screenX = x * camera.zoom + camera.x;
    const screenY = y * camera.zoom + camera.y;
    const screenRadius = Math.max(radius * camera.zoom, 6);

    // When zoomed in we can aggressively cull off-screen nodes to reduce DOM/paint.
    // When zoomed out we keep a larger buffer to avoid pop-in and preserve context.
    const cullPaddingPx = camera.zoom >= DETAIL_THRESHOLDS.planet.full
      ? 60
      : camera.zoom >= DETAIL_THRESHOLDS.planet.medium
        ? 120
        : VIEW_CULL_PADDING_PX;

    return (
      screenX + screenRadius + cullPaddingPx > -halfWidth &&
      screenX - screenRadius - cullPaddingPx < halfWidth &&
      screenY + screenRadius + cullPaddingPx > -halfHeight &&
      screenY - screenRadius - cullPaddingPx < halfHeight
    );
  }, [camera.x, camera.y, camera.zoom, viewportSize.height, viewportSize.width]);
  
  // Touch gesture state
  const touchRef = useRef<{
    startDistance: number;
    startZoom: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    isPinching: boolean;
    isPanning: boolean;
  }>({
    startDistance: 0,
    startZoom: 1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    isPinching: false,
    isPanning: false,
  });
  
  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 900);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);
  const lastRenderTimeRef = useRef(0);

  // Compute the display name for the currently followed node
  const followingInfo = useMemo(() => {
    const snapshot = galaxyStateRef.current;
    if (!followingId || !snapshot) return null;
    const node = snapshot.nodes.find(n => n.id === followingId);
    if (!node) return null;
    
    const symbol = ('symbol' in node.data ? node.data.symbol : null)
      || ('name' in node.data ? node.data.name : null)
      || followingId.toUpperCase();
    
    return { symbol, type: node.type };
  }, [followingId, renderVersion]);

  const recordPerfSample = useCallback((physicsMs: number, cameraMs: number) => {
    if (!showPerfOverlay || typeof performance === 'undefined') return;
    const sample = perfSampleRef.current;
    const now = performance.now();
    if (!sample.lastTimestamp) sample.lastTimestamp = now;
    sample.frames += 1;
    sample.lastPhysics = physicsMs;
    sample.lastCamera = cameraMs;

    if (now - sample.lastTimestamp >= 300) {
      const elapsed = (now - sample.lastTimestamp) / 1000;
      const fps = sample.frames / Math.max(elapsed, 0.001);
      sample.frames = 0;
      sample.lastTimestamp = now;
      const nodes = galaxyStateRef.current?.nodes.length ?? 0;
      const visibleNodes = latestVisibleNodesRef.current;
      const particles = getParticles().length;
      setPerfStats({
        fps,
        nodes,
        visibleNodes,
        particles,
        physicsMs,
        cameraMs,
      });
      const history = perfSamplesRef.current;
      history.push({
        timestamp: now,
        fps,
        nodes,
        visibleNodes,
        particles,
        physicsMs,
        cameraMs,
      });
      const cutoff = now - PERF_SUMMARY_WINDOW_MS;
      while (history.length && history[0].timestamp < cutoff) {
        history.shift();
      }
      if (history.length) {
        let fpsTotal = 0;
        let physicsTotal = 0;
        let visibleTotal = 0;
        let minFps = Number.POSITIVE_INFINITY;
        let maxFps = 0;
        let maxPhysics = 0;
        for (const entry of history) {
          fpsTotal += entry.fps;
          physicsTotal += entry.physicsMs;
          visibleTotal += entry.visibleNodes;
          if (entry.fps < minFps) minFps = entry.fps;
          if (entry.fps > maxFps) maxFps = entry.fps;
          if (entry.physicsMs > maxPhysics) maxPhysics = entry.physicsMs;
        }
        setPerfSummary({
          sampleCount: history.length,
          windowMs: history.length > 1 ? history[history.length - 1].timestamp - history[0].timestamp : 0,
          avgFps: fpsTotal / history.length,
          minFps: minFps === Number.POSITIVE_INFINITY ? 0 : minFps,
          maxFps,
          avgPhysics: physicsTotal / history.length,
          maxPhysics,
          avgVisibleNodes: visibleTotal / history.length,
        });
      }
    }
  }, [showPerfOverlay]);

  useEffect(() => {
    perfSummaryRef.current = perfSummary;
  }, [perfSummary]);

  useEffect(() => {
    return () => {
      if (perfCopyTimeoutRef.current) {
        clearTimeout(perfCopyTimeoutRef.current);
      }
      if (copyValueTimeoutRef.current) {
        clearTimeout(copyValueTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyPerfSummary = useCallback(() => {
    const summary = perfSummaryRef.current;
    if (!summary.sampleCount) {
      console.warn('No performance samples recorded yet. Open the PERF overlay to begin sampling.');
      return;
    }
    const windowSeconds = Math.max(summary.windowMs, PERF_SUMMARY_WINDOW_MS) / 1000;
    const text = [
      `Perf summary (${windowSeconds.toFixed(1)}s, ${summary.sampleCount} samples)`,
      `FPS avg ${summary.avgFps.toFixed(1)} | min ${summary.minFps.toFixed(1)} | max ${summary.maxFps.toFixed(1)}`,
      `Physics avg ${summary.avgPhysics.toFixed(2)}ms | peak ${summary.maxPhysics.toFixed(2)}ms`,
      `Visible nodes avg ${summary.avgVisibleNodes.toFixed(0)}`,
    ].join('\n');
    console.log(text);

    const acknowledgeCopy = () => {
      setPerfCopied(true);
      if (perfCopyTimeoutRef.current) {
        clearTimeout(perfCopyTimeoutRef.current);
      }
      perfCopyTimeoutRef.current = window.setTimeout(() => setPerfCopied(false), 1800);
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(acknowledgeCopy)
        .catch(() => {
          console.warn('Unable to copy performance summary to clipboard.');
          acknowledgeCopy();
        });
    } else {
      acknowledgeCopy();
    }
  }, []);

  // Read URL params on mount to get initial follow target
  useEffect(() => {
    const followParam = searchParams.get('follow');
    const metricParam = searchParams.get('metric');
    const volumeSourceParam = searchParams.get('volumeSource');
    
    if (!initialUrlProcessed.current) {
      // Default to BTC if no follow param specified
      pendingFollowId.current = followParam ? followParam.toLowerCase() : 'btc';
    }
    
    if (metricParam && ['TVL', 'MarketCap', 'Volume24h', 'Change24h'].includes(metricParam)) {
      setWeightMode(metricParam as WeightMode);
    }

    if (volumeSourceParam === 'spot' || volumeSourceParam === 'dex' || volumeSourceParam === 'both') {
      setVolumeSource(volumeSourceParam);
    }
  }, [searchParams]);

  // Track previous filter state to detect changes
  const prevFiltersRef = useRef({ hideStables, hideWrapped, weightMode, qualityMode, volumeSource, primaryProvider });

  const applyQualityBudgets = useCallback((data: GalaxyData): GalaxyData => {
    if (qualityMode !== 'lite') {
      return data;
    }

    const trimmedChains = data.chains
      .slice(0, QUALITY_BUDGETS.lite.maxChains)
      .map(chain => ({
        ...chain,
        tokens: chain.tokens.slice(0, QUALITY_BUDGETS.lite.tokensPerChain),
      }));

    return {
      ...data,
      chains: trimmedChains,
    };
  }, [qualityMode]);

  useEffect(() => {
    const cap = qualityMode === 'lite'
      ? QUALITY_BUDGETS.lite.particleCap
      : QUALITY_BUDGETS.full.particleCap;
    setParticleBudget(cap);
  }, [qualityMode]);
  
  // Initialize galaxy - only full reinit on weight mode change
  // Filter changes use cached data for instant switch
  useEffect(() => {
    const prevFilters = prevFiltersRef.current;
    const isWeightModeChange = prevFilters.weightMode !== weightMode;
    const isQualityModeChange = prevFilters.qualityMode !== qualityMode;
    const isVolumeSourceChange = prevFilters.volumeSource !== volumeSource;
    const isPrimaryProviderChange = prevFilters.primaryProvider !== primaryProvider;
    
    // Update ref
    prevFiltersRef.current = { hideStables, hideWrapped, weightMode, qualityMode, volumeSource, primaryProvider };
    
    async function init() {
      const hadExistingState = !!galaxyStateRef.current;
      const followIdAtStart = followingIdRef.current;

      // Only show loading spinner for weight mode changes (takes longer)
      if (isWeightModeChange || isQualityModeChange || isPrimaryProviderChange || !galaxyStateRef.current) {
        setIsLoading(true);
      }
      
      try {
        const data = await loadGalaxyData(weightMode, { hideStables, hideWrapped }, { volumeSource, primaryProvider });
        setApiMeta(data.meta || null);
        const shapedData = applyQualityBudgets(data);
        const initialState = initGalaxyState(shapedData);

        galaxyStateRef.current = initialState;

        // Preserve follow across metric/quality changes.
        // If we're currently following something and it still exists, re-center on it.
        // Otherwise, fall back to normal camera reset behavior.
        if (followIdAtStart) {
          const followedNode = initialState.nodes.find(n => n.id === followIdAtStart);
          if (followedNode) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const idealZoom = calculateIdealZoom(
              followedNode.radius,
              followedNode.type as 'sun' | 'planet' | 'moon',
              viewportWidth,
              viewportHeight
            );

            transitionRef.current = null;
            setIsTransitioning(false);
            setFollowingId(followIdAtStart);
            setTargetZoom(idealZoom);
            cameraRef.current = {
              x: -followedNode.x * idealZoom,
              y: -followedNode.y * idealZoom,
              zoom: idealZoom,
            };
          } else {
            // Node disappeared under the new metric/filter/budget; release follow.
            transitionRef.current = null;
            setIsTransitioning(false);
            setFollowingId(null);
          }
        } else if (isWeightModeChange || isQualityModeChange || isPrimaryProviderChange || !hadExistingState || (weightMode === 'Volume24h' && isVolumeSourceChange)) {
          // Only reset camera on fresh init or major mode changes when not following.
          cameraRef.current = { x: 0, y: 0, zoom: 0.03 };
          setTargetZoom(0.03);
          transitionRef.current = null;
          setIsTransitioning(false);
        }

        forceRender();
      } catch (e) {
        console.error("Failed to init galaxy:", e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [weightMode, volumeSource, hideStables, hideWrapped, qualityMode, primaryProvider, applyQualityBudgets, forceRender]);
  
  // Process pending follow from URL after galaxy is loaded
  useEffect(() => {
    const snapshot = galaxyStateRef.current;
    if (snapshot && pendingFollowId.current && !initialUrlProcessed.current) {
      initialUrlProcessed.current = true;
      const targetId = pendingFollowId.current;
      pendingFollowId.current = null;
      
      // Find the node - could be sun, planet, or moon
      const node = snapshot.nodes.find(n => n.id === targetId);
      if (node) {
        // Use direct positioning instead of cinematic transition for URL loads
        // This gives immediate focus without the swoosh animation
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const idealZoom = calculateIdealZoom(node.radius, node.type as 'sun' | 'planet' | 'moon', viewportWidth, viewportHeight);
        
        cameraRef.current = {
          x: -node.x * idealZoom,
          y: -node.y * idealZoom,
          zoom: idealZoom
        };
        forceRender();
        setTargetZoom(idealZoom);
        setFollowingId(targetId);
      }
    }
  }, [renderVersion, forceRender]);

  // Animation loop with camera follow and cinematic transitions
  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const targetHz = qualityMode === 'lite' || prefersReducedMotion
      ? 30
      : clampNumber(displayRefreshHz ?? 120, 60, 480);
    const renderFrameInterval = 1000 / targetHz;

    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined && galaxyStateRef.current) {
        const deltaTime = time - previousTimeRef.current;
        const dt = Math.min(deltaTime, 32) / 16.67;

        const perfAvailable = typeof performance !== 'undefined';
        const physicsStart = perfAvailable ? performance.now() : 0;
        tickGalaxy(galaxyStateRef.current, dt);
        const physicsDuration = perfAvailable ? performance.now() - physicsStart : 0;
        const cameraStart = perfAvailable ? performance.now() : 0;
        let cameraDuration = 0;
        
        // Handle cinematic transition (takes priority over regular follow)
        if (transitionRef.current?.active && galaxyStateRef.current) {
          const targetNode = galaxyStateRef.current.nodes.find(
            n => n.id === transitionRef.current?.targetNodeId
          );
          
          if (targetNode) {
            const result = updateCinematicTransition(
              transitionRef.current,
              time,
              targetNode.x,
              targetNode.y
            );
            
            cameraRef.current = result.camera;
            transitionRef.current = result.transition;
            
            if (result.complete) {
              // Transition complete - switch to regular follow mode
              setIsTransitioning(false);
              setTargetZoom(result.camera.zoom);
            }
          }
        }
        // Regular follow mode (after transition completes)
        else if (followingId && galaxyStateRef.current && !isTransitioning) {
          const targetNode = galaxyStateRef.current.nodes.find(n => n.id === followingId);
          if (targetNode) {
            const prevCamera = cameraRef.current;
            const updated = updateFollowCamera(
              prevCamera,
              targetNode.x,
              targetNode.y,
              prevCamera.zoom,
              CAMERA_CONFIG.followLerpSpeed
            );

            // Also smoothly interpolate zoom to target
            const zoomDiff = targetZoom - prevCamera.zoom;
            const newZoom = prevCamera.zoom + zoomDiff * CAMERA_CONFIG.zoomLerpSpeed;

            cameraRef.current = { ...updated, zoom: newZoom };
          }
        }
        if (perfAvailable) {
          cameraDuration = performance.now() - cameraStart;
        }
        recordPerfSample(physicsDuration, cameraDuration);

        const timeSinceRender = time - lastRenderTimeRef.current;
        if (timeSinceRender >= renderFrameInterval) {
          lastRenderTimeRef.current = time;
          forceRender();
        }
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [followingId, targetZoom, isTransitioning, qualityMode, displayRefreshHz, recordPerfSample, forceRender]);

  // Handle follow planet - from HUD or radial menu
  // Uses cinematic "swoosh" transition: zoom out → pan via center → zoom in
  const handleFollowPlanet = useCallback((nodeId: string | null) => {
    if (nodeId === null) {
      // Release camera - cancel any transition and update URL
      transitionRef.current = null;
      setIsTransitioning(false);
      setFollowingId(null);
      
      // Update URL to remove follow param
      const url = new URL(window.location.href);
      url.searchParams.delete('follow');
      window.history.replaceState({}, '', url.toString());
      return;
    }

    const node = galaxyStateRef.current?.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Update URL with follow param
    const url = new URL(window.location.href);
    url.searchParams.set('follow', nodeId);
    window.history.replaceState({}, '', url.toString());
    
    // Get sun position for centering during transition
    const sunNode = galaxyStateRef.current?.sunNode;
    const sunX = sunNode?.x ?? 0;
    const sunY = sunNode?.y ?? 0;
    
    // Calculate ideal zoom for this node
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const idealZoom = calculateIdealZoom(node.radius, node.type as 'sun' | 'planet' | 'moon', viewportWidth, viewportHeight);

    const cameraSnapshot = cameraRef.current;
    const halfWidth = viewportWidth / 2;
    const halfHeight = viewportHeight / 2;
    const screenX = node.x * cameraSnapshot.zoom + cameraSnapshot.x;
    const screenY = node.y * cameraSnapshot.zoom + cameraSnapshot.y;
    const screenRadius = Math.max(node.radius * cameraSnapshot.zoom, 40);
    const margin = 120;
    const overlapHoriz = screenX + screenRadius > -halfWidth + margin && screenX - screenRadius < halfWidth - margin;
    const overlapVert = screenY + screenRadius > -halfHeight + margin && screenY - screenRadius < halfHeight - margin;
    const screenDistance = Math.hypot(screenX, screenY);
    const nodeCloseToCenter = screenDistance < Math.min(halfWidth, halfHeight) * 0.35;
    const nodeWithinView = nodeCloseToCenter || (overlapHoriz && overlapVert);

    const zoomCloseEnough = Math.abs(cameraSnapshot.zoom - idealZoom) <= Math.max(idealZoom * 0.6, 0.02);
    const alreadyFollowing = followingIdRef.current === nodeId && !transitionRef.current?.active;

    if ((nodeWithinView && zoomCloseEnough) || alreadyFollowing) {
      transitionRef.current = null;
      setIsTransitioning(false);
      setFollowingId(nodeId);
      setTargetZoom(idealZoom);
      return;
    }
    
    // Start cinematic transition
    transitionRef.current = createCinematicTransition(
      cameraRef.current,
      node.x,
      node.y,
      nodeId,
      idealZoom,
      sunX,
      sunY
    );
    
    setIsTransitioning(true);
    setFollowingId(nodeId);
    setTargetZoom(idealZoom);
  }, []);

  // Camera wheel zoom - disabled when GPU deck controller is active
  useEffect(() => {
    if (domInteractionsDisabled) {
      return;
    }

    const clampZoom = (value: number) =>
      Math.max(CAMERA_CONFIG.minZoom, Math.min(CAMERA_CONFIG.maxZoom, value));

    const handleWheel = (e: WheelEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // Allow scrolling within UI overlays (e.g., the Navigate list) without zooming the universe.
      if (isUiEventTarget(e.target)) {
        return;
      }

      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 0.88 : 1.12;
      const currentZoom = cameraRef.current?.zoom ?? CAMERA_CONFIG.minZoom;
      const nextZoom = clampZoom(currentZoom * zoomFactor);
      const currentFollowingId = followingIdRef.current;

      if (currentFollowingId && galaxyStateRef.current) {
        const targetNode = galaxyStateRef.current.nodes.find(n => n.id === currentFollowingId);
        if (!targetNode) return;

        setTargetZoom(nextZoom);
        cameraRef.current = {
          x: -targetNode.x * nextZoom,
          y: -targetNode.y * nextZoom,
          zoom: nextZoom,
        };
        forceRender();
        return;
      }

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const prev = cameraRef.current;
      const prevZoom = prev.zoom || 0.0001;
      const zoomRatio = nextZoom / prevZoom;
      const newX = mouseX - (mouseX - prev.x) * zoomRatio;
      const newY = mouseY - (mouseY - prev.y) * zoomRatio;
      cameraRef.current = { x: newX, y: newY, zoom: nextZoom };
      forceRender();

      setTargetZoom(nextZoom);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [domInteractionsDisabled, forceRender]);

  const openRadialMenuAt = useCallback((clientX: number, clientY: number) => {
    const snapshot = galaxyStateRef.current;
    if (!snapshot) return false;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return false;

    const cameraSnapshot = cameraRef.current;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const screenX = clientX - rect.left - centerX;
    const screenY = clientY - rect.top - centerY;
    const worldX = (screenX - cameraSnapshot.x) / cameraSnapshot.zoom;
    const worldY = (screenY - cameraSnapshot.y) / cameraSnapshot.zoom;

    const allNodes = [
      ...snapshot.moonNodes,
      ...snapshot.planetNodes,
      snapshot.sunNode,
    ];

    const minHitRadius = 15 / cameraSnapshot.zoom;

    for (const node of allNodes) {
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = Math.max(node.radius * 1.2, minHitRadius);

      if (dist < hitRadius) {
        showRadialMenuForNode(node, clientX, clientY);
        return true;
      }
    }

    setRadialMenu(prev => ({ ...prev, isOpen: false }));
    return false;
  }, [showRadialMenuForNode]);

  const handleDeckNodePick = useCallback((payload: {
    node: GalaxyNode;
    x: number;
    y: number;
    isRightClick: boolean;
  }) => {
    showRadialMenuForNode(payload.node, payload.x, payload.y);
  }, [showRadialMenuForNode]);

  const handleDeckViewChange = useCallback((next: { target: [number, number, number]; zoom: number }) => {
    const exponentialZoom = Math.pow(2, next.zoom);
    const clampedZoom = Math.max(CAMERA_CONFIG.minZoom, Math.min(CAMERA_CONFIG.maxZoom, exponentialZoom));
    cameraRef.current = {
      ...cameraRef.current,
      x: -next.target[0] * clampedZoom,
      y: -next.target[1] * clampedZoom,
      zoom: clampedZoom,
    };
    setTargetZoom(clampedZoom);
    forceRender();
  }, [forceRender]);


  // Drag handling
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const mouseDownMetaRef = useRef({ button: -1, startX: 0, startY: 0, moved: false });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isUiEventTarget(e.target)) {
      mouseDownMetaRef.current = { button: e.button, startX: e.clientX, startY: e.clientY, moved: true };
      return;
    }

    mouseDownMetaRef.current = { button: e.button, startX: e.clientX, startY: e.clientY, moved: e.button !== 0 };

    if (e.button === 0) { // Left click only
      setIsDragging(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    
    // If dragging while following or transitioning, cancel and release
    if (followingId || isTransitioning) {
      transitionRef.current = null;
      setIsTransitioning(false);
      setFollowingId(null);
    }
    
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    const meta = mouseDownMetaRef.current;
    if (meta.button === 0 && !meta.moved) {
      const totalDx = e.clientX - meta.startX;
      const totalDy = e.clientY - meta.startY;
      if (Math.abs(totalDx) > CLICK_DRAG_TOLERANCE_PX || Math.abs(totalDy) > CLICK_DRAG_TOLERANCE_PX) {
        meta.moved = true;
      }
    }

    cameraRef.current = {
      ...cameraRef.current,
      x: cameraRef.current.x + dx,
      y: cameraRef.current.y + dy,
    };
    forceRender();

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [isDragging, followingId, isTransitioning, forceRender]);
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isUiEventTarget(e.target)) {
      setIsDragging(false);
      mouseDownMetaRef.current = { button: -1, startX: 0, startY: 0, moved: false };
      return;
    }

    setIsDragging(false);

    const meta = mouseDownMetaRef.current;
    if (
      meta.button === 0 &&
      e.button === 0 &&
      !meta.moved
    ) {
      openRadialMenuAt(e.clientX, e.clientY);
    }

    mouseDownMetaRef.current = { button: -1, startX: 0, startY: 0, moved: false };
  }, [openRadialMenuAt]);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    mouseDownMetaRef.current = { button: -1, startX: 0, startY: 0, moved: false };
  }, []);

  // ============================================================================
  // TOUCH GESTURE HANDLERS (Mobile)
  // ============================================================================
  
  // Helper to get distance between two touch points
  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);
  
  // Helper to get center point between two touches
  const getTouchCenter = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) {
      return { x: touches[0].clientX, y: touches[0].clientY };
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }, []);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Prevent default to avoid browser zoom/scroll
    if (e.touches.length >= 2) {
      e.preventDefault();
    }
    
    const touch = touchRef.current;
    
    if (e.touches.length === 2) {
      // Pinch zoom start
      touch.isPinching = true;
      touch.isPanning = false;
      touch.startDistance = getTouchDistance(e.touches);
      touch.startZoom = cameraRef.current.zoom;
      const center = getTouchCenter(e.touches);
      touch.startX = center.x;
      touch.startY = center.y;
      touch.lastX = center.x;
      touch.lastY = center.y;
    } else if (e.touches.length === 1) {
      // Single finger pan
      touch.isPanning = true;
      touch.isPinching = false;
      touch.lastX = e.touches[0].clientX;
      touch.lastY = e.touches[0].clientY;
    }
  }, [getTouchDistance, getTouchCenter]);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = touchRef.current;
    
    if (touch.isPinching && e.touches.length === 2) {
      e.preventDefault();
      
      // Release follow on pinch
      if (followingId || isTransitioning) {
        transitionRef.current = null;
        setIsTransitioning(false);
        setFollowingId(null);
      }
      
      const currentDistance = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      
      // Calculate zoom
      const scale = currentDistance / touch.startDistance;
      const newZoom = Math.max(CAMERA_CONFIG.minZoom, Math.min(CAMERA_CONFIG.maxZoom, touch.startZoom * scale));
      
      // Get container center for zoom origin
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // Pinch center relative to viewport center
      const pinchX = touch.startX - rect.left - centerX;
      const pinchY = touch.startY - rect.top - centerY;
      
      // Zoom to pinch center
      const prevCam = cameraRef.current;
      const zoomRatio = newZoom / prevCam.zoom;
      const newCamX = pinchX - (pinchX - prevCam.x) * zoomRatio;
      const newCamY = pinchY - (pinchY - prevCam.y) * zoomRatio;
      
      // Also apply pan from center movement
      const panX = center.x - touch.lastX;
      const panY = center.y - touch.lastY;
      
      cameraRef.current = {
        x: newCamX + panX,
        y: newCamY + panY,
        zoom: newZoom,
      };
      forceRender();
      
      touch.lastX = center.x;
      touch.lastY = center.y;
    } else if (touch.isPanning && e.touches.length === 1) {
      // Single finger pan
      const dx = e.touches[0].clientX - touch.lastX;
      const dy = e.touches[0].clientY - touch.lastY;
      
      // Release follow on pan
      if (followingId || isTransitioning) {
        transitionRef.current = null;
        setIsTransitioning(false);
        setFollowingId(null);
      }
      
      cameraRef.current = {
        ...cameraRef.current,
        x: cameraRef.current.x + dx,
        y: cameraRef.current.y + dy,
      };
      forceRender();
      
      touch.lastX = e.touches[0].clientX;
      touch.lastY = e.touches[0].clientY;
    }
  }, [followingId, isTransitioning, getTouchDistance, getTouchCenter, forceRender]);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = touchRef.current;
    
    if (e.touches.length === 0) {
      touch.isPinching = false;
      touch.isPanning = false;
    } else if (e.touches.length === 1) {
      // Went from pinch to single finger
      touch.isPinching = false;
      touch.isPanning = true;
      touch.lastX = e.touches[0].clientX;
      touch.lastY = e.touches[0].clientY;
    }
  }, []);

  // Right-click context menu for sun, planets, and moons
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    openRadialMenuAt(e.clientX, e.clientY);
  }, [openRadialMenuAt]);

  // Radial menu items
  const getRadialMenuItems = useCallback(() => {
    const isFollowing = followingId === radialMenu.nodeId;
    
    return [
      {
        id: 'follow',
        label: isFollowing ? 'Following' : 'Follow',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        ),
        onClick: () => handleFollowPlanet(radialMenu.nodeId),
        color: isFollowing ? 'text-cyan-400' : undefined,
      },
      {
        id: 'unfollow',
        label: 'Release',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ),
        onClick: () => handleFollowPlanet(null),
        color: 'text-red-400',
      },
      {
        id: 'info',
        label: 'Details',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4m0-4h.01" />
          </svg>
        ),
        onClick: () => setRadialMenu(prev => ({ ...prev, view: 'details' })),
        closeOnClick: false,
      },
      {
        id: 'isolate',
        label: 'Isolate',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
          </svg>
        ),
        onClick: () => console.log('Isolate:', radialMenu.nodeId),
      },
    ];
  }, [followingId, radialMenu.nodeId, handleFollowPlanet]);

  const radialMenuCenterContent = useMemo(() => {
    const title = radialMenu.nodeSymbol;
    const iconUrl = radialMenu.nodeIcon;
    const typeLabel = radialMenu.nodeType === 'moon' ? 'TOKEN'
      : radialMenu.nodeType === 'planet' ? 'CHAIN'
      : radialMenu.nodeType === 'sun' ? 'SUN'
      : '';

    return (
      <div className="flex flex-col items-center justify-center gap-1">
        <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
          {iconUrl ? (
            <img src={iconUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="text-xs font-bold text-white/70">{String(title).slice(0, 2).toUpperCase()}</div>
          )}
        </div>
        <div className="text-[10px] font-semibold text-white/70 uppercase tracking-wider text-center px-2 leading-tight">
          {title}
        </div>
        {typeLabel && (
          <div className="text-[9px] text-white/35 uppercase tracking-[0.35em]">
            {typeLabel}
          </div>
        )}
      </div>
    );
  }, [radialMenu.nodeIcon, radialMenu.nodeSymbol, radialMenu.nodeType]);

  const radialMenuNode = useMemo(() => {
    const snapshot = galaxyStateRef.current;
    if (!snapshot || !radialMenu.nodeId) return null;
    return snapshot.nodes.find(n => n.id === radialMenu.nodeId) ?? null;
  }, [radialMenu.nodeId, renderVersion]);

  const radialMenuPanelContent = useMemo(() => {
    if (radialMenu.view !== 'details' || !radialMenuNode) return null;

    const typeLabel = radialMenuNode.type === 'moon' ? 'Token'
      : radialMenuNode.type === 'planet' ? 'Chain'
      : radialMenuNode.type === 'sun' ? 'Sun'
      : 'Object';

    const symbol = ('symbol' in radialMenuNode.data ? radialMenuNode.data.symbol : null)
      || ('name' in radialMenuNode.data ? radialMenuNode.data.name : null)
      || radialMenuNode.id.toUpperCase();

    const name = ('name' in radialMenuNode.data ? radialMenuNode.data.name : null) as string | null;
    const icon = (() => {
      const data = radialMenuNode.data as unknown as { icon?: unknown };
      return typeof data.icon === 'string' ? data.icon : null;
    })();

    const tokenData: TokenData | null = radialMenuNode.type === 'moon'
      ? (radialMenuNode.data as TokenData)
      : null;
    const chainData: ChainData | null = radialMenuNode.type === 'planet'
      ? (radialMenuNode.data as ChainData)
      : null;
    const btcData: BTCData | null = radialMenuNode.type === 'sun'
      ? (radialMenuNode.data as BTCData)
      : null;

    const contractAddress = tokenData?.contractAddress;
    const geckoId = tokenData?.geckoId || chainData?.geckoId;
    const parentChainId = radialMenuNode.parentId as string | null;

    const symbolUpper = String(symbol || '').toUpperCase();
    const CMC_SLUG_BY_SYMBOL: Record<string, string> = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      BNB: 'bnb',
      SOL: 'solana',
      XRP: 'xrp',
      ADA: 'cardano',
      DOGE: 'dogecoin',
      TRX: 'tron',
      AVAX: 'avalanche',
      MATIC: 'polygon',
      POL: 'polygon',
    };

    const GECKO_ID_BY_SYMBOL: Record<string, string> = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      BNB: 'bnb',
      SOL: 'solana',
      XRP: 'ripple',
      ADA: 'cardano',
      DOGE: 'dogecoin',
      TRX: 'tron',
      AVAX: 'avalanche-2',
      MATIC: 'polygon',
      POL: 'polygon',
    };

    const TRADINGVIEW_SYMBOL_BY_SYMBOL: Record<string, string> = {
      BTC: 'BTC',
      ETH: 'COINBASE:ETHUSD',
      BNB: 'BINANCE:BNBUSD',
      SOL: 'BINANCE:SOLUSD',
      XRP: 'BINANCE:XRPUSD',
      ADA: 'BINANCE:ADAUSD',
      DOGE: 'BINANCE:DOGEUSD',
      TRX: 'BINANCE:TRXUSD',
      AVAX: 'BINANCE:AVAXUSD',
      MATIC: 'BINANCE:MATICUSD',
      POL: 'BINANCE:POLUSD',
    };

    const fmtUsd = (v: number | undefined) => {
      if (!Number.isFinite(v)) return '—';
      const value = v as number;
      if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
      if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
      if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
      if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
      if (value >= 1) return `$${value.toFixed(2)}`;
      return `$${value.toPrecision(3)}`;
    };

    const fmtPct = (v: number | undefined) => {
      if (!Number.isFinite(v)) return '—';
      const value = v as number;
      const sign = value > 0 ? '+' : '';
      return `${sign}${value.toFixed(2)}%`;
    };

    const guessDexScreenerChain = (chainId: string | null) => {
      if (!chainId) return null;
      const key = chainId.toLowerCase();
      const map: Record<string, string> = {
        ethereum: 'ethereum',
        arbitrum: 'arbitrum',
        optimism: 'optimism',
        polygon: 'polygon',
        base: 'base',
        avalanche: 'avalanche',
        bnb: 'bsc',
        bsc: 'bsc',
        solana: 'solana',
        fantom: 'fantom',
        pulsechain: 'pulsechain',
      };
      return map[key] ?? null;
    };

    const dexChain = guessDexScreenerChain(parentChainId || (chainData?.id as string | undefined) || null);
    const dexUrl = (() => {
      const fromData = tokenData?.dexScreenerUrl;
      if (typeof fromData === 'string' && fromData.length > 0) return fromData;
      return contractAddress && dexChain
        ? `https://dexscreener.com/${dexChain}/${contractAddress}`
        : null;
    })();
    const geckoUrl = (() => {
      const id = geckoId || GECKO_ID_BY_SYMBOL[symbolUpper];
      if (!id) return null;
      return `https://www.coingecko.com/en/coins/${id}`;
    })();

    const tvUrl = symbol
      ? (() => {
          const dexId = tokenData?.dexScreenerDexId;
          const baseSym = tokenData?.dexScreenerBaseSymbol;
          const quoteSym = tokenData?.dexScreenerQuoteSymbol;
          const pairAddr = tokenData?.dexPairAddress;
          if (dexId && baseSym && quoteSym && pairAddr && pairAddr.length >= 6) {
            const tvSymbol = `${dexId.toUpperCase()}:${String(baseSym).toUpperCase()}${String(quoteSym).toUpperCase()}_${pairAddr.slice(0, 6).toUpperCase()}.USD`;
            return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
          }

          const mapped = TRADINGVIEW_SYMBOL_BY_SYMBOL[symbolUpper];
          if (mapped) return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(mapped)}`;

          return `https://www.tradingview.com/symbols/?query=${encodeURIComponent(symbol)}`;
        })()
      : null;

    const cmcUrl = symbol
      ? (() => {
          const slug = CMC_SLUG_BY_SYMBOL[symbolUpper];
          if (slug) return `https://coinmarketcap.com/currencies/${slug}/`;
          return `https://coinmarketcap.com/search/?q=${encodeURIComponent(symbol)}`;
        })()
      : null;

    const matchaUrl = (() => {
      if (!contractAddress) return null;
      const key = String(parentChainId || chainData?.id || '').toLowerCase();
      const map: Record<string, string> = {
        ethereum: 'ethereum',
        arbitrum: 'arbitrum',
        optimism: 'optimism',
        polygon: 'polygon',
        base: 'base',
        avalanche: 'avalanche',
        bnb: 'bnb',
        bsc: 'bnb',
        fantom: 'fantom',
        pulsechain: 'pulsechain',
        solana: 'solana',
      };
      const chainSlug = map[key];
      if (!chainSlug) return null;
      return `https://matcha.xyz/tokens/${chainSlug}/${contractAddress}`;
    })();

    const isChartPickerOpen = chartPickerNodeId === radialMenuNode.id;

    const rows: Array<{ label: string; value: string; copyValue?: string }> = [];

    rows.push({ label: 'Type', value: typeLabel });
    if (name && name.toLowerCase() !== symbol.toLowerCase()) rows.push({ label: 'Name', value: name });

    if (radialMenuNode.type === 'moon') {
      rows.push({ label: 'Price', value: fmtUsd(tokenData?.price) });
      rows.push({ label: '24h', value: fmtPct(tokenData?.change24h) });
      rows.push({ label: 'Liquidity', value: fmtUsd(tokenData?.liquidity) });
      rows.push({ label: 'Volume 24h', value: fmtUsd(tokenData?.volume24h) });
      rows.push({ label: 'Market Cap', value: fmtUsd(tokenData?.marketCap) });
      if (contractAddress) rows.push({ label: 'Address', value: `${contractAddress.slice(0, 6)}…${contractAddress.slice(-4)}`, copyValue: contractAddress });
    } else if (radialMenuNode.type === 'planet') {
      rows.push({ label: 'TVL', value: fmtUsd(chainData?.tvl) });
      rows.push({ label: '24h', value: fmtPct(chainData?.change24h) });
      rows.push({ label: 'Volume 24h', value: fmtUsd(chainData?.volume24h) });
      rows.push({ label: 'Dominance', value: fmtPct(chainData?.dominance) });
    } else if (radialMenuNode.type === 'sun') {
      rows.push({ label: 'Price', value: fmtUsd(btcData?.price) });
      rows.push({ label: '24h', value: fmtPct(btcData?.change24h) });
      rows.push({ label: 'Market Cap', value: fmtUsd(btcData?.marketCap) });
      rows.push({ label: 'Dominance', value: fmtPct(btcData?.dominance) });
    }

    return (
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center">
            {icon ? (
              <img src={icon} alt={symbol} className="w-full h-full object-cover" />
            ) : (
              <div className="text-sm font-bold text-white/80">{String(symbol).slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{symbol}</div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-white/40">{typeLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => setRadialMenu(prev => ({ ...prev, view: 'actions' }))}
            className="ml-auto text-white/40 hover:text-white/70 transition-colors"
            title="Back"
          >
            ←
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">{row.label}</div>
              <div className="flex items-center gap-2">
                <div className="text-[12px] text-white/80 font-semibold text-right">{row.value}</div>
                {row.copyValue && (
                  <button
                    type="button"
                    onClick={() => {
                      const v = row.copyValue;
                      if (!v) return;
                      if (copyValueTimeoutRef.current) clearTimeout(copyValueTimeoutRef.current);
                      const setDone = () => {
                        setCopiedValue(v);
                        copyValueTimeoutRef.current = window.setTimeout(() => setCopiedValue(null), 1200);
                      };

                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(v).then(setDone).catch(setDone);
                      } else {
                        setDone();
                      }
                    }}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[11px] font-semibold hover:bg-white/10"
                    title="Copy address"
                  >
                    {copiedValue === row.copyValue ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => handleFollowPlanet(radialMenuNode.id)}
            className="flex-1 px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-400/25 text-cyan-200 text-xs font-semibold"
          >
            Follow
          </button>
          <button
            type="button"
            onClick={() => handleFollowPlanet(null)}
            className="flex-1 px-3 py-2 rounded-xl bg-red-500/10 border border-red-400/20 text-red-200 text-xs font-semibold"
          >
            Release
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          {(dexUrl || geckoUrl || tvUrl || cmcUrl || matchaUrl) && (
            <button
              type="button"
              onClick={() => setChartPickerNodeId(isChartPickerOpen ? null : radialMenuNode.id)}
              className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-semibold"
            >
              Open chart
            </button>
          )}
        </div>

        {isChartPickerOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {dexUrl && (
              <button
                type="button"
                onClick={() => {
                  window.open(dexUrl, '_blank', 'noopener,noreferrer');
                  setChartPickerNodeId(null);
                }}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-semibold"
              >
                DexScreener
              </button>
            )}
            {geckoUrl && (
              <button
                type="button"
                onClick={() => {
                  window.open(geckoUrl, '_blank', 'noopener,noreferrer');
                  setChartPickerNodeId(null);
                }}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-semibold"
              >
                CoinGecko
              </button>
            )}
            {tvUrl && (
              <button
                type="button"
                onClick={() => {
                  window.open(tvUrl, '_blank', 'noopener,noreferrer');
                  setChartPickerNodeId(null);
                }}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-semibold"
              >
                TradingView
              </button>
            )}
            {cmcUrl && (
              <button
                type="button"
                onClick={() => {
                  window.open(cmcUrl, '_blank', 'noopener,noreferrer');
                  setChartPickerNodeId(null);
                }}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-semibold"
              >
                CoinMarketCap
              </button>
            )}
            {matchaUrl && (
              <button
                type="button"
                onClick={() => {
                  window.open(matchaUrl, '_blank', 'noopener,noreferrer');
                  setChartPickerNodeId(null);
                }}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-xs font-semibold"
              >
                Matcha
              </button>
            )}
          </div>
        )}
      </div>
    );
  }, [radialMenu.view, radialMenuNode, handleFollowPlanet, renderVersion, chartPickerNodeId, copiedValue]);

  if (isLoading || !galaxyState) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  const particles = getParticles();
  const visiblePlanets = galaxyState.planetNodes.filter((node) =>
    isCircleVisible(node.x, node.y, node.radius * 1.35)
  );
  let visibleMoons = galaxyState.moonNodes.filter((node) =>
    isCircleVisible(node.x, node.y, node.radius * 1.5)
  );
  if (
    camera.zoom < moonCullConfig.zoomThreshold &&
    visibleMoons.length > moonCullConfig.maxVisibleMoons
  ) {
    visibleMoons = [...visibleMoons]
      .sort((a, b) => (b.radius || 0) - (a.radius || 0))
      .slice(0, moonCullConfig.maxVisibleMoons);
  }
  const visibleOrbitRings = galaxyState.planetNodes.filter((node) =>
    isCircleVisible(0, 0, node.orbitRadius + node.radius)
  );
  const visibleParticles = particles.filter((particle) =>
    isCircleVisible(particle.x, particle.y, particle.size)
  );
  const visibleNodeCount = 1 + visiblePlanets.length + visibleMoons.length;
  latestVisibleNodesRef.current = visibleNodeCount;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-screen bg-black overflow-hidden select-none ${isMobile ? 'no-touch-select' : ''}`}
      onMouseDown={domInteractionsDisabled ? undefined : handleMouseDown}
      onMouseMove={domInteractionsDisabled ? undefined : handleMouseMove}
      onMouseUp={domInteractionsDisabled ? undefined : handleMouseUp}
      onMouseLeave={domInteractionsDisabled ? undefined : handleMouseLeave}
      onContextMenu={domInteractionsDisabled ? undefined : handleContextMenu}
      onTouchStart={domInteractionsDisabled ? undefined : handleTouchStart}
      onTouchMove={domInteractionsDisabled ? undefined : handleTouchMove}
      onTouchEnd={domInteractionsDisabled ? undefined : handleTouchEnd}
    >
      <Starfield qualityMode={qualityMode} />

      {!isMobile && (
        <FloatingSearch
          nodes={galaxyState.nodes}
          onTarget={(nodeId) => handleFollowPlanet(nodeId)}
        />
      )}

      {showGpuPrototype && (
        <div className="absolute inset-0 z-20 pointer-events-auto" data-menu-ignore="true">
          <DeckGalaxyPrototype
            nodes={gpuPrototypeNodes}
            highlightedId={followingId}
            viewState={deckViewState}
            interactive
            onNodeClick={handleDeckNodePick}
            onViewStateChange={handleDeckViewChange}
            className="w-full h-full"
          />
          <div className="pointer-events-none absolute top-6 right-6 px-4 py-2 rounded-full text-xs font-semibold tracking-[0.3em] uppercase bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200">
            GPU Renderer Active
          </div>
        </div>
      )}

      {/* Galaxy container with camera shake */}
      {shouldRenderDomNodes && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${camera.x + getShakeOffset().x}px, ${camera.y + getShakeOffset().y}px) scale(${camera.zoom})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Center origin wrapper - makes (0,0) the center of the viewport */}
          <div 
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 0,
              height: 0,
            }}
          >
            {/* Orbit rings */}
            {visibleOrbitRings.map(node => (
              <OrbitRing key={`ring-${node.id}`} radius={node.orbitRadius} />
            ))}

            {/* Sun */}
            <PlanetNode 
              key={galaxyState.sunNode.id} 
              node={galaxyState.sunNode}
              weightMode={weightMode}
              detailLevel={camera.zoom}
            />

            {/* Planets */}
            {visiblePlanets.map(node => (
              <PlanetNode 
                key={node.id} 
                node={node}
                weightMode={weightMode}
                detailLevel={camera.zoom}
              />
            ))}

            {/* Moons */}
            {visibleMoons.map(node => (
              <MoonNode 
                key={node.id} 
                node={node}
                weightMode={weightMode}
                detailLevel={camera.zoom}
              />
            ))}

            {/* Collision particle effects */}
            <ParticleLayer particles={visibleParticles} />
          </div>
        </div>
      )}

      {/* Galaxy HUD - Chain Navigation (Desktop only) */}
      {!isMobile && (
        <div data-menu-ignore="true">
          <GalaxyHUD
            planets={galaxyState.planetNodes}
            sun={galaxyState.sunNode}
            followingId={followingId}
            onFollowPlanet={handleFollowPlanet}
            zoom={camera.zoom}
            qualityMode={qualityMode}
            qualityReasons={qualityReasons}
            primaryProvider={primaryProvider}
            onPrimaryProviderChange={updatePrimaryProvider}
            providerMeta={apiMeta || undefined}
          />
        </div>
      )}
      
      {/* Mobile HUD */}
      {isMobile && (
        <div data-menu-ignore="true">
          <MobileHUD
            planets={galaxyState.planetNodes}
            sun={galaxyState.sunNode}
            nodes={galaxyState.nodes}
            followingId={followingId}
            onFollowPlanet={handleFollowPlanet}
            zoom={camera.zoom}
            weightMode={weightMode}
            onWeightModeChange={(newMode) => {
              setWeightMode(newMode);
              const url = new URL(window.location.href);
              if (newMode !== 'MarketCap') {
                url.searchParams.set('metric', newMode);
              } else {
                url.searchParams.delete('metric');
              }

              // Volume source is only meaningful for Volume24h.
              if (newMode === 'Volume24h') {
                url.searchParams.set('volumeSource', volumeSource);
              } else {
                url.searchParams.delete('volumeSource');
              }
              window.history.replaceState({}, '', url.toString());
            }}
            volumeSource={volumeSource}
            onVolumeSourceChange={(source) => {
              setVolumeSource(source);
              const url = new URL(window.location.href);
              url.searchParams.set('volumeSource', source);
              window.history.replaceState({}, '', url.toString());
            }}
            hideStables={hideStables}
            hideWrapped={hideWrapped}
            onToggleStables={() => setHideStables(!hideStables)}
            onToggleWrapped={() => setHideWrapped(!hideWrapped)}
            followingInfo={followingInfo}
            qualityMode={qualityMode}
            qualityReasons={qualityReasons}
            primaryProvider={primaryProvider}
            onPrimaryProviderChange={updatePrimaryProvider}
            providerMeta={apiMeta || undefined}
          />
        </div>
      )}

      {/* Radial Context Menu (Desktop only - mobile uses tap menu) */}
      {!isMobile && (
        <div data-menu-ignore="true">
          <RadialMenu
            isOpen={radialMenu.isOpen}
            x={radialMenu.x}
            y={radialMenu.y}
            items={radialMenu.view === 'details' ? [] : getRadialMenuItems()}
            onClose={() => setRadialMenu(prev => ({ ...prev, isOpen: false, view: 'actions' }))}
            title={radialMenu.nodeSymbol}
            centerContent={radialMenuCenterContent}
            panelContent={radialMenuPanelContent}
          />
        </div>
      )}

      {/* UI Overlay (Desktop only) */}
      {!isMobile && (
        <div data-menu-ignore="true" className="absolute top-0 left-0 w-full h-full pointer-events-none p-6 flex flex-col justify-between z-40">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-6">
              <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-5 border border-white/10 shadow-2xl ml-52">
                <div className="text-[10px] uppercase tracking-[0.35em] text-white/50 font-semibold">
                  CryptoPlanets
                </div>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">
                  Crypto Galaxy
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-white/60 max-w-[34ch]">
                  Explore chains and tokens at true-to-scale footprints across the crypto galaxy.
                </p>
              </div>

              <div className="ml-auto flex flex-col items-end gap-3">
                <select
                  className="pointer-events-auto bg-black/60 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-black/80 transition-colors min-w-[230px] text-sm font-semibold shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                  value={weightMode}
                  onChange={(e) => {
                    const newMode = e.target.value as WeightMode;
                    setWeightMode(newMode);
                    
                    // Update URL with metric param
                    const url = new URL(window.location.href);
                    if (newMode !== 'MarketCap') {
                      url.searchParams.set('metric', newMode);
                    } else {
                      url.searchParams.delete('metric');
                    }

                    // Volume source is only meaningful for Volume24h.
                    if (newMode === 'Volume24h') {
                      url.searchParams.set('volumeSource', volumeSource);
                    } else {
                      url.searchParams.delete('volumeSource');
                    }
                    window.history.replaceState({}, '', url.toString());
                  }}
                >
                  <option value="TVL"> TVL</option>
                  <option value="MarketCap">Size by Market Cap</option>
                  <option value="Volume24h">Size by 24H Volume</option>
                  <option value="Change24h">Size by 24h Change</option>
                </select>

                {weightMode === 'Volume24h' && (
                  <div className="pointer-events-auto flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-white/50">Volume</span>
                    <div className="flex rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setVolumeSource('dex');
                          const url = new URL(window.location.href);
                          url.searchParams.set('volumeSource', 'dex');
                          window.history.replaceState({}, '', url.toString());
                        }}
                        aria-pressed={volumeSource === 'dex'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          volumeSource === 'dex'
                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                        title="DEX volume (DefiLlama)"
                      >
                        DEX
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVolumeSource('both');
                          const url = new URL(window.location.href);
                          url.searchParams.set('volumeSource', 'both');
                          window.history.replaceState({}, '', url.toString());
                        }}
                        aria-pressed={volumeSource === 'both'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          volumeSource === 'both'
                            ? 'bg-white/10 text-white border border-white/20'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                        title="Combined DEX + CEX volume"
                      >
                        BOTH
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVolumeSource('spot');
                          const url = new URL(window.location.href);
                          url.searchParams.set('volumeSource', 'spot');
                          window.history.replaceState({}, '', url.toString());
                        }}
                        aria-pressed={volumeSource === 'spot'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          volumeSource === 'spot'
                            ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                        title="Spot/CEX trading volume (CoinGecko)"
                      >
                        CEX
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pointer-events-auto flex-wrap justify-end">
                  <button
                    onClick={() => setHideStables(!hideStables)}
                    aria-pressed={!hideStables}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-2xl border text-xs font-semibold tracking-wide uppercase transition-all shadow-sm ${
                      hideStables
                        ? 'bg-black/40 border-red-400/40 text-red-200 hover:border-red-300'
                        : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100 hover:border-emerald-300'
                    }`}
                    title={hideStables ? 'Stablecoins hidden - click to show' : 'Stablecoins visible - click to hide'}
                  >
                    <span className={`w-3 h-3 rounded-full ${hideStables ? 'bg-red-400 animate-pulse' : 'bg-emerald-300'}`} />
                    <span className="flex flex-col leading-tight text-left">
                      <span className="text-[10px] text-white/60 tracking-[0.3em]">STABLES</span>
                      <span className="text-[11px]">
                        {hideStables ? 'Hidden' : 'Visible'}
                      </span>
                    </span>
                  </button>

                  <button
                    onClick={() => setHideWrapped(!hideWrapped)}
                    aria-pressed={!hideWrapped}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-2xl border text-xs font-semibold tracking-wide uppercase transition-all shadow-sm ${
                      hideWrapped
                        ? 'bg-black/40 border-red-400/40 text-red-200 hover:border-red-300'
                        : 'bg-cyan-500/15 border-cyan-400/40 text-cyan-100 hover:border-cyan-300'
                    }`}
                    title={hideWrapped ? 'Wrapped tokens hidden - click to show' : 'Wrapped tokens visible - click to hide'}
                  >
                    <span className={`w-3 h-3 rounded-full ${hideWrapped ? 'bg-red-400 animate-pulse' : 'bg-cyan-300'}`} />
                    <span className="flex flex-col leading-tight text-left">
                      <span className="text-[10px] text-white/60 tracking-[0.3em]">WRAPPED</span>
                      <span className="text-[11px]">
                        {hideWrapped ? 'Hidden' : 'Visible'}
                      </span>
                    </span>
                  </button>

                  <button
                    onClick={() => setShowPerfOverlay(prev => !prev)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-2xl border text-xs font-semibold tracking-wide uppercase transition-all shadow-sm ${
                      showPerfOverlay
                        ? 'bg-blue-500/15 border-blue-400/40 text-blue-100 hover:border-blue-300'
                        : 'bg-white/5 border-white/20 text-white/70 hover:border-white/40'
                    }`}
                    title="Toggle performance overlay"
                  >
                    <span className={`w-3 h-3 rounded-full ${showPerfOverlay ? 'bg-blue-300 animate-pulse' : 'bg-white/40'}`} />
                    <span className="flex flex-col leading-tight text-left">
                      <span className="text-[10px] text-white/60 tracking-[0.3em]">PERF</span>
                      <span className="text-[11px]">
                        {showPerfOverlay ? 'Enabled' : 'Disabled'}
                      </span>
                    </span>
                  </button>

                  <button
                    onClick={() => setShowGpuPrototype(prev => !prev)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-2xl border text-xs font-semibold tracking-wide uppercase transition-all shadow-sm ${
                      showGpuPrototype
                        ? 'bg-fuchsia-500/15 border-fuchsia-400/40 text-fuchsia-100 hover:border-fuchsia-300'
                        : 'bg-white/5 border-white/20 text-white/70 hover:border-white/40'
                    }`}
                    title="Toggle experimental deck.gl renderer"
                  >
                    <span className={`w-3 h-3 rounded-full ${showGpuPrototype ? 'bg-fuchsia-300 animate-pulse' : 'bg-white/40'}`} />
                    <span className="flex flex-col leading-tight text-left">
                      <span className="text-[10px] text-white/60 tracking-[0.3em]">GPU</span>
                      <span className="text-[11px]">
                        {showGpuPrototype ? 'Prototype' : 'Disabled'}
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {followingInfo && (
              <div className={`self-center backdrop-blur-md rounded-full px-6 py-2 border flex items-center gap-3 transition-all duration-300 ${
                isTransitioning 
                  ? 'bg-purple-500/20 border-purple-400/50' 
                  : 'bg-cyan-500/20 border-cyan-400/50'
              }`}>
                <span className={`w-3 h-3 rounded-full animate-pulse ${
                  isTransitioning ? 'bg-purple-400' : 'bg-cyan-400'
                }`} />
                <span className={`font-semibold text-sm ${
                  isTransitioning ? 'text-purple-300' : 'text-cyan-300'
                }`}>
                  {isTransitioning ? 'Navigating to: ' : 'Following: '}{followingInfo.symbol}
                </span>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className="pointer-events-auto text-cyan-400/70 hover:text-green-400 transition-colors text-xs flex items-center gap-1"
                  title="Copy shareable link"
                >
                  {linkCopied ? (
                    <span className="text-green-400">Copied!</span>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => handleFollowPlanet(null)}
                  className="pointer-events-auto text-cyan-400/70 hover:text-red-400 transition-colors ml-1 text-xs"
                  title="Release follow"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div className="bg-black/50 backdrop-blur-md rounded-lg p-4 border border-white/10 max-w-xs ml-52">
            <div className="text-xs text-white/60 mb-2">Camera Controls</div>
            <div className="text-xs text-white/80 space-y-1">
              <div>🖱️ Drag to pan {(followingId || isTransitioning) && <span className="text-yellow-400">(cancels)</span>}</div>
              <div>🔍 Scroll to zoom</div>
              <div>👆 Click chain in HUD for cinematic travel</div>
              <div>🖱️ Click or right-click any object for menu</div>
            </div>
            <div className="text-xs mt-2">
              {isTransitioning ? (
                <span className="flex items-center gap-1 text-purple-400">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  Swooshing to: {followingInfo?.symbol}
                </span>
              ) : followingInfo ? (
                <span className="flex items-center gap-1 text-cyan-400">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Following: {followingInfo.symbol} ({followingInfo.type})
                </span>
              ) : (
                <span className="text-white/40">Free camera</span>
              )}
            </div>
            <div className="text-xs text-white/40 mt-1">
              Zoom: {(camera.zoom * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {showGpuPrototype && (
        <div className="fixed bottom-6 left-6 z-40 pointer-events-none select-none" data-menu-ignore="true">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60 mb-1">GPU MODE</div>
          <p className="text-[11px] text-white/50 max-w-xs">
            Experimental deck.gl renderer is live. Toggle GPU to revert to the DOM renderer.
          </p>
        </div>
      )}

      {/* Footer (Desktop only) */}
      {!isMobile && (
        <div data-menu-ignore="true">
          <Footer />
        </div>
      )}

      {showPerfOverlay && !isMobile && (
        <div data-menu-ignore="true" className="fixed bottom-6 right-6 z-50 pointer-events-none">
          <div className="bg-black/70 text-white rounded-2xl px-5 py-4 border border-white/20 shadow-2xl w-64">
            <div className="text-xs uppercase tracking-[0.3em] text-white/50 mb-2">Performance</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>FPS</span><span>{perfStats.fps.toFixed(1)}</span></div>
              <div className="flex justify-between"><span>Nodes</span><span>{perfStats.nodes}</span></div>
              <div className="flex justify-between"><span>Visible nodes</span><span>{perfStats.visibleNodes || visibleNodeCount}</span></div>
              <div className="flex justify-between"><span>Particles</span><span>{perfStats.particles}</span></div>
              <div className="flex justify-between"><span>Physics (ms)</span><span>{perfStats.physicsMs.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Camera (ms)</span><span>{perfStats.cameraMs.toFixed(2)}</span></div>
            </div>
            {perfSummary.sampleCount > 1 && (
              <div className="mt-3 text-[11px] text-white/60 border-t border-white/10 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Avg FPS ({(Math.max(perfSummary.windowMs, PERF_SUMMARY_WINDOW_MS) / 1000).toFixed(1)}s)</span>
                  <span>{perfSummary.avgFps.toFixed(1)}</span>
                </div>
                <div className="flex justify-between"><span>Min / Max FPS</span><span>{perfSummary.minFps.toFixed(1)} / {perfSummary.maxFps.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>Physics avg / peak</span><span>{perfSummary.avgPhysics.toFixed(2)} / {perfSummary.maxPhysics.toFixed(2)} ms</span></div>
                <div className="flex justify-between"><span>Avg visible nodes</span><span>{perfSummary.avgVisibleNodes.toFixed(0)}</span></div>
              </div>
            )}
            <div className="mt-3 flex justify-between text-[11px] text-white/50 border-t border-white/10 pt-2">
              <span>{deviceInfo.cores ? `${deviceInfo.cores} cores` : 'cores n/a'}</span>
              <span>{deviceInfo.dpr ? `dpr ${deviceInfo.dpr.toFixed(1)}` : ''}</span>
            </div>
            <div className="mt-2 flex justify-end items-center gap-3">
              {perfCopied && (
                <span className="text-[11px] uppercase tracking-[0.2em] text-emerald-300 pointer-events-none animate-pulse">
                  Copied!
                </span>
              )}
              <button
                onClick={handleCopyPerfSummary}
                className={`pointer-events-auto text-[11px] uppercase tracking-[0.2em] transition-colors ${
                  perfCopied ? 'text-emerald-300' : 'text-cyan-300 hover:text-emerald-300'
                }`}
              >
                {perfCopied ? 'Copied' : 'Copy summary'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
