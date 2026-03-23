---
name: interface-product-direction
description: Defines the canonical UI/UX direction for Valora, including navigation, screen patterns, visual architecture, and guardrails for data-centric operational workflows. Use when designing, implementing, or reviewing frontend pages, admin/configuration flows, dashboards, data tables, audit/history views, or AI-assisted interactions.
---

# Direção de interface do Valora

## Objetivo

Fixar a direção canônica de UI/UX do Valora para que decisões de interface não se percam entre tarefas pontuais.

Este skill é a referência estável para:

- arquitetura visual;
- padrão de navegação;
- hierarquia entre dashboard, lista, detalhe, formulário e auditoria;
- guardrails do que fazer e do que evitar;
- papel de IA contextual na experiência.

Planos faseados e checklists temporários devem ficar em `.cursor/plans/`.

## Quando usar

Usar este skill quando:

- desenhar ou revisar a shell do frontend;
- criar páginas novas no `frontend/`;
- decidir entre dashboard, tabela, tabs, wizard ou drawer;
- estruturar fluxos de administração/configuração;
- desenhar listagens, detalhes, formulários, importação, processamento e auditoria;
- definir como IA contextual deve aparecer na interface.

## North Star

O Valora deve parecer um **workspace operacional explicável**.

A experiência deve transmitir:

- controlo;
- rapidez;
- clareza;
- rastreabilidade;
- solidez.

O produto não deve competir com a planilha só em estética. Ele deve dar ao usuário:

- mais domínio sobre a operação;
- mais contexto sobre o dado;
- mais confiança sobre a origem dos números;
- menos reconciliação manual;
- menos perda de contexto entre uma ação e outra.

## Direção principal

Seguir a direção **Operational Workspace com Audit Spine**.

Isto significa:

- o centro do produto é o trabalho operacional diário, não uma landing nem um painel decorativo;
- auditoria, histórico, origem e impacto fazem parte do fluxo normal;
- tabelas, filtros, detalhe lateral, tabs e ações rápidas têm prioridade sobre blocos de marketing;
- IA aparece como assistência contextual, nunca como experiência chat-first dominante.

## Estrutura recomendada da aplicação

### Navegação global

- **Sidebar** como navegação principal desktop-first.
- Ordem preferencial dos módulos:
  - `Home`
  - `Operações`
  - `Registros`
  - `Importações`
  - `Processamento`
  - `Auditoria`
  - `Configuração`
- O topo da navegação deve acomodar contexto organizacional (`tenant`, unidade, escopo ativo) quando existir.

### Navegação local

- Páginas densas devem usar **tabs** para separar modos ou grupos de informação.
- Subestados importantes devem refletir na URL sempre que possível.
- Evitar esconder informação crítica atrás de muitas camadas de clique.

### Layout-base

- `app shell` com sidebar + topbar utilitária + conteúdo principal.
- `context bar` persistente para filtros estruturais importantes.
- `page header` com título, estado, ação primária e ações secundárias.
- `right-side panel` para preview, histórico, auditoria ou comparação sem tirar o usuário da tela principal.

## Hierarquia funcional

Usar esta ordem mental ao priorizar informação:

1. Contexto ativo.
2. Exceções, desvios ou pendências.
3. Dado operacional principal.
4. Ações disponíveis.
5. Origem, histórico e impacto.

## Padrões de tela

### Home

- A home inicial não deve ser uma landing institucional.
- A primeira home pós-login deve funcionar como **ponto de entrada do app**.
- No início, priorizar:
  - contexto atual;
  - status de setup;
  - atalhos para administração/configuração;
  - próximos passos.
- Só evoluir para um briefing operacional mais rico quando já existirem dados e fluxos reais.

### Lista operacional

- Tratar tabela como estrutura central do produto.
- Incluir:
  - filtros fortes;
  - busca;
  - ordenação;
  - densidade adequada;
  - seleção com ações em lote;
  - views salvas quando o módulo justificar;
  - preview lateral quando isso reduzir navegação desnecessária.

### Detalhe

- Cabeçalho compacto com identificador, estado e ações.
- Tabs para separar `resumo`, `dados`, `histórico`, `auditoria` e itens relacionados.
- Sempre que fizer sentido, mostrar proveniência e última alteração perto do conteúdo principal.

### Formulário

- Formulários devem ser organizados por seções claras.
- Usar validação inline e resumo de erro quando necessário.
- Evitar wizard, exceto em onboarding/configuração complexa ou processos multi-etapa.
- Ações destrutivas ou de grande impacto devem ter preview ou confirmação contextual.

### Importação

- Fluxo recomendado:
  - upload;
  - mapeamento;
  - validação;
  - preview do impacto;
  - confirmação;
  - acompanhamento do processamento.

### Processamento

- Jobs precisam de status claro, progresso, erro legível e trilha de eventos.
- Sempre que possível, ligar o processamento aos registros ou períodos impactados.

### Auditoria

- Auditoria não deve viver só em uma tela isolada.
- Cada módulo deve oferecer acesso rápido a:
  - histórico;
  - diff;
  - origem do dado;
  - eventos recentes.
- A tela de auditoria transversal deve consolidar investigação e busca por evento.

## Administração e configuração

Na fase inicial do produto, a primeira área útil depois do login é **Configuração/Administração**.

Ela deve permitir cadastro manual inicial de:

- `tenant`;
- `member`;
- escopo e estruturas básicas relacionadas.

Regras para esta área:

- interface séria, simples e funcional;
- foco em `listagem + criação/edição`;
- sem transformar o fluxo inicial num wizard ainda;
- pronta para receber, no futuro, uma camada guiada por perguntas sobre os mesmos cadastros.

## Componentes prioritários

Obrigatórios:

- `data table`;
- filtros avançados;
- `command palette`;
- `right-side panel`;
- tabs de detalhe;
- badges de status;
- timeline de eventos;
- ações em lote;
- validação inline;
- estados de loading, vazio e erro bem resolvidos.

Diferenciais importantes:

- painel de explicação de número/desvio;
- comparação de versões;
- views salvas;
- modos de densidade visual;
- ações contextuais assistidas por IA.

## Composição e reutilização

Sempre que for possível, **semântica, estrutura de markup e comportamento** devem ser definidos em **componentes reutilizáveis**, e não recriados localmente em cada tela.

A **aparência, o layout recorrente e as variações visuais compartilhadas** devem ficar centralizados em `frontend/src/app/styles/`, por meio de tokens (`base.css`), primitives horizontais, componentes verticais e extensões utilitárias nos folhas correspondentes.

Isto vale especialmente para:

- cabeçalhos de página;
- tabelas e toolbars;
- filtros;
- formulários e campos;
- badges de status;
- tabs;
- drawers e painéis laterais;
- estados de loading, vazio e erro;
- ações contextuais recorrentes.

Objetivos desta regra:

- manter padrão visual e comportamental para o usuário;
- reduzir duplicação de código;
- evitar pequenas divergências entre telas que fazem “a mesma coisa”;
- facilitar manutenção, evolução e correção;
- permitir que mudanças de UX sejam feitas em um ponto mais central do sistema.

Ao implementar UI nova:

- preferir estender um componente existente antes de criar uma variação solta na página;
- criar componente novo quando o padrão tiver potencial real de reutilização;
- evitar copiar markup, estilos e lógica de interação entre telas;
- concentrar comportamento e API no componente, e concentrar variantes visuais e estruturais reutilizáveis nos folhas em `frontend/src/app/styles/` (ver mapa na secção de camadas);
- manter consistência entre estados, feedback, acessibilidade e atalhos do mesmo padrão.

## IA contextual

IA deve aparecer para reduzir fricção real, por exemplo:

- explicar um número ou desvio;
- resumir inconsistências;
- sugerir uma ação de correção;
- ajudar a montar filtro, busca ou consulta operacional.

Evitar:

- chat genérico como centro da aplicação;
- respostas sem contexto;
- automação opaca;
- ações irreversíveis sem preview.

## Guardrails visuais

- Desktop-first.
- Densidade visual média para alta.
- Poucos cards; usar cards apenas quando forem o melhor contêiner semântico.
- Tabelas e listas têm prioridade sobre mosaicos vazios.
- Contraste forte no conteúdo e ruído baixo no chrome.
- Tipografia e alinhamento devem transmitir precisão.
- Estados e feedback precisam ser discretos, claros e rápidos.

## Tema e tokens visuais

- A base atual da interface deve seguir `light theme`.
- O `light theme` não deve empurrar o produto para aparência leve demais, decorativa ou com contraste fraco.
- A fonte única de verdade dos tokens visuais do frontend deve ficar em `frontend/src/app/styles/base.css`, no bloco `:root` (o layout importa só esse arquivo; ele importa Tailwind e os demais folhas).
- Tokens visuais devem ser semânticos e cobrir, no mínimo:
  - cor de `background`, `surface`, `border`, `text`, ação primária e estados semânticos;
  - `radius`;
  - sombra;
  - largura de borda;
  - espaçamento estrutural;
  - densidade básica de controles.
- Componentes e páginas devem consumir tokens semânticos ou classes reutilizáveis baseadas nesses tokens.
- Evitar espalhar por componente:
  - `slate-*`, hex e cores estruturais hardcoded;
  - `rounded-*` estrutural;
  - sombra estrutural;
  - combinações locais de borda e superfície que já tenham padrão canônico.
- Quando houver dúvida entre ajustar um componente isolado ou melhorar a fundação visual, preferir melhorar a fundação.
- A manutenção do tema deve acontecer, idealmente, por ajuste de token ou de primitive reutilizável, e não por caça manual de classes em telas.

### Arquitetura CSS obrigatória

- Ajuste estrutural ou visual recorrente deve acontecer no folha adequado em `frontend/src/app/styles/`, não dentro do JSX do componente.
- O componente deve declarar o papel semântico do elemento e seus estados; o CSS define apresentação, layout e acabamento visual.
- Decisões como borda, ausência de borda, sombra, raio, fundo, espaçamento estrutural, largura e composição de layout não devem nascer como utilitário solto no componente quando fizerem parte do padrão da interface.
- Se um menu precisar de borda, o padrão deve existir como classe reutilizável ou modificador em `vertical-semantic-component.css` (ou em `semantic-utility-extension.css` quando for extensão de composição ou breakpoint compartilhado), por exemplo `ui-menu` com uma variação compartilhada de borda.
- O mesmo princípio vale para todos os elementos de interface: menu, painel, editor, toolbar, título, aba, card, lista, formulário e cabeçalho.
- Organizar o CSS global por arquivo em `frontend/src/app/styles/`:
  - `base.css`: `@import "tailwindcss"`, imports dos outros folhas, tokens em `:root`, reset global;
  - `horizontal-primitive.css`: primitives horizontais, superfícies e bordas genéricas;
  - `vertical-semantic-component.css`: componentes semânticos `ui-*` e a maior parte dos modificadores estáveis;
  - `semantic-utility-extension.css`: extensões utilitárias, composições recorrentes e `media queries` de layout.
- Em revisão de frontend, tratar como desvio:
  - componente com decisão visual estrutural repetível embutida em `className`;
  - mesma solução de borda, painel ou espaçamento reescrita em mais de um lugar;
  - componente que deixa de ser semanticamente simples porque passou a carregar detalhes de acabamento visual do produto.

### Convenção de camadas e nomes

Usar **cinco camadas conceituais** estáveis, refletidas nos folhas em `frontend/src/app/styles/`:

| Camada | Onde implementar |
|--------|-------------------|
| 1. Tokens horizontais | `base.css` (`:root`) |
| 2. Primitives horizontais | `horizontal-primitive.css` |
| 3. Componentes verticais semânticos | `vertical-semantic-component.css` |
| 4. Modificadores verticais | principalmente `vertical-semantic-component.css`; extensões de composição ou responsivo em `semantic-utility-extension.css` quando couber |
| 5. Estados | convenção `data-*`, `aria-*`, `is-*` no arquivo onde vive o seletor do componente |

#### 1. Tokens horizontais

**Arquivo:** `frontend/src/app/styles/base.css` (`:root`).

Guardam matéria-prima visual que pode servir a qualquer parte do produto.

Padrões de nome:

- `--color-*`
- `--font-*`
- `--space-*`
- `--radius-*`
- `--shadow-*`
- `--border-width-*`
- `--density-*`
- `--z-*`, quando houver necessidade real

Exemplos:

- `--color-border`
- `--color-surface`
- `--space-panel`
- `--shadow-sm`
- `--radius-card`

#### 2. Primitives horizontais

**Arquivo:** `frontend/src/app/styles/horizontal-primitive.css`.

Agrupam decisões visuais reutilizáveis, ainda sem falar de um elemento específico.

Padrões de nome:

- `ui-surface-*`
- `ui-border-*`
- `ui-tone-*`
- `ui-layout-*`
- `ui-density-*`
- `ui-flow-*`, quando o padrão de ritmo vertical for recorrente

Exemplos:

- `ui-surface-default`
- `ui-surface-muted`
- `ui-border-subtle`
- `ui-border-strong`
- `ui-tone-danger`
- `ui-layout-two-column`

#### 3. Componentes verticais semânticos

**Arquivo:** `frontend/src/app/styles/vertical-semantic-component.css`.

Representam elementos reais da interface. Esta é a camada que o JSX deve preferir expor.

Padrões de nome:

- `ui-menu`
- `ui-panel`
- `ui-card`
- `ui-title`
- `ui-toolbar`
- `ui-tab-list`
- `ui-tab`
- `ui-form-section`
- `ui-field`
- `ui-table`
- `ui-sidebar`
- `ui-topbar`

Regra:

- o vertical consome tokens e primitives horizontais;
- o componente não redefine localmente o que já faz parte do padrão visual daquele elemento.

#### 4. Modificadores verticais

**Arquivo:** principalmente `frontend/src/app/styles/vertical-semantic-component.css`; quando o modificador for sobretudo composição ou ajuste por breakpoint compartilhado, usar `semantic-utility-extension.css`.

Especializam um elemento sem quebrar sua semântica base.

Padrões de nome:

- `ui-menu-bordered`
- `ui-menu-compact`
- `ui-panel-editor`
- `ui-panel-context`
- `ui-panel-sticky`
- `ui-title-page`
- `ui-title-section`
- `ui-field-inline`

Regra:

- modificador existe para variação recorrente;
- se a variação só existe porque um único componente foi desenhado de forma isolada, ela ainda não merece nome.

#### 5. Estados

**Arquivo:** o folha que contém o seletor base do componente (qualquer um dos três folhas de UI acima).

Preferir atributos nativos ou semânticos quando existirem.

Ordem de preferência:

1. `data-*` ou `aria-*` já expostos pelo elemento ou biblioteca.
2. classe `is-*` quando o estado precisar ser explicitado pelo projeto.

Padrões de nome:

- `is-active`
- `is-open`
- `is-selected`
- `is-disabled`
- `is-delete-pending`

Exemplos de seletores aceitáveis:

- `.ui-tab[aria-selected="true"]`
- `.ui-menu[data-state="open"]`
- `.ui-panel.is-delete-pending`

### Regra de uso no JSX

- Preferir `<div className="ui-menu">`.
- Quando houver variação estável, preferir `<div className="ui-menu ui-menu-bordered">`.
- Evitar usar primitives horizontais diretamente no JSX, exceto ao construir uma primitive nova ou uma composição realmente genérica.
- Evitar `className` com mistura local de `border`, `bg`, `shadow`, `rounded`, `px`, `py`, `gap` e similares para resolver padrão recorrente.

### Heurística prática

- Horizontal responde: "quais materiais e regras visuais existem no sistema?"
- Vertical responde: "que elemento de interface isto é?"
- Modificador responde: "qual variação estável deste elemento eu quero?"
- Estado responde: "em que condição este elemento está agora?"

## O que evitar

- aparência de admin template genérico;
- telas bonitas mas pouco operacionais;
- excesso de espaços vazios com pouca informação;
- esconder contexto ativo;
- enterrar auditoria ou histórico;
- fluxo com cliques extras sem ganho real;
- modismos visuais que prejudiquem velocidade ou leitura.

## Ordem recomendada de implementação da interface

Para a evolução incremental do produto, seguir esta ordem:

1. fundação do frontend e `app shell`;
2. login UI-first;
3. home pós-login mínima;
4. administração/configuração inicial;
5. arquitetura dos módulos futuros;
6. autenticação real;
7. evolução da home para workspace operacional completo.

## Referências internas

- [vision/solution-overview.md](../../../vision/solution-overview.md)
- [architecture/system-principles.md](../../../architecture/system-principles.md)
- [architecture/technology-stack.md](../../../architecture/technology-stack.md)
- [skills/implementation/i18n/policy.md](../../../skills/implementation/i18n/policy.md)
