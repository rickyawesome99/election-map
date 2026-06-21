type MapZoomEvent = {
  type?: string;
  ctrlKey?: boolean;
  button?: number;
  touches?: { length: number };
};

export function filterMapZoomEvent(event: MapZoomEvent): boolean {
  if (event.type === "dblclick") {
    return false;
  }

  if (event.type === "touchstart") {
    return (event.touches?.length ?? 0) > 0;
  }

  return !event.ctrlKey && !event.button;
}
