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
import { ConfigurationInfoSection } from "@/component/configuration/configuration-info-section";
import { ScopeRulesDirectorySortableList } from "@/component/configuration/configuration-scope-rules-directory-sortable";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryListToolbarRow } from "@/component/configuration/configuration-directory-list-toolbar-row";
import {
  DirectoryFilterCard,
  DirectoryFilterPanel,
  DirectoryFilterTextField
} from "@/component/configuration/directory-filter-panel";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";
import { useEditorPanelFlash } from "@/component/configuration/use-editor-panel-flash";
import { useEditorNewIntentGeneration } from "@/component/configuration/use-editor-new-intent-generation";
import { useFocusFirstEditorFieldAfterFlash } from "@/component/configuration/use-focus-first-editor-field-after-flash";
import { useReplaceConfigurationPath } from "@/component/configuration/use-replace-configuration-path";
import {
  buildFieldSqlType,
  clampScale,
  FIELD_NUMERIC_MAX_SCALE,
  parseFieldSqlType,
  truncateFieldSqlPreview,
  type FieldSqlKind
} from "@/lib/field/field-sql-type";
import type {
  TenantScopeFieldDirectoryResponse,
  TenantScopeFieldRecord,
  TenantScopeRecord
} from "@/lib/auth/types";
import type { LabelLang } from "@/lib/i18n/label-lang";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";

/** Valor inicial de `field.type` ao criar um campo novo (NUMERIC com zero decimais). */
const defaultNewFieldSqlType = buildFieldSqlType({ kind: "number", scale: 0 });

export type FieldConfigurationCopy = {
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
  fieldNameLabel: string;
  fieldNameHint: string;
  sectionInfoTitle: string;
  sectionInfoDescription: string;
  infoFieldNameRegisteredLabel: string;
  infoFriendlyTypeLabel: string;
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
  fieldNameRequired: string;
  discardConfirm: string;
};

type FieldConfigurationClientProps = {
  locale: string;
  labelLang: LabelLang;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialFieldDirectory: TenantScopeFieldDirectoryResponse | null;
  copy: FieldConfigurationCopy;
};

type FieldSelectionKey = number | "new" | null;

function parseSelectedFieldKey(raw: string | null): FieldSelectionKey {
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

function resolveSelectedFieldKey(
  itemList: TenantScopeFieldRecord[],
  preferredKey: FieldSelectionKey,
  canCreate: boolean
): FieldSelectionKey {
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
    normalized.includes("inputs reference") ||
    normalized.includes("results reference") ||
    normalized.includes("inputs referenc") ||
    normalized.includes("results referenc")
  );
}

function selectValueFromParsed(kind: FieldSqlKind): FieldSqlKind | "legacy" {
  return kind === "legacy" ? "legacy" : kind;
}

export function FieldConfigurationClient({
  locale,
  labelLang,
  currentScope,
  hasAnyScope,
  initialFieldDirectory,
  copy
}: FieldConfigurationClientProps) {
  const t = useTranslations("FieldConfigurationPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchFieldKey = parseSelectedFieldKey(searchParams.get("field"));

  const configurationPath = `/${locale}/app/configuration`;
  const fieldPath = `/${locale}/app/configuration/field`;

  const replacePath = useCallback(
    (nextPath: string) => {
      router.replace(nextPath, { scroll: false });
    },
    [router]
  );

  const [directory, setDirectory] = useState<TenantScopeFieldDirectoryResponse | null>(
    initialFieldDirectory
  );

  const initialSelectedFieldKey =
    initialFieldDirectory != null
      ? resolveSelectedFieldKey(
        initialFieldDirectory.item_list,
        initialSearchFieldKey,
        initialFieldDirectory.can_edit
      )
      : null;
  const initialSelectedField =
    typeof initialSelectedFieldKey === "number" && initialFieldDirectory
      ? initialFieldDirectory.item_list.find(
        (item) => item.id === initialSelectedFieldKey
      ) ?? null
      : null;

  const initialSqlType =
    initialSelectedField?.sql_type ??
    (initialSelectedFieldKey === "new" ? defaultNewFieldSqlType : "");
  const initialFieldName = initialSelectedField?.label_name?.trim() ?? "";

  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(
    typeof initialSelectedFieldKey === "number" ? initialSelectedFieldKey : null
  );
  const [isCreateMode, setIsCreateMode] = useState(initialSelectedFieldKey === "new");
  const [sqlType, setSqlType] = useState(initialSqlType);
  const [fieldName, setFieldName] = useState(initialFieldName);
  const [baseline, setBaseline] = useState({
    sqlType: initialSqlType,
    fieldName: initialFieldName
  });
  const [fieldError, setFieldError] = useState<{ form?: string; fieldName?: string }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");
  const [isDirectoryReorderBusy, setIsDirectoryReorderBusy] = useState(false);
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const { newIntentGeneration, bumpNewIntent } = useEditorNewIntentGeneration();
  const selectedFieldKeyRef = useRef<FieldSelectionKey>(initialSelectedFieldKey);
  const didMountFilterRef = useRef(false);

  const parsedSqlType = useMemo(() => parseFieldSqlType(sqlType), [sqlType]);

  const sqlTypeCaption = useCallback(
    (raw: string) => {
      const p = parseFieldSqlType(raw);
      switch (p.kind) {
        case "number":
          return t("fieldType.caption.number", { scale: p.scale ?? 0 });
        case "text":
          return t("fieldType.caption.text");
        case "boolean":
          return t("fieldType.caption.boolean");
        case "timestamp":
          return t("fieldType.caption.timestamp");
        case "legacy":
          return t("fieldType.caption.legacy", {
            value: truncateFieldSqlPreview(raw, 56)
          });
      }
    },
    [t]
  );

  /** Resumo de tipo numérico: inteiro, 1 decimal ou vários (lista + Informações). */
  const infoSqlTypeSummary = useCallback(
    (raw: string) => {
      const p = parseFieldSqlType(raw);
      if (p.kind === "number") {
        const scale = p.scale ?? 0;
        if (scale === 0) {
          return t("section.info.typeValueInteger");
        }
        if (scale === 1) {
          return t("section.info.typeValueNumberOne");
        }
        return t("section.info.typeValueNumberMany", { scale });
      }
      return sqlTypeCaption(raw);
    },
    [sqlTypeCaption, t]
  );

  const resolveDirectoryTitle = useCallback(
    (item: TenantScopeFieldRecord) => {
      const name = item.label_name?.trim();
      if (name && name.length > 0) {
        return name;
      }
      return infoSqlTypeSummary(item.sql_type);
    },
    [infoSqlTypeSummary]
  );

  const selectedField = useMemo(() => {
    if (isCreateMode) {
      return null;
    }

    return (
      selectedFieldId == null
        ? null
        : (directory?.item_list.find((item) => item.id === selectedFieldId) ?? null)
    );
  }, [directory?.item_list, isCreateMode, selectedFieldId]);

  const selectedFieldKey: FieldSelectionKey = isCreateMode ? "new" : selectedField?.id ?? null;

  useReplaceConfigurationPath(
    fieldPath,
    searchParams,
    replacePath,
    "field",
    directory ? (isCreateMode ? "new" : selectedField?.id ?? null) : null
  );

  const editorFlashKey = useMemo(() => {
    if (!directory) {
      return null;
    }

    if (isCreateMode) {
      return `new:${String(newIntentGeneration)}`;
    }

    if (!selectedField) {
      return null;
    }

    return `id:${String(selectedField.id)}:sql:${selectedField.sql_type}:ln:${selectedField.label_name ?? ""}`;
  }, [directory, isCreateMode, newIntentGeneration, selectedField]);

  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    Boolean(directory)
  );

  const syncFromDirectory = useCallback(
    (
      nextDirectory: TenantScopeFieldDirectoryResponse | null,
      preferredKey?: FieldSelectionKey
    ) => {
      if (!nextDirectory) {
        setDirectory(null);
        setIsCreateMode(false);
        setSelectedFieldId(null);
        setSqlType("");
        setFieldName("");
        setBaseline({ sqlType: "", fieldName: "" });
        setFieldError({});
        setRequestErrorMessage(null);
        setIsDeletePending(false);
        selectedFieldKeyRef.current = null;
        return null;
      }

      const nextKey = resolveSelectedFieldKey(
        nextDirectory.item_list,
        preferredKey ?? null,
        nextDirectory.can_edit
      );
      const nextSelectedField =
        typeof nextKey === "number"
          ? nextDirectory.item_list.find((item) => item.id === nextKey) ?? null
          : null;

      const nextSqlType =
        nextSelectedField?.sql_type ?? (nextKey === "new" ? defaultNewFieldSqlType : "");
      const nextFieldName = nextSelectedField?.label_name?.trim() ?? "";

      setDirectory(nextDirectory);
      setIsCreateMode(nextKey === "new");
      setSelectedFieldId(typeof nextKey === "number" ? nextKey : null);
      setSqlType(nextSqlType);
      setFieldName(nextFieldName);
      setBaseline({
        sqlType: nextSqlType,
        fieldName: nextFieldName
      });
      setFieldError({});
      setRequestErrorMessage(null);
      setIsDeletePending(false);

      /* Mantém o ref alinhado ao nextKey para loadFieldDirectory e efeitos que leem antes do próximo render. */
      selectedFieldKeyRef.current =
        nextKey === "new" ? "new" : typeof nextKey === "number" ? nextKey : null;

      return nextKey;
    },
    []
  );

  useEffect(() => {
    syncFromDirectory(initialFieldDirectory, initialSearchFieldKey);
    // Uma sincronização na montagem com snapshot do servidor e query `field`; não repetir quando o RSC repassa a prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialFieldDirectory e initialSearchFieldKey só na primeira montagem
  }, [syncFromDirectory]);

  const loadFieldDirectory = useCallback(async () => {
    if (currentScope?.id == null) {
      return;
    }
    const query = new URLSearchParams({ label_lang: labelLang });
    const normalizedQuery = filterQuery.trim();
    if (normalizedQuery) {
      query.set("q", normalizedQuery);
    }
    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${currentScope.id}/fields?${query.toString()}`
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRequestErrorMessage(
          parseErrorDetail(data, copy.loadError) ?? copy.loadError
        );
        return;
      }
      /* Usa o ref no término do fetch: um preferredKey capturado na chamada ficaria stale
         e podia reaplicar um id depois de um save que já pôs o painel em "new". */
      syncFromDirectory(
        data as TenantScopeFieldDirectoryResponse,
        selectedFieldKeyRef.current
      );
    } catch {
      setRequestErrorMessage(copy.loadError);
    }
  }, [copy.loadError, currentScope, filterQuery, labelLang, syncFromDirectory]);

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    void loadFieldDirectory();
  }, [loadFieldDirectory]);

  const handleFieldDirectoryReorder = useCallback(
    async (nextList: TenantScopeFieldRecord[]) => {
      if (currentScope?.id == null) {
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
          `/api/auth/tenant/current/scopes/${currentScope.id}/fields/reorder?${query.toString()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field_id_list: nextList.map((row) => row.id) })
          }
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, t("directory.reorderError")) ?? t("directory.reorderError")
          );
          setDirectory(snapshot);
          void loadFieldDirectory();
          return;
        }
        setDirectory(data as TenantScopeFieldDirectoryResponse);
        setHistoryRefreshKey((previous) => previous + 1);
      } catch {
        setRequestErrorMessage(t("directory.reorderError"));
        setDirectory(snapshot);
        void loadFieldDirectory();
      } finally {
        setIsDirectoryReorderBusy(false);
      }
    },
    [currentScope?.id, directory, labelLang, loadFieldDirectory, t]
  );

  const isDirty = useMemo(() => {
    return (
      sqlType.trim() !== baseline.sqlType.trim() ||
      fieldName.trim() !== baseline.fieldName.trim() ||
      isDeletePending
    );
  }, [baseline.fieldName, baseline.sqlType, fieldName, isDeletePending, sqlType]);

  const validate = useCallback(() => {
    if (!fieldName.trim()) {
      setFieldError({
        fieldName: copy.fieldNameRequired
      });
      return false;
    }

    const trimmed = sqlType.trim();
    if (!trimmed) {
      setFieldError({ form: t("fieldType.error.empty") });
      return false;
    }

    const parsed = parseFieldSqlType(trimmed);
    if (parsed.kind === "number") {
      const sc = parsed.scale;
      if (sc == null || sc < 0 || sc > FIELD_NUMERIC_MAX_SCALE) {
        setFieldError({ form: t("fieldType.error.scaleRange") });
        return false;
      }
    }

    setFieldError({});
    return true;
  }, [copy.fieldNameRequired, fieldName, sqlType, t]);

  const handleKindChange = useCallback(
    (nextKind: FieldSqlKind | "legacy") => {
      setRequestErrorMessage(null);
      setFieldError({});

      if (nextKind === "legacy") {
        return;
      }

      if (nextKind === "number") {
        setSqlType(buildFieldSqlType({ kind: "number", scale: 0 }));
        return;
      }

      setSqlType(buildFieldSqlType({ kind: nextKind }));
    },
    []
  );

  const handleScaleChange = useCallback((raw: string) => {
    setRequestErrorMessage(null);
    setFieldError({});
    const n = Number.parseInt(raw, 10);
    const scale = Number.isNaN(n) ? 0 : clampScale(n);
    setSqlType(buildFieldSqlType({ kind: "number", scale }));
  }, []);

  const handleStartCreate = useCallback(() => {
    if (!directory?.can_edit || isSaving) {
      return;
    }

    bumpNewIntent();
    if (!isCreateMode) {
      syncFromDirectory(directory, "new");
    }
  }, [bumpNewIntent, directory, isCreateMode, isSaving, syncFromDirectory]);

  const handleSelectField = useCallback(
    (item: TenantScopeFieldRecord) => {
      if (!directory) {
        return;
      }

      if (!isCreateMode && item.id === selectedField?.id) {
        return;
      }

      syncFromDirectory(directory, item.id);
    },
    [directory, isCreateMode, selectedField, syncFromDirectory]
  );

  const handleToggleDelete = useCallback(() => {
    if (isSaving) {
      return;
    }

    setRequestErrorMessage(null);
    setIsDeletePending((previous) => !previous);
  }, [isSaving]);

  const scopeId = currentScope?.id;

  const handleSave = useCallback(async () => {
    setRequestErrorMessage(null);

    if (!directory || scopeId == null) {
      return;
    }

    if (!isDeletePending && !validate()) {
      return;
    }

    setIsSaving(true);
    try {
      if (isCreateMode) {
        const response = await fetch(`/api/auth/tenant/current/scopes/${scopeId}/fields`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sql_type: sqlType.trim(),
            label_lang: labelLang,
            label_name: fieldName.trim()
          })
        });
        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, copy.createError) ?? copy.createError
          );
          return;
        }

        const updatedDirectory = data as TenantScopeFieldDirectoryResponse;
        bumpNewIntent();
        syncFromDirectory(updatedDirectory, "new");
        setHistoryRefreshKey((previous) => previous + 1);
        return;
      }

      if (!selectedField) {
        return;
      }

      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/fields/${selectedField.id}`,
        isDeletePending
          ? {
            method: "DELETE"
          }
          : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sql_type: sqlType.trim(),
              label_lang: labelLang,
              label_name: fieldName.trim()
            })
          }
      );
      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fallback = isDeletePending ? copy.deleteError : copy.saveError;
        const detail = parseErrorDetail(data, fallback) ?? fallback;
        if (isDeletePending && isDeleteBlockedDetail(detail)) {
          setRequestErrorMessage(copy.deleteBlockedDetail);
          return;
        }
        setRequestErrorMessage(detail);
        return;
      }

      const updatedDirectory = data as TenantScopeFieldDirectoryResponse;
      if (isDeletePending) {
        const nextKeyAfterMutation: FieldSelectionKey = updatedDirectory.can_edit
          ? "new"
          : null;
        syncFromDirectory(updatedDirectory, nextKeyAfterMutation);
      } else {
        /* Após editar, voltar ao formulário vazio (new), alinhado ao fluxo de criação. */
        bumpNewIntent();
        syncFromDirectory(
          updatedDirectory,
          updatedDirectory.can_edit ? "new" : selectedField.id
        );
      }
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
    bumpNewIntent,
    copy.createError,
    copy.deleteBlockedDetail,
    copy.deleteError,
    copy.saveError,
    directory,
    fieldName,
    isCreateMode,
    isDeletePending,
    labelLang,
    scopeId,
    selectedField,
    sqlType,
    syncFromDirectory,
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
    requestErrorMessage ?? fieldError.form ?? fieldError.fieldName ?? null;

  const asideEmptyMessage = !currentScope
    ? hasAnyScope
      ? copy.missingCurrentScope
      : copy.emptyScope
    : copy.loadError;

  const selectValue = selectValueFromParsed(parsedSqlType.kind);
  const showLegacyOption = parsedSqlType.kind === "legacy";
  const showScaleField = parsedSqlType.kind === "number";
  const scaleInputValue =
    parsedSqlType.kind === "number" ? String(parsedSqlType.scale ?? 0) : "0";

  /** Lista com alças sempre visíveis quando pode editar; filtro ou save apenas desativam o arrastar. */
  const directorySortableLayout = Boolean(directory?.can_edit);

  const directoryDragDisabled =
    isSaving ||
    isDirectoryReorderBusy ||
    Boolean(filterQuery.trim());

  const renderFieldDirectoryButton = useCallback(
    (item: TenantScopeFieldRecord) => (
      <button
        type="button"
        onClick={() => handleSelectField(item)}
        className="ui-directory-item"
        data-selected={item.id === selectedField?.id ? "true" : undefined}
        data-delete-pending={
          item.id === selectedField?.id && isDeletePending ? "true" : undefined
        }
      >
        <p className="ui-directory-title">{resolveDirectoryTitle(item)}</p>
        {item.label_name?.trim() ? (
          <p className="ui-directory-caption-wrap">
            {infoSqlTypeSummary(item.sql_type)}
          </p>
        ) : null}
      </button>
    ),
    [
      handleSelectField,
      infoSqlTypeSummary,
      isDeletePending,
      resolveDirectoryTitle,
      selectedField?.id
    ]
  );

  const renderFieldDirectorySortableItem = useCallback(
    (item: TenantScopeFieldRecord, dragHandle: ReactNode) => (
      <div
        className="ui-directory-item"
        data-selected={item.id === selectedField?.id ? "true" : undefined}
        data-delete-pending={
          item.id === selectedField?.id && isDeletePending ? "true" : undefined
        }
      >
        <div className="ui-scope-rules-directory-item-layout">
          <button
            type="button"
            className="ui-scope-rules-directory-item-main"
            onClick={() => handleSelectField(item)}
          >
            <p className="ui-directory-title">{resolveDirectoryTitle(item)}</p>
            {item.label_name?.trim() ? (
              <p className="ui-directory-caption-wrap">
                {infoSqlTypeSummary(item.sql_type)}
              </p>
            ) : null}
          </button>
          {dragHandle}
        </div>
      </div>
    ),
    [
      handleSelectField,
      infoSqlTypeSummary,
      isDeletePending,
      resolveDirectoryTitle,
      selectedField?.id
    ]
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
                    id="field-filter-search"
                    label={copy.filterSearchLabel}
                    value={filterQuery}
                    onChange={setFilterQuery}
                  />
                </DirectoryFilterCard>
              </DirectoryFilterPanel>
            ),
            storageSegment: "field"
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
              filterSegment="field"
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
                  dragHandleAriaLabel={t("directory.dragHandleAria")}
                  onReorder={handleFieldDirectoryReorder}
                  renderItem={renderFieldDirectorySortableItem}
                />
              ) : (
                directory.item_list.map((item) => (
                  <Fragment key={item.id}>{renderFieldDirectoryButton(item)}</Fragment>
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
            <section className="ui-card ui-form-section ui-border-accent">
              <EditorPanelFlashOverlay active={isEditorFlashActive} />
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="field-display-name">
                  {copy.fieldNameLabel}
                </label>
                <input
                  id="field-display-name"
                  type="text"
                  className="ui-input"
                  data-editor-primary-field="true"
                  value={fieldName}
                  onChange={(event) => {
                    setFieldName(event.target.value);
                    setFieldError((previous) => ({
                      ...previous,
                      fieldName: undefined
                    }));
                    setRequestErrorMessage(null);
                  }}
                  disabled={isDeletePending || !canEditForm}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldError.fieldName)}
                />
                <p className="ui-field-hint">{copy.fieldNameHint}</p>
                {fieldError.fieldName ? (
                  <p className="ui-field-error">{fieldError.fieldName}</p>
                ) : null}
              </div>
            </section>

            <section className="ui-card ui-form-section ui-border-accent">
              <div className="ui-field">
                <label className="ui-field-label" htmlFor="field-type-kind">
                  {t("fieldType.label")}
                </label>
                <select
                  id="field-type-kind"
                  className="ui-input ui-input-select"
                  value={selectValue}
                  disabled={isDeletePending || !canEditForm}
                  aria-invalid={Boolean(fieldError.form)}
                  onChange={(event) => {
                    const v = event.target.value as FieldSqlKind | "legacy";
                    if (v === "legacy") {
                      return;
                    }
                    handleKindChange(v);
                  }}
                >
                  <option value="number">{t("fieldType.option.number")}</option>
                  <option value="text">{t("fieldType.option.text")}</option>
                  <option value="boolean">{t("fieldType.option.boolean")}</option>
                  <option value="timestamp">{t("fieldType.option.timestamp")}</option>
                  {showLegacyOption ? (
                    <option value="legacy">
                      {t("fieldType.option.legacy")}
                    </option>
                  ) : null}
                </select>
                <p className="ui-field-hint">{t("fieldType.hint")}</p>
                {fieldError.form ? (
                  <p className="ui-field-error">{fieldError.form}</p>
                ) : null}
              </div>

              {showScaleField ? (
                <div className="ui-field">
                  <label className="ui-field-label" htmlFor="field-type-scale">
                    {t("fieldType.scaleLabel")}
                  </label>
                  <input
                    id="field-type-scale"
                    type="number"
                    min={0}
                    max={FIELD_NUMERIC_MAX_SCALE}
                    step={1}
                    className="ui-input"
                    value={scaleInputValue}
                    disabled={isDeletePending || !canEditForm}
                    onChange={(event) => handleScaleChange(event.target.value)}
                  />
                  <p className="ui-field-hint">{t("fieldType.scaleHint")}</p>
                </div>
              ) : null}

              {parsedSqlType.kind === "legacy" && sqlType.trim() ? (
                <div className="ui-field">
                  <p className="ui-field-hint">{t("fieldType.legacyHelp")}</p>
                  <pre className="ui-history-json">{sqlType.trim()}</pre>
                </div>
              ) : null}
            </section>

            {!isCreateMode && selectedField ? (
              <ConfigurationInfoSection
                title={copy.sectionInfoTitle}
                description={copy.sectionInfoDescription}
              >
                <ul className="ui-info-topic-list">
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">
                        {copy.infoFieldNameRegisteredLabel}
                      </span>
                      {": "}
                      <span className="ui-info-topic-value">
                        {selectedField.label_name?.trim() || "-"}
                      </span>
                    </p>
                  </li>
                  <li>
                    <p className="ui-info-topic-lead">
                      <span className="ui-info-topic-label">
                        {copy.infoFriendlyTypeLabel}
                      </span>
                      {": "}
                      <span className="ui-info-topic-value">
                        {infoSqlTypeSummary(selectedField.sql_type)}
                      </span>
                    </p>
                  </li>
                </ul>
              </ConfigurationInfoSection>
            ) : null}

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
            ) : null}
          </>
        ) : (
          <div className="ui-panel ui-empty-panel">{asideEmptyMessage}</div>
        )
      }
      history={{
        headingId: "field-history-heading",
        title: copy.historyTitle,
        description: copy.historyDescription,
        tableName: "field",
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
          hasEditableContext: Boolean(directory && selectedFieldKey),
          canSubmit,
          isSaving,
          isDirty
        }),
        saveLabel: copy.save,
        savingLabel: copy.saving,
        isSaving,
        dangerAction:
          directory && !isCreateMode && selectedField ? (
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
