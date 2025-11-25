// Phase 1: Math Utilities
// Basic vector math and common calculations for physics engine

import type { Vector2D, BoundingBox } from "@/types/galaxy";

// ===== Clamping =====

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// ===== Linear Interpolation =====

/**
 * Linear interpolation between a and b by factor t (0-1)
 */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Inverse lerp: given value in range [a, b], return t (0-1)
 */
export function inverseLerp(a: number, b: number, value: number): number {
    if (a === b) return 0;
    return clamp((value - a) / (b - a), 0, 1);
}

/**
 * Remap value from one range to another
 */
export function remap(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
): number {
    const t = inverseLerp(inMin, inMax, value);
    return lerp(outMin, outMax, t);
}

// ===== Vector Operations =====

/**
 * Calculate distance between two points
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate distance between two vectors
 */
export function distanceVec(v1: Vector2D, v2: Vector2D): number {
    return distance(v1.x, v1.y, v2.x, v2.y);
}

/**
 * Calculate squared distance (faster, no sqrt)
 */
export function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

/**
 * Normalize a vector to unit length
 * Returns { x: 0, y: 0 } if magnitude is 0
 */
export function normalize(x: number, y: number): Vector2D {
    const mag = Math.sqrt(x * x + y * y);
    if (mag === 0) return { x: 0, y: 0 };
    return { x: x / mag, y: y / mag };
}

/**
 * Vector magnitude (length)
 */
export function magnitude(x: number, y: number): number {
    return Math.sqrt(x * x + y * y);
}

/**
 * Dot product of two vectors
 */
export function dot(x1: number, y1: number, x2: number, y2: number): number {
    return x1 * x2 + y1 * y2;
}

/**
 * Add two vectors
 */
export function addVec(v1: Vector2D, v2: Vector2D): Vector2D {
    return { x: v1.x + v2.x, y: v1.y + v2.y };
}

/**
 * Subtract two vectors
 */
export function subVec(v1: Vector2D, v2: Vector2D): Vector2D {
    return { x: v1.x - v2.x, y: v1.y - v2.y };
}

/**
 * Scale a vector by a scalar
 */
export function scaleVec(v: Vector2D, scalar: number): Vector2D {
    return { x: v.x * scalar, y: v.y * scalar };
}

// ===== Angles =====

/**
 * Calculate angle between two points in radians
 */
export function angleBetween(x1: number, y1: number, x2: number, y2: number): number {
    return Math.atan2(y2 - y1, x2 - x1);
}

/**
 * Normalize angle to range [-PI, PI]
 */
export function normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

/**
 * Calculate shortest angular difference between two angles
 */
export function angleDifference(a1: number, a2: number): number {
    return normalizeAngle(a2 - a1);
}

/**
 * Convert degrees to radians
 */
export function degToRad(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function radToDeg(radians: number): number {
    return radians * (180 / Math.PI);
}

// ===== Easing Functions =====

/**
 * Smooth step (ease in-out cubic)
 */
export function smoothStep(t: number): number {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * Ease out cubic
 */
export function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

/**
 * Ease in cubic
 */
export function easeInCubic(t: number): number {
    return Math.pow(clamp(t, 0, 1), 3);
}

/**
 * Ease in-out cubic
 */
export function easeInOutCubic(t: number): number {
    t = clamp(t, 0, 1);
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ===== Random =====

/**
 * Random number between min and max
 */
export function randomRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/**
 * Random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random point in a circle
 */
export function randomInCircle(radius: number): Vector2D {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    return {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
    };
}

// ===== Bounding Box =====

/**
 * Check if point is inside bounding box
 */
export function isPointInBox(x: number, y: number, box: BoundingBox): boolean {
    return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

/**
 * Check if two bounding boxes overlap
 */
export function doBoxesOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
    return !(
        box1.maxX < box2.minX ||
        box1.minX > box2.maxX ||
        box1.maxY < box2.minY ||
        box1.minY > box2.maxY
    );
}

/**
 * Create bounding box from center point and radius
 */
export function createBoxFromCircle(x: number, y: number, radius: number): BoundingBox {
    return {
        minX: x - radius,
        minY: y - radius,
        maxX: x + radius,
        maxY: y + radius,
    };
}

// ===== Collision Detection =====

/**
 * Check if two circles overlap
 */
export function circlesOverlap(
    x1: number,
    y1: number,
    r1: number,
    x2: number,
    y2: number,
    r2: number
): boolean {
    const distSq = distanceSquared(x1, y1, x2, y2);
    const radiiSum = r1 + r2;
    return distSq < radiiSum * radiiSum;
}

// ===== Numeric Utilities =====

/**
 * Check if number is approximately zero
 */
export function isNearZero(value: number, epsilon: number = 0.0001): boolean {
    return Math.abs(value) < epsilon;
}

/**
 * Check if two numbers are approximately equal
 */
export function areEqual(a: number, b: number, epsilon: number = 0.0001): boolean {
    return Math.abs(a - b) < epsilon;
}

/**
 * Round to N decimal places
 */
export function roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}
