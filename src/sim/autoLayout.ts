import type { ModelEdge, ModelNode } from '../types/model';

const X_START = 60;
const X_STEP = 310;
const Y_CENTER = 300;

function getNodeHeight(node: ModelNode): number {
  if (node.type === 'question') return 148;
  if (node.type === 'outcome') return 118;
  return 84;
}

/**
 * Computes a clean left-to-right layered DAG layout (Sugiyama-style rank assignment +
 * barycenter ordering) tailored for Start -> Question -> Outcome -> End graphs.
 */
export function computeAutoLayout(
  nodes: ModelNode[],
  edges: ModelEdge[]
): ModelNode[] {
  if (nodes.length === 0) return nodes;

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

  // 1. Longest-path layer assignment via Kahn's topological traversal
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

  // Fallback for any unvisited nodes
  for (const n of nodes) {
    if (!visited.has(n.id) && !layer.has(n.id)) {
      layer.set(n.id, n.type === 'start' ? 0 : 1);
    }
  }

  // Pin all 'end' nodes to the rightmost column if they have incoming links
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

  // 2. Group nodes by layer
  const layersMap = new Map<number, ModelNode[]>();
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0;
    const list = layersMap.get(l) ?? [];
    list.push(n);
    layersMap.set(l, list);
  }

  const sortedLayerIndices = Array.from(layersMap.keys()).sort((a, b) => a - b);

  // Track Y positions as we sweep left-to-right so children align near their parents
  const yCenterById = new Map<string, number>();
  const finalPositionById = new Map<string, { x: number; y: number }>();

  for (let colIdx = 0; colIdx < sortedLayerIndices.length; colIdx++) {
    const l = sortedLayerIndices[colIdx];
    const colNodes = layersMap.get(l)!;

    // Sort nodes in this column by average parent Y (barycenter), falling back to current Y
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

    const verticalGap = 32;
    const totalHeight =
      colNodes.reduce((acc, n) => acc + getNodeHeight(n), 0) +
      Math.max(0, colNodes.length - 1) * verticalGap;

    // Desired center is average of parent centers, or Y_CENTER
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
        : Y_CENTER;

    let cursorY = Math.max(24, Math.round(targetCenterY - totalHeight / 2));
    const x = X_START + colIdx * X_STEP;

    for (const n of colNodes) {
      const h = getNodeHeight(n);
      finalPositionById.set(n.id, { x, y: cursorY });
      yCenterById.set(n.id, cursorY + h / 2);
      cursorY += h + verticalGap;
    }
  }

  return nodes.map((n) => {
    const pos = finalPositionById.get(n.id);
    if (!pos) return n;
    return {
      ...n,
      position: pos,
    };
  });
}
