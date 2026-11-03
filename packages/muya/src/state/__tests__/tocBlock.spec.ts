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

    // Without its own trailing newline the marker and the block that follows it
    // shared one paragraph (`[TOC]\npara`), so the export could no longer see a
    // standalone marker and printed the literal text instead of an outline.
    it('separates the marker from the following block with a blank line', () => {
        const states = new MarkdownToState().generate('# Title\n\n[TOC]\n\npara after\n');
        const markdown = new ExportMarkdown().generate(states);

        expect(markdown).toContain('[TOC]\n\npara after');
    });

    it('round-trips a marker followed by a paragraph back into two blocks', () => {
        const markdown = new ExportMarkdown().generate(
            new MarkdownToState().generate('# Title\n\n[TOC]\n\npara after\n'),
        );
        const states = new MarkdownToState().generate(markdown);

        expect(states.some(state => state.name === 'toc')).toBe(true);
        const paragraph = states.find(state => state.name === 'paragraph') as
            | { text: string }
            | undefined;
        expect(paragraph?.text.trim()).toBe('para after');
    });
});
