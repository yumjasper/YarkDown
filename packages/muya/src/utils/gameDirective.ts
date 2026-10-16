export function parseGameDirective(text: string): string | null {
    return /^::game[\t ]+([a-z0-9-]+)[\t ]*\r?$/.exec(text)?.[1] ?? null;
}
