# API REST do domínio de regras por escopo (field, action, formula, label, event, input, result).

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field as PydanticField, model_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from valora_backend.auth.dependencies import get_current_member
from valora_backend.auth.service import ADMIN_ROLE, MASTER_ROLE
from valora_backend.db import get_session
from valora_backend.model.identity import Location, Member, Scope, Unity
from valora_backend.model.rules import (
    Action,
    Event,
    Field,
    Formula,
    Input,
    Label,
    Result,
)
from valora_backend.api.auth import _apply_member_audit_context
from valora_backend.model.null_if_empty import commit_session_with_null_if_empty

router = APIRouter(prefix="/auth/tenant/current", tags=["scope-rules"])


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


def _unity_in_scope_or_404(
    session: Session, *, scope_id: int, unity_id: int
) -> Unity:
    row = session.get(Unity, unity_id)
    if not row or row.scope_id != scope_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unity not found for current scope",
        )
    return row


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


# --- field ---


class ScopeFieldRecord(BaseModel):
    id: int
    scope_id: int
    sql_type: str


class ScopeFieldListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeFieldRecord]


class ScopeFieldCreateRequest(BaseModel):
    sql_type: str = PydanticField(min_length=1, max_length=2048)


class ScopeFieldPatchRequest(BaseModel):
    sql_type: str | None = PydanticField(default=None, min_length=1, max_length=2048)


@router.get(
    "/scopes/{scope_id}/fields",
    response_model=ScopeFieldListResponse,
)
def list_scope_fields(
    scope_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    rows = list(
        session.scalars(
            select(Field).where(Field.scope_id == scope_id).order_by(Field.id)
        )
    )
    return ScopeFieldListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeFieldRecord(id=r.id, scope_id=r.scope_id, sql_type=r.type) for r in rows
        ],
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
    row = Field(scope_id=scope_id, type=body.sql_type.strip())
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_fields(scope_id, member, session)


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
    return ScopeFieldRecord(id=row.id, scope_id=row.scope_id, sql_type=row.type)


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
    if body.sql_type is not None:
        row.type = body.sql_type.strip()
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_fields(scope_id, member, session)


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
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_fields(scope_id, member, session)


# --- action ---


class ScopeActionRecord(BaseModel):
    id: int
    scope_id: int


class ScopeActionListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeActionRecord]


class ScopeActionCreateRequest(BaseModel):
    pass


@router.get(
    "/scopes/{scope_id}/actions",
    response_model=ScopeActionListResponse,
)
def list_scope_actions(
    scope_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    rows = list(
        session.scalars(
            select(Action).where(Action.scope_id == scope_id).order_by(Action.id)
        )
    )
    return ScopeActionListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[ScopeActionRecord(id=r.id, scope_id=r.scope_id) for r in rows],
    )


@router.post(
    "/scopes/{scope_id}/actions",
    response_model=ScopeActionListResponse,
)
def create_scope_action(
    scope_id: int,
    _body: ScopeActionCreateRequest,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _require_scope_rules_editor(member)
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    row = Action(scope_id=scope_id)
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_actions(scope_id, member, session)


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
    return ScopeActionRecord(id=row.id, scope_id=row.scope_id)


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
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_actions(scope_id, member, session)


# --- formula ---


class ScopeFormulaRecord(BaseModel):
    id: int
    action_id: int
    step: int
    statement: str


class ScopeFormulaListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeFormulaRecord]


class ScopeFormulaCreateRequest(BaseModel):
    step: int
    statement: str = PydanticField(min_length=1, max_length=65535)


class ScopeFormulaPatchRequest(BaseModel):
    step: int | None = None
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
            .order_by(Formula.step, Formula.id)
        )
    )
    return ScopeFormulaListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeFormulaRecord(
                id=r.id, action_id=r.action_id, step=r.step, statement=r.statement
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
    row = Formula(
        action_id=action_id,
        step=body.step,
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
            detail="Duplicate step for this action or invalid data",
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
    if body.step is not None:
        row.step = body.step
    if body.statement is not None:
        row.statement = body.statement.strip()
    session.add(row)
    _apply_member_audit_context(session, member)
    try:
        commit_session_with_null_if_empty(session)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate step for this action or invalid data",
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
    session.delete(row)
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
    field_id: int | None = Query(default=None),
    action_id: int | None = Query(default=None),
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


class ScopeEventRecord(BaseModel):
    id: int
    location_id: int
    unity_id: int
    action_id: int
    moment_utc: datetime


class ScopeEventListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeEventRecord]


class ScopeEventCreateRequest(BaseModel):
    location_id: int
    unity_id: int
    action_id: int


class ScopeEventPatchRequest(BaseModel):
    location_id: int | None = None
    unity_id: int | None = None
    action_id: int | None = None


@router.get(
    "/scopes/{scope_id}/events",
    response_model=ScopeEventListResponse,
)
def list_scope_events(
    scope_id: int,
    member: Member = Depends(get_current_member),
    session: Session = Depends(get_session),
):
    _get_tenant_scope(session, actor=member, scope_id=scope_id)
    action_id_list = list(
        session.scalars(select(Action.id).where(Action.scope_id == scope_id))
    )
    if not action_id_list:
        return ScopeEventListResponse(
            can_edit=_member_can_edit_scope_rules(member),
            item_list=[],
        )
    rows = list(
        session.scalars(
            select(Event)
            .where(Event.action_id.in_(action_id_list))
            .order_by(Event.moment_utc.desc(), Event.id.desc())
        )
    )
    return ScopeEventListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeEventRecord(
                id=r.id,
                location_id=r.location_id,
                unity_id=r.unity_id,
                action_id=r.action_id,
                moment_utc=r.moment_utc,
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
    _unity_in_scope_or_404(session, scope_id=scope_id, unity_id=body.unity_id)
    action = _action_in_scope_or_404(
        session, scope_id=scope_id, action_id=body.action_id
    )
    row = Event(
        location_id=body.location_id,
        unity_id=body.unity_id,
        action_id=action.id,
    )
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_events(scope_id, member, session)


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
    if body.unity_id is not None:
        _unity_in_scope_or_404(session, scope_id=scope_id, unity_id=body.unity_id)
        row.unity_id = body.unity_id
    if body.action_id is not None:
        _action_in_scope_or_404(session, scope_id=scope_id, action_id=body.action_id)
        row.action_id = body.action_id
    session.add(row)
    _apply_member_audit_context(session, member)
    commit_session_with_null_if_empty(session)
    return list_scope_events(scope_id, member, session)


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
    if session.scalar(select(Result.id).where(Result.event_id == row.id).limit(1)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete event while results reference it",
        )
    session.delete(row)
    _apply_member_audit_context(session, member)
    session.commit()
    return list_scope_events(scope_id, member, session)


# --- input ---


class ScopeInputRecord(BaseModel):
    id: int
    event_id: int
    field_id: int
    value: str


class ScopeInputListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeInputRecord]


class ScopeInputCreateRequest(BaseModel):
    field_id: int
    value: str = PydanticField(min_length=1, max_length=65535)


class ScopeInputPatchRequest(BaseModel):
    value: str | None = PydanticField(default=None, min_length=1, max_length=65535)


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
                id=r.id, event_id=r.event_id, field_id=r.field_id, value=r.value
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
    event_id: int
    field_id: int
    value: str
    parent_result_id: int | None
    moment_utc: datetime


class ScopeResultListResponse(BaseModel):
    can_edit: bool
    item_list: list[ScopeResultRecord]


class ScopeResultCreateRequest(BaseModel):
    field_id: int
    value: str = PydanticField(min_length=1, max_length=65535)
    parent_result_id: int | None = None
    moment_utc: datetime | None = None


class ScopeResultPatchRequest(BaseModel):
    value: str | None = PydanticField(default=None, min_length=1, max_length=65535)
    parent_result_id: int | None = None
    moment_utc: datetime | None = None


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
            select(Result).where(Result.event_id == event_id).order_by(Result.id)
        )
    )
    return ScopeResultListResponse(
        can_edit=_member_can_edit_scope_rules(member),
        item_list=[
            ScopeResultRecord(
                id=r.id,
                event_id=r.event_id,
                field_id=r.field_id,
                value=r.value,
                parent_result_id=r.parent_result_id,
                moment_utc=r.moment_utc,
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
    _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    _field_in_scope_or_404(session, scope_id=scope_id, field_id=body.field_id)
    if body.parent_result_id is not None:
        _result_in_event_or_404(
            session, event_id=event_id, result_id=body.parent_result_id
        )
    moment = body.moment_utc or datetime.now(UTC)
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC).replace(tzinfo=None)
    row = Result(
        event_id=event_id,
        field_id=body.field_id,
        value=body.value.strip(),
        parent_result_id=body.parent_result_id,
        moment_utc=moment,
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
    _event_in_scope_or_404(session, scope_id=scope_id, event_id=event_id)
    row = _result_in_event_or_404(session, event_id=event_id, result_id=result_id)
    if body.value is not None:
        row.value = body.value.strip()
    if body.parent_result_id is not None:
        if body.parent_result_id == row.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Result cannot be its own parent",
            )
        _result_in_event_or_404(
            session, event_id=event_id, result_id=body.parent_result_id
        )
        row.parent_result_id = body.parent_result_id
    if body.moment_utc is not None:
        m = body.moment_utc
        if m.tzinfo is not None:
            m = m.astimezone(UTC).replace(tzinfo=None)
        row.moment_utc = m
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
