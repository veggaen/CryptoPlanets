"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

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

// Helper function to generate stars (called only on client)
function generateStarLayers() {
  const layers: { stars: Star[]; layer: "far" | "mid" | "near" }[] = [];

  // Far layer: many small, dim stars
  const farStars: Star[] = Array.from({ length: 150 }, (_, i) => ({
    id: `far-${i}`,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 1 + 0.5,
    opacity: Math.random() * 0.3 + 0.2,
    animationDuration: Math.random() * 3 + 2,
  }));

  // Mid layer: moderate amount of medium stars
  const midStars: Star[] = Array.from({ length: 80 }, (_, i) => ({
    id: `mid-${i}`,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 1.5 + 1,
    opacity: Math.random() * 0.4 + 0.3,
    animationDuration: Math.random() * 4 + 3,
  }));

  // Near layer: fewer large, bright stars
  const nearStars: Star[] = Array.from({ length: 40 }, (_, i) => ({
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
function generateShootingStars(): ShootingStar[] {
  return Array.from({ length: 3 }, (_, i) => ({
    id: `shooting-${i}`,
    startX: Math.random() * 100,
    startY: Math.random() * 50,
    angle: Math.random() * 30 + 30, // 30-60 degrees
  }));
}

export default function Starfield() {
  // Initialize with empty arrays (deterministic for SSR)
  const [starLayers, setStarLayers] = useState<{ stars: Star[]; layer: "far" | "mid" | "near" }[]>([]);
  const [shootingStars, setShootingStars] = useState<ShootingStar[]>([]);

  // Generate stars only on client side after mount
  useEffect(() => {
    setStarLayers(generateStarLayers());
    setShootingStars(generateShootingStars());
  }, []);

  // Don't render stars until client-side hydration is complete
  if (starLayers.length === 0) {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Nebula gradient overlays - these are deterministic */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10 animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute inset-0 bg-gradient-to-tl from-pink-900/10 via-transparent to-transparent animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Nebula gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10 animate-pulse" style={{ animationDuration: "8s" }} />
      <div className="absolute inset-0 bg-gradient-to-tl from-pink-900/10 via-transparent to-transparent animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />

      {/* Star layers with parallax */}
      {starLayers.map(({ stars, layer }) => (
        <motion.div
          key={layer}
          className="absolute inset-0"
          animate={{
            x: layer === "far" ? [0, -10, 0] : layer === "mid" ? [0, -20, 0] : [0, -30, 0],
            y: layer === "far" ? [0, -5, 0] : layer === "mid" ? [0, -10, 0] : [0, -15, 0],
          }}
          transition={{
            duration: layer === "far" ? 60 : layer === "mid" ? 40 : 30,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {stars.map((star) => (
            <motion.div
              key={star.id}
              className="absolute rounded-full bg-white"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                boxShadow: `0 0 ${star.size * 2}px rgba(255, 255, 255, ${star.opacity * 0.5})`,
              }}
              animate={{
                opacity: [star.opacity, star.opacity * 0.5, star.opacity],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: star.animationDuration,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>
      ))}

      {/* Shooting stars */}
      {shootingStars.map((shootingStar, idx) => (
        <motion.div
          key={shootingStar.id}
          className="absolute w-1 h-1 bg-white rounded-full"
          style={{
            left: `${shootingStar.startX}%`,
            top: `${shootingStar.startY}%`,
            boxShadow: "0 0 4px 2px rgba(255, 255, 255, 0.8)",
          }}
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: [0, 150],
            y: [0, 150 * Math.tan((shootingStar.angle * Math.PI) / 180)],
          }}
          transition={{
            duration: 2,
            delay: idx * 8 + 5,
            repeat: Infinity,
            repeatDelay: 15,
            ease: "easeOut",
          }}
        >
          {/* Tail effect */}
          <div
            className="absolute top-0 right-0 h-[1px] bg-gradient-to-r from-white to-transparent"
            style={{
              width: "40px",
              transform: `rotate(${-shootingStar.angle}deg)`,
              transformOrigin: "right center",
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}
