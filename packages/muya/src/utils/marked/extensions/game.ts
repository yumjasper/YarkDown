import type { MarkedExtension } from 'marked';

export default function gameExtension(): MarkedExtension {
    return {
        extensions: [{
            name: 'gameDirective',
            level: 'block',
            start(src: string) {
                const match = /\r?\n::game[\t ]+[a-z0-9-]+[\t ]*(?:\r?\n|$)/.exec(src);
                return match ? match.index + (src[match.index] === '\r' ? 2 : 1) : undefined;
            },
            tokenizer(src: string) {
                const match = /^::game[\t ]+[a-z0-9-]+[\t ]*(?:\r?\n|$)/.exec(src);
                if (!match)
                    return;
                const text = match[0].replace(/\r?\n$/, '');
                // The directive stays ordinary paragraph state, so Markdown history and copy remain lossless.
                return { type: 'gameDirective', raw: match[0], text };
            },
            renderer(token) {
                return `<p>${String(token.text)}</p>\n`;
            },
        }],
    };
}
