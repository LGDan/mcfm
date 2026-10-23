import type { DragEvent } from 'react';
import { useModelStore } from '../store/modelStore';
import type { ModelNodeType } from '../types/model';

interface PaletteItem {
  type: ModelNodeType;
  title: string;
  subtitle: string;
  accentClass: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'start',
    title: 'Start Node',
    subtitle: 'Single project entry point',
    accentClass: 'palette-start',
  },
  {
    type: 'question',
    title: 'Question Node',
    subtitle: 'Decision / risk point',
    accentClass: 'palette-question',
  },
  {
    type: 'outcome',
    title: 'Outcome Node (OR)',
    subtitle: 'Probability % & fixed cost',
    accentClass: 'palette-outcome',
  },
  {
    type: 'end',
    title: 'End Node',
    subtitle: 'Pathway terminal leaf',
    accentClass: 'palette-end',
  },
];

export function Toolbox() {
  const addNode = useModelStore((s) => s.addNode);
  const validation = useModelStore((s) => s.validation);
  const selectNode = useModelStore((s) => s.selectNode);

  const onDragStart = (
    event: DragEvent<HTMLButtonElement>,
    nodeType: ModelNodeType
  ) => {
    event.dataTransfer.setData('application/mc-modeller-node', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="toolbox-sidebar">
      <div className="sidebar-section">
        <h2 className="sidebar-heading">Toolbox</h2>
        <p className="sidebar-hint">
          Drag onto the canvas or click to add a node.
        </p>

        <div className="palette-list">
          {PALETTE_ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              onClick={() => addNode(item.type)}
              className={`palette-card ${item.accentClass}`}
            >
              <div className="palette-card-title">+ {item.title}</div>
              <div className="palette-card-sub">{item.subtitle}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-subheading">Linking Guide</h3>
        <ul className="rules-list">
          <li>
            <strong>Start → Question</strong>: Entry flow
          </li>
          <li>
            <strong>Question → Outcome</strong>: Mutually exclusive{' '}
            <span className="tag-or">OR</span> branch (must sum to 100%)
          </li>
          <li>
            <strong>Question → Question / End</strong>: Aggregate{' '}
            <span className="tag-and">ALL</span> continuation (disables
            individual outcome connectors)
          </li>
          <li>
            <strong>Outcome → Question / End</strong>: Branch-specific
            continuation (disables parent question connector)
          </li>
        </ul>
      </div>

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="sidebar-section validation-list-section">
          <h3 className="sidebar-subheading">Model Checks</h3>
          {validation.errors.map((err) => (
            <button
              key={err.id}
              type="button"
              className="validation-item is-error"
              onClick={() => err.nodeId && selectNode(err.nodeId)}
            >
              <span className="v-dot" />
              <span>{err.message}</span>
            </button>
          ))}
          {validation.warnings.map((warn) => (
            <button
              key={warn.id}
              type="button"
              className="validation-item is-warning"
              onClick={() => warn.nodeId && selectNode(warn.nodeId)}
            >
              <span className="v-dot" />
              <span>{warn.message}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
