# F07 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | F07 · Índice de confiabilidade (contrato 03.4, 03.5, 03.11, 03.12, efeito do 03.3; critério **03.A1**) |
| **Total** | **8,625 dias** (plano 6,5 + 2,25 das lacunas de 2026-10-29, L-F07-01..12 − 0,125 da reconciliação de 2026-10-29: o evento `platform_setting.updated.v1` passou a ser da F03, L-F03-10; distribuição abaixo) |
| **Tarefas / PRs** | 3: backend + shared de métricas → backend de snapshot, job e API → web. O plano previa 2 PRs (backend; web). O backend foi dividido em dois para ficar revisável (4,5 dias num PR só). Os dias não mudam (aceito pelo dev em 2026-10-28). |
| **Depende de** | **F03** (TASK-F03-1: `PlatformSetting`, `IPlatformSettingsReader`, flags da execução, `resolveEffectiveEventTime`; TASK-F03-2: `InspectorFieldEvent` `CANT_DO`/`LATE_NOTICE`, `abandoned_at`, reinício de execução; TASK-F03-4: página "Platform settings"); **F04** (TASK-F04-1: `ServiceType.default_duration_minutes`; TASK-F04-2: `DayPlan`/`DayPlanStop` com `travel_s`, `duration_minutes`, `published_service_start_at`); **X01** (grupo "Dashboard" do menu lateral). |
| **Bloqueia** | F08 (níveis, metas por métrica do índice, ranking anônimo do app) |
| **Código verificado em** | `origin/develop` @ `042a9674` (snapshot read-only, 2026-10-27). O que F03, F04 e X01 entregam é tratado como existente, porque são mergeadas antes (Onda 5). |
| **Decisões** | Do plano: **2026-10-27** (`F07-indice-confiabilidade.md`, `decisoes.md` Q18). Do dev: **2026-10-28** (P1–P11 abaixo: aviso antecipado pela ETA publicada, referência de volume pela mediana, demais premissas aceitas). Lacunas: **2026-10-29** (L-F07-01..12, todas as recomendações aceitas; seção "Decisões das lacunas" abaixo). Reconciliação: **2026-10-29** (R1–R5, pedidos de F03, F08, X00 e X01; seção "Decisões da reconciliação" abaixo). |

**Distribuição do plano (6,5) + lacunas (2,25) − reconciliação (0,125) pelas 3 tarefas.** Sem item cortado e sem folga embutida.

| Item | Dias | TASK-F07-1 | TASK-F07-2 | TASK-F07-3 |
|---|---|---|---|---|
| 03.4a snapshot + job diário | 1,0 | – | 1,0 | – |
| 03.4b 8 métricas | 2,0 | 2,0 | – | – |
| 03.5 normalização | 0,5 | 0,5 | – | – |
| 03.A1 pesos no `PlatformSetting` + recálculo | 1,0 | 0,25 (chave + fórmula) | 0,5 (evento, recálculo serializado) | 0,25 (seção "Reliability index") |
| 03.11 / 03.12 página | 2,0 | – | 0,5 (API ranking/detalhe) | 1,5 (página, drawer) |
| **Subtotal do plano** | **6,5** | **2,75** | **2,0** | **1,75** |
| L-F07-01 `INSPECTOR_NO_SHOW` + `CANT_ATTEND` antecipado | 0,25 | 0,25 (enum, guarda por transição, Q7, regra da métrica 1) | – | (dialog junto com L-F07-04) |
| L-F07-02 job falho: log, `ensure-today` horário, `isStale` | 0,375 | – | 0,25 | 0,125 (banners, junto com L-F07-10) |
| L-F07-03 `minimumRatings` | 0,25 | 0,125 | – | 0,125 |
| L-F07-04 `NOT_EXECUTED` | 0,25 | 0,125 | – | 0,125 (dialog com os 2 códigos novos) |
| L-F07-05 pro-rata do volume por `created_at` | 0,125 | 0,125 | – | – |
| L-F07-06 `failures` + drawer | 0,5 | 0,25 | – | 0,25 |
| L-F07-07 rejeição tardia na métrica 8 | 0,125 | 0,125 | – | – |
| L-F07-08 contratos F07 ↔ F08 | 0 | – | – | – |
| L-F07-09 override escalado pelo período | 0,125 | 0,125 | – | – |
| L-F07-10 `settingsUpdatedAt` + `recompute_overdue` | 0,125 | – | 0,125 | (banner contado em L-F07-02) |
| L-F07-11 link "Configure weights" AM/OP | 0 | – | – | – |
| L-F07-12 retenção 400 dias + expurgo de apagado | 0,125 | – | 0,125 | – |
| R1 evento `platform_setting.updated.v1` emitido pela F03 (L-F03-10): sai o gancho no use case da F03 | −0,125 | – | −0,125 | – |
| R2–R5 (`position` da plataforma, fuso por campo, ordem do menu e testes sem mocks, `backTo`) | 0 | – | – | – |
| **Total** | **8,625** | **3,875** | **2,375** | **2,375** |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F07-1 | Backend + shared: chaves das 8 métricas, chave `reliabilityIndex` no `PlatformSetting` (com `minimumRatings`), códigos `INSPECTOR_NO_SHOW`/`NOT_EXECUTED`, leitor de fatos (SQL em uma passada), `computeMetric` para qualquer período, normalização por duração + deslocamento planejado, pro-rata de volume, lista de falhas por métrica, fórmula do score, índices de apoio | 3,875 | F03-1, F03-2, F04-1, F04-2 |
| TASK-F07-2 | Backend + shared: `InspectorReliabilitySnapshot`, job diário `reliability.compute-snapshots` (04:15 Sydney) + `reliability.ensure-today` horário, backfill no deploy, recálculo ao salvar os pesos (assinando `platform_setting.updated.v1` da F03, serializado por advisory lock), retenção de 400 dias, API AM/OP de ranking e detalhe (com `isStale`/`settingsUpdatedAt`) | 2,375 | TASK-F07-1 |
| TASK-F07-3 | Web: página "Inspector performance" (ranking, bloco "Not enough data", banners de desatualizado/recálculo pendente, drawer das 8 métricas com falhas), item no grupo Dashboard, seção "Reliability index" em "Platform settings", códigos novos no `StatusTransitionDialog` | 2,375 | TASK-F07-2; X01; F03-4 |

## Decisões que valem para as 3 tarefas

**Do plano e do dev (2026-10-27):**

- **D1 · 8 métricas com pesos configuráveis.** Pontualidade, geofence, conclusão sem travar, satisfação, atraso avisado com antecedência, "não consigo fazer" por motivo do inspetor (`CANT_ATTEND`), volume atendido e DONE → REJECTED. A **métrica 7** é o volume concluído ÷ referência, limitado a 100%. Ela substitui "aceites ÷ ofertas". A referência deixou de ser fixa (60): é a **mediana** do volume DONE dos inspetores ativos na mesma janela (P11, 2026-10-28).
- **D2 · Janela móvel de 30 dias, recalculada todo dia.** A F08 mantém o período próprio de cada meta.
- **D3 · Volume mínimo de 10 serviços** na janela (configurável). Abaixo disso o score é `null`, o inspetor aparece como **"Not enough data"** e fica fora do ranking.
- **D4 · Visibilidade (Q18).** Só AM/OP. Agências nunca veem índice nem ranking. INSP não recebe nada na F07; o app do inspetor (próprio índice e ranking anônimo) é da F08, que lê o snapshot pela porta exportada.
- **D5 · Navegação.** Item **"Inspector performance"** no grupo **Dashboard** do menu (X01). Tela nova; os dashboards existentes (`DashboardPage`, `AnalyticsPage`, `InspectorWorkloadPage`, `prisma-dashboard-analytics.repository.ts`, `prisma-inspector-workload.repository.ts`) **não** são alterados.
- **D6 · `computeMetric(metric, inspector, from, to)` funciona para qualquer período.** A F07 usa a janela de 30 dias; a F08 reusa a mesma função no período de cada meta.
- **D7 · Pesos no `PlatformSetting`.** Salvar recalcula o snapshot do dia de todos os inspetores (03.A1). A alteração é auditada (`platform_setting.updated`, da F03).
- **D8 · Normalização (03.5).** O peso de cada serviço é a duração do tipo (F04) mais o deslocamento planejado (F04). Sem modelo de "dificuldade do imóvel".
- **D9 · Sem `tenant_id` no snapshot.** O inspetor é cross-tenant (precedentes: `Inspector`, `ServiceRegion` global, `DayPlan`, `PlatformSetting`). **Cada spec registra a exceção ao §7.1 do CLAUDE.md.** O isolamento vem do RBAC: CL_ADMIN, CL_USER, INSP e TNT recebem 403 antes de qualquer leitura.
- **D10 · No-show (risco do plano).** "Não iniciou" só conta como falha de pontualidade quando o appointment terminou DONE ou foi rejeitado por motivo do inspetor (`CANT_ATTEND` do próprio inspetor, ou `INSPECTOR_NO_SHOW` escolhido pela OP/AM — L1, 2026-10-29).
- **D11 · Fuso.** As janelas são horário de parede da agência (`tenants.timezone`).
- **D12 · Contratos da F03 (reuso exato).** Execução com `abandoned_at` **não** conta como iniciada nem como concluída. A execução reiniciada (D13 da F03) vale para o **novo** inspetor, com as flags gravadas no reinício. Privacidade (F03 D10): nada de lat/lng do inspetor no snapshot, nos logs ou na API; só flags, distâncias e precisões.

**Decisões do dev (2026-10-28).** P1–P10 eram premissas desta quebra e foram **aceitas** pelo dev, com P4 reescrita; P11 é nova.

- **P1 · Universo de serviços.** Um "serviço" é **uma ocorrência de DONE** atribuída ao inspetor daquele DONE, ou um `CANT_ATTEND`.
  - Cada DONE é atribuído ao inspetor do appointment **no momento da transição para DONE** (revisão de 2026-10-28), nunca ao dono da linha de execução.
  - Tipos: `EXECUTED` (o DONE tem execução finalizada e não abandonada **do mesmo inspetor**), `DONE_WITHOUT_EXECUTION` (DONE sem execução própria: marcado pela OP, ou bloqueado pela execução de outro inspetor) e `CANT_ATTEND` (o inspetor largou o serviço com o motivo `CANT_ATTEND`).
  - Um DONE que depois foi rejeitado (DONE → REJECTED) continua sendo serviço do inspetor daquele DONE, e a penalidade da métrica 8 é dele **quando o código é `NOT_EXECUTED`** (L4, 2026-10-29); com outro código, aquele DONE sai do universo.
  - **4º tipo (L1, 2026-10-29):** `NO_SHOW_REJECTED` — `SCHEDULED → REJECTED` com `INSPECTOR_NO_SHOW`, atribuído ao `releasedInspectorId` da transição.
  -  Rejeições pelo inquilino (T-1, `TENANT_DECLINED`), cancelamentos e os outros motivos de "não consigo fazer" (`NO_ANSWER`, `KEY_FAILED`, `TENANT_REFUSED`, `UNSAFE`, `SITE_ISSUE`) ficam **fora**: não são culpa do inspetor.
- **P2 · Data do serviço.** É a data civil, no fuso da agência, de `inspection_executions.finished_at` (`EXECUTED`), de `appointments.scheduled_date` (`DONE_WITHOUT_EXECUTION` e `NO_SHOW_REJECTED`) ou de `inspector_field_events.created_at` (`CANT_ATTEND`). A F08 usa esta mesma regra (contrato exportado item 1; L-F07-08, 2026-10-29). Exceção só da métrica 8: rejeição `NOT_EXECUTED` tardia entra pela data da rejeição (L7).
- **P3 · Métrica 3 derivada da duração.** "Travou" = `finished_at − started_at > 6 h` (`STUCK_THRESHOLD_HOURS`, o mesmo do alerta). A tabela de notificações não é lida.
- **P4 · Aviso com antecedência (dev, 2026-10-28).** Um atraso foi avisado com antecedência quando existe um `LATE_NOTICE` do mesmo inspetor para o appointment cujo **horário efetivo** é **estritamente anterior** à **ETA publicada** da parada no plano do dia (F04 `day_plan_stops.published_eta`). Sem parada no plano ou sem `published_eta`, o limite é o **início da janela** (`windowStartAt`).
  - **Horário efetivo** = `resolveEffectiveEventTime(client_occurred_at, created_at).effectiveAt` da F03: o horário do cliente quando plausível (até **7 dias** antes e 5 min depois do servidor, F03 D25; reconciliação R1, 2026-10-29); senão o `created_at`.
  - Isso fecha a dúvida "`created_at` × horário do cliente" do contrato da F03: o `created_at` só vale como fallback dentro dessa função.
  - Igual ao limite **não** conta (aviso às 10:50 com ETA 10:50 não é antecipado).
  - **2026-10-29 (dev):** a regra de antecedência acima fica **inalterada** pela nova referência do "Vou atrasar N min" (F03 D23 revisada: `estimatedArrivalAt = max(published_service_start_at ou início da janela, effectiveNoticeAt) + minutesLate`). O `estimatedArrivalAt` não entra na P4.
- **P5 · Métrica sem dados.** Uma métrica sem denominador (sem pesquisa, sem atraso, sem execução) fica `null` e sai do score; os pesos são renormalizados entre as métricas com dados.
- **P6 · Geofence com precisão ruim.** Um trecho (check-in ou check-out) fora do raio, com precisão informada **maior** que o raio, é inconclusivo e não penaliza.
- **P7 · Fator de deslocamento = 1.** Peso do serviço = `duration_minutes + 1 × travel_minutes`. Constante `RELIABILITY_TRAVEL_FACTOR = 1` (não configurável).
- **P8 · Janela = 30 dias civis completos até ontem.** O snapshot do dia D cobre `[D−30, D−1]`. Hoje fica fora porque ainda está aberto; assim qualquer recálculo no dia D produz a mesma janela.
- **P9 · Arredondamento.** Taxas guardadas com 4 casas; score de 0 a 100 com **1 casa**, arredondado half-up a partir das taxas não arredondadas.
- **P10 · 3 PRs** em vez de 2 (backend dividido em dois; aceito pelo dev).
- **P11 · Referência de volume pela mediana (dev, 2026-10-28).**
  - A referência da métrica 7 é a **mediana** do `completedCount` (DONE na janela) dos **inspetores ativos**, onde ativo = pelo menos **1 DONE** na mesma janela (independe de `inspectors.status`).
  - Com número par de inspetores, é a média dos dois do meio (pode ter 0,5).
  - Piso: `volumeReference = max(1, mediana)`; sem nenhum inspetor ativo, a referência é 1.
  - `rate = min(1, completedCount / volumeReference)`.
  - A mediana é calculada **uma vez por execução do snapshot** e é a mesma para todos os inspetores daquele dia. Com isso, ela também é recalculada todo dia.
  - O valor fixo 60 sai do sistema. O valor de onboarding vira **opcional**: `volumeReferenceOverride` (nulo por padrão); quando preenchido, substitui a mediana.
- **Aceitos sem mudança (dev, 2026-10-28):**
  - renormalização dos pesos (P5);
  - geofence com precisão ruim não penaliza (P6);
  - fator de deslocamento fixo em 1 (P7);
  - janela até ontem (P8);
  - métrica 3 pela duração (P3);
  - atribuição pela execução, pelo evento de campo ou pelo `releasedInspectorId` (P1);
  - backend em 2 PRs (P10).

**Decisões das lacunas (dev, 2026-10-29).** Todas as recomendações de `lacunas/F07-lacunas.md` aceitas. Detalhe e testes em cada tarefa.

- **L1 · No-show sem reporte (L-F07-01, opção 1).** Código novo `RejectionReasonCode.INSPECTOR_NO_SHOW` ("Inspector didn't attend"), só OP/AM e só em `SCHEDULED → REJECTED`; vira a 4ª origem do universo (`NO_SHOW_REJECTED`), atribuída ao `releasedInspectorId`, data = `scheduled_date`, conta nas métricas 1 (`NO_SHOW`) e 6 (falta). `CANT_ATTEND` dado com `effectiveNoticeAt < windowStartAt − 24 h` (`CANT_ATTEND_EARLY_NOTICE_HOURS = 24`) sai da métrica 1 e continua na 6.
- **L2 · Job que falha (L-F07-02, opção 1).** `logger.error('reliability.snapshots_failed', …)` em qualquer falha; job `reliability.ensure-today` de hora em hora das 05:00 às 12:00 Sydney; API devolve `isStale`; página e drawer mostram o aviso; contrato com a F08 diz que `snapshotDate` pode ser anterior a hoje. Limiar do `dlq-monitor` não muda.
- **L3 · Mínimo de pesquisas (L-F07-03, opção 1).** `reliabilityIndex.minimumRatings` (1–50, default 3); abaixo dele `SATISFACTION` fica `null` (renormaliza, P5).
- **L4 · Penalidade de `DONE → REJECTED` (L-F07-04, opção 1).** Código novo `RejectionReasonCode.NOT_EXECUTED` ("Inspection was not actually carried out"), só em `DONE → REJECTED`. A métrica 8 penaliza **só** esse código; `DONE → REJECTED` com outro código tira aquele DONE do universo (não conta para ninguém).
- **L5 · Pro-rata do volume (L-F07-05, opção 1).** `activeDays` pelo `inspectors.created_at`; licença/pausa fica como limitação documentada.
- **L6 · Explicabilidade (L-F07-06, opção 1).** `failures` (até 20) por métrica no resultado, drawer lista as falhas com link para o appointment, tooltip com minutos ponderados.
- **L7 · Rejeição tardia (L-F07-07, opção 1).** `DONE → REJECTED` com `NOT_EXECUTED` registrado depois de `serviceDate + 30` entra pela data da rejeição, só na métrica 8.
- **L8 · Contratos F07 ↔ F08 (L-F07-08, sem decisão).** Texto do contrato exportado corrigido (data do serviço = P2; `snapshotDate` pode ser antigo; sem `getUncached`).
- **L9 · Override por período (L-F07-09, opção 1).** `override × periodDays / 30`, arredondado a 0,5, piso 1.
- **L10 · Recálculo pendente visível (L-F07-10, sem decisão).** API devolve `settingsUpdatedAt`; banner enquanto `settingsUpdatedAt > computedAt`; log `reliability.recompute_overdue` após 15 min.
- **L11 · Quem configura pesos (L-F07-11, sem decisão).** Segue a F03: AM e OP veem "Configure weights" e editam a seção.
- **L12 · Retenção (L-F07-12, opção 1).** `RELIABILITY_SNAPSHOT_RETENTION_DAYS = 400`, expurgo no job diário, e expurgo das linhas de inspetor apagado.

**Decisões da reconciliação (2026-10-29).** Pedidos de outras tarefas aplicados aqui; detalhe em cada tarefa.

- **R1 · Contratos da F03 (L-F03-10, L-F03-05, L-F03-06; pedido de `F03-tarefas.md`).**
  - O `UpdatePlatformSettingUseCase` da F03 **já emite** `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'` após o commit (F03 D29), payload `{ key, before, after, actorId, occurredAt }`. A F07 **só assina** o evento; não altera `update-platform-setting.use-case.ts` nem declara a constante (TASK-F07-2).
  - `geofence_radius_m IS NULL` significa **exclusivamente** "execução anterior à F03": todo `start` pós-F03 grava o raio, inclusive sem coordenadas do imóvel, com fallback e no reinício (F03 D24). Nenhuma outra leitura do nulo.
  - `resolveEffectiveEventTime(clientOccurredAt, serverNow)` devolve `{ effectiveAt, clientTimePlausible }` com janela de plausibilidade **−7 dias / +5 min** (F03 D25). A F07 usa `effectiveAt`.
  - Check-in sincronizado tarde com horário do cliente implausível já chega com `out_of_window = false` (audit `inspection.started` com `windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'`). A F07 usa a flag como gravada (`PUNCTUAL`) e não reavalia a janela: "nunca penalizar sem evidência" (F03 D25).
  - `estimatedArrivalAt` (F03 D23) existe no `LATE_NOTICE`, mas a métrica 5 continua pela P4 (horário efetivo do aviso × ETA publicada); ele não entra no cálculo.
- **R2 · `position` é da plataforma inteira (L-F08-07; pedido de `F08-tarefas.md`).** `position` em `getCurrentIndexes` e nas rotas é o ranking de competição entre **todos** os inspetores ACTIVE com `SCORED` no snapshot, sem recorte por região, tipo de serviço ou agência. A F08 depende disso no ranking anônimo do app (03.A3); mudar exige acordo com a F08.
- **R3 · Fuso por campo (N13, L-X00-03; pedido de `X00-tarefas.md`).** Ver a tabela "Fuso de cada campo de data" abaixo.
- **R4 · Menu e testes (L-X01-02, L-X01-03; pedido de `X01-tarefas.md`).** "Inspector performance" entra **depois de Workload e antes de Goals & rewards (F08)**, conforme a ordem canônica do X01. Os testes de menu ficam no `Sidebar.roles.test.tsx` real (sem mocks de `SidebarSubmenu`/`SidebarItem`, `MemoryRouter` + `initialEntries`) e verificam por rótulo, nunca por índice ou contagem (TASK-F07-3).
- **R5 · `backTo` (L-X01-08; pedido de `X01-tarefas.md`).** A F07 **não cria sub tela com `backTo`**: a página é filho de primeiro nível do grupo Dashboard e o detalhe é um drawer (`?inspector=`), não rota. A regra de fallback por papel e o teste P-b não se aplicam. Se uma sub tela for acrescentada, o `backTo` aponta para `/inspector-performance` (mesmos papéis AM/OP), overrides usam `onBack(goBack)` e o P-b roda com OP.
- **R6 · Plausibilidade do horário do cliente (dev, 2026-10-29).** Vale a **F03 D25**: horário do cliente aceito de **−7 dias a +5 min** do horário do servidor. Toda menção a "até 24 h antes" (P4, `resolveEffectiveEventTime`) foi substituída por referência à F03 D25. A janela de 24 h do `CANT_ATTEND_EARLY_NOTICE_HOURS` (L-F07-01) é outra regra e não muda.
- **R7 · Referência do "Vou atrasar N min" (dev, 2026-10-29).** A F03 D23 passou a contar os minutos a partir de `published_service_start_at` da parada publicada (sem plano publicado, do início da janela). A P4 continua igual (horário efetivo do aviso × `published_eta`, fallback no início da janela).

**Fuso de cada campo de data (N13, R3).** Datas civis e janelas no fuso da **agência**; instantes em UTC; jobs de plataforma em `PLATFORM_TIMEZONE`; `users.timezone` só exibição. Conversões só pelos helpers (`zonedWallTimeToUtc`, `civilDateInTz`/`civilDateInTimezone`, `formatCivilDate`, `formatInstantDateTime`).

| Campo | Tipo | Fuso |
|---|---|---|
| `serviceDate` (P2), `rejectedOn` (L7), `from`/`to` de `computeMetric`/`computeAll` | data civil | agência (`tenants.timezone`) do appointment |
| `windowStartAt`/`windowEndAt` (slot), `publishedEtaAt`, `publishedServiceStartAt`, `effectiveStartAt`, `effectiveNoticeAt`, `cantAttendNoticeAt` | instante UTC | janela montada no fuso da agência (`zonedWallTimeToUtc`) |
| `inspectorCreatedOn` (L5) | data civil | `PLATFORM_TIMEZONE` (inspetor é cross-tenant, sem agência) |
| `snapshot_date`, `window_from`/`window_to` (`snapshotWindow`), "hoje" do `isStale` e do expurgo de 400 dias | data civil | `PLATFORM_TIMEZONE` (job de plataforma) |
| crons `reliability.compute-snapshots` (04:15) e `reliability.ensure-today` (05:00–12:00) | horário | `PLATFORM_TIMEZONE` (`SYDNEY_TZ`) |
| `computed_at`, `settingsUpdatedAt` | instante UTC | – |
| Exibição na web (subtítulo, banners, falhas) | – | `snapshotDate`/`serviceDate` com `formatCivilDate` (sem conversão); instantes com `formatInstantDateTime` em `PLATFORM_TIMEZONE` (`users.timezone` não entra em cálculo) |

---

## TASK-F07-1 · Backend + shared: métricas, `computeMetric`, normalização e fórmula

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F03-1, TASK-F03-2, TASK-F04-1, TASK-F04-2
> - **Desbloqueia:** TASK-F07-2, TASK-F08-1
> - **Pode rodar em paralelo com:** TASK-F04-5, TASK-F04-3, TASK-F06-1, TASK-F05-1, TASK-F06-2, TASK-F04-4
> - **Pista sugerida (time de 6):** A + A2 · Backend crítico **em par** · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Definir no shared as chaves das 8 métricas (`ReliabilityMetricKey`), os rótulos em inglês e a chave **`reliabilityIndex`** no `PLATFORM_SETTINGS_REGISTRY` (pesos, volume mínimo, override opcional da referência de volume).
- Criar o módulo backend `reliability` com:
  - um **leitor de fatos** que monta, em **uma passada** (número fixo de consultas, independente do número de inspetores), todos os serviços do período;
  - funções puras que calculam cada métrica a partir dos fatos, com a normalização da 03.5;
  - a fórmula do score;
  - o serviço `ReliabilityMetricsService` com `computeMetric(metric, inspectorId, from, to)` (qualquer período) e `computeAll(from, to, inspectorIds?)` (todos os inspetores, usado pelo job da TASK-F07-2 e pela F08).
- Acrescentar o índice `inspection_executions(finished_at)`, que a consulta de execuções precisa. Em `audit_logs` não entra índice novo: `(action)` e `(entity_type, entity_id)` bastam (revisão de 2026-10-28).
- Acrescentar ao shared os códigos de rejeição `INSPECTOR_NO_SHOW` e `NOT_EXECUTED`, com a guarda por transição no backend (L-F07-01, L-F07-04; a opção no `StatusTransitionDialog` é da TASK-F07-3).

### Contexto no código
- **Satisfação:** `SatisfactionSurvey` (`apps/backend/prisma/schema.prisma:1160`): `appointment_id @unique`, `inspector_id`, `rating Int` (escala `RATING_MIN 1`..`RATING_MAX 5` em `packages/shared/src/lib/rating.ts`), `submitted_at`; índice `(inspector_id, tenant_id, submitted_at)`. Agregação existente em `apps/backend/src/modules/inspector/infrastructure/prisma-inspector-rating.reader.ts:25` (`getAggregatesByInspectorIds`: média crua, sem janela, conta DONE da plataforma). **Não é alterado**; a F07 lê as pesquisas pelos `appointment_id` do universo.
- **Relatório PERFORMANCE:** `getPerformanceRows` (`apps/backend/src/modules/report/infrastructure/prisma-report-data-reader.ts:58`) conta DONE/CANCELLED/REJECTED e a duração média em memória, por `findMany` com `include`. **Não é alterado nem reusado** (sem janela por `finished_at`, sem atribuição de REJECTED, N+1 de execuções). Fica como referência do "concluídos".
- **Execução:** `InspectionExecution` (`schema.prisma:1181`): `appointment_id @unique`, `inspector_id`, `started_at`, `finished_at?`, `resumed_at?` (gravado pelo `reopen-execution.use-case.ts`, que zera `finished_at` e mantém `started_at`), índices `(inspector_id)`, `(started_at)`. A F03 acrescenta `start_client_at`, `out_of_window`, `out_of_radius`, `finish_out_of_radius`, `geolocation_distance_meters` (já existe), `finish_geolocation_distance_meters`, `start_accuracy_m`, `finish_accuracy_m`, `geofence_radius_m` (snapshot do raio no check-in; **nulo só em execuções anteriores à F03**: todo `start` pós-F03 grava o raio, inclusive sem coordenadas do imóvel, com fallback e no reinício, F03 D24/R1) e `abandoned_at`. Check-in com horário do cliente implausível grava `out_of_window = false` e `windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'` no audit `inspection.started` (F03 D25).
- **Reject/cancel solta o inspetor:** o bloco 7c de `apps/backend/src/modules/appointment/application/use-cases/execute-status-transition.use-case.ts:335-340` faz `updateData.inspectorId = null` em **toda** transição para REJECTED ou CANCELLED (inclusive DONE → REJECTED e `INSPECTOR_UNABLE`). Por isso **`appointments.inspector_id` não serve para atribuir** um serviço rejeitado: a atribuição vem de `inspection_executions.inspector_id`, de `inspector_field_events.inspector_id` ou do `metadata.releasedInspectorId` do audit `appointment.status_transition` (`:481-485`).
- **Execução única por appointment:** `inspection_executions.appointment_id @unique`. O `start` devolve `ExecutionAlreadyFinishedError` quando já existe execução finalizada (`apps/backend/src/modules/inspector-execution/application/use-cases/start-inspection.use-case.ts:149-151`); o reinício da F03 só cobre execução **abandonada**. Depois de DONE → REJECTED → reoferta, o novo inspetor não consegue fazer check-in e o DONE seguinte vem da OP, com a execução antiga ainda pertencendo ao inspetor anterior. Por isso a execução **não** serve para atribuir o DONE.
- **Inspetor no momento do DONE:** o audit `appointment.status_transition` para DONE não traz inspetor (o `metadata.inspectorId` só é gravado em transições para SCHEDULED, `execute-status-transition.use-case.ts:445`). Duas fontes dão o inspetor do DONE sem ambiguidade:
  - o DONE **atual**: `appointments.inspector_id` (DONE não o altera; só REJECTED/CANCELLED o anulam);
  - um DONE **rejeitado depois**: `metadata_json.releasedInspectorId` do audit `appointment.status_transition` DONE → REJECTED (`:481-485`), que é o inspetor daquele DONE.
- **DONE → REJECTED:** audit `appointment.done_rejected` (`execute-status-transition.use-case.ts:560-571`, `entity_type 'Appointment'`, `entity_id = appointmentId`, **sem** inspetor no metadata) e evento `APPOINTMENT_EVENTS.DONE_REJECTED = 'appointment.done_rejected.v1'` (`apps/backend/src/shared/application/events/domain-event-bus.ts:82`). O audit é gravado depois do commit, fire-and-forget (`AuditService.log(): void`, `apps/backend/src/shared/domain/audit.ts:37`).
- **`audit_logs`** (`schema.prisma:850-880`): `action VarChar(200)`, `entity_type`, `entity_id`, `created_at`; índices `(entity_type, entity_id)`, `(action)` (`schema.prisma:874`), `(created_at)` separados. As linhas `appointment.done_rejected` são raras, então `(action)` serve para dirigir a consulta da métrica 8; as buscas por appointment usam `(entity_type, entity_id)`. **Sem índice novo em `audit_logs`.** Retenção: ações operacionais ficam 5 anos (`apps/backend/src/modules/audit/domain/audit-retention.ts:4-6`), o worker `audit.retention` (03:30) só move linhas bem mais antigas que 30 dias.
- **Alerta de 6 h:** `apps/backend/src/modules/inspector-execution/infrastructure/workers/notify-stuck.worker.ts:8` (`const STUCK_THRESHOLD_HOURS = 6`, não exportada), job `inspection-execution.notify-not-started` de hora em hora (`apps/backend/src/main/workers.ts:260`), template `INSPECTION_STUCK_ALERT`, uma notificação **por destinatário** OP/AM, cool-off de 24 h, só quando o appointment ainda está SCHEDULED, e nada quando não há OP/AM ativo. `findStuckExecutions` (`prisma-inspection-execution.repository.ts:85`; a F03 acrescenta `abandoned_at: null`).
- **Appointment** (`schema.prisma:536-625`): `scheduled_date @db.Date`, `time_slot_start/end VarChar(5)`, `status`, `rejection_reason_code`, `deleted_at`; índices `(inspector_id, status)` e `(scheduled_date, inspector_id)` (cross-tenant, sem `tenant_id` na frente).
- **Fuso:** `tenants.timezone VarChar(60) @default("Australia/Sydney")`; `PLATFORM_TIMEZONE = 'Australia/Sydney'` (`packages/shared/src/constants/timezone.ts:6`); `zonedWallTimeToUtc(dateStr, timeStr, tz)` (`packages/shared/src/utils/timezone-date.ts:43`, DST-safe); `civilDateInTz`, `addCivilDays` (`packages/shared/src/utils/local-date.ts:8,29`); backend `civilDateInTimezone` (`apps/backend/src/shared/domain/timezone-date.ts:144`).
- **F03 (existente):** `IPlatformSettingsReader.get(key)` (`apps/backend/src/shared/domain/platform-settings.ts`, cache de 30 s), `PLATFORM_SETTINGS_REGISTRY` (`packages/shared/src/schemas/platform-settings.ts`), `fieldEvents.checkInWindowToleranceMinutes` (padrão 15), `resolveEffectiveEventTime(clientOccurredAt, serverNow) → { effectiveAt, clientTimePlausible }` (`apps/backend/src/modules/inspector-execution/domain/client-occurred-at.ts`; janela −7 dias / +5 min, F03 D25), enums `InspectorFieldEventType`, `FieldIssueReason` (`CANT_ATTEND`) em `packages/shared/src/enums/field-events.ts`, tabela `inspector_field_events` com índices `(appointment_id, type, created_at desc)`, `(inspector_id, created_at)`, `(type, created_at)`.
- **F04 (existente):** `service_types.default_duration_minutes` (NOT NULL, 5–480); `day_plans(inspector_id, plan_date, …)` unique `(inspector_id, plan_date)`; `day_plan_stops(appointment_id, travel_s, duration_minutes, published_eta, published_service_start_at, …)` com índice `(appointment_id)`. `published_eta` é a chegada prevista **congelada na publicação** (recálculos copiam, nunca reescrevem; parada que entra depois recebe na 1ª gravação em que aparece). As linhas não são expurgadas (só traçado e matriz).
- **Consultas cruas:** precedente de `$queryRaw` com cast `::int` (memória `project_prisma_queryraw_int_params`); ids são `text` (Prisma `String @default(uuid())`), colunas de data/hora são `timestamp(3)` sem fuso guardando UTC.
- **Códigos de rejeição (L-F07-01, L-F07-04):** `RejectionReasonCode` (`packages/shared/src/enums/reason-codes.ts:17-32`) tem `INVALID_ADDRESS`, `PROPERTY_INACCESSIBLE`, `SAFETY_CONCERN`, `INSUFFICIENT_INFO`, `SERVICE_NOT_AVAILABLE`, `TENANT_NO_RESPONSE`, `TENANT_DECLINED`, `OTHER`; a F03 acrescenta `INSPECTOR_UNABLE` (+ `SYSTEM_ONLY_REJECTION_CODES`). Nenhum deles identifica culpa do inspetor escolhida pela OP nem "marcado DONE mas não executado". O body da transição valida com `z.nativeEnum(RejectionReasonCode)` (`packages/shared/src/schemas/appointment.ts:190`), sem restrição por status de origem. Rótulos em `packages/shared/src/utils/reason-code-label.ts`. `CancellationReasonCode.INSPECTOR_UNAVAILABLE` existe, mas cancelamento fica fora do universo (P1).
- **Inspetor:** `inspectors.created_at` (`schema.prisma:494`), usado no pro-rata do volume (L-F07-05). Não há histórico de mudança de `status`.

### Decisões aplicáveis
D1, D2, D3, D6, D7 (chave e fórmula), D8, D9, D10, D11, D12 (2026-10-27); P1–P9 e P11 (dev, 2026-10-28); R1, R3, R6 e R7 (reconciliação, 2026-10-29).

- **2026-10-29 · R1 (L-F03-05, L-F03-06):** `geofenceRadiusM null` ⇔ pré-F03 (nenhuma outra causa); `effectiveStartAt`/`effectiveNoticeAt`/`cantAttendNoticeAt` usam `.effectiveAt` (janela −7 dias / +5 min); execução com `out_of_window = false` por horário implausível é `PUNCTUAL` (a F07 não reavalia a janela com `started_at`). `estimatedArrivalAt` do `LATE_NOTICE` não é lido (P4 inalterada).
- **2026-10-29 · R3 (N13):** fuso de cada campo conforme a tabela "Fuso de cada campo de data".

**Lacunas (dev, 2026-10-29):**
- **2026-10-29 · L-F07-01 (L1):** `RejectionReasonCode.INSPECTOR_NO_SHOW` ("Inspector didn't attend"), aceito só em `SCHEDULED → REJECTED` e só de OP/AM (não SYS, não CL). Cada `status_transition` SCHEDULED → REJECTED com esse código gera um fato `NO_SHOW_REJECTED` para o `metadata.releasedInspectorId`, data de serviço = `scheduled_date`, peso igual ao de um `CANT_ATTEND`; entra no volume e nas métricas 1 (`NO_SHOW`) e 6 (falta). `CANT_ATTEND` com `effectiveNoticeAt < windowStartAt − CANT_ATTEND_EARLY_NOTICE_HOURS` (24 h) é **aviso antecipado**: `NOT_EVALUABLE` na métrica 1, continua falta na 6.
- **2026-10-29 · L-F07-03 (L3):** `reliabilityIndex.minimumRatings` (inteiro 1–50, default 3). `SATISFACTION` com `eligibleCount < minimumRatings` → `rate null`, `averageRating` mantido (para o drawer), sai do score (P5).
- **2026-10-29 · L-F07-04 (L4):** `RejectionReasonCode.NOT_EXECUTED` ("Inspection was not actually carried out"), aceito só em `DONE → REJECTED` (AM). A métrica 8 penaliza só os `done_rejected` cuja transição pareada tem `rejection_reason_code = 'NOT_EXECUTED'`. `DONE → REJECTED` com qualquer outro código remove aquele DONE do universo (não gera fato para ninguém).
- **2026-10-29 · L-F07-05 (L5):** `VOLUME` com pro-rata: `activeDays = min(periodDays, dias civis de max(from, created_at do inspetor em Sydney) até to, inclusivos)`; `rate = min(1, completedCount / (volumeReference × activeDays / periodDays))`. Licença/pausa não é tratada (sem dado no modelo).
- **2026-10-29 · L-F07-06 (L6):** cada resultado de métrica traz `failures` (até 20, mais recentes primeiro) com `appointmentId`, `serviceDate` e `detail` (≤ 80 caracteres, inglês, sem endereço nem coordenada).
- **2026-10-29 · L-F07-07 (L7):** fato `NOT_EXECUTED` cuja rejeição (`al.created_at` no fuso da agência) é posterior a `serviceDate + 30` dias entra no período que contém a **data da rejeição**, com `lateRejection = true`, e conta **só** na métrica 8 (fora do volume e das demais).
- **2026-10-29 · L-F07-08 (L8):** o contrato exportado diz que a data do serviço é a P2 desta feature (não só `finished_at`).
- **2026-10-29 · L-F07-09 (L9):** `computeVolumeReference(completedCounts, override, periodDays)`: com override, `value = max(1, roundToHalf(override × periodDays / RELIABILITY_WINDOW_DAYS))`; sem override nada muda.

### Testes primeiro (TDD)

Vitest; relógio injetado; a suíte do domínio roda também com `TZ=America/Los_Angeles` (memória `feedback_tz_dependent_test_must_pin_away`). Fixtures em `apps/backend/src/modules/reliability/domain/__fixtures__/service-facts.ts` com o builder `buildFact(overrides)`. Valores padrão do builder: `kind 'EXECUTED'`, `origin 'CURRENT_DONE'`, `doneRejected false`, `lateRejection false`, `durationMinutes 60`, `plannedTravelMinutes 0`, slot 09:00–11:00 em `Australia/Sydney`, check-in 09:30, check-out 10:30, flags falsas, `geofenceRadiusM 300`, distâncias 50 m, precisões 20 m, sem aviso, sem pesquisa, `cantAttendNoticeAt null`, inspetor criado antes do período (`inspectorCreatedOn '2026-01-01'`). Em todos os testes, um DONE → REJECTED sem código indicado usa `NOT_EXECUTED` (L-F07-04).

**1. Shared — `packages/shared/src/enums/reliability.test.ts`**
- `RELIABILITY_METRIC_KEYS` = `['PUNCTUALITY','GEOFENCE','NO_STUCK','SATISFACTION','LATE_NOTICE','CANT_ATTEND','VOLUME','DONE_REJECTED']` (exatamente 8, nesta ordem).
- `RELIABILITY_METRIC_LABELS` e `RELIABILITY_METRIC_DESCRIPTIONS` têm texto para as 8 chaves (tabela da seção UI da TASK-F07-3).
- `CANT_ATTEND_EARLY_NOTICE_HOURS === 24`; `RELIABILITY_FAILURES_MAX === 20` (L-F07-01, L-F07-06).

**1a. Shared — `packages/shared/src/enums/reason-codes.test.ts` (acréscimo; L-F07-01, L-F07-04)**

| Caso | Entrada | Esperado |
|---|---|---|
| códigos novos | `RejectionReasonCode.INSPECTOR_NO_SHOW`, `RejectionReasonCode.NOT_EXECUTED` | `'INSPECTOR_NO_SHOW'`, `'NOT_EXECUTED'`; contagem total = contagem anterior + 2 (com a F03: 11) |
| origem permitida | `allowedRejectionCodesFrom('SCHEDULED')` | contém `INSPECTOR_NO_SHOW`; não contém `NOT_EXECUTED` |
| origem permitida | `allowedRejectionCodesFrom('DONE')` | contém `NOT_EXECUTED`; não contém `INSPECTOR_NO_SHOW` |
| origem permitida | `allowedRejectionCodesFrom('DRAFT')` / `('AWAITING_INSPECTOR')` / `('REJECTED')` | nenhum dos dois |
| rótulos | `reasonCodeLabel('INSPECTOR_NO_SHOW')`, `reasonCodeLabel('NOT_EXECUTED')` | "Inspector didn't attend", "Inspection was not actually carried out" |

**1b. Aplicação — `execute-status-transition.use-case.test.ts` (acréscimo; L-F07-01, L-F07-04)**

| Caso | Entrada | Esperado |
|---|---|---|
| no-show válido | OP, `SCHEDULED → REJECTED`, `INSPECTOR_NO_SHOW`, reason "Inspector didn't show up" | ok; `metadata.releasedInspectorId` = inspetor anterior (comportamento atual do bloco 7c) e `metadata.rejectionReasonCode 'INSPECTOR_NO_SHOW'` (novo) |
| código no audit | qualquer transição para REJECTED com código | `metadata.rejectionReasonCode` = código enviado; sem código → chave ausente |
| no-show de outra origem | OP, `AWAITING_INSPECTOR → REJECTED` com `INSPECTOR_NO_SHOW` | 422 `REJECTION_CODE_NOT_ALLOWED` "This rejection reason can't be used from the current status" |
| no-show por CL / SYS | CL_ADMIN ou SYS, `SCHEDULED → REJECTED`, `INSPECTOR_NO_SHOW` | CL: 403 pela matriz existente (CL não rejeita SCHEDULED); SYS: 422 `REJECTION_CODE_NOT_ALLOWED` |
| não executado válido | AM, `DONE → REJECTED`, `NOT_EXECUTED` | ok; audit `appointment.done_rejected` como hoje |
| não executado de outra origem | OP, `SCHEDULED → REJECTED`, `NOT_EXECUTED` | 422 `REJECTION_CODE_NOT_ALLOWED` |

**2. Shared — `packages/shared/src/schemas/platform-settings.test.ts` (acréscimo)**

| Caso | Valor | Esperado |
|---|---|---|
| defaults | `PLATFORM_SETTINGS_REGISTRY.reliabilityIndex.defaults` | pesos todos `1`, `minimumVolume 10`, `volumeReferenceOverride null` (sem chave `volumeReference`), `minimumRatings 3` |
| `minimumRatings` (L-F07-03) | 0 / 51 / 2.5 / ausente | erro; 1 e 50 válidos |
| peso 0 numa métrica | `PUNCTUALITY: 0`, demais 1 | válido |
| todos os pesos 0 | 8 × 0 | erro "Set at least one weight above 0" em `weights` |
| peso 11 / −1 / 1.5 | | erro em `weights.PUNCTUALITY` |
| chave de peso faltando | sem `VOLUME` | erro |
| `minimumVolume` 0 / 201 / 2.5 | | erro; 1 e 200 válidos |
| `volumeReferenceOverride` 0 / 1001 / 2.5 | | erro; `null`, 1 e 1000 válidos |
| `resolvePlatformSettingValue('reliabilityIndex', null)` | | defaults |

**3. Domínio — `apps/backend/src/modules/reliability/domain/service-weight.test.ts`**
- `serviceWeightMinutes({ durationMinutes: 30, plannedTravelMinutes: 10 })` → `40`.
- sem plano (`plannedTravelMinutes: 0`) → igual à duração.
- `plannedTravelMinutes` com fração (`travel_s 90` → 1.5) → `31.5` (sem arredondar).

**4. Domínio — `punctuality.test.ts`** (`evaluatePunctuality(fact, { toleranceMinutes: 15 })` → `'PUNCTUAL' | 'EARLY' | 'LATE' | 'NO_SHOW' | 'NOT_EVALUABLE'`)

| Caso | Entrada | Esperado |
|---|---|---|
| dentro da janela | `outOfWindow false` | `PUNCTUAL` |
| fora, atrasado, sem previsão | `outOfWindow true`, início efetivo 11:20 | `LATE` |
| fora da janela mas dentro do previsto | slot 09:00–11:00; parada publicada **com estouro de janela** (F04 publica estouros, só avisa): `published_eta` 11:10, `published_service_start_at` 11:10, `late_s 600`; início 11:20, tolerância 15 | `PUNCTUAL` (11:20 ≤ 11:25). É o único caso em que o previsto resgata: ele só fica depois do fim da janela quando o plano já publicou o estouro |
| fora da janela e depois do previsto | mesma parada com estouro (previsto 11:10, `late_s 600`), início 11:26 | `LATE` |
| previsto dentro da janela | previsto 10:30 (sem estouro), início 11:20 | `LATE` (11:20 > 10:45; o previsto não resgata, e a janela já falhou) |
| adiantado | início 08:40 (`outOfWindow true`) | `EARLY` (a previsão nunca resgata adiantamento) |
| check-in no dia seguinte ao agendado | `outOfWindow true`, início D+1 09:30 | `LATE` |
| horário do cliente | `start_client_at` 11:05 (plausível), `started_at` 11:40, previsto 11:00 | usa 11:05 → `PUNCTUAL` |
| DONE sem execução | `kind 'DONE_WITHOUT_EXECUTION'` | `NO_SHOW` |
| largou com `CANT_ATTEND` | `kind 'CANT_ATTEND'`, aviso efetivo no próprio dia 08:00 (slot 09:00) | `NO_SHOW` |
| `CANT_ATTEND` com 23 h 59 de antecedência (L-F07-01) | aviso efetivo D−1 09:01, slot D 09:00 | `NO_SHOW` |
| `CANT_ATTEND` com exatamente 24 h | aviso efetivo D−1 09:00 | `NO_SHOW` (estritamente antes) |
| `CANT_ATTEND` antecipado | aviso efetivo D−1 08:59 ou 10 dias antes | `NOT_EVALUABLE` (fora da métrica 1) |
| no-show marcado pela OP (L-F07-01) | `kind 'NO_SHOW_REJECTED'` | `NO_SHOW` |
| execução anterior à F03 | `geofenceRadiusM null` | `NOT_EVALUABLE` |
| sincronização tardia implausível (R1, F03 D25) | `outOfWindow false` (gravado pela F03 com `windowSkipped`), `start_client_at` 10 dias antes, `started_at` 11:40, slot 09:00–11:00 | `PUNCTUAL` (usa a flag como gravada; não reavalia com `started_at`) |
| pós-F03 sem coordenadas do imóvel | `geofenceRadiusM 300`, distâncias nulas, `outOfWindow true`, início 11:20 | `LATE` (o raio gravado torna a execução avaliável; R1) |

**5. Domínio — `geofence.test.ts`** (`evaluateGeofence­Compliance(fact)` → `'PASS' | 'MISS' | 'EXCLUDED'`)

| Caso | Entrada | Esperado |
|---|---|---|
| dentro nos dois trechos | `outOfRadius false`, `finishOutOfRadius false` | `PASS` |
| check-in fora, precisão 40, raio 300 | | `MISS` |
| check-out fora, precisão nula (cliente antigo) | | `MISS` |
| check-in fora com precisão 450 > raio 300; check-out dentro | | `PASS` (trecho inconclusivo não penaliza) |
| check-in fora com precisão 450; sem check-out avaliado | `finish_geolocation_distance_meters null` | `EXCLUDED` |
| imóvel sem coordenadas | distâncias nulas | `EXCLUDED` |
| execução anterior à F03 | `geofenceRadiusM null` | `EXCLUDED` |
| `DONE_WITHOUT_EXECUTION` / `CANT_ATTEND` / `NO_SHOW_REJECTED` | | `EXCLUDED` |

**6. Domínio — `no-stuck.test.ts`**
- duração 5 h 59 → `OK`; exatamente 6 h → `OK`; 6 h 01 → `STUCK`.
- execução reaberta (`resumedAt` preenchido) → `EXCLUDED`.
- `DONE_WITHOUT_EXECUTION` / `CANT_ATTEND` / `NO_SHOW_REJECTED` → `EXCLUDED`.
- execução reiniciada (D13 da F03): `startedAt` = horário do reinício → duração medida a partir dele.

**7. Domínio — `late-notice.test.ts`**
- só entra no denominador um serviço `LATE` (teste 4); `PUNCTUAL`, `EARLY`, `NO_SHOW` e `NOT_EVALUABLE` ficam fora.
- `advanceNoticeDeadline(fact)` = `publishedEtaAt` quando existe, senão `windowStartAt`.
- **Com ETA publicada** 10:50, slot 09:00–11:00:
  - aviso efetivo 10:30 → `true` (depois do início da janela, mas antes da ETA);
  - 10:49 → `true`;
  - 10:50 em ponto → `false` (estritamente antes);
  - 10:55 → `false`.
- **Sem plano** (ou parada sem `published_eta`), slot 09:00:
  - aviso efetivo 08:30 → `true`;
  - 08:59 → `true`;
  - 09:00 em ponto → `false`;
  - 09:20 → `false`.
- parada com `published_eta` **nulo** porque entrou no plano já iniciada → usa o início da janela.
- horário efetivo (decisão P4):
  - `client_occurred_at` 10:40 e `created_at` 10:58, ETA 10:50 → usa 10:40 → `true`;
  - `client_occurred_at` ausente → usa `created_at`;
  - `client_occurred_at` 25 h antes do `created_at` → **plausível** (janela de 7 dias da F03, R1) → usa `client_occurred_at`;
  - `client_occurred_at` 7 dias e 1 min antes do `created_at` (implausível) → usa `created_at`;
  - `client_occurred_at` 6 min depois do `created_at` (implausível) → usa `created_at`.
- vários avisos → vale o de menor horário efetivo.
- aviso de **outro** inspetor no mesmo appointment (antes da reoferta) → ignorado.
- ETA de plano de **outro** inspetor ou de outra data → ignorada (cai no início da janela).

**8a. Domínio — `volume-reference.test.ts`** (`computeVolumeReference(completedCounts: number[], override: number | null, periodDays: number)` → `{ value, source: 'MEDIAN' | 'OVERRIDE', activeInspectors, periodDays }`; nos casos sem `periodDays` indicado, `periodDays 30`)

| Caso | Entrada | Esperado |
|---|---|---|
| população dos exemplos | `[12, 10, 9, 8, 10, 9]` (Ana, Ben, Carla, Dan, Eva, Fábio) | `{ value: 9.5, source: 'MEDIAN', activeInspectors: 6 }` |
| ímpar | `[3, 7, 5]` | `5` |
| inspetores com 0 DONE | `[0, 0, 4, 6]` | zeros ignorados → mediana de `[4, 6]` = `5`, `activeInspectors 2` |
| ninguém ativo | `[]` ou `[0, 0]` | `{ value: 1, source: 'MEDIAN', activeInspectors: 0 }` (piso) |
| um só ativo | `[1]` | `1` |
| override | `[12, 10, 9]`, `override 20` | `{ value: 20, source: 'OVERRIDE', periodDays: 30 }` |
| override em 7 dias (L-F07-09) | `override 20`, `periodDays 7` | `{ value: 4.5, source: 'OVERRIDE' }` (20 × 7/30 = 4.67 → 4.5) |
| override em 14 dias | `override 20`, `periodDays 14` | `9.5` (9.33 → 9.5) |
| override em 1 dia | `override 20`, `periodDays 1` | `1` (0.67 → 0.5 → piso 1) |
| override em 92 dias | `override 20`, `periodDays 92` | `61.5` (61.33 → 61.5) |
| mediana em 7 dias | `[3, 5]`, sem override, `periodDays 7` | `4` (a mediana não é escalada: já é do período) |
| ordem da entrada | `[9, 12, 8, 10, 9, 10]` | `9.5` (ordena internamente) |

**8b. Domínio — `volume-prorata.test.ts`** (`activeDaysInPeriod(createdOn, from, to)` e `VOLUME` com pro-rata; L-F07-05)

| Caso | Entrada | Esperado |
|---|---|---|
| criado antes do período | `createdOn '2026-01-01'`, `[2026-11-01, 2026-11-30]` | `activeDays 30`; Ana 12/9.5 → `rate 1` (sem mudança) |
| criado no meio | `createdOn '2026-11-19'` (12 dias até 30/11), 10 DONE, referência 9.5 | `activeDays 12`; referência efetiva 9.5 × 12/30 = 3.8; `rate min(1, 10/3.8) = 1` |
| novo e devagar | `createdOn '2026-11-19'`, 2 DONE, referência 20 | efetiva 8; `rate 0.25` (sem pro-rata seria 0.1) |
| criado depois do `to` | `createdOn '2026-12-05'` | `activeDays 0` → `VOLUME rate null` (sai do score) |
| criado no último dia | `createdOn '2026-11-30'` | `activeDays 1` |
| fuso | `created_at 2026-11-18T14:00:00Z` (= 19/11 01:00 AEDT) | `createdOn '2026-11-19'` |
| resultado | qualquer | `VOLUME.activeDays` preenchido; `null` nas outras métricas |

**8c. Domínio — `failures.test.ts`** (`failures` montadas por `computeMetricFromFacts`; L-F07-06)

| Caso | Entrada | Esperado |
|---|---|---|
| pontualidade LATE | Ana L1: slot 09:00–11:00, início 11:20, previsto 10:50 | `{ appointmentId, serviceDate: '2026-11-xx', detail: 'Checked in 11:20, window 09:00–11:00, planned 10:50' }` |
| pontualidade EARLY | início 08:40 | `detail 'Checked in 08:40, window 09:00–11:00'` |
| `NO_SHOW` | `DONE_WITHOUT_EXECUTION` / `CANT_ATTEND` / `NO_SHOW_REJECTED` | `'Marked done without check-in'` / `'Dropped: can't attend'` / `'Rejected: inspector didn't attend'` |
| geofence MISS | check-in fora, 420 m, raio 300 | `'Check-in 420 m from the property (radius 300 m)'` |
| travou | 7 h 10 | `'Finished 7h 10m after check-in'` |
| satisfação baixa | rating 2 | `'Rated 2 / 5'`; rating 3 não entra (só ≤ 2) |
| atraso sem aviso | LATE sem `LATE_NOTICE` antecipado | `'Late without notice before 10:50'` |
| rejeitado | `NOT_EXECUTED` | `'Rejected after completion: not carried out'` |
| sucesso | qualquer sucesso | não entra em `failures` |
| cap | 25 falhas | 20, as de `serviceDate` mais recente primeiro; `failureCount 25` |
| privacidade | qualquer | `detail` ≤ 80 caracteres; sem endereço, lat/lng, nome de agência |
| `VOLUME` | qualquer | `failures []` |

**8. Domínio — `metrics.test.ts`** (`computeMetricFromFacts(metric, facts, ctx)`; `ctx = { toleranceMinutes: 15, volumeReference: 9.5 }`, a mediana da população dos exemplos). Usar os exemplos trabalhados (seção Fórmula) como fixtures. Esperado (taxas com 4 casas):

| Fixture | Métrica | `rate` | `eligibleCount` | `successCount` | extra |
|---|---|---|---|---|---|
| Ana | PUNCTUALITY | 0.8333 | 12 | 10 | |
| Ana | GEOFENCE | 0.9167 | 12 | 11 | |
| Ana | NO_STUCK | 1 | 12 | 12 | |
| Ana | SATISFACTION | 0.8125 | 4 | null | `averageRating 4.25` |
| Ana | LATE_NOTICE | 0.5 | 2 | 1 | L1 avisado às 10:30 antes da ETA 10:50; L2 avisado às 09:20, sem plano, depois do início da janela 09:00 |
| Ana | CANT_ATTEND | 1 | 12 | 12 | |
| Ana | VOLUME | 1 | 12 | 12 | `volumeReference 9.5` (12/9.5 = 1.26, limitado a 1) |
| Ana | DONE_REJECTED | 1 | 12 | 12 | |
| Ben | PUNCTUALITY | 0.5333 | 10 | 8 | (sem peso daria 0.8) |
| Ben | LATE_NOTICE | 0 | 2 | 0 | nenhum aviso |
| Ben | VOLUME | 1 | 10 | 10 | 10/9.5 → 1 |
| Dan | PUNCTUALITY | 0.7 | 10 | 7 | |
| Dan | GEOFENCE | 1 | 7 | 7 | |
| Dan | CANT_ATTEND | 0.8 | 10 | 8 | |
| Dan | VOLUME | 0.8421 | 8 | 8 | 8/9.5 |
| Dan | DONE_REJECTED | 1 | 8 | 8 | |
| Eva | SATISFACTION | null | 0 | null | `averageRating null` |
| Eva | LATE_NOTICE | null | 0 | 0 | |
| Fábio | DONE_REJECTED | 0.9 | 10 | 9 | |
| Fábio | VOLUME | 0.9474 | 9 | 9 | 9/9.5 |
| sem DONE | 0 DONE, referência 9.5 | VOLUME | 0 | 0 | 0 |
| Eva + 1 pesquisa nota 1 (L-F07-03) | SATISFACTION | null | 1 | null | `averageRating 1`; `minimumRatings 3` não atingido |
| Eva + 2 pesquisas (1, 5) | SATISFACTION | null | 2 | null | `averageRating 3` |
| Eva + 3 pesquisas (1, 5, 5) | SATISFACTION | 0.6667 | 3 | null | calcula (pesos iguais 60) |
| Eva + 1 pesquisa, `minimumRatings 1` | SATISFACTION | 0 | 1 | null | calcula |
| Gil: 9 DONE + 1 `NO_SHOW_REJECTED` (L-F07-01) | PUNCTUALITY | 0.9 | 10 | 9 | |
| Gil | CANT_ATTEND | 0.9 | 10 | 9 | no-show conta como falta |
| Gil | VOLUME | 0.9474 | 9 | 9 | `NO_SHOW_REJECTED` fora do `completedCount` |
| Gil | DONE_REJECTED | 1 | 9 | 9 | `NO_SHOW_REJECTED` fora |
| Hugo: 10 DONE + 1 `CANT_ATTEND` com 3 dias de antecedência | PUNCTUALITY | 1 | 10 | 10 | `CANT_ATTEND` antecipado = `NOT_EVALUABLE` |
| Hugo | CANT_ATTEND | 0.9091 | 11 | 10 | continua falta |
| Iris: 10 DONE, 1 rejeitado com `INVALID_ADDRESS` (L-F07-04) | DONE_REJECTED | 1 | 9 | 9 | o DONE rejeitado por outro código sai do universo (volume 9) |
| Iris, mesmo DONE rejeitado com `NOT_EXECUTED` | DONE_REJECTED | 0.9 | 10 | 9 | penaliza |
| Eva + rejeição tardia (L-F07-07): outro DONE dela de 2026-10-02, `NOT_EXECUTED` em 2026-11-05, período `[2026-11-01, 2026-11-30]` | DONE_REJECTED | 0.9091 | 11 | 10 | o fato tardio (`lateRejection true`) só entra na 8; volume e demais métricas seguem 10 |
| Eva + rejeição em 2026-10-31 do DONE de 2026-10-02 (29 dias, não tardia) | DONE_REJECTED | 1 | 10 | 10 | fica no período de outubro, não entra em novembro |

- Em `VOLUME`, `eligibleCount = successCount = completedCount`, `volumeReference` = referência usada (só nessa métrica; nula nas outras), `weightedSuccess = completedCount`, `weightedEligible = volumeReference`.

- Todo resultado traz `volume` (tamanho do universo do inspetor) e `weightedSuccess`/`weightedEligible` em minutos (Ana PUNCTUALITY: 600 / 720).
- Todo resultado traz `failures` e `failureCount` (teste 8c); Ana PUNCTUALITY → 2 falhas (L1, L2); Ana LATE_NOTICE → 1 (L2).
- Sem duplicar num mesmo período (L-F07-07): período `[2026-10-01, 2026-12-31]` (92 dias, F08) com o DONE de 2026-10-02 rejeitado tardiamente em 2026-11-05 → **um** fato só, o normal (data do serviço no período); o tardio só nasce quando a data do serviço está fora do período.

**9. Domínio — `score.test.ts`** (`computeReliabilityScore(results, settings, volume)` → `{ status, score }`)

| Caso | Esperado |
|---|---|
| Ana, pesos iguais | `{ status: 'SCORED', score: 88.3 }` |
| Ana, `PUNCTUALITY: 3`, demais 1 | `87.3` (prova 03.A1 na unidade: o score muda com o peso) |
| Ana, `VOLUME: 0`, demais 1 | `86.6` |
| Ben, pesos iguais (SATISFACTION nulo) | `79.0` |
| Dan, pesos iguais (SATISFACTION e LATE_NOTICE nulos) | `89.0` |
| Eva, pesos iguais | `100` |
| Fábio, pesos iguais | `97.5` |
| Ana com `volumeReferenceOverride 20` | `83.3` |
| Eva + 1 pesquisa nota 1 (L-F07-03, `minimumRatings 3`) | `100` (SATISFACTION nula; sem o mínimo seria `(6 + 0)/7 = 85.7`) |
| Eva + 3 pesquisas (1, 5, 5) | `(6 + 0.66667)/7 = 0.95238` → `95.2` |
| Gil (9 DONE + 1 `NO_SHOW_REJECTED`, demais perfeitos, sem pesquisa/atraso) | P 0.9 · G 1 · S 1 · CA 0.9 · V 0.94737 · DR 1 → `5.74737/6 = 0.95789` → `95.8` |
| contraprova L-F07-01 | Gil sem o código (OP rejeita com `OTHER`) | Gil com 9 DONE perfeitos → `(5 + 0.94737)/6 = 99.1`; o teste documenta que sem `INSPECTOR_NO_SHOW` a OP não penaliza |
| Carla (9 serviços, mínimo 10) | `{ status: 'INSUFFICIENT_VOLUME', score: null }` |
| Carla com `minimumVolume 9` | `SCORED` |
| só `SATISFACTION: 1` (demais 0) e sem pesquisas | `{ status: 'NO_WEIGHTED_DATA', score: null }` |
| arredondamento | soma ponderada 0.78250 → `78.3`; 0.782499 → `78.2`; 1 → `100`; 0 → `0` |

**10. Domínio — `build-service-facts.test.ts`** (montagem do universo a partir das linhas cruas; o leitor entrega linhas, a função pura deduplica e anota)
- mesmo par (inspetor, appointment) com ocorrência de DONE e com `CANT_ATTEND` (reofertado de volta ao mesmo inspetor e feito) → fica só a ocorrência de DONE.
- DONE atual de Gil com execução finalizada de Ana no mesmo appointment (reoferta depois de DONE → REJECTED) → fato de Gil `DONE_WITHOUT_EXECUTION` (a execução de Ana não é usada); fato de Ana `EXECUTED` com `doneRejected true`.
- appointment A largado por Gil com `KEY_FAILED` depois do check-in (execução abandonada), reofertado e feito por Hugo (execução reiniciada) → Gil **sem** serviço; Hugo com `EXECUTED` e as flags do reinício.
- Gil largou com `CANT_ATTEND`, Hugo fez → Gil `CANT_ATTEND`, Hugo `EXECUTED` (pares distintos).
- REJECTED com `TENANT_NO_RESPONSE` ou `TENANT_DECLINED` → nenhum serviço.
- DONE com execução reaberta e ainda aberta (`finished_at null`, `resumed_at` preenchido) → nenhum serviço (nem `EXECUTED`, nem `DONE_WITHOUT_EXECUTION`).
- peso: com parada do plano do mesmo inspetor e `plan_date = scheduled_date` → `duration_minutes` + `travel_s/60` da parada; sem plano → `service_types.default_duration_minutes` + 0; `CANT_ATTEND` → parada do plano mais recente do inspetor que contém o appointment, senão duração do tipo.
- `publishedServiceStartAt` e `publishedEtaAt` só vêm da parada do plano do **mesmo** inspetor e da data agendada.
- (L-F07-01) linha `NO_SHOW_REJECTED` de Gil no appointment A → fato `NO_SHOW_REJECTED`, `serviceDate = scheduled_date`; se Gil também tem `CANT_ATTEND` no mesmo A → fica só o `NO_SHOW_REJECTED`; se Gil depois recebe A de novo e conclui (DONE) → ficam os dois (o DONE e o no-show anterior são ocorrências distintas).
- (L-F07-01) `CANT_ATTEND` traz `cantAttendNoticeAt` = `resolveEffectiveEventTime(client_occurred_at, created_at).effectiveAt` do evento.
- (L-F07-04) linha `REJECTED_DONE` com `rejection_code 'INVALID_ADDRESS'` → descartada (nenhum fato); com `'NOT_EXECUTED'` → fato com `doneRejected true`.
- (L-F07-07) linha `REJECTED_DONE` com `rejectedOn > serviceDate + 30` e `serviceDate` fora do período, `rejectedOn` dentro → fato com `lateRejection true`, `doneRejected true`; com `serviceDate` dentro → fato normal (sem duplicar).
- (L-F07-05) cada fato carrega `inspectorCreatedOn` (data civil Sydney de `inspectors.created_at`).

**11. Aplicação — `apps/backend/src/modules/reliability/application/reliability-metrics.service.test.ts`** (leitor fake + settings fake)
- `computeMetric('PUNCTUALITY', 'ana', '2026-11-01', '2026-11-30')` → resultado da fixture Ana; o leitor recebe `{ from: '2026-11-01', to: '2026-11-30', inspectorIds: ['ana'] }`.
- `computeAll('2026-11-01', '2026-11-30')` → `Map` com uma entrada **por inspetor que tem serviço**; o leitor é chamado **1 vez** (sem `inspectorIds`); a mediana sai dos próprios fatos carregados (sem consulta extra) e é a **mesma** em todas as entradas (`volumeReference 9.5`).
- `computeAll(from, to, ['ana'])` e `computeMetric('VOLUME', 'ana', …)` → a mediana precisa de todos os inspetores: chamam `loadCompletedCounts(from, to)` **1 vez** e obtêm `9.5`.
- `computeMetric` de métrica ≠ VOLUME **não** chama `loadCompletedCounts`.
- `reliabilityIndex.volumeReferenceOverride = 20` → `loadCompletedCounts` não é chamado; Ana VOLUME `rate 0.6`.
- inspetor sem serviço no período → `computeMetric` devolve `rate null` (VOLUME: `rate 0`), `volume 0`.
- `from > to` → `RangeError` (`'from must be on or before to'`); data inválida → `RangeError`.
- período de 1 dia (`from = to`) e de 92 dias funcionam (F08: semana, quinzena, mês).
- `computeAll` usa `fieldEvents.checkInWindowToleranceMinutes` e `reliabilityIndex` lidos **uma** vez.
- (L-F07-09) `override 20` e `computeAll('2026-11-02', '2026-11-08')` → `batch.volumeReference = { value: 4.5, source: 'OVERRIDE', periodDays: 7 }`; Ana com 4 DONE na semana → `VOLUME rate 0.8889`.
- (L-F07-03) `minimumRatings` vem do mesmo `reliabilityIndex` lido uma vez e é repassado a `computeMetricFromFacts` no `ctx`.

**12. Infraestrutura com banco — `apps/backend/tests/integration/db/reliability-facts.reader.db.test.ts`** (Testcontainers, `test:integration:db`)
Seed: 2 agências (`Australia/Sydney`), 1 tipo ROUTINE (60 min), inspetores Ana e Gil. Esperado por caso:
- execução finalizada em `2026-11-30T13:30:00Z` (= 2026-12-01 00:30 AEDT) → **fora** do período `[2026-11-01, 2026-11-30]`; `2026-10-31T13:30:00Z` (= 2026-11-01 00:30) → **dentro**.
- DONE → REJECTED (Ana executou) com audits `appointment.done_rejected` + `appointment.status_transition` (`releasedInspectorId` Ana) → fato `EXECUTED` de Ana com `doneRejected true`, mesmo com `appointments.inspector_id` nulo.
- DONE sem execução marcado pela OP → `DONE_WITHOUT_EXECUTION` para `appointments.inspector_id`.
- DONE sem execução, depois DONE → REJECTED → `DONE_WITHOUT_EXECUTION` com `doneRejected true`, atribuído pelo `releasedInspectorId`.
- **Reoferta depois de DONE → REJECTED** (revisão de 2026-10-28):
  - Ana executa e conclui → AM faz DONE → REJECTED → o appointment volta para um grupo e Gil aceita (SCHEDULED, `inspector_id` Gil);
  - o `start` de Gil recebe `ExecutionAlreadyFinishedError` (comportamento atual, documentado no teste);
  - a OP marca DONE.
  - **Esperado:** Ana tem 1 fato `EXECUTED` (`doneRejected true`, execução dela, `completedCount` 0 por este appointment); Gil tem 1 fato `DONE_WITHOUT_EXECUTION` (DONE atual, `doneRejected false`, conta no `completedCount`, `NO_SHOW` na pontualidade, fora de geofence/NO_STUCK).
  - A execução de Ana **não** é usada no fato de Gil (`inspector_id` diferente).
  - **Contraprova:** com a atribuição pela linha de execução (regra antiga), Ana receberia 2 fatos e Gil nenhum; o teste falha nesse caso.
- mesmo appointment com dois ciclos DONE → REJECTED (Ana, depois Gil, ambos com DONE da OP) → um fato rejeitado para cada um, cada um pareado ao seu par de audits pelo `created_at` mais próximo.
- REJECTED com execução finalizada e **sem** os audits (audit perdido, fire-and-forget) → nenhum fato (sem audit não há como saber o inspetor do DONE).
- `CANT_DO` `CANT_ATTEND` de Gil → `CANT_ATTEND` atribuído a Gil, data = `created_at` no fuso da agência.
- appointment com `deleted_at` → nunca entra.
- parada do plano de Ana com `published_eta` → o fato traz `publishedEtaAt` igual ao valor gravado; parada de plano de outro inspetor para o mesmo appointment → ignorada.
- **mediana consistente:** no mesmo seed, `loadCompletedCounts(from, to)` devolve os mesmos `completedCount` que os fatos do `load` (Ana 12, Ben 10, Carla 9, Dan 8, Eva 10, Fábio 9); inspetor só com `CANT_ATTEND` não aparece; DONE rejeitado depois não conta.
- **no-show pela OP (L-F07-01):** Gil aceita A (SCHEDULED), OP rejeita com `INSPECTOR_NO_SHOW` → audit `appointment.status_transition` SCHEDULED → REJECTED com `releasedInspectorId` Gil e `appointments.rejection_reason_code 'INSPECTOR_NO_SHOW'` → fato `NO_SHOW_REJECTED` de Gil, data = `scheduled_date`, mesmo com `appointments.inspector_id` nulo. A depois reofertado a Hugo e concluído → Hugo `EXECUTED`; Gil mantém o no-show. **Contraprova:** a mesma rejeição com `OTHER` → Gil sem fato.
- **código por transição (L-F07-04):** DONE → REJECTED com `INVALID_ADDRESS` → nenhum fato rejeitado; com `NOT_EXECUTED` → fato com `doneRejected true`. O código é lido do `metadata_json->>'rejectionReasonCode'` do `status_transition` pareado (gravado a partir desta tarefa; não do appointment, que pode ter sido rejeitado de novo depois). Linha antiga sem a chave → tratada como "outro código" (nenhum fato rejeitado; antes da F07 `NOT_EXECUTED` não existia).
- **rejeição tardia (L-F07-07):** DONE executado por Ana em 2026-10-02, `NOT_EXECUTED` em 2026-11-05 → período `[2026-11-01, 2026-11-30]` traz 1 fato `lateRejection true` de Ana; período `[2026-10-01, 2026-10-31]` traz o fato normal; período `[2026-10-01, 2026-11-30]` traz **um** fato só.
- **`created_at` do inspetor (L-F07-05):** fatos de Ana trazem `inspectorCreatedOn` na data civil Sydney.
- **contagem de consultas:** com 1 inspetor e com 50 inspetores × 20 serviços, o leitor executa o **mesmo** número de consultas (7, com a Q7 do no-show), medido por um wrapper do `$queryRaw` no teste.
- **plano da consulta:** o `EXPLAIN` do ramo de execuções da Q1 (o SQL real gerado pelo leitor) usa `inspection_executions_finished_at_idx`. Assert por substring no plano, com `SET enable_seqscan = off` só no teste.

### Escopo / Passos
1. **Shared — enums** `packages/shared/src/enums/reliability.ts`: `ReliabilityMetricKey` (objeto `as const` + tipo, padrão do `reason-codes.ts`), `RELIABILITY_METRIC_KEYS` (ordem canônica), `RELIABILITY_METRIC_LABELS`, `RELIABILITY_METRIC_DESCRIPTIONS`, `ReliabilityScoreStatus` (`SCORED`, `INSUFFICIENT_VOLUME`, `NO_WEIGHTED_DATA`; o `NOT_COMPUTED` da API nasce na TASK-F07-2), `RELIABILITY_WINDOW_DAYS = 30`, `RELIABILITY_TRAVEL_FACTOR = 1`, `CANT_ATTEND_EARLY_NOTICE_HOURS = 24` (L-F07-01), `RELIABILITY_FAILURES_MAX = 20` (L-F07-06). Exportar em `enums/index.ts`.
1a. **Shared — códigos de rejeição (L-F07-01, L-F07-04):** em `packages/shared/src/enums/reason-codes.ts`, `RejectionReasonCode.INSPECTOR_NO_SHOW` (docblock "Chosen by OP/AM on SCHEDULED → REJECTED when the inspector didn't attend; counts against the inspector in the reliability index") e `RejectionReasonCode.NOT_EXECUTED` (docblock "Only on DONE → REJECTED: the inspection was marked done but not carried out; the only DONE → REJECTED code that penalises the inspector"). `REJECTION_CODES_BY_ORIGIN` + `allowedRejectionCodesFrom(fromStatus)`: `INSPECTOR_NO_SHOW` só de `SCHEDULED`, `NOT_EXECUTED` só de `DONE`, os demais como hoje (respeitando `SYSTEM_ONLY_REJECTION_CODES` da F03). Rótulos em `utils/reason-code-label.ts`: "Inspector didn't attend", "Inspection was not actually carried out". Atualizar `reason-codes.test.ts` (contagem).
1b. **Backend — guarda por transição (L-F07-01, L-F07-04):** em `execute-status-transition.use-case.ts`, antes da escrita, `rejectionReasonCode ∉ allowedRejectionCodesFrom(appointment.status)` → `RejectionCodeNotAllowedError` (422 `REJECTION_CODE_NOT_ALLOWED`, "This rejection reason can't be used from the current status"); `INSPECTOR_NO_SHOW` com ator SYS → mesmo erro. No bloco do audit `appointment.status_transition`, gravar `metadata.rejectionReasonCode` quando houver (leitura da Q2/Q7). Os 5 lugares de RBAC de transição **não** mudam (a matriz de quem pode `SCHEDULED → REJECTED` e `DONE → REJECTED` continua a mesma).
2. **Shared — settings:** em `packages/shared/src/schemas/platform-settings.ts`, `reliabilityIndexSettingSchema` + entrada `reliabilityIndex: { schema, defaults, section: 'reliabilityIndex' }` no `PLATFORM_SETTINGS_REGISTRY` (regra da F03: chave nova, defaults completos).
3. **Shared — schema do resultado:** `packages/shared/src/schemas/reliability.ts` com `reliabilityMetricResultSchema` (usado pelo `metrics_json` e pela API da TASK-F07-2). Exportar em `schemas/index.ts`. `pnpm --filter @properfy/shared build`.
4. **Backend — constante do alerta:** mover `STUCK_THRESHOLD_HOURS` para `apps/backend/src/modules/inspector-execution/domain/stuck-execution.ts` (`export const STUCK_THRESHOLD_HOURS = 6`); o `notify-stuck.worker.ts` passa a importar dali. Sem mudança de comportamento (teste do worker existente continua verde).
5. **Backend — módulo `apps/backend/src/modules/reliability/`:**
   - `domain/service-fact.ts` (tipos `ServiceFact`, `ServiceFactRow*`), `domain/build-service-facts.ts`, `domain/service-weight.ts`, `domain/punctuality.ts`, `domain/geofence-compliance.ts`, `domain/no-stuck.ts`, `domain/late-notice.ts`, `domain/volume-reference.ts` (`computeVolumeReference`), `domain/metrics.ts` (`computeMetricFromFacts`), `domain/score.ts` (`computeReliabilityScore`, `roundHalfUp`), `domain/reliability-facts.reader.ts` (porta `IReliabilityFactsReader`);
   - `application/reliability-metrics.service.ts` (`ReliabilityMetricsService`);
   - `infrastructure/prisma-reliability-facts.reader.ts` (as 7 consultas da seção Métricas + `loadCompletedCounts`);
   - `domain/volume-prorata.ts` (`activeDaysInPeriod`, L-F07-05) e `domain/metric-failures.ts` (montagem de `failures` e `detail`, L-F07-06).
6. **Prisma + migration** `apps/backend/prisma/migrations/YYYYMMDDhhmmss_inspection_executions_finished_at_idx/migration.sql` (placeholder, regenerado na implementação; ordena depois das migrations de F03/F04):
   ```sql
   CREATE INDEX "inspection_executions_finished_at_idx" ON "inspection_executions" ("finished_at");
   ```
   - `schema.prisma`: `@@index([finished_at])` em `InspectionExecution`. Expand puro.
   - **Sem índice novo em `audit_logs`** (revisão de 2026-10-28): `@@index([action])` (`schema.prisma:874`) dirige a busca das linhas `appointment.done_rejected`, que são raras, e as buscas por appointment usam `(entity_type, entity_id)`.
   - Conferir o diff do `prisma migrate dev` contra índices `Unsupported()` (memória `project_prisma_drift_drops_unsupported_indexes`).
7. **Container:** `container.reliability = { metricsService }` (`apps/backend/src/main/container.ts`), com `PrismaReliabilityFactsReader(prisma)` e o `IPlatformSettingsReader` da F03.
8. **Doc (X00):** `apps/backend/CLAUDE.md` — módulo `reliability` (definições das métricas apontando para este arquivo, regra "inspector_id é nulo depois de REJECTED/CANCELLED; atribuir por execução/evento/audit", exceção de tenant, códigos `INSPECTOR_NO_SHOW`/`NOT_EXECUTED` e o que cada um penaliza); `packages/shared/CLAUDE.md` — `enums/reliability.ts`, a chave `reliabilityIndex` e `allowedRejectionCodesFrom`.

### Modelo de dados
- **Nenhuma tabela nova nesta tarefa.** Só os 2 índices do passo 6.
- **Shared — chave `reliabilityIndex`:**
  ```ts
  const metricWeight = z.number().int().min(0).max(10);
  export const reliabilityIndexSettingSchema = z.object({
    weights: z.object({
      PUNCTUALITY: metricWeight, GEOFENCE: metricWeight, NO_STUCK: metricWeight,
      SATISFACTION: metricWeight, LATE_NOTICE: metricWeight, CANT_ATTEND: metricWeight,
      VOLUME: metricWeight, DONE_REJECTED: metricWeight,
    }).refine((w) => Object.values(w).some((v) => v > 0), { message: 'Set at least one weight above 0' }),
    minimumVolume: z.number().int().min(1).max(200),
    // null = mediana dos inspetores ativos na janela (P11). Preenchido = referência fixa (onboarding, opcional).
    volumeReferenceOverride: z.number().int().min(1).max(1000).nullable(),
    // L-F07-03: abaixo disso SATISFACTION fica null (renormaliza)
    minimumRatings: z.number().int().min(1).max(50),
  });
  // defaults: weights = 1 em todas; minimumVolume 10; volumeReferenceOverride null; minimumRatings 3
  ```
  - Valor gravado antes desta chave existir não existe (a chave é nova nesta tarefa), então não há migração de dado.
- **Shared — resultado de uma métrica:**
  ```ts
  export const reliabilityMetricResultSchema = z.object({
    metric: z.nativeEnum(ReliabilityMetricKey),
    rate: z.number().min(0).max(1).nullable(),   // 4 casas; maior = melhor
    eligibleCount: z.number().int().nonnegative(), // denominador sem peso (VOLUME: completedCount)
    successCount: z.number().int().nonnegative().nullable(), // null só em SATISFACTION
    averageRating: z.number().nullable(),          // só SATISFACTION (média crua 1–5, sem arredondar)
    volumeReference: z.number().positive().nullable(), // só VOLUME: mediana (pode ter ,5) ou override; ≥ 1
    weightedSuccess: z.number().nonnegative(),     // minutos; VOLUME/SATISFACTION ver Métricas
    weightedEligible: z.number().nonnegative(),
    volume: z.number().int().nonnegative(),        // serviços do inspetor no período (universo)
    activeDays: z.number().int().nonnegative().nullable(), // só VOLUME (L-F07-05): dias do período desde o cadastro
    failureCount: z.number().int().nonnegative(),  // L-F07-06: total de insucessos (antes do cap)
    failures: z.array(z.object({                   // L-F07-06: até RELIABILITY_FAILURES_MAX (20), mais recentes primeiro
      appointmentId: z.string().uuid(),
      serviceDate: civilDateSchema,
      detail: z.string().max(80),                  // inglês; sem endereço, coordenada ou nome de agência
    })).max(20),
  });
  ```

### Métricas (definições)

**Período.** `from`/`to` são datas civis `YYYY-MM-DD`, **ambas inclusivas**. O serviço pertence ao período quando a sua **data de serviço** (P2) está entre `from` e `to`. Pré-filtro por instante (para usar índices): `fromLower = (from − 1 dia) 00:00 UTC`, `toUpper = (to + 2 dias) 00:00 UTC` (cobre qualquer fuso de −12 a +14); o filtro exato é a data civil no fuso da agência: `((x AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date`.

**Universo U(inspetor, período)** (P1). Cada item é uma **ocorrência de DONE** (atual ou rejeitada depois) ou um `CANT_ATTEND`; appointments com `deleted_at` nunca entram.

| Origem | Atribuição (inspetor do DONE) | Tipo | Data de serviço | Entra em |
|---|---|---|---|---|
| **DONE atual**: appointment `DONE` | `appointments.inspector_id` (não muda depois do DONE) | `EXECUTED` se existe execução finalizada, não abandonada, **com `inspection_executions.inspector_id` igual**; senão `DONE_WITHOUT_EXECUTION` | `EXECUTED`: `finished_at` no fuso da agência; senão `scheduled_date` | `EXECUTED`: todas; `DONE_WITHOUT_EXECUTION`: 1, 4, 6, 7, 8 |
| **DONE rejeitado depois**: cada audit `appointment.done_rejected` com `created_at ≥ fromLower`, pareado com o `appointment.status_transition` DONE → REJECTED do mesmo appointment de `created_at` mais próximo, **com `metadata_json.rejectionReasonCode = 'NOT_EXECUTED'`** (L-F07-04; outro código → nenhum fato) | `metadata_json.releasedInspectorId` desse `status_transition` | `EXECUTED` se a execução finalizada e não abandonada é desse inspetor; senão `DONE_WITHOUT_EXECUTION` | `EXECUTED`: `finished_at`; senão o `created_at` (fuso da agência) do último `status_transition` para DONE antes do audit. **Rejeição tardia** (L-F07-07): data da rejeição quando a data do serviço está fora do período e a rejeição veio mais de 30 dias depois | igual à linha acima; `doneRejected = true`. Tardia (`lateRejection = true`): **só 8** |
| **`CANT_ATTEND`**: `inspector_field_events` `type CANT_DO`, `reason_code CANT_ATTEND` (o mais recente por par) | `inspector_field_events.inspector_id` | `CANT_ATTEND` | `created_at` no fuso da agência | 1 (salvo aviso antecipado ≥ 24 h, L-F07-01), 6 |
| **No-show marcado pela OP** (L-F07-01): cada `appointment.status_transition` SCHEDULED → REJECTED com `metadata_json.rejectionReasonCode = 'INSPECTOR_NO_SHOW'` | `metadata_json.releasedInspectorId` | `NO_SHOW_REJECTED` | `appointments.scheduled_date` | 1, 6 |

- O status **atual** do appointment não decide a métrica 8. Um DONE rejeitado continua sendo falha do inspetor daquele DONE, mesmo que o appointment volte e termine DONE com outro inspetor. O DONE atual nunca é falha.
- Dois ciclos DONE → REJECTED no mesmo appointment geram dois fatos rejeitados (um por par de audits).
- Um `CANT_ATTEND` é descartado quando o mesmo inspetor tem uma ocorrência de DONE ou um `NO_SHOW_REJECTED` no mesmo appointment.
- Um `NO_SHOW_REJECTED` convive com uma ocorrência de DONE posterior do mesmo inspetor no mesmo appointment (são eventos distintos).
- **Volume** = `|U|`, sem os fatos `lateRejection` (L-F07-07). É o número comparado com `minimumVolume`.
- **Peso do `NO_SHOW_REJECTED`:** a regra do `CANT_ATTEND` (parada mais recente do inspetor que contém o appointment; senão duração do tipo).
- **Peso do serviço** (03.5, P7): `w = durationMinutes + RELIABILITY_TRAVEL_FACTOR × plannedTravelMinutes`.
  - `durationMinutes` = `day_plan_stops.duration_minutes` da parada do plano do mesmo inspetor com `plan_date = scheduled_date`; sem essa parada, `service_types.default_duration_minutes`.
  - `plannedTravelMinutes` = `day_plan_stops.travel_s / 60` da mesma parada (trecho que chega nela); sem parada, `0`.
  - Para `CANT_ATTEND`: a parada do plano mais recente do inspetor que contém o appointment.
  - `w` é sempre ≥ 5 (duração mínima do tipo), então nunca há divisão por zero.
- **Taxa ponderada:** `rate = Σ w·sucesso / Σ w` sobre os serviços elegíveis da métrica; `rate = null` quando não há elegível (P5).
- **Tolerância** = `fieldEvents.checkInWindowToleranceMinutes` atual (F03, padrão 15).
- **Janela do slot em instantes:** `windowStartAt = zonedWallTimeToUtc(scheduled_date, time_slot_start, tz)`, `windowEndAt = zonedWallTimeToUtc(scheduled_date, time_slot_end, tz)`.
- **Início efetivo:** `effectiveStartAt = resolveEffectiveEventTime(start_client_at, started_at).effectiveAt` (F03; janela −7 dias / +5 min, R1).

| # | Chave | Elegíveis (denominador) | Sucesso (numerador) | Excluídos | Fonte |
|---|---|---|---|---|---|
| 1 | `PUNCTUALITY` | todo U, menos `NOT_EVALUABLE` | `evaluatePunctuality = PUNCTUAL` | `EXECUTED` com `geofence_radius_m` nulo (anterior à F03: `out_of_window` não confiável); `CANT_ATTEND` com aviso efetivo < `windowStartAt − 24 h` (L-F07-01) | `inspection_executions.out_of_window`, `started_at`, `start_client_at`; `day_plan_stops.published_service_start_at` |
| 2 | `GEOFENCE` | `EXECUTED` com resultado `PASS` ou `MISS` | `PASS` | `EXCLUDED` (teste 5) | `out_of_radius`, `finish_out_of_radius`, distâncias, precisões, `geofence_radius_m` |
| 3 | `NO_STUCK` | `EXECUTED` não reabertos | `finished_at − started_at ≤ STUCK_THRESHOLD_HOURS` | reabertos (`resumed_at` não nulo); outros tipos | `started_at`, `finished_at`, `resumed_at` |
| 4 | `SATISFACTION` | serviços `EXECUTED`/`DONE_WITHOUT_EXECUTION` com pesquisa do mesmo inspetor; `rate null` se forem menos que `minimumRatings` (L-F07-03) | contribui `(rating − 1) / 4` (0 a 1) | sem pesquisa | `satisfaction_surveys.rating` por `appointment_id` + `inspector_id` |
| 5 | `LATE_NOTICE` | serviços com `evaluatePunctuality = LATE` | avisado com antecedência (P4): horário efetivo < `published_eta` da parada (sem ela, < início da janela) | `PUNCTUAL`, `EARLY`, `NO_SHOW`, `NOT_EVALUABLE` | `inspector_field_events` `LATE_NOTICE` (`created_at`, `client_occurred_at`); `day_plan_stops.published_eta` |
| 6 | `CANT_ATTEND` | todo U | não é `CANT_ATTEND` nem `NO_SHOW_REJECTED` | – | `inspector_field_events` `CANT_DO` `CANT_ATTEND`; audit `status_transition` com `INSPECTOR_NO_SHOW` |
| 7 | `VOLUME` | – | `completedCount` = ocorrências de DONE **atual** (origem `CURRENT_DONE`, `EXECUTED` + `DONE_WITHOUT_EXECUTION`), **sem peso** | rejeitados depois de DONE; `CANT_ATTEND`; `NO_SHOW_REJECTED` | contagem; `rate = min(1, completedCount / (volumeReference × activeDays / periodDays))` (pro-rata, L-F07-05), com `volumeReference` = mediana dos ativos (P11) ou override escalado (L-F07-09) |
| 8 | `DONE_REJECTED` | todas as ocorrências de DONE (`EXECUTED` + `DONE_WITHOUT_EXECUTION`) + fatos `lateRejection` | `doneRejected = false` | `CANT_ATTEND`, `NO_SHOW_REJECTED`; DONE rejeitado com código ≠ `NOT_EXECUTED` (fora do universo) | audit `appointment.done_rejected` (`created_at ≥ fromLower`) pareado com o `status_transition` DONE → REJECTED com `NOT_EXECUTED` |

Detalhes por métrica:

1. **Pontualidade.** Para `EXECUTED` com flags (F03):
   - `EARLY` se `outOfWindow` e `effectiveStartAt < windowStartAt − tolerância`;
   - `PUNCTUAL` se `!outOfWindow`, ou se `publishedServiceStartAt` existe e `effectiveStartAt ≤ publishedServiceStartAt + tolerância` (o "previsto" do plano; resgata só atraso, nunca adiantamento);
   - `LATE` nos demais casos fora da janela (inclui check-in em dia posterior ao agendado).
   - `DONE_WITHOUT_EXECUTION`, `CANT_ATTEND` e `NO_SHOW_REJECTED` = `NO_SHOW` (falha, D10).
   - **Exceção (L-F07-01):** `CANT_ATTEND` com `cantAttendNoticeAt < windowStartAt − CANT_ATTEND_EARLY_NOTICE_HOURS` (24 h; estritamente antes) = `NOT_EVALUABLE`: a OP teve um dia para reofertar, então não é no-show. Continua falta na métrica 6.
   - `EXECUTED` sem flags (`geofence_radius_m` nulo, o que só acontece em linha anterior à F03; R1) = `NOT_EVALUABLE`.
   - `out_of_window` é usado tal como gravado no check-in (com a tolerância daquele momento). Com horário do cliente implausível a F03 grava `false` (`windowSkipped`), e o resultado é `PUNCTUAL` (R1). A tolerância atual só entra nas comparações com `windowStartAt` e com o previsto.
2. **Geofence.** Cada trecho avaliado (`geolocation_distance_meters` / `finish_geolocation_distance_meters` não nulo) vale `PASS` (`flag` falsa), `MISS` (`flag` verdadeira e precisão nula ou ≤ `geofence_radius_m`) ou inconclusivo (`flag` verdadeira e precisão > raio). A execução é `MISS` se algum trecho é `MISS`; `PASS` se nenhum é `MISS` e algum é `PASS`; `EXCLUDED` caso contrário. O check-out usa o raio atual (F03), mas a comparação da precisão usa `geofence_radius_m` (o snapshot do check-in), porque é o único raio gravado.
3. **Conclusão sem travar.** Equivale a "não recebeu o alerta de 6 h" sem depender de haver destinatários OP/AM, do cool-off nem da granularidade horária do cron (P3). Execução reaberta pela OP é excluída: o `started_at` original infla a duração.
4. **Satisfação.** `rate = Σ w·(rating − 1)/4 / Σ w`; `eligibleCount` = número de pesquisas; `successCount = null`; `averageRating` = média crua (sem peso). `weightedSuccess` = `Σ w·(rating − 1)/4`. A pesquisa conta no período do **serviço**, mesmo se respondida depois (recálculos diários a pegam).
   - **Mínimo de pesquisas (L-F07-03):** `eligibleCount < minimumRatings` → `rate null` (sai do score, P5); `eligibleCount` e `averageRating` continuam preenchidos para o drawer ("Not enough ratings · 1 of 3 needed"). O peso 0 continua desligando a métrica para todos.
5. **Atraso avisado com antecedência (03.3).**
   - `rate = Σ w (LATE e avisado) / Σ w (LATE)`.
   - "Avisado" = algum `LATE_NOTICE` do mesmo inspetor para o appointment com `effectiveNoticeAt < deadline`, onde:
     - `effectiveNoticeAt = resolveEffectiveEventTime(client_occurred_at, created_at).effectiveAt`;
     - `deadline = publishedEtaAt ?? windowStartAt`.
   - `publishedEtaAt` = `day_plan_stops.published_eta` da parada do plano do mesmo inspetor com `plan_date = scheduled_date`. É a chegada que o plano prometeu, congelada na publicação.
   - Aviso de outro inspetor (antes da reoferta) não conta.
   - A F03 citava `created_at`; a regra única agora é o horário efetivo (P4), e o `created_at` só entra como fallback da função.
6. **"Não consigo fazer" por motivo do inspetor.** `rate = 1 − Σ w (CANT_ATTEND + NO_SHOW_REJECTED) / Σ w (U)`; `successCount = |U| − |CANT_ATTEND| − |NO_SHOW_REJECTED|` (L-F07-01: o no-show marcado pela OP é falta, como o aviso). Para a F08 (`CANT_DO_MAX`), a fração de faltas é `1 − rate`.
7. **Volume atendido.**
   - `eligibleCount = successCount = completedCount`; `volumeReference` = referência usada; `weightedSuccess = completedCount`; `weightedEligible = volumeReference` (sem peso por decisão D1).
   - **Pro-rata (L-F07-05):** `periodDays = to − from + 1`; `activeDays = activeDaysInPeriod(inspectorCreatedOn, from, to)` = dias civis de `max(from, inspectorCreatedOn)` até `to`, inclusivos (0 quando criado depois de `to`); `rate = min(1, completedCount / (volumeReference × activeDays / periodDays))`; `activeDays 0` → `rate null`. `weightedEligible = volumeReference × activeDays / periodDays`. `inspectorCreatedOn` = data civil Sydney de `inspectors.created_at`. Licença/pausa e reativação não são tratadas (o modelo não guarda histórico de `status`).
   - **Referência** (P11): `computeVolumeReference(completedCounts, override, periodDays)`.
     - Com `override` não nulo, usa `max(1, roundToHalf(override × periodDays / RELIABILITY_WINDOW_DAYS))` (L-F07-09; na janela de 30 dias é o próprio override). `roundToHalf(x) = Math.round(x × 2) / 2`.
     - Senão, a mediana dos `completedCount ≥ 1` de **todos** os inspetores no mesmo período (sem filtro por `inspectors.status`), com piso 1. Par → média dos dois do meio.
   - **Uma vez por execução:** `computeAll` sem filtro calcula a referência dos próprios fatos e a usa para todos. `computeAll` com `inspectorIds` e `computeMetric('VOLUME', …)` chamam `loadCompletedCounts(from, to)` (1 consulta) para a mesma mediana. O job do snapshot usa sempre `computeAll` sem filtro: um valor só no dia, guardado no `settings_json`.
8. **DONE → REJECTED.**
   - Cada audit `appointment.done_rejected` com `created_at ≥ fromLower` (sem limite superior: uma rejeição posterior ao fim do período ainda conta para o DONE que estava no período) gera um fato com `doneRejected = true`, atribuído ao `releasedInspectorId` do `status_transition` DONE → REJECTED pareado.
   - A penalidade é do inspetor do DONE rejeitado; o DONE atual do appointment, se existir, é outro fato, sem penalidade.
   - O fato rejeitado só pertence ao período quando a sua data de serviço está nele. O `created_at ≥ fromLower` é só o pré-filtro, e é o mesmo no texto e no SQL.
   - **Só `NOT_EXECUTED` penaliza (L-F07-04).** O código vem de `metadata_json.rejectionReasonCode` do `status_transition` pareado. Com outro código (`INVALID_ADDRESS`, `OTHER`, …) ou sem a chave (linhas anteriores à F07), o DONE rejeitado **sai do universo**: não é falha nem sucesso de ninguém. Correção administrativa (`DONE → DRAFT`, ou `DONE → REJECTED` com outro código) não penaliza.
   - **Rejeição tardia (L-F07-07).** Seja `rejectedOn` = data civil (fuso da agência) do audit `done_rejected`. Quando `rejectedOn > serviceDate + 30` **e** `serviceDate` está fora do período **e** `rejectedOn` está dentro, o fato entra no período com `lateRejection = true`: conta só na métrica 8 (no denominador e como falha), fica fora do volume e das demais métricas. Se `serviceDate` está no período, vale o fato normal (nunca os dois). O fechamento da F08 é definitivo; a rejeição tardia afeta só o índice.

**Consultas do `PrismaReliabilityFactsReader.load({ from, to, inspectorIds? })`** — sempre 7 (Q7 acrescentada em 2026-10-29, L-F07-01), parâmetros `$1 fromLower`, `$2 toUpper`, `$3 from::date`, `$4 to::date`, `$5 inspectorIds::text[] | NULL`:

```sql
-- Q1 · DONE atual (dois ramos, cada um com o seu índice)
-- Q1a: DONE com execução própria → EXECUTED
SELECT a.id AS appointment_id, a.inspector_id, a.tenant_id, 'CURRENT_DONE' AS origin,
       a.scheduled_date, a.time_slot_start, a.time_slot_end, t.timezone, st.default_duration_minutes,
       e.started_at, e.start_client_at, e.finished_at, e.resumed_at,
       e.out_of_window, e.out_of_radius, e.finish_out_of_radius,
       e.geolocation_distance_meters, e.finish_geolocation_distance_meters,
       e.start_accuracy_m, e.finish_accuracy_m, e.geofence_radius_m,
       ((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date AS service_date,
       NULL::timestamp AS done_rejected_at
FROM inspection_executions e
JOIN appointments a   ON a.id = e.appointment_id AND a.deleted_at IS NULL
                     AND a.status = 'DONE' AND a.inspector_id = e.inspector_id
JOIN tenants t        ON t.id = a.tenant_id
JOIN service_types st ON st.id = a.service_type_id
WHERE e.finished_at IS NOT NULL AND e.abandoned_at IS NULL
  AND e.finished_at >= $1 AND e.finished_at < $2
  AND ((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date BETWEEN $3 AND $4
  AND ($5::text[] IS NULL OR a.inspector_id = ANY($5::text[]))
UNION ALL
-- Q1b: DONE sem execução própria (sem execução, abandonada ou de outro inspetor) → DONE_WITHOUT_EXECUTION
SELECT a.id, a.inspector_id, a.tenant_id, 'CURRENT_DONE',
       a.scheduled_date, a.time_slot_start, a.time_slot_end, t.timezone, st.default_duration_minutes,
       NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
       a.scheduled_date, NULL
FROM appointments a
JOIN tenants t        ON t.id = a.tenant_id
JOIN service_types st ON st.id = a.service_type_id
WHERE a.deleted_at IS NULL AND a.status = 'DONE' AND a.inspector_id IS NOT NULL
  AND a.scheduled_date BETWEEN $3 AND $4
  AND NOT EXISTS (SELECT 1 FROM inspection_executions e
                  WHERE e.appointment_id = a.id AND e.inspector_id = a.inspector_id
                    AND e.abandoned_at IS NULL)   -- inclui execução reaberta ainda aberta: fica fora de Q1a e de Q1b
  AND ($5::text[] IS NULL OR a.inspector_id = ANY($5::text[]));

-- Q2 · DONE rejeitado depois (um fato por audit done_rejected)
SELECT a.id AS appointment_id, rel.released_inspector_id AS inspector_id, a.tenant_id, 'REJECTED_DONE' AS origin,
       a.scheduled_date, a.time_slot_start, a.time_slot_end, t.timezone, st.default_duration_minutes,
       e.started_at, e.start_client_at, e.finished_at, e.resumed_at,
       e.out_of_window, e.out_of_radius, e.finish_out_of_radius,
       e.geolocation_distance_meters, e.finish_geolocation_distance_meters,
       e.start_accuracy_m, e.finish_accuracy_m, e.geofence_radius_m,
       COALESCE(((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date,
                ((done_tr.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date) AS service_date,
       al.created_at AS done_rejected_at,
       ((al.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date AS rejected_on   -- L-F07-07
FROM audit_logs al
JOIN appointments a   ON a.id = al.entity_id AND a.deleted_at IS NULL
JOIN tenants t        ON t.id = a.tenant_id
JOIN service_types st ON st.id = a.service_type_id
JOIN LATERAL (                                   -- inspetor do DONE rejeitado
  SELECT s.metadata_json->>'releasedInspectorId' AS released_inspector_id,
         s.metadata_json->>'rejectionReasonCode' AS rejection_code          -- L-F07-04
  FROM audit_logs s
  WHERE s.entity_type = 'Appointment' AND s.entity_id = al.entity_id
    AND s.action = 'appointment.status_transition'
    AND s.before_json->>'status' = 'DONE' AND s.after_json->>'status' = 'REJECTED'
  ORDER BY abs(extract(epoch FROM s.created_at - al.created_at)) LIMIT 1
) rel ON rel.released_inspector_id IS NOT NULL AND rel.rejection_code = 'NOT_EXECUTED'
LEFT JOIN inspection_executions e
       ON e.appointment_id = a.id AND e.inspector_id = rel.released_inspector_id
      AND e.finished_at IS NOT NULL AND e.abandoned_at IS NULL
LEFT JOIN LATERAL (                              -- data do DONE quando não há execução própria
  SELECT d.created_at FROM audit_logs d
  WHERE d.entity_type = 'Appointment' AND d.entity_id = al.entity_id
    AND d.action = 'appointment.status_transition' AND d.after_json->>'status' = 'DONE'
    AND d.created_at <= al.created_at
  ORDER BY d.created_at DESC LIMIT 1
) done_tr ON true
WHERE al.action = 'appointment.done_rejected' AND al.created_at >= $1   -- fromLower, sem limite superior
  AND (
        COALESCE(((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date,
                 ((done_tr.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date) BETWEEN $3 AND $4
     OR ( -- rejeição tardia (L-F07-07): data da rejeição no período, > serviço + 30 dias
          ((al.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date BETWEEN $3 AND $4
      AND ((al.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date
          > COALESCE(((e.finished_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date,
                     ((done_tr.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date) + 30 )
      )
  AND ($5::text[] IS NULL OR rel.released_inspector_id = ANY($5::text[]));
-- build-service-facts marca lateRejection = (service_date fora de [$3,$4]); service_date dentro → fato normal.

-- Q3 · CANT_ATTEND
SELECT DISTINCT ON (fe.inspector_id, fe.appointment_id)
       fe.inspector_id, fe.appointment_id, fe.tenant_id, fe.created_at, fe.client_occurred_at,  -- aviso efetivo (L-F07-01)
       a.time_slot_start,
       a.scheduled_date, t.timezone, st.default_duration_minutes,
       ((fe.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date AS service_date
FROM inspector_field_events fe
JOIN appointments a ON a.id = fe.appointment_id AND a.deleted_at IS NULL
JOIN tenants t ON t.id = fe.tenant_id
JOIN service_types st ON st.id = a.service_type_id
WHERE fe.type = 'CANT_DO' AND fe.reason_code = 'CANT_ATTEND'
  AND fe.created_at >= $1 AND fe.created_at < $2
  AND ((fe.created_at AT TIME ZONE 'UTC') AT TIME ZONE t.timezone)::date BETWEEN $3 AND $4
  AND ($5::text[] IS NULL OR fe.inspector_id = ANY($5::text[]))
ORDER BY fe.inspector_id, fe.appointment_id, fe.created_at DESC;

-- Q4 · paradas do plano (peso + previsto), $1 = appointmentIds de Q1∪Q2∪Q3∪Q7
SELECT s.appointment_id, p.inspector_id, p.plan_date, s.travel_s, s.duration_minutes,
       s.published_eta, s.published_service_start_at
FROM day_plan_stops s JOIN day_plans p ON p.id = s.day_plan_id
WHERE s.appointment_id = ANY($1::text[]);

-- Q5 · pesquisas
SELECT appointment_id, inspector_id, rating FROM satisfaction_surveys WHERE appointment_id = ANY($1::text[]);

-- Q6 · avisos de atraso
SELECT appointment_id, inspector_id, created_at, client_occurred_at
FROM inspector_field_events WHERE type = 'LATE_NOTICE' AND appointment_id = ANY($1::text[]);

-- Q7 · no-show marcado pela OP (L-F07-01); roda junto com Q1–Q3 (antes de Q4)
SELECT a.id AS appointment_id, s.metadata_json->>'releasedInspectorId' AS inspector_id, a.tenant_id,
       a.scheduled_date, a.time_slot_start, a.time_slot_end, t.timezone, st.default_duration_minutes,
       a.scheduled_date AS service_date
FROM audit_logs s
JOIN appointments a   ON a.id = s.entity_id AND a.deleted_at IS NULL
JOIN tenants t        ON t.id = a.tenant_id
JOIN service_types st ON st.id = a.service_type_id
WHERE s.action = 'appointment.status_transition' AND s.entity_type = 'Appointment'
  AND s.created_at >= $1                                  -- pré-filtro (marcado depois do agendamento)
  AND s.before_json->>'status' = 'SCHEDULED' AND s.after_json->>'status' = 'REJECTED'
  AND s.metadata_json->>'rejectionReasonCode' = 'INSPECTOR_NO_SHOW'
  AND s.metadata_json->>'releasedInspectorId' IS NOT NULL
  AND a.scheduled_date BETWEEN $3 AND $4
  AND ($5::text[] IS NULL OR s.metadata_json->>'releasedInspectorId' = ANY($5::text[]));

-- inspectorCreatedOn (L-F07-05): `inspectors.created_at` entra no SELECT de Q1a/Q1b/Q2/Q3/Q7 via JOIN inspectors i ON i.id = <inspetor da linha>,
-- convertido em data civil Sydney no leitor (sem consulta extra).
```

- **`loadCompletedCounts({ from, to })`** (só quando a mediana não sai dos fatos carregados): os mesmos predicados de Q1a e Q1b (DONE atual), sem filtro de inspetor, agregados em memória por `inspector_id` (`Map<inspectorId, completedCount>`). É **uma** consulta (`UNION ALL` das duas bases, selecionando só `inspector_id`). Fica fora da contagem de 7 do job.
- Q4–Q6 rodam só quando Q1–Q3 e Q7 devolvem linhas; com 0 linhas o leitor devolve `[]` (as 7 consultas viram 4; o teste de contagem usa sempre um seed com linhas).
- Decimais (`Prisma.Decimal`) → `number` no leitor. Nenhuma coordenada é selecionada (D12).
- Q1a usa `inspection_executions_finished_at_idx`; Q1b usa `(scheduled_date, inspector_id)`; Q2 parte de `audit_logs(action)` (linhas `done_rejected` são raras) e faz as buscas laterais por `(entity_type, entity_id)`; Q3 usa `(type, created_at)`; Q4 `(appointment_id)`; Q5 o unique de `appointment_id`; Q6 `(appointment_id, type, created_at)`; Q7 combina `audit_logs(action)` e `(created_at)` (bitmap AND; `status_transition` não é rara, mas o pré-filtro `created_at ≥ fromLower` limita a ~30 dias de transições).
- **Falhas por métrica (L-F07-06):** `computeMetricFromFacts` devolve, além dos agregados, os fatos sem sucesso de cada métrica (`LATE`/`EARLY`/`NO_SHOW` na 1, `MISS` na 2, `STUCK` na 3, `rating ≤ 2` na 4, atraso sem aviso antecipado na 5, `CANT_ATTEND`/`NO_SHOW_REJECTED` na 6, `doneRejected` na 8; `VOLUME` sem lista) como `{ appointmentId, serviceDate, detail }`, ordenados por `serviceDate` desc e cortados em `RELIABILITY_FAILURES_MAX` (20); `failureCount` = total antes do corte. `detail` é gerado pela função pura (`metric-failures.ts`), com horas na hora de parede da agência, ≤ 80 caracteres: "Checked in 11:20, window 09:00–11:00, planned 10:50", "Check-in 420 m from the property (radius 300 m)", "Finished 7h 10m after check-in", "Rated 2 / 5", "Late without notice before 10:50", "Dropped: can't attend", "Rejected: inspector didn't attend", "Marked done without check-in", "Rejected after completion: not carried out". Nunca endereço, coordenada ou nome de agência (D12).

### Fórmula
- **Score:** `score = 100 × Σ_k W_k · r_k / Σ_k W_k`, somando só as métricas com `r_k ≠ null` e `W_k > 0`. `W_k` são os pesos inteiros (0–10) do `reliabilityIndex`.
- **Status:**
  - `volume < minimumVolume` → `INSUFFICIENT_VOLUME`, `score = null` (as métricas são calculadas mesmo assim, para o drawer);
  - `Σ W_k = 0` depois de tirar as nulas → `NO_WEIGHTED_DATA`, `score = null`;
  - senão `SCORED`.
- **Arredondamento** (P9): `rate` com 4 casas (`roundHalfUp(x, 4)`) só para guardar e exibir; o score usa as taxas **não arredondadas** e sai com `roundHalfUp(100 × x, 1)`, onde `roundHalfUp(v, d) = Math.round((v + Number.EPSILON) × 10^d) / 10^d` (para valores ≥ 0).

**Exemplos trabalhados** (fixtures dos testes 8, 8a e 9; Sydney; período `[2026-11-01, 2026-11-30]`; tolerância 15; pesos iguais; mínimo 10; sem override; duração 60 e sem plano, então `w = 60` em todos, salvo Ben e a parada L1 de Ana).

**População e referência (P11).** Os 6 inspetores dos exemplos formam a população inteira do período. `completedCount`: Ana 12, Ben 10, Carla 9, Dan 8, Eva 10, Fábio 9. Ordenado: 8, 9, 9, 10, 10, 12 → mediana = (9 + 10) / 2 = **9.5** = `volumeReference` de todos. Carla entra na mediana (tem DONE) mesmo sem volume para o ranking.

| Fixture | Serviços | Montagem | Taxas | Score |
|---|---|---|---|---|
| **Ana** | 12 `EXECUTED` DONE | 10 pontuais; 2 fora da janela e atrasados (slot 09:00–11:00): **L1** início 11:20, com parada de plano (`duration_minutes 60`, `travel_s 0`, `published_eta` 10:50, `published_service_start_at` 10:50, então 11:20 > 11:05 continua `LATE`) e `LATE_NOTICE` efetivo às 10:30 (< ETA 10:50, **antecipado**); **L2** início 11:40, sem plano, `LATE_NOTICE` às 09:20 (≥ início da janela 09:00, **não** antecipado); 1 check-in fora do raio com precisão 40; nenhum > 6 h; 4 pesquisas 5, 5, 4, 3 | P 10/12 = 0.8333 · G 11/12 = 0.9167 · S 1 · Sat (1+1+0.75+0.5)/4 = 0.8125 · LN 1/2 = 0.5 · CA 1 · V min(1, 12/9.5) = 1 · DR 1 | (0.8333+0.9167+1+0.8125+0.5+1+1+1)/8 = 7.0625/8 = 0.88281 → **88.3** |
| **Ana, `PUNCTUALITY: 3`** | idem | | idem | (3×0.83333 + 6.22917)/10 = 0.87292 → **87.3** |
| **Ana, `VOLUME: 0`** | idem | | idem | (7.0625 − 1)/7 = 0.86607 → **86.6** |
| **Ana, regra antiga** (contraprova) | idem, comparando o aviso de L1 com o início da janela | 10:30 ≥ 09:00 → não antecipado | LN 0/2 = 0 | o teste falha se `deadline` ignorar `published_eta` |
| **Ben** (normalização) | 10 `EXECUTED` | 8 ROUTINE (parada com `duration_minutes 30`, `travel_s 600` → w = 40), todos pontuais; 2 ENTRY (`duration_minutes 120`, `travel_s 1200` → w = 140), ambos atrasados e sem aviso; sem pesquisa | P = 8×40 / (8×40 + 2×140) = 320/600 = **0.5333** (sem peso: 0.8) · G, S, CA, DR 1 · Sat null · LN 0 · V 10/9.5 → 1 | (0.53333+1+1+0+1+1+1)/7 = 0.79048 → **79.0** |
| **Carla** | 9 `EXECUTED` | tudo bom | métricas calculadas | `INSUFFICIENT_VOLUME`, `null`; com mínimo 9 → `SCORED` |
| **Dan** | 7 `EXECUTED` + 1 `DONE_WITHOUT_EXECUTION` + 2 `CANT_ATTEND` (+ 1 `CANT_DO NO_ANSWER`, fora do universo) | os 7 pontuais, no raio, sem travar; sem pesquisa e sem atraso | P 7/10 = 0.7 · G 7/7 = 1 · S 7/7 = 1 · Sat null · LN null · CA 1 − 2/10 = 0.8 · V 8/9.5 = 0.8421 · DR 8/8 = 1 | (0.7+1+1+0.8+0.84211+1)/6 = 0.89035 → **89.0** |
| **Eva** | 10 `EXECUTED` | tudo bom, sem pesquisa e sem atraso | P, G, S, CA, DR = 1 · Sat null · LN null · V 10/9.5 → 1 | 6/6 → **100** |
| **Fábio** | 10 `EXECUTED`, 1 deles DONE → REJECTED (audit no período) | tudo bom | DR 1 − 1/10 = 0.9 · V 9/9.5 = 0.9474 · Sat, LN null · demais 1 | (1+1+1+1+0.94737+0.9)/6 = 0.97456 → **97.5** |
| **Ana com override 20** | idem Ana | `volumeReferenceOverride 20` | V 12/20 = 0.6 | (7.0625 − 1 + 0.6)/8 = 0.83281 → **83.3** |

Ranking resultante (TASK-F07-2): Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0; Carla em "Not enough data".

### Contratos
- **Interno (exportado para a TASK-F07-2 e a F08):**
  ```ts
  // apps/backend/src/modules/reliability/application/reliability-metrics.service.ts
  export interface InspectorReliabilityComputation {
    inspectorId: string;
    volume: number;
    completedCount: number;
    metrics: ReliabilityMetricResult[];          // sempre as 8, na ordem RELIABILITY_METRIC_KEYS
  }
  export interface ReliabilityComputationBatch {
    volumeReference: { value: number; source: 'MEDIAN' | 'OVERRIDE'; activeInspectors: number; periodDays: number }; // uma vez por chamada; override já escalado (L-F07-09)
    byInspector: Map<string, InspectorReliabilityComputation>;
  }
  export class ReliabilityMetricsService {
    computeMetric(metric: ReliabilityMetricKey, inspectorId: string, from: CivilDate, to: CivilDate): Promise<ReliabilityMetricResult>;
    computeAll(from: CivilDate, to: CivilDate, inspectorIds?: string[]): Promise<ReliabilityComputationBatch>;
    computeAllWith(tx: Prisma.TransactionClient, from, to, settings: ReliabilitySettingsInput): Promise<ReliabilityComputationBatch>; // usado pelo job (leitura dentro da transação, sem filtro)
  }
  // apps/backend/src/modules/reliability/domain/volume-reference.ts
  export function computeVolumeReference(completedCounts: number[], override: number | null, periodDays: number): { value: number; source: 'MEDIAN' | 'OVERRIDE'; activeInspectors: number; periodDays: number };
  // apps/backend/src/modules/reliability/domain/volume-prorata.ts (L-F07-05)
  export function activeDaysInPeriod(inspectorCreatedOn: CivilDate, from: CivilDate, to: CivilDate): number;
  // packages/shared/src/enums/reason-codes.ts (L-F07-01, L-F07-04)
  export function allowedRejectionCodesFrom(fromStatus: AppointmentStatus): RejectionReasonCode[];
  // apps/backend/src/modules/reliability/domain/score.ts
  export function computeReliabilityScore(metrics: ReliabilityMetricResult[], settings: ReliabilityIndexSetting, volume: number): { status: ReliabilityScoreStatus; score: number | null };
  ```
  `CivilDate` = `string` `YYYY-MM-DD`. `ReliabilitySettingsInput = { reliabilityIndex: ReliabilityIndexSetting; toleranceMinutes: number }`.
- **HTTP:** nenhum endpoint novo nesta tarefa. A chave `reliabilityIndex` já fica legível e gravável pelos endpoints genéricos da F03 (`GET/PUT /v1/platform-settings/:key`, AM/OP), e o recálculo ao salvar é da TASK-F07-2.
- **Transição de status (endpoint existente, L-F07-01/04):** `rejectionReasonCode` aceita `INSPECTOR_NO_SHOW` e `NOT_EXECUTED`; erro novo 422 `{ error: { code: 'REJECTION_CODE_NOT_ALLOWED', message: "This rejection reason can't be used from the current status", details: { fromStatus, rejectionReasonCode } } }`. O audit `appointment.status_transition` para REJECTED passa a trazer `metadata.rejectionReasonCode`.

### UI
Nenhuma nesta tarefa.

### Casos de borda
- **No-show sem linha de execução:** só vira falha de pontualidade como `DONE_WITHOUT_EXECUTION`, `CANT_ATTEND` (sem aviso de 24 h) ou `NO_SHOW_REJECTED` (D10, L-F07-01). Um SCHEDULED que nunca começou e ainda não teve desfecho não entra.
- **Inspetor que não aparece e não avisa (L-F07-01):** a OP rejeita com `INSPECTOR_NO_SHOW` e ele recebe a falha nas métricas 1 e 6. Se a OP usar `OTHER`, nada é contado (o teste documenta a contraprova); o rótulo do código no dialog orienta a escolha.
- **`CANT_ATTEND` com antecedência (L-F07-01):** aviso ≥ 24 h antes do início da janela não é no-show (sai da 1), mas continua falta na 6. Aviso com horário do cliente implausível usa `created_at` (`resolveEffectiveEventTime`).
- **`INSPECTOR_NO_SHOW` reofertado e concluído pelo mesmo inspetor:** o no-show continua (fato separado do DONE).
- **Correção administrativa de DONE (L-F07-04):** `DONE → DRAFT` ou `DONE → REJECTED` com código ≠ `NOT_EXECUTED` → aquele DONE não conta para ninguém (nem volume, nem métrica 8).
- **Rejeição tardia (L-F07-07):** `NOT_EXECUTED` mais de 30 dias depois do serviço → entra pela data da rejeição só na métrica 8; nunca duplica num mesmo período.
- **Satisfação com poucas respostas (L-F07-03):** abaixo de `minimumRatings` a métrica é `null` e o score renormaliza; o drawer mostra quantas faltam.
- **Inspetor recém-cadastrado (L-F07-05):** referência de volume proporcional aos dias desde o cadastro; licença/pausa/reativação **não** é proporcional (limitação documentada em Achados).
- **Override em período ≠ 30 dias (L-F07-09):** escalado por `periodDays / 30`; meta semanal com override 20 usa 4,5.
- **Mais de 20 falhas numa métrica (L-F07-06):** a lista guarda as 20 mais recentes; `failureCount` diz o total.
- **REJECTED pelo T-1** (`TENANT_NO_RESPONSE`) ou pelo inquilino (`TENANT_DECLINED`): fora do universo, mesmo com o inspetor atribuído antes (o bloco 7c já o soltou).
- **Execução abandonada** (`abandoned_at`): não conta para ninguém. Se o motivo foi `CANT_ATTEND`, entra como `CANT_ATTEND` (pelo evento, não pela execução).
- **Execução reiniciada:** vale para o inspetor do reinício, com `started_at`, flags e precisões do reinício; o inspetor anterior só aparece se largou com `CANT_ATTEND`.
- **Execução reaberta pela OP** (`resumed_at`): enquanto aberta, fora do universo; depois de finalizada, entra, mas sai da métrica 3.
- **Pré-F03:** execuções com `geofence_radius_m` nulo ficam fora das métricas 1 e 2 (o `out_of_window`/`out_of_radius` delas é o default `false`) e continuam no volume. Pós-F03 o raio é sempre gravado (F03 D24), então o nulo não aparece por falta de coordenadas, fallback ou reinício (R1).
- **Sincronização tardia (R1, F03 D25):** check-in offline com horário do cliente fora de −7 dias / +5 min chega com `out_of_window = false` → `PUNCTUAL`; sem evidência, não penaliza.
- **Sem plano (pré-F04 ou sem roteiro):** peso = duração do tipo; sem "previsto", então pontualidade só pela janela.
- **Virada de dia no fuso:** a data do serviço é sempre a civil da agência (teste 12).
- **DST:** `zonedWallTimeToUtc` resolve janelas em dias de 23/25 h; o pré-filtro de ±1/+2 dias cobre o deslocamento.
- **Audit perdido** (fire-and-forget): um DONE rejeitado sem os audits não gera fato. Sem eles não há como saber o inspetor do DONE, e nada é chutado.
- **Reoferta depois de DONE → REJECTED:** o novo inspetor fica bloqueado no check-in pela execução única (`ExecutionAlreadyFinishedError`), e o DONE dele vem da OP. Ele recebe `DONE_WITHOUT_EXECUTION` (`NO_SHOW` na pontualidade) por uma limitação do sistema, não por falha dele (Achados).
- **Inspetor apagado** (`deleted_at`): seus fatos são lidos normalmente; o filtro de quem aparece é da TASK-F07-2.
- **Período fora da janela de 30 dias** (F08): funciona; não há limite de tamanho de período nesta camada (a F08 limita o próprio período). A mediana do VOLUME é a do período pedido (os ativos naquele período).
- **Mediana:**
  - poucos inspetores ativos (1 ou 2) → a referência fica igual ao volume deles, e eles ganham `VOLUME = 1`;
  - ninguém ativo → referência 1 (piso), `VOLUME = 0` para todos;
  - inspetores INACTIVE ou apagados com DONE no período entram na mediana (regra "ativo = ≥ 1 DONE").
- **Aviso antecipado:**
  - parada com `published_eta` nulo (entrou no plano já iniciada) → limite = início da janela;
  - o plano recalculado não muda o `published_eta` (é congelado), então o limite não se move depois da publicação.

### Fora do escopo
- Snapshot, job, API e UI (TASK-F07-2/3).
- Alterar `prisma-inspector-rating.reader.ts`, `getPerformanceRows` ou o relatório PERFORMANCE (fora do escopo do plano: coluna do índice no relatório).
- Detecção de fraude; "dificuldade do imóvel".
- Tornar o fator de deslocamento configurável (P7).

### Critérios de aceite (03.A1)
- A fórmula segue os pesos configurados: teste 9 (Ana 88.3 → 87.3 com `PUNCTUALITY: 3`; 86.6 com `VOLUME: 0`; 83.3 com override 20).
- O aviso antecipado usa a ETA publicada da parada, com fallback no início da janela (teste 7 e contraprova de Ana).
- A referência de volume é a mediana dos ativos, com piso 1 (teste 8a).
- Cada uma das 8 métricas tem definição única, testada pelos exemplos trabalhados.
- `computeMetric` aceita qualquer período civil (teste 11), em uma passada para todos os inspetores (teste 12, contagem de consultas).
- `INSPECTOR_NO_SHOW` penaliza nas métricas 1 e 6; `CANT_ATTEND` com ≥ 24 h de antecedência sai da 1 (testes 1b, 4, 8, 9, 12; L-F07-01).
- Só `NOT_EXECUTED` penaliza na métrica 8; outro código tira o DONE do universo (testes 8, 12; L-F07-04).
- `SATISFACTION` abaixo de `minimumRatings` é `null` (testes 2, 8, 9; L-F07-03).
- `VOLUME` proporcional a `activeDays`; override escalado pelo período (testes 8a, 8b, 11; L-F07-05, L-F07-09).
- Rejeição `NOT_EXECUTED` tardia conta na métrica 8 do período da rejeição, sem duplicar (testes 8, 12; L-F07-07).
- Cada métrica traz até 20 `failures` com `detail` sem dado de localização (teste 8c; L-F07-06).

### Dependências
- TASK-F03-1 (settings, flags, `resolveEffectiveEventTime`), TASK-F03-2 (`inspector_field_events`, `abandoned_at`), TASK-F04-1 (`default_duration_minutes`), TASK-F04-2 (`day_plans`/`day_plan_stops` com `published_service_start_at`). Todas mergeadas antes.

### Riscos e armadilhas
- **`inspector_id` nulo depois de REJECTED/CANCELLED.** Qualquer consulta que atribua por `appointments.inspector_id` perde DONE → REJECTED e `CANT_ATTEND`. Testes 10 e 12 travam isso.
- **Audit por tipo de ação:** a Q2 depende de `audit_logs(action)` e de as linhas `appointment.done_rejected` serem raras. Se em produção elas passarem de alguns milhares por mês, medir de novo e considerar um índice composto. Hoje não é necessário.
- **Atribuição do DONE:** atribuir pela linha de execução credita o inspetor errado depois de uma reoferta (execução única). O teste 12 trava a regra.
- **`$queryRaw` e bigint/Decimal:** `COUNT(*)` vem como bigint; esta tarefa não faz contagem em SQL (conta em memória). Decimais convertidos no leitor.
- **Fuso no teste:** fixar `TZ` fora de Sydney; todos os instantes do seed em UTC explícito.
- **Drift do Prisma** pode tentar derrubar índices `Unsupported()` ao gerar a migration: revisar o SQL gerado.
- **Ambiguidade do "previsto":** a parada vem do plano do mesmo inspetor na data agendada. Reagendado para outra data sem plano novo → sem previsto (só janela).
- **Códigos novos de rejeição (L-F07-01/04):** todo lugar que lista ou rotula `RejectionReasonCode` (rótulos do shared, `StatusTransitionDialog`, rótulos de e-mail/portal da F03) precisa conhecer os dois códigos; o `reasonCodeLabel` do shared tem fallback, mas a contagem em `reason-codes.test.ts` e as listas filtradas por origem devem ser atualizadas no mesmo PR.
- **Código só no metadata a partir da F07:** linhas de `status_transition` anteriores não têm `rejectionReasonCode`; por isso nenhuma rejeição antiga penaliza na métrica 8 (decisão consciente: antes não havia como distinguir correção de não execução).
- **Q7 sobre `status_transition`:** é a ação mais frequente do audit. Se a Q7 passar de 1 s em staging, avaliar índice parcial `ON audit_logs (created_at) WHERE action = 'appointment.status_transition'` (fora do escopo agora).

### Deploy / rollout / rollback
- **Deploy:** migration expand (1 índice em `inspection_executions`) em staging, depois prod. A tabela é moderada; `CREATE INDEX` simples.
- **Rollout:** sem efeito visível (nenhum endpoint, nenhum job). A chave `reliabilityIndex` aparece no `GET /v1/platform-settings` com os defaults (inclui `minimumRatings 3`). A API de transição já aceita `INSPECTOR_NO_SHOW`/`NOT_EXECUTED` e já grava `metadata.rejectionReasonCode`; a opção aparece no dialog só com a TASK-F07-3. Avisar a OP/AM (nota de release) que, a partir daí, "Inspector didn't attend" penaliza o inspetor e que só "Inspection was not actually carried out" penaliza um `DONE → REJECTED`.
- **Rollback:** reverter o código; o índice pode ficar (inofensivo) ou ser removido com `DROP INDEX`. Linhas com `rejection_reason_code` novo ficam no banco; o shared antigo não conhece o valor e o `reasonCodeLabel` cai no fallback (texto do código). Aceitável; se a OP já usa os códigos, migrar essas linhas para `OTHER` antes de reverter.

### Dias · Branch · Verificação
- **Dias:** 3,875 = 03.4b 2,0 (8 métricas, leitor de fatos, atribuição) + 03.5 0,5 (peso por duração + deslocamento, junção com o plano) + 03.A1 0,25 (chave `reliabilityIndex` e fórmula com pesos) + lacunas 1,125 (abaixo).
  - **Sem delta pelas decisões de 2026-10-28.** A mediana é uma função pura sobre contagens que os fatos já trazem, mais uma consulta (`loadCompletedCounts`) que repete predicados existentes. Ela troca a referência fixa, que também precisava de chave, validação e teste.
  - O limite pela ETA publicada só acrescenta uma coluna à consulta Q4, que já existia.
  - **Revisão de 2026-10-28.** A atribuição por ocorrência de DONE (Q1 em dois ramos, Q2 com pareamento de audits, teste de reoferta) troca a Q1/Q2 anteriores e a regra de precedência por um custo equivalente. Saiu a migration do índice de `audit_logs`. Saldo zero.
  - **Lacunas de 2026-10-29: +1,125 → 3,875.** L-F07-01 0,25 (códigos no shared, guarda por transição e `metadata.rejectionReasonCode` no use case de transição, Q7, regra do `CANT_ATTEND` antecipado); L-F07-03 0,125 (`minimumRatings` no schema e na métrica 4); L-F07-04 0,125 (filtro por `NOT_EXECUTED` na Q2); L-F07-05 0,125 (`activeDays`, `created_at` nas consultas); L-F07-06 0,25 (`failures` e textos `detail` por métrica); L-F07-07 0,125 (ramo tardio na Q2 + regra de não duplicar); L-F07-09 0,125 (override escalado, `periodDays` no batch).
- **Branch:** `feat/f07-reliability-metrics` a partir de `develop`, em worktree. ~32 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `pnpm --filter backend test:integration:db` (teste 12) via subagente com resumo; `pnpm --filter backend generate:openapi` + `pnpm --filter @properfy/shared generate:types` sem diff em `packages/shared/src/api-types.ts` (a chave nova só muda o schema do setting, se ele for tipado no OpenAPI); `git diff --stat origin/develop... | tail -1` < 150.

---

## TASK-F07-2 · Backend + shared: snapshot diário, recálculo ao salvar os pesos e API AM/OP

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F07-1
> - **Desbloqueia:** TASK-F07-3, TASK-F08-1
> - **Pode rodar em paralelo com:** TASK-F05-1, TASK-F06-2, TASK-F04-4
> - **Pista sugerida (time de 6):** A · Backend crítico · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Criar `InspectorReliabilitySnapshot` (um registro por inspetor e data, sem `tenant_id`), com o histórico diário disponível para a F08.
- Criar o job de plataforma `reliability.compute-snapshots`: diário às **04:15 Sydney**, idempotente, uma passada para todos os inspetores, serializado por advisory lock.
- Fazer o **backfill no deploy** (snapshot de hoje, se não existir) e o **recálculo ao salvar** a chave `reliabilityIndex` (03.A1).
- Expor a API AM/OP: ranking atual (com o bloco "Not enough data") e detalhe das 8 métricas de um inspetor.

### Contexto no código
- **Workers:** `apps/backend/src/main/workers.ts`: `withJobMetrics` (`:34`), `SYDNEY_TZ = { tz: PLATFORM_TIMEZONE }` (`:56`, comentário sobre a hora pulada no DST às 02:00), `boss.schedule(name, cron, {}, SYDNEY_TZ)` + `boss.work(name, withJobMetrics(...))`, horários já ocupados de madrugada: `auth.cleanup-sessions 02:00`, `auth.check-key-expiry 03:00`, `report.expire-files 03:00`, `audit.retention 03:30`, `day-plan.purge-route-data 03:45` (F04). Log final com a lista de filas (`:362`). Precedente de trabalho no startup: re-enfileirar geocodificação (`:364-384`). pg-boss **9** (`apps/backend/package.json:53`).
- **Fila:** `IJobQueue.enqueue(jobName, payload, options)` (`apps/backend/src/shared/domain/job-queue.ts`); `PgBossJobQueue` devolve no-op silencioso (só `console.warn`) quando o `singletonKey` colide com um job **ativo** (`apps/backend/src/shared/infrastructure/pgboss-job-queue.ts:18-25`). Por isso o recálculo **não** usa `singletonKey` (um salvamento durante o job diário seria perdido).
- **Advisory lock:** precedente `tx.$executeRaw\`SELECT pg_advisory_xact_lock(72019842)\`` (`apps/backend/src/scripts/provision-admin.ts:71`). O app usa PgBouncer; lock de sessão não funciona, só o de transação.
- **Eventos:** `domainEventBus.subscribe(type, handler)` e `emit(event)` (`apps/backend/src/shared/application/events/domain-event-bus.ts:12,18`); registro de subscribers em `apps/backend/src/main/container.ts:1310-1325`.
- **Settings (F03):** `UpdatePlatformSettingUseCase` (`apps/backend/src/modules/platform-settings/application/use-cases/update-platform-setting.use-case.ts`) grava, invalida o cache **local**, audita `platform_setting.updated` e, desde a F03 (D29, L-F03-10), **emite** `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'` após o commit, payload `{ key, before, after, actorId, occurredAt }`, com `Promise.allSettled` (subscriber que falha não falha o `PUT`). É o único caminho de gravação dos pesos; a F07 só assina o evento (R1). `PlatformSettingsService.get` tem cache de 30 s **por instância**: o worker em outra máquina pode ler o valor antigo durante até 30 s. `DomainEvent` exige `{ type, payload, occurredAt: Date }` (`domain-event-bus.ts:1-5`).
- **RBAC:** `AuthorizationService.assertRoles(actor, roles, context)` audita `authorization.denied` e lança `ForbiddenError('FORBIDDEN')` (`apps/backend/src/shared/domain/authorization.service.ts:32`); matriz `ROLE_ACTION_MATRIX` (`packages/shared/src/permissions/role-matrix.ts:25`). Precedente de tela AM/OP cross-tenant: `WORKLOAD_ROLES = ['AM','OP']` (`apps/backend/src/modules/dashboard/application/use-cases/get-inspector-workload.use-case.ts:15`) e a rota `GET /v1/dashboard/inspector-workload` (`apps/backend/src/modules/dashboard/interfaces/dashboard.routes.ts:113-135`: `preHandler: authenticate`, `schema.querystring`, `response: { 200: successResponseSchema(...) }`, `success(result)`).
- **Response schema** remove campos não declarados (memória `project_response_schema_strips_undeclared_fields`); todo campo da resposta precisa estar no Zod.
- **Inspetor:** `inspectors.status` (`ACTIVE`/`INACTIVE`), `deleted_at`, `name` (`schema.prisma:467-508`).
- **TASK-F07-1:** `ReliabilityMetricsService.computeAllWith`, `computeReliabilityScore`, `reliabilityMetricResultSchema`, `RELIABILITY_WINDOW_DAYS`.
- **DLQ (L-F07-02):** `apps/backend/src/shared/infrastructure/dlq-monitor.ts:24,44` alerta (`logger.error`) só quando uma fila tem **≥ 10** jobs `failed`; abaixo disso só `logger.warn`. Retry global `retryLimit: 6`, `retryBackoff: true` (`queue.ts:115-116`). Um job diário que esgota as tentativas vira **1** linha `failed`, sem alerta.
- **Retenção (L-F07-12):** precedente de política em `apps/backend/src/modules/audit/domain/audit-retention.ts`.
- **Settings (L-F07-10):** `platform_settings.updated_at` da chave `reliabilityIndex` (F03) é a referência de "quando os pesos mudaram".

### Decisões aplicáveis
D2, D3, D4, D7, D9, D12 (2026-10-27); P5, P8, P9, P11 (dev, 2026-10-28); R1, R2, R3 (reconciliação, 2026-10-29).

- **2026-10-29 · R1 (L-F03-10):** o recálculo assina o `platform_setting.updated.v1` que a F03 já emite; esta tarefa **não** altera `update-platform-setting.use-case.ts` nem declara `PLATFORM_SETTING_EVENTS` (só importa). O subscriber lê `payload.key` e o `occurredAt` do evento; `before`/`after`/`actorId` não são usados.
- **2026-10-29 · R2 (L-F08-07):** `position` (ranking, detalhe e `ReliabilityIndexReader.getCurrentIndexes`) é o ranking de competição da **plataforma inteira** (todos os ACTIVE com `SCORED` do snapshot), nunca recortado por região, tipo de serviço ou agência; a F08 depende disso (03.A3).
- **2026-10-29 · R3 (N13):** `snapshot_date`, janela do snapshot, "hoje" do `isStale`/expurgo e crons em `PLATFORM_TIMEZONE`; `computed_at`/`settingsUpdatedAt` instantes UTC (tabela "Fuso de cada campo de data").

**Lacunas (dev, 2026-10-29):**
- **2026-10-29 · L-F07-02 (L2):** (1) toda falha do job loga `logger.error('reliability.snapshots_failed', { snapshotDate, trigger, reason, attempt })` (não só o TIMEOUT); (2) job `reliability.ensure-today` com cron `'0 5-12 * * *'` Sydney, sem `singletonKey`, que roda o `EnsureTodaySnapshotUseCase` (idempotente pela existência da linha do dia + lock); (3) a API devolve `isStale = snapshotDate < hoje (Sydney)`; (4) o contrato exportado diz que `snapshotDate` pode ser anterior a hoje. O limiar do `dlq-monitor` **não** muda (infra compartilhada).
- **2026-10-29 · L-F07-06 (L6):** `metrics_json` guarda `failures`/`failureCount` (shape da TASK-F07-1); a API os devolve no detalhe; o teste de privacidade cobre o cap de 20 e a ausência de coordenadas.
- **2026-10-29 · L-F07-08 (L8):** `getCurrentIndexes` documenta que `snapshotDate` pode ser anterior a hoje; o consumidor decide (a F08 grava `index_snapshot_date` no fechamento).
- **2026-10-29 · L-F07-10 (L10):** ranking e detalhe devolvem `settingsUpdatedAt` (`platform_settings.updated_at` de `reliabilityIndex`, ou `null`); o `ensure-today` horário loga `logger.error('reliability.recompute_overdue', { settingsUpdatedAt, computedAt })` quando `settingsUpdatedAt > computedAt + 15 min` e enfileira um recálculo `SETTINGS_CHANGED`.
- **2026-10-29 · L-F07-12 (L12):** `RELIABILITY_SNAPSHOT_RETENTION_DAYS = 400`. O job diário (`trigger 'SCHEDULED'`), na mesma transação, apaga `snapshot_date < hoje − 400` e todas as linhas de inspetores com `deleted_at` não nulo; log `reliability.snapshots_purged { count, deletedInspectors }`.

### Testes primeiro (TDD)

**1. Domínio — `apps/backend/src/modules/reliability/domain/snapshot-window.test.ts`**
- `snapshotWindow('2026-12-01')` → `{ from: '2026-11-01', to: '2026-11-30' }` (30 dias completos até ontem).
- `snapshotWindow('2026-03-01')` → `{ from: '2026-01-30', to: '2026-02-28' }`.
- `snapshotDateFor(now)` com `now = 2026-11-30T13:30:00Z` → `'2026-12-01'` (Sydney AEDT), mesmo com `TZ=America/Los_Angeles`.

**2. Domínio — `ranking.test.ts`** (`rankSnapshots(rows)`; só `SCORED` e ACTIVE entram)
- scores 100 (Eva), 97.5 (Fábio), 89.0 (Dan), 88.3 (Ana), 79.0 (Ben) → posições 1, 2, 3, 4, 5.
- empate: Fábio 97.5 e "Bia" 97.5 → ambos posição 2, ordem por nome (Bia, Fábio), Dan passa a 4 (ranking de competição "1, 2, 2, 4").
- `INSUFFICIENT_VOLUME`/`NO_WEIGHTED_DATA` → lista `notEnoughData`, ordenada por volume desc e depois nome.
- inspetor ACTIVE sem linha no snapshot (criado depois do cálculo) → `notEnoughData` com `volume 0`, `status 'INSUFFICIENT_VOLUME'`.
- INACTIVE → nem ranking nem `notEnoughData`.
- (R2, L-F08-07) inspetores de regiões de atendimento diferentes (Eva e Dan numa região, Fábio, Ana e Ben em outra) → posições 1–5 numa só lista; `rankSnapshots` não recebe nem usa região.

**2a. Aplicação — `reliability-index.reader.test.ts`** (R2, L-F08-07)
- `getCurrentIndexes(['ana'])` → `position 4` (a mesma do ranking completo de 5), não `1`: o filtro por `inspectorIds` só recorta a saída, a posição é calculada sobre todos os ACTIVE com `SCORED` do último snapshot.
- `getCurrentIndexes()` → mesmas posições de `rankSnapshots` para todos; Carla `position null`, `status 'INSUFFICIENT_VOLUME'`; inspetor sem linha → `status 'NOT_COMPUTED'`, `snapshotDate` = última data.

**3. Aplicação — `compute-reliability-snapshots.use-case.test.ts`** (repositórios fake, relógio injetado em `2026-12-01T17:15:00Z` = 2026-12-02 04:15 AEDT)
- grava uma linha por inspetor não apagado (ACTIVE e INACTIVE), com `snapshot_date '2026-12-02'`, `window_from '2026-11-02'`, `window_to '2026-12-01'`, `window_days 30`, `trigger 'SCHEDULED'`, `settings_json` = valores usados (`weights`, `minimumVolume`, `minimumRatings` (L-F07-03), `toleranceMinutes`, `volumeReference { value, source, activeInspectors, periodDays }`), `metrics_json` com as 8 métricas.
- **mediana única por execução:** com os inspetores dos exemplos, todas as linhas do dia têm `settings_json.volumeReference.value = 9.5`; o serviço de métricas é chamado **1 vez** (`computeAllWith` sem filtro), nunca por inspetor.
- dia seguinte com outra população (Ana 12, Eva 4 DONE) → `volumeReference.value 8` naquele dia; o snapshot do dia anterior mantém `9.5` (a mediana é do dia e não se aplica para trás).
- inspetor sem serviço → `volume 0`, `status 'INSUFFICIENT_VOLUME'`, `score null`, métricas com `rate null` (VOLUME `0`).
- rodar 2× → mesmo conteúdo, mesma quantidade de linhas (substitui as do dia; `computed_at` da segunda).
- lê `reliabilityIndex` e `fieldEvents` pelo `IPlatformSettingsReader.get` existente (F03), **depois** de pegar o lock.
- devolve `{ snapshotDate, inspectors, scored, insufficient, durationMs }` e loga `reliability.snapshots_computed { snapshotDate, trigger, inspectors, scored, insufficient, durationMs }` (sem nomes, sem coordenadas).
- falha no leitor → rollback: nenhuma linha alterada; erro propagado (o pg-boss refaz).
- (L-F07-02) falha no leitor com `job.retryCount 2` → `logger.error('reliability.snapshots_failed', { snapshotDate: '2026-12-02', trigger: 'SCHEDULED', reason: 'Error: boom', attempt: 3 })` antes de relançar; timeout → `reason 'TIMEOUT'`.
- (L-F07-06) `metrics_json` de Ana traz `failures` (PUNCTUALITY com 2 itens) e `failureCount`.
- (L-F07-12) `trigger 'SCHEDULED'`, hoje `2026-12-02`: linhas com `snapshot_date '2025-10-27'` (401 dias) apagadas, `'2025-10-28'` (400 dias) mantidas; todas as linhas do inspetor com `deleted_at` preenchido apagadas (inclusive as de dias recentes); log `reliability.snapshots_purged { count, deletedInspectors }`. `trigger 'SETTINGS_CHANGED'`/`'BACKFILL'` → sem expurgo.
- (L-F07-12) inspetores apagados não ganham linha nova (já era a regra) e, depois do expurgo, não aparecem em nenhum `snapshot_date`.

**3a. Aplicação — `ensure-today-snapshot.use-case.test.ts`** (L-F07-02, L-F07-10; relógio injetado)

| Caso | Estado | Esperado |
|---|---|---|
| sem linha de hoje | último snapshot `2026-12-01`, agora `2026-12-02 05:00` Sydney | enfileira `{ trigger: 'BACKFILL' }` 1 vez; devolve `'ENQUEUED_MISSING'` |
| com linha de hoje, pesos sem mudança | `computedAt` 04:16, `settingsUpdatedAt` ontem | nada; `'UP_TO_DATE'` |
| pesos mudados há 10 min, sem recálculo | `settingsUpdatedAt` 06:50, `computedAt` 04:16, agora 07:00 | nada (ainda dentro de 15 min); `'PENDING'` |
| pesos mudados há 20 min, sem recálculo | `settingsUpdatedAt` 06:40, agora 07:00 | `logger.error('reliability.recompute_overdue', { settingsUpdatedAt, computedAt })` + enfileira `{ trigger: 'SETTINGS_CHANGED' }`; `'ENQUEUED_OVERDUE'` |
| chamado 2× ao mesmo tempo | sem linha de hoje | até 2 jobs; o lock e a idempotência do compute resolvem (sem erro) |

**4. Aplicação — `recompute-reliability-on-settings-change.subscriber.test.ts`**
- evento `platform_setting.updated.v1` no shape da F03 (`payload { key: 'reliabilityIndex', before, after, actorId, occurredAt }`) e `occurredAt` T → `jobQueue.enqueue('reliability.compute-snapshots', { trigger: 'SETTINGS_CHANGED' }, { startAfter: T + 35 s, retryLimit: 3, retryBackoff: true, expireInMinutes: 15 })`, **sem** `singletonKey`.
- qualquer outra chave (`fieldEvents`, `routeWeights`, `liveDayAlerts`) → nada. O plano só pede recálculo ao salvar os **pesos** (03.A1); mudanças de `fieldEvents` entram no job diário seguinte.
- falha no enqueue → `logger.error` e não lança (o save já foi gravado; o job diário corrige).

**5. (removido na reconciliação de 2026-10-29, R1)** O teste de emissão do evento é da F03 (TASK-F03-1, L-F03-10). Esta tarefa não altera `update-platform-setting.use-case.test.ts`; a cobertura ponta a ponta fica no teste 8 (`PUT` → evento da F03 → job).

**6. Aplicação — `get-reliability-ranking.use-case.test.ts` e `get-inspector-reliability.use-case.test.ts`**
- AM e OP → ok; CL_ADMIN, CL_USER (com qualquer flag), INSP → `ForbiddenError('FORBIDDEN')` com audit `authorization.denied` (`attemptedAction 'reliability.view'`) e **nenhuma** leitura de repositório.
- ranking sem nenhum snapshot ainda → `{ snapshotDate: null, windowFrom: null, windowTo: null, computedAt: null, isStale: false, settingsUpdatedAt: null, minimumVolume: 10 (setting atual), ranked: [], notEnoughData: [] }`.
- (L-F07-02) relógio `2026-12-02 09:00` Sydney e último snapshot `2026-12-01` → `isStale true`; snapshot `2026-12-02` → `isStale false`; relógio `2026-12-02 03:00` (antes do job) com snapshot `2026-12-01` → `isStale true` (regra simples `snapshotDate < hoje`; a página só mostra o banner a partir das 05:00, ver TASK-F07-3).
- (L-F07-10) `platform_settings.updated_at` de `reliabilityIndex` = `2026-12-02T00:40:00Z` → `settingsUpdatedAt` igual, no ranking e no detalhe; chave nunca gravada → `null`.
- (L-F07-06) detalhe de Ana → cada métrica com `failures` e `failureCount` vindos do `metrics_json` (não recalculados).
- ranking usa a **última** `snapshot_date` existente e o `minimumVolume` do `settings_json` daquele snapshot.
- ranking traz `volumeReference 9.5` e `volumeReferenceSource 'MEDIAN'` do `settings_json`.
- detalhe de Ana → 8 métricas na ordem canônica com `weight` do `settings_json`, `score 88.3`, `position 4`, `rankedCount 5`, `volumeReference 9.5`.
- detalhe de Carla → `status 'INSUFFICIENT_VOLUME'`, `score null`, `position null`, métricas preenchidas.
- detalhe de inspetor sem linha no último snapshot → `status 'NOT_COMPUTED'`, `score null`, `metrics []`, `volume 0`.
- detalhe de inspetor INACTIVE com linha → devolve (com `position null`).
- inspetor inexistente ou apagado → `NotFoundError('INSPECTOR_NOT_FOUND')`.

**7. HTTP — `apps/backend/tests/integration/reliability/reliability.routes.test.ts`** (Supertest)
- `GET /v1/dashboard/inspector-performance` sem token → 401; CL_ADMIN/CL_USER/INSP → 403 `{ error: { code: 'FORBIDDEN' } }`; AM/OP → 200 `success(...)`.
- `GET /v1/dashboard/inspector-performance/not-a-uuid` → 400 `VALIDATION_ERROR`; id desconhecido → 404 `INSPECTOR_NOT_FOUND`.
- **contrato de privacidade:** o corpo serializado não contém as chaves `latitude`, `longitude`, `lat`, `lng`, `email`, `phone` em nenhum nível (varredura recursiva); (L-F07-06) nenhuma métrica tem mais de 20 `failures`, todo `detail` tem ≤ 80 caracteres e nenhum `detail` casa com `/-?\d{1,3}\.\d{4,}/` (coordenada) nem contém o endereço do imóvel do seed.
- **contrato de schema:** todos os campos esperados presentes depois da serialização (o response schema não removeu nada).

**8. Integração com banco — `apps/backend/tests/integration/db/reliability-snapshots.db.test.ts`** (Testcontainers)
- seed dos exemplos Ana, Ben, Carla, Dan, Eva, Fábio (TASK-F07-1; inclui a parada L1 de Ana com `published_eta` 10:50) com datas em novembro/2026 → rodar o job para `2026-12-01` → `volumeReference 9.5`; ranking `[Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0]`; `notEnoughData [Carla 9]`.
- **03.A1 ponta a ponta:** `PUT /v1/platform-settings/reliabilityIndex` (AM) com `PUNCTUALITY: 3` → evento `platform_setting.updated.v1` emitido pelo use case da F03 (sem alteração nele) → job enfileirado → executar o handler do job → Ana `87.3` no snapshot de `2026-12-01`; audit `platform_setting.updated` com `actorId` do AM.
- **override:** `PUT` com `volumeReferenceOverride: 20` → depois do job, Ana `83.3`, `volumeReference { value: 20, source: 'OVERRIDE' }`; `PUT` de volta para `null` → `9.5`, `MEDIAN`.
- **serialização:** duas execuções concorrentes do use case (`Promise.all`), a primeira com settings antigos lidos antes do save e a segunda depois → as duas terminam; o estado final tem os pesos novos (a segunda espera o lock e lê os settings dentro da transação). O teste falha se o `pg_advisory_xact_lock` for removido (memória `feedback_concurrency_test_must_fail_without_guard`).
- **idempotência:** rodar 3× no mesmo dia → `SELECT count(*) FROM inspector_reliability_snapshots WHERE snapshot_date = '2026-12-01'` = número de inspetores.
- **desempenho:** 200 inspetores × 30 serviços → o job termina em < 15 s no container de teste e faz um número de consultas igual ao de 1 inspetor + 2 (inspetores e escrita).
- **backfill:** sem linha para hoje → `ensureTodaySnapshotEnqueued()` enfileira 1 job `trigger 'BACKFILL'`; com linha → não enfileira.
- **job falho + `ensure-today` (L-F07-02):** o handler do job lança 6× para `2026-12-02` → ranking com `snapshotDate '2026-12-01'`, `isStale true`; às 05:00 o `ensure-today` enfileira; o handler (agora ok) grava `2026-12-02` → `isStale false`.
- **expurgo (L-F07-12):** seed com linhas de 401 e 400 dias atrás e um inspetor apagado com linhas recentes → depois do job `SCHEDULED`, só a de 401 dias e as do apagado somem.

**9. Shared — `packages/shared/src/schemas/reliability.test.ts`**
- `reliabilityRankingResponseSchema` aceita o exemplo de resposta (abaixo); `score` fora de 0–100 → erro; `position` 0 → erro.
- `inspectorReliabilityResponseSchema` aceita `NOT_COMPUTED` com `metrics []`.
- os dois schemas exigem `isStale` (boolean) e `settingsUpdatedAt` (instante ou `null`); métrica com 21 `failures` → erro (L-F07-02, L-F07-06, L-F07-10).
- `inspectorReliabilityParamsSchema` exige uuid.

**10. Role matrix — `packages/shared/src/permissions/role-matrix.test.ts` (acréscimo)**
- `ROLE_ACTION_MATRIX['reliability.view'].roles` = `['AM','OP']`.

### Escopo / Passos
1. **Prisma + migration** `apps/backend/prisma/migrations/YYYYMMDDhhmmss_inspector_reliability_snapshots/migration.sql` (placeholder; ordena depois da migration da TASK-F07-1). Ver Modelo de dados.
2. **Shared:** `packages/shared/src/schemas/reliability.ts` ganha os schemas da API; `ReliabilityScoreStatus` ganha `NOT_COMPUTED` só no schema de detalhe (`reliabilityDetailStatusSchema`); role matrix `'reliability.view': { roles: ['AM','OP'] }`. Build do shared.
3. **Backend `modules/reliability`:**
   - `domain/reliability-snapshot.entity.ts`, `domain/reliability-snapshot.repository.ts` (`IReliabilitySnapshotRepository`), `domain/snapshot-window.ts`, `domain/ranking.ts`, `domain/reliability.errors.ts`;
   - `application/use-cases/compute-reliability-snapshots.use-case.ts`, `get-reliability-ranking.use-case.ts`, `get-inspector-reliability.use-case.ts`, `ensure-today-snapshot.use-case.ts`;
   - `application/subscribers/recompute-reliability-on-settings-change.subscriber.ts`;
   - `application/reliability-index.reader.ts` (`ReliabilityIndexReader`, exportado para a F08);
   - `infrastructure/prisma-reliability-snapshot.repository.ts`;
   - `interfaces/reliability.routes.ts`.
4. **Evento da F03 (R1, reconciliação de 2026-10-29):**
   - A F03 já entrega `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'` em `domain-event-bus.ts` e a emissão no `UpdatePlatformSettingUseCase` (payload `{ key, before, after, actorId, occurredAt }`). Esta tarefa **não** toca esses arquivos; só importa a constante e registra o subscriber (passo 6).
   - **Por que assinar:** o `PUT` genérico da F03 é o único caminho de gravação dos pesos, e o 03.A1 exige recálculo ao salvar. As alternativas seriam piores: polling da tabela, ou uma rota de pesos própria que duplica a da F03.
   - **Sem `getUncached`** (revisão de 2026-10-28). O job lê com o `get` existente. O recálculo é enfileirado com `startAfter` = `occurredAt` + 35 s (TTL de 30 s do cache + 5 s de margem), então qualquer instância já lê o valor novo quando o job roda.
5. **Workers** (`workers.ts`):
   - `boss.schedule('reliability.compute-snapshots', '15 4 * * *', {}, SYDNEY_TZ)`;
   - `boss.work('reliability.compute-snapshots', { teamSize: 1, teamConcurrency: 1 }, withJobMetrics('reliability.compute-snapshots', async (job) => computeReliabilitySnapshotsUseCase.execute({ trigger: job.data.trigger ?? 'SCHEDULED' })))`;
   - depois dos registros: `await ensureTodaySnapshotUseCase.execute()` (backfill);
   - (L-F07-02) `boss.schedule('reliability.ensure-today', '0 5-12 * * *', {}, SYDNEY_TZ)` + `boss.work('reliability.ensure-today', withJobMetrics('reliability.ensure-today', () => ensureTodaySnapshotUseCase.execute()))`, sem `singletonKey`;
   - acrescentar as duas filas na lista do log final.
5a. **`EnsureTodaySnapshotUseCase` (L-F07-02, L-F07-10):** sem linha de hoje → enfileira `BACKFILL`; com linha e `settingsUpdatedAt > computedAt + 15 min` → `logger.error('reliability.recompute_overdue', …)` e enfileira `SETTINGS_CHANGED`; devolve `'ENQUEUED_MISSING' | 'ENQUEUED_OVERDUE' | 'PENDING' | 'UP_TO_DATE'`. Constante `RECOMPUTE_OVERDUE_MINUTES = 15`.
5b. **Falha do job (L-F07-02):** o handler envolve o use case em `try/catch`, loga `reliability.snapshots_failed { snapshotDate, trigger, reason, attempt: job.retryCount + 1 }` e relança (o pg-boss refaz pelo retry global).
5c. **Expurgo (L-F07-12):** `RELIABILITY_SNAPSHOT_RETENTION_DAYS = 400` em `domain/snapshot-retention.ts`; no compute com `trigger 'SCHEDULED'`, dentro da mesma transação e depois do `createMany`: `deleteMany({ where: { OR: [{ snapshot_date: { lt: hoje − 400 } }, { inspector: { deleted_at: { not: null } } }] } })`.
6. **Container:** `container.reliability.{ computeSnapshotsUseCase, getRankingUseCase, getInspectorReliabilityUseCase, ensureTodaySnapshotUseCase, indexReader }`; `domainEventBus.subscribe(PLATFORM_SETTING_EVENTS.UPDATED, subscriber.handle)`.
7. **Rotas** registradas no `app.ts` junto das demais; OpenAPI: `pnpm --filter backend generate:openapi` e `pnpm --filter @properfy/shared generate:types` (api-types regenerado no mesmo PR, memória `feedback_generated_apitypes_merge`).
8. **Shared — instante:** exportar `instantStr` e `instantStrNullable` de `packages/shared/src/schemas/responses.ts` (hoje são `const` privados, `:54,57`; sem mudar o comportamento) para os schemas de `reliability.ts`.
9. **Doc (X00):** `apps/backend/CLAUDE.md` — job `reliability.compute-snapshots` (04:15, motivo do horário), job `reliability.ensure-today` (05:00–12:00, motivo), snapshot sem `tenant_id` (exceção §7.1), retenção de 400 dias, recálculo pelo evento de settings da chave `reliabilityIndex` com atraso de 35 s, logs `reliability.snapshots_failed` / `reliability.recompute_overdue` como sinais de alerta.
10. **API — frescor (L-F07-02, L-F07-10):** os use cases de ranking e detalhe calculam `isStale = snapshotDate !== null && snapshotDate < civilDateInTz(now, PLATFORM_TIMEZONE)` e leem `settingsUpdatedAt` do `platform_settings.updated_at` da chave `reliabilityIndex` (1 consulta pelo repositório de settings da F03).

### Modelo de dados

**Escopo de tenant (exceção explícita ao §7.1 do CLAUDE.md, D9).** `InspectorReliabilitySnapshot` **não tem `tenant_id`**: o índice é do inspetor (entidade cross-tenant) e soma serviços de todas as agências. O isolamento é garantido por: (1) role check AM/OP antes de qualquer leitura (CL_ADMIN, CL_USER, INSP, TNT → 403); (2) nenhuma rota de agência lê a tabela; (3) o snapshot não guarda nome de agência, endereço nem coordenada.

```prisma
model InspectorReliabilitySnapshot {
  id             String    @id @default(uuid())
  inspector_id   String
  snapshot_date  DateTime  @db.Date          // data civil (Sydney) do cálculo
  window_days    Int       @default(30)
  window_from    DateTime  @db.Date          // snapshot_date − 30
  window_to      DateTime  @db.Date          // snapshot_date − 1
  status         String    @db.VarChar(30)   // SCORED | INSUFFICIENT_VOLUME | NO_WEIGHTED_DATA
  score          Decimal?  @db.Decimal(4, 1) // 0.0–100.0; NULL quando status ≠ SCORED
  volume         Int                          // |U|
  completed_count Int
  metrics_json   Json                         // ReliabilityMetricResult[8] (shape do shared)
  settings_json  Json                         // { weights, minimumVolume, minimumRatings, toleranceMinutes, volumeReference: { value, source, activeInspectors, periodDays } } — mediana do dia (igual em todas as linhas do dia)
  trigger        String    @db.VarChar(30)   // SCHEDULED | SETTINGS_CHANGED | BACKFILL
  computed_at    DateTime
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt

  inspector Inspector @relation(fields: [inspector_id], references: [id])

  @@unique([inspector_id, snapshot_date])
  @@index([snapshot_date, score(sort: Desc)])
  @@map("inspector_reliability_snapshots")
}
```
- `Inspector.reliability_snapshots InspectorReliabilitySnapshot[]`.
- SQL extra na migration: `CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))` e `CHECK (("status" = 'SCORED') = ("score" IS NOT NULL))`.
- Datas e horários: `DateTime` simples (`timestamp(3)`), datas civis como `@db.Date`.
- **Retenção (L-F07-12, 2026-10-29):** 400 dias (`RELIABILITY_SNAPSHOT_RETENTION_DAYS`, 13 meses: cobre qualquer período anual da F08 com margem; ~200 × 400 ≈ 80 mil linhas no teto). Linhas de inspetor apagado (`deleted_at`) são expurgadas no job diário seguinte. A F08 lê o histórico dentro desse horizonte.
- Conversão `Prisma.Decimal` → `number` no repositório.

### Métricas (definições)
As da TASK-F07-1, sem mudança. Esta tarefa só as grava (`metrics_json`) e as lê.

### Fórmula
- A da TASK-F07-1. O score e o status são calculados no job e **guardados**; a API não recalcula.
- Os pesos exibidos no detalhe são os do `settings_json` do snapshot (o que gerou aquele score), não os atuais.

### Algoritmo do job `ComputeReliabilitySnapshotsUseCase.execute({ trigger, now? })`
1. `snapshotDate = civilDateInTz(now, PLATFORM_TIMEZONE)`; `{ from, to } = snapshotWindow(snapshotDate)`.
2. `prisma.$transaction(async (tx) => { … }, { timeout: 120_000, maxWait: 10_000 })`:
   1. `SELECT pg_advisory_xact_lock(hashtext('reliability.compute-snapshots'))` — serializa execuções de qualquer instância;
   2. settings **depois do lock**: `settingsReader.get('reliabilityIndex')` e `get('fieldEvents')` (F03, cache de 30 s; o atraso de 35 s do recálculo garante o valor novo);
   3. inspetores: `tx.inspector.findMany({ where: { deleted_at: null }, select: { id: true } })`;
   4. `metricsService.computeAllWith(tx, from, to, settings)` (7 consultas, todos os inspetores). A **mediana do volume** sai daqui uma vez (`batch.volumeReference`) e vale para todos;
   5. para cada inspetor: resultado (ou "vazio" com `volume 0`, VOLUME `rate 0` com a mesma referência) → `computeReliabilityScore`; `settings_json.volumeReference = batch.volumeReference`;
   6. `deleteMany({ where: { snapshot_date } })` + `createMany(rows)` (substitui o dia inteiro, atômico);
   7. só com `trigger 'SCHEDULED'`: expurgo de `snapshot_date < snapshotDate − 400` e das linhas de inspetores apagados (L-F07-12).
3. Log `reliability.snapshots_computed` (+ `reliability.snapshots_purged` quando houve expurgo). Em qualquer erro: `reliability.snapshots_failed` em nível `error` e relança (L-F07-02).
- **Idempotência:** o resultado só depende de `snapshotDate`, dos dados e dos settings; rodar de novo substitui as linhas do dia.
- **Por que lock e não `singletonKey`:** o `singletonKey` descarta um envio quando já há job ativo com a mesma chave (`pgboss-job-queue.ts:18`); um salvamento de pesos durante o job diário seria perdido. Com o lock, os jobs rodam em série e o último, enfileirado 35 s depois do salvamento, lê os pesos novos.
- **Recálculo ao salvar (03.A1):** `PUT /v1/platform-settings/reliabilityIndex` → evento → subscriber → job `SETTINGS_CHANGED` com `startAfter` de 35 s → mesmo algoritmo para o dia de hoje. Outras chaves não disparam recálculo. Se o job diário de hoje ainda não rodou (antes das 04:15), o recálculo cria o snapshot de hoje mais cedo (mesma janela, P8) e o das 04:15 o substitui.
- **Backfill no deploy e reforço horário:** `EnsureTodaySnapshotUseCase` — se não existe nenhuma linha com `snapshot_date = hoje`, enfileira `{ trigger: 'BACKFILL' }`. Roda no boot e, desde 2026-10-29 (L-F07-02), de hora em hora das 05:00 às 12:00 Sydney (`reliability.ensure-today`), cobrindo job das 04:15 que esgotou as tentativas ou máquina fora do ar. Também detecta recálculo de pesos atrasado (L-F07-10). Máquinas subindo juntas podem enfileirar 2; o lock e a idempotência resolvem. Sem backfill de dias passados (a F08 só precisa do índice atual para níveis e do histórico a partir daqui).
- **Horário 04:15:** fora da hora pulada/repetida do DST de Sydney (02:00–03:00) e depois de `audit.retention` (03:30) e `day-plan.purge-route-data` (03:45).
- **Desempenho:** 7 consultas de leitura + 1 de inspetores + 2 de escrita (+ 1 de expurgo, L-F07-12), independente do número de inspetores; memória proporcional aos serviços da janela (estimativa: 200 inspetores × 60 serviços = 12 mil fatos, poucos MB).

### Contratos

**Rotas (AM/OP; `preHandler: authenticate`; action `reliability.view`)**

| Método e rota | Request | Resposta 200 | Erros |
|---|---|---|---|
| `GET /v1/dashboard/inspector-performance` | – | `success(ReliabilityRankingResponse)` | 401 `UNAUTHENTICATED`; 403 `FORBIDDEN` |
| `GET /v1/dashboard/inspector-performance/:inspectorId` | `params: { inspectorId: uuid }` | `success(InspectorReliabilityResponse)` | 400 `VALIDATION_ERROR`; 401; 403 `FORBIDDEN`; 404 `INSPECTOR_NOT_FOUND` "Inspector not found" |

| Papel | Ranking | Detalhe |
|---|---|---|
| AM | sim | sim |
| OP | sim | sim |
| CL_ADMIN / CL_USER | 403 | 403 |
| INSP | 403 (o próprio índice é da F08) | 403 |
| TNT / sem token | 401 | 401 |

**Schemas (shared, `packages/shared/src/schemas/reliability.ts`)**
```ts
export const reliabilityRankingResponseSchema = z.object({
  snapshotDate: civilDateSchema.nullable(),
  windowFrom: civilDateSchema.nullable(),
  windowTo: civilDateSchema.nullable(),
  computedAt: instantStr.nullable(),
  isStale: z.boolean(),                                         // L-F07-02: snapshotDate < hoje (Sydney)
  settingsUpdatedAt: instantStr.nullable(),                     // L-F07-10: updated_at da chave reliabilityIndex
  minimumVolume: z.number().int().positive(),
  volumeReference: z.number().positive().nullable(),            // null sem snapshot
  volumeReferenceSource: z.enum(['MEDIAN', 'OVERRIDE']).nullable(),
  ranked: z.array(z.object({
    position: z.number().int().positive(),
    inspectorId: z.string().uuid(),
    inspectorName: z.string(),
    score: z.number().min(0).max(100),
    volume: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
  })),
  notEnoughData: z.array(z.object({
    inspectorId: z.string().uuid(),
    inspectorName: z.string(),
    volume: z.number().int().nonnegative(),
    status: z.enum(['INSUFFICIENT_VOLUME', 'NO_WEIGHTED_DATA']),
  })),
});

export const inspectorReliabilityResponseSchema = z.object({
  inspectorId: z.string().uuid(),
  inspectorName: z.string(),
  inspectorStatus: z.enum(['ACTIVE', 'INACTIVE']),
  status: z.enum(['SCORED', 'INSUFFICIENT_VOLUME', 'NO_WEIGHTED_DATA', 'NOT_COMPUTED']),
  snapshotDate: civilDateSchema.nullable(),
  windowFrom: civilDateSchema.nullable(),
  windowTo: civilDateSchema.nullable(),
  computedAt: instantStr.nullable(),
  isStale: z.boolean(),
  settingsUpdatedAt: instantStr.nullable(),
  score: z.number().min(0).max(100).nullable(),
  position: z.number().int().positive().nullable(),
  rankedCount: z.number().int().nonnegative(),
  volume: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  minimumVolume: z.number().int().positive(),
  minimumRatings: z.number().int().positive(),                  // L-F07-03: do settings_json do snapshot (atual em NOT_COMPUTED)
  volumeReference: z.number().positive().nullable(),            // null só em NOT_COMPUTED
  volumeReferenceSource: z.enum(['MEDIAN', 'OVERRIDE']).nullable(),
  metrics: z.array(reliabilityMetricResultSchema.extend({ weight: z.number().int().min(0).max(10) })),
});
export const inspectorReliabilityParamsSchema = z.object({ inspectorId: z.string().uuid() });
```
(`civilDateSchema`: `packages/shared/src/schemas/civil-date.ts:12`. `instantStr`: hoje privado em `packages/shared/src/schemas/responses.ts:54`, exportado no passo 8.)

**Exemplo de resposta do ranking**
```json
{ "data": {
  "snapshotDate": "2026-12-01", "windowFrom": "2026-11-01", "windowTo": "2026-11-30",
  "computedAt": "2026-11-30T17:15:04.000Z", "isStale": false, "settingsUpdatedAt": null, "minimumVolume": 10,
  "volumeReference": 9.5, "volumeReferenceSource": "MEDIAN",
  "ranked": [
    { "position": 1, "inspectorId": "…", "inspectorName": "Eva Lima", "score": 100, "volume": 10, "completedCount": 10 },
    { "position": 2, "inspectorId": "…", "inspectorName": "Fábio Reis", "score": 97.5, "volume": 10, "completedCount": 9 },
    { "position": 3, "inspectorId": "…", "inspectorName": "Dan Smith", "score": 89.0, "volume": 10, "completedCount": 8 },
    { "position": 4, "inspectorId": "…", "inspectorName": "Ana Costa", "score": 88.3, "volume": 12, "completedCount": 12 },
    { "position": 5, "inspectorId": "…", "inspectorName": "Ben Ward", "score": 79.0, "volume": 10, "completedCount": 10 }
  ],
  "notEnoughData": [ { "inspectorId": "…", "inspectorName": "Carla Nunes", "volume": 9, "status": "INSUFFICIENT_VOLUME" } ]
} }
```

**Evento consumido (da F03, R1):** `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'`, payload `{ key: PlatformSettingKey; before: unknown; after: unknown; actorId: string; occurredAt: string }` (F03 D29). A F07 não o declara nem o emite; só a chave `reliabilityIndex` tem assinante na F07.

**`position` (R2, L-F08-07):** ranking de competição da plataforma inteira (todos os ACTIVE com `SCORED` do snapshot), sem recorte por região, tipo de serviço ou agência; vale para as rotas e para `getCurrentIndexes`.

**Job:** `reliability.compute-snapshots`, payload `{ trigger: 'SCHEDULED' | 'SETTINGS_CHANGED' | 'BACKFILL' }`. **Job (L-F07-02):** `reliability.ensure-today`, sem payload, cron `0 5-12 * * *` Sydney.

**Logs de alerta (L-F07-02, L-F07-10):** `reliability.snapshots_failed { snapshotDate, trigger, reason, attempt }` e `reliability.recompute_overdue { settingsUpdatedAt, computedAt }`, ambos `error` (capturados pelo pipeline de logs existente), sem nomes nem coordenadas.

**Exportado para a F08:** ver "Contratos exportados para a F08".

### UI
Nenhuma nesta tarefa.

### Casos de borda
- **Nenhum snapshot ainda** (antes do primeiro job/backfill): ranking vazio com `snapshotDate null`.
- **Inspetor criado depois do cálculo:** aparece em `notEnoughData` com volume 0 até o próximo job; detalhe `NOT_COMPUTED`.
- **Inspetor desativado:** sai do ranking e do bloco; o snapshot continua sendo gravado (histórico).
- **`getCurrentIndexes` com subconjunto de inspetores (R2):** a posição continua sendo a da plataforma inteira; o filtro só recorta a saída.
- **Subscriber do evento da F03 falha (R1):** o `PUT` já devolveu 200 (`Promise.allSettled` da F03); o `ensure-today` horário detecta o recálculo atrasado (L-F07-10).
- **Inspetor apagado:** não ganha linha nova; as linhas dele são expurgadas no próximo job `SCHEDULED` (L-F07-12; FK sem cascade, apagar inspetor é soft delete). Inspetor restaurado volta a ganhar linhas a partir do dia seguinte, sem histórico.
- **Linhas com mais de 400 dias:** expurgadas pelo job diário; a F08 não pode ler além disso.
- **Salvamento de pesos durante o job diário:** o job do salvamento começa 35 s depois, espera o lock se preciso e roda com os pesos novos.
- **Mudança em `fieldEvents` (tolerância):** sem recálculo imediato; vale a partir do job diário seguinte (fora do 03.A1).
- **Dois salvamentos em sequência:** 2 jobs, ambos rodam em série; o estado final tem o último valor.
- **Setting inválido gravado** (schema evoluiu): `resolvePlatformSettingValue` devolve defaults e loga erro (regra da F03); o job não quebra.
- **Job falha no meio:** a transação desfaz tudo; o snapshot do dia anterior continua sendo o "atual" e a API passa a devolver `isStale true`; pg-boss tenta de novo (retry global, 6 tentativas); cada falha loga `reliability.snapshots_failed` em `error` (L-F07-02).
- **Job esgota as tentativas de madrugada:** o `ensure-today` das 05:00 (e de hora em hora até 12:00) enfileira de novo. Falha persistente → o ranking fica `isStale` com aviso na página até alguém corrigir; o `dlq-monitor` **não** alerta (1 linha `failed` < limiar 10), então o sinal é o log `error`.
- **Timeout de 120 s:** loga `reliability.snapshots_failed { reason: 'TIMEOUT' }` e falha o job (mesmo caminho acima).
- **Pesos salvos e recálculo não executado (L-F07-10):** enquanto `settingsUpdatedAt > computedAt`, a página mostra o aviso; passados 15 min, o `ensure-today` horário loga `reliability.recompute_overdue` e reenfileira. Fora da janela 05:00–12:00 só o job diário corrige.
- **Máquina fora do ar às 04:15:** o `ensure-today` das 05:00 cobre (o pg-boss não roda schedule perdido).
- **Virada do dia durante o job:** `snapshotDate` é fixado no passo 1.

### Fora do escopo
- Endpoint do INSP (F08, `GET /v1/inspector/program`).
- Histórico gráfico, exportação, coluna no relatório PERFORMANCE das agências.
- Backfill de datas passadas.
- Nível (Bronze/Silver/Gold): é da F08, derivado do score atual. O campo de nível na API e a coluna "Level" na página são da tarefa web da F08.
- Recálculo ao salvar `fieldEvents` e kill switch do job: fora do plano (revisão de 2026-10-28).

### Critérios de aceite (03.A1)
- O índice segue os pesos configurados e é **recalculado quando a configuração muda**: teste de integração 8 (PUT → evento da F03 → job → Ana 88.3 → 87.3), com audit `platform_setting.updated` (autor e data).
- `position` é da plataforma inteira, também em `getCurrentIndexes` com subconjunto (testes 2, 2a; R2).
- A referência de volume é a mediana do dia, igual em todas as linhas do snapshot (teste 3).
- O job é idempotente e serializado (testes 3 e 8).
- Só AM/OP leem (testes 6 e 7).
- Job falho é visível: log `error`, `isStale true` na API e nova tentativa pelo `ensure-today` horário (testes 3, 3a, 6, 8; L-F07-02).
- Recálculo de pesos pendente é visível (`settingsUpdatedAt`) e, atrasado, logado e reenfileirado (testes 3a, 6; L-F07-10).
- Retenção de 400 dias e expurgo de inspetor apagado (testes 3, 8; L-F07-12).
- O detalhe devolve as falhas por métrica, com cap e sem localização (testes 6, 7; L-F07-06).

### Dependências
- TASK-F07-1 (mergeada antes). F03-1 (`UpdatePlatformSettingUseCase` com o evento `platform_setting.updated.v1`, L-F03-10; `PlatformSettingsService`).

### Riscos e armadilhas
- **Cache de settings por instância:** o worker pode estar em outra máquina, com cache de até 30 s. Por isso o recálculo é enfileirado com 35 s de atraso. A constante `SETTINGS_RECOMPUTE_DELAY_SECONDS = 35` fica no subscriber, com comentário ligando-a ao TTL de 30 s da F03; se o TTL mudar, ela muda junto.
- **Lock em PgBouncer:** só `pg_advisory_xact_lock` dentro de `$transaction` interativa; nunca o lock de sessão.
- **Transação longa:** as leituras estão dentro do lock (necessário para ler settings frescos e evitar escrita fora de ordem). Medir em staging; se passar de 30 s, mover as leituras pesadas para fora e guardar `settings_json` + comparação de `updated_at` do setting antes de gravar (fallback documentado, não implementado agora).
- **`singletonKey` silencioso:** não usar para o recálculo (ver Algoritmo).
- **Response schema remove campos:** todo campo novo precisa estar no Zod; o teste 7 checa presença depois da serialização.
- **Validação antes de auth no Fastify** (memória `project_fastify_validation_before_auth`): `/:inspectorId` inválido com token de CL devolve 400, não 403. Aceito (não vaza dado); o teste 7 documenta.

### Deploy / rollout / rollback
- **Deploy:** migration expand (tabela nova) em staging, depois prod. No primeiro boot com o código novo, o backfill enfileira o snapshot de hoje. Conferir em staging: `SELECT status, count(*) FROM inspector_reliability_snapshots WHERE snapshot_date = current_date GROUP BY 1` e o log `reliability.snapshots_computed` (duração). Conferir também que `pgboss.schedule` tem `reliability.compute-snapshots` e `reliability.ensure-today` (L-F07-02), e configurar no agregador de logs um alerta para `reliability.snapshots_failed` e `reliability.recompute_overdue` (ou confirmar que o alerta genérico de `error` os cobre).
- **Rollout:** sem UI até a TASK-F07-3. A API já responde para AM/OP.
- **Rollback:** reverter o código: a tabela fica (sem dependentes até a F08); remover os schedules órfãos com `boss.unschedule('reliability.compute-snapshots')` e `boss.unschedule('reliability.ensure-today')`, ou `DELETE FROM pgboss.schedule WHERE name IN ('reliability.compute-snapshots', 'reliability.ensure-today')`. Linhas já expurgadas (L-F07-12) não voltam.

### Dias · Branch · Verificação
- **Dias:** 2,375 = 03.4a 1,0 (modelo, migration, job diário, backfill, idempotência) + 03.A1 0,375 (subscriber com atraso, lock, teste ponta a ponta) + 03.11/03.12 API 0,5 (2 rotas, schemas, RBAC, ranking) + lacunas 0,5.
  - **Reconciliação de 2026-10-29: −0,125.** R1: o evento `platform_setting.updated.v1` e o teste de emissão passaram para a F03 (L-F03-10), então sai o gancho no use case da F03 (constante, emit, teste 5). R2 (teste do leitor com subconjunto) e R3 (fuso) sem custo relevante.
  - **Lacunas de 2026-10-29: +0,5.** L-F07-02 0,25 (log de falha, `reliability.ensure-today`, `isStale`, teste de falha + retomada); L-F07-10 0,125 (`settingsUpdatedAt`, `recompute_overdue` no `ensure-today`); L-F07-12 0,125 (expurgo no job + teste). L-F07-06 e L-F07-08 sem custo aqui (shape já vem da TASK-F07-1; contrato é texto).
- **Branch:** `feat/f07-reliability-snapshots` a partir de `develop` (depois do merge da TASK-F07-1), em worktree. ~33 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `pnpm --filter backend test:integration` (teste 7) e `test:integration:db` (teste 8) via subagente; `pnpm --filter backend generate:openapi` + `pnpm --filter @properfy/shared generate:types` sem diff pendente em `api-types.ts`; `git diff --stat origin/develop... | tail -1` < 150.

---

## TASK-F07-3 · Web: página "Inspector performance" e seção "Reliability index"

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F07-2, TASK-X01-1, TASK-F03-4
> - **Desbloqueia:** TASK-F08-3
> - **Pode rodar em paralelo com:** TASK-F05-1, TASK-F06-2, TASK-F04-4, TASK-F08-1, TASK-F04-3b
> - **Pista sugerida (time de 6):** D · Web

### Objetivo
- Criar a página **"Inspector performance"** (`/inspector-performance`, AM/OP) com o ranking atual da janela de 30 dias (posição, nome, score, serviços), o bloco **"Not enough data"** e um **drawer** com as 8 métricas do inspetor. Uma só página cobre 03.11 e 03.12.
- Acrescentar o filho "Inspector performance" ao grupo **Dashboard** do menu (X01).
- Acrescentar a seção **"Reliability index"** na página "Platform settings" (F03-4): 8 pesos, volume mínimo e referência de volume.

### Contexto no código
- **Menu (X01):** `apps/web/src/components/shell/Sidebar.tsx` — item Dashboard com `collapseIfSingle: true` e `submenu` (Overview, Analytics, Workload `roles: [AM, OP]`); a regra do X01 manda cada feature acrescentar o seu filho no próprio PR, sem placeholder. F05 (Live Day) e F02 (Inspector notices) já terão acrescentado os seus. Ordem canônica do X01 (L-X01-03): Overview · Live Day · Inspector notices · Analytics · Workload · **Inspector performance** · Goals & rewards (F08); se um vizinho ainda não existe, o item fica na ordem relativa da tabela. O X01 exporta `NAV_ITEMS` e `filterNavItems(items, role, clUserPermissions?)` e tira de `Sidebar.roles.test.tsx` os mocks de `SidebarSubmenu`/`SidebarItem` (L-X01-02); `Sidebar.test.tsx` fica só com testes de `filterNavItems`.
- **Router:** `apps/web/src/app/router.tsx` — `Loadable(lazyRetry(() => import(...)))` (`:39` para `InspectorWorkloadPage`), rota `inspector-workload` com `<AuthGuard roles={[UserRole.AM, UserRole.OP]}>` (`:170-174`).
- **Precedente de tela AM/OP:** `apps/web/src/features/inspector-workload/` (`pages/InspectorWorkloadPage.tsx`, `hooks/useInspectorWorkload.ts`: `useQuery` com `api.GET('/v1/dashboard/inspector-workload')`, `if (error) throw error`, `data?.data`). **Não é alterado.**
- **Componentes:** `components/data/DataTable.tsx` (`columns`, `data`, `loading`, `error`, `onRetryError`, `onRowClick`, `emptyMessage`, `keyExtractor`; cabeçalho ordenável acessível desde a PR-Q), `components/ui/DrawerPanel.tsx` (`open`, `onClose`, `size`, `ariaLabel`) + `DrawerHeader.tsx` (`title`, `onClose`, `actions`), `components/layout/PageHeader.tsx`, `PageSectionHeader.tsx`, `components/feedback/{LoadingState,ErrorState,EmptyState,InfoBanner,NoPermissionState}.tsx`, `components/ui/Tooltip.tsx`.
- **Platform settings (F03-4):** `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.tsx` com seções por chave via `usePlatformSetting(key)`; F04 (`routeWeights`) e F05 (`liveDayAlerts`) já acrescentaram as suas.
- **Voltar (X01):** a página é um filho de primeiro nível do grupo Dashboard (não é sub tela), então **não** tem `BackButton`; o drawer fecha com o botão "Close", Escape e clique fora. O deep link do drawer (`?inspector=<id>`) não cria tela nova. Por isso a regra de fallback por papel e o teste P-b do X01 (L-X01-08) não se aplicam (R5).
- **Cores por inspetor (F05):** não se aplicam (sem mapa nem rota). Nenhuma cor por inspetor nesta tela.
- **Datas:** `formatCivilDate`, `formatInstantDateTime` do shared (fuso de exibição `PLATFORM_TIMEZONE`; `snapshotDate`/`serviceDate` são datas civis, sem conversão; `users.timezone` não entra; N13/R3).
- **Testes web:** RTL + `createMemoryRouter`; `findBy` pode correr com transição de estado (memória `project_web_findby_races_state_transition`); não usar `localStorage` (memória `project_jsdom_localstorage_unreliable_in_web_tests`).
- **Dialog de transição (L-F07-01, L-F07-04):** `apps/web/src/features/appointments/components/StatusTransitionDialog.tsx` monta `REJECTION_OPTIONS = Object.values(RejectionReasonCode).map(...)` (`:24`) e o devolve para **qualquer** `targetStatus === 'REJECTED'` (`:79`), sem olhar o status de origem (a F03 já filtra `SYSTEM_ONLY_REJECTION_CODES`). Teste existente: `StatusTransitionDialog.test.tsx`.
- **Detalhe do appointment:** rota AM/OP `/appointments/:id` (existente), destino dos links da lista de falhas (L-F07-06).

### Decisões aplicáveis
D3, D4, D5, D7 (2026-10-27); P5, P9 (2026-10-28); X01 (2026-10-27): grupo Dashboard e voltar só em sub telas; R3, R4, R5 (reconciliação, 2026-10-29).

- **2026-10-29 · R4 (L-X01-02, L-X01-03):** "Inspector performance" fica **depois de Workload e antes de Goals & rewards**; testes de menu no `Sidebar.roles.test.tsx` real, sem mocks de `SidebarSubmenu`/`SidebarItem`, com `MemoryRouter` + `initialEntries`, asserção por rótulo (nunca índice ou contagem).
- **2026-10-29 · R5 (L-X01-08):** sem sub tela com `backTo` nesta tarefa; se uma for criada, `backTo="/inspector-performance"` (mesmos papéis AM/OP), override com `onBack(goBack)` e teste P-b com OP (papel mais restrito).
- **2026-10-29 · R3 (N13):** exibição conforme a tabela "Fuso de cada campo de data".

**Lacunas (dev, 2026-10-29):**
- **2026-10-29 · L-F07-01 / L-F07-04:** o `StatusTransitionDialog` oferece `INSPECTOR_NO_SHOW` ("Inspector didn't attend") só em `SCHEDULED → REJECTED` e `NOT_EXECUTED` ("Inspection was not actually carried out") só em `DONE → REJECTED`, via `allowedRejectionCodesFrom(currentStatus)` do shared. Cada um com dica abaixo do select quando escolhido: "This counts against the inspector's reliability score." / "Only this reason counts against the inspector's reliability score."
- **2026-10-29 · L-F07-02:** `isStale` → `InfoBanner` (tom de aviso) na página e no drawer: "Scores haven't been updated since {date}. The nightly job didn't finish; operations has been notified." Exibido só a partir das 05:00 Sydney (antes disso, o snapshot de ontem é o esperado).
- **2026-10-29 · L-F07-03:** campo "Minimum ratings for satisfaction" (1–50) na seção; o drawer mostra "Not enough ratings · {n} of {minimumRatings} needed" quando `SATISFACTION` é nula com pesquisas.
- **2026-10-29 · L-F07-06:** o drawer lista as falhas de cada métrica (expansível), com link para `/appointments/:id`; o valor da métrica tem tooltip "{weightedSuccess} of {weightedEligible} weighted minutes".
- **2026-10-29 · L-F07-10:** com `settingsUpdatedAt > computedAt`, `InfoBanner` "Weights were changed at {time}. Scores will update within a few minutes."; depois de 15 min, "Weights were changed at {time} but scores haven't been recalculated yet. Operations has been notified." Sem polling.
- **2026-10-29 · L-F07-11:** segue a F03 (`PUT` AM/OP): AM **e** OP veem "Configure weights" e editam a seção. Restringir a AM seria regra da F03, não esconder o link.

### Testes primeiro (TDD)

Fixtures em `apps/web/src/features/inspector-performance/__fixtures__/reliability.ts` no shape exato de `reliabilityRankingResponseSchema` e `inspectorReliabilityResponseSchema` (teste `schema.parse(fixture)`; memória `feedback_test_fixtures_must_match_api_shape`), com os números dos exemplos (Eva 100, Fábio 97.5, Dan 89.0, Ana 88.3, Ben 79.0; Carla 9; `volumeReference 9.5`).

**1. `components/shell/Sidebar.roles.test.tsx` (acréscimo; R4, L-X01-02/03)** — menu real, **sem** mocks de `SidebarSubmenu`/`SidebarItem` (mantém os de `useAuth`, `SidebarUser`, `SidebarUserMenu`), `MemoryRouter` + `initialEntries` por caso.
- AM e OP, flyout aberto (`user.click` no gatilho): `menuitem` "Inspector performance" no grupo Dashboard, com `href="/inspector-performance"`.
- CL_ADMIN, CL_USER e INSP não veem (INSP continua com o item simples "Dashboard").
- o grupo fica ativo em `/inspector-performance` (indicador do gatilho, como S5/S6 do X01).
- ordem relativa por rótulo: "Workload" antes de "Inspector performance"; se "Goals & rewards" estiver presente, "Inspector performance" vem antes dele. Compara posições por rótulo, nunca índice absoluto nem contagem de filhos.
- `components/shell/Sidebar.test.tsx` (acréscimo, pode manter mocks): `filterNavItems(NAV_ITEMS, 'OP')` contém o filho "Inspector performance"; `filterNavItems(NAV_ITEMS, 'CL_ADMIN')` não.

**2. `app/router.test.tsx` (ou o teste de guarda existente)**
- `/inspector-performance` com CL_ADMIN → `NoPermissionState` (comportamento padrão do `AuthGuard`).

**3. `features/inspector-performance/pages/InspectorPerformancePage.test.tsx`**

| Caso | Mock | Esperado |
|---|---|---|
| carregando | query pendente | `LoadingState` com rótulo "Loading inspector performance" |
| erro | 500 | `ErrorState` "We couldn't load inspector performance." + botão "Try again" que refaz a query |
| sem snapshot | `snapshotDate null` | `EmptyState` "No scores yet" / "Scores are calculated every night. The first ranking appears after the next run." |
| ranking | fixture | subtítulo "Last 30 days · 1 Nov – 30 Nov 2026 · Updated 1 Dec 2026, 4:15 am"; 5 linhas na ordem Eva, Fábio, Dan, Ana, Ben; colunas "Rank", "Inspector", "Score", "Services"; score com 1 casa ("97.5", "89.0"; 100 aparece "100.0") |
| empate | 2 com 97.5 | as duas linhas mostram "2"; a seguinte "4" |
| só "Not enough data" | `ranked []`, 3 em `notEnoughData` | texto "No inspector has enough services to be ranked yet." no lugar da tabela; o bloco aparece |
| bloco "Not enough data" | fixture | título "Not enough data"; texto "Inspectors with fewer than 10 services in the last 30 days are not ranked."; linha "Carla Nunes · 9 of 10 services" |
| `NO_WEIGHTED_DATA` | 1 item | linha "… · No data for the weighted metrics" |
| bloco vazio | `notEnoughData []` | bloco não renderiza |
| abrir drawer | clique na linha de Ana | URL ganha `?inspector=<id>`; drawer com `aria-label "Ana Costa reliability details"` |
| deep link | rota inicial `/inspector-performance?inspector=<id>` | drawer abre direto |
| teclado | foco na linha + Enter | abre o drawer; Escape fecha e devolve o foco à linha |
| link de configuração (L-F07-11) | AM e OP | ambos veem "Configure weights" → `/platform-settings#reliability-index`; CL não chega à página (teste 2) |
| desatualizado (L-F07-02) | `isStale true`, `snapshotDate '2026-12-01'`, relógio `2026-12-02 09:00` Sydney | banner "Scores haven't been updated since 1 Dec 2026. The nightly job didn't finish; operations has been notified."; ranking continua visível |
| desatualizado de madrugada | `isStale true`, relógio `2026-12-02 04:30` | sem banner |
| em dia | `isStale false` | sem banner |
| pesos mudados (L-F07-10) | `settingsUpdatedAt 2026-12-02 10:00`, `computedAt 04:15`, relógio 10:05 | banner "Weights were changed at 10:00 am. Scores will update within a few minutes." |
| recálculo atrasado | mesmo, relógio 10:20 | banner "Weights were changed at 10:00 am but scores haven't been recalculated yet. Operations has been notified." |
| recálculo feito | `computedAt 10:01` > `settingsUpdatedAt` | sem banner |

**4. `features/inspector-performance/components/ReliabilityDrawer.test.tsx`**

| Caso | Esperado |
|---|---|
| carregando / erro | skeleton; "We couldn't load this inspector's metrics." + "Try again" |
| Ana `SCORED` | cabeçalho "88.3" + "Rank 4 of 5" + "12 services · last 30 days"; 8 linhas na ordem canônica com rótulos da tabela UI |
| métrica com taxa | "Punctuality · 83% · 10 of 12 services · Weight 1" |
| satisfação | "Tenant satisfaction · 4.25 / 5 · 4 ratings · Weight 1" |
| volume | "Completed volume · 100% · 12 completed · median 9.5 · Weight 1" (com override: "… · reference 20 (fixed)") |
| aviso antecipado | "Late notice given · 50% · 1 of 2 late arrivals · Weight 1" |
| métrica nula | "Late notice given · No data · No late arrivals in this period" (texto por métrica, tabela UI) |
| peso 0 | linha com "Not weighted" e estilo atenuado (texto, não só cor) |
| Carla `INSUFFICIENT_VOLUME` | cabeçalho "Not enough data" + "9 of 10 services needed to be ranked"; métricas listadas |
| `NOT_COMPUTED` | "No score yet" / "This inspector will be scored after the next nightly run." e nenhuma linha |
| INACTIVE | badge "Inactive" ao lado do nome; sem "Rank" |
| nota de normalização | rodapé "Percentages are weighted by service duration and planned travel." |
| minutos ponderados (L-F07-06) | Ben, hover/foco no "53%" de Punctuality → tooltip "320 of 600 weighted minutes" |
| falhas (L-F07-06) | Ana, expandir "Punctuality" ("Show 2 issues") → 2 itens "{data} · Checked in 11:20, window 09:00–11:00, planned 10:50" com link "Open appointment" para `/appointments/<id>`; o botão tem `aria-expanded` |
| falhas acima do cap | `failureCount 25`, 20 itens | "Showing the 20 most recent of 25" |
| sem falhas | `failures []` | sem botão de expandir |
| satisfação abaixo do mínimo (L-F07-03) | `rate null`, `eligibleCount 1`, `minimumRatings 3` no snapshot | "Tenant satisfaction · Not enough ratings · 1 of 3 needed" |
| volume com pro-rata (L-F07-05) | `activeDays 12` | "Completed volume · 100% · 10 completed in 12 days · median 9.5 / 30 days" |
| desatualizado (L-F07-02) | `isStale true` | o mesmo banner da página no topo do drawer |
| no-show (L-F07-01) | falha de `CANT_ATTEND` com `NO_SHOW_REJECTED` | item "Rejected: inspector didn't attend" |

**5. `features/platform-settings/components/ReliabilityIndexSection.test.tsx`**
- carrega os valores do `GET /v1/platform-settings/reliabilityIndex` nos 11 campos (8 pesos, volume mínimo, override, `minimumRatings`).
- validação no cliente: peso 11 → "Enter a whole number from 0 to 10"; todos 0 → "Set at least one weight above 0"; volume mínimo 0 → "Enter a whole number from 1 to 200"; override 1001 → "Enter a whole number from 1 to 1000, or leave it empty"; campo vazio → enviado como `null` (mediana); (L-F07-03) mínimo de pesquisas 0 ou 51 → "Enter a whole number from 1 to 50".
- (L-F07-11) OP abre a página e salva → `PUT` enviado (mesmo comportamento do AM).
- salvar → `PUT` com o objeto completo; 200 → snackbar "Reliability settings saved. Scores are being recalculated." e invalidação de `['reliability']`.
- 422/400 do servidor → mensagens do servidor nos campos (`details`) ou banner.
- botão "Save" desabilitado sem mudança e durante o envio.

**6. Hooks — `useReliabilityRanking.test.tsx`, `useInspectorReliability.test.tsx`**
- chaves `['reliability','ranking']` e `['reliability','inspector', id]`; `enabled` só com `id`.

**7. `features/appointments/components/StatusTransitionDialog.test.tsx` (acréscimo; L-F07-01, L-F07-04)**

| Caso | Entrada | Esperado |
|---|---|---|
| SCHEDULED → REJECTED | OP | opções incluem "Inspector didn't attend"; não incluem "Inspection was not actually carried out" |
| escolher no-show | seleciona "Inspector didn't attend" | dica "This counts against the inspector's reliability score."; submit envia `rejectionReasonCode 'INSPECTOR_NO_SHOW'` |
| DONE → REJECTED | AM | opções incluem "Inspection was not actually carried out"; não incluem "Inspector didn't attend" |
| escolher não executado | seleciona | dica "Only this reason counts against the inspector's reliability score." |
| DRAFT/AWAITING_INSPECTOR → REJECTED | OP | nenhum dos dois códigos |
| 422 `REJECTION_CODE_NOT_ALLOWED` | servidor recusa | mensagem do servidor no dialog (sem fechar) |

### Escopo / Passos
1. `features/inspector-performance/`:
   - `pages/InspectorPerformancePage.tsx`;
   - `components/RankingTable.tsx`, `components/NotEnoughDataList.tsx`, `components/ReliabilityDrawer.tsx`, `components/MetricRow.tsx`;
   - `hooks/useReliabilityRanking.ts`, `hooks/useInspectorReliability.ts`;
   - `lib/format-metric.ts` (formatação de taxa, satisfação, volume, textos de "No data", "Not enough ratings", pro-rata);
   - `components/MetricFailures.tsx` (lista expansível das falhas, L-F07-06) e `components/FreshnessBanners.tsx` (avisos de desatualizado e de recálculo pendente, L-F07-02/L-F07-10; usados na página e no drawer).
2. Router: rota `inspector-performance` com `<AuthGuard roles={[UserRole.AM, UserRole.OP]}>` e `Loadable(lazyRetry(...))`.
3. `Sidebar.tsx`: filho `{ icon: 'mdi-podium', label: 'Inspector performance', to: '/inspector-performance', roles: [AM, OP] }` no `submenu` do Dashboard, **depois de "Workload" e antes de "Goals & rewards"** (ordem canônica do X01, L-X01-03; R4). Sem `backTo` na página (R5).
4. `features/platform-settings/components/ReliabilityIndexSection.tsx` + inclusão em `PlatformSettingsPage.tsx` com âncora `id="reliability-index"` (11 campos, com "Minimum ratings for satisfaction", L-F07-03). Visível e editável para AM e OP (L-F07-11).
4a. **`StatusTransitionDialog.tsx` (L-F07-01, L-F07-04):** trocar `REJECTION_OPTIONS` fixo por `allowedRejectionCodesFrom(currentStatus)` do shared, com rótulos de `reasonCodeLabel`; dica condicional para `INSPECTOR_NO_SHOW` e `NOT_EXECUTED`; erro 422 `REJECTION_CODE_NOT_ALLOWED` exibido no dialog.
5. Tipos de `@properfy/shared` (`api-types.ts` regenerado na TASK-F07-2); sem `as any` (lint zero, memória `project_web_lint_cleanup_fase2c`).
6. **Doc (X00):** `apps/web/CLAUDE.md` — a página nova no grupo Dashboard, o deep link `?inspector=` e a seção de settings.

### Modelo de dados
Nenhum (consome as rotas da TASK-F07-2 e a chave `reliabilityIndex`).

### Métricas (definições)
Exibidas, não calculadas. Rótulos e textos (inglês; `RELIABILITY_METRIC_LABELS`/`DESCRIPTIONS` do shared):

| Chave | Rótulo | Descrição (tooltip / linha secundária) | Valor exibido | Sem dado |
|---|---|---|---|---|
| `PUNCTUALITY` | Punctuality | Check-ins within the booked window or the planned arrival time. | `83%` · `10 of 12 services` | No services to evaluate |
| `GEOFENCE` | On-site check-ins | Check-ins and check-outs within the property radius. | `92%` · `11 of 12 inspections` | No location data in this period |
| `NO_STUCK` | Finished within 6 hours | Inspections finished within 6 hours of check-in. | `100%` · `12 of 12 inspections` | No finished inspections in this period |
| `SATISFACTION` | Tenant satisfaction | Average tenant rating (1–5 stars). Needs at least {minimumRatings} ratings. | `4.25 / 5` · `4 ratings` | No ratings in this period / Not enough ratings · {n} of {minimumRatings} needed (L-F07-03) |
| `LATE_NOTICE` | Late notice given | Late arrivals the inspector warned about before the planned arrival time (or before the booked window, when there is no route plan). | `50%` · `1 of 2 late arrivals` | No late arrivals in this period |
| `CANT_ATTEND` | Attendance | Jobs not dropped with "I can't attend" and not marked as "Inspector didn't attend". | `100%` · `0 dropped of 12` | – (sempre tem dado) |
| `VOLUME` | Completed volume | Completed inspections compared with the median of active inspectors in the same 30 days ({volumeReference}), adjusted for inspectors who joined during the period. Com override: "…compared with a fixed reference of {volumeReference}." | `100%` · `12 completed · median 9.5`; com pro-rata: `10 completed in 12 days · median 9.5 / 30 days` (L-F07-05) | – |
| `DONE_REJECTED` | Accepted work | Completed inspections later found not carried out. | `100%` · `0 not carried out of 12` | No completed inspections in this period |

- Percentual = `Math.round(rate × 100)` só na exibição (a taxa vem com 4 casas).
- Satisfação mostra `averageRating` com 2 casas (sem peso), seguindo o `formatRatingAverage` existente se ele aceitar 2 casas; senão formatar localmente.

### Fórmula
Não recalculada no web. O score vem pronto, com 1 casa.

### Contratos
- `GET /v1/dashboard/inspector-performance` e `GET /v1/dashboard/inspector-performance/:inspectorId` (TASK-F07-2).
- `GET/PUT /v1/platform-settings/reliabilityIndex` (F03 + chave da TASK-F07-1).

### UI

**Página**
- `PageHeader` título **"Inspector performance"**, subtítulo "Last 30 days · {windowFrom} – {windowTo} · Updated {computedAt}" e ação secundária "Configure weights" (link para `/platform-settings#reliability-index`).
- `InfoBanner` fixo e discreto: "Only operations staff can see this page. Agencies never see scores or rankings."
- **Avisos de frescor** (acima da tabela, tom de aviso, `role="status"`): desatualizado (L-F07-02) quando `isStale` e já passa das 05:00 Sydney: "Scores haven't been updated since {snapshotDate}. The nightly job didn't finish; operations has been notified."; recálculo pendente (L-F07-10) quando `settingsUpdatedAt > computedAt`: "Weights were changed at {time}. Scores will update within a few minutes." e, depois de 15 min, "Weights were changed at {time} but scores haven't been recalculated yet. Operations has been notified." Os dois podem aparecer juntos. Sem polling: mudam ao recarregar ou na invalidação.
- "Configure weights" visível para AM e OP (L-F07-11).
- **Tabela "Ranking"** (`DataTable`, sem paginação, sem ordenação clicável; a ordem é o ranking): colunas "Rank" (número, `aria-label` "Rank {n}"), "Inspector" (nome), "Score" (número com 1 casa + barra horizontal decorativa `aria-hidden`), "Services" (volume). Linha clicável e focável (`onRowClick`), com `aria-label` "Open {name} details". Caption visualmente oculto "Inspectors ranked by reliability score".
- **Bloco "Not enough data"** (`PageSectionHeader`): texto "Inspectors with fewer than {minimumVolume} services in the last 30 days are not ranked."; lista com nome e "{volume} of {minimumVolume} services" (ou "No data for the weighted metrics"); cada item abre o drawer.
- Mobile: tabela vira lista (`hideOnMobile` em "Services"), drawer em tela cheia.

**Drawer** (`DrawerPanel size 'narrow'`, `DrawerHeader title={inspectorName}`)
- Cabeçalho: score grande ("78.3") ou "Not enough data" / "No score yet"; "Rank {position} of {rankedCount}"; "{volume} services · last 30 days"; badge "Inactive" quando for o caso.
- 8 linhas `MetricRow` (rótulo, descrição, valor, detalhe, "Weight {n}" ou "Not weighted"). Barra decorativa com o texto do valor ao lado (informação nunca só por cor).
- (L-F07-06) o valor tem `Tooltip` "{weightedSuccess} of {weightedEligible} weighted minutes" (não em SATISFACTION e VOLUME); abaixo da linha, botão "Show {failureCount} issues" (`aria-expanded`) que abre a lista: "{serviceDate} · {detail}" + link "Open appointment" (`/appointments/:id`, mesma aba); com `failureCount > 20`, nota "Showing the 20 most recent of {failureCount}".
- Avisos de frescor da página repetidos no topo do drawer (L-F07-02).
- Rodapé: "Percentages are weighted by service duration and planned travel." e "Scores update every night at 4:15 am."
- Fechar: botão "Close", Escape, clique no fundo; foco volta à linha de origem; remove `?inspector=`.

**Seção "Reliability index" (Platform settings)**
- Título "Reliability index", texto "Weights decide how much each metric counts in the inspector score. Changes apply to today's scores within a few minutes."
- 8 campos numéricos "Weight" (0–10), um por métrica, com o rótulo da tabela acima.
- "Minimum services to be ranked" (1–200), dica "Inspectors below this number show as Not enough data."
- "Fixed volume reference (optional)" (vazio ou 1–1000), dica "Leave empty to use the median completed volume of active inspectors, recalculated every night. Enter a number to use a fixed 30-day reference instead (scaled for shorter or longer goal periods)."
- "Minimum ratings for satisfaction" (1–50), dica "With fewer tenant ratings than this, satisfaction doesn't count in the score." (L-F07-03)
- Botão "Save"; snackbar de sucesso "Reliability settings saved. Scores are being recalculated."; erro genérico "We couldn't save these settings. Try again."

**Estados:** loading, erro com retry, vazio (sem snapshot), só "Not enough data", ranking completo, desatualizado, recálculo pendente/atrasado, drawer (loading, erro, SCORED, INSUFFICIENT_VOLUME, NO_WEIGHTED_DATA, NOT_COMPUTED, INACTIVE, falhas expandidas), settings (carregando, sujo, salvando, erro de validação, erro do servidor).

**Dialog de transição (L-F07-01, L-F07-04):** em `SCHEDULED → REJECTED`, opção "Inspector didn't attend" com dica "This counts against the inspector's reliability score."; em `DONE → REJECTED`, opção "Inspection was not actually carried out" com dica "Only this reason counts against the inspector's reliability score."; erro 422 "This rejection reason can't be used from the current status".

**Acessibilidade (WCAG 2.1 AA):** linhas acionáveis por teclado; foco visível; o drawer prende o foco (`DrawerPanel`) e tem `aria-label` "{name} reliability details"; barras `aria-hidden` com o valor em texto; contraste dos textos atenuados ≥ 4.5:1; campos de settings com `<label>` e mensagens de erro ligadas por `aria-describedby`.

### Casos de borda
- Nome muito longo: truncar com `title`; o drawer mostra completo.
- Inspetor desativado entre o snapshot e a visualização: some do ranking (a API filtra ACTIVE na hora da leitura).
- `?inspector=` com id inválido ou inexistente: drawer mostra "We couldn't find this inspector." e o botão "Close".
- Pesos salvos e a página aberta: a lista só muda quando o job terminar; a invalidação refaz a consulta (pode ainda vir o snapshot antigo, agora com o aviso "Weights were changed at …", L-F07-10). Sem polling.
- Job das 04:15 falhou: ranking de ontem com aviso de desatualizado a partir das 05:00 (L-F07-02); some quando o `ensure-today` refizer e a página recarregar.
- Link de falha para appointment apagado (`deleted_at`) ou de agência desativada: a página de detalhe existente mostra o próprio estado de não encontrado (L-F07-06).
- Dialog aberto num appointment cujo status mudou por outra aba: o servidor recusa o código com 422 e o dialog mostra a mensagem.
- `minimumVolume` do snapshot diferente do atual (alterado hoje antes do recálculo): o texto usa o do snapshot (o que vale para aquele ranking).

### Fora do escopo
- Coluna **"Level"**: é da **tarefa web da F08**, que a acrescenta nesta página e no ranking. A F07 não cria coluna, placeholder nem campo para ela.
- Histórico, gráfico, exportação, busca e filtros.
- Alterar `DashboardPage`, `AnalyticsPage` ou `InspectorWorkloadPage` (D5).
- Tela para agências ou para o inspetor.

### Critérios de aceite (03.A1)
- A seção de settings grava os pesos e informa o recálculo; depois do job, a página mostra o score novo (QA no navegador com backend local: Ana 88.3 → 87.3 com `PUNCTUALITY: 3`).
- 03.11/03.12: ranking da janela de 30 dias com posição, nome, score e volume; bloco "Not enough data"; drawer com as 8 métricas.
- Só AM/OP veem o item e a rota; AM e OP veem "Configure weights" e salvam a seção (L-F07-11).
- Ranking desatualizado e recálculo pendente aparecem como aviso (testes 3, 4; L-F07-02, L-F07-10).
- O drawer lista as falhas de cada métrica com link para o appointment e mostra os minutos ponderados (teste 4; L-F07-06).
- "Not enough ratings" e o volume com pro-rata aparecem no drawer; a seção tem "Minimum ratings for satisfaction" (testes 4, 5; L-F07-03, L-F07-05).
- O dialog oferece `INSPECTOR_NO_SHOW` só em `SCHEDULED → REJECTED` e `NOT_EXECUTED` só em `DONE → REJECTED` (teste 7; L-F07-01, L-F07-04).

### Dependências
- TASK-F07-2 (rotas e api-types), X01 (grupo Dashboard), F03-4 (página "Platform settings").

### Riscos e armadilhas
- **Cache do typecheck do web** pode esconder erro de tipo da api-types nova (memória `project_web_typecheck_incremental_cache_lies`): rodar com cache limpo.
- **Teste do Sidebar** depende da ordem dos filhos que F02/F05 acrescentaram: comparar por rótulo, não por índice.
- **QA no navegador é obrigatório** (memória `feedback_qa_must_test_in_browser`): rodar o job local com seed (disparar o handler direto, sem esperar os 35 s); screenshots nunca no commit.

### Deploy / rollout / rollback
- **Deploy:** só front; depois do backend da TASK-F07-2 em produção.
- **Rollout:** o item aparece para AM/OP no próximo carregamento (o `stale chunk retry` existente cobre o lazy import).
- **Rollback:** reverter o PR; a API e o job continuam rodando sem efeito visível.

### Dias · Branch · Verificação
- **Dias:** 2,375 = 03.11/03.12 web 1,5 (página, bloco, drawer, estados, a11y) + 03.A1 0,25 (seção "Reliability index") + lacunas 0,625.
  - **Lacunas de 2026-10-29: +0,625.** L-F07-01/L-F07-04 0,125 (opções por origem e dicas no `StatusTransitionDialog`); L-F07-02/L-F07-10 0,125 (avisos de frescor na página e no drawer); L-F07-03 0,125 (campo novo + "Not enough ratings"); L-F07-06 0,25 (lista de falhas, links, tooltip). L-F07-05 e L-F07-11 sem custo relevante (texto e teste).
  - **Reconciliação de 2026-10-29: 0.** R4 (posição no menu e testes no `Sidebar.roles.test.tsx` sem mocks; a infraestrutura de teste é do X01), R5 (sem sub tela com `backTo`) e R3 (fuso de exibição) não mudam o trabalho.
- **Branch:** `feat/f07-inspector-performance-web` a partir de `develop` (depois do merge da TASK-F07-2), em worktree. ~22 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build`; `pnpm --filter web typecheck lint test`; QA no navegador com backend local nos estados acima (AM e OP; CL_ADMIN sem acesso); `git diff --stat origin/develop... | tail -1` < 150.

---

## Contratos exportados para a F08

1. **`computeMetric`** — `ReliabilityMetricsService.computeMetric(metric: ReliabilityMetricKey, inspectorId: string, from: CivilDate, to: CivilDate): Promise<ReliabilityMetricResult>` em `apps/backend/src/modules/reliability/application/reliability-metrics.service.ts`, acessível por `container.reliability.metricsService`. Para muitos inspetores de uma vez (fechamento de período): `computeAll(from, to, inspectorIds?)` → `ReliabilityComputationBatch` (`{ volumeReference, byInspector }`, uma passada). `from`/`to` = datas civis inclusivas; qualquer tamanho de período.
   - O resultado traz `volume` (serviços do inspetor no período): a F08 aplica o seu volume mínimo nas metas de taxa com ele.
   - `CANT_DO_MAX` da F08 = `1 − rate` da métrica `CANT_ATTEND`.
   - Volume de metas: `completedCount` / `successCount` de `VOLUME`. **Data do serviço = P2 da F07** (L-F07-08, 2026-10-29): `finished_at` no fuso da agência para DONE executado, `scheduled_date` para DONE sem execução própria, `created_at` do evento para `CANT_ATTEND`. Não é "só `finished_at`".
   - A `rate` de `VOLUME` usa a mediana dos ativos **do período pedido** (P11), calculada uma vez por chamada de `computeAll`. Se a meta da F08 quiser a referência do índice diário, deve ler `settings_json.volumeReference` do snapshot.
   - **Override escalado (L-F07-09):** com `volumeReferenceOverride`, a referência do período é `max(1, roundToHalf(override × periodDays / 30))` (`batch.volumeReference.periodDays`); metas semanais com override 20 usam 4,5.
   - **Pro-rata (L-F07-05):** `VOLUME.rate` já considera `activeDays` (inspetor cadastrado no meio do período).
   - **Métrica 8 (L-F07-04, L-F07-07):** só `NOT_EXECUTED` penaliza; uma rejeição tardia entra no período da rejeição. O fechamento da F08 é definitivo: rejeições posteriores ao fechamento afetam só o índice.
   - Cada resultado traz `failures`/`failureCount` (L-F07-06); a F08 pode ignorá-los.
   - **Escopo opcional `{ regionId?, serviceTypeId? }`** para metas por região ou tipo de serviço: é da **F08** (decisão do coordenador, 2026-10-28). A F07 não o implementa; a F08 estende `computeMetric`/`computeAll` e o leitor de fatos.
2. **Enum das métricas** — `ReliabilityMetricKey`, `RELIABILITY_METRIC_KEYS` (ordem canônica), `RELIABILITY_METRIC_LABELS`, `RELIABILITY_METRIC_DESCRIPTIONS`, `ReliabilityScoreStatus` em `packages/shared/src/enums/reliability.ts`; `reliabilityMetricResultSchema` em `packages/shared/src/schemas/reliability.ts`. Chaves alinhadas com o `Goal.metric` da F08: `PUNCTUALITY`, `GEOFENCE`, `NO_STUCK`, `SATISFACTION`, `LATE_NOTICE` (iguais) e `CANT_DO_MAX` ↔ `CANT_ATTEND`.
3. **Leitura de snapshots** — porta `IReliabilitySnapshotRepository` em `apps/backend/src/modules/reliability/domain/reliability-snapshot.repository.ts`: `findLatestSnapshotDate(): Promise<CivilDate | null>`, `findByDate(date): Promise<ReliabilitySnapshot[]>`, `findLatestForInspector(inspectorId): Promise<ReliabilitySnapshot | null>`, `findForInspectorBetween(inspectorId, from, to): Promise<ReliabilitySnapshot[]>` (histórico diário). Tabela `inspector_reliability_snapshots`, unique `(inspector_id, snapshot_date)`, sem `tenant_id`. **Retenção de 400 dias** e sem linhas de inspetor apagado (L-F07-12): a F08 não pode depender de histórico mais antigo.
4. **Índice atual** — `ReliabilityIndexReader.getCurrentIndexes(inspectorIds?: string[]): Promise<Map<string, { score: number | null; status: ReliabilityScoreStatus | 'NOT_COMPUTED'; snapshotDate: CivilDate | null; position: number | null }>>` em `apps/backend/src/modules/reliability/application/reliability-index.reader.ts` (`container.reliability.indexReader`). "Atual" = última `snapshot_date` existente; `position` = ranking de competição entre **todos** os ACTIVE com `SCORED` do snapshot, da plataforma inteira: **não pode ser recortado por região** (nem tipo de serviço ou agência), e o filtro `inspectorIds` só recorta a saída (R2, L-F08-07, 2026-10-29). A F08 depende disso no ranking anônimo do app (03.A3). **`snapshotDate` pode ser anterior a hoje** (job falho, L-F07-02/L-F07-08): o consumidor **não pode assumir** `snapshotDate = hoje` e decide o que fazer; a F08 grava `index_snapshot_date` no fechamento.
5. **Entrada do nível** — o nível da F08 (3 faixas no `PlatformSetting` da F08) é função **só** de `score` do índice atual: `score null` (status ≠ `SCORED`) = sem nível. Desempate do 03.8 "pelo índice" usa o mesmo `score`.
6. **Recálculo** — job `reliability.compute-snapshots` (`{ trigger }`), reforço `reliability.ensure-today` (05:00–12:00 Sydney, L-F07-02) e evento `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'`, **emitido pela F03** (D29, L-F03-10; payload `{ key, before, after, actorId, occurredAt }`), que a F07 assina para `reliabilityIndex` e a F08 pode assinar para as próprias chaves (R1).
7. **Rotas AM/OP** — `GET /v1/dashboard/inspector-performance` e `GET /v1/dashboard/inspector-performance/:inspectorId` (com `isStale`, `settingsUpdatedAt`, `minimumRatings` e `failures`, 2026-10-29).
8. **Sem `getUncached`** (L-F07-08): a F07 não entrega `getUncached(key, tx)`; o recálculo usa o atraso de 35 s sobre o cache de 30 s. O campo de nível nesta resposta e a coluna "Level" na página são da F08 (tarefa web da F08). O INSP não tem rota na F07; o `GET /v1/inspector/program` da F08 lê pela porta do item 3/4.

---

## Achados para revisão

Fechados pelo dev em 2026-10-28:
- **Aviso antecipado (P4):** o limite é a ETA publicada da parada, com fallback no início da janela, comparada com o horário efetivo da F03. Isso resolve também a dúvida "`created_at` × horário do cliente".
- **Referência de volume (P11):** mediana dos ativos na janela, piso 1, uma vez por execução, com override opcional. Isso também resolve o achado antigo de "a referência fixa 60 achata o score".
- **Aceitos como propostos:** universo e atribuição (P1); métrica 3 pela duração (P3); renormalização (P5); geofence com precisão ruim (P6); fator de deslocamento 1 (P7); janela até ontem (P8); backend em 2 PRs (P10).
- **Revisão de 2026-10-28:** o índice `(action, created_at)` em `audit_logs` saiu, porque `(action)` basta para as linhas raras de `done_rejected`. Cada DONE agora é atribuído ao inspetor do appointment no momento do DONE, não à linha de execução. Saíram também o recálculo ao salvar `fieldEvents`, o kill switch e o `getUncached`, este trocado por um atraso de 35 s. A coluna "Level" é da F08.
- **Escopo por região e tipo de serviço:** fica com a F08.

Em aberto:

1. **`done_rejected` sem inspetor.** A atribuição atual não precisa dele (vem do `releasedInspectorId` do `status_transition` pareado). Gravar `inspectorId` no metadata do `appointment.done_rejected` simplificaria a consulta Q2; é mudança fora do escopo, recomendada para o estacionamento.
2. **Mediana com população pequena.** Com poucos inspetores ativos, a mediana fica baixa e quase todos chegam a `VOLUME = 1`. Exemplo: com 3 ativos de 4, 6 e 30 DONE, a referência é 6. O `volumeReferenceOverride` é a válvula. Mostrar os números reais de staging no onboarding.
3. **Dados anteriores à F03/F04.** Execuções sem `geofence_radius_m` saem das métricas 1 e 2. Serviços sem plano usam a duração do tipo, sem previsto e com o aviso antecipado medido pelo início da janela. Se a F07 for ao ar menos de 30 dias depois da F03/F04, os primeiros rankings terão menos dados.
4. **Reoferta depois de DONE → REJECTED não pode ser executada no app.** A execução é única por appointment, e o `start` recusa uma execução finalizada (`start-inspection.use-case.ts:149-151`). O reinício da F03 só cobre execução abandonada. O novo inspetor depende da OP para o DONE e recebe `DONE_WITHOUT_EXECUTION` (`NO_SHOW` na pontualidade) sem culpa dele. Corrigir (reiniciar ou arquivar a execução no DONE → REJECTED) é fora do escopo da F07; recomendar estacionamento ou um ajuste da F03.

Fechados pelo dev em 2026-10-29 (lacunas `lacunas/F07-lacunas.md`, todas as recomendações aceitas):
- **L-F07-01:** `INSPECTOR_NO_SHOW` como 4ª origem; `CANT_ATTEND` com ≥ 24 h de antecedência fora da pontualidade.
- **L-F07-02:** log `error` em toda falha, `reliability.ensure-today` horário (05:00–12:00), `isStale` na API e aviso na página.
- **L-F07-03:** `minimumRatings` (default 3).
- **L-F07-04:** `NOT_EXECUTED` é o único `DONE → REJECTED` que penaliza; o achado em aberto 1 (`done_rejected` sem inspetor) continua válido, mas agora o código também vem do `metadata.rejectionReasonCode` gravado por esta feature.
- **L-F07-05:** pro-rata do volume por `created_at`. **Limitação aceita:** licença, pausa e reativação **não** são proporcionais (o modelo só tem `ACTIVE | INACTIVE`, sem histórico). "Pausa do inspetor" é pedido de produto, recomendado para o estacionamento (F01).
- **L-F07-06:** lista de falhas (até 20) por métrica e tooltip de minutos ponderados.
- **L-F07-07:** rejeição `NOT_EXECUTED` tardia entra pela data da rejeição, só na métrica 8.
- **L-F07-08:** contrato com a F08 corrigido (data do serviço = P2; `snapshotDate` pode ser antigo; sem `getUncached`).
- **L-F07-09:** override escalado pelo tamanho do período.
- **L-F07-10:** `settingsUpdatedAt` + aviso de recálculo pendente + `reliability.recompute_overdue`.
- **L-F07-11:** "Configure weights" para AM e OP, como o `PUT` da F03.
- **L-F07-12:** retenção de 400 dias e expurgo de inspetor apagado.

---

## Ajustes necessários em outras tarefas (para reconciliar)

- `F08-tarefas.md` (Contexto, linha ~107): remover `getUncached(key, tx)` da lista do que a F03/F07 entregam; a F07 não o implementa (L-F07-08).
- `F08-tarefas.md` (D6 e textos que dizem "data = `finished_at` no fuso da agência"): trocar por "data do serviço = P2 da F07 (`finished_at` para executados, `scheduled_date` para DONE sem execução, `created_at` do evento para `CANT_ATTEND`)" (L-F07-08).
- `F08-tarefas.md` (algoritmo de fechamento, passo 6, linha ~592): não assumir que às 04:45 o snapshot de hoje existe; gravar `index_snapshot_date` no fechamento e decidir o comportamento com `snapshotDate < hoje` (L-F07-02, L-F07-08).
- `F08-tarefas.md` (metas `VOLUME`/`INDEX_AT_LEAST` e testes com override): a referência com `volumeReferenceOverride` passa a ser escalada pelo período (`override × periodDays / 30`, arredondado a 0,5, piso 1) e `VOLUME` tem pro-rata por `activeDays`; ajustar valores esperados (L-F07-09, L-F07-05).
- `F08-tarefas.md` (histórico de níveis/sequência e fechamento): confirmar que não lê snapshots com mais de 400 dias nem de inspetor apagado, e registrar que o fechamento é definitivo e rejeições `NOT_EXECUTED` posteriores afetam só o índice (L-F07-12, L-F07-07).
- (encaminhado) `F03-tarefas.md` (TASK-F03-2 teste `reason-codes.test.ts` "exactly 9 codes" e lista "todos os lugares que listam/validam códigos de rejeição"): a F07 acrescenta `INSPECTOR_NO_SHOW` e `NOT_EXECUTED` (total 11) e `allowedRejectionCodesFrom`; rótulos de e-mail/portal da F03 e o filtro de `SYSTEM_ONLY_REJECTION_CODES` no `StatusTransitionDialog` devem conviver com o filtro por origem (L-F07-01, L-F07-04).
- `F03-tarefas.md` (contrato §3, "Regra para consumidores"): o texto "aviso antecipado compara `LATE_NOTICE.created_at` com o início do slot" está superado (P4 da F07) e o `CANT_ATTEND` agora tem regra de antecedência de 24 h na F07 (L-F07-01).
- (resolvido 2026-10-29) Plausibilidade do horário do cliente: a F07 segue a F03 D25 (−7 dias / +5 min); nenhuma menção a "até 24 h antes" resta (R6).
- (resolvido 2026-10-29) Referência do "Vou atrasar N min" (F03 D23 revisada): P4 inalterada (R7).
