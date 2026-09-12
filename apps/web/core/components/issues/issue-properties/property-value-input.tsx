/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Switch } from "@makeplane/propel/components/switch";
import type { TIssueProperty, TIssuePropertyTextDisplayFormat } from "@plane/types";
import { EIssuePropertyType } from "@plane/types";
import { Input, TextArea, CustomSearchSelect } from "@plane/ui";
import { cn, getDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

export type TIssuePropertyValueInputProps = {
  property: TIssueProperty;
  value: string[];
  onChange: (value: string[]) => void;
  projectId: string | undefined;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
};

const getTextDisplayFormat = (property: TIssueProperty): TIssuePropertyTextDisplayFormat =>
  (property.settings?.display_format as TIssuePropertyTextDisplayFormat) ?? "single-line";

export const IssuePropertyValueInput = observer(function IssuePropertyValueInput(props: TIssuePropertyValueInputProps) {
  const { property, value, onChange, projectId, disabled = false, hasError = false, className } = props;
  const { t } = useTranslation();

  const firstValue = value?.[0] ?? "";
  const commonClassName = cn("w-full", hasError && "border-danger-strong", className);

  switch (property.property_type) {
    case EIssuePropertyType.TEXT: {
      const displayFormat = getTextDisplayFormat(property);
      if (displayFormat === "readonly") {
        return <p className={cn("px-2 py-1 text-body-xs-regular text-secondary", className)}>{firstValue || "-"}</p>;
      }
      if (displayFormat === "multi-line") {
        return (
          <TextArea
            id={`issue-property-${property.id}`}
            value={firstValue}
            onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
            disabled={disabled}
            placeholder={property.display_name}
            className={cn("min-h-16 resize-none text-body-xs-regular", commonClassName)}
          />
        );
      }
      return (
        <Input
          id={`issue-property-${property.id}`}
          type="text"
          value={firstValue}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
          disabled={disabled}
          placeholder={property.display_name}
          className={cn("text-body-xs-regular", commonClassName)}
        />
      );
    }
    case EIssuePropertyType.DECIMAL:
      return (
        <Input
          id={`issue-property-${property.id}`}
          type="number"
          value={firstValue}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
          disabled={disabled}
          placeholder={t("work_item_types.settings.properties.attributes.number.default.placeholder")}
          className={cn("text-body-xs-regular", commonClassName)}
        />
      );
    case EIssuePropertyType.BOOLEAN:
      return (
        <Switch
          size="sm"
          checked={firstValue === "true"}
          onCheckedChange={(checked) => onChange([checked ? "true" : "false"])}
          disabled={disabled}
          aria-label={property.display_name}
        />
      );
    case EIssuePropertyType.DATETIME:
      return (
        <DateDropdown
          value={getDate(firstValue) ?? null}
          onChange={(date) => onChange(date ? [date.toISOString()] : [])}
          disabled={disabled}
          buttonVariant="border-with-text"
          placeholder={property.display_name}
          className={cn("h-7.5 w-full", className)}
          buttonContainerClassName="w-full text-left"
        />
      );
    case EIssuePropertyType.OPTION: {
      const options = (property.options ?? [])
        .filter((option) => option.is_active)
        .map((option) => ({
          value: option.id,
          query: option.name,
          content: <span className="flex-grow truncate">{option.name}</span>,
        }));
      const placeholder = property.is_multi
        ? t("work_item_types.settings.properties.attributes.option.select.placeholder.multi.default")
        : t("work_item_types.settings.properties.attributes.option.select.placeholder.single");
      const selectedLabels = (property.options ?? [])
        .filter((option) => value?.includes(option.id))
        .map((option) => option.name);

      if (property.is_multi) {
        return (
          <CustomSearchSelect
            value={value ?? []}
            onChange={(val: string[]) => onChange(val)}
            options={options}
            multiple
            disabled={disabled}
            input
            label={selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
            className={cn("w-full", className)}
            buttonClassName={cn("w-full justify-between", hasError && "border-danger-strong")}
          />
        );
      }
      return (
        <CustomSearchSelect
          value={value?.[0] ?? null}
          onChange={(val: string | null) => onChange(val ? [val] : [])}
          options={options}
          disabled={disabled}
          input
          label={selectedLabels[0] ?? placeholder}
          className={cn("w-full", className)}
          buttonClassName={cn("w-full justify-between", hasError && "border-danger-strong")}
        />
      );
    }
    case EIssuePropertyType.RELATION:
      if (property.is_multi) {
        return (
          <MemberDropdown
            multiple
            value={value ?? []}
            onChange={(val: string[]) => onChange(val)}
            projectId={projectId ?? undefined}
            disabled={disabled}
            buttonVariant="border-with-text"
            placeholder={property.display_name}
            className={cn("h-7.5 w-full", className)}
            buttonContainerClassName="w-full text-left"
          />
        );
      }
      return (
        <MemberDropdown
          multiple={false}
          value={value?.[0] ?? null}
          onChange={(val: string | null) => onChange(val ? [val] : [])}
          projectId={projectId ?? undefined}
          disabled={disabled}
          buttonVariant="border-with-text"
          placeholder={property.display_name}
          className={cn("h-7.5 w-full", className)}
          buttonContainerClassName="w-full text-left"
        />
      );
    default:
      return null;
  }
});
