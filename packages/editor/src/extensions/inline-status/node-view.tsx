/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Check } from "lucide-react";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
// plane imports
import { Popover } from "@plane/propel/popover";
// local imports
import { EInlineStatusAttributeNames } from "./types";
import type { TInlineStatusColor } from "./types";
import { getInlineStatusColorStyle, INLINE_STATUS_COLORS, INLINE_STATUS_PLACEHOLDER } from "./utils";

type Props = NodeViewProps & {
  /** Node ilk kez olusturulurken secici acik gelsin mi (tek seferlik okunur). */
  consumeOpenOnMount: () => boolean;
};

export const InlineStatusNodeView: React.FC<Props> = (props) => {
  const { editor, node, updateAttributes, consumeOpenOnMount } = props;
  const text = (node.attrs[EInlineStatusAttributeNames.TEXT] as string) ?? "";
  const color = (node.attrs[EInlineStatusAttributeNames.COLOR] as TInlineStatusColor) ?? "gray";

  const [isOpen, setIsOpen] = useState(() => consumeOpenOnMount() && editor.isEditable);

  return (
    <NodeViewWrapper as="span" className="inline-flex">
      <Popover open={isOpen} onOpenChange={(open) => editor.isEditable && setIsOpen(open)}>
        <Popover.Button
          type="button"
          className="inline-flex h-6 max-w-48 cursor-pointer items-center rounded-md px-2 text-body-sm-medium uppercase"
          style={getInlineStatusColorStyle(color)}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="inline truncate">{text.trim() ? text : INLINE_STATUS_PLACEHOLDER}</span>
        </Popover.Button>
        <Popover.Panel className="z-30 w-60 space-y-2 rounded-lg border border-subtle bg-surface-1 p-2 shadow-raised-200">
          <input
            autoFocus
            value={text}
            placeholder={INLINE_STATUS_PLACEHOLDER}
            onChange={(e) => updateAttributes({ [EInlineStatusAttributeNames.TEXT]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                setIsOpen(false);
              }
            }}
            className="h-8 w-full rounded-md border border-subtle bg-layer-1 px-2 text-body-sm-regular text-primary outline-none placeholder:text-placeholder"
          />
          <div className="flex items-center gap-2">
            {INLINE_STATUS_COLORS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-label={option.label}
                aria-pressed={option.key === color}
                className="grid size-7 place-items-center rounded-md"
                style={getInlineStatusColorStyle(option.key)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => updateAttributes({ [EInlineStatusAttributeNames.COLOR]: option.key })}
              >
                {option.key === color && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </Popover.Panel>
      </Popover>
    </NodeViewWrapper>
  );
};
