import type { TranslationProvider } from '../../shared/types/reading'

const selectors = (provider: TranslationProvider) =>
  provider === 'bing'
    ? { input: '#tta_input_ta', output: '#tta_output_ta' }
    : { input: 'textarea', output: 'span.ryNqvb' }

export const prepareTranslationScript = (
  provider: TranslationProvider,
  requestId: string,
  cold: boolean,
  source?: string
): string => {
  const { input, output } = selectors(provider)
  return `(() => {
    const input = document.querySelector(${JSON.stringify(input)});
    if (!input || !document.body) return false;
    const key = ${JSON.stringify('__yarktextTranslation_' + requestId)};
    if (!window[key]) {
      const selector = ${JSON.stringify(output)};
      const read = () => Array.from(document.querySelectorAll(selector)).map(node => 'value' in node ? node.value : node.innerText || node.textContent || '').join('\\n').trim();
      const inputText = 'value' in input ? input.value : input.innerText || input.textContent || '';
      const normalize = text => text.replace(/\\s+/g, ' ').trim();
      const reusable = ${source === undefined ? 'false' : `normalize(inputText) === normalize(${JSON.stringify(source)})`};
      const state = { baseline: ${cold ? "''" : 'read()'}, reusable, changed: ${cold}, reset: false, read, observer: null };
      state.observer = new MutationObserver(mutations => {
        const insideOutput = node => node instanceof Element && (node.matches(selector) || !!node.closest(selector));
        const containsOutput = node => insideOutput(node) || (node instanceof Element && !!node.querySelector(selector));
        if (mutations.some(mutation => insideOutput(mutation.target instanceof Element ? mutation.target : mutation.target.parentElement) || Array.from(mutation.addedNodes).some(containsOutput) || Array.from(mutation.removedNodes).some(containsOutput))) {
          state.changed = true;
          if (!read()) state.reset = true;
        }
      });
      state.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      window[key] = state;
    }
    return true;
  })()`
}
export const focusTranslationInputScript = (provider: TranslationProvider): string => {
  const { input } = selectors(provider)
  return `(() => { const input = document.querySelector(${JSON.stringify(input)}); if (!input) return false; input.focus(); if (input instanceof HTMLTextAreaElement) input.select(); else if (input.isContentEditable) { const range = document.createRange(); range.selectNodeContents(input); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); } else return false; return true; })()`
}
export const translationSnapshotScript = (
  provider: TranslationProvider,
  requestId: string
): string => {
  const { input, output } = selectors(provider)
  return `(() => {
    const input = document.querySelector(${JSON.stringify(input)});
    const state = window[${JSON.stringify('__yarktextTranslation_' + requestId)}];
    if (!input || !state) return null;
    const output = state.read();
    if (!output) state.reset = true;
    const canonical = text => text.replace(/(?:\\s|\\.{3}|…)+$/g, '').trim();
    const complete = Array.from(document.querySelectorAll(${JSON.stringify(output)})).every(node => !node.closest('[aria-busy="true"]'));
    return {
      input: 'value' in input ? input.value : input.innerText || input.textContent || '', output, complete,
      changed: state.reusable || state.reset || canonical(output) !== canonical(state.baseline) || (state.changed && !state.baseline)
    };
  })()`
}
export const cleanupTranslationScript = (requestId: string): string =>
  `(() => { const key = ${JSON.stringify('__yarktextTranslation_' + requestId)}; window[key]?.observer?.disconnect(); delete window[key]; })()`
