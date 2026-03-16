# cleber

Repositório de documentação canônica para a construção gradual de um sistema que substitui planilhas operacionais por uma solução robusta, auditável e evolutiva.

## Mapa do repositório

- `.cursor/rules/`: convenções persistentes do agente e de escrita aplicadas em toda sessão do projeto.
- `backend/`: projeto Python do núcleo executável, com dependência isolada do restante do repositório.
- `frontend/`: projeto web separado, com dependência própria e sem mistura com o backend.
- `skills/`: verdade operacional. Define como cada parte do sistema deve ser implementada.
- `architecture/`: verdade decisória curta. Registra princípios, limites e decisões permanentes.
- `vision/`: explicação humana. Mostra o que a solução faz e como ela evolui.
- `reference/`: material de consulta. Reúne apoio, plano anterior, nota conceitual e planilha-fonte.
- `archive/`: histórico superado. Guarda material que não deve mais orientar o desenho atual.

## Ordem de autoridade

1. `skills/`
2. `architecture/`
3. `vision/`
4. `reference/`
5. `archive/`

Quando houver conflito entre documentos, a camada de maior autoridade prevalece.

## Convenções persistentes do agente

- `.cursor/rules/` define convenções sempre ativas de idioma, escrita e nomenclatura.
- `skills/` orienta desenho e implementação.
- `architecture/` concentra princípios e decisões permanentes do sistema.

## Ordem sugerida de leitura

1. Comece por `.cursor/rules/` para entender as convenções persistentes de escrita e nomenclatura seguidas pelo agente.
2. Leia `vision/solution-overview.md` para entender o problema e a proposta da solução.
3. Leia `architecture/source-of-truth.md` e `architecture/system-principles.md` para entender as decisões permanentes.
4. Use `skills/` para orientar desenho e implementação.
5. Consulte `reference/` apenas quando precisar de contexto, origem ou exemplo de raciocínio anterior.
