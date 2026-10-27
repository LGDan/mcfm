import { type NodeProps } from '@xyflow/react';
import { mdiFunctionVariant } from '@mdi/js';
import type { VariableFlowNode, VariableMode } from '../../types/model';
import { useModelStore } from '../../store/modelStore';
import { MdiIcon } from '../MdiIcon';

export function VariableNode({
  id,
  data,
  selected,
}: NodeProps<VariableFlowNode>) {
  const updateNodeData = useModelStore((s) => s.updateNodeData);

  const previewVal =
    data.mode === 'fixed'
      ? data.fixedValue
      : data.mode === 'slider'
        ? data.sliderValue
        : `${data.minValue}..${data.maxValue}`;

  return (
    <div
      className={`flow-node flow-node-variable ${selected ? 'is-selected' : ''}`}
    >
      <div className="flow-node-header">
        <span className="flow-node-badge badge-variable">
          <MdiIcon path={mdiFunctionVariant} size={11} />
          <span>VARIABLE</span>
        </span>
        <code className="variable-ident-chip">{data.name}</code>
      </div>

      <div className="flow-node-title">{data.label || data.name}</div>

      <div
        className="variable-node-controls nodrag"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="variable-mode-tabs">
          {(['fixed', 'slider', 'random'] as VariableMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`var-mode-btn ${data.mode === m ? 'is-active' : ''}`}
              onClick={() => updateNodeData(id, { mode: m })}
            >
              {m === 'fixed' ? 'Fixed' : m === 'slider' ? 'Slider' : 'Random'}
            </button>
          ))}
        </div>

        {data.mode === 'fixed' && (
          <div className="var-inline-row">
            <span>Value</span>
            <input
              type="number"
              value={data.fixedValue}
              onChange={(e) =>
                updateNodeData(id, { fixedValue: Number(e.target.value) || 0 })
              }
            />
          </div>
        )}

        {data.mode === 'slider' && (
          <div className="var-slider-block">
            <div className="var-inline-row">
              <span>
                {data.minValue} – {data.maxValue}
              </span>
              <strong>{data.sliderValue}</strong>
            </div>
            <input
              type="range"
              min={data.minValue}
              max={Math.max(data.minValue + 1, data.maxValue)}
              step={1}
              value={data.sliderValue}
              onChange={(e) =>
                updateNodeData(id, { sliderValue: Number(e.target.value) })
              }
            />
          </div>
        )}

        {data.mode === 'random' && (
          <div className="var-inline-row">
            <span>Uniform range</span>
            <strong>
              {data.minValue} – {data.maxValue}
            </strong>
          </div>
        )}
      </div>

      <div className="flow-node-footer">
        <span>Ref: {data.name}</span>
        <span className="var-current-pill">= {previewVal}</span>
      </div>
    </div>
  );
}
