import { Lexer } from 'marked';

export interface ISourceHeading {
    lvl: number;
    content: string;
    slug: string;
}

/** Top-level headings with source-line addresses, independent of the editor and HTML rendering. */
export function sourceHeadings(markdown: string): ISourceHeading[] {
    const frontmatter = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(markdown)?.[0] ?? '';
    const source = markdown.slice(frontmatter.length).replace(/\r\n/g, '\n');
    let line = frontmatter.split('\n').length - 1;
    const headings: ISourceHeading[] = [];
    for (const token of Lexer.lex(source)) {
        if (token.type === 'heading') {
            headings.push({ lvl: token.depth, content: token.text, slug: `source-line-${line}` });
        }
        line += (token.raw.match(/\n/g) ?? []).length;
    }
    return headings;
}
