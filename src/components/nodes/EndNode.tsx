import { Handle, Position, type NodeProps } from '@xyflow/react';
import { mdiFlagCheckered } from '@mdi/js';
import type { EndFlowNode } from '../../types/model';
import { MdiIcon } from '../MdiIcon';

export function EndNode({ data, selected }: NodeProps<EndFlowNode>) {
  return (
    <div className={`flow-node flow-node-end ${selected ? 'is-selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="flow-handle flow-handle-target"
      />
      <div className="flow-node-badge badge-end">
        <MdiIcon path={mdiFlagCheckered} size={11} />
        <span>END</span>
      </div>
      <div className="flow-node-title">{data.label || 'End'}</div>
    </div>
  );
}
