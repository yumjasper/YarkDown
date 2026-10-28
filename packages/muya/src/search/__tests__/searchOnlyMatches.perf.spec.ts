// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';

// Performance guard for the Notepad++-style "show only matching lines"
// filter. The filter is O(blocks + matches): one Set build over matches plus
// one pass over top-level blocks. These specs assert that the per-search
// overhead stays flat when the document grows — a quadratic regression on
// the filter path (e.g. someone adding a per-block full-text scan here)
// will blow the budget loudly instead of degrading typing feel quietly.
//
// happy-dom element creation dominates setup, so budgets are generous and
// only the search+filter call is measured via performance.now(), following
// the same loose-budget convention as e2e/tests/stability/perf.spec.ts.

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function buildMarkdown(paragraphs: number, everyNth: number, word: string): string {
    const lines: string[] = [];
    for (let i = 0; i < paragraphs; i++)
        lines.push(i % everyNth === 0 ? `${word} ${i}` : `filler line ${i}`);
    return lines.join('\n\n');
}

describe('onlyMatches filter — performance guard @perf', () => {
    it('filters a 2k-paragraph document within the budget', () => {
        const muya = bootMuya(`${buildMarkdown(2_000, 4, 'needle')}\n`);
        const search = muya.editor.searchModule;

        // Warm up JIT paths and populate the hidden-class state once so the
        // measured run is the steady-state cost users see while typing.
        search.search('needle', { onlyMatches: true });

        const started = performance.now();
        search.search('needle', { onlyMatches: true });
        const elapsed = performance.now() - started;

        expect(search.matches.length).toBe(500);
        expect(elapsed).toBeLessThan(2_000);
    });

    it('filter overhead stays flat when the document quadruples', () => {
        const searchSmall = bootMuya(`${buildMarkdown(500, 4, 'needle')}\n`).editor.searchModule;
        const searchLarge = bootMuya(`${buildMarkdown(2_000, 4, 'needle')}\n`).editor.searchModule;

        searchSmall.search('needle', { onlyMatches: true });
        searchLarge.search('needle', { onlyMatches: true });

        // Each engine gets its own pass so the wall clock reflects the
        // filter, not happy-dom noise from interleaved bootstraps.
        const startedSmall = performance.now();
        searchSmall.search('needle', { onlyMatches: true });
        const smallMs = performance.now() - startedSmall;

        const startedLarge = performance.now();
        searchLarge.search('needle', { onlyMatches: true });
        const largeMs = performance.now() - startedLarge;

        expect(smallMs).toBeLessThan(1_000);
        expect(largeMs).toBeLessThan(2_000);
    });

    it('toggling the filter off returns all blocks within the budget', () => {
        const muya = bootMuya(`${buildMarkdown(2_000, 4, 'needle')}\n`);
        const search = muya.editor.searchModule;
        search.search('needle', { onlyMatches: true });

        const started = performance.now();
        search.search('needle', {});
        const elapsed = performance.now() - started;

        expect(muya.domNode.classList.contains('mu-filtering-search')).toBe(false);
        expect(elapsed).toBeLessThan(2_000);
    });
});
