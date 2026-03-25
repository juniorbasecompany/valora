"""Operações compartilhadas entre diretórios hierárquicos por escopo (ex.: location, unity)."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def hierarchy_sort_key(item: Any) -> tuple[int, str, int]:
    return (item.sort_order, item.name.lower(), item.id)


def hierarchy_item_label(item: Any) -> str:
    name = item.name.strip()
    if name:
        return name

    display_name = item.display_name.strip()
    if display_name:
        return display_name

    return f"#{item.id}"


def validate_scope_hierarchy_parent_change(
    item_map: dict[int, Any],
    *,
    get_parent_id: Callable[[Any], int | None],
    parent_id: int | None,
    moving_id: int | None,
    not_found_detail: str,
    self_parent_detail: str,
    cycle_detail: str,
) -> None:
    if parent_id is None:
        return

    parent_item = item_map.get(parent_id)
    if parent_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found_detail,
        )

    if moving_id is None:
        return

    if parent_item.id == moving_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=self_parent_detail,
        )

    current_parent = parent_item
    while get_parent_id(current_parent) is not None:
        ancestor_id = get_parent_id(current_parent)
        if ancestor_id == moving_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=cycle_detail,
            )
        current_parent = item_map.get(ancestor_id)
        if current_parent is None:
            break


def resequence_hierarchy_siblings(sibling_list: list[Any]) -> None:
    for index, sibling in enumerate(sibling_list):
        sibling.sort_order = index


def move_hierarchy_node_in_scope(
    session: Session,
    *,
    item_list: list[Any],
    target_item: Any,
    get_parent_id: Callable[[Any], int | None],
    set_parent_id: Callable[[Any, int | None], None],
    new_parent_id: int | None,
    target_index: int | None,
    sort_key: Callable[[Any], tuple[int, str, int]] = hierarchy_sort_key,
    not_found_detail: str = "Parent not found for current scope",
    self_parent_detail: str = "Item cannot be its own parent",
    cycle_detail: str = "Item cannot move under one of its descendants",
) -> None:
    item_map = {item.id: item for item in item_list}
    item_map[target_item.id] = target_item

    validate_scope_hierarchy_parent_change(
        item_map,
        get_parent_id=get_parent_id,
        parent_id=new_parent_id,
        moving_id=target_item.id,
        not_found_detail=not_found_detail,
        self_parent_detail=self_parent_detail,
        cycle_detail=cycle_detail,
    )

    current_parent_id = get_parent_id(target_item)
    origin_sibling_list = sorted(
        [
            item
            for item in item_list
            if get_parent_id(item) == current_parent_id and item.id != target_item.id
        ],
        key=sort_key,
    )
    destination_sibling_list = sorted(
        [
            item
            for item in item_list
            if get_parent_id(item) == new_parent_id and item.id != target_item.id
        ],
        key=sort_key,
    )

    resolved_target_index = len(destination_sibling_list)
    if target_index is not None:
        if target_index > len(destination_sibling_list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target index is outside the valid sibling range",
            )
        resolved_target_index = target_index

    set_parent_id(target_item, new_parent_id)
    destination_sibling_list.insert(resolved_target_index, target_item)
    resequence_hierarchy_siblings(destination_sibling_list)
    for sibling in destination_sibling_list:
        session.add(sibling)

    if current_parent_id != new_parent_id:
        resequence_hierarchy_siblings(origin_sibling_list)
        for sibling in origin_sibling_list:
            session.add(sibling)


def normalize_scope_hierarchy_order(
    session: Session,
    *,
    item_list: list[Any],
    get_parent_id: Callable[[Any], int | None],
    sort_key: Callable[[Any], tuple[int, str, int]] = hierarchy_sort_key,
) -> None:
    child_list_by_parent_id: defaultdict[int | None, list[Any]] = defaultdict(list)
    for item in sorted(item_list, key=sort_key):
        child_list_by_parent_id[get_parent_id(item)].append(item)

    for sibling_list in child_list_by_parent_id.values():
        resequence_hierarchy_siblings(sibling_list)
        for sibling in sibling_list:
            session.add(sibling)
