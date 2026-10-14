import type { Muya } from '../../muya';
import type { ITocItem } from '../../state/getTOC';
import type { ITocState } from '../../state/types';
import { escapeHTML } from '../../utils';
import Parent from '../base/parent';

/**
 * A `[TOC]` marker rendered as a live outline.
 *
 * The entry list is not part of the block state: the outline always mirrors the
 * document's current headings, so re-rendering this block on every edit would
 * otherwise push an op per keystroke. The DOM is rebuilt from `getTOC()` on
 * refresh instead.
 */
class TocBlock extends Parent {
    static override blockName = 'toc';

    static create(muya: Muya, state: ITocState) {
        const tocBlock = new TocBlock(muya, state);

        return tocBlock;
    }

    override get path() {
        const { path: pPath } = this.parent!;
        const offset = this.parent!.offset(this);

        return [...pPath, offset];
    }

    constructor(muya: Muya, _state: ITocState) {
        super(muya);
        this.tagName = 'div';
        this.classList = ['mu-toc-block'];
        this.attributes = {
            spellcheck: 'false',
            contenteditable: 'false',
        };
        this.createDomNode();
        this.update();
        // At construction time the block is being appended to a half-built
        // tree, so `getTOC()` still sees no headings. Re-render once the
        // document is in the DOM, and on every later mutation.
        requestAnimationFrame(() => this.update());
        this.muya.on('json-change', this._onDocumentChange);
    }

    private _onDocumentChange = () => {
        this.update();
    };

    override getState(): ITocState {
        return { name: 'toc', text: '[TOC]' };
    }

    private _buildList(
        items: ITocItem[],
        from: number,
        level: number,
    ): { list: string; next: number } {
        let html = '';
        let index = from;

        while (index < items.length) {
            const item = items[index]!;
            if (item.lvl < level)
                break;

            if (item.lvl > level) {
                const nested = this._buildList(items, index, item.lvl);
                html += `<ul>${nested.list}</ul>`;
                index = nested.next;
                continue;
            }

            const label = escapeHTML(item.content || item.contentHtml || '');
            html += `<li class="mu-toc-item mu-toc-h${item.lvl}"><span>${label}</span>`;
            index++;

            const deeper = this._buildList(items, index, level + 1);
            html += deeper.list;
            index = deeper.next;
            html += '</li>';
        }

        return { list: html, next: index };
    }

    update() {
        const items = this.muya.getTOC();
        const { list } = this._buildList(items, 0, 1);

        if (!list) {
            this.domNode!.innerHTML = '<div class="mu-toc-empty">&lt; Table of Contents &gt;</div>';
            return;
        }

        this.domNode!.innerHTML = `<div class="mu-toc-title">Table of Contents</div><ul class="mu-toc-list">${list}</ul>`;
    }
}

export default TocBlock;
