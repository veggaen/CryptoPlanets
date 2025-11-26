import { WeightMode } from "@/config/dataConfig";

/**
 * Format a number as USD currency
 * @param value - The number to format
 * @returns Formatted USD string (e.g., "$1,234.56")
 */
export function formatUSD(value: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: value < 1 ? 4 : 2,
        maximumFractionDigits: value < 1 ? 4 : 2,
    }).format(value);
}

/**
 * Format a large number as compact USD (K, M, B, T)
 * @param value - The number to format
 * @returns Compact USD string (e.g., "$1.2M", "$850B")
 */
export function formatCompactUSD(value: number): string {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
}

/**
 * Get label for a weight mode metric
 * @param mode - The weight mode
 * @param value - The value for that metric
 * @returns Formatted label (e.g., "MCap: $1.2T", "TVL: $850B")
 */
export function getWeightModeLabel(mode: WeightMode, value: number): string {
    switch (mode) {
        case 'MarketCap':
            return `MCap: ${formatCompactUSD(value)}`;
        case 'TVL':
            return `TVL: ${formatCompactUSD(value)}`;
        case 'Volume24h':
            return `24h Vol: ${formatCompactUSD(value)}`;
        case 'Change24h':
            return `24h: ${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
        case 'Change7d':
            return `7d: ${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
        case 'Change30d':
            return `30d: ${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
        default:
            return '';
    }
}

/**
 * Format percentage change with color indication
 * @param change - The percentage change value
 * @returns Formatted string (e.g., "+2.5%", "-1.3%")
 */
export function formatPercentChange(change: number): string {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
}
