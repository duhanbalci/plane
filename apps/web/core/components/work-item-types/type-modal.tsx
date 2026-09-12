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
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { WorkItemsOutline } from "@makeplane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueType, TLogoProps } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  handleClose: () => void;
  data?: TIssueType;
};

type TFormValues = {
  name: string;
  description: string;
  logo_props: TLogoProps | undefined;
};

const DEFAULT_VALUES: TFormValues = { name: "", description: "", logo_props: undefined };

export const CreateUpdateWorkItemTypeModal = observer(function CreateUpdateWorkItemTypeModal(props: Props) {
  const { workspaceSlug, projectId, isOpen, handleClose, data } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // store hooks
  const { createType, updateType } = useIssueTypes();
  // form
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TFormValues>({ defaultValues: DEFAULT_VALUES });
  const logoValue = watch("logo_props");

  useEffect(() => {
    if (!isOpen) return;
    reset(
      data
        ? { name: data.name, description: data.description ?? "", logo_props: data.logo_props }
        : { ...DEFAULT_VALUES }
    );
  }, [isOpen, data, reset]);

  const onSubmit = async (formValues: TFormValues) => {
    try {
      if (data) await updateType(workspaceSlug, projectId, data.id, formValues);
      else await createType(workspaceSlug, projectId, formValues);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: data
          ? t("work_item_types.update.toast.success.message", { name: formValues.name })
          : t("work_item_types.create.toast.success.message"),
      });
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          error?.error ??
          (data
            ? t("work_item_types.update.toast.error.message.default")
            : t("work_item_types.create.toast.error.message.default")),
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4 p-5">
          <h3 className="text-18 font-medium text-secondary">
            {data ? t("work_item_types.update.title") : t("work_item_types.create.title")}
          </h3>
          <div className="flex w-full items-start gap-2">
            <EmojiPicker
              iconType="lucide"
              isOpen={isPickerOpen}
              handleToggle={(val: boolean) => setIsPickerOpen(val)}
              className="flex flex-shrink-0 items-center justify-center"
              buttonClassName="flex items-center justify-center"
              label={
                <span className="grid h-9 w-9 place-items-center rounded-md bg-surface-2">
                  {logoValue?.in_use ? (
                    <Logo logo={logoValue} size={18} type="lucide" />
                  ) : (
                    <WorkItemsOutline className="h-4 w-4 text-tertiary" />
                  )}
                </span>
              }
              onChange={(val: any) => {
                const nextValue = val?.type === "emoji" ? { value: val.value } : val?.value;
                setValue("logo_props", { in_use: val?.type, [val?.type]: nextValue } as TLogoProps);
                setIsPickerOpen(false);
              }}
              defaultIconColor={logoValue?.in_use === "icon" ? logoValue?.icon?.color : undefined}
              defaultOpen={logoValue?.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON}
            />
            <div className="w-full space-y-3">
              <Controller
                control={control}
                name="name"
                rules={{
                  required: t("work_item_types.settings.properties.create_update.errors.name.required"),
                  maxLength: {
                    value: 255,
                    message: t("work_item_types.settings.properties.create_update.errors.name.max_length"),
                  },
                }}
                render={({ field: { value, onChange } }) => (
                  <Input
                    id="name"
                    type="text"
                    value={value}
                    onChange={onChange}
                    hasError={Boolean(errors.name)}
                    placeholder={t("work_item_types.create_update.form.name.placeholder")}
                    className="w-full"
                  />
                )}
              />
              {errors.name && <p className="text-caption-sm-regular text-danger-primary">{errors.name.message}</p>}
              <Controller
                control={control}
                name="description"
                render={({ field: { value, onChange } }) => (
                  <TextArea
                    id="description"
                    value={value}
                    onChange={onChange}
                    placeholder={t("work_item_types.create_update.form.description.placeholder")}
                    className="min-h-20 w-full resize-none text-body-xs-regular"
                  />
                )}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={isSubmitting} disabled={isSubmitting}>
            {data ? t("work_item_types.update.button") : t("work_item_types.create.button")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
