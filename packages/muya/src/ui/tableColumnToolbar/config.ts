import { toolbarIconUrl } from '../toolbarIcons';

const alignCenterIcon = toolbarIconUrl('align-center');
const alignLeftIcon = toolbarIconUrl('align-left');
const alignRightIcon = toolbarIconUrl('align-right');
const insertLeftIcon = toolbarIconUrl('column-left');
const insertRightIcon = toolbarIconUrl('column-right');
const removeColumnIcon = toolbarIconUrl('column-remove');

const icons = [
    {
        type: 'left',
        tooltip: 'Align Left',
        icon: alignLeftIcon,
    },
    {
        type: 'center',
        tooltip: 'Align Center',
        icon: alignCenterIcon,
    },
    {
        type: 'right',
        tooltip: 'Align Right',
        icon: alignRightIcon,
    },
    {
        type: 'insert left',
        tooltip: 'Insert Column left',
        icon: insertLeftIcon,
    },
    {
        type: 'insert right',
        tooltip: 'Insert Column right',
        icon: insertRightIcon,
    },
    {
        type: 'remove',
        tooltip: 'Remove Column',
        icon: removeColumnIcon,
    },
];

export type TableColumnToolIcon = typeof icons[number];

export default icons;
