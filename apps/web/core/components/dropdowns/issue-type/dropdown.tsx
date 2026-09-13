/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ChevronDownOutline, SearchOutline, TickOutline } from "@makeplane/propel/icons";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { WorkItemTypeLogo } from "@/components/work-item-types/type-logo";
import { useDropdown } from "@/hooks/use-dropdown";
// local imports
import { DropdownButton } from "../buttons";
import { BUTTON_VARIANTS_WITH_TEXT } from "../constants";
import type { TDropdownProps } from "../types";

type Props = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  onChange: (val: string) => void;
  onClose?: () => void;
  projectId: string | undefined | null;
  value: string | undefined | null;
  renderByDefault?: boolean;
  /** when true only epic types are listed, otherwise epic types are hidden */
  isEpic?: boolean;
};

export const IssueTypeDropdown = observer(function IssueTypeDropdown(props: Props) {
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    hideIcon = false,
    isEpic = false,
    onChange,
    onClose,
    placeholder = "",
    placement,
    projectId,
    showTooltip = false,
    tabIndex,
    value,
    renderByDefault = true,
  } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });
  // store hooks
  const { getProjectTypes, getTypeById } = useIssueTypes();
  // derived values
  const issueTypes = getProjectTypes(projectId).filter(
    (issueType) => issueType.is_active && Boolean(issueType.is_epic) === isEpic
  );
  const selectedType = getTypeById(value);
  const filteredTypes =
    query === "" ? issueTypes : issueTypes.filter((type) => type.name.toLowerCase().includes(query.toLowerCase()));

  const { handleClose, handleKeyDown, handleOnClick, searchInputKeyDown } = useDropdown({
    dropdownRef,
    inputRef,
    isOpen,
    onClose,
    query,
    setIsOpen,
    setQuery,
  });

  const dropdownOnChange = (val: string) => {
    onChange(val);
    handleClose();
  };

  const comboButton = button ? (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn("clickable block h-full w-full outline-none", buttonContainerClassName)}
      onClick={handleOnClick}
      disabled={disabled}
    >
      {button}
    </button>
  ) : (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn(
        "clickable block h-full max-w-full outline-none",
        {
          "cursor-not-allowed text-secondary": disabled,
          "cursor-pointer": !disabled,
        },
        buttonContainerClassName
      )}
      onClick={handleOnClick}
      disabled={disabled}
    >
      <DropdownButton
        className={buttonClassName}
        isActive={isOpen}
        tooltipHeading={t("work_item_types.label")}
        tooltipContent={selectedType ? selectedType.name : placeholder}
        showTooltip={showTooltip}
        variant={buttonVariant}
        renderToolTipByDefault={renderByDefault}
      >
        {!hideIcon &&
          <WorkItemTypeLogo type={selectedType} size={12} />}
        {(selectedType || placeholder) && BUTTON_VARIANTS_WITH_TEXT.includes(buttonVariant) && (
          <span className="truncate">
            {selectedType ? selectedType.name : <span className="text-placeholder">{placeholder}</span>}
          </span>
        )}
        {dropdownArrow && (
          <ChevronDownOutline className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </DropdownButton>
    </button>
  );

  return (
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      tabIndex={tabIndex}
      className={cn("h-full w-full", className)}
      value={value}
      onChange={dropdownOnChange}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
    >
      {isOpen && (
        <Combobox.Options as="ul" className="fixed z-10" static>
          <div
            className="my-1 w-48 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
              <SearchOutline className="h-3.5 w-3.5 text-placeholder" />
              <Combobox.Input
                as="input"
                ref={inputRef}
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.search.placeholder")}
                onKeyDown={searchInputKeyDown}
              />
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
              {filteredTypes.length > 0 ? (
                filteredTypes.map((type) => (
                  <Combobox.Option as="li" key={type.id} value={type.id}>
                    {({ active, selected }) => (
                      <div
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                          {
                            "bg-layer-transparent-hover": active,
                            "text-primary": selected,
                            "text-secondary": !selected,
                          }
                        )}
                      >
                        <div className="flex flex-grow items-center gap-2 truncate">
                          <WorkItemTypeLogo type={type} size={12} />
                          <span className="flex-grow truncate">{type.name}</span>
                        </div>
                        {selected && <TickOutline className="h-3.5 w-3.5 flex-shrink-0" />}
                      </div>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matching_results")}</p>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </ComboDropDown>
  );
});
