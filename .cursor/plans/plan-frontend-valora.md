# Plano: frontend do Valora

## Objetivo

Este é o plano-mãe da interface do Valora.

Ele concentra, em um único lugar, a ordem de implementação do frontend, a definição da primeira entrega útil e os checkpoints práticos de i18n que precisam acompanhar cada fase.

As regras estáveis de interface e i18n continuam fora daqui:

- direção de interface: [../skills/interface-product-direction/SKILL.md](../skills/interface-product-direction/SKILL.md)
- política de i18n: [../../skills/implementation/i18n/policy.md](../../skills/implementation/i18n/policy.md)
- instrução operacional de i18n: [../../skills/implementation/i18n/SKILL.md](../../skills/implementation/i18n/SKILL.md)

## Decisões já fechadas

- [x] A direção de produto da interface é **Operational Workspace com Audit Spine**.
- [x] A experiência inicial não será uma landing institucional.
- [x] O fluxo inicial será `login -> /app -> Configuração/Administração`.
- [x] A primeira área útil do produto será **Configuração/Administração**.
- [x] O cadastro inicial será manual, sem wizard nesta fase.
- [x] O i18n entra desde o princípio do frontend.

## Resultado que queremos alcançar

Chegar a um frontend que:

- [ ] tenha `app shell` consistente;
- [ ] permita login e entrada coerente no app;
- [ ] leve o usuário para uma home simples e útil;
- [ ] permita cadastro manual inicial de `tenant`, `member` e escopo;
- [ ] cresça depois para módulos operacionais, importação, processamento e auditoria;
- [ ] mantenha i18n aplicado desde a fundação, sem depender de refactor posterior.

## Escopo da primeira entrega

### Fluxo principal da v1

1. O usuário abre o sistema.
2. Cai em `login`.
3. Entra no app por um fluxo **UI-first**.
4. É direcionado para `/app`.
5. A home mostra próximos passos e atalho prioritário para `Configuração/Administração`.
6. O usuário faz o cadastro manual inicial.

### O que entra agora

- [x] fundação do `frontend/`;
- [ ] `app shell` inicial;
- [x] i18n inicial;
- [ ] login UI-first;
- [ ] home pós-login mínima;
- [ ] administração/configuração para cadastro estrutural inicial.

### O que não entra agora

- [ ] autenticação real completa;
- [ ] wizard guiado de onboarding;
- [ ] dashboard gerencial completo;
- [ ] automações avançadas por IA;
- [ ] módulos profundos de operação com dados reais.

## Contexto e decisões de produto para a home

### O que “home” significa neste projeto

| Conceito | Quem vê | Papel no produto |
|----------|---------|------------------|
| **Landing pública** | Visitante sem login | Opcional e futura |
| **Home da aplicação** | Usuário autenticado | Ponto de entrada útil e operacional |
| **Redirecionamento** | Qualquer | `/` envia para `login` ou `app` |

- [x] A recomendação adotada é tratar a **home principal como pós-login**.
- [ ] A decisão sobre eventual landing pública pode ser tomada depois, sem bloquear o frontend inicial.

### Direção da home inicial

- [x] A home inicial será um **hub mínimo**, não um dashboard cheio.
- [x] Ela deve mostrar contexto, próximos passos e acesso rápido à área de configuração.
- [ ] A evolução para um briefing operacional com widgets reais fica para fase posterior.

## Roadmap incremental

## Fase 1. Fundação do frontend, shell e i18n inicial

Objetivo: criar a base técnica e visual do frontend sem deixar i18n para depois.

### Implementação

- [x] Inicializar `frontend/` com `Next.js App Router`, `TypeScript` e `Tailwind CSS`.
- [x] Confirmar `next-intl` como base de i18n no frontend.
- [x] Definir locale inicial da primeira entrega.
- [x] Definir local de `messages/`.
- [x] Fechar convenção de chaves e namespaces.
- [x] Montar `app shell` base com:
  - [x] sidebar;
  - [x] topbar utilitária;
  - [x] área principal;
  - [x] cabeçalho de página;
  - [x] estados base de loading e erro.
- [x] Integrar provider de mensagens no layout raiz.
- [x] Garantir que strings novas entram por chave, não por literal solto.
- [ ] Definir fundação visual mínima:
  - [ ] densidade média para alta;
  - [ ] tipografia;
  - [ ] tokens de cor;
  - [ ] padrão de tabela;
  - [ ] padrão de formulário;
  - [ ] padrão de tabs e painel lateral.
- [x] Preparar README do frontend com `npm run dev`, variáveis `NEXT_PUBLIC_*` e estratégia de integração com API.

### Teste da fase

- [x] O frontend sobe localmente.
- [x] Existe uma shell navegável.
- [x] Pelo menos uma página já usa mensagens por chave.

## Fase 2. Login UI-first e roteamento inicial

Objetivo: criar a primeira entrada do produto sem depender ainda da autenticação real.

### Implementação

- [x] Criar página `login`.
- [x] Definir redirecionamento inicial `/ -> /login`.
- [x] Criar fluxo visual de entrada com estados:
  - [x] idle;
  - [x] loading;
  - [x] erro.
- [x] Implementar navegação protegida simulada no frontend.
- [x] Redirecionar após entrada para `/app`.
- [x] Garantir que as strings do fluxo de login já seguem i18n.
- [x] Preparar o layout para sessão real futura, sem acoplamento a mock difícil de remover.

### Teste da fase

- [x] Visitante chega em `login`.
- [x] O fluxo `login -> /app` funciona sem backend real.
- [x] Rotas internas já se comportam como área autenticada.

## Fase 3. Home pós-login mínima

Objetivo: entregar uma home útil, enxuta e claramente orientada à próxima ação.

### Implementação

- [x] Criar página principal em `/app`.
- [x] Mostrar contexto inicial da aplicação.
- [x] Exibir próximos passos de setup.
- [x] Exibir atalho destacado para `Configuração/Administração`.
- [x] Mostrar estado de setup inicial.
- [x] Reservar estrutura para evolução futura da home sem encher a tela de cards sem função.
- [x] Resolver estados de loading, vazio e erro.

### Conteúdo recomendado

- [x] bloco de boas-vindas curto e funcional;
- [x] resumo do estado de setup;
- [x] atalhos principais;
- [x] área “o que fazer agora”.

### Teste da fase

- [x] O usuário entende o próximo passo sem explicação externa.
- [x] O caminho até a área de cadastro inicial fica óbvio.

## Fase 4. Configuração/Administração inicial

Objetivo: entregar a primeira área realmente útil do produto.

### Prioridade funcional

- [ ] Cadastro de `tenant`.
- [ ] Cadastro de `member`.
- [ ] Cadastro de escopo e estruturas básicas relacionadas.

### Padrões de interface

- [ ] Listagem com busca e ação primária clara.
- [ ] Criação/edição com validação inline.
- [ ] Detalhe com tabs quando isso simplificar o crescimento futuro.
- [ ] Feedback claro de sucesso, erro e vazio.
- [ ] Preparar o desenho para receber histórico e auditoria depois.

### Checkpoints de contrato e i18n

- [ ] Definir contrato de erro com `code` estável e detalhe estruturado.
- [ ] Mapear erro de API por `code -> chave i18n`, não por substring de `message`.
- [ ] Usar `Intl` para data, número e moeda de exibição quando aparecerem na UI.

### Teste da fase

- [ ] O usuário consegue fazer manualmente o cadastro estrutural inicial.
- [ ] A base administrativa deixa de depender de planilha ou ajuste manual fora do sistema.

## Fase 5. Estrutura dos próximos módulos

Objetivo: estabilizar a arquitetura de informação antes de aprofundar cada área futura.

### Implementação

- [ ] Definir navegação e papel de `Operações`.
- [ ] Definir navegação e papel de `Registros`.
- [ ] Definir navegação e papel de `Importações`.
- [ ] Definir navegação e papel de `Processamento`.
- [ ] Definir navegação e papel de `Auditoria`.
- [ ] Definir o que permanece em `Configuração` e o que vira módulo próprio.
- [ ] Ajustar a sidebar para refletir a evolução natural do produto.

### Teste da fase

- [ ] A estrutura da navegação deixa claro para onde o produto vai crescer.
- [ ] Cada módulo futuro já tem um papel definido, mesmo sem implementação profunda.

## Fase 6. Autenticação real e contexto organizacional

Objetivo: substituir o fluxo UI-first por autenticação e proteção reais.

### Implementação

- [ ] Integrar login ao backend.
- [ ] Implementar sessão e proteção real de rotas.
- [ ] Ligar a experiência ao modelo `tenant` / `account` / `member`.
- [ ] Preparar troca de contexto organizacional quando isso entrar no frontend.

### Teste da fase

- [ ] A entrada no app deixa de ser simulada.
- [ ] A experiência autenticada passa a refletir identidade e contexto reais.

## Fase 7. Segundo locale e robustez de i18n

Objetivo: expandir o i18n depois que a base inicial estiver estável.

### Implementação

- [ ] Adicionar o segundo arquivo de mensagens.
- [ ] Configurar routing ou middleware de locale, se aplicável.
- [ ] Validar paridade de chaves entre locales.
- [ ] Revisar textos do frontend já implementado para garantir consistência entre locales.

### Teste da fase

- [ ] O segundo locale funciona sem chaves quebradas.
- [ ] A UI não mistura idiomas por descuido.

## Fase 8. Evolução da home para workspace operacional

Objetivo: transformar a home de ponto de entrada em briefing operacional.

### Implementação

- [ ] Mostrar pendências reais.
- [ ] Mostrar importações e processamentos recentes.
- [ ] Mostrar alertas e desvios relevantes.
- [ ] Mostrar atalhos contextuais para investigação e ação.
- [ ] Conectar a home a dados reais quando os módulos principais já existirem.
- [ ] Ajustar acessibilidade, performance e escala da experiência.

### Teste da fase

- [ ] A home passa a refletir a operação real.
- [ ] Os widgets ajudam a agir, e não só a olhar números.

## Cuidados permanentes

- [ ] Evitar aparência de admin template genérico.
- [ ] Evitar excesso de cards vazios e dashboards sem ação.
- [ ] Preservar contexto ativo em todas as telas importantes.
- [ ] Tratar tabela, formulário e auditoria como partes centrais da experiência.
- [ ] Não esconder informação crítica atrás de muitos cliques.
- [ ] Não misturar idioma da UI, locale de formatação e contexto operacional.
- [ ] Manter i18n aplicado desde o início, sem literais soltas em UI nova.
- [ ] Preparar o frontend para evolução sem retrabalho grande de layout.

## Decisões futuras que não bloqueiam a Fase 1

- [ ] Definir se existirá landing pública na mesma app ou separada.
- [ ] Definir rota canônica final entre `/`, `/app` e eventual `/dashboard`.
- [ ] Definir locales exatos da v2 e fallback final.

## Referências estáveis

- [../../architecture/technology-stack.md](../../architecture/technology-stack.md)
- [../../architecture/system-principles.md](../../architecture/system-principles.md)
- [../../vision/solution-overview.md](../../vision/solution-overview.md)
- [../../backend/src/valora_backend/model/identity.py](../../backend/src/valora_backend/model/identity.py)
- [../skills/interface-product-direction/SKILL.md](../skills/interface-product-direction/SKILL.md)
- [../../skills/implementation/i18n/policy.md](../../skills/implementation/i18n/policy.md)
- [../../skills/implementation/i18n/SKILL.md](../../skills/implementation/i18n/SKILL.md)
- [../../skills/application/multi-country-localization/SKILL.md](../../skills/application/multi-country-localization/SKILL.md)
