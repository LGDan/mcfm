import { Handle, Position, type NodeProps } from '@xyflow/react';
import { mdiHelpRhombusOutline, mdiPlus } from '@mdi/js';
import {
  formatCurrency,
  type OutcomeFlowNode,
  type QuestionFlowNode,
} from '../../types/model';
import {
  isOutcomeOutputBlocked,
  isQuestionOutputBlocked,
} from '../../sim/validate';
import { useModelStore } from '../../store/modelStore';
import { MdiIcon } from '../MdiIcon';

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
  const outcomeDisplayMode = useModelStore((s) => s.outcomeDisplayMode);
  const currency = useModelStore((s) => s.currency);
  const nodes = useModelStore((s) => s.nodes);
  const edges = useModelStore((s) => s.edges);
  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const selectNode = useModelStore((s) => s.selectNode);
  const addOutcomeForQuestion = useModelStore((s) => s.addOutcomeForQuestion);

  const isBalanced = outcomeCount > 0 && Math.abs(probSum - 100) <= 0.05;
  const isNested = outcomeDisplayMode === 'nested';

  const questionOutputBlocked = isQuestionOutputBlocked(id, edges);
  const hasQuestionAggregateOut = edges.some(
    (e) =>
      e.source === id &&
      (e.data?.kind === 'question-to-question' ||
        e.data?.kind === 'question-to-end')
  );

  // In Separate mode, only allow dragging from the Question handle if either
  // question output is not blocked OR there are unparented outcome nodes on canvas to attach
  const hasUnparentedOutcomeOnCanvas =
    !isNested &&
    nodes.some(
      (n) =>
        n.type === 'outcome' && !edges.some((e) => e.target === n.id)
    );
  const isQuestionHandleConnectable = isNested
    ? !questionOutputBlocked
    : !questionOutputBlocked || hasUnparentedOutcomeOnCanvas;

  const childOutcomes: OutcomeFlowNode[] = isNested
    ? edges
        .filter(
          (e) => e.source === id && e.data?.kind === 'question-to-outcome'
        )
        .map((e) =>
          nodes.find((n) => n.id === e.target && n.type === 'outcome')
        )
        .filter((n): n is OutcomeFlowNode => Boolean(n))
    : [];

  return (
    <div
      className={`flow-node flow-node-question ${
        isNested ? 'is-nested-mode' : ''
      } ${selected ? 'is-selected' : ''} ${!isBalanced ? 'has-warning' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="flow-handle flow-handle-target"
      />

      <div className="flow-node-header">
        <span className="flow-node-badge badge-question">
          <MdiIcon path={mdiHelpRhombusOutline} size={11} />
          <span>QUESTION</span>
        </span>
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

      {isNested && (
        <div className="nested-outcomes-container">
          <div className="nested-outcomes-header">
            <span>OR OUTCOMES</span>
            <span className="nested-and-hint">
              {questionOutputBlocked
                ? 'Routing via Outcomes'
                : hasQuestionAggregateOut
                  ? 'Routing via Question (Aggregate)'
                  : 'Connect Question (All) or Outcomes'}
            </span>
          </div>

          {childOutcomes.length === 0 ? (
            <div className="nested-outcomes-empty">
              No outcomes yet — click <strong>+ Outcome</strong> below.
            </div>
          ) : (
            <div className="nested-outcomes-list">
              {childOutcomes.map((o) => {
                const isOutcomeSelected =
                  selectedNodeId === o.id || Boolean(o.selected);
                const outcomeBlocked = isOutcomeOutputBlocked(o.id, edges);
                return (
                  <div
                    key={o.id}
                    className={`nested-outcome-card nodrag ${
                      isOutcomeSelected ? 'is-selected' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectNode(o.id, e.shiftKey || e.metaKey || e.ctrlKey);
                    }}
                  >
                    <div className="nested-outcome-top">
                      <span className="nested-outcome-title">
                        {o.data.label || 'Outcome'}
                      </span>
                      <span className="nested-outcome-prob">
                        {o.data.probabilityPct}%
                      </span>
                    </div>

                    {o.data.description && (
                      <div className="nested-outcome-desc">
                        {o.data.description}
                      </div>
                    )}

                    <div className="nested-outcome-bottom">
                      <span className="nested-outcome-cost-label">Cost</span>
                      <span className="nested-outcome-cost">
                        +{formatCurrency(Number(o.data.cost) || 0, currency)}
                      </span>
                    </div>

                    <Handle
                      type="source"
                      id={`outcome:${o.id}`}
                      position={Position.Right}
                      isConnectable={!outcomeBlocked}
                      className={`flow-handle flow-handle-outcome-child ${
                        outcomeBlocked ? 'is-disabled' : ''
                      }`}
                      title={
                        outcomeBlocked
                          ? 'Disabled: parent Question already has an aggregate output connection'
                          : `Connect outcome "${o.data.label}" to next Question or End`
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flow-node-footer">
        <span>
          {outcomeCount} OR branch{outcomeCount === 1 ? '' : 'es'}
        </span>
        <button
          type="button"
          className="node-inline-btn nodrag"
          onClick={(e) => {
            e.stopPropagation();
            addOutcomeForQuestion(id);
          }}
          title="Quickly add an Outcome branch to this question"
        >
          <MdiIcon path={mdiPlus} size={11} />
          <span>Outcome</span>
        </button>
      </div>

      {/* Default source handle (no id) for aggregate Question -> Question / Question -> End (and Question -> Outcome in Separate mode) */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isQuestionHandleConnectable}
        className={`flow-handle flow-handle-source ${
          isNested ? 'flow-handle-question-and' : ''
        } ${questionOutputBlocked ? 'is-disabled' : ''}`}
        title={
          questionOutputBlocked
            ? 'Disabled: one or more child Outcomes already have outgoing connections'
            : 'Aggregate output (all outcomes): connect to next Question or End'
        }
      />
    </div>
  );
}
