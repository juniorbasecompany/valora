"use client";

import {
    autocompletion,
    completionKeymap,
    type CompletionContext
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
    Compartment,
    EditorState,
    RangeSet,
    RangeValue,
    type Extension
} from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    MatchDecorator,
    ViewPlugin,
    type ViewUpdate,
    WidgetType,
    drawSelection,
    keymap
} from "@codemirror/view";
import { useEffect, useRef } from "react";

export type FormulaFieldOption = {
    id: number;
    labelName: string;
};

const FIELD_TOKEN = /\$\{field:(\d+)\}/g;

/** Intervalos `${field:id}` tratados como um bloco único (cursor e apagar não entram no meio). */
class FieldTokenAtomicMarker extends RangeValue {
    eq(other: RangeValue): boolean {
        return other instanceof FieldTokenAtomicMarker;
    }
}

const fieldTokenAtomicInstance = new FieldTokenAtomicMarker();

function listFieldTokenSpans(docText: string): { from: number; to: number }[] {
    const spanList: { from: number; to: number }[] = [];
    const re = new RegExp(FIELD_TOKEN.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(docText)) != null) {
        spanList.push({ from: match.index, to: match.index + match[0].length });
    }
    return spanList;
}

function fieldTokenAtomicRangeSet(docText: string): RangeSet<FieldTokenAtomicMarker> {
    const spanList = listFieldTokenSpans(docText);
    if (spanList.length === 0) {
        return RangeSet.empty;
    }
    return RangeSet.of(
        spanList.map((span) => fieldTokenAtomicInstance.range(span.from, span.to))
    );
}

function clipboardPrettyText(
    slice: string,
    idToLabel: Map<number, string>,
    unknownFieldLabel: string
): string {
    return slice.replace(/\$\{field:(\d+)\}/g, (_full, idStr: string) => {
        const id = Number(idStr);
        return idToLabel.get(id) ?? `${unknownFieldLabel} (${id})`;
    });
}

function displayLabel(field: FormulaFieldOption, unknownFieldLabel: string): string {
    const trimmed = field.labelName.trim();
    if (trimmed) {
        return trimmed;
    }
    return `${unknownFieldLabel} (${field.id})`;
}

function createFieldAutocompleteSource(
    fieldList: FormulaFieldOption[],
    unknownFieldLabel: string
) {
    return (context: CompletionContext) => {
        const before = context.matchBefore(/@([^\n@]*)$/);
        if (!before) {
            return null;
        }
        const query = before.text.slice(1).trim().toLowerCase();
        const filtered = fieldList.filter((field) => {
            const label = displayLabel(field, unknownFieldLabel).toLowerCase();
            return !query || label.includes(query);
        });
        if (filtered.length === 0) {
            return null;
        }
        return {
            from: before.from,
            to: context.pos,
            filter: false,
            options: filtered.map((field) => ({
                label: displayLabel(field, unknownFieldLabel),
                apply: `\${field:${field.id}}`,
                type: "constant" as const
            }))
        };
    };
}

class FieldLabelWidget extends WidgetType {
    constructor(readonly label: string) {
        super();
    }

    eq(other: FieldLabelWidget): boolean {
        return other.label === this.label;
    }

    toDOM(): HTMLElement {
        const span = document.createElement("span");
        span.className = "ui-formula-field-token";
        span.textContent = this.label;
        return span;
    }

    /**
     * Ignora eventos no widget visual para o editor tratar o intervalo como texto único
     * (junto com atomicRanges), evitando apagamento caractere a caractere no miolo de `${field:id}`.
     */
    ignoreEvent(): boolean {
        return true;
    }
}

function buildFieldTokenExtension(
    fieldList: FormulaFieldOption[],
    unknownFieldLabel: string,
    readOnly: boolean
): Extension {
    const idToLabel = new Map<number, string>();
    for (const field of fieldList) {
        idToLabel.set(field.id, displayLabel(field, unknownFieldLabel));
    }

    const decorator = new MatchDecorator({
        regexp: FIELD_TOKEN,
        decoration: (match) => {
            const id = Number(match[1]);
            const label =
                idToLabel.get(id) ?? `${unknownFieldLabel} (${id})`;
            return Decoration.replace({
                widget: new FieldLabelWidget(label),
                inclusive: true
            });
        }
    });

    const fieldPlugin = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = decorator.createDeco(view);
            }

            update(update: ViewUpdate) {
                this.decorations = decorator.updateDeco(update, this.decorations);
            }
        },
        { decorations: (value) => value.decorations }
    );

    const idToLabelForClipboard = idToLabel;

    return [
        fieldPlugin,
        EditorView.atomicRanges.of((view) => fieldTokenAtomicRangeSet(view.state.doc.toString())),
        EditorView.domEventHandlers({
            copy(event, view) {
                if (!event.clipboardData) {
                    return false;
                }
                const rangeList = view.state.selection.ranges.filter((r) => !r.empty);
                if (rangeList.length === 0) {
                    return false;
                }
                const chunks = rangeList.map((r) =>
                    clipboardPrettyText(
                        view.state.sliceDoc(r.from, r.to),
                        idToLabelForClipboard,
                        unknownFieldLabel
                    )
                );
                event.clipboardData.setData("text/plain", chunks.join("\n"));
                event.preventDefault();
                return true;
            },
            cut(event, view) {
                if (readOnly || !event.clipboardData) {
                    return false;
                }
                const rangeList = view.state.selection.ranges.filter((r) => !r.empty);
                if (rangeList.length === 0) {
                    return false;
                }
                const chunks = rangeList.map((r) =>
                    clipboardPrettyText(
                        view.state.sliceDoc(r.from, r.to),
                        idToLabelForClipboard,
                        unknownFieldLabel
                    )
                );
                event.clipboardData.setData("text/plain", chunks.join("\n"));
                event.preventDefault();
                view.dispatch({
                    changes: rangeList.map((r) => ({ from: r.from, to: r.to, insert: "" }))
                });
                return true;
            }
        }),
        autocompletion({
            override: [createFieldAutocompleteSource(fieldList, unknownFieldLabel)],
            activateOnTyping: true
        }),
        EditorState.readOnly.of(readOnly)
    ];
}

export type FormulaStatementEditorProps = {
    value: string;
    onChange: (next: string) => void;
    disabled: boolean;
    fieldList: FormulaFieldOption[];
    unknownFieldLabel: string;
    ariaLabelledBy?: string;
    id: string;
};

export function FormulaStatementEditor({
    value,
    onChange,
    disabled,
    fieldList,
    unknownFieldLabel,
    ariaLabelledBy,
    id
}: FormulaStatementEditorProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const compartmentRef = useRef(new Compartment());
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const staticExtensions: Extension[] = [
            history(),
            drawSelection(),
            EditorView.lineWrapping,
            keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
            EditorView.theme({
                "&.cm-editor": {
                    width: "100%",
                    background: "transparent"
                },
                ".cm-scroller": {
                    fontFamily: "inherit",
                    overflow: "auto"
                },
                ".cm-content": {
                    padding: "var(--space-control-y) var(--space-control-x)",
                    caretColor: "var(--color-text)",
                    minHeight: "7rem"
                },
                ".cm-cursor": {
                    borderLeftColor: "var(--color-text)"
                },
                "&.cm-focused": {
                    outline: "none"
                }
            }),
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    onChangeRef.current(update.state.doc.toString());
                }
            })
        ];

        if (ariaLabelledBy) {
            staticExtensions.push(
                EditorView.contentAttributes.of({ "aria-labelledby": ariaLabelledBy })
            );
        }

        const startState = EditorState.create({
            doc: value,
            extensions: [
                compartmentRef.current.of(
                    buildFieldTokenExtension(fieldList, unknownFieldLabel, disabled)
                ),
                ...staticExtensions
            ]
        });

        const view = new EditorView({
            state: startState,
            parent: container
        });
        viewRef.current = view;

        return () => {
            view.destroy();
            viewRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- montagem única; props dinâmicas via efeitos abaixo
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) {
            return;
        }
        view.dispatch({
            effects: compartmentRef.current.reconfigure(
                buildFieldTokenExtension(fieldList, unknownFieldLabel, disabled)
            )
        });
    }, [fieldList, unknownFieldLabel, disabled]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) {
            return;
        }
        const current = view.state.doc.toString();
        if (current !== value) {
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: value }
            });
        }
    }, [value]);

    return (
        <div
            id={id}
            ref={containerRef}
            className="ui-input ui-formula-statement-editor"
            data-disabled={disabled ? "true" : undefined}
        />
    );
}
