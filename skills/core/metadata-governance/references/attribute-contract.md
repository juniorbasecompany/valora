# Contrato de atributo

Cada atributo configurável deve definir ao menos:

- nome exibido;
- chave técnica;
- tipo de valor;
- papel de negócio no cálculo;
- granularidade;
- escopo permitido;
- comportamento de vigência;
- origem permitida;
- unidade e precisão;
- regra de agregação;
- fórmula opcional ou referência de curva;
- visibilidade em análise e painel;
- rótulo localizado opcional por localidade;
- comportamento opcional de sobrescrita por país quando o atributo participar de fallback.

## Tipos de texto exibido

O sistema deve distinguir pelo menos três categorias de texto exibido ao usuário:

- rótulo de domínio: nome exibido de atributo, classificação, entidade e pacote analítico;
- rótulo de apresentação: título, legenda, coluna, filtro e nome de métrica em painel e relatório;
- mensagem de UX: erro, validação, alerta, confirmação, ajuda contextual e texto de ação.

## Regra de governança

- este contrato governa diretamente o rótulo de domínio;
- rótulo de apresentação pode reutilizar o rótulo de domínio, mas deve declarar seu contexto próprio quando a exibição exigir ajuste;
- mensagem de UX não deve ficar embutida no contrato do atributo, mas em catálogo próprio de mensagens com chave técnica estável;
- todo texto exibido deve preservar chave técnica estável, mesmo quando o conteúdo textual variar por contexto.
