"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ScopeRulesDirectorySortableList } from "@/component/configuration/configuration-scope-rules-directory-sortable";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryListToolbarRow } from "@/component/configuration/configuration-directory-list-toolbar-row";
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
import { ConfigurationPrimaryTextFieldSection } from "@/component/configuration/configuration-primary-text-field-section";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useEditorNewIntentGeneration } from "@/component/configuration/use-editor-new-intent-generation";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import { useConfigurationDirectoryFetchGeneration } from "@/component/configuration/use-configuration-directory-fetch-generation";
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
import { parseErrorDetail, resolveApiErrorUserMessage } from "@/lib/api/parse-error-detail";
import {
  applyConfigurationSelectionToWindowHistory,
  preferredSelectionKeyAfterEditSave
} from "@/lib/navigation/configuration-path";

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
  filterToggleAriaLabel: string;
  filterToggleLabel: string;
  actionNameLabel: string;
  actionNameHint: string;
  recurrenceLabel: string;
  recurrenceHint: string;
  actionNameRequired: string;
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
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
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
  tError: (key: string) => string,
  fallback: string
): string {
  if (error instanceof FormulaPersistError) {
    if (error.code && isFormulaValidationCode(error.code)) {
      const description = tActionPage(`formulas.validationError.${error.code}`);
      if (error.sort_order != null) {
        return tActionPage("formulas.validationError.whichFormula", {
          step: error.sort_order,
          description
        });
      }
      return description;
    }
    const resolved =
      error.apiPayload != null
        ? resolveApiErrorUserMessage(error.apiPayload, tError, error.message.trim() || fallback)
        : error.message.trim() || fallback;
    if (error.sort_order != null) {
      const description = resolved;
      return tActionPage("formulas.validationError.whichFormula", {
        step: error.sort_order,
        description
      });
    }
    return resolved;
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
  const tError = useTranslations("error");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchActionKey = parseSelectedActionKey(searchParams.get("action"));

  const configurationPath = `/${locale}/app`;
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
  const initialIsRecurrent = initialSelectedAction?.is_recurrent ?? false;

  const [selectedActionId, setSelectedActionId] = useState<number | null>(
    typeof initialSelectedActionKey === "number" ? initialSelectedActionKey : null
  );
  const [isCreateMode, setIsCreateMode] = useState(initialSelectedActionKey === "new");
  const [actionName, setActionName] = useState(
    initialSelectedActionKey === "new" ? "" : initialActionName
  );
  const [isRecurrent, setIsRecurrent] = useState(
    initialSelectedActionKey === "new" ? false : initialIsRecurrent
  );
  const [baseline, setBaseline] = useState({
    actionName: initialSelectedActionKey === "new" ? "" : initialActionName,
    isRecurrent: initialSelectedActionKey === "new" ? false : initialIsRecurrent
  });
  const [fieldError, setFieldError] = useState<{ actionName?: string }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");
  const [isDirectoryReorderBusy, setIsDirectoryReorderBusy] = useState(false);
  const [formulaRowList, setFormulaRowList] = useState<ActionFormulaDraftRow[]>([]);
  const [formulaBaselineList, setFormulaBaselineList] = useState<ActionFormulaDraftRow[]>([]);
  const [formulasCanEdit, setFormulasCanEdit] = useState(false);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [formulaLoadError, setFormulaLoadError] = useState<string | null>(null);
  const [scopeFieldList, setScopeFieldList] = useState<FormulaFieldOption[]>([]);
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const { newIntentGeneration, bumpNewIntent } = useEditorNewIntentGeneration();
  const selectedActionKeyRef = useRef<ActionSelectionKey>(initialSelectedActionKey);
  const didMountFilterRef = useRef(false);
  const {
    bumpAfterProgrammaticSync,
    captureGenerationAtFetchStart,
    isFetchResultStale
  } = useConfigurationDirectoryFetchGeneration();
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
      return `new:${String(newIntentGeneration)}`;
    }

    if (!selectedAction) {
      return null;
    }

    return `id:${String(selectedAction.id)}:ln:${selectedAction.label_name ?? ""}:ir:${selectedAction.is_recurrent ? "1" : "0"}`;
  }, [directory, isCreateMode, newIntentGeneration, selectedAction]);

  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    Boolean(directory)
  );

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
        setIsRecurrent(false);
        setBaseline({ actionName: "", isRecurrent: false });
        setFieldError({});
        setRequestErrorMessage(null);
        setIsDeletePending(false);
        selectedActionKeyRef.current = null;
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
      const nextIsRecurrent =
        nextKey === "new" ? false : (nextSelectedAction?.is_recurrent ?? false);

      setDirectory(nextDirectory);
      setIsCreateMode(nextKey === "new");
      setSelectedActionId(typeof nextKey === "number" ? nextKey : null);
      setActionName(nextActionName);
      setIsRecurrent(nextIsRecurrent);
      setBaseline({
        actionName: nextActionName,
        isRecurrent: nextIsRecurrent
      });
      setFieldError({});
      setRequestErrorMessage(null);
      setIsDeletePending(false);

      selectedActionKeyRef.current =
        nextKey === "new" ? "new" : typeof nextKey === "number" ? nextKey : null;

      return nextKey;
    },
    []
  );

  const applySyncFromHandlers = useCallback(
    (
      nextDirectory: TenantScopeActionDirectoryResponse | null,
      preferredKey?: ActionSelectionKey
    ) => {
      const keyForUrl: ActionSelectionKey =
        preferredKey ?? selectedActionKeyRef.current;
      applyConfigurationSelectionToWindowHistory(actionPath, "action", keyForUrl);
      syncFromDirectory(nextDirectory, preferredKey);
      bumpAfterProgrammaticSync();
    },
    [bumpAfterProgrammaticSync, syncFromDirectory]
  );

  const scopeId = currentScope?.id;

  const loadActionDirectory = useCallback(async () => {
      if (scopeId == null) {
        return;
      }
      const fetchGenerationAtStart = captureGenerationAtFetchStart();
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
        if (isFetchResultStale(fetchGenerationAtStart)) {
          return;
        }
        syncFromDirectory(
          data as TenantScopeActionDirectoryResponse,
          selectedActionKeyRef.current
        );
      } catch {
        setRequestErrorMessage(copy.loadError);
      }
    },
    [
      captureGenerationAtFetchStart,
      copy.loadError,
      filterQuery,
      isFetchResultStale,
      labelLang,
      scopeId,
      syncFromDirectory
    ]
  );

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    void loadActionDirectory();
  }, [loadActionDirectory]);

  const handleActionDirectoryReorder = useCallback(
    async (nextList: TenantScopeActionRecord[]) => {
      if (scopeId == null) {
        return;
      }
      const snapshot = directory;
      if (snapshot == null) {
        return;
      }
      // Evita snap visual ao soltar: alinha o estado com o drop antes da resposta da API.
      const optimisticList = nextList.map((row, index) => ({
        ...row,
        sort_order: index
      }));
      setDirectory({
        ...snapshot,
        item_list: optimisticList
      });
      setIsDirectoryReorderBusy(true);
      setRequestErrorMessage(null);
      try {
        const query = new URLSearchParams({ label_lang: labelLang });
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/actions/reorder?${query.toString()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action_id_list: nextList.map((row) => row.id) })
          }
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, tPage("directory.reorderError")) ??
            tPage("directory.reorderError")
          );
          setDirectory(snapshot);
          void loadActionDirectory();
          return;
        }
        setDirectory(data as TenantScopeActionDirectoryResponse);
        setHistoryRefreshKey((previous) => previous + 1);
      } catch {
        setRequestErrorMessage(tPage("directory.reorderError"));
        setDirectory(snapshot);
        void loadActionDirectory();
      } finally {
        setIsDirectoryReorderBusy(false);
      }
    },
    [directory, labelLang, loadActionDirectory, scopeId, tPage]
  );

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
      setFormulaRowList([]);
      setFormulaBaselineList([]);
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
      isRecurrent !== baseline.isRecurrent ||
      isDeletePending ||
      formulasDirty
    );
  }, [
    actionName,
    baseline.actionName,
    baseline.isRecurrent,
    formulasDirty,
    isDeletePending,
    isRecurrent
  ]);

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

    bumpNewIntent();
    if (!isCreateMode) {
      applySyncFromHandlers(directory, "new");
    }
  }, [applySyncFromHandlers, bumpNewIntent, directory, isCreateMode, isSaving]);

  const handleSelectAction = useCallback(
    (item: TenantScopeActionRecord) => {
      if (!directory) {
        return;
      }

      if (!isCreateMode && item.id === selectedAction?.id) {
        return;
      }

      applySyncFromHandlers(directory, item.id);
    },
    [applySyncFromHandlers, directory, isCreateMode, selectedAction]
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
            is_recurrent: isRecurrent,
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
            applySyncFromHandlers(updatedDirectory, created.id);
            setFormulasCanEdit(updatedDirectory.can_edit);
            setRequestErrorMessage(
              userMessageForFormulaPersistFailure(error, tPage, tError, copy.saveError)
            );
            setHistoryRefreshKey((previous) => previous + 1);
            return;
          }
        }

        bumpNewIntent();
        applySyncFromHandlers(updatedDirectory, "new");
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
        applySyncFromHandlers(updatedDirectory, nextKeyAfterMutation);
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      const nameDirty = actionName.trim() !== baseline.actionName.trim();
      const recurrenceDirty = isRecurrent !== baseline.isRecurrent;
      let latestDirectory: TenantScopeActionDirectoryResponse = directory;

      if (nameDirty || recurrenceDirty) {
        const patchBody: {
          is_recurrent?: boolean;
          label_lang?: LabelLang;
          label_name?: string;
        } = {
          label_lang: labelLang
        };
        if (recurrenceDirty) {
          patchBody.is_recurrent = isRecurrent;
        }
        if (nameDirty) {
          patchBody.label_name = actionName.trim();
        }
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/actions/${selectedAction.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody)
          }
        );
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(parseErrorDetail(data, copy.saveError) ?? copy.saveError);
          return;
        }

        latestDirectory = data as TenantScopeActionDirectoryResponse;
        setBaseline({
          actionName: actionName.trim(),
          isRecurrent
        });
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
            userMessageForFormulaPersistFailure(error, tPage, tError, copy.saveError)
          );
          return;
        }
        await loadFormulas();
      }

      bumpNewIntent();
      applySyncFromHandlers(
        latestDirectory,
        preferredSelectionKeyAfterEditSave(latestDirectory.can_edit, selectedAction.id)
      );
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
    applySyncFromHandlers,
    baseline.actionName,
    baseline.isRecurrent,
    bumpNewIntent,
    copy.createError,
    copy.deleteBlockedDetail,
    copy.deleteError,
    copy.saveError,
    directory,
    actionName,
    isRecurrent,
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

  /** Lista com alças sempre visíveis quando pode editar; filtro ou save apenas desativam o arrastar. */
  const directorySortableLayout = Boolean(directory?.can_edit);

  const directoryDragDisabled =
    isSaving ||
    isDirectoryReorderBusy ||
    Boolean(filterQuery.trim());

  const renderActionDirectoryButton = useCallback(
    (item: TenantScopeActionRecord) => (
      <button
        type="button"
        onClick={() => handleSelectAction(item)}
        className="ui-directory-item"
        data-selected={item.id === selectedAction?.id ? "true" : undefined}
        data-delete-pending={
          item.id === selectedAction?.id && isDeletePending ? "true" : undefined
        }
      >
        <p className="ui-directory-title">{resolveDirectoryTitle(item)}</p>
      </button>
    ),
    [handleSelectAction, isDeletePending, resolveDirectoryTitle, selectedAction?.id]
  );

  const renderActionDirectorySortableItem = useCallback(
    (item: TenantScopeActionRecord, dragHandle: ReactNode) => (
      <div
        className="ui-directory-item"
        data-selected={item.id === selectedAction?.id ? "true" : undefined}
        data-delete-pending={
          item.id === selectedAction?.id && isDeletePending ? "true" : undefined
        }
      >
        <div className="ui-scope-rules-directory-item-layout">
          <button
            type="button"
            className="ui-scope-rules-directory-item-main"
            onClick={() => handleSelectAction(item)}
          >
            <p className="ui-directory-title">{resolveDirectoryTitle(item)}</p>
          </button>
          {dragHandle}
        </div>
      </div>
    ),
    [handleSelectAction, isDeletePending, resolveDirectoryTitle, selectedAction?.id]
  );

  return (
    <ConfigurationDirectoryEditorShell
      headerTitle={copy.title}
      headerDescription={copy.description}
      filter={
        directory
          ? {
            panel: (
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
            ),
            storageSegment: "action"
          }
          : undefined
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
            <ConfigurationDirectoryListToolbarRow
              showFilterToggle={directory != null}
              filterSegment="action"
              filterToggleAriaLabel={copy.filterToggleAriaLabel}
              filterToggleLabel={copy.filterToggleLabel}
              end={
                directory?.can_edit ? (
                  <ConfigurationDirectoryCreateButton
                    label={copy.directoryCreateLabel}
                    active={isCreateMode}
                    disabled={isSaving || isDirectoryReorderBusy}
                    onClick={handleStartCreate}
                    wrapInToolbar={false}
                  />
                ) : null
              }
            />

            {directory && directory.item_list.length > 0 ? (
              directorySortableLayout ? (
                <ScopeRulesDirectorySortableList
                  itemList={directory.item_list}
                  dragDisabled={directoryDragDisabled}
                  dragHandleAriaLabel={tPage("directory.dragHandleAria")}
                  onReorder={handleActionDirectoryReorder}
                  renderItem={renderActionDirectorySortableItem}
                />
              ) : (
                directory.item_list.map((item) => (
                  <Fragment key={item.id}>{renderActionDirectoryButton(item)}</Fragment>
                ))
              )
            ) : null}

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
            <ConfigurationPrimaryTextFieldSection
              inputId="action-label-name"
              value={actionName}
              onValueChange={(next) => {
                setActionName(next);
                setFieldError((previous) => ({
                  ...previous,
                  actionName: undefined
                }));
                setRequestErrorMessage(null);
              }}
              label={copy.actionNameLabel}
              hint={copy.actionNameHint}
              error={fieldError.actionName}
              disabled={isDeletePending || !canEditForm}
              flashActive={isEditorFlashActive}
              onAfterEdit={() => setRequestErrorMessage(null)}
            >
              <div className="ui-field">
                <label
                  className="ui-field-label"
                  htmlFor="action-is-recurrent"
                  style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}
                >
                  <input
                    id="action-is-recurrent"
                    type="checkbox"
                    checked={isRecurrent}
                    disabled={isDeletePending || !canEditForm}
                    onChange={(event) => {
                      setIsRecurrent(event.target.checked);
                      setRequestErrorMessage(null);
                    }}
                  />
                  <span>{copy.recurrenceLabel}</span>
                </label>
                <p className="ui-field-hint">{copy.recurrenceHint}</p>
              </div>
            </ConfigurationPrimaryTextFieldSection>

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
