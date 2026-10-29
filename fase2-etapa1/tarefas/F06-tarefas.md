# F06 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | F06 · Avisos de horário ao inquilino (contrato 01.10, 01.12, 01.12-B = 01.15 após a Q4; critérios **01.A7** e **01.A5** parte inquilino) |
| **Total** | **8,625 dias** (plano: 6,0; +1,25 em 2026-10-28 e +1,375 das lacunas em 2026-10-29, justificados abaixo) |
| **Tarefas / PRs** | 2, conforme a "Quebra em PRs" do plano: **TASK-F06-1** (shared + backend + seção web: templates, variáveis, configuração, **módulo único de previsão `projectStopEta` no shared**) → **TASK-F06-2** (backend: gatilhos matinal, "a caminho" e atraso) |
| **Depende de** | **F04-2** (`DayPlan`/`DayPlanStop`, `getFreshStopForAppointmentUseCase`, `published_service_start_at`, `travel_s` por parada, STALE); **F04-1** (`evaluateSequence`, `toOptimizerInput` no shared); **F03-1** (`PlatformSetting`, `IPlatformSettingsReader`, página "Platform settings"); **F03-2** (`InspectorFieldEvent` `LATE_NOTICE`, `INSPECTOR_FIELD_EVENTS.RECORDED`, fluxo CANT_DO → REJECTED com `metadata.source = 'INSPECTOR_CANT_DO'`, `abandoned_at`) |
| **Bloqueia** | F05 consome `projectStopEta` (contrato exportado §3) |
| **Código verificado em** | `origin/develop` @ `042a9674` (snapshot read-only, 2026-10-27). O que F03 e F04 entregam é tratado como existente (mergeado antes), pelos contratos exportados de `F03-tarefas.md` e `F04-tarefas.md`. |
| **Decisões** | **2026-10-27** (`F06-avisos-horario-inquilino.md`, `decisoes.md`): Q21, Q3, matinal 07:00 só até 09:00, faixa ±30 min recortada pela janela, 1 aviso de atraso por parada por dia, "a caminho" quando a parada anterior termina, ordem salva. **2026-10-28 (dev):** reserva de 20% do teto de SMS para avisos obrigatórios; "a caminho" também no "Não consigo fazer"; sem avisos com o switch da agência desligado; limite de atraso próprio (20 min); comportamento com plano aproximado e base do "Vou atrasar" documentados. **2026-10-29 (dev, lacunas `lacunas/F06-lacunas.md`, todas as recomendações aceitas):** "a caminho" só com chegada em até 60 min (L-F06-01); sem avisos a inquilino indisponível ou não confirmado com chave (L-F06-02); posição "factual/operacional" + opt-out manual AM/OP (L-F06-03); só o check-out do inspetor dispara o "a caminho" (L-F06-04); correção única por antecipação ≥ 30 min (L-F06-05); flag por agência `tenantEtaNoticesEnabled` (L-F06-06); contrato do `projectStopEta` fixado para a F05 (L-F06-07); copy neutro do e-mail "a caminho" (L-F06-08); `upsert` de template exige as variáveis obrigatórias (L-F06-09); `section` = rótulo (L-F06-10); métricas obrigatórias de volume e partes de SMS (L-F06-11). **2026-10-29 (reconciliação com F02/F03/F04/F05/X00):** reserva de SMS não cobre o `INSPECTOR_NOTICE_SMS` (D15); fuso por campo conforme N13 (D8); `serviceStartAt`/`planVersion`/`approximate` no `payloadJson`; adaptador só para o PWA; portal bloqueado para `INSPECTOR_UNABLE` (caso de borda 3f). Q4 (só renumeração) segue PENDENTE e não afeta o código. |

**Estimativa: 6,0 → 7,25 → 8,625 dias** (revisão de 2026-10-28, números realistas por passo; +1,375 em 2026-10-29 pelas lacunas L-F06-01..11). O escopo do plano não foi cortado; os acréscimos vêm das decisões de 2026-10-28, das lacunas aceitas em 2026-10-29 e de custo real que o plano não tinha. Sem folga embutida.

Distribuição do plano pelas 2 tarefas: Templates 1,0 + Previsão 1,5 → TASK-F06-1; 01.12-B 1,0 + 01.10 1,0 + 01.12 1,5 → TASK-F06-2.

| Tarefa | Itens do plano | Plano | Agora | Delta e motivo |
|---|---|---|---|---|
| TASK-F06-1 | Templates 1,0 + Previsão 1,5 | 2,5 | **3,5** | **+0,5 (2026-10-29):** opt-out manual AM/OP (use case + rota + modal web) 0,25 (L-F06-03); flag `tenantEtaNoticesEnabled` no schema da agência + checkbox no `TenantFormDrawer` 0,125 (L-F06-06); `upsert` de template exige variáveis `required` 0,125 (L-F06-09). L-F06-02 (colunas de confirmação no leitor), L-F06-07, L-F06-08 e L-F06-10 (texto/copy) e `addSmsParts` (L-F06-11) cabem nos itens existentes. **+0,25 chave `tenantEtaNotices` + seção web.** O plano diz "configurável na plataforma" e "troca de canal só por configuração" sem custear a chave nem a tela; o contrato da F03 (§1) exige seção web para chave nova. **+0,25 `CreateNotificationOutput.created`.** O notificador precisa saber se a linha foi criada ou já existia; mudar o formato da saída obriga a revisar os ~24 arquivos de teste que fazem mock/stub do `CreateNotificationUseCase` e os 15 chamadores em `src/`. O módulo de previsão ir para o shared (exportado para a F05) cabe no 1,5 da Previsão: é o mesmo código, só muda o pacote e o adaptador `etaPlanInputFromDayPlanResponse`. |
| TASK-F06-2 | 01.12-B 1,0 + 01.10 1,0 + 01.12 1,5 | 3,5 | **5,125** | **+0,875 (2026-10-29):** limite de antecedência do "a caminho" 0,125 (L-F06-01); pular inquilino indisponível/não confirmado com chave 0,125 (L-F06-02); filtro do FINISH por `source 'INSPECTOR_FINISH'` + `auditMetadata` no finish 0,125 (L-F06-04); correção por antecipação (`EARLY_CHANGE`, leitura das faixas do matinal) 0,25 (L-F06-05); checagem da flag por agência 0,125 (L-F06-06); métricas obrigatórias + volume diário 0,125 (L-F06-11). **0 no 01.10** (o −0,25 da versão anterior saiu: a regra da "próxima parada", o subscriber, o reenfileiramento por STALE e a escolha de uma parada que está no plano têm custo próprio). **+0,25 reserva de SMS** (decisão 1: leitura do teto da agência, contador existente, % em configuração, fallback de canal, testes). **+0,25 "a caminho" no CANT_DO** (decisão 2: subscriber de REJECTED com `source 'INSPECTOR_CANT_DO'`, leitura do plano por inspetor e data, porque o appointment rejeitado já saiu do plano, dedupe compartilhado com o DONE, testes). **+0,25 amplitude de testes:** ~60 casos com integração ponta a ponta em banco (canais, consentimento por canal, switch, flow type), corrida de 3 gatilhos e workers; o plano custeava os gatilhos, não essa matriz. |
| **Total** | | **6,0** | **8,625** | **+2,625** = +0,25 configuração/tela + 0,25 `created` + 0,25 reserva de SMS + 0,25 CANT_DO + 0,25 testes (2026-10-28) + 0,5 F06-1 e 0,875 F06-2 das lacunas (2026-10-29) |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F06-1 | Shared + backend + web: 3 códigos de template (`TENANT_ETA_MORNING`, `TENANT_ETA_ON_THE_WAY`, `TENANT_ETA_DELAY`) × e-mail + SMS, variáveis `etaFrom`/`etaTo`, chave `tenantEtaNotices` + seção "Tenant arrival notices", **`projectStopEta` no shared (`route-planning`)**, faixa `computeEtaBand`, leitor do plano, ID determinístico, `CreateNotificationOutput.created`, log e métrica de custo de SMS, opt-out manual AM/OP, flag `tenantEtaNoticesEnabled` por agência, validação de variáveis obrigatórias no `upsert` de template | 3,5 | F04-1, F04-2, F03-1, F03-2 |
| TASK-F06-2 | Backend: job `tenant-eta.morning` (tick 07:00 local, envio só até 09:00), subscribers de check-out (DONE com `source 'INSPECTOR_FINISH'`), de CANT_DO → REJECTED e de `LATE_NOTICE` → job `tenant-eta.evaluate` ("a caminho" com antecedência ≤ 60 min + atraso + correção por antecipação), varredura `tenant-eta.sweep-delays` a cada 30 min, notificador com pré-checagens (flag da agência, confirmação do inquilino), reserva de SMS, dedupe "1 por parada por dia" e métricas de volume | 5,125 | TASK-F06-1 |
| **Total** | | **8,625** | |

Ordem de merge: F06-1 → F06-2. A F06-1 sozinha não envia nada (só registra templates, configuração e o módulo de previsão).

## Decisões que valem para as 2 tarefas

Datas: **2026-10-27**, salvo indicação. Cada tarefa cita as que se aplicam.

- **D1 · Canal (Q21).** Cada gatilho envia **e-mail se o contato tem e-mail** e **SMS se o contato tem telefone**, os dois quando houver os dois. Sem nenhum dos dois, nada é enviado. O contato é o mesmo dos avisos atuais ao inquilino: `AppointmentWithRelations.contact` (`effectiveEmail`, `effectivePhone`).
- **D2 · Consentimento por canal.** Os templates são `RENTAL_TENANT` e `OPERATIONAL`, então o pipeline existente (`send-notification.use-case.ts`) aplica, por linha: supressão por flow type (`isSuppressedByFlowType`), switch da agência (`checkAgencyOccupantSwitch`), consentimento por canal (`isBlockedByConsent`, `findByScope({ tenantId, recipient, channel, notificationClass })`) e teto diário (`isOverDailyBudget`).
- **D3 · Aviso matinal.** Às **07:00 locais da agência** (`tenantEtaNotices.morningHour`, padrão 7), **enviado só até 09:00** (`morningCutoffHour`, padrão 9). Se o job atrasar e passar das 09:00, o aviso **não** é enviado naquele dia.
- **D4 · Faixa de ±30 min recortada pela janela.** O texto mostra "between {{etaFrom}} and {{etaTo}}", nunca a janela inteira de novo (risco do plano). Regras exatas em "Algoritmo" (§B) da TASK-F06-1.
- **D5 · 1 aviso de atraso por parada por dia.** Contado desde a meia-noite local da agência. O "a caminho" continua chegando quando a parada anterior termina, mesmo depois de um aviso de atraso.
- **D6 · Ordem salva do plano.** Sempre a sequência gravada em `day_plan_stops` (inclusive a reordenada pelo inspetor, decisão F04 D3), lida fresca pela F04 (`getFreshStopForAppointmentUseCase`).
- **D7 · Sem rastreamento (Q3) e um só módulo de previsão.** A previsão parte do **último evento real** (check-in/check-out, DONE) + trechos do plano (`travel_s`) + duração do tipo, com **partida ≥ agora**, a mesma regra do app do inspetor (`toOptimizerInput` da F04). Inquilino, app e F05 nunca discordam: todos usam `projectStopEta` do shared (revisão de 2026-10-28). O `LATE_NOTICE` entra como piso (D18).
- **D8 · Tempo.** Instantes em UTC; janelas = horário de parede **da agência** do appointment (`window_start_at`/`window_end_at`/`window_timezone` do `DayPlanStop`, já DST-safe pela F04 D14). Todo texto ao inquilino é formatado no fuso da agência daquela parada. "Hoje" de cada parada = `scheduled_date` do appointment, que é a data civil da agência.
  - **Fuso por campo (2026-10-29, reconciliação X00, N13, L-X00-03).** Agência (`tenants.timezone`, parede): `scheduled_date` e a data do ID de dedupe; `window_start_at`/`window_end_at` (convertidas por `window_timezone` da parada); `morningHour`/`morningCutoffHour` e o "antes do horário matinal" (D3, D13); a meia-noite do "1 por parada por dia" (D5) e das leituras `alreadyNotified`/`findMorningBands`; `etaFrom`/`etaTo` e todo texto ao inquilino. Fuso do plano (`day_plans.timezone`, F04): `plan_date` e o "hoje" da varredura. `PLATFORM_TIMEZONE`: os schedules do pg-boss (`tenant-eta.morning` de hora em hora, `tenant-eta.sweep-delays`). UTC (instantes): `published_service_start_at`, `service_start_at`, `occurredAt`, `etaBandFromAt`, `projectedStartAt`, `now`, e o balde do teto de SMS (D15, comportamento existente). `users.timezone` não é usado pela F06 (só exibição).
- **D9 · Sem `tenant_id` no plano.** `DayPlan`/`DayPlanStop` são cross-tenant (exceção F04 D10 ao §7.1 do CLAUDE.md). A F06 **lê** o plano inteiro do inspetor (paradas de várias agências) só para calcular horários; cada notificação é criada com o `tenant_id` do appointment do destinatário, e nenhum dado de uma agência vai para o inquilino de outra. Cada spec registra essa exceção.
- **D10 · Sem avisos com o switch da agência desligado (dev, 2026-10-28, aceito).** Antes de criar as linhas, a F06 pula (sem criar nada) quando: `tenantEtaNotices.enabled = false`; o switch `rentalTenantNotificationsEnabled` da agência está desligado; o flow type do serviço não tem ocupante (`suppressesOccupantNotifications`). Assim o pipeline não espelha cada aviso para a agência (`TENANT_NOTICE_FORWARDED_AGENCY`, até 6 e-mails por inspeção). O pipeline continua como rede de segurança.
- **D11 · Códigos sem sufixo `_SMS`.** Cada código tem **duas linhas** de template (EMAIL e SMS), como o `TENANT_PORTAL_LINK`. Nada de `TENANT_ETA_*_SMS`, porque o `templateFamily()` do `notify-on-status-transition.handler.ts:84` dobra `_SMS` no código de e-mail e já causou supressão cruzada. O dedupe da F06 é por **código exato + appointment + data + canal**, nunca por família, e os 3 códigos **não** entram em `STATUS_TRANSITION_TEMPLATE_CODES` nem em `RENTAL_TENANT_NOTICE_CODES`.
- **D12 · Sem link do portal.** Reagendar pelo aviso está fora do escopo; os avisos não carregam `confirmationLink` (nem tocam o token do portal). O de atraso orienta a falar com a equipe, com o texto que já existe (`CONTACT_TEAM_SENTENCE`).
- **D13 · Nenhum aviso antes do horário matinal (escolha desta quebra).** O "a caminho" e o atraso também não são enviados antes de `morningHour` local da agência. Evita SMS de madrugada a partir de um plano com estouro. Ver Achado 2.
- **D14 · Sem migration.** A F06 não muda o schema: templates entram pelo `syncPlatformTemplates` no boot, a configuração é uma chave do registro do `PlatformSetting` (defaults no código), o dedupe usa a PK da `notifications` (ID determinístico) e a contagem por `created_at`.
- **D15 · Reserva do teto de SMS (dev, 2026-10-28).** Os SMS de horário **param** quando a agência atinge **80%** do teto diário de SMS (`tenantEtaNotices.smsBudgetSharePercent`, padrão 80). Os 20% restantes ficam para os avisos obrigatórios. Os e-mails de horário continuam. O contador é o existente (`notificationRepo.countByTenantChannelSince(tenantId, 'SMS', início do dia UTC)`, o mesmo do `isOverDailyBudget`, `send-notification.use-case.ts:724–730`), com o teto da agência (`settings.notificationDailyCapSms`, padrão 100, l. 718). **O balde é por dia UTC** (meia-noite UTC = 10:00/11:00 de Sydney), não por dia local; corrigir isso está fora do escopo. **Escopo da reserva (2026-10-29, reconciliação F02, L-F02-01):** a reserva e o contador são por tenant e **não** cobrem o `INSPECTOR_NOTICE_SMS` da F02 (aviso de plataforma, `tenantId null`, fora do `countByTenantChannelSince(tenantId, …)`), que tem teto próprio `INSPECTOR_NOTICE_SMS_DAILY_CAP`; um não consome a cota do outro.
- **D16 · "A caminho" também no "Não consigo fazer" (dev, 2026-10-28).** Quando a parada anterior termina por CANT_DO → REJECTED (F03 D1/D2), o inquilino da próxima parada recebe o "a caminho", com o mesmo dedupe do DONE.
- **D17 · Plano aproximado (dev, 2026-10-28, aceito).** Com `approximate true` (trechos do stub em linha reta), os 3 avisos são enviados normalmente; a faixa de 1 hora absorve o erro, e o log `tenant_eta.notice_created` carrega `approximate: true` para medir na homologação. Sem texto diferente para o inquilino.
- **D18 · Base do "Vou atrasar" (dev, 2026-10-28, aceito; alinhada à F03 D23 em 2026-10-29).** "Vou atrasar N min" na parada X = início de X **não antes de** `estimatedArrivalAt = max(reference, effectiveNoticeAt) + N`, com `reference = published_service_start_at(X)` (o horário congelado na publicação, que é o que o inquilino ouviu) e, sem valor publicado, o **início da janela** (mesma regra e mesma função `computeEstimatedArrivalAt` da F03; `effectiveNoticeAt = resolveEffectiveEventTime(client_occurred_at, created_at).effectiveAt`). Vale só enquanto X não começou e só o último aviso do dia. **Confirmado consistente com a F03 D23 revisada (dev, 2026-10-29).**
- **D19 · Limite de atraso próprio (dev, 2026-10-28, aceito).** `tenantEtaNotices.delayThresholdMinutes` (padrão 20, o valor de onboarding), sem override por inspetor e sem depender dos limites da F05.

---

## TASK-F06-1 · Shared + backend + web: templates, variáveis, configuração e módulo único de previsão

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F04-1, TASK-F04-2, TASK-F03-1, TASK-F03-2
> - **Desbloqueia:** TASK-F05-1, TASK-F06-2
> - **Pode rodar em paralelo com:** TASK-F04-5, TASK-F04-3, TASK-F07-1
> - **Pista sugerida (time de 6):** B · Backend de integração

### Objetivo
- Registrar os 3 códigos de template do inquilino (`TENANT_ETA_MORNING`, `TENANT_ETA_ON_THE_WAY`, `TENANT_ETA_DELAY`), cada um com uma linha **EMAIL** e uma **SMS**, nos 6 lugares do shared, no catálogo de seed do backend e no montador de payload, com as variáveis novas `etaFrom` e `etaTo`.
- Criar a chave de plataforma `tenantEtaNotices` (liga/desliga, modo de canal, hora matinal, hora-limite, limite de atraso) e a seção "Tenant arrival notices" na página web "Platform settings".
- Criar e **exportar no shared** (`packages/shared/src/route-planning/project-stop-eta.ts`) o **módulo único de previsão** `projectStopEta(plan, events, now)`: função pura sobre o `evaluateSequence` da F04, com a mesma regra de partida do `toOptimizerInput` (partida ≥ agora). O app do inspetor, os avisos ao inquilino e a F05 usam a mesma função, então nunca discordam. Junto, o adaptador `etaPlanInputFromDayPlanResponse` para quem já tem o `DayPlanResponse` (só o PWA; a F05 monta o `EtaPlanInput` das linhas brutas com `toEtaPlanInput`, 2026-10-29, reconciliação F05, L-F05-10).
- Criar a faixa `computeEtaBand(...)` (backend, só a F06 usa), provada por exemplos numéricos.
- Criar o leitor `ITenantEtaPlanReader` (plano por id ou por inspetor e data, estado de execução, último `LATE_NOTICE` do dia) e o ID determinístico de notificação `getTenantEtaNotificationId`.
- Estender `CreateNotificationOutput` com `created: boolean`, para o notificador saber se a linha foi inserida ou já existia.
- Acrescentar ao envio de SMS um log de custo (partes e codificação) que vale para todo SMS.
- Nada é enviado neste PR.

### Contexto no código
- **Catálogo de templates (shared):** `packages/shared/src/constants/notification-templates.ts`
  - `MANDATORY_TEMPLATE_CODES` (l. 30; dirige a UI de templates por agência; o `TENANT_PORTAL_LINK` e o `INSPECTION_SATISFACTION_SURVEY` são precedentes de código de inquilino customizável);
  - `TEMPLATE_CODE_LABELS` (l. 145, `Record<MandatoryTemplateCode, string>`);
  - `TEMPLATE_TARGETS` (l. 266, tipado sobre a união completa: é o único lugar que o compilador cobra; o docblock pede listar o novo ponto de despacho);
  - `DEFAULT_TEMPLATE_CLASSIFICATIONS` (l. 354) e `PROTECTED_TEMPLATE_CLASSIFICATIONS` (l. 328; **não** usar: protegido = TRANSACTIONAL = ignora consentimento, contra a D2);
  - `TEMPLATE_VARIABLES` (l. 422; `required` derruba o envio se faltar no payload montado pelo `BuildNotificationPayloadService`);
  - `ALLOWED_VARIABLES` (l. 585) e `SAMPLE_DATA` (l. 635, valores gerados pelos mesmos formatadores do envio).
- **Supressão por flow type:** `packages/shared/src/utils/non-notifying-flow-types.ts` (`isWithheldForNonNotifyingFlow` deriva de `TEMPLATE_TARGETS === 'RENTAL_TENANT'`; nada a mudar, os códigos novos entram sozinhos).
- **Seed de templates:** `apps/backend/src/modules/notification/domain/platform-notification-templates.ts` (`PLATFORM_TEMPLATES`, `tenantEmailHtml` de `email-layout.ts:74`, `SERVICE_LABEL`, `CLOSING_PARAGRAPHS`, `CONTACT_TEAM_SENTENCE`, `EMAIL_CALLOUT_STYLE`; classe derivada por `resolvePlatformTemplateClass` → `getDefaultClass`; hash de conteúdo automático). Linhas criadas no boot por `syncPlatformTemplates` (`apps/backend/src/shared/infrastructure/template-startup-check.ts:54`, chamado em `main/server.ts:134`), **não** pelo `prisma/seed.ts`.
- **Payload:** `apps/backend/src/modules/notification/domain/build-notification-payload.service.ts` (`NotificationPayloadContext`, `build()` filtra pelo spec e lança `MissingRequiredVariableError`; padrão de chave **ausente** quando o valor não existe, l. 115–127).
- **Formatadores:** `packages/shared/src/utils/format-display-date.ts` (`formatWallTime('10:15')` → `'10:15 am'`; `formatWallTimeRange` usa `' – '` com travessão, que **não** é GSM-7: não usar em SMS); `formatCivilDate`.
- **Comprimento de SMS:** `packages/shared/src/utils/sms-content.ts` (`measureSms`, 160/153 GSM-7, 70/67 UCS-2, máx. 10 partes = 1530/670) e `sms-template-length.ts` (`measureSmsTemplate(body, SAMPLE_DATA)`); envio em `apps/backend/src/modules/notification/domain/sms-content.ts` (`prepareSmsBody`, trunca acima do limite) chamado em `send-notification.use-case.ts:904`.
- **Testes do seed:** `apps/backend/tests/unit/notification/platform-notification-templates.test.ts` (`APPOINTMENT_EMAIL_CODES`, l. 169: HTML com layout, sanitizer, variáveis do spec, render com `SAMPLE_DATA`; "every seeded template is presentable", l. 359).
- **ID determinístico:** padrão UUID v5 em `apps/backend/src/modules/notification/domain/agency-forward.ts:27` (`getAgencyForwardNotificationId`); `CreateNotificationInput.notificationId` + `saveIfAbsent` (`create-notification.use-case.ts:96`) fazem a inserção atômica. Hoje `execute` devolve `{ notificationId }` nos dois casos (`return { notificationId }` também quando `inserted` é falso, l. 97), então o chamador **não** distingue "criada" de "já existia".
- **Chamadores do `CreateNotificationUseCase`** (formato da saída): 15 arquivos em `src/` (`main/container.ts`, `notify-stuck.worker.ts`, `request-password-reset.use-case.ts`, `dispatch-escalations`, `dispatch-reminders`, `retry-notification`, `send-notification` (espelho), `notify-on-rental-tenant-portal-action.handler.ts`, `notify-on-status-transition.handler.ts`, `notify-on-admin-reschedule.handler.ts`, `notification.routes.ts`, `notify-on-group-inspector-change.subscriber.ts`, `invite-survey-on-done.subscriber.ts`, `notify-inspectors-on-region-deactivation.handler.ts`, `generate-portal-token.use-case.ts`) e ~24 arquivos de teste que fazem mock/stub dele (`grep -rlE "CreateNotificationUseCase|createNotification" apps/backend/{src,tests} | grep '\.test\.ts$'`). Nenhum chamador lê outro campo da saída além de `notificationId`.
- **Otimizador (F04-1):** `packages/shared/src/route-planning/` — `evaluateSequence(input, order, { legTravelS })`, `OptimizerInput`, `DEFAULT_ROUTE_WEIGHTS`; `packages/shared/src/schemas/day-plan.ts` — `toOptimizerInput(plan, now)` (`earliestDepartureS = max(now, routingInput.earliestDepartureAt)` hoje) e `buildLegOverrides` (contrato F04 §1 e §4). O backend da F04 usa a mesma regra no recálculo de hoje (`earliestDeparture = max(agora, fim real ou previsto da última executada)`, ou `max(agora, departure_at)` sem prefixo; F04-2 Algoritmo §3).
- **Plano (F04-2):** `day_plans` (`id`, `inspector_id`, `plan_date`, `timezone`, `status`, `version`, `published_at`, `origin_source`, `departure_at`, `approximate`), `day_plan_stops` (`sequence`, `travel_s`, `service_start_at`, `published_service_start_at`, `window_start_at`, `window_end_at`, `window_timezone`, `duration_minutes`, `missing_coordinates`), join vivo com `appointments` (`inspector_id = day_plans.inspector_id AND deleted_at IS NULL`); `container.dayPlan.getFreshStopForAppointmentUseCase` (contrato F04 §3).
- **Eventos de campo (F03-2):** `inspector_field_events` (índice `(appointment_id, type, created_at desc)`), porta `IInspectorFieldEventRepository` em `apps/backend/src/modules/inspector-execution/domain/inspector-field-event.repository.ts` (o contrato F03 §2 manda a feature consumidora **acrescentar** a consulta de agregação nesta porta).
- **Configuração (F03-1):** `packages/shared/src/schemas/platform-settings.ts` (`PLATFORM_SETTINGS_REGISTRY`, `{ schema, defaults, section }`), `IPlatformSettingsReader.get(key)` (cache 30 s), página `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.tsx` com `usePlatformSetting(key)`.

### Decisões aplicáveis
D1, D2, D4, D6, D7, D8, D9, D11, D12, D14 (2026-10-27); D17, D18, D19 (2026-10-28). A D3, D5, D10, D13, D15 e D16 só se aplicam aos gatilhos (TASK-F06-2), mas a chave de configuração que as governa nasce aqui.

Regras de 2026-10-29 (dev aceitou as recomendações de `lacunas/F06-lacunas.md`):
- **Classificação e opt-out (2026-10-29, L-F06-03, opção 1).** Os avisos de horário são **mensagem factual de serviço contratado** (não comercial; Spam Act 2003: isenta de rodapé de descadastro), classe `OPERATIONAL`, **sem** "reply STOP" no SMS. Para atender quem pede para parar, este PR cria o **opt-out manual AM/OP**: `POST /v1/notifications/consents/opt-out` (use case `RecordConsentOptOutUseCase`, espelho do `OverrideConsentUseCase`), que grava/atualiza `notification_consents` com `markOptedOut('operator_override', actor.userId, reason)`. Reusa o valor de enum existente `operator_override` (`ConsentChangeSource` só tem `operator_override` e `re_opt_in`, `schema.prisma:1073`), então continua **sem migration** (D14). Serve a todos os avisos `OPERATIONAL` ao inquilino, não só à F06. Tratar "STOP" no webhook do MobileMessage fica fora do escopo.
- **Flag por agência (2026-10-29, L-F06-06, opção 1).** Campo `tenantEtaNoticesEnabled: z.boolean().default(true)` em `tenantSettingsSchema` (`packages/shared/src/schemas/tenant.ts`, ao lado de `rentalTenantNotificationsEnabled`, l. 38), sem migration (`settings_json`). Helper `isTenantEtaNoticesEnabled(settings)` no shared (`settings?.tenantEtaNoticesEnabled !== false`, mesmo padrão fail-open do `isRentalTenantNotificationsEnabled`). Checkbox na seção "Notifications" do `TenantFormDrawer` (mesmo gate do switch de inquilino existente, `isAdminMaster`). O notificador da TASK-F06-2 lê a flag.
- **Contrato do `projectStopEta` fixado para a F05 (2026-10-29, L-F06-07).** A F06 é a dona do contrato: os nomes finais são `EtaPlanInput`, `EtaPlanStop`, `EtaRealEvents`, `ProjectedStop` e a regra de partida é `earliestDepartureS = max(anchorEnd ?? now, now)` (não `now − travelS`). Consumidores backend (F05) montam `EtaPlanInput` **com `publishedServiceStartAt` lido do banco**; `etaPlanInputFromDayPlanResponse` é só para quem tem a resposta HTTP (PWA). Nenhum `EtaPlanSnapshot`/`toEtaPlanSnapshot` existe.
- **Copy neutro do "a caminho" (2026-10-29, L-F06-08).** O e-mail do `TENANT_ETA_ON_THE_WAY` não diz "has finished the previous visit" (falso no CANT_DO, D16); diz só "is on the way".
- **Variáveis obrigatórias validadas no servidor (2026-10-29, L-F06-09, opção (b)).** `UpsertNotificationTemplateUseCase` passa a recusar qualquer template (de qualquer código com `required` em `TEMPLATE_VARIABLES`) cujo `subject + bodyHtml` não contenha as variáveis obrigatórias, com a mesma extração do editor web (`findTemplateVariableIssues` do shared). Assim "nunca aviso sem horário" vale também para template salvo por API.
- **`section` é rótulo de exibição (2026-10-29, L-F06-10).** `section: 'Tenant arrival notices'` (convenção da F03: `section: 'Field events'`), igual ao título da seção web.
- **Leitor expõe a confirmação do inquilino (2026-10-29, L-F06-02).** `loadPlan` devolve, por parada, `rentalTenantConfirmationStatus`, `keyRequired` e `requiresRentalTenantConfirmation` (do tipo de serviço) num mapa `stopMeta` à parte; o `EtaPlanInput` do shared **não** muda (a projeção usa todas as paradas; só o envio é filtrado, na TASK-F06-2).
- **Métrica de partes de SMS (2026-10-29, L-F06-11).** O ramo `notification.sms_dispatched` também chama `metrics.addSmsParts(templateCode, parts)` (obrigatório, não opcional).

### Testes primeiro (TDD)

Fixtures comuns (unit): agência `ag-syd` (`Australia/Sydney`, AEDT = UTC+11 em novembro), data **2026-11-05** (quinta). Plano do inspetor `insp-1` com origem na base, `departure_at` 07:40, ordem salva `A, B, C`:

| Parada | Janela (local) | Duração | `travel_s` (trecho que chega) | Plano: chegada / início / fim |
|---|---|---|---|---|
| A | 08:00–10:00 | 45 min | 1200 (base → A) | 08:00 / 08:00 / 08:45 |
| B | 09:00–12:00 | 60 min | 900 (A → B) | 09:00 / 09:00 / 10:00 |
| C | 10:00–11:00 | 45 min | 1500 (B → C) | 10:25 / 10:25 / 11:10 |

Instantes de referência: 07:00 local = `2026-11-04T20:00:00Z`; 08:00 = `21:00Z`; meia-noite local de 05/11 = `2026-11-04T13:00:00Z`. `published_service_start_at` = início do plano acima. Limite de atraso = 20 min, salvo indicação.

**A. Shared**
1. `packages/shared/src/constants/notification-templates.test.ts` (estender):
   - os 3 códigos estão em `MANDATORY_TEMPLATE_CODES` e **não** em `PLATFORM_ONLY_TEMPLATE_CODES`;
   - nenhum dos 3 termina em `_SMS` (D11);
   - `TEMPLATE_CODE_LABELS`: `'Arrival Estimate – Morning'`, `'Inspector On The Way'`, `'Inspector Running Late'`; `getTemplateCodeLabel('TENANT_ETA_DELAY') === 'Inspector Running Late'`;
   - `getTemplateTarget(code) === 'RENTAL_TENANT'` para os 3;
   - `getDefaultClass(code) === 'OPERATIONAL'` e `isProtectedTemplateCode(code) === false` para os 3;
   - `TEMPLATE_VARIABLES[code].required` = `['etaFrom', 'etaTo']` e `optional` = a lista de "Templates" abaixo, para os 3;
   - `ALLOWED_VARIABLES` contém `etaFrom` e `etaTo`; `SAMPLE_DATA.etaFrom === '10:15 am'` e `SAMPLE_DATA.etaTo === '11:15 am'` (derivados de `formatWallTime`);
   - `isWithheldForNonNotifyingFlow(code) === true` para os 3 (`non-notifying-flow-types.test.ts`);
   - `matchTemplateCodesBySearch('running late')` contém `TENANT_ETA_DELAY`.
2. `packages/shared/src/schemas/platform-settings.test.ts` (estender, chave `tenantEtaNotices`):
   - defaults = `{ enabled: false, channelMode: 'BOTH', morningHour: 7, morningCutoffHour: 9, delayThresholdMinutes: 20, smsBudgetSharePercent: 80 }`;
   - `resolvePlatformSettingValue('tenantEtaNotices', { enabled: true })` → defaults com `enabled: true`;
   - inválidos (erro de validação): `morningCutoffHour: 7` com `morningHour: 7` ("Cutoff must be after the morning notice hour"); `morningHour: 4`; `morningHour: 12`; `morningCutoffHour: 13`; `delayThresholdMinutes: 4`; `121`; `20.5`; `channelMode: 'EMAIL_ONLY'`; `smsBudgetSharePercent: 9`; `101`; `79.5`;
   - válidos: `morningHour: 6, morningCutoffHour: 7`; `delayThresholdMinutes: 5` e `120`; `channelMode: 'SMS_ELSE_EMAIL'`; `smsBudgetSharePercent: 10` e `100`.
   - `PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices.section === 'Tenant arrival notices'` (L-F06-10; mesma convenção do `'Field events'` da F03).
2b. `packages/shared/src/schemas/tenant.test.ts` e `packages/shared/src/utils/tenant-eta-notices.test.ts` (L-F06-06):
   - `tenantSettingsSchema.parse({})` → `tenantEtaNoticesEnabled === true`; `parse({ tenantEtaNoticesEnabled: false })` → `false`; `parse({ tenantEtaNoticesEnabled: 'no' })` → erro;
   - `isTenantEtaNoticesEnabled(null) === true`, `({}) === true`, `({ tenantEtaNoticesEnabled: false }) === false`, `({ tenantEtaNoticesEnabled: true }) === true`.
2c. `packages/shared/src/constants/tenant-eta.test.ts`: `TENANT_ETA_BAND_HALF_WIDTH_MINUTES === 30`, `TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES === 60` (L-F06-01), `TENANT_ETA_EARLY_CHANGE_MINUTES === 30` (L-F06-05), `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD === 500` (L-F06-11).

**B. Módulo de previsão (shared) e domínio do backend (unit)**
3. `packages/shared/src/route-planning/project-stop-eta.test.ts` (Exemplos do "Algoritmo" §A; todos os horários são locais de Sydney em 2026-11-05):
   - **E1 · Manhã, sem eventos (07:00):** projeção A 08:00, B 09:00, C 10:25 (início); `state 'PENDING'` nas 3; `lateS 0`; igual ao plano.
   - **E1b · Inspetor atrasado para sair (08:10, sem check-in):** partida ≥ agora: `earliestDeparture = max(07:40, 08:10) = 08:10`; A chega 08:30, início 08:30, fim 09:15; B chega/início 09:30, fim 10:30; C chega 10:55; `lateS 0` em todas. É exatamente o que o app do inspetor mostra às 08:10 (`toOptimizerInput` com `now` 08:10).
   - **E2 · A finalizada às 08:55 (avaliação às 08:55:20):** A `state 'DONE'`; partida = `max(08:55, 08:55:20) = 08:55:20`; B chega/início 09:10:20, fim 10:10:20; C chega 10:35:20, fim 11:20:20; `lateS 0`.
   - **E3a · B em andamento (check-in 09:12), varredura às 10:30:** A `DONE` (fim 08:55), B `IN_PROGRESS`, âncora = `max(10:30, 09:12 + 60 min) = 10:30`; C chega 10:55, `lateS 0`; `isProjectedLate(C, 20) === false`.
   - **E3b · Mesmo cenário às 11:00:** âncora 11:00; C chega 11:25; `lateS = 1500` (25 min); `isProjectedLate(C, 20) === true`; `isProjectedLate(C, 30) === false` (01.A5); `isProjectedLate(C, 25) === false` (estrito).
   - **E4a · `LATE_NOTICE` de 30 min em B às 08:20 (A em andamento desde 08:00):** piso de B = 09:00 + 30 = 09:30; B início 09:30, fim 10:30; C chega 10:55; `lateS 0` em todas; `floorApplied true` só em B.
   - **E4b · `LATE_NOTICE` de 60 min em B às 08:20:** B início 10:00, fim 11:00; C chega 11:25, `lateS 1500` → atrasada; B `lateS 0` (10:00 < 12:00).
   - **E4c · Aviso em parada já iniciada:** `LATE_NOTICE` em B e B com check-in → aviso ignorado (o evento real manda).
   - **E4d · Dois avisos em B no dia (20 e 60 min):** vale o mais recente (o leitor só entrega o último).
   - **E5 · Sem origem (`origin_source 'NONE'`, `departure_at null`) às 07:00:** A começa na janela (08:00), sem trecho de origem; B 09:00; C 10:25.
   - **E5b · Sem origem às 08:30, sem check-in:** A início 08:30 (`max(now, janela)`), fim 09:15; B chega 09:30; C chega 10:55.
   - **E6 · Parada sem coordenada:** B com `missing_coordinates true` e `travel_s 0`, C com `travel_s` do plano (medido a partir de A): B consome só tempo; resultado igual ao do `evaluateSequence` da F04 com B `matrixIndex: null`.
   - **E7 · DONE sem execução (marcado pela OP):** A `DONE` sem `finished_at`, `service_end_at` do plano 08:45 e `now` 09:30 → âncora = `min(08:45, 09:30) = 08:45`; com `now` 08:20 → âncora 08:20.
   - **E8 · Execução abandonada (`abandoned_at`):** A com `started_at` e `abandoned_at` → tratada como `PENDING` (regra F03).
   - **E9 · Prefixo fora de ordem (defensivo):** sequência gravada `B(pendente), A(executada)` → projeção usa executadas primeiro e pendentes na ordem gravada (invariante F04 D18).
   - **E10 · Status fora do plano:** parada cujo appointment está `CANCELLED`/`REJECTED` → excluída da projeção (não aparece na saída).
   - **E11 · Vazio / tudo feito:** 0 paradas → `[]`; todas `DONE` → só `DONE`, nenhuma `PENDING`.
   - **E12 · Coerência com a F04 e o app (módulo único):** para qualquer `now` de hoje e sem `LATE_NOTICE`, `projectStopEta` devolve, para as pendentes, os mesmos inícios que (a) o backend da F04 grava ao recalcular com o mesmo `now` e (b) o PWA calcula com `evaluateSequence(toOptimizerInput(plan, now), order, { legTravelS: buildLegOverrides(order, plan.routingInput) })`. Testado com o fixture e com os Exemplos 1, 6c e 14 da TASK-F04-1.
   - **E12b · Adaptador:** `etaPlanInputFromDayPlanResponse(dayPlanResponse)` mapeia `stops[].travelS`, `durationMinutes`, `windowStartAt`/`windowEndAt`/`timezone`, `missingCoordinates`, `serviceStartAt`/`serviceEndAt`, `appointmentStatus`, `departureAt`, `origin.source`, `approximate`; `publishedServiceStartAt` fica `null` (a resposta não o expõe; sem ele o piso do `LATE_NOTICE` usa `serviceStartAt`, D18).
   - **E13 · DST:** Sydney em 2026-10-04 (início do horário de verão, 02:00 → 03:00): plano A 08:00–10:00 (`2026-10-03T21:00Z–23:00Z`), avaliação 07:00 (`20:00Z`) → A 08:00; Sydney em 2026-04-05 (fim, 03:00 → 02:00): 07:00 AEST = `2026-04-04T21:00Z` → A 08:00 (`22:00Z`). A aritmética é em segundos de época; nenhuma conta de "hora local + N".
   - **E14 · Determinismo:** mesma entrada → saída igual (`toEqual`); entrada com paradas embaralhadas → mesma saída (ordena por `sequence`).
4. `tests/unit/tenant-eta/eta-band.test.ts` (`computeEtaBand(startAt, { windowStartAt, windowEndAt }, now)`; formatação em `Australia/Sydney` salvo indicação):
   - A às 07:00 (E1): início 08:00 → `{ from: 08:00, to: 08:30 }` → `etaFrom '8:00 am'`, `etaTo '8:30 am'` (recorte inferior pela janela);
   - B às 07:00: 09:00 → 09:00–09:30; C às 07:00: 10:25 → 10:00–10:55;
   - B às 08:55:20 (E2): início 09:10:20 → centro 09:10 → `from = max(08:40, 09:00, 09:00) = 09:00`, `to 09:40`;
   - C às 11:00 (E3b, atrasada): 11:25 → `from = max(10:55, 10:00, 11:00) = 11:00`, `to 11:55` (sem recorte superior, porque o centro passou do fim da janela);
   - C às 08:20 (E4b): 11:25 → `from 10:55`, `to 11:55`;
   - janela larga 08:00–14:00, início 10:30 → 10:00–11:00 (não mostra a janela inteira);
   - recorte superior: janela 09:00–10:00, início 09:50 → 09:20–10:00;
   - arredondamento do centro a 5 min (meio para cima, no instante absoluto): 10:22:29 → 10:20 (faixa 09:50–10:50); 10:22:30 → 10:25;
   - piso "agora": `now` 09:03 e início 09:05 → `from = ceil5(09:03) = 09:05`;
   - degenerada: janela 09:00–10:00, início 10:00, `now` 10:07 → `from 10:10 > to 10:00` → fallback `{ from: 10:10, to: 10:40 }` (sem recorte);
   - meio-dia: início 12:00 → `'11:30 am'` e `'12:30 pm'`; meia-noite nunca ocorre (janela diurna) mas `wallTimeHHmm` devolve `'00:00'`, nunca `'24:00'`;
   - fusos: o mesmo instante `2026-11-04T23:00:00Z` formatado em `Australia/Brisbane` → `'9:00 am'`, `Australia/Adelaide` → `'9:30 am'`, `Australia/Perth` → `'7:00 am'`, `Australia/Sydney` → `'10:00 am'`;
   - DST: 2026-10-04 Sydney, início `2026-10-03T22:00Z` → `'9:00 am'`; 2026-04-05, `2026-04-04T23:00Z` → `'9:00 am'`.
   - Saída sempre GSM-7: `isGsm7(etaFrom + etaTo) === true`.
5. `tests/unit/tenant-eta/tenant-eta-notification-id.test.ts`:
   - `getTenantEtaNotificationId({ kind: 'DELAY', appointmentId: 'a1', scheduledDate: '2026-11-05', channel: 'SMS' })` é UUID v5 válido (versão `5`, variante `8–b`), igual em duas chamadas e igual a um valor fixo gravado no teste (protege o namespace);
   - muda quando muda qualquer um de `kind`, `appointmentId`, `scheduledDate`, `channel`;
   - difere do `getAgencyForwardNotificationId` para a mesma string (namespaces distintos).

**C. Backend — aplicação/infra (unit e integração)**
6. `tests/unit/notification/build-notification-payload.service.test.ts` (estender):
   - `templateCode 'TENANT_ETA_MORNING'` com `eta: { from: '8:00 am', to: '8:30 am' }` → payload com `etaFrom '8:00 am'`, `etaTo '8:30 am'`, `rentalTenantName`, `scheduledDate '05/11/2026'`;
   - mesmo código **sem** `eta` → `MissingRequiredVariableError('TENANT_ETA_MORNING', 'etaFrom')` (a chave fica **ausente** em `allVars`, não `''`; é isso que aciona o guard);
   - `INSPECTION_NOTICE` com `eta` informado → `'etaFrom' in payload === false` e `'etaTo' in payload === false` (chaves **ausentes**, filtradas pelo spec; nunca `''`);
   - `TENANT_ETA_*` sem token → `'confirmationLink' in payload === false` (o spec não declara a chave, então ela não aparece; não é `''`);
   - sem contato → nenhum erro (`rentalTenantName` é opcional; o laço final do `build()` escreve `''` para opcionais declaradas e ausentes, `build-notification-payload.service.ts:172`, comportamento existente que não muda).
7. `tests/unit/notification/platform-notification-templates.test.ts` (estender):
   - existem exatamente 6 entradas `TENANT_ETA_*` (3 códigos × EMAIL/SMS); os 3 entram em `APPOINTMENT_EMAIL_CODES` e passam nos testes de layout, sanitizer, variáveis do spec e render com `SAMPLE_DATA`;
   - `resolvePlatformTemplateClass` = `'OPERATIONAL'` para as 6;
   - nenhuma das 6 usa `{{timeSlot}}` nem `{{confirmationLink}}` (D4, D12);
   - SMS: `measureSmsTemplate(body, SAMPLE_DATA)` → `encoding 'GSM-7'`, `parts 1` para as 3 (comprimentos esperados: MORNING 117, ON_THE_WAY 110, DELAY 130);
   - SMS com nome de 40 caracteres e horários `'10:55 am'`/`'11:55 am'` → 1 parte nas 3 (DELAY = 160 exatos); com 41 caracteres o DELAY vira 2 partes (teste documenta o limite);
   - nenhum corpo SMS contém `–` nem `’` (forçariam UCS-2).
   - `TENANT_ETA_ON_THE_WAY` EMAIL (`body` e `bodyHtml`) **não** contém `finished the previous visit` e contém `is on the way` (L-F06-08); render com `SAMPLE_DATA` → `"The inspector, <strong>…</strong>, is on the way to your <strong>…</strong>"`.
7c. `tests/unit/notification/upsert-notification-template.use-case.test.ts` (estender; L-F06-09):
   - `TENANT_ETA_DELAY` SMS com `bodyHtml 'Hi {{rentalTenantName}}, running late.'` → `ValidationError` (400 `VALIDATION_ERROR`) `'Missing required variables: etaFrom, etaTo'`, `details [{ field: 'bodyHtml', message: 'Missing required variables: etaFrom, etaTo' }]`; nada gravado;
   - mesmo código com `'… between {{etaFrom}} and {{etaTo}}.'` → salvo;
   - EMAIL com `{{etaFrom}}` só no `subject` e `{{etaTo}}` no `bodyHtml` → salvo (a extração usa `subject + bodyHtml`, como o editor web);
   - código com `required` antigo (`INSPECTION_NOTICE` sem `{{scheduledDate}}`) → mesmo erro com `scheduledDate` (regra genérica);
   - `{{#if etaFrom}}{{etaFrom}}{{/if}}` conta como presente (mesma regra do `findTemplateVariableIssues`);
   - código sem spec em `TEMPLATE_VARIABLES` → sem checagem de obrigatórias (comportamento atual).
7d. `tests/unit/notification/record-consent-opt-out.use-case.test.ts` (L-F06-03):
   - AM, `{ tenantId: 'ag-syd', recipient: '+61412000001', channel: 'SMS', notificationClass: 'OPERATIONAL', reason: 'Tenant asked by phone to stop SMS' }` sem registro → cria `NotificationConsent` com `optedOut true`, `changeSource 'operator_override'`, `changedByUserId` = AM, `reason`; audit `consent.operator_opted_out` com `before null`; saída `ConsentRecordOutput`;
   - registro existente opted-in → vira opted-out (mesmo id), audit com `before.optedOut false`;
   - registro já opted-out → idempotente: 200 com o registro, sem novo audit;
   - autorização idêntica à do `OverrideConsentUseCase`: `assertRoles(['AM','OP'])` + `assertTenantScope` (mesmo resultado do override para o mesmo ator e agência); CL_ADMIN/CL_USER/INSP → 403;
   - `reason` vazio ou > 1000 → `ValidationError` ("reason is required for consent opt-out"); `channel 'PUSH'` → 400 na rota;
   - telefone `0412 000 001` → gravado como `+61412000001` (mesma normalização do `recipient` que o pipeline usa no `findByScope`); e-mail `Ana@Example.com` → mesma normalização do e-mail do pipeline;
   - depois do opt-out, `isBlockedByConsent` do `SendNotificationUseCase` para esse `(tenant, recipient, SMS, OPERATIONAL)` → `true`.
   - Rota (`tests/integration/notification/consent-endpoints.routes.test.ts` e `tests/integration/rbac/notifications.rbac.test.ts`, estender): `POST /v1/notifications/consents/opt-out` → 200 `{ data: ConsentRecordOutput }`; sem auth → 401; corpo inválido → 400; matriz RBAC igual à do `…/override`.
7b. `tests/unit/notification/create-notification.use-case.test.ts` (estender):
   - sem `notificationId` → `{ notificationId: <uuid novo>, created: true }`, job `notification.send` enfileirado;
   - com `notificationId` novo → `saveIfAbsent` devolve `true` → `{ notificationId, created: true }`, job enfileirado;
   - com `notificationId` já existente → `saveIfAbsent` devolve `false` → `{ notificationId, created: false }`, **nenhum** job enfileirado;
   - template `MARKETING` → continua lançando `MarketingDispatchDisabledError` (nada muda).
   - Varredura de mocks: todos os stubs/mocks do `CreateNotificationUseCase` nos ~24 arquivos de teste passam a devolver `{ notificationId, created: true }` (ou `false` onde o teste simula duplicata), e o `typecheck` do backend + `pnpm --filter backend test` ficam verdes. O `tsconfig` do backend não cobre `tests/` (memória do projeto), então a varredura é por `grep`, não pelo compilador.
8. `tests/unit/notification/send-notification.use-case.test.ts` (estender):
   - SMS enviado → log `notification.sms_dispatched` com `{ notificationId, tenantId, templateCode, parts, encoding, length, truncated }` medidos no corpo **preparado**; corpo de 170 caracteres GSM-7 → `parts 2`; corpo com emoji → `encoding 'UCS-2'`;
   - SMS enviado → `metrics.addSmsParts('TENANT_ETA_DELAY', 2)` chamado uma vez; `getSnapshot().smsPartsByTemplate['TENANT_ETA_DELAY'] === 2` (L-F06-11); e-mail e falha do provedor → não chamado;
   - e-mail → nenhum `sms_dispatched`;
   - falha do provedor → nenhum `sms_dispatched` (só no sucesso).
9. `tests/integration/db/tenant-eta-plan.reader.integration.test.ts` (Postgres real, config `vitest.integration-db.config.ts`):
   - `loadPlan(dayPlanId)` devolve as paradas em `sequence`, com `travelS`, `durationMinutes`, janelas, `windowTimezone`, `publishedServiceStartAt`, `serviceStartAt`, `appointmentStatus`, `tenantId`, `scheduledDate`, `startedAt`/`finishedAt` da execução;
   - `loadPlan(...).stopMeta.get(id)` → `{ rentalTenantConfirmationStatus, keyRequired, requiresRentalTenantConfirmation }` (L-F06-02): parada `UNAVAILABLE` + `key_required true` → `{ 'UNAVAILABLE', true, true }`; tipo de serviço com `requires_rental_tenant_confirmation false` → `requiresRentalTenantConfirmation false`; a parada continua em `plan.stops` (a projeção usa todas);
   - execução com `abandoned_at` → `startedAt null`, `finishedAt null`;
   - parada cujo appointment foi reatribuído a outro inspetor ou apagado → ausente;
   - paradas de duas agências no mesmo plano → ambas presentes (D9);
   - `LATE_NOTICE` de ontem (antes da meia-noite local) → ignorado; dois de hoje → só o último; `CANT_DO` → ignorado;
   - id inexistente → `null`;
   - `findPlanByInspectorDate(inspectorId, planDate)` → `{ dayPlanId, appointmentIds }` com os appointments **vivos** do plano em `sequence` (reatribuídos/apagados fora); sem plano → `null`; plano sem paradas → `appointmentIds []`;
   - `listSweepCandidates(now)`: plano de hoje publicado com ao menos 1 parada SCHEDULED não iniciada → listado como `{ dayPlanId, inspectorId, planDate }`; plano de hoje só com DONE → fora; plano de ontem → fora; plano `DRAFT` sem `published_at` → fora; plano de Perth às `2026-11-04T15:30Z` (02:30 de Sydney de 05/11, 23:30 de Perth de 04/11) → "hoje" de Perth é 04/11, então o plano de 05/11 de Perth **não** entra; o de Sydney entra.
10. `tests/unit/inspector-execution/prisma-inspector-field-event.repository.test.ts` ou integração (estender): `findLatestLateNoticeByAppointmentIds(ids, since)` → um por appointment, o mais recente com `created_at >= since`; vazio para ids sem aviso.

**D. Web**
11. `apps/web/src/features/platform-settings/components/TenantEtaNoticesSection.test.tsx`:
   - renderiza os defaults (toggle desligado, "SMS and email", "7:00 am", "9:00 am", "20");
   - mudar o limite para 35 e salvar → `PUT /v1/platform-settings/tenantEtaNotices` com o objeto completo; snackbar "Settings saved";
   - "Don't send after" ≤ hora matinal → erro inline "Must be after the morning notice hour" e botão Save desabilitado;
   - limite 4 ou 121 → "Enter a number between 5 and 120";
   - erro 422 do servidor → mensagem do servidor na seção;
   - acessível: todos os campos com `<label>`, o toggle com `role="switch"` e `aria-checked`.
   - cabeçalho da seção = `'Tenant arrival notices'`, vindo de `section` da resposta (L-F06-10).
11b. `apps/web/src/features/tenants/components/TenantFormDrawer.test.tsx` (estender; L-F06-06):
   - AM, agência sem a chave → checkbox "Send arrival-time notices to tenants (morning, on the way, running late)" marcado; desmarcar e salvar → `PUT` com `settingsJson.tenantEtaNoticesEnabled false`;
   - com "Send notifications to tenants (email and SMS)" desmarcado → o checkbox novo fica `disabled` com a ajuda "Turned off because tenant notifications are off for this agency.";
   - não-AM → o checkbox não aparece (mesmo gate da seção).
11c. `apps/web/src/features/notification-consents/components/ConsentOptOutModal.test.tsx` (L-F06-03):
   - botão "Record opt-out" na `ConsentLookup` (só AM/OP) abre o modal com agência, destinatário (preenchido com a busca), canal (Email/SMS) e motivo;
   - motivo vazio → "Reason is required" e "Record opt-out" desabilitado;
   - sucesso → `POST /v1/notifications/consents/opt-out`, snackbar "Opt-out recorded", lista recarregada mostrando "Opted out";
   - erro 403/400 → mensagem do servidor no modal; acessível (`role="dialog"`, foco no 1º campo, `<label>` em todos).

### Escopo / Passos
1. **Shared — templates** (`packages/shared/src/constants/notification-templates.ts`), nos 6 lugares, na ordem:
   1. `MANDATORY_TEMPLATE_CODES`: `'TENANT_ETA_MORNING'`, `'TENANT_ETA_ON_THE_WAY'`, `'TENANT_ETA_DELAY'` (comentário: "One code, two channel rows (EMAIL + SMS) like TENANT_PORTAL_LINK; never add an _SMS twin — see templateFamily() in notify-on-status-transition.handler.ts").
   2. `TEMPLATE_CODE_LABELS`: rótulos acima.
   3. `TEMPLATE_TARGETS`: `'RENTAL_TENANT'` nos 3, e o docblock do mapa ganha o ponto de despacho: "`modules/tenant-eta` (morning job, evaluate worker, delay sweep; email + SMS)".
   4. `DEFAULT_TEMPLATE_CLASSIFICATIONS`: `'OPERATIONAL'` nos 3 (comentário: "consent-checked per channel by decision Q21; never protected").
   5. `TEMPLATE_VARIABLES`: os 3 com o spec de "Templates".
   6. `ALLOWED_VARIABLES` + `SAMPLE_DATA`: `etaFrom: formatWallTime('10:15')`, `etaTo: formatWallTime('11:15')`.
1b. **Shared — módulo de previsão** (`packages/shared/src/route-planning/project-stop-eta.ts`, exportado pelo `index.ts` do `route-planning`): tipos `EtaPlanInput`, `EtaPlanStop`, `EtaRealEvents`, `ProjectedStop`; funções `projectStopEta(plan, events, now)`, `isProjectedLate(stop, thresholdMinutes)` e o adaptador `etaPlanInputFromDayPlanResponse(plan: DayPlanResponse)` (Algoritmo §A). Puro: sem `Date.now()`, sem I/O; importa só `evaluateSequence`, `DEFAULT_ROUTE_WEIGHTS` e os tipos da F04. Se o `toOptimizerInput` da F04 puder receber o snapshot, chamar ele direto; senão, extrair da F04 o helper da regra de partida de hoje (`max(now, …)`) e usar nos dois, para a regra existir em um lugar só.
2. **Shared — configuração** (`packages/shared/src/schemas/platform-settings.ts`): chave `tenantEtaNotices` no `PLATFORM_SETTINGS_REGISTRY` (schema e defaults em "Contratos"), `section: 'Tenant arrival notices'` (rótulo de exibição, convenção da F03; L-F06-10). Exportar em `packages/shared/src/constants/tenant-eta.ts` (constantes, não configuráveis: são decisões): `TENANT_ETA_BAND_HALF_WIDTH_MINUTES = 30`, `TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES = 60` (L-F06-01), `TENANT_ETA_EARLY_CHANGE_MINUTES = 30` (L-F06-05), `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD = 500` (L-F06-11).
2b. **Shared — flag por agência** (L-F06-06): `tenantEtaNoticesEnabled: z.boolean().default(true)` em `tenantSettingsSchema` (`packages/shared/src/schemas/tenant.ts`, logo abaixo de `rentalTenantNotificationsEnabled`, com comentário "Only the arrival-time notices (TENANT_ETA_*). Ignored when rentalTenantNotificationsEnabled is false."); `isTenantEtaNoticesEnabled(settings)` em `packages/shared/src/utils/tenant-eta-notices.ts` (exportado pelo `index`).
3. `pnpm --filter @properfy/shared build` (o backend e o web importam o `dist`).
4. **Backend — seed** (`platform-notification-templates.ts`): 3 constantes HTML (`TENANT_ETA_MORNING_HTML`, `TENANT_ETA_ON_THE_WAY_HTML`, `TENANT_ETA_DELAY_HTML`) com `tenantEmailHtml(...)` e 6 entradas em `PLATFORM_TEMPLATES` (copy exato em "Templates"), sem `notificationClass` explícito (derivado). Atualizar `APPOINTMENT_EMAIL_CODES` no teste.
5. **Backend — payload** (`build-notification-payload.service.ts`): `NotificationPayloadContext.eta?: { from: string; to: string }` (texto já formatado); em `allVars`, `...(ctx.eta ? { etaFrom: ctx.eta.from, etaTo: ctx.eta.to } : {})` (chave ausente sem `eta`, preservando o guard de obrigatória).
6. **Backend — porta de eventos de campo:** acrescentar `findLatestLateNoticeByAppointmentIds(appointmentIds: string[], since: Date): Promise<Array<{ appointmentId; minutesLate; createdAt; clientOccurredAt }>>` em `IInspectorFieldEventRepository` + implementação Prisma (`DISTINCT ON (appointment_id) … ORDER BY appointment_id, created_at DESC`, filtro `type = 'LATE_NOTICE' AND created_at >= $since`, índice `(appointment_id, type, created_at desc)`). Se a F05 já tiver acrescentado um método equivalente, reusar o dela (ver Riscos).
7. **Backend — módulo novo `apps/backend/src/modules/tenant-eta/`** (só domínio e infraestrutura neste PR):
   - `domain/tenant-eta.constants.ts`: `TENANT_ETA_TEMPLATE_CODES = { MORNING: 'TENANT_ETA_MORNING', ON_THE_WAY: 'TENANT_ETA_ON_THE_WAY', DELAY: 'TENANT_ETA_DELAY' } as const`, `type TenantEtaKind = 'MORNING' | 'ON_THE_WAY' | 'DELAY'`;
   - `domain/eta-band.ts`: `computeEtaBand`, `roundToFiveMinutes`, `ceilToFiveMinutes`, `wallTimeHHmm(instant, tz)` (Intl `en-GB`, `hourCycle: 'h23'`), `formatEtaBand(band, tz) → { from: '8:00 am', to: '8:30 am' }` via `formatWallTime` (Algoritmo §B);
   - `domain/tenant-eta-notification-id.ts`: `getTenantEtaNotificationId(...)` com namespace próprio `TENANT_ETA_UUID_NAMESPACE = '4f0b7d2e-9c3a-5e61-8b4d-27a1c6e95f03'` (fixo para sempre; comentário igual ao do `agency-forward.ts`);
   - `domain/tenant-eta-plan.reader.ts`: porta `ITenantEtaPlanReader` (`loadPlan`, `findPlanByInspectorDate`, `listSweepCandidates`; Contratos);
   - `infrastructure/prisma-tenant-eta-plan.reader.ts`: implementação (consultas em "Algoritmo" §C), convertendo `Decimal`/datas; `loadPlan` também monta `stopMeta` (confirmação do inquilino, `keyRequired`, `requiresRentalTenantConfirmation`; L-F06-02).
7b. **Backend — `CreateNotificationOutput.created`** (`create-notification.use-case.ts`): `export interface CreateNotificationOutput { notificationId: string; created: boolean }`; `created = true` no `save` sem id e quando `saveIfAbsent` devolve `true`; `created = false` (e sem enfileirar) quando devolve `false`. Nenhum chamador existente muda de comportamento (todos ignoram o campo); atualizar os mocks/stubs nos ~24 arquivos de teste (`grep -rlE "CreateNotificationUseCase|createNotification" apps/backend/{src,tests} | grep '\.test\.ts$'`) para devolver o formato novo. Regra de memória do projeto: mudar a forma da saída de um use case exige grep em todos os mocks.
7c. **Backend — variáveis obrigatórias no `upsert`** (L-F06-09; `upsert-notification-template.use-case.ts`, depois das checagens "Body is required"/"Subject is required", l. 111–128): `const spec = TEMPLATE_VARIABLES[input.templateCode as keyof typeof TEMPLATE_VARIABLES]`; se existe, `const { missing } = findTemplateVariableIssues(`${input.subject ?? ''} ${input.bodyHtml}`, { required: spec.required, allowed: ALLOWED_VARIABLES })`; `missing.length > 0` → `throw new ValidationError(`Missing required variables: ${missing.join(', ')}`, [{ code: 'custom', message: …, field: 'bodyHtml' }])` (mesmo formato que o `TemplateFormDrawer` já mapeia para o campo Body). Só o `missing` é aplicado aqui (o `invalid` continua só no editor, para não mudar o comportamento de templates existentes). Templates de plataforma do `syncPlatformTemplates` não passam pelo `upsert`; o teste 7 já cobre que o seed contém as obrigatórias.
7d. **Backend — opt-out manual AM/OP** (L-F06-03): `application/use-cases/record-consent-opt-out.use-case.ts` (`RecordConsentOptOutUseCase`; dependências iguais às do `OverrideConsentUseCase`: `INotificationConsentRepository`, `AuthorizationService`, `AuditService`): `assertRoles(['AM','OP'])`, `assertTenantScope(actor, tenantId)`, valida `reason` (1–1000), normaliza o `recipient` como o pipeline (o mesmo valor que o `SendNotificationUseCase` passa ao `findByScope`), `findByScope({ tenantId, recipient, channel, notificationClass })` → se não existe, cria a entidade opted-in; se já opted-out, devolve sem gravar nem auditar; senão `markOptedOut('operator_override', actor.userId, reason)` + `consentRepo.upsert` + audit `consent.operator_opted_out` (`before`/`after` como no override). Rota `POST /v1/notifications/consents/opt-out` em `notification.routes.ts` (junto do `…/:consentId/override`), corpo Zod `recordConsentOptOutSchema` (Contratos §6) em `packages/shared`. Wiring no `container.ts`.
8. **Backend — log e métrica de custo de SMS** (`send-notification.use-case.ts`, ramo SMS de `dispatchAndRecord`, depois do `smsProvider.send` com sucesso): `const m = measureSms(prepared.body)`; `logger.info({ notificationId, tenantId, templateCode, parts: m.parts, encoding: m.encoding, length: m.length, truncated: prepared.truncated }, 'notification.sms_dispatched')`; `metrics.addSmsParts(templateCode, m.parts)` (L-F06-11; `MetricsCollector` ganha `smsPartsByTemplate: Map<string, number>` exposto no `getSnapshot()` e zerado no `reset()`, mesmo padrão dos contadores existentes; o contador é por máquina, como os demais). Sem destinatário no log.
9. **Web — seção** `apps/web/src/features/platform-settings/components/TenantEtaNoticesSection.tsx`, montada em `PlatformSettingsPage.tsx` com `usePlatformSetting('tenantEtaNotices')` (UI em "Contratos"); só AM/OP (a página já é restrita pela F03-4). Cabeçalho = `section` da resposta (`'Tenant arrival notices'`).
9b. **Web — flag por agência** (L-F06-06): no `TenantFormDrawer.tsx`, seção "Notifications" (gate `isAdminMaster`, l. 228), checkbox `tenantEtaNoticesEnabled` logo abaixo do switch de inquilino, com o copy de "Contratos §7"; `disabled` quando `rentalTenantNotificationsEnabled` está desmarcado. Form state inicial via `isTenantEtaNoticesEnabled(tenant.settingsJson)`; `useTenantAdminSave` envia a chave em `settingsJson`; tipo em `features/tenants/types/index.ts`.
9c. **Web — opt-out manual** (L-F06-03): `features/notification-consents/components/ConsentOptOutModal.tsx` + botão "Record opt-out" na `ConsentLookup` (AM/OP), mutation `POST /v1/notifications/consents/opt-out` e invalidação da query do `useConsentLookup`. Copy em "Contratos §6".
10. **OpenAPI/api-types:** rodar `pnpm --filter backend generate:openapi` e `pnpm --filter @properfy/shared generate:types`; commitar `api-types.ts` (o `GET /v1/platform-settings` descreve o valor de forma genérica, mas a rota nova `POST /v1/notifications/consents/opt-out` e o campo `tenantEtaNoticesEnabled` do tenant mudam o diff; L-F06-03, L-F06-06).
11. **Documentação (regra X00):** atualizar `packages/shared/CLAUDE.md` (3 códigos de inquilino com 2 canais cada, variáveis `etaFrom`/`etaTo`, chave `tenantEtaNotices`, flag `tenantEtaNoticesEnabled` da agência), `apps/backend/CLAUDE.md` (§10 SMS/Email: log `notification.sms_dispatched` e métrica `smsPartsByTemplate`; módulo `tenant-eta` e a exceção de tenant D9; regra "código de inquilino novo = uma linha por canal, sem `_SMS`"; "`upsert` de template valida variáveis `required` no servidor"; opt-out manual `POST /v1/notifications/consents/opt-out` e a posição "avisos de horário = mensagem factual de serviço, sem rodapé de opt-out") e `apps/web/CLAUDE.md` (seção "Tenant arrival notices" em Platform settings; checkbox no `TenantFormDrawer`; "Record opt-out").

### Algoritmo

**§A. `projectStopEta(plan, events, now)`** (`packages/shared/src/route-planning/project-stop-eta.ts`) — puro, sem I/O, inteiros em segundos de época (`Math.floor(ms / 1000)`). É o **único** módulo de previsão: o backend da F06, a F05 e (se quiser) o PWA chamam a mesma função.

Entradas:
```ts
export interface EtaPlanStop {
  appointmentId: string; sequence: number; tenantId: string; scheduledDate: string; // civil, agência
  appointmentStatus: string;               // 'SCHEDULED' | 'DONE' | outros
  travelS: number;                         // day_plan_stops.travel_s (trecho que chega)
  durationMinutes: number;
  windowStartAt: Date; windowEndAt: Date; windowTimezone: string;
  missingCoordinates: boolean;
  serviceStartAt: Date | null;             // plano fresco
  serviceEndAt: Date | null;
  publishedServiceStartAt: Date | null;    // congelado na publicação (F04)
}
export interface EtaPlanInput {
  dayPlanId: string; planVersion: number; planDate: string; timezone: string;
  hasOrigin: boolean;                      // origin_source <> 'NONE'
  departureAt: Date | null; approximate: boolean;
  stops: EtaPlanStop[];
}
export interface EtaRealEvents {
  executions: Map<string, { startedAt: Date | null; finishedAt: Date | null }>; // abandonada => ambos null
  lateNotices: Map<string, { minutesLate: number; createdAt: Date; clientOccurredAt: Date | null }>; // último do dia; horário efetivo pela F03 D25
}
export interface ProjectedStop {
  appointmentId: string; state: 'DONE' | 'IN_PROGRESS' | 'PENDING';
  windowStartAt: Date; windowEndAt: Date; windowTimezone: string; // copiados da entrada
  projectedArrivalAt: Date | null; projectedStartAt: Date | null; projectedEndAt: Date | null;
  lateS: number;                           // max(0, início − fim da janela)
  floorApplied: boolean;
}
export function projectStopEta(plan: EtaPlanInput, events: EtaRealEvents, now: Date): ProjectedStop[];
export function isProjectedLate(stop: ProjectedStop, thresholdMinutes: number): boolean;
export function etaPlanInputFromDayPlanResponse(plan: DayPlanResponse): EtaPlanInput;
```
No backend, o leitor da F06 monta `EtaPlanInput` (com `publishedServiceStartAt`) e `EtaRealEvents` a partir do banco; a F05 também monta das linhas brutas (`toEtaPlanInput`, com `publishedServiceStartAt`), e o adaptador fica só para o PWA (2026-10-29, reconciliação F05, L-F05-10).

Passos:
1. **Filtrar e classificar.** Descartar paradas cujo `appointmentStatus ∉ { 'SCHEDULED', 'DONE' }`. Para as demais: `DONE` se status DONE ou `finishedAt ≠ null`; `IN_PROGRESS` se `startedAt ≠ null` e `finishedAt = null`; `PENDING` caso contrário. Ordem: executadas (DONE/IN_PROGRESS) por `sequence`, depois pendentes por `sequence` (invariante F04 D18; defensivo para E9).
2. **Âncora (último evento real).** Seja `k` a última executada da ordem acima:
   - `DONE` com `finishedAt`: `anchorEnd = finishedAt`;
   - `DONE` sem execução (OP marcou): `anchorEnd = min(serviceEndAt ?? now, now)`;
   - `IN_PROGRESS`: `anchorEnd = max(now, startedAt + durationMinutes × 60)`;
   - sem executada: `anchorEnd = departureAt` se `hasOrigin`, senão `null`.
3. **Montar a entrada do `evaluateSequence` (F04-1) para as pendentes `P`**, sem chamar o Mapbox:
   - pontos = `[âncora] + P com coordenada`; `originIndex = 0` se há executada ou `hasOrigin`, senão `null`; `matrixIndex` = 1, 2, … para as com coordenada e `null` para `missingCoordinates`; `travelS` = matriz quadrada de zeros (nunca lida, porque todo trecho vem do override);
   - `legTravelS[i] = P[i].travelS` (trechos gravados pela F04 na ordem salva);
   - `stops[i] = { key, windowStartS, windowEndS, serviceS: durationMinutes × 60, matrixIndex }`;
   - `earliestDepartureS = max(anchorEnd ?? now, now)`: **partida ≥ agora**, a mesma regra do `toOptimizerInput` e do recálculo de hoje da F04. Não há outro piso. Assim o inquilino e o app do inspetor sempre veem o mesmo horário (revisão de 2026-10-28; a versão anterior usava `now − trecho`, que antecipava a chegada em relação ao app);
   - `weights = DEFAULT_ROUTE_WEIGHTS` (o custo não importa aqui).
4. **Avaliar** `evaluateSequence(input, P.map(key), { legTravelS })`. A folga para frente da F04 continua valendo, para que os horários batam com o que o inspetor vê no app (E12).
5. **Piso do `LATE_NOTICE`.** Para cada pendente `j`, na ordem, com aviso no mapa: `reference = publishedServiceStartAt ?? windowStartAt` (o horário "de plano", que a F04 não altera por causa do aviso, porque `LATE_NOTICE` não deixa o plano STALE; sem publicado, o início da janela, como na F03 D23); `floor = computeEstimatedArrivalAt(reference, effectiveNoticeAt, minutesLate)` = `max(reference, effectiveNoticeAt) + minutesLate × 60`, com `effectiveNoticeAt = resolveEffectiveEventTime(clientOccurredAt, createdAt).effectiveAt` (D18, alinhada em 2026-10-29). Se `floor > serviceStartS(j)` da avaliação corrente:
   - fixar `j` com `início = floor`, `fim = floor + serviceS`, `floorApplied = true` (as anteriores a `j` ficam como avaliadas);
   - reavaliar o restante `P[j+1..]` como no passo 3, com âncora = `j` (`earliestDepartureS = max(fim de j, now)`), e repetir o passo 5 a partir de `j+1`.
6. **Saída.** Executadas: `projectedArrivalAt = projectedStartAt = startedAt` (DONE sem execução: `null`), `projectedEndAt = finishedAt ?? anchorEnd`. Pendentes: da avaliação (`arrivalS`, `serviceStartS`, `serviceEndS`), `lateS = max(0, início − windowEndS)`.
7. `isProjectedLate(stop, thresholdMinutes) = stop.state === 'PENDING' && stop.projectedStartAt > stop.windowEndAt + thresholdMinutes × 60` (**estrito**).
8. Sem `LATE_NOTICE`, os passos 1–4 reproduzem o que o app do inspetor e o recálculo da F04 calculam para o mesmo `now` (E12). O piso do passo 5 é a única coisa que só a previsão do inquilino/F05 aplica, porque o `LATE_NOTICE` não deixa o plano STALE (D18).

**Exemplos numéricos** (fixture do plano A/B/C acima):

| Caso | `now` | Eventos | Âncora / `earliestDeparture` | A | B (início) | C (início) | Atrasada (20 min) |
|---|---|---|---|---|---|---|---|
| E1 | 07:00 | – | sem executada; `max(07:40, 07:00) = 07:40` | 08:00 | 09:00 | 10:25 | – |
| E1b | 08:10 | – | `max(07:40, 08:10) = 08:10` | 08:30 | 09:30 | 10:55 | – |
| E2 | 08:55:20 | A fim 08:55 | `max(08:55, 08:55:20) = 08:55:20` | DONE | 09:10:20 | 10:35:20 | – |
| E3a | 10:30 | A fim 08:55; B início 09:12 | B em andamento: `max(10:30, 10:12) = 10:30` | DONE | IN_PROGRESS | 10:55 | não (10:55 ≤ 11:20) |
| E3b | 11:00 | idem | 11:00 | DONE | IN_PROGRESS | 11:25 | **sim** (25 min > 20) |
| E4a | 08:20 | A início 08:00; aviso 30 min em B | A em andamento: `max(08:20, 08:45) = 08:45` → B 09:00 → piso 09:30 | IN_PROGRESS | 09:30 (piso) | 10:55 | não |
| E4b | 08:20 | A início 08:00; aviso 60 min em B | idem → piso 10:00 | IN_PROGRESS | 10:00 (piso) | 11:25 | **C sim**; B não (10:00 < 12:00) |

- **Fuso e DST:** só instantes entram no cálculo; janelas já chegam em instantes da F04. A formatação usa `windowTimezone` da parada (agência), nunca o fuso do inspetor nem o do servidor.

**§B. `computeEtaBand(startAt, window, now)`** — `H = 30 min` (`TENANT_ETA_BAND_HALF_WIDTH_MINUTES`).
1. `c = roundToFiveMinutes(startAt)` (múltiplo de 300 s mais próximo, meio para cima; os fusos australianos têm offset múltiplo de 30 min, então o arredondamento absoluto coincide com o local).
2. `from = max(c − H, windowStartAt, ceilToFiveMinutes(now))`.
3. `to = c ≤ windowEndAt ? min(c + H, windowEndAt) : c + H`. Recorte superior só quando o centro está dentro da janela; quando a previsão já passou do fim da janela, o texto mostra a faixa real (senão o aviso de atraso diria um horário que não vai acontecer). Ver Achado 1.
4. Se `from > to` (só acontece quando `now` passou do fim da janela com o centro ainda dentro dela): `from = ceilToFiveMinutes(now)`, `to = from + H`.
5. `formatEtaBand(band, tz)` → `{ from: formatWallTime(wallTimeHHmm(band.from, tz)), to: formatWallTime(wallTimeHHmm(band.to, tz)) }` (ex.: `'9:00 am'`, `'9:40 am'`; sempre GSM-7).

**§C. Leitor `PrismaTenantEtaPlanReader`**
- `loadPlan(dayPlanId)`:
  ```sql
  SELECT p.id, p.version, p.plan_date, p.timezone, p.origin_source, p.departure_at, p.approximate,
         s.appointment_id, s.sequence, s.travel_s, s.duration_minutes, s.window_start_at, s.window_end_at,
         s.window_timezone, s.missing_coordinates, s.service_start_at, s.service_end_at, s.published_service_start_at,
         a.status, a.tenant_id, a.scheduled_date,
         a.rental_tenant_confirmation_status, a.key_required,           -- L-F06-02 (stopMeta)
         st.requires_rental_tenant_confirmation,                          -- L-F06-02 (stopMeta)
         CASE WHEN e.abandoned_at IS NULL THEN e.started_at END  AS started_at,
         CASE WHEN e.abandoned_at IS NULL THEN e.finished_at END AS finished_at
  FROM day_plans p
  JOIN day_plan_stops s ON s.day_plan_id = p.id
  JOIN appointments a ON a.id = s.appointment_id AND a.inspector_id = p.inspector_id AND a.deleted_at IS NULL
  JOIN service_types st ON st.id = a.service_type_id
  LEFT JOIN inspection_executions e ON e.appointment_id = s.appointment_id
  WHERE p.id = $1
  ORDER BY s.sequence;
  ```
  As três colunas de confirmação vão para `stopMeta: Map<appointmentId, { rentalTenantConfirmationStatus: 'PENDING' | 'CONFIRMED' | 'UNAVAILABLE' | 'NO_RESPONSE'; keyRequired: boolean; requiresRentalTenantConfirmation: boolean }>`, fora do `EtaPlanInput` (que é o contrato do shared e não muda).
  Depois, `fieldEventRepo.findLatestLateNoticeByAppointmentIds(ids, since)` com `since` = meia-noite local da agência da parada (`zonedWallTimeToUtc(scheduledDate, '00:00', windowTimezone)`; com várias agências, o menor `since` e filtro por parada em memória).
- `listSweepCandidates(now)`:
  ```sql
  SELECT p.id AS day_plan_id, p.inspector_id, p.plan_date
  FROM day_plans p
  JOIN day_plan_stops s ON s.day_plan_id = p.id
  JOIN appointments a ON a.id = s.appointment_id AND a.inspector_id = p.inspector_id
                     AND a.deleted_at IS NULL AND a.status = 'SCHEDULED'
  LEFT JOIN inspection_executions e ON e.appointment_id = s.appointment_id
  WHERE p.published_at IS NOT NULL
    AND p.plan_date = ($1::timestamptz AT TIME ZONE p.timezone)::date   -- $1 = now injetado
    AND (e.id IS NULL OR e.abandoned_at IS NOT NULL OR e.started_at IS NULL)
  GROUP BY p.id, p.inspector_id, p.plan_date;
  ```
  (índice `(plan_date, status)` da F04; o `SELECT` devolve também `p.inspector_id` e `p.plan_date`).
- `findPlanByInspectorDate(inspectorId, planDate)`: `SELECT p.id, array_agg(s.appointment_id ORDER BY s.sequence)` com o mesmo join vivo de `loadPlan`, `WHERE p.inspector_id = $1 AND p.plan_date = $2` (índice único `(inspector_id, plan_date)`). Serve para escolher uma parada que **está** no plano antes da leitura fresca (TASK-F06-2, fluxo comum).

### Gatilhos
Nenhum neste PR. Os 3 gatilhos (matinal, "a caminho", atraso) são da TASK-F06-2 e consomem os contratos daqui.

### Templates (com copy)

Os 3 códigos têm o mesmo spec de variáveis:
- `required: ['etaFrom', 'etaTo']` (o montador sempre recebe `eta` dos gatilhos; faltar = erro alto, nunca aviso sem horário);
- `optional: ['rentalTenantName', 'propertyAddress', 'scheduledDate', 'appointmentCode', 'inspectorName', 'branchName', 'agencyName', 'agencyPhone', 'serviceTypeName', 'properfyLogoUrl', 'agencyLogoUrl']` (o `rentalTenantName` é opcional pelo mesmo motivo do `TENANT_PORTAL_LINK`: o spec é por código e vale para os dois canais).

| Código | Canais | Classe | Público | Rótulo |
|---|---|---|---|---|
| `TENANT_ETA_MORNING` | EMAIL + SMS | OPERATIONAL | RENTAL_TENANT | Arrival Estimate – Morning |
| `TENANT_ETA_ON_THE_WAY` | EMAIL + SMS | OPERATIONAL | RENTAL_TENANT | Inspector On The Way |
| `TENANT_ETA_DELAY` | EMAIL + SMS | OPERATIONAL | RENTAL_TENANT | Inspector Running Late |

**`TENANT_ETA_MORNING`**
- EMAIL `subject`: `Your inspection today: arrival between {{etaFrom}} and {{etaTo}}`
- EMAIL `body` (texto): `Dear {{rentalTenantName}}, your inspection at {{propertyAddress}} is today, {{scheduledDate}}. We expect the inspector to arrive between {{etaFrom}} and {{etaTo}}. This is an estimate based on the inspector's route for the day. If the inspector is running late, we will let you know.`
- EMAIL `bodyHtml`:
  ```ts
  const TENANT_ETA_MORNING_HTML = tenantEmailHtml(
    `<p>Your <strong>${SERVICE_LABEL}</strong>` +
    '{{#if appointmentCode}} <strong>#{{appointmentCode}}</strong>{{/if}}' +
    '{{#if propertyAddress}} of <strong>{{propertyAddress}}</strong>{{/if}} is <strong>today, {{scheduledDate}}</strong>.</p>' +
    '<p>We expect the inspector to arrive between <strong>{{etaFrom}}</strong> and <strong>{{etaTo}}</strong>.</p>' +
    `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Please note:</strong> this is an estimate based on the inspector's route for the day. ` +
    'If the inspector is running late, we will let you know.</p>' +
    CLOSING_PARAGRAPHS,
  );
  ```
- SMS `body`: `Properfy: Hi {{rentalTenantName}}, your inspection is today. The inspector is expected to arrive between {{etaFrom}} and {{etaTo}}.` — 117 caracteres GSM-7 com `SAMPLE_DATA` (1 parte); 1 parte com nomes até 53 caracteres.

**`TENANT_ETA_ON_THE_WAY`**
- EMAIL `subject`: `Your inspector is on the way`
- EMAIL `body`: `Dear {{rentalTenantName}}, the inspector is on the way to your inspection at {{propertyAddress}}. Expected arrival: between {{etaFrom}} and {{etaTo}}.` (2026-10-29, L-F06-08: sem "has finished the previous visit", que é falso no CANT_DO, D16.)
- EMAIL `bodyHtml`:
  ```ts
  const TENANT_ETA_ON_THE_WAY_HTML = tenantEmailHtml(
    '<p>The inspector{{#if inspectorName}}, <strong>{{inspectorName}}</strong>,{{/if}} ' +
    `is on the way to your <strong>${SERVICE_LABEL}</strong>` +
    '{{#if propertyAddress}} at <strong>{{propertyAddress}}</strong>{{/if}}.</p>' +
    '<p>Expected arrival: between <strong>{{etaFrom}}</strong> and <strong>{{etaTo}}</strong>.</p>' +
    CLOSING_PARAGRAPHS,
  );
  ```
- SMS `body`: `Properfy: Hi {{rentalTenantName}}, your inspector is on the way and is expected to arrive between {{etaFrom}} and {{etaTo}}.` — 110 caracteres (1 parte); 1 parte com nomes até 60 caracteres.

**`TENANT_ETA_DELAY`**
- EMAIL `subject`: `Your inspector is running late`
- EMAIL `body`: `Dear {{rentalTenantName}}, we are sorry: the inspector is running late for your inspection at {{propertyAddress}} today. New expected arrival: between {{etaFrom}} and {{etaTo}}. If this time no longer suits you, please contact our bookings team by replying to this email.`
- EMAIL `bodyHtml`:
  ```ts
  const TENANT_ETA_DELAY_HTML = tenantEmailHtml(
    `<p>We are sorry: the inspector is running late for your <strong>${SERVICE_LABEL}</strong>` +
    '{{#if propertyAddress}} at <strong>{{propertyAddress}}</strong>{{/if}} today.</p>' +
    '<p>New expected arrival: between <strong>{{etaFrom}}</strong> and <strong>{{etaTo}}</strong>.</p>' +
    `<p style="${EMAIL_CALLOUT_STYLE}"><strong>Please note:</strong> if this time no longer suits you, ${CONTACT_TEAM_SENTENCE}</p>` +
    CLOSING_PARAGRAPHS,
  );
  ```
- SMS `body`: `Properfy: Hi {{rentalTenantName}}, your inspector is running late. New expected arrival: between {{etaFrom}} and {{etaTo}}. Sorry for the delay.` — 130 caracteres (1 parte); 1 parte com nomes até 40 caracteres, 2 partes acima disso.

Regras de copy: o "a caminho" (e-mail e SMS) nunca afirma que a visita anterior terminou (L-F06-08); sem `{{timeSlot}}` (o plano proíbe repetir a janela inteira, e o travessão do `formatWallTimeRange` força UCS-2 no SMS); sem link do portal (D12); só caracteres GSM-7 nos SMS (apóstrofo reto `'` só no e-mail).

**Escape de HTML no SMS:** o Handlebars escapa `'` e `&` também no SMS (ex.: "O'Brien" vira `O&#x27;Brien`). Uma tarefa separada está corrigindo isso; a F06 **não depende** dela, não testa nomes com esses caracteres e deixa os textos fixos sem eles.

### Casos de borda
1. **Variável obrigatória ausente:** um gatilho que esquecer `eta` lança `MissingRequiredVariableError`; o aviso não sai sem horário (teste 6).
2. **Template de agência customizado sem `{{etaFrom}}`/`{{etaTo}}`:** o editor web **e** o servidor recusam o save (`UpsertNotificationTemplateUseCase`, 400 `Missing required variables: etaFrom, etaTo`; 2026-10-29, L-F06-09; teste 7c), inclusive por API. Template de agência salvo **antes** deste PR sem as variáveis não existe (os códigos são novos). O envio usa o template ativo da agência, com fallback para o de plataforma (comportamento atual do `CreateNotificationUseCase`).
3. **Nome longo no SMS:** DELAY passa de 1 para 2 partes acima de 40 caracteres; a truncagem do `prepareSmsBody` só atua acima de 1530 (impossível com estes textos).
4. **Plano sem origem:** `hasOrigin false` → 1ª pendente começa em `max(now, janela)` (E5/E5b).
5. **Parada sem coordenada:** trecho 0; o trecho seguinte já vem medido do último ponto com coordenada (E6).
6. **Execução abandonada:** pendente (E8).
7. **DONE sem execução:** âncora pelo fim previsto, nunca no futuro (E7).
8. **Paradas reatribuídas, apagadas, canceladas ou rejeitadas:** fora do leitor (join vivo) ou descartadas no passo 1 (E10). O CANT_DO → REJECTED da F03 também desvincula o inspetor (#1293), então a parada some do plano.
9. **`LATE_NOTICE` de ontem ou de outra agência no mesmo plano:** filtrado por meia-noite local da agência da parada.
10. **Plano aproximado (`approximate true`):** a projeção funciona igual (os trechos são do stub) e os avisos saem normalmente (D17).
11. **Fusos diferentes no mesmo plano:** cada parada formata no próprio `windowTimezone` (teste 4).
12. **DST:** epoch + Intl; testes E13 e 4.
13. **Faixa degenerada:** fallback do §B passo 4.
14b. **Opt-out manual para recipient sem histórico** (L-F06-03): cria o registro já opted-out; o próximo aviso daquele canal sai `SKIPPED_OPT_OUT`. Repetir o opt-out é idempotente (sem audit novo). Desfazer = `…/:consentId/override` existente.
14c. **Agência com `tenantEtaNoticesEnabled: false` e switch de inquilino ligado** (L-F06-06): lembretes e portal seguem; só os `TENANT_ETA_*` param (aplicado na TASK-F06-2). Chave ausente = ligada.
14. **Chave de configuração inválida no banco:** o `PlatformSettingsService` devolve os defaults e loga erro (contrato F03); com `enabled: false` por padrão, nada é enviado.

### Fora do escopo
- Qualquer envio (TASK-F06-2).
- Botão manual "avisar inquilino", rastreamento GPS, reagendar pelo aviso, avisos à agência, previsão com trânsito (plano).
- Corrigir o escape de HTML no SMS (tarefa separada).
- Tratar "STOP" automaticamente no webhook do MobileMessage e link de descadastro no portal (L-F06-03, opção 3 não escolhida); o opt-out é manual por AM/OP.
- Toggle de `tenantEtaNoticesEnabled` para OP/CL_ADMIN (segue o gate do switch de inquilino, AM).
- Mudar o `TenantCronTick`, o pipeline de envio (além do log de custo) ou o teto diário de SMS.

### Critérios de aceite
- **01.A7 (parte da previsão):** com o limite de 20 min, a previsão de C passa do fim da janela + limite em E3b (sweep 11:00) e em E4b (`LATE_NOTICE` de 60 min em B), e não passa em E3a/E4a. Prova: `project-stop-eta.test.ts`. O "só uma vez" é provado na TASK-F06-2.
- **01.A5 (parte inquilino, base):** `isProjectedLate` usa o limite recebido; 25 min de atraso disparam com 20, não com 25 nem com 30 (E3b). O limite vem da chave `tenantEtaNotices.delayThresholdMinutes`, editável em "Platform settings" (teste 11).
- Os 3 códigos aparecem na lista de templates com rótulo e público "Rental tenant", têm 2 canais cada e passam no editor (variáveis obrigatórias) e no preview (SMS de 1 parte com os dados de exemplo).
- **L-F06-09:** um `PUT` de template `TENANT_ETA_*` sem `{{etaFrom}}`/`{{etaTo}}` é recusado pelo servidor (teste 7c).
- **L-F06-03:** AM/OP registra o opt-out de um telefone pelo web; o próximo aviso SMS `OPERATIONAL` para ele sai `SKIPPED_OPT_OUT` (testes 7d, 11c).
- **L-F06-06:** AM desliga os avisos de horário de uma agência sem tocar no switch de inquilino (teste 11b).
- **L-F06-08/L-F06-10:** e-mail "a caminho" sem "finished the previous visit"; seção com cabeçalho "Tenant arrival notices" (testes 7, 11).

### Dependências
- **F04-1** (`evaluateSequence`, `DEFAULT_ROUTE_WEIGHTS`) e **F04-2** (tabelas `day_plans`/`day_plan_stops`, `published_service_start_at`) mergeadas.
- **F03-1** (registro do `PlatformSetting`, página web) e **F03-2** (`inspector_field_events`, `IInspectorFieldEventRepository`, `abandoned_at`).

### Riscos e armadilhas
- **Supressão cruzada por família:** não criar códigos `_SMS`; não pôr os códigos novos em `STATUS_TRANSITION_TEMPLATE_CODES`/`RENTAL_TENANT_NOTICE_CODES` (D11).
- **Classe errada:** `PROTECTED_TEMPLATE_CLASSIFICATIONS` faria o aviso ignorar o opt-out, contra a Q21. Fica em `DEFAULT_TEMPLATE_CLASSIFICATIONS` (teste 1 e 7).
- **`required` derruba envio:** só `etaFrom`/`etaTo` são obrigatórias, e os gatilhos sempre as passam.
- **Validação genérica no `upsert` (L-F06-09):** vale para todo código com `required`; um cliente que salve por API um template antigo sem uma obrigatória passa a receber 400. O editor web já bloqueava o mesmo caso, então o efeito visível é nulo para quem usa a tela. Só `missing` é aplicado (não `invalid`).
- **Normalização do `recipient` no opt-out (L-F06-03):** se o opt-out gravar o telefone num formato diferente do que o pipeline consulta, ele nunca bloqueia. O teste 7d prova o efeito com o próprio `isBlockedByConsent`.
- **Travessão no SMS:** `{{timeSlot}}` e rótulos com `–` forçariam UCS-2 (70 caracteres por parte, 2–3× o custo). Teste 7 trava.
- **Método duplicado com a F05:** a F05 também pode acrescentar "último `LATE_NOTICE` por appointment" à porta `IInspectorFieldEventRepository`. Quem mergear depois reusa o método do outro (mesmo nome sugerido: `findLatestLateNoticeByAppointmentIds`).
- **Duas previsões divergentes:** qualquer piso ou regra de partida que só a F06 aplique faria o inquilino ouvir um horário e o inspetor ver outro. Por isso a regra de partida é a do `toOptimizerInput` (E12 trava) e a função mora no shared, exportada para a F05. Mudanças futuras de regra vão para essa função, não para os consumidores.
- **Mudança da saída do `CreateNotificationUseCase`:** mocks não tipados nos testes do backend (o `tsconfig` não cobre `tests/`) continuam compilando com o formato antigo; o grep do passo 7b é obrigatório.
- **Leitura cross-tenant (D9):** o leitor não filtra por tenant de propósito; nenhuma rota HTTP expõe o resultado.
- **`web typecheck` com cache incremental:** rodar `tsc` limpo no web depois do build do shared.

### Deploy / rollout / rollback
- **Sem migration.** No boot, `syncPlatformTemplates` cria as 6 linhas de plataforma (`tenant_id NULL`). Conferir em staging e prod: `SELECT template_code, channel, notification_class FROM notification_templates WHERE tenant_id IS NULL AND template_code LIKE 'TENANT_ETA_%'` → 6 linhas, `OPERATIONAL`.
- A chave `tenantEtaNotices` nasce com `enabled: false` (defaults no código); nada é enviado mesmo depois da TASK-F06-2 até um AM/OP ligar.
- A flag `tenantEtaNoticesEnabled` nasce ausente em todas as agências (= ligada, L-F06-06); nada muda até a TASK-F06-2 e o `enabled` global.
- O endpoint de opt-out manual fica disponível imediatamente (AM/OP) e já vale para os avisos `OPERATIONAL` existentes ao inquilino.
- **Rollback:** reverter o PR. As linhas de template ficam no banco sem uso (inofensivas; o `checkMandatoryTemplates` só avisa sobre faltantes, não sobras). Registros de opt-out criados pelo endpoint continuam válidos (usam o enum existente) e podem ser desfeitos pelo override.

### Dias · Branch · Verificação
- **Dias:** 3,5 (templates e registros 0,75 + payload, log e métrica de custo 0,25 + `projectStopEta` no shared com adaptador, faixa e exemplos 1,0 + leitor (3 métodos, com `stopMeta`) e porta de eventos 0,5 + `created` e varredura de mocks 0,25 + chave e seção web 0,25 + **2026-10-29:** opt-out manual (use case, rota, modal) 0,25 (L-F06-03) + flag por agência no schema e no `TenantFormDrawer` 0,125 (L-F06-06) + variáveis obrigatórias no `upsert` 0,125 (L-F06-09)).
- **Branch:** `feat/f06-1-tenant-eta-foundation` (worktree a partir de `develop`).
- **Verificação:** `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test typecheck lint`; `pnpm --filter backend exec prisma generate && pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test && pnpm --filter backend test:integration:db`; `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test -- platform-settings notification-templates tenants notification-consents`. Conferir `git diff --stat origin/develop... | tail -1` (< 150 arquivos; estimado ~60 com os mocks do `CreateNotificationUseCase`).

---

## TASK-F06-2 · Backend: aviso matinal, "a caminho", atraso projetado e dedupe

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F06-1
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F04-3, TASK-F07-1, TASK-F05-1, TASK-F04-4, TASK-F07-2, TASK-F07-3, TASK-F08-1, TASK-F04-3b
> - **Pista sugerida (time de 6):** A2 · Backend em par

### Objetivo
- **01.12-B (= 01.15):** job `tenant-eta.morning`, por agência, às `morningHour` locais (07:00), enviando a faixa prevista de cada parada do plano publicado de hoje, **só até** `morningCutoffHour` (09:00).
- **01.10:** quando uma parada termina pelo **check-out do inspetor** (DONE com `source 'INSPECTOR_FINISH'`; DONE manual da OP não dispara, L-F06-04) **ou é encerrada por "Não consigo fazer"** (CANT_DO → REJECTED, D16), avisar o inquilino da **próxima parada do plano** que "o inspetor está a caminho", com a faixa prevista, **só se a chegada projetada estiver a até 60 min** (L-F06-01). Não dispara se a próxima já começou ou saiu do plano (cancelada/rejeitada). Uma antecipação ≥ 30 min em relação à faixa matinal gera uma correção única pelo mesmo template (L-F06-05).
- **01.12:** atraso projetado, recalculado no finish, no `LATE_NOTICE` da F03 e numa varredura a cada 30 min dos dias com plano. Se a previsão passar do fim da janela + limite, enviar "running late" com a nova faixa, **1 vez por parada por dia**.
- Cada gatilho envia e-mail e/ou SMS (Q21), respeitando consentimento por canal, flag `tenantEtaNoticesEnabled` e switch da agência, flow type e confirmação do inquilino (L-F06-02, L-F06-06), com dedupe atômico e a **reserva de 20% do teto de SMS** para os avisos obrigatórios (D15).

### Contexto no código
- **Contratos da TASK-F06-1:** `projectStopEta`/`isProjectedLate` (shared, `route-planning`), `computeEtaBand`, `formatEtaBand`, `getTenantEtaNotificationId`, `ITenantEtaPlanReader` (`loadPlan`, `findPlanByInspectorDate`, `listSweepCandidates`), `TENANT_ETA_TEMPLATE_CODES`, `NotificationPayloadContext.eta`, `CreateNotificationOutput.created`, chave `tenantEtaNotices` (ver "Contratos exportados").
- **CANT_DO → REJECTED (F03-2, D1/D2 da F03):** o "Não consigo fazer" vira `SCHEDULED → REJECTED` por SYS com `reasonCode INSPECTOR_UNABLE`; o `STATUS_TRANSITION` sai com `metadata.source = 'INSPECTOR_CANT_DO'`, `metadata.initiatedByInspectorId`, `metadata.fieldEventId`. O bloco 7c do `ExecuteStatusTransitionUseCase` (#1293) zera `inspectorId` e `serviceGroupId`, então o appointment rejeitado **sai do plano** (join vivo) e não serve de semente para a leitura fresca.
- **Leitura fresca (F04-2):** `container.dayPlan.getFreshStopForAppointmentUseCase.execute({ appointmentId, now })` → `FreshDayPlanStop | null` (`status 'FRESH' | 'STALE'`, `dayPlanId`, `planVersion`, …). Reconfere a impressão digital e recalcula quando divergente; `STALE` = não foi possível recalcular agora, **não avisar** com ela; `null` = sem inspetor, sem plano na data ou fora do plano. A F04 **não** exporta evento de domínio; a F06 define os próprios gatilhos.
- **STALE da F04:** `MarkDayPlansStaleSubscriber` marca STALE em **todo** `STATUS_TRANSITION` de appointment do plano (inclusive DONE) e em `CANT_DO`; `LATE_NOTICE` **não** marca. Check-out não muda a impressão digital (F04-2 teste 1), mas o DONE marca STALE, e a próxima leitura fresca recalcula a partir do fim real.
- **Tick por agência:** `apps/backend/src/shared/application/tenant-cron-tick.ts` — `runDue(jobName, targetHour, runner, now)`; `claimDue` usa `localHour >= targetHour` (**dispara atrasado** depois de uma queda: por isso a hora-limite de 09:00 é obrigatória); claim por `(job, tenant, data local)` em `cron_job_runs`; grupo que lança tem o claim liberado e o erro relançado.
- **Workers:** `apps/backend/src/main/workers.ts` (`boss.schedule(..., SYDNEY_TZ)`, `withJobMetrics`, padrão `notification.dispatch-reminders` às 18:00 em `'0 * * * *'`, l. 154–172; lista de workers no log final, l. 363).
- **Subscriber de DONE (padrão):** `apps/backend/src/modules/satisfaction-survey/application/subscribers/invite-survey-on-done.subscriber.ts` (`APPOINTMENT_EVENTS.STATUS_TRANSITION`, filtra `toStatus === 'DONE'`, relê o appointment, nunca relança); registrado em `main/container.ts:1348–1352` com `.register(domainEventBus)`. O bus é em processo e o emit da transição é *fire-and-forget* (`execute-status-transition.use-case.ts:638–644`), com payload `{ appointmentId, tenantId, fromStatus, toStatus, actorId, actorType, reason, metadata, serviceGroupId }` (sem inspetor).
- **Evento de campo (F03-2):** `INSPECTOR_FIELD_EVENTS.RECORDED` (`'inspector_field_event.recorded.v1'`), payload `{ eventId, type, appointmentId, tenantId, inspectorId, reason, minutesLate, occurredAt }`.
- **Dedupe existente:** `notify-stuck.worker.ts` usa `notificationRepo.count({ appointmentId, templateCode, fromDate })` (`INotificationRepository.count(filters)`, `NotificationFilters` com `tenantId`, `channel`, `fromDate`); ID determinístico + `saveIfAbsent` em `create-notification.use-case.ts:96`.
- **Leitura de appointments:** `IAppointmentRepository.findScheduledOnDate(date, tenantIds)` (usado pelos lembretes, `dispatch-reminders.use-case.ts:78`) e `findById(id, tenantId)` → `AppointmentWithRelations` (`contact`, `propertyAddress`, `serviceTypeName`, `branchName`, …); `ITenantRepository.findById`; `BuildNotificationPayloadService`; `AppointmentCodeFormatter`.
- **Switch e flow type:** `isRentalTenantNotificationsEnabled(settings)` (`packages/shared/src/utils/rental-tenant-notifications.ts:35`); `suppressesOccupantNotifications(flowType)` (`non-notifying-flow-types.ts:27`) com o leitor de flow type que o pipeline já usa (`prisma-appointment-flow-type.reader.ts`).
- **Pipeline de envio:** `send-notification.use-case.ts:419–428` (ordem flow type → switch → consentimento → teto). Teto diário de SMS: `typeof settings.notificationDailyCapSms === 'number' ? … : 100` (l. 718); contador `notificationRepo.countByTenantChannelSince(tenantId, channel, todayStart)` com `todayStart.setUTCHours(0, 0, 0, 0)` (l. 724–730): **balde por dia UTC** (vira às 10:00 AEST / 11:00 AEDT em Sydney). A reserva da F06 (D15) usa esse mesmo contador e esse mesmo teto.
- **Fila:** `IJobQueue.enqueue(name, payload, { singletonKey, retryLimit, retryBackoff, startAfter, expireInMinutes })` (`shared/domain/job-queue.ts`).

### Decisões aplicáveis
D1–D9, D11–D14 (2026-10-27) e D10, D15–D19 (dev, 2026-10-28), em especial: Q21 (D1), consentimento (D2), sem avisos com o switch desligado (D10), matinal 07:00 só até 09:00 (D3), faixa ±30 (D4), 1 atraso por parada por dia + "a caminho" continua (D5), ordem salva (D6), módulo único de previsão com partida ≥ agora (D7), tempo (D8), exceção de tenant (D9), sem `_SMS` (D11), sem link (D12), nada antes da hora matinal (D13), reserva de 20% do teto de SMS (D15), "a caminho" no CANT_DO (D16), plano aproximado (D17), base do "Vou atrasar" (D18), limite próprio (D19).

Regras de 2026-10-29 (dev aceitou as recomendações de `lacunas/F06-lacunas.md`):
- **"A caminho" só com chegada próxima (2026-10-29, L-F06-01, opção 1).** `ON_THE_WAY` (em qualquer gatilho: FINISH, CANT_DO, `EARLY_CHANGE`) só é criado quando `projectedArrivalAt − now ≤ TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES` (60 min, constante do shared). Acima disso → `reason 'NEXT_TOO_FAR'`, **nada é reagendado** (a parada continua coberta pelo MORNING e pela varredura de atraso). Sem rastreamento, "a caminho" significa "sai da parada anterior em direção a você e chega em até 60 min". A regra não vale para o DELAY (o "running late" sai sempre que couber).
- **Confirmação do inquilino (2026-10-29, L-F06-02, opção 1).** Antes de criar linhas, o notificador pula com `reason 'TENANT_UNAVAILABLE'` quando `rentalTenantConfirmationStatus = 'UNAVAILABLE'` (sempre) e com `reason 'TENANT_UNCONFIRMED'` quando o status é `PENDING`/`NO_RESPONSE` **e** `keyRequired` **e** `requiresRentalTenantConfirmation` (o inquilino não combinou presença). Recebem normalmente: `CONFIRMED` (com ou sem chave), tipo de serviço sem confirmação (`requiresRentalTenantConfirmation false`) e `PENDING`/`NO_RESPONSE` sem chave. Vale para os 3 códigos. A projeção continua usando todas as paradas (fonte: `stopMeta` do `loadPlan`, TASK-F06-1).
- **Opt-out (2026-10-29, L-F06-03).** Avisos de horário são mensagem factual de serviço (sem rodapé "STOP"); quem pede para parar é atendido pelo opt-out manual AM/OP da TASK-F06-1, e o pipeline marca `SKIPPED_OPT_OUT` (D2). O teste 22 cria o opt-out por esse caminho, não por seed.
- **Só o check-out dispara o "a caminho" (2026-10-29, L-F06-04, opção 1).** O subscriber FINISH só enfileira quando o `STATUS_TRANSITION` `→ DONE` traz `metadata.source === 'INSPECTOR_FINISH'`. Esse valor é gravado pelo `FinishInspectionUseCase`, que passa `auditMetadata: { source: 'INSPECTOR_FINISH' }` ao `executeInTransaction` (campo opcional criado pela F03-2, D2 da F03, já mesclado no `metadata` do evento). O `actorType` não serve: a transição do finish sai como `'USER'` igual ao DONE manual da OP (`execute-status-transition.use-case.ts:145`). DONE manual da OP/AM (sem `source`) → log `tenant_eta.enqueue_skipped { reason: 'MANUAL_DONE' }`, sem ON_THE_WAY; a varredura continua cobrindo atrasos. `occurredAt` do payload do job = `event.occurredAt` do **envelope** do `DomainEvent` (o payload do `STATUS_TRANSITION` não tem esse campo).
- **Correção por antecipação (2026-10-29, L-F06-05, opção 1).** Parada `PENDING` que recebeu MORNING hoje e cuja projeção ficou **≥ 30 min antes** do início da faixa matinal (`projectedStartAt < etaBandFromAt − TENANT_ETA_EARLY_CHANGE_MINUTES`) recebe **uma** correção reusando o `TENANT_ETA_ON_THE_WAY` (`trigger 'EARLY_CHANGE'`), com a faixa recalculada, inclusive a 1ª parada do dia. Mesmo ID determinístico `(ON_THE_WAY, parada, data, canal)`: no máximo 1 ON_THE_WAY por parada por dia, seja por FINISH, CANT_DO ou antecipação. Respeita o limite de 60 min da L-F06-01: enquanto a chegada estiver a mais de 60 min, não envia e a varredura seguinte reavalia. O instante da faixa matinal fica em `payloadJson.etaBandFromAt` (ISO UTC) da linha MORNING.
- **Flag por agência (2026-10-29, L-F06-06, opção 1).** O notificador lê `isTenantEtaNoticesEnabled(tenant.settingsJson)` antes do switch de inquilino; `false` → `reason 'AGENCY_ETA_OFF'`, nada criado.
- **Observabilidade obrigatória (2026-10-29, L-F06-11).** `metrics.incrementTenantEtaNoticeCount(kind, channel)` a cada linha criada (não é mais opcional); `tenant_eta.sweep_completed` ganha `smsCreatedToday`; acima de `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD` (500 SMS `TENANT_ETA_*` no dia de plataforma) → `logger.warn('tenant_eta.daily_volume_high', { smsCreatedToday, threshold })`, sem bloquear.

### Testes primeiro (TDD)

Mesma fixture da TASK-F06-1 (agência `ag-syd`, plano A/B/C, 2026-11-05, limite 20 min). Contato de A: `ana@example.com` + `+61412000001`; de B: `ben@example.com` + `+61412000002`; de C: só `+61412000003`. Configuração `enabled: true`, `BOTH`, 7, 9, 20, `smsBudgetSharePercent 80`, salvo indicação; teto de SMS da agência = padrão (100); agência sem `tenantEtaNoticesEnabled` (= ligada); A, B e C com `rentalTenantConfirmationStatus 'CONFIRMED'`, `keyRequired false`, tipo de serviço com `requiresRentalTenantConfirmation true`, salvo indicação. Repositórios em memória; `saveIfAbsent` atômico (mapa por id); `CreateNotificationUseCase` real sobre o repositório em memória (devolve `created`).

**A. Notificador (`tenant-eta-notifier.service.test.ts`)**
1. `notify({ kind: 'MORNING', stop: B, band, trigger: 'MORNING' })` → 2 chamadas a `createNotification` (EMAIL `ben@…`, SMS `+61412000002`), `templateCode 'TENANT_ETA_MORNING'`, `notificationId = getTenantEtaNotificationId({ kind, appointmentId: B, scheduledDate: '2026-11-05', channel })`, `payloadJson.etaFrom '9:00 am'`, `etaTo '9:30 am'`.
2. Só telefone (C) → 1 SMS; só e-mail → 1 EMAIL; nenhum → 0 + log `tenant_eta.notice_skipped { reason: 'NO_RECIPIENT' }`.
3. `channelMode 'SMS_ELSE_EMAIL'`: B → só SMS; contato só com e-mail → só EMAIL.
4. `enabled false` → 0, `reason 'DISABLED'`.
5. Agência com `rentalTenantNotificationsEnabled: false` → 0 linhas, `reason 'AGENCY_SWITCH_OFF'` (nenhum espelho para a agência).
5b. **Flag por agência (L-F06-06):** `tenantEtaNoticesEnabled: false` com o switch de inquilino ligado → 0 linhas, `reason 'AGENCY_ETA_OFF'`; a checagem vem antes do switch (com os dois desligados → `AGENCY_ETA_OFF`); chave ausente → envia.
5c. **Confirmação do inquilino (L-F06-02):** B `UNAVAILABLE` (com ou sem chave) → 0 linhas, `reason 'TENANT_UNAVAILABLE'`; B `PENDING` + `keyRequired true` → `reason 'TENANT_UNCONFIRMED'`; B `NO_RESPONSE` + `keyRequired true` → `TENANT_UNCONFIRMED`; B `PENDING` + `keyRequired true` + tipo com `requiresRentalTenantConfirmation false` → envia; B `PENDING` + `keyRequired false` → envia; B `CONFIRMED` + `keyRequired true` → envia. Vale para `kind` MORNING, ON_THE_WAY e DELAY.
6. Serviço com flow type `INGOING`/`OUTGOING` → 0, `reason 'FLOW_TYPE_NO_OCCUPANT'`; flow desconhecido → envia (fail-open, igual ao shared).
7. Antes de `morningHour` local (06:59) → 0, `reason 'BEFORE_MORNING_HOUR'` (D13).
8. Mesma chamada duas vezes → 2 linhas no total; na 2ª, `createNotification` devolve `{ created: false }` nos 2 canais → o notificador devolve `{ created: 0, duplicates: 2 }`, loga `tenant_eta.notice_skipped { reason: 'ALREADY_SENT', channel }` por canal e **não** loga `notice_created` nem incrementa a métrica. Na 1ª, `{ created: 2, duplicates: 0 }` e `metrics.incrementTenantEtaNoticeCount` chamado com `('MORNING', 'EMAIL')` e `('MORNING', 'SMS')` (L-F06-11; `getSnapshot().tenantEtaNoticeCounts['MORNING|SMS'] === 1`).
8c. `kind 'MORNING'` → `payloadJson.etaBandFromAt === band.from.toISOString()` (ex.: B às 07:00 → `'2026-11-04T22:00:00.000Z'`); presente também nos outros `kind` (inofensivo; o render ignora); não é variável de template e não entra em `ALLOWED_VARIABLES` (L-F06-05).
8d. **Rastro da leitura fresca (2026-10-29, reconciliação F04, L-F04-15):** em qualquer `kind`, `payloadJson.serviceStartAt === stop.serviceStartAt.toISOString()`, `payloadJson.planVersion === fresh.planVersion` (número) e `payloadJson.approximate === snapshot.approximate` (boolean), os três da leitura fresca usada no cálculo; nenhum deles é variável de template nem entra em `ALLOWED_VARIABLES`; continuam no `payloadJson` depois do scrub pós-envio (fora de `SENSITIVE_PAYLOAD_KEYS`).
8b. Um canal criado e o outro já existente (re-execução depois de queda entre os dois `execute`) → `{ created: 1, duplicates: 1 }`; só o canal novo loga `notice_created`.
9. `alreadyNotified(kind 'DELAY', B)` = `count({ tenantId, appointmentId: B, templateCode: 'TENANT_ETA_DELAY', fromDate: '2026-11-04T13:00:00.000Z' }) > 0`; linha de ontem (`2026-11-04T12:59:59Z`) não conta; linha `SKIPPED_OPT_OUT` ou `FAILED` de hoje conta.
10. Consentimento: linha criada normalmente; o pipeline marca `SKIPPED_OPT_OUT` por canal (coberto no teste de integração 22).
10b. **Reserva de SMS (D15):** 79 SMS da agência hoje (dia UTC) → SMS criado; 80 → SMS **não** criado (`reason 'SMS_BUDGET_RESERVED'`, log `tenant_eta.sms_budget_reserved { tenantId, count: 80, cap: 100, limit: 80 }`) e o e-mail é criado normalmente; agência com `notificationDailyCapSms 50` → limite 40; `smsBudgetSharePercent 100` → limite = teto (só o teto do pipeline vale); teto 0 → nenhum SMS de horário.
10c. Reserva com `channelMode 'SMS_ELSE_EMAIL'`: contato com telefone e e-mail e SMS reservado → cai para o e-mail; só telefone e SMS reservado → nada (`SMS_BUDGET_RESERVED`).
10d. Balde UTC (documentado, fora do escopo corrigir): 80 SMS entre 07:00 e 10:59 de Sydney (AEDT) → às 10:59 reservado; às 11:00 (`00:00Z`, novo dia UTC) o contador zera e o SMS volta a sair. O teste fixa esse comportamento para que uma mudança futura no balde seja consciente.
10e. A reserva só lê o contador quando há perna SMS a criar (contato sem telefone → nenhuma consulta).

**B. Aviso matinal (`send-morning-eta-notices.use-case.test.ts`)**
11. Grupo `{ timezone: 'Australia/Sydney', todayCivil: '2026-11-05', tenantIds: ['ag-syd'] }` às 07:00 → MORNING para A (8:00–8:30 am), B (9:00–9:30 am), C (10:00–10:55 am): 5 linhas (A 2, B 2, C 1 SMS); log `tenant_eta.morning_completed { stops: 3, created: 5, skipped: 0 }`.
12. Às 09:00 (claim tardio depois de uma queda) → 0 linhas; log `tenant_eta.morning_skipped_after_cutoff { timezone, tenantIds, localTime: '09:00' }`.
13. Hora-limite cruzada no meio do lote: relógio injetado passa de 08:59:59 para 09:00:00 depois de A → A enviado, B e C pulados (`reason 'AFTER_CUTOFF'`).
14. Parada já iniciada (check-in 06:55) → sem MORNING para ela (`reason 'STARTED'`).
15. Janela já encerrada antes de agora → `reason 'WINDOW_PASSED'`.
16. `findPlanByInspectorDate` → `null` → `reason 'NO_PLAN'`; `getFreshStop` → `STALE` → `reason 'PLAN_STALE'` (sem nova tentativa no mesmo dia; Achado 3).
16b. **Semente fora do plano não pula o inspetor (revisão #5):** o 1º appointment do inspetor no plano foi reatribuído entre as duas leituras (`getFreshStop` devolve `null` para ele) → o fluxo tenta o próximo `appointmentId` do plano, obtém `FRESH` e avisa as demais paradas normalmente; só quando **todos** devolvem `null` → `NO_PLAN`. Um appointment SCHEDULED de hoje do inspetor que **não** está no plano (ex.: T-1 o deixou invisível) não é usado como semente.
17. Plano `approximate true` → envia, com o mesmo texto (D17); log `notice_created` com `approximate: true`.
18. Previsão já atrasada de manhã (C com janela 10:00–10:30 e plano chegando 10:55 por ordem manual; `lateS 1500`) → **DELAY** para C (não MORNING), faixa "between 10:25 am and 11:25 am" (centro 10:55 passou do fim 10:30, então sem recorte superior: `from = max(10:25, 10:00, 07:00) = 10:25`, `to 11:25`); `trigger 'MORNING'`.
19. DELAY de C já enviado hoje (pela varredura) → nem MORNING nem DELAY para C.
20. Re-execução do grupo (pg-boss retry depois de falha do grupo) → nenhuma linha duplicada.
20b. **Parada de inquilino indisponível (L-F06-02):** B `UNAVAILABLE` com chave → nenhum `TENANT_ETA_*` para B (`reason 'TENANT_UNAVAILABLE'`); A e C recebem MORNING com as mesmas faixas do teste 11 (B continua na projeção: C 10:00–10:55).
21. Duas agências do mesmo plano em grupos diferentes (Sydney às 07:00; Perth às 07:00 de Perth = 10:00 de Sydney) → cada grupo avisa só as próprias paradas; a projeção usa o plano inteiro.

**C. Integração ponta a ponta do matinal (`tests/integration/db/tenant-eta-morning.integration.test.ts`)**
22. Seed: agência Sydney, inspetor com base, 3 appointments SCHEDULED de hoje confirmados, plano publicado pela F04 com `StubRoutingService`; contato de A com opt-out SMS registrado pelo `RecordConsentOptOutUseCase` da TASK-F06-1 (AM, `channel 'SMS'`, `notificationClass 'OPERATIONAL'`, motivo; L-F06-03), **não** por seed. Rodar o use case às 07:00 e depois o `SendNotificationUseCase` com provedores stub → A: EMAIL `SENT`, SMS `SKIPPED_OPT_OUT` (`CONSENT_OPT_OUT`); B: 2 `SENT`; C: 1 `SENT`; `payload_json.etaFrom` correto; nenhum `TENANT_NOTICE_FORWARDED_AGENCY`. Com o switch da agência desligado → 0 linhas `TENANT_ETA_*` e 0 espelhos. Com `tenantEtaNoticesEnabled: false` e switch ligado → 0 linhas `TENANT_ETA_*` (L-F06-06).

**D. Worker matinal (`tenant-eta-morning.worker.test.ts`, pg-boss fake)**
23. `boss.schedule('tenant-eta.morning', '0 * * * *', {}, { tz: PLATFORM_TIMEZONE })`; o handler lê a configuração e chama `tenantCronTick.runDue('tenant-eta.morning', morningHour, runner)`.
24. Sydney às 06:00 → nenhum claim; 07:00 → claim e envio; Adelaide (tick `:00` de Sydney = `:30` de Adelaide) → claim às 07:30 de Adelaide e envio (< 09:00); Perth → 07:00 de Perth (10:00 de Sydney).
25. DST: Sydney em 2026-10-04 às 07:00 AEDT (`2026-10-03T20:00Z`) → envia; Brisbane (sem DST) no mesmo dia às 07:00 AEST (`21:00Z`, tick das 08:00 de Sydney) → envia.
26. `enabled false` → `runDue` **não** é chamado (nenhum claim gasto).
27. Erro num grupo → `runDue` libera o claim e relança (comportamento existente); o retry depois das 09:00 não envia (teste 12).

**E. Subscribers**
28. `enqueue-tenant-eta-on-done.subscriber.test.ts`: `STATUS_TRANSITION` com `toStatus 'DONE'` **e** `metadata.source 'INSPECTOR_FINISH'`, envelope `occurredAt 2026-11-04T21:55:00.000Z` → `enqueue('tenant-eta.evaluate', { trigger: 'FINISH', appointmentId, tenantId, occurredAt: '2026-11-04T21:55:00.000Z', attempt: 1 }, { singletonKey: 'tenant-eta:FINISH:{appointmentId}:1793829300000', retryLimit: 2, retryBackoff: true, expireInMinutes: 5 })` (o `occurredAt` vem de `event.occurredAt`, não do payload; L-F06-04); outros status → nada; erro do enqueue → log `tenant_eta.enqueue_failed`, sem relançar.
28a. **DONE manual (L-F06-04):** `toStatus 'DONE'` com `actorType 'USER'` e sem `metadata.source` (OP marcou pelo web, ou `doneCheckedByUserId` sem execução) → nada enfileirado, log `tenant_eta.enqueue_skipped { reason: 'MANUAL_DONE', appointmentId }`; `metadata.source 'INSPECTOR_CANT_DO'` com `toStatus 'DONE'` (impossível, defensivo) → nada.
28c. `finish-inspection.use-case.test.ts` (estender; L-F06-04): o `executeInTransaction` recebe `{ appointmentId, targetStatus: 'DONE', actor, auditMetadata: { source: 'INSPECTOR_FINISH' } }`; o `STATUS_TRANSITION` emitido traz `metadata.source === 'INSPECTOR_FINISH'`; as asserções existentes de `toHaveBeenCalledWith` do finish são atualizadas para o objeto novo.
28b. `enqueue-tenant-eta-on-cant-do.subscriber.test.ts` (D16): `STATUS_TRANSITION` com `toStatus 'REJECTED'` e `metadata.source 'INSPECTOR_CANT_DO'` → `enqueue('tenant-eta.evaluate', { trigger: 'CANT_DO', appointmentId, tenantId, inspectorId: metadata.initiatedByInspectorId, occurredAt, attempt: 1 }, { singletonKey: 'tenant-eta:CANT_DO:{appointmentId}:{occurredAt epoch ms}', … })`; `REJECTED` com outra origem (OP, `TENANT_DECLINED`, `TENANT_NO_RESPONSE`) → nada; sem `initiatedByInspectorId` → log `tenant_eta.enqueue_skipped { reason: 'NO_INSPECTOR' }`, nada.
29. `enqueue-tenant-eta-on-late-notice.subscriber.test.ts`: `RECORDED` com `type 'LATE_NOTICE'` → `enqueue('tenant-eta.evaluate', { trigger: 'LATE_NOTICE', appointmentId, tenantId, eventId, attempt: 1 }, { singletonKey: 'tenant-eta:LATE_NOTICE:{eventId}', … })`; `CANT_DO` → nada.

**F. Avaliação (`evaluate-tenant-eta.use-case.test.ts`)**
30. **FINISH, caso E2:** A DONE às 08:55 (job às 08:55:20) → projeção de B 09:10:20 → ON_THE_WAY para B, "between 9:00 am and 9:40 am", 2 linhas; C não atrasada → nada para C. O horário é o mesmo que o app do inspetor mostra às 08:55:20 (E12).
31. Próxima já iniciada (B com check-in antes do check-out de A) → nada para B (`reason 'NEXT_STARTED'`).
32. Próxima saiu do plano (B cancelada/rejeitada antes) → a "próxima" é C, que recebe ON_THE_WAY (o inspetor vai para C).
33. Última parada do dia → nenhum ON_THE_WAY (`reason 'NO_NEXT_STOP'`).
33b. **Próxima com espera de janela (L-F06-01):** A fim 09:00 (job 09:00:10), B com janela **13:00–15:00** e `travel_s` 1200 → folga para frente adia a partida; `projectedArrivalAt` de B = 13:00; `13:00 − 09:00:10 > 60 min` → nenhum ON_THE_WAY, `reason 'NEXT_TOO_FAR'`, nenhum job reagendado. Mesmo cenário com B janela **09:30–11:00** → chegada 09:30 (30 min) → ON_THE_WAY para B, "between 9:30 am and 10:00 am".
33c. Chegada exatamente a 60 min (`projectedArrivalAt − now = 3600 s`) → envia (≤, inclusivo); 3601 s → `NEXT_TOO_FAR`.
33d. Próxima atrasada (caminho DELAY do passo 4) com chegada a mais de 60 min → o **DELAY** sai normalmente (o limite só vale para ON_THE_WAY).
34. DONE de appointment com `scheduledDate` ≠ hoje local (OP fechando ontem) → nada (`reason 'NOT_TODAY'`).
35. `getFreshStop` → `STALE` na tentativa 1 → reenfileira com `attempt: 2`, `startAfter` = agora + 30 s; na 3ª → log `tenant_eta.evaluate_gave_up { reason: 'PLAN_STALE' }` e termina sem erro.
36. **Próxima atrasada, sem DELAY hoje:** cenário com C como próxima e projeção 11:25 (janela até 11:00) → **DELAY** para C em vez de ON_THE_WAY (uma mensagem só), `trigger 'FINISH'`.
37. **Próxima atrasada, DELAY já enviado hoje:** → ON_THE_WAY para a próxima com a faixa sem recorte superior ("between 11:00 am and 11:55 am") (D5: o "a caminho" continua).
38. **Replay** `DONE → DRAFT → DONE` de A no mesmo dia → nenhuma linha nova para B (ID determinístico).
39. FINISH também reavalia as paradas **depois** da próxima: cenário E4b com A finalizada às 08:45 e aviso de 60 min em B → ON_THE_WAY para B ("between 9:30 am and 10:30 am", piso 10:00) **e** DELAY para C ("between 10:55 am and 11:55 am"), se ainda não enviado.
40. **LATE_NOTICE, E4b (08:20):** → DELAY para C, "between 10:55 am and 11:55 am"; nada para B (não passa do fim da janela de B); nenhum ON_THE_WAY.
41. **LATE_NOTICE, E4a (30 min):** → nada.
42. LATE_NOTICE às 06:30 → nada (`BEFORE_MORNING_HOUR`); a varredura das 07:00 envia se ainda valer.
43. Plano `null` → nada (`reason 'NO_PLAN'`).
43b. **CANT_DO depois de A feita (D16):** A DONE 08:55; B com check-in 09:12 e "Não consigo fazer" às 09:20 (B → REJECTED, sai do plano); job às 09:20:10 → plano recalculado pela F04 sem B (prefixo `[A]`, C com `travel_s` de A → C); C projetada com partida `max(08:55, 09:20:10) = 09:20:10` + trecho A → C → **ON_THE_WAY para C**. Dedupe `(ON_THE_WAY, C, 2026-11-05, canal)`.
43c. CANT_DO **sem** check-in (inspetor desiste de B antes de chegar, nenhuma parada em andamento) → ON_THE_WAY para a 1ª pendente (C).
43d. CANT_DO com outra parada **em andamento** (inspetor em A informa que não fará C) → nenhum ON_THE_WAY (`reason 'INSPECTOR_BUSY'`); o "a caminho" para B virá no check-out de A; `evaluatePlanDelays` roda normalmente.
43e. CANT_DO na última parada pendente → `NO_NEXT_STOP`.
43f. DONE de A e CANT_DO de outra parada, ambos levando à mesma próxima → 1 ON_THE_WAY por canal (mesmo ID determinístico).
43g. CANT_DO de appointment com `scheduledDate` ≠ hoje local da agência (job reprocessado no dia seguinte) → `NOT_TODAY`.
43h. A semente é o plano por `(metadata.initiatedByInspectorId, scheduledDate)`, não o appointment rejeitado (que já não tem inspetor): `findPlanByInspectorDate` é chamado com esses valores.

**G. Varredura (`sweep-tenant-eta-delays.use-case.test.ts`)**
43i. Plano aproximado no CANT_DO → avisa (D17).
44. E3a (10:30) → 0 linhas; E3b (11:00) → DELAY para C ("between 11:00 am and 11:55 am", 1 SMS); 11:30 → nada novo (1 por parada por dia).
45. **01.A5:** com `delayThresholdMinutes 30`, E3b → nada; com 20 → envia.
46. Plano `STALE` na leitura fresca → pulado nesta rodada, contado em `skippedStale`; a próxima rodada tenta de novo.
46b. Reserva de SMS atingida no meio da varredura → os DELAY seguintes da agência saem só por e-mail.
47. Dois planos (Sydney e Perth) → cada um avaliado com "hoje" no fuso do plano.
48. Previsão que cai no dia seguinte local (00:10) → nada (`reason 'NEXT_DAY'`).
49. Log `tenant_eta.sweep_completed { plans, evaluated, delayed, earlyChanged, created, skippedStale, smsCreatedToday, durationMs }`.
49b. **Volume diário (L-F06-11):** `noticeLog.countSmsCreatedSince(meia-noite de Sydney)` devolve 500 → sem warn; 501 → `logger.warn({ smsCreatedToday: 501, threshold: 500 }, 'tenant_eta.daily_volume_high')`, a varredura continua e envia normalmente.
49c. **Antecipação (L-F06-05),** fixture própria: C' com janela **08:00–14:00**, 45 min, MORNING enviado às 07:00 com faixa 10:00–10:55 (`etaBandFromAt` = 10:00 local = `2026-11-04T23:00:00.000Z`). Às 07:20 o inspetor reordena C' para 1ª (base → C' 1200 s, `departure_at` 07:40) → projeção 08:00. Varredura das 07:30: `08:00 < 10:00 − 30 min` e chegada a 30 min (≤ 60) → **ON_THE_WAY** para C' com `trigger 'EARLY_CHANGE'`, "between 8:00 am and 8:30 am" (`from = max(07:30, 08:00, 07:30) = 08:00`). Log `notice_created { kind: 'ON_THE_WAY', trigger: 'EARLY_CHANGE' }`.
49d. Mesmo cenário com projeção 09:40 (só 20 min antes da faixa) → nada (`09:40 ≥ 09:30`).
49e. Projeção 09:00 avaliada às 07:30 (chegada a 90 min) → nada nesta rodada (`reason 'NEXT_TOO_FAR'`); rodada das 08:00 (chegada a 60 min) → envia.
49f. Parada sem MORNING hoje (sem linha MORNING) → nunca `EARLY_CHANGE`; parada que já recebeu ON_THE_WAY hoje → `ALREADY_SENT` (o mesmo ID); depois do `EARLY_CHANGE`, o FINISH da parada anterior não gera outro ON_THE_WAY (`ALREADY_SENT`).
49g. `EARLY_CHANGE` também é avaliado no `evaluate` (FINISH/CANT_DO/LATE_NOTICE), para as pendentes **depois** da próxima.

**H. Dedupe e corrida (01.A7)**
50. `tenant-eta-dedupe.test.ts`: FINISH, LATE_NOTICE e varredura avaliando C atrasada **em paralelo** (`Promise.all`) → exatamente 1 linha `TENANT_ETA_DELAY` por canal para C no dia; a soma dos `created` dos 3 é 1 por canal e os demais veem `created: false`.
50b. FINISH e CANT_DO em paralelo levando à mesma próxima → 1 ON_THE_WAY por canal.
50c. `EARLY_CHANGE` (varredura) e FINISH em paralelo para a mesma parada → 1 ON_THE_WAY por canal (L-F06-05).
51. Linha de DELAY de C criada ontem às 23:59 local → hoje o DELAY sai de novo (o dia é o local da agência, não UTC): fronteira em `2026-11-04T13:00:00Z`.
52. Appointment remarcado para amanhã depois de receber DELAY hoje → amanhã pode receber outro (chave inclui `scheduledDate`).

**I. Worker de avaliação e varredura (`tenant-eta.workers.test.ts`)**
53. `boss.work('tenant-eta.evaluate', withJobMetrics(...))` chama o use case com `job.data`; `boss.schedule('tenant-eta.sweep-delays', '*/30 * * * *', {}, SYDNEY_TZ)` com `boss.work(..., { teamSize: 1, teamConcurrency: 1 })`; `enabled false` → os dois handlers retornam sem ler planos.

### Escopo / Passos
1. **`application/tenant-eta-notifier.service.ts`** (`TenantEtaNotifier`): recebe `{ kind, trigger, stop, band, appointmentWithRelations, tenant, settings, now }`; aplica, nesta ordem: `enabled` → hora matinal (D13) → **flag da agência** (`isTenantEtaNoticesEnabled(tenant.settingsJson)`, senão `AGENCY_ETA_OFF`; L-F06-06) → switch da agência (D10) → flow type (D10) → **confirmação do inquilino** (`stopMeta`: `UNAVAILABLE` → `TENANT_UNAVAILABLE`; `PENDING`/`NO_RESPONSE` + `keyRequired` + `requiresRentalTenantConfirmation` → `TENANT_UNCONFIRMED`; L-F06-02) → **antecedência do ON_THE_WAY** (só `kind 'ON_THE_WAY'`: `projectedArrivalAt − now > 60 min` → `NEXT_TOO_FAR`; L-F06-01) → destinatários (D1 + `channelMode`) → **reserva de SMS** (D15: se há perna SMS, `limit = floor(cap × smsBudgetSharePercent / 100)` com `cap = typeof tenant.settingsJson.notificationDailyCapSms === 'number' ? … : 100`, `count = notificationRepo.countByTenantChannelSince(tenantId, 'SMS', início do dia UTC de now)`; `count ≥ limit` → descarta a perna SMS e, em `SMS_ELSE_EMAIL`, cai para o e-mail) → monta o payload (`BuildNotificationPayloadService.build({ …, templateCode, rawPortalToken: null, eta: formatEtaBand(band, stop.windowTimezone) })`, acrescentando `etaBandFromAt: band.from.toISOString()` ao `payloadJson`; L-F06-05; e, como a F04 não guarda histórico de versões do plano, `serviceStartAt`, `planVersion` e `approximate` da leitura fresca; reconciliação F04, L-F04-15) → `createNotification.execute({ notificationId: getTenantEtaNotificationId(...), tenantId, appointmentId, recipient, channel, templateCode, payloadJson })` por canal → lê `created` da saída (TASK-F06-1): `true` → log `notice_created` + `metrics.incrementTenantEtaNoticeCount(kind, channel)`; `false` → log `notice_skipped { reason: 'ALREADY_SENT' }`. Devolve `{ created: number; duplicates: number; skippedReason?: string }`. Expõe também `alreadyNotified(kind, stop)` (contagem desde a meia-noite local). A reserva não é atômica: criações concorrentes podem passar alguns SMS do limite de 80%; o teto do pipeline continua sendo o limite duro.
2. **`application/use-cases/send-morning-eta-notices.use-case.ts`** (01.12-B; Gatilhos §1).
3. **`application/use-cases/evaluate-tenant-eta.use-case.ts`** (01.10 + 01.12 no finish, no CANT_DO e no `LATE_NOTICE`; Gatilhos §2, §2b e §3).
4. **`application/use-cases/sweep-tenant-eta-delays.use-case.ts`** (01.12 varredura; Gatilhos §4).
5. **`application/services/evaluate-plan-delays.ts`** (função compartilhada por avaliação e varredura): dado o snapshot e a projeção, para cada pendente com `isProjectedLate` e sem `alreadyNotified('DELAY')`, chama o notificador com `kind 'DELAY'`.
5b. **`application/services/evaluate-for-plan.ts`** (fluxo comum com a escolha de semente que está no plano; Algoritmo).
5c. **`application/services/evaluate-early-changes.ts`** (L-F06-05; usado pela varredura e pelo `evaluate`): para cada pendente com linha MORNING de hoje (`noticeLog.findMorningBands`), `projectedStartAt < etaBandFromAt − TENANT_ETA_EARLY_CHANGE_MINUTES` → notificador com `kind 'ON_THE_WAY'`, `trigger 'EARLY_CHANGE'`, faixa `computeEtaBand(projectedStartAt, janela, now)`; o limite de 60 min e o dedupe são os do notificador.
5d. **Porta `ITenantEtaNoticeLog` + `infrastructure/prisma-tenant-eta-notice-log.ts`** (L-F06-05, L-F06-11): `findMorningBands(appointmentIds, sinceByAppointment)` → `Map<appointmentId, Date>` lendo `payload_json->>'etaBandFromAt'` das linhas `template_code = 'TENANT_ETA_MORNING'` de hoje (meia-noite local da agência da parada; qualquer canal, a mais recente; índices `appointment_id`/`template_code` existentes); `countSmsCreatedSince(since)` → `count(*)` de `notifications` com `template_code IN (3 códigos) AND channel = 'SMS' AND created_at >= since` (cross-tenant de propósito, métrica de plataforma, mesma exceção D9; nenhuma rota expõe).
6. **Subscribers** em `application/subscribers/`: `enqueue-tenant-eta-on-done.subscriber.ts` (só com `metadata.source === 'INSPECTOR_FINISH'`; DONE manual → `enqueue_skipped { reason: 'MANUAL_DONE' }`; `occurredAt = event.occurredAt`; L-F06-04), `enqueue-tenant-eta-on-cant-do.subscriber.ts` e `enqueue-tenant-eta-on-late-notice.subscriber.ts` (só enfileiram; nunca relançam).
6b. **Origem do check-out** (L-F06-04): em `apps/backend/src/modules/inspector-execution/application/use-cases/finish-inspection.use-case.ts` (chamada `executeInTransaction`, l. 105–109), passar `auditMetadata: { source: 'INSPECTOR_FINISH' }` (campo opcional criado pela F03-2); exportar a constante `TRANSITION_SOURCE_INSPECTOR_FINISH = 'INSPECTOR_FINISH'` junto do `'INSPECTOR_CANT_DO'` da F03. Atualizar as asserções do `finish-inspection.use-case.test.ts`.
7. **Wiring** em `main/container.ts` (`container.tenantEta.*`; subscribers `.register(domainEventBus)` junto dos demais) e **workers** em `main/workers.ts`: `tenant-eta.morning` (`'0 * * * *'`), `tenant-eta.evaluate` (por demanda), `tenant-eta.sweep-delays` (`'*/30 * * * *'`, singleton); acrescentar os 3 nomes ao log final de workers.
8. **Métricas e volume (obrigatório; L-F06-11):** `MetricsCollector.incrementTenantEtaNoticeCount(kind, channel)` (`shared/infrastructure/metrics.ts`, mapa `tenantEtaNoticeCounts` com chave `'{kind}|{channel}'` no `getSnapshot()`, zerado no `reset()`), incrementado a cada linha criada; ao fim da varredura, `smsCreatedToday = noticeLog.countSmsCreatedSince(meia-noite de PLATFORM_TIMEZONE)` no log `sweep_completed` e `logger.warn('tenant_eta.daily_volume_high')` acima de `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD`.
9. **Documentação (regra X00):** `apps/backend/CLAUDE.md` §9 (os 3 jobs, o padrão "tick com `>=` + hora-limite obrigatória" para avisos com horário, e o "subscriber só enfileira job durável"); §10 (dedupe por ID determinístico + contagem desde a meia-noite local, sem família `_SMS`; "a caminho" só com chegada ≤ 60 min; só o check-out com `source 'INSPECTOR_FINISH'` dispara; pulos por confirmação do inquilino e por `tenantEtaNoticesEnabled`; métrica `tenantEtaNoticeCounts` e warn `daily_volume_high`).

### Algoritmo

Resumo do que vem da TASK-F06-1 (detalhes e exemplos lá):
- **Projeção:** `projectStopEta(plan, events, now)` do shared — âncora no último evento real (fim real; em andamento = `max(now, início + duração)`; sem evento = `departure_at`), trechos `travel_s` da ordem salva, duração do tipo, **partida ≥ agora** (a mesma regra do app do inspetor), piso do `LATE_NOTICE` (`published_service_start_at + minutos`, D18), avaliado com `evaluateSequence` da F04.
- **Atraso:** `isProjectedLate(stop, delayThresholdMinutes)` = início projetado **>** fim da janela + limite.
- **Faixa:** centro arredondado a 5 min, ±30, `from ≥ max(início da janela, agora)`, `to ≤ fim da janela` só quando o centro está dentro dela.

**Fluxo comum `evaluateForPlan({ inspectorId, planDate }, now)`** (usado por todos os gatilhos):
1. `ref = planReader.findPlanByInspectorDate(inspectorId, planDate)`; `null` → `NO_PLAN`.
2. **Semente que está no plano (revisão #5):** para cada `appointmentId` de `ref.appointmentIds`, em ordem: `fresh = getFreshStopForAppointmentUseCase.execute({ appointmentId, now })`; `null` (o appointment saiu do plano entre as leituras) → tenta o próximo; `status 'STALE'` → `PLAN_STALE` (regra de cada gatilho) e para; `FRESH` → segue. Todos `null` → `NO_PLAN`. Nunca se usa como semente um appointment que não está em `day_plan_stops` (o appointment do evento, o rejeitado do CANT_DO ou um SCHEDULED que o T-1 tirou do plano): um appointment fora do plano não pula o inspetor inteiro.
2b. `snapshot = planReader.loadPlan(fresh.dayPlanId)`; se `snapshot.planVersion ≠ fresh.planVersion` (outro cálculo gravou entre as duas leituras), repetir 1–2 **uma** vez; persistindo, segue com o snapshot lido (é o mais novo).
3. `projection = projectStopEta(snapshot.plan, snapshot.events, now)` (os eventos vêm do próprio snapshot: execuções e `LATE_NOTICE`).
4. Carregar, sob demanda e com cache por execução, `appointmentRepo.findById(id, tenantId)` e `tenantRepo.findById(tenantId)` só das paradas que vão ser avisadas (cada uma no próprio tenant).

### Gatilhos

**§1. Aviso matinal — job `tenant-eta.morning` (01.12-B)**
- **Fonte:** `boss.schedule('tenant-eta.morning', '0 * * * *', {}, SYDNEY_TZ)`; handler: lê `tenantEtaNotices`; `enabled false` → retorna; senão `tenantCronTick.runDue('tenant-eta.morning', morningHour, runner)`.
- **Horário:** o tick `:00` de Sydney cai em `:00` local nas agências de hora cheia e em `:30` nas de meia hora (Adelaide/Darwin: 07:30). Ambos antes das 09:00.
- **Hora-limite (obrigatória por causa do `>=`):** `cutoff = zonedWallTimeToUtc(group.todayCivil, HH(morningCutoffHour) + ':00', group.timezone)`. No início do runner, `now ≥ cutoff` → log `tenant_eta.morning_skipped_after_cutoff` e retorna **sem lançar** (o claim fica gasto: não há segunda chance no dia). A mesma checagem roda **antes de cada criação** de notificação (um lote longo ou um retry do pg-boss que cruze 09:00 para ali).
- **Seleção:** `appointmentRepo.findScheduledOnDate(new Date(todayCivil + 'T00:00:00.000Z'), group.tenantIds)`, só com `inspectorId`; agrupar por inspetor; para cada inspetor, `evaluateForPlan({ inspectorId, planDate: todayCivil })`; avisar as paradas da projeção cujo `tenantId ∈ group.tenantIds`.
- **Condições por parada:** `state 'PENDING'` (senão `STARTED`); `windowEndAt > now` (senão `WINDOW_PASSED`); `isProjectedLate` → caminho DELAY (se `alreadyNotified('DELAY')` → nada); senão, se `alreadyNotified('DELAY')` → nada (o atraso já informou a faixa); senão MORNING com `computeEtaBand(projectedStartAt, janela, now)`.
- **Dedupe:** ID determinístico `(MORNING, appointmentId, scheduledDate, canal)`; re-execuções do grupo nunca duplicam.
- **Corrida:** a varredura das 07:00 pode avaliar o mesmo plano ao mesmo tempo; os IDs determinísticos de DELAY e a regra "DELAY já enviado → sem MORNING" resolvem (no pior caso o inquilino recebe DELAY e MORNING com segundos de diferença, quando o DELAY é criado depois da checagem do matinal; aceito, raro).

**§2. "A caminho" — DONE → job `tenant-eta.evaluate` (01.10)**
- **Fonte:** `EnqueueTenantEtaOnDoneSubscriber` em `APPOINTMENT_EVENTS.STATUS_TRANSITION` com `toStatus 'DONE'` **e** `metadata.source === 'INSPECTOR_FINISH'` (check-out do inspetor, gravado pelo `FinishInspectionUseCase`; 2026-10-29, L-F06-04) → `enqueue('tenant-eta.evaluate', { trigger: 'FINISH', appointmentId, tenantId, occurredAt: event.occurredAt, attempt: 1 })`. DONE manual da OP/AM (sem `source`) → `enqueue_skipped { reason: 'MANUAL_DONE' }`: o inspetor pode estar em qualquer outro lugar, e a varredura continua cobrindo atrasos. Um job durável em vez de trabalhar dentro do subscriber porque: o emit é *fire-and-forget* em processo (uma queda perderia o aviso); a leitura fresca pode recalcular o plano com o Mapbox (fora do caminho da transição); e o STALE da F04 roda no mesmo evento, então o job, rodando depois, já encontra o plano marcado e recalcula a partir do fim real.
- **Timing:** segundos depois do check-out (o DONE acontece na mesma transação do finish, F03 D5); um check-out sincronizado tarde pela fila offline chega tarde, mas o piso "agora" da faixa mantém o texto coerente.
- **Condições:**
  1. `enabled`; appointment DONE existe; `scheduledDate` = hoje local da agência (senão `NOT_TODAY`); `now ≥ morningHour` local (senão `BEFORE_MORNING_HOUR`);
  2. `evaluateForPlan({ inspectorId: appointment.inspectorId, planDate: scheduledDate })`; `STALE` → reenfileira `{ attempt + 1 }` com `startAfter` = agora + 30 s, até `attempt 3`; depois `tenant_eta.evaluate_gave_up`;
  3. **próxima parada** = a 1ª parada **depois** da finalizada na ordem da projeção (executadas por `sequence`, depois pendentes por `sequence`), entre as que continuam no plano. Se ela é `IN_PROGRESS`/`DONE` → `NEXT_STARTED`, nada; se não existe → `NO_NEXT_STOP`. Canceladas e rejeitadas já não estão no plano, então a "próxima" é a seguinte que continua (o inspetor vai para ela);
  4. próxima com `isProjectedLate` e sem DELAY hoje → **DELAY** (uma mensagem só, com a nova faixa); com DELAY já enviado → **ON_THE_WAY** (D5); sem atraso → **ON_THE_WAY**. Faixa: `computeEtaBand(projectedStartAt, janela, now)`. Qualquer ON_THE_WAY só sai com `projectedArrivalAt − now ≤ 60 min`; senão `NEXT_TOO_FAR`, sem reagendar (L-F06-01: com a folga para frente da F04, uma próxima de janela da tarde tem chegada no início da janela, horas depois).
  5. Depois, `evaluatePlanDelays` e `evaluateEarlyChanges` para as pendentes **após** a próxima (DELAY ou correção por antecipação onde couber).
- **Dedupe:** `(ON_THE_WAY, próxima, data, canal)`; um replay `DONE → DRAFT → DONE` não duplica.
- **CANT_DO:** ver §2b.

**§2b. "A caminho" — CANT_DO → REJECTED → job `tenant-eta.evaluate` (01.10, D16, dev 2026-10-28)**
- **Fonte:** `EnqueueTenantEtaOnCantDoSubscriber` em `APPOINTMENT_EVENTS.STATUS_TRANSITION` com `toStatus 'REJECTED'` **e** `metadata.source === 'INSPECTOR_CANT_DO'` (F03 D2) → `enqueue('tenant-eta.evaluate', { trigger: 'CANT_DO', appointmentId, tenantId, inspectorId: metadata.initiatedByInspectorId, occurredAt, attempt: 1 })`. Ouvir a transição (e não o `INSPECTOR_FIELD_EVENTS.RECORDED` `CANT_DO`) garante que a rejeição já foi gravada e a parada já saiu do plano. Rejeições com outra origem (OP/AM, `TENANT_DECLINED`, `TENANT_NO_RESPONSE`, `EXPIRED`) não disparam.
- **Condições:**
  1. `enabled`; `appointmentRepo.findById(appointmentId, tenantId)` para ler `scheduledDate` (o appointment existe, só perdeu o inspetor); `scheduledDate` = hoje local da agência (senão `NOT_TODAY`); `now ≥ morningHour` local;
  2. `evaluateForPlan({ inspectorId, planDate: scheduledDate })` — o rejeitado não serve de semente (já saiu do plano); STALE: mesmo reenfileiramento do §2. Como o `STATUS_TRANSITION` marca o plano STALE (F04), a leitura fresca recalcula sem a parada rejeitada;
  3. se alguma parada está `IN_PROGRESS` → `INSPECTOR_BUSY`, nenhum ON_THE_WAY (o inspetor está em outro serviço; o "a caminho" virá no check-out dele);
  4. **próxima parada** = a 1ª `PENDING` da projeção (a parada rejeitada já não está lá, então "depois dela" = a 1ª ainda não iniciada); não existe → `NO_NEXT_STOP`;
  5. mesma regra do §2 passo 4 (DELAY no lugar do ON_THE_WAY se atrasada e sem DELAY hoje) e passo 5 (`evaluatePlanDelays` e `evaluateEarlyChanges` das seguintes); o limite de 60 min do ON_THE_WAY também vale aqui.
- **Projeção:** partida `max(fim real da última executada, agora)` com o trecho que a F04 recalculou **da última executada** até a próxima. Sem rastreamento, a F06 não sabe que o inspetor está no endereço da parada rejeitada; o erro é o do trecho (aceito, coberto pela faixa de 1 hora).
- **Dedupe:** o **mesmo** ID do §2 `(ON_THE_WAY, próxima, data, canal)`: um DONE e um CANT_DO que levem à mesma próxima geram 1 aviso.

**§3. Atraso por `LATE_NOTICE` — job `tenant-eta.evaluate` (01.12)**
- **Fonte:** `EnqueueTenantEtaOnLateNoticeSubscriber` em `INSPECTOR_FIELD_EVENTS.RECORDED` com `type 'LATE_NOTICE'` → `enqueue('tenant-eta.evaluate', { trigger: 'LATE_NOTICE', appointmentId, tenantId, eventId, attempt: 1 })`.
- **Condições:** `enabled`; `now ≥ morningHour` local; `evaluateForPlan({ inspectorId, planDate })` com o `inspectorId` do payload e o `scheduledDate` do appointment (STALE: mesmo reenfileiramento do §2); `evaluatePlanDelays` em **todas** as pendentes do plano (o piso de uma parada empurra as seguintes; E4b avisa C, não B). Nenhum ON_THE_WAY de "próxima parada"; `evaluateEarlyChanges` roda nas pendentes (um `LATE_NOTICE` nunca antecipa, então na prática não envia).
- **Dedupe:** `(DELAY, appointmentId, data, canal)` + `alreadyNotified`.

**§4. Varredura — job `tenant-eta.sweep-delays` (01.12)**
- **Fonte:** `boss.schedule('tenant-eta.sweep-delays', '*/30 * * * *', {}, SYDNEY_TZ)`, worker com `teamSize: 1, teamConcurrency: 1`.
- **Seleção:** `planReader.listSweepCandidates(now)` (planos de hoje no fuso do plano, publicados, com ao menos 1 pendente SCHEDULED).
- **Por plano:** `evaluateForPlan({ inspectorId, planDate })` do candidato; `STALE` → pula nesta rodada (`skippedStale`); senão `evaluatePlanDelays` e depois `evaluateEarlyChanges` (L-F06-05), respeitando `morningHour` local de cada parada.
- **Antecipação (L-F06-05):** pendente com MORNING hoje e `projectedStartAt < etaBandFromAt − 30 min` → ON_THE_WAY `trigger 'EARLY_CHANGE'` (1ª parada inclusive), limitado a chegada ≤ 60 min; enquanto mais longe, a rodada seguinte reavalia (o atraso de detecção é ≤ 30 min, coberto pelo limite de 60).
- **Volume (L-F06-11):** no fim, `smsCreatedToday` e warn `daily_volume_high` acima de 500.
- **Detecção:** o atraso é visto em até 30 min depois de virar verdade (E3: cruza às 10:55, avisado às 11:00).
- **Corrida com o §2/§3:** IDs determinísticos; o primeiro a inserir vence, os outros veem `saveIfAbsent false`.

**Limite de dia:** nenhum DELAY cuja faixa caia depois de 23:59 locais da agência (`NEXT_DAY`). Nenhum gatilho avisa paradas de outro dia.

### Templates (com copy)
Os códigos, variáveis e textos são os da TASK-F06-1 (repetidos aqui para a spec ficar autocontida):

| Código | Quando | SMS (GSM-7, 1 parte com dados de exemplo) | Assunto do e-mail |
|---|---|---|---|
| `TENANT_ETA_MORNING` | §1 | `Properfy: Hi {{rentalTenantName}}, your inspection is today. The inspector is expected to arrive between {{etaFrom}} and {{etaTo}}.` (117) | `Your inspection today: arrival between {{etaFrom}} and {{etaTo}}` |
| `TENANT_ETA_ON_THE_WAY` | §2, §2b, §4 (`EARLY_CHANGE`) | `Properfy: Hi {{rentalTenantName}}, your inspector is on the way and is expected to arrive between {{etaFrom}} and {{etaTo}}.` (110) | `Your inspector is on the way` |
| `TENANT_ETA_DELAY` | §1 (atrasado de manhã), §2 (próxima atrasada sem DELAY), §3, §4 | `Properfy: Hi {{rentalTenantName}}, your inspector is running late. New expected arrival: between {{etaFrom}} and {{etaTo}}. Sorry for the delay.` (130) | `Your inspector is running late` |

Payload de cada linha: `BuildNotificationPayloadService.build({ templateCode, tenant, appointment, contact, propertyAddress, branchName, inspectorName, serviceTypeName, rawPortalToken: null, portalBaseUrl, appointmentCodeFormatter, eta: { from, to } })`. O escape de HTML no SMS (nomes com `'`/`&`) está sendo corrigido em outra tarefa; a F06 não depende dela.

### Casos de borda
1. **Sem plano** (inspetor atribuído depois das 19:30 e sem abrir o app; F04 Achado 14) → `findPlanByInspectorDate` devolve `null` → nenhum aviso matinal para aquele dia (Achado 3). Um appointment do inspetor fora do plano nunca derruba a avaliação do plano inteiro (fluxo comum, passo 2).
2. **Plano STALE** (a F04 perdeu a corrida duas vezes) → matinal pula; avaliação reenfileira até 3×; varredura tenta na rodada seguinte.
3. **Próxima parada cancelada ou iniciada** → §2 passo 3.
3b. **Parada encerrada por "Não consigo fazer"** → §2b: "a caminho" para a 1ª pendente, salvo se o inspetor estiver em outro serviço (`INSPECTOR_BUSY`).
3c. **Próxima com janela distante** (L-F06-01): A termina 09:00, B tem janela 13:00–15:00 → chegada projetada 13:00 (folga para frente) → `NEXT_TOO_FAR`, nada reagendado; B fica com o MORNING e, se atrasar, com o DELAY. Se depois a projeção de B antecipar ≥ 30 min da faixa matinal, a correção `EARLY_CHANGE` sai quando a chegada ficar a ≤ 60 min.
3d. **DONE marcado pela OP sem check-out** (L-F06-04) → nenhum "a caminho" (`MANUAL_DONE`); vale também para DONE em lote no fim da manhã e para `DONE` reaberto e refeito pela OP. Um check-out sincronizado tarde pela fila offline passa pelo `FinishInspectionUseCase` e **dispara** (a faixa tem piso "agora").
3e. **Inquilino indisponível ou não confirmado com chave** (L-F06-02) → nenhum `TENANT_ETA_*` para ele (`TENANT_UNAVAILABLE`/`TENANT_UNCONFIRMED`); a parada continua na projeção das demais. Se o inquilino confirmar no portal durante o dia, os gatilhos seguintes já o avisam (MORNING perdido não é reenviado).
3f. **Inquilino da parada encerrada por "Não consigo fazer"** (2026-10-29, reconciliação F03, L-F03-01): a F06 não manda nenhum `TENANT_ETA_*` para ele (a parada saiu do plano); o portal dele bloqueia o "change time" enquanto estiver REJECTED/`INSPECTOR_UNABLE` (`isPortalChangeTimeBlocked`, `appointment.canChangeTime false`, F03 D20). Os avisos da F06 não levam link do portal (D12), então não há interação; um MORNING enviado antes do CANT_DO não é corrigido pela F06.
4. **Primeira parada do dia** → não recebe o ON_THE_WAY de "próxima parada" (não há anterior); recebe MORNING, se for o caso DELAY e, se a previsão antecipar ≥ 30 min da faixa matinal, a correção `EARLY_CHANGE` (L-F06-05).
5. **Janela já encerrada** → sem MORNING; DELAY continua possível (projeção ≥ agora > fim da janela + limite), 1 vez.
6. **Sem telefone / sem e-mail / nenhum dos dois** → D1.
7. **Opt-out por canal** → linha `SKIPPED_OPT_OUT` só no canal recusado; conta para o "1 por dia". O opt-out é registrado por AM/OP pelo endpoint da TASK-F06-1 quando o inquilino pede (ligação, e-mail, resposta "STOP" lida pela agência); não há tratamento automático de "STOP" (L-F06-03).
8. **Switch da agência desligado** → nada criado, nenhum espelho (D10).
8b. **`tenantEtaNoticesEnabled: false`** → nada criado (`AGENCY_ETA_OFF`); lembretes e portal da agência seguem (L-F06-06).
9. **Flow type sem ocupante (Ingoing/Outgoing)** → nada criado (D10); o pipeline também suprimiria.
10. **Job matinal depois das 09:00** → não envia (claim gasto, log).
11. **DST** → claims por data civil local (`cron_job_runs`) absorvem a hora repetida/pulada; cálculos em instantes; Australia muda às 02:00/03:00, longe das 07:00.
12. **Inspetor que esquece o check-in ou demora a sair** → com partida ≥ agora, a projeção supõe que ele sai agora e empurra a previsão com o relógio (a mesma do app); pode gerar um DELAY falso (1 por parada) (Riscos).
13. **Reordenação manual depois do matinal** → a ordem salva manda (D6); se piorar além do limite, a varredura avisa em até 30 min; se **antecipar** ≥ 30 min do início da faixa matinal, a varredura (ou o próximo `evaluate`) envia **uma** correção `EARLY_CHANGE` com o ON_THE_WAY (L-F06-05). A F06 não cria evento novo para a ordem salva.
13b. **Antecipação depois de um ON_THE_WAY já enviado** → nada (mesmo ID; 1 ON_THE_WAY por parada por dia). Antecipação menor que 30 min → nada.
14. **`LATE_NOTICE` repetido** → vale o último; o DELAY continua limitado a 1 por parada.
15. **Telefone inválido** → o pipeline marca FAILED (`validateSmsRecipient`); conta como enviado.
16. **Reserva de SMS (D15)** → a partir de 80% do teto diário (balde UTC), os avisos de horário saem só por e-mail; os 20% restantes ficam para os obrigatórios. Se o teto inteiro estourar por outros avisos, a linha vira `FAILED BUDGET_EXCEEDED` (comportamento existente) e conta como enviada.
17. **Retry do provedor depois das 09:00** → uma linha MORNING criada antes das 09:00 pode ser entregue alguns minutos depois pelo retry do pipeline; aceito.
18. **Plano aproximado** → envia normalmente, mesmo texto, `approximate: true` no log (D17).
19. **Duas máquinas Fly** → schedule do pg-boss é do cluster; varredura singleton; claims e IDs determinísticos tornam qualquer repetição inofensiva.

### Fora do escopo
- Botão manual "avisar inquilino" (design v3), rastreamento GPS, reagendar pelo aviso, avisos à agência, previsão com trânsito (plano).
- Evento de domínio para ordem salva (a varredura cobre).
- Endpoint para disparar o matinal manualmente; tela de histórico (a aba Notifications do appointment já mostra as linhas).
- Mudar o teto diário de SMS, o pipeline de envio ou o balde por dia UTC do contador (D15).
- Reagendar o ON_THE_WAY para perto da chegada (`startAfter`, L-F06-01 opção 2 não escolhida) e um 4º template "arrival time updated" (L-F06-05 opção 3 não escolhida).
- Bloquear envios por volume diário: o `daily_volume_high` só alerta (L-F06-11).

### Critérios de aceite
- **01.A7:** quando o atraso projetado passa do limite, o próximo inquilino recebe o aviso, **só uma vez**. Prova: E3b/E4b (projeção, TASK-F06-1) + testes 40, 44 (envio a C) + 50–52 (dedupe com corrida e fronteira do dia local).
- **01.A5 (parte inquilino):** o limite configurado (`tenantEtaNotices.delayThresholdMinutes`) governa o disparo: teste 45 (30 → não envia; 20 → envia) e E3b.
- **01.12-B:** teste 11 (faixas exatas às 07:00) e 12–13 (nada depois das 09:00).
- **01.10:** testes 30–33, 36–38 e 43b–43h (DONE e CANT_DO, D16).
- **L-F06-01:** nenhum "a caminho" com chegada a mais de 60 min (testes 33b–33d, 49e).
- **L-F06-02:** inquilino `UNAVAILABLE`, ou `PENDING`/`NO_RESPONSE` com chave, não recebe nenhum `TENANT_ETA_*` (testes 5c, 20b).
- **L-F06-04:** DONE manual da OP não gera "a caminho" (testes 28, 28a, 28c).
- **L-F06-05:** antecipação ≥ 30 min gera 1 correção, inclusive na 1ª parada (testes 49c–49g, 50c).
- **L-F06-06:** agência com a flag desligada não recebe avisos de horário, com os demais avisos ao inquilino intactos (testes 5b, 22).
- **L-F06-11:** `tenantEtaNoticeCounts` no snapshot de métricas e `daily_volume_high` acima de 500 (testes 8, 49b).
- **Reserva de SMS (D15):** testes 10b–10e e 46b.
- Q21: testes 1–3 e 22 (canais e consentimento por canal).

### Dependências
- **TASK-F06-1** mergeada (shared buildado antes).
- F04-2 (`getFreshStopForAppointmentUseCase` no container, STALE em `STATUS_TRANSITION`), F03-2 (`INSPECTOR_FIELD_EVENTS.RECORDED`; `metadata.source 'INSPECTOR_CANT_DO'` e `initiatedByInspectorId` no `STATUS_TRANSITION` do CANT_DO; campo opcional `auditMetadata` do `ExecuteStatusTransitionInput`, usado aqui no finish com `source 'INSPECTOR_FINISH'`, L-F06-04).

### Riscos e armadilhas
- **Custo de SMS:** até 3 SMS + 3 e-mails por inspeção (o `EARLY_CHANGE` usa o mesmo ID do ON_THE_WAY, então não soma); tipicamente 2 SMS (matinal + "a caminho"). Medir na homologação (§7) com o log `notification.sms_dispatched`, as métricas `tenantEtaNoticeCounts`/`smsPartsByTemplate` e a consulta abaixo; em produção, o warn `tenant_eta.daily_volume_high` (L-F06-11). Alavancas sem código: `channelMode 'SMS_ELSE_EMAIL'` e `tenantEtaNoticesEnabled` por agência.
- **Menos "a caminho" (L-F06-01):** em dias com janelas espaçadas, parte das próximas paradas fica sem ON_THE_WAY (`NEXT_TOO_FAR`). Medir a proporção nos logs na homologação; o limite de 60 min é constante (mudar = PR).
- **`etaBandFromAt` no payload (L-F06-05):** chave fora do spec de variáveis; o scrub pós-envio só apaga `SENSITIVE_PAYLOAD_KEYS`, então ela sobrevive. Linhas MORNING criadas antes deste PR não existem (códigos novos).
- **`auditMetadata` no finish (L-F06-04):** depende do campo criado pela F03-2; se a F03-2 mudar o nome, o subscriber deixa de disparar em silêncio. O teste 28c trava o contrato.
- **Teto de SMS por agência:** sem a reserva, uma agência com 50 inspeções/dia gastaria o teto padrão (100) só com avisos de horário e falharia os SMS obrigatórios seguintes. A reserva de 20% (D15) protege os obrigatórios; o efeito colateral é que, em agências grandes, os avisos de horário passam para e-mail no meio da manhã. O contador é por dia **UTC** (vira às 10:00/11:00 de Sydney), herdado do pipeline: a reserva "renasce" no fim da manhã local. Documentado; corrigir o balde está fora do escopo.
- **`>=` do tick:** sem a hora-limite, uma queda até 11:00 mandaria o matinal às 11:00. Testes 12, 13 e 27 travam.
- **Supressão cruzada `_SMS`:** dedupe por código exato + canal; nunca `findLatestByAppointmentAndTemplates`/`templateFamily` (D11).
- **Falso atraso** quando o inspetor esquece o check-in ou o check-in fica preso na fila offline: com partida ≥ agora o projetado anda com o relógio (mais do que na versão com piso `agora − trecho`, removida para o inquilino e o app nunca discordarem). 1 aviso por parada por dia limita o dano; medir na homologação.
- **CANT_DO sem posição do inspetor:** o trecho até a próxima é medido da última executada, não do endereço rejeitado (sem rastreamento); a faixa de 1 hora absorve.
- **Mocks do `CreateNotificationUseCase`:** os testes novos dependem de `created`; a varredura de mocks é da TASK-F06-1.
- **Ordem do STALE vs. avaliação:** resolvida pelo job (roda depois do subscriber da F04) e pela comparação de `planVersion` (passo 2 do fluxo comum).
- **Recálculo com Mapbox na varredura:** a leitura fresca só recalcula quando a impressão digital mudou (check-in, abandono, edições), o que aconteceria no próximo `GET` do inspetor de qualquer jeito; sem custo novo relevante.

### Deploy / rollout / rollback
- **Sem migration.** Jobs novos no pg-boss (`tenant-eta.morning`, `tenant-eta.evaluate`, `tenant-eta.sweep-delays`) e claims em `cron_job_runs` (tabela existente).
- **Piloto por agência (L-F06-06):** antes de ligar o `enabled` global em prod, um AM desmarca "Send arrival-time notices to tenants" nas agências que **não** fazem parte do piloto (a flag nasce ligada); depois da homologação, remarca. Em staging, só agências de teste.
- **Rollout:** deploy em staging com `enabled: false` (default) → um AM liga em "Platform settings" de staging e valida com uma agência de teste (inspeção hoje, plano publicado, telefone/e-mail de teste): matinal no dia seguinte às 07:00 (ou com `morningHour` = hora atual dentro de 5–11), "a caminho" no check-out e num "Can't do this job", atraso com `LATE_NOTICE` de 90 min, reserva com `notificationDailyCapSms` da agência de teste baixo (ex.: 5 → SMS de horário param no 4º); DONE manual pelo web → nenhum "a caminho"; parada da tarde depois de um check-out da manhã → `NEXT_TOO_FAR` no log; reordenar uma parada para 1ª depois das 07:00 → `EARLY_CHANGE`; opt-out manual do telefone de teste → `SKIPPED_OPT_OUT`; flag da agência desligada → nada. Conferir linhas `TENANT_ETA_*` e o log `notification.sms_dispatched`. Depois, deploy em prod e um AM liga em prod (nunca acesso a prod sem pedido explícito).
- **Consulta de custo (homologação):**
  ```sql
  SELECT date_trunc('day', created_at AT TIME ZONE 'Australia/Sydney') AS day, template_code, channel, status, count(*)
  FROM notifications
  WHERE template_code LIKE 'TENANT_ETA_%' AND created_at >= now() - interval '7 days'
  GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3;
  ```
  + soma de `parts` dos logs `notification.sms_dispatched` com `templateCode` `TENANT_ETA_*`.
- **Rollback:** desligar `enabled` (efeito em até 30 s pelo cache do `PlatformSettingsService`; os handlers retornam cedo). Reverter o código é seguro (sem schema); linhas já criadas seguem o pipeline normal.

### Dias · Branch · Verificação
- **Dias:** 5,125 (notificador + dedupe com `created` 0,5 + reserva de SMS 0,25 + matinal com tick e hora-limite 1,0 + avaliação do finish com "próxima parada", semente no plano e reenfileiramento 1,0 + CANT_DO 0,25 + `LATE_NOTICE` 0,25 + varredura 0,5 + integração ponta a ponta, corrida e workers 0,5 + **2026-10-29:** limite de antecedência 0,125 (L-F06-01) + confirmação do inquilino 0,125 (L-F06-02) + filtro do check-out e `auditMetadata` no finish 0,125 (L-F06-04) + `EARLY_CHANGE` com `ITenantEtaNoticeLog` 0,25 (L-F06-05) + flag por agência no notificador 0,125 (L-F06-06) + métricas e volume diário 0,125 (L-F06-11)). Mapeamento no plano: 01.12-B 1,0 = matinal; 01.10 1,0 = avaliação do finish; 01.12 1,5 = notificador 0,5 + `LATE_NOTICE` 0,25 + varredura 0,5 + 0,25 da integração; deltas = reserva 0,25 + CANT_DO 0,25 + 0,25 da matriz de testes (~60 casos).
- **Branch:** `feat/f06-2-tenant-eta-triggers` (worktree a partir de `develop`, depois do merge da F06-1).
- **Verificação:** `pnpm --filter @properfy/shared build`; `pnpm --filter backend exec prisma generate && pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test && pnpm --filter backend test:integration:db`. Conferir `git diff --stat origin/develop... | tail -1` (< 150 arquivos; estimado ~30).

---

## Contratos exportados

Consumidores: **F05** (Dia ao Vivo: deve usar `projectStopEta` para "atraso > limite" e horário previsto ao vivo, para a operação, o inspetor e o inquilino verem o mesmo horário), homologação (§7, custo de SMS).

### 1. Templates (TASK-F06-1)
- Códigos `TENANT_ETA_MORNING`, `TENANT_ETA_ON_THE_WAY`, `TENANT_ETA_DELAY` em `MANDATORY_TEMPLATE_CODES`, cada um com linhas EMAIL e SMS; público `RENTAL_TENANT`; classe `OPERATIONAL`.
- Variáveis novas `etaFrom`/`etaTo` (texto `'h:mm am'`, GSM-7), obrigatórias nos 3; `NotificationPayloadContext.eta?: { from; to }`.

### 2. Configuração `tenantEtaNotices` (TASK-F06-1)
```ts
tenantEtaNotices: {
  schema: z.object({
    enabled: z.boolean(),
    channelMode: z.enum(['BOTH', 'SMS_ELSE_EMAIL']),
    morningHour: z.number().int().min(5).max(11),
    morningCutoffHour: z.number().int().min(6).max(12),
    delayThresholdMinutes: z.number().int().min(5).max(120),
    smsBudgetSharePercent: z.number().int().min(10).max(100),   // D15
  }).refine((v) => v.morningCutoffHour > v.morningHour, {
    path: ['morningCutoffHour'], message: 'Cutoff must be after the morning notice hour',
  }),
  defaults: { enabled: false, channelMode: 'BOTH', morningHour: 7, morningCutoffHour: 9, delayThresholdMinutes: 20, smsBudgetSharePercent: 80 },
  section: 'Tenant arrival notices',   // rótulo de exibição (convenção F03; L-F06-10)
}
```
- Valores de onboarding: hora matinal 07:00 (envio só até 09:00); limite de atraso 20 min; reserva de SMS 80%.
- **Seção web "Tenant arrival notices"** (Platform settings, AM/OP): toggle "Send arrival notices to rental tenants"; select "Channels" ("SMS and email" / "SMS, or email when there is no phone"); select "Morning notice at" (5:00 am–11:00 am); select "Don't send the morning notice after" (6:00 am–12:00 pm); campo "Running-late threshold (minutes after the booked window ends)"; campo "Stop arrival SMS at (% of the agency's daily SMS limit)" com a ajuda "The rest is kept for mandatory notices. Emails keep going."; texto fixo "Estimates are shown as a 1-hour range (±30 minutes), limited to the booked window."; botão "Save". Validação: "Enter a number between 10 and 100".

### 3. Módulo único de previsão (TASK-F06-1, **shared**: `packages/shared/src/route-planning/project-stop-eta.ts`)
```ts
export function projectStopEta(plan: EtaPlanInput, events: EtaRealEvents, now: Date): ProjectedStop[];
export function isProjectedLate(stop: ProjectedStop, thresholdMinutes: number): boolean;
export function etaPlanInputFromDayPlanResponse(plan: DayPlanResponse): EtaPlanInput;
```
- Tipos `EtaPlanInput`, `EtaPlanStop`, `EtaRealEvents`, `ProjectedStop` (Algoritmo §A da TASK-F06-1). Puro, determinístico, sobre o `evaluateSequence` da F04 com **partida ≥ agora** (a regra do `toOptimizerInput`); sem `LATE_NOTICE` reproduz exatamente o app do inspetor e o recálculo de hoje da F04 (teste E12). O piso do `LATE_NOTICE` (D18) é a única regra extra.
- **Regra para consumidores (F05 e futuros):** não reimplementar previsão; qualquer mudança de regra entra nesta função.
- **Nomes e montagem (2026-10-29, L-F06-07):** os nomes finais são `EtaPlanInput`/`EtaPlanStop`/`EtaRealEvents`/`ProjectedStop` (não existe `EtaPlanSnapshot`) e a partida é `max(anchorEnd ?? now, now)` (não `now − travelS`). **Consumidores backend (F05) montam `EtaPlanInput` com `publishedServiceStartAt` lido do banco** (`day_plan_stops.published_service_start_at`), para o piso do `LATE_NOTICE` (D18) ser o mesmo do SMS ao inquilino; `etaPlanInputFromDayPlanResponse` é só para quem tem a resposta HTTP (PWA) e deixa `publishedServiceStartAt = null`. O teste de coerência da F05 usa o fixture A/B/C e os nomes desta seção.

### 4. Domínio do backend (TASK-F06-1, `apps/backend/src/modules/tenant-eta/domain/`)
- `computeEtaBand(startAt, { windowStartAt, windowEndAt }, now): { from: Date; to: Date }`; `formatEtaBand(band, tz): { from: string; to: string }`; `wallTimeHHmm(instant, tz)`.
- `getTenantEtaNotificationId({ kind, appointmentId, scheduledDate, channel }): string` (UUID v5, namespace fixo).
- Porta `ITenantEtaPlanReader`: `loadPlan(dayPlanId): Promise<{ plan: EtaPlanInput; events: EtaRealEvents; stopMeta: Map<string, { rentalTenantConfirmationStatus; keyRequired; requiresRentalTenantConfirmation }> } | null>` (`stopMeta`: L-F06-02), `findPlanByInspectorDate(inspectorId, planDate): Promise<{ dayPlanId; appointmentIds: string[] } | null>`, `listSweepCandidates(now): Promise<Array<{ dayPlanId; inspectorId; planDate }>>`.
- `IInspectorFieldEventRepository.findLatestLateNoticeByAppointmentIds(ids, since)`.
- `CreateNotificationOutput = { notificationId: string; created: boolean }` (`created: false` = o ID determinístico já existia; nenhum job enfileirado).
- `UpsertNotificationTemplateUseCase` recusa template sem as variáveis `required` do spec (`ValidationError` 400 `Missing required variables: …`, `field 'bodyHtml'`; L-F06-09).
- Constantes do shared (`constants/tenant-eta.ts`): `TENANT_ETA_BAND_HALF_WIDTH_MINUTES = 30`, `TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES = 60`, `TENANT_ETA_EARLY_CHANGE_MINUTES = 30`, `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD = 500`.
- `MetricsCollector.addSmsParts(templateCode, parts)` → snapshot `smsPartsByTemplate` (L-F06-11).

### 5. Jobs, eventos e logs (TASK-F06-2)
- Jobs: `tenant-eta.morning` (`'0 * * * *'` Sydney, `runDue` com hora-limite), `tenant-eta.evaluate` (`{ trigger: 'FINISH' | 'CANT_DO' | 'LATE_NOTICE', appointmentId, tenantId, attempt, inspectorId?, occurredAt?, eventId? }`; `occurredAt` = ISO do `event.occurredAt` do envelope, L-F06-04), `tenant-eta.sweep-delays` (`'*/30 * * * *'`, singleton).
- Nenhum evento de domínio novo. Valor novo de `metadata.source` no `STATUS_TRANSITION` `→ DONE` do check-out: `'INSPECTOR_FINISH'` (via `auditMetadata` da F03-2; L-F06-04).
- `trigger` do log `notice_created`: `'MORNING' | 'FINISH' | 'CANT_DO' | 'LATE_NOTICE' | 'SWEEP' | 'EARLY_CHANGE'`. `payloadJson.etaBandFromAt` (ISO UTC) em toda linha `TENANT_ETA_*` (L-F06-05). `payloadJson.serviceStartAt` (ISO UTC), `payloadJson.planVersion` (número) e `payloadJson.approximate` (boolean), da leitura fresca, em toda linha `TENANT_ETA_*` (2026-10-29, L-F04-15): é o único registro da versão do plano que gerou o aviso.
- Métrica `tenantEtaNoticeCounts['{kind}|{channel}']` (L-F06-11).
- Logs: `tenant_eta.notice_created { kind, trigger, appointmentId, tenantId, channel, bandFrom, bandTo, projectedStartAt, lateMinutes, approximate, planVersion }` (sem telefone/e-mail); `tenant_eta.notice_skipped { kind, trigger, appointmentId, reason, channel? }` com `reason ∈ { DISABLED, BEFORE_MORNING_HOUR, AFTER_CUTOFF, AGENCY_SWITCH_OFF, FLOW_TYPE_NO_OCCUPANT, NO_RECIPIENT, SMS_BUDGET_RESERVED, ALREADY_SENT, NO_PLAN, PLAN_STALE, STARTED, WINDOW_PASSED, NEXT_STARTED, NO_NEXT_STOP, INSPECTOR_BUSY, NOT_TODAY, NEXT_DAY, NEXT_TOO_FAR, TENANT_UNAVAILABLE, TENANT_UNCONFIRMED, AGENCY_ETA_OFF }` (os 4 últimos de 2026-10-29: L-F06-01, L-F06-02, L-F06-06); `tenant_eta.sms_budget_reserved { tenantId, count, cap, limit }`; `tenant_eta.morning_completed`, `tenant_eta.morning_skipped_after_cutoff`, `tenant_eta.evaluate_completed`, `tenant_eta.evaluate_gave_up`, `tenant_eta.sweep_completed { …, earlyChanged, smsCreatedToday }`, `tenant_eta.daily_volume_high { smsCreatedToday, threshold }` (warn), `tenant_eta.enqueue_failed`, `tenant_eta.enqueue_skipped { reason: 'NO_INSPECTOR' | 'MANUAL_DONE' }`; genérico `notification.sms_dispatched { notificationId, tenantId, templateCode, parts, encoding, length, truncated }`.

### 6. Opt-out manual (TASK-F06-1; L-F06-03)
- `POST /v1/notifications/consents/opt-out` (AM/OP; `assertTenantScope` igual ao `…/:consentId/override`), corpo `recordConsentOptOutSchema` (shared):
  ```ts
  z.object({
    tenantId: z.string().uuid(),
    recipient: z.string().min(3).max(320),          // e-mail ou telefone; normalizado como no pipeline
    channel: z.enum(['EMAIL', 'SMS']),
    notificationClass: z.enum(['OPERATIONAL']).default('OPERATIONAL'),
    reason: z.string().trim().min(1).max(1000),
  })
  ```
  Resposta 200 `{ data: ConsentRecordOutput }` (mesmo formato do `GET /v1/notifications/consents`). Grava `opted_out true`, `change_source 'operator_override'`, `changed_by_user_id`, `reason`; audit `consent.operator_opted_out`. Idempotente.
- Web (`ConsentLookup`, AM/OP): botão "Record opt-out"; modal "Record opt-out" com campos "Agency", "Recipient (email or mobile)", "Channel" (Email / SMS), "Reason"; ajuda "Use this when a tenant asks to stop receiving these messages. You can undo it with Override."; validação "Reason is required"; sucesso "Opt-out recorded".
- Posição de conformidade registrada: avisos de horário = mensagem factual de serviço, classe `OPERATIONAL`, sem rodapé de opt-out no SMS.

### 7. Flag por agência (TASK-F06-1 cria, TASK-F06-2 lê; L-F06-06)
- `tenantSettingsSchema.tenantEtaNoticesEnabled: z.boolean().default(true)`; `isTenantEtaNoticesEnabled(settings)` (ausente = ligada).
- `TenantFormDrawer`, seção "Notifications" (AM): checkbox "Send arrival-time notices to tenants (morning, on the way, running late)"; ajuda "Turn off if this agency tells its tenants the arrival time itself. Other tenant notifications keep going."; com o switch de inquilino desligado: `disabled` + "Turned off because tenant notifications are off for this agency."

---

## Achados para revisão

**Fechados em 2026-10-28 pelo dev:** teto de SMS (reserva de 20% para os obrigatórios, D15; o balde por dia UTC fica documentado e fora do escopo); "a caminho" no "Não consigo fazer" (D16, §2b da TASK-F06-2); sem avisos com o switch da agência desligado (D10); limite de atraso próprio de 20 min (D19); plano aproximado envia normalmente (D17); base do "Vou atrasar" = horário publicado + N (D18). Revisão: módulo único de previsão no shared com partida ≥ agora (D7; E1b corrigido), semente que está no plano, `CreateNotificationOutput.created`, linhas do `notification-templates.ts` corrigidas.

1. **Faixa do atraso sem recorte superior.** A decisão diz "faixa sempre recortada pela janela", mas um aviso de atraso é de uma previsão depois do fim da janela; recortar o topo mostraria um horário que não vai acontecer (ou uma faixa vazia). Adotado: recorte inferior sempre (janela e "agora"); recorte superior só quando o centro está dentro da janela (vale também para o "a caminho" de uma parada já atrasada). Confirmar.
2. **Nenhum aviso antes da hora matinal (D13).** Escolha desta quebra, não do plano: um "a caminho" ou atraso antes das 07:00 locais não sai. Confirmar.
3. **Sem segunda chance no matinal.** Parada sem plano às 07:00 (atribuída depois das 19:30 e o inspetor não abriu o app; F04 Achado 14) ou com plano STALE no momento do job não recebe o matinal naquele dia (o claim por agência é gasto). Aceito; registrar para a homologação.
4. **Teste 6 da TASK-F06-1 (payload).** A revisão pediu "chave ausente, não `''`". Isso vale para as chaves **não declaradas** no spec (`etaFrom`/`etaTo` em `INSPECTION_NOTICE`, `confirmationLink` nos `TENANT_ETA_*`) e para `allVars` (é o que aciona o guard de obrigatória). Para uma variável **declarada como opcional** e sem valor (ex.: `rentalTenantName` sem contato), o código atual escreve `''` no payload final (`build-notification-payload.service.ts:172`); o teste fixa esse comportamento existente em vez de mudá-lo. Confirmar.
5. **Escape de HTML no SMS** (tarefa separada): até ela entrar, nomes com `'` ou `&` aparecem como entidades HTML nos SMS da F06, como já acontece nos SMS atuais. Sem dependência.

---

## Ajustes necessários em outras tarefas (para reconciliar)

- (encaminhado) `tarefas/F05-tarefas.md` — trocar `EtaPlanSnapshot`/`toEtaPlanSnapshot`/`toEtaRealEvents` pelos nomes da F06 (`EtaPlanInput`, `EtaRealEvents`, `ProjectedStop`), corrigir a regra de partida para `max(anchorEnd ?? now, now)` (hoje cita `max(âncora, now − travelS)`, l. 127), montar o `EtaPlanInput` com `publishedServiceStartAt` lido do banco e alinhar o teste 9c ao fixture A/B/C da F06 (L-F06-07).
- (encaminhado) `tarefas/F03-tarefas.md` — registrar no contrato do `auditMetadata` (D2 da F03) o valor `source: 'INSPECTOR_FINISH'`, passado pelo `FinishInspectionUseCase` na TASK-F06-2, e a constante `TRANSITION_SOURCE_INSPECTOR_FINISH` junto da `'INSPECTOR_CANT_DO'`; opcional: badge "Check-out" no `AuditTimeline` também para `metadata.source === 'INSPECTOR_FINISH'` (L-F06-04).
- (encaminhado) `tarefas/F03-tarefas.md` — a F03 é dona do registro `PLATFORM_SETTINGS_REGISTRY`; documentar a convenção "`section` = rótulo de exibição" (a F06 usa `'Tenant arrival notices'`) para as próximas chaves (L-F06-10).
- (resolvido 2026-10-29) `tarefas/F03-tarefas.md` — D18 consistente com a F03 D23 revisada: referência = `published_service_start_at` da parada publicada, senão início da janela; `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate` é o piso da projeção.
- `README.md` / estimativas do plano — total da F06 de 7,25 para 8,625 dias (F06-1 3,5; F06-2 5,125) (L-F06-01..11).
