# Princípios do sistema

## Decisões permanentes

- O grão nativo de cálculo do sistema é diário.
- Mudança de comportamento entra por evento, com vigência a partir de uma data.
- O histórico operacional deve ser rastreável, versionado e reconstruível.
- O núcleo estrutural é compartilhado entre nichos.
- A arquitetura separa estrutura fixa, metadado configurável e pacote de nicho.
- A estrutura fixa concentra identidade, relacionamento, escopo, vigência, auditoria, versionamento, integridade e fato diário materializado.
- O metadado configurável concentra atributo, classificação, catálogo de evento, fórmula, agregação, unidade e terminologia exibida.
- O pacote de nicho concentra vocabulário, indicador, validação e fórmula específicos do domínio.
- O sistema é orientado por metadado governado, e não por coluna fixa de domínio.
- Referência temporal de negócio, como idade, estágio, safra e janela operacional, entra como atributo, classificação ou regra resolvida no dia, nunca como eixo nativo separado.
- Qualidade, capacidade e indicador de nicho são conceitos configuráveis e governados, e não campos rígidos do núcleo.
- O sistema deve suportar mais de um eixo de classificação sobre a mesma entidade quando o nicho exigir.
- Todo valor derivado tratado como verdade oficial precisa ter origem e proveniência explícitas.
- O fato econômico auditável é persistido apenas na moeda local da operação.
- Conversão cambial existe apenas em consulta ou relatório.
- O país persistido de um fato econômico deve ser resolvido por contexto operacional explícito, nunca pelo contexto mutável do usuário.
- Timestamp é persistido em UTC e exibido no contexto local.
- País pode existir no escopo quando necessário, sem virar rigidez estrutural para todo fluxo.
- Texto exibido ao usuário deve ser governado por metadado ou catálogo de mensagens com chave técnica estável e resolução contextual na exibição.
- A resolução contextual de texto deve seguir a ordem oficial de fallback: país, local, usuário.
- Painel e visão por período devem nascer da base diária oficial, nunca de número paralelo sem proveniência.
- Previsão base, realizado, previsão corrigida e simulação são camadas distintas do sistema.

## Limites que não devem ser rompidos

- O núcleo não deve ser contaminado por vocabulário específico de um nicho.
- O modelo não deve assumir que toda entidade tenha semântica específica de um único nicho.
- JSONB pode apoiar flexibilidade, mas não substitui semântica estrutural nem governança.
- Realizado não sobrescreve previsão base.
- Simulação não altera histórico de produção.
- Valor convertido para relatório não deve ser persistido como fato econômico de origem.
- Material de referência não substitui decisão arquitetural nem contrato operacional.
