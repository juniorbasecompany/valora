"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryListToolbarRow } from "@/component/configuration/configuration-directory-list-toolbar-row";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import {
  DirectoryFilterCard,
  DirectoryFilterPanel,
  DirectoryFilterTextField
} from "@/component/configuration/directory-filter-panel";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { ConfigurationNameField } from "@/component/configuration/configuration-name-field";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useEditorNewIntentGeneration } from "@/component/configuration/use-editor-new-intent-generation";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import type { TenantCurrentResponse } from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";
import { normalizeTextForSearch } from "@/lib/text/normalize-text-for-search";

export type TenantConfigurationCopy = {
  title: string;
  description: string;
  /** Painel vazio até o utilizador abrir o registo na lista ou Novo (padrão dos diretórios). */
  emptyEditor: string;
  directoryCreateLabel: string;
  historyTitle: string;
  historyDescription: string;
  filterSearchLabel: string;
  filterToggleAriaLabel: string;
  filterToggleLabel: string;
  filterEmpty: string;
  nameLabel: string;
  nameHint: string;
  cancel: string;
  delete: string;
  undoDelete: string;
  save: string;
  saving: string;
  readOnlyNotice: string;
  saveError: string;
  deleteError: string;
  validationError: string;
  discardConfirm: string;
};

type TenantEditorContext = "none" | "edit" | "new";

type TenantConfigurationClientProps = {
  locale: string;
  initialTenant: TenantCurrentResponse;
  copy: TenantConfigurationCopy;
};

function resolveAsideTitle(name: string, tenantId: number) {
  const trimmed = name.trim();
  if (trimmed) {
    return trimmed;
  }
  return `#${tenantId}`;
}

export function TenantConfigurationClient({
  locale,
  initialTenant,
  copy
}: TenantConfigurationClientProps) {
  const router = useRouter();
  const configurationPath = `/${locale}/app/configuration`;
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const { newIntentGeneration, bumpNewIntent } = useEditorNewIntentGeneration();

  const [tenant, setTenant] = useState(initialTenant);
  /* Com `can_edit`, mesmo padrão que escopos: abre já em formulário vazio (Novo). Só leitura mantém painel de instrução. */
  const [editorContext, setEditorContext] = useState<TenantEditorContext>(() =>
    initialTenant.can_edit ? "new" : "none"
  );
  const [name, setName] = useState("");
  const [baseline, setBaseline] = useState({
    name: ""
  });
  const [fieldError, setFieldError] = useState<{
    name?: string;
  }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    setTenant(initialTenant);
    setFieldError({});
    setRequestErrorMessage(null);
    setIsDeletePending(false);
    if (editorContext === "edit") {
      setName(initialTenant.name);
      setBaseline({
        name: initialTenant.name
      });
    }
  }, [editorContext, initialTenant]);

  const editorFlashKey = useMemo(() => {
    if (editorContext === "none") {
      return null;
    }
    if (editorContext === "new") {
      return `new:${String(newIntentGeneration)}`;
    }
    return `id:${String(tenant.id)}:name:${tenant.name}`;
  }, [editorContext, newIntentGeneration, tenant.id, tenant.name]);
  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    editorContext !== "none"
  );

  const isDirty = useMemo(() => {
    return (
      name.trim() !== baseline.name.trim() ||
      isDeletePending
    );
  }, [baseline.name, name, isDeletePending]);

  const validate = useCallback(() => {
    const nextError: { name?: string } = {};
    if (!name.trim()) {
      nextError.name = copy.validationError;
    }
    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [copy.validationError, name]);

  const handleToggleDelete = useCallback(() => {
    if (!tenant.can_delete || isSaving) {
      return;
    }
    setRequestErrorMessage(null);
    setIsDeletePending((previous) => !previous);
  }, [isSaving, tenant.can_delete]);

  const loadEditFromTenant = useCallback(() => {
    setEditorContext("edit");
    setName(tenant.name);
    setBaseline({
      name: tenant.name
    });
    setFieldError({});
    setRequestErrorMessage(null);
    setIsDeletePending(false);
  }, [tenant.name]);

  const collapseToNone = useCallback(() => {
    setEditorContext("none");
    setName("");
    setBaseline({ name: "" });
    setFieldError({});
    setRequestErrorMessage(null);
    setIsDeletePending(false);
  }, []);

  const handleTenantRowClick = useCallback(() => {
    if (editorContext === "edit") {
      collapseToNone();
      return;
    }

    loadEditFromTenant();
  }, [
    collapseToNone,
    editorContext,
    loadEditFromTenant
  ]);

  const handleStartCreate = useCallback(() => {
    if (!tenant.can_edit || isSaving) {
      return;
    }
    bumpNewIntent();
    if (editorContext !== "new") {
      setEditorContext("new");
      setName("");
      setBaseline({ name: "" });
      setFieldError({});
      setRequestErrorMessage(null);
      setIsDeletePending(false);
    }
  }, [bumpNewIntent, editorContext, isSaving, tenant.can_edit]);

  const handleSave = useCallback(async () => {
    if (editorContext === "none") {
      return;
    }
    setRequestErrorMessage(null);
    if (!isDeletePending && !validate()) {
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(
        "/api/auth/tenant/current",
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
        setRequestErrorMessage(
          parseErrorDetail(
            data,
            isDeletePending ? copy.deleteError : copy.saveError
          ) ?? (isDeletePending ? copy.deleteError : copy.saveError)
        );
        return;
      }
      if (isDeletePending) {
        await fetch("/api/auth/logout", {
          method: "POST"
        }).catch(() => null);
        router.replace(`/${locale}/login?reason=signed_out`);
        return;
      }
      const updated = data as TenantCurrentResponse;
      setTenant(updated);
      setIsDeletePending(false);
      if (updated.can_edit) {
        bumpNewIntent();
        setName("");
        setBaseline({ name: "" });
        setEditorContext("new");
      } else {
        setName(updated.name);
        setBaseline({
          name: updated.name
        });
        setEditorContext("edit");
      }
      setHistoryRefreshKey((previous) => previous + 1);
      router.refresh();
    } catch {
      setRequestErrorMessage(isDeletePending ? copy.deleteError : copy.saveError);
    } finally {
      setIsSaving(false);
    }
  }, [
    bumpNewIntent,
    copy.deleteError,
    copy.saveError,
    name,
    editorContext,
    isDeletePending,
    locale,
    router,
    validate
  ]);

  const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
    isCreateMode: false,
    isDeletePending,
    canCreate: false,
    canEdit: editorContext !== "none" && tenant.can_edit
  });

  const footerErrorMessage =
    requestErrorMessage ?? fieldError.name ?? null;

  const asideTitle = resolveAsideTitle(tenant.name, tenant.id);
  const tenantMatchesFilter = useMemo(() => {
    const normalizedQuery = normalizeTextForSearch(filterQuery);
    if (!normalizedQuery) {
      return true;
    }
    const candidateText = normalizeTextForSearch(
      `${tenant.name} ${String(tenant.id)}`
    );
    return candidateText.includes(normalizedQuery);
  }, [filterQuery, tenant.id, tenant.name]);

  return (
    <ConfigurationDirectoryEditorShell
      headerTitle={copy.title}
      headerDescription={copy.description}
      filter={{
        panel: (
          <DirectoryFilterPanel>
            <DirectoryFilterCard>
              <DirectoryFilterTextField
                id="tenant-filter-search"
                label={copy.filterSearchLabel}
                value={filterQuery}
                onChange={setFilterQuery}
              />
            </DirectoryFilterCard>
          </DirectoryFilterPanel>
        ),
        storageSegment: "tenant"
      }}
      editorPanelRef={editorPanelElementRef}
      isDeletePending={isDeletePending}
      editorVariant="emptyWhenNoContext"
      hasEditorContext={editorContext !== "none"}
      emptyEditorMessage={copy.emptyEditor}
      directoryAside={
        <>
          {!tenant.can_edit ? (
            <div className="ui-notice-attention ui-notice-block">
              {copy.readOnlyNotice}
            </div>
          ) : null}

          <div className="ui-directory-list">
            <ConfigurationDirectoryListToolbarRow
              showFilterToggle
              filterSegment="tenant"
              filterToggleAriaLabel={copy.filterToggleAriaLabel}
              filterToggleLabel={copy.filterToggleLabel}
              end={
                tenant.can_edit ? (
                  <ConfigurationDirectoryCreateButton
                    label={copy.directoryCreateLabel}
                    active={editorContext === "new"}
                    disabled={isSaving}
                    onClick={handleStartCreate}
                    wrapInToolbar={false}
                  />
                ) : null
              }
            />

            {tenantMatchesFilter ? (
              <button
                type="button"
                className="ui-directory-item"
                data-selected={editorContext === "edit" ? "true" : undefined}
                data-delete-pending={isDeletePending ? "true" : undefined}
                onClick={handleTenantRowClick}
              >
                <div className="ui-row-between">
                  <div className="ui-min-w-0">
                    <p className="ui-directory-title">{asideTitle}</p>
                  </div>
                </div>
              </button>
            ) : (
              <div className="ui-panel ui-empty-panel ui-panel-body-compact">
                {copy.filterEmpty}
              </div>
            )}
          </div>
        </>
      }
      editorForm={
        <>
          <ConfigurationNameField
            inputId="tenant-name"
            name={name}
            setName={setName}
            setFieldError={setFieldError}
            fieldError={fieldError}
            disabled={isDeletePending || !tenant.can_edit}
            label={copy.nameLabel}
            hint={copy.nameHint}
            flashActive={isEditorFlashActive}
            onAfterFieldEdit={() => setRequestErrorMessage(null)}
          />

        </>
      }
      history={{
        headingId: "tenant-history-heading",
        title: copy.historyTitle,
        description: copy.historyDescription,
        tableName: "tenant",
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
          hasEditableContext: editorContext !== "none",
          canSubmit,
          isSaving,
          isDirty
        }),
        saveLabel: copy.save,
        savingLabel: copy.saving,
        isSaving,
        dangerAction:
          editorContext === "edit" && tenant.can_delete ? (
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
