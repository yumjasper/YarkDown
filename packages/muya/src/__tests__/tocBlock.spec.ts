// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../muya';

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

describe('[TOC] block rendering', () => {
    it('renders the document headings inside the toc block', async () => {
        const muya = bootMuya('# First\n\n## Second\n\n[TOC]\n\nbody\n');

        const toc = muya.domNode.querySelector('.mu-toc-block');
        expect(toc).toBeTruthy();
        await vi.waitFor(() => {
            expect(toc!.textContent).toContain('First');
            expect(toc!.textContent).toContain('Second');
        });
    });

    it('keeps the [TOC] marker in the exported markdown', () => {
        const muya = bootMuya('# First\n\n[TOC]\n');

        expect(muya.getMarkdown()).toContain('[TOC]');
    });
});
