"use client";

import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { OrthographicView, OrthographicController } from "@deck.gl/core";
import type { PickingInfo } from "@deck.gl/core";
import type { GalaxyNode } from "@/types/galaxy";

function hexToRgb(hex: string, fallback: [number, number, number] = [248, 250, 252]): [number, number, number] {
  const normalized = hex?.replace("#", "");
  if (!normalized || (normalized.length !== 6 && normalized.length !== 3)) {
    return fallback;
  }
  const expanded = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;
  const intVal = Number.parseInt(expanded, 16);
  if (Number.isNaN(intVal)) {
    return fallback;
  }
  return [
    (intVal >> 16) & 255,
    (intVal >> 8) & 255,
    intVal & 255,
  ];
}

export type DeckGalaxyPrototypeProps = {
  nodes: GalaxyNode[];
  highlightedId?: string | null;
  viewState: {
    target: [number, number, number];
    zoom: number;
  };
  interactive?: boolean;
  onNodeClick?: (payload: { node: GalaxyNode; x: number; y: number; isRightClick: boolean }) => void;
  onViewStateChange?: (viewState: { target: [number, number, number]; zoom: number }) => void;
  className?: string;
  disablePointerEvents?: boolean;
};

const view = new OrthographicView({ id: "ortho", flipY: false });

type DeckDatum = {
  id: string;
  node: GalaxyNode;
  position: [number, number, number];
  radius: number;
  color: [number, number, number];
  strokeColor: [number, number, number];
  type: GalaxyNode["type"];
};

const TYPE_FALLBACK_COLORS: Record<GalaxyNode["type"], [number, number, number]> = {
  sun: [251, 191, 36],
  planet: [96, 165, 250],
  moon: [148, 163, 184],
  meteorite: [248, 113, 113],
};

function extractColorString(node: GalaxyNode): string | null {
  const primary = typeof node.color === "string" ? node.color : null;
  const dataColor = (node.data as Record<string, unknown>)?.color;
  const candidate = typeof dataColor === "string" ? dataColor : primary;
  if (!candidate) return null;
  if (candidate.startsWith("#")) return candidate;
  if (candidate.startsWith("rgb")) return candidate;
  const gradientHex = candidate.match(/#([0-9a-fA-F]{3,8})/);
  if (gradientHex) {
    return gradientHex[0];
  }
  return null;
}

function parseColor(node: GalaxyNode, highlighted: boolean): [number, number, number] {
  if (highlighted) {
    return [255, 255, 255];
  }

  const candidate = extractColorString(node);
  if (candidate) {
    if (candidate.startsWith("rgb")) {
      const values = candidate.match(/\d+(\.\d+)?/g)?.slice(0, 3).map((v) => Number.parseFloat(v));
      if (values && values.length === 3 && values.every((n) => Number.isFinite(n))) {
        return [values[0], values[1], values[2]] as [number, number, number];
      }
    }
    return hexToRgb(candidate, TYPE_FALLBACK_COLORS[node.type]);
  }

  return TYPE_FALLBACK_COLORS[node.type];
}

export default function DeckGalaxyPrototype({
  nodes,
  highlightedId,
  viewState,
  interactive = false,
  onNodeClick,
  onViewStateChange,
  className,
  disablePointerEvents,
}: DeckGalaxyPrototypeProps) {
  const data = useMemo(() => {
    return nodes.map((node) => {
      const highlight = node.id === highlightedId;
      const baseColor = parseColor(node, highlight);
      const radius = Math.max(4, node.radius || 1);
      return {
        id: node.id,
        node,
        position: [node.x, node.y, 0],
        radius,
        color: highlight ? [255, 255, 255] : baseColor,
        strokeColor: highlight ? [255, 255, 255] : baseColor,
        type: node.type,
      };
    });
  }, [nodes, highlightedId]);

  const scatterLayer = useMemo(() => {
    return new ScatterplotLayer({
      id: "deck-galaxy-layer",
      data,
      getPosition: (d: DeckDatum) => d.position,
      getRadius: (d: DeckDatum) => d.radius,
      radiusScale: 1,
      radiusMinPixels: 2,
      radiusMaxPixels: 220,
      getFillColor: (d: DeckDatum) => d.color,
      getLineColor: (d: DeckDatum) => d.strokeColor,
      lineWidthUnits: "pixels",
      stroked: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [253, 224, 71, 180],
      opacity: 0.9,
      onClick: (info: PickingInfo<DeckDatum>) => {
        const picked = info.object ?? undefined;
        if (!picked || !onNodeClick) return;
        const sourceEvent = (info as { sourceEvent?: MouseEvent }).sourceEvent;
        const isRightClick = Boolean(sourceEvent && (sourceEvent.button === 2 || sourceEvent.which === 3));
        const clientX = sourceEvent?.clientX ?? (typeof info.x === "number" ? info.x : 0);
        const clientY = sourceEvent?.clientY ?? (typeof info.y === "number" ? info.y : 0);
        onNodeClick({
          node: picked.node,
          x: clientX,
          y: clientY,
          isRightClick,
        });
      },
    });
  }, [data, onNodeClick]);

  const containerClass = className ?? "w-full h-[420px] rounded-xl border border-white/10 overflow-hidden bg-black/60";

  return (
    <div
      className={containerClass}
      style={disablePointerEvents ? { pointerEvents: "none" } : undefined}
      data-pointer-sink={!disablePointerEvents}
    >
      <DeckGL
        views={view}
        controller={interactive ? { type: OrthographicController, dragMode: "pan", inertia: 0 } : false}
        viewState={{
          ...viewState,
          minZoom: -15,
          maxZoom: 6,
        }}
        onViewStateChange={(info) => {
          if (interactive && onViewStateChange) {
            const nextTarget = Array.isArray(info.viewState.target)
              ? (info.viewState.target as [number, number, number])
              : viewState.target;
            const nextZoom = typeof info.viewState.zoom === "number" ? info.viewState.zoom : viewState.zoom;
            onViewStateChange({
              target: nextTarget,
              zoom: nextZoom,
            });
          }
        }}
        layers={[scatterLayer]}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
