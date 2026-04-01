"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

export type HierarchyDropdownFieldItemBase = {
  id: number;
  name: string;
  display_name: string;
  depth: number;
};

type HierarchyDropdownFieldProps<TItem extends HierarchyDropdownFieldItemBase> = {
  id: string;
  label: string;
  itemList: TItem[];
  selectedValueList: number[];
  onChange: (nextSelectedValueList: number[]) => void;
  getParentId: (item: TItem) => number | null;
  allLabel: string;
  confirmLabel: string;
  disabled?: boolean;
};

type HierarchyDropdownNodeProps<TItem extends HierarchyDropdownFieldItemBase> = {
  item: TItem;
  childrenByParent: Map<number | null, TItem[]>;
  maxDepth: number;
  selectedIdSet: Set<number>;
  onToggle: (id: number) => void;
};

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

function resolveItemLabel(item: HierarchyDropdownFieldItemBase) {
  return item.name.trim() || item.display_name.trim() || `#${item.id}`;
}

function HierarchyDropdownNode<TItem extends HierarchyDropdownFieldItemBase>({
  item,
  childrenByParent,
  maxDepth,
  selectedIdSet,
  onToggle
}: HierarchyDropdownNodeProps<TItem>) {
  const childList = childrenByParent.get(item.id) ?? [];
  const label = resolveItemLabel(item);
  const isSelected = selectedIdSet.has(item.id);

  return (
    <section
      className="ui-location-nest-box ui-hierarchy-dropdown-node"
      data-selected={isSelected ? "true" : undefined}
      style={buildHierarchyToneStyle(item.depth, maxDepth)}
    >
      <div className="ui-hierarchy-dropdown-head">
        <label className="ui-hierarchy-dropdown-toggle">
          <input
            type="checkbox"
            className="ui-hierarchy-dropdown-checkbox"
            checked={isSelected}
            onChange={() => onToggle(item.id)}
          />
          <div className="ui-location-nest-copy">
            <p className="ui-location-nest-label">{label}</p>
          </div>
        </label>
      </div>

      {childList.length > 0 ? (
        <div className="ui-location-nest-children">
          {childList.map((child) => (
            <HierarchyDropdownNode
              key={child.id}
              item={child}
              childrenByParent={childrenByParent}
              maxDepth={maxDepth}
              selectedIdSet={selectedIdSet}
              onToggle={onToggle}
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
  disabled = false
}: HierarchyDropdownFieldProps<TItem>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftSelectedValueList, setDraftSelectedValueList] = useState<number[]>(
    selectedValueList
  );

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
  const itemById = useMemo(
    () => new Map(itemList.map((item) => [item.id, item])),
    [itemList]
  );

  const rootItemList = useMemo(() => childrenByParent.get(null) ?? [], [childrenByParent]);
  const maxDepth = useMemo(
    () => itemList.reduce((max, item) => Math.max(max, item.depth), 0),
    [itemList]
  );
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDraftSelectedValueList(selectedValueList);
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDraftSelectedValueList(selectedValueList);
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, selectedValueList]);

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
          id={id}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
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

        {isOpen ? (
          <div
            className="ui-hierarchy-dropdown-panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${id}-label`}
          >
            <div className="ui-hierarchy-dropdown-panel-body">
              <div className="ui-location-nest-list ui-hierarchy-dropdown-tree">
                {rootItemList.map((item) => (
                  <HierarchyDropdownNode
                    key={item.id}
                    item={item}
                    childrenByParent={childrenByParent}
                    maxDepth={maxDepth}
                    selectedIdSet={draftSelectedIdSet}
                    onToggle={handleToggleDraftValue}
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
