"use client";

import { useCallback, useRef } from "react";

/**
 * Positions a map's hover tooltip next to the pointer WITHOUT React state.
 *
 * Every map on the site used to store the mouse position in useState and update it on every
 * mousemove — ~60 updates a second, each one re-rendering the whole component and therefore
 * every one of its Geography paths (3,100 counties on the national map). The pointer position
 * is not something React needs to know about: this hook keeps it in a ref and moves the
 * tooltip element directly, flipping it to the other side of the cursor near the container's
 * edges exactly as the old inline math did. Only a change of the hovered feature (a boundary
 * crossing) re-renders the component.
 *
 *   const tip = useMapTooltip();
 *   <div onMouseMove={tip.onMouseMove}>
 *     {hovered && <div ref={tip.tooltipRef} className="absolute" style={{ width: 180 }}>…</div>}
 *
 * The tooltip is placed from the last known pointer position the moment it mounts (the ref
 * callback runs before paint), so it never flashes at the container's origin.
 */
export function useMapTooltip(offset = 14, pad = 8) {
  const pos = useRef({ x: 0, y: 0, w: 800, h: 520 });
  const el = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const node = el.current;
    if (!node) return;
    const { x, y, w, h } = pos.current;
    const tipW = node.offsetWidth;
    const tipH = node.offsetHeight;
    let left = x + offset;
    let top = y + offset;
    if (left + tipW + pad > w) left = x - tipW - offset;
    if (top + tipH + pad > h) top = y - tipH - offset;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }, [offset, pad]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height };
    place();
  }, [place]);

  const tooltipRef = useCallback((node: HTMLDivElement | null) => {
    el.current = node;
    if (node) place();
  }, [place]);

  return { onMouseMove, tooltipRef };
}
