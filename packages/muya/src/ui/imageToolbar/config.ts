import { toolbarIconUrl } from '../toolbarIcons';

const middleIcon = toolbarIconUrl('align-center');
const leftIcon = toolbarIconUrl('align-left');
const rightIcon = toolbarIconUrl('align-right');
const deleteIcon = toolbarIconUrl('delete');
const editIcon = toolbarIconUrl('edit');
const inlineIcon = toolbarIconUrl('inline');

const icons = [
    {
        type: 'edit',
        tooltip: 'Edit Image',
        icon: editIcon,
    },
    {
        type: 'inline',
        tooltip: 'Inline Image',
        icon: inlineIcon,
    },
    {
        type: 'left',
        tooltip: 'Align Left',
        icon: leftIcon,
    },
    {
        type: 'center',
        tooltip: 'Align Center',
        icon: middleIcon,
    },
    {
        type: 'right',
        tooltip: 'Align Right',
        icon: rightIcon,
    },
    {
        type: 'delete',
        tooltip: 'Remove Image',
        icon: deleteIcon,
    },
];

export default icons;

export type Icon = typeof icons[number];
