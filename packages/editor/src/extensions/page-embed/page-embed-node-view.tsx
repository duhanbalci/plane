/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
// types
import type { TPageEmbedConfig } from "@/types";
// local imports
import { EPageEmbedAttributeNames } from "./types";
import type { TPageEmbedAttributes } from "./types";

export function PageEmbedNodeView(props: NodeViewProps) {
  const { extension, node } = props;
  const attrs = node.attrs as TPageEmbedAttributes;
  const pageId = attrs[EPageEmbedAttributeNames.ENTITY_IDENTIFIER] ?? "";
  const config = (extension.options as { pageEmbedConfig?: TPageEmbedConfig }).pageEmbedConfig;
  const pageDetails = config?.getPageDetails(pageId);

  return (
    <NodeViewWrapper className="page-embed w-fit" data-page-id={pageId}>
      <button
        type="button"
        className="not-prose my-1 flex w-fit items-center gap-2 rounded-md bg-layer-1 px-2 py-1 text-13 text-primary no-underline hover:bg-layer-1-hover"
        onClick={() => config?.onClick(pageId)}
      >
        <span className="truncate">{pageDetails?.name?.trim() ? pageDetails.name : "Untitled"}</span>
      </button>
    </NodeViewWrapper>
  );
}
