import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  mdiCalendarClockOutline,
  mdiHelpRhombusOutline,
  mdiLayersTripleOutline,
  mdiPlus,
} from '@mdi/js';
import {
  formatCurrency,
  isOutcomeNodeType,
  type AdvancedOutcomeFlowNode,
  type AnyOutcomeFlowNode,
  type QuestionFlowNode,
  type VariableFlowNode,
} from '../../types/model';
import {
  isOutcomeOutputBlocked,
  isQuestionOutputBlocked,
} from '../../sim/validate';
import { computeNominalAdvancedOutcomeCost } from '../../sim/formulaEvaluator';
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

  const hasUnparentedOutcomeOnCanvas =
    !isNested &&
    nodes.some(
      (n) =>
        isOutcomeNodeType(n.type) &&
        !edges.some(
          (e) => e.target === n.id && e.data?.kind === 'question-to-outcome'
        )
    );
  const isQuestionHandleConnectable = isNested
    ? !questionOutputBlocked
    : !questionOutputBlocked || hasUnparentedOutcomeOnCanvas;

  const childOutcomes: AnyOutcomeFlowNode[] = isNested
    ? edges
        .filter(
          (e) => e.source === id && e.data?.kind === 'question-to-outcome'
        )
        .map((e) =>
          nodes.find((n) => n.id === e.target && isOutcomeNodeType(n.type))
        )
        .filter((n): n is AnyOutcomeFlowNode => Boolean(n))
    : [];

  const varMap: Record<string, number> = {};
  if (isNested) {
    for (const n of nodes) {
      if (n.type === 'variable') {
        const vn = n as VariableFlowNode;
        varMap[vn.data.name] =
          vn.data.mode === 'fixed'
            ? vn.data.fixedValue
            : vn.data.mode === 'slider'
              ? vn.data.sliderValue
              : (vn.data.minValue + vn.data.maxValue) / 2;
      }
    }
  }

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
        <div className="node-badge-group">
          <span className="flow-node-badge badge-question">
            <MdiIcon path={mdiHelpRhombusOutline} size={11} />
            <span>QUESTION</span>
          </span>
          {data.impactYearEnabled && (
            <span
              className="flow-node-badge badge-year"
              title={`Costs from this question land in Year ${data.impactYear ?? 1}`}
            >
              <MdiIcon path={mdiCalendarClockOutline} size={10} />
              <span>YR {data.impactYear ?? 1}</span>
            </span>
          )}
        </div>
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
                const isAdv = o.type === 'advanced-outcome';

                let displayCost = Number(o.data.cost) || 0;
                if (isAdv) {
                  const adv = o as AdvancedOutcomeFlowNode;
                  const { totalNominal, capexNominal } =
                    computeNominalAdvancedOutcomeCost(
                      adv.data.pots ?? [],
                      varMap,
                      adv.data.capexOpexEnabled,
                      adv.data.opexAnnualCost,
                      adv.data.opexInflationPct
                    );
                  displayCost = adv.data.capexOpexEnabled
                    ? totalNominal
                    : capexNominal;
                }

                return (
                  <div
                    key={o.id}
                    className={`nested-outcome-card nodrag ${
                      isOutcomeSelected ? 'is-selected' : ''
                    } ${isAdv ? 'is-advanced' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectNode(o.id, e.shiftKey || e.metaKey || e.ctrlKey);
                    }}
                  >
                    <div className="nested-outcome-top">
                      <span className="nested-outcome-title">
                        {isAdv && (
                          <MdiIcon
                            path={mdiLayersTripleOutline}
                            size={11}
                            className="nested-adv-icon"
                          />
                        )}
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
                      <span className="nested-outcome-cost-label">
                        {isAdv ? 'Adv. Est.' : 'Cost'}
                      </span>
                      <span className="nested-outcome-cost">
                        +{formatCurrency(displayCost, currency)}
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
        <div className="node-footer-btns">
          <button
            type="button"
            className="node-inline-btn nodrag"
            onClick={(e) => {
              e.stopPropagation();
              addOutcomeForQuestion(id, false);
            }}
            title="Add a standard Outcome branch to this question"
          >
            <MdiIcon path={mdiPlus} size={11} />
            <span>Outcome</span>
          </button>
          <button
            type="button"
            className="node-inline-btn nodrag is-adv-btn"
            onClick={(e) => {
              e.stopPropagation();
              addOutcomeForQuestion(id, true);
            }}
            title="Add an Advanced Outcome branch (multi-pot, Low/Med/High, formulas, Capex/Opex)"
          >
            <MdiIcon path={mdiLayersTripleOutline} size={10} />
            <span>Adv</span>
          </button>
        </div>
      </div>

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
