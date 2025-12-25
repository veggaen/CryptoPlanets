"use client";

import { memo, useEffect, useState } from "react";

interface RadialMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: string;
  closeOnClick?: boolean;
}

interface RadialMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  items: RadialMenuItem[];
  onClose: () => void;
  title?: string;
  centerContent?: React.ReactNode;
  panelContent?: React.ReactNode;
}

/**
 * RadialMenu - Futuristic circular context menu
 * Opens on right-click with smooth animations
 */
const RadialMenu = memo(({ isOpen, x, y, items, onClose, title, centerContent, panelContent }: RadialMenuProps) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    let frame = 0;
    frame = window.requestAnimationFrame(() => {
      setIsAnimating(isOpen);
    });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const radius = 90; // Distance from center to menu items
  const angleStep = items.length ? (2 * Math.PI) / items.length : 0;
  const startAngle = -Math.PI / 2; // Start from top

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-100"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />

      {/* Centered modal panel (stays centered on screen) */}
      {panelContent && (
        <div
          className={`
            fixed left-1/2 top-1/2 z-101
            pointer-events-auto
            w-[22rem] max-w-[min(92vw,22rem)]
            rounded-2xl
            bg-black/70 backdrop-blur-xl
            border border-white/15
            shadow-2xl shadow-black/60
            overflow-hidden
            transition-all duration-300
            ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
          `}
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          {panelContent}
        </div>
      )}

      {/* Menu Container */}
      <div
        className="fixed z-101 pointer-events-none"
        style={{
          left: x,
          top: y,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Center Hub */}
        <div className={`
          absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
          w-20 h-20 rounded-full
          bg-linear-to-br from-slate-900/95 to-slate-800/95
          border border-white/20
          backdrop-blur-xl
          flex items-center justify-center
          shadow-2xl shadow-black/50
          transition-all duration-300
          ${isAnimating ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}
        `}>
          {/* Inner glow ring */}
          <div className="absolute inset-2 rounded-full border border-cyan-500/30" />
          
          {/* Center content / Title */}
          {centerContent ? (
            <div className="w-full h-full flex items-center justify-center px-2">
              {centerContent}
            </div>
          ) : (
            title && (
              <span className="text-[10px] font-medium text-white/60 uppercase tracking-wider text-center px-2">
                {title}
              </span>
            )
          )}

          {/* Decorative pulse */}
          <div className="absolute inset-0 rounded-full bg-cyan-500/10 animate-ping" style={{ animationDuration: '2s' }} />
        </div>

        {/* Radial Items */}
        {items.map((item, index) => {
          const angle = startAngle + index * angleStep;
          const itemX = Math.cos(angle) * radius;
          const itemY = Math.sin(angle) * radius;

          return (
            <button
              key={item.id}
              onClick={() => {
                item.onClick();
                if (item.closeOnClick !== false) {
                  onClose();
                }
              }}
              className={`
                absolute pointer-events-auto
                w-14 h-14 rounded-full
                flex flex-col items-center justify-center gap-0.5
                bg-linear-to-br from-slate-800/95 to-slate-900/95
                border border-white/20
                backdrop-blur-xl
                shadow-lg shadow-black/30
                hover:border-cyan-400/50 hover:shadow-cyan-500/20
                hover:scale-110
                transition-all duration-200
                group
                ${isAnimating ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
              `}
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${itemX}px), calc(-50% + ${itemY}px))`,
                transitionDelay: `${index * 50}ms`,
              }}
              title={item.label}
            >
              {/* Icon */}
              <div className={`
                w-5 h-5 flex items-center justify-center
                ${item.color || 'text-white/80'}
                group-hover:text-cyan-300
                transition-colors duration-200
              `}>
                {item.icon}
              </div>

              {/* Label */}
              <span className="text-[8px] font-medium text-white/60 group-hover:text-white uppercase tracking-wide">
                {item.label}
              </span>

              {/* Hover glow */}
              <div className="absolute inset-0 rounded-full bg-cyan-500/0 group-hover:bg-cyan-500/10 transition-colors duration-200" />
            </button>
          );
        })}

        {/* Connecting lines */}
        <svg
          className={`
            absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
            pointer-events-none
            transition-opacity duration-300
            ${isAnimating ? 'opacity-100' : 'opacity-0'}
          `}
          width={radius * 2.5}
          height={radius * 2.5}
          style={{ marginLeft: -radius * 1.25, marginTop: -radius * 1.25 }}
        >
          {items.map((_, index) => {
            const angle = startAngle + index * angleStep;
            const innerRadius = 40;
            const x1 = radius * 1.25 + Math.cos(angle) * innerRadius;
            const y1 = radius * 1.25 + Math.sin(angle) * innerRadius;
            const x2 = radius * 1.25 + Math.cos(angle) * (radius - 28);
            const y2 = radius * 1.25 + Math.sin(angle) * (radius - 28);

            return (
              <line
                key={index}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(6, 182, 212, 0.3)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}
        </svg>
      </div>
    </>
  );
});

RadialMenu.displayName = 'RadialMenu';

export default RadialMenu;
