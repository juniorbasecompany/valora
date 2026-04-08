"use client";

/**
 * Cliente partilhado para painéis de diretório hierárquico por escopo (locais, unidades produtivas).
 * O markup e o fluxo espelham um único padrão para evitar divergência de layout entre recursos.
 */
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  HierarchyDragHandle,
  HierarchyDragHandleOverlayPreview,
  HierarchyDropGap,
  HierarchyIntoWrap
} from "@/component/configuration/scope-hierarchy-dnd-ui";
import {
  buildMoveRequestBody,
  computeHierarchyMove,
  parseDragId,
  parseDropId
} from "@/component/configuration/scope-hierarchy-tree-dnd";

import {
  directoryEditorCanSubmitForDirectoryEditor,
  directoryEditorSaveDisabled
} from "@/component/configuration/configuration-directory-editor-policy";
import { ConfigurationDirectoryEditorShell } from "@/component/configuration/configuration-directory-editor-shell";
import { ConfigurationNameField } from "@/component/configuration/configuration-name-field";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import { ConfigurationDirectoryListToolbarRow } from "@/component/configuration/configuration-directory-list-toolbar-row";
import type { DirectoryFilterStorageSegment } from "@/component/configuration/directory-filter-visibility";
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
  AuditLogTableName,
  TenantKindRecord,
  TenantItemRecord,
  TenantScopeHierarchyItemBase,
  TenantScopeRecord
} from "@/lib/auth/types";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";
import { KindSelectOrCreateField } from "@/component/configuration/kind-select-or-create-field";

export type ScopeHierarchySavePayload = {
  name: string;
  parentId: number | null;
  kind_id?: number | null;
};

export type ScopeHierarchyDirectoryShape<TItem extends TenantScopeHierarchyItemBase> = {
  scope_id: number;
  scope_name: string;
  can_edit: boolean;
  can_create: boolean;
  item_list: TItem[];
};

export type ScopeHierarchyConfigurationClientProps<
  TItem extends TenantScopeHierarchyItemBase,
  TDirectory extends ScopeHierarchyDirectoryShape<TItem>
> = {
  locale: string;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialDirectory: TDirectory | null;
  copy: Record<string, string>;
  configurationSegment: string;
  queryParamKey: string;
  apiSegment: string;
  historyTableName: AuditLogTableName;
  formIds: {
    nameInput: string;
    historyHeading: string;
  };
  getParentId: (item: TItem) => number | null;
  buildSavePayload: (input: ScopeHierarchySavePayload) => Record<string, unknown>;
  /** Itens: seleção de tipo (`kind`) em vez de nome/descrição livres. */
  editorVariant?: "name_display" | "kind";
};

type SelectedHierarchyKey = number | "new" | null;

type HierarchyNestNodeProps<TItem extends TenantScopeHierarchyItemBase> = {
  item: TItem;
  childrenByParent: Map<number | null, TItem[]>;
  selectedItemId: number | null;
  createParentId: number | null;
  isCreateMode: boolean;
  isBusy: boolean;
  maxDepth: number;
  createChildAriaLabel: string;
  resolveLabel: (item: TItem) => string;
  onSelect: (item: TItem) => void;
  onCreate: (parentId: number | null) => void;
  dndEnabled: boolean;
  dragHandleAriaLabel: string;
  activeDragId: number | null;
};

type HierarchySiblingListProps<TItem extends TenantScopeHierarchyItemBase> = {
  parentId: number | null;
  siblingList: TItem[];
  childrenByParent: Map<number | null, TItem[]>;
  selectedItemId: number | null;
  createParentId: number | null;
  isCreateMode: boolean;
  isBusy: boolean;
  maxDepth: number;
  createChildAriaLabel: string;
  resolveLabel: (item: TItem) => string;
  onSelect: (item: TItem) => void;
  onCreate: (parentId: number | null) => void;
  dndEnabled: boolean;
  dragHandleAriaLabel: string;
  activeDragId: number | null;
};

function HierarchySiblingList<TItem extends TenantScopeHierarchyItemBase>({
  parentId,
  siblingList,
  childrenByParent,
  selectedItemId,
  createParentId,
  isCreateMode,
  isBusy,
  maxDepth,
  createChildAriaLabel,
  resolveLabel,
  onSelect,
  onCreate,
  dndEnabled,
  dragHandleAriaLabel,
  activeDragId
}: HierarchySiblingListProps<TItem>) {
  if (!dndEnabled) {
    return (
      <>
        {siblingList.map((row) => (
          <HierarchyNestNode
            key={row.id}
            item={row}
            childrenByParent={childrenByParent}
            selectedItemId={selectedItemId}
            createParentId={createParentId}
            isCreateMode={isCreateMode}
            isBusy={isBusy}
            maxDepth={maxDepth}
            createChildAriaLabel={createChildAriaLabel}
            resolveLabel={resolveLabel}
            onSelect={onSelect}
            onCreate={onCreate}
            dndEnabled={false}
            dragHandleAriaLabel={dragHandleAriaLabel}
            activeDragId={activeDragId}
          />
        ))}
      </>
    );
  }

  return (
    <div className="ui-location-nest-sibling-stack">
      <HierarchyDropGap
        parentId={parentId}
        gapIndex={0}
        disabled={isBusy}
      />
      {siblingList.map((row, idx) => (
        <Fragment key={row.id}>
          <HierarchyNestNode
            item={row}
            childrenByParent={childrenByParent}
            selectedItemId={selectedItemId}
            createParentId={createParentId}
            isCreateMode={isCreateMode}
            isBusy={isBusy}
            maxDepth={maxDepth}
            createChildAriaLabel={createChildAriaLabel}
            resolveLabel={resolveLabel}
            onSelect={onSelect}
            onCreate={onCreate}
            dndEnabled
            dragHandleAriaLabel={dragHandleAriaLabel}
            activeDragId={activeDragId}
          />
          <HierarchyDropGap
            parentId={parentId}
            gapIndex={idx + 1}
            disabled={isBusy}
          />
        </Fragment>
      ))}
    </div>
  );
}

function parseHierarchySelectionKey(raw: string | null): SelectedHierarchyKey {
  if (raw === "new") {
    return "new";
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveHierarchyLabel(item: TenantScopeHierarchyItemBase) {
  return item.name.trim() || `#${item.id}`;
}

/**
 * Painel location/item: o nível 0 é `ui-directory-item` (branco); os tons roxos começam no
 * primeiro `ui-location-nest-box` (depth ≥ 1). A normalização `depth - 1` faz a variação
 * ir do primeiro nest ao último, não do primeiro item da lista ao último (ver filtro).
 */
function resolveHierarchyToneRatio(depth: number, maxDepth: number) {
  const normalizedDepth = Math.max(depth - 1, 0);
  const normalizedMaxDepth = Math.max(maxDepth - 1, 0);

  if (normalizedMaxDepth <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(normalizedDepth / normalizedMaxDepth, 1));
}

function buildHierarchyToneStyle(depth: number, maxDepth: number): CSSProperties {
  const toneRatio = resolveHierarchyToneRatio(depth, maxDepth);
  return {
    "--ui-location-depth": String(depth),
    "--ui-location-tone-light-share": `${((1 - toneRatio) * 100).toFixed(3)}%`,
    "--ui-location-tone-dark-share": `${(toneRatio * 100).toFixed(3)}%`
  } as CSSProperties;
}

function HierarchyNestNode<TItem extends TenantScopeHierarchyItemBase>({
  item,
  childrenByParent,
  selectedItemId,
  createParentId,
  isCreateMode,
  isBusy,
  maxDepth,
  createChildAriaLabel,
  resolveLabel,
  onSelect,
  onCreate,
  dndEnabled,
  dragHandleAriaLabel,
  activeDragId
}: HierarchyNestNodeProps<TItem>) {
  const childList = childrenByParent.get(item.id) ?? [];
  const label = resolveLabel(item);
  const description = "";
  const isSelected = !isCreateMode && item.id === selectedItemId;
  const isCreateContext = isCreateMode && createParentId === item.id;
  /** Alça visível quando o item pode mover; desativa com filtro, save ou movimento em curso. */
  const showDndChrome = item.can_move;
  const dragInteractionDisabled = isBusy || !dndEnabled;

  const containerClassName =
    item.depth === 0 ? "ui-directory-item" : "ui-location-nest-box";

  const bodyButton = (
    <button
      type="button"
      className="ui-location-nest-body"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item);
      }}
      disabled={isBusy}
    >
      <div className="ui-location-nest-copy">
        <p className="ui-location-nest-label">{label}</p>
        {description && description !== label ? (
          <p className="ui-location-nest-description">{description}</p>
        ) : null}
      </div>
    </button>
  );

  return (
    <section
      className={containerClassName}
      data-selected={isSelected ? "true" : undefined}
      data-create-context={isCreateContext ? "true" : undefined}
      style={buildHierarchyToneStyle(item.depth, maxDepth)}
      onClick={(event) => {
        event.stopPropagation();
        if (isBusy) {
          return;
        }
        onSelect(item);
      }}
    >
      <div
        className={
          showDndChrome
            ? "ui-location-nest-head ui-location-nest-head--dnd"
            : "ui-location-nest-head"
        }
        data-has-create={showDndChrome && item.can_create_child ? "true" : undefined}
      >
        {showDndChrome ? (
          <HierarchyIntoWrap itemId={item.id} disabled={dragInteractionDisabled}>
            {bodyButton}
          </HierarchyIntoWrap>
        ) : (
          bodyButton
        )}

        {showDndChrome ? (
          <HierarchyDragHandle
            itemId={item.id}
            disabled={dragInteractionDisabled}
            ariaLabel={dragHandleAriaLabel}
          />
        ) : null}

        {item.can_create_child ? (
          <button
            type="button"
            className="ui-location-nest-create"
            aria-label={createChildAriaLabel}
            title={createChildAriaLabel}
            onClick={(event) => {
              event.stopPropagation();
              onCreate(item.id);
            }}
            disabled={isBusy}
          >
            <span aria-hidden>+</span>
          </button>
        ) : null}
      </div>

      {childList.length > 0 ? (
        <div className="ui-location-nest-children">
          <HierarchySiblingList
            parentId={item.id}
            siblingList={childList}
            childrenByParent={childrenByParent}
            selectedItemId={selectedItemId}
            createParentId={createParentId}
            isCreateMode={isCreateMode}
            isBusy={isBusy}
            maxDepth={maxDepth}
            createChildAriaLabel={createChildAriaLabel}
            resolveLabel={resolveLabel}
            onSelect={onSelect}
            onCreate={onCreate}
            dndEnabled={dndEnabled}
            dragHandleAriaLabel={dragHandleAriaLabel}
            activeDragId={activeDragId}
          />
        </div>
      ) : null}
    </section>
  );
}

export function ScopeHierarchyConfigurationClient<
  TItem extends TenantScopeHierarchyItemBase,
  TDirectory extends ScopeHierarchyDirectoryShape<TItem>
>({
  locale,
  currentScope,
  hasAnyScope,
  initialDirectory,
  copy,
  configurationSegment,
  queryParamKey,
  apiSegment,
  historyTableName,
  formIds,
  getParentId,
  buildSavePayload,
  editorVariant = "name_display"
}: ScopeHierarchyConfigurationClientProps<TItem, TDirectory>) {
  const isKindEditor = editorVariant === "kind";
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialScopeId = currentScope?.id ?? initialDirectory?.scope_id ?? null;
  const initialItemKey =
    initialDirectory && initialDirectory.scope_id === initialScopeId
      ? parseHierarchySelectionKey(searchParams.get(queryParamKey))
      : null;
  const initialItemList = initialDirectory?.item_list ?? [];
  const initialSelectedItem =
    initialItemKey === "new"
      ? null
      : typeof initialItemKey === "number"
        ? initialItemList.find((item) => item.id === initialItemKey) ?? null
        : null;
  const shouldStartCreateMode = initialItemKey === "new" || initialItemKey == null;

  const initialKindId =
    isKindEditor && initialSelectedItem
      ? (initialSelectedItem as unknown as TenantItemRecord).kind_id
      : null;
  const initialKindList: TenantKindRecord[] =
    initialDirectory != null &&
    "kind_list" in initialDirectory &&
    Array.isArray(
      (initialDirectory as { kind_list?: TenantKindRecord[] }).kind_list
    )
      ? ((initialDirectory as { kind_list: TenantKindRecord[] }).kind_list ??
        [])
      : [];

  const basePath = `/${locale}/app/configuration/${configurationSegment}`;
  const configurationPath = `/${locale}/app/configuration`;

  const replacePath = useCallback(
    (nextPath: string) => {
      router.replace(nextPath, { scroll: false });
    },
    [router]
  );

  const [directory, setDirectory] = useState<TDirectory | null>(
    initialDirectory as TDirectory | null
  );
  const scopeId = directory?.scope_id ?? initialScopeId;
  const [selectedItemId, setSelectedItemId] = useState<number | null>(
    shouldStartCreateMode ? null : (initialSelectedItem?.id ?? null)
  );
  const [isCreateMode, setIsCreateMode] = useState(shouldStartCreateMode);
  const [name, setName] = useState(
    shouldStartCreateMode ? "" : (initialSelectedItem?.name ?? "")
  );
  const [parentId, setParentId] = useState<number | null>(
    shouldStartCreateMode ? null : (initialSelectedItem ? getParentId(initialSelectedItem) : null)
  );
  const [kindList, setKindList] =
    useState<TenantKindRecord[]>(initialKindList);
  const [kindId, setKindId] = useState<number | null>(
    shouldStartCreateMode ? null : initialKindId
  );
  const [baseline, setBaseline] = useState({
    name: shouldStartCreateMode ? "" : (initialSelectedItem?.name ?? ""),
    parentId: shouldStartCreateMode
      ? null
      : (initialSelectedItem ? getParentId(initialSelectedItem) : null),
    kindId: shouldStartCreateMode ? null : initialKindId
  });
  const [fieldError, setFieldError] = useState<{
    name?: string;
    kindId?: string;
  }>({});
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const didMountFilterRef = useRef(false);
  const editorPanelElementRef = useRef<HTMLDivElement | null>(null);
  const { newIntentGeneration, bumpNewIntent } = useEditorNewIntentGeneration();
  const itemList = useMemo(() => directory?.item_list ?? [], [directory]);
  const childrenByParent = useMemo(() => {
    const next = new Map<number | null, TItem[]>();
    for (const item of itemList) {
      const pId = getParentId(item) ?? null;
      const current = next.get(pId) ?? [];
      current.push(item);
      next.set(pId, current);
    }
    return next;
  }, [getParentId, itemList]);
  const rootItemList = useMemo(() => childrenByParent.get(null) ?? [], [childrenByParent]);
  const maxDepth = useMemo(
    () => itemList.reduce((max, item) => Math.max(max, item.depth), 0),
    [itemList]
  );

  const filterActive = Boolean(filterQuery.trim());
  const dndEnabled =
    Boolean(directory?.can_edit) && !filterActive && !isSaving && !isMoving;

  const parentField =
    apiSegment === "locations" ? "parent_location_id" : "parent_item_id";

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  );

  const selectedItem = useMemo(() => {
    if (isCreateMode) {
      return null;
    }
    return itemList.find((item) => item.id === selectedItemId) ?? null;
  }, [isCreateMode, itemList, selectedItemId]);

  const selectedKey: SelectedHierarchyKey = isCreateMode ? "new" : (selectedItem?.id ?? null);

  useReplaceConfigurationPath(basePath, searchParams, replacePath, queryParamKey, selectedKey);

  const editorFlashKey = useMemo(() => {
    if (!directory) {
      return null;
    }

    if (isCreateMode) {
      return `new:${String(parentId ?? "root")}:${String(newIntentGeneration)}`;
    }

    if (!selectedItem) {
      return null;
    }

    if (isKindEditor) {
      return `id:${String(selectedItem.id)}:kind:${String((selectedItem as unknown as TenantItemRecord).kind_id)}:parent:${String(getParentId(selectedItem) ?? "root")}`;
    }

    return `id:${String(selectedItem.id)}:name:${selectedItem.name}:parent:${String(getParentId(selectedItem) ?? "root")}`;
  }, [
    directory,
    getParentId,
    isCreateMode,
    isKindEditor,
    newIntentGeneration,
    parentId,
    selectedItem
  ]);

  const isEditorFlashActive = useEditorPanelFlash(editorPanelElementRef, editorFlashKey);
  useFocusFirstEditorFieldAfterFlash(
    editorPanelElementRef,
    isEditorFlashActive,
    Boolean(directory)
  );

  const syncEditor = useCallback(
    (item: TItem | null, createMode: boolean, draftParentId: number | null) => {
      setIsCreateMode(createMode);
      setSelectedItemId(item?.id ?? null);
      setName(createMode ? "" : (item?.name ?? ""));
      setParentId(createMode ? draftParentId : (item ? getParentId(item) : null));
      const nextKindId =
        isKindEditor && item
          ? (item as unknown as TenantItemRecord).kind_id
          : null;
      setKindId(createMode ? null : nextKindId);
      setBaseline({
        name: createMode ? "" : (item?.name ?? ""),
        parentId: createMode ? draftParentId : (item ? getParentId(item) : null),
        kindId: createMode ? null : nextKindId
      });
      setFieldError({});
      setRequestErrorMessage(null);
      setIsDeletePending(false);
    },
    [getParentId, isKindEditor]
  );

  const loadHierarchyDirectory = useCallback(async () => {
    if (scopeId == null) {
      return;
    }
    const query = new URLSearchParams();
    const normalizedQuery = filterQuery.trim();
    if (normalizedQuery) {
      query.set("q", normalizedQuery);
    }

    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/${apiSegment}?${query.toString()}`
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRequestErrorMessage(parseErrorDetail(data, copy.loadError) ?? copy.loadError);
        return;
      }

      const nextDirectory = data as TDirectory;
      setDirectory(nextDirectory);
      if (
        isKindEditor &&
        nextDirectory != null &&
        "kind_list" in nextDirectory &&
        Array.isArray(
          (nextDirectory as { kind_list?: TenantKindRecord[] }).kind_list
        )
      ) {
        setKindList(
          (nextDirectory as { kind_list: TenantKindRecord[] }).kind_list ?? []
        );
      }

      if (isCreateMode) {
        syncEditor(null, true, null);
        return;
      }

      const nextSelectedItem = nextDirectory.item_list.find(
        (item) => item.id === selectedItemId
      );
      if (nextSelectedItem) {
        syncEditor(nextSelectedItem, false, null);
      } else {
        syncEditor(null, true, null);
      }
    } catch {
      setRequestErrorMessage(copy.loadError);
    }
  }, [
    apiSegment,
    copy.loadError,
    filterQuery,
    isCreateMode,
    isKindEditor,
    scopeId,
    selectedItemId,
    syncEditor
  ]);

  useEffect(() => {
    if (!didMountFilterRef.current) {
      didMountFilterRef.current = true;
      return;
    }
    void loadHierarchyDirectory();
  }, [loadHierarchyDirectory]);

  const isDirty = isKindEditor
    ? (kindId ?? null) !== (baseline.kindId ?? null) ||
      parentId !== baseline.parentId ||
      isDeletePending
    : name.trim() !== baseline.name.trim() ||
      parentId !== baseline.parentId ||
      isDeletePending;

  const canEditForm = isCreateMode
    ? (directory?.can_create ?? false)
    : (selectedItem?.can_edit ?? false);
  const canSubmit = directoryEditorCanSubmitForDirectoryEditor({
    isCreateMode,
    isDeletePending,
    canCreate: directory?.can_create ?? false,
    canEdit: selectedItem?.can_edit ?? false
  });
  const footerErrorMessage =
    requestErrorMessage ??
    fieldError.name ??
    fieldError.kindId ??
    null;

  const validate = useCallback(() => {
    if (isKindEditor) {
      const nextError: { kindId?: string } = {};
      if (kindId == null) {
        nextError.kindId =
          copy.validationErrorKind ?? copy.validationError;
      }
      setFieldError(nextError);
      return Object.keys(nextError).length === 0;
    }
    const nextError: { name?: string } = {};
    if (!name.trim()) {
      nextError.name = copy.validationError;
    }
    setFieldError(nextError);
    return Object.keys(nextError).length === 0;
  }, [
    copy.validationError,
    copy.validationErrorKind,
    isKindEditor,
    kindId,
    name
  ]);

  const handleStartCreate = useCallback(
    (draftParentId: number | null) => {
      const canCreateTarget =
        draftParentId == null
          ? (directory?.can_create ?? false)
          : (itemList.find((item) => item.id === draftParentId)?.can_create_child ??
            false);

      if (!canCreateTarget) {
        return;
      }
      bumpNewIntent();
      syncEditor(null, true, draftParentId);
    },
    [bumpNewIntent, directory?.can_create, itemList, syncEditor]
  );

  const handleSelectItem = useCallback(
    (item: TItem) => {
      if (!isCreateMode && item.id === selectedItem?.id) {
        return;
      }
      syncEditor(item, false, null);
    },
    [isCreateMode, selectedItem?.id, syncEditor]
  );

  const handleSave = useCallback(async () => {
    if (!directory || scopeId == null) {
      return;
    }
    setRequestErrorMessage(null);
    if (!isDeletePending && !validate()) {
      return;
    }

    setIsSaving(true);
    const endpoint = isCreateMode
      ? `/api/auth/tenant/current/scopes/${scopeId}/${apiSegment}`
      : `/api/auth/tenant/current/scopes/${scopeId}/${apiSegment}/${selectedItem?.id}`;
    const response = await fetch(
      endpoint,
      isDeletePending
        ? { method: "DELETE" }
        : {
          method: isCreateMode ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildSavePayload({
              name: name.trim(),
              parentId,
              kind_id: isKindEditor ? kindId : undefined
            })
          )
        }
    );
    const data: unknown = await response.json().catch(() => ({}));
    setIsSaving(false);

    if (!response.ok) {
      setRequestErrorMessage(parseErrorDetail(data));
      return;
    }

    const nextDirectory = data as TDirectory;
    setDirectory(nextDirectory);
    if (
      isKindEditor &&
      nextDirectory != null &&
      "kind_list" in nextDirectory &&
      Array.isArray(
        (nextDirectory as { kind_list?: TenantKindRecord[] }).kind_list
      )
    ) {
      setKindList(
        (nextDirectory as { kind_list: TenantKindRecord[] }).kind_list ?? []
      );
    }
    syncEditor(null, true, null);
    setHistoryRefreshKey((previous) => previous + 1);
  }, [
    apiSegment,
    buildSavePayload,
    directory,
    isCreateMode,
    isDeletePending,
    isKindEditor,
    kindId,
    name,
    parentId,
    scopeId,
    selectedItem?.id,
    syncEditor,
    validate
  ]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setRequestErrorMessage(null);
    const id = parseDragId(String(event.active.id));
    setActiveDragId(id);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      if (!dndEnabled) {
        return;
      }
      const dragId = parseDragId(String(event.active.id));
      const overRaw = event.over?.id;
      const overId = overRaw != null ? String(overRaw) : null;
      if (dragId == null || overId == null) {
        return;
      }
      const drop = parseDropId(overId);
      if (drop == null) {
        return;
      }
      const payload = computeHierarchyMove(dragId, drop, childrenByParent);
      if (payload == null || scopeId == null) {
        return;
      }

      setIsMoving(true);
      setRequestErrorMessage(null);
      try {
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/${apiSegment}/${dragId}/move`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildMoveRequestBody(
                payload.parentId,
                payload.targetIndex,
                parentField
              )
            )
          }
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setRequestErrorMessage(
            parseErrorDetail(data, copy.moveError) ?? copy.moveError
          );
          return;
        }
        const nextDirectory = data as TDirectory;
        setDirectory(nextDirectory);
        if (!isCreateMode) {
          const nextItem = nextDirectory.item_list.find(
            (row) => row.id === selectedItemId
          );
          if (nextItem) {
            syncEditor(nextItem, false, null);
          }
        }
        setHistoryRefreshKey((previous) => previous + 1);
      } catch {
        setRequestErrorMessage(copy.moveError);
      } finally {
        setIsMoving(false);
      }
    },
    [
      apiSegment,
      childrenByParent,
      copy.moveError,
      dndEnabled,
      isCreateMode,
      parentField,
      scopeId,
      selectedItemId,
      syncEditor
    ]
  );

  const resolveLabel = useCallback((item: TItem) => resolveHierarchyLabel(item), []);
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
                    id={`${apiSegment}-filter-search`}
                    label={copy.filterSearchLabel}
                    value={filterQuery}
                    onChange={setFilterQuery}
                  />
                </DirectoryFilterCard>
              </DirectoryFilterPanel>
            ),
            storageSegment: configurationSegment as DirectoryFilterStorageSegment
          }
          : undefined
      }
      directoryAsideEditorGrowRatio="4-3"
      editorPanelRef={editorPanelElementRef}
      isDeletePending={isDeletePending}
      directoryAside={
        <>
          {!directory ? (
            <div className="ui-panel ui-empty-panel">
              {hasAnyScope ? copy.missingCurrentScope : copy.emptyScope}
            </div>
          ) : null}

          {directory && !directory.can_edit ? (
            <div className="ui-notice-attention ui-notice-block">
              {copy.readOnlyNotice}
            </div>
          ) : null}

          {directory ? (
            <DndContext
              id="scope-hierarchy-configuration-tree"
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={(event) => void handleDragEnd(event)}
              onDragCancel={handleDragCancel}
            >
              <div className="ui-directory-list ui-location-nest-list">
                <ConfigurationDirectoryListToolbarRow
                  showFilterToggle
                  filterSegment={configurationSegment as DirectoryFilterStorageSegment}
                  filterToggleAriaLabel={copy.filterToggleAriaLabel}
                  filterToggleLabel={copy.filterToggleLabel}
                  end={
                    directory.can_create ? (
                      <ConfigurationDirectoryCreateButton
                        label={copy.directoryCreateLabel}
                        active={isCreateMode && parentId == null}
                        disabled={isSaving || isMoving}
                        onClick={() => handleStartCreate(null)}
                        wrapInToolbar={false}
                      />
                    ) : null
                  }
                />

                <HierarchySiblingList
                  parentId={null}
                  siblingList={rootItemList}
                  childrenByParent={childrenByParent}
                  selectedItemId={selectedItem?.id ?? null}
                  createParentId={isCreateMode ? parentId : null}
                  isCreateMode={isCreateMode}
                  isBusy={isSaving || isMoving}
                  maxDepth={maxDepth}
                  createChildAriaLabel={copy.newChild}
                  resolveLabel={resolveLabel}
                  onSelect={handleSelectItem}
                  onCreate={(draftParentId) => handleStartCreate(draftParentId)}
                  dndEnabled={dndEnabled}
                  dragHandleAriaLabel={copy.dragHandleAria}
                  activeDragId={activeDragId}
                />
              </div>
              <DragOverlay dropAnimation={null}>
                {activeDragId != null ? <HierarchyDragHandleOverlayPreview /> : null}
              </DragOverlay>
            </DndContext>
          ) : null}
        </>
      }
      editorForm={
        <>
          {isKindEditor && scopeId != null ? (
            <KindSelectOrCreateField
              selectId={formIds.nameInput}
              scopeId={scopeId}
              editorSyncKey={editorFlashKey ?? ""}
              kindList={kindList}
              kindId={kindId}
              onKindIdChange={setKindId}
              onKindListChange={setKindList}
              disabled={isDeletePending || !canEditForm}
              flashActive={isEditorFlashActive}
              fieldError={fieldError.kindId}
              onAfterFieldEdit={() => setRequestErrorMessage(null)}
              copy={{
                selectLabel: copy.kindSelectLabel,
                selectHint: copy.kindSelectHint,
                selectPlaceholder: copy.kindSelectPlaceholder,
                openListAriaLabel: copy.kindOpenListAriaLabel,
                addKindAriaLabel: copy.kindAddAriaLabel,
                createError: copy.kindCreateError,
                deleteKindAriaLabel: copy.kindDeleteAriaLabel,
                deleteError: copy.kindDeleteError
              }}
            />
          ) : (
            <ConfigurationNameField
              inputId={formIds.nameInput}
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
          )}

        </>
      }
      history={{
        headingId: formIds.historyHeading,
        title: copy.historyTitle,
        description: copy.historyDescription,
        tableName: historyTableName,
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
          hasEditableContext: Boolean(directory),
          canSubmit,
          isSaving,
          isDirty
        }),
        saveLabel: copy.save,
        savingLabel: copy.saving,
        isSaving,
        dangerAction:
          !isCreateMode && selectedItem ? (
            <TrashIconButton
              marked={isDeletePending}
              ariaLabel={isDeletePending ? copy.undoDelete : copy.delete}
              disabled={isSaving}
              onClick={() => setIsDeletePending((previous) => !previous)}
            />
          ) : null
      }}
    />
  );
}
