# Plano: último `age` em dobro em `result` (cálculo de idade atual)

## Sintoma (evidência)

- Na tabela `result`, o mesmo `event_id` (ex.: 4), mesmo `field_id`, mesma `formula_id` e mesmo `age` (ex.: 20) aparece **duas vezes** com `id` distintos.
- Na UI, a coluna de idade / “Semana” repete o último valor (20) em mais de uma linha.

Isso indica que o motor executou as fórmulas **duas vezes** para o **mesmo** par **(evento, dia civil)**, não apenas “dois campos diferentes no mesmo dia”.

## Causa raiz provável

O fluxo `calculate_scope_current_age` itera `occurrence_list` construída em `_build_execution_occurrence_list`. Se essa lista contiver **duas entradas** com a mesma chave lógica `(event_id, execution_day)` para o **mesmo** `source_event`, o laço interno grava **dois** `Result` idênticos (mesmo `formula_order`, mesmo `age` persistido).

Isso pode surgir de:

1. **Sobreposição real + sintético** no último dia da janela, se a lógica de exclusão de sintético ou de fatos não cobrir todos os casos.
2. **Duas entradas equivalentes** após ordenação (efeito de borda no `while` de recorrência ou combinação com `period_end`).
3. **Dois fatos** com a mesma ação e mesmo dia civil (já tratado em parte por `actual_occurrence_key_seen`).

Ou seja: o “controle de final de loop” relevante não é só o `while next_execution_day <= recurrence_last_day`, e sim a **invariante** de que existe **no máximo uma ocorrência por (evento, dia civil)** antes do cálculo.

## Diretriz de correção (invariante)

**Garantir:** após `_build_execution_occurrence_list`, a lista satisfaz:

- no máximo **uma** ocorrência por `(source_event.id, execution_day)`.

**Preferência** quando houver colisão (não deveria ser frequente):

- manter a ocorrência com `is_actual_event_day == True` (fato) em detrimento da sintética.

## Implementação no repositório

1. **Após** o `sort` da lista de ocorrências e **antes** do `return`, aplicar **fusão** por `(event_id, execution_day)` com a regra acima.
2. **Na persistência** (`calculate_scope_current_age`): com **clamp** da idade atual ao teto (`source_final_age`), dois **dias civis** distintos podem gerar o **mesmo** `persisted_age` na coluna `result.age`. Nesse caso a chave `(event_id, execution_day)` já não colapsa o par duplicado. Foi adicionado um conjunto `persisted_result_identity_seen` com `(event_id, field_id, formula_id, persisted_age)` para **não** inserir uma segunda linha idêntica na mesma execução do cálculo.
3. Manter comentário no código explicando que isso evita linhas duplicadas em `result` para o mesmo fato no mesmo dia civil.
4. **Testes:** os testes existentes em `test_member_directory_api.py` para `calculate_scope_current_age` cobrem deduplicação de fatos e sintéticos; a fusão final reforça o contrato.

## Verificação manual

1. Recalcular idade atual para o escopo/lote afetado (ou apagar `result` e recalcular).
2. Consultar `SELECT * FROM result WHERE field_id = ? ORDER BY age` e confirmar **um** registro por `(event_id, age)` para a fórmula duplicada.
3. Conferir na UI que o último `age` não aparece em duplicata na coluna correspondente.

## Dados legados

Linhas já gravadas em duplicata **antes** da correção permanecem no banco até novo cálculo (que apaga e recria `result` para os eventos do escopo) ou limpeza manual.
