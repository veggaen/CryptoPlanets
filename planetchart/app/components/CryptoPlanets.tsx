"use client";

import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  GalaxyState,
  GalaxyNode,
  WeightMode,
  GalaxyData
} from "@/types/galaxy";
import { loadGalaxyData } from "@/services/dataLoader";
import { initGalaxyState, tickGalaxy } from "@/physics/galaxyEngine";
import { CAMERA_CONFIG, updateFollowCamera, calculateIdealZoom, createCinematicTransition, updateCinematicTransition, CameraTransition } from "@/physics/cameraEngine";
import { getParticles, getShakeOffset, Particle, setParticleBudget, collisionConfig } from "@/physics/collision";
import { uiConfig } from "@/config/uiConfig";
import type { QualityMode } from "@/types/performance";
import Starfield from "./Starfield";
import Footer from "./Footer";
import GalaxyHUD from "./GalaxyHUD";
import RadialMenu from "./RadialMenu";
import MobileHUD from "./MobileHUD";

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

const RENDER_FRAME_INTERVAL = 1000 / 30; // 30 FPS cap for React renders
const VIEW_CULL_PADDING_PX = 220;

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
  node
}: { 
  node: GalaxyNode; 
}) => {
  const [isRatioHovered, setIsRatioHovered] = useState(false);
  const isSun = node.type === 'sun';
  const size = node.radius * 2;
  const glowIntensity = node.collisionGlow || 0;

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

  const fontSize = Math.max(160, Math.round(node.radius * 0.28));
  const priceFontSize = Math.max(96, Math.round(node.radius * 0.16));
  const ratioFontSize = Math.max(72, Math.round(node.radius * 0.12));
  const iconSize = Math.round(node.radius * 1.2); // Icon is 60% of diameter (120% of radius)

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
        {icon && (
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
            textShadow: '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            letterSpacing: '-0.02em',
            lineHeight: 1,
            zIndex: 1,
            position: 'relative',
          }}
        >
          {symbol}
        </span>
        {priceDisplay && (
          <span
            style={{
              fontSize: priceFontSize,
              fontWeight: 700,
              color: uiConfig.planetPriceColor,
              textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000',
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
        {/* Size ratio display - hover to toggle view */}
        {sizeRatioDisplay && (
          <span
            onMouseEnter={hasAlternateView ? () => setIsRatioHovered(true) : undefined}
            onMouseLeave={hasAlternateView ? () => setIsRatioHovered(false) : undefined}
            style={{
              fontSize: ratioFontSize,
              fontWeight: 700,
              color: showSunMultiplier ? '#f59e0b' : uiConfig.planetSizeRatioColor,
              textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000',
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
  node
}: { 
  node: GalaxyNode;
}) => {
  const [isRatioHovered, setIsRatioHovered] = useState(false);
  const size = node.radius * 2; // diameter
  const ticker = 'symbol' in node.data ? node.data.symbol : '';
  const price = ('price' in node.data && typeof node.data.price === 'number') ? node.data.price : null;
  const icon = ('icon' in node.data && typeof node.data.icon === 'string') ? node.data.icon : null;
  const glowIntensity = node.collisionGlow || 0;

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
  const baseFontSize = size * 0.28 * lengthFactor;
  const fontSize = Math.max(12, Math.min(48, Math.round(baseFontSize)));
  const priceFontSize = Math.max(10, Math.min(36, Math.round(fontSize * 0.75)));
  const ratioFontSize = Math.max(8, Math.min(28, Math.round(fontSize * 0.55)));
  
  // Icon scales with moon size - 65% of diameter for good visibility
  const iconSize = Math.max(20, Math.round(size * 0.65));
  
  // Only show price on larger moons where it's readable
  const showPrice = size > 35 && fontSize >= 12;
  
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
        {icon && (
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
                textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000',
                lineHeight: 1.1,
                fontFamily: 'system-ui, -apple-system, sans-serif',
                letterSpacing: '-0.01em',
                zIndex: 1,
                position: 'relative',
              }}
            >
              {ticker}
            </span>
            {showPrice && price !== null && (
              <span
                style={{
                  fontSize: priceFontSize,
                  fontWeight: 700,
                  color: uiConfig.planetPriceColor,
                  textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000',
                  lineHeight: 1.1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  zIndex: 1,
                  position: 'relative',
                }}
              >
                {formatPrice(price)}
              </span>
            )}
            {showPrice && sizeRatioDisplay && (
              <span
                onMouseEnter={hasAlternateView ? () => setIsRatioHovered(true) : undefined}
                onMouseLeave={hasAlternateView ? () => setIsRatioHovered(false) : undefined}
                style={{
                  fontSize: ratioFontSize,
                  fontWeight: 600,
                  color: showSunMultiplier ? '#f59e0b' : uiConfig.planetSizeRatioColor,
                  textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000',
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
  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.05 });
  const camera = cameraRef.current;
  const [isLoading, setIsLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  
  // Token filter state (default: hide stablecoins and wrapped)
  const [hideStables, setHideStables] = useState(true);
  const [hideWrapped, setHideWrapped] = useState(true);

  const [showPerfOverlay, setShowPerfOverlay] = useState(false);
  const [perfStats, setPerfStats] = useState({
    fps: 0,
    nodes: 0,
    particles: 0,
    physicsMs: 0,
    cameraMs: 0,
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
  const [deviceInfo, setDeviceInfo] = useState<{ cores: number | null; dpr: number }>({
    cores: null,
    dpr: 1,
  });
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
  }>({ isOpen: false, x: 0, y: 0, nodeId: null, nodeSymbol: '' });
  
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
  
  const isCircleVisible = useCallback((x: number, y: number, radius: number) => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return true;
    }

    const halfWidth = viewportSize.width / 2;
    const halfHeight = viewportSize.height / 2;
    const screenX = x * camera.zoom + camera.x;
    const screenY = y * camera.zoom + camera.y;
    const screenRadius = Math.max(radius * camera.zoom, 6);

    return (
      screenX + screenRadius + VIEW_CULL_PADDING_PX > -halfWidth &&
      screenX - screenRadius - VIEW_CULL_PADDING_PX < halfWidth &&
      screenY + screenRadius + VIEW_CULL_PADDING_PX > -halfHeight &&
      screenY - screenRadius - VIEW_CULL_PADDING_PX < halfHeight
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
  const galaxyStateRef = useRef<GalaxyState | null>(null);
  const galaxyState = galaxyStateRef.current;
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
      setPerfStats({
        fps,
        nodes: galaxyStateRef.current?.nodes.length ?? 0,
        particles: getParticles().length,
        physicsMs,
        cameraMs,
      });
    }
  }, [showPerfOverlay]);

  // Read URL params on mount to get initial follow target
  useEffect(() => {
    const followParam = searchParams.get('follow');
    const metricParam = searchParams.get('metric');
    
    if (!initialUrlProcessed.current) {
      // Default to BTC if no follow param specified
      pendingFollowId.current = followParam ? followParam.toLowerCase() : 'btc';
    }
    
    if (metricParam && ['TVL', 'MarketCap', 'Volume24h', 'Change24h'].includes(metricParam)) {
      setWeightMode(metricParam as WeightMode);
    }
  }, [searchParams]);

  // Track previous filter state to detect changes
  const prevFiltersRef = useRef({ hideStables, hideWrapped, weightMode, qualityMode });

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
    
    // Update ref
    prevFiltersRef.current = { hideStables, hideWrapped, weightMode, qualityMode };
    
    async function init() {
      // Only show loading spinner for weight mode changes (takes longer)
      if (isWeightModeChange || isQualityModeChange || !galaxyStateRef.current) {
        setIsLoading(true);
      }
      
      try {
        const data = await loadGalaxyData(weightMode, { hideStables, hideWrapped });
        const shapedData = applyQualityBudgets(data);
        const initialState = initGalaxyState(shapedData);

        // Only reset camera on fresh init or weight mode change
        if (isWeightModeChange || isQualityModeChange || !galaxyStateRef.current) {
          cameraRef.current = { x: 0, y: 0, zoom: 0.03 };
          setTargetZoom(0.03);
          // Clear follow on weight mode change
          setFollowingId(null);
          transitionRef.current = null;
          setIsTransitioning(false);
        }

        galaxyStateRef.current = initialState;
        forceRender();
      } catch (e) {
        console.error("Failed to init galaxy:", e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [weightMode, hideStables, hideWrapped, qualityMode, applyQualityBudgets, forceRender]);
  
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
        if (timeSinceRender >= RENDER_FRAME_INTERVAL) {
          lastRenderTimeRef.current = time;
          forceRender();
        }
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [followingId, targetZoom, isTransitioning, recordPerfSample, forceRender]);

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

  // Camera wheel zoom - ZOOM TO CURSOR or ZOOM TO FOLLOWED ENTITY
  useEffect(() => {
    const clampZoom = (value: number) =>
      Math.max(CAMERA_CONFIG.minZoom, Math.min(CAMERA_CONFIG.maxZoom, value));

    const handleWheel = (e: WheelEvent) => {
      const container = containerRef.current;
      if (!container) return;

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
  }, []);

  // Drag handling
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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

    cameraRef.current = {
      ...cameraRef.current,
      x: cameraRef.current.x + dx,
      y: cameraRef.current.y + dy,
    };
    forceRender();

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [isDragging, followingId, isTransitioning, forceRender]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

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
    
    if (!galaxyStateRef.current) return;

    const cameraSnapshot = cameraRef.current;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Convert screen coords to world coords
    // The transform is: translate(camera.x, camera.y) scale(camera.zoom) with origin at center
    // World (0,0) is at the center of the viewport (where the sun lives)
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const screenX = e.clientX - rect.left - centerX;
    const screenY = e.clientY - rect.top - centerY;
    const worldX = (screenX - cameraSnapshot.x) / cameraSnapshot.zoom;
    const worldY = (screenY - cameraSnapshot.y) / cameraSnapshot.zoom;

    // Check nodes in order: moons first (smallest), then planets, then sun
    // This ensures smaller overlapping objects get priority
    const allNodes = [
      ...galaxyStateRef.current.moonNodes,
      ...galaxyStateRef.current.planetNodes,
      galaxyStateRef.current.sunNode,
    ];
    
    // Minimum hit tolerance for very small objects (in world units)
    const minHitRadius = 15 / cameraSnapshot.zoom;
    
    for (const node of allNodes) {
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Use larger of node radius or minimum hit radius for easier clicking
      const hitRadius = Math.max(node.radius * 1.2, minHitRadius);
      
      if (dist < hitRadius) {
        const symbol = ('symbol' in node.data ? node.data.symbol : null)
          || ('name' in node.data ? node.data.name : null)
          || node.id.toUpperCase();
        
        setRadialMenu({
          isOpen: true,
          x: e.clientX,
          y: e.clientY,
          nodeId: node.id,
          nodeSymbol: symbol,
        });
        return;
      }
    }
    
    // Clicked on empty space - close menu if open
    setRadialMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

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
        onClick: () => console.log('View details:', radialMenu.nodeId),
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
  const visibleMoons = galaxyState.moonNodes.filter((node) =>
    isCircleVisible(node.x, node.y, node.radius * 1.5)
  );
  const visibleOrbitRings = galaxyState.planetNodes.filter((node) =>
    isCircleVisible(0, 0, node.orbitRadius + node.radius)
  );
  const visibleParticles = particles.filter((particle) =>
    isCircleVisible(particle.x, particle.y, particle.size)
  );
  const visibleNodeCount = 1 + visiblePlanets.length + visibleMoons.length;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-screen bg-black overflow-hidden select-none ${isMobile ? 'no-touch-select' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Starfield qualityMode={qualityMode} />

      {/* Galaxy container with camera shake */}
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
          />

          {/* Planets */}
          {visiblePlanets.map(node => (
            <PlanetNode 
              key={node.id} 
              node={node}
            />
          ))}

          {/* Moons */}
          {visibleMoons.map(node => (
            <MoonNode 
              key={node.id} 
              node={node}
            />
          ))}

          {/* Collision particle effects */}
          <ParticleLayer particles={visibleParticles} />
        </div>
      </div>

      {/* Galaxy HUD - Chain Navigation (Desktop only) */}
      {!isMobile && (
        <GalaxyHUD
          planets={galaxyState.planetNodes}
          sun={galaxyState.sunNode}
          followingId={followingId}
          onFollowPlanet={handleFollowPlanet}
          zoom={camera.zoom}
          qualityMode={qualityMode}
          qualityReasons={qualityReasons}
        />
      )}
      
      {/* Mobile HUD */}
      {isMobile && (
        <MobileHUD
          planets={galaxyState.planetNodes}
          sun={galaxyState.sunNode}
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
            window.history.replaceState({}, '', url.toString());
          }}
          hideStables={hideStables}
          hideWrapped={hideWrapped}
          onToggleStables={() => setHideStables(!hideStables)}
          onToggleWrapped={() => setHideWrapped(!hideWrapped)}
          followingInfo={followingInfo}
          qualityMode={qualityMode}
          qualityReasons={qualityReasons}
        />
      )}

      {/* Radial Context Menu (Desktop only - mobile uses tap menu) */}
      {!isMobile && (
        <RadialMenu
          isOpen={radialMenu.isOpen}
          x={radialMenu.x}
          y={radialMenu.y}
          items={getRadialMenuItems()}
          onClose={() => setRadialMenu(prev => ({ ...prev, isOpen: false }))}
          title={radialMenu.nodeSymbol}
        />
      )}

      {/* UI Overlay (Desktop only) */}
      {!isMobile && (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-6 flex flex-col justify-between z-40">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-6">
              <div className="bg-black/50 backdrop-blur-md rounded-lg p-4 border border-white/10 ml-48">
                <h1 className="text-2xl font-bold text-white mb-2">Crypto Galaxy</h1>
                <p className="text-sm text-white/60">Real-time blockchain visualization</p>
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
                    window.history.replaceState({}, '', url.toString());
                  }}
                >
                  <option value="TVL"> TVL</option>
                  <option value="MarketCap">Size by Market Cap</option>
                  <option value="Volume24h">Size by 24h Volume</option>
                  <option value="Change24h">Size by 24h Change</option>
                </select>

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

          <div className="bg-black/50 backdrop-blur-md rounded-lg p-4 border border-white/10 max-w-xs ml-48">
            <div className="text-xs text-white/60 mb-2">Camera Controls</div>
            <div className="text-xs text-white/80 space-y-1">
              <div>🖱️ Drag to pan {(followingId || isTransitioning) && <span className="text-yellow-400">(cancels)</span>}</div>
              <div>🔍 Scroll to zoom</div>
              <div>👆 Click chain in HUD for cinematic travel</div>
              <div>🖱️ Right-click any object for menu</div>
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

      {/* Footer (Desktop only) */}
      {!isMobile && <Footer />}

      {showPerfOverlay && !isMobile && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
          <div className="bg-black/70 text-white rounded-2xl px-5 py-4 border border-white/20 shadow-2xl w-64">
            <div className="text-xs uppercase tracking-[0.3em] text-white/50 mb-2">Performance</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>FPS</span><span>{perfStats.fps.toFixed(1)}</span></div>
              <div className="flex justify-between"><span>Nodes</span><span>{perfStats.nodes}</span></div>
              <div className="flex justify-between"><span>Visible nodes</span><span>{visibleNodeCount}</span></div>
              <div className="flex justify-between"><span>Particles</span><span>{perfStats.particles}</span></div>
              <div className="flex justify-between"><span>Physics (ms)</span><span>{perfStats.physicsMs.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Camera (ms)</span><span>{perfStats.cameraMs.toFixed(2)}</span></div>
            </div>
            <div className="mt-3 text-[11px] text-white/50 border-t border-white/10 pt-2 flex justify-between">
              <span>{deviceInfo.cores ? `${deviceInfo.cores} cores` : 'cores n/a'}</span>
              <span>{deviceInfo.dpr ? `dpr ${deviceInfo.dpr.toFixed(1)}` : ''}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
