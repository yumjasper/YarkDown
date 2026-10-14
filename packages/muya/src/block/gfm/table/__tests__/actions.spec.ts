// @vitest-environment happy-dom
import type TableBodyCell from '../cell';
import { afterEach, describe, expect, it } from 'vitest';
import { Muya } from '../../../../muya';
import { getTableCell, performTableAction, resizeTable, tableActionDisabled } from '../actions';

const editors: Muya[] = [];
const markdown = '| Topic | Link |\n| :--- | ---: |\n| Alpha | One |\n| Beta | Two |';
function boot() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown });
    muya.init();
    editors.push(muya);
    const cell = getTableCell(muya, muya.domNode.querySelector('td'))!;
    return { muya, cell };
}
afterEach(() => {
    for (const editor of editors.splice(0))
        editor.destroy();
});
describe('table operations preserve content and cell alignment', () => {
    it('grows, keeps existing cells and inherits alignment in new rows', () => {
        const { cell } = boot();
        const next = resizeTable(cell, 5, 3)!;
        const state = next.table.getState();
        expect(state.children).toHaveLength(5);
        expect(state.children[2].children[1].text).toBe('Two');
        expect(state.children[4].children[1].meta.align).toBe('right');
        expect(state.children[4].children[2].text).toBe('');
        expect(next.outMostBlock).toBeTruthy();
    });
    it('shrinks only trailing cells and rejects invalid sizes', () => {
        const { cell } = boot();
        const before = cell.table.getState();
        expect(resizeTable(cell, 0, 2)).toBeNull();
        expect(resizeTable(cell, Number.NaN, 2)).toBeNull();
        expect(cell.table.getState()).toEqual(before);
        const next = resizeTable(cell, 2, 1)!;
        expect(next.table.getState().children.map(row => row.children.map(entry => entry.text))).toEqual([['Topic'], ['Alpha']]);
    });
    it('moves body rows while preserving the header', () => {
        const { muya, cell } = boot();
        const last = cell.table.cellAt(2, 0)!;
        performTableAction(last, 'row-up');
        const next = getTableCell(muya, muya.domNode.querySelector('td'))!;
        expect(next.table.getState().children.map(row => row.children[0].text)).toEqual(['Topic', 'Beta', 'Alpha']);
        expect(tableActionDisabled(next, 'row-down')).toBe(true);
    });
    it('moves whole columns with their alignment and exports a complete table', () => {
        const { muya, cell } = boot();
        performTableAction(cell, 'column-next');
        const next = getTableCell(muya, muya.domNode.querySelector('td'))!;
        expect(next.table.getState().children[0].children.map(entry => entry.text)).toEqual(['Link', 'Topic']);
        expect(next.table.getState().children[0].children[0].meta.align).toBe('right');
        expect(performTableAction(next, 'copy')).toContain('Beta');
        expect(performTableAction(next, 'copy')).toContain('---:');
    });
    it('inserts and removes rows and columns with a surviving caret', () => {
        const { muya, cell } = boot();
        performTableAction(cell, 'row-below');
        let next = getTableCell(muya)!;
        expect(next.table.rowCount).toBe(4);
        performTableAction(next, 'column-right');
        next = getTableCell(muya)!;
        expect(next.table.columnCount).toBe(3);
        performTableAction(next, 'delete-column');
        next = getTableCell(muya)!;
        expect(next.table.columnCount).toBe(2);
        performTableAction(next, 'delete-row');
        expect(getTableCell(muya)!.table.rowCount).toBe(3);
    });
    it('deletes a lone table without leaving the document uneditable', () => {
        const { muya, cell } = boot();
        performTableAction(cell as TableBodyCell, 'delete-table');
        expect(muya.domNode.querySelector('table')).toBeNull();
        expect(muya.domNode.querySelector('.mu-paragraph-content')).not.toBeNull();
    });
    it('deleting the last column creates an editable paragraph', () => {
        const { muya, cell } = boot();
        const next = resizeTable(cell, 1, 1)!;
        performTableAction(next, 'delete-column');
        expect(muya.domNode.querySelector('table')).toBeNull();
        expect(muya.domNode.querySelector('.mu-paragraph-content')).not.toBeNull();
        expect(tableActionDisabled(next, 'copy')).toBe(true);
    });
});
