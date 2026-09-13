/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import ts from "highlight.js/lib/languages/typescript";
import { common, createLowlight } from "lowlight";
import { CodeOutline, CopyOutline, ShowOutline, TickOutline } from "@makeplane/propel/icons";
import { useState } from "react";
// ui
import { Tooltip } from "@plane/propel/tooltip";
// plane utils
import { cn } from "@plane/utils";
// local imports
import { MermaidPreview, MERMAID_LANGUAGE } from "./mermaid";
import type { TCodeBlockAttributes } from "./types";
import { ECodeBlockAttributeNames } from "./types";

// we just have ts support for now
const lowlight = createLowlight(common);
lowlight.register("ts", ts);

type Props = {
  node: ProseMirrorNode;
};

export function CodeBlockComponent({ node }: Props) {
  const [copied, setCopied] = useState(false);
  // mermaid bloğu önizleme/kod sekmesi; varsayılan kod (gerçek Plane ile aynı)
  const [showMermaidPreview, setShowMermaidPreview] = useState(false);
  // derived values
  const attrs = node.attrs as TCodeBlockAttributes;
  const isMermaid = attrs[ECodeBlockAttributeNames.LANGUAGE] === MERMAID_LANGUAGE;
  const isPreviewVisible = isMermaid && showMermaidPreview;

  const copyToClipboard = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      setCopied(false);
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <NodeViewWrapper key={attrs[ECodeBlockAttributeNames.ID]} className="code-block group/code relative">
      <div className="absolute top-2 right-2 z-10 hidden items-center gap-1 group-hover/code:flex">
        {isMermaid && (
          <div className="flex items-center gap-0.5 rounded-md border border-subtle bg-layer-1 p-0.5 backdrop-blur-sm">
            <Tooltip tooltipContent="Show Mermaid preview">
              <button
                type="button"
                aria-label="Show Mermaid preview"
                aria-pressed={showMermaidPreview}
                className={cn(
                  "flex size-6 items-center justify-center rounded text-tertiary transition-colors hover:text-primary",
                  {
                    "bg-layer-3 text-primary": showMermaidPreview,
                  }
                )}
                onClick={() => setShowMermaidPreview(true)}
              >
                <ShowOutline className="size-3.5" />
              </button>
            </Tooltip>
            <Tooltip tooltipContent="Show Mermaid code">
              <button
                type="button"
                aria-label="Show Mermaid code"
                aria-pressed={!showMermaidPreview}
                className={cn(
                  "flex size-6 items-center justify-center rounded text-tertiary transition-colors hover:text-primary",
                  {
                    "bg-layer-3 text-primary": !showMermaidPreview,
                  }
                )}
                onClick={() => setShowMermaidPreview(false)}
              >
                <CodeOutline className="size-3.5" />
              </button>
            </Tooltip>
          </div>
        )}
        <Tooltip tooltipContent="Copy code">
          <button
            type="button"
            className={cn(
              "group/button flex size-8 items-center justify-center rounded-md border border-subtle bg-layer-1 backdrop-blur-sm transition duration-150 ease-in-out",
              {
                "bg-success-subtle hover:bg-success-subtle-1 active:bg-success-subtle-1": copied,
              }
            )}
            onClick={(e) => void copyToClipboard(e)}
          >
            {copied ? (
              <TickOutline className="h-3 w-3 text-success-primary" />
            ) : (
              <CopyOutline className="h-3 w-3 text-tertiary group-hover/button:text-primary" />
            )}
          </button>
        </Tooltip>
      </div>

      {isPreviewVisible && <MermaidPreview code={node.textContent} />}

      {/* önizlemede de doc'ta kalmalı, yoksa ProseMirror içeriği kaybeder */}
      <pre className={cn("my-2 rounded-lg bg-layer-3 p-4 text-primary", { hidden: isPreviewVisible })}>
        <NodeViewContent as="code" className="whitespace-pre-wrap" />
      </pre>
    </NodeViewWrapper>
  );
}
