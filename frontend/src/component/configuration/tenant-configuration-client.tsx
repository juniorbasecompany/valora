"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import {
  DirectoryFilterCard,
  DirectoryFilterPanel,
  DirectoryFilterTextField
} from "@/component/configuration/directory-filter-panel";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { ConfigurationNameDisplayNameFields } from "@/component/configuration/configuration-name-display-name-fields";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import type { TenantCurrentResponse } from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

export type TenantConfigurationCopy = {
  title: string;
  description: string;
  /** Painel vazio até o utilizador abrir o registo na lista ou Novo (padrão dos diretórios). */
  emptyEditor: string;
  directoryCreateLabel: string;
  createLead: string;
  createHint: string;
  historyTitle: string;
  historyDescription: string;
  filterSearchLabel: string;
  filterEmpty: string;
  legalNameLabel: string;
  legalNameHint: string;
  displayNameLabel: string;
  displayNameHint: string;
  metadataSectionTitle: string;
  metadataSectionDescription: string;
  metadataIdLabel: string;
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

function resolveAsideTitle(displayName: string, legalName: string, tenantId: number) {
  const display = displayName.trim();
  if (display) {
    return display;
  }
  const legal = legalName.trim();
  if (legal) {
    return legal;
  }
  return `#${tenantId}`;
}

function normalizeTextForFilter(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function TenantConfigurationClient({
  locale,
  initialTenant,
  copy
}: TenantConfigurationClientProps) {
  const router = useRouter();
  const configurationPath = `/${locale}/app/configuration`;
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);

  const [tenant, setTenant] = useState(initialTenant);
  /* Com `can_edit`, mesmo padrão que escopos: abre já em formulário vazio (Novo). Só leitura mantém painel de instrução. */
  const [editorContext, setEditorContext] = useState<TenantEditorContext>(() =>
    initialTenant.can_edit ? "new" : "none"
  );
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [baseline, setBaseline] = useState({
    displayName: "",
    legalName: ""
  });
  const [fieldError, setFieldError] = useState<{
    displayName?: string;
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
      setDisplayName(initialTenant.display_name);
      setLegalName(initialTenant.name);
      setBaseline({
        displayName: initialTenant.display_name,
        legalName: initialTenant.name
      });
    }
  }, [editorContext, initialTenant]);

  const editorFlashKey = useMemo(() => {
    if (editorContext === "none") {
      return null;
    }
    if (editorContext === "new") {
      return "new";
    }
    return `id:${String(tenant.id)}:legal:${tenant.name}:display:${tenant.display_name}`;
  }, [editorContext, tenant.display_name, tenant.id, tenant.name]);
  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    editorContext !== "none"
  );

  const isDirty = useMemo(() => {
    return (
      displayName.trim() !== baseline.displayName.trim() ||
      legalName.trim() !== baseline.legalName.trim() ||
      isDeletePending
    );
  }, [baseline.displayName, baseline.legalName, displayName, isDeletePending, legalName]);

  const validate = useCallback(() => {
    const nextError: { displayName?: string; name?: string } = {};
    if (!displayName.trim()) {
      nextError.displayName = copy.validationError;
    }
    if (!legalName.trim()) {
      nextError.name = copy.validationError;
    }
    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [copy.validationError, displayName, legalName]);

  const handleToggleDelete = useCallback(() => {
    if (!tenant.can_delete || isSaving) {
      return;
    }
    setRequestErrorMessage(null);
    setIsDeletePending((previous) => !previous);
  }, [isSaving, tenant.can_delete]);

  const loadEditFromTenant = useCallback(() => {
    setEditorContext("edit");
    setDisplayName(tenant.display_name);
    setLegalName(tenant.name);
    setBaseline({
      displayName: tenant.display_name,
      legalName: tenant.name
    });
    setFieldError({});
    setRequestErrorMessage(null);
    setIsDeletePending(false);
  }, [tenant.display_name, tenant.name]);

  const collapseToNone = useCallback(() => {
    setEditorContext("none");
    setDisplayName("");
    setLegalName("");
    setBaseline({ displayName: "", legalName: "" });
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
    if (editorContext === "new") {
      return;
    }
    setEditorContext("new");
    setDisplayName("");
    setLegalName("");
    setBaseline({ displayName: "", legalName: "" });
    setFieldError({});
    setRequestErrorMessage(null);
    setIsDeletePending(false);
  }, [editorContext, isSaving, tenant.can_edit]);

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
              display_name: displayName.trim(),
              name: legalName.trim()
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
      setDisplayName(updated.display_name);
      setLegalName(updated.name);
      setBaseline({
        displayName: updated.display_name,
        legalName: updated.name
      });
      setIsDeletePending(false);
      setEditorContext("edit");
      setHistoryRefreshKey((previous) => previous + 1);
      router.refresh();
    } catch {
      setRequestErrorMessage(isDeletePending ? copy.deleteError : copy.saveError);
    } finally {
      setIsSaving(false);
    }
  }, [
    copy.deleteError,
    copy.saveError,
    displayName,
    editorContext,
    isDeletePending,
    legalName,
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
    requestErrorMessage ?? fieldError.name ?? fieldError.displayName ?? null;

  const asideTitle = resolveAsideTitle(tenant.display_name, tenant.name, tenant.id);
  const asideCaption = tenant.name.trim() || `#${tenant.id}`;
  const tenantMatchesFilter = useMemo(() => {
    const normalizedQuery = normalizeTextForFilter(filterQuery);
    if (!normalizedQuery) {
      return true;
    }
    const candidateText = normalizeTextForFilter(
      `${tenant.display_name} ${tenant.name} ${String(tenant.id)}`
    );
    return candidateText.includes(normalizedQuery);
  }, [filterQuery, tenant.display_name, tenant.id, tenant.name]);

  return (
    <ConfigurationDirectoryEditorShell
      headerTitle={copy.title}
      headerDescription={copy.description}
      topContent={
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
      }
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
            {tenant.can_edit ? (
              <ConfigurationDirectoryCreateButton
                label={copy.directoryCreateLabel}
                active={editorContext === "new"}
                disabled={isSaving}
                onClick={handleStartCreate}
              />
            ) : null}

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
                    <p className="ui-directory-caption">{asideCaption}</p>
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
          <ConfigurationNameDisplayNameFields
            nameInputId="tenant-legal-name"
            displayTextareaId="tenant-display-name"
            name={legalName}
            displayName={displayName}
            setName={setLegalName}
            setDisplayName={setDisplayName}
            setFieldError={setFieldError}
            fieldError={fieldError}
            disabled={isDeletePending || !tenant.can_edit}
            nameLabel={copy.legalNameLabel}
            nameHint={copy.legalNameHint}
            displayNameLabel={copy.displayNameLabel}
            displayNameHint={copy.displayNameHint}
            flashActive={isEditorFlashActive}
            onAfterFieldEdit={() => setRequestErrorMessage(null)}
          />

          {editorContext === "edit" ? (
            <ConfigurationInfoSection
              title={copy.metadataSectionTitle}
              description={copy.metadataSectionDescription}
            >
              <ul className="ui-info-topic-list">
                <li>
                  <p className="ui-info-topic-lead">
                    <span className="ui-info-topic-label">{copy.metadataIdLabel}</span>
                    {": "}
                    <span className="ui-info-topic-value">{tenant.id}</span>
                  </p>
                </li>
              </ul>
            </ConfigurationInfoSection>
          ) : null}

          {editorContext === "new" ? (
            <ConfigurationInfoSection
              title={copy.metadataSectionTitle}
              description={copy.metadataSectionDescription}
            >
              <ul className="ui-info-topic-list">
                <li>
                  <p className="ui-info-topic-lead">
                    <span className="ui-info-topic-label">{copy.createLead}</span>
                  </p>
                  <p className="ui-field-hint ui-info-topic-hint">{copy.createHint}</p>
                </li>
              </ul>
            </ConfigurationInfoSection>
          ) : null}
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
