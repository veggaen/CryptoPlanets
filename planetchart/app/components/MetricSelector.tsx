import React from 'react';
import { WeightMode } from '@/types/galaxy';
import { dataConfig } from '@/config/dataConfig';

interface MetricSelectorProps {
    currentMode: WeightMode;
    onModeChange: (mode: WeightMode) => void;
}

export const MetricSelector: React.FC<MetricSelectorProps> = ({ currentMode, onModeChange }) => {
    return (
        <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
            <div className="text-xs text-cyan-400 font-mono tracking-wider uppercase opacity-70">
                Galaxy Metric
            </div>
            <div className="flex gap-2 bg-slate-900/50 backdrop-blur-md p-1 rounded-lg border border-white/10">
                {dataConfig.supportedWeightModes.slice(0, 3).map((mode) => (
                    <button
                        key={mode}
                        onClick={() => onModeChange(mode)}
                        className={`
                            px-3 py-1.5 rounded-md text-xs font-bold transition-all duration-300
                            ${currentMode === mode
                                ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)] border border-cyan-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }
                        `}
                    >
                        {mode === 'MarketCap' ? 'M. CAP' : mode.toUpperCase().replace('24H', '')}
                    </button>
                ))}
            </div>
        </div>
    );
};
