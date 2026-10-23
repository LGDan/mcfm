import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  formatCurrency,
  type OutcomeFlowNode,
  type QuestionFlowNode,
} from '../../types/model';
import { useModelStore } from '../../store/modelStore';

export function QuestionNode({
  id,
  data,
  selected,
}: NodeProps<QuestionFlowNode>) {
  const probSum = useModelStore(
    (s) => s.validation.questionProbSums[id] ?? 0
  );
  const outcomeCount = useModelStore(
    (s) => s.validation.questionOutcomeCounts[id] ?? 0
  );
  const outcomeDisplayMode = useModelStore((s) => s.outcomeDisplayMode);
  const currency = useModelStore((s) => s.currency);
  const nodes = useModelStore((s) => s.nodes);
  const edges = useModelStore((s) => s.edges);
  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const selectNode = useModelStore((s) => s.selectNode);
  const addOutcomeForQuestion = useModelStore((s) => s.addOutcomeForQuestion);

  const isBalanced = outcomeCount > 0 && Math.abs(probSum - 100) <= 0.05;
  const isNested = outcomeDisplayMode === 'nested';

  const childOutcomes: OutcomeFlowNode[] = isNested
    ? edges
        .filter(
          (e) => e.source === id && e.data?.kind === 'question-to-outcome'
        )
        .map((e) =>
          nodes.find((n) => n.id === e.target && n.type === 'outcome')
        )
        .filter((n): n is OutcomeFlowNode => Boolean(n))
    : [];

  return (
    <div
      className={`flow-node flow-node-question ${
        isNested ? 'is-nested-mode' : ''
      } ${selected ? 'is-selected' : ''} ${!isBalanced ? 'has-warning' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="flow-handle flow-handle-target"
      />

      <div className="flow-node-header">
        <span className="flow-node-badge badge-question">QUESTION</span>
        <span
          className={`prob-sum-pill ${isBalanced ? 'pill-ok' : 'pill-err'}`}
          title={
            outcomeCount === 0
              ? 'No outcomes connected'
              : `Outcomes sum to ${probSum}%`
          }
        >
          {outcomeCount === 0 ? '0 outcomes' : `Σ ${probSum}%`}
        </span>
      </div>

      <div className="flow-node-title">{data.label || 'Untitled Question'}</div>
      {data.description && (
        <div className="flow-node-desc">{data.description}</div>
      )}

      {isNested && (
        <div className="nested-outcomes-container">
          <div className="nested-outcomes-header">
            <span>OR OUTCOMES</span>
            <span className="nested-and-hint">
              Top handle = AND chain
            </span>
          </div>

          {childOutcomes.length === 0 ? (
            <div className="nested-outcomes-empty">
              No outcomes yet — click <strong>+ Outcome</strong> below.
            </div>
          ) : (
            <div className="nested-outcomes-list">
              {childOutcomes.map((o) => {
                const isOutcomeSelected =
                  selectedNodeId === o.id || Boolean(o.selected);
                return (
                  <div
                    key={o.id}
                    className={`nested-outcome-card nodrag ${
                      isOutcomeSelected ? 'is-selected' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectNode(o.id, e.shiftKey || e.metaKey || e.ctrlKey);
                    }}
                  >
                    <div className="nested-outcome-top">
                      <span className="nested-outcome-title">
                        {o.data.label || 'Outcome'}
                      </span>
                      <span className="nested-outcome-prob">
                        {o.data.probabilityPct}%
                      </span>
                    </div>

                    {o.data.description && (
                      <div className="nested-outcome-desc">
                        {o.data.description}
                      </div>
                    )}

                    <div className="nested-outcome-bottom">
                      <span className="nested-outcome-cost-label">Cost</span>
                      <span className="nested-outcome-cost">
                        +{formatCurrency(Number(o.data.cost) || 0, currency)}
                      </span>
                    </div>

                    <Handle
                      type="source"
                      id={`outcome:${o.id}`}
                      position={Position.Right}
                      className="flow-handle flow-handle-outcome-child"
                      title={`Connect from outcome "${o.data.label}" to next Question or End`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flow-node-footer">
        <span>
          {outcomeCount} OR branch{outcomeCount === 1 ? '' : 'es'}
        </span>
        <button
          type="button"
          className="node-inline-btn nodrag"
          onClick={(e) => {
            e.stopPropagation();
            addOutcomeForQuestion(id);
          }}
          title="Quickly add an Outcome branch to this question"
        >
          + Outcome
        </button>
      </div>

      {/* Default source handle (no id) so standard edges and AND chains always attach cleanly */}
      <Handle
        type="source"
        position={Position.Right}
        className={`flow-handle flow-handle-source ${
          isNested ? 'flow-handle-question-and' : ''
        }`}
        title={
          isNested
            ? 'Connect to another Question (AND chain) or external Outcome'
            : 'Connect to Outcome (OR) or another Question (AND)'
        }
      />
    </div>
  );
}
