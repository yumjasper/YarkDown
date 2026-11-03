import { ensureEchartsGL, needsGL, prepareEchartsSpec } from './echarts';
import loadRenderer from './index';

// Mermaid's own `run()` derives the id it stamps on the rendered `<svg>` from
// `Date.now()`, and its renderers then resolve that id with a document-wide
// lookup. Two diagrams whose renders begin in the same millisecond therefore
// draw into a single element: the first block shows both diagrams on top of
// each other, the second stays empty (#5023). Mint the id here instead —
// `render()` takes one — so concurrent renders can never share it.
let mermaidRenderCount = 0;

const RAPHAEL_DESC = /^Created with Rapha/;

// Give a fixed-size `<svg>` (one with `width`/`height` px attributes but no
// `viewBox`) a viewBox derived from those dimensions, so `max-width: 100%`
// scales it down to fit instead of clipping it. Returns false while the
// dimensions are still missing.
function sizeSvg(svg: Element): boolean {
    if (svg.getAttribute('viewBox'))
        return true;
    const width = Number.parseFloat(svg.getAttribute('width') ?? '');
    const height = Number.parseFloat(svg.getAttribute('height') ?? '');
    if (width > 0 && height > 0) {
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        return true;
    }
    return false;
}

function accessibleName(media: Element, fallback: string): string {
    if (media.tagName.toLowerCase() !== 'svg')
        return fallback;

    const explicit = media.getAttribute('aria-label');
    if (explicit)
        return explicit;

    let title = '';
    let desc = '';
    for (const child of Array.from(media.children)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'title' && !title)
            title = (child.textContent ?? '').trim();
        else if (tag === 'desc' && !desc)
            desc = (child.textContent ?? '').trim();
    }
    // flowchart.js draws through Raphael, which stamps its own <desc> on every diagram.
    if (RAPHAEL_DESC.test(desc))
        desc = '';

    return [title, desc].filter(Boolean).join('. ') || fallback;
}

function applyFinalizations(target: HTMLElement, fallback: string): boolean {
    // A GL chart lands as a `<canvas>`, so it has to count as rendered media
    // here too — otherwise it never gets its role or label.
    const media = target.querySelector('svg, img, canvas');
    if (!media)
        return false;
    if (media.tagName.toLowerCase() === 'svg' && !sizeSvg(media))
        return false;

    target.setAttribute('role', 'img');
    target.setAttribute('aria-label', accessibleName(media, fallback));

    return true;
}

// `drawSVG` (js-sequence-diagrams / flowchart.js) renders the `<svg>`
// asynchronously — it's drawn from a theme callback after its font loads — so
// neither the element nor its `width`/`height` attributes are there
// synchronously. Try once, then observe `target` until the diagram lands.
export function finalizeRenderedDiagram(target: HTMLElement, fallbackLabel: string): () => void {
    if (applyFinalizations(target, fallbackLabel))
        return () => {};

    const observer = new MutationObserver(() => {
        if (applyFinalizations(target, fallbackLabel))
            observer.disconnect();
    });
    observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['width', 'height'],
    });
    // Safety net so the observer can't leak if the diagram never renders.
    const timer = setTimeout(() => observer.disconnect(), 5000);

    // The caller owns this render: it must be able to give up on one that is
    // still waiting, rather than let it describe what replaced it.
    return () => {
        clearTimeout(timer);
        observer.disconnect();
    };
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/**
 * Prefix `code` with a mermaid `%%{init}%%` directive so the config applies to
 * this one render. Mermaid's `initialize()` is process-global, and the live
 * preview re-initializes before every render, so mutating it around an export
 * would race whatever else is rendering.
 */
export function withMermaidInit(code: string, config: Record<string, unknown>): string {
    const directive = `%%{init: ${JSON.stringify(config)}}%%`;
    const frontmatter = FRONTMATTER.exec(code)?.[0] ?? '';
    const body = code.slice(frontmatter.length);

    return body.startsWith(directive)
        ? code
        : `${frontmatter}${directive}\n${body}`;
}

export interface IRenderOptions {
    type: string;
    code: string;
    target: HTMLElement;
    vegaTheme: string;
    mermaidTheme: string;
    plantumlServer: string;
    sequenceTheme: 'hand' | 'simple';
    /**
     * Editor background color, read live off the theme's CSS variable. ECharts
     * paints an opaque canvas/svg background of its own, so it must be told the
     * editor's background explicitly or a dark theme shows a white chart card.
     */
    echartsTheme?: string;
}

export interface IExportRenderOptions extends IRenderOptions {
    /**
     * Mermaid draws node labels into a `<foreignObject>` by default, and
     * Chromium refuses to paint one when the svg is loaded as an `<img>` —
     * rasterising such a diagram loses every label. Pass false to get a
     * `<text>`-only svg.
     */
    htmlLabels: boolean;
}

export async function renderDiagramForExport({
    htmlLabels,
    ...options
}: IExportRenderOptions): Promise<void> {
    const code = options.type === 'mermaid' && !htmlLabels
        ? withMermaidInit(options.code, { htmlLabels: false })
        : options.code;

    await renderDiagram({ ...options, code });
}

/**
 * Read a live ECharts instance off `target` as PNG bytes (base64 payload only).
 *
 * A GL chart renders into a WebGL canvas whose drawing buffer is not retained,
 * so reading the canvas element directly can come back empty. ECharts keeps its
 * own reference and composites through the same path, which is why the export
 * of a 3D chart has to come from here rather than from `querySelector('canvas')`.
 */
export async function readEchartsPng(target: HTMLElement): Promise<string | null> {
    const echarts = await loadRenderer('echarts');
    const chart = echarts.getInstanceByDom(target);
    if (!chart)
        return null;

    // zrender only composites the non-builtin layers (the WebGL one echarts-gl
    // adds) while the requested ratio does not exceed the device ratio; above
    // it, `getRenderedCanvas` walks the display list instead, and GL content
    // lives outside that list — a 3D chart then exports as a blank image.
    // Asking for 2× on a 1 dpr screen hit exactly that, so cap at the device
    // ratio and accept its resolution.
    //
    // The GL layer also draws on the animation frame after a resize and
    // composites by stretching its canvas into the target, so reading right
    // after a layout change can capture the previous viewport — the chart comes
    // out stretched. Wait for the frame in which it settles.
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const deviceRatio = window.devicePixelRatio || 1;
    const url: string = chart.getDataURL({
        type: 'png',
        pixelRatio: Math.min(2, Math.max(1, deviceRatio)),
    });

    return url.slice(url.indexOf(',') + 1);
}

export async function renderDiagram({
    type,
    code,
    target,
    vegaTheme,
    mermaidTheme,
    plantumlServer,
    sequenceTheme,
    echartsTheme,
}: IRenderOptions) {
    const render = await loadRenderer(type);
    const options = {};
    if (type === 'vega-lite') {
        Object.assign(options, {
            actions: false,
            tooltip: false,
            renderer: 'svg',
            theme: vegaTheme,
            ast: true,
        });
    }
    else if (type === 'sequence') {
        Object.assign(options, { theme: sequenceTheme });
    }

    if (type === 'plantuml') {
        const diagram = render.parse(code, plantumlServer);
        target.innerHTML = '';
        diagram.insertImgElement(target);
    }
    else if (type === 'vega-lite') {
        await render(target, JSON.parse(code), options);
    }
    else if (type === 'flowchart' || type === 'sequence') {
        const diagram = render.parse(code);
        target.innerHTML = '';
        diagram.drawSVG(target, options);
    }
    else if (type === 'mermaid') {
        render.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: mermaidTheme,
        });
        await render.parse(code);
        const { svg, bindFunctions } = await render.render(
            `mu-mermaid-${++mermaidRenderCount}`,
            code,
            target,
        );
        target.innerHTML = svg;
        bindFunctions?.(target);
    }
    else if (type === 'echarts') {
        await renderEcharts(code, target, echartsTheme);
    }
}

/**
 * Height reserved for a chart whose block has no intrinsic size, in CSS pixels.
 * Mirrors the 400px the SVG path has always used.
 */
const ECHARTS_FALLBACK_HEIGHT = 400;

/**
 * Below this the plot area is unusable, so the block is given the fallback
 * height instead. Not zero: the desktop theme pads `.mu-diagram-preview`
 * vertically, which alone makes an empty block measure ~24px tall.
 */
const ECHARTS_MIN_PLOT_HEIGHT = 120;

// A GL canvas has to be resized by hand when its box changes. One observer per
// host element, dropped and rebuilt on each render of that block.
const chartResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

/**
 * Draw an `echarts` fence. ECharts renders SVG by default — lighter, and the
 * diagram-export path serialises `<svg>` — but a GL chart (3D surfaces,
 * scatter3D, globe, …) must use canvas: `echarts-gl` mounts its WebGL layer
 * through `zr.painter.insertLayer()`, which only the canvas painter provides.
 */
async function renderEcharts(
    code: string,
    target: HTMLElement,
    backgroundColor?: string,
): Promise<void> {
    const spec = JSON.parse(code) as Record<string, unknown>;
    // An explicit `backgroundColor` in the spec wins; otherwise follow the
    // editor theme. `null` keeps the chart transparent.
    if (spec.backgroundColor == null && backgroundColor)
        spec.backgroundColor = backgroundColor;

    const useGL = needsGL(spec);
    if (useGL)
        await ensureEchartsGL();
    prepareEchartsSpec(spec);

    const echarts = await loadRenderer('echarts');
    // Re-rendering (each keystroke in the fence) would stack instances on the
    // same node: dispose the previous one before init.
    echarts.getInstanceByDom(target)?.dispose();
    target.innerHTML = '';

    // The preview container is width-constrained but has no fixed height, and
    // a block that just mounted can measure as zero. A GL layer sized 0×0
    // stays blank, so give it a box before init rather than after.
    //
    // The check is against the content box, not `clientHeight`: the desktop
    // theme pads this container vertically, so an empty block still reports
    // ~24px while ECharts — which subtracts that padding itself — would lay the
    // plot out at 0 height and draw nothing.
    const style = getComputedStyle(target);
    const verticalPadding
        = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    if (target.clientHeight - verticalPadding < ECHARTS_MIN_PLOT_HEIGHT)
        target.style.height = `${ECHARTS_FALLBACK_HEIGHT}px`;

    const chart = echarts.init(target, undefined, {
        renderer: useGL ? 'canvas' : 'svg',
    });
    chart.setOption(spec);
    chart.resize();

    // Keep the canvas in step with its column when the window or sidebar
    // changes width. ECharts emits no `disposed` event, so the observer is
    // tracked per target and torn down on the next render of the same block.
    chartResizeObservers.get(target)?.disconnect();
    if (useGL) {
        const observer = new ResizeObserver(() => {
            if (!chart.isDisposed())
                chart.resize();
        });
        observer.observe(target);
        chartResizeObservers.set(target, observer);
    }
    else {
        chartResizeObservers.delete(target);
    }
}
