import { isOsx } from '../../config';
import { isKeyboardEvent } from '../../utils';
import { toolbarIconUrl } from '../toolbarIcons';

const bulletListIcon = toolbarIconUrl('list');
const vegaIcon = toolbarIconUrl('chart');
const codeIcon = toolbarIconUrl('code');
const flowchartIcon = toolbarIconUrl('diagram');
const frontMatterIcon = toolbarIconUrl('frontmatter');
const header1Icon = toolbarIconUrl('heading-1');
const header2Icon = toolbarIconUrl('heading-2');
const header3Icon = toolbarIconUrl('heading-3');
const header4Icon = toolbarIconUrl('heading-4');
const header5Icon = toolbarIconUrl('heading-5');
const header6Icon = toolbarIconUrl('heading-6');
const hrIcon = toolbarIconUrl('line');
const htmlIcon = toolbarIconUrl('code');
const mathBlockIcon = toolbarIconUrl('math');
const mermaidIcon = toolbarIconUrl('diagram');
const newTableIcon = toolbarIconUrl('table');
const orderListIcon = toolbarIconUrl('ordered-list');
const paragraphIcon = toolbarIconUrl('paragraph');
const plantumlIcon = toolbarIconUrl('diagram');
const quoteIcon = toolbarIconUrl('quote');
const sequenceIcon = toolbarIconUrl('diagram');

const todoListIcon = toolbarIconUrl('task-list');

const COMMAND_KEY = isOsx ? '⌘' : 'Ctrl';
const OPTION_KEY = isOsx ? '⌥' : 'Alt';
const SHIFT_KEY = isOsx ? '⇧' : 'Shift';

// Command (or Cmd) ⌘
// Shift ⇧
// Option (or Alt) ⌥
// Control (or Ctrl) ⌃
// Caps Lock ⇪
// Fn

export interface IQuickInsertMenuItem {
    name: string;
    children: {
        title: string;
        subTitle: string;
        label: string;
        icon: string;
        score?: number;
        i18nTitle?: string;
        shortCut?: string;
        shortKeyMap?: {
            altKey: boolean;
            shiftKey: boolean;
            metaKey: boolean;
            code: string;
        };
    }[];
}

export const MENU_CONFIG: IQuickInsertMenuItem[] = [
    {
        name: 'basic blocks',
        children: [
            {
                title: 'Paragraph',
                subTitle: 'Lorem Ipsum text',
                label: 'paragraph',
                shortCut: `${COMMAND_KEY}+0`,
                shortKeyMap: {
                    altKey: false,
                    shiftKey: false,
                    metaKey: true,
                    code: 'Digit0',
                },
                icon: paragraphIcon,
            },
            {
                title: 'Horizontal Line',
                subTitle: '---',
                label: 'thematic-break',
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+-`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'Minus',
                },
                icon: hrIcon,
            },
            {
                title: 'Front Matter',
                subTitle: '--- Lorem Ipsum ---',
                label: 'frontmatter',
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+Y`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'KeyY',
                },
                icon: frontMatterIcon,
            },
        ],
    },
    {
        name: 'headings',
        children: [
            {
                title: 'Heading 1',
                subTitle: '# Lorem Ipsum...',
                label: 'atx-heading 1',
                shortCut: `${COMMAND_KEY}+1`,
                shortKeyMap: {
                    altKey: false,
                    shiftKey: false,
                    metaKey: true,
                    code: 'Digit1',
                },
                icon: header1Icon,
            },
            {
                title: 'Heading 2',
                subTitle: '## Lorem Ipsum...',
                label: 'atx-heading 2',
                shortCut: `${COMMAND_KEY}+2`,
                shortKeyMap: {
                    altKey: false,
                    shiftKey: false,
                    metaKey: true,
                    code: 'Digit2',
                },
                icon: header2Icon,
            },
            {
                title: 'Heading 3',
                subTitle: '### Lorem Ipsum...',
                label: 'atx-heading 3',
                shortCut: `${COMMAND_KEY}+3`,
                shortKeyMap: {
                    altKey: false,
                    shiftKey: false,
                    metaKey: true,
                    code: 'Digit3',
                },
                icon: header3Icon,
            },
            {
                title: 'Heading 4',
                subTitle: '#### Lorem Ipsum...',
                label: 'atx-heading 4',
                shortCut: `${COMMAND_KEY}+4`,
                shortKeyMap: {
                    altKey: false,
                    shiftKey: false,
                    metaKey: true,
                    code: 'Digit4',
                },
                icon: header4Icon,
            },
            {
                title: 'Heading 5',
                subTitle: '##### Lorem Ipsum...',
                label: 'atx-heading 5',
                shortCut: `${COMMAND_KEY}+5`,
                shortKeyMap: {
                    altKey: false,
                    shiftKey: false,
                    metaKey: true,
                    code: 'Digit5',
                },
                icon: header5Icon,
            },
            {
                title: 'Heading 6',
                subTitle: '###### Lorem Ipsum...',
                label: 'atx-heading 6',
                shortCut: `${COMMAND_KEY}+6`,
                shortKeyMap: {
                    altKey: false,
                    shiftKey: false,
                    metaKey: true,
                    code: 'Digit6',
                },
                icon: header6Icon,
            },
        ],
    },
    {
        name: 'advanced blocks',
        children: [
            {
                title: 'Table Block',
                subTitle: '|Lorem | Ipsum |',
                label: 'table',
                // no
                shortCut: `${SHIFT_KEY}+${COMMAND_KEY}+T`,
                shortKeyMap: {
                    altKey: false,
                    shiftKey: true,
                    metaKey: true,
                    code: 'KeyT',
                },
                icon: newTableIcon,
            },
            {
                title: 'Display Math',
                subTitle: '$$ Lorem Ipsum $$',
                label: 'math-block',
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+M`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'KeyM',
                },
                icon: mathBlockIcon,
            },
            {
                title: 'HTML Block',
                subTitle: '<div> Lorem Ipsum </div>',
                label: 'html-block',
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+J`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'KeyJ',
                },
                icon: htmlIcon,
            },
            {
                title: 'Code Block',
                subTitle: '```java Lorem Ipsum ```',
                label: 'code-block',
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+C`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'KeyC',
                },
                icon: codeIcon,
            },
            {
                title: 'Quote Block',
                subTitle: '>Lorem Ipsum ...',
                label: 'block-quote',
                // no
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+Q`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'KeyQ',
                },
                icon: quoteIcon,
            },
        ],
    },
    {
        name: 'list blocks',
        children: [
            {
                title: 'Order List',
                subTitle: '1. Lorem Ipsum ...',
                label: 'order-list',
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+O`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'KeyO',
                },
                icon: orderListIcon,
            },
            {
                title: 'Bullet List',
                subTitle: '- Lorem Ipsum ...',
                label: 'bullet-list',
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+U`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'KeyU',
                },
                icon: bulletListIcon,
            },
            {
                title: 'To-do List',
                subTitle: '- [x] Lorem Ipsum ...',
                label: 'task-list',
                shortCut: `${OPTION_KEY}+${COMMAND_KEY}+X`,
                shortKeyMap: {
                    altKey: true,
                    shiftKey: false,
                    metaKey: true,
                    code: 'KeyX',
                },
                icon: todoListIcon,
            },
        ],
    },
    {
        name: 'diagrams',
        children: [
            {
                title: 'Vega Chart',
                subTitle: 'By vega-lite.js',
                label: 'diagram vega-lite',
                icon: vegaIcon,
            },
            {
                title: 'Mermaid',
                subTitle: 'By mermaid',
                label: 'diagram mermaid',
                icon: mermaidIcon,
            },
            {
                title: 'Plantuml',
                subTitle: 'By plantuml',
                label: 'diagram plantuml',
                icon: plantumlIcon,
            },
            {
                title: 'Flowchart',
                subTitle: 'By flowchart.js',
                label: 'diagram flowchart',
                icon: flowchartIcon,
            },
            {
                title: 'Sequence',
                subTitle: 'By js-sequence-diagrams',
                label: 'diagram sequence',
                icon: sequenceIcon,
            },
        ],
    },
];

export function getLabelFromEvent(event: Event) {
    if (!isKeyboardEvent(event))
        return null;
    const ALL_MENU_CONFIG = MENU_CONFIG.reduce(
        (acc, section) => [...acc, ...section.children],
        [] as IQuickInsertMenuItem['children'],
    );

    const result = ALL_MENU_CONFIG.find((menu) => {
        const { code, metaKey, shiftKey, altKey } = event;
        const { shortKeyMap = {} as IQuickInsertMenuItem['children'][number]['shortKeyMap'] } = menu;

        return (
            code === shortKeyMap?.code
            && metaKey === shortKeyMap.metaKey
            && shiftKey === shortKeyMap.shiftKey
            && altKey === shortKeyMap.altKey
        );
    });

    if (result)
        return result.label;
}
