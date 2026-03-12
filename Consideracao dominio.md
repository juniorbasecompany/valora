# Considerações sobre diferenças entre aves e soja

## 1. Ideia central comum

Os dois nichos podem usar o mesmo núcleo de sistema porque compartilham a mesma lógica estrutural:

- existe um recurso biológico principal alocado em um local;
- esse recurso permanece ativo por um período;
- eventos alteram quantidade, qualidade, custo, capacidade ou regra de cálculo;
- o sistema precisa prever, registrar realizado, simular cenário e consolidar resultado;
- o cálculo precisa ser temporal, auditável e materializado por dia.

Em termos de arquitetura, os dois cabem no mesmo mecanismo:

- espinha dorsal relacional;
- atributo configurável;
- classificação configurável;
- vigência temporal;
- fallback por escopo;
- fato diário materializado;
- reconciliação entre previsto e realizado.

## 1.1 Estrutura fixa versus conteúdo configurável

Para que o mesmo sistema funcione em vários nichos, é importante separar com clareza duas camadas:

- estrutura fixa do sistema;
- conteúdo configurável do nicho.

A estrutura fixa deve concentrar identidade, relacionamento, escopo, vigência, auditoria, versionamento, fato diário materializado e integridade.

O conteúdo configurável deve concentrar:

- atributo;
- classificação;
- evento;
- fórmula;
- agregação;
- unidade;
- terminologia exibida ao usuário;
- pacote analítico do nicho.

Essa separação é a principal defesa contra dois erros:

- transformar o sistema em um produto de aves com adaptações para soja;
- transformar o sistema em um repositório genérico de JSONB sem semântica operacional suficiente.

## 1.2 Contrato mínimo do atributo

Se o sistema é orientado por metadado, o atributo não pode ser apenas um nome solto cadastrado pelo usuário.

Cada atributo precisa ter semântica formal mínima, incluindo:

- nome exibido;
- tipo do valor;
- papel no cálculo;
- granularidade;
- regra de agregação;
- vigência;
- origem permitida;
- unidade e precisão;
- fórmula ou referência de cálculo, quando aplicável.

Isso é o que permite que `mortalidade`, `produtividade`, `umidade`, `custo` ou qualquer outro atributo sejam tratados pelo mesmo núcleo sem exigir mudança de schema.

## 2. Mapeamento conceitual entre os nichos

| Conceito comum | Aves | Soja |
| --- | --- | --- |
| unidade principal | lote | ciclo |
| subdivisão operacional | segmento do lote | segmento do ciclo |
| local | granja, aviário | fazenda, talhão |
| início do ciclo | alojamento | plantio |
| alteração operacional | transferência, descarte | replantio, manejo, colheita parcial |
| saída econômica | produção contínua de ovos | colheita concentrada ao fim do ciclo |
| capacidade | lotação física | área e janela operacional |

## 3. Diferenças que impactam o desenho funcional

### 3.1 Natureza da produção

Em aves, a produção é contínua durante boa parte do ciclo. O sistema precisa lidar com saída diária relevante, como produção, aproveitamento e qualidade.

Em soja, a maior parte do valor econômico se concentra na colheita. Antes disso, o sistema acompanha sinais preditivos, como estande, estágio, perda esperada, produtividade e custo acumulado.

Impacto:

- o mesmo motor serve para os dois;
- o conjunto de atributos materializados muda bastante;
- em soja, muitos fatos diários são de acompanhamento e projeção, não de receita realizada.

### 3.2 Comportamento do estoque biológico

Em aves, o plantel muda com mortalidade, descarte, transferência e ajustes de quantidade.

Em soja, a lógica principal não é estoque animal, mas área cultivada, população de planta, desenvolvimento fenológico e perda por ambiente, manejo ou clima.

Impacto:

- a abstração de quantidade precisa ser genérica;
- o sistema não pode assumir que toda unidade principal tenha `cabeça`, `peso vivo` ou `mortalidade`;
- a semântica do atributo precisa vir do cadastro.

### 3.3 Temporalidade operacional

Em ambos os nichos, o cálculo deve ser diário.

Idade, estágio fenológico, safra, janela operacional ou qualquer outra referência temporal de negócio não devem ser tratados como eixos de cálculo independentes, e sim como atributos resolvidos no próprio dia.

Impacto:

- o eixo temporal do motor deve ser sempre o dia;
- idade, estágio, safra, janela e evento devem entrar como atributo, classificação ou regra associada ao dia;
- isso preserva um único mecanismo de cálculo para vários nichos.

### 3.4 Tipo de evento

Em aves, eventos estruturais como transferência e descarte são frequentes.

Em soja, os eventos estruturais tendem a ser menos focados em movimentação física e mais focados em plantio, replantio, aplicação, perda, colheita e encerramento.

Impacto:

- o catálogo de evento deve ser configurável por nicho;
- a taxonomia de evento não pode nascer chumbada no sistema.

### 3.5 Qualidade e classificação comercial

Em aves, a qualidade pode envolver classe de ovo, aproveitamento, peso e quebra de padrão.

Em soja, a qualidade pode envolver umidade, impureza, avaria, proteína, óleo, desconto comercial e padrão de entrega.

Impacto:

- o sistema precisa tratar qualidade como atributo configurável;
- a regra de agregação e a regra econômica precisam ser parametrizáveis.

### 3.6 Capacidade e ocupação

Em aves, capacidade costuma significar lotação do local ao longo do tempo.

Em soja, capacidade envolve área física, disponibilidade operacional, janela de plantio, janela de colheita, máquina e restrição climática.

Impacto:

- `capacidade` não pode ser um conceito rígido;
- a restrição operacional precisa ser modelada como atributo e regra, não como campo fixo.

### 3.7 Realizado

Em aves, o realizado pode ter produção diária rica e contínua.

Em soja, o realizado tem forte peso em operações, custo, desenvolvimento e colheita, com longos períodos em que a receita ainda não aconteceu.

Impacto:

- o módulo de realizado precisa aceitar perfis de dado muito diferentes;
- um nicho pode ter grande volume de fato produtivo diário, enquanto outro tem grande volume de evento operacional e medição agronômica.

## 4. Diferenças que impactam o modelo analítico

### 4.1 Indicadores

Os indicadores não são os mesmos:

- aves: plantel, mortalidade, produção diária, aproveitamento, classe, faturamento recorrente;
- soja: área plantada, estande, estágio, produtividade esperada, volume colhido, umidade, impureza, custo, faturamento na colheita.

Impacto:

- o sistema deve entregar `capacidade de criar indicador`, e não um conjunto fixo de indicadores.

### 4.2 Granularidade útil

Em aves, a granularidade por segmento, dia e classificação zootécnica costuma ser suficiente para muitas análises.

Em soja, pode ser necessário descer para talhão, subárea, frente operacional, aplicação, amostragem, safra e cultivar.

Impacto:

- a granularidade precisa ser configurável;
- a entidade principal e a classificação não podem ser acopladas a um único nicho.

### 4.3 Curva de valor econômico

Em aves, o faturamento pode ser mais contínuo.

Em soja, o faturamento normalmente se concentra em momentos de comercialização e entrega.

Impacto:

- o motor econômico precisa aceitar regimes diferentes de reconhecimento;
- previsto, realizado e simulado não podem presumir receita distribuída de forma uniforme.

## 5. O que deve ser comum em um sistema único

Se o objetivo é ter um único sistema no futuro, estas partes devem ser realmente compartilhadas:

- cadastro de entidade principal;
- cadastro de segmento;
- cadastro de local hierárquico;
- cadastro de atributo;
- cadastro de classificação;
- cadastro de regra;
- catálogo de evento;
- vigência temporal;
- fallback por escopo;
- cálculo diário;
- fato diário materializado;
- trilha de auditoria;
- reconciliação entre previsto e realizado;
- simulação de cenário.

## 5.1 Pacote de nicho

O nicho não deve entrar como variação estrutural do banco nem como ramificação de código principal. Ele deve entrar como um pacote configurável e governado.

Esse pacote pode reunir, por exemplo:

- vocabulário exibido;
- catálogo de atributo;
- catálogo de classificação;
- catálogo de evento;
- conjunto de fórmula;
- validações;
- visão padrão;
- painel padrão.

Assim, `aves` e `soja` passam a ser pacotes diferentes sobre o mesmo núcleo, e não sistemas estruturalmente distintos.

## 6. O que deve ser configurável por nicho

Estas partes não devem ser universais nem fixas:

- nome da entidade principal;
- tipo de classificação;
- tipo de evento;
- tipo de curva;
- conjunto de atributo disponível;
- regra de agregação;
- regra econômica;
- regra de capacidade;
- regra de qualidade;
- visão e painel padrão;
- terminologia exibida ao usuário.

## 7. O que provavelmente exigirá camada específica por nicho

Mesmo com um núcleo único, alguns componentes tendem a precisar de especialização:

- biblioteca de fórmula;
- pacote de indicador padrão;
- importadores de planilha e integração;
- validações operacionais;
- assistentes de cadastro;
- relatório gerencial padrão;
- regra de sugestão para simulação.

## 7.1 Limite entre liberdade e governança

Em um sistema orientado por metadado, nem tudo deve ser livre e nem tudo deve ser fixo.

Alguns pontos podem ser livres por cadastro:

- nome do atributo;
- unidade;
- agregação;
- classificação;
- terminologia exibida.

Alguns pontos devem ser configuráveis, mas governados:

- tipo de evento;
- papel do atributo no cálculo;
- fórmula disponível;
- regra econômica;
- regra de capacidade;
- regra de qualidade.

Alguns pontos tendem a continuar estruturais:

- identidade;
- relacionamento;
- vigência;
- auditoria;
- fato diário;
- integridade referencial.

Sem essa separação, o sistema corre o risco de ficar rígido demais ou flexível demais.

## 7.2 Fronteira entre relacional e JSONB

Para um sistema multi-nicho, a melhor leitura da arquitetura híbrida é:

- relacional para entidade, escopo, vínculo, vigência, evento, auditoria e fato diário;
- JSONB para carga flexível de classificação, configuração complementar e payload variável;
- metadado relacional para governar o comportamento do atributo.

Ou seja, JSONB ajuda na flexibilidade, mas não deve carregar sozinho a semântica principal do sistema.

## 7.3 Riscos de desenho

Os principais riscos em um sistema único para vários nichos são:

- embutir no núcleo conceitos específicos de aves;
- cair em um modelo EAV genérico sem semântica operacional suficiente;
- usar JSONB como substituto de modelagem estrutural;
- transformar cada nicho em customização de código, em vez de pacote de metadado.

## 8. Principal conclusão

O que mais diferencia aves e soja não é a arquitetura base, e sim:

- a natureza do ciclo produtivo;
- o tipo de evento operacional;
- a forma de reconhecer produção, qualidade, custo e faturamento;
- a semântica dos atributos e das classificações.

Portanto, para suportar vários nichos no mesmo sistema, a decisão mais importante é esta:

- o núcleo deve ser orientado por entidade, evento, atributo, regra, vigência e fato;
- o nicho deve entrar como configuração de comportamento, terminologia, fórmula e pacote analítico.

Em outras palavras, o que diferencia aves e soja não deve ser a estrutura física principal do sistema, mas sim o pacote de metadado ativo para o nicho: terminologia, catálogo de atributo, classificação, evento, fórmula, validação e visão analítica.

Se o sistema tentar fixar métricas de aves na estrutura, ele falha para soja. Se tentar jogar toda semântica apenas em JSONB, ele perde governança. O caminho mais consistente continua sendo a arquitetura híbrida já definida.
