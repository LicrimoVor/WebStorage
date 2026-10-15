export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export const portSides: PortSide[] = ['left', 'right', 'top', 'bottom'];
export const nodeWidth = 260;
export const nodeHeight = 168;
export function nodeDimensions(type: string) {
  if (type === 'material') return {width: 184, height: 112};
  if (type === 'manufactured_item') return {width: 244, height: 156};
  if (type === 'output') return {width: 328, height: 210};
  return {width: nodeWidth, height: nodeHeight};
}
type Point = {x: number; y: number};

const normal: Record<PortSide, Point> = {
  left: {x: -1, y: 0}, right: {x: 1, y: 0}, top: {x: 0, y: -1}, bottom: {x: 0, y: 1},
};

export function portPoint(position: Point, side: PortSide, width = nodeWidth, height = nodeHeight): Point {
  return {
    x: position.x + (side === 'left' ? 0 : side === 'right' ? width : width / 2),
    y: position.y + (side === 'top' ? 0 : side === 'bottom' ? height : height / 2),
  };
}

export function nearestPort(position: Point, pointer: Point, width = nodeWidth, height = nodeHeight): PortSide {
  return portSides.reduce((best, side) => {
    const a = portPoint(position, best, width, height), b = portPoint(position, side, width, height);
    return Math.hypot(b.x - pointer.x, b.y - pointer.y) < Math.hypot(a.x - pointer.x, a.y - pointer.y) ? side : best;
  });
}

export function connectionCurve(source: Point, target: Point, sourceSide: PortSide, targetSide: PortSide) {
  const length = Math.max(50, Math.hypot(target.x - source.x, target.y - source.y) * 0.4);
  const a = {x: source.x + normal[sourceSide].x * length, y: source.y + normal[sourceSide].y * length};
  const b = {x: target.x + normal[targetSide].x * length, y: target.y + normal[targetSide].y * length};
  return {
    path: `M ${source.x} ${source.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${target.x} ${target.y}`,
    label: {x: (source.x + 3 * a.x + 3 * b.x + target.x) / 8, y: (source.y + 3 * a.y + 3 * b.y + target.y) / 8 - 8},
  };
}
