import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import {
  formatCurrency,
  type CurrencyCode,
  type EdgeKind,
  type LayoutAlgorithm,
  type ModelEdge,
  type ModelNode,
  type ModelNodeType,
  type OutcomeDisplayMode,
  type OutcomeFlowNode,
  type ProjectModel,
  type SimulationResult,
  type ValidationResult,
} from '../types/model';
import { canConnectNodes, inferEdgeKind, validateModel } from '../sim/validate';
import { runMonteCarloSimulation } from '../sim/monteCarlo';
import { computeAutoLayout } from '../sim/autoLayout';
import { DEMO_MODEL } from './demoModel';

const STORAGE_KEY = 'mc-modeller:v2';

export type ActiveTab = 'editor' | 'results';

export interface ClipboardPayload {
  nodes: ModelNode[];
  edges: ModelEdge[];
  pasteCount: number;
}

export function decorateEdge(
  edge: ModelEdge,
  nodes: ModelNode[]
): ModelEdge {
  const src = nodes.find((n) => n.id === edge.source);
  const tgt = nodes.find((n) => n.id === edge.target);
  const kind: EdgeKind =
    edge.data?.kind ??
    inferEdgeKind(
      src?.type as ModelNodeType | undefined,
      tgt?.type as ModelNodeType | undefined
    ) ??
    'start-to-question';

  const isAnd = kind === 'question-to-question';
  const isQuestionEnd = kind === 'question-to-end';
  const isEnd = kind === 'outcome-to-end';
  const isOr = kind === 'question-to-outcome';

  let label: string | undefined;
  if (isAnd) {
    label = 'ALL →';
  } else if (isQuestionEnd) {
    label = 'ALL';
  } else if (isOr && tgt?.type === 'outcome') {
    const o = tgt as OutcomeFlowNode;
    label = `${o.data.probabilityPct}%`;
  }

  const strokeColor = isAnd
    ? '#f59e0b'
    : isQuestionEnd
      ? '#a78bfa'
      : isOr
        ? '#38bdf8'
        : isEnd
          ? '#64748b'
          : '#94a3b8';

  return {
    ...edge,
    type: 'smoothstep',
    zIndex: 10,
    interactionWidth: 22,
    animated: isAnd,
    label,
    labelStyle: isAnd
      ? { fill: '#fbbf24', fontWeight: 700, fontSize: 11 }
      : isQuestionEnd
        ? { fill: '#c4b5fd', fontWeight: 700, fontSize: 10.5 }
        : { fill: '#e2e8f0', fontWeight: 600, fontSize: 11 },
    labelBgStyle: {
      fill: '#0f172a',
      fillOpacity: 0.9,
      stroke: strokeColor,
      strokeWidth: 1,
    },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
    style: {
      stroke: strokeColor,
      strokeWidth: isAnd || isQuestionEnd ? 2.2 : 2,
      strokeDasharray: isAnd ? '6 4' : undefined,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: strokeColor,
      width: 18,
      height: 18,
    },
    data: { kind },
  };
}

function hydrateEdges(nodes: ModelNode[], edges: ModelEdge[]): ModelEdge[] {
  return edges.map((e) => decorateEdge(e, nodes));
}

function loadInitialModel(): ProjectModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectModel;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return {
          version: 1,
          name: parsed.name || 'Untitled Project Model',
          currency: parsed.currency || 'GBP',
          nodes: parsed.nodes,
          edges: hydrateEdges(parsed.nodes, parsed.edges),
          viewport: parsed.viewport,
        };
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return {
    ...DEMO_MODEL,
    currency: DEMO_MODEL.currency ?? 'GBP',
    edges: hydrateEdges(DEMO_MODEL.nodes, DEMO_MODEL.edges),
  };
}

function persistDraft(
  name: string,
  currency: CurrencyCode,
  nodes: ModelNode[],
  edges: ModelEdge[]
) {
  try {
    const payload: ProjectModel = {
      version: 1,
      name,
      currency,
      nodes,
      edges,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

function resolveTargetNodeIds(
  nodes: ModelNode[],
  selectedNodeId: string | null,
  explicitNodeIds?: string[]
): Set<string> {
  if (explicitNodeIds && explicitNodeIds.length > 0) {
    return new Set(explicitNodeIds);
  }
  const flowSelected = nodes.filter((n) => n.selected).map((n) => n.id);
  if (flowSelected.length > 0) {
    return new Set(flowSelected);
  }
  if (selectedNodeId) {
    return new Set([selectedNodeId]);
  }
  return new Set();
}

interface ModelStoreState {
  modelName: string;
  currency: CurrencyCode;
  nodes: ModelNode[];
  edges: ModelEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  clipboard: ClipboardPayload | null;
  activeTab: ActiveTab;
  trials: number;
  validation: ValidationResult;
  simulationResult: SimulationResult | null;
  connectionError: string | null;
  layoutVersion: number;
  layoutAlgorithm: LayoutAlgorithm;
  outcomeDisplayMode: OutcomeDisplayMode;

  setModelName: (name: string) => void;
  setCurrency: (currency: CurrencyCode) => void;
  setLayoutAlgorithm: (algorithm: LayoutAlgorithm) => void;
  setOutcomeDisplayMode: (mode: OutcomeDisplayMode) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setTrials: (trials: number) => void;
  clearConnectionError: () => void;

  onNodesChange: (changes: NodeChange<ModelNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ModelEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (nodeId: string | null, additive?: boolean) => void;
  selectEdge: (edgeId: string | null) => void;
  selectAllNodes: () => void;

  addNode: (type: ModelNodeType, position?: { x: number; y: number }) => string;
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
  deleteSelected: () => void;
  deleteNodesByIds: (nodeIds: string[]) => void;
  deleteNodeById: (nodeId: string) => void;
  deleteEdgeById: (edgeId: string) => void;

  copyNodes: (explicitNodeIds?: string[]) => number;
  cutNodes: (explicitNodeIds?: string[]) => number;
  pasteClipboard: (anchorPosition?: { x: number; y: number }) => string[];
  duplicateNodes: (explicitNodeIds?: string[]) => string[];

  addOutcomeForQuestion: (questionId: string) => void;
  splitQuestionProbabilitiesEvenly: (questionId: string) => void;
  rebalanceOutcomeProbability: (outcomeId: string, newProbPct: number) => void;
  autoLayout: (algorithm?: LayoutAlgorithm) => void;

  runSimulation: (switchTab?: boolean) => boolean;
  resetToNewModel: () => void;
  loadDemoModel: () => void;
  exportModelJson: () => string;
  importModelJson: (rawJson: string) => { ok: boolean; error?: string };
}

const initialModel = loadInitialModel();
const initialCurrency: CurrencyCode = initialModel.currency ?? 'GBP';
const initialValidation = validateModel(initialModel.nodes, initialModel.edges);
const initialSimulation = initialValidation.valid
  ? runMonteCarloSimulation(
      initialModel.nodes,
      initialModel.edges,
      10000,
      initialCurrency
    )
  : null;

export const useModelStore = create<ModelStoreState>((set, get) => ({
  modelName: initialModel.name,
  currency: initialCurrency,
  nodes: initialModel.nodes,
  edges: initialModel.edges,
  selectedNodeId: null,
  selectedEdgeId: null,
  clipboard: null,
  activeTab: 'editor',
  trials: 10000,
  validation: initialValidation,
  simulationResult: initialSimulation,
  connectionError: null,
  layoutVersion: 0,
  layoutAlgorithm: 'layered-lr',
  outcomeDisplayMode: 'separate',

  setModelName: (name) => {
    set({ modelName: name });
    const { currency, nodes, edges } = get();
    persistDraft(name, currency, nodes, edges);
  },

  setLayoutAlgorithm: (algorithm) => {
    set({ layoutAlgorithm: algorithm });
    get().autoLayout(algorithm);
  },

  setOutcomeDisplayMode: (mode) => {
    set({ outcomeDisplayMode: mode });
    get().autoLayout();
  },

  setCurrency: (currency) => {
    const { modelName, nodes, edges, simulationResult } = get();
    const updatedSim: SimulationResult | null = simulationResult
      ? {
          ...simulationResult,
          histogram: simulationResult.histogram.map((b) => ({
            ...b,
            label:
              Math.abs(b.maxCost - b.minCost) < 1e-6
                ? formatCurrency(b.minCost, currency)
                : `${formatCurrency(b.minCost, currency)} – ${formatCurrency(
                    b.maxCost,
                    currency
                  )}`,
          })),
        }
      : null;

    set({ currency, simulationResult: updatedSim });
    persistDraft(modelName, currency, nodes, edges);
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setTrials: (trials) => set({ trials }),

  clearConnectionError: () => set({ connectionError: null }),

  onNodesChange: (changes) => {
    const nextNodes = applyNodeChanges(changes, get().nodes);
    const nextEdges = hydrateEdges(nextNodes, get().edges);
    const validation = validateModel(nextNodes, nextEdges);

    const selectedNodes = nextNodes.filter((n) => n.selected);
    const prevSelectedId = get().selectedNodeId;

    let nextSelectedId: string | null = null;
    if (selectedNodes.length === 1) {
      nextSelectedId = selectedNodes[0].id;
    } else if (
      selectedNodes.length > 1 &&
      prevSelectedId &&
      selectedNodes.some((n) => n.id === prevSelectedId)
    ) {
      nextSelectedId = prevSelectedId;
    } else if (selectedNodes.length > 1) {
      nextSelectedId = selectedNodes[selectedNodes.length - 1].id;
    } else if (
      prevSelectedId &&
      nextNodes.some((n) => n.id === prevSelectedId) &&
      !changes.some((c) => c.type === 'select')
    ) {
      nextSelectedId = prevSelectedId;
    }

    set({
      nodes: nextNodes,
      edges: nextEdges,
      validation,
      selectedNodeId: nextSelectedId,
    });
    persistDraft(get().modelName, get().currency, nextNodes, nextEdges);
  },

  onEdgesChange: (changes) => {
    const rawEdges = applyEdgeChanges(changes, get().edges);
    const nextEdges = hydrateEdges(get().nodes, rawEdges);
    const validation = validateModel(get().nodes, nextEdges);
    const selectedEdgeId = get().selectedEdgeId;
    const stillExists =
      selectedEdgeId && nextEdges.some((e) => e.id === selectedEdgeId);

    set({
      edges: nextEdges,
      validation,
      selectedEdgeId: stillExists ? selectedEdgeId : null,
    });
    persistDraft(get().modelName, get().currency, get().nodes, nextEdges);
  },

  onConnect: (connection) => {
    const { nodes, edges, modelName, currency } = get();
    // If dragging from an embedded outcome handle inside a QuestionNode (`outcome:<id>`),
    // treat that outcome node as the true logical source.
    let actualSource = connection.source;
    let actualSourceHandle = connection.sourceHandle ?? null;
    if (actualSourceHandle?.startsWith('outcome:')) {
      actualSource = actualSourceHandle.slice('outcome:'.length);
      actualSourceHandle = null;
    }

    const check = canConnectNodes(
      nodes,
      edges,
      actualSource,
      connection.target
    );
    if (!check.allowed || !check.kind) {
      set({ connectionError: check.reason ?? 'Invalid connection' });
      return;
    }

    const newEdge: ModelEdge = decorateEdge(
      {
        id: `e-${actualSource}-${connection.target}-${Date.now()}`,
        source: actualSource!,
        target: connection.target!,
        sourceHandle: actualSourceHandle,
        targetHandle: connection.targetHandle ?? null,
        data: { kind: check.kind },
      },
      nodes
    );

    const nextEdges = addEdge(newEdge, edges);
    const validation = validateModel(nodes, nextEdges);
    set({
      edges: nextEdges,
      validation,
      connectionError: null,
    });
    persistDraft(modelName, currency, nodes, nextEdges);
  },

  selectNode: (nodeId, additive = false) => {
    const { nodes, edges } = get();
    if (!nodeId) {
      set({
        selectedNodeId: null,
        selectedEdgeId: null,
        nodes: nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        edges: edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      });
      return;
    }

    const nextNodes = nodes.map((n) => {
      if (n.id === nodeId) {
        return { ...n, selected: additive ? !n.selected : true };
      }
      return additive ? n : n.selected ? { ...n, selected: false } : n;
    });

    set({
      nodes: nextNodes,
      selectedNodeId: nodeId,
      selectedEdgeId: null,
    });
  },

  selectEdge: (edgeId) => {
    const { nodes, edges } = get();
    set({
      selectedEdgeId: edgeId,
      selectedNodeId: null,
      nodes: nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      edges: edges.map((e) => ({ ...e, selected: e.id === edgeId })),
    });
  },

  selectAllNodes: () => {
    const { nodes } = get();
    set({
      nodes: nodes.map((n) => ({ ...n, selected: true })),
      selectedNodeId: nodes[0]?.id ?? null,
      selectedEdgeId: null,
    });
  },

  addNode: (type, position) => {
    const { nodes, edges, modelName, currency } = get();
    if (type === 'start' && nodes.some((n) => n.type === 'start')) {
      set({
        connectionError: 'Model already has a Start node (only one is allowed).',
      });
      const existing = nodes.find((n) => n.type === 'start')!;
      return existing.id;
    }

    const id = `${type}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;
    const countOfType = nodes.filter((n) => n.type === type).length + 1;
    const pos = position ?? {
      x: 240 + ((nodes.length * 45) % 450),
      y: 140 + ((nodes.length * 55) % 320),
    };

    let newNode: ModelNode;
    if (type === 'start') {
      newNode = {
        id,
        type: 'start',
        position: pos,
        selected: true,
        data: { label: 'Project Start' },
      };
    } else if (type === 'question') {
      newNode = {
        id,
        type: 'question',
        position: pos,
        selected: true,
        data: {
          label: `Question ${countOfType}`,
          description: 'What is the uncertainty or decision at this stage?',
        },
      };
    } else if (type === 'outcome') {
      newNode = {
        id,
        type: 'outcome',
        position: pos,
        selected: true,
        data: {
          label: `Outcome ${countOfType}`,
          description: '',
          probabilityPct: 50,
          cost: 25000,
        },
      };
    } else {
      newNode = {
        id,
        type: 'end',
        position: pos,
        selected: true,
        data: { label: 'End' },
      };
    }

    const deselectedNodes = nodes.map((n) =>
      n.selected ? { ...n, selected: false } : n
    );
    const nextNodes = [...deselectedNodes, newNode];
    const validation = validateModel(nextNodes, edges);
    set({
      nodes: nextNodes,
      validation,
      selectedNodeId: id,
      selectedEdgeId: null,
      connectionError: null,
    });
    persistDraft(modelName, currency, nextNodes, edges);
    return id;
  },

  updateNodeData: (nodeId, patch) => {
    const { nodes, edges, modelName, currency } = get();
    const nextNodes = nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        data: {
          ...n.data,
          ...patch,
        },
      } as ModelNode;
    });
    const nextEdges = hydrateEdges(nextNodes, edges);
    const validation = validateModel(nextNodes, nextEdges);
    set({ nodes: nextNodes, edges: nextEdges, validation });
    persistDraft(modelName, currency, nextNodes, nextEdges);
  },

  rebalanceOutcomeProbability: (outcomeId, newProbPct) => {
    const { nodes, edges, modelName, currency } = get();
    const clampedTarget = Math.max(
      0,
      Math.min(100, Math.round(Number(newProbPct) || 0))
    );

    const parentEdge = edges.find(
      (e) => e.target === outcomeId && e.data?.kind === 'question-to-outcome'
    );
    if (!parentEdge) {
      get().updateNodeData(outcomeId, { probabilityPct: clampedTarget });
      return;
    }

    const questionId = parentEdge.source;
    const siblingIds = edges
      .filter(
        (e) =>
          e.source === questionId &&
          e.data?.kind === 'question-to-outcome' &&
          e.target !== outcomeId
      )
      .map((e) => e.target)
      .filter((id) => nodes.some((n) => n.id === id && n.type === 'outcome'));

    if (siblingIds.length === 0) {
      get().updateNodeData(outcomeId, { probabilityPct: clampedTarget });
      return;
    }

    const remainder = Math.max(0, 100 - clampedTarget);
    const siblingNodes = siblingIds.map(
      (id) => nodes.find((n) => n.id === id) as OutcomeFlowNode
    );
    const currentSiblingsSum = siblingNodes.reduce(
      (acc, s) => acc + Math.max(0, Number(s.data.probabilityPct) || 0),
      0
    );

    // Compute proportional shares (or equal shares if all siblings were at 0%)
    const rawShares = siblingNodes.map((s) => {
      const cur = Math.max(0, Number(s.data.probabilityPct) || 0);
      if (currentSiblingsSum > 0) {
        return (cur / currentSiblingsSum) * remainder;
      }
      return remainder / siblingNodes.length;
    });

    // Largest-remainder integer rounding so sibling integer percentages sum to `remainder`
    const floored = rawShares.map((v) => Math.floor(v));
    let deficit = Math.round(
      remainder - floored.reduce((acc, v) => acc + v, 0)
    );
    const indicesByFrac = rawShares
      .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);

    for (let i = 0; i < indicesByFrac.length && deficit > 0; i++) {
      floored[indicesByFrac[i].idx] += 1;
      deficit -= 1;
    }

    const newProbById = new Map<string, number>();
    newProbById.set(outcomeId, clampedTarget);
    siblingIds.forEach((id, idx) => {
      newProbById.set(id, floored[idx]);
    });

    const nextNodes = nodes.map((n) => {
      if (n.type !== 'outcome' || !newProbById.has(n.id)) return n;
      return {
        ...n,
        data: {
          ...n.data,
          probabilityPct: newProbById.get(n.id)!,
        },
      } as OutcomeFlowNode;
    });

    const nextEdges = hydrateEdges(nextNodes, edges);
    const validation = validateModel(nextNodes, nextEdges);
    set({ nodes: nextNodes, edges: nextEdges, validation });
    persistDraft(modelName, currency, nextNodes, nextEdges);
  },

  deleteSelected: () => {
    const { nodes, edges, selectedNodeId, selectedEdgeId } = get();
    const targetNodeIds = resolveTargetNodeIds(nodes, selectedNodeId);
    if (targetNodeIds.size > 0) {
      get().deleteNodesByIds(Array.from(targetNodeIds));
      return;
    }
    const selectedEdgeIds = edges
      .filter((e) => e.selected || e.id === selectedEdgeId)
      .map((e) => e.id);
    if (selectedEdgeIds.length > 0) {
      const removeSet = new Set(selectedEdgeIds);
      const nextEdges = hydrateEdges(
        nodes,
        edges.filter((e) => !removeSet.has(e.id))
      );
      const validation = validateModel(nodes, nextEdges);
      set({
        edges: nextEdges,
        validation,
        selectedEdgeId: null,
      });
      persistDraft(get().modelName, get().currency, nodes, nextEdges);
    }
  },

  deleteNodesByIds: (nodeIds) => {
    if (nodeIds.length === 0) return;
    const { nodes, edges, modelName, currency, outcomeDisplayMode } = get();
    const removeSet = new Set(nodeIds);
    // In nested mode, deleting a Question also deletes its embedded child Outcomes
    if (outcomeDisplayMode === 'nested') {
      for (const e of edges) {
        if (
          e.data?.kind === 'question-to-outcome' &&
          removeSet.has(e.source)
        ) {
          removeSet.add(e.target);
        }
      }
    }
    const nextNodes = nodes.filter((n) => !removeSet.has(n.id));
    const nextEdges = hydrateEdges(
      nextNodes,
      edges.filter((e) => !removeSet.has(e.source) && !removeSet.has(e.target))
    );
    const validation = validateModel(nextNodes, nextEdges);
    set({
      nodes: nextNodes,
      edges: nextEdges,
      validation,
      selectedNodeId: null,
      selectedEdgeId: null,
    });
    persistDraft(modelName, currency, nextNodes, nextEdges);
  },

  deleteNodeById: (nodeId) => {
    get().deleteNodesByIds([nodeId]);
  },

  deleteEdgeById: (edgeId) => {
    const { nodes, edges, modelName, currency } = get();
    const nextEdges = hydrateEdges(
      nodes,
      edges.filter((e) => e.id !== edgeId)
    );
    const validation = validateModel(nodes, nextEdges);
    set({
      edges: nextEdges,
      validation,
      selectedEdgeId: null,
    });
    persistDraft(modelName, currency, nodes, nextEdges);
  },

  copyNodes: (explicitNodeIds) => {
    const { nodes, edges, selectedNodeId } = get();
    const targetIds = resolveTargetNodeIds(
      nodes,
      selectedNodeId,
      explicitNodeIds
    );
    // If a Question node is copied/duplicated, automatically include its attached child Outcomes
    // so that in Nested Outcomes view (or Separate view) the full question+outcomes unit copies cleanly.
    const expandedIds = new Set(targetIds);
    for (const e of edges) {
      if (
        e.data?.kind === 'question-to-outcome' &&
        targetIds.has(e.source)
      ) {
        expandedIds.add(e.target);
      }
    }

    const copiedNodes = nodes
      .filter((n) => expandedIds.has(n.id))
      .map((n) => structuredClone(n));

    if (copiedNodes.length === 0) return 0;

    const copiedEdges = edges
      .filter((e) => expandedIds.has(e.source) && expandedIds.has(e.target))
      .map((e) => structuredClone(e));

    set({
      clipboard: {
        nodes: copiedNodes,
        edges: copiedEdges,
        pasteCount: 0,
      },
    });
    return copiedNodes.length;
  },

  cutNodes: (explicitNodeIds) => {
    const { nodes, selectedNodeId } = get();
    const targetIds = resolveTargetNodeIds(
      nodes,
      selectedNodeId,
      explicitNodeIds
    );
    if (targetIds.size === 0) return 0;

    const count = get().copyNodes(Array.from(targetIds));
    // Keep Start node if user accidentally cut everything, or allow cutting non-start nodes
    const deletableIds = Array.from(targetIds).filter((id) => {
      const n = nodes.find((node) => node.id === id);
      return n?.type !== 'start';
    });

    if (deletableIds.length < targetIds.size && deletableIds.length === 0) {
      set({
        connectionError: 'The Start node cannot be cut or deleted.',
      });
      return count;
    }

    get().deleteNodesByIds(deletableIds);
    return count;
  },

  pasteClipboard: (anchorPosition) => {
    const { clipboard, nodes, edges, modelName, currency } = get();
    if (!clipboard || clipboard.nodes.length === 0) return [];

    const hasExistingStart = nodes.some((n) => n.type === 'start');
    const pasteableNodes = clipboard.nodes.filter(
      (n) => !(n.type === 'start' && hasExistingStart)
    );

    if (pasteableNodes.length === 0) {
      set({
        connectionError:
          'Cannot paste another Start node (only one Start node is allowed).',
      });
      return [];
    }

    const nextPasteCount = clipboard.pasteCount + 1;
    const minX = Math.min(...pasteableNodes.map((n) => n.position.x));
    const minY = Math.min(...pasteableNodes.map((n) => n.position.y));

    const dx = anchorPosition
      ? anchorPosition.x - minX
      : 45 * nextPasteCount;
    const dy = anchorPosition
      ? anchorPosition.y - minY
      : 45 * nextPasteCount;

    const idMap = new Map<string, string>();
    const createdNodes: ModelNode[] = pasteableNodes.map((orig) => {
      const newId = `${orig.type}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      idMap.set(orig.id, newId);
      const cloneData = structuredClone(orig.data);
      if (
        typeof cloneData.label === 'string' &&
        !cloneData.label.endsWith(' (Copy)')
      ) {
        cloneData.label = `${cloneData.label} (Copy)`;
      }
      return {
        ...structuredClone(orig),
        id: newId,
        selected: true,
        position: {
          x: Math.round(orig.position.x + dx),
          y: Math.round(orig.position.y + dy),
        },
        data: cloneData,
      } as ModelNode;
    });

    const deselectedExisting = nodes.map((n) =>
      n.selected ? { ...n, selected: false } : n
    );
    const nextNodes = [...deselectedExisting, ...createdNodes];

    const createdEdges: ModelEdge[] = clipboard.edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((origEdge) => {
        const newSource = idMap.get(origEdge.source)!;
        const newTarget = idMap.get(origEdge.target)!;
        return decorateEdge(
          {
            ...structuredClone(origEdge),
            id: `e-${newSource}-${newTarget}-${Math.random()
              .toString(36)
              .slice(2, 6)}`,
            source: newSource,
            target: newTarget,
            selected: false,
          },
          nextNodes
        );
      });

    const nextEdges = [...edges, ...createdEdges];
    const validation = validateModel(nextNodes, nextEdges);

    set({
      nodes: nextNodes,
      edges: nextEdges,
      validation,
      selectedNodeId:
        createdNodes.length === 1
          ? createdNodes[0].id
          : createdNodes[createdNodes.length - 1]?.id ?? null,
      selectedEdgeId: null,
      clipboard: {
        ...clipboard,
        pasteCount: nextPasteCount,
      },
      connectionError: null,
    });
    persistDraft(modelName, currency, nextNodes, nextEdges);
    return createdNodes.map((n) => n.id);
  },

  duplicateNodes: (explicitNodeIds) => {
    const copied = get().copyNodes(explicitNodeIds);
    if (copied === 0) return [];
    return get().pasteClipboard();
  },

  addOutcomeForQuestion: (questionId) => {
    const { nodes, edges, modelName, currency } = get();
    const qNode = nodes.find((n) => n.id === questionId && n.type === 'question');
    if (!qNode) return;

    const existingOutcomes = edges
      .filter((e) => e.source === questionId)
      .map((e) => nodes.find((n) => n.id === e.target && n.type === 'outcome'))
      .filter((n): n is OutcomeFlowNode => Boolean(n));

    const currentSum = existingOutcomes.reduce(
      (acc, o) => acc + (Number(o.data.probabilityPct) || 0),
      0
    );
    const remainingProb = Math.max(0, Math.round((100 - currentSum) * 100) / 100);
    const defaultProb =
      existingOutcomes.length === 0 ? 100 : remainingProb > 0 ? remainingProb : 0;

    const outcomeIndex = existingOutcomes.length + 1;
    const outcomeId = `outcome-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 5)}`;

    const newOutcome: OutcomeFlowNode = {
      id: outcomeId,
      type: 'outcome',
      position: {
        x: qNode.position.x + 310,
        y: qNode.position.y + (outcomeIndex - 1) * 110 - 30,
      },
      data: {
        label: `Option ${outcomeIndex}`,
        description: '',
        probabilityPct: defaultProb,
        cost: 25000 * outcomeIndex,
      },
    };

    const nextNodes: ModelNode[] = [...nodes, newOutcome];
    const newEdge: ModelEdge = decorateEdge(
      {
        id: `e-${questionId}-${outcomeId}`,
        source: questionId,
        target: outcomeId,
        data: { kind: 'question-to-outcome' },
      },
      nextNodes
    );

    const nextEdges = [...edges, newEdge];
    const validation = validateModel(nextNodes, nextEdges);
    set({
      nodes: nextNodes,
      edges: nextEdges,
      validation,
      connectionError: null,
    });
    persistDraft(modelName, currency, nextNodes, nextEdges);
  },

  splitQuestionProbabilitiesEvenly: (questionId) => {
    const { nodes, edges, modelName, currency } = get();
    const outcomeIds = edges
      .filter((e) => e.source === questionId)
      .map((e) => e.target)
      .filter((targetId) =>
        nodes.some((n) => n.id === targetId && n.type === 'outcome')
      );

    const count = outcomeIds.length;
    if (count === 0) return;

    const baseShare = Math.floor((100 / count) * 100) / 100;
    let allocated = 0;

    const nextNodes = nodes.map((n) => {
      const idx = outcomeIds.indexOf(n.id);
      if (idx === -1 || n.type !== 'outcome') return n;
      const prob =
        idx === count - 1
          ? Math.round((100 - allocated) * 100) / 100
          : baseShare;
      allocated += baseShare;
      return {
        ...n,
        data: {
          ...n.data,
          probabilityPct: prob,
        },
      } as OutcomeFlowNode;
    });

    const nextEdges = hydrateEdges(nextNodes, edges);
    const validation = validateModel(nextNodes, nextEdges);
    set({ nodes: nextNodes, edges: nextEdges, validation });
    persistDraft(modelName, currency, nextNodes, nextEdges);
  },

  autoLayout: (algorithmOverride) => {
    const {
      nodes,
      edges,
      modelName,
      currency,
      layoutVersion,
      layoutAlgorithm,
      outcomeDisplayMode,
    } = get();
    const algo = algorithmOverride ?? layoutAlgorithm;
    const laidOutNodes = computeAutoLayout(
      nodes,
      edges,
      algo,
      outcomeDisplayMode
    );
    set({
      nodes: laidOutNodes,
      layoutAlgorithm: algo,
      layoutVersion: layoutVersion + 1,
    });
    persistDraft(modelName, currency, laidOutNodes, edges);
  },

  runSimulation: (switchTab = true) => {
    const { nodes, edges, trials, currency } = get();
    const validation = validateModel(nodes, edges);
    if (!validation.valid) {
      set({ validation });
      return false;
    }
    const result = runMonteCarloSimulation(nodes, edges, trials, currency);
    set({
      validation,
      simulationResult: result,
      activeTab: switchTab ? 'results' : get().activeTab,
    });
    return true;
  },

  resetToNewModel: () => {
    const { currency, trials, layoutVersion } = get();
    const freshNodes: ModelNode[] = [
      {
        id: 'start-1',
        type: 'start',
        position: { x: 80, y: 220 },
        data: { label: 'Project Start' },
      },
      {
        id: 'q-1',
        type: 'question',
        position: { x: 320, y: 185 },
        data: {
          label: 'Initial Scope Decision',
          description: 'Define the primary project delivery approach.',
        },
      },
      {
        id: 'o-1',
        type: 'outcome',
        position: { x: 640, y: 120 },
        data: {
          label: 'Standard Delivery',
          description: '',
          probabilityPct: 70,
          cost: 50000,
        },
      },
      {
        id: 'o-2',
        type: 'outcome',
        position: { x: 640, y: 250 },
        data: {
          label: 'Accelerated Delivery',
          description: '',
          probabilityPct: 30,
          cost: 95000,
        },
      },
      {
        id: 'end-1',
        type: 'end',
        position: { x: 960, y: 220 },
        data: { label: 'Project Complete' },
      },
    ];
    const freshEdges: ModelEdge[] = hydrateEdges(freshNodes, [
      {
        id: 'e-start-q1',
        source: 'start-1',
        target: 'q-1',
        data: { kind: 'start-to-question' },
      },
      {
        id: 'e-q1-o1',
        source: 'q-1',
        target: 'o-1',
        data: { kind: 'question-to-outcome' },
      },
      {
        id: 'e-q1-o2',
        source: 'q-1',
        target: 'o-2',
        data: { kind: 'question-to-outcome' },
      },
      {
        id: 'e-q1-end',
        source: 'q-1',
        target: 'end-1',
        data: { kind: 'question-to-end' },
      },
    ]);
    const validation = validateModel(freshNodes, freshEdges);
    const name = 'New Project Budget Model';
    const laidOutNodes = computeAutoLayout(
      freshNodes,
      freshEdges,
      get().layoutAlgorithm,
      get().outcomeDisplayMode
    );
    set({
      modelName: name,
      nodes: laidOutNodes,
      edges: freshEdges,
      selectedNodeId: 'q-1',
      selectedEdgeId: null,
      validation,
      simulationResult: runMonteCarloSimulation(
        laidOutNodes,
        freshEdges,
        trials,
        currency
      ),
      activeTab: 'editor',
      connectionError: null,
      layoutVersion: layoutVersion + 1,
    });
    persistDraft(name, currency, laidOutNodes, freshEdges);
  },

  loadDemoModel: () => {
    const { currency, trials, layoutVersion, layoutAlgorithm, outcomeDisplayMode } =
      get();
    const rawNodes = structuredClone(DEMO_MODEL.nodes);
    const edges = hydrateEdges(rawNodes, structuredClone(DEMO_MODEL.edges));
    const nodes = computeAutoLayout(
      rawNodes,
      edges,
      layoutAlgorithm,
      outcomeDisplayMode
    );
    const validation = validateModel(nodes, edges);
    const simulationResult = runMonteCarloSimulation(
      nodes,
      edges,
      trials,
      currency
    );
    set({
      modelName: DEMO_MODEL.name,
      nodes,
      edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      validation,
      simulationResult,
      connectionError: null,
      layoutVersion: layoutVersion + 1,
    });
    persistDraft(DEMO_MODEL.name, currency, nodes, edges);
  },

  exportModelJson: () => {
    const { modelName, currency, nodes, edges } = get();
    const payload: ProjectModel = {
      version: 1,
      name: modelName,
      currency,
      nodes,
      edges,
    };
    return JSON.stringify(payload, null, 2);
  },

  importModelJson: (rawJson) => {
    try {
      const parsed = JSON.parse(rawJson) as ProjectModel;
      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        return { ok: false, error: 'JSON file is missing nodes or edges arrays.' };
      }
      const nodes = parsed.nodes;
      const edges = hydrateEdges(nodes, parsed.edges);
      const currency: CurrencyCode = parsed.currency ?? get().currency;
      const validation = validateModel(nodes, edges);
      const simulationResult = validation.valid
        ? runMonteCarloSimulation(nodes, edges, get().trials, currency)
        : null;
      const name = parsed.name || 'Imported Project Model';
      set({
        modelName: name,
        currency,
        nodes,
        edges,
        selectedNodeId: null,
        selectedEdgeId: null,
        validation,
        simulationResult,
        connectionError: null,
        layoutVersion: get().layoutVersion + 1,
      });
      persistDraft(name, currency, nodes, edges);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid JSON file.',
      };
    }
  },
}));
