interface Point {
  x: number;
  y: number;
}

interface Viewport extends Point {
  zoom: number;
}

export function calculateDroppedNodePosition(
  client: Point,
  canvas: {left: number; top: number},
  viewport: Viewport,
  dragOffset: Point,
) {
  return {
    x: (client.x - canvas.left - viewport.x) / viewport.zoom - dragOffset.x,
    y: (client.y - canvas.top - viewport.y) / viewport.zoom - dragOffset.y,
  };
}
