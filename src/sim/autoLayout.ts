import type { LayoutAlgorithm, ModelEdge, ModelNode } from '../types/model';

function getNodeHeight(node: ModelNode): number {
  if (node.type === 'question') return 154;
  if (node.type === 'outcome') {
    return node.data.description ? 148 : 120;
  }
  return 84;
}

function getNodeWidth(node: ModelNode): number {
  if (node.type === 'start' || node.type === 'end') return 160;
  return 235;
}

interface GraphStructure {
  nodeMap: Map<string, ModelNode>;
  incoming: Map<string, string[]>;
  outgoing: Map<string, string[]>;
  layer: Map<string, number>;
  layersMap: Map<number, ModelNode[]>;
  sortedLayerIndices: number[];
}

function buildLayeredStructure(
  nodes: ModelNode[],
  edges: ModelEdge[]
): GraphStructure {
  const nodeMap = new Map<string, ModelNode>();
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
    inDegree.set(n.id, 0);
  }

  for (const e of edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];

  for (const n of nodes) {
    if (n.type === 'start') {
      layer.set(n.id, 0);
    }
    if ((inDegree.get(n.id) ?? 0) === 0) {
      queue.push(n.id);
      if (!layer.has(n.id)) {
        layer.set(n.id, n.type === 'start' ? 0 : 1);
      }
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const u = queue.shift()!;
    visited.add(u);
    const uLayer = layer.get(u) ?? 0;

    for (const v of outgoing.get(u) ?? []) {
      const nextRank = uLayer + 1;
      if ((layer.get(v) ?? -1) < nextRank) {
        layer.set(v, nextRank);
      }
      const deg = (inDegree.get(v) ?? 1) - 1;
      inDegree.set(v, deg);
      if (deg === 0) {
        queue.push(v);
      }
    }
  }

  for (const n of nodes) {
    if (!visited.has(n.id) && !layer.has(n.id)) {
      layer.set(n.id, n.type === 'start' ? 0 : 1);
    }
  }

  let maxNonEndLayer = 0;
  for (const n of nodes) {
    if (n.type !== 'end') {
      maxNonEndLayer = Math.max(maxNonEndLayer, layer.get(n.id) ?? 0);
    }
  }
  for (const n of nodes) {
    if (n.type === 'end') {
      layer.set(n.id, Math.max(layer.get(n.id) ?? 1, maxNonEndLayer + 1));
    }
  }

  const layersMap = new Map<number, ModelNode[]>();
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0;
    const list = layersMap.get(l) ?? [];
    list.push(n);
    layersMap.set(l, list);
  }

  const sortedLayerIndices = Array.from(layersMap.keys()).sort((a, b) => a - b);

  return {
    nodeMap,
    incoming,
    outgoing,
    layer,
    layersMap,
    sortedLayerIndices,
  };
}

/**
 * 1. Layered Left-to-Right (Sugiyama-style with two-pass barycenter smoothing)
 */
function layoutLayeredLR(
  nodes: ModelNode[],
  edges: ModelEdge[],
  xStep = 315,
  verticalGap = 32
): ModelNode[] {
  const { incoming, layersMap, sortedLayerIndices } = buildLayeredStructure(
    nodes,
    edges
  );

  const yCenterById = new Map<string, number>();
  const finalPositionById = new Map<string, { x: number; y: number }>();

  for (let colIdx = 0; colIdx < sortedLayerIndices.length; colIdx++) {
    const l = sortedLayerIndices[colIdx];
    const colNodes = [...layersMap.get(l)!];

    colNodes.sort((a, b) => {
      const aParents = incoming.get(a.id) ?? [];
      const bParents = incoming.get(b.id) ?? [];

      const aBary =
        aParents.length > 0
          ? aParents.reduce(
              (acc, pid) => acc + (yCenterById.get(pid) ?? a.position.y),
              0
            ) / aParents.length
          : a.position.y;

      const bBary =
        bParents.length > 0
          ? bParents.reduce(
              (acc, pid) => acc + (yCenterById.get(pid) ?? b.position.y),
              0
            ) / bParents.length
          : b.position.y;

      if (Math.abs(aBary - bBary) > 1) return aBary - bBary;
      return a.position.y - b.position.y;
    });

    const totalHeight =
      colNodes.reduce((acc, n) => acc + getNodeHeight(n), 0) +
      Math.max(0, colNodes.length - 1) * verticalGap;

    const parentCenters: number[] = [];
    for (const n of colNodes) {
      for (const pid of incoming.get(n.id) ?? []) {
        const py = yCenterById.get(pid);
        if (py !== undefined) parentCenters.push(py);
      }
    }
    const targetCenterY =
      parentCenters.length > 0
        ? parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length
        : 300;

    let cursorY = Math.max(24, Math.round(targetCenterY - totalHeight / 2));
    const x = 60 + colIdx * xStep;

    for (const n of colNodes) {
      const h = getNodeHeight(n);
      finalPositionById.set(n.id, { x, y: cursorY });
      yCenterById.set(n.id, cursorY + h / 2);
      cursorY += h + verticalGap;
    }
  }

  return nodes.map((n) => ({
    ...n,
    position: finalPositionById.get(n.id) ?? n.position,
  }));
}

/**
 * 2. Decision Tree (Subtree-balanced horizontal tree layout)
 * Allocates vertical span proportional to each node's downstream leaf count.
 */
function layoutSubtreeBalancedLR(
  nodes: ModelNode[],
  edges: ModelEdge[]
): ModelNode[] {
  const { outgoing, incoming, layer, layersMap, sortedLayerIndices } =
    buildLayeredStructure(nodes, edges);

  // Compute effective subtree weight bottom-up (right-to-left)
  const weight = new Map<string, number>();
  for (let i = sortedLayerIndices.length - 1; i >= 0; i--) {
    const colNodes = layersMap.get(sortedLayerIndices[i])!;
    for (const n of colNodes) {
      const children = (outgoing.get(n.id) ?? []).filter(
        (cid) => (layer.get(cid) ?? 0) > (layer.get(n.id) ?? 0)
      );
      if (children.length === 0 || n.type === 'end') {
        weight.set(n.id, 1);
      } else {
        const sum = children.reduce(
          (acc, cid) => acc + (weight.get(cid) ?? 1),
          0
        );
        weight.set(n.id, Math.max(1, sum));
      }
    }
  }

  const unitSlotHeight = 165;
  const finalPositionById = new Map<string, { x: number; y: number }>();
  const assignedCenterY = new Map<string, number>();

  for (let colIdx = 0; colIdx < sortedLayerIndices.length; colIdx++) {
    const l = sortedLayerIndices[colIdx];
    const colNodes = [...layersMap.get(l)!];

    // Order by parent's assigned Y center
    colNodes.sort((a, b) => {
      const aParents = incoming.get(a.id) ?? [];
      const bParents = incoming.get(b.id) ?? [];
      const aY =
        aParents.length > 0
          ? aParents.reduce(
              (acc, p) => acc + (assignedCenterY.get(p) ?? 0),
              0
            ) / aParents.length
          : 0;
      const bY =
        bParents.length > 0
          ? bParents.reduce(
              (acc, p) => acc + (assignedCenterY.get(p) ?? 0),
              0
            ) / bParents.length
          : 0;
      if (Math.abs(aY - bY) > 1) return aY - bY;
      return a.id.localeCompare(b.id);
    });

    const totalWeight = colNodes.reduce(
      (acc, n) => acc + (weight.get(n.id) ?? 1),
      0
    );
    const totalBandHeight = Math.max(
      colNodes.length * 155,
      totalWeight * unitSlotHeight
    );

    let cursorY = Math.max(30, 360 - totalBandHeight / 2);
    const x = 60 + colIdx * 320;

    for (const n of colNodes) {
      const w = weight.get(n.id) ?? 1;
      const band = Math.max(
        getNodeHeight(n) + 22,
        (w / totalWeight) * totalBandHeight
      );
      const centerY = cursorY + band / 2;
      const nodeY = Math.round(centerY - getNodeHeight(n) / 2);
      finalPositionById.set(n.id, { x, y: nodeY });
      assignedCenterY.set(n.id, centerY);
      cursorY += band;
    }
  }

  return nodes.map((n) => ({
    ...n,
    position: finalPositionById.get(n.id) ?? n.position,
  }));
}

/**
 * 3. Compact Swimlanes (Tightly grouped horizontal layout with minimal vertical whitespace)
 */
function layoutCompactLR(
  nodes: ModelNode[],
  edges: ModelEdge[]
): ModelNode[] {
  return layoutLayeredLR(nodes, edges, 275, 16);
}

/**
 * 4. Top-to-Bottom Hierarchy (Vertical flowchart)
 */
function layoutLayeredTB(
  nodes: ModelNode[],
  edges: ModelEdge[]
): ModelNode[] {
  const { incoming, layersMap, sortedLayerIndices } = buildLayeredStructure(
    nodes,
    edges
  );

  const xCenterById = new Map<string, number>();
  const finalPositionById = new Map<string, { x: number; y: number }>();
  const horizontalGap = 40;
  const yStep = 210;

  for (let rowIdx = 0; rowIdx < sortedLayerIndices.length; rowIdx++) {
    const l = sortedLayerIndices[rowIdx];
    const rowNodes = [...layersMap.get(l)!];

    rowNodes.sort((a, b) => {
      const aParents = incoming.get(a.id) ?? [];
      const bParents = incoming.get(b.id) ?? [];
      const aBary =
        aParents.length > 0
          ? aParents.reduce(
              (acc, pid) => acc + (xCenterById.get(pid) ?? a.position.x),
              0
            ) / aParents.length
          : a.position.x;
      const bBary =
        bParents.length > 0
          ? bParents.reduce(
              (acc, pid) => acc + (xCenterById.get(pid) ?? b.position.x),
              0
            ) / bParents.length
          : b.position.x;
      if (Math.abs(aBary - bBary) > 1) return aBary - bBary;
      return a.position.x - b.position.x;
    });

    const totalWidth =
      rowNodes.reduce((acc, n) => acc + getNodeWidth(n), 0) +
      Math.max(0, rowNodes.length - 1) * horizontalGap;

    const parentCenters: number[] = [];
    for (const n of rowNodes) {
      for (const pid of incoming.get(n.id) ?? []) {
        const px = xCenterById.get(pid);
        if (px !== undefined) parentCenters.push(px);
      }
    }
    const targetCenterX =
      parentCenters.length > 0
        ? parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length
        : 620;

    let cursorX = Math.max(40, Math.round(targetCenterX - totalWidth / 2));
    const y = 50 + rowIdx * yStep;

    for (const n of rowNodes) {
      const w = getNodeWidth(n);
      finalPositionById.set(n.id, { x: cursorX, y });
      xCenterById.set(n.id, cursorX + w / 2);
      cursorX += w + horizontalGap;
    }
  }

  return nodes.map((n) => ({
    ...n,
    position: finalPositionById.get(n.id) ?? n.position,
  }));
}

/**
 * 5. Radial Concentric Rings (Start at center, outward rings per DAG depth)
 */
function layoutRadial(nodes: ModelNode[], edges: ModelEdge[]): ModelNode[] {
  const { incoming, layersMap, sortedLayerIndices } = buildLayeredStructure(
    nodes,
    edges
  );

  const centerX = 720;
  const centerY = 420;
  const ringStep = 285;

  const angleById = new Map<string, number>();
  const finalPositionById = new Map<string, { x: number; y: number }>();

  for (let ringIdx = 0; ringIdx < sortedLayerIndices.length; ringIdx++) {
    const l = sortedLayerIndices[ringIdx];
    const ringNodes = [...layersMap.get(l)!];

    if (ringIdx === 0 && ringNodes.length === 1) {
      const n = ringNodes[0];
      finalPositionById.set(n.id, {
        x: Math.round(centerX - getNodeWidth(n) / 2),
        y: Math.round(centerY - getNodeHeight(n) / 2),
      });
      angleById.set(n.id, 0);
      continue;
    }

    ringNodes.sort((a, b) => {
      const aParents = incoming.get(a.id) ?? [];
      const bParents = incoming.get(b.id) ?? [];
      const aAngle =
        aParents.length > 0
          ? aParents.reduce((acc, p) => acc + (angleById.get(p) ?? 0), 0) /
            aParents.length
          : 0;
      const bAngle =
        bParents.length > 0
          ? bParents.reduce((acc, p) => acc + (angleById.get(p) ?? 0), 0) /
            bParents.length
          : 0;
      return aAngle - bAngle;
    });

    const radius = Math.max(220, ringIdx * ringStep);
    // Spread across right-facing arc (-115 deg to +115 deg) so left/right handles still read cleanly
    const arcSpan = Math.PI * 1.25;
    const startAngle = -arcSpan / 2;

    ringNodes.forEach((n, idx) => {
      const frac =
        ringNodes.length === 1 ? 0.5 : idx / (ringNodes.length - 1);
      const angle = startAngle + frac * arcSpan;
      angleById.set(n.id, angle);

      const x = Math.round(
        centerX + radius * Math.cos(angle) - getNodeWidth(n) / 2
      );
      const y = Math.round(
        centerY + radius * Math.sin(angle) - getNodeHeight(n) / 2
      );
      finalPositionById.set(n.id, { x, y });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: finalPositionById.get(n.id) ?? n.position,
  }));
}

export function computeAutoLayout(
  nodes: ModelNode[],
  edges: ModelEdge[],
  algorithm: LayoutAlgorithm = 'layered-lr'
): ModelNode[] {
  if (nodes.length === 0) return nodes;

  switch (algorithm) {
    case 'tree-lr':
      return layoutSubtreeBalancedLR(nodes, edges);
    case 'compact-lr':
      return layoutCompactLR(nodes, edges);
    case 'layered-tb':
      return layoutLayeredTB(nodes, edges);
    case 'radial':
      return layoutRadial(nodes, edges);
    case 'layered-lr':
    default:
      return layoutLayeredLR(nodes, edges);
  }
}
