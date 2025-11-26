"use client";

import { motion } from "framer-motion";

type OrbitPath = {
    id: string;
    centerX: number;
    centerY: number;
    radius: number;
    color: string;
    opacity: number;
};

type OrbitalTrailsProps = {
    width: number;
    height: number;
    orbits: OrbitPath[];
    showTrails: boolean;
};

export default function OrbitalTrails({
    width,
    height,
    orbits,
    showTrails = true,
}: OrbitalTrailsProps) {
    if (!showTrails || !width || !height) return null;

    return (
        <svg
            className="absolute inset-0 pointer-events-none"
            width={width}
            height={height}
            style={{ overflow: "visible" }}
        >
            <defs>
                {/* Glow filter for orbital paths */}
                <filter id="orbit-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                {/* Dashed pattern */}
                <pattern
                    id="dash-pattern"
                    patternUnits="userSpaceOnUse"
                    width="10"
                    height="10"
                >
                    <line
                        x1="0"
                        y1="0"
                        x2="10"
                        y2="0"
                        stroke="currentColor"
                        strokeWidth="1"
                    />
                </pattern>
            </defs>

            {orbits.map((orbit) => (
                <motion.g key={orbit.id}>
                    {/* Main orbital path */}
                    <motion.circle
                        cx={orbit.centerX}
                        cy={orbit.centerY}
                        r={orbit.radius}
                        fill="none"
                        stroke={orbit.color}
                        strokeWidth="1.5"
                        strokeDasharray="8 12"
                        opacity={orbit.opacity}
                        filter="url(#orbit-glow) drop-shadow(0 0 2px rgba(6,182,212,0.3))"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: orbit.opacity }}
                        transition={{
                            pathLength: { duration: 2, ease: "easeInOut" },
                            opacity: { duration: 1 },
                        }}
                    />

                    {/* Subtle rotating indicator on the path */}
                    <motion.circle
                        cx={orbit.centerX + orbit.radius}
                        cy={orbit.centerY}
                        r="3"
                        fill={orbit.color}
                        opacity={orbit.opacity * 0.6}
                        filter="url(#orbit-glow)"
                        animate={{
                            cx: [
                                orbit.centerX + orbit.radius,
                                orbit.centerX,
                                orbit.centerX - orbit.radius,
                                orbit.centerX,
                                orbit.centerX + orbit.radius,
                            ],
                            cy: [
                                orbit.centerY,
                                orbit.centerY + orbit.radius,
                                orbit.centerY,
                                orbit.centerY - orbit.radius,
                                orbit.centerY,
                            ],
                        }}
                        transition={{
                            duration: 20,
                            repeat: Infinity,
                            ease: "linear",
                        }}
                    />
                </motion.g>
            ))}
        </svg>
    );
}
