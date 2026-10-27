import { Handle, Position, type NodeProps } from '@xyflow/react';
import { mdiNoteTextOutline } from '@mdi/js';
import type { NoteFlowNode } from '../../types/model';
import { MdiIcon } from '../MdiIcon';

export function NoteNode({ data, selected }: NodeProps<NoteFlowNode>) {
  return (
    <div className={`flow-node flow-node-note ${selected ? 'is-selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="flow-handle flow-handle-note"
        title="Attach note link"
      />
      <div className="flow-node-header">
        <span className="flow-node-badge badge-note">
          <MdiIcon path={mdiNoteTextOutline} size={11} />
          <span>NOTE</span>
        </span>
      </div>
      <div className="flow-node-title">{data.label || 'Note'}</div>
      {data.description && (
        <div className="flow-node-desc note-body-text">{data.description}</div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="flow-handle flow-handle-note"
        title="Drag to attach note to any node"
      />
    </div>
  );
}
