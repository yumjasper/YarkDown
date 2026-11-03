/**
 * A small arithmetic evaluator for the `equation` / `parametricEquation`
 * strings ECharts-GL surface series accept.
 *
 * `echarts-gl` only takes a real `function` for `equation.z`, but a fenced
 * `echarts` block is JSON, so the function can only arrive as source text. The
 * usual way to bridge that gap — `new Function(source)` — is unavailable here:
 * the renderer's CSP is `script-src 'self' 'wasm-unsafe-eval'`, which blocks
 * string-to-code compilation, so the expression is parsed and interpreted
 * instead.
 *
 * The grammar covers what a plotting expression needs (arithmetic, powers,
 * unary sign, parentheses, the ternary conditional and a fixed set of maths
 * functions); anything outside it is rejected rather than silently mishandled.
 */

type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '^';
type UnaryOperator = '+' | '-';
type ComparisonOperator = '<' | '<=' | '>' | '>=' | '==' | '!=';

export type ExpressionNode
    = | { kind: 'number'; value: number }
        | { kind: 'variable'; name: string }
        | { kind: 'unary'; operator: UnaryOperator; operand: ExpressionNode }
        | { kind: 'binary'; operator: BinaryOperator; left: ExpressionNode; right: ExpressionNode }
        | { kind: 'call'; name: string; args: ExpressionNode[] }
        | { kind: 'comparison'; operator: ComparisonOperator; left: ExpressionNode; right: ExpressionNode }
        | { kind: 'conditional'; test: ExpressionNode; consequent: ExpressionNode; alternate: ExpressionNode };

// Names the interpreter resolves from `Math`, so `sqrt(x)` and `Math.sqrt(x)`
// both work. Kept explicit: reaching into `Math` by name at call time would let
// a spec invoke anything the runtime happens to expose.
const MATH_FUNCTIONS = new Set([
    'abs',
    'acos',
    'asin',
    'atan',
    'atan2',
    'cbrt',
    'ceil',
    'cos',
    'cosh',
    'exp',
    'floor',
    'log',
    'log10',
    'log2',
    'max',
    'min',
    'pow',
    'round',
    'sign',
    'sin',
    'sinh',
    'sqrt',
    'tan',
    'tanh',
    'trunc',
    'hypot',
]);

const CONSTANTS: Record<string, number> = {
    pi: Math.PI,
    PI: Math.PI,
    e: Math.E,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    SQRT2: Math.SQRT2,
};

interface IToken {
    type: 'number' | 'identifier' | 'operator' | 'paren' | 'comma' | 'question' | 'colon';
    value: string;
    offset: number;
}

/** Raised for anything the evaluator cannot parse, with the offending offset. */
export class ExpressionError extends Error {}

const IDENTIFIER_START = /[A-Z_$]/i;
const IDENTIFIER_PART = /[\w$.]/;

const SINGLE_CHAR_TOKENS: Record<string, IToken['type']> = {
    '(': 'paren',
    ')': 'paren',
    ',': 'comma',
    '?': 'question',
    ':': 'colon',
    '+': 'operator',
    '-': 'operator',
    '*': 'operator',
    '/': 'operator',
    '%': 'operator',
    '^': 'operator',
    '<': 'operator',
    '>': 'operator',
};

const TWO_CHAR_TOKENS = ['<=', '>=', '==', '!='];

/** Consume a numeric literal starting at `index`, returning the new index. */
function readNumber(source: string, start: number): number {
    let index = start;
    let seenDot = false;

    while (index < source.length && /[\d.]/.test(source[index])) {
        if (source[index] === '.') {
            if (seenDot)
                throw new ExpressionError(`Unexpected second decimal point at ${index}`);
            seenDot = true;
        }
        index++;
    }

    // Scientific notation: `1e-3`, `2.5E6`.
    if (index < source.length && /e/i.test(source[index])) {
        const next = source[index + 1];
        const signed = next === '+' || next === '-';
        const afterSign = signed ? source[index + 2] : next;
        if (afterSign != null && /\d/.test(afterSign)) {
            index += signed ? 2 : 1;
            while (index < source.length && /\d/.test(source[index])) index++;
        }
    }

    return index;
}

function tokenize(source: string): IToken[] {
    const tokens: IToken[] = [];
    let index = 0;

    while (index < source.length) {
        const char = source[index];

        if (/\s/.test(char)) {
            index++;
            continue;
        }

        if (/[\d.]/.test(char)) {
            const end = readNumber(source, index);
            tokens.push({ type: 'number', value: source.slice(index, end), offset: index });
            index = end;
            continue;
        }

        if (IDENTIFIER_START.test(char)) {
            const start = index;
            while (index < source.length && IDENTIFIER_PART.test(source[index])) index++;
            tokens.push({ type: 'identifier', value: source.slice(start, index), offset: start });
            continue;
        }

        // Two-character comparisons first, so `<=` never lexes as `<` then `=`.
        const pair = source.slice(index, index + 2);
        if (TWO_CHAR_TOKENS.includes(pair)) {
            tokens.push({ type: 'operator', value: pair, offset: index });
            index += 2;
            continue;
        }

        const type = SINGLE_CHAR_TOKENS[char];
        if (type) {
            tokens.push({ type, value: char, offset: index });
            index++;
            continue;
        }

        throw new ExpressionError(`Unexpected character "${char}" at ${index}`);
    }

    return tokens;
}

/**
 * Recursive-descent parser. Precedence, loosest first: conditional, additive,
 * multiplicative, unary, power (right-associative), primary.
 */
class Parser {
    private _index = 0;

    constructor(private readonly _tokens: IToken[]) {}

    parse(): ExpressionNode {
        const node = this._parseConditional();

        if (this._index < this._tokens.length) {
            const token = this._tokens[this._index];
            throw new ExpressionError(`Unexpected "${token.value}" at ${token.offset}`);
        }

        return node;
    }

    /**
     * Read the token under the cursor. A method rather than a getter on
     * purpose: TypeScript caches the narrowed type of a getter across
     * statements, so after consuming a `?` it would still believe the next
     * token is that same `?` and reject the `:` check as impossible.
     */
    private _peek(): IToken | undefined {
        return this._tokens[this._index];
    }

    private _isOperator(...values: string[]): boolean {
        const token = this._peek();

        return token?.type === 'operator' && values.includes(token.value);
    }

    private _isParen(value: '(' | ')'): boolean {
        const token = this._peek();

        return token?.type === 'paren' && token.value === value;
    }

    private _parseConditional(): ExpressionNode {
        const test = this._parseComparison();
        if (this._peek()?.type !== 'question')
            return test;

        this._index++;
        const consequent = this._parseConditional();
        if (this._peek()?.type !== 'colon')
            throw new ExpressionError('Expected ":" in conditional expression');
        this._index++;
        const alternate = this._parseConditional();

        return { kind: 'conditional', test, consequent, alternate };
    }

    private _parseComparison(): ExpressionNode {
        const left = this._parseAdditive();
        const token = this._peek();
        if (token?.type !== 'operator' || !['<', '<=', '>', '>=', '==', '!='].includes(token.value))
            return left;

        this._index++;

        return {
            kind: 'comparison',
            operator: token.value as ComparisonOperator,
            left,
            right: this._parseAdditive(),
        };
    }

    private _parseAdditive(): ExpressionNode {
        let left = this._parseMultiplicative();

        while (this._isOperator('+', '-')) {
            const operator = this._tokens[this._index++].value as BinaryOperator;
            const right = this._parseMultiplicative();
            left = { kind: 'binary', operator, left, right };
        }

        return left;
    }

    private _parseMultiplicative(): ExpressionNode {
        let left = this._parseUnary();

        while (this._isOperator('*', '/', '%')) {
            const operator = this._tokens[this._index++].value as BinaryOperator;
            const right = this._parseUnary();
            left = { kind: 'binary', operator, left, right };
        }

        return left;
    }

    private _parseUnary(): ExpressionNode {
        if (this._isOperator('+', '-')) {
            const operator = this._tokens[this._index++].value as UnaryOperator;
            const operand = this._parseUnary();

            return { kind: 'unary', operator, operand };
        }

        return this._parsePower();
    }

    private _parsePower(): ExpressionNode {
        const base = this._parsePrimary();
        // `2^3^2` groups as `2^(3^2)`, matching mathematical convention.
        if (this._isOperator('^')) {
            this._index++;
            const exponent = this._parseUnary();

            return { kind: 'binary', operator: '^', left: base, right: exponent };
        }

        return base;
    }

    private _parsePrimary(): ExpressionNode {
        const token = this._peek();
        if (!token)
            throw new ExpressionError('Unexpected end of expression');

        if (token.type === 'number') {
            this._index++;
            const value = Number(token.value);
            if (!Number.isFinite(value))
                throw new ExpressionError(`Invalid number "${token.value}" at ${token.offset}`);

            return { kind: 'number', value };
        }

        if (token.type === 'paren') {
            if (token.value !== '(')
                throw new ExpressionError(`Unexpected ")" at ${token.offset}`);
            this._index++;
            const node = this._parseConditional();
            if (!this._isParen(')'))
                throw new ExpressionError(`Missing ")" for the group opened at ${token.offset}`);
            this._index++;

            return node;
        }

        if (token.type === 'identifier') {
            this._index++;
            const name = token.value;

            if (this._isParen('(')) {
                this._index++;
                const args: ExpressionNode[] = [];
                if (!this._isParen(')')) {
                    args.push(this._parseConditional());
                    while (this._peek()?.type === 'comma') {
                        this._index++;
                        args.push(this._parseConditional());
                    }
                }
                if (!this._isParen(')'))
                    throw new ExpressionError(`Missing ")" after ${name}(`);
                this._index++;

                const plainName = name.replace(/^Math\./, '');
                if (!MATH_FUNCTIONS.has(plainName))
                    throw new ExpressionError(`Unsupported function "${name}" at ${token.offset}`);

                return { kind: 'call', name: plainName, args };
            }

            return { kind: 'variable', name };
        }

        throw new ExpressionError(`Unexpected "${token.value}" at ${token.offset}`);
    }
}

/** Parse an expression into a reusable tree. Throws `ExpressionError` on bad input. */
export function parseExpression(source: string): ExpressionNode {
    const trimmed = source.trim();
    if (!trimmed)
        throw new ExpressionError('Expression is empty');

    return new Parser(tokenize(trimmed)).parse();
}

/**
 * Evaluate a parsed tree. `scope` supplies the free variables (`x`, `y`, …);
 * an unknown name is an error rather than `NaN`, so a typo in a spec surfaces
 * as a message instead of an empty plot.
 */
const ARITHMETIC: Record<BinaryOperator, (left: number, right: number) => number> = {
    '+': (left, right) => left + right,
    '-': (left, right) => left - right,
    '*': (left, right) => left * right,
    '/': (left, right) => left / right,
    '%': (left, right) => left % right,
    '^': (left, right) => left ** right,
};

const COMPARISON: Record<ComparisonOperator, (left: number, right: number) => boolean> = {
    '<': (left, right) => left < right,
    '<=': (left, right) => left <= right,
    '>': (left, right) => left > right,
    '>=': (left, right) => left >= right,
    '==': (left, right) => left === right,
    '!=': (left, right) => left !== right,
};

function resolveVariable(name: string, scope: Record<string, number>): number {
    if (name in scope)
        return scope[name];
    if (name in CONSTANTS)
        return CONSTANTS[name];
    // `Math.PI` tokenizes as one identifier because `.` is an identifier
    // character; accept the qualified constant form too.
    const qualified = name.startsWith('Math.') ? name.slice(5) : null;
    if (qualified && qualified in CONSTANTS)
        return CONSTANTS[qualified];

    throw new ExpressionError(`Unknown variable "${name}"`);
}

export function evaluateExpression(node: ExpressionNode, scope: Record<string, number>): number {
    switch (node.kind) {
        case 'number':
            return node.value;

        case 'variable':
            return resolveVariable(node.name, scope);

        case 'unary': {
            const value = evaluateExpression(node.operand, scope);

            return node.operator === '-' ? -value : value;
        }

        case 'binary': {
            const operation = ARITHMETIC[node.operator];
            if (!operation)
                throw new ExpressionError('Unsupported operator');

            return operation(
                evaluateExpression(node.left, scope),
                evaluateExpression(node.right, scope),
            );
        }

        case 'comparison': {
            const operation = COMPARISON[node.operator];
            if (!operation)
                throw new ExpressionError('Unsupported comparison');

            return operation(
                evaluateExpression(node.left, scope),
                evaluateExpression(node.right, scope),
            )
                ? 1
                : 0;
        }

        case 'call': {
            const args = node.args.map(arg => evaluateExpression(arg, scope));
            const fn = Math[node.name as keyof Math] as unknown;
            if (typeof fn !== 'function')
                throw new ExpressionError(`Unsupported function "${node.name}"`);

            return (fn as (...values: number[]) => number)(...args);
        }

        case 'conditional':
            return evaluateExpression(node.test, scope) !== 0
                ? evaluateExpression(node.consequent, scope)
                : evaluateExpression(node.alternate, scope);
    }
}

/**
 * Compile an expression string into a plain `(…vars: number[]) => number`.
 * The tree is parsed once, so per-sample evaluation stays cheap on the dense
 * grids a surface series generates.
 */
export function compileExpression(source: string, variables: string[]): (...values: number[]) => number {
    const tree = parseExpression(source);

    return (...values: number[]): number => {
        const scope: Record<string, number> = {};
        for (let i = 0; i < variables.length; i++) scope[variables[i]] = values[i];

        return evaluateExpression(tree, scope);
    };
}
