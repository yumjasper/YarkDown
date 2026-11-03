// KaTeX 兼容层：把用户按 Markdown 习惯（或其他渲染器容差）写出的、KaTeX
// 拒绝的输入归一化，避免渲染出 "Undefined control sequence" 这类解析错误。
// 只作用于渲染入参，不改动文档存储的原文 — 用户保留原来的写法，显示修复。
import katex from 'katex';
import 'katex/dist/contrib/mhchem.mjs';

// CommonMark 允许转义的 ASCII 标点中，KaTeX 未定义其控制序列的那部分：
// `\*`、`\(`、`\[` 等。排除掉 KaTeX 已定义或承担语法功能的字符：
// - `\$ \% \& \_ \# \{ \}` 是合法的字面量命令，必须保留；
// - `\[ \]` 保留，否则会破坏 align 环境里 `\\[1em]` 的行距语法；
// - `\! \: \, \; \  \>` 等是 KaTeX 定义的间距/重音命令，必须保留。
// `\\`（换行命令）因后随字符不在集合内而天然不受影响。
const MARKDOWN_ESCAPE = /\\([*+./?@()\-])/g;

// 旧式 TeX 字体命令与 KaTeX 缺省未提供的常见算子宏。用宏定义而非字符串
// 替换，这样用户显式传入的 macros 可以按需覆盖它们。
const COMPAT_MACROS: Record<string, string> = {
    '\\rm': '\\mathrm',
    '\\bf': '\\mathbf',
    '\\it': '\\mathit',
    '\\cal': '\\mathcal',
    '\\tt': '\\mathtt',
    '\\sf': '\\mathsf',
    '\\sl': '\\mathit',
    '\\sc': '\\mathrm',
    '\\mit': '\\mathit',
    '\\argmax': '\\operatorname{arg\\,max}',
    '\\argmin': '\\operatorname{arg\\,min}',
    '\\diff': '\\mathrm{d}',
};

export function normalizeLatex(math: string): string {
    return math.replace(MARKDOWN_ESCAPE, '$1');
}

export interface ILatexRenderOptions {
    displayMode?: boolean;
    throwOnError?: boolean;
    macros?: Record<string, string>;
}

// All call sites (inline renderer, block math preview, marked export) must go
// through here so a formula reads the same in every rendering path.
export function renderKatex(math: string, options: ILatexRenderOptions = {}): string {
    return katex.renderToString(normalizeLatex(math), {
        ...options,
        macros: { ...COMPAT_MACROS, ...options.macros },
    });
}
