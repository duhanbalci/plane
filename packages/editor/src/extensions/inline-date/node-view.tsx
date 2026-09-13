/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { CalendarOutline, ChevronLeftOutline, DoubleChevronLeftOutline } from "@makeplane/propel/icons";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
// plane imports
import { Calendar } from "@plane/propel/calendar";
import { Popover } from "@plane/propel/popover";
// local imports
import { EInlineDateAttributeNames } from "./types";
import { formatDateLabel, fromISODate, toISODate } from "./utils";

type Props = NodeViewProps & {
  /** Node ilk kez olusturulurken takvim acik gelsin mi (tek seferlik okunur). */
  consumeOpenOnMount: () => boolean;
};

export const InlineDateNodeView: React.FC<Props> = (props) => {
  const { editor, node, updateAttributes, consumeOpenOnMount } = props;
  const value = (node.attrs[EInlineDateAttributeNames.DATE] as string | null) ?? null;
  const selected = useMemo(() => fromISODate(value) ?? undefined, [value]);

  const [isOpen, setIsOpen] = useState(() => consumeOpenOnMount() && editor.isEditable);
  const [month, setMonth] = useState<Date>(() => fromISODate(value) ?? new Date());

  const shiftMonth = useCallback((amount: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }, []);

  const handleSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      updateAttributes({ [EInlineDateAttributeNames.DATE]: toISODate(date) });
      setIsOpen(false);
    },
    [updateAttributes]
  );

  return (
    <NodeViewWrapper as="span" className="-mt-0.5 inline-flex align-middle">
      <Popover open={isOpen} onOpenChange={(open) => editor.isEditable && setIsOpen(open)}>
        <Popover.Button
          type="button"
          className="inline-flex h-6 max-w-48 cursor-pointer items-center gap-1 rounded-md bg-layer-3 px-2 text-body-sm-medium text-secondary"
          onMouseDown={(e) => e.preventDefault()}
        >
          <CalendarOutline className="size-3.5 shrink-0" />
          <span className="inline truncate">{formatDateLabel(value)}</span>
        </Popover.Button>
        <Popover.Panel className="z-30 rounded-lg border border-subtle bg-surface-1 shadow-raised-200">
          <div className="flex items-center justify-between gap-2 px-3 pt-3">
            <div className="flex items-center gap-1">
              <NavButton label="Previous year" onClick={() => shiftMonth(-12)}>
                <DoubleChevronLeftOutline className="size-4" />
              </NavButton>
              <NavButton label="Previous month" onClick={() => shiftMonth(-1)}>
                <ChevronLeftOutline className="size-4" />
              </NavButton>
            </div>
            <span className="text-body-sm-medium text-primary">
              {new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(month)}
            </span>
            <div className="flex items-center gap-1">
              <NavButton label="Next month" onClick={() => shiftMonth(1)}>
                <ChevronLeftOutline className="size-4 rotate-180" />
              </NavButton>
              <NavButton label="Next year" onClick={() => shiftMonth(12)}>
                <DoubleChevronLeftOutline className="size-4 rotate-180" />
              </NavButton>
            </div>
          </div>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            month={month}
            onMonthChange={setMonth}
            hideNavigation
          />
        </Popover.Panel>
      </Popover>
    </NodeViewWrapper>
  );
};

type NavButtonProps = {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
};

const NavButton: React.FC<NavButtonProps> = ({ label, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    className="grid size-6 place-items-center rounded text-secondary hover:bg-layer-2"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);
