// Index-cursor → block-key cursor conversion for the source-code → WYSIWYG
// handoff. The desktop app hands back only a CodeMirror `{ line, ch }` offset
// pair when switching a tab from source mode to WYSIWYG; this resolves those
// offsets against the document's STATE tree to recover the caret's block-key
// cursor, without touching the rendered tree.

import type { TState } from '../state/types';
import type { IPathCursor, ISelection } from './types';

/** One end of a source-mode (CodeMirror) selection: a `{ line, ch }` offset. */
export interface IIndexPosition {
    line: number;
    ch: number;
}

/** A source-mode selection in CodeMirror `{ line, ch }` coordinates. */
export interface IIndexCursor {
    anchor: IIndexPosition | null;
    focus: IIndexPosition | null;
}

// Sentinel strings injected at the cursor offsets. They must be improbable in
// real markdown AND survive the markdown -> state round-trip as literal text.
// The markdown parser strips non-ASCII control/PUA characters, so the markers
// are plain ASCII with a long random-looking token unlikely to occur in real
// documents. The two markers share no common substring so neither can be
// found inside the other.
const ANCHOR_SENTINEL = 'mUyAcUrSoRzZqAnChOr9x7kPvWb';
const FOCUS_SENTINEL = 'mUyAcUrSoRzZqFoCuS4t2nDhGj';

function _clampOffset(offset: number, length: number): number {
    if (!Number.isInteger(offset))
        return 0;

    return Math.min(Math.max(offset, 0), length);
}

/**
 * Inject the anchor/focus sentinels into `markdown` at the given `{ line, ch }`
 * offsets. Returns `null` when either offset references a line that does not
 * exist (stale cursor) so the caller can fall back to no cursor restore.
 */
export function injectSentinels(
    markdown: string,
    cursor: IIndexCursor,
): string | null {
    const { anchor, focus } = cursor;
    if (!anchor || !focus)
        return null;

    const lines = markdown.split('\n');
    const isValidLine = (line: number): boolean =>
        Number.isInteger(line) && line >= 0 && line < lines.length;

    if (!isValidLine(anchor.line) || !isValidLine(focus.line))
        return null;

    const anchorText = lines[anchor.line]!;
    const focusText = lines[focus.line]!;
    const anchorCh = _clampOffset(anchor.ch, anchorText.length);
    const focusCh = _clampOffset(focus.ch, focusText.length);

    if (anchor.line === focus.line) {
        const min = Math.min(anchorCh, focusCh);
        const max = Math.max(anchorCh, focusCh);
        const first = anchorText.substring(0, min);
        const middle = anchorText.substring(min, max);
        const last = anchorText.substring(max);
        lines[anchor.line]
            = first
                + (anchorCh <= focusCh ? ANCHOR_SENTINEL : FOCUS_SENTINEL)
                + middle
                + (anchorCh <= focusCh ? FOCUS_SENTINEL : ANCHOR_SENTINEL)
                + last;
    }
    else {
        lines[anchor.line]
            = anchorText.substring(0, anchorCh) + ANCHOR_SENTINEL + anchorText.substring(anchorCh);
        lines[focus.line]
            = focusText.substring(0, focusCh) + FOCUS_SENTINEL + focusText.substring(focusCh);
    }

    return lines.join('\n');
}

/** Container state names whose children live under a `children` key. */
const CONTAINER_NAMES = new Set<string>([
    'block-quote',
    'order-list',
    'bullet-list',
    'task-list',
    'list-item',
    'task-list-item',
    'table',
    'table.row',
    'footnote',
]);

/**
 * Resolve the index cursor against a sentinel-bearing STATE tree instead of the
 * rendered block tree, returning the same `IPathCursor` shape the block-tree
 * resolver produces.
 *
 * A content block's path is exactly the json path of its `text` field (see
 * `Content.path`: the parent path plus `'text'`, and container paths insert a
 * `'children'` segment), so walking the state array with that same layout yields
 * paths `queryBlock` can resolve. Doing it here avoids the two whole-document
 * `setContent` rebuilds the block-tree route required: on the 653-block math
 * tutorial those rebuilds cost a 959 ms frozen frame when leaving source mode,
 * while this walk is a plain array traversal.
 *
 * Returns `null` when neither sentinel survives parsing.
 */
export function resolveSentinelPaths(
    states: TState[],
): IPathCursor | null {
    const hits = new Map<string, { path: (string | number)[]; offset: number }>();

    const visit = (nodes: TState[], prefix: (string | number)[]) => {
        nodes.forEach((node, index) => {
            const nodePath = [...prefix, index];

            if (node.name === 'table.cell') {
                // Mirrors `Cell.path`: parent path + 'children' + offset.
                _recordSentinel(hits, node.text, [...nodePath], 'text');
                return;
            }

            if (CONTAINER_NAMES.has(node.name)) {
                // Mirrors every container's `get path`: own path + 'children'.
                const children = (node as { children?: TState[] }).children;

                if (children)
                    visit(children, [...nodePath, 'children']);

                return;
            }

            const text = (node as { text?: string }).text;

            if (typeof text === 'string')
                _recordSentinel(hits, text, nodePath, 'text');
        });
    };

    visit(states, []);

    const anchorHit = hits.get(ANCHOR_SENTINEL);
    const focusHit = hits.get(FOCUS_SENTINEL);

    if (!anchorHit && !focusHit)
        return null;

    const anchor = anchorHit ?? focusHit!;
    const focus = focusHit ?? anchorHit!;

    let anchorOffset = anchor.offset;
    let focusOffset = focus.offset;
    const sameBlock
        = anchor.path.length === focus.path.length
            && anchor.path.every((segment, index) => segment === focus.path[index]);

    // When both sentinels live in the same block, the second one's recorded
    // offset is shifted by the first sentinel's length.
    if (sameBlock) {
        if (anchorOffset <= focusOffset)
            focusOffset = Math.max(focusOffset - ANCHOR_SENTINEL.length, anchorOffset);
        else
            anchorOffset = Math.max(anchorOffset - FOCUS_SENTINEL.length, focusOffset);
    }

    return {
        anchor: { offset: anchorOffset },
        anchorPath: anchor.path,
        focus: { offset: focusOffset },
        focusPath: focus.path,
    };
}

/** Record a sentinel found in one block's text, keyed by the sentinel itself. */
function _recordSentinel(
    hits: Map<string, { path: (string | number)[]; offset: number }>,
    text: string,
    path: (string | number)[],
    leafKey: string,
) {
    for (const sentinel of [ANCHOR_SENTINEL, FOCUS_SENTINEL]) {
        if (hits.has(sentinel))
            continue;

        const offset = text.indexOf(sentinel);

        if (offset > -1)
            hits.set(sentinel, { path: [...path, leafKey], offset });
    }
}

// INVERSE direction: WYSIWYG block-key selection -> source `{ line, ch }` index
// cursor, reusing the same sentinel/serialize path as the forward conversion.

/**
 * Walk a (cloned) state tree along a content block's json1 `path` — which ends
 * in the `'text'` key — and splice `sentinel` into that block's text at
 * `offset` (clamped). Returns `false` when the path does not resolve to a node
 * carrying a string `text` field (e.g. a non-content block), so the caller can
 * bail out. Mutates `state` in place; the caller passes a throwaway clone.
 */
function _injectSentinelAtPath(
    state: TState[],
    path: (string | number)[],
    offset: number,
    sentinel: string,
): boolean {
    if (path.length === 0)
        return false;

    // Navigate to the parent node that owns the final key.
    let node: unknown = state;
    for (let i = 0; i < path.length - 1; i++) {
        if (node == null || typeof node !== 'object')
            return false;
        node = (node as Record<string | number, unknown>)[path[i]!];
    }

    const key = path[path.length - 1]!;
    if (node == null || typeof node !== 'object')
        return false;

    const holder = node as Record<string | number, unknown>;
    const text = holder[key];
    if (typeof text !== 'string')
        return false;

    const at = _clampOffset(offset, text.length);
    holder[key] = text.substring(0, at) + sentinel + text.substring(at);

    return true;
}

/**
 * Inject the anchor/focus sentinels into a cloned `state` tree at the block
 * paths + offsets of `selection`. Returns the mutated state, or `null` when
 * neither endpoint resolves to a content block's text (so the caret can't be
 * located in the serialized markdown).
 *
 * When anchor and focus share a block, the sentinel at the SMALLER offset is
 * injected first (unshifted) and the one at the larger offset second, with its
 * offset bumped by the first sentinel's length — handling both forward and
 * backward selections. `_injectSentinelAtPath` re-reads the text on each call,
 * so injecting the earlier one first keeps the later offset valid.
 */
export function injectStateSentinels(
    state: TState[],
    selection: ISelection,
): TState[] | null {
    const anchorPath = selection.anchor.path;
    const focusPath = selection.focus.path;
    const anchorOffset = selection.anchor.offset;
    const focusOffset = selection.focus.offset;

    const sameBlock
        = anchorPath.length === focusPath.length
            && anchorPath.every((seg, i) => seg === focusPath[i]);

    const inject = (
        path: (string | number)[],
        offset: number,
        sentinel: string,
    ): boolean => _injectSentinelAtPath(state, path, offset, sentinel);

    if (!sameBlock) {
        // Different blocks (or different lines): the injections never overlap.
        const anchorOk = inject(anchorPath, anchorOffset, ANCHOR_SENTINEL);
        const focusOk = inject(focusPath, focusOffset, FOCUS_SENTINEL);

        return anchorOk || focusOk ? state : null;
    }

    // Same block: inject the earlier offset first (unshifted), then the later
    // one shifted by the first sentinel's length.
    let ok: boolean;
    if (anchorOffset <= focusOffset) {
        ok = inject(anchorPath, anchorOffset, ANCHOR_SENTINEL);
        ok = inject(focusPath, focusOffset + ANCHOR_SENTINEL.length, FOCUS_SENTINEL) || ok;
    }
    else {
        ok = inject(focusPath, focusOffset, FOCUS_SENTINEL);
        ok = inject(anchorPath, anchorOffset + FOCUS_SENTINEL.length, ANCHOR_SENTINEL) || ok;
    }

    return ok ? state : null;
}

/**
 * Count the `\n` characters in `markdown` before `idx` (= the 0-based line of
 * `idx`) without allocating an intermediate array — this can run on large
 * documents. `lastIndexOf` is a native scan, so the column is cheap too.
 */
function _lineColAt(markdown: string, idx: number): IIndexPosition {
    let line = 0;
    for (let i = 0; i < idx; i++) {
        if (markdown.charCodeAt(i) === 10 /* \n */)
            line++;
    }
    const lastNewline = markdown.lastIndexOf('\n', idx - 1);

    return { line, ch: idx - (lastNewline + 1) };
}

/** Locate `sentinel` in `markdown` and return its `{ line, ch }`, or `null`. */
function _findOffsetInMarkdown(
    markdown: string,
    sentinel: string,
): IIndexPosition | null {
    const idx = markdown.indexOf(sentinel);
    if (idx === -1)
        return null;

    return _lineColAt(markdown, idx);
}

/**
 * Read the sentinel positions back out of the serialized (sentinel-bearing)
 * `markdown` into an `{ line, ch }` index cursor. Returns `null` when a
 * sentinel that was injected cannot be found (e.g. a serializer dropped the
 * surrounding text). Removes both sentinels from the line/ch accounting: the
 * focus position is corrected for any earlier-occurring anchor sentinel.
 */
export function locateSentinelOffsets(markdown: string): IIndexCursor | null {
    const anchorRaw = _findOffsetInMarkdown(markdown, ANCHOR_SENTINEL);
    const focusRaw = _findOffsetInMarkdown(markdown, FOCUS_SENTINEL);

    if (!anchorRaw && !focusRaw)
        return null;

    // Compute each sentinel's flat index so we can subtract the length of any
    // OTHER sentinel that precedes it (sentinels never share the same index).
    const anchorIdx = markdown.indexOf(ANCHOR_SENTINEL);
    const focusIdx = markdown.indexOf(FOCUS_SENTINEL);

    const cleanLineCh = (
        raw: IIndexPosition | null,
        ownIdx: number,
        otherIdx: number,
        otherLen: number,
    ): IIndexPosition | null => {
        if (!raw)
            return null;
        // Only same-line earlier sentinels shift `ch`; earlier-line ones don't.
        if (otherIdx !== -1 && otherIdx < ownIdx) {
            const otherLine = _lineColAt(markdown, otherIdx).line;
            if (otherLine === raw.line)
                return { line: raw.line, ch: raw.ch - otherLen };
        }

        return raw;
    };

    const anchor = cleanLineCh(anchorRaw, anchorIdx, focusIdx, FOCUS_SENTINEL.length);
    const focus = cleanLineCh(focusRaw, focusIdx, anchorIdx, ANCHOR_SENTINEL.length);

    return {
        anchor: anchor ?? focus,
        focus: focus ?? anchor,
    };
}
