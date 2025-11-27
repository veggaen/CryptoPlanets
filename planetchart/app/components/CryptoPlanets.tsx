"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GalaxyState,
  GalaxyNode,
  WeightMode
} from "@/types/galaxy";
import { loadGalaxyData } from "@/services/dataLoader";
import { initGalaxyState, tickGalaxy } from "@/physics/galaxyEngine";
import { physicsConfig } from "@/config/physicsConfig";
import { uiConfig } from "@/config/uiConfig";
import { visualConfig } from "@/config/visualConfig";
import Starfield from "./Starfield";
import Footer from "./Footer";

// --- Components ---

const PlanetNode = ({ node, zoom }: { node: GalaxyNode; zoom: number }) => {
  // Safe color parsing
  const getGradientColors = (color: string) => {
    const parts = color.split(' ');
    if (parts.length >= 3) {
      const from = parts[1]?.replace('from-', '') || 'blue-400';
      const to = parts[2]?.replace('to-', '') || 'blue-600';
      return { from, to };
    }
    return { from: 'blue-400', to: 'blue-600' };
  };

  const { from, to } = node.type === 'sun' ? { from: '#fbbf24', to: '#d97706' } : getGradientColors(node.color);

  return (
    <div
      className="absolute"
      style={{
        left: node.x,
        top: node.y,
        transform: 'translate(-50%, -50%)',
        zIndex: node.type === 'sun' ? 10 : 20,
      }}
    >
      {/* Planet Halo - more visible, especially when zoomed out */}
      {node.type !== 'sun' && (
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: node.radius * 3.2,
            height: node.radius * 3.2,
            background: `radial-gradient(circle, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 80%)`,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* Planet/Sun Body - always visible */}
      <motion.div
        className="absolute rounded-full flex items-center justify-center shadow-xl shadow-yellow-500/50 opacity-90 border border-yellow-300/50"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: node.radius * 2,
          height: node.radius * 2,
          background: node.type === 'sun'
            ? `radial-gradient(circle at 30% 30%, ${from}, ${to})`
            : `linear-gradient(135deg, ${from}, ${to})`,
          boxShadow: node.type === 'sun'
            ? `0 0 ${60 * zoom}px ${20 * zoom}px rgba(251, 191, 36, 0.4)`
            : `0 0 ${20 * zoom}px rgba(255,255,255,0.1)`,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'antialiased',
        }}
      />

      {/* Planet/Sun Labels - ALWAYS show for planets and sun */}
      <div
        className="absolute pointer-events-none flex flex-col items-center justify-center"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${1 / Math.max(0.5, zoom)})`,
        }}
      >
        <div className="font-bold text-white whitespace-nowrap drop-shadow-lg" style={{ fontSize: node.type === 'sun' ? 24 : 16 }}>
          {('symbol' in node.data ? node.data.symbol : null) || ('name' in node.data ? node.data.name : null) || "BTC"}
        </div>
        {/* ALWAYS show price for planets/sun */}
        {'price' in node.data && typeof node.data.price === 'number' && (
          <div className="text-xs text-white/90 drop-shadow mt-1">
            ${node.data.price.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
};

const MoonNode = ({ node, zoom }: { node: GalaxyNode; zoom: number }) => {
  // Show labels when zoomed in just a bit
  const showLabel = zoom > 0.7;

  // Extract ticker and price
  const ticker = 'symbol' in node.data ? node.data.symbol : '';
  const price = 'price' in node.data && typeof node.data.price === 'number' ? node.data.price : null;

  return (
    <motion.div
      className={`absolute rounded-full ${visualConfig.holoStyle.shadow} ${visualConfig.holoStyle.opacity} ${visualConfig.holoStyle.border}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.radius * 2,
        height: node.radius * 2,
        x: -node.radius,
        y: -node.radius,
        backgroundColor: node.color,
        zIndex: 30,
        willChange: 'transform', // Optimize for animations
        backfaceVisibility: 'hidden', // Prevent blur on some browsers
        WebkitFontSmoothing: 'antialiased', // Sharp text
      }}
    >
      {/* Centered Text Labels - INSIDE the moon like planets */}
      {showLabel && ticker && (
        <div
          className="absolute pointer-events-none flex flex-col items-center justify-center overflow-hidden"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%) translateZ(0)', // Force GPU layer for sharpness
            width: '90%',
            height: '90%',
            textRendering: 'optimizeLegibility',
          }}
        >
          <div className="text-white font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] antialiased text-center" style={{ fontSize: '7px' }}>
            {ticker}
          </div>
          {price && (
            <div className="text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] antialiased text-center" style={{ fontSize: '5px' }}>
              ${price.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

const OrbitRing = ({ radius }: { radius: number }) => (
  <div
    className="absolute rounded-full border border-white/5 pointer-events-none"
    style={{
      left: -radius,
      top: -radius,
      width: radius * 2,
      height: radius * 2,
    }}
  />
);

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

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const data = await loadGalaxyData(weightMode);
        const initialState = initGalaxyState(data);

        const maxOrbit = Math.max(...initialState.nodes.map(n => n.orbitRadius)) + 100;
        const fitZoom = Math.min(window.innerWidth, window.innerHeight) / (maxOrbit * 2.2);
        setMinZoom(fitZoom);
        setCamera(prev => ({ ...prev, zoom: Math.max(fitZoom, 0.5) }));

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

  const animate = (time: number) => {
    if (previousTimeRef.current !== undefined && galaxyStateRef.current) {
      const deltaTime = time - previousTimeRef.current;
      const dt = Math.min(deltaTime, 32) / 16.67;

      tickGalaxy(galaxyStateRef.current, dt);
      setGalaxyState({ ...galaxyStateRef.current });
    }
    previousTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const newZoom = Math.max(minZoom, Math.min(3, camera.zoom - e.deltaY * zoomSensitivity));
    setCamera(prev => ({ ...prev, zoom: newZoom }));
  };

  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    setCamera(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy
    }));

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsDragging(false);

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

      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        {galaxyState.planetNodes.map(node => (
          <OrbitRing key={`ring-${node.id}`} radius={node.orbitRadius} />
        ))}

        <AnimatePresence>
          <PlanetNode key={`sun-${galaxyState.sunNode.id}`} node={galaxyState.sunNode} zoom={camera.zoom} />

          {galaxyState.planetNodes.map(node => (
            <PlanetNode key={`planet-${node.id}`} node={node} zoom={camera.zoom} />
          ))}

          {galaxyState.moonNodes.map(node => (
            <MoonNode key={`moon-${node.id}`} node={node} zoom={camera.zoom} />
          ))}
        </AnimatePresence>
      </div>

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
            <option value="TVL">Sort by TVL</option>
            <option value="MarketCap">Sort by Market Cap</option>
            <option value="Volume24h">Sort by Volume</option>
            <option value="Change24h">Sort by 24h Change</option>
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

      {/* Footer with API attribution and donation */}
      <Footer />
    </div>
  );
}
