// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import type { Muya } from '../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../muya';
import { SelectionCaretType, SelectionDirection } from '../../selection/types';

// Pasting `[TOC]` goes through the same parser the file-load path uses, so a
// standalone marker must become a toc block rather than a paragraph holding the
// literal text. The marker has no editable content, so the surrounding text has
// to survive as ordinary paragraphs around it.

vi.mock('../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => null,
    search: () => [],
}));

vi.mock('../../utils/paste', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/paste')>();
    return { ...actual, normalizePastedHTML: async (html: string) => html };
});

const bootedHosts: HTMLElement[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

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
    const muya = new MuyaClass(host, { markdown } as ConstructorParameters<typeof MuyaClass>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function contentBlocks(muya: Muya): Content[] {
    const out: Content[] = [];
    let c: Content | null = muya.editor.scrollPage!.firstContentInDescendant();
    while (c) {
        out.push(c);
        c = c.nextContentInContext() ?? null;
    }
    return out;
}

function pasteEvent(text: string) {
    return {
        preventDefault() {},
        stopPropagation() {},
        clipboardData: { getData: (t: string) => (t === 'text/plain' ? text : ''), files: [], items: [] },
    } as unknown as ClipboardEvent;
}

async function paste(muya: Muya, block: Content, start: number, end: number, text: string): Promise<string> {
    const path = block.path;
    muya.editor.selection.getSelection = () => ({
        anchor: { offset: start, block, path },
        focus: { offset: end, block, path },
        isCollapsed: start === end,
        isSelectionInSameBlock: true,
        direction: SelectionDirection.FORWARD,
        type: SelectionCaretType.RANGE,
    });
    await muya.editor.clipboard.pasteHandler(pasteEvent(text), text, '');
    await new Promise(r => setTimeout(r, 40));
    return muya.getMarkdown();
}

describe('paste `[TOC]` — becomes a toc block', () => {
    it('creates a toc block in an empty paragraph', async () => {
        const muya = bootMuya('# First\n\nseed\n');
        const block = contentBlocks(muya)[1];

        await paste(muya, block, 0, 4, '[TOC]');

        const names = muya.getState().map(s => s.name);
        expect(names).toContain('toc');
    });

    it('keeps the marker in the markdown', async () => {
        const muya = bootMuya('# First\n\nseed\n');
        const block = contentBlocks(muya)[1];

        const md = await paste(muya, block, 0, 4, '[TOC]');

        expect(md).toContain('[TOC]');
        expect(md).toContain('# First');
    });

    it('keeps the text after the caret in its own paragraph instead of dropping it', async () => {
        const muya = bootMuya('# First\n\nabcdef\n');
        const block = contentBlocks(muya)[1];

        // Insert the marker at the start, leaving `abcdef` as the tail.
        const md = await paste(muya, block, 0, 0, '[TOC]');

        expect(md).toContain('[TOC]');
        expect(md).toContain('abcdef');
        expect(md).not.toContain('[TOC]abcdef');
    });

    it('leaves an editable paragraph below the marker so typing can continue', async () => {
        const muya = bootMuya('# First\n\nseed\n');
        const block = contentBlocks(muya)[1];

        await paste(muya, block, 0, 4, '[TOC]');

        const names = muya.getState().map(s => s.name);
        const tocIndex = names.indexOf('toc');
        expect(tocIndex).toBeGreaterThanOrEqual(0);
        expect(names[tocIndex + 1]).toBe('paragraph');
    });

    it('does NOT convert inline `[TOC]` text', async () => {
        const muya = bootMuya('seed\n');
        const block = contentBlocks(muya)[0];

        await paste(muya, block, 0, 4, 'see [TOC] here');

        expect(muya.getState().some(s => s.name === 'toc')).toBe(false);
    });

    // This is the context-menu "insert table of contents" path: the anchor keeps
    // its text and the marker starts a block of its own, never sharing a line.
    it('splits an anchor that already has text instead of appending to it', async () => {
        const muya = bootMuya('intro\n');
        const block = contentBlocks(muya)[0];

        const md = await paste(muya, block, 5, 5, '[TOC]');

        expect(md).toContain('intro');
        expect(md).toContain('[TOC]');
        expect(md).not.toContain('intro[TOC]');
        expect(muya.getState().some(s => s.name === 'toc')).toBe(true);
    });
});
