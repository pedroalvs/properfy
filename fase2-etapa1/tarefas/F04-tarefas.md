# F04 · Tarefas (cada tarefa = 1 PR = 1 spec): Parte A (backend + web admin) e Parte B (PWA)

| | |
|---|---|
| **Feature** | F04 · Plano do dia e roteiro (contrato 00.1, 00.2, 00.5, 01.1–01.7, 01.14; critérios **00.A1**, **01.A1**, **01.A2**, **01.A3**, **01.A6**, **00.A5**, parte do **00.A2**) |
| **Partes** | **Parte A** (backend + shared + web admin): TASK-F04-1 (PR1), TASK-F04-2 (PR2), TASK-F04-5 (PR5). **Parte B** (PWA: navegação, Tela do Dia, base do dia, tour, mapa, reordenação): TASK-F04-3 (PR3), TASK-F04-3b (PR3b), TASK-F04-4 (PR4); consome a seção "Contratos exportados" e fica no fim do arquivo. |
| **Total da F04** | Parte A **16,5** (revisão 2026-10-28: 14,75; +1,5 das lacunas L-F04-01..16 aplicadas em 2026-10-29; +0,25 da reconciliação com outras tarefas em 2026-10-29, assinante de `INSPECTOR_EVENTS.BASE_CHANGED` da F01; itens do plano: 9,75; inclui +0,5 transferido da Parte B e +0,25 do `onboarding_completed_at` vindo da 3b) + Parte B **9,25** (revisão 2026-10-28: 9,0; +0,25 das lacunas em 2026-10-29; itens do plano: 9,25; −0,5 transferido para a Parte A; +0,25 E2E do tour). **F04 = 25,75 dias** (antes 25,5; 23,75 na revisão de 2026-10-28; plano: 19,0) |
| **Depende de** | X02 (geocodificação permanente, `geocodeWithTimeout`, `formatGeocodingQuery`); F01 (`base_lat`/`base_lng`, `inspectorBaseAddressSchema`, `INSPECTOR_EVENTS.BASE_CHANGED`, `recordAppState()` em `$executeRaw`); F02 (`PublishSystemInspectorNoticeUseCase`, tipos `ROUTE_PUBLISHED`/`ROUTE_CHANGED`); F03 (`PlatformSetting`, `IPlatformSettingsReader`, `INSPECTOR_FIELD_EVENTS.RECORDED`, `abandoned_at`, página "Platform settings") |
| **Bloqueia** | (Parte A →) Parte B da F04 (TASK-F04-3/3b/4); F05 (Dia ao Vivo: plano, traçado, métrica), F06 (horário previsto por parada), F07 |
| **Código verificado em** | `origin/develop` @ `042a9674` (snapshot read-only, 2026-10-27) |
| **Decisões** | Todas de **2026-10-27** (`F04-plano-do-dia-roteiro.md`, `decisoes.md`): Q8, Q9, Q14, Q19, reordenação "só avisa", provedor Mapbox + otimizador próprio, saída medida para o Google, duração no tipo de serviço, base do dia / sem base (F01), navegação Today/Schedule/Offers/More, tour do app (00.2). Parte B: D1–D14 + DB1–DB9. **Lacunas L-F04-01..16 aplicadas em 2026-10-29** (recomendações aceitas; ver "Decisões aplicáveis" de cada tarefa e a seção final "Ajustes necessários em outras tarefas"). **Reconciliação com F01, F02, F03, F05, F08, X00, X02 e X03 em 2026-10-29** (blocos "Reconciliação 2026-10-29" nas tarefas afetadas) |

**Estimativa: Parte A 9,75 → 14,75 (revisão de 2026-10-28, números realistas por passo); Parte B 9,25 → 9,0; F04 = 23,75 dias (plano 19,0).** O escopo não foi cortado e não há folga embutida.

| Tarefa | Itens do plano | Plano | Agora | Delta e motivo |
|---|---|---|---|---|
| TASK-F04-1 (PR1) | B5 backend 0,25 (de 0,5) + 01.1a 2,0 + 01.1b 2,5 (01.2/01.A3 incluso) | 4,75 | **5,75** | **+0,5 limitador Mapbox compartilhado no Postgres** (2 máquinas Fly, workers no processo da API); **+0,25 folga para frente** no avaliador (sem espera fantasma); **+0,25 lacunas 2026-10-29** (kill switch `DAY_PLAN_ROUTING_PROVIDER` + contador de falhas por código, L-F04-09; trecho de pontos idênticos sem Directions, L-F04-13; teste de grupos intercalados, L-F04-11; consulta Mapbox com plano B, L-F04-03, sem custo de código). |
| TASK-F04-2 (PR2) | B4 2,5 + 01.7 1,5 + 01.14 backend 0,25 (de 0,5) + Medição 0,25 | 4,5 | **9,5** | **+0,25 reconciliação 2026-10-29** (assinante de `INSPECTOR_EVENTS.BASE_CHANGED` da F01 com `stale_reason 'BASE_CHANGED'` e `markStaleByInspector`, L-F01-03). **+1,25 lacunas 2026-10-29** (STALE sem mudança não chama o roteamento, L-F04-01; `published_at` manda e auto-publicação com janela no fuso do inspetor e da plataforma, L-F04-02; join de leitura com filtro de status, L-F04-04; plano inviável sinalizado, L-F04-05; `ROUTE_CHANGED` agregado por 10 min e só com mudança efetiva, L-F04-06; `LAST_STOP` + 422 `DAY_PLAN_ALREADY_STARTED`, L-F04-07; regra do contato principal com `role`, L-F04-08; observabilidade de falha persistente, L-F04-09; folha auditada, limite de 30 dias, fusos rotulados, L-F04-10; rate limits AM/OP e faixa de datas do preview, L-F04-14; log `day_plan.computed` enriquecido, L-F04-15; `classifyStops`/impressão exportados do domínio, L-F04-16). Revisão de 2026-10-28 (8,0): **+0,5 transferido da Parte B** (endpoints `PUT …/order` e `PUT/DELETE …/origin`; "Base do dia" e 01.3 da Parte B perdem 0,25 cada). **+0,25 `onboarding_completed_at`** (fatia de backend movida da TASK-F04-3b). **+2,75 B4 subcusteado** (tabela passo a passo na tarefa): estado de execução na impressão + `executed` vivo 0,25, ETA publicada congelada 0,25, job singleton sequencial com orçamento e continuação 0,5, expurgo 0,25, E2E/integração 0,5, leitor/cálculo/API além do que o plano custeava 1,5; −0,25 sem mudar o `TenantCronTick`; −0,25 sem evento `day_plan.computed` (substituído pela leitura fresca, já contada). |
| TASK-F04-5 (PR5) | B5 web 0,25 + 01.14 web 0,25 | 0,5 | **1,25** | **+0,25** mudança de contrato no backend (o `.default(45)` sai do schema que a rota valida, com testes de backend); **+0,5** preview de pesos (seletor, data, 2 colunas, estados, e2e) não custeado. |
| **Subtotal Parte A** | | **9,75** | **16,5** | +6,75 (0,75 transferido da Parte B + 4,25 de custo real na revisão de 2026-10-28 + 1,5 das lacunas de 2026-10-29 + 0,25 da reconciliação de 2026-10-29) |
| TASK-F04-3 (PR3) | 00.1/00.5 2,5 + Base do dia 0,75 + 01.5 0,25 + 01.6 0,25 | 3,75 | **3,75** | **−0,25 base do dia** (endpoint `PUT/DELETE …/origin` custeado na TASK-F04-2); **+0,25 lacunas 2026-10-29** (`OriginRow` sem lápis em `LAST_STOP` + erro 422 `DAY_PLAN_ALREADY_STARTED`, L-F04-07; "Call {name} ({role})", L-F04-08; texto do card de amanhã/`published_at`, L-F04-02) |
| TASK-F04-3b (PR3b) | 00.2 tour 2,0 | 2,0 | **2,25** | −0,25 (fatia de backend do `onboarding_completed_at` movida para a TASK-F04-2) +0,5 (specs Playwright E2E do tour para o 00.A1, decisão de 2026-10-28; depende da X03) |
| TASK-F04-4 (PR4) | 01.4 1,5 + 01.3 2,0 | 3,5 | **3,25** | **−0,25 01.3** (endpoint `PUT …/order` custeado na TASK-F04-2) |
| **Subtotal Parte B** | | **9,25** | **9,25** | −0,5 transferido para a Parte A; +0,25 líquido na 3b; +0,25 lacunas na F04-3 (2026-10-29). L-F04-12 (textos/contagens do tour) e L-F04-13 (pins idênticos na F04-4) cabem nas estimativas existentes |
| **Total F04** | | **19,0** | **25,75** | +6,75: custo real que o plano não tinha (limitador compartilhado, folga para frente, B4 subcusteado, preview de pesos, E2E do tour) + 1,75 das lacunas L-F04-01..16 (2026-10-29) + 0,25 da reconciliação com outras tarefas (2026-10-29, `BASE_CHANGED`) |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F04-1 | Backend + shared de domínio: `ServiceType.default_duration_minutes` (backfill), porta `IRoutingService` (Mapbox Matrix/Directions, stub haversine, `DynamicRoutingService`), otimizador puro no shared (com folga para frente), limitador Mapbox compartilhado no Postgres, `PlanRouteService`, kill switch do provedor | 5,75 | **TASK-F03-2** (o backfill lê `inspection_executions.abandoned_at`); X02 só como padrão de provedor |
| TASK-F04-2 | Backend + shared: `DayPlan`/`DayPlanStop`, publicação às 19:30 locais (job singleton), STALE, recálculo, API do inspetor e AM/OP, base do dia, folha PDF/XLSX, pesos da rota + preview, métrica "Route ETA accuracy" (ETA publicada), leitura fresca para a F06, expurgo diário, `onboarding_completed_at`, STALE por troca de base (`BASE_CHANGED`) | 9,5 | TASK-F04-1; F01-1; F02-1; F03-1; F03-2 |
| TASK-F04-5 | Shared + backend + web admin: "Estimated duration (min)" obrigatório (contrato da API + `ServiceTypeFormDrawer`) e seção "Route planning" (pesos + preview) em "Platform settings" | 1,25 | TASK-F04-1, TASK-F04-2, F03-4 |
| TASK-F04-3 | PWA: barra Today/Schedule/Offers/More (a aba More aponta para as rotas `/profile` que já existem, sem renomear), Tela do Dia (`/today`), Route em lista, base do dia, card da parada (01.5), Navigate Apple/Google (01.6), allowlist da F02 + `targetPath '/today'`, cache offline do plano | 3,75 | TASK-F04-2; F01-3; F02-3; F03-3 |
| TASK-F04-3b | PWA: tour do app com coach marks + E2E Playwright (00.A1), passo de instalação, consome `onboarding_completed_at` (backend na F04-2), "Show app tour" em App settings | 2,25 | TASK-F04-3; **X03**; F01-1; **X03**; F01-3 |
| TASK-F04-4 | PWA: mapa do roteiro (pins, origem, traçado real; hooks generalizados em `src/lib/map/`) e reordenação (`@dnd-kit` + setas, recálculo local, "+N min vs. suggested", avisos de janela, salvar com conflito de versão) | 3,25 | TASK-F04-3; TASK-F04-1/2 |
| **Total** | | **25,75** | |

Ordem de merge: F04-1 → F04-2 → F04-3 → (F04-3b ∥ F04-4); F04-5 em paralelo à Parte B, logo após a F04-2 (Achado 13 da Parte A).

## Decisões que valem para as 3 tarefas

Datas: **2026-10-27** salvo indicação. Cada tarefa cita as que se aplicam.

- **D1 · Publicação (Q9).** Automática às **19:30 locais da véspera**, depois do corte T-1 (`appointment.reject-unconfirmed`, 19:00 local via tick por agência). Aviso crítico "Your route for tomorrow is ready" (push com fallback SMS, F02). A OP pode recalcular. Mudanças depois da publicação deixam o plano **STALE**, e ele é recalculado **ao abrir** (pelo inspetor).
- **D2 · Janelas rígidas (Q14).** Todas as janelas entram como restrição no otimizador; ele nunca muda uma janela. Às 19:30 só restam no D+1 appointments confirmados, com chave ou sem exigência de confirmação (lógica verificada no plano).
- **D3 · Reordenação "só avisa".** Uma ordem manual que estoura janela é aceita e salva, mesmo em parada confirmada; a resposta traz as violações. Os avisos ao inquilino (F06) seguem a ordem salva.
- **D4 · Provedor.** Mapbox **Matrix** (`driving-traffic` até 10 coordenadas, senão `driving`) **só para decidir a ordem**; Mapbox **Directions v5** com `depart_at` **por trecho** para os horários previstos finais e o traçado. Sem `depart_at` na Matrix (beta), sem Optimization API (v1 sem janelas, v2 beta). Tudo atrás de `IRoutingService`; o adaptador Google é a saída se o erro médio passar de 10 min (D9).
- **D5 · Otimizador próprio.** Busca exata para **≤ 8 paradas**; acima disso, **vizinho mais próximo viável + 2-opt**. Determinístico.
- **D6 · Duração por tipo de serviço.** `ServiceType.default_duration_minutes`, obrigatório, 5–480, backfill com 45 min ou a média medida.
- **D7 · Origem.** Base do inspetor (`base_lat/base_lng`, F01); troca **só para um dia** (`origin_override_*` no `DayPlan`, sem mexer na base do perfil). **Sem base**, o roteiro começa na 1ª janela, sem trecho de origem, com o aviso "No base address: route has no starting point" (decisão F01, D13).
- **D8 · Traçado e Mapbox.** O traçado vem do backend como GeoJSON; o token do servidor nunca vai ao PWA. `route_geometry` (e a matriz, ver Achado 4) só durante a vigência do plano, com expurgo diário. **Confirmar com a Mapbox antes do go-live.**
- **D9 · Medição.** "Route ETA accuracy" = erro médio absoluto do horário previsto da parada × `started_at` do check-in, descontando a espera de janela, nos últimos 30 dias. Gatilho: > 10 min → trocar para Google (decisão de produto; esta feature só mede).
- **D10 · Sem `tenant_id` em `DayPlan`/`DayPlanStop`.** Exceção explícita ao §7.1 do CLAUDE.md (precedentes: `Inspector`, `ServiceRegion` global, `IntegrationSetting`, `PlatformSetting`). O plano é do inspetor, que é cross-tenant. Ver "Escopo de tenant" na TASK-F04-2.
- **D11 · RBAC (plano).** INSP: ver e reordenar **o próprio** plano. AM/OP: ver, recalcular e exportar qualquer plano. CL_ADMIN/CL_USER: **não veem** (o plano cruza agências).
- **D12 · Telas de dashboard existentes não mudam** (regra do dev). Nenhuma tarefa toca `DashboardPage`, `AnalyticsPage`, `InspectorWorkloadPage` nem `prisma-dashboard-analytics.repository.ts` (a métrica é um endpoint novo; a F05 a exibe numa tela nova).
- **D13 · Timestamps de migration** são placeholders `YYYYMMDDhhmmss_nome`, regenerados na implementação (`prisma migrate dev --create-only`), sempre depois das migrations de X02/F01/F02/F03.
- **D14 · Tempo.** Instantes (`DateTime`, ISO-8601 no fio via `instantStr()`), datas civis (`@db.Date`, `civilDateStr()`), janelas = horário de parede **da agência** do appointment (`time_slot_start/end` `HH:mm` + `tenants.timezone ?? PLATFORM_TIMEZONE`), convertidas com `zonedWallTimeToUtc`. "Hoje" do inspetor = fuso efetivo dele (`users.timezone ?? PLATFORM_TIMEZONE`, mesmo critério do `get-inspector-schedule.use-case.ts`). O fuso do dispositivo nunca entra na lógica. **Confirmado pelo dev (2026-10-29):** a data civil do plano, a publicação das 19:30 e a janela de publicação seguem o **fuso do inspetor**, porque o plano é por inspetor e atravessa agências; as janelas de cada parada continuam no fuso da agência. A X00 emenda N13 com a exceção "Inspector day plans (DayPlan) use the inspector's timezone" (conflito com a X00 resolvido 2026-10-29). Plataforma Sydney-only hoje: na prática nada muda agora.
- **D15 · Recalcular pelo inspetor (dev, 2026-10-28).** O INSP mantém `POST /v1/inspector/day-plans/:date/recalculate` ("Reset to suggested").
- **D16 · Tokens Mapbox por ambiente (dev, 2026-10-28).** dev, staging e prod já têm tokens separados (config `mapbox` do Integrations Hub de cada ambiente). Os limites da Mapbox (Matrix `driving-traffic` 30/min, `driving` 60/min, Directions 300/min) valem **por token, portanto por ambiente**. O limitador compartilhado (TASK-F04-1) guarda o estado no Postgres do próprio ambiente, que é a mesma fronteira.
- **D17 · Várias instâncias.** Os workers do pg-boss rodam no mesmo processo da API (`apps/backend/src/main/server.ts:104-106`, `ENABLE_JOB_QUEUE`), e o Fly sobe uma 2ª máquina sob carga (`fly.production.toml:27-34`, `min_machines_running = 1`, `soft_limit 80`). Nada de estado de limite por processo: o limitador de chamadas Mapbox é **compartilhado no Postgres**, e o job de publicação é **singleton** no pg-boss.
- **D18 · Executada = iniciada.** Uma parada é **executada** quando o appointment está DONE ou tem execução com `started_at` e sem `abandoned_at` (F03). Executadas formam o prefixo fixo; **reordenáveis = não iniciadas**. A mesma regra vale no `GET`, no `PUT /order`, na impressão digital e no PWA.

---

## TASK-F04-1 · Backend + shared de domínio: duração por tipo de serviço, porta de roteamento (Mapbox + stub + Dynamic) e otimizador puro

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F03-2
> - **Dependência parcial:** TASK-X02-1: só como padrão de provedor (DynamicProvider); não bloqueia.
> - **Desbloqueia:** TASK-F04-2, TASK-F04-5, TASK-F06-1, TASK-F07-1
> - **Pode rodar em paralelo com:** TASK-F01-3, TASK-F02-1, TASK-F03-3, TASK-F03-4, TASK-F09-1, TASK-F09-2, TASK-F02-2, TASK-F02-3
> - **Pista sugerida (time de 6):** A + A2 · Backend crítico **em par** · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Tornar a duração da inspeção um dado do tipo de serviço (`default_duration_minutes`, obrigatório no banco, com backfill).
- Criar a porta `IRoutingService` com o adaptador Mapbox (Matrix só para ordem; Directions com `depart_at` por trecho), o stub haversine e o `DynamicRoutingService` que reusa a config `mapbox` do Integrations Hub.
- Entregar o otimizador **puro** (sem I/O) no `packages/shared`, reusável pelo backend e pelo PWA (o recálculo local da reordenação na Parte B usa o mesmo avaliador).
- Entregar o orquestrador `PlanRouteService` (matriz → otimização → passada final de Directions → traçado), com fallback para o stub e a flag "Approximate route".
- Nada é exposto em rota HTTP nova nesta tarefa (exceto o campo de duração nas rotas de tipo de serviço). A tarefa é "dark": a TASK-F04-2 é quem usa.

### Contexto no código
- **Tipo de serviço:** `apps/backend/prisma/schema.prisma:421-440` (`model ServiceType`, sem duração; `@@index([status])`; unicidade case-insensitive de nome só na migration). Módulo `apps/backend/src/modules/service-type/`: `domain/service-type.entity.ts`, `domain/service-type.repository.ts`, `infrastructure/prisma-service-type.repository.ts`, `application/use-cases/{create,update,get,list}-service-type.use-case.ts`, `interfaces/service-type.routes.ts` (POST/GET/GET:id/PATCH com `successResponseSchema(serviceTypeResponseSchema)`). Criação só **AM** (`create-service-type.use-case.ts:36`, `ForbiddenError('AUTH_FORBIDDEN')`).
- **Schemas shared:** `packages/shared/src/schemas/service-type.ts` (`createServiceTypeSchema`, `updateServiceTypeSchema`), `packages/shared/src/schemas/responses.ts:214` (`serviceTypeResponseSchema`). `api-types.ts` vive em `packages/shared/src/api-types.ts`, gerado por `pnpm generate:api` (raiz: `generate:openapi` no backend + `generate:types` no shared).
- **Média medida:** `apps/backend/src/modules/dashboard/infrastructure/prisma-dashboard-analytics.repository.ts:157,201,237-245` (`buildAvgExecution`: `finished_at − started_at` em minutos, descarta negativos). **Não alterar** (D12); o backfill usa a mesma fonte (`inspection_executions`) em SQL próprio.
- **Inserções diretas em `service_types`** (seed e ~15 testes de integração em `apps/backend/tests/integration/**`, `src/scripts/seed-perf-027.ts`): por isso a coluna nasce com `DEFAULT 45` no banco.
- **Padrão de provedor:** `apps/backend/src/modules/integration/infrastructure/dynamic-providers.ts:131-153` (`DynamicGeocodingService`: `resolver.getConfig('mapbox')` → stub se nulo; recria o serviço só quando o `accessToken` muda). Wiring em `apps/backend/src/main/container.ts:642,660` (`IntegrationConfigResolver`, `new DynamicGeocodingService(integrationConfigResolver)`). Config `mapbox: ['accessToken']` em `modules/integration/domain/integration-setting.ts:44`.
- **Adaptador Mapbox existente:** `modules/property/infrastructure/mapbox-geocoding.service.ts` (fetch + `CircuitBreaker` de `shared/infrastructure/circuit-breaker.ts`, `failureThreshold: 5`, `resetTimeoutMs: 60000`; o token vai na query e a mensagem de erro só carrega o status).
- **Métricas:** `apps/backend/src/shared/infrastructure/metrics.ts` (`MetricsCollector` com contadores próprios; `metrics` singleton).
- **Fuso:** `packages/shared/src/utils/timezone-date.ts:43` (`zonedWallTimeToUtc(dateStr, timeStr, timezone)`, DST-safe por duas sondagens).
- **Carga diária:** limites de 3/4 paradas (`inspector-workload.ts:19-20`) → a busca exata cobre o caso real.

### Decisões aplicáveis
D2, D4, D5, D6, D7, D8, D13, D14 (2026-10-27); D16, D17 (2026-10-28).

Lacunas aplicadas em **2026-10-29** (todas as recomendações aceitas pelo dev):
- **L-F04-03 · Consulta Mapbox (D8) com dono, prazo e plano B.** O desenho atual fica (`routingInput` com a matriz crua no `GET`, `routing_matrix_json`/`leg_travel_json` gravados). Ação "Consulta Mapbox" registrada **nesta tarefa** (a primeira a sair): **responsável** = dev líder da F04 (Pedro Alves), **data-limite** = início da TASK-F04-2; perguntas (a) guardar traçado/resultados de Directions na vigência do plano, (b) guardar a matriz/durações, (c) repassar a matriz crua ao cliente final. **Plano B já desenhado:** se (c) for negado, `routingInput` sai do contrato e a reordenação usa `POST /v1/inspector/day-plans/:date/order/preview` (avaliação no servidor com a matriz gravada, sem Directions, `etaSource 'MATRIX'`, 30/min); se (b) for negado, `routing_matrix_json`/`leg_travel_json` não são gravados e `PUT /order`/`PRESERVE_ORDER` chamam a Matrix de novo (+1 Matrix por salvamento). A TASK-F04-4 recebe a variante escolhida antes de começar. Resposta registrada no PR da TASK-F04-2 e em `decisoes.md`.
- **L-F04-09 · Falha persistente do provedor.** (a) `metrics` ganha `routingProviderFailuresByCode` (por `code` do `RoutingProviderError`); (c) env **`DAY_PLAN_ROUTING_PROVIDER=mapbox|stub`** (padrão `mapbox`) como kill switch explícito do provedor: `stub` faz o `DynamicRoutingService` usar sempre o `StubRoutingService` (planos com `approximate true`, `approximateReason 'NO_PROVIDER'`) sem desligar o job. O item (b) (nível de log do `publish_completed`) e o contador `dayPlansApproximateTotal` ficam na TASK-F04-2. A guarda da cota mensal fica fora (medição na homologação).
- **L-F04-11 · Grupos de serviço não são restrição.** Paradas do mesmo `ServiceGroup` podem ser intercaladas com outras (de outro grupo ou de outra agência); a janela é **sempre** `appointments.time_slot_start/end` do appointment; o `service_groups.time_window` (`schema.prisma:663`, `VarChar(11)`) é só de oferta e nunca entra no otimizador, mesmo que diverja. A ordem "por `appointment_number`" do marketplace não é a ordem do plano.
- **L-F04-13 · Pontos idênticos.** Na passada final, trecho com `haversineMeters(de, para) < 10 m` → `travelS 0`, `distanceM 0`, **sem** chamada Directions e **sem** feature na geometria (o trecho seguinte continua a numeração de `fromSequence/toSequence`); `approximate false` nesse trecho.

Reconciliação **2026-10-29** (X00):
- **N5 · Token só pelo Integrations Hub (L-X00-06).** `MapboxRoutingService` recebe o `accessToken` do `DynamicRoutingService`, que o resolve **a cada chamada** por `IntegrationConfigResolver.getConfig('mapbox')` (stub quando nulo). Nenhum adaptador de rota lê `MAPBOX_ACCESS_TOKEN` (ou `env`) direto; o env é só o default de bootstrap da config `mapbox` (`container.ts:652`).
- **Cláusula de transição de N5 (L-X00-04).** Este PR cria o `IRoutingService`, então remove "created by F04" da regra N5 em `apps/backend/CLAUDE.md` (§10 "Routing"). Item no checklist de verificação.

### Testes primeiro (TDD)

Todos os testes de tempo usam instantes UTC explícitos; nenhum depende do fuso da máquina (memória `feedback_tz_dependent_test_must_pin_away`: rodar a suíte também com `TZ=America/Los_Angeles`).

**A. Otimizador (shared, Vitest) — `packages/shared/src/route-planning/route-optimizer.test.ts`**

Convenção dos fixtures: `T0` = 08:00 local = `0` s (os testes do otimizador usam segundos relativos; o otimizador só exige inteiros). Duração padrão 45 min = 2700 s. Pesos padrão `{ travel: 1, windowWait: 1, baseProximity: 1 }`. Custo exibido em segundos ponderados (`costTenths / 10`). IDs `'A'`, `'B'`, `'C'`…

Matriz "linha" (Exemplos 1–3), simétrica, origem `O` e paradas colineares O–A–B–C:

| | O | A | B | C |
|---|---|---|---|---|
| O | 0 | 600 | 1200 | 1800 |
| A | 600 | 0 | 600 | 1200 |
| B | 1200 | 600 | 0 | 600 |
| C | 1800 | 1200 | 600 | 0 |

1. **Exemplo 1 · base mais próxima primeiro (01.A3 / 00.A5).** A, B, C com janela 08:00–17:00 (0–32400). Esperado: ordem `A, B, C`, `method: 'EXACT'`, `departureS = -600` (07:50); A chega 0, serviço 0–2700; B chega 3300 (08:55), 3300–6000; C chega 6600 (09:50), 6600–9300 (10:35). `totalTravelS 1800`, `totalWaitS 0`, `firstLegS 600`, custo **2400**, `feasible true`, `finishS 9300`. (Alternativas para conferência: `A,C,B` = 3000; `B,A,C` = 4200.)
2. **Exemplo 2 · janela CONFIRMED mais cedo vem primeiro (01.A3, exceção).** Igual ao 1, mas C com janela 08:00–08:30 (0–1800). Esperado: `C, B, A`; `departureS = -1800` (07:30); C 0–2700; B chega 3300; A chega 6600, fim 9300; travel 3000, custo **4800**. Qualquer ordem com C fora da 1ª posição tem C chegando ≥ 3300 > 1800 (atraso).
3. **Exemplo 3 · comportamento documentado (nem a mais próxima, nem a de janela mais cedo).** C com janela 08:00–09:00 (0–3600). Esperado: `B, C, A`; partida 07:40 (−1200); B 0–2700; C chega 3300 (≤ 3600); A chega 7200, fim 9900; travel 3000, `firstLegS 1200`, custo **4200** (contra `C,B,A` 4800). Este teste documenta o Achado 1.
4. **Exemplo 4 · sem base (D7).** Sem origem (`originIndex: null`). A 09:00–11:00 (3600–10800), B 08:00–10:00 (0–7200), C 08:00–17:00. Matriz só entre paradas (A–B 600, A–C 1200, B–C 600). Esperado: `C, B, A`, `departureS null`, C começa em 0 (1ª janela), B chega 3300, A chega 6600, fim 9300; travel 1200, custo **1200**. `A,B,C` também custa 1200, mas termina em 12900 → perde no desempate por término.
5. **Exemplo 5 · inviável.** A e B com janela 08:00–08:30 (0–1800); O–A 600, O–B 600, A–B 600. Esperado: `A, B` (empate total com `B,A`, desempate lexicográfico pela chave canônica `(windowStartS, key)`), `feasible false`, `violations [{ key: 'B', lateS: 1500 }]`, `totalLateS 1500`, custo 1800.
6. **Exemplo 6 · peso de espera muda a ordem (01.14), com folga para frente.** Matriz: O–A 600, O–B 1200, O–C 2400, A–B 600, A–C 1800, B–C 1800. A 08:00–08:30 (0–1800), B 10:00–10:30 (7200–9000), C 08:00–17:00; serviço 2700.
   - Pesos padrão → **`A, C, B`**: partida 07:50 (−600), A 0–2700, C chega 4500 (09:15), 4500–7200, B chega 9000 (10:30, no limite), 9000–11700; travel 4200, espera 0, `firstLegS 600`, custo **4800**.
   - `A, B, C` com pesos padrão: a folga para frente atrasa a partida em 1800 s (limite da janela de A): partida 08:20 (1200), A 1800–4500, B chega 5100, **espera 2100**, 7200–9900, C chega 11700, fim 14400; travel 3000, custo 3000 + 2100 + 600 = **5700**.
   - Pesos `{ travel: 1, windowWait: 0, baseProximity: 1 }` → **`A, B, C`** (custo 3600 contra 4800 de `A,C,B`), `totalWaitS 2100`, `finishS 14400`.
   - Ordens começando por B ou C atrasam A → inviáveis.
6b. **Exemplo 6b · peso da base muda a ordem.** Dados do Exemplo 3 (C 08:00–09:00). Pesos padrão → `B, C, A` (custo 4200). Pesos `{ travel: 1, windowWait: 1, baseProximity: 0 }` → `B,C,A` e `C,B,A` custam 3000 cada; desempate por término: `C,B,A` (9300) < `B,C,A` (9900) → **`C, B, A`**.
6c. **Folga para frente (sem espera fantasma).** Origem O–A 600, A–B 600; A 08:00–17:00, B 10:00–11:00; serviço 2700; ordem fixa `A, B`. Sem a folga, A seria às 08:00 e B esperaria 3900 s. Esperado com a folga: `departureS 3300` (08:55), A chega 3900 (09:05), 3900–6600, B chega 7200, **espera 0**, `totalWaitS 0`, `finishS 9900`. A folga nunca aumenta atraso: com A 08:00–08:30, a partida para em 1200 (A chega 1800) e B espera 2100.
7. **Exemplo 7 · heurística com 10 paradas.** S01…S10, todas 08:00–17:00, serviço 1800 s; `travel(Si,Sj) = 300·|i−j|`, `travel(O,Si) = 300·i`. Esperado: `S01…S10`, `method: 'HEURISTIC'`, chegada em S01 = 0, `finishS 20700` (13:45), travel 3000, custo 3300.
8. **Exemplo 8 · 2-opt corrige o guloso** (forçar `{ forceMethod: 'HEURISTIC' }`). Posições na reta (unidade = 600 s): P1 = +1, P2 = −1,5, P3 = +4; O = 0. Matriz: O–P1 600, O–P2 900, O–P3 2400, P1–P2 1500, P1–P3 1800, P2–P3 3300. Janelas 08:00–17:00, serviço 1800. Guloso = `P1,P2,P3` (custo 6000); resultado final = **`P2, P1, P3`** (custo **5100**), igual ao exato.
9. **Limite exato/heurístico:** 8 paradas → `EXACT`; 9 → `HEURISTIC` (`ROUTE_OPTIMIZER_EXACT_MAX_STOPS = 8`).
10. **Exato = força bruta:** 50 instâncias de 6 paradas geradas com PRNG semeado (seed fixa no teste; janelas e matrizes aleatórias inteiras) → a avaliação do `optimizeRoute` é igual (`compareEvaluations === 0`) ao mínimo por enumeração de todas as permutações.
11. **Heurística nunca pior que o guloso** nas mesmas 50 instâncias com 9–12 paradas.
11b. **Grupos não restringem (L-F04-11).** Exemplo 1 com A e C do grupo `G1` e B do grupo `G2` (o otimizador e o `PlanRouteStopInput` não têm campo de grupo; o teste documenta o cenário com os ids): esperado `A, B, C` (paradas de `G1` intercaladas com `G2`), custo **2400**, igual ao Exemplo 1. A janela vir de `time_slot_start/end` e nunca do `time_window` do grupo é testada no leitor da TASK-F04-2 (teste 3).
12. **Determinismo:** a mesma entrada com `stops` embaralhados (5 permutações) → saída idêntica (`toEqual`); duas execuções seguidas → idênticas.
13. **0 paradas:** `order []`, `departureS null`, `finishS null`, custo 0, `feasible true`, `method 'TRIVIAL'`. **1 parada com origem:** `departureS = windowStart − travel`. **1 parada sem origem:** chegada = `windowStart`.
14. **`earliestDepartureS` (plano de hoje):** Exemplo 1 com `earliestDepartureS = 1800` (08:30) → partida 1800, A chega 2400, sem espera, término 11700; `feasible true` (janela até 17:00). Com A 08:00–08:30 → A atrasa 600 (`violations [{A, 600}]`).
15. **Parada sem coordenada (`matrixIndex: null`):** Exemplo 1 com B sem coordenada → ordem avaliada `A,B,C`: B consome só tempo (travel 0); o trecho até C é `travel(A,C) = 1200`; `missingCoordinates` não afeta `feasible`.
16. **Pesos em décimos:** `{ travel: 0.3, windowWait: 0.1, baseProximity: 0 }` → `toWeightTenths` = `{3,1,0}`; custo inteiro; `0.30000000000000004` aceito e arredondado para 3.
17. **`evaluateSequence` com `legTravelS` (passada final):** Exemplo 1, ordem `A,B,C`, `legTravelS [660, 540, 600]` → partida −660 (07:49), A chega 0, B chega 3240 (08:54), C chega 6540 (09:49), fim 9240 (10:34), travel 1800.
18. **`insertIntoOrder` (preservar ordem manual):** matriz "linha", janelas 08:00–17:00, ordem base `[B, A]`, nova `C` → candidatas `C,B,A` 4800, `B,C,A` 4200, `B,A,C` 4200; empate em atraso, custo e término → **posição mais cedo** → `B, C, A`, `method 'INSERTION'`.
19. **`evaluateSequence` com ordem inválida** (chave repetida, faltando ou desconhecida) → lança `RouteOrderMismatchError` (`code 'ROUTE_ORDER_MISMATCH'`).
20. **Performance:** 24 paradas (heurística) < 200 ms; 8 paradas (exato) < 300 ms (medido com `performance.now()`, margem para CI).
21. **`haversineMeters`:** `(0,0)→(0,1)` = 111195 ± 1 m; mesmo ponto = 0.
22. **`selectMatrixProfile`:** 10 coordenadas → `'driving-traffic'`; 11 → `'driving'`; 25 → `'driving'`; 26 → `null` (excede, o chamador usa o stub).

**B. Duração do tipo de serviço**
23. `packages/shared/src/schemas/service-type.test.ts`: `createServiceTypeSchema` aceita `defaultDurationMinutes` 5, 45, 480; rejeita 4, 481, 45.5, `'45'`, `null`; **ausente → 45** (`.default(45)`, transitório até a TASK-F04-5). `updateServiceTypeSchema`: opcional, mesmos limites.
24. `create-service-type.use-case.test.ts`: persiste `defaultDurationMinutes`; audit `service_type.created` com `after.defaultDurationMinutes`.
25. `update-service-type.use-case.test.ts`: 45 → 60 grava e audita `before.defaultDurationMinutes 45`, `after 60`; sem o campo → não muda.
26. `service-type.routes.test.ts` (supertest): POST com 60 → 201 com `defaultDurationMinutes: 60`; POST com 3 → 400 `VALIDATION_ERROR`; GET/list trazem o campo; PATCH com 481 → 400.
27. **Backfill (suíte db)** `tests/integration/db/service-type-duration-backfill.integration.test.ts`: lê o `migration.sql` da migration nova, extrai o bloco entre `-- backfill:begin` e `-- backfill:end` e o executa sobre dados semeados:
   - tipo X com 12 execuções finalizadas de 62 min → **60** (arredonda para múltiplo de 5);
   - tipo Y com 9 execuções → **45** (menos de 10 amostras);
   - tipo Z com 10 execuções de 3 min e 10 de 600 min (fora de 5–480 min) e nenhuma válida → **45**;
   - execução com `abandoned_at` (F03) não conta;
   - tipo W com média 2 min válida? impossível (filtro ≥ 5 min); média 500 min impossível (filtro ≤ 480): o `LEAST/GREATEST` é defesa;
   - rodar o bloco duas vezes dá o mesmo resultado (idempotente).
28. Inserção direta `INSERT INTO service_types (...)` sem a coluna continua funcionando (DEFAULT 45) — garantido pelos testes de integração existentes passando sem mudança.

**C. Adaptador Mapbox (backend, `fetch` mockado) — `modules/day-plan/infrastructure/routing/__tests__/mapbox-routing.service.test.ts`**
29. `matrix` com 3 pontos → URL `https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/{lng},{lat};…?annotations=duration,distance&access_token=…`, coordenadas na ordem **lng,lat** com 6 casas; parse de `durations`/`distances` arredondados para inteiro.
30. 11 pontos → perfil `driving`; 26 → lança `RoutingProviderError('TOO_MANY_COORDINATES')` sem chamar `fetch`.
31. `durations[i][j] === null` → par marcado em `nullPairs` (o `PlanRouteService` preenche com o stub e marca aproximado).
32. HTTP 429/401/500 → `RoutingProviderError` com `code` `HTTP_429`/`HTTP_401`/`HTTP_500`; `code !== 'Ok'` no corpo → `PROVIDER_CODE_<code>`.
33. Timeout: fake timers, `fetch` pendente → aborta em **8000 ms** (matrix) / **5000 ms** (directions) → `RoutingProviderError('TIMEOUT')`.
34. `directions([from,to], { departAt })` → URL `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{lng},{lat};{lng},{lat}?geometries=geojson&overview=full&steps=false&depart_at=2026-11-04T20:50:00Z&access_token=…`; `depart_at` no formato `YYYY-MM-DDThh:mm:ssZ` (UTC, segundos zerados).
35. **Regra única do `depart_at`:** enviado só quando `departAt ≥ now + 60 s` (relógio injetado); `departAt` = `now + 59 s`, `now` ou no passado → parâmetro **omitido** (trânsito atual).
36. Parse: `routes[0].duration` (s, inteiro), `routes[0].distance` (m, inteiro), `geometry.coordinates` arredondadas para **5 casas**; `code 'NoRoute'` → `RoutingProviderError('PROVIDER_CODE_NoRoute')`.
37. Limitador compartilhado (porta `IRoutingRateLimiter`, fake em memória neste arquivo): o adaptador chama `acquire(bucket, maxWaitMs)` **antes** de cada `fetch`; `acquire` devolvendo `false` → `RoutingProviderError('RATE_LIMITED')` sem `fetch`. HTTP 429 da Mapbox → `RoutingProviderError('HTTP_429')` e `limiter.drain(bucket, 60 s)` (esvazia o balde para todas as instâncias).
37b. **`PostgresRoutingRateLimiter` (suíte db, testcontainers em série)** `tests/integration/db/routing-rate-limiter.integration.test.ts`:
   - balde `matrix:driving-traffic` (capacidade 25, recarga 25/60 s): 25 `acquire` imediatos → `true`; o 26º com `maxWaitMs 0` → `false`; com `maxWaitMs 3000` e relógio do banco avançado 2,4 s → `true`;
   - **duas conexões Prisma** distintas (simulando 2 máquinas) disputando 30 `acquire` em paralelo → exatamente 25 `true` (atomicidade do `UPDATE … RETURNING`);
   - `drain` zera os tokens e o próximo `acquire` só passa depois da recarga;
   - baldes independentes (`directions` não consome de `matrix:*`).
38. Circuit breaker: 5 falhas seguidas → 6ª chamada falha com `CIRCUIT_OPEN` sem `fetch`; após 60 s volta a tentar.
39. **Redação do token:** em todos os caminhos de erro, nenhuma chamada do logger mockado e nenhuma `message` de erro contém `access_token` nem o valor do token.
40. Cada chamada emite um log `routing.provider_call` com `{ api, profile, coordinates, elements, outcome, httpStatus, durationMs }` e incrementa `metrics.recordRoutingProviderCall`.
40b. **Falhas por código (L-F04-09):** `fetch` → 401, depois 403, depois timeout → `metrics.snapshot().routingProviderFailuresByCode` = `{ HTTP_401: 1, HTTP_403: 1, TIMEOUT: 1 }`; chamada com sucesso não incrementa.

**D. Stub e Dynamic**
41. `StubRoutingService.matrix`: `durationS = round(haversine × 1,3 / (40 km/h))`, `distanceM = round(haversine × 1,3)`; profile `'haversine'`, provider `'STUB'`.
42. `StubRoutingService.directions`: mesma duração; geometria = `LineString` reta `[from, to]`.
43. `DynamicRoutingService`: sem config `mapbox` → stub; com config → Mapbox; token igual → mesma instância (circuit breaker preservado); token novo → instância nova (o limitador é do banco e não depende da instância).
43a. **N5 (reconciliação X00, 2026-10-29):** com `process.env.MAPBOX_ACCESS_TOKEN = 'env-token'` e a config `mapbox` do resolver com `accessToken 'hub-token'` → a URL da chamada leva `hub-token`; resolver devolve `null` (com o env ainda definido) → stub, `fetch` não chamado; trocar a config no resolver entre duas chamadas → a 2ª usa o token novo (resolvido por chamada). Nenhum arquivo em `modules/day-plan/infrastructure/routing/` referencia `MAPBOX_ACCESS_TOKEN` (teste lê o fonte).
43b. **Kill switch (L-F04-09):** `DAY_PLAN_ROUTING_PROVIDER='stub'` com config `mapbox` presente → `matrix`/`directions` respondem com `provider 'STUB'` e o `fetch` mockado **não** é chamado; `'mapbox'` (ou ausente) → comportamento do teste 43; valor inválido (`'google'`) → falha no boot (validação do env) com a mensagem "DAY_PLAN_ROUTING_PROVIDER must be 'mapbox' or 'stub'".

**E. `PlanRouteService` (backend, `IRoutingService` fake) — `modules/day-plan/application/services/__tests__/plan-route.service.test.ts`**
44. **Exemplo 9 · passada final.** Data 2026-11-05, fuso `Australia/Sydney` (AEDT, UTC+11), paradas do Exemplo 1 (janelas 08:00–17:00 → `2026-11-04T21:00:00Z`–`2026-11-05T06:00:00Z`), fake matrix = matriz "linha", fake directions devolve O→A 660, A→B 540, B→C 600. Esperado: ordem `A,B,C`; chamadas Directions com `departAt` `2026-11-04T20:50:00Z` (estimativa pela matriz), `2026-11-04T21:45:00Z`, `2026-11-04T22:39:00Z`; resultado: `departureAt 2026-11-04T20:49:00Z`, A `arrivalAt 21:00Z`, B `21:54Z`, C `22:49Z`, `finishAt 2026-11-04T23:34:00Z`; `driveS 1800`; `approximate false`; `geometry` = FeatureCollection com 3 `LineString` (`fromSequence 0→1`, `1→2`, `2→3`).
44b. **Pontos idênticos (L-F04-13).** Dados do Exemplo 9, com B na mesma coordenada de A (ingoing + outgoing no mesmo imóvel): trecho A→B com `travelS 0`, `distanceM 0`, `approximate false`; o fake directions é chamado **2** vezes (O→A e B→C), nunca com dois pontos iguais; `geometry.features` tem 2 `LineString` (`0→1` e `2→3`, sem feature `1→2`); `usage.directionsCalls 2`. Pontos a 9 m → mesmo tratamento; a 11 m → chamada normal.
45. Matrix lança → usa o stub para a ordem; `approximate true`; `matrix.provider 'STUB'`; log `routing.fallback { api: 'matrix', reason }`.
46. Directions do trecho 2 lança → trecho 2 usa a duração da matriz Mapbox (ou stub) e linha reta, `legs[1].approximate true`; os outros trechos ficam Mapbox; `approximate true` no plano.
47. Prazo total (`deadlineMs`: 12000 interativo, 60000 job) estourado no meio → trechos restantes viram aproximados sem novas chamadas (modo interativo). **Modo job (`strict: true`):** `RATE_LIMITED`/`HTTP_429` ou prazo estourado **não** viram aproximado: `compute` lança `RoutingDeferredError` e o job adia o inspetor (TASK-F04-2); erros não ligados a limite (`TIMEOUT`, `HTTP_5xx`, `CIRCUIT_OPEN`) também lançam `RoutingDeferredError` até a 3ª tentativa do job, que passa `strict: false` e aceita o stub com `approximate true` e `approximateReason`.
48. 0 paradas → nenhuma chamada ao provedor. 1 parada → nenhuma chamada de Matrix (nada a ordenar); 1 Directions se houver origem; sem origem e 1 parada → nenhuma chamada.
49. Modo `FIXED_ORDER` com `cachedMatrix` → **não** chama Matrix; chama Directions por trecho; `method 'FIXED'`.
50. Modo `PRESERVE_ORDER` com parada nova → `insertIntoOrder`; sem parada nova → mantém a ordem e `method 'FIXED'`.
51. 26 coordenadas → Matrix não é chamada; stub; `approximate true`; log `routing.too_many_coordinates`.
52. **DST:** plano de **2026-10-04** (domingo em que o horário de verão começa às 02:00; às 08:00 já vale **AEDT, UTC+11**) → janela 08:00 = `2026-10-03T21:00:00Z`; plano de **2027-04-04** (domingo em que o horário de verão termina às 03:00; às 08:00 já vale **AEST, UTC+10**) → janela 08:00 = `2027-04-03T22:00:00Z`. Num plano com paradas às 01:30 e 08:00 de 2027-04-04, a diferença entre elas é 7 h 30 min reais (não 6 h 30); a duração dos trechos é em segundos reais.
53. **Fuso por agência:** parada de agência `Australia/Perth` (UTC+8) e outra de `Australia/Sydney` no mesmo plano → janelas 08:00 viram `00:00Z` e `21:00Z (dia anterior)`; o otimizador ordena por instante.
54. `usage` = `{ matrixElements: n², directionsCalls }` correto para os casos acima; log `day_plan.route_computed` com esses números.

### Escopo / Passos
1. **Migration B5** (ver Modelo de dados). Gerar com `--create-only`, conferir que o diff não derruba índices `Unsupported()` nem o índice funcional `lower(name)` (memória "drift DROPA Unsupported()"), aplicar localmente, `prisma generate`.
2. **Shared — duração:** `defaultDurationMinutes` em `createServiceTypeSchema` (`z.number().int().min(5).max(480).default(45)`), `updateServiceTypeSchema` (`.optional()`), `serviceTypeResponseSchema` (`z.number().int()`), constantes `SERVICE_TYPE_DURATION_MIN_MINUTES = 5`, `SERVICE_TYPE_DURATION_MAX_MINUTES = 480`, `SERVICE_TYPE_DURATION_DEFAULT_MINUTES = 45` em `packages/shared/src/constants/service-type.ts` (novo).
3. **Backend — duração:** `ServiceTypeEntity.defaultDurationMinutes`; mapeamento no repositório; create/update/get/list; audits com o campo; outputs dos use cases.
4. **Shared — otimizador** em `packages/shared/src/route-planning/` (novo): `types.ts`, `evaluate-sequence.ts`, `optimize-route.ts`, `insert-into-order.ts`, `compare.ts`, `haversine.ts`, `matrix-profile.ts`, `index.ts`; exportar pelo `packages/shared/src/index.ts`. **Motivo de ficar no shared:** o recálculo local da reordenação (Parte B, 01.3) precisa do mesmo avaliador, e o CLAUDE.md manda o que é compartilhado entre workspaces para o shared. Sem dependência nova.
5. **Backend — módulo `day-plan`** (novo, `apps/backend/src/modules/day-plan/`), nesta tarefa só:
   - `domain/routing.service.ts` (porta `IRoutingService` + tipos + `RoutingProviderError` + `RoutingDeferredError`);
   - `domain/routing-rate-limiter.ts` (porta `IRoutingRateLimiter`);
   - `infrastructure/routing/mapbox-routing.service.ts`, `infrastructure/routing/stub-routing.service.ts`, `infrastructure/routing/postgres-routing-rate-limiter.ts`;
   - `application/services/plan-route.service.ts`.
6. **Limitador compartilhado (D16/D17):** migration `YYYYMMDDhhmmss_routing_rate_limit_buckets` + `PostgresRoutingRateLimiter` (Algoritmo §10). Substitui qualquer limite por processo.
7. **`DynamicRoutingService`** em `modules/integration/infrastructure/dynamic-providers.ts`, no padrão do `DynamicGeocodingService`, recebendo o limitador e o modo do provedor (`DAY_PLAN_ROUTING_PROVIDER`, L-F04-09): `stub` → sempre `StubRoutingService`, sem ler a config `mapbox`. Validar o env no boot (`mapbox|stub`, padrão `mapbox`) e documentar no `.env.example` do backend.
7b. **Consulta Mapbox (L-F04-03):** abrir a consulta (suporte comercial da Mapbox) com as 3 perguntas de D8 no dia em que esta tarefa começa; registrar a resposta (ou "sem resposta") antes de iniciar a TASK-F04-2. Sem código nesta tarefa.
8. **Container:** `const routingRateLimiter = new PostgresRoutingRateLimiter(prisma)`, `const routingService = new DynamicRoutingService(integrationConfigResolver, routingRateLimiter)` e `const planRouteService = new PlanRouteService(routingService, logger, metrics)`; expor em `container.dayPlan.planRouteService` (consumido pela TASK-F04-2).
9. **Métrica:** `MetricsCollector.recordRoutingProviderCall({ api, outcome, elements })` acumulando `routingProviderCalls[api][outcome]`, `routingMatrixElements` e, para `outcome ≠ 'OK'`, `routingProviderFailuresByCode[code]` no snapshot (L-F04-09).
10. **api-types:** `pnpm generate:api`; build do shared antes de web/pwa (`pnpm --filter @properfy/shared build`).
11. **`apps/backend/CLAUDE.md` (reconciliação X00, 2026-10-29):** remover "created by F04" do texto de N5 ("behind a routing port (`IRoutingService`) …"). Sem outra mudança no arquivo.

### Modelo de dados

**`service_types` — coluna nova**

| Coluna | Tipo | Nulo | Default | Restrição | Semântica |
|---|---|---|---|---|---|
| `default_duration_minutes` | `Int` | não | `45` | CHECK 5–480 (só no SQL) | Tempo previsto em cada parada deste tipo; o otimizador soma ao deslocamento |

Prisma: `default_duration_minutes Int @default(45)`. Sem índice.

**Migration** `apps/backend/prisma/migrations/YYYYMMDDhhmmss_service_type_default_duration/migration.sql`:
```sql
ALTER TABLE "service_types"
  ADD COLUMN "default_duration_minutes" INTEGER NOT NULL DEFAULT 45;

ALTER TABLE "service_types"
  ADD CONSTRAINT "service_types_default_duration_minutes_range"
  CHECK ("default_duration_minutes" BETWEEN 5 AND 480);

-- backfill:begin
WITH measured AS (
  SELECT a."service_type_id",
         count(*) AS samples,
         avg(extract(epoch FROM (e."finished_at" - e."started_at")) / 60.0) AS avg_min
  FROM "inspection_executions" e
  JOIN "appointments" a ON a."id" = e."appointment_id"
  WHERE e."finished_at" IS NOT NULL
    AND e."abandoned_at" IS NULL
    AND extract(epoch FROM (e."finished_at" - e."started_at")) BETWEEN 300 AND 28800
  GROUP BY a."service_type_id"
)
UPDATE "service_types" st
SET "default_duration_minutes" = LEAST(480, GREATEST(5, (round(m.avg_min / 5.0) * 5)::int))
FROM measured m
WHERE m."service_type_id" = st."id"
  AND m.samples >= 10;
-- backfill:end
```
- Fonte = a mesma do `avgExecutionMinutes` (execuções finalizadas), com filtros de robustez: só durações de 5 a 480 min, sem execuções abandonadas (F03), mínimo de **10 amostras**, arredondado a múltiplos de 5. Sem amostras suficientes → 45.
- Expand puro: coluna NOT NULL com default constante (Postgres 11+ não reescreve a tabela). O CHECK não aparece no `schema.prisma` (Prisma não modela CHECK) e não gera drift.
- `abandoned_at` vem da F03 (TASK-F03-2), mergeada antes: **dependência dura da TASK-F04-1** (sem ela a migration falha).

**`routing_rate_limit_buckets` — tabela nova (limitador compartilhado, D16/D17)**

| Coluna | Tipo | Nulo | Default | Semântica |
|---|---|---|---|---|
| `bucket` | `VarChar(50)` PK | não | – | `matrix:driving-traffic`, `matrix:driving`, `directions` |
| `tokens` | `Decimal(10,4)` | não | – | tokens disponíveis |
| `capacity` | `Int` | não | – | 25 / 50 / 250 |
| `refill_per_minute` | `Int` | não | – | 25 / 50 / 250 (abaixo de 30/60/300 da Mapbox) |
| `refilled_at` | `DateTime` | não | `now()` | última recarga (relógio do **banco**, nunca do processo) |

Migration `YYYYMMDDhhmmss_routing_rate_limit_buckets`: `CREATE TABLE` + `INSERT` das 3 linhas (`tokens = capacity`). Sem `tenant_id` (infra de plataforma, como `cron_job_runs`). Prisma: `model RoutingRateLimitBucket { … @@map("routing_rate_limit_buckets") }`.

**Shared — tipos do otimizador** (`packages/shared/src/route-planning/types.ts`)
```ts
export interface RouteWeights { travel: number; windowWait: number; baseProximity: number } // 0–10, passo 0,1
export const DEFAULT_ROUTE_WEIGHTS: RouteWeights = { travel: 1, windowWait: 1, baseProximity: 1 };
export const ROUTE_OPTIMIZER_EXACT_MAX_STOPS = 8;
export const ROUTE_MATRIX_TRAFFIC_MAX_COORDINATES = 10;
export const ROUTE_MATRIX_MAX_COORDINATES = 25;

export interface OptimizerStop {
  key: string;               // appointmentId
  windowStartS: number;      // inteiro (epoch s no backend/PWA; relativo nos fixtures)
  windowEndS: number;        // se < windowStartS, é tratado como windowStartS
  serviceS: number;          // inteiro ≥ 0 (duração do tipo × 60)
  matrixIndex: number | null; // linha/coluna em travelS; null = sem coordenada
}
export interface OptimizerInput {
  stops: OptimizerStop[];               // só as reordenáveis
  travelS: number[][];                  // inteiros ≥ 0, quadrada
  originIndex: number | null;           // índice da origem em travelS; null = sem origem
  earliestDepartureS: number | null;    // hoje: max(agora, fim do prefixo executado); senão null
  weights: RouteWeights;
}
export interface EvaluatedStop {
  key: string; sequence: number;         // 1-based dentro das reordenáveis
  arrivalS: number; serviceStartS: number; serviceEndS: number;
  travelS: number; waitS: number; lateS: number;
}
export interface SequenceEvaluation {
  order: string[];
  departureS: number | null;             // saída da origem; null sem origem ou sem paradas
  finishS: number | null;                // fim do serviço da última parada
  stops: EvaluatedStop[];
  totalTravelS: number; totalWaitS: number; totalLateS: number; firstLegS: number;
  costTenths: number;
  feasible: boolean;                     // totalLateS === 0
  violations: Array<{ key: string; lateS: number }>;
}
export type OptimizerMethod = 'TRIVIAL' | 'EXACT' | 'HEURISTIC' | 'INSERTION' | 'FIXED';
export interface OptimizationResult extends SequenceEvaluation { method: OptimizerMethod }

export function evaluateSequence(input: OptimizerInput, order: string[], opts?: { legTravelS?: Array<number | null> }): SequenceEvaluation;
export function optimizeRoute(input: OptimizerInput, opts?: { forceMethod?: 'EXACT' | 'HEURISTIC' }): OptimizationResult;
export function insertIntoOrder(input: OptimizerInput, baseOrder: string[], newKeys: string[]): OptimizationResult;
export function compareEvaluations(a: SequenceEvaluation, b: SequenceEvaluation, rank: Map<string, number>): number;
export function toWeightTenths(w: RouteWeights): { travel: number; windowWait: number; baseProximity: number };
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number; // R = 6371008.8 m
export function selectMatrixProfile(coordinates: number): 'driving-traffic' | 'driving' | null;
export class RouteOrderMismatchError extends Error { readonly code = 'ROUTE_ORDER_MISMATCH' }
```

### Contratos

**Rotas de tipo de serviço (alteradas)** — RBAC inalterado (criação/edição só AM; leitura como hoje).

| Endpoint | Request | Response | Erros |
|---|---|---|---|
| `POST /v1/service-types` | `createServiceTypeSchema` + `defaultDurationMinutes?` (inteiro 5–480; ausente → 45 **nesta tarefa**) | 201 `{data}` com `defaultDurationMinutes` | 400 `VALIDATION_ERROR` "Request payload is invalid"; 403 `AUTH_FORBIDDEN`; 409 de código/nome (existentes) |
| `PATCH /v1/service-types/:id` | `updateServiceTypeSchema` + `defaultDurationMinutes?` | 200 `{data}` | 400; 403; 404 (existentes) |
| `GET /v1/service-types`, `GET /v1/service-types/:id` | – | itens com `defaultDurationMinutes: number` | inalterados |

**Porta `IRoutingService`** (`modules/day-plan/domain/routing.service.ts`)
```ts
export interface RoutePoint { lat: number; lng: number }
export type RoutingProviderName = 'MAPBOX' | 'STUB';
export type MatrixProfile = 'driving-traffic' | 'driving' | 'haversine';

export interface RoutingMatrix {
  provider: RoutingProviderName;
  profile: MatrixProfile;
  durationsS: number[][];         // inteiros
  distancesM: number[][];         // inteiros
  nullPairs: Array<[number, number]>; // pares sem rota no provedor
}
export interface RoutingLeg {
  provider: RoutingProviderName;
  durationS: number;
  distanceM: number;
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> }; // [lng, lat], 5 casas
}
export interface RoutingCallOptions { maxWaitMs?: number; signal?: AbortSignal }

export interface IRoutingService {
  /** Pairwise travel times, ORDERING ONLY (never final ETAs). Throws RoutingProviderError. */
  matrix(points: RoutePoint[], opts?: RoutingCallOptions): Promise<RoutingMatrix>;
  /** Fixed-order route for ONE leg (2 points) or more; departAt = departure from points[0]. */
  directions(points: RoutePoint[], opts?: RoutingCallOptions & { departAt?: Date }): Promise<RoutingLeg>;
}
export class RoutingProviderError extends Error {
  constructor(readonly code: 'TIMEOUT' | 'RATE_LIMITED' | 'CIRCUIT_OPEN' | 'TOO_MANY_COORDINATES' | `HTTP_${number}` | `PROVIDER_CODE_${string}` | 'NETWORK', message: string);
}
/** Thrown by PlanRouteService in strict (job) mode instead of degrading to the stub. */
export class RoutingDeferredError extends Error {
  constructor(readonly reason: 'RATE_LIMITED' | 'DEADLINE' | 'PROVIDER_ERROR', readonly cause?: unknown);
}

// domain/routing-rate-limiter.ts
export type RoutingRateBucket = 'matrix:driving-traffic' | 'matrix:driving' | 'directions';
export interface IRoutingRateLimiter {
  /** Takes 1 token, waiting up to maxWaitMs (polling every 250 ms). false = budget not available in time. */
  acquire(bucket: RoutingRateBucket, maxWaitMs: number): Promise<boolean>;
  /** Empties the bucket (after a provider 429) so every instance backs off. */
  drain(bucket: RoutingRateBucket): Promise<void>;
}
```
- O plano previa `directions(orderedPoints)`; a assinatura aceita N pontos, mas o `PlanRouteService` chama **um trecho por vez** (2 pontos) para aplicar `depart_at` por trecho (D4).

**`MapboxRoutingService`** (`infrastructure/routing/mapbox-routing.service.ts`)
- Matrix: `GET https://api.mapbox.com/directions-matrix/v1/mapbox/{profile}/{coords}?annotations=duration,distance&access_token={token}`; `profile = selectMatrixProfile(points.length)` (null → `TOO_MANY_COORDINATES`). Timeout 8000 ms (`AbortController`).
- Directions: `GET https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{coords}?geometries=geojson&overview=full&steps=false[&depart_at=YYYY-MM-DDThh:mm:ssZ]&access_token={token}`. **Regra única do `depart_at`:** enviado se e só se `departAt ≥ now + 60 s`; senão omitido. Timeout 5000 ms.
- Limite: `IRoutingRateLimiter.acquire(bucket, maxWaitMs)` **compartilhado no Postgres** (D17) antes de cada chamada; `maxWaitMs` 3000 (interativo) ou 60000 (job). HTTP 429 → `drain(bucket)`.
- `CircuitBreaker` (`name: 'mapbox-routing'`, 5 falhas, 60 s) por processo, compartilhado por matrix e directions (é proteção local, não cota).
- Sem retry dentro do adaptador. Quem decide entre stub e adiar é o `PlanRouteService` (modo interativo × job).

**`StubRoutingService`**: constantes `STUB_ROAD_FACTOR = 1.3`, `STUB_SPEED_MPS = 40 / 3.6`.

**`DynamicRoutingService implements IRoutingService`** (em `dynamic-providers.ts`): `resolver.getConfig('mapbox')` a cada chamada; `null` → stub; senão `MapboxRoutingService(accessToken)` cacheado por token.

**`PlanRouteService`** (`application/services/plan-route.service.ts`)
```ts
export interface PlanRouteStopInput {
  appointmentId: string;
  location: RoutePoint | null;     // coordenada do imóvel; null = sem coordenada
  windowStartAt: Date; windowEndAt: Date;
  serviceMinutes: number;
}
export type PlanRouteMode =
  | { kind: 'OPTIMIZE' }
  | { kind: 'FIXED_ORDER'; order: string[] }
  | { kind: 'PRESERVE_ORDER'; order: string[] };   // ordem manual anterior; novas paradas por inserção
export interface StoredRoutingMatrix {
  provider: RoutingProviderName; profile: MatrixProfile;
  points: Array<{ key: string; lat: number; lng: number }>; // key = 'origin' | appointmentId
  travelS: number[][];
}
export interface PlanRouteInput {
  origin: RoutePoint | null;
  stops: PlanRouteStopInput[];             // só as reordenáveis
  earliestDepartureAt: Date | null;
  weights: RouteWeights;
  mode: PlanRouteMode;
  cachedMatrix?: StoredRoutingMatrix;      // reuso na reordenação (mesmo conjunto de paradas)
  interactive: boolean;                    // true: maxWaitMs 3000, deadline 12000; false: 60000/60000
  strict: boolean;                         // true (job, tentativas 1–2): limite/prazo/erro → RoutingDeferredError, nunca stub silencioso
  now: Date;
}
export interface PlanRouteResult {
  method: OptimizerMethod;
  order: string[];
  optimizedOrder: string[] | null;          // resultado do otimizador quando ele rodou (OPTIMIZE)
  departureAt: Date | null; finishAt: Date | null;
  stops: Array<{
    appointmentId: string; sequence: number;
    arrivalAt: Date; serviceStartAt: Date; serviceEndAt: Date;
    travelS: number; distanceM: number | null; waitS: number; lateS: number;
    approximate: boolean; missingCoordinates: boolean;
  }>;
  totals: { driveS: number; waitS: number; serviceS: number; lateS: number; distanceM: number | null };
  feasible: boolean; violations: Array<{ appointmentId: string; lateS: number }>;
  geometry: DayPlanGeometry | null;         // FeatureCollection<LineString> (ver TASK-F04-2)
  matrix: StoredRoutingMatrix | null;       // null quando < 2 paradas reordenáveis com coordenada
  provider: RoutingProviderName;            // 'STUB' se qualquer parte usou o stub
  matrixProfile: MatrixProfile | null;
  approximate: boolean;
  approximateReason: 'NO_PROVIDER' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'DEADLINE' | 'TOO_MANY_COORDINATES' | 'NO_ROUTE' | null;
  legs: Array<{ fromKey: string; toKey: string; travelS: number; approximate: boolean }>; // durações finais (Directions) por par adjacente
  usage: { matrixElements: number; directionsCalls: number };
}
```

### Algoritmo

**1. Normalização (backend → otimizador)**
- Instantes viram epoch **segundos inteiros** (`Math.floor(ms/1000)`); `serviceS = serviceMinutes × 60`.
- Pontos da matriz: `[origin?] + paradas reordenáveis com coordenada`, nesta ordem; paradas sem coordenada recebem `matrixIndex: null`.
- Durações da matriz arredondadas para inteiros; pares `null` do provedor → valor do stub (haversine) e `approximate = true`.
- Ordem canônica: paradas ordenadas por `(windowStartS asc, key asc)`; `rank(key)` = posição nessa ordem.

**2. Avaliação de uma sequência (`evaluateSequence`)** — a mesma função vale para o otimizador, a passada final, a reordenação no PWA e o preview.
```
last = originIndex; prevEnd = null
para cada (i, key) em order:
  s = stop(key)
  leg = (s.matrixIndex ≠ null e last ≠ null) ? (legTravelS?[i] ?? travelS[last][s.matrixIndex]) : 0
  se i = 0:
    chegada = (earliestDepartureS = null) ? s.windowStartS : max(earliestDepartureS + leg, s.windowStartS)
    departureS = originIndex ≠ null ? chegada − leg : null
  senão:
    chegada = prevEnd + leg
  inicio = max(chegada, s.windowStartS); espera = inicio − chegada
  atraso = max(0, inicio − windowEnd)          // janela vale para a CHEGADA/início, como o check-in da F03
  prevEnd = inicio + s.serviceS
  se s.matrixIndex ≠ null: (se originIndex ≠ null e firstLegS ainda não definido: firstLegS = leg); last = s.matrixIndex
finishS = prevEnd
```
- **Folga para frente (partida viável mais tarde).** A passada acima usa a partida mais cedo possível, o que pode criar **espera fantasma** (chegar cedo e esperar uma janela adiante). Depois dela, `evaluateSequence` calcula o maior atraso `d` da partida (ou do início da 1ª parada, sem origem) que **não aumenta nenhum atraso**:
  - `W_i` = soma das esperas das paradas 1..i (inclusive a de i);
  - `d = min( Σ esperas, min_{i: atraso_i = 0}( W_i + windowEnd_i − inicio_i ), min_{i: atraso_i > 0}( W_i ) )`;
  - se `d > 0`, refaz a passada com a partida (ou o início da 1ª parada) atrasada em `d`. Inteiro, determinístico, O(n).
  - Resultado: esperas só sobram quando são **inevitáveis** (uma janela que fecha cedo obriga a sair cedo). Os horários publicados nunca mostram espera fantasma (Exemplos 6 e 6c).
  - Com `earliestDepartureS` (hoje), `d` só move a partida para mais tarde, nunca para antes de `earliestDepartureS`.
- **Sem origem (D7):** a 1ª parada começa na própria janela (ou em `earliestDepartureS`, se maior); não existe trecho de origem nem `firstLegS`.
- **Sem coordenada:** a parada só consome tempo; o trecho seguinte é medido a partir do último ponto com coordenada.
- **Custo** (inteiro): `costTenths = W_t·totalTravelS + W_w·totalWaitS + W_b·firstLegS`, com `W = round(peso × 10)`.
  - `travel` = deslocamento total (origem → … → última parada; **sem volta à base**, o plano não pede retorno);
  - `windowWait` = soma das esperas por abertura de janela ("folga de janela", Achado 2);
  - `baseProximity` = duração do 1º trecho a partir da origem ("proximidade da base", Achado 2).

**3. Ordem total entre avaliações (`compareEvaluations`)** — usada por todas as buscas:
1. `totalLateS` menor (viáveis sempre vencem; entre inviáveis, menor atraso total);
2. `costTenths` menor;
3. `finishS` menor (termina mais cedo);
4. sequência lexicograficamente menor pelo `rank` canônico.

**4. Restrições.** Janelas rígidas (D2): uma sequência é **viável** sse todo `inicio ≤ windowEnd`. O otimizador nunca move janelas. Se **nenhuma** sequência é viável, devolve a de menor atraso total (regra 3), com `feasible: false` e `violations` = paradas com `lateS > 0`.
- **Grupos não são restrição (L-F04-11, 2026-10-29):** paradas do mesmo grupo podem ser intercaladas com outras; a janela é sempre `time_slot_start/end` do appointment (o `time_window` do grupo é só de oferta). Nenhum campo de grupo entra no `OptimizerStop` nem no `PlanRouteStopInput`.

**5. Escolha do método**
- `n = 0` → `TRIVIAL` (vazio). `n = 1` → `TRIVIAL` (avalia a única ordem).
- `2 ≤ n ≤ 8` → **busca exata** (`EXACT`).
- `n ≥ 9` → **vizinho mais próximo viável + 2-opt** (`HEURISTIC`).
- `forceMethod` só em testes.

**6. Busca exata (≤ 8 paradas).** DFS sobre as paradas na ordem canônica, avaliando o prefixo incrementalmente. Poda: abandona o prefixo quando `prefixLate > best.totalLateS`, ou `prefixLate = best.totalLateS` e `prefixBound > best.costTenths`, com `prefixBound = W_t·travel do prefixo + W_b·firstLegS` (**sem** a espera, porque a folga para frente pode reduzi-la; atraso e deslocamento do prefixo são limites inferiores válidos, já que a folga nunca aumenta atraso nem muda trechos). Empates **não** são podados, porque o término pode desempatar. Cada folha é comparada por `compareEvaluations`. Pior caso 8! = 40320 folhas.

**7. Heurística (≥ 9 paradas)**
- **Construção (vizinho mais próximo viável):** a partir da origem (ou do "nada", se sem origem), escolhe a próxima parada minimizando a tupla `(atraso dela se for a próxima, incremento de custo [W_t·trecho + W_w·espera + W_b·trecho se for o 1º trecho], windowEndS, rank)`. Viáveis (atraso 0) sempre antes; entre viáveis, a de menor custo incremental (o "mais próximo" ponderado).
- **2-opt (primeira melhora):** para `i` de 0 a n−2 e `j` de i+1 a n−1, inverte o segmento `[i..j]`; se a nova sequência é **estritamente melhor** por `compareEvaluations`, aplica e reinicia a varredura em `i = 0`. Para quando uma varredura completa não melhora ou após **50** varreduras.
- Determinístico: sem aleatoriedade, aritmética inteira, iteração em ordem fixa.

**8. Inserção mais barata (`insertIntoOrder`, modo `PRESERVE_ORDER`).** Parte da ordem manual anterior filtrada para as paradas que ainda existem; insere cada parada nova (em ordem canônica) na posição `0..len` com menor `(totalLateS, costTenths, finishS)`; empate → **posição mais cedo**. `method: 'INSERTION'` (ou `FIXED` se não há nova).

**9. Orquestração (`PlanRouteService.compute`)**
1. `n = 0` → resultado vazio, sem chamadas.
2. Ordem:
   - `OPTIMIZE`/`PRESERVE_ORDER` com ≥ 2 paradas com coordenada → `matrix` (ou `cachedMatrix`); falha/`TOO_MANY_COORDINATES` → `StubRoutingService.matrix` + `approximate`.
   - `FIXED_ORDER` → usa a ordem dada (valida com `RouteOrderMismatchError`); matriz = `cachedMatrix` se houver, senão nenhuma chamada de matriz.
3. **Passada final (D4):** percorre a ordem escolhida e, para cada trecho entre pontos com coordenada (origem→1ª, …), chama `directions([de, para], { departAt })`:
   - 1º trecho: `departAt` = partida da avaliação pela matriz (já com a folga para frente);
   - demais: `departAt` = fim do serviço da parada anterior **na linha do tempo recalculada com as durações do Directions**;
   - `depart_at` só vai na URL pela regra única (`≥ now + 60 s`);
   - **pontos idênticos (L-F04-13):** `haversineMeters(de, para) < 10` → trecho `travelS 0`, `distanceM 0`, `approximate false`, sem chamada e sem feature na geometria;
   - a linha do tempo final é `evaluateSequence(input, order, { legTravelS })` com as durações do Directions (folga para frente aplicada de novo); `legs` do resultado = essas durações por par adjacente.
   - **Modo interativo** (`strict: false`): falha de um trecho → duração da matriz (ou stub) + linha reta, trecho e plano `approximate` com `approximateReason`; prazo estourado → trechos restantes aproximados sem chamada.
   - **Modo job** (`strict: true`): `RATE_LIMITED`, `HTTP_429`, prazo estourado ou erro do provedor (Matrix ou Directions) → lança `RoutingDeferredError(reason)`; nada é gravado e o job adia o inspetor (TASK-F04-2). Exceções que continuam valendo em modo estrito: sem config `mapbox` (`NO_PROVIDER`), `TOO_MANY_COORDINATES` e `NoRoute`/par `null` (são permanentes, adiar não resolve) → stub com `approximate`.
4. Violações e totais vêm da linha do tempo **final** (pode haver atraso no final mesmo com a matriz dizendo viável; é reportado, não corrigido).
5. Geometria = `FeatureCollection` de `LineString` por trecho, com `properties { fromSequence, toSequence, approximate }` (`fromSequence 0` = origem).
6. Log `day_plan.route_computed` (sem coordenadas): `{ stops, method, provider, matrixProfile, matrixElements, directionsCalls, approximate, approximateReason, durationMs }`.

**10. Limitador compartilhado (`PostgresRoutingRateLimiter`)** — token bucket numa única instrução atômica, com o relógio do banco:
```sql
UPDATE routing_rate_limit_buckets
SET tokens = LEAST(capacity, tokens + extract(epoch FROM (clock_timestamp() - refilled_at)) * refill_per_minute / 60.0) - 1,
    refilled_at = clock_timestamp()
WHERE bucket = $1
  AND LEAST(capacity, tokens + extract(epoch FROM (clock_timestamp() - refilled_at)) * refill_per_minute / 60.0) >= 1
RETURNING tokens;
```
- 1 linha → token concedido; 0 linhas → espera 250 ms e tenta de novo até `maxWaitMs`; esgotado → `false`.
- `drain`: `UPDATE … SET tokens = 0, refilled_at = clock_timestamp()`.
- O lock de linha do `UPDATE` serializa as instâncias (D17); cada ambiente tem o próprio banco e o próprio token (D16).
- Custo: 1 `UPDATE` por chamada Mapbox (≤ ~10 por plano).

### Casos de borda
1. **0 paradas:** resultado vazio, nenhuma chamada.
2. **1 parada:** sem Matrix; com origem, 1 Directions; sem origem, nenhuma chamada.
3. **Mais de 9 paradas com origem (10+ coordenadas):** Matrix `driving`; ≥ 9 paradas → heurística. A troca de perfil e a troca de método são independentes (perfil por coordenadas, método por paradas).
4. **> 25 coordenadas:** stub para a ordem, `approximate`.
5. **Mapbox fora / 401 / 429 / timeout / circuito aberto:** modo interativo → stub (linha reta), `approximate: true` com `approximateReason`; modo job (`strict`) → `RoutingDeferredError`, **nunca** aproximado em silêncio por 429/limite.
6. **Sem config `mapbox` (dev/CI):** sempre stub → `approximate: true`, `approximateReason 'NO_PROVIDER'` (também no job).
7. **Janela com fim ≤ início** (dado ruim): fim = início (só chegada exata é pontual).
8. **`depart_at` a menos de 60 s ou no passado** (recálculo à tarde do dia corrente): parâmetro omitido (trânsito atual), pela regra única.
8b. **Espera inevitável** (janela que fecha cedo antes de uma que abre tarde): a folga para frente para no limite da janela; a espera restante aparece e entra no custo (Exemplo 6).
8c. **Duas máquinas Fly chamando ao mesmo tempo:** o limitador do Postgres divide a cota (teste 37b).
9. **DST e fusos por agência:** conversão por parada com o fuso da agência; durações em segundos reais (testes 52–53). Horário de parede inexistente (gap do DST, 02:00–03:00) segue o `zonedWallTimeToUtc` (duas sondagens); janelas de inspeção não caem nesse intervalo na prática.
10. **Parada sem coordenada** (geocodificação pendente): participa só como tempo; plano `approximate`; sem trecho de traçado para ela.
11. **Pesos todos zero:** permitido pelo otimizador (o desempate decide); a validação do setting (TASK-F04-2) impede salvar.
12. **Token no log:** nunca (teste 39).
13. **Duas paradas no mesmo imóvel / mesma geocodificação (L-F04-13):** trecho de 0 s sem chamada Directions e sem `LineString` degenerada (teste 44b).
14. **Paradas de grupos diferentes ou do mesmo grupo (L-F04-11):** tratadas como independentes; intercalação é esperada (teste 11b).
15. **Token revogado / cota / billing (401/402/403) por dias (L-F04-09):** cada chamada conta em `routingProviderFailuresByCode`; o operador pode forçar `DAY_PLAN_ROUTING_PROVIDER=stub` sem desligar o job (teste 43b). O circuito continua com 60 s (o item (d) da lacuna não foi adotado).

### Fora do escopo
- Persistência do plano, jobs, rotas HTTP do plano (TASK-F04-2).
- Campo de duração no web (TASK-F04-5) — por isso o `.default(45)` transitório.
- Adaptador Google (só se o gatilho disparar; outra decisão).
- Optimization API da Mapbox, `depart_at` na Matrix, multi-dia, realocação entre inspetores, restrições de veículo, retorno à base.

### Critérios de aceite
1. **01.A3:** testes 1 e 2 (a 1ª parada é a mais próxima da base, salvo janela mais cedo que obrigue outra ordem) passam no CI.
2. **00.A5:** o endereço-base é a origem do cálculo (`originIndex` = base; teste 1 e 44).
3. Otimizador determinístico, exato = força bruta para ≤ 8 paradas (teste 10), heurística ≥ guloso (teste 11).
4. Falha do Mapbox nunca derruba o cálculo interativo (stub + `approximate` com motivo); no modo job, limite e erro do provedor adiam em vez de aproximar (testes 45–47, 51).
5. Tipo de serviço tem `default_duration_minutes` NOT NULL, 5–480, com backfill idempotente (teste 27).
6. Nenhuma espera fantasma: com a folga para frente, só restam esperas inevitáveis (testes 6 e 6c).
7. A cota Mapbox é respeitada entre instâncias (teste 37b).
8. `DAY_PLAN_ROUTING_PROVIDER=stub` desliga o provedor sem desligar o roteamento; falhas por código aparecem no `/metrics` (testes 40b e 43b, L-F04-09).
9. Pontos idênticos não geram chamada nem geometria degenerada; grupos não restringem a ordem (testes 44b e 11b).
10. A consulta à Mapbox (D8, L-F04-03) está aberta com dono e prazo, e o plano B está escrito nesta tarefa.

### Dependências
- **TASK-F03-2 mergeada** (dependência dura): o backfill lê `inspection_executions.abandoned_at`. A ordem das ondas já garante.
- X02 (padrão de provedor/`DynamicGeocodingService`), só como referência de código.
- Consumida pela TASK-F04-2 e pela Parte B (avaliador no shared).

### Riscos e armadilhas
- **Token:** o adaptador monta URL com o token; logar só `api/profile/outcome/status`, nunca a URL (teste 39).
- **Formato do `depart_at`:** confirmar na documentação da Directions (formatos aceitos e limite de passado) durante a implementação; o teste 34 fixa o formato escolhido.
- **Rate limit da Matrix `driving-traffic` (30/min, por token = por ambiente, D16):** os workers rodam no processo da API e o Fly pode ter 2 máquinas (D17); por isso o limitador é do Postgres. Polling de 250 ms adiciona até `maxWaitMs` de latência num `GET` interativo sob carga (3 s no pior caso, depois stub com motivo).
- **Shared com lógica:** o otimizador entra no bundle do PWA (sem dependências; ~10 KB). Não importar nada de Node.
- **`.extend()` propaga** (memória): `serviceTypeResponseSchema` é usado só como base; conferir se outro schema o estende antes de acrescentar o campo.
- **Testes não tipados de wiring** (memória "nova dep de use-case quebra wirings"): `ServiceTypeEntity` ganha campo obrigatório → grep por `new ServiceTypeEntity(` nos testes.
- **Resposta negativa da Mapbox (L-F04-03):** se (c) for negado depois da TASK-F04-2 no ar, aplica-se o plano B das Decisões aplicáveis (preview no servidor; `routingInput` removido do contrato) e a TASK-F04-4 muda de variante; o prazo da consulta (início da TASK-F04-2) existe para que isso aconteça antes do contrato congelar.

### Deploy / rollout / rollback
- **Deploy:** migration expand em staging, depois prod (padrão). Conferir em staging: `SELECT code, default_duration_minutes FROM service_types` e comparar com `avgExecutionMinutes` do Analytics.
- **Rollout:** nada usa o roteamento ainda (dark). O campo aparece nas respostas de tipo de serviço; o web atual ignora. Env nova `DAY_PLAN_ROUTING_PROVIDER` (padrão `mapbox`; não precisa ser definida em staging/prod). Abrir a consulta Mapbox (L-F04-03) no início da tarefa.
- **Rollback:** reverter o código. A coluna e a tabela de baldes ficam (inofensivas; um contract posterior pode removê-las). Nada a limpar.

### Dias · Branch · Verificação
- **5,75 dias** = B5 backend 0,25 · 01.1a 2,0 · **limitador compartilhado no Postgres +0,5** (migration, `UPDATE` atômico, porta, teste com 2 conexões; exigido pela revisão por causa das 2 máquinas Fly) · 01.1b 2,5 · **folga para frente +0,25** (passada extra no avaliador, poda ajustada, Exemplos 6/6c refeitos) · **lacunas 2026-10-29 +0,25** (kill switch e contador de falhas, L-F04-09; pontos idênticos, L-F04-13; teste de grupos, L-F04-11; L-F04-03 sem código). Plano: 4,75.
- Branch: `feat/f04-routing-domain` a partir de `develop`.
- Verificação (no worktree): `pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared build`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test`; suíte db (`service-type-duration-backfill`, `service-type-uniqueness`, `routing-rate-limiter`); `pnpm generate:api`; `pnpm --filter web typecheck && pnpm --filter pwa typecheck`. `git diff --stat origin/develop... | tail -1` < 150 arquivos (estimado ~50).
- Checklist de verificação (reconciliação X00, 2026-10-29): [ ] "Remove the transition clause of rule N5 ('created by F04') from `apps/backend/CLAUDE.md` in this PR (X00 L-04)"; [ ] `grep -n "created by F04" apps/backend/CLAUDE.md` vazio; [ ] `grep -rn "MAPBOX_ACCESS_TOKEN" apps/backend/src/modules/day-plan` vazio (teste 43a).

---

## TASK-F04-2 · Backend + shared: `DayPlan`, publicação 19:30, STALE, API, base do dia, folha PDF/XLSX, pesos + preview, métrica e expurgo

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F04-1, TASK-F01-1, TASK-F02-1, TASK-F03-1, TASK-F03-2
> - **Desbloqueia:** TASK-F04-5, TASK-F04-3, TASK-F04-4, TASK-F05-1, TASK-F06-1, TASK-F07-1
> - **Pode rodar em paralelo com:** TASK-F02-3
> - **Pista sugerida (time de 6):** A + A2 · Backend crítico **em par** · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Persistir o plano do dia por inspetor (`DayPlan`/`DayPlanStop`, sem `tenant_id`) com sequência, horários previstos, esperas, violações, traçado e matriz.
- Publicar automaticamente o plano de D+1 às **19:30 locais** (tick por agência, depois do T-1) e avisar o inspetor (`ROUTE_PUBLISHED`, crítico, F02).
- Marcar o plano **STALE** quando os dados mudam e recalcular **ao abrir**; deixar a OP recalcular (aviso `ROUTE_CHANGED`).
- API do inspetor (o próprio plano: ver, salvar ordem, recalcular, trocar a origem do dia, baixar a folha) e de AM/OP (ver, recalcular, folha, preview de pesos, métrica).
- Folha do dia em PDF e XLSX (01.7).
- Pesos da rota no `PlatformSetting` (`routeWeights`) e preview (01.14, backend).
- Métrica "Route ETA accuracy" (Medição) para o rodapé do Dia ao Vivo (F05).
- Expurgo diário do traçado e da matriz de planos passados (D8).
- Leitura **fresca** da previsão por appointment para a F06 (`getFreshStopForAppointment`).
- Fatia de backend do tour (00.2): `inspectors.onboarding_completed_at` gravado pelo heartbeat da F01 e devolvido no `GET /v1/inspectors/me` (a TASK-F04-3b só consome).

### Contexto no código
- **Tick por agência (não muda nesta tarefa):** `apps/backend/src/shared/application/tenant-cron-tick.ts` — assinaturas atuais `claimDue(jobName: string, targetHour: number, now: Date = new Date())` e `runDue(jobName: string, targetHour: number, runner: (group: DueTenantGroup) => Promise<void>, now: Date = new Date())`; granularidade de **hora** (`localHour >= targetHour`), claim em `cron_job_runs` PK `(job_name, tenant_id, local_date)`, `releaseClaims` quando o runner lança. `ICronJobRunRepository` (`tryClaim`, `releaseClaims`) no mesmo arquivo; implementação `shared/infrastructure/prisma-cron-job-run.repository.ts`. Esta tarefa só acrescenta `hasClaim` ao **repositório**.
- **Workers no processo da API:** `apps/backend/src/main/server.ts:104-106` (`ENABLE_JOB_QUEUE === 'true'` → `registerWorkers`); Fly prod com `min_machines_running = 1` e 2ª máquina sob carga (`fly.production.toml:27-34`) → qualquer job pode rodar em 2 máquinas (D17).
- **Datas civis:** `addCivilDays(dateStr, delta)` em `packages/shared/src/utils/local-date.ts:29`; `nextCivilDay` em `apps/backend/src/shared/domain/timezone-date.ts:71`. **Não existe** `previousCivilDay`: usar `addCivilDays(date, -1)`.
- **RBAC:** `AuthorizationService.assertRoles` (`shared/domain/authorization.service.ts:32-57`) audita a negação e lança `ForbiddenError('FORBIDDEN', \`Role ${actor.role} is not permitted to perform ${context.action}\`)` — mensagem reusada como está.
- **Heartbeat (F01):** `POST /v1/inspectors/me/app-state` (`inspectorAppStateSchema`, 204), use case `modules/inspector/application/use-cases/record-inspector-app-state.use-case.ts`, `GET /v1/inspectors/me`, visibilidade em `modules/inspector/application/inspector-field-visibility.ts`.
- **Workers:** `apps/backend/src/main/workers.ts` — todos os crons com `SYDNEY_TZ`; T-1 em `:290-315` (`boss.schedule('appointment.reject-unconfirmed', '0 * * * *')` + `tenantCronTick.runDue(..., 19, ...)`); `audit.retention` poda `cron_job_runs` > 60 dias (`:273`); a linha de log final lista as filas (`:363`).
- **T-1:** `appointment/application/use-cases/reject-unconfirmed-appointments.use-case.ts` + `findUnconfirmedForDate` (`prisma-appointment.repository.ts:858`).
- **Visibilidade T-1 no app:** `inspector-execution/domain/t1-visibility.service.ts` (`T1VisibilityService.isVisibleForInspector`) e `findVisibleForInspector` (`prisma-appointment.repository.ts:771-803`: só SCHEDULED + filtro T-1).
- **Agenda do inspetor:** `inspector-execution/application/use-cases/get-inspector-schedule.use-case.ts` (INSP via `assertRoles(['INSP'])`, `INSPECTOR_NOT_LINKED`, "hoje" = `civilDateInTimezone(new Date(), actor.timezone ?? PLATFORM_TIMEZONE)`); rotas em `inspector-execution/interfaces/inspector-execution.routes.ts` (prefixo `/v1/inspector/...`).
- **Eventos de domínio:** `shared/application/events/domain-event-bus.ts` (`emit` com `Promise.allSettled`). Emitidos hoje: `APPOINTMENT_EVENTS.STATUS_TRANSITION` (`execute-status-transition.use-case.ts:640`, payload `{ appointmentId, tenantId, fromStatus, toStatus, actorId, actorType, reason, metadata, serviceGroupId }`), `SERVICE_GROUP_EVENTS.ACCEPTED`, `MANUALLY_ASSIGNED`, `INSPECTOR_CHANGED` (`{ groupId, tenantId, inspectorId, previousInspectorId }`), `SCHEDULE_CHANGED` (`{ groupId, inspectorId, previousScheduledDate, scheduledDate, ... }`), `MEMBERS_ADDED`. **`APPOINTMENT_EVENTS.UPDATED` e `DELETED` existem mas não são emitidos** (Achado 6). F03 acrescenta `INSPECTOR_FIELD_EVENTS.RECORDED`.
- **Escritas que mudam o plano sem evento:** `update-appointment.use-case.ts`, `bulk-edit-appointments`, `bulk-reschedule-appointments`, `bulk-assign-inspector`, `delete-appointment`, mudança de coordenada do imóvel → cobertas pela **impressão digital** (ver Algoritmo).
- **Fuso:** `TenantCronTick` usa `tenant.timezone ?? PLATFORM_TIMEZONE`; `shared/application/tenant-timezone.ts` (`ITenantTimezoneLookup`); `shared/infrastructure/effective-timezone-resolver.ts` (INSP usa `users.timezone`); helpers `hourInTimezone`, `civilDateInTimezone`, `nextCivilDay` em `shared/domain/timezone-date.ts`.
- **Geradores:** `report/infrastructure/exceljs-xlsx-generator.ts` (`ExcelJsXlsxGenerator.generate(columns, rows)`, planilha "Report", cabeçalho congelado) e `billing/infrastructure/pdfkit-invoice-pdf.generator.ts` (pdfkit, Helvetica, A4 paisagem, sem fonte externa). Download binário com `Content-Disposition` em `appointment/interfaces/appointment.routes.ts:784-790`.
- **Contatos:** `AppointmentContact` (`is_primary`, `role`, `snapshot_name/phone`), `schema.prisma:723-740`.
- **Índice útil:** `appointments @@index([scheduled_date, inspector_id])` (cross-tenant, já existe).
- **F01:** `inspectors.base_lat/base_lng/base_geocoded_at`, `address` (`inspectorBaseAddressSchema`), `geocodeInspectorBase`/`geocodeWithTimeout` + `formatGeocodingQuery` (X02), `MapboxPermanentGeocodingUnavailableError`, `GeocodeTimeoutError`.
- **F02:** `container.inspectorNotice.publishSystemInspectorNoticeUseCase.execute({ type, inspectorIds, title, body, dedupeKey, targetPath?, requestId? })`; tipos `ROUTE_PUBLISHED`/`ROUTE_CHANGED` (críticos); allowlist `INSPECTOR_NOTICE_TARGET_PATTERNS` (sem `/today` até a Parte B).
- **F03:** `PLATFORM_SETTINGS_REGISTRY` (`packages/shared/src/schemas/platform-settings.ts`), `IPlatformSettingsReader.get(key)` (cache 30 s), `INSPECTOR_FIELD_EVENTS.RECORDED`, `inspection_executions.abandoned_at`.
- **Endereço:** `GET /v1/address/suggestions` **proíbe INSP** (`search-addresses.use-case.ts:18`) → a base do dia recebe endereço estruturado (Achado 5).

### Decisões aplicáveis
D1, D2, D3, D4, D7, D8, D9, D10, D11, D12, D13, D14 (2026-10-27); D15, D16, D17, D18 (2026-10-28).

Lacunas aplicadas em **2026-10-29** (todas as recomendações aceitas pelo dev):
- **L-F04-01 · STALE sem mudança não roteia.** Ao encontrar `status = STALE` (no `GET` do INSP, no `getFreshStopForAppointment` e no `GET /:date/sheet` do INSP), o use case **recalcula a impressão digital antes de rotear**: se for igual à gravada, só limpa o STALE (`status = PUBLISHED`, ou mantém `DRAFT` se `published_at` nulo), zera `stale_at/stale_reason`, `version + 1` (CAS), **sem** chamar o `PlanRouteService`, e loga `day_plan.stale_cleared_noop { dayPlanId, staleReason }`. Só com impressão diferente recalcula. Assim check-out e SCHEDULED→DONE de parada já iniciada não geram chamada Mapbox.
- **L-F04-02 · `published_at` manda na leitura do INSP.** `published_at IS NOT NULL` → 200 **sempre**, independentemente da hora local do inspetor. `isPublicationOpen` só decide se o `GET` (ou o `PUT/DELETE /origin`, o `/sheet`) pode **criar/publicar** um plano de D+1 que não está publicado: a auto-publicação pelo `GET` exige janela aberta no fuso do inspetor **e** no `PLATFORM_TIMEZONE` (`isPublicationOpenForInspector(date, now, inspectorTz) = isPublicationOpen(date, now, inspectorTz) && isPublicationOpen(date, now, PLATFORM_TIMEZONE)`). O texto "ready at 7:30 pm" do PWA continua (Q9). **Confirmado pelo dev (2026-10-29):** a janela de publicação e as 19:30 seguem o fuso do inspetor (D14; exceção de N13 da X00, conflito resolvido 2026-10-29); com a plataforma Sydney-only, coincide com a hora da agência.
- **L-F04-04 · Join de leitura filtra status.** Todos os leitores (`GET` INSP, `GET` AM/OP, folha, `getFreshStopForAppointment`, métrica e, por contrato, a F05) re-unem as paradas com `a.status IN ('SCHEDULED','DONE')` além de `a.inspector_id = day_plans.inspector_id AND a.deleted_at IS NULL`. Parada cujo appointment saiu desses status (ex.: `DONE → DRAFT` pelo AM, que não zera `inspector_id`, `execute-status-transition.use-case.ts:475-485`) some da resposta; o enum `appointmentStatus` do schema nunca recebe outro valor.
- **L-F04-05 · Plano inviável sinalizado (opção 1, sem canal novo).** (a) `day_plan.published` e `day_plan.publish_completed` ganham `feasible` e `lateS` (por plano) / `infeasible` (contagem no lote); (b) o corpo do `ROUTE_PUBLISHED` acrescenta ", {k} stop(s) may arrive after its window" quando `feasible false`; (c) log `day_plan.published_infeasible { inspectorId, date, violations }` em nível `warn`; (d) contrato exportado §2: a F05 mostra `feasible false` como **indicador** "Route infeasible" na linha do inspetor (badge + tooltip com as paradas), **não** como alerta (decisão do dev de 2026-10-29; F05 D20 mantém 7 tipos). Nada de e-mail ou notificação à OP nesta feature.
- **L-F04-06 · `ROUTE_CHANGED` agregado e só com mudança efetiva.** O recálculo da OP só avisa quando a ordem das paradas reordenáveis mudou **ou** alguma `serviceStartAt` mudou mais de 5 min em relação ao plano anterior. `dedupeKey 'route-changed:{dayPlanId}:{floor(epochMs / 600000)}'` (um aviso por plano por janela de 10 min; o último estado prevalece ao abrir). Para hoje, "first stop" = 1ª parada **não iniciada**; sem nenhuma, o corpo diz "{n} inspection(s) remaining".
- **L-F04-07 · Origem efetiva depois do 1º check-in.** `origin` da resposta = origem **efetiva** do trecho restante: com prefixo executado (hoje) → `source 'LAST_STOP'` (valor novo de `DayPlanOriginSource`), `label` = suburb da última executada, `lat/lng` = imóvel dela; `originOverride` continua informativo. `PUT /:date/origin` com prefixo executado para hoje → **422 `DAY_PLAN_ALREADY_STARTED`** "Your day has started; the route continues from your last stop." (nada muda). `DELETE /origin` no mesmo estado → 200 idempotente (limpa o override, a origem efetiva continua `LAST_STOP`).
- **L-F04-08 · Contato principal da parada.** `primaryContact` = 1º contato do appointment ordenado por `is_primary desc`, depois `role` na ordem `RENTAL_TENANT, RENTAL_TENANT_REPRESENTATIVE, HOUSEKEEPER, PROPERTY_MANAGER, BROKER, OTHER` (enum `AppointmentContactRole`, `schema.prisma:139-146`), depois `created_at asc`; `null` sem contatos; `phone` só se for E.164 válido (senão `null`). `primaryContact.role` passa a ser exposto (o card mostra "Call Sam Lee (tenant)").
- **L-F04-09 (parte F04-2) · Falha persistente visível.** (a) `metrics` ganha `dayPlansApproximateTotal` (por `approximateReason`); (b) `day_plan.publish_completed` loga em **`error`** (não `info`) quando `approximate > 0` por motivo ≠ `NO_PROVIDER` ou quando `deferred > 0` na 3ª tentativa. O kill switch `DAY_PLAN_ROUTING_PROVIDER` é da TASK-F04-1.
- **L-F04-10 · Folha do dia.** Audit `day_plan.exported` (USER, INSP e AM/OP) com `metadata { format, date, stops, actorRole }`, sem dados pessoais; INSP só baixa folha de data passada até **30 dias** (`422 DAY_PLAN_SHEET_TOO_OLD` "Route sheets are available for the last 30 days"); com paradas em mais de um `window_timezone`, cada ETA/janela ganha sufixo curto de fuso ("08:00 AWST") e o preâmbulo diz "Times in each agency's local time"; "Finish" e "generated" no `plan.timezone` com sufixo; copy do aproximado: "Approximate route: some travel times are estimates"; slug do nome com transliteração simples (NFKD + remoção de diacríticos) e fallback `inspector`; um só formato de data no preâmbulo (`dd/MM/yyyy`).
- **L-F04-14 (parte F04-2) · Limites.** `GET /v1/day-plans/:inspectorId/:date` 120/min por usuário; folha AM/OP 20/min; `POST /v1/day-plans/preview` aceita `date` entre hoje e hoje+14 (no fuso efetivo do ator) → fora disso 422 `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` "Pick a day between today and 14 days ahead".
- **L-F04-15 · Sem histórico de versões na Etapa 1.** Cada cálculo substitui as paradas; a prova do que foi comunicado fica no payload da notificação (F06) e nos audits `reordered/recalculated/published`. O log `day_plan.computed` passa a levar `stops: [{ appointmentId, sequence, serviceStartAt }]` (sem coordenadas) para reconstrução por log. Na métrica, paradas removidas do plano depois da publicação não contam (documentado; viés aceito).
- **L-F04-16 · Funções de domínio exportadas.** `modules/day-plan/domain/classify-stops.ts` exporta `classifyStops(stops: ClassifiableStop[]) → { executed: ClassifiableStop[]; reorderable: ClassifiableStop[] }` com `ClassifiableStop = { appointmentId, appointmentStatus, startedAt, finishedAt, abandonedAt, windowStartAt }` (tipos planos, sem Prisma); `modules/day-plan/domain/day-plan-fingerprint.ts` exporta `computeDayPlanFingerprint(input: FingerprintInput): string` e o tipo `FingerprintInput`. Ambos listados no contrato exportado §2 para a F05.
- **L-F04-03 (pré-requisito):** a resposta da consulta Mapbox (aberta na TASK-F04-1) é conferida **antes de iniciar** esta tarefa; se (b) ou (c) for negado, o plano B da TASK-F04-1 entra nesta tarefa antes de codar os contratos.

Reconciliação **2026-10-29** (ajustes vindos de F01, F02, F03 e X02):
- **R-F01-03 · Troca de base marca STALE.** A F01 não altera planos (F01 D17) e emite `INSPECTOR_EVENTS.BASE_CHANGED` `{ inspectorId, hadCoordinates, hasCoordinates }` (`modules/inspector/domain/inspector-events.ts`) após o commit. O `MarkDayPlansStaleSubscriber` assina o evento e chama `markStaleByInspector(inspectorId, 'BASE_CHANGED')`: planos `PUBLISHED` do inspetor com `plan_date` = hoje ou hoje + 1 no fuso do próprio plano → `STALE`, `stale_reason 'BASE_CHANGED'` (valor novo), `version + 1`. `hadCoordinates false` e `hasCoordinates false` → no-op (a origem não muda). `DRAFT`, `STALE` e datas passadas ou ≥ D+2 não são tocados. Plano com override do dia continua com a origem do override: a impressão não muda e a próxima leitura só limpa o STALE (L-F04-01). A OP vê o `STALE` no `GET` AM/OP (e na F05); **não há aviso ativo à OP**: a troca de base **só marca STALE**, ninguém é notificado (segue L-F04-05). **Decisão do dev (2026-10-29):** conflito com a F01 resolvido; o "aviso à OP" foi removido de `F01-tarefas.md` (resolvido 2026-10-29).
- **R-F03-D23 · Referência do "Vou atrasar" (decisão do dev, 2026-10-29).** A F03 conta `minutesLate` a partir da `published_service_start_at` da parada quando há plano publicado (senão do início da janela) e lê esse valor pela porta `IPublishedStopStartReader.find(appointmentId, inspectorId, scheduledDate)`, com stub `null` até a F04. Este PR liga o adaptador real (`day_plan_stops.published_service_start_at` do `DayPlan` `PUBLISHED`/`STALE` com `published_at` não nulo do inspetor em `plan_date = scheduledDate`, join com status como em L-F04-04) e acrescenta 1 caso ao teste de integração do repositório. Sem dia extra (uma consulta indexada por `appointment_id`).
- **R-F01-02 · `onboarding_completed_at` na instrução única.** `recordAppState()` do repositório de inspetor é um `prisma.$executeRaw` único (CASE + COALESCE, F01 L-F01-02), não `updateMany`. A F04 acrescenta `onboarding_completed_at = CASE WHEN $onboardingCompleted THEN COALESCE(onboarding_completed_at, $now) ELSE onboarding_completed_at END` **na mesma instrução**; o use case só repassa `onboardingCompleted` em `repo.recordAppState({ id, now, displayMode, pushEnabled, appVersion, onboardingCompleted })`.
- **R-F02 · Avisos `ROUTE_PUBLISHED`/`ROUTE_CHANGED` (L-F02-01, -06, -07, -08).** (a) `dedupeKey` estável e determinístico (tabela "Avisos"); (b) título e corpo aparecem na tela bloqueada (F02 D23): só data, contagem, horário, suburb e "Open Properfy"; **nunca** nome ou telefone de contato/inquilino, código de chave/lockbox, `meetingLocation` ou endereço completo; (c) o SMS de fallback conta no teto diário `INSPECTOR_NOTICE_SMS_DAILY_CAP` da F02 (D17): acima do teto o SMS não sai, o aviso fica na caixa e no push; a F04 não tem teto próprio nem reenvia; (d) avisos de sistema são arquivados automaticamente após 30 dias (F02 D22), então avisos de roteiro antigos somem do card de não lidos e da caixa; nada na F04 depende deles depois do dia do plano; (e) `/today` entra na allowlist como padrão estático exato (F02 D24) na TASK-F04-3.
- **R-F03 · Eventos da F03 (L-F03-04, L-F03-10).** O payload de `INSPECTOR_FIELD_EVENTS.RECORDED` ganha `estimatedArrivalAt`; o subscriber da F04 só lê `type` e `appointmentId` (o `LATE_NOTICE` continua sem efeito no plano). Mudança de `routeWeights` **não** marca planos STALE: o próximo cálculo lê os pesos pelo `IPlatformSettingsReader` (cache 30 s). Se um dia for preciso reagir, assinar `platform_setting.updated.v1`, nunca alterar `update-platform-setting.use-case.ts`.
- **R-X02 · Geocodificação da base do dia (L-X02-01).** `MapboxPermanentGeocodingUnavailableError` já cai no 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE` (teste 7). Os testes da origem usam o geocodificador fake e **não** fixam a URL v5 de geocodificação; se a contingência v6 da X02 for acionada, nada na F04 muda (as URLs `directions/v5` da TASK-F04-1 são de roteamento, não de geocodificação).

### Testes primeiro (TDD)

Fixtures comuns: inspetor `insp-1` (fuso `Australia/Sydney`, base em `(-33.8700000, 151.2000000)`), agência `ag-syd` (`Australia/Sydney`), data **2026-11-05**; routing = `StubRoutingService` ou um `FakeRoutingService` determinístico (matriz "linha" da TASK-F04-1). Relógio injetado (`now`).

**A. Domínio / aplicação (unit, repositórios em memória)**
1. `day-plan-fingerprint.test.ts`: mesma entrada → mesmo hash; muda `time_slot_start`, `scheduled_date`, coordenada do imóvel, duração do tipo, fuso da agência, conjunto de appointments, origem (base ou override) → hash muda; **check-in** (execução passa a `started_at` preenchido) → hash **muda**; **abandono** (`abandoned_at`) → hash muda (volta a reordenável); **check-out** (`finished_at`) e SCHEDULED→DONE de uma parada já iniciada → hash **não** muda (o estado de execução no hash é só `NOT_STARTED`/`STARTED`, D18); ordem dos appointments na entrada não importa. A função testada é a exportada `computeDayPlanFingerprint(input: FingerprintInput)` de `domain/day-plan-fingerprint.ts`, sem Prisma no import (L-F04-16).
1b. `classify-stops.test.ts` (L-F04-16, `domain/classify-stops.ts`, tipos planos): entrada `[{A: DONE}, {B: SCHEDULED, startedAt 08:05}, {C: SCHEDULED, startedAt 09:00, abandonedAt 09:10}, {D: SCHEDULED}]` → `executed [A, B]` (prefixo ordenado por `startedAt`; DONE sem execução pela janela), `reorderable [C, D]`; entrada vazia → `{ executed: [], reorderable: [] }`; o módulo não importa `@prisma/client` (teste lê o fonte e falha se encontrar o import).
2. `publication-window.test.ts` (`isPublicationOpen(date, now, tz)` = `now ≥ zonedWallTimeToUtc(addCivilDays(date, -1), '19:30', tz)`): 2026-11-05 em Sydney abre em `2026-11-04T08:30:00Z` (19:30 AEDT); 1 ms antes → fechado; para hoje e datas passadas → aberto; D+2 → fechado.
3. `compute-day-plan.use-case.test.ts`:
   - 3 SCHEDULED visíveis (Exemplo 1 da TASK-F04-1) → plano com 3 paradas, `status PUBLISHED`, `version 1`, `suggestedOrder = order`, `manualOrder false`, `inputFingerprint` gravado, `origin.source 'BASE'`.
   - Appointment ROUTINE não confirmado de D+1 (invisível pelo T-1) → **fora** do plano.
   - Appointment DONE do dia → no plano como parada `executed` (prefixo), fora da otimização.
   - Hoje às 10:00 com A executada (check-in 08:05, sem check-out) e B, C pendentes → prefixo `[A]`; origem do restante = imóvel de A; `earliestDeparture = max(agora, 08:05 + 45 min)`; B e C otimizadas.
   - Execução com `abandoned_at` → parada **não** executada (volta a ser reordenável).
   - Inspetor sem base → `origin.source 'NONE'`, `originWarning 'NO_BASE'`, 1ª parada começa na janela.
   - `address` presente e `base_lat` nulo → `originWarning 'BASE_NOT_LOCATED'`, sem origem.
   - Override do dia presente → origem = override (`source 'OVERRIDE'`), base ignorada.
   - Modo `PRESERVE_ORDER` (plano com `manualOrder true` e uma parada nova) → ordem manual preservada + inserção (Exemplo 18 da F04-1); paradas preservadas `manual true`, nova `manual false`.
   - Gravação com CAS: versão lida 3, outra escrita leva a 4 no meio → 1ª tentativa falha, recarrega e recalcula; 2 falhas seguidas → devolve o plano gravado mais recente com `status 'STALE'` (sem erro).
   - Paradas executadas sem previsão anterior → `eta/serviceStartAt/serviceEndAt null`; com previsão anterior (mesmo `appointmentId` no plano antigo) → valores copiados.
   - **ETA publicada congelada:** na 1ª gravação com `status PUBLISHED`, cada parada recebe `published_eta`, `published_service_start_at`, `published_approximate` e `published_predicted_at = computed_at`; recálculos posteriores **copiam** esses 4 campos do plano anterior (mesmo `appointmentId`), nunca os reescrevem; parada que entra depois da publicação recebe os valores na 1ª gravação em que aparece (se ainda não iniciada); `DRAFT` não preenche.
   - Hoje: `earliestDeparture = max(now, partida planejada gravada)` — ETAs recalculadas nunca ficam no passado.
   - **Origem efetiva `LAST_STOP` (L-F04-07):** hoje com A executada em Surry Hills e override do dia em Newtown → resposta `origin { source: 'LAST_STOP', label: 'Surry Hills', lat/lng do imóvel de A }`, `originOverride` presente (informativo), `routingInput.originKey 'origin'` com o ponto `origin` = imóvel de A; sem prefixo → `source 'OVERRIDE'`.
   - **Log enriquecido (L-F04-15):** `day_plan.computed` traz `stops [{ appointmentId, sequence, serviceStartAt }]` na ordem gravada e nenhuma chave `lat`/`lng`/`origin` (assert por inspeção do objeto logado).
3b. `prisma-day-plan-input.reader.test.ts` / leitor em memória (seleção e contato):
   - **contato principal (L-F04-08):** (i) contatos `[PM is_primary true, RENTAL_TENANT is_primary false]` → `primaryContact { name: PM, role: 'PROPERTY_MANAGER' }`; (ii) sem `is_primary`: `[BROKER 08:00, HOUSEKEEPER 09:00, RENTAL_TENANT 10:00]` (created_at) → `RENTAL_TENANT`; (iii) só `PROPERTY_MANAGER` → ele; (iv) dois `RENTAL_TENANT` sem `is_primary` → o de `created_at` mais antigo; (v) sem contatos → `null`; (vi) `snapshot_phone '0412 345'` (não E.164) → `phone null`, nome mantido;
   - **janela do appointment, não do grupo (L-F04-11):** appointment de um grupo com `time_window '08:00-12:00'` e `time_slot_start/end` `13:00–15:00` → `windowStartAt/windowEndAt` = 13:00/15:00 locais da agência convertidos; nenhum campo de grupo no candidato.
   - hoje sem plano → calcula (`trigger ON_OPEN`), `PUBLISHED`, `publishedAt = now`, sem aviso;
   - hoje com plano e impressão igual → devolve o gravado **sem** chamar o routing;
   - hoje com plano e impressão diferente → recalcula;
   - hoje com `status STALE` e impressão **diferente** → recalcula;
   - **STALE sem mudança (L-F04-01):** plano `PUBLISHED` v4 com A executada; A recebe check-out (`finished_at`) e SCHEDULED→DONE → subscriber marca `STALE` (v5); `GET` → impressão igual → **nenhuma** chamada ao routing (`FakeRoutingService` com contador 0), resposta com a mesma ordem e as mesmas ETAs, `status 'PUBLISHED'`, `version 6`, `stale_at/stale_reason` nulos, log `day_plan.stale_cleared_noop`; plano `DRAFT` STALE com impressão igual (via AM/OP) → volta a `DRAFT`;
   - D+1 antes de 19:30 (no fuso do inspetor) **sem** `published_at` → 404 `DAY_PLAN_NOT_PUBLISHED`; D+1 com plano `DRAFT` antes de 19:30 → 404 `DAY_PLAN_NOT_PUBLISHED`;
   - **`published_at` manda (L-F04-02):** inspetor em `Australia/Perth`, plano de 2026-11-05 publicado pelo job às 19:30 de Sydney (`2026-11-04T08:30:00Z` = 16:30 de Perth); `GET` às `2026-11-04T08:35:00Z` (16:35 em Perth) → **200** com o plano (sem recalcular se a impressão confere);
   - **auto-publicação exige os dois fusos (L-F04-02):** inspetor em `Australia/Sydney`, sem plano, `now = 2026-11-04T08:31:00Z` (19:31 Sydney) → calcula e grava `PUBLISHED`; inspetor em `Australia/Perth`, sem plano, `now = 2026-11-04T11:31:00Z` (19:31 Perth, 22:31 Sydney) → publica; inspetor com `users.timezone = 'Pacific/Auckland'` (fuso hipotético à frente da plataforma), sem plano, `now = 2026-11-04T06:31:00Z` (19:31 Auckland, 17:31 Sydney) → 404 `DAY_PLAN_NOT_PUBLISHED` (janela da plataforma fechada); às `08:31Z` → publica;
   - D+1 depois de 19:30 nos dois fusos, sem plano → calcula e grava `PUBLISHED` (sem aviso; `notifiedAt` continua nulo para o job avisar);
   - data passada com plano → devolve gravado, **sem** recalcular, mesmo com impressão diferente (`status` devolvido = `STALE`); data passada sem plano → 404 `DAY_PLAN_NOT_FOUND`;
   - D+2 → 404 `DAY_PLAN_NOT_PUBLISHED`;
   - 0 appointments hoje → plano vazio gravado (`stops []`, `geometry null`, `finishEta null`);
   - parada cujo appointment foi reatribuído a outro inspetor → nunca aparece na resposta (join por `inspector_id`).
   - **parada fora de SCHEDULED/DONE (L-F04-04):** plano gravado com A (DONE); A volta a `DRAFT` mantendo `inspector_id` → a resposta não traz A (join com `status IN ('SCHEDULED','DONE')`) e o serializer não lança; a impressão mudou → recalcula.
   - duas chamadas concorrentes na mesma instância → uma só computação (single-flight por `inspectorId:date`).
   - **`executed` vivo:** plano gravado com A `executed false`; A recebe check-in → o `GET` vê a impressão diferente, recalcula e devolve A com `executed true` no prefixo; mesmo se o recálculo perder a corrida (CAS), a resposta deriva `executed`/`executionStatus` do estado atual da execução, nunca do valor gravado.
   - plano aproximado com `approximateReason` `RATE_LIMITED`/`PROVIDER_ERROR`/`DEADLINE` e `computed_at` há mais de 5 min → o `GET` recalcula (nova tentativa com Mapbox) mesmo com impressão igual; há menos de 5 min → devolve o gravado.
   - `routingInput.legTravelS` = durações finais (Directions) dos pares adjacentes da ordem gravada; `routingInput.earliestDepartureAt` = `max(now, departureAt)` para hoje, `null` nas outras datas.
5. `save-day-plan-order.use-case.test.ts`:
   - ordem `[B, A, C]` com `basedOnVersion` atual → grava `manualOrder true`, todas as paradas reordenáveis `manual true`, `trigger REORDER`, Directions por trecho (sem Matrix: usa a matriz gravada), `version + 1`; audit `day_plan.reordered` com `before.order`/`after.order`;
   - ordem igual à sugerida → `manualOrder false`, `manual false`;
   - ordem que estoura janela (Exemplo 2 com `[A, B, C]`) → **200** com `feasible false` e `violations [{ appointmentId: C, lateS: 3000 }]` (D3, só avisa);
   - `basedOnVersion` antigo → 409 `DAY_PLAN_VERSION_CONFLICT` com `details.currentVersion`; **exceto** replay: se a ordem gravada já é a pedida e `manualOrder` confere → 200 com o plano atual (idempotente);
   - plano `STALE` ou impressão diferente → 409 `DAY_PLAN_STALE`;
   - ids diferentes do conjunto reordenável (faltando, sobrando, iniciada incluída, repetida) → 422 `DAY_PLAN_ORDER_MISMATCH` com `details.expectedAppointmentIds`;
   - **reordenar com a parada 1 em andamento (bloqueador da revisão):** plano `A,B,C` publicado; A recebe check-in (sem check-out); o PWA faz `GET` (recalcula: A no prefixo, `executed true`, `version` nova) e envia `PUT { appointmentIds: [C, B], basedOnVersion: <nova> }` → **200**, ordem `A, C, B`, A continua `executed`; enviar `[A, C, B]` → 422 `DAY_PLAN_ORDER_MISMATCH` com `expectedAppointmentIds [B, C]`; enviar `[C, B]` com a versão **anterior** ao check-in → 409 `DAY_PLAN_STALE` (impressão mudou), e o `GET` seguinte destrava;
   - o conjunto reordenável do `PUT` é calculado **do estado atual** (não iniciadas, D18), igual ao `GET`;
   - data passada → 422 `DAY_PLAN_DATE_IN_PAST`; sem plano → 404 `DAY_PLAN_NOT_FOUND`;
   - Mapbox fora → grava com `approximate true` e `approximateReason` (sem erro; caminho interativo).
6. `recalculate-day-plan.use-case.test.ts`:
   - INSP no próprio plano → `OPTIMIZE` (descarta a ordem manual), `trigger MANUAL_RECALC`, sem aviso;
   - OP num plano já publicado (D+1, depois das 19:30) com ordem nova → recalcula, `ROUTE_CHANGED` com `dedupeKey 'route-changed:{planId}:{floor(epochMs/600000)}'`, título "Your route for Thu 5 Nov was updated";
   - **mudança efetiva (L-F04-06):** recálculo da OP que devolve a mesma ordem e `serviceStartAt` com diferença ≤ 5 min em todas as paradas → nova versão gravada, **nenhum** aviso; diferença de 6 min numa parada → aviso;
   - **agregação (L-F04-06):** 3 recálculos da OP com ordens diferentes em 2 min (relógio injetado `10:00:10`, `10:01:00`, `10:01:50`, mesma janela de 10 min) → `publishSystemInspectorNoticeUseCase` chamado 3 vezes com o **mesmo** `dedupeKey` → 1 aviso criado (dedupe da F02); recálculo às `10:10:05` → `dedupeKey` novo, 2º aviso;
   - **hoje com prefixo (L-F04-06):** A executada, B e C pendentes → corpo "first stop at {HH:mm de B} in {suburb de B}"; todas iniciadas → corpo "Operations recalculated your route: {n} inspection(s) remaining. Open Properfy to see the new order." com `n` = paradas não DONE;
   - OP em D+1 **antes** das 19:30 sem plano → cria `DRAFT`, sem aviso; o job depois publica;
   - OP em data passada → 422 `DAY_PLAN_DATE_IN_PAST`;
   - OP para inspetor inexistente → 404 `INSPECTOR_NOT_FOUND`;
   - audit `day_plan.recalculated` com `actorType USER`, `metadata { trigger, inspectorId, date }`.
7. `set-day-plan-origin.use-case.test.ts`:
   - endereço válido → `geocodeWithTimeout(..., { mode: 'permanent' })` com `formatGeocodingQuery(address)` → grava `origin_override_*`, recalcula (`trigger ORIGIN_CHANGE`, preserva ordem manual), audit `day_plan.origin_overridden` com `after { suburb, state, postcode }` e **sem** coordenadas;
   - mesmo endereço já gravado e plano fresco → 200 sem recalcular;
   - geocodificação `null` → 422 `DAY_PLAN_ORIGIN_NOT_FOUND`, nada muda;
   - **qualquer** erro do geocodificador (`GeocodeTimeoutError`, `MapboxPermanentGeocodingUnavailableError`, `Error('Mapbox geocoding failed with status 500')`, circuito aberto, erro de rede, exceção inesperada) → 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE`, nunca 500; nada muda; log `day_plan.origin_geocode_failed { errorName }`;
   - hoje sem plano → calcula o plano e aplica; D+1 com plano publicado → aplica; D+1 antes da publicação → 404 `DAY_PLAN_NOT_PUBLISHED`; passado → 422;
   - `inspectors.address`, `base_lat`, `base_lng` **não** mudam;
   - `DELETE` → limpa o override, recalcula, audit `day_plan.origin_override_cleared`; sem override → 200 idempotente.
   - **dia já iniciado (L-F04-07):** hoje com A executada → `PUT` → 422 `DAY_PLAN_ALREADY_STARTED` "Your day has started; the route continues from your last stop.", sem chamar o geocodificador nem recalcular, `origin_override_*` intactos; D+1 (nada executado) → aplica normalmente; `DELETE` com A executada e override presente → 200, override limpo, `origin.source 'LAST_STOP'`.
8. `mark-day-plans-stale.subscriber.test.ts`:
   - `STATUS_TRANSITION` de um appointment presente em `day_plan_stops` → plano `STALE`, `stale_reason 'APPOINTMENT_STATUS_CHANGED'`, `version + 1`;
   - transição para SCHEDULED de appointment com `inspector_id`/`scheduled_date` que têm plano mas sem parada dele → plano `STALE`;
   - `INSPECTOR_CHANGED`, `SCHEDULE_CHANGED`, `MEMBERS_ADDED`, `ACCEPTED`, `MANUALLY_ASSIGNED` → membros do grupo → planos afetados `STALE` (inclui o plano do inspetor anterior e o da data anterior);
   - `INSPECTOR_FIELD_EVENTS.RECORDED` com `type 'CANT_DO'` → `STALE` (`stale_reason 'INSPECTOR_CANT_DO'`); `LATE_NOTICE` (payload com `estimatedArrivalAt`, R-F03) → nada;
   - **`BASE_CHANGED` (R-F01-03):** `{ inspectorId: insp-1, hadCoordinates: true, hasCoordinates: true }` com planos `PUBLISHED` de hoje e D+1, `DRAFT` de D+1 de outro cenário, `PUBLISHED` de D+2 e de ontem → só hoje e D+1 `PUBLISHED` viram `STALE` (`stale_reason 'BASE_CHANGED'`, `version + 1`); `{ hadCoordinates: false, hasCoordinates: false }` → nenhum plano tocado; plano já `STALE` → no-op; plano com override do dia → marcado `STALE`, e o `GET` seguinte vê a impressão igual e só limpa (sem routing); evento de outro inspetor → nada;
   - **idempotente:** o "Não consigo fazer" emite o evento de campo **e** a transição para REJECTED; o 1º marca `STALE` (`version + 1`), o 2º é no-op (sem novo incremento); plano já `STALE` por qualquer motivo → no-op;
   - **precedência do `stale_reason`:** vale o **primeiro** motivo desde o último cálculo (cronológico); marcações seguintes não o trocam; o próximo cálculo zera `stale_at`/`stale_reason`;
   - planos com `plan_date` anterior a **hoje no fuso do próprio plano** (`day_plans.timezone`) não são tocados; o de hoje é;
   - erro no repositório → log `day_plan.stale_mark_failed`, sem relançar.
9. `publish-day-plans.use-case.test.ts` (conjunto devido derivado dos claims `day-plan.publish` de `ag-syd` em `2026-11-04`):
   - 2 inspetores com SCHEDULED em 2026-11-05 → 2 planos `PUBLISHED` (`trigger SCHEDULED_PUBLISH`, `publishedAt`), 2 avisos `ROUTE_PUBLISHED` (`dedupeKey 'route-published:{inspectorId}:2026-11-05'`, título "Your route for tomorrow is ready", corpo "3 inspections on Thu 5 Nov. First stop at 08:00 in Surry Hills; finish around 10:35. Open Properfy to see the order."), `notifiedAt` gravado;
   - plano já `PUBLISHED` e `notifiedAt` preenchido → não recalcula nem avisa;
   - plano `PUBLISHED` (aberto pelo inspetor antes do job) com `notifiedAt` nulo → só avisa;
   - plano `DRAFT`/`STALE` sem `publishedAt` → recalcula e publica;
   - inspetor com appointments também em `ag-per` (Perth) sem claim `day-plan.publish` para o dia local de Perth → **pulado** (publicado quando Perth for reivindicada); agência inativa não bloqueia;
   - inspetor INACTIVE ou deletado → pulado;
   - **sequencial:** inspetores processados um por vez, em ordem de `inspectorId` (nunca em paralelo); `PlanRouteService` chamado com `interactive: false`, `strict: true` nas tentativas 1–2;
   - **limite/429:** o `PlanRouteService` lança `RoutingDeferredError('RATE_LIMITED')` no 2º inspetor → o 1º fica publicado; o 2º e os seguintes **não** são gravados nem aproximados; o use case devolve `{ deferred: 2, continuation: true }` e o worker enfileira a continuação (teste 10);
   - **orçamento de tempo:** relógio injetado passa de `budgetMs` (25 min) depois do 3º inspetor → para, devolve `continuation: true`;
   - **erro do provedor:** `RoutingDeferredError('PROVIDER_ERROR')` na tentativa 1 e 2 → adiado; na tentativa 3 (`job.data.attempt = 3`) → `strict: false`, publicado com `approximate true`, `approximateReason 'PROVIDER_ERROR'` e corpo com " Travel times are approximate.";
   - sem config `mapbox` → publicado aproximado (`NO_PROVIDER`) já na 1ª tentativa;
   - erro inesperado de um inspetor (não `RoutingDeferredError`) → log `day_plan.publish_failed`, segue para o próximo, conta em `failed`; não relança;
   - **plano inviável (L-F04-05):** Exemplo 5 da F04-1 (A e B 08:00–08:30) → publicado com `feasible false`; audit `day_plan.published` com `metadata { …, feasible: false, lateS: 1500 }`; corpo do aviso "2 inspections on Thu 5 Nov. First stop at 08:00 in Surry Hills; finish around 09:40, 1 stop may arrive after its window. Open Properfy to see the order."; log `warn` `day_plan.published_infeasible { inspectorId, date, violations: [{ appointmentId: B, lateS: 1500 }] }`; `publish_completed.infeasible 1`; plano viável → nenhum desses;
   - **nível do log (L-F04-09):** lote com `approximate 1` por `PROVIDER_ERROR` → `publish_completed` em `error`; só `NO_PROVIDER` → `info`; `deferred > 0` com `attempt 3` → `error`; `metrics.dayPlansApproximateTotal.PROVIDER_ERROR` incrementado;
   - **conteúdo de tela bloqueada (R-F02):** fixture com contato `Sam Lee +61412345678`, chave com `meetingLocation 'Lockbox 4321'` e endereço `12 King St` → título e corpo de `ROUTE_PUBLISHED` (e de `ROUTE_CHANGED` no teste 6) não contêm o nome, o telefone, `Lockbox`/`4321` nem o número da rua (só suburb); o `dedupeKey` é o mesmo em duas execuções do job para o mesmo `(inspectorId, date)`;
   - log `day_plan.publish_completed { due, published, notified, deferred, skipped, failed, approximate, infeasible, durationMs, continuation }`.
10. `day-plan-publish.worker.test.ts` (pg-boss fake, **sem** mudar o `TenantCronTick`):
    - schedule `day-plan.publish` em `'30 * * * *'` (Sydney), `boss.work` com `{ teamSize: 1, teamConcurrency: 1 }` e o job enviado com `singletonKey 'day-plan.publish'` e `expireInMinutes 30`;
    - runner do `tenantCronTick.runDue('day-plan.publish', 19, runner)`: para cada tenant do grupo, `cronJobRunRepo.hasClaim('appointment.reject-unconfirmed', tenantId, group.todayCivil)`; sem claim → `releaseClaims('day-plan.publish', [tenantId], todayCivil)` (o próximo tick tenta de novo); com claim → mantém;
    - Sydney às 19:30 (tick `:30`) com T-1 reivindicado às 19:00 → tenant reivindicado e publicado;
    - Adelaide (UTC+10:30): o tick `:30` de Sydney cai em `:00` de Adelaide; às 19:00 de Adelaide o T-1 (que roda no `:00` de Sydney = `:30` de Adelaide) ainda não foi reivindicado → claim liberado; às 20:00 de Adelaide → publica (atraso aceito de 30 min, Achado 10);
    - `continuation: true` → `boss.send('day-plan.publish', { attempt: n + 1 }, { singletonKey: 'day-plan.publish', startAfter: 120, expireInMinutes: 30 })`; `attempt` vai de 1 a 3 e depois volta a 1 no tick seguinte;
    - `DAY_PLAN_PUBLISH_ENABLED=false` → nenhum schedule nem worker; `boss.unschedule('day-plan.publish')` chamado;
    - regressão: `TenantCronTick` e os 4 jobs existentes inalterados (arquivo não muda).
11. `prisma-cron-job-run.repository.test.ts` (suíte db): `hasClaim(job, tenant, date)` → `true` depois de `tryClaim`, `false` antes e depois de `releaseClaims`.
12. `eta-accuracy.use-case.test.ts` (repositório em memória):
    - 40 paradas com `published_service_start_at` e check-in 5 min depois → `meanAbsoluteErrorMinutes 5.0`, `sampleSize 40`, `status 'OK'`;
    - **usa a ETA publicada, não a última:** parada publicada para 09:00, recalculada às 09:30 (nova previsão 09:40), check-in 09:42 → erro **42 min** (contra a publicada), não 2;
    - 40 paradas com erro de 12 min → `status 'ABOVE_THRESHOLD'`;
    - 29 amostras → `status 'INSUFFICIENT_DATA'`, média calculada mesmo assim;
    - erro de 200 min → excluído (`excludedOutliers 1`);
    - `published_approximate true`, sem ETA publicada, `published_predicted_at > started_at` (entrou no plano depois do check-in) ou execução abandonada → fora;
    - `days` 7 e 90 aceitos; 6 e 91 → 400.
13. `preview-route-weights.use-case.test.ts`:
    - Exemplo 6 da F04-1: pesos salvos padrão + propostos `{1,0,1}` → `current.order [A, C, B]`, `proposed.order [A, B, C]` (proposto com `totals.waitS 2100`); **uma** chamada de Matrix e **nenhuma** de Directions; horários da matriz (`etaSource 'MATRIX'`), com folga para frente;
    - sem appointments → `{ current: { stops: [] }, proposed: { stops: [] } }`;
    - pesos inválidos (todos 0, 10.5, 0.15) → 400 `VALIDATION_ERROR`;
    - **faixa de datas (L-F04-14):** ator em Sydney, `now = 2026-11-04T23:00:00Z` (05/11 local) → `date` 2026-11-05 e 2026-11-19 aceitos; 2026-11-04 e 2026-11-20 → 422 `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` "Pick a day between today and 14 days ahead", sem chamar o routing;
    - não grava nada (repositório sem escrita).
14. `route-weights-setting.test.ts` (shared): registro `routeWeights` com defaults `{1,1,1}`; aceita 0, 0.1, 9.9, 10; rejeita −0.1, 10.1, 0.15, todos zero ("At least one weight must be greater than 0"); `resolvePlatformSettingValue('routeWeights', {})` → defaults.
15. `day-plan-sheet.test.ts`:
    - XLSX: reler com ExcelJS → planilha "Route", cabeçalho `#, Window, ETA, Address, Service, Contact, Key`; linha 1 = `1, 08:00–17:00, 08:00, 12 King St, Surry Hills NSW 2010, Routine, Jane Doe · 0412 345 678, No`; parada com chave → `Yes — Front desk`; sem contato → `—`; parada executada sem previsão → ETA `—`; fuso da agência aplicado (Perth mostra 08:00 local);
    - XLSX: linhas de cabeçalho acima da tabela com "Inspector", "Date", "Starting from", "Finish", "Drive time" e, quando for o caso, "Approximate route" e "This route may be out of date (generated 04/11/2026 19:30)";
    - PDF: buffer começa com `%PDF`; o gerador recebe as mesmas linhas (spy no `render`); 25 paradas → paginação sem perder linha;
    - nenhum UUID no conteúdo (regex) — memória "no raw ids".
    - **fusos misturados (L-F04-10):** plano (`plan.timezone` Sydney) com uma parada de agência em Perth 08:00–10:00 e outra em Sydney 08:00–10:00 → coluna ETA/Window com sufixo ("08:00 AWST", "08:00–10:00 AWST"; "08:00 AEDT"), preâmbulo com a linha "Times in each agency's local time", "Finish: ~10:35 AEDT"; plano com um só fuso → sem sufixo nem a linha extra;
    - **aproximado (L-F04-10):** `approximate true` → "Approximate route: some travel times are estimates" (nunca "straight-line");
    - **datas (L-F04-10):** preâmbulo "Date: 05/11/2026" e "generated 04/11/2026 19:30 AEDT" (um só formato `dd/MM/yyyy`);
    - **slug (L-F04-10):** "Zoë Ñúñez" → `route-zoe-nunez-2026-11-05.pdf`; "李雷" → `route-inspector-2026-11-05.pdf`.
16. `purge-day-plan-route-data.use-case.test.ts`: planos com `plan_date < hoje (Sydney)` → `route_geometry`, `routing_matrix_json` e `leg_travel_json` nulos, `geometry_purged_at` preenchido; hoje e futuros intocados; rodar 2× → 0 na segunda.
16b. `get-fresh-stop-for-appointment.use-case.test.ts` (leitura para a F06):
    - plano fresco → `{ status: 'FRESH', serviceStartAt, lateS, approximate, manual, planVersion }` sem chamar o routing;
    - `update-appointment` mudou a janela (sem evento) → impressão diferente → recalcula (`trigger ON_OPEN`, regra de ordem do `GET`) e devolve `status 'FRESH'` com a nova previsão;
    - mudança de coordenada do imóvel e `bulk-reschedule` para outro dia → idem (no 2º caso o appointment sai do plano: `null`);
    - recálculo falha ou perde o CAS duas vezes → `{ status: 'STALE', … }` com a previsão gravada (o consumidor decide não avisar);
    - plano `STALE` por check-out com impressão igual (L-F04-01) → limpa o STALE sem chamar o routing e devolve `status 'FRESH'` com a previsão gravada;
    - appointment que voltou a `DRAFT` mantendo `inspector_id` (L-F04-04) → `null`;
    - data passada → nunca recalcula (`status 'STALE'` se divergente);
    - appointment sem plano / de outro inspetor → `null`.
16c. **`onboarding_completed_at` (fatia do tour, movida da TASK-F04-3b):**
    - `packages/shared/src/schemas/__tests__/inspector.test.ts`: `inspectorAppStateSchema` aceita `onboardingCompleted: true`; rejeita `false` e `'yes'`; sem a chave continua válido;
    - `record-inspector-app-state.use-case.test.ts` (contrato do repo da F01, R-F01-02): `onboardingCompleted: true` → **uma** chamada a `repo.recordAppState({ id, now, displayMode, pushEnabled, appVersion, onboardingCompleted: true })`, sem `findById` antes; sem a chave → `onboardingCompleted` ausente/`false` na mesma chamada; `affected 0` (soft-deleted) → 404; regras da F01 inalteradas;
    - `inspector-base-coords.integration.test.ts` (suíte db da F01, casos novos de `recordAppState`): coluna nula + `onboardingCompleted` → grava `now`; coluna preenchida → mantém (`COALESCE` na mesma instrução `$executeRaw`); sem a flag → não toca; dois POST em paralelo com T1 e T2 → a coluna fica com um dos dois e não muda depois; `app_last_seen_at`/`push_enabled`/`app_installed_at` com o mesmo resultado de antes;
    - `inspector-app-state.integration.test.ts`: POST com `onboardingCompleted: true` → 204; `GET /v1/inspectors/me` → `onboardingCompletedAt` ISO; 2º POST não muda; `GET /v1/inspectors/:id` como AM/OP → presente; como CL_ADMIN → ausente;
    - `inspector-field-visibility.test.ts`: `onboardingCompletedAt` visível para AM/OP/INSP próprio; removido para CL_*.

**B. Rotas (supertest, `apps/backend/tests/integration/day-plan/`)**
17. RBAC matriz completa (ver Contratos), incluindo: CL_ADMIN/CL_USER → 403 `FORBIDDEN` com a mensagem existente do `assertRoles` (`Role CL_ADMIN is not permitted to perform day_plan.view`) e audit `authorization.denied` em **todas**; INSP em rota AM/OP → 403 `FORBIDDEN`; AM/OP em rota `/v1/inspector/...` → 403 `INSP_ONLY`; INSP sem `inspectorId` → 403 `INSPECTOR_NOT_LINKED`. Atenção à memória "validation antes de auth": param inválido devolve 400 antes do 403 (testar com params válidos).
18. `GET /v1/inspector/day-plans/2026-11-05` → 200 com o shape exato de `dayPlanResponseSchema`; **nenhum** campo fora do schema (o serializer remove); o corpo não contém `access_token` nem `mapbox`.
19. Data inválida (`2026-13-01`, `today`) → 400 `VALIDATION_ERROR`.
20. `PUT /order` sem `basedOnVersion` → 400; corpo com 26 ids → 400 (máx 25).
21. `GET …/sheet?format=pdf` → 200, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="route-jane-doe-2026-11-05.pdf"`; `format=xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; `format=csv` → 400.
22. `GET /v1/day-plans/eta-accuracy` como AM → 200; como INSP → 403.
23. `POST /v1/day-plans/preview` 11 vezes em 1 min → 429 na 11ª.
24. Rotas estáticas × paramétricas: `/v1/day-plans/preview` e `/v1/day-plans/eta-accuracy` não colidem com `/v1/day-plans/:inspectorId/:date`.
24b. **Status fora do enum (L-F04-04):** plano gravado com A, B; `UPDATE appointments SET status='DRAFT' WHERE id = A` direto no banco (mantém `inspector_id`); `GET /v1/day-plans/:inspectorId/:date` como AM → **200** sem A e `status 'STALE'` (nunca 500 do serializer); `GET /v1/inspector/day-plans/:date` como o INSP → 200 recalculado sem A; folha AM/OP → sem a linha de A.
24c. **Rate limits (L-F04-14):** `GET /v1/day-plans/:inspectorId/:date` 121 vezes em 1 min pelo mesmo usuário → 429 na 121ª; `GET …/sheet` AM/OP 21 vezes → 429 na 21ª.
24d. **Folha (L-F04-10):** `GET /v1/inspector/day-plans/:date/sheet?format=pdf` com `date` = hoje − 30 → 200; hoje − 31 → 422 `DAY_PLAN_SHEET_TOO_OLD` "Route sheets are available for the last 30 days"; AM/OP sem limite de data; cada 200 grava 1 audit `day_plan.exported` (`actorType USER`, `metadata { format: 'pdf', date, stops: 3, actorRole: 'INSP' }`, sem nome/telefone/endereço — regex no JSON do audit).
24e. **Origem com o dia iniciado (L-F04-07):** `PUT /v1/inspector/day-plans/:date/origin` hoje depois de um check-in → 422 `DAY_PLAN_ALREADY_STARTED`; o `GET` seguinte traz `origin.source 'LAST_STOP'` e o schema aceita o valor.

**C. Banco (suíte db, testcontainers em série)**
25. Migration aplica e o `prisma migrate diff` fica limpo; unique `(inspector_id, plan_date)` impede 2 planos.
26. `saveComputed` com CAS: `UPDATE … WHERE id = $1 AND version = $2` → 0 linhas quando a versão mudou; substituição de paradas na mesma transação (sem violar `(day_plan_id, sequence)`).
26b. **Join de leitura com status (L-F04-04, suíte db):** o repositório devolve as paradas re-unidas com `a.status IN ('SCHEDULED','DONE')`; appointment em `DRAFT`/`REJECTED`/`CANCELLED` com o mesmo `inspector_id` não volta; a consulta da métrica usa o mesmo filtro.
27. `markStaleByAppointmentIds`: plano `PUBLISHED` → `STALE`, `version + 1`, `stale_reason` gravado; já `STALE` → **0 linhas** (sem incremento, motivo original mantido); plano com `plan_date` = ontem no fuso do plano → intocado; plano de hoje num fuso atrás de Sydney (Perth às 00:30 de Sydney) → marcado, porque "hoje" é `(now() AT TIME ZONE day_plans.timezone)::date`.
27a. `markStaleByInspector(inspectorId, 'BASE_CHANGED')` (R-F01-03): `PUBLISHED` de hoje e de D+1 (no fuso do plano) → `STALE`, `version + 1`; `DRAFT`, ontem, D+2 e plano de outro inspetor → intocados; 2ª chamada → 0 linhas.
27b. `PUT /v1/inspector/day-plans/:date/order` integração ponta a ponta do bloqueador: publica o plano, chama `POST /v1/inspector/appointments/:id/start` (check-in da parada 1, F03), `GET` (vê A `executed`), `PUT` com as 2 restantes → 200.
28. Consulta da métrica com `$queryRaw` (memória `::int`): resultado bate com o cálculo manual de 3 linhas.
29. Consulta de candidatos usa `(scheduled_date, inspector_id)` (EXPLAIN em teste opcional, sem asserção rígida).

**D. E2E backend (01.A1, Mapbox stubado)**
30. `day-plan-publish.e2e.test.ts`: seed com 1 agência, 1 inspetor com base, 3 appointments SCHEDULED confirmados para amanhã + 1 ROUTINE não confirmado; roda `appointment.reject-unconfirmed` às 19:00 (relógio injetado) → o não confirmado vira REJECTED; roda `day-plan.publish` às 19:30 → plano com 3 paradas em sequência, `eta` e `published_eta` em todas, `routeGeometry` FeatureCollection com 3 trechos (`approximate true`, `approximateReason 'NO_PROVIDER'` porque é stub), aviso `ROUTE_PUBLISHED` criado para o inspetor (F02) e job de entrega enfileirado (00.A2 parcial).

### Escopo / Passos
1. **Migration** `YYYYMMDDhhmmss_day_plans` (ver Modelo de dados).
2. **Shared:**
   - `packages/shared/src/enums/day-plan.ts`: `DayPlanStatus`, `DayPlanComputeTrigger`, `DayPlanOriginSource`, `DayPlanOriginWarning`, `RoutingProvider`;
   - `packages/shared/src/constants/day-plan.ts`: `DAY_PLAN_PUBLISH_LOCAL_TIME = '19:30'`, `DAY_PLAN_PUBLISH_HOUR = 19`, `DAY_PLAN_PUBLISH_MINUTE = 30`, `ROUTE_ETA_ACCURACY_THRESHOLD_MINUTES = 10`, `ROUTE_ETA_ACCURACY_MIN_SAMPLE = 30`, `ROUTE_ETA_ACCURACY_OUTLIER_MINUTES = 180`, `DAY_PLAN_MAX_STOPS_PER_ORDER = 25`;
   - `packages/shared/src/schemas/day-plan.ts`: schemas de request/response (Contratos) e `toOptimizerInput(plan: DayPlanResponse): OptimizerInput | null` (para o PWA reordenar localmente);
   - registro `routeWeights` em `PLATFORM_SETTINGS_REGISTRY` (`section: 'Route planning'`).
3. **Backend `modules/day-plan`:**
   - `domain/`: `day-plan.entity.ts`, `day-plan.repository.ts` (`IDayPlanRepository`), `day-plan-input.reader.ts` (`IDayPlanInputReader`), `day-plan-fingerprint.ts` (exporta `computeDayPlanFingerprint` e `FingerprintInput`, L-F04-16), `classify-stops.ts` (exporta `classifyStops` e `ClassifiableStop`, tipos planos, L-F04-16), `primary-contact.ts` (`selectPrimaryContact(contacts)`, regra de L-F04-08), `publication-window.ts` (`isPublicationOpen` + `isPublicationOpenForInspector`, L-F04-02), `day-plan.errors.ts` (inclui `DAY_PLAN_ALREADY_STARTED`, `DAY_PLAN_SHEET_TOO_OLD`, `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE`);
   - `application/use-cases/`: `compute-day-plan.use-case.ts` (núcleo), `get-my-day-plan.use-case.ts`, `get-day-plan-for-operator.use-case.ts`, `save-day-plan-order.use-case.ts`, `recalculate-day-plan.use-case.ts`, `set-day-plan-origin.use-case.ts`, `clear-day-plan-origin.use-case.ts`, `publish-day-plans.use-case.ts`, `purge-day-plan-route-data.use-case.ts`, `get-day-plan-sheet.use-case.ts`, `preview-route-weights.use-case.ts`, `get-route-eta-accuracy.use-case.ts`, `get-fresh-stop-for-appointment.use-case.ts` (F06);
   - `application/subscribers/mark-day-plans-stale.subscriber.ts` (inclui `INSPECTOR_EVENTS.BASE_CHANGED` da F01 → `markStaleByInspector`, R-F01-03; `IDayPlanRepository.markStaleByInspector(inspectorId, reason)`);
   - `application/day-plan-notices.ts` (textos dos avisos);
   - `infrastructure/`: `prisma-day-plan.repository.ts`, `prisma-day-plan-input.reader.ts`, `day-plan-sheet.renderer.ts` (usa `ExcelJsXlsxGenerator` com aba "Route" via parâmetro opcional `sheetName` e um renderer pdfkit próprio no padrão do `PdfKitInvoicePdfGenerator`);
   - `interfaces/day-plan.routes.ts` (inspetor e AM/OP).
4. **`TenantCronTick` não muda.** Só `ICronJobRunRepository.hasClaim(jobName, tenantId, localDate): Promise<boolean>` (novo método no repositório e na implementação Prisma: `SELECT 1 FROM cron_job_runs WHERE job_name = $1 AND tenant_id = $2 AND local_date = $3`).
5. **`ExcelJsXlsxGenerator.generate(columns, rows, opts?: { sheetName?: string; preamble?: string[][] })`** — opcional, sem mudar chamadas existentes.
6. **Workers** (`workers.ts`):
   - `day-plan.publish`: `boss.schedule('day-plan.publish', '30 * * * *', {}, SYDNEY_TZ)`; `boss.work('day-plan.publish', { teamSize: 1, teamConcurrency: 1 }, withJobMetrics(...))`; o handler roda `tenantCronTick.runDue('day-plan.publish', 19, gateRunner)` (o `gateRunner` só confere `hasClaim('appointment.reject-unconfirmed', tenantId, group.todayCivil)` e libera o claim dos tenants sem T-1) e depois `publishDayPlansUseCase.execute({ attempt: job.data.attempt ?? 1, budgetMs: 25 * 60_000 })` sobre o **conjunto devido** (Algoritmo §6); `continuation: true` → `boss.send('day-plan.publish', { attempt }, { singletonKey: 'day-plan.publish', startAfter: 120, expireInMinutes: 30 })`.
   - `day-plan.purge-route-data` (`45 3 * * *`, Sydney).
   - Ambos com `withJobMetrics`; kill switch `DAY_PLAN_PUBLISH_ENABLED` (padrão `'true'`; `'false'` não registra o schedule e chama `boss.unschedule('day-plan.publish')`); atualizar a lista do log final.
7. **Container:** `container.dayPlan.{...use cases}`; registrar o subscriber no `domainEventBus`.
8. **Fatia do tour (`onboarding_completed_at`, movida da TASK-F04-3b):**
   - migration `YYYYMMDDhhmmss_inspector_onboarding_completed_at`: `ALTER TABLE "inspectors" ADD COLUMN "onboarding_completed_at" TIMESTAMP(3) NULL` (expand puro);
   - `schema.prisma`: `onboarding_completed_at DateTime?`;
   - shared `inspectorAppStateSchema.onboardingCompleted: z.literal(true).optional()`; `inspectorResponseSchema.onboardingCompletedAt: instantStrNullable().optional()`;
   - `record-inspector-app-state.use-case.ts` repassa `onboardingCompleted` a `repo.recordAppState(...)`; em `prisma-inspector.repository.ts`, a instrução única `$executeRaw` de `recordAppState()` (F01 L-F01-02) ganha `onboarding_completed_at = CASE WHEN $onboardingCompleted THEN COALESCE(onboarding_completed_at, $now) ELSE onboarding_completed_at END` (nada de `updateMany`, R-F01-02);
   - `GET /v1/inspectors/me` e o detalhe AM/OP devolvem `onboardingCompletedAt`; `inspector-field-visibility.ts` no grupo "AM/OP + INSP próprio" (CL não recebe).
9. **api-types:** `pnpm generate:api`; build do shared.
10. **Lacunas de 2026-10-29 (resumo dos pontos de código):**
   - STALE sem mudança (L-F04-01): ramo "impressão igual → `clearStale`" no `GetMyDayPlan`, no `GetFreshStopForAppointment` e na folha do INSP; método `IDayPlanRepository.clearStale(id, expectedVersion)` (CAS).
   - Janela/`published_at` (L-F04-02): `GetMyDayPlan` e as escritas de origem decidem pela regra das Decisões aplicáveis.
   - Join com status (L-F04-04) em todas as consultas de leitura do `PrismaDayPlanRepository`, na métrica e no leitor da folha.
   - Inviável (L-F04-05): metadata dos audits, sufixo do corpo do `ROUTE_PUBLISHED` em `day-plan-notices.ts`, log `warn`, contador `infeasible` no `publish_completed`.
   - `ROUTE_CHANGED` (L-F04-06): comparação com o plano anterior (`hasEffectiveChange(prevStops, nextStops, 5 min)`) e o `dedupeKey` por janela de 10 min no `RecalculateDayPlanUseCase`.
   - `LAST_STOP` (L-F04-07): valor novo no enum `DayPlanOriginSource` (Prisma + shared), montagem da `origin` efetiva na resposta e a guarda 422 no `SetDayPlanOrigin`.
   - Contato (L-F04-08): `selectPrimaryContact` no leitor; `primaryContact.role` no schema.
   - Observabilidade (L-F04-09): `dayPlansApproximateTotal` no `MetricsCollector`; nível do log do `publish_completed`.
   - Folha (L-F04-10): audit `day_plan.exported`, limite de 30 dias do INSP, sufixos de fuso, copy, slug e formato de data no `day-plan-sheet.renderer.ts`.
   - Limites (L-F04-14): `config.rateLimit` das rotas AM/OP de leitura e folha; faixa de datas do preview.
   - Log enriquecido (L-F04-15): `stops [{ appointmentId, sequence, serviceStartAt }]` no `day_plan.computed`.

### Modelo de dados

**Escopo de tenant (exceção explícita ao §7.1 do CLAUDE.md, D10).** `DayPlan` e `DayPlanStop` **não têm `tenant_id`**: o plano é de um inspetor (entidade cross-tenant) e reúne paradas de várias agências. O isolamento é garantido por:
1. **CL_ADMIN/CL_USER/TNT** → 403 em todas as rotas (role check antes de qualquer leitura).
2. **INSP** → toda leitura e escrita filtra `day_plans.inspector_id = actor.inspectorId`; plano de outro inspetor → **404** (não revela existência).
3. **Paradas sempre re-unidas aos appointments vivos:** `day_plan_stops JOIN appointments a ON a.id = s.appointment_id AND a.inspector_id = day_plans.inspector_id AND a.deleted_at IS NULL AND a.status IN ('SCHEDULED','DONE')` (filtro de status acrescentado em 2026-10-29, L-F04-04, em **todos** os leitores). Um appointment reatribuído, apagado ou fora de SCHEDULED/DONE (ex.: `DONE → DRAFT` pelo AM, que mantém `inspector_id`) some da resposta na hora (e muda a impressão digital → STALE).
4. **AM/OP** veem planos de qualquer inspetor por papel (plataforma), como `/inspector-workload`.
5. Os dados de agência expostos (nome da agência, endereço, contato principal) são os mesmos que o inspetor já vê na agenda; nada de outro inspetor.
6. Audits com `tenantId: null` e `entityType: 'DayPlan'` (CL não lê, porque `/v1/audit-logs` de CL é escopado por tenant).

**Enums (Prisma)**
```prisma
enum DayPlanStatus { DRAFT PUBLISHED STALE }
enum DayPlanComputeTrigger { SCHEDULED_PUBLISH ON_OPEN MANUAL_RECALC REORDER ORIGIN_CHANGE }
enum DayPlanOriginSource { BASE OVERRIDE NONE LAST_STOP }   // LAST_STOP: L-F04-07 (2026-10-29)
enum RoutingProvider { MAPBOX STUB }
```
- `origin_source` grava a origem **efetiva** usada no cálculo: `LAST_STOP` quando há prefixo executado hoje (o restante parte do imóvel da última executada); nesse caso `origin_lat/lng` = imóvel dela.
Semântica de `status`:
- `DRAFT` = calculado e ainda **não publicado** (só AM/OP recalculando antes das 19:30 da véspera); o inspetor não vê.
- `PUBLISHED` = publicado (`published_at` preenchido) e fresco.
- `STALE` = os dados mudaram depois do último cálculo (publicado ou não). Recalculado ao abrir (INSP) ou pela OP.
- "Publicado" = `published_at IS NOT NULL`; "avisado" = `notified_at IS NOT NULL`.

**`DayPlan` (`day_plans`)**

| Coluna | Tipo | Nulo | Default | Semântica |
|---|---|---|---|---|
| `id` | `String @id @default(uuid())` | não | uuid | |
| `inspector_id` | `String` → `inspectors.id` | não | – | dono do plano |
| `plan_date` | `DateTime @db.Date` | não | – | data civil do plano |
| `timezone` | `VarChar(64)` | não | – | fuso efetivo do inspetor no cálculo (rótulos, "hoje", janela de publicação) |
| `status` | `DayPlanStatus` | não | – | ver acima |
| `version` | `Int` | não | `1` | CAS otimista; +1 a cada cálculo e na **transição** para STALE (marcação repetida não incrementa) |
| `input_fingerprint` | `VarChar(64)` | não | – | sha256 hex das entradas, inclusive o estado de execução (Algoritmo §2) |
| `published_at` | `DateTime` | sim | – | 1ª publicação |
| `notified_at` | `DateTime` | sim | – | aviso `ROUTE_PUBLISHED` enviado |
| `computed_at` | `DateTime` | não | – | último cálculo |
| `computed_by_user_id` | `String?` → `users.id` (SetNull) | sim | – | nulo = sistema |
| `last_trigger` | `DayPlanComputeTrigger` | não | – | |
| `stale_at` | `DateTime` | sim | – | 1ª marcação STALE desde o último cálculo |
| `stale_reason` | `VarChar(50)` | sim | – | `APPOINTMENT_STATUS_CHANGED`, `GROUP_CHANGED`, `INSPECTOR_CANT_DO`, `BASE_CHANGED` (R-F01-03); vale o **primeiro** desde o último cálculo (zerado ao recalcular) |
| `origin_source` | `DayPlanOriginSource` | não | – | origem usada |
| `origin_lat` / `origin_lng` | `Decimal(10,7)` | sim | – | origem usada (snapshot; nulo se `NONE`) |
| `origin_override_json` | `Json` | sim | – | endereço do dia (`inspectorBaseAddressSchema`) |
| `origin_override_lat` / `origin_override_lng` | `Decimal(10,7)` | sim | – | geocodificação permanente do override |
| `origin_override_set_at` | `DateTime` | sim | – | |
| `departure_at` | `DateTime` | sim | – | saída prevista da origem |
| `finish_eta` | `DateTime` | sim | – | fim previsto da última parada |
| `total_drive_s` / `total_wait_s` / `total_service_s` / `total_late_s` | `Int` | não | `0` | totais da linha do tempo final |
| `total_distance_m` | `Int` | sim | – | soma das distâncias dos trechos (nulo se algum trecho não tem) |
| `feasible` | `Boolean` | não | `true` | |
| `manual_order` | `Boolean` | não | `false` | ordem salva pelo inspetor ≠ sugerida |
| `suggested_order_json` | `Json` | não | – | `string[]` (appointmentIds reordenáveis) do último `OPTIMIZE`/`INSERTION` |
| `weights_json` | `Json` | não | – | pesos usados (snapshot) |
| `optimizer_method` | `VarChar(20)` | não | – | `TRIVIAL/EXACT/HEURISTIC/INSERTION/FIXED` |
| `routing_provider` | `RoutingProvider` | não | – | `STUB` se qualquer parte usou o stub |
| `matrix_profile` | `VarChar(30)` | sim | – | `driving-traffic`/`driving`/`haversine` |
| `approximate` | `Boolean` | não | `false` | "Approximate route" |
| `approximate_reason` | `VarChar(30)` | sim | – | `NO_PROVIDER`, `RATE_LIMITED`, `PROVIDER_ERROR`, `DEADLINE`, `TOO_MANY_COORDINATES`, `NO_ROUTE` |
| `route_geometry` | `Json` | sim | – | FeatureCollection; expurgado no dia seguinte |
| `routing_matrix_json` | `Json` | sim | – | `StoredRoutingMatrix`; expurgado junto (Achado 4) |
| `leg_travel_json` | `Json` | sim | – | `Array<{ fromKey, toKey, travelS }>` do Directions (pares adjacentes da ordem gravada); expurgado junto |
| `geometry_purged_at` | `DateTime` | sim | – | |
| `created_at` / `updated_at` | `DateTime` | não | `now()` / `@updatedAt` | |

Índices: `@@unique([inspector_id, plan_date])`, `@@index([plan_date, status])`.

**`DayPlanStop` (`day_plan_stops`)**

| Coluna | Tipo | Nulo | Default | Semântica |
|---|---|---|---|---|
| `id` | uuid | não | | |
| `day_plan_id` | → `day_plans.id` (Cascade) | não | | |
| `appointment_id` | → `appointments.id` (Cascade) | não | | |
| `sequence` | `Int` | não | | 1-based no plano (prefixo executado primeiro) |
| `eta` | `DateTime` | sim | | chegada prevista (nula só em parada executada sem previsão anterior) |
| `service_start_at` | `DateTime` | sim | | `max(eta, início da janela)` |
| `service_end_at` | `DateTime` | sim | | |
| `published_eta` | `DateTime` | sim | | chegada prevista **congelada na publicação** (não muda em recálculos) |
| `published_service_start_at` | `DateTime` | sim | | início previsto congelado (a métrica compara com o check-in) |
| `published_predicted_at` | `DateTime` | sim | | quando a previsão congelada foi feita (métrica exige `< started_at`) |
| `published_approximate` | `Boolean` | sim | | a previsão congelada veio do stub/fallback |
| `travel_s` | `Int` | não | `0` | trecho que chega nesta parada |
| `distance_m` | `Int` | sim | | |
| `wait_s` | `Int` | não | `0` | |
| `late_s` | `Int` | não | `0` | violação de janela |
| `window_start_at` / `window_end_at` | `DateTime` | não | | janela em instantes (snapshot) |
| `window_timezone` | `VarChar(64)` | não | | fuso da agência |
| `duration_minutes` | `Int` | não | | duração do tipo (snapshot) |
| `lat` / `lng` | `Decimal(10,7)` | sim | | coordenada do imóvel usada (snapshot) |
| `manual` | `Boolean` | não | `false` | posição definida pelo inspetor |
| `executed` | `Boolean` | não | `false` | estava iniciada no **cálculo** (prefixo fixo). Só registro: a API sempre deriva `executed` do estado **atual** (D18) |
| `approximate` | `Boolean` | não | `false` | trecho de chegada veio do stub/fallback |
| `missing_coordinates` | `Boolean` | não | `false` | imóvel sem coordenada |
| `created_at` | `DateTime` | não | `now()` | |

Índices: `@@unique([day_plan_id, sequence])`, `@@unique([day_plan_id, appointment_id])`, `@@index([appointment_id])`.

- Relações inversas: `Inspector.day_plans`, `Appointment.day_plan_stops`, `User.day_plans_computed`.
- Conversão `Prisma.Decimal` ↔ `number` no repositório.
- Retenção: as linhas ficam (a métrica usa `published_*`); só o traçado, a matriz e as durações por trecho são expurgados.
- **Sem histórico de versões (L-F04-15, 2026-10-29):** cada cálculo substitui as paradas (`DELETE/INSERT`); não há tabela `day_plan_versions`. A reconstrução "qual era o roteiro às 10:00" usa o log `day_plan.computed` (com `stops`), os audits e o payload das notificações da F06. Paradas removidas do plano depois da publicação saem da métrica.
- **`inspectors.onboarding_completed_at`** (`DateTime?`, nulo = tour não concluído nem pulado): ver passo 8 do Escopo.

**Migration** `apps/backend/prisma/migrations/YYYYMMDDhhmmss_day_plans/migration.sql`: `CREATE TYPE` dos 4 enums, `CREATE TABLE day_plans`/`day_plan_stops` com FKs e índices acima. Só expand. Conferir o diff contra índices `Unsupported()`.

**Shared — `routeWeights` no `PLATFORM_SETTINGS_REGISTRY`**
```ts
const weight = z.number().min(0).max(10).refine(
  (v) => Math.abs(Math.round(v * 10) - v * 10) < 1e-9,
  'Use at most one decimal place',
);
export const routeWeightsSettingSchema = z.object({
  travel: weight, windowWait: weight, baseProximity: weight,
}).refine((w) => w.travel + w.windowWait + w.baseProximity > 0, {
  message: 'At least one weight must be greater than 0',
});
// registry entry
routeWeights: { schema: routeWeightsSettingSchema, defaults: DEFAULT_ROUTE_WEIGHTS, section: 'Route planning' },
```
- Valores de onboarding: 1 / 1 / 1 (decisoes.md). Mudança vale no próximo cálculo (cache de 30 s); planos já gravados não mudam.

### Contratos

Envelope de erro `{ error: { code, message, details } }`. Zod → 400 `VALIDATION_ERROR`. Datas `:date` = `YYYY-MM-DD` (civil, validada com `civilDateSchema`). Todas as rotas exigem `authenticate`.

**Schemas de resposta (shared, `schemas/day-plan.ts`)**
```ts
const geoLineString = z.object({ type: z.literal('LineString'), coordinates: z.array(z.tuple([z.number(), z.number()])) });
export const dayPlanGeometrySchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type: z.literal('Feature'),
    geometry: geoLineString,
    properties: z.object({ fromSequence: z.number().int(), toSequence: z.number().int(), approximate: z.boolean() }),
  })),
});
export const dayPlanStopSchema = z.object({
  appointmentId: z.string().uuid(),
  sequence: z.number().int().min(1),
  appointmentCode: z.string(),            // "INS-0042"
  agencyName: z.string(),
  appointmentStatus: z.enum(['SCHEDULED', 'DONE']),
  executionStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FINISHED']),
  eta: instantStrNullable(),
  serviceStartAt: instantStrNullable(),
  serviceEndAt: instantStrNullable(),
  travelS: z.number().int(), distanceM: z.number().int().nullable(),
  waitS: z.number().int(), lateS: z.number().int(),
  windowStart: z.string(), windowEnd: z.string(),   // "HH:mm" de parede da agência
  windowStartAt: instantStr(), windowEndAt: instantStr(),
  timezone: z.string(),                              // fuso da agência (formatar ETA e janela nele)
  durationMinutes: z.number().int(),
  manual: z.boolean(),
  executed: z.boolean(),                             // derivado do estado ATUAL (DONE ou iniciada e não abandonada), D18
  approximate: z.boolean(), missingCoordinates: z.boolean(),
  lat: z.number().nullable(), lng: z.number().nullable(),
  propertyAddress: z.string(),                       // "12 King St, Surry Hills NSW 2010"
  suburb: z.string(),
  serviceTypeName: z.string(),
  keyRequired: z.boolean(),
  meetingLocation: z.string().nullable(),
  rentalTenantConfirmationStatus: z.string(),
  primaryContact: z.object({                         // regra de seleção: L-F04-08 (Algoritmo §1)
    name: z.string(),
    phone: z.string().nullable(),                    // só E.164 válido
    role: z.enum(['RENTAL_TENANT', 'RENTAL_TENANT_REPRESENTATIVE', 'HOUSEKEEPER', 'PROPERTY_MANAGER', 'BROKER', 'OTHER']),
  }).nullable(),
});
export const dayPlanResponseSchema = z.object({
  id: z.string().uuid(),
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  date: civilDateStr(),
  timezone: z.string(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'STALE']),
  version: z.number().int(),
  publishedAt: instantStrNullable(),
  computedAt: instantStr(),
  lastTrigger: z.enum(['SCHEDULED_PUBLISH', 'ON_OPEN', 'MANUAL_RECALC', 'REORDER', 'ORIGIN_CHANGE']),
  approximate: z.boolean(),
  approximateReason: z.enum(['NO_PROVIDER', 'RATE_LIMITED', 'PROVIDER_ERROR', 'DEADLINE', 'TOO_MANY_COORDINATES', 'NO_ROUTE']).nullable(),
  routingProvider: z.enum(['MAPBOX', 'STUB']),
  matrixProfile: z.enum(['driving-traffic', 'driving', 'haversine']).nullable(),
  optimizerMethod: z.enum(['TRIVIAL', 'EXACT', 'HEURISTIC', 'INSERTION', 'FIXED']),
  origin: z.object({                                 // origem EFETIVA do trecho restante (L-F04-07)
    source: z.enum(['BASE', 'OVERRIDE', 'NONE', 'LAST_STOP']),
    label: z.string().nullable(),                    // "Surry Hills NSW 2010" (suburb, state, postcode); LAST_STOP: suburb da última executada; null se NONE
    lat: z.number().nullable(), lng: z.number().nullable(),
  }),
  originWarning: z.enum(['NO_BASE', 'BASE_NOT_LOCATED']).nullable(),
  originOverride: z.object({ address: inspectorBaseAddressSchema, setAt: instantStr() }).nullable(),
  departureAt: instantStrNullable(),
  finishEta: instantStrNullable(),
  totals: z.object({
    driveS: z.number().int(), waitS: z.number().int(), serviceS: z.number().int(),
    lateS: z.number().int(), distanceM: z.number().int().nullable(),
  }),
  feasible: z.boolean(),
  violations: z.array(z.object({ appointmentId: z.string().uuid(), lateS: z.number().int() })),
  manualOrder: z.boolean(),
  suggestedOrder: z.array(z.string().uuid()),
  stops: z.array(dayPlanStopSchema),
  geometry: dayPlanGeometrySchema.nullable(),
  routingInput: z.object({
    points: z.array(z.object({ key: z.string(), lat: z.number(), lng: z.number() })), // key 'origin' | appointmentId
    travelS: z.array(z.array(z.number().int())),
    originKey: z.literal('origin').nullable(),          // 'origin' = base/override, ou o imóvel da última executada (hoje)
    earliestDepartureAt: instantStrNullable(),           // hoje: max(now, departureAt) no momento da resposta; outras datas: null
    weights: z.object({ travel: z.number(), windowWait: z.number(), baseProximity: z.number() }),
    legTravelS: z.array(z.object({                       // durações finais (Directions) dos pares adjacentes da ordem gravada
      fromKey: z.string(), toKey: z.string(), travelS: z.number().int(),
    })),
  }).nullable(),
});
```
- `routingInput` é `null` quando há < 2 paradas reordenáveis com coordenada, ou depois do expurgo (planos passados). A matriz cobre a origem efetiva e só as paradas **não iniciadas**.
- **Recálculo local no PWA:** para cada par adjacente `(de, para)` da nova ordem, usa `legTravelS` se o par existe na ordem gravada (mesma duração que gerou as ETAs do servidor) e `travelS` (matriz) só para pares novos; `earliestDepartureS = max(agora, earliestDepartureAt)` quando a data é hoje (ETAs nunca no passado). Helper no shared: `buildLegOverrides(order, routingInput) → Array<number | null>`, passado como `legTravelS` ao `evaluateSequence`. Assim a ordem sugerida reavaliada no PWA reproduz exatamente as ETAs do servidor e o "+N min" mede só a troca.
- `approximateReason`: `NO_PROVIDER` (sem config `mapbox`), `RATE_LIMITED`/`PROVIDER_ERROR`/`DEADLINE` (transitórios; o próximo `GET` depois de 5 min tenta de novo), `TOO_MANY_COORDINATES`, `NO_ROUTE`.
- `geometry` é `null` sem paradas com coordenada ou depois do expurgo.
- `origin.source 'LAST_STOP'` (L-F04-07): hoje, depois do 1º check-in; `originOverride` continua presente se houver, só como informação; o PWA mostra a origem sem lápis.
- `stops[]` só traz appointments em `SCHEDULED`/`DONE` do próprio inspetor (L-F04-04).
- Atenção às memórias "strip undeclared" e "serializer throws": todo campo nulo é declarado `.nullable()`; listas vazias também são testadas com dado real (teste 18).

**Endpoints do inspetor** (prefixo `/v1/inspector/day-plans`, RBAC **INSP** próprio; outros papéis → 403 `INSP_ONLY` "This endpoint is only accessible to inspectors"; INSP sem perfil → 403 `INSPECTOR_NOT_LINKED`)

| Método e rota | Request | Response | Erros (code · message) | Idempotência / limites |
|---|---|---|---|---|
| `GET /:date` | – | 200 `{ data: DayPlanResponse }` | 400 `VALIDATION_ERROR`; 404 `DAY_PLAN_NOT_PUBLISHED` · "Your route for this day isn't ready yet" (só sem `published_at` e com a janela fechada no fuso do inspetor **ou** da plataforma, L-F04-02); 404 `DAY_PLAN_NOT_FOUND` · "There is no route for this day" | Leitura; `published_at` preenchido → 200 sempre; recalcula se hoje/D+1 e a impressão diverge (STALE com impressão igual só limpa o STALE, sem roteamento, L-F04-01) (single-flight). 60/min |
| `PUT /:date/order` | `{ appointmentIds: uuid[] (1–25, só as reordenáveis, sem repetição), basedOnVersion: int ≥ 1 }` | 200 `{ data: DayPlanResponse }` (com `violations` se estourar janela) | 409 `DAY_PLAN_VERSION_CONFLICT` · "Your route was updated. Review it before saving your order." (`details.currentVersion`); 409 `DAY_PLAN_STALE` · "This route is out of date. Reload it before saving your order."; 422 `DAY_PLAN_ORDER_MISMATCH` · "The stops don't match this route" (`details.expectedAppointmentIds`); 422 `DAY_PLAN_DATE_IN_PAST` · "This day has already passed"; 404 `DAY_PLAN_NOT_FOUND` | Replay idempotente (mesma ordem já gravada → 200). 30/min |
| `POST /:date/recalculate` | sem corpo | 200 `{ data: DayPlanResponse }` (ordem sugerida, `manualOrder false`) | 404 `DAY_PLAN_NOT_PUBLISHED`/`DAY_PLAN_NOT_FOUND`; 422 `DAY_PLAN_DATE_IN_PAST` | Não idempotente (nova versão), inofensivo. 6/min |
| `PUT /:date/origin` | `{ address: inspectorBaseAddressSchema }` (lat/lng do cliente descartados pelo Zod) | 200 `{ data: DayPlanResponse }` (`origin.source 'OVERRIDE'`) | 422 `DAY_PLAN_ORIGIN_NOT_FOUND` · "We couldn't find this address. Check it and try again."; 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE` · "Address search is unavailable right now. Try again later."; 404 `DAY_PLAN_NOT_PUBLISHED`; 422 `DAY_PLAN_DATE_IN_PAST`; 422 `DAY_PLAN_ALREADY_STARTED` · "Your day has started; the route continues from your last stop." (hoje com parada executada, L-F04-07; checado antes da geocodificação) | Idempotente (mesmo endereço e plano fresco → sem recálculo). 10/min |
| `DELETE /:date/origin` | – | 200 `{ data: DayPlanResponse }` (`origin.source 'BASE'`, `'NONE'` ou `'LAST_STOP'` se o dia já começou) | 404; 422 `DAY_PLAN_DATE_IN_PAST` | Idempotente. 10/min |
| `GET /:date/sheet?format=pdf\|xlsx` | query `format` obrigatório | 200 binário; `Content-Disposition: attachment; filename="route-{inspector-slug}-{date}.{ext}"` | 400 `VALIDATION_ERROR`; 404 `DAY_PLAN_NOT_PUBLISHED`/`DAY_PLAN_NOT_FOUND`; 422 `DAY_PLAN_SHEET_TOO_OLD` · "Route sheets are available for the last 30 days" (data < hoje − 30, L-F04-10) | Mesma regra de recálculo do `GET`. Síncrono. Audit `day_plan.exported`. 20/min |

**Endpoints AM/OP** (RBAC **AM, OP** via `authorizationService.assertRoles(actor, ['AM','OP'], { action, entityType: 'DayPlan' })`; demais → 403 `FORBIDDEN` com a mensagem existente `Role {role} is not permitted to perform {action}` (`authorization.service.ts:53-56`), actions `day_plan.view`, `day_plan.recalculate`, `day_plan.export`, `day_plan.preview_weights`, `day_plan.view_eta_accuracy`)

| Método e rota | Request | Response | Erros | Observações |
|---|---|---|---|---|
| `GET /v1/day-plans/:inspectorId/:date` | – | 200 `{ data: DayPlanResponse }` | 404 `INSPECTOR_NOT_FOUND`; 404 `DAY_PLAN_NOT_FOUND` | **Nunca** chama o Mapbox: devolve o gravado; `status` = `STALE` se a impressão divergir. Vê `DRAFT`. 120/min por usuário (L-F04-14) |
| `POST /v1/day-plans/:inspectorId/:date/recalculate` | sem corpo | 200 `{ data: DayPlanResponse }` | 404 `INSPECTOR_NOT_FOUND`; 422 `DAY_PLAN_DATE_IN_PAST` | `OPTIMIZE`; cria `DRAFT` antes da publicação; se o plano já foi publicado **e** houve mudança efetiva → `ROUTE_CHANGED` agregado por 10 min (L-F04-06). 30/min |
| `GET /v1/day-plans/:inspectorId/:date/sheet?format=pdf\|xlsx` | – | binário | 400; 404 | Não recalcula; plano STALE sai com a faixa "This route may be out of date". Sem limite de data. Audit `day_plan.exported` (L-F04-10). 20/min por usuário (L-F04-14) |
| `POST /v1/day-plans/preview` | `{ inspectorId: uuid, date: civil, weights: { travel, windowWait, baseProximity } }` | 200 `{ data: { current: RouteWeightsPreview, proposed: RouteWeightsPreview } }` | 400 `VALIDATION_ERROR` (pesos); 404 `INSPECTOR_NOT_FOUND`; 422 `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` · "Pick a day between today and 14 days ahead" (`date` fora de hoje..hoje+14 no fuso efetivo do ator, L-F04-14) | 1 Matrix, 0 Directions, nada gravado. 10/min por usuário |
| `GET /v1/day-plans/eta-accuracy?days=30` | `days` 7–90 (padrão 30) | 200 `{ data: RouteEtaAccuracy }` | 400 | Para o rodapé da F05 |

```ts
export const routeWeightsPreviewSchema = z.object({
  weights: z.object({ travel: z.number(), windowWait: z.number(), baseProximity: z.number() }),
  etaSource: z.literal('MATRIX'),
  approximate: z.boolean(),
  departureAt: instantStrNullable(), finishEta: instantStrNullable(),
  totals: z.object({ driveS: z.number().int(), waitS: z.number().int(), lateS: z.number().int() }),
  feasible: z.boolean(),
  stops: z.array(z.object({
    appointmentId: z.string().uuid(), sequence: z.number().int(), appointmentCode: z.string(),
    suburb: z.string(), windowStart: z.string(), windowEnd: z.string(), timezone: z.string(),
    eta: instantStr(), lateS: z.number().int(),
  })),
});
export const routeEtaAccuracySchema = z.object({
  from: civilDateStr(), to: civilDateStr(), days: z.number().int(),
  sampleSize: z.number().int(), excludedOutliers: z.number().int(),
  meanAbsoluteErrorMinutes: z.number().nullable(),       // 1 casa decimal; null se 0 amostras
  thresholdMinutes: z.literal(10), minSampleSize: z.literal(30),
  status: z.enum(['INSUFFICIENT_DATA', 'OK', 'ABOVE_THRESHOLD']),
});
```

**RBAC — matriz**

| Rota | AM | OP | CL_ADMIN | CL_USER | INSP | TNT |
|---|---|---|---|---|---|---|
| `/v1/inspector/day-plans/*` | 403 | 403 | 403 | 403 | próprio | 401/403 |
| `/v1/day-plans/:inspectorId/:date` (+recalc, sheet) | sim | sim | 403 | 403 | 403 | 403 |
| `/v1/day-plans/preview`, `/v1/day-plans/eta-accuracy` | sim | sim | 403 | 403 | 403 | 403 |

**Avisos (F02)**

| Quando | Tipo | `dedupeKey` | Título | Corpo |
|---|---|---|---|---|
| Job publica D+1 | `ROUTE_PUBLISHED` (crítico) | `route-published:{inspectorId}:{date}` | "Your route for tomorrow is ready" | "{n} inspection(s) on {EEE d MMM}. First stop at {HH:mm} in {suburb}; finish around {HH:mm}[, {k} stop(s) may arrive after its window]. Open Properfy to see the order." (trecho entre colchetes só com `feasible false`, L-F04-05; + " Travel times are approximate." se aproximado) |
| AM/OP recalcula um plano já publicado (hoje ou futuro) **com mudança efetiva** (ordem das reordenáveis mudou ou alguma `serviceStartAt` mudou > 5 min, L-F04-06) | `ROUTE_CHANGED` (crítico) | `route-changed:{dayPlanId}:{floor(epochMs/600000)}` (1 aviso por plano a cada 10 min) | "Your route for {EEE d MMM} was updated" | "Operations recalculated your route: {n} inspection(s), first stop at {HH:mm} in {suburb}. Open Properfy to see the new order." Hoje: "first stop" = 1ª parada **não iniciada**; sem nenhuma → "Operations recalculated your route: {n} inspection(s) remaining. Open Properfy to see the new order." |
- Horários no fuso do inspetor (`plan.timezone`); `targetPath` **omitido** (padrão `/profile/announcements/:id`) até a Parte B incluir `/today` na allowlist (Achado 8).
- Recálculo pelo próprio inspetor, STALE e reordenação **não** avisam.
- **Regras da F02 (reconciliação 2026-10-29, R-F02):** título e corpo são públicos na tela bloqueada (D23) e só levam data, contagem, horários e suburb (nada de contato, telefone, chave/lockbox, `meetingLocation` ou endereço completo); o `dedupeKey` é determinístico; o SMS de fallback respeita o teto diário `INSPECTOR_NOTICE_SMS_DAILY_CAP` (D17, sem reenvio pela F04); avisos de sistema são arquivados após 30 dias (D22).

**Leitura fresca para a F06 (sem rota HTTP; porta interna)**
```ts
// modules/day-plan/application/use-cases/get-fresh-stop-for-appointment.use-case.ts
// container.dayPlan.getFreshStopForAppointmentUseCase
export interface FreshDayPlanStop {
  status: 'FRESH' | 'STALE';         // STALE = não foi possível recalcular agora; a previsão é a gravada
  dayPlanId: string; planVersion: number;
  serviceStartAt: Date | null; eta: Date | null; lateS: number;
  approximate: boolean; manual: boolean; executed: boolean;
}
execute(input: { appointmentId: string; now?: Date }): Promise<FreshDayPlanStop | null>;
```
- Carrega o appointment (inspetor e data atuais), o plano dessa data e **recalcula a impressão digital**; plano `STALE` com impressão igual → só limpa o STALE, sem roteamento (L-F04-01); se divergir, recalcula como o `GET` do inspetor (`trigger ON_OPEN`, `interactive: true`) e devolve a previsão nova. Isso cobre as edições que não emitem evento (`update-appointment`, `bulk-reschedule`, mudança de coordenada do imóvel).
- `null`: appointment sem inspetor, sem plano na data, ou fora do plano.
- Datas passadas nunca recalculam.
- **Não há evento `day_plan.computed`** nem outro export especulativo: a F06 define o próprio gatilho e chama esta leitura antes de avisar.

**Auditoria**

| Ação | Ator | Quando | Metadata |
|---|---|---|---|
| `day_plan.published` | SYSTEM | job publica | `{ inspectorId, date, version, stops, approximate, provider, feasible, lateS }` (L-F04-05) |
| `day_plan.exported` | USER (INSP/AM/OP) | download da folha (200) | `{ format, date, stops, actorRole }`, sem dados pessoais (L-F04-10) |
| `day_plan.recalculated` | USER (INSP/AM/OP) | recálculo manual | `{ inspectorId, date, trigger, previousVersion, version }` |
| `day_plan.reordered` | USER (INSP) | `PUT /order` | `before.order`, `after.order`, `{ feasible, lateS }` |
| `day_plan.origin_overridden` | USER (INSP) | `PUT /origin` | `after: { suburb, state, postcode }` (**sem** coordenadas, D10 da F03) |
| `day_plan.origin_override_cleared` | USER (INSP) | `DELETE /origin` | `{ date }` |
Todos com `entityType: 'DayPlan'`, `entityId: dayPlanId`, `tenantId: null`. STALE, cálculo ao abrir e expurgo **não** auditam (volume); só log.

**Observabilidade e custo Mapbox**
- Logs: `day_plan.computed { dayPlanId, inspectorId, date, trigger, stops: [{ appointmentId, sequence, serviceStartAt }], method, provider, matrixProfile, matrixElements, directionsCalls, approximate, approximateReason, feasible, durationMs }` (lista de paradas para reconstrução, L-F04-15), `day_plan.stale_cleared_noop { dayPlanId, staleReason }` (L-F04-01), `day_plan.publish_deferred { inspectorId, date, reason, attempt }`, `day_plan.published_infeasible { inspectorId, date, violations }` em `warn` (L-F04-05), `day_plan.stale_marked { reason, plans }`, `day_plan.publish_completed {..., infeasible}` (em `error` quando `approximate > 0` por motivo ≠ `NO_PROVIDER` ou `deferred > 0` na 3ª tentativa; senão `info`, L-F04-09), `day_plan.route_data_purged { count }`, `routing.provider_call` e `routing.fallback` (TASK-F04-1). Nunca coordenadas do inspetor nem token.
- Métricas: `dayPlansApproximateTotal[approximateReason]` (L-F04-09) além dos contadores da TASK-F04-1 (`routingProviderFailuresByCode`).
- Custo: `matrixElements` e `directionsCalls` por cálculo + contadores no `/metrics`. Consulta de homologação: soma diária dos logs `day_plan.computed` (meta: Matrix < 100 mil elementos/mês, Directions < 100 mil req/mês; estimativa do plano 16,5 mil e 6,6 mil).

### Algoritmo

**1. Seleção das paradas (`IDayPlanInputReader.loadCandidates(inspectorId, date)`)**
- `appointments` com `inspector_id = $1`, `scheduled_date = $date`, `deleted_at IS NULL`, `status IN ('SCHEDULED','DONE')`; join `properties` (lat/lng, endereço), `service_types` (nome, `default_duration_minutes`, flow, confirmação), `tenants` (nome, `timezone`), contatos do appointment (`is_primary`, `role`, `created_at`, snapshot) reduzidos a um por `selectPrimaryContact` (L-F04-08: `is_primary desc` → role `RENTAL_TENANT, RENTAL_TENANT_REPRESENTATIVE, HOUSEKEEPER, PROPERTY_MANAGER, BROKER, OTHER` → `created_at asc`; telefone só E.164), execução (`started_at`, `finished_at`, `abandoned_at`).
- Janela = `time_slot_start/end` do appointment; nada do `ServiceGroup` entra (L-F04-11, regra na TASK-F04-1).
- SCHEDULED passa pelo `T1VisibilityService` com `todayCivil` no fuso do inspetor (o mesmo que a agenda do app usa); DONE entra sempre.
- **Executada (D18)** = DONE, ou execução com `started_at` e sem `abandoned_at`. Executadas formam o **prefixo fixo**, ordenado por `started_at` (DONE sem execução: pela janela).
- **Reordenáveis** = as não iniciadas. A **mesma função** `classifyStops(stops)` (`domain/classify-stops.ts`, tipos planos `ClassifiableStop`, sem Prisma, exportada para a F05, L-F04-16; o leitor converte os candidatos Prisma antes de chamar) define o conjunto no cálculo, no `GET` (que deriva `executed`/`executionStatus` ao montar a resposta, nunca do valor gravado), no `PUT /order` (validação contra o estado atual) e no `getFreshStopForAppointment`.

**2. Impressão digital** — sha256 do JSON canônico:
`{ origin: { source, lat, lng }, stops: [ordenado por appointmentId: [appointmentId, scheduledDate, timeSlotStart, timeSlotEnd, tenantTimezone, durationMinutes, lat, lng, execState]] }`, com `execState ∈ { 'NOT_STARTED', 'STARTED' }` (`STARTED` = executada pela regra acima; abandono volta a `NOT_STARTED`). Check-in e abandono mudam a impressão (o plano recalcula a partir do ponto atual e o conjunto reordenável se atualiza); check-out e SCHEDULED→DONE de parada já iniciada não mudam. Custo aceito: até 1 recálculo por check-in (3–4 por dia por inspetor).
- Função exportada `computeDayPlanFingerprint(input: FingerprintInput)` em `domain/day-plan-fingerprint.ts` (L-F04-16).
- O `origin` da impressão é a origem **configurada** (override → base → nenhuma), nunca `LAST_STOP` (L-F04-07): o efeito do prefixo executado já entra pelo `execState`, e a F05 monta a mesma entrada sem conhecer a origem efetiva.
- **STALE × impressão (L-F04-01):** o STALE marcado pelo subscriber é só um sinal; antes de rotear, a leitura compara a impressão. Igual → `clearStale` (CAS, `version + 1`, `status` volta a `PUBLISHED`/`DRAFT`, `stale_*` nulos, log `day_plan.stale_cleared_noop`), sem `PlanRouteService`. Por isso check-out e SCHEDULED→DONE de parada iniciada não custam Mapbox.

**3. Origem**: override do dia (se houver) → base (`base_lat/lng`) → nenhuma. Hoje com prefixo executado: o restante parte do imóvel da **última executada** (`origin_source = 'LAST_STOP'`, `label` = suburb dela; o override fica só informativo e o `PUT /origin` responde 422 `DAY_PLAN_ALREADY_STARTED`, L-F04-07), com `earliestDeparture = max(agora, fim real ou previsto dela [finished_at ?? started_at + duração])`; sem prefixo e data = hoje: `earliestDeparture = max(agora, departure_at gravado)` (ETAs nunca no passado e sem antecipar o dia planejado); outras datas: `null`.

**4. Cálculo (`ComputeDayPlanUseCase.execute({ inspectorId, date, trigger, actorUserId, modeHint })`)**
1. Lê o plano (se existe) e sua `version` = v.
2. Carrega candidatos, origem, pesos (`IPlatformSettingsReader.get('routeWeights')`), impressão.
3. Modo: `REORDER` → `FIXED_ORDER`; `MANUAL_RECALC`/`SCHEDULED_PUBLISH` → `OPTIMIZE`; `ON_OPEN`/`ORIGIN_CHANGE` → `PRESERVE_ORDER` se `manual_order`, senão `OPTIMIZE`.
4. `PlanRouteService.compute(...)` (TASK-F04-1); `interactive = trigger ≠ SCHEDULED_PUBLISH`; `strict = (trigger = SCHEDULED_PUBLISH e attempt < 3)`; `cachedMatrix` = matriz gravada em `REORDER`.
5. Monta as paradas: prefixo executado (`sequence` 1..k; previsões copiadas do plano anterior quando existem) + reordenáveis (`sequence` k+1..). `leg_travel_json` = `legs` do resultado.
6. `status`: `DRAFT` se `published_at` nulo e a janela de publicação ainda não abriu (só via AM/OP); senão `PUBLISHED` (e `published_at = coalesce(published_at, now)`).
7. **ETA publicada (congelada):** se o plano resultante está publicado, cada parada recebe `published_eta/published_service_start_at/published_approximate/published_predicted_at` **copiados** da parada de mesmo `appointmentId` do plano anterior quando ela já os tinha; senão (1ª publicação, ou parada nova ainda não iniciada) com os valores deste cálculo e `published_predicted_at = computed_at`. Paradas já iniciadas sem valor publicado ficam `null`.
8. Grava em transação: `INSERT` (sem plano) ou `UPDATE … WHERE id AND version = v` + `DELETE/INSERT` das paradas; `version = v + 1`; zera `stale_at`/`stale_reason`. Conflito → recomeça do passo 1 (máx. 2 tentativas; depois devolve o gravado com `status 'STALE'` e `executed` derivado do estado atual).
9. Log `day_plan.computed`.
- Single-flight por processo: chave `inspectorId:date`; chamadas simultâneas aguardam a mesma promessa.

**5. Janela de publicação** `isPublicationOpen(date, now, tz) = now ≥ zonedWallTimeToUtc(addCivilDays(date, -1), '19:30', tz)` (`addCivilDays` de `packages/shared/src/utils/local-date.ts:29`; não existe `previousCivilDay`); `tz` = fuso do inspetor. Hoje e passado: aberta.
- **Leitura × criação (L-F04-02):** plano com `published_at` preenchido é sempre devolvido ao INSP (200), qualquer que seja a hora local. A janela só decide se uma leitura/escrita do INSP pode **criar ou publicar** o plano de D+1: `isPublicationOpenForInspector(date, now, inspectorTz) = isPublicationOpen(date, now, inspectorTz) && isPublicationOpen(date, now, PLATFORM_TIMEZONE)`. O status `DRAFT` do passo 4.6 usa a mesma função. Assim o inspetor em Perth vê o plano publicado às 19:30 de Sydney (16:30 locais) assim que o push chega, e um inspetor num fuso à frente da plataforma não publica antes do T-1 da plataforma.

**6. Job `day-plan.publish`** (pg-boss, `'30 * * * *'` em Sydney, **singleton**, sem mudar o `TenantCronTick`)
- **Portão (gate):** `tenantCronTick.runDue('day-plan.publish', 19, gateRunner)` com a assinatura atual. O tick `:30` de Sydney cai às 19:30 locais nas agências com fuso de hora cheia (Sydney, Brisbane, Perth…) e às 19:00/20:00 nas de meia hora (Adelaide, Darwin). O `gateRunner` recebe o grupo `(timezone, todayCivil, tenantIds)` e, para cada tenant, chama `cronJobRunRepo.hasClaim('appointment.reject-unconfirmed', tenantId, todayCivil)`; os sem claim do T-1 têm o claim de `day-plan.publish` liberado (`releaseClaims`) e entram no próximo tick (uma hora depois). Resultado: um tenant só fica reivindicado para `day-plan.publish` depois que o seu T-1 rodou e a hora local é ≥ 19.
- **Conjunto devido (recalculado a cada execução, a partir do banco):** pares `(inspetor, amanhã)` em que (a) há appointment SCHEDULED, não deletado, do inspetor ACTIVE em `amanhã = addCivilDays(local_date, 1)` de algum tenant com claim `day-plan.publish` em `local_date`; (b) **todos** os tenants ativos dos appointments SCHEDULED dele nessa data têm esse claim (senão espera a última agência); (c) o plano não existe, tem `published_at` nulo ou tem `notified_at` nulo. Ordenado por `inspectorId`.
- **Processamento sequencial**, um inspetor por vez, dentro de `budgetMs = 25 min` (o job tem `expireInMinutes: 30`):
  - sem plano / `published_at` nulo → `Compute(trigger SCHEDULED_PUBLISH, strict)` → `PUBLISHED` → audit `day_plan.published` (com `feasible`/`lateS`); `feasible false` → log `warn` `day_plan.published_infeasible` e conta em `infeasible` (L-F04-05);
  - `notified_at` nulo → `ROUTE_PUBLISHED` → grava `notified_at`;
  - `RoutingDeferredError` (limite compartilhado, 429, prazo ou erro do provedor nas tentativas 1–2) → **para o lote** (o limite vale para todos), log `day_plan.publish_deferred`, nada gravado para esse inspetor, `continuation: true`;
  - orçamento esgotado → para, `continuation: true`;
  - erro inesperado → log `day_plan.publish_failed`, segue para o próximo.
- **Continuação:** o worker envia `day-plan.publish` com `{ attempt: attempt + 1 }`, `singletonKey: 'day-plan.publish'` (no máximo um na fila) e `startAfter: 120`. Na tentativa 3, `strict: false`: o inspetor é publicado com stub e `approximate_reason` explícito (o aviso diz "Travel times are approximate."); nunca aproximado em silêncio. O tick horário seguinte também recomeça (`attempt` 1) com o mesmo conjunto devido.
- **Singleton:** `teamSize: 1`, `teamConcurrency: 1` e `singletonKey` garantem uma execução por vez no cluster (as duas máquinas Fly disputam o mesmo job no pg-boss); o claim por tenant e o `published_at`/`notified_at` tornam a repetição inofensiva.
- **Capacidade:** 30 inspetores × (1 Matrix + ~4 Directions) com o balde `matrix:driving-traffic` de 25/min → ~1 min 15 s de Matrix por lote; cabe com folga nos 25 min.

**7. STALE**
- Subscriber `MarkDayPlansStaleSubscriber` nos eventos listados no teste 8. `markStale(appointmentIds, reason)`:
```sql
UPDATE day_plans SET status = 'STALE', stale_at = now(), stale_reason = $reason,
       version = version + 1, updated_at = now()
WHERE status <> 'STALE'
  AND plan_date >= (now() AT TIME ZONE day_plans.timezone)::date   -- "hoje" no fuso do próprio plano (do inspetor)
  AND ( id IN (SELECT day_plan_id FROM day_plan_stops WHERE appointment_id = ANY($ids))
     OR (inspector_id, plan_date) IN (SELECT inspector_id, scheduled_date FROM appointments
                                       WHERE id = ANY($ids) AND inspector_id IS NOT NULL) );
```
- **Idempotente:** plano já `STALE` não é tocado (sem novo `version`, motivo original mantido). Precedência do `stale_reason` = o primeiro desde o último cálculo; o cálculo zera.
- **Troca de base (R-F01-03)** — `BASE_CHANGED` com `hadCoordinates || hasCoordinates` → `markStaleByInspector`:
```sql
UPDATE day_plans SET status = 'STALE', stale_at = now(), stale_reason = 'BASE_CHANGED',
       version = version + 1, updated_at = now()
WHERE inspector_id = $1 AND status = 'PUBLISHED'
  AND plan_date BETWEEN (now() AT TIME ZONE day_plans.timezone)::date
                    AND (now() AT TIME ZONE day_plans.timezone)::date + 1;
```
- "Hoje" = data civil no fuso gravado no plano (`day_plans.timezone`), explícito na consulta; planos de ontem nunca são tocados.
- Rede de segurança: impressão digital comparada em **toda** leitura (INSP recalcula; AM/OP vê `STALE`; `getFreshStopForAppointment` recalcula).
- Corrida "recalculando enquanto muda": se a mudança chega durante um cálculo de um plano que não estava STALE, a marcação incrementa `version` → o CAS falha e recalcula (passo 4.8). Se o plano já estava STALE (marcação no-op), o cálculo grava com a impressão lida antes da mudança, e a próxima leitura detecta a divergência e recalcula.
- Corrida "republicado enquanto o inspetor reordena": `PUT /order` com `basedOnVersion` antigo → 409 `DAY_PLAN_VERSION_CONFLICT`; o PWA recarrega e mostra a nova ordem.
- STALE com impressão igual (check-out, DONE de parada iniciada) é limpo sem roteamento na próxima leitura (L-F04-01); a `version` sobe, então um rascunho de reordenação aberto recebe 409 e recarrega com a mesma ordem.

**7b. `ROUTE_CHANGED` (L-F04-06)** — no `RecalculateDayPlanUseCase` (AM/OP), depois de gravar:
- `hasEffectiveChange(prev, next)` = a sequência dos `appointmentId` reordenáveis mudou **ou** existe parada com `|next.serviceStartAt − prev.serviceStartAt| > 300 s` (paradas novas ou removidas contam como mudança);
- sem mudança efetiva → nenhum aviso; com mudança → `publishSystemInspectorNoticeUseCase.execute({ type: 'ROUTE_CHANGED', dedupeKey: 'route-changed:{dayPlanId}:{Math.floor(now.getTime() / 600_000)}', … })`; o dedupe da F02 garante 1 aviso por plano por janela de 10 min (o plano lido ao abrir é sempre o mais recente).

**8. Métrica "Route ETA accuracy"**
```sql
SELECT abs(extract(epoch FROM (e.started_at - s.published_service_start_at))) / 60.0 AS err_min
FROM day_plan_stops s
JOIN day_plans p ON p.id = s.day_plan_id
JOIN appointments a ON a.id = s.appointment_id AND a.inspector_id = p.inspector_id AND a.deleted_at IS NULL
                   AND a.status IN ('SCHEDULED','DONE')                                   -- L-F04-04
JOIN inspection_executions e ON e.appointment_id = s.appointment_id
WHERE p.plan_date BETWEEN $from AND $to
  AND s.published_service_start_at IS NOT NULL
  AND s.published_predicted_at < e.started_at
  AND s.published_approximate = false
  AND e.abandoned_at IS NULL;
```
- Mede a previsão **congelada na publicação** (`published_*`), não a última recalculada (que, à tarde, já parte do último check-in e esconderia o erro).
- `to` = hoje (Sydney, plataforma), `from = to − (days − 1)`.
- `published_service_start_at` já desconta a espera de janela (D9). Erros > 180 min → `excludedOutliers` (esqueceu o check-in, outra ordem).
- `mean` com 1 casa; `status`: < 30 amostras → `INSUFFICIENT_DATA`; média > 10 → `ABOVE_THRESHOLD`; senão `OK`.
- Paradas removidas do plano depois da publicação (reatribuídas, rejeitadas) não contam: as linhas são substituídas a cada cálculo e não há histórico (L-F04-15). Viés aceito e documentado na spec.

**9. Folha do dia** — mesmas paradas da resposta, na ordem do plano.
- Preâmbulo (L-F04-10: um só formato de data, `dd/MM/yyyy`): "Inspector: {nome}", "Date: {dd/MM/yyyy}", "Starting from: {origin.label ?? 'No base address'}", "Finish: ~{HH:mm}[ {fuso}]", "Drive time: {h} h {m} min", + "Times in each agency's local time" quando as paradas têm mais de um `window_timezone`, + "Approximate route: some travel times are estimates" se `approximate`, + "This route may be out of date (generated {dd/MM/yyyy HH:mm}[ {fuso}])" se STALE (AM/OP). "Finish" e "generated" no `plan.timezone`; o sufixo de fuso curto (abreviação do `Intl.DateTimeFormat` com `timeZoneName: 'short'`, ex. "AEDT", "AWST") aparece só com fusos misturados.
- Colunas: `#` (sequence), `Window` ("08:00–10:00", + " AWST" com fusos misturados), `ETA` (HH:mm no fuso da agência, + sufixo com fusos misturados; "—" sem previsão), `Address`, `Service`, `Contact` ("{nome} · {telefone}" ou "—"; contato pela regra de L-F04-08), `Key` ("Yes — {meetingLocation}" / "Yes" / "No").
- PDF A4 paisagem, Helvetica, paginação com cabeçalho repetido; XLSX aba "Route" com preâmbulo e cabeçalho congelado.
- Nome do arquivo: `route-{slug}-{date}.{pdf|xlsx}`; `slug` = nome do inspetor em NFKD, sem diacríticos, minúsculo, `[^a-z0-9]+ → '-'`, sem hífens nas pontas; vazio → `inspector` (L-F04-10).
- INSP: data < hoje − 30 (fuso do inspetor) → 422 `DAY_PLAN_SHEET_TOO_OLD`; AM/OP sem limite. Toda folha entregue (200) grava `day_plan.exported` (L-F04-10).

**10. Expurgo `day-plan.purge-route-data`** (03:45 Sydney): `UPDATE day_plans SET route_geometry = NULL, routing_matrix_json = NULL, leg_travel_json = NULL, geometry_purged_at = now() WHERE plan_date < $todaySydney AND (route_geometry IS NOT NULL OR routing_matrix_json IS NOT NULL OR leg_travel_json IS NOT NULL)`.

**11. Origem do dia — mapeamento de erros do geocodificador:** `null` → 422 `DAY_PLAN_ORIGIN_NOT_FOUND`; **qualquer** exceção (timeout, modo permanente indisponível, HTTP, rede, circuito aberto, erro desconhecido) → 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE`. O `try/catch` envolve só a chamada de geocodificação; nada é gravado antes dela. Às 03:45 de Sydney todas as agências australianas já viraram o dia.

### Casos de borda
1. **Sem base:** origem `NONE`, `originWarning 'NO_BASE'` (ou `'BASE_NOT_LOCATED'`); começa na 1ª janela (D7).
2. **0 paradas:** plano vazio gravado só quando o inspetor abre (hoje/D+1 aberto); o job não cria plano vazio nem avisa.
3. **1 parada:** sem Matrix; `routingInput null`.
4. **> 9 paradas:** Matrix `driving` com 11+ coordenadas; heurística acima de 8 paradas.
5. **Mapbox fora/timeout:** caminho interativo → stub, `approximate true` com `approximateReason` no plano, nas paradas e nos trechos (novo `GET` depois de 5 min tenta de novo); job → adia (tentativas 1–2) e só na 3ª publica aproximado, com a frase no aviso. **429/limite no job nunca vira aproximado.**
6. **STALE em corrida** com cálculo ou reordenação: versão + impressão digital (Algoritmo §4.8 e §7).
6b. **Parada em andamento:** o check-in muda a impressão; o `GET` recalcula e devolve a parada no prefixo; o `PUT /order` aceita só as não iniciadas (teste 5 e 27b). Nunca 422 em loop.
7. **Republicado enquanto reordena:** 409 `DAY_PLAN_VERSION_CONFLICT`.
8. **Fuso da agência ≠ fuso do inspetor:** janelas convertidas por parada; "hoje" e publicação pelo fuso do inspetor; job pelo fuso de cada agência, publicando quando a última agência do inspetor foi reivindicada (19:30 locais nas agências de hora cheia; 20:00 nas de meia hora, Achado 10).
9. **DST** (2026-10-04 AEDT, 2027-04-04 AEST): `zonedWallTimeToUtc` por parada; claim por data local absorve hora repetida; o tick `:30` de Sydney segue a hora de parede de Sydney.
10. **Atribuição depois da publicação:** plano STALE; sem plano (inspetor não tinha nada às 19:30) → o 1º `GET` depois das 19:30 calcula (sem aviso; o inspetor já recebe os avisos de atribuição existentes).
11. **Appointment reatribuído/cancelado/apagado:** some na leitura (join), plano STALE.
12. **Check-in fora da ordem do plano:** prefixo executado por `started_at`; o restante recalcula a partir do último check-in.
13. **Execução abandonada (F03):** volta a ser reordenável.
14. **Plano passado:** leitura sem recálculo, sem traçado/matriz depois do expurgo; escrita → 422.
15. **Inspetor INACTIVE/deletado:** o job pula; `GET` do INSP continua (o login já é barrado pelo auth existente).
16. **Override para um dia sem plano futuro:** 404 `DAY_PLAN_NOT_PUBLISHED`.
17. **Tick atrasado:** `>=` dá catch-up até 23:59 local; virar o dia perde a publicação automática (o plano é calculado ao abrir, sem aviso) — mesmo perfil de perda do `TenantCronTick`.
18. **Duas máquinas Fly (D17):** job singleton no pg-boss; limitador Mapbox compartilhado no Postgres; `published_at`/`notified_at` + `dedupeKey` tornam qualquer repetição inofensiva.
19. **Orçamento do job estourado:** para no inspetor atual, enfileira a continuação em 2 min; os já publicados não repetem.
20. **Edição sem evento** (`update-appointment`, `bulk-reschedule`, coordenada do imóvel): o banco não marca STALE, mas toda leitura (inspetor, AM/OP, F06) compara a impressão.
21. **Check-out / DONE de parada iniciada (L-F04-01):** o subscriber marca STALE; a próxima leitura vê a impressão igual e só limpa o STALE (sem Mapbox, sem "Updating your route…" duradouro); a `version` sobe.
22. **Inspetor fora do fuso da plataforma (L-F04-02):** Perth com agências em Sydney → o push chega às 16:30 locais e o `GET` devolve o plano publicado (200). Fuso à frente da plataforma → o `GET` de D+1 só auto-publica quando a janela abre também no `PLATFORM_TIMEZONE`.
23. **`DONE → DRAFT` pelo AM, bulk-edit de status ou correção direta (L-F04-04):** a parada some de todas as leituras (o join filtra status) e a impressão muda; nunca 500 por enum.
24. **Janelas sobrepostas criadas pela agência (L-F04-05):** plano publicado com `feasible false`; o aviso diz quantas paradas podem atrasar; log `warn` para a operação; a F05 mostra o indicador "Route infeasible" na linha do inspetor (não é alerta; decisão do dev de 2026-10-29).
25. **OP clicando "Recalcular" várias vezes (L-F04-06):** recálculos sem mudança efetiva não avisam; com mudança, no máximo 1 aviso por plano a cada 10 min.
26. **Troca de origem depois do 1º check-in (L-F04-07):** `PUT` → 422 `DAY_PLAN_ALREADY_STARTED`; a resposta do `GET` mostra `origin.source 'LAST_STOP'`.
27. **Appointment importado sem `is_primary` (L-F04-08):** contato escolhido pela ordem de `role`; só PM/broker → ele; telefone não E.164 → sem botão de ligar.
28. **Token revogado / cota esgotada (L-F04-09):** os planos saem aproximados; `publish_completed` em `error` e `dayPlansApproximateTotal` sobem; a operação pode forçar `DAY_PLAN_ROUTING_PROVIDER=stub` (TASK-F04-1) até resolver.
29. **Folha antiga ou multi-fuso (L-F04-10):** INSP > 30 dias → 422; fusos misturados rotulados; nome não ASCII → slug transliterado ou `inspector`.
30. **Preview fora da faixa (L-F04-14):** data passada ou > hoje+14 → 422, sem chamada à Matrix.
31. **Reclamação "me disseram 10:00" (L-F04-15):** sem histórico de versões; reconstrução pelo log `day_plan.computed` (com `stops`) e pelo payload da notificação da F06.
32. **Base trocada com plano publicado (R-F01-03):** planos `PUBLISHED` de hoje/D+1 viram `STALE` (`BASE_CHANGED`); o INSP recalcula ao abrir; com override do dia ou depois do 1º check-in (`LAST_STOP`) a impressão não muda e o STALE é só limpo. Sem aviso à OP; ela vê `STALE` no `GET` AM/OP.
33. **Teto diário de SMS atingido (R-F02):** o `ROUTE_PUBLISHED` de quem não tem push fica só na caixa (sem SMS); o `notified_at` é gravado igual (a entrega é da F02). Visível no log `inspector_notice.sms_cap_reached` da F02.
34. **Aviso de roteiro com mais de 30 dias (R-F02):** arquivado pela F02; sai do card de não lidos e da caixa. O plano não depende do aviso.
35. **Pesos alterados depois da publicação (R-F03):** o plano gravado não muda nem fica STALE; o próximo recálculo (OP, "Reset to suggested" ou impressão diferente) usa os pesos novos.

### Fora do escopo
- Telas do PWA (Tela do Dia, lista, mapa, reordenação, base do dia, tour, navegação) → Parte B.
- Tela web da OP para ver/recalcular/baixar plano → F05 (Dia ao Vivo) consome os endpoints.
- Lista de planos por data para AM/OP (F05 acrescenta à porta se precisar).
- Filtro "Source" na lista de avisos (Achado 9).
- Trânsito em tempo real, realocação entre inspetores, multi-dia, LLM, mover janelas.
- Aviso automático ao inquilino (F06 lê com `getFreshStopForAppointment`; sem evento de domínio novo nesta tarefa).
- UI do tour (TASK-F04-3b); aqui só a fatia de backend do `onboarding_completed_at`.

### Critérios de aceite
1. **01.A1:** depois da publicação, o plano tem sequência, horários previstos e traçado (teste 30 com Mapbox stubado; homologação com o job real em staging).
2. **01.A6:** PDF e XLSX com as paradas do roteiro (teste 15 e 21).
3. **00.A2 (parte):** a publicação dispara o aviso crítico `ROUTE_PUBLISHED` (push, ou SMS sem push, pela F02) (teste 9 e 30).
4. **01.A3 / 00.A5:** o plano persistido usa a base como origem e o otimizador da TASK-F04-1 (teste 3).
5. CL nunca acessa plano; INSP só o próprio (teste 17).
6. Nenhuma resposta expõe o token do Mapbox (teste 18).
7. A métrica responde para AM/OP com o shape de `routeEtaAccuracySchema`, medida contra a ETA congelada na publicação (teste 12 e 22).
8. O inspetor reordena as paradas restantes com uma parada em andamento (teste 5 e 27b).
9. `GET /v1/inspectors/me` devolve `onboardingCompletedAt` depois do heartbeat com `onboardingCompleted: true` (teste 16c).
10. Check-out não gera chamada ao provedor de roteamento (teste 4, L-F04-01).
11. Plano publicado é visível ao INSP em qualquer fuso assim que `published_at` é gravado; auto-publicação pelo `GET` só com a janela aberta no fuso do inspetor e da plataforma (teste 4, L-F04-02).
12. Nenhuma leitura devolve parada fora de SCHEDULED/DONE nem dá 500 por isso (testes 4, 24b, 26b; L-F04-04).
13. Plano inviável aparece no audit, no corpo do aviso e num log `warn` (teste 9, L-F04-05).
14. `ROUTE_CHANGED` só com mudança efetiva e no máximo 1 por plano a cada 10 min (teste 6, L-F04-06).
15. `PUT /origin` com o dia iniciado → 422 `DAY_PLAN_ALREADY_STARTED` e `origin.source 'LAST_STOP'` na resposta (testes 3, 7, 24e; L-F04-07).
16. `primaryContact` segue a regra de L-F04-08 e expõe `role` (teste 3b).
17. Toda folha entregue é auditada; INSP limitado a 30 dias; fusos rotulados (testes 15, 24d; L-F04-10).
18. Rate limits AM/OP e faixa de datas do preview aplicados (testes 13, 24c; L-F04-14).
19. `classifyStops` e `computeDayPlanFingerprint` importáveis do domínio sem Prisma (testes 1, 1b; L-F04-16).
20. `BASE_CHANGED` deixa `STALE` só os planos `PUBLISHED` de hoje/D+1 do inspetor (testes 8, 27a; R-F01-03); `onboarding_completed_at` gravado na instrução única de `recordAppState()` (teste 16c; R-F01-02); avisos sem dados sensíveis e com `dedupeKey` estável (teste 9; R-F02).

### Dependências
- TASK-F04-1 (shared `route-planning`, `PlanRouteService`, limitador compartilhado, duração).
- F01-3 não é necessária: a fatia do `onboarding_completed_at` só estende o heartbeat da F01-1.
- F01-1 (`base_lat/lng`, `inspectorBaseAddressSchema`, `INSPECTOR_EVENTS.BASE_CHANGED`, `recordAppState()` com `$executeRaw`), X02-1 (`geocodeWithTimeout`, `formatGeocodingQuery`, modo permanente).
- F02-1 (`PublishSystemInspectorNoticeUseCase`, tipos `ROUTE_*`).
- F03-1 (`PlatformSetting`, reader), F03-2 (`INSPECTOR_FIELD_EVENTS.RECORDED`, `abandoned_at`).

### Riscos e armadilhas
- **Tamanho do PR:** é o maior da F04 (estimado ~105 arquivos com as lacunas de 2026-10-29). Se passar de 150, separar a folha PDF/XLSX + preview + métrica num PR empilhado (F04-2b) sem mudar contratos.
- **`TenantCronTick` intocado:** só o repositório ganha `hasClaim`; regressão dos 4 jobs existentes (teste 10).
- **Singleton do pg-boss:** confirmar na versão instalada que `teamSize/teamConcurrency` + `singletonKey` impedem duas execuções simultâneas entre máquinas; o teste 10 cobre o envio, a homologação cobre o cluster.
- **`APPOINTMENT_EVENTS.UPDATED` não emitido:** o STALE no banco atrasa para edições até alguém ler; a impressão digital cobre a leitura (Achado 6).
- **Serializer do Fastify:** `null` em campo não-nullable = 500 só com dado real (memória). Testar o `GET` com plano real com executadas sem previsão (`eta null`).
- **`civilDateStr` × `instantStr`:** `date` é civil; `eta` etc. são instantes (memória "civil vs instant").
- **Lock de appointment (F03):** esta tarefa **não** escreve em `appointments`; não pega o lock.
- **Termos Mapbox:** guardar traçado, matriz e durações por trecho só na vigência; **e** o cliente (PWA) recebe a matriz crua em `routingInput` e o servidor guarda `routing_matrix_json`. Consulta aberta na TASK-F04-1 com prazo = início desta tarefa e plano B escrito lá (L-F04-03); se a resposta for negativa, o plano B entra aqui antes dos contratos (preview de ordem no servidor e/ou Matrix por salvamento).
- **`hasEffectiveChange` (L-F04-06):** comparar paradas pelo `appointmentId`, nunca pela posição; uma parada nova ou removida conta como mudança.
- **Abreviação de fuso (L-F04-10):** `Intl` do Node pode devolver "GMT+8" em vez de "AWST" conforme o ICU; fixar no teste o valor que o runtime do Node 20 (ICU completo) devolve e conferir na imagem Docker de produção.
- **`recordAppState()` (R-F01-02):** acrescentar `onboarding_completed_at` com `updateMany` quebraria a atomicidade da F01 (o `data` do Prisma não referencia colunas); a mudança é só na instrução `$executeRaw`. Conferir com a F02, que tira `push_enabled` da mesma instrução: ordem de merge/rebase em `prisma-inspector.repository.ts`.
- **Contingência v6 da X02 (R-X02):** nenhum teste da F04 fixa a URL de geocodificação v5; conferir com `grep -rn "geocoding/v5" apps/backend/tests/**/day-plan` vazio.

### Deploy / rollout / rollback
- **Deploy:** 2 migrations (expand: `day_plans`, `inspector_onboarding_completed_at`) em staging, depois prod. `boss.schedule` cria os dois crons no boot.
- **Pré-requisitos de go-live:** config `mapbox` no Integrations Hub de staging e prod (tokens já separados por ambiente, D16) com acesso a Directions e Matrix; resposta da Mapbox sobre guardar traçado/matriz e entregar a matriz ao cliente (D8), com a consulta aberta na TASK-F04-1 e fechada antes do início desta tarefa (L-F04-03).
- **Alertas de operação (L-F04-05, L-F04-09):** configurar no agregador de logs os alertas para `day_plan.publish_completed` em nível `error` e para `day_plan.published_infeasible` (`warn`); acompanhar `dayPlansApproximateTotal` e `routingProviderFailuresByCode` no `/metrics` na primeira semana.
- **Rollout:** (1) staging com `DAY_PLAN_PUBLISH_ENABLED=false` → abrir planos pelo `GET` como inspetor de teste e conferir ordem/ETAs no mapa; (2) ligar o job em staging e acompanhar 19:30 (logs `day_plan.publish_completed`, aviso recebido no PWA); (3) prod com o job ligado depois da Parte B (F04-3) estar no ar — sem a Tela do Dia o aviso abre só a caixa de avisos; (4) acompanhar custo (`matrixElements`/`directionsCalls`), `approximate_reason`, `day_plan.publish_deferred` e a duração do lote na primeira semana; (5) em staging, forçar 2 máquinas e conferir que só uma executa o job e que a cota do balde é respeitada.
- **Rollback:** `DAY_PLAN_PUBLISH_ENABLED=false` (para avisos imediatamente, sem deploy de código); `DAY_PLAN_ROUTING_PROVIDER=stub` (TASK-F04-1) desliga só o provedor e mantém o job (L-F04-09). Reverter o código: as tabelas ficam (sem dependentes); remover os schedules órfãos com `boss.unschedule` (ou `DELETE FROM pgboss.schedule WHERE name IN ('day-plan.publish','day-plan.purge-route-data')`).

### Dias · Branch · Verificação
- **9,5 dias**, estimados passo a passo depois da revisão (plano: 4,5 dos itens + 0,5 transferidos da Parte B; 8,0 na revisão de 2026-10-28 + 1,25 das lacunas de 2026-10-29 + 0,25 da reconciliação de 2026-10-29):

| Passo | Dias | Observação |
|---|---|---|
| Modelo + 2 migrations + repositório (CAS, troca de paradas, STALE idempotente, expurgo) | 1,0 | |
| Leitor de candidatos (T-1, contatos, execução) + `classifyStops` + impressão com estado de execução + `ComputeDayPlan` (modos, prefixo, origem, janela de publicação, single-flight, ETA publicada congelada) | 1,5 | +0,25 execução na impressão / `executed` vivo; +0,25 `published_*` |
| Job de publicação: portão do T-1 por `hasClaim`, conjunto devido, singleton sequencial, orçamento, continuação, tentativas, avisos, kill switch | 1,0 | −0,25 sem mudar o `TenantCronTick`; +0,5 singleton/orçamento/continuação |
| Subscribers de STALE | 0,25 | |
| API do inspetor (GET, ordem, recalcular, origem) + AM/OP (GET, recalcular) + schemas/api-types + RBAC | 1,0 | inclui os 0,5 transferidos da Parte B (ordem e origem) |
| `getFreshStopForAppointment` (F06) | 0,25 | substitui o evento `day_plan.computed` (−0,25) por leitura fresca (+0,25) |
| Folha PDF/XLSX (01.7) | 1,5 | igual ao plano |
| Pesos + preview (01.14 backend) | 0,25 | igual ao plano |
| Métrica (Medição) | 0,25 | igual ao plano (agora sobre `published_*`) |
| Expurgo diário | 0,25 | estava implícito no B4 |
| Fatia `onboarding_completed_at` | 0,25 | movida da TASK-F04-3b (a Parte B fica com −0,25) |
| Integração ponta a ponta (E2E do 01.A1, bloqueador da reordenação) e correções | 0,5 | |
| Lacunas: leitura (STALE sem roteamento, L-F04-01; `published_at` e janela em dois fusos, L-F04-02; join com status em todos os leitores, L-F04-04; `classifyStops`/impressão no domínio, L-F04-16) | 0,25 | 2026-10-29 |
| Lacunas: `ROUTE_CHANGED` com mudança efetiva e janela de 10 min (L-F04-06) + plano inviável sinalizado (L-F04-05) | 0,25 | 2026-10-29 |
| Lacunas: origem `LAST_STOP` + 422 (L-F04-07) + contato principal com `role` (L-F04-08) | 0,25 | 2026-10-29 |
| Lacunas: folha (audit, 30 dias, fusos, copy, slug, data, L-F04-10) | 0,25 | 2026-10-29 |
| Lacunas: observabilidade (L-F04-09), limites AM/OP e preview (L-F04-14), log enriquecido (L-F04-15) | 0,25 | 2026-10-29 |
| Reconciliação: assinante `BASE_CHANGED` + `markStaleByInspector` + `stale_reason` novo (R-F01-03); `recordAppState()` na instrução única (R-F01-02) e asserções de conteúdo dos avisos (R-F02) sem custo extra | 0,25 | 2026-10-29 |
| **Total** | **9,5** | +4,5 sobre 5,0: B4 estava subcusteado (revisão: 7–8) + 0,25 da 3b + 1,25 das lacunas de 2026-10-29 + 0,25 da reconciliação de 2026-10-29 |

- Branch: `feat/f04-day-plan-backend`.
- Verificação: `pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared build`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test` (suíte completa, incluindo integração — memória "backend full suite"); suíte db em série; `pnpm generate:api`; `pnpm --filter web typecheck && pnpm --filter pwa typecheck`. PR < 150 arquivos (estimado ~105; ver Riscos).

---

## TASK-F04-5 · Shared + backend + web admin: duração obrigatória no tipo de serviço e pesos da rota (com preview)

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F04-1, TASK-F04-2, TASK-F03-4
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F04-3, TASK-F06-1, TASK-F07-1
> - **Pista sugerida (time de 6):** D · Web

### Objetivo
- Campo **"Estimated duration (min)"** obrigatório no `ServiceTypeFormDrawer`, na criação e na edição (B5); a API passa a exigir o campo. **Muda o contrato do backend:** a rota `POST /v1/service-types` valida o body com o `createServiceTypeSchema` do shared (`service-type.routes.ts:46-48`), então remover o `.default(45)` é uma mudança de shared **e** backend, com testes de backend próprios.
- Seção **"Route planning"** na página "Platform settings" (F03): 3 pesos + **"Preview"** num inspetor/dia (01.14).

### Contexto no código
- **Backend:** `apps/backend/src/modules/service-type/interfaces/service-type.routes.ts:44-48` — `schema: { body: createServiceTypeSchema, ... }` (o Zod do shared é o validador da rota) e `CreateServiceTypeUseCase` (input `defaultDurationMinutes` vindo da TASK-F04-1, até aqui sempre preenchido pelo `.default(45)`).
- `apps/web/src/features/service-types/components/ServiceTypeFormDrawer.tsx` (form com `FormSection`, `FormField`, `TextInput`, `SelectInput` de Flow Type `:169-175`, `Checkbox` de confirmação `:184`; `isDirty` por JSON; `useServiceTypeSave().validate`); tipos em `features/service-types/types/index.ts` (`ServiceTypeFormData`, `EMPTY_SERVICE_TYPE_FORM`); hooks `useServiceTypeSave.ts`, `useServiceTypeDetail.ts`; testes `ServiceTypeFormDrawer.test.tsx`, `useServiceTypeSave.test.ts`.
- "Platform settings" nasce na TASK-F03-4: rota `platform-settings` (AM/OP), `features/platform-settings/pages/PlatformSettingsPage.tsx`, hook genérico `usePlatformSetting(key)`, seção "Field events" como modelo.
- Inspetores: `GET /v1/inspectors?status=ACTIVE` (lista existente) para o seletor.

### Decisões aplicáveis
D6, D12 (2026-10-27); decisão do plano "Pesos da rota (3 valores) no `PlatformSetting`, com Pré-visualizar num inspetor/dia".
- **L-F04-14 (2026-10-29) · Preview com limites.** O seletor de inspetor do preview busca no servidor (`GET /v1/inspectors?status=ACTIVE&search={texto}&pageSize=20`; `search` já existe em `listInspectorsQuerySchema`, `packages/shared/src/schemas/inspector.ts:83`), nunca uma lista truncada em 100. A data do preview fica entre hoje e hoje+14 no fuso efetivo do usuário (o `DateInput` limita; o servidor responde 422 `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` fora disso, TASK-F04-2).

### Testes primeiro (TDD)
1. `packages/shared/src/schemas/service-type.test.ts`: `createServiceTypeSchema` **sem** `defaultDurationMinutes` → falha (o `.default(45)` sai); 5/480 ok; 4/481/45.5 falham.
1b. **Backend** `apps/backend/tests/integration/service-type/service-type.routes.test.ts` (alterado): `POST /v1/service-types` como AM **sem** `defaultDurationMinutes` → 400 `VALIDATION_ERROR` com `details[0].path = ['defaultDurationMinutes']` (antes desta tarefa: 201 com 45); com 60 → 201; `PATCH` sem o campo continua 200 sem mudar a duração; os testes de integração que criam tipo **pela rota** (grep `post('/v1/service-types'`) passam a enviar o campo; os que inserem direto no banco não mudam (DEFAULT 45).
1c. **Backend** `create-service-type.use-case.test.ts`: o tipo do input deixa de aceitar ausência (typecheck); sem mudança de regra.
2. `ServiceTypeFormDrawer.test.tsx`:
   - criação: campo "Estimated duration (min)" vazio por padrão, marcado obrigatório; salvar vazio → "Enter the duration in minutes"; 4 → "Enter a duration between 5 and 480 minutes"; 45.5 → "Enter whole minutes"; 60 → `POST` com `defaultDurationMinutes: 60`;
   - edição: carrega 45 do detalhe; mudar para 50 deixa `isDirty`; salvar → `PATCH` com `defaultDurationMinutes: 50`;
   - texto de ajuda "Time the inspector spends at each stop. Used to plan the day route." ligado por `aria-describedby`;
   - 400 do servidor com `details` no campo → erro no campo.
3. `useServiceTypeSave.test.ts`: payload inclui o campo (create e update); `validate` cobre os limites.
4. `RouteWeightsSettingsSection.test.tsx`:
   - carrega `routeWeights` → 3 campos com 1/1/1 e badge "Default";
   - validação: −1, 10.5, 0.15 → "Enter a number from 0 to 10 with at most one decimal place"; 0/0/0 → "At least one weight must be greater than 0" (no grupo);
   - salvar → `PUT /v1/platform-settings/routeWeights` com `{ value: { travel, windowWait, baseProximity } }` → snackbar "Route weights saved. They apply to the next route calculation.";
   - "Discard changes" restaura.
5. `RouteWeightsPreview.test.tsx`:
   - "Preview" desabilitado sem inspetor; data padrão = amanhã no fuso do usuário (`todayInTzDateString` + 1);
   - clicar → `POST /v1/day-plans/preview` com os pesos **do formulário** (mesmo não salvos);
   - resultado em 2 colunas "Saved weights" / "Weights in this form": lista "1. INS-0042 · Surry Hills · 09:00–11:00 · ETA 09:05", totais "Drive 1 h 10 min · Waiting 15 min · Finish ~13:40"; ordem diferente entre colunas destaca a coluna da direita com "Order changes with these weights" (fixture do Exemplo 6: `A,C,B` × `A,B,C`, espera 0 × 35 min);
   - `approximate` → badge "Approximate (straight-line estimate)";
   - parada com `lateS > 0` → chip "Late by 25 min";
   - sem paradas → "This inspector has no inspections on this day.";
   - 429 → "Too many previews. Try again in a minute."; outro erro → `ErrorState` com "Retry";
   - nota fixa "Preview uses estimated travel times and doesn't change any route.".
   - **seletor com busca (L-F04-14):** digitar "jan" → após debounce de 300 ms, `GET /v1/inspectors?status=ACTIVE&search=jan&pageSize=20`; lista mostra só o retorno; sem resultado → "No inspectors found"; nenhuma chamada com `pageSize=100`;
   - **faixa de datas (L-F04-14):** `DateInput` com `min` = hoje e `max` = hoje+14 (fuso efetivo do usuário); 422 `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` do servidor → mensagem do servidor "Pick a day between today and 14 days ahead" no campo de data.
6. `PlatformSettingsPage.test.tsx`: a página renderiza "Field events" e "Route planning" (ordem por `section`).
7. E2E `apps/web/tests/e2e/route-weights.spec.ts` (API mockada): AM muda "Waiting for windows" para 0, faz preview (ordem muda), salva, recarrega e vê 0.
8. E2E `service-type-duration.spec.ts`: AM cria tipo com 60 min e edita para 50.

### Escopo / Passos
1. **Shared:** remover `.default(45)` de `createServiceTypeSchema.defaultDurationMinutes` (fica obrigatório); `pnpm generate:api`; build.
1b. **Backend:** `CreateServiceTypeInput.defaultDurationMinutes: number` obrigatório; ajustar os testes de integração que criam tipo pela rota; o OpenAPI passa a marcar o campo como `required`.
2. **Tipos web:** `ServiceTypeFormData.defaultDurationMinutes: string` (input), `EMPTY_SERVICE_TYPE_FORM.defaultDurationMinutes = ''`; conversão para número no save.
3. **Drawer:** `FormField label="Estimated duration (min)" required` + `TextInput type="number" inputMode="numeric" min=5 max=480 step=1`, logo depois de "Flow Type".
4. **Seção "Route planning"** (`features/platform-settings/components/RouteWeightsSettingsSection.tsx`) com `usePlatformSetting('routeWeights')`.
5. **Preview** (`features/platform-settings/components/RouteWeightsPreview.tsx` + hook `useRouteWeightsPreview` com `useMutation` em `POST /v1/day-plans/preview`), seletor de inspetor (`SelectInput` pesquisável com busca no servidor `GET /v1/inspectors?status=ACTIVE&search=&pageSize=20`, debounce 300 ms, L-F04-14) e `DateInput` limitado a hoje..hoje+14 (L-F04-14).
6. Sem `as any`; tipos gerados.

### Modelo de dados / Contratos / UI
- **Contratos consumidos:** `POST/PATCH /v1/service-types` (campo obrigatório), `GET/PUT /v1/platform-settings/routeWeights` (F03 + registro da TASK-F04-2), `POST /v1/day-plans/preview` (TASK-F04-2), `GET /v1/inspectors`.
- **UI — seção "Route planning"**

| Campo | Controle | Ajuda |
|---|---|---|
| Driving time | número 0–10, passo 0,1 | "Higher values prefer orders with less total driving." |
| Waiting for windows | número 0–10, passo 0,1 | "Higher values avoid arriving early and waiting for a time window to open." |
| Starting near the base | número 0–10, passo 0,1 | "Higher values prefer a first stop close to the inspector's base address." |
- Introdução: "These weights decide the suggested order of each inspector's day. Time windows are always respected when possible; the weights choose between valid orders."
- Botões "Save changes" / "Discard changes"; "Last changed by {nome} on {dd/MM/yyyy HH:mm}".
- Bloco "Preview on a real day": Inspector, Date, botão "Preview"; estados carregando (skeleton), vazio, erro, resultado (acima).
- Acessibilidade: `fieldset/legend` "Route weights"; erros com `aria-describedby`; resultados em `<ol>`; foco vai para o título do resultado após o preview.

### Casos de borda
1. Tipo de serviço antigo sem edição: já tem duração (backfill); o drawer mostra o valor.
2. Bundle web antigo em cache criando tipo sem o campo → 400 até recarregar (raro, só AM; stale chunk retry resolve).
3. Pesos salvos inválidos no banco → o registro devolve defaults (`valid=false`) e a página mostra os defaults.
4. Preview para inspetor sem base → resposta com origem `NONE`; mostrar "No base address: route starts at the first window" acima das colunas.
5. Preview com Mapbox fora → badge aproximado.
6. **Mais de 100 inspetores ativos (L-F04-14):** a busca no servidor encontra qualquer um; nada é truncado em silêncio.
7. **Data fora de hoje..hoje+14 (L-F04-14):** o `DateInput` impede; se chegar ao servidor (fuso mudou, URL manipulada), 422 com a mensagem no campo.

### Fora do escopo
- Coluna de duração na tabela de tipos de serviço.
- Tela de planos para a OP (F05).
- Mudanças em telas de dashboard (D12).

### Critérios de aceite
1. AM não salva tipo de serviço sem "Estimated duration (min)" válido (5–480, inteiro), na criação e na edição.
2. AM/OP salvam os 3 pesos e veem o efeito no preview antes de salvar.

### Dependências
- TASK-F04-1 (campo no backend), TASK-F04-2 (`routeWeights`, preview), TASK-F03-4 (página "Platform settings").

### Riscos e armadilhas
- **Contract do campo (backend muda):** este PR torna o campo obrigatório na **validação da rota**. Backend e web saem no mesmo deploy; qualquer cliente que crie tipo de serviço sem o campo (bundle antigo, script, integração) passa a receber 400. Grep por outros chamadores de `POST /v1/service-types` (seed, scripts, Fy) antes do merge.
- **`SelectInput`** de inspetor: memória "SelectInput option scope bugs" — testar a busca.
- **Data do preview** sempre no fuso efetivo do usuário, nunca do navegador.

### Deploy / rollout / rollback
- Deploy backend + shared + web juntos (o backend passa a exigir o campo). Rollback: reverter o PR inteiro (volta o `.default(45)`); sem dados a limpar.

### Dias · Branch · Verificação
- **1,25 dia** (plano: 0,5): shared + backend (contrato obrigatório, testes de rota, ajuste de testes de integração) 0,25 · campo no drawer + validação + testes 0,25 · seção de pesos 0,25 · preview (seletor de inspetor com busca no servidor, data limitada a hoje..hoje+14, 2 colunas, estados, a11y, e2e) 0,5 (L-F04-14 cabe aqui: troca de `pageSize=100` por `search` e `min/max` no `DateInput`, sem delta). O plano só custeava o campo e os pesos no web; o preview e a mudança de contrato do backend não estavam custeados.
- Branch: `feat/f04-service-type-duration-route-weights`.
- Verificação: `pnpm --filter @properfy/shared test && pnpm --filter @properfy/shared build`; `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test` (suíte completa com integração); `pnpm generate:api`; `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`; e2e dos 2 specs; checagem visual no navegador (memória "QA in browser"). PR < 40 arquivos.

---

## Contratos exportados para a Parte B e outras features

### 1. Para a Parte B (PWA: TASK-F04-3, F04-3b, F04-4)

**Endpoints (todos INSP, o próprio plano; token do Mapbox nunca no PWA, o traçado vem pronto)**

| Uso no PWA | Método e rota | Corpo | Resposta |
|---|---|---|---|
| Tela do Dia / roteiro | `GET /v1/inspector/day-plans/:date` | – | `{ data: DayPlanResponse }` |
| Salvar ordem (arrastar/setas) | `PUT /v1/inspector/day-plans/:date/order` | `{ appointmentIds: string[], basedOnVersion: number }` | `{ data: DayPlanResponse }` |
| "Reset to suggested" | `POST /v1/inspector/day-plans/:date/recalculate` | – | `{ data: DayPlanResponse }` |
| Base do dia | `PUT /v1/inspector/day-plans/:date/origin` | `{ address: InspectorBaseAddress }` (estruturado, igual ao perfil da F01) | `{ data: DayPlanResponse }` |
| Voltar à base | `DELETE /v1/inspector/day-plans/:date/origin` | – | `{ data: DayPlanResponse }` |
| Baixar folha | `GET /v1/inspector/day-plans/:date/sheet?format=pdf\|xlsx` | – | arquivo |

- `:date` = `YYYY-MM-DD` calculada com `todayInTzDateString(effectiveTz)`; nunca o fuso do dispositivo.
- Schemas: `dayPlanResponseSchema`, `dayPlanStopSchema`, `dayPlanGeometrySchema`, `saveDayPlanOrderRequestSchema`, `setDayPlanOriginRequestSchema` em `packages/shared/src/schemas/day-plan.ts`; tipos em `api-types.ts`.

**Exemplo de resposta** (Exemplo 1 da TASK-F04-1, Sydney, 2026-11-05, routing Mapbox):
```json
{ "data": {
  "id": "…", "inspectorId": "…", "inspectorName": "Jane Doe",
  "date": "2026-11-05", "timezone": "Australia/Sydney",
  "status": "PUBLISHED", "version": 3,
  "publishedAt": "2026-11-04T08:30:12.000Z", "computedAt": "2026-11-04T08:30:12.000Z",
  "lastTrigger": "SCHEDULED_PUBLISH",
  "approximate": false, "approximateReason": null, "routingProvider": "MAPBOX", "matrixProfile": "driving-traffic", "optimizerMethod": "EXACT",
  "origin": { "source": "BASE", "label": "Redfern NSW 2016", "lat": -33.87, "lng": 151.2 },
  "originWarning": null, "originOverride": null,
  "departureAt": "2026-11-04T20:50:00.000Z", "finishEta": "2026-11-04T23:35:00.000Z",
  "totals": { "driveS": 1800, "waitS": 0, "serviceS": 8100, "lateS": 0, "distanceM": 14200 },
  "feasible": true, "violations": [], "manualOrder": false,
  "suggestedOrder": ["<A>", "<B>", "<C>"],
  "stops": [
    { "appointmentId": "<A>", "sequence": 1, "appointmentCode": "INS-0042", "agencyName": "Ray White Surry Hills",
      "appointmentStatus": "SCHEDULED", "executionStatus": "NOT_STARTED",
      "eta": "2026-11-04T21:00:00.000Z", "serviceStartAt": "2026-11-04T21:00:00.000Z", "serviceEndAt": "2026-11-04T21:45:00.000Z",
      "travelS": 600, "distanceM": 4700, "waitS": 0, "lateS": 0,
      "windowStart": "08:00", "windowEnd": "17:00",
      "windowStartAt": "2026-11-04T21:00:00.000Z", "windowEndAt": "2026-11-05T06:00:00.000Z", "timezone": "Australia/Sydney",
      "durationMinutes": 45, "manual": false, "executed": false, "approximate": false, "missingCoordinates": false,
      "lat": -33.8836, "lng": 151.2108, "propertyAddress": "12 King St, Surry Hills NSW 2010", "suburb": "Surry Hills",
      "serviceTypeName": "Routine", "keyRequired": false, "meetingLocation": null,
      "rentalTenantConfirmationStatus": "CONFIRMED", "primaryContact": { "name": "Sam Lee", "phone": "+61412345678", "role": "RENTAL_TENANT" } }
  ],
  "geometry": { "type": "FeatureCollection", "features": [
    { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[151.2, -33.87], [151.2108, -33.8836]] },
      "properties": { "fromSequence": 0, "toSequence": 1, "approximate": false } } ] },
  "routingInput": {
    "points": [{ "key": "origin", "lat": -33.87, "lng": 151.2 }, { "key": "<A>", "lat": -33.8836, "lng": 151.2108 }],
    "travelS": [[0, 600], [600, 0]],
    "originKey": "origin", "earliestDepartureAt": null,
    "weights": { "travel": 1, "windowWait": 1, "baseProximity": 1 },
    "legTravelS": [{ "fromKey": "origin", "toKey": "<A>", "travelS": 600 }] }
} }
```

**Semântica para a UI**
- **Erros do `GET`:** `404 DAY_PLAN_NOT_PUBLISHED` → "Your route for tomorrow will be ready at 7:30 pm" (só quando o plano ainda não foi publicado; plano com `published_at` sempre volta 200, em qualquer fuso, L-F04-02; "7:30 pm" é a hora da agência, Q9); `404 DAY_PLAN_NOT_FOUND` → "No route for this day" (passado sem plano). Hoje nunca dá 404 (dia vazio = `stops: []`).
- **Folha:** INSP com data anterior a hoje − 30 → 422 `DAY_PLAN_SHEET_TOO_OLD` "Route sheets are available for the last 30 days" (L-F04-10; a UI só oferece hoje/amanhã e as datas passadas alcançáveis).
- **Contato:** `primaryContact.role` (L-F04-08) → o link diz "Call {name} ({rótulo do role})": `RENTAL_TENANT` "tenant", `RENTAL_TENANT_REPRESENTATIVE` "tenant's representative", `HOUSEKEEPER` "housekeeper", `PROPERTY_MANAGER` "property manager", `BROKER` "broker", `OTHER` sem rótulo.
- **STALE:** o `GET` do inspetor já devolve o plano recalculado (o PWA não precisa tratar STALE). Se o servidor perder a corrida duas vezes, `status: 'STALE'` pode vir; o PWA mostra "Updating your route…" e refaz o `GET` uma vez após 2 s.
- **Reordenação local (01.3, sem API):** `toOptimizerInput(plan, now)` (shared; `earliestDepartureS = max(now, routingInput.earliestDepartureAt)` quando a data é hoje) → `evaluateSequence(input, ordem, { legTravelS: buildLegOverrides(ordem, plan.routingInput) })` para a nova ordem e para `plan.suggestedOrder`. `buildLegOverrides` usa `routingInput.legTravelS` (Directions) para pares adjacentes que já existiam na ordem gravada e a matriz (`travelS`) só para pares novos; assim a ordem gravada reavaliada reproduz as ETAs do servidor. Diferença exibida = `finishS(nova) − finishS(sugerida)` ("+12 min vs. suggested") e `totalTravelS`; avisos de janela = `violations` da avaliação local ("Stop 4 would arrive after its window 10:00–12:00"). Sem `routingInput` (< 2 paradas não iniciadas) não há reordenação.
- **Parada em andamento:** depois de um check-in, o próximo `GET` já traz a parada com `executed: true` no prefixo (a impressão inclui o estado de execução). Reordenáveis = `executed: false` (não iniciadas), a mesma regra que o servidor usa no `PUT`.
- **Salvar ordem:** enviar **só** as paradas `executed: false`, na nova ordem, com `basedOnVersion = plan.version`. 200 → substituir o plano pela resposta (ETAs finais do Directions; podem diferir da estimativa local). 409 `DAY_PLAN_VERSION_CONFLICT` ou `DAY_PLAN_STALE` → recarregar e mostrar "Your route was updated. Review it before saving your order."; 422 `DAY_PLAN_ORDER_MISMATCH` → recarregar. Estouro de janela **não** é erro (D3): a resposta traz `violations`.
- **Approximate route:** `plan.approximate` → faixa "Approximate route: travel times are estimates" (`approximateReason` só para log/telemetria do PWA; um `GET` depois de 5 min tenta de novo quando o motivo é transitório); `features[].properties.approximate` → trecho tracejado; `stop.missingCoordinates` → "Location not found for this address" no card (sem pin).
- **Origem:** `originWarning 'NO_BASE'` → "No base address: route has no starting point" (com link para o perfil); `'BASE_NOT_LOCATED'` → "We couldn't locate your base address — please check it"; `origin.label` em "Starting from: {label} ✎"; `originOverride` presente → "Starting from: {label} (today only)" + ação "Use my base address" (`DELETE`); `origin.source 'LAST_STOP'` (hoje, depois do 1º check-in, L-F04-07) → "Continuing from: {label}" só texto, **sem** lápis e sem "Use my base address".
- **Origem por um dia:** permitido para hoje (antes do 1º check-in) e para D+1 já publicado; passado → 422 `DAY_PLAN_DATE_IN_PAST`; dia iniciado → 422 `DAY_PLAN_ALREADY_STARTED` "Your day has started; the route continues from your last stop." (L-F04-07); erros 422 `DAY_PLAN_ORIGIN_NOT_FOUND` / 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE` com as mensagens do servidor.
- **Plano B da Mapbox (L-F04-03):** se a consulta negar repassar a matriz ao cliente, `routingInput` sai do contrato e a reordenação usa `POST /v1/inspector/day-plans/:date/order/preview` (avaliação no servidor). A variante é fixada antes do início da TASK-F04-4.
- **Horários:** formatar `eta`/`serviceStartAt` e janelas no `stop.timezone`; `finishEta` e saudações no `plan.timezone`. "X de N feitas" = paradas com `appointmentStatus 'DONE'`. Próxima inspeção = 1ª parada com `executed: false` (ou `executionStatus 'IN_PROGRESS'`).
- **Mapa:** pins = `stops[].lat/lng` com `sequence`; linha = `geometry` (paint com HSL de vírgula, lição do #1302); sem `geometry` → só pins.
- **Avisos:** `ROUTE_PUBLISHED`/`ROUTE_CHANGED` chegam com o destino padrão da caixa; a Parte B acrescenta `/today` à `INSPECTOR_NOTICE_TARGET_PATTERNS` e passa a usar `targetPath: '/today'` (ver Achado 8).

### 2. Para a F05 (Dia ao Vivo)
- **Leitura por inspetor/data (AM/OP):** `GET /v1/day-plans/:inspectorId/:date` → `DayPlanResponse` (sem chamada ao Mapbox; `status 'STALE'` quando a impressão diverge). Traçado pronto em `geometry` (mesmo FeatureCollection do PWA), válido até o expurgo do dia seguinte.
- **Recalcular (botão da OP):** `POST /v1/day-plans/:inspectorId/:date/recalculate` (envia `ROUTE_CHANGED` se já publicado).
- **Folha:** `GET /v1/day-plans/:inspectorId/:date/sheet?format=pdf|xlsx`.
- **Rodapé "Route ETA accuracy":** `GET /v1/day-plans/eta-accuracy?days=30` → `routeEtaAccuracySchema` (`meanAbsoluteErrorMinutes`, `sampleSize`, `status`, `thresholdMinutes 10`).
- **Porta interna:** `IDayPlanRepository` (`modules/day-plan/domain/day-plan.repository.ts`); a F05 acrescenta `listByDate(date)` se precisar da visão de todos os inspetores (sempre filtrando `plan_date`, índice `(plan_date, status)`). **Toda** consulta de leitura da F05 re-une as paradas com `a.inspector_id = day_plans.inspector_id AND a.deleted_at IS NULL AND a.status IN ('SCHEDULED','DONE')` (L-F04-04).
- **Funções de domínio reusáveis (L-F04-16):** `classifyStops(stops: ClassifiableStop[]) → { executed, reorderable }` em `modules/day-plan/domain/classify-stops.ts` e `computeDayPlanFingerprint(input: FingerprintInput): string` + tipo `FingerprintInput` em `modules/day-plan/domain/day-plan-fingerprint.ts`; tipos planos, sem Prisma. A F05 usa essas funções (não reimplementa "executada"); os testes 1 e 1b da TASK-F04-2 são o contrato.
- **Predicado puro do T-1 (reconciliação F05 L-F05-03, 2026-10-29):** `T1VisibilityService.isVisibleForInspector(flowType, rentalTenantConfirmationStatus, keyRequired, scheduledDate, todayCivil, requiresRentalTenantConfirmation)` em `apps/backend/src/modules/inspector-execution/domain/t1-visibility.service.ts` (já existe; sem I/O, sem Prisma). A F04 o chama no leitor de candidatos só para `SCHEDULED`, com `todayCivil` no fuso efetivo do inspetor (Algoritmo §1); `DONE` entra sempre. A F05 aplica **o mesmo predicado, com os mesmos argumentos**, a paradas, total, alertas e roster, e antes de montar o `FingerprintInput` de `computeDayPlanFingerprint` (paradas invisíveis pelo T-1 não entram na impressão). A F04 não muda a assinatura nesta etapa.
- **Plano inviável (L-F04-05):** `feasible false` → a F05 mostra o **indicador** "Route infeasible" na linha do inspetor (badge + tooltip com as paradas que estouram a janela; `routeFeasible`/`routeViolations`), **não** um 8º tipo de alerta (F05 D20 mantém 7 tipos e o 01.A5; decisão do dev de 2026-10-29); a F04 não envia notificação à OP.
- **Atraso previsto por parada:** `stops[].lateS` e `serviceStartAt`; violação ≠ atraso real (o real vem dos eventos da F03).
- **Limites (L-F04-14):** `GET /v1/day-plans/:inspectorId/:date` 120/min por usuário; folha 20/min. O polling da F05 deve ficar abaixo disso.
- **Recalcular:** o `ROUTE_CHANGED` só sai com mudança efetiva e no máximo 1 por plano a cada 10 min (L-F04-06); a UI da F05 não precisa limitar cliques.

### 3. Para a F06 (avisos de horário ao inquilino)
- **Previsão fresca por appointment:** `container.dayPlan.getFreshStopForAppointmentUseCase.execute({ appointmentId })` → `FreshDayPlanStop | null` (`status 'FRESH' | 'STALE'`, `serviceStartAt`, `eta`, `lateS`, `approximate`, `manual`, `executed`, `planVersion`). **Reconfere a impressão digital** e recalcula quando divergente, então edições sem evento (`update-appointment`, `bulk-reschedule`, coordenada do imóvel) nunca produzem ETA errada. `status 'STALE'` = não foi possível recalcular agora (a F06 não deve avisar com ela).
- **Gatilho:** a F04 **não** exporta evento de domínio. A F06 define o próprio gatilho (job do aviso matinal, `LATE_NOTICE` da F03 etc.) e chama a leitura fresca antes de avisar. Se precisar reagir a uma ordem salva (D3: estouro gera aviso de atraso), a F06 acrescenta o evento quando tiver o consumidor.
- A ordem salva é a fonte (D3); plano `approximate` deve ser tratado pela F06 (decidir se avisa).
- **Sem histórico de versões (L-F04-15):** a F04 guarda só a versão corrente do plano. A prova do horário comunicado ao inquilino é o `payload_json` da notificação da F06 (gravar `serviceStartAt`, `planVersion` e `approximate` no payload).

### 4. Shared reusável (TASK-F04-1/2)
- `packages/shared/src/route-planning/`: `evaluateSequence`, `optimizeRoute`, `insertIntoOrder`, `compareEvaluations`, `haversineMeters`, `selectMatrixProfile`, `DEFAULT_ROUTE_WEIGHTS`, `ROUTE_OPTIMIZER_EXACT_MAX_STOPS`, tipos.
- `packages/shared/src/schemas/day-plan.ts`: schemas acima + `toOptimizerInput(plan, now)` + `buildLegOverrides(order, routingInput)`.
- Backend: `GET /v1/inspectors/me` com `onboardingCompletedAt` e `POST /v1/inspectors/me/app-state` aceitando `onboardingCompleted: true` (TASK-F04-2, consumidos pela TASK-F04-3b).
- `packages/shared/src/constants/day-plan.ts`, `packages/shared/src/enums/day-plan.ts`.
- `PLATFORM_SETTINGS_REGISTRY.routeWeights`.
- `ServiceType.defaultDurationMinutes` (todas as features que precisem de duração prevista).

---

## Achados para revisão

1. **01.A3 literal × otimizador.** O critério diz "a 1ª parada é a mais próxima da base, salvo janela CONFIRMED mais cedo". Com janelas rígidas e minimização de custo, existe caso válido em que a 1ª parada não é nenhuma das duas (Exemplo 3: `B,C,A` economiza 600 s e cumpre todas as janelas). Os testes 1–2 provam o critério nos casos canônicos. Garantir a regra literal exigiria uma restrição dura que piora rotas. Decidir se a redação do critério aceita "salvo quando outra ordem respeita todas as janelas com menos deslocamento".
2. **Semântica dos 3 pesos.** O plano nomeia "deslocamento × folga de janela × proximidade da base" sem definir. Adotado: deslocamento = soma dos trechos (sem volta à base); folga de janela = soma das esperas por abertura de janela; proximidade da base = duração do 1º trecho. Confirmar no onboarding (valores 1/1/1).
3. **Salvar a ordem chama Directions por trecho, não "uma vez".** O plano diz "ao salvar, chama Directions uma vez para o traçado", mas a decisão da API Mapbox exige `depart_at` por trecho para os horários previstos. Custo: n chamadas por salvamento (3–4), dentro da faixa gratuita.
4. **A matriz também é guardada e entregue ao cliente.** O servidor guarda `routing_matrix_json` (e `leg_travel_json`), e o PWA **recebe a matriz crua** em `routingInput` (mais as durações do Directions por trecho), porque o recálculo local da reordenação (01.3) precisa dela e o PWA não pode chamar a Mapbox (token do servidor). Incluir na consulta à Mapbox, junto do traçado: (a) guardar resultados de Matrix/Directions durante a vigência; (b) **repassar a matriz crua ao cliente final**. Tudo é expurgado no dia seguinte. **Atualizado em 2026-10-29 (L-F04-03):** consulta com dono e prazo (início da TASK-F04-2) e plano B escrito na TASK-F04-1.
5. **Base do dia sem autocomplete.** O plano diz "o mesmo autocomplete de endereço", mas `GET /v1/address/suggestions` proíbe INSP (`search-addresses.use-case.ts:18`) e a F01 (D11) decidiu campos estruturados sem autocomplete no PWA. O endpoint recebe o endereço estruturado. Liberar o autocomplete para INSP é mudança de RBAC (custo Mapbox de sugestões) e precisa de decisão.
6. **`APPOINTMENT_EVENTS.UPDATED`/`DELETED` declarados e nunca emitidos.** Edições de data/janela/imóvel/inspetor por `update-appointment`, bulk-edit/reschedule/assign e exclusão não geram evento; o STALE no banco só aparece quando alguém lê. Mitigado: **toda** leitura (inspetor, AM/OP e a leitura fresca da F06) reconfere a impressão digital. Emitir esses eventos seria mudança fora do plano (estacionamento).
7. **Estimativa (revisada em 2026-10-28).** Parte A = **14,75** (plano: 9,75). Deltas: +0,5 transferidos da Parte B (endpoints de ordem e de origem); +0,25 transferido da TASK-F04-3b (`onboarding_completed_at`); F04-1 +0,75 (limitador no Postgres 0,5, folga para frente 0,25); F04-2 +2,75 além das transferências (B4 subcusteado: estado de execução na impressão 0,25, ETA publicada 0,25, job singleton com orçamento e continuação 0,5, expurgo 0,25, integração ponta a ponta 0,5, e o restante do B4 que o plano não custeava; a retirada da mudança no `TenantCronTick` e do evento `day_plan.computed` economiza 0,5); F04-5 +0,75 (preview e mudança de contrato do backend não custeados). **Atualizado em 2026-10-29 (lacunas L-F04-01..16):** Parte A = **16,25** (F04-1 +0,25 → 5,75; F04-2 +1,25 → 9,25; F04-5 sem delta) e Parte B = **9,25** (F04-3 +0,25 → 3,75); F04 = **25,5**. **Reconciliação de 2026-10-29:** F04-2 +0,25 → 9,5 (assinante `BASE_CHANGED` da F01); Parte A = **16,5**; F04 = **25,75**.
8. **Destino do aviso.** A allowlist da F02 só aceita `/profile/announcements/:id` e `/schedule/:id`; `/today` entra na Parte B. A F04-2 publica sem `targetPath` (abre a caixa); a F04-3 deve passar `targetPath: '/today'` no `PublishDayPlansUseCase`/`RecalculateDayPlanUseCase` no mesmo PR que muda a allowlist.
9. **Filtro "Source" na lista web de avisos** (achado 1 da F02): a F04 gera um aviso por inspetor por dia; a lista da OP vai encher de "Automatic". Fora do escopo do plano; recomendar estacionamento.
10. **Publicação em agências com fuso de meia hora.** Sem mudar o `TenantCronTick` (revisão), o job roda no `:30` de Sydney: publica às 19:30 locais nas agências de hora cheia, mas em Adelaide/Darwin cai às 19:00 locais (antes do T-1, que roda às 19:30 locais delas) e só publica às **20:00**. Aceito; registrar para a homologação se houver agência nesses fusos.
11. **Inspetor multi-fuso.** O plano é publicado quando a **última** agência do inspetor foi reivindicada; os horários do aviso usam o fuso do inspetor. Na prática todas as agências são australianas.
12. **Métrica sobre a ETA publicada (resolvido na revisão).** `published_*` congela a previsão da publicação por parada; paradas que entram depois da publicação usam a 1ª previsão em que aparecem (antes do check-in). Outliers > 180 min e amostras < 30 tratados como descrito.
13. **Duração transitória.** Entre a F04-1 e a F04-5 a API aceita criar tipo sem duração (assume 45) para não quebrar o web atual; a F04-5 torna obrigatório (muda backend + shared + web). Promover F04-5 logo após a F04-2.
15. **Recálculo por check-in.** Com o estado de execução na impressão digital (bloqueador da reordenação), cada check-in leva a um recálculo no próximo `GET` (até 3–4 por inspetor por dia, com Matrix + Directions). Dentro da faixa gratuita na estimativa do plano; medir na homologação. **Resolvido em 2026-10-29 (L-F04-01):** check-out e DONE de parada iniciada marcam STALE, mas a leitura compara a impressão e só limpa o STALE, sem roteamento; o custo fica em 1 recálculo por check-in.
16. **Pesos sem efeito em muitos dias.** Com a folga para frente, as esperas só sobram quando são inevitáveis, então o peso "Waiting for windows" só pesa quando há janela apertada antes de uma janela tardia (Exemplo 6). Confirmar no onboarding que isso é o esperado.
14. **Atribuição depois das 19:30** não gera aviso de roteiro (o plano só fica STALE ou é criado ao abrir); o inspetor recebe os avisos de atribuição que já existem. Consistente com o plano; registrar para a homologação.


---

# Parte B (PWA)

TASK-F04-3 (PR3), TASK-F04-4 (PR4) e TASK-F04-3b (PR3b), **nesta ordem de merge** (revisão de 2026-10-28: o tour vem por último para que o passo sobre reordenar aponte para algo que já existe). Consomem **exatamente** os contratos de "Contratos exportados para a Parte B e outras features" acima, já com as correções da Parte A de 2026-10-28 (`legTravelS` no GET, conjunto reordenável derivado ao vivo, `earliestDeparture` de hoje, `onboarding_completed_at` na TASK-F04-2). Caminhos relativos a `apps/pwa/` salvo indicação. Código verificado no mesmo snapshot (`origin/develop`, 2026-10-27), com o que as tarefas F01-3, F02-3 e F03-3 entregam tratado como existente (todas mergeadas antes).

**Estimativa da Parte B: 9,25 dias** (revisada em 2026-10-29 com as lacunas L-F04-01..16; 9,0 em 2026-10-28; antes 8,75).

| Tarefa | Itens do plano | Antes | Agora | Delta e motivo |
|---|---|---|---|---|
| TASK-F04-3 | 00.1/00.5 2,5 + Base do dia 0,5 + 01.5 0,25 + 01.6 0,25 | 3,5 | **3,75** | **+0,25 lacunas 2026-10-29** (`OriginRow` em `LAST_STOP` sem lápis e erro 422 `DAY_PLAN_ALREADY_STARTED`, L-F04-07; "Call {name} ({role})", L-F04-08; card de amanhã/`published_at`, L-F04-02). Revisão de 2026-10-28: 0. Sair da renomeação `/profile` → `/more` economiza ~0,25 no passo de navegação (o cache mínimo do plano, uma rota mais o nome no logout, cabe no passo de dados sem delta). Esse 0,25 vai para a Tela do Dia (0,75 → 1,0), que estava subestimada para tantos estados e cards. A estimativa realista do revisor (≈ 3,5) se mantém. |
| TASK-F04-4 | 01.4 1,5 + 01.3 1,75 | 3,25 | 3,25 | 0. O recálculo local com `legTravelS` usa a opção `legTravelS` que já existe no `evaluateSequence` (TASK-F04-1). A medição do bundle cabe no QA. **Condicional:** +0,25 se a medição exigir o subpath export `@properfy/shared/route-planning` (Achado B5). |
| TASK-F04-3b | 00.2 tour 2,0 | 2,25 | **2,25** | **−0,25**: a fatia de backend do `onboarding_completed_at` passou para a TASK-F04-2 (Parte A). **+0,5**: specs Playwright E2E do tour (6 cenários, mocks `page.route`, emulação de standalone), por decisão do dev de 2026-10-28. O conserto da suíte é o **X03** (3,0 dias depois das lacunas de 2026-10-29, item próprio, fora da F04). Reconciliação com a X03 (2026-10-29: 2 projetos de telefone, `loginAsInspector`, fixtures com `.strict().parse`) sem delta. |
| **Total** | | **8,75** | **9,25** | **+0,25** (E2E do tour) **+0,25** (lacunas na F04-3, 2026-10-29). L-F04-12 (tour) e L-F04-13 (pins idênticos, F04-4) sem delta. O 0,25 do backend do onboarding é contado na Parte A. |

## Decisões que valem para a Parte B

Além de D1–D14 (Parte A), todas de **2026-10-27** salvo indicação:

- **DB1 · Navegação (00.1/00.5).** A barra passa a ser **Today / Schedule / Offers / More**. Earnings, Profile (Availability, Documents, My account, App settings) e Announcements (F02) ficam dentro de **More**; Challenges entra em More pela F08 (03.10/03.15) como `ProfileTile` "Challenges" logo depois de Earnings na grade de 2 colunas do `ProfilePage`, sem grupo novo (reconciliação F08 L-F08-09, 2026-10-29). A Tela do Dia (`/today`) é a nova home; layout do design v3. **Revisão de 2026-10-28: a aba More aponta para as rotas existentes de `/profile` (o hub é o `ProfilePage` atual). Nenhuma URL é renomeada e não há redirect.**
- **DB2 · Reordenar (Q19).** Arrastar com `@dnd-kit` **mais** setas subir/descer. As setas são a alternativa acessível ao arraste (WCAG 2.5.7).
- **DB3 · Estouro de janela só avisa (D3).** Nunca bloqueia salvar, mesmo em parada confirmada. Copy: "Stop 4 would arrive after its window 10:00 am – 12:00 pm".
- **DB4 · Base do dia (decisão F01 + D7).** "Starting from: [base] ✎" troca a origem **só daquele dia** (hoje ou D+1 publicado). Endereço **estruturado, sem autocomplete** (Achado 5 da Parte A; F01 D11). Sem base: o roteiro começa na 1ª janela, com o aviso "No base address: route has no starting point".
- **DB5 · Tour (00.2).** Coach marks com tela escurecida, recorte do alvo, Back/Next/Skip e contador de passos. O passo final de instalação só aparece fora do standalone. Abre no 1º acesso depois do login. Concluir ou pular grava `onboarding_completed_at` pelo endpoint do heartbeat da F01; a coluna, o campo do heartbeat e a leitura no `GET /v1/inspectors/me` são entregues pela **TASK-F04-2** (revisão de 2026-10-28), e a 3b só consome. "Show app tour" em More → App settings reabre sem mexer no estado. Alvos por `data-tour`. Componente próprio, **sem dependência nova** (trava de foco, Escape = pular, `prefers-reduced-motion`). Alvo ausente → passo pulado. Os banners de instalação atuais continuam.
- **DB6 · Mapbox no PWA.** O token do servidor nunca chega ao PWA; o traçado vem pronto em `geometry`. O PWA usa só o token público de estilo que já usa no mapa de ofertas (`env.mapboxToken`). Duas lições obrigatórias: **nunca** escrever `style.transform` no elemento raiz do marcador (o mapbox posiciona por esse transform; usar `setOffset`), e paint de camada com **HSL de vírgula** (`hslTripletToMapboxColor`, #1302). Os tokens do Mapbox já são separados por ambiente (dev, 2026-10-28): nada a configurar.
- **DB7 · Contrato da F02 (allowlist), revisado em 2026-10-28.** No **mesmo PR** que cria a Tela do Dia e muda a barra (TASK-F04-3), só se **acrescenta `/today`** a `INSPECTOR_NOTICE_TARGET_PATTERNS` e se passa `targetPath: '/today'` nos avisos `ROUTE_PUBLISHED`/`ROUTE_CHANGED` (Achado 8 da Parte A). O caminho da caixa (`/profile/announcements/:id`), o `inspectorNoticeDeepLink` e o fallback do `resolveClickTarget` do SW **não mudam**, porque a caixa continua em `/profile`.
- **DB8 · Datas.** `:date` e "hoje" = `todayInTzDateString(useEffectiveTimezone())`; amanhã = `addCivilDays(hoje, 1)` (`packages/shared/src/utils/local-date.ts`). Nunca o fuso do dispositivo (D14). ETA e janelas formatados em `stop.timezone`; `finishEta`, saudação e datas do cabeçalho em `plan.timezone`.
- **DB9 · Gate de teste (F03 D18; revisado em 2026-10-28).** TASK-F04-3 e TASK-F04-4: o gate é **Vitest + RTL + checklist de QA manual** no PR (iOS Simulator e Android/Chrome instalado). **TASK-F04-3b: o 00.A1 é provado por Playwright E2E** (decisão do dev). A 3b depende do **X03** (`fase2-etapa1/X03-e2e-pwa.md`), que conserta a suíte, e **não** usa a troca "Vitest + manual no lugar de E2E". Screenshots nunca entram no commit.
- **DB10 · "Reset to suggested order" fica (dev, 2026-10-28).** O INSP chama `POST /v1/inspector/day-plans/:date/recalculate` (contrato da Parte A).
- **DB11 · Contrato alinhado à Parte A (2026-10-28).** (a) `executed` e o conjunto reordenável são **derivados ao vivo**: só paradas **não iniciadas** (`executionStatus 'NOT_STARTED'`) são reordenáveis. (b) O GET traz `legTravelS`: o recálculo local usa `legTravelS` para os pares adjacentes que não mudaram e a matriz (`routingInput.travelS`) para os que mudaram. (c) Hoje, `earliestDeparture = max(agora, início do plano)`. Os nomes exatos dos campos seguem o contrato corrigido da TASK-F04-2.

## Mapa de rotas depois da Parte B

| Rota | Tela | `handle.wide` | Observação |
|---|---|---|---|
| `/` | → `/today` (replace) | – | antes `/schedule` |
| `/today` | `TodayLayout` (master `TodayPage`) | sim | nova home |
| `/today/route` | `RoutePage` (hoje) no painel de detalhe | (herda) | lista na F04-3; aba Map + reordenar na F04-4 |
| `/today/route/:date` | `RoutePage` (data civil) | (herda) | só hoje e D+1 são alcançáveis pela UI |
| `/schedule`, `/schedule/:appointmentId` | sem mudança | sim | o detalhe continua sendo o destino do toque no card da parada |
| `/marketplace` | sem mudança | sim | |
| `/profile` | `ProfileLayout` (master `ProfilePage`) **existente** = hub de More | sim | URL inalterada; destino da aba More |
| `/profile/announcements`, `/profile/announcements/:noticeId`, `/profile/availability`, `/profile/documents`, `/profile/account`, `/profile/settings` | páginas existentes (F01/F02) | (herda) | URLs inalteradas |
| `/earnings`, `/earnings/*` | sem mudança de URL | sim | aba **More** fica ativa nessas rotas |
| `*` | → `/today` | – | antes `/schedule` |

---

## TASK-F04-3 · PWA: navegação Today/Schedule/Offers/More, Tela do Dia, lista do roteiro, base do dia, card da parada e link de navegação

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F04-2, TASK-F01-3, TASK-F02-3, TASK-F03-3
> - **Desbloqueia:** TASK-F04-4, TASK-F08-4
> - **Pode rodar em paralelo com:** TASK-F04-5, TASK-F06-1, TASK-F07-1, TASK-F05-1, TASK-F06-2
> - **Pista sugerida (time de 6):** C · PWA

### Objetivo
- Trocar a barra para **Today / Schedule / Offers / More** e fazer a aba **More** abrir o hub **existente** em `/profile` (Earnings, Announcements, Availability, Documents, My account e a nova linha App settings). As URLs não mudam e não há redirect (revisão de 2026-10-28).
- Criar a **Tela do Dia** (`/today`) como home, no layout do design v3: saudação, "X of N done · finish ~hh:mm", card **Next inspection** (endereço, janela, previsto, distância, **Navigate** + **Check in/Check out** da F03), lista **Coming up**, card de avisos não lidos (F02) e card do roteiro de amanhã.
- Criar a tela **Route** (`/today/route[/:date]`) em modo lista: resumo (deslocamento, término, espera), "Starting from: [base] ✎" com a **base do dia** (só aquele dia), paradas em ordem com trechos ("6 min drive · 1.0 km · wait 25 min for window") e o download da folha (PDF/XLSX).
- Card da parada (01.5): endereço, janela, previsto, chave/local de encontro e **ligar para o contato principal**; tocar abre o detalhe existente.
- Botão **Navigate** (01.6): `maps.apple.com` no iOS e Google Maps nos demais, também no detalhe do serviço.
- Cumprir o contrato da F02 no mesmo PR (DB7) e mandar os avisos do roteiro para `/today`.

### Contexto no código
- **Router:** `src/app/router.tsx`. Index → `<Navigate to="/schedule" replace />` (l. 151); fallback `*` → `/schedule` (l. ~193); `profile` com `ProfileLayout` + filhos `availability|documents|account|settings|edit` (l. 173-182); `earnings`, `earnings/request-invoice`, `earnings/invoices[/:invoiceId]`; `execution/:appointmentId` fora do `PwaLayout`. Lazy via `lazyRetry` + `lazyElement`. Depois da F02-3, `profile` também tem `announcements` e `announcements/:noticeId`.
- **Barra:** `src/components/shell/BottomNavBar.tsx` (l. 69-74: `navItems` Schedule/Offers/Earnings/Profile; `NavLink` com `data-testid="nav-{label}"`; `grid-cols-4`, `min-h-touch`, `pt-[9px]`, `border-t`, `fixed bottom-0`, `pb-safe-b`). Ícones Schedule/Offers são SVG do artboard v3; Earnings/Profile são lucide. A F02-3 acrescentou o selo de não lidos na aba Profile (`useUnreadNoticeCount`, `aria-label="Profile, {n} unread announcements"`).
- **Contrato de folga da barra:** `src/components/shell/__tests__/nav-clearance-contract.test.ts` lê o fonte do `BottomNavBar.tsx` e exige `fixed bottom-0`, `pb-safe-b`, `min-h-touch`, `pt-[9px]`, `border-t` e `nav-clear` ≥ altura da barra; `PwaLayout.test.tsx` exige `<main … pb-nav-clear>`.
- **Layout:** `src/components/shell/PwaLayout.tsx` (`useMatches` → `handle.wide`; `<main className="… pb-nav-clear">`; `OfflineBanner`; depois da F01-3/F02-3 monta `useAppStateHeartbeat`, `usePushSubscriptionSync`, `useNoticeOpenedFromPush` e o listener de mensagens do SW). `TwoPaneLayout.tsx` (`fillHeight`, `variant`, `detailMode`, `WidePaneContext`/`STICKY_HEADER`), `TopBar.tsx` (`title`, `showBack`, `backTo` padrão `/schedule`, `backHideOnWide`, `size`).
- **Perfil (hub de More, URLs inalteradas):** `features/profile/pages/ProfileLayout.tsx` (`useMatch('/profile/:section')`; a F02-3 trocou para `'/profile/:section/*'`), `ProfilePage.tsx` (cartão de identidade, grade 2×2 de `ProfileTile` com Earnings → `/earnings`, Availability, Documents, My account; "Log out"; texto da versão), `ProfileAvailabilityPage.tsx:16`, `ProfileDocumentsPage.tsx:7`, `ProfileAccountPage.tsx:135` (`backTo="/profile"`) e `:255` (`to="/profile/settings"`), `ProfileSettingsPage.tsx:7` (`backTo="/profile"`). A F01-3 colocou o `BaseAddressBanner` no topo do `ProfilePage` e o link `/profile/account#base-address`; a F02-3 colocou o tile "Announcements" (`col-span-2`, no fim da grade) e as páginas `features/announcements/pages/{AnnouncementsPage,AnnouncementDetailPage}.tsx` (`backTo="/profile/announcements"` e `/profile`).
- **Allowlist F02:** `packages/shared/src/constants/inspector-notices.ts` (`INSPECTOR_NOTICE_TARGET_PATTERNS` = `/profile/announcements/:id`, `/schedule/:id`; `isAllowedInspectorNoticeTargetPath`, `resolveInspectorNoticeTargetPath`, `inspectorNoticeDeepLink(noticeId)`); SW: `src/sw/push-handlers.ts` (`resolveClickTarget` valida pela mesma allowlist; fallback `/profile/announcements`, **inalterado**) e `src/sw/runtime-caching.ts` (5 rotas; a de `/v1/inspector/schedule` é NetworkFirst `api-schedule-cache`, 50 entradas, 24 h, timeout 10 s). Os nomes de cache estão acoplados a `INSPECTOR_API_CACHES` em `src/hooks/useAuth.tsx`, que o logout limpa. Esta tarefa acrescenta **uma** rota mínima para o plano, porque o `apps/pwa/CLAUDE.md` (l. 160-161, 207) manda cachear "schedule for today" para ver offline. Correção de 2026-10-28.
- **Avisos do roteiro (backend, Parte A):** `apps/backend/src/modules/day-plan/application/use-cases/publish-day-plans.use-case.ts` e `recalculate-day-plan.use-case.ts` chamam `PublishSystemInspectorNoticeUseCase.execute({ type: 'ROUTE_PUBLISHED' | 'ROUTE_CHANGED', … })` **sem** `targetPath` (Achado 8 da Parte A).
- **Agenda:** `features/schedule/pages/SchedulePage.tsx` (banners de instalação na l. ~165, `BaseAddressBanner` da F01), `hooks/useScheduleDay.ts:13-16` (ordem por `timeSlotStart` + bairro: **não muda**; a ordem do roteiro vive só na Tela do Dia/Route), `hooks/useScheduleMonth.ts` (key `['inspector','schedule','month']`, staleTime 5 min), `components/AppointmentCard.tsx` (depois da F03-3: `<article>` com área principal + barra de ações Check in/Check out + "More actions" com Running late / Can't do this job), `components/PropertyAddressSection.tsx:32-34` (link Google fixo, `data-testid="open-maps-link"`, "Navigate to property").
- **Execução (F03-3):** `features/execution/hooks/useExecutionActions.ts` (check-in, pedido de check-out com etapas `SYNC`/`PAST_TIME`), `useStartInspection.ts`/`useFinishInspection.ts`, `useGeolocation.ts`, `features/field-events/components/{CantDoSheet,LateNoticeSheet}.tsx`, `features/field-events/hooks/{useReportCantDo,useReportLateNotice}.ts` (invalidam `['inspector','schedule']` e `['inspector','appointment', id]`), `useOfflineQueue.ts`, `FailedSyncBanner.tsx`.
- **Dados/UI kit:** `src/app/QueryProvider.tsx` (staleTime 30 s, gcTime 24 h, `networkMode: 'offlineFirst'`, sem retry em 4xx; `refetchOnWindowFocus` padrão `true`; **sem** persister), `hooks/useApiQuery.ts` (`apiGet`, `apiPost`; **não há** `apiPut`/`apiDelete`), `services/api.ts` (openapi-fetch com Bearer e refresh), `lib/api-error.ts` (`ApiError` com `status`/`code`/`message`, `isNetworkError`), `hooks/{useIsOnline,useEffectiveTimezone,useMediaQuery,useSnackbar,useGoBack}.ts`, `components/ui/{Card,Badge,Button,Alert,Segmented,Sheet,Dialog,MenuRow,Skeleton,Form,Input}.tsx`, `components/feedback/{LoadingState,ErrorState,EmptyState,OfflineBanner}.tsx`, `lib/format-date.ts` (re-exporta `formatCivilDate`, `formatWallTime*`, `formatInstantDate*` do shared; **não há** formatador de hora de um instante).
- **Shared:** `todayInTzDateString`, `addCivilDays` (`utils/local-date.ts`); `formatWallTimeRange` (`utils/format-display-date.ts`); `dayPlanResponseSchema`, `setDayPlanOriginRequestSchema`, `inspectorBaseAddressSchema` (Parte A / F01); tipos em `packages/shared/src/api-types.ts`.
- **Endereço estruturado (F01-3):** campos Street/Number/Unit/Suburb/State/Postcode inline no card "Base address" de `ProfileAccountPage.tsx` (RHF + `inspectorBaseAddressSchema`, `city = suburb`, `country 'AU'`).

### Decisões aplicáveis
D1, D3, D7, D8, D11, D14 (Parte A, 2026-10-27); DB1, DB3, DB4, DB7, DB8, DB9 (2026-10-27); F01 D11 (sem autocomplete no PWA, 2026-10-27); F02 D14/D15 (selo e allowlist, 2026-10-28); F03 D5/D7/D18 (2 toques, eventos só online, gate, 2026-10-27/28).

Reconciliação **2026-10-29**:
- **F02 D24 (L-F02-08):** `/today` entra em `INSPECTOR_NOTICE_TARGET_PATTERNS` como **padrão estático exato** (sem parâmetro, sem barra final, casamento segmento a segmento pelo algoritmo da F02); `/today/`, `/today/route/:date` e variações de caixa não casam.
- **X00 N10 (L-X00-04):** este PR cria o `api-day-plan-cache`, então remove "from F04" da regra N10 em `apps/pwa/CLAUDE.md` (§5 Caching), mantendo a menção ao `GET /v1/inspector/day-plans/:date` em `api-day-plan-cache`. Item no checklist de verificação.

Lacunas aplicadas em **2026-10-29** (recomendações aceitas):
- **L-F04-07 · Origem depois do 1º check-in.** `origin.source 'LAST_STOP'` → a `OriginRow` mostra "Continuing from: {label}" **só como texto** (sem lápis, sem "Use my base address", sem abrir a `OriginSheet`); se o servidor responder 422 `DAY_PLAN_ALREADY_STARTED` (folha aberta antes do check-in), a folha mostra a mensagem do servidor em `role="alert"`, fecha em 2 s e invalida o plano.
- **L-F04-08 · Contato com papel.** `CallContactLink` usa `primaryContact.role`: nome acessível e texto "Call {name} ({rótulo})" com os rótulos `tenant`, `tenant's representative`, `housekeeper`, `property manager`, `broker`; `OTHER` sem rótulo.
- **L-F04-02 · Card de amanhã.** O servidor devolve 200 para plano publicado em qualquer fuso; o card só mostra "Tomorrow's route will be ready at 7:30 pm" no 404 `NOT_PUBLISHED`. O texto "7:30 pm" continua fixo (Q9) e é a hora da agência (nota na spec).

### Testes primeiro (TDD)

Todos com Vitest + RTL, dependências injetadas, `QueryClient` novo por teste, `vi.setSystemTime` com instantes UTC explícitos e a suíte rodada também com `TZ=America/Los_Angeles` (memória `feedback_tz_dependent_test_must_pin_away`). Fixture base: o "Exemplo de resposta" dos contratos (Sydney, 2026-11-05), em `src/features/day-plan/__fixtures__/day-plan.ts` com builders `buildDayPlan(overrides)`/`buildStop(overrides)` (formato idêntico ao `dayPlanResponseSchema`; teste `dayPlanResponseSchema.parse(buildDayPlan())` garante o shape, memória `feedback_test_fixtures_must_match_api_shape`).

**1. Shared**
- `packages/shared/src/constants/__tests__/inspector-notices.test.ts` (alterado):

| Caso | Entrada | Esperado |
|---|---|---|
| Today | `/today` | `isAllowedInspectorNoticeTargetPath` → `true` |
| caixa | `/profile/announcements/<uuid>` | `true` (inalterado) |
| agenda | `/schedule/<uuid>` | `true` (inalterado) |
| fora | `/today/route/2026-11-05`, `/today/x`, `https://x/today`, `/today?x=1` | `false` |
| exato (F02 D24) | `/today/` (barra final), `/Today`, `//today`, `/today#x` | `false` |
| deep link | `inspectorNoticeDeepLink('<uuid>')` | `/profile/announcements/<uuid>` (inalterado) |

- `packages/shared/src/utils/__tests__/format-display-date.test.ts` (alterado): `formatInstantTime('2026-11-04T21:10:00.000Z', 'Australia/Sydney')` → `8:10 am`; meia-noite → `12:00 am`; `null`/`''` → `''`; string inválida devolvida intacta; mesmo resultado com `TZ=America/Los_Angeles`.

**2. Backend (alvo do aviso)**
- `apps/backend/tests/unit/day-plan/publish-day-plans.use-case.test.ts` e `recalculate-day-plan.use-case.test.ts` (alterados): `publishSystemInspectorNoticeUseCase.execute` recebe `targetPath: '/today'` em `ROUTE_PUBLISHED` e `ROUTE_CHANGED`; demais campos inalterados.
- `apps/backend/tests/unit/inspector-notice/publish-system-inspector-notice.use-case.test.ts` (alterado): `targetPath '/today'` aceito; `'/today/route/x'` → erro de validação existente da F02.

**3. Navegação e More**
- `components/shell/__tests__/BottomNavBar.test.tsx` (alterado):

| Caso | Rota | Esperado |
|---|---|---|
| itens | qualquer | 4 links na ordem Today, Schedule, Offers, More; `data-testid` `nav-today`, `nav-schedule`, `nav-offers`, `nav-more`; nenhum `nav-earnings`/`nav-profile` |
| destinos | – | `/today`, `/schedule`, `/marketplace`, `/profile` (a aba More abre o hub existente) |
| ativo Today | `/today/route` | Today com `aria-current="page"` |
| ativo More | `/profile`, `/profile/settings`, `/profile/announcements/x`, `/earnings`, `/earnings/invoices/x` | More ativo; nenhum outro |
| selo | `useUnreadNoticeCount` = 3 | selo "3" na aba More (`aria-hidden`), `aria-label="More, 3 unread announcements"`; Today/Schedule/Offers sem selo |
| selo 9+ | 12 | "9+" |
| sem não lidos | 0 / loading / erro | sem selo; `aria-label` ausente (nome = "More") |

- `nav-clearance-contract.test.ts`: **sem alteração**; tem de continuar verde (a barra mantém as 5 classes e `grid-cols-4`).
- `src/app/__tests__/router.test.tsx` (novo; `createMemoryRouter` com as rotas exportadas por `router.tsx` como `routes`):

| Caso | URL inicial | Esperado |
|---|---|---|
| home | `/` | `/today` |
| desconhecida | `/nada` | `/today` |
| perfil inalterado | `/profile/account#base-address` | `ProfileAccountPage` (URL e hash intactos) |
| route | `/today/route/2026-11-05` | `RoutePage` com `date = '2026-11-05'` |
| data inválida | `/today/route/2026-13-40` | `/today/route` (replace) |

- `features/profile/pages/__tests__/ProfilePage.test.tsx` (alterado, **sem renomear**): a linha nova "App settings" (`MenuRow`) → `/profile/settings`. Os demais casos continuam como estão: tiles, `BaseAddressBanner`, "Log out" e o tile "Announcements" da F02.
- `src/sw/__tests__/runtime-caching.test.ts` (alterado): `GET /v1/inspector/day-plans/2026-11-05` casa com a rota nova, NetworkFirst `api-day-plan-cache` (`maxEntries 3`, `maxAgeSeconds` 12 h, `networkTimeoutSeconds 10`, mesmo padrão de `api-schedule-cache`). **Não** casam: `…/sheet?format=pdf`, `PUT …/order`, `PUT/DELETE …/origin`, `POST …/recalculate` nem `GET /v1/day-plans/...` (AM/OP). As 5 rotas atuais continuam iguais. `INSPECTOR_API_CACHES` contém `api-day-plan-cache`.
- `src/hooks/__tests__/useAuth.test.tsx` (alterado): o logout chama `caches.delete('api-day-plan-cache')` junto dos outros nomes.
- `src/sw/__tests__/push-handlers.test.ts` (alterado): `url` `/today` → abre `/today` (com `?fromNotice=<id>`). Os demais casos ficam inalterados (fallback `/profile/announcements`).
- `features/auth/pages/__tests__/LoginPage.test.tsx` (alterado): sem redirect salvo → `/today`.

**4. Dados do plano**
- `features/day-plan/hooks/__tests__/useDayPlan.test.ts` (novo):

| Caso | Resposta | Esperado |
|---|---|---|
| sucesso | 200 | `data` = `DayPlanResponse`; key `['inspector','day-plan','2026-11-05']` |
| não publicado | 404 `DAY_PLAN_NOT_PUBLISHED` | `state 'NOT_PUBLISHED'`; sem retry |
| sem plano | 404 `DAY_PLAN_NOT_FOUND` | `state 'NOT_FOUND'` |
| STALE | 200 `status 'STALE'` | refaz o GET **uma** vez após 2000 ms (fake timers); se vier STALE de novo, não refaz |
| STALE de outra versão | 1º STALE v3, depois STALE v4 | um refetch por versão |
| rede | `isNetworkError` com cache | mantém `data` antigo, `isOffline true` |
| 5xx | erro | `ErrorState`; 2 retries (padrão do provider) |
| desabilitado | `enabled: false` | nenhuma chamada |

- `features/day-plan/hooks/__tests__/useDayPlanOrigin.test.ts` (novo): `PUT` com `{ address }` (`city = suburb`, `country 'AU'`, sem lat/lng) → `setQueryData` da key da data com a resposta + snackbar "Route updated. Starting from {label} for this day."; `DELETE` → `setQueryData` + "Route updated. Starting from your base address."; 422 `DAY_PLAN_ORIGIN_NOT_FOUND` / 503 / 422 `DAY_PLAN_DATE_IN_PAST` / 404 → erro exposto com `message` do servidor, cache intacto; duplo clique → 1 chamada.
- `features/day-plan/hooks/__tests__/useRouteSheetDownload.test.ts` (novo): `format 'pdf'` → GET `/sheet?format=pdf` com `parseAs: 'blob'`; nome do arquivo do `Content-Disposition` (`route-jane-doe-2026-11-05.pdf`), senão `route-2026-11-05.pdf`; cria e revoga a object URL; 404 → "This route isn't ready yet."; rede → "You're offline. Connect to download the route sheet.".
- `features/execution/hooks/__tests__/useExecutionActions.test.ts`, `features/field-events/hooks/__tests__/{useReportCantDo,useReportLateNotice}.test.ts`, `features/execution/hooks/__tests__/useOfflineQueue.test.ts` (alterados): sucesso (e sincronização de item da fila) também invalida `['inspector','day-plan']`.
- `src/components/shell/__tests__/PwaLayout.test.tsx` (alterado): mensagem `inspector-notice:received` do SW invalida também `['inspector','day-plan']`.

**5. Libs puras**
- `features/day-plan/lib/__tests__/navigation-url.test.ts` (novo):

| Caso | Entrada | Esperado |
|---|---|---|
| iOS com coords | UA iPhone, `{lat:-33.8836,lng:151.2108}` | `https://maps.apple.com/?daddr=-33.8836,151.2108&dirflg=d` |
| iPadOS (UA Macintosh + `maxTouchPoints 5`) | idem | Apple |
| macOS desktop (`maxTouchPoints 0`) | idem | Google |
| Android com coords | UA Android | `https://www.google.com/maps/dir/?api=1&destination=-33.8836,151.2108&travelmode=driving` |
| sem coords | `address '12 King St, Surry Hills NSW 2010'` | `daddr=`/`destination=` com `encodeURIComponent` do endereço |
| coords inválidas | `lat 999` | usa o endereço |

- `features/day-plan/lib/__tests__/format-route.test.ts` (novo): `formatDriveDuration(0)` → `0 min`; `59` → `1 min`; `2580` → `43 min`; `3900` → `1 h 5 min`; `formatDistance(650)` → `650 m`; `2140` → `2.1 km`; `null` → `''`; `formatLeg({travelS:360,distanceM:1000,waitS:0})` → `6 min drive · 1.0 km`; com `waitS 1500` → `6 min drive · 1.0 km · wait 25 min for window`; `formatCivilDateLong('2026-09-18')` → `Friday, 18 Sept` (independente de `TZ`); `greetingFor('2026-11-04T20:00:00Z','Australia/Sydney')` → `Good morning` (07:00), 12:00 → `Good afternoon`, 18:00 → `Good evening`.
- `features/day-plan/lib/__tests__/day-plan-view.test.ts` (novo; seletores puros de `DayPlanResponse`):

| Caso | Plano | Esperado |
|---|---|---|
| progresso | 3 paradas, 1 DONE | `{ done: 1, total: 3 }` |
| próxima | paradas DONE + paradas `NOT_STARTED` | 1ª `NOT_STARTED` (o conjunto é derivado ao vivo, DB11) |
| em andamento | 1 parada `executionStatus 'IN_PROGRESS'` (`executed true`) | essa parada (rótulo "In progress") |
| tudo feito | todas DONE | `next null`, `allDone true` |
| coming up | 6 paradas, próxima = 2 | as 3 seguintes não executadas (3, 4, 5) |
| vazio | `stops []` | `next null`, `allDone false`, `empty true` |
| ordem | `stops` fora de ordem no payload | ordenado por `sequence` |

**6. Telas**
- `features/today/pages/__tests__/TodayPage.test.tsx` (novo; agora = 2026-11-04T20:00Z = 07:00 Sydney, hoje 2026-11-05):

| Caso | Dados | Esperado |
|---|---|---|
| carregando | GET pendente | skeleton (`aria-busy="true"`), sem "Next inspection" |
| feliz | plano com 3 paradas, 0 feitas | "Good morning, Jane"; "Thursday, 5 Nov · Online"; "0 of 3 done · finish ~10:35 am"; link "Route" → `/today/route`; card "NEXT INSPECTION" com "ETA 8:00 am", endereço, "Window 8:00 am – 5:00 pm · 10 min · 4.7 km"; Navigate (href Apple/Google conforme UA); "Check in"; "Coming up" com 2 linhas; "View and reorder all 3 stops" → `/today/route` |
| chave e encontro | `keyRequired true`, `meetingLocation 'Front desk'` | chips "Key required" e "Meet at: Front desk" |
| espera | `waitS 1500` na próxima | chip "Wait 25 min for window" |
| atraso previsto | `lateS 900` | chip de aviso "Arrives after window" |
| ligar | `primaryContact { name:'Sam Lee', phone:'+61412345678', role:'RENTAL_TENANT' }` | link `tel:+61412345678` com texto e nome acessível "Call Sam Lee (tenant)" (L-F04-08); `role 'PROPERTY_MANAGER'` → "Call Sam Lee (property manager)"; `role 'OTHER'` → "Call Sam Lee"; sem phone → sem link |
| em andamento | próxima `IN_PROGRESS` | rótulo "IN PROGRESS"; botão "Check out" (F03) |
| tudo feito | 3 DONE | "All done for today" + "3 of 3 done"; sem Next |
| vazio | `stops []` | "No inspections today" + link "Browse offers" → `/marketplace`; sem "finish" |
| sem base | `originWarning 'NO_BASE'` | alerta "No base address: route has no starting point" + link "Add base address" → `/profile/account#base-address` |
| base não localizada | `'BASE_NOT_LOCATED'` | "We couldn't locate your base address — please check it" + mesmo link |
| aproximado | `approximate true` | faixa "Approximate route: travel times are estimates" |
| STALE | `status 'STALE'` | faixa `role="status"` "Updating your route…"; refetch após 2 s |
| erro | 5xx sem cache | "Couldn't load your route" + "Retry" (refaz o GET) |
| offline com cache | rede caiu, `data` presente | conteúdo + nota "Offline · showing your last saved route"; "Check in" segue a fila da F03 |
| offline sem cache | rede, sem `data` | "You're offline. Connect to load today's route." + "Retry" |
| avisos | `useUnreadNoticeCount` 2 | card "2 unread announcements" → `/profile/announcements`; 0 → sem card |
| amanhã não publicado | GET de 2026-11-06 → 404 NOT_PUBLISHED | "Tomorrow's route will be ready at 7:30 pm" |
| amanhã publicado antes das 19:30 locais (L-F04-02) | inspetor em `Australia/Perth`, `vi.setSystemTime('2026-11-05T08:35:00Z')` (16:35 Perth), GET de 2026-11-06 → 200 com 3 paradas | "Tomorrow · 3 stops · first at 8:00 am" (nunca o texto "ready at 7:30 pm") |
| amanhã publicado | 200 com 4 paradas | "Tomorrow · 4 stops · first at 8:00 am" + "View route" → `/today/route/2026-11-06` |
| amanhã vazio | 200 `stops []` | "No inspections tomorrow" |
| virada do dia | `visibilitychange` às 00:01 do dia seguinte | data recalculada; GET da nova data |
| Check in a partir do card | clique | chama `useExecutionActions().checkIn` (mock) com o id da próxima parada; **não** navega |
| corpo do card | clique no endereço | navega para `/schedule/<id>` |
| mais ações | "More actions" | menu da F03 com "Running late" e "Can't do this job" |

- `features/day-plan/pages/__tests__/RoutePage.test.tsx` (novo):

| Caso | Dados | Esperado |
|---|---|---|
| cabeçalho hoje | `/today/route` | TopBar "Today's route", back para `/today` (`backHideOnWide`) |
| cabeçalho amanhã | `/today/route/2026-11-06` | TopBar "Route · Fri 6 Nov" |
| resumo | totals `driveS 2580`, `waitS 1500`, `finishEta` | "Thursday, 5 Nov · 3 stops"; "43 min driving · Finish 10:35 am"; "25 min waiting" (só se `waitS > 0`); "14.2 km" |
| duração única | todas `durationMinutes 45` | "· 45 min each"; durações diferentes → omitido |
| lista | 3 paradas | `role="list"` em ordem de `sequence`; cada item: número, endereço, "Surry Hills · 8:00 am – 5:00 pm", "ETA 8:00 am"; entre itens, `formatLeg` do trecho até a parada seguinte |
| executada | parada DONE | marca "Done" (ícone + texto), sem ETA; em andamento → "In progress" |
| sem coordenada | `missingCoordinates true` | "Location not found for this address" no item |
| mesmo imóvel (L-F04-13) | parada 3 com `travelS 0`, `distanceM 0` e mesma lat/lng da 2 | `RouteLegRow` entre 2 e 3 diz "Same address" (sem "0 min drive · 0 m") |
| violação | `violations [{appointmentId:B, lateS:900}]` | no item B: "Arrives after its window (8:00 am – 9:00 am)" |
| origem base | `origin.source 'BASE'`, label "Redfern NSW 2016" | botão "Starting from: Redfern NSW 2016" com ícone de lápis e nome acessível "Change starting point for this day" |
| origem do dia | `source 'OVERRIDE'` | "Starting from: {label} (this day only)" + botão "Use my base address" |
| dia iniciado (L-F04-07) | `source 'LAST_STOP'`, label "Surry Hills", `originOverride` presente | texto "Continuing from: Surry Hills"; **sem** botão de lápis, sem "Use my base address"; nenhum elemento com nome "Change starting point for this day" |
| sem base | `originWarning 'NO_BASE'`, `source 'NONE'` | "No base address: route has no starting point" + "Add base address"; botão "Set a starting point for this day" |
| folha | menu "Download" → "PDF" / "Spreadsheet (XLSX)" | chama o download com o formato; spinner no item; erro em `role="alert"` |
| não publicado | `/today/route/2026-11-06` → 404 NOT_PUBLISHED | "Your route for this day isn't ready yet. It's published at 7:30 pm the day before." |
| não encontrado | 404 NOT_FOUND | "There is no route for this day." + "Back to Today" |
| data passada | `date < hoje` | somente leitura: sem lápis da origem; o download continua disponível |
| data no futuro além de amanhã | `/today/route/2026-11-09` | mesmo tratamento do 404 do servidor |
| layout largo | `useIsWide true` | página no painel de detalhe do `TwoPaneLayout`; `TopBar` fixa no topo do painel (`STICKY_HEADER`) |

- `features/day-plan/components/__tests__/OriginSheet.test.tsx` (novo): título "Start this day from"; subtítulo "Only for Thu 5 Nov. Your base address stays the same."; campos Street/Number/Unit/Suburb/State/Postcode com labels visíveis e os mesmos `autocomplete` da F01; validação ("Street is required", "Suburb is required", "Select a state", "Postcode is required", "Postcode must be 4 digits"); pré-preenche com `originOverride.address` quando existe; "Use this address" → PUT; enviando → "Updating route…", `aria-busy`; erro do servidor em `role="alert"` com o texto exato; offline → botão desabilitado + "You're offline. Connect to change your starting point."; 422 `DAY_PLAN_ALREADY_STARTED` → "Your day has started; the route continues from your last stop." em `role="alert"`, folha fecha após 2 s (fake timers) e o plano é invalidado (L-F04-07); sucesso fecha a folha e devolve o foco ao botão "Starting from…"; Escape fecha sem enviar.
- `features/day-plan/components/__tests__/StopCard.test.tsx` (novo; variantes `next` e `row`): endereço, janela (`formatWallTimeRange` dos `windowStart/End`), ETA no `stop.timezone` (parada de agência em `Australia/Perth` mostra a hora de Perth), chips, ligar, Navigate só na variante `next`; tocar no corpo → `/schedule/<id>`; nenhum `button button` no DOM; nome acessível do item: "Stop 2, 2/246 Willoughby Rd, ETA 9:01 am".
- `features/schedule/components/__tests__/PropertyAddressSection.test.tsx` (alterado): `open-maps-link` usa `buildNavigationUrl` (Apple no iOS, Google nos demais); texto "Navigate to property" mantido.
- `features/schedule/components/__tests__/AppointmentCard.test.tsx` (alterado): a barra de ações extraída (`AppointmentActionBar`) mantém todos os casos da F03-3.

**Acessibilidade (dentro dos testes acima):** `axe`-like asserts manuais — headings em ordem (`h1` "Good morning, Jane" na Tela do Dia; `h1` "Today's route" na Route); `aria-current` na barra; alvos de ação ≥ 44 px (classe `min-h-touch`); links externos com texto "Navigate to {address} (opens maps)".

**Checklist de QA manual** (iOS Simulator com o PWA instalado e no Safari; Android/Chrome instalado; backend local com o Mapbox stub da Parte A ou staging; marcar no PR, sem screenshots no commit):
- [ ] Q1: login → cai em `/today`; barra Today/Schedule/Offers/More; Today ativo.
- [ ] Q2: Tela do Dia com plano publicado: saudação, progresso, "finish ~", Next inspection, Coming up (até 3), "View and reorder all N stops".
- [ ] Q3: Navigate abre Apple Maps (iOS) e Google Maps (Android) com destino certo; o mesmo no "Navigate to property" do detalhe.
- [ ] Q4: Check in pelo card da Tela do Dia → o card vira "Check out" e o progresso não muda; Check out → "1 of N done" e a próxima parada sobe.
- [ ] Q5: "Can't do this job" na próxima parada → ela some da Tela do Dia e da Route (plano recalculado).
- [ ] Q6: Route: resumo, trechos com "wait … for window", origem "Starting from …"; trocar a origem → horários mudam e aparece "(this day only)"; "Use my base address" volta.
- [ ] Q7: inspetor sem base → aviso "No base address…" com link para `/profile/account#base-address` (rola e foca o card).
- [ ] Q8: antes das 19:30, "Tomorrow's route will be ready at 7:30 pm"; depois do job (ou do recálculo da OP), push "Your route for tomorrow is ready" → toque abre `/today` → card "Tomorrow · N stops" → "View route".
- [ ] Q9: download PDF e XLSX na Route (iOS standalone abre o visualizador; Android baixa).
- [ ] Q10: More (aba) abre `/profile`: Announcements (selo), Earnings, Availability, Documents, My account, App settings; selo de não lidos na aba More; um push de aviso abre `/profile/announcements/<id>` como antes.
- [ ] Q11: More continua ativa em `/earnings` e nas subpáginas de `/profile`; nenhuma URL antiga mudou.
- [ ] Q12: modo avião com a Tela do Dia já carregada → conteúdo + "Offline · showing your last saved route"; fechar e reabrir o app offline → o plano sai do `api-day-plan-cache` com a mesma indicação offline; fazer logout e logar com outro inspetor → nada do plano anterior aparece; ações que exigem rede desabilitadas com o texto da F03.
- [ ] Q13: tablet (iPad landscape): `/today` e `/today/route` lado a lado; cada painel rola sozinho; a barra não cobre o último item.
- [ ] Q14: iPhone com notch: nada atrás da home indicator; o botão "Use this address" da folha fica acima do inset.
- [ ] Q15: VoiceOver/TalkBack: barra anuncia "More, 2 unread announcements"; card "Next inspection" lido em ordem; botões com nome.
- [ ] Q16 (L-F04-07/08): depois do 1º check-in, a Route mostra "Continuing from: {suburb}" sem lápis; o botão de ligar diz "Call {nome} (tenant)" (ou o papel do contato).

### Escopo / Passos
- [ ] **1. Shared + backend do aviso (parte do item "navegação").**
  - Modify: `packages/shared/src/constants/inspector-notices.ts` (só acrescenta `/today` a `INSPECTOR_NOTICE_TARGET_PATTERNS` como padrão estático exato, F02 D24; `inspectorNoticeDeepLink` inalterado), `apps/pwa/CLAUDE.md` (remove "from F04" de N10, X00 L-04), `packages/shared/src/utils/format-display-date.ts` (+ `formatInstantTime(value, timeZone)`, exportado no índice), testes.
  - Modify: `apps/backend/src/modules/day-plan/application/use-cases/publish-day-plans.use-case.ts`, `recalculate-day-plan.use-case.ts` (`targetPath: '/today'`) + testes.
- [ ] **2. Navegação e More (parte do item "navegação"; sem renomear rotas).**
  - Novo: `src/app/__tests__/router.test.tsx`.
  - Modify: `src/app/router.tsx` (exportar `routes`; index/`*` → `/today`; `today` com `TodayLayout` e filhos `route` e `route/:date`; `profile` e filhos **inalterados**), `src/components/shell/BottomNavBar.tsx` (itens; ícones `House` e `Ellipsis` do lucide 0.468; More → `/profile`; selo movido de Profile para More; More ativa em `/profile/*` e `/earnings/*` via `useMatch`), `src/features/profile/pages/ProfilePage.tsx` (linha "App settings" → `/profile/settings`), `src/features/auth/pages/LoginPage.tsx` (`?? '/today'`), `apps/pwa/CLAUDE.md` (estrutura e rotas) + testes.
- [ ] **3. Dados do plano (parte do 00.1/00.5).**
  - Novo: `src/features/day-plan/api/day-plan-keys.ts` (`dayPlanKeys.all = ['inspector','day-plan']`, `byDate(date)`), `src/features/day-plan/hooks/useDayPlan.ts`, `useDayPlanOrigin.ts`, `useRouteSheetDownload.ts`, `src/features/day-plan/lib/{day-plan-view,format-route,navigation-url}.ts`, `src/features/day-plan/__fixtures__/day-plan.ts`, `src/features/today/hooks/useCivilToday.ts` (+ testes).
  - Modify: `src/sw/runtime-caching.ts` (uma rota a mais no `sw.ts` com `injectManifest` da F02, sem mudar as 5 atuais), `src/hooks/useAuth.tsx` (`INSPECTOR_API_CACHES` + `api-day-plan-cache`).
  - Modify: `src/hooks/useApiQuery.ts` (`apiPut`, `apiDelete`, `apiGetBlob` no mesmo padrão de `apiPost`, com `withRetryAfter`), `src/features/execution/hooks/useExecutionActions.ts`, `useOfflineQueue.ts`, `src/features/field-events/hooks/{useReportCantDo,useReportLateNotice}.ts` e o listener do SW no `PwaLayout` (invalidar `dayPlanKeys.all`).
- [ ] **4. Tela do Dia (00.1/00.5).**
  - Novo: `src/features/today/pages/{TodayLayout,TodayPage}.tsx`, `src/features/today/components/{TodayHeader,NextInspectionCard,ComingUpList,TomorrowRouteCard,UnreadNoticesCard,RouteWarnings}.tsx` (+ testes).
  - Novo (extração): `src/features/execution/components/AppointmentActionBar.tsx` (barra Check in/Check out + "More actions" que a F03-3 escreveu dentro do `AppointmentCard`), com o tipo mínimo `ExecutionActionTarget { id, status, executionStatus, scheduledDate, appointmentCode, propertyAddress }` e o adaptador `stopToActionTarget(stop, plan.date)`; `AppointmentCard.tsx` passa a usá-la sem mudança visível.
- [ ] **5. Route em lista + folha (parte do 00.1/00.5).**
  - Novo: `src/features/day-plan/pages/RoutePage.tsx`, `src/features/day-plan/components/{RouteSummary,RouteStopList,RouteLegRow,RouteSheetMenu}.tsx` (+ testes).
- [ ] **6. Base do dia (UI).**
  - Novo: `src/features/day-plan/components/{OriginRow,OriginSheet}.tsx` (+ testes).
  - Novo (extração): `src/features/profile/components/BaseAddressFields.tsx` (só os campos estruturados do card "Base address" da F01-3, recebendo o `control` do RHF); `ProfileAccountPage.tsx` passa a usá-lo sem mudança visível.
- [ ] **7. Card da parada (01.5).**
  - Novo: `src/features/day-plan/components/StopCard.tsx` (variantes `next` e `row`), `CallContactLink.tsx` (+ testes).
- [ ] **8. Navegar (01.6).**
  - Novo: `src/features/day-plan/lib/navigation-url.ts` (`buildNavigationUrl`, `isApplePlatform`), `NavigateButton.tsx`.
  - Modify: `src/features/schedule/components/PropertyAddressSection.tsx` (usa `buildNavigationUrl`) + teste.
- [ ] **9. QA manual** (Q1–Q15) e evidências no PR.

**Dias por passo (revisado em 2026-10-28):** 1+2 = 0,25 (navegação, sem renomear rotas); 3 = 0,5; 4 = 1,0 (Tela do Dia: cabeçalho, 4 cards, 8 estados); 5 = 0,5; 9 = 0,25 → 00.1/00.5 = **2,5**; 6 = **0,5** (base do dia); 7 = **0,25** (01.5); 8 = **0,25** (01.6). **Total 3,5.** Arquivos estimados: ~65 (incluindo testes), abaixo do limite de 150.

### UI e fluxos

**A. Barra inferior** (`BottomNavBar`)
- Itens: Today (`House`), Schedule (SVG atual), Offers (SVG atual), More (`Ellipsis`). Rótulos "Today", "Schedule", "Offers", "More". Mantém `grid-cols-4`, `min-h-touch`, `pt-[9px]`, `border-t`, `fixed bottom-0`, `pb-safe-b` (contrato de folga intacto).
- More aponta para `/profile` e fica ativa em `/profile/*` e `/earnings/*` (Earnings vive dentro de More). Today ativo em `/today/*`.
- Selo de não lidos (F02) passa da aba Profile para More: 1–9, "9+", tom `destructive`, `aria-hidden`; `aria-label="More, {n} unread announcements"` quando n > 0.
- `aria-current="page"` vem do `NavLink`. Foco visível do design system.

**B. More** (`/profile`, `ProfileLayout` **existente** com `TwoPaneLayout fillHeight`, master `ProfilePage`; URLs inalteradas)
- `ProfilePage` continua como está (#1298, F01, F02): `BaseAddressBanner`, cartão de identidade, tile "Announcements" em largura total ("{n} unread" / "No new announcements"), grade 2×2 (Earnings → `/earnings`, Availability, Documents, My account), "Log out" e rodapé `Properfy Inspector v{__APP_VERSION__}`. A **única mudança** é uma linha "App settings" (`Settings` do lucide) → `/profile/settings` no `MenuList`, acima de "Log out", porque o design v3 coloca App settings em More e hoje ela só é alcançável pela página My account.
- Sem redesenho das telas internas (fora do escopo do plano). O título da página não existe hoje (sem TopBar) e continua assim.
- Layout largo: idêntico ao do perfil (menu à direita, subpágina à esquerda).

**C. Tela do Dia** (`/today`, `TodayLayout` com `TwoPaneLayout fillHeight variant="master"`; master = `TodayPage`, detail = `<Outlet/>` com a Route)
- **Cabeçalho (`TodayHeader`)**
  - `h1` "Good morning, {firstName}" (morning < 12:00, afternoon < 18:00, evening; hora em `plan.timezone`, ou no fuso efetivo enquanto o plano carrega). `firstName` = 1º token de `user.name`.
  - Linha 2: "{Weekday, d MMM} · {Online|Offline}" (`useIsOnline`); com itens na fila offline da F03, acrescenta " · {n} waiting to sync".
  - Linha de progresso: "{done} of {total} done · finish ~{finishEta}" e link "Route" → `/today/route` (`data-tour` fica para a 3b). Sem `finishEta` (vazio ou tudo feito) → só "{done} of {total} done".
  - `FailedSyncBanner` (F03) abaixo do cabeçalho, quando houver.
- **Avisos do roteiro (`RouteWarnings`)**, nesta ordem e empilháveis: `originWarning` (`NO_BASE` / `BASE_NOT_LOCATED`, tom `warning`, link "Add base address" / "Check address" → `/profile/account#base-address`); `approximate` ("Approximate route: travel times are estimates", tom `info`); `status 'STALE'` ("Updating your route…", `role="status"`).
- **Card Next inspection (`NextInspectionCard` = `StopCard variant="next"`)**
  - Rótulo "NEXT INSPECTION" (ou "IN PROGRESS") e, à direita, "ETA {formatInstantTime(eta, stop.timezone)}".
  - Endereço (`propertyAddress`), linha 2 = `suburb`.
  - "Window {formatWallTimeRange(windowStart, windowEnd)} · {formatDriveDuration(travelS)} · {formatDistance(distanceM)}" (omite partes nulas; 1ª parada sem origem → só a janela).
  - Chips: "Key required" (`keyRequired`), "Meet at: {meetingLocation}", "Wait {n} min for window" (`waitS > 0`), "Arrives after window" (`lateS > 0`, tom `warning`), "Location not found for this address" (`missingCoordinates`).
  - Contato: "Call {primaryContact.name} ({rótulo do role})" (`tel:`) quando há telefone (L-F04-08).
  - Ações: `NavigateButton` (secundário) + `AppointmentActionBar` (Check in / Check out primário + "More actions" com Running late / Can't do this job, regras da F03). Mínimo 48 px.
  - Tocar no corpo (endereço/linhas) → `/schedule/{appointmentId}` (detalhe existente; o voltar do detalhe usa `useGoBack` e retorna à Tela do Dia).
  - Fora do escopo do design v3 (não construir): "maintenance item", "Tenant prefers afternoon", "Forgot? We'll prompt you…".
- **Coming up (`ComingUpList`)**: título "COMING UP"; até 3 paradas não executadas depois da próxima; cada linha = `StopCard variant="row"` (número da sequência num círculo, endereço, "{suburb} · {janela}", ETA à direita). Link "View and reorder all {total} stops" → `/today/route` (só com ≥ 2 paradas; com 1, "View route").
- **Card de avisos (`UnreadNoticesCard`)**: só com n > 0: "{n} unread announcement(s)" + chevron → `/profile/announcements`.
- **Card de amanhã (`TomorrowRouteCard`)**, sempre depois do Coming up:
  - 404 `NOT_PUBLISHED` → "Tomorrow's route will be ready at 7:30 pm" (texto fixo; 19:30 é a hora decidida em Q9, no fuso da agência). Plano já publicado volta 200 em qualquer fuso do inspetor (L-F04-02), então o texto nunca aparece depois do push;
  - 200 com paradas → "Tomorrow · {n} stops · first at {ETA da 1ª}" + "View route" → `/today/route/{amanhã}`;
  - 200 vazio → "No inspections tomorrow";
  - erro/offline → card escondido (não compete com o dia de hoje).
- **Estados da tela**
  - Carregando: skeleton do cabeçalho + 1 card grande + 3 linhas (`LoadingState`), `aria-busy`.
  - Vazio (`stops: []`): `EmptyState` "No inspections today" / "Browse offers" → `/marketplace`; o card de amanhã continua.
  - Tudo feito: card "All done for today" com "{total} of {total} done"; Coming up some.
  - Erro sem cache: `ErrorState` "Couldn't load your route" + "Retry".
  - Offline com cache: conteúdo + nota "Offline · showing your last saved route" sob o cabeçalho (o `OfflineBanner` global continua).
  - Offline sem cache: "You're offline. Connect to load today's route." + "Retry".
  - `PullToRefresh` refaz o plano de hoje e o de amanhã.

**D. Route** (`/today/route[/:date]`, `RoutePage`; no largo, painel de detalhe do `TodayLayout`)
- `TopBar` "Today's route" (hoje) ou "Route · {EEE d MMM}" (outra data), `showBack backTo="/today" backHideOnWide`.
- Subcabeçalho: "{Weekday, d MMM} · {n} stops[ · {d} min each]".
- `RouteSummary`: "{drive} driving · Finish {finishEta}"; "{wait} waiting" quando `totals.waitS > 0`; "{distância}" quando `totals.distanceM`; com `totals.lateS > 0`, alerta "{k} stop(s) would arrive after their window".
- `OriginRow`: ver "E. Base do dia".
- `RouteWarnings` (mesmo componente da Tela do Dia).
- `RouteStopList`: `role="list"`; para cada parada em ordem de `sequence`: `StopCard variant="row"` (número, endereço, "{suburb} · {janela}", "ETA {hora}" ou "Done"/"In progress", aviso de violação "Arrives after its window ({janela})"); entre duas paradas, `RouteLegRow` com o trecho **até a parada seguinte** (`travelS`, `distanceM`, `waitS` da parada seguinte): "6 min drive · 1.0 km · wait 25 min for window". O trecho da origem até a 1ª aparece acima dela ("From start: 10 min drive · 4.7 km").
- `RouteSheetMenu`: botão "Download" (ícone) no `TopBar` → menu com "PDF" e "Spreadsheet (XLSX)". Download por `apiGetBlob` + `<a download>` com object URL (revogada após 30 s). iOS standalone abre o visualizador do sistema (aceito).
- A aba Map e os controles de reordenar entram na TASK-F04-4; nesta tarefa a página tem só a lista (a F04-4 acrescenta o `Segmented` List/Map acima da lista).
- Estados: carregando (skeleton), `NOT_PUBLISHED` ("Your route for this day isn't ready yet. It's published at 7:30 pm the day before."), `NOT_FOUND` ("There is no route for this day." + "Back to Today"), erro (`ErrorState` + Retry), offline (igual à Tela do Dia), data passada (somente leitura: sem edição da origem), data inválida no path (`/today/route` com replace).

**E. Base do dia** (`OriginRow` + `OriginSheet`)
- `OriginRow`:
  - `source 'BASE'`: botão de linha inteira "Starting from: {label}" + ícone `Pencil`; `aria-label="Starting from {label}. Change starting point for this day"`.
  - `source 'OVERRIDE'`: "Starting from: {label} (this day only)" + botão de texto "Use my base address" (`DELETE`; confirmação não é necessária porque é reversível).
  - `source 'NONE'` (sem base): alerta "No base address: route has no starting point" + "Add base address" (link) e botão "Set a starting point for this day".
  - `source 'LAST_STOP'` (hoje, depois do 1º check-in, L-F04-07): "Continuing from: {label}" só texto (ícone `MapPin`, sem lápis, sem "Use my base address"); o `originOverride`, se houver, não é mostrado.
  - Data passada ou plano `NOT_FOUND`: só o texto, sem lápis.
- `OriginSheet` (`Sheet side="bottom"`, Radix: trava de foco, Escape, scroll lock, `pb-safe-b-6`):
  - Título "Start this day from"; subtítulo "Only for {EEE d MMM}. Your base address stays the same."
  - `BaseAddressFields` (os campos da F01): Street*, Number, Unit, Suburb*, State* (select NSW/VIC/QLD/WA/SA/TAS/ACT/NT), Postcode* (`inputMode="numeric"`), Country "AU" oculto; pré-preenchidos com `originOverride.address` se houver, senão vazios.
  - Rodapé: "Use this address" (primário) e "Cancel". Enviando: "Updating route…", `aria-busy`. Sucesso: fecha, `setQueryData`, snackbar "Route updated. Starting from {label} for this day.", foco volta ao `OriginRow`.
  - Erros (texto do servidor em `role="alert"`): 422 `DAY_PLAN_ORIGIN_NOT_FOUND` "We couldn't find this address. Check it and try again."; 503 `DAY_PLAN_ORIGIN_GEOCODER_UNAVAILABLE` "Address search is unavailable right now. Try again later."; 422 `DAY_PLAN_DATE_IN_PAST` "This day has already passed" (fecha e invalida); 422 `DAY_PLAN_ALREADY_STARTED` "Your day has started; the route continues from your last stop." (mostra, fecha após 2 s e invalida, L-F04-07); 404 `DAY_PLAN_NOT_PUBLISHED` (fecha e invalida). Dados do formulário mantidos.
  - Offline: botão desabilitado + "You're offline. Connect to change your starting point."
  - Sem autocomplete (DB4).

**F. Navigate (01.6)**
- `buildNavigationUrl({ lat, lng, address }, env = { userAgent, maxTouchPoints })`:
  - Apple quando `/iPhone|iPad|iPod/` no UA ou (`Macintosh` + `maxTouchPoints > 1`, iPadOS): `https://maps.apple.com/?daddr={lat},{lng}&dirflg=d`;
  - senão Google: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving`;
  - sem coordenada plotável (`isPlottablePoint`) → o endereço completo codificado no lugar das coords.
- `NavigateButton`: `<a target="_blank" rel="noopener noreferrer">` com ícone `Navigation`, texto "Navigate", nome acessível "Navigate to {address} (opens maps)". Usado no card Next inspection e no `PropertyAddressSection` (texto "Navigate to property" mantido).

**G. Card da parada (01.5)** — `StopCard`
- Campos já existentes no `DayPlanStop`; **nenhum campo novo**: endereço, janela, ETA, chave/local de encontro, contato principal.
- `CallContactLink`: `tel:{E.164}`, ícone `Phone`, texto e nome acessível "Call {name} ({rótulo do role})" (L-F04-08; rótulos: `RENTAL_TENANT` "tenant", `RENTAL_TENANT_REPRESENTATIVE` "tenant's representative", `HOUSEKEEPER` "housekeeper", `PROPERTY_MANAGER` "property manager", `BROKER` "broker", `OTHER` sem parênteses). Sem telefone → não renderiza. O servidor escolhe o contato (regra da TASK-F04-2); o PWA não reordena contatos.
- Estrutura `<article aria-labelledby>` com área principal (`<Link>` para o detalhe) e ações irmãs (nenhum botão dentro de botão).
- Tons: executada = `opacity-60` + "Done"; violação = borda esquerda `warning`; em andamento = borda `primary`.

**Fluxo de dados**

| Tela | Query key | Fonte | staleTime / refetch | Invalida / atualiza |
|---|---|---|---|---|
| Tela do Dia (hoje) | `['inspector','day-plan', hoje]` | `GET /v1/inspector/day-plans/:date` | 30 s (padrão); `refetchOnWindowFocus: true`; `refetchOnReconnect: true`; STALE → 1 refetch em 2 s por versão | invalidado por check-in/out (F03), cant-do, late-notice, sincronização da fila, mensagem `inspector-notice:received` do SW, pull-to-refresh |
| Card de amanhã | `['inspector','day-plan', amanhã]` | mesmo GET | 5 min; `refetchOnWindowFocus: true` | mesma invalidação por prefixo; 404 não tenta de novo |
| Route | `['inspector','day-plan', date]` | mesmo GET (compartilha cache) | 30 s | `PUT/DELETE origin` → `setQueryData` com a resposta |
| Não lidos | `['inspector-notices','unread-count']` (F02) | F02 | 30 s | F02 |
| Usuário / fuso | `useAuth` / `useEffectiveTimezone` | `/v1/me` | – | – |
| Folha | sem cache | `GET …/sheet?format=` (blob) | – | – |

- `useCivilToday()`: `todayInTzDateString(tz)` recalculado em `visibilitychange → visible`, `focus` e num `setTimeout` até a próxima meia-noite civil do fuso (recalculado a cada disparo). Muda a key e o GET da nova data acontece sozinho.
- **Offline (corrigido em 2026-10-28; regra do `apps/pwa/CLAUDE.md`, l. 160-161 e 207):**
  - Cache **mínimo** de SW para o plano, no mesmo padrão NetworkFirst de `/v1/inspector/schedule`, dentro do `src/sw/runtime-caching.ts` (setup `injectManifest` da F02).
  - Rota: só `GET` em `^/v1/inspector/day-plans/\d{4}-\d{2}-\d{2}$`. Ficam **fora** `/sheet`, as escritas e as rotas AM/OP.
  - Configuração: `cacheName 'api-day-plan-cache'`, `networkTimeoutSeconds 10`, `expiration { maxEntries: 3, maxAgeSeconds: 12 * 60 * 60 }` (hoje, amanhã e uma sobra; o plano de ontem não tem uso) e `cacheableResponse { statuses: [200] }`. Assim um 404 `NOT_PUBLISHED` nunca fica gravado como se fosse o plano.
  - **Dado sensível:** a resposta traz contato do inquilino (`primaryContact.name/phone`), endereços e local de encontro. Por isso o nome entra em `INSPECTOR_API_CACHES` (`src/hooks/useAuth.tsx`), e o **logout apaga o cache** junto dos de agenda e appointment, como já acontece com eles. O TTL curto e o `maxEntries` limitam o que fica no aparelho. Documentar esse ponto no `apps/pwa/CLAUDE.md` (seção de caching).
  - Tela offline: com o app aberto vale o cache em memória do React Query (`gcTime` 24 h, `offlineFirst`). Num app reaberto offline, o GET responde do `api-day-plan-cache` e a Tela do Dia/Route mostram o plano salvo com "Offline · showing your last saved route" (`useIsOnline` false). Sem nada no cache, aparece "You're offline. Connect to load today's route."

### Casos de borda
1. **0 paradas:** vazio "No inspections today"; sem "finish"; Route mostra o resumo com "0 stops" e o `OriginRow`; nada para reordenar.
2. **1 parada:** Coming up vazio; "View route".
3. **Sem base (`NO_BASE`):** começa pela 1ª janela; nenhum trecho "From start"; aviso + link; o inspetor ainda pode definir uma origem só para o dia.
4. **Base não localizada:** aviso da variante 2 da F01 (texto do contrato).
5. **Mais de 9 paradas:** nada muda na UI; o número da sequência cabe em 2 dígitos no círculo (largura mínima 28 px).
6. **Paradas em fusos diferentes** (agências fora de Sydney): ETA e janela de cada parada no `stop.timezone`; cabeçalho no `plan.timezone`.
7. **Virada do dia com o app aberto:** `useCivilToday` troca a data; o plano de ontem sai da tela.
8. **"Can't do this job" no meio do dia (F03):** sucesso invalida o plano; o GET recalcula (STALE no servidor) e a parada some; se o servidor ainda devolver STALE, "Updating your route…" e um refetch.
9. **Check in offline:** a fila da F03 guarda; o plano em cache continua com a parada como "não executada" até sincronizar (aceito); a sincronização invalida o plano.
10. **STALE duas vezes:** só 1 refetch automático por versão; depois fica "Updating your route…" até o próximo foco ou pull-to-refresh.
11. **Push "route ready" com o app aberto:** a mensagem do SW invalida o plano e o card de amanhã aparece sem recarregar.
12. **Pushes de aviso:** continuam abrindo `/profile/announcements/<id>` (caminho inalterado). Só os avisos do roteiro passam a abrir `/today`.
13. **Origem do dia trocada para amanhã e depois o job de 19:30 rodar:** o servidor mantém o `originOverride` (Parte A); a UI só reflete a resposta.
14. **Detalhe fora do cache e sem rede (check-out pelo card):** fallback da F03 para `/execution/:id`.
15. **iOS safe area:** a folha usa `pb-safe-b-6`; a Tela do Dia rola dentro de `<main pb-nav-clear>`; nada sticky fora do padrão `STICKY_HEADER`.
16. **Layout largo:** `TodayLayout` com `fillHeight` (memória "two-pane per-pane scroll"): cada painel rola sozinho; `hasSelection = useMatch('/today/route/*') !== null`; fechar → `/today` com replace.
17. **Link da agenda para o roteiro:** a Schedule **não** ganha link para a Route (a ordem da agenda continua por horário; fora do escopo do plano).
18. **Inspetor troca de conta no aparelho:** `queryClient.clear()` + limpeza dos caches do SW no logout (F02) cobrem o plano.
19. **Rate limit (429) no GET:** tratado como erro com Retry; o React Query não repete 4xx.
20. **Earnings como página cheia:** abrir Earnings a partir de More mantém More ativo; o voltar das páginas de Earnings continua como hoje.
21. **Origem depois do 1º check-in (L-F04-07):** a `OriginRow` vira "Continuing from: {suburb}" sem lápis; folha aberta antes do check-in e enviada depois → 422 `DAY_PLAN_ALREADY_STARTED` com a mensagem do servidor.
22. **Contato não inquilino (L-F04-08):** chave com o PM ou appointment importado sem `is_primary` → "Call {name} (property manager)"; sem telefone E.164 → sem botão.
23. **Inspetor fora de Sydney (L-F04-02):** o push "route ready" chega antes das 19:30 locais e o card de amanhã já mostra o plano (o servidor devolve 200 para plano publicado).
24. **Duas paradas no mesmo imóvel (L-F04-13):** o trecho de 0 s aparece como "Same address" no `RouteLegRow`.

### Fora do escopo
- Mapa do roteiro e reordenação (TASK-F04-4); tour (TASK-F04-3b).
- Challenges (F08) e "Help and support" (design v3, fora do plano).
- Itens do design v3 marcados fora do escopo: manutenção, fotos, controle de chave, texto manual "on the way", avisos fixados, tela pós-check-out com a próxima inspeção, lembrete "Forgot? We'll prompt you…".
- Autocomplete de endereço no PWA (Achado 5 da Parte A).
- Redesenho de Earnings, Offers, detalhe do serviço ou da agenda; ordem da agenda.
- Mudanças no backend além do `targetPath` dos avisos do roteiro.
- Renomear `/profile` para `/more` (removido na revisão de 2026-10-28). Cache de SW além da rota mínima do plano (sem cache da folha nem do plano de outras datas além de `maxEntries 3`).
- Conserto da suíte e2e do PWA.

### Critérios de aceite
1. **00.1/00.5:** depois do login o inspetor cai em `/today`; a barra é Today/Schedule/Offers/More; Earnings, Announcements e o perfil estão em More; `nav-clearance-contract.test.ts` verde sem alteração.
2. **01.A1 (exibição, parte lista):** a Tela do Dia e a Route mostram a sequência, os horários previstos, o término previsto, o deslocamento e as esperas vindos do plano publicado.
3. **01.5:** o card da parada mostra endereço, janela, previsto, chave/local de encontro e ligar; tocar abre o detalhe existente.
4. **01.6:** Navigate abre Apple Maps no iOS/iPadOS e Google Maps nos demais, no card e no detalhe.
5. **Base do dia:** o inspetor troca a origem só daquele dia (hoje antes do 1º check-in ou amanhã publicado), vê "(this day only)" e volta à base; sem base, vê "No base address: route has no starting point"; depois do 1º check-in vê "Continuing from: {suburb}" sem lápis (L-F04-07).
5b. **Contato:** o link de ligar mostra o papel do contato ("Call Sam Lee (tenant)", L-F04-08).
6. **F02 (DB7):** `/today` na allowlist (única mudança na constante), `ROUTE_PUBLISHED`/`ROUTE_CHANGED` com `targetPath '/today'` e o selo de não lidos na aba More. A caixa, o deep link e o fallback do SW ficam inalterados.
7. Estados de carregando, vazio, não publicado ("ready at 7:30 pm"), STALE, aproximado, erro e offline exatamente como na seção de UI.
8. `pnpm --filter @properfy/shared build && pnpm --filter pwa lint typecheck test build && pnpm --filter pwa check:ds` verdes; testes de backend dos 2 use cases verdes; QA Q1–Q15 marcado no PR.

### Dependências
- TASK-F04-2 mergeada (endpoints, `dayPlanResponseSchema`, api-types, `targetPath` opcional nos avisos).
- F01-3 (banner, `BaseAddress` inline, heartbeat), F02-3 (caixa, selo, SW `injectManifest`, allowlist) e F03-3 (`AppointmentCard` com ações, `useExecutionActions`, folhas) mergeadas.

### Riscos e armadilhas
- **Allowlist, Tela do Dia e barra no mesmo PR (DB7):** sem `/today` na allowlist, o backend rejeitaria o `targetPath` e o SW cairia no fallback. Os testes do shared, do SW e do router cobrem.
- **`useMatch` de 1 segmento:** o `TodayLayout` precisa de `'/today/route/*'` (lição da F02). O `ProfileLayout` não muda.
- **Selo na aba errada:** o teste da barra garante que só More tem selo.
- **Card com botão dentro de botão:** a extração da `AppointmentActionBar` mantém o `<article>` da F03; assert de DOM em todos os cards.
- **`typecheck` do PWA usa o dist do shared:** `pnpm --filter @properfy/shared build` antes (memória "shared build").
- **`api-types` desatualizados:** regenerar (`pnpm generate:api`) depois da F04-2; tipos novos nunca escritos à mão (memória "api-types regenerar").
- **Formatar instante como data civil:** usar `formatInstantTime` com `stop.timezone`; `formatCivilDate` só para `plan.date`.
- **Scroll por painel no largo:** `fillHeight` no `TodayLayout` (memória "two-pane per-pane scroll").
- **Cache do plano com dados do inquilino:** o nome `api-day-plan-cache` **tem** que entrar em `INSPECTOR_API_CACHES`, senão o plano (com contatos) de um inspetor sobrevive ao logout e aparece para o próximo usuário do aparelho. O teste do `useAuth` e o Q12 cobrem isso. Não cachear respostas que não sejam 200.

### Deploy / rollout / rollback
1. Ordem: F04-1 → F04-2 em produção **antes** desta tarefa (os endpoints precisam existir; sem eles a Tela do Dia mostraria erro como home).
2. Sem feature flag: a home muda para todos no primeiro carregamento após o deploy (SW `autoUpdate`). Comunicar pela caixa de avisos (aviso não crítico da OP: "The app has a new Today screen…") no dia do deploy; o tour da 3b reforça.
3. Backend (`targetPath`) e PWA saem no mesmo deploy (mesmo PR). Verificar em staging: publicar um plano de D+1 (recalcular pela OP) → push abre `/today`.
4. **Rollback:** reverter o PR. A allowlist volta sem `/today`; avisos já gravados com `/today` caem no fallback da caixa (comportamento seguro do SW). Não há rota renomeada. O `api-day-plan-cache` fica órfão até o próximo logout ou a expiração de 12 h (inofensivo).

### Dias · Branch · Verificação
- **Dias:** 3,75 (00.1/00.5 2,5 + base do dia 0,5 + 01.5 0,25 + 01.6 0,25 + lacunas de 2026-10-29 0,25: `LAST_STOP`/422 na `OriginRow`/`OriginSheet`, L-F04-07; rótulo do papel no `CallContactLink`, L-F04-08; caso do card de amanhã, L-F04-02).
- **Branch:** `feat/f04-pwa-today-nav` a partir de `develop`, depois da TASK-F04-2.
- **Checklist (reconciliação X00, 2026-10-29):** [ ] "Remove the transition clause of rule N10 ('from F04') from `apps/pwa/CLAUDE.md` in this PR (X00 L-04)"; [ ] `grep -n "from F04" apps/pwa/CLAUDE.md` vazio e `grep -n "api-day-plan-cache" apps/pwa/CLAUDE.md` ≥ 1.
- **Verificação:** `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test && pnpm --filter pwa lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && pnpm --filter pwa check:ds && pnpm --filter backend test -- day-plan inspector-notice`; QA Q1–Q15; `git diff --stat origin/develop... | tail -1` ≤ 150 arquivos.

---

## TASK-F04-3b · PWA: tour do app (coach marks) com passo de instalação, provado por E2E

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F04-4, TASK-X03-1, TASK-F01-3
> - **Desbloqueia:** TASK-F08-4
> - **Pode rodar em paralelo com:** TASK-F05-1, TASK-F06-2, TASK-F07-3, TASK-F08-1, TASK-F05-2
> - **Pista sugerida (time de 6):** C · PWA

### Objetivo
- Tour guiado no padrão dos apps: tela escurecida, recorte destacando o alvo, balão com título e texto curto, **Back / Next / Skip** e "Step 3 of 8".
- Passo final de **instalação** só fora do standalone (iOS: instruções do Safari; Android/Chrome: botão de instalar ou instruções manuais).
- Abre no 1º acesso depois do login. Concluir ou pular envia `onboardingCompleted: true` pelo heartbeat da F01; a coluna `onboarding_completed_at` e a leitura `onboardingCompletedAt` no `GET /v1/inspectors/me` são da **TASK-F04-2** (revisão de 2026-10-28). O tour não reaparece em nenhum dispositivo.
- **00.A1 provado por Playwright E2E** (decisão do dev, 2026-10-28), sobre a suíte consertada pelo **X03**.
- "Show app tour" em More → App settings reabre o tour sem mudar o estado.
- Componente próprio, sem dependência nova: trava de foco, Escape = pular, `prefers-reduced-motion`; alvo ausente → passo pulado.

### Contexto no código
- **Instalação:** `src/app/useInstallPrompt.tsx` (`InstallPromptProvider`/`useInstallPrompt()` → `isInstalled`, `canInstall`, `isIosSafariEligible`, `manualInstructions`, `promptInstall()`; `getIsStandalone()` exportada pela F01-3; `getIsIosSafariEligible()` exportada). Banners `features/schedule/components/{InstallBannerIos,InstallBannerNative}.tsx` e `features/profile/components/InstallAppCard.tsx` **continuam** (DB5).
- **Heartbeat (F01):** `POST /v1/inspectors/me/app-state` com `inspectorAppStateSchema` (`displayMode`, `pushPermission`, `appVersion`; modo strip), 204, rate limit 10/min; use case `apps/backend/src/modules/inspector/application/use-cases/record-inspector-app-state.use-case.ts` (`updateMany` com `where { id, deleted_at: null }`); cliente `src/app/useAppStateHeartbeat.ts` (throttle 6 h em `localStorage` `properfy.pwa.appStateHeartbeat`, storage injetável). `GET /v1/inspectors/me` (sem response schema; tipo no PWA em `features/profile/hooks/useInspectorMe.ts`, key `['inspector','me',userId]`, staleTime 5 min). Visibilidade por papel em `apps/backend/src/modules/inspector/application/inspector-field-visibility.ts` (F01).
- **`onboarding_completed_at` (TASK-F04-2, Parte A, revisão de 2026-10-28):** coluna `inspectors.onboarding_completed_at`, `inspectorAppStateSchema.onboardingCompleted: z.literal(true).optional()` (`COALESCE` no servidor) e `onboardingCompletedAt` no `GET /v1/inspectors/me`. Esta tarefa **só consome**; não toca no backend.
- **Alvos:** `BottomNavBar`, `TodayPage`/`NextInspectionCard`/`AppointmentActionBar`/`ComingUpList` (TASK-F04-3); o link "View and reorder all N stops" leva à Route, que já tem os controles reais de reordenar (TASK-F04-4, mergeada antes desta).
- **Settings:** `features/profile/pages/ProfileSettingsPage.tsx` (rota `/profile/settings`, inalterada; `push-preference-slot` da F02 + `InstallAppCard` + versão).
- **E2E (depois do X03):** `apps/pwa/playwright.config.ts` (4 projetos: `Mobile Safari`, `Mobile Chrome`, `Tablet (iPad portrait)`, `Foldable open`; `failOnFlakyTests` no CI), `apps/pwa/tests/e2e/*.spec.ts` (API mockada com `page.route`, contra `pnpm dev`). Helpers do X03 em `tests/e2e/support/`: `auth.ts` (`loginAsInspector`, `BASELINE_STUBS`, `INSPECTOR_ME`), `api.ts` (`stubJson`, `blockUnmockedApi`, `blockExternal`), `fixtures.ts`, `projects.ts` (`skipOnWide`, `skipOnPhone`), `idb.ts`. O X03 deixa a suíte verde e o job `test-pwa-e2e` **bloqueia o deploy** (não é advisory; o kill switch `vars.PWA_E2E_ADVISORY` é só para flake sistemático).
- **UI kit:** `components/ui/Button.tsx`; `@properfy/frontend-standards` (z-index e timing); `hooks/useMediaQuery.ts`. Radix Dialog existe, mas **não** serve para o balão (o tour precisa de recorte no alvo e de um popover ancorado, não de um modal centrado); a trava de foco é própria.
- **Root:** `index.html` `#root`; `main.tsx` monta `App`.

### Decisões aplicáveis
DB1, DB5, DB8 (2026-10-27); DB9 revisada (E2E para o tour, 2026-10-28); F01 D9/D10 (heartbeat é telemetria, banners de instalação inalterados, 2026-10-27); 00.A1 (critério do contrato).
- **L-F04-12 (2026-10-29) · Contagem e textos fechados.** O tour tem **8 passos de alvo + 1 de instalação**: 9 no browser, 8 em standalone. Todos os testes (E2E, `tour-steps.test.ts`, `AppTour.test.tsx`) usam esses números. A tabela de textos é **final** (não "proposta"); o passo 4 passa a dizer "Running late or can't do it? Tell us here. The job is released and operations are alerted straight away." (fluxo da Q1: o "Can't do" rejeita direto e a OP recebe alerta).

Reconciliação **2026-10-29** (X03):
- **Projetos (L-X03-07):** as specs do tour rodam **só nos 2 projetos de telefone** (`Mobile Safari`, `Mobile Chrome`), com `skipOnWide('tour targets are phone-layout anchors')` de `tests/e2e/support/projects.ts`; nos projetos largos aparecem como `skipped` com o motivo. E1–E6 = **12 execuções** (6 × 2), não 24.
- **Login e stubs (L-X03-04, L-X03-05):** usar `loginAsInspector(page, { me })`, cujo baseline já stuba `GET /v1/me`, `POST /v1/inspectors/me/app-state` (204) e `GET /v1/inspectors/me`; o stub que captura o corpo do `app-state` e o de `GET /v1/inspectors/me` com `onboardingCompletedAt` são registrados **depois** do `loginAsInspector` (o último registrado vence no `page.route`). Rotas não mockadas respondem 501 `E2E_UNMOCKED` (`blockUnmockedApi`).
- **Fixtures (L-X03-05):** fixtures novas (`INSPECTOR_PROFILE` com `onboardingCompletedAt`, plano do dia) em `tests/e2e/support/fixtures.ts`, cada uma com `schema.strict().parse(fixture)` no `src/__tests__/e2e-fixtures.test.ts` (Vitest).
- **Gate (L-X03-01, L-X03-02):** X03 estimado em **3,0** dias; o job `test-pwa-e2e` bloqueia o deploy (não é advisory) e roda com `failOnFlakyTests`: uma spec do tour que só passa no retry deixa o CI vermelho.

### Testes primeiro (TDD)

**1. E2E Playwright (gate do 00.A1; escritos primeiro e vermelhos até o tour existir)**

Novo `apps/pwa/tests/e2e/app-tour.spec.ts`, só nos 2 projetos de telefone (`Mobile Safari`, `Mobile Chrome`) via `skipOnWide('tour targets are phone-layout anchors')` no topo do arquivo; E1–E6 = 12 execuções. Login por `loginAsInspector(page, { me: INSPECTOR_ME })` (baseline do X03: `/v1/me`, `app-state` 204, `GET /v1/inspectors/me`); **depois** dele a spec registra com `stubJson` os stubs próprios: `/v1/inspectors/me` com `onboardingCompletedAt`, `/v1/inspector/day-plans/:date` com a fixture da F04-3 e `POST /v1/inspectors/me/app-state`, que captura o corpo (substitui o 204 do baseline). Fixtures novas em `tests/e2e/support/fixtures.ts`, validadas com `.strict().parse` no `src/__tests__/e2e-fixtures.test.ts`. O standalone é emulado por `page.addInitScript` sobrescrevendo `matchMedia('(display-mode: standalone)')` e `navigator.standalone`. O helper fica em `tests/e2e/support/standalone.ts`.

| # | Cenário | Pré | Passos | Esperado |
|---|---|---|---|---|
| E1 | 1º acesso mostra o tour | `onboardingCompletedAt: null`, browser (não standalone) | login → `/today` | `getByRole('dialog', { name: 'Today' })` visível; "Step 1 of 9"; overlay presente |
| E2 | Skip | igual a E1 | "Skip" | diálogo some; **1** POST `app-state` com `onboardingCompleted: true` |
| E3 | Concluir | igual a E1 | "Next" até "Done" | passa por todos os passos (contador até "Step 9 of 9"); "Done" → 1 POST com `onboardingCompleted: true`; diálogo some |
| E4 | Não reaparece | depois de E3, o mock do GET me passa a devolver `onboardingCompletedAt` preenchido | recarregar `/today` (e novo contexto de browser = "outro aparelho") | nenhum diálogo do tour em 3 s |
| E5 | "Show app tour" reabre sem mudar estado | `onboardingCompletedAt` preenchido | `/profile/settings` → "Show app tour" | tour abre em `/today`; Skip ou Done → **nenhum** POST `app-state` com `onboardingCompleted` (contador do mock = 0) |
| E6 | Instalação só fora do standalone | (a) browser; (b) standalone emulado | concluir até o fim | (a) último passo "Install Properfy" presente; (b) ausente e o total é 1 a menos ("Step 8 of 8") |

- Asserções por papel/nome acessível, nunca por posição de pixel. Esperas por `toBeVisible`/`toHaveCount`, sem `waitForTimeout` (exceto o "não aparece em 3 s" do E4, feito com `expect(...).toHaveCount(0)` após `page.waitForLoadState('networkidle')`).
- Rodam no CI no job `test-pwa-e2e` do X03 (bloqueia o deploy; `failOnFlakyTests`). Sanity: inverter uma asserção localmente deixa o job vermelho (critério do X03 aplicado a esta spec); `playwright test app-tour --repeat-each=3 --retries=0` verde local antes do PR; nos projetos largos o relatório mostra 6 `skipped` com o motivo.
- `src/__tests__/e2e-fixtures.test.ts` (alterado, X03): `inspectorResponseSchema.strict().parse(INSPECTOR_PROFILE_TOUR_PENDING)` (com `onboardingCompletedAt: null`) e com a data preenchida, e `dayPlanResponseSchema.strict().parse(DAY_PLAN_TODAY)` não lançam; uma chave a mais lança `ZodError`.

**2. Motor do tour (Vitest + RTL)**
- `features/tour/lib/__tests__/tour-geometry.test.ts` (novo; funções puras):

| Caso | Entrada | Esperado |
|---|---|---|
| recorte | rect `{x:20,y:600,w:100,h:44}`, padding 8 | spotlight `{x:12,y:592,w:116,h:60}` |
| balão abaixo | alvo no topo, viewport 390×844 | `placement 'bottom'`, dentro da tela |
| balão acima | alvo na barra inferior (y 790) | `placement 'top'` |
| clamp horizontal | alvo colado à direita | `left` ≥ 16 e `right` ≤ 390−16 |
| safe area | `safeTop 47`, `safeBottom 34` | balão nunca dentro dos insets |
| centro | sem alvo (passo de instalação) | `placement 'center'` |
| alvo invisível | rect 0×0 ou fora do documento | `isTargetVisible false` |

- `features/tour/lib/__tests__/tour-steps.test.ts` (novo): `resolveTourSteps({ isStandalone, isIosSafariEligible, canInstall })` → **8 passos de alvo + instalação** (9 no total) quando `!isStandalone`; standalone → 8, sem instalação; a ordem e os `data-tour` exatos (tabela da UI) (L-F04-12).
- `features/tour/components/__tests__/AppTour.test.tsx` (novo; `getBoundingClientRect` mockado por alvo):

| Caso | Ação | Esperado |
|---|---|---|
| abre | `open` | `role="dialog"` `aria-modal="true"` com `aria-labelledby` (título) e `aria-describedby` (texto); foco em "Next"; overlay presente; o restante do app com `inert` e `aria-hidden` |
| contador | passo 1 de 9 (browser) | "Step 1 of 9" visível e em `aria-live="polite"`; standalone → "Step 1 of 8" (L-F04-12) |
| Next/Back | Next, Next, Back | passo 2; Back desabilitado no 1º |
| último | no último passo | botão "Done" no lugar de "Next" |
| Skip | clique | `onFinish('skipped')` uma vez; overlay some; `inert` removido; foco volta ao elemento focado antes |
| Escape | tecla | igual a Skip |
| trava de foco | Tab no último botão | volta ao primeiro (Skip); Shift+Tab no primeiro → último |
| alvo ausente | passo 4 sem `[data-tour="today-more-actions"]` (MutationObserver espera 500 ms), browser | pula para o 5 (`today-route-link`); total vira 8; contador "Step 4 of 8" (L-F04-12) |
| alvo some no Back | Back para passo ausente | pula para o anterior válido |
| todos ausentes | só a instalação existe | mostra só a instalação ("Step 1 of 1") |
| nenhum passo | standalone e nenhum alvo | `onFinish('completed')` sem renderizar |
| scroll | alvo fora da tela | `scrollIntoView({ block: 'center', behavior: 'smooth' })`; com `prefers-reduced-motion: reduce` → `behavior: 'auto'` e sem classes de transição |
| reposiciona | `resize`/`orientationchange` | recalcula o recorte (rAF) |
| cliques fora | clique no overlay | não fecha, não navega (o alvo não é clicável durante o tour) |
| instalação iOS | `isIosSafariEligible` | texto com "Share" e "Add to Home Screen"; sem botão de instalar |
| instalação Android | `canInstall` | botão "Install app" → `promptInstall()`; aceito → "Installed" e "Done" |
| instalação manual | `!canInstall && !ios` | `manualInstructions` |

- `features/tour/hooks/__tests__/useAppTourController.test.tsx` (novo; storage, API e `useInspectorMe` injetados):

| Caso | Pré | Esperado |
|---|---|---|
| 1º acesso | `onboardingCompletedAt null`, rota `/today`, plano carregado | abre o tour uma vez |
| espera Today | rota `/schedule/abc` (deep link) | não abre; abre quando o usuário chega a `/today` |
| espera dados | plano carregando | não abre até sair do loading (alvos existem) |
| já concluído | `onboardingCompletedAt` preenchido | nunca abre |
| conclusão | `onFinish('completed')` | POST `/v1/inspectors/me/app-state` com os 3 campos da F01 + `onboardingCompleted: true`; invalida `['inspector','me']` |
| pulo | `onFinish('skipped')` | mesmo POST |
| offline/5xx | POST falha | grava `properfy.pwa.tourCompletedPending = <userId>`; não reabre nesta sessão nem no próximo carregamento; reenvia no próximo mount ou `online` |
| 429 | – | trata como pendente (reenvia depois) |
| pendente de outro usuário | chave com outro userId | ignora (abre para o usuário atual) |
| storage quebrado | `getItem` lança | abre no máximo 1 vez por carga (flag de módulo) |
| replay | `navigate('/today', { state: { replayTour: true } })` | abre mesmo com `onboardingCompletedAt` preenchido; **nenhum** POST ao terminar |
| logout | – | a chave pendente do usuário é removida (`lib/auth-storage.ts`) |
| StrictMode | duplo mount | 1 tour, 1 POST |

- `features/profile/pages/__tests__/ProfileSettingsPage.test.tsx` (alterado): linha "Show app tour" (`MenuRow`) → navega para `/today` com `state.replayTour = true`; `InstallAppCard` e slot de push continuam.
- `components/shell/__tests__/BottomNavBar.test.tsx` e `features/today/**/__tests__` (alterados): `data-tour` presentes (`nav-today`, `nav-schedule`, `nav-offers`, `nav-more`, `today-next`, `today-next-actions`, `today-more-actions`, `today-route-link`).

**Checklist de QA manual em aparelho**, complementar ao E2E e só para o que o Playwright não reproduz (iOS ≥ 16.4 no Safari e instalado; Android/Chrome no navegador e instalado):
- [ ] T2: no Safari iOS (não instalado), o último passo mostra as instruções de "Add to Home Screen"; instalado (standalone de verdade), o passo não aparece.
- [ ] T3: Android no Chrome: "Install app" abre o prompt nativo.
- [ ] T4: concluir no celular → logar em outro aparelho físico → o tour não aparece (o E4 cobre o mesmo cenário com um contexto novo).
- [ ] T7: inspetor sem paradas hoje → os passos do card são pulados sem quebrar e o contador se ajusta.
- [ ] T8: VoiceOver/TalkBack: título, texto e "Step n of m" lidos; foco preso no balão; Escape (teclado externo) pula.
- [ ] T9: "Reduzir movimento" ligado → sem animação nem rolagem suave.
- [ ] T10: rotacionar o tablet com o tour aberto → recorte reposicionado; nada atrás do notch.
- [ ] T11: modo avião ao concluir → não reabre; ao voltar a rede, o web (AM) mostra `onboardingCompletedAt` pelo GET (verificação por API).

### Escopo / Passos
- [ ] **1. E2E do tour (0,5).**
  - Novo: `apps/pwa/tests/e2e/app-tour.spec.ts` (E1–E6, `skipOnWide`, `loginAsInspector` + stubs próprios registrados depois), `apps/pwa/tests/e2e/support/standalone.ts` (init script de standalone).
  - Modify: `apps/pwa/tests/e2e/support/fixtures.ts` (fixtures de `inspectors/me` com `onboardingCompletedAt` e de `day-plans`), `apps/pwa/src/__tests__/e2e-fixtures.test.ts` (`.strict().parse` das fixtures novas).
  - Sem backend: a TASK-F04-2 já entrega `onboarding_completed_at`.
- [ ] **2. Motor do tour (0,75).**
  - Novo: `src/features/tour/components/AppTour.tsx` (portal em `document.body`, overlay, spotlight, balão), `src/features/tour/lib/tour-geometry.ts`, `src/features/tour/lib/focus-trap.ts`, `src/features/tour/hooks/useTargetRect.ts` (MutationObserver + `resize`/`scroll`/`orientationchange` com rAF), `src/features/tour/hooks/usePrefersReducedMotion.ts` (+ testes).
- [ ] **3. Passos, textos, alvos e passo de instalação (0,5).**
  - Novo: `src/features/tour/lib/tour-steps.ts`, `src/features/tour/components/InstallStepBody.tsx` (+ testes).
  - Modify (só atributos `data-tour`): `src/components/shell/BottomNavBar.tsx`, `src/features/today/components/{NextInspectionCard,ComingUpList,TodayHeader}.tsx`, `src/features/execution/components/AppointmentActionBar.tsx`.
- [ ] **4. Controlador, persistência e replay (0,25).**
  - Novo: `src/features/tour/hooks/useAppTourController.ts`, `src/features/tour/components/AppTourHost.tsx` (montado no `PwaLayout`), `src/features/tour/lib/tour-pending-storage.ts` (+ testes).
  - Modify: `src/components/shell/PwaLayout.tsx` (monta `AppTourHost`), `src/features/profile/hooks/useInspectorMe.ts` (tipo `onboardingCompletedAt`), `src/features/profile/pages/ProfileSettingsPage.tsx` ("Show app tour"), `src/lib/auth-storage.ts` (remove a chave pendente no logout), `apps/pwa/CLAUDE.md` (seção do tour e convenção `data-tour`).
- [ ] **5. QA manual em aparelho** T2–T4, T7–T11 (0,25).

**Total 2,25** (revisado em 2026-10-28: 0,5 de E2E + 0,75 do motor + 0,5 de passos + 0,25 do controlador + 0,25 de QA; a fatia de backend de 0,25 saiu para a TASK-F04-2). Arquivos estimados: ~30.

### UI e fluxos

**Passos** (textos **finais**, fechados em 2026-10-29, L-F04-12; em inglês, ≤ 140 caracteres; 8 de alvo + 1 de instalação):

| # | `data-tour` | Título | Texto | Condição |
|---|---|---|---|---|
| 1 | `nav-today` | Today | Your day at a glance: what's next, what's done and when you'll finish. | sempre |
| 2 | `today-next` | Next inspection | The job you're heading to, with its window and ETA. Tap it for full details. | alvo existe |
| 3 | `today-next-actions` | Navigate and check in | Navigate opens your maps app. Check in when you arrive and check out when you finish. | alvo existe |
| 4 | `today-more-actions` | Running late or can't do it? | Tell us here. The job is released and operations are alerted straight away. | alvo existe |
| 5 | `today-route-link` | Your route | See every stop in order, on a list or a map, and change the order if you need to. | alvo existe |
| 6 | `nav-schedule` | Schedule | All your upcoming jobs, day by day, and your history. | sempre |
| 7 | `nav-offers` | Offers | Groups of jobs near you. Accept the ones that fit your week. | sempre |
| 8 | `nav-more` | More | Announcements, earnings, your profile and app settings. | sempre |
| 9 | – (centro) | Install Properfy | iOS: "Tap Share, then Add to Home Screen. Open Properfy from your Home Screen to get notifications." Android com prompt: "Install the app for quicker access and notifications." + botão "Install app". Sem prompt: `manualInstructions`. | `!getIsStandalone()` |

- `today-route-link` marca o link "View and reorder all N stops" (ou "Route" do cabeçalho quando não houver Coming up). Como a TASK-F04-4 é mergeada antes (ordem revisada em 2026-10-28), a reordenação que o passo 5 promete já existe atrás desse link. O tour não navega para a Route: o alvo é o link real que leva aos controles de reordenar.
- Quando a F08 incluir Challenges em More (como `ProfileTile` "Challenges" logo depois de Earnings na grade de 2 colunas do hub, sem grupo novo; L-F08-09), só o texto do passo 8 muda (sem mudar a estrutura): o alvo continua `nav-more`.

**Componente `AppTour`**
- Portal no `body`, `z-[60]` (acima da barra `z-50` e das folhas).
- Overlay: `fixed inset-0` transparente que captura cliques; spotlight = `div` posicionado no rect do alvo + 8 px, `border-radius` 12 px, `box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.6)` (o escurecimento vem da sombra; sem `clip-path` para evitar custo de repaint no iOS). Passo central: overlay escuro inteiro, sem recorte.
- Balão: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby`, largura `min(320px, 100vw − 32px)`, posição por `tour-geometry` (abaixo/acima do alvo, clamp de 16 px e dos insets: `--safe-area-bottom` de `styles/tokens.css` e `env(safe-area-inset-top)` lido direto, porque não existe token de topo), seta opcional apontando o alvo.
- Conteúdo: título (`h2`), texto, linha inferior com "Step {i} of {n}" à esquerda e botões "Skip" (texto), "Back" (secundário, desabilitado no 1º) e "Next"/"Done" (primário). Alvos ≥ 44 px.
- Teclado: Tab/Shift+Tab presos no balão; Escape = Skip; Enter no botão focado. Foco inicial em "Next"; ao fechar, volta ao elemento ativo antes do tour (ou ao `main`).
- Fundo: `inert` + `aria-hidden="true"` no `#root` enquanto aberto (o portal fica fora dele).
- Movimento: com `prefers-reduced-motion: reduce`, sem transição do spotlight/balão e `scrollIntoView` instantâneo; sem a preferência, transição de 200 ms (`transform`/`opacity` no balão e no spotlight, **nunca** em elementos do app).
- Alvo ausente: espera até 500 ms pelo seletor (MutationObserver); se não aparecer, ou se o rect for 0×0, pula na direção da navegação e recalcula `n`.

**Controlador (`useAppTourController`, em `AppTourHost`)**
- Abre quando: INSP autenticado, `useInspectorMe` carregado com `onboardingCompletedAt == null`, sem pendência local do mesmo usuário, rota atual `/today` e plano de hoje fora do loading (sucesso, vazio ou erro), e ainda não aberto nesta carga.
- Ao terminar (concluído ou pulado), fora do replay: `apiPost('/v1/inspectors/me/app-state', { displayMode, pushPermission, appVersion, onboardingCompleted: true })` direto (sem o throttle de 6 h do heartbeat, que continua independente). Sucesso → invalida `['inspector','me']`. Falha → chave `properfy.pwa.tourCompletedPending` (`localStorage`, try/catch) com o `userId`; reenvio no próximo mount e no evento `online`.
- Replay: `ProfileSettingsPage` → linha "Show app tour" (ícone `Compass`, descrição "See how the app works again") → `navigate('/today', { state: { replayTour: true } })`; abre sem checar `onboardingCompletedAt` e **não** chama a API no fim.

### Casos de borda
1. **Deep link de push no 1º acesso** (ex.: `/profile/announcements/x`): o tour espera o usuário chegar à Tela do Dia.
2. **Sem paradas hoje:** passos 2–5 pulados; o tour tem 4 (ou 5 com instalação) passos.
3. **Layout largo:** a Route aberta no painel não esconde os alvos da Tela do Dia (master continua montado); a barra continua no rodapé.
4. **Teclado virtual / orientação:** reposiciona no `resize`.
5. **Instalado no meio do tour** (Android aceita o prompt): o passo de instalação mostra "Installed" e "Done".
6. **Dois aparelhos ao mesmo tempo:** o 1º a concluir grava; o `COALESCE` mantém a data; o 2º para de abrir após o próximo GET do `inspectors/me`.
7. **Inspetor existente no deploy:** coluna nula para todos → todos veem o tour uma vez (desejado: a navegação mudou na F04-3).
8. **Snackbar/folha aberta quando o tour quer abrir:** o tour só abre sem `Sheet`/`Dialog` abertos (checa `[data-state="open"][role="dialog"]`); tenta de novo no próximo render.
9. **iOS < 16.4 / sem `inert`:** o overlay que captura cliques garante que o app de fundo não recebe toque; `aria-hidden` cobre o leitor de tela.
10. **Logout durante o tour:** desmonta com o `PwaLayout`; nada gravado.

### Fora do escopo
- Mudanças nos banners de instalação e no `InstallAppCard` (DB5).
- Tour no web ou no portal; tours por tela; analytics de passos.
- Exibir `onboardingCompletedAt` no web (o campo só fica disponível na API para AM/OP).
- Qualquer biblioteca de tour.
- Backend do `onboarding_completed_at` (TASK-F04-2) e o conserto da suíte E2E (X03).

### Critérios de aceite
1. **00.A1, provado por E2E (E1–E6 verdes no CI):** o tour aparece no 1º acesso, pode ser pulado, pode ser concluído, não reaparece depois (inclusive em outro contexto/aparelho) e é revisto em More → App settings sem mudar o estado. O passo de instalação só aparece fora do standalone. A instalabilidade real no iOS 16.4+ e no Android é confirmada no QA de aparelho (T2/T3).
2. Back/Next/Skip, contador, Escape = pular, trava de foco, `prefers-reduced-motion` e alvo ausente pulado funcionam como na seção de UI (Vitest).
3. `onboardingCompleted: true` é enviado uma vez ao concluir/pular; o replay não envia.
3b. Contagem única em todos os testes: 9 passos no browser, 8 em standalone; textos da tabela de passos usados literalmente (L-F04-12).
4. Nenhuma dependência nova em `apps/pwa/package.json`.
5. `pnpm --filter @properfy/shared build && pnpm --filter pwa lint typecheck test build && pnpm --filter pwa check:ds && pnpm --filter pwa test:e2e` verdes; QA de aparelho marcado.

### Dependências
- **X03** mergeado (suíte E2E do PWA verde e gate real no CI). Sem ele, esta tarefa não fecha.
- **TASK-F04-2** em produção/staging com `onboarding_completed_at` (campo no heartbeat e no `GET /v1/inspectors/me`; api-types regenerados).
- TASK-F04-3 e **TASK-F04-4** mergeadas (ordem F04-3 → F04-4 → F04-3b: navegação final, alvos da Tela do Dia e reordenação existente).
- F01-1/F01-3 (heartbeat e `getIsStandalone`), F02-3 (slot de push em Settings), F03-3 (`AppointmentActionBar` vem da extração da F04-3).

### Riscos e armadilhas
- **X03 com causa incerta:** se o conserto da suíte atrasar, esta tarefa fica bloqueada. O X03 tem estimativa própria (3,0 depois das lacunas de 2026-10-29). Não substituir o E2E por QA manual (decisão do dev). Como o `test-pwa-e2e` bloqueia o deploy e tem `failOnFlakyTests`, um flake do tour trava o deploy de todo o monorepo: esperar por papel/contador, nunca por tempo; o kill switch `PWA_E2E_ADVISORY` é ação de admin para flake sistemático, não para esta spec.
- **Contrato do `onboarding_completed_at` (TASK-F04-2):** se o servidor não declarar `onboardingCompleted` no schema (modo strip), a chave é descartada sem erro e o tour reaparece para sempre. O E4 pega isso só com o mock; validar o fluxo uma vez contra o backend de staging (T11).
- **Mocks do E2E fora do contrato:** as fixtures de `page.route` usam o formato dos api-types (memória `feedback_test_fixtures_must_match_api_shape`); o `src/__tests__/e2e-fixtures.test.ts` do X03 faz `.strict().parse` das fixtures pelos schemas do shared.
- **Standalone emulado ≠ real:** o init script cobre `matchMedia` e `navigator.standalone`; a prova da instalação real fica no T2/T3.
- **Flakes:** esperar pelo `role="dialog"` e pelo contador, nunca por tempo; o portal e o `inert` precisam estar estáveis antes do clique.
- **Posicionamento com `transform` em ancestrais** (folhas animadas): calcular com `getBoundingClientRect` no momento e reposicionar em rAF.
- **`inert` no `#root`:** remover sempre no cleanup (inclusive em erro), senão o app fica morto. Teste do Skip cobre.
- **jsdom:** sem layout real; mockar `getBoundingClientRect`/`matchMedia`; `localStorage` injetado (memória "jsdom localStorage").
### Deploy / rollout / rollback
1. Só PWA. A coluna e o campo do heartbeat já estão no ar desde a TASK-F04-2.
2. Rollout: todos os inspetores veem o tour uma vez no 1º acesso à Tela do Dia depois do deploy (coluna nula para todos).
3. **Rollback:** reverter o PR (o tour some). A coluna da TASK-F04-2 fica inerte; nada a desfazer no backend.

### Dias · Branch · Verificação
- **Dias:** 2,25 (E2E 0,5 + motor 0,75 + passos 0,5 + controlador 0,25 + QA 0,25). Delta frente ao plano (2,0): −0,25 de backend (movido para a TASK-F04-2) e +0,5 de E2E (decisão do dev de 2026-10-28). L-F04-12 (contagens e textos, 2026-10-29) não muda a estimativa.
- **Branch:** `feat/f04-pwa-app-tour` a partir de `develop`, depois da TASK-F04-4 e do X03.
- **Verificação:** `pnpm --filter @properfy/shared build && pnpm --filter pwa lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && pnpm --filter pwa check:ds && pnpm --filter pwa test:e2e` (E1–E6 verdes; inverter uma asserção localmente deixa vermelho); `git diff origin/develop... -- apps/pwa/package.json` sem dependência nova; QA de aparelho.

---

## TASK-F04-4 · PWA: mapa do roteiro e reordenação (arrastar + setas, recálculo local, "+N min vs. suggested", avisos de janela, salvar com conflito de versão)

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F04-3, TASK-F04-2
> - **Desbloqueia:** TASK-F04-3b
> - **Pode rodar em paralelo com:** TASK-F07-1, TASK-F05-1, TASK-F06-2, TASK-F07-2, TASK-F07-3, TASK-F08-1
> - **Pista sugerida (time de 6):** C · PWA

### Objetivo
- **01.4:** aba **Map** na Route com pins numerados na ordem do plano, pin da origem e o **traçado real** (`geometry` do backend), reusando os hooks do mapa de ofertas generalizados em `src/lib/map/`.
- **01.3:** reordenar a lista arrastando (`@dnd-kit`) **ou** com setas subir/descer; recálculo **local** com a matriz do plano (`toOptimizerInput` + `evaluateSequence`), sem chamada de API; "+12 min vs. suggested"; avisos de janela; **Save order** com a versão otimista e tratamento de conflito; "Reset to suggested order" (`POST …/recalculate` pelo INSP, mantido pelo dev em 2026-10-28, DB10).
- Recálculo local alinhado ao contrato corrigido da Parte A (DB11): só paradas não iniciadas são reordenáveis; `legTravelS` para pares adjacentes inalterados e matriz para os alterados; hoje, `earliestDeparture = max(agora, início do plano)`.
- Medir o impacto no bundle do PWA de importar `route-planning` do shared e agir se passar do limite (ver Verificação).

### Contexto no código
- **Mapa de ofertas** (a generalizar; o plano cita `lib/offers-map/markers.ts:60`, mas o caminho real é `src/features/offers/lib/offers-map/markers.ts`):
  - `src/features/offers/hooks/useMapboxInstance.ts` (import dinâmico de `mapbox-gl`, guarda do token `env.mapboxToken` → "Map is temporarily unavailable.", estilo `streets-v12`, `NavigationControl`, `load`/`error`, `onUserGesture` por `originalEvent`, `retry`, teardown);
  - `useMapCamera.ts` (`computeCenter(offers)`, `AU_CENTRE`, `SINGLE_APPOINTMENT_ZOOM 15`, `MAX_FIT_ZOOM 15`, `syncCamera`, auto-fit até o 1º gesto; usa `computeBounds`/`isSinglePointBounds` de `src/lib/map-bounds.ts`);
  - `useOfferPins.ts` (coloca marcadores DOM, `applyCollisionOffsets`, chama `syncCamera`);
  - `useOfferRoute.ts` (`hslTripletToMapboxColor`, `resolvePrimaryColor`, fonte/camada `offer-route` tracejada; liga os pins na ordem do `appointment_number` — **não é rota**);
  - `lib/offers-map/markers.ts` (`PRIMARY_COLOR`, `PIN_DIAMETER_PX 36`, `PIN_BASE_STYLE`, `makeMarkerEl`, `makeAppointmentMarkerEl(index)`, `isValidCoordinate`, `PlacedMarker`, `applyCollisionOffsets`; comentário "never set `style.transform`"), `lib/offers-map/types.ts`;
  - `components/MapOverlays.tsx` (erro + retry, "no pins", chip), `components/OffersMapView.tsx`;
  - testes: `hooks/__tests__/useOfferRoute.test.ts`, `lib/offers-map/__tests__/markers.test.ts`, `components/__tests__/OffersMapView.test.tsx`, `src/lib/__tests__/map-bounds.test.ts`.
- **Route (TASK-F04-3):** `src/features/day-plan/pages/RoutePage.tsx`, `components/{RouteStopList,StopCard,RouteLegRow,RouteSummary}.tsx`, `hooks/useDayPlan.ts`, `api/day-plan-keys.ts`, `lib/format-route.ts`, `__fixtures__/day-plan.ts`.
- **Shared (Parte A):** `packages/shared/src/route-planning/` (`evaluateSequence`, `RouteOrderMismatchError`, tipos `OptimizerInput`/`SequenceEvaluation`), `packages/shared/src/schemas/day-plan.ts` (`toOptimizerInput(plan): OptimizerInput | null`, `saveDayPlanOrderRequestSchema`). `evaluateSequence(input, order, { legTravelS })` aceita uma duração por posição (`null` = usar a matriz). Pela correção da Parte A (2026-10-28), o GET traz `legTravelS` (as durações do Directions dos trechos da ordem salva) e o conjunto reordenável é derivado ao vivo.
- **Bundle:** `packages/shared/package.json` exporta só `"."` (`dist/index.js` gerado pelo `tsup`, **sem** `"sideEffects": false`). O PWA já importa o barrel inteiro, então o tree-shaking do `route-planning` não é garantido.
- **Navegação com alterações não salvas:** `src/lib/use-unsaved-changes-prompt.ts` (`unstable_usePrompt`).
- **Dependências:** `apps/pwa/package.json` **não** tem `@dnd-kit` (nenhum workspace tem). Dependência nova decidida em Q19.
- **UI kit:** `components/ui/{Segmented,Button,Dialog,Alert}.tsx`, `useSnackbar`, `useIsOnline`, `useIsWide`.

### Decisões aplicáveis
D3, D8, D14 (Parte A, 2026-10-27); DB2, DB3, DB6, DB8, DB9 (2026-10-27); DB10, DB11 (2026-10-28); Q19 (arrastar + setas, 2026-10-27).

Lacunas aplicadas em **2026-10-29**:
- **L-F04-03 · Variante da reordenação.** Esta tarefa só começa com a resposta da consulta Mapbox registrada (TASK-F04-1). Variante padrão = recálculo local com `routingInput` (desenho atual). Se (c) for negado, a variante B troca o recálculo local por `POST /v1/inspector/day-plans/:date/order/preview` (servidor, `etaSource 'MATRIX'`, 30/min, debounce de 400 ms no cliente) e a estimativa é revista antes de começar.
- **L-F04-13 · Pins no mesmo ponto.** Duas paradas com coordenadas idênticas (ou a < 10 m) recebem offsets pelo `applyCollisionOffsets` (`setOffset`) e `aria-label` distintos; o trecho entre elas não tem linha (o servidor não manda feature).
- **L-F04-07 · Origem `LAST_STOP` no mapa.** Com `origin.source 'LAST_STOP'` não há marcador `origin` separado: o pin `done` da última executada já marca o início do restante (evita dois pins no mesmo lugar).

### Testes primeiro (TDD)

**1. Libs puras**
- `features/day-plan/lib/__tests__/reorder-draft.test.ts` (novo; sobre `buildDayPlan` da fixture com matriz conhecida):

| Caso | Entrada | Esperado |
|---|---|---|
| reordenáveis (ao vivo) | X DONE, Y `IN_PROGRESS`, A, B, C `NOT_STARTED` | `reorderableIds = [A,B,C]` (só `executionStatus 'NOT_STARTED'`, ordem de `sequence`), `lockedIds = [X,Y]` |
| bloqueio local | check-in feito neste aparelho em A (estado local da F03 `IN_PROGRESS`, servidor ainda não respondeu) | A sai de `reorderableIds` na hora; o rascunho é descartado se A já tinha sido movida |
| `legTravelS` sem mudança | ordem igual à salva | todos os trechos vêm de `legTravelS`; `finishS` local = `finishEta` do servidor (± 0 s) |
| `legTravelS` misto | salva [A,B,C], nova [A,C,B] | origem→A usa `legTravelS`; A→C, C→B usam `routingInput.travelS`; o array `legTravelS` passado ao `evaluateSequence` é `[leg(origem→A), null, null]` |
| par inalterado deslocado | salva [A,B,C,D], nova [C,D,A,B] | C→D e A→B (adjacentes e na mesma direção na ordem salva) usam `legTravelS`; os demais, a matriz |
| `earliestDeparture` hoje | agora 07:05, início do plano 06:50 | `earliestDepartureS` = 07:05; agora 06:30 → 06:50 |
| `earliestDeparture` amanhã | data ≠ hoje | valor do `routingInput` (sem `agora`) |
| alinhar sugerida | `suggestedOrder [B,A,C,Z]` (Z já executado) | `alignOrder` → `[B,A,C]`; parada reordenável ausente da sugestão vai para o fim na ordem atual |
| mover | `moveItem([A,B,C], 0, 2)` | `[B,C,A]` |
| setas | `moveUp([A,B,C], B)` → `[B,A,C]`; `moveDown(..., C)` → sem mudança | |
| avaliar | ordem nova e sugerida | `evaluateSequence` chamado com `toOptimizerInput(plan)` + `legTravelS` de `buildLegOverrides(plan, order)` (o mesmo critério para as duas ordens); `deltaFinishMin = round((finishS(nova) − finishS(sugerida)) / 60)` |
| delta texto | +720 s / −300 s / 0 | "+12 min vs. suggested" / "−5 min vs. suggested" / "Same finish time as suggested" |
| deslocamento | `totalTravelS` | "55 min driving" |
| violação | ordem que atrasa B 15 min (janela 10:00–12:00) | `violations [{key:B, lateS:900}]`; texto "Stop 2 would arrive after its window 10:00 am – 12:00 pm" (número = posição **na nova ordem**, contando o prefixo) |
| sem matriz | `routingInput null` | `canReorder false`, motivo "Reordering needs at least two stops with a location." |
| 1 reordenável | – | `canReorder false` (sem controles) |
| ordem inválida | ids que não batem | captura `RouteOrderMismatchError` → `invalid true` (UI pede reload) |
| ETA local | parada B na nova ordem | `serviceStartS` convertido para ISO e formatado com "~" ("~9:12 am") |

- `src/lib/map/__tests__/markers.test.ts` (movido de `features/offers/lib/offers-map/__tests__` + casos novos): `makeNumberedMarkerEl({ label: '3', variant: 'stop' | 'done' | 'origin' | 'group', ariaLabel })` → `<button>` com `aria-label`, estilo inline **sem** `transform` (assert `el.style.transform === ''`), cores via `hsl(var(--primary))` (CSS, não paint); `applyCollisionOffsets` usa só `setOffset`.
- `src/lib/map/__tests__/colors.test.ts` (movido de `useOfferRoute.test.ts`): `hslTripletToMapboxColor('221 83% 53%')` → `hsl(221, 83%, 53%)`; vazio → `#2563EB`.
- `src/lib/map/__tests__/useGeoJsonLineLayer.test.ts` (novo; mapa fake): adiciona fonte e **duas** camadas (sólida com `filter ['!=', ['get','approximate'], true]` e tracejada `line-dasharray [0.5, 2]` com `filter ['==', ['get','approximate'], true]`) uma vez; `line-color` = string com vírgulas (`/^hsl\(\d+, \d+%, \d+%\)$/` ou `#2563EB`); `setData` a cada mudança; `null` → FeatureCollection vazia; mapa novo após retry → readiciona.
- `src/lib/map/__tests__/useMapCamera.test.ts` (novo, generalizado): recebe `points: Array<{lat,lng}>`; 0 pontos → `AU_CENTRE`; 1 → `flyTo` zoom 15; vários → `fitBounds` com `maxZoom 15` e `padding` 48; após gesto do usuário não refaz; `refit()` força.

**2. Ofertas sem regressão**
- `features/offers/components/__tests__/OffersMapView.test.tsx`, `features/offers/hooks/__tests__/useOfferRoute.test.ts` (ajustados para os imports de `@/lib/map`): mesmos asserts de hoje (pins de grupo, drill-down, linha tracejada na ordem, chip, erro/retry). Nenhuma mudança visível nas ofertas.

**3. Mapa do roteiro**
- `features/day-plan/components/__tests__/RouteMapView.test.tsx` (novo; `mapbox-gl` mockado como nos testes de ofertas):

| Caso | Dados | Esperado |
|---|---|---|
| pins | 3 paradas com coords | 3 marcadores com rótulos "1","2","3" na ordem de `sequence`; `aria-label="Stop 1, 12 King St, ETA 8:00 am"` |
| origem | `origin.source 'BASE'` com lat/lng | marcador `origin` com `aria-label="Start: Redfern NSW 2016"` |
| sem origem | `source 'NONE'` | sem marcador de origem |
| executada | parada DONE | variante `done` (cinza, ✓) |
| sem coordenada | `missingCoordinates true` | sem pin; aviso "1 stop isn't on the map: location not found" |
| linha | `geometry` com 2 features (1 aproximada) | `setData` com o FeatureCollection recebido; camadas sólida e tracejada |
| sem geometria | `geometry null` | só pins; sem fonte de linha com dados |
| rascunho | ordem local alterada (dirty) | pins renumerados pela ordem local; linha **escondida** (`setData` vazio) + chip "Save to update the route line" |
| pins idênticos (L-F04-13) | paradas 2 e 3 com a mesma lat/lng | `applyCollisionOffsets` chamado; os 2 marcadores com `setOffset` diferentes (nenhum `style.transform`); `aria-label` "Stop 2, …" e "Stop 3, …" distintos; `geometry` sem feature `2→3` → nenhuma linha entre eles |
| origem `LAST_STOP` (L-F04-07) | `origin.source 'LAST_STOP'`, parada 1 DONE | nenhum marcador `origin`; parada 1 com variante `done` |
| câmera | carga inicial | `fitBounds` em pins + origem |
| tocar pin | clique no pin 2 | chip com endereço, "ETA 9:01 am", janela e botão "Open details" → `/schedule/<id>` |
| sem token | `env.mapboxToken ''` | "Map is temporarily unavailable." e a lista segue acessível |
| erro | evento `error` | "Map failed to load. Check your connection." + "Retry" |
| offline | `useIsOnline false` sem tiles | mesmo erro do mapbox; a aba List continua funcionando |
| paint | qualquer | nenhum `line-color` com espaço entre os componentes do HSL |
| marcador | qualquer | nenhum `style.transform` escrito pelo nosso código |

- `features/day-plan/pages/__tests__/RoutePage.test.tsx` (alterado): `Segmented` "List" / "Map" (`role="tablist"`/`tab`), padrão List; a escolha fica em `?view=map` (replace) para sobreviver ao voltar; o chunk do mapa só carrega ao escolher Map (`React.lazy`, mock de import).

**4. Reordenação**
- `features/day-plan/components/__tests__/ReorderableStopList.test.tsx` (novo):

| Caso | Ação | Esperado |
|---|---|---|
| controles | plano com [X executada] + [A,B,C] | X sem alça nem setas ("Done"); A,B,C com alça ("Drag to reorder stop 2") e setas ("Move stop 2 up", "Move stop 2 down") |
| limites | – | "up" de A desabilitado (não passa acima do prefixo); "down" de C desabilitado |
| seta | "Move stop 3 down" em B | ordem local [A,C,B]; foco **continua** no botão "down" de B (agora stop 4) ou, se desabilitado, no "up" |
| anúncio | seta | `aria-live="polite"`: "Stop moved to position 4 of 4. Finish ~10:47 am, +12 min vs. suggested." |
| arrastar (teclado dnd-kit) | foco na alça, Space, ArrowDown, Space | mesma reordenação; anúncios em inglês ("Picked up stop 2…", "Stop 2 was moved to position 3…", "Stop 2 was dropped at position 3…") |
| arrastar (ponteiro) | `PointerSensor` simulado na alça | reordena; arrastar fora da alça não inicia (scroll livre) |
| cancelar arraste | Escape durante o arraste | ordem inalterada |
| ETAs locais | após mover | ETAs com "~"; legs recalculados pela matriz ("~8 min drive"); distância omitida (a matriz só guarda tempo) |
| delta | após mover | `RouteSummary` mostra "Finish ~10:47 am · +12 min vs. suggested · 55 min driving" |
| violação | ordem que atrasa | aviso no item ("Would arrive after its window 10:00 am – 12:00 pm", tom `warning`) + alerta-resumo "Stop 4 would arrive after its window 10:00 am – 12:00 pm"; **Save continua habilitado** |
| sem reordenação | `routingInput null` | sem alças/setas; texto "Reordering needs at least two stops with a location." |
| data passada | – | sem controles |
| offline | `useIsOnline false` | controles ativos (cálculo local); Save desabilitado com "Connect to save your order." |
| reduced motion | `prefers-reduced-motion` | `DragOverlay`/`dropAnimation` desligados (`null`) e sem transição de `transform` nos itens |

- `features/day-plan/components/__tests__/ReorderSaveBar.test.tsx` (novo):

| Caso | Ação / resposta | Esperado |
|---|---|---|
| aparece | dirty | barra fixa acima da barra inferior: "Save order" (primário) e "Discard"; resumo do delta |
| salvar | 200 | PUT `/v1/inspector/day-plans/2026-11-05/order` com `{ appointmentIds: [A,C,B], basedOnVersion: 3 }` (só reordenáveis); `setQueryData` com a resposta; rascunho limpo; snackbar "Route saved. Finish 10:49 am." |
| salvar com violação | 200 com `violations` | snackbar de aviso "Route saved. 1 stop arrives after its window."; avisos persistem (vindos da resposta) |
| duplo toque | 2 cliques | 1 PUT (`disabled` + `aria-busy`) |
| conflito | 409 `DAY_PLAN_VERSION_CONFLICT` | invalida e refaz o GET; rascunho descartado; alerta "Your route was updated. Review it before saving your order." |
| STALE | 409 `DAY_PLAN_STALE` | igual (mesma mensagem do contrato da Parte B) |
| mismatch | 422 `DAY_PLAN_ORDER_MISMATCH` | refaz o GET; alerta "Your stops changed. Review the route and try again." |
| passado | 422 `DAY_PLAN_DATE_IN_PAST` | refaz o GET; tela vira somente leitura |
| rede | erro de rede | rascunho mantido; "Couldn't save. Check your connection and try again." |
| 429 | – | mantém rascunho; "Too many changes in a short time. Try again in a minute." |
| descartar | "Discard" | volta à ordem do servidor sem chamada |
| sair com rascunho | navegar para outra rota | `useUnsavedChangesPrompt`: "You have unsaved changes to your route. Leave anyway?" |

- `features/day-plan/hooks/__tests__/useReorderDraft.test.ts` (novo):

| Caso | Pré | Esperado |
|---|---|---|
| nova versão sem rascunho | refetch traz v4 | adota v4 silenciosamente |
| nova versão com rascunho | dirty em v3, refetch traz v4 | rascunho **congelado**: alerta "Your route was updated. Review it before saving your order." + botão "Review" (descarta e mostra v4); Save desabilitado |
| conjunto mudou | CANT_DO tirou B, refetch v4 | rascunho descartado na hora; alerta "A stop was removed from your route. Your changes were discarded." |
| STALE enquanto edita | refetch devolve `status 'STALE'` | Save desabilitado com "Updating your route…" até a versão nova chegar |
| reset local | dirty → "Reset to suggested order" | ordem = `alignOrder(suggestedOrder)`, sem API |
| reset salvo | `manualOrder true`, sem rascunho | diálogo "Reset to the suggested order? Your saved order will be replaced." → `POST …/recalculate` → `setQueryData`; snackbar "Route reset to the suggested order." |
| reset erro | 404/422 | mensagem do servidor; GET refeito |

**Checklist de QA manual** (iOS Simulator instalado, Android/Chrome instalado, iPad; backend local/staging com Mapbox real e com o stub):
- [ ] M1: Route → Map: pins 1..N, pin de início, traçado seguindo as ruas; trechos aproximados tracejados (com o stub).
- [ ] M2: tocar no pin → chip → "Open details" abre o detalhe.
- [ ] M3: sem base: sem pin de início; com origem do dia: pin no endereço novo.
- [ ] M4: zoom/arrasto no mapa → nada pula; marcadores não "saltam" para o canto (lição do `style.transform`); cores da linha corretas no claro e no escuro.
- [ ] R1: arrastar a parada 3 para cima da 2 → ETAs com "~", "+N min vs. suggested" e, se for o caso, aviso de janela; Save → horários finais, linha nova no mapa.
- [ ] R2: setas subir/descer fazem o mesmo; VoiceOver anuncia a nova posição e o término.
- [ ] R3: ordem que estoura janela → aviso "Stop n would arrive after its window …"; salvar funciona (só avisa).
- [ ] R4: dois aparelhos: salvar no A, salvar no B sem recarregar → B mostra "Your route was updated…" e recarrega.
- [ ] R5: OP recalcula (web) enquanto o inspetor edita → alerta "Your route was updated…" ao voltar o foco.
- [ ] R6: "Can't do this job" em outra parada durante a edição → rascunho descartado com o aviso.
- [ ] R7: "Reset to suggested order" (com e sem ordem salva).
- [ ] R8: modo avião: reordenar funciona localmente; Save desabilitado; voltar a rede → Save.
- [ ] R9: plano com 10+ paradas (staging): arrastar com rolagem automática; números de 2 dígitos legíveis.
- [ ] R10: iPad landscape: Route no painel, Map preenche o painel; barra de salvar não cobre o último item; iPhone: barra acima da home indicator.
- [ ] R11: "Reduzir movimento" → arrastar sem animação.

### Escopo / Passos
- [ ] **1. Generalizar o mapa em `src/lib/map/` (parte do 01.4).**
  - Novo (via `git mv` + generalização): `src/lib/map/useMapboxInstance.ts` (sem mudança de API), `src/lib/map/useMapCamera.ts` (recebe `points` em vez de `offers`; `computeCenter(points)`), `src/lib/map/markers.ts` (`makeNumberedMarkerEl` com variantes; `makeMarkerEl`/`makeAppointmentMarkerEl` viram chamadas dele), `src/lib/map/colors.ts` (`hslTripletToMapboxColor`, `resolvePrimaryColor`), `src/lib/map/useGeoJsonLineLayer.ts`, `src/lib/map/MapStatusOverlay.tsx` (erro/retry e "no pins" extraídos do `MapOverlays`), `src/lib/map/index.ts`; mover `src/lib/map-bounds.ts` → `src/lib/map/bounds.ts` (+ testes movidos).
  - Modify: `src/features/offers/hooks/{useOfferPins,useOfferRoute}.ts` (usam `@/lib/map`), `src/features/offers/components/{OffersMapView,MapOverlays}.tsx`, `src/features/offers/lib/offers-map/types.ts`; remover `features/offers/hooks/{useMapboxInstance,useMapCamera}.ts` e `features/offers/lib/offers-map/markers.ts` (movidos). `apps/pwa/CLAUDE.md` (o mapa deixa de viver só em `features/offers`).
- [ ] **2. Mapa do roteiro (01.4).**
  - Novo: `src/features/day-plan/components/RouteMapView.tsx` (lazy), `src/features/day-plan/hooks/useRoutePins.ts`, `src/features/day-plan/components/RouteMapChip.tsx` (+ testes).
  - Modify: `src/features/day-plan/pages/RoutePage.tsx` (`Segmented` List/Map, `?view=`).
- [ ] **3. Reordenação: UI (01.3).**
  - `apps/pwa/package.json` + `pnpm-lock.yaml`: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/modifiers@9.0.0`, `@dnd-kit/utilities@3.2.2` (versões exatas, todas com mais de 2 semanas).
  - Novo: `src/features/day-plan/components/{ReorderableStopList,SortableStopRow,ReorderControls}.tsx` (+ testes).
- [ ] **4. Reordenação: rascunho e recálculo local (01.3).**
  - Novo: `src/features/day-plan/lib/reorder-draft.ts` (`reorderableIds` derivado ao vivo de `executionStatus` + estado local de execução da F03, `alignOrder`, `moveItem`, `moveUp`, `moveDown`, `buildLegOverrides(plan, order)` que usa `legTravelS` para pares adjacentes inalterados e `null` para usar a matriz, `resolveEarliestDeparture(plan, now)` que para hoje dá `max(agora, início do plano)`, `evaluateDraft`, `formatDelta`, `toViolationMessages`), `src/features/day-plan/hooks/useReorderDraft.ts` (+ testes).
- [ ] **5. Salvar, conflito, reset e saída (01.3).**
  - Novo: `src/features/day-plan/hooks/{useSaveDayPlanOrder,useResetDayPlanOrder}.ts`, `src/features/day-plan/components/ReorderSaveBar.tsx` (+ testes).
  - Modify: `src/features/day-plan/components/RouteSummary.tsx` (delta e totais locais), `RouteStopList.tsx` (vira o wrapper que escolhe lista estática ou reordenável).
- [ ] **6. QA manual** M1–M4 e R1–R11.

**Dias por passo:** 1 = 0,5; 2 = 0,75; QA do mapa (M1–M4) = 0,25 → 01.4 = **1,5**. 3 = 0,75; 4 = 0,5 (com `legTravelS`/`earliestDeparture`: são 2 funções puras sobre a opção que o `evaluateSequence` já tem, sem delta); 5 = 0,25; QA da reordenação (R1–R11) + medição do bundle = 0,25 → 01.3 = **1,75**. **Total 3,25.** **Condicional:** +0,25 se a medição exigir o subpath export (passo 7). Arquivos estimados: ~55 (os `git mv` contam como renome).
- [ ] **7. Bundle (dentro do QA; condicional).** Medir conforme a Verificação. Se passar do limite: em `packages/shared`, entrada nova do `tsup` `src/route-planning/index.ts` + `exports["./route-planning"]` (`import`/`require`/`types`), e o PWA passa a importar `evaluateSequence`/`toOptimizerInput` de `@properfy/shared/route-planning`. Nesse caso o `toOptimizerInput` também precisa sair pelo subpath, sem puxar o `day-plan.ts` com zod. **+0,25**, registrado no PR.

### UI e fluxos

**A. Alternância List / Map** (`RoutePage`)
- `Segmented` abaixo do `RouteSummary`/`OriginRow`: "List" e "Map", `role="tablist"`. Estado em `?view=list|map` (replace). O rascunho de ordem é do `RoutePage` e vale para as duas abas.
- Map é `React.lazy` (o `mapbox-gl` só baixa quando o inspetor abre a aba).

**B. Mapa (`RouteMapView`)**
- Altura: preenche o painel (`h-[calc(100dvh-…)]` no telefone, descontando `TopBar`, `Segmented` e `nav-clear`; no largo, o resto do painel com `fillHeight`).
- Pins (`makeNumberedMarkerEl`): parada `stop` (branco com anel e número em `hsl(var(--primary))`, 36 px), `done` (cinza, "✓"), em andamento (`primary` cheio), `origin` (ícone de casa, rótulo "Start"). `aria-label` "Stop {n}, {address}, ETA {hh:mm}" / "Start: {label}". Colisão por `applyCollisionOffsets` (`setOffset`, nunca `style.transform`).
- Linha (`useGeoJsonLineLayer`, fonte `day-plan-route`): `geometry` do plano; sólida para trechos reais, tracejada para `properties.approximate`; `line-color = resolvePrimaryColor()` (HSL com vírgula), largura 4, opacidade 0,9. Embaixo dos pins (camada de canvas).
- Câmera (`useMapCamera`): enquadra pins + origem na carga e ao salvar; respeita o gesto do usuário; botão "Fit route" (ícone) no canto refaz o enquadramento.
- Chip ao tocar no pin (`RouteMapChip`): "Stop {n} · ETA {hh:mm}", endereço, janela, "Open details" → `/schedule/{id}`; fechar com X ou tocando no mapa.
- Rascunho: pins com a numeração local; linha vazia + chip fixo "Save to update the route line".
- Estados: sem token → "Map is temporarily unavailable."; erro → "Map failed to load. Check your connection." + "Retry"; nenhum pin plotável → "None of today's stops have a location on the map."; paradas sem coordenada → nota "{k} stop(s) aren't on the map: location not found".
- Acessibilidade: o mapa é complementar; toda a informação existe na aba List. O container tem `aria-label="Route map"`; os pins são `<button>` focáveis.

**C. Lista reordenável** (`ReorderableStopList`, só com `canReorder` e data ≥ hoje)
- Paradas não reordenáveis (qualquer `executionStatus` diferente de `NOT_STARTED`: DONE, "In progress"), **derivadas ao vivo** (DB11), ficam fixas no topo, sem alça nem setas.
- Cada parada reordenável (`SortableStopRow`): alça de arraste à esquerda (ícone `GripVertical`, botão 44×44, `touch-action: none` só nela, `aria-label="Drag to reorder stop {n}"`), conteúdo do `StopCard variant="row"`, setas à direita ("Move stop {n} up"/"down", 44×44, desabilitadas nos limites).
- `@dnd-kit`: `DndContext` com `PointerSensor` (`activationConstraint: { delay: 150, tolerance: 5 }` para não roubar a rolagem) e `KeyboardSensor` (`sortableKeyboardCoordinates`); `SortableContext` com `verticalListSortingStrategy`; modificadores `restrictToVerticalAxis` e `restrictToParentElement`; `autoScroll` ligado; `accessibility.announcements` e `screenReaderInstructions` em inglês: "To pick up a stop, press space or enter. Use the arrow keys to move it. Press space or enter again to drop it, or escape to cancel."
- Durante a edição: ETAs e trechos vêm da avaliação local, com "~" e sem distância (a matriz guarda só tempo); avisos de janela por item; resumo com o delta.
- Texto de ajuda acima da lista: "Drag or use the arrows to reorder. Times update as you go." (adaptado do v3).

**D. Resumo durante a edição** (`RouteSummary`)
- "Finish ~{hh:mm} · {+N min vs. suggested} · {drive} driving". Fora da edição, com `manualOrder true`, o mesmo delta aparece calculado sobre a ordem salva (para o inspetor saber o custo da escolha) e o link "Reset to suggested order".
- Alerta-resumo de violações (tom `warning`, `role="status"`): uma linha por violação "Stop {n} would arrive after its window {janela}". Nunca bloqueia (DB3).

**E. Barra de salvar** (`ReorderSaveBar`)
- Aparece só com rascunho; `sticky` no fim do painel, acima de `pb-nav-clear` (telefone) e dentro do painel (largo); fundo `card`, borda superior.
- Conteúdo: delta curto ("+12 min vs. suggested"), "Discard" e "Save order". Salvando: "Saving…", `aria-busy`. Offline: "Save order" desabilitado + "Connect to save your order.". Congelado (versão nova/STALE): desabilitado + o alerta correspondente.
- Saída com rascunho: `useUnsavedChangesPrompt(isDirty, 'You have unsaved changes to your route. Leave anyway?')`.

**Fluxo de dados**

| Ação | Chamada | Cache | Observação |
|---|---|---|---|
| Ver mapa | nenhuma nova (usa o `GET` do plano) | `['inspector','day-plan', date]` | traçado = `plan.geometry` |
| Reordenar | nenhuma (local) | estado do `useReorderDraft` (`order`, `baseVersion`) | `evaluateSequence({ ...toOptimizerInput(plan), earliestDepartureS: resolveEarliestDeparture(plan, now) }, order, { legTravelS: buildLegOverrides(plan, order) })` memoizado por `(plan.version, order, minuto atual)` |
| Salvar | `PUT …/:date/order` | `setQueryData` com a resposta | sem `Idempotency-Key` (o servidor trata replay da mesma ordem) |
| Reset (salvo) | `POST …/:date/recalculate` | `setQueryData` | 6/min no servidor |
| Conflito/STALE/mismatch | `invalidateQueries(byDate)` | refetch | rascunho descartado |
| Foco/refetch durante edição | `GET` (padrão 30 s/foco) | nova versão congela o rascunho | regra do `useReorderDraft` |

### Casos de borda
1. **0 ou 1 parada reordenável:** sem controles; mapa normal.
2. **Sem base:** sem pin de origem e sem trecho inicial; a avaliação local usa `originIndex null` (a 1ª parada começa na janela).
3. **Paradas sem coordenada:** ficam na lista e podem ser reordenadas (consomem tempo, D7 da Parte A); não aparecem no mapa.
4. **Mais de 9 paradas** (`matrixProfile 'driving'`, otimizador heurístico no servidor): nada muda no cliente; `evaluateSequence` é O(n); `autoScroll` do dnd-kit para listas longas; limite do PUT = 25 ids (contrato); acima disso o servidor responde 400 e o app mostra "Couldn't save…" (não acontece com a carga real de 3–4).
5. **Conflito de versão:** 409 → recarrega e avisa; nunca sobrescreve a versão nova.
6. **STALE durante a edição:** congela o Save até a versão nova; o recálculo do servidor pode mudar o conjunto (rascunho descartado).
7. **"Can't do this job" no meio do dia:** a parada sai, o conjunto muda, rascunho descartado com aviso.
8. **Check-in durante a edição (reescrito em 2026-10-28, DB11):** o conjunto reordenável é **derivado ao vivo** (só `NOT_STARTED`). (a) Check-in feito **neste aparelho**, online ou na fila offline da F03: o estado local de execução já marca a parada `IN_PROGRESS`, então ela sai das reordenáveis na hora, vai para o bloco fixo do topo, e o rascunho é descartado com "A stop was removed from your route. Your changes were discarded." se ela tinha sido movida (senão o rascunho segue sem ela). (b) Check-in em **outro aparelho** ou registrado pela OP: a próxima versão do GET já não traz a parada como `NOT_STARTED` → conjunto mudou → rascunho descartado com o mesmo aviso. (c) Se o Save sair antes de o cliente saber, o servidor (que deriva o conjunto ao vivo) responde 422 `DAY_PLAN_ORDER_MISMATCH` → recarrega e avisa. Nunca se envia uma parada iniciada.
9. **Virada do dia com rascunho:** a data do `RoutePage` de hoje muda; o prompt de saída não cobre troca de key; o rascunho é descartado com o plano antigo (aceito; registrado nos Riscos).
10. **Fusos:** ETAs locais (`serviceStartS` epoch) formatados no `stop.timezone`.
11. **Aproximado:** delta local usa a matriz aproximada; a faixa "Approximate route…" continua.
12. **Plano depois do expurgo** (`routingInput null`, `geometry null`): sem reordenar e só pins.
12b. **Duas paradas no mesmo imóvel (L-F04-13):** pins com offset de colisão; trecho de 0 min sem linha; a lista segue a regra da TASK-F04-3 ("Same address").
12c. **Origem `LAST_STOP` (L-F04-07):** sem pin de origem; o recálculo local parte do ponto `origin` do `routingInput` (imóvel da última executada).
13. **iOS:** arraste por toque com `delay 150` não conflita com o scroll; alça com `touch-action: none`; barra de salvar acima da home indicator.
14. **Layout largo:** mapa e lista no painel de detalhe do `TodayLayout`; o master (Tela do Dia) continua visível.

### Fora do escopo
- Navegação dentro do app, trânsito em tempo real, multi-dia, realocação entre inspetores, mover janelas (fora do escopo do plano).
- Mapa na Tela do Dia ou na agenda; mapa no web (F05).
- Ordem manual na agenda (`useScheduleDay` continua por horário).
- Pedir a matriz ou o Directions pelo PWA (DB6).

### Critérios de aceite
1. **01.A1 (exibição, parte mapa):** o mapa mostra pins na sequência do plano, a origem e o traçado real do Directions; trechos aproximados tracejados.
2. **01.A2:** reordenar (arrastar ou setas) recalcula na hora, sem API, e mostra a diferença no término ("+N min vs. suggested") e no deslocamento; salvar grava `manual` e devolve os horários finais.
3. **DB3:** estouro de janela mostra "Stop n would arrive after its window …" e nunca bloqueia salvar.
4. Conflito de versão, STALE e mismatch recarregam o plano e avisam, sem perder dados de outra origem.
5. Ofertas sem regressão (testes de ofertas verdes com os imports novos); nenhum `style.transform` em marcador; paint só com HSL de vírgula.
6. `pnpm --filter @properfy/shared build && pnpm --filter pwa lint typecheck test build && pnpm --filter pwa check:ds` verdes; QA M1–M4 e R1–R11 marcado.

### Dependências
- TASK-F04-3 mergeada (Route, dados, fixture, `StopCard`).
- TASK-F04-2 em produção (`PUT /order`, `POST /recalculate`, `routingInput`, `geometry`); TASK-F04-1 (`evaluateSequence`, `toOptimizerInput` no shared).
- Ordem revisada em 2026-10-28: **F04-3 → F04-4 → F04-3b**. Esta tarefa bloqueia a TASK-F04-3b, porque o passo do tour sobre reordenar precisa da reordenação existente.
- Contrato corrigido da TASK-F04-2 (`legTravelS` no GET, conjunto reordenável ao vivo, `earliestDeparture`) mergeado e api-types regenerados.

### Riscos e armadilhas
- **Generalização dos hooks do mapa (0,5):** é a parte mais arriscada; mover sem mudar comportamento e manter os testes de ofertas idênticos. Se a generalização do `useMapCamera` crescer, manter um wrapper fino em `features/offers` em vez de forçar uma API única.
- **`style.transform` no marcador** (lição do mapa de ofertas): o dnd-kit também usa `transform` — só nos itens da **lista**, nunca nos marcadores do mapa.
- **HSL com espaço no paint** quebra o mapa inteiro (#1302): todo `paint` passa por `hslTripletToMapboxColor`.
- **ETA local ≠ ETA final:** a matriz não tem `depart_at` e o Directions sim; o "~" e a substituição pela resposta do PUT deixam isso claro.
- **dnd-kit e rolagem no iOS:** `PointerSensor` com `delay` e `touch-action` só na alça; testar no aparelho (R1, R9).
- **`unstable_usePrompt`:** API instável do React Router 6; já usada no projeto. Não cobre troca de key do mesmo componente (caso 9).
- **Cache do bundle:** o `mapbox-gl` continua fora do chunk principal (lazy); conferir o tamanho do chunk da Route no build.
- **Bundle do shared sem `sideEffects: false`:** o barrel único pode arrastar código que o PWA não usa. Medir (Verificação) antes de decidir pelo subpath export, sem refatorar às cegas.
- **`legTravelS` × matriz:** misturar Directions (com `depart_at`) e Matrix (sem) num mesmo cálculo dá ETAs "~" levemente inconsistentes. O delta "vs. suggested" compara as duas ordens com o mesmo critério, e os horários finais vêm do PUT.
- **Fixture com matriz:** o `routingInput` da fixture precisa ser coerente (quadrada, inteiros) ou o `evaluateSequence` lança; `dayPlanResponseSchema.parse` no teste da fixture.

### Deploy / rollout / rollback
1. Sem migration e sem env nova (usa o `VITE_MAPBOX_TOKEN` público já existente das ofertas; os tokens já são separados por ambiente).
2. Sai depois da F04-3; o rollout é o autoUpdate do SW.
3. **Rollback:** reverter o PR. A Route volta a ser só lista (F04-3); ordens já salvas continuam no servidor e aparecem na lista (a ordem é do plano, não do cliente). As ofertas voltam aos hooks antigos no mesmo revert.

### Dias · Branch · Verificação
- **Dias:** 3,25 (01.4 1,5 + 01.3 1,75). L-F04-13 e L-F04-07 (casos de mapa, 2026-10-29) cabem no 01.4. **Condicional (L-F04-03):** se a variante B (preview no servidor) for imposta pela Mapbox, reestimar antes de começar (troca do recálculo local por chamada com debounce; ordem de grandeza −0,25 no cliente, +0,5 no backend da TASK-F04-2).
- **Branch:** `feat/f04-pwa-route-map-reorder` a partir de `develop`, depois da TASK-F04-3 (e antes da TASK-F04-3b).
- **Verificação:** `pnpm install` (lock com `@dnd-kit/*`) → `pnpm --filter @properfy/shared build && pnpm --filter pwa lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && pnpm --filter pwa check:ds`; `grep -rn "style.transform" apps/pwa/src/lib/map apps/pwa/src/features/day-plan` sem ocorrências fora de comentários; QA M1–M4, R1–R11; ≤ 150 arquivos.
- **Checagem de bundle (obrigatória):**
  1. `pnpm --filter pwa build` no `develop` (com F04-1/2/3 já mergeadas) e na branch; anotar no PR os tamanhos gzip que o Vite imprime para o chunk de entrada (`index-*.js`), o chunk lazy da Route/Reorder e o total de `dist/assets/*.js`.
  2. Localizar o código do `route-planning`: `grep -l "ROUTE_ORDER_MISMATCH" apps/pwa/dist/assets/*.js` mostra em que chunk(s) ele caiu.
  3. **Limite:** o chunk de entrada cresce no máximo **+5 kB gzip**, e o `route-planning` não pode aparecer no chunk de entrada (deve ficar no chunk lazy da Route). Se passar de qualquer um, aplicar o passo 7 (subpath `@properfy/shared/route-planning`, +0,25) e medir de novo. Se mesmo assim passar, o PR para e a decisão volta para o revisor. Não pendurar a reordenação num chunk eager.

---

## Achados para revisão (Parte B)

**Fechados em 2026-10-28:** a fatia de backend do `onboarding_completed_at` passou para a TASK-F04-2; o cache offline do plano foi reduzido a uma rota mínima, apagada no logout (regra do `apps/pwa/CLAUDE.md`); a renomeação `/profile` → `/more` foi retirada (a aba More aponta para as rotas existentes); o "Reset to suggested" foi mantido; o E2E do tour depende do X03.

Em aberto:

1. **X03 bloqueia a TASK-F04-3b.** O 00.A1 só fecha com E2E. Se o diagnóstico do X03 achar um bug de bootstrap (e não de harness), o X03 é reestimado e a 3b atrasa junto. **Atualizado em 2026-10-29 (reconciliação X03):** X03 com 3,0 dias; o job `test-pwa-e2e` bloqueia o deploy desde o merge (não é advisory) e roda com `failOnFlakyTests`; as specs do tour rodam só nos 2 projetos de telefone (12 execuções).
2. **Caminho do mapa no plano.** O plano cita `lib/offers-map/markers.ts:60`, mas o caminho real é `apps/pwa/src/features/offers/lib/offers-map/markers.ts`. A TASK-F04-4 move esse arquivo e os hooks para `src/lib/map/`.
3. **More sem Challenges nem "Help and support".** Challenges é da F08 (03.10/03.15) e entra como `ProfileTile` "Challenges" logo depois de Earnings na grade de 2 colunas do hub de More, sem grupo novo, quando ela chegar (reconciliação F08 L-F08-09, 2026-10-29). "Help and support" (design v3) não está no plano e não é construído.
4. **Avisos de roteiro para datas além de amanhã.** O `ROUTE_CHANGED` de um dia futuro (D+2 ou mais) abre `/today`, que só mostra hoje e amanhã. Decidir se a allowlist deve aceitar `/today/route/:date`. A F04-3 não faz isso para seguir o contrato da F02, que pede só `/today`.
5. **Retorno pós-check-out.** O `DonePanel`/`ExecutionPage` continua indo para `/schedule`, mas o design v3 mostra "Back to Today" com a próxima inspeção. Isso não está no plano, então não muda. Decidir se o destino passa a ser `/today`, que é uma mudança de uma linha.
6. **Bundle do `route-planning`.** O `packages/shared` não tem `"sideEffects": false` e exporta só o barrel. A TASK-F04-4 mede o bundle e, se passar do limite (+5 kB gzip na entrada ou `route-planning` no chunk de entrada), cria o subpath `@properfy/shared/route-planning` com **+0,25** condicional. Esse valor não está no total de 9,25.
7. **Offline do plano (corrigido em 2026-10-28).** A regra do `apps/pwa/CLAUDE.md` prevalece: a TASK-F04-3 tem um cache mínimo `api-day-plan-cache` (NetworkFirst, 3 entradas, 12 h, só 200), apagado no logout. Ele guarda contato do inquilino no aparelho por até 12 h; aceito pelo mesmo critério do `api-schedule-cache`.
8. **Itens do design v3 não construídos na Tela do Dia:** "maintenance item", "Tenant prefers afternoon" (o `DayPlanStop` não tem nota do inquilino), "Forgot? We'll prompt you to check in", "Send tenant an 'on the way' text" e fotos/chave. Todos estão fora do escopo informado. A linha "Online, synced" vira "Online/Offline · n waiting to sync", com base na fila da F03.
9. **Dependência nova `@dnd-kit/*`** (4 pacotes, decidida em Q19) só na TASK-F04-4. O tour não adiciona dependência.
10. **Detalhe aberto pela Tela do Dia ativa a aba Schedule.** O detalhe vive em `/schedule/:id` (01.5: "abre o detalhe existente"), e o voltar retorna à Tela do Dia. Aceito, sem rota duplicada.

---

## Ajustes necessários em outras tarefas (para reconciliar)

- (resolvido 2026-10-29) `tarefas/F05-tarefas.md` · mostrar `feasible false` do plano como **indicador** "Route infeasible" na linha do inspetor (badge + tooltip com as paradas; `routeFeasible`/`routeViolations`), não como alerta: F05 D20 mantém 7 tipos e o 01.A5; a F04 não notifica a OP · L-F04-05.
- (resolvido 2026-10-29) `tarefas/F01-tarefas.md` · troca de base só marca `STALE` (`BASE_CHANGED`), sem aviso à OP (L-F04-05); o pedido de "aviso à OP" foi removido da F01 · L-F01-03.
- (resolvido 2026-10-29) `tarefas/X00-tarefas.md` · N13 ganha a exceção "Inspector day plans (DayPlan) use the inspector's timezone"; D14 / L-F04-02 confirmados (data civil, 19:30 e janela de publicação no fuso do inspetor) · L-X00-03.
- `tarefas/F05-tarefas.md` · consumir `classifyStops(stops: ClassifiableStop[])` de `modules/day-plan/domain/classify-stops.ts` e `computeDayPlanFingerprint(input: FingerprintInput)` de `modules/day-plan/domain/day-plan-fingerprint.ts` (tipos planos, sem Prisma; a origem da impressão é a configurada, nunca `LAST_STOP`); remover o passo "extrair no próprio PR" dos Riscos · L-F04-16, L-F04-07.
- `tarefas/F05-tarefas.md` · toda leitura de `day_plan_stops` re-une com `a.status IN ('SCHEDULED','DONE')` além de `inspector_id`/`deleted_at` · L-F04-04.
- `tarefas/F05-tarefas.md` · tratar `origin.source 'LAST_STOP'` (sem pin de origem separado; início = última executada) e manter o polling de `GET /v1/day-plans/:inspectorId/:date` abaixo de 120/min por usuário (folha 20/min) · L-F04-07, L-F04-14.
- `tarefas/F06-tarefas.md` · gravar no `payload_json` da notificação ao inquilino `serviceStartAt`, `planVersion` e `approximate` da leitura fresca, porque a F04 não guarda histórico de versões do plano · L-F04-15.
- `README.md` (tabela de features e totais) · F04 passa de 23,75 para **25,75** dias (Parte A 16,5; Parte B 9,25) · L-F04-01..16 (25,5) + 0,25 da reconciliação de 2026-10-29 (`BASE_CHANGED` da F01).
- (encaminhado: `F04-plano-do-dia-roteiro.md` atualizado em 2026-10-29 com a consulta e as regras novas; `decisoes.md` pendente) `decisoes.md` / `F04-plano-do-dia-roteiro.md` · registrar a consulta Mapbox (dono, prazo = início da TASK-F04-2, plano B) e, depois, a resposta; registrar as regras novas (STALE sem roteamento, `published_at` manda, `LAST_STOP`, `ROUTE_CHANGED` agregado, contato principal, folha com 30 dias, sem histórico de versões) · L-F04-03, L-F04-01/02/06/07/08/10/15.
- `apps/backend` `.env.example` e documentação de deploy (fora de `tarefas/`, entregue pela TASK-F04-1) · nova env `DAY_PLAN_ROUTING_PROVIDER=mapbox|stub` como kill switch do provedor · L-F04-09.
