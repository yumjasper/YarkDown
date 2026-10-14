import type Parent from '../../block/base/parent';
import type {
    IQuickInsertMenuItem,
} from '../paragraphQuickInsertMenu/config';
import { canTurnInto } from '../../block/blockTransforms';
import { isOsx } from '../../config';
import {
    MENU_CONFIG,
} from '../paragraphQuickInsertMenu/config';
import { toolbarIconUrl } from '../toolbarIcons';

const copyIcon = toolbarIconUrl('copy');
const deleteIcon = toolbarIconUrl('delete');
const newIcon = toolbarIconUrl('paragraph');

const ALL_MENU_CONFIG = MENU_CONFIG.reduce(
    (acc, section) => [...acc, ...section.children],
    [] as IQuickInsertMenuItem['children'],
);

const COMMAND_KEY = isOsx ? '⌘' : '⌃';

export const FRONT_MENU = [
    {
        icon: copyIcon,
        label: 'duplicate',
        text: 'Duplicate',
        shortCut: `⇧${COMMAND_KEY}P`,
    },
    {
        icon: newIcon,
        label: 'new',
        text: 'New Paragraph',
        shortCut: `⇧${COMMAND_KEY}N`,
    },
    {
        icon: deleteIcon,
        label: 'delete',
        text: 'Delete',
        shortCut: `⇧${COMMAND_KEY}D`,
    },
];

export type FrontMenuIcon = (typeof FRONT_MENU)[number];

export function canTurnIntoMenu(block: Parent) {
    return ALL_MENU_CONFIG.filter(item => canTurnInto(block, item.label));
}
