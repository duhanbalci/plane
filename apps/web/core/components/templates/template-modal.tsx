/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { AddOutline, DeleteOutline } from "@makeplane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssuePriorities, TIssuePropertyValues, TWorkItemTemplate, TWorkItemTemplateData } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// components
import { IssueTypeDropdown } from "@/components/dropdowns/issue-type";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ModuleDropdown } from "@/components/dropdowns/module/dropdown";
import { PriorityDropdown } from "@/components/dropdowns/priority";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { IssuePropertyValueInput } from "@/components/issues/issue-properties";
import { IssueLabelSelect } from "@/components/issues/select";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
import { useWorkItemTemplates } from "@/hooks/store/use-work-item-templates";

type Props = {
  workspaceSlug: string;
  /** null = workspace level template */
  projectId: string | null;
  isOpen: boolean;
  handleClose: () => void;
  data?: TWorkItemTemplate;
};

const EMPTY_DATA: TWorkItemTemplateData = {
  name: "",
  description_html: "<p></p>",
  type_id: null,
  state_id: null,
  priority: "none",
  label_ids: [],
  assignee_ids: [],
  module_ids: [],
  properties: {},
  sub_work_items: [],
};

/** The form keeps the work item description as plain text and wraps it in a paragraph on save. */
const htmlToText = (html: string) =>
  html
    .replace(/<\/p>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

const textToHtml = (text: string) =>
  text.trim() ? `<p>${text.trim().split(/\n+/).join("</p><p>")}</p>` : "<p></p>";

export const CreateUpdateTemplateModal = observer(function CreateUpdateTemplateModal(props: Props) {
  const { workspaceSlug, projectId, isOpen, handleClose, data } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateData, setTemplateData] = useState<TWorkItemTemplateData>(EMPTY_DATA);
  const [workItemDescription, setWorkItemDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { createTemplate, updateTemplate } = useWorkItemTemplates();
  const { getProjectById } = useProject();
  const { getActiveProperties, fetchProperties } = useIssueTypes();
  // derived values
  const isIssueTypeEnabled = Boolean(projectId && getProjectById(projectId)?.is_issue_type_enabled);
  const activeProperties = isIssueTypeEnabled ? getActiveProperties(templateData.type_id) : [];

  useEffect(() => {
    if (!isOpen) return;
    setName(data?.name ?? "");
    setDescription(htmlToText(data?.description_html ?? ""));
    const nextData = { ...EMPTY_DATA, ...data?.template_data };
    setTemplateData(nextData);
    setWorkItemDescription(htmlToText(nextData.description_html ?? ""));
  }, [isOpen, data]);

  // the custom properties of the chosen type have to be loaded before they can be filled in
  useEffect(() => {
    if (!isIssueTypeEnabled || !projectId || !templateData.type_id) return;
    void fetchProperties(workspaceSlug, projectId, templateData.type_id).catch((error) => console.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIssueTypeEnabled, projectId, templateData.type_id, workspaceSlug]);

  const patchData = (patch: Partial<TWorkItemTemplateData>) => setTemplateData((prev) => ({ ...prev, ...patch }));

  const patchSubItem = (index: number, patch: Partial<TWorkItemTemplateData["sub_work_items"][number]>) =>
    setTemplateData((prev) => ({
      ...prev,
      sub_work_items: prev.sub_work_items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));

  const addSubItem = () =>
    setTemplateData((prev) => ({
      ...prev,
      sub_work_items: [
        ...prev.sub_work_items,
        { name: "", type_id: null, priority: "none" as TIssuePriorities, label_ids: [], assignee_ids: [], properties: {} },
      ],
    }));

  const removeSubItem = (index: number) =>
    setTemplateData((prev) => ({
      ...prev,
      sub_work_items: prev.sub_work_items.filter((_, itemIndex) => itemIndex !== index),
    }));

  const handleSubmit = async () => {
    if (!name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("templates.settings.form.work_item.template.name.validation.required"),
      });
      return;
    }

    // drop the sub work items with no title and keep only the properties of the chosen type
    const activePropertyIds = new Set(activeProperties.map((property) => property.id));
    const properties: TIssuePropertyValues = {};
    for (const [propertyId, values] of Object.entries(templateData.properties ?? {})) {
      if (activePropertyIds.has(propertyId)) properties[propertyId] = values;
    }

    const payload = {
      name: name.trim(),
      description_html: textToHtml(description),
      template_data: {
        ...templateData,
        description_html: textToHtml(workItemDescription),
        properties,
        sub_work_items: templateData.sub_work_items.filter((item) => item.name.trim()),
      },
    };

    setIsSubmitting(true);
    try {
      if (data) await updateTemplate(workspaceSlug, projectId, data.id, payload);
      else await createTemplate(workspaceSlug, projectId, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: data
          ? t("templates.toasts.update.success.title")
          : t("templates.toasts.create.success.title"),
      });
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          error?.error ??
          (data ? t("templates.toasts.update.error.title") : t("templates.toasts.create.error.title")),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXXL}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
        <h3 className="text-18 font-medium text-secondary">
          {data ? t("templates.settings.form.work_item.button.update") : t("templates.settings.new_work_item_template")}
        </h3>
        {!projectId && <p className="text-caption-sm-regular text-tertiary">{t("templates.settings.workspace_scope_note")}</p>}
        <Input
          id="template_name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("templates.settings.form.work_item.template.name.placeholder")}
          className="w-full"
        />
        <TextArea
          id="template_description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("templates.settings.form.work_item.template.description.placeholder")}
          className="min-h-16 w-full resize-none text-body-xs-regular"
        />
        <div className="space-y-3 rounded-md border-[0.5px] border-subtle p-3">
          <Input
            id="work_item_name"
            type="text"
            value={templateData.name}
            onChange={(event) => patchData({ name: event.target.value })}
            placeholder={t("templates.settings.form.work_item.name.placeholder")}
            className="w-full"
          />
          <TextArea
            id="work_item_description"
            value={workItemDescription}
            onChange={(event) => setWorkItemDescription(event.target.value)}
            placeholder={t("templates.settings.form.work_item.description.placeholder")}
            className="min-h-20 w-full resize-none text-body-xs-regular"
          />
          <div className="flex flex-wrap items-center gap-2">
            {projectId && isIssueTypeEnabled && (
              <IssueTypeDropdown
                value={templateData.type_id ?? undefined}
                onChange={(typeId) => patchData({ type_id: typeId, properties: {} })}
                projectId={projectId}
                buttonVariant="border-with-text"
                dropdownArrow
              />
            )}
            {projectId && (
              <div className="h-7">
                <StateDropdown
                  value={templateData.state_id ?? undefined}
                  onChange={(stateId) => patchData({ state_id: stateId })}
                  projectId={projectId}
                  buttonVariant="border-with-text"
                />
              </div>
            )}
            <div className="h-7">
              <PriorityDropdown
                value={templateData.priority}
                onChange={(priority) => patchData({ priority })}
                buttonVariant="border-with-text"
              />
            </div>
            {projectId && (
              <>
                <div className="h-7">
                  <IssueLabelSelect
                    value={templateData.label_ids}
                    onChange={(labelIds) => patchData({ label_ids: labelIds })}
                    projectId={projectId}
                  />
                </div>
                <div className="h-7">
                  <MemberDropdown
                    projectId={projectId}
                    value={templateData.assignee_ids}
                    onChange={(assigneeIds) => patchData({ assignee_ids: assigneeIds })}
                    buttonVariant="border-with-text"
                    placeholder={t("assignees")}
                    multiple
                  />
                </div>
                <div className="h-7">
                  <ModuleDropdown
                    projectId={projectId}
                    value={templateData.module_ids}
                    onChange={(moduleIds) => patchData({ module_ids: moduleIds as string[] })}
                    buttonVariant="border-with-text"
                    placeholder={t("modules")}
                    multiple
                    showCount
                  />
                </div>
              </>
            )}
          </div>
          {activeProperties.length > 0 && (
            <div className="space-y-2">
              {activeProperties.map((property) => (
                <div key={property.id} className="flex w-full items-start gap-2">
                  <span className="w-2/5 flex-shrink-0 pt-1.5 text-body-xs-medium text-secondary">
                    {property.display_name}
                  </span>
                  <div className="w-3/5">
                    <IssuePropertyValueInput
                      property={property}
                      value={templateData.properties?.[property.id] ?? []}
                      onChange={(value) =>
                        patchData({ properties: { ...templateData.properties, [property.id]: value } })
                      }
                      projectId={projectId ?? undefined}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-body-xs-medium text-secondary">
              {t("templates.settings.form.work_item.sub_work_items.title")}
            </span>
            <Button variant="link" size="sm" onClick={addSubItem} prependIcon={<AddOutline />}>
              {t("templates.settings.form.work_item.sub_work_items.add")}
            </Button>
          </div>
          {templateData.sub_work_items.map((subItem, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border-[0.5px] border-subtle p-2">
              <Input
                id={`sub_work_item_${index}`}
                type="text"
                value={subItem.name}
                onChange={(event) => patchSubItem(index, { name: event.target.value })}
                placeholder={t("templates.settings.form.work_item.sub_work_items.name_placeholder")}
                className="flex-1"
              />
              {projectId && isIssueTypeEnabled && (
                <IssueTypeDropdown
                  value={subItem.type_id ?? undefined}
                  onChange={(typeId) => patchSubItem(index, { type_id: typeId })}
                  projectId={projectId}
                  buttonVariant="border-with-text"
                  dropdownArrow
                />
              )}
              <div className="h-7">
                <PriorityDropdown
                  value={subItem.priority}
                  onChange={(priority) => patchSubItem(index, { priority })}
                  buttonVariant="border-with-text"
                />
              </div>
              {projectId && (
                <>
                  <div className="h-7">
                    <IssueLabelSelect
                      value={subItem.label_ids}
                      onChange={(labelIds) => patchSubItem(index, { label_ids: labelIds })}
                      projectId={projectId}
                    />
                  </div>
                  <div className="h-7">
                    <MemberDropdown
                      projectId={projectId}
                      value={subItem.assignee_ids}
                      onChange={(assigneeIds) => patchSubItem(index, { assignee_ids: assigneeIds })}
                      buttonVariant="border-with-text"
                      placeholder={t("assignees")}
                      multiple
                    />
                  </div>
                </>
              )}
              <button
                type="button"
                aria-label={t("templates.settings.form.work_item.sub_work_items.remove")}
                onClick={() => removeSubItem(index)}
                className="grid size-7 place-items-center rounded-sm hover:bg-layer-1"
              >
                <DeleteOutline className="size-4 text-tertiary" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" size="sm" onClick={handleClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleSubmit()}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {data
            ? t("templates.settings.form.work_item.button.update")
            : t("templates.settings.form.work_item.button.create")}
        </Button>
      </div>
    </ModalCore>
  );
});
