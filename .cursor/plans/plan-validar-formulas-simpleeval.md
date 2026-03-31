---
name: Validar fórmulas SimpleEval
overview: "Validar `statement` ao gravar com SimpleEval. Contrato fixado: atribuição única (lado esquerdo = quem recebe; lado direito = expressão de cálculo). Parser + verificação de campos do escopo + dry-run da RHS. Códigos 422 estáveis na API."
todos:
  - id: contract-grammar
    content: Implementar parser e executor conceitual alinhados atribuição LHS alvo ${field:id} + RHS expressão SimpleEval
    status: completed
  - id: deps-simpleeval
    content: Adicionar simpleeval ao backend e extrair build_evaluator partilhado (skill reference)
    status: completed
  - id: validate-module
    content: Implementar validate_formula_statement(scope, statement, session) com scope check + dry-run só na RHS
    status: completed
  - id: wire-api
    content: Invocar validação em POST/PATCH fórmulas com HTTP 422 e code estável
    status: completed
  - id: tests-i18n
    content: Testes backend + mapeamento de erro no frontend se necessário
    status: completed
isProject: true
---

# Validação de fórmulas ao gravar (SimpleEval)

## Status atual

Implementação concluída e em uso no backend/API:

- `simpleeval` está declarado em [backend/pyproject.toml](../../backend/pyproject.toml).
- A validação está centralizada em [formula_statement_validate.py](../../backend/src/valora_backend/rules/formula_statement_validate.py).
- `POST` e `PATCH` de fórmula invocam validação antes de persistir em [api/rules.py](../../backend/src/valora_backend/api/rules.py).
- A suíte de cenários principais está em [test_formula_statement_validate.py](../../backend/tests/test_formula_statement_validate.py).

## Contrato implementado

A `statement` persistida continua sendo uma linha única com atribuição:

- **LHS (alvo):** deve ser exatamente `${field:<id>}`.
- **RHS (expressão):** aceita referências `${field:<id>}` e `${input:<id>}`.
- **Separador de atribuição:** existe exatamente um `=` de atribuição válido (sem confundir com `==`, `<=`, `>=`, `!=`).

Exemplo válido:

- `${field:1} = ${field:2} + ${input:3}`

Exemplos inválidos:

- `${input:1} = ${field:2}` (input não pode ser alvo no LHS)
- `${field:1} = ${field:2} = 1` (mais de uma atribuição)

## Regras de validação aplicadas

Na gravação (`POST`/`PATCH`):

1. valida formato de atribuição (`LHS = RHS`);
2. valida LHS estrito (`${field:id}`);
3. valida se todos os IDs referenciados no texto pertencem ao escopo;
4. transforma tokens da RHS em nomes seguros e executa dry-run com `SimpleEval`.

Erros retornam `422` com códigos estáveis:

- `formula_invalid_assignment`
- `formula_invalid_target`
- `formula_unknown_field_id`
- `formula_expression_invalid`

## Limites atuais conhecidos

- A validação de gravação é estrutural e sintática; não cobre todos os erros dependentes de dado real em execução de evento.
- O dry-run usa valores stub para nomes da RHS.
- O motor em cadeia por ordem de `step` permanece como evolução separada da validação no write path.

## Evoluções futuras

- Dry-run com contexto acumulado por `step`.
- Extensão de gramática caso surja necessidade de novos formatos de atribuição.
