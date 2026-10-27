import {
  isOutcomeNodeType,
  type AdvancedOutcomeFlowNode,
  type AnyOutcomeFlowNode,
  type EdgeKind,
  type ModelEdge,
  type ModelNode,
  type ModelNodeType,
  type ValidationIssue,
  type ValidationResult,
  type VariableFlowNode,
} from '../types/model';
import { validateFormulaExpression } from './formulaEvaluator';

const PROB_TOLERANCE = 0.05;

function isDagNodeType(type: ModelNodeType | undefined): boolean {
  return (
    type === 'start' ||
    type === 'question' ||
    isOutcomeNodeType(type) ||
    type === 'end'
  );
}

export function inferEdgeKind(
  sourceType: ModelNodeType | undefined,
  targetType: ModelNodeType | undefined
): EdgeKind | null {
  if (!sourceType || !targetType) return null;
  if (sourceType === 'note' || targetType === 'note') return 'note-link';
  if (sourceType === 'variable' || targetType === 'variable') return null;
  if (sourceType === 'start' && targetType === 'question') {
    return 'start-to-question';
  }
  if (sourceType === 'question' && isOutcomeNodeType(targetType)) {
    return 'question-to-outcome';
  }
  if (sourceType === 'question' && targetType === 'question') {
    return 'question-to-question';
  }
  if (sourceType === 'question' && targetType === 'end') {
    return 'question-to-end';
  }
  if (isOutcomeNodeType(sourceType) && targetType === 'question') {
    return 'outcome-to-question';
  }
  if (isOutcomeNodeType(sourceType) && targetType === 'end') {
    return 'outcome-to-end';
  }
  return null;
}

/**
 * Returns the IDs of all Outcome nodes that belong to a given Question node.
 */
export function getQuestionChildOutcomeIds(
  questionId: string,
  edges: ModelEdge[]
): string[] {
  return edges
    .filter(
      (e) => e.source === questionId && e.data?.kind === 'question-to-outcome'
    )
    .map((e) => e.target);
}

/**
 * Returns true if any child Outcome of `questionId` has an outgoing connection
 * (e.g. `outcome -> question` or `outcome -> end`).
 * When true, the Question's own aggregate output connector (`question -> question` / `question -> end`)
 * must be blocked/disabled.
 */
export function isQuestionOutputBlocked(
  questionId: string,
  edges: ModelEdge[]
): boolean {
  const childOutcomeIds = new Set(getQuestionChildOutcomeIds(questionId, edges));
  if (childOutcomeIds.size === 0) return false;
  return edges.some(
    (e) => childOutcomeIds.has(e.source) && e.data?.kind !== 'note-link'
  );
}

/**
 * Returns true if the parent Question of `outcomeId` already has an aggregate
 * output connection (`question -> question` or `question -> end`).
 * When true, all child Outcomes of that Question must have their output connectors blocked/disabled.
 */
export function isOutcomeOutputBlocked(
  outcomeId: string,
  edges: ModelEdge[]
): boolean {
  const parentEdge = edges.find(
    (e) => e.target === outcomeId && e.data?.kind === 'question-to-outcome'
  );
  if (!parentEdge) return false;
  const parentQuestionId = parentEdge.source;
  return edges.some(
    (e) =>
      e.source === parentQuestionId &&
      (e.data?.kind === 'question-to-question' ||
        e.data?.kind === 'question-to-end')
  );
}

export function wouldCreateCycle(
  nodes: ModelNode[],
  edges: ModelEdge[],
  sourceId: string,
  targetId: string
): boolean {
  if (sourceId === targetId) return true;
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (e.data?.kind === 'note-link') continue;
    adj.get(e.source)?.push(e.target);
  }

  const visited = new Set<string>();
  const stack = [targetId];
  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (curr === sourceId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (const next of adj.get(curr) ?? []) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return false;
}

export function canConnectNodes(
  nodes: ModelNode[],
  edges: ModelEdge[],
  sourceId: string | null | undefined,
  targetId: string | null | undefined
): { allowed: boolean; reason?: string; kind?: EdgeKind } {
  if (!sourceId || !targetId) {
    return { allowed: false, reason: 'Missing connection endpoint.' };
  }
  if (sourceId === targetId) {
    return { allowed: false, reason: 'Cannot connect a node to itself.' };
  }

  const sourceNode = nodes.find((n) => n.id === sourceId);
  const targetNode = nodes.find((n) => n.id === targetId);
  if (!sourceNode || !targetNode) {
    return { allowed: false, reason: 'Source or target node not found.' };
  }

  const kind = inferEdgeKind(
    sourceNode.type as ModelNodeType,
    targetNode.type as ModelNodeType
  );
  if (!kind) {
    return {
      allowed: false,
      reason: `Cannot link ${sourceNode.type} → ${targetNode.type}. Allowed: Start→Question, Question→Outcome/Advanced Outcome, Question→Question, Question→End, Outcome→Question, Outcome→End, and Note↔any.`,
    };
  }

  if (edges.some((e) => e.source === sourceId && e.target === targetId)) {
    return { allowed: false, reason: 'Connection already exists.' };
  }

  if (kind === 'note-link') {
    return { allowed: true, kind };
  }

  if (kind === 'question-to-question' || kind === 'question-to-end') {
    if (isQuestionOutputBlocked(sourceId, edges)) {
      return {
        allowed: false,
        reason:
          'Question output connector is disabled because one or more of its Outcomes already have outgoing connections.',
      };
    }
  }

  if (kind === 'outcome-to-question' || kind === 'outcome-to-end') {
    if (isOutcomeOutputBlocked(sourceId, edges)) {
      return {
        allowed: false,
        reason:
          'Outcome output connector is disabled because its parent Question is already connected via its aggregate output connector.',
      };
    }
  }

  if (isOutcomeNodeType(targetNode.type)) {
    const existingParent = edges.find(
      (e) => e.target === targetId && e.data?.kind !== 'note-link'
    );
    if (existingParent) {
      return {
        allowed: false,
        reason: 'Each Outcome node can only belong to a single parent Question.',
      };
    }
  }

  if (wouldCreateCycle(nodes, edges, sourceId, targetId)) {
    return {
      allowed: false,
      reason: 'Connection would create a cycle (graph must remain a DAG).',
    };
  }

  return { allowed: true, kind };
}

export function detectCyclesInGraph(
  nodes: ModelNode[],
  edges: ModelEdge[]
): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (e.data?.kind === 'note-link') continue;
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.push(e.target);
    }
  }

  const state = new Map<string, 0 | 1 | 2>();
  for (const n of nodes) state.set(n.id, 0);

  const dfs = (u: string): boolean => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1) return true;
      if (s === 0 && dfs(v)) return true;
    }
    state.set(u, 2);
    return false;
  };

  for (const n of nodes) {
    if (!isDagNodeType(n.type as ModelNodeType)) continue;
    if (state.get(n.id) === 0) {
      if (dfs(n.id)) return true;
    }
  }
  return false;
}

export function validateModel(
  nodes: ModelNode[],
  edges: ModelEdge[]
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const questionProbSums: Record<string, number> = {};
  const questionOutcomeCounts: Record<string, number> = {};

  const nodeMap = new Map<string, ModelNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const startNodes = nodes.filter((n) => n.type === 'start');
  if (startNodes.length === 0) {
    errors.push({
      id: 'no-start',
      severity: 'error',
      message: 'Model must have a Start node.',
    });
  } else if (startNodes.length > 1) {
    errors.push({
      id: 'multi-start',
      severity: 'error',
      message: `Model has ${startNodes.length} Start nodes; exactly one is allowed.`,
    });
  }

  if (detectCyclesInGraph(nodes, edges)) {
    errors.push({
      id: 'cycle-detected',
      severity: 'error',
      message:
        'Graph contains a cycle. Decision model must be a Directed Acyclic Graph (DAG).',
    });
  }

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (e.data?.kind === 'note-link') continue;
    adj.get(e.source)?.push(e.target);
  }

  const reachableNodeIds = new Set<string>();
  const queue = startNodes.map((s) => s.id);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (reachableNodeIds.has(curr)) continue;
    reachableNodeIds.add(curr);
    for (const next of adj.get(curr) ?? []) {
      if (!reachableNodeIds.has(next)) queue.push(next);
    }
  }

  if (startNodes.length === 1) {
    const startId = startNodes[0].id;
    const startOutgoing = edges.filter(
      (e) => e.source === startId && e.data?.kind !== 'note-link'
    );
    if (startOutgoing.length === 0) {
      errors.push({
        id: 'start-disconnected',
        severity: 'error',
        nodeId: startId,
        message: 'Start node has no outgoing link to an initial Question.',
      });
    }
  }

  const availableVariables = new Set<string>();
  const seenVariableNames = new Map<string, string>();
  for (const node of nodes) {
    if (node.type !== 'variable') continue;
    const vNode = node as VariableFlowNode;
    const name = (vNode.data.name || '').trim().toLowerCase();
    if (!name) {
      errors.push({
        id: `var-empty-name-${node.id}`,
        severity: 'error',
        nodeId: node.id,
        message: `Variable "${vNode.data.label || node.id}" is missing an identifier.`,
      });
      continue;
    }
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      errors.push({
        id: `var-bad-name-${node.id}`,
        severity: 'error',
        nodeId: node.id,
        message: `Variable identifier "${name}" must match [a-zA-Z_][a-zA-Z0-9_]*.`,
      });
    }
    const existing = seenVariableNames.get(name);
    if (existing) {
      errors.push({
        id: `var-dup-${node.id}`,
        severity: 'error',
        nodeId: node.id,
        message: `Variable identifier "${name}" is already used by another Variable node.`,
      });
    } else {
      seenVariableNames.set(name, node.id);
      availableVariables.add(name);
    }

    if (
      vNode.data.mode !== 'fixed' &&
      Number(vNode.data.minValue) > Number(vNode.data.maxValue)
    ) {
      errors.push({
        id: `var-bounds-${node.id}`,
        severity: 'error',
        nodeId: node.id,
        message: `Variable "${name}" minimum (${vNode.data.minValue}) is greater than maximum (${vNode.data.maxValue}).`,
      });
    }
  }

  for (const node of nodes) {
    if (node.type === 'question') {
      const outcomeEdges = edges.filter(
        (e) => e.source === node.id && e.data?.kind === 'question-to-outcome'
      );
      const outcomes = outcomeEdges
        .map((e) => nodeMap.get(e.target))
        .filter(
          (n): n is AnyOutcomeFlowNode =>
            n != null && isOutcomeNodeType(n.type)
        );

      const sum = outcomes.reduce(
        (acc, o) => acc + (Number(o.data.probabilityPct) || 0),
        0
      );
      questionProbSums[node.id] = Math.round(sum * 100) / 100;
      questionOutcomeCounts[node.id] = outcomes.length;

      const hasAggregateOut = edges.some(
        (e) =>
          e.source === node.id &&
          (e.data?.kind === 'question-to-question' ||
            e.data?.kind === 'question-to-end')
      );
      const hasOutcomeOut = isQuestionOutputBlocked(node.id, edges);
      if (hasAggregateOut && hasOutcomeOut) {
        errors.push({
          id: `q-mixed-routing-${node.id}`,
          severity: 'error',
          nodeId: node.id,
          message: `Question "${node.data.label}" cannot use both its Question output connector and individual Outcome output connectors simultaneously.`,
        });
      }

      const impactYear = Number(node.data.impactYear) || 1;
      if (node.data.impactYearEnabled && (impactYear < 1 || impactYear > 10)) {
        errors.push({
          id: `q-year-${node.id}`,
          severity: 'error',
          nodeId: node.id,
          message: `Question "${node.data.label}" Impact Year must be between 1 and 10.`,
        });
      }

      const isReachable = reachableNodeIds.has(node.id);
      if (outcomes.length === 0) {
        if (isReachable) {
          errors.push({
            id: `q-no-outcomes-${node.id}`,
            severity: 'error',
            nodeId: node.id,
            message: `Question "${node.data.label}" has no Outcomes connected.`,
          });
        } else {
          warnings.push({
            id: `q-unreach-no-outcomes-${node.id}`,
            severity: 'warning',
            nodeId: node.id,
            message: `Unreachable Question "${node.data.label}" has no Outcomes.`,
          });
        }
      } else if (Math.abs(sum - 100) > PROB_TOLERANCE) {
        const issue: ValidationIssue = {
          id: `q-prob-sum-${node.id}`,
          severity: isReachable ? 'error' : 'warning',
          nodeId: node.id,
          message: `Question "${node.data.label}" outcome probabilities sum to ${questionProbSums[node.id]}% (must equal 100%).`,
        };
        if (isReachable) errors.push(issue);
        else warnings.push(issue);
      }

      if (!isReachable) {
        warnings.push({
          id: `unreach-q-${node.id}`,
          severity: 'warning',
          nodeId: node.id,
          message: `Question "${node.data.label}" is not reachable from Start.`,
        });
      }
    } else if (isOutcomeNodeType(node.type)) {
      const outcomeNode = node as AnyOutcomeFlowNode;
      const incoming = edges.filter(
        (e) => e.target === node.id && e.data?.kind !== 'note-link'
      );
      const label = String(outcomeNode.data.label || 'Outcome');
      if (incoming.length === 0) {
        warnings.push({
          id: `orphan-outcome-${node.id}`,
          severity: 'warning',
          nodeId: node.id,
          message: `Outcome "${label}" is not connected to any parent Question.`,
        });
      } else if (incoming.length > 1) {
        errors.push({
          id: `multi-parent-outcome-${node.id}`,
          severity: 'error',
          nodeId: node.id,
          message: `Outcome "${label}" has multiple incoming edges (must have exactly 1 parent Question).`,
        });
      }

      const probabilityPct = Number(outcomeNode.data.probabilityPct);
      if (
        probabilityPct < 0 ||
        probabilityPct > 100 ||
        Number.isNaN(probabilityPct)
      ) {
        errors.push({
          id: `invalid-prob-${node.id}`,
          severity: 'error',
          nodeId: node.id,
          message: `Outcome "${label}" probability must be between 0% and 100%.`,
        });
      } else if (probabilityPct === 0 && reachableNodeIds.has(node.id)) {
        warnings.push({
          id: `zero-prob-${node.id}`,
          severity: 'warning',
          nodeId: node.id,
          message: `Outcome "${label}" has 0% probability and will never be sampled.`,
        });
      }

      if (node.type === 'outcome' && Number(node.data.cost) < 0) {
        errors.push({
          id: `neg-cost-${node.id}`,
          severity: 'error',
          nodeId: node.id,
          message: `Outcome "${label}" has a negative cost.`,
        });
      }

      if (node.type === 'advanced-outcome') {
        const adv = node as AdvancedOutcomeFlowNode;
        const pots = adv.data.pots ?? [];
        if (pots.length === 0) {
          warnings.push({
            id: `adv-no-pots-${node.id}`,
            severity: 'warning',
            nodeId: node.id,
            message: `Advanced Outcome "${label}" has no cost pots allocated.`,
          });
        }
        for (const pot of pots) {
          if (pot.estimateMode === 'three-point') {
            const low = Number(pot.lowCost) || 0;
            const med = Number(pot.mediumCost) || 0;
            const high = Number(pot.highCost) || 0;
            if (low > med || med > high) {
              errors.push({
                id: `adv-lmh-${node.id}-${pot.potId}`,
                severity: 'error',
                nodeId: node.id,
                message: `Advanced Outcome "${label}" pot "${pot.label}" must satisfy Low ≤ Medium ≤ High.`,
              });
            }
          } else if (pot.estimateMode === 'formula') {
            const check = validateFormulaExpression(
              pot.formula || '',
              availableVariables
            );
            if (!check.valid) {
              errors.push({
                id: `adv-formula-${node.id}-${pot.potId}`,
                severity: 'error',
                nodeId: node.id,
                message: `Advanced Outcome "${label}" pot "${pot.label}": ${check.error}`,
              });
            }
          }
        }
        if (
          adv.data.capexOpexEnabled &&
          (Number(adv.data.opexAnnualCost) || 0) < 0
        ) {
          errors.push({
            id: `adv-opex-neg-${node.id}`,
            severity: 'error',
            nodeId: node.id,
            message: `Advanced Outcome "${label}" has a negative annual Opex cost.`,
          });
        }
      }
    } else if (
      node.type === 'end' &&
      !reachableNodeIds.has(node.id) &&
      edges.some((e) => e.target === node.id && e.data?.kind !== 'note-link')
    ) {
      warnings.push({
        id: `unreach-end-${node.id}`,
        severity: 'warning',
        nodeId: node.id,
        message: `End node is not reachable from Start.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    questionProbSums,
    questionOutcomeCounts,
    reachableNodeIds,
  };
}
