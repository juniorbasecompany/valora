"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

import {
  hierarchyDragId,
  hierarchyGapId,
  hierarchyIntoId
} from "@/component/configuration/scope-hierarchy-tree-dnd";

export function HierarchyDragHandle({
  itemId,
  disabled,
  ariaLabel
}: {
  itemId: number;
  disabled: boolean;
  ariaLabel: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: hierarchyDragId(itemId),
    disabled,
    data: { type: "hierarchy-drag", itemId }
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      className="ui-location-nest-drag-handle"
      aria-label={ariaLabel}
      disabled={disabled}
      data-dragging={isDragging ? "true" : undefined}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden>{"⋮⋮"}</span>
    </button>
  );
}

/** Réplica visual da alça para `DragOverlay` (sem `useDraggable`; só o aspeto do botão). */
export function HierarchyDragHandleOverlayPreview() {
  return (
    <button
      type="button"
      className="ui-location-nest-drag-handle ui-location-nest-drag-handle--overlay"
      aria-hidden
      tabIndex={-1}
      data-dragging="true"
    >
      <span aria-hidden>{"⋮⋮"}</span>
    </button>
  );
}

export function HierarchyDropGap({
  parentId,
  gapIndex,
  disabled
}: {
  parentId: number | null;
  gapIndex: number;
  disabled: boolean;
}) {
  const id = hierarchyGapId(parentId, gapIndex);
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled,
    data: { type: "hierarchy-gap", parentId, gapIndex }
  });

  return (
    <div
      ref={setNodeRef}
      className="ui-location-nest-drop-gap"
      data-over={isOver ? "true" : undefined}
      aria-hidden
    />
  );
}

export function HierarchyIntoWrap({
  itemId,
  disabled,
  children
}: {
  itemId: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const id = hierarchyIntoId(itemId);
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled,
    data: { type: "hierarchy-into", itemId }
  });

  return (
    <div
      ref={setNodeRef}
      className="ui-location-nest-into-wrap"
      data-into-over={isOver ? "true" : undefined}
    >
      {children}
    </div>
  );
}
