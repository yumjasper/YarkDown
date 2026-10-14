export const EDITOR_ICON_PATHS: Record<string, string> = {
    'bold': 'M7 4h6a4 4 0 0 1 0 8H8m0-8v16m-1-8h7a4 4 0 0 1 0 8H7M5 4h5M5 20h5',
    'italic': 'M11 4h7M6 20h7M15 4 9 20',
    'code': 'm8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12',
    'link': 'm9 15 6-6m-4 8-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0-2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
    'image': 'M3.5 5h17v14h-17zM4 16l5-5 4 4 3-3 4 5M16 8h.1',
    'quote': 'M4 6h6v6H7c0 3-1 5-3 6m10-12h6v6h-3c0 3-1 5-3 6',
    'list': 'M9 6h11M9 12h11M9 18h11M4 6h.1M4 12h.1M4 18h.1',
    'ordered-list': 'M9 6h11M9 12h11M9 18h11M3 4h1v4m-1 4c0-2 3-2 3 0l-3 4h3m-3 3h3l-2 2h2',
    'task-list': 'M21 12v8H4V4h11M8 11l4 4 9-11',
    'more': 'M5 12h.1M12 12h.1M19 12h.1',
    'more-vertical': 'M12 5v.1M12 12v.1M12 19v.1',
    'chevron': 'm8 10 4 4 4-4',
    'copy': 'M9 8h11v13H9zM5 16H3V3h12v2',
    'paste': 'M8 5H5v16h14V5h-3M8 3h8v4H8zM9 12h6M9 16h6',
    'cut': 'm9 9 11 11M9 15 20 4M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6m0 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    'delete': 'M4 6h16M9 6V3h6v3M6 6l1 14h10l1-14M10 10v6M14 10v6',
    'edit': 'm5 15-1 5 5-1L20 8l-4-4zm9-9 4 4',
    'inline': 'M3 5h18M3 19h18M8 9h8v6H8zM3 12h2M19 12h2',
    'align-left': 'M3 5h18M3 10h12M3 15h18M3 20h12',
    'align-center': 'M3 5h18M6 10h12M3 15h18M6 20h12',
    'align-right': 'M3 5h18M9 10h12M3 15h18M9 20h12',
    'table': 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
    'resize': 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    'paragraph': 'M14 4H8a4 4 0 0 0 0 8h3M11 4v16M16 4v16M8 4h11',
    'math': 'M19 4H6l7 8-7 8h13M8 4h11',
    'underline': 'M6 4v8a6 6 0 0 0 12 0V4M4 21h16',
    'strike': 'M17 6c-5-5-12-1-9 4m-3 2h14m-3 2c3 5-6 8-10 3',
    'clear': 'm6 16 9-12 6 5-9 12H8zm3 5h11',
    'highlight': 'm6 15 8-11 6 5-8 11-6-5m0 0-2 5h6M3 22h18',
    'color': 'M5 17l7-13 7 13M8 12h8M4 21h16',
    'unlink': 'm3 3 18 18M8 15l-2 2a4 4 0 0 1-5-5l3-3m12 0 2-2a4 4 0 0 1 5 5l-3 3',
    'jump': 'M9 5H4v15h15v-5M13 4h7v7M20 4 10 14',
    'view': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    'drag': 'M8 5h.1M16 5h.1M8 12h.1M16 12h.1M8 19h.1M16 19h.1',
    'line': 'M3 12h18',
    'footnote': 'M5 20V6h5M5 12h4M16 4v9M13 7h6M13 10h6',
    'frontmatter': 'M4 5h16M4 10h11M4 15h16M4 20h11',
    'chart': 'M4 3v17h17M8 16v-5M13 16V6M18 16V9',
    'diagram': 'M8 3h8v5H8zM3 16h7v5H3zM14 16h7v5h-7zM12 8v4M6 16v-4h12v4',
    'column-left': 'M11 4h10v16H11zM16 4v16M2 12h6M5 9v6',
    'column-right': 'M3 4h10v16H3zM8 4v16M16 12h6M19 9v6',
    'column-remove': 'M3 4h12v16H3zM9 4v16M17 9l5 6m-5 0 5-6',
};

const digits = ['M17 10h2v10', 'M16 12c0-4 6-4 6 0l-6 8h6', 'M16 10h6l-4 5c5-1 6 5-2 5', 'M20 20V10l-5 7h7', 'M22 10h-6v5c7-3 8 7 0 5', 'M21 10c-6-2-7 13-1 10 6-3-1-9-4-3'];
digits.forEach((digit, i) => {
    EDITOR_ICON_PATHS[`heading-${i + 1}`] = `M3 4v16M12 4v16M3 12h9${digit}`;
});

export function toolbarIconUrl(name: string): string {
    const path = EDITOR_ICON_PATHS[name];
    if (!path)
        throw new Error(`Unknown editor icon: ${name}`);
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`)}`;
}
