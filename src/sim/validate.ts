import type {
  EdgeKind,
  ModelEdge,
  ModelNode,
  ModelNodeType,
  OutcomeFlowNode,
  ValidationIssue,
  ValidationResult,
} from '../types/model';

const PROB_TOLERANCE = 0.05;

export function inferEdgeKind(
  sourceType: ModelNodeType | undefined,
  targetType: ModelNodeType | undefined
): EdgeKind | null {
  if (!sourceType || !targetType) return null;
  if (sourceType === 'start' && targetType === 'question') return 'start-to-question';
  if (sourceType === 'question' && targetType === 'outcome') return 'question-to-outcome';
  if (sourceType === 'question' && targetType === 'question') return 'question-to-question';
  if (sourceType === 'outcome' && targetType === 'question') return 'outcome-to-question';
  if (sourceType === 'outcome' && targetType === 'end') return 'outcome-to-end';
  return null;
}

export function wouldCreateCycle(
  nodes: ModelNode[],
  edges: ModelEdge[],
  sourceId: string,
  targetId: string
): boolean {
  if (sourceId === targetId) return true;
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
  }
  // Check if sourceId is reachable from targetId
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
      reason: `Cannot link ${sourceNode.type} → ${targetNode.type}. Allowed: Start→Question, Question→Outcome, Question→Question (AND), Outcome→Question, Outcome→End.`,
    };
  }

  // Prevent duplicate edge between same pair
  if (edges.some((e) => e.source === sourceId && e.target === targetId)) {
    return { allowed: false, reason: 'Connection already exists.' };
  }

  // Every outcome can have at most ONE incoming edge (from its parent question)
  if (targetNode.type === 'outcome') {
    const existingParent = edges.find((e) => e.target === targetId);
    if (existingParent) {
      return {
        allowed: false,
        reason: 'Each Outcome node can only belong to a single parent Question.',
      };
    }
  }

  // Cycle check
  if (wouldCreateCycle(nodes, edges, sourceId, targetId)) {
    return {
      allowed: false,
      reason: 'Connection would create a cycle (graph must remain a DAG).',
    };
  }

  return { allowed: true, kind };
}

export function detectCyclesInGraph(nodes: ModelNode[], edges: ModelEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.push(e.target);
    }
  }

  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 visiting, 2 visited
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
    if (state.get(n.id) === 0) {
      if (dfs(n.id)) return true;
    }
  }
  return false;
}

export function validateModel(nodes: ModelNode[], edges: ModelEdge[]): ValidationResult {
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
      message: 'Graph contains a cycle. Decision model must be a Directed Acyclic Graph (DAG).',
    });
  }

  // Compute reachability from Start node(s)
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
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
    const startOutgoing = edges.filter((e) => e.source === startId);
    if (startOutgoing.length === 0) {
      errors.push({
        id: 'start-disconnected',
        severity: 'error',
        nodeId: startId,
        message: 'Start node has no outgoing link to an initial Question.',
      });
    }
  }

  // Check each question's outcomes & probabilities
  for (const node of nodes) {
    if (node.type === 'question') {
      const outcomeEdges = edges.filter((e) => {
        const target = nodeMap.get(e.target);
        return e.source === node.id && target?.type === 'outcome';
      });
      const outcomes = outcomeEdges
        .map((e) => nodeMap.get(e.target) as OutcomeFlowNode | undefined)
        .filter((n): n is OutcomeFlowNode => Boolean(n));

      const sum = outcomes.reduce((acc, o) => acc + (Number(o.data.probabilityPct) || 0), 0);
      questionProbSums[node.id] = Math.round(sum * 100) / 100;
      questionOutcomeCounts[node.id] = outcomes.length;

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
    } else if (node.type === 'outcome') {
      const incoming = edges.filter((e) => e.target === node.id);
      if (incoming.length === 0) {
        warnings.push({
          id: `orphan-outcome-${node.id}`,
          severity: 'warning',
          nodeId: node.id,
          message: `Outcome "${node.data.label}" is not connected to any parent Question.`,
        });
      } else if (incoming.length > 1) {
        errors.push({
          id: `multi-parent-outcome-${node.id}`,
          severity: 'error',
          nodeId: node.id,
          message: `Outcome "${node.data.label}" has multiple incoming edges (must have exactly 1 parent Question).`,
        });
      }
      if (node.data.cost < 0) {
        errors.push({
          id: `neg-cost-${node.id}`,
          severity: 'error',
          nodeId: node.id,
          message: `Outcome "${node.data.label}" has a negative cost.`,
        });
      }
      if (
        node.data.probabilityPct < 0 ||
        node.data.probabilityPct > 100 ||
        Number.isNaN(node.data.probabilityPct)
      ) {
        errors.push({
          id: `invalid-prob-${node.id}`,
          severity: 'error',
          nodeId: node.id,
          message: `Outcome "${node.data.label}" probability must be between 0% and 100%.`,
        });
      } else if (node.data.probabilityPct === 0 && reachableNodeIds.has(node.id)) {
        warnings.push({
          id: `zero-prob-${node.id}`,
          severity: 'warning',
          nodeId: node.id,
          message: `Outcome "${node.data.label}" has 0% probability and will never be sampled.`,
        });
      }
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
