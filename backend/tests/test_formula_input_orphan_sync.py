"""Remoção de linhas em `input` quando `${input:n}` deixa de ser referido em todas as fórmulas da ação."""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import select

from valora_backend.api.rules import (
    ScopeFormulaPatchRequest,
    delete_scope_action_formula,
    patch_scope_action_formula,
)
from valora_backend.model.identity import Item, Kind, Location, Scope, Unity
from valora_backend.model.rules import Action, Event, Field, Formula, Input
from valora_backend.rules.formula_statement_validate import parse_formula_statement

from test_member_directory_api import build_rules_session


def _seed_scope_action_fields_event_input(
    session,
    *,
    tenant_id: int,
    two_formulas_share_input: bool,
):
    """Retorna (scope, action, event, input_field_id, formula_a, formula_b | None)."""
    scope = Scope(name="SyncInput", tenant_id=tenant_id)
    session.add(scope)
    session.flush()
    location = Location(
        name="L1",
        scope_id=scope.id,
        parent_location_id=None,
        sort_order=0,
    )
    kind = Kind(scope_id=scope.id, name="k")
    session.add_all([location, kind])
    session.flush()
    item = Item(
        scope_id=scope.id,
        kind_id=kind.id,
        parent_item_id=None,
        sort_order=0,
    )
    session.add(item)
    session.flush()
    action = Action(scope_id=scope.id, sort_order=0)
    session.add(action)
    session.flush()

    f1 = Field(
        scope_id=scope.id,
        type="INTEGER",
        sort_order=0,
        is_initial_age=False,
        is_final_age=False,
        is_current_age=False,
    )
    f2 = Field(
        scope_id=scope.id,
        type="INTEGER",
        sort_order=1,
        is_initial_age=False,
        is_final_age=False,
        is_current_age=False,
    )
    field_list = [f1, f2]
    if two_formulas_share_input:
        f3 = Field(
            scope_id=scope.id,
            type="INTEGER",
            sort_order=2,
            is_initial_age=False,
            is_final_age=False,
            is_current_age=False,
        )
        field_list.append(f3)
    session.add_all(field_list)
    session.flush()

    unity = Unity(
        name="U1",
        location_id=location.id,
        item_id_list=[item.id],
        creation_utc=datetime(2026, 4, 1, 0, 0, 0),
    )
    session.add(unity)
    session.flush()

    event = Event(
        unity_id=None,
        location_id=location.id,
        item_id=item.id,
        action_id=action.id,
        moment_utc=None,
    )
    session.add(event)
    session.flush()

    if two_formulas_share_input:
        formula_a = Formula(
            action_id=action.id,
            sort_order=0,
            statement=f"${{field:{f1.id}}} = ${{input:{f2.id}}} + 1",
        )
        formula_b = Formula(
            action_id=action.id,
            sort_order=1,
            statement=f"${{field:{f3.id}}} = ${{input:{f2.id}}} + 2",
        )
        session.add_all([formula_a, formula_b])
        session.flush()
        inp = Input(event_id=event.id, field_id=f2.id, value="5")
        session.add(inp)
        session.commit()
        return scope, action, event, f2.id, formula_a, formula_b

    formula_a = Formula(
        action_id=action.id,
        sort_order=0,
        statement=f"${{field:{f1.id}}} = ${{input:{f2.id}}} + 1",
    )
    session.add(formula_a)
    session.flush()
    inp = Input(event_id=event.id, field_id=f2.id, value="5")
    session.add(inp)
    session.commit()
    return scope, action, event, f2.id, formula_a, None


def test_patch_formula_deletes_inputs_when_last_input_ref_removed() -> None:
    with build_rules_session() as (session, tenant_id):
        scope, action, event, input_field_id, formula_a, _ = (
            _seed_scope_action_fields_event_input(
                session,
                tenant_id=tenant_id,
                two_formulas_share_input=False,
            )
        )
        input_id = session.scalar(
            select(Input.id).where(Input.event_id == event.id).limit(1)
        )
        assert input_id is not None
        member = SimpleNamespace(role=2, tenant_id=tenant_id)
        target_id = parse_formula_statement(formula_a.statement).target_field_id
        new_stmt = f"${{field:{target_id}}} = 1"
        with (
            patch("valora_backend.api.rules._require_scope_rules_editor"),
            patch("valora_backend.api.rules._get_tenant_scope", return_value=scope),
            patch("valora_backend.api.rules._apply_member_audit_context"),
        ):
            patch_scope_action_formula(
                scope_id=scope.id,
                action_id=action.id,
                formula_id=formula_a.id,
                body=ScopeFormulaPatchRequest(statement=new_stmt),
                member=member,
                session=session,
            )

        session.expire_all()
        assert session.get(Input, input_id) is None
        assert (
            session.scalar(
                select(Input.id).where(
                    Input.event_id == event.id,
                    Input.field_id == input_field_id,
                )
            )
            is None
        )


def test_patch_formula_keeps_inputs_when_another_formula_still_references_input() -> None:
    with build_rules_session() as (session, tenant_id):
        scope, action, event, input_field_id, formula_a, formula_b = (
            _seed_scope_action_fields_event_input(
                session,
                tenant_id=tenant_id,
                two_formulas_share_input=True,
            )
        )
        assert formula_b is not None
        input_id = session.scalar(
            select(Input.id).where(Input.event_id == event.id).limit(1)
        )
        assert input_id is not None
        member = SimpleNamespace(role=2, tenant_id=tenant_id)
        # Remove ${input} só da primeira fórmula; a segunda ainda referencia o mesmo field.
        t1 = parse_formula_statement(formula_a.statement).target_field_id
        t3 = parse_formula_statement(formula_b.statement).target_field_id
        new_stmt = f"${{field:{t1}}} = ${{field:{t3}}} + 0"
        with (
            patch("valora_backend.api.rules._require_scope_rules_editor"),
            patch("valora_backend.api.rules._get_tenant_scope", return_value=scope),
            patch("valora_backend.api.rules._apply_member_audit_context"),
        ):
            patch_scope_action_formula(
                scope_id=scope.id,
                action_id=action.id,
                formula_id=formula_a.id,
                body=ScopeFormulaPatchRequest(statement=new_stmt),
                member=member,
                session=session,
            )

        session.expire_all()
        row = session.get(Input, input_id)
        assert row is not None
        assert row.field_id == input_field_id


def test_delete_formula_deletes_inputs_when_last_input_ref_removed() -> None:
    with build_rules_session() as (session, tenant_id):
        scope, action, event, input_field_id, formula_a, _ = (
            _seed_scope_action_fields_event_input(
                session,
                tenant_id=tenant_id,
                two_formulas_share_input=False,
            )
        )
        input_id = session.scalar(
            select(Input.id).where(Input.event_id == event.id).limit(1)
        )
        assert input_id is not None
        member = SimpleNamespace(role=2, tenant_id=tenant_id)
        with (
            patch("valora_backend.api.rules._require_scope_rules_editor"),
            patch("valora_backend.api.rules._get_tenant_scope", return_value=scope),
            patch("valora_backend.api.rules._apply_member_audit_context"),
        ):
            delete_scope_action_formula(
                scope_id=scope.id,
                action_id=action.id,
                formula_id=formula_a.id,
                member=member,
                session=session,
            )

        session.expire_all()
        assert session.get(Input, input_id) is None
        assert (
            session.scalar(
                select(Input.id).where(
                    Input.event_id == event.id,
                    Input.field_id == input_field_id,
                )
            )
            is None
        )
