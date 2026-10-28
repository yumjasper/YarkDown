// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';

// Coverage for the Notepad++-style "show only matching lines" filter in the
// Search module: `search(value, { onlyMatches: true })` toggles
// `mu-search-hidden` on top-level blocks without a match and
// `mu-filtering-search` on the editor root. Purely presentational — block
// texts and match counts are unaffected.

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length) {
        const host = bootedHosts.pop()!;
        host.remove();
    }
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

function placeCursorOnFirstBlock(muya: Muya): void {
    const first = muya.editor.scrollPage!.firstContentInDescendant()!;
    muya.editor.activeContentBlock = first;
}

function hiddenTopBlocks(muya: Muya): number {
    return muya.domNode.querySelectorAll('.mu-container > .mu-search-hidden').length;
}

function topBlocks(muya: Muya): number {
    const container = muya.domNode.querySelector('.mu-container')!;
    return container.children.length;
}

describe('search.search() — onlyMatches filters top-level blocks', () => {
    it('hides blocks without a match and keeps matched ones visible', () => {
        const muya = bootMuya('apple here\n\nbanana there\n\nanother apple\n\nplain text\n');
        placeCursorOnFirstBlock(muya);

        const search = muya.editor.searchModule;
        search.search('apple', { onlyMatches: true });

        expect(search.matches.length).toBe(2);
        expect(muya.domNode.classList.contains('mu-filtering-search')).toBe(true);
        // 4 top-level blocks, 2 without "apple" get hidden.
        expect(topBlocks(muya)).toBe(4);
        expect(hiddenTopBlocks(muya)).toBe(2);
    });

    it('removes the filter classes when onlyMatches is off', () => {
        const muya = bootMuya('apple here\n\nbanana there\n');
        placeCursorOnFirstBlock(muya);

        const search = muya.editor.searchModule;
        search.search('apple', { onlyMatches: true });
        expect(hiddenTopBlocks(muya)).toBe(1);

        search.search('apple', {});
        expect(muya.domNode.classList.contains('mu-filtering-search')).toBe(false);
        expect(hiddenTopBlocks(muya)).toBe(0);
    });

    it('keeps match counts and block texts untouched (presentational only)', () => {
        const markdown = 'alpha x\n\nbeta\n\ngamma x\n';
        const muya = bootMuya(markdown);
        placeCursorOnFirstBlock(muya);

        const search = muya.editor.searchModule;
        search.search('x', { onlyMatches: true });

        expect(search.matches.length).toBe(2);
        expect(muya.getMarkdown()).toBe(markdown);
    });

    it('does not leave the filtering class behind after reset', () => {
        const muya = bootMuya('apple here\n\nbanana there\n');
        placeCursorOnFirstBlock(muya);

        const search = muya.editor.searchModule;
        search.search('apple', { onlyMatches: true });
        expect(muya.domNode.classList.contains('mu-filtering-search')).toBe(true);

        search.reset();
        expect(muya.domNode.classList.contains('mu-filtering-search')).toBe(false);
        expect(hiddenTopBlocks(muya)).toBe(0);
    });
});
