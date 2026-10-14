import type Table from '.';
import type { Muya } from '../../../muya';
import type { ITableState } from '../../../state/types';
import type TableBodyCell from './cell';
import { BLOCK_DOM_PROPERTY } from '../../../config';
import StateToMarkdown from '../../../state/stateToMarkdown';
import { ScrollPage } from '../../scrollPage';

export const tableActions = [
    'row-above',
    'row-below',
    'column-left',
    'column-right',
    'row-up',
    'row-down',
    'column-previous',
    'column-next',
    'delete-row',
    'delete-column',
    'copy',
    'format',
    'delete-table',
] as const;
export type TTableAction = typeof tableActions[number];

export function getTableCell(muya: Muya, target?: Element | null): TableBodyCell | null {
    const element = target?.closest('td,th');
    if (element && muya.domNode.contains(element))
        return element[BLOCK_DOM_PROPERTY] as TableBodyCell;
    const block = muya.editor.activeContentBlock;
    return block?.blockName === 'table.cell.content' ? block.parent as TableBodyCell : null;
}

export function tableActionDisabled(cell: TableBodyCell, action: TTableAction): boolean {
    if (!cell.outMostBlock)
        return true;
    const { rowOffset: row, columnOffset: column, table } = cell;
    switch (action) {
        case 'row-up': return row <= 1;
        case 'row-down': return row === 0 || row >= table.rowCount - 1;
        case 'column-previous': return column === 0;
        case 'column-next': return column >= table.columnCount - 1;
        default: return false;
    }
}

function replaceTable(table: Table, state: ITableState, row: number, column: number) {
    const replacement: Table = ScrollPage.loadBlock('table').create(table.muya, state);
    table.replaceWith(replacement);
    const cell = replacement.cellAt(Math.min(row, replacement.rowCount - 1), Math.min(column, replacement.columnCount - 1));
    cell?.firstContentInDescendant()?.setCursor(0, 0, true);
    return cell;
}

export function resizeTable(cell: TableBodyCell, rows: number, columns: number) {
    if (!cell.outMostBlock || !Number.isInteger(rows) || !Number.isInteger(columns)
        || rows < 1 || rows > 200 || columns < 1 || columns > 50) {
        return null;
    }
    const state = cell.table.getState();
    const header = state.children[0];
    state.children = Array.from({ length: rows }, (_, r) => ({
        name: 'table.row',
        children: Array.from({ length: columns }, (_, c) => state.children[r]?.children[c] ?? {
            name: 'table.cell',
            text: '',
            meta: { align: header.children[c]?.meta.align ?? 'none' },
        }),
    }));
    return replaceTable(cell.table, state, cell.rowOffset, cell.columnOffset);
}

export function performTableAction(cell: TableBodyCell, action: TTableAction): string | undefined {
    if (!cell.outMostBlock || tableActionDisabled(cell, action))
        return;
    const { table, rowOffset: row, columnOffset: column } = cell;
    let cursor;
    switch (action) {
        case 'row-above':
            cursor = table.insertRow(row);
            break;
        case 'row-below':
            cursor = table.insertRow(row + 1);
            break;
        case 'column-left':
            cursor = table.insertColumn(column);
            break;
        case 'column-right':
            cursor = table.insertColumn(column + 1);
            break;
        case 'delete-row':
            if (table.rowCount === 1)
                return performTableAction(cell, 'delete-table');
            cursor = table.removeRow(row);
            break;
        case 'delete-column':
            if (table.columnCount === 1)
                return performTableAction(cell, 'delete-table');
            cursor = table.removeColumn(column);
            break;
        case 'copy': return new StateToMarkdown().generate([table.getState()]);
        case 'delete-table': {
            cursor = table.nextContentInContext() ?? table.previousContentInContext();
            if (!cursor) {
                cell.firstContentInDescendant()?.setCursor(0, 0, true);
                table.muya.insertParagraph('after', '', true);
                cursor = table.nextContentInContext();
            }
            table.remove();
            break;
        }
        default: {
            const state = table.getState();
            let nextRow = row;
            let nextColumn = column;
            if (action === 'row-up' || action === 'row-down') {
                nextRow += action === 'row-up' ? -1 : 1;
                [state.children[row], state.children[nextRow]] = [state.children[nextRow], state.children[row]];
            }
            if (action === 'column-previous' || action === 'column-next') {
                nextColumn += action === 'column-previous' ? -1 : 1;
                for (const entry of state.children)
                    [entry.children[column], entry.children[nextColumn]] = [entry.children[nextColumn], entry.children[column]];
            }
            replaceTable(table, state, nextRow, nextColumn);
            return;
        }
    }
    cursor?.setCursor(0, 0, true);
}
