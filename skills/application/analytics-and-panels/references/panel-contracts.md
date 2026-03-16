# Contrato de painel

Cada contrato de painel deve definir, nesta ordem:

1. a lista de métrica exibida;
2. a lista de camada comparativa exibida;
3. o período padrão e a lista de período selecionável;
4. a regra de acumulação;
5. o conjunto de filtro;
6. a regra de ordenação e agrupamento;
7. o comportamento de localidade e formatação;
8. a regra de renderização de fuso horário;
9. se o valor financeiro aparece em moeda local ou em moeda convertida no momento da consulta;
10. se a saída por período é uma visão derivada sob demanda ou um instantâneo derivado governado;
11. se o painel é auditável apenas em moeda local ou apenas apresentacional após conversão.

## Origem do texto exibido

- o painel consome rótulo resolvido no momento da exibição, mas não é a origem do catálogo de mensagens;
- rótulo de domínio deve vir do metadado governado;
- rótulo de apresentação pode especializar o texto para o contexto visual do painel, desde que preserve a chave técnica de origem;
- mensagem de UX, como erro, alerta, ajuda contextual e confirmação, deve vir de catálogo próprio de mensagens e não de definição ad hoc do painel;
- quando houver resolução contextual de idioma, o painel deve aplicar o fallback oficial de texto: país, local, usuário.

## Critério objetivo

- todo painel por período deve nascer do fato diário;
- total por período nunca pode virar verdade paralela fora da base diária;
- valor acumulado deve declarar início, fim e regra de acumulação;
- a camada comparativa deve declarar se compara 'previsto', 'realizado', 'previsão corrigida' ou 'simulação';
- instantâneo derivado só é válido quando existir motivo objetivo de performance, fechamento ou governança visual.
- o contrato de painel deve declarar qual texto reutiliza metadado de domínio e qual texto depende de mensagem de UX.

## Mínimo para painel gerencial por período

Quando o produto exigir painel gerencial por período, o contrato mínimo deve declarar:

- 'produção prevista do período';
- 'produção realizada do período';
- 'faturamento previsto do período';
- 'faturamento realizado do período';
- 'saldo do período';
- 'faturamento acumulado';
- 'saldo acumulado';
- filtro por 'lote', 'segmento', 'local', 'empresa' e 'período'.

## Exemplo concreto

- um painel mensal pode mostrar 'produção prevista', 'produção realizada' e 'saldo do período';
- um painel gerencial pode usar instantâneo derivado mensal, desde que a origem continue sendo o fato diário;
- um painel financeiro convertido para outra moeda continua não auditável como fato original.

Painel de relatório é visão derivada por período sobre o fato diário.
