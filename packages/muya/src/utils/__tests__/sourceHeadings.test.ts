import { describe, expect, it } from 'vitest';
import { sourceHeadings } from '../sourceHeadings';

describe('source headings without the rendering engine', () => {
    it('addresses ATX and setext headings by source line', () => {
        expect(sourceHeadings('# One\n\nBody\n\nTwo\n---\n')).toEqual([
            { lvl: 1, content: 'One', slug: 'source-line-0' },
            { lvl: 2, content: 'Two', slug: 'source-line-4' },
        ]);
    });
    it('ignores fenced and indented code, nested headings and HTML blocks', () => {
        expect(sourceHeadings('````\n# Hidden\n```\n# Still hidden\n````\n\n    # Code\n\n> # Quote\n\n<div>\n# HTML\n</div>\n\n# Visible\n')).toEqual([
            { lvl: 1, content: 'Visible', slug: 'source-line-14' },
        ]);
    });
    it('skips frontmatter without changing CRLF source addresses', () => {
        expect(sourceHeadings('---\r\ntitle: Header\r\n---\r\n\r\n# Visible\r\n')).toEqual([
            { lvl: 1, content: 'Visible', slug: 'source-line-4' },
        ]);
    });
    it('retains heading source text without rendering unsafe HTML', () => {
        expect(sourceHeadings('# **Bold** <img src=x>\n')[0].content).toBe('**Bold** <img src=x>');
    });
    it('does not treat an unclosed frontmatter-like block as a removable prefix', () => {
        expect(sourceHeadings('---\n\n# Visible\n')[0].slug).toBe('source-line-2');
    });
});
