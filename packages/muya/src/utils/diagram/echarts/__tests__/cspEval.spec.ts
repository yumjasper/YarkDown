import { describe, expect, it } from 'vitest';
import { compileClayglExpression, installCspSafeFunction, uninstallCspSafeFunction } from '../cspEval';

/**
 * These are the literal bodies claygl feeds `new Function` for its compositor
 * texture sizes — collected from a live `echarts-gl` surface render.
 */
const CLAYGL_BODIES = [
    'return width * 1.0 / 2',
    'return height * 1.0 / 2',
    'return [width * 1.0, height * 1.0]',
    'return [width * 1.0 / 2, height / 2]',
    'return width * 1.0 / 32',
    'return [width * 1.0 / 32, height / 32]',
    'return width * 1.0',
    'return height * 1.0',
];

describe('compileClayglExpression', () => {
    it('compiles every size expression claygl emits', () => {
        for (const body of CLAYGL_BODIES) {
            const compiled = compileClayglExpression(['width', 'height', 'dpr', body]);
            expect(compiled, body).toBeTypeOf('function');
        }
    });

    it('scales a single dimension', () => {
        const half = compileClayglExpression(['width', 'height', 'dpr', 'return width * 1.0 / 2']);

        expect(half?.(600, 400)).toBe(300);
    });

    it('returns an array for the composite texture sizes', () => {
        const size = compileClayglExpression(['width', 'height', 'dpr', 'return [width * 1.0 / 8, height / 8]']);

        expect(size?.(800, 400)).toEqual([100, 50]);
    });

    it('parses the whole set without falling through to a throw', () => {
        const whole = compileClayglExpression(['width', 'height', 'dpr', 'return [width * 1.0, height * 1.0]']);

        expect(whole?.(320, 240)).toEqual([320, 240]);
    });

    it('ignores calls that are not claygl size expressions', () => {
        expect(compileClayglExpression(['a', 'return a + 1'])).toBeNull();
        expect(compileClayglExpression(['width', 'state'])).toBeNull();
        expect(compileClayglExpression(['width', 'height', 'dpr', 'notAReturn'])).toBeNull();
        expect(compileClayglExpression([])).toBeNull();
    });

    it('refuses bodies it cannot interpret rather than guessing', () => {
        // Bare identifiers claygl never uses, and anything that looks like a
        // call, must not be compiled.
        expect(compileClayglExpression(['width', 'height', 'dpr', 'return fetch(1)'])).toBeNull();
        expect(compileClayglExpression(['width', 'height', 'dpr', 'return width; alert(1)'])).toBeNull();
    });

    it('does not expose a way to reach the runtime', () => {
        const compiled = compileClayglExpression([
            'width',
            'height',
            'dpr',
            'return constructor.constructor("return 1")()',
        ]);

        expect(compiled).toBeNull();
    });
});

describe('installCspSafeFunction', () => {
    it('leaves ordinary Function construction working', () => {
        installCspSafeFunction();

        // eslint-disable-next-line no-new-func
        const add = new Function('a', 'b', 'return a + b') as (a: number, b: number) => number;
        expect(add(2, 3)).toBe(5);
    });

    it('is idempotent', () => {
        installCspSafeFunction();
        installCspSafeFunction();

        // eslint-disable-next-line no-new-func
        expect(new Function('return 7')()).toBe(7);
    });

    it('restores the native constructor on uninstall', () => {
        uninstallCspSafeFunction();
        const native = globalThis.Function;
        installCspSafeFunction();
        expect(globalThis.Function).not.toBe(native);

        uninstallCspSafeFunction();
        expect(globalThis.Function).toBe(native);
    });
});
