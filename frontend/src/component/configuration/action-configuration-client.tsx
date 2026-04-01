"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import {
  ActionFormulaSection,
  type ActionFormulaDraftRow
} from "@/component/configuration/action-formula-section";
import {
  DirectoryFilterCard,
  DirectoryFilterPanel,
  DirectoryFilterTextField
} from "@/component/configuration/directory-filter-panel";
import type { FormulaFieldOption } from "@/component/configuration/formula-statement-editor";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import {
  FormulaPersistError,
  runActionFormulaPersist
} from "@/lib/configuration/action-formula-persist";
import type {
  ScopeFormulaListResponse,
  ScopeFormulaRecord,
  TenantScopeActionDirectoryResponse,
  TenantScopeActionRecord,
  TenantScopeFieldDirectoryResponse,
  TenantScopeRecord
} from "@/lib/auth/types";
import type { LabelLang } from "@/lib/i18n/label-lang";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

export type ActionConfigurationCopy = {
  title: string;
  description: string;
  empty: string;
  emptyScope: string;
  missingCurrentScope: string;
  loadError: string;
  historyTitle: string;
  historyDescription: string;
  filterSearchLabel: string;
  actionNameLabel: string;
  actionNameHint: string;
  actionNameRequired: string;
  sectionInfoTitle: string;
  sectionInfoDescription: string;
  infoActionNameRegisteredLabel: string;
  infoCreateLead: string;
  infoCreateHint: string;
  cancel: string;
  directoryCreateLabel: string;
  delete: string;
  undoDelete: string;
  save: string;
  saving: string;
  readOnlyNotice: string;
  saveError: string;
  createError: string;
  deleteError: string;
  deleteBlockedDetail: string;
  discardConfirm: string;
};

type ActionConfigurationClientProps = {
  locale: string;
  labelLang: LabelLang;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialActionDirectory: TenantScopeActionDirectoryResponse | null;
  copy: ActionConfigurationCopy;
};

type ActionSelectionKey = number | "new" | null;

function parseSelectedActionKey(raw: string | null): ActionSelectionKey {
  if (!raw) {
    return null;
  }

  if (raw === "new") {
    return "new";
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function resolveSelectedActionKey(
  itemList: TenantScopeActionRecord[],
  preferredKey: ActionSelectionKey,
  canCreate: boolean
): ActionSelectionKey {
  if (preferredKey === "new") {
    return canCreate ? "new" : null;
  }

  if (typeof preferredKey === "number") {
    const found = itemList.find((item) => item.id === preferredKey)?.id;
    if (found != null) {
      return found;
    }
    return canCreate ? "new" : null;
  }

  return canCreate ? "new" : null;
}

function isDeleteBlockedDetail(detail: string | null): boolean {
  if (!detail) {
    return false;
  }
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("events reference") ||
    normalized.includes("events referenc")
  );
}

function mapFormulaResponseToDraft(itemList: ScopeFormulaRecord[]): ActionFormulaDraftRow[] {
  return [...itemList]
    .sort((a, b) => a.step - b.step || a.id - b.id)
    .map((item) => ({
      clientKey: `s-${item.id}`,
      serverId: item.id,
      statement: item.statement,
      pendingDelete: false
    }));
}

function cloneFormulaRowList(rowList: ActionFormulaDraftRow[]): ActionFormulaDraftRow[] {
  return rowList.map((row) => ({ ...row }));
}

function createEmptyFormulaDraftRow(): ActionFormulaDraftRow {
  return {
    clientKey: `n-${crypto.randomUUID()}`,
    statement: "",
    pendingDelete: false
  };
}

const FORMULA_VALIDATION_CODE_LIST = [
  "formula_invalid_assignment",
  "formula_invalid_target",
  "formula_unknown_field_id",
  "formula_expression_invalid"
] as const;

type FormulaValidationCode = (typeof FORMULA_VALIDATION_CODE_LIST)[number];

const FORMULA_VALIDATION_CODE_SET = new Set<string>(FORMULA_VALIDATION_CODE_LIST);

function isFormulaValidationCode(code: string): code is FormulaValidationCode {
  return FORMULA_VALIDATION_CODE_SET.has(code);
}

function userMessageForFormulaPersistFailure(
  error: unknown,
  tActionPage: (key: string, values?: Record<string, string | number>) => string,
  fallback: string
): string {
  if (error instanceof FormulaPersistError) {
    if (error.code && isFormulaValidationCode(error.code)) {
      const description = tActionPage(`formulas.validationError.${error.code}`);
      if (error.step != null) {
        return tActionPage("formulas.validationError.whichFormula", {
          step: error.step,
          description
        });
      }
      return description;
    }
    if (error.step != null) {
      const description = error.message.trim() || fallback;
      return tActionPage("formulas.validationError.whichFormula", {
        step: error.step,
        description
      });
    }
    return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function areFormulaDraftListsEqual(a: ActionFormulaDraftRow[], b: ActionFormulaDraftRow[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.clientKey !== right.clientKey ||
      left.serverId !== right.serverId ||
      left.statement !== right.statement ||
      left.pendingDelete !== right.pendingDelete
    ) {
      return false;
    }
  }
  return true;
}

export function ActionConfigurationClient({
  locale,
  labelLang,
  currentScope,
  hasAnyScope,
  initialActionDirectory,
  copy
}: ActionConfigurationClientProps) {
  const tPage = useTranslations("ActionConfigurationPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchActionKey = parseSelectedActionKey(searchParams.get("action"));

  const configurationPath = `/${locale}/app/configuration`;
  const actionPath = `/${locale}/app/configuration/action`;

  const replacePath = useCallback(
    (nextPath: string) => {
      router.replace(nextPath, { scroll: false });
    },
    [router]
  );

  const [directory, setDirectory] = useState<TenantScopeActionDirectoryResponse | null>(
    initialActionDirectory
  );

  const initialSelectedActionKey =
    initialActionDirectory != null
      ? resolveSelectedActionKey(
        initialActionDirectory.item_list,
        initialSearchActionKey,
        initialActionDirectory.can_edit
      )
      : null;
  const initialSelectedAction =
    typeof initialSelectedActionKey === "number" && initialActionDirectory
      ? initialActionDirectory.item_list.find(
        (item) => item.id === initialSelectedActionKey
      ) ?? null
      : null;

  const initialActionName = initialSelectedAction?.label_name?.trim() ?? "";

  const [selectedActionId, setSelectedActionId] = useState<number | null>(
    typeof initialSelectedActionKey === "number" ? initialSelectedActionKey : null
  );
  const [isCreateMode, setIsCreateMode] = useState(initialSelectedActionKey === "new");
  const [actionName, setActionName] = useState(
    initialSelectedActionKey === "new" ? "" : initialActionName
  );
  const [baseline, setBaseline] = useState({
    actionName: initialSelectedActionKey === "new" ? "" : initialActionName
  });
  const [fieldError, setFieldError] = useState<{ actionName?: string }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");
  const [formulaRowList, setFormulaRowList] = useState<ActionFormulaDraftRow[]>([]);
  const [formulaBaselineList, setFormulaBaselineList] = useState<ActionFormulaDraftRow[]>([]);
  const [formulasCanEdit, setFormulasCanEdit] = useState(false);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [formulaLoadError, setFormulaLoadError] = useState<string | null>(null);
  const [scopeFieldList, setScopeFieldList] = useState<FormulaFieldOption[]>([]);
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const initialSearchActionKeyRef = useRef<ActionSelectionKey>(initialSearchActionKey);
  const selectedActionKeyRef = useRef<ActionSelectionKey>(initialSelectedActionKey);
  const didResolveInitialUrlRef = useRef(false);
  const didMountFilterRef = useRef(false);
  /** Após falha ao gravar fórmulas (ex.: validação 422), evita um load imediato que sobrescreve o rascunho. */
  const skipNextFormulaAutoLoadRef = useRef(false);

  const selectedAction = useMemo(() => {
    if (isCreateMode) {
      return null;
    }

    return (
      selectedActionId == null
        ? null
        : (directory?.item_list.find((item) => item.id === selectedActionId) ?? null)
    );
  }, [directory?.item_list, isCreateMode, selectedActionId]);

  const selectedActionKey: ActionSelectionKey = isCreateMode ? "new" : selectedAction?.id ?? null;

  useReplaceConfigurationPath(
    actionPath,
    searchParams,
    replacePath,
    "action",
    directory ? (isCreateMode ? "new" : selectedAction?.id ?? null) : null
  );

  const resolveDirectoryTitle = useCallback(
    (item: TenantScopeActionRecord) => {
      const name = item.label_name?.trim();
      if (name && name.length > 0) {
        return name;
      }
      return tPage("list.fallbackTitle", { id: item.id });
    },
    [tPage]
  );

  const editorFlashKey = useMemo(() => {
    if (!directory) {
      return null;
    }

    if (isCreateMode) {
      return "new";
    }

    if (!selectedAction) {
      return null;
    }

    return `id:${String(selectedAction.id)}:ln:${selectedAction.label_name ?? ""}`;
  }, [directory, isCreateMode, selectedAction]);

  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    Boolean(directory)
  );

  useEffect(() => {
    selectedActionKeyRef.current = isCreateMode ? "new" : selectedAction?.id ?? null;
  }, [isCreateMode, selectedAction]);

  const syncFromDirectory = useCallback(
    (
      nextDirectory: TenantScopeActionDirectoryResponse | null,
      preferredKey?: ActionSelectionKey
    ) => {
      if (!nextDirectory) {
        setDirectory(null);
        setIsCreateMode(false);
        setSelectedActionId(null);
        setActionName("");
        setBaseline({ actionName: "" });
        setFieldError({});
        setRequestErrorMessage(null);
        setIsDeletePending(false);
        return null;
      }

      const nextKey = resolveSelectedActionKey(
        nextDirectory.item_list,
        preferredKey ?? null,
        nextDirectory.can_edit
      );
      const nextSelectedAction =
        typeof nextKey === "number"
          ? nextDirectory.item_list.find((item) => item.id === nextKey) ?? null
          : null;

      const nextActionName =
        nextSelectedAction?.label_name?.trim() ?? (nextKey === "new" ? "" : "");

      setDirectory(nextDirectory);
      setIsCreateMode(nextKey === "new");
      setSelectedActionId(typeof nextKey === "number" ? nextKey : null);
      setActionName(nextActionName);
      setBaseline({
        actionName: nextActionName
      });
      setFieldError({});
      setRequestErrorMessage(null);
      setIsDeletePending(false);

      return nextKey;
    },
    []
  );

  useEffect(() => {
    const preferredKey = didResolveInitialUrlRef.current
      ? selectedActionKeyRef.current
      : initialSearchActionKeyRef.current;

    didResolveInitialUrlRef.current = true;
    syncFromDirectory(initialActionDirectory, preferredKey);
  }, [initialActionDirectory, syncFromDirectory]);

  const scopeId = currentScope?.id;

  const loadActionDirectory = useCallback(
    async (preferredKey?: ActionSelectionKey) => {
      if (scopeId == null) {
        return;
      }
      const query = new URLSearchParams({ label_lang: labelLang });
      const normalizedQuery = filterQuery.trim();
      if (normalizedQuery) {
        query.set("q", normalizedQuery);
      }

      try {
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/actions?${query.toString()}`
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, copy.loadError) ?? copy.loadError
          );
          return;
        }
        syncFromDirectory(
          data as TenantScopeActionDirectoryResponse,
          preferredKey ?? selectedActionKeyRef.current
        );
      } catch {
        setRequestErrorMessage(copy.loadError);
      }
    },
    [copy.loadError, filterQuery, labelLang, scopeId, syncFromDirectory]
  );

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    void loadActionDirectory(selectedActionKeyRef.current);
  }, [loadActionDirectory]);

  const loadScopeFields = useCallback(async () => {
    if (scopeId == null) {
      setScopeFieldList([]);
      return;
    }
    try {
      const query = new URLSearchParams({ label_lang: labelLang });
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/fields?${query.toString()}`
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setScopeFieldList([]);
        return;
      }
      const parsed = data as TenantScopeFieldDirectoryResponse;
      setScopeFieldList(
        parsed.item_list.map((item) => ({
          id: item.id,
          labelName: item.label_name?.trim() ?? ""
        }))
      );
    } catch {
      setScopeFieldList([]);
    }
  }, [scopeId, labelLang]);

  useEffect(() => {
    void loadScopeFields();
  }, [loadScopeFields]);

  const loadFormulas = useCallback(async () => {
    if (scopeId == null || selectedActionId == null || isCreateMode) {
      return;
    }
    setFormulaLoading(true);
    setFormulaLoadError(null);
    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/actions/${selectedActionId}/formulas`
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormulaLoadError(
          parseErrorDetail(data, tPage("formulas.loadError")) ?? tPage("formulas.loadError")
        );
        return;
      }
      const parsed = data as ScopeFormulaListResponse;
      const rows = mapFormulaResponseToDraft(parsed.item_list);
      setFormulaRowList(rows);
      setFormulaBaselineList(cloneFormulaRowList(rows));
      setFormulasCanEdit(parsed.can_edit);
    } finally {
      setFormulaLoading(false);
    }
  }, [scopeId, selectedActionId, isCreateMode, tPage]);

  useEffect(() => {
    if (isCreateMode || scopeId == null || selectedActionId == null) {
      const initialCreateFormulaRowList = isCreateMode ? [createEmptyFormulaDraftRow()] : [];
      setFormulaRowList(initialCreateFormulaRowList);
      setFormulaBaselineList(cloneFormulaRowList(initialCreateFormulaRowList));
      setFormulasCanEdit(false);
      setFormulaLoadError(null);
      setFormulaLoading(false);
      return;
    }
    if (skipNextFormulaAutoLoadRef.current) {
      skipNextFormulaAutoLoadRef.current = false;
      return;
    }
    void loadFormulas();
  }, [loadFormulas, isCreateMode, scopeId, selectedActionId]);

  const formulasDirty = useMemo(
    () => !areFormulaDraftListsEqual(formulaRowList, formulaBaselineList),
    [formulaRowList, formulaBaselineList]
  );

  const handleFormulaRowListChange = useCallback((next: ActionFormulaDraftRow[]) => {
    setRequestErrorMessage(null);
    setFormulaRowList(next);
  }, []);

  const handleAddFormula = useCallback(() => {
    setRequestErrorMessage(null);
    setFormulaRowList((previous) => [
      ...previous,
      createEmptyFormulaDraftRow()
    ]);
  }, []);

  const isDirty = useMemo(() => {
    return (
      actionName.trim() !== baseline.actionName.trim() ||
      isDeletePending ||
      formulasDirty
    );
  }, [actionName, baseline.actionName, isDeletePending, formulasDirty]);

  const validate = useCallback(() => {
    if (!actionName.trim()) {
      setFieldError({ actionName: copy.actionNameRequired });
      return false;
    }
    setFieldError({});
    return true;
  }, [actionName, copy.actionNameRequired]);

  const handleStartCreate = useCallback(() => {
    if (!directory?.can_edit || isSaving) {
      return;
    }

    if (isCreateMode) {
      return;
    }

    syncFromDirectory(directory, "new");
  }, [directory, isCreateMode, isSaving, syncFromDirectory]);

  const handleSelectAction = useCallback(
    (item: TenantScopeActionRecord) => {
      if (!directory) {
        return;
      }

      if (!isCreateMode && item.id === selectedAction?.id) {
        return;
      }

      syncFromDirectory(directory, item.id);
    },
    [directory, isCreateMode, selectedAction, syncFromDirectory]
  );

  const handleToggleDelete = useCallback(() => {
    if (isSaving) {
      return;
    }

    setRequestErrorMessage(null);
    setIsDeletePending((previous) => !previous);
  }, [isSaving]);

  const handleSave = useCallback(async () => {
    setRequestErrorMessage(null);

    if (!directory || scopeId == null) {
      return;
    }

    if (!isDeletePending && !validate()) {
      return;
    }

    if (!isDeletePending && formulasDirty && (formulasCanEdit || isCreateMode)) {
      const activeRowList = formulaRowList.filter((row) => !row.pendingDelete);
      for (const row of activeRowList) {
        if (!row.statement.trim()) {
          setRequestErrorMessage(tPage("formulas.statementRequired"));
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      if (isCreateMode) {
        const response = await fetch(`/api/auth/tenant/current/scopes/${scopeId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label_lang: labelLang,
            label_name: actionName.trim()
          })
        });
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, copy.createError) ?? copy.createError
          );
          return;
        }

        const updatedDirectory = data as TenantScopeActionDirectoryResponse;
        const previousIdSet = new Set(directory.item_list.map((item) => item.id));
        const created = updatedDirectory.item_list.find(
          (item) => !previousIdSet.has(item.id)
        );

        if (created != null && directory.can_edit && formulasDirty) {
          try {
            await runActionFormulaPersist({
              scopeId,
              actionId: created.id,
              draftRowList: formulaRowList,
              baselineRowList: []
            });
          } catch (error) {
            skipNextFormulaAutoLoadRef.current = true;
            syncFromDirectory(updatedDirectory, created.id);
            setFormulasCanEdit(updatedDirectory.can_edit);
            setRequestErrorMessage(
              userMessageForFormulaPersistFailure(error, tPage, copy.saveError)
            );
            setHistoryRefreshKey((previous) => previous + 1);
            return;
          }
        }

        syncFromDirectory(updatedDirectory, created?.id ?? "new");
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      if (!selectedAction) {
        return;
      }

      if (isDeletePending) {
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/actions/${selectedAction.id}`,
          { method: "DELETE" }
        );
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          const detail = parseErrorDetail(data, copy.deleteError) ?? copy.deleteError;
          if (isDeleteBlockedDetail(detail)) {
            setRequestErrorMessage(copy.deleteBlockedDetail);
            return;
          }
          setRequestErrorMessage(detail);
          return;
        }

        const updatedDirectory = data as TenantScopeActionDirectoryResponse;
        const nextKeyAfterMutation: ActionSelectionKey =
          updatedDirectory.can_edit ? "new" : null;
        syncFromDirectory(updatedDirectory, nextKeyAfterMutation);
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      const nameDirty = actionName.trim() !== baseline.actionName.trim();
      let latestDirectory: TenantScopeActionDirectoryResponse = directory;

      if (nameDirty) {
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/actions/${selectedAction.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label_lang: labelLang,
              label_name: actionName.trim()
            })
          }
        );
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(parseErrorDetail(data, copy.saveError) ?? copy.saveError);
          return;
        }

        latestDirectory = data as TenantScopeActionDirectoryResponse;
        setDirectory(latestDirectory);
        setBaseline({ actionName: actionName.trim() });
      }

      if (formulasCanEdit && formulasDirty) {
        try {
          await runActionFormulaPersist({
            scopeId,
            actionId: selectedAction.id,
            draftRowList: formulaRowList,
            baselineRowList: formulaBaselineList
          });
        } catch (error) {
          setRequestErrorMessage(
            userMessageForFormulaPersistFailure(error, tPage, copy.saveError)
          );
          return;
        }
        await loadFormulas();
      }

      syncFromDirectory(latestDirectory, selectedAction.id);
      setHistoryRefreshKey((previous) => previous + 1);
    } catch {
      setRequestErrorMessage(
        isCreateMode
          ? copy.createError
          : isDeletePending
            ? copy.deleteError
            : copy.saveError
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    baseline.actionName,
    copy.createError,
    copy.deleteBlockedDetail,
    copy.deleteError,
    copy.saveError,
    directory,
    actionName,
    formulaBaselineList,
    formulaRowList,
    formulasCanEdit,
    formulasDirty,
    isCreateMode,
    isDeletePending,
    labelLang,
    loadFormulas,
    scopeId,
    selectedAction,
    syncFromDirectory,
    tPage,
    validate
  ]);

  const canEditForm = isCreateMode ? Boolean(directory?.can_edit) : Boolean(directory?.can_edit);
  const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
    isCreateMode,
    isDeletePending,
    canCreate: directory?.can_edit ?? false,
    canEdit: directory?.can_edit ?? false
  });
  const footerErrorMessage =
    requestErrorMessage ?? fieldError.actionName ?? null;

  const asideEmptyMessage = !currentScope
    ? hasAnyScope
      ? copy.missingCurrentScope
      : copy.emptyScope
    : copy.loadError;

  return (
    <ConfigurationDirectoryEditorShell
      headerTitle={copy.title}
      headerDescription={copy.description}
      topContent={
        directory ? (
          <DirectoryFilterPanel>
            <DirectoryFilterCard>
              <DirectoryFilterTextField
                id="action-filter-search"
                label={copy.filterSearchLabel}
                value={filterQuery}
                onChange={setFilterQuery}
              />
            </DirectoryFilterCard>
          </DirectoryFilterPanel>
        ) : null
      }
      editorPanelRef={editorPanelElementRef}
      isDeletePending={isDeletePending}
      directoryAside={
        <>
          {!directory ? (
            <div className="ui-panel ui-empty-panel">{asideEmptyMessage}</div>
          ) : null}

          {directory && !directory.can_edit ? (
            <div className="ui-notice-attention ui-notice-block">
              {copy.readOnlyNotice}
            </div>
          ) : null}

          <div className="ui-directory-list">
            {directory?.can_edit ? (
              <ConfigurationDirectoryCreateButton
                label={copy.directoryCreateLabel}
                active={isCreateMode}
                disabled={isSaving}
                onClick={handleStartCreate}
              />
            ) : null}

            {directory?.item_list.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectAction(item)}
                className="ui-directory-item"
                data-selected={item.id === selectedAction?.id ? "true" : undefined}
                data-delete-pending={
                  item.id === selectedAction?.id && isDeletePending
                    ? "true"
                    : undefined
                }
              >
                <p className="ui-directory-title">{resolveDirectoryTitle(item)}</p>
              </button>
            ))}

            {directory && directory.item_list.length === 0 && !directory.can_edit ? (
              <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                {copy.empty}
              </div>
            ) : null}
          </div>
        </>
      }
      editorForm={
        directory ? (
          <>
            <section className="ui-card ui-form-section ui-border-accent">
              <EditorPanelFlashOverlay active={isEditorFlashActive} />
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="action-display-name">
                  {copy.actionNameLabel}
                </label>
                <input
                  id="action-display-name"
                  type="text"
                  className="ui-input"
                  value={actionName}
                  onChange={(event) => {
                    setActionName(event.target.value);
                    setFieldError((previous) => ({
                      ...previous,
                      actionName: undefined
                    }));
                    setRequestErrorMessage(null);
                  }}
                  disabled={isDeletePending || !canEditForm}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldError.actionName)}
                />
                <p className="ui-field-hint">{copy.actionNameHint}</p>
                {fieldError.actionName ? (
                  <p className="ui-field-error">{fieldError.actionName}</p>
                ) : null}
              </div>
            </section>

            {isCreateMode ? (
              <ConfigurationInfoSection
                title={copy.sectionInfoTitle}
                description={copy.sectionInfoDescription}
              >
                <ul className="ui-info-topic-list">
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">
                        {copy.infoCreateLead}
                      </span>
                    </p>
                    <p className="ui-field-hint ui-info-topic-hint">
                      {copy.infoCreateHint}
                    </p>
                  </li>
                </ul>
              </ConfigurationInfoSection>
            ) : selectedAction ? (
              <ConfigurationInfoSection
                title={copy.sectionInfoTitle}
                description={copy.sectionInfoDescription}
              >
                <ul className="ui-info-topic-list">
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">
                        {copy.infoActionNameRegisteredLabel}
                      </span>
                      {": "}
                      <span className="ui-info-topic-value">
                        {selectedAction.label_name?.trim() || "-"}
                      </span>
                    </p>
                  </li>
                </ul>
              </ConfigurationInfoSection>
            ) : null}

            {(isCreateMode && directory.can_edit) ||
              (!isCreateMode && selectedAction) ? (
              <>
                {!isCreateMode && formulaLoadError ? (
                  <div className="ui-notice-attention ui-notice-block">
                    {formulaLoadError}
                  </div>
                ) : null}
                <ActionFormulaSection
                  canEdit={
                    isCreateMode ? Boolean(directory.can_edit) : formulasCanEdit
                  }
                  disabled={isSaving || isDeletePending}
                  isLoading={!isCreateMode && formulaLoading}
                  fieldList={scopeFieldList}
                  rowList={formulaRowList}
                  onChangeRowList={handleFormulaRowListChange}
                  onAdd={handleAddFormula}
                />
              </>
            ) : null}
          </>
        ) : (
          <div className="ui-panel ui-empty-panel">{asideEmptyMessage}</div>
        )
      }
      history={{
        headingId: "action-history-heading",
        title: copy.historyTitle,
        description: copy.historyDescription,
        tableName: "action",
        refreshKey: historyRefreshKey
      }}
      footer={{
        configurationPath,
        cancelLabel: copy.cancel,
        discardConfirm: copy.discardConfirm,
        isDirty,
        footerErrorMessage,
        onSave: () => void handleSave(),
        saveDisabled: directoryEditorSaveDisabled({
          hasEditableContext: Boolean(directory && selectedActionKey),
          canSubmit,
          isSaving,
          isDirty
        }),
        saveLabel: copy.save,
        savingLabel: copy.saving,
        isSaving,
        dangerAction:
          directory && !isCreateMode && selectedAction ? (
            <TrashIconButton
              marked={isDeletePending}
              ariaLabel={isDeletePending ? copy.undoDelete : copy.delete}
              disabled={isSaving}
              onClick={handleToggleDelete}
            />
          ) : null
      }}
    />
  );
}
