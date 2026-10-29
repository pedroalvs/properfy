# F01 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | F01 · Fundações do inspetor (contrato 00.3, 00.4, 00.10; critério 00.A5 parcial) |
| **Total** | **6,0 dias** (plano: 4,25; ajuste justificado abaixo; +1,0 pelas lacunas L-F01-01..12 de 2026-10-29) |
| **Tarefas / PRs** | 3 (backend+shared → web → pwa) |
| **Depende de** | TASK-X02-1 mergeada. Ela entrega: porta `IGeocodingService.geocode(address, { mode })` com padrão `permanent`; `MapboxPermanentGeocodingUnavailableError` (`code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'`); `branchAddressSchema` **sem** `latitude/longitude`; `formatGeocodingQuery(address: GeocodableAddress): string`, `isSameGeocodingAddress(a: GeocodableAddress, b: GeocodableAddress): boolean` + tipo `GeocodableAddress` (`apps/backend/src/shared/domain/geocoding-address.ts`); `GEOCODE_SYNC_TIMEOUT_MS = 4000`, `GeocodeTimeoutError` (`code 'GEOCODE_TIMEOUT'`) e `geocodeWithTimeout(service, address, { mode?, timeoutMs? })` (`apps/backend/src/modules/property/application/services/geocode-with-timeout.ts`). |
| **Bloqueia** | F02 (estado de instalação, slot do push), F04 (endereço-base), F06 |
| **Código verificado em** | `origin/develop` @ `042a9674` (2026-10-27) |

**Ajuste de estimativa: 4,25 → 5,0 → 6,0 dias.** O escopo não foi cortado. O segundo ajuste (5,0 → 6,0, 2026-10-29) aplica as lacunas L-F01-01..12. A reconciliação com X02, F02, F05 e X03 (2026-10-29: D18, D19, caso Push "Off" do desativado, ordem de merge com a F05-3, stubs da X03) cabe nos passos existentes e não muda o total.

| Item | Plano | Agora | Motivo |
|---|---|---|---|
| TASK-F01-1 (backend+shared) | 2,0 (00.4a 1,25 + parte do 00.4b + backend do 00.10) | 3,0 | +0,25: ocultar `address` e coordenadas de CL_ADMIN/CL_USER (decisão de 2026-10-27, muda o comportamento atual). +0,25: o plano subestimou a matriz RBAC da rota nova e o ajuste das fixtures dos 6 testes que criam inspetor (o `address` passa a ser obrigatório). +0,25 (2026-10-29): schema AU derivado com trim e legado `incompatible` (L-F01-01), evento `BASE_CHANGED` (L-F01-03), rate limit por usuário também no `PATCH /me` (L-F01-06). +0,25 (2026-10-29): heartbeat em SQL único via `$executeRaw` + caso de concorrência na suíte db (L-F01-02). Backfill e api-types já estavam no plano; o dry-run sem Mapbox (L-F01-05) e o audit sem coordenadas (L-F01-10) não mudam o custo. |
| TASK-F01-2 (web) | 1,0 | 1,25 | +0,25 (2026-10-29): select de estado AU + mapeamento nome→código da sugestão, Country oculto (L-F01-01); tooltips de "último aparelho" e de atraso do Last seen (L-F01-08, L-F01-09). |
| TASK-F01-3 (pwa + QA) | 1,25 | 1,75 | QA de 0,25 → 0,5: dois apps, iOS simulado + Android, banner com 2 variantes. +0,25 (2026-10-29): versão `pkg.version+SHA` injetada pelo CI (L-F01-04), casos multi-dispositivo no hook (L-F01-08), ordem do slot (L-F01-12). |
| **Total** | **4,25** | **6,0** | 4,75 (realista) + 0,25 (privacidade CL) + 1,0 (lacunas de 2026-10-29) |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F01-1 | Backend + shared: endereço-base geocodificado, privacidade, backfill, heartbeat | 3,0 | TASK-X02-1 |
| TASK-F01-2 | Web: endereço-base no cadastro + adoção do app na tabela e no detalhe | 1,25 | TASK-F01-1 |
| TASK-F01-3 | PWA: endereço-base, banner, heartbeat, slot de push + QA | 1,75 | TASK-F01-1; TASK-F01-2 só para o QA |
| **Total** | | **6,0** | |

## Decisões que valem para as 3 tarefas

D1–D14 são de 2026-10-27; D15–D19 (e a revisão da D12) são de 2026-10-29, vindas das lacunas aceitas (D18 e D19 reconciliadas da X02, L-X02-04/05). Cada tarefa referencia as que se aplicam.

- **D1 · Base obrigatória:** obrigatória no cadastro. A OP não salva inspetor novo sem base e não pode apagar a base de um inspetor existente. Nada bloqueia o uso do app.
- **D2 · Banner:** fixo, não dispensável, na home e no perfil, com link para o perfil. Duas variantes:
  - sem `address` → "Add your base address";
  - `address` presente e `base_lat` nulo (geocodificação falhou ou shape legado incompatível) → "We couldn't locate your base address — please check it".
- **D3 · Edição livre com auditoria:** o inspetor edita pelo perfil e a OP pelo cadastro.
- **D4 · Geocodificação permanente:**
  - síncrona no save, via `IGeocodingService` com `{ mode: 'permanent' }` (X02);
  - **timeout de 4000 ms** via `geocodeWithTimeout(...)` com `GEOCODE_SYNC_TIMEOUT_MS` (fonte: TASK-X02-1). O adaptador Mapbox não tem timeout próprio;
  - texto do endereço montado por `formatGeocodingQuery` (fonte: TASK-X02-1, `apps/backend/src/shared/domain/geocoding-address.ts`), o mesmo das filiais: `street[, number][, complement], suburb, city, state, postcode, country`;
  - se falhar (sem resultado, erro, timeout ou conta sem o modo permanente), salva sem coordenadas e avisa;
  - a porta fica em `property/domain`, importada entre módulos, sem mover.
- **D5 · Reuso da coluna:**
  - a base é a coluna existente `Inspector.address`, validada pelo `inspectorBaseAddressSchema`, derivado do `branchAddressSchema` pós-X02 com regras AU + trim (L-F01-01, 2026-10-29);
  - entram só `base_lat`, `base_lng` e `base_geocoded_at`. **Não** existe `base_address_json`;
  - os inspetores com `address` já preenchido passam por um backfill único: idempotente, com throttle, modo permanente;
  - shapes incompatíveis **não** são normalizados: ficam como estão, sem validação, e mostram o banner variante 2.
- **D6 · Política de request:** lat/lng enviados pelo cliente são **removidos silenciosamente** pelo Zod (sem 400), igual à X02 para filiais. Coordenada do cliente nunca é gravada.
- **D7 · Privacidade:** o endereço-base (`address`) e as coordenadas só aparecem para AM/OP e para o próprio inspetor. CL_ADMIN e CL_USER deixam de receber `address`, o que **muda o comportamento atual**. Também não recebem nenhum campo novo.
- **D8 · Preferências (00.3):** só push. O controle "ativar/desativar push neste dispositivo" (UI e lógica) é da F02. A F01 só **reserva o slot** em `/profile/settings`. Não existe preferência de SMS.
- **D9 · `push_enabled` antes da F02:** reflete só a permissão do navegador (`Notification.permission === 'granted'`), não uma inscrição de push real. A F02 redefine.
- **D10 · Tour/guia de instalação (00.2):** **não** é desta feature. Fica na F04, junto com a aba "More".
- **D11 · PWA:** campos estruturados de endereço, sem autocomplete.
- **D12 · `appVersion`:** vem de um `define` do Vite (`__APP_VERSION__`) = `${pkg.version}+${sha7}`: versão do `apps/pwa/package.json` + SHA curto do build (`APP_BUILD_SHA`, injetado pelo CI a partir de `GITHUB_SHA`; `dev` local). `pkg.version` só sobe em release. Revisado em 2026-10-29 (L-F01-04).
- **D13 · Base do dia / sem base no dia:** fica na F04.
- **D14 · Deploy acoplado:** TASK-F01-1 e TASK-F01-2 são promovidas **juntas** a staging e a prod.
- **D15 · Endereço-base AU (2026-10-29, L-F01-01):** `inspectorBaseAddressSchema` é **derivado** (não alias): campos de texto com `.trim()`, `state` ∈ `NSW|VIC|QLD|WA|SA|TAS|ACT|NT` (trim + upper), `postcode` = 4 dígitos, `country` = `'AU'` literal (default `'AU'`). Vale na API, no web e no PWA. Endereço gravado que não parseia (legado) é `incompatible`: banner variante 2, nunca normalizado.
- **D16 · Vários aparelhos (2026-10-29, L-F01-08):** **o último heartbeat vence** para `push_enabled`, `app_version` e `app_last_seen_at`; `app_installed_at` é o primeiro `standalone` de **qualquer** aparelho (desktop incluído). Não há tabela por dispositivo.
- **D17 · Base e plano do dia (2026-10-29, L-F01-03):** trocar a base **não** altera nenhum `DayPlan`. A F01 emite `INSPECTOR_EVENTS.BASE_CHANGED` após o commit, sem assinante nesta feature; a F04 decide o que fazer com planos publicados. **2026-10-29 (dev):** a troca de base só marca o plano `STALE` (`stale_reason 'BASE_CHANGED'`); **ninguém notifica a OP** (segue L-F04-05 da F04).
- **D18 · "Mesmo endereço" igual ao da filial (2026-10-29, L-X02-04):** depois de parsear os **dois lados** com `inspectorBaseAddressSchema` (D15; atual que não parseia = legado → sempre geocodifica), a igualdade é `isSameGeocodingAddress(atual, novo)` da TASK-X02-1 (`apps/backend/src/shared/domain/geocoding-address.ts`): `formatGeocodingQuery` dos dois lados com `trim().toLowerCase()` na comparação, chaves extras ignoradas. Sem comparador próprio da F01. Refina a regra "campo a campo" da L-F01-01 sem mudar o portão do legado.
- **D19 · Custo e prova de conta do backfill (2026-10-29, L-X02-05):** o relatório do backfill traz `estimatedRequests` (= linhas a geocodificar) no dry-run e no apply; custo ≈ `estimatedRequests × US$ 0,005` (Permanent Geocoding, sem faixa grátis; reconfirmar o preço vigente), acima de US$ 200 exige aval do dev antes do `--apply` em prod. O `--apply` só roda num ambiente cuja prova positiva do modo permanente (contador "Permanent Geocoding API" subindo) já está registrada no `docs/ops/pre-deploy-smoke-checklist.md` pela X02; erro de conta aborta (já previsto). O dry-run continua sem Mapbox e sem exigir config (L-F01-05).

---

## TASK-F01-1 · Backend + shared: endereço-base geocodificado, privacidade, backfill, heartbeat

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-X02-1
> - **Desbloqueia:** TASK-F01-2, TASK-F01-3, TASK-F02-1, TASK-F04-2, TASK-F05-1
> - **Pode rodar em paralelo com:** TASK-F03-2, TASK-X02-2
> - **Pista sugerida (time de 6):** B · Backend de integração

### Objetivo
- Dar ao inspetor um endereço-base validado e geocodificado em modo permanente: obrigatório na criação, trocável e não removível.
- Esconder endereço e coordenadas de CL_ADMIN/CL_USER.
- Recuperar com um backfill único as coordenadas dos endereços já gravados.
- Registrar o estado do app a partir de um heartbeat do PWA.
- Expor tudo com contratos declarados e api-types regenerados.

### Contexto no código
- **Modelo:**
  - `apps/backend/prisma/schema.prisma:467` (`model Inspector`): `address Json?` na l. 483, sem lat/lng; os timestamps do projeto são `DateTime`/`DateTime?` sem `@db.Timestamptz` (timestamp(3));
  - padrão de coordenada: `Property.lat/lng Decimal? @db.Decimal(10, 7)` (`schema.prisma:389-390`);
  - última migration: `20260929000000_financial_entry_nullable_initiator`.
- **Shared (estado pós-X02):**
  - `packages/shared/src/schemas/address.ts`: `branchAddressSchema` com `street, number?, complement?, suburb, city, state, postcode, country(2, default 'AU')`, **sem** lat/lng (a X02 removeu). Zod em modo padrão (strip): chaves desconhecidas são descartadas. `addressSuggestionSchema` não tem `city`; o web usa `city = suburb` (`useBranchSave.ts:63`).
  - `packages/shared/src/schemas/inspector.ts`: `createInspectorSchema.address` e `updateInspectorSchema.address` são `z.record(z.unknown()).optional().nullable()` (l. 50 e 71); `inspectorSelfUpdateSchema` (l. 126-130) só tem `phone/fullName/paymentSettings`; `listInspectorsQuerySchema` na l. 82.
  - `packages/shared/src/schemas/responses.ts:257`: `inspectorResponseSchema` (`address: z.unknown().optional()`). `meResponseSchema` na l. 105.
- **Rotas** (`apps/backend/src/modules/inspector/interfaces/inspector.routes.ts`):
  - `POST /v1/inspectors` (l. 99, 201 `inspectorResponseSchema`);
  - `GET /v1/inspectors` (l. 122, paginado);
  - `GET /v1/inspectors/:inspectorId` (l. 145);
  - `PATCH /v1/inspectors/:inspectorId` (l. 203);
  - `GET /v1/inspectors/me` (l. 626, **sem response schema**);
  - `PATCH /v1/inspectors/me` (l. 643-663, só body schema; **sem response schema**).
- **Use cases** (`.../inspector/application/use-cases/`):
  - `create-inspector.use-case.ts`: AM/OP via `assertRoles`; grava `address: (input as any).address ?? null` (l. 129); audita `inspector.created` (l. 190).
  - `update-inspector.use-case.ts`: AM/OP; `if (data.address !== undefined) updateData.address = data.address` (l. 142); audita `inspector.updated` (l. 222).
  - `update-inspector-self-profile.use-case.ts`: INSP próprio; audita `inspector.self_profile_updated` com before/after.
  - `get-inspector.use-case.ts` (l. 52-90) e `list-inspectors.use-case.ts` (l. 63-110): INSP vê só o próprio; o ramo INSP da lista monta o item à mão, sem `address`. CL_ADMIN/CL_USER veem os inspetores elegíveis do próprio tenant e **hoje recebem `address`** (`get-inspector.use-case.ts:89`).
- **Geocodificação:**
  - porta em `apps/backend/src/modules/property/domain/geocoding.service.ts`;
  - `DynamicGeocodingService` em `apps/backend/src/modules/integration/infrastructure/dynamic-providers.ts:131`. Sem config `mapbox`, cai no `StubGeocodingService`, que retorna `null`;
  - instância em `apps/backend/src/main/container.ts:660`; os inspector use cases ficam nas l. 718, 722 e 732.
- **Entidade e repositório:** `domain/inspector.entity.ts`; `domain/inspector.repository.ts` (`InspectorFilters`, `update()`); `infrastructure/prisma-inspector.repository.ts` (mapeamento nas l. 33, 61, 148 e 197).
- **Script one-off:** padrão em `apps/backend/src/scripts/backfill-property-branch.ts` (+ `.test.ts`): dry-run por padrão, `--apply` grava, resumo tipado.
- **Web:** a página de inspetores é só AM/OP (`apps/web/src/app/router.tsx:373-375`, `AuthGuard roles={[AM, OP]}`). Nenhuma tela web ou PWA lê o `address` de inspetor hoje, então a mudança de privacidade não quebra consumidor.
- **`/v1/me`** (`auth.routes.ts:139,154`): usa `meResponseSchema`, que **remove campos não declarados**. Esta feature não expõe nada lá.

### Decisões aplicáveis
D1, D3, D4, D5, D6, D7, D8 (sem coluna de preferência), D9, D10 (fora), D14 (de 2026-10-27); D15, D16, D17, D18, D19 (de 2026-10-29).

Regras de 2026-10-29 (lacunas aceitas):
- **L-F01-01 · Schema AU derivado:** `inspectorBaseAddressSchema` = `branchAddressSchema.extend({...})` com trim, estado AU, postcode de 4 dígitos e `country: 'AU'` (ver Contratos). Fecha a brecha `{ street: ' ', … }`. "Mesmo endereço" = `isSameGeocodingAddress` (X02) sobre os **dois lados parseados** pelo schema (D18); se o atual não parsear (legado), sempre geocodifica. Legado com estado por extenso ou país ≠ AU é `incompatible` no backfill.
- **L-F01-02 · Heartbeat em uma instrução SQL:** `recordAppState()` no repositório usa `prisma.$executeRaw` (CASE + COALESCE), não `updateMany`; `affected === 0` → `InspectorNotFoundError`. A F04 acrescenta `onboarding_completed_at` nessa mesma instrução.
- **L-F01-03 · Evento `BASE_CHANGED`:** os três use cases de escrita emitem `INSPECTOR_EVENTS.BASE_CHANGED` após o commit quando a base foi gravada/alterada; trocar a base não mexe em `DayPlan`.
- **L-F01-05 · Backfill:** dry-run **não** chama a Mapbox nem exige config; só `--apply` geocodifica. Relatório com `estimatedRequests` e regra de custo/prova de conta da D19 (L-X02-05). A seleção exclui `DbNull` e `JsonNull`; o create passa a gravar `Prisma.DbNull` em vez de `null` cru.
- **L-F01-06 · Rate limit por usuário:** `keyGenerator` por `authContext.userId` (fallback IP) em `POST /me/app-state` **e** em `PATCH /v1/inspectors/me`, 10/min.
- **L-F01-07 · Lista AM/OP devolve `address`:** o item da lista para AM/OP inclui `address` (para o tooltip do badge).
- **L-F01-08 · Último heartbeat vence** (D16).
- **L-F01-10 · Audit sem coordenadas:** before/after com `address`, `baseLocated: boolean` e `baseGeocodedAt`; **nunca** `baseLat/baseLng` (norma F03 D10 / F04).
- **L-F01-11 · Ordem do create:** validar → conflito de e-mail → `geocodeInspectorBase` → `userRepo.save` → `inspectorRepo.save` com coords → audit único → evento. Nos updates, geocodificar antes do `update`.

### Modelo de dados

| Coluna (Prisma) | Tipo | Nulo | Default | Índice | Semântica |
|---|---|---|---|---|---|
| `address` (existente) | `Json?` | sim | – | – | Endereço-base. Escritas novas validadas por `inspectorBaseAddressSchema`. O legado pode ter outro shape (fica intocado). |
| `base_lat` (novo) | `Decimal? @db.Decimal(10, 7)` | sim | – | – | Latitude permanente. Nulo = sem coordenadas. |
| `base_lng` (novo) | `Decimal? @db.Decimal(10, 7)` | sim | – | – | Longitude permanente. Sempre nula junto com `base_lat`. |
| `base_geocoded_at` (novo) | `DateTime?` | sim | – | – | Última geocodificação bem-sucedida. Nulo quando falhou ou nunca rodou. |
| `app_installed_at` (novo) | `DateTime?` | sim | – | – | Primeiro heartbeat em `standalone`. Nunca é sobrescrito. |
| `app_last_seen_at` (novo) | `DateTime?` | sim | – | – | Último heartbeat. |
| `push_enabled` (novo) | `Boolean?` | sim | – | – | Nulo = nunca reportou. Antes da F02, reflete a permissão do navegador (D9). |
| `app_version` (novo) | `String? @db.VarChar(40)` | sim | – | – | Versão do último heartbeat. |

- **Sem índice novo:** a tabela tem dezenas de linhas e o filtro `base_lat IS NULL` faz scan barato.
- **Sem CHECK constraint:** o par lat/lng é mantido pelo repositório, sempre numa única escrita que grava as duas ou zera as duas.
- **Invariante:** ao trocar o `address`, as coordenadas antigas são substituídas pelas novas, ou zeradas (junto com `base_geocoded_at`) se a nova geocodificação falhar. Coordenada de endereço antigo nunca fica valendo.
- **Mapeamento:** o repositório converte `Prisma.Decimal` ↔ `number` (`.toNumber()`), como o repositório de imóveis faz com `lat/lng`. A entidade e os DTOs usam `number | null`.

**Migration** `apps/backend/prisma/migrations/20261103000000_inspector_base_coords_app_state/migration.sql` (novo; ajustar o timestamp para a data real, sempre maior que `20260929000000`):
1. ```sql
   ALTER TABLE "inspectors"
     ADD COLUMN "base_lat" DECIMAL(10,7),
     ADD COLUMN "base_lng" DECIMAL(10,7),
     ADD COLUMN "base_geocoded_at" TIMESTAMP(3),
     ADD COLUMN "app_installed_at" TIMESTAMP(3),
     ADD COLUMN "app_last_seen_at" TIMESTAMP(3),
     ADD COLUMN "push_enabled" BOOLEAN,
     ADD COLUMN "app_version" VARCHAR(40);
   ```
2. Só expand: nullable, sem default, sem backfill em SQL, sem lock relevante.
3. Gerar com `prisma migrate dev --create-only` e conferir que o diff **não** derruba índices `Unsupported()` (memória "drift DROPA Unsupported()"). Aplicar localmente e rodar `prisma generate`.
4. Rollback de schema: `DROP COLUMN` das 7, só num PR de contract posterior (nenhum dado antigo depende delas).

**Script de backfill** `apps/backend/src/scripts/backfill-inspector-base-coords.ts` (novo), no padrão de `backfill-property-branch.ts`:
1. **Seleção:** `deleted_at IS NULL AND address IS NOT NULL AND base_lat IS NULL`. É isso que torna o script idempotente. No Prisma (L-F01-05): `where: { deleted_at: null, base_lat: null, AND: [{ address: { not: Prisma.DbNull } }, { address: { not: Prisma.JsonNull } }] }`, para que JSON `null` gravado pelo caminho atual (`create-inspector.use-case.ts:129` → `prisma-inspector.repository.ts:148`) não entre no `scanned`.
2. **Compatibilidade:** `inspectorBaseAddressSchema.safeParse(address)`.
   - Falhou: linha **incompatível**. Não é tocada (nem normalizada) e entra no relatório com os `issues[].path` do Zod. No app, mostra o banner variante 2. Com o schema AU (L-F01-01), legado com estado por extenso (`"New South Wales"`), postcode fora de 4 dígitos ou país ≠ `AU` também cai aqui.
   - Passou: segue com o valor parseado, só para montar o texto. A coluna `address` **não** é reescrita.
3. **Geocodificação (só com `--apply`, L-F01-05):** chama `geocodeInspectorBase(...)`, o mesmo serviço do save, que usa `formatGeocodingQuery` + `geocodeWithTimeout` com `{ mode: 'permanent' }` e `GEOCODE_SYNC_TIMEOUT_MS` (TASK-X02-1). O `DynamicGeocodingService` é montado com o `IntegrationConfigResolver`, na mesma construção do `container.ts`.
   - Com `--apply`, se o resolver não tiver config `mapbox` (stub), o script **aborta** antes de ler as linhas: "Mapbox integration not configured: refusing to run".
   - Dry-run: **nenhuma** chamada à Mapbox e **não** exige config (serve em dev local sem Mapbox para revisar os incompatíveis).
4. **Throttle:**
   - sequencial, com `--delay-ms` (padrão 250 ms ≈ 4 req/s);
   - erro genérico ou timeout: conta em `failed` e segue (a linha é pega na próxima rodada);
   - `MapboxPermanentGeocodingUnavailableError` **aborta** a rodada inteira com exit ≠ 0.
5. **Escrita (`--apply`):** `updateMany({ where: { id, base_lat: null }, data: { base_lat, base_lng, base_geocoded_at: now } })`. O CAS impede sobrescrever um save concorrente do inspetor ou da OP. Gera uma auditoria `inspector.base_geocoded` por linha, com `actorType: 'SYSTEM'`, `entityType: 'Inspector'`, `after: { baseLocated: true, baseGeocodedAt }` (sem lat/lng, L-F01-10) e `metadata: { source: 'backfill' }`. Emite `INSPECTOR_EVENTS.BASE_CHANGED` `{ inspectorId, hadCoordinates: false, hasCoordinates: true }` por linha gravada (L-F01-03).
6. **Relatório** (JSON no stdout + resumo legível; L-F01-05):
   - dry-run: `{ dryRun: true, scanned, compatible, incompatible: [{ inspectorId, issues }], toGeocode }` (sem `geocoded/notFound/failed/skippedConcurrent`);
   - `--apply`: `{ dryRun: false, scanned, compatible, incompatible: [{ inspectorId, issues }], geocoded, notFound: [inspectorId], failed: [{ inspectorId, reason: 'error'|'timeout' }], skippedConcurrent }`.
7. **Execução:**
   - `pnpm --filter backend tsx --env-file .env src/scripts/backfill-inspector-base-coords.ts` (dry-run);
   - o mesmo comando com `--apply`;
   - em staging, via Portainer exec; em prod, via `fly ssh console` (memória "dry-run via fly ssh"). Ordem: staging antes de prod, sempre dry-run antes do apply.

### Contratos

Envelope de erro: `{ error: { code, message, details } }`. Zod → 400 `VALIDATION_ERROR` "Request payload is invalid" (body) ou "Invalid query parameters" (query), com `details` = issues.

**Schemas shared**
- `inspectorBaseAddressSchema` (tipo `InspectorBaseAddress`), exportado de `address.ts`, **derivado** do `branchAddressSchema` (L-F01-01, D15; hoje o de filial não tem `.trim()` nem regra AU, `address.ts:16-27`):
  ```ts
  export const AU_STATES = ['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'] as const;
  export const inspectorBaseAddressSchema = branchAddressSchema.extend({
    street: z.string().trim().min(1).max(200),
    number: z.string().trim().max(20).optional(),
    complement: z.string().trim().max(200).optional(),
    suburb: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().toUpperCase().pipe(z.enum(AU_STATES)),
    postcode: z.string().trim().regex(/^\d{4}$/),
    country: z.literal('AU').default('AU'),
  });
  ```
  - `AU_STATES` exportado para o select do web e do PWA.
  - Como a X02 removeu lat/lng do `branchAddressSchema`, **não há `.omit`**.
  - O modo strip do Zod descarta `latitude/longitude` (e qualquer chave extra) enviados pelo cliente, sem erro (D6).
  - Mensagens (`message` dos issues, usadas no `details`): state inválido → "Select a state"; postcode → "Postcode must be 4 digits"; country → "Only Australian addresses are supported".
- `createInspectorSchema.address: inspectorBaseAddressSchema` (**obrigatório**).
- `updateInspectorSchema.address: inspectorBaseAddressSchema.optional()` (**sem `.nullable()`**).
- `inspectorSelfUpdateSchema.address: inspectorBaseAddressSchema.optional()`.
- `inspectorAppStateSchema = z.object({ displayMode: z.enum(['standalone','browser']), pushPermission: z.enum(['granted','denied','default','unsupported']), appVersion: z.string().trim().min(1).max(40) })`. Modo strip: chaves extras descartadas.
- `listInspectorsQuerySchema.missingBaseAddress`: boolean de query com a coerção do projeto (`'true'|'false'` → boolean; memória "boolean query", não `z.coerce.boolean`).
- `inspectorResponseSchema` ganha, todos `.optional()`:
  - `baseLat: z.number().nullable()`;
  - `baseLng: z.number().nullable()`;
  - `baseGeocodedAt` (instant nullable);
  - `baseGeocodeFailed: z.boolean()`, só nas respostas de escrita;
  - `appInstalledAt` e `appLastSeenAt` (instant nullable);
  - `pushEnabled: z.boolean().nullable()`;
  - `appVersion: z.string().nullable()`.
  - `address` continua `z.unknown().optional()`, porque o legado pode ter outro shape. Passa a vir também nos itens da **lista** para AM/OP (L-F01-07).

**Visibilidade de campos por papel** (helper novo `apps/backend/src/modules/inspector/application/inspector-field-visibility.ts`, aplicado em get, list e respostas de escrita):

| Campo | AM / OP | INSP (próprio) | CL_ADMIN / CL_USER |
|---|---|---|---|
| `address`, `baseLat`, `baseLng`, `baseGeocodedAt` | sim (get **e lista**, L-F01-07) | sim | **não** (removidos; mudança de comportamento para `address`) |
| `appInstalledAt`, `appLastSeenAt`, `pushEnabled`, `appVersion` | sim | não | não |
| demais campos | inalterado | inalterado | inalterado |

**Endpoints**

| Endpoint | Request | Response | Erros (code · message) | RBAC |
|---|---|---|---|---|
| `POST /v1/inspectors` (alterado) | `createInspectorSchema`, `address` obrigatório; lat/lng removidos | 201 `{data}`: campos atuais + `address, baseLat, baseLng, baseGeocodedAt, baseGeocodeFailed` + adoção (nulos) | 400 `VALIDATION_ERROR` · "Request payload is invalid" (sem `address`/campo inválido); 409 `INSPECTOR_EMAIL_CONFLICT` · "An inspector with this email already exists" (existente). Falha de geocodificação **não** é erro: 201 com `baseGeocodeFailed: true`. | AM, OP. Outros: 403 `AUTH_FORBIDDEN` (existente, `assertRoles`). |
| `PATCH /v1/inspectors/:inspectorId` (alterado) | `updateInspectorSchema`; `address` opcional, não-nullable | 200 `{data}`; `baseGeocodeFailed` presente só quando `address` veio | 400 `VALIDATION_ERROR` com `address: null` (o Zod rejeita null, o que garante que a base não é apagada) ou shape inválido; 404 `INSPECTOR_NOT_FOUND` · "Inspector not found" | AM, OP |
| `PATCH /v1/inspectors/me` (alterado) | `inspectorSelfUpdateSchema` + `address` | 200 `{data: { inspectorId, baseGeocodeFailed? }}` (sem response schema; ver Riscos) | 400 `VALIDATION_ERROR`; 403 `INSP_ONLY` · "This endpoint is only accessible to inspectors"; 403 `AUTH_FORBIDDEN` · "Inspectors can only update their own profile" (use case); 404 `INSPECTOR_NOT_FOUND`; 429 rate limit (10/min por usuário, L-F01-06) | INSP (próprio) |
| `POST /v1/inspectors/me/app-state` (novo) | `inspectorAppStateSchema` | 204 sem corpo | 400 `VALIDATION_ERROR`; 403 `INSP_ONLY` (mesma mensagem); 404 `INSPECTOR_NOT_FOUND` (soft-deleted); 429 rate limit (10/min **por usuário**, L-F01-06) | INSP (próprio) |
| `GET /v1/inspectors` (alterado) | `listInspectorsQuerySchema` + `missingBaseAddress` | 200 paginado, itens filtrados pela tabela de visibilidade | 400 `VALIDATION_ERROR` · "Invalid query parameters" | AM/OP: tudo (incluindo `address`, L-F01-07) + filtro. CL_*: sem `address`/coords/adoção; `missingBaseAddress` ignorado. INSP: só o próprio, com `address`/coords e sem adoção. |
| `GET /v1/inspectors/:inspectorId` (alterado) | – | 200 `{data}`, mesma regra de visibilidade | 404 `INSPECTOR_NOT_FOUND`; 403 `FORBIDDEN` · "Cannot access another inspector's data" (INSP, existente) | igual à lista |
| `GET /v1/inspectors/me` (alterado) | – | 200 `{data}` + `address, baseLat, baseLng, baseGeocodedAt` (sem adoção) | 403 `INSP_ONLY` | INSP |

- `/v1/me` **não muda**.
- A rota estática `/v1/inspectors/me/app-state` tem precedência sobre `/:inspectorId/...` no find-my-way. Cobrir com teste.
- **Rate limit por usuário (L-F01-06):** o `@fastify/rate-limit` global é por IP (`apps/backend/src/main/plugins.ts:65-66`); `config.rateLimit` por rota herda essa chave (o único `keyGenerator` hoje é o de `fy.routes.ts:67`). Nas duas rotas (`POST /me/app-state` e `PATCH /me`): `config: { rateLimit: { max: 10, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: (req) => req.authContext?.userId ?? req.ip } }`. O `authenticate` é `preHandler`; o limite precisa rodar **depois** dele para ver `authContext` (sem isso a chave cai no IP). Conferir a ordem no teste "dois usuários no mesmo IP".

**Evento novo (L-F01-03)**
- `INSPECTOR_EVENTS.BASE_CHANGED = 'inspector.base_changed'`, em `apps/backend/src/modules/inspector/domain/inspector-events.ts` (novo), payload `{ inspectorId: string; hadCoordinates: boolean; hasCoordinates: boolean }`.
- Emitido por create, update (OP), self-update e backfill, **após** a escrita, só quando `address` foi gravado/alterado (não no "mesmo endereço" sem geocode). Sem assinante nesta feature; falha no emit é logada e não quebra a resposta. Usa o bus existente (`apps/backend/src/shared/application/events/domain-event-bus.ts`, já injetado em use cases de filial como `create-branch.use-case.ts`), como dependência opcional no fim do construtor; mesmo padrão do `INSPECTOR_FIELD_EVENTS.RECORDED` (F03).

### Regras do geocode síncrono
- **Serviço novo:** `apps/backend/src/modules/inspector/application/services/geocode-inspector-base.ts`, `geocodeInspectorBase(geocoder, address, logger, clock)` → `{ lat, lng, geocodedAt } | { failed: 'no_results'|'error'|'timeout'|'permanent_unavailable' }`.
- **Texto:** `formatGeocodingQuery(address)` importado de `apps/backend/src/shared/domain/geocoding-address.ts` (TASK-X02-1). O `InspectorBaseAddress` é compatível estruturalmente com `GeocodableAddress`. **Não existe** um segundo formatador.
- **Chamada:** `geocodeWithTimeout(geocoder, text, { mode: 'permanent', timeoutMs: GEOCODE_SYNC_TIMEOUT_MS })`, importado de `apps/backend/src/modules/property/application/services/geocode-with-timeout.ts` (TASK-X02-1). Não há `Promise.race` próprio. `GeocodeTimeoutError` (`code 'GEOCODE_TIMEOUT'`) vira `{ failed: 'timeout' }`. O resultado que chegar depois do timeout é descartado pelo helper.
- **Erros:** nunca lança. Erros e timeouts viram `failed` + log.
- **Mesmo endereço (L-F01-01):** os use cases de update parseiam o `address` atual com `inspectorBaseAddressSchema`; se parsear, `isSameGeocodingAddress(atual, novo)` (TASK-X02-1, mesma regra da filial; D18) devolver `true` e já houver `base_lat`, não chamam o serviço. Mantém as coords e evita o custo do modo permanente. Se o atual não parsear (legado), sempre geocodifica.
- **Ordem (L-F01-11):** create = validar → conflito de e-mail (`create-inspector.use-case.ts:66-77`) → `geocodeInspectorBase` (nenhuma escrita antes) → `userRepo.save` → `inspectorRepo.save` já com coords (uma escrita) → audit `inspector.created` único → `BASE_CHANGED`. Updates: geocodificar **antes** do `update`, que grava endereço + coords numa escrita só. Um erro inesperado no geocode nunca deixa `User` sem `Inspector`.
- **Persistência de nulo:** o create deixa de gravar `null` cru numa coluna `Json?` (`(input as any).address ?? null`); como `address` passa a ser obrigatório, o caminho de `null` some; onde o repositório ainda precisar de nulo, usar `Prisma.DbNull` (L-F01-05).

### Regras do heartbeat (servidor)
- `app_last_seen_at = now()` e `app_version = appVersion`, sempre.
- `push_enabled = (pushPermission === 'granted')`. `unsupported`/`denied`/`default` → `false` (D9).
- `app_installed_at = COALESCE(app_installed_at, now())` **só** se `displayMode === 'standalone'`. Em `browser`, não mexe; sair do standalone não apaga.
- **Uma instrução SQL (L-F01-02):** o `data` do `updateMany` não referencia colunas, então o COALESCE é feito em `recordAppState()` do repositório via `prisma.$executeRaw`:
  ```sql
  UPDATE "inspectors"
     SET "app_last_seen_at" = ${now}::timestamp(3),
         "app_version"      = ${appVersion}::text,
         "push_enabled"     = ${pushEnabled}::boolean,
         "app_installed_at" = CASE WHEN ${displayMode}::text = 'standalone'
                                   THEN COALESCE("app_installed_at", ${now}::timestamp(3))
                                   ELSE "app_installed_at" END
   WHERE "id" = ${id}::text AND "deleted_at" IS NULL
  ```
  Casts explícitos (memória "$queryRaw ::int"; `Inspector.id` é `String @default(uuid())` sem `@db.Uuid`, ou seja, coluna `text`). `affected === 0` → `InspectorNotFoundError` (404). Proibido ler-e-depois-escrever ou duas escritas. A F04 acrescenta `onboarding_completed_at = COALESCE(...)` **nesta mesma** instrução.
- Idempotente; sem `Idempotency-Key`. O throttle de 6 h é do cliente; o servidor só aplica o rate limit (por usuário, L-F01-06).
- **Vários aparelhos (D16, L-F01-08):** sem tabela por dispositivo; o último heartbeat vence para `push_enabled`, `app_version` e `app_last_seen_at`; `app_installed_at` registra o primeiro `standalone` de qualquer aparelho (desktop incluído).
- Sem auditoria: é telemetria. Log `debug` `inspector.app_state_recorded` com `request_id`.

### Casos de borda
1. Criação sem `address` → 400. Com `address.latitude/longitude` → 201; as coords enviadas são descartadas e as gravadas vêm só do geocoder.
2. Criação com geocoder retornando `null`, lançando, estourando 4000 ms ou com stub (sem config) → 201, `address` gravado, coords nulas, `baseGeocodeFailed: true`.
3. `MapboxPermanentGeocodingUnavailableError` no save → mesmo tratamento do item 2, com log `error` em vez de `warn`.
4. Update da OP com `address: null` → 400. Com `address` ausente → endereço e coords preservados, mesmo se o endereço atual for legado incompatível.
5. Troca de endereço com geocodificação falhada → coords e `base_geocoded_at` **zerados**.
6. Mesmo endereço reenviado com coords → nenhuma chamada ao geocoder.
7. INSP com `address` legado incompatível edita só o telefone → 200, `address` intocado.
8. Heartbeat de inspetor soft-deleted → 404. De OP → 403. Dois `standalone` concorrentes → `app_installed_at` do primeiro a efetivar (`COALESCE` na instrução única; ver item 17).
9. `browser` depois de `standalone` → `app_installed_at` mantido.
10. CL_ADMIN em `GET /v1/inspectors/:id` → sem `address`, coords e adoção. `?missingBaseAddress=true` ignorado para CL.
11. Backfill rodado duas vezes → a segunda seleciona só falhas e incompatíveis. Um save concorrente durante o backfill não é sobrescrito (CAS) e conta em `skippedConcurrent`.
12. Backfill `--apply` sem config Mapbox → aborta antes de ler linhas. Dry-run sem config Mapbox → roda e emite o relatório estrutural, sem chamada à Mapbox (L-F01-05).
13. `address = { street: ' ', suburb: ' ', state: 'X', postcode: '0', country: 'AU' }` → 400 (trim + `min(1)`, estado e postcode AU). A base nunca fica "presente" vazia (L-F01-01).
14. `state: ' nsw '` → gravado `'NSW'`; reenviar `'NSW '` com coords existentes → "mesmo endereço", sem geocode (L-F01-01).
15. `state: 'New South Wales'` ou `country: 'NZ'` na API → 400. O mesmo valor já gravado (legado) → `incompatible` no backfill, banner variante 2, e qualquer save novo geocodifica (L-F01-01).
16. Linha com `address` = JSON `null` (`JsonNull`) → fora do `scanned` do backfill (L-F01-05).
17. Dois `standalone` concorrentes → `app_installed_at` gravado uma vez, pela instrução que efetivou primeiro, e nunca sobrescrito (instrução SQL única, provado na suíte db) (L-F01-02).
18. Dez inspetores atrás do mesmo IP, 10 heartbeats cada no mesmo minuto → nenhum 429. O 11º do **mesmo** usuário → 429 (L-F01-06).
19. Troca de base → `BASE_CHANGED` emitido uma vez, após o commit; nenhum `DayPlan` alterado nesta feature. "Mesmo endereço" → nenhum evento (L-F01-03).
20. Geocoder lança erro inesperado (bug) no create → nada foi escrito (geocode antes de `userRepo.save`) (L-F01-11).
21. Celular `standalone`/`granted` e depois Chrome desktop `browser`/`default` → `push_enabled=false`, `app_installed_at` mantido (último heartbeat vence, D16).
22. Reenvio com `street:'1 GEORGE ST'` contra `'1 George St'` salvo (coords existentes) → `isSameGeocodingAddress` = `true`, sem geocode e sem `BASE_CHANGED` (D18).
23. Dry-run do backfill com 3 linhas a geocodificar → `estimatedRequests: 3` no relatório, sem chamada à Mapbox (D19).

### Testes primeiro (TDD)

**Unit (Vitest)**

`packages/shared/src/schemas/inspector.test.ts`:

| Caso | Entrada | Esperado |
|---|---|---|
| create exige base | payload válido sem `address` | `success=false`, path `['address']` |
| create aceita base | `address={street:'1 George St',suburb:'Sydney',city:'Sydney',state:'NSW',postcode:'2000',country:'AU'}` | `success=true` |
| base só com espaços (L-F01-01) | `street:' ', suburb:' ', state:'X', postcode:'0'` | `success=false`; paths `street`, `suburb`, `state`, `postcode` |
| trim + caixa do estado | `state:' nsw ', street:' 1 George St '` | `success=true`; `data.address.state='NSW'`, `street='1 George St'` |
| estado por extenso | `state:'New South Wales'` | `success=false`, message "Select a state" |
| postcode | `'200'` / `'20000'` / `'2O00'` | `success=false`, "Postcode must be 4 digits" |
| país | `country:'NZ'` | `success=false`; ausente → `'AU'` |
| coords do cliente descartadas | base + `latitude:-33.8, longitude:151.2` | `success=true`; `data.address` sem `latitude/longitude` |
| update rejeita null | `{address:null}` | `success=false` |
| update sem chave | `{name:'X'}` | `success=true`, `address` undefined |
| self-update aceita base | `{address: base}` | `success=true` |
| app-state válido | `{displayMode:'standalone',pushPermission:'granted',appVersion:'0.1.0'}` | `success=true` |
| app-state inválido | `displayMode:'fullscreen'` / `appVersion:''` | `success=false` |
| list query | `{missingBaseAddress:'true'}` / `'false'` | `true` / `false` |
| response tolera legado | item com `address:{foo:1}`, `baseLat:null` | `success=true` |

`apps/backend/src/modules/inspector/application/services/geocode-inspector-base.test.ts` (novo):

| Caso | Entrada | Esperado |
|---|---|---|
| modo e texto | geocoder spy, base acima | chamado com `('1 George St, Sydney, Sydney, NSW, 2000, AU', { mode: 'permanent' })`. Texto produzido por `formatGeocodingQuery` (conferir o literal com o teste da X02). Spy em `geocodeWithTimeout` com `{ mode: 'permanent', timeoutMs: 4000 }`. |
| sucesso | → `{lat:-33.86,lng:151.2}` | `{lat,lng,geocodedAt: clock.now()}` |
| sem resultado | → `null` | `{failed:'no_results'}` + warn |
| exceção | lança `Error` | `{failed:'error'}` + warn; não propaga |
| timeout | `geocodeWithTimeout` rejeita com `GeocodeTimeoutError` | `{failed:'timeout'}` + warn |
| conta | lança `MapboxPermanentGeocodingUnavailableError` | `{failed:'permanent_unavailable'}` + **error** |

`apps/backend/tests/unit/inspector/create-inspector.use-case.test.ts`:
- geocode ok → `repo.create` com `address`, `baseLat`, `baseLng`, `baseGeocodedAt`;
- geocode falho → coords nulas e saída `baseGeocodeFailed:true`;
- input com `address.latitude` (chamada direta) → ignorado;
- auditoria `inspector.created` com `address`, `baseLocated`, `baseGeocodedAt` e **sem** `baseLat/baseLng` (L-F01-10);
- ordem (L-F01-11): geocoder chamado antes de `userRepo.save` (spy com `invocationCallOrder`); geocoder lança erro inesperado → `userRepo.save` e `inspectorRepo.save` **não** chamados;
- conflito de e-mail → geocoder **não** chamado;
- `BASE_CHANGED` emitido uma vez após o save: geocode ok → `{ hadCoordinates:false, hasCoordinates:true }`; falho → `hasCoordinates:false`; bus que lança → resposta 201 mesmo assim (L-F01-03);
- CL_ADMIN → `ForbiddenError` (existente; ajustar o wiring com o geocoder).

`apps/backend/tests/unit/inspector/update-inspector.use-case.test.ts`:
- troca → coords novas;
- troca com falha → `baseLat/baseLng/baseGeocodedAt = null`;
- `address` ausente → `repo.update` sem chaves de base;
- endereço igual com coords → geocoder não chamado e nenhum `BASE_CHANGED`;
- endereço igual a menos de trim/caixa (`state:'nsw '` contra `'NSW'` salvo; `street:'1 GEORGE ST'` contra `'1 George St'`) → geocoder não chamado (L-F01-01, D18);
- a igualdade usa `isSameGeocodingAddress` da X02 (spy/import real do `geocoding-address.ts`), sem comparador próprio (D18);
- `address` atual legado (`{foo:1}`) e novo válido → geocoder chamado (L-F01-01);
- troca → `BASE_CHANGED` `{ hadCoordinates:true, hasCoordinates:<resultado> }`;
- geocode chamado antes de `repo.update`, uma única chamada a `update` com endereço + coords (L-F01-11);
- auditoria `inspector.updated` com before/after de `address/baseLocated/baseGeocodedAt`, sem `baseLat/baseLng` (L-F01-10).

`apps/backend/tests/unit/inspector/update-inspector-self-profile.use-case.test.ts`:
- INSP troca a base → coords + auditoria `inspector.self_profile_updated` com before/after de `address/baseLocated/baseGeocodedAt` (sem lat/lng) + `BASE_CHANGED`;
- outro `inspectorId` → `ForbiddenError('AUTH_FORBIDDEN')`;
- falha → `baseGeocodeFailed:true`;
- só `phone` → base intocada.

`apps/backend/tests/unit/inspector/record-inspector-app-state.use-case.test.ts` (novo):

| Caso | Pré | Esperado no repo |
|---|---|---|
| primeiro standalone | `app_installed_at` nulo | installedAt=now, lastSeen=now, push=true, version='0.1.0' |
| segundo standalone | já preenchido | installedAt intocado |
| browser | `browser/default` | installedAt intocado, push=false |
| unsupported | `unsupported` | push=false |
| OP | actor OP | `ForbiddenError('INSP_ONLY')` |
| deletado | `affected 0` | `InspectorNotFoundError` |
| contrato do repo (L-F01-02) | qualquer | uma única chamada a `repo.recordAppState({ id, now, displayMode, pushEnabled, appVersion })`; nenhum `findById` antes |

`apps/backend/tests/unit/inspector/inspector-field-visibility.test.ts` (novo):
- AM/OP mantêm tudo;
- INSP mantém `address`/coords e perde adoção;
- CL_ADMIN e CL_USER perdem `address`, coords e adoção;
- os demais campos são idênticos ao DTO de entrada.

`apps/backend/tests/unit/inspector/get-inspector.use-case.test.ts` e `list-inspectors.use-case.test.ts`:
- OP recebe adoção e coords;
- CL_ADMIN/CL_USER **não** recebem `address` (antes recebiam), `baseLat/baseLng/baseGeocodedAt` nem `app*/pushEnabled`;
- CL com `missingBaseAddress` → filtro descartado;
- ramo INSP da lista (l. 67) inclui `address/baseLat/baseLng` e exclui adoção;
- ramo AM/OP da lista (`list-inspectors.use-case.ts:118-130`, hoje sem `address`) passa a incluir `address` (L-F01-07): OP recebe `address:{...}` e, para legado, `address:{foo:1}` cru;
- filtro repassado ao repo para OP.

`apps/backend/src/scripts/backfill-inspector-base-coords.test.ts` (novo; geocoder e prisma falsos, padrão de `backfill-property-branch.test.ts`):
- dry-run não escreve, **não chama o geocoder** e reporta `{ dryRun:true, scanned, compatible, incompatible, toGeocode, estimatedRequests }` sem `geocoded/notFound/failed` (L-F01-05); com 3 linhas a geocodificar → `estimatedRequests: 3` (= `toGeocode`, D19);
- `--apply` também traz `estimatedRequests` no relatório (D19);
- dry-run com stub (sem config Mapbox) → roda e emite o relatório (L-F01-05);
- seleção: linha com `address` `JsonNull` → fora do `scanned`; o `where` passado ao prisma falso contém `not: Prisma.DbNull` e `not: Prisma.JsonNull` (L-F01-05);
- legado `state:'New South Wales'` → `incompatible` com issue em `['state']` (L-F01-01);
- `--apply` gera `inspector.base_geocoded` com `after:{ baseLocated:true, baseGeocodedAt }` sem lat/lng (L-F01-10) e emite `BASE_CHANGED`;
- `--apply` grava coords, sem reescrever `address`;
- incompatível (`address:{foo:1}`) → listado com issues e não tocado;
- `null` → `notFound`;
- erro/timeout → `failed` e segue;
- `MapboxPermanentGeocodingUnavailableError` → aborta com exit ≠ 0;
- `--apply` com stub → aborta antes de ler linhas;
- `--delay-ms` respeitado (fake timers);
- segunda execução não reprocessa quem já tem coords;
- CAS com `count 0` → `skippedConcurrent`.

**Integração (Supertest + suíte db)**

`apps/backend/tests/integration/inspector/inspector-profile-crud.test.ts`:
- `POST /v1/inspectors` sem `address` → 400 `VALIDATION_ERROR`;
- com base (geocoder fake → coords) → 201, `data.baseLat` numérico, `data.baseGeocodeFailed=false`;
- com `address.latitude:1` → 201 e `baseLat` igual ao do geocoder, não 1;
- `PATCH /v1/inspectors/:id {address:null}` → 400;
- com base nova → 200, coords novas;
- **atualizar os outros 5 arquivos que fazem `POST /v1/inspectors`** para usar um helper de fixture compartilhado com `address` válido.

`apps/backend/tests/integration/inspector/inspector-self.test.ts`:
- `PATCH /v1/inspectors/me {address}` → 200 e o `GET /v1/inspectors/me` devolve `address` + `baseLat`;
- `POST /v1/inspectors/me/app-state` (INSP) → 204, e o GET da OP mostra `appLastSeenAt`;
- body inválido → 400;
- OP → 403 `INSP_ONLY`;
- 11 chamadas em 1 min do mesmo usuário → 429;
- dois inspetores no mesmo IP, 10 chamadas cada em 1 min → nenhum 429 (chave por usuário, L-F01-06);
- `PATCH /v1/inspectors/me` com `address`: 11 chamadas em 1 min → 429; outro inspetor no mesmo IP segue com 200 (L-F01-06);
- `PATCH /v1/inspectors/me {address:{...state:'New South Wales'}}` → 400 com `details` em `address.state` (L-F01-01).

`apps/backend/tests/integration/inspector/inspector.routes.test.ts`:
- `GET /v1/inspectors?missingBaseAddress=true` (OP) → só `base_lat` nulo, e cada item traz `address` (nulo ou objeto) (L-F01-07);
- `GET /v1/inspectors` e `GET /v1/inspectors/:id` como CL_ADMIN → itens **sem** `address`, coords e adoção;
- `POST /v1/inspectors/me/app-state` não cai em `:inspectorId`.

`apps/backend/tests/integration/rbac/inspector-rbac.test.ts`: matriz AM/OP/CL_ADMIN/CL_USER/INSP × {create, update, self-update, app-state, list, get}, com os códigos da tabela de contratos. Enviar body válido (memória "validação antes da auth").

`apps/backend/tests/integration/db/inspector-base-coords.integration.test.ts` (novo, Testcontainers, em série):
- a migration aplica;
- `Decimal(10,7)` faz round-trip para `number` sem perda relevante (−33.8688197);
- o CAS `updateMany({where:{id, base_lat:null}})` não sobrescreve uma linha geocodificada entre a leitura e a escrita;
- `recordAppState` (L-F01-02): dois `standalone` em paralelo (`Promise.all`, `now` = T1 e T2 distintos) → `app_installed_at` é exatamente um dos dois (o da instrução que efetivou primeiro) e um terceiro `standalone` com T3 não o altera; depois um `browser` → mantido; inspetor soft-deleted → `affected 0`. Sequencial T1 depois T2 → `app_installed_at = T1`;
- seleção do backfill com uma linha `address = 'null'::jsonb` e outra `address IS NULL` → nenhuma das duas selecionada (L-F01-05).

**E2E:** nenhum no backend; o de UI fica nas TASK-F01-2/3.

### Escopo / Passos
- [ ] **1. Schemas shared.**
  - Camada: shared. Dias: 0,25.
  - Modify: `packages/shared/src/schemas/address.ts`, `packages/shared/src/schemas/inspector.ts`, `packages/shared/src/schemas/responses.ts`; exports em `packages/shared/src/index.ts`, se o barrel não reexportar.
  - Inclui `inspectorBaseAddressSchema` derivado com regras AU + trim e `AU_STATES` exportado (L-F01-01).
  - Fim do passo: `pnpm --filter @properfy/shared build`.
- [ ] **2. Migration + entidade + repositório.**
  - Camada: backend. Dias: 0,25.
  - Novo: `apps/backend/prisma/migrations/20261103000000_inspector_base_coords_app_state/migration.sql`.
  - Modify: `apps/backend/prisma/schema.prisma`; `.../inspector/domain/inspector.entity.ts`; `.../inspector/domain/inspector.repository.ts` (`InspectorFilters.missingBaseAddress`, campos de base no `update()`, `recordAppState()`); `.../inspector/infrastructure/prisma-inspector.repository.ts` (Decimal↔number; `recordAppState()` via `$executeRaw` com a instrução única, L-F01-02; `Prisma.DbNull` no lugar de `null` cru, L-F01-05).
  - Fixtures de entidade nos ≈8 testes em `apps/backend/tests/unit/inspector/*` que montam `address: null`.
- [ ] **3. Serviço `geocodeInspectorBase` + criação + evento.**
  - Camada: backend. Dias: 0,5.
  - Novo: `apps/backend/src/modules/inspector/application/services/geocode-inspector-base.ts`; `apps/backend/src/modules/inspector/domain/inspector-events.ts` (`INSPECTOR_EVENTS.BASE_CHANGED`, L-F01-03).
  - Ordem fixa do create (L-F01-11): geocode antes de qualquer escrita; audit sem lat/lng (L-F01-10); `BASE_CHANGED` após o save.
  - Modify: `create-inspector.use-case.ts` (`IGeocodingService` como dependência opcional **no fim** do construtor, igual à X02 nas filiais, para não quebrar wirings não tipados; remove o `(input as any).address`) e `apps/backend/src/main/container.ts:718`.
- [ ] **4. Update da OP e auto-edição.**
  - Camada: backend. Dias: 0,25.
  - Modify: `update-inspector.use-case.ts`, `update-inspector-self-profile.use-case.ts`, `container.ts:722,732`, `inspector.routes.ts` (o PATCH `/me` repassa `address`; o cast do `data` sai; `config.rateLimit` por usuário, L-F01-06).
  - "Mesmo endereço" com `isSameGeocodingAddress` sobre os dois lados parseados (L-F01-01, D18); geocode antes do `update` (L-F01-11); `BASE_CHANGED` (L-F01-03).
- [ ] **5. Leitura com campos novos + filtro "No base address".**
  - Camada: backend. Dias: 0,25.
  - Modify: `get-inspector.use-case.ts`, `list-inspectors.use-case.ts` (incluindo o ramo INSP; ramo AM/OP passa a devolver `address`, L-F01-07), `inspector.routes.ts` (repassa `missingBaseAddress`).
- [ ] **6. Privacidade por papel.**
  - Camada: backend. Dias: 0,25.
  - Novo: `apps/backend/src/modules/inspector/application/inspector-field-visibility.ts` (`applyInspectorFieldVisibility(dto, actor)`).
  - Aplicar em get, list, create e update. Teste de regressão: CL deixa de receber `address`.
- [ ] **7. Heartbeat.**
  - Camada: backend. Dias: 0,5 (era 0,25; +0,25 pela instrução SQL única e pelo caso de concorrência na suíte db, L-F01-02).
  - Novo: `.../use-cases/record-inspector-app-state.use-case.ts`.
  - Modify: `inspector.routes.ts` (rota + rate limit por usuário com `keyGenerator`, L-F01-06) e `container.ts`.
  - Suíte db: casos de `recordAppState` em `inspector-base-coords.integration.test.ts`.
- [ ] **8. Backfill.**
  - Camada: backend. Dias: 0,25.
  - Dry-run sem Mapbox e seleção sem `DbNull`/`JsonNull` (L-F01-05); audit sem lat/lng (L-F01-10); `estimatedRequests` no relatório (D19).
  - Novos: `apps/backend/src/scripts/backfill-inspector-base-coords.ts` + `.test.ts`.
- [ ] **9. OpenAPI + api-types + verificação.**
  - Camada: shared/backend. Dias: 0,5 (era 0,25; +0,25 para absorver os testes novos de L-F01-01/03/06 nas suítes de integração e RBAC).
  - Rodar `pnpm --filter backend generate:openapi` → `pnpm --filter @properfy/shared generate:types` → `pnpm --filter @properfy/shared build`.
  - Modify: `packages/shared/openapi.json`, `packages/shared/src/api-types.ts`.
  - Rodar lint, typecheck e testes do backend (unit + integração + suíte db) e do shared.
  - Conferir `git diff --stat origin/develop... | tail -1` < 150.

### Auditoria e observabilidade
- **Auditoria:**
  - `inspector.created`, `inspector.updated` e `inspector.self_profile_updated` passam a levar `address`, `baseLocated: boolean` e `baseGeocodedAt` no before/after, **sem** `baseLat/baseLng` (L-F01-10, alinhado à F03 D10 e à F04);
  - novo `inspector.base_geocoded` (SYSTEM), um por linha do backfill, `after: { baseLocated: true, baseGeocodedAt }`, `metadata: { source: 'backfill' }`;
  - o heartbeat não é auditado.
- **Logs:**
  - `warn` `inspector.base_geocode_failed` `{ inspectorId, reason: 'no_results'|'error'|'timeout', request_id }`;
  - `error` `inspector.base_geocode_permanent_unavailable` `{ inspectorId, request_id }`;
  - `debug` `inspector.app_state_recorded`;
  - `warn` `inspector.base_changed_emit_failed` `{ inspectorId, request_id }` se o bus lançar (L-F01-03).
  - O relatório do backfill vai para o stdout; anexar ao registro do deploy.
- **Sinal operacional:** o filtro "No base address" do web.
- **Evento:** `INSPECTOR_EVENTS.BASE_CHANGED` (sem assinante nesta feature; ponto de extensão para a F04).

### Deploy, rollout e rollback
1. **Pré-requisito:** TASK-X02-1 já em produção em cada ambiente, com o token Mapbox aceitando `permanent=true` (checklist da X02).
2. **Merge acoplado (D14):** mergear TASK-F01-1 em `develop` e **segurar a promoção** até a TASK-F01-2 também estar em `develop`. O `address` obrigatório no `POST /v1/inspectors` quebra a criação no web atual, que não envia `address`.
3. **Staging:** promover `develop → staging` com TASK-F01-1 + TASK-F01-2 **na mesma promoção**. A migration roda no deploy (expand). Smoke: criar inspetor pelo web com base → `baseLat` preenchido; CL_ADMIN em `GET /v1/inspectors/:id` sem `address`.
4. **Backfill em staging:** dry-run (sem chamada à Mapbox, L-F01-05) → revisar os incompatíveis (inclui estado por extenso/país ≠ AU, L-F01-01) → conferir a prova positiva do modo permanente da staging no checklist da X02 (D19) → `--apply` → anexar os dois relatórios.
5. **Prod:** promover `staging → main` com as **duas** tarefas juntas, dentro da janela (a partir de 09:00 Brasil). Smoke igual ao da staging.
6. **Backfill em prod:** dry-run → anexar o relatório → calcular `estimatedRequests × US$ 0,005` com o preço vigente (acima de US$ 200, aval do dev) e conferir a prova positiva de prod no checklist da X02 (D19) → `--apply`.
7. **Rollback:**
   - código: reverter TASK-F01-1 **e** TASK-F01-2 juntas. Só reverter o web deixa a criação quebrada (400); só reverter o backend deixa o web enviando um `address` que vira `Json` livre, o que funciona;
   - colunas: ficam (expand), sem dano;
   - backfill: sem rollback, porque só preenche coords. O relatório lista os ids.
8. **Dev local sem Mapbox:** toda base fica sem coords e o banner variante 2 aparece. É esperado. O dry-run do backfill roda normalmente (L-F01-05); o `--apply` aborta.
9. **Rate limit:** depois do deploy em staging, conferir que o 429 do `app-state` é por usuário (dois inspetores no mesmo Wi-Fi) (L-F01-06).

### Fora do escopo
- Base do dia e roteiro (F04).
- Preferência de SMS ou por tipo de aviso.
- Tabela de instalações por dispositivo.
- Dashboard de adoção.
- Mover a porta de geocodificação.
- Normalizar shapes legados de `address`.
- Novo formatador de endereço.
- Alterar o `/v1/me`.
- Response schema para `/v1/inspectors/me`.

### Critérios de aceite
1. `POST /v1/inspectors` sem `address` → 400. Com `address` → 201, com `baseLat/baseLng` quando a Mapbox resolve (00.A5 parcial).
2. Nenhum update aceita `address: null`. Lat/lng do cliente são descartados sem erro e nunca gravados.
3. Toda geocodificação de base usa `formatGeocodingQuery` + `geocodeWithTimeout` com `{ mode: 'permanent' }` e `GEOCODE_SYNC_TIMEOUT_MS` (TASK-X02-1), sem formatador nem timeout duplicados (provado por spy).
4. Uma falha salva o endereço com coords nulas e devolve `baseGeocodeFailed: true`.
5. CL_ADMIN/CL_USER não recebem `address`, coords nem adoção. AM/OP recebem tudo. INSP recebe base/coords.
6. O heartbeat grava os 4 campos pelas regras acima. `app_installed_at` nunca é sobrescrito.
7. O backfill é idempotente, tem throttle e CAS, aborta sem Mapbox ou sem o modo permanente, e emite o relatório.
8. Api-types regenerados e commitados. `/v1/me` inalterado.
9. `inspectorBaseAddressSchema` rejeita base só com espaços, estado fora de `AU_STATES`, postcode ≠ 4 dígitos e país ≠ AU; normaliza trim/caixa (L-F01-01).
10. O heartbeat é uma única instrução SQL; o caso concorrente está provado na suíte db (L-F01-02).
11. `BASE_CHANGED` emitido após toda gravação/troca de base (create, update, self-update, backfill), nunca no "mesmo endereço" (L-F01-03).
12. Dry-run do backfill não chama a Mapbox; `JsonNull`/`DbNull` fora da seleção (L-F01-05). O relatório traz `estimatedRequests` (D19).
16. "Mesmo endereço" usa `isSameGeocodingAddress` da X02, igual à filial (D18).
13. Rate limit de 10/min por usuário em `app-state` e `PATCH /me` (L-F01-06).
14. A lista devolve `address` para AM/OP (L-F01-07).
15. Nenhum audit de inspetor grava `baseLat/baseLng` (L-F01-10). O create geocodifica antes de qualquer escrita (L-F01-11).

### Dependências
- **TASK-X02-1:** porta com `{ mode }`, `MapboxPermanentGeocodingUnavailableError`, `branchAddressSchema` sem lat/lng, `formatGeocodingQuery`/`isSameGeocodingAddress`/`GeocodableAddress` (`shared/domain/geocoding-address.ts`), `geocodeWithTimeout`/`GEOCODE_SYNC_TIMEOUT_MS`/`GeocodeTimeoutError` (`property/application/services/geocode-with-timeout.ts`).
- **Bloqueia** TASK-F01-2 e TASK-F01-3.

### Riscos e armadilhas
- **`meResponseSchema` remove campos não declarados.** Nada desta feature vai para `/v1/me`; o PWA lê de `/v1/inspectors/me`.
- **`/v1/inspectors/me` (GET e PATCH) não tem response schema:** o que o use case devolve sai cru. Por isso a visibilidade é aplicada no use case, não no schema. Não criar um schema nesta tarefa, porque precisaria cobrir tudo o que o PWA lê (`useInspectorMe.ts`).
- **`inspectorResponseSchema` serializa list/get/create/update** e remove o que não estiver declarado, então os campos novos **precisam** estar nele (memória "strip undeclared"). Todos `.optional()`: um campo obrigatório ausente faz o serializer lançar (memória "serializer throws").
- **Dependência nova no construtor** quebra wirings de teste não tipados (memória). Procurar com grep `new CreateInspectorUseCase(`, `new UpdateInspectorUseCase(` e `new UpdateInspectorSelfProfileUseCase(` em `src` e `tests`.
- **`Decimal` do Prisma** chega como objeto. Converter no repositório, ou o JSON sai como string.
- **Build do shared** antes de backend/web/PWA consumirem. **Regenerar api-types** (`generate:openapi` → `generate:types`) e commitar.
- **A mudança de privacidade é visível:** qualquer integração que dependa do `address` para CL quebra. Hoje não há consumidor (verificado em web e PWA).
- **`keyGenerator` antes da autenticação (L-F01-06):** o rate limit roda em `onRequest` por padrão, antes do `authenticate` (`preHandler`), e aí `authContext` ainda é `undefined` → a chave cai no IP sem erro. Usar `hook: 'preHandler'` no `config.rateLimit` da rota (suportado pelo `@fastify/rate-limit` ^9) e provar com o teste "dois usuários no mesmo IP".
- **`$executeRaw` (L-F01-02):** tagged template (nunca `$executeRawUnsafe`), casts explícitos; a coluna `id` é `text`.
- **Schema AU mais estrito que o de filial (L-F01-01):** o web atual manda State/Country livres; a TASK-F01-2 troca por select. Deploy acoplado (D14) cobre a janela.

### Dias · Branch · Verificação
- **Dias:** 3,0 (0,25 + 0,25 + 0,5 + 0,25 + 0,25 + 0,25 + 0,5 + 0,25 + 0,5).
- **Branch:** `feat/f01-inspector-base-address-backend` a partir de `develop`; PR para `develop`.
- **Verificação:** `pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared build`; `pnpm --filter backend lint typecheck test`, mais as suítes de integração e db (via subagente); dry-run da migration; menos de 150 arquivos.

---

## TASK-F01-2 · Web: endereço-base no cadastro + adoção do app na tabela e no detalhe

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F01-1
> - **Desbloqueia:** TASK-F02-2
> - **Pode rodar em paralelo com:** TASK-F03-2, TASK-F01-3, TASK-F02-1
> - **Pista sugerida (time de 6):** D · Web

### Objetivo
- A OP/AM cadastra e troca o endereço-base com autocomplete, sem poder removê-lo.
- A lista mostra quem instalou o app, quem tem push e o último acesso, e filtra quem está sem base.
- O detalhe mostra "Base address" e "App adoption".

### Contexto no código
- **Rota:** `/inspectors` é só AM/OP (`apps/web/src/app/router.tsx:373-375`). CL nunca vê estas telas, então não há variação de UI por papel.
- **Drawer** (`apps/web/src/features/inspectors/components/InspectorFormDrawer.tsx`):
  - campos: Name, Email, Phone, Password, Confirm Password, Service Regions, Service Types, Full Name, ABN, Date of Birth, documentos, Blocked Agencies, Status. **Sem endereço**;
  - salva via `hooks/useInspectorSave.ts`, que importa `createInspectorSchema`.
- **Autocomplete:**
  - `apps/web/src/components/forms/AddressLookupInput.tsx` (props `label, valueLabel, onSelect, onClear, placeholder, ariaLabel, disabled, country`), via `features/properties/hooks/useAddressSuggestions.ts` → `GET /v1/address/suggestions` (qualquer autenticado; 30/min);
  - padrão a seguir: `features/tenants/components/BranchFormDrawer.tsx:174-230` (lookup + campos Street/Suburb/Postcode/State/Country editáveis);
  - após a X02, `useBranchSave.ts` não envia coords e usa `city = suburb`;
  - helpers em `apps/web/src/lib/address.ts` (`buildAddressLabel`, `formatAddressLabel`, `toAddressSuggestion`).
- **Tabela:** `components/InspectorTable.tsx`. Colunas `name, email, phone, status, regionsCount, serviceTypesCount, ratingAvg, completedCount, actions`; ordenação client-side.
- **Filtros e página:** `components/InspectorFilters.tsx` + `hooks/useInspectorList.ts`; página `pages/InspectorListPage.tsx`.
- **Detalhe:** `components/InspectorDetailSections.tsx`, com seções `FormSection` Rating, Personal Details, Insurance & Police Check, Coverage, Workload e Record.
- **Testes existentes:**
  - `components/InspectorFormDrawer.test.tsx`, `components/InspectorTable.test.tsx`, `components/InspectorFilters.test.tsx`;
  - `components/__tests__/InspectorDetailSections.test.tsx` e `components/InspectorDetailSections.test.tsx` (existem os dois);
  - `hooks/useInspectorSave.test.ts`, `hooks/useInspectorList.test.ts`, `pages/InspectorListPage.test.tsx`;
  - e2e em `apps/web/tests/e2e/`, sem spec de inspetores.

### Decisões aplicáveis
D1, D2 (lado web: badge e filtro "No base address", variante pelo par `address`/`baseLat`), D3, D4 (o web não monta texto de geocode), D5, D6 (o web não envia coords), D9 (coluna Push), D10, D14 (de 2026-10-27); D15, D16 (de 2026-10-29).

Regras de 2026-10-29 (lacunas aceitas):
- **L-F01-01 · Mesmas regras AU do PWA:** State vira select com `AU_STATES` (shared); Country fica oculto e é enviado `'AU'`; Postcode exige 4 dígitos. Ao selecionar uma sugestão, o estado é mapeado para o código (`short_code` da Mapbox, ou nome por extenso → código via mapa `AU_STATE_NAME_TO_CODE`); sem correspondência, o select fica vazio e obrigatório.
- **L-F01-07 · Tooltip do badge:** decidido pelo `address` que a lista agora devolve para AM/OP.
- **L-F01-08 · Último aparelho:** Push, App version e Last seen são "do último aparelho que reportou"; "Installed" é de qualquer aparelho (D16).
- **L-F01-09 · Atraso do Last seen:** o valor pode estar até 6 h atrasado (throttle do PWA); o tooltip diz isso.

### Contratos consumidos
Todos da TASK-F01-1:
- `POST /v1/inspectors` (`address` obrigatório) e `PATCH /v1/inspectors/:id` (`address` opcional, não-nullable), com `baseGeocodeFailed` na resposta;
- `GET /v1/inspectors?missingBaseAddress=true`;
- `GET /v1/inspectors/:id` com `address, baseLat, baseLng, baseGeocodedAt, appInstalledAt, appLastSeenAt, pushEnabled, appVersion`;
- tipos de `packages/shared/src/api-types.ts`, via client tipado e sem `as any` (memória WEB-10).

### UI por tela

**1. InspectorFormDrawer: seção "Base address"** (depois de Phone)
- **Campos:**
  - `AddressLookupInput` (label "Base address", placeholder "Search verified address", `ariaLabel="Base address"`, `country="AU"`);
  - após a seleção, campos editáveis: Street, Number, Unit (`complement`), Suburb, Postcode e State (select `AU_STATES`: NSW/VIC/QLD/WA/SA/TAS/ACT/NT). Country **não aparece** e é enviado `'AU'` (L-F01-01);
  - mapeamento do estado da sugestão (L-F01-01): a `mapbox-address-lookup.service.ts:41-43` devolve o código só quando há `short_code`; sem ele, o nome por extenso. O web aplica `AU_STATE_NAME_TO_CODE` (`'New South Wales'→'NSW'`, …, case-insensitive) em `apps/web/src/lib/address.ts`; sem correspondência, o select fica vazio;
  - `city` não aparece e recebe `suburb` no submit;
  - as coordenadas da sugestão nunca são enviadas.
- **Validação:**
  - criação, sem base: "Base address is required", com foco no lookup;
  - após a seleção: "Street is required", "Suburb is required", "Postcode is required", "Select a state" (L-F01-01);
  - Postcode: "Postcode must be 4 digits" (L-F01-01);
  - sem campo Country (sempre `'AU'`);
  - limites do schema shared, com as mensagens padrão do formulário.
- **Edição:**
  - pré-preenche via `toAddressSuggestion` quando o shape é compatível (parseia com `inspectorBaseAddressSchema`);
  - o `onClear` só limpa a busca e restaura o valor salvo. Não há "Remove";
  - ajuda: "The base address can be changed but not removed.";
  - legado incompatível (inclui estado por extenso ou país ≠ AU, L-F01-01): texto cru via `formatAddressLabel` + aviso "This address is incomplete. Search and select it again.";
  - sem alteração, `address` não vai no PATCH.
- **Estados:**
  - loading: o lookup já tem; Save desabilitado com spinner durante o submit;
  - sucesso: snackbar "Inspector saved";
  - `baseGeocodeFailed: true`: snackbar warning "Saved, but we couldn't locate this address. Check it and try again.";
  - `address` presente com `baseLat` nulo: alerta inline "We couldn't locate this address — please check it" (`role="status"`);
  - 400: `details` mapeado para os campos; outros erros vão para o snackbar genérico.
- **Acessibilidade:**
  - `aria-required` no lookup durante a criação;
  - erros via `aria-describedby` (`FormField`);
  - ordem de tab natural;
  - dropdown navegável por teclado (memória "teclado widgets").

**2. InspectorTable + filtros**
- **Colunas novas** (depois de `status`, ordenáveis client-side, nulos no fim):
  - **App**: "Installed" (tooltip "Installed on {date} (any device)", L-F01-08) / "—" (tooltip "Not installed").
  - **Push**: "On" (success) / "Off" (muted) / "—" (tooltip "No data yet"). O tooltip de On/Off diz "Browser notification permission on the last device seen" (D9, L-F01-08).
  - **Last seen**: relativo ("3 h ago"), com tooltip "Last reported {date time} (Sydney) · reported at most every 6 h" em Australia/Sydney (memória "Sydney only"; L-F01-09). "Never" quando nulo; "Just now" para data no futuro.
- **Badge** "No base address" (warning) ao lado do nome quando `baseLat` é nulo. Tooltip: "Missing base address" (`address` nulo) ou "Address could not be located" (`address` presente). O `address` vem no item da lista para AM/OP (L-F01-07); nenhum `GET` por linha.
- **Filtro:** toggle "No base address" em `InspectorFilters` → `missingBaseAddress=true`.
- **Empty state** com o filtro: "No inspectors without a base address." Loading e erro seguem a página.
- **Acessibilidade:** badges com texto, não só cor; tooltip do primitivo existente; cabeçalhos ordenáveis no `<th>` do DataTable.

**3. InspectorDetailSections**
- **"Base address"** (depois de Personal Details):
  - endereço formatado, ou "Not set";
  - "Location": "Located · Updated {date}" (`baseGeocodedAt`) ou "Could not be located" (warning);
  - coordenadas cruas nunca aparecem (memória "no raw ids").
- **"App adoption"** (depois de Workload):
  - "Installed": data, ou "Not installed";
  - "Push notifications": "On" / "Off" / "No data yet";
  - "Last seen": relativo + absoluto, ou "Never"; tooltip "Last reported {date time} (Sydney) · reported at most every 6 h" (L-F01-09);
  - "App version": valor como vem (ex.: `0.1.0+ab12cd3`, L-F01-04), ou "—"; legenda "Last device seen" junto de Push e App version (L-F01-08).
- Inspetor que nunca abriu o app → todos os fallbacks, com a seção visível.

### Casos de borda
1. Sugestão sem postcode → campo vazio e obrigatório; o submit é bloqueado.
2. Edição de outro campo com `address` legado incompatível → PATCH sem `address` passa; o aviso continua.
3. Clear na edição → restaura; nunca envia `null`.
4. Geocodificação falhada → aviso; o badge aparece após o refetch.
5. API sem os campos novos (deploy fora de ordem) → colunas com "—", sem quebrar (campos opcionais).
6. Sugestão com `state:'New South Wales'` (sem `short_code`) → select em `NSW`. Sugestão com estado sem correspondência → select vazio, "Select a state" no submit (L-F01-01).
7. Edição de inspetor com legado `state:'New South Wales'` → aviso de incompleto; o PATCH de outro campo segue sem `address` (L-F01-01).
8. Item da lista sem `address` (API antiga) → tooltip "Missing base address" como fallback (L-F01-07).
9. Inspetor desativado (`pushEnabled:false`; depois da F02, assinaturas revogadas `DEACTIVATED`, F02 D27) → Push "Off" na tabela e "Off" no detalhe; o web só renderiza o campo (L-F02-11).

### Testes primeiro (TDD)

**Unit (Vitest + RTL)**

`components/InspectorFormDrawer.test.tsx`:

| Caso | Ação | Esperado |
|---|---|---|
| criação sem base | preencher o resto, Save | "Base address is required"; mutate não chamado |
| seleção | escolher sugestão "1 George St…" | Street/Suburb/Postcode/State preenchidos |
| estado por extenso (L-F01-01) | sugestão `state:'New South Wales'` | select = `NSW` |
| estado desconhecido | sugestão `state:'Auckland'` | select vazio; Save → "Select a state" |
| postcode (L-F01-01) | `'200'` | "Postcode must be 4 digits"; mutate não chamado |
| sem Country | criação | nenhum campo "Country" no DOM |
| payload | Save | `address:{street,suburb,city:suburb,state:'NSW',postcode,country:'AU'}`, **sem** `latitude/longitude` |
| edição sem mexer | mudar Phone, Save | body sem `address` |
| clear na edição | clear | valor salvo restaurado; body sem `address:null` |
| sem remover | edição | nenhum controle "Remove" |
| legado | `address:{foo:'x'}` | "This address is incomplete…" |
| geocode falho | resposta `baseGeocodeFailed:true` | snackbar warning com o texto |
| sem coords | `address` válido, `baseLat:null` | alerta inline `role=status` |

- `hooks/useInspectorSave.test.ts`: create envia `address`; update omite quando inalterado; repassa `baseGeocodeFailed`.
- `components/InspectorTable.test.tsx`:
  - "Installed" / "—"; "On" / "Off" / "—"; "Never"; "Just now";
  - inspetor desativado com `pushEnabled:false` → Push "Off" (L-F02-11);
  - Last seen relativo com tooltip absoluto Sydney (TZ do teste fixada fora de Sydney; memória "TZ pin");
  - badge com os 2 tooltips, decididos pelo `address` do item da lista (L-F01-07);
  - tooltip de Push "Browser notification permission on the last device seen" e de App "Installed on {date} (any device)" (L-F01-08);
  - tooltip de Last seen com "reported at most every 6 h" (L-F01-09);
  - ordenação com nulos no fim.
- `components/InspectorFilters.test.tsx`: o toggle chama `onFiltersChange({missingBaseAddress:true})`.
- `hooks/useInspectorList.test.ts`: o filtro vira `?missingBaseAddress=true`; ausente quando falso.
- `components/__tests__/InspectorDetailSections.test.tsx`:
  - "Base address" com "Located" / "Could not be located" / "Not set";
  - "App adoption" com valores e fallbacks; inspetor desativado com `pushEnabled:false` → "Push notifications: Off" (L-F02-11); App version `0.1.0+ab12cd3` exibido como vem; legenda "Last device seen" (L-F01-04, L-F01-08);
  - nenhuma coordenada no DOM.
- `pages/InspectorListPage.test.tsx`: empty state do filtro.
- `apps/web/src/lib/address.test.ts`: `AU_STATE_NAME_TO_CODE` — `'new south wales'→'NSW'`, `'NSW'→'NSW'`, `'Auckland'→undefined` (L-F01-01).

**E2E (Playwright)** `apps/web/tests/e2e/inspector-base-address.spec.ts` (novo; API mockada ou backend local com geocoder fake):
1. "New inspector" sem base → erro visível.
2. Selecionar o endereço e salvar → no detalhe, "Base address" com "Located".
3. Filtro "No base address" lista só os inspetores sem coords.

### Escopo / Passos
- [ ] **1. Drawer: seção Base address.**
  - Camada: web. Dias: 0,75 (era 0,5; +0,25 pelo select de estado AU, mapeamento nome→código e Country oculto, L-F01-01).
  - Modify: `apps/web/src/features/inspectors/components/InspectorFormDrawer.tsx`, `apps/web/src/features/inspectors/hooks/useInspectorSave.ts`, `apps/web/src/features/inspectors/types/*`, `apps/web/src/lib/address.ts` (`AU_STATE_NAME_TO_CODE`).
- [ ] **2. Tabela + filtro.**
  - Camada: web. Dias: 0,25.
  - Modify: `components/InspectorTable.tsx`, `components/InspectorFilters.tsx`, `hooks/useInspectorList.ts`, `types/*`.
  - A formatação relativa/absoluta fica dentro de `InspectorTable.tsx`, reusando o helper de data em Sydney existente em `apps/web/src/lib`.
  - Tooltips de último aparelho e de atraso de 6 h (L-F01-08, L-F01-09); tooltip do badge pelo `address` da lista (L-F01-07).
- [ ] **3. Detalhe + e2e + validação no browser.**
  - Camada: web. Dias: 0,25.
  - Modify: `components/InspectorDetailSections.tsx`.
  - Novo: `apps/web/tests/e2e/inspector-base-address.spec.ts`.

### Auditoria e observabilidade
- A auditoria é do backend (TASK-F01-1). O web não loga nada novo.

### Deploy, rollout e rollback
1. Mergear em `develop` logo depois da TASK-F01-1. A promoção a staging só acontece com **as duas** em `develop` (D14).
2. Staging e prod: promovidas **na mesma promoção** da TASK-F01-1, com o smoke da TASK-F01-1 (passos 3 e 5) cobrindo a criação pelo web.
3. Rollback: reverter junto com a TASK-F01-1 (ver lá).

### Fora do escopo
- Base do dia (F04).
- Pin da base no mapa.
- Dashboard de adoção.
- Alterar telas de dashboard existentes.
- Exibir coordenadas.

### Critérios de aceite
1. Não é possível criar inspetor sem base. É possível trocar, e não é possível remover.
2. O payload nunca leva coords e sempre leva `city = suburb`, `country = 'AU'` e `state` ∈ `AU_STATES` (L-F01-01).
3. A tabela mostra App/Push/Last seen e o badge, e filtra "No base address".
4. O detalhe mostra "Base address" e "App adoption", com fallbacks.
5. Lint `--max-warnings 0`, typecheck e testes verdes; e2e verde; validado no browser contra o backend local.
6. Tooltips dizem "last device seen" (Push), "any device" (App) e "reported at most every 6 h" (Last seen) (L-F01-08, L-F01-09).

### Dependências
- TASK-F01-1 mergeada (api-types regenerados, shared buildado).
- Ordem de merge com a TASK-F05-3: ela acrescenta `?open=<id>` ao `InspectorListPage` (abre o drawer pela URL) e o estado "This inspector no longer exists." no `InspectorDetailDrawer`. Quem mergear depois faz rebase e mantém as duas mudanças (L-F05-14).

### Riscos e armadilhas
- **Build do shared** antes do typecheck web. O cache incremental do typecheck web pode mentir (memória); limpar `tsbuildinfo` se o resultado parecer errado.
- O `onClear` do Branch zera o endereço; aqui ele restaura. Não copiar o comportamento.
- `findBy` corre contra transição de estado (memória): esperar o estado final.
- `/v1/me` não é usado.
- **Conflito com a F05-3 (L-F05-14):** `InspectorListPage.tsx` (filtro "No base address" aqui; `?open=<id>` lá) e `InspectorDetailDrawer`/`InspectorDetailSections` (seções novas aqui; estado "This inspector no longer exists." lá) são tocados pelas duas. Não remover o estado local do drawer nem o parâmetro de URL no rebase; rodar os testes da página das duas tarefas.

### Dias · Branch · Verificação
- **Dias:** 1,25 (0,75 + 0,25 + 0,25).
- **Branch:** `feat/f01-inspector-base-address-web` a partir de `develop`, depois da TASK-F01-1.
- **Verificação:** `pnpm --filter @properfy/shared build && pnpm --filter web lint typecheck test`; Playwright do spec novo; QA no browser com o backend local.

---

## TASK-F01-3 · PWA: endereço-base, banner, heartbeat, slot de push + QA

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F01-1
> - **Dependência parcial:** TASK-F01-2: só para o QA ponta a ponta.
> - **Desbloqueia:** TASK-F02-3, TASK-F04-3, TASK-F04-3b
> - **Pode rodar em paralelo com:** TASK-F03-2, TASK-F01-2, TASK-F02-1, TASK-F03-3, TASK-F03-4, TASK-F04-1, TASK-F09-1
> - **Pista sugerida (time de 6):** C · PWA

### Objetivo
- O inspetor preenche e edita o endereço-base no perfil.
- Enquanto não houver coordenadas, vê um banner fixo de 2 variantes na home e no perfil.
- O app reporta instalação, permissão de push, último acesso e versão (6 h por dispositivo).
- O lugar do controle de push fica reservado para a F02.
- Smoke completo da F01.

### Contexto no código
- **Router:** `apps/pwa/src/app/router.tsx`.
  - Home: `/` → `/schedule` (l. 151-152);
  - `profile` com sub-rotas `availability|documents|account|settings` (l. 173-182);
  - tudo dentro de `PwaLayout` (`components/shell/PwaLayout.tsx`: `Outlet` + `BottomNavBar`), sob `ProtectedRoute` + `InspectorAuthGuard`.
- **Perfil:**
  - `features/profile/pages/ProfilePage.tsx`: grade de tiles (#1298);
  - `ProfileAccountPage.tsx`: TopBar "My account", cards Avatar, Phone + Timezone (fuso via `PATCH /v1/me`), Security e "More";
  - `ProfileSettingsPage.tsx`: TopBar "App settings", `InstallAppCard` e o texto fixo "Properfy Inspector v1.0".
- **Hooks:**
  - `features/profile/hooks/useInspectorMe.ts`: `GET /v1/inspectors/me`, key `['inspector','me',userId]`, staleTime 5 min. O tipo não tem endereço;
  - `useUpdateInspectorSelf.ts`: `PATCH /v1/inspectors/me`, tipo só com `phone`; invalida `['inspector']`.
- **Instalação:** `apps/pwa/src/app/useInstallPrompt.tsx`. `getIsStandalone()` (l. 16) **não é exportada**; `getIsIosSafariEligible` é. Os banners de instalação ficam em `features/schedule/pages/SchedulePage.tsx:165`.
- **Versão:** `apps/pwa/package.json` tem `"version": "0.1.0"` desde `66f9a142` (único commit que tocou o campo; sem processo de bump); `apps/pwa/vite.config.ts` não tem `define`. O PWA é buildado em `.github/workflows/frontend-deploy.yml` (job em matriz `matrix.app`, três ambientes: dev l. 63-66, staging l. 111-114, prod l. 158-161), com `env` por ambiente; não há Dockerfile do PWA.
- **API:** `apps/pwa/src/services/api` (openapi-fetch); `hooks/useApiQuery.ts`; `lib/auth-storage.ts`.
- **Testes:**
  - `features/profile/pages/__tests__/{ProfilePage,ProfileAccountPage,ProfileSettingsPage}.test.tsx`;
  - `features/profile/hooks/__tests__/useUpdateInspectorSelf.test.ts`;
  - `app/__tests__/useInstallPrompt.test.tsx`;
  - `components/shell/__tests__/PwaLayout.test.tsx`;
  - `features/schedule/pages/__tests__/*`;
  - e2e em `apps/pwa/tests/e2e/`, quebrado no repo (memória: 56/56 falhando).

### Decisões aplicáveis
D1 (nada bloqueia), D2 (textos e regra exatos), D3, D4, D6, D8 (só o slot), D9, D10 (os `InstallBanner*` e o `InstallAppCard` ficam como estão), D11, D12 (de 2026-10-27; D12 revisada em 2026-10-29); D15, D16 (de 2026-10-29).

Regras de 2026-10-29 (lacunas aceitas):
- **L-F01-01 · Schema único:** o card usa `inspectorBaseAddressSchema` (regras AU + trim) direto; os 4 dígitos e o estado AU agora valem também na API. O select de estado usa `AU_STATES` do shared.
- **L-F01-04 · Versão com SHA:** ``__APP_VERSION__ = `${pkg.version}+${(process.env.APP_BUILD_SHA ?? 'dev').slice(0, 7)}` ``; o CI injeta `APP_BUILD_SHA: ${{ github.sha }}` no build do PWA nos três ambientes. O rodapé mostra `v0.1.0+ab12cd3`; local, `v0.1.0+dev`.
- **L-F01-08 · Vários aparelhos (esperado, não bug):** Android Chrome compartilha `localStorage` entre aba e app instalado, então alternar aba ↔ app dispara um POST a cada troca de `displayMode`; iOS isola o storage do app da tela inicial do Safari (throttle e logout independentes); iOS < 16.4 instalado → `unsupported`; navegadores embutidos (Gmail, Instagram) → `browser`; Chrome desktop instalado e Safari macOS "Add to Dock" contam como `standalone`.
- **L-F01-12 · Ordem em `/profile/settings`:** slot de push primeiro, depois `InstallAppCard`, rodapé de versão por último.

### Contratos consumidos
Todos da TASK-F01-1:
- `GET /v1/inspectors/me` → `address, baseLat, baseLng, baseGeocodedAt`;
- `PATCH /v1/inspectors/me {address}` → `{inspectorId, baseGeocodeFailed?}` (400 `VALIDATION_ERROR` com `details`);
- `POST /v1/inspectors/me/app-state {displayMode, pushPermission, appVersion}` → 204 (429 em excesso).

### UI por tela

**1. `/profile/account`: card "Base address"** (inline em `ProfileAccountPage.tsx`, depois de Phone + Timezone, antes de Security; `id="base-address"`)
- **Cabeçalho:** "BASE ADDRESS", no estilo do label "Phone". Subtexto: "Where your day starts. Used to plan your route."
- **Campos** (react-hook-form + zod com `inspectorBaseAddressSchema`; `city` derivado):
  - Street (obrigatório, `autocomplete="address-line1"`);
  - Number;
  - Unit (`complement`, `autocomplete="address-line2"`);
  - Suburb (obrigatório, `autocomplete="address-level2"`);
  - State (obrigatório; select NSW/VIC/QLD/WA/SA/TAS/ACT/NT; `autocomplete="address-level1"`);
  - Postcode (obrigatório, `inputMode="numeric"`, `autocomplete="postal-code"`);
  - Country "AU" (oculto, enviado).
- **Validação:** "Street is required", "Suburb is required", "Select a state", "Postcode is required", "Postcode must be 4 digits". Campos só com espaços contam como vazios (trim). As mesmas regras valem no schema shared e na API (L-F01-01); um 400 com `details` mapeia para os campos.
- **Pré-preenchimento:** a partir de `address` que parseia com `inspectorBaseAddressSchema`. Legado incompatível (inclui `state` por extenso como `"New South Wales"` ou país ≠ AU gravado pelo web antigo, L-F01-01) → campos vazios + "Your saved address is incomplete. Please enter it again." + o valor cru como referência.
- **"Save address":** aparece quando o formulário está dirty (padrão do Phone).
- **Estados:**
  - salvando: botão desabilitado, "Saving…";
  - sucesso com coords: "Saved successfully" (`text-success`);
  - `baseGeocodeFailed`: "Saved, but we couldn't locate this address. Please check it." (`text-warning`);
  - erro: mensagem da API, ou "Failed to update profile";
  - carregando: skeleton do card;
  - erro de carga: "Couldn't load your address." + "Retry".
- **Acessibilidade:**
  - labels visíveis;
  - `aria-describedby` nos erros;
  - resultados em `role="status"` (`aria-live="polite"`);
  - alvos ≥44 px;
  - com hash `#base-address`: rola até o card e foca o primeiro campo vazio.

**2. `BaseAddressBanner`** (home `/schedule` e `/profile`)
- **Condição:** `useInspectorMe` carregado e `baseLat == null`. Não aparece em loading nem em erro.
- **Variante 1** (`address == null`): título "Add your base address". Corpo "We use it as the starting point for your day." Link "Add address" → `/profile/account#base-address`.
- **Variante 2** (`address != null`, `baseLat == null`): título "We couldn't locate your base address — please check it". Link "Check address" → mesmo destino.
- **Comportamento:** não dispensável (sem X); não bloqueia nada; some sozinho após um save com coords (a invalidação de `['inspector']` refaz o GET).
- **Posição:**
  - Schedule: abaixo do TopBar, acima dos banners de instalação;
  - Profile: topo da grade;
  - rola com o conteúdo (não é sticky).
- **Visual:** token `warning`, ícone de pin, contraste AA.
- **Acessibilidade:** `role="status"`; `<Link>` com texto descritivo; foco visível.

**3. `/profile/settings`**
- Ordem do conteúdo (L-F01-12): (1) container vazio `<div data-testid="push-preference-slot" />`, **primeiro filho** do conteúdo, sem título nem conteúdo visível — a F02 preenche (D8); (2) `InstallAppCard`; (3) rodapé, **último**.
- Rodapé: `Properfy Inspector v{__APP_VERSION__}` no lugar de "v1.0" (ex.: `Properfy Inspector v0.1.0+ab12cd3`, L-F01-04).

### Regras do heartbeat (cliente)
- **Hook:** `useAppStateHeartbeat()` em `apps/pwa/src/app/useAppStateHeartbeat.ts`, chamado em `PwaLayout` (só INSP autenticado).
- **Gatilhos:** mount e `visibilitychange` → `visible`. Ambos passam pelo throttle.
- **Throttle (6 h por dispositivo):**
  - chave `localStorage` `properfy.pwa.appStateHeartbeat` = `{ at: epochMs, displayMode }` do último envio **com 204**;
  - envia se `now - at ≥ 6 h` **ou** se o `displayMode` atual for diferente do salvo. O segundo caso registra na hora a primeira abertura instalada;
  - erro de rede ou 5xx: não grava; tenta no próximo gatilho;
  - 429: grava, para não insistir;
  - storage em try/catch. Sem storage, no máximo 1 envio por carga do app (flag de módulo);
  - logout (`lib/auth-storage.ts`) remove a chave, então o próximo inspetor no aparelho envia na hora.
- **Valores:**
  - `displayMode`: `'standalone'` se `getIsStandalone()` (passa a ser exportada: `matchMedia('(display-mode: standalone)')` ou `navigator.standalone`); senão `'browser'`;
  - `pushPermission`: `'unsupported'` se `!('Notification' in window)`; senão `Notification.permission`;
  - `appVersion`: `__APP_VERSION__`.
- **Primeiro standalone:** o cliente informa o `displayMode`; o servidor grava `app_installed_at` no primeiro `standalone` (`COALESCE`), de qualquer aparelho (D16).
- **Vários aparelhos (L-F01-08):** cada aparelho tem seu throttle; o servidor guarda só o último estado (D16). Os casos de "Regras de 2026-10-29" acima são esperados.
- **Erros:** silenciosos (`console.debug` em dev); nenhum efeito na UI.
- **`__APP_VERSION__` (L-F01-04):** em `apps/pwa/vite.config.ts`, ``define: { __APP_VERSION__: JSON.stringify(buildAppVersion(pkg.version, process.env.APP_BUILD_SHA)) }`` (com `buildAppVersion` = `` `${pkgVersion}+${(sha ?? 'dev').slice(0, 7)}` ``), com `pkg` lido do `package.json` via `readFileSync`. `.github/workflows/frontend-deploy.yml` ganha `APP_BUILD_SHA: ${{ github.sha }}` no `env` dos três steps "Build" (inofensivo para o web, que não lê a variável). O sufixo soma 8 caracteres (`+` + 7), dentro do `max(40)`. `pkg.version` só sobe em release (memória "Release major"). Declaração `declare const __APP_VERSION__: string;` em `apps/pwa/src/vite-env.d.ts`. O mesmo `define` vale para o Vitest (config compartilhado; se houver `vitest.config` separado, replicar).

### Casos de borda
1. Com coords → nenhum banner.
2. Endereço não localizado → aviso no card; o banner muda para a variante 2.
3. Legado incompatível → variante 2; formulário vazio com o texto de incompleto.
4. Offline ao salvar → "Failed to update profile"; os dados do formulário são mantidos.
5. iOS Safari fora do standalone → `browser` + `unsupported`. Continua assim depois da F02: a precedência D21 da F02 (`ios-needs-install` antes de `unsupported`) vale só para o estado do controle, não para o `pushPermission` do heartbeat (L-F02-05).
6. App instalado aberto 1 h depois de um heartbeat `browser` → envio imediato.
7. Storage indisponível → no máximo 1 envio por carga.
8. Troca de inspetor no aparelho → heartbeat imediato.
9. Deep link `#base-address` → rola e foca.
10. Android Chrome: alternar aba do navegador ↔ app instalado → um POST a cada troca de `displayMode` (storage compartilhado). Esperado (L-F01-08).
11. iOS: app da tela inicial e Safari têm storages isolados; logout em um não limpa a chave do outro. iOS < 16.4 instalado → `unsupported`. Navegador embutido (Gmail/Instagram) → `browser` (L-F01-08).
12. Chrome desktop instalado ou Safari macOS "Add to Dock" → `standalone`; o web mostra "Installed" (any device) (L-F01-08, D16).
13. Endereço salvo pelo web antigo com `state:'New South Wales'` → formulário vazio com o texto de incompleto; banner variante 2 (L-F01-01).
14. Build local sem `APP_BUILD_SHA` → rodapé `v0.1.0+dev` (L-F01-04).

### Testes primeiro (TDD)

**Unit (Vitest + RTL)**

`features/profile/pages/__tests__/ProfileAccountPage.test.tsx`:

| Caso | Entrada | Esperado |
|---|---|---|
| com base | `address` válido + `baseLat` | campos pré-preenchidos, sem aviso |
| obrigatório | limpar Street, Save | "Street is required"; PATCH não chamado |
| postcode | `'20'` | "Postcode must be 4 digits" |
| só espaços (L-F01-01) | Street `'   '`, Save | "Street is required"; PATCH não chamado |
| legado por extenso (L-F01-01) | `address:{…,state:'New South Wales'}` | campos vazios + "Your saved address is incomplete…" |
| 400 da API | `details:[{path:['address','state'],message:'Select a state'}]` | erro no campo State |
| payload | Save | `{address:{street,number?,complement?,suburb,city:suburb,state,postcode,country:'AU'}}` |
| sucesso | 200 | "Saved successfully" em `role=status` |
| geocode falho | `baseGeocodeFailed:true` | texto warning |
| legado | `address:{foo:1}` | campos vazios + "Your saved address is incomplete…" |
| âncora | `#base-address` | foco no primeiro campo vazio |
| erro de carga | query em erro | "Couldn't load your address." + Retry |

- `features/profile/hooks/__tests__/useUpdateInspectorSelf.test.ts`: envia `address`; invalida `['inspector']`; propaga a mensagem da API; devolve `baseGeocodeFailed`.
- `features/profile/components/__tests__/BaseAddressBanner.test.tsx` (novo):

| Caso | `useInspectorMe` | Esperado |
|---|---|---|
| sem endereço | `address:null, baseLat:null` | "Add your base address" + link `/profile/account#base-address` |
| sem coords | `address:{…}, baseLat:null` | "We couldn't locate your base address — please check it" |
| ok | `baseLat:-33.8` | nada |
| loading / erro | — | nada |
| não dispensável | qualquer | sem botão de fechar; `role=status` |

- `features/profile/pages/__tests__/ProfilePage.test.tsx`: banner presente com `baseLat` nulo.
- `features/schedule/pages/__tests__/SchedulePage.banner.test.tsx` (novo): banner acima dos banners de instalação; a agenda segue interativa.
- `app/__tests__/useAppStateHeartbeat.test.tsx` (novo; storage e API injetados; fake timers; memória "jsdom localStorage"):

| Caso | Pré | Esperado |
|---|---|---|
| primeiro | storage vazio | POST `{displayMode:'browser',pushPermission:'default',appVersion:'test'}` |
| throttle | `at` há 1 h, mesmo modo | sem POST |
| expirado | `at` há 6 h + 1 ms | POST |
| mudança de modo | `browser` há 1 h, agora standalone | POST imediato com `standalone` |
| visibilidade | visible após 7 h | POST |
| rede falha | erro | storage não gravado; próximo gatilho reenvia |
| 429 | 429 | storage gravado |
| unsupported | sem `Notification` | `pushPermission:'unsupported'` |
| storage quebrado | `getItem` lança | 1 POST por carga, sem exceção |
| logout | chave removida | próximo mount envia |
| alternância com storage compartilhado (L-F01-08) | `standalone` → `browser` → `standalone`, todos em < 6 h | 3 POSTs, um por troca de modo |

- `app/__tests__/useInstallPrompt.test.tsx`: `getIsStandalone` exportada mantém o comportamento (matchMedia e `navigator.standalone`).
- `components/shell/__tests__/PwaLayout.test.tsx`: o hook é chamado uma vez por montagem.
- `features/profile/pages/__tests__/ProfileSettingsPage.test.tsx`: `push-preference-slot` existe e está vazio; ordem DOM slot → `InstallAppCard` → rodapé (`compareDocumentPosition`, L-F01-12); rodapé `Properfy Inspector v{__APP_VERSION__}`; `InstallAppCard` presente.
- `apps/pwa/src/app/__tests__/appVersion.test.ts` (novo; L-F01-04): a função que monta a versão (`buildAppVersion(pkgVersion, sha?)`, extraída para `apps/pwa/build/app-version.ts` e usada pelo `vite.config.ts`) → `('0.1.0','ab12cd3ef')` = `'0.1.0+ab12cd3'`; `('0.1.0', undefined)` = `'0.1.0+dev'`; resultado ≤ 40 caracteres.

**E2E:** a suíte do PWA está quebrada no repo e esta tarefa não a conserta. A cobertura ponta a ponta fica no smoke manual.

**Smoke manual (passo 5):** backend local com Mapbox, ou geocoder fake que resolve.
1. Web: OP cria inspetor sem base (bloqueado) e com base; detalhe "Located" (00.A5 parcial).
2. PWA iOS simulado (Safari):
   - inspetor sem base vê a variante 1 na Schedule e no Profile;
   - preenche e o banner some;
   - endereço inexistente → variante 2.
3. PWA instalado (Android emulador ou Chrome instalado): primeira abertura standalone → no web, "Installed", "Just now" e Push conforme a permissão.
4. Recarregar dentro de 6 h, **no mesmo modo** → nenhum POST novo (Network). Alternar aba ↔ app no Android gera um POST por troca: esperado (L-F01-08).
5. Web: o filtro "No base address" lista quem falta, com o tooltip certo por variante (L-F01-07).
6. `/profile/settings` (build de staging): versão `v{pkg.version}+{SHA curto do commit}` igual ao SHA deployado e igual ao "App version" no detalhe web (L-F01-04); slot invisível acima do `InstallAppCard` (L-F01-12).

### Escopo / Passos
- [ ] **1. Card "Base address".**
  - Camada: pwa. Dias: 0,25. Usa `inspectorBaseAddressSchema` e `AU_STATES` do shared (L-F01-01).
  - Modify: `apps/pwa/src/features/profile/pages/ProfileAccountPage.tsx` (card inline), `apps/pwa/src/features/profile/hooks/useInspectorMe.ts` (tipo), `apps/pwa/src/features/profile/hooks/useUpdateInspectorSelf.ts` (tipo + retorno).
- [ ] **2. Banner.**
  - Camada: pwa. Dias: 0,25.
  - Novo: `apps/pwa/src/features/profile/components/BaseAddressBanner.tsx`.
  - Modify: `apps/pwa/src/features/schedule/pages/SchedulePage.tsx`, `apps/pwa/src/features/profile/pages/ProfilePage.tsx`.
- [ ] **3. Heartbeat + versão.**
  - Camada: pwa + CI. Dias: 0,5 (era 0,25; +0,25 pela versão com SHA injetado pelo CI e pelos casos multi-dispositivo, L-F01-04, L-F01-08).
  - Novos: `apps/pwa/src/app/useAppStateHeartbeat.ts`; `apps/pwa/build/app-version.ts` (`buildAppVersion`).
  - Modify: `apps/pwa/src/app/useInstallPrompt.tsx` (export), `apps/pwa/src/components/shell/PwaLayout.tsx`, `apps/pwa/vite.config.ts`, `apps/pwa/src/vite-env.d.ts`, `apps/pwa/src/lib/auth-storage.ts`, `.github/workflows/frontend-deploy.yml` (`APP_BUILD_SHA` nos três builds).
- [ ] **4. Slot de push + rodapé.**
  - Camada: pwa. Dias: 0,25. Ordem slot → `InstallAppCard` → rodapé (L-F01-12).
  - Modify: `apps/pwa/src/features/profile/pages/ProfileSettingsPage.tsx`.
- [ ] **5. QA smoke** (PWA iOS simulado + Android, e web).
  - Camada: qa. Dias: 0,5.
  - Sem arquivos. Evidências no PR; screenshots nunca são commitadas.

### Auditoria e observabilidade
- O save do endereço é auditado no backend (`inspector.self_profile_updated`).
- O heartbeat não é auditado. O cliente não loga em produção.

### Deploy, rollout e rollback
1. Mergear em `develop` depois da TASK-F01-1. Pode ir na mesma promoção de F01-1/F01-2 ou na seguinte, porque os contratos já existem.
2. Sem feature flag: o banner aparece para todo inspetor sem coords. **Rodar o backfill da TASK-F01-1 no ambiente antes de promover esta tarefa**, senão quem já tinha `address` vê a variante 2 até o backfill rodar.
3. A versão nova chega pelo fluxo de atualização do service worker existente (stale chunk retry). O `APP_BUILD_SHA` no workflow precisa estar no mesmo PR; sem ele o rodapé mostra `+dev` em staging (falha do passo 6 do smoke) (L-F01-04).
4. Rollback: reverter o PR. O backend segue aceitando heartbeats; sem eles, a adoção só para de atualizar.

### Fora do escopo
- Controle e inscrição de push (F02).
- Tour/guia de instalação e aba "More" (F04).
- Autocomplete no PWA.
- Base do dia (F04).
- Mudanças em `InstallBanner*`/`InstallAppCard`.
- Conserto da suíte e2e do PWA.

### Critérios de aceite
1. O inspetor cria e edita a base com validação. O payload vai sem coords e com `city = suburb`.
2. Banner com o texto exato da variante certa, não dispensável, sem bloquear o app, sumindo após um save com coords.
3. Heartbeat no máximo a cada 6 h por dispositivo, com bypass na mudança de `displayMode` e valores corretos; o web reflete.
4. `/profile/settings` tem o slot vazio como primeiro filho, depois `InstallAppCard`, depois o rodapé com `v{pkg.version}+{sha7}` (L-F01-04, L-F01-12).
5. Smoke com os 6 passos e evidências no PR. Lint, typecheck e testes do PWA verdes.
6. Os casos multi-dispositivo (Android compartilhado, iOS isolado, desktop instalado) se comportam como descrito e estão documentados como esperados (L-F01-08).

### Dependências
- TASK-F01-1 mergeada (contratos, api-types, shared buildado).
- TASK-F01-2 mergeada para os passos web do smoke.

### Riscos e armadilhas
- **`/v1/inspectors/me` não tem response schema:** o PWA recebe o que o use case devolve (com a visibilidade aplicada no use case).
- **Não ler a base do `/v1/me`:** o `meResponseSchema` remove campos não declarados e esta feature não os declara lá.
- **Build do shared** antes do typecheck do PWA, que importa o dist.
- O `localStorage` do jsdom não é confiável: injetar o storage no hook.
- iOS: `Notification` só existe no PWA instalado (iOS ≥16.4). `unsupported` fora dele é o esperado.
- O banner na Schedule não pode quebrar o scroll por painel no layout largo (memória "two-pane per-pane scroll").
- **Ordem com a X03 (L-X03-05):** pela ordem das ondas a F01 entra antes e a X03 já traz `POST /v1/inspectors/me/app-state` → 204 (e `GET /v1/inspectors/me`) em `BASELINE_STUBS`. Se esta tarefa mergear **depois** da X03: somar esses stubs default em `apps/pwa/tests/e2e/support/auth.ts` (`BASELINE_STUBS`) no mesmo PR e tratar o e2e pelo gate `test-pwa-e2e` (não mais "quebrado 56/56").
- **`vite.config.ts` roda em Node:** `process.env.APP_BUILD_SHA` é lido no build, não no browser; não usar prefixo `VITE_` (o valor não deve ir para `import.meta.env`) (L-F01-04).

### Dias · Branch · Verificação
- **Dias:** 1,75 (0,25 + 0,25 + 0,5 + 0,25 + 0,5).
- **Branch:** `feat/f01-inspector-base-address-pwa` a partir de `develop`, depois da TASK-F01-1.
- **Verificação:** `pnpm --filter @properfy/shared build && pnpm --filter pwa lint typecheck test`; smoke no iOS Simulator e no Android/Chrome instalado, com o backend local.

---

## Achados para revisão

Nenhum em aberto. O contrato com a X02 (formatador e timeout) foi fixado em 2026-10-27: `formatGeocodingQuery`/`GeocodableAddress` e `geocodeWithTimeout`/`GEOCODE_SYNC_TIMEOUT_MS`/`GeocodeTimeoutError`, todos exportados pela TASK-X02-1.

## Ajustes necessários em outras tarefas (para reconciliar)

Lacunas L-F01-01..12 aplicadas em 2026-10-29. Os itens abaixo dependem de outro arquivo e **não** foram editados aqui.

- (resolvido 2026-10-29) `tarefas/F04-tarefas.md` · consumir `INSPECTOR_EVENTS.BASE_CHANGED` `{ inspectorId, hadCoordinates, hasCoordinates }` e marcar `STALE` (novo `stale_reason 'BASE_CHANGED'`) os `DayPlan` `PUBLISHED` de hoje/D+1 do inspetor, **sem aviso à OP** (decisão do dev de 2026-10-29, segue L-F04-05: só STALE, ninguém é notificado); registrar que a F01 não altera planos · L-F01-03.
- `tarefas/F04-tarefas.md` · `onboarding_completed_at = COALESCE(...)` entra na **mesma instrução `$executeRaw`** de `recordAppState()` (não em `updateMany`); ajustar o teste de `record-inspector-app-state` para o contrato `repo.recordAppState(...)` · L-F01-02.
- `tarefas/F02-tarefas.md` · ao parar de escrever `push_enabled` no heartbeat, remover a coluna da instrução SQL única de `recordAppState()` (não de um `updateMany`); e trocar o tooltip web "Browser notification permission on the last device seen" pelo da semântica de assinatura da F02 D10 · L-F01-02, L-F01-08.
- `tarefas/F02-tarefas.md` · testes que citam o rodapé de `/profile/settings` devem esperar `Properfy Inspector v{pkg.version}+{sha7}` e a ordem slot → `InstallAppCard` → rodapé (já coerente com F02-tarefas.md:1297; só confirmar o teste) · L-F01-04, L-F01-12.
- `tarefas/X02-tarefas.md` · manter `branchAddressSchema` como `z.object` puro (sem `.transform/.refine/.superRefine` no topo), porque a F01 o deriva com `.extend(...)` · L-F01-01.
- `tarefas/F03-tarefas.md` · registrar que os audits de `Inspector` da F01 seguem a D10 (sem `baseLat/baseLng`; usam `baseLocated` + `baseGeocodedAt`), então a máscara de leitura não precisa de chaves novas · L-F01-10.
- `README.md` (estimativas) · F01 passa de 5,0 para 6,0 dias (F01-1 3,0; F01-2 1,25; F01-3 1,75) · L-F01-01..12.
