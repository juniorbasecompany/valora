# Campo dropdown de Unity no painel de Eventos (atualizado)

## Pedido confirmado

- Dropdown **simples** com **nome** das unidades cadastradas.
- **Primeiro** campo do painel (antes de Local / Item / Ação).

## Princípio (confirmação)

- Por enquanto o escopo é **só** passar a gravar `event.unity_id` a partir do novo campo.
- **Painel:** inserir o bloco da unidade no topo; Local, Item, Ação, data/hora, validações e restante do UI **inalterados** (sem lógica extra que mexa nos outros campos).
- **Gravação (API / banco):** no create/patch do evento, enviar (e persistir) `unity_id` **em adição** ao que já existe; **não** alterar semântica, nomes ou processamento de `location_id`, `item_id`, `action_id`, `moment_utc` nem outras colunas da tabela `event`.

## Decisão de produto (iteração)

- **Não** implementar ligação no frontend entre local/item da unity e local/item do evento (sem filtrar o dropdown, sem limpar unidade ao mudar local/item).

## Backend (regra de produto)

- **Não pode existir** regra que, com `unity_id` preenchido, exija que `location_id` ou `item_id` do evento coincidam com os da unidade. Essa ideia **não faz parte do comportamento desejado** e qualquer implementação equivalente no código **deve ser eliminada**.

## Implementação

### Backend

- Em [`backend/src/valora_backend/api/rules.py`](backend/src/valora_backend/api/rules.py): remover **por completo** `_validate_event_unity_for_scope_or_400` e **todas** as chamadas no create/patch de evento (e em qualquer outro sítio).
- Remover ou ajustar **testes** que dependam dessa validação.
- Confirmar por busca no repositório (ex.: nome da função, mensagens de erro associadas) que não restou caminho que imponha o mesmo vínculo.
- Manter o restante das validações de evento (escopo, existência de local/item/ação, etc.) e o persist de `unity_id` como FK para `unity` no escopo, **sem** cruzar com local/item do evento.

### Frontend

1. **Página** [`frontend/src/app/[locale]/app/configuration/event/page.tsx`](frontend/src/app/[locale]/app/configuration/event/page.tsx): `getTenantUnityDirectory` em paralelo; prop `initialUnityDirectory`.

2. **Cliente** [`frontend/src/component/configuration/event-configuration-client.tsx`](frontend/src/component/configuration/event-configuration-client.tsx):
   - Estado `unityId`, baseline, `syncFromDirectory`, `isDirty`, POST/PATCH com `unity_id`.
   - Primeira `<section>` com `select` no padrão `ui-input ui-input-select` (como em `event-action-field.tsx`).
   - Opção vazia com `aria-label` reutilizando `filterAllAria` do `copy` (diff mínimo).

3. **i18n** `EventConfigurationPage.section.unity` em `pt-BR` / `en-US` / `es-ES` + tipo `EventConfigurationCopy` + mapeamento na página.

## Fora de escopo

- Filtros da lista de eventos por unidade, aside, histórico.

## Verificação

- Criar/editar evento: `unity_id` persiste como escolhido; local/item/ação/data seguem o mesmo comportamento de antes; save **200** sem qualquer exigência de match entre unidade e local/item do evento.

## Checklist

- [x] Backend: eliminar `_validate_event_unity_for_scope_or_400`, chamadas e testes; garantir que não reste a mesma regra em outro sítio.
- [x] Página evento: `getTenantUnityDirectory` + `initialUnityDirectory`.
- [x] Cliente: estado `unityId`, sync/save, primeira secção com `select`.
- [x] i18n `section.unity` (pt-BR, en-US, es-ES) + `EventConfigurationCopy` + `page.tsx`.
