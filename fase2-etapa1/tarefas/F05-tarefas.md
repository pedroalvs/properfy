# F05 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | F05 · Dia ao Vivo (contrato 01.8 + "mapa diário de inspetor e rotas em tempo real" da entrega D (Q5), 01.9, 01.11, 01.13 e a tela "Configuração de limites de alerta por inspetor"; critérios **01.A4**, **01.A5**) |
| **Total** | **12,25 dias** (plano: 8,5; +1,25 da revisão de 2026-10-28; +2,5 das lacunas L-F05-01..14, 2026-10-29; justificados nas tabelas abaixo) |
| **Tarefas / PRs** | 3: backend + shared → web "Live Day" → web "Locked time" + limites. O plano previa 2 PRs (backend; web). O PR do web foi dividido em dois para ficar revisável (Achado 1). Isso não muda o escopo nem os dias. |
| **Depende de** | **F06** (TASK-F06-1: `projectStopEta`, projeção pura dos horários restantes sobre o `evaluateSequence` da F04, com partida ≥ agora); **F04** (TASK-F04-2: `DayPlan`/`DayPlanStop`, `dayPlanGeometrySchema`, `GET /v1/day-plans/eta-accuracy`, regra D18 "executada = iniciada"); **F03** (TASK-F03-1: `PlatformSetting` + `IPlatformSettingsReader` + flags da execução; TASK-F03-2: `InspectorFieldEvent` `CANT_DO`/`LATE_NOTICE`, `abandoned_at`, lembrete de conclusão; TASK-F03-4: página "Platform settings"); **X01** (grupo "Dashboard" do menu lateral); **F01** (`inspectors.base_lat/base_lng`); **F02** só pela tabela `inspector_notices.dedupe_key` (lembrete de conclusão disparado). Nenhum aviso novo é criado. |
| **Bloqueia** | – |
| **Código verificado em** | `origin/develop` @ `042a9674` (snapshot read-only, 2026-10-27). O que F01–F04 e X01 entregam é tratado como existente, porque todas são mergeadas antes. |
| **Decisões** | Todas de **2026-10-27** (`F05-dia-ao-vivo.md`, `decisoes.md`): Q3, Q5, Q17, polling de 30 s, seletor de data, rotas (selecionado + "Show all routes"), feitas × restantes, 01.13 nesta tela, item "Live Day" (X01). Revisão do coordenador de **2026-10-28**: STALE pela impressão digital da F04, NOT_STARTED por parada, roster sem planos ociosos, denominador do 01.13 com os rejeitados pelo inquilino, `projectStopEta` da F06, `includeGeometry`, `out_of_window` como alerta. Ver D1–D21 abaixo. Lacunas e reconciliação com F03/F04/F06/X01 de **2026-10-29** nas "Decisões aplicáveis" de cada tarefa. |

**Distribuição do plano (8,5) pelas 3 tarefas e ajuste da revisão (2026-10-28): 8,5 → 9,75.** Nenhum item foi cortado e não há folga embutida.

| Item do plano | Dias (plano) | TASK-F05-1 (backend) | TASK-F05-2 (web Live Day) | TASK-F05-3 (web Locked time + limites) |
|---|---|---|---|---|
| API `live-day` | 1,75 | 1,75 | – | – |
| 01.8 / 01.9 página | 2,5 | – | 2,5 | – |
| Rotas (`RouteLayer`, cores, "Show all routes") | 1,75 | – | 1,75 | – |
| 01.11 "Needs attention" | 0,5 | 0,25 (derivação dos 7 alertas) | 0,25 (filtro) | – |
| 01.13 "Locked time" | 1,0 | 0,5 (endpoint + SQL) | – | 0,5 (seção) |
| Limites (padrão + override) | 1,0 | 0,5 (chave, coluna, endpoints) | – | 0,5 (drawer + "Platform settings") |
| **Subtotal do plano** | **8,5** | **3,0** | **4,5** | **1,0** |

| Delta da revisão (2026-10-28) | Tarefa | Dias | Motivo |
|---|---|---|---|
| STALE pela impressão digital | F05-1 | +0,25 | Montar em memória, a partir das linhas da consulta única, a entrada de `day-plan-fingerprint.ts` da F04 (origem resolvida, paradas visíveis pelo T-1, `execState`) e comparar com `input_fingerprint`. Inclui testes de edição sem evento. Não estava no plano. |
| Horários restantes por `projectStopEta` (F06-1) | F05-1 | +0,25 | Adaptador `toEtaPlanInput`/`toEtaRealEvents` (nome alinhado à F06 em 2026-10-29, L-F05-10) + testes de coerência com a F06. A versão anterior mostrava o horário gravado; fechado na revisão. |
| `includeGeometry` + teste de tamanho | F05-1 | +0,25 | Parâmetro novo, fallback reto só quando incluído, teste de tamanho com geometria `overview=full` de seed. |
| Teste HTTP ponta a ponta do 01.A4 | F05-1 | +0,25 | Supertest com as rotas reais do F03 (`start`/`finish`) + live-day, com banco (Testcontainers). |
| Modo de geometria no web | F05-2 | +0,25 | A `queryKey` passa a depender do modo (`none`/`selected`/`all`) e do inspetor; `keepPreviousData` e a troca de modo sem piscar a rota; testes. |
| NOT_STARTED por parada, `out_of_window`, roster, denominador do 01.13 | F05-1 | 0 | Mesma consulta e mesma função `deriveAlerts`; só mudam regras e linhas de teste. |
| **Total** | | **+1,25** | **F05-1 3,0 → 4,0; F05-2 4,5 → 4,75; F05-3 1,0. Total 9,75.** |

**Ajuste das lacunas (2026-10-29, `lacunas/F05-lacunas.md`, todas as recomendações aceitas): 9,75 → 12,25.**

| Lacuna | Tarefa | Dias | Motivo |
|---|---|---|---|
| L-F05-01 · "Sai quando" por alerta; `CANT_DO` sai ao reofertar/reatribuir | F05-1 | +0,25 | `events` passa a trazer `status`/`inspector_id` atuais do appointment; roster só com `CANT_DO` **ativo**; regras de saída por tipo e linhas de teste. |
| L-F05-02 · Dias passados sem projeção; `NOT_STARTED` até o fim da janela | F05-1 | +0,25 | Ramo `date < today` no use case (sem `projectStopEta`, `NOT_STARTED`/`DELAY` de dia encerrado) + testes com `date = ontem`. A copy do web cabe na F05-2 sem dia extra. |
| L-F05-03 · Filtro T-1 em paradas, total, alertas e "conjunto mudou" | F05-1 | +0,25 | O filtro sai do cálculo da impressão e passa a ser o 1º passo do use case; testes de amanhã antes das 19:00. |
| L-F05-06 + L-F05-07 · Teto de rotas, orçamento, log, `keyGenerator`, cache da simplificação | F05-1 | +0,5 | Erro `LIVE_DAY_TOO_MANY_ROUTES`, seed de 100 inspetores, p95 medido, log `live_day.read`, `keyGenerator` por usuário, cache LRU `dayPlanId:version`. |
| L-F05-04 · `MapScreenLayout` com `storageKey` e modo mobile recolhível | F05-2 | +0,5 | Componente compartilhado com o `/map`: prop nova, modo abaixo de `md`, testes e QA do `/map` sem regressão. |
| L-F05-05 · `today` do servidor no cliente; data inválida no deep-link | F05-2 | +0,25 | `DateInput.max`, `isLive`, "Today" e o redirecionamento de `LIVE_DAY_DATE_TOO_FAR` com faixa de aviso. O campo `today` no backend é trivial (0). |
| L-F05-08 · Ordem por gravidade e lista congelada durante a interação | F05-2 | +0,25 | Seletor de ordenação + congelamento por foco/ponteiro + testes. |
| L-F05-14 · Link "Open inspector" + deep-link do drawer | F05-3 | +0,25 | `InspectorListPage` passa a abrir o drawer por `?open=<id>` (hoje é só estado local) + link no Live Day. Os links nos alertas cabem na F05-2 (0). |
| L-F05-09, -10, -11, -12, -13 | F05-1/2/3 | 0 | Regras, nomes, copy e um campo (`agencyName` em `byRegion`) dentro do trabalho já orçado. |
| **Total** | | **+2,5** | **F05-1 4,0 → 5,25; F05-2 4,75 → 5,75; F05-3 1,0 → 1,25. Total 12,25.** |

**Reconciliação com F03/F04/F06/X01 (2026-10-29): 12,25 → 12,25.** Ajustes de contrato e de teste dentro do trabalho já orçado.

| Ajuste | Tarefa | Dias | Motivo |
|---|---|---|---|
| `dedupeKey` do lembrete com `inspectorId` e prefixo do shared (L-F03-03) | F05-1 | 0 | Troca da expressão na CTE `reminders` + 1 linha de teste. |
| `estimatedArrivalAt` no `LATE_NOTICE`; `OUT_OF_WINDOW` nunca de horário implausível; `geofence_radius_m` nulo só pré-F03 (L-F03-04/05/06) | F05-1 / F05-2 | 0 | Um campo novo no alerta (função pura da F03), copy e linhas de teste. |
| Funções puras da F04, join com status, `LAST_STOP`, limites da F04 (L-F04-04/07/14/16) | F05-1 | 0 | Imports por caminho fixo (some o passo "extrair"), comentário/teste do join, 1 linha nova na tabela do último ponto. |
| Menu: Live Day logo depois de Overview, teste sem mocks; regra de `backTo` (L-X01-02/03/08) | F05-2 | 0 | Posição do filho e reescrita do teste 10. |
| Plano inviável como **indicador** "Route infeasible" na linha do inspetor, não 8º alerta (L-F04-05; decisão do dev 2026-10-29) | F05-1 / F05-2 | 0 | Dois campos lidos da mesma consulta (`day_plans.feasible`, `day_plan_stops.late_s`), um badge com tooltip e linhas de teste. |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F05-1 | Backend + shared: `GET /v1/dashboard/live-day` (estado derivado, último ponto conhecido, feitas × restantes, atraso, 7 alertas, STALE pela impressão digital da F04, horários restantes por `projectStopEta`, paradas e traçado sob demanda via `includeGeometry`, em 1 consulta; filtro T-1 em tudo, dias passados sem projeção, regras de saída dos alertas, teto de rotas, log e orçamento de latência), `GET /v1/dashboard/locked-time` (01.13), chave `liveDayAlerts` no `PlatformSetting`, `inspectors.alert_overrides_json` + `GET/PUT /v1/inspectors/:id/alert-thresholds` | 5,25 | TASK-F04-2, **TASK-F06-1**, TASK-F03-1, TASK-F03-2, F01-1, F02-1 |
| TASK-F05-2 | Web: página `/live-day` (AM/OP) com mapa (pin por inspetor, cor = estado), lista lateral (progresso, atraso, alertas, ordem por gravidade), seletor de data ancorado no `today` do servidor, polling de 30 s com geometria sob demanda, rota do selecionado + "Show all routes" (até 40; `components/map/RouteLayer.tsx`, paleta de 12 tons escuros), "Approximate route", filtro "Needs attention", rodapé "Route ETA accuracy", `MapScreenLayout` com `storageKey` e modo mobile, item "Live Day" no grupo Dashboard | 5,75 | TASK-F05-1, TASK-X01-1 |
| TASK-F05-3 | Web: aba "Locked time" do painel (por agência e por região, período 7/14/30 dias a partir de hoje), seção "Live Day alerts" no drawer do inspetor (override) e em "Platform settings" (padrão), link "Open inspector" no Live Day + deep-link `?open=<id>` do drawer | 1,25 | TASK-F05-1, TASK-F05-2, TASK-F03-4 |
| **Total** | | **12,25** | |

Ordem de merge: F05-1 → F05-2 → F05-3.

## Decisões que valem para as 3 tarefas

Datas: **2026-10-27** (plano F05 e `decisoes.md`), salvo indicação. Cada tarefa cita as que se aplicam.

- **D1 · Posição (Q3).** O pin fica no **último ponto conhecido**: o último check-in ou check-out do dia. Antes do 1º check-in, fica na base (origem do plano, senão a base do perfil). Não há ping de localização nem GPS. A tela traz o rótulo "Last known location".
- **D2 · Estado derivado (Q3).** `NOT_STARTED`, `AT_PROPERTY`, `IN_TRANSIT`, `DONE_FOR_DAY`. Sai só da execução (F03) e das paradas, pelo algoritmo e pela tabela-verdade da TASK-F05-1. "Em deslocamento" é **inferência**, e a tela diz isso no texto de ajuda.
- **D3 · Polling.** A cada **30 s**, só com a aba visível (`refetchInterval: 30_000`, `refetchIntervalInBackground: false`; precedente `apps/pwa/src/features/offers/hooks/useMarketplaceOffers.ts:33-34`). Não há WebSocket nem SSE.
- **D4 · Datas.** A tela abre em **hoje** (fuso do ator: `actor.timezone ?? PLATFORM_TIMEZONE`, mesmo critério do `get-inspector-workload.use-case.ts`) e tem seletor de data: dias passados e o **amanhã** (mesmo endpoint, parâmetro `date`). Datas depois de amanhã → 400.
- **D5 · Limites (Q17).** O padrão fica no `PlatformSetting` (chave nova `liveDayAlerts`: `delayMinutes` 20, `notStartedMinutes` 30, valores de onboarding do `decisoes.md`). O override opcional por inspetor fica em `inspectors.alert_overrides_json`, editado numa seção do drawer do inspetor. O cálculo usa o override **por campo** quando existe.
- **D6 · Rotas.** Clicar num inspetor (pin ou lista) desenha a rota dele. O toggle **"Show all routes"** desenha as rotas de todos os inspetores visíveis (respeita o filtro "Needs attention"). Cada inspetor tem **uma cor escura** (paleta de 12 tons, hash estável do `inspectorId`), a mesma no traçado, na bolinha da lista e na legenda. O **estado** fica no ícone e no preenchimento do pin, nunca na cor do inspetor.
- **D7 · Feitas × restantes.** O traçado é o **planejado** (F04, sem GPS). As paradas concluídas mostram check e o horário real. A parada atual é destacada. As restantes mostram o horário **projetado** por `projectStopEta` (TASK-F06-1, módulo único de projeção, puro, sem Mapbox, sobre o `evaluateSequence` da F04 com partida ≥ agora e piso do `LATE_NOTICE`). A F05 não tem regra própria de projeção.
- **D8 · Sem traçado.** Se o plano não tem `geometry` (Directions falhou, plano expurgado de dia passado, plano inexistente) ou se o conjunto de paradas mudou depois do cálculo: linhas **retas** entre as paradas, tracejadas, com o aviso discreto "Approximate route".
- **D9 · 01.13 nesta tela.** Vira a seção (aba) **"Locked time"** do painel do Live Day. Usa um endpoint próprio, `GET /v1/dashboard/locked-time`. **Não** reusa nem altera o `ConfirmationMeter` nem o `/analytics`.
- **D10 · Acesso.** Item **"Live Day"** no grupo "Dashboard" do menu lateral (X01), só para AM/OP. Pela regra do X01, telas de topo do menu não têm `BackButton` (ver "Inventário de sub telas"). A volta da visão de um inspetor para a lista é um botão do próprio painel, não uma rota.
- **D11 · RBAC.** Só **AM/OP** em todos os endpoints e na página. CL_ADMIN/CL_USER/INSP → 403. O painel cruza agências e o contrato não prevê acesso para agência (precedente `/inspector-workload`, `WORKLOAD_ROLES`).
- **D12 · Telas de dashboard existentes não mudam** (regra do dev). Nenhuma tarefa toca `DashboardPage`, `AnalyticsPage`, `InspectorWorkloadPage`, `dashboard.routes.ts`, `prisma-dashboard-analytics.repository.ts` nem `ConfirmationMeter`. Os endpoints novos vivem num **módulo novo** `modules/live-day/` com o prefixo `/v1/dashboard/...`.
- **D13 · Leitura sem custo externo.** A leitura **nunca** chama o Mapbox: nem Matrix, nem Directions, nem geocodificação. O traçado é o gravado pela F04. Cada endpoint de leitura faz **uma** consulta SQL agregada (sem N+1). A leitura do `PlatformSetting` passa pelo cache de 30 s da F03. A geometria das rotas só vai no corpo quando pedida (`includeGeometry=selected|all|none`, D18 abaixo).
- **D14 · Sem `tenant_id`.** `live-day` e `locked-time` são leituras **cross-tenant** de AM/OP (precedente `/inspector-workload`, `prisma-inspector-workload.repository.ts`). `inspectors.alert_overrides_json` fica numa tabela que já não tem `tenant_id`. **Cada spec registra a exceção ao §7.1/§7.8 do CLAUDE.md**, com a justificativa "inspetor cross-tenant, só AM/OP".
- **D15 · Timestamps de migration** são placeholders `YYYYMMDDhhmmss_nome`, regenerados na implementação (`prisma migrate dev --create-only`), depois das migrations de X02/F01/F02/F03/F04.
- **D17 · STALE (revisão 2026-10-28).** A F05 segue o contrato de leitura AM/OP da F04: quando a impressão digital recalculada diverge do `input_fingerprint` gravado, o plano é tratado como `STALE`, inclusive depois de edições que não emitem evento (`update-appointment`, bulk, coordenada do imóvel). Nesse caso `planStatus = 'STALE'` e `routeOutOfDate = true`. A impressão é calculada **em memória** com a função da F04, sobre as linhas da consulta única. Nunca recalcula o plano e nunca chama o Mapbox.
- **D18 · Geometria sob demanda (revisão 2026-10-28).** O poll de 30 s **não** leva o traçado de todos os inspetores. Query `includeGeometry`: `none` (padrão), `selected` (com `inspectorId`, só esse) ou `all` ("Show all routes" ligado). Paradas, estado e alertas vão sempre.
- **D19 · Roster (revisão 2026-10-28).** Entra na tela quem tem appointment vivo (`SCHEDULED`/`DONE`) na data, **com ou sem plano**, ou um `CANT_DO` na data. Plano sem paradas vivas e sem `CANT_DO` fica fora (nada de "0 of 0" para inspetor ocioso).
- **D20 · Alertas (revisão 2026-10-28).** São **7** tipos: atraso, não iniciado (**por parada**), aviso de atraso, "Não consigo fazer", geofence, fora da janela (`out_of_window` da F03, porque o plano F03 manda as flags para a lista de exceções) e lembrete de conclusão disparado.
  - **Plano inviável (dev, 2026-10-29, L-F04-05):** é **indicador** na linha do inspetor (badge "Route infeasible" + tooltip com as paradas que estouram a janela), **não** um 8º tipo de alerta. D20 continua com 7 tipos e o critério 01.A5 não muda; o indicador não entra em `alerts`, `needsAttention` nem na ordem por gravidade.
- **D21 · Denominador do 01.13 (revisão 2026-10-28).** Os `REJECTED` com `rejection_reason_code ∈ { TENANT_NO_RESPONSE, TENANT_DECLINED }` entram no denominador como não travados. Sem isso, o corte T-1 rejeita os não confirmados e os dias passados e o D+1 marcariam ~100%.
- **D16 · Tempo.** Instantes no fio em ISO-8601 (`instantStr()`), datas civis em `civilDateStr()`. Horários de parada e janela são formatados no fuso da **agência** da parada (`stop.timezone`, como na F04). O fuso do navegador nunca entra na lógica.

---

## TASK-F05-1 · Backend + shared: `live-day`, `locked-time`, limites de alerta (padrão + override por inspetor)

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F04-2, TASK-F06-1, TASK-F03-1, TASK-F03-2, TASK-F01-1, TASK-F02-1
> - **Desbloqueia:** TASK-F05-2, TASK-F05-3
> - **Pode rodar em paralelo com:** TASK-F04-3, TASK-F07-1, TASK-F06-2, TASK-F04-4, TASK-F07-2, TASK-F07-3, TASK-F08-1, TASK-F04-3b
> - **Pista sugerida (time de 6):** B · Backend de integração

### Objetivo

Entregar ao web, num endpoint AM/OP, tudo o que o Dia ao Vivo precisa para uma data. Para cada inspetor com trabalho no dia:
- estado derivado;
- último ponto conhecido;
- feitas × restantes;
- atraso acumulado;
- `planStatus` com o STALE da impressão digital da F04 (D17);
- alertas ativos (7 tipos, D20);
- indicador de plano inviável (`routeFeasible` + `routeViolations`, fora dos alertas; D20, L-F04-05, 2026-10-29);
- paradas do plano com status feita/atual/restante e horário restante projetado por `projectStopEta` (F06-1);
- traçado salvo pela F04, só quando pedido (`includeGeometry`, D18).

Tudo sai de **uma** consulta agregada, sem chamar o Mapbox.

A tarefa também entrega:
- o endpoint do indicador 01.13 ("Locked time", por agência e por região);
- a configuração dos limites: padrão no `PlatformSetting` e override por inspetor.

### Contexto no código

- **Precedente AM/OP cross-tenant:** `apps/backend/src/modules/dashboard/application/use-cases/get-inspector-workload.use-case.ts`. Tem `WORKLOAD_ROLES = ['AM','OP']`, `ForbiddenError('AUTH_FORBIDDEN', …)` e "hoje" calculado com `civilDateInTimezone(input.now ?? new Date(), actor.timezone ?? PLATFORM_TIMEZONE)` (`apps/backend/src/shared/domain/timezone-date.ts:144`). O repositório `prisma-inspector-workload.repository.ts` é o padrão de leitura sem tenant.
- **Rotas do dashboard:** `apps/backend/src/modules/dashboard/interfaces/dashboard.routes.ts` (136 linhas). **Não é alterado** (D12). O padrão a copiar no módulo novo é este: `createAuthMiddleware`, `schema.querystring` + `safeParse` → `ValidationError`, `response: { 200: successResponseSchema(...) }` e `success(result)`.
- **Registro de rotas:** `apps/backend/src/main/routes.ts:109` (`registerDashboardRoutes(app, container.dashboard)`). O módulo novo entra logo depois, com `registerLiveDayRoutes(app, container.liveDay)`. As rotas do inspetor ficam em `apps/backend/src/modules/inspector/interfaces/inspector.routes.ts` (`routes.ts:97`).
- **Índices úteis (`apps/backend/prisma/schema.prisma`):**
  - `appointments @@index([scheduled_date, inspector_id])` (`:623`, criado para a agregação cross-tenant do Workload);
  - `day_plans @@unique([inspector_id, plan_date])` + `@@index([plan_date, status])` (F04);
  - `day_plan_stops @@unique([day_plan_id, appointment_id])` (F04);
  - `inspection_executions.appointment_id @unique` (`:1183`);
  - `inspector_field_events (inspector_id, created_at)` e `(appointment_id, type, created_at desc)` (F03);
  - `inspector_notices.dedupe_key @unique` (F02).
- **Execução:** `InspectionExecution` (`schema.prisma:1181`) com `started_at`, `finished_at`, `start_latitude/longitude` (NOT NULL), `finish_latitude/longitude` (nulos). A F03 acrescenta `abandoned_at`, `out_of_radius`, `finish_out_of_radius`, `geofence_radius_m` e `finish_geolocation_distance_meters`.
- **Confirmação (01.13):**
  - `appointments.rental_tenant_confirmation_status` (`:556`, enum `PENDING|CONFIRMED|UNAVAILABLE|NO_RESPONSE`, `:93`);
  - `appointments.key_required` (`:549`);
  - `service_types.flow_type` (`ROUTINE|INGOING|OUTGOING`, `:425`, enum `:52`);
  - `service_types.requires_rental_tenant_confirmation` (`:426`).
  - A regra "exige confirmação" é a do corte T-1 (`F04-plano-do-dia-roteiro.md:31`): `ROUTINE` + `requires_rental_tenant_confirmation = true` + `key_required = false`.
  - O `confirmationRate` do analytics (`prisma-dashboard-analytics.repository.ts:122-128`) usa **só** `requires_rental_tenant_confirmation`. É outra definição e **não** é reusado.
- **Região:** `ServiceGroup.service_region_id` (`:667`, índice `:683`) e `ServiceRegion.geom` (`Unsupported("GEOMETRY(Polygon, 4326)")`, `:1484`, índice GIST `service_regions_geom_idx`). `ServiceRegion.tenant_id` nulo = região global. O desempate entre regiões sobrepostas é o **menor `region_number`** (`auto-group-ingoing-outgoing.service.ts:78-95`, `pickRegion`). Precedente de `ST_Intersects(sr.geom, p.coordinates)` em `prisma-service-region.repository.ts:217,240` (`properties.coordinates` é a coluna PostGIS; `lat/lng` ficam para transporte, `:386-390`).
- **F04 (contratos exportados §2):**
  - `dayPlanGeometrySchema` (FeatureCollection de LineString com `properties { fromSequence, toSequence, approximate }`) em `packages/shared/src/schemas/day-plan.ts`;
  - colunas de `day_plans` (`status`, `version`, `timezone`, `origin_source`, `origin_lat/lng`, `approximate`, `route_geometry`, `published_at`) e de `day_plan_stops` (`sequence`, `service_start_at`, `published_service_start_at`, `window_start_at`, `window_end_at`, `window_timezone`, `lat/lng`, `missing_coordinates`);
  - regra D18 (executada = DONE ou iniciada e não abandonada) e as funções puras exportadas pela TASK-F04-2 (contrato §2, L-F04-16): `classifyStops(stops: ClassifiableStop[]) → { executed, reorderable }` em `modules/day-plan/domain/classify-stops.ts` (`ClassifiableStop = { appointmentId, appointmentStatus, startedAt, finishedAt, abandonedAt, windowStartAt }`, tipos planos, sem Prisma) e `computeDayPlanFingerprint(input: FingerprintInput): string` em `modules/day-plan/domain/day-plan-fingerprint.ts`;
  - `DayPlanOriginSource` ganha `LAST_STOP` (L-F04-07): com prefixo executado hoje, `origin_source` grava `LAST_STOP` e `origin_lat/lng` = imóvel da última executada (o restante parte dali);
  - todo leitor de `day_plan_stops` re-une com `a.status IN ('SCHEDULED','DONE')` além de `a.inspector_id = day_plans.inspector_id AND a.deleted_at IS NULL` (L-F04-04), porque um `DONE → DRAFT` do AM não zera `inspector_id`.
  - O `GET /v1/day-plans/:inspectorId/:date` da F04 serve um inspetor por chamada. Usá-lo aqui seria N chamadas por poll, então a F05 tem um read model próprio que lê as mesmas tabelas com a mesma semântica. A F05 **não** chama esse endpoint nem a folha AM/OP no polling: eles têm limite de 120/min e 20/min por usuário (L-F04-14), e N inspetores × 2 polls/min estourariam a folha.
- **F03 (contratos exportados §1–§4):**
  - `PLATFORM_SETTINGS_REGISTRY` (`packages/shared/src/schemas/platform-settings.ts`);
  - `IPlatformSettingsReader.get(key)` (`apps/backend/src/shared/domain/platform-settings.ts`, cache de 30 s);
  - `InspectorFieldEventType { CANT_DO, LATE_NOTICE }`, `FIELD_ISSUE_REASON_LABELS`, `LATE_NOTICE_REASON_LABELS` (`packages/shared/src/enums/field-events.ts`);
  - o lembrete de conclusão publica com `dedupeKey = completion-reminder:{appointmentId}:{civilDate}:{inspectorId}` (L-F03-03, D22 da F03), montado por `buildCompletionReminderDedupeKey` com o prefixo `COMPLETION_REMINDER_DEDUPE_PREFIX` (`packages/shared/src/constants/inspector-notices.ts`);
  - `LATE_NOTICE`: `minutes` é relativo ao **início da janela**; `estimatedArrivalAt = max(windowStartAt, effectiveNoticeAt) + minutes`, pela função pura `computeEstimatedArrivalAt` (`apps/backend/src/modules/inspector-execution/domain/late-notice.ts`, L-F03-04). A tabela não grava `estimatedArrivalAt`; quem lê a tabela usa a função;
  - `out_of_window` vem `false` quando o horário do cliente foi implausível (audit `inspection.started` com `metadata.windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'`, L-F03-06);
  - `geofence_radius_m` é gravado em todo `start` pós-F03; `NULL` = execução anterior à F03 (L-F03-05).
- **F01:** `inspectors.base_lat` / `base_lng` (`Decimal(10,7)`, nulos).
- **F04 · impressão digital:** `modules/day-plan/domain/day-plan-fingerprint.ts` (TASK-F04-2, Algoritmo §2): sha256 do JSON canônico `{ origin: { source, lat, lng }, stops: [ordenado por appointmentId: [appointmentId, scheduledDate, timeSlotStart, timeSlotEnd, tenantTimezone, durationMinutes, lat, lng, execState]] }`, com `execState ∈ { NOT_STARTED, STARTED }`. A origem resolvida é override do dia → base → nenhuma: é a origem **configurada**, nunca `LAST_STOP` (L-F04-07/16). Os SCHEDULED passam pelo `T1VisibilityService` (o mesmo filtro do `IDayPlanInputReader.loadCandidates`). O AM/OP `GET /v1/day-plans/:inspectorId/:date` devolve `status 'STALE'` quando a impressão diverge, sem recalcular (F04-tarefas, endpoints AM/OP e "rede de segurança" do Algoritmo §5).
- **F06 · projeção:** `projectStopEta(plan: EtaPlanInput, events: EtaRealEvents, now): ProjectedStop[]` (TASK-F06-1; tipos `EtaPlanInput`, `EtaPlanStop`, `EtaRealEvents`, `ProjectedStop`), puro, sobre o `evaluateSequence` da F04 com piso do `LATE_NOTICE`. A regra de partida é a da F06 (Algoritmo §A) e **não** é repetida aqui (L-F05-10). A F06 também exporta `etaPlanInputFromDayPlanResponse`, mas a F05 **não** o usa: monta `EtaPlanInput` direto das linhas brutas da consulta única (mais barato que montar um `DayPlanResponse` parcial). Por decisão do coordenador (2026-10-28), é o **único** módulo de projeção e fica em `packages/shared/src/route-planning/` (ver Achado 2 sobre o caminho no arquivo da F06).
- **Shared · helpers de fio:** `instantStr`, `instantStrNullable`, `civilDateStr` (e `civilDateStrNullable`) são `const` **privados** de `packages/shared/src/schemas/responses.ts:39-57`. Precisam ser exportados para `schemas/live-day.ts` usá-los (passo 2).
- **Código do appointment:** `tenants.appointment_code_prefix` (`schema.prisma:173`, `VarChar(4)`, nulo) + `appointments.appointment_number`, formatados por `formatAppointmentCode(prefix, number)` (hoje em `apps/backend/src/modules/fy/domain/fy.repository.ts:71`), o mesmo que dá o `appointmentCode` da F04.

### Decisões aplicáveis

D1, D2, D4, D5, D11, D12, D13, D14, D15, D16 (2026-10-27); D17–D21 (revisão de 2026-10-28). F04 D10, D14, D18 (2026-10-27). F03 D9, D10, D13 (2026-10-27) e D17 (2026-10-28).

Lacunas decididas em **2026-10-29** (`lacunas/F05-lacunas.md`, recomendações aceitas):
- **Ciclo de vida dos alertas, sem reconhecimento (L-F05-01).** Não há "visto/reconhecido" nem no servidor nem no cliente nesta etapa. Cada tipo tem uma regra explícita de **saída** (coluna "Sai quando" do Algoritmo §5). O `CANT_DO` sai quando o appointment deixa de estar `REJECTED` (reofertado, cancelado) **ou** volta a ter `inspector_id` (reatribuído): esse é o sinal de "a OP tratou". O roster (D19) só conta `CANT_DO` **ativo**.
- **Dias passados (L-F05-02).** Com `date < today` (hoje do ator): **sem projeção** (`predictedStartAt = published_service_start_at ?? service_start_at ?? window_start_at`, ou início da janela fora do plano); `NOT_STARTED` mede `minutes` do baseline até `window_end_at` (não até `now`), e o web usa a copy "Not started that day"; `DELAY` é calculado em qualquer estado com parada iniciada (inclusive `DONE_FOR_DAY`), porque o dia está encerrado e o atraso é um fato dele. `date ≥ today` segue a regra normal.
- **T-1 em tudo (L-F05-03).** O mesmo filtro do `T1VisibilityService` da F04 (SCHEDULED filtrados com `todayCivil` no fuso do inspetor; `DONE` entra sempre) é aplicado em memória **antes** de montar paradas, `progress`, alertas, último ponto, roster e a regra "conjunto de paradas mudou" (§6.1). F05 e F04 veem o mesmo conjunto. As invisíveis pelo T-1 não aparecem.
- **`today` na resposta (L-F05-05).** `liveDayResponseSchema` ganha `today` (`civilDateStr()`, hoje do ator no servidor). Toda lógica de "hoje" do cliente vem dele.
- **Teto de rotas (L-F05-06).** `includeGeometry=all` com roster > **60** inspetores → 400 `LIVE_DAY_TOO_MANY_ROUTES` "Too many routes to draw at once. Narrow the list first." (proteção contra cliente antigo; o web limita a 40 visíveis). Pins de inspetor sem cluster (poucos por ponto; `computeMarkerOffsets` separa a base compartilhada).
- **Orçamento e observabilidade (L-F05-07).** p95 ≤ **300 ms** com 50 inspetores em `none` e ≤ **800 ms** em `all` (medido no teste 15). Log `info` `live_day.read { date, inspectors, includeGeometry, durationMs, bodyBytes }` por requisição, **nunca** com coordenadas de inspetor (check-in/out) nem token, inclusive nos erros do use case. Rate limit com `keyGenerator: (req) => req.user?.id ?? req.ip` nas 3 rotas do módulo (precedente `fy.routes.ts:67`). O limiter global (`plugins.ts`, 200/min **por IP**) continua valendo e comporta ~60 abas por escritório atrás de um NAT. A simplificação do traçado roda **uma vez** por `dayPlanId:version` (cache LRU em memória).
- **Contrato com a F06 (L-F05-10).** Adaptador `toEtaPlanInput`/`toEtaRealEvents` (nomes da F06); paradas com `sequence null` ficam fora da entrada; `appointmentStatus` vem de `appts.status`.
- **`OUT_OF_WINDOW` (L-F05-11).** `minutes` é medido contra `time_slot_start/end` convertidos no fuso da agência (mesma base que a F03 usou para gravar a flag). Como a F03 não faz snapshot da tolerância, `thresholdMinutes` = tolerância **atual** só quando `minutes > tolerância atual`; senão `null` (a copy não mostra tolerância). Limitação conhecida.
- **Paleta (L-F05-12).** Rotas não se distinguem só pela cor entre si: o traçado mostra o nome no hover (web) e a legenda é a alternativa textual. A paleta é reordenada para alternar família de matiz e luminosidade entre índices vizinhos.
- **`byRegion` com agência (L-F05-13).** `byRegion[].agencyName: string | null` (`null` = região global), porque `service_regions` é único só por `(tenant_id, name)`.

Reconciliação com F03/F04 em **2026-10-29**:
- **Lembrete de conclusão por prefixo (L-F03-03).** O alerta `COMPLETION_REMINDER` casa `dedupe_key = COMPLETION_REMINDER_DEDUPE_PREFIX || ':' || appointmentId || ':' || date || ':' || inspectorId`, com o `inspectorId` **atual** do appointment. Um lembrete enviado ao inspetor anterior (antes da reatribuição) não vira alerta no novo. O prefixo vem do shared (parâmetro da consulta), nunca literal.
- **`LATE_NOTICE` pelo `estimatedArrivalAt` (L-F03-04).** O alerta traz o `estimatedArrivalAt` calculado pela F03 (`computeEstimatedArrivalAt`). **Revisão do dev (2026-10-29, F03 D23):** a referência é a `published_service_start_at` da parada quando há plano publicado; senão o `time_slot_start` no fuso da agência; `estimatedArrivalAt = max(referência, effectiveNoticeAt) + minutesLate`. A F05 **nunca** soma `minutesLate` a um ETA do roteiro; o piso do aviso na projeção é do `projectStopEta` (F06).
- **`OUT_OF_WINDOW` só pela flag (L-F03-06).** A F05 não recalcula a flag a partir de horários. Check-in fora da janela com `out_of_window false` (sincronização tardia com horário implausível, `windowSkipped`) **não** gera alerta.
- **`geofence_radius_m` nulo (L-F03-05).** Só acontece em execução anterior à F03; `radiusMeters null` e a copy omite o limite.
- **Funções da F04 por caminho fixo (L-F04-16).** `classifyStops` e `computeDayPlanFingerprint` são importadas de `modules/day-plan/domain/` com tipos planos; a F05 não extrai nem copia nada.
- **Join com status (L-F04-04).** As paradas saem da CTE `appts`, que parte de `appointments` com `status IN ('SCHEDULED','DONE')`, `deleted_at IS NULL` e `inspector_id` do plano, e só então une `day_plan_stops`. A contagem `planned_count` (§6.1) continua bruta de propósito: ela só detecta parada que **saiu** do plano e não serve dado de parada.
- **`LAST_STOP` (L-F04-07).** Plano com `origin_source 'LAST_STOP'` não tem pin de origem separado (o trecho começa na última executada, que já tem pin): `origin = null` na resposta. A impressão usa a origem configurada (§1b). O último ponto conhecido usa as linhas 6–8 do §4 com a origem configurada.
- **Limites da F04 (L-F04-14).** O Live Day não consulta `GET /v1/day-plans/:inspectorId/:date` nem a folha; o poll de 30 s é só do `live-day`.

### Testes primeiro (TDD)

Escrever antes da implementação; todos falham no início (red).

**A. Domínio puro (`modules/live-day/domain/*.test.ts`, Vitest, sem banco)**

1. `derive-inspector-state.test.ts`: a tabela-verdade completa da seção "Algoritmo §2" (14 linhas, cada uma com a saída esperada).
2. `derive-stop-progress.test.ts`:
   - paradas `[A FINISHED, B IN_PROGRESS, C NOT_STARTED]` → `A DONE`, `B CURRENT`, `C REMAINING`;
   - `[A FINISHED, B NOT_STARTED, C NOT_STARTED]` → `A DONE`, `B CURRENT` (próxima), `C REMAINING`;
   - `[A NOT_STARTED, B NOT_STARTED]` → `A CURRENT`, `B REMAINING`;
   - todas `FINISHED` → todas `DONE`, nenhuma `CURRENT`;
   - `[A IN_PROGRESS (started 09:00), B IN_PROGRESS (started 10:00)]` (check-out esquecido) → `A OPEN`, `B CURRENT`. Só existe uma `CURRENT`, a de maior `startedAt`. A outra parada iniciada e não finalizada fica `OPEN` (Algoritmo §3, caso de borda 4);
   - parada com execução `abandoned_at` preenchido → tratada como `NOT_STARTED` (`REMAINING` ou `CURRENT`, conforme a posição);
   - appointment `DONE` sem execução (OP marcou manualmente) → `DONE`, `startedAt null`, `finishedAt null`.
3. `resolve-last-known-point.test.ts`, com os 9 casos da tabela "Algoritmo §4":
   - check-out mais recente → `CHECK_OUT` com coordenadas de fim;
   - check-out sem coordenada de fim → coordenadas de início da mesma execução, `source 'CHECK_OUT'`;
   - check-in mais recente que o último check-out → `CHECK_IN`;
   - empate de instante → `CHECK_IN`;
   - execução abandonada → ignorada;
   - sem execução e plano com origem `BASE` → `BASE` com `origin_lat/lng`;
   - origem `OVERRIDE` → `BASE` com as coordenadas do override, `label 'Start of day'`;
   - sem plano e com `base_lat/lng` do perfil → `BASE`, `label 'Base'`;
   - nada disso → `NONE`, `lat/lng null`;
   - **`LAST_STOP` (L-F04-07):** plano com `origin_source 'LAST_STOP'` e check-out de A → `CHECK_OUT` de A (o caso normal); `LAST_STOP` sem evento (prefixo só com A `DONE` sem execução) e override do dia → `BASE` com `origin_override_lat/lng`, `label 'Start of day'`; sem override e com base no perfil → `BASE` com `base_lat/lng`, `label 'Base'`. Nunca usa o `origin_lat/lng` gravado (imóvel de A) como base.
4. `compute-accumulated-delay.test.ts`:
   - última iniciada às 10:17 com `published_service_start_at` 10:00 → `17`;
   - sem `published_*` e com `service_start_at` 10:05 → `12`;
   - sem os dois e janela às 10:00 → `17`;
   - adiantado (09:50 contra 10:00) → `-10` (UI mostra "On time");
   - nenhuma iniciada → `null`;
   - duas iniciadas → usa a de **maior `started_at`**;
   - segundos truncados para baixo: 10:17:59 contra 10:00 → `17`.
5. `derive-alerts.test.ts`: um bloco por tipo, com limiar no limite, acima e abaixo (Algoritmo §5):
   - **DELAY** com `delayMinutes = 20`: atraso 20 → **sem** alerta; 21 → alerta `{ type 'DELAY', minutes 21, threshold 20, thresholdSource 'PLATFORM' }`; override 15 com atraso 16 → alerta com `thresholdSource 'INSPECTOR'`; estado `DONE_FOR_DAY` com atraso 40 → sem alerta; estado `NOT_STARTED` → sem alerta (o caso é do NOT_STARTED).
   - **NOT_STARTED (por parada)** com `notStartedMinutes = 30`:
     - 1ª parada A prevista às 08:00, sem início: `now` 08:30 → sem; 08:31 → alerta `{ appointmentId A, minutes 31, threshold 30, thresholdSource 'PLATFORM' }`;
     - **A finalizada às 09:00, B prevista às 10:00 e ainda não iniciada às 14:00** (estado `IN_TRANSIT`) → alerta para B com `minutes 240`. O alerta não depende do estado do inspetor;
     - A em andamento (`AT_PROPERTY`) desde 09:00 e B prevista às 10:00, `now` 10:31 → alerta para B (`minutes 31`);
     - B e C atrasadas (previstas 10:00 e 11:00, `now` 11:31) → 2 alertas, um por parada;
     - override 10 e `now` 08:11 → alerta com `thresholdSource 'INSPECTOR'`;
     - parada iniciada às 08:40 (prevista 08:00) → **sem** NOT_STARTED (o caso passa a ser o `DELAY`);
     - execução abandonada às 08:20 e `now` 08:31 → alerta (abandonada conta como não iniciada);
     - amanhã (`now` antes da data) → nunca; `DONE_FOR_DAY` → nunca (não há parada não iniciada);
     - parada fora do plano com janela às 13:00 e `now` 13:31 → alerta (baseline = início da janela).
   - **OUT_OF_WINDOW:** execução não abandonada com `out_of_window true`, janela `time_slot` 10:00–12:00 (Sydney) e check-in 12:25 → alerta `{ type 'OUT_OF_WINDOW', appointmentId, occurredAt = started_at, minutes 25, thresholdMinutes 15 (checkInWindowToleranceMinutes atual), thresholdSource 'PLATFORM' }`; check-in 12:10 com flag ligada e tolerância atual 15 (a tolerância mudou depois) → alerta com `minutes 10`, `thresholdMinutes null`, `thresholdSource null` (L-F05-11); parada de agência de Perth: `minutes` medido contra a janela em `Australia/Perth`; `out_of_window false` → sem; execução abandonada → sem; **check-in às 12:25 (fora da janela) com `out_of_window false`** (a F03 pulou a avaliação por horário implausível, `windowSkipped`) → **sem** alerta: a F05 não recalcula a flag (L-F03-06).
   - **LATE_NOTICE:** evento `LATE_NOTICE` (`TRAFFIC`, 20 min) numa parada não iniciada, janela 09:00–11:00 (Sydney), `created_at` 09:30 → alerta `{ appointmentId, minutes 20, estimatedArrivalAt 09:20, reason 'TRAFFIC', reasonLabel 'Traffic' }` (referência = início da janela, `computeEstimatedArrivalAt` real da F03; **não** `predictedStartAt + 20`); aviso às 11:20 com 20 → `estimatedArrivalAt 11:40`; `client_occurred_at` 09:10 com `created_at` 09:40 → `estimatedArrivalAt 09:20` (L-F03-04); dois avisos na mesma parada → só o mais recente; parada já iniciada depois do aviso → sem alerta; parada `DONE` → sem.
   - **CANT_DO:** evento `CANT_DO` (`NO_ANSWER`) de um appointment do dia, já `REJECTED` e desvinculado → alerta `{ appointmentId, appointmentCode, reason 'NO_ANSWER', reasonLabel, note }`, ativo o dia todo; dois `CANT_DO` → dois alertas.
   - **GEOFENCE:** execução não abandonada com `out_of_radius true` → alerta `{ phase 'START', distanceMeters, radiusMeters }`; com `finish_out_of_radius true` → `phase 'FINISH'`; as duas flags → 2 alertas; execução abandonada com flag → sem; `geofence_radius_m null` (execução pré-F03) com `out_of_radius true` → alerta com `radiusMeters null` (L-F03-05).
   - **COMPLETION_REMINDER:** notice com `dedupe_key = buildCompletionReminderDedupeKey({ appointmentId: A, civilDate: '2026-11-05', inspectorId: Jane })` (`'completion-reminder:<A>:2026-11-05:<Jane>'`) e A `SCHEDULED` de Jane sem fim → alerta `{ appointmentId A, occurredAt = notice.created_at }`; A `DONE` → sem; A com execução finalizada → sem; notice com o `inspectorId` de Tom (lembrete enviado antes de A ser reatribuído a Jane) → **sem** alerta em Jane; chave no formato antigo sem inspetor → sem (L-F03-03).
   - **Ordem e `needsAttention`:** a lista sai ordenada `CANT_DO, COMPLETION_REMINDER, NOT_STARTED, DELAY, LATE_NOTICE, GEOFENCE, OUT_OF_WINDOW` e, dentro do tipo, `occurredAt` desc. `needsAttention = alerts.length > 0`.
   - **"Sai quando" (L-F05-01)**, um caso por linha da coluna do Algoritmo §5:
     - `CANT_DO` de A com A ainda `REJECTED` e `inspector_id null` → alerta; A reofertado (`status 'AWAITING_INSPECTOR'`, `inspector_id null`) → **sem**; A reatribuído a Tom (`SCHEDULED`, `inspector_id` Tom) → **sem** alerta em Jane; A `CANCELLED` → sem;
     - `LATE_NOTICE` em B e check-in em B depois → sem;
     - `NOT_STARTED` de B e B rejeitado/reatribuído (sai das paradas vivas) → sem;
     - `GEOFENCE START` de B com B em andamento → alerta; B finalizada (check-out) → **sem** `START`; `finish_out_of_radius true` na mesma execução → `GEOFENCE FINISH` continua até o fim da data;
     - `OUT_OF_WINDOW` de B em andamento → alerta; B finalizada → sem;
     - `COMPLETION_REMINDER` de B e check-out de B → sem;
     - `DELAY` 30 com estado `DONE_FOR_DAY` em **hoje** → sem.
   - **Dia passado (L-F05-02)**, `date = 2026-11-04`, `now = 2026-11-05T10:00` Sydney, limites 20/30:
     - A com baseline 10:00, `window_end_at` 17:00, sem início → `NOT_STARTED { minutes 420, occurredAt 10:30 }` (até o fim da janela, não até `now`);
     - A com baseline 16:50 e `window_end_at` 17:00 (10 min < limite) → sem;
     - inspetor `DONE_FOR_DAY` com atraso acumulado 40 → alerta `DELAY { minutes 40 }` (no passado o estado não suprime);
     - inspetor `IN_TRANSIT` (A feita, B nunca iniciada) com atraso 25 → `DELAY { minutes 25 }` **e** `NOT_STARTED` de B.
6. `resolve-effective-thresholds.test.ts`:
   - override `null` → `{ delay 20 'PLATFORM', notStarted 30 'PLATFORM' }`;
   - `{ delayMinutes: 15 }` → `delay 15 'INSPECTOR'`, `notStarted 30 'PLATFORM'`;
   - JSON inválido (`{ delayMinutes: 'x' }`) → padrões + `logger.warn` uma vez;
   - padrão da plataforma mudado para 25 → `delay 25 'PLATFORM'`.
7. `simplify-route-geometry.test.ts`:
   - LineString de 1.000 pontos colineares → 2 pontos;
   - LineString em L (3 pontos) → mantém os 3;
   - coordenadas arredondadas para 5 casas (`151.2108333` → `151.21083`);
   - `properties` preservadas;
   - FeatureCollection vazia → vazia;
   - entrada `null` → `null`;
   - tolerância `1e-4`.
8. `build-route-fallback.test.ts`:
   - origem + 3 paradas com coordenadas → 1 Feature `LineString` `[origem, s1, s2, s3]` com `approximate: true`, `fromSequence 0`, `toSequence 3`;
   - parada sem coordenada → pulada;
   - menos de 2 pontos → `null`;
   - paradas fora do plano entram depois das planejadas, ordenadas por `windowStartAt`.
9. `inspector-route-color.test.ts` (**shared**, `packages/shared/src/live-day/inspector-route-color.test.ts`):
   - `inspectorRouteColorIndex('00000000-0000-0000-0000-000000000000')` → mesmo índice em 3 chamadas, e o índice esperado fica fixado no teste (snapshot do valor), para pegar mudança acidental do hash;
   - 1.000 uuids **determinísticos** (gerados no teste por um PRNG com semente fixa, `mulberry32(42)`, formatados como uuid v4) → todos os 12 índices aparecem e nenhum passa de 15% do total. Sem `crypto.randomUUID()`, para o teste não ficar instável;
   - `inspectorRouteColor(id).mapbox` casa `/^hsl\(\d+, \d+%, \d+%\)$/` (HSL com vírgula, lição do #1302);
   - as 12 cores têm contraste ≥ 4.5:1 contra `#FFFFFF` e contra `#F2EFE9` (referência do fundo do `streets-v12`), calculado no teste com a fórmula WCAG;
   - os valores são exatamente os da tabela "Paleta", **na ordem nova** (L-F05-12);
   - índices vizinhos (`i`, `i+1 mod 12`) têm matiz com distância circular ≥ 40° e |ΔL\*| (CIELAB, calculado no teste) ≥ 1,4 (o menor par da ordem nova, 10↔11, dá 1,46); o teste imprime a matriz de ΔL\* para a revisão. A faixa AA limita o L\* a ~32–43, então a luminosidade sozinha **não** separa rotas: o teste documenta isso e a diferenciação real é o nome no hover e a legenda.

9b. `plan-freshness.test.ts` (D17), com a função de impressão digital **real** da F04 e linhas brutas fixas:
   - impressão recalculada = `input_fingerprint` gravado → `planStatus` = o gravado (`PUBLISHED`) e `routeOutOfDate false`;
   - `time_slot_start` alterado depois do cálculo (edição sem evento) → `planStatus 'STALE'`, `routeOutOfDate true`;
   - coordenada do imóvel alterada → `STALE`;
   - duração do tipo de serviço alterada → `STALE`;
   - override de origem removido → `STALE`;
   - check-in numa parada (`execState` NOT_STARTED → STARTED) → `STALE`; check-out da mesma parada → **não** muda (a impressão da F04 não distingue STARTED de FINISHED);
   - parada `SCHEDULED` invisível pelo T-1 (ROUTINE não confirmada de amanhã) **não** entra na impressão, como no leitor da F04;
   - gravado `STALE` e impressão igual → continua `STALE`;
   - plano gravado com `origin_source 'LAST_STOP'` (prefixo executado) e override do dia → a entrada da impressão usa a origem **configurada** (override), nunca `LAST_STOP` nem o imóvel da última executada; com o `input_fingerprint` gravado pela F04 na mesma situação → `PUBLISHED`, `routeOutOfDate false` (L-F04-07/16);
   - `computeDayPlanFingerprint` e `classifyStops` importados de `modules/day-plan/domain/` (o teste falha se houver cópia local em `modules/live-day/`);
   - o teste conta as chamadas a `IRoutingService`/`fetch` → 0.
9c. `to-eta-inputs.test.ts` (adaptador para o `projectStopEta` da F06-1; nomes da F06, L-F05-10). Com a fixture A/B/C dos exemplos E1–E4 da F06-tarefas (§A):
   - `toEtaPlanInput(planRow, stopRows)` monta `EtaPlanInput { dayPlanId, planVersion, planDate, timezone, hasOrigin = origin_source ≠ 'NONE', departureAt, approximate, stops }` e cada `EtaPlanStop` com `appointmentId`, `sequence`, `tenantId`, `scheduledDate`, `appointmentStatus` (= `appts.status`), `travelS`, `durationMinutes`, `windowStartAt`/`windowEndAt`/`windowTimezone`, `missingCoordinates`, `serviceStartAt`/`serviceEndAt`, `publishedServiceStartAt`;
   - parada com `sequence null` (fora do plano) **não** entra em `stops` da entrada (a F06 não aceita `sequence` nulo); parada invisível pelo T-1 também não;
   - `toEtaRealEvents(rows, events)` monta `executions` (abandonada → `startedAt/finishedAt null`) e `lateNotices` (último por parada);
   - ponta a ponta com o `projectStopEta` **real** (import do shared, sem cópia local): E3b (`now` 11:00, A fim 08:55, B início 09:12) → `predictedStartAt` de C = 11:25; E4a (`now` 08:20, aviso de 30 min em B) → B = 09:30 (piso aplicado);
   - paradas fora do plano não passam pela projeção: `predictedStartAt` = início da janela;
   - inspetor sem plano → nenhuma chamada ao `projectStopEta`;
   - **dia passado** (`date` < hoje, L-F05-02) → nenhuma chamada ao `projectStopEta`; `predictedStartAt` de C = `published_service_start_at` (09:45), não um horário de hoje.
9d. `filter-t1-visible.test.ts` (L-F05-03), com o predicado puro do `T1VisibilityService` da F04 (real) e `date` = amanhã, `now` 15:00 (antes do corte das 19:00):
   - Jane com A (INGOING `SCHEDULED`), B (ROUTINE, exige confirmação, sem chave, `PENDING`) e plano `PUBLISHED` com só A → `stops` = [A], `progress.total 1`, B não gera `NOT_STARTED`, a regra "conjunto mudou" **não** dispara, `planStatus 'PUBLISHED'`, `routeApproximate = plan.approximate` e `geometry` = gravada (não o fallback);
   - B passa a `CONFIRMED` → B aparece (`inPlan false` se o plano não o tem) e o conjunto mudou;
   - `DONE` entra sempre, mesmo de ROUTINE não confirmada;
   - inspetor cujas únicas paradas são invisíveis e sem `CANT_DO` ativo → fora do roster.

**B. Use cases (Vitest, repositório em memória)**

10. `get-live-day.use-case.test.ts`:
    - AM e OP → 200 com o shape do schema;
    - CL_ADMIN, CL_USER e INSP → `ForbiddenError` `AUTH_FORBIDDEN` "Insufficient permissions to view the live day";
    - sem `date` → usa hoje no fuso do ator (relógio injetado: `now` 2026-11-04T13:30Z, ator Sydney → `2026-11-05`);
    - `date` = amanhã → aceita;
    - `date` = depois de amanhã → `ValidationError` `LIVE_DAY_DATE_TOO_FAR` "Pick today, tomorrow or a past date";
    - `includeGeometry` ausente → `none`: todas as linhas com `geometry null` e `geometryIncluded false`;
    - `includeGeometry=selected&inspectorId=J` → só J com `geometryIncluded true`;
    - `includeGeometry=selected` sem `inspectorId` → 400 `LIVE_DAY_INSPECTOR_REQUIRED` "Pick an inspector to include its route";
    - `includeGeometry=all` → todas as linhas com `geometryIncluded true`;
    - `inspectorId` que não está na data → 200, sem geometria (o web trata a seleção como inexistente);
    - `isToday` correto nos 3 casos;
    - `today` = hoje do ator em qualquer `date` pedido (`date` ontem → `today '2026-11-05'`, `isToday false`) (L-F05-05);
    - `includeGeometry=all` com 61 inspetores no roster → `ValidationError` `LIVE_DAY_TOO_MANY_ROUTES` "Too many routes to draw at once. Narrow the list first."; com 60 → 200; `none`/`selected` com 61 → 200 (L-F05-06);
    - log `live_day.read` emitido 1 vez com `{ date, inspectors, includeGeometry, durationMs, bodyBytes }`; o objeto logado (sucesso e erro) **não** contém `lat`, `lng`, `latitude`, `longitude` nem `authorization` (asserção por chave, recursiva) (L-F05-07);
    - `summary` soma por estado;
    - `generatedAt` = `now` injetado;
    - `thresholdsDefault` vem do `IPlatformSettingsReader`.
    - **plano inviável (L-F04-05, 2026-10-29):** plano de Jane com `feasible false` e B com `late_s 1500` → `routeFeasible false`, `routeViolations [{ appointmentId: B, appointmentCode, sequence 2, lateMinutes 25 }]`, `alerts` **sem** item novo (os 7 tipos continuam) e `needsAttention` inalterado; plano `feasible true` → `routeFeasible true`, `routeViolations []`; sem plano → `routeFeasible true`, `[]`.
11. `get-locked-time.use-case.test.ts`:
    - AM/OP ok; CL/INSP → 403 `AUTH_FORBIDDEN`;
    - padrão `from` = hoje do ator e `to` = `from + 13`;
    - `to < from` → 400 `LOCKED_TIME_INVALID_RANGE` "End date must be on or after start date";
    - span de 32 dias → 400 `LOCKED_TIME_RANGE_TOO_LONG` "Pick a period of up to 31 days";
    - `percent` = `round(confirmed / required × 100, 1)`; `required 0` → `null`.
12. `get/update-inspector-alert-thresholds.use-case.test.ts`:
    - GET devolve `platformDefaults`, `override`, `effective`;
    - PUT `{ delayMinutes: 15, notStartedMinutes: null }` → grava `{ delayMinutes: 15 }` e audit `inspector.alert_thresholds_updated` com `before`/`after` e `tenantId null`;
    - PUT com os dois `null` → coluna `NULL`;
    - PUT igual ao estado atual → 200, **sem** audit;
    - inspetor inexistente ou deletado → 404 `INSPECTOR_NOT_FOUND`;
    - CL/INSP → 403.

**C. Integração com banco (`tests/integration/db/`, Testcontainers, em série)**

13. `live-day.repository.integration.test.ts`. Seed: 2 agências (Sydney e Perth), 3 inspetores, `date = 2026-11-05`:
    - Jane: plano `PUBLISHED` com 3 paradas, A `DONE` com execução finalizada às 09:41, B com check-in às 10:17, C não iniciada;
    - Tom: plano com 2 paradas, nenhuma iniciada;
    - Ana: sem plano, com 1 appointment `SCHEDULED`.

    Saídas esperadas:
    - 3 linhas ordenadas por nome (`Ana`, `Jane`, `Tom`);
    - Jane `AT_PROPERTY`, `progress { done 1, inProgress 1, remaining 1, total 3 }`, `lastKnown.source 'CHECK_IN'` com as coordenadas do start de B, `delayMinutes` = 10:17 − `published_service_start_at` de B;
    - Tom `NOT_STARTED`, `lastKnown.source 'BASE'`;
    - Ana com `dayPlanId null`, `planStatus 'NONE'`, `stops[0].inPlan false`, `routeApproximate true`;
    - `appointmentCode` = `formatAppointmentCode(tenants.appointment_code_prefix, appointment_number)` (agência com prefixo `RWS` → `RWS-0042`; agência sem prefixo → o formato padrão do formatador);
    - C de Jane com `predictedStartAt` = saída do `projectStopEta` para a fixture (B em andamento desde 10:17), não o `service_start_at` gravado;
    - appointment de **outra data** não aparece;
    - appointment `deleted_at` não aparece;
    - appointment `CANCELLED` não aparece como parada;
    - **join com status (L-F04-04):** A de Jane (`DONE`) volta a `DRAFT` por `UPDATE` direto, mantendo `inspector_id` → A some de `stops` e de `progress`, o serializer não lança, `planStatus 'STALE'` e o traçado vira o fallback reto (`planned_count` bruto detecta a saída); appointment `REJECTED`/`CANCELLED` com o mesmo `inspector_id` e linha em `day_plan_stops` também não volta;
    - **`LAST_STOP` (L-F04-07):** plano de Jane gravado com `origin_source 'LAST_STOP'` → `origin null` na resposta e o fallback (`includeGeometry=all` com o conjunto mudado) começa na 1ª parada, sem ponto de origem;
    - **T-1 (L-F05-03):** com `date = 2026-11-06` (amanhã) e `now` 15:00, uma ROUTINE `SCHEDULED` `PENDING` (exige confirmação, sem chave) de Tom **não** aparece em `stops` nem em `progress.total`, e não derruba a geometria para o fallback;
    - **dia passado (L-F05-02):** a mesma seed lida com `now` em 2026-11-06 → C de Jane com `predictedStartAt` = `published_service_start_at` gravado, e Tom com `NOT_STARTED` por parada medido até `window_end_at`.
14. Mesma seed + eventos. Saídas esperadas:
    - `CANT_DO` de um appointment do dia de Tom (agora `REJECTED`, `inspector_id null`) → Tom tem alerta `CANT_DO` e a parada some de `stops`;
    - o mesmo appointment reofertado (`UPDATE … SET status = 'AWAITING_INSPECTOR'`) → Tom **sem** `CANT_DO`; aceito por Ana (`SCHEDULED`, `inspector_id` Ana) → aparece nas paradas de Ana e Tom continua sem o alerta (L-F05-01);
    - um inspetor cujo único appointment foi rejeitado por `CANT_DO` → aparece com `stops []`, `state 'DONE_FOR_DAY'` e alerta `CANT_DO`;
    - `LATE_NOTICE` em C de Jane → alerta;
    - `out_of_radius` na execução de B → alerta `GEOFENCE START`;
    - notice `completion-reminder:<B>:2026-11-05:<Jane>` (gravado com `buildCompletionReminderDedupeKey`) → alerta `COMPLETION_REMINDER`; o mesmo com o `inspectorId` de Tom → sem alerta (L-F03-03);
    - `LATE_NOTICE` em C de Jane → `estimatedArrivalAt` = `computeEstimatedArrivalAt` sobre a janela de C e `client_occurred_at ?? created_at` (L-F03-04);
    - `out_of_window` na execução de A → alerta `OUT_OF_WINDOW`;
    - evento criado em 2026-11-04 para um appointment de 2026-11-04 → **não** aparece;
    - **roster (D19):** inspetor Leo com plano `PUBLISHED` cujas 2 paradas foram reatribuídas a Tom, sem `CANT_DO` → **não** aparece (nem como "0 of 0"); a mesma situação com um `CANT_DO` do dia **ativo** (appointment ainda `REJECTED` e sem inspetor) → aparece com `stops []` e `DONE_FOR_DAY`; depois que esse appointment é reofertado → Leo **some** da lista (L-F05-01).
13b. **01.A4 por HTTP** (`tests/integration/db/live-day-a4.integration.test.ts`, Supertest + Testcontainers, rotas reais da F03 e da F05). Seed: inspetor Jane com plano publicado de 2 paradas (A, B) para hoje (relógio injetado), token INSP de Jane e token AM.
    1. `GET /v1/dashboard/live-day` (AM) → Jane `NOT_STARTED`, `progress { done 0, inProgress 0, remaining 2 }`, `lastKnown.source 'BASE'`;
    2. `POST /v1/inspector/appointments/<A>/start` (INSP, `Idempotency-Key`, coordenada a 20 m do imóvel) → 201;
    3. `GET …/live-day` → Jane `AT_PROPERTY`, `lastKnown.source 'CHECK_IN'`, A `CURRENT`, `planStatus 'STALE'` (o check-in muda a impressão da F04) e `routeOutOfDate true`;
    4. `POST /v1/inspector/appointments/<A>/finish` (INSP) → 200 (A `DONE`);
    5. `GET …/live-day` → Jane `IN_TRANSIT`, A `DONE` com `startedAt`/`finishedAt`, B `CURRENT` ("Next"), `lastKnown.source 'CHECK_OUT'`;
    6. `start` + `finish` de B → `GET …/live-day` → Jane `DONE_FOR_DAY`, `progress { done 2, remaining 0 }`.
    Em nenhum passo há chamada ao Mapbox (espião).
15. **Uma consulta só:** com o Prisma em modo `log: ['query']` (ou contador no `$queryRaw`), `getLiveDay` com 1 inspetor e com 30 inspetores (seed de 30 × 6 paradas) → exatamente **1** consulta SQL nos dois casos, com `includeGeometry` em `none`, `selected` e `all` (o `PlatformSetting` vem do cache; o teste aquece o cache antes). A impressão digital (D17) e a projeção (F06-1) rodam em memória e não acrescentam consultas.
    - **Orçamento (L-F05-07):** seed de 50 inspetores × 6 paradas, 20 execuções do use case completo (consulta + memória) depois de 2 de aquecimento → p95 ≤ **300 ms** em `none` e ≤ **800 ms** em `all`. O teste registra p50/p95 no output (referência para o QA) e só falha acima do teto.
    - **Cache da simplificação (L-F05-07):** 2 chamadas `all` seguidas com o mesmo `dayPlanId:version` → `simplifyRouteGeometry` chamada 1 vez por plano (espião); `version` incrementada → simplifica de novo; `route_geometry` nulo → nada em cache.
15b. **Tamanho da resposta (D18).** Seed de 30 inspetores × 6 paradas, cada plano com `route_geometry` de 6 trechos × 400 pontos (o volume de um `overview=full` urbano). Corpo serializado (`JSON.stringify(body).length`):
    - `includeGeometry=none` → **< 60 000 bytes** e nenhum `geometry` não nulo;
    - `includeGeometry=selected&inspectorId=<1>` → **< 80 000 bytes** e só 1 `geometry` não nulo;
    - `includeGeometry=all` → **< 400 000 bytes** (depois da simplificação e do arredondamento) e 30 `geometry` não nulos;
    - sem simplificação (`simplifyRouteGeometry` desligada no teste por injeção) o corpo `all` passaria de 1 MB, o que prova que a asserção mede algo real;
    - **100 inspetores** × 6 paradas em `includeGeometry=none` → **< 200 000 bytes**; em `all` → 400 `LIVE_DAY_TOO_MANY_ROUTES` (teto de 60, L-F05-06).
16. **Sem Mapbox:** o `IRoutingService` e o `fetch` global são espiões → 0 chamadas em `getLiveDay` e `getLockedTime`.
17. **Paradas fora do plano** (`includeGeometry=all`): plano de Jane com A e B; depois do cálculo, C é atribuído a Jane. Saídas esperadas: C em `stops` com `sequence null` e `inPlan false`, depois de B; `planStatus 'STALE'` (a impressão diverge) e `routeOutOfDate true`; `geometry` = fallback reto (`approximate true` em todas as features); `routeApproximate true`.
18. **Parada que saiu do plano:** B é reatribuído a Tom → sai das paradas de Jane, `planStatus 'STALE'`, `routeOutOfDate true`, fallback reto.
19. **Edição sem evento (D17):** `UPDATE appointments SET time_slot_start = '13:00'` direto no banco (simula `update-appointment`, que não emite evento), com `day_plans.status` ainda `PUBLISHED` → `planStatus 'STALE'`, `routeOutOfDate true`; como o conjunto de paradas não mudou, `geometry` = o traçado **gravado** (simplificado) e `routeApproximate` = `plan.approximate`. Nenhuma linha de `day_plans` muda (a leitura não grava).
20. **Plano de dia passado com traçado expurgado** (`route_geometry NULL`, `geometry_purged_at` preenchido), `includeGeometry=all` → fallback reto e `routeApproximate true`.
21. `locked-time.repository.integration.test.ts`. Seed com PostGIS:
    - região R1 global (`region_number 1`) e R2 da agência X (`region_number 2`), sobrepostas;
    - imóvel P1 dentro das duas; imóvel P2 fora de todas;
    - grupo G com `service_region_id = R2`.

    Appointments no período:
    - a1: ROUTINE, exige confirmação, sem chave, CONFIRMED, em G;
    - a2: ROUTINE, PENDING, P1, sem grupo;
    - a3: ROUTINE, `key_required true`;
    - a4: INGOING;
    - a5: tipo com `requires_rental_tenant_confirmation false`;
    - a6: ROUTINE, CONFIRMED, P2;
    - a7: ROUTINE, CANCELLED;
    - a8: ROUTINE, DRAFT;
    - a9: ROUTINE, `deleted_at` preenchido;
    - a10: ROUTINE, fora do período;
    - a11: ROUTINE, P1, sem grupo, `REJECTED` com `rejection_reason_code 'TENANT_NO_RESPONSE'` (cortado no T-1);
    - a12: ROUTINE, P2, `REJECTED` com `'TENANT_DECLINED'`;
    - a13: ROUTINE, `REJECTED` com `'INSPECTOR_UNABLE'` (fora: não é recusa do inquilino).

    Saídas esperadas (D21):
    - `overall { confirmed 2, required 5, percent 40.0 }` (numerador a1, a6; denominador a1, a2, a6, a11, a12);
    - `byAgency` de X `{ 2, 5, 40.0 }`;
    - `byRegion`: R2 `{ confirmed 1, required 1, percent 100.0 }` (a1, pela região do **grupo**, mesmo com R1 de número menor), R1 `{ 0, 2, 0.0 }` (a2 e a11, por `ST_Intersects`, desempate pelo menor `region_number`), "No region" `{ 1, 2, 50.0 }` (a6 e a12);
    - controle do T-1: o mesmo dia **sem** a11 e a12 no denominador daria 66.7%, e com a regra antiga um D+1 depois do corte (só a1 e a6 restantes) daria 100%; com a regra nova fica em 40.0%;
    - região `INACTIVE` não entra no `ST_Intersects`;
    - região de **outra agência** não entra (só `tenant_id = a.tenant_id` ou `NULL`);
    - **`agencyName` em `byRegion` (L-F05-13):** R2 (da agência X) → `agencyName` = nome de X; R1 (global) → `agencyName null`; "No region" → `null`. Com uma região "North" da agência X e outra "North" da agência Y, cada uma com 1 appointment → 2 linhas distintas (`regionId` diferentes), `agencyName` X e Y.
22. `locked-time`: 1 consulta SQL só (mesmo contador do teste 15) e 0 chamadas externas.
23. `inspector-alert-thresholds.integration.test.ts`: PUT → GET devolve o gravado; `alert_overrides_json` no banco = `{"delayMinutes":15}`; o `GET /v1/dashboard/live-day` seguinte usa 15 para esse inspetor (alerta `DELAY` com atraso 16 e `thresholdSource 'INSPECTOR'`). Esta é a prova do **01.A5** com override.

**D. Rotas (Supertest)**

24. `GET /v1/dashboard/live-day`:
    - AM → 200; OP → 200; CL_ADMIN/CL_USER/INSP → 403 `{ error: { code 'AUTH_FORBIDDEN' } }`; sem token → 401;
    - `date=2026-13-01` → 400 `VALIDATION_ERROR`;
    - resposta passa pelo serializer sem jogar exceção com: inspetor sem plano, `lastKnown` `NONE`, `geometry null`, `alerts []`, `stops []` (lição "serializer throws");
    - nenhum campo não declarado escapa (lição "strip undeclared"): `routing_matrix_json`, `input_fingerprint` e `alert_overrides_json` **não** aparecem no corpo; `today` aparece;
    - **rate limit por usuário (L-F05-07):** com `max` reduzido por injeção no teste (ex.: 3), usuário AM-1 faz 4 chamadas do mesmo IP → a 4ª dá 429; AM-2, do **mesmo IP**, ainda recebe 200 (chave = `user.id`, não IP).
25. `GET /v1/dashboard/locked-time`: mesma matriz de RBAC; `from=2026-11-05&to=2026-11-01` → 400 `LOCKED_TIME_INVALID_RANGE`.
26. `GET/PUT /v1/inspectors/:id/alert-thresholds`:
    - matriz RBAC (AM/OP sim; resto 403);
    - `delayMinutes: 4` → 400; `241` → 400; `20.5` → 400;
    - campo extra `foo` → 400 (schema `.strict()`);
    - id não-uuid → 400.
27. Rotas estáticas não colidem: `/v1/inspectors/:id/alert-thresholds` convive com as rotas existentes de `/v1/inspectors/:id`.

**E. Shared**

28. `live-day.schema.test.ts`:
    - `liveDayQuerySchema` aceita `{}`, `{ date: '2026-11-05' }`, `{ includeGeometry: 'all' }` e `{ includeGeometry: 'selected', inspectorId: <uuid> }`; rejeita `'05/11/2026'`, `includeGeometry: 'some'` e `inspectorId` não-uuid; o default de `includeGeometry` é `'none'`;
   - `liveDayResponseSchema` exige `today` (`YYYY-MM-DD`); `liveDayInspectorSchema` exige `routeFeasible` e `routeViolations` (L-F04-05); `liveDayAlertSchema.type` continua com 7 valores (sem `ROUTE_INFEASIBLE`); `lockedTimeResponseSchema.byRegion[]` exige `agencyName` (`string | null`);
   - `LIVE_DAY_SHOW_ALL_MAX = 40` e `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS = 60` exportados do shared;
    - `instantStr`, `instantStrNullable`, `civilDateStr` e `civilDateStrNullable` são importáveis de `@properfy/shared` e mantêm o comportamento atual (Date → ISO; Date → `YYYY-MM-DD`); os testes atuais de `responses.ts` continuam verdes;
    - `lockedTimeQuerySchema` idem;
    - `updateInspectorAlertThresholdsSchema` aceita `null` nos dois campos e rejeita `undefined` (os dois campos são obrigatórios: `null` = "usar o padrão");
    - `liveDayAlertsSettingSchema` aceita `{ delayMinutes: 20, notStartedMinutes: 30 }`, rejeita `0` e `241` e tem defaults `20/30` no registro.

### Escopo / Passos

1. **Migration** `YYYYMMDDhhmmss_inspector_alert_overrides` (expand): `ALTER TABLE "inspectors" ADD COLUMN "alert_overrides_json" JSONB;`. No `schema.prisma`: `alert_overrides_json Json?` no model `Inspector`, com comentário "F05 per-inspector Live Day alert overrides; null = platform defaults". Conferir o diff do `migrate dev` contra índices `Unsupported()` (o GIST de `service_regions` não pode sumir).
2. **Shared** (`packages/shared`):
   - `src/schemas/platform-settings.ts`: chave `liveDayAlerts` no `PLATFORM_SETTINGS_REGISTRY`, `section: 'Live Day alerts'` (ver Contratos);
   - `src/schemas/responses.ts`: **exportar** `instantStr`, `instantStrNullable`, `civilDateStr` e `civilDateStrNullable` (hoje `const` privados nas linhas 39-57), sem mudar a implementação, e reexportar em `src/index.ts`. Conferir se a TASK-F04-2 já exportou (ela também usa os helpers em `schemas/day-plan.ts`); se sim, este item vira só o reuso;
   - `src/schemas/live-day.ts` (novo): `liveDayQuerySchema`, `liveDayResponseSchema` e sub-schemas, `lockedTimeQuerySchema`, `lockedTimeResponseSchema`, `inspectorAlertThresholdsResponseSchema`, `updateInspectorAlertThresholdsSchema`. Reusa **exatamente** o `dayPlanGeometrySchema` de `schemas/day-plan.ts`;
   - `src/enums/live-day.ts` (novo): `LiveDayInspectorState`, `LiveDayStopProgress`, `LiveDayAlertType`, `LiveDayLastKnownSource`, `LIVE_DAY_ALERT_TYPE_ORDER`, rótulos `LIVE_DAY_STATE_LABELS` e `LIVE_DAY_ALERT_LABELS`, e as constantes `LIVE_DAY_SHOW_ALL_MAX = 40` (cliente) e `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS = 60` (servidor) (L-F05-06);
   - `src/live-day/inspector-route-color.ts` (novo): `INSPECTOR_ROUTE_PALETTE` (na ordem nova da tabela "Paleta", L-F05-12), `inspectorRouteColorIndex`, `inspectorRouteColor` (ver "Paleta"). Fica no shared porque o web usa e o teste de contraste é puro;
   - exportar tudo em `src/index.ts`; `pnpm --filter @properfy/shared build` antes do backend.
3. **Módulo `apps/backend/src/modules/live-day/`** (novo):
   - `domain/`: `live-day.read-repository.ts` (porta `ILiveDayReadRepository { getDay(date): Promise<LiveDayRawRow[]>; getLockedTime(from, to): Promise<LockedTimeRawRows> }`) e as funções puras `derive-inspector-state.ts`, `derive-stop-progress.ts`, `resolve-last-known-point.ts`, `compute-accumulated-delay.ts`, `derive-alerts.ts`, `resolve-effective-thresholds.ts`, `simplify-route-geometry.ts`, `build-route-fallback.ts`. A classificação "executada / em andamento / não iniciada" chama o `classifyStops` de `modules/day-plan/domain/classify-stops.ts` (TASK-F04-2, regra D18, L-F04-16), sem duplicar a regra; a impressão chama o `computeDayPlanFingerprint` de `modules/day-plan/domain/day-plan-fingerprint.ts`. O `derive-alerts.ts` usa o `computeEstimatedArrivalAt` da F03 para o `LATE_NOTICE` (L-F03-04) e recebe as chaves de lembrete já casadas pelo repositório (L-F03-03). Também: `plan-freshness.ts` (`resolvePlanFreshness(row, plan)`: monta a entrada de `day-plan-fingerprint.ts` da F04 com a origem resolvida e o filtro do `T1VisibilityService`, compara com `input_fingerprint` e devolve `planStatus`/`routeOutOfDate`, D17), `filter-t1-visible.ts` (`filterT1Visible(rows, todayCivil)`: aplica o predicado puro do `T1VisibilityService` aos `SCHEDULED`, `DONE` sempre; é o **1º** passo do use case e a mesma lista alimenta impressão, paradas, progresso, alertas e roster, L-F05-03) e `to-eta-inputs.ts` (`toEtaPlanInput`, `toEtaRealEvents`, que alimentam o `projectStopEta` da F06-1; sem paradas `sequence null`, L-F05-10). O `derive-alerts.ts` recebe `{ date, today, now }` e aplica as regras de saída (coluna "Sai quando") e o ramo de dia passado (L-F05-01, L-F05-02);
   - `infrastructure/prisma-live-day.read-repository.ts`: as 2 consultas `$queryRaw` (Algoritmo §1 e §7), com conversão `Decimal → number` e parâmetros `::date`, `::text[]` explícitos (lição `$queryRaw ::int`); o prefixo do lembrete entra como parâmetro (`COMPLETION_REMINDER_DEDUPE_PREFIX` do shared, L-F03-03);
   - `infrastructure/simplified-geometry-cache.ts` (L-F05-07): LRU em memória (máx. 500 entradas, chave `dayPlanId:version`), envolvendo `simplifyRouteGeometry`. Só guarda quando `route_geometry` não é nulo. Por processo (sem Redis; o app é stateless e cada máquina aquece o seu);
   - `application/use-cases/get-live-day.use-case.ts`, `get-locked-time.use-case.ts` (RBAC `LIVE_DAY_ROLES = ['AM','OP']`, relógio injetável). O `get-live-day`:
     - calcula `today` (hoje do ator) e o devolve na resposta (L-F05-05);
     - rejeita `includeGeometry=all` com roster > `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS` (400 `LIVE_DAY_TOO_MANY_ROUTES`, L-F05-06), depois da consulta e do filtro T-1 (o roster só é conhecido aí; a consulta de `all` já trouxe as geometrias, o que é aceitável para um caso de proteção);
     - chama o `projectStopEta` uma vez por inspetor com plano (em memória) **só quando `date ≥ today`**; em dia passado usa o horário de plano (L-F05-02);
     - só monta `geometry` (gravada simplificada via cache, ou fallback reto) para os inspetores pedidos em `includeGeometry`;
     - emite o log `live_day.read` (L-F05-07) no fim, com `durationMs` e `bodyBytes` (`Buffer.byteLength(JSON.stringify(result))`), sem coordenadas;
   - `interfaces/live-day.routes.ts`: `registerLiveDayRoutes(app, container)` com `GET /v1/dashboard/live-day` e `GET /v1/dashboard/locked-time`; rate limit **120/min por usuário** (polling de 30 s com folga para várias abas) com `config.rateLimit.keyGenerator: (req) => req.user?.id ?? req.ip` (precedente `fy.routes.ts:63-72`, que chaveia por hash da API key; o limiter global do `plugins.ts` é por IP e continua valendo, L-F05-07). O `req.user` só existe depois do `authenticate`: o limiter da rota precisa rodar **depois** dele (`hook: 'preHandler'` na config da rota, registrada após o middleware de auth). Se a versão instalada do `@fastify/rate-limit` não aceitar `hook` por rota, usar o mesmo recurso do `fy.routes.ts`: chave = sha256 do header `Authorization` (nunca o token em claro), com fallback `req.ip`;
   - wiring em `main/container.ts` (`container.liveDay`) e `main/routes.ts` (depois da linha 109).
4. **Inspector** (`apps/backend/src/modules/inspector/`):
   - `application/use-cases/get-inspector-alert-thresholds.use-case.ts` e `update-inspector-alert-thresholds.use-case.ts` (RBAC AM/OP via `authorizationService.assertRoles(actor, ['AM','OP'], { action: 'inspector.alert_thresholds.view' | 'inspector.alert_thresholds.update', entityType: 'Inspector' })`; audit `inspector.alert_thresholds_updated`);
   - métodos `getAlertOverrides(id)` / `setAlertOverrides(id, value | null)` na porta do repositório de inspetor e na implementação Prisma;
   - rotas em `interfaces/inspector.routes.ts`, com o mesmo `keyGenerator` por usuário (L-F05-07);
   - **grep de wirings de teste não tipados** que constroem o container do inspetor (lição "nova dep de use-case quebra wirings").
5. **OpenAPI + api-types:** `pnpm --filter backend generate:openapi` (gera o `openapi.json`) e depois `pnpm --filter @properfy/shared generate:types` (gera `packages/shared/src/api-types.ts`), commitado no mesmo PR (lição "api-types regenerar"). Rebuild do shared depois.
6. **Docs (regra X00):** atualizar `apps/backend/CLAUDE.md` (módulo `live-day`: leitura cross-tenant AM/OP com exceção ao §7.1, "1 consulta, sem Mapbox", `alert_overrides_json`) e `packages/shared/CLAUDE.md` (`schemas/live-day.ts`, `live-day/inspector-route-color.ts`, chave `liveDayAlerts`).
7. **Gates no worktree:** `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test` (inclui o `projectStopEta` da F06-1 já mergeado); `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; e a suíte de integração com banco (Testcontainers, em série; ela fica fora do run principal), via subagente com resumo.

### Modelo de dados / Contratos / UI / Algoritmo

#### Modelo de dados

| Tabela | Coluna | Tipo | Nulo | Default | Semântica |
|---|---|---|---|---|---|
| `inspectors` | `alert_overrides_json` | `Json?` (`JSONB`) | sim | – | `{ delayMinutes?: int 5–240, notStartedMinutes?: int 5–240 }`; só as chaves sobrescritas; `NULL` = usa o padrão da plataforma nos dois |

- Sem índice (a coluna só é lida junto da linha do inspetor).
- Sem `tenant_id` (D14). Nenhuma tabela nova.

**`PlatformSetting` — chave nova (shared)**
```ts
const alertMinutes = z.number().int().min(5).max(240);
export const liveDayAlertsSettingSchema = z.object({
  delayMinutes: alertMinutes,        // DELAY dispara quando o atraso acumulado > este valor
  notStartedMinutes: alertMinutes,   // NOT_STARTED dispara quando agora > 1º início previsto + este valor
});
export const DEFAULT_LIVE_DAY_ALERTS = { delayMinutes: 20, notStartedMinutes: 30 } as const; // onboarding (decisoes.md)
// PLATFORM_SETTINGS_REGISTRY
liveDayAlerts: { schema: liveDayAlertsSettingSchema, defaults: DEFAULT_LIVE_DAY_ALERTS, section: 'Live Day alerts' },
```

#### Contratos

Envelope de erro `{ error: { code, message, details } }`. Zod → 400 `VALIDATION_ERROR`. Todas as rotas exigem `authenticate`.

| Método e rota | Request | Response 200 | Erros (code · message) | RBAC |
|---|---|---|---|---|
| `GET /v1/dashboard/live-day` | query `date?` (`YYYY-MM-DD`; padrão: hoje no fuso do ator), `includeGeometry?` (`none` padrão \| `selected` \| `all`), `inspectorId?` (uuid; obrigatório com `selected`) | `{ data: LiveDayResponse }` | 400 `VALIDATION_ERROR`; 400 `LIVE_DAY_DATE_TOO_FAR` · "Pick today, tomorrow or a past date"; 400 `LIVE_DAY_INSPECTOR_REQUIRED` · "Pick an inspector to include its route"; 400 `LIVE_DAY_TOO_MANY_ROUTES` · "Too many routes to draw at once. Narrow the list first." (`includeGeometry=all` com roster > 60, `details { inspectors, max: 60 }`, L-F05-06); 403 `AUTH_FORBIDDEN` · "Insufficient permissions to view the live day"; 429 (rate limit) | AM, OP |
| `GET /v1/dashboard/locked-time` | query `from?`, `to?` (civis; padrão hoje → hoje+13) | `{ data: LockedTimeResponse }` | 400 `VALIDATION_ERROR`; 400 `LOCKED_TIME_INVALID_RANGE` · "End date must be on or after start date"; 400 `LOCKED_TIME_RANGE_TOO_LONG` · "Pick a period of up to 31 days"; 403 `AUTH_FORBIDDEN` · "Insufficient permissions to view locked time" | AM, OP |
| `GET /v1/inspectors/:id/alert-thresholds` | – | `{ data: InspectorAlertThresholds }` | 400; 404 `INSPECTOR_NOT_FOUND`; 403 `FORBIDDEN` (mensagem padrão `Role {role} is not permitted to perform {action}`) | AM, OP |
| `PUT /v1/inspectors/:id/alert-thresholds` | `{ delayMinutes: int 5–240 \| null, notStartedMinutes: int 5–240 \| null }` (`.strict()`, os dois obrigatórios) | `{ data: InspectorAlertThresholds }` | 400; 404 `INSPECTOR_NOT_FOUND`; 403 `FORBIDDEN` | AM, OP |

Matriz:

| Rota | AM | OP | CL_ADMIN | CL_USER | INSP | TNT / sem token |
|---|---|---|---|---|---|---|
| `/v1/dashboard/live-day` | sim | sim | 403 | 403 | 403 | 401 |
| `/v1/dashboard/locked-time` | sim | sim | 403 | 403 | 403 | 401 |
| `/v1/inspectors/:id/alert-thresholds` (GET/PUT) | sim | sim | 403 | 403 | 403 | 401 |

- `PUT` é "último vence" (mesmo critério do `PlatformSetting`, F03 D18). É idempotente: o mesmo valor não gera audit.
- Audit `inspector.alert_thresholds_updated`: `entityType 'Inspector'`, `entityId`, `tenantId null`, `actorType 'USER'`, `metadata { before, after }` (objetos com as 2 chaves, `null` = padrão).
- Rate limit: live-day 120/min por usuário; locked-time 30/min por usuário; thresholds 30/min por usuário. Chave = `user.id` (ou hash do `Authorization`), nunca só o IP (L-F05-07). O global de 200/min por IP continua por cima.
- Log (L-F05-07): `live_day.read` em `info` com `{ date, inspectors, includeGeometry, durationMs, bodyBytes }` e `locked_time.read` com `{ from, to, rows, durationMs }`. Nunca coordenadas de inspetor (check-in/out, base), nunca token. Erros do use case logam `code` e `date`, sem as linhas brutas.
- Orçamento (L-F05-07): p95 do `live-day` ≤ 300 ms com 50 inspetores em `none`, ≤ 800 ms em `all` (teste 15).

**Schemas (shared, `schemas/live-day.ts`)**
```ts
export const liveDayQuerySchema = z.object({
  date: civilDateSchema.optional(),
  includeGeometry: z.enum(['none', 'selected', 'all']).default('none'),
  inspectorId: z.string().uuid().optional(),             // obrigatório quando includeGeometry = 'selected' (checado no use case)
});

const liveDayAlertSchema = z.object({
  type: z.enum(['DELAY', 'NOT_STARTED', 'LATE_NOTICE', 'CANT_DO', 'GEOFENCE', 'OUT_OF_WINDOW', 'COMPLETION_REMINDER']),
  occurredAt: instantStr(),                       // DELAY: started_at da última iniciada; NOT_STARTED: início previsto da parada + limite; OUT_OF_WINDOW: started_at; demais: instante do evento
  appointmentId: z.string().uuid().nullable(),    // sempre preenchido hoje (todos os tipos são de uma parada); nullable para tipos futuros sem parada
  appointmentCode: z.string().nullable(),
  minutes: z.number().int().nullable(),           // DELAY/NOT_STARTED/OUT_OF_WINDOW: minutos medidos; LATE_NOTICE: minutesLate; demais: null
                                                  // NOT_STARTED em dia passado: baseline → window_end_at (L-F05-02); OUT_OF_WINDOW: contra time_slot no fuso da agência (L-F05-11)
  estimatedArrivalAt: instantStrNullable(),       // LATE_NOTICE: computeEstimatedArrivalAt da F03 (início da janela + minutes, L-F03-04); demais: null
  thresholdMinutes: z.number().int().nullable(),  // DELAY/NOT_STARTED: limite do Live Day; OUT_OF_WINDOW: tolerância atual da F03 só se minutes > ela, senão null (L-F05-11); demais: null
  thresholdSource: z.enum(['PLATFORM', 'INSPECTOR']).nullable(),
  reason: z.string().nullable(),                  // LATE_NOTICE/CANT_DO: reason_code
  reasonLabel: z.string().nullable(),             // FIELD_ISSUE_REASON_LABELS / LATE_NOTICE_REASON_LABELS
  note: z.string().nullable(),                    // CANT_DO: nota do inspetor (AM/OP veem)
  phase: z.enum(['START', 'FINISH']).nullable(),  // GEOFENCE
  distanceMeters: z.number().int().nullable(),    // GEOFENCE
  radiusMeters: z.number().int().nullable(),      // GEOFENCE (snapshot geofence_radius_m); null só em execução pré-F03 (L-F03-05)
});

const liveDayStopSchema = z.object({
  appointmentId: z.string().uuid(),
  appointmentCode: z.string(),                    // mesmo formatador do dayPlanStopSchema.appointmentCode (F04)
  sequence: z.number().int().min(1).nullable(),   // null = fora do plano (inPlan false)
  inPlan: z.boolean(),
  progress: z.enum(['DONE', 'CURRENT', 'OPEN', 'REMAINING']),
  agencyName: z.string(),
  propertyAddress: z.string(),
  suburb: z.string(),
  lat: z.number().nullable(), lng: z.number().nullable(),
  missingCoordinates: z.boolean(),
  windowStart: z.string(), windowEnd: z.string(), // "HH:mm" de parede da agência
  timezone: z.string(),                           // fuso da agência
  startedAt: instantStrNullable(),                // check-in (execução não abandonada)
  finishedAt: instantStrNullable(),               // check-out
  predictedStartAt: instantStrNullable(),         // não iniciada no plano: projectedStartAt do projectStopEta (F06-1); iniciada: startedAt; fora do plano: início da janela
                                                  // dia passado: sem projeção, published ?? service_start ?? janela (L-F05-02)
  publishedStartAt: instantStrNullable(),         // published_service_start_at (F04, congelado)
  delayMinutes: z.number().int().nullable(),      // iniciada: started_at − (published ?? predicted ?? janela); senão null
});

const liveDayInspectorSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  state: z.enum(['NOT_STARTED', 'AT_PROPERTY', 'IN_TRANSIT', 'DONE_FOR_DAY']),
  lastKnown: z.object({
    source: z.enum(['CHECK_IN', 'CHECK_OUT', 'BASE', 'NONE']),
    lat: z.number().nullable(), lng: z.number().nullable(),
    at: instantStrNullable(),                     // instante do check-in/out; null em BASE/NONE
    appointmentId: z.string().uuid().nullable(),
    label: z.string().nullable(),                 // "Base" | "Start of day" | null
  }),
  progress: z.object({
    done: z.number().int(), inProgress: z.number().int(), remaining: z.number().int(), total: z.number().int(),
  }),
  delayMinutes: z.number().int().nullable(),
  thresholds: z.object({
    delayMinutes: z.number().int(), delaySource: z.enum(['PLATFORM', 'INSPECTOR']),
    notStartedMinutes: z.number().int(), notStartedSource: z.enum(['PLATFORM', 'INSPECTOR']),
  }),
  alerts: z.array(liveDayAlertSchema),
  needsAttention: z.boolean(),
  dayPlanId: z.string().uuid().nullable(),
  planStatus: z.enum(['DRAFT', 'PUBLISHED', 'STALE', 'NONE']), // STALE também quando a impressão diverge (D17)
  planVersion: z.number().int().nullable(),
  routeOutOfDate: z.boolean(),                    // planStatus 'STALE' (gravado OU impressão digital divergente, D17)
  routeApproximate: z.boolean(),                  // plan.approximate OU traçado é fallback reto
  routeFeasible: z.boolean(),                     // day_plans.feasible; true sem plano (planStatus 'NONE'). Indicador, não alerta (D20, L-F04-05, 2026-10-29)
  routeViolations: z.array(z.object({            // paradas do plano com day_plan_stops.late_s > 0, visíveis pelo T-1, por sequence; [] quando routeFeasible
    appointmentId: z.string().uuid(), appointmentCode: z.string(),
    sequence: z.number().int().min(1), lateMinutes: z.number().int().min(1), // ceil(late_s / 60)
  })),
  origin: z.object({ lat: z.number(), lng: z.number(), label: z.string().nullable() }).nullable(), // null sem origem ou com origin_source 'LAST_STOP' (sem pin separado, L-F04-07)
  geometryIncluded: z.boolean(),                  // false = não pedido em includeGeometry (geometry vem null); true = geometry é a rota (ou null por < 2 pontos)
  geometry: dayPlanGeometrySchema.nullable(),     // só se pedido: gravado e simplificado, ou fallback reto; null se < 2 pontos
  stops: z.array(liveDayStopSchema),
});

export const liveDayResponseSchema = z.object({
  date: civilDateStr(),
  today: civilDateStr(),                          // hoje do ator no servidor (L-F05-05); o cliente nunca usa o próprio relógio para "hoje"
  timezone: z.string(),                           // fuso do ator usado para "hoje"
  isToday: z.boolean(),
  generatedAt: instantStr(),
  thresholdsDefault: z.object({ delayMinutes: z.number().int(), notStartedMinutes: z.number().int() }),
  summary: z.object({
    inspectors: z.number().int(), notStarted: z.number().int(), atProperty: z.number().int(),
    inTransit: z.number().int(), doneForDay: z.number().int(), needsAttention: z.number().int(),
    stopsDone: z.number().int(), stopsTotal: z.number().int(),
  }),
  inspectors: z.array(liveDayInspectorSchema),    // ordenado por inspectorName (localeCompare 'en-AU')
});

export const lockedTimeQuerySchema = z.object({ from: civilDateSchema.optional(), to: civilDateSchema.optional() });
const lockedRow = { confirmed: z.number().int(), required: z.number().int(), percent: z.number().nullable() }; // 1 casa
export const lockedTimeResponseSchema = z.object({
  from: civilDateStr(), to: civilDateStr(), generatedAt: instantStr(),
  overall: z.object(lockedRow),
  byAgency: z.array(z.object({ tenantId: z.string().uuid(), agencyName: z.string(), ...lockedRow })),
  byRegion: z.array(z.object({
    regionId: z.string().uuid().nullable(), regionName: z.string(),
    agencyName: z.string().nullable(),            // dono da região; null = região global ou "No region" (L-F05-13)
    ...lockedRow,
  })), // regionId null = "No region", sempre por último
});

export const updateInspectorAlertThresholdsSchema = z.object({
  delayMinutes: z.number().int().min(5).max(240).nullable(),
  notStartedMinutes: z.number().int().min(5).max(240).nullable(),
}).strict();
export const inspectorAlertThresholdsResponseSchema = z.object({
  inspectorId: z.string().uuid(),
  platformDefaults: z.object({ delayMinutes: z.number().int(), notStartedMinutes: z.number().int() }),
  override: z.object({ delayMinutes: z.number().int().nullable(), notStartedMinutes: z.number().int().nullable() }),
  effective: z.object({ delayMinutes: z.number().int(), notStartedMinutes: z.number().int() }),
});
```
- Todo campo que pode ser nulo é `.nullable()`, e as listas vazias são testadas com dado real (teste 24).
- `byAgency` e `byRegion` vêm ordenados por nome (`'No region'` por último). A ordenação por coluna é feita no cliente.

**Exemplo** (`GET /v1/dashboard/live-day?date=2026-11-05&includeGeometry=selected&inspectorId=…J`, AM, 10:31 em Sydney):
```json
{ "data": {
  "date": "2026-11-05", "today": "2026-11-05", "timezone": "Australia/Sydney", "isToday": true, "generatedAt": "2026-11-04T23:31:00.000Z",
  "thresholdsDefault": { "delayMinutes": 20, "notStartedMinutes": 30 },
  "summary": { "inspectors": 2, "notStarted": 1, "atProperty": 1, "inTransit": 0, "doneForDay": 0, "needsAttention": 2, "stopsDone": 1, "stopsTotal": 5 },
  "inspectors": [
    { "inspectorId": "…J", "inspectorName": "Jane Doe", "state": "AT_PROPERTY",
      "lastKnown": { "source": "CHECK_IN", "lat": -33.8912, "lng": 151.2101, "at": "2026-11-04T23:17:00.000Z", "appointmentId": "…B", "label": null },
      "progress": { "done": 1, "inProgress": 1, "remaining": 1, "total": 3 },
      "delayMinutes": 22,
      "thresholds": { "delayMinutes": 20, "delaySource": "PLATFORM", "notStartedMinutes": 30, "notStartedSource": "PLATFORM" },
      "alerts": [ { "type": "DELAY", "occurredAt": "2026-11-04T23:17:00.000Z", "appointmentId": "…B", "appointmentCode": "INS-0043",
                    "minutes": 22, "estimatedArrivalAt": null, "thresholdMinutes": 20, "thresholdSource": "PLATFORM",
                    "reason": null, "reasonLabel": null, "note": null, "phase": null, "distanceMeters": null, "radiusMeters": null } ],
      "needsAttention": true, "dayPlanId": "…P", "planStatus": "PUBLISHED", "planVersion": 4,
      "routeOutOfDate": false, "routeApproximate": false, "geometryIncluded": true,
      "origin": { "lat": -33.87, "lng": 151.2, "label": "Redfern NSW 2016" },
      "geometry": { "type": "FeatureCollection", "features": [ "…" ] },
      "stops": [
        { "appointmentId": "…A", "appointmentCode": "INS-0042", "sequence": 1, "inPlan": true, "progress": "DONE", "agencyName": "Ray White Surry Hills",
          "propertyAddress": "12 King St, Surry Hills NSW 2010", "suburb": "Surry Hills", "lat": -33.8836, "lng": 151.2108, "missingCoordinates": false,
          "windowStart": "08:00", "windowEnd": "17:00", "timezone": "Australia/Sydney",
          "startedAt": "2026-11-04T21:02:00.000Z", "finishedAt": "2026-11-04T21:41:00.000Z",
          "predictedStartAt": "2026-11-04T21:00:00.000Z", "publishedStartAt": "2026-11-04T21:00:00.000Z", "delayMinutes": 2 }
      ] }
  ] } }
```

#### Algoritmo

**§1 · Consulta agregada do `live-day` (uma instrução SQL)**

Parâmetros: `$1 = date` (`::date`), `$2 = includeGeometry` (`::text`), `$3 = inspectorId` (`::text`, nulo fora do `selected`), `$4 = COMPLETION_REMINDER_DEDUPE_PREFIX` (`::text`, do shared, L-F03-03). Todas as CTEs filtram pela data e usam os índices listados em "Contexto".

```sql
WITH plans AS (                                      -- day_plans (plan_date, status)
  SELECT p.* FROM day_plans p WHERE p.plan_date = $1::date
),
appts AS (                                           -- appointments (scheduled_date, inspector_id)
  SELECT a.id, a.appointment_number, a.inspector_id, a.status::text AS status, a.tenant_id,
         a.scheduled_date, a.time_slot_start, a.time_slot_end, a.key_required,
         a.rental_tenant_confirmation_status::text AS confirmation_status,
         t.name AS agency_name, t.timezone AS tenant_tz, t.appointment_code_prefix,
         st.default_duration_minutes, st.flow_type::text AS flow_type, st.requires_rental_tenant_confirmation,
         pr.street, pr.suburb, pr.state, pr.postcode, pr.lat, pr.lng,
         e.started_at, e.finished_at, e.abandoned_at,
         e.start_latitude, e.start_longitude, e.finish_latitude, e.finish_longitude,
         e.out_of_radius, e.finish_out_of_radius, e.out_of_window, e.geofence_radius_m,
         e.geolocation_distance_meters, e.finish_geolocation_distance_meters,
         pl.id AS plan_id, s.sequence, s.travel_s, s.duration_minutes, s.service_start_at, s.service_end_at,
         s.published_service_start_at, s.window_start_at, s.window_end_at, s.window_timezone, s.missing_coordinates
  FROM appointments a
  JOIN tenants t       ON t.id = a.tenant_id
  JOIN service_types st ON st.id = a.service_type_id
  JOIN properties pr   ON pr.id = a.property_id
  LEFT JOIN inspection_executions e ON e.appointment_id = a.id
  LEFT JOIN plans pl  ON pl.inspector_id = a.inspector_id
  LEFT JOIN day_plan_stops s ON s.day_plan_id = pl.id AND s.appointment_id = a.id
  WHERE a.scheduled_date = $1::date AND a.inspector_id IS NOT NULL
    AND a.deleted_at IS NULL AND a.status IN ('SCHEDULED', 'DONE')   -- L-F04-04: parada só é lida re-unida a appointment vivo do inspetor do plano
),
planned AS (                                         -- conta as paradas gravadas por plano (detecta parada que saiu); bruta de propósito, não serve dado de parada
  SELECT s.day_plan_id, count(*)::int AS planned_count
  FROM day_plan_stops s WHERE s.day_plan_id IN (SELECT id FROM plans) GROUP BY s.day_plan_id
),
events AS (                                          -- inspector_field_events (inspector_id, created_at)
  SELECT fe.id, fe.inspector_id, fe.type::text AS type, fe.appointment_id, fe.reason_code, fe.note, fe.minutes,
         fe.created_at, fe.client_occurred_at,                                    -- L-F03-04: insumo do computeEstimatedArrivalAt
         a2.time_slot_start AS appt_time_slot_start, a2.scheduled_date AS appt_scheduled_date, t2.timezone AS appt_tenant_tz,
         a2.appointment_number, a2.tenant_id, t2.appointment_code_prefix,
         a2.status::text AS appt_status, a2.inspector_id AS appt_inspector_id,   -- L-F05-01: CANT_DO ativo?
         (a2.status = 'REJECTED' AND a2.inspector_id IS NULL AND a2.deleted_at IS NULL) AS cant_do_active
  FROM inspector_field_events fe
  JOIN appointments a2 ON a2.id = fe.appointment_id
  JOIN tenants t2      ON t2.id = a2.tenant_id
  WHERE fe.created_at >= ($1::date - interval '1 day') AND fe.created_at < ($1::date + interval '2 days')
    AND a2.scheduled_date = $1::date
),
reminders AS (                                       -- inspector_notices.dedupe_key @unique; chave com o inspetor ATUAL (L-F03-03)
  SELECT n.dedupe_key, n.created_at FROM inspector_notices n
  WHERE n.dedupe_key = ANY (SELECT $4::text || ':' || id || ':' || $1::text || ':' || inspector_id FROM appts)
),
roster AS (                                          -- D19: plano sem parada viva e sem CANT_DO ATIVO fica fora (L-F05-01)
  SELECT inspector_id FROM appts                     -- o filtro T-1 (L-F05-03) é aplicado depois, em memória
  UNION SELECT inspector_id FROM events WHERE type = 'CANT_DO' AND cant_do_active
)
SELECT i.id, i.name, i.base_lat, i.base_lng, i.alert_overrides_json,
       pl.id AS plan_id, pl.status::text AS plan_status, pl.version, pl.timezone AS plan_tz,
       pl.input_fingerprint, pl.departure_at,
       pl.origin_source::text, pl.origin_lat, pl.origin_lng, pl.origin_override_lat, pl.origin_override_lng,
       pl.approximate,
       CASE WHEN $2::text = 'all' OR ($2::text = 'selected' AND i.id = $3::text)
            THEN pl.route_geometry END AS route_geometry,       -- D18: o traçado só sai do banco quando pedido
       coalesce(pc.planned_count, 0) AS planned_count,
       coalesce((SELECT json_agg(x ORDER BY x.sequence NULLS LAST, x.time_slot_start) FROM appts x WHERE x.inspector_id = i.id), '[]') AS stops,
       coalesce((SELECT json_agg(ev) FROM events ev WHERE ev.inspector_id = i.id), '[]') AS events,
       coalesce((SELECT json_agg(r) FROM reminders r
                 WHERE r.dedupe_key IN (SELECT $4::text || ':' || x.id || ':' || $1::text || ':' || i.id FROM appts x WHERE x.inspector_id = i.id)), '[]') AS reminders
FROM roster ro
JOIN inspectors i ON i.id = ro.inspector_id
LEFT JOIN plans pl ON pl.inspector_id = i.id
LEFT JOIN planned pc ON pc.day_plan_id = pl.id
ORDER BY i.name;
```
- O `origin_label` vem do mesmo campo que a F04 usa em `origin.label`. Se for derivado no use case da F04 (e não gravado), aplicar a mesma função (`formatOriginLabel`) sobre o snapshot.
- Os campos `routing_matrix_json` e `leg_travel_json` **não** são selecionados. O `input_fingerprint` é lido só para a comparação do D17 e nunca vai para a resposta.
- O código do appointment sai de `formatAppointmentCode(appointment_code_prefix, appointment_number)`, nas paradas e nos eventos.
- O `PlatformSetting` (`liveDayAlerts`) é lido por `IPlatformSettingsReader.get` (cache de 30 s, sem SQL na maioria das chamadas).
- O resto (filtro T-1, classificação, impressão digital, projeção, estado, alertas, simplificação) roda em memória no use case.

**§1a · Filtro T-1 (L-F05-03), antes de tudo**
1. Para cada inspetor: `visibleRows = filterT1Visible(appts do inspetor, todayCivil no fuso do inspetor)`, com o predicado puro do `T1VisibilityService` da F04 (o mesmo do `IDayPlanInputReader.loadCandidates`; os campos `flow_type`, `requires_rental_tenant_confirmation`, `key_required` e `confirmation_status` vêm da consulta). `DONE` entra sempre.
2. `visibleRows` é a **única** lista usada daqui para frente: impressão (§1b), projeção (§1c), estado e `progress` (§2), paradas (§3), último ponto (§4), alertas (§5) e "conjunto mudou" (§6.1).
3. Inspetor com `visibleRows = []` e sem `CANT_DO` ativo sai do roster (D19).
4. `planned_count` (§6.1) é comparado com o nº de `visibleRows` com `sequence` — o plano da F04 foi montado com o mesmo filtro, então uma ROUTINE não confirmada de amanhã não conta como "parada que entrou".

**§1b · STALE pela impressão digital (D17)**
1. Para cada inspetor com plano: os candidatos são as `visibleRows` do §1a (o filtro T-1 já foi aplicado, igual ao leitor da F04).
2. Origem resolvida como na F04 (Algoritmo §3): override do dia (`origin_override_lat/lng`) → base (`inspectors.base_lat/lng`) → `NONE`. É a origem configurada mesmo quando o plano gravou `origin_source 'LAST_STOP'` (a impressão da F04 nunca usa `LAST_STOP`, L-F04-07/16).
3. `execState` por parada pela regra D18 (`STARTED` = `DONE` ou iniciada e não abandonada).
4. `fingerprint = computeDayPlanFingerprint({ origin, stops })` (a função **da F04**, sem cópia). Se `fingerprint ≠ input_fingerprint` ou `plan_status = 'STALE'` → `planStatus = 'STALE'`, `routeOutOfDate = true`. Senão, `planStatus` = o gravado e `routeOutOfDate = false`.
5. Nada é gravado. Nenhum recálculo. Nenhuma chamada ao Mapbox. (O AM/OP da F04 se comporta igual: "devolve o gravado; `status = STALE` se a impressão divergir".)
6. Se o `T1VisibilityService` depender de I/O, ele recebe os dados já carregados, ou a F05 usa a função pura que ele expõe. Ver Riscos.

**§1c · Horários restantes (D7)**
- Para cada inspetor com plano **e `date ≥ today`**: `projected = projectStopEta(toEtaPlanInput(plan, planRows), toEtaRealEvents(planRows, lateNotices), now)` (F06-1). `planRows` = `visibleRows` com `sequence` não nulo (L-F05-10). A regra de partida é a da F06 (Algoritmo §A da TASK-F06-1), sem cópia aqui.
- `predictedStartAt` das paradas não iniciadas do plano = `projected.projectedStartAt`. Iniciadas = `startedAt`. Fora do plano (sequence nulo) = início da janela (`zonedWallTimeToUtc(date, time_slot_start, tenant_tz)`). Plano `STALE` também passa pela projeção: os trechos são os gravados, e a tela já marca "Route may be out of date".
- **Dia passado (`date < today`, L-F05-02):** não chama o `projectStopEta` (ele projetaria para o `now` de hoje). `predictedStartAt` das não iniciadas = `published_service_start_at ?? service_start_at ?? window_start_at`; fora do plano, início da janela.
- **Aviso de atraso (L-F03-04):** a F05 nunca soma `minutesLate` a um horário projetado. O piso do `LATE_NOTICE` na projeção é do `projectStopEta` (contrato da F06, alimentado por `toEtaRealEvents`), e o horário que a tela mostra para o aviso é o `estimatedArrivalAt` do alerta (§5).
- A projeção **não** muda o baseline dos alertas. `DELAY` e `NOT_STARTED` comparam com `published_service_start_at ?? service_start_at ?? window_start_at` (o horário de plano), senão uma projeção que empurra para frente esconderia o atraso.

**§2 · Estado do inspetor (D2)**

Para cada parada viva e visível (linha de `visibleRows` do inspetor, §1a), a classificação segue a regra D18 da F04 (`classifyStops`):

| Condição da parada | Classe |
|---|---|
| `status = 'DONE'` (com ou sem execução) | `FINISHED` |
| execução com `finished_at` e sem `abandoned_at` | `FINISHED` |
| execução com `started_at`, sem `finished_at`, sem `abandoned_at` | `IN_PROGRESS` |
| sem execução, ou execução com `abandoned_at` | `NOT_STARTED` |

Com `I` = nº em andamento, `F` = nº finalizadas e `N` = nº não iniciadas, a primeira regra verdadeira vence:
1. `I ≥ 1` → `AT_PROPERTY`
2. `N = 0` → `DONE_FOR_DAY` (inclui `T = 0`, que só chega aqui quando há `CANT_DO` do dia; sem ele o inspetor nem entra no roster, D19)
3. `F = 0` → `NOT_STARTED`
4. senão → `IN_TRANSIT`

**Tabela-verdade (teste 1)**

| # | Paradas (ordem do plano) | I | F | N | Estado |
|---|---|---|---|---|---|
| 1 | A, B, C não iniciadas | 0 | 0 | 3 | `NOT_STARTED` |
| 2 | A em andamento; B, C não iniciadas | 1 | 0 | 2 | `AT_PROPERTY` (01.A4: depois do check-in) |
| 3 | A finalizada; B, C não iniciadas | 0 | 1 | 2 | `IN_TRANSIT` (01.A4: depois do check-out com paradas restantes) |
| 4 | A finalizada; B em andamento; C não iniciada | 1 | 1 | 1 | `AT_PROPERTY` |
| 5 | A, B, C finalizadas | 0 | 3 | 0 | `DONE_FOR_DAY` (01.A4: depois do último check-out) |
| 6 | A, B finalizadas; C em andamento | 1 | 2 | 0 | `AT_PROPERTY` |
| 7 | A `DONE` sem execução (OP); B não iniciada | 0 | 1 | 1 | `IN_TRANSIT` |
| 8 | A com execução abandonada (ainda atribuída); B não iniciada | 0 | 0 | 2 | `NOT_STARTED` |
| 9 | A, B em andamento (esqueceu o check-out de A) | 2 | 0 | 0 | `AT_PROPERTY` |
| 10 | nenhuma parada viva, todas rejeitadas por `CANT_DO` (só entra no roster por causa do `CANT_DO`, D19) | 0 | 0 | 0 | `DONE_FOR_DAY` |
| 11 | B (2ª) finalizada antes de A (1ª), A não iniciada | 0 | 1 | 1 | `IN_TRANSIT` |
| 12 | amanhã, 4 paradas não iniciadas | 0 | 0 | 4 | `NOT_STARTED` |
| 13 | 1 parada só, em andamento | 1 | 0 | 0 | `AT_PROPERTY` |
| 14 | 1 parada só, finalizada | 0 | 1 | 0 | `DONE_FOR_DAY` |

`progress = { done: F, inProgress: I, remaining: N, total: F + I + N }`.

**§3 · Progresso por parada (feitas × atual × restantes)**

As paradas são ordenadas por `sequence` (as do plano primeiro). As fora do plano (`sequence null`, `inPlan false`) vêm depois, por `windowStartAt`.
- `FINISHED` → `DONE`.
- `IN_PROGRESS` → a de **maior** `startedAt` é `CURRENT`; as outras em andamento são `OPEN` (iniciadas e não finalizadas, caso 9).
- `NOT_STARTED` → se não existe `CURRENT`, a **primeira** não iniciada na ordem vira `CURRENT` (a próxima parada); as demais ficam `REMAINING`.
- A UI usa o rótulo "In progress" quando `CURRENT` vem de `IN_PROGRESS` e "Next" quando vem de `NOT_STARTED` (a diferença sai de `startedAt`).

**§4 · Último ponto conhecido (D1)**

Candidatos: os eventos `CHECK_IN` (`started_at`) e `CHECK_OUT` (`finished_at`) de execuções **não abandonadas** das paradas vivas do inspetor no dia.

| # | Situação | `source` | Coordenadas | `at` | `label` |
|---|---|---|---|---|---|
| 1 | evento mais recente é um check-out com `finish_latitude/longitude` | `CHECK_OUT` | fim | `finished_at` | null |
| 2 | evento mais recente é um check-out sem coordenada de fim | `CHECK_OUT` | início da mesma execução | `finished_at` | null |
| 3 | evento mais recente é um check-in | `CHECK_IN` | início | `started_at` | null |
| 4 | empate de instante entre check-out de X e check-in de Y | `CHECK_IN` (Y) | início de Y | `started_at` | null |
| 5 | só execuções abandonadas | – | segue para 6–9 | – | – |
| 6 | sem evento; plano com `origin_source 'BASE'` | `BASE` | `origin_lat/lng` | null | "Base" |
| 7 | sem evento; plano com `origin_source 'OVERRIDE'` | `BASE` | `origin_lat/lng` | null | "Start of day" |
| 8 | sem evento; sem plano ou plano `NONE`; perfil com `base_lat/lng` | `BASE` | `inspectors.base_lat/lng` | null | "Base" |
| 8b | sem evento; plano com `origin_source 'LAST_STOP'` (prefixo só com `DONE` sem execução, L-F04-07) | `BASE` | origem configurada: `origin_override_lat/lng` ("Start of day"), senão `inspectors.base_lat/lng` ("Base"); nunca o `origin_lat/lng` gravado (imóvel da última executada) | null | "Start of day" / "Base" |
| 9 | nada disso | `NONE` | null | null | null |

**§5 · Alertas (01.11, 01.A5)**

`now` é injetável (relógio do use case). Os limites efetivos saem de `resolveEffectiveThresholds(override, platform)`, campo a campo.

| Tipo | Dispara quando | Sai quando (L-F05-01) | Fonte do limite | Valores do alerta |
|---|---|---|---|---|
| `DELAY` (atraso) | `delayMinutes > thresholds.delayMinutes` (estrito) **e** estado ∈ {`AT_PROPERTY`, `IN_TRANSIT`}; em **dia passado**, em qualquer estado com parada iniciada (L-F05-02) | o atraso cai para ≤ limite, ou (hoje/amanhã) o estado vira `DONE_FOR_DAY` | `liveDayAlerts.delayMinutes` (padrão 20) ou override do inspetor | `minutes = delayMinutes`, `thresholdMinutes`, `thresholdSource`, `appointmentId` da última iniciada |
| `NOT_STARTED` (não iniciado, **por parada**) | para **cada** parada viva e visível não iniciada (sem execução ou abandonada): `now > baseline(parada) + thresholds.notStartedMinutes` (estrito, em minutos inteiros), em **qualquer** estado do inspetor. Em **dia passado**: `window_end_at > baseline + limite` (L-F05-02) | a parada é iniciada (check-in) ou deixa de ser parada viva do inspetor (rejeitada, cancelada, reatribuída) | `liveDayAlerts.notStartedMinutes` (padrão 30) ou override | `minutes = floor((now − baseline)/60 s)` — em dia passado `floor((window_end_at − baseline)/60 s)` —, `occurredAt = baseline + limite`, `appointmentId` da parada; 1 alerta por parada |
| `LATE_NOTICE` (aviso de atraso) | existe `LATE_NOTICE` (F03) numa parada viva **não iniciada**; vale o **mais recente** por parada | check-in da parada, ou ela deixa de ser viva | o próprio evento (sem limite) | `minutes = minutesLate` (relativo ao início da janela), `estimatedArrivalAt = computeEstimatedArrivalAt(time_slot_start no fuso da agência, client_occurred_at ?? created_at, minutes)` (L-F03-04), `reason`, `reasonLabel` |
| `CANT_DO` ("Não consigo fazer") | existe `CANT_DO` (F03) do inspetor para um appointment da data, que **continua** `REJECTED` e sem `inspector_id` (`cant_do_active`) | o appointment é reofertado/cancelado (`status ≠ REJECTED`) ou reatribuído (`inspector_id` preenchido) — sinal de que a OP tratou —, ou a data muda | o próprio evento | `reason`, `reasonLabel`, `note`, `appointmentCode`; 1 alerta por evento |
| `GEOFENCE` (flag de geofence) | execução não abandonada de parada viva com `out_of_radius` (`phase 'START'`) e/ou `finish_out_of_radius` (`phase 'FINISH'`) | `START`: a parada fica `FINISHED` (check-out ou `DONE`). `FINISH`: só com a troca de data (nasce no check-out) | `PlatformSetting.fieldEvents.geofenceRadiusMeters` (F03, aplicado na escrita; snapshot `geofence_radius_m`, nulo só pré-F03, L-F03-05) | `phase`, `distanceMeters`, `radiusMeters` (null só pré-F03); 1 alerta por fase |
| `OUT_OF_WINDOW` (fora da janela) | execução não abandonada de parada viva com `out_of_window = true` (flag da F03, gravada no check-in). Só a flag decide: a F05 não recalcula pela hora, e a flag vem `false` quando a F03 pulou a avaliação (`windowSkipped`, L-F03-06) | a parada fica `FINISHED` | `PlatformSetting.fieldEvents.checkInWindowToleranceMinutes` (F03, padrão 15, aplicado na escrita) | `occurredAt = started_at`; `minutes` = distância do check-in à borda mais próxima de `time_slot_start/end` no fuso da agência (L-F05-11); `thresholdMinutes` = tolerância atual **se** `minutes >` ela, senão `null`; `thresholdSource 'PLATFORM'` ou `null` junto; 1 por execução |
| `COMPLETION_REMINDER` (lembrete de conclusão disparado) | existe `inspector_notices.dedupe_key = '{COMPLETION_REMINDER_DEDUPE_PREFIX}:{appointmentId}:{date}:{inspectorId atual}'` (L-F03-03) e a parada **não** está `FINISHED` | a parada fica `FINISHED` | `PlatformSetting.fieldEvents.completionReminderMinutesAfterWindowEnd` (F03, aplicado pelo job) | `occurredAt = notice.created_at`, `appointmentId` |

- `baseline(parada)` = `published_service_start_at ?? service_start_at ?? window_start_at`. Fora do plano: `zonedWallTimeToUtc(date, time_slot_start, tenant_tz)`. É o horário **de plano**, não o projetado (§1c).
- **Sem reconhecimento (L-F05-01):** nenhuma ação da OP "dispensa" um alerta; ele só sai pelas regras da coluna "Sai quando". "Reconhecer/dispensar alerta" está em "Fora do escopo".
- **Dia passado (L-F05-02):** `date < today` → `effectiveNow` por parada = `window_end_at` para o `NOT_STARTED`; `DELAY` sem a supressão por `DONE_FOR_DAY`. Os alertas de evento/flag seguem as mesmas regras de saída.

**Tabela-verdade do `NOT_STARTED` por parada** (limite 30 min; teste 5)

| # | Paradas e eventos | `now` | Alertas `NOT_STARTED` |
|---|---|---|---|
| 1 | A prevista 08:00, sem início | 08:30 | nenhum (igual ao limite) |
| 2 | idem | 08:31 | A (31 min) |
| 3 | A iniciada 08:40 | 09:00 | nenhum (vira `DELAY` se passar do limite de atraso) |
| 4 | A finalizada 09:00; B prevista 10:00, sem início | 14:00 | **B (240 min)**, com o inspetor em `IN_TRANSIT` |
| 5 | A em andamento desde 09:00; B prevista 10:00 | 10:31 | B (31 min), com o inspetor em `AT_PROPERTY` |
| 6 | B prevista 10:00, C prevista 11:00, as duas sem início | 11:31 | B (91 min) e C (31 min) |
| 7 | A prevista 08:00, execução abandonada às 08:20 | 08:31 | A (31 min) |
| 8 | fora do plano, janela 13:00 | 13:31 | a parada (31 min) |
| 9 | amanhã, A prevista 08:00 | hoje 15:00 | nenhum |
| 10 | todas finalizadas | qualquer | nenhum |
| 11 | **ontem**, A prevista 10:00, janela até 17:00, sem início (L-F05-02) | hoje 10:00 | A (**420 min**, até o fim da janela) |
| 12 | amanhã, ROUTINE não confirmada (invisível pelo T-1, L-F05-03) | hoje 15:00 | nenhum (a parada nem entra) |
- **Atraso acumulado** = `floor((started_at − baseline)/60 s)`, com baseline `published_service_start_at ?? service_start_at ?? window_start_at` da parada de **maior** `started_at` (não abandonada). Pode ser negativo, e a UI mostra "On time" quando ≤ 0. É `null` sem parada iniciada. É o "início real − previsto da última parada" do plano.
- Ordem da lista: `CANT_DO, COMPLETION_REMINDER, NOT_STARTED, DELAY, LATE_NOTICE, GEOFENCE, OUT_OF_WINDOW` (`LIVE_DAY_ALERT_TYPE_ORDER`) e, dentro do tipo, `occurredAt` desc. `needsAttention = alerts.length > 0`.
- O critério 01.A5 nomeia 5 tipos. A F05 cobre 7: os 5, o lembrete de conclusão (lista do 01.11 no plano) e o `OUT_OF_WINDOW` (plano F03: flags vão para a lista de exceções). Ver Achado 3.
- Plano inviável (`day_plans.feasible false`) **não** é alerta: sai em `routeFeasible`/`routeViolations` da linha do inspetor (D20, L-F04-05, decisão do dev de 2026-10-29).

**§6 · Traçado e fallback (D8)**
0. Só para os inspetores pedidos em `includeGeometry` (D18). Os demais saem com `geometryIncluded false` e `geometry null` (`routeApproximate` continua calculado, porque a lista mostra o chip).
1. `routeOutOfDate` = `planStatus = 'STALE'` (§1b). O **conjunto de paradas mudou** quando existe parada viva **e visível pelo T-1** (§1a) com `plan_id` e `sequence null` (fora do plano) ou `planned_count ≠ nº de paradas vivas visíveis com sequence` (alguma saiu).
2. Se o plano existe, `route_geometry` não é nulo **e** o conjunto de paradas não mudou: `geometry = simplifyRouteGeometry(route_geometry)`, via cache LRU `dayPlanId:version` (L-F05-07) (Douglas–Peucker, tolerância `1e-4°` ≈ 11 m, coordenadas com 5 casas, `properties` preservadas) e `routeApproximate = plan.approximate`.
3. Senão: `geometry = buildRouteFallback(origin, stops)`. É uma única Feature `LineString` reta: origem (se houver; com `origin_source 'LAST_STOP'` não há, L-F04-07) → paradas com coordenada na ordem do §3, com `properties { fromSequence: 0, toSequence: <última>, approximate: true }`. `routeApproximate = true`. Com menos de 2 pontos, `geometry = null`.
4. A validação do shape é o próprio `dayPlanGeometrySchema` (reuso exato).

**§7 · Consulta do `locked-time` (01.13, uma instrução SQL)**
```sql
WITH base AS (
  SELECT a.id, a.tenant_id, t.name AS agency_name, a.property_id, a.service_group_id,
         (a.status <> 'REJECTED' AND a.rental_tenant_confirmation_status = 'CONFIRMED') AS confirmed
  FROM appointments a
  JOIN service_types st ON st.id = a.service_type_id
  JOIN tenants t ON t.id = a.tenant_id
  WHERE a.scheduled_date BETWEEN $1::date AND $2::date           -- appointments (scheduled_date, inspector_id)
    AND a.deleted_at IS NULL
    AND ( a.status IN ('AWAITING_INSPECTOR', 'SCHEDULED', 'DONE')
          OR (a.status = 'REJECTED' AND a.rejection_reason_code IN ('TENANT_NO_RESPONSE', 'TENANT_DECLINED')) )  -- D21
    AND st.flow_type = 'ROUTINE'
    AND st.requires_rental_tenant_confirmation = true
    AND a.key_required = false
),
regioned AS (
  SELECT b.*, coalesce(gr.id, geo.id) AS region_id, coalesce(gr.name, geo.name) AS region_name,
         rt.name AS region_agency_name                                   -- L-F05-13: dono da região (null = global)
  FROM base b
  LEFT JOIN service_groups sg ON sg.id = b.service_group_id
  LEFT JOIN service_regions gr ON gr.id = sg.service_region_id          -- 1º: região do grupo
  LEFT JOIN LATERAL (                                                    -- 2º: ST_Intersects, menor region_number
    SELECT sr.id, sr.name, sr.tenant_id FROM service_regions sr
    JOIN properties p ON p.id = b.property_id
    WHERE gr.id IS NULL AND sr.status = 'ACTIVE' AND sr.geom IS NOT NULL
      AND p.coordinates IS NOT NULL AND p.deleted_at IS NULL
      AND (sr.tenant_id = b.tenant_id OR sr.tenant_id IS NULL)
      AND ST_Intersects(sr.geom, p.coordinates)
    ORDER BY sr.region_number ASC LIMIT 1
  ) geo ON true
  LEFT JOIN tenants rt ON rt.id = coalesce(gr.tenant_id, geo.tenant_id)
)
SELECT 'AGENCY' AS dim, tenant_id::text AS key, agency_name AS label, NULL::text AS region_agency_name,
       count(*) FILTER (WHERE confirmed)::int AS confirmed, count(*)::int AS required
FROM regioned GROUP BY tenant_id, agency_name
UNION ALL
SELECT 'REGION', region_id::text, region_name, region_agency_name, count(*) FILTER (WHERE confirmed)::int, count(*)::int
FROM regioned GROUP BY region_id, region_name, region_agency_name;
```
- **Fórmula (D21):**
  - `E` (exige confirmação) = appointments não deletados, com `scheduled_date` no período, `service_types.flow_type = 'ROUTINE'`, `service_types.requires_rental_tenant_confirmation = true` e `appointments.key_required = false` (definição da F04, regra do T-1);
  - **denominador** = `|{ a ∈ E : a.status ∈ {AWAITING_INSPECTOR, SCHEDULED, DONE} } ∪ { a ∈ E : a.status = REJECTED ∧ a.rejection_reason_code ∈ {TENANT_NO_RESPONSE, TENANT_DECLINED} }|`;
  - **numerador** = `|{ a ∈ denominador : a.status ≠ REJECTED ∧ a.rental_tenant_confirmation_status = CONFIRMED }|`;
  - **% travado** = `round(numerador ÷ denominador × 100, 1)`; denominador 0 → `null`.
- Fora do denominador: `DRAFT` (não liberado), `CANCELLED`, deletados e `REJECTED` por qualquer outro código (ex.: `INSPECTOR_UNABLE`, rejeição da OP). Os rejeitados pelo inquilino entram como **não travados**: são o que o corte T-1 tirou do dia, e sem eles os dias passados e o D+1 depois das 19:00 marcariam ~100%.
- `overall` = soma das linhas `AGENCY`. `percent = round(confirmed / required × 100, 1)`; `required = 0` → `null`.
- A região do grupo vale mesmo se a região estiver `INACTIVE` (é a do grupo). A região por `ST_Intersects` só considera regiões `ACTIVE`.

#### Paleta (shared, usada pela TASK-F05-2)

`INSPECTOR_ROUTE_PALETTE` tem 12 tons escuros. Cada um tem contraste ≥ 4.5:1 contra `#FFFFFF` e contra `#F2EFE9` (fundo claro do mapa). Isso passa do mínimo de 3:1 da WCAG 1.4.11 para gráficos e é AA também para texto, porque a bolinha da lista fica ao lado do nome.

Ordem dos índices (L-F05-12, 2026-10-29): intercalada para que índices vizinhos alternem família de matiz (quente/fria) e luminosidade. Os pares que colapsam em protanopia/deuteranopia (0°/25°/45°, 90°/145°/175°, 250°/275°/305°) nunca ficam lado a lado. L\* (CIELAB) calculado a partir do `hex`.

| # | `mapbox` (HSL com vírgula) | `hex` | contraste × branco | × `#F2EFE9` | L\* |
|---|---|---|---|---|---|
| 0 | `hsl(45, 90%, 26%)` | `#7E6007` | 5.89 | 5.14 | 42.5 |
| 1 | `hsl(250, 55%, 45%)` | `#4934B2` | 8.69 | 7.57 | 32.0 |
| 2 | `hsl(25, 85%, 32%)` | `#97460C` | 6.57 | 5.72 | 39.6 |
| 3 | `hsl(275, 55%, 40%)` | `#6F2E9E` | 8.20 | 7.15 | 33.6 |
| 4 | `hsl(200, 85%, 30%)` | `#0B628E` | 6.66 | 5.81 | 39.2 |
| 5 | `hsl(305, 55%, 35%)` | `#8A2882` | 7.76 | 6.76 | 35.1 |
| 6 | `hsl(90, 60%, 25%)` | `#406619` | 6.70 | 5.84 | 39.0 |
| 7 | `hsl(330, 70%, 36%)` | `#9C1C5C` | 7.68 | 6.69 | 35.3 |
| 8 | `hsl(175, 80%, 22%)` | `#0B655E` | 6.92 | 6.03 | 38.2 |
| 9 | `hsl(220, 75%, 40%)` | `#194CB3` | 7.63 | 6.64 | 35.3 |
| 10 | `hsl(145, 65%, 24%)` | `#156537` | 7.12 | 6.21 | 37.4 |
| 11 | `hsl(0, 70%, 38%)` | `#A51D1D` | 7.52 | 6.55 | 35.9 |

- A faixa de L\* que passa no AA é estreita (32–42.5): luminosidade sozinha não separa rotas. A diferenciação entre rotas no modo "Show all routes" é o **nome no hover** do traçado (`RouteLayer`, TASK-F05-2), o clique (seleciona e destaca) e a legenda textual. Registrado como limitação aceita (L-F05-12).

```ts
// FNV-1a 32 bits sobre o inspectorId (string), estável entre sessões, navegadores e deploys
export function inspectorRouteColorIndex(inspectorId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < inspectorId.length; i++) { h ^= inspectorId.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % INSPECTOR_ROUTE_PALETTE.length;
}
export function inspectorRouteColor(inspectorId: string): { mapbox: string; hex: string; index: number }
```
- O `mapbox` (HSL com vírgula) é usado em **paint** do Mapbox. O `hex` é usado no CSS (bolinha, borda do pin, legenda). Nunca `hsl(a b c)` com espaço (lição do #1302).
- Colisão é possível (2 inspetores com a mesma cor; inevitável acima de 12). Fica aceita: o nome está sempre ao lado da cor na lista e na legenda (Achado 4).

### Casos de borda

1. **Inspetor sem plano** com appointments `SCHEDULED/DONE` no dia (atribuído depois das 19:30 e o app ainda não foi aberto; ou F04 indisponível). Aparece (decidido na revisão de 2026-10-28) com `planStatus 'NONE'`, paradas `inPlan false` ordenadas pela janela, previsto = início da janela e fallback reto.
2. **Plano sem paradas vivas** (todas reatribuídas, canceladas ou rejeitadas): sem `CANT_DO` do dia, o inspetor **fica fora** da lista (D19, nada de "0 of 0" para ocioso). Com `CANT_DO` do dia, entra com `stops []`, `DONE_FOR_DAY`, `progress 0/0` e o alerta (linha 10 da tabela-verdade).
3. **Appointment reofertado** depois de `CANT_DO` e aceito por outro inspetor no mesmo dia: o `CANT_DO` **sai** do inspetor original assim que o appointment deixa de estar `REJECTED` sem inspetor (L-F05-01), e a parada aparece no novo inspetor. Se o original não tem mais paradas visíveis, ele sai do roster (D19).
4. **Duas paradas em andamento** (check-out esquecido): `CURRENT` = a de maior `startedAt`, a outra fica `OPEN`. O estado é `AT_PROPERTY`. O alerta `COMPLETION_REMINDER` da F03 tende a aparecer na `OPEN`.
5. **Check-in fora de ordem** (parada 3 antes da 2): a ordem exibida continua a gravada até a F04 recalcular. `CURRENT` = a 3. A 2 continua `REMAINING` (não vira `CURRENT`, porque já existe uma).
6. **Execução abandonada** (F03 D13): conta como não iniciada em tudo (estado, progresso, último ponto, atraso). As flags dela não geram `GEOFENCE`.
7. **`DONE` marcado pela OP sem execução:** `DONE`, sem horário real (UI: "Done (no check-in)"), não entra no último ponto nem no atraso.
8. **Check-out sem coordenada de fim:** usa a coordenada de início da mesma execução (§4, linha 2).
9. **Imóvel sem coordenada:** `missingCoordinates true`, sem pin de parada, fora do fallback reto. A parada continua na lista e no progresso.
10. **Dia passado (L-F05-02):** o traçado foi expurgado (03:45 do dia seguinte, F04) → fallback reto + "Approximate route". **Sem projeção**: `predictedStartAt` = horário de plano (nunca um ETA de hoje). `NOT_STARTED` mede até `window_end_at` (ex.: "420 min", não "4 320 min"); `DELAY` aparece mesmo em `DONE_FOR_DAY`. Alertas de evento/flag seguem as regras de saída (um `CANT_DO` de ontem tratado não aparece).
11. **Amanhã:** plano `DRAFT` (a OP recalculou antes das 19:30) ou `PUBLISHED`. Todos `NOT_STARTED`. Nenhum alerta de tempo dispara (`now` antes do previsto). `CANT_DO`/`LATE_NOTICE` exigem data ≤ hoje (F03), então não existem. As ROUTINE não confirmadas antes do corte das 19:00 **não aparecem** (filtro T-1, L-F05-03), então o plano não é marcado como "conjunto mudou" por causa delas.
11b. **Hoje com ROUTINE não confirmada remarcada para amanhã:** some da visão de hoje (não é mais da data) e não aparece na de amanhã até confirmar (T-1).
11c. **Roster acima de 60 com `includeGeometry=all`** (cliente antigo ou URL manual): 400 `LIVE_DAY_TOO_MANY_ROUTES`; `none`/`selected` continuam sem teto (L-F05-06).
11d. **Escritório atrás de NAT** com muitas abas: o limite de 120/min é por usuário; o global de 200/min por IP comporta ~60 abas do Live Day (2 req/min cada) somadas às outras chamadas. Se apertar, a chave por usuário já está pronta e o ajuste é só no global (L-F05-07).
11e. **`OUT_OF_WINDOW` com tolerância alterada** depois do check-in: `minutes` ≤ tolerância atual → o alerta sai sem `thresholdMinutes` (a copy não mostra uma tolerância que não disparou a flag). Limitação conhecida: a F03 não grava a tolerância do momento (L-F05-11).
12. **Agências em fusos diferentes** (Perth e Sydney no mesmo dia): instantes comparados em UTC; janela e horários formatados no fuso da parada; "hoje" é do ator. Um ator em Sydney às 00:30 vê "hoje" = novo dia, enquanto Perth ainda está na véspera. Aceito, porque é o mesmo critério do Workload.
13. **Evento perto da meia-noite UTC:** a janela `created_at ∈ [date − 1 dia, date + 2 dias)` + `a2.scheduled_date = date` garante o recorte certo sem depender do fuso.
14. **`alert_overrides_json` corrompido:** padrões + `logger.warn` (sem 500).
15. **`PlatformSetting` inválido no banco:** o leitor da F03 devolve os defaults e loga erro. A tela continua.
16. **Inspetor `INACTIVE` ou deletado** com appointments vivos no dia (desativação com aberto exige AM/OP): aparece normalmente (o trabalho existe). `GET/PUT alert-thresholds` de inspetor deletado → 404.
17. **Plano `STALE` (gravado ou pela impressão) com o mesmo conjunto de paradas:** usa o traçado gravado + `routeOutOfDate true` (a UI mostra "Route may be out of date"). Edições que não emitem evento caem aqui pela impressão (D17).
18. **Payload:** por padrão o poll não leva traçado (`includeGeometry=none`). Com `all`, a simplificação (§6) e o arredondamento mantêm 30 × 6 paradas abaixo de 400 KB (teste 15b).
18b. **`inspectorId` de `selected` sem trabalho na data:** 200, nenhuma geometria; o web limpa a seleção.
18c. **Muitos `NOT_STARTED`** num dia ruim (1 por parada atrasada): a lista de alertas do inspetor pode crescer; a linha da lista mostra só a contagem por tipo ("3 not started"), e o detalhe lista todos.
19. **Região do grupo × imóvel em outra região:** vale a do grupo (decisão do plano: "região do grupo, senão `ST_Intersects`").
20. **Imóvel sem `coordinates`** e sem grupo → "No region".
21. **Período do locked-time no passado** (`from` < hoje): permitido. Com o D21, os cortados pelo T-1 contam como não travados, então o número fica próximo do que era antes do corte. Os confirmados depois rejeitados por outro motivo saem dos dois lados.
22. **Plano com origem `LAST_STOP`** (recalculado hoje depois do 1º check-in, L-F04-07): `origin null` (sem pin de origem separado; o trecho gravado começa na última executada). A impressão usa a origem configurada, então o recálculo da F04 não vira STALE falso na F05. Se o prefixo for só de `DONE` sem execução, o último ponto cai na origem configurada (§4, linha 8b).
23. **Appointment `DONE → DRAFT` pelo AM** mantendo `inspector_id` (L-F04-04): some das paradas (join com status); o `planned_count` bruto marca "conjunto mudou" → STALE + fallback reto.
24. **Sincronização tardia com horário implausível** (L-F03-06): check-in fora da janela com `out_of_window false` → nenhum `OUT_OF_WINDOW`. Nunca penalizar sem evidência.
25. **Lembrete enviado ao inspetor anterior** e appointment reatribuído (L-F03-03): a chave tem o `inspectorId` antigo e não casa com o novo; o novo só recebe alerta quando o job da F03 publicar o lembrete dele.
26. **Execução anterior à F03** (`geofence_radius_m NULL`, L-F03-05): flags pré-F03 não existem na prática; se aparecerem, `radiusMeters null` e a copy sem limite.
27. **Aviso de atraso depois do fim da janela:** `estimatedArrivalAt = created_at + minutes` (a referência é o maior entre início da janela e o instante do aviso, L-F03-04); a tela mostra esse horário, não `predictedStartAt + minutes`.

### Fora do escopo

- GPS, ping de localização, WebSocket/SSE.
- Notificação ativa para a OP a cada alerta (a tela e o e-mail do `CANT_DO` da F03 bastam).
- Reconhecer/dispensar alerta (servidor ou cliente). Os alertas saem só pelas regras do §5 (L-F05-01).
- Cluster de pins de inspetor (L-F05-06).
- Snapshot da tolerância de janela na execução (seria mudança na F03; L-F05-11).
- Visão para agências.
- Relatório/histórico de dias (o seletor de data só consulta).
- Recalcular o plano na leitura (nunca Mapbox na leitura). O botão de recalcular da F04 não entra nesta tela.
- Snapshot histórico do "Locked time" "antes do corte".
- Qualquer mudança em `dashboard.routes.ts`, `prisma-dashboard-analytics.repository.ts`, `confirmationRate` ou nos endpoints da F04.

### Critérios de aceite

- **01.A4 (estado derivado):** depois do check-in, o estado do inspetor é `AT_PROPERTY`; depois do check-out, é `IN_TRANSIT` (restam paradas) ou `DONE_FOR_DAY` (não restam). Provas: tabela-verdade (teste 1, linhas 2, 3, 5) e o teste HTTP **13b** (`POST …/start` → `GET /v1/dashboard/live-day` → `POST …/finish` → `GET`, com as rotas reais).
- **01.A5 (alertas por limite):** cada um dos 7 tipos dispara conforme o limite ou o evento configurado (testes 5 e 23). `DELAY` e `NOT_STARTED` (por parada) respeitam o padrão da plataforma e o override por inspetor, com comparação estrita. `GEOFENCE` e `OUT_OF_WINDOW` seguem o raio e a tolerância da F03 aplicados na escrita. `LATE_NOTICE`, `CANT_DO` e `COMPLETION_REMINDER` disparam com o evento e seguem as regras de vigência da tabela §5.
- `GET /v1/dashboard/live-day` faz **1** consulta SQL e **0** chamadas externas em qualquer `includeGeometry` (testes 15, 16). O corpo respeita os tetos do teste 15b.
- `planStatus 'STALE'` aparece depois de edição sem evento (teste 19) e depois de um check-in (13b), sem recalcular.
- O 01.13 segue a fórmula exata do D21 (teste 21), por agência e por região (grupo, senão `ST_Intersects` com o menor `region_number`), com `agencyName` em `byRegion`.
- AM/OP só, em todas as rotas (testes 24–26).
- Cada alerta sai conforme a coluna "Sai quando" do §5; o `CANT_DO` sai quando o appointment é reofertado/reatribuído (testes 5 e 14) (L-F05-01).
- Em dia passado não há ETA de hoje e o `NOT_STARTED` mede até o fim da janela (testes 5, 9c, 13) (L-F05-02).
- Paradas, `progress`, alertas e "conjunto mudou" usam o mesmo filtro T-1 da F04 (testes 9d e 13) (L-F05-03).
- p95 ≤ 300 ms (`none`, 50 inspetores) e ≤ 800 ms (`all`); `all` com roster > 60 → 400; log `live_day.read` sem coordenadas; rate limit por usuário (testes 10, 15, 15b, 24) (L-F05-06, L-F05-07).

### Dependências

- **TASK-F04-2** mergeada: tabelas `day_plans`/`day_plan_stops` com `published_service_start_at` e `input_fingerprint`, `DayPlanOriginSource.LAST_STOP`, `dayPlanGeometrySchema`, `classifyStops` (`domain/classify-stops.ts`), `computeDayPlanFingerprint` (`domain/day-plan-fingerprint.ts`) e `T1VisibilityService`.
- **TASK-F06-1** mergeada: `projectStopEta` (e tipos `EtaPlanInput`, `EtaPlanStop`, `EtaRealEvents`, `ProjectedStop`) exportado de `packages/shared/src/route-planning/`.
- **TASK-F03-1** (`PlatformSetting`, flags) e **TASK-F03-2** (`inspector_field_events` com `client_occurred_at`, `abandoned_at`, job do lembrete com `dedupeKey` por inspetor, `COMPLETION_REMINDER_DEDUPE_PREFIX` no shared, `computeEstimatedArrivalAt`).
- **F01-1** (`base_lat/lng`).
- **F02-1** (`inspector_notices.dedupe_key`).
- Ordem das migrations: depois das de X02/F01/F02/F03/F04.

### Riscos e armadilhas

- **Funções da F04:** `classifyStops` e `computeDayPlanFingerprint` já são exportadas puras de `modules/day-plan/domain/` (contrato §2 da F04, L-F04-16). A F05 só importa; se a assinatura mudar no merge da TASK-F04-2, o typecheck e os testes 9b/2 quebram em vez de a regra divergir.
- **Prefixo do lembrete:** literal `'completion-reminder:'` no SQL deixaria de casar se a F03 mudar o formato. Usar só `COMPLETION_REMINDER_DEDUPE_PREFIX` como parâmetro (L-F03-03).
- **Impressão digital fora de sincronia com a F04:** a F05 não pode reimplementar a impressão. Usar a função da F04 e o mesmo filtro do T-1. O teste 9b roda contra a função real, então uma mudança na F04 quebra o teste da F05 em vez de produzir STALE falso. Se o `T1VisibilityService` não for puro, expor (no PR da F05) a função pura que ele usa, sem mudar o comportamento.
- **Caminho do `projectStopEta`:** `packages/shared/src/route-planning/project-stop-eta.ts` (decisão de 2026-10-28, já refletida no `F06-tarefas.md`). O import da F05 segue o caminho que a F06-1 efetivamente exportar (Achado 2).
- **Custo da impressão em memória:** sha256 de ~30 planos por poll (< 1 ms cada). Sem cache. A simplificação do traçado, essa sim, tem cache LRU por `dayPlanId:version` (L-F05-07); a memória fica limitada a 500 entradas simplificadas (~40 KB cada no pior caso).
- **Rate limit por usuário antes da auth:** um `keyGenerator` que lê `req.user` num hook `onRequest` recebe `undefined` e cai no IP sem erro. O teste 24 (dois usuários, mesmo IP) pega isso.
- **Predicado puro do T-1:** o filtro agora é usado em tudo (L-F05-03). Se o `T1VisibilityService` não expuser um predicado puro, extrair no PR da F05, sem mudar o comportamento da F04.
- **Serializer joga exceção** com campo `undefined` num schema sem `.nullable()`. Todo campo nulo está declarado e o teste 24 cobre os vazios.
- **Strip de campos não declarados:** se um campo novo for esquecido no schema shared, ele some sem erro. O teste 24 confere as chaves do corpo contra o schema.
- **`$queryRaw` e tipos:** `count(*)` vem como `bigint` (usar `::int`); `Decimal` vem como string (converter); `json_agg` traz `snake_case` (mapear no repositório).
- **Índices `Unsupported()`:** o `migrate dev` pode tentar dropar o GIST de `service_regions`. Revisar o SQL gerado antes de commitar.
- **Wirings de teste não tipados** do container do inspetor quebram com as deps novas: grep em `tests/` e nos `*.test.ts` de rotas.
- **Testcontainers em série:** a suíte de integração nova roda com `--no-file-parallelism`, junto das outras.
- **Fuso da data:** nunca usar `new Date().toISOString().slice(0,10)`. Sempre `civilDateInTimezone`.

### Deploy / rollout / rollback

- **Deploy:** 1 migration expand (`alert_overrides_json`, coluna nula, sem backfill), primeiro em staging, depois em prod (padrão expand/contract). A chave `liveDayAlerts` não precisa de seed: o registro tem defaults, e a linha só nasce no 1º `PUT`.
- **Rollout:** sem flag. Os endpoints só são consumidos pelo web da TASK-F05-2. Smoke em staging com AM: `GET /v1/dashboard/live-day` (hoje e ontem, com `includeGeometry` `none`, `selected` e `all`, anotando o tamanho do corpo), `GET /v1/dashboard/locked-time` e `PUT` + `GET` de `alert-thresholds`. Conferir os logs: nenhuma chamada Mapbox por requisição; linhas `live_day.read` com `durationMs`/`bodyBytes` e **sem** coordenadas; anotar o p95 observado em staging contra o orçamento (300/800 ms). Depois do deploy em prod, acompanhar `live_day.read` por 1 semana para saber quantas abas ficam abertas (contagem por `user.id`).
- **Rollback:** reverter o PR. A coluna nova fica (expand/contract; sem leitor ela é inofensiva). Nenhum dado de outra feature é escrito, exceto `alert_overrides_json` e o audit.

### Dias · Branch · Verificação

- **Dias:** 5,25 = plano 3,0 (API 1,75 + derivação dos alertas 0,25 + locked-time 0,5 + limites 0,5) + revisão 1,0 (STALE pela impressão 0,25 + adaptador do `projectStopEta` 0,25 + `includeGeometry` e teste de tamanho 0,25 + teste HTTP do 01.A4 0,25) + lacunas 1,25 (saída dos alertas e roster com `CANT_DO` ativo 0,25, L-F05-01; dias passados 0,25, L-F05-02; T-1 em tudo 0,25, L-F05-03; teto de rotas, orçamento, log, `keyGenerator` e cache 0,5, L-F05-06/07). L-F05-05, -10, -11, -12 e -13 entram sem dia extra. A reconciliação de 2026-10-29 (L-F03-03/04/05/06, L-F04-04/07/14/16) também entra sem dia extra.
- **Branch:** `feat/f05-live-day-api` a partir de `develop`, em worktree. ~45 arquivos (abaixo de 150).
- **Verificação:** `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; suíte de integração com banco (testes 13–23, incluindo 13b, 15 com p95 e 15b com 100 inspetores), via subagente; `pnpm --filter backend generate:openapi` + `pnpm --filter @properfy/shared generate:types` sem diff pendente em `packages/shared/src/api-types.ts`; `git diff --stat origin/develop... | tail -1` < 150.

---

## TASK-F05-2 · Web: página "Live Day" (mapa, lista, seletor de data, polling, rotas com cor por inspetor, "Needs attention", rodapé "Route ETA accuracy")

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F05-1, TASK-X01-1
> - **Desbloqueia:** TASK-F05-3
> - **Pode rodar em paralelo com:** TASK-F08-1, TASK-F04-3b, TASK-F08-2, TASK-F08-3
> - **Pista sugerida (time de 6):** E · Full-stack / QA

### Objetivo

Criar a tela `/live-day` (AM/OP) com o dia acontecendo, cobrindo 01.8, 01.9, 01.11 e a frase "rotas em tempo real" da entrega D:
- um pin por inspetor no último ponto conhecido (cor e ícone = estado);
- lista lateral com progresso, atraso e alertas;
- clicar num inspetor mostra as paradas do dia (feitas/atual/restantes, com link para cada appointment), desenha a rota dele e enquadra a câmera;
- "Show all routes" desenha as rotas de todos os inspetores, cada uma na cor do inspetor;
- filtro "Needs attention";
- seletor de data;
- polling de 30 s;
- rodapé "Route ETA accuracy" (F04).

### Contexto no código

- **Mapa web:**
  - `apps/web/src/components/map/MapScreenLayout.tsx`: painel flutuante redimensionável sobre o mapa; props `sidePanel`, `map`, `sidePanelOpen`, `fillParent`. A largura usa `useResizableWidth({ initialPx: 420, minPx: 360, maxPx: 720, storageKey: 'appointments-map.filter-panel.width' })` com a chave **fixa** (sem prop), e o painel é um card `fixed left-4 top-4 … md:left-[91px]` sobreposto ao mapa em **qualquer** largura: **não há empilhamento no mobile** (verificado no snapshot; L-F05-04).
  - `MapContainer.tsx`: `mapbox://styles/mapbox/streets-v12`; `onMapReady(map)`; `useMapInstance().getMap()`; estado "Mapbox token not configured"; os filhos só montam depois do `load`.
  - `MapMarker.tsx`: portal em nó destacado (bug de reconciliação); variantes círculo (`color`) e teardrop (`icon`, cabeça `#1A1A1A`); `label` = `aria-label`; `active`; `offset`; `PIN_COLLISION_DIAMETER_PX = 36`.
  - `index.ts` exporta `MapContainer`, `useMapInstance`, `MapMarker`, `MapScreenLayout`, `MapFloatingAction`, `MapLassoToggleButton`.
  - **Não há camada de linha no web.**
- **Padrão a portar:** `apps/pwa/src/features/offers/hooks/useOfferRoute.ts`, com `addSource`/`addLayer` idempotentes, `setData`, `hslTripletToMapboxColor` (HSL com vírgula; lição do #1302), linha com `line-cap/join round`, menos de 2 pontos → coleção vazia e re-add depois de recriar o mapa. A TASK-F04-4 generaliza esses hooks em `apps/pwa/src/lib/map/`. **O web não importa do PWA:** o `RouteLayer` é um componente web novo com o mesmo padrão.
- **Deslocamento de pins sobrepostos:** `computeMarkerOffsets` hoje é exportado de `apps/web/src/features/appointments/pages/AppointmentMapPage.tsx:298`. Importar de uma página puxaria o chunk dela, então a função vai para `components/map/marker-offsets.ts`, e o `AppointmentMapPage` só troca o import (sem mudar comportamento, sem crescer o arquivo).
- **Router:** `apps/web/src/app/router.tsx`, com `Loadable(lazyRetry(...))` (`:39`) e `AuthGuard roles={[UserRole.AM, UserRole.OP]}` (precedente `inspector-workload`, `:170`).
- **Menu (X01):** `components/shell/Sidebar.tsx`, `NAV_ITEMS`, item "Dashboard" com `submenu` (Overview, Analytics, Workload) e `collapseIfSingle`; testes `Sidebar.roles.test.tsx` e `Sidebar.test.tsx`. O X01 diz: "F05 (Live Day) … acrescentam filhos AM/OP neste `submenu`". Depois do X01, `NAV_ITEMS` e `filterNavItems(items, role, clUserPermissions?)` são exportados, o `Sidebar.roles.test.tsx` renderiza o `SidebarSubmenu`/`SidebarItem` reais (sem mocks; flyout com `aria-haspopup="menu"` e `menuitem`s) com `MemoryRouter`, e a ordem canônica dos filhos é Overview · **Live Day** · Inspector notices · Analytics · Workload · Inspector performance · Goals & rewards (L-X01-02/03).
- **Polling:** o web ainda não usa intervalo fixo. O precedente é o PWA, `useMarketplaceOffers.ts:33-34` (`refetchInterval: 60_000`, `refetchIntervalInBackground: false`). Precedente de hook de dashboard: `features/inspector-workload/hooks/useInspectorWorkload.ts` (`api.GET('/v1/dashboard/inspector-workload', …)`).
- **Primitivos:** `components/forms/DateInput.tsx`, `components/feedback/EmptyState.tsx`, `components/ui/Tooltip.tsx`, `StatusChip.tsx`, `Button.tsx`, `components/layout/TabsNav.tsx` (a TASK-F05-3 usa), `cn` de `@properfy/frontend-standards`.
- **Tokens Tailwind:** `primary`, `error`, `info`, `success`, `warning`, `realty`, `text-primary` (`tailwind.config.ts:82-93`). A memória "Tailwind token alpha" vale: `bg-x/N` com token descarta a opacidade, então usar `color-mix`.
- **Navegação:** links para `/appointments/:id` na **mesma aba** (memória "same-tab nav"). O `AppointmentDetailPage` já tem `BackButton` com `useGoBack` (X01), então o voltar do detalhe retorna ao Live Day com a seleção na URL.
- **F04:** `GET /v1/day-plans/eta-accuracy?days=30` → `routeEtaAccuracySchema` (`meanAbsoluteErrorMinutes`, `sampleSize`, `excludedOutliers`, `thresholdMinutes 10`, `minSampleSize 30`, `status 'INSUFFICIENT_DATA'|'OK'|'ABOVE_THRESHOLD'`).

### Decisões aplicáveis

D1–D4, D6–D8, D10–D13, D16 (2026-10-27). X01: grupo Dashboard, botão voltar só nas sub telas (2026-10-27). F04 D8 (traçado vem pronto, sem token de servidor no cliente). Lição do #1302 (HSL com vírgula).

Lacunas decididas em **2026-10-29** (`lacunas/F05-lacunas.md`, recomendações aceitas):
- **Sem reconhecimento de alerta (L-F05-01).** O cliente não esmaece nem dispensa alertas; o contador "Needs attention" reflete o que o servidor devolve, e os alertas saem pelas regras de saída da TASK-F05-1 (ex.: o `CANT_DO` some quando o serviço é reofertado).
- **Dias passados (L-F05-02).** O servidor não projeta ETAs em dias passados; a copy do `NOT_STARTED` em dia passado é "{code} not started that day (due at {HH:mm})", sem "(N min ago)".
- **`MapScreenLayout` evolui (L-F05-04).** Ganha `storageKey?: string` (padrão = a chave atual, o `/map` não muda) e um **modo mobile recolhível** abaixo de `md` (768 px): o painel ocupa a largura toda (gutter de 16 px) com `max-h-[50dvh]`, ancorado embaixo, e um botão "Map / List" alterna entre painel expandido e recolhido (só o cabeçalho visível). O `/map` passa a usar o mesmo modo. O Live Day usa `storageKey 'live-day.panel.width'`.
- **"Hoje" vem do servidor (L-F05-05).** `DateInput.max = addCivilDays(data.today, 1)`; `isLive = date >= data.today`; "Today" desabilitado quando `date === data.today`. Deep-link com `?date=` além de amanhã (400 `LIVE_DAY_DATE_TOO_FAR`) → troca `date` por hoje com `replace` e mostra a faixa `role="status"` "That day isn't available yet. Showing today.". Enquanto não há `data` (1ª carga), a 1ª chamada vai sem `date` quando o parâmetro da URL não é uma data válida.
- **Teto de "Show all routes" (L-F05-06).** `LIVE_DAY_SHOW_ALL_MAX = 40` inspetores **visíveis** (depois do filtro): acima disso o toggle fica desabilitado (`aria-disabled`) com tooltip "Narrow the list (Needs attention) to show all routes — up to 40 at once". Pins de inspetor sem cluster.
- **Ordem da lista (L-F05-08).** Ordena por `(rank do alerta mais grave pelo LIVE_DAY_ALERT_TYPE_ORDER, inspectorName)`; sem alerta = rank 7 (por último). A ordem fica **congelada** enquanto o ponteiro está sobre a lista ou o foco está dentro dela; reordena no 1º poll sem interação, ou ao trocar filtro/data.
- **Rotas distinguíveis sem cor (L-F05-12).** Hover no traçado mostra um tooltip com o nome do inspetor (popup leve do Mapbox, sem foco); a legenda continua a alternativa textual.
- **Copys de data (L-F05-13).** Ver tabela "Copys por data" em UI.
- **Links nos alertas (L-F05-14).** Em `LiveDayAlertList` o `appointmentCode` é sempre `<Link to="/appointments/:id">` (mesma aba), inclusive no `CANT_DO` (cujo appointment já saiu das paradas).

Reconciliação em **2026-10-29**:
- **Posição no menu (L-X01-03).** "Live Day" entra **logo depois de Overview** (ordem canônica do X01), não depois de Workload. Testes por rótulo e posição relativa, nunca índice nem contagem.
- **Teste de menu sem mocks (L-X01-02).** O teste 10 usa o `Sidebar.roles.test.tsx` do X01, que não mocka `SidebarSubmenu`/`SidebarItem`.
- **Voltar (L-X01-08).** A F05 não cria sub tela com `backTo`: `/live-day` é tela de topo, a visão do inspetor é estado da página (botão "Back to all inspectors") e o `?open=<id>` da TASK-F05-3 é estado da lista de inspetores. Se a spec criar uma sub tela, o fallback do `backTo` aceita todos os papéis dela (AM/OP), o teste P-b roda com o papel mais restrito (OP) e um override usa `onBack(goBack)`.
- **Aviso de atraso (L-F03-04).** O `LATE_NOTICE` mostra o `estimatedArrivalAt` do servidor; o cliente não soma minutos a nenhum horário. `GEOFENCE` com `radiusMeters null` (execução pré-F03, L-F03-05) omite o limite.

### Testes primeiro (TDD)

Vitest + Testing Library, com `api` mockado e `mapbox-gl` mockado (o mesmo mock dos testes de `MapContainer`/`MapMarker`).

**A. `components/map`**

1. `RouteLayer.test.tsx` (mapa fake com `getSource/addSource/addLayer/removeLayer/removeSource/on/off`):
   - monta → `addSource('live-route-<id>', { type: 'geojson', data })` + 2 layers (`…-solid` com filtro `['!=', ['get','approximate'], true]`, `…-dashed` com filtro `['==', ['get','approximate'], true]` e `line-dasharray [1.5, 1.5]`);
   - `line-color` = a string recebida, que precisa casar `/^hsl\(\d+, \d+%, \d+%\)$/` (um `hsl(0 70% 38%)` com espaço gera `console.error` no teste e não chega ao paint);
   - re-render com outra `geometry` → `setData` (sem re-add);
   - `geometry null` → `setData(EMPTY)`;
   - desmontar → remove layers e source;
   - `onClick` → `map.on('click', '<layer>', handler)` nos 2 layers, `map.off` ao desmontar, e o cursor vira `pointer` no `mouseenter`;
   - `emphasis 'muted'` → `line-opacity 0.35`; `'normal'` → `0.9`; `'selected'` → `line-width 5`;
   - `stops` com `variant 'dots'` → source/layer `circle` com `circle-radius 4`, `circle-color` = cor, `circle-stroke-color '#FFFFFF'`;
   - mapa recriado (novo `getMap()`) → re-add idempotente.
2. `MapMarker.test.tsx` (acréscimos; os testes existentes continuam verdes):
   - `headColor '#0B628E'` na variante `icon` → cabeça e cauda com essa cor (sem `headColor`, continua `#1A1A1A`);
   - `outlineColor '#A51D1D'` → `box-shadow`/borda de 3 px com a cor na cabeça;
   - `innerText '3'` na variante círculo → renderiza "3" no lugar do ícone `mdi-map-marker`;
   - `innerIcon 'mdi-check-bold'` na variante círculo → renderiza o ícone;
   - `aria-label` = `label`.
3. `marker-offsets.test.ts`: os casos já cobertos pelo teste atual do `computeMarkerOffsets` (movidos); o `AppointmentMapPage.test.tsx` continua verde sem mudança de asserção.
3b. `MapScreenLayout.test.tsx` (L-F05-04; os testes atuais continuam verdes):
   - sem `storageKey` → lê/grava `localStorage['appointments-map.filter-panel.width']` (comportamento do `/map` intacto);
   - `storageKey 'live-day.panel.width'` → lê/grava essa chave e não toca na do `/map`;
   - viewport 375 px (`matchMedia('(min-width: 768px)')` falso) → painel com largura total, classe `max-h-[50dvh]`, sem alça de redimensionar, e botão "Map / List" com `aria-expanded`; clicar recolhe (só o cabeçalho) e `aria-expanded false`; o `document.documentElement.scrollWidth` não passa da largura da janela;
   - viewport 1280 px → card flutuante como hoje, sem o botão "Map / List".
3c. `RouteLayer.test.tsx` (acréscimo, L-F05-12): prop `label 'Jane Doe'` → `mouseenter` no layer abre o tooltip com "Jane Doe" e `mouseleave` fecha; sem `label` → nenhum tooltip.

**B. Feature `live-day`**

4. `useLiveDay.test.tsx`:
   - `date` hoje → `refetchInterval 30_000` e `refetchIntervalInBackground false`;
   - `date` amanhã → mesmo intervalo;
   - `date` passado → `refetchInterval false`;
   - `queryKey ['live-day', date, geometryMode, selectedId]`, com `geometryMode` derivado (D18): `showAll` → `'all'`; senão, inspetor selecionado → `'selected'` (+ `inspectorId`); senão `'none'`. A chamada envia `includeGeometry` e `inspectorId` só nesses casos;
   - sem seleção e sem "Show all routes" → a requisição leva `includeGeometry=none` (nenhum traçado no poll);
   - trocar a seleção de J para T → nova requisição `selected&inspectorId=T`; durante o fetch, `keepPreviousData` mantém a lista e a rota de J até a resposta chegar (sem piscar a lista);
   - ligar "Show all routes" → `includeGeometry=all`; desligar com J selecionado → volta para `selected&inspectorId=J`;
   - erro de rede depois de um sucesso → mantém `data` anterior e expõe `isRefetchError true` e `dataUpdatedAt`;
   - **`isLive` pelo servidor (L-F05-05):** relógio do navegador em 2026-11-10 e resposta com `today '2026-11-05'`, `date '2026-11-06'` → `refetchInterval 30_000` (amanhã do servidor); `date '2026-11-04'` → `false`;
   - URL com `date=2026-13-40` (inválida) → a 1ª requisição vai **sem** `date`.
5. `useEtaAccuracy.test.tsx`: chama `GET /v1/day-plans/eta-accuracy` com `days 30`, `staleTime 10 min`, sem `refetchInterval`.
6. `liveDayView.test.ts` (seletores puros):
   - `filterInspectors(list, { needsAttention: true })` → só `needsAttention`;
   - `routesToDraw(list, { showAll: false, selectedId: 'J' })` → só J;
   - `{ showAll: true }` → todos os visíveis (respeita o filtro);
   - `{ showAll: true, selectedId: 'J' }` → todos, com J `emphasis 'selected'` e os demais `'muted'`;
   - `formatDelay(22)` → "+22 min"; `(0)` → "On time"; `(-5)` → "On time"; `(null)` → "—";
   - `stopTimeLabel(stop)`:
     - DONE com início e fim → "Done 09:02–09:41";
     - DONE sem execução → "Done (no check-in)";
     - CURRENT com `startedAt` → "In progress since 10:17";
     - CURRENT sem `startedAt` → "Next · ETA 10:40";
     - OPEN → "Started 09:00 · not checked out";
     - REMAINING → "ETA 11:15";
     - REMAINING fora do plano → "Window 13:00–15:00";
     - REMAINING em **dia passado** (`date < today`) → "Planned 11:15" (não "ETA"; o servidor não projeta, L-F05-02);
     - tudo formatado no `stop.timezone` (fixture Perth mostra 08:00 local).
   - `sortInspectors(list)` (L-F05-08): Ana sem alerta, Bob com `NOT_STARTED`, Carl com `CANT_DO`, Dan com `NOT_STARTED` → `[Carl, Bob, Dan, Ana]` (rank do mais grave, depois nome); inspetor com `DELAY` + `CANT_DO` usa o rank do `CANT_DO`;
   - `canShowAllRoutes(visible)` (L-F05-06): 40 visíveis → `true`; 41 → `false`.
7. `LiveDayPage.test.tsx` (rota real com `createMemoryRouter`):
   - **loading:** skeleton com 6 linhas `aria-busy="true"` no painel; o mapa mostra "Loading map...";
   - **sucesso:** título "Live Day"; subtítulo "Last known location · updates every 30 s"; 1 linha por inspetor com nome, bolinha da cor (`hex` do shared), estado ("At property"), "1 of 3 done", "+22 min" e ícones de alerta; 1 `MapMarker` por inspetor com `lastKnown.source ≠ 'NONE'`;
   - **vazio:** `inspectors []` → EmptyState "No inspectors have work on Thu 5 Nov." (data formatada `EEE d MMM`);
   - **erro inicial:** 500 → EmptyState "We couldn't load the Live Day." + botão "Try again" (refetch);
   - **erro de polling:** 1º 200, 2º 500 → a lista continua e aparece `role="status"` com "Couldn't refresh. Showing data from 10:31." + "Retry";
   - **"Updated"**: texto "Updated just now" e, com relógio fake +45 s, "Updated 45 s ago" (atualiza a cada 15 s, sem `aria-live`);
   - **seletor de data:** trocar para ontem → nova chamada com `date` de ontem e o polling para; botão "Today" fica desabilitado quando `date === data.today`; datas depois de amanhã ficam desabilitadas no `DateInput` (`max = data.today + 1`); **estando em ontem**, o `max` continua `data.today + 1` (dá para ir a amanhã) (L-F05-05);
   - **data longe demais na URL (L-F05-05):** `?date=2026-11-20` → 400 `LIVE_DAY_DATE_TOO_FAR` → a URL vira `?date=<today>` com `replace`, a tela carrega hoje e mostra `role="status"` "That day isn't available yet. Showing today." (nada do EmptyState de erro);
   - **ordem estável (L-F05-08):** lista com Ana e Tom (sem alerta); foco na linha de Ana; 2º poll em que Tom ganha `CANT_DO` → a ordem **não** muda enquanto o foco está na lista; tirar o foco e 3º poll → Tom vai para o topo; trocar o filtro → reordena na hora;
   - **teto de rotas (L-F05-06):** 41 inspetores visíveis → "Show all routes" com `aria-disabled="true"` e tooltip "Narrow the list (Needs attention) to show all routes — up to 40 at once"; ligar "Needs attention" com 5 visíveis → o toggle volta a funcionar; com `routes=all` na URL e 41 visíveis → nenhuma requisição `all` sai;
   - **URL:** `?date=2026-11-04&inspector=<id>` abre com a data e o inspetor selecionados; trocar a seleção atualiza `inspector` com `replace` (sem empilhar histórico);
   - **"Needs attention":** toggle `aria-pressed` + contador "(2)"; ligado → só as linhas com alerta e só os pins delas; ligado com 0 → "Nobody needs attention right now." (hoje/amanhã) e "Nobody needed attention on Wed 4 Nov." (dia passado) (L-F05-13);
   - **amanhã sem plano (L-F05-13):** `date > today` e `planStatus 'NONE'` → chip "Route not generated yet — plans publish at 19:30" (não "No route plan");
   - **seleção:** clicar na linha de Jane → o painel mostra a visão do inspetor, com foco no `<h2>` "Jane Doe", `RouteLayer` de Jane com `emphasis 'selected'`, stop markers numerados e `fitBounds` chamado 1 vez;
   - **voltar à lista:** "Back to all inspectors" ou Escape → volta à lista, o foco retorna à linha de Jane e o `RouteLayer` some (se `showAll` estiver desligado);
   - **"Show all routes":** toggle `aria-pressed` → nova requisição com `includeGeometry=all` e 1 `RouteLayer` por inspetor visível com `geometryIncluded true`, com `variant 'dots'` nas paradas e legenda "Routes" com nome + bolinha; desligar → some;
   - **rota só com geometria:** linha com `geometryIncluded false` nunca desenha `RouteLayer`, mesmo selecionada, até a resposta com a geometria chegar (spinner discreto "Loading route…" na visão do inspetor);
   - **clique na rota** (handler do `RouteLayer`) → seleciona o inspetor;
   - **polling não mexe na câmera:** 2º poll com dados iguais → `fitBounds`/`flyTo` não são chamados de novo e a seleção continua;
   - **pin:** `aria-label` "Jane Doe — At property, 1 of 3 done, 22 min late. Last known location: check-in at 10:17."; clicar seleciona; `headColor` = cor do estado; `outlineColor` = cor do inspetor só quando a rota dele está desenhada;
   - **"Approximate route":** inspetor com `routeApproximate true` → chip "Approximate route" com tooltip "Straight lines between stops — the planned road route isn't available."; `routeOutOfDate true` → chip "Route may be out of date"; `planStatus 'DRAFT'` → "Not published yet"; `'NONE'` → "No route plan";
   - **"Route infeasible" (L-F04-05, 2026-10-29):** `routeFeasible false` com `routeViolations [{ appointmentCode 'RWS-0042', lateMinutes 25 }]` → badge "Route infeasible" na linha; tooltip (hover e foco) "Some stops can't be reached within their window:" + "RWS-0042 · ~25 min after its window"; a linha **não** conta no "Needs attention" e não muda de posição na ordem por gravidade; `routeFeasible true` → sem badge;
   - **`lastKnown NONE`:** sem pin; a linha mostra "Location unknown";
   - **rodapé:** `OK` → "Route ETA accuracy (30 days): 6.2 min average error · 214 stops"; `ABOVE_THRESHOLD` → mesmo texto + "Above the 10 min target" (tom `warning`); `INSUFFICIENT_DATA` → "Route ETA accuracy: not enough data yet (12 of 30 stops)"; `sampleSize 0` (`meanAbsoluteErrorMinutes null`) → "Route ETA accuracy: no data yet" (L-F05-13); erro → "Route ETA accuracy unavailable";
   - **mobile (L-F05-04):** viewport 375 px → painel embaixo com "Map / List"; recolher mostra o mapa; sem scroll horizontal; linhas e toggles com altura ≥ 44 px.
8. `LiveDayInspectorDetail.test.tsx`:
   - lista de paradas na ordem; `DONE` com ícone de check e "Done 09:02–09:41"; `CURRENT` destacado (`aria-current="step"`) com "In progress since 10:17"; `REMAINING` com "ETA 11:15";
   - código do appointment é `<Link to="/appointments/<id>">` (mesma aba);
   - parada fora do plano → chip "Not in route yet";
   - parada sem coordenada → "Location not found for this address";
   - alertas: `DELAY` "Running 22 min late (limit 20 min)"; override → "(limit 15 min, custom)"; `NOT_STARTED` (um por parada) "INS-0044 not started — due at 10:00 (240 min ago)"; em dia passado "INS-0044 not started that day (due at 10:00)" (L-F05-02); `OUT_OF_WINDOW` "Checked in outside the window for INS-0043 (25 min off, tolerance 15 min)"; com `thresholdMinutes null` → "Checked in outside the window for INS-0043 (10 min off)" (L-F05-11);
   - **links nos alertas (L-F05-14):** em todo item de alerta com `appointmentId`, o código é `<Link to="/appointments/<id>">` (mesma aba), inclusive no `CANT_DO` de um appointment que não está em `stops`; `LATE_NOTICE` "Said they'd arrive around 09:20 (20 min late): Traffic · INS-0044", com o horário vindo de `estimatedArrivalAt` no fuso da parada, nunca `predictedStartAt + minutes` (L-F03-04); `CANT_DO` "Couldn't do INS-0045: No answer at the door" + nota em itálico; `GEOFENCE` "Checked in 900 m from the property (limit 300 m) · INS-0043" / "Checked out …"; com `radiusMeters null` (pré-F03) → "Checked in 900 m from the property · INS-0043" (L-F03-05); `COMPLETION_REMINDER` "Completion reminder sent for INS-0043 at 11:31";
   - "Last known location: check-out at 09:41 · 12 King St, Surry Hills"; `BASE` → "Last known location: base (no check-in yet)"; `label 'Start of day'` → "Last known location: today's start address (no check-in yet)".
9. `LiveDayLegend.test.tsx`: legenda de estados sempre visível (4 itens com ícone + texto); seção "Routes" só com `showAll`, com os nomes; mais de 12 inspetores (até o teto de 40) → lista com rolagem (`max-h` de 8 linhas) e `aria-label="Route colours"`.
10. **Menu** (robusto a outras features que também acrescentam filhos ao grupo, como F02, F07 e F08): `Sidebar.roles.test.tsx`, **sem** mocks de `SidebarSubmenu`/`SidebarItem` e com `MemoryRouter` (L-X01-02): AM e OP abrem o flyout com `user.click` no botão `{ name: 'Dashboard' }` (`aria-haspopup="menu"`) e encontram, por rótulo, o `menuitem` "Live Day" com `href="/live-day"`; a posição de "Live Day" fica **depois de Overview e antes de Analytics**, comparando posições por rótulo, nunca índice absoluto (L-X01-03); com `initialEntries ['/live-day']` o grupo fica ativo; CL_ADMIN/CL_USER **não** têm esse item (`queryByRole(...)` nulo); INSP continua com o item simples. `Sidebar.test.tsx`: `filterNavItems(NAV_ITEMS, 'AM')` contém um filho com `to: '/live-day'` (asserção de **presença**, nunca de contagem nem de posição).
11. **Router:** `/live-day` com CL_ADMIN → o `AuthGuard` nega (mesma asserção do teste de Workload); com OP → renderiza a página.
12. **Acessibilidade (axe no teste de página):** 0 violações em lista, detalhe e legenda. As barras de progresso têm `role="progressbar"`, `aria-valuemin 0`, `aria-valuemax total`, `aria-valuenow done` e `aria-label "Jane Doe progress"`.

### Escopo / Passos

1. **`components/map`** (web):
   - `RouteLayer.tsx` (novo; ver UI → RouteLayer) + teste, com `label` para o tooltip de hover (L-F05-12);
   - `MapScreenLayout.tsx` (L-F05-04): prop `storageKey?: string` (padrão = `'appointments-map.filter-panel.width'`) e modo mobile recolhível abaixo de `md` (painel embaixo, largura total com gutter de 16 px, `max-h-[50dvh]`, botão "Map / List" com `aria-expanded`); o `/map` herda o modo mobile sem outra mudança. QA do `/map` em desktop e em 375 px antes do PR;
   - `MapMarker.tsx`: props opcionais `headColor`, `outlineColor`, `innerText`, `innerIcon` (sem mudar o padrão);
   - `marker-offsets.ts` (novo, conteúdo movido do `AppointmentMapPage.tsx:298`; o `AppointmentMapPage` passa a importar daqui);
   - `index.ts` exporta `RouteLayer` e `computeMarkerOffsets`.
2. **Feature `apps/web/src/features/live-day/`** (nova):
   - `hooks/useLiveDay.ts`, `hooks/useEtaAccuracy.ts`;
   - `lib/liveDayView.ts` (seletores puros e formatadores, incluindo `sortInspectors` e `canShowAllRoutes`, L-F05-06/08);
   - `hooks/useFrozenOrder.ts` (L-F05-08): guarda a última ordem enquanto `isInteracting` (ponteiro sobre a lista ou foco dentro dela) e libera no 1º render sem interação, ou quando muda filtro/data;
   - `components/LiveDayPanel.tsx` (cabeçalho, data, toggles, lista, detalhe, rodapé), `LiveDayInspectorRow.tsx`, `LiveDayInspectorDetail.tsx`, `LiveDayAlertList.tsx`, `LiveDayStopList.tsx`, `LiveDayLegend.tsx`, `LiveDayStateBadge.tsx`, `RouteEtaAccuracyFooter.tsx`;
   - `pages/LiveDayPage.tsx`;
   - testes ao lado.
3. **Router:** rota `live-day` com `AuthGuard roles={[UserRole.AM, UserRole.OP]}` e `Loadable(lazyRetry(() => import('@/features/live-day/pages/LiveDayPage')…))`, com comentário no padrão do Workload (cross-tenant, só AM/OP, o servidor reforça).
4. **Menu (X01):** filho `{ icon: 'mdi-map-clock-outline', label: 'Live Day', to: '/live-day', roles: [UserRole.AM, UserRole.OP] }` no `submenu` do "Dashboard", **logo depois de "Overview"** (ordem canônica do X01, L-X01-03; se "Inspector notices" da F02 já existir, fica antes dele). O grupo fica ativo também em `/live-day`.
5. **Docs (regra X00):** `apps/web/CLAUDE.md`: `components/map/RouteLayer` (primeira camada de linha do web; paint em HSL com vírgula; 2 layers sólido/tracejado), paleta por inspetor do shared, polling de 30 s só com aba visível, "Live Day" no grupo Dashboard, `MapScreenLayout` com `storageKey` e modo mobile recolhível (L-F05-04), "hoje" sempre do servidor (`data.today`, L-F05-05).
6. **Gates no worktree:** `pnpm --filter @properfy/shared build`; `pnpm --filter web typecheck lint test` (lint com `--max-warnings 0`, regra do WEB-6; typecheck com cache limpo, lição "web typecheck cache mente"); QA manual no navegador com o backend local, nos 4 estados, em hoje, ontem e amanhã, com "Show all routes" e o polling observado no DevTools (pausa com a aba oculta). Screenshots ficam fora do commit.

### Modelo de dados / Contratos / UI / Algoritmo

**Contratos consumidos (sem novos):**
- `GET /v1/dashboard/live-day?date=` (TASK-F05-1);
- `GET /v1/day-plans/eta-accuracy?days=30` (F04).
- Tipos de `packages/shared/src/api-types.ts` (gerado na TASK-F05-1 por `pnpm --filter @properfy/shared generate:types`); schemas e paleta de `@properfy/shared`.

**URL:** `/live-day?date=YYYY-MM-DD&inspector=<uuid>&attention=1&routes=all`. Todos os parâmetros são opcionais: sem `date` = hoje (do servidor, `data.today`). Mudanças usam `setSearchParams(..., { replace: true })`. Um `inspector` que não existe na data é ignorado em silêncio. `date` inválida → 1ª chamada sem `date`; `date` além de amanhã → 400 `LIVE_DAY_DATE_TOO_FAR` → `date = data.today` com `replace` + faixa "That day isn't available yet. Showing today." (L-F05-05). `routes=all` com mais de 40 visíveis é ignorado até a lista caber (L-F05-06).

**Layout (desktop ≥ 1024 px)**
- `MapScreenLayout fillParent` (o AppShell está em modo de altura total, como no `/map`).
- **Mapa (área inteira):**
  - `MapContainer` com `initialViewState` padrão;
  - camadas em ordem: rotas (`RouteLayer`, abaixo dos marcadores DOM) → pins de parada do selecionado → pins de inspetor;
  - **legenda** fixa no canto inferior direito (card `bg-card-bg` com `color-mix` para transparência).
- **Painel lateral** (card flutuante, largura salva em `storageKey 'live-day.panel.width'` pela prop nova do `MapScreenLayout`, não o do mapa de appointments, L-F05-04). De cima para baixo:
  1. **Cabeçalho:** `<h1>` "Live Day" + ícone de ajuda (`Tooltip`: "Positions come from each inspector's last check-in or check-out. Properfy doesn't track inspectors between stops, so 'In transit' is an estimate."); subtítulo "Last known location · updates every 30 s" (para datas passadas: "Last known location"); à direita, "Updated {just now | N s ago | N min ago}" + ícone `mdi-refresh mdi-spin` durante o fetch.
  2. **Data:** `DateInput` rotulado "Day" (máximo = `addCivilDays(data.today, 1)`, independente da data selecionada; sem mínimo) + botão secundário "Today" (desabilitado quando `date === data.today`) (L-F05-05).
  3. **Resumo** (4 contadores com ícone + rótulo; não são filtros): "Not started 3", "At property 5", "In transit 4", "Done for the day 2" e "{stopsDone} of {stopsTotal} stops done".
  4. **Toggles** (botões com `aria-pressed`): "Needs attention ({n})" com ícone `mdi-alert-circle-outline` e "Show all routes" com ícone `mdi-map-marker-path` (desabilitado com tooltip acima de 40 visíveis, L-F05-06).
  5. **Conteúdo:** a **lista** (`<ul aria-label="Inspectors">`) ou a **visão do inspetor** selecionado.
  6. **Rodapé** fixo: `RouteEtaAccuracyFooter`.
- **Linha do inspetor** (`<li><button>` de largura total):
  - bolinha de 10 px com a cor do inspetor (`hex`, `aria-hidden`);
  - nome (semibold);
  - `LiveDayStateBadge` (ícone + rótulo);
  - barra de progresso (`done/total`) com o texto "1 of 3 done";
  - atraso ("+22 min" em `text-warning` acima do limite, "On time", "—");
  - ícones de alerta com texto oculto (`sr-only`: "2 alerts: Running late, Couldn't do a job");
  - chips de rota ("Approximate route", "Route may be out of date", "Not published yet", "No route plan" — ou "Route not generated yet — plans publish at 19:30" em data futura, L-F05-13);
  - badge "Route infeasible" (`text-warning`, ícone + texto) quando `routeFeasible false`, com tooltip acessível (foco e hover) "Some stops can't be reached within their window:" e uma linha por item de `routeViolations` ("{appointmentCode} · ~{lateMinutes} min after its window"). É indicador, não alerta (D20, L-F04-05, 2026-10-29);
  - "Location unknown" se `NONE`.
  - Ordem (L-F05-08): rank do alerta mais grave (`LIVE_DAY_ALERT_TYPE_ORDER`: `CANT_DO` 0 … `OUT_OF_WINDOW` 6; sem alerta 7), depois nome (`localeCompare 'en-AU'`). Congelada enquanto há ponteiro sobre a lista ou foco nela; reordena no próximo poll sem interação ou ao trocar filtro/data.
- **Visão do inspetor:**
  - botão "Back to all inspectors" (`mdi-arrow-left`; **não** é o `BackButton`, porque não é rota);
  - `<h2 tabIndex={-1}>` com o nome, estado, "Last known location: …", progresso e atraso;
  - `LiveDayAlertList` (`<ul aria-label="Alerts">`), com o código de cada alerta como `<Link to="/appointments/:id">` (mesma aba), inclusive `CANT_DO` (L-F05-14);
  - `LiveDayStopList` (`<ol aria-label="Stops">`), uma linha por parada: marcador (número `sequence`, check para `DONE`, "•" fora do plano), `<Link>` com o código (`INS-0042`), agência, endereço, janela "08:00–17:00" e o texto de horário do teste 6;
  - `CURRENT` com fundo destacado e `aria-current="step"`.
- **Tablet (768–1023 px):** card flutuante como no desktop, com a largura mínima de 360 px.
- **Mobile (< 768 px, L-F05-04):** modo recolhível novo do `MapScreenLayout`: painel ancorado embaixo, largura total com gutter de 16 px, `max-h-[50dvh]` com rolagem interna, botão "Map / List" (`aria-expanded`) que recolhe o painel até o cabeçalho para liberar o mapa. Sem scroll horizontal; alvos de toque ≥ 44 px nas linhas, toggles e no "Map / List". A legenda fica recolhida num botão "Legend" no canto do mapa.

**Copys por data (L-F05-02, L-F05-13)**

| Situação | Texto |
|---|---|
| "Needs attention" ligado, 0 resultados, `date ≥ today` | "Nobody needs attention right now." |
| idem, `date < today` | "Nobody needed attention on {EEE d MMM}." |
| `date > today` e `planStatus 'NONE'` | chip "Route not generated yet — plans publish at 19:30" |
| `date ≤ today` e `planStatus 'NONE'` | chip "No route plan" |
| `NOT_STARTED` com `date < today` | "{code} not started that day (due at {HH:mm})" |
| parada `REMAINING` com `date < today` | "Planned {HH:mm}" |
| rodapé com `sampleSize 0` | "Route ETA accuracy: no data yet" |
| `OUT_OF_WINDOW` com `thresholdMinutes null` | "Checked in outside the window for {code} ({n} min off)" |

**Estados visuais do inspetor** (pin e badge; o estado nunca é codificado só pela cor, sempre há ícone + texto)

| Estado | Rótulo | Ícone MDI | Cor da cabeça do pin (`headColor`) |
|---|---|---|---|
| `NOT_STARTED` | "Not started" | `mdi-clock-outline` | `#4B5563` (cinza 600) |
| `AT_PROPERTY` | "At property" | `mdi-home-account` | `var(--color-info)` resolvida para hex |
| `IN_TRANSIT` | "In transit" | `mdi-car` | `var(--color-warning)` resolvida para hex |
| `DONE_FOR_DAY` | "Done for the day" | `mdi-check-all` | `var(--color-success)` resolvida para hex |

- Pin com `needsAttention`: badge vermelho de 10 px no canto superior direito da cabeça (`aria-hidden`; a informação está no `aria-label`).
- Pin com a rota desenhada (selecionado ou "Show all routes"): `outlineColor` = cor do inspetor (3 px). O estado continua na cabeça e no ícone (regra do plano: não misturar os dois significados).

**Pins de parada do selecionado** (`MapMarker` variante círculo, 24 px)

| Progresso | Conteúdo | Fundo | Borda |
|---|---|---|---|
| `DONE` | `innerIcon 'mdi-check-bold'` | cor do inspetor | branca |
| `CURRENT` | `innerText` = sequência | cor do inspetor | anel `ring-2` (`active`) |
| `OPEN` | `innerText` = sequência | cor do inspetor (60% via `color-mix`) | branca |
| `REMAINING` | `innerText` = sequência | branco | cor do inspetor (texto na cor do inspetor, contraste ≥ 4.5:1 pela paleta) |
| fora do plano | `innerText '•'` | branco | cor do inspetor, tracejada |

- `aria-label` do pin de parada: "Stop 2, INS-0043, 14 Crown St — in progress since 10:17".
- Clicar no pin de parada rola a lista até a linha e dá foco nela.

**RouteLayer** (`components/map/RouteLayer.tsx`)
```ts
interface RouteLayerProps {
  id: string;                                   // único por inspetor: "live-route-<inspectorId>"
  geometry: DayPlanGeometry | null;             // FeatureCollection (dayPlanGeometrySchema)
  color: string;                                // HSL com vírgula (inspectorRouteColor(id).mapbox)
  emphasis?: 'normal' | 'selected' | 'muted';   // largura/opacidade
  stops?: { variant: 'dots'; points: Array<[number, number]> }; // pontos pequenos no modo "todas"
  onClick?: () => void;                         // clicar no traçado
  label?: string;                               // nome do inspetor, mostrado em tooltip no hover do traçado (L-F05-12)
}
```
- Hover (`mouseenter` no layer) com `label` → `mapboxgl.Popup` leve (`closeButton false`, `closeOnClick false`, sem foco) no ponto do cursor com o nome; `mouseleave` remove. É o jeito de distinguir rotas de cores parecidas (CVD) sem depender da cor.
- Fonte `geojson` `<id>`. Layers `<id>-solid` (filtro `approximate != true`) e `<id>-dashed` (filtro `approximate == true`, `line-dasharray [1.5, 1.5]`). `line-cap/join round`.
- `line-width`: 3 (normal/muted) ou 5 (selected). `line-opacity`: 0.9 (normal/selected) ou 0.35 (muted).
- Pontos: fonte `<id>-stops` e layer `circle` (`radius 4`, `stroke 1.5 #FFFFFF`).
- Os layers entram **antes** do 1º layer de símbolo do estilo (`beforeId` = 1º layer `type 'symbol'`), para os rótulos de rua ficarem legíveis por cima.
- Idempotente: `getSource` antes de `addSource`; `setData` em atualização; limpeza no unmount; `map.on/off('click'|'mouseenter'|'mouseleave', layerId)`.
- Nunca chama a API do Mapbox Directions (o traçado vem pronto).

**Câmera**
- Na 1ª carga de cada data: `fitBounds` de todos os pins de inspetor (padding de 48 px + a largura do painel à esquerda). Com 1 pin: `flyTo` com zoom 13. Sem pin: vista padrão.
- Ao selecionar: `fitBounds` da rota (origem + paradas com coordenada + pin do inspetor).
- Polling **nunca** move a câmera.
- `prefers-reduced-motion: reduce` → `duration: 0`.

**Polling e estados de dados**
- `useLiveDay({ date, geometryMode, selectedId })`: `useQuery({ queryKey: ['live-day', date, geometryMode, selectedId], queryFn, refetchInterval: isLive ? 30_000 : false, refetchIntervalInBackground: false, placeholderData: keepPreviousData })`, com `isLive = date >= data.today` (hoje ou amanhã **do servidor**, L-F05-05; antes da 1ª resposta, `isLive = true`). `geometryMode` segue o D18: `none` sem seleção, `selected` com seleção, `all` com "Show all routes". Assim o poll de 30 s nunca carrega traçados que a tela não desenha.
- **Loading** (1ª carga): skeleton (6 linhas) com `aria-busy`. O mapa mostra o próprio "Loading map...".
- **Vazio:** EmptyState `mdi-calendar-blank` "No inspectors have work on {EEE d MMM}." Com "Needs attention" ligado e 0 resultados: "Nobody needs attention right now." (ou "Nobody needed attention on {EEE d MMM}." em dia passado, L-F05-13) + botão "Show everyone".
- **Erro inicial:** EmptyState de erro "We couldn't load the Live Day." + "Try again". Exceção: 400 `LIVE_DAY_DATE_TOO_FAR` não é erro de tela; troca para hoje com a faixa "That day isn't available yet. Showing today." (L-F05-05).
- **Erro de polling:** faixa `role="status"` (polite) "Couldn't refresh. Showing data from {HH:mm}." + "Retry". Some no próximo sucesso. Não rouba foco.
- **Mapa sem token:** o `MapContainer` mostra o próprio aviso; a lista funciona.
- **Rodapé ETA:** loading → "Route ETA accuracy…"; textos do teste 7.

**Teclado e WCAG 2.1 AA**
- Ordem de tab: cabeçalho → data → Today → toggles → lista → rodapé. Os pins do mapa são botões e entram depois do painel na ordem do DOM.
- Enter/Espaço na linha seleciona o inspetor. Escape na visão do inspetor volta à lista. O foco vai para o `<h2>` ao entrar e volta para a linha ao sair.
- As rotas (canvas) não são focáveis. A alternativa acessível é a lista de paradas (WCAG 1.1.1/2.1.1).
- Cor nunca sozinha (1.4.1): estado com ícone + texto; inspetor com nome ao lado da bolinha; atraso com texto; rotas entre si com nome no hover, clique para destacar e legenda textual (L-F05-12).
- Contraste: textos em tokens AA; as cores de inspetor ≥ 4.5:1 (tabela "Paleta").
- `aria-pressed` nos toggles. `aria-current="step"` na parada atual. Contadores com texto visível.
- "Updated N s ago" sem `aria-live`, para não anunciar a cada 15 s. Só o erro de polling é anunciado.

### Casos de borda

1. **12+ inspetores** com a mesma cor por colisão: a legenda e a lista têm o nome, o selecionado fica em `emphasis 'selected'` e os demais `muted`.
2. **"Show all routes" no teto (40 inspetores visíveis, L-F05-06):** 40 fontes × 3 layers. Critério de QA: com 40 rotas, pan/zoom sem travar e o render de um poll < 100 ms (Performance do DevTools, notebook comum). Acima de 40, o toggle fica desabilitado com o tooltip; com 100 inspetores, a lista e os 100 pins DOM continuam operáveis (sem cluster, decisão L-F05-06).
3. **Inspetor selecionado some no poll** (perdeu todas as paradas e não tem `CANT_DO`): volta à lista com a faixa `role="status"` "Jane Doe no longer has work on this day."
4. **Data trocada com inspetor selecionado:** mantém a seleção se o inspetor existe na nova data; senão, limpa.
5. **Pins no mesmo ponto** (2 inspetores na mesma base): `computeMarkerOffsets` separa.
6. **Parada sem coordenada:** sem pin; na lista com o aviso; fora do `fitBounds`.
7. **Dia passado:** sem polling, subtítulo sem "updates every 30 s", rotas em fallback reto + "Approximate route", horários restantes como "Planned HH:mm" e `NOT_STARTED` como "not started that day" (L-F05-02).
7b. **Amanhã antes das 19:30:** plano ainda não gerado → chip "Route not generated yet — plans publish at 19:30" em vez de "No route plan" (L-F05-13). ROUTINE não confirmadas não aparecem (T-1 no servidor, L-F05-03).
7c. **Lista mudando sob o cursor:** a ordem fica congelada durante a interação (L-F05-08); um inspetor que ganha alerta sobe só quando a OP sai da lista.
7d. **Alerta tratado pela OP** (reofertou o serviço do `CANT_DO`): some no próximo poll, sem botão de dispensar (L-F05-01).
8. **Amanhã com plano `DRAFT`:** chip "Not published yet"; tudo `NOT_STARTED`.
9. **Aba oculta:** o polling pausa e, ao voltar, refaz o fetch (`refetchOnWindowFocus` padrão do projeto).
10. **Relógio do navegador errado:** "Updated N s ago" usa `dataUpdatedAt` (relógio local, só relativo). Toda a lógica de "hoje" vem de `data.today`/`isToday` do servidor (L-F05-05).
11. **Mapbox `style.load` de novo** (troca de estilo não existe, mas o mapa pode ser recriado): `RouteLayer` re-adiciona.
12. **Link para o appointment e voltar:** `?date&inspector` na URL restaura a tela (o `BackButton` do detalhe usa `useGoBack`).

### Fora do escopo

- A aba "Locked time" e as telas de limites (TASK-F05-3).
- Recalcular plano, baixar folha, editar paradas, reordenar.
- Busca por nome, filtros por agência ou por estado (o plano só pede "Needs attention").
- Qualquer mudança em `DashboardPage`, `AnalyticsPage`, `InspectorWorkloadPage` e `AppointmentMapPage` (só a troca do import do `computeMarkerOffsets`). O `/map` só herda o modo mobile do `MapScreenLayout` (L-F05-04).
- Notificação sonora ou push para a OP.
- Reconhecer/dispensar alerta, mesmo por sessão (L-F05-01).
- Cluster de pins de inspetor (L-F05-06).

### Critérios de aceite

- **01.A4:** com o backend real, check-in de uma parada no PWA (ou `POST …/start`) → até 30 s depois o pin e a linha mostram "At property"; check-out com parada restante → "In transit"; último check-out → "Done for the day". Provas: QA manual (smoke) + teste 7 com sequência de respostas mockadas.
- **01.A5 (exibição):** cada alerta vindo da API aparece com o texto do teste 8 e conta no "Needs attention". Ligar o filtro esconde quem não tem alerta (teste 7).
- Plano inviável aparece como badge "Route infeasible" com as paradas no tooltip, sem entrar no "Needs attention" (teste 7; L-F04-05).
- Rota do selecionado com paradas feitas (check + horário real), atual destacada e restantes com previsão. "Show all routes" com uma cor por inspetor, a mesma na bolinha e na legenda. Sem traçado: linhas retas tracejadas + "Approximate route".
- Polling de 30 s só com a aba visível. Nenhuma chamada do navegador a `api.mapbox.com/directions` (conferido no DevTools no QA).
- 0 violações axe nas telas testadas. Tudo operável por teclado.
- Em 375 px: painel recolhível, sem scroll horizontal, alvos ≥ 44 px; o `/map` mantém a largura salva e ganha o mesmo modo mobile (L-F05-04).
- "Hoje", o máximo do seletor e o polling seguem `data.today`; deep-link com data longe demais cai em hoje com aviso (L-F05-05).
- "Show all routes" desabilitado acima de 40 visíveis (L-F05-06); lista por gravidade e estável durante a interação (L-F05-08); códigos nos alertas são links (L-F05-14).

### Dependências

- TASK-F05-1 mergeada: endpoint (com `today`), schemas, paleta no shared, constantes `LIVE_DAY_SHOW_ALL_MAX`/`LIVE_DAY_ALERT_TYPE_ORDER` e `api-types` regenerado.
- TASK-X01-1 mergeada: grupo Dashboard com `submenu`.
- F04 `GET /v1/day-plans/eta-accuracy`.

### Riscos e armadilhas

- **HSL com espaço quebra o mapa inteiro** (#1302). Usar só o `mapbox` da paleta no paint e só o `hex` no CSS. O teste 1 trava o formato.
- **Marcadores DOM e React:** não montar `mapboxgl.Marker` fora do `MapMarker` (bug de reconciliação documentado no componente).
- **Layers acumulando** entre polls ou trocas de data: o id é estável por inspetor e há limpeza no unmount (teste 1).
- **`fitBounds` em cada poll** faria a câmera pular. A câmera só reage à 1ª carga e à seleção (teste 7).
- **Token alpha do Tailwind:** `bg-info/20` não funciona com os tokens; usar `color-mix` (memória).
- **`findBy` × rerender do polling** nos testes: usar relógio fake e `waitFor` com a asserção final (memória "findBy rerender").
- **Popup ou clique no mapa fechando modais da página:** a tela não tem modais. Os cliques do canvas só selecionam (memória "popup mata modais").
- **Tamanho do bundle:** a feature é lazy. `mapbox-gl` já está no chunk do mapa.
- **`MapScreenLayout` é compartilhado com o `/map`** (L-F05-04): o padrão da `storageKey` não pode mudar (o usuário perderia a largura salva) e o modo mobile precisa de QA no `/map`, incluindo o lasso e os filtros.
- **Congelamento da ordem preso:** se o `pointerleave`/`focusout` não disparar (ex.: o elemento some), a ordem pode ficar congelada; liberar também ao trocar data/filtro e ao desmontar (teste 7).

### Deploy / rollout / rollback

- **Deploy:** só front (Vercel/estático junto do pipeline). Sem migration.
- **Rollout:** o item aparece para AM/OP assim que o deploy sai. Smoke em staging com AM: hoje, ontem e amanhã; "Show all routes"; seleção; link para um appointment (pela parada e pelo alerta) e voltar; aba oculta pausando o polling (DevTools → Network); `?date=` de daqui a 10 dias caindo em hoje com aviso; o `/map` em desktop (largura salva preservada) e em 375 px (modo recolhível).
- **Rollback:** reverter o PR. O menu volta aos 3 filhos e os endpoints da TASK-F05-1 ficam sem consumidor (inofensivos).

### Dias · Branch · Verificação

- **Dias:** 5,75 = plano 4,5 (página 01.8/01.9 2,5 + rotas/`RouteLayer`/paleta 1,75 + filtro "Needs attention" 0,25) + 0,25 da revisão (modo de geometria na `queryKey`, troca sem piscar, testes) + lacunas 1,0 (`MapScreenLayout` com `storageKey` e modo mobile 0,5, L-F05-04; `today` do servidor e deep-link inválido 0,25, L-F05-05; ordem por gravidade congelada 0,25, L-F05-08). Teto de rotas (L-F05-06), copys (L-F05-02/11/13), tooltip de rota (L-F05-12) e links nos alertas (L-F05-14) sem dia extra; a reconciliação de 2026-10-29 (menu depois de Overview, teste sem mocks, copy do `estimatedArrivalAt`, L-X01-02/03/08, L-F03-04/05) também.
- **Branch:** `feat/f05-live-day-web` a partir de `develop` (depois do merge da F05-1), em worktree. ~40 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build`; `pnpm --filter web typecheck lint test`; QA no navegador com backend local nos estados acima; `git diff --stat origin/develop... | tail -1` < 150.

---

## TASK-F05-3 · Web: aba "Locked time" (01.13) e seções "Live Day alerts" (drawer do inspetor e "Platform settings")

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F05-1, TASK-F05-2, TASK-F03-4
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F08-2, TASK-F08-3
> - **Pista sugerida (time de 6):** E · Full-stack / QA

### Objetivo

Fechar a F05 no web:
- **"Locked time"** (01.13) como aba do painel do Live Day: % travado por agência e por região no período (padrão: próximos 14 dias);
- **limites de alerta**: padrão da plataforma na página "Platform settings" (seção "Live Day alerts") e override opcional por inspetor numa seção do drawer do inspetor.

### Contexto no código

- **Painel do Live Day** (TASK-F05-2): `features/live-day/components/LiveDayPanel.tsx`. Recebe `TabsNav` (`components/layout/TabsNav.tsx`, já usado no `InspectorDetailDrawer.tsx:143`).
- **Abertura do drawer:** `apps/web/src/features/inspectors/pages/InspectorListPage.tsx` abre o `InspectorDetailDrawer` por **estado local** (`useState` de `selectedId`/`drawerOpen`, `:21-22`); não há parâmetro de URL para abrir um inspetor (verificado no snapshot; L-F05-14).
- **Drawer do inspetor:** `apps/web/src/features/inspectors/components/InspectorDetailDrawer.tsx`, com abas `details | availability | ratings`, `isAmOp = user?.role === 'AM' || 'OP'` (`:51`) e a aba "Details" renderizando `InspectorDetailSections` (`:149`). Hooks em `features/inspectors/hooks/` (`useInspectorDetail`, `useInspectorSave` etc.). A F01 também acrescenta seções a esse drawer: seguir o mesmo padrão de seção (`FormSection`/`DetailRow`).
- **"Platform settings"** (TASK-F03-4): `features/platform-settings/pages/PlatformSettingsPage.tsx`, com `usePlatformSetting(key)` e seções por chave ("Field events" da F03, "Route planning" da F04-5).
- **Tabelas:** `components/data/DataTable.tsx` (`<th>` de ordenação acessível desde o WEB-6). A ordenação é no cliente (memória "client side sorting").
- **Não reusar** `ConfirmationMeter` nem os hooks do `/analytics` (D9, D12).

### Decisões aplicáveis

D5, D9, D11, D12 (2026-10-27). Q17 (2026-10-27). F03 D18 ("último vence" nos settings, 2026-10-28).

Lacunas decididas em **2026-10-29** (`lacunas/F05-lacunas.md`, recomendações aceitas):
- **"Locked time" ancorado em hoje (L-F05-09).** O período começa sempre em `data.today` do Live Day (hoje do ator no servidor, L-F05-05), independente da data selecionada na aba "Inspectors". O subtítulo mostra o intervalo real. Os presets 7/14/30 são constantes da F05 e **não** têm relação com o `mapWindowDays` por agência da F00 (cada linha "por agência" usa o mesmo período).
- **Região com agência (L-F05-13).** A célula "Region" mostra "{regionName} · {agencyName}" e, para região global (`agencyName null`), "{regionName} · Platform". "No region" fica sem sufixo.
- **Caminho para os limites (L-F05-14).** Na visão do inspetor do Live Day, um link discreto "Open inspector" para `/inspectors?open=<id>` (mesma aba), com o texto de ajuda "Alert limits for this inspector are set in their profile". O `InspectorListPage` passa a abrir o drawer quando recebe `?open=<id>`.

### Testes primeiro (TDD)

1. `useLockedTime.test.tsx`: `queryKey ['locked-time', from, to]`; preset 14 → `from` = `data.today` do Live Day, `to = from + 13` (`addCivilDays`); com a aba "Inspectors" em ontem (`data.date '2026-11-04'`, `data.today '2026-11-05'`) → `from '2026-11-05'` (L-F05-09); sem polling; `staleTime 60 s`.
2. `LockedTimeSection.test.tsx`:
   - **loading:** skeleton das 2 tabelas;
   - **sucesso:** título "Locked time"; ajuda "Share of inspections that need the tenant to confirm and are already confirmed."; resumo "Overall: 66.7% locked (2 of 3)"; tabela "By agency" com colunas Agency · Locked · Confirmed / Required; tabela "By region" com Region · Locked · Confirmed / Required; "No region" por último;
   - **`percent null`:** "—" com `aria-label "No inspections need confirmation"`;
   - **ordenação:** clicar em "Locked" ordena asc/desc com `aria-sort` (cliente); "No region" fica no fim em qualquer ordenação;
   - **período:** `SelectInput` "Period" com "Next 7 days" / "Next 14 days" (padrão) / "Next 30 days"; trocar dispara nova consulta; o subtítulo mostra "5 Nov – 18 Nov" (a partir de `data.today`, mesmo com a aba "Inspectors" em outra data, L-F05-09);
   - **região com agência (L-F05-13):** linha `{ regionName 'North', agencyName 'Ray White' }` → "North · Ray White"; `{ regionName 'North', agencyName null }` → "North · Platform"; "No region" sem sufixo;
   - **vazio:** `required 0` em tudo → EmptyState "No inspections need tenant confirmation in this period.";
   - **erro:** "We couldn't load locked time." + "Try again";
   - percentuais com 1 casa ("66.7%") e barra horizontal com `role="meter"` (`aria-valuenow`, `aria-valuemin 0`, `aria-valuemax 100`).
3. `LiveDayPanel.test.tsx` (acréscimo):
   - `TabsNav` com "Inspectors" (padrão) e "Locked time";
   - `?tab=locked` abre na aba;
   - trocar a aba não para o polling do live-day e não limpa a seleção (volta ao mesmo inspetor ao retornar);
   - na aba "Locked time" o mapa continua com os pins e as rotas; só o conteúdo do painel muda;
   - o rodapé "Route ETA accuracy" continua visível nas duas abas.
4. `useInspectorAlertThresholds.test.tsx`: GET `/v1/inspectors/{id}/alert-thresholds`; o PUT invalida a própria query e `['live-day']` (o próximo poll já usa o limite novo).
5. `InspectorAlertThresholdsSection.test.tsx` (dentro da aba "Details" do drawer):
   - AM/OP vê a seção "Live Day alerts"; CL_ADMIN não vê (e o hook não chama a API);
   - leitura: "Delay alert after: 20 min (platform default)" / "15 min (custom)"; "Not-started alert after: 30 min (platform default)";
   - "Edit" abre o formulário inline com 2 campos numéricos (min 5, max 240, passo 1) e, para cada um, a caixa "Use platform default ({n} min)" que desabilita o campo;
   - validação: 4 → "Enter a value between 5 and 240 minutes."; vazio sem a caixa marcada → mesma mensagem; decimal → mesma mensagem;
   - "Save" envia `{ delayMinutes: 15, notStartedMinutes: null }` → snackbar "Alert limits saved." e volta à leitura; erro 400/500 → mensagem do servidor no formulário (`role="alert"`) e os valores ficam; "Cancel" descarta; Escape no formulário = Cancel;
   - foco: ao abrir vai para o 1º campo; ao salvar ou cancelar volta para "Edit".
6. `PlatformSettingsPage.test.tsx` (acréscimo):
   - seção "Live Day alerts" com "Delay alert (min)" = 20 e "Not-started alert (min)" = 30;
   - ajuda "Applies to every inspector without a custom limit. Changes show on the Live Day within a minute.";
   - validação 5–240 (mesma mensagem);
   - "Save" → `PUT /v1/platform-settings/liveDayAlerts` com `{ delayMinutes, notStartedMinutes }` → "Settings saved.";
   - as outras seções (Field events, Route planning) continuam iguais.
7. axe: 0 violações na aba "Locked time", na seção do drawer e na seção de settings.
8. **Caminho para os limites (L-F05-14):**
   - `LiveDayInspectorDetail.test.tsx` (acréscimo): a visão de Jane tem `<Link>` "Open inspector" com `href="/inspectors?open=<id de Jane>"` e o texto "Alert limits for this inspector are set in their profile";
   - `InspectorListPage.test.tsx` (acréscimo): rota `/inspectors?open=<id>` → o `InspectorDetailDrawer` abre com esse `inspectorId`; fechar o drawer remove `open` da URL com `replace`; `?open=<uuid inexistente>` (GET 404) → o drawer mostra "This inspector no longer exists." (estado novo: hoje o drawer só trata `isLoading`, verificado no snapshot), sem erro de console; `?open=abc` (não uuid) → ignorado, sem drawer;
   - os testes atuais do `InspectorListPage` (abrir pelo clique na linha) continuam verdes.

### Escopo / Passos

1. `features/live-day/hooks/useLockedTime.ts` e `components/LockedTimeSection.tsx` (+ testes). Acrescentar o `TabsNav` em `LiveDayPanel.tsx` (parâmetro de URL `tab=locked`, `replace`).
2. `features/inspectors/hooks/useInspectorAlertThresholds.ts` (GET + PUT com invalidação) e `components/InspectorAlertThresholdsSection.tsx`, renderizada em `InspectorDetailSections` quando `isAmOp`. O `InspectorFormDrawer`/`useInspectorSave` não mudam.
3. `features/platform-settings/`: seção "Live Day alerts" usando `usePlatformSetting('liveDayAlerts')`, no padrão das seções existentes.
3b. **Caminho para os limites (L-F05-14):** `InspectorListPage` lê `?open=<uuid>` (`useSearchParams`) e inicializa `selectedId`/`drawerOpen` a partir dele; fechar o drawer apaga o parâmetro com `replace`. Em `features/live-day/components/LiveDayInspectorDetail.tsx`, link "Open inspector" (mesma aba) abaixo do `<h2>`, com o texto de ajuda. O botão voltar do navegador retorna ao Live Day com `?date&inspector` (a URL restaura a seleção).
3c. **"Locked time"** usa `data.today` (L-F05-09) e a célula de região com o sufixo da agência (L-F05-13).
4. **Docs (regra X00):** `apps/web/CLAUDE.md`: "Locked time" vive no Live Day (não no `/analytics`); a definição de "exige confirmação"; os limites seguem a regra "padrão + override por campo".
5. **Gates:** `pnpm --filter web typecheck lint test`; QA no navegador: mudar o padrão para 15 e ver o alerta de atraso aparecer no Live Day no próximo poll; override de um inspetor para 40 e ver o alerta dele sumir; conferir a aba "Locked time" com os 3 períodos.

### Modelo de dados / Contratos / UI / Algoritmo

**Contratos consumidos:**
- `GET /v1/dashboard/locked-time?from&to` (TASK-F05-1);
- `GET/PUT /v1/inspectors/:id/alert-thresholds` (TASK-F05-1);
- `GET/PUT /v1/platform-settings/liveDayAlerts` (F03, chave da TASK-F05-1).

**UI · aba "Locked time"** (no painel, largura 360–720 px)
- `<h2>` "Locked time" + ajuda (Tooltip): "Locked = the tenant confirmed. Counts routine inspections that need the tenant to confirm (no key, confirmation required). Grouped by the service group's region, or by the region the property falls in."
- Linha de controle: `SelectInput` "Period" (7/14/30, sempre a partir de `data.today`, L-F05-09) + subtítulo com o intervalo ("5 Nov – 18 Nov", formatado `d MMM`, sem fuso, porque são datas civis).
- Tabela "By region": célula "Region" = "{regionName} · {agencyName}" ou "{regionName} · Platform" para região global; "No region" sem sufixo (L-F05-13).
- Resumo: "Overall: 66.7% locked (2 of 3)" + meter.
- 2 tabelas compactas (`DataTable`, densidade compacta): `Agency | Locked | Confirmed / Required` e `Region | Locked | Confirmed / Required`. A célula "Locked" tem barra + texto "66.7%".
- Estados: loading (skeleton), vazio, erro (textos do teste 2).

**UI · seção "Live Day alerts" no drawer** (aba "Details", depois das seções existentes; só AM/OP)
- Leitura: 2 `DetailRow` ("Delay alert after", "Not-started alert after") com o valor e "(platform default)" ou "(custom)"; botão "Edit".
- Edição: 2 `TextInput type="number"` com rótulos "Delay alert after (min)" e "Not-started alert after (min)", cada um com a caixa "Use platform default ({n} min)"; "Save" (primário) e "Cancel".
- Texto de ajuda: "Live Day flags this inspector when they're later than this. Leave on the platform default unless this inspector needs a different limit."

**UI · seção "Live Day alerts" em "Platform settings"**
- 2 campos numéricos (5–240), ajuda (teste 6) e "Save" no padrão da página. "Último vence" (F03 D18).

### Casos de borda

1. **Período com `required 0`** em uma agência: a agência não aparece (a consulta agrupa só o que existe). Com `required 0` geral: EmptyState.
2. **Agência com nome longo:** truncar com `title` e o nome completo em `aria-label`.
3. **Override igual ao padrão** (15 com padrão 15): grava como custom e mostra "(custom)". Mudar o padrão depois não afeta esse inspetor (comportamento esperado do override).
4. **Override de um campo só:** o outro continua "(platform default)" e acompanha mudanças do padrão.
5. **Os dois campos em "Use platform default":** `PUT { null, null }` → coluna `NULL`.
6. **Padrão alterado com o Live Day aberto:** o cache do `PlatformSetting` (30 s) + o poll (30 s) fazem o novo valor aparecer em até ~60 s (texto da ajuda).
7. **Drawer aberto por CL_ADMIN:** a seção não renderiza e o hook fica `enabled: false` (sem 403 no console).
8. **Inspetor deletado entre abrir e salvar:** 404 → "This inspector no longer exists." no formulário.
9. **Aba "Inspectors" em outra data:** "Locked time" continua "Next N days" a partir de hoje (L-F05-09).
10. **Duas regiões com o mesmo nome** em agências diferentes: duas linhas distinguidas pelo sufixo da agência (L-F05-13).
11. **"Open inspector" para inspetor deletado/inativo:** o `?open=` abre o drawer com "This inspector no longer exists." (404) ou com o inspetor inativo normalmente; CL não chega aqui (Live Day é só AM/OP) (L-F05-14).

### Fora do escopo

- Histórico ou tendência do "Locked time", exportação, gráfico.
- Período livre (from/to arbitrário). O endpoint aceita, mas a UI só oferece 7/14/30.
- Limites para outros tipos de alerta (os dirigidos por evento não têm limite; geofence e lembrete são da F03).
- Qualquer mudança no `/analytics` ou no `ConfirmationMeter`.

### Critérios de aceite

- 01.13 visível no Live Day, por agência e por região (com a agência dona da região), com a definição exata da TASK-F05-1 e o padrão de 14 dias a partir de hoje (L-F05-09, L-F05-13).
- Da visão do inspetor no Live Day, "Open inspector" abre o drawer dele em `/inspectors?open=<id>` (L-F05-14).
- "Configuração de limites de alerta por inspetor": o padrão é editável em "Platform settings", o override no drawer do inspetor, e o Live Day reflete a mudança no próximo ciclo (**01.A5** ponta a ponta no QA).
- AM/OP só; 0 violações axe; tudo por teclado.

### Dependências

- TASK-F05-1 (endpoints, chave `liveDayAlerts`).
- TASK-F05-2 (`LiveDayPanel`).
- TASK-F03-4 (página "Platform settings").
- F01-2/F01-x (seções do drawer, se mexerem no mesmo arquivo: rebase simples).

### Riscos e armadilhas

- **Conflito no `InspectorDetailSections`** com tarefas da F01/F07 que também acrescentam seções: rebase antes do PR (memória "rebase long lived"). O mesmo vale para o `InspectorListPage` (a F01 mexe nos filtros da página; o `?open=` é aditivo).
- **`SelectInput` com escopo de opções** (memória "SelectInput"): usar o padrão atual do componente.
- **Invalidação:** sem invalidar `['live-day']`, o alerta só muda depois do próximo poll + cache. Isso é aceitável, mas a invalidação mantém a UX imediata para quem editou.

### Deploy / rollout / rollback

- **Deploy:** só front. Sem migration.
- **Rollout:** smoke em staging com AM: aba "Locked time" com os 3 períodos (também com a aba "Inspectors" em ontem); editar o padrão e um override e ver o efeito no Live Day; "Open inspector" abrindo o drawer e o voltar do navegador retornando ao Live Day com a seleção.
- **Rollback:** reverter o PR. Os overrides já gravados continuam valendo no cálculo do backend; para limpar, usar `PUT { null, null }` pela API.

### Dias · Branch · Verificação

- **Dias:** 1,25 (Locked time 0,5 + limites 0,5 + lacunas 0,25: deep-link `?open=` do drawer e link "Open inspector", L-F05-14). L-F05-09 e L-F05-13 sem dia extra.
- **Branch:** `feat/f05-locked-time-thresholds-web` a partir de `develop` (depois da F05-2), em worktree. ~18 arquivos.
- **Verificação:** `pnpm --filter web typecheck lint test`; QA no navegador; `git diff --stat origin/develop... | tail -1` < 150.

---

## Contratos exportados

Consumidores possíveis: F07 (índice de confiabilidade), F09 (densidade), F06 (avisos ao inquilino).

1. **Paleta por inspetor (shared):** `INSPECTOR_ROUTE_PALETTE`, `inspectorRouteColorIndex(id)` e `inspectorRouteColor(id) → { mapbox, hex, index }` em `packages/shared/src/live-day/inspector-route-color.ts`. Toda tela que precise da cor de um inspetor usa esta função, para a cor ser a mesma em todo o produto.
2. **`components/map/RouteLayer.tsx` (web):** primeira camada de linha do web. Recebe um FeatureCollection no shape do `dayPlanGeometrySchema`, a cor em HSL com vírgula, `emphasis`, pontos opcionais, `onClick` e `label` (tooltip de hover, L-F05-12). Traça sólido e tracejado por `properties.approximate`.
3. **`MapMarker`:** props opcionais `headColor`, `outlineColor`, `innerText` e `innerIcon`. `computeMarkerOffsets` passa a ser exportado de `components/map`. `MapScreenLayout` ganha `storageKey?` e o modo mobile recolhível abaixo de `md` (L-F05-04).
4. **Endpoints (AM/OP):**
   - `GET /v1/dashboard/live-day?date=&includeGeometry=none|selected|all&inspectorId=` → `liveDayResponseSchema` (com `today`; `all` limitado a 60 inspetores, L-F05-05/06);
   - `GET /v1/dashboard/locked-time?from&to` → `lockedTimeResponseSchema` (`byRegion[].agencyName`, L-F05-13);
   - `GET/PUT /v1/inspectors/:id/alert-thresholds` → `inspectorAlertThresholdsResponseSchema`.
5. **Domínio puro (backend `modules/live-day/domain/`):** `resolvePlanFreshness` (STALE pela impressão da F04), `filterT1Visible` (mesmo conjunto da F04, L-F05-03), `toEtaPlanInput`/`toEtaRealEvents` (entrada do `projectStopEta` da F06-1, L-F05-10), `deriveInspectorState`, `deriveStopProgress`, `resolveLastKnownPoint`, `computeAccumulatedDelay`, `deriveAlerts`, `resolveEffectiveThresholds`, `simplifyRouteGeometry`, `buildRouteFallback`. A F07 pode reusar `computeAccumulatedDelay` como base de pontualidade se quiser a mesma definição de "atraso".
6. **Configuração:** constantes `LIVE_DAY_SHOW_ALL_MAX = 40` e `LIVE_DAY_GEOMETRY_ALL_MAX_INSPECTORS = 60` (shared, L-F05-06); chave `liveDayAlerts` no `PLATFORM_SETTINGS_REGISTRY` (`delayMinutes`, `notStartedMinutes`) e `inspectors.alert_overrides_json` (override por campo).
7. **Fórmula do 01.13** (D21): denominador = appointments que exigem confirmação (`ROUTINE` + `requires_rental_tenant_confirmation` + sem chave) em `AWAITING_INSPECTOR/SCHEDULED/DONE` **mais** os `REJECTED` com `TENANT_NO_RESPONSE`/`TENANT_DECLINED`; numerador = os não rejeitados com `CONFIRMED`. Implementada em SQL na porta `ILiveDayReadRepository.getLockedTime`, com a região resolvida por grupo e, na falta dele, por `ST_Intersects` com o menor `region_number`.

## Achados para revisão

Fechados na revisão de 2026-10-28: inspetores com trabalho e sem plano **entram** (D19); horários restantes pelo `projectStopEta` da F06-1 (D7); denominador do 01.13 com os rejeitados pelo inquilino (D21); payload do poll com geometria sob demanda (D18); `out_of_window` vira alerta (D20).

1. **3 PRs em vez de 2.** O plano previa backend + web. O web foi dividido (Live Day 5,75 + Locked time/limites 1,25, depois das lacunas) para ficar revisável. A divisão não mudou dias.
2. **Caminho do `projectStopEta`.** A decisão do coordenador (2026-10-28) põe o módulo único em `packages/shared/src/route-planning/`. Conferido em 2026-10-29: o `F06-tarefas.md` já exporta `packages/shared/src/route-planning/project-stop-eta.ts` com `EtaPlanInput`/`EtaPlanStop`/`EtaRealEvents`/`ProjectedStop`; a F05 foi alinhada a esses nomes (L-F05-10).
3. **01.A5 cita 5 tipos; a F05 entrega 7.** São os 5 do critério + o lembrete de conclusão (01.11 no plano) + o `OUT_OF_WINDOW` (D20). Ajustar o texto do critério na homologação, se necessário.
4. **Colisão de cores.** Com hash estável e 12 tons, dois inspetores podem ter a mesma cor (certo acima de 12). Aceito, porque o nome está sempre ao lado. Uma alocação por dia evitaria colisões, mas quebraria a "cor estável" da decisão.
5. **Estimativa 8,5 → 9,75 (+1,25).** Deltas na tabela do cabeçalho: STALE pela impressão (+0,25), adaptador do `projectStopEta` (+0,25), `includeGeometry` com teste de tamanho (+0,25), teste HTTP do 01.A4 (+0,25) e modo de geometria no web (+0,25). Atualizar o total do README (de 107,5 para 108,75).
6. **Lacunas de 2026-10-29: 9,75 → 12,25 (+2,5).** Todas as recomendações de `lacunas/F05-lacunas.md` aplicadas (14 lacunas; tabela no cabeçalho). Atualizar a linha da F05 no README (9,75 → 12,25) e o total de desenvolvimento (+2,5).

## Ajustes necessários em outras tarefas (para reconciliar)

- (resolvido 2026-10-29) `tarefas/F04-tarefas.md` — o alerta `route_infeasible` pedido pela F04 virou indicador "Route infeasible" na linha do inspetor (`routeFeasible`/`routeViolations`); D20 mantém 7 tipos e o 01.A5 não muda — (L-F04-05).
- `README.md` — linha da F05 de 9,75 para 12,25 e "Total de desenvolvimento" +2,5 — estimativa das lacunas (L-F05-01, -02, -03, -04, -05, -06, -07, -08, -14).
- (encaminhado) `F05-dia-ao-vivo.md` (plano) — registrar: alertas sem reconhecimento com regra de saída por tipo, dias passados sem projeção, filtro T-1 em tudo, teto de 40/60 rotas, `MapScreenLayout` com modo mobile, "Locked time" ancorado em hoje, e a estimativa 12,25 — (L-F05-01, -02, -03, -04, -06, -09).
- `tarefas/F06-tarefas.md` — o adaptador `etaPlanInputFromDayPlanResponse` cita "F05/PWA" como consumidores; a F05 monta `EtaPlanInput` das linhas brutas (`toEtaPlanInput`), então o consumidor do adaptador fica só o PWA — (L-F05-10).
- `tarefas/F04-tarefas.md` — listar nos contratos exportados o **predicado puro** do `T1VisibilityService` (e `computeDayPlanFingerprint`), já que a F05 passa a aplicar o filtro T-1 a paradas, total, alertas e roster, não só à impressão — (L-F05-03).
- `tarefas/F01-tarefas.md` — a F05-3 acrescenta `?open=<id>` ao `InspectorListPage` (abre o drawer pela URL) e um estado "This inspector no longer exists." no `InspectorDetailDrawer`; a F01 mexe na mesma página/drawer (filtros e seções), então rebase/ordem de merge — (L-F05-14).
