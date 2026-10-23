import type { Node, Edge, Viewport } from '@xyflow/react';

export type ModelNodeType = 'start' | 'question' | 'outcome' | 'end';

export interface StartNodeData extends Record<string, unknown> {
  label: string;
}

export interface QuestionNodeData extends Record<string, unknown> {
  label: string;
  description: string;
}

export interface OutcomeNodeData extends Record<string, unknown> {
  label: string;
  probabilityPct: number; // 0..100
  cost: number; // >= 0
}

export interface EndNodeData extends Record<string, unknown> {
  label: string;
}

export type StartFlowNode = Node<StartNodeData, 'start'>;
export type QuestionFlowNode = Node<QuestionNodeData, 'question'>;
export type OutcomeFlowNode = Node<OutcomeNodeData, 'outcome'>;
export type EndFlowNode = Node<EndNodeData, 'end'>;

export type ModelNode =
  | StartFlowNode
  | QuestionFlowNode
  | OutcomeFlowNode
  | EndFlowNode;

export type EdgeKind =
  | 'start-to-question'
  | 'question-to-outcome'
  | 'question-to-question'
  | 'outcome-to-question'
  | 'outcome-to-end';

export interface ModelEdgeData extends Record<string, unknown> {
  kind: EdgeKind;
}

export type ModelEdge = Edge<ModelEdgeData>;

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  nodeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  questionProbSums: Record<string, number>;
  questionOutcomeCounts: Record<string, number>;
  reachableNodeIds: Set<string>;
}

export interface HistogramBin {
  minCost: number;
  maxCost: number;
  label: string;
  count: number;
  frequencyPct: number;
  cumulativePct: number;
  containsP80: boolean;
}

export interface OutcomeDriverStat {
  outcomeId: string;
  outcomeLabel: string;
  questionId: string;
  questionLabel: string;
  configuredProbPct: number;
  cost: number;
  hitCount: number;
  hitRatePct: number;
  expectedCostContribution: number;
}

export interface QuestionDriverStat {
  questionId: string;
  questionLabel: string;
  visitCount: number;
  visitRatePct: number;
  expectedCostContribution: number;
  outcomes: OutcomeDriverStat[];
}

export interface SimulationResult {
  trials: number;
  timestamp: number;
  p10: number;
  p50: number;
  p80: number;
  p90: number;
  p95: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  histogram: HistogramBin[];
  questionDrivers: QuestionDriverStat[];
  outcomeDrivers: OutcomeDriverStat[];
}

export interface ProjectModel {
  version: 1;
  name: string;
  nodes: ModelNode[];
  edges: ModelEdge[];
  viewport?: Viewport;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}
