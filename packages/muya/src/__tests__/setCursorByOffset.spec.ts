// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../muya';
import { injectSentinels, resolveSentinelPaths } from '../selection/offsetCursor';

// PARITY (gap PG2): the source-code -> WYSIWYG handoff carries only a
// CodeMirror `{ line, ch }` index cursor. `setCursorByOffset` reproduces the
// legacy muyajs index->block-key cursor conversion (sentinel injection + tree
// walk) so the WYSIWYG caret lands on the block the source-mode cursor was in.

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

describe('muya.setCursorByOffset() (PG2)', () => {
    it('PG2: maps a source-mode {line, ch} cursor onto the matching paragraph block', async () => {
        const muya = bootMuya('first para\n\nsecond para\n\nthird para here\n');
        // Line 4 = "third para here" (lines: 0 first, 1 blank, 2 second, 3 blank, 4 third).
        const restored = muya.setCursorByOffset({
            anchor: { line: 4, ch: 6 },
            focus: { line: 4, ch: 6 },
        });
        expect(restored).toBe(true);

        await vi.waitFor(() => {
            const sel = muya.editor.selection.getSelection();
            expect(sel).not.toBeNull();
            expect(sel!.anchor.block.text).toBe('third para here');
            expect(sel!.anchor.offset).toBe(6);
        });
        // The document content is left clean (no sentinel residue).
        expect(muya.getMarkdown()).not.toContain('mUyAcUrSoR');
        expect(muya.getMarkdown().trim()).toBe('first para\n\nsecond para\n\nthird para here');
    });

    it('PG2: maps a cursor inside a heading block', async () => {
        const muya = bootMuya('# Title\n\nbody text\n');
        const restored = muya.setCursorByOffset({
            anchor: { line: 0, ch: 4 }, // inside "# Title" (after "# Ti")
            focus: { line: 0, ch: 4 },
        });
        expect(restored).toBe(true);
        await vi.waitFor(() => {
            const sel = muya.editor.selection.getSelection();
            // This engine keeps the `# ` marker in the heading content block's
            // text, so the caret lands at offset 4 of "# Title".
            expect(sel!.anchor.block.text).toBe('# Title');
            expect(sel!.anchor.offset).toBe(4);
        });
    });

    it('PG2: resolves a non-collapsed selection within a block to the right offsets', () => {
        // Asserted at the resolver level: happy-dom does not preserve a
        // non-collapsed DOM range across the contenteditable re-render, so the
        // DOM-readback `getSelection()` would collapse it (works in Chromium).
        // The resolver is what computes the sentinel-free anchor/focus offsets.
        const muya = bootMuya('hello world\n');
        const sentinelMarkdown = injectSentinels(muya.getMarkdown(), {
            anchor: { line: 0, ch: 0 },
            focus: { line: 0, ch: 5 },
        });
        expect(sentinelMarkdown).not.toBeNull();
        const state = muya.editor.jsonState.markdownToState(sentinelMarkdown!);
        const cursor = resolveSentinelPaths(state);
        expect(cursor).not.toBeNull();
        expect(cursor!.anchor!.offset).toBe(0);
        expect(cursor!.focus!.offset).toBe(5);
        // Both endpoints resolve to the same block (same path).
        expect(cursor!.anchorPath).toEqual(cursor!.focusPath);
    });

    it('PG2: returns false and leaves the document intact for a stale line', () => {
        const muya = bootMuya('only line\n');
        const restored = muya.setCursorByOffset({
            anchor: { line: 99, ch: 0 },
            focus: { line: 99, ch: 0 },
        });
        expect(restored).toBe(false);
        expect(muya.getMarkdown().trim()).toBe('only line');
    });

    it('PG2: returns false for a null cursor', () => {
        const muya = bootMuya('text\n');
        expect(muya.setCursorByOffset({ anchor: null, focus: null })).toBe(false);
    });

    it('PG2: leaves the undo history untouched when restoring the caret', async () => {
        const muya = bootMuya('alpha\n');
        // Seed a non-empty undo stack so we can detect a clobber. The text-setter
        // op flushes to the history on the next frame (JSONState._emitStateChange).
        const first = muya.editor.scrollPage!.firstContentInDescendant()!;
        first.setCursor(5, 5, true);
        muya.editor.activeContentBlock = first;
        first.text = 'alpha beta';
        await vi.waitFor(() => {
            expect(muya.getHistory().stack.undo.length).toBeGreaterThan(0);
        });
        const before = muya.getHistory();

        const restored = muya.setCursorByOffset({
            anchor: { line: 0, ch: 3 },
            focus: { line: 0, ch: 3 },
        });
        expect(restored).toBe(true);

        // The undo stack survives the caret-restore.
        const after = muya.getHistory();
        expect(after.stack.undo.length).toBe(before.stack.undo.length);
    });

    it('PG2: restores the caret inside a list item without rebuilding the tree', async () => {
        const muya = bootMuya('# Title\n\n- alpha\n- beta item\n\nend\n');
        const blockBefore = muya.editor.scrollPage!.firstContentInDescendant();
        // Line 3 is "- beta item" (0 heading, 1 blank, 2 first item, 3 second).
        // The list marker is not part of the item's content text, so ch=4 in the
        // source line is offset 2 inside "beta item".
        const restored = muya.setCursorByOffset({
            anchor: { line: 3, ch: 4 },
            focus: { line: 3, ch: 4 },
        });
        expect(restored).toBe(true);

        await vi.waitFor(() => {
            const sel = muya.editor.selection.getSelection();
            expect(sel).not.toBeNull();
            expect(sel!.anchor.block.text).toBe('beta item');
            expect(sel!.anchor.offset).toBe(2);
        });
        // Restoring the caret must not swap the document out from under the
        // renderer: the first content block instance is still the live one.
        expect(muya.editor.scrollPage!.firstContentInDescendant()).toBe(blockBefore);
    });

    it('PG2: resolves a cursor inside a nested block to a queryable path', () => {
        const muya = bootMuya('> quoted line\n');
        const cursor = resolveSentinelPaths(
            muya.editor.jsonState.markdownToState(
                injectSentinels(muya.getMarkdown(), {
                    anchor: { line: 0, ch: 3 },
                    focus: { line: 0, ch: 3 },
                })!,
            ),
        );
        expect(cursor).not.toBeNull();
        // The block tree must resolve the same path back to a content block,
        // which is what makes `setCursor` land in the right place.
        const block = muya.editor.scrollPage!.queryBlock([...cursor!.anchorPath!]);
        expect(block).toBeTruthy();
        expect((block as { isContent: () => boolean }).isContent()).toBe(true);
    });
});
