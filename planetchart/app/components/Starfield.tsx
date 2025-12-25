"use client";

import { useState, useEffect } from "react";
import type { QualityMode } from "@/types/performance";

type Star = {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  animationDuration: number;
};

type ShootingStar = {
  id: string;
  startX: number;
  startY: number;
  angle: number;
};

const STAR_COUNTS = {
  full: { far: 150, mid: 80, near: 40, shooting: 3 },
  lite: { far: 60, mid: 30, near: 12, shooting: 1 },
} as const;

// Helper function to generate stars (called only on client)
function generateStarLayers(qualityMode: QualityMode) {
  const layers: { stars: Star[]; layer: "far" | "mid" | "near" }[] = [];
  const counts = STAR_COUNTS[qualityMode];

  // Far layer: many small, dim stars
  const farStars: Star[] = Array.from({ length: counts.far }, (_, i) => ({
    id: `far-${i}`,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 1 + 0.5,
    opacity: Math.random() * 0.3 + 0.2,
    animationDuration: Math.random() * 3 + 2,
  }));

  // Mid layer: moderate amount of medium stars
  const midStars: Star[] = Array.from({ length: counts.mid }, (_, i) => ({
    id: `mid-${i}`,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 1.5 + 1,
    opacity: Math.random() * 0.4 + 0.3,
    animationDuration: Math.random() * 4 + 3,
  }));

  // Near layer: fewer large, bright stars
  const nearStars: Star[] = Array.from({ length: counts.near }, (_, i) => ({
    id: `near-${i}`,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1.5,
    opacity: Math.random() * 0.5 + 0.4,
    animationDuration: Math.random() * 5 + 4,
  }));

  layers.push(
    { stars: farStars, layer: "far" },
    { stars: midStars, layer: "mid" },
    { stars: nearStars, layer: "near" }
  );

  return layers;
}

// Helper function to generate shooting stars (called only on client)
function generateShootingStars(qualityMode: QualityMode): ShootingStar[] {
  const count = STAR_COUNTS[qualityMode].shooting;
  return Array.from({ length: count }, (_, i) => ({
    id: `shooting-${i}`,
    startX: Math.random() * 100,
    startY: Math.random() * 50,
    angle: Math.random() * 30 + 30, // 30-60 degrees
  }));
}

export default function Starfield({ qualityMode }: { qualityMode: QualityMode }) {
  // Initialize with empty arrays (deterministic for SSR)
  const [starLayers, setStarLayers] = useState<{ stars: Star[]; layer: "far" | "mid" | "near" }[]>([]);
  const [shootingStars, setShootingStars] = useState<ShootingStar[]>([]);

  // Generate stars only on client side after mount
  useEffect(() => {
    setStarLayers(generateStarLayers(qualityMode));
    setShootingStars(generateShootingStars(qualityMode));
  }, [qualityMode]);

  // Don't render stars until client-side hydration is complete
  if (starLayers.length === 0) {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Nebula gradient overlays - these are deterministic */}
        <div className="absolute inset-0 bg-linear-to-br from-purple-900/10 via-transparent to-blue-900/10 animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute inset-0 bg-linear-to-tl from-pink-900/10 via-transparent to-transparent animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Nebula gradient overlays */}
      <div className="absolute inset-0 bg-linear-to-br from-purple-900/10 via-transparent to-blue-900/10 animate-pulse" style={{ animationDuration: "8s" }} />
      <div className="absolute inset-0 bg-linear-to-tl from-pink-900/10 via-transparent to-transparent animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />

      {/* Star layers with parallax */}
      {starLayers.map(({ stars, layer }) => (
        <div
          key={layer}
          className="absolute inset-0"
          style={{
            animationName:
              layer === "far"
                ? "planetchart-starfield-drift-far"
                : layer === "mid"
                  ? "planetchart-starfield-drift-mid"
                  : "planetchart-starfield-drift-near",
            animationDuration: layer === "far" ? "60s" : layer === "mid" ? "40s" : "30s",
            animationIterationCount: "infinite",
            animationTimingFunction: "linear",
            willChange: "transform",
            transform: "translate3d(0,0,0)",
          }}
        >
          {stars.map((star) => (
            <div
              key={star.id}
              className="absolute rounded-full bg-white"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                boxShadow: `0 0 ${star.size * 2}px rgba(255, 255, 255, ${star.opacity * 0.5})`,
                animationName: "planetchart-starfield-twinkle",
                animationDuration: `${star.animationDuration}s`,
                animationIterationCount: "infinite",
                animationTimingFunction: "ease-in-out",
                animationDelay: `${(parseInt(star.id.split('-')[1] ?? '0', 10) % 10) * 0.17}s`,
                willChange: "transform, opacity",
              }}
            />
          ))}
        </div>
      ))}

      {/* Shooting stars */}
      {shootingStars.map((shootingStar, idx) => (
        (() => {
          const dy = 150 * Math.tan((shootingStar.angle * Math.PI) / 180);
          return (
        <div
          key={shootingStar.id}
          className="absolute w-1 h-1 bg-white rounded-full"
          style={{
            left: `${shootingStar.startX}%`,
            top: `${shootingStar.startY}%`,
            boxShadow: "0 0 4px 2px rgba(255, 255, 255, 0.8)",
            animationName: "planetchart-starfield-shooting",
            animationDuration: "22s",
            animationDelay: `${idx * 8 + 5}s`,
            animationIterationCount: "infinite",
            animationTimingFunction: "linear",
            willChange: "transform, opacity",
            transform: "translate3d(0,0,0)",
            ['--shoot-dx' as any]: "150px",
            ['--shoot-dy' as any]: `${dy}px`,
          }}
        >
          {/* Tail effect */}
          <div
            className="absolute top-0 right-0 h-px bg-linear-to-r from-white to-transparent"
            style={{
              width: "40px",
              transform: `rotate(${-shootingStar.angle}deg)`,
              transformOrigin: "right center",
            }}
          />
        </div>
          );
        })()
      ))}
    </div>
  );
}
