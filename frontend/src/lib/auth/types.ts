export type LoginAction = "issue_token" | "select_tenant" | "create_tenant";

export type TenantOption = {
  tenant_id: number;
  name: string;
  role: number;
};

export type InviteOption = {
  member_id: number;
  tenant_id: number;
  name: string;
  role: number;
  status: string;
};

export type AuthResponse = {
  access_token?: string | null;
  token_type: string;
  requires_tenant_selection: boolean;
  next_action?: LoginAction | null;
  tenant_list: TenantOption[];
  invite_list: InviteOption[];
};

export type TenantListResponse = {
  tenant_list: TenantOption[];
  invite_list: InviteOption[];
};

export type TenantCurrentResponse = {
  id: number;
  name: string;
  can_edit: boolean;
  can_delete: boolean;
};

export type TenantDeleteResponse = {
  deleted_tenant_id: number;
};

export type TenantMemberRecord = {
  id: number;
  name?: string | null;
  email: string;
  role: number;
  role_name: string;
  status: string;
  account_id?: number | null;
  can_edit: boolean;
  can_edit_access: boolean;
  can_delete: boolean;
};

export type TenantMemberDirectoryResponse = {
  can_edit: boolean;
  /** Ausente em respostas antigas do backend; usar `can_edit` como fallback na UI. */
  can_create?: boolean;
  item_list: TenantMemberRecord[];
};

export type TenantScopeRecord = {
  id: number;
  name: string;
  can_edit: boolean;
  can_delete: boolean;
};

export type TenantScopeDirectoryResponse = {
  can_edit: boolean;
  can_create: boolean;
  current_scope_id?: number | null;
  item_list: TenantScopeRecord[];
};

/** Campos comuns às árvores hierárquicas por escopo (locais, unidades produtivas, …). */
export type TenantScopeHierarchyItemBase = {
  id: number;
  name: string;
  sort_order: number;
  depth: number;
  path_labels: string[];
  children_count: number;
  descendants_count: number;
  can_edit: boolean;
  can_delete: boolean;
  can_create_child: boolean;
  can_move: boolean;
};

export type TenantLocationRecord = TenantScopeHierarchyItemBase & {
  parent_location_id?: number | null;
};

export type TenantLocationDirectoryResponse = {
  scope_id: number;
  scope_name: string;
  can_edit: boolean;
  can_create: boolean;
  item_list: TenantLocationRecord[];
};

export type TenantKindRecord = {
  id: number;
  name: string;
  /** Itens no escopo com `item.kind_id` igual a este tipo. */
  reference_count: number;
};

export type TenantKindListResponse = {
  can_edit: boolean;
  item_list: TenantKindRecord[];
};

export type TenantItemRecord = TenantScopeHierarchyItemBase & {
  parent_item_id?: number | null;
  kind_id: number;
};

export type TenantItemDirectoryResponse = {
  scope_id: number;
  scope_name: string;
  can_edit: boolean;
  can_create: boolean;
  kind_list: TenantKindRecord[];
  item_list: TenantItemRecord[];
};

export type TenantUnityRecord = {
  id: number;
  name: string;
  location_id: number;
  location_name: string;
  item_id_list: number[];
  item_display_label_list: string[];
  creation_utc: string;
  can_edit: boolean;
  can_delete: boolean;
};

export type TenantUnityDirectoryResponse = {
  scope_id: number;
  scope_name: string;
  can_edit: boolean;
  can_create: boolean;
  item_list: TenantUnityRecord[];
};

export type TenantScopeFieldRecord = {
  id: number;
  scope_id: number;
  sql_type: string;
  sort_order: number;
  is_initial_age: boolean;
  is_final_age: boolean;
  is_current_age: boolean;
  label_id?: number | null;
  label_name?: string | null;
};

export type TenantScopeFieldDirectoryResponse = {
  can_edit: boolean;
  item_list: TenantScopeFieldRecord[];
};

export type TenantScopeActionRecord = {
  id: number;
  scope_id: number;
  sort_order: number;
  is_recurrent: boolean;
  label_id?: number | null;
  label_name?: string | null;
};

export type TenantScopeActionDirectoryResponse = {
  can_edit: boolean;
  item_list: TenantScopeActionRecord[];
};

export type TenantScopeEventRecord = {
  id: number;
  unity_id?: number | null;
  location_id: number;
  item_id: number;
  action_id: number;
  moment_utc?: string | null;
  /** Resumo dos inputs salvos (rótulo: valor), calculado no servidor. */
  input_summary?: string | null;
};

export type TenantScopeEventDirectoryResponse = {
  can_edit: boolean;
  item_list: TenantScopeEventRecord[];
};

export type ScopeCurrentAgeCalculationStatus =
  | "created"
  | "updated"
  | "unchanged";

export type ScopeCurrentAgeCalculationEmptyReason =
  | "no_events_before_period_end"
  | "no_eligible_window"
  | "no_results_in_selected_period"
  | "no_persisted_results_in_period"
  | "no_results_to_delete_in_period";

export type ScopeCurrentAgeCalculationRecord = {
  event_id: number;
  result_id: number;
  field_id: number;
  formula_id: number;
  formula_order: number;
  location_id: number;
  item_id: number;
  action_id: number;
  event_moment_utc: string;
  result_moment_utc: string;
  text_value?: string | null;
  boolean_value?: boolean | null;
  numeric_value?: number | string | null;
  status: ScopeCurrentAgeCalculationStatus;
};

export type ScopeCurrentAgeCalculationResponse = {
  can_edit: boolean;
  calculated_moment_utc: string;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  empty_reason?: ScopeCurrentAgeCalculationEmptyReason | null;
  item_list: ScopeCurrentAgeCalculationRecord[];
};

export type ScopeFormulaRecord = {
  id: number;
  action_id: number;
  sort_order: number;
  statement: string;
};

export type ScopeFormulaListResponse = {
  can_edit: boolean;
  item_list: ScopeFormulaRecord[];
};

export type ScopeInputRecord = {
  id: number;
  event_id: number;
  field_id: number;
  value: string;
};

export type ScopeInputListResponse = {
  can_edit: boolean;
  item_list: ScopeInputRecord[];
};

export type AuditLogTableName =
  | "tenant"
  | "member"
  | "scope"
  | "location"
  | "item"
  | "unity"
  | "field"
  | "action"
  | "event";

export type AuditLogActionType = "I" | "U" | "D";

export type AuditLogDiffState = "not_applicable" | "ready" | "missing_previous";

export type AuditLogFieldChange = {
  field_name: string;
  previous_value: unknown;
  current_value: unknown;
};

export type AuditLogRecord = {
  id: number;
  moment_utc: string;
  actor_name?: string | null;
  action_type: AuditLogActionType;
  row_id: number;
  row: Record<string, unknown> | null;
  field_change_list: AuditLogFieldChange[];
  diff_state: AuditLogDiffState;
};

export type AuditLogListResponse = {
  item_list: AuditLogRecord[];
  has_more: boolean;
  next_offset?: number | null;
};

export type AuthSessionResponse = {
  account: {
    id: number;
    email: string;
    name: string;
    provider: string;
  };
  member: {
    id: number;
    role: number;
    status: string;
    name?: string | null;
    email: string;
    current_scope_id?: number | null;
  };
  tenant: {
    id: number;
    name: string;
  };
};

export type CurrentScopeSelectionResponse = {
  current_scope_id?: number | null;
};

export type TenantSelectionSnapshot = {
  tenant_list: TenantOption[];
  invite_list: InviteOption[];
  next_action?: LoginAction | null;
};
