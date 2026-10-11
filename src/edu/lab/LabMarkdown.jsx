import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { contentText, remarkScientificTags, safeMarkdownUrl } from "./content.js";

const markdownComponents = {
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  img: ({ alt }) => <span className="edu-lab-image-note">[이미지{alt ? `: ${alt}` : ""}]</span>,
};
const mathOptions = { trust: false, throwOnError: false, strict: "ignore", maxExpand: 1000, maxSize: 20 };

export default function LabMarkdown({ children, className = "" }) {
  return <div className={`edu-lab-markdown ${className}`.trim()}>
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkGfm, remarkMath, remarkScientificTags]}
      rehypePlugins={[[rehypeKatex, mathOptions]]}
      urlTransform={safeMarkdownUrl}
      components={markdownComponents}
    >{contentText(children)}</ReactMarkdown>
  </div>;
}
