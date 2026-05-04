"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

interface SynthesisViewerProps {
  markdown: string;
}

export function SynthesisViewer({ markdown }: SynthesisViewerProps) {
  return (
    <div className="prose prose-neutral max-w-none text-foreground font-serif
      prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground
      prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
      prose-p:leading-relaxed prose-p:text-foreground/90
      prose-a:text-foreground prose-a:underline prose-a:underline-offset-2
      prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm
      prose-blockquote:border-l-4 prose-blockquote:border-border prose-blockquote:text-muted-foreground
      prose-hr:border-border prose-strong:font-semibold prose-strong:text-foreground
      prose-li:text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
