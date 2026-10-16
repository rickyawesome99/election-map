type MapZoomEvent = {
  type?: string;
  ctrlKey?: boolean;
  button?: number;
  touches?: { length: number };
};

/**
 * d3-zoom filter for every react-simple-maps ZoomableGroup: pinch, drag and wheel zoom stay on,
 * double-click and double-tap zoom are off. d3-zoom routes a double tap through its dblclick
 * handler with the `touchend` event, so that type has to be refused as well as `dblclick` (the
 * filter is never consulted for touchend otherwise, so this blocks nothing else).
 */
export function filterMapZoomEvent(event: MapZoomEvent): boolean {
  if (event.type === "dblclick" || event.type === "touchend") {
    return false;
  }

  if (event.type === "touchstart") {
    return (event.touches?.length ?? 0) > 0;
  }

  return !event.ctrlKey && !event.button;
}
