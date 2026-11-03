import { describe, expect, it } from 'vitest';
import { needsGL, prepareEchartsSpec } from '..';
import { compileExpression, evaluateExpression, ExpressionError, parseExpression } from '../expression';

describe('parseExpression / evaluateExpression', () => {
    const evaluate = (source: string, scope: Record<string, number> = {}): number =>
        evaluateExpression(parseExpression(source), scope);

    it('evaluates the saddle-point equation from a real note', () => {
        const z = compileExpression('x*x - y*y', ['x', 'y']);

        expect(z(0, 0)).toBe(0);
        expect(z(2, 1)).toBe(3);
        expect(z(1, 2)).toBe(-3);
    });

    it('respects operator precedence', () => {
        expect(evaluate('1 + 2 * 3')).toBe(7);
        expect(evaluate('(1 + 2) * 3')).toBe(9);
    });

    it('treats ^ as right-associative exponentiation', () => {
        expect(evaluate('2^3^2')).toBe(512);
        expect(evaluate('2^3')).toBe(8);
    });

    it('applies unary minus', () => {
        expect(evaluate('-2^2')).toBe(-4);
        expect(evaluate('--3')).toBe(3);
        expect(evaluate('3 - -2')).toBe(5);
    });

    it('reads the variables it is given', () => {
        expect(evaluate('x^2 + y^2', { x: 3, y: 4 })).toBe(25);
    });

    it('supports scientific notation', () => {
        expect(evaluate('1e-3')).toBeCloseTo(0.001);
        expect(evaluate('2.5E2')).toBe(250);
    });

    it('calls supported maths functions, plain or Math-qualified', () => {
        expect(evaluate('sqrt(16)')).toBe(4);
        expect(evaluate('Math.sqrt(16)')).toBe(4);
        expect(evaluate('sin(x)^2 + cos(x)^2', { x: 0.7 })).toBeCloseTo(1);
        expect(evaluate('max(1, 5, 3)')).toBe(5);
    });

    it('resolves constants', () => {
        expect(evaluate('pi')).toBeCloseTo(Math.PI);
        expect(evaluate('Math.PI')).toBeCloseTo(Math.PI);
    });

    it('supports the ternary conditional', () => {
        expect(evaluate('x > 0 ? 1 : -1', { x: 2 })).toBe(1);
        expect(evaluate('x ? 1 : -1', { x: 0 })).toBe(-1);
    });

    it('rejects an unknown variable instead of yielding NaN', () => {
        expect(() => evaluate('x + zz', { x: 1 })).toThrow(ExpressionError);
    });

    it('rejects a function outside the allow-list', () => {
        expect(() => evaluate('constructor(1)')).toThrow(ExpressionError);
        expect(() => evaluate('alert(1)')).toThrow(ExpressionError);
    });

    it('rejects unbalanced groups and dangling operators', () => {
        expect(() => parseExpression('(1 + 2')).toThrow(ExpressionError);
        expect(() => parseExpression('1 +')).toThrow(ExpressionError);
        expect(() => parseExpression('')).toThrow(ExpressionError);
    });

    it('rejects syntax that could not be interpreted', () => {
        expect(() => parseExpression('x = 1')).toThrow(ExpressionError);
        expect(() => parseExpression('x; y')).toThrow(ExpressionError);
    });
});

describe('needsGL', () => {
    it('detects the 3D components of a surface spec', () => {
        expect(needsGL({ grid3D: {}, series: [] })).toBe(true);
        expect(needsGL({ series: [{ type: 'surface' }] })).toBe(true);
        expect(needsGL({ series: [{ type: 'scatter3D' }] })).toBe(true);
    });

    it('leaves a flat chart on the svg path', () => {
        expect(needsGL({ xAxis: {}, yAxis: {}, series: [{ type: 'line' }] })).toBe(false);
        expect(needsGL({})).toBe(false);
    });

    it('handles a single series given as an object', () => {
        expect(needsGL({ series: { type: 'surface' } })).toBe(true);
        expect(needsGL({ series: { type: 'bar' } })).toBe(false);
    });
});

describe('prepareEchartsSpec', () => {
    const surfaceSpec = () => ({
        grid3D: {},
        series: [
            {
                type: 'surface',
                equation: { x: { step: 0.2 }, y: { step: 0.2 }, z: 'x*x - y*y' },
            },
        ],
    });

    /** The spec is mutated in place, so read it back without re-declaring shapes. */
    const seriesField = (spec: { series: unknown[] }, field: string): Record<string, unknown> =>
        (spec.series[0] as Record<string, Record<string, unknown>>)[field];

    it('compiles the equation strings into functions', () => {
        const spec = surfaceSpec();
        prepareEchartsSpec(spec);

        const equation = seriesField(spec, 'equation');
        expect(typeof equation.z).toBe('function');
        expect((equation.z as (x: number, y: number) => number)(0, 0)).toBe(0);
        expect((equation.z as (x: number, y: number) => number)(2, 1)).toBe(3);
    });

    it('fills in the min/max defaults echarts-gl requires', () => {
        const spec = surfaceSpec();
        prepareEchartsSpec(spec);

        const equation = seriesField(spec, 'equation');
        expect(equation.x).toEqual({ min: -1, max: 1, step: 0.2 });
        expect(equation.y).toEqual({ min: -1, max: 1, step: 0.2 });
    });

    it('keeps explicit bounds untouched', () => {
        const spec = {
            series: [
                {
                    type: 'surface',
                    equation: { x: { min: -3, max: 3, step: 1 }, y: { min: 0, max: 1, step: 0.5 }, z: 'x' },
                },
            ],
        };
        prepareEchartsSpec(spec);

        const equation = seriesField(spec, 'equation');
        expect(equation.x).toEqual({ min: -3, max: 3, step: 1 });
        expect(equation.y).toEqual({ min: 0, max: 1, step: 0.5 });
    });

    it('uses u/v as the variables of a parametric surface', () => {
        const spec = {
            series: [
                {
                    type: 'surface',
                    parametric: true,
                    parametricEquation: {
                        u: { min: 0, max: 6.28, step: 0.1 },
                        v: { min: 0, max: 6.28, step: 0.1 },
                        x: 'u*cos(v)',
                        y: 'u*sin(v)',
                        z: 'u',
                    },
                },
            ],
        };
        prepareEchartsSpec(spec);

        const equation = seriesField(spec, 'parametricEquation');
        const x = equation.x as (u: number, v: number) => number;
        expect(x(2, 0)).toBeCloseTo(2);
    });

    it('leaves a non-surface series alone', () => {
        const spec = { series: [{ type: 'line', data: [1, 2, 3] }] };
        prepareEchartsSpec(spec);

        expect(spec.series[0]).toEqual({ type: 'line', data: [1, 2, 3] });
    });

    it('tolerates a spec without series', () => {
        expect(() => prepareEchartsSpec({})).not.toThrow();
    });
});
