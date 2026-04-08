"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationNameField } from "@/component/configuration/configuration-name-field";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryListToolbarRow } from "@/component/configuration/configuration-directory-list-toolbar-row";
import {
  DirectoryFilterCard,
  DirectoryFilterPanel,
  DirectoryFilterTextField
} from "@/component/configuration/directory-filter-panel";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useEditorNewIntentGeneration } from "@/component/configuration/use-editor-new-intent-generation";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import type {
  TenantScopeDirectoryResponse,
  TenantScopeRecord
} from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

export type ScopeConfigurationCopy = {
  title: string;
  description: string;
  empty: string;
  historyTitle: string;
  historyDescription: string;
  filterSearchLabel: string;
  filterToggleAriaLabel: string;
  filterToggleLabel: string;
  nameLabel: string;
  nameHint: string;
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
  validationError: string;
  discardConfirm: string;
};

type ScopeConfigurationClientProps = {
  locale: string;
  initialDirectory: TenantScopeDirectoryResponse;
  copy: ScopeConfigurationCopy;
};

type ScopeSelectionKey = number | "new" | null;

function resolveScopeLabel(scope: TenantScopeRecord) {
  return scope.name.trim() || "-";
}

function parseSelectedScopeKey(raw: string | null): ScopeSelectionKey {
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

function resolveSelectedScopeKey(
  itemList: TenantScopeRecord[],
  preferredKey: ScopeSelectionKey,
  canCreate: boolean
): ScopeSelectionKey {
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

  /* Sem query explícita: painel novo/vazio, sem seleção automática de item existente. */
  return canCreate ? "new" : null;
}

export function ScopeConfigurationClient({
  locale,
  initialDirectory,
  copy
}: ScopeConfigurationClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchScopeKey = parseSelectedScopeKey(searchParams.get("scope"));
  const initialSelectedScopeKey = resolveSelectedScopeKey(
    initialDirectory.item_list,
    initialSearchScopeKey,
    initialDirectory.can_create
  );
  const initialSelectedScope =
    typeof initialSelectedScopeKey === "number"
      ? initialDirectory.item_list.find((item) => item.id === initialSelectedScopeKey) ?? null
      : null;

  const configurationPath = `/${locale}/app/configuration`;
  const scopePath = `/${locale}/app/configuration/scope`;

  const replacePath = useCallback(
    (nextPath: string) => {
      router.replace(nextPath, { scroll: false });
    },
    [router]
  );

  const [directory, setDirectory] = useState(initialDirectory);
  const [selectedScopeId, setSelectedScopeId] = useState<number | null>(
    typeof initialSelectedScopeKey === "number" ? initialSelectedScopeKey : null
  );
  const [isCreateMode, setIsCreateMode] = useState(initialSelectedScopeKey === "new");
  const [name, setName] = useState(initialSelectedScope?.name ?? "");
  const [baseline, setBaseline] = useState({
    name: initialSelectedScope?.name ?? ""
  });
  const [fieldError, setFieldError] = useState<{
    name?: string;
  }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const { newIntentGeneration, bumpNewIntent } = useEditorNewIntentGeneration();
  const initialSearchScopeKeyRef = useRef<ScopeSelectionKey>(initialSearchScopeKey);
  const selectedScopeKeyRef = useRef<ScopeSelectionKey>(initialSelectedScopeKey);
  const didResolveInitialUrlRef = useRef(false);
  const didMountFilterRef = useRef(false);

  const selectedScope = useMemo(() => {
    if (isCreateMode) {
      return null;
    }

    return (
      selectedScopeId == null
        ? null
        : (directory.item_list.find((item) => item.id === selectedScopeId) ?? null)
    );
  }, [directory.item_list, isCreateMode, selectedScopeId]);

  const selectedScopeKey: ScopeSelectionKey = isCreateMode ? "new" : selectedScope?.id ?? null;

  useReplaceConfigurationPath(
    scopePath,
    searchParams,
    replacePath,
    "scope",
    isCreateMode ? "new" : selectedScope?.id ?? null
  );

  const editorFlashKey = useMemo(() => {
    if (isCreateMode) {
      return `new:${String(newIntentGeneration)}`;
    }

    if (!selectedScope) {
      return null;
    }

    return `id:${String(selectedScope.id)}:name:${selectedScope.name}`;
  }, [isCreateMode, newIntentGeneration, selectedScope]);

  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  /* Diretório de escopo está sempre carregado neste cliente; não há estado `directory === null`. */
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    true
  );

  useEffect(() => {
    selectedScopeKeyRef.current = isCreateMode ? "new" : selectedScope?.id ?? null;
  }, [isCreateMode, selectedScope]);

  const syncFromDirectory = useCallback(
    (nextDirectory: TenantScopeDirectoryResponse, preferredKey?: ScopeSelectionKey) => {
      const nextKey = resolveSelectedScopeKey(
        nextDirectory.item_list,
        preferredKey ?? null,
        nextDirectory.can_create
      );
      const nextSelectedScope =
        typeof nextKey === "number"
          ? nextDirectory.item_list.find((item) => item.id === nextKey) ?? null
          : null;

      setDirectory(nextDirectory);
      setIsCreateMode(nextKey === "new");
      setSelectedScopeId(typeof nextKey === "number" ? nextKey : null);
      setName(nextSelectedScope?.name ?? "");
      setBaseline({
        name: nextSelectedScope?.name ?? ""
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
      ? selectedScopeKeyRef.current
      : initialSearchScopeKeyRef.current;

    didResolveInitialUrlRef.current = true;
    syncFromDirectory(initialDirectory, preferredKey);
  }, [initialDirectory, syncFromDirectory]);

  const loadScopeDirectory = useCallback(
    async (preferredKey?: ScopeSelectionKey) => {
      const query = new URLSearchParams();
      const normalizedQuery = filterQuery.trim();
      if (normalizedQuery) {
        query.set("q", normalizedQuery);
      }

      try {
        const response = await fetch(
          `/api/auth/tenant/current/scopes?${query.toString()}`
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setRequestErrorMessage(parseErrorDetail(data, copy.saveError) ?? copy.saveError);
          return;
        }
        syncFromDirectory(
          data as TenantScopeDirectoryResponse,
          preferredKey ?? selectedScopeKeyRef.current
        );
      } catch {
        setRequestErrorMessage(copy.saveError);
      }
    },
    [copy.saveError, filterQuery, syncFromDirectory]
  );

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    void loadScopeDirectory(selectedScopeKeyRef.current);
  }, [loadScopeDirectory]);

  const isDirty = useMemo(() => {
    return (
      name.trim() !== baseline.name.trim() ||
      isDeletePending
    );
  }, [baseline.name, isDeletePending, name]);

  const validate = useCallback(() => {
    const nextError: { name?: string } = {};

    if (!name.trim()) {
      nextError.name = copy.validationError;
    }

    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [copy.validationError, name]);

  const handleStartCreate = useCallback(() => {
    if (!directory.can_create || isSaving) {
      return;
    }

    bumpNewIntent();
    if (!isCreateMode) {
      syncFromDirectory(directory, "new");
    }
  }, [bumpNewIntent, directory, isCreateMode, isSaving, syncFromDirectory]);

  const handleSelectScope = useCallback(
    (scope: TenantScopeRecord) => {
      if (!isCreateMode && scope.id === selectedScope?.id) {
        return;
      }

      syncFromDirectory(directory, scope.id);
    },
    [directory, isCreateMode, selectedScope, syncFromDirectory]
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

    if (!isDeletePending && !validate()) {
      return;
    }

    setIsSaving(true);
    try {
      if (isCreateMode) {
        const response = await fetch("/api/auth/tenant/current/scopes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim()
          })
        });
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, copy.createError) ?? copy.createError
          );
          return;
        }

        const updatedDirectory = data as TenantScopeDirectoryResponse;
        syncFromDirectory(updatedDirectory, "new");
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      if (!selectedScope) {
        return;
      }

      const response = await fetch(
        `/api/auth/tenant/current/scopes/${selectedScope.id}`,
        isDeletePending
          ? {
            method: "DELETE"
          }
          : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim()
            })
          }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fallback = isDeletePending ? copy.deleteError : copy.saveError;
        setRequestErrorMessage(parseErrorDetail(data, fallback) ?? fallback);
        return;
      }

      const updatedDirectory = data as TenantScopeDirectoryResponse;
      syncFromDirectory(updatedDirectory, "new");
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
    copy.createError,
    copy.deleteError,
    copy.saveError,
    isCreateMode,
    isDeletePending,
    name,
    selectedScope,
    syncFromDirectory,
    validate
  ]);

  const canEditForm = isCreateMode
    ? directory.can_create
    : selectedScope?.can_edit ?? false;
  const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
    isCreateMode,
    isDeletePending,
    canCreate: directory.can_create,
    canEdit: selectedScope?.can_edit ?? false
  });
  const footerErrorMessage =
    requestErrorMessage ?? fieldError.name ?? null;

  return (
    <ConfigurationDirectoryEditorShell
      headerTitle={copy.title}
      headerDescription={copy.description}
      filter={{
        panel: (
          <DirectoryFilterPanel>
            <DirectoryFilterCard>
              <DirectoryFilterTextField
                id="scope-filter-search"
                label={copy.filterSearchLabel}
                value={filterQuery}
                onChange={setFilterQuery}
              />
            </DirectoryFilterCard>
          </DirectoryFilterPanel>
        ),
        storageSegment: "scope"
      }}
      editorPanelRef={editorPanelElementRef}
      isDeletePending={isDeletePending}
      directoryAside={
        <>
          {!directory.can_edit ? (
            <div className="ui-notice-attention ui-notice-block">
              {copy.readOnlyNotice}
            </div>
          ) : null}

          <div className="ui-directory-list">
            <ConfigurationDirectoryListToolbarRow
              showFilterToggle
              filterSegment="scope"
              filterToggleAriaLabel={copy.filterToggleAriaLabel}
              filterToggleLabel={copy.filterToggleLabel}
              end={
                directory.can_create ? (
                  <ConfigurationDirectoryCreateButton
                    label={copy.directoryCreateLabel}
                    active={isCreateMode}
                    disabled={isSaving}
                    onClick={handleStartCreate}
                    wrapInToolbar={false}
                  />
                ) : null
              }
            />

            {directory.item_list.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectScope(item)}
                className="ui-directory-item"
                data-selected={item.id === selectedScope?.id ? "true" : undefined}
                data-delete-pending={
                  item.id === selectedScope?.id && isDeletePending ? "true" : undefined
                }
              >
                <p className="ui-directory-title">
                  {resolveScopeLabel(item)}
                </p>
              </button>
            ))}

            {directory.item_list.length === 0 && !directory.can_create ? (
              <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                {copy.empty}
              </div>
            ) : null}
          </div>
        </>
      }
      editorForm={
        <>
          <ConfigurationNameField
            inputId="scope-name"
            name={name}
            setName={setName}
            setFieldError={setFieldError}
            fieldError={fieldError}
            disabled={isDeletePending || !canEditForm}
            label={copy.nameLabel}
            hint={copy.nameHint}
            flashActive={isEditorFlashActive}
            onAfterFieldEdit={() => setRequestErrorMessage(null)}
          />
        </>
      }
      history={{
        headingId: "scope-history-heading",
        title: copy.historyTitle,
        description: copy.historyDescription,
        tableName: "scope",
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
          hasEditableContext: Boolean(selectedScopeKey),
          canSubmit,
          isSaving,
          isDirty
        }),
        saveLabel: copy.save,
        savingLabel: copy.saving,
        isSaving,
        dangerAction:
          !isCreateMode && selectedScope ? (
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
