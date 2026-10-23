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
  type ModelEdge,
  type ModelNode,
  type ModelNodeType,
  type OutcomeFlowNode,
  type ProjectModel,
  type SimulationResult,
  type ValidationResult,
} from '../types/model';
import { canConnectNodes, inferEdgeKind, validateModel } from '../sim/validate';
import { runMonteCarloSimulation } from '../sim/monteCarlo';
import { computeAutoLayout } from '../sim/autoLayout';
import { DEMO_MODEL } from './demoModel';

const STORAGE_KEY = 'mc-modeller:v1';

export type ActiveTab = 'editor' | 'results';

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
  const isEnd = kind === 'outcome-to-end';
  const isOr = kind === 'question-to-outcome';

  let label: string | undefined;
  if (isAnd) {
    label = 'AND';
  } else if (isOr && tgt?.type === 'outcome') {
    const o = tgt as OutcomeFlowNode;
    label = `${o.data.probabilityPct}%`;
  }

  const strokeColor = isAnd
    ? '#f59e0b'
    : isOr
      ? '#38bdf8'
      : isEnd
        ? '#64748b'
        : '#94a3b8';

  return {
    ...edge,
    type: 'smoothstep',
    animated: isAnd,
    label,
    labelStyle: isAnd
      ? { fill: '#fbbf24', fontWeight: 700, fontSize: 11 }
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
      strokeWidth: isAnd ? 2.2 : 2,
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

interface ModelStoreState {
  modelName: string;
  currency: CurrencyCode;
  nodes: ModelNode[];
  edges: ModelEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  activeTab: ActiveTab;
  trials: number;
  validation: ValidationResult;
  simulationResult: SimulationResult | null;
  connectionError: string | null;
  layoutVersion: number;

  setModelName: (name: string) => void;
  setCurrency: (currency: CurrencyCode) => void;
  setActiveTab: (tab: ActiveTab) => void;
  setTrials: (trials: number) => void;
  clearConnectionError: () => void;

  onNodesChange: (changes: NodeChange<ModelNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ModelEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;

  addNode: (type: ModelNodeType, position?: { x: number; y: number }) => string;
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
  deleteSelected: () => void;
  deleteNodeById: (nodeId: string) => void;
  deleteEdgeById: (edgeId: string) => void;

  addOutcomeForQuestion: (questionId: string) => void;
  splitQuestionProbabilitiesEvenly: (questionId: string) => void;
  autoLayout: () => void;

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
  activeTab: 'editor',
  trials: 10000,
  validation: initialValidation,
  simulationResult: initialSimulation,
  connectionError: null,
  layoutVersion: 0,

  setModelName: (name) => {
    set({ modelName: name });
    const { currency, nodes, edges } = get();
    persistDraft(name, currency, nodes, edges);
  },

  setCurrency: (currency) => {
    const { modelName, nodes, edges, simulationResult } = get();
    // Relabel histogram bins if a simulation result is already present
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

    const selectedNodeId = get().selectedNodeId;
    const stillExists =
      selectedNodeId && nextNodes.some((n) => n.id === selectedNodeId);

    set({
      nodes: nextNodes,
      edges: nextEdges,
      validation,
      selectedNodeId: stillExists ? selectedNodeId : null,
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
    const check = canConnectNodes(
      nodes,
      edges,
      connection.source,
      connection.target
    );
    if (!check.allowed || !check.kind) {
      set({ connectionError: check.reason ?? 'Invalid connection' });
      return;
    }

    const newEdge: ModelEdge = decorateEdge(
      {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle ?? null,
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

  selectNode: (nodeId) =>
    set({ selectedNodeId: nodeId, selectedEdgeId: null }),

  selectEdge: (edgeId) =>
    set({ selectedEdgeId: edgeId, selectedNodeId: null }),

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
        data: { label: 'Project Start' },
      };
    } else if (type === 'question') {
      newNode = {
        id,
        type: 'question',
        position: pos,
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
        data: {
          label: `Outcome ${countOfType}`,
          probabilityPct: 50,
          cost: 25000,
        },
      };
    } else {
      newNode = {
        id,
        type: 'end',
        position: pos,
        data: { label: 'End' },
      };
    }

    const nextNodes = [...nodes, newNode];
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

  deleteSelected: () => {
    const { selectedNodeId, selectedEdgeId } = get();
    if (selectedNodeId) {
      get().deleteNodeById(selectedNodeId);
    } else if (selectedEdgeId) {
      get().deleteEdgeById(selectedEdgeId);
    }
  },

  deleteNodeById: (nodeId) => {
    const { nodes, edges, modelName, currency } = get();
    const nextNodes = nodes.filter((n) => n.id !== nodeId);
    const nextEdges = hydrateEdges(
      nextNodes,
      edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
    );
    const validation = validateModel(nextNodes, nextEdges);
    set({
      nodes: nextNodes,
      edges: nextEdges,
      validation,
      selectedNodeId: null,
    });
    persistDraft(modelName, currency, nextNodes, nextEdges);
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

  autoLayout: () => {
    const { nodes, edges, modelName, currency, layoutVersion } = get();
    const laidOutNodes = computeAutoLayout(nodes, edges);
    set({
      nodes: laidOutNodes,
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
        id: 'e-o1-end',
        source: 'o-1',
        target: 'end-1',
        data: { kind: 'outcome-to-end' },
      },
      {
        id: 'e-o2-end',
        source: 'o-2',
        target: 'end-1',
        data: { kind: 'outcome-to-end' },
      },
    ]);
    const validation = validateModel(freshNodes, freshEdges);
    const name = 'New Project Budget Model';
    set({
      modelName: name,
      nodes: freshNodes,
      edges: freshEdges,
      selectedNodeId: 'q-1',
      selectedEdgeId: null,
      validation,
      simulationResult: runMonteCarloSimulation(
        freshNodes,
        freshEdges,
        trials,
        currency
      ),
      activeTab: 'editor',
      connectionError: null,
      layoutVersion: layoutVersion + 1,
    });
    persistDraft(name, currency, freshNodes, freshEdges);
  },

  loadDemoModel: () => {
    const { currency, trials, layoutVersion } = get();
    const nodes = structuredClone(DEMO_MODEL.nodes);
    const edges = hydrateEdges(nodes, structuredClone(DEMO_MODEL.edges));
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
