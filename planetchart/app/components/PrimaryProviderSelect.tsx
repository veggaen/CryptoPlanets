"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { PrimaryProvider } from "@/types/providers";
import { PRIMARY_PROVIDER_LABELS } from "@/types/providers";

type Variant = "desktop" | "mobile";

interface PrimaryProviderSelectProps {
  value: PrimaryProvider;
  onChange: (provider: PrimaryProvider) => void;
  variant?: Variant;
  title?: string;
}

export function PrimaryProviderSelect({
  value,
  onChange,
  variant = "desktop",
  title,
}: PrimaryProviderSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const providers = useMemo(
    () => Object.keys(PRIMARY_PROVIDER_LABELS) as PrimaryProvider[],
    []
  );

  const currentLabel = PRIMARY_PROVIDER_LABELS[value] ?? value;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (evt: MouseEvent | PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (evt.target instanceof Node && root.contains(evt.target)) return;
      close();
    };

    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        evt.preventDefault();
        close();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const buttonClasses =
    variant === "desktop"
      ? "w-full text-[12px] pl-2.5 pr-8 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
      : "w-full cursor-pointer px-4 py-3 pr-10 rounded-xl bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500/30";

  const menuClasses =
    "absolute left-0 right-0 mt-1 rounded-xl bg-black/70 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden z-50";

  const optionClasses = (active: boolean) =>
    `${
      active
        ? "bg-white/10 text-white"
        : "bg-transparent text-white/80 hover:bg-white/5 hover:text-white"
    } w-full text-left px-3 py-2 text-[12px] transition-colors`;

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        const idx = providers.indexOf(value);
        setActiveIndex(idx >= 0 ? idx : 0);
      } else {
        setActiveIndex(-1);
      }
      return next;
    });
  }, [providers, value]);

  const commit = useCallback(
    (provider: PrimaryProvider) => {
      onChange(provider);
      close();
    },
    [onChange, close]
  );

  const onButtonKeyDown = useCallback(
    (evt: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        toggleOpen();
        return;
      }

      if (evt.key === "ArrowDown") {
        evt.preventDefault();
        if (!open) {
          setOpen(true);
          const idx = providers.indexOf(value);
          setActiveIndex(idx >= 0 ? idx : 0);
          return;
        }
        setActiveIndex((i) => {
          const next = Math.min((i < 0 ? 0 : i) + 1, providers.length - 1);
          return next;
        });
        return;
      }

      if (evt.key === "ArrowUp") {
        evt.preventDefault();
        if (!open) {
          setOpen(true);
          const idx = providers.indexOf(value);
          setActiveIndex(idx >= 0 ? idx : 0);
          return;
        }
        setActiveIndex((i) => {
          const next = Math.max((i < 0 ? 0 : i) - 1, 0);
          return next;
        });
        return;
      }

      if (evt.key === "Escape") {
        evt.preventDefault();
        close();
      }

      if (evt.key === "Tab") {
        close();
      }
    },
    [toggleOpen, open, providers, value, close]
  );

  const onMenuKeyDown = useCallback(
    (evt: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!open) return;

      if (evt.key === "ArrowDown") {
        evt.preventDefault();
        setActiveIndex((i) => Math.min((i < 0 ? 0 : i) + 1, providers.length - 1));
        return;
      }

      if (evt.key === "ArrowUp") {
        evt.preventDefault();
        setActiveIndex((i) => Math.max((i < 0 ? 0 : i) - 1, 0));
        return;
      }

      if (evt.key === "Enter") {
        evt.preventDefault();
        const provider = providers[activeIndex];
        if (provider) commit(provider);
        return;
      }

      if (evt.key === "Escape") {
        evt.preventDefault();
        close();
      }
    },
    [open, providers, activeIndex, commit, close]
  );

  return (
    <div ref={rootRef} className="relative" data-menu-ignore="true">
      <button
        type="button"
        className={`${buttonClasses} text-left relative`}
        onClick={toggleOpen}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
      >
        <span className="block truncate">{currentLabel}</span>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className={menuClasses}
          role="listbox"
          aria-label="Primary data provider"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {providers.map((provider, idx) => {
            const label = PRIMARY_PROVIDER_LABELS[provider] ?? provider;
            const active = idx === activeIndex || provider === value;
            return (
              <button
                key={provider}
                type="button"
                className={optionClasses(active)}
                role="option"
                aria-selected={provider === value}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(provider)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
