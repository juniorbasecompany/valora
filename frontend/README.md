# frontend

Projeto da interface web do sistema.

## Objetivo

Esta pasta concentra a aplicação de frontend, com dependências, ferramenta de build e fluxo de desenvolvimento próprios.

## Isolamento de dependência

As dependências do frontend devem ser instaladas apenas nesta pasta, por meio do `package.json`.

Exemplo com `npm`:

```bash
npm install <package>
```

## Bootstrap atual

O frontend foi inicializado com:

- `Next.js` com `App Router`;
- `TypeScript`;
- `Tailwind CSS`;
- `next-intl` como base de i18n.

## Estrutura inicial

- `src/app/`: rotas e layout base da aplicação;
- `src/component/app-shell/`: componentes reutilizáveis da shell base;
- `src/i18n/`: configuração inicial de locale e request;
- `messages/`: catálogo de mensagens por locale.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
```

## Observações

- O locale inicial configurado é `pt-BR`.
- A rota `/` redireciona para `/${locale}/login` ou `/${locale}/app`, conforme a sessão simulada.
- A shell base da aplicação já inclui `sidebar`, `topbar`, área principal, cabeçalho de página e estados iniciais de loading/erro.
- O fluxo de `login` UI-first já existe com proteção simulada por cookie para a área `/${locale}/app`.
- Quando a integração com backend entrar, o frontend deve consumir a API por variável `NEXT_PUBLIC_API_BASE_URL`.
- Em desenvolvimento, a estratégia preferencial é apontar essa variável para o backend local levantado pelo ambiente do repositório.
- A autenticação real e a integração com backend entram nas próximas fases do plano em `.cursor/plans/plan-frontend-valora.md`.
