export function wordCountMarkdown(markdown: string): number {
  const t = markdown.trim();
  return t ? t.split(/\s+/).length : 0;
}
