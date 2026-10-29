# X02 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Total** | **4,75 dias** (+0,25 de contingência, só se o spike mostrar que a v5 não aceita `permanent=true`: migrar o adaptador para a v6). O plano original era 2,5 dias. Somam-se as decisões de 2026-10-27: +0,5 filiais, +0,25 coluna marcadora, +0,25 correção do bug do MANUAL e +0,25 detecção dos falsos MANUAL já gravados. Somam-se as lacunas aceitas em 2026-10-29: +0,25 spike da conta Mapbox (L-X02-01), +0,25 regra de `null/null` fora de MANUAL no backend e no web (L-X02-02), +0,25 CAS por `updated_at`, merge jsonb na filial e tratamento de 429 no script (L-X02-03, L-X02-05) e +0,25 relatório e runbook do legado (L-X02-05, L-X02-06, L-X02-09). |
| **Tarefas** | 2: TASK-X02-1 = PR1 e TASK-X02-2 = PR2 |
| **Depende de** | Nada. O X02 bloqueia F01, F04 e F09, e a ativação do geofence BLOCK da F03 (L-F03-08). |
| **Base verificada** | Snapshot de `origin/develop`. Abreviações: `BE = apps/backend`, `WEB = apps/web`, `SH = packages/shared`. |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-X02-1 | Geocodificação permanente em todos os caminhos que gravam coordenadas (imóveis e filiais), com coluna marcadora e correção do MANUAL | 3,5 (+0,25 se migrar para a v6) | – |
| TASK-X02-2 | Regeocodificação do legado (incluindo os falsos MANUAL detectados pelo audit), limpeza de `preview_json` e retomada em massa | 1,25 | TASK-X02-1 em produção |

---

## TASK-X02-1 · Geocodificação permanente em todos os caminhos que gravam coordenadas

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1
> - **Desbloqueia:** TASK-X02-2, TASK-F01-1
> - **Pode rodar em paralelo com:** TASK-X01-1, TASK-X03-1, TASK-F00-1, TASK-F03-1, TASK-F03-2
> - **Pista sugerida (time de 6):** B · Backend de integração

### Objetivo
Os termos da Mapbox só permitem guardar coordenadas obtidas no modo **permanente** (`permanent=true`). Hoje o backend geocodifica no modo **temporário** e grava o resultado em `properties.lat/lng` e em `branches.address_json`. Além disso, a edição de imóvel regrava essas coordenadas temporárias como MANUAL.

Esta tarefa:
- faz toda coordenada gravada vir do modo permanente e registra a origem em `geocoded_permanently_at`;
- corrige o falso MANUAL;
- quando a conta não tem o recurso, não grava nada e para o retry.

### Fonte e termos
- Referência: [Mapbox: temporary vs permanent geocoding](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/).
- **Temporário** (padrão): serve só para exibição e não pode ser guardado.
- **Permanente** (`permanent=true`): pode ser guardado, cacheado e reutilizado. Custa mais por requisição e pode precisar ser habilitado na conta.
- **Preço (página de pricing da Mapbox, consultada em 2026-10-28):** Permanent Geocoding custa **US$ 5,00 por 1.000 requisições desde a primeira, sem faixa gratuita** (US$ 0,005 por requisição). Temporary: 100.000/mês grátis, depois US$ 0,75/1.000. Todo caminho que grava passa a custar US$ 0,005 por chamada (create, worker, sweep de FAILED sem código, preview de import, save de filial, prova 2 dos falsos MANUAL). Reconfirmar o preço vigente antes do rollout (L-X02-05).
- **Limite de taxa:** a referência v5 indica 600 req/min por padrão (ajustável por conta); a v6, 1.000 req/min. Registrar no runbook o limite real da conta.
- **Fontes divergentes (L-X02-01):** o help article mostra a v5 com `permanent=true`; a referência v5 documenta o produto permanente como o endpoint `mapbox.places-permanent`, liberado via Sales, e avisa que requisições sem acesso "may be billable"; a referência v6 (`/search/geocode/v6/forward`) documenta `permanent=true`. O spike do passo 0 decide qual vale para a conta da Properfy.

### Contexto no código (verificado)

**Porta, adaptador e wiring**
- **Porta:** `BE/src/modules/property/domain/geocoding.service.ts`, com `IGeocodingService.geocode(address: string): Promise<GeocodingResult | null>`. Não há opção de modo.
- **Adaptador:** `BE/src/modules/property/infrastructure/mapbox-geocoding.service.ts`.
  - Chama `…/geocoding/v5/mapbox.places/{q}.json?access_token=…&limit=1`, sem `permanent`.
  - A chamada passa por um `CircuitBreaker` (`failureThreshold: 5`, `resetTimeoutMs: 60000`). O breaker conta **qualquer** exceção e, quando abre, lança `Circuit breaker OPEN for mapbox-geocoding`.
  - Não existe teste do adaptador.
- **Stub:** `BE/src/modules/property/infrastructure/stub-geocoding.service.ts` devolve sempre `null`.
- **Dynamic:** `BE/src/modules/integration/infrastructure/dynamic-providers.ts:131` (`DynamicGeocodingService`).
  - Chama `resolver.getConfig('mapbox')` (`integration-config-resolver.ts:49`). Quando o resultado é `null`, usa o stub.
  - O teste `…/__tests__/dynamic-providers.test.ts` cobre só email e SMS.
- **Wiring:** `BE/src/main/container.ts:660` cria `geocodingService`.
  - Ele é injetado em `CreatePropertyUseCase` (:663), `GeocodeWorker` (:673) e `ImportGeocodeVerifier` (:1358).
  - `CreateBranchUseCase` e `UpdateBranchUseCase` são criados antes, em :611 e :614, e `integrationConfigResolver` em :642. A ordem precisa mudar.

**Caminhos de imóvel que gravam coordenadas**
- `create-property.use-case.ts`: `geocodeWithinTimeout` (:99, com `DEFAULT_SYNC_GEOCODE_TIMEOUT_MS = 4000` em :24) chama `geocode(address)`.
  - Erro ou timeout: fica PENDING e enfileira `property.geocode`.
  - `null`: FAILED.
  - Coordenadas: SUCCESS, via `PropertyEntity.applyGeocodingResult` (`property.entity.ts:100`).
- `BE/src/modules/property/infrastructure/workers/geocode.worker.ts`:
  - pula MANUAL e SUCCESS;
  - exceção: grava FAILED e audita `property.geocoding_failed` com `reason 'Geocoding service error: …'`;
  - `null`: FAILED com `'Geocoding service returned no results'`. Não apaga lat/lng;
  - sucesso: SUCCESS;
  - atualiza o gauge `metrics.setGeocodingFailedCount`.
- `BE/src/modules/property/infrastructure/workers/geocode-retry.worker.ts` (cron `*/15`):
  - reenfileira **todo** FAILED com `updated_at` de mais de 24 h (`findFailedGeocoding`, `prisma-property.repository.ts:371`);
  - reenfileira também os PENDING com `lat IS NULL` há mais de 10 min (`findStalePendingGeocoding`, :383).
- `BE/src/modules/property/application/services/import-geocode-verifier.ts:88`:
  - o preview grava `{status:'found', lat, lng}` em `appointment_imports.preview_json`;
  - o commit (`BE/src/modules/appointment/infrastructure/workers/appointment-import-commit.worker.ts:304-328`) reaproveita esse resultado como SUCCESS, sem geocodificar de novo.
- `geocode-property.use-case.ts` atende `POST /v1/properties/:propertyId/geocode` (AM/OP, 202). Põe o imóvel em PENDING e enfileira o job. Com MANUAL, lança `PROPERTY_GEOCODING_MANUAL_OVERRIDE`.

**PostGIS**
- `schema.prisma:386-390` traz `lat/lng Decimal(10,7)?`. A coluna espacial `coordinates Unsupported("GEOMETRY(Point, 4326)")?` está em :403.
- As duas formas são sincronizadas pelo app em `prisma-property.repository.ts`:
  - `save` chama `syncCoordinates` (:288);
  - `update` chama `syncCoordinates` só quando o `updateMany` com escopo de tenant afetou alguma linha (:362-368);
  - `syncCoordinates` (:558) usa `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` ou grava `NULL`.

**Bug do MANUAL (bloqueante)**
- `WEB/src/features/properties/components/PropertyFormDrawer.tsx:95-96` pré-preenche Latitude/Longitude com os valores gravados. Os campos estão em :379-399.
- `WEB/src/features/properties/hooks/usePropertySave.ts:90-95` **sempre** envia esses valores quando não estão vazios.
- `BE/src/modules/property/application/use-cases/update-property.use-case.ts:182-190` grava `geocodingStatus='MANUAL'` sempre que lat/lng vêm no body, sem comparar com o que está gravado.
- Resultado: **toda edição** de um imóvel SUCCESS regrava as coordenadas temporárias da Mapbox como "dado do usuário" (MANUAL). Isso também desliga a regeocodificação, porque o worker pula MANUAL.
- O unlock (lat e lng nulos em um MANUAL → PENDING com job) está em :176-180 e :191-194.

**Autocomplete e criação**
- `createPropertySchema` não tem lat/lng, então o Zod remove esses campos.
- `PropertyFormDrawer.tsx:133` (`applyAddressSuggestion`) não copia as coordenadas da sugestão.

**Filiais**
- `SH/src/schemas/address.ts:16` (`branchAddressSchema`) aceita `latitude/longitude` opcionais. É usado em `SH/src/schemas/tenant.ts:178-190`.
- `WEB/src/features/tenants/hooks/useBranchSave.ts:67-68` envia as coordenadas da sugestão do autocomplete (modo temporário).
- `BranchFormDrawer.tsx:94` inicializa `latitude: 0, longitude: 0` quando o endereço é digitado, ou seja, grava (0,0).
- `create-branch.use-case.ts` e `update-branch.use-case.ts` gravam `address` em `branches.address_json` (Json?).
- Nenhum código lê coordenadas de filial: `formatBranchAddress` (`prisma-fy.repository.ts:234`) só usa os textos.
- Rotas em `BE/src/modules/tenant/interfaces/tenant.routes.ts`: POST em :316 e PATCH em :446. A resposta usa `branchResponseSchema` com `addressJson: z.unknown()` (`SH/src/schemas/responses.ts:151`).

**Fora desta tarefa (continuam temporários)**
- O autocomplete (`mapbox-address-lookup.service.ts`, com cache em memória de 5 min).
- O teste de conexão (`integration-connection-tester.ts:83`).

**Prisma**
- Enum `GeocodingStatus`: PENDING, SUCCESS, FAILED, MANUAL.
- `model Branch` não tem coluna de coordenada.
- Última migration: `20260929000000_financial_entry_nullable_initiator`.

### Decisões aplicáveis (dev, 2026-10-27)
1. A porta ganha `mode: 'permanent' | 'temporary'`, com **padrão `permanent`** (fail-safe).
2. Se a conta não tiver o modo permanente, o adaptador lança o erro claro `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`. **Nenhuma coordenada temporária é gravada.**
3. **Filiais entram no escopo (+0,5 dia).** O save de filial deixa de gravar lat/lng do autocomplete. O backend geocodifica o endereço no modo permanente ao salvar.
4. **Coluna marcadora `geocoded_permanently_at` (+0,25 dia)**, em uma migration pequena.
5. Lat/lng digitada pelo usuário no update de imóvel (override MANUAL) é dado do usuário: **mantida e travada com testes**.
6. Conta sem o modo permanente: **não reenfileirar**. Gravar FAILED com motivo explícito e parar de tentar. **Mecanismo aceito:** a coluna `properties.geocoding_failure_code`, o filtro `geocoding_failure_code IS NULL` em `findFailedGeocoding`, o método `countBlockedFailedGeocoding` e o log `skippedCount` no retry sweep.
7. O custo do modo permanente em todo preview de importação está aceito.
8. **Correção do bug do MANUAL (+0,25 dia):**
   - o web envia lat/lng só quando o usuário os alterou;
   - o backend só grava MANUAL se as coordenadas forem diferentes das gravadas. Caso contrário, mantém o status atual.
9. **Commit de preview anterior ao deploy:** `found` sem `mode` é tratado como `unverified`. O imóvel vai para PENDING e o worker o geocodifica no modo permanente. Assim esta tarefa não depende da TASK-X02-2 para ficar conforme.
10. **Detecção de stub:** `DynamicGeocodingService` ganha o método público `isConfigured(): Promise<boolean>`, que retorna `(await resolver.getConfig('mapbox')) !== null`. O script de legado (TASK-X02-2) o usa.
11. **Helpers compartilhados com a F01:** esta tarefa define e **exporta** o formatador da string de geocodificação e o helper de timeout síncrono, com nomes e caminhos fixos (ver "Contratos exportados para outras features"). Filial usa os dois agora; o endereço-base do inspetor (F01) vai usá-los depois.

### Decisões aplicáveis (lacunas aceitas, 2026-10-29)
12. **Spike da conta Mapbox antes de codar (L-X02-01, opção recomendada; +0,25 dia).** O passo 0 roda antes do passo 1, com o token de **dev**: (a) `curl` v5 com `permanent=true`; (b) `curl` v5 sem o parâmetro; (c) `curl` em `mapbox.places-permanent`. Registrar status, corpo e o contador "Permanent Geocoding API" na página Statistics/Billing da conta, antes e depois de cada chamada. **Critério de "modo permanente confirmado":** o contador de permanente sobe com (a). Um 200 com `features[0].center` não basta, porque não distingue "aceito como permanente" de "parâmetro ignorado". Só depois do spike se fixam URL, status e mensagem da recusa no passo 2 e nos testes 4 a 7 do adaptador. Mantém-se a v5 se confirmado.
13. **Contingência v6 (L-X02-01, aceita em 2026-10-28; +0,25 dia só se acionada).** Se o spike mostrar que a v5 não aceita `permanent=true` na conta, migra-se **só** o adaptador de geocodificação para `GET https://api.mapbox.com/search/geocode/v6/forward?q=…&access_token=…&limit=1&permanent=true`, lendo `features[0].geometry.coordinates` (`[lng, lat]`). Autocomplete e teste de conexão continuam na v5. É a única exceção aceita ao "não trocar de API" do plano.
14. **Detecção do erro de conta sem depender só de texto (L-X02-01).** Erro de conta ⇔ `status ∈ {401, 403, 422}` **e** (`message` contém "permanent", sem diferenciar maiúsculas, **ou** o formato de recusa provado no spike). Se o spike mostrar que a recusa não é distinguível pelo texto, documentar no passo 2 e tratar **403** como erro de conta (com token válido, 403 não acontece hoje).
15. **Habilitação da conta em paralelo (L-X02-01).** O pedido de habilitação do modo permanente à Mapbox (dev, staging e prod) é aberto no dia do spike, em paralelo à implementação, com responsável nomeado no passo 1 do rollout. O checklist de smoke registra a **prova positiva** (contador), não só o 200.
16. **`null/null` fora de MANUAL é ignorado (L-X02-02, opção recomendada; +0,25 dia).** No `PATCH /v1/properties/:id`, `latitude: null` e `longitude: null` em imóvel SUCCESS, PENDING ou FAILED não alteram lat, lng, status nem marcadora (log debug `property.update_coordinates_null_ignored`). Se o endereço mudou no mesmo PATCH, segue o fluxo de endereço (PENDING + job). **Invariante:** nunca gravar MANUAL com lat/lng nulos.
17. **Par incompleto é ignorado (L-X02-02).** Um dos dois campos presente e o outro ausente ou `null`: os dois são ignorados (comportamento atual, agora explícito e testado).
18. **Web só envia `null` de coordenada para MANUAL (L-X02-02).** No form de edição, selecionar uma sugestão do autocomplete só zera os campos de coordenada quando o imóvel é MANUAL; nos demais status, os campos mantêm os valores iniciais (e, iguais ao inicial, não são enviados). `latitude: null, longitude: null` só é enviado quando o imóvel atual é MANUAL e os dois campos foram limpos. Nos outros status, campos vazios = chaves ausentes. O unlock pelo web é comportamento **novo** (o `usePropertySave.ts:90-95` atual nunca envia `null`).
19. **Igualdade de endereço da filial (L-X02-04, opção recomendada).** "Mesmo endereço" ⇔ `normalize(formatGeocodingQuery(old)) === normalize(formatGeocodingQuery(new))`, com `normalize = s.trim().toLowerCase()` aplicado na comparação (não no formatador). Os dois lados passam pelo `GeocodableAddress`, então chaves extras do `address_json` (`latitude`, `longitude`, `formattedAddress`, `provider`) são ignoradas. A regra é exportada como `isSameGeocodingAddress` para a F01.
20. **Regra de escrita do update de filial (L-X02-04).** (a) `address` ausente: não toca em `address_json` nem na marcadora. (b) Mesmo endereço e marcadora presente: `addressJson = { ...data.address, latitude: old.latitude, longitude: old.longitude }`, marcadora mantida, sem Mapbox (o use-case **copia** as coordenadas, porque o repositório substitui o JSON inteiro). (c) Mesmo endereço e marcadora `NULL`, ou endereço diferente: geocodifica. Sucesso: JSON novo + lat/lng + marcadora `now()`. `null`, erro ou timeout: JSON novo **sem** lat/lng e marcadora `NULL` **explícita** (perder a coordenada do endereço antigo é o correto).
21. **Erro de conta no preview de import com curto-circuito (L-X02-07).** Ao capturar `MapboxPermanentGeocodingUnavailableError`, o verificador loga `error` uma vez por lote (`import.geocode_verify_permanent_unavailable`), marca as chaves **restantes** do lote como `unverified` **sem** chamar a Mapbox e segue. Outros erros continuam virando `unverified`, com um único `warn` agregado por lote com a contagem.
22. **Custo do sweep diário registrado com número (L-X02-05).** No passo 5 do rollout, medir em prod `countFailedGeocoding - countBlockedFailedGeocoding` (FAILED sem código) e registrar o custo diário esperado (`n × US$ 0,005`). Ali se decide se o cool-off de 24 h continua ou vira semanal; mantendo 24 h, registrar como decisão com o número.
23. **Equivalência `fullAddress` ≡ `formatGeocodingQuery` travada por teste (L-X02-08).** Enquanto `PropertyEntity.fullAddress` existir, `formatGeocodingQuery(entity)` deve devolver a mesma string.

### Decisões aplicáveis (reconciliação com outras tarefas, 2026-10-29)
24. **`branchAddressSchema` continua `z.object` puro (L-F01-01).** Remover `latitude/longitude` é só tirar as chaves do shape; o descarte de chaves desconhecidas vem do comportamento padrão do `z.object` (strip). Proibido `.transform`, `.refine`, `.superRefine`, `.passthrough` ou `.strict` no topo do schema, porque a F01 o deriva com `branchAddressSchema.extend(...)` (um `ZodEffects` não tem `.extend`). Validações cruzadas, se surgirem, vão no schema consumidor (`SH/src/schemas/tenant.ts`), não aqui.
25. **Cláusula de transição de N4 sai neste PR (L-X00-04, L-X00-07).** O PR da TASK-X02-1 apaga de `apps/backend/CLAUDE.md` §10 o trecho "(X02 adds the `mode` option to `IGeocodingService` … do not add any new write path that stores Mapbox coordinates.)" e confere que o texto final de N4 bate com as dec. 1, 2, 6, 8 e 9: modo `permanent` por padrão (1); nenhuma coordenada temporária gravada no erro de conta (2); `FAILED` + `geocoding_failure_code`, sem reenfileirar (6); `MANUAL` só quando o par difere do gravado (8). A dec. 9 (`found` sem `mode` → `unverified`/PENDING) não está no texto de N4 e não o contradiz; não é preciso acrescentá-la.
26. **X02 é pré-requisito do geofence BLOCK da F03 (L-F03-08, D27 da F03).** O modo BLOCK do check-in só pode ser ligado com a TASK-X02-1 em produção **e** depois de uma auditoria de geocodificação dos imóveis ativos. A X02 não liga nada na F03; ela entrega o insumo da auditoria: a marcadora `geocoded_permanently_at`, o `geocoding_failure_code` e o relatório da TASK-X02-2 (`moved`, `noResult`, `falseManual.*`).

### Modelo de dados
| Tabela | Coluna | Prisma | Tipo | Nulo | Default | Índice | Semântica |
|---|---|---|---|---|---|---|---|
| `properties` | `geocoded_permanently_at` | `DateTime?` | timestamp(3) | sim | `NULL` | nenhum | Quando lat/lng foram gravados a partir de geocodificação permanente. `NULL` significa: sem coordenada, MANUAL ou legado temporário. |
| `properties` | `geocoding_failure_code` | `String? @db.VarChar(64)` | varchar(64) | sim | `NULL` | nenhum | Motivo de um FAILED que **não** é retentado automaticamente. Valores: `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE` (esta tarefa) e `LEGACY_PERMANENT_NO_RESULT` (TASK-X02-2). |
| `branches` | `geocoded_permanently_at` | `DateTime?` | timestamp(3) | sim | `NULL` | nenhum | Quando `address_json.latitude/longitude` foram gravados a partir de geocodificação permanente. |

**Por que a marcadora também cobre filiais.** As filiais guardam coordenadas em `address_json`, hoje temporárias ou (0,0). Sem a marcadora:
- o script de legado não seria idempotente;
- o update de filial não saberia se pode manter as coordenadas quando o endereço não muda, e geocodificaria a cada save.

Guardar a marcadora dentro do JSON foi descartado: o update sobrescreve o JSON inteiro e esse conteúdo vem do cliente.

**Migration**
- Arquivo: `BE/prisma/migrations/<YYYYMMDDhhmmss>_permanent_geocoding_markers/migration.sql` (novo), por exemplo `20261028000000_permanent_geocoding_markers`.
- Contém só `ADD COLUMN … NULL`: expand puro, sem backfill, sem contract e sem lock longo.
- Ordem: staging antes de prod. Aplicar localmente e validar `prisma migrate diff` sem drift.
- Conferir que a migration não dropa o índice de `coordinates` (`Unsupported`) nem outros índices `Unsupported()` (memória `project_prisma_drift_drops_unsupported_indexes`).

**Regras de escrita (imóvel)**
- **SUCCESS permanente** (create síncrono, worker ou commit com `mode:'permanent'`): grava `lat/lng`, `geocoded_permanently_at = now()` e `geocoding_failure_code = NULL`. `coordinates` é sincronizada via repositório.
- **MANUAL efetivo** (coordenadas diferentes das gravadas): `geocoded_permanently_at = NULL`.
- **Unlock** de MANUAL: PENDING com marcadora `NULL`.
- **Mudança de endereço:** PENDING, com marcadora e código `NULL`.
- **FAILED por `null` da Mapbox:** código `NULL`, e o sweep de 24 h segue como hoje.
- **FAILED por erro de conta:** código `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`. Lat/lng não são alterados.
- **`POST /v1/properties/:id/geocode`:** PENDING com código `NULL`.

**Entidade e repositórios**
- `PropertyEntity` ganha as props **opcionais** `geocodedPermanentlyAt?: Date | null` e `geocodingFailureCode?: string | null`, com padrão `null`, para não quebrar os fixtures.
- `applyGeocodingResult(result, { permanent: true })` grava a marcadora.
- `IPropertyRepository.update` aceita os dois campos e continua sincronizando `coordinates`.
- `BranchEntity` e `IBranchRepository.update` aceitam `geocodedPermanentlyAt`.

**API pública:** as colunas novas não são expostas.

### Contratos

**Porta (interna)**
```ts
export type GeocodingMode = 'permanent' | 'temporary';
export interface GeocodeOptions { mode?: GeocodingMode } // ausente = 'permanent'
export interface IGeocodingService { geocode(address: string, options?: GeocodeOptions): Promise<GeocodingResult | null>; }
export class MapboxPermanentGeocodingUnavailableError extends Error { readonly code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'; }
// DynamicGeocodingService (infra) ganha também:
isConfigured(): Promise<boolean>; // (await resolver.getConfig('mapbox')) !== null
```
Mensagem do erro: `Mapbox account does not allow permanent geocoding; no coordinates were stored`.

**Mapbox (externo)**
- Requisição (provisória até o spike do passo 0): `GET https://api.mapbox.com/geocoding/v5/mapbox.places/{encodeURIComponent(address)}.json?access_token=…&limit=1&permanent=true`, montada com `URLSearchParams`.
- Contingência v6 (dec. 13, só se o spike reprovar a v5): `GET https://api.mapbox.com/search/geocode/v6/forward?q={address}&access_token=…&limit=1&permanent=true`; coordenadas em `features[0].geometry.coordinates` = `[lng, lat]`. A porta e o resto da tarefa não mudam.
- `permanent` só é omitido com `mode: 'temporary'`.
- Detecção do erro de conta (dec. 14): status 401, 403 ou 422 **e** (`message` contendo "permanent", sem diferenciar maiúsculas, **ou** o formato de recusa registrado no spike). Se a recusa não for distinguível pelo texto, 403 conta como erro de conta. O status e o corpo literais da recusa, registrados no spike, substituem os valores provisórios dos testes 4 e 5 do adaptador.
- Qualquer outra resposta com erro mantém o erro genérico atual.

**`PATCH /v1/properties/:propertyId`**
- Rota, RBAC, request e response inalterados.
- Muda só o comportamento de `latitude/longitude`:
  - **Ambos presentes, não nulos e diferentes do gravado** (comparação a 7 casas decimais, igual a `Decimal(10,7)`): MANUAL, com marcadora `NULL` e sem job.
  - **Ambos iguais ao gravado:** são ignorados. O status atual e a marcadora ficam como estão. Se o endereço mudou no mesmo PATCH, segue o fluxo de mudança de endereço: PENDING com job.
  - **Ambos nulos em um MANUAL:** unlock, como hoje.
  - **Ambos nulos em um imóvel SUCCESS, PENDING ou FAILED (dec. 16):** ignorados. Lat, lng, status e marcadora ficam como estão; log debug `property.update_coordinates_null_ignored`. Se o endereço mudou no mesmo PATCH, segue o fluxo de mudança de endereço (PENDING + job).
  - **Par incompleto (dec. 17):** um campo presente e o outro ausente ou `null` → os dois são ignorados.
  - **Invariante:** nenhum ramo grava `geocodingStatus = 'MANUAL'` com lat ou lng nulos.
- Erros existentes inalterados.

**`POST /v1/tenants/:tenantId/branches`** e **`PATCH /v1/tenants/:tenantId/branches/:branchId`**
- RBAC:
  - AM e OP: qualquer tenant;
  - CL_ADMIN: só o próprio tenant;
  - CL_USER, INSP e TNT: 403 `AUTH_FORBIDDEN`, mensagem "Insufficient permissions".
- Request: `address` = `branchAddressSchema` **sem** `latitude/longitude`. O Zod remove esses campos se um cliente antigo os enviar (sem 400).
- Response 201/200: `addressJson` traz `latitude/longitude` **somente** quando a geocodificação permanente deu certo.
- Erros (inalterados):
  - 400 `VALIDATION_ERROR`;
  - 404 `TENANT_NOT_FOUND` "Tenant not found";
  - 404 `BRANCH_NOT_FOUND` "Branch not found";
  - 409 `TENANT_INACTIVE` "Tenant is not active";
  - 409 `BRANCH_NAME_CONFLICT` "A branch with this name already exists in this tenant".
- Uma falha de geocodificação **nunca** falha o save.
- OpenAPI: rodar `pnpm --filter backend generate:openapi` e depois `pnpm --filter @properfy/shared generate:types`.

**Preview de importação**
- `geocodeVerificationSchema` (`SH/src/schemas/import.ts:52`) ganha, na variante `found`, o campo `mode: z.literal('permanent').optional()`. Ele precisa ser declarado, senão a serialização o remove.
- O verificador preenche `mode: 'permanent'`.
- No commit, `found` sem `mode` (preview anterior ao deploy) é tratado como `unverified`: o imóvel fica PENDING, sem lat/lng, e o job é enfileirado.

**`POST /v1/properties/:propertyId/geocode`**
- Contrato inalterado: AM/OP; 202 `{ propertyId, geocodingStatus: 'PENDING' }`; 404 `PROPERTY_NOT_FOUND`; `PROPERTY_GEOCODING_MANUAL_OVERRIDE` para MANUAL.
- Mudança: também zera `geocoding_failure_code`.

### Contratos exportados para outras features
Consumidor previsto: F01 (endereço-base do inspetor). Os nomes e caminhos são contrato, não podem mudar sem avisar a F01. Nenhum dos dois módulos importa `tenant`, `inspector` ou `appointment`, então não há ciclo.

**(a) Formatador da string de geocodificação** — `apps/backend/src/shared/domain/geocoding-address.ts` (novo; mesmo lugar do precedente `normalize-address.ts`)
```ts
export interface GeocodableAddress {
  street: string;
  number?: string | null;
  complement?: string | null;
  addressLine2?: string | null;
  suburb: string;
  city?: string | null;
  state: string;
  postcode: string;
  country: string;
}
export function formatGeocodingQuery(address: GeocodableAddress): string;
```
- Ordem: `street`, `number`, `complement`, `addressLine2`, `suburb`, `city`, `state`, `postcode`, `country`.
- Cada parte passa por `trim()`. Partes vazias, `null` ou `undefined` são omitidas. O separador é `', '`.
- `city` é omitida quando é igual a `suburb` sem diferenciar maiúsculas. O web de filial envia `city = suburb`, e a duplicação pioraria o match.
- Função pura, sem I/O.
- O `PropertyEntity.fullAddress` **não** muda nesta tarefa, por impacto mínimo. Para endereços já com `trim` (como os gravados), `formatGeocodingQuery(entity) === entity.fullAddress` (dec. 23, teste 6): imóvel não tem `number`, `complement` nem `city`, então a ordem coincide (`street, addressLine2, suburb, state, postcode, country`).

Igualdade de endereço (dec. 19), no mesmo arquivo:
```ts
export function isSameGeocodingAddress(a: GeocodableAddress, b: GeocodableAddress): boolean;
// formatGeocodingQuery(a).trim().toLowerCase() === formatGeocodingQuery(b).trim().toLowerCase()
```
- Chaves extras de um `address_json` (`latitude`, `longitude`, `formattedAddress`, `provider`) não entram na comparação.
- Usada pelo update de filial agora e pela F01 ("mesmo endereço → não chama o serviço") depois.

**(b) Timeout da geocodificação síncrona** — `apps/backend/src/modules/property/application/services/geocode-with-timeout.ts` (novo; fica ao lado da porta `IGeocodingService`, que já é importada por `integration` e `appointment`)
```ts
export const GEOCODE_SYNC_TIMEOUT_MS = 4000;
export class GeocodeTimeoutError extends Error { readonly code = 'GEOCODE_TIMEOUT'; } // mensagem: 'Geocoding did not answer within {timeoutMs} ms'
export function geocodeWithTimeout(
  service: IGeocodingService,
  address: string,
  opts?: { mode?: GeocodingMode; timeoutMs?: number }, // padrões: mode 'permanent', timeoutMs GEOCODE_SYNC_TIMEOUT_MS
): Promise<GeocodingResult | null>;
```
- Resolve com o resultado (ou `null`) se o serviço responder dentro do prazo.
- Rejeita com `GeocodeTimeoutError` quando o prazo estoura.
- Repassa sem alterar as exceções do serviço, inclusive `MapboxPermanentGeocodingUnavailableError`.
- Engole a rejeição tardia da chamada perdida (sem unhandled rejection) e sempre limpa o timer.
- `create-property.use-case.ts` passa a usá-lo: `geocodeWithinTimeout` privado é removido e `DEFAULT_SYNC_GEOCODE_TIMEOUT_MS` (:24) é substituído por `GEOCODE_SYNC_TIMEOUT_MS`. O parâmetro de construtor `syncGeocodeTimeoutMs` continua, repassado como `timeoutMs`.
- `create-branch` e `update-branch` usam o helper com o padrão.
- `import-geocode-verifier.ts` mantém o próprio timeout por lote. Fora do escopo.

### Estados e comportamentos
| Caminho | Sucesso | `null` | Erro de conta | Outro erro / timeout | Retry |
|---|---|---|---|---|---|
| Create de imóvel (síncrono, 4 s) | SUCCESS + marcadora | FAILED | PENDING + job | PENDING + job | job `retryLimit: 6` |
| Worker `property.geocode` | SUCCESS + marcadora, código `NULL` | FAILED + audit "no results" | FAILED + código + audit + `logger.error`. **Não lança**, então o pg-boss não refaz. | FAILED + audit "service error" | Sweep de 24 h só com `failure_code IS NULL` |
| Retry sweep (`*/15`) | – | – | Ignora os que têm código e loga `skippedCount` | Reenfileira os que não têm código | – |
| Preview de import | `found` + `mode` | `not_found` | `unverified` + `logger.error` uma vez por lote; as chaves restantes do lote viram `unverified` sem chamar a Mapbox (dec. 21) | `unverified` + um `warn` agregado por lote | – |
| Commit de import | SUCCESS + marcadora (só com `mode`) | FAILED | – | PENDING + job. `found` sem `mode` cai aqui também. | – |
| Update de imóvel com lat/lng iguais ao gravado | Status e marcadora mantidos, sem job | – | – | – | – |
| Update de imóvel com lat/lng diferentes | MANUAL, marcadora `NULL` | – | – | – | – |
| Update de imóvel não-MANUAL com `null/null` ou par incompleto (dec. 16 e 17) | Coordenadas, status e marcadora mantidos; se o endereço mudou, PENDING + job | – | – | – | – |
| Save de filial (síncrono, 4 s) | `address_json` com lat/lng + marcadora | Sem lat/lng, marcadora `NULL` | Idem + `logger.error` | Idem + `logger.warn` | Sem retry |
| Update de filial sem `address` | Não toca em `address_json` nem na marcadora | – | – | – | – |
| Update de filial com o mesmo endereço (`isSameGeocodingAddress`) e marcadora presente | `addressJson = { ...data.address, latitude: old.latitude, longitude: old.longitude }`, marcadora mantida, sem chamar a Mapbox | – | – | – | – |
| Update de filial com endereço diferente, ou mesmo endereço e marcadora `NULL` | JSON novo + lat/lng + marcadora `now()` | JSON novo sem lat/lng, marcadora `NULL` explícita | Idem + `logger.error` | Idem + `logger.warn` | Sem retry |

**Circuit breaker.** O erro de conta não pode abrir o breaker nem ser mascarado como `Circuit breaker OPEN`. O adaptador devolve um sentinela de dentro do `execute` e lança `MapboxPermanentGeocodingUnavailableError` fora do breaker.

**UI web, imóvel (form de edição)**
- Os campos continuam pré-preenchidos.
- O payload só inclui `latitude/longitude` quando o valor digitado difere do valor inicial, comparado como número parseado.
- Limpar os dois campos de um MANUAL envia `latitude: null, longitude: null` (unlock). É comportamento **novo** no web: hoje `usePropertySave.ts:90-95` nunca envia `null` (dec. 18).
- Imóvel não-MANUAL com os campos limpos: as chaves não vão no payload.
- Selecionar uma sugestão do autocomplete em modo edição: zera os campos de coordenada **só** se o imóvel for MANUAL; nos demais status, os campos mantêm os valores iniciais e não são enviados. No modo criação, os campos ficam `''` como hoje.
- Sem copy nova. O `GeocodingStatusBadge` continua mostrando FAILED: é assim que o erro de conta fica visível no status.
- Loading, sucesso e erro: os snackbars e o `isSaving` atuais.

**UI web, filial**
- Sem copy nova.
- O save pode levar até cerca de 4 s a mais. O `isSaving` já cobre isso.

### Copy de logs e auditoria (inglês)
| Onde | Nível | Mensagem | Campos |
|---|---|---|---|
| Worker, erro de conta | error | `Mapbox permanent geocoding unavailable; property marked FAILED without retry` | `propertyId`, `code` |
| Create, erro de conta no síncrono | warn (existente) | `property.sync_geocode_failed_falling_back` | `propertyId`, `err` |
| Retry sweep | info | `Skipped FAILED properties blocked by a geocoding failure code` | `skippedCount` |
| Commit de import com `found` sem `mode` | info | `Legacy preview verification treated as unverified` | `importId`, `normalizedAddressKey` |
| Update de imóvel com coordenadas iguais | debug | `property.update_coordinates_unchanged_ignored` | `propertyId` |
| Update de imóvel não-MANUAL com `null/null` ou par incompleto | debug | `property.update_coordinates_null_ignored` | `propertyId`, `geocodingStatus` |
| Preview de import, erro de conta (uma vez por lote) | error | `import.geocode_verify_permanent_unavailable` | `code`, `remaining` |
| Preview de import, outros erros (agregado por lote) | warn | `import.geocode_verify_failed` | `failedCount` |
| Filial, erro de conta | error | `branch.geocode_permanent_unavailable` | `branchId`, `tenantId`, `code` |
| Filial, `null`, erro ou timeout | warn | `branch.geocode_failed_saved_without_coordinates` | `branchId`, `tenantId`, `reason: 'no_results' \| 'error' \| 'timeout'` |
| Audit `property.geocoding_failed` (existente) | – | `metadata.reason = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE: Mapbox account does not allow permanent geocoding'` | `metadata.code` (novo) |

- Os audits `property.updated`, `branch.created` e `branch.updated` continuam como estão. O `after` reflete o status e as coordenadas efetivos.
- Métricas: o gauge `geocoding.failedCount` (`metrics.ts:220`) continua contando todo FAILED. Não há métrica nova.

### Edge cases
1. Imóvel MANUAL: o worker pula e a marcadora fica `NULL`.
2. Timeout no síncrono com a resposta chegando depois: o resultado tardio é descartado e o job refaz a chamada.
3. Erro de conta no create: PENDING → worker → FAILED com código → o sweep não reenfileira.
4. Conta corrigida: `POST /v1/properties/:id/geocode` para um imóvel, ou a flag `--retry-failed-permanent` (TASK-X02-2) em massa.
5. Seis ou mais erros de conta seguidos: o breaker não abre e o código continua correto.
6. Token inválido (401 sem "permanent" na mensagem): erro genérico, FAILED sem código, retry normal.
7. Preview anterior ao deploy commitado depois: tratado como `unverified`, fica PENDING e o worker usa o modo permanente.
8. Edição de imóvel SUCCESS sem mexer nas coordenadas:
   - web: não envia lat/lng;
   - backend (cliente antigo que ainda envia os mesmos valores): ignora;
   - em ambos os casos, o status continua SUCCESS.
9. Valores iguais com outra precisão (`-33.80000001` contra `-33.8000000` gravado): iguais a 7 casas, ignorados.
10. Só um dos dois campos alterado (ambos não vazios): o web envia os dois (o par) e o backend compara o par. Um campo vazio e o outro preenchido: o web não envia nenhum e, se um cliente antigo mandar só um, o backend ignora os dois (dec. 17).
11. Update com lat/lng diferentes **e** mudança de endereço: MANUAL vence, sem job e com marcadora `NULL` (comportamento atual).
12. Filial com endereço digitado (o form inicializava em (0,0)): o backend ignora e geocodifica.
13. Filial atualizada só no nome: nada é geocodificado.
14. Filial com o mesmo endereço e marcadora `NULL` (legado): geocodifica.
15. Cliente antigo enviando `latitude` em filial: removido pelo Zod.
16. Sem config `mapbox`: o stub devolve `null`. Imóvel fica FAILED e filial fica sem coordenadas.
17. Endereço de filial sem `number` ou `complement`: o texto é montado sem vírgulas vazias.
18. Imóvel SUCCESS editado trocando a sugestão do autocomplete (L-X02-02): o web mantém os campos de coordenada com os valores iniciais e manda só o endereço novo; o backend põe PENDING + job; `coordinates` antiga fica até o worker gravar a permanente.
19. Cliente antigo manda `null/null` para um imóvel SUCCESS, PENDING ou FAILED: ignorado; nunca vira MANUAL sem coordenada.
20. Update de filial que só muda `contactEmail`, com o form reenviando o mesmo `address` (`useBranchSave.ts` reenvia sempre, com `city = suburb`): `isSameGeocodingAddress` → mantém lat/lng copiando do JSON antigo, sem Mapbox.
21. Update de filial com o mesmo endereço em outra caixa ou com espaços nas pontas: igual (sem Mapbox).
22. Update de filial com endereço diferente e Mapbox `null`: a coordenada antiga (do endereço errado) some e a marcadora vira `NULL`; o script de legado não a seleciona porque não há `latitude` no JSON.
23. Preview de import de 500 linhas com a conta sem o recurso: 1 chamada à Mapbox, 500 `unverified`, 1 `logger.error`.
24. Spike mostra que a v5 ignora `permanent=true` (contador de permanente não sobe): aciona a contingência v6 (dec. 13) antes do passo 2; nenhum código grava coordenada antes disso.

### Critérios de aceite
- **CA1 (plano X02):** toda chamada cujo resultado é gravado envia `permanent=true`. Isso vale para o create, o worker, o verificador de import e o save de filial.
- **CA2 (plano X02):** o autocomplete continua temporário e as coordenadas dele nunca são gravadas, nem em imóvel nem em filial.
- **CA3 (plano X02):** com a conta sem o modo permanente, nenhuma coordenada é gravada. O erro aparece no log (`code`) e no status do imóvel (FAILED).
- **CA4 (dec. 6):** um FAILED por erro de conta não é reenfileirado pelo sweep nem pelo pg-boss.
- **CA5 (dec. 4):** toda gravação vinda do modo permanente preenche a marcadora. Coordenadas de qualquer outra origem deixam a marcadora `NULL`. `coordinates` (PostGIS) fica sempre consistente com lat/lng.
- **CA6 (dec. 5 e 8):**
  - lat/lng digitados e diferentes do gravado viram MANUAL;
  - editar um imóvel sem mudar as coordenadas não muda o status;
  - o web não envia coordenadas que não foram alteradas.
- **CA7 (dec. 9):** o commit de um preview anterior ao deploy não grava coordenada temporária.
- **CA8:** a migration é aplicada sem drift; `openapi.json` e `api-types.ts` são regenerados; lint, typecheck e testes de backend, shared e web passam.
- **CA9 (L-X02-01):** o modo permanente foi confirmado no spike por prova positiva (contador "Permanent Geocoding API" sobe), registrada em `docs/ops/pre-deploy-smoke-checklist.md`, antes do passo 2; a URL e o formato da recusa nos testes vêm do spike.
- **CA10 (L-X02-02):** nenhum PATCH grava MANUAL sem coordenada; editar um imóvel SUCCESS trocando a sugestão do autocomplete regeocodifica (PENDING + job) em vez de apagar as coordenadas.
- **CA11 (L-X02-04):** salvar uma filial sem mudar o endereço não chama a Mapbox e preserva lat/lng e marcadora; endereço alterado com falha deixa a marcadora `NULL`.
- **CA12 (L-X02-07):** com a conta sem o recurso, o preview de import faz no máximo uma chamada por lote e registra `import.geocode_verify_permanent_unavailable`.

### Testes primeiro (TDD)

**Unit (backend)**

`BE/src/modules/property/infrastructure/mapbox-geocoding.service.test.ts` (novo; `vi.stubGlobal('fetch')`):
1. `geocode('A')`: a URL contém `permanent=true` e `limit=1`. `center: [151.2, -33.8]` vira `{lat: -33.8, lng: 151.2}`.
2. Com `{mode:'permanent'}`: igual ao caso 1.
3. Com `{mode:'temporary'}`: a URL não contém `permanent`.
4. Resposta 403 com `{message:'Permanent geocodes are not enabled for this account'}` (valores **provisórios**; substituir pelo status e corpo literais registrados no spike do passo 0, dec. 12): rejeita com `code === 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`, e `fetch` é chamado uma única vez.
5. Seis respostas iguais ao caso 4 seguidas: a sexta ainda traz o código.
6. Resposta 500: erro genérico `Mapbox geocoding failed with status 500`.
7. Resposta 401 sem "permanent": erro genérico.
8. `features: []`: devolve `null`.
9. Endereço com `&` e `#`: é codificado.
10. Se o spike concluir que a recusa não traz "permanent" (dec. 14): resposta 403 com `{message:'Forbidden'}` → `code === 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`. Caso contrário, este caso não existe e o teste 7 cobre o 401 genérico.
11. (Só com a contingência v6, dec. 13) `geocode('A')` chama `…/search/geocode/v6/forward?q=A&…&limit=1&permanent=true`; `features[0].geometry.coordinates: [151.2, -33.8]` vira `{lat: -33.8, lng: 151.2}`.

`…/integration/infrastructure/__tests__/dynamic-providers.test.ts`, `describe('DynamicGeocodingService')`:
1. Sem config: devolve `null`, e `isConfigured()` devolve `false`.
2. Com config: `isConfigured()` devolve `true`.
3. Repassa `{mode:'temporary'}` ao serviço interno.
4. Sem opções: o serviço interno recebe `undefined`.
5. Troca de token: recria o adaptador.

`BE/src/shared/domain/geocoding-address.test.ts` (novo):
1. Endereço completo de filial `{street:'1 Main St', number:'10', complement:'Unit 2', suburb:'Parramatta', city:'Sydney', state:'NSW', postcode:'2150', country:'AU'}` vira `'1 Main St, 10, Unit 2, Parramatta, Sydney, NSW, 2150, AU'`.
2. `city` igual a `suburb` com outra caixa (`'parramatta'`): a cidade é omitida, ficando `'1 Main St, Parramatta, NSW, 2150, AU'`.
3. `number`, `complement` e `addressLine2` nulos, vazios ou só com espaços: omitidos, sem vírgulas duplas.
4. Espaços nas pontas são removidos.
5. Endereço no formato de imóvel com `addressLine2:'Level 3'`: aparece depois de `street`.
6. Equivalência (dec. 23): para um `PropertyEntity` com `{street:'1 Main St', addressLine2:'Level 3', suburb:'Parramatta', state:'NSW', postcode:'2150', country:'AU'}`, `formatGeocodingQuery(entity) === entity.fullAddress` (`'1 Main St, Level 3, Parramatta, NSW, 2150, AU'`); idem sem `addressLine2`.
7. `isSameGeocodingAddress({street:'1 Main St', suburb:'Parramatta', city:'Parramatta', state:'NSW', postcode:'2150', country:'AU'}, {street:' 1 MAIN ST ', suburb:'parramatta', state:'nsw', postcode:'2150', country:'au'})`: `true`.
8. `isSameGeocodingAddress` com `postcode` diferente (`'2150'` × `'2151'`): `false`.
9. `isSameGeocodingAddress` com o primeiro lado trazendo chaves extras (`latitude:-33.8, longitude:151.2, formattedAddress:'x'`): `true` (ignoradas).

`BE/src/modules/property/application/services/geocode-with-timeout.test.ts` (novo; fake timers):
1. O serviço resolve `{lat,lng}` em 10 ms: devolve o resultado, e o serviço é chamado com `(address, {mode:'permanent'})`.
2. Sem `opts`: usa `GEOCODE_SYNC_TIMEOUT_MS` (4000) e `mode:'permanent'`.
3. `opts.mode:'temporary'` é repassado.
4. O serviço demora 5000 ms: rejeita com `GeocodeTimeoutError` (`code:'GEOCODE_TIMEOUT'`) aos 4000 ms.
5. `timeoutMs: 50`: rejeita aos 50 ms.
6. O serviço rejeita com `MapboxPermanentGeocodingUnavailableError`: rejeita com a mesma instância.
7. O serviço rejeita depois do timeout: nenhum `unhandledRejection` (listener espião).
8. O serviço resolve `null`: devolve `null`.
9. Depois de resolver ou rejeitar, `vi.getTimerCount()` é 0.

`BE/tests/unit/property/create-property.use-case.test.ts`:
1. O geocoder recebe `(fullAddress, {mode:'permanent'})`.
2. Sucesso: SUCCESS com a marcadora preenchida (Date).
3. Erro de conta: PENDING, lat/lng nulos, `sendJob('property.geocode')`.
4. `null`: FAILED e marcadora nula.

`BE/tests/unit/property/geocode.worker.test.ts`:
1. O geocoder é chamado com `{mode:'permanent'}`.
2. Sucesso: `update` recebe `{lat, lng, geocodingStatus:'SUCCESS', geocodedPermanentlyAt: expect.any(Date), geocodingFailureCode: null}`.
3. Erro de conta: `update` recebe `{geocodingStatus:'FAILED', geocodingFailureCode:'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'}`, sem lat/lng. O audit traz `metadata.code`, `logger.error` é chamado e o método resolve sem lançar.
4. Erro genérico: FAILED sem código.
5. MANUAL: o geocoder não é chamado.

`BE/tests/unit/property/geocode-retry.worker.test.ts`:
1. Só os FAILED sem código são reenfileirados.
2. O log `skippedCount` usa o valor de `countBlockedFailedGeocoding`.

`BE/tests/unit/property/geocode-property.use-case.test.ts`:
1. `update` recebe `{geocodingStatus:'PENDING', geocodingFailureCode:null}`.

`BE/tests/unit/property/update-property.use-case.test.ts`:
1. Imóvel SUCCESS em `(-33.8, 151.2)` recebe `(-33.9, 151.3)`: `update` com `{lat:-33.9, lng:151.3, geocodingStatus:'MANUAL', geocodedPermanentlyAt:null}`. Invariante (dec. 16), checada em todos os casos deste arquivo: nenhuma chamada a `update` traz `geocodingStatus:'MANUAL'` com `lat` ou `lng` nulos.
2. Imóvel SUCCESS em `(-33.8, 151.2)` recebe `(-33.8, 151.2)`: `update` **sem** lat, lng e `geocodingStatus`; nenhum job; o status continua SUCCESS no audit `after`.
3. Valores iguais a 7 casas (`-33.80000001`): mesmo resultado do caso 2.
4. Coordenadas iguais e endereço alterado: PENDING com job; marcadora e código nulos.
5. Unlock de MANUAL: PENDING com job e marcadora nula.
6. Mudança só de endereço: PENDING com marcadora e código nulos.
7. Imóvel SUCCESS em `(-33.8, 151.2)` recebe `{latitude:null, longitude:null}`: `update` **sem** lat, lng e `geocodingStatus`; nenhum job; `logger.debug('property.update_coordinates_null_ignored')`; status SUCCESS no audit `after`. Idem para PENDING e FAILED.
8. Imóvel SUCCESS recebe `{latitude:null, longitude:null, street:'2 New St'}`: `update` com `{geocodingStatus:'PENDING', geocodedPermanentlyAt:null, geocodingFailureCode:null}`, sem lat/lng nulos; `sendJob('property.geocode')`.
9. Par incompleto: SUCCESS recebe `{latitude:-33.9}` (sem `longitude`) ou `{latitude:-33.9, longitude:null}`: nada de coordenada nem status é alterado.

`BE/src/modules/property/application/services/import-geocode-verifier.test.ts`:
1. O geocoder é chamado com `{mode:'permanent'}`.
2. Endereço encontrado: `{status:'found', lat, lng, mode:'permanent'}`.
3. Erro de conta (dec. 21): lote com 3 endereços e o geocoder rejeitando com `MapboxPermanentGeocodingUnavailableError` na 1ª chamada → o geocoder é chamado **1** vez, as 3 chaves ficam `unverified` e `logger.error('import.geocode_verify_permanent_unavailable', {code, remaining: 2})` é chamado uma vez.
4. Erro genérico em 2 de 3 endereços: 2 `unverified`, 1 `found`, um único `logger.warn` com `failedCount: 2`.

`BE/src/modules/appointment/infrastructure/workers/appointment-import-commit.worker.test.ts`:
1. `found` com `mode`: SUCCESS com marcadora.
2. `found` sem `mode`: PENDING, `lat/lng` nulos e `jobQueue.enqueue('property.geocode')` chamado.

`BE/tests/unit/tenant/create-branch.use-case.test.ts`:
1. Sucesso: `addressJson` recebe as lat/lng do geocoder e a marcadora (Date). O geocoder é chamado com `(formatGeocodingQuery(address), {mode:'permanent'})`, ou seja, `('1 Main St, Suburb, City, NSW, 2000, AU', {mode:'permanent'})`, via `geocodeWithTimeout`.
2. `null`: sem lat/lng, marcadora nula, `logger.warn`.
3. Erro de conta: igual ao caso 2, com `logger.error`.
4. Timeout (fake timers, 4000 ms): igual ao caso 2, com `reason:'timeout'`.
5. Input com `latitude`: ignorado.
6. Sem `address`: o geocoder não é chamado.
7. Sem geocoder injetado: salva sem coordenadas.

`BE/tests/unit/tenant/update-branch.use-case.test.ts`:
1. Endereço alterado: geocodifica.
2. Mesmo endereço com marcadora (old `address_json` `{street:'1 Main St', suburb:'Parramatta', state:'NSW', postcode:'2150', country:'AU', latitude:-33.81, longitude:151.0}`, input com o mesmo endereço em outra caixa e `city:'Parramatta'`): não chama o geocoder; o `addressJson` passado ao repositório é `{...input.address, latitude:-33.81, longitude:151.0}`; `geocodedPermanentlyAt` não é enviado (mantido).
3. Mesmo endereço sem marcadora: geocodifica.
4. Só o nome (sem `address` no input): não chama o geocoder; `addressJson` e `geocodedPermanentlyAt` ausentes do `update`.
5. Endereço alterado e geocoder devolve `null`: `addressJson` sem `latitude/longitude` e `geocodedPermanentlyAt: null` explícito; `logger.warn` com `reason:'no_results'`.
6. Endereço alterado e erro (genérico, de conta ou timeout): igual ao caso 5, com `geocodedPermanentlyAt: null` e o log correspondente.

**Unit (shared/web)**

`SH/src/schemas/property.test.ts`:
1. `createPropertySchema` remove `latitude/longitude`.
2. `updatePropertySchema` mantém `latitude/longitude`.

`SH/src/schemas/address.test.ts`:
1. `branchAddressSchema.parse({...válido, latitude:1, longitude:2})` devolve o objeto sem essas chaves.
2. `branchAddressSchema` é derivável (dec. 24, L-F01-01): `branchAddressSchema instanceof z.ZodObject` e `branchAddressSchema.extend({ extra: z.string() }).parse({...válido, extra:'x'})` devolve o objeto com `extra`, sem lançar.

`SH/src/schemas/import.test.ts`:
1. `found` com `mode:'permanent'`: válido.
2. `found` sem `mode`: válido.
3. `mode:'temporary'`: inválido.

`WEB/src/features/properties/components/PropertyFormDrawer.test.tsx`:
1. Modo criação: selecionar uma sugestão com lat/lng deixa os campos `''`.
2. Editar um imóvel com coordenadas pré-preenchidas e salvar sem tocar nelas: o payload do PATCH não tem `latitude/longitude`.
3. Mudar a latitude: o payload tem os dois campos (o par).
4. Imóvel **MANUAL**: limpar os dois campos → o payload tem `latitude:null, longitude:null`.
5. Imóvel **SUCCESS** em `(-33.8, 151.2)`: trocar a sugestão do autocomplete e salvar → os campos continuam `-33.8`/`151.2`; o payload tem o endereço novo e **não** tem `latitude/longitude`.
6. Imóvel **MANUAL**: trocar a sugestão → os campos de coordenada ficam `''`.
7. Imóvel **SUCCESS**: limpar os dois campos e salvar → o payload não tem `latitude/longitude` (nem `null`).

`WEB/src/features/properties/hooks/usePropertySave.test.ts` (novo, se a lógica do diff ficar no hook):
1. `buildPayload(data, initial)` sem diferença: sem coordenadas.
2. Com diferença: com coordenadas.
3. `initial.geocodingStatus:'MANUAL'` e os dois campos `''`: `latitude:null, longitude:null`.
4. `initial.geocodingStatus:'SUCCESS'` e os dois campos `''`: chaves ausentes.
5. Um campo `''` e o outro preenchido e diferente: chaves ausentes.

`WEB/src/features/tenants/hooks/useBranchSave.test.ts`:
1. O body do POST/PATCH não contém `latitude/longitude`.

**Integração**

`BE/tests/integration/db/property-geocode-permanent.integration.test.ts` (novo; `vitest.integration-db.config.ts`):
1. PENDING vira SUCCESS: `lat/lng` gravados, `geocoded_permanently_at` não nulo, `coordinates` igual a `ST_SetSRID(ST_MakePoint(lng,lat),4326)` (conferido com `ST_X`/`ST_Y` via `$queryRaw`), e a URL tem `permanent=true`.
2. Erro de conta: FAILED, `lat/lng/coordinates` NULL, código gravado e linha em `audit_logs`.
3. `findFailedGeocoding(futuro)` exclui o caso 2 e inclui um FAILED sem código.
4. Update com as mesmas coordenadas em um SUCCESS: status SUCCESS e `coordinates` intacta.
5. Update com coordenadas diferentes: MANUAL, e `coordinates` igual ao novo ponto.
6. Update de um SUCCESS com `latitude:null, longitude:null` e endereço novo: PENDING, `lat/lng` e `coordinates` intactos (os antigos) até o worker rodar; depois do worker, SUCCESS com marcadora e `coordinates` no ponto novo.

`BE/tests/integration/tenant/tenant.routes.test.ts`:
1. POST de filial com `address.latitude`: 201, e o `addressJson` não contém o valor enviado.
2. CL_USER: 403 `AUTH_FORBIDDEN`.

**E2E:** não se aplica (sem tela nova).

### Escopo / Passos
- [ ] **0. Spike da conta Mapbox (antes de codar)** · ops/docs · 0,25 (dec. 12 a 15, L-X02-01)
  - Com o token de **dev**: (a) `curl "https://api.mapbox.com/geocoding/v5/mapbox.places/1%20Martin%20Place%2C%20Sydney%20NSW.json?access_token=$TOKEN&limit=1&permanent=true"`; (b) a mesma URL sem `permanent`; (c) `curl "https://api.mapbox.com/geocoding/v5/mapbox.places-permanent/1%20Martin%20Place%2C%20Sydney%20NSW.json?access_token=$TOKEN&limit=1"`.
  - Para cada uma: registrar status, corpo e o contador "Permanent Geocoding API" em Statistics/Billing da conta, antes e depois.
  - Saídas obrigatórias, registradas em `docs/ops/pre-deploy-smoke-checklist.md`: (1) a forma de URL que faz o contador de permanente subir; (2) status e corpo literais da recusa, se houver; (3) se a recusa é distinguível pelo texto.
  - Se (a) não subir o contador e nenhuma forma v5 servir: acionar a contingência v6 (dec. 13, +0,25 dia no passo 2) e repetir a prova com `…/search/geocode/v6/forward?q=…&permanent=true`.
  - Abrir no mesmo dia o pedido de habilitação do modo permanente à Mapbox para dev, staging e prod, com responsável nomeado no passo 1 do rollout.
- [ ] **1. Porta, stub, Dynamic e helpers exportados** · backend · 0,25
  - `geocoding.service.ts`: tipos e classe de erro.
  - `BE/src/modules/property/application/services/geocode-with-timeout.ts` (novo): `GEOCODE_SYNC_TIMEOUT_MS`, `GeocodeTimeoutError` e `geocodeWithTimeout`.
  - `BE/src/shared/domain/geocoding-address.ts` (novo): `GeocodableAddress`, `formatGeocodingQuery` e `isSameGeocodingAddress`.
  - `stub-geocoding.service.ts`.
  - `dynamic-providers.ts`: repasse das opções e `isConfigured()`.
- [ ] **2. Adaptador Mapbox** · backend · 0,5 (+0,25 se a contingência v6 for acionada)
  - `mapbox-geocoding.service.ts`: `URLSearchParams`, a forma de URL confirmada no spike, `permanent=true` por padrão, detecção do erro de conta pela regra da dec. 14 com o formato literal do spike, e erro lançado fora do breaker.
  - Contingência v6: só o adaptador de geocodificação muda de endpoint e de leitura (`features[0].geometry.coordinates`); `mapbox-address-lookup.service.ts` e `integration-connection-tester.ts` ficam na v5.
- [ ] **3. Migration, entidade e repositórios** · db/backend · 0,25
  - `BE/prisma/schema.prisma` e `BE/prisma/migrations/<ts>_permanent_geocoding_markers/migration.sql` (novo).
  - `property.entity.ts`, `property.repository.ts`, `prisma-property.repository.ts` (mapeamento, `update` com `syncCoordinates`, filtro em `findFailedGeocoding`, `countBlockedFailedGeocoding` novo).
  - `branch.entity.ts`, `branch.repository.ts`, `prisma-branch.repository.ts`.
- [ ] **4. Caminhos de imóvel que gravam e parada do retry** · backend/shared · 0,5
  - `create-property.use-case.ts`: usa `geocodeWithTimeout` (remove `geocodeWithinTimeout` e `DEFAULT_SYNC_GEOCODE_TIMEOUT_MS`).
  - `geocode.worker.ts`, `geocode-retry.worker.ts`.
  - `import-geocode-verifier.ts` (:96, `catch` sem log): curto-circuito do lote no erro de conta, `logger.error` uma vez e `warn` agregado para os demais erros (dec. 21).
  - `SH/src/schemas/import.ts` (campo `mode`).
  - `appointment-import-commit.worker.ts:304-328`: `found` sem `mode` vira `unverified`; marcadora só com `mode`.
  - `update-property.use-case.ts`: zera marcadora e código nas transições.
  - `geocode-property.use-case.ts`: zera o código.
- [ ] **5. Correção do bug do MANUAL** · backend/web · 0,5 (+0,25 pela L-X02-02)
  - `update-property.use-case.ts:176-194`: compara com `property.lat/lng` a 7 casas e, se forem iguais, ignora; `null/null` fora de MANUAL e par incompleto são ignorados (dec. 16 e 17); invariante "nunca MANUAL sem coordenada".
  - `usePropertySave.ts:90-95`: recebe os valores iniciais e o `geocodingStatus` atual; só envia o par quando diferente; envia `null/null` só para MANUAL com os dois campos limpos (dec. 18).
  - `PropertyFormDrawer.tsx:95-96` e `applyAddressSuggestion` (:133): passa os valores iniciais e o status ao save; em modo edição, a sugestão só zera as coordenadas de um MANUAL (o `property` de `usePropertyDetail` já traz `geocodingStatus`).
- [ ] **6. Travar a coordenada digitada e a ausência de coordenada do autocomplete** · shared/web, só testes · 0,25
- [ ] **7. Filiais** · shared/backend/web · 0,5
  - `SH/src/schemas/address.ts`: remove lat/lng de `branchAddressSchema`, mantendo-o `z.object` puro, sem `.transform/.refine/.superRefine` no topo (dec. 24).
  - `create-branch.use-case.ts` e `update-branch.use-case.ts`: `IGeocodingService` opcional no fim do construtor; `formatGeocodingQuery(address)` para a string; `geocodeWithTimeout(service, query)` (padrão de 4000 ms e modo permanente); igualdade por `isSameGeocodingAddress` e regra de escrita da dec. 20 (cópia das lat/lng antigas no mesmo endereço; marcadora `NULL` explícita na falha com endereço novo).
  - `container.ts`: reordenar o wiring.
  - `useBranchSave.ts:67-68`: não enviar coordenadas.
  - Regenerar OpenAPI e `api-types`.
- [ ] **8. Teste de integração do job e da sincronização PostGIS** · backend · 0,25
- [ ] **9. Checklist de conta Mapbox e smoke por ambiente** · docs · 0,25
  - `docs/ops/pre-deploy-smoke-checklist.md`: o curl na forma de URL confirmada no spike (passo 0). Esperado: 200 com coordenada **e** o contador "Permanent Geocoding API" da conta subindo (prova positiva; o 200 sozinho não basta). Fazer em staging e prod com o token server-side em uso (dev já foi provado no spike).
  - Mesma página: preço vigente (US$ 5,00/1.000), limite de taxa da conta e a fórmula de custo do sweep diário (dec. 22).
  - `docs/fly-deploy-guide.md:74-84`: nota sobre o requisito de conta e o sintoma.
  - `apps/backend/CLAUDE.md` §10 (regra N4 da X00): apagar a cláusula de transição e conferir o texto final contra as dec. 1, 2, 6, 8 e 9 (dec. 25).

### Fora do escopo
- Trocar de provedor ou de API (exceção única: a contingência v6 do adaptador de geocodificação, dec. 13); mudar o autocomplete ou o teste de conexão; cache próprio.
- Job, retry ou status de geocodificação para filial; exibir coordenadas de filial; expor as colunas novas na API ou na UI; copy nova de UI.
- Legado, limpeza de `preview_json` e retomada em massa (TASK-X02-2).
- Termos de Directions/Matrix (F04).

### Dependências
- Nenhuma para começar.
- Bloqueia F01, F04 e F09. A F01 importa `formatGeocodingQuery` e `geocodeWithTimeout` desta tarefa e deriva `branchAddressSchema` com `.extend(...)` (dec. 24). A TASK-X02-2 roda depois desta estar em produção.
- Bloqueia também a **ativação** do geofence BLOCK da F03 (não o deploy da F03): BLOCK só liga com esta tarefa em produção e depois da auditoria de geocodificação dos imóveis ativos (dec. 26).

### Riscos e armadilhas
- **Wirings de teste não tipados** (memória `project_adding_usecase_dep_breaks_untyped_test_wirings`). Por isso o geocoder é opcional no fim do construtor e as props da entidade são opcionais. Fazer grep de `new CreateBranchUseCase(`, `new UpdateBranchUseCase(`, `geocode: vi.fn` e `new PropertyEntity(`.
- **Detecção do erro de conta:** sem o spike do passo 0, ela pode cair no ramo genérico e voltar a retentar todo dia, pagando uma requisição (possivelmente faturável mesmo sem acesso) por imóvel por dia.
- **Parâmetro ignorado em silêncio (L-X02-01):** se a v5 ignorar `permanent=true`, o sistema grava coordenadas temporárias carimbadas com a marcadora, e nada acusa. Só a prova pelo contador (passo 0 e passo 9) pega isso.
- **Lead time da habilitação (L-X02-01):** se depender de Sales, pode levar dias ou semanas e bloqueia F01, F04 e F09. Por isso o pedido sai no dia do spike.
- **Custo recorrente do sweep (L-X02-05):** cada FAILED sem código custa US$ 0,005 por dia (2.000 endereços não geocodificáveis ≈ US$ 300/mês). Medir no rollout (dec. 22).
- **`coordinates` (PostGIS):** qualquer escrita de lat/lng fora de `repo.save`/`repo.update` deixa a coluna desatualizada. Proibido escrever lat/lng com `prisma.property.update*` direto.
- **Ordem do wiring no `container.ts`:** pode injetar `undefined` sem aviso. O teste de rota cobre.
- **Comparação de coordenadas:** `Decimal` do Prisma contra `number`. Normalizar com `Number(x.toFixed(7))` dos dois lados.
- **Shared antes de consumir:** buildar o shared antes do typecheck do web (memórias `project_shared_build_before_consume` e `project_web_typecheck_incremental_cache_lies`).

### Deploy, rollout e rollback
1. Spike (passo 0) em dev antes de codar e smoke do passo 9 em staging, ambos com prova positiva pelo contador. Se a conta recusar, habilitar o modo permanente antes de seguir: o pedido à Mapbox (dev, staging e prod) é aberto no dia do spike, com responsável nomeado (dev do X02 até haver dono de conta Mapbox definido) e prazo registrado no checklist.
2. Merge em `develop` → DEV → staging. A migration roda (expand).
3. Smoke em staging:
   - criar um imóvel e conferir a marcadora e `coordinates`;
   - editar o imóvel sem mexer nas coordenadas e confirmar que continua SUCCESS;
   - salvar uma filial e conferir `addressJson.latitude`.
4. Fazer o smoke de prod com o token de prod. Promover para `main` e fazer o deploy no Fly (rolling com health check).
5. Monitorar por 24 h:
   - log com `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`, que deve ficar em zero;
   - gauge `geocoding.failedCount`;
   - FAILED sem código em prod (`countFailedGeocoding - countBlockedFailedGeocoding`) × US$ 0,005 = custo diário do sweep; registrar o número e decidir se o cool-off de 24 h continua ou vira semanal (dec. 22). A mudança do cool-off, se decidida, é outra tarefa;
   - contador "Permanent Geocoding API" da conta subindo em linha com os saves (confirma que a produção está no modo permanente).
6. Rollback:
   - reverter o PR; as colunas nullable ficam e não são dropadas;
   - se a conta recusar em prod, os imóveis ficam FAILED com código; corrigir a conta e rodar `--retry-failed-permanent` (TASK-X02-2) ou o endpoint manual.

### Dias · Branch · Verificação
- **3,5 dias** (+0,25 se a contingência v6 for acionada). Era 3,0; +0,25 do spike (L-X02-01) e +0,25 da regra de `null/null` no backend e no web (L-X02-02). As lacunas L-X02-04, L-X02-07 e L-X02-08 cabem nos passos 1, 4 e 7. Branch `fix/permanent-geocoding`, em worktree a partir de `develop`. Bem abaixo de 150 arquivos.
- Commits sugeridos:
  - `refactor(property): add geocoding mode to port`
  - `fix(property): request permanent geocoding from mapbox`
  - `feat(db): add permanent geocoding markers`
  - `fix(property): persist only permanent geocoding results`
  - `fix(property): stop retrying geocoding blocked by account`
  - `fix(property): set manual coordinates only when changed`
  - `fix(tenant): geocode branch address in permanent mode`
  - `test(property): cover permanent geocode job and postgis sync`
  - `docs(ops): add mapbox permanent geocoding smoke`
  - `docs(ops): record mapbox permanent geocoding spike` (passo 0, antes dos demais)
  - `fix(import): short-circuit geocode verification on account error`
- Verificação:
  - `pnpm --filter backend exec prisma generate && pnpm --filter backend exec prisma migrate dev`
  - `pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types && pnpm --filter @properfy/shared build`
  - `pnpm --filter @properfy/shared test && pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter backend test`
  - `pnpm --filter backend test:integration && pnpm --filter backend test:integration:db -- property-geocode-permanent` (via subagente)
  - `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test -- PropertyFormDrawer usePropertySave useBranchSave`
  - Remove the transition clause of rule N4 from `apps/backend/CLAUDE.md` in this PR (X00 L-04): `grep -n "until it merges" apps/backend/CLAUDE.md` sem ocorrência em N4, e `grep -n "geocoded_permanently_at\|MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE" apps/backend/CLAUDE.md` com ≥ 1 cada (dec. 25).

---

## TASK-X02-2 · Regeocodificação do legado (com falsos MANUAL), limpeza de `preview_json` e retomada em massa

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-X02-1
> - **Dependência parcial:** TASK-X02-1: precisa da X02-1 **em produção**, não só mergeada.
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F03-2, TASK-F01-1
> - **Pista sugerida (time de 6):** B · Backend de integração

### Objetivo
Os imóveis e filiais gravados antes da TASK-X02-1 guardam coordenadas do modo temporário, que a Mapbox proíbe guardar. Os imports já commitados também guardam essas coordenadas em `preview_json`, sem prazo.

Um script único, com throttle, idempotente (via `geocoded_permanently_at`) e com relatório:
- regeocodifica esse legado no modo permanente;
- detecta pelo audit os falsos MANUAL criados pelo bug corrigido na TASK-X02-1 (coordenada temporária da Mapbox regravada como "dado do usuário"), devolve-os ao status não-MANUAL e os regeocodifica;
- remove as coordenadas temporárias de `preview_json`;
- oferece uma flag para reenfileirar em massa os imóveis bloqueados por erro de conta, depois que a conta for corrigida.

### Contexto no código (verificado, já com a TASK-X02-1 aplicada)

**Colunas e serviços**
- Colunas: `properties.geocoded_permanently_at`, `properties.geocoding_failure_code` e `branches.geocoded_permanently_at`.
- Coordenadas de imóvel: `properties.lat/lng`, `Decimal(10,7)` (`schema.prisma:389-390`), mais a coluna PostGIS `coordinates` (:403). As duas são sincronizadas **só** por `prisma-property.repository.ts` (`syncCoordinates`, :558, chamado em `save` :288 e em `update` :362-368).
- Coordenadas de filial: `branches.address_json.latitude/longitude`.
- Geocodificação: `IGeocodingService.geocode(address, { mode: 'permanent' })`. Lança `MapboxPermanentGeocodingUnavailableError` (`code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`).
- `DynamicGeocodingService` (`BE/src/modules/integration/infrastructure/dynamic-providers.ts`):
  - tem `isConfigured(): Promise<boolean>`;
  - é construído com `IntegrationConfigResolver(repo, envFallback, logger)`, como em `container.ts:642-660`.

**Padrões a seguir**
- Script de referência: `BE/src/scripts/backfill-property-branch.ts`.
  - Função exportada que recebe `PrismaClient`, guarda `isDirectInvocation`, dry-run por padrão, `--apply` e `--tenant`.
  - Testes em `backfill-property-branch.test.ts` e em `BE/tests/integration/db/backfill-property-branch.integration.test.ts`.
  - Execução: `pnpm --filter backend tsx --env-file .env src/scripts/<script>.ts`. Em prod, via `fly ssh console`.
- Fila: `BE/src/shared/infrastructure/queue.ts` exporta `sendJob` (:136), que sobe o pg-boss sob demanda via `getQueue`, e `stopQueue` (:128).

**Imports**
- O sweep horário `appointment.import.sweep-abandoned` (`BE/src/main/workers.ts:240`) já apaga as linhas `PREVIEW` com mais de 24 h e seus arquivos. Previews não commitados não precisam de tratamento.
- Imports commitados (`status` diferente de `PREVIEW`: PENDING, PROCESSING, COMPLETED, FAILED) mantêm `preview_json` para sempre. Esse JSON tem `rows[].property.geocode = {status:'found', lat, lng}` (`SH/src/schemas/import.ts:52`, campo em :82, `nullable().default(null)`). O endpoint de status do import (`get-import-status.use-case.ts:59`) devolve o `previewJson`.
- O commit worker lê `preview_json` durante o `PROCESSING` (`appointment-import-commit.worker.ts:117`).

**Audit e falsos MANUAL**
- Tabela `audit_logs` (`schema.prisma:850`): `entity_type`, `entity_id` (texto), `action`, `before_json`, `after_json`, `metadata_json`, `created_at`, `redaction_status` (padrão `NONE`). Índices: `(entity_type, entity_id)` e `(action)`.
- `update-property.use-case.ts:198-206` audita `property.updated` com `before`/`after` contendo **apenas** `propertyCode`, `type`, `street`, `suburb`, `state`, `country` e `geocodingStatus`. **O audit não guarda lat/lng.** `postcode` e `addressLine2` também não aparecem.
- Origem do falso MANUAL (corrigida na TASK-X02-1): o form pré-preenchia lat/lng (`PropertyFormDrawer.tsx:95-96`), o save sempre os enviava (`usePropertySave.ts:90-95`) e o backend gravava MANUAL sem comparar (`update-property.use-case.ts:182-190`). Assim, qualquer edição de um imóvel com coordenada virava MANUAL com a mesma coordenada.

### Decisões aplicáveis (dev, 2026-10-27)
1. O legado é regeocodificado por um script único, com throttle respeitando o limite de taxa, idempotente e com relatório: atualizados, mudaram de posição e falharam. Roda em staging antes de prod.
2. A marcadora `geocoded_permanently_at` é o que garante a idempotência e permite re-executar.
3. **Seleção do legado:** `lat IS NOT NULL AND geocoding_status <> 'MANUAL' AND geocoded_permanently_at IS NULL`. Isso inclui PENDING e FAILED que ainda guardam lat/lng antigos.
4. **Previews:** o sweep horário já resolve os `PREVIEW`. O alvo é o `preview_json` dos imports commitados. O script remove dali as coordenadas temporárias.
5. **Legado sem resultado no modo permanente: mantém a coordenada temporária até alguém corrigir.** O dev **aceitou essa violação residual dos termos** em 2026-10-27. Essas linhas ficam FAILED com `geocoding_failure_code = 'LEGACY_PERMANENT_NO_RESULT'`, entram no relatório e **não** têm lat/lng apagados.
6. **Retomada em massa:** a flag `--retry-failed-permanent` reenfileira os imóveis com `geocoding_failure_code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`.
7. Toda escrita de lat/lng atualiza `coordinates` (PostGIS) de forma consistente.
8. MANUAL **legítimo** nunca é tocado. Filiais estão no escopo e têm marcadora.
9. **Detecção de stub:** usar `DynamicGeocodingService.isConfigured()`. Se devolver `false`, o script aborta antes de começar.
10. **Falsos MANUAL (+0,25 dia):** o script os detecta pelo audit trail. Para os confirmados, restaura o status não-MANUAL, inclui na seleção do legado e regeocodifica no modo permanente. Audit ambíguo ou ausente vai para o relatório, sem alteração.

### Decisões aplicáveis (lacunas aceitas, 2026-10-29)
11. **CAS por `updated_at` (L-X02-03, opção recomendada).** `applyPermanentBackfill`, `markLegacyNoResult`, `restoreFalseManual` e a escrita de filial incluem no `where` o `updated_at` lido na seleção. Cobre qualquer edição concorrente (endereço com lat igual, status, soft-delete). `properties.updated_at` e `branches.updated_at` existem e são `@updatedAt` (`schema.prisma:400` e :222).
12. **Filial escrita por merge jsonb, não por substituição (L-X02-03).** `UPDATE branches SET address_json = address_json || jsonb_build_object('latitude', $lat, 'longitude', $lng), geocoded_permanently_at = now(), updated_at = now() WHERE id = $id AND tenant_id = $t AND geocoded_permanently_at IS NULL AND updated_at = $lido`, via `$executeRaw`. O endereço nunca é reescrito pelo script.
13. **Estimativa de requisições no relatório (L-X02-05).** `RegeocodeReport.estimatedRequests = { falseManual, properties, branches, total }`, preenchido no dry-run e no apply. O runbook traz a fórmula `custo ≈ total × US$ 0,005` com o preço vigente anotado e o limiar de go/no-go: **acima de US$ 200 exige aval do dev** antes do `--apply` em prod.
14. **429 tratado explicitamente (L-X02-05).** Ao receber 429 (rate limit) da Mapbox, o script espera 60 s (`sleep(60000)`) e repete a mesma linha **uma** vez; se falhar de novo, soma em `errors` e segue. `--rate` padrão cai de 300 para **120** req/min (um quinto do limite v5 de 600); o runbook registra o limite real da conta.
15. **Ambíguos explicados e com saída (L-X02-06).** Mudança só de `postcode`/`addressLine2` na transição passa na prova 1, mas a coordenada regravada era do endereço anterior e normalmente vira `coordinates_differ`: é intencional e não justifica subir a tolerância. O relatório ganha `addressChangedAfterTransition: boolean` em cada `ambiguous` (existe `property.updated` posterior à transição com `street`, `suburb`, `state` ou `country` diferentes). O runbook traz a receita de correção manual.
16. **String de endereço do legado de imóveis (L-X02-08).** As fases de imóveis e de falsos MANUAL usam `formatGeocodingQuery({ street, addressLine2, suburb, state, postcode, country })`, travado como equivalente a `fullAddress` pelo teste 6 de `geocoding-address.test.ts` (TASK-X02-1).
17. **`--limit` e `--tenant` (L-X02-09).** `--limit` vale **por fase** (falsos MANUAL, imóveis, filiais) e conta entidades **selecionadas**, não chamadas à Mapbox. `--tenant` vale para **todas** as fases, inclusive `--strip-import-previews` (`appointment_imports.tenant_id`) e `--retry-failed-permanent`. O `regeocode.started` registra o `limit`.
18. **O relatório de prod é insumo da auditoria do geofence BLOCK da F03 (L-F03-08, reconciliação de 2026-10-29).** A F03 só liga o modo BLOCK do check-in depois da X02 em produção e de uma auditoria de geocodificação dos imóveis ativos. Esta tarefa não muda por isso (sem campo novo no relatório): o relatório de prod (`moved`, `noResult`, `falseManual.ambiguous`, `falseManual.missingAudit`) e a contagem de imóveis sem `geocoded_permanently_at` são entregues à OP junto com as listas do passo 5 do rollout, para a auditoria. Até essas listas serem tratadas, o BLOCK continua desligado.

**Como a decisão 10 foi implementada (adaptação necessária).** O audit `property.updated` não guarda lat/lng, então a regra literal ("before/after lat/lng iguais") não pode ser avaliada. A regra aplicada combina duas provas:
- **Prova 1 (audit):** a transição mais recente para MANUAL (`property.updated` com `after.geocodingStatus = 'MANUAL'` e `before.geocodingStatus <> 'MANUAL'`) existe, não está redigida e tem `street`, `suburb`, `state` e `country` iguais no `before` e no `after`. Ou seja, o endereço não mudou na edição que gerou o MANUAL, que é o padrão do bug.
- **Prova 2 (coordenada):** a coordenada MANUAL atual está a **no máximo 5 m** (haversine) do resultado da geocodificação permanente do endereço atual. Isso confirma que ela é um resultado da Mapbox, não um ponto digitado.

**Tolerância de 5 m:** lat/lng são `Decimal(10,7)` (cerca de 1 cm), e o falso MANUAL é a mesma coordenada devolvida pela Mapbox, regravada. Um novo geocode do mesmo endereço volta no mesmo ponto, salvo atualização da base da Mapbox. Correções manuais reais costumam mover o pin dezenas de metros (outro prédio ou entrada). A tolerância é configurável por `--false-manual-tolerance-m`.

A mesma chamada permanente serve como prova e como novo valor. "Restaurar, incluir no legado e regeocodificar" acontece numa única escrita, sem pagar duas vezes pela mesma requisição.

### Modelo de dados
Sem migration. As escritas usam métodos novos no repositório, para manter `coordinates` sincronizada e fazer CAS.

**Imóveis**
- Seleção: `deleted_at IS NULL AND lat IS NOT NULL AND geocoding_status <> 'MANUAL' AND geocoded_permanently_at IS NULL AND (geocoding_failure_code IS NULL OR geocoding_failure_code <> 'LEGACY_PERMANENT_NO_RESULT')`, opcionalmente `AND tenant_id = :tenant`, ordenada por `id` em lotes de 100.
- Por que excluir `LEGACY_PERMANENT_NO_RESULT`: sem isso, cada re-execução pagaria de novo pelas mesmas falhas.
- A seleção devolve também `updated_at` (CAS, dec. 11).
- Texto enviado: `formatGeocodingQuery({ street, addressLine2, suburb, state, postcode, country })` (dec. 16).
- Encontrado: `IPropertyRepository.applyPermanentBackfill(id, tenantId, expected: { lat, lng, updatedAt }, next: { lat, lng })` (novo).
  - Roda em `$transaction`: `updateMany` com `where: { id, tenant_id, lat: expected.lat, lng: expected.lng, updated_at: expected.updatedAt, geocoding_status: { not: 'MANUAL' }, geocoded_permanently_at: null }` (CAS) e `data: { lat: next.lat, lng: next.lng, geocoding_status: 'SUCCESS', geocoded_permanently_at: now, geocoding_failure_code: null }`.
  - Se `count > 0`, `syncCoordinates(id, lat, lng)` na mesma transação. Devolve `boolean`.
- Sem resultado: `IPropertyRepository.markLegacyNoResult(id, tenantId, expected: { lat, lng, updatedAt })` (novo).
  - CAS igual ao anterior, com `data: { geocoding_status: 'FAILED', geocoding_failure_code: 'LEGACY_PERMANENT_NO_RESULT' }`.
  - **Não altera lat, lng nem `coordinates`.**
- Por que `updated_at`: uma edição de endereço durante a rodada deixa o imóvel PENDING **com a lat/lng antigas** (`update-property.use-case.ts:191-194` não as zera). Sem `updated_at` no CAS, o script gravaria SUCCESS + marcadora com a coordenada do endereço antigo e o worker pularia o imóvel (L-X02-03).

**Filiais**
- Seleção: `deleted_at IS NULL AND geocoded_permanently_at IS NULL AND address_json ? 'latitude'`, via `$queryRaw`, devolvendo também `updated_at`. Isso inclui as filiais gravadas em (0,0).
- Texto enviado: `formatGeocodingQuery(address_json)`.
- Encontrado: merge jsonb da dec. 12 (`address_json || jsonb_build_object('latitude', …, 'longitude', …)`, `geocoded_permanently_at = now()`), com CAS em `geocoded_permanently_at IS NULL AND updated_at = <lido>`. Devolve `boolean` (linhas afetadas > 0); `false` soma em `branches.skippedConcurrent`.
- Sem resultado: não altera nada (mantém a coordenada; decisão 5) e entra no relatório.

**Falsos MANUAL**
- Consulta de candidatos (via `$queryRaw`, lotes de 100 por `m.id`):
```sql
WITH manual_props AS (
  SELECT id, tenant_id, property_code, lat, lng
  FROM properties
  WHERE geocoding_status = 'MANUAL' AND lat IS NOT NULL AND lng IS NOT NULL
    AND deleted_at IS NULL AND ($1::text IS NULL OR tenant_id = $1)
), transitions AS (
  SELECT DISTINCT ON (a.entity_id)
         a.entity_id, a.id AS audit_log_id, a.created_at, a.redaction_status,
         a.before_json, a.after_json
  FROM audit_logs a
  JOIN manual_props m ON a.entity_id = m.id
  WHERE a.entity_type = 'Property'
    AND a.action = 'property.updated'
    AND a.after_json->>'geocodingStatus' = 'MANUAL'
    AND COALESCE(a.before_json->>'geocodingStatus', '') <> 'MANUAL'
  ORDER BY a.entity_id, a.created_at DESC
)
SELECT m.id, m.tenant_id, m.property_code, m.lat, m.lng,
       t.audit_log_id, t.created_at AS transitioned_at, t.redaction_status,
       t.before_json, t.after_json
FROM manual_props m
LEFT JOIN transitions t ON t.entity_id = m.id
ORDER BY m.id;
```
- Usa o índice `(entity_type, entity_id)`.
- Classificação de cada linha, nesta ordem:
  1. Sem `audit_log_id` → `missingAudit` (sem alteração).
  2. `redaction_status <> 'NONE'` → `ambiguous`, `reason: 'audit_redacted'`.
  3. `street`, `suburb`, `state` ou `country` diferentes entre `before_json` e `after_json` (comparação com `trim` e sem diferenciar maiúsculas) → `ambiguous`, `reason: 'address_changed_in_transition'`.
  4. Senão, é **candidato**. Geocodifica `formatGeocodingQuery` do endereço atual no modo permanente (só com `--apply`):
     - resultado a até `toleranceM` → **restaurado**;
     - resultado mais distante → `ambiguous`, `reason: 'coordinates_differ'`, com `distanceM`;
     - `null` → `ambiguous`, `reason: 'no_result'` (sem prova 2, o MANUAL fica);
     - erro genérico → `ambiguous`, `reason: 'geocode_error'`;
     - erro de conta → aborta.
- A consulta acrescenta `m.updated_at` em `manual_props` e no `SELECT` final (CAS, dec. 11).
- `addressChangedAfterTransition` (dec. 15): para cada `ambiguous`, uma consulta por lote em `audit_logs` (`entity_type = 'Property' AND action = 'property.updated' AND entity_id = ANY($ids) AND created_at > transitioned_at`) verifica se algum `before_json`/`after_json` posterior tem `street`, `suburb`, `state` ou `country` diferentes (mesma comparação com `trim` e sem caixa). Não chama a Mapbox.
- Escrita do restaurado: `IPropertyRepository.restoreFalseManual(id, tenantId, expected: { lat, lng, updatedAt }, next: { lat, lng })` (novo).
  - Roda em `$transaction`: `updateMany` com `where: { id, tenant_id, geocoding_status: 'MANUAL', lat: expected.lat, lng: expected.lng, updated_at: expected.updatedAt }` (CAS) e `data: { lat: next.lat, lng: next.lng, geocoding_status: 'SUCCESS', geocoded_permanently_at: now, geocoding_failure_code: null }`.
  - Se `count > 0`, `syncCoordinates`. Devolve `boolean`.
- Idempotência: os restaurados viram SUCCESS com marcadora e não voltam. Os ambíguos continuam MANUAL e são reavaliados a cada rodada; com `--apply`, isso custa uma requisição por ambíguo candidato. São poucos e o custo é aceito. Use `--entities` sem `false-manual` para pular.

**Imports**
- Seleção: `status <> 'PREVIEW' AND status <> 'PROCESSING' AND preview_json IS NOT NULL`, mais `AND tenant_id = :tenant` com `--tenant` (dec. 17). Ficam de fora o `PREVIEW` (o sweep resolve) e o `PROCESSING` (commit em andamento).
- Limpeza: em cada `rows[i].property.geocode` com `status === 'found'` e **sem** `mode`, trocar por `null`. Gravar só se algo mudou.
- O resto do JSON (summary, issues, `found` com `mode:'permanent'`) fica intacto, para não quebrar a tela de status do import.

**Retomada (`--retry-failed-permanent`)**
- Seleção: `deleted_at IS NULL AND geocoding_status = 'FAILED' AND geocoding_failure_code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`, mais `AND tenant_id = :tenant` com `--tenant` (dec. 17).
- Para cada linha:
  - `repo.update(id, tenantId, { geocodingStatus: 'PENDING', geocodingFailureCode: null })`;
  - `sendJob('property.geocode', { propertyId }, { retryLimit: 6, retryBackoff: true })`.
- O enfileiramento direto é necessário porque o sweep de PENDING só pega `lat IS NULL`.
- `stopQueue()` no `finally`.

### Contratos (CLI)
Comando: `pnpm --filter backend tsx --env-file .env src/scripts/regeocode-permanent.ts [opções]`

| Opção | Padrão | Efeito |
|---|---|---|
| (nenhuma) | dry-run | Não grava, não chama a Mapbox e não enfileira. Conta os candidatos de cada fase e preenche `estimatedRequests` (dec. 13). |
| `--apply` | off | Executa as fases selecionadas. |
| `--entities=properties,branches,false-manual` | os três | Restringe as fases de regeocodificação. `false-manual` é a detecção pelo audit. |
| `--false-manual-tolerance-m=<n>` | 5 | Distância máxima entre a coordenada MANUAL e o geocode permanente para confirmar um falso MANUAL. |
| `--strip-import-previews` | off | Executa a limpeza de `preview_json`. Não chama a Mapbox. |
| `--retry-failed-permanent` | off | Executa **só** a retomada em massa (não regeocodifica nada). Incompatível com `--entities` e `--strip-import-previews`. |
| `--tenant=<uuid>` | todos | Restringe **todas** as fases a um tenant, inclusive `--strip-import-previews` e `--retry-failed-permanent` (dec. 17). |
| `--limit=<n>` | sem limite | Máximo de entidades **selecionadas por fase** (falsos MANUAL, imóveis, filiais), não de chamadas à Mapbox (dec. 17). `--limit=20` = até 20 de cada fase. |
| `--rate=<req/min>` | 120 | Throttle de `60000/rate` ms entre chamadas à Mapbox (dec. 14; era 300). |
| `--move-threshold-m=<n>` | 25 | Distância (haversine) acima da qual uma linha conta como `moved`. |

- Códigos de saída:
  - `0`: sucesso, com o relatório em JSON no stdout;
  - `1`: erro de conta (aborta), Mapbox não configurada ou erro inesperado;
  - `2`: argumento inválido ou combinação incompatível. Mensagens: `Invalid argument: <arg>` e `--retry-failed-permanent cannot be combined with <flag>`.
- Função exportada: `regeocodePermanent(deps: { prisma, propertyRepo, geocoder, isGeocoderConfigured, enqueue, logger, auditService, sleep? }, options): Promise<RegeocodeReport>`.

```ts
interface RegeocodeReport {
  dryRun: boolean;
  estimatedRequests: { falseManual: number; properties: number; branches: number; total: number }; // dec. 13; falseManual = só candidatos da prova 1
  importPreviews: { scanned: number; stripped: number };
  falseManual: {
    manualWithCoordinates: number;         // MANUAL com lat/lng no escopo
    auditCandidates: number;               // passaram na prova 1
    restored: number;                      // passaram nas provas 1 e 2, voltaram a SUCCESS com marcadora
    moved: number;                         // restaurados com deslocamento > --move-threshold-m (sempre 0 com tolerância 5 m e limiar 25 m)
    skippedConcurrent: number;
    ambiguous: Array<{ id: string; propertyCode: string; tenantId: string; auditLogId: string;
      reason: 'audit_redacted' | 'address_changed_in_transition' | 'coordinates_differ' | 'no_result' | 'geocode_error';
      distanceM: number | null; transitionedAt: string;
      addressChangedAfterTransition: boolean }>;           // dec. 15: priorizar na correção manual
    missingAudit: Array<{ id: string; propertyCode: string; tenantId: string }>;
  };
  properties: { scanned: number; updated: number; moved: number; skippedConcurrent: number;
    noResult: Array<{ id: string; propertyCode: string; tenantId: string }>;   // FAILED + LEGACY_PERMANENT_NO_RESULT, coordenada mantida
    errors: Array<{ id: string; propertyCode: string; message: string }> };
  branches: { scanned: number; updated: number; moved: number; skippedConcurrent: number;
    noResult: Array<{ id: string; name: string; tenantId: string }>;
    errors: Array<{ id: string; name: string; message: string }> };
  retriedFailedPermanent: number;
  aborted: null | { code: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE' | 'MAPBOX_NOT_CONFIGURED'; atEntityId: string | null };
}
```

### Estados e comportamentos
- **Ordem das fases:** limpeza de previews (se pedida) → falsos MANUAL → imóveis (legado) → filiais. A retomada roda sozinha.
- **Dry-run dos falsos MANUAL:** roda a consulta e as classificações 1 a 3 (só audit), sem chamar a Mapbox. Informa `manualWithCoordinates`, `auditCandidates`, `missingAudit` e os ambíguos de audit. `restored` fica 0.
- **Sucesso:** grava, soma em `updated` e também em `moved` quando a distância passa do limiar.
- **Sem resultado:**
  - imóvel: FAILED com `LEGACY_PERMANENT_NO_RESULT`, mantendo lat/lng e `coordinates`; entra em `noResult`;
  - filial: nada é gravado; entra em `noResult`.
- **Erro genérico ou timeout de uma chamada:** não grava, soma em `errors` e segue. A linha volta a ser selecionada na próxima rodada.
- **429 da Mapbox (dec. 14):** `sleep(60000)` e uma única nova tentativa da mesma linha; se falhar de novo, soma em `errors` e segue.
- **`--limit` (dec. 17):** aplicado à seleção de cada fase separadamente.
- **Erro de conta:** aborta na hora (`aborted`, exit 1). As linhas já gravadas ficam.
- **CAS perdido** (a linha mudou entre a seleção e a escrita): soma em `skippedConcurrent` e não grava.
- **Interrupção:** basta re-executar. As linhas gravadas têm marcadora ou código e não voltam.
- **Sem candidatos:** relatório com zeros e exit 0.
- **UI:** não há mudança. A tela de status de um import commitado mostra as linhas que tinham `found` antigo sem verificação (`geocode: null`), o mesmo estado de "não verificado" que já existe.

### Copy de logs e auditoria (inglês)
- `regeocode.started` `{ dryRun, phases, entities, tenantId, rate, limit }`
- `regeocode.estimated_requests` `{ falseManual, properties, branches, total }`
- `regeocode.rate_limited_retry` (warn) `{ entity, id }`, uma por 429 e `regeocode.database` `{ host }` (host mascarado).
- `regeocode.import_previews_stripped` `{ scanned, stripped }`.
- `regeocode.false_manual_classified` `{ manualWithCoordinates, auditCandidates, missingAudit, ambiguousByReason }`.
- Por linha (debug): `regeocode.false_manual_processed` `{ id, auditLogId, outcome: 'restored' | 'ambiguous' | 'missing_audit' | 'skipped_concurrent', reason, distanceM }`.
- Por linha (debug): `regeocode.entity_processed` `{ entity, id, outcome: 'updated' | 'moved' | 'no_result' | 'error' | 'skipped_concurrent', distanceM }`.
- `regeocode.aborted_account_unavailable` (error) `{ code, atEntityId }`.
- `regeocode.aborted_not_configured` (error), com a mensagem `Mapbox is not configured; refusing to run`.
- `regeocode.retry_failed_permanent_enqueued` `{ count }`.
- `regeocode.finished`, com as contagens.
- Audit (só com `--apply`, `actorType: 'SYSTEM'`):
  - `property.geocode_permanent_backfilled`: `before: { lat, lng, geocodingStatus }`, `after: { lat, lng, geocodingStatus: 'SUCCESS' }`;
  - `property.false_manual_restored`: `before: { lat, lng, geocodingStatus: 'MANUAL' }`, `after: { lat, lng, geocodingStatus: 'SUCCESS' }`, `metadata: { auditLogId, distanceM, toleranceM }`;
  - `property.geocode_permanent_no_result`: `metadata: { code: 'LEGACY_PERMANENT_NO_RESULT', keptLegacyCoordinates: true }`;
  - `branch.geocode_permanent_backfilled`: `before`/`after` com `{ latitude, longitude }`;
  - `property.geocode_retry_requeued`: `metadata: { previousCode: 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE' }`.
- Métricas: nenhuma nova. O gauge `geocoding.failedCount` sobe com os `noResult` (esperado; registrar no relatório de deploy).

### Edge cases
1. Re-execução depois de um `--apply` completo: `scanned` de imóveis igual a 0 (os `noResult` ficam excluídos pelo código).
2. Imóvel MANUAL: nunca entra na seleção do legado. Só passa pela fase `false-manual`, e só é alterado com as provas 1 e 2.
3. Imóvel PENDING ou FAILED com lat antiga: selecionado. Se der certo, vira SUCCESS.
4. Imóvel SUCCESS criado depois da TASK-X02-1: tem marcadora e não é selecionado.
5. Imóvel soft-deleted: não é selecionado.
6. Imóvel editado durante a rodada (lat, status, endereço ou qualquer campo, via `updated_at`): o CAS falha e soma em `skippedConcurrent`. Inclui o caso "endereço mudou com lat igual" (PENDING com lat antiga): o script não grava e o worker regeocodifica o endereço novo (L-X02-03).
7. Filial em (0,0): selecionada. Sem resultado, mantém (0,0) e entra no relatório para correção manual.
8. Filial sem `address_json` ou sem `latitude`: não é selecionada.
9. Filial sem resultado em re-execuções: volta a ser selecionada a cada rodada. São poucas linhas e o custo é aceitável. O relatório as lista.
10. Deslocamento abaixo do limiar: conta em `updated`, sem `moved`.
11. Import em `PROCESSING`: ignorado. Import com `found` + `mode`: intacto. Import sem nenhum `found` antigo: não é regravado.
12. `isConfigured()` devolve `false`: aborta antes de selecionar, com `MAPBOX_NOT_CONFIGURED`. O stub geraria `noResult` em massa.
13. `--retry-failed-permanent` com a conta ainda sem o recurso: os jobs voltam a FAILED com o código, sem perda (o operador vê pelo log do worker).
14. `--rate=0`, `--limit=-1` ou combinação incompatível: exit 2.
15. MANUAL com várias edições: vale a transição **mais recente** de não-MANUAL para MANUAL. Edições MANUAL→MANUAL posteriores não entram na prova 1. Se o usuário moveu o pin depois, a prova 2 falha (`coordinates_differ`). Se uma edição MANUAL→MANUAL posterior **mudou o endereço** (hoje lat/lng presentes vencem `addressChanged`), o imóvel fica com coordenada do endereço antigo: a prova 2 falha, ele fica em `ambiguous` com `addressChangedAfterTransition: true` e vai para correção manual (dec. 15).
16. MANUAL criado pelo bug numa edição que também mudou o endereço: `address_changed_in_transition` vai para o relatório, sem alteração.
17. MANUAL legítimo a menos de 5 m do geocode (o usuário digitou praticamente o mesmo ponto da Mapbox): é restaurado para SUCCESS com a coordenada permanente. A diferença é de no máximo 5 m e não há perda prática. Risco aceito pela tolerância.
18. MANUAL cujo audit foi apagado pela retenção ou nunca existiu (imóveis antigos, dados migrados): `missingAudit`, sem alteração.
19. Audit redigido (`redaction_status <> 'NONE'`): `audit_redacted`, sem alteração.
20. Mudança só de `postcode` ou `addressLine2` na transição: o audit não registra esses campos, então a prova 1 passa. A prova 2 então compara com o endereço **atual** e, como a coordenada regravada era do endereço anterior, o caso normalmente vira `coordinates_differ` e fica no relatório, sem alteração. **Isso é intencional**: não é sinal de tolerância errada e não justifica subir `--false-manual-tolerance-m` (que restauraria MANUAL legítimo).
21. Falso MANUAL editado durante a rodada: o CAS de `restoreFalseManual` falha e soma em `falseManual.skippedConcurrent`.
22. `--false-manual-tolerance-m=0` ou negativo: exit 2.
23. Filial com endereço trocado pelo usuário durante a rodada e geocodificação síncrona falhando (marcadora continua `NULL`): o CAS por `updated_at` falha, soma em `branches.skippedConcurrent` e o endereço novo não é sobrescrito (merge jsonb nunca reescreve o endereço, dec. 12).
24. 429 seguido de sucesso na nova tentativa: a linha é gravada normalmente; um `regeocode.rate_limited_retry` no log.
25. `--limit=20` em staging: até 20 falsos MANUAL, 20 imóveis e 20 filiais selecionados; ambíguos de audit contam no limite mesmo sem chamar a Mapbox.
26. `--tenant=X --strip-import-previews`: só os imports do tenant X são limpos.
27. Dry-run com `estimatedRequests.total × 0,005` acima de US$ 200: o script não bloqueia; o runbook exige aval do dev antes do `--apply` em prod.

### Critérios de aceite
- **CA1 (plano X02):** o script regeocodifica imóveis e filiais existentes de forma idempotente e com relatório (atualizados, mudaram de posição, falharam).
- **CA2 (dec. 7):** toda escrita de lat/lng pelo script deixa `coordinates` igual a `ST_SetSRID(ST_MakePoint(lng,lat),4326)`.
- **CA3 (dec. 5):** linhas sem resultado ficam FAILED com `LEGACY_PERMANENT_NO_RESULT`, com lat/lng e `coordinates` preservados, e aparecem em `noResult`.
- **CA4 (dec. 4):** depois de `--strip-import-previews --apply`, nenhum import não-`PREVIEW` e não-`PROCESSING` guarda `found` sem `mode`.
- **CA5 (dec. 6):** `--retry-failed-permanent --apply` põe em PENDING, zera o código e enfileira `property.geocode` para cada imóvel bloqueado.
- **CA6:** o dry-run não grava, não chama a Mapbox e não enfileira.
- **CA7:** um erro de conta aborta sem gravar.
- **CA8:** um MANUAL só é alterado quando passa nas provas 1 e 2. Os demais (ambíguos ou sem audit) ficam intactos e aparecem no relatório.
- **CA11 (dec. 10):** um falso MANUAL confirmado volta a SUCCESS com coordenada permanente, marcadora preenchida, `coordinates` sincronizada e audit `property.false_manual_restored` com `auditLogId` e `distanceM`.
- **CA9:** o throttle respeita `--rate`.
- **CA10:** rodado em staging, com o relatório anexado, antes de qualquer `--apply` em prod.
- **CA12 (L-X02-03):** nenhuma escrita do script sobrescreve uma linha editada depois da seleção (CAS por `updated_at`); a filial nunca tem o endereço reescrito pelo script.
- **CA13 (L-X02-05):** o relatório traz `estimatedRequests`; o runbook traz a fórmula de custo, o preço vigente e o limiar de US$ 200; um 429 é retentado uma vez após 60 s.
- **CA14 (L-X02-06):** cada `ambiguous` traz `addressChangedAfterTransition`; o runbook traz a receita de correção manual para `ambiguous`, `missingAudit` e `noResult`.
- **CA15 (L-X02-09):** `--limit` é por fase e conta selecionados; `--tenant` vale para todas as fases.

### Testes primeiro (TDD)

**Unit** — `BE/src/scripts/regeocode-permanent.test.ts` (novo; repositório, geocoder, `enqueue` e `sleep` falsos)
1. Parse de `[]`: `{apply:false, entities:['properties','branches','false-manual'], stripImportPreviews:false, retryFailedPermanent:false, rate:120, moveThresholdM:25, falseManualToleranceM:5}`.
2. `['--rate=0']`: erro `Invalid argument: --rate=0`.
3. `['--retry-failed-permanent','--strip-import-previews']`: erro de combinação.
4. Dry-run com 3 imóveis e 2 filiais: `scanned` 3 e 2; o geocoder não é chamado; nenhuma escrita; `estimatedRequests` = `{falseManual:0, properties:3, branches:2, total:5}`.
5. `--apply`, imóvel `(-33.80,151.20)` com `updatedAt: T`, geocoder devolve `(-33.8001,151.2001)`: `applyPermanentBackfill(id, tenantId, {lat:-33.8, lng:151.2, updatedAt:T}, {lat:-33.8001, lng:151.2001})`, `updated:1`, `moved:0`; o geocoder recebe `formatGeocodingQuery({street, addressLine2, suburb, state, postcode, country})` da linha e `{mode:'permanent'}`.
6. Geocoder devolve um ponto 100 m adiante: `moved:1`.
7. `null`: `markLegacyNoResult` é chamado, `applyPermanentBackfill` não é chamado, a linha aparece em `noResult` e a coordenada fica intacta.
8. Erro genérico: nenhuma escrita, a linha entra em `errors` e o processamento segue.
9. Erro de conta no 2º registro: o 1º é gravado; o 2º e o 3º não; `aborted.atEntityId` aponta para o 2º.
10. `applyPermanentBackfill` devolve `false`: `skippedConcurrent:1`.
11. Filial encontrada: o método de escrita da filial recebe `(id, tenantId, {updatedAt:T}, {latitude, longitude})` (merge jsonb, sem o resto do endereço); `updated:1`.
12. Filial sem resultado: nenhuma escrita, entra em `noResult`.
13. `rate:120`: `sleep(500)` entre as chamadas.
33. Geocoder rejeita com erro de status 429 na 1ª chamada e resolve na 2ª: `sleep(60000)` chamado uma vez, a mesma linha é gravada, `errors` vazio, um `regeocode.rate_limited_retry`.
34. 429 duas vezes seguidas: a linha entra em `errors` e o processamento segue para a próxima.
35. `--limit=1` com 2 imóveis e 2 filiais: `properties.scanned:1` e `branches.scanned:1`.
36. `--tenant=X --strip-import-previews --apply`: a seleção de imports recebe `tenantId: X`; `--tenant=X --retry-failed-permanent --apply`: a seleção de bloqueados recebe `tenantId: X`.
37. Escrita da filial devolve `false` (CAS): `branches.skippedConcurrent:1`, sem audit.
14. `isGeocoderConfigured()` devolve `false`: `aborted.code = 'MAPBOX_NOT_CONFIGURED'` e nenhuma seleção.
15. Limpeza de previews: um `preview_json` com 2 `found` sem `mode`, 1 com `mode` e 1 `not_found` vira 2 `null`, mantendo o com `mode` e o `not_found`. `stripped:1`.
16. `--retry-failed-permanent --apply` com 2 bloqueados: 2 chamadas a `update({geocodingStatus:'PENDING', geocodingFailureCode:null})`, 2 `enqueue('property.geocode', {propertyId}, {retryLimit:6, retryBackoff:true})`, `retriedFailedPermanent:2`.
17. Audits com `before`/`after` corretos. Nenhum audit no dry-run.
18. O entrypoint fica inerte quando o módulo é importado.

**Unit (falsos MANUAL)** — mesmo arquivo, `describe('false manual detection')`. Cada caso usa uma linha da consulta como entrada.
19. Sem `audit_log_id`: vai para `missingAudit`; geocoder não é chamado.
20. `redaction_status:'REDACTED'`: `ambiguous` com `reason:'audit_redacted'`.
21. `before_json.street:'1 Old St'` e `after_json.street:'2 New St'`: `ambiguous` com `reason:'address_changed_in_transition'`; geocoder não é chamado.
22. `before`/`after` com `street:' 1 Main St '` e `'1 MAIN ST'`: considerados iguais; é candidato.
23. `--apply`, candidato em `(-33.8000000,151.2000000)`, geocoder devolve `(-33.8000200,151.2000100)` (cerca de 2,4 m): `restoreFalseManual(id, tenantId, {lat:-33.8, lng:151.2}, {lat:-33.80002, lng:151.20001})`, `restored:1`, audit com `distanceM ≈ 2.4` e `toleranceM:5`.
24. Geocoder devolve um ponto a cerca de 11 m: `ambiguous`, `reason:'coordinates_differ'`, `distanceM ≈ 11`, nenhuma escrita.
25. Com `--false-manual-tolerance-m=15` e o mesmo ponto a 11 m: restaurado.
26. Geocoder devolve `null`: `ambiguous` com `reason:'no_result'`; nenhuma escrita (o MANUAL **não** vira FAILED).
27. Erro genérico: `ambiguous` com `reason:'geocode_error'`.
28. Erro de conta: aborta com `aborted.code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`.
29. `restoreFalseManual` devolve `false`: `falseManual.skippedConcurrent:1`.
30. Dry-run com 1 sem audit, 1 com endereço alterado e 2 candidatos: `auditCandidates:2`, `missingAudit` com 1, `ambiguous` com 1, `restored:0`; geocoder não é chamado.
31. `--entities=properties,branches`: a consulta de falsos MANUAL não roda.
32. O geocoder recebe `formatGeocodingQuery` do endereço atual da linha e `{mode:'permanent'}`.
38. `ambiguous` com um `property.updated` posterior à transição em que `after.street` difere de `before.street`: `addressChangedAfterTransition: true`; sem audit posterior com mudança de endereço: `false`.
39. `restoreFalseManual` recebe `expected.updatedAt` igual ao `updated_at` da linha da consulta.
40. Dry-run com 2 candidatos da prova 1: `estimatedRequests.falseManual: 2`.

**Integração** — `BE/tests/integration/db/regeocode-permanent.integration.test.ts` (novo; Postgres real com PostGIS, geocoder falso)
1. Seed:
   - imóveis: SUCCESS sem marcadora; SUCCESS com marcadora; PENDING com lat; FAILED com lat; MANUAL; soft-deleted; sem lat;
   - filiais: uma com lat e uma sem `address_json`.

   Com `--apply`: só o SUCCESS sem marcadora, o PENDING com lat, o FAILED com lat e a filial com lat mudam. Em todos os imóveis alterados, `ST_X(coordinates) = lng` e `ST_Y(coordinates) = lat`.
2. Geocoder devolve `null` para um imóvel: FAILED com `LEGACY_PERMANENT_NO_RESULT`; `lat/lng` e `coordinates` iguais aos de antes.
3. Segunda rodada: `scanned:0`.
4. CAS: a lat de um imóvel muda entre a seleção e a escrita; ele não é sobrescrito e `coordinates` continua coerente com a lat nova.
   - 4b. **Endereço mudou, lat igual:** entre a seleção e a escrita, o imóvel recebe um update de endereço (PENDING, lat antiga mantida, `updated_at` novo); o script soma em `skippedConcurrent`, o imóvel continua PENDING com marcadora `NULL`.
   - 4c. **Filial:** entre a seleção e a escrita, o `address_json` da filial é trocado (endereço novo, sem lat/lng, marcadora `NULL`); o script soma em `branches.skippedConcurrent` e o `address_json` fica byte a byte igual ao do usuário.
   - 4d. **Filial, merge:** sem concorrência, a filial gravada mantém todas as chaves originais do `address_json` e só `latitude/longitude` mudam.
5. Imports: os `preview_json` COMPLETED e FAILED são limpos; `PROCESSING` e `PREVIEW` ficam intactos.
6. `--retry-failed-permanent`: as linhas viram PENDING com código nulo e os jobs aparecem no schema do pg-boss de teste.
7. Linhas de audit em `audit_logs`.
8. **Falsos MANUAL**, seed:
   - (a) MANUAL com audit `property.updated` de `SUCCESS` para `MANUAL`, mesmo endereço, coordenada igual à do geocoder falso;
   - (b) igual a (a), mas com coordenada a 50 m;
   - (c) MANUAL sem audit;
   - (d) MANUAL com audit cujo `street` mudou;
   - (e) MANUAL com duas transições, a mais recente com endereço alterado.

   Com `--apply`: só (a) vira SUCCESS com marcadora, `coordinates` coerente (`ST_X`/`ST_Y`) e audit `property.false_manual_restored`. (b) aparece em `ambiguous` com `coordinates_differ`, (c) em `missingAudit`, (d) e (e) em `ambiguous` com `address_changed_in_transition`. As linhas de (b) a (e) ficam byte a byte iguais.
9. Segunda rodada: (a) não é mais candidato; `restored:0`.

**E2E:** não se aplica.

### Escopo / Passos
- [ ] **1. Repositório e script de regeocodificação** · backend/script · 0,25
  - `BE/src/modules/property/domain/property.repository.ts` e `BE/src/modules/property/infrastructure/prisma-property.repository.ts`: `applyPermanentBackfill`, `markLegacyNoResult` e `findLegacyCoordinateCandidates(cursor, limit, tenantId?)`, com CAS e `syncCoordinates` em `$transaction`.
  - `BE/src/scripts/regeocode-permanent.ts` (novo): parse, `isDirectInvocation`, seleção em lotes, throttle, haversine, imóveis e filiais com `formatGeocodingQuery` da TASK-X02-1 (dec. 16), audit, relatório, abort e wiring real (`IntegrationConfigResolver` + `PrismaIntegrationSettingRepository` + fallback `MAPBOX_ACCESS_TOKEN` → `DynamicGeocodingService`).
- [ ] **2. Limpeza de `preview_json`, retomada em massa, teste de DB e runbook** · script/docs · 0,25
  - Fases `--strip-import-previews` e `--retry-failed-permanent` (`sendJob`/`stopQueue`).
  - `BE/tests/integration/db/regeocode-permanent.integration.test.ts` (novo).
  - `docs/runbooks/regeocode-permanent.md` (novo, roteiro operacional de staging e prod).
- [ ] **3. Detecção dos falsos MANUAL pelo audit** · backend/script · 0,25
  - `property.repository.ts` e `prisma-property.repository.ts`: `findManualWithTransitionAudit(cursor, limit, tenantId?)` (consulta acima, via `$queryRaw`) e `restoreFalseManual` (CAS e `syncCoordinates` em `$transaction`).
  - `regeocode-permanent.ts`: fase `false-manual`, com classificação, tolerância, audit `property.false_manual_restored` e os campos `falseManual` do relatório.
  - Casos 19 a 32 dos testes unitários e caso 8 da integração.
- [ ] **4. CAS por `updated_at`, merge jsonb na filial e 429** · backend/script · 0,25 (L-X02-03, L-X02-05)
  - `property.repository.ts` e `prisma-property.repository.ts`: `expected.updatedAt` no CAS de `applyPermanentBackfill`, `markLegacyNoResult` e `restoreFalseManual`; seleções devolvem `updated_at`.
  - Escrita de filial por `$executeRaw` com `address_json || jsonb_build_object(…)` e CAS em `geocoded_permanently_at IS NULL AND updated_at = $lido` (dec. 12); `branches.skippedConcurrent`.
  - `regeocode-permanent.ts`: 429 → `sleep(60000)` + uma nova tentativa; `--rate` padrão 120.
  - Casos 5, 11, 33, 34, 37 e 39 dos unitários; casos 4b, 4c e 4d da integração.
- [ ] **5. Relatório, `--limit`/`--tenant` e runbook** · script/docs · 0,25 (L-X02-05, L-X02-06, L-X02-08, L-X02-09)
  - `estimatedRequests` no dry-run e no apply; log `regeocode.estimated_requests`.
  - `addressChangedAfterTransition` nos `ambiguous` (consulta por lote em `audit_logs`, sem Mapbox).
  - `--limit` por fase contando selecionados; `--tenant` em todas as fases; `limit` no `regeocode.started`.
  - `docs/runbooks/regeocode-permanent.md`: fórmula `custo ≈ estimatedRequests.total × US$ 0,005` com o preço vigente anotado; limiar de **US$ 200** para exigir aval do dev; limite de taxa real da conta; explicação do edge 20 (`coordinates_differ` por `postcode`/`addressLine2` é esperado, não subir a tolerância); receita de correção manual: imóvel em `ambiguous`/`missingAudit`/`noResult` → "no web, editar o imóvel, limpar Latitude e Longitude e salvar (unlock → PENDING → worker permanente)", priorizando `addressChangedAfterTransition: true`; filial → "reabrir e salvar o endereço".
  - Casos 4, 35, 36, 38 e 40 dos unitários.

### Fora do escopo
- Mudar o sweep, o fluxo de import, a tela de import ou o comportamento da TASK-X02-1.
- Regeocodificar MANUAL legítimo, ou MANUAL ambíguo ou sem audit. Começar a gravar lat/lng no audit `property.updated` (depois da TASK-X02-1 o falso MANUAL não acontece mais). Agendar o script como job recorrente.
- Corrigir à mão as linhas `noResult`, `ambiguous` e `missingAudit` (fica com a operação, a partir do relatório e da receita do runbook).
- Mudar o cool-off de 24 h do sweep (a decisão sai do número medido no rollout da TASK-X02-1).

### Dependências
- TASK-X02-1 mergeada **e** em produção: colunas, porta com modo, erro de conta e `isConfigured()`.
- Conta Mapbox com o modo permanente confirmado por prova positiva (contador "Permanent Geocoding API") no spike e no smoke de prod da TASK-X02-1.
- `formatGeocodingQuery` e o teste de equivalência com `fullAddress` (TASK-X02-1, dec. 23).

### Riscos e armadilhas
- **Custo:** uma requisição permanente por linha legada, a US$ 0,005 cada (sem faixa gratuita). Rodar um dry-run em prod e usar `estimatedRequests.total × US$ 0,005` antes do `--apply`; acima de US$ 200, aval do dev. Usar `--limit` e `--tenant` se precisar.
- **Limite de taxa compartilhado com a produção:** 600 req/min por padrão na v5 (previews de import concorrem). `--rate` padrão 120, 429 com espera de 60 s e uma nova tentativa, e rodar fora do horário comercial de Sydney.
- **Edição concorrente:** a rodada de prod pode levar dezenas de minutos; o CAS por `updated_at` evita gravar coordenada de endereço antigo (dano silencioso e permanente pela marcadora).
- **Pins se movem:** revisar o `moved` em staging. Nunca rodar em prod sem a rodada de staging.
- **Violação residual aceita:** as linhas `noResult` continuam com coordenada temporária até alguém corrigir. Entregar a lista à operação.
- **PostGIS:** escrever lat/lng fora dos métodos do repositório deixa `coordinates` desatualizada. Proibido usar `prisma.property.update*` direto no script.
- **Banco errado:** conferir o host mascarado no log antes de confirmar.
- **Prazo:** 1,25 dia cobre o script, as quatro fases, o CAS por `updated_at`, o 429, o relatório ampliado e os testes de DB. Se estourar, separar a retomada em massa num passo próprio, sem mudar o escopo.
- **Tentação de subir a tolerância:** a contagem de `coordinates_differ` pode vir alta em staging por causa do edge 20. Não subir `--false-manual-tolerance-m` por isso; ler o runbook.
- **Falso positivo na restauração:** um MANUAL legítimo a até 5 m do geocode vira SUCCESS. A perda é de no máximo 5 m, e o audit `property.false_manual_restored` (`before`) permite desfazer.
- **Retenção do audit:** se a política da feature 020 já apagou `property.updated` antigos, esses MANUAL caem em `missingAudit` e ficam com coordenada temporária. Revisar a contagem no dry-run de staging.

### Deploy, rollout e rollback
1. Confirmar que a TASK-X02-1 está em produção.
2. Staging:
   - dry-run com `--strip-import-previews` e conferir as contagens, inclusive `falseManual.auditCandidates`, `missingAudit` e os ambíguos de audit;
   - `--apply --limit=20` (até 20 por fase), revisar o relatório e alguns pins;
   - `--apply` completo, incluindo `--strip-import-previews`;
   - re-executar e conferir `scanned:0`.
3. Anexar os relatórios de staging. Rodar o dry-run em prod via `fly ssh console` e calcular `estimatedRequests.total × US$ 0,005` com o preço vigente; acima de US$ 200, pedir aval do dev antes do passo 4.
4. Prod: o mesmo roteiro, fora do horário comercial de Sydney.
5. Entregar à operação, para correção manual pela receita do runbook: a lista `noResult` (imóveis e filiais) e as listas `falseManual.ambiguous` (primeiro os com `addressChangedAfterTransition: true`) e `falseManual.missingAudit` (MANUAL que podem guardar coordenada temporária). Registrar na entrega que essas listas são o insumo da auditoria de geocodificação exigida antes de ligar o geofence BLOCK da F03 (dec. 18).
6. Se a conta recusar em algum momento: corrigir a conta e rodar `--retry-failed-permanent --apply`.
7. Rollback:
   - não há rollback automático;
   - as coordenadas anteriores ficam no audit `*.geocode_permanent_backfilled` (`before`) e podem ser reaplicadas por SQL se houver regressão grave. A reaplicação também precisa atualizar `coordinates`;
   - um falso MANUAL restaurado por engano volta ao estado anterior com os `before` de `property.false_manual_restored` (lat, lng e MANUAL), também via repositório para manter `coordinates`;
   - uma linha mal regeocodificada se corrige com MANUAL (imóvel) ou editando o endereço (filial);
   - a limpeza de `preview_json` não se desfaz e não afeta nenhum fluxo.

### Dias · Branch · Verificação
- **1,25 dia.** Era 0,75; +0,25 do CAS por `updated_at`, merge jsonb e 429 (L-X02-03, L-X02-05) e +0,25 do relatório ampliado, `--limit`/`--tenant` e runbook (L-X02-05, L-X02-06, L-X02-09). Branch `feat/regeocode-permanent-legacy`, em worktree a partir de `develop`, depois do merge da TASK-X02-1.
- Commits:
  - `feat(property): add permanent regeocode script for legacy coordinates`
  - `feat(property): strip legacy coordinates from committed import previews`
  - `feat(property): add bulk retry for account-blocked geocoding`
  - `feat(property): restore false manual coordinates detected via audit`
  - `fix(property): guard legacy regeocode writes with updated_at`
  - `feat(property): add request estimate and rate-limit retry to regeocode`
  - `docs(runbook): add permanent regeocode runbook`
- Verificação:
  - `pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter backend test -- regeocode-permanent`
  - `pnpm --filter backend test:integration:db -- regeocode-permanent` (via subagente)
  - Dry-run local: `pnpm --filter backend tsx --env-file .env src/scripts/regeocode-permanent.ts --strip-import-previews`

---

## Achados para revisão
- **Regra dos falsos MANUAL adaptada:** o audit `property.updated` não guarda lat/lng (`update-property.use-case.ts:198-206`), então a regra "before/after lat/lng iguais" não pode ser avaliada literalmente. A TASK-X02-2 usa duas provas: o endereço não mudou na transição para MANUAL (audit) e a coordenada atual está a até 5 m do geocode permanente. Confirmar que a adaptação atende à decisão.
- **Formato da recusa da Mapbox:** o status e o corpo da resposta para conta sem o modo permanente ainda não foram confirmados. Resolvido pela L-X02-01: o spike do passo 0 da TASK-X02-1, **antes** de codar, fixa a URL, o formato da recusa e a prova positiva pelo contador; contingência v6 aceita.

---

## Ajustes necessários em outras tarefas (para reconciliar)
- `fase2-etapa1/README.md` · X02 de 3,75 para 4,75 dias (+0,25 de contingência v6) na tabela e no "Total de desenvolvimento" (110,25 → 111,25) · L-X02-01, L-X02-02, L-X02-03, L-X02-05, L-X02-06, L-X02-09.
- `fase2-etapa1/README.md` (Onda 1) · registrar que o spike da conta Mapbox (passo 0 da TASK-X02-1) e o lead time de habilitação do modo permanente podem atrasar F01, F04 e F09 · L-X02-01.
- `fase2-etapa1/X02-geocodificacao-permanente.md` (plano) · em "Fora do escopo/trocar de API", abrir a exceção da contingência v6 só para o adaptador de geocodificação; acrescentar preço (US$ 5/1.000, sem faixa grátis) e o limite de 600 req/min · L-X02-01, L-X02-05. (encaminhado)
- `fase2-etapa1/tarefas/F01-tarefas.md` · acrescentar `isSameGeocodingAddress` (mesmo arquivo `geocoding-address.ts`) aos contratos recebidos da X02 e usá-lo na regra "mesmo endereço → não chama o serviço", alinhando com a filial · L-X02-04.
- `fase2-etapa1/tarefas/F01-tarefas.md` · no backfill do endereço-base, adotar a mesma prova de conta e o custo de US$ 0,005 por requisição na estimativa de dry-run (`estimatedRequests`) · L-X02-05.
- `fase2-etapa1/tarefas/F04-tarefas.md` · o override de origem do dia já mapeia `MapboxPermanentGeocodingUnavailableError` para 503; se a contingência v6 for acionada, conferir que nenhum teste da F04 fixa a URL v5 de geocodificação · L-X02-01.
- `fase2-etapa1/tarefas/lacunas/_decisoes-lacunas.md` · marcar X02 como aplicado em `X02-tarefas.md` (lote 1, PENDENTE) · todas.
