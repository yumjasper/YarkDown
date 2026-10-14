import type Parent from '../../block/base/parent';
import type AtxHeading from '../../block/commonMark/atxHeading';
import type SetextHeading from '../../block/commonMark/setextHeading';
import type DiagramBlock from '../../block/extra/diagram';
import { toolbarIconUrl } from '../toolbarIcons';

const bulletListIcon = toolbarIconUrl('list');
const vegaIcon = toolbarIconUrl('chart');
const codeIcon = toolbarIconUrl('code');
const flowchartIcon = toolbarIconUrl('diagram');
const footnoteIcon = toolbarIconUrl('footnote');
const frontMatterIcon = toolbarIconUrl('frontmatter');
const header1Icon = toolbarIconUrl('heading-1');
const header2Icon = toolbarIconUrl('heading-2');
const header3Icon = toolbarIconUrl('heading-3');
const header4Icon = toolbarIconUrl('heading-4');
const header5Icon = toolbarIconUrl('heading-5');
const header6Icon = toolbarIconUrl('heading-6');
const thematicBreakIcon = toolbarIconUrl('line');
const htmlIcon = toolbarIconUrl('code');
const mathBlockIcon = toolbarIconUrl('math');
const mermaidIcon = toolbarIconUrl('diagram');
const tableIcon = toolbarIconUrl('table');
const orderListIcon = toolbarIconUrl('ordered-list');
const paragraphIcon = toolbarIconUrl('paragraph');
const plantumlIcon = toolbarIconUrl('diagram');
const quoteIcon = toolbarIconUrl('quote');
const sequenceIcon = toolbarIconUrl('diagram');
const taskListIcon = toolbarIconUrl('task-list');

const HEADING_ICONS = [
    header1Icon,
    header2Icon,
    header3Icon,
    header4Icon,
    header5Icon,
    header6Icon,
];

const DIAGRAM_ICONS = {
    'plantuml': plantumlIcon,
    'mermaid': mermaidIcon,
    'vega-lite': vegaIcon,
    'flowchart': flowchartIcon,
    'sequence': sequenceIcon,
};

export function getIcon(block: Parent) {
    const { blockName } = block;
    switch (blockName) {
        case 'frontmatter':
            return frontMatterIcon;

        case 'paragraph':
            return paragraphIcon;

        case 'block-quote':
            return quoteIcon;

        case 'bullet-list':
            return bulletListIcon;

        case 'order-list':
            return orderListIcon;

        case 'task-list':
            return taskListIcon;

        case 'code-block':
            return codeIcon;

        case 'atx-heading':
            return HEADING_ICONS[(block as AtxHeading).meta.level - 1];

        case 'setext-heading':
            return HEADING_ICONS[(block as SetextHeading).meta.level - 1];

        case 'thematic-break':
            return thematicBreakIcon;

        case 'table':
            return tableIcon;

        case 'html-block':
            return htmlIcon;

        case 'math-block':
            return mathBlockIcon;

        case 'diagram':
            return DIAGRAM_ICONS[(block as DiagramBlock).meta.type];

        case 'footnote':
            return footnoteIcon;

        default:
            return paragraphIcon;
    }
}
