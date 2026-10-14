import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../markdownToState';
import ExportMarkdown from '../stateToMarkdown';

describe('[TOC] support', () => {
    it('parses a standalone [TOC] line into a toc block', () => {
        const states = new MarkdownToState().generate('# Title\n\n[TOC]\n\nbody\n');
        expect(states.some(state => state.name === 'toc')).toBe(true);
    });

    it('keeps [TOC] text inside a paragraph as paragraph', () => {
        const states = new MarkdownToState().generate('see [TOC] here\n');
        expect(states.some(state => state.name === 'toc')).toBe(false);
    });

    it('serializes a toc block back to the [TOC] marker', () => {
        const markdown = new ExportMarkdown().generate([{ name: 'toc', text: '[TOC]' }]);
        expect(markdown.trim()).toBe('[TOC]');
    });
});
