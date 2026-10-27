import { useInternalNode, type EdgeProps } from '@xyflow/react';
import type { ModelEdge } from '../../types/model';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds the point on `rect` perimeter that is closest to `targetPoint`.
 */
function closestPointOnRect(
  rect: Rect,
  targetPoint: { x: number; y: number }
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = targetPoint.x - cx;
  const dy = targetPoint.y - cy;

  if (dx === 0 && dy === 0) {
    return { x: cx, y: rect.y };
  }

  const halfW = Math.max(1, rect.width / 2);
  const halfH = Math.max(1, rect.height / 2);

  // Ray from center (cx, cy) towards targetPoint: find intersection with rectangle boundary
  const scaleX = halfW / Math.abs(dx || 1e-6);
  const scaleY = halfH / Math.abs(dy || 1e-6);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  };
}

/**
 * Computes the closest perimeter points between two axis-aligned rectangles.
 */
function computeClosestRectPoints(
  a: Rect,
  b: Rect
): { x1: number; y1: number; x2: number; y2: number } {
  const centerB = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

  // Two-pass refinement so off-center overlap still snaps to the closest edge point
  const p1Initial = closestPointOnRect(a, centerB);
  const p2 = closestPointOnRect(b, p1Initial);
  const p1 = closestPointOnRect(a, p2);

  return {
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
  };
}

export function NoteEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
}: EdgeProps<ModelEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  let x1 = sourceX;
  let y1 = sourceY;
  let x2 = targetX;
  let y2 = targetY;

  if (sourceNode && targetNode) {
    const a: Rect = {
      x: sourceNode.internals.positionAbsolute.x,
      y: sourceNode.internals.positionAbsolute.y,
      width: sourceNode.measured?.width ?? 195,
      height: sourceNode.measured?.height ?? 95,
    };
    const b: Rect = {
      x: targetNode.internals.positionAbsolute.x,
      y: targetNode.internals.positionAbsolute.y,
      width: targetNode.measured?.width ?? 210,
      height: targetNode.measured?.height ?? 110,
    };
    const pts = computeClosestRectPoints(a, b);
    x1 = pts.x1;
    y1 = pts.y1;
    x2 = pts.x2;
    y2 = pts.y2;
  }

  const stroke = selected ? '#c44528' : '#767065';

  return (
    <g className="react-flow__edge-note">
      {/* Wide invisible hit path for easy clicking */}
      <line
        id={id}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="transparent"
        strokeWidth={18}
        style={{ cursor: 'pointer' }}
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeWidth={selected ? 2.2 : 1.6}
        strokeDasharray="5 4"
      />
      <circle cx={x1} cy={y1} r={3} fill={stroke} />
      <circle cx={x2} cy={y2} r={3} fill={stroke} />
    </g>
  );
}
