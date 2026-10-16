import type { Muya } from '../../muya';
import Parent from '../base/parent';

export default class GamePreview extends Parent {
    static override blockName = 'game-preview';

    constructor(muya: Muya, id: string) {
        super(muya);
        this.tagName = 'span';
        this.classList = ['mu-game-preview'];
        this.attributes = { contenteditable: 'false', spellcheck: 'false' };
        this.datasets = { game: id };
        this.createDomNode();
    }
}
