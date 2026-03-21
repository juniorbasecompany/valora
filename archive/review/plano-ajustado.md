# Plano ajustado

## Conclusão de aderência

O material atual está **conceitualmente bem aderente**, mas **ainda não está totalmente aderente ao objetivo final mostrado na imagem**.

Minha leitura é esta:

- a base arquitetural está boa;
- a leitura do negócio avícola está boa;
- a tradução das planilhas para um motor diário, auditável e orientado por evento está boa;
- porém, o projeto ainda está **incompleto na camada econômico-gerencial e na camada de painel operacional**.

Em termos práticos, eu classificaria assim:

- **aderência alta para produção, cronograma, previsto x realizado e simulação**;
- **aderência parcial para faturamento**;
- **aderência fraca para lucro e controle de custo**;
- **aderência parcial para reproduzir exatamente o BI da imagem**.

## O que encontrei nas planilhas

### 1. Acompanhamento operacional e BI

Na pasta 'C:\jr\GoogleDrive\jr\Valora\app', a planilha 'Sao Joao - Acomp22 - V1 (1).xlsx' concentra a lógica mais próxima do resultado da imagem.

Ela já tem uma estrutura importante:

- abas 'OvoTotal', 'Aprov', 'Idade', 'Produção', 'Outros', 'Dados', 'DadoEntr' e 'BI';
- comparação entre previsto e realizado;
- série de produção prevista;
- série de incubável ou aproveitável prevista;
- série realizada;
- faturamento previsto;
- faturamento realizado;
- acumulado;
- saldo acumulado;
- filtro por núcleo ou lote;
- painel visual de gestão.

Isso mostra que o objetivo real não é apenas calcular produção. O objetivo é entregar um **painel gerencial por período**, com:

- produção;
- faturamento;
- acumulado;
- desvio;
- leitura por lote;
- consolidação.

### 2. Simulação de alojamento e ajuste de cronograma

As planilhas 'Sao Joao - Aloj22 - V1.xlsx', 'Ajuste Cronograma - v2.xlsx' e principalmente 'Modelo - Aloj - V75.xlsx' mostram que existe uma lógica forte de planejamento.

O 'Modelo - Aloj - V75.xlsx' revela pontos muito relevantes que ainda não ficaram explícitos o suficiente no plano:

- cálculo de mortalidade;
- quantidade por sexo;
- produção total;
- aproveitamento;
- ajuste;
- saldo;
- PCP.

Ou seja, o domínio não é apenas zootécnico. Ele também é:

- comercial;
- de programação;
- de estabilidade de atendimento.

### 3. Biblioteca padrão de curvas

A planilha 'Standards_Unificado v1.3 Global Eggs.xlsx' mostra que o negócio depende de uma biblioteca padrão de curvas por:

- local;
- linhagem;
- tipo;
- idade;
- indicador.

Aqui, 'curva' não significa apenas um gráfico visual.

No contexto dessas planilhas, 'curva' é uma **tabela padrão de comportamento esperado** de um indicador ao longo da idade da ave. Em outras palavras, é uma referência técnica que diz algo como:

- em determinada idade, a taxa de postura esperada é X;
- em determinada idade, o aproveitamento esperado é Y;
- em determinada idade, o peso médio esperado é Z.

Essas curvas funcionam como a base do cálculo previsto. O sistema consulta a curva aplicável e, a partir dela, projeta a produção, o aproveitamento, o faturamento e os desvios em relação ao realizado.

Essa planilha é evidência forte de que o sistema precisa ter uma camada formal de:

- curva padrão;
- versão da curva;
- origem da curva;
- vigência;
- indicador técnico;
- possibilidade de sobrescrita local.

### 4. Foco atual das planilhas

Pelas planilhas, o projeto hoje já cobre bem:

- produção de ovos;
- idade;
- aproveitamento ou incubável;
- faturamento;
- cronograma;
- saldo;
- consolidação por período;
- visualização gerencial.

Mas eu **não encontrei uma camada madura e explícita de custo e lucro** no material funcional atual.

Isso é o principal ponto de não aderência em relação ao objetivo que você descreveu.

## Revisão dos documentos

### 'Considerações de domínio.md'

Está bom como documento de arquitetura geral. Ele acerta ao separar:

- núcleo estrutural;
- conteúdo configurável por nicho;
- vigência;
- evento;
- atributo;
- fato materializado.

Para o projeto atual, ele é aderente como base de desenho, mas é abstrato demais para garantir o BI final.

### 'Planilhas.md'

Está bem alinhado com a ideia de transformar a lógica atual em sistema.

O documento acerta ao reconhecer:

- curvas por idade;
- evento com vigência;
- previsto x realizado;
- simulação;
- consolidação.

O problema é que ele ainda está mais forte em arquitetura do que em contrato funcional de entrega.

### 'Plano agrícola.md'

Está coerente como expansão multi-nicho, mas **não adiciona aderência direta ao objetivo principal atual**, que é avícola.

Ele é útil para não engessar o núcleo, mas não ajuda a fechar o painel final da imagem.

### 'Plano avícola.md'

É o documento mais aderente ao objetivo atual.

Ele cobre bem:

- lote;
- segmento;
- local;
- atributo configurável;
- regra;
- cálculo diário;
- previsto;
- realizado;
- simulação;
- consolidação.

Mesmo assim, ainda faltam elementos importantes para chegar ao resultado final.

### 'README.md'

Hoje não ajuda na aderência porque praticamente não documenta nada do produto.

## Onde o plano atual ainda não está aderente

### 1. Falta uma camada explícita de custo e lucro

O objetivo do projeto não pode parar em:

- produção;
- aproveitamento;
- faturamento.

Para decisão real do negócio, o sistema precisa fechar também:

- custo por lote;
- custo por período;
- custo por ovo;
- custo por ovo aproveitável;
- custo por caixa;
- lucro bruto;
- margem de contribuição;
- lucro operacional;
- variação entre margem prevista e margem realizada.

Sem isso, o sistema reproduz apenas metade da inteligência de gestão.

### 2. Falta uma modelagem explícita do fluxo comercial e operacional

As planilhas mostram sinais claros de operação orientada a:

- incubável;
- saldo;
- programação de atendimento.

Isso precisa entrar formalmente no plano.

Hoje o plano fala bem de produção e consolidação, mas fala pouco de:

- embalagem;
- unidade comercial;
- expedição;
- atendimento por janela;
- saldo comercial e operacional.

### 3. Falta um contrato explícito do BI final

O projeto precisa declarar formalmente quais painéis devem existir.

Hoje isso está implícito. Deveria estar explícito.

O painel-alvo da imagem depende, no mínimo, de:

- série por período de ovos previstos;
- série por período de incubável ou aproveitável previsto;
- série por período de ovos realizados;
- série por período de faturamento previsto;
- série por período de faturamento realizado;
- faturamento acumulado;
- saldo por período;
- saldo acumulado;
- filtro por indicador;
- filtro por núcleo ou lote;
- painel resumido por período selecionado.

### 4. Falta uma ponte formal entre cálculo diário e visão por período

O plano está correto ao insistir em cálculo diário.

Portanto, o projeto precisa declarar explicitamente:

- calendário diário como base;
- visão por período oficial derivada do cálculo diário;
- acumulado por período como agregação derivada;
- comparação por período previsto x realizado;
- fotografia gerencial por período selecionado;
- possibilidade de materialização analítica ou instantâneo derivado para performance, sem criar uma segunda fonte primária.

Sem essa ponte, o sistema fica tecnicamente certo, mas funcionalmente distante da operação.

### 5. Falta uma biblioteca formal de curva padrão

As planilhas padrão mostram que a produção depende de curva técnica por:

- linhagem;
- local;
- tipo;
- idade;
- indicador.

Mais uma vez, aqui 'curva técnica' significa uma **sequência de valores esperados por idade** para um indicador específico.

Exemplos:

- curva de postura: percentual esperado de produção por idade;
- curva de mortalidade: perda esperada por idade ou fase;
- curva de aproveitamento: percentual esperado de ovos aproveitáveis por idade;
- curva de peso: peso médio esperado do ovo por idade.

Essas curvas são o equivalente técnico de uma tabela de referência que alimenta o cálculo previsto. O gráfico é só a visualização final dessa tabela.

Isso deve virar um componente formal do sistema, com:

- cadastro de curva;
- versão;
- origem;
- vigência;
- granularidade;
- escopo;
- indicador aplicável;
- regra de fallback;
- comparação entre padrão e realizado.

### 6. Falta uma camada robusta de preço e faturamento

O faturamento não deveria ser tratado apenas como preço simples vezes quantidade.

No negócio de ovos, o modelo precisa suportar pelo menos:

- preço por classe;
- preço por canal;
- preço por destino;
- preço por vigência;
- fato financeiro sempre registrado em moeda local;
- conversão cambial apenas na consulta ou no relatório, se aplicável;
- regra de conversão de unidade;
- diferença entre ovo total, ovo aproveitável, incubável e classe comercial faturável.

### 7. Falta governança de entrada do realizado

As planilhas têm uma separação prática entre base de entrada, cálculo e BI.

O sistema precisa formalizar isso em camadas:

- entrada manual;
- importação;
- cálculo;
- consolidado;
- painel.

Também precisa prever:

- validação de consistência;
- rastreio de alteração;
- reprocessamento controlado.

## Sugestões de melhoria no plano

## 1. Declarar explicitamente o objetivo funcional final

Adicionar ao plano uma seção de objetivo funcional com esta ideia:

> O sistema deve reproduzir e superar o painel gerencial por período, conforme hoje montado nas planilhas, entregando produção prevista, produção realizada, incubável ou aproveitável, faturamento previsto, faturamento realizado, saldo do período, saldo acumulado, consolidado por lote ou núcleo e capacidade de simulação de cronograma.

## 2. Criar um módulo econômico completo

Adicionar um módulo específico de economia do lote, com:

- faturamento bruto;
- custo variável;
- custo fixo alocado;
- custo total;
- custo por ovo;
- custo por ovo aproveitável;
- custo por caixa;
- margem de contribuição;
- lucro bruto;
- lucro operacional.

### Custo mínimo que o sistema deve suportar

- ração;
- embalagem;
- mão de obra;
- energia;
- sanidade;
- frete;
- manutenção;
- depreciação;
- custo da ave;
- overhead alocado.

### Fórmulas gerenciais recomendadas

- 'plantel_final = plantel_inicial - mortalidade - descarte +/- transferência'
- 'ovo_total = plantel_médio x taxa_de_postura x dia'
- 'ovo_aproveitável = ovo_total x percentual_de_aproveitamento'
- 'faturamento_bruto = soma(volume_faturável x preço_vigente)'
- 'lucro_operacional = faturamento_bruto - custo_total'
- 'margem = lucro_operacional / faturamento_bruto'

## 3. Criar uma camada comercial e operacional

O plano deve passar a tratar explicitamente:

- unidade comercial;
- caixa;
- bandeja, se aplicável;
- saldo comercial;
- saldo acumulado;
- programação de atendimento.

Isso é necessário porque as planilhas de simulação e acompanhamento já trabalham com essa lógica de saldo, programação e atendimento.

## 4. Formalizar a biblioteca de padrão técnico

Criar no plano uma camada de 'standard_curve', mesmo que o nome físico final seja outro.

Essa camada deve representar tabelas padrão de referência por idade, linhagem, local e indicador, usadas pelo motor para calcular o comportamento esperado do lote ao longo do tempo.

Essa camada deve suportar:

- linhagem;
- local ou mercado;
- tipo de curva;
- indicador;
- idade;
- valor padrão;
- vigência;
- versão;
- origem.

Indicadores iniciais que deveriam nascer nessa biblioteca:

- taxa de postura;
- mortalidade padrão;
- aproveitamento padrão;
- peso do ovo;
- percentual por classe;
- qualquer outro indicador técnico recorrente.

## 5. Definir fatos materializados e saídas derivadas

Hoje o plano fala em fato diário materializado. Isso está certo, e ele deve continuar sendo a base única e auditável do cálculo.

Além disso, eu recomendo explicitar também:

- fato diário;
- visão por período derivada oficialmente do fato diário;
- instantâneo gerencial derivado, quando fizer sentido para performance ou fechamento visual.

### Motivo

O painel da imagem trabalha com:

- período selecionado;
- saldo do período;
- acumulado;
- linha histórica por período.

Isso pede uma camada analítica por período bem definida, mas derivada do fato diário e não tratada como segunda fonte primária.

## 6. Definir o contrato do painel principal

Adicionar ao plano uma seção chamada algo como 'painel principal de gestão'.

Esse painel deve ter como saída mínima:

- produção prevista por período;
- produção realizada por período;
- incubável ou aproveitável previsto por período;
- faturamento previsto por período;
- faturamento realizado por período;
- faturamento acumulado previsto;
- faturamento acumulado realizado;
- saldo por período de produção;
- saldo acumulado de produção;
- saldo por período de faturamento;
- saldo acumulado de faturamento;
- filtro por lote, núcleo, local e período.

## 7. Formalizar previsto, realizado e previsão corrigida

Além de previsto e realizado, o projeto deveria assumir explicitamente uma terceira camada:

- previsão corrigida.

Isso é importante porque, na prática, o gestor quer ver:

- o orçamento original;
- o que de fato aconteceu;
- a nova projeção do restante do ciclo.

Esse ponto melhora muito a utilidade gerencial do sistema.

## 8. Criar uma trilha de explicação por indicador

Para cada ponto do gráfico, o sistema deveria conseguir explicar:

- qual lote compôs o valor;
- qual curva foi usada;
- qual preço foi usado;
- qual ajuste estava vigente;
- qual evento alterou o saldo;
- qual custo compôs o lucro.

Quando eu digo 'qual curva foi usada', quero dizer exatamente qual tabela de referência alimentou aquele cálculo. Exemplo: qual curva de postura da linhagem X, na idade Y, com a versão Z.

Isso é essencial para substituir a confiança informal da planilha por confiança formal no sistema.

## 9. Criar um mapa explícito de migração das planilhas

Eu recomendo incluir no plano uma tabela de migração com esta lógica:

- 'Standards_Unificado v1.3 Global Eggs.xlsx' -> biblioteca de curva padrão;
- 'Modelo - Aloj - V75.xlsx' -> motor de simulação, saldo e programação;
- 'Sao Joao - Aloj22 - V1.xlsx' -> cenário simplificado de cronograma;
- 'Sao Joao - Acomp22 - V1 (1).xlsx' -> entrada do realizado, consolidação e BI;
- 'Ajuste Cronograma - v2.xlsx' -> ajuste de programação e redistribuição.

Essa tabela ajuda muito a evitar perda de conhecimento na transição.

## 10. Prioridade recomendada de ajuste

### Prioridade 1

Fechar o contrato funcional do BI final.

### Prioridade 2

Fechar a modelagem econômica de custo e lucro.

### Prioridade 3

Fechar a modelagem comercial e operacional de saldo e programação.

### Prioridade 4

Formalizar a biblioteca padrão de curva.

### Prioridade 5

Definir importação, validação e fechamento do realizado.

## Parecer final

Os documentos atuais **não estão errados**. Pelo contrário: a base está boa e o 'Plano avícola.md' está bem próximo do que precisa.

Mas, se o objetivo principal do projeto é realmente chegar ao resultado da imagem, então a aderência atual é:

- **boa na espinha dorsal técnica**;
- **boa na lógica zootécnica e de previsão**;
- **boa na lógica de previsto x realizado**;
- **parcial na lógica gerencial por período do painel**;
- **insuficiente na parte de custo, lucro e controle econômico completo**.

Minha conclusão objetiva é:

> o projeto já está no caminho certo, mas ainda precisa incorporar explicitamente a camada econômica, a camada comercial-operacional e o contrato formal do BI por período para ficar totalmente aderente ao objetivo final.
