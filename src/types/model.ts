import type { Node, Edge, Viewport } from '@xyflow/react';

export type ModelNodeType = 'start' | 'question' | 'outcome' | 'end';

export type CurrencyCode = 'GBP' | 'USD' | 'EUR' | 'AUD' | 'CAD' | 'JPY';

export type LayoutAlgorithm =
  | 'layered-lr'
  | 'layered-tb'
  | 'tree-lr'
  | 'compact-lr'
  | 'radial';

export const LAYOUT_ALGORITHMS: {
  id: LayoutAlgorithm;
  label: string;
  description: string;
}[] = [
  {
    id: 'layered-lr',
    label: 'Layered DAG (Left → Right)',
    description: 'Sugiyama-style horizontal ranks with barycenter alignment',
  },
  {
    id: 'tree-lr',
    label: 'Decision Tree (Subtree Balanced)',
    description: 'Allocates vertical space proportional to downstream branch subtrees',
  },
  {
    id: 'compact-lr',
    label: 'Compact Swimlanes (By Node Type)',
    description: 'Tightly packed horizontal ranks grouped by Question & Outcome pairs',
  },
  {
    id: 'layered-tb',
    label: 'Top → Bottom Hierarchy',
    description: 'Vertical flowchart arrangement from top to bottom',
  },
  {
    id: 'radial',
    label: 'Radial Concentric Rings',
    description: 'Places Start at center and radiates Questions & Outcomes outward',
  },
];

export const CURRENCY_OPTIONS: {
  code: CurrencyCode;
  symbol: string;
  label: string;
}[] = [
  { code: 'GBP', symbol: '£', label: '£ GBP' },
  { code: 'USD', symbol: '$', label: '$ USD' },
  { code: 'EUR', symbol: '€', label: '€ EUR' },
  { code: 'AUD', symbol: 'A$', label: 'A$ AUD' },
  { code: 'CAD', symbol: 'C$', label: 'C$ CAD' },
  { code: 'JPY', symbol: '¥', label: '¥ JPY' },
];

export function getCurrencySymbol(currency: CurrencyCode = 'GBP'): string {
  return (
    CURRENCY_OPTIONS.find((c) => c.code === currency)?.symbol ?? '£'
  );
}

export interface StartNodeData extends Record<string, unknown> {
  label: string;
}

export interface QuestionNodeData extends Record<string, unknown> {
  label: string;
  description: string;
}

export interface OutcomeNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
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
  outcomeDescription?: string;
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
  currency?: CurrencyCode;
  nodes: ModelNode[];
  edges: ModelEdge[];
  viewport?: Viewport;
}

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'GBP'
): string {
  const locale = currency === 'GBP' ? 'en-GB' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
