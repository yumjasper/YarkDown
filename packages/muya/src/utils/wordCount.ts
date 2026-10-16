export function wordCount(markdown: string) {
    const paragraph = markdown.split(/\n{2,}/).filter(line => line).length;
    let word = 0;
    let character = 0;
    let all = 0;

    const removedChinese = markdown.replace(/[\u4E00-\u9FA5]/g, '');
    const tokens = removedChinese.split(/\s+/).filter(t => t);
    const chineseWordLength = markdown.length - removedChinese.length;
    word += chineseWordLength + tokens.length;
    character += tokens.reduce((acc, t) => acc + t.length, 0) + chineseWordLength;
    all += markdown.length;

    return { word, paragraph, character, all };
}
