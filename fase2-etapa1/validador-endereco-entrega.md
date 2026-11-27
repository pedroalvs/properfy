# Validador de endereço em tela — entrega final

> Documento de **entrega** da onda do validador de endereço. Consolida o que foi
> construído, medido e decidido. O levantamento e a proposta estão em
> [`validador-endereco-levantamento.md`](validador-endereco-levantamento.md); os
> itens parqueados em [`estacionamento.md`](estacionamento.md).
>
> Data: 25/11/2026. Base: `origin/develop` em `1ae36e25` (PR #1407 já mergeado).
> Convenção: textos de tela em inglês; o resto em português.
>
> **Estado:** todos os PRs abaixo mergeados em `develop` e deployados em **DEV**.
> **Staging** ainda depende das rodadas finais de reteste do Batedor.

---

## 1. Objetivo e a regra final (autoritativa)

A onda fechou a lacuna em que o sistema **gravava endereços inválidos em silêncio**
(imóvel `FAILED`, base "not located", filial sem coordenada) e depois exibia a
falha só no detalhe. O princípio entregue é **validar ao salvar, no backend, com a
mesma consulta permanente que já é feita e cobrada** — endereço recusado não é
gravado; a tela recebe um 422, marca os campos de endereço, mantém o formulário
aberto e o usuário corrige. A busca com sugestões (`AddressLookupInput`) continua
**opcional**, só como ajuda para digitar.

### A regra de aceite (pós-O-14)

Fonte única: `classifyGeocodingResult`
(`apps/backend/src/modules/property/domain/geocoding.service.ts:72-95`).

Um resultado de geocodificação **permanente** é ACEITO somente quando:

1. `place_type[0] === 'address'` (qualquer outro tipo → rejeitado `COARSE_RESULT`),
   **E**
2. `relevance >= 0.8` (`MIN_ADDRESS_GEOCODING_RELEVANCE`, `geocoding.service.ts:40`;
   abaixo disso → rejeitado `LOW_RELEVANCE`), **E**
3. o resultado cai no subúrbio informado por **uma** destas vias
   (`geocoding.service.ts:84-90`):
   - a **locality** devolvida é igual ao subúrbio informado (`normEqualSuburb`), **OU**
   - a **place** devolvida é igual ao subúrbio informado **E** o **postcode**
     devolvido é igual ao postcode informado (o caso CBD: o Mapbox devolve uma
     sub-área fina como "The Rocks" enquanto o endereço está registrado no nível
     da place "Sydney"; place + postcode confirmam).

   Nenhuma das duas → rejeitado **`LOW_RELEVANCE`** (reuso do código existente;
   **nenhum motivo novo, nenhuma mudança de `api-types`**).

O gate **falha fechado**: subúrbio e postcode vazios rejeitam. O comparador de
postcode é **trim-only, exato** (`samePostcode`, `geocoding.service.ts:97+`).

### Canonicalização de país e dedup do Address Line 2

- A comparação "o endereço mudou?" (`isSameGeocodingAddress`,
  `apps/backend/src/shared/domain/geocoding-address.ts`) normaliza a query
  montada (`formatGeocodingQuery`) com `trim().toLowerCase()`. Na regra final,
  `"Australia"` ≡ `"AU"` e país ausente → `AU` são canonicalizados nessa
  comparação, de modo que trocar "Australia" por "AU" **não** dispara uma
  re-geocodificação.
- **Address Line 2 é descartado da *query* de geocodificação somente quando
  repete a rua.** Fonte única: `dropDuplicateLine2`
  (`geocoding-address.ts:82-90`). "Repete" = `normalizeForLine2Dedup(line2)`
  (lowercase, vírgulas → espaço, colapsa espaço, trim; `:61-67`) **começa com**
  (`startsWith`, **não** `contains`) a rua normalizada. É o formato de importação
  ruim em que o endereço completo foi colado em `street` **e** `addressLine2`.
  - Um **"Unit 3" / "Level 2" legítimo continua indo ao Mapbox** — só o Line 2 que
    começa com a rua é omitido; um "Unit 5, <rua>" que embute a rua no meio é mantido.
  - **Guard de rua vazia:** rua normalizada vazia **nunca** descarta o Line 2
    (`:88`).
  - **Transformação só na query:** o dado **gravado** (`address_line_2`) e a
    **chave de unicidade** do imóvel **não mudam** (`:80`). O mesmo `dropDuplicateLine2`
    é a fonte única para `formatGeocodingQuery`, `PropertyEntity.fullAddress` e o
    `fullAddress` da prévia de importação (trava A≡B).
  - **Medição (produção):** **94 de 94** complementos de Line 2 repetiam a rua — ou
    seja, na base real o dedup só removeu duplicações, sem tocar em complemento
    legítimo.

### Validar só quando o endereço muda, com caminho de recuperação

- Valida-se **só quando o endereço muda** em relação ao **que está gravado**
  (`addressChanged`, diferença vs. STORED via `isSameGeocodingAddress`). Editar
  outro campo (notas, aluguel, branch) de um registro já inválido **não** é
  bloqueado.
- **Caminho de recuperação:** mesmo endereço + sem coordenada → tenta geocodificar;
  se falhar, salva **sem coordenada**, **nunca 422**. Assim um registro legado
  inválido nunca trava a edição de outros campos.
- **O pino manual vence:** um par lat/lng manual diferente do salvo grava `MANUAL`
  sem validar o texto (saída para o imóvel rural).
- Um par lat/lng **incompleto** (só latitude ou só longitude) é bloqueado com uma
  mensagem no próprio campo (#1408).

---

## 2. O que foi entregue, por PR

Corte vertical por tipo de cadastro (backend + tela juntos), na ordem de merge.

| PR | Título | SHA merge | Merge (BRT) | Escopo |
|---|---|---|---|---|
| [#1396](https://github.com/pedroalvs/properfy/pull/1396) | `feat: reject unverifiable property addresses on save` | `1831e575` | 24/11 21:32 | **V-1** imóvel (backend + shared + web): recusa ao salvar, constante de motivos compartilhada, bloco de erro, campos marcados, foco, aviso de registro legado. |
| [#1399](https://github.com/pedroalvs/properfy/pull/1399) | `fix: apply the geocoding rule to the day start point` | `0921d8dc` | 24/11 22:37 | **V-4** origem do dia (PWA OriginSheet): regra A em `day-plan-origin.use-case.ts` + motivo (O-1). |
| [#1400](https://github.com/pedroalvs/properfy/pull/1400) | `feat: reject unverifiable branch addresses on save` | `45c610f5` | 24/11 22:42 | **V-2** filial (backend + web), incluindo o campo **Number** (O-2). |
| [#1402](https://github.com/pedroalvs/properfy/pull/1402) | `feat: reject unverifiable inspector base addresses on save` | `e3cdb956` | 24/11 23:53 | **V-3** base do inspetor (backend + web + PWA): os 3 use cases, erro por motivo, aviso de offline. |
| [#1404](https://github.com/pedroalvs/properfy/pull/1404) | `fix(property): geocode on update only when the address actually changed` | `19b3c663` | 25/11 01:16 | Follow-up de V-1: `addressChanged` vs. **STORED** + caminho de recuperação (salva sem coord em vez de 422). |
| [#1405](https://github.com/pedroalvs/properfy/pull/1405) | `fix(web): pre-fill the Edit Branch drawer from a legacy stored address` | `d10bad2b` | 25/11 01:51 | **O-9** prefill de endereço legado no drawer de filial + país default em `isSameGeocodingAddress`. |
| [#1406](https://github.com/pedroalvs/properfy/pull/1406) | `feat(backend): final address rule — Line-2 dedup, suburb match, origin clear-on-edit` | `0cf910b4` | 25/11 02:37 | **Regra final:** dedup do Line-2, match de subúrbio (locality), `Australia` ≡ `AU`. |
| [#1408](https://github.com/pedroalvs/properfy/pull/1408) | `fix(web): block an incomplete manual-pin pair and mark the missing coordinate` | `c1818671` | 25/11 03:49 | Follow-up de V-1: bloqueia par lat/lng incompleto, marca a coordenada faltante. |
| [#1409](https://github.com/pedroalvs/properfy/pull/1409) | `fix(geocoding): accept CBD addresses via place + postcode (O-14)` | `8a06f538` | 25/11 10:35 | **O-14 / correção CBD:** aceita endereço de CBD por place + postcode quando a locality é sub-área. |
| [#1407](https://github.com/pedroalvs/properfy/pull/1407) | `fix: generating a portal link no longer resets tenant confirmation (O-11)` | `1ae36e25` | 25/11 11:36 | **O-11:** gerar o link do portal não reseta mais a confirmação do inquilino. |

### PRs de apoio da onda (não-validador, mas no mesmo trem)

| PR | Título | Observação |
|---|---|---|
| [#1401](https://github.com/pedroalvs/properfy/pull/1401) | `fix: regeocode validate env` | `validateEnv()` no `regeocode-permanent.ts` — defeito latente que servia de medição (R1). |

### Evolução da regra (importante)

- **#1403 — `fix(backend): lower rule A geocoding relevance threshold 0.8 to 0.7` — CLOSED/revogado.**
  Chegou a propor baixar o limiar para 0,7, mas foi **fechado sem merge**
  (`closedAt` 25/11 03:56Z) **após a sonda ao vivo**, não após a amostra 101/101.
  A sonda mostrou que **relevância é confiança, não correção**: `14 Miller St,
  Chatswood` casou com **North Sydney @ 0,78** — baixar o limiar para 0,7 teria
  **aceitado** esse endereço errado. E as relevâncias baixas que motivaram o #1403
  eram causadas pelo **Line 2 repetido** (resolvido pelo dedup, acima), não por o
  limiar 0,8 ser apertado demais. Conserto correto = dedup + match de subúrbio
  (locality/place+postcode), não afrouxar o limiar. A amostra 101/101 (§3) **validou
  a regra FINAL** depois disso; ela não foi o que matou o 0,7. O limiar entregue
  permanece `0.8`.

### Desvio de processo registrado (#1409)

- O **#1409 foi mergeado antes de o CI do commit final registrar verde**
  (`mergeStateStatus` CLEAN prematuro). O CI do `develop` no commit de merge
  **ficou verde depois** — **sem quebra**.
- **Regra adotada daqui para frente:** mergear **só depois** que os checks do commit
  final estiverem **registrados e verdes** via `gh pr checks`.

---

## 3. Medições

### Regeocode DEV — rodada 1 (pré-regra-final)

- Custo: **US$ 0,30**.
- **8 imóveis rejeitados `LOW_RELEVANCE`** (7 importações malformadas + **SPS-006**).

### Regeocode DEV — rodada 2 (25/11, pós-regra-final #1406)

- STEP 1 dry-run: 2 requisições, **US$ 0,01**.
- STEP 2 `--apply` (exit 0, **US$ 0,01**): 1 property escaneada / 1 atualizada
  (Line 2 duplicado → dedup → passou a regra final, subúrbio bateu; `lineTwoOmitted 1`);
  **0 rejeições** (coarse / low-relevance / suburb-mismatch).
- `falseManual`: **PROP-0020** (`low_relevance`, deixado `MANUAL` para revisão) +
  **PROP-0017** (sem audit `property.updated`, não auto-restaurável).

### Bateria adversarial + sonda ao vivo

- **Bateria de 30 endereços** (ver `bateria-limiar-endereco.md`): endereços-limite,
  rurais, CBD, com Address Line 2, para calibrar o limiar e o match de subúrbio.
- **Sonda ao vivo** confirmou a divergência **busca × salvamento**: a busca usa modo
  **temporário + autocomplete** (sugere mais), enquanto o salvamento usa modo
  **permanente + query estruturada** (recusa mais) — origem do item parqueado O-14.

### Amostra de produção (sob a regra final)

- **101/101 aceitos**: **81** via locality + **20** via place + postcode (o ramo CBD do O-14).
  **Valida a regra FINAL** (0,8 + os dois ramos de match cobrem a base real sem recusa
  falsa). Não foi esta amostra que fechou o #1403 — isso foi a sonda ao vivo (§2).

---

## 4. Decisões-chave

| Decisão | Resultado |
|---|---|
| Motivo de subúrbio divergente | **Reusa `LOW_RELEVANCE`** — sem código de motivo novo, sem mudança de `api-types`. |
| Exigir número de casa | **Não.** A regra pede `address` + relevância; o número não é obrigatório (evita bloquear endereços sem número válidos). |
| Locality vs. place | Priorizar locality; o caso CBD (place no nível "Sydney") é resolvido pelo **fallback place + postcode** (O-14), não por afrouxar o limiar. |
| Comparação de postcode | **Exata, trim-only.** |
| Limiar de relevância | Mantido em **0,8** (#1403, que propunha 0,7, revogado pela sonda ao vivo — ver §2). |
| País na comparação de mudança | `"Australia"` ≡ `"AU"`, ausente → `AU`, canonicalizado. |
| Address Line 2 | **Descartado da query** quando repete a rua (dedup). |
| Provedor fora do ar / timeout | **Fail-closed quanto a inválido, não quanto a não-verificado:** timeout/erro mantém o comportamento atual (imóvel `PENDING`, base/filial sem coord), nunca bloqueia todo cadastro. |
| Validar só quando o endereço muda | **Sim**, vs. STORED, com caminho de recuperação (salva sem coord, nunca 422). |
| Pino manual | **Vence** o texto (grava `MANUAL`); par incompleto é bloqueado. |
| Importação (V-5) | **Fora do pacote** (decisões 22 e 25 do Pedro): a linha **não** bloqueia; continua aviso, o endereço é corrigido depois no cadastro. |

---

## 5. Limites conhecidos da regra

A regra é um gate de **plausibilidade**, não uma prova de correção. Os limites
abaixo foram observados na bateria adversarial e na sonda ao vivo.

### Falsos aceites que a regra NÃO bloqueia (medidos na bateria)

- **Subúrbio digitado no campo de rua:** se o usuário põe o subúrbio no campo
  Street, o Mapbox ainda pode devolver um `address` plausível — aceito.
- **Rua sem número:** aceita, com o pino caindo na rua (não no número). **Decisão do
  Pedro:** aceitar, pois a regra não exige número de casa.
- **Caixa postal (PO box):** pode passar como endereço plausível.

### Rejeições por lacuna de mapa

- **`30 Bridge Street, Sydney 2000` → Rydalmere 2116 @ 0,99:** alta relevância, mas o
  resultado cai em outro subúrbio/postcode (lacuna de dados do Mapbox). A regra
  rejeita (subúrbio/postcode não batem). **Caminho do usuário:** `Set location
  manually` (pino manual).

### Postcode digitado errado

- Um **postcode errado** passa a ser **rejeitado no ramo place** (place + postcode não
  confere). **O Pedro aceitou** esse comportamento.

### Busca × salvamento (O-14, parqueado)

- A **busca da tela** usa um **modo do Mapbox diferente** do salvamento (temporário +
  autocomplete, texto cru) e pode **sugerir um endereço que o salvamento recusa**
  (permanente + query estruturada + regra A). Parqueado como **O-14**; ver §6.

---

## 6. Follow-ups e itens parqueados

Resumo; o detalhe autoritativo está em
[`estacionamento.md`](estacionamento.md). Linkados por nome.

### Parqueados — rodada final Batedor (25/11, decisões do Pedro)

- **O-14 (busca × salvamento):** a busca da tela (temporário + autocomplete) sugere
  endereços que o salvamento (permanente + query estruturada) recusa. Follow-up:
  alinhar a busca ao modo permanente, ou avisar que a sugestão ainda será
  verificada no save. (A refinação **da regra** de subúrbio CBD já saiu, no #1409.)
- **O-16 ('Rural property?' / aviso de distância no cartão do PWA):** o aviso de
  distância não aparece no cartão do app → **análise do Prumo**, não mexer nesta onda.
- **O-17 (Live Day):** a linha do Live Day só aparece após recarregar no primeiro
  clique. Follow-up web: invalidar/refetch a query em vez de exigir reload.
- **O-18 (Notes da agência):** o campo Notes da agência é descartado ao salvar.
  Follow-up: persistir/enviar o Notes no PATCH da agência.
- **'Rural property?'** (texto junto ao 'Set location manually'): **o Pedro vai
  mandar proposta própria** → não mexer.

### Follow-ups operacionais e técnicos

- **Os 7 imóveis `LEGACY_PERMANENT_NO_RESULT`** da rodada 1 que **não** entram no
  sweep (`findLegacyCoordinateCandidates` exclui esse código): reprocessar via o
  botão **Retry Geocoding** (devem passar na regra final) — IMP-2A412183A9
  (Brighton-le-sands), IMP-6238CD8E93 (Penshurst), IMP-748F05CA28 (Carlton),
  IMP-90EC930570 (Bexley), IMP-D45E7C3CEF (Hurstville), IMP-FF4AB720F8 (Hurstville),
  SPS-006 (Chatswood). **PROP-0017 + PROP-0020:** revisão manual.
- **Rename `GeocodingResult.suburb` → `locality`:** na regra O-14 o campo passou a
  guardar **só** o `locality` (place e postcode viraram campos separados). Nome
  mantido por ora (com comentário explícito no campo) para evitar churn de ~42
  fixtures. Follow-up (Pedro/CC#3): renomear + ajustar fixtures/consumidores —
  trivial, só nomenclatura.
- **Nota `:187` retry token-only / lock do tenant:** em
  `send-group-portal-links.use-case.ts:187-188` o `retryOnUniqueConflict` cobre só
  `TOKEN_HASH_COLUMN`; é correto **hoje** porque o caminho é serializado por um
  `SELECT … FOR UPDATE` do tenant. Caveat (não é gap): se esse `FOR UPDATE` for
  removido, o retry deixaria de cobrir os alvos de ciclo. Follow-up trivial opcional:
  comentário de 1 linha amarrando o retry ao lock.
- **Backfill E — regeocode de CONFIRMED-sem-ciclo em staging/prod:** reprocessar os
  registros confirmados sem ciclo quando a regra final chegar a staging/prod.
- **`backfill-inspector-base-coords.ts` sem `validateEnv()`** (item 27 do
  estacionamento): mesmo defeito latente corrigido no regeocode (#1401); o script
  nunca rodou e lançaria "Environment not validated". Follow-up: adicionar
  `validateEnv()` antes de `createContainer()` + empacotar no tsup se for rodar.
- **O-10 / SW preso no bundle antigo** (item 24): com o pacote antigo do service
  worker, a tela nova do V-3 (recusa da base) não aparece até o SW atualizar.
  Follow-up: estratégia de atualização/`skipWaiting` do SW ou invalidação de cache.

### Observações parqueadas do reteste DEV (itens O-3..O-7, 24/11)

Consolidadas aqui a pedido do item 22 do estacionamento: O-3 (limite de 20 MB não
aplicado no upload web), O-4 (plurais errados), O-5 (Live Day "On time" com próxima
parada atrasada), O-6 (horário previsto desatualizado no card "Next inspection"),
O-7 (arquivos de teste não confirmados ficaram no imóvel SPS-007). Todas
**estacionadas** (decisão do Pedro); detalhe em `reteste-dev-2026-11-24.md`.

### Infra / deploy

- **Religar o idle-shutdown de DEV** (`min_machines_running = 0` em `fly.dev.toml`)
  **depois de 30/11/2026** (item 23): mantido em `1` enquanto 3 verificações do
  reteste dependem de jobs agendados de madrugada.

---

## 7. Estado da entrega

- **Código:** todos os PRs do §2 **mergeados em `develop`**.
- **DEV:** deployado; regeocode rodada 2 verde (0 rejeições sob a regra final).
- **Reteste final do Batedor:** **concluído — 46 passaram, 0 falharam, 2 não-testáveis**
  (criação de inspetor pelo web exige senha). Os retestes de **#1404, #1405, #1408 e
  #1409** passaram.
- **Link do portal (O-11), fora do validador mas na mesma onda:** #1407 (25/11) fez
  toda confirmação e toda resposta "não posso" criarem o seu ciclo e preservou a
  confirmação antiga sem ciclo ao gerar link. O reteste em DEV (7 passaram, 1 falhou,
  1 não reproduzível pela tela) achou uma regressão: link novo para quem respondeu
  "não posso" deixou de voltar a pendente. Corrigida no #1410 (25/11) e retestada em
  DEV `4e81953`: **5 de 5**. Resíduo conhecido: confirmação **antiga sem ciclo** ainda
  é tratada como "date changed" pelo envio do grupo — repetir a contagem de leitura em
  produção antes da promoção (em 25/11 era zero).
- **Pendente:** só a conferência da rotina de prêmios em **30/11** (depois de 04:45 de
  Sydney) e, em seguida, voltar "Minimum services to be ranked" para 10.
- **Produção:** depende da promoção `develop → staging → main` após esses pendentes.
