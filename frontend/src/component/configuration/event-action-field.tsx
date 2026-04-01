"use client";

type EventActionOption = {
  id: number;
  label: string;
};

type EventActionInputField = {
  fieldId: number;
  label: string;
  sqlType: string;
  value: string;
};

export type EventActionFieldCopy = {
  actionLabel: string;
  actionHint: string;
  actionEmptyAriaLabel: string;
  inputSectionTitle: string;
  inputSectionHint: string;
  inputEmpty: string;
  inputLoading: string;
};

type EventActionFieldProps = {
  copy: EventActionFieldCopy;
  actionId: number | null;
  actionOptionList: EventActionOption[];
  onChangeActionId: (value: string) => void;
  actionErrorMessage?: string;
  disabled: boolean;
  generatedInputFieldList: EventActionInputField[];
  inputLoading: boolean;
  inputErrorMessage: string | null;
  onChangeInputValue: (fieldId: number, value: string) => void;
};

function resolveInputType(sqlType: string): "text" | "number" | "date" | "datetime-local" {
  const normalized = sqlType.trim().toLowerCase();
  if (
    normalized.includes("int")
    || normalized.includes("numeric")
    || normalized.includes("decimal")
    || normalized.includes("float")
    || normalized.includes("double")
    || normalized.includes("real")
  ) {
    return "number";
  }
  if (normalized === "date") {
    return "date";
  }
  if (normalized.includes("timestamp") || normalized.includes("datetime")) {
    return "datetime-local";
  }
  return "text";
}

export function EventActionField({
  copy,
  actionId,
  actionOptionList,
  onChangeActionId,
  actionErrorMessage,
  disabled,
  generatedInputFieldList,
  inputLoading,
  inputErrorMessage,
  onChangeInputValue
}: EventActionFieldProps) {
  const showInputSection = actionId != null;

  return (
    <>
      <section className="ui-card ui-form-section ui-border-accent">
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="event-action">
            {copy.actionLabel}
          </label>
          <select
            id="event-action"
            className="ui-input ui-input-select"
            value={actionId == null ? "" : String(actionId)}
            onChange={(event) => onChangeActionId(event.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(actionErrorMessage)}
          >
            <option value="" aria-label={copy.actionEmptyAriaLabel}></option>
            {actionOptionList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="ui-field-hint">{copy.actionHint}</p>
          {actionErrorMessage ? (
            <p className="ui-field-error">{actionErrorMessage}</p>
          ) : null}
        </div>
      </section>

      {showInputSection ? (
        <section className="ui-card ui-form-section ui-border-accent">
          <div className="ui-field">
            <p className="ui-field-label">{copy.inputSectionTitle}</p>
            <p className="ui-field-hint">{copy.inputSectionHint}</p>
          </div>

          {inputLoading ? (
            <p className="ui-field-hint">{copy.inputLoading}</p>
          ) : inputErrorMessage ? (
            <p className="ui-field-error">{inputErrorMessage}</p>
          ) : generatedInputFieldList.length === 0 ? (
            <p className="ui-field-hint">{copy.inputEmpty}</p>
          ) : (
            generatedInputFieldList.map((item) => (
              <div className="ui-field" key={item.fieldId}>
                <label className="ui-field-label" htmlFor={`event-action-input-${item.fieldId}`}>
                  {item.label}
                </label>
                <input
                  id={`event-action-input-${item.fieldId}`}
                  type={resolveInputType(item.sqlType)}
                  className="ui-input"
                  value={item.value}
                  onChange={(event) => onChangeInputValue(item.fieldId, event.target.value)}
                  disabled={disabled}
                  autoComplete="off"
                />
              </div>
            ))
          )}
        </section>
      ) : null}
    </>
  );
}
