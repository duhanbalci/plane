/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TIssuePropertyValues } from "@plane/types";
// services
import { IssuePropertyValueService } from "@/services/issue";
// local imports
import type { IIssueDetail } from "./root.store";

export interface IIssuePropertyValuesStoreActions {
  fetchPropertyValues: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssuePropertyValues>;
  updatePropertyValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssuePropertyValues
  ) => Promise<TIssuePropertyValues>;
}

export interface IIssuePropertyValuesStore extends IIssuePropertyValuesStoreActions {
  // observables
  valuesByIssueId: Record<string, TIssuePropertyValues>;
  // helpers
  getValuesByIssueId: (issueId: string) => TIssuePropertyValues | undefined;
  getValue: (issueId: string, propertyId: string) => string[];
}

export class IssuePropertyValuesStore implements IIssuePropertyValuesStore {
  // observables
  valuesByIssueId: Record<string, TIssuePropertyValues> = {};
  // root store
  rootIssueDetail: IIssueDetail;
  // services
  issuePropertyValueService: IssuePropertyValueService;

  constructor(rootStore: IIssueDetail) {
    makeObservable(this, {
      // observables
      valuesByIssueId: observable,
      // actions
      fetchPropertyValues: action,
      updatePropertyValues: action,
    });

    this.rootIssueDetail = rootStore;
    this.issuePropertyValueService = new IssuePropertyValueService();
  }

  getValuesByIssueId = computedFn((issueId: string) => this.valuesByIssueId[issueId]);

  getValue = computedFn((issueId: string, propertyId: string) => this.valuesByIssueId[issueId]?.[propertyId] ?? []);

  fetchPropertyValues = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const response = await this.issuePropertyValueService.list(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.valuesByIssueId, [issueId], response ?? {}));
    return response;
  };

  updatePropertyValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssuePropertyValues
  ) => {
    const original = this.valuesByIssueId[issueId];
    // optimistic write
    runInAction(() => set(this.valuesByIssueId, [issueId], { ...original, ...data }));
    try {
      const response = await this.issuePropertyValueService.update(workspaceSlug, projectId, issueId, data);
      runInAction(() => set(this.valuesByIssueId, [issueId], response ?? { ...original, ...data }));
      return response;
    } catch (error) {
      // rollback
      runInAction(() => set(this.valuesByIssueId, [issueId], original ?? {}));
      throw error;
    }
  };
}
