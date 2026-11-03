import { installCspSafeFunction } from './cspEval';
import { compileExpression } from './expression';

/**
 * ECharts option preparation for the `echarts` fence.
 *
 * Two things have to happen before a JSON option can be handed to ECharts:
 *
 * - The GL extension must be registered once, since `surface`, `grid3D`,
 *   `scatter3D` and friends live there rather than in `echarts` core.
 * - A GL chart needs the canvas renderer. `echarts-gl` mounts its WebGL layer
 *   through `zr.painter.insertLayer()`, which only the canvas painter
 *   implements; asking for `svg` throws instead of drawing.
 */

/** Components and series that only exist once `echarts-gl` is installed. */
const GL_OPTION_KEYS = [
    'grid3D',
    'xAxis3D',
    'yAxis3D',
    'zAxis3D',
    'geo3D',
    'globe',
    'mapbox3D',
    'maptalks3D',
];

const GL_SERIES_TYPES = new Set([
    'surface',
    'bar3D',
    'line3D',
    'scatter3D',
    'lines3D',
    'polygons3D',
    'map3D',
    'scatterGL',
    'graphGL',
    'flowGL',
    'linesGL',
]);

let glInstall: Promise<void> | null = null;

/**
 * Register `echarts-gl` against the single ECharts core instance the renderer
 * imports. The package side-registers its charts and components as a side
 * effect of being imported, so importing it once is the whole installation.
 */
export function ensureEchartsGL(): Promise<void> {
    if (!glInstall) {
        // claygl compiles its compositor texture sizes with `new Function`,
        // which the renderer's CSP blocks; interpret them instead.
        installCspSafeFunction();
        glInstall = import('echarts-gl')
            .then(() => {})
            .catch((error: unknown) => {
                // Let a transient failure be retried on the next render rather
                // than latching the whole feature off.
                glInstall = null;
                throw error;
            });
    }

    return glInstall;
}

/** True when the option needs the GL extension, and therefore the canvas renderer. */
export function needsGL(spec: Record<string, unknown>): boolean {
    if (GL_OPTION_KEYS.some(key => spec[key] != null))
        return true;

    const series = spec.series;
    const list = Array.isArray(series) ? series : series == null ? [] : [series];

    return list.some((item) => {
        if (item == null || typeof item !== 'object')
            return false;

        return GL_SERIES_TYPES.has(String((item as Record<string, unknown>).type ?? ''));
    });
}

const DEFAULT_RANGE = { min: -1, max: 1, step: 0.1 };

/**
 * `echarts-gl` requires a real function for `equation.z` / `parametricEquation.*`
 * and a full `{ min, max, step }` per input dimension, but a JSON fence can only
 * carry strings and the parts it happens to specify. Fill the gaps and compile
 * the expressions, so the common "just give me a surface" spec works.
 *
 * `rangeDimensions` are the inputs the grid is swept over (`x`/`y` for an
 * equation surface, `u`/`v` for a parametric one) — everything else is an
 * expression to compile.
 */
function normalizeSurfaceEquation(
    equation: Record<string, unknown>,
    rangeDimensions: string[],
): void {
    for (const dimension of rangeDimensions) {
        const current = equation[dimension];
        if (current == null) {
            equation[dimension] = { ...DEFAULT_RANGE };
            continue;
        }
        if (typeof current !== 'object')
            throw new Error(`equation.${dimension} must be an object with min/max/step`);

        const range = current as Record<string, unknown>;
        for (const bound of ['min', 'max', 'step'] as const) {
            if (typeof range[bound] !== 'number')
                range[bound] = DEFAULT_RANGE[bound];
        }
    }

    for (const component of ['x', 'y', 'z']) {
        const value = equation[component];
        if (typeof value === 'string')
            equation[component] = compileExpression(value, rangeDimensions);
    }
}

/**
 * Resolve the JSON-only parts of a spec into the runtime shape ECharts expects.
 */
export function prepareEchartsSpec(spec: Record<string, unknown>): void {
    const series = spec.series;
    const list = Array.isArray(series) ? series : series == null ? [] : [series];

    for (const item of list) {
        if (item == null || typeof item !== 'object')
            continue;

        const entry = item as Record<string, unknown>;
        if (entry.type !== 'surface')
            continue;

        if (entry.equation != null && typeof entry.equation === 'object')
            normalizeSurfaceEquation(entry.equation as Record<string, unknown>, ['x', 'y']);
        if (entry.parametricEquation != null && typeof entry.parametricEquation === 'object')
            normalizeSurfaceEquation(entry.parametricEquation as Record<string, unknown>, ['u', 'v']);
    }
}
