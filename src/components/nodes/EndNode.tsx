import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EndFlowNode } from '../../types/model';

export function EndNode({ data, selected }: NodeProps<EndFlowNode>) {
  return (
    <div className={`flow-node flow-node-end ${selected ? 'is-selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="flow-handle flow-handle-target"
      />
      <div className="flow-node-badge badge-end">END</div>
      <div className="flow-node-title">{data.label || 'End'}</div>
    </div>
  );
}
