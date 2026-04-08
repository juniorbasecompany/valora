# Política de internacionalização (i18n)

Este ficheiro é a **fonte canónica** no repositório para a **política estável** de i18n. **Não depende** de `.cursor/plans/` (planos nessa pasta podem ser criados ou removidos pelo utilizador). O comportamento do agente em tarefas do dia a dia está em [SKILL.md](./SKILL.md). Regras de **negócio multi-país** (contexto operacional, moeda, escopo) permanecem em [multi-country-localization](../../application/multi-country-localization/SKILL.md).

---

## Regras fixas

- **Chaves em inglês** (`namespace.section.element`); uma chave, um significado; namespaces como `common`, `auth`, `error`, `domain.*`.
- **Copy de UI** não é literal principal em JSX nem frase de produto embutida em Python como única fonte; mensagens em ficheiros (`messages/*.json` ou equivalente).
- **Três eixos separados:** idioma da UI (preferência / detecção); **locale** de formatação (`Intl` para data, número, moeda de exibição); contexto operacional (tenant, país de negócio), sem `if (country === 'X')` espalhado só para texto; usar chave com fallback ou metadado quando fizer sentido.
- **Pontuação em copy de produto e mensagens:** não usar o travessão longo (U+2014, `—`); preferir vírgula ou reestruturação da frase. Para valor vazio em tabela ou detalhe, usar hífen ASCII (`-`) ou outro padrão acordado, não `—`.
- **API REST:** corpo com **`code` estável** + detalhes estruturados para a UI mapear para chave i18n; não depender só de `message` em português para o browser.
- **Canais com texto gerado no servidor** (e-mail, PDF, push): tradução no backend ou templates por idioma; alinhar chaves semânticas com produto para não divergir do front.
- **Qualidade:** no `frontend/`, antes de merge, `npm run check:i18n` deve passar (paridade estrita entre `messages/pt-BR.json`, `messages/en-US.json` e `messages/es-ES.json`, chaves usadas pelo código e sem órfãs; implementação em `frontend/script_audit_i18n_keys.py`). Considerar CI com o mesmo comando e heurística anti-string solta em JSX (com excepções para `aria-*`, testids).

---

## Stack acordada

- **Frontend:** **next-intl**, ficheiros por locale (ex.: `messages/pt-BR.json`), segmento **`[locale]`** no App Router quando o [frontend/](../../../frontend/) existir; layout raiz com provider de mensagens.
- **Alternativa:** **react-i18next** apenas com decisão explícita e actualização deste ficheiro e da [skill](./SKILL.md).
- **Formatação:** `Intl` (ou API do next-intl) parametrizada pelo locale efectivo.
- **Conteúdo legal / marketing:** rotas ou ficheiros por locale; regras SEO (hreflang) quando houver área pública.

---

## Tradução assistida para metadado em base de dados

- **Decisão:** usar a **DeepL API** como provedor para gerar ou sugerir traduções de textos curtos persistidos na tabela `label` (associada a `field` ou `action`), alinhada aos valores de `lang` já definidos no modelo (`pt-BR`, `en`, `es`).
- **Âmbito:** rótulos curtos de domínio (por exemplo, nome amigável de campo). Não substitui o fluxo de mensagens da UI em arquivos por locale (**next-intl**), descrito nas regras fixas desta política.
- **Estado:** o backend preenche os rótulos de **field** nas outras línguas ao criar ou atualizar com `label_lang`/`label_name`, quando `DEEPL_API_KEY` está definida; chamadas só no servidor; `DEEPL_API_BASE_URL` opcional (padrão API Free). Falhas da DeepL são logadas e não impedem gravar o idioma de origem. Rótulos de **action** ainda não usam este fluxo.
- **Contrato com a API (backend):** autenticação pelo header `Authorization: DeepL-Auth-Key <chave>`; não enviar `auth_key` no corpo nem na query. O pedido envia `text`, **`source_lang`** e **`target_lang`**: o idioma de origem vem do `label_lang` do field (`pt-BR`, `en`, `es`); na API, **`source_lang`** usa códigos agregados **`PT`**, **`EN`**, **`ES`** (a DeepL **não** aceita `PT-BR` nem `EN-US` em `source_lang`). O **`target_lang`** usa variantes **`PT-BR`**, **`EN-US`**, **`ES`**. Para rótulos curtos, o backend envia `split_sentences=0`. Assim reduz ambiguidade em palavras como *data* (calendário vs informação).
- **Host Free vs Pro:** chaves Free terminam em `:fx` e usam `https://api-free.deepl.com`; chaves Pro usam `https://api.deepl.com`. Se `DEEPL_API_BASE_URL` não corresponder ao tipo de chave, o backend ajusta o host para evitar 403.
- **Orientação:** prever revisão humana após tradução automática.

---

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| [SKILL.md](./SKILL.md) | Checklist do agente em cada alteração com texto ou erro de API. |
| [multi-country-localization](../../application/multi-country-localization/SKILL.md) | Domínio multi-país e localidade operacional. |
| [architecture/technology-stack.md](../../../architecture/technology-stack.md) | Stack canónica (Next.js, FastAPI). |
| [../../../.cursor/plans/plan-frontend-valora.md](../../../.cursor/plans/plan-frontend-valora.md) | Roadmap volátil do frontend, incluindo checkpoints de i18n por fase. |

Planos de trabalho temporários em `.cursor/plans/` podem referenciar este ficheiro; **não** são substitutos desta política.

---

## Decisões tomadas

- Tradução automática de rótulos em BD (`label` / `field` / `action`): **DeepL API** (detalhes na secção **Tradução assistida para metadado em base de dados**).

---

## Decisões em aberto

- Locales exactos na v1 e v2.
- **Default locale** e fallback quando falta tradução.
- Fonte de verdade para e-mails (só backend vs serviço externo).

---

## Referências externas

- [next-intl](https://next-intl-docs.vercel.app/)
- [MDN, Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [DeepL API documentation](https://developers.deepl.com/docs)
