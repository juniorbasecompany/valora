from __future__ import annotations

import pytest

from valora_backend.config import _ensure_psycopg_sslmode_for_remote_hosts


def test_remote_host_gets_sslmode_on_railway(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    url = "postgresql+psycopg://u:p@db.example.com:5432/mydb"
    out = _ensure_psycopg_sslmode_for_remote_hosts(url)
    assert "sslmode=require" in out


def test_sslmode_not_duplicated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    url = "postgresql+psycopg://u:p@db.example.com:5432/mydb?sslmode=disable"
    assert _ensure_psycopg_sslmode_for_remote_hosts(url) == url


def test_localhost_unchanged_even_on_railway(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    url = "postgresql+psycopg://u:p@127.0.0.1:5434/valora"
    assert _ensure_psycopg_sslmode_for_remote_hosts(url) == url


def test_remote_without_railway_flag_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("VALORA_FORCE_POSTGRES_SSL", raising=False)
    url = "postgresql+psycopg://u:p@db.example.com:5432/mydb"
    assert _ensure_psycopg_sslmode_for_remote_hosts(url) == url


def test_valora_force_postgres_ssl(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    monkeypatch.setenv("VALORA_FORCE_POSTGRES_SSL", "1")
    url = "postgresql+psycopg://u:p@db.internal:5432/mydb"
    out = _ensure_psycopg_sslmode_for_remote_hosts(url)
    assert "sslmode=require" in out
