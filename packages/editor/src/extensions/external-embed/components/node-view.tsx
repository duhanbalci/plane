/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Globe, Link2, LayoutTemplate, MonitorPlay } from "lucide-react";
import { useCallback, useState } from "react";
// plane imports
import { cn } from "@plane/utils";
// local imports
import {
  getExternalEmbedIframeUrl,
  getExternalEmbedProvider,
  getExternalEmbedTitle,
  parseExternalEmbedUrl,
} from "../providers";
import { EExternalEmbedDisplay } from "../types";
import type { TExternalEmbedAttributes } from "../types";

export type ExternalEmbedNodeViewProps = Omit<NodeViewProps, "updateAttributes"> & {
  node: NodeViewProps["node"] & {
    attrs: TExternalEmbedAttributes;
  };
  updateAttributes: (attrs: Partial<TExternalEmbedAttributes>) => void;
};

// allowlisted providers need scripts and their own origin to work (YouTube, Figma, Google Docs)
const EMBED_SANDBOX_PERMISSIONS = [
  "allow-scripts",
  "allow-same-origin",
  "allow-popups",
  "allow-presentation",
  "allow-forms",
].join(" ");

const DISPLAY_OPTIONS = [
  { value: EExternalEmbedDisplay.LINK, label: "Convert to Link", icon: Link2 },
  { value: EExternalEmbedDisplay.CARD, label: "Convert to Rich Card", icon: LayoutTemplate },
  { value: EExternalEmbedDisplay.EMBED, label: "Convert to Embed", icon: MonitorPlay },
];

export function ExternalEmbedNodeView(props: ExternalEmbedNodeViewProps) {
  const { editor, node, selected, updateAttributes } = props;
  const { display, src, title } = node.attrs;
  // states
  const [urlInput, setUrlInput] = useState("");
  const [hasError, setHasError] = useState(false);
  // derived values
  const iframeUrl = getExternalEmbedIframeUrl(src);
  const parsedUrl = parseExternalEmbedUrl(src);
  const displayTitle = title?.trim() ? title : getExternalEmbedTitle(src);

  const handleSubmit = useCallback(() => {
    const url = parseExternalEmbedUrl(urlInput);
    if (!url) {
      setHasError(true);
      return;
    }
    setHasError(false);
    // only allowlisted providers can be framed, everything else stays a card
    const canBeFramed = !!getExternalEmbedProvider(url.toString());
    updateAttributes({
      src: url.toString(),
      display: canBeFramed ? EExternalEmbedDisplay.EMBED : EExternalEmbedDisplay.CARD,
    });
  }, [updateAttributes, urlInput]);

  // the link is not set yet, ask for it
  if (!src) {
    return (
      <NodeViewWrapper className="external-embed-component">
        <div
          className={cn("my-2 space-y-2 rounded-md border border-subtle bg-layer-1 p-3", {
            "border-accent-strong": selected && editor.isEditable,
          })}
          contentEditable={false}
        >
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Insert your preferred embed link here, such as YouTube video, Figma design, etc."
              className="flex-1 rounded-sm border border-subtle bg-layer-2 px-2 py-1 text-13 text-primary outline-none focus:border-accent-strong"
            />
            <button
              type="button"
              className="text-on-accent shrink-0 rounded-sm bg-accent-primary px-3 py-1 text-13 font-medium"
              onClick={handleSubmit}
            >
              Embed
            </button>
          </div>
          <p className={cn("text-11", hasError ? "text-danger-primary" : "text-tertiary")}>
            {hasError ? "Please enter a valid URL." : "Works with YouTube, Figma, Google Docs and more"}
          </p>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="external-embed-component">
      <div className="group/external-embed relative my-2" contentEditable={false} data-drag-handle>
        {display === EExternalEmbedDisplay.LINK && (
          <a href={src} target="_blank" rel="noreferrer noopener" className="text-link text-13 underline">
            {displayTitle}
          </a>
        )}
        {(display === EExternalEmbedDisplay.CARD || (display === EExternalEmbedDisplay.EMBED && !iframeUrl)) && (
          <a
            href={src}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "flex items-center gap-3 rounded-md border border-subtle bg-layer-1 px-3 py-2 no-underline transition-colors hover:bg-layer-1-hover",
              { "border-accent-strong": selected && editor.isEditable }
            )}
          >
            <Globe className="size-5 shrink-0 text-tertiary" />
            <div className="flex-1 truncate">
              <p className="truncate text-13 font-medium text-primary">{displayTitle}</p>
              <p className="truncate text-11 text-tertiary">{parsedUrl?.hostname ?? src}</p>
            </div>
          </a>
        )}
        {display === EExternalEmbedDisplay.EMBED && !!iframeUrl && (
          <div
            className={cn("overflow-hidden rounded-md border border-subtle", {
              "border-accent-strong": selected && editor.isEditable,
            })}
          >
            <iframe
              src={iframeUrl}
              title={displayTitle}
              className="aspect-video w-full max-w-full"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox={EMBED_SANDBOX_PERMISSIONS}
            />
          </div>
        )}
        {editor.isEditable && (
          <div className="absolute top-1 right-1 flex items-center gap-0.5 rounded-sm border border-subtle bg-layer-2 p-0.5 opacity-0 transition-opacity group-hover/external-embed:opacity-100">
            {DISPLAY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                className={cn("rounded-sm p-1 text-tertiary transition-colors hover:bg-layer-2-hover", {
                  "bg-layer-3 text-primary": display === option.value,
                })}
                onClick={() => updateAttributes({ display: option.value })}
              >
                <option.icon className="size-3.5" />
              </button>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
