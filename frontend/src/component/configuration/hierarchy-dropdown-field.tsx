"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

const UI_TEXT_SEPARATOR = "\u00A0\u00A0●\u00A0\u00A0";

export type HierarchyDropdownFieldItemBase = {
  id: number;
  name: string;
  display_name: string;
  depth: number;
  path_labels?: string[];
};

type HierarchyDropdownSharedProps<TItem extends HierarchyDropdownFieldItemBase> = {
  id: string;
  label: string;
  itemList: TItem[];
  getParentId: (item: TItem) => number | null;
  disabled?: boolean;
  primaryField?: boolean;
};

type HierarchyDropdownFieldProps<TItem extends HierarchyDropdownFieldItemBase> =
  HierarchyDropdownSharedProps<TItem> & {
  selectedValueList: number[];
  onChange: (nextSelectedValueList: number[]) => void;
  allLabel: string;
  confirmLabel: string;
};

type HierarchySingleSelectFieldProps<TItem extends HierarchyDropdownFieldItemBase> =
  HierarchyDropdownSharedProps<TItem> & {
  value: number | null;
  onChange: (nextValue: number | null) => void;
  allLabel: string;
  ariaInvalid?: boolean;
};

type HierarchyDropdownNodeProps<TItem extends HierarchyDropdownFieldItemBase> = {
  item: TItem;
  childrenByParent: Map<number | null, TItem[]>;
  minDepth: number;
  maxDepth: number;
  selectedIdSet: Set<number>;
  disabled: boolean;
  mode: "multi" | "single";
  onSelect: (id: number) => void;
};

/**
 * Tom do filtro: varre do nível mais raso ao mais profundo da lista (sem “pular” o primeiro
 * nível aninhado, ao contrário do painel location/item, onde o nível 1 é cartão branco).
 */
function resolveFilterHierarchyToneRatio(depth: number, minDepth: number, maxDepth: number) {
  if (maxDepth <= minDepth) {
    return 0;
  }

  return Math.max(0, Math.min((depth - minDepth) / (maxDepth - minDepth), 1));
}

function buildFilterHierarchyToneStyle(
  depth: number,
  minDepth: number,
  maxDepth: number
): CSSProperties {
  const toneRatio = resolveFilterHierarchyToneRatio(depth, minDepth, maxDepth);
  return {
    "--ui-hierarchy-dropdown-depth": String(depth),
    "--ui-hierarchy-dropdown-tone-light-share": `${((1 - toneRatio) * 100).toFixed(3)}%`,
    "--ui-hierarchy-dropdown-tone-dark-share": `${(toneRatio * 100).toFixed(3)}%`
  } as CSSProperties;
}

function resolveItemLabel(item: HierarchyDropdownFieldItemBase) {
  return item.name.trim() || item.display_name.trim() || `#${item.id}`;
}

function resolveItemPathLabel(item: HierarchyDropdownFieldItemBase) {
  if (item.path_labels && item.path_labels.length > 0) {
    return item.path_labels.join(UI_TEXT_SEPARATOR);
  }
  return resolveItemLabel(item);
}

function useHierarchyDropdownStructure<TItem extends HierarchyDropdownFieldItemBase>(
  itemList: TItem[],
  getParentId: (item: TItem) => number | null
) {
  const childrenByParent = useMemo(() => {
    const next = new Map<number | null, TItem[]>();

    for (const item of itemList) {
      const parentId = getParentId(item) ?? null;
      const current = next.get(parentId) ?? [];
      current.push(item);
      next.set(parentId, current);
    }

    return next;
  }, [getParentId, itemList]);

  const itemById = useMemo(() => new Map(itemList.map((item) => [item.id, item])), [itemList]);
  const rootItemList = useMemo(() => childrenByParent.get(null) ?? [], [childrenByParent]);
  const minDepth = useMemo(() => {
    if (itemList.length === 0) {
      return 0;
    }
    return itemList.reduce((min, item) => Math.min(min, item.depth), Number.POSITIVE_INFINITY);
  }, [itemList]);
  const maxDepth = useMemo(
    () => itemList.reduce((max, item) => Math.max(max, item.depth), 0),
    [itemList]
  );

  return {
    childrenByParent,
    itemById,
    rootItemList,
    minDepth,
    maxDepth
  };
}

function useHierarchyDropdownDismiss(
  isOpen: boolean,
  rootRef: React.RefObject<HTMLDivElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const targetNode = event.target as Node;
      const isInsideRoot = rootRef.current?.contains(targetNode);
      const isInsidePanel = panelRef.current?.contains(targetNode);
      if (!isInsideRoot && !isInsidePanel) {
        onDismiss();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onDismiss, panelRef, rootRef]);
}

function useHierarchyDropdownPortalStyle(
  isOpen: boolean,
  triggerRef: React.RefObject<HTMLDivElement | null>
) {
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePosition() {
      const triggerElement = triggerRef.current;
      if (!triggerElement) {
        return;
      }

      const rect = triggerElement.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
      const spaceAbove = Math.max(0, rect.top - 8);
      const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;

      const nextStyle: CSSProperties = {
        position: "fixed",
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        right: "auto",
        zIndex: "var(--z-menu-panel)"
      };

      if (openUpward) {
        nextStyle.bottom = `${viewportHeight - rect.top + 8}px`;
        nextStyle.top = "auto";
        nextStyle.maxHeight = `${Math.max(160, spaceAbove)}px`;
      } else {
        nextStyle.top = `${rect.bottom + 8}px`;
        nextStyle.bottom = "auto";
        nextStyle.maxHeight = `${Math.max(160, spaceBelow)}px`;
      }

      setPanelStyle(nextStyle);
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, triggerRef]);

  return panelStyle;
}

function HierarchyDropdownNode<TItem extends HierarchyDropdownFieldItemBase>({
  item,
  childrenByParent,
  minDepth,
  maxDepth,
  selectedIdSet,
  disabled,
  mode,
  onSelect
}: HierarchyDropdownNodeProps<TItem>) {
  const childList = childrenByParent.get(item.id) ?? [];
  const label = resolveItemLabel(item);
  const isSelected = selectedIdSet.has(item.id);

  function handleBoxClick(event: React.MouseEvent<HTMLElement>) {
    if (disabled) {
      return;
    }
    const self = event.currentTarget;
    const hit = (event.target as HTMLElement).closest(".ui-hierarchy-dropdown-nest-box");
    if (hit !== self) {
      return;
    }
    onSelect(item.id);
  }

  return (
    <section
      className="ui-hierarchy-dropdown-nest-box"
      data-selected={isSelected ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      style={buildFilterHierarchyToneStyle(item.depth, minDepth, maxDepth)}
      onClick={handleBoxClick}
    >
      <div className="ui-hierarchy-dropdown-head">
        {mode === "multi" ? (
          <label
            className="ui-hierarchy-dropdown-toggle"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              className="ui-hierarchy-dropdown-checkbox"
              checked={isSelected}
              disabled={disabled}
              onChange={() => onSelect(item.id)}
              onClick={(event) => event.stopPropagation()}
            />
            <div className="ui-hierarchy-dropdown-nest-copy">
              <p className="ui-hierarchy-dropdown-nest-label">{label}</p>
            </div>
          </label>
        ) : (
          <div className="ui-hierarchy-dropdown-toggle">
            <div className="ui-hierarchy-dropdown-nest-copy">
              <p className="ui-hierarchy-dropdown-nest-label">{label}</p>
            </div>
          </div>
        )}
      </div>

      {childList.length > 0 ? (
        <div className="ui-hierarchy-dropdown-nest-children">
          {childList.map((child) => (
            <HierarchyDropdownNode
              key={child.id}
              item={child}
              childrenByParent={childrenByParent}
              minDepth={minDepth}
              maxDepth={maxDepth}
              selectedIdSet={selectedIdSet}
              disabled={disabled}
              mode={mode}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function HierarchyDropdownField<TItem extends HierarchyDropdownFieldItemBase>({
  id,
  label,
  itemList,
  selectedValueList,
  onChange,
  getParentId,
  allLabel,
  confirmLabel,
  disabled = false,
  primaryField = false
}: HierarchyDropdownFieldProps<TItem>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftSelectedValueList, setDraftSelectedValueList] = useState<number[]>(
    selectedValueList
  );

  const { childrenByParent, itemById, rootItemList, minDepth, maxDepth } =
    useHierarchyDropdownStructure(itemList, getParentId);
  const draftSelectedIdSet = useMemo(
    () => new Set(draftSelectedValueList),
    [draftSelectedValueList]
  );
  const selectedSummary = useMemo(() => {
    if (selectedValueList.length === 0) {
      return allLabel;
    }

    const selectedIdSet = new Set(selectedValueList);
    const selectedLabelList = itemList
      .filter((item) => selectedIdSet.has(item.id))
      .map((item) => resolveItemLabel(item));

    return selectedLabelList.length > 0 ? selectedLabelList.join(", ") : allLabel;
  }, [allLabel, itemList, selectedValueList]);

  const portalPanelStyle = useHierarchyDropdownPortalStyle(isOpen, triggerRef);

  useHierarchyDropdownDismiss(isOpen, rootRef, panelRef, () => {
    setDraftSelectedValueList(selectedValueList);
    setIsOpen(false);
  });

  function handleToggleDraftValue(id: number) {
    setDraftSelectedValueList((previous) => {
      const relatedIdSet = new Set<number>();

      let currentParentId = itemById.get(id) ? getParentId(itemById.get(id) as TItem) : null;
      while (currentParentId != null) {
        relatedIdSet.add(currentParentId);
        const parentItem = itemById.get(currentParentId);
        currentParentId = parentItem ? getParentId(parentItem) : null;
      }

      const pendingIdList = [id];
      while (pendingIdList.length > 0) {
        const currentId = pendingIdList.pop();
        if (currentId == null) {
          continue;
        }
        const childList = childrenByParent.get(currentId) ?? [];
        for (const child of childList) {
          if (!relatedIdSet.has(child.id)) {
            relatedIdSet.add(child.id);
            pendingIdList.push(child.id);
          }
        }
      }

      const nextSelectedValueList = previous.filter((item) => !relatedIdSet.has(item));
      return previous.includes(id)
        ? nextSelectedValueList.filter((item) => item !== id)
        : [...nextSelectedValueList, id];
    });
  }

  function handleToggleOpen() {
    if (disabled) {
      return;
    }

    if (isOpen) {
      setDraftSelectedValueList(selectedValueList);
      setIsOpen(false);
      return;
    }

    setDraftSelectedValueList(selectedValueList);
    setIsOpen(true);
  }

  function handleConfirm() {
    onChange(draftSelectedValueList);
    setIsOpen(false);
  }

  function handleClearSelection(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onChange([]);
    setDraftSelectedValueList([]);
    setIsOpen(false);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleToggleOpen();
    }
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setDraftSelectedValueList(selectedValueList);
      setIsOpen(false);
    }
  }

  return (
    <div className="ui-field">
      <p className="ui-field-label" id={`${id}-label`}>
        {label}
      </p>

      <div className="ui-hierarchy-dropdown" ref={rootRef}>
        <div
          ref={triggerRef}
          id={id}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          data-editor-primary-field={primaryField ? "true" : undefined}
          className="ui-input ui-hierarchy-dropdown-trigger"
          data-open={isOpen ? "true" : undefined}
          data-disabled={disabled ? "true" : undefined}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-labelledby={`${id}-label ${id}-summary`}
          onClick={() => {
            if (!disabled) {
              handleToggleOpen();
            }
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <div className="ui-hierarchy-dropdown-summary">
            <span
              id={`${id}-summary`}
              className="ui-hierarchy-dropdown-trigger-summary"
              data-placeholder={selectedValueList.length === 0 ? "true" : undefined}
            >
              {selectedSummary}
            </span>
          </div>

          <div className="ui-hierarchy-dropdown-trigger-actions">
            {selectedValueList.length > 0 ? (
              <button
                type="button"
                className="ui-input-trailing-icon ui-hierarchy-dropdown-clear"
                aria-label="Limpar seleção"
                title="Limpar seleção"
                onClick={handleClearSelection}
                disabled={disabled}
              >
                <svg
                  className="ui-hierarchy-dropdown-clear-icon"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            ) : null}

            <span
              className="ui-input-trailing-icon ui-hierarchy-dropdown-trigger-icon-wrap"
              aria-hidden
              title={isOpen ? "Fechar seleção hierárquica" : "Abrir seleção hierárquica"}
            >
              <svg
                className="ui-hierarchy-dropdown-trigger-icon"
                aria-hidden
                viewBox="0 0 16 16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="1.5"
                  y="1.5"
                  width="13"
                  height="13"
                  rx="2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <line
                  x1="4.5"
                  y1="4.475"
                  x2="11.65"
                  y2="4.475"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="7.0"
                  y1="6.825"
                  x2="11.65"
                  y2="6.825"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="7.0"
                  y1="9.175"
                  x2="11.65"
                  y2="9.175"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="7.0"
                  y1="11.525"
                  x2="11.65"
                  y2="11.525"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
        </div>

        {isOpen
          ? createPortal(
            <div
              ref={panelRef}
              className="ui-hierarchy-dropdown-panel"
              role="dialog"
              aria-modal="false"
              aria-labelledby={`${id}-label`}
              style={portalPanelStyle}
            >
              <div className="ui-hierarchy-dropdown-panel-body">
                <div className="ui-hierarchy-dropdown-tree">
                  {rootItemList.map((item) => (
                    <HierarchyDropdownNode
                      key={item.id}
                      item={item}
                      childrenByParent={childrenByParent}
                      minDepth={minDepth}
                      maxDepth={maxDepth}
                      selectedIdSet={draftSelectedIdSet}
                      disabled={disabled}
                      mode="multi"
                      onSelect={handleToggleDraftValue}
                    />
                  ))}
                </div>
              </div>

              <div className="ui-hierarchy-dropdown-actions">
                <button
                  type="button"
                  className="ui-button-primary"
                  onClick={handleConfirm}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>,
            document.body
          )
          : null}
      </div>
    </div>
  );
}

export function HierarchySingleSelectField<TItem extends HierarchyDropdownFieldItemBase>({
  id,
  label,
  itemList,
  value,
  onChange,
  getParentId,
  allLabel,
  ariaInvalid = false,
  disabled = false,
  primaryField = false
}: HierarchySingleSelectFieldProps<TItem>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const { childrenByParent, itemById, rootItemList, minDepth, maxDepth } =
    useHierarchyDropdownStructure(itemList, getParentId);
  const selectedIdSet = useMemo(
    () => (value == null ? new Set<number>() : new Set<number>([value])),
    [value]
  );
  const selectedSummary = useMemo(() => {
    if (value == null) {
      return allLabel;
    }

    const selectedItem = itemById.get(value);
    if (!selectedItem) {
      return allLabel;
    }
    return resolveItemPathLabel(selectedItem);
  }, [allLabel, itemById, value]);

  const portalPanelStyle = useHierarchyDropdownPortalStyle(isOpen, triggerRef);

  useHierarchyDropdownDismiss(isOpen, rootRef, panelRef, () => {
    setIsOpen(false);
  });

  function handleToggleOpen() {
    if (disabled) {
      return;
    }
    setIsOpen((previous) => !previous);
  }

  function handleSelect(id: number) {
    if (disabled) {
      return;
    }
    onChange(id);
    setIsOpen(false);
  }

  function handleClearSelection(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onChange(null);
    setIsOpen(false);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleToggleOpen();
    }
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div className="ui-field">
      <p className="ui-field-label" id={`${id}-label`}>
        {label}
      </p>

      <div className="ui-hierarchy-dropdown" ref={rootRef}>
        <div
          ref={triggerRef}
          id={id}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
          data-editor-primary-field={primaryField ? "true" : undefined}
          className="ui-input ui-hierarchy-dropdown-trigger"
          data-open={isOpen ? "true" : undefined}
          data-disabled={disabled ? "true" : undefined}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-labelledby={`${id}-label ${id}-summary`}
          aria-invalid={ariaInvalid ? "true" : undefined}
          onClick={() => {
            if (!disabled) {
              handleToggleOpen();
            }
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <div className="ui-hierarchy-dropdown-summary">
            <span
              id={`${id}-summary`}
              className="ui-hierarchy-dropdown-trigger-summary"
              data-placeholder={value == null ? "true" : undefined}
            >
              {selectedSummary}
            </span>
          </div>

          <div className="ui-hierarchy-dropdown-trigger-actions">
            {value != null ? (
              <button
                type="button"
                className="ui-input-trailing-icon ui-hierarchy-dropdown-clear"
                aria-label="Limpar seleção"
                title="Limpar seleção"
                onClick={handleClearSelection}
                disabled={disabled}
              >
                <svg
                  className="ui-hierarchy-dropdown-clear-icon"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            ) : null}

            <span
              className="ui-input-trailing-icon ui-hierarchy-dropdown-trigger-icon-wrap"
              aria-hidden
              title={isOpen ? "Fechar seleção hierárquica" : "Abrir seleção hierárquica"}
            >
              <svg
                className="ui-hierarchy-dropdown-trigger-icon"
                aria-hidden
                viewBox="0 0 16 16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="1.5"
                  y="1.5"
                  width="13"
                  height="13"
                  rx="2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <line
                  x1="4.5"
                  y1="4.475"
                  x2="11.65"
                  y2="4.475"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="7.0"
                  y1="6.825"
                  x2="11.65"
                  y2="6.825"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="7.0"
                  y1="9.175"
                  x2="11.65"
                  y2="9.175"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="7.0"
                  y1="11.525"
                  x2="11.65"
                  y2="11.525"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </div>
        </div>

        {isOpen
          ? createPortal(
            <div
              ref={panelRef}
              className="ui-hierarchy-dropdown-panel"
              role="dialog"
              aria-modal="false"
              aria-labelledby={`${id}-label`}
              style={portalPanelStyle}
            >
              <div className="ui-hierarchy-dropdown-panel-body">
                <div className="ui-hierarchy-dropdown-tree">
                  {rootItemList.map((item) => (
                    <HierarchyDropdownNode
                      key={item.id}
                      item={item}
                      childrenByParent={childrenByParent}
                      minDepth={minDepth}
                      maxDepth={maxDepth}
                      selectedIdSet={selectedIdSet}
                      disabled={disabled}
                      mode="single"
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )
          : null}
      </div>
    </div>
  );
}
