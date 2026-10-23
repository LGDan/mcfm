import type { DragEvent } from 'react';
import {
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiChevronDoubleLeft,
  mdiChevronDoubleRight,
  mdiFlagCheckered,
  mdiHelpRhombusOutline,
  mdiPlayCircleOutline,
  mdiSourceBranch,
} from '@mdi/js';
import { useModelStore } from '../store/modelStore';
import type { ModelNodeType } from '../types/model';
import { MdiIcon } from './MdiIcon';

interface PaletteItem {
  type: ModelNodeType;
  title: string;
  subtitle: string;
  accentClass: string;
  icon: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'start',
    title: 'Start Node',
    subtitle: 'Single project entry point',
    accentClass: 'palette-start',
    icon: mdiPlayCircleOutline,
  },
  {
    type: 'question',
    title: 'Question Node',
    subtitle: 'Decision / risk point',
    accentClass: 'palette-question',
    icon: mdiHelpRhombusOutline,
  },
  {
    type: 'outcome',
    title: 'Outcome Node (OR)',
    subtitle: 'Probability % & fixed cost',
    accentClass: 'palette-outcome',
    icon: mdiSourceBranch,
  },
  {
    type: 'end',
    title: 'End Node',
    subtitle: 'Pathway terminal leaf',
    accentClass: 'palette-end',
    icon: mdiFlagCheckered,
  },
];

export function Toolbox() {
  const nodes = useModelStore((s) => s.nodes);
  const addNode = useModelStore((s) => s.addNode);
  const validation = useModelStore((s) => s.validation);
  const selectNode = useModelStore((s) => s.selectNode);
  const toolboxCollapsed = useModelStore((s) => s.toolboxCollapsed);
  const toggleToolboxCollapsed = useModelStore(
    (s) => s.toggleToolboxCollapsed
  );

  const hasStartNode = nodes.some((n) => n.type === 'start');
  const hasEndNode = nodes.some((n) => n.type === 'end');

  const isItemDisabled = (type: ModelNodeType) => {
    if (type === 'start' && hasStartNode) return true;
    if (type === 'end' && hasEndNode) return true;
    return false;
  };

  const onDragStart = (
    event: DragEvent<HTMLButtonElement>,
    nodeType: ModelNodeType
  ) => {
    if (isItemDisabled(nodeType)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('application/mc-modeller-node', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  if (toolboxCollapsed) {
    return (
      <aside className="toolbox-sidebar is-collapsed">
        <button
          type="button"
          className="pane-collapse-btn"
          onClick={toggleToolboxCollapsed}
          title="Expand Toolbox"
          aria-label="Expand Toolbox"
        >
          <MdiIcon path={mdiChevronDoubleRight} size={16} />
        </button>
        <div className="collapsed-rail-icons">
          {PALETTE_ITEMS.map((item) => {
            const disabled = isItemDisabled(item.type);
            return (
              <button
                key={item.type}
                type="button"
                disabled={disabled}
                draggable={!disabled}
                onDragStart={(e) => onDragStart(e, item.type)}
                onClick={() => !disabled && addNode(item.type)}
                className="rail-icon-btn"
                title={
                  disabled
                    ? `${item.title} (already on canvas)`
                    : `Add ${item.title}`
                }
              >
                <MdiIcon path={item.icon} size={16} />
              </button>
            );
          })}
        </div>
        <div className="collapsed-vertical-label">TOOLBOX</div>
      </aside>
    );
  }

  return (
    <aside className="toolbox-sidebar">
      <div className="sidebar-section">
        <div className="pane-header-row">
          <h2 className="sidebar-heading">Toolbox</h2>
          <button
            type="button"
            className="pane-collapse-btn"
            onClick={toggleToolboxCollapsed}
            title="Collapse Toolbox"
            aria-label="Collapse Toolbox"
          >
            <MdiIcon path={mdiChevronDoubleLeft} size={15} />
          </button>
        </div>
        <p className="sidebar-hint">
          Drag onto the canvas or click to place a node.
        </p>

        <div className="palette-list">
          {PALETTE_ITEMS.map((item) => {
            const disabled = isItemDisabled(item.type);
            return (
              <button
                key={item.type}
                type="button"
                disabled={disabled}
                draggable={!disabled}
                onDragStart={(e) => onDragStart(e, item.type)}
                onClick={() => !disabled && addNode(item.type)}
                className={`palette-card ${item.accentClass} ${
                  disabled ? 'is-disabled' : ''
                }`}
                title={
                  disabled
                    ? `${item.title} is already present on the canvas`
                    : `Drag or click to add ${item.title}`
                }
              >
                <div className="palette-card-header">
                  <MdiIcon path={item.icon} size={16} />
                  <span className="palette-card-title">{item.title}</span>
                  {disabled && (
                    <span className="palette-placed-tag">Placed</span>
                  )}
                </div>
                <div className="palette-card-sub">{item.subtitle}</div>
              </button>
            );
          })}
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
              <MdiIcon
                path={mdiAlertCircleOutline}
                size={14}
                className="v-icon"
              />
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
              <MdiIcon path={mdiAlertOutline} size={14} className="v-icon" />
              <span>{warn.message}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
