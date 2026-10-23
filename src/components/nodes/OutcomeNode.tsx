import { Handle, Position, type NodeProps } from '@xyflow/react';
import { formatCurrency, type OutcomeFlowNode } from '../../types/model';
import { useModelStore } from '../../store/modelStore';

export function OutcomeNode({ data, selected }: NodeProps<OutcomeFlowNode>) {
  const currency = useModelStore((s) => s.currency);

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

      <div className="outcome-cost-row">
        <span className="outcome-cost-label">Cost impact</span>
        <span className="outcome-cost-value">
          +{formatCurrency(Number(data.cost) || 0, currency)}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="flow-handle flow-handle-source"
      />
    </div>
  );
}
