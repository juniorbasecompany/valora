"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ConfigurationDirectoryCreateButton } from "@/component/configuration/configuration-directory-create-button";
import {
  FormulaStatementEditor,
  type FormulaFieldOption
} from "@/component/configuration/formula-statement-editor";
import { TrashIconButton } from "@/component/ui/trash-icon-button";
import { useTranslations } from "next-intl";
import { useMemo, type CSSProperties } from "react";

export type ActionFormulaDraftRow = {
  clientKey: string;
  serverId?: number;
  statement: string;
  pendingDelete: boolean;
};

type ActionFormulaSectionProps = {
  canEdit: boolean;
  disabled: boolean;
  isLoading: boolean;
  fieldList: FormulaFieldOption[];
  rowList: ActionFormulaDraftRow[];
  onChangeRowList: (next: ActionFormulaDraftRow[]) => void;
  onAdd: () => void;
};

type FormulaRowCopy = {
  statementAriaLabel: string;
  dragHandleAria: string;
  removeAriaLabel: string;
  unmarkAriaLabel: string;
};

function SortableFormulaRow({
  row,
  canEdit,
  disabled,
  copy,
  fieldList,
  unknownFieldLabel,
  onChangeStatement,
  onToggleRemove
}: {
  row: ActionFormulaDraftRow;
  canEdit: boolean;
  disabled: boolean;
  copy: FormulaRowCopy;
  fieldList: FormulaFieldOption[];
  unknownFieldLabel: string;
  onChangeStatement: (statement: string) => void;
  onToggleRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.clientKey,
    disabled: disabled || !canEdit || row.pendingDelete
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="ui-formula-sortable-row"
      data-dragging={isDragging ? "true" : undefined}
      data-delete-pending={row.pendingDelete ? "true" : undefined}
    >
      <div className="ui-formula-row-layout">
        <div className="ui-formula-row-field ui-field">
          <FormulaStatementEditor
            id={`formula-stmt-${row.clientKey}`}
            value={row.statement}
            onChange={onChangeStatement}
            disabled={disabled || !canEdit || row.pendingDelete}
            fieldList={fieldList}
            unknownFieldLabel={unknownFieldLabel}
            ariaLabel={copy.statementAriaLabel}
          />
        </div>
        <div className="ui-formula-row-actions">
          <button
            type="button"
            className="ui-formula-drag-handle"
            disabled={disabled || !canEdit || row.pendingDelete}
            aria-label={copy.dragHandleAria}
            {...attributes}
            {...listeners}
          >
            <span aria-hidden>{"⋮⋮"}</span>
          </button>
          {canEdit ? (
            <TrashIconButton
              marked={row.pendingDelete}
              ariaLabel={
                row.pendingDelete ? copy.unmarkAriaLabel : copy.removeAriaLabel
              }
              disabled={disabled}
              onClick={onToggleRemove}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ActionFormulaSection({
  canEdit,
  disabled,
  isLoading,
  fieldList,
  rowList,
  onChangeRowList,
  onAdd
}: ActionFormulaSectionProps) {
  const t = useTranslations("ActionConfigurationPage.formulas");
  const unknownFieldLabel = t("unknownFieldLabel");
  const exampleBlockList = t("exampleList")
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const rowCopy: FormulaRowCopy = {
    statementAriaLabel: t("statementLabel"),
    dragHandleAria: t("dragHandleAria"),
    removeAriaLabel: t("removeAriaLabel"),
    unmarkAriaLabel: t("unmarkAriaLabel")
  };

  const sortableIdList = useMemo(() => rowList.map((r) => r.clientKey), [rowList]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = rowList.findIndex((r) => r.clientKey === active.id);
    const newIndex = rowList.findIndex((r) => r.clientKey === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    onChangeRowList(arrayMove(rowList, oldIndex, newIndex));
  };

  const updateRow = (clientKey: string, patch: Partial<ActionFormulaDraftRow>) => {
    onChangeRowList(
      rowList.map((row) => (row.clientKey === clientKey ? { ...row, ...patch } : row))
    );
  };

  return (
    <section className="ui-card ui-form-section ui-border-accent ui-editor-form-section-full-width">
      <h3 className="ui-field-label" style={{ marginBottom: "0.35rem" }}>
        {t("title")}
      </h3>

      {canEdit ? (
        <ConfigurationDirectoryCreateButton
          label={t("newFormula")}
          disabled={disabled || isLoading}
          onClick={onAdd}
          wrapInToolbar={false}
        />
      ) : null}

      {isLoading ? (
        <p className="ui-field-hint">{t("loading")}</p>
      ) : rowList.length > 0 ? (
        <DndContext
          id="action-configuration-formula-list"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIdList} strategy={verticalListSortingStrategy}>
            <div className="ui-formula-list">
              {rowList.map((row) => (
                <SortableFormulaRow
                  key={row.clientKey}
                  row={row}
                  canEdit={canEdit}
                  disabled={disabled}
                  copy={rowCopy}
                  fieldList={fieldList}
                  unknownFieldLabel={unknownFieldLabel}
                  onChangeStatement={(statement) => updateRow(row.clientKey, { statement })}
                  onToggleRemove={() =>
                    updateRow(row.clientKey, { pendingDelete: !row.pendingDelete })
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}
      <div
        className="ui-field-hint"
        style={{ marginTop: "0.75rem", whiteSpace: "pre-line" }}
      >
        {t("description")}
      </div>
      <div className="ui-formula-example-grid" style={{ marginTop: "0.75rem" }}>
        {exampleBlockList.map((exampleBlock, index) => (
          <div
            key={`formula-example-${index}`}
            className="ui-field-hint ui-formula-example-card"
          >
            <ul className="ui-formula-example-list">
              {exampleBlock
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line, lineIndex) => (
                  <li key={`formula-example-${index}-line-${lineIndex}`}>
                    {line}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
