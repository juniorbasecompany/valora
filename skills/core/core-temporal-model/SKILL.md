---
name: core-temporal-model
description: Use quando modelar ou revisar o núcleo estrutural fixo do sistema: entidade, escopo hierárquico, vigência, rastreabilidade, integridade e contrato do fato diário materializado em todo nicho suportado.
---

# Núcleo temporal

Use esta skill para decisão estrutural que precisa permanecer estável entre nichos.
Use os princípios globais definidos em `architecture/system-principles.md` e detalhe aqui a aplicação estrutural da mudança.

Leia estas referências conforme necessário:
- `references/entities.md` para entidade estrutural e limite do núcleo.
- `references/temporal-rules.md` para vigência e reconstrução.
- `references/scope-hierarchy.md` para resolução de escopo e fallback.

## Fluxo

1. Confirme que a mudança realmente pertence ao núcleo compartilhado.
2. Delimite entidade estrutural, identidade e fronteira com vocabulário de nicho.
3. Defina como a mudança entra por evento e como a vigência será reconstruída.
4. Modele a hierarquia de escopo e os critérios de resolução do contexto persistido.
5. Defina contrato de histórico, auditoria e reconstrução.
6. Defina contrato do fato diário materializado e sua proveniência.

## Entregáveis

- Modelo de entidade estrutural.
- Regra temporal de vigência e histórico.
- Definição de hierarquia de escopo e fallback.
- Contrato de fato diário com proveniência e versionamento.
