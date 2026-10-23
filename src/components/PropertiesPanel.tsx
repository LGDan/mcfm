import { useModelStore } from '../store/modelStore';
import {
  formatCurrency,
  getCurrencySymbol,
  type OutcomeFlowNode,
  type QuestionFlowNode,
} from '../types/model';

export function PropertiesPanel() {
  const nodes = useModelStore((s) => s.nodes);
  const edges = useModelStore((s) => s.edges);
  const currency = useModelStore((s) => s.currency);
  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const selectedEdgeId = useModelStore((s) => s.selectedEdgeId);
  const validation = useModelStore((s) => s.validation);

  const updateNodeData = useModelStore((s) => s.updateNodeData);
  const deleteNodeById = useModelStore((s) => s.deleteNodeById);
  const deleteEdgeById = useModelStore((s) => s.deleteEdgeById);
  const selectNode = useModelStore((s) => s.selectNode);
  const addOutcomeForQuestion = useModelStore((s) => s.addOutcomeForQuestion);
  const splitQuestionProbabilitiesEvenly = useModelStore(
    (s) => s.splitQuestionProbabilitiesEvenly
  );
  const copyNodes = useModelStore((s) => s.copyNodes);
  const cutNodes = useModelStore((s) => s.cutNodes);
  const duplicateNodes = useModelStore((s) => s.duplicateNodes);
  const deleteSelected = useModelStore((s) => s.deleteSelected);

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
              MULTI-SELECT
            </span>
            <span className="prob-sum-pill pill-ok">
              {selectedNodes.length} nodes
            </span>
          </div>
          <p className="sidebar-hint">
            Tip: Shift/Cmd+Click nodes or drag a selection box on the canvas.
            Right-click any selected node for the context menu.
          </p>

          <div className="prop-button-group" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={() => copyNodes()}
            >
              Copy Selected ({selectedNodes.length})
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-full"
              onClick={() => duplicateNodes()}
            >
              Duplicate Selected
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-full"
              onClick={() => cutNodes()}
            >
              Cut Selected
            </button>
            {deletableCount > 0 && (
              <button
                type="button"
                className="btn btn-danger btn-full"
                onClick={() => deleteSelected()}
              >
                Delete Selected ({deletableCount})
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
          <h2 className="sidebar-heading">Properties</h2>
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
          <h2 className="sidebar-heading">Link Properties</h2>
          <div className="prop-field">
            <label>Connection Type</label>
            <div className="prop-readonly-box">
              {kind === 'question-to-question'
                ? 'AND Chain (Question → Question)'
                : kind === 'question-to-outcome'
                  ? 'OR Outcome Branch (Question → Outcome)'
                  : kind === 'outcome-to-question'
                    ? 'Conditional Follow-up (Outcome → Question)'
                    : kind === 'start-to-question'
                      ? 'Entry Link (Start → Question)'
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
            className="btn btn-danger btn-full"
            onClick={() => deleteEdgeById(selectedEdge.id)}
          >
            Delete Link
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
      .map((e) => nodes.find((n) => n.id === e.target && n.type === 'outcome'))
      .filter((n): n is OutcomeFlowNode => Boolean(n));

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
            <button
              type="button"
              className="btn-icon-danger"
              onClick={() => deleteNodeById(qNode.id)}
              title="Delete Question node"
            >
              Delete
            </button>
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
                    <label>Cost ({currencySymbol})</label>
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
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="prop-button-group">
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={() => addOutcomeForQuestion(qNode.id)}
            >
              + Add Outcome Branch
            </button>
            {childOutcomes.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-full"
                onClick={() => splitQuestionProbabilitiesEvenly(qNode.id)}
              >
                Split 100% Evenly
              </button>
            )}
          </div>
        </div>

        {andQuestions.length > 0 && (
          <div className="sidebar-section">
            <h3 className="sidebar-subheading">Linked AND Questions</h3>
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
                  AND → {aq.data.label}
                </button>
              ))}
            </div>
          </div>
        )}
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
            <button
              type="button"
              className="btn-icon-danger"
              onClick={() => deleteNodeById(oNode.id)}
            >
              Delete
            </button>
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
                updateNodeData(oNode.id, {
                  probabilityPct: Number(e.target.value),
                })
              }
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
          {selectedNode.type !== 'start' && (
            <button
              type="button"
              className="btn-icon-danger"
              onClick={() => deleteNodeById(selectedNode.id)}
            >
              Delete
            </button>
          )}
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
