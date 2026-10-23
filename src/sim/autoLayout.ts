import type {
  LayoutAlgorithm,
  ModelEdge,
  ModelNode,
  OutcomeDisplayMode,
} from '../types/model';

function getNodeHeight(
  node: ModelNode,
  outcomeCounts: Map<string, number>,
  mode: OutcomeDisplayMode
): number {
  if (node.type === 'question') {
    if (mode === 'nested') {
      const count = outcomeCounts.get(node.id) ?? 0;
      return 165 + count * 108;
    }
    return 154;
  }
  if (node.type === 'outcome') {
    return node.data.description ? 148 : 120;
  }
  return 84;
}

function getNodeWidth(node: ModelNode, mode: OutcomeDisplayMode): number {
  if (node.type === 'start' || node.type === 'end') return 160;
  if (node.type === 'question' && mode === 'nested') return 295;
  return 235;
}

interface GraphStructure {
  nodeMap: Map<string, ModelNode>;
  incoming: Map<string, string[]>;
  outgoing: Map<string, string[]>;
  layer: Map<string, number>;
  layersMap: Map<number, ModelNode[]>;
  sortedLayerIndices: number[];
  outcomeCounts: Map<string, number>;
  parentQuestionByOutcome: Map<string, string>;
}

function buildLayeredStructure(
  nodes: ModelNode[],
  edges: ModelEdge[],
  mode: OutcomeDisplayMode
): GraphStructure {
  const nodeMap = new Map<string, ModelNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const outcomeCounts = new Map<string, number>();
  const parentQuestionByOutcome = new Map<string, string>();
  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (src?.type === 'question' && tgt?.type === 'outcome') {
      outcomeCounts.set(src.id, (outcomeCounts.get(src.id) ?? 0) + 1);
      parentQuestionByOutcome.set(tgt.id, src.id);
    }
  }

  // In nested mode, parented outcomes are embedded inside their parent Question node,
  // so we exclude them from top-level layout nodes and collapse `Q -> O -> Target` into `Q -> Target`.
  const activeNodes =
    mode === 'nested'
      ? nodes.filter(
          (n) => !(n.type === 'outcome' && parentQuestionByOutcome.has(n.id))
        )
      : nodes;

  const activeNodeMap = new Map<string, ModelNode>();
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of activeNodes) {
    activeNodeMap.set(n.id, n);
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
    inDegree.set(n.id, 0);
  }

  const edgePairs = new Set<string>();
  for (const e of edges) {
    let u = e.source;
    const v = e.target;

    if (mode === 'nested') {
      // Skip internal Question -> Outcome edges
      if (parentQuestionByOutcome.get(v) === u) continue;
      // Remap Outcome -> Target to ParentQuestion -> Target
      if (parentQuestionByOutcome.has(u)) {
        u = parentQuestionByOutcome.get(u)!;
      }
    }

    if (!activeNodeMap.has(u) || !activeNodeMap.has(v) || u === v) continue;
    const key = `${u}->${v}`;
    if (edgePairs.has(key)) continue;
    edgePairs.add(key);

    outgoing.get(u)!.push(v);
    incoming.get(v)!.push(u);
    inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];

  for (const n of activeNodes) {
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

  for (const n of activeNodes) {
    if (!visited.has(n.id) && !layer.has(n.id)) {
      layer.set(n.id, n.type === 'start' ? 0 : 1);
    }
  }

  let maxNonEndLayer = 0;
  for (const n of activeNodes) {
    if (n.type !== 'end') {
      maxNonEndLayer = Math.max(maxNonEndLayer, layer.get(n.id) ?? 0);
    }
  }
  for (const n of activeNodes) {
    if (n.type === 'end') {
      layer.set(n.id, Math.max(layer.get(n.id) ?? 1, maxNonEndLayer + 1));
    }
  }

  const layersMap = new Map<number, ModelNode[]>();
  for (const n of activeNodes) {
    const l = layer.get(n.id) ?? 0;
    const list = layersMap.get(l) ?? [];
    list.push(n);
    layersMap.set(l, list);
  }

  const sortedLayerIndices = Array.from(layersMap.keys()).sort((a, b) => a - b);

  return {
    nodeMap: activeNodeMap,
    incoming,
    outgoing,
    layer,
    layersMap,
    sortedLayerIndices,
    outcomeCounts,
    parentQuestionByOutcome,
  };
}

function syncNestedOutcomePositions(
  nodes: ModelNode[],
  finalPositionById: Map<string, { x: number; y: number }>,
  parentQuestionByOutcome: Map<string, string>,
  mode: OutcomeDisplayMode
): ModelNode[] {
  // Also track per-question outcome index so if user switches back to 'separate' mode,
  // outcomes are already neatly positioned next to their parent question.
  const perQuestionIdx = new Map<string, number>();

  return nodes.map((n) => {
    const directPos = finalPositionById.get(n.id);
    if (directPos) {
      return { ...n, position: directPos };
    }
    if (mode === 'nested' && n.type === 'outcome') {
      const parentId = parentQuestionByOutcome.get(n.id);
      const parentPos = parentId ? finalPositionById.get(parentId) : undefined;
      if (parentId && parentPos) {
        const idx = perQuestionIdx.get(parentId) ?? 0;
        perQuestionIdx.set(parentId, idx + 1);
        return {
          ...n,
          position: {
            x: parentPos.x + 310,
            y: parentPos.y + idx * 125,
          },
        };
      }
    }
    return n;
  });
}

function layoutLayeredLR(
  nodes: ModelNode[],
  edges: ModelEdge[],
  mode: OutcomeDisplayMode,
  xStep = 315,
  verticalGap = 32
): ModelNode[] {
  const {
    incoming,
    layersMap,
    sortedLayerIndices,
    outcomeCounts,
    parentQuestionByOutcome,
  } = buildLayeredStructure(nodes, edges, mode);

  const effectiveXStep = mode === 'nested' ? xStep + 55 : xStep;
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
      colNodes.reduce(
        (acc, n) => acc + getNodeHeight(n, outcomeCounts, mode),
        0
      ) +
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
    const x = 60 + colIdx * effectiveXStep;

    for (const n of colNodes) {
      const h = getNodeHeight(n, outcomeCounts, mode);
      finalPositionById.set(n.id, { x, y: cursorY });
      yCenterById.set(n.id, cursorY + h / 2);
      cursorY += h + verticalGap;
    }
  }

  return syncNestedOutcomePositions(
    nodes,
    finalPositionById,
    parentQuestionByOutcome,
    mode
  );
}

function layoutSubtreeBalancedLR(
  nodes: ModelNode[],
  edges: ModelEdge[],
  mode: OutcomeDisplayMode
): ModelNode[] {
  const {
    outgoing,
    incoming,
    layer,
    layersMap,
    sortedLayerIndices,
    outcomeCounts,
    parentQuestionByOutcome,
  } = buildLayeredStructure(nodes, edges, mode);

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

  const unitSlotHeight = mode === 'nested' ? 240 : 165;
  const xStep = mode === 'nested' ? 375 : 320;
  const finalPositionById = new Map<string, { x: number; y: number }>();
  const assignedCenterY = new Map<string, number>();

  for (let colIdx = 0; colIdx < sortedLayerIndices.length; colIdx++) {
    const l = sortedLayerIndices[colIdx];
    const colNodes = [...layersMap.get(l)!];

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
    const x = 60 + colIdx * xStep;

    for (const n of colNodes) {
      const w = weight.get(n.id) ?? 1;
      const nodeH = getNodeHeight(n, outcomeCounts, mode);
      const band = Math.max(nodeH + 28, (w / totalWeight) * totalBandHeight);
      const centerY = cursorY + band / 2;
      const nodeY = Math.round(centerY - nodeH / 2);
      finalPositionById.set(n.id, { x, y: nodeY });
      assignedCenterY.set(n.id, centerY);
      cursorY += band;
    }
  }

  return syncNestedOutcomePositions(
    nodes,
    finalPositionById,
    parentQuestionByOutcome,
    mode
  );
}

function layoutCompactLR(
  nodes: ModelNode[],
  edges: ModelEdge[],
  mode: OutcomeDisplayMode
): ModelNode[] {
  return layoutLayeredLR(nodes, edges, mode, 275, 16);
}

function layoutLayeredTB(
  nodes: ModelNode[],
  edges: ModelEdge[],
  mode: OutcomeDisplayMode
): ModelNode[] {
  const {
    incoming,
    layersMap,
    sortedLayerIndices,
    outcomeCounts,
    parentQuestionByOutcome,
  } = buildLayeredStructure(nodes, edges, mode);

  const xCenterById = new Map<string, number>();
  const finalPositionById = new Map<string, { x: number; y: number }>();
  const horizontalGap = 40;
  let cursorY = 50;

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
      rowNodes.reduce((acc, n) => acc + getNodeWidth(n, mode), 0) +
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
    let maxRowHeight = 140;

    for (const n of rowNodes) {
      const w = getNodeWidth(n, mode);
      const h = getNodeHeight(n, outcomeCounts, mode);
      maxRowHeight = Math.max(maxRowHeight, h);
      finalPositionById.set(n.id, { x: cursorX, y: cursorY });
      xCenterById.set(n.id, cursorX + w / 2);
      cursorX += w + horizontalGap;
    }

    cursorY += maxRowHeight + 65;
  }

  return syncNestedOutcomePositions(
    nodes,
    finalPositionById,
    parentQuestionByOutcome,
    mode
  );
}

function layoutRadial(
  nodes: ModelNode[],
  edges: ModelEdge[],
  mode: OutcomeDisplayMode
): ModelNode[] {
  const {
    incoming,
    layersMap,
    sortedLayerIndices,
    outcomeCounts,
    parentQuestionByOutcome,
  } = buildLayeredStructure(nodes, edges, mode);

  const centerX = 720;
  const centerY = 420;
  const ringStep = mode === 'nested' ? 350 : 285;

  const angleById = new Map<string, number>();
  const finalPositionById = new Map<string, { x: number; y: number }>();

  for (let ringIdx = 0; ringIdx < sortedLayerIndices.length; ringIdx++) {
    const l = sortedLayerIndices[ringIdx];
    const ringNodes = [...layersMap.get(l)!];

    if (ringIdx === 0 && ringNodes.length === 1) {
      const n = ringNodes[0];
      finalPositionById.set(n.id, {
        x: Math.round(centerX - getNodeWidth(n, mode) / 2),
        y: Math.round(centerY - getNodeHeight(n, outcomeCounts, mode) / 2),
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

    const radius = Math.max(240, ringIdx * ringStep);
    const arcSpan = Math.PI * 1.25;
    const startAngle = -arcSpan / 2;

    ringNodes.forEach((n, idx) => {
      const frac =
        ringNodes.length === 1 ? 0.5 : idx / (ringNodes.length - 1);
      const angle = startAngle + frac * arcSpan;
      angleById.set(n.id, angle);

      const x = Math.round(
        centerX + radius * Math.cos(angle) - getNodeWidth(n, mode) / 2
      );
      const y = Math.round(
        centerY +
          radius * Math.sin(angle) -
          getNodeHeight(n, outcomeCounts, mode) / 2
      );
      finalPositionById.set(n.id, { x, y });
    });
  }

  return syncNestedOutcomePositions(
    nodes,
    finalPositionById,
    parentQuestionByOutcome,
    mode
  );
}

export function computeAutoLayout(
  nodes: ModelNode[],
  edges: ModelEdge[],
  algorithm: LayoutAlgorithm = 'layered-lr',
  mode: OutcomeDisplayMode = 'separate'
): ModelNode[] {
  if (nodes.length === 0) return nodes;

  switch (algorithm) {
    case 'tree-lr':
      return layoutSubtreeBalancedLR(nodes, edges, mode);
    case 'compact-lr':
      return layoutCompactLR(nodes, edges, mode);
    case 'layered-tb':
      return layoutLayeredTB(nodes, edges, mode);
    case 'radial':
      return layoutRadial(nodes, edges, mode);
    case 'layered-lr':
    default:
      return layoutLayeredLR(nodes, edges, mode);
  }
}
