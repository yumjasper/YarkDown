/**
 * Lets `echarts-gl` draw under the renderer's Content Security Policy.
 *
 * `echarts-gl` renders 3D charts through `claygl`, and every texture size in
 * claygl's post-processing compositor is declared as a source string compiled
 * at runtime:
 *
 *     new Function('width', 'height', 'dpr', 'return ' + expr)
 *
 * The renderer runs with `script-src 'self' 'wasm-unsafe-eval'`, so that call
 * raises `EvalError`, which claygl's `tryConvertExpr` rewraps as
 * `Invalid expression.` — aborting the whole diagram and leaving the block on
 * "Loading...". Widening the CSP to `unsafe-eval` would enable string
 * compilation for every document in the app, so this module interposes on
 * `Function` and interprets the arithmetic claygl actually emits instead.
 */

/** Identifiers claygl passes to its compiled size expressions. */
const CLAYGL_PARAMS = ['width', 'height', 'dpr'] as const;

const CLAYGL_HEAD = `return `;

type Node
    = | { kind: 'number'; value: number }
        | { kind: 'identifier'; name: string }
        | { kind: 'binary'; operator: '+' | '-' | '*' | '/'; left: Node; right: Node }
        | { kind: 'unary'; operator: '+' | '-'; operand: Node }
        | { kind: 'array'; items: Node[] };

/** Raised for anything outside the narrow claygl size-expression grammar. */
export class UnsupportedExpression extends Error {}

const IDENTIFIER_START = /[A-Z_$]/i;
const IDENTIFIER_PART = /[\w$]/;
const DIGIT = /[\d.]/;

function tokenize(source: string): string[] {
    const tokens: string[] = [];
    let index = 0;

    while (index < source.length) {
        const char = source[index];

        if (/\s/.test(char)) {
            index++;
            continue;
        }

        if (DIGIT.test(char)) {
            const start = index;
            while (index < source.length && DIGIT.test(source[index])) index++;
            tokens.push(source.slice(start, index));
            continue;
        }

        if (IDENTIFIER_START.test(char)) {
            const start = index;
            while (index < source.length && IDENTIFIER_PART.test(source[index])) index++;
            tokens.push(source.slice(start, index));
            continue;
        }

        if ('+-*/()[],'.includes(char)) {
            tokens.push(char);
            index++;
            continue;
        }

        throw new UnsupportedExpression(`Unexpected character "${char}"`);
    }

    return tokens;
}

/**
 * Recursive descent over the grammar claygl needs: unary sign, multiplicative,
 * additive and array literals. Nothing here can call into the runtime, so a
 * hostile string has no way to escape into code execution.
 */
function parse(tokens: string[]): Node {
    let index = 0;

    const peek = (): string | undefined => tokens[index];
    const isOperator = (...values: string[]): boolean => {
        const token = peek();

        return token != null && values.includes(token);
    };

    function parseAdditive(): Node {
        let left = parseMultiplicative();
        while (isOperator('+', '-')) {
            const operator = tokens[index++] as '+' | '-';
            left = { kind: 'binary', operator, left, right: parseMultiplicative() };
        }

        return left;
    }

    function parseMultiplicative(): Node {
        let left = parseUnary();
        while (isOperator('*', '/')) {
            const operator = tokens[index++] as '*' | '/';
            left = { kind: 'binary', operator, left, right: parseUnary() };
        }

        return left;
    }

    function parseUnary(): Node {
        if (isOperator('+', '-')) {
            const operator = tokens[index++] as '+' | '-';

            return { kind: 'unary', operator, operand: parseUnary() };
        }

        return parsePrimary();
    }

    function parsePrimary(): Node {
        const token = peek();
        if (token == null)
            throw new UnsupportedExpression('Unexpected end of expression');

        if (token === '(') {
            index++;
            const node = parseAdditive();
            if (peek() !== ')')
                throw new UnsupportedExpression('Missing ")"');
            index++;

            return node;
        }

        if (token === '[') {
            index++;
            const items: Node[] = [];
            if (peek() !== ']') {
                items.push(parseAdditive());
                while (peek() === ',') {
                    index++;
                    items.push(parseAdditive());
                }
            }
            if (peek() !== ']')
                throw new UnsupportedExpression('Missing "]"');
            index++;

            return { kind: 'array', items };
        }

        if (DIGIT.test(token)) {
            index++;
            const value = Number(token);
            if (!Number.isFinite(value))
                throw new UnsupportedExpression(`Invalid number "${token}"`);

            return { kind: 'number', value };
        }

        if (IDENTIFIER_START.test(token)) {
            index++;

            return { kind: 'identifier', name: token };
        }

        throw new UnsupportedExpression(`Unexpected "${token}"`);
    }

    const node = parseAdditive();
    if (index !== tokens.length)
        throw new UnsupportedExpression('Trailing tokens');

    return node;
}

function evaluate(node: Node, scope: Record<string, number>): number | number[] {
    switch (node.kind) {
        case 'number':
            return node.value;

        case 'identifier': {
            if (!(node.name in scope))
                throw new UnsupportedExpression(`Unknown identifier "${node.name}"`);

            return scope[node.name];
        }

        case 'unary': {
            const value = evaluate(node.operand, scope);
            if (typeof value !== 'number')
                throw new UnsupportedExpression('Unary sign on an array');

            return node.operator === '-' ? -value : value;
        }

        case 'binary': {
            const left = evaluate(node.left, scope);
            const right = evaluate(node.right, scope);
            if (typeof left !== 'number' || typeof right !== 'number')
                throw new UnsupportedExpression('Arithmetic on an array');

            if (node.operator === '+')
                return left + right;
            if (node.operator === '-')
                return left - right;
            if (node.operator === '*')
                return left * right;

            return left / right;
        }

        case 'array':
            return node.items.map((item) => {
                const value = evaluate(item, scope);
                if (typeof value !== 'number')
                    throw new UnsupportedExpression('Nested array literal');

                return value;
            });
    }
}

/**
 * Compile claygl's `new Function('width', 'height', 'dpr', 'return …')` into a
 * real function. Returns null for any other `Function` call, so a genuine
 * syntax error in unrelated code still surfaces unchanged.
 */
export function compileClayglExpression(
    args: readonly unknown[],
): ((width: number, height: number, dpr?: number) => number | number[]) | null {
    if (args.length !== CLAYGL_PARAMS.length + 1)
        return null;

    for (let i = 0; i < CLAYGL_PARAMS.length; i++) {
        if (String(args[i]) !== CLAYGL_PARAMS[i])
            return null;
    }

    const body = String(args[args.length - 1] ?? '').trim();
    if (!body.startsWith(CLAYGL_HEAD))
        return null;

    let tree: Node;
    try {
        tree = parse(tokenize(body.slice(CLAYGL_HEAD.length)));
    }
    catch {
        return null;
    }

    return (width: number, height: number, dpr = 1): number | number[] => {
        const scope: Record<string, number> = {
            width,
            height,
            dpr,
        };

        return evaluate(tree, scope);
    };
}

let installed = false;
let nativeFunction: FunctionConstructor | null = null;

/**
 * Interpret claygl's CSP-blocked `Function` calls instead of letting them abort
 * the render. Idempotent, and effectively inert where `new Function` is already
 * allowed (the Muya playground, unit tests): there the native constructor
 * succeeds and the interpreter is never consulted.
 */
export function installCspSafeFunction(): void {
    if (installed)
        return;
    installed = true;

    nativeFunction = globalThis.Function;
    const NativeFunction = nativeFunction;

    // Anything that is not a claygl size expression is re-thrown untouched, so
    // this cannot mask a real error elsewhere in the app.
    const fallbackFor = (args: readonly unknown[]) => compileClayglExpression(args);

    globalThis.Function = new Proxy(NativeFunction, {
        construct(target, args, newTarget) {
            try {
                return Reflect.construct(target, args, newTarget);
            }
            catch (error) {
                const fallback = fallbackFor(args);
                if (fallback)
                    return fallback;

                throw error;
            }
        },
        apply(target, thisArg, args) {
            try {
                return Reflect.apply(target, thisArg, args);
            }
            catch (error) {
                const fallback = fallbackFor(args);
                if (fallback)
                    return fallback;

                throw error;
            }
        },
    }) as FunctionConstructor;
}

/** Test seam: restore the native `Function` so a spec can observe a clean global. */
export function uninstallCspSafeFunction(): void {
    if (nativeFunction)
        globalThis.Function = nativeFunction;
    nativeFunction = null;
    installed = false;
}
