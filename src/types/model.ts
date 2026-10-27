import type { Node, Edge, Viewport } from '@xyflow/react';

export type ModelNodeType =
  | 'start'
  | 'question'
  | 'outcome'
  | 'advanced-outcome'
  | 'variable'
  | 'note'
  | 'end';

export function isOutcomeNodeType(
  type: string | undefined
): type is 'outcome' | 'advanced-outcome' {
  return type === 'outcome' || type === 'advanced-outcome';
}

export type CurrencyCode = 'GBP' | 'USD' | 'EUR' | 'AUD' | 'CAD' | 'JPY';

export type LayoutAlgorithm =
  | 'layered-lr'
  | 'layered-tb'
  | 'tree-lr'
  | 'compact-lr'
  | 'radial';

export type OutcomeDisplayMode = 'separate' | 'nested';

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
  impactYearEnabled?: boolean;
  impactYear?: number; // 1..10
}

export interface OutcomeNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  probabilityPct: number; // 0..100
  cost: number; // >= 0
}

export type EstimateMode = 'fixed' | 'three-point' | 'formula';

export interface CostPotAllocation {
  potId: string;
  label: string;
  estimateMode: EstimateMode;
  fixedCost: number;
  lowCost: number;
  mediumCost: number;
  highCost: number;
  formula: string;
}

export interface AdvancedOutcomeNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  probabilityPct: number; // 0..100
  cost: number; // Nominal/expected summary cost for quick display
  pots: CostPotAllocation[];
  capexOpexEnabled?: boolean;
  opexAnnualCost?: number;
  opexInflationPct?: number; // e.g. 3.5 for 3.5%
  opexPotId?: string;
}

export type VariableMode = 'fixed' | 'slider' | 'random';

export interface VariableNodeData extends Record<string, unknown> {
  name: string; // e.g. "variable_a"
  label: string;
  mode: VariableMode;
  fixedValue: number;
  minValue: number;
  maxValue: number;
  sliderValue: number;
}

export interface NoteNodeData extends Record<string, unknown> {
  label: string;
  description: string;
}

export interface EndNodeData extends Record<string, unknown> {
  label: string;
}

export type StartFlowNode = Node<StartNodeData, 'start'>;
export type QuestionFlowNode = Node<QuestionNodeData, 'question'>;
export type OutcomeFlowNode = Node<OutcomeNodeData, 'outcome'>;
export type AdvancedOutcomeFlowNode = Node<
  AdvancedOutcomeNodeData,
  'advanced-outcome'
>;
export type VariableFlowNode = Node<VariableNodeData, 'variable'>;
export type NoteFlowNode = Node<NoteNodeData, 'note'>;
export type EndFlowNode = Node<EndNodeData, 'end'>;

export type AnyOutcomeFlowNode = OutcomeFlowNode | AdvancedOutcomeFlowNode;

export type ModelNode =
  | StartFlowNode
  | QuestionFlowNode
  | OutcomeFlowNode
  | AdvancedOutcomeFlowNode
  | VariableFlowNode
  | NoteFlowNode
  | EndFlowNode;

export type EdgeKind =
  | 'start-to-question'
  | 'question-to-outcome'
  | 'question-to-question'
  | 'question-to-end'
  | 'outcome-to-question'
  | 'outcome-to-end'
  | 'note-link';

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
  isAdvanced?: boolean;
  questionId: string;
  questionLabel: string;
  configuredProbPct: number;
  cost: number; // average sampled cost across hits
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

export interface PathStepTrace {
  questionId: string;
  questionLabel: string;
  outcomeId: string;
  outcomeLabel: string;
  probabilityPct: number;
  cost: number;
  capexCost: number;
  opexCost: number;
  impactYear: number;
}

export interface PathTrace {
  totalCost: number;
  capexTotal: number;
  opexTotal: number;
  steps: PathStepTrace[];
}

export interface PotBreakdownStat {
  potId: string;
  label: string;
  p50: number;
  p80: number;
  p90: number;
  mean: number;
  min: number;
  max: number;
}

export interface YearBreakdownStat {
  year: number;
  p50: number;
  p80: number;
  p90: number;
  mean: number;
  expectedCapex: number;
  expectedOpex: number;
}

export interface CapexOpexSummary {
  enabled: boolean;
  horizonYears: number;
  capexP50: number;
  capexP80: number;
  capexMean: number;
  opexP50: number;
  opexP80: number;
  opexMean: number;
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
  minPath: PathTrace;
  maxPath: PathTrace;
  hasAdvancedOutcomes: boolean;
  potBreakdowns: PotBreakdownStat[];
  capexOpex: CapexOpexSummary;
  impactYearsEnabled: boolean;
  yearBreakdowns: YearBreakdownStat[];
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

export function createDefaultPots(): CostPotAllocation[] {
  return [
    {
      potId: 'internal',
      label: 'Internal (Staff & Resources)',
      estimateMode: 'fixed',
      fixedCost: 15000,
      lowCost: 10000,
      mediumCost: 15000,
      highCost: 25000,
      formula: '15000',
    },
    {
      potId: 'external',
      label: 'External (Vendors & Cash Out)',
      estimateMode: 'fixed',
      fixedCost: 35000,
      lowCost: 25000,
      mediumCost: 35000,
      highCost: 55000,
      formula: '35000',
    },
  ];
}
