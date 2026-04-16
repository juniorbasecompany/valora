# API REST do domínio de regras por escopo (field, action, formula, label, event, input, result).

from __future__ import annotations

import logging
import re
from collections import defaultdict
from itertools import groupby
from decimal import Decimal, ROUND_HALF_UP
from datetime import UTC, date, datetime, timedelta
from typing import Any, Annotated, Literal, Self, TypeAlias

import requests
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field as PydanticField, model_validator
from sqlalchemy import Date, asc, cast, func, or_, select, text, true
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from valora_backend.auth.dependencies import get_current_member
from valora_backend.auth.service import ADMIN_ROLE, MASTER_ROLE
from valora_backend.db import get_session
from valora_backend.model.identity import Item, Location, Member, Scope, Unity
from valora_backend.model.rules import (
    Action,
    Event,
    Field,
    Formula,
    Input,
    Label,
    Result,
)
from valora_backend.api.auth import (
    _apply_member_audit_context,
    _get_scope_unity_or_404,
    _normalize_expression_for_search,
    _query_term_expression_for_search,
)
from valora_backend.config import Settings
from valora_backend.model.null_if_empty import commit_session_with_null_if_empty
from valora_backend.rules.field_sql_formula import (
    FieldSqlFormulaKind,
    classify_field_sql_type,
    coerce_formula_result_to_temporal,
    default_temporal_runtime,
    normalize_sql_type,
    parse_temporal_input_string,
    parse_temporal_result_text,
    serialize_temporal_for_storage,
)
from valora_backend.rules.formula_simple_eval import build_formula_simple_eval
from valora_backend.rules.formula_statement_validate import (
    FormulaStatementValidationError,
    parse_formula_statement,
    validate_formula_statement_for_scope,
)
from valora_backend.services.deepl_label_translation import (
    FIELD_LABEL_LANG_LIST,
    normalize_deepl_api_key,
    resolve_deepl_api_base_url,
    translate_text_deepl,
)

router = APIRouter(prefix="/auth/tenant/current", tags=["scope-rules"])

FormulaRuntimePrimitive: TypeAlias = str | bool | int | float | date | datetime


def _result_execution_calendar_date_sql_expr(session: Session):
    """Data de execução do resultado: date(creation_utc) + age (mesma convenção da migração)."""
    if session.get_bind().dialect.name == "postgresql":
        return cast(Unity.creation_utc, Date) + Result.age
    return text(
        "date(unity.creation_utc, '+' || CAST(result.age AS TEXT) || ' days')"
    )


def _field_sql_formula_kind_or_400(sql_type: str) -> FieldSqlFormulaKind:
    try:
        return classify_field_sql_type(sql_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


def _normalize_optional_result_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _numeric_scale_from_sql_type(sql_type: str) -> int | None:
    normalized = normalize_sql_type(sql_type)
    match = re.fullmatch(r"(?:NUMERIC|DECIMAL)\(\s*\d+\s*,\s*(\d+)\s*\)", normalized)
    if not match:
        return None
    return int(match.group(1))


def _quantize_numeric_value_for_field(value: Decimal, *, field: Field) -> Decimal:
    scale = _numeric_scale_from_sql_type(field.type)
    if scale is None:
        return value
    quantizer = Decimal("1").scaleb(-scale)
    return value.quantize(quantizer, rounding=ROUND_HALF_UP)


def _parse_boolean_value_or_400(value: Any, *, detail: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float, Decimal)):
        if value in (0, 0.0, Decimal("0")):
            return False
        if value in (1, 1.0, Decimal("1")):
            return True
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "t", "1", "yes", "y", "sim", "s"}:
            return True
        if normalized in {"false", "f", "0", "no", "n", "nao", "não"}:
            return False
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=detail,
    )


def _parse_integer_value_or_400(value: Any, *, detail: str) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, Decimal):
        whole_value = value.to_integral_value()
        if value != whole_value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            )
        return int(whole_value)
    if isinstance(value, float):
        if not value.is_integer():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            )
        return int(value)
    if isinstance(value, str):
        try:
            return _parse_integer_value_or_400(Decimal(value.strip()), detail=detail)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            ) from exc
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=detail,
    )


def _parse_numeric_value_or_400(value: Any, *, detail: str) -> Decimal:
    if isinstance(value, bool):
        return Decimal(int(value))
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, str):
        try:
            return Decimal(value.strip())
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            ) from exc
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=detail,
    )


def _coerce_input_runtime_value_or_400(
    field: Field, value: str, *, event_id: int
) -> FormulaRuntimePrimitive:
    detail = f"Event {event_id} has an invalid input for field {field.id}"
    kind = _field_sql_formula_kind_or_400(field.type)
    if kind.family == "text":
        return value.strip()
    if kind.family == "boolean":
        return _parse_boolean_value_or_400(value, detail=detail)
    if kind.family == "integer":
        return _parse_integer_value_or_400(value, detail=detail)
    if kind.family == "temporal":
        assert kind.temporal_kind is not None
        try:
            return parse_temporal_input_string(value, kind.temporal_kind)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            ) from None
    numeric_value = _parse_numeric_value_or_400(value, detail=detail)
    return float(numeric_value)


def _extract_result_runtime_value_or_none(
    row: Result, field: Field, *, event_id: int
) -> FormulaRuntimePrimitive | None:
    kind = _field_sql_formula_kind_or_400(field.type)
    if kind.family == "text":
        return row.text_value
    if kind.family == "boolean":
        return row.boolean_value
    if kind.family == "temporal":
        assert kind.temporal_kind is not None
        return parse_temporal_result_text(row.text_value, kind.temporal_kind)
    if row.numeric_value is None:
        return None
    if kind.family == "integer":
        return _parse_integer_value_or_400(
            row.numeric_value,
            detail=f"Event {event_id} has a non-integer result for field {field.id}",
        )
    return float(
        _parse_numeric_value_or_400(
            row.numeric_value,
            detail=f"Event {event_id} has an invalid numeric result for field {field.id}",
        )
    )


def _default_runtime_value_for_field(field: Field) -> FormulaRuntimePrimitive:
    kind = _field_sql_formula_kind_or_400(field.type)
    if kind.family == "text":
        return ""
    if kind.family == "boolean":
        return False
    if kind.family == "integer":
        return 0
    if kind.family == "temporal":
        assert kind.temporal_kind is not None
        return default_temporal_runtime(kind.temporal_kind)
    return 0.0


def _coerce_formula_output_to_result_payload_or_400(
    value: Any,
    *,
    field: Field,
    event_id: int,
    formula_id: int,
    formula_order: int,
) -> dict[str, Any]:
    detail_prefix = (
        f"Event {event_id} formula {formula_id} (sort_order {formula_order}) "
        f"returned an invalid value for field {field.id}"
    )
    kind = _field_sql_formula_kind_or_400(field.type)
    if kind.family == "text":
        text_value = _normalize_optional_result_text(str(value))
        return {
            "text_value": text_value,
            "boolean_value": None,
            "numeric_value": None,
            "runtime_value": text_value,
        }
    if kind.family == "boolean":
        boolean_value = _parse_boolean_value_or_400(value, detail=detail_prefix)
        return {
            "text_value": None,
            "boolean_value": boolean_value,
            "numeric_value": None,
            "runtime_value": boolean_value,
        }
    if kind.family == "temporal":
        assert kind.temporal_kind is not None
        try:
            runtime = coerce_formula_result_to_temporal(value, kind.temporal_kind)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{detail_prefix}: {exc}",
            ) from exc
        text_value = serialize_temporal_for_storage(runtime, kind.temporal_kind)
        return {
            "text_value": text_value,
            "boolean_value": None,
            "numeric_value": None,
            "runtime_value": runtime,
        }
    if kind.family == "integer":
        integer_value = _parse_integer_value_or_400(value, detail=detail_prefix)
        return {
            "text_value": None,
            "boolean_value": None,
            "numeric_value": Decimal(integer_value),
            "runtime_value": integer_value,
        }
    numeric_value = _quantize_numeric_value_for_field(
        _parse_numeric_value_or_400(value, detail=detail_prefix),
        field=field,
    )
    return {
        "text_value": None,
        "boolean_value": None,
        "numeric_value": numeric_value,
        "runtime_value": float(numeric_value),
    }


def _member_can_edit_scope_rules(member: Member) -> bool:
    return member.role in (MASTER_ROLE, ADMIN_ROLE)


def _require_scope_rules_editor(member: Member) -> None:
    if not _member_can_edit_scope_rules(member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this operation",
        )


def _get_tenant_scope(session: Session, *, actor: Member, scope_id: int) -> Scope:
    target = session.get(Scope, scope_id)
    if not target or target.tenant_id != actor.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scope not found for current tenant",
        )
    return target


def _field_in_scope_or_404(
    session: Session, *, scope_id: int, field_id: int
) -> Field:
    row = session.get(Field, field_id)
    if not row or row.scope_id != scope_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Field not found for current scope",
        )
    return row


def _action_in_scope_or_404(
    session: Session, *, scope_id: int, action_id: int
) -> Action:
    row = session.get(Action, action_id)
    if not row or row.scope_id != scope_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action not found for current scope",
        )
    return row


def _formula_statement_validation_error(
    exc: FormulaStatementValidationError,
    *,
    formula_sort_order: int | None = None,
) -> HTTPException:
    detail: dict[str, str | int] = {"code": exc.code, "message": exc.message}
    if formula_sort_order is not None:
        detail["sort_order"] = formula_sort_order
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def _formula_in_action_or_404(
    session: Session, *, action_id: int, formula_id: int
) -> Formula:
    row = session.get(Formula, formula_id)
    if not row or row.action_id != action_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Formula not found for this action",
        )
    return row


def _input_field_id_set_for_action(session: Session, *, action_id: int) -> set[int]:
    """União dos `field_id` referenciados como `${input:id}` em todas as fórmulas da ação."""
    rows = list(
        session.scalars(select(Formula).where(Formula.action_id == action_id))
    )
    result: set[int] = set()
    for r in rows:
        parsed = parse_formula_statement(r.statement)
        result |= parsed.input_id_in_rhs
    return result


def _delete_scope_event_inputs_for_removed_input_field_refs(
    session: Session,
    *,
    action_id: int,
    removed_input_field_id_set: set[int],
) -> None:
    """Remove linhas em `input` para eventos desta ação quando o `field_id` deixa de ser referido."""
    if not removed_input_field_id_set:
        return
    session.execute(
        delete(Input).where(
            Input.field_id.in_(removed_input_field_id_set),
            Input.event_id.in_(select(Event.id).where(Event.action_id == action_id)),
        )
    )


def _field_is_referenced_by_scope_formula(
    session: Session, *, scope_id: int, field_id: int
) -> bool:
    field_token = f"${{field:{field_id}}}"
    input_token = f"${{input:{field_id}}}"
    return session.scalar(
        select(Formula.id)
        .join(Action, Formula.action_id == Action.id)
        .where(
            Action.scope_id == scope_id,
            or_(
                Formula.statement.contains(field_token),
                Formula.statement.contains(input_token),
            ),
        )
        .limit(1)
    ) is not None


def _location_in_scope_or_404(
    session: Session, *, scope_id: int, location_id: int
) -> Location:
    row = session.get(Location, location_id)
    if not row or row.scope_id != scope_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found for current scope",
        )
    return row


def _expand_scope_location_id_list_with_descendants(
    session: Session, *, scope_id: int, location_id_list: list[int]
) -> list[int]:
    """Cada id selecionado vira ele próprio mais todos os descendentes no escopo."""
    if not location_id_list:
        return []
    rows = list(
        session.execute(
            select(Location.id, Location.parent_location_id).where(
                Location.scope_id == scope_id
            )
        )
    )
    children_by_parent: defaultdict[int | None, list[int]] = defaultdict(list)
    for loc_id, parent_id in rows:
        children_by_parent[parent_id].append(loc_id)
    expanded: set[int] = set()
    stack = list(location_id_list)
    while stack:
        current = stack.pop()
        if current in expanded:
            continue
        expanded.add(current)
        stack.extend(children_by_parent.get(current, ()))
    return list(expanded)


def _expand_scope_item_id_list_with_descendants(
    session: Session, *, scope_id: int, item_id_list: list[int]
) -> list[int]:
    """Cada id selecionado vira ele próprio mais todos os itens descendentes no escopo."""
    if not item_id_list:
        return []
    rows = list(
        session.execute(
            select(Item.id, Item.parent_item_id).where(Item.scope_id == scope_id)
        )
    )
    children_by_parent: defaultdict[int | None, list[int]] = defaultdict(list)
    for item_row_id, parent_id in rows:
        children_by_parent[parent_id].append(item_row_id)
    expanded: set[int] = set()
    stack = list(item_id_list)
    while stack:
        current = stack.pop()
        if current in expanded:
            continue
        expanded.add(current)
        stack.extend(children_by_parent.get(current, ()))
    return list(expanded)


def _item_in_scope_or_404(
    session: Session, *, scope_id: int, item_id: int
) -> Item:
    row = session.get(Item, item_id)
    if not row or row.scope_id != scope_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found for current scope",
        )
    return row


def _current_age_event_filter_predicates_for_scope_event_query(
    session: Session,
    *,
    scope_id: int,
    unity_id: int | None,
    location_id: int | None,
    item_id: int | None,
) -> list[Any]:
    """Valida filtros opcionais e devolve predicados SQLAlchemy para restringir Event (idade atual)."""
    predicates: list[Any] = []
    if unity_id is not None:
        _get_scope_unity_or_404(session, scope_id=scope_id, unity_id=unity_id)
        predicates.append(Event.unity_id == unity_id)
    if location_id is not None:
        _location_in_scope_or_404(session, scope_id=scope_id, location_id=location_id)
        expanded_location_id_list = _expand_scope_location_id_list_with_descendants(
            session, scope_id=scope_id, location_id_list=[location_id]
        )
        predicates.append(Event.location_id.in_(expanded_location_id_list))
    if item_id is not None:
        _item_in_scope_or_404(session, scope_id=scope_id, item_id=item_id)
        expanded_item_id_list = _expand_scope_item_id_list_with_descendants(
            session, scope_id=scope_id, item_id_list=[item_id]
        )
        predicates.append(Event.item_id.in_(expanded_item_id_list))
    return predicates


def _event_in_scope_or_404(
    session: Session, *, scope_id: int, event_id: int
) -> Event:
    row = session.get(Event, event_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )
    action = session.get(Action, row.action_id)
    if not action or action.scope_id != scope_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found for current scope",
        )
    return row


def _input_in_event_or_404(
    session: Session, *, event_id: int, input_id: int
) -> Input:
    row = session.get(Input, input_id)
    if not row or row.event_id != event_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Input not found for this event",
        )
    return row


def _result_in_event_or_404(
    session: Session, *, event_id: int, result_id: int
) -> Result:
    row = session.get(Result, result_id)
    if not row or row.event_id != event_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result not found for this event",
        )
    return row


def _label_in_scope_or_404(
    session: Session, *, scope_id: int, label_id: int
) -> Label:
    row = session.get(Label, label_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Label not found",
        )
    if row.field_id is not None:
        field = session.get(Field, row.field_id)
        if not field or field.scope_id != scope_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Label not found for current scope",
            )
    elif row.action_id is not None:
        action = session.get(Action, row.action_id)
        if not action or action.scope_id != scope_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Label not found for current scope",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Label not found for current scope",
        )
    return row


def _upsert_field_label_by_lang(
    session: Session,
    *,
    field_id: int,
    lang: str,
    name: str | None,
) -> None:
    """Atualiza ou cria `label` para o campo e idioma. Texto vazio após strip remove o registro."""
    if name is None:
        return
    stripped = name.strip()
    existing = session.scalar(
        select(Label).where(Label.field_id == field_id, Label.lang == lang)
    )
    if not stripped:
        if existing is not None:
            session.delete(existing)
        return
    if existing is not None:
        existing.name = stripped
        session.add(existing)
        return
    session.add(
        Label(lang=lang, name=stripped, field_id=field_id, action_id=None)
    )


def _fill_other_field_labels_via_deepl(
    session: Session,
    *,
    field_id: int,
    source_lang: str,
    source_text: str,
) -> None:
    """Preenche rótulos nas outras línguas via DeepL; ignora sem chave ou se um idioma falhar."""
    settings = Settings()
    key_secret = settings.deepl_api_key
    if key_secret is None:
        return
    stripped = source_text.strip()
    if not stripped:
        return
    api_key = normalize_deepl_api_key(key_secret.get_secret_value())
    if not api_key:
        return
    base = resolve_deepl_api_base_url(
        configured_url=settings.deepl_api_base_url,
        api_key=api_key,
    ).rstrip("/")
    log = logging.getLogger(__name__)
    for target_lang in FIELD_LABEL_LANG_LIST:
        if target_lang == source_lang:
            continue
        try:
            translated, _ = translate_text_deepl(
                text=stripped,
                source_app_lang=source_lang,
                target_app_lang=target_lang,
                api_key=api_key,
                base_url=base,
            )
        except (requests.RequestException, ValueError) as exc:
            extra = ""
            if isinstance(exc, requests.HTTPError) and exc.response is not None:
                extra = f" response={exc.response.text[:400]!r}"
            log.warning(
                "DeepL translation failed for field_id=%s target_lang=%s base_url=%s: %s%s",
                field_id,
                target_lang,
                base,
                exc,
                extra,
            )
            continue
        if translated:
            _upsert_field_label_by_lang(
                session,
                field_id=field_id,
                lang=target_lang,
                name=translated,
            )


def _upsert_action_label_by_lang(
    session: Session,
    *,
    action_id: int,
    lang: str,
    name: str | None,
) -> None:
    """Atualiza ou cria `label` para a ação e idioma. Texto vazio após strip remove o registro."""
    if name is None:
        return
    stripped = name.strip()
    existing = session.scalar(
        select(Label).where(Label.action_id == action_id, Label.lang == lang)
    )
    if not stripped:
        if existing is not None:
            session.delete(existing)
        return
    if existing is not None:
        existing.name = stripped
        session.add(existing)
        return
    session.add(
        Label(lang=lang, name=stripped, field_id=None, action_id=action_id)
    )


def _fill_other_action_labels_via_deepl(
    session: Session,
    *,
    action_id: int,
    source_lang: str,
    source_text: str,
) -> None:
    """Preenche rótulos nas outras línguas via DeepL; ignora sem chave ou se um idioma falhar."""
    settings = Settings()
    key_secret = settings.deepl_api_key
    if key_secret is None:
        return
    stripped = source_text.strip()
    if not stripped:
        return
    api_key = normalize_deepl_api_key(key_secret.get_secret_value())
    if not api_key:
        return
    base = resolve_deepl_api_base_url(
        configured_url=settings.deepl_api_base_url,
        api_key=api_key,
    ).rstrip("/")
    log = logging.getLogger(__name__)
    for target_lang in FIELD_LABEL_LANG_LIST:
        if target_lang == source_lang:
            continue
        try:
            translated, _ = translate_text_deepl(
                text=stripped,
                source_app_lang=source_lang,
                target_app_lang=target_lang,
                api_key=api_key,
                base_url=base,
            )
        except (requests.RequestException, ValueError) as exc:
            extra = ""
            if isinstance(exc, requests.HTTPError) and exc.response is not None:
                extra = f" response={exc.response.text[:400]!r}"
            log.warning(
                "DeepL translation failed for action_id=%s target_lang=%s base_url=%s: %s%s",
                action_id,
                target_lang,
                base,
                exc,
                extra,
            )
            continue
        if translated:
            _upsert_action_label_by_lang(
                session,
                action_id=action_id,
                lang=target_lang,
                name=translated,
            )


# --- field ---


def _resequence_fields_in_scope(session: Session, *, scope_id: int) -> None:
    rows = list(
        session.scalars(
            select(Field)
            .where(Field.scope_id == scope_id)
            .order_by(Field.sort_order, Field.id)
        )
    )
    for index, row in enumerate(rows):
        row.sort_order = index


def _resequence_actions_in_scope(session: Session, *, scope_id: int) -> None:
    rows = list(
        session.scalars(
            select(Action)
            .where(Action.scope_id == scope_id)
            .order_by(Action.sort_order, Action.id)
        )
    )
    for index, row in enumerate(rows):
        row.sort_order = index


def _next_field_sort_order(session: Session, *, scope_id: int) -> int:
    current_max = session.scalar(
        select(func.coalesce(func.max(Field.sort_order), -1)).where(
            Field.scope_id == scope_id
        )
    )
    return int(current_max) + 1


def _next_action_sort_order(session: Session, *, scope_id: int) -> int:
    current_max = session.scalar(
        select(func.coalesce(func.max(Action.sort_order), -1)).where(
            Action.scope_id == scope_id
        )
    )
    return int(current_max) + 1


class ScopeFieldRecord(BaseModel):
    id: int
    scope_id: int
    sql_type: str
    sort_order: int
    is_initial_age: bool
    is_final_age: bool
    is_current_age: bool
    label_id: int | None = None
    label_name: str | None = None


class ScopeFieldListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeFieldRecord]


class ScopeFieldCreateRequest(BaseModel):
    sql_type: str = PydanticField(min_length=1, max_length=2048)
    is_initial_age: bool = False
    is_final_age: bool = False
    is_current_age: bool = False
    label_lang: Literal["pt-BR", "en", "es"] | None = None
    label_name: str | None = PydanticField(default=None, max_length=2048)

    @model_validator(mode="after")
    def label_lang_when_name_sent(self) -> ScopeFieldCreateRequest:
        if self.label_name is not None and self.label_lang is None:
            raise ValueError("label_lang is required when label_name is provided")
        if self.is_initial_age and self.is_final_age:
            raise ValueError("field cannot be both initial_age and final_age")
        return self


class ScopeFieldPatchRequest(BaseModel):
    sql_type: str | None = PydanticField(default=None, min_length=1, max_length=2048)
    is_initial_age: bool | None = None
    is_final_age: bool | None = None
    is_current_age: bool | None = None
    label_lang: Literal["pt-BR", "en", "es"] | None = None
    label_name: str | None = PydanticField(default=None, max_length=2048)

    @model_validator(mode="after")
    def label_lang_when_name_sent_patch(self) -> ScopeFieldPatchRequest:
        if self.label_name is not None and self.label_lang is None:
            raise ValueError("label_lang is required when label_name is provided")
        if self.is_initial_age is True and self.is_final_age is True:
            raise ValueError("field cannot be both initial_age and final_age")
        return self


def _ensure_field_age_flag_availability(
    session: Session,
    *,
    scope_id: int,
    field_id: int | None,
    is_initial_age: bool,
    is_final_age: bool,
    is_current_age: bool,
) -> None:
    if is_initial_age:
        initial_owner_id = session.scalar(
            select(Field.id)
            .where(
                Field.scope_id == scope_id,
                Field.is_initial_age.is_(True),
                Field.id != field_id if field_id is not None else true(),
            )
            .limit(1)
        )
        if initial_owner_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another field in this scope is already marked as initial age",
            )

    if is_final_age:
        final_owner_id = session.scalar(
            select(Field.id)
            .where(
                Field.scope_id == scope_id,
                Field.is_final_age.is_(True),
                Field.id != field_id if field_id is not None else true(),
            )
            .limit(1)
        )
        if final_owner_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another field in this scope is already marked as final age",
            )

    if is_current_age:
        current_owner_id = session.scalar(
            select(Field.id)
            .where(
                Field.scope_id == scope_id,
                Field.is_current_age.is_(True),
                Field.id != field_id if field_id is not None else true(),
            )
            .limit(1)
        )
        if current_owner_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another field in this scope is already marked as current age",
            )


@router.get(
    "/scopes/{scope_id}/fields",
    response_model=ScopeFieldListResponse,
)
def list_scope_fields(
    scope_id: int,
    label_lang: Annotated[
        Literal["pt-BR", "en", "es"] | None,
        Query(),
    ] = None,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
    q: Annotated[str | None, Query()] = None,
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    field_query = select(Field).where(Field.scope_id == scope_id)
    query_term_expression = _query_term_expression_for_search(q)
    if query_term_expression is not None:
            if label_lang is None:
                field_query = field_query.where(
                    _normalize_expression_for_search(Field.type).contains(
                        query_term_expression
                    )
                )
            else:
                label_match_exists = (
                    select(Label.id)
                    .where(
                        Label.field_id == Field.id,
                        Label.lang == label_lang,
                        _normalize_expression_for_search(Label.name).contains(
                            query_term_expression
                        ),
                    )
                    .exists()
                )
                field_query = field_query.where(
                    or_(
                        _normalize_expression_for_search(Field.type).contains(
                            query_term_expression
                        ),
                        label_match_exists,
                    )
                )

    rows = list(
        session.scalars(
            field_query.order_by(Field.sort_order, Field.id)
        )
    )
    label_by_field_id: dict[int, Label] = {}
    if label_lang is not None and rows:
        field_id_list = [r.id for r in rows]
        label_rows = list(
            session.scalars(
                select(Label).where(
                    Label.field_id.in_(field_id_list),
                    Label.lang == label_lang,
                )
            )
        )
        for label_row in label_rows:
            if label_row.field_id is not None:
                label_by_field_id[label_row.field_id] = label_row

    item_list: list[ScopeFieldRecord] = []
    for r in rows:
        pair = label_by_field_id.get(r.id) if label_lang is not None else None
        item_list.append(
            ScopeFieldRecord(
                id=r.id,
                scope_id=r.scope_id,
                sql_type=r.type,
                sort_order=r.sort_order,
                is_initial_age=r.is_initial_age,
                is_final_age=r.is_final_age,
                is_current_age=r.is_current_age,
                label_id=pair.id if pair is not None else None,
                label_name=pair.name if pair is not None else None,
            )
        )

    return ScopeFieldListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=item_list,
    )


@router.post(
    "/scopes/{scope_id}/fields",
    response_model=ScopeFieldListResponse,
    status_code=status.HTTP_200_OK,
)
def create_scope_field(
    scope_id: int,
    body: ScopeFieldCreateRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = Field(
        scope_id=scope_id,
        type=body.sql_type.strip(),
        sort_order=_next_field_sort_order(session, scope_id=scope_id),
        is_initial_age=body.is_initial_age,
        is_final_age=body.is_final_age,
        is_current_age=body.is_current_age,
    )
    _ensure_field_age_flag_availability(
        session,
        scope_id=scope_id,
        field_id=None,
        is_initial_age=body.is_initial_age,
        is_final_age=body.is_final_age,
        is_current_age=body.is_current_age,
    )
    session.add(row)
    session.flush()
    if body.label_lang is not None and body.label_name is not None:
        _upsert_field_label_by_lang(
            session,
            field_id=row.id,
            lang=body.label_lang,
            name=body.label_name,
        )
        _fill_other_field_labels_via_deepl(
            session,
            field_id=row.id,
            source_lang=body.label_lang,
            source_text=body.label_name,
        )
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_fields(scope_id, body.label_lang, member, session, None)


@router.get(
    "/scopes/{scope_id}/fields/{field_id}",
    response_model=ScopeFieldRecord,
)
def get_scope_field(
    scope_id: int,
    field_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _field_in_scope_or_404(session, scope_id=scope_id, field_id=field_id)
    return ScopeFieldRecord(
        id=row.id,
        scope_id=row.scope_id,
        sql_type=row.type,
        sort_order=row.sort_order,
        is_initial_age=row.is_initial_age,
        is_final_age=row.is_final_age,
        is_current_age=row.is_current_age,
    )


@router.patch(
    "/scopes/{scope_id}/fields/{field_id}",
    response_model=ScopeFieldListResponse,
)
def patch_scope_field(
    scope_id: int,
    field_id: int,
    body: ScopeFieldPatchRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _field_in_scope_or_404(session, scope_id=scope_id, field_id=field_id)
    next_is_initial_age = (
        body.is_initial_age
        if body.is_initial_age is not None
        else row.is_initial_age
    )
    next_is_final_age = (
        body.is_final_age
        if body.is_final_age is not None
        else row.is_final_age
    )
    next_is_current_age = (
        body.is_current_age
        if body.is_current_age is not None
        else row.is_current_age
    )
    if next_is_initial_age and next_is_final_age:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field cannot be both initial age and final age",
        )
    _ensure_field_age_flag_availability(
        session,
        scope_id=scope_id,
        field_id=row.id,
        is_initial_age=next_is_initial_age,
        is_final_age=next_is_final_age,
        is_current_age=next_is_current_age,
    )
    if body.sql_type is not None:
        row.type = body.sql_type.strip()
    if body.is_initial_age is not None:
        row.is_initial_age = body.is_initial_age
    if body.is_final_age is not None:
        row.is_final_age = body.is_final_age
    if body.is_current_age is not None:
        row.is_current_age = body.is_current_age
    session.add(row)
    if body.label_lang is not None and body.label_name is not None:
        _upsert_field_label_by_lang(
            session,
            field_id=row.id,
            lang=body.label_lang,
            name=body.label_name,
        )
        _fill_other_field_labels_via_deepl(
            session,
            field_id=row.id,
            source_lang=body.label_lang,
            source_text=body.label_name,
        )
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_fields(scope_id, body.label_lang, member, session, None)


@router.delete(
    "/scopes/{scope_id}/fields/{field_id}",
    response_model=ScopeFieldListResponse,
)
def delete_scope_field(
    scope_id: int,
    field_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _field_in_scope_or_404(session, scope_id=scope_id, field_id=field_id)
    if _field_is_referenced_by_scope_formula(
        session, scope_id=scope_id, field_id=row.id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete field while formulas reference it",
        )
    if session.scalar(select(Input.id).where(Input.field_id == row.id).limit(1)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete field while inputs reference it",
        )
    if session.scalar(select(Result.id).where(Result.field_id == row.id).limit(1)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete field while results reference it",
        )
    session.delete(row)
    session.flush()
    _resequence_fields_in_scope(session, scope_id=scope_id)
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_fields(scope_id, None, member, session, None)


class ScopeFieldReorderRequest(BaseModel):
    field_id_list: list[int]


@router.post(
    "/scopes/{scope_id}/fields/reorder",
    response_model=ScopeFieldListResponse,
)
def reorder_scope_fields(
    scope_id: int,
    body: ScopeFieldReorderRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
    label_lang: Annotated[
        Literal["pt-BR", "en", "es"] | None,
        Query(),
    ] = None,
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    expected_id_set = set(
        session.scalars(select(Field.id).where(Field.scope_id == scope_id)).all()
    )
    received = body.field_id_list
    if len(received) != len(expected_id_set) or set(received) != expected_id_set:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="field_id_list must list every field in this scope exactly once",
        )
    for index, fid in enumerate(received):
        row = session.get(Field, fid)
        if row is None or row.scope_id != scope_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid field id in reorder list",
            )
        row.sort_order = index
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_fields(scope_id, label_lang, member, session, None)


# --- action ---


class ScopeActionRecord(BaseModel):
    id: int
    scope_id: int
    sort_order: int
    is_recurrent: bool
    label_id: int | None = None
    label_name: str | None = None


class ScopeActionListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeActionRecord]


class ScopeActionCreateRequest(BaseModel):
    is_recurrent: bool = False
    label_lang: Literal["pt-BR", "en", "es"] | None = None
    label_name: str | None = PydanticField(default=None, max_length=2048)

    @model_validator(mode="after")
    def label_lang_when_name_sent(self) -> ScopeActionCreateRequest:
        if self.label_name is not None and self.label_lang is None:
            raise ValueError("label_lang is required when label_name is provided")
        return self


class ScopeActionPatchRequest(BaseModel):
    is_recurrent: bool | None = None
    label_lang: Literal["pt-BR", "en", "es"] | None = None
    label_name: str | None = PydanticField(default=None, max_length=2048)

    @model_validator(mode="after")
    def label_lang_when_name_sent_patch(self) -> ScopeActionPatchRequest:
        if self.label_name is not None and self.label_lang is None:
            raise ValueError("label_lang is required when label_name is provided")
        return self


@router.get(
    "/scopes/{scope_id}/actions",
    response_model=ScopeActionListResponse,
)
def list_scope_actions(
    scope_id: int,
    label_lang: Annotated[
        Literal["pt-BR", "en", "es"] | None,
        Query(),
    ] = None,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
    q: Annotated[str | None, Query()] = None,
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    action_query = select(Action).where(Action.scope_id == scope_id)
    query_term_expression = _query_term_expression_for_search(q)
    if query_term_expression is not None:
            if label_lang is None:
                action_query = action_query.where(text("1=0"))
            else:
                label_match_exists = (
                    select(Label.id)
                    .where(
                        Label.action_id == Action.id,
                        Label.lang == label_lang,
                        _normalize_expression_for_search(Label.name).contains(
                            query_term_expression
                        ),
                    )
                    .exists()
                )
                action_query = action_query.where(label_match_exists)

    rows = list(
        session.scalars(
            action_query.order_by(Action.sort_order, Action.id)
        )
    )
    label_by_action_id: dict[int, Label] = {}
    if label_lang is not None and rows:
        action_id_list = [r.id for r in rows]
        label_rows = list(
            session.scalars(
                select(Label).where(
                    Label.action_id.in_(action_id_list),
                    Label.lang == label_lang,
                )
            )
        )
        for label_row in label_rows:
            if label_row.action_id is not None:
                label_by_action_id[label_row.action_id] = label_row

    item_list: list[ScopeActionRecord] = []
    for r in rows:
        pair = label_by_action_id.get(r.id) if label_lang is not None else None
        item_list.append(
            ScopeActionRecord(
                id=r.id,
                scope_id=r.scope_id,
                sort_order=r.sort_order,
                is_recurrent=r.is_recurrent,
                label_id=pair.id if pair is not None else None,
                label_name=pair.name if pair is not None else None,
            )
        )

    return ScopeActionListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=item_list,
    )


@router.post(
    "/scopes/{scope_id}/actions",
    response_model=ScopeActionListResponse,
)
def create_scope_action(
    scope_id: int,
    body: ScopeActionCreateRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = Action(
        scope_id=scope_id,
        sort_order=_next_action_sort_order(session, scope_id=scope_id),
        is_recurrent=body.is_recurrent,
    )
    session.add(row)
    session.flush()
    if body.label_lang is not None and body.label_name is not None:
        _upsert_action_label_by_lang(
            session,
            action_id=row.id,
            lang=body.label_lang,
            name=body.label_name,
        )
        _fill_other_action_labels_via_deepl(
            session,
            action_id=row.id,
            source_lang=body.label_lang,
            source_text=body.label_name,
        )
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_actions(scope_id, body.label_lang, member, session, None)


@router.get(
    "/scopes/{scope_id}/actions/{action_id}",
    response_model=ScopeActionRecord,
)
def get_scope_action(
    scope_id: int,
    action_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
    return ScopeActionRecord(
        id=row.id,
        scope_id=row.scope_id,
        sort_order=row.sort_order,
        is_recurrent=row.is_recurrent,
    )


@router.patch(
    "/scopes/{scope_id}/actions/{action_id}",
    response_model=ScopeActionListResponse,
)
def patch_scope_action(
    scope_id: int,
    action_id: int,
    body: ScopeActionPatchRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
    if body.is_recurrent is not None:
        row.is_recurrent = body.is_recurrent
    if body.label_lang is not None and body.label_name is not None:
        _upsert_action_label_by_lang(
            session,
            action_id=row.id,
            lang=body.label_lang,
            name=body.label_name,
        )
        _fill_other_action_labels_via_deepl(
            session,
            action_id=row.id,
            source_lang=body.label_lang,
            source_text=body.label_name,
        )
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_actions(scope_id, body.label_lang, member, session, None)


@router.delete(
    "/scopes/{scope_id}/actions/{action_id}",
    response_model=ScopeActionListResponse,
)
def delete_scope_action(
    scope_id: int,
    action_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
    if session.scalar(select(Event.id).where(Event.action_id == row.id).limit(1)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete action while events reference it",
        )
    session.delete(row)
    session.flush()
    _resequence_actions_in_scope(session, scope_id=scope_id)
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_actions(scope_id, None, member, session, None)


class ScopeActionReorderRequest(BaseModel):
    action_id_list: list[int]


@router.post(
    "/scopes/{scope_id}/actions/reorder",
    response_model=ScopeActionListResponse,
)
def reorder_scope_actions(
    scope_id: int,
    body: ScopeActionReorderRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
    label_lang: Annotated[
        Literal["pt-BR", "en", "es"] | None,
        Query(),
    ] = None,
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    expected_id_set = set(
        session.scalars(select(Action.id).where(Action.scope_id == scope_id)).all()
    )
    received = body.action_id_list
    if len(received) != len(expected_id_set) or set(received) != expected_id_set:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="action_id_list must list every action in this scope exactly once",
        )
    for index, aid in enumerate(received):
        row = session.get(Action, aid)
        if row is None or row.scope_id != scope_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid action id in reorder list",
            )
        row.sort_order = index
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_actions(scope_id, label_lang, member, session, None)


# --- formula ---


class ScopeFormulaRecord(BaseModel):
    id: int
    action_id: int
    sort_order: int
    statement: str


class ScopeFormulaListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeFormulaRecord]


class ScopeFormulaCreateRequest(BaseModel):
    sort_order: int
    statement: str = PydanticField(min_length=1, max_length=65535)


class ScopeFormulaPatchRequest(BaseModel):
    sort_order: int | None = None
    statement: str | None = PydanticField(default=None, min_length=1, max_length=65535)


@router.get(
    "/scopes/{scope_id}/actions/{action_id}/formulas",
    response_model=ScopeFormulaListResponse,
)
def list_scope_action_formulas(
    scope_id: int,
    action_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
    rows = list(
        session.scalars(
            select(Formula)
            .where(Formula.action_id == action_id)
            .order_by(Formula.sort_order, Formula.id)
        )
    )
    return ScopeFormulaListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeFormulaRecord(
                id=r.id,
                action_id=r.action_id,
                sort_order=r.sort_order,
                statement=r.statement,
            )
            for r in rows
        ],
    )


@router.post(
    "/scopes/{scope_id}/actions/{action_id}/formulas",
    response_model=ScopeFormulaListResponse,
)
def create_scope_action_formula(
    scope_id: int,
    action_id: int,
    body: ScopeFormulaCreateRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
    try:
        validate_formula_statement_for_scope(
            session,
            scope_id=scope_id,
            statement=body.statement.strip(),
        )
    except FormulaStatementValidationError as exc:
        raise _formula_statement_validation_error(
            exc, formula_sort_order=body.sort_order
        ) from None
    row = Formula(
        action_id=action_id,
        sort_order=body.sort_order,
        statement=body.statement.strip(),
    )
    session.add(row)
    _apply_member_audit_context(session, member)
    try:
        commit_session_with_null_if_empty(session)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate sort_order for this action or invalid data",
        ) from exc
    return list_scope_action_formulas(scope_id, action_id, member, session)


@router.patch(
    "/scopes/{scope_id}/actions/{action_id}/formulas/{formula_id}",
    response_model=ScopeFormulaListResponse,
)
def patch_scope_action_formula(
    scope_id: int,
    action_id: int,
    formula_id: int,
    body: ScopeFormulaPatchRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
    row = _formula_in_action_or_404(session, action_id=action_id, formula_id=formula_id)
    old_input_field_id_set: set[int] | None = None
    if body.statement is not None:
        old_input_field_id_set = _input_field_id_set_for_action(session, action_id=action_id)
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    if body.statement is not None:
        try:
            validate_formula_statement_for_scope(
                session,
                scope_id=scope_id,
                statement=body.statement.strip(),
            )
        except FormulaStatementValidationError as exc:
            effective_sort = (
                body.sort_order
                if body.sort_order is not None
                else row.sort_order
            )
            raise _formula_statement_validation_error(
                exc, formula_sort_order=effective_sort
            ) from None
        row.statement = body.statement.strip()
    session.add(row)
    if old_input_field_id_set is not None:
        session.flush()
        new_input_field_id_set = _input_field_id_set_for_action(
            session, action_id=action_id
        )
        removed = old_input_field_id_set - new_input_field_id_set
        _delete_scope_event_inputs_for_removed_input_field_refs(
            session,
            action_id=action_id,
            removed_input_field_id_set=removed,
        )
    _apply_member_audit_context(session, member)
    try:
        commit_session_with_null_if_empty(session)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate sort_order for this action or invalid data",
        ) from exc
    return list_scope_action_formulas(scope_id, action_id, member, session)


@router.delete(
    "/scopes/{scope_id}/actions/{action_id}/formulas/{formula_id}",
    response_model=ScopeFormulaListResponse,
)
def delete_scope_action_formula(
    scope_id: int,
    action_id: int,
    formula_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
    row = _formula_in_action_or_404(session, action_id=action_id, formula_id=formula_id)
    old_input_field_id_set = _input_field_id_set_for_action(session, action_id=action_id)
    session.delete(row)
    session.flush()
    new_input_field_id_set = _input_field_id_set_for_action(session, action_id=action_id)
    removed = old_input_field_id_set - new_input_field_id_set
    _delete_scope_event_inputs_for_removed_input_field_refs(
        session,
        action_id=action_id,
        removed_input_field_id_set=removed,
    )
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_action_formulas(scope_id, action_id, member, session)


# --- label ---


class ScopeLabelRecord(BaseModel):
    id: int
    lang: str
    name: str
    field_id: int | None
    action_id: int | None


class ScopeLabelListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeLabelRecord]


class ScopeLabelCreateRequest(BaseModel):
    lang: Literal["pt-BR", "en", "es"]
    name: str = PydanticField(min_length=1, max_length=2048)
    field_id: int | None = None
    action_id: int | None = None

    @model_validator(mode="after")
    def xor_target(self) -> ScopeLabelCreateRequest:
        f, a = self.field_id, self.action_id
        if (f is None) == (a is None):
            raise ValueError("Informe exatamente um entre field_id e action_id")
        return self


class ScopeLabelPatchRequest(BaseModel):
    lang: Literal["pt-BR", "en", "es"] | None = None
    name: str | None = PydanticField(default=None, min_length=1, max_length=2048)
    field_id: int | None = None
    action_id: int | None = None

    @model_validator(mode="after")
    def xor_if_both_set(self) -> ScopeLabelPatchRequest:
        if self.field_id is not None and self.action_id is not None:
            raise ValueError("Informe no máximo um entre field_id e action_id")
        return self


@router.get(
    "/scopes/{scope_id}/labels",
    response_model=ScopeLabelListResponse,
)
def list_scope_labels(
    scope_id: int,
    field_id: Annotated[int | None, Query()] = None,
    action_id: Annotated[int | None, Query()] = None,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    if field_id is not None:
        _field_in_scope_or_404(session, scope_id=scope_id, field_id=field_id)
        q = select(Label).where(Label.field_id == field_id)
    elif action_id is not None:
        _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
        q = select(Label).where(Label.action_id == action_id)
    else:
        field_id_subq = select(Field.id).where(Field.scope_id == scope_id)
        action_id_subq = select(Action.id).where(Action.scope_id == scope_id)
        q = select(Label).where(
            or_(
                Label.field_id.in_(field_id_subq),
                Label.action_id.in_(action_id_subq),
            )
        )
    rows = list(session.scalars(q.order_by(Label.id)))
    return ScopeLabelListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeLabelRecord(
                id=r.id,
                lang=r.lang,
                name=r.name,
                field_id=r.field_id,
                action_id=r.action_id,
            )
            for r in rows
        ],
    )


@router.post(
    "/scopes/{scope_id}/labels",
    response_model=ScopeLabelListResponse,
)
def create_scope_label(
    scope_id: int,
    body: ScopeLabelCreateRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    if body.field_id is not None:
        _field_in_scope_or_404(session, scope_id=scope_id, field_id=body.field_id)
    else:
        _action_in_scope_or_404(session, scope_id=scope_id, action_id=body.action_id)  # type: ignore[arg-type]
    row = Label(
        lang=body.lang,
        name=body.name.strip(),
        field_id=body.field_id,
        action_id=body.action_id,
    )
    session.add(row)
    _apply_member_audit_context(session, member)
    try:
        commit_session_with_null_if_empty(session)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate label for this language and target",
        ) from exc
    return list_scope_labels(scope_id, None, None, member, session)


@router.patch(
    "/scopes/{scope_id}/labels/{label_id}",
    response_model=ScopeLabelListResponse,
)
def patch_scope_label(
    scope_id: int,
    label_id: int,
    body: ScopeLabelPatchRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _label_in_scope_or_404(session, scope_id=scope_id, label_id=label_id)
    if body.lang is not None:
        row.lang = body.lang
    if body.name is not None:
        row.name = body.name.strip()
    if body.field_id is not None or body.action_id is not None:
        if body.field_id is not None and body.action_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Informe no máximo um entre field_id e action_id",
            )
        if body.field_id is not None:
            _field_in_scope_or_404(session, scope_id=scope_id, field_id=body.field_id)
            row.field_id = body.field_id
            row.action_id = None
        elif body.action_id is not None:
            _action_in_scope_or_404(
                session, scope_id=scope_id, action_id=body.action_id
            )
            row.action_id = body.action_id
            row.field_id = None
    session.add(row)
    _apply_member_audit_context(session, member)
    try:
        commit_session_with_null_if_empty(session)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate label for this language and target",
        ) from exc
    return list_scope_labels(scope_id, None, None, member, session)


@router.delete(
    "/scopes/{scope_id}/labels/{label_id}",
    response_model=ScopeLabelListResponse,
)
def delete_scope_label(
    scope_id: int,
    label_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _label_in_scope_or_404(session, scope_id=scope_id, label_id=label_id)
    session.delete(row)
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_labels(scope_id, None, None, member, session)


# --- event ---

# Mesmo separador que `UI_TEXT_SEPARATOR` no painel de eventos (frontend).
_EVENT_INPUT_SUMMARY_SEPARATOR = "\u00a0\u00a0●\u00a0\u00a0"


def _event_input_summary_by_event_id(
    session: Session,
    *,
    event_id_list: list[int],
    label_lang: Literal["pt-BR", "en", "es"],
) -> dict[int, str | None]:
    """Monta o texto de resumo dos inputs por evento (rótulo de campo + valor)."""
    if not event_id_list:
        return {}
    input_rows = list(
        session.scalars(
            select(Input)
            .where(Input.event_id.in_(event_id_list))
            .order_by(Input.event_id, Input.id)
        )
    )
    if not input_rows:
        return {eid: None for eid in event_id_list}

    field_id_set = {row.field_id for row in input_rows}
    label_rows = list(
        session.scalars(
            select(Label).where(
                Label.field_id.in_(field_id_set),
                Label.lang == label_lang,
            )
        )
    )
    label_by_field_id: dict[int, str] = {}
    for label_row in label_rows:
        if label_row.field_id is not None:
            label_by_field_id[label_row.field_id] = label_row.name

    segments_by_event: dict[int, list[str]] = defaultdict(list)
    for inp in input_rows:
        value_stripped = inp.value.strip()
        if not value_stripped:
            continue
        label = label_by_field_id.get(inp.field_id) or f"#{inp.field_id}"
        segments_by_event[inp.event_id].append(f"{label}: {value_stripped}")

    result: dict[int, str | None] = {}
    for eid in event_id_list:
        segments = segments_by_event.get(eid)
        if not segments:
            result[eid] = None
        else:
            result[eid] = _EVENT_INPUT_SUMMARY_SEPARATOR.join(segments)
    return result


class ScopeEventRecord(BaseModel):
    id: int
    unity_id: int | None = None
    location_id: int
    item_id: int
    action_id: int
    age: int
    input_summary: str | None = None


class ScopeEventListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeEventRecord]


class ScopeEventCreateRequest(BaseModel):
    location_id: int
    item_id: int
    action_id: int
    age: int = PydanticField(ge=0)
    unity_id: int | None = None


class ScopeEventPatchRequest(BaseModel):
    location_id: int | None = None
    item_id: int | None = None
    action_id: int | None = None
    age: int | None = PydanticField(default=None, ge=0)
    unity_id: int | None = None


class ScopeCurrentAgeCalculationRequest(BaseModel):
    unity_id: int | None = None
    location_id: int | None = None
    item_id: int | None = None


class ScopeCurrentAgeCalculationRecord(BaseModel):
    event_id: int
    result_id: int
    field_id: int
    formula_id: int
    formula_order: int
    location_id: int
    item_id: int
    action_id: int
    event_age: int
    result_age: int
    text_value: str | None
    boolean_value: bool | None
    numeric_value: Decimal | None
    status: Literal["created", "updated", "unchanged"]


ScopeCurrentAgeCalculationEmptyReason = Literal[
    "no_events_in_scope",
    "no_eligible_window",
    "no_results_after_calculation",
    "no_persisted_results",
    "no_results_to_delete",
]


class ScopeCurrentAgeCalculationResponse(BaseModel):
    can_edit: bool
    calculated_moment_utc: datetime
    created_count: int
    updated_count: int
    unchanged_count: int
    empty_reason: ScopeCurrentAgeCalculationEmptyReason | None = None
    item_list: list[ScopeCurrentAgeCalculationRecord]


def _build_current_age_response_from_result_rows(
    *,
    calculated_moment_utc: datetime,
    result_row_list: list[
        tuple[Result, Event, Literal["created", "updated", "unchanged"] | None]
    ],
) -> ScopeCurrentAgeCalculationResponse:
    created_count = 0
    updated_count = 0
    unchanged_count = 0
    item_list: list[ScopeCurrentAgeCalculationRecord] = []
    for result_row, event_row, item_status_or_none in result_row_list:
        item_status = item_status_or_none or "unchanged"
        if item_status == "created":
            created_count += 1
        elif item_status == "updated":
            updated_count += 1
        else:
            unchanged_count += 1
        item_list.append(
            ScopeCurrentAgeCalculationRecord(
                event_id=event_row.id,
                result_id=result_row.id,
                field_id=result_row.field_id,
                formula_id=result_row.formula_id,
                formula_order=result_row.formula_order,
                location_id=event_row.location_id,
                item_id=event_row.item_id,
                action_id=event_row.action_id,
                event_age=event_row.age,
                result_age=result_row.age,
                text_value=result_row.text_value,
                boolean_value=result_row.boolean_value,
                numeric_value=result_row.numeric_value,
                status=item_status,
            )
        )
    return ScopeCurrentAgeCalculationResponse(
        can_edit=True,
        calculated_moment_utc=calculated_moment_utc,
        created_count=created_count,
        updated_count=updated_count,
        unchanged_count=unchanged_count,
        empty_reason=None,
        item_list=item_list,
    )


def _list_scope_current_age_results(
    *,
    scope_id: int,
    unity_id: int | None,
    location_id: int | None,
    item_id: int | None,
    session: Session,
) -> ScopeCurrentAgeCalculationResponse:
    event_predicates = _current_age_event_filter_predicates_for_scope_event_query(
        session,
        scope_id=scope_id,
        unity_id=unity_id,
        location_id=location_id,
        item_id=item_id,
    )
    query = (
        select(Result, Event)
        .join(Event, Result.event_id == Event.id)
        .join(Unity, Result.unity_id == Unity.id)
        .join(Action, Event.action_id == Action.id)
        .where(
            Action.scope_id == scope_id,
            *event_predicates,
        )
    )
    exec_date_expr = _result_execution_calendar_date_sql_expr(session)
    result_row_list = list(
        session.execute(
            query.order_by(
                asc(exec_date_expr),
                Action.sort_order.asc(),
                Event.age.asc(),
                Event.id.asc(),
                Result.formula_order.asc(),
                Result.id.asc(),
            )
        )
    )
    return _build_current_age_response_from_result_rows(
        calculated_moment_utc=datetime.now(UTC).replace(tzinfo=None),
        result_row_list=[(result_row, event_row, None) for result_row, event_row in result_row_list],
    ) if result_row_list else ScopeCurrentAgeCalculationResponse(
        can_edit=True,
        calculated_moment_utc=datetime.now(UTC).replace(tzinfo=None),
        created_count=0,
        updated_count=0,
        unchanged_count=0,
        empty_reason="no_persisted_results",
        item_list=[],
    )


def _resolve_scope_age_fields_or_400(
    session: Session, *, scope_id: int
) -> tuple[Field, Field, Field]:
    field_list = list(
        session.scalars(select(Field).where(Field.scope_id == scope_id).order_by(Field.id))
    )
    initial_field = next((row for row in field_list if row.is_initial_age), None)
    final_field = next((row for row in field_list if row.is_final_age), None)
    current_field = next((row for row in field_list if row.is_current_age), None)

    if initial_field is None or final_field is None or current_field is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Current age calculation requires one initial age field, "
                "one final age field, and one current age field in this scope"
            ),
        )

    return initial_field, final_field, current_field


def _normalize_whole_age_or_400(
    value: Decimal | None, *, event_id: int, age_role: str
) -> int | None:
    if value is None:
        return None
    whole_value = value.to_integral_value()
    if value != whole_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Event {event_id} has a non-integer {age_role} age value; "
                "current age calculation only supports whole days"
            ),
        )
    return int(whole_value)


def _normalize_whole_age_runtime_or_400(
    value: Any | None, *, event_id: int, age_role: str
) -> int | None:
    if value is None:
        return None
    return _parse_integer_value_or_400(
        value,
        detail=(
            f"Event {event_id} has a non-integer {age_role} age value; "
            "current age calculation only supports whole days"
        ),
    )


def _event_execution_sort_key(
    *,
    event_calendar_day: date,
    action_sort_order: int,
    event_id: int,
) -> tuple[date, int, int]:
    return (event_calendar_day, action_sort_order, event_id)


def _build_window_meta_by_event_id(
    *,
    event_row_list: list[Event],
    initial_age_by_event_id: dict[int, int],
    final_age_by_event_id: dict[int, int],
) -> dict[int, dict[str, int]]:
    # Uma janela de idade por unidade (lote): estado único por unity_id.
    event_row_list_by_group: defaultdict[int, list[Event]] = defaultdict(list)
    for row in event_row_list:
        if row.unity_id is None:
            continue
        event_row_list_by_group[row.unity_id].append(row)

    window_meta_by_event_id: dict[int, dict[str, int]] = {}
    for group_event_row_list in event_row_list_by_group.values():
        active_initial_index: int | None = None
        active_initial_event_id: int | None = None
        active_initial_age: int | None = None
        active_window: dict[str, int] | None = None

        for index, row in enumerate(group_event_row_list):
            next_initial_age = initial_age_by_event_id.get(row.id)
            if next_initial_age is not None:
                active_initial_index = index
                active_initial_event_id = row.id
                active_initial_age = next_initial_age
                active_window = None

            final_age = final_age_by_event_id.get(row.id)
            if final_age is not None:
                if (
                    active_initial_index is not None
                    and active_initial_event_id is not None
                    and active_initial_age is not None
                ):
                    active_window = {
                        "source_initial_event_id": active_initial_event_id,
                        "source_initial_age": active_initial_age,
                        "source_final_event_id": row.id,
                        "source_final_age": final_age,
                    }
                    candidate_row_list = group_event_row_list[active_initial_index : index + 1]
                    active_initial_index = None
                    active_initial_event_id = None
                    active_initial_age = None
                elif active_window is not None:
                    active_window = {
                        **active_window,
                        "source_final_event_id": row.id,
                        "source_final_age": final_age,
                    }
                    candidate_row_list = [row]
                else:
                    candidate_row_list = []

                for candidate in candidate_row_list:
                    previous_assignment = window_meta_by_event_id.get(candidate.id)
                    if previous_assignment is not None and previous_assignment != active_window:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Event {candidate.id} belongs to overlapping age windows with different bounds"
                            ),
                        )
                    if active_window is not None:
                        window_meta_by_event_id[candidate.id] = active_window
                if active_window is not None:
                    continue

            if active_window is not None:
                previous_assignment = window_meta_by_event_id.get(row.id)
                if previous_assignment is not None and previous_assignment != active_window:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Event {row.id} belongs to overlapping age windows with different bounds"
                        ),
                    )
                window_meta_by_event_id[row.id] = active_window

    return window_meta_by_event_id


def _build_execution_occurrence_list(
    *,
    event_row_list: list[Event],
    action_by_id: dict[int, Action],
    window_meta_by_event_id: dict[int, dict[str, int]],
    unity_by_id: dict[int, Unity],
    current_age_action_id_set: set[int],
) -> list[dict[str, Any]]:
    occurrence_list: list[dict[str, Any]] = []
    event_row_list_by_group: defaultdict[int, list[Event]] = defaultdict(list)
    for row in event_row_list:
        if row.unity_id is None:
            continue
        event_row_list_by_group[row.unity_id].append(row)

    next_same_action_day_by_event_id: dict[int, date | None] = {}
    for group_event_row_list in event_row_list_by_group.values():
        next_day_by_action_id: dict[int, date] = {}
        for row in reversed(group_event_row_list):
            unity = unity_by_id.get(row.unity_id) if row.unity_id else None
            if unity is None:
                continue
            creation_day = unity.creation_utc.date()
            row_day = creation_day + timedelta(days=row.age)
            next_same_action_day_by_event_id[row.id] = next_day_by_action_id.get(row.action_id)
            next_day_by_action_id[row.action_id] = row_day

    for row in event_row_list:
        if row.id not in window_meta_by_event_id:
            continue
        if row.unity_id is None:
            continue
        window_meta = window_meta_by_event_id[row.id]
        unity = unity_by_id.get(row.unity_id)
        if unity is None:
            continue
        creation_day = unity.creation_utc.date()
        source_final_age = window_meta["source_final_age"]
        period_end_day = creation_day + timedelta(days=source_final_age)
        action_row = action_by_id[row.action_id]
        event_day = creation_day + timedelta(days=row.age)
        occurrence_list.append(
            {
                "source_event": row,
                "execution_day": event_day,
                "current_age_action_priority": 0 if row.action_id in current_age_action_id_set else 1,
                "action_sort_order": action_row.sort_order,
                "is_actual_event_day": True,
            }
        )
        if not action_row.is_recurrent:
            continue
        next_same_action_day = next_same_action_day_by_event_id.get(row.id)
        recurrence_last_day = period_end_day
        if next_same_action_day is not None:
            recurrence_last_day = min(
                recurrence_last_day,
                next_same_action_day - timedelta(days=1),
            )
        next_execution_day = event_day + timedelta(days=1)
        while next_execution_day <= recurrence_last_day:
            occurrence_list.append(
                {
                    "source_event": row,
                    "execution_day": next_execution_day,
                    "current_age_action_priority": 0 if row.action_id in current_age_action_id_set else 1,
                    "action_sort_order": action_row.sort_order,
                    "is_actual_event_day": False,
                }
            )
            next_execution_day += timedelta(days=1)

    # Ordena primeiro por action_sort_order para respeitar a sequência configurada no escopo
    # (ex.: mortalidade antes do incremento da idade no mesmo dia). A prioridade de fórmulas
    # que atualizam o campo de idade atual só desempata entre ações com o mesmo sort_order.
    occurrence_list.sort(
        key=lambda item: (
            item["source_event"].unity_id or 0,
            item["execution_day"],
            item["action_sort_order"],
            item["current_age_action_priority"],
            item["source_event"].id,
        )
    )
    return occurrence_list


def _current_age_occurrence_unity_day_key(occurrence: dict[str, Any]) -> tuple[int, date]:
    """Chave para agrupar ocorrências por unidade e dia civil (fecho da janela ao fim do dia)."""
    row = occurrence["source_event"]
    uid = row.unity_id
    if uid is None:
        return (0, occurrence["execution_day"])
    return (uid, occurrence["execution_day"])


@router.get(
    "/scopes/{scope_id}/events",
    response_model=ScopeEventListResponse,
)
def list_scope_events(
    scope_id: int,
    age_from: Annotated[int | None, Query(ge=0)] = None,
    age_to: Annotated[int | None, Query(ge=0)] = None,
    location_id: Annotated[list[int] | None, Query()] = None,
    item_id: Annotated[list[int] | None, Query()] = None,
    action_id: Annotated[int | None, Query()] = None,
    event_kind: Annotated[
        Literal["standard", "fact"] | None,
        Query(
            description=(
                "Filtra eventos-padrão (standard, sem unity_id) ou fatos "
                "(fact, com unity_id). Omitido: lista mista."
            ),
        ),
    ] = None,
    label_lang: Annotated[
        Literal["pt-BR", "en", "es"],
        Query(description="Idioma dos rotulos no resumo de inputs por evento."),
    ] = "pt-BR",
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    # Chamadas diretas a esta funcao (ex.: apos POST/PATCH evento) nao passam por Depends;
    # sem normalizar, `label_lang` pode ser o objeto Query() em vez da string.
    if label_lang not in ("pt-BR", "en", "es"):
        label_lang = "pt-BR"

    location_id_list = location_id or []
    item_id_list = item_id or []

    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    if age_from is not None and age_to is not None and age_from > age_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid event age range",
        )
    for location_id_item in location_id_list:
        _location_in_scope_or_404(
            session, scope_id=scope_id, location_id=location_id_item
        )
    for item_id_item in item_id_list:
        _item_in_scope_or_404(session, scope_id=scope_id, item_id=item_id_item)
    if action_id is not None:
        _action_in_scope_or_404(session, scope_id=scope_id, action_id=action_id)
    action_id_list = list(
        session.scalars(select(Action.id).where(Action.scope_id == scope_id))
    )
    if not action_id_list:
        return ScopeEventListResponse(
            can_edit=_member_can_edit_scope_rules(member),
            item_list=[],
        )
    query = select(Event).where(Event.action_id.in_(action_id_list))
    if event_kind == "standard":
        query = query.where(Event.unity_id.is_(None))
    elif event_kind == "fact":
        query = query.where(Event.unity_id.isnot(None))
    if age_from is not None:
        query = query.where(Event.age >= age_from)
    if age_to is not None:
        query = query.where(Event.age <= age_to)
    if location_id_list:
        expanded_location_id_list = _expand_scope_location_id_list_with_descendants(
            session, scope_id=scope_id, location_id_list=location_id_list
        )
        query = query.where(Event.location_id.in_(expanded_location_id_list))
    if item_id_list:
        expanded_item_id_list = _expand_scope_item_id_list_with_descendants(
            session, scope_id=scope_id, item_id_list=item_id_list
        )
        query = query.where(Event.item_id.in_(expanded_item_id_list))
    if action_id is not None:
        query = query.where(Event.action_id == action_id)
    rows = list(session.scalars(query.order_by(Event.age.asc(), Event.id.asc())))
    summary_by_event_id = _event_input_summary_by_event_id(
        session,
        event_id_list=[r.id for r in rows],
        label_lang=label_lang,
    )
    return ScopeEventListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeEventRecord(
                id=r.id,
                unity_id=r.unity_id,
                location_id=r.location_id,
                item_id=r.item_id,
                action_id=r.action_id,
                age=r.age,
                input_summary=summary_by_event_id.get(r.id),
            )
            for r in rows
        ],
    )


@router.post(
    "/scopes/{scope_id}/events",
    response_model=ScopeEventListResponse,
)
def create_scope_event(
    scope_id: int,
    body: ScopeEventCreateRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    _location_in_scope_or_404(session, scope_id=scope_id, location_id=body.location_id)
    _item_in_scope_or_404(session, scope_id=scope_id, item_id=body.item_id)
    action = _action_in_scope_or_404(
        session, scope_id=scope_id, action_id=body.action_id
    )
    is_standard = body.unity_id is None
    if not is_standard:
        _get_scope_unity_or_404(session, scope_id=scope_id, unity_id=body.unity_id)
    row = Event(
        unity_id=body.unity_id,
        location_id=body.location_id,
        item_id=body.item_id,
        action_id=action.id,
        age=body.age,
    )
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_events(
        scope_id=scope_id,
        age_from=None,
        age_to=None,
        location_id=None,
        item_id=None,
        action_id=None,
        event_kind=("standard" if is_standard else "fact"),
        label_lang="pt-BR",
        member=member,
        session=session,
    )


@router.patch(
    "/scopes/{scope_id}/events/{event_id}",
    response_model=ScopeEventListResponse,
)
def patch_scope_event(
    scope_id: int,
    event_id: int,
    body: ScopeEventPatchRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    if body.location_id is not None:
        _location_in_scope_or_404(
            session, scope_id=scope_id, location_id=body.location_id
        )
        row.location_id = body.location_id
    if body.item_id is not None:
        _item_in_scope_or_404(session, scope_id=scope_id, item_id=body.item_id)
        row.item_id = body.item_id
    if body.action_id is not None:
        _action_in_scope_or_404(session, scope_id=scope_id, action_id=body.action_id)
        row.action_id = body.action_id
    if "unity_id" in body.model_fields_set:
        row.unity_id = body.unity_id
        if body.unity_id is not None:
            _get_scope_unity_or_404(
                session, scope_id=scope_id, unity_id=body.unity_id
            )
    if "age" in body.model_fields_set and body.age is not None:
        row.age = body.age
    if row.unity_id is not None:
        _get_scope_unity_or_404(session, scope_id=scope_id, unity_id=row.unity_id)
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_events(
        scope_id=scope_id,
        age_from=None,
        age_to=None,
        location_id=None,
        item_id=None,
        action_id=None,
        event_kind=("standard" if row.unity_id is None else "fact"),
        label_lang="pt-BR",
        member=member,
        session=session,
    )


@router.delete(
    "/scopes/{scope_id}/events/{event_id}",
    response_model=ScopeEventListResponse,
)
def delete_scope_event(
    scope_id: int,
    event_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    event_kind_for_list: Literal["standard", "fact"] = (
        "standard" if row.unity_id is None else "fact"
    )
    if session.scalar(select(Result.id).where(Result.event_id == row.id).limit(1)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete event while results reference it",
        )
    session.delete(row)
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_events(
        scope_id=scope_id,
        age_from=None,
        age_to=None,
        location_id=None,
        item_id=None,
        action_id=None,
        event_kind=event_kind_for_list,
        label_lang="pt-BR",
        member=member,
        session=session,
    )


@router.post(
    "/scopes/{scope_id}/events/read-current-age",
    response_model=ScopeCurrentAgeCalculationResponse,
)
def read_scope_current_age(
    scope_id: int,
    body: ScopeCurrentAgeCalculationRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)

    return _list_scope_current_age_results(
        scope_id=scope_id,
        unity_id=body.unity_id,
        location_id=body.location_id,
        item_id=body.item_id,
        session=session,
    )


@router.post(
    "/scopes/{scope_id}/events/delete-current-age",
    response_model=ScopeCurrentAgeCalculationResponse,
)
def delete_scope_current_age(
    scope_id: int,
    body: ScopeCurrentAgeCalculationRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)

    event_predicates = _current_age_event_filter_predicates_for_scope_event_query(
        session,
        scope_id=scope_id,
        unity_id=body.unity_id,
        location_id=body.location_id,
        item_id=body.item_id,
    )
    event_id_list = list(
        session.scalars(
            select(Event.id)
            .join(Action, Event.action_id == Action.id)
            .where(
                Action.scope_id == scope_id,
                *event_predicates,
            )
        )
    )
    calculated_moment_utc = datetime.now(UTC).replace(tzinfo=None)
    if not event_id_list:
        return ScopeCurrentAgeCalculationResponse(
            can_edit=True,
            calculated_moment_utc=calculated_moment_utc,
            created_count=0,
            updated_count=0,
            unchanged_count=0,
            empty_reason="no_results_to_delete",
            item_list=[],
        )

    _apply_member_audit_context(session, member)
    result_id_subq = select(Result.id).where(Result.event_id.in_(event_id_list))
    deleted_result = session.execute(delete(Result).where(Result.id.in_(result_id_subq)))

    if (deleted_result.rowcount or 0) > 0:
        _apply_member_audit_context(session, member)
        commit_session_with_null_if_empty(session)

    return ScopeCurrentAgeCalculationResponse(
        can_edit=True,
        calculated_moment_utc=calculated_moment_utc,
        created_count=0,
        updated_count=0,
        unchanged_count=0,
        empty_reason="no_results_to_delete",
        item_list=[],
    )


@router.post(
    "/scopes/{scope_id}/events/calculate-current-age",
    response_model=ScopeCurrentAgeCalculationResponse,
)
def calculate_scope_current_age(
    scope_id: int,
    body: ScopeCurrentAgeCalculationRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)

    event_predicates = _current_age_event_filter_predicates_for_scope_event_query(
        session,
        scope_id=scope_id,
        unity_id=body.unity_id,
        location_id=body.location_id,
        item_id=body.item_id,
    )

    initial_field, final_field, current_field = _resolve_scope_age_fields_or_400(
        session, scope_id=scope_id
    )
    action_row_list = list(
        session.scalars(select(Action).where(Action.scope_id == scope_id).order_by(Action.id))
    )
    action_by_id = {row.id: row for row in action_row_list}
    field_row_list = list(
        session.scalars(select(Field).where(Field.scope_id == scope_id).order_by(Field.id))
    )
    field_by_id = {row.id: row for row in field_row_list}

    # Apenas fatos (unity_id preenchido); idade na linha do evento (`event.age`).
    event_row_list_raw = list(
        session.scalars(
            select(Event)
            .join(Action, Event.action_id == Action.id)
            .where(
                Action.scope_id == scope_id,
                Event.unity_id.isnot(None),
                *event_predicates,
            )
        )
    )
    unity_id_set_for_sort = {
        row.unity_id for row in event_row_list_raw if row.unity_id is not None
    }
    unity_by_id = {
        u.id: u
        for u in session.scalars(select(Unity).where(Unity.id.in_(unity_id_set_for_sort)))
    }

    def _fact_calendar_day(row: Event) -> date:
        if row.unity_id is None:
            return date.min
        u = unity_by_id.get(row.unity_id)
        if u is None:
            return date.min
        return u.creation_utc.date() + timedelta(days=row.age)

    event_row_list = sorted(
        event_row_list_raw,
        key=lambda row: _event_execution_sort_key(
            event_calendar_day=_fact_calendar_day(row),
            action_sort_order=action_by_id[row.action_id].sort_order,
            event_id=row.id,
        ),
    )
    calculated_moment_utc = datetime.now(UTC).replace(tzinfo=None)
    if not event_row_list:
        return ScopeCurrentAgeCalculationResponse(
            can_edit=True,
            calculated_moment_utc=calculated_moment_utc,
            created_count=0,
            updated_count=0,
            unchanged_count=0,
            empty_reason="no_events_in_scope",
            item_list=[],
        )

    event_id_list = [row.id for row in event_row_list]
    formula_row_list = list(
        session.scalars(
            select(Formula)
            .where(Formula.action_id.in_({row.action_id for row in event_row_list}))
            .order_by(Formula.action_id.asc(), Formula.sort_order.asc(), Formula.id.asc())
        )
    )
    formula_row_list_by_action: defaultdict[int, list[Formula]] = defaultdict(list)
    parsed_formula_by_id = {}
    action_id_set_by_age_target_field_id: defaultdict[int, set[int]] = defaultdict(set)
    current_age_action_id_set: set[int] = set()
    for formula_row in formula_row_list:
        try:
            parsed_formula = parse_formula_statement(formula_row.statement)
        except FormulaStatementValidationError as exc:
            raise _formula_statement_validation_error(
                exc, formula_sort_order=formula_row.sort_order
            ) from exc
        if parsed_formula.target_field_id not in field_by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Formula {formula_row.id} targets field {parsed_formula.target_field_id} "
                    "outside this scope"
                ),
            )
        formula_row_list_by_action[formula_row.action_id].append(formula_row)
        parsed_formula_by_id[formula_row.id] = parsed_formula
        if parsed_formula.target_field_id == current_field.id:
            current_age_action_id_set.add(formula_row.action_id)
        if parsed_formula.target_field_id in (initial_field.id, final_field.id):
            action_id_set_by_age_target_field_id[parsed_formula.target_field_id].add(
                formula_row.action_id
            )

    input_runtime_by_event_id: defaultdict[int, dict[int, FormulaRuntimePrimitive]] = (
        defaultdict(dict)
    )
    for input_row in session.scalars(
        select(Input)
        .where(Input.event_id.in_(event_id_list))
        .order_by(Input.event_id.asc(), Input.id.asc())
    ):
        input_field = field_by_id.get(input_row.field_id)
        if input_field is None:
            continue
        input_runtime_by_event_id[input_row.event_id][input_row.field_id] = (
            _coerce_input_runtime_value_or_400(
                input_field,
                input_row.value,
                event_id=input_row.event_id,
            )
        )

    initial_age_by_event_id: dict[int, int] = {}
    final_age_by_event_id: dict[int, int] = {}
    age_source_runtime_by_event_id: defaultdict[int, dict[int, int]] = defaultdict(dict)
    existing_result_by_key: dict[tuple[int, int, int], Result] = {}
    action_id_by_event_id = {row.id: row.action_id for row in event_row_list}

    for event_id, input_runtime in input_runtime_by_event_id.items():
        if (
            initial_field.id in input_runtime
            and action_id_by_event_id.get(event_id)
            in action_id_set_by_age_target_field_id[initial_field.id]
        ):
            normalized_age = _normalize_whole_age_runtime_or_400(
                input_runtime[initial_field.id],
                event_id=event_id,
                age_role="initial",
            )
            if normalized_age is not None:
                initial_age_by_event_id[event_id] = normalized_age
                age_source_runtime_by_event_id[event_id][initial_field.id] = normalized_age
        if (
            final_field.id in input_runtime
            and action_id_by_event_id.get(event_id)
            in action_id_set_by_age_target_field_id[final_field.id]
        ):
            normalized_age = _normalize_whole_age_runtime_or_400(
                input_runtime[final_field.id],
                event_id=event_id,
                age_role="final",
            )
            if normalized_age is not None:
                final_age_by_event_id[event_id] = normalized_age
                age_source_runtime_by_event_id[event_id][final_field.id] = normalized_age

    exec_date_ord = _result_execution_calendar_date_sql_expr(session)
    for row in session.scalars(
        select(Result)
        .join(Unity, Result.unity_id == Unity.id)
        .where(Result.event_id.in_(event_id_list))
        .order_by(
            Result.event_id.asc(),
            asc(exec_date_ord),
            Result.formula_order.asc(),
            Result.id.asc(),
        )
    ):
        if row.field_id == initial_field.id and row.event_id not in initial_age_by_event_id:
            normalized_age = _normalize_whole_age_or_400(
                row.numeric_value,
                event_id=row.event_id,
                age_role="initial",
            )
            if normalized_age is not None:
                initial_age_by_event_id[row.event_id] = normalized_age
                age_source_runtime_by_event_id[row.event_id][initial_field.id] = (
                    normalized_age
                )
            continue

        if row.field_id == final_field.id and row.event_id not in final_age_by_event_id:
            normalized_age = _normalize_whole_age_or_400(
                row.numeric_value,
                event_id=row.event_id,
                age_role="final",
            )
            if normalized_age is not None:
                final_age_by_event_id[row.event_id] = normalized_age
                age_source_runtime_by_event_id[row.event_id][final_field.id] = (
                    normalized_age
                )
            continue

    window_meta_by_event_id = _build_window_meta_by_event_id(
        event_row_list=event_row_list,
        initial_age_by_event_id=initial_age_by_event_id,
        final_age_by_event_id=final_age_by_event_id,
    )

    if not window_meta_by_event_id:
        return ScopeCurrentAgeCalculationResponse(
            can_edit=True,
            calculated_moment_utc=calculated_moment_utc,
            created_count=0,
            updated_count=0,
            unchanged_count=0,
            empty_reason="no_eligible_window",
            item_list=[],
        )

    _apply_member_audit_context(session, member)
    result_id_subq_calc = select(Result.id).where(Result.event_id.in_(event_id_list))
    deleted_result = session.execute(delete(Result).where(Result.id.in_(result_id_subq_calc)))
    deleted_result_count = deleted_result.rowcount or 0

    occurrence_list = _build_execution_occurrence_list(
        event_row_list=event_row_list,
        action_by_id=action_by_id,
        window_meta_by_event_id=window_meta_by_event_id,
        unity_by_id=unity_by_id,
        current_age_action_id_set=current_age_action_id_set,
    )

    state_by_group: defaultdict[int, dict[int, FormulaRuntimePrimitive]] = defaultdict(dict)
    current_window_by_group: dict[int, dict[str, int]] = {}
    close_after_day_by_group: dict[int, dict[str, Any]] = {}
    created_count = 0
    updated_count = 0
    unchanged_count = 0
    result_row_list: list[
        tuple[Result, Event, Literal["created", "updated", "unchanged"] | None]
    ] = []

    for (unity_id_day, execution_day_key), day_occurrence_iter in groupby(
        occurrence_list,
        key=_current_age_occurrence_unity_day_key,
    ):
        for occurrence in day_occurrence_iter:
            row = occurrence["source_event"]
            execution_day = occurrence["execution_day"]
            window_meta = window_meta_by_event_id.get(row.id)
            if window_meta is None:
                continue
            if row.unity_id is None:
                continue

            group_key = row.unity_id
            if occurrence["is_actual_event_day"]:
                pending_close = close_after_day_by_group.get(group_key)
                if pending_close is not None and pending_close["window"] != window_meta:
                    close_after_day_by_group.pop(group_key, None)
                if group_key not in close_after_day_by_group:
                    current_window_by_group[group_key] = window_meta

            active_window = current_window_by_group.get(group_key)
            if active_window is None:
                continue
            pending_close = close_after_day_by_group.get(group_key)
            if pending_close is not None and pending_close["window"] == active_window:
                if execution_day > pending_close["close_after_day"]:
                    unity_row = unity_by_id.get(group_key)
                    period_end_day = (
                        unity_row.creation_utc.date()
                        + timedelta(days=active_window["source_final_age"])
                        if unity_row is not None
                        else None
                    )
                    # Ao atingir o teto no fim do dia N, close_after_day fica em N; o último dia
                    # civil da janela (creation + idade final) ainda precisa ser processado.
                    if not (
                        period_end_day is not None and execution_day == period_end_day
                    ):
                        current_window_by_group.pop(group_key, None)
                        continue

            group_state = state_by_group[group_key]
            for field_id, runtime_value in age_source_runtime_by_event_id.get(row.id, {}).items():
                group_state[field_id] = runtime_value

            if occurrence["is_actual_event_day"] and row.id == active_window["source_initial_event_id"]:
                group_state[initial_field.id] = active_window["source_initial_age"]
                group_state[current_field.id] = active_window["source_initial_age"]

            formula_list = formula_row_list_by_action.get(row.action_id, [])
            event_input_runtime = input_runtime_by_event_id.get(row.id, {})
            for formula_row in formula_list:
                parsed_formula = parsed_formula_by_id[formula_row.id]
                evaluator_names: dict[str, Any] = {}

                for field_id in parsed_formula.field_id_in_rhs:
                    runtime_value = group_state.get(field_id)
                    if runtime_value is None:
                        runtime_value = _default_runtime_value_for_field(field_by_id[field_id])
                        group_state[field_id] = runtime_value
                    evaluator_names[f"f_{field_id}"] = runtime_value

                for field_id in parsed_formula.input_id_in_rhs:
                    if field_id not in event_input_runtime:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail={
                                "code": "current_age_formula_input_missing",
                                "message": (
                                    f"Event {row.id} formula {formula_row.id} "
                                    f"(sort_order {formula_row.sort_order}) requires input "
                                    f"for field {field_id}"
                                ),
                                "event_id": row.id,
                                "action_id": row.action_id,
                                "formula_id": formula_row.id,
                                "formula_sort_order": formula_row.sort_order,
                                "field_id": field_id,
                            },
                        )
                    evaluator_names[f"i_{field_id}"] = event_input_runtime[field_id]

                try:
                    formula_value = build_formula_simple_eval(evaluator_names).eval(
                        parsed_formula.transformed_rhs
                    )
                except Exception as exc:  # noqa: BLE001
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Event {row.id} formula {formula_row.id} "
                            f"(sort_order {formula_row.sort_order}) could not be evaluated: {exc}"
                        ),
                    ) from exc

                target_field = field_by_id[parsed_formula.target_field_id]
                typed_payload = _coerce_formula_output_to_result_payload_or_400(
                    formula_value,
                    field=target_field,
                    event_id=row.id,
                    formula_id=formula_row.id,
                    formula_order=formula_row.sort_order,
                )
                if target_field.id == current_field.id:
                    age_cap = active_window["source_final_age"]
                    try:
                        cur_i = _parse_integer_value_or_400(
                            typed_payload["runtime_value"],
                            detail=(
                                f"Event {row.id}: current age field must evaluate to an integer"
                            ),
                        )
                    except HTTPException:
                        pass
                    else:
                        if cur_i > age_cap:
                            typed_payload = _coerce_formula_output_to_result_payload_or_400(
                                age_cap,
                                field=target_field,
                                event_id=row.id,
                                formula_id=formula_row.id,
                                formula_order=formula_row.sort_order,
                            )
                group_state[target_field.id] = typed_payload["runtime_value"]

                age_val = group_state.get(current_field.id)
                if age_val is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail={
                            "code": "current_age_missing_for_result",
                            "message": (
                                f"Event {row.id}: current age is required to persist results"
                            ),
                            "event_id": row.id,
                        },
                    )
                persisted_age = _parse_integer_value_or_400(
                    age_val,
                    detail=(
                        f"Event {row.id}: current age must be an integer for result rows"
                    ),
                )
                current_result = Result(
                    unity_id=row.unity_id,
                    age=persisted_age,
                    event_id=row.id,
                    field_id=target_field.id,
                    formula_id=formula_row.id,
                    formula_order=formula_row.sort_order,
                    text_value=typed_payload["text_value"],
                    boolean_value=typed_payload["boolean_value"],
                    numeric_value=typed_payload["numeric_value"],
                )
                session.add(current_result)
                result_row_list.append((current_result, row, "created"))
                created_count += 1

            current_age_state = group_state.get(current_field.id)
            if current_age_state is not None:
                normalized_current_age = _parse_integer_value_or_400(
                    current_age_state,
                    detail=f"Event {row.id} produced a non-integer current age",
                )
                if normalized_current_age > active_window["source_final_age"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Event {row.id} produced current age {normalized_current_age}, "
                            f"which exceeds final age {active_window['source_final_age']}"
                        ),
                    )

        # Fecha a janela só depois de todas as ocorrências do mesmo dia na mesma unidade.
        if unity_id_day == 0:
            continue
        group_key_day = unity_id_day
        active_window_day = current_window_by_group.get(group_key_day)
        if active_window_day is None:
            continue
        group_state_day = state_by_group[group_key_day]
        current_age_end_day = group_state_day.get(current_field.id)
        if current_age_end_day is None:
            continue
        normalized_end_day = _parse_integer_value_or_400(
            current_age_end_day,
            detail=f"Unity {group_key_day}: current age must be an integer after day processing",
        )
        if normalized_end_day >= active_window_day["source_final_age"]:
            close_after_day_by_group[group_key_day] = {
                "window": active_window_day,
                "close_after_day": execution_day_key,
            }

    if not result_row_list and deleted_result_count == 0:
        return ScopeCurrentAgeCalculationResponse(
            can_edit=True,
            calculated_moment_utc=calculated_moment_utc,
            created_count=0,
            updated_count=0,
            unchanged_count=0,
            empty_reason="no_results_after_calculation",
            item_list=[],
        )

    if created_count > 0 or deleted_result_count > 0:
        _apply_member_audit_context(session, member)
        commit_session_with_null_if_empty(session)

    return _build_current_age_response_from_result_rows(
        calculated_moment_utc=calculated_moment_utc,
        result_row_list=result_row_list,
    )


# --- input ---


class ScopeInputRecord(BaseModel):
    id: int
    event_id: int
    field_id: int
    age: int | None = None
    value: str


class ScopeInputListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeInputRecord]


class ScopeInputCreateRequest(BaseModel):
    field_id: int
    value: str = PydanticField(min_length=1, max_length=65535)
    age: int | None = None


class ScopeInputPatchRequest(BaseModel):
    value: str | None = PydanticField(default=None, min_length=1, max_length=65535)
    age: int | None = None


@router.get(
    "/scopes/{scope_id}/events/{event_id}/inputs",
    response_model=ScopeInputListResponse,
)
def list_scope_event_inputs(
    scope_id: int,
    event_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    rows = list(
        session.scalars(
            select(Input).where(Input.event_id == event_id).order_by(Input.id)
        )
    )
    return ScopeInputListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeInputRecord(
                id=r.id,
                event_id=r.event_id,
                field_id=r.field_id,
                age=r.age,
                value=r.value,
            )
            for r in rows
        ],
    )


@router.post(
    "/scopes/{scope_id}/events/{event_id}/inputs",
    response_model=ScopeInputListResponse,
)
def create_scope_event_input(
    scope_id: int,
    event_id: int,
    body: ScopeInputCreateRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    _field_in_scope_or_404(session, scope_id=scope_id, field_id=body.field_id)
    row = Input(
        event_id=event_id,
        field_id=body.field_id,
        value=body.value.strip(),
        age=body.age,
    )
    session.add(row)
    _apply_member_audit_context(session, member)
    try:
        commit_session_with_null_if_empty(session)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate input for this event and field",
        ) from exc
    return list_scope_event_inputs(scope_id, event_id, member, session)


@router.patch(
    "/scopes/{scope_id}/events/{event_id}/inputs/{input_id}",
    response_model=ScopeInputListResponse,
)
def patch_scope_event_input(
    scope_id: int,
    event_id: int,
    input_id: int,
    body: ScopeInputPatchRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    row = _input_in_event_or_404(session, event_id=event_id, input_id=input_id)
    if body.value is not None:
        row.value = body.value.strip()
    if "age" in body.model_fields_set:
        row.age = body.age
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_event_inputs(scope_id, event_id, member, session)


@router.delete(
    "/scopes/{scope_id}/events/{event_id}/inputs/{input_id}",
    response_model=ScopeInputListResponse,
)
def delete_scope_event_input(
    scope_id: int,
    event_id: int,
    input_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    row = _input_in_event_or_404(session, event_id=event_id, input_id=input_id)
    session.delete(row)
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_event_inputs(scope_id, event_id, member, session)


# --- result ---


class ScopeResultRecord(BaseModel):
    id: int
    unity_id: int
    age: int
    event_id: int
    field_id: int
    formula_id: int
    formula_order: int
    text_value: str | None
    boolean_value: bool | None
    numeric_value: Decimal | None


class ScopeResultListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeResultRecord]


class ScopeResultCreateRequest(BaseModel):
    unity_id: int
    field_id: int
    formula_id: int
    formula_order: int | None = None
    text_value: str | None = PydanticField(default=None, max_length=65535)
    boolean_value: bool | None = None
    numeric_value: Decimal | None = None
    age: int = PydanticField(ge=0)


class ScopeResultPatchRequest(BaseModel):
    formula_id: int | None = None
    formula_order: int | None = None
    text_value: str | None = PydanticField(default=None, max_length=65535)
    boolean_value: bool | None = None
    numeric_value: Decimal | None = None
    age: int | None = None

    @model_validator(mode="after")
    def reject_explicit_null_age(self) -> Self:
        # PATCH parcial: omitir age não altera; enviar null é inválido (coluna NOT NULL).
        if "age" in self.model_fields_set and self.age is None:
            raise ValueError("age cannot be null")
        return self


@router.get(
    "/scopes/{scope_id}/events/{event_id}/results",
    response_model=ScopeResultListResponse,
)
def list_scope_event_results(
    scope_id: int,
    event_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    rows = list(
        session.scalars(
            select(Result)
            .where(Result.event_id == event_id)
            .order_by(Result.formula_order.asc(), Result.id.asc())
        )
    )
    return ScopeResultListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeResultRecord(
                id=r.id,
                unity_id=r.unity_id,
                age=r.age,
                event_id=r.event_id,
                field_id=r.field_id,
                formula_id=r.formula_id,
                formula_order=r.formula_order,
                text_value=r.text_value,
                boolean_value=r.boolean_value,
                numeric_value=r.numeric_value,
            )
            for r in rows
        ],
    )


@router.post(
    "/scopes/{scope_id}/events/{event_id}/results",
    response_model=ScopeResultListResponse,
)
def create_scope_event_result(
    scope_id: int,
    event_id: int,
    body: ScopeResultCreateRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    event_row = _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    _field_in_scope_or_404(session, scope_id=scope_id, field_id=body.field_id)
    _get_scope_unity_or_404(session, scope_id=scope_id, unity_id=body.unity_id)
    formula_row = _formula_in_action_or_404(
        session,
        action_id=event_row.action_id,
        formula_id=body.formula_id,
    )
    row = Result(
        unity_id=body.unity_id,
        age=body.age,
        event_id=event_id,
        field_id=body.field_id,
        formula_id=formula_row.id,
        formula_order=(
            body.formula_order
            if body.formula_order is not None
            else formula_row.sort_order
        ),
        text_value=_normalize_optional_result_text(body.text_value),
        boolean_value=body.boolean_value,
        numeric_value=body.numeric_value,
    )
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_event_results(scope_id, event_id, member, session)


@router.patch(
    "/scopes/{scope_id}/events/{event_id}/results/{result_id}",
    response_model=ScopeResultListResponse,
)
def patch_scope_event_result(
    scope_id: int,
    event_id: int,
    result_id: int,
    body: ScopeResultPatchRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    event_row = _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    row = _result_in_event_or_404(session, event_id=event_id, result_id=result_id)
    if body.formula_id is not None:
        formula_row = _formula_in_action_or_404(
            session,
            action_id=event_row.action_id,
            formula_id=body.formula_id,
        )
        row.formula_id = formula_row.id
        if body.formula_order is None:
            row.formula_order = formula_row.sort_order
    if body.formula_order is not None:
        row.formula_order = body.formula_order
    if "text_value" in body.model_fields_set:
        row.text_value = _normalize_optional_result_text(body.text_value)
    if "boolean_value" in body.model_fields_set:
        row.boolean_value = body.boolean_value
    if "numeric_value" in body.model_fields_set:
        row.numeric_value = body.numeric_value
    if "age" in body.model_fields_set:
        row.age = body.age
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_event_results(scope_id, event_id, member, session)


@router.delete(
    "/scopes/{scope_id}/events/{event_id}/results/{result_id}",
    response_model=ScopeResultListResponse,
)
def delete_scope_event_result(
    scope_id: int,
    event_id: int,
    result_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    row = _result_in_event_or_404(session, event_id=event_id, result_id=result_id)
    session.delete(row)
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_event_results(scope_id, event_id, member, session)
