"use client";

import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  GalaxyState,
  GalaxyNode,
  WeightMode
} from "@/types/galaxy";
import { loadGalaxyData } from "@/services/dataLoader";
import { initGalaxyState, tickGalaxy } from "@/physics/galaxyEngine";
import { CAMERA_CONFIG, updateFollowCamera, calculateIdealZoom, createCinematicTransition, updateCinematicTransition, CameraTransition } from "@/physics/cameraEngine";
import { getParticles, getShakeOffset, Particle } from "@/physics/collision";
import { uiConfig } from "@/config/uiConfig";
import Starfield from "./Starfield";
import Footer from "./Footer";
import GalaxyHUD from "./GalaxyHUD";
import RadialMenu from "./RadialMenu";

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
  const router = useRouter();
  
  // Track if we've processed the initial URL params
  const initialUrlProcessed = useRef(false);
  const pendingFollowId = useRef<string | null>(null);

  const [galaxyState, setGalaxyState] = useState<GalaxyState | null>(null);
  const [weightMode, setWeightMode] = useState<WeightMode>("MarketCap");
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 0.05 });
  const [isLoading, setIsLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  
  // Token filter state (default: hide stablecoins and wrapped)
  const [hideStables, setHideStables] = useState(true);
  const [hideWrapped, setHideWrapped] = useState(true);
  
  // Camera follow state
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [targetZoom, setTargetZoom] = useState<number>(0.05);
  
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
  
  // Compute the display name for the currently followed node
  const followingInfo = useMemo(() => {
    if (!followingId || !galaxyState) return null;
    const node = galaxyState.nodes.find(n => n.id === followingId);
    if (!node) return null;
    
    const symbol = ('symbol' in node.data ? node.data.symbol : null)
      || ('name' in node.data ? node.data.name : null)
      || followingId.toUpperCase();
    
    return { symbol, type: node.type };
  }, [followingId, galaxyState]);
  
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);
  const galaxyStateRef = useRef<GalaxyState | null>(null);

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

  // Initialize galaxy
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const data = await loadGalaxyData(weightMode, { hideStables, hideWrapped });
        const initialState = initGalaxyState(data);

        // Start zoomed out to see entire galaxy
        setCamera({ x: 0, y: 0, zoom: 0.03 });
        setTargetZoom(0.03);

        galaxyStateRef.current = initialState;
        setGalaxyState(initialState);
      } catch (e) {
        console.error("Failed to init galaxy:", e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [weightMode, hideStables, hideWrapped]);
  
  // Process pending follow from URL after galaxy is loaded
  useEffect(() => {
    if (galaxyState && pendingFollowId.current && !initialUrlProcessed.current) {
      initialUrlProcessed.current = true;
      const targetId = pendingFollowId.current;
      pendingFollowId.current = null;
      
      // Find the node - could be sun, planet, or moon
      const node = galaxyState.nodes.find(n => n.id === targetId);
      if (node) {
        // Use direct positioning instead of cinematic transition for URL loads
        // This gives immediate focus without the swoosh animation
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const idealZoom = calculateIdealZoom(node.radius, node.type as 'sun' | 'planet' | 'moon', viewportWidth, viewportHeight);
        
        setCamera({
          x: -node.x * idealZoom,
          y: -node.y * idealZoom,
          zoom: idealZoom
        });
        setTargetZoom(idealZoom);
        setFollowingId(targetId);
      }
    }
  }, [galaxyState]);

  // Animation loop with camera follow and cinematic transitions
  useEffect(() => {
    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined && galaxyStateRef.current) {
        const deltaTime = time - previousTimeRef.current;
        const dt = Math.min(deltaTime, 32) / 16.67;

        // Update physics
        tickGalaxy(galaxyStateRef.current, dt);
        
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
            
            setCamera(result.camera);
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
            setCamera(prev => {
              const updated = updateFollowCamera(
                prev,
                targetNode.x,
                targetNode.y,
                prev.zoom,
                CAMERA_CONFIG.followLerpSpeed
              );
              
              // Also smoothly interpolate zoom to target
              const zoomDiff = targetZoom - prev.zoom;
              const newZoom = prev.zoom + zoomDiff * CAMERA_CONFIG.zoomLerpSpeed;
              
              return { ...updated, zoom: newZoom };
            });
          }
        }
        
        // Trigger re-render with new state reference
        setGalaxyState({ ...galaxyStateRef.current });
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [followingId, targetZoom, isTransitioning]);

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
      camera,
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
  }, [camera]);

  // Camera wheel zoom - works even when following
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      
      setCamera(prev => {
        const newZoom = Math.max(CAMERA_CONFIG.minZoom, Math.min(CAMERA_CONFIG.maxZoom, prev.zoom * zoomFactor));
        return { ...prev, zoom: newZoom };
      });
      
      // Also update target zoom if following
      if (followingId) {
        setTargetZoom(prev => Math.max(CAMERA_CONFIG.minZoom, Math.min(CAMERA_CONFIG.maxZoom, prev * zoomFactor)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [followingId]);

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

    setCamera(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy
    }));

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [isDragging, followingId, isTransitioning]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  // Right-click context menu for sun, planets, and moons
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!galaxyStateRef.current) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Convert screen coords to world coords
    // The transform is: translate(camera.x, camera.y) scale(camera.zoom) with origin at center
    // World (0,0) is at the center of the viewport (where the sun lives)
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const screenX = e.clientX - rect.left - centerX;
    const screenY = e.clientY - rect.top - centerY;
    const worldX = (screenX - camera.x) / camera.zoom;
    const worldY = (screenY - camera.y) / camera.zoom;

    // Check nodes in order: moons first (smallest), then planets, then sun
    // This ensures smaller overlapping objects get priority
    const allNodes = [
      ...galaxyStateRef.current.moonNodes,
      ...galaxyStateRef.current.planetNodes,
      galaxyStateRef.current.sunNode,
    ];
    
    // Minimum hit tolerance for very small objects (in world units)
    const minHitRadius = 15 / camera.zoom;
    
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
  }, [camera]);

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

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      <Starfield />

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
          {galaxyState.planetNodes.map(node => (
            <OrbitRing key={`ring-${node.id}`} radius={node.orbitRadius} />
          ))}

          {/* Sun */}
          <PlanetNode 
            key={galaxyState.sunNode.id} 
            node={galaxyState.sunNode}
          />

          {/* Planets */}
          {galaxyState.planetNodes.map(node => (
            <PlanetNode 
              key={node.id} 
              node={node}
            />
          ))}

          {/* Moons */}
          {galaxyState.moonNodes.map(node => (
            <MoonNode 
              key={node.id} 
              node={node}
            />
          ))}

          {/* Collision particle effects */}
          <ParticleLayer particles={getParticles()} />
        </div>
      </div>

      {/* Galaxy HUD - Chain Navigation */}
      <GalaxyHUD
        planets={galaxyState.planetNodes}
        sun={galaxyState.sunNode}
        followingId={followingId}
        onFollowPlanet={handleFollowPlanet}
        zoom={camera.zoom}
      />

      {/* Radial Context Menu */}
      <RadialMenu
        isOpen={radialMenu.isOpen}
        x={radialMenu.x}
        y={radialMenu.y}
        items={getRadialMenuItems()}
        onClose={() => setRadialMenu(prev => ({ ...prev, isOpen: false }))}
        title={radialMenu.nodeSymbol}
      />

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-6 flex flex-col justify-between z-40">
        <div className="flex items-start justify-between">
          <div className="bg-black/50 backdrop-blur-md rounded-lg p-4 border border-white/10 ml-48">
            <h1 className="text-2xl font-bold text-white mb-2">Crypto Galaxy</h1>
            <p className="text-sm text-white/60">Real-time blockchain visualization</p>
          </div>

          {/* Prominent Following Indicator - Center Top */}
          {followingInfo && (
            <div className={`absolute top-6 left-1/2 -translate-x-1/2 backdrop-blur-md rounded-full px-6 py-2 border flex items-center gap-3 transition-all duration-300 ${
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
              
              {/* Copy Link Button */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
                className="pointer-events-auto text-cyan-400/60 hover:text-green-400 transition-colors text-xs flex items-center gap-1"
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
                className="pointer-events-auto text-cyan-400/60 hover:text-red-400 transition-colors ml-1 text-xs"
                title="Release follow"
              >
                ✕
              </button>
            </div>
          )}

          <select
            className="pointer-events-auto bg-black/50 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-black/70 transition-colors"
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
            <option value="Change4h">Size by 4h Change</option>
          </select>
          
          {/* Token Filter Toggles */}
          <div className="flex gap-2 pointer-events-auto">
            <button
              onClick={() => setHideStables(!hideStables)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all backdrop-blur-md border ${
                hideStables 
                  ? 'bg-red-500/20 border-red-400/30 text-red-300' 
                  : 'bg-green-500/20 border-green-400/30 text-green-300'
              }`}
              title={hideStables ? "Stablecoins hidden - click to show" : "Stablecoins visible - click to hide"}
            >
              {hideStables ? '🚫' : '✅'} Stables
            </button>
            <button
              onClick={() => setHideWrapped(!hideWrapped)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all backdrop-blur-md border ${
                hideWrapped 
                  ? 'bg-red-500/20 border-red-400/30 text-red-300' 
                  : 'bg-green-500/20 border-green-400/30 text-green-300'
              }`}
              title={hideWrapped ? "Wrapped tokens hidden - click to show" : "Wrapped tokens visible - click to hide"}
            >
              {hideWrapped ? '🚫' : '✅'} Wrapped
            </button>
          </div>
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

      <Footer />
    </div>
  );
}
