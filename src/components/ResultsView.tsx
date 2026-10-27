import { useState } from 'react';
import {
  mdiDownloadOutline,
  mdiFileDelimitedOutline,
  mdiFileDocumentOutline,
  mdiLanguageMarkdownOutline,
  mdiPrinterOutline,
  mdiRefresh,
} from '@mdi/js';
import { useModelStore } from '../store/modelStore';
import {
  formatCurrency,
  type CurrencyCode,
  type HistogramBin,
  type PathTrace,
  type YearBreakdownStat,
} from '../types/model';
import {
  downloadSimulationReport,
  openPrintableReportWindow,
} from '../sim/reportGenerator';
import { MdiIcon } from './MdiIcon';

export function ResultsView() {
  const modelName = useModelStore((s) => s.modelName);
  const nodes = useModelStore((s) => s.nodes);
  const edges = useModelStore((s) => s.edges);
  const simulationResult = useModelStore((s) => s.simulationResult);
  const currency = useModelStore((s) => s.currency);
  const validation = useModelStore((s) => s.validation);
  const trials = useModelStore((s) => s.trials);
  const setTrials = useModelStore((s) => s.setTrials);
  const runSimulation = useModelStore((s) => s.runSimulation);
  const setActiveTab = useModelStore((s) => s.setActiveTab);

  const [hoveredBin, setHoveredBin] = useState<HistogramBin | null>(null);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);

  if (!validation.valid) {
    return (
      <main className="results-page">
        <div className="results-empty-card">
          <h2>Model Has Validation Errors</h2>
          <p>
            Please resolve the following issues in the DAG Editor before running
            the Monte Carlo simulation:
          </p>
          <ul className="results-error-list">
            {validation.errors.map((e) => (
              <li key={e.id}>{e.message}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setActiveTab('editor')}
          >
            Return to DAG Editor
          </button>
        </div>
      </main>
    );
  }

  if (!simulationResult) {
    return (
      <main className="results-page">
        <div className="results-empty-card">
          <h2>No Simulation Results Yet</h2>
          <p>
            Run a Monte Carlo simulation across your decision tree to calculate
            the P80 project budget and cost distribution.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => runSimulation(false)}
          >
            Run Monte Carlo Simulation ({trials.toLocaleString()} trials)
          </button>
        </div>
      </main>
    );
  }

  const maxFreqPct = Math.max(
    1,
    ...simulationResult.histogram.map((b) => b.frequencyPct)
  );

  return (
    <main className="results-page">
      <div className="results-header-bar">
        <div>
          <h1 className="results-title">Monte Carlo Budget Forecast</h1>
          <p className="results-subtitle">
            Simulated {simulationResult.trials.toLocaleString()} random walks
            through the project decision DAG
          </p>
        </div>

        <div className="results-controls">
          <label className="trials-select-label">
            Trials
            <select
              value={trials}
              onChange={(e) => setTrials(Number(e.target.value))}
              className="trials-select"
            >
              <option value={1000}>1,000</option>
              <option value={10000}>10,000</option>
              <option value={50000}>50,000</option>
            </select>
          </label>

          <button
            type="button"
            className="btn btn-primary btn-with-icon"
            onClick={() => runSimulation(false)}
          >
            <MdiIcon path={mdiRefresh} size={15} />
            <span>Re-run Simulation</span>
          </button>

          <div className="report-dropdown-wrap">
            <button
              type="button"
              className="btn btn-secondary btn-with-icon"
              onClick={() => setReportMenuOpen((v) => !v)}
              title="Generate or download a formatted project budget report"
            >
              <MdiIcon path={mdiDownloadOutline} size={15} />
              <span>Export Report ▾</span>
            </button>

            {reportMenuOpen && (
              <div className="report-dropdown-menu" role="menu">
                <button
                  type="button"
                  className="report-menu-item"
                  onClick={() => {
                    downloadSimulationReport(
                      {
                        modelName,
                        currency,
                        nodes,
                        edges,
                        result: simulationResult,
                      },
                      'html'
                    );
                    setReportMenuOpen(false);
                  }}
                >
                  <MdiIcon path={mdiFileDocumentOutline} size={15} />
                  <div>
                    <div className="report-menu-title">
                      Download HTML Report (.html)
                    </div>
                    <div className="report-menu-sub">
                      Standalone interactive report with embedded SVG chart
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="report-menu-item"
                  onClick={() => {
                    openPrintableReportWindow({
                      modelName,
                      currency,
                      nodes,
                      edges,
                      result: simulationResult,
                    });
                    setReportMenuOpen(false);
                  }}
                >
                  <MdiIcon path={mdiPrinterOutline} size={15} />
                  <div>
                    <div className="report-menu-title">
                      Open Printable / Save as PDF
                    </div>
                    <div className="report-menu-sub">
                      Opens formatted actuarial dossier ready for Print to PDF
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="report-menu-item"
                  onClick={() => {
                    downloadSimulationReport(
                      {
                        modelName,
                        currency,
                        nodes,
                        edges,
                        result: simulationResult,
                      },
                      'markdown'
                    );
                    setReportMenuOpen(false);
                  }}
                >
                  <MdiIcon path={mdiLanguageMarkdownOutline} size={15} />
                  <div>
                    <div className="report-menu-title">
                      Download Markdown (.md)
                    </div>
                    <div className="report-menu-sub">
                      Executive summary, percentiles, and tables for Confluence / GitHub
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className="report-menu-item"
                  onClick={() => {
                    downloadSimulationReport(
                      {
                        modelName,
                        currency,
                        nodes,
                        edges,
                        result: simulationResult,
                      },
                      'csv'
                    );
                    setReportMenuOpen(false);
                  }}
                >
                  <MdiIcon path={mdiFileDelimitedOutline} size={15} />
                  <div>
                    <div className="report-menu-title">
                      Download Spreadsheet (.csv)
                    </div>
                    <div className="report-menu-sub">
                      Percentiles, cost drivers, and histogram bins for Excel
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <section className="kpi-grid" aria-label="Budget percentiles">
        <div className="kpi-card kpi-p80-hero">
          <div className="kpi-tag">RECOMMENDED BUDGET (P80)</div>
          <div className="kpi-value">
            {formatCurrency(simulationResult.p80, currency)}
          </div>
          <div className="kpi-caption">
            80% of simulated project pathways complete at or below this budget
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-tag">MEDIAN (P50)</div>
          <div className="kpi-value">
            {formatCurrency(simulationResult.p50, currency)}
          </div>
          <div className="kpi-caption">50th percentile outcome</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-tag">EXPECTED MEAN</div>
          <div className="kpi-value">
            {formatCurrency(simulationResult.mean, currency)}
          </div>
          <div className="kpi-caption">
            Std Dev: ±{formatCurrency(simulationResult.stdDev, currency)}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-tag">CONSERVATIVE (P90 / P95)</div>
          <div className="kpi-value">
            {formatCurrency(simulationResult.p90, currency)}{' '}
            <span className="kpi-sub-val">
              / {formatCurrency(simulationResult.p95, currency)}
            </span>
          </div>
          <div className="kpi-caption">High-confidence contingency targets</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-tag">OBSERVED RANGE (MIN – MAX)</div>
          <div className="kpi-value">
            {formatCurrency(simulationResult.min, currency)} –{' '}
            {formatCurrency(simulationResult.max, currency)}
          </div>
          <div className="kpi-caption">
            P10 optimistic: {formatCurrency(simulationResult.p10, currency)}
          </div>
        </div>
      </section>

      {/* Histogram + CDF Chart */}
      <section className="chart-panel">
        <div className="chart-panel-header">
          <div>
            <h2>Cost Distribution &amp; Cumulative Probability</h2>
            <p className="chart-panel-sub">
              Prussian blue bars lie within the P80 budget ({formatCurrency(simulationResult.p80, currency)}); vermilion bars represent tail risk above P80.
            </p>
          </div>
          {hoveredBin && (
            <div className="chart-hover-readout">
              <strong>{hoveredBin.label}</strong> ·{' '}
              {hoveredBin.frequencyPct.toFixed(1)}% of trials (
              {hoveredBin.count.toLocaleString()}) · Cumulative:{' '}
              {hoveredBin.cumulativePct.toFixed(1)}%
            </div>
          )}
        </div>

        <div className="histogram-wrapper">
          <svg
            viewBox="0 0 920 300"
            className="histogram-svg"
            role="img"
            aria-label="Monte Carlo Cost Distribution Histogram"
          >
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = 240 - frac * 200;
              const pctLabel = `${Math.round(frac * maxFreqPct)}%`;
              const cdfLabel = `${Math.round(frac * 100)}%`;
              return (
                <g key={frac}>
                  <line
                    x1={55}
                    x2={865}
                    y1={y}
                    y2={y}
                    stroke="#e2dcd1"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={48}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fontFamily="'IBM Plex Mono', monospace"
                    fill="#6e685f"
                  >
                    {pctLabel}
                  </text>
                  <text
                    x={872}
                    y={y + 4}
                    textAnchor="start"
                    fontSize="10"
                    fontFamily="'IBM Plex Mono', monospace"
                    fill="#8c8578"
                  >
                    {cdfLabel}
                  </text>
                </g>
              );
            })}

            {/* P80 horizontal CDF reference at 80% */}
            <line
              x1={55}
              x2={865}
              y1={240 - 0.8 * 200}
              y2={240 - 0.8 * 200}
              stroke="#1d5c4b"
              strokeWidth={1.2}
              strokeDasharray="4 3"
              opacity={0.75}
            />

            {/* Bars */}
            {simulationResult.histogram.map((bin, idx) => {
              const count = simulationResult.histogram.length;
              const plotWidth = 810;
              const slotWidth = plotWidth / count;
              const barWidth = Math.max(8, slotWidth - 6);
              const x = 55 + idx * slotWidth + (slotWidth - barWidth) / 2;
              const barHeight = (bin.frequencyPct / maxFreqPct) * 200;
              const y = 240 - barHeight;
              const isAboveP80 =
                bin.minCost > simulationResult.p80 && !bin.containsP80;

              const fill = bin.containsP80
                ? '#1d5c4b'
                : isAboveP80
                  ? '#c44528'
                  : '#224b7a';

              return (
                <g
                  key={idx}
                  onMouseEnter={() => setHoveredBin(bin)}
                  onMouseLeave={() => setHoveredBin(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(2, barHeight)}
                    rx={1}
                    fill={fill}
                    opacity={hoveredBin === bin ? 1 : 0.86}
                  />
                  {bin.containsP80 && (
                    <g>
                      <line
                        x1={x + barWidth / 2}
                        x2={x + barWidth / 2}
                        y1={24}
                        y2={245}
                        stroke="#1d5c4b"
                        strokeWidth={1.75}
                        strokeDasharray="4 3"
                      />
                      <rect
                        x={Math.min(782, Math.max(60, x + barWidth / 2 - 54))}
                        y={6}
                        width={108}
                        height={21}
                        rx={2}
                        fill="#1d5c4b"
                      />
                      <text
                        x={Math.min(836, Math.max(114, x + barWidth / 2))}
                        y={20}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="'IBM Plex Mono', monospace"
                        fontWeight="600"
                        fill="#faf8f4"
                      >
                        P80: {formatCurrency(simulationResult.p80, currency)}
                      </text>
                    </g>
                  )}
                  {/* X-axis labels (sparse if many bins) */}
                  {(count <= 10 ||
                    idx === 0 ||
                    idx === count - 1 ||
                    idx % Math.ceil(count / 8) === 0) && (
                    <text
                      x={x + barWidth / 2}
                      y={262}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="'IBM Plex Mono', monospace"
                      fill="#57534a"
                    >
                      {formatCurrency(bin.minCost, currency)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Cumulative Distribution Line (CDF) */}
            {simulationResult.histogram.length > 1 && (
              <polyline
                fill="none"
                stroke="#181715"
                strokeWidth={2}
                points={simulationResult.histogram
                  .map((bin, idx) => {
                    const count = simulationResult.histogram.length;
                    const slotWidth = 810 / count;
                    const cx = 55 + idx * slotWidth + slotWidth / 2;
                    const cy = 240 - (bin.cumulativePct / 100) * 200;
                    return `${cx},${cy}`;
                  })
                  .join(' ')}
              />
            )}
          </svg>
        </div>
      </section>

      {((simulationResult.minPath?.steps.length ?? 0) > 0 ||
        (simulationResult.maxPath?.steps.length ?? 0) > 0) && (
        <section className="drivers-panel path-panel">
          <div className="chart-panel-header">
            <div>
              <h2>Minimum &amp; Maximum Spend Pathways</h2>
              <p className="chart-panel-sub">
                Lowest and highest total spend observed across Monte Carlo
                trials (augmented with a deterministic DAG walk of theoretical
                extremes).
              </p>
            </div>
          </div>
          <div className="path-grid">
            <PathCard
              title="Minimum Spend Path"
              accent="min"
              path={
                simulationResult.minPath ?? {
                  totalCost: 0,
                  capexTotal: 0,
                  opexTotal: 0,
                  steps: [],
                }
              }
              currency={currency}
            />
            <PathCard
              title="Maximum Spend Path"
              accent="max"
              path={
                simulationResult.maxPath ?? {
                  totalCost: 0,
                  capexTotal: 0,
                  opexTotal: 0,
                  steps: [],
                }
              }
              currency={currency}
            />
          </div>
        </section>
      )}

      {simulationResult.hasAdvancedOutcomes &&
        simulationResult.potBreakdowns.length > 0 && (
          <section className="drivers-panel">
            <div className="chart-panel-header">
              <div>
                <h2>Cost Pot Accumulators</h2>
                <p className="chart-panel-sub">
                  P50 / P80 / mean breakdown for each Advanced Outcome pot
                  across all trials.
                </p>
              </div>
            </div>
            <div className="drivers-table-wrap">
              <table className="drivers-table">
                <thead>
                  <tr>
                    <th>Pot</th>
                    <th>Mean</th>
                    <th>P50</th>
                    <th>P80</th>
                    <th>P90</th>
                    <th>Min – Max</th>
                  </tr>
                </thead>
                <tbody>
                  {simulationResult.potBreakdowns.map((p) => (
                    <tr key={p.potId}>
                      <td className="td-question">{p.label}</td>
                      <td>{formatCurrency(p.mean, currency)}</td>
                      <td>{formatCurrency(p.p50, currency)}</td>
                      <td className="td-expected">
                        {formatCurrency(p.p80, currency)}
                      </td>
                      <td>{formatCurrency(p.p90, currency)}</td>
                      <td>
                        {formatCurrency(p.min, currency)} –{' '}
                        {formatCurrency(p.max, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {simulationResult.capexOpex.enabled && (
        <section className="kpi-grid capex-opex-kpis" aria-label="Capex and Opex">
          <div className="kpi-card">
            <div className="kpi-tag">CAPEX P80 / MEAN</div>
            <div className="kpi-value">
              {formatCurrency(simulationResult.capexOpex.capexP80, currency)}
            </div>
            <div className="kpi-caption">
              Mean {formatCurrency(simulationResult.capexOpex.capexMean, currency)} · P50{' '}
              {formatCurrency(simulationResult.capexOpex.capexP50, currency)}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-tag">OPEX P80 / MEAN (5YR HORIZON)</div>
            <div className="kpi-value">
              {formatCurrency(simulationResult.capexOpex.opexP80, currency)}
            </div>
            <div className="kpi-caption">
              Mean {formatCurrency(simulationResult.capexOpex.opexMean, currency)} · P50{' '}
              {formatCurrency(simulationResult.capexOpex.opexP50, currency)}
            </div>
          </div>
        </section>
      )}

      {simulationResult.impactYearsEnabled &&
        simulationResult.yearBreakdowns.length > 0 && (
          <section className="chart-panel">
            <div className="chart-panel-header">
              <div>
                <h2>Multi-Year Budget Phasing (P80 &amp; Expected Spend by Year)</h2>
                <p className="chart-panel-sub">
                  Capex lands in each Question&apos;s Impact Year. Opex compounds
                  annually for five years from that year.
                </p>
              </div>
            </div>
            <YearPhasingChart
              years={simulationResult.yearBreakdowns}
              currency={currency}
            />
            <div className="drivers-table-wrap">
              <table className="drivers-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Expected Capex</th>
                    <th>Expected Opex</th>
                    <th>Mean Total</th>
                    <th>P50</th>
                    <th>P80</th>
                    <th>P90</th>
                  </tr>
                </thead>
                <tbody>
                  {simulationResult.yearBreakdowns.map((y) => (
                    <tr key={y.year}>
                      <td className="td-question">Year {y.year}</td>
                      <td>{formatCurrency(y.expectedCapex, currency)}</td>
                      <td>{formatCurrency(y.expectedOpex, currency)}</td>
                      <td>{formatCurrency(y.mean, currency)}</td>
                      <td>{formatCurrency(y.p50, currency)}</td>
                      <td className="td-expected">
                        {formatCurrency(y.p80, currency)}
                      </td>
                      <td>{formatCurrency(y.p90, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {/* Cost Drivers Breakdown */}
      <section className="drivers-panel">
        <div className="chart-panel-header">
          <div>
            <h2>Cost Drivers & Pathway Sensitivity</h2>
            <p className="chart-panel-sub">
              Questions and outcomes ranked by their expected contribution to
              the total project cost across all simulated runs.
            </p>
          </div>
        </div>

        <div className="drivers-table-wrap">
          <table className="drivers-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Outcome Branch</th>
                <th>Branch Prob</th>
                <th>Pathway Cost</th>
                <th>Trigger Rate in Sim</th>
                <th>Expected Cost Contribution</th>
              </tr>
            </thead>
            <tbody>
              {simulationResult.outcomeDrivers.map((d) => (
                <tr key={d.outcomeId}>
                  <td className="td-question">{d.questionLabel}</td>
                  <td className="td-outcome">
                    <div>
                      {d.outcomeLabel}
                      {d.isAdvanced && (
                        <span className="adv-mode-chip">ADV</span>
                      )}
                    </div>
                    {d.outcomeDescription && (
                      <div className="td-outcome-desc">
                        {d.outcomeDescription}
                      </div>
                    )}
                  </td>
                  <td>{d.configuredProbPct}%</td>
                  <td>{formatCurrency(d.cost, currency)}</td>
                  <td>
                    <div className="hit-rate-cell">
                      <div className="hit-rate-bar-bg">
                        <div
                          className="hit-rate-bar-fill"
                          style={{ width: `${Math.min(100, d.hitRatePct)}%` }}
                        />
                      </div>
                      <span>{d.hitRatePct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="td-expected">
                    {formatCurrency(d.expectedCostContribution, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function PathCard({
  title,
  accent,
  path,
  currency,
}: {
  title: string;
  accent: 'min' | 'max';
  path: PathTrace;
  currency: CurrencyCode;
}) {
  return (
    <div className={`path-card path-card-${accent}`}>
      <div className="path-card-header">
        <h3>{title}</h3>
        <strong>{formatCurrency(path.totalCost, currency)}</strong>
      </div>
      <div className="path-card-meta">
        Capex {formatCurrency(path.capexTotal, currency)} · Opex{' '}
        {formatCurrency(path.opexTotal, currency)}
      </div>
      {path.steps.length === 0 ? (
        <p className="sidebar-hint">No pathway recorded.</p>
      ) : (
        <ol className="path-step-list">
          {path.steps.map((step, idx) => (
            <li key={`${step.questionId}-${step.outcomeId}-${idx}`}>
              <div className="path-step-q">{step.questionLabel}</div>
              <div className="path-step-o">
                {step.outcomeLabel} ({step.probabilityPct}%) · Year{' '}
                {step.impactYear} · {formatCurrency(step.cost, currency)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function YearPhasingChart({
  years,
  currency,
}: {
  years: YearBreakdownStat[];
  currency: CurrencyCode;
}) {
  const maxVal = Math.max(
    1,
    ...years.map((y) => y.expectedCapex + y.expectedOpex),
    ...years.map((y) => y.p80)
  );
  const width = 920;
  const height = 240;
  const plotLeft = 55;
  const plotRight = 865;
  const plotBottom = 190;
  const plotTop = 20;
  const plotH = plotBottom - plotTop;
  const slot = (plotRight - plotLeft) / Math.max(1, years.length);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="histogram-svg year-phasing-svg"
      role="img"
      aria-label="Capex versus Opex by year"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = plotBottom - frac * plotH;
        return (
          <g key={frac}>
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={y}
              y2={y}
              stroke="#e2dcd1"
              strokeDasharray="3 3"
            />
            <text
              x={plotLeft - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fontFamily="'IBM Plex Mono', monospace"
              fill="#6e685f"
            >
              {formatCurrency(frac * maxVal, currency)}
            </text>
          </g>
        );
      })}
      {years.map((yr, idx) => {
        const x = plotLeft + idx * slot + slot * 0.18;
        const barW = slot * 0.64;
        const capH = (yr.expectedCapex / maxVal) * plotH;
        const opexH = (yr.expectedOpex / maxVal) * plotH;
        const p80Y = plotBottom - (yr.p80 / maxVal) * plotH;
        return (
          <g key={yr.year}>
            <rect
              x={x}
              y={plotBottom - capH}
              width={barW}
              height={Math.max(0, capH)}
              fill="#224b7a"
            />
            <rect
              x={x}
              y={plotBottom - capH - opexH}
              width={barW}
              height={Math.max(0, opexH)}
              fill="#a66a12"
            />
            <circle cx={x + barW / 2} cy={p80Y} r={3.5} fill="#1d5c4b" />
            <text
              x={x + barW / 2}
              y={plotBottom + 16}
              textAnchor="middle"
              fontSize="10"
              fontFamily="'IBM Plex Mono', monospace"
              fill="#57534a"
            >
              Y{yr.year}
            </text>
          </g>
        );
      })}
      <text x={plotLeft} y={228} fontSize="10" fill="#224b7a" fontFamily="'IBM Plex Sans', sans-serif">
        Capex
      </text>
      <text x={plotLeft + 58} y={228} fontSize="10" fill="#a66a12" fontFamily="'IBM Plex Sans', sans-serif">
        Opex
      </text>
      <text x={plotLeft + 110} y={228} fontSize="10" fill="#1d5c4b" fontFamily="'IBM Plex Sans', sans-serif">
        ● P80
      </text>
    </svg>
  );
}
