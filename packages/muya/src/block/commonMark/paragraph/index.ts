import type { Muya } from '../../../muya';
import type { IParagraphState } from '../../../state/types';
import type ParagraphContent from '../../content/paragraphContent';
import { CLASS_NAMES } from '../../../config';
import { mixins } from '../../../utils';
import { parseGameDirective } from '../../../utils/gameDirective';
import Parent from '../../base/parent';
import GamePreview from '../../extra/gamePreview';
import LeafQueryBlock from '../../mixins/leafQueryBlock';
import { ScrollPage } from '../../scrollPage';

@mixins(LeafQueryBlock)
class Paragraph extends Parent {
    static override blockName = 'paragraph';

    static create(muya: Muya, state: IParagraphState) {
        const paragraph = new Paragraph(muya);

        paragraph.append(
            ScrollPage.loadBlock('paragraph.content').create(muya, state.text),
        );
        paragraph.updateGamePreview(state.text);

        return paragraph;
    }

    override get path() {
        const { path: pPath } = this.parent!;
        const offset = this.parent!.offset(this);

        return [...pPath, offset];
    }

    constructor(muya: Muya) {
        super(muya);
        this.tagName = 'p';
        this.classList = [CLASS_NAMES.MU_PARAGRAPH];
        this.createDomNode();
    }

    updateGamePreview(text: string) {
        const id = parseGameDirective(text);
        const preview = this.attachments.head;
        if (preview?.domNode?.dataset.game === id)
            return;
        if (preview instanceof GamePreview) {
            this.attachments.remove(preview);
            preview.domNode?.remove();
        }
        this.domNode?.classList.toggle('mu-game-block', !!id);
        if (id)
            this.appendAttachment(new GamePreview(this.muya, id));
    }

    override getState(): IParagraphState {
        return {
            name: 'paragraph',
            text: (this.children.head as ParagraphContent).text,
        };
    }
}

export default Paragraph;
