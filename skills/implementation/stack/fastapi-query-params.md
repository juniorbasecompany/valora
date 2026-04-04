# FastAPI: parâmetros `Query` e chamadas internas a handlers

## Problema

Se um parâmetro de rota for declarado como `name: T = Query(default=...)`, em uma **chamada Python direta** ao handler (sem passar pelo ASGI), o valor omitido pode ser o **objeto `Query`**, não o default lógico. Isso quebra comparações e binds SQLAlchemy (`cannot adapt type 'Query'`).

## Padrão recomendado

- Usar **`Annotated[..., Query(...)] = None`** (ou `= "pt-BR"` quando o default for string fixa), de modo que o default **em tempo de execução Python** seja primitivo.
- Quando um handler chama outro (`return list_scope_foo(...)`), passar **explicitamente** todos os argumentos que correspondem a query string (incluindo `None` para opcionais).
- Documentação oficial: [FastAPI - Query Parameters as required, with `Annotated`](https://fastapi.tiangolo.com/tutorial/query-param-models/).

## Onde já se aplica no repositório

Handlers de lista em [`backend/src/valora_backend/api/rules.py`](../../../backend/src/valora_backend/api/rules.py) que são reutilizados após mutações (POST, PATCH, DELETE) seguem esse padrão.
