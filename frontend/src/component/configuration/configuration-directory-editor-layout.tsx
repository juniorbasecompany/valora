"use client";

import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

import { PageHeader } from "@/component/app-shell/page-header";
import {
    ConfigurationEditorFooter,
    type ConfigurationEditorFooterProps
} from "@/component/configuration/configuration-editor-footer";
import { ConfigurationHistoryPanel } from "@/component/configuration/configuration-history-panel";
import type { AuditLogTableName } from "@/lib/auth/types";

export type ConfigurationDirectoryEditorLayoutProps = {
    headerTitle: string;
    headerDescription: string;
    directoryAside: ReactNode;
    editorPanelRef: RefObject<HTMLDivElement | null>;
    isDeletePending?: boolean;
    editorBody: ReactNode;
    history: {
        headingId: string;
        title: string;
        description: string;
        tableName: AuditLogTableName;
        refreshKey?: number;
    };
    footer: ConfigurationEditorFooterProps;
};

/**
 * Casca partilhada das telas de configuração com diretório + editor (escopo, árvores por escopo, …).
 * Lista vs árvore e conteúdo do editor ficam nos slots; regras de negócio permanecem no pai.
 */
export function ConfigurationDirectoryEditorLayout({
    headerTitle,
    headerDescription,
    directoryAside,
    editorPanelRef,
    isDeletePending,
    editorBody,
    history,
    footer
}: ConfigurationDirectoryEditorLayoutProps) {
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setPortalTarget(document.getElementById("app-shell-footer-slot"));
    }, []);

    return (
        <section className="ui-page-stack ui-page-stack-footer">
            <PageHeader title={headerTitle} description={headerDescription} />

            <div className="ui-layout-directory ui-layout-directory-editor">
                <aside className="ui-panel ui-stack-lg ui-panel-context-card">
                    {directoryAside}
                </aside>

                <div
                    ref={editorPanelRef}
                    className="ui-panel ui-panel-editor ui-editor-panel"
                    data-delete-pending={isDeletePending ? "true" : undefined}
                >
                    <div className="ui-editor-panel-body">{editorBody}</div>
                </div>
            </div>

            <ConfigurationHistoryPanel
                headingId={history.headingId}
                title={history.title}
                description={history.description}
                tableName={history.tableName}
                refreshKey={history.refreshKey}
            />

            {portalTarget
                ? createPortal(<ConfigurationEditorFooter {...footer} />, portalTarget)
                : null}
        </section>
    );
}
