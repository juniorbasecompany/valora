"use client";

import { ScopeHierarchyConfigurationClient } from "@/component/configuration/scope-hierarchy-configuration-client";
import type {
    TenantLocationDirectoryResponse,
    TenantLocationRecord,
    TenantScopeRecord
} from "@/lib/auth/types";

type Props = {
    locale: string;
    currentScope: TenantScopeRecord | null;
    hasAnyScope: boolean;
    initialLocationDirectory: TenantLocationDirectoryResponse | null;
    copy: Record<string, string>;
};

export function LocationConfigurationClient({
    locale,
    currentScope,
    hasAnyScope,
    initialLocationDirectory,
    copy
}: Props) {
    return (
        <ScopeHierarchyConfigurationClient<
            TenantLocationRecord,
            TenantLocationDirectoryResponse
        >
            locale={locale}
            currentScope={currentScope}
            hasAnyScope={hasAnyScope}
            initialDirectory={initialLocationDirectory}
            copy={copy}
            configurationSegment="location"
            queryParamKey="location"
            apiSegment="locations"
            formIds={{
                nameInput: "location-name",
                displayTextarea: "location-display-name",
                historyHeading: "location-history-heading"
            }}
            getParentId={(item) => item.parent_location_id ?? null}
            buildSavePayload={({ name, display_name, parentId }) => ({
                name,
                display_name,
                parent_location_id: parentId
            })}
        />
    );
}
