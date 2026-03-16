# Fonte oficial

## Regra geral

A documentação do projeto tem autoridade explícita por camada.

1. `skills/` é a verdade operacional.
2. `architecture/` é a verdade decisória curta.
3. `vision/` é a explicação humana da solução.
4. `reference/` é material de consulta.
5. `archive/` é material histórico e superado.

## Convenções persistentes do agente

As convenções sempre ativas de idioma, escrita e nomenclatura ficam em `.cursor/rules/`.

- Essas regras complementam a documentação do projeto, mas não substituem decisão arquitetural nem contrato operacional.

## Como interpretar cada camada

### `.cursor/rules/`

Convenções persistentes de escrita, nomenclatura e comportamento do agente no projeto.

### `skills/`

Use esta camada para orientar implementação e revisão com segurança.

### `architecture/`

Use esta camada para registrar decisões estruturais que valem para todo o sistema.

### `vision/`

Use esta camada para explicar o que está sendo construído e como isso ajuda a operação.

### `reference/`

Use esta camada para consultar contexto, exemplo, plano anterior ou material-fonte.

### `archive/`

Use esta camada apenas para recuperar histórico, comparar pensamento anterior ou rastrear decisão superada.

## Regra de conflito

- `reference/` não redefine `skills/` nem `architecture/`.
- `archive/` não deve orientar decisão nova sem promoção explícita.
- Quando um detalhe importante existir apenas em `reference/`, ele deve ser promovido para `skills/` ou `architecture/` antes de virar base oficial.
