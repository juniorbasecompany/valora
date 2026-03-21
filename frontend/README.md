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

## Tema e tokens visuais

- A base visual atual do frontend usa `light theme`.
- A fonte única de verdade dos tokens visuais fica em `src/app/globals.css`.
- Esse ponto central deve concentrar tokens semânticos de cor e primitives recorrentes de layout, como `radius`, borda, sombra e densidade.
- Componentes devem preferir consumir tokens semânticos e classes reutilizáveis `ui-*`, evitando espalhar cores estruturais e primitives hardcoded por página.
- A direção estável de interface continua em `.cursor/skills/interface-product-direction/SKILL.md`.

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
- A rota `/` redireciona para `/${locale}/login` ou `/${locale}/app`, conforme a sessão autenticada.
- A shell base da aplicação já inclui `sidebar`, `topbar`, área principal, cabeçalho de página e estados iniciais de loading/erro.
- O fluxo de `login` agora usa Google Identity Services no frontend e rotas BFF em `src/app/api/auth/**` para gravar o token do app em cookie `httpOnly`.
- As variáveis mínimas do frontend são:

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

- A tela de login pode levar o usuário direto para `/${locale}/app` ou para `/${locale}/select-tenant`, conforme os vínculos disponíveis entre `account`, `tenant` e `member`.
- Em desenvolvimento, a estratégia preferencial é apontar `NEXT_PUBLIC_API_URL` para o backend local levantado pelo ambiente do repositório.
