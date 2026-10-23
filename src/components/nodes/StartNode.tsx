import { Handle, Position, type NodeProps } from '@xyflow/react';
import { mdiPlayCircleOutline } from '@mdi/js';
import type { StartFlowNode } from '../../types/model';
import { MdiIcon } from '../MdiIcon';

export function StartNode({ data, selected }: NodeProps<StartFlowNode>) {
  return (
    <div className={`flow-node flow-node-start ${selected ? 'is-selected' : ''}`}>
      <div className="flow-node-badge badge-start">
        <MdiIcon path={mdiPlayCircleOutline} size={11} />
        <span>START</span>
      </div>
      <div className="flow-node-title">{data.label || 'Project Start'}</div>
      <Handle
        type="source"
        position={Position.Right}
        className="flow-handle flow-handle-source"
      />
    </div>
  );
}
