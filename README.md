# cleber

Repositório de modelagem conceitual para um sistema orientado por metadado, com cálculo diário, vigência por evento, rastreabilidade e fatos materializados.

O projeto assume como decisões firmes:

- núcleo compartilhado entre nichos, com pacote de domínio separado para cada nicho;
- suporte multi-país com país opcional na hierarquia de local;
- persistência de fato econômico apenas em moeda local;
- conversão cambial apenas na consulta ou no relatório;
- persistência de timestamp em UTC com exibição no timezone local.