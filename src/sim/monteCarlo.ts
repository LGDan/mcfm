import {
  isOutcomeNodeType,
  type AdvancedOutcomeFlowNode,
  type CapexOpexSummary,
  type CostPotAllocation,
  type CurrencyCode,
  type HistogramBin,
  type ModelEdge,
  type ModelNode,
  type OutcomeDriverStat,
  type OutcomeFlowNode,
  type PathStepTrace,
  type PathTrace,
  type PotBreakdownStat,
  type QuestionDriverStat,
  type QuestionFlowNode,
  type SimulationResult,
  type VariableFlowNode,
  type YearBreakdownStat,
} from '../types/model';
import { formatCurrency } from '../types/model';
import {
  evaluatePotCost,
  sampleVariableValue,
} from './formulaEvaluator';

const DEFAULT_OPEX_HORIZON = 5;

interface CompiledOutcome {
  id: string;
  label: string;
  description?: string;
  isAdvanced: boolean;
  probability: number;
  probabilityPct: number;
  fixedCost: number;
  pots: CostPotAllocation[];
  capexOpexEnabled: boolean;
  opexAnnualCost: number;
  opexInflationPct: number;
  opexPotId: string;
  cumulativeProbability: number;
}

interface CompiledQuestion {
  id: string;
  label: string;
  impactYearEnabled: boolean;
  impactYear: number;
}

interface CompiledGraph {
  startQuestions: string[];
  questions: Map<string, CompiledQuestion>;
  questionAndTargets: Map<string, string[]>;
  questionOutcomes: Map<string, CompiledOutcome[]>;
  outcomeQuestionTargets: Map<string, string[]>;
  variables: VariableFlowNode[];
  potCatalog: Map<string, string>;
  hasAdvancedOutcomes: boolean;
  impactYearsEnabled: boolean;
  yearHorizon: number;
}

interface SampledOutcomeCost {
  total: number;
  capex: number;
  opex: number;
  potDeltas: Map<string, number>;
  yearCapex: Map<number, number>;
  yearOpex: Map<number, number>;
}

function emptyPath(): PathTrace {
  return { totalCost: 0, capexTotal: 0, opexTotal: 0, steps: [] };
}

function clonePath(path: PathTrace): PathTrace {
  return {
    totalCost: path.totalCost,
    capexTotal: path.capexTotal,
    opexTotal: path.opexTotal,
    steps: path.steps.map((s) => ({ ...s })),
  };
}

export function compileGraph(
  nodes: ModelNode[],
  edges: ModelEdge[]
): CompiledGraph {
  const nodeMap = new Map<string, ModelNode>();
  const questions = new Map<string, CompiledQuestion>();
  const questionAndTargets = new Map<string, string[]>();
  const questionOutcomes = new Map<string, CompiledOutcome[]>();
  const outcomeQuestionTargets = new Map<string, string[]>();
  const variables: VariableFlowNode[] = [];
  const potCatalog = new Map<string, string>();

  let hasAdvancedOutcomes = false;
  let impactYearsEnabled = false;
  let maxImpactYear = 1;

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    if (n.type === 'question') {
      const qNode = n as QuestionFlowNode;
      const impactYear = Math.max(
        1,
        Math.min(10, Math.round(Number(qNode.data.impactYear) || 1))
      );
      if (qNode.data.impactYearEnabled) {
        impactYearsEnabled = true;
        maxImpactYear = Math.max(maxImpactYear, impactYear);
      }
      questions.set(n.id, {
        id: n.id,
        label: qNode.data.label,
        impactYearEnabled: Boolean(qNode.data.impactYearEnabled),
        impactYear,
      });
      questionAndTargets.set(n.id, []);
      questionOutcomes.set(n.id, []);
    } else if (isOutcomeNodeType(n.type)) {
      outcomeQuestionTargets.set(n.id, []);
      if (n.type === 'advanced-outcome') {
        hasAdvancedOutcomes = true;
        const adv = n as AdvancedOutcomeFlowNode;
        if (adv.data.capexOpexEnabled) impactYearsEnabled = true;
        for (const pot of adv.data.pots ?? []) {
          potCatalog.set(pot.potId, pot.label);
        }
      }
    } else if (n.type === 'variable') {
      variables.push(n as VariableFlowNode);
    }
  }

  const startQuestions: string[] = [];

  for (const e of edges) {
    if (e.data?.kind === 'note-link') continue;
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;

    if (src.type === 'start' && tgt.type === 'question') {
      startQuestions.push(tgt.id);
    } else if (src.type === 'question' && tgt.type === 'question') {
      questionAndTargets.get(src.id)?.push(tgt.id);
    } else if (src.type === 'question' && isOutcomeNodeType(tgt.type)) {
      const list = questionOutcomes.get(src.id) ?? [];
      list.push(compileOutcomeNode(tgt));
      questionOutcomes.set(src.id, list);
    } else if (isOutcomeNodeType(src.type) && tgt.type === 'question') {
      outcomeQuestionTargets.get(src.id)?.push(tgt.id);
    }
  }

  for (const [, outcomes] of questionOutcomes.entries()) {
    const totalProb = outcomes.reduce((acc, o) => acc + o.probability, 0);
    let cum = 0;
    for (let i = 0; i < outcomes.length; i++) {
      const normProb = totalProb > 0 ? outcomes[i].probability / totalProb : 0;
      cum += normProb;
      outcomes[i].cumulativeProbability =
        i === outcomes.length - 1 ? 1.0 : cum;
    }
  }

  const yearHorizon = Math.max(
    DEFAULT_OPEX_HORIZON,
    maxImpactYear,
    maxImpactYear + (hasAdvancedOutcomes ? DEFAULT_OPEX_HORIZON - 1 : 0)
  );

  return {
    startQuestions,
    questions,
    questionAndTargets,
    questionOutcomes,
    outcomeQuestionTargets,
    variables,
    potCatalog,
    hasAdvancedOutcomes,
    impactYearsEnabled,
    yearHorizon,
  };
}

function compileOutcomeNode(node: ModelNode): CompiledOutcome {
  if (node.type === 'advanced-outcome') {
    const adv = node as AdvancedOutcomeFlowNode;
    const pots = adv.data.pots ?? [];
    return {
      id: adv.id,
      label: adv.data.label,
      description: adv.data.description,
      isAdvanced: true,
      probability: Math.max(0, Number(adv.data.probabilityPct) || 0) / 100,
      probabilityPct: Math.max(0, Number(adv.data.probabilityPct) || 0),
      fixedCost: 0,
      pots,
      capexOpexEnabled: Boolean(adv.data.capexOpexEnabled),
      opexAnnualCost: Math.max(0, Number(adv.data.opexAnnualCost) || 0),
      opexInflationPct: Number.isFinite(Number(adv.data.opexInflationPct))
        ? Number(adv.data.opexInflationPct)
        : 3.5,
      opexPotId: adv.data.opexPotId || 'external',
      cumulativeProbability: 0,
    };
  }

  const oNode = node as OutcomeFlowNode;
  return {
    id: oNode.id,
    label: oNode.data.label,
    description: oNode.data.description,
    isAdvanced: false,
    probability: Math.max(0, Number(oNode.data.probabilityPct) || 0) / 100,
    probabilityPct: Math.max(0, Number(oNode.data.probabilityPct) || 0),
    fixedCost: Math.max(0, Number(oNode.data.cost) || 0),
    pots: [],
    capexOpexEnabled: false,
    opexAnnualCost: 0,
    opexInflationPct: 3.5,
    opexPotId: 'external',
    cumulativeProbability: 0,
  };
}

function sampleOutcome(
  outcomes: CompiledOutcome[],
  u: number
): CompiledOutcome | undefined {
  for (let i = 0; i < outcomes.length; i++) {
    if (u <= outcomes[i].cumulativeProbability) {
      return outcomes[i];
    }
  }
  return outcomes[outcomes.length - 1];
}

function computePercentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function sampleVariables(
  variables: VariableFlowNode[],
  rng: () => number
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const v of variables) {
    map[v.data.name] = sampleVariableValue(v.data, rng);
  }
  return map;
}

function extremeVariableMap(
  variables: VariableFlowNode[],
  mode: 'min' | 'max'
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const v of variables) {
    if (v.data.mode === 'fixed') {
      map[v.data.name] = Number(v.data.fixedValue) || 0;
    } else if (v.data.mode === 'slider') {
      map[v.data.name] = Number(v.data.sliderValue) || 0;
    } else {
      const lo = Number(v.data.minValue) || 0;
      const hi = Number(v.data.maxValue) || 0;
      map[v.data.name] = mode === 'min' ? Math.min(lo, hi) : Math.max(lo, hi);
    }
  }
  return map;
}

function evaluatePotForExtreme(
  pot: CostPotAllocation,
  variables: Record<string, number>,
  mode: 'min' | 'max'
): number {
  if (pot.estimateMode === 'fixed') {
    return Math.max(0, Number(pot.fixedCost) || 0);
  }
  if (pot.estimateMode === 'three-point') {
    const low = Math.max(0, Number(pot.lowCost) || 0);
    const high = Math.max(0, Number(pot.highCost) || 0);
    return mode === 'min' ? Math.min(low, high) : Math.max(low, high);
  }
  return evaluatePotCost(pot, variables);
}

function sampleOutcomeCost(
  outcome: CompiledOutcome,
  variables: Record<string, number>,
  impactYear: number,
  yearHorizon: number,
  rng?: () => number,
  extremeMode?: 'min' | 'max'
): SampledOutcomeCost {
  const potDeltas = new Map<string, number>();
  const yearCapex = new Map<number, number>();
  const yearOpex = new Map<number, number>();
  const year = Math.max(1, Math.min(yearHorizon, impactYear));

  let capex = 0;
  if (outcome.isAdvanced) {
    for (const pot of outcome.pots) {
      const val = extremeMode
        ? evaluatePotForExtreme(pot, variables, extremeMode)
        : evaluatePotCost(pot, variables, rng);
      capex += val;
      potDeltas.set(pot.potId, (potDeltas.get(pot.potId) ?? 0) + val);
    }
  } else {
    capex = outcome.fixedCost;
  }

  yearCapex.set(year, capex);

  let opex = 0;
  if (outcome.capexOpexEnabled && outcome.opexAnnualCost > 0) {
    const inf = (Number(outcome.opexInflationPct) || 0) / 100;
    for (let i = 0; i < DEFAULT_OPEX_HORIZON; i++) {
      const y = year + i;
      if (y > yearHorizon && y > year + DEFAULT_OPEX_HORIZON - 1) break;
      const opexY = outcome.opexAnnualCost * Math.pow(1 + inf, i);
      opex += opexY;
      yearOpex.set(y, (yearOpex.get(y) ?? 0) + opexY);
      potDeltas.set(
        outcome.opexPotId,
        (potDeltas.get(outcome.opexPotId) ?? 0) + opexY
      );
    }
  }

  return {
    total: capex + opex,
    capex,
    opex,
    potDeltas,
    yearCapex,
    yearOpex,
  };
}

function addMap(target: Map<string, number>, delta: Map<string, number>) {
  for (const [k, v] of delta.entries()) {
    target.set(k, (target.get(k) ?? 0) + v);
  }
}

function addYearMap(target: Map<number, number>, delta: Map<number, number>) {
  for (const [k, v] of delta.entries()) {
    target.set(k, (target.get(k) ?? 0) + v);
  }
}

interface WalkResult {
  totalCost: number;
  capexTotal: number;
  opexTotal: number;
  steps: PathStepTrace[];
  potTotals: Map<string, number>;
  yearCapex: Map<number, number>;
  yearOpex: Map<number, number>;
  visitedQuestions: string[];
  chosenOutcomes: { questionId: string; outcome: CompiledOutcome; cost: number }[];
}

function walkGraph(
  adj: CompiledGraph,
  rng: () => number,
  variables: Record<string, number>,
  pickOutcome: (
    outcomes: CompiledOutcome[],
    questionId: string
  ) => CompiledOutcome | undefined,
  extremeMode?: 'min' | 'max'
): WalkResult {
  const queue: string[] = [...adj.startQuestions];
  const visitedQuestions = new Set<string>();
  const steps: PathStepTrace[] = [];
  const potTotals = new Map<string, number>();
  const yearCapex = new Map<number, number>();
  const yearOpex = new Map<number, number>();
  const visitedList: string[] = [];
  const chosenOutcomes: WalkResult['chosenOutcomes'] = [];
  let capexTotal = 0;
  let opexTotal = 0;

  while (queue.length > 0) {
    const qId = queue.shift()!;
    if (visitedQuestions.has(qId)) continue;
    visitedQuestions.add(qId);
    visitedList.push(qId);

    for (const andQId of adj.questionAndTargets.get(qId) ?? []) {
      if (!visitedQuestions.has(andQId)) queue.push(andQId);
    }

    const qMeta = adj.questions.get(qId);
    const outcomes = adj.questionOutcomes.get(qId) ?? [];
    if (outcomes.length === 0 || !qMeta) continue;

    const chosen = pickOutcome(outcomes, qId);
    if (!chosen) continue;

    const impactYear = qMeta.impactYearEnabled ? qMeta.impactYear : 1;
    const sampled = sampleOutcomeCost(
      chosen,
      variables,
      impactYear,
      adj.yearHorizon,
      extremeMode ? undefined : rng,
      extremeMode
    );

    capexTotal += sampled.capex;
    opexTotal += sampled.opex;
    addMap(potTotals, sampled.potDeltas);
    addYearMap(yearCapex, sampled.yearCapex);
    addYearMap(yearOpex, sampled.yearOpex);
    chosenOutcomes.push({
      questionId: qId,
      outcome: chosen,
      cost: sampled.total,
    });

    steps.push({
      questionId: qId,
      questionLabel: qMeta.label,
      outcomeId: chosen.id,
      outcomeLabel: chosen.label,
      probabilityPct: chosen.probabilityPct,
      cost: sampled.total,
      capexCost: sampled.capex,
      opexCost: sampled.opex,
      impactYear,
    });

    for (const nextQId of adj.outcomeQuestionTargets.get(chosen.id) ?? []) {
      if (!visitedQuestions.has(nextQId)) queue.push(nextQId);
    }
  }

  return {
    totalCost: capexTotal + opexTotal,
    capexTotal,
    opexTotal,
    steps,
    potTotals,
    yearCapex,
    yearOpex,
    visitedQuestions: visitedList,
    chosenOutcomes,
  };
}

function computeExtremePath(
  adj: CompiledGraph,
  mode: 'min' | 'max'
): PathTrace {
  const variables = extremeVariableMap(adj.variables, mode);
  const memo = new Map<string, { cost: number; outcomeId: string | null }>();

  const questionCost = (qId: string, stack: Set<string>): number => {
    if (stack.has(qId)) return 0;
    const cached = memo.get(qId);
    if (cached) return cached.cost;

    stack.add(qId);
    const qMeta = adj.questions.get(qId);
    const outcomes = adj.questionOutcomes.get(qId) ?? [];
    const impactYear = qMeta?.impactYearEnabled ? qMeta.impactYear : 1;

    let andCost = 0;
    for (const andQId of adj.questionAndTargets.get(qId) ?? []) {
      andCost += questionCost(andQId, stack);
    }

    if (outcomes.length === 0) {
      stack.delete(qId);
      memo.set(qId, { cost: andCost, outcomeId: null });
      return andCost;
    }

    let bestCost = mode === 'min' ? Infinity : -Infinity;
    let bestId: string | null = null;
    for (const o of outcomes) {
      const sampled = sampleOutcomeCost(
        o,
        variables,
        impactYear,
        adj.yearHorizon,
        undefined,
        mode
      );
      let downstream = 0;
      for (const nextQ of adj.outcomeQuestionTargets.get(o.id) ?? []) {
        downstream += questionCost(nextQ, stack);
      }
      const total = sampled.total + downstream;
      const better = mode === 'min' ? total < bestCost : total > bestCost;
      if (better) {
        bestCost = total;
        bestId = o.id;
      }
    }

    stack.delete(qId);
    const result = andCost + (Number.isFinite(bestCost) ? bestCost : 0);
    memo.set(qId, { cost: result, outcomeId: bestId });
    return result;
  };

  for (const qId of adj.startQuestions) {
    questionCost(qId, new Set());
  }

  const pickOutcome = (outcomes: CompiledOutcome[], questionId: string) => {
    const preferred = memo.get(questionId)?.outcomeId;
    return outcomes.find((o) => o.id === preferred) ?? outcomes[0];
  };

  const walked = walkGraph(adj, Math.random, variables, pickOutcome, mode);
  return {
    totalCost: walked.totalCost,
    capexTotal: walked.capexTotal,
    opexTotal: walked.opexTotal,
    steps: walked.steps,
  };
}

function statsFromTrials(values: number[]): {
  p50: number;
  p80: number;
  p90: number;
  mean: number;
  min: number;
  max: number;
} {
  if (values.length === 0) {
    return { p50: 0, p80: 0, p90: 0, mean: 0, min: 0, max: 0 };
  }
  const sorted = new Float64Array(values);
  sorted.sort();
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  return {
    p50: computePercentile(sorted, 50),
    p80: computePercentile(sorted, 80),
    p90: computePercentile(sorted, 90),
    mean: sum / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

export function runMonteCarloSimulation(
  nodes: ModelNode[],
  edges: ModelEdge[],
  trials = 10000,
  currency: CurrencyCode = 'GBP',
  rng: () => number = Math.random
): SimulationResult {
  const adj = compileGraph(nodes, edges);
  const trialTotals = new Float64Array(trials);
  const trialCapex = new Float64Array(trials);
  const trialOpex = new Float64Array(trials);

  const questionVisitCounts = new Map<string, number>();
  const outcomeHitCounts = new Map<string, number>();
  const outcomeCostSums = new Map<string, number>();

  for (const qId of adj.questions.keys()) {
    questionVisitCounts.set(qId, 0);
    for (const o of adj.questionOutcomes.get(qId) ?? []) {
      outcomeHitCounts.set(o.id, 0);
      outcomeCostSums.set(o.id, 0);
    }
  }

  const potTrialTotals = new Map<string, number[]>();
  for (const potId of adj.potCatalog.keys()) {
    potTrialTotals.set(potId, new Array(trials).fill(0));
  }

  const yearCapexTrials = new Map<number, number[]>();
  const yearOpexTrials = new Map<number, number[]>();
  for (let y = 1; y <= adj.yearHorizon; y++) {
    yearCapexTrials.set(y, new Array(trials).fill(0));
    yearOpexTrials.set(y, new Array(trials).fill(0));
  }

  let minPath = emptyPath();
  let maxPath = emptyPath();
  let minObserved = Infinity;
  let maxObserved = -Infinity;

  for (let t = 0; t < trials; t++) {
    const variables = sampleVariables(adj.variables, rng);
    const walked = walkGraph(adj, rng, variables, (outcomes) =>
      sampleOutcome(outcomes, rng())
    );

    trialTotals[t] = walked.totalCost;
    trialCapex[t] = walked.capexTotal;
    trialOpex[t] = walked.opexTotal;

    for (const qId of walked.visitedQuestions) {
      questionVisitCounts.set(qId, (questionVisitCounts.get(qId) ?? 0) + 1);
    }
    for (const chosen of walked.chosenOutcomes) {
      outcomeHitCounts.set(
        chosen.outcome.id,
        (outcomeHitCounts.get(chosen.outcome.id) ?? 0) + 1
      );
      outcomeCostSums.set(
        chosen.outcome.id,
        (outcomeCostSums.get(chosen.outcome.id) ?? 0) + chosen.cost
      );
    }

    for (const [potId, series] of potTrialTotals.entries()) {
      series[t] = walked.potTotals.get(potId) ?? 0;
    }
    for (let y = 1; y <= adj.yearHorizon; y++) {
      yearCapexTrials.get(y)![t] = walked.yearCapex.get(y) ?? 0;
      yearOpexTrials.get(y)![t] = walked.yearOpex.get(y) ?? 0;
    }

    if (walked.totalCost < minObserved) {
      minObserved = walked.totalCost;
      minPath = {
        totalCost: walked.totalCost,
        capexTotal: walked.capexTotal,
        opexTotal: walked.opexTotal,
        steps: walked.steps,
      };
    }
    if (walked.totalCost > maxObserved) {
      maxObserved = walked.totalCost;
      maxPath = {
        totalCost: walked.totalCost,
        capexTotal: walked.capexTotal,
        opexTotal: walked.opexTotal,
        steps: walked.steps,
      };
    }
  }

  const theoreticalMin = computeExtremePath(adj, 'min');
  const theoreticalMax = computeExtremePath(adj, 'max');
  if (
    theoreticalMin.steps.length > 0 &&
    theoreticalMin.totalCost < minPath.totalCost
  ) {
    minPath = theoreticalMin;
  }
  if (
    theoreticalMax.steps.length > 0 &&
    theoreticalMax.totalCost > maxPath.totalCost
  ) {
    maxPath = theoreticalMax;
  }

  const sorted = new Float64Array(trialTotals);
  sorted.sort();

  const min = sorted.length > 0 ? sorted[0] : 0;
  const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
  const p10 = computePercentile(sorted, 10);
  const p50 = computePercentile(sorted, 50);
  const p80 = computePercentile(sorted, 80);
  const p90 = computePercentile(sorted, 90);
  const p95 = computePercentile(sorted, 95);

  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  const mean = sorted.length > 0 ? sum / sorted.length : 0;

  let varianceSum = 0;
  for (let i = 0; i < sorted.length; i++) {
    const diff = sorted[i] - mean;
    varianceSum += diff * diff;
  }
  const stdDev = sorted.length > 0 ? Math.sqrt(varianceSum / sorted.length) : 0;

  const histogram = buildHistogram(sorted, min, max, p80, currency);

  const questionDrivers: QuestionDriverStat[] = [];
  const allOutcomeDrivers: OutcomeDriverStat[] = [];

  for (const [qId, qMeta] of adj.questions.entries()) {
    const visits = questionVisitCounts.get(qId) ?? 0;
    if (visits === 0 && (adj.questionOutcomes.get(qId)?.length ?? 0) === 0) {
      continue;
    }

    const outcomes = adj.questionOutcomes.get(qId) ?? [];
    const outcomeStats: OutcomeDriverStat[] = outcomes.map((o) => {
      const hits = outcomeHitCounts.get(o.id) ?? 0;
      const costSum = outcomeCostSums.get(o.id) ?? 0;
      const avgCost = hits > 0 ? costSum / hits : o.fixedCost;
      const hitRatePct = trials > 0 ? (hits / trials) * 100 : 0;
      const expectedCostContribution = trials > 0 ? costSum / trials : 0;
      const stat: OutcomeDriverStat = {
        outcomeId: o.id,
        outcomeLabel: o.label,
        outcomeDescription: o.description,
        isAdvanced: o.isAdvanced,
        questionId: qId,
        questionLabel: qMeta.label,
        configuredProbPct: o.probabilityPct,
        cost: avgCost,
        hitCount: hits,
        hitRatePct,
        expectedCostContribution,
      };
      allOutcomeDrivers.push(stat);
      return stat;
    });

    const qExpectedCost = outcomeStats.reduce(
      (acc, s) => acc + s.expectedCostContribution,
      0
    );

    questionDrivers.push({
      questionId: qId,
      questionLabel: qMeta.label,
      visitCount: visits,
      visitRatePct: trials > 0 ? (visits / trials) * 100 : 0,
      expectedCostContribution: qExpectedCost,
      outcomes: outcomeStats,
    });
  }

  questionDrivers.sort(
    (a, b) => b.expectedCostContribution - a.expectedCostContribution
  );
  allOutcomeDrivers.sort(
    (a, b) => b.expectedCostContribution - a.expectedCostContribution
  );

  const potBreakdowns: PotBreakdownStat[] = [];
  for (const [potId, label] of adj.potCatalog.entries()) {
    const series = potTrialTotals.get(potId) ?? [];
    const st = statsFromTrials(series);
    potBreakdowns.push({
      potId,
      label,
      ...st,
    });
  }
  potBreakdowns.sort((a, b) => b.mean - a.mean);

  const yearBreakdowns: YearBreakdownStat[] = [];
  if (adj.impactYearsEnabled) {
    for (let y = 1; y <= adj.yearHorizon; y++) {
      const capexSeries = yearCapexTrials.get(y) ?? [];
      const opexSeries = yearOpexTrials.get(y) ?? [];
      const combined = capexSeries.map((c, i) => c + (opexSeries[i] ?? 0));
      const st = statsFromTrials(combined);
      const expectedCapex =
        capexSeries.reduce((a, b) => a + b, 0) / Math.max(1, trials);
      const expectedOpex =
        opexSeries.reduce((a, b) => a + b, 0) / Math.max(1, trials);
      yearBreakdowns.push({
        year: y,
        p50: st.p50,
        p80: st.p80,
        p90: st.p90,
        mean: st.mean,
        expectedCapex,
        expectedOpex,
      });
    }
  }

  const capexStats = statsFromTrials(Array.from(trialCapex));
  const opexStats = statsFromTrials(Array.from(trialOpex));
  const capexOpex: CapexOpexSummary = {
    enabled: nodes.some(
      (n) => n.type === 'advanced-outcome' && n.data.capexOpexEnabled
    ),
    horizonYears: adj.yearHorizon,
    capexP50: capexStats.p50,
    capexP80: capexStats.p80,
    capexMean: capexStats.mean,
    opexP50: opexStats.p50,
    opexP80: opexStats.p80,
    opexMean: opexStats.mean,
  };

  return {
    trials,
    timestamp: Date.now(),
    p10,
    p50,
    p80,
    p90,
    p95,
    mean,
    stdDev,
    min,
    max,
    histogram,
    questionDrivers,
    outcomeDrivers: allOutcomeDrivers,
    minPath: clonePath(minPath),
    maxPath: clonePath(maxPath),
    hasAdvancedOutcomes: adj.hasAdvancedOutcomes,
    potBreakdowns,
    capexOpex,
    impactYearsEnabled: adj.impactYearsEnabled,
    yearBreakdowns,
  };
}

function buildHistogram(
  sorted: Float64Array,
  min: number,
  max: number,
  p80: number,
  currency: CurrencyCode
): HistogramBin[] {
  const n = sorted.length;
  if (n === 0) return [];

  const distinctCounts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const val = Math.round(sorted[i] * 100) / 100;
    distinctCounts.set(val, (distinctCounts.get(val) ?? 0) + 1);
  }

  if (distinctCounts.size <= 15) {
    const entries = Array.from(distinctCounts.entries()).sort(
      (a, b) => a[0] - b[0]
    );
    let cumCount = 0;
    let p80Marked = false;
    return entries.map(([val, count]) => {
      cumCount += count;
      const cumulativePct = (cumCount / n) * 100;
      const containsP80 = !p80Marked && val >= p80 - 1e-6;
      if (containsP80) p80Marked = true;
      return {
        minCost: val,
        maxCost: val,
        label: formatCurrency(val, currency),
        count,
        frequencyPct: (count / n) * 100,
        cumulativePct,
        containsP80,
      };
    });
  }

  const binCount = 24;
  const range = Math.max(1, max - min);
  const binWidth = range / binCount;
  const counts = new Array<number>(binCount).fill(0);

  for (let i = 0; i < n; i++) {
    const idx = Math.min(binCount - 1, Math.floor((sorted[i] - min) / binWidth));
    counts[idx]++;
  }

  let cumCount = 0;
  let p80Marked = false;
  return counts.map((count, i) => {
    const binMin = min + i * binWidth;
    const binMax = i === binCount - 1 ? max : min + (i + 1) * binWidth;
    cumCount += count;
    const containsP80 = !p80Marked && p80 >= binMin && p80 <= binMax + 1e-6;
    if (containsP80) p80Marked = true;
    return {
      minCost: binMin,
      maxCost: binMax,
      label: `${formatCurrency(binMin, currency)} – ${formatCurrency(binMax, currency)}`,
      count,
      frequencyPct: (count / n) * 100,
      cumulativePct: (cumCount / n) * 100,
      containsP80,
    };
  });
}
