import {
  formatCurrency,
  isOutcomeNodeType,
  type AnyOutcomeFlowNode,
  type CurrencyCode,
  type ModelEdge,
  type ModelNode,
  type PathTrace,
  type QuestionFlowNode,
  type SimulationResult,
} from '../types/model';

export type ReportFormat = 'html' | 'markdown' | 'csv';

interface ReportContext {
  modelName: string;
  currency: CurrencyCode;
  nodes: ModelNode[];
  edges: ModelEdge[];
  result: SimulationResult;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'mc-project-report'
  );
}

function triggerBlobDownload(
  content: string,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderHistogramSvg(
  result: SimulationResult,
  currency: CurrencyCode
): string {
  const maxFreqPct = Math.max(
    1,
    ...result.histogram.map((b) => b.frequencyPct)
  );
  const count = result.histogram.length;
  const plotWidth = 810;
  const slotWidth = count > 0 ? plotWidth / count : plotWidth;
  const barWidth = Math.max(8, slotWidth - 6);

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((frac) => {
      const y = 240 - frac * 200;
      const pctLabel = `${Math.round(frac * maxFreqPct)}%`;
      const cdfLabel = `${Math.round(frac * 100)}%`;
      return `
        <g>
          <line x1="55" x2="865" y1="${y}" y2="${y}" stroke="#e2dcd1" stroke-dasharray="3 3" />
          <text x="48" y="${y + 4}" text-anchor="end" font-size="10" font-family="'IBM Plex Mono', monospace" fill="#6e685f">${pctLabel}</text>
          <text x="872" y="${y + 4}" text-anchor="start" font-size="10" font-family="'IBM Plex Mono', monospace" fill="#8c8578">${cdfLabel}</text>
        </g>`;
    })
    .join('');

  const p80Y = 240 - 0.8 * 200;

  const bars = result.histogram
    .map((bin, idx) => {
      const x = 55 + idx * slotWidth + (slotWidth - barWidth) / 2;
      const barHeight = (bin.frequencyPct / maxFreqPct) * 200;
      const y = 240 - barHeight;
      const isAboveP80 = bin.minCost > result.p80 && !bin.containsP80;
      const fill = bin.containsP80
        ? '#1d5c4b'
        : isAboveP80
          ? '#c44528'
          : '#224b7a';

      const showXLabel =
        count <= 10 ||
        idx === 0 ||
        idx === count - 1 ||
        idx % Math.ceil(count / 8) === 0;

      const p80Callout = bin.containsP80
        ? `
          <line x1="${x + barWidth / 2}" x2="${x + barWidth / 2}" y1="24" y2="245" stroke="#1d5c4b" stroke-width="1.75" stroke-dasharray="4 3" />
          <rect x="${Math.min(782, Math.max(60, x + barWidth / 2 - 54))}" y="6" width="108" height="21" rx="2" fill="#1d5c4b" />
          <text x="${Math.min(836, Math.max(114, x + barWidth / 2))}" y="20" text-anchor="middle" font-size="10" font-family="'IBM Plex Mono', monospace" font-weight="600" fill="#faf8f4">P80: ${escapeHtml(formatCurrency(result.p80, currency))}</text>`
        : '';

      const xAxisLabel = showXLabel
        ? `<text x="${x + barWidth / 2}" y="262" text-anchor="middle" font-size="10" font-family="'IBM Plex Mono', monospace" fill="#57534a">${escapeHtml(formatCurrency(bin.minCost, currency))}</text>`
        : '';

      return `
        <g>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(2, barHeight)}" rx="1" fill="${fill}" opacity="0.88" />
          ${p80Callout}
          ${xAxisLabel}
        </g>`;
    })
    .join('');

  const cdfPoints = result.histogram
    .map((bin, idx) => {
      const cx = 55 + idx * slotWidth + slotWidth / 2;
      const cy = 240 - (bin.cumulativePct / 100) * 200;
      return `${cx},${cy}`;
    })
    .join(' ');

  const cdfPolyline =
    result.histogram.length > 1
      ? `<polyline fill="none" stroke="#181715" stroke-width="2" points="${cdfPoints}" />`
      : '';

  return `<svg viewBox="0 0 920 280" width="100%" role="img" aria-label="Monte Carlo Cost Distribution Histogram">
    ${gridLines}
    <line x1="55" x2="865" y1="${p80Y}" y2="${p80Y}" stroke="#1d5c4b" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.75" />
    ${bars}
    ${cdfPolyline}
  </svg>`;
}

export function generateHtmlReport(ctx: ReportContext): string {
  const { modelName, currency, nodes, edges, result } = ctx;
  const generatedDate = new Date(result.timestamp).toLocaleString('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const contingencyOverMedian = Math.max(0, result.p80 - result.p50);
  const contingencyOverMean = Math.max(0, result.p80 - result.mean);

  const questions = nodes.filter(
    (n): n is QuestionFlowNode => n.type === 'question'
  );
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const questionStructureRows = questions
    .map((q) => {
      const outcomeEdges = edges.filter(
        (e) => e.source === q.id && e.data?.kind === 'question-to-outcome'
      );
      const outcomes = outcomeEdges
        .map((e) => nodeMap.get(e.target))
        .filter(
          (o): o is AnyOutcomeFlowNode =>
            o != null && isOutcomeNodeType(o.type)
        );

      const aggregateTargets = edges
        .filter(
          (e) =>
            e.source === q.id &&
            (e.data?.kind === 'question-to-question' ||
              e.data?.kind === 'question-to-end')
        )
        .map((e) => nodeMap.get(e.target)?.data.label ?? e.target);

      const outcomeItems = outcomes
        .map((o) => {
          const nextTargets = edges
            .filter((e) => e.source === o.id)
            .map((e) => nodeMap.get(e.target)?.data.label ?? e.target);
          const nextRouting =
            nextTargets.length > 0
              ? `→ ${nextTargets.join(', ')}`
              : aggregateTargets.length > 0
                ? `→ (Aggregate) ${aggregateTargets.join(', ')}`
                : '→ Terminal';
          const costLabel =
            o.type === 'advanced-outcome' ? 'adv. est. ' : '+';
          return `<li><strong>${escapeHtml(o.data.label)}</strong> (${o.data.probabilityPct}% · ${costLabel}${escapeHtml(formatCurrency(o.data.cost, currency))}${o.type === 'advanced-outcome' ? ' · advanced' : ''}) <span class="routing">${escapeHtml(nextRouting)}</span>${o.data.description ? `<div class="desc">${escapeHtml(o.data.description)}</div>` : ''}</li>`;
        })
        .join('');

      return `
        <div class="q-block">
          <div class="q-title">${escapeHtml(q.data.label)}</div>
          ${q.data.description ? `<div class="q-desc">${escapeHtml(q.data.description)}</div>` : ''}
          <ul class="q-outcomes">${outcomeItems}</ul>
        </div>`;
    })
    .join('');

  const pathHtml = (title: string, path: PathTrace) => `
      <div class="path-block">
        <div class="q-title">${escapeHtml(title)} — ${escapeHtml(formatCurrency(path.totalCost, currency))}</div>
        <div class="desc">Capex ${escapeHtml(formatCurrency(path.capexTotal, currency))} · Opex ${escapeHtml(formatCurrency(path.opexTotal, currency))}</div>
        <ol class="q-outcomes">
          ${path.steps
            .map(
              (s) =>
                `<li><strong>${escapeHtml(s.questionLabel)}</strong> → ${escapeHtml(s.outcomeLabel)} (${s.probabilityPct}%, Year ${s.impactYear}) · ${escapeHtml(formatCurrency(s.cost, currency))}</li>`
            )
            .join('')}
        </ol>
      </div>`;

  const potRows = result.potBreakdowns
    .map(
      (p) => `
      <tr>
        <td><strong>${escapeHtml(p.label)}</strong></td>
        <td class="num">${escapeHtml(formatCurrency(p.mean, currency))}</td>
        <td class="num">${escapeHtml(formatCurrency(p.p50, currency))}</td>
        <td class="num expected">${escapeHtml(formatCurrency(p.p80, currency))}</td>
        <td class="num">${escapeHtml(formatCurrency(p.p90, currency))}</td>
        <td class="num">${escapeHtml(formatCurrency(p.min, currency))} – ${escapeHtml(formatCurrency(p.max, currency))}</td>
      </tr>`
    )
    .join('');

  const yearRows = result.yearBreakdowns
    .map(
      (y) => `
      <tr>
        <td>Year ${y.year}</td>
        <td class="num">${escapeHtml(formatCurrency(y.expectedCapex, currency))}</td>
        <td class="num">${escapeHtml(formatCurrency(y.expectedOpex, currency))}</td>
        <td class="num">${escapeHtml(formatCurrency(y.mean, currency))}</td>
        <td class="num">${escapeHtml(formatCurrency(y.p50, currency))}</td>
        <td class="num expected">${escapeHtml(formatCurrency(y.p80, currency))}</td>
        <td class="num">${escapeHtml(formatCurrency(y.p90, currency))}</td>
      </tr>`
    )
    .join('');

  const extraSections = `
    <h2>Minimum &amp; Maximum Spend Pathways</h2>
    <div class="q-grid">
      ${pathHtml('Minimum Spend Path', result.minPath)}
      ${pathHtml('Maximum Spend Path', result.maxPath)}
    </div>
    ${
      result.hasAdvancedOutcomes && potRows
        ? `<h2>Cost Pot Accumulators</h2>
    <table>
      <thead><tr><th>Pot</th><th>Mean</th><th>P50</th><th>P80</th><th>P90</th><th>Min – Max</th></tr></thead>
      <tbody>${potRows}</tbody>
    </table>`
        : ''
    }
    ${
      result.capexOpex.enabled
        ? `<h2>Capex &amp; Opex Summary</h2>
    <table>
      <thead><tr><th>Category</th><th>Mean</th><th>P50</th><th>P80</th></tr></thead>
      <tbody>
        <tr><td>Capex</td><td class="num">${escapeHtml(formatCurrency(result.capexOpex.capexMean, currency))}</td><td class="num">${escapeHtml(formatCurrency(result.capexOpex.capexP50, currency))}</td><td class="num expected">${escapeHtml(formatCurrency(result.capexOpex.capexP80, currency))}</td></tr>
        <tr><td>Opex (5-year horizon)</td><td class="num">${escapeHtml(formatCurrency(result.capexOpex.opexMean, currency))}</td><td class="num">${escapeHtml(formatCurrency(result.capexOpex.opexP50, currency))}</td><td class="num expected">${escapeHtml(formatCurrency(result.capexOpex.opexP80, currency))}</td></tr>
      </tbody>
    </table>`
        : ''
    }
    ${
      result.impactYearsEnabled && yearRows
        ? `<h2>Multi-Year Budget Phasing</h2>
    <table>
      <thead><tr><th>Year</th><th>Expected Capex</th><th>Expected Opex</th><th>Mean</th><th>P50</th><th>P80</th><th>P90</th></tr></thead>
      <tbody>${yearRows}</tbody>
    </table>`
        : ''
    }
  `;

  const driverRows = result.outcomeDrivers
    .map(
      (d) => `
      <tr>
        <td><strong>${escapeHtml(d.questionLabel)}</strong></td>
        <td>
          <div class="outcome-name">${escapeHtml(d.outcomeLabel)}</div>
          ${d.outcomeDescription ? `<div class="desc">${escapeHtml(d.outcomeDescription)}</div>` : ''}
        </td>
        <td class="num">${d.configuredProbPct}%</td>
        <td class="num">${escapeHtml(formatCurrency(d.cost, currency))}</td>
        <td class="num">${d.hitRatePct.toFixed(1)}%</td>
        <td class="num expected">${escapeHtml(formatCurrency(d.expectedCostContribution, currency))}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(modelName)} — Monte Carlo Budget Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-page: #f4f1ea;
      --bg-card: #ffffff;
      --ink: #181715;
      --muted: #6e685f;
      --border: #c7bfb0;
      --forest: #1d5c4b;
      --cobalt: #224b7a;
      --vermilion: #c44528;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 36px 24px 64px;
      background: var(--bg-page);
      color: var(--ink);
      font-family: 'IBM Plex Sans', -apple-system, sans-serif;
      line-height: 1.5;
    }
    .sheet {
      max-width: 1040px;
      margin: 0 auto;
      background: #faf8f4;
      border: 1.5px solid var(--ink);
      box-shadow: 6px 6px 0 var(--ink);
      padding: 40px 44px;
    }
    .masthead {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--ink);
      padding-bottom: 18px;
      margin-bottom: 24px;
    }
    .kicker {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--vermilion);
      font-weight: 600;
      margin-bottom: 6px;
    }
    h1 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 30px;
      margin: 0 0 6px;
      letter-spacing: -0.02em;
    }
    .meta {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11.5px;
      color: var(--muted);
    }
    .print-btn {
      font-family: 'IBM Plex Mono', monospace;
      background: var(--ink);
      color: #faf8f4;
      border: none;
      padding: 8px 14px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: 1.4fr repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 26px;
    }
    .kpi {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-top: 3px solid var(--ink);
      padding: 14px;
    }
    .kpi.p80 {
      background: #f3f8f6;
      border: 1.5px solid var(--forest);
      border-top: 4px solid var(--forest);
      box-shadow: 3px 3px 0 var(--forest);
    }
    .kpi-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .kpi.p80 .kpi-label { color: var(--forest); font-weight: 600; }
    .kpi-val {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 21px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .kpi.p80 .kpi-val { font-size: 27px; color: var(--forest); }
    .kpi-sub { font-size: 11px; color: var(--muted); }
    .exec-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-left: 4px solid var(--forest);
      padding: 14px 18px;
      margin-bottom: 26px;
      font-size: 13.5px;
    }
    h2 {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 20px;
      margin: 28px 0 10px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .chart-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 18px;
      margin-bottom: 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-card);
      border: 1px solid var(--border);
      font-size: 12.5px;
    }
    th, td {
      text-align: left;
      padding: 9px 11px;
      border-bottom: 1px solid #e6e0d5;
    }
    th {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      border-bottom: 1.5px solid var(--ink);
      background: #f5f2eb;
    }
    td.num {
      font-family: 'IBM Plex Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
    td.expected { color: var(--forest); font-weight: 600; }
    .outcome-name { color: var(--cobalt); font-weight: 600; }
    .desc { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .q-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .q-block {
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 14px;
    }
    .q-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    .q-desc { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .q-outcomes { margin: 0; padding-left: 18px; font-size: 12px; }
    .q-outcomes li { margin-bottom: 6px; }
    .routing { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted); }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border: none; padding: 12px; max-width: 100%; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="masthead">
      <div>
        <div class="kicker">Actuarial Project Finance Estimation Report</div>
        <h1>${escapeHtml(modelName)}</h1>
        <div class="meta">Generated: ${escapeHtml(generatedDate)} · Monte Carlo Trials: ${result.trials.toLocaleString()} · Currency: ${currency}</div>
      </div>
      <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
    </header>

    <div class="exec-box">
      <strong>Executive Budget Recommendation:</strong> At the <strong>80th confidence percentile (P80)</strong>, the recommended project budget is <strong>${escapeHtml(formatCurrency(result.p80, currency))}</strong>. This includes a risk-adjusted contingency buffer of <strong>${escapeHtml(formatCurrency(contingencyOverMedian, currency))}</strong> above the median (P50) estimate of ${escapeHtml(formatCurrency(result.p50, currency))} (and <strong>${escapeHtml(formatCurrency(contingencyOverMean, currency))}</strong> above the expected mean of ${escapeHtml(formatCurrency(result.mean, currency))}).
    </div>

    <section class="kpi-grid">
      <div class="kpi p80">
        <div class="kpi-label">Recommended Budget (P80)</div>
        <div class="kpi-val">${escapeHtml(formatCurrency(result.p80, currency))}</div>
        <div class="kpi-sub">80% confidence threshold</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Median (P50)</div>
        <div class="kpi-val">${escapeHtml(formatCurrency(result.p50, currency))}</div>
        <div class="kpi-sub">50th percentile outcome</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Expected Mean</div>
        <div class="kpi-val">${escapeHtml(formatCurrency(result.mean, currency))}</div>
        <div class="kpi-sub">Std Dev: ±${escapeHtml(formatCurrency(result.stdDev, currency))}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Conservative (P90 / P95)</div>
        <div class="kpi-val">${escapeHtml(formatCurrency(result.p90, currency))}</div>
        <div class="kpi-sub">P95: ${escapeHtml(formatCurrency(result.p95, currency))}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Observed Range</div>
        <div class="kpi-val">${escapeHtml(formatCurrency(result.min, currency))} – ${escapeHtml(formatCurrency(result.max, currency))}</div>
        <div class="kpi-sub">P10: ${escapeHtml(formatCurrency(result.p10, currency))}</div>
      </div>
    </section>

    <h2>Cost Distribution &amp; Cumulative Probability</h2>
    <div class="chart-box">
      ${renderHistogramSvg(result, currency)}
    </div>

    ${extraSections}

    <h2>Cost Drivers &amp; Pathway Sensitivity</h2>
    <table>
      <thead>
        <tr>
          <th>Question</th>
          <th>Outcome Branch</th>
          <th>Branch Prob</th>
          <th>Pathway Cost</th>
          <th>Trigger Rate</th>
          <th>Expected Contribution</th>
        </tr>
      </thead>
      <tbody>
        ${driverRows}
      </tbody>
    </table>

    <h2>Decision DAG Specification (${questions.length} Questions)</h2>
    <div class="q-grid">
      ${questionStructureRows}
    </div>
  </div>
</body>
</html>`;
}

export function generateMarkdownReport(ctx: ReportContext): string {
  const { modelName, currency, nodes, edges, result } = ctx;
  const generatedDate = new Date(result.timestamp).toISOString();
  const contingencyOverMedian = Math.max(0, result.p80 - result.p50);

  const lines: string[] = [
    `# ${modelName} — Monte Carlo Budget Report`,
    ``,
    `- **Generated**: ${generatedDate}`,
    `- **Simulation Trials**: ${result.trials.toLocaleString()}`,
    `- **Currency**: ${currency}`,
    ``,
    `## Executive Summary`,
    ``,
    `**Recommended P80 Budget**: **${formatCurrency(result.p80, currency)}** (includes **${formatCurrency(contingencyOverMedian, currency)}** risk contingency above the P50 median of ${formatCurrency(result.p50, currency)}).`,
    ``,
    `| Metric | Value |`,
    `| :--- | :--- |`,
    `| **P80 (Recommended Budget)** | **${formatCurrency(result.p80, currency)}** |`,
    `| P50 (Median) | ${formatCurrency(result.p50, currency)} |`,
    `| Expected Mean | ${formatCurrency(result.mean, currency)} |`,
    `| Standard Deviation | ±${formatCurrency(result.stdDev, currency)} |`,
    `| P10 (Optimistic) | ${formatCurrency(result.p10, currency)} |`,
    `| P90 (Conservative) | ${formatCurrency(result.p90, currency)} |`,
    `| P95 (Extreme Tail) | ${formatCurrency(result.p95, currency)} |`,
    `| Min – Max Observed | ${formatCurrency(result.min, currency)} – ${formatCurrency(result.max, currency)} |`,
    ``,
    `## Minimum & Maximum Spend Pathways`,
    ``,
    `### Minimum Spend Path — ${formatCurrency(result.minPath.totalCost, currency)}`,
    ``,
    ...result.minPath.steps.map(
      (s) =>
        `- **${s.questionLabel}** → ${s.outcomeLabel} (${s.probabilityPct}%, Year ${s.impactYear}) · ${formatCurrency(s.cost, currency)}`
    ),
    ``,
    `### Maximum Spend Path — ${formatCurrency(result.maxPath.totalCost, currency)}`,
    ``,
    ...result.maxPath.steps.map(
      (s) =>
        `- **${s.questionLabel}** → ${s.outcomeLabel} (${s.probabilityPct}%, Year ${s.impactYear}) · ${formatCurrency(s.cost, currency)}`
    ),
    ``,
  ];

  if (result.hasAdvancedOutcomes && result.potBreakdowns.length > 0) {
    lines.push(`## Cost Pot Accumulators`, ``);
    lines.push(`| Pot | Mean | P50 | P80 | P90 | Min | Max |`);
    lines.push(`| :--- | ---: | ---: | ---: | ---: | ---: | ---: |`);
    for (const p of result.potBreakdowns) {
      lines.push(
        `| ${p.label} | ${formatCurrency(p.mean, currency)} | ${formatCurrency(p.p50, currency)} | ${formatCurrency(p.p80, currency)} | ${formatCurrency(p.p90, currency)} | ${formatCurrency(p.min, currency)} | ${formatCurrency(p.max, currency)} |`
      );
    }
    lines.push(``);
  }

  if (result.capexOpex.enabled) {
    lines.push(
      `## Capex & Opex`,
      ``,
      `| Category | Mean | P50 | P80 |`,
      `| :--- | ---: | ---: | ---: |`,
      `| Capex | ${formatCurrency(result.capexOpex.capexMean, currency)} | ${formatCurrency(result.capexOpex.capexP50, currency)} | ${formatCurrency(result.capexOpex.capexP80, currency)} |`,
      `| Opex | ${formatCurrency(result.capexOpex.opexMean, currency)} | ${formatCurrency(result.capexOpex.opexP50, currency)} | ${formatCurrency(result.capexOpex.opexP80, currency)} |`,
      ``
    );
  }

  if (result.impactYearsEnabled && result.yearBreakdowns.length > 0) {
    lines.push(
      `## Multi-Year Budget Phasing`,
      ``,
      `| Year | Expected Capex | Expected Opex | Mean | P50 | P80 | P90 |`,
      `| :--- | ---: | ---: | ---: | ---: | ---: | ---: |`
    );
    for (const y of result.yearBreakdowns) {
      lines.push(
        `| Year ${y.year} | ${formatCurrency(y.expectedCapex, currency)} | ${formatCurrency(y.expectedOpex, currency)} | ${formatCurrency(y.mean, currency)} | ${formatCurrency(y.p50, currency)} | ${formatCurrency(y.p80, currency)} | ${formatCurrency(y.p90, currency)} |`
      );
    }
    lines.push(``);
  }

  lines.push(
    `## Cost Drivers & Pathway Sensitivity`,
    ``,
    `| Question | Outcome Branch | Description | Branch Prob | Pathway Cost | Sim Trigger Rate | Expected Cost Contribution |`,
    `| :--- | :--- | :--- | ---: | ---: | ---: | ---: |`
  );

  for (const d of result.outcomeDrivers) {
    lines.push(
      `| ${d.questionLabel} | ${d.outcomeLabel} | ${d.outcomeDescription || '—'} | ${d.configuredProbPct}% | ${formatCurrency(d.cost, currency)} | ${d.hitRatePct.toFixed(1)}% | ${formatCurrency(d.expectedCostContribution, currency)} |`
    );
  }

  lines.push(``, `## Cost Distribution Histogram`, ``);
  lines.push(
    `| Bucket Range | Trial Count | Frequency (%) | Cumulative (%) | P80 Bucket |`
  );
  lines.push(`| :--- | ---: | ---: | ---: | :---: |`);
  for (const b of result.histogram) {
    lines.push(
      `| ${b.label} | ${b.count.toLocaleString()} | ${b.frequencyPct.toFixed(2)}% | ${b.cumulativePct.toFixed(2)}% | ${b.containsP80 ? '✓ P80' : ''} |`
    );
  }

  lines.push(``, `## Decision DAG Structure`, ``);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const questions = nodes.filter(
    (n): n is QuestionFlowNode => n.type === 'question'
  );
  for (const q of questions) {
    lines.push(`### ${q.data.label}`);
    if (q.data.description) {
      lines.push(`${q.data.description}`);
    }
    const outcomeEdges = edges.filter(
      (e) => e.source === q.id && e.data?.kind === 'question-to-outcome'
    );
    for (const oe of outcomeEdges) {
      const o = nodeMap.get(oe.target);
      if (!o || !isOutcomeNodeType(o.type)) continue;
      const outcome = o as AnyOutcomeFlowNode;
      lines.push(
        `- **${outcome.data.label}** (${outcome.data.probabilityPct}%, +${formatCurrency(outcome.data.cost, currency)}${outcome.type === 'advanced-outcome' ? ', advanced' : ''})${outcome.data.description ? ` — _${outcome.data.description}_` : ''}`
      );
    }
    lines.push(``);
  }

  return lines.join('\n');
}

function csvCell(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateCsvReport(ctx: ReportContext): string {
  const { modelName, currency, result } = ctx;
  const rows: (string | number)[][] = [
    ['Project Model', modelName],
    ['Currency', currency],
    ['Simulation Trials', result.trials],
    ['Generated Timestamp', new Date(result.timestamp).toISOString()],
    [],
    ['SUMMARY METRICS', 'AMOUNT'],
    ['Recommended Budget (P80)', Math.round(result.p80)],
    ['Median (P50)', Math.round(result.p50)],
    ['Expected Mean', Math.round(result.mean)],
    ['Standard Deviation', Math.round(result.stdDev)],
    ['Optimistic (P10)', Math.round(result.p10)],
    ['Conservative (P90)', Math.round(result.p90)],
    ['Extreme Tail (P95)', Math.round(result.p95)],
    ['Minimum Observed', Math.round(result.min)],
    ['Maximum Observed', Math.round(result.max)],
    ['Min Path Total', Math.round(result.minPath.totalCost)],
    ['Max Path Total', Math.round(result.maxPath.totalCost)],
    [],
    [
      'COST DRIVERS',
      'OUTCOME BRANCH',
      'DESCRIPTION',
      'CONFIGURED PROB (%)',
      'PATHWAY COST',
      'SIMULATION HIT COUNT',
      'SIMULATION TRIGGER RATE (%)',
      'EXPECTED COST CONTRIBUTION',
    ],
  ];

  for (const d of result.outcomeDrivers) {
    rows.push([
      d.questionLabel,
      d.outcomeLabel,
      d.outcomeDescription ?? '',
      d.configuredProbPct,
      d.cost,
      d.hitCount,
      Number(d.hitRatePct.toFixed(2)),
      Math.round(d.expectedCostContribution),
    ]);
  }

  rows.push([]);
  rows.push([
    'HISTOGRAM BIN MIN',
    'HISTOGRAM BIN MAX',
    'LABEL',
    'TRIAL COUNT',
    'FREQUENCY (%)',
    'CUMULATIVE (%)',
    'CONTAINS P80',
  ]);

  for (const b of result.histogram) {
    rows.push([
      Math.round(b.minCost),
      Math.round(b.maxCost),
      b.label,
      b.count,
      Number(b.frequencyPct.toFixed(2)),
      Number(b.cumulativePct.toFixed(2)),
      b.containsP80 ? 'YES' : 'NO',
    ]);
  }

  if (result.potBreakdowns.length > 0) {
    rows.push([]);
    rows.push(['COST POTS', 'MEAN', 'P50', 'P80', 'P90', 'MIN', 'MAX']);
    for (const p of result.potBreakdowns) {
      rows.push([
        p.label,
        Math.round(p.mean),
        Math.round(p.p50),
        Math.round(p.p80),
        Math.round(p.p90),
        Math.round(p.min),
        Math.round(p.max),
      ]);
    }
  }

  if (result.yearBreakdowns.length > 0) {
    rows.push([]);
    rows.push([
      'YEAR',
      'EXPECTED CAPEX',
      'EXPECTED OPEX',
      'MEAN',
      'P50',
      'P80',
      'P90',
    ]);
    for (const y of result.yearBreakdowns) {
      rows.push([
        y.year,
        Math.round(y.expectedCapex),
        Math.round(y.expectedOpex),
        Math.round(y.mean),
        Math.round(y.p50),
        Math.round(y.p80),
        Math.round(y.p90),
      ]);
    }
  }

  if (result.minPath.steps.length > 0) {
    rows.push([]);
    rows.push(['MIN PATH STEP', 'QUESTION', 'OUTCOME', 'PROB %', 'YEAR', 'COST']);
    result.minPath.steps.forEach((s, i) => {
      rows.push([
        i + 1,
        s.questionLabel,
        s.outcomeLabel,
        s.probabilityPct,
        s.impactYear,
        Math.round(s.cost),
      ]);
    });
  }
  if (result.maxPath.steps.length > 0) {
    rows.push([]);
    rows.push(['MAX PATH STEP', 'QUESTION', 'OUTCOME', 'PROB %', 'YEAR', 'COST']);
    result.maxPath.steps.forEach((s, i) => {
      rows.push([
        i + 1,
        s.questionLabel,
        s.outcomeLabel,
        s.probabilityPct,
        s.impactYear,
        Math.round(s.cost),
      ]);
    });
  }

  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export function downloadSimulationReport(
  ctx: ReportContext,
  format: ReportFormat
) {
  const baseSlug = slugify(ctx.modelName);
  if (format === 'html') {
    const html = generateHtmlReport(ctx);
    triggerBlobDownload(
      html,
      `${baseSlug}-report.html`,
      'text/html;charset=utf-8'
    );
  } else if (format === 'markdown') {
    const md = generateMarkdownReport(ctx);
    triggerBlobDownload(
      md,
      `${baseSlug}-report.md`,
      'text/markdown;charset=utf-8'
    );
  } else if (format === 'csv') {
    const csv = generateCsvReport(ctx);
    triggerBlobDownload(
      csv,
      `${baseSlug}-report.csv`,
      'text/csv;charset=utf-8'
    );
  }
}

export function openPrintableReportWindow(ctx: ReportContext) {
  const html = generateHtmlReport(ctx);
  const win = window.open('', '_blank');
  if (!win) {
    downloadSimulationReport(ctx, 'html');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
