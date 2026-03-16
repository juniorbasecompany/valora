# Planilhas e sistema: como o plano converte a lógica atual em uma solução robusta

## 1. Objetivo deste documento

Este documento explica como o plano preserva a essência técnica das planilhas atuais e a transforma em um sistema robusto, auditável e escalável.

A ideia não é substituir o raciocínio das planilhas, e sim incorporá-lo de forma estruturada, para que o conhecimento operacional continue existindo sem depender de arquivos manuais, fórmulas frágeis e consolidações difíceis de manter.

## 2. O que as planilhas já fazem bem

As planilhas analisadas já carregam conhecimento técnico valioso. Em especial, elas expressam:

- visão por lote e aviário;
- raciocínio de ciclo completo, da recria à produção e ao descarte;
- influência forte da idade da ave sobre a produção;
- metas e curvas de comportamento ao longo do tempo;
- separação entre indicadores de volume e de qualidade;
- preocupação com cronograma, distribuição etária e estabilidade futura;
- uso de premissas práticas para mortalidade, aproveitamento, produtividade e faturamento.

Em outras palavras, as planilhas não são apenas um repositório de números. Elas já funcionam como um modelo operacional do negócio.

## 3. Onde está a fragilidade das planilhas

O problema central não está na lógica, mas no meio em que ela está implementada.

Em planilhas, normalmente surgem estas limitações:

- dependência de fórmulas espalhadas e difíceis de auditar;
- consolidação manual ou semiautomática;
- dificuldade para tratar histórico de mudanças;
- risco de sobrescrever premissas antigas;
- dificuldade para rastrear por que um valor foi calculado;
- baixa escalabilidade para múltiplos lotes, locais, transferências e cenários;
- comparação previsto x realizado feita de forma trabalhosa;
- risco de divergência entre planilhas paralelas.

O plano proposto ataca essas fragilidades sem perder a lógica que tornou as planilhas úteis.

## 4. Paralelo direto entre planilhas e sistema

## 4.1 Curvas e metas por idade

### Nas planilhas

A idade da ave influencia quase tudo: produção, qualidade, pico, queda, descarte e valor econômico.

### No sistema

Essa mesma lógica passa a ser modelada por curvas padrão por idade, combinadas com eventos vigentes. O sistema preserva o comportamento observado nas planilhas, mas com rastreabilidade e versionamento.

## 4.2 Premissas que mudam ao longo do tempo

### Nas planilhas

É comum alterar mortalidade, aproveitamento, preço ou outra premissa em determinado ponto do ciclo.

### No sistema

Cada alteração vira um evento com data de início de vigência. O valor passa a valer daquele ponto em diante, até outro evento substituí-lo ou até o fim do lote.

Esse é um dos pontos mais importantes do plano, porque reflete melhor a realidade operacional e evita intervalos artificiais montados manualmente.

## 4.3 Lote, aviário e movimentações

### Nas planilhas

O controle costuma estar muito ligado a lote e aviário, incluindo mudanças de localização e necessidade de redistribuir quantidades.

### No sistema

O modelo passa a trabalhar com lote, segmento e local hierárquico. Quando parte do lote é transferida, o sistema cria ou ajusta segmentos, preservando a história e permitindo cálculo correto por data e por local.

## 4.4 Volume e qualidade separados

### Nas planilhas

Não basta medir só quantidade total. Há separação entre ovos totais, aproveitáveis, MI, ME, percentual >60 e outros indicadores de qualidade.

### No sistema

Esses indicadores passam a ser fatos de primeira classe do modelo. O cálculo e o realizado devem registrar cada um separadamente, permitindo análise técnica e econômica mais fiel.

## 4.5 Cronograma como ferramenta de decisão

### Nas planilhas

O cronograma não serve apenas para registrar datas; ele é usado para pensar estabilidade produtiva, distribuição de idade e redução de picos e vales.

### No sistema

Essa lógica será preservada e ampliada com uma camada de simulação. Assim, o sistema não apenas mostra o cronograma atual, mas ajuda a testar alternativas e medir seus efeitos.

## 5. O que o plano acrescenta além das planilhas

O sistema traz ganhos que são difíceis de sustentar só com planilhas.

## 5.1 Rastreabilidade

Cada valor calculado poderá ser explicado:

- qual parâmetro foi usado;
- de onde ele veio;
- qual evento estava vigente;
- qual curva foi aplicada;
- qual fórmula gerou o resultado.

## 5.2 Histórico real de mudanças

Em vez de editar o passado, o sistema registra novas vigências. Isso preserva o histórico e permite entender quando e por que a premissa mudou.

## 5.3 Separação entre previsão, realizado e simulação

Nas planilhas, essas camadas frequentemente acabam misturadas. No sistema, elas ficam separadas:

- previsão para projetar;
- realizado para medir;
- simulação para decidir.

## 5.4 Consolidação automática

Totais por lote, local, mês ou empresa passam a ser resultado do cálculo diário consolidado, e não de fórmulas montadas manualmente em múltiplas abas.

## 5.5 Escalabilidade operacional

O sistema passa a suportar com segurança:

- muitos lotes ao mesmo tempo;
- múltiplos locais;
- transferências parciais;
- diferentes categorias de ave;
- cenários comparativos;
- painéis e alertas.

## 5.6 Operação multi-país com fato auditável estável

Como o projeto já assume escopo multi-país, a transição das planilhas para o sistema também precisa preservar uma regra importante:

- fato econômico auditável persistido apenas na moeda local da operação;
- conversão para outra moeda tratada apenas como visualização derivada;
- país resolvido no contexto persistido quando houver fato econômico;
- timestamp persistido em UTC com exibição no fuso horário local da operação ou do usuário.

Isso evita que relatório convertido ou contexto momentâneo do usuário passe a substituir o fato operacional auditável.

## 6. Estruturas das planilhas que o sistema deve respeitar

Para que a migração preserve a inteligência operacional já existente, o sistema precisa respeitar estes pilares observados nas planilhas:

### 6.1 Cálculo diário como base

Mesmo quando a análise final é mensal, a lógica real nasce no dia a dia. O sistema adota exatamente essa base.

### 6.2 Leitura por lote e por agrupamento

As planilhas permitem olhar casos específicos e também consolidados. O sistema deve manter essa dupla visão.

### 6.3 Uso de padrões técnicos

As planilhas embutem premissas de idade de transferência, descarte, produtividade e comportamento esperado. O sistema não deve ignorar isso; deve formalizar essas premissas como parâmetros auditáveis.

### 6.4 Foco em estabilidade, não só em volume

As planilhas mostram preocupação com curvas futuras mais estáveis. O sistema, portanto, precisa medir não só produção, mas também volatilidade e concentração de eventos.

## 7. Tradução prática da lógica das planilhas

Abaixo está a tradução do raciocínio atual para os componentes do sistema.

| Lógica observada nas planilhas | Tradução no sistema |
|---|---|
| Produção depende da idade | Curvas padrão por idade + eventos vigentes |
| Premissas mudam ao longo do ciclo | Eventos de parâmetro com vigência por data |
| Parte do lote pode mudar de local | Segmentação do lote por evento operacional |
| Controle por aviário/local | Hierarquia de locais com consolidação |
| Separação entre total e classes de qualidade | Indicadores próprios para total, aproveitável, MI, ME, >60 |
| Cronograma influencia estabilidade | Módulo de simulação e análise de cenários |
| Comparação entre esperado e resultado | Camada de previsto x realizado x desvio |
| Ajustes finos em datas e quantidades | Eventos auditáveis e cenários alternativos |

## 8. O que muda na prática para o criador das planilhas

O conhecimento construído nas planilhas continua valendo. O que muda é a forma de operar.

Em vez de depender de:

- abas interligadas;
- fórmulas difíceis de revisar;
- cópias de arquivos;
- ajustes manuais de datas e quantidades;
- consolidações frágeis;

passa-se a ter:

- um modelo único de dados;
- regras explícitas;
- histórico preservado;
- cálculo reproduzível;
- comparação automática entre previsto e realizado;
- simulação formal de cenários.

## 9. Mensagem principal para a transição

O plano não joga fora a inteligência das planilhas.

Ao contrário: ele parte do entendimento de que as planilhas já expressam boa parte da lógica do negócio. O objetivo do sistema é capturar essa inteligência, dar estrutura a ela e remover os pontos frágeis que surgem quando a operação depende de arquivos manuais.

## 10. Resultado esperado

Quando implementado, o sistema deverá entregar o que hoje as planilhas tentam fazer, porém com ganhos importantes:

- mais confiabilidade;
- mais rastreabilidade;
- mais facilidade para consolidar;
- mais segurança para alterar premissas;
- mais capacidade de simular cenários;
- mais apoio à decisão operacional e econômica.

Em resumo, a proposta é sair de um conjunto de planilhas inteligentes, porém frágeis, para um sistema que preserve a mesma inteligência de negócio de forma robusta, contínua e escalável.
