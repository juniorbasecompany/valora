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

  return (
    <div className="ui-field">
      <p className="ui-field-label" id={`${id}-label`}>
        {label}
      </p>

      <div className="ui-hierarchy-dropdown" ref={rootRef}>
        <div
          className="ui-input ui-hierarchy-dropdown-trigger"
          data-open={isOpen ? "true" : undefined}
          data-disabled={disabled ? "true" : undefined}
        >
          <button
            id={id}
            type="button"
            className="ui-hierarchy-dropdown-summary-button"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-labelledby={`${id}-label ${id}-summary`}
            onClick={handleToggleOpen}
            disabled={disabled}
          >
            <span
              id={`${id}-summary`}
              className="ui-hierarchy-dropdown-trigger-summary"
              data-placeholder={selectedValueList.length === 0 ? "true" : undefined}
            >
              {selectedSummary}
            </span>
          </button>

          <div className="ui-hierarchy-dropdown-trigger-actions">
            {selectedValueList.length > 0 ? (
              <button
                type="button"
                className="ui-hierarchy-dropdown-clear"
                aria-label="Limpar seleção"
                title="Limpar seleção"
                onClick={handleClearSelection}
                disabled={disabled}
              >
                <span aria-hidden>×</span>
              </button>
            ) : null}

            <button
              type="button"
              className="ui-hierarchy-dropdown-icon-button"
              aria-label={isOpen ? "Fechar seleção hierárquica" : "Abrir seleção hierárquica"}
              title={isOpen ? "Fechar seleção hierárquica" : "Abrir seleção hierárquica"}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              onClick={handleToggleOpen}
              disabled={disabled}
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
                  strokeWidth="1.25"
                />
                <line
                  x1="4.5"
                  y1="5.5"
                  x2="11.5"
                  y2="5.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
                <line
                  x1="5.5"
                  y1="8"
                  x2="11.65"
                  y2="8"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
                <line
                  x1="5.5"
                  y1="10.5"
                  x2="11.65"
                  y2="10.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </button>
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
