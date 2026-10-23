import { useRef, useState } from 'react';
import { useModelStore } from '../store/modelStore';
import {
  CURRENCY_OPTIONS,
  LAYOUT_ALGORITHMS,
  formatCurrency,
  type CurrencyCode,
  type LayoutAlgorithm,
} from '../types/model';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const modelName = useModelStore((s) => s.modelName);
  const setModelName = useModelStore((s) => s.setModelName);
  const currency = useModelStore((s) => s.currency);
  const setCurrency = useModelStore((s) => s.setCurrency);
  const activeTab = useModelStore((s) => s.activeTab);
  const setActiveTab = useModelStore((s) => s.setActiveTab);
  const validation = useModelStore((s) => s.validation);
  const simulationResult = useModelStore((s) => s.simulationResult);
  const runSimulation = useModelStore((s) => s.runSimulation);
  const layoutAlgorithm = useModelStore((s) => s.layoutAlgorithm);
  const setLayoutAlgorithm = useModelStore((s) => s.setLayoutAlgorithm);
  const outcomeDisplayMode = useModelStore((s) => s.outcomeDisplayMode);
  const setOutcomeDisplayMode = useModelStore((s) => s.setOutcomeDisplayMode);
  const autoLayout = useModelStore((s) => s.autoLayout);
  const resetToNewModel = useModelStore((s) => s.resetToNewModel);
  const loadDemoModel = useModelStore((s) => s.loadDemoModel);
  const exportModelJson = useModelStore((s) => s.exportModelJson);
  const importModelJson = useModelStore((s) => s.importModelJson);

  const handleExport = () => {
    const json = exportModelJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName =
      modelName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'mc-model';
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = importModelJson(text);
    if (!res.ok) {
      setImportError(res.error ?? 'Failed to import JSON');
    } else {
      setImportError(null);
    }
    e.target.value = '';
  };

  return (
    <header className="top-toolbar">
      <div className="toolbar-left">
        <div className="brand-mark">MC</div>
        <input
          type="text"
          className="model-name-input"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          aria-label="Project Model Name"
        />
        <select
          className="currency-select"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          aria-label="Currency"
          title="Select project currency"
        >
          {CURRENCY_OPTIONS.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <nav className="toolbar-tabs" aria-label="Main views">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'editor' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          DAG Editor
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'results' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          Simulation Results
          {simulationResult && (
            <span className="tab-p80-badge">
              P80: {formatCurrency(simulationResult.p80, currency)}
            </span>
          )}
        </button>
      </nav>

      <div className="toolbar-right">
        <div
          className={`validation-pill ${
            validation.valid ? 'is-valid' : 'is-invalid'
          }`}
          title={
            validation.valid
              ? 'All DAG and probability constraints satisfied'
              : validation.errors.map((e) => e.message).join('\n')
          }
        >
          {validation.valid
            ? 'Valid DAG'
            : `${validation.errors.length} Error${
                validation.errors.length === 1 ? '' : 's'
              }`}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!validation.valid}
          onClick={() => runSimulation(true)}
          title={
            validation.valid
              ? 'Run Monte Carlo simulation and open Results tab'
              : 'Fix validation errors before running simulation'
          }
        >
          Run Simulation
        </button>

        <div className="toolbar-divider" />

        {activeTab === 'editor' && (
          <div className="layout-control-group">
            <div
              className="view-mode-toggle"
              role="group"
              aria-label="Outcome display mode"
            >
              <button
                type="button"
                className={`view-mode-btn ${
                  outcomeDisplayMode === 'separate' ? 'is-active' : ''
                }`}
                onClick={() => setOutcomeDisplayMode('separate')}
                title="Show Outcomes as separate nodes on the canvas"
              >
                Separate Nodes
              </button>
              <button
                type="button"
                className={`view-mode-btn ${
                  outcomeDisplayMode === 'nested' ? 'is-active' : ''
                }`}
                onClick={() => setOutcomeDisplayMode('nested')}
                title="Show Outcomes nested inside their parent Question node"
              >
                Nested Outcomes
              </button>
            </div>

            <select
              className="layout-select"
              value={layoutAlgorithm}
              onChange={(e) =>
                setLayoutAlgorithm(e.target.value as LayoutAlgorithm)
              }
              aria-label="Auto-layout algorithm"
              title="Choose auto-layout algorithm"
            >
              {LAYOUT_ALGORITHMS.map((algo) => (
                <option key={algo.id} value={algo.id}>
                  {algo.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => autoLayout()}
              title="Arrange nodes using the selected layout algorithm"
            >
              Auto-Layout
            </button>
          </div>
        )}

        <button
          type="button"
          className="btn btn-ghost"
          onClick={resetToNewModel}
        >
          New
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadDemoModel}
        >
          Demo
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleExport}>
          Export
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImportChange}
        />
      </div>

      {importError && (
        <div className="toolbar-error-banner">
          <span>Import failed: {importError}</span>
          <button type="button" onClick={() => setImportError(null)}>
            Dismiss
          </button>
        </div>
      )}
    </header>
  );
}
