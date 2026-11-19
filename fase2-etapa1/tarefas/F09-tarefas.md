# F09 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | [F09 · Densidade no mapa](../F09-densidade-mapa.md) — contrato D.1–D.4 (critérios D.A1, D.A2, D.A3). O 01.13 foi para a F05 (2026-10-27) e **não** está aqui. |
| **Tarefas** | 2 |
| **Total** | **3,4 dias** (plano: 3,0 = 1,5 backend + 1,5 web; +0,4 pelas lacunas de 2026-10-29: backend 1,7 [+0,2: presets fixos para CL validados no servidor, chave na `ROLE_ACTION_MATRIX`, testes de caracterização D17/D18], web 1,7 [+0,2: CL só com presets e reancoragem, legenda numerada, "hoje" fixado no estado, textos de escopo e estado de erro]) |
| **PRs** | 2 (~21 arquivos no backend/shared, contando a regeneração do api-types e a `role-matrix`; ~14 no web) |
| **Depende de** | F03 (TASK-F03-2: coluna `inspection_executions.abandoned_at`; TASK-F03-1: decisão D10 de privacidade). Ordem de merge recomendada com a F00 (as duas mexem no `AppointmentMapPage.tsx`). |
| **Código verificado em** | `origin/develop` @ `042a9674` |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F09-1 | Backend + shared: `GET /v1/map/execution-density` (grade de ~100 m agregada no Postgres, escopo por agência via join com o appointment; CL só com períodos-preset; chave `map.execution_density` na matriz) | 1,7 | TASK-F03-2 (coluna `abandoned_at`) |
| TASK-F09-2 | Web: toggle "Activity density" no `/map`, seletor de período próprio (padrão 30 dias; `Custom` só AM/OP), `DensityLayer` (heatmap Mapbox), legenda numerada | 1,7 | TASK-F09-1 (api-types regenerado) |

O plano previa 3,0 dias; as lacunas aceitas em 2026-10-29 (L-F09-01..09) somam +0,4 (0,2 em cada tarefa). O "% travado" que ainda aparece na seção "Quebra em PRs" do plano (backend "densidade + % travado"; web "camada + tabela") pertence ao 01.13, que foi para a F05. Ele **não** entra aqui e o esforço do plano já é só da densidade (ver Achados).

---

## TASK-F09-1 · Backend + shared: `GET /v1/map/execution-density`

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F03-2
> - **Desbloqueia:** TASK-F09-2
> - **Pode rodar em paralelo com:** TASK-F01-3, TASK-F02-1, TASK-F03-3, TASK-F03-4, TASK-F04-1
> - **Pista sugerida (time de 6):** E · Full-stack / QA

### Objetivo

Criar um endpoint de leitura que devolve a densidade de **check-ins** (geo do início da execução) num período, já agregada numa grade fixa de ~100 m, com contagem por célula. Nenhum perfil recebe a coordenada crua de um inspetor: a agregação acontece **dentro do Postgres** e a porta do repositório não tem método que devolva coordenadas individuais.

Depois desta tarefa:

- AM/OP leem a densidade de toda a plataforma, ou de uma agência (`tenantId`) e/ou de um inspetor (`inspectorId`);
- CL_ADMIN/CL_USER leem só as execuções dos appointments da própria agência; `tenantId` vindo deles é ignorado; `inspectorId` vindo deles é recusado com 403;
- INSP/TNT recebem 403;
- o contrato está no `@properfy/shared` e o `api-types.ts` está regenerado para a TASK-F09-2 consumir.

### Contexto no código (verificado)

**Modelo**
- `InspectionExecution` (`apps/backend/prisma/schema.prisma:1181-1202`, tabela `inspection_executions`): `appointment_id @unique`, `inspector_id`, `started_at DateTime`, `start_latitude/start_longitude Decimal(10,7)` **NOT NULL**, `finish_*` nullable. Índices: `@@index([inspector_id])`, `@@index([started_at])`. **Não tem `tenant_id`**: o escopo vem do join `appointments.id = inspection_executions.appointment_id` (`appointments.tenant_id`, `appointments.deleted_at`).
- A F03 acrescenta (antes desta tarefa): `out_of_radius`, `start_accuracy_m` etc. (TASK-F03-1) e `abandoned_at DateTime?` (TASK-F03-2, D13). Uma execução abandonada é tratada como "não iniciada" por **todos** os leitores (F03 D13). Um novo `start` depois da reoferta **reinicia a mesma linha** (novo `started_at`, novas coordenadas, `abandoned_at = null`).
- Coordenadas do imóvel ficam em `properties.lat/lng` e na coluna PostGIS `properties.coordinates` (`GEOMETRY(Point, 4326)`, `Unsupported`). As coordenadas da execução **não** são geometria.

**Escopo**
- `apps/backend/src/modules/appointment/application/appointment-list-scope.ts`: `resolveAppointmentListTenantScope(actor, requestedTenantId)` = `requireTenantScope(actor, 'appointment.list') ?? requestedTenantId`. AM/OP → o `tenantId` pedido (ou `undefined` = sem filtro); CL → o tenant do JWT (o pedido é ignorado) ou `ForbiddenError('TENANT_SCOPE_REQUIRED')` se o JWT não tiver tenant; INSP/TNT → `Error` (erro de fiação, não 403). Por isso o use case **checa o role antes** de chamar o helper.
- `apps/backend/src/shared/domain/require-tenant-scope.ts`: `ROLE_TENANT_SCOPE` exaustivo (`AM/OP/SYS` cross-tenant, `CL_ADMIN/CL_USER` pinned, `INSP/TNT` other-key).
- O `/v1/appointments` aceita `inspectorId` também de CL (`list-appointments.use-case.ts:18,138`). A densidade **não** segue isso (decisão: o filtro de inspetor é AM/OP).

**Padrão de rotas (referência, não editar)**
- `apps/backend/src/modules/dashboard/interfaces/dashboard.routes.ts`: container próprio (`DashboardRouteContainer` com `jwtService` + `tenantRepo`), `createAuthMiddleware(verify, tenantActive, clUserPermissions)`, `schema: { querystring, response: { 200: successResponseSchema(...) } }`, `safeParse` + `ValidationError`, `reply.status(200).send(success(result))`.
- `apps/backend/src/modules/dashboard/application/use-cases/get-analytics-heatmap.use-case.ts` e `prisma-dashboard-analytics.repository.ts:268` (`getHeatmap`): o heatmap do `/analytics` agrega em memória por bairro. **Não é alterado** (regra: dashboards existentes não mudam).
- Registro: `apps/backend/src/main/routes.ts` (ex.: `registerDashboardRoutes(app, container.dashboard)` na l.109) e `apps/backend/src/main/container.ts` (`dashboard: DashboardRouteContainer` na l.467; wiring na l.1288).
- `apps/backend/tests/helpers/mock-container.ts`: monta cada chave do `AppContainer` (`dashboard` na l.298). Uma chave nova no container **precisa** entrar aqui, senão os testes de rota não compilam/sobem.

**Datas**
- `civilDateSchema` (`packages/shared/src/schemas/civil-date.ts`): `YYYY-MM-DD` com checagem de calendário.
- `parseDateInTimezone(date, tz)` e `nextCivilDay(date)` em `apps/backend/src/shared/domain/timezone-date.ts`. `PLATFORM_TIMEZONE = 'Australia/Sydney'` (`packages/shared/src/constants/timezone.ts`). O projeto é Sydney-only.
- Precedente de teto de período: `MAX_ANALYTICS_PERIOD_DAYS = 366` (`packages/shared/src/schemas/dashboard-analytics.ts`), com a mesma justificativa (leitura sem escopo para AM/OP).

**Raw SQL**
- PostGIS existe (`ST_Intersects` em `prisma-service-group.repository.ts:777`), mas não é necessário aqui (ver Algoritmo).
- `$queryRaw` com parâmetros inteiros precisa de cast explícito (`::int`) e `COUNT(*)` volta `bigint` → `::int` no SELECT.

### Decisões aplicáveis

- (2026-10-27, plano F09) **Ponto do calor = local do check-in** (`start_latitude/start_longitude`).
- (2026-10-27, plano F09) **CL vê só as execuções dos próprios appointments, agregadas numa grade de ~100 m; nunca o ponto exato.** AM/OP veem tudo, **também agregado**.
- (2026-10-27, plano F09) O período da camada é **próprio** (padrão 30 dias, definido no web). O backend exige `fromDate`/`toDate` explícitos.
- (2026-10-27, plano F09) Agência e inspetor vêm dos filtros do mapa (D.2/D.3) → parâmetros `tenantId` e `inspectorId`.
- (2026-10-27, F03 D10) CL não recebe lat/lng cruas do inspetor em lugar nenhum.
- (2026-10-27, F03 D13) Execução abandonada = "não iniciada" para todos os leitores → **fora** da densidade.
- (2026-10-27, README "Regras do dev") Dashboards existentes não são alterados; cada PR atualiza o CLAUDE.md do workspace que muda (X00).
- (2026-10-28, dev) **k-anonimato para CL:** células com menos de 3 check-ins são ocultadas para CL_ADMIN/CL_USER (`MIN_CELL_COUNT_CL = 3`). AM/OP veem todas as células (`MIN_CELL_COUNT_GLOBAL = 1`). **Não** há exclusão de `out_of_radius`.
- (2026-10-27, decisoes.md Q6, PENDENTE) Só redação do contrato ("sobre o mapa da 01"); não muda a implementação.
- (2026-10-29, L-F09-01) **O k = 3 por consulta não resiste à diferença de janelas** (duas consultas que diferem em 1 dia isolam o check-in desse dia). Por isso, **para CL, o período só pode ser um dos presets ancorados no "hoje" de Sydney**: `toDate === hoje` e `toDate − fromDate ∈ {6, 29, 89}` (`EXECUTION_DENSITY_PRESET_DAYS = [7, 30, 90]`), validado **no use case** (o schema da query não conhece o role); fora disso → 400 `VALIDATION_ERROR` com `details.reason = 'PERIOD_NOT_A_PRESET'`. AM/OP continuam com período livre (≤ 366 dias). **Risco residual aceito e documentado** (PR + `apps/backend/CLAUDE.md`): a diferença entre os presets de 7 e 30 dias (ou 30 e 90) ainda revela o agregado do intervalo de 8–30 (31–90) dias atrás, mas não isola um dia; e a janela desliza 1 dia por dia, então um CL que consulta todo dia ainda observa variação diária na borda (custo de esforço alto, aceito).
- (2026-10-29, L-F09-02) **A camada mede check-ins registrados, não serviços concluídos.** Conta também appointment que voltou de `DONE` para `REJECTED` (evento `DONE_REJECTED`, "marcado como feito mas não executado") e appointment reaberto: neste caso conta uma vez, com as coordenadas do `started_at` **original** (o `start` idempotente e o `reopen` não sobrescrevem a geo). Não há filtro por status nem por `rejection_reason_code`. Coberto por testes de caracterização (D17, D18).
- (2026-10-29, L-F09-09) **Nova chave `'map.execution_density'` no `ROLE_ACTION_MATRIX`** (`roles: ['AM','OP','CL_ADMIN','CL_USER']`, comentário "inspectorId filter is AM/OP-only; enforced in the use case"), usada também como rótulo no `requireTenantScope`. `EXECUTION_DENSITY_ROLES` deve ser igual a `ROLE_ACTION_MATRIX['map.execution_density'].roles` (teste U22).

### Testes primeiro (TDD)

Escrever os testes abaixo **antes** do código, vê-los falhar, implementar.

**A. Shared — `packages/shared/src/schemas/execution-density.test.ts` (novo)**

| # | Entrada | Esperado |
|---|---|---|
| S1 | `{ fromDate: '2026-10-01', toDate: '2026-10-30' }` | ok; `tenantId`/`inspectorId` `undefined` |
| S2 | `fromDate` ausente | erro em `fromDate` |
| S3 | `{ fromDate: '2026-02-31', toDate: '2026-03-01' }` | erro `Invalid calendar date` |
| S4 | `toDate < fromDate` | erro em `toDate`, mensagem `toDate must be >= fromDate` |
| S5 | período de 366 dias inclusivos (`2025-10-31`..`2026-10-31`) | ok |
| S6 | período de 367 dias | erro em `toDate`, `Period must not exceed 366 days` |
| S7 | `tenantId: 'abc'` | erro (uuid) |
| S8 | `inspectorId: ''` | erro (uuid); o web nunca manda string vazia |
| S9 | resposta válida `{ cells: [{ lat: -33.8685, lng: 151.2095, count: 3 }], totalExecutions: 3, cellCount: 1, excludedWithoutCoordinates: 0, gridSizeDegrees: 0.001, minCellCount: 3, truncated: false, fromDate, toDate }` | ok |
| S10 | célula com `count: 0` ou `count: 1.5` | erro (inteiro ≥ 1) |
| S11 | `EXECUTION_DENSITY_GRID_SCALE === 1000` (células por grau), `EXECUTION_DENSITY_GRID_DEGREES === 0.001` (= 1 / escala), `MAX_EXECUTION_DENSITY_PERIOD_DAYS === 366`, `MAX_EXECUTION_DENSITY_CELLS === 5000`, `MIN_CELL_COUNT_CL === 3`, `MIN_CELL_COUNT_GLOBAL === 1` | constantes exportadas pelo índice do pacote. O web **não** importa `MIN_CELL_COUNT_CL`: lê `minCellCount` da resposta (L-F09-03); quem aplica é o backend |
| S12 | `minCellCount: 0` ou ausente na resposta | erro (inteiro ≥ 1, obrigatório) |
| S13 | `EXECUTION_DENSITY_PRESET_DAYS` | `[7, 30, 90]` (readonly), exportada pelo índice (L-F09-01) |
| S14 | `isExecutionDensityPreset({ fromDate: '2026-10-06', toDate: '2026-11-04' }, '2026-11-04')` · `('2026-10-29','2026-11-04')` · `('2026-08-07','2026-11-04')` | `true` nos três (30, 7 e 90 dias inclusivos) |
| S15 | `isExecutionDensityPreset({ fromDate: '2026-10-05', toDate: '2026-11-04' }, '2026-11-04')` (31 dias) · `('2026-10-06','2026-11-03')` com hoje `2026-11-04` (não termina hoje) | `false` nos dois |

**A2. Shared — `packages/shared/src/permissions/role-matrix.test.ts` (modify)** (L-F09-09)

| # | Entrada | Esperado |
|---|---|---|
| M1 | `ROLE_ACTION_MATRIX['map.execution_density']` | `{ roles: ['AM','OP','CL_ADMIN','CL_USER'] }`, sem `condition` (o `/map` não exige flag) |
| M2 | `can('INSP', 'map.execution_density')` / `can('TNT', 'map.execution_density')`; `can('CL_USER', 'map.execution_density')` | `false` / `false`; `true` |

**B. Domínio puro — `apps/backend/tests/unit/inspector-execution/execution-density-grid.test.ts` (novo)**

| # | Entrada | Esperado |
|---|---|---|
| G1 | `cellCenter({ latIndex: -33869, lngIndex: 151209 })` | `{ lat: -33.8685, lng: 151.2095 }` |
| G2 | `cellCenter({ latIndex: 0, lngIndex: 0 })` | `{ lat: 0.0005, lng: 0.0005 }` |
| G3 | `cellCenter({ latIndex: -1, lngIndex: -1 })` | `{ lat: -0.0005, lng: -0.0005 }` (floor em negativos) |
| G4 | resultado de `cellCenter` sempre tem ≤ 4 casas decimais (`Number(x.toFixed(4)) === x`) para 1.000 índices aleatórios | verdadeiro |
| G5 | `toCellIndex('-33.8688200')` (espelho TS **exato** do `FLOOR(x * 1000)` do SQL; recebe a string decimal do `Decimal(10,7)` e desloca a vírgula 3 casas com aritmética inteira, sem `Math.floor(x * 1000)` em float) | `-33869`; `toCellIndex('151.2092900')` → `151209` |
| G5a | **pontos de borda** (exatamente sobre a linha da grade e 1e-7 de cada lado) | `toCellIndex('-33.8690000')` → `-33869` · `toCellIndex('-33.8690001')` → `-33870` · `toCellIndex('-33.8689999')` → `-33869` · `toCellIndex('151.2090000')` → `151209` · `toCellIndex('151.2089999')` → `151208` · `toCellIndex('0.0010000')` → `1` · `toCellIndex('-0.0010000')` → `-1` · `toCellIndex('0.0000000')` → `0` · `toCellIndex('-0.0000001')` → `-1` |
| G5b | `toCellIndex` recebe `Prisma.Decimal`/string, nunca `number` | erro de tipo no `tsc` se alguém passar `number` (assinatura `(value: string) => number`); o teste chama com `'-33.8690000'` vindo de `new Prisma.Decimal('-33.869').toFixed(7)` e espera `-33869` |
| G6 | distância do ponto real `(-33.86882, 151.20929)` ao centro da célula | ≤ 75 m (meia diagonal da célula em Sydney ≈ 72 m) |
| G7 | `periodToInstants('2026-10-04', '2026-10-04')` (domingo de início do horário de verão em Sydney, dia de 23 h) | `{ from: 2026-10-03T14:00:00.000Z, toExclusive: 2026-10-04T13:00:00.000Z }` |
| G8 | `periodToInstants('2026-04-05', '2026-04-05')` (fim do horário de verão, dia de 25 h) | `{ from: 2026-04-04T13:00:00.000Z, toExclusive: 2026-04-05T14:00:00.000Z }` |

**C. Use case — `apps/backend/tests/unit/inspector-execution/get-execution-density.use-case.test.ts` (novo)** (reader fake que registra os filtros recebidos e devolve linhas pré-definidas)

| # | Ator / entrada | Esperado |
|---|---|---|
| U1 | AM, sem `tenantId`/`inspectorId` | reader chamado com `tenantId: undefined`, `inspectorId: undefined`, `from`/`toExclusive` de Sydney |
| U2 | AM, `tenantId: T1`, `inspectorId: I1` | reader com `tenantId: T1`, `inspectorId: I1` |
| U3 | OP (JWT **sem** `tenantId`), `tenantId: T2` | reader com `tenantId: T2` (OP é cross-tenant; não depende de `actor.tenantId`) |
| U4 | CL_ADMIN do T1, sem `tenantId` | reader com `tenantId: T1` |
| U5 | CL_USER do T1, `tenantId: T2` (forjado) | reader com `tenantId: T1` (o pedido é ignorado, nunca alarga) |
| U6 | CL_ADMIN do T1, `inspectorId: I1` | `ForbiddenError('AUTH_FORBIDDEN')`, reader **não** chamado |
| U7 | CL_USER com `tenantId: null` no JWT | `ForbiddenError('TENANT_SCOPE_REQUIRED')`, reader não chamado |
| U8 | INSP | `ForbiddenError('AUTH_FORBIDDEN')` (checado **antes** do helper de escopo, para não cair no `Error` de fiação) |
| U9 | TNT | `ForbiddenError('AUTH_FORBIDDEN')` |
| U10 | reader devolve `[{ latIndex: -33869, lngIndex: 151209, count: 3 }, { latIndex: -33870, lngIndex: 151210, count: 1 }]`, `totals: { valid: 4, invalid: 0 }` | `cells` = centros G1 e `(-33.8695, 151.2105)`, `count` 3 e 1, nessa ordem; `totalExecutions: 4`; `cellCount: 2`; `truncated: false`; `gridSizeDegrees: 0.001`; `fromDate`/`toDate` ecoados |
| U11 | reader devolve `MAX_EXECUTION_DENSITY_CELLS + 1` linhas | `cells.length === 5000`, `truncated: true`, `cellCount: 5000`, `totalExecutions` = total válido do reader (não a soma das células cortadas) |
| U12 | reader devolve `[]`, `totals: { valid: 0, invalid: 2 }` | `cells: []`, `totalExecutions: 0`, `excludedWithoutCoordinates: 2`, `truncated: false` |
| U13 | qualquer saída | nenhuma chave `inspectorId`, `appointmentId`, `startLatitude` ou similar em `cells[*]` (`Object.keys(cell)` = `['lat','lng','count']`) |
| U14 | AM e OP | reader chamado com `minCellCount: 1` (`MIN_CELL_COUNT_GLOBAL`); resposta com `minCellCount: 1` |
| U15 | CL_ADMIN e CL_USER | reader chamado com `minCellCount: 3` (`MIN_CELL_COUNT_CL`); resposta com `minCellCount: 3` |
| U16 | CL; reader devolve uma linha com `count: 2` (reader fake que **não** aplica o `HAVING`, para provar a segunda barreira) | a célula **não** aparece em `cells` (o use case refiltra `count >= minCellCount` como defesa em profundidade) |
| U17 | CL; reader devolve uma linha com `count: 3` | a célula aparece com `count: 3` |
| U18 | AM; reader devolve uma linha com `count: 1` | a célula aparece |
| U19 | CL com `totals: { valid: 5, invalid: 0 }`, células visíveis somando 3 | `totalExecutions: 5` (o total do recorte, incluindo as execuções das células ocultas; é um número agregado da própria agência, sem localização) |
| U20 | **CL fora dos presets** (L-F09-01), relógio em `2026-11-03T14:30:00Z` (hoje Sydney = `2026-11-04`): `fromDate: '2026-10-01', toDate: '2026-10-10'` · `fromDate: '2026-10-06', toDate: '2026-11-03'` (30 dias terminando ontem) · `fromDate: '2026-10-05', toDate: '2026-11-04'` (31 dias) | `ValidationError` (400 `VALIDATION_ERROR`, `details: { reason: 'PERIOD_NOT_A_PRESET', allowedDays: [7, 30, 90] }`), reader **não** chamado |
| U21 | CL dentro dos presets, mesmo relógio: `2026-10-29..2026-11-04`, `2026-10-06..2026-11-04`, `2026-08-07..2026-11-04` | reader chamado nos três |
| U21a | AM e OP com `2026-10-01..2026-10-10` e com `2026-10-01..2026-10-11` (janelas que diferem em 1 dia) | reader chamado nas duas; para CL as mesmas duas chamadas dão 400 (U20) — prova que o ataque por diferença de 1 dia não é possível para CL |
| U22 | constante | `EXECUTION_DENSITY_ROLES` (ordenado) igual a `ROLE_ACTION_MATRIX['map.execution_density'].roles` (ordenado) (L-F09-09) |

**D. Reader no banco — `apps/backend/tests/integration/db/execution-density.integration.test.ts` (novo; testcontainers, suíte DB, roda em série)**

Seed: agências **T1** e **T2**; inspetores **I1** e **I2**; appointments com execuções. Coordenadas e horários fixos (UTC):

| Execução | Agência | Inspetor | `started_at` (UTC) | start lat/lng | Observação |
|---|---|---|---|---|---|
| e1 | T1 | I1 | 2026-10-10T00:00Z | -33.86882, 151.20929 | célula A |
| e2 | T1 | I1 | 2026-10-11T00:00Z | -33.86811, 151.20901 | mesma célula A |
| e3 | T1 | I2 | 2026-10-12T00:00Z | -33.87950, 151.21500 | célula B |
| e4 | T2 | I1 | 2026-10-12T00:00Z | -33.86890, 151.20950 | célula A, **outra agência** |
| e5 | T1 | I1 | 2026-10-13T00:00Z | -33.90000, 151.25000 | `abandoned_at` preenchido |
| e6 | T1 | I1 | 2026-10-13T00:00Z | -33.91000, 151.26000 | appointment com `deleted_at` |
| e7 | T1 | I2 | 2026-10-14T00:00Z | 0, 0 | coordenada inválida |
| e8 | T1 | I1 | 2026-09-30T13:59:59Z | -33.86882, 151.20929 | 30/09 23:59:59 em Sydney (fora de um período que começa em 01/10) |
| e9 | T1 | I1 | 2026-09-30T14:00:00Z | -33.86882, 151.20929 | 01/10 00:00 em Sydney (dentro) |

| # | Filtros | Esperado |
|---|---|---|
| D1 | `from/to` de `2026-10-01..2026-10-31`, sem tenant | A: 4 (e1, e2, e4, e9) · B: 1 (e3); `invalid: 1` (e7); e5, e6, e8 fora |
| D2 | `tenantId: T1` | A: 3 (e1, e2, e9) · B: 1; **e4 (T2) ausente** (D.A3) |
| D3 | `tenantId: T2` | só A: 1 (e4); nenhuma linha da T1 |
| D4 | `tenantId: T1`, `inspectorId: I2` | só B: 1; `invalid: 1` (e7 é do I2) |
| D5 | `tenantId: T1`, `inspectorId: I1` | só A: 3 |
| D6 | período `2026-10-01..2026-10-01` | só e9 → A: 1 |
| D7 | período `2026-11-01..2026-11-30` | `[]`, `valid: 0`, `invalid: 0` |
| D8 | execução de e3 em andamento (`finished_at null`) | continua contada (check-in aconteceu) |
| D9 | e1 reiniciada (F03 D13: mesma linha, novas coordenadas `-33.87950, 151.21500`, novo `started_at`) | e1 conta **uma vez**, na célula B |
| D10 | `limit = 1` passado ao reader, período de D1 (2 células) | devolve 2 linhas (o reader pede `limit + 1` para o use case detectar o corte) e ordena por `count DESC, latIndex, lngIndex` |
| D12 | **k para CL**, `tenantId: T1`, `minCellCount: 3`, período de D1 | só A (3: e1, e2, e9); **B (1) oculta** |
| D13 | seed extra: e10 (T1, I2, 2026-10-15) em B → B = 2; `minCellCount: 3` | B continua **oculta** (2 → oculta) |
| D14 | seed extra: e10 + e11 (T1, I2, 2026-10-16) em B → B = 3; `minCellCount: 3` | B **aparece** com 3 (3 → visível) |
| D15 | mesmo seed de D13, `minCellCount: 1` (AM/OP) | B aparece com 2 |
| D16 | **borda da grade no SQL:** execuções em `-33.8690000, 151.2090000`, `-33.8690001, 151.2090000` e `-33.8689999, 151.2089999` (seed próprio deste caso, numa agência T3 só dele, para não alterar D1–D15; período de D1) | índices devolvidos pelo SQL = `toCellIndex` de G5a para cada ponto, ou seja `(-33869, 151209)`, `(-33870, 151209)` e `(-33869, 151208)`; o teste compara SQL × `toCellIndex` ponto a ponto |
| D17 | **caracterização L-F09-02:** seed extra numa agência T4 só deste caso: appointment que passou por `DONE → REJECTED` (status `REJECTED`, execução finalizada, `abandoned_at null`) com check-in em `-33.86882, 151.20929`; `tenantId: T4`, `minCellCount: 1`, período de D1 | conta: A = 1 (o check-in aconteceu; a camada mede check-ins, não serviços concluídos) |
| D18 | **caracterização L-F09-02:** em T4, appointment reaberto (execução com `resumed_at` preenchido, `started_at` e `start_*` originais preservados; não há segunda linha porque `appointment_id` é `@unique`) | conta **uma vez**, na célula das coordenadas do `started_at` original; total de T4 em D17+D18 = 2 |
| D11 | inspeção da query (`$queryRaw` espiado ou `pg_stat_statements` não; basta o resultado) | as linhas só têm `latIndex`, `lngIndex`, `count` (nenhuma coordenada crua sai do banco) |

**E. Rota — `apps/backend/tests/integration/inspector-execution/execution-density.routes.test.ts` (novo; supertest + `createMockContainer`)**

| # | Requisição | Esperado |
|---|---|---|
| R1 | AM, `GET /v1/map/execution-density?fromDate=2026-10-01&toDate=2026-10-30` | 200, `{ data: { cells, totalExecutions, ... } }`; use case chamado com `query` parseada |
| R2 | sem token | 401 (com query válida; com query inválida a validação do Fastify responde 400 antes da auth — comportamento conhecido do projeto, não é bug) |
| R3 | AM, `toDate` < `fromDate` | 400 `VALIDATION_ERROR`, envelope `{ error: { code, message, details } }` |
| R4 | AM, período de 400 dias | 400 `VALIDATION_ERROR` |
| R5 | INSP (use case mock lança `ForbiddenError('AUTH_FORBIDDEN')`) | 403 `AUTH_FORBIDDEN` |
| R6 | CL_ADMIN com `inspectorId` (mock lança 403) | 403 `AUTH_FORBIDDEN` |
| R7 | resposta com chave extra no objeto da célula (mock devolve `{ lat, lng, count, inspectorId }`) | a chave extra **some** da resposta (o serializer do schema de resposta remove campos não declarados) — segunda barreira contra vazamento |
| R8 | agência inativa (tenantRepo devolve `isActive() false`) para CL | 401/403 do middleware, como nas outras rotas |
| R9 | CL_ADMIN com período fora dos presets (mock lança `ValidationError('…', { reason: 'PERIOD_NOT_A_PRESET', allowedDays: [7,30,90] })`) | 400 `VALIDATION_ERROR`, `error.details.reason === 'PERIOD_NOT_A_PRESET'` (L-F09-01) |

### Escopo / Passos

| ✓ | Passo | Camada | Arquivos | Dias |
|---|---|---|---|---|
| [ ] | P1 · Contrato: `executionDensityQuerySchema`, `executionDensityResponseSchema` (com `minCellCount`), constantes `EXECUTION_DENSITY_GRID_SCALE`, `EXECUTION_DENSITY_GRID_DEGREES`, `MAX_EXECUTION_DENSITY_PERIOD_DAYS`, `MAX_EXECUTION_DENSITY_CELLS`, `MIN_CELL_COUNT_CL`, `MIN_CELL_COUNT_GLOBAL`, `EXECUTION_DENSITY_PRESET_DAYS` e o helper puro `isExecutionDensityPreset(range, today)` (usado pelo use case e pelo web; L-F09-01); export no índice | shared | `packages/shared/src/schemas/execution-density.ts` (novo) · `packages/shared/src/schemas/execution-density.test.ts` (novo) · `packages/shared/src/schemas/index.ts` (modify) | 0,3 |
| [ ] | P1a · Chave `'map.execution_density'` no `ROLE_ACTION_MATRIX` (comentário sobre `inspectorId` só AM/OP) + testes M1/M2 (L-F09-09) | shared | `packages/shared/src/permissions/role-matrix.ts` · `role-matrix.test.ts` (modify) | 0,05 |
| [ ] | P2 · `pnpm --filter @properfy/shared build` (backend e web importam o `dist`) | shared | – | (em P1) |
| [ ] | P3 · Domínio puro da grade (`cellCenter`, `toCellIndex` exato sobre string decimal, `periodToInstants`, `minCellCountFor(role)`) + porta `ExecutionDensityReader` | backend | `apps/backend/src/modules/inspector-execution/domain/execution-density-grid.ts` (novo) · `domain/execution-density.reader.ts` (novo) · `apps/backend/tests/unit/inspector-execution/execution-density-grid.test.ts` (novo) | 0,25 |
| [ ] | P4 · Use case `GetExecutionDensityUseCase` (RBAC, escopo, recusa de `inspectorId` para CL, **período só-preset para CL contra o hoje de Sydney** [U20–U21a], k por role + refiltro, corte em 5.000, montagem da resposta, U22) | backend | `apps/backend/src/modules/inspector-execution/application/use-cases/get-execution-density.use-case.ts` (novo) · `apps/backend/tests/unit/inspector-execution/get-execution-density.use-case.test.ts` (novo) | 0,3 |
| [ ] | P5 · `PrismaExecutionDensityReader` (`$queryRaw` agregado + totais) e teste DB (incl. caracterização D17/D18, L-F09-02) | backend | `apps/backend/src/modules/inspector-execution/infrastructure/prisma-execution-density.reader.ts` (novo) · `apps/backend/tests/integration/db/execution-density.integration.test.ts` (novo) | 0,4 |
| [ ] | P6 · Rota + container + registro + mock container (incl. R9) | backend | `apps/backend/src/modules/inspector-execution/interfaces/execution-density.routes.ts` (novo) · `apps/backend/src/main/container.ts` · `apps/backend/src/main/routes.ts` · `apps/backend/tests/helpers/mock-container.ts` (modify) · `apps/backend/tests/integration/inspector-execution/execution-density.routes.test.ts` (novo) | 0,2 |
| [ ] | P7 · Regenerar OpenAPI e tipos (`pnpm --filter backend generate:openapi` → `pnpm --filter @properfy/shared generate:types`) e commitar | shared | `packages/shared/openapi.json` (regen) · `packages/shared/src/api-types.ts` (regen) | 0,05 |
| [ ] | P8 · CLAUDE.md (X00): backend (endpoint, regra "densidade nunca devolve coordenada individual; agregação no SQL; k = 3 para CL; CL só com períodos-preset porque o k por consulta não resiste à diferença de janelas — risco residual documentado; a camada mede check-ins, não serviços concluídos (conta `DONE → REJECTED` e reabertos); índice de célula por `FLOOR(coord * 1000)` em numeric, nunca divisão por parâmetro float"; o reader não tem método de linhas cruas) e shared (novo schema, constantes, `isExecutionDensityPreset`, chave `map.execution_density` na matriz) | docs | `apps/backend/CLAUDE.md` · `packages/shared/CLAUDE.md` (modify) | 0,05 |
| [ ] | P9 · Gates + descrição do PR com evidência de D.A3 | QA | – | 0,1 |
| | **Total** | | ~21 arquivos | **1,7** |

Ordem: P1 → P1a → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9.

### Contratos

**`GET /v1/map/execution-density`**

- **Auth:** Bearer JWT (`createAuthMiddleware` com checagem de agência ativa, igual ao `dashboard.routes.ts`).
- **Query** (`executionDensityQuerySchema`, Zod; também é o `schema.querystring` da rota):

| Parâmetro | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `fromDate` | `YYYY-MM-DD` (`civilDateSchema`) | sim | data civil em `PLATFORM_TIMEZONE` |
| `toDate` | `YYYY-MM-DD` | sim | `toDate >= fromDate`; período inclusivo ≤ `MAX_EXECUTION_DENSITY_PERIOD_DAYS` (366). **CL:** além disso, `toDate` = hoje (Sydney) e período de 7, 30 ou 90 dias inclusivos (`EXECUTION_DENSITY_PRESET_DAYS`), checado no use case (L-F09-01) |
| `tenantId` | uuid | não | AM/OP: restringe à agência. CL: **ignorado** (usa o tenant do JWT) |
| `inspectorId` | uuid | não | AM/OP: restringe ao inspetor **que fez o check-in** (`inspection_executions.inspector_id`). CL: **403** |

- **Resposta 200** (`successResponseSchema(executionDensityResponseSchema)` → `{ data: … }`):

```ts
{
  fromDate: string;              // eco do pedido
  toDate: string;                // eco do pedido
  gridSizeDegrees: 0.001;        // EXECUTION_DENSITY_GRID_DEGREES
  minCellCount: number;          // 1 para AM/OP, 3 para CL (células abaixo disso foram ocultadas)
  cells: Array<{
    lat: number;                 // centro da célula, 4 casas
    lng: number;                 // centro da célula, 4 casas
    count: number;               // inteiro >= 1
  }>;                            // ordenado por count DESC, depois latIndex/lngIndex
  cellCount: number;             // cells.length
  totalExecutions: number;       // execuções com coordenada válida no recorte (inclui as de células cortadas e as de células ocultadas pelo k)
  excludedWithoutCoordinates: number; // execuções no recorte com coordenada inválida
  truncated: boolean;            // true quando havia mais de MAX_EXECUTION_DENSITY_CELLS células
}
```

- **Erros** (envelope `{ error: { code, message, details } }`):

| Status | `code` | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | query inválida (data, ordem, período > 366 dias, uuid) |
| 400 | `VALIDATION_ERROR` com `details: { reason: 'PERIOD_NOT_A_PRESET', allowedDays: [7, 30, 90] }` | CL com período que não é um preset ancorado no hoje de Sydney (mensagem: `Agency accounts can only view the last 7, 30 or 90 days.`) (L-F09-01) |
| 401 | (do middleware) | sem token / token inválido |
| 403 | `AUTH_FORBIDDEN` | role fora de `AM/OP/CL_ADMIN/CL_USER`; CL com `inspectorId` (mensagem: `Filtering activity density by inspector is not available for agency accounts.`) |
| 403 | `TENANT_SCOPE_REQUIRED` | CL sem tenant no JWT (vem do `requireTenantScope`) |

- **RBAC e escopo por role:**

| Role | Acesso | Escopo efetivo | `tenantId` | `inspectorId` |
|---|---|---|---|---|
| AM | sim | plataforma | aplicado | aplicado |
| OP | sim | plataforma (não depende de `actor.tenantId`) | aplicado | aplicado |
| CL_ADMIN | sim | própria agência | ignorado | 403 |
| CL_USER | sim (sem flag; o `/map` não exige flag) | própria agência | ignorado | 403 |
| INSP | 403 | – | – | – |
| TNT | 403 | – | – | – |

- **Use case** (`GetExecutionDensityUseCase.execute({ actor, query })`), nesta ordem:
  1. `if (!EXECUTION_DENSITY_ROLES.includes(actor.role)) throw new ForbiddenError('AUTH_FORBIDDEN', …)` com `EXECUTION_DENSITY_ROLES = APPOINTMENT_LIST_ROLES` (reusa a constante de `appointment-list-scope.ts`; U22 garante que é igual à entrada `map.execution_density` da matriz). Isso vem **antes** do helper de escopo, que lança `Error` (500) para INSP/TNT.
  2. `const pinned = requireTenantScope(actor, 'map.execution_density')` (mesma chave da `ROLE_ACTION_MATRIX`, L-F09-09). Se `pinned` existe (CL) e `query.inspectorId` veio → 403.
  2a. Se `pinned` existe (CL) e `!isExecutionDensityPreset(query, todayInTzDateString(PLATFORM_TIMEZONE))` → `ValidationError` com `details.reason = 'PERIOD_NOT_A_PRESET'` (L-F09-01). O "hoje" vem de um relógio injetável (`now: () => Date`) para os testes U20/U21.
  3. `const tenantId = resolveAppointmentListTenantScope(actor, query.tenantId)` (mesmo helper do `/map`, D.A3 no padrão).
  4. `const { from, toExclusive } = periodToInstants(query.fromDate, query.toDate)`.
  5. `const minCellCount = pinned ? MIN_CELL_COUNT_CL : MIN_CELL_COUNT_GLOBAL` (decidido pelo **tipo de escopo**, não por lista de roles, para que um role pinned novo herde o k = 3).
  6. `reader.aggregate({ from, toExclusive, tenantId, inspectorId: pinned ? undefined : query.inspectorId, gridScale: EXECUTION_DENSITY_GRID_SCALE, minCellCount, limit: MAX_EXECUTION_DENSITY_CELLS })`.
  7. Monta a resposta: refiltra `rows.filter(r => r.count >= minCellCount)` (segunda barreira, U16); `truncated = rows.length > limit`; corta em `limit`; `cellCenter` em cada linha; `minCellCount` na resposta.
- **Porta** (`domain/execution-density.reader.ts`):

```ts
export interface ExecutionDensityFilters {
  from: Date; toExclusive: Date;
  tenantId?: string; inspectorId?: string;
  gridScale: number; minCellCount: number; limit: number;
}
export interface ExecutionDensityRow { latIndex: number; lngIndex: number; count: number }
export interface ExecutionDensityReader {
  aggregate(f: ExecutionDensityFilters): Promise<{ rows: ExecutionDensityRow[]; totals: { valid: number; invalid: number } }>;
}
```

  Não existe método que devolva coordenadas individuais. Comentário na interface explicando que é a garantia de privacidade (não "simplificar" para buscar linhas e agregar em memória).
- **Rota:** novo arquivo `execution-density.routes.ts` com `ExecutionDensityRouteContainer { getExecutionDensityUseCase; jwtService; tenantRepo }` e `registerExecutionDensityRoutes(app, container)`; chave `executionDensity` no `AppContainer` e no `mock-container.ts`; `await registerExecutionDensityRoutes(app, container.executionDensity)` no `routes.ts`. Prefixo `/v1/map/…` porque o consumidor é o `/map` (o plano fixa a rota).

### Algoritmo

1. **Grade fixa em graus**, `EXECUTION_DENSITY_GRID_SCALE = 1000` células por grau (`EXECUTION_DENSITY_GRID_DEGREES = 0.001`). Em Sydney (~-34°), uma célula tem ~111 m (norte-sul) × ~92 m (leste-oeste): "~100 m", como decidido. Grade fixa (não dependente de zoom) para que a mesma execução caia sempre na mesma célula e para que a resposta não mude de precisão conforme o pedido.
2. **Índice da célula no SQL, por escala inteira:** `FLOOR(e.start_latitude * ${scale}::int)::int` (idem longitude). **Armadilha corrigida:** `FLOOR(e.start_latitude / ${grid})` com `grid = 0.001` vindo do JS é ligado pelo Prisma como `float8`; `numeric / float8` vira `float8` e um ponto exatamente na linha da grade (ex.: `-33.8690000`) pode cair na célula vizinha, divergindo do `toCellIndex`. Com `numeric * int` a conta fica em `numeric`, exata para `Decimal(10,7)`. O espelho TS `toCellIndex(decimalString)` desloca a vírgula 3 casas com aritmética inteira (sem `Math.floor` em float). G5a e D16 provam a igualdade nos pontos de borda. `FLOOR` (e não `ROUND`/`TRUNC`) para que o negativo caia na célula certa (G3).
3. **Centro da célula no app:** `lat = Number(((latIndex + 0.5) * 0.001).toFixed(4))` (idem `lng`). O ponto devolvido é **sempre o centro**, **nunca a média** dos pontos da célula: a média de uma célula com uma execução seria a coordenada exata do inspetor. Distância máxima do ponto real ao centro ≈ 72 m.
4. **Agregação no Postgres, não no app.** As coordenadas cruas nunca saem do banco; o reader devolve só `(latIndex, lngIndex, count)`. **Sem PostGIS:** as coordenadas da execução não são geometria, `ST_SnapToGrid` exigiria `ST_MakePoint` por linha e daria o mesmo resultado que o `FLOOR`.
5. **Query principal** (montada com `Prisma.sql`, fragmentos condicionais para `tenantId`/`inspectorId`, nada interpolado como string):

```sql
SELECT FLOOR(e.start_latitude  * ${scale}::int)::int AS "latIndex",
       FLOOR(e.start_longitude * ${scale}::int)::int AS "lngIndex",
       COUNT(*)::int                           AS "count"
FROM inspection_executions e
JOIN appointments a ON a.id = e.appointment_id
WHERE e.started_at >= ${from} AND e.started_at < ${toExclusive}
  AND e.abandoned_at IS NULL
  AND a.deleted_at IS NULL
  [AND a.tenant_id = ${tenantId}]
  [AND e.inspector_id = ${inspectorId}]
  AND e.start_latitude  BETWEEN -90  AND 90
  AND e.start_longitude BETWEEN -180 AND 180
  AND NOT (e.start_latitude = 0 AND e.start_longitude = 0)
GROUP BY 1, 2
HAVING COUNT(*) >= ${minCellCount}::int
ORDER BY 3 DESC, 1, 2
LIMIT ${limit + 1}::int
```

6. **Totais** (segunda query, mesmo `FROM/JOIN/WHERE` sem o filtro de coordenada válida): `COUNT(*) FILTER (WHERE <coordenada válida>)::int AS valid`, `COUNT(*) FILTER (WHERE NOT <coordenada válida>)::int AS invalid`. As duas queries rodam em `Promise.all` (leitura, sem transação).
7. **Supressão de células pequenas (k-anonimato, decisão do dev em 2026-10-28):** `MIN_CELL_COUNT_CL = 3` para CL_ADMIN/CL_USER e `MIN_CELL_COUNT_GLOBAL = 1` para AM/OP, aplicados no `HAVING` e refiltrados no use case. Fronteira: 2 → oculta, 3 → visível (D13, D14, U16, U17).
   - **Nota de privacidade:** a geo do check-in é a posição do inspetor. Uma célula com 1 ou 2 check-ins pode apontar, com ~100 m de precisão, onde um inspetor específico estava (por exemplo, um check-in feito longe do imóvel). Com k = 3, o CL só vê áreas onde houve pelo menos 3 check-ins dos seus appointments, o que dilui a identificação de uma visita isolada. AM/OP já têm acesso operacional à execução e veem tudo, também agregado.
   - **Efeito esperado na UX do CL:** períodos curtos (7 dias) ou agências pequenas podem mostrar poucas ou nenhuma área. Isso é aceito; o painel avisa (TASK-F09-2).
   - **Limite do k por consulta (L-F09-01):** o `HAVING` vale dentro de cada pedido; com período livre, duas consultas que diferem em 1 dia revelam o check-in desse dia. Por isso o CL só consulta os presets de 7/30/90 dias terminando hoje (Contratos, passo 2a). A diferença entre presets ainda revela o agregado de faixas de dias (8–30, 31–90), sem isolar um dia; esse resíduo é aceito e documentado no PR e no CLAUDE.md do backend. A nota acima vale para uma visualização isolada, não para combinações arbitrárias de janelas, e não deve ser reescrita como garantia absoluta.
   - **Não** há exclusão por `out_of_radius` (decisão do dev: só o k).
   - `totalExecutions` continua contando todas as execuções válidas do recorte (número agregado, sem localização).
8. **Período → instantes:** `from = parseDateInTimezone(fromDate, PLATFORM_TIMEZONE)`, `toExclusive = parseDateInTimezone(nextCivilDay(toDate), PLATFORM_TIMEZONE)`; intervalo semiaberto `[from, toExclusive)`, correto em dias de 23 h/25 h (G7, G8).
9. **O que conta como "execução":** toda linha de `inspection_executions` com `started_at` no período e `abandoned_at IS NULL`, de appointment não deletado, **em qualquer status** (em andamento, finalizada, ou appointment que depois voltou para REJECTED/DRAFT: o check-in aconteceu). Execução reiniciada (F03 D13) conta uma vez, no último check-in.
   - **Consequências escritas (L-F09-02):** a camada mede **check-ins registrados, não serviços concluídos**. (a) `DONE → REJECTED` (evento `DONE_REJECTED`, base do estorno "marcado como feito mas não executado") **conta**: o check-in existe, mesmo que o serviço tenha sido estornado (D17). (b) Appointment reaberto (`reopen-execution`, `resumed_at` preenchido) conta **uma vez**, com as coordenadas do `started_at` original, porque o `start` idempotente devolve a execução existente sem atualizar a geo e o `reopen` preserva `started_at`/`start_*` (D18). Em `DONE → DRAFT` seguido de nova execução por **outro** inspetor sem abandono, a linha continua com o check-in e o `inspector_id` do primeiro (limitação do modelo de 1 linha por appointment; não tratada aqui).

### Performance

- **Índice usado:** `inspection_executions(started_at)` (existe) para o recorte do período; join por `appointments.id` (PK). O filtro de `tenant_id` é aplicado depois do join; com o volume atual (execuções = appointments concluídos, dezenas de milhares por ano) isso é barato. **Sem índice novo e sem migration** neste PR. Se o `EXPLAIN ANALYZE` em staging (passo do smoke) passar de ~200 ms para 366 dias sem agência, o índice candidato é `inspection_executions(started_at) INCLUDE (appointment_id, inspector_id, start_latitude, start_longitude)`, registrado como follow-up, não feito aqui.
- **Teto de período:** 366 dias (mesmo raciocínio do `MAX_ANALYTICS_PERIOD_DAYS`).
- **Teto de células:** 5.000 (`LIMIT 5001` para detectar o corte). Mantém o payload < ~150 KB e o heatmap fluido no browser.
- **Sem cache no servidor.** O web usa `staleTime` de 5 min.

### Casos de borda

- **Nenhuma execução no período:** 200 com `cells: []`, `totalExecutions: 0`.
- **CL com execuções só em células de 1–2 check-ins:** 200 com `cells: []`, `totalExecutions > 0` e `minCellCount: 3`; o web mostra a explicação.
- **Execução sem coordenada utilizável:** as colunas são NOT NULL; o que existe na prática é `(0,0)` ou valor fora da faixa (cliente antigo/bug). Fica fora das células e conta em `excludedWithoutCoordinates`.
- **Execução abandonada (F03):** fora (D13). Se reiniciada, entra pelo novo check-in.
- **Appointment soft-deletado:** fora.
- **CL com uma agência só:** é o caso normal; o escopo é o tenant do JWT. `tenantId` de outra agência é ignorado (U5, D2/D3).
- **Filtro de inspetor para CL:** 403 (U6, R6). O web nunca envia (TASK-F09-2).
- **OP:** o JWT nunca traz `tenantId`; o caminho não depende dele (U3).
- **AM/OP com `tenantId` inexistente:** 200 vazio (não 404; mesmo comportamento do filtro da lista).
- **Período muito grande:** 400 acima de 366 dias; dentro do teto, corte em 5.000 células com `truncated: true`.
- **Período no futuro:** válido, devolve vazio.
- **Inspetor que trocou de agência / atende várias agências:** o escopo é pela agência do **appointment**, então o CL só vê os check-ins dos próprios appointments.
- **CL com período fora dos presets (L-F09-01):** 400 `PERIOD_NOT_A_PRESET`, mesmo que o período seja válido para AM/OP (U20, R9).
- **CL na virada do dia em Sydney:** um pedido montado às 23:59 com `toDate` = hoje que chega depois das 00:00 recebe 400 `PERIOD_NOT_A_PRESET` (o "hoje" do servidor já avançou). Sem tolerância de "ontem" no servidor (aceitar `toDate` = ontem reabriria a diferença de 1 dia); o web reancora o preset e refaz o pedido (TASK-F09-2).
- **Appointment `DONE → REJECTED` (`DONE_REJECTED`):** conta (D17).
- **Appointment reaberto:** conta uma vez, com o check-in original (D18).

### Fora do escopo

- Qualquer mudança no `/analytics`, no `RegionHeatmap` ou no módulo `dashboard`.
- % travado / 01.13 (F05).
- Coluna `tenant_id` em `inspection_executions`; índice novo; migration.
- Outras dimensões (finish, duração, status), exportação, previsão.
- Uso na tela Dia ao Vivo (F05).
- Excluir da camada appointments `DONE → REJECTED`, `DRAFT` ou `CANCELLED` com execução (decidido em 2026-10-29: conta tudo, L-F09-02).
- Supressão estável por célula (k sobre toda a história da agência) ou período mínimo para CL além dos presets (alternativas descartadas em L-F09-01).

### Critérios de aceite

- **D.A1 (backend):** o endpoint devolve só as execuções com `started_at` no período civil pedido, em Sydney, com bordas exatas (D1, D6, D7, G7, G8). O padrão de 30 dias é do web (TASK-F09-2).
- **D.A2 (backend):** `tenantId` e `inspectorId` mudam o resultado para AM/OP (D2–D5, U2, U3).
- **D.A3:** um CL de outra agência não vê pontos alheios. Provado no use case com duas agências (U4, U5) e no banco (D2, D3). Nenhum perfil recebe coordenada individual (U13, D11, R7); o CL não vê células com menos de 3 check-ins (U15–U17, D12–D14) e só consulta os períodos-preset de 7/30/90 dias terminando hoje, então não consegue diferenciar janelas de 1 dia (U20, U21, U21a, R9; L-F09-01).
- **RBAC documentado (L-F09-09):** `ROLE_ACTION_MATRIX['map.execution_density']` existe e bate com os roles aceitos pelo use case (M1, M2, U22).
- **Semântica de "execução" (L-F09-02):** `DONE → REJECTED` e reabertos contam como check-ins (D17, D18).

### Dependências

- **TASK-F03-2 em `develop`** (coluna `abandoned_at`). Sem ela, a query não compila no banco. Se a F09 precisar sair antes, **não** remover o filtro: esperar.
- Dentro do PR: `pnpm --filter @properfy/shared build` depois de P1 e antes do backend; regenerar o api-types (P7).

### Riscos e armadilhas

- **Privacidade por construção:** não trocar o SQL agregado por `findMany` + agregação em memória "para facilitar o teste"; a porta não tem método de linhas cruas de propósito. Não devolver a média da célula.
- **`requireTenantScope` lança `Error` para INSP/TNT:** checar o role antes (U8/U9), senão vira 500.
- **`$queryRaw`:** `COUNT(*)` é `bigint` (quebra o `JSON.stringify`) → `::int`; parâmetros inteiros com `::int`.
- **`FLOOR` vs `ROUND`/`TRUNC`:** só `FLOOR` mantém a célula estável em negativos.
- **Parâmetro float no SQL:** nunca dividir a coluna por um número vindo do JS (`${0.001}` vira `float8`); usar `* ${scale}::int` (D16).
- **k por escopo, não por lista:** decidir `minCellCount` pelo resultado do `requireTenantScope` (pinned → 3), para que um role novo não herde o 1 por omissão.
- **Fuso:** nunca `new Date('YYYY-MM-DD')` (UTC); usar `parseDateInTimezone`.
- **Mock container:** sem a chave `executionDensity` no `mock-container.ts`, todos os testes de rota que usam o helper quebram.
- **Validação antes da auth no Fastify:** teste de 401 precisa de query válida (R2).
- **Suíte DB fora do run principal:** o teste D só roda com a config de integração DB; rodar explicitamente (ver Verificação).

### Deploy / rollout / rollback

- **Deploy:** só código (sem migration, sem env nova, sem seed). Staging primeiro, depois prod (pipeline normal).
- **Rollout:** o endpoint fica sem consumidor até a TASK-F09-2; pode ir para prod sozinho.
- **Rollback:** reverter o PR. Nada a desfazer no banco. Se a TASK-F09-2 já estiver em prod, reverter a web primeiro (senão o toggle mostra o estado de erro).
- **Smoke em staging:** `curl` com token AM (`fromDate` = hoje-29, `toDate` = hoje) → 200 com células; com token CL_ADMIN + `inspectorId` → 403; com token CL_ADMIN + `tenantId` de outra agência → mesmas células que sem o parâmetro; resposta do CL com `minCellCount: 3` e nenhuma célula com `count < 3`; com token CL_ADMIN e `fromDate=2026-10-01&toDate=2026-10-10` (fora dos presets) → 400 `PERIOD_NOT_A_PRESET`; o mesmo com token AM → 200. `EXPLAIN ANALYZE` da query para 366 dias sem agência (anotar o tempo no PR).

### Dias · Branch · Verificação

- **Dias:** 1,7 (P1 0,3 · P1a 0,05 · P3 0,25 · P4 0,3 · P5 0,4 · P6 0,2 · P7 0,05 · P8 0,05 · P9 0,1). +0,2 sobre o plano: L-F09-01 (presets para CL) 0,1, L-F09-09 (matriz) 0,05, L-F09-02 (D17/D18) 0,05.
- **Branch:** `feat/map-execution-density-api` a partir de `develop`, em worktree; PR → `develop`. Commits: `feat(shared): add execution density contract` · `feat(shared): add map.execution_density to the role matrix` · `feat(backend): aggregate check-in density on a 100 m grid` · `feat(backend): expose GET /v1/map/execution-density` · `chore(shared): regenerate api types` · `docs: document execution density endpoint`.
- **Gates (no worktree):** `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test` · `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test` · `pnpm --filter backend exec vitest run -c vitest.integration-db.config.ts tests/integration/db/execution-density.integration.test.ts` · `git diff --stat origin/develop... | tail -1` (< 150 arquivos; esperado ~21).
- **Descrição do PR:** tabela D.A1/D.A2/D.A3 → testes; nota de privacidade (agregação no SQL, centro da célula, k = 3 para CL decidido em 2026-10-28, índice por escala inteira); **risco residual** do k por consulta e a mitigação por presets fixos para CL (L-F09-01); nota "a camada mede check-ins, não serviços concluídos" (L-F09-02); nova chave da matriz (L-F09-09).

---

## TASK-F09-2 · Web: camada "Activity density" no `/map`

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F09-1
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F02-1, TASK-F03-3, TASK-F03-4, TASK-F04-1
> - **Pista sugerida (time de 6):** E · Full-stack / QA

### Objetivo

No `/map` (modo Appointments), um botão **"Activity density"** liga uma camada de calor com os check-ins agregados da TASK-F09-1. Ao ligar:

- aparece um painel pequeno com o **seletor de período da camada** (padrão: últimos 30 dias, independente do "Date Range" dos pins);
- a camada respeita os filtros de **agência** e **inspetor** que já existem no painel do mapa (AM/OP);
- há legenda e um resumo em texto (não só cor);
- a camada fica **abaixo** das camadas do laço (`mapbox-gl-draw`) e é reaplicada depois de `style.load`.

O `AppointmentMapPage.tsx` só recebe a fiação (≤ ~12 linhas). Nenhum dashboard muda.

### Contexto no código (verificado)

- `apps/web/src/features/appointments/pages/AppointmentMapPage.tsx` (1.529 linhas):
  - `mapInstance` vem de `<MapContainer key={mode} onMapReady={setMapInstance}>` (l.1239); um effect zera o `mapInstance` quando o modo muda (o mapa é recriado por modo);
  - `isGlobalRole = hasRole('AM','OP')` (l.317); `appointmentFilters.tenantId` e `appointmentFilters.inspectorId` (l.393-394) só existem no modo appointments e só são editáveis por AM/OP (as opções de agência e inspetor usam `enabled: isGlobalRole`, l.559-575);
  - toolbar do canto superior direito (l.1366-1378): `MapLassoToggleButton` + `MapListViewToggleButton`, `absolute right-14 top-4 z-30 flex gap-2`;
  - `MapLassoSelect` (l.1295) recebe `map={mapInstance}`.
- `apps/web/src/features/appointments/components/AppointmentMapFilterPanel.tsx`: `AppointmentModeFilters` tem `tenantId` e `inspectorId` ("AM/OP-only"); `GroupModeFilters` **não** tem nenhum dos dois.
- `apps/web/src/components/map/MapLassoSelect.tsx`: o `MapboxDraw` é criado só quando o laço liga (`map.addControl(draw)`, l.183-190) com `LASSO_STYLES` de ids `gl-draw-polygon-fill-properfy`, `gl-draw-polygon-stroke-properfy`, `gl-draw-polygon-and-line-vertex-properfy`. O `mapbox-gl-draw` cria as camadas com sufixo `.cold`/`.hot` → reconhecer pelo prefixo `gl-draw-`. Se a densidade for adicionada sem `beforeId` **depois** do laço, ela fica por cima do polígono.
- `apps/web/src/features/analytics/components/RegionHeatmap.tsx:47-70`: padrão a reusar (fonte GeoJSON + camada `heatmap`, `getSource` → `setData` ou `addSource` + `addLayer`, peso interpolado por `count`). **Não editar** (dashboard). O `HEATMAP_RAMP` (`charts/theme.ts:78`) é `rgba(33,86,110,…)` e mora em `features/analytics`; a camada nova define a própria rampa em **HSL com vírgula** com a mesma cor (`rgb(33,86,110)` = `hsl(199, 54%, 28%)`), sem importar de `features/analytics`.
- `apps/web/src/components/map/MapContainer.tsx`: estilo fixo `mapbox://styles/mapbox/streets-v12`; `onMapReady` dispara no `load`. Hoje nada troca o estilo, mas a camada se reaplica em `style.load` (regra do plano) para sobreviver a um `setStyle` futuro.
- `apps/web/src/components/filters/FilterSegmented.tsx` (tablist acessível com setas) e `FilterDateRange.tsx` (`label/startDate/endDate/onStartChange/onEndChange`; a F00 P7 acrescenta `min`/`max`).
- Fuso no web: `todayInTzDateString(tz)` e `addCivilDays(date, n)` de `@properfy/shared` + `PLATFORM_TIMEZONE`. Nunca `new Date().toISOString().slice(0,10)`.
- Padrão de query: `useQuery` + `api.GET('/v1/…', { params: { query } })` (ex.: `features/analytics/hooks/useAnalytics.ts:51-63`).
- Memória do projeto: cor em paint do Mapbox com HSL **com espaço** quebra o mapa (PR #1302, "use comma HSL … map failed to load"); os tokens do Tailwind são HSL com espaço e **não** podem ir direto para o paint.

### Decisões aplicáveis

- (2026-10-27, plano F09) Período da camada: **seletor próprio, padrão últimos 30 dias**, independente do filtro de datas dos pins (a janela da F00 é futura; execuções são passadas).
- (2026-10-27, plano F09) Agência e inspetor **vêm dos filtros do mapa** (D.2/D.3 já existem).
- (2026-10-27, plano F09) CL vê só os próprios dados, agregados; AM/OP veem tudo, agregado (garantido no backend, TASK-F09-1).
- (2026-10-27, plano F09) Componente separado `components/map/DensityLayer.tsx`, reaplicado depois de `style.load`; não crescer o `AppointmentMapPage.tsx`; camadas do draw por cima; paint em HSL com vírgula.
- (2026-10-27, README) Dashboards existentes não mudam; `/analytics` não é tocado. Cada PR atualiza o CLAUDE.md do workspace que muda (X00).
- (2026-10-27, F00) A janela de 14 dias da F00 vale para os **pins**; a camada não lê nem altera `dateFrom/dateTo`.
- (2026-10-28, dev) **Confirmado:** a camada existe só no modo **Appointments**; o modo Groups não tem filtro de agência/inspetor (`GroupModeFilters`).
- (2026-10-28, dev) Para CL, o backend oculta células com menos de 3 check-ins; o web só explica (não filtra nada).
- (2026-10-29, L-F09-01) **CL só com presets:** para CL o seletor mostra só `Last 7 days` · `Last 30 days` · `Last 90 days` (sem `Custom`); o backend recusa outros períodos de CL com 400 `PERIOD_NOT_A_PRESET`. AM/OP mantêm o `Custom`. Ao receber `PERIOD_NOT_A_PRESET` (virada do dia), o controle reancora o preset no novo "hoje" e refaz o pedido **uma vez**; se falhar de novo, mostra o estado de erro.
- (2026-10-29, L-F09-03) **O web não importa `MIN_CELL_COUNT_CL`.** O hook devolve `minCellCount` (default `1` sem resposta) e `cellCount` da resposta; os textos de privacidade e o resumo usam esses campos.
- (2026-10-29, L-F09-04) **Escala relativa, dita na UI:** o peso continua normalizado pelo `maxCount` da resposta atual; a legenda mostra os números `1` e `{maxCount}` (em vez de `Fewer`/`More`) e a frase `Colour is relative to the busiest area in this view.`; com `maxCount === 1`, um só rótulo `1`. Sem escala absoluta nem tooltip por célula.
- (2026-10-29, L-F09-05) **Quando o "hoje" é avaliado:** ao ligar a camada e ao selecionar um preset/aplicar o `Custom` (o período fica no estado junto com o preset, não é derivado em render). Sem timer; refetch por `staleTime`/foco reutiliza o mesmo período; desligar e religar recalcula. Mesma escolha da F00 para a janela dos pins ("hoje" não avança sozinho).
- (2026-10-29, L-F09-06) **Densidade é Sydney-only por desenho:** o backend agrega em `PLATFORM_TIMEZONE`, então o web usa `PLATFORM_TIMEZONE` para o "hoje" (para que `toDate = hoje` inclua o dia corrente e bata com a validação de presets do servidor). Diverge **de propósito** da F00, que usa `resolveWindowTimezone(tenant.timezone)` para os pins; hoje o efeito é nulo (todas as agências em `Australia/Sydney`).
- (2026-10-29, L-F00-03) **"N dias" da F09 ≠ "N dias" da F00, de propósito:** o preset da F09 é **retrospectivo e exato** (`Last 30 days` = 30 dias civis terminando hoje: `addCivilDays(today, -(N-1))..today`); a janela dos pins da F00 é `Today + N days` (hoje..hoje+N = N+1 dias civis). **Não unificar** as cópias nem os helpers (`presetRange` × `computeWindowRange`/`formatWindowLabel`) por engano.
- (2026-10-29, L-F09-07) **Linha de escopo sempre diz o que não se aplica:** AM/OP → `All agencies` / `Filtered by agency` / `Filtered by inspector` / `Filtered by agency and inspector`, seguido de `Other map filters (status, branch, service, dates) don't apply.`; CL → `Your agency's inspections only. Other map filters don't apply.`
- (2026-10-29, L-F09-08) **Erro esvazia a camada:** em `isError` o hook devolve o estado vazio (`isError ? EMPTY : data`, ignorando dados anteriores e placeholder); a camada recebe `cells: []` (fonte com coleção vazia, não removida), o resumo mostra só a mensagem de erro + `Retry`, a legenda fica oculta.

### Testes primeiro (TDD)

**A. `apps/web/src/components/map/DensityLayer.test.tsx` (novo)** — mapa falso com `getSource`, `addSource`, `removeSource`, `getLayer`, `addLayer`, `removeLayer`, `getStyle().layers`, `isStyleLoaded`, `on`, `off`, `setPaintProperty`.

| # | Cenário | Esperado |
|---|---|---|
| L1 | `visible`, 2 células, estilo carregado, sem camadas do draw | `addSource('execution-density', { type: 'geojson', data })` com 2 features `Point` `[lng, lat]` e `properties.count`; `addLayer({ id: 'execution-density-layer', type: 'heatmap', … }, undefined)` |
| L2 | mesmo cenário com `getStyle().layers` contendo `gl-draw-polygon-fill-properfy.cold` | `addLayer(…, 'gl-draw-polygon-fill-properfy.cold')` (primeira camada `gl-draw-*` da pilha) |
| L3 | rerender com células novas | `setData` na fonte existente; **nenhum** `addSource/addLayer` novo |
| L4 | `maxCount` muda (3 → 10) | `setPaintProperty('execution-density-layer', 'heatmap-weight', [... 10, 1])` |
| L5 | `visible: false` | `removeLayer` + `removeSource` (se existirem); nenhum `addLayer` |
| L6 | unmount | `off('style.load', handler)` + remove camada e fonte; sem exceção se o mapa já foi removido (`getStyle` lança → engolido) |
| L7 | dispara o handler de `style.load` depois de um "setStyle" (fonte e camada sumiram) | fonte e camada recriadas com as **últimas** células; nesse instante o draw ainda não recolocou as camadas dele, então o `addLayer` sai sem `beforeId` |
| L7a | **ordem depois do `style.load`:** continuação de L7; o mapa falso passa a ter `gl-draw-polygon-fill-properfy.cold` **acima** da densidade e dispara `styledata` (é o que o `mapbox-gl-draw` faz ao readicionar as camadas) | `moveLayer('execution-density-layer', 'gl-draw-polygon-fill-properfy.cold')` chamado uma vez; resultado: densidade imediatamente abaixo da primeira `gl-draw-*` |
| L7b | `styledata` com a densidade **já** abaixo de todas as `gl-draw-*` | `moveLayer` **não** é chamado (evita laço: o próprio `moveLayer` dispara `styledata`) |
| L7c | laço ligado **depois** da densidade (draw adiciona camadas no topo) + `styledata` | `moveLayer` não é chamado (o draw já está por cima) |
| L7d | `styledata` sem a camada de densidade (toggle desligado) | nenhuma chamada a `moveLayer`/`addLayer` |
| L8 | `isStyleLoaded() === false` no mount | nada é adicionado até o `style.load`; depois do evento, adiciona uma vez |
| L9 | `map: null` | não lança; não registra handler |
| L6a | unmount | também `off('styledata', handler)` |
| L10 | todas as strings de cor do paint (`heatmap-color`) | casam `/^hsla?\(\d+, \d+%, \d+%(, [\d.]+)?\)$/` (HSL com vírgula) e nenhuma contém `hsl(… … …)` com espaço |
| L11 | `cells: []` com `visible` | fonte criada com `FeatureCollection` vazia (camada pronta para o próximo período), sem erro |
| L12 | o componente renderiza | `null` (sem DOM) |

**B. `apps/web/src/features/appointments/lib/execution-density-period.test.ts` (novo)** — relógio fixo em `2026-11-03T14:30:00Z` (= 04/11 01:30 em Sydney; UTC ainda é 03/11).

| # | Entrada | Esperado |
|---|---|---|
| P1 | `presetRange('30d')` | `{ fromDate: '2026-10-06', toDate: '2026-11-04' }` (30 dias inclusivos, "hoje" de Sydney) |
| P2 | `presetRange('7d')` | `{ fromDate: '2026-10-29', toDate: '2026-11-04' }` |
| P3 | `presetRange('90d')` | `{ fromDate: '2026-08-07', toDate: '2026-11-04' }` |
| P4 | `validateCustomRange('2026-10-10', '2026-10-01')` | `'End date must be on or after the start date.'` |
| P5 | `validateCustomRange('2025-01-01', '2026-11-04')` | `'Period can’t be longer than 366 days.'` |
| P6 | `validateCustomRange('2026-10-01', '2026-11-05')` | `'End date can’t be in the future.'` |
| P7 | `validateCustomRange('', '2026-11-01')` | `'Choose a start and end date.'` |
| P8 | `validateCustomRange('2026-10-01', '2026-10-31')` | `null` |
| P9 | `presetRange` espionado; o controle seleciona `Last 30 days` e depois rerenderiza com o relógio avançado 1 dia (`2026-11-04T14:30:00Z`) (L-F09-05) | `presetRange` chamado **uma vez** na seleção; o período continua `2026-10-06..2026-11-04`; nenhuma requisição nova |
| P10 | `presetRange` usa `isExecutionDensityPreset` do shared como verificação: `isExecutionDensityPreset(presetRange('7d'|'30d'|'90d'), '2026-11-04')` | `true` nos três (o web e o backend concordam sobre o que é preset; L-F09-01) |

**C. `apps/web/src/features/appointments/hooks/useExecutionDensity.test.tsx` (novo)** — MSW ou `api` mockado, `QueryClientProvider`.

| # | Cenário | Esperado |
|---|---|---|
| H1 | `enabled: false` | nenhuma requisição |
| H2 | `enabled`, período padrão, sem agência/inspetor | `GET /v1/map/execution-density?fromDate=2026-10-06&toDate=2026-11-04` **sem** `tenantId`/`inspectorId` |
| H3 | `tenantId: 'T1'`, `inspectorId: 'I1'` | query com os dois |
| H4 | `tenantId: ''` | parâmetro omitido (nunca string vazia, que o backend recusaria) |
| H5 | troca de período | nova requisição; dados anteriores mantidos durante o fetch (`placeholderData: keepPreviousData`) |
| H6 | resposta 403/500 **depois** de uma resposta de sucesso com 3 células (L-F09-08) | `isError: true`, `cells: []`, `totalExecutions: 0`, `cellCount: 0`, `excludedWithoutCoordinates: 0`, `truncated: false`, `minCellCount: 1` (estado vazio derivado; os dados anteriores **não** vazam) |
| H7 | query key | `['map', 'execution-density', fromDate, toDate, tenantId ?? null, inspectorId ?? null]` |
| H8 | resposta `{ cells: [3 itens], cellCount: 3, minCellCount: 3, … }` (L-F09-03) | hook devolve `cellCount: 3` e `minCellCount: 3` vindos da resposta |
| H9 | antes da primeira resposta (`isLoading`) | `minCellCount: 1`, `cellCount: 0`, `cells: []` |
| H10 | resposta 400 com `error.details.reason === 'PERIOD_NOT_A_PRESET'` | hook expõe `errorReason: 'PERIOD_NOT_A_PRESET'` (para o controle reancorar; L-F09-01) |

**D. `apps/web/src/features/appointments/components/ExecutionDensityControl.test.tsx` (novo)** — `DensityLayer` e `useExecutionDensity` mockados onde indicado.

| # | Cenário | Esperado |
|---|---|---|
| C1 | render inicial | botão `Activity density` com `aria-pressed="false"`; nenhum painel; hook com `enabled: false` |
| C2 | clicar no botão | `aria-pressed="true"`; painel `region` "Activity density" com o tablist de período, aba **"Last 30 days"** selecionada; hook com o período P1 |
| C3 | clicar em "Last 7 days" | hook com o período P2 (D.A1) |
| C4 | AM/OP, "Custom" | aparece `FilterDateRange` "Check-in dates" preenchido com o último período válido e `max` = hoje de Sydney; datas inválidas mostram a mensagem de P4–P7 com `role="alert"` e **não** mudam o período do hook |
| C5 | AM com `tenantId='T1'`, `inspectorId='I1'` nas props | hook recebe os dois (D.A2); rerender com `inspectorId=''` → hook sem inspetor |
| C4a | CL (`isGlobalRole: false`) (L-F09-01) | tablist com **3** abas (`Last 7 days`, `Last 30 days`, `Last 90 days`); aba `Custom` ausente; nenhum `FilterDateRange` |
| C4b | CL; hook devolve `errorReason: 'PERIOD_NOT_A_PRESET'` com relógio já no dia seguinte | período reancorado (`presetRange` chamado de novo para o preset atual) e **uma** nova requisição; se a segunda também falhar, estado de erro C13 sem nova tentativa automática |
| C6 | CL (`isGlobalRole: false`) com `tenantId`/`inspectorId` preenchidos por engano | hook recebe `tenantId: undefined`, `inspectorId: undefined`; texto `Your agency's inspections only. Other map filters don't apply.` |
| C7 | linha de escopo AM/OP (L-F09-07): sem filtros · só `tenantId` · só `inspectorId` · os dois | `All agencies` · `Filtered by agency` · `Filtered by inspector` · `Filtered by agency and inspector`; nos quatro casos seguido de `Other map filters (status, branch, service, dates) don't apply.` |
| C8 | carregando | texto `Loading activity…` em `aria-live="polite"`; botão continua clicável |
| C9 | dados: 3 células, `cellCount: 3`, `totalExecutions: 7` | resumo `7 check-ins · 3 areas` (o `3` vem de `cellCount` da resposta; L-F09-03); legenda numerada (C9b) |
| C9b | células com `count` máximo 12 (L-F09-04) | legenda com rótulos `1` e `12` e a frase `Colour is relative to the busiest area in this view.`; ao trocar para um período cujo máximo é 1.250, rótulo direito `1,250`; com `maxCount === 1`, um só rótulo `1` |
| C10 | `cells: []` | `No check-ins in this period.`; legenda oculta |
| C11 | `excludedWithoutCoordinates: 2` | linha extra `2 check-ins without a location` |
| C11a | CL, resposta com `minCellCount: 3` | linha `Areas with fewer than 3 check-ins are hidden for privacy.` (o número vem de `minCellCount` da resposta) |
| C11b | CL, `cells: []`, `totalExecutions: 4`, `minCellCount: 3` | `No area has 3 or more check-ins in this period. Try a longer period.` (em vez de `No check-ins in this period.`); legenda oculta |
| C11c | AM, `minCellCount: 1` | nenhuma linha sobre privacidade |
| C12 | `truncated: true` | linha extra `Showing the 5,000 busiest areas.` |
| C13 | erro depois de uma resposta com células (L-F09-08) | `Couldn’t load activity density.` + botão `Retry` que chama `refetch`; `DensityLayer` recebe `cells: []` (com `visible: true`); legenda oculta; nenhum resumo `{n} check-ins` antigo |
| C14 | desligar o toggle | painel some; `DensityLayer` com `visible: false`; hook `enabled: false` |
| C15 | mudar o "Date Range" dos pins (prop `pinDateFrom` não existe: o componente nem recebe as datas dos pins) | nenhuma nova requisição de densidade (teste no nível da página, E2) |
| C17 | ligar com `Last 30 days`, desligar, avançar o relógio 1 dia, religar (L-F09-05) | período novo `2026-10-07..2026-11-05` (recalculado ao religar) |
| C16 | teclado | `Tab` chega ao botão; `Enter`/`Space` alterna; setas trocam as abas de período (comportamento do `FilterSegmented`); `Escape` dentro do painel fecha o painel e devolve o foco ao botão **sem** desligar a camada |

**E. `apps/web/src/features/appointments/pages/AppointmentMapPage.test.tsx` (modify)**

| # | Cenário | Esperado |
|---|---|---|
| E1 | modo Appointments | botão `Activity density` presente na toolbar, à esquerda do laço |
| E2 | modo Appointments, camada ligada, trocar `dateFrom` no painel de filtros | nenhuma nova chamada a `/v1/map/execution-density` |
| E3 | AM troca a agência no painel de filtros | `ExecutionDensityControl` recebe o `tenantId` novo |
| E4 | modo Groups | botão ausente; `DensityLayer` não montado |
| E5 | `wc -l AppointmentMapPage.tsx` no diff | ≤ +12 linhas (checagem manual no PR, não teste) |

### Escopo / Passos

| ✓ | Passo | Camada | Arquivos | Dias |
|---|---|---|---|---|
| [ ] | P1 · Rebase sobre `develop` com a TASK-F09-1 (api-types com `/v1/map/execution-density`) e `pnpm --filter @properfy/shared build` | web | – | (em P2) |
| [ ] | P2 · `DensityLayer` (fonte + heatmap, rampa HSL com vírgula, `beforeId` do draw, `style.load`, limpeza) | web | `apps/web/src/components/map/DensityLayer.tsx` (novo) · `DensityLayer.test.tsx` (novo) · `apps/web/src/components/map/index.ts` (modify) | 0,4 |
| [ ] | P3 · Lib de período (presets, validação, "hoje" de Sydney, coerência com `isExecutionDensityPreset` do shared) | web | `apps/web/src/features/appointments/lib/execution-density-period.ts` (novo) · `.test.ts` (novo) | 0,15 |
| [ ] | P4 · Hook `useExecutionDensity` (retorno com `cellCount`/`minCellCount`/`errorReason`, estado vazio em erro; H6, H8–H10) | web | `apps/web/src/features/appointments/hooks/useExecutionDensity.ts` (novo) · `.test.tsx` (novo) · `hooks/index.ts` (modify) | 0,25 |
| [ ] | P5 · `ExecutionDensityControl` (botão, painel, período com "hoje" no estado, presets-only para CL + reancoragem, legenda numerada, linha de escopo, resumo, estados, a11y; renderiza o `DensityLayer`) | web | `apps/web/src/features/appointments/components/ExecutionDensityControl.tsx` (novo) · `.test.tsx` (novo) | 0,55 |
| [ ] | P6 · Fiação no `AppointmentMapPage` (≤ ~12 linhas: import + JSX na toolbar, só no modo appointments) | web | `pages/AppointmentMapPage.tsx` · `pages/AppointmentMapPage.test.tsx` (modify) | 0,1 |
| [ ] | P7 · `max` no `FilterDateRange`: **só se** a F00 P7 ainda não estiver em `develop`; mesma API da F00 (`min?`/`max?` repassados ao `DateInput`) | web | `apps/web/src/components/filters/FilterDateRange.tsx` · `FilterDateRange.test.tsx` (modify) | (em P5) |
| [ ] | P8 · `apps/web/CLAUDE.md` (X00): padrão de camada Mapbox própria no `/map` (fonte/camada fora da página, HSL com vírgula, `beforeId` antes de `gl-draw-*`, reaplicar em `style.load`, limpeza no unmount) | docs | `apps/web/CLAUDE.md` (modify) | 0,05 |
| [ ] | P9 · Smoke no browser (4 perfis) + gates + descrição do PR | QA | – | 0,2 |
| | **Total** | | ~14 arquivos | **1,7** |

Ordem: P1 → P2 → P3 → P4 → P5 (P7 se preciso) → P6 → P8 → P9.

### Contratos

- Consome `GET /v1/map/execution-density` (TASK-F09-1) via `api.GET` tipado (sem `as any`/`as never`).
- `DensityLayer` (`apps/web/src/components/map/DensityLayer.tsx`), componente genérico sem fetch:

```ts
export interface DensityCell { lat: number; lng: number; count: number }
export interface DensityLayerProps {
  map: mapboxgl.Map | null;
  cells: DensityCell[];
  visible: boolean;
}
export const DENSITY_SOURCE_ID = 'execution-density';
export const DENSITY_LAYER_ID = 'execution-density-layer';
export const DENSITY_HEATMAP_RAMP: (string | number)[];
```

- `useExecutionDensity({ enabled, fromDate, toDate, tenantId?, inspectorId? })` → `{ cells, totalExecutions, cellCount, excludedWithoutCoordinates, truncated, minCellCount, errorReason, isLoading, isFetching, isError, refetch }` (L-F09-03). `minCellCount` default `1` e `cellCount` default `0` enquanto não há resposta; `errorReason` = `error.details.reason` quando houver (ex.: `'PERIOD_NOT_A_PRESET'`), senão `undefined`. Em `isError`, todos os campos de dados vêm do estado vazio `EMPTY` (`cells: []`, contagens `0`, `truncated: false`, `minCellCount: 1`), nunca de `data`/placeholder (L-F09-08). `staleTime: 5 * 60_000`, `placeholderData: keepPreviousData`, `enabled: enabled && !!fromDate && !!toDate`.
- `ExecutionDensityControl` props: `{ map: mapboxgl.Map | null; isGlobalRole: boolean; tenantId: string; inspectorId: string }`. Para CL ele **descarta** `tenantId`/`inspectorId` antes do hook (o backend recusa `inspectorId` de CL) e não oferece `Custom` (L-F09-01). Estado interno: `{ enabled, preset: '7d'|'30d'|'90d'|'custom', range: { fromDate, toDate } }`; `range` só muda ao ligar, ao trocar preset/aplicar Custom ou ao reancorar após `PERIOD_NOT_A_PRESET` (L-F09-05).
- Fiação na página (modo appointments apenas):

```tsx
{mode === 'appointments' && (
  <div className="pointer-events-auto">
    <ExecutionDensityControl
      map={mapInstance}
      isGlobalRole={isGlobalRole}
      tenantId={appointmentFilters.tenantId}
      inspectorId={appointmentFilters.inspectorId}
    />
  </div>
)}
```

### Algoritmo (cliente)

- **Período:** `today = todayInTzDateString(PLATFORM_TIMEZONE)`; preset N dias → `{ fromDate: addCivilDays(today, -(N-1)), toDate: today }`. Presets: 7, 30 (padrão), 90 (`EXECUTION_DENSITY_PRESET_DAYS` do shared). "Custom" (só AM/OP): validação P4–P8 antes de aplicar; só um período válido chega ao hook.
- **Momento do "hoje" (L-F09-05):** `presetRange` roda só ao ligar a camada, ao selecionar um preset, ao aplicar o Custom e na reancoragem após `PERIOD_NOT_A_PRESET`; o resultado fica no estado. Nunca em render; sem timer. Refetch por foco/`staleTime` usa o mesmo período.
- **Fuso (L-F09-06):** sempre `PLATFORM_TIMEZONE` (Sydney-only por desenho, igual ao backend), não `tenant.timezone` como a F00.
- **Contagem de dias (L-F00-03):** `Last N days` = N dias exatos terminando hoje (inclusive); não reutilizar `computeWindowRange`/`formatWindowLabel` da F00 (`Today + N days` = N+1 dias para frente).
- **GeoJSON:** cada célula vira `Feature<Point>` com `coordinates: [lng, lat]` e `properties: { count }`.
- **Peso:** `maxCount = max(count)` (mínimo 1; escala **relativa** ao recorte atual, explicada na legenda, L-F09-04); `heatmap-weight: ['interpolate', ['linear'], ['get','count'], 0, 0, maxCount, 1]`, atualizado com `setPaintProperty` quando `maxCount` muda (o `RegionHeatmap` só define no `addLayer`; aqui a camada vive enquanto os dados mudam).
- **Sem mover a câmera** ao ligar ou trocar o período (diferente do `RegionHeatmap`): os pins e a navegação do operador mandam no enquadramento.

### UI

- **Botão** (toolbar superior direita, antes do laço): mesmo visual dos botões da toolbar (`MapLassoToggleButton`), ícone `mdi-fire`, texto/aria-label `Activity density`, `aria-pressed`, `aria-controls` do painel. Ativo = estilo "ativo" dos botões vizinhos (sem cor nova).
- **Painel** (abre abaixo da toolbar, `absolute right-14 top-16 z-30`, largura 288 px, `role="region"` com `aria-labelledby` no título; em telas < 768 px ocupa a largura útil com margem de 16 px):
  - Título `Activity density`; subtítulo `Inspector check-ins, grouped into ~100 m areas.`
  - `FilterSegmented` label `Period`: `Last 7 days` · `Last 30 days` · `Last 90 days` · `Custom` (`Custom` só AM/OP; CL vê as três primeiras, L-F09-01).
  - `Custom` (AM/OP) → `FilterDateRange` label `Check-in dates`, `max` = hoje (Sydney); erro inline com `role="alert"`.
  - Linha de escopo (L-F09-07): AM/OP → `All agencies` (sem filtros) / `Filtered by agency` (só agência) / `Filtered by inspector` (só inspetor) / `Filtered by agency and inspector`, sempre seguido de `Other map filters (status, branch, service, dates) don't apply.`; CL → `Your agency's inspections only. Other map filters don't apply.`
  - Legenda (L-F09-04): barra em gradiente da rampa (via `style` inline com as mesmas cores HSL com vírgula), rótulos `1` à esquerda e `{maxCount}` à direita (`toLocaleString('en-AU')`; com `maxCount === 1`, só `1`); abaixo, `Colour is relative to the busiest area in this view.`; `aria-hidden` na barra, e a frase também entra no resumo acessível.
  - Resumo (`aria-live="polite"`): `Loading activity…` · `{n} check-ins · {m} areas` (`n` = `totalExecutions`, `m` = `cellCount` da resposta) (números com `toLocaleString('en-AU')`) · `No check-ins in this period.` · extras `{k} check-ins without a location` e `Showing the 5,000 busiest areas.`
  - Só quando `minCellCount > 1` (CL): `Areas with fewer than {minCellCount} check-ins are hidden for privacy.`; se `cells` vier vazio com `totalExecutions > 0`: `No area has {minCellCount} or more check-ins in this period. Try a longer period.`
  - Erro: `Couldn’t load activity density.` + botão `Retry`; a camada fica vazia, a legenda oculta e nenhum número antigo aparece (L-F09-08). `PERIOD_NOT_A_PRESET` (CL) reancora e refaz uma vez antes de mostrar o erro.
  - Botão `×` (`aria-label="Close activity density panel"`) fecha só o painel; a camada continua ligada e o botão da toolbar reabre o painel. `Escape` faz o mesmo e devolve o foco ao botão.
- **Paint do Mapbox (HSL com vírgula, mesmo tom do `/analytics`):**

```ts
export const DENSITY_HEATMAP_RAMP = [
  0,   'hsla(199, 54%, 28%, 0)',
  0.2, 'hsla(199, 54%, 28%, 0.25)',
  0.4, 'hsla(199, 54%, 28%, 0.45)',
  0.6, 'hsla(199, 54%, 28%, 0.65)',
  0.8, 'hsla(199, 54%, 28%, 0.82)',
  1,   'hsla(199, 54%, 28%, 0.95)',
];
// paint
'heatmap-color':     ['interpolate', ['linear'], ['heatmap-density'], ...DENSITY_HEATMAP_RAMP],
'heatmap-weight':    ['interpolate', ['linear'], ['get', 'count'], 0, 0, maxCount, 1],
'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 24, 15, 40],
'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 15, 3],
'heatmap-opacity':   0.8,
```

- **Ordem das camadas:** `beforeId` = id da primeira camada de `map.getStyle().layers` cujo id começa com `gl-draw-`; sem draw ativo, `undefined` (topo). Quando o laço liga depois, o draw entra por cima sozinho. Os pins são marcadores DOM e ficam sempre acima do canvas.
- **Ordem depois do `style.load` (`ensureBelowDraw`):** no `style.load` a densidade é readicionada **antes** de o `mapbox-gl-draw` recolocar as camadas dele (o draw também reage à troca de estilo e readiciona as camadas no topo, em seguida). Por isso o `beforeId` calculado no `style.load` não basta. O `DensityLayer` registra também `map.on('styledata', ensureBelowDraw)`: se a camada de densidade existe e há alguma `gl-draw-*` **abaixo** dela na pilha, chama `map.moveLayer(DENSITY_LAYER_ID, firstDrawLayerId)`; se já está abaixo de todas, não faz nada (L7a–L7d). É idempotente e não entra em laço (o `moveLayer` dispara `styledata`, mas a segunda passada já encontra a ordem certa). Não depende de API interna do draw nem de `setTimeout`.
- **`style.load`:** o `DensityLayer` registra `map.on('style.load', apply)`; `apply` lê as células mais recentes de um `ref`, recria fonte + camada e calcula o `beforeId`; o `ensureBelowDraw` (acima) corrige a ordem quando o draw readiciona as camadas. Se `isStyleLoaded()` for falso no mount, espera o evento. No unmount: `off` dos dois handlers + remover camada/fonte em `try/catch` (o mapa pode já ter sido removido pelo `key={mode}`).
- **Troca de modo:** a página recria o mapa por modo; no modo Groups o controle não é montado, então o estado (ligado/período) volta ao padrão quando o usuário retorna. Sem persistência em storage/URL.

### Casos de borda

- **Sem execuções:** camada vazia + `No check-ins in this period.`
- **Execuções sem coordenada:** não aparecem; contagem em `{k} check-ins without a location`.
- **Execuções abandonadas (F03):** já excluídas no backend; nada a fazer no web.
- **CL com uma agência:** sem filtro de agência no painel (já é assim); a linha de escopo diz `Your agency’s inspections only.`
- **CL com poucas execuções:** o k = 3 pode esvaziar a camada; o painel mostra C11b e sugere um período maior.
- **Filtro de inspetor para CL:** não existe na UI; o controle descarta o valor mesmo se vier preenchido (C6), então o 403 do backend nunca é atingido pela UI.
- **Período muito grande:** o "Custom" bloqueia > 366 dias e datas futuras no cliente; o servidor recusa igual (400) por defesa.
- **`truncated`:** mensagem; a camada mostra as 5.000 células de maior contagem.
- **Laço ativo:** o polígono e os vértices continuam por cima do calor (L2); desenhar o laço não afeta a camada.
- **Token Mapbox ausente:** o `MapContainer` já mostra o erro e `mapInstance` fica `null`; o `DensityLayer` não faz nada (L9) e o painel continua funcional (mostra o resumo).
- **Agência trocada com o painel aberto (AM/OP):** nova requisição; os dados anteriores ficam até a resposta (`keepPreviousData`). Se a resposta falhar, a camada **esvazia** (não fica com a agência anterior) e mostra o erro (L-F09-08).
- **Virada do dia em Sydney com o painel aberto (L-F09-05):** o período não avança sozinho; o usuário vê o período de ontem até mexer ou religar. Para CL, o próximo refetch (foco/`staleTime`) recebe 400 `PERIOD_NOT_A_PRESET`, e o controle reancora e refaz uma vez (C4b). Para AM/OP o `max` do Custom continua o calculado na abertura.
- **Todas as células com o mesmo `count` (ex.: CL com tudo em 3):** todas no tom máximo; a legenda `1 … 3` e a frase relativa explicam (L-F09-04).
- **Filial filtrada pelo CL nos pins:** o calor continua cobrindo a agência inteira; a linha de escopo diz `Other map filters don't apply.` (L-F09-07).
- **Cópias de período lado a lado no `/map` (L-F00-03):** o chip dos pins diz `Today + 14 days` (15 dias civis à frente) e o painel da camada diz `Last 30 days` (30 dias exatos para trás); as duas contas são diferentes de propósito e os textos não devem ser harmonizados.
- **CL tenta período custom (via URL/devtools):** não há UI; o backend recusa com 400 (TASK-F09-1, U20).

### Fora do escopo

- Camada no modo Groups, na tela Dia ao Vivo (F05) ou no PWA.
- Badge "travado" nos pins / % travado (F05).
- Qualquer mudança no `/analytics`, `RegionHeatmap` ou `charts/theme.ts`.
- Persistir o estado do toggle/período (storage/URL); deep link.
- Clique/tooltip nas células, lista de "áreas mais ativas", exportar imagem.
- Escala absoluta de intensidade (comparável entre recortes) e contagem por célula na tela (L-F09-04: a escala é relativa e dita na legenda).
- `Custom` para CL (L-F09-01).
- Aplicar os outros filtros do mapa (status, branch, serviço, datas dos pins) à camada.

### Critérios de aceite

- **D.A1:** com a camada ligada, a requisição usa o período do seletor dela; padrão = últimos 30 dias de Sydney (P1, C2, C3); mudar o "Date Range" dos pins não muda a camada (E2).
- **D.A2:** mudar a agência ou o inspetor no painel de filtros do mapa muda a requisição e a camada (C5, E3; smoke AM).
- **Privacidade CL (L-F09-01):** o CL só vê os presets de 7/30/90 dias (C4a) e o controle se recupera da virada do dia (C4b).
- **Legenda e estados (L-F09-03/04/05/07/08):** textos de privacidade e resumo vêm da resposta (H8, C9, C11a); legenda numerada com a frase relativa (C9b); período não muda sozinho (P9, C17); linha de escopo nos quatro casos (C7); erro esvazia a camada (H6, C13).
- **D.A3:** um CL nunca envia `tenantId`/`inspectorId` (C6) e só recebe a própria agência (garantido e provado na TASK-F09-1, U4/U5/D2/D3); smoke com dois CL de agências diferentes mostra camadas diferentes.

### Dependências

- **TASK-F09-1 em `develop`** (endpoint + api-types).
- **F00:** as duas mexem no `AppointmentMapPage.tsx`/`FilterDateRange.tsx`. Se a F00 já estiver em `develop`, usar o `max` dela (P7 não roda); se não, P7 acrescenta o mesmo contrato e a F00 rebaseia.
- `pnpm --filter @properfy/shared build` antes do typecheck do web.

### Riscos e armadilhas

- **HSL com espaço quebra o mapa inteiro** (PR #1302). Não usar tokens Tailwind no paint; L10 trava isso.
- **Camada por cima do laço:** sem `beforeId`, ligar a densidade com o laço já ativo cobre o polígono; depois de um `style.load`, só o `ensureBelowDraw` no `styledata` garante a ordem (o draw readiciona as camadas depois da densidade).
- **Fonte duplicada:** `addSource` com id existente lança; sempre `getSource` → `setData`.
- **Mapa destruído na troca de modo:** limpar em `try/catch`; não chamar métodos do mapa depois do `remove()`.
- **Identidade de arrays nos deps** (`?? []` cria array novo a cada render): memoizar `cells` (mesma nota do `RegionHeatmap`, `apps/web/CLAUDE.md` §13.11).
- **"Hoje" em UTC:** usar `todayInTzDateString(PLATFORM_TIMEZONE)`; testes com relógio em instante onde UTC e Sydney divergem.
- **Crescer a página:** toda a lógica fica no controle, no hook e na lib.

### Deploy / rollout / rollback

- **Deploy:** só front (sem env nova). Depende do backend da TASK-F09-1 já em cada ambiente (staging antes de prod).
- **Rollout:** a camada nasce desligada; ninguém vê mudança até clicar em "Activity density". Sem feature flag (o plano não pede; o toggle já é opt-in).
- **Rollback:** reverter o PR do web (o botão some). O endpoint pode ficar.

### Dias · Branch · Verificação

- **Dias:** 1,7 (P2 0,4 · P3 0,15 · P4 0,25 · P5 0,55 · P6 0,1 · P8 0,05 · P9 0,2). +0,2 sobre o plano: L-F09-01 (presets-only CL + reancoragem) 0,05, L-F09-04 (legenda) 0,05, L-F09-05 ("hoje" no estado) 0,05, L-F09-03/07/08 (contrato do hook, textos, erro) 0,05.
- **Branch:** `feat/map-activity-density-layer` a partir de `develop` (com a TASK-F09-1), em worktree; PR → `develop`. Commits: `feat(web): add DensityLayer map heatmap primitive` · `feat(web): activity density control with its own period` · `feat(web): wire activity density into the appointment map` · `docs(web): document custom Mapbox layers on /map`.
- **Gates (no worktree):** `pnpm --filter @properfy/shared build` · `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test` · `git diff --stat origin/develop... | tail -1` (< 150 arquivos; esperado ~14).
- **Smoke no browser (backend + web locais, seed com execuções em duas agências; screenshots fora do commit):**
  1. **AM:** `/map` → `Activity density` → painel com `Last 30 days`, calor visível; Network: `fromDate` = hoje-29, `toDate` = hoje. `Last 7 days` → nova requisição. Filtrar uma agência e depois um inspetor no painel de filtros → requisições com `tenantId`/`inspectorId` e calor diferente. Ligar o laço e desenhar → polígono por cima do calor. Mudar o "Date Range" dos pins → nenhuma requisição de densidade.
  2. **OP:** mesmo fluxo do AM (sem `tenantId` no JWT).
  3. **CL_ADMIN (agência A):** `Your agency's inspections only. Other map filters don't apply.` e `Areas with fewer than 3 check-ins are hidden for privacy.`; aba `Custom` ausente; Network sem `tenantId`/`inspectorId`; resposta sem célula com `count < 3`; calor só nos imóveis da A. Comparar com o AM filtrado na agência A: o AM vê células de 1–2 que o CL não vê.
  4. **CL_USER (agência B):** calor diferente do CL_ADMIN da A (D.A3 visual).
  5. Modo Groups → botão ausente. `Custom` (AM) com 400 dias → mensagem e nenhuma requisição. Legenda mostra `1` e o máximo, e o máximo muda ao trocar de 7 para 90 dias. Backend parado/erro → camada vazia + `Retry`. Teclado: Tab/Enter/setas/Escape.
- **Descrição do PR:** D.A1/D.A2/D.A3 → testes + smoke; notas "camada só no modo Appointments" e "k = 3 para CL aplicado no backend" (decisões de 2026-10-28); "CL só com presets", "escala relativa", "hoje fixado ao ligar", "Sydney-only por desenho, diverge da F00" (lacunas de 2026-10-29).

---

## Achados para revisão

**Fechados**
- ~~1. Privacidade do check-in fora do raio (CL).~~ **Fechado em 2026-10-28 (dev):** k-anonimato só para CL, `MIN_CELL_COUNT_CL = 3` (AM/OP com 1); sem exclusão de `out_of_radius`. Aplicado na TASK-F09-1 (Algoritmo §7, U14–U19, D12–D14) e no texto da TASK-F09-2 (C11a–C11c).
- ~~3. Camada só no modo Appointments.~~ **Confirmado em 2026-10-28 (dev).**
- **Lacunas L-F09-01..09 aplicadas em 2026-10-29** (todas as recomendações aceitas pelo dev; ver `lacunas/F09-lacunas.md` e `lacunas/_decisoes-lacunas.md`).
- Correções de revisão aplicadas: índice da célula por `FLOOR(coord * 1000)` em `numeric` (o `/ ${0.001}` ligava como `float8`), com G5a e D16 nos pontos de borda; ordem da camada depois do `style.load` corrigida no `styledata` (`ensureBelowDraw`, L7a–L7d).

**Em aberto**
1. **Texto desatualizado no plano F09.** "Quebra em PRs" ainda diz "Backend (densidade + % travado)" e "Web (camada + tabela)", e a tabela de RBAC tem a linha "% travado". Isso é do 01.13, que foi para a F05 em 2026-10-27; as tarefas acima ignoram esses itens. Atualizar o plano.
2. **Q6 (decisoes.md) continua PENDENTE**: só redação do contrato ("D sobre o mapa da 01"). Não bloqueia a implementação.
3. **Execução reiniciada perde o check-in anterior.** Como a F03 reinicia a mesma linha (D13), a densidade só enxerga o último check-in de um appointment reofertado. Aceito como está, mas registrado caso o PO queira contar tentativas.

---

## Ajustes necessários em outras tarefas (para reconciliar)

- `tarefas/F00-tarefas.md` · citar na nota de fuso (§4, `resolveWindowTimezone`) que a camada de densidade da F09 usa `PLATFORM_TIMEZONE` de propósito (Sydney-only por desenho) e que as duas fontes de "hoje" convivem no `AppointmentMapPage` · L-F09-06.
- `tarefas/F00-tarefas.md` · a F00 também mexe no `ROLE_ACTION_MATRIX` (dívida `tenant.update`, L-F00-02); a TASK-F09-1 acrescenta `'map.execution_density'` no mesmo arquivo → ordem de merge/rebase em `packages/shared/src/permissions/role-matrix.ts` · L-F09-09.
- `tarefas/F03-tarefas.md` · registrar na D10 (privacidade do check-in para CL) que a densidade da F09 mitiga a diferença de janelas com presets fixos para CL e que o risco residual (agregado por faixas 8–30/31–90 dias) foi aceito · L-F09-01.
- `F09-densidade-mapa.md` (plano) · atualizar a tabela de RBAC/contrato: CL só com períodos 7/30/90 dias terminando hoje; nova chave `map.execution_density`; esforço 3,0 → 3,4 · L-F09-01, L-F09-09. (encaminhado)
