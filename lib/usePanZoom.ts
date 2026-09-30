"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

// Pan/zoom for a hand-drawn d3-geo SVG: wheel zooms about the cursor, drag pans, two-finger pinch
// zooms on touch. Apply `transform` to a <g> wrapping the paths (and give stroked paths
// vector-effect="non-scaling-stroke"). The view is clamped so the map always fills the frame.
// A drag of more than a few pixels swallows the click that ends it, so panning never selects.

export type PanZoom = { k: number; x: number; y: number };
const IDENTITY: PanZoom = { k: 1, x: 0, y: 0 };
const DRAG_TOLERANCE = 4;

export function usePanZoom(width: number, height: number, maxZoom = 12) {
  const [view, setView] = useState<PanZoom>(IDENTITY);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; startX: number; startY: number } | null>(null);
  const suppressClick = useRef(false);

  const clamp = useCallback((v: PanZoom): PanZoom => {
    const k = Math.min(maxZoom, Math.max(1, v.k));
    return { k, x: Math.min(0, Math.max(width * (1 - k), v.x)), y: Math.min(0, Math.max(height * (1 - k), v.y)) };
  }, [width, height, maxZoom]);

  const zoomAbout = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const k = Math.min(maxZoom, Math.max(1, v.k * factor));
      const f = k / v.k;
      return clamp({ k, x: px - (px - v.x) * f, y: py - (py - v.y) * f });
    });
  }, [clamp, maxZoom]);

  // Reset when the frame is resized: the paths are re-projected to the new size.
  const [frame, setFrame] = useState(`${width}x${height}`);
  if (frame !== `${width}x${height}`) {
    setFrame(`${width}x${height}`);
    setView(IDENTITY);
  }

  // Wheel needs a non-passive native listener so it can stop the page from scrolling.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAbout(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const local = (e: ReactPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      gesture.current = { moved: 0, startX: p.x, startY: p.y };
      suppressClick.current = false;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const p = local(e);
    const pts = [...pointers.current.entries()];
    if (pts.length === 1) {
      const g = gesture.current;
      g.moved = Math.max(g.moved, Math.hypot(p.x - g.startX, p.y - g.startY));
      if (g.moved > DRAG_TOLERANCE) {
        if (!svgRef.current!.hasPointerCapture(e.pointerId)) svgRef.current!.setPointerCapture(e.pointerId);
        suppressClick.current = true;
        setView((v) => clamp({ ...v, x: v.x + p.x - prev.x, y: v.y + p.y - prev.y }));
      }
    } else if (pts.length === 2) {
      const other = pts.find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      suppressClick.current = true;
      if (before > 0) zoomAbout(after / before, (p.x + other.x) / 2, (p.y + other.y) / 2);
    }
    pointers.current.set(e.pointerId, p);
  };

  const onPointerEnd = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  const onClickCapture = (e: ReactMouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation();
      suppressClick.current = false;
    }
  };

  const zoomBy = (factor: number) => zoomAbout(factor, width / 2, height / 2);
  const reset = () => setView(IDENTITY);

  return {
    view,
    transform: `translate(${view.x},${view.y}) scale(${view.k})`,
    zoomed: view.k > 1.001,
    zoomBy,
    reset,
    svgProps: {
      ref: svgRef,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
      style: { display: "block", touchAction: "none", cursor: "grab" } as const,
    },
  };
}
