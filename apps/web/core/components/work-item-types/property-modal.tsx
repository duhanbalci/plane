/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Switch } from "@makeplane/propel/components/switch";
import { DeleteOutline } from "@makeplane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueProperty, TIssuePropertyOption } from "@plane/types";
import { EIssuePropertyType } from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  workspaceSlug: string;
  projectId: string;
  typeId: string;
  isOpen: boolean;
  handleClose: () => void;
  data?: TIssueProperty;
};

type TFormValues = {
  display_name: string;
  description: string;
  property_type: EIssuePropertyType;
  relation_type: "user" | null;
  is_required: boolean;
  is_multi: boolean;
  is_active: boolean;
  display_format: string;
};

const DEFAULT_VALUES: TFormValues = {
  display_name: "",
  description: "",
  property_type: EIssuePropertyType.TEXT,
  relation_type: null,
  is_required: false,
  is_multi: false,
  is_active: true,
  display_format: "single-line",
};

const PROPERTY_TYPE_LABEL_KEYS: Record<EIssuePropertyType, string> = {
  [EIssuePropertyType.TEXT]: "work_item_types.settings.properties.property_type.text.label",
  [EIssuePropertyType.DECIMAL]: "work_item_types.settings.properties.property_type.number.label",
  [EIssuePropertyType.OPTION]: "work_item_types.settings.properties.property_type.dropdown.label",
  [EIssuePropertyType.BOOLEAN]: "work_item_types.settings.properties.property_type.boolean.label",
  [EIssuePropertyType.DATETIME]: "work_item_types.settings.properties.property_type.date.label",
  [EIssuePropertyType.RELATION]: "work_item_types.settings.properties.property_type.member_picker.label",
};

export const CreateUpdatePropertyModal = observer(function CreateUpdatePropertyModal(props: Props) {
  const { workspaceSlug, projectId, typeId, isOpen, handleClose, data } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [optionDrafts, setOptionDrafts] = useState<string[]>([]);
  const [optionInput, setOptionInput] = useState("");
  // store hooks
  const { createProperty, updateProperty, createOption, deleteOption } = useIssueTypes();
  // form
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TFormValues>({ defaultValues: DEFAULT_VALUES });
  const propertyType = watch("property_type");

  useEffect(() => {
    if (!isOpen) return;
    setOptionInput("");
    setOptionDrafts([]);
    reset(
      data
        ? {
            display_name: data.display_name,
            description: data.description ?? "",
            property_type: data.property_type,
            relation_type: data.relation_type,
            is_required: data.is_required,
            is_multi: data.is_multi,
            is_active: data.is_active,
            display_format: (data.settings?.display_format as string) ?? "single-line",
          }
        : { ...DEFAULT_VALUES }
    );
  }, [isOpen, data, reset]);

  const existingOptions: TIssuePropertyOption[] = data?.options ?? [];

  const onSubmit = async (formValues: TFormValues) => {
    if (
      formValues.property_type === EIssuePropertyType.OPTION &&
      existingOptions.length === 0 &&
      optionDrafts.length === 0
    ) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("work_item_types.settings.properties.create_update.errors.options.required"),
      });
      return;
    }

    const payload: Partial<TIssueProperty> = {
      display_name: formValues.display_name,
      name: formValues.display_name,
      description: formValues.description,
      property_type: formValues.property_type,
      relation_type: formValues.property_type === EIssuePropertyType.RELATION ? "user" : null,
      is_required: formValues.is_required,
      is_multi: formValues.is_multi,
      is_active: formValues.is_active,
      settings:
        formValues.property_type === EIssuePropertyType.TEXT ? { display_format: formValues.display_format } : {},
    };

    try {
      const property = data
        ? await updateProperty(workspaceSlug, projectId, typeId, data.id, payload)
        : await createProperty(workspaceSlug, projectId, typeId, payload);
      // persist the option drafts of an `option` property
      await Promise.all(
        optionDrafts.map((optionName, index) =>
          createOption(workspaceSlug, projectId, typeId, property.id, {
            name: optionName,
            sort_order: existingOptions.length + index + 1,
          })
        )
      );
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: data
          ? t("work_item_types.settings.properties.toast.update.success.message", { name: formValues.display_name })
          : t("work_item_types.settings.properties.toast.create.success.message", { name: formValues.display_name }),
      });
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          error?.error ??
          (data
            ? t("work_item_types.settings.properties.toast.update.error.message")
            : t("work_item_types.settings.properties.toast.create.error.message")),
      });
    }
  };

  const handleRemoveExistingOption = async (optionId: string) => {
    if (!data) return;
    try {
      await deleteOption(workspaceSlug, projectId, typeId, data.id, optionId);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4 p-5">
          <h3 className="text-18 font-medium text-secondary">
            {data
              ? t("work_item_types.settings.properties.create_update.title.update")
              : t("work_item_types.settings.properties.create_update.title.create")}
          </h3>

          <Controller
            control={control}
            name="display_name"
            rules={{
              required: t("work_item_types.settings.properties.create_update.errors.name.required"),
              maxLength: {
                value: 255,
                message: t("work_item_types.settings.properties.create_update.errors.name.max_length"),
              },
            }}
            render={({ field: { value, onChange } }) => (
              <Input
                id="display_name"
                type="text"
                value={value}
                onChange={onChange}
                hasError={Boolean(errors.display_name)}
                placeholder={t("work_item_types.settings.properties.create_update.form.display_name.placeholder")}
                className="w-full"
              />
            )}
          />
          {errors.display_name && (
            <p className="text-caption-sm-regular text-danger-primary">{errors.display_name.message}</p>
          )}

          <Controller
            control={control}
            name="description"
            render={({ field: { value, onChange } }) => (
              <TextArea
                id="description"
                value={value}
                onChange={onChange}
                placeholder={t("work_item_types.settings.properties.create_update.form.description.placeholder")}
                className="min-h-16 w-full resize-none text-body-xs-regular"
              />
            )}
          />

          <div className="space-y-1">
            <span className="text-body-xs-medium text-secondary">
              {t("work_item_types.settings.properties.dropdown.label")}
            </span>
            <Controller
              control={control}
              name="property_type"
              render={({ field: { value, onChange } }) => (
                <CustomSelect
                  value={value}
                  onChange={onChange}
                  label={t(PROPERTY_TYPE_LABEL_KEYS[value])}
                  buttonClassName="w-full justify-between"
                  className="w-full"
                  input
                >
                  {Object.values(EIssuePropertyType).map((type) => (
                    <CustomSelect.Option key={type} value={type}>
                      {t(PROPERTY_TYPE_LABEL_KEYS[type])}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            />
          </div>

          {propertyType === EIssuePropertyType.TEXT && (
            <div className="space-y-1">
              <span className="text-body-xs-medium text-secondary">
                {t("work_item_types.settings.properties.attributes.label")}
              </span>
              <Controller
                control={control}
                name="display_format"
                render={({ field: { value, onChange } }) => (
                  <CustomSelect
                    value={value}
                    onChange={onChange}
                    label={t(
                      value === "multi-line"
                        ? "work_item_types.settings.properties.attributes.text.multi_line.label"
                        : value === "readonly"
                          ? "work_item_types.settings.properties.attributes.text.readonly.label"
                          : "work_item_types.settings.properties.attributes.text.single_line.label"
                    )}
                    buttonClassName="w-full justify-between"
                    className="w-full"
                  >
                    <CustomSelect.Option value="single-line">
                      {t("work_item_types.settings.properties.attributes.text.single_line.label")}
                    </CustomSelect.Option>
                    <CustomSelect.Option value="multi-line">
                      {t("work_item_types.settings.properties.attributes.text.multi_line.label")}
                    </CustomSelect.Option>
                    <CustomSelect.Option value="readonly">
                      {t("work_item_types.settings.properties.attributes.text.readonly.label")}
                    </CustomSelect.Option>
                  </CustomSelect>
                )}
              />
            </div>
          )}

          {propertyType === EIssuePropertyType.OPTION && (
            <div className="space-y-2">
              <span className="text-body-xs-medium text-secondary">
                {t("work_item_types.settings.properties.attributes.option.create_update.label")}
              </span>
              {existingOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center justify-between gap-2 rounded-sm bg-surface-2 px-2 py-1"
                >
                  <span className="truncate text-body-xs-regular">{option.name}</span>
                  <button type="button" onClick={() => handleRemoveExistingOption(option.id)}>
                    <DeleteOutline className="h-3.5 w-3.5 text-tertiary" />
                  </button>
                </div>
              ))}
              {optionDrafts.map((option, index) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={`draft-${index}-${option}`}
                  className="flex items-center justify-between gap-2 rounded-sm bg-surface-2 px-2 py-1"
                >
                  <span className="truncate text-body-xs-regular">{option}</span>
                  <button type="button" onClick={() => setOptionDrafts((prev) => prev.filter((_, i) => i !== index))}>
                    <DeleteOutline className="h-3.5 w-3.5 text-tertiary" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  id="option"
                  type="text"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  placeholder={t(
                    "work_item_types.settings.properties.attributes.option.create_update.form.placeholder"
                  )}
                  className="w-full"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!optionInput.trim()) return;
                    setOptionDrafts((prev) => [...prev, optionInput.trim()]);
                    setOptionInput("");
                  }}
                >
                  {t("add")}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-6">
            <Controller
              control={control}
              name="is_required"
              render={({ field: { value, onChange } }) => (
                <label className="flex items-center gap-2 text-body-xs-regular">
                  <Switch size="sm" checked={value} onCheckedChange={onChange} aria-label="required" />
                  {t("work_item_types.settings.properties.mandate_confirmation.label")}
                </label>
              )}
            />
            {(propertyType === EIssuePropertyType.OPTION || propertyType === EIssuePropertyType.RELATION) && (
              <Controller
                control={control}
                name="is_multi"
                render={({ field: { value, onChange } }) => (
                  <label className="flex items-center gap-2 text-body-xs-regular">
                    <Switch size="sm" checked={value} onCheckedChange={onChange} aria-label="multi" />
                    {t("work_item_types.settings.properties.attributes.relation.multi_select.label")}
                  </label>
                )}
              />
            )}
            <Controller
              control={control}
              name="is_active"
              render={({ field: { value, onChange } }) => (
                <label className="flex items-center gap-2 text-body-xs-regular">
                  <Switch size="sm" checked={value} onCheckedChange={onChange} aria-label="active" />
                  {t("work_item_types.settings.properties.enable_disable.label")}
                </label>
              )}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={isSubmitting} disabled={isSubmitting}>
            {t("save")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
