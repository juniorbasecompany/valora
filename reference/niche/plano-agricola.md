# Plano de desenvolvimento

## 1. Objetivo

Transformar o modelo hoje operado em planilhas em um sistema robusto para previsão, acompanhamento do realizado e simulação de uma lavoura de soja, com cálculo diário, rastreabilidade e visão consolidada por ciclo, segmento, local, período e empresa.

O sistema deve permitir:

- prever área plantada, desenvolvimento, produtividade, qualidade, custo e faturamento;
- registrar o realizado sem sobrescrever a previsão;
- comparar previsto x realizado x corrigido;
- simular cenários de plantio, replantio, manejo, perda, produtividade e preço;
- consolidar um, vários ou todos os ciclos em qualquer recorte temporal.

## 2. Princípios do modelo

### 2.1 Cálculo diário

Toda apuração deve ser diária.
Visões diárias, mensais, anuais ou por intervalo devem ser agregações do cálculo diário.

### 2.2 Vigência por evento

Os parâmetros não devem ser modelados como intervalos fechados previamente definidos. Cada valor passa a valer a partir da data do evento e permanece vigente até:

- o próximo evento do mesmo tipo; ou
- o encerramento do segmento ou ciclo.

Exemplo:

- produtividade esperada = 58 sacas/ha a partir de 01/11;
- em 15/11, produtividade esperada passa a 55 sacas/ha;
- logo, 58 sacas/ha vale de 01/11 até 14/11, e 55 sacas/ha vale de 15/11 em diante.

Esse mesmo raciocínio se aplica a qualquer atributo configurável, técnico ou econômico. Produtividade, estande, umidade, impureza, custo, preço e capacidade são apenas exemplos possíveis do domínio.

### 2.3 Fallback por escopo

Os parâmetros devem ser resolvidos por hierarquia de escopo.

Ordem sugerida:

1. valor específico do segmento;
2. valor específico do ciclo;
3. valor específico do local;
4. valor padrão geral.

O motor sempre deve registrar qual origem foi usada no cálculo, para garantir auditoria e depuração.

### 2.4 Previsão e realizado separados

O realizado não substitui a previsão. Ele deve ser armazenado em camada própria para permitir:

- comparação entre previsto e realizado;
- análise de desvios;
- revisão de premissas;
- construção de histórico de performance.

### 2.5 Modelo orientado por metadado

O sistema deve ser orientado por metadado. Isso significa que atributos, classificações, curvas, regras e indicadores de negócio não devem nascer, por padrão, como colunas dedicadas.

Deve existir uma distinção clara entre:

- estrutura fixa do sistema, responsável por identidade, relacionamento, escopo, vigência, auditoria, versionamento e materialização;
- conteúdo configurável, responsável por definir atributos, classificações, fórmulas, unidades, agregações e rótulos exibidos ao usuário.

Assim, itens como produtividade, estande, umidade, impureza, custo e preço devem ser tratados como atributos configuráveis do domínio, e não como nomes obrigatórios de colunas físicas.

Cada atributo configurável deve permitir, no mínimo:

- nome exibido ao usuário;
- tipo do valor;
- papel no cálculo;
- granularidade;
- regra de agregação;
- vigência;
- origem permitida;
- unidade e precisão;
- fórmula ou referência de cálculo, quando aplicável.

### 2.6 Temporalidade e histórico

Toda informação com efeito operacional deve considerar vigência temporal e histórico.

O plano deve preservar, no mínimo:

- data em que o valor passa a valer;
- versão da regra, do evento ou do cálculo;
- origem do dado;
- possibilidade de reconstruir o cálculo de uma data passada com base nas regras vigentes naquele momento.

### 2.7 Moeda local e conversão de relatório

Toda informação financeira auditável deve ser persistida apenas na moeda local da operação.

Isso significa, no mínimo:

- valor econômico original em moeda local;
- auditoria e reconstrução histórica apenas sobre o fato local;
- possibilidade de exibir relatórios em outra moeda por conversão na consulta;
- conversão cambial tratada como recurso de visualização, e não como parte do fato financeiro auditável.

Se a taxa histórica usada em relatório convertido mudar posteriormente, isso não altera o fato financeiro original nem a auditoria operacional da moeda local.

### 2.8 UTC no backend e exibição local

O sistema deve persistir timestamps em UTC e exibir datas e horários no fuso horário local da operação ou do usuário, conforme a necessidade da interface.

Isso não altera o princípio central do modelo:

- o grão operacional continua sendo o dia;
- relatórios diários, mensais, anuais ou por período continuam sendo agregações da base diária.

### 2.9 País opcional no escopo

O país deve ser suportado como nível opcional da hierarquia de local.

Quando ele não for necessário para a operação, pode ser omitido.

Quando o fato envolver valor econômico, o país precisa estar resolvido no contexto persistido da operação para determinar a moeda local do registro.

## 3. Estrutura conceitual

## 3.1 Ciclo

Ciclo representa a unidade agronômica e econômica principal.

Cada ciclo deve possuir, no mínimo:

- identificação;
- cultivar ou padrão tecnológico;
- data de plantio inicial;
- situação atual;
- área planejada;
- parâmetros agronômicos vinculados direta ou indiretamente.

## 3.2 Segmento do ciclo

O ciclo deve poder ser subdividido em segmentos operacionais.

Um segmento existe quando parte do ciclo:

- permanece em um local;
- é replantada ou manejada de forma distinta;
- é colhida parcialmente;
- passa a ter comportamento diferente do restante da área.

O cálculo diário deve ocorrer no nível do segmento. O ciclo consolidado é a soma de seus segmentos ativos em cada data.

## 3.3 Local

O local deve suportar hierarquia operacional, por exemplo:

- empresa;
- fazenda;
- unidade;
- talhão;
- subdivisão.

Isso permite consolidar produção, ocupação e capacidade em diferentes níveis.

## 3.4 Classificações e composições

O modelo deve permitir diferenças dentro do mesmo ciclo ou segmento, como:

- cultivar;
- tecnologia da semente;
- regime hídrico;
- tipo de solo;
- outras classificações agronômicas relevantes.

Essas classificações podem impactar curvas, atributos técnicos, produtividade, qualidade, custo e valor econômico.

As classificações devem ser configuráveis, podendo ser definidas pelo usuário sem alteração de esquema. O sistema deve suportar mais de um eixo de classificação sobre a mesma entidade, inclusive com composição multinível quando necessário.

## 3.5 Atributo

Atributo representa qualquer medida, parâmetro, indicador, restrição ou variável de negócio definida pelo usuário.

O atributo não deve depender de coluna dedicada para existir. Seu comportamento deve ser definido por cadastro, incluindo tipo, escopo, vigência, fórmula, agregação e forma de exibição.

## 3.6 Regra

Regra representa a forma como um atributo é tratado pelo motor.

Uma regra pode definir, por exemplo:

- como o valor é informado;
- como ele é resolvido por escopo;
- como ele é agregado;
- se ele participa de cálculo derivado;
- se ele é previsto, realizado, simulado ou calculado.

## 3.7 Medida diária materializada

Toda saída relevante do motor deve ser persistida como medida diária materializada.

Essa medida deve permitir rastrear, no mínimo:

- entidade calculada;
- data;
- atributo;
- valor;
- classificação aplicada, quando houver;
- origem;
- versão do cálculo.

## 4. Eventos do sistema

## 4.1 Eventos operacionais

Eventos operacionais alteram a composição física ou operacional do sistema.

Exemplos:

- plantio;
- replantio;
- aplicação ou manejo relevante;
- colheita parcial;
- encerramento do ciclo ou segmento;
- ajustes de área ou população.

## 4.2 Eventos de atributo e regra

Eventos de atributo alteram o valor vigente de um atributo configurável a partir de uma data.

Eventos de regra alteram a forma de tratamento de um atributo, como fórmula, agregação, fallback, unidade operacional ou comportamento no cálculo.

Exemplos de atributos governados por esses eventos incluem produtividade esperada, estande, emergência, umidade, impureza, preço por classe, custo por operação, capacidade planejada, meta técnica e meta econômica. Esses exemplos não formam uma lista fechada.

Todos os eventos devem ser versionados, datados, auditáveis e reconstruíveis historicamente.

## 5. Motor de cálculo

## 5.1 Resolução diária

Para cada dia e para cada segmento ativo, o motor deve:

- identificar os atributos vigentes para a data e para o escopo aplicável;
- resolver classificações e composições relevantes;
- aplicar fallback por escopo;
- calcular atributos derivados;
- persistir o resultado em medida diária materializada;
- registrar a proveniência de cada valor calculado.

Entre os atributos que podem ser resolvidos por esse mecanismo estão, por exemplo, idade do ciclo, área ativa, estande, estágio fenológico, perda prevista, produtividade esperada, volume esperado, qualidade comercial, custo acumulado, valor econômico, ocupação e capacidade. Esses itens são exemplos de uso do motor, não uma lista fixa de colunas.

## 5.2 Curvas por idade ou estágio fenológico

As curvas padrão por idade ou estágio fenológico devem ser a base do modelo técnico. Sobre elas incidem os eventos vigentes e os ajustes específicos.

Na prática, o resultado não nasce de um valor fixo por ciclo, mas da combinação entre:

- idade ou estágio fenológico;
- cultivar ou categoria;
- premissas vigentes;
- eventos operacionais;
- parametrização específica.

## 5.3 Rastreabilidade do cálculo

Cada valor calculado deve ser explicável. O sistema deve permitir identificar:

- qual curva foi aplicada;
- qual atributo foi utilizado;
- qual escopo forneceu o parâmetro;
- quais eventos estavam vigentes na data;
- qual fórmula gerou o valor final.

Sem isso, o sistema perde confiança operacional.

## 5.4 Fatos diários materializados

O cálculo diário deve gerar fatos materializados por dia, persistidos de forma consultável e versionável.

Esses fatos devem:

- ser a base para visões diárias, mensais, anuais e por intervalo;
- evitar dependência de colunas fixas de indicador de negócio;
- permitir reprocessamento sem destruição do histórico anterior;
- armazenar entidade, data, atributo, valor, origem, versão e classificação aplicável.

## 6. Realizado e reconciliação

O sistema deve permitir registrar o realizado diário, por segmento ou por agregação operacional, usando o mesmo catálogo de atributo sempre que fizer sentido.

O realizado deve suportar:

- atributo informado manualmente;
- atributo importado;
- atributo conciliado com o previsto;
- ocorrência operacional relevante ligada ao dia, ao segmento, ao ciclo, ao local ou à classificação.

A reconciliação deve mostrar pelo menos:

- valor previsto original;
- valor realizado;
- desvio absoluto;
- desvio percentual;
- previsão corrigida, quando adotada.

A comparação deve ocorrer entre atributos equivalentes por regra, e não entre um conjunto fixo de colunas.

## 7. Capacidades mínimas de indicador

O sistema deve disponibilizar, no mínimo, as seguintes capacidades:

- cadastrar atributo de negócio sem mudança de esquema;
- cadastrar indicador derivado por fórmula;
- consolidar por ciclo, segmento, local, empresa, classificação e período;
- comparar previsto, realizado, corrigido e simulado;
- agregar por soma, média, último valor, média ponderada, máximo ou mínimo, conforme regra do atributo;
- rastrear origem, vigência, escopo e fórmula aplicada.

Indicadores como área plantada e colhida, estande, emergência, produtividade, volume colhido, umidade, impureza, custo, faturamento, ocupação, capacidade, distribuição por estágio fenológico, estabilidade mensal e concentração de plantio e colheita são exemplos iniciais do domínio, e não estrutura fixa obrigatória do banco.

## 8. Cronograma e simulação

O cronograma não deve ser apenas um cadastro de datas. Ele deve funcionar como ferramenta de decisão.

O sistema deve permitir simular cenários alterando:

- datas de plantio;
- datas de replantio;
- datas de colheita;
- áreas movimentadas;
- curvas de emergência, desenvolvimento ou produtividade;
- curvas de perda ou qualidade;
- preços;
- capacidade dos locais e janelas operacionais.

O objetivo da simulação é reduzir concentração operacional, equilibrar a ocupação das áreas e janelas de trabalho, melhorar produtividade e estabilizar produção, custo e faturamento.

## 9. Visões e relatórios

O sistema deve oferecer visões por:

- dia;
- mês;
- ano;
- intervalo livre;
- ciclo;
- segmento;
- local;
- empresa;
- consolidado geral.

Relatórios e painéis mínimos:

- evolução diária prevista do ciclo;
- evolução diária realizada do ciclo;
- previsto x realizado;
- cronograma consolidado de plantio, manejo e colheita;
- distribuição por estágio fenológico;
- ocupação e capacidade por local;
- estabilidade mensal;
- evolução de preço e faturamento;
- alertas de desvio relevante.

## 10. Diretrizes de modelagem

### 10.1 Separar fatos de premissas

Eventos realizados, parâmetros previstos e resultados calculados devem ficar em camadas distintas. Misturar essas naturezas fragiliza auditoria e manutenção.

### 10.2 Nunca recalcular sem histórico

Mudanças em parâmetros precisam gerar nova vigência, não alteração destrutiva do passado.

### 10.3 Consolidar por soma, nunca por edição manual

Totais de ciclo, local, mês ou empresa devem ser derivados do cálculo diário e não mantidos manualmente em células de consolidação.

### 10.4 Preparar o modelo para múltiplas granularidades

Mesmo que a operação inicial use poucos níveis, o modelo já deve suportar crescimento de complexidade sem refatoração estrutural.

### 10.5 Modelagem híbrida em PostgreSQL

O modelo deve usar PostgreSQL com abordagem híbrida:

- tabelas relacionais para a espinha dorsal do sistema;
- JSONB para classificação variável, propriedade opcional e configuração flexível;
- vigência temporal para resolver valor efetivo ao longo do tempo;
- fatos diários materializados para consulta analítica e consolidação.

Essa abordagem deve ser orientada por metadado, mas sem cair em EAV puro e indiscriminado.

A camada relacional deve concentrar identidade, relacionamento, escopo, evento, vigência, versão, auditoria e integridade.

O uso de JSONB deve ser controlado. Ele não deve substituir chave essencial de negócio, integridade referencial nem filtro recorrente sem estratégia clara de indexação e governança.

### 10.6 Convenção física do banco

Os nomes físicos do banco devem seguir as seguintes regras:

- tabela em inglês;
- coluna em inglês;
- tudo no singular;
- tudo com uma única palavra;
- sem underline;
- sem camelCase.

Os atributos definidos pelo usuário devem ser apresentados em português do Brasil e podem usar mais de uma palavra.

O modelo deve separar nome técnico interno de rótulo exibido ao usuário.

## 11. Fases de desenvolvimento

### Fase 1 — Cadastro estrutural

Implementar cadastros de:

- ciclo;
- segmento;
- local hierárquico;
- classificação configurável;
- atributo configurável;
- regra;
- tipo de evento.

### Fase 2 — Motor de vigência e fallback

Implementar:

- eventos de atributo e regra;
- resolução por data;
- fallback por escopo;
- trilha de auditoria da origem do valor.

### Fase 3 — Motor diário materializado

Implementar cálculo diário materializado para:

- atributos previstos;
- atributos derivados;
- consolidação diária;
- versionamento do cálculo;
- persistência dos fatos diários.

### Fase 4 — Eventos operacionais e segmentação

Implementar:

- replantio;
- colheita parcial;
- segmentação do ciclo;
- consolidação automática.

### Fase 5 — Realizado e reconciliação

Implementar:

- entrada do realizado por atributo;
- previsto x realizado;
- desvio;
- revisão de premissa.

### Fase 6 — Simulação e cronograma

Implementar:

- cenários alternativos;
- redistribuição de plantio, manejo e colheita;
- análise de estabilidade, janela operacional e capacidade.

### Fase 7 — Painéis e gestão

Implementar painéis, relatórios gerenciais, alertas e acompanhamento operacional.

## 12. Critérios de sucesso

O plano será considerado bem implementado quando o sistema:

- reproduzir a lógica operacional hoje observada nas planilhas;
- calcular diariamente com coerência técnica;
- explicar cada valor calculado;
- permitir criar novo atributo de negócio sem mudança de esquema;
- suportar segmentação, replantio e colheita parcial;
- separar claramente previsão, realizado e simulação;
- permitir consolidação confiável por qualquer recorte;
- reduzir dependência de planilhas paralelas;
- apoiar decisões de cronograma, ocupação, janela operacional e estabilidade produtiva.

## 13. Resultado esperado

Ao final, a empresa terá um sistema capaz de transformar o conhecimento agronômico hoje disperso em planilhas em um modelo único, auditável e escalável, preservando a lógica técnica do negócio e ampliando a capacidade de análise, simulação e decisão.
