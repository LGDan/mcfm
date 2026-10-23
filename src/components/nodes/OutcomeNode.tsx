import { Handle, Position, type NodeProps } from '@xyflow/react';
import { formatCurrency, type OutcomeFlowNode } from '../../types/model';
import { isOutcomeOutputBlocked } from '../../sim/validate';
import { useModelStore } from '../../store/modelStore';

export function OutcomeNode({
  id,
  data,
  selected,
}: NodeProps<OutcomeFlowNode>) {
  const currency = useModelStore((s) => s.currency);
  const outcomeBlocked = useModelStore((s) =>
    isOutcomeOutputBlocked(id, s.edges)
  );

  return (
    <div
      className={`flow-node flow-node-outcome ${selected ? 'is-selected' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="flow-handle flow-handle-target"
      />

      <div className="flow-node-header">
        <span className="flow-node-badge badge-outcome">OUTCOME (OR)</span>
        <span className="outcome-prob-badge">{data.probabilityPct}%</span>
      </div>

      <div className="flow-node-title">{data.label || 'Outcome'}</div>
      {data.description && (
        <div className="flow-node-desc">{data.description}</div>
      )}

      <div className="outcome-cost-row">
        <span className="outcome-cost-label">Cost impact</span>
        <span className="outcome-cost-value">
          +{formatCurrency(Number(data.cost) || 0, currency)}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!outcomeBlocked}
        className={`flow-handle flow-handle-source ${
          outcomeBlocked ? 'is-disabled' : ''
        }`}
        title={
          outcomeBlocked
            ? 'Disabled: parent Question already has an aggregate output connection'
            : 'Connect this Outcome to next Question or End'
        }
      />
    </div>
  );
}
