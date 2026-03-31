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

const FORMULA_REFERENCE_TOKEN = /\$\{(field|input):(\d+)\}/g;

/** Intervalos `${field:id}` e `${input:id}` tratados como bloco único. */
class FieldTokenAtomicMarker extends RangeValue {
    eq(other: RangeValue): boolean {
        return other instanceof FieldTokenAtomicMarker;
    }
}

const fieldTokenAtomicInstance = new FieldTokenAtomicMarker();

function listFieldTokenSpans(docText: string): { from: number; to: number }[] {
    const spanList: { from: number; to: number }[] = [];
    const re = new RegExp(FORMULA_REFERENCE_TOKEN.source, "g");
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
    return slice.replace(FORMULA_REFERENCE_TOKEN, (_full, _kind: string, idStr: string) => {
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

function selectedClipboardText(
    view: EditorView,
    idToLabel: Map<number, string>,
    unknownFieldLabel: string
): { rangeList: readonly { from: number; to: number }[]; text: string } | null {
    const rangeList = view.state.selection.ranges.filter((range) => !range.empty);
    if (rangeList.length === 0) {
        return null;
    }
    const chunkList = rangeList.map((range) =>
        clipboardPrettyText(
            view.state.sliceDoc(range.from, range.to),
            idToLabel,
            unknownFieldLabel
        )
    );
    return { rangeList, text: chunkList.join("\n") };
}

function createFieldAutocompleteSource(
    fieldList: FormulaFieldOption[],
    unknownFieldLabel: string
) {
    return (context: CompletionContext) => {
        const before = context.matchBefore(/([@#])([^\n@#]*)$/);
        if (!before) {
            return null;
        }
        const trigger = before.text[0];
        const referenceKind = trigger === "#" ? "input" : "field";
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
                apply: `\${${referenceKind}:${field.id}}`,
                type: "constant" as const
            }))
        };
    };
}

class FieldLabelWidget extends WidgetType {
    constructor(
        readonly label: string,
        readonly referenceKind: "field" | "input"
    ) {
        super();
    }

    eq(other: FieldLabelWidget): boolean {
        return (
            other.label === this.label
            && other.referenceKind === this.referenceKind
        );
    }

    toDOM(): HTMLElement {
        const span = document.createElement("span");
        span.className = this.referenceKind === "input"
            ? "ui-formula-field-token ui-formula-input-token"
            : "ui-formula-field-token";
        span.textContent = this.label;
        return span;
    }

    /**
     * Ignora eventos no widget visual para o editor tratar o intervalo como texto único
     * (junto com atomicRanges), evitando apagamento caractere a caractere no miolo do token.
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
        regexp: FORMULA_REFERENCE_TOKEN,
        decoration: (match) => {
            const referenceKind = match[1] === "input" ? "input" : "field";
            const id = Number(match[2]);
            const label =
                idToLabel.get(id) ?? `${unknownFieldLabel} (${id})`;
            return Decoration.replace({
                widget: new FieldLabelWidget(label, referenceKind),
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

    return [
        fieldPlugin,
        EditorView.atomicRanges.of((view) => fieldTokenAtomicRangeSet(view.state.doc.toString())),
        EditorView.domEventHandlers({
            copy(event, view) {
                if (!event.clipboardData) {
                    return false;
                }
                const selectionData = selectedClipboardText(
                    view,
                    idToLabel,
                    unknownFieldLabel
                );
                if (!selectionData) {
                    return false;
                }
                event.clipboardData.setData("text/plain", selectionData.text);
                event.preventDefault();
                return true;
            },
            cut(event, view) {
                if (readOnly || !event.clipboardData) {
                    return false;
                }
                const selectionData = selectedClipboardText(
                    view,
                    idToLabel,
                    unknownFieldLabel
                );
                if (!selectionData) {
                    return false;
                }
                event.clipboardData.setData("text/plain", selectionData.text);
                event.preventDefault();
                view.dispatch({
                    changes: selectionData.rangeList.map((range) => ({
                        from: range.from,
                        to: range.to,
                        insert: ""
                    }))
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
    /** Rótulo para leitores de tela. */
    ariaLabel?: string;
    id: string;
};

export function FormulaStatementEditor({
    value,
    onChange,
    disabled,
    fieldList,
    unknownFieldLabel,
    ariaLabel,
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
                    /* Tema base do CodeMirror usa line-height: 1.4; input nativo usa ~normal, o que altera o recuo visual da primeira linha. */
                    lineHeight: "inherit",
                    overflow: "auto"
                },
                ".cm-content": {
                    padding: 0,
                    caretColor: "var(--color-text)",
                    minHeight: "7rem"
                },
                /* Tema base do CodeMirror adiciona padding em cada linha; sem isso o texto fica mais recuado que .ui-input. */
                ".cm-line": {
                    padding: 0
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

        if (ariaLabel) {
            staticExtensions.push(
                EditorView.contentAttributes.of({ "aria-label": ariaLabel })
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
