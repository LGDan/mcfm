import type {
  CurrencyCode,
  HistogramBin,
  ModelEdge,
  ModelNode,
  OutcomeDriverStat,
  OutcomeFlowNode,
  QuestionDriverStat,
  QuestionFlowNode,
  SimulationResult,
} from '../types/model';
import { formatCurrency } from '../types/model';

interface CompiledOutcome {
  id: string;
  label: string;
  probability: number; // 0..1
  probabilityPct: number;
  cost: number;
  cumulativeProbability: number;
}

interface CompiledGraph {
  startQuestions: string[];
  questions: Map<string, { id: string; label: string }>;
  questionAndTargets: Map<string, string[]>;
  questionOutcomes: Map<string, CompiledOutcome[]>;
  outcomeQuestionTargets: Map<string, string[]>;
}

export function compileGraph(nodes: ModelNode[], edges: ModelEdge[]): CompiledGraph {
  const nodeMap = new Map<string, ModelNode>();
  const questions = new Map<string, { id: string; label: string }>();
  const questionAndTargets = new Map<string, string[]>();
  const questionOutcomes = new Map<string, CompiledOutcome[]>();
  const outcomeQuestionTargets = new Map<string, string[]>();

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    if (n.type === 'question') {
      const qNode = n as QuestionFlowNode;
      questions.set(n.id, { id: n.id, label: qNode.data.label });
      questionAndTargets.set(n.id, []);
      questionOutcomes.set(n.id, []);
    } else if (n.type === 'outcome') {
      outcomeQuestionTargets.set(n.id, []);
    }
  }

  const startQuestions: string[] = [];

  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;

    if (src.type === 'start' && tgt.type === 'question') {
      startQuestions.push(tgt.id);
    } else if (src.type === 'question' && tgt.type === 'question') {
      questionAndTargets.get(src.id)?.push(tgt.id);
    } else if (src.type === 'question' && tgt.type === 'outcome') {
      const oNode = tgt as OutcomeFlowNode;
      const list = questionOutcomes.get(src.id) ?? [];
      list.push({
        id: oNode.id,
        label: oNode.data.label,
        probability: Math.max(0, Number(oNode.data.probabilityPct) || 0) / 100,
        probabilityPct: Math.max(0, Number(oNode.data.probabilityPct) || 0),
        cost: Math.max(0, Number(oNode.data.cost) || 0),
        cumulativeProbability: 0,
      });
      questionOutcomes.set(src.id, list);
    } else if (src.type === 'outcome' && tgt.type === 'question') {
      outcomeQuestionTargets.get(src.id)?.push(tgt.id);
    }
  }

  // Normalize cumulative probabilities per question
  for (const [, outcomes] of questionOutcomes.entries()) {
    const totalProb = outcomes.reduce((acc, o) => acc + o.probability, 0);
    let cum = 0;
    for (let i = 0; i < outcomes.length; i++) {
      const normProb = totalProb > 0 ? outcomes[i].probability / totalProb : 0;
      cum += normProb;
      outcomes[i].cumulativeProbability = i === outcomes.length - 1 ? 1.0 : cum;
    }
  }

  return {
    startQuestions,
    questions,
    questionAndTargets,
    questionOutcomes,
    outcomeQuestionTargets,
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

export function runMonteCarloSimulation(
  nodes: ModelNode[],
  edges: ModelEdge[],
  trials = 10000,
  currency: CurrencyCode = 'GBP',
  rng: () => number = Math.random
): SimulationResult {
  const adj = compileGraph(nodes, edges);
  const trialTotals = new Float64Array(trials);

  const questionVisitCounts = new Map<string, number>();
  const outcomeHitCounts = new Map<string, number>();

  for (const qId of adj.questions.keys()) {
    questionVisitCounts.set(qId, 0);
    for (const o of adj.questionOutcomes.get(qId) ?? []) {
      outcomeHitCounts.set(o.id, 0);
    }
  }

  for (let t = 0; t < trials; t++) {
    const queue: string[] = [...adj.startQuestions];
    const visitedQuestions = new Set<string>();
    let totalCost = 0;

    while (queue.length > 0) {
      const qId = queue.shift()!;
      if (visitedQuestions.has(qId)) continue;
      visitedQuestions.add(qId);
      questionVisitCounts.set(qId, (questionVisitCounts.get(qId) ?? 0) + 1);

      // 1. Enqueue all unconditional AND-linked questions (question -> question)
      for (const andQId of adj.questionAndTargets.get(qId) ?? []) {
        if (!visitedQuestions.has(andQId)) {
          queue.push(andQId);
        }
      }

      // 2. Sample exactly one OR outcome (question -> outcome)
      const outcomes = adj.questionOutcomes.get(qId) ?? [];
      if (outcomes.length > 0) {
        const chosen = sampleOutcome(outcomes, rng());
        if (chosen) {
          totalCost += chosen.cost;
          outcomeHitCounts.set(chosen.id, (outcomeHitCounts.get(chosen.id) ?? 0) + 1);
          // 3. Enqueue downstream questions triggered by this outcome (outcome -> question)
          for (const nextQId of adj.outcomeQuestionTargets.get(chosen.id) ?? []) {
            if (!visitedQuestions.has(nextQId)) {
              queue.push(nextQId);
            }
          }
        }
      }
    }

    trialTotals[t] = totalCost;
  }

  // Sort for percentiles
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

  // Build cost-driver breakdown
  const questionDrivers: QuestionDriverStat[] = [];
  const allOutcomeDrivers: OutcomeDriverStat[] = [];

  for (const [qId, qMeta] of adj.questions.entries()) {
    const visits = questionVisitCounts.get(qId) ?? 0;
    if (visits === 0 && (adj.questionOutcomes.get(qId)?.length ?? 0) === 0) continue;

    const outcomes = adj.questionOutcomes.get(qId) ?? [];
    const outcomeStats: OutcomeDriverStat[] = outcomes.map((o) => {
      const hits = outcomeHitCounts.get(o.id) ?? 0;
      const hitRatePct = trials > 0 ? (hits / trials) * 100 : 0;
      const expectedCostContribution = trials > 0 ? (hits * o.cost) / trials : 0;
      const stat: OutcomeDriverStat = {
        outcomeId: o.id,
        outcomeLabel: o.label,
        questionId: qId,
        questionLabel: qMeta.label,
        configuredProbPct: o.probabilityPct,
        cost: o.cost,
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

  // Check number of distinct values
  const distinctCounts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const val = Math.round(sorted[i] * 100) / 100;
    distinctCounts.set(val, (distinctCounts.get(val) ?? 0) + 1);
  }

  // If discrete outcomes <= 15, build exact discrete bins for clarity
  if (distinctCounts.size <= 15) {
    const entries = Array.from(distinctCounts.entries()).sort((a, b) => a[0] - b[0]);
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

  // Otherwise build 24 equal-width bins
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
