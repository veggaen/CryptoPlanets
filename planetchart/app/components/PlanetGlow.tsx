"use client";

import { motion } from "framer-motion";

type GlowProps = {
    x: number;
    y: number;
    radius: number;
    color: string;
    type: "blackhole" | "chain" | "token";
    priceChange: number;
};

export function PlanetGlow({ x, y, radius, color, type, priceChange }: GlowProps) {
    // Determine glow color based on price change
    const glowColor =
        priceChange >= 2
            ? "rgba(16, 185, 129, 0.6)" // green for strong positive
            : priceChange > 0
                ? "rgba(16, 185, 129, 0.3)" // light green
                : priceChange <= -2
                    ? "rgba(239, 68, 68, 0.6)" // red for strong negative
                    : priceChange < 0
                        ? "rgba(239, 68, 68, 0.3)" // light red
                        : "rgba(100, 116, 139, 0.3)"; // neutral gray

    if (type === "blackhole") {
        // Special accretion disk effect for Bitcoin
        return (
            <div
                className="absolute pointer-events-none"
                style={{
                    left: x - radius * 1.8,
                    top: y - radius * 1.8,
                    width: radius * 3.6,
                    height: radius * 3.6,
                }}
            >
                {/* Outer rotating ring */}
                <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background: `radial-gradient(circle, transparent 45%, rgba(251, 191, 36, 0.3) 50%, rgba(249, 115, 22, 0.4) 55%, transparent 65%)`,
                    }}
                    animate={{ rotate: 360 }}
                    transition={{
                        duration: 30,
                        repeat: Infinity,
                        ease: "linear",
                    }}
                />

                {/* Inner rotating ring (counter-rotation) */}
                <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background: `radial-gradient(circle, transparent 35%, rgba(251, 191, 36, 0.2) 40%, transparent 50%)`,
                    }}
                    animate={{ rotate: -360 }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "linear",
                    }}
                />

                {/* Pulsing outer glow */}
                <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background: `radial-gradient(circle, transparent 60%, rgba(251, 191, 36, 0.15) 80%, transparent)`,
                        filter: "blur(12px)",
                    }}
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.5, 0.8, 0.5],
                    }}
                    transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
            </div>
        );
    }

    if (type === "chain") {
        // Pulsing glow for chain centers
        return (
            <motion.div
                className="absolute pointer-events-none rounded-full"
                style={{
                    left: x - radius * 1.5,
                    top: y - radius * 1.5,
                    width: radius * 3,
                    height: radius * 3,
                    background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                    filter: "blur(20px)",
                }}
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.4, 0.7, 0.4],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />
        );
    }

    // Subtle shimmer for token planets
    return (
        <motion.div
            className="absolute pointer-events-none rounded-full"
            style={{
                left: x - radius * 1.3,
                top: y - radius * 1.3,
                width: radius * 2.6,
                height: radius * 2.6,
                background: `radial-gradient(circle, ${glowColor} 0%, transparent 60%)`,
                filter: "blur(10px)",
            }}
            animate={{
                opacity: [0.2, 0.4, 0.2],
                scale: [1, 1.1, 1],
            }}
            transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
            }}
        />
    );
}
