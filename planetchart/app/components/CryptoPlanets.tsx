"use client";

import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react";
import {
  GalaxyState,
  GalaxyNode,
  WeightMode
} from "@/types/galaxy";
import { loadGalaxyData } from "@/services/dataLoader";
import { initGalaxyState, tickGalaxy } from "@/physics/galaxyEngine";
import { physicsConfig } from "@/config/physicsConfig";
import Starfield from "./Starfield";
import Footer from "./Footer";

// ============================================================================
// PERFORMANCE OPTIMIZATIONS (agar.io inspired):
// 1. NO Framer Motion - direct CSS transforms only
// 2. Minimal re-renders with proper memoization
// 3. GPU-accelerated transforms with translate3d
// 4. Simplified DOM structure
// ============================================================================

// --- Planet/Sun Component ---
const PlanetNode = ({ node }: { node: GalaxyNode }) => {
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

  const fontSize = Math.max(160, Math.round(node.radius * 0.28));
  const priceFontSize = Math.max(96, Math.round(node.radius * 0.16));
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
            color: 'white',
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
              color: '#22c55e',
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
      </div>
    </div>
  );
};

// --- Moon Component ---
const MoonNode = ({ node }: { node: GalaxyNode }) => {
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

  // Improved font sizing: scale proportionally with moon size
  // Larger moons should have larger, more readable text
  const tickerLen = Math.max(1, ticker.length);
  
  // Base font size scales with diameter - use 28% of diameter as baseline
  // Longer tickers get slightly smaller font but not as aggressively
  const lengthFactor = Math.max(0.6, 1 - (tickerLen - 3) * 0.06); // 3-char = 1.0, 5-char = 0.88, 7-char = 0.76
  const baseFontSize = size * 0.28 * lengthFactor;
  const fontSize = Math.max(12, Math.min(48, Math.round(baseFontSize)));
  const priceFontSize = Math.max(10, Math.min(36, Math.round(fontSize * 0.75)));
  
  // Icon scales with moon size - 65% of diameter for good visibility
  const iconSize = Math.max(20, Math.round(size * 0.65));
  
  // Only show price on larger moons where it's readable
  const showPrice = size > 35 && fontSize >= 12;

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
                color: 'white',
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
                  color: '#22c55e',
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CryptoPlanets() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [galaxyState, setGalaxyState] = useState<GalaxyState | null>(null);
  const [weightMode, setWeightMode] = useState<WeightMode>("MarketCap");
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 0.6 });
  const [minZoom, setMinZoom] = useState(0.1);
  const [isLoading, setIsLoading] = useState(true);
  
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);
  const galaxyStateRef = useRef<GalaxyState | null>(null);

  // Initialize galaxy
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const data = await loadGalaxyData(weightMode);
        const initialState = initGalaxyState(data);

        const maxOrbit = Math.max(...initialState.nodes.map(n => n.orbitRadius)) + 100;
        // Calculate zoom that fits entire galaxy, but clamp to reasonable range
        const fitZoom = Math.min(window.innerWidth, window.innerHeight) / (maxOrbit * 2.2);
        // Min zoom should allow seeing entire galaxy, but never less than 0.05 or more than 0.5
        const clampedMinZoom = Math.max(0.05, Math.min(0.5, fitZoom));
        setMinZoom(clampedMinZoom);
        // Initial zoom: comfortable viewing, not too zoomed in or out
        setCamera(prev => ({ ...prev, zoom: Math.max(clampedMinZoom, Math.min(0.8, fitZoom * 1.5)) }));

        galaxyStateRef.current = initialState;
        setGalaxyState(initialState);
      } catch (e) {
        console.error("Failed to init galaxy:", e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [weightMode]);

  // Animation loop
  useEffect(() => {
    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined && galaxyStateRef.current) {
        const deltaTime = time - previousTimeRef.current;
        const dt = Math.min(deltaTime, 32) / 16.67;

        // Update physics
        tickGalaxy(galaxyStateRef.current, dt);
        
        // Trigger re-render with new state reference
        setGalaxyState({ ...galaxyStateRef.current });
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  // Camera handlers - SMOOTH proportional zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Proportional zoom: multiply by factor for smooth feel
    const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08; // 8% per scroll step
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(minZoom, Math.min(10, prev.zoom * zoomFactor))
    }));
  }, [minZoom]);

  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    setCamera(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy
    }));

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

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
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <Starfield />

      {/* Galaxy container */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Orbit rings */}
        {galaxyState.planetNodes.map(node => (
          <OrbitRing key={`ring-${node.id}`} radius={node.orbitRadius} />
        ))}

        {/* Sun */}
        <PlanetNode key={galaxyState.sunNode.id} node={galaxyState.sunNode} />

        {/* Planets */}
        {galaxyState.planetNodes.map(node => (
          <PlanetNode key={node.id} node={node} />
        ))}

        {/* Moons */}
        {galaxyState.moonNodes.map(node => (
          <MoonNode key={node.id} node={node} />
        ))}
      </div>

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-6 flex flex-col justify-between z-50">
        <div className="flex items-start justify-between">
          <div className="bg-black/50 backdrop-blur-md rounded-lg p-4 border border-white/10">
            <h1 className="text-2xl font-bold text-white mb-2">Crypto Galaxy</h1>
            <p className="text-sm text-white/60">Real-time blockchain visualization</p>
          </div>

          <select
            className="pointer-events-auto bg-black/50 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-black/70 transition-colors"
            value={weightMode}
            onChange={(e) => setWeightMode(e.target.value as WeightMode)}
          >
            <option value="TVL">Size by TVL</option>
            <option value="MarketCap">Size by Market Cap</option>
            <option value="Volume24h">Size by 24h Volume</option>
            <option value="Change24h">Size by 24h Change</option>
            <option value="Change24h">Size by 4h Change</option>
            <option value="Change24h">Size by 1h Change</option>
          </select>
        </div>

        <div className="bg-black/50 backdrop-blur-md rounded-lg p-4 border border-white/10 max-w-xs">
          <div className="text-xs text-white/60 mb-2">Camera Controls</div>
          <div className="text-xs text-white/80">
            <div>🖱️ Drag to pan</div>
            <div>🔍 Scroll to zoom</div>
            <div>Zoom: {(camera.zoom * 100).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
