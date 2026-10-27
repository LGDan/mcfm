import type { ModelEdge, ModelNode, OutcomeFlowNode } from '../types/model';

export interface CsvChainRow {
  item: string;
  cost: number;
  chance: number;
  lineNumber: number;
  raw: string;
  error?: string;
}

export interface CsvParseResult {
  rows: CsvChainRow[];
  validRows: CsvChainRow[];
  headerDetected: boolean;
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseNumeric(raw: string): number {
  const cleaned = raw.replace(/[£$€¥%\s]/g, '').replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function looksLikeHeader(fields: string[]): boolean {
  const joined = fields.map((f) => f.toLowerCase()).join('|');
  return (
    joined.includes('item') &&
    (joined.includes('cost') || joined.includes('price')) &&
    (joined.includes('chance') ||
      joined.includes('prob') ||
      joined.includes('percent'))
  );
}

export function parseCsvChain(text: string): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: CsvChainRow[] = [];
  const errors: string[] = [];
  let headerDetected = false;

  for (let i = 0; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    if (i === 0 && looksLikeHeader(fields)) {
      headerDetected = true;
      continue;
    }
    if (fields.length < 3) {
      const row: CsvChainRow = {
        item: fields[0] || '',
        cost: 0,
        chance: 0,
        lineNumber: i + 1,
        raw: lines[i],
        error: 'Expected at least 3 columns: item, cost, chance.',
      };
      rows.push(row);
      errors.push(`Line ${i + 1}: ${row.error}`);
      continue;
    }

    const item = fields[0];
    const chance = parseNumeric(fields[fields.length - 1]);
    const cost = parseNumeric(fields.slice(1, -1).join(''));
    let error: string | undefined;
    if (!item) error = 'Item name is empty.';
    else if (!Number.isFinite(cost) || cost < 0) error = 'Cost must be a non-negative number.';
    else if (!Number.isFinite(chance) || chance < 0 || chance > 100) {
      error = 'Chance must be a percentage between 0 and 100.';
    }

    const row: CsvChainRow = {
      item,
      cost: Number.isFinite(cost) ? cost : 0,
      chance: Number.isFinite(chance) ? chance : 0,
      lineNumber: i + 1,
      raw: lines[i],
      error,
    };
    rows.push(row);
    if (error) errors.push(`Line ${i + 1}: ${error}`);
  }

  return {
    rows,
    validRows: rows.filter((r) => !r.error),
    headerDetected,
    errors,
  };
}

export interface BuiltCsvChain {
  nodes: ModelNode[];
  edges: Omit<ModelEdge, 'type' | 'style' | 'markerEnd'>[];
}

function uid(prefix: string, index: number): string {
  return `${prefix}-csv-${Date.now().toString(36)}-${index}-${Math.random()
    .toString(36)
    .slice(2, 5)}`;
}

/**
 * Builds a Yes/No question chain from parsed CSV rows.
 * Start and End are included when `includeTerminals` is true (replace mode).
 */
export function buildCsvChainGraph(
  rows: CsvChainRow[],
  options: {
    includeTerminals: boolean;
    origin?: { x: number; y: number };
  }
): BuiltCsvChain {
  const origin = options.origin ?? { x: 80, y: 180 };
  const nodes: ModelNode[] = [];
  const edges: BuiltCsvChain['edges'] = [];

  const questionIds: string[] = [];

  if (options.includeTerminals) {
    nodes.push({
      id: 'start-1',
      type: 'start',
      position: { x: origin.x, y: origin.y + 90 },
      data: { label: 'Project Start' },
    });
  }

  rows.forEach((row, i) => {
    const qId = uid('q', i);
    const yesId = uid('o-yes', i);
    const noId = uid('o-no', i);
    questionIds.push(qId);

    const qx = origin.x + 280 + i * 420;
    const qy = origin.y + 40;

    nodes.push({
      id: qId,
      type: 'question',
      position: { x: qx, y: qy },
      data: {
        label: row.item,
        description: `Imported yes/no risk: ${row.chance}% chance of ${row.item}.`,
      },
    });

    const yesChance = Math.max(0, Math.min(100, Math.round(row.chance)));
    const noChance = Math.max(0, 100 - yesChance);

    const yesNode: OutcomeFlowNode = {
      id: yesId,
      type: 'outcome',
      position: { x: qx + 280, y: qy - 70 },
      data: {
        label: 'Yes',
        description: `${row.item} occurs.`,
        probabilityPct: yesChance,
        cost: Math.max(0, Math.round(row.cost)),
      },
    };
    const noNode: OutcomeFlowNode = {
      id: noId,
      type: 'outcome',
      position: { x: qx + 280, y: qy + 80 },
      data: {
        label: 'No',
        description: `${row.item} does not occur.`,
        probabilityPct: noChance,
        cost: 0,
      },
    };
    nodes.push(yesNode, noNode);

    edges.push(
      {
        id: `e-${qId}-${yesId}`,
        source: qId,
        target: yesId,
        data: { kind: 'question-to-outcome' },
      },
      {
        id: `e-${qId}-${noId}`,
        source: qId,
        target: noId,
        data: { kind: 'question-to-outcome' },
      }
    );

    if (i > 0) {
      const prevQ = questionIds[i - 1];
      edges.push({
        id: `e-${prevQ}-${qId}`,
        source: prevQ,
        target: qId,
        data: { kind: 'question-to-question' },
      });
    }
  });

  if (options.includeTerminals) {
    const endId = 'end-1';
    const lastQ = questionIds[questionIds.length - 1];
    nodes.push({
      id: endId,
      type: 'end',
      position: {
        x: origin.x + 280 + rows.length * 420,
        y: origin.y + 90,
      },
      data: { label: 'Project Complete' },
    });
    if (questionIds.length > 0) {
      edges.push({
        id: `e-start-${questionIds[0]}`,
        source: 'start-1',
        target: questionIds[0],
        data: { kind: 'start-to-question' },
      });
    }
    if (lastQ) {
      edges.push({
        id: `e-${lastQ}-${endId}`,
        source: lastQ,
        target: endId,
        data: { kind: 'question-to-end' },
      });
    }
  }

  return { nodes, edges };
}
