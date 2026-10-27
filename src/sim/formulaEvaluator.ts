import type { CostPotAllocation, VariableNodeData } from '../types/model';

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; name: string }
  | { type: 'op'; op: '+' | '-' | '*' | '/' }
  | { type: 'paren'; paren: '(' | ')' };

export function sanitizeVariableName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return 'variable_a';
  if (/^[0-9]/.test(cleaned)) return `var_${cleaned}`;
  return cleaned;
}

export function tokenizeFormula(expr: string): {
  tokens: Token[];
  error?: string;
} {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.trim();

  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', op: ch });
      i++;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', paren: ch });
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < s.length && /[0-9._]/.test(s[i])) {
        if (s[i] !== '_') numStr += s[i];
        i++;
      }
      const val = Number(numStr);
      if (Number.isNaN(val)) {
        return { tokens: [], error: `Invalid number "${numStr}"` };
      }
      tokens.push({ type: 'number', value: val });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) {
        ident += s[i];
        i++;
      }
      tokens.push({ type: 'ident', name: ident.toLowerCase() });
      continue;
    }

    return { tokens: [], error: `Unexpected character "${ch}"` };
  }

  return { tokens };
}

export function validateFormulaExpression(
  expr: string,
  availableVariables: Set<string>
): { valid: boolean; error?: string; referencedVars: string[] } {
  if (!expr || !expr.trim()) {
    return { valid: false, error: 'Formula is empty.', referencedVars: [] };
  }

  const { tokens, error } = tokenizeFormula(expr);
  if (error) {
    return { valid: false, error, referencedVars: [] };
  }
  if (tokens.length === 0) {
    return { valid: false, error: 'Formula is empty.', referencedVars: [] };
  }

  const referencedVars: string[] = [];
  for (const t of tokens) {
    if (t.type === 'ident') {
      referencedVars.push(t.name);
      if (!availableVariables.has(t.name)) {
        return {
          valid: false,
          error: `Unknown variable "${t.name}". Add a Variable node named "${t.name}".`,
          referencedVars,
        };
      }
    }
  }

  // Test parse by evaluating with dummy 1s
  const dummyVars: Record<string, number> = {};
  for (const v of referencedVars) dummyVars[v] = 1;
  const evalCheck = evaluateFormula(expr, dummyVars);
  if (evalCheck.error) {
    return { valid: false, error: evalCheck.error, referencedVars };
  }

  return { valid: true, referencedVars };
}

/**
 * Evaluates a mathematical formula supporting +, -, *, /, parentheses, and variables.
 */
export function evaluateFormula(
  expr: string,
  variables: Record<string, number>
): { value: number; error?: string } {
  const { tokens, error } = tokenizeFormula(expr);
  if (error) return { value: 0, error };
  if (tokens.length === 0) return { value: 0, error: 'Empty formula' };

  let pos = 0;

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.type === 'op' && (tok.op === '+' || tok.op === '-')) {
        pos++;
        const right = parseTerm();
        left = tok.op === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.type === 'op' && (tok.op === '*' || tok.op === '/')) {
        pos++;
        const right = parseFactor();
        if (tok.op === '*') {
          left = left * right;
        } else {
          left = right === 0 ? 0 : left / right;
        }
      } else {
        break;
      }
    }
    return left;
  }

  function parseFactor(): number {
    if (pos >= tokens.length) {
      throw new Error('Unexpected end of expression');
    }
    const tok = tokens[pos];

    if (tok.type === 'op' && (tok.op === '+' || tok.op === '-')) {
      pos++;
      const factor = parseFactor();
      return tok.op === '-' ? -factor : factor;
    }

    if (tok.type === 'paren' && tok.paren === '(') {
      pos++;
      const inner = parseExpression();
      const closing = tokens[pos];
      if (!closing || closing.type !== 'paren' || closing.paren !== ')') {
        throw new Error('Missing closing parenthesis ")"');
      }
      pos++;
      return inner;
    }

    if (tok.type === 'number') {
      pos++;
      return tok.value;
    }

    if (tok.type === 'ident') {
      pos++;
      const val = variables[tok.name];
      if (val === undefined) {
        throw new Error(`Undefined variable "${tok.name}"`);
      }
      return val;
    }

    throw new Error('Invalid syntax in formula');
  }

  try {
    const result = parseExpression();
    if (pos < tokens.length) {
      return { value: 0, error: 'Unexpected trailing tokens in formula' };
    }
    const safeVal = Number.isFinite(result) ? Math.max(0, result) : 0;
    return { value: safeVal };
  } catch (err) {
    return {
      value: 0,
      error: err instanceof Error ? err.message : 'Formula syntax error',
    };
  }
}

/**
 * Samples a single Variable node for a trial.
 */
export function sampleVariableValue(
  data: VariableNodeData,
  rng: () => number
): number {
  if (data.mode === 'fixed') {
    return Number(data.fixedValue) || 0;
  }
  if (data.mode === 'slider') {
    return Number(data.sliderValue) || 0;
  }
  // 'random': uniform continuous between minValue and maxValue
  const lo = Math.min(Number(data.minValue) || 0, Number(data.maxValue) || 0);
  const hi = Math.max(Number(data.minValue) || 0, Number(data.maxValue) || 0);
  if (hi <= lo) return lo;
  return lo + rng() * (hi - lo);
}

/**
 * Samples from a Triangular(low, medium, high) distribution.
 */
export function sampleTriangular(
  low: number,
  medium: number,
  high: number,
  rng: () => number
): number {
  const a = Math.max(0, Math.min(low, medium, high));
  const b = Math.max(0, Math.max(low, medium, high));
  const c = Math.max(a, Math.min(b, medium));
  if (b <= a) return a;

  const u = rng();
  const fc = (c - a) / (b - a);
  if (u < fc) {
    return a + Math.sqrt(u * (b - a) * (c - a));
  }
  return b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

/**
 * Evaluates a CostPotAllocation for a single trial (or nominal preview when rng is undefined).
 */
export function evaluatePotCost(
  pot: CostPotAllocation,
  variables: Record<string, number>,
  rng?: () => number
): number {
  if (pot.estimateMode === 'fixed') {
    return Math.max(0, Number(pot.fixedCost) || 0);
  }
  if (pot.estimateMode === 'three-point') {
    const low = Math.max(0, Number(pot.lowCost) || 0);
    const med = Math.max(0, Number(pot.mediumCost) || 0);
    const high = Math.max(0, Number(pot.highCost) || 0);
    if (!rng) {
      // Expected value of triangular distribution is (low + med + high) / 3
      return Math.round((low + med + high) / 3);
    }
    return sampleTriangular(low, med, high, rng);
  }
  // 'formula'
  const { value } = evaluateFormula(pot.formula || '0', variables);
  return Math.max(0, value);
}

/**
 * Computes the nominal/expected total Capex + 5-year Opex for an AdvancedOutcomeNode for card display.
 */
export function computeNominalAdvancedOutcomeCost(
  pots: CostPotAllocation[],
  variables: Record<string, number>,
  capexOpexEnabled?: boolean,
  opexAnnualCost?: number,
  opexInflationPct?: number,
  horizonYears = 5
): { capexNominal: number; opexNominalTotal: number; totalNominal: number } {
  const capexNominal = pots.reduce(
    (acc, p) => acc + evaluatePotCost(p, variables),
    0
  );
  let opexNominalTotal = 0;
  if (capexOpexEnabled && (Number(opexAnnualCost) || 0) > 0) {
    const baseOpex = Math.max(0, Number(opexAnnualCost) || 0);
    const inf = (Number(opexInflationPct) || 0) / 100;
    for (let y = 0; y < horizonYears; y++) {
      opexNominalTotal += baseOpex * Math.pow(1 + inf, y);
    }
  }
  return {
    capexNominal: Math.round(capexNominal),
    opexNominalTotal: Math.round(opexNominalTotal),
    totalNominal: Math.round(capexNominal + opexNominalTotal),
  };
}
