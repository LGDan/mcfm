import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { QuestionFlowNode } from '../../types/model';
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
  const addOutcomeForQuestion = useModelStore((s) => s.addOutcomeForQuestion);

  const isBalanced = outcomeCount > 0 && Math.abs(probSum - 100) <= 0.05;

  return (
    <div
      className={`flow-node flow-node-question ${selected ? 'is-selected' : ''} ${
        !isBalanced ? 'has-warning' : ''
      }`}
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

      <div className="flow-node-footer">
        <span>{outcomeCount} OR branch{outcomeCount === 1 ? '' : 'es'}</span>
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

      <Handle
        type="source"
        position={Position.Right}
        className="flow-handle flow-handle-source"
      />
    </div>
  );
}
