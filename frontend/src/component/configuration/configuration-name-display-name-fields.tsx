import type { Dispatch, SetStateAction } from "react";

import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";

export type NameDisplayFieldError = {
  name?: string;
  displayName?: string;
};

type ConfigurationNameDisplayNameFieldsProps = {
  nameInputId: string;
  displayTextareaId: string;
  name: string;
  displayName: string;
  setName: Dispatch<SetStateAction<string>>;
  setDisplayName: Dispatch<SetStateAction<string>>;
  setFieldError: Dispatch<SetStateAction<NameDisplayFieldError>>;
  fieldError: NameDisplayFieldError;
  disabled: boolean;
  nameLabel: string;
  nameHint: string;
  displayNameLabel: string;
  displayNameHint: string;
  flashActive?: boolean;
  /** Chamado após limpar erro de campo (ex.: limpar mensagem de sucesso ou erro de request). */
  onAfterFieldEdit?: () => void;
};

export function ConfigurationNameDisplayNameFields({
  nameInputId,
  displayTextareaId,
  name,
  displayName,
  setName,
  setDisplayName,
  setFieldError,
  fieldError,
  disabled,
  nameLabel,
  nameHint,
  displayNameLabel,
  displayNameHint,
  flashActive = false,
  onAfterFieldEdit
}: ConfigurationNameDisplayNameFieldsProps) {
  return (
    <>
      <section className="ui-card ui-form-section ui-border-accent">
        <EditorPanelFlashOverlay active={flashActive} />

        <div className="ui-editor-content">
          <div className="ui-field">
            <label className="ui-field-label" htmlFor={nameInputId}>
              {nameLabel}
            </label>
            <input
              id={nameInputId}
              className="ui-input"
              data-editor-primary-field="true"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFieldError((previous) => ({
                  ...previous,
                  name: undefined
                }));
                onAfterFieldEdit?.();
              }}
              disabled={disabled}
              aria-invalid={Boolean(fieldError.name)}
            />
            <p className="ui-field-hint">{nameHint}</p>
            {fieldError.name ? (
              <p className="ui-field-error">{fieldError.name}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="ui-card ui-form-section ui-border-accent">
        <div className="ui-editor-content">
          <div className="ui-field">
            <label className="ui-field-label" htmlFor={displayTextareaId}>
              {displayNameLabel}
            </label>
            <textarea
              id={displayTextareaId}
              className="ui-input ui-input-textarea"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setFieldError((previous) => ({
                  ...previous,
                  displayName: undefined
                }));
                onAfterFieldEdit?.();
              }}
              disabled={disabled}
              aria-invalid={Boolean(fieldError.displayName)}
            />
            <p className="ui-field-hint">{displayNameHint}</p>
            {fieldError.displayName ? (
              <p className="ui-field-error">{fieldError.displayName}</p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
