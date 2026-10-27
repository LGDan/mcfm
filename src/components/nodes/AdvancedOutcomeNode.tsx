import { Handle, Position, type NodeProps } from '@xyflow/react';
import { mdiLayersTripleOutline } from '@mdi/js';
import {
  formatCurrency,
  type AdvancedOutcomeFlowNode,
  type VariableFlowNode,
} from '../../types/model';
import { isOutcomeOutputBlocked } from '../../sim/validate';
import {
  computeNominalAdvancedOutcomeCost,
  evaluatePotCost,
} from '../../sim/formulaEvaluator';
import { useModelStore } from '../../store/modelStore';
import { MdiIcon } from '../MdiIcon';

export function AdvancedOutcomeNode({
  id,
  data,
  selected,
}: NodeProps<AdvancedOutcomeFlowNode>) {
  const currency = useModelStore((s) => s.currency);
  const nodes = useModelStore((s) => s.nodes);
  const outcomeBlocked = useModelStore((s) =>
    isOutcomeOutputBlocked(id, s.edges)
  );

  // Build current nominal variable map
  const varMap: Record<string, number> = {};
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

  const pots = data.pots ?? [];
  const { capexNominal, opexNominalTotal, totalNominal } =
    computeNominalAdvancedOutcomeCost(
      pots,
      varMap,
      data.capexOpexEnabled,
      data.opexAnnualCost,
      data.opexInflationPct
    );

  return (
    <div
      className={`flow-node flow-node-advanced-outcome ${
        selected ? 'is-selected' : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="flow-handle flow-handle-target"
      />

      <div className="flow-node-header">
        <span className="flow-node-badge badge-advanced-outcome">
          <MdiIcon path={mdiLayersTripleOutline} size={11} />
          <span>ADV OUTCOME</span>
        </span>
        <span className="outcome-prob-badge">{data.probabilityPct}%</span>
      </div>

      <div className="flow-node-title">{data.label || 'Advanced Outcome'}</div>
      {data.description && (
        <div className="flow-node-desc">{data.description}</div>
      )}

      <div className="adv-pots-mini-list">
        {pots.map((pot) => {
          const val = evaluatePotCost(pot, varMap);
          const modeTag =
            pot.estimateMode === 'three-point'
              ? 'L/M/H'
              : pot.estimateMode === 'formula'
                ? 'fx'
                : '';
          return (
            <div key={pot.potId} className="adv-pot-mini-row">
              <span className="adv-pot-mini-name">
                {pot.label}
                {modeTag && <em className="adv-mode-chip">{modeTag}</em>}
              </span>
              <span className="adv-pot-mini-val">
                {formatCurrency(val, currency)}
              </span>
            </div>
          );
        })}
      </div>

      {data.capexOpexEnabled && (Number(data.opexAnnualCost) || 0) > 0 && (
        <div className="adv-opex-mini-banner">
          <span>
            Opex: {formatCurrency(Number(data.opexAnnualCost) || 0, currency)}/yr
            (+{data.opexInflationPct ?? 3.5}%/yr)
          </span>
          <span>5yr: {formatCurrency(opexNominalTotal, currency)}</span>
        </div>
      )}

      <div className="outcome-cost-row">
        <span className="outcome-cost-label">
          {data.capexOpexEnabled ? 'Est. Capex + 5yr Opex' : 'Est. Total Cost'}
        </span>
        <span className="outcome-cost-value">
          +{formatCurrency(data.capexOpexEnabled ? totalNominal : capexNominal, currency)}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={!outcomeBlocked}
        className={`flow-handle flow-handle-source ${
          outcomeBlocked ? 'is-disabled' : ''
        }`}
        title={
          outcomeBlocked
            ? 'Disabled: parent Question already has an aggregate output connection'
            : 'Connect this Advanced Outcome to next Question or End'
        }
      />
    </div>
  );
}
