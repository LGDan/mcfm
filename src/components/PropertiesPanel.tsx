import {
  mdiChevronDoubleLeft,
  mdiChevronDoubleRight,
  mdiContentCopy,
  mdiContentCut,
  mdiContentDuplicate,
  mdiLayersTripleOutline,
  mdiPlus,
  mdiScaleBalance,
  mdiTrashCanOutline,
  mdiTuneVariant,
} from '@mdi/js';
import { useModelStore } from '../store/modelStore';
import {
  formatCurrency,
  getCurrencySymbol,
  isOutcomeNodeType,
  type AdvancedOutcomeFlowNode,
  type AnyOutcomeFlowNode,
  type CostPotAllocation,
  type EstimateMode,
  type NoteFlowNode,
  type OutcomeFlowNode,
  type QuestionFlowNode,
  type VariableFlowNode,
  type VariableMode,
} from '../types/model';
import { computeNominalAdvancedOutcomeCost } from '../sim/formulaEvaluator';
import { MdiIcon } from './MdiIcon';

export function PropertiesPanel() {
  const nodes = useModelStore((s) => s.nodes);
  const edges = useModelStore((s) => s.edges);
  const currency = useModelStore((s) => s.currency);
  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const selectedEdgeId = useModelStore((s) => s.selectedEdgeId);
  const validation = useModelStore((s) => s.validation);
  const propertiesCollapsed = useModelStore((s) => s.propertiesCollapsed);
  const togglePropertiesCollapsed = useModelStore(
    (s) => s.togglePropertiesCollapsed
  );

  const updateNodeData = useModelStore((s) => s.updateNodeData);
  const deleteNodeById = useModelStore((s) => s.deleteNodeById);
  const deleteEdgeById = useModelStore((s) => s.deleteEdgeById);
  const selectNode = useModelStore((s) => s.selectNode);
  const addOutcomeForQuestion = useModelStore((s) => s.addOutcomeForQuestion);
  const splitQuestionProbabilitiesEvenly = useModelStore(
    (s) => s.splitQuestionProbabilitiesEvenly
  );
  const rebalanceOutcomeProbability = useModelStore(
    (s) => s.rebalanceOutcomeProbability
  );
  const copyNodes = useModelStore((s) => s.copyNodes);
  const cutNodes = useModelStore((s) => s.cutNodes);
  const duplicateNodes = useModelStore((s) => s.duplicateNodes);
  const deleteSelected = useModelStore((s) => s.deleteSelected);

  if (propertiesCollapsed) {
    return (
      <aside className="properties-sidebar is-collapsed">
        <button
          type="button"
          className="pane-collapse-btn"
          onClick={togglePropertiesCollapsed}
          title="Expand Properties Inspector"
          aria-label="Expand Properties Inspector"
        >
          <MdiIcon path={mdiChevronDoubleLeft} size={16} />
        </button>
        <div className="collapsed-rail-icons">
          <button
            type="button"
            className="rail-icon-btn"
            onClick={togglePropertiesCollapsed}
            title="Inspect Selected Node / Edge"
          >
            <MdiIcon path={mdiTuneVariant} size={16} />
          </button>
        </div>
        <div className="collapsed-vertical-label">PROPERTIES</div>
      </aside>
    );
  }

  const collapseBtn = (
    <button
      type="button"
      className="pane-collapse-btn"
      onClick={togglePropertiesCollapsed}
      title="Collapse Properties Inspector"
      aria-label="Collapse Properties Inspector"
    >
      <MdiIcon path={mdiChevronDoubleRight} size={15} />
    </button>
  );

  const currencySymbol = getCurrencySymbol(currency);
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedNode =
    nodes.find((n) => n.id === selectedNodeId) ??
    (selectedNodes.length === 1 ? selectedNodes[0] : null);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  if (selectedNodes.length > 1) {
    const deletableCount = selectedNodes.filter(
      (n) => n.type !== 'start'
    ).length;

    return (
      <aside className="properties-sidebar">
        <div className="sidebar-section">
          <div className="prop-header-row">
            <span className="flow-node-badge badge-question">
              MULTI-SELECT ({selectedNodes.length})
            </span>
            {collapseBtn}
          </div>
          <p className="sidebar-hint">
            Tip: Shift/Cmd+Click nodes or drag a selection box on the canvas.
            Right-click any selected node for the context menu.
          </p>

          <div className="prop-button-group" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className="btn btn-secondary btn-full btn-with-icon"
              onClick={() => copyNodes()}
            >
              <MdiIcon path={mdiContentCopy} size={14} />
              <span>Copy Selected ({selectedNodes.length})</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-full btn-with-icon"
              onClick={() => duplicateNodes()}
            >
              <MdiIcon path={mdiContentDuplicate} size={14} />
              <span>Duplicate Selected</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-full btn-with-icon"
              onClick={() => cutNodes()}
            >
              <MdiIcon path={mdiContentCut} size={14} />
              <span>Cut Selected</span>
            </button>
            {deletableCount > 0 && (
              <button
                type="button"
                className="btn btn-danger btn-full btn-with-icon"
                onClick={() => deleteSelected()}
              >
                <MdiIcon path={mdiTrashCanOutline} size={14} />
                <span>Delete Selected ({deletableCount})</span>
              </button>
            )}
          </div>

          <h3 className="sidebar-subheading">Selected Nodes</h3>
          <div className="linked-q-list">
            {selectedNodes.map((n) => (
              <button
                key={n.id}
                type="button"
                className="linked-q-chip"
                onClick={() => selectNode(n.id, false)}
              >
                [{n.type?.toUpperCase()}] {n.data.label}
              </button>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  if (!selectedNode && !selectedEdge) {
    return (
      <aside className="properties-sidebar">
        <div className="sidebar-section">
          <div className="pane-header-row">
            <h2 className="sidebar-heading">Properties</h2>
            {collapseBtn}
          </div>
          <p className="sidebar-empty">
            Select any node or link on the canvas to inspect and edit its
            parameters, probabilities, and cost impact.
          </p>
        </div>
      </aside>
    );
  }

  if (selectedEdge) {
    const srcNode = nodes.find((n) => n.id === selectedEdge.source);
    const tgtNode = nodes.find((n) => n.id === selectedEdge.target);
    const kind = selectedEdge.data?.kind ?? 'start-to-question';

    return (
      <aside className="properties-sidebar">
        <div className="sidebar-section">
          <div className="pane-header-row">
            <h2 className="sidebar-heading">Link Properties</h2>
            {collapseBtn}
          </div>
          <div className="prop-field">
            <label>Connection Type</label>
            <div className="prop-readonly-box">
              {kind === 'question-to-question'
                ? 'Aggregate Question Link (Question → Question)'
                : kind === 'question-to-end'
                  ? 'Aggregate Terminal Link (Question → End)'
                  : kind === 'question-to-outcome'
                    ? 'OR Outcome Branch (Question → Outcome)'
                    : kind === 'outcome-to-question'
                      ? 'Conditional Follow-up (Outcome → Question)'
                      : kind === 'start-to-question'
                        ? 'Entry Link (Start → Question)'
                        : kind === 'note-link'
                          ? 'Note Annotation (closest-point dashed)'
                          : 'Terminal Link (Outcome → End)'}
            </div>
          </div>

          <div className="prop-field">
            <label>From</label>
            <div className="prop-readonly-box">
              {srcNode?.data.label ?? selectedEdge.source}
            </div>
          </div>

          <div className="prop-field">
            <label>To</label>
            <div className="prop-readonly-box">
              {tgtNode?.data.label ?? selectedEdge.target}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-danger btn-full btn-with-icon"
            onClick={() => deleteEdgeById(selectedEdge.id)}
          >
            <MdiIcon path={mdiTrashCanOutline} size={14} />
            <span>Delete Link</span>
          </button>
        </div>
      </aside>
    );
  }

  if (!selectedNode) return null;

  if (selectedNode.type === 'question') {
    const qNode = selectedNode as QuestionFlowNode;
    const childOutcomeEdges = edges.filter(
      (e) => e.source === qNode.id && e.data?.kind === 'question-to-outcome'
    );
    const childOutcomes = childOutcomeEdges
      .map((e) =>
        nodes.find((n) => n.id === e.target && isOutcomeNodeType(n.type))
      )
      .filter((n): n is AnyOutcomeFlowNode => Boolean(n));

    const andQuestionEdges = edges.filter(
      (e) => e.source === qNode.id && e.data?.kind === 'question-to-question'
    );
    const andQuestions = andQuestionEdges
      .map((e) => nodes.find((n) => n.id === e.target && n.type === 'question'))
      .filter((n): n is QuestionFlowNode => Boolean(n));

    const probSum = validation.questionProbSums[qNode.id] ?? 0;
    const isBalanced =
      childOutcomes.length > 0 && Math.abs(probSum - 100) <= 0.05;

    return (
      <aside className="properties-sidebar">
        <div className="sidebar-section">
          <div className="prop-header-row">
            <span className="flow-node-badge badge-question">QUESTION</span>
            <div className="prop-header-actions">
              <button
                type="button"
                className="btn-icon-danger"
                onClick={() => deleteNodeById(qNode.id)}
                title="Delete Question node"
              >
                <MdiIcon path={mdiTrashCanOutline} size={13} />
                <span>Delete</span>
              </button>
              {collapseBtn}
            </div>
          </div>

          <div className="prop-field">
            <label htmlFor="q-label">Question Title</label>
            <input
              id="q-label"
              type="text"
              value={qNode.data.label}
              onChange={(e) =>
                updateNodeData(qNode.id, { label: e.target.value })
              }
            />
          </div>

          <div className="prop-field">
            <label htmlFor="q-desc">Description / Risk Context</label>
            <textarea
              id="q-desc"
              rows={3}
              value={qNode.data.description || ''}
              onChange={(e) =>
                updateNodeData(qNode.id, { description: e.target.value })
              }
            />
          </div>

          <div className="prop-field">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={Boolean(qNode.data.impactYearEnabled)}
                onChange={(e) =>
                  updateNodeData(qNode.id, {
                    impactYearEnabled: e.target.checked,
                    impactYear: qNode.data.impactYear ?? 1,
                  })
                }
              />
              <span>Enable Impact Year</span>
            </label>
            {qNode.data.impactYearEnabled && (
              <select
                value={qNode.data.impactYear ?? 1}
                onChange={(e) =>
                  updateNodeData(qNode.id, {
                    impactYear: Number(e.target.value),
                  })
                }
                aria-label="Impact year"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            )}
            <p className="sidebar-hint">
              When enabled, Capex from this question lands in the selected year
              and Opex compounds across the 5-year rolling horizon.
            </p>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="prop-header-row">
            <h3 className="sidebar-subheading">OR Outcomes</h3>
            <span
              className={`prob-sum-pill ${isBalanced ? 'pill-ok' : 'pill-err'}`}
            >
              Sum: {probSum}%
            </span>
          </div>

          {!isBalanced && (
            <div className="inline-prob-warning">
              {childOutcomes.length === 0
                ? 'Add at least one Outcome to this question.'
                : `Outcome probabilities must total 100% (currently ${probSum}%).`}
            </div>
          )}

          <div className="outcome-inline-list">
            {childOutcomes.map((o) => (
              <div key={o.id} className="outcome-inline-card">
                <div className="outcome-inline-top">
                  <input
                    type="text"
                    value={o.data.label}
                    onChange={(e) =>
                      updateNodeData(o.id, { label: e.target.value })
                    }
                    aria-label="Outcome label"
                    placeholder="Outcome title"
                  />
                  <button
                    type="button"
                    className="link-select-btn"
                    onClick={() => selectNode(o.id)}
                    title="Focus outcome node"
                  >
                    Inspect
                  </button>
                </div>

                <div className="outcome-inline-desc">
                  <input
                    type="text"
                    value={o.data.description || ''}
                    onChange={(e) =>
                      updateNodeData(o.id, { description: e.target.value })
                    }
                    placeholder="Optional description / assumptions..."
                    aria-label="Outcome description"
                  />
                </div>

                <div className="outcome-inline-grid">
                  <div>
                    <label>Prob (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={o.data.probabilityPct}
                      onChange={(e) =>
                        updateNodeData(o.id, {
                          probabilityPct: Math.max(
                            0,
                            Math.min(100, Number(e.target.value))
                          ),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label>
                      {o.type === 'advanced-outcome'
                        ? 'Est. Cost'
                        : `Cost (${currencySymbol})`}
                    </label>
                    {o.type === 'advanced-outcome' ? (
                      <div className="prop-readonly-box">
                        {formatCurrency(Number(o.data.cost) || 0, currency)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={o.data.cost}
                        onChange={(e) =>
                          updateNodeData(o.id, {
                            cost: Math.max(0, Number(e.target.value)),
                          })
                        }
                      />
                    )}
                  </div>
                </div>

                <div className="outcome-inline-slider-row">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={o.data.probabilityPct}
                    onChange={(e) =>
                      rebalanceOutcomeProbability(o.id, Number(e.target.value))
                    }
                    aria-label={`${o.data.label} probability slider (auto-balances siblings)`}
                    title="Drag to adjust probability and auto-balance sibling outcomes to 100%"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="prop-button-group">
            <button
              type="button"
              className="btn btn-secondary btn-full btn-with-icon"
              onClick={() => addOutcomeForQuestion(qNode.id, false)}
            >
              <MdiIcon path={mdiPlus} size={14} />
              <span>Add Outcome Branch</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-full btn-with-icon"
              onClick={() => addOutcomeForQuestion(qNode.id, true)}
            >
              <MdiIcon path={mdiLayersTripleOutline} size={14} />
              <span>Add Advanced Outcome</span>
            </button>
            {childOutcomes.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-full btn-with-icon"
                onClick={() => splitQuestionProbabilitiesEvenly(qNode.id)}
              >
                <MdiIcon path={mdiScaleBalance} size={14} />
                <span>Split 100% Evenly</span>
              </button>
            )}
          </div>
        </div>

        {andQuestions.length > 0 && (
          <div className="sidebar-section">
            <h3 className="sidebar-subheading">Linked Questions</h3>
            <p className="sidebar-hint">
              Always evaluated alongside this question:
            </p>
            <div className="linked-q-list">
              {andQuestions.map((aq) => (
                <button
                  key={aq.id}
                  type="button"
                  className="linked-q-chip"
                  onClick={() => selectNode(aq.id)}
                >
                  ALL → {aq.data.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    );
  }

  if (selectedNode.type === 'advanced-outcome') {
    const oNode = selectedNode as AdvancedOutcomeFlowNode;
    const parentEdge = edges.find(
      (e) => e.target === oNode.id && e.data?.kind === 'question-to-outcome'
    );
    const parentQuestion = parentEdge
      ? (nodes.find((n) => n.id === parentEdge.source) as
          | QuestionFlowNode
          | undefined)
      : undefined;
    const parentProbSum = parentQuestion
      ? validation.questionProbSums[parentQuestion.id] ?? 0
      : null;
    const pots = oNode.data.pots ?? [];
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
    const nominal = computeNominalAdvancedOutcomeCost(
      pots,
      varMap,
      oNode.data.capexOpexEnabled,
      oNode.data.opexAnnualCost,
      oNode.data.opexInflationPct
    );

    const updatePots = (nextPots: CostPotAllocation[]) => {
      updateNodeData(oNode.id, {
        pots: nextPots,
        cost: nextPots.reduce((acc, p) => {
          if (p.estimateMode === 'fixed') return acc + (Number(p.fixedCost) || 0);
          if (p.estimateMode === 'three-point') {
            return (
              acc +
              Math.round(
                ((Number(p.lowCost) || 0) +
                  (Number(p.mediumCost) || 0) +
                  (Number(p.highCost) || 0)) /
                  3
              )
            );
          }
          return acc;
        }, 0),
      });
    };

    const updatePot = (potId: string, patch: Partial<CostPotAllocation>) => {
      updatePots(
        pots.map((p) => (p.potId === potId ? { ...p, ...patch } : p))
      );
    };

    return (
      <aside className="properties-sidebar">
        <div className="sidebar-section">
          <div className="prop-header-row">
            <span className="flow-node-badge badge-advanced-outcome">
              ADVANCED OUTCOME
            </span>
            <div className="prop-header-actions">
              <button
                type="button"
                className="btn-icon-danger"
                onClick={() => deleteNodeById(oNode.id)}
              >
                <MdiIcon path={mdiTrashCanOutline} size={13} />
                <span>Delete</span>
              </button>
              {collapseBtn}
            </div>
          </div>

          {parentQuestion && (
            <div className="prop-field">
              <label>Parent Question</label>
              <button
                type="button"
                className="linked-q-chip"
                onClick={() => selectNode(parentQuestion.id)}
              >
                ← {parentQuestion.data.label} (Σ {parentProbSum}%)
              </button>
            </div>
          )}

          <div className="prop-field">
            <label htmlFor="ao-label">Outcome Name</label>
            <input
              id="ao-label"
              type="text"
              value={oNode.data.label}
              onChange={(e) =>
                updateNodeData(oNode.id, { label: e.target.value })
              }
            />
          </div>

          <div className="prop-field">
            <label htmlFor="ao-desc">Description</label>
            <textarea
              id="ao-desc"
              rows={2}
              value={oNode.data.description || ''}
              onChange={(e) =>
                updateNodeData(oNode.id, { description: e.target.value })
              }
            />
          </div>

          <div className="prop-field">
            <label>
              Branch Probability (%) — {oNode.data.probabilityPct}%
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={oNode.data.probabilityPct}
              onChange={(e) =>
                updateNodeData(oNode.id, {
                  probabilityPct: Math.max(
                    0,
                    Math.min(100, Number(e.target.value))
                  ),
                })
              }
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={oNode.data.probabilityPct}
              onChange={(e) =>
                rebalanceOutcomeProbability(oNode.id, Number(e.target.value))
              }
            />
          </div>

          <div className="prop-readonly-box">
            Nominal {oNode.data.capexOpexEnabled ? 'Capex + 5yr Opex' : 'Capex'}:{' '}
            <strong>
              {formatCurrency(
                oNode.data.capexOpexEnabled
                  ? nominal.totalNominal
                  : nominal.capexNominal,
                currency
              )}
            </strong>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="prop-header-row">
            <h3 className="sidebar-subheading">Cost Pots</h3>
          </div>
          {pots.map((pot) => (
            <div key={pot.potId} className="pot-editor-card">
              <div className="outcome-inline-top">
                <input
                  type="text"
                  value={pot.label}
                  onChange={(e) => updatePot(pot.potId, { label: e.target.value })}
                  aria-label="Pot label"
                />
                {pots.length > 1 && (
                  <button
                    type="button"
                    className="btn-icon-danger"
                    onClick={() =>
                      updatePots(pots.filter((p) => p.potId !== pot.potId))
                    }
                    title="Remove pot"
                  >
                    <MdiIcon path={mdiTrashCanOutline} size={12} />
                  </button>
                )}
              </div>
              <label className="prop-field">
                <span>Estimate Mode</span>
                <select
                  value={pot.estimateMode}
                  onChange={(e) =>
                    updatePot(pot.potId, {
                      estimateMode: e.target.value as EstimateMode,
                    })
                  }
                >
                  <option value="fixed">Fixed</option>
                  <option value="three-point">Low / Medium / High</option>
                  <option value="formula">Formula</option>
                </select>
              </label>
              {pot.estimateMode === 'fixed' && (
                <label className="prop-field">
                  <span>Fixed Cost ({currencySymbol})</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={pot.fixedCost}
                    onChange={(e) =>
                      updatePot(pot.potId, {
                        fixedCost: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </label>
              )}
              {pot.estimateMode === 'three-point' && (
                <div className="outcome-inline-grid pot-lmh-grid">
                  {(['lowCost', 'mediumCost', 'highCost'] as const).map(
                    (key) => (
                      <label key={key} className="prop-field">
                        <span>
                          {key === 'lowCost'
                            ? 'Low'
                            : key === 'mediumCost'
                              ? 'Med'
                              : 'High'}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={pot[key]}
                          onChange={(e) =>
                            updatePot(pot.potId, {
                              [key]: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </label>
                    )
                  )}
                </div>
              )}
              {pot.estimateMode === 'formula' && (
                <label className="prop-field">
                  <span>Formula (e.g. day_rate * 20)</span>
                  <input
                    type="text"
                    className="formula-input"
                    value={pot.formula}
                    onChange={(e) =>
                      updatePot(pot.potId, { formula: e.target.value })
                    }
                    placeholder="variable_a * 10"
                  />
                </label>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-full btn-with-icon"
            onClick={() => {
              const idx = pots.length + 1;
              updatePots([
                ...pots,
                {
                  potId: `custom-${Date.now().toString(36)}`,
                  label: `Custom Pot ${idx}`,
                  estimateMode: 'fixed',
                  fixedCost: 0,
                  lowCost: 0,
                  mediumCost: 0,
                  highCost: 0,
                  formula: '0',
                },
              ]);
            }}
          >
            <MdiIcon path={mdiPlus} size={14} />
            <span>Add Custom Pot</span>
          </button>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-subheading">Capex &amp; Opex</h3>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(oNode.data.capexOpexEnabled)}
              onChange={(e) =>
                updateNodeData(oNode.id, {
                  capexOpexEnabled: e.target.checked,
                })
              }
            />
            <span>Enable ongoing Opex (5-year rolling horizon)</span>
          </label>
          {oNode.data.capexOpexEnabled && (
            <>
              <div className="prop-field">
                <label>Annual Opex ({currencySymbol})</label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={oNode.data.opexAnnualCost ?? 0}
                  onChange={(e) =>
                    updateNodeData(oNode.id, {
                      opexAnnualCost: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>
              <div className="prop-field">
                <label>Inflation (% / year)</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={oNode.data.opexInflationPct ?? 3.5}
                  onChange={(e) =>
                    updateNodeData(oNode.id, {
                      opexInflationPct: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>
              <div className="prop-field">
                <label>Opex Cost Pot</label>
                <select
                  value={oNode.data.opexPotId ?? 'external'}
                  onChange={(e) =>
                    updateNodeData(oNode.id, { opexPotId: e.target.value })
                  }
                >
                  {pots.map((p) => (
                    <option key={p.potId} value={p.potId}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="sidebar-hint">
                Primary pot costs are treated as Capex in the Question Impact
                Year. Opex compounds annually for 5 years from that year.
              </p>
            </>
          )}
        </div>
      </aside>
    );
  }

  if (selectedNode.type === 'variable') {
    const vNode = selectedNode as VariableFlowNode;
    return (
      <aside className="properties-sidebar">
        <div className="sidebar-section">
          <div className="prop-header-row">
            <span className="flow-node-badge badge-variable">VARIABLE</span>
            <div className="prop-header-actions">
              <button
                type="button"
                className="btn-icon-danger"
                onClick={() => deleteNodeById(vNode.id)}
              >
                <MdiIcon path={mdiTrashCanOutline} size={13} />
                <span>Delete</span>
              </button>
              {collapseBtn}
            </div>
          </div>

          <div className="prop-field">
            <label htmlFor="var-label">Display Label</label>
            <input
              id="var-label"
              type="text"
              value={vNode.data.label}
              onChange={(e) =>
                updateNodeData(vNode.id, { label: e.target.value })
              }
            />
          </div>

          <div className="prop-field">
            <label htmlFor="var-name">Identifier (used in formulas)</label>
            <input
              id="var-name"
              type="text"
              className="formula-input"
              value={vNode.data.name}
              onChange={(e) =>
                updateNodeData(vNode.id, { name: e.target.value })
              }
            />
            <p className="sidebar-hint">
              Sanitized to <code>[a-z_][a-z0-9_]*</code>. Reference this name
              in Advanced Outcome formulas.
            </p>
          </div>

          <div className="prop-field">
            <label>Mode</label>
            <div className="variable-mode-tabs">
              {(['fixed', 'slider', 'random'] as VariableMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`var-mode-btn ${
                    vNode.data.mode === m ? 'is-active' : ''
                  }`}
                  onClick={() => updateNodeData(vNode.id, { mode: m })}
                >
                  {m === 'fixed' ? 'Fixed' : m === 'slider' ? 'Slider' : 'Random'}
                </button>
              ))}
            </div>
          </div>

          {vNode.data.mode === 'fixed' && (
            <div className="prop-field">
              <label>Fixed Value</label>
              <input
                type="number"
                value={vNode.data.fixedValue}
                onChange={(e) =>
                  updateNodeData(vNode.id, {
                    fixedValue: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
          )}

          {(vNode.data.mode === 'slider' || vNode.data.mode === 'random') && (
            <>
              <div className="outcome-inline-grid">
                <div className="prop-field">
                  <label>Minimum</label>
                  <input
                    type="number"
                    value={vNode.data.minValue}
                    onChange={(e) =>
                      updateNodeData(vNode.id, {
                        minValue: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="prop-field">
                  <label>Maximum</label>
                  <input
                    type="number"
                    value={vNode.data.maxValue}
                    onChange={(e) =>
                      updateNodeData(vNode.id, {
                        maxValue: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              {vNode.data.mode === 'slider' && (
                <div className="prop-field">
                  <label>Slider Value ({vNode.data.sliderValue})</label>
                  <input
                    type="range"
                    min={vNode.data.minValue}
                    max={Math.max(vNode.data.minValue + 1, vNode.data.maxValue)}
                    step={1}
                    value={vNode.data.sliderValue}
                    onChange={(e) =>
                      updateNodeData(vNode.id, {
                        sliderValue: Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    );
  }

  if (selectedNode.type === 'note') {
    const nNode = selectedNode as NoteFlowNode;
    return (
      <aside className="properties-sidebar">
        <div className="sidebar-section">
          <div className="prop-header-row">
            <span className="flow-node-badge badge-note">NOTE</span>
            <div className="prop-header-actions">
              <button
                type="button"
                className="btn-icon-danger"
                onClick={() => deleteNodeById(nNode.id)}
              >
                <MdiIcon path={mdiTrashCanOutline} size={13} />
                <span>Delete</span>
              </button>
              {collapseBtn}
            </div>
          </div>
          <p className="sidebar-hint">
            Notes are editorial only. Connect them to any node with a dashed
            closest-point link — they are ignored by validation and simulation.
          </p>
          <div className="prop-field">
            <label htmlFor="note-label">Title</label>
            <input
              id="note-label"
              type="text"
              value={nNode.data.label}
              onChange={(e) =>
                updateNodeData(nNode.id, { label: e.target.value })
              }
            />
          </div>
          <div className="prop-field">
            <label htmlFor="note-desc">Annotation</label>
            <textarea
              id="note-desc"
              rows={6}
              value={nNode.data.description}
              onChange={(e) =>
                updateNodeData(nNode.id, { description: e.target.value })
              }
            />
          </div>
        </div>
      </aside>
    );
  }

  if (selectedNode.type === 'outcome') {
    const oNode = selectedNode as OutcomeFlowNode;
    const parentEdge = edges.find((e) => e.target === oNode.id);
    const parentQuestion = parentEdge
      ? (nodes.find((n) => n.id === parentEdge.source) as
          | QuestionFlowNode
          | undefined)
      : undefined;

    const parentProbSum = parentQuestion
      ? validation.questionProbSums[parentQuestion.id] ?? 0
      : null;

    return (
      <aside className="properties-sidebar">
        <div className="sidebar-section">
          <div className="prop-header-row">
            <span className="flow-node-badge badge-outcome">OUTCOME (OR)</span>
            <div className="prop-header-actions">
              <button
                type="button"
                className="btn-icon-danger"
                onClick={() => deleteNodeById(oNode.id)}
              >
                <MdiIcon path={mdiTrashCanOutline} size={13} />
                <span>Delete</span>
              </button>
              {collapseBtn}
            </div>
          </div>

          {parentQuestion && (
            <div className="prop-field">
              <label>Parent Question</label>
              <button
                type="button"
                className="linked-q-chip"
                onClick={() => selectNode(parentQuestion.id)}
              >
                ← {parentQuestion.data.label} (Σ {parentProbSum}%)
              </button>
            </div>
          )}

          <div className="prop-field">
            <label htmlFor="o-label">Outcome Name</label>
            <input
              id="o-label"
              type="text"
              value={oNode.data.label}
              onChange={(e) =>
                updateNodeData(oNode.id, { label: e.target.value })
              }
            />
          </div>

          <div className="prop-field">
            <label htmlFor="o-desc">Description / Cost Assumptions</label>
            <textarea
              id="o-desc"
              rows={3}
              placeholder="Explain what this outcome entails and what drives its cost..."
              value={oNode.data.description || ''}
              onChange={(e) =>
                updateNodeData(oNode.id, { description: e.target.value })
              }
            />
          </div>

          <div className="prop-field">
            <label htmlFor="o-prob">
              Branch Probability (%) — {oNode.data.probabilityPct}%
            </label>
            <input
              id="o-prob"
              type="number"
              min={0}
              max={100}
              step={1}
              value={oNode.data.probabilityPct}
              onChange={(e) =>
                updateNodeData(oNode.id, {
                  probabilityPct: Math.max(
                    0,
                    Math.min(100, Number(e.target.value))
                  ),
                })
              }
            />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={oNode.data.probabilityPct}
              onChange={(e) =>
                rebalanceOutcomeProbability(oNode.id, Number(e.target.value))
              }
              title="Drag to adjust probability and auto-balance sibling outcomes to 100%"
            />
          </div>

          <div className="prop-field">
            <label htmlFor="o-cost">
              Pathway Cost Impact ({formatCurrency(oNode.data.cost, currency)})
            </label>
            <input
              id="o-cost"
              type="number"
              min={0}
              step={1000}
              value={oNode.data.cost}
              onChange={(e) =>
                updateNodeData(oNode.id, {
                  cost: Math.max(0, Number(e.target.value)),
                })
              }
            />
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="properties-sidebar">
      <div className="sidebar-section">
        <div className="prop-header-row">
          <span className="flow-node-badge">
            {selectedNode.type?.toUpperCase()}
          </span>
          <div className="prop-header-actions">
            {selectedNode.type !== 'start' && (
              <button
                type="button"
                className="btn-icon-danger"
                onClick={() => deleteNodeById(selectedNode.id)}
              >
                <MdiIcon path={mdiTrashCanOutline} size={13} />
                <span>Delete</span>
              </button>
            )}
            {collapseBtn}
          </div>
        </div>
        <div className="prop-field">
          <label htmlFor="node-label">Label</label>
          <input
            id="node-label"
            type="text"
            value={selectedNode.data.label}
            onChange={(e) =>
              updateNodeData(selectedNode.id, { label: e.target.value })
            }
          />
        </div>
      </div>
    </aside>
  );
}
