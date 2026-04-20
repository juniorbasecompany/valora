"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TenantKindRecord } from "@/lib/auth/types";
import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";
import { parseErrorDetail } from "@/lib/api/parse-error-detail";
import { normalizeTextForSearch } from "@/lib/text/normalize-text-for-search";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { ChevronDownIcon, PlusIcon } from "@/component/ui/ui-icons";

export type KindSelectOrCreateCopy = {
  selectLabel: string;
  selectHint: string;
  openListAriaLabel: string;
  addKindAriaLabel: string;
  createError: string;
  deleteKindAriaLabel: string;
  deleteError: string;
};

type Props = {
  selectId: string;
  scopeId: number;
  /** Dispara sincronização do texto com `kindId` ao mudar o contexto do editor (ex.: outro item na árvore). */
  editorSyncKey: string;
  kindList: TenantKindRecord[];
  kindId: number | null;
  onKindIdChange: (value: number | null) => void;
  onKindListChange: (value: TenantKindRecord[]) => void;
  disabled: boolean;
  flashActive: boolean;
  fieldError?: string | null;
  onAfterFieldEdit: () => void;
  copy: KindSelectOrCreateCopy;
};

function resolveKindLabel(row: TenantKindRecord) {
  return row.name.trim() || `#${row.id}`;
}

function referenceCountOf(row: TenantKindRecord) {
  return row.reference_count ?? 0;
}

/**
 * Fluxo de item na hierarquia: o nome exibido vem do `kind` (tipo), não de texto livre na entidade `item`.
 * Mantém o mesmo cartão de formulário que os outros painéis (`ui-card` + flash + `ui-editor-content`).
 */
export function KindSelectOrCreateField({
  selectId,
  scopeId,
  editorSyncKey,
  kindList,
  kindId,
  onKindIdChange,
  onKindListChange,
  disabled,
  flashActive,
  fieldError,
  onAfterFieldEdit,
  copy
}: Props) {
  const [inputValue, setInputValue] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingKindId, setDeletingKindId] = useState<number | null>(null);
  /** Abrir pelo chevron/espaço: mostrar todos os tipos (o texto do input filtraria só o selecionado). */
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = `${selectId}-kind-listbox`;
  const prevEditorSyncKeyRef = useRef(editorSyncKey);

  useEffect(() => {
    const keyChanged = prevEditorSyncKeyRef.current !== editorSyncKey;
    prevEditorSyncKeyRef.current = editorSyncKey;

    if (keyChanged) {
      setShowAllSuggestions(false);
      if (kindId == null) {
        setInputValue("");
      } else {
        const row = kindList.find((k) => k.id === kindId);
        setInputValue(row ? resolveKindLabel(row) : "");
      }
      return;
    }

    if (kindId != null) {
      const row = kindList.find((k) => k.id === kindId);
      if (row) {
        setInputValue(resolveKindLabel(row));
      }
    }
  }, [editorSyncKey, kindId, kindList]);

  const filteredSuggestionList = useMemo(() => {
    if (showAllSuggestions) {
      return kindList;
    }
    const q = normalizeTextForSearch(inputValue);
    if (!q) {
      return kindList;
    }
    return kindList.filter((row) => {
      const name = normalizeTextForSearch(row.name);
      return name.includes(q);
    });
  }, [inputValue, kindList, showAllSuggestions]);

  const matchesExistingKind = useMemo(() => {
    const q = normalizeTextForSearch(inputValue);
    if (!q) {
      return true;
    }
    return kindList.some((row) => {
      const name = normalizeTextForSearch(row.name);
      return name === q;
    });
  }, [inputValue, kindList]);

  const showCreateRow =
    Boolean(inputValue.trim()) && !matchesExistingKind && !disabled && !isCreating;

  const totalOptionCount =
    filteredSuggestionList.length + (showCreateRow ? 1 : 0);

  const createRowIndex = showCreateRow ? filteredSuggestionList.length : -1;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const node = event.target as Node;
      if (!rootRef.current?.contains(node)) {
        setListOpen(false);
        setShowAllSuggestions(false);
        setActiveOptionIndex(-1);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const pickKind = useCallback(
    (row: TenantKindRecord) => {
      onKindIdChange(row.id);
      setInputValue(resolveKindLabel(row));
      setListOpen(false);
      setShowAllSuggestions(false);
      setActiveOptionIndex(-1);
      setCreateError(null);
      onAfterFieldEdit();
    },
    [onAfterFieldEdit, onKindIdChange]
  );

  const createKind = useCallback(async () => {
    const name = inputValue.trim();
    if (!name) {
      setCreateError(copy.createError);
      return;
    }
    setCreateError(null);
    setDeleteError(null);
    setIsCreating(true);
    try {
      const response = await fetch(
        `/api/auth/tenant/current/scopes/${scopeId}/kind`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        }
      );
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCreateError(parseErrorDetail(data, copy.createError) ?? copy.createError);
        setIsCreating(false);
        return;
      }
      const nextList = (data as { item_list?: TenantKindRecord[] }).item_list ?? [];
      onKindListChange(nextList);
      const created = nextList.find((row) => row.name === name);
      if (created) {
        onKindIdChange(created.id);
        setInputValue(resolveKindLabel(created));
      }
      setListOpen(false);
      setShowAllSuggestions(false);
      onAfterFieldEdit();
    } catch {
      setCreateError(copy.createError);
    } finally {
      setIsCreating(false);
    }
  }, [
    copy.createError,
    inputValue,
    onAfterFieldEdit,
    onKindIdChange,
    onKindListChange,
    scopeId
  ]);

  const deleteKind = useCallback(
    async (targetId: number) => {
      setDeleteError(null);
      setCreateError(null);
      setDeletingKindId(targetId);
      try {
        const response = await fetch(
          `/api/auth/tenant/current/scopes/${scopeId}/kind/${targetId}`,
          { method: "DELETE" }
        );
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          setDeleteError(parseErrorDetail(data, copy.deleteError) ?? copy.deleteError);
          setDeletingKindId(null);
          return;
        }
        const nextList =
          (data as { item_list?: TenantKindRecord[] }).item_list ?? [];
        onKindListChange(nextList);
        if (kindId === targetId) {
          onKindIdChange(null);
          setInputValue("");
        }
        onAfterFieldEdit();
      } catch {
        setDeleteError(copy.deleteError);
      } finally {
        setDeletingKindId(null);
      }
    },
    [
      copy.deleteError,
      kindId,
      onAfterFieldEdit,
      onKindIdChange,
      onKindListChange,
      scopeId
    ]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setInputValue(next);
      setListOpen(true);
      setShowAllSuggestions(false);
      setActiveOptionIndex(-1);
      setCreateError(null);
      if (kindId != null) {
        const row = kindList.find((k) => k.id === kindId);
        if (
          row &&
          normalizeTextForSearch(next) !== normalizeTextForSearch(resolveKindLabel(row))
        ) {
          onKindIdChange(null);
        }
      }
      onAfterFieldEdit();
    },
    [kindId, kindList, onAfterFieldEdit, onKindIdChange]
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setListOpen(false);
        setShowAllSuggestions(false);
        setActiveOptionIndex(-1);
        return;
      }
      if (!listOpen && event.key === " ") {
        setListOpen(true);
        setShowAllSuggestions(true);
      }
      if (!listOpen) {
        return;
      }
      if (totalOptionCount === 0) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveOptionIndex((previous) => {
          const max = totalOptionCount - 1;
          if (max < 0) {
            return -1;
          }
          const next = previous < 0 ? 0 : Math.min(previous + 1, max);
          return next;
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveOptionIndex((previous) => {
          const max = totalOptionCount - 1;
          if (max < 0) {
            return -1;
          }
          if (previous <= 0) {
            return 0;
          }
          return previous - 1;
        });
        return;
      }
      if (event.key === "Enter") {
        if (showCreateRow) {
          const onlyCreateRow =
            filteredSuggestionList.length === 0 && createRowIndex === 0;
          const onCreateRow =
            activeOptionIndex === createRowIndex ||
            (onlyCreateRow && activeOptionIndex < 0);
          if (onCreateRow) {
            event.preventDefault();
            void createKind();
            return;
          }
        }
        if (
          activeOptionIndex >= 0 &&
          activeOptionIndex < filteredSuggestionList.length
        ) {
          event.preventDefault();
          pickKind(filteredSuggestionList[activeOptionIndex]!);
        }
      }
    },
    [
      activeOptionIndex,
      createKind,
      createRowIndex,
      filteredSuggestionList,
      listOpen,
      pickKind,
      showCreateRow,
      totalOptionCount
    ]
  );

  const showListPanel =
    listOpen && (filteredSuggestionList.length > 0 || showCreateRow);

  const trimmedForCreate = inputValue.trim();

  return (
    <section className="ui-card ui-form-section ui-border-accent ui-kind-combobox-card">
      <EditorPanelFlashOverlay active={flashActive} />

      <div className="ui-editor-content">
        <div className="ui-field">
          <label className="ui-field-label" htmlFor={selectId}>
            {copy.selectLabel}
          </label>

          <div ref={rootRef} className="ui-kind-combobox">
            <div className="ui-kind-combobox-input-wrap">
              <input
                id={selectId}
                type="text"
                role="combobox"
                className="ui-input"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listboxId}
            aria-invalid={fieldError != null && fieldError !== ""}
            autoComplete="off"
            value={inputValue}
            disabled={disabled}
            onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
              />
              <button
                type="button"
                className={[
                  "ui-kind-combobox-dropdown-toggle",
                  listOpen ? "ui-kind-combobox-dropdown-toggle-open" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                tabIndex={-1}
                aria-label={copy.openListAriaLabel}
                aria-expanded={listOpen}
                aria-controls={listboxId}
                disabled={disabled}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  setListOpen((open) => {
                    if (!open) {
                      setShowAllSuggestions(true);
                    }
                    return !open;
                  });
                  setActiveOptionIndex(-1);
                }}
              >
                <ChevronDownIcon className="ui-kind-combobox-chevron" />
              </button>
            </div>

            {showListPanel ? (
              <ul
                id={listboxId}
                role="listbox"
                className="ui-kind-combobox-listbox"
              >
                {filteredSuggestionList.map((row, index) => {
                  const refCount = referenceCountOf(row);
                  const canDelete = refCount === 0;
                  const isActive = index === activeOptionIndex;
                  return (
                    <li key={row.id} role="presentation" className="ui-kind-combobox-item">
                      <div className="ui-kind-combobox-item-inner">
                        <button
                          type="button"
                          role="option"
                          aria-selected={kindId === row.id}
                          className={[
                            "ui-kind-combobox-option",
                            isActive ? "ui-kind-combobox-option-active" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            pickKind(row);
                          }}
                          onMouseEnter={() => setActiveOptionIndex(index)}
                        >
                          {resolveKindLabel(row)}
                        </button>
                        {canDelete ? (
                          <div className="ui-kind-combobox-action-slot">
                            <TrashIconButton
                              className="ui-kind-combobox-trash"
                              ariaLabel={copy.deleteKindAriaLabel}
                              disabled={disabled || deletingKindId === row.id}
                              onClick={() => void deleteKind(row.id)}
                            />
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
                {showCreateRow ? (
                  <li role="presentation" className="ui-kind-combobox-item">
                    <div
                      className={[
                        "ui-kind-combobox-create-row",
                        activeOptionIndex === createRowIndex
                          ? "ui-kind-combobox-create-row-active"
                          : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() =>
                        setActiveOptionIndex(createRowIndex)
                      }
                    >
                      <span
                        className="ui-kind-combobox-create-text"
                        title={trimmedForCreate}
                      >
                        {trimmedForCreate}
                      </span>
                      <div className="ui-kind-combobox-action-slot">
                        <button
                          type="button"
                          className="ui-kind-combobox-add-button"
                          aria-label={copy.addKindAriaLabel}
                          disabled={disabled || isCreating}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => void createKind()}
                        >
                          <PlusIcon className="ui-kind-combobox-add-icon" />
                        </button>
                      </div>
                    </div>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          <p className="ui-field-hint ui-kind-combobox-hint-below">{copy.selectHint}</p>

          {createError ? <p className="ui-field-error">{createError}</p> : null}
          {deleteError ? <p className="ui-field-error">{deleteError}</p> : null}
        </div>
      </div>
    </section>
  );
}
