import { describe, expect, it } from 'vitest';
import { MarkdownToState } from '../../state/markdownToState';
import ExportMarkdown from '../../state/stateToMarkdown';
import { parseGameDirective } from '../gameDirective';
import { getHighlightHtml } from '../marked/getHighlightHtml';

describe('game directives', () => {
    it('keeps directives as paragraph state and separates adjacent prose', () => {
        const markdown = 'Before\n::game 2048\nAfter\n::game dante\n';
        const states = new MarkdownToState().generate(markdown);
        expect(states).toEqual([
            { name: 'paragraph', text: 'Before' },
            { name: 'paragraph', text: '::game 2048' },
            { name: 'paragraph', text: 'After' },
            { name: 'paragraph', text: '::game dante' },
        ]);
        const output = new ExportMarkdown().generate(states);
        expect(new MarkdownToState().generate(output)).toEqual(states);
    });

    it('does not activate inside code or escaped text, and accepts only a single identifier', () => {
        expect(parseGameDirective('::game tiny-yurts')).toBe('tiny-yurts');
        for (const text of ['text ::game 2048', '\\::game 2048', '`::game 2048`', '::game 2048 title', '::game <script>', '::game 2048\ntext'])
            expect(parseGameDirective(text)).toBeNull();
        const states = new MarkdownToState().generate('```\n::game 2048\n```');
        expect(states[0].name).toBe('code-block');
    });

    it('exports readable inert text rather than application-local game URLs', () => {
        expect(getHighlightHtml('::game q1k3')).toBe('<p>::game q1k3</p>\n');
    });

    it('recognizes Windows line endings', () => {
        expect(new MarkdownToState().generate('::game sudoku\r\n\r\nText')[0]).toEqual({ name: 'paragraph', text: '::game sudoku' });
    });
});
