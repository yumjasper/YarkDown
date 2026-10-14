import { toolbarIconUrl } from '../toolbarIcons';

const linkJumpIcon = toolbarIconUrl('jump');
const unlinkIcon = toolbarIconUrl('unlink');

const icons = [
    {
        type: 'unlink',
        icon: unlinkIcon,
    },
    {
        type: 'jump',
        icon: linkJumpIcon,
    },
];

export default icons;
