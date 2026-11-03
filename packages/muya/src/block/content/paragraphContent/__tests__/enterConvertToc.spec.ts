// @vitest-environment happy-dom

import type Content from '../../../base/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../../muya';

// A standalone `[TOC]` line is a table-of-contents marker, not body text.
// `markdownToState` has always recognised it when a file is loaded; these tests
// cover the live-typing path, where `ParagraphContent.enterHandler` must
// convert the paragraph in place like it does for `$$` / fences / tables.

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
    document.getSelection()?.removeAllRanges();
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

function contentByText(muya: Muya, text: string): Content {
    let target: Content | null = null;
    const visit = (block: {
        text?: string;
        constructor: { blockName?: string };
        children?: { forEach: (cb: (b: unknown) => void) => void };
    }) => {
        if (block.constructor.blockName?.endsWith('.content') && block.text === text)
            target = block as unknown as Content;
        block.children?.forEach(b => visit(b as typeof block));
    };
    visit(muya.editor.scrollPage as unknown as Parameters<typeof visit>[0]);
    if (!target)
        throw new Error(`content block with text "${text}" not found`);
    return target;
}

function enterWithText(muya: Muya, content: Content, text: string): { preventDefault: ReturnType<typeof vi.fn> } {
    muya.editor.activeContentBlock = content;
    content.text = text;
    content.update();
    const offset = content.text.length;
    content.setCursor(offset, offset, true);
    const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        shiftKey: false,
        key: 'Enter',
    } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
    content.enterHandler(event);
    return event;
}

function flush(): Promise<void> {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

describe('enter on `[TOC]` — converts to a toc block', () => {
    it('replaces the paragraph with a toc block', async () => {
        const muya = bootMuya('seed\n');
        const content = contentByText(muya, 'seed');

        enterWithText(muya, content, '[TOC]');

        await flush();
        const names = muya.getState().map(block => block.name);
        expect(names).toContain('toc');
        // The marker replaced the paragraph: no leftover paragraph carries the
        // `[TOC]` text any more.
        expect(muya.getState().some(block => (block as { text?: string }).text === '[TOC]' && block.name === 'paragraph')).toBe(false);
    });

    it('keeps the `[TOC]` marker in the exported markdown', async () => {
        const muya = bootMuya('# First\n\nseed\n');
        const content = contentByText(muya, 'seed');

        enterWithText(muya, content, '[TOC]');

        await flush();
        expect(muya.getMarkdown()).toContain('[TOC]');
    });

    it('renders the document outline inside the toc block', async () => {
        const muya = bootMuya('# First\n\n## Second\n\nseed\n');
        const content = contentByText(muya, 'seed');

        enterWithText(muya, content, '[TOC]');

        await flush();
        await flush();
        const toc = muya.domNode.querySelector('.mu-toc-block');
        expect(toc).toBeTruthy();
        expect(toc!.textContent).toContain('Table of Contents');
        expect(toc!.textContent).toContain('First');
        expect(toc!.textContent).toContain('Second');
    });

    it('lands the caret in a fresh paragraph below the toc block', async () => {
        const muya = bootMuya('seed\n');
        const content = contentByText(muya, 'seed');

        enterWithText(muya, content, '[TOC]');

        await flush();
        const names = muya.getState().map(block => block.name);
        const tocIndex = names.indexOf('toc');
        expect(tocIndex).toBeGreaterThanOrEqual(0);
        expect(names[tocIndex + 1]).toBe('paragraph');

        expect(muya.editor.activeContentBlock?.text).toBe('');
    });

    it('accepts the marker case-insensitively and with trailing spaces', async () => {
        const muya = bootMuya('seed\n');
        const content = contentByText(muya, 'seed');

        enterWithText(muya, content, '  [toc]  ');

        await flush();
        expect(muya.getState().some(block => block.name === 'toc')).toBe(true);
    });

    it('calls preventDefault so the browser cannot insert a native newline', () => {
        const muya = bootMuya('seed\n');
        const content = contentByText(muya, 'seed');

        const event = enterWithText(muya, content, '[TOC]');

        expect(event.preventDefault).toHaveBeenCalled();
    });
});

describe('enter on `[TOC]` inline text — NOT converted', () => {
    for (const text of ['see [TOC] here', '[TOC] trailing', 'a [TOC]']) {
        it(`keeps ${JSON.stringify(text)} as a paragraph`, async () => {
            const muya = bootMuya('seed\n');
            const content = contentByText(muya, 'seed');

            enterWithText(muya, content, text);

            await flush();
            expect(muya.getState().some(block => block.name === 'toc')).toBe(false);
        });
    }
});
