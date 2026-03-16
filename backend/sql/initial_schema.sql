BEGIN;

-- Esquema PostgreSQL inicial do núcleo operacional.
-- Prioriza identidade estrutural, eventos temporais,
-- medidas governadas por metadado e o grão oficial diário de fatos.

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS meta;
CREATE SCHEMA IF NOT EXISTS fact;

CREATE TABLE core.package (
    package_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    technical_name text NOT NULL,
    display_name text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT package_technical_name_uq UNIQUE (technical_name),
    CONSTRAINT package_technical_name_ck CHECK (btrim(technical_name) <> ''),
    CONSTRAINT package_display_name_ck CHECK (btrim(display_name) <> ''),
    CONSTRAINT package_status_ck CHECK (btrim(status) <> '')
);

CREATE TABLE core.entity_kind (
    entity_kind_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    package_id bigint NOT NULL,
    technical_name text NOT NULL,
    display_name text NOT NULL,
    segment_allowed_flag boolean NOT NULL DEFAULT true,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT entity_kind_package_id_fk
        FOREIGN KEY (package_id)
        REFERENCES core.package (package_id),
    CONSTRAINT entity_kind_package_technical_name_uq
        UNIQUE (package_id, technical_name),
    CONSTRAINT entity_kind_technical_name_ck CHECK (btrim(technical_name) <> ''),
    CONSTRAINT entity_kind_display_name_ck CHECK (btrim(display_name) <> '')
);

CREATE TABLE core.location_node (
    location_node_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parent_location_node_id bigint NULL,
    location_kind text NOT NULL,
    technical_name text NOT NULL,
    display_name text NOT NULL,
    country_code char(2) NULL,
    timezone_name text NULL,
    valid_from date NOT NULL,
    valid_to date NULL,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT location_node_parent_location_node_id_fk
        FOREIGN KEY (parent_location_node_id)
        REFERENCES core.location_node (location_node_id),
    CONSTRAINT location_node_technical_name_uq
        UNIQUE (technical_name),
    CONSTRAINT location_node_location_kind_ck CHECK (btrim(location_kind) <> ''),
    CONSTRAINT location_node_technical_name_ck CHECK (btrim(technical_name) <> ''),
    CONSTRAINT location_node_display_name_ck CHECK (btrim(display_name) <> ''),
    CONSTRAINT location_node_country_code_ck
        CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT location_node_valid_range_ck
        CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT location_node_not_self_parent_ck
        CHECK (
            parent_location_node_id IS NULL
            OR parent_location_node_id <> location_node_id
        )
);

CREATE TABLE core.item (
    item_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_kind_id bigint NOT NULL,
    location_node_id bigint NOT NULL,
    code text NOT NULL,
    start_date date NOT NULL,
    end_date date NULL,
    status text NOT NULL DEFAULT 'active',
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT item_entity_kind_id_fk
        FOREIGN KEY (entity_kind_id)
        REFERENCES core.entity_kind (entity_kind_id),
    CONSTRAINT item_location_node_id_fk
        FOREIGN KEY (location_node_id)
        REFERENCES core.location_node (location_node_id),
    CONSTRAINT item_entity_kind_code_uq
        UNIQUE (entity_kind_id, code),
    CONSTRAINT item_code_ck CHECK (btrim(code) <> ''),
    CONSTRAINT item_status_ck CHECK (btrim(status) <> ''),
    CONSTRAINT item_valid_range_ck
        CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE core.segment (
    segment_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id bigint NOT NULL,
    location_node_id bigint NOT NULL,
    parent_segment_id bigint NULL,
    code text NOT NULL,
    start_date date NOT NULL,
    end_date date NULL,
    status text NOT NULL DEFAULT 'active',
    split_reason text NULL,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT segment_item_id_fk
        FOREIGN KEY (item_id)
        REFERENCES core.item (item_id),
    CONSTRAINT segment_location_node_id_fk
        FOREIGN KEY (location_node_id)
        REFERENCES core.location_node (location_node_id),
    CONSTRAINT segment_parent_segment_id_fk
        FOREIGN KEY (parent_segment_id)
        REFERENCES core.segment (segment_id),
    CONSTRAINT segment_item_code_uq
        UNIQUE (item_id, code),
    CONSTRAINT segment_id_item_id_uq
        UNIQUE (segment_id, item_id),
    CONSTRAINT segment_id_item_id_location_node_id_uq
        UNIQUE (segment_id, item_id, location_node_id),
    CONSTRAINT segment_code_ck CHECK (btrim(code) <> ''),
    CONSTRAINT segment_status_ck CHECK (btrim(status) <> ''),
    CONSTRAINT segment_valid_range_ck
        CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT segment_not_self_parent_ck
        CHECK (parent_segment_id IS NULL OR parent_segment_id <> segment_id)
);

CREATE TABLE core.event (
    event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    package_id bigint NOT NULL,
    item_id bigint NULL,
    segment_id bigint NULL,
    location_node_id bigint NULL,
    event_type text NOT NULL,
    business_date date NOT NULL,
    occurred_at_utc timestamptz NOT NULL,
    effective_from date NOT NULL,
    effective_to date NULL,
    source_system text NULL,
    payload_jsonb jsonb NULL,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT event_package_id_fk
        FOREIGN KEY (package_id)
        REFERENCES core.package (package_id),
    CONSTRAINT event_item_id_fk
        FOREIGN KEY (item_id)
        REFERENCES core.item (item_id),
    CONSTRAINT event_location_node_id_fk
        FOREIGN KEY (location_node_id)
        REFERENCES core.location_node (location_node_id),
    CONSTRAINT event_segment_id_item_id_fk
        FOREIGN KEY (segment_id, item_id)
        REFERENCES core.segment (segment_id, item_id),
    CONSTRAINT event_event_type_ck CHECK (btrim(event_type) <> ''),
    CONSTRAINT event_source_system_ck
        CHECK (source_system IS NULL OR btrim(source_system) <> ''),
    CONSTRAINT event_scope_presence_ck
        CHECK (
            item_id IS NOT NULL
            OR segment_id IS NOT NULL
            OR location_node_id IS NOT NULL
        ),
    CONSTRAINT event_segment_requires_item_ck
        CHECK (segment_id IS NULL OR item_id IS NOT NULL),
    CONSTRAINT event_valid_range_ck
        CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE core.scenario (
    scenario_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    technical_name text NOT NULL,
    scenario_kind text NOT NULL,
    parent_scenario_id bigint NULL,
    is_official_flag boolean NOT NULL DEFAULT false,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT scenario_parent_scenario_id_fk
        FOREIGN KEY (parent_scenario_id)
        REFERENCES core.scenario (scenario_id),
    CONSTRAINT scenario_technical_name_uq UNIQUE (technical_name),
    CONSTRAINT scenario_technical_name_ck CHECK (btrim(technical_name) <> ''),
    CONSTRAINT scenario_kind_ck CHECK (btrim(scenario_kind) <> ''),
    CONSTRAINT scenario_not_self_parent_ck
        CHECK (
            parent_scenario_id IS NULL
            OR parent_scenario_id <> scenario_id
        )
);

CREATE TABLE core.calc_version (
    calc_version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    engine_version text NOT NULL,
    rule_bundle_version text NOT NULL,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT calc_version_engine_rule_bundle_uq
        UNIQUE (engine_version, rule_bundle_version),
    CONSTRAINT calc_version_engine_version_ck
        CHECK (btrim(engine_version) <> ''),
    CONSTRAINT calc_version_rule_bundle_version_ck
        CHECK (btrim(rule_bundle_version) <> '')
);

CREATE TABLE meta.attribute (
    attribute_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    package_id bigint NOT NULL,
    technical_name text NOT NULL,
    display_name text NOT NULL,
    value_type text NOT NULL,
    business_role text NOT NULL,
    grain_kind text NOT NULL,
    aggregation_rule text NOT NULL,
    unit_code text NULL,
    precision_scale integer NULL,
    panel_visible_flag boolean NOT NULL DEFAULT true,
    audit_required_flag boolean NOT NULL DEFAULT true,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attribute_package_id_fk
        FOREIGN KEY (package_id)
        REFERENCES core.package (package_id),
    CONSTRAINT attribute_package_technical_name_uq
        UNIQUE (package_id, technical_name),
    CONSTRAINT attribute_technical_name_ck CHECK (btrim(technical_name) <> ''),
    CONSTRAINT attribute_display_name_ck CHECK (btrim(display_name) <> ''),
    CONSTRAINT attribute_value_type_ck CHECK (btrim(value_type) <> ''),
    CONSTRAINT attribute_business_role_ck CHECK (btrim(business_role) <> ''),
    CONSTRAINT attribute_grain_kind_ck CHECK (btrim(grain_kind) <> ''),
    CONSTRAINT attribute_aggregation_rule_ck CHECK (btrim(aggregation_rule) <> ''),
    CONSTRAINT attribute_unit_code_ck
        CHECK (unit_code IS NULL OR btrim(unit_code) <> ''),
    CONSTRAINT attribute_precision_scale_ck
        CHECK (precision_scale IS NULL OR precision_scale BETWEEN 0 AND 12)
);

CREATE TABLE fact.daily_measure_fact (
    fact_date date NOT NULL,
    daily_measure_fact_id bigint GENERATED ALWAYS AS IDENTITY,
    item_id bigint NOT NULL,
    segment_id bigint NOT NULL,
    location_node_id bigint NOT NULL,
    attribute_id bigint NOT NULL,
    scenario_id bigint NOT NULL,
    calc_version_id bigint NOT NULL,
    measure_value numeric(18, 6) NOT NULL,
    unit_code text NOT NULL,
    created_at_utc timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT daily_measure_fact_pk
        PRIMARY KEY (fact_date, daily_measure_fact_id),
    CONSTRAINT daily_measure_fact_segment_scope_fk
        FOREIGN KEY (segment_id, item_id, location_node_id)
        REFERENCES core.segment (segment_id, item_id, location_node_id),
    CONSTRAINT daily_measure_fact_attribute_id_fk
        FOREIGN KEY (attribute_id)
        REFERENCES meta.attribute (attribute_id),
    CONSTRAINT daily_measure_fact_scenario_id_fk
        FOREIGN KEY (scenario_id)
        REFERENCES core.scenario (scenario_id),
    CONSTRAINT daily_measure_fact_calc_version_id_fk
        FOREIGN KEY (calc_version_id)
        REFERENCES core.calc_version (calc_version_id),
    CONSTRAINT daily_measure_fact_natural_uq
        UNIQUE (
            fact_date,
            segment_id,
            attribute_id,
            scenario_id,
            calc_version_id
        ),
    CONSTRAINT daily_measure_fact_unit_code_ck CHECK (btrim(unit_code) <> '')
) PARTITION BY RANGE (fact_date);

CREATE TABLE fact.daily_measure_fact_default
    PARTITION OF fact.daily_measure_fact DEFAULT;

CREATE INDEX entity_kind_package_id_idx
    ON core.entity_kind (package_id);

CREATE INDEX location_node_parent_location_node_id_idx
    ON core.location_node (parent_location_node_id);

CREATE INDEX item_entity_kind_id_idx
    ON core.item (entity_kind_id);

CREATE INDEX item_location_node_id_idx
    ON core.item (location_node_id);

CREATE INDEX segment_item_id_idx
    ON core.segment (item_id);

CREATE INDEX segment_location_node_id_idx
    ON core.segment (location_node_id);

CREATE INDEX segment_parent_segment_id_idx
    ON core.segment (parent_segment_id);

CREATE INDEX event_package_id_idx
    ON core.event (package_id);

CREATE INDEX event_business_date_idx
    ON core.event (business_date);

CREATE INDEX event_item_id_idx
    ON core.event (item_id);

CREATE INDEX event_segment_id_idx
    ON core.event (segment_id);

CREATE INDEX event_location_node_id_idx
    ON core.event (location_node_id);

CREATE INDEX attribute_package_id_idx
    ON meta.attribute (package_id);

CREATE INDEX daily_measure_fact_attribute_scenario_date_idx
    ON fact.daily_measure_fact (attribute_id, scenario_id, fact_date);

CREATE INDEX daily_measure_fact_segment_date_idx
    ON fact.daily_measure_fact (segment_id, fact_date);

CREATE INDEX daily_measure_fact_item_date_idx
    ON fact.daily_measure_fact (item_id, fact_date);

CREATE INDEX daily_measure_fact_location_date_idx
    ON fact.daily_measure_fact (location_node_id, fact_date);

COMMENT ON SCHEMA core IS
    'Núcleo estrutural compartilhado entre os pacotes de domínio.';

COMMENT ON SCHEMA meta IS
    'Camada de metadado governado para atributos configuráveis.';

COMMENT ON SCHEMA fact IS
    'Camada oficial de fatos diários materializados.';

COMMENT ON TABLE fact.daily_measure_fact IS
    'Tabela oficial de fatos numéricos diários. O segmento é obrigatório nesta modelagem inicial.';

COMMENT ON COLUMN core.event.payload_jsonb IS
    'Payload flexível de origem, mantido apenas para detalhe de evento que não substitui colunas estruturais.';

COMMENT ON COLUMN fact.daily_measure_fact.fact_date IS
    'Chave de partição e grão oficial de negócio para derivações analíticas.';

COMMIT;
