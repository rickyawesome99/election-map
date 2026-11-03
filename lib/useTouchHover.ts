"use client";

import { useEffect } from "react";

/** Hover for a finger. A touch has no hover, so the element marked `data-touch-hover` under the
 *  finger gets `data-touch` (styled as the twin of its :hover rules), and as the finger drags
 *  across them the next one takes over (only one at a time). Pointer events can't do this (a
 *  touch's pointer stays captured by the element it started on), so document touch listeners find
 *  the element under the finger on every move. A touch that turns into a scroll shows nothing: the
 *  highlight waits a beat after the finger lands and is dropped the moment the page scrolls. After
 *  the finger lifts the element lets go a beat later, so a quick tap still shows. `onMove` follows
 *  the finger over the active element (the results cards' tilt) and `onRelease` undoes it. */
export function useTouchHover(onMove?: (el: HTMLElement, clientX: number, clientY: number) => void, onRelease?: (el: HTMLElement) => void) {
  useEffect(() => {
    const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
    let active: HTMLElement | null = null;
    let touching = false, scrolling = false;
    let point: { x: number; y: number } | null = null;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const drop = (el: HTMLElement) => { clearTimeout(timers.get(el)); el.removeAttribute("data-touch"); onRelease?.(el); };
    const release = (el: HTMLElement) => {
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => drop(el), 220));
    };
    const show = () => {
      if (!point || scrolling) return;
      const el = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-touch-hover]") ?? null;
      if (el !== active) {
        if (active) drop(active);
        active = el;
        if (el) { clearTimeout(timers.get(el)); el.setAttribute("data-touch", ""); }
      }
      if (el) onMove?.(el, point.x, point.y);
    };
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      touching = true; scrolling = false;
      point = { x: t.clientX, y: t.clientY };
      clearTimeout(startTimer);
      startTimer = setTimeout(show, 90);
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !touching) return;
      point = { x: t.clientX, y: t.clientY };
      if (active) show();
    };
    const scroll = () => {
      if (!touching) return;
      scrolling = true;
      clearTimeout(startTimer);
      if (active) { drop(active); active = null; }
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length) return;
      clearTimeout(startTimer);
      // A tap shorter than the wait still shows briefly.
      if (!active && !scrolling) show();
      if (active) release(active);
      active = null; touching = false; point = null;
    };
    const opts = { passive: true } as const;
    const scrollOpts = { passive: true, capture: true } as const;
    document.addEventListener("touchstart", start, opts);
    document.addEventListener("touchmove", move, opts);
    document.addEventListener("touchend", end, opts);
    document.addEventListener("touchcancel", end, opts);
    document.addEventListener("scroll", scroll, scrollOpts);
    return () => {
      clearTimeout(startTimer);
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
      document.removeEventListener("scroll", scroll, scrollOpts);
    };
  }, [onMove, onRelease]);
}
