# F03 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | F03 · Eventos de campo (contrato 00.7, 00.8, 03.1, 03.2, 03.3, 03.16; critérios **00.A3**, **03.A2**) |
| **Total** | **13,125 dias** (plano: 10,5; ajuste justificado abaixo; revisado em 2026-10-28, em 2026-10-29 com as lacunas L-F03-01..10 e na reconciliação de 2026-10-29 com F01/F02/F06/F07/F08/F09/X00) |
| **Tarefas / PRs** | 4 (backend+shared base → backend eventos → PWA → web), conforme a "Quebra em PRs" do plano |
| **Depende de** | **F02 `PublishSystemInspectorNoticeUseCase` (see F02-tarefas)** — só a TASK-F03-2 (lembrete 03.16). As demais não dependem de F02. |
| **Bloqueia** | F04 (ações no card, `PlatformSetting`), F05 (exceções, "Needs attention"), F07 (índice usa eventos e flags), F09; F08/F10 reusam `PlatformSetting` |
| **Código verificado em** | `origin/develop` @ `042a9674` (snapshot read-only, 2026-10-27) |

**Ajuste de estimativa: 10,5 → 11,0 dias** (revisado em 2026-10-28) **→ 13,0 dias** (revisado em 2026-10-29, lacunas `lacunas/F03-lacunas.md`, todas as recomendações aceitas) **→ 13,125 dias** (reconciliação de 2026-10-29: ponto de extensão `PLATFORM_SETTING_SAVE_HOOKS` no `PUT` de settings, pedido pela F08, L-F08-08, +0,125 na TASK-F03-1; os demais ajustes recebidos são texto, constantes ou asserts, sem custo). O escopo não foi cortado.

Distribuição do plano (10,5) pelas 4 tarefas: B6 0,5 = backend 0,25 + tela 0,25 · 03.1 1,0 = backend 0,75 + PWA 0,25 · 03.2 2,0 = backend 1,5 + PWA 0,5 · 00.7a 1,0 PWA · 00.7b 2,25 = backend 1,5 + PWA 0,5 + web 0,25 · 00.7c 0,75 = backend 0,5 + web 0,25 · 00.8 1,0 = backend 0,5 + PWA 0,5 · 00.A3 1,0 web · 03.16 1,0 backend.

| Tarefa | Plano | Agora | Delta e motivo |
|---|---|---|---|
| TASK-F03-1 (backend+shared base) | 2,5 | 3,125 | **+0,25 máscara de coordenadas no audit-log para CL.** O CL_ADMIN lê `/v1/audit-logs` do próprio tenant com `metadataJson` sem máscara (`list-audit-logs.use-case.ts:75,104,215`), e o `inspection.started` já grava lat/lng do inspetor (`start-inspection.use-case.ts:212`). Vazamento existente que a F03 amplia; alinhado à decisão de privacidade da F01. **+0,25 (2026-10-29):** plausibilidade de 7 dias e `out_of_window = false` com horário implausível (L-F03-06), raio sempre gravado (L-F03-05, só asserts), mensagem do 422 orientando a OP (L-F03-08, só copy) e evento `platform_setting.updated.v1` (L-F03-10). **+0,125 (reconciliação 2026-10-29):** mapa opcional `PLATFORM_SETTING_SAVE_HOOKS` no `UpdatePlatformSettingUseCase`, aplicado depois da validação e antes da escrita/audit (pedido da F08, L-F08-08; D30). |
| TASK-F03-2 (eventos backend) | 3,5 | 4,75 | **+0,25 execução abandonada.** A "rejeição depois do check-in" deixa uma `InspectionExecution` aberta e o `appointment_id` é `@unique`. Sem tratar, a reoferta quebra em 5 leitores: `start` (devolve a execução antiga), `finish` (403), agenda (IN_PROGRESS), worker de travados (alerta) e portal (`PortalInspectionAlreadyStartedError`). O plano só recomendou `abandoned_at`, sem custear isso. O lock `FOR UPDATE` no finish e o CAS de status (deadlock) cabem no 1,5 do 00.7b. **+1,0 (2026-10-29):** portal não reoferta `INSPECTOR_UNABLE` 0,25 (L-F03-01); lembrete com 2 textos, supressão "ocupado" e `dedupeKey` com inspetor 0,25 (L-F03-03); referência e regras do "Vou atrasar" + `estimatedArrivalAt` 0,125 (L-F03-04); bloco condicional no e-mail de rejeição à agência 0,25 (L-F03-07); `lastFieldIssue` no detalhe do inspetor + `inspectorId` no `inspectorIssue` 0,125 (L-F03-09). |
| TASK-F03-3 (PWA) | 2,75 | 3,25 | **+0,25 reestruturação do card.** O `AppointmentCard` é um `<button>` inteiro e o check-out passa por 2 modais que vivem no `ExecutionPage`; é preciso reestruturar o card e extrair `useExecutionActions`. **−0,25 03.2 PWA:** a pré-checagem do BLOCK saiu (o PWA usa o erro do servidor); sobra só o raio do servidor no aviso. Sem folga de QA. **+0,5 (2026-10-29):** falha permanente de START na fila limpa o estado local e o FINISH encadeado 0,375 (L-F03-02); alerta "You reported…" no detalhe 0,125 (L-F03-09). |
| TASK-F03-4 (web) | 1,75 | 2,0 | A página "Platform settings" é a "tela" já custeada no B6 (0,25); o link "View on map" saiu. **+0,25 (2026-10-29):** banner/picker do portal do inquilino para `INSPECTOR_UNABLE` (L-F03-01) e "(current inspector)" no card (L-F03-09). |
| **Total** | **10,5** | **13,125** | **+2,625** = (2026-10-28) +0,25 máscara + 0,25 execução abandonada + 0,25 card − 0,25 pré-checagem removida; (2026-10-29) +2,0 lacunas = F03-1 +0,25 · F03-2 +1,0 · F03-3 +0,5 · F03-4 +0,25; (reconciliação 2026-10-29) +0,125 = F03-1 ganchos de save |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F03-1 | Backend + shared: `PlatformSetting`, precisão e distância no start/finish, geofence (SINALIZAR/BLOQUEAR), flags de execução, máscara de coordenadas no audit-log para CL, evento `platform_setting.updated.v1`, ganchos de save `PLATFORM_SETTING_SAVE_HOOKS` | 3,125 | – |
| TASK-F03-2 | Backend + shared: `InspectorFieldEvent`, "Não consigo fazer" (→ REJECTED via SYS, `INSPECTOR_UNABLE`), "Vou atrasar", alerta OP/AM, `inspectorIssue`, atividade de campo, lembrete de conclusão, portal sem reoferta para `INSPECTOR_UNABLE`, e-mail de rejeição com bloco do inspetor | 4,75 | TASK-F03-1; F02 `PublishSystemInspectorNoticeUseCase` (só o lembrete) |
| TASK-F03-3 | PWA: Check in / Check out no card, folhas "Can't do this job" e "Running late", envio de precisão e horário, raio do geofence vindo do servidor, saída de START offline recusado, alerta "You reported…" | 3,25 | TASK-F03-1, TASK-F03-2 |
| TASK-F03-4 | Web: bloco "Field activity", card "Inspector couldn't complete" (detalhe + modal do mapa), rótulos do `AuditTimeline`, `INSPECTOR_UNABLE` nos rótulos, página "Platform settings", portal do inquilino sem "change time" para `INSPECTOR_UNABLE` | 2,0 | TASK-F03-1, TASK-F03-2 |

## Decisões que valem para as 4 tarefas

Todas são de **2026-10-27** (fonte: `F03-eventos-de-campo.md` e `decisoes.md`), salvo D14–D18, do dev em **2026-10-28**, e D20–D29, do dev em **2026-10-29** (lacunas `L-F03-01..10`, recomendações aceitas), e D30–D31, da reconciliação de **2026-10-29** com as tarefas de F06 e F08 (adendos datados em D2, D10 e D12 vêm da mesma reconciliação). Cada tarefa referencia as que se aplicam.

- **D1 · "Não consigo fazer" libera automaticamente (Q1, DECIDIDA, diferente da recomendação).** Vira `SCHEDULED → REJECTED` pelo `ExecuteStatusTransitionUseCase` com ator **SYS** (`{ ...SYSTEM_ACTOR, tenantId: appointment.tenantId }`), código novo `INSPECTOR_UNABLE` e `reason` = rótulo do motivo + nota. **Os 5 lugares de RBAC de transição não mudam**: `SCHEDULED → REJECTED` já aceita SYS em `appointment-state-machine.ts`. Desde o #1293 o bloco 7c do use case já desvincula o grupo (`serviceGroupId = null`) e libera o inspetor (`inspectorId = null`). A agência recebe o `INSPECTION_REJECTED_AGENCY` que já existe (handler `notify-on-status-transition.handler.ts`), sem perna para o inquilino.
- **D2 · Inspetor como iniciador na auditoria.** A transição continua com `actorType: 'SYSTEM'`. O inspetor aparece como iniciador por: (a) `metadata.initiatedByUserId`, `metadata.initiatedByInspectorId`, `metadata.source = 'INSPECTOR_CANT_DO'` e `metadata.fieldEventId` no audit `appointment.status_transition` (campo opcional novo `auditMetadata` no input do use case, mesclado no `metadata`); (b) um audit próprio `inspector_field_event.cant_do` com `actorType: 'USER'` e `actorId` = userId do inspetor. **Adendo 2026-10-29 (reconciliação, L-F06-04):** `metadata.source` é um vocabulário aberto de origens de transição, com constantes no shared (D31): `'INSPECTOR_CANT_DO'` (F03) e `'INSPECTOR_FINISH'` (passado pelo `FinishInspectionUseCase` na TASK-F06-2, via o mesmo `auditMetadata`). Consumidores leem `metadata.source` pelas constantes, nunca pelo `actorType`.
- **D3 · Alerta do motivo no web, só quando existe.** Card "Inspector couldn't complete" no detalhe e no `AppointmentMapDetailPanel`. Fonte: o **último** `InspectorFieldEvent` `CANT_DO` do appointment. Continua visível depois da reoferta (histórico do último impedimento).
- **D4 · Geofence (Q10, DECIDIDA).** Padrão **FLAG** (SINALIZAR). **BLOCK** é opcional e cai sozinho para FLAG quando: o imóvel não tem coordenadas; a precisão não foi enviada; ou a precisão é maior que o raio. Fora da janela de horário **só sinaliza** para a operação e **nunca** notifica o inquilino. Valores de onboarding: raio **300 m**, modo **FLAG**.
- **D5 · 2 toques (Q11, DECIDIDA).** Check-in = `start`; check-out = `finish` (o DONE já acontece na mesma transação). Sem 3º evento.
- **D6 · Alerta para a OP.** E-mail para todos os OP/AM ativos (padrão `INSPECTION_STUCK_ALERT`, via `findActiveByRoles(['OP','AM'])`) com template de plataforma novo `INSPECTOR_UNABLE_ALERT`. O item em "Needs attention" do Dia ao Vivo é da **F05**, que lê `InspectorFieldEvent`.
- **D7 · Eventos novos exigem conexão (Q2, redação ASSUMIDA).** `CANT_DO` e `LATE_NOTICE` **não** entram na fila offline do PWA. A tolerância offline de `start`/`finish` é mantida.
- **D8 · Campos novos de start/finish são opcionais.** Itens já parados na fila offline (`{latitude, longitude}` apenas) continuam válidos.
- **D9 · `PlatformSetting` sem `tenant_id`.** Configuração de plataforma, cross-tenant (precedentes: `Inspector`, `ServiceRegion` global, `IntegrationSetting`). **Cada spec registra a exceção ao §7.1 do CLAUDE.md.** `InspectorFieldEvent` **tem** `tenant_id` (o do appointment).
- **D10 · Privacidade.** CL_ADMIN/CL_USER veem o bloco de execução e os eventos do próprio tenant **sem** lat/lng cruas do inspetor: só distância, precisão e flags. Isso vale também para o audit-log: audits **novos** não gravam lat/lng do inspetor (só distância, precisão e flags), e a leitura de `/v1/audit-logs` por CL mascara as chaves de coordenada dos audits antigos (TASK-F03-1). **Adendos 2026-10-29 (reconciliação):** (a) os audits de `Inspector` da F01 já seguem esta regra (before/after com `address`, `baseLocated` e `baseGeocodedAt`, nunca `baseLat/baseLng`), então a lista de chaves de `maskCoordinateKeys` **não** ganha chaves novas por causa da F01 (L-F01-10); (b) a diferença de janelas na densidade de check-ins da F09 é mitigada com presets fixos para CL (7/30/90 dias terminando hoje); o risco residual (agregado das faixas 8–30 e 31–90 dias atrás, sem isolar um dia) foi **aceito** pelo dev e não muda esta decisão (L-F09-01).
- **D11 · Telas de dashboard existentes não mudam** (regra do dev). Nenhuma das 4 tarefas toca `DashboardPage`, `AnalyticsPage`, `InspectorWorkloadPage` nem `prisma-dashboard-analytics.repository.ts`.
- **D12 · Lembrete de conclusão (03.16).** Só para o **inspetor**, via **F02 `PublishSystemInspectorNoticeUseCase` (see F02-tarefas)** com `type: 'COMPLETION_REMINDER'` (crítico: push com fallback SMS), **1 vez por appointment e data civil**, garantido pelo `dedupeKey` da F02 (sem coluna nova na F03). O alerta de 6 h para a OP (`notify-stuck.worker.ts`) fica como está, salvo o filtro de execução abandonada (TASK-F03-2). **Adendo 2026-10-29 (reconciliação, L-F02-07, L-F02-01):** título e corpo do `COMPLETION_REMINDER` aparecem na **tela bloqueada**: só código do serviço e endereço do imóvel; nunca nome ou telefone do inquilino, códigos de chave/lockbox, senhas ou a nota de acesso. O `dedupeKey` é estável por appointment, data civil e inspetor (D22). O fallback SMS está sujeito ao teto diário `INSPECTOR_NOTICE_SMS_DAILY_CAP` da F02; a F03 não controla nem contorna o teto (um SMS suprimido pelo teto não é falha da F03).
- **D13 · Execução abandonada.** Quando o "Não consigo fazer" acontece depois do check-in, a execução **é mantida** como registro e recebe `abandoned_at` (recomendação do plano, adotada). Uma execução abandonada é tratada como "não iniciada" por todos os leitores, e um novo `start` (após a reoferta) **reinicia** a mesma linha, com o estado anterior preservado no audit `inspection_execution.restarted` (sem coordenadas).
- **D14 · Nota do "Não consigo fazer" é compartilhada com a agência (dev, 2026-10-28).** A nota aparece para o CL no detalhe e no e-mail de rejeição à agência pelo `{{rejectionReason}}` (o HTML padrão do `INSPECTION_REJECTED_AGENCY` já renderiza `{{#if rejectionReason}}`, `platform-notification-templates.ts:216`, alimentado por `appointment.reason` em `build-notification-payload.service.ts:152`). A folha do PWA mostra a dica "This note is shared with the agency."
- **D15 · BLOCK só no check-in (dev, 2026-10-28).** O check-out nunca bloqueia; só grava `finish_out_of_radius`.
- **D16 · Fila offline e BLOCK (dev, 2026-10-28).** Um check-in feito offline em BLOCK e fora do raio recebe 422 na sincronização, vira FAILED na fila e mostra a mensagem do servidor. Aceito.
- **D17 · Valores de onboarding (dev, 2026-10-28).** Tolerância da janela (15 min) e atraso do lembrete (30 min) são campos da chave `fieldEvents` do `PlatformSetting` e entram na lista de valores de onboarding, junto de raio (300 m) e modo (FLAG). **Limitação conhecida:** um slot cujo fim + atraso passa da meia-noite não recebe lembrete (a regra é "hoje").
- **D18 · Gates e settings (dev, 2026-10-28).** A suíte e2e do PWA está quebrada no repositório inteiro: o gate do PWA é Vitest + checklist de QA manual. O `PUT` de settings é "último vence" (sem controle otimista).
- **D19 · Timestamps de migration.** Os nomes `YYYYMMDDhhmmss_nome` desta lista são **placeholders**. São regenerados no momento da implementação (`prisma migrate dev`), o que garante que a migration da F02 (implementada antes) ordene antes das da F03.
- **D20 · Portal não reoferta `INSPECTOR_UNABLE` (2026-10-29, L-F03-01, opção 1).** Um appointment `REJECTED` com `rejection_reason_code ∈ SYSTEM_ONLY_REJECTION_CODES` (hoje só `INSPECTOR_UNABLE`) **não** pode ser revivido pelo "change time" do portal do inquilino: `get-available-groups` devolve lista vazia, `join-group` recusa com o `PortalAppointmentInactiveError` existente (409 `PORTAL_APPOINTMENT_INACTIVE`) e o portal mostra "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time." A reoferta é só da OP (`REJECTED → AWAITING_INSPECTOR` manual ou adição a grupo). A confirmação do inquilino (`rental_tenant_confirmation_status`) **não** é alterada pela F03 (comportamento atual da reoferta).
- **D21 · Falha permanente de START na fila offline (2026-10-29, L-F03-02).** Um START da fila que falha em definitivo (4xx exceto 401/408/429) limpa o estado local `IN_PROGRESS`, remove o FINISH encadeado do mesmo appointment e devolve o card a "Check in". 422 `GEOFENCE_OUT_OF_RADIUS` não oferece "Retry". 5xx/rede seguem com retry.
- **D22 · Lembrete de conclusão: dois textos, supressão "ocupado" e `dedupeKey` com inspetor (2026-10-29, L-F03-03, opção 1).** Execução em andamento → "Did you finish…"; sem execução → "…was due by {timeSlotEnd}. Check in when you arrive, or tell operations if you can't do it." `dedupeKey = completion-reminder:{appointmentId}:{civilDate}:{inspectorId}` com o prefixo na constante `COMPLETION_REMINDER_DEDUPE_PREFIX` (shared). Não lembra enquanto o inspetor tem **outra** execução em andamento (não abandonada) iniciada depois do fim da janela deste. Audit só quando a F02 devolve `created === true`.
- **D23 · "Vou atrasar": referência na ETA publicada, senão na janela (2026-10-29, L-F03-04; revisada pelo dev em 2026-10-29).** `minutesLate` = atraso estimado em relação à **ETA publicada** da parada (`published_service_start_at` do `DayPlanStop` do plano publicado do inspetor para o appointment, F04) quando existe plano publicado; senão em relação ao **início da janela combinada** (`timeSlotStart`). O servidor calcula `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate` (fuso da agência) e o devolve na resposta (com `referenceAt` e `referenceSource`) e no evento de domínio. A leitura da ETA publicada passa pela porta `IPublishedStopStartReader.find(appointmentId, inspectorId, scheduledDate) → Date | null` (domínio da F03): a F03 registra uma implementação que devolve `null` (a F04 ainda não existe, então vale o início da janela) e a TASK-F04-2 liga o adaptador real. Aceito só com `scheduledDate == hoje` (fuso da agência), `SCHEDULED`, atribuído e **sem** execução em andamento ou finalizada. Depois do fim da janela continua permitido.
- **D24 · `geofence_radius_m` sempre gravado (2026-10-29, L-F03-05).** Todo `start` pós-F03 grava `geofence_radius_m = settings.geofenceRadiusMeters`, inclusive sem coordenadas do imóvel, com fallback e no reinício (D13). `NULL` significa exclusivamente "linha anterior à F03".
- **D25 · Sincronização tardia não penaliza (2026-10-29, L-F03-06, opção 1).** Janela de plausibilidade do `clientOccurredAt` passa a **−7 dias / +5 min**. Quando o cliente mandou um horário **implausível**, `out_of_window = false` e o audit `inspection.started` grava `metadata.windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'` (nunca penalizar sem evidência). Sem `clientOccurredAt` (item antigo da fila) a janela continua avaliada com o horário do servidor.
- **D26 · E-mail de rejeição à agência diz que foi o inspetor (2026-10-29, L-F03-07, opção 1).** Sem template novo: o `INSPECTION_REJECTED_AGENCY` ganha as variáveis opcionais `rejectedByInspector` (e reusa `inspectorName`) e um bloco `{{#if rejectedByInspector}}…{{else}}parágrafo atual{{/if}}`. A nota continua em `{{rejectionReason}}` (D14).
- **D27 · BLOCK sem override por appointment (2026-10-29, L-F03-08, opção 1).** A mensagem do 422 orienta a contatar a OP; a OP corrige as coordenadas do imóvel e o inspetor tenta de novo com a mesma `Idempotency-Key`. **Pré-requisito para ligar BLOCK:** X02 em produção e auditoria de geocodificação dos imóveis.
- **D28 · O inspetor vê o próprio "Não consigo fazer" (2026-10-29, L-F03-09, opção 1).** `lastFieldIssue` no detalhe do inspetor só quando o último `CANT_DO` do appointment é dele; alerta informativo no detalhe do PWA. `inspectorIssue` ganha `inspectorId` para o web mostrar "(current inspector)".
- **D29 · Evento de gravação de setting (2026-10-29, L-F03-10).** `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'`, emitido após o commit do `upsert`, payload `{ key, before, after, actorId, occurredAt }`. A invalidação cross-máquina continua sendo o TTL de 30 s (D18 inalterada).
- **D30 · Ganchos de save de setting (2026-10-29, reconciliação, L-F08-08).** O `UpdatePlatformSettingUseCase` aceita um mapa opcional `PLATFORM_SETTING_SAVE_HOOKS: Partial<Record<PlatformSettingKey, PlatformSettingSaveHook>>` (backend, não shared), com `PlatformSettingSaveHook = (previous, next, now) => value` puro e síncrono, aplicado **depois** da validação do valor e **antes** da escrita e do audit. O valor devolvido pelo hook é o que se grava, o `after` do audit e o `after` do evento D29. A F03 entrega o mapa **vazio**; a TASK-F08-2 registra o hook de `inspectorProgram` (`earlyAccess.enabledAt`). Sem hook, comportamento inalterado. Complementa a D29: reagir a mudança = assinar o evento; derivar campo na gravação = registrar hook; nenhuma feature altera o use case.
- **D31 · Origens de transição como constantes (2026-10-29, reconciliação, L-F06-04).** `TRANSITION_SOURCE_INSPECTOR_CANT_DO = 'INSPECTOR_CANT_DO'` nasce na TASK-F03-2 em `packages/shared/src/constants/transition-sources.ts` (exportado no `index.ts`), usado pelo `ReportCantDoUseCase` e pelo `AuditTimeline`. A TASK-F06-2 acrescenta `TRANSITION_SOURCE_INSPECTOR_FINISH = 'INSPECTOR_FINISH'` no mesmo arquivo. O `AuditTimeline` da TASK-F03-4 já mostra o badge "Check-out" também para `metadata.source === 'INSPECTOR_FINISH'` (compatível para frente; inerte até a F06).

---

## TASK-F03-1 · Backend + shared: `PlatformSetting`, precisão e distância no start/finish, geofence, flags de execução

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1
> - **Desbloqueia:** TASK-F03-2, TASK-F03-3, TASK-F03-4, TASK-F04-2, TASK-F05-1, TASK-F06-1, TASK-F07-1, TASK-F08-1
> - **Pode rodar em paralelo com:** TASK-X01-1, TASK-X02-1, TASK-X03-1, TASK-F00-1
> - **Pista sugerida (time de 6):** A · Backend crítico · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Criar o `PlatformSetting` (B6): tabela, porta de leitura com cache curto, endpoints AM/OP auditados e um registro tipado de chaves no shared, reusável por F04/F05/F07/F08/F10.
- Registrar a seção `fieldEvents` (raio, modo do geofence, tolerância da janela de check-in, minutos do lembrete de conclusão).
- Aceitar `accuracy` e `clientOccurredAt` (opcionais) no `start` e no `finish`; gravar precisão, horário do cliente e a distância **também no finish**.
- Aplicar o geofence no check-in com o raio/modo do `PlatformSetting`, acabando com o 200 m (PWA) × 500 m (backend). Gravar as flags `out_of_radius`, `out_of_window` e `finish_out_of_radius`.
- Servir o raio e o modo ao PWA no detalhe do appointment do inspetor.
- Fechar o vazamento de coordenadas do inspetor no audit-log lido por CL (máscara na leitura) e não gravar coordenadas nos audits novos.

### Contexto no código
- **Modelo:** `InspectionExecution` em `apps/backend/prisma/schema.prisma:1181-1202` (`appointment_id @unique`, `start_latitude/longitude Decimal(10,7)` NOT NULL, `finish_*` nullable, `geolocation_distance_meters Decimal(10,2)?`). Sem precisão, sem `tenant_id`. Última migration: `20260929000000_financial_entry_nullable_initiator`.
- **Rotas:** `apps/backend/src/modules/inspector-execution/interfaces/inspector-execution.routes.ts` — `POST /v1/inspector/appointments/:appointmentId/start` (201, `startInspectionSchema`, `startInspectionResponseSchema`) e `/finish` (200, `finishInspectionSchema`, `finishInspectionResponseSchema`). Ambas exigem `Idempotency-Key` (`IdempotencyKeyMissingError`, 400 `IDEMPOTENCY_KEY_MISSING`).
- **Schemas shared:** `packages/shared/src/schemas/inspection-execution.ts:22-34` (`{latitude, longitude}` apenas); respostas em `packages/shared/src/schemas/responses.ts:909-925`; detalhe do inspetor `inspectorAppointmentDetailResponseSchema` em `responses.ts:492` (objeto `execution` em ~:557).
- **Start:** `application/use-cases/start-inspection.use-case.ts`. Ordem atual: INSP → idempotência (`get(key,'start')`) → appointment SCHEDULED + atribuído (senão 404 `APPOINTMENT_NOT_FOUND`) → T-1 → confirmação do inquilino → trava do dia (`InspectionStartGateService`, `agencyTz` via `ITenantTimezoneLookup`) → distância (passo 5) → execução existente (passo 6: finalizada → 409; em andamento → devolve a existente) → cria → audits `inspection_execution.started`, `inspection.started` e, se distância > 500, `inspection.geolocation_mismatch` → `set(key,'start',output,24)`.
- **Finish:** `finish-inspection.use-case.ts`. Grava `finishedAt` + coords e roda `SCHEDULED → DONE` na mesma transação (`runInTransaction` + `executeInTransaction`). Não calcula distância.
- **Distância:** `domain/geolocation-distance.service.ts` — `haversineDistanceMeters` e `GEOLOCATION_MISMATCH_THRESHOLD_METERS = 500` (linha 26, só auditoria).
- **Repositório:** `infrastructure/prisma-inspection-execution.repository.ts`; porta `domain/inspection-execution.repository.ts` (`update` aceita só `finishedAt/resumedAt/finishLatitude/finishLongitude`). Entidade `domain/inspection-execution.entity.ts`.
- **Detalhe do inspetor:** `application/use-cases/get-appointment-detail.use-case.ts` (tipo de saída com `execution` em ~:135, leitura em ~:221).
- **Padrão de cache TTL:** `apps/backend/src/shared/infrastructure/cached-tenant-timezone.lookup.ts` (Map + `expiresAt`, TTL 60 s, `now` injetável).
- **Audit:** porta em `apps/backend/src/shared/domain/audit.ts` (`AuditLogEntry.tenantId` aceita `null`). **Autorização:** `AuthorizationService.assertRoles` em `shared/domain/authorization.service.ts:32`.
- **Precedente de config de plataforma:** `IntegrationSetting` (`schema.prisma:1546`) — sem `tenant_id`, `updated_by_id String?`.
- **Container/rotas:** `apps/backend/src/main/container.ts`, `apps/backend/src/main/routes.ts`. OpenAPI: `pnpm --filter backend generate:openapi` → `packages/shared/openapi.json`; `pnpm --filter @properfy/shared generate:types` → `packages/shared/src/api-types.ts`.

### Decisões aplicáveis
D4, D5, D8, D9, D10 (2026-10-27); D15, D16, D17, D19 (2026-10-28); D24, D25, D27, D29, D30 (2026-10-29). Onboarding: raio 300 m, modo SINALIZAR, tolerância 15 min, lembrete 30 min.
- **2026-10-29 · L-F03-05 (D24):** `geofence_radius_m` é gravado em **todo** `start` desta tarefa (com ou sem coordenadas do imóvel, com ou sem fallback). `NULL` = linha anterior à F03, e isso vai para o contrato §3 (F05/F07/F09). O `thresholdMeters` do `inspection.geolocation_mismatch` é o mesmo valor.
- **2026-10-29 · L-F03-06 (D25):** `resolveEffectiveEventTime` usa a janela −7 dias / +5 min e devolve também se o horário do cliente foi plausível. Horário do cliente **implausível** → `out_of_window = false` + `metadata.windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'` no `inspection.started`. Sem `clientOccurredAt` → janela avaliada com o servidor (inalterado).
- **2026-10-29 · L-F03-08 (D27):** sem override de BLOCK por appointment nesta fase. A mensagem do 422 passa a ser `You are {distance} m from the property. Check-in is only allowed within {radius} m. If you are at the right address, contact operations.` BLOCK só pode ser ligado depois da X02 em produção e de uma auditoria de geocodificação.
- **2026-10-29 · L-F03-10 (D29):** o `UpdatePlatformSettingUseCase` emite `platform_setting.updated.v1` após o commit (gancho para F07 e F04, sem que essas features alterem o use case da F03).
- **2026-10-29 · reconciliação L-F08-08 (D30):** o `UpdatePlatformSettingUseCase` recebe o mapa opcional `PLATFORM_SETTING_SAVE_HOOKS` (vazio nesta tarefa), aplicado depois da validação e antes do `upsert`/audit/evento. A TASK-F08-2 só registra o hook de `inspectorProgram`.
- **2026-10-29 · reconciliação L-F06-10:** `section` do registro é o **rótulo de exibição** da seção na página "Platform settings" (igual ao título da `FormSection`): `'Field events'` aqui; a F06 usa `'Tenant arrival notices'`. Vale para todas as chaves futuras.
- **2026-10-29 · reconciliação L-F01-10 (D10):** os audits de `Inspector` da F01 não gravam `baseLat/baseLng` (usam `baseLocated` + `baseGeocodedAt`); a lista de chaves de `maskCoordinateKeys` fica como está.
- **2026-10-29 · reconciliação L-X00-04:** este PR apaga as cláusulas de transição das normas N6 e N9 que a X00 grava nos CLAUDE.md (ver Verificação).

### Testes primeiro (TDD)

**Shared (`packages/shared`, Vitest)**
1. `platform-settings.test.ts`
   - `fieldEventsSettingSchema.parse({})` → falha (todos os campos obrigatórios no `value` completo).
   - `PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults` = `{ geofenceRadiusMeters: 300, geofenceMode: 'FLAG', checkInWindowToleranceMinutes: 15, completionReminderMinutesAfterWindowEnd: 30, completionReminderEnabled: true }` e passa no próprio schema.
   - `geofenceRadiusMeters: 49` → erro; `50` e `5000` → ok; `5001` → erro; `300.5` → erro (inteiro).
   - `geofenceMode: 'WARN'` → erro; `'FLAG'`/`'BLOCK'` → ok.
   - `checkInWindowToleranceMinutes: -1` → erro; `0` e `240` ok; `241` erro.
   - `completionReminderMinutesAfterWindowEnd: 0` ok; `720` ok; `721` erro.
   - `resolvePlatformSettingValue('fieldEvents', { geofenceMode: 'BLOCK' })` → defaults mesclados com `geofenceMode: 'BLOCK'`.
   - `resolvePlatformSettingValue('fieldEvents', { geofenceRadiusMeters: 'abc' })` → devolve os **defaults** e `{ valid: false }`.
   - `isPlatformSettingKey('fieldEvents')` → true; `('nope')` → false.
2. `inspection-execution.test.ts` (estender o existente)
   - `startInspectionSchema` aceita `{latitude, longitude}` sem os campos novos (item antigo da fila) → ok, `accuracy` e `clientOccurredAt` `undefined`.
   - aceita `accuracy: 0`, `accuracy: 12.4`, `accuracy: 25000`; recusa `accuracy: -1`, `accuracy: Infinity`, `accuracy: 'x'`.
   - aceita `clientOccurredAt: '2026-11-03T09:41:12.000+11:00'` e `'2026-11-02T22:41:12Z'`; recusa `'2026-11-03 09:41'` e `'yesterday'`.
   - Mesmos casos para `finishInspectionSchema`.
3. `responses.test.ts`
   - `startInspectionResponseSchema` aceita a saída antiga (sem os campos novos) **e** a nova (com `startAccuracyMeters`, `outOfRadius`, `outOfWindow`, `geofence`).
   - `finishInspectionResponseSchema` aceita com e sem `finishGeolocationDistanceMeters`/`finishOutOfRadius`.
   - `inspectorAppointmentDetailResponseSchema` aceita com e sem `geofence` e com `execution` contendo ou não os campos novos.

**Backend unit (`apps/backend`, Vitest)**
4. `domain/geofence.service.test.ts` — `evaluateGeofence({ distanceMeters, accuracyMeters, radiusMeters, mode })`:

   | Entrada | Saída esperada |
   |---|---|
   | `distance 120, acc 10, radius 300, FLAG` | `{ outOfRadius: false, effectiveMode: 'FLAG', fallbackReason: null, blocked: false }` |
   | `distance 640, acc 10, radius 300, FLAG` | `{ outOfRadius: true, effectiveMode: 'FLAG', fallbackReason: null, blocked: false }` |
   | `distance 640, acc 10, radius 300, BLOCK` | `{ outOfRadius: true, effectiveMode: 'BLOCK', fallbackReason: null, blocked: true }` |
   | `distance 290, acc 10, radius 300, BLOCK` | `{ outOfRadius: false, effectiveMode: 'BLOCK', blocked: false }` |
   | `distance 300, acc 10, radius 300, BLOCK` (no limite) | `outOfRadius: false`, `blocked: false` (regra `>`) |
   | `distance null, acc 10, radius 300, BLOCK` | `{ outOfRadius: false, effectiveMode: 'FLAG', fallbackReason: 'NO_PROPERTY_COORDINATES', blocked: false }` |
   | `distance 640, acc null, radius 300, BLOCK` | `{ outOfRadius: true, effectiveMode: 'FLAG', fallbackReason: 'NO_ACCURACY', blocked: false }` |
   | `distance 640, acc 350, radius 300, BLOCK` | `{ outOfRadius: true, effectiveMode: 'FLAG', fallbackReason: 'POOR_ACCURACY', blocked: false }` |
   | `distance 640, acc 300, radius 300, BLOCK` (precisão = raio) | `blocked: true` (só `>` cai) |
5. `domain/check-in-window.service.test.ts` — `isOutOfCheckInWindow({ effectiveAt, scheduledDate, timeSlotStart, timeSlotEnd, toleranceMinutes, timeZone })` (timezone `Australia/Sydney`, fixar `TZ` do processo em outro fuso, conforme `feedback_tz_dependent_test_must_pin_away`):
   - slot 09:00–11:00, tolerância 15, check-in 08:45 local → `false`; 08:44 → `true`; 11:15 → `false`; 11:16 → `true`.
   - mesma hora no dia seguinte ao agendado → `true` (data passada).
   - tolerância 0, 09:00 em ponto → `false`.
   - `effectiveAt` em UTC que cai no dia agendado só no fuso de Sydney → avaliado no fuso da agência.
6. `domain/client-occurred-at.test.ts` — `resolveEffectiveEventTime(clientOccurredAt, serverNow)`:
   - ausente → `serverNow`;
   - `serverNow − 3 h` → o valor do cliente;
   - a função devolve `{ effectiveAt, clientTimePlausible }` (L-F03-06, D25):
   - ausente → `{ effectiveAt: serverNow, clientTimePlausible: null }`;
   - `serverNow − 3 h` → `{ effectiveAt: <cliente>, clientTimePlausible: true }`;
   - `serverNow − 3 dias` (sync de sexta para segunda) → `{ effectiveAt: <cliente>, clientTimePlausible: true }`;
   - `serverNow − 7 dias` exatos → plausível; `serverNow − 7 dias − 1 min` → `{ effectiveAt: serverNow, clientTimePlausible: false }`;
   - `serverNow + 4 min` → o valor do cliente (plausível); `serverNow + 6 min` → `{ effectiveAt: serverNow, clientTimePlausible: false }`.
7. `platform-settings/application/platform-settings.service.test.ts` (relógio injetado):
   - sem linha no banco → `get('fieldEvents')` devolve os defaults, 1 leitura no repo.
   - 2 chamadas dentro de 30 s → 1 leitura; depois de 30 s → 2 leituras.
   - `update('fieldEvents', value, actor)` invalida o cache local: o `get` seguinte lê o banco.
   - valor gravado inválido (schema evoluiu) → devolve defaults e chama `logger.error` com `{ key }` uma vez por recarga.
8. `platform-settings/application/update-platform-setting.use-case.test.ts`:
   - AM e OP → ok; CL_ADMIN, CL_USER, INSP → `ForbiddenError` (`FORBIDDEN`) e nenhuma escrita.
   - chave desconhecida → `PlatformSettingUnknownKeyError` (404 `PLATFORM_SETTING_UNKNOWN_KEY`).
   - `value` inválido → `ValidationError` (400 `VALIDATION_ERROR`) com `details` do Zod.
   - sucesso → `upsert` com `updated_by_id = actor.userId`; audit `platform_setting.updated` com `actorType 'USER'`, `entityType 'PlatformSetting'`, `entityId = key`, `tenantId: null`, `before` = valor efetivo anterior (defaults se não havia linha), `after` = novo valor, `metadata.actor_tenant_id = actor.tenantId`.
   - salvar o mesmo valor → grava e audita mesmo assim (sem diff-skip).
   - sucesso → `eventBus.emit('platform_setting.updated.v1', { key: 'fieldEvents', before, after, actorId: actor.userId, occurredAt })` **uma vez**, depois do `upsert` (L-F03-10); subscriber que lança → o `PUT` devolve 200 mesmo assim (`Promise.allSettled`) e `logger.error` é chamado.
   - falha do `upsert` → **nenhum** evento emitido.
   - **ganchos de save (D30, L-F08-08):** com `saveHooks = { fieldEvents: (prev, next, now) => ({ ...next, geofenceRadiusMeters: 400 }) }` e `PUT` válido com raio 300 → o hook recebe `(valor efetivo anterior, valor validado, now)`; `upsert`, `after` do audit e `after` do evento usam o retorno (raio 400). `value` inválido → hook **não** é chamado (validação antes). Sem entrada para a chave (ou mapa ausente) → comportamento idêntico aos casos acima. Hook que lança → nenhuma escrita, nenhum audit, nenhum evento (erro propagado).
9. `start-inspection.use-case.test.ts` (estender):
   - body sem `accuracy`/`clientOccurredAt` (item antigo da fila) → execução criada com `startAccuracyMeters null`, `startClientAt null`; com FLAG, segue como hoje.
   - FLAG, distância 640, raio 300 → cria, `outOfRadius true`, audit `inspection.geolocation_mismatch` com `metadata.thresholdMeters = 300`, `metadata.phase = 'START'`, `metadata.accuracyMeters`.
   - FLAG, distância 120 → `outOfRadius false`, **sem** audit de mismatch.
   - BLOCK, distância 640, precisão 12 → lança `GeofenceOutOfRadiusError` (422 `GEOFENCE_OUT_OF_RADIUS`), mensagem `You are 640 m from the property. Check-in is only allowed within 300 m. If you are at the right address, contact operations.` (L-F03-08), `details { distanceMeters: 640, radiusMeters: 300, accuracyMeters: 12 }`; **nenhuma** execução salva; **nenhum** `idempotency.set`; audit `inspection.check_in_blocked` gravado com `metadata { distanceMeters: 640, radiusMeters: 300, accuracyMeters: 12 }` e **sem** nenhuma chave de coordenada (`latitude`, `longitude`, `inspectorLatitude`, `inspectorLongitude`).
   - BLOCK, distância 640, precisão 350 → cria (fallback `POOR_ACCURACY`), `outOfRadius true`, `geofence.effectiveMode 'FLAG'`.
   - BLOCK, imóvel sem coordenadas → cria, `geolocationDistanceMeters null`, `outOfRadius false`, `fallbackReason 'NO_PROPERTY_COORDINATES'`, **`geofenceRadiusMeters 300` gravado** (L-F03-05).
   - FLAG, imóvel sem coordenadas → `geofence_radius_m = 300` (nunca `null` depois da F03).
   - BLOCK, sem `accuracy` → cria (fallback `NO_ACCURACY`), `geofence_radius_m = 300`.
   - BLOCK com execução **em andamento** já existente (retry de outro dispositivo, distância agora 900) → devolve a existente, **não** bloqueia (o geofence roda depois da checagem de execução existente).
   - check-in às 08:30 num slot 09:00–11:00 (tolerância 15) → `outOfWindow true`, execução criada, **nenhuma** notificação enfileirada para o inquilino (mock de notificação não chamado).
   - `clientOccurredAt` válido 08:50 com servidor 09:20 (sync offline) → janela avaliada com 08:50 → `outOfWindow false`; `start_client_at` = 08:50; `started_at` = servidor.
   - `clientOccurredAt` = sexta 09:30 (dentro da janela) sincronizado segunda 08:00 → plausível (≤ 7 dias) → `outOfWindow false` (L-F03-06).
   - `clientOccurredAt` 10 dias atrás (implausível) → `outOfWindow false`, `start_client_at` = valor cru do cliente, audit `inspection.started` com `metadata.windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'`.
   - `clientOccurredAt` +10 min no futuro (relógio adiantado) → implausível → `outOfWindow false` + `windowSkipped`.
   - sem `clientOccurredAt` e servidor 08:30 num slot 09:00–11:00 → `outOfWindow true` (item antigo da fila: avaliado com o servidor), sem `windowSkipped`.
   - `geofence_radius_m` gravado = 300 (snapshot do raio aplicado).
   - Resposta inclui `startAccuracyMeters`, `outOfRadius`, `outOfWindow`, `geofence { mode, effectiveMode, radiusMeters, fallbackReason }`.
   - `accuracy` 123456789.5 → gravado limitado a `99999999.99` (cabe em `Decimal(10,2)`).
10. `finish-inspection.use-case.test.ts` (estender):
    - body antigo → finaliza como hoje, `finishAccuracyMeters null`, `finishClientAt null`.
    - imóvel com coordenadas, finish a 80 m → `finishGeolocationDistanceMeters 80`, `finishOutOfRadius false`.
    - finish a 700 m com raio 300 (FLAG **ou** BLOCK) → finaliza (o finish **nunca** bloqueia), `finishOutOfRadius true`, audit `inspection.geolocation_mismatch` com `metadata { phase: 'FINISH', distanceMeters: 700, thresholdMeters: 300, accuracyMeters }` e **sem** coordenadas do inspetor.
    - imóvel sem coordenadas → distância null, flag false.
    - A distância e as flags são gravadas **na mesma transação** do `finishedAt` (falha da transição → nada persiste).
11. `get-appointment-detail.use-case.test.ts` (estender): resposta inclui `geofence { radiusMeters: 300, mode: 'FLAG' }` lido do `PlatformSettingsService`; `execution` inclui `startAccuracyMeters`, `finishAccuracyMeters`, `finishGeolocationDistanceMeters`, `outOfRadius`, `outOfWindow`, `finishOutOfRadius` quando existem.

11b. `audit/application/use-cases/list-audit-logs.use-case.test.ts` (estender) — máscara de coordenadas para CL:
    - CL_ADMIN lendo `inspection.started` com `metadataJson { latitude: -33.86, longitude: 151.2, geolocationDistanceMeters: 120 }` → `metadataJson { latitude: '[MASKED]', longitude: '[MASKED]', geolocationDistanceMeters: 120 }`.
    - CL_ADMIN lendo o `inspection.geolocation_mismatch` legado (`inspectorLatitude`, `inspectorLongitude`, `propertyLatitude`, `propertyLongitude`, `distanceMeters`) → as 4 chaves de coordenada viram `'[MASKED]'`; `distanceMeters` intacto.
    - chaves aninhadas (`metadataJson.position.latitude`) também mascaradas; arrays percorridos.
    - AM e OP → `metadataJson` intacto (mesmo objeto).
    - entrada com `redactionStatus 'FULL'` → intacta (não re-mascarar).
    - `metadataJson` `null`/string → devolvido como veio.
    - teste que **falha sem a máscara**: o mesmo fixture lido por CL_ADMIN não pode conter nenhum número em chave de coordenada.

**Backend integração (Supertest; DB em `tests/integration/db` com testcontainers, em série)**
12. `tests/integration/db/platform-settings.integration.test.ts`:
    - `GET /v1/platform-settings` como AM → 200 com a seção `fieldEvents` em defaults (`isDefault: true`, `updatedAt: null`, `updatedBy: null`).
    - `PUT /v1/platform-settings/fieldEvents` como OP com valor válido → 200; linha em `platform_settings`; linha em `audit_logs` com `action 'platform_setting.updated'`, `tenant_id NULL`.
    - `GET /v1/platform-settings/fieldEvents` depois → valor novo, `isDefault: false`, `updatedBy { id, name }`.
    - `PUT` como CL_ADMIN → 403; como INSP → 403; sem token → 401.
    - `PUT` com `geofenceRadiusMeters: 10` → 400 `VALIDATION_ERROR`; `PUT /v1/platform-settings/unknownKey` → 404 `PLATFORM_SETTING_UNKNOWN_KEY`.
    - subscriber de teste em `platform_setting.updated.v1` recebe `{ key: 'fieldEvents', before, after, actorId }` depois do `PUT` válido; nada no `PUT` inválido (L-F03-10).
13. `tests/integration/db/inspection-geofence.integration.test.ts`:
    - BLOCK configurado; `start` a 900 m com `accuracy 15` → 422 `GEOFENCE_OUT_OF_RADIUS` (mensagem termina com "If you are at the right address, contact operations."), nenhuma linha em `inspection_executions`; repetir com a mesma `Idempotency-Key` depois de mover para 50 m → 201 (o erro não foi cacheado).
    - FLAG; `start` a 900 m → 201, `out_of_radius = true`, `geofence_radius_m = 300`, `start_accuracy_m = 15.00`.
    - `start` com body antigo `{latitude, longitude}` → 201 (compatibilidade da fila offline).
    - imóvel sem coordenadas, FLAG → 201, `geofence_radius_m = 300` (L-F03-05).
    - `start` com `clientOccurredAt` 3 dias atrás e dentro da janela daquele dia → 201, `out_of_window = false` (L-F03-06).
    - `finish` a 700 m → 200, `finish_geolocation_distance_meters` preenchido, `finish_out_of_radius = true`, appointment `DONE`.
    - Response schema não remove os campos novos (assert nas chaves do body).
14. `tests/integration/db/audit-log-coordinate-mask.integration.test.ts`: depois de um `start` real, `GET /v1/audit-logs?entityId=<appointmentId>` como CL_ADMIN do tenant → nenhuma coordenada do inspetor no corpo; como AM → coordenadas presentes no `inspection.started` legado.

### Escopo / Passos
1. **Shared — registro de settings** (`packages/shared/src/schemas/platform-settings.ts`, exportado em `schemas/index.ts`):
   - `GeofenceMode = { FLAG: 'FLAG', BLOCK: 'BLOCK' } as const` (+ type) em `packages/shared/src/enums/field-events.ts` (arquivo criado aqui; a TASK-F03-2 acrescenta os enums de eventos).
   - `fieldEventsSettingSchema`, `PLATFORM_SETTINGS_REGISTRY`, `PlatformSettingKey`, `PlatformSettingValue<K>`, `resolvePlatformSettingValue`, `isPlatformSettingKey`, `updatePlatformSettingSchema`, `platformSettingResponseSchema`, `platformSettingsListResponseSchema` (contratos completos na seção abaixo).
2. **Shared — start/finish:** estender `startInspectionSchema` e `finishInspectionSchema` com `accuracy` e `clientOccurredAt` opcionais; estender `startInspectionResponseSchema`, `finishInspectionResponseSchema` e o `execution`/`geofence` do `inspectorAppointmentDetailResponseSchema` com campos **opcionais**.
3. **Prisma + migration** `<timestamp>_platform_settings_and_execution_geo` (ex.: `20261103090000_…`; **placeholder**, regenerado por `prisma migrate dev` na implementação para ordenar depois das migrations da F02 — D19): tabela `platform_settings` e colunas novas em `inspection_executions` (ver modelo de dados). Aplicar localmente (`prisma migrate dev`) e rodar `prisma generate`.
4. **Módulo `platform-settings`** em `apps/backend/src/modules/platform-settings/`:
   - `domain/platform-setting.repository.ts` (porta `IPlatformSettingRepository { findByKey(key); findAll(); upsert(key, valueJson, updatedById) }`), `domain/platform-settings.errors.ts` (`PlatformSettingUnknownKeyError`).
   - **Porta de leitura compartilhada** em `apps/backend/src/shared/domain/platform-settings.ts`: `IPlatformSettingsReader { get<K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>> }` — fica em `shared/domain` para outros módulos dependerem dela sem importar o módulo (mesmo raciocínio do `AuditService`).
   - `application/platform-settings.service.ts` (`PlatformSettingsService implements IPlatformSettingsReader`, TTL **30 s**, `now` injetável, `invalidate(key)`).
   - `application/use-cases/list-platform-settings.use-case.ts`, `get-platform-setting.use-case.ts`, `update-platform-setting.use-case.ts`.
   - `infrastructure/prisma-platform-setting.repository.ts`.
   - `interfaces/platform-settings.routes.ts` (3 rotas), registradas em `main/routes.ts`; wiring em `main/container.ts`.
   - **Evento (L-F03-10, D29):** `PLATFORM_SETTING_EVENTS = { UPDATED: 'platform_setting.updated.v1' }` em `apps/backend/src/shared/application/events/domain-event-bus.ts`; o `UpdatePlatformSettingUseCase` recebe o bus e emite **após** o `upsert` e o audit, payload `{ key, before, after, actorId, occurredAt }`, com o mesmo `Promise.allSettled` dos outros eventos (falha de subscriber nunca falha o `PUT`). O cache local continua invalidado pelo `invalidate(key)`; outras instâncias seguem pelo TTL de 30 s.
   - **Ganchos de save (D30, L-F08-08):** `application/platform-setting-save-hooks.ts` com `type PlatformSettingSaveHook<K extends PlatformSettingKey> = (previous: PlatformSettingValue<K>, next: PlatformSettingValue<K>, now: Date) => PlatformSettingValue<K>`, `type PlatformSettingSaveHooks = Partial<{ [K in PlatformSettingKey]: PlatformSettingSaveHook<K> }>` e `PLATFORM_SETTING_SAVE_HOOKS: PlatformSettingSaveHooks = {}`. O `UpdatePlatformSettingUseCase` recebe o mapa como parâmetro **opcional** do construtor (default `{}`, sem quebrar wirings de teste) e o aplica depois da validação por chave e antes do `upsert`; o retorno é o valor gravado, auditado e emitido. Wiring em `main/container.ts` com a constante.
   - **Convenção `section` (L-F06-10):** docblock em `PLATFORM_SETTINGS_REGISTRY`: "`section` is the display label of the settings section (same text as the web `FormSection` title)".
5. **Domínio inspector-execution:**
   - `domain/geofence.service.ts` — `evaluateGeofence(...)` (pura).
   - `domain/check-in-window.service.ts` — `isOutOfCheckInWindow(...)` (pura; usa os helpers de `shared/domain/timezone-date.ts`).
   - `domain/client-occurred-at.ts` — `resolveEffectiveEventTime(clientOccurredAt, serverNow)` (pura; janela de plausibilidade **−7 dias / +5 min**, L-F03-06) → `{ effectiveAt: Date; clientTimePlausible: boolean | null }` (`null` quando o cliente não mandou horário).
   - `domain/geolocation-distance.service.ts` — **remover** `GEOLOCATION_MISMATCH_THRESHOLD_METERS` (o limiar passa a ser o raio do setting). Ajustar os testes que importam a constante.
   - `domain/inspection-execution.errors.ts` — `GeofenceOutOfRadiusError` (422 `GEOFENCE_OUT_OF_RADIUS`), mensagem com a frase final "If you are at the right address, contact operations." (L-F03-08).
   - Entidade, porta e repositório: campos novos; `update` aceita `finishAccuracyMeters`, `finishClientAt`, `finishGeolocationDistanceMeters`, `finishOutOfRadius`.
6. **`StartInspectionUseCase`** (nova dependência `IPlatformSettingsReader`, obrigatória no construtor; atualizar **todos** os wirings de teste não tipados — ver `project_adding_usecase_dep_breaks_untyped_test_wirings`). Nova ordem:
   1. INSP → 2. idempotência → 3. appointment SCHEDULED + atribuído → 4. T-1 → 4b. confirmação → 4c. trava do dia →
   5. **execução existente** (finalizada → 409; em andamento → devolve a existente, mapeada com os campos novos) →
   6. distância (se o imóvel tem coordenadas) → 7. `settings = get('fieldEvents')` → 8. `evaluateGeofence` → se `blocked`: audit `inspection.check_in_blocked` (só `distanceMeters`, `radiusMeters`, `accuracyMeters`; sem coordenadas) e lança `GeofenceOutOfRadiusError` (sem gravar nada, sem cachear idempotência) →
   9. `{ effectiveAt, clientTimePlausible } = resolveEffectiveEventTime(clientOccurredAt, now)`; se `clientTimePlausible === false` → `outOfWindow = false` e `windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'` (L-F03-06); senão `outOfWindow = isOutOfCheckInWindow({ effectiveAt, ... })` com `agencyTz` →
   10. cria a execução com os campos novos; `geofence_radius_m = settings.geofenceRadiusMeters` **sempre** (com ou sem coordenadas do imóvel, com ou sem fallback; L-F03-05) → 11. audits (os atuais + `metadata` acrescido de `accuracyMeters`, `clientOccurredAt`, `outOfRadius`, `outOfWindow`, `geofenceMode`, `geofenceEffectiveMode`, `radiusMeters`); `inspection.geolocation_mismatch` agora quando `outOfRadius`, com `thresholdMeters = radius` e `phase 'START'`; `inspection.started` ganha `windowSkipped` quando aplicável → 12. `set` idempotência.
   - **A TASK-F03-2 acrescenta** o reinício de execução abandonada no passo 5. Esta tarefa não lê `abandoned_at` (a coluna nasce na TASK-F03-2).
7. **`FinishInspectionUseCase`** (nova dependência `IPlatformSettingsReader` + leitura das coordenadas do imóvel, já disponíveis em `appointmentRepo.findById(...).propertyLatitude/propertyLongitude`): calcular `finishGeolocationDistanceMeters` e `finishOutOfRadius = distance > radius`; gravar com `finishAccuracyMeters` e `finishClientAt` **dentro** do `runInTransaction`. Audit `inspection.finished` com `metadata` acrescido de `accuracyMeters`, `distanceMeters`, `outOfRadius`. Se `finishOutOfRadius`, audit `inspection.geolocation_mismatch` com `phase 'FINISH'`, `distanceMeters`, `thresholdMeters`, `accuracyMeters` e **sem** coordenadas do inspetor. O finish nunca bloqueia (D15). O lock `FOR UPDATE` e o CAS de status do finish entram na TASK-F03-2 (junto do `cant-do`, que introduz o lock).
8. **`GetAppointmentDetailUseCase` (inspetor):** acrescentar `geofence: { radiusMeters, mode }` e os campos novos no `execution`.
9. **Rotas start/finish:** repassar `accuracy` e `clientOccurredAt` ao use case (o `...parsed.data` já espalha; tipar os inputs).
10. **OpenAPI + api-types:** `pnpm --filter backend generate:openapi` e `pnpm --filter @properfy/shared generate:types`; commitar `openapi.json` e `api-types.ts`.
11. **Máscara de coordenadas no audit-log (D10):** em `apps/backend/src/modules/audit/application/use-cases/list-audit-logs.use-case.ts`, para `actor.role === 'CL_ADMIN'` (único papel CL com acesso, `:75`), aplicar `maskCoordinateKeys(entry.metadataJson)` antes de montar a resposta (`:215`, hoje `metadataJson: entry.metadataJson` sem máscara; `before/after` já viram `'[MASKED]'` para CL em `applyReadMask`). Helper puro `apps/backend/src/modules/audit/domain/mask-coordinate-keys.ts`: percorre objetos e arrays e troca por `'[MASKED]'` o valor das chaves `latitude`, `longitude`, `inspectorLatitude`, `inspectorLongitude`, `startLatitude`, `startLongitude`, `finishLatitude`, `finishLongitude`, `propertyLatitude`, `propertyLongitude`. Não respeita entradas `FULL` (já redigidas). AM/OP inalterados. Os audits **legados** (`inspection.started`, `inspection.finished`, `inspection.geolocation_mismatch` START, `inspection_execution.*`) continuam gravando coordenadas para AM/OP; os **novos** desta feature não gravam. Os audits de `Inspector` da F01 (`inspector.created`/`updated`/`base_geocoded`) já gravam só `baseLocated`/`baseGeocodedAt`, sem `baseLat/baseLng`: nenhuma chave nova na lista (L-F01-10).
12. Build do shared antes dos consumidores (`pnpm --filter @properfy/shared build`).

### Modelo de dados / Contratos / UI

**Prisma — novo modelo**
```prisma
/// Platform-wide configuration (F03 B6). Deliberately has NO tenant_id: it
/// configures cross-tenant behaviour (inspectors are cross-tenant). Exception to
/// CLAUDE.md §7.1, same precedent as IntegrationSetting / global ServiceRegion.
model PlatformSetting {
  id            String   @id @default(uuid())
  key           String   @unique @db.VarChar(100)
  value_json    Json
  updated_by_id String?
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  updated_by User? @relation("PlatformSettingUpdatedBy", fields: [updated_by_id], references: [id], onDelete: SetNull)

  @@map("platform_settings")
}
```
- `User` ganha o lado inverso `platform_settings_updated PlatformSetting[] @relation("PlatformSettingUpdatedBy")`.
- Nenhuma linha é semeada: a ausência significa "defaults" (o registro no shared é a fonte dos defaults). Isso deixa o deploy sem passo de dados.

**Prisma — colunas novas em `InspectionExecution`** (todas nullable/default, expand-only)

| Coluna | Tipo | Nulo | Default | Uso |
|---|---|---|---|---|
| `start_accuracy_m` | `Decimal @db.Decimal(10, 2)` | sim | – | precisão do GPS no check-in (m) |
| `finish_accuracy_m` | `Decimal @db.Decimal(10, 2)` | sim | – | precisão no check-out |
| `start_client_at` | `DateTime` | sim | – | horário do dispositivo no check-in (`clientOccurredAt`) |
| `finish_client_at` | `DateTime` | sim | – | horário do dispositivo no check-out |
| `finish_geolocation_distance_meters` | `Decimal @db.Decimal(10, 2)` | sim | – | distância do check-out ao imóvel |
| `out_of_radius` | `Boolean` | não | `false` | check-in fora do raio |
| `out_of_window` | `Boolean` | não | `false` | check-in fora da janela ± tolerância |
| `finish_out_of_radius` | `Boolean` | não | `false` | check-out fora do raio |
| `geofence_radius_m` | `Int` | sim | – | snapshot do raio vigente no check-in; **gravado em todo `start` pós-F03** (inclusive sem coordenadas do imóvel e com fallback); `NULL` = linha anterior à F03 (L-F03-05) |

Índices novos: `@@index([out_of_radius, started_at])` e `@@index([out_of_window, started_at])` (consultas de exceção da F05/F07). Precisão e distância seguem o tipo da coluna existente `geolocation_distance_meters` (`Decimal(10,2)`); coordenadas continuam `Decimal(10,7)`.

**Shared — registro de settings**
```ts
export const fieldEventsSettingSchema = z.object({
  geofenceRadiusMeters: z.number().int().min(50).max(5000),
  geofenceMode: z.nativeEnum(GeofenceMode),
  checkInWindowToleranceMinutes: z.number().int().min(0).max(240),
  completionReminderEnabled: z.boolean(),
  completionReminderMinutesAfterWindowEnd: z.number().int().min(0).max(720),
});

export const PLATFORM_SETTINGS_REGISTRY = {
  fieldEvents: {
    schema: fieldEventsSettingSchema,
    defaults: {
      geofenceRadiusMeters: 300,
      geofenceMode: 'FLAG',
      checkInWindowToleranceMinutes: 15,
      completionReminderEnabled: true,
      completionReminderMinutesAfterWindowEnd: 30,
    },
    section: 'Field events',
  },
} as const satisfies Record<string, { schema: z.ZodTypeAny; defaults: unknown; section: string }>;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTINGS_REGISTRY;
export type PlatformSettingValue<K extends PlatformSettingKey> = z.infer<(typeof PLATFORM_SETTINGS_REGISTRY)[K]['schema']>;
export function isPlatformSettingKey(key: string): key is PlatformSettingKey;
/** Merges stored JSON over the defaults and parses; on failure returns the defaults with valid=false. */
export function resolvePlatformSettingValue<K extends PlatformSettingKey>(key: K, stored: unknown): { value: PlatformSettingValue<K>; valid: boolean };

export const updatePlatformSettingSchema = z.object({ value: z.record(z.unknown()) }); // validated per key in the use case
export const platformSettingResponseSchema = z.object({
  key: z.string(),
  section: z.string(),
  value: z.record(z.unknown()),
  defaults: z.record(z.unknown()),
  isDefault: z.boolean(),
  updatedAt: instantStrNullable(),
  updatedBy: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
});
export const platformSettingsListResponseSchema = z.object({ settings: z.array(platformSettingResponseSchema) });
```
- Regra de evolução para outras features: **acrescentar uma chave nova** ao registro (uma por feature/seção). Nunca reaproveitar `fieldEvents` para campos de outra feature. Campo novo dentro de uma chave existente precisa de default (o merge com os defaults cobre linhas antigas).

**Endpoints `PlatformSetting`**

| Método e rota | Request | Response | Erros | RBAC | Idempotency-Key |
|---|---|---|---|---|---|
| `GET /v1/platform-settings` | – | 200 `success({ settings: PlatformSettingResponse[] })`, uma entrada por chave do registro, ordenada por `section` | 401 `UNAUTHORIZED`; 403 `FORBIDDEN` "You do not have permission to view platform settings" | AM, OP | não |
| `GET /v1/platform-settings/:key` | params `key` (`z.string().max(100)`) | 200 `success(PlatformSettingResponse)` | 401; 403; 404 `PLATFORM_SETTING_UNKNOWN_KEY` "Unknown platform setting" | AM, OP | não |
| `PUT /v1/platform-settings/:key` | `{ value: <objeto completo da chave> }` | 200 `success(PlatformSettingResponse)` | 400 `VALIDATION_ERROR` "Platform setting value is invalid" (`details` = issues do Zod); 401; 403 "You do not have permission to change platform settings"; 404 `PLATFORM_SETTING_UNKNOWN_KEY` | AM, OP | não (PUT é idempotente por natureza) |

- CL_ADMIN, CL_USER, INSP e TNT → 403 em todas. A leitura **interna** (use cases) não passa por RBAC: é a porta `IPlatformSettingsReader`.
- Audit `platform_setting.updated`: `{ actorType: 'USER', actorId, entityType: 'PlatformSetting', entityId: key, tenantId: null, before, after, metadata: { actor_tenant_id } }`.
- Cache: por instância, TTL 30 s. Com N instâncias, uma mudança leva até 30 s para valer em todas (documentar na tela: "Changes apply within a minute.").

**Start/finish — request (shared)**
```ts
const clientGeoExtras = {
  accuracy: z.number().nonnegative().finite().optional(),      // meters, from GeolocationCoordinates.accuracy
  clientOccurredAt: z.string().datetime({ offset: true }).optional(), // device time of the tap
};
startInspectionSchema = z.object({ latitude, longitude, ...clientGeoExtras });
finishInspectionSchema = z.object({ latitude, longitude, ...clientGeoExtras });
```

**Start — response (campos novos, todos `.optional()` no schema)**
- `startAccuracyMeters: number | null`, `outOfRadius: boolean`, `outOfWindow: boolean`,
- `geofence: { mode: 'FLAG' | 'BLOCK'; effectiveMode: 'FLAG' | 'BLOCK'; radiusMeters: number; fallbackReason: 'NO_PROPERTY_COORDINATES' | 'NO_ACCURACY' | 'POOR_ACCURACY' | null }`.
- O retorno idempotente de uma execução **em andamento** devolve `geofence` com o raio **gravado** (`geofence_radius_m`) e `effectiveMode` = modo atual.

**Start — erro novo:** 422 `GEOFENCE_OUT_OF_RADIUS`, mensagem `You are {distance} m from the property. Check-in is only allowed within {radius} m. If you are at the right address, contact operations.` (L-F03-08), `details { distanceMeters, radiusMeters, accuracyMeters }`. RBAC e demais erros inalterados (403 `FORBIDDEN`/`INSPECTOR_NOT_LINKED`, 404 `APPOINTMENT_NOT_FOUND`, 403 `EXECUTION_T1_BLOCKED`, 422 `EXECUTION_TIME_WINDOW_EXCEEDED`, 409 `EXECUTION_ALREADY_FINISHED`, 400 `IDEMPOTENCY_KEY_MISSING`).

**Finish — response (campos novos opcionais):** `finishGeolocationDistanceMeters: number | null`, `finishOutOfRadius: boolean`.

**Detalhe do inspetor (`GET /v1/inspector/appointments/:appointmentId`)** — acrescentar (opcionais):
- `geofence: { radiusMeters: number; mode: 'FLAG' | 'BLOCK' }`;
- em `execution`: `startAccuracyMeters`, `finishAccuracyMeters`, `finishGeolocationDistanceMeters` (todos `number | null`), `outOfRadius`, `outOfWindow`, `finishOutOfRadius` (`boolean`).

**Audits (novos ou alterados)**
| Ação | Entidade | Quando | Metadata |
|---|---|---|---|
| `platform_setting.updated` | `PlatformSetting` | PUT com sucesso | before/after, `actor_tenant_id` (+ evento de domínio `platform_setting.updated.v1`, L-F03-10) |
| `inspection.check_in_blocked` (novo) | `Appointment` | BLOCK recusou o check-in | `distanceMeters`, `radiusMeters`, `accuracyMeters` (**sem** coordenadas) |
| `inspection.geolocation_mismatch` (alterado) | `Appointment` | `outOfRadius` no start **ou** `finishOutOfRadius` no finish | `phase: 'START' \| 'FINISH'`, `distanceMeters`, `thresholdMeters` (= raio), `accuracyMeters`. START mantém as chaves legadas de coordenada (mascaradas para CL na leitura); FINISH **não** grava coordenadas |
| `inspection.started` / `inspection_execution.started` (alterados) | – | start | + `accuracyMeters`, `clientOccurredAt`, `outOfRadius`, `outOfWindow`, `geofenceMode`, `geofenceEffectiveMode`, `radiusMeters`, `windowSkipped` (`'IMPLAUSIBLE_CLIENT_TIME'` ou ausente, L-F03-06) |
| `inspection.finished` / `inspection_execution.finished` (alterados) | – | finish | + `accuracyMeters`, `clientOccurredAt`, `distanceMeters`, `outOfRadius` |

**Evento de domínio novo (L-F03-10):** `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'`, payload `{ key: PlatformSettingKey; before: unknown; after: unknown; actorId: string; occurredAt: string }`, emitido após o commit do `PUT`.

**Leitura do audit-log (alterada):** `GET /v1/audit-logs` para CL_ADMIN devolve `metadataJson` com as chaves de coordenada como `'[MASKED]'`. Sem mudança de contrato (o campo já é `unknown`).

**UI:** nenhuma nesta tarefa.

### Casos de borda
- **Item antigo na fila offline** (`{latitude, longitude}`): aceito; precisão/horário nulos; BLOCK cai para FLAG (`NO_ACCURACY`). A janela usa o horário do servidor.
- **Item novo na fila offline sincronizado horas ou dias depois (L-F03-06):** `clientOccurredAt` dentro de −7 dias / +5 min define a janela. Fora disso o horário é implausível: `out_of_window = false` e `windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'` no audit (nunca penaliza sem evidência). `started_at` continua sendo o horário do servidor (comportamento atual preservado).
- **Relógio do aparelho adiantado > 5 min:** implausível → `out_of_window = false` + `windowSkipped`.
- **Duplo toque / retry com a mesma `Idempotency-Key`:** a segunda chamada devolve o cache. Um 422 de geofence **não** é cacheado, então o inspetor pode tentar de novo mais perto com a mesma chave.
- **Retry com outra chave enquanto a execução está em andamento:** devolve a execução existente, sem reavaliar o geofence.
- **Appointment não SCHEDULED ou não atribuído ao inspetor:** 404 `APPOINTMENT_NOT_FOUND` (inalterado, evita enumeração).
- **Imóvel sem coordenadas:** distância null, flags false, BLOCK cai para FLAG; `geofence_radius_m` gravado mesmo assim (L-F03-05).
- **Imóvel geocodificado no lugar errado com BLOCK (L-F03-08):** o inspetor recebe o 422 com "If you are at the right address, contact operations."; a OP investiga pelo audit `inspection.check_in_blocked` e pelo log `warn`, corrige as coordenadas do imóvel (edição de property existente) e o inspetor tenta de novo com a mesma `Idempotency-Key` (o 422 não é cacheado). Sem override por appointment nesta fase.
- **Precisão ruim** (ex.: 350 m com raio 300): BLOCK cai para FLAG; a flag `out_of_radius` ainda é gravada se a distância passar do raio.
- **Precisão absurda** (> 99.999.999,99 m): limitada para caber na coluna; nunca 400 (um 400 envenenaria um item da fila para sempre).
- **Setting gravado inválido:** leitura devolve os defaults e loga erro; o check-in nunca quebra por config.
- **Check-in num dia posterior ao agendado** (permitido pela trava do dia): `out_of_window = true`.
- **Mudança de raio entre start e finish:** o finish usa o raio **atual**; o snapshot `geofence_radius_m` explica a flag do start.
- **Fora da janela:** nunca dispara notificação ao inquilino (nenhum código de notificação é chamado no start).
- **Rejeição depois do check-in:** tratada na TASK-F03-2.
- **Check-in offline em BLOCK fora do raio (D16, D21):** 422 na sincronização; o item vira FAILED (na 1ª resposta, sem retry) e o PWA mostra a mensagem do servidor, limpa o estado local e volta o card a "Check in" (TASK-F03-3).
- **CL lendo audits antigos com coordenadas:** mascarados na leitura.

### Fora do escopo
- Eventos `CANT_DO`/`LATE_NOTICE`, `INSPECTOR_UNABLE`, alerta OP, lembrete (TASK-F03-2).
- Qualquer UI (TASK-F03-3 e TASK-F03-4).
- BLOCK no check-out.
- `tenant_id` em `InspectionExecution` (o plano registra a ausência; não é pedido).
- Exibir as flags em dashboards existentes (D11) ou na exceção do Dia ao Vivo (F05).

### Critérios de aceite
- **03.A2 (backend):** com FLAG, um check-in fora do raio grava `out_of_radius = true` e o audit `inspection.geolocation_mismatch` (consumido pela exceção da F05). Com BLOCK, é recusado com 422 `GEOFENCE_OUT_OF_RADIUS` e a mensagem clara acima. A queda automática para FLAG é provada para "sem coordenadas", "sem precisão" e "precisão > raio" (testes 4 e 9).
- **00.A3 (parcial):** check-in e check-out gravam data/hora do servidor, horário do cliente, precisão, distância e inspetor.
- `GET/PUT /v1/platform-settings` funcionam para AM/OP, são auditados, emitem `platform_setting.updated.v1` e recusam os outros papéis; um hook registrado em `PLATFORM_SETTING_SAVE_HOOKS` define o valor gravado/auditado/emitido, e sem hook nada muda (teste 8, D30).
- Todo check-in pós-F03 tem `geofence_radius_m` preenchido (testes 9 e 13).
- Check-in pontual sincronizado até 7 dias depois não fica `out_of_window`; horário implausível nunca gera `out_of_window = true` (testes 6, 9 e 13).
- Itens antigos da fila offline continuam sendo aceitos (teste 13).
- CL_ADMIN não recebe nenhuma coordenada do inspetor em `/v1/audit-logs` (testes 11b e 14).

### Dependências
- Nenhuma de outra tarefa. Primeira do trem.

### Riscos e armadilhas
- **Response schema remove campo não declarado:** declarar todos os campos novos nos schemas de resposta (start, finish, detalhe do inspetor, settings). Sem isso o PWA nunca vê `outOfRadius`.
- **fastify-type-provider-zod lança no serialize** se a saída não bater com o schema: os campos novos precisam ser `optional()` para as respostas antigas guardadas no cache de idempotência (TTL 24 h) continuarem válidas no deploy.
- **Dependência nova no construtor** quebra wirings de teste não tipados (`start`/`finish`/`get-appointment-detail`). Fazer `grep -rn "new StartInspectionUseCase\|new FinishInspectionUseCase\|new GetAppointmentDetailUseCase" apps/backend` e ajustar todos.
- **Testes que importam `GEOLOCATION_MISMATCH_THRESHOLD_METERS`** quebram ao remover a constante; ajustar.
- **Testes de janela dependem de fuso:** fixar `TZ` fora de Sydney.
- **`$queryRaw` com Decimal/Int:** não usar raw aqui; Prisma tipado.
- **Migração:** só expand (colunas nullable/default). Timestamp placeholder, regenerado na implementação (D19). Rodar o drift check e não deixar o Prisma dropar índices `Unsupported()` (`project_prisma_drift_drops_unsupported_indexes`).

### Deploy / rollout / rollback
- **Ordem:** migration (expand) → backend. Sem passo de dados (defaults no código).
- **Compatibilidade:** PWA atual continua funcionando (campos opcionais; FLAG por padrão = comportamento atual mais flags).
- **Rollout:** deploy com FLAG. Ligar BLOCK só depois de: TASK-F03-3 em produção (o PWA atual não envia precisão, então BLOCK cairia para FLAG mesmo assim), **X02 (geocodificação permanente) em produção e uma auditoria de geocodificação dos imóveis ativos** (L-F03-08, D27). Registrar na spec que não há override por appointment.
- **Rollback:** reverter o deploy do backend; as colunas novas ficam (inofensivas). `platform_settings` pode ficar. Se for preciso desligar o BLOCK sem deploy: `PUT /v1/platform-settings/fieldEvents` com `geofenceMode: 'FLAG'` (vale em ≤ 30 s).
- **Observabilidade:** log `info` em `PUT` de setting (`{ key, actorId }`); log `warn` em check-in bloqueado (`{ appointmentId, distanceMeters, radiusMeters }`); log `error` para setting inválido e para subscriber de `platform_setting.updated.v1` que falhou; log `info` quando a janela é pulada por horário implausível (`{ appointmentId, clientOccurredAt }`).

### Dias · Branch · Verificação
- **3,125 dias** (B6 backend 0,25 · 03.1 backend 0,75 · 03.2 backend 1,5 · máscara de coordenadas no audit-log 0,25 · lacunas 2026-10-29 0,25: plausibilidade 7 dias + `windowSkipped` (L-F03-06), evento `platform_setting.updated.v1` (L-F03-10); L-F03-05 e L-F03-08 sem custo além de asserts e copy · reconciliação 2026-10-29 0,125: `PLATFORM_SETTING_SAVE_HOOKS` (L-F08-08); convenção `section`, nota da F01 e cláusulas da X00 sem custo).
- Branch: `feat/f03-platform-settings-geofence` a partir de `develop` (worktree).
- Verificação: `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test`; `pnpm --filter backend test:integration:db -- platform-settings inspection-geofence audit-log-coordinate-mask`; `pnpm --filter web typecheck && pnpm --filter pwa typecheck` (api-types regenerados); `git diff --stat origin/develop... | tail -1` ≤ 150 arquivos.
- Checklist de documentação (X00, L-X00-04):
  - [ ] Remove the transition clause of rule N6 from `apps/backend/CLAUDE.md` §7.1 ("It is created by F03 (TASK-F03-1) and reused by F04–F10.") and from `packages/shared/CLAUDE.md` §10.10 ("(added by F03)") in this PR (X00 L-04).
  - [ ] Remove the transition clause of rule N9 from `CLAUDE.md` §7.9 ("Known gap until F03 (TASK-F03-1) merges: …"), keeping only "add a test that fails if a `CL_*` response carries a coordinate key", in this PR (X00 L-04).

---

## TASK-F03-2 · Backend + shared: eventos de campo, "Não consigo fazer", "Vou atrasar", alerta OP/AM, `inspectorIssue`, atividade de campo, lembrete de conclusão

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F03-1
> - **Dependência parcial:** TASK-F02-1: só para o lembrete de conclusão (COMPLETION_REMINDER). Dá para codar o resto antes; o lembrete entra quando a F02-1 estiver mergeada.
> - **Desbloqueia:** TASK-F03-3, TASK-F03-4, TASK-F04-1, TASK-F04-2, TASK-F05-1, TASK-F06-1, TASK-F07-1, TASK-F09-1
> - **Pode rodar em paralelo com:** TASK-X02-1, TASK-X02-2, TASK-F01-1, TASK-F01-2, TASK-F01-3, TASK-F02-1
> - **Pista sugerida (time de 6):** A + A2 · Backend crítico **em par** · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Criar `InspectorFieldEvent` (tipos `CANT_DO`, `LATE_NOTICE`) com `tenant_id` do appointment.
- **"Não consigo fazer":** numa transação, gravar o evento e executar `SCHEDULED → REJECTED` como **SYS** com `INSPECTOR_UNABLE`, deixando os efeitos existentes (desvincular grupo, liberar inspetor, e-mail à agência) rodarem sozinhos; depois, alertar OP/AM por e-mail (`INSPECTOR_UNABLE_ALERT`).
- Tratar a **rejeição depois do check-in** (`abandoned_at`) e todos os leitores de execução.
- **"Vou atrasar":** gravar `LATE_NOTICE` com motivo e minutos.
- Expor `inspectorIssue` no detalhe e na lista de appointments (sem N+1) e um endpoint de **atividade de campo** (execução + eventos) com recorte de privacidade para CL.
- **Lembrete de conclusão (03.16)** ao inspetor via F02, 1 vez por appointment e data.
- Acrescentar `INSPECTOR_UNABLE` em todos os lugares do backend/shared que listam ou validam códigos de rejeição.

### Contexto no código
- **Transição:** `apps/backend/src/modules/appointment/application/use-cases/execute-status-transition.use-case.ts`.
  - `executeInTransaction(input, tx)` devolve `{ output, runAfterCommit }` (padrão usado por `FinishInspectionUseCase`).
  - SYS: `isSystemActor` → audit com `actorType 'SYSTEM'` e **sem** `actorId` (~:483). `findById(appointmentId, actor.tenantId, tx)`: o ator SYS precisa do `tenantId` do appointment.
  - Bloco 3a-bis (~:191): `EXPIRED` é só do sistema (`CANCELLATION_REASON_CODE_SYSTEM_ONLY`). Modelo para `INSPECTOR_UNABLE`.
  - Bloco 7c (~:330): REJECTED/CANCELLED zera `serviceGroupId` e `inspectorId` (#1293). O audit guarda `unlinkedServiceGroupId`/`releasedInspectorId`.
  - 9f: `onTransitionHandler` → e-mail `INSPECTION_REJECTED_AGENCY` (`notify-on-status-transition.handler.ts:207-252`, sem perna do inquilino).
  - 9g: emite `APPOINTMENT_EVENTS.STATUS_TRANSITION` com o `serviceGroupId` anterior (subscriber de limpeza de grupo vazio).
- **Ator do sistema:** `apps/backend/src/shared/domain/constants.ts` (`SYSTEM_ACTOR`, `SYSTEM_USER_ID = 'SYSTEM'`). Precedente: `report-unavailability.use-case.ts:198-205` (`{ ...SYSTEM_ACTOR, tenantId: appointment.tenantId }`, `rejectionReasonCode: 'TENANT_DECLINED'`).
- **Códigos:** `packages/shared/src/enums/reason-codes.ts` (`RejectionReasonCode`, 8 códigos); teste `reason-codes.test.ts` ("has exactly 8 codes"); `statusTransitionSchema.rejectionReasonCode = z.nativeEnum(RejectionReasonCode)` em `packages/shared/src/schemas/appointment.ts:190` (entra no `openapi.json`/`api-types.ts`); humanizador `packages/shared/src/utils/reason-code-label.ts` (`formatReasonCodeLabel`, derivado do enum) e seu teste que itera o enum.
- **Rótulos que consomem códigos no backend:** `export-appointments.use-case.ts:187,213` (coluna "Cancellation Reason" = `cancellationReasonCode ?? rejectionReasonCode` humanizado). A coluna do banco `rejection_reason_code` é `VarChar(50)` (`schema.prisma:573`): **sem migration** para o código novo.
- **Leitores de `InspectionExecution` afetados por `abandoned_at`:** `start-inspection.use-case.ts` (passo 6), `finish-inspection.use-case.ts` (passo 3), `get-inspector-schedule.use-case.ts:324-326` (`executionStatus`), `get-appointment-detail.use-case.ts:221`, `prisma-inspection-execution.repository.ts:85` (`findStuckExecutions`), `rental-tenant-portal/.../report-unavailability.use-case.ts:121-127` (`PortalInspectionAlreadyStartedError`). `perform-cross-check.use-case.ts:102` e `reopen-execution.use-case.ts:42` exigem execução finalizada (abandonada nunca é finalizada → sem mudança). `prisma-dashboard-analytics.repository.ts:156` filtra `finished_at not null` (abandonada fica de fora; dashboard intocado).
- **Worker de travados:** `infrastructure/workers/notify-stuck.worker.ts` (padrão do alerta OP/AM: `findActiveByRoles(['OP','AM'])`, `createNotificationUseCase.execute({ tenantId, appointmentId, recipient, channel: 'EMAIL', templateCode, payloadJson })` com `Promise.allSettled`, payload tipado por `*_PAYLOAD_KEYS`). Job `inspection-execution.notify-not-started` em `apps/backend/src/main/workers.ts:260` (cron `0 * * * *`, `SYDNEY_TZ`).
- **Registro de template de plataforma (8 lugares, `project_notification_template_registration` sem o `seed.ts`):** `packages/shared/src/constants/notification-templates.ts` — `PLATFORM_ONLY_TEMPLATE_CODES` (~:62), `SYSTEM_TEMPLATE_CODES` (~:120), `PLATFORM_TEMPLATE_CODE_LABELS`/labels (~:175), `TEMPLATE_TARGETS` (~:266, único cobrado pelo compilador), classificação (~:343), `TEMPLATE_VARIABLES` (~:551); backend `modules/notification/domain/platform-notification-templates.ts` (entry com `notificationClass: 'TRANSACTIONAL'` explícito, `bodyHtml` via `renderSystemEmailHtml`, ver `STUCK_ALERT_HTML` ~:313); `tests/unit/notification/platform-notification-templates.test.ts` (`APPOINTMENT_EMAIL_CODES`/asserts de variáveis). **Não** entra em `apps/backend/prisma/seed.ts`: códigos de plataforma TRANSACTIONAL são semeados por `syncPlatformTemplates` no boot (`apps/backend/src/main/server.ts:134`), e o comentário de `seed.ts:6-11` proíbe acrescentá-los na lista inline. Total: **8 lugares** (6 no shared, 1 no catálogo de plataforma do backend, 1 teste).
- **Idempotência:** `apps/backend/src/shared/domain/idempotency.service.ts` (`getWithHash`, `set(key, scope, response, ttl, payloadHash, tx)`); hash em `shared/domain/idempotency-payload-hash.ts`. `IdempotencyKey.key` é `@unique` global.
- **Eventos de domínio:** `apps/backend/src/shared/application/events/domain-event-bus.ts` (`APPOINTMENT_EVENTS`, sufixo `.v1`).
- **Lista/detalhe de appointments:** `prisma-appointment.repository.ts` (`appointmentDetailInclude()` ~:149, `findAll` ~:269 com `include`), `get-appointment.use-case.ts` (`mapToOutput` ~:115), `list-appointments.use-case.ts`, `appointmentResponseSchema` em `packages/shared/src/schemas/responses.ts:316`.
- **Lock de linha:** precedente `tx.$queryRaw\`SELECT id FROM service_groups WHERE id = ${id} FOR UPDATE\`` (`prisma-service-group.repository.ts:1385`).

### Decisões aplicáveis
D1, D2, D3, D6, D7, D9, D10, D12, D13 (2026-10-27); D14, D17, D19 (2026-10-28); D20, D22, D23, D24, D26, D28, D31 (2026-10-29).
- **2026-10-29 · reconciliação L-F06-04 (D2, D31):** o `ReportCantDoUseCase` monta `auditMetadata.source` com `TRANSITION_SOURCE_INSPECTOR_CANT_DO` (shared), não com literal. O `auditMetadata` fica genérico (`Record<string, unknown>`) para a TASK-F06-2 passar `{ source: TRANSITION_SOURCE_INSPECTOR_FINISH }` no finish sem mudar o use case de transição.
- **2026-10-29 · reconciliação L-F02-07, L-F02-01 (D12):** corpo do lembrete sem dado sensível (tela bloqueada) e SMS sujeito ao teto diário da F02; asserts no teste 16.
- **2026-10-29 · reconciliação L-F07-01, L-F07-04:** a F07 (TASK-F07-1) acrescenta depois `INSPECTOR_NO_SHOW` e `NOT_EXECUTED` (total 11 com o `INSPECTOR_UNABLE` daqui) e `allowedRejectionCodesFrom(fromStatus)`. Esta tarefa continua com 9 códigos; a guarda `REJECTION_REASON_CODE_SYSTEM_ONLY` e `SYSTEM_ONLY_REJECTION_CODES` não mudam e convivem com a guarda por origem da F07 (que respeita `SYSTEM_ONLY_REJECTION_CODES`). Nenhum teste desta tarefa pode depender de a lista de códigos ser fechada além do "exactly 9" do teste 1, que a F07 atualiza.
- **2026-10-29 · L-F03-01 (D20):** o portal do inquilino não reoferta um `REJECTED` com código em `SYSTEM_ONLY_REJECTION_CODES`. Regra centralizada em `rental-tenant-portal/domain/portal-statuses.ts` (`isPortalChangeTimeBlocked({ status, rejectionReasonCode })`), usada por `join-group` (os 3 pontos que hoje chamam `isPortalDeadStatus`), `get-available-groups` e `get-portal-data` (`appointment.canChangeTime`). A confirmação do inquilino não é alterada pela F03.
- **2026-10-29 · L-F03-03 (D22):** lembrete com dois textos (em andamento / não iniciado), `dedupeKey` com `inspectorId` e prefixo `COMPLETION_REMINDER_DEDUPE_PREFIX` no shared, supressão "ocupado", audit só com `created === true` (com `noticeId`), resumo com `skippedBusy`.
- **2026-10-29 · L-F03-04 (D23, revisada pelo dev em 2026-10-29):** `minutesLate` é relativo à `published_service_start_at` da parada quando há plano publicado, senão ao início da janela; `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate` calculado no servidor; só no dia (fuso da agência); recusado depois do check-in.
- **2026-10-29 · L-F03-05 (D24):** o reinício de execução abandonada grava o raio **atual** em `geofence_radius_m`.
- **2026-10-29 · L-F03-07 (D26):** `INSPECTION_REJECTED_AGENCY` ganha o bloco condicional `rejectedByInspector`; o `inspectorName` vem do último `CANT_DO` (o inspetor já foi liberado no appointment quando o payload é montado).
- **2026-10-29 · L-F03-09 (D28):** `lastFieldIssue` no detalhe do inspetor (só quando o último `CANT_DO` é do próprio ator) e `inspectorId` no `inspectorIssue`.

### Testes primeiro (TDD)

**Shared**
1. `enums/reason-codes.test.ts`: `RejectionReasonCode.INSPECTOR_UNABLE === 'INSPECTOR_UNABLE'`; "has exactly **9** codes" (a TASK-F07-1 sobe para 11 com `INSPECTOR_NO_SHOW` e `NOT_EXECUTED`; L-F07-01/04); `SYSTEM_ONLY_REJECTION_CODES` contém só `INSPECTOR_UNABLE`.
1b. `constants/transition-sources.test.ts` (D31): `TRANSITION_SOURCE_INSPECTOR_CANT_DO === 'INSPECTOR_CANT_DO'`, exportado pelo índice do shared.
2. `utils/reason-code-label.test.ts`: `formatReasonCodeLabel('INSPECTOR_UNABLE')` → `'Inspector Unable'` (o teste que itera o enum continua verde).
3. `enums/field-events.test.ts`:
   - `InspectorFieldEventType` = `CANT_DO`, `LATE_NOTICE` (exatamente 2).
   - `FieldIssueReason` = `NO_ANSWER`, `KEY_FAILED`, `TENANT_REFUSED`, `UNSAFE`, `SITE_ISSUE`, `CANT_ATTEND` (exatamente 6); `FIELD_ISSUE_REASON_LABELS` tem rótulo para cada um.
   - `LateNoticeReason` = `TRAFFIC`, `PREVIOUS_JOB_OVERRAN`, `PERSONAL`, `OTHER` (exatamente 4); `LATE_NOTICE_REASON_LABELS` completo.
   - `FIELD_ISSUE_NOTE_REQUIRED_REASONS` = `['SITE_ISSUE']`.
4. `schemas/field-events.test.ts`:
   - `cantDoRequestSchema`: `{reason:'NO_ANSWER'}` ok; `{reason:'SITE_ISSUE'}` → erro em `note` ("Add a short note for this reason"); `{reason:'SITE_ISSUE', note:'   '}` → erro (trim); `{reason:'SITE_ISSUE', note:'Gate locked'}` ok; `note` com 501 chars → erro; `reason:'LATE'` → erro; com `latitude/longitude/accuracy/clientOccurredAt` válidos ok; `latitude` sem `longitude` → erro ("Latitude and longitude must be sent together").
   - `lateNoticeRequestSchema`: `{reason:'TRAFFIC', minutesLate: 20}` ok; `minutesLate: 4` erro; `241` erro; `20.5` erro; `reason:'NO_ANSWER'` erro; um campo `note` enviado é **removido** (o schema não tem nota).
   - `inspectorIssueSchema` aceita `{ reason:'NO_ANSWER', note:null, inspectorId:'<uuid>', inspectorName:'Jane Doe', occurredAt:'2026-11-03T09:41:12.000Z' }` e `inspectorName: null`; aceita também sem `inspectorId` (resposta antiga em cache) (L-F03-09).
   - `lateNoticeResponseSchema` exige `estimatedArrivalAt` (instante ISO) (L-F03-04).
   - `inspectorLastFieldIssueSchema` aceita `{ reason:'KEY_FAILED', note:'Lockbox code wrong', occurredAt }` e `inspectorAppointmentDetailResponseSchema` aceita com e sem `lastFieldIssue` (e `null`) (L-F03-09).
   - `portalDataResponseSchema` aceita `appointment.canChangeTime` ausente (payload antigo) e `true`/`false` (L-F03-01).
   - `COMPLETION_REMINDER_DEDUPE_PREFIX === 'completion-reminder'` e `buildCompletionReminderDedupeKey({ appointmentId:'a1', civilDate:'2026-11-03', inspectorId:'i1' })` → `'completion-reminder:a1:2026-11-03:i1'` (L-F03-03).
   - `appointmentResponseSchema` aceita com e sem `inspectorIssue` (e `null`).
   - `appointmentFieldActivityResponseSchema`: aceita a forma completa (AM/OP) e a recortada (CL: `latitude`/`longitude` ausentes).

**Backend unit**
5. `execute-status-transition.use-case.test.ts` (estender):
   - ator OP com `rejectionReasonCode: 'INSPECTOR_UNABLE'` → `ForbiddenError` `REJECTION_REASON_CODE_SYSTEM_ONLY` "The INSPECTOR_UNABLE rejection reason is assigned by the system only"; nada gravado.
   - ator SYS com `INSPECTOR_UNABLE` → ok.
   - `auditMetadata: { initiatedByUserId:'u1', initiatedByInspectorId:'i1', source:'INSPECTOR_CANT_DO', fieldEventId:'e1' }` → aparece mesclado em `metadata` do audit `appointment.status_transition`, junto de `unlinkedServiceGroupId`/`releasedInspectorId`; `actorType` continua `'SYSTEM'` e `actorId` `undefined`. Também aparece em `metadata` do evento `STATUS_TRANSITION`.
   - sem `auditMetadata` → audit idêntico ao atual (regressão).
   - ator USER (INSP) com `auditMetadata: { source: 'INSPECTOR_FINISH' }` em `→ DONE` → `metadata.source === 'INSPECTOR_FINISH'` no audit e no evento `STATUS_TRANSITION` (prova de que o campo é genérico e serve à TASK-F06-2; L-F06-04).
6. `report-cant-do.use-case.test.ts` (novo, repositórios em memória/mocks; transação simulada):
   - **feliz, sem check-in:** appointment SCHEDULED atribuído a `i1`, em grupo `g1` → grava evento `CANT_DO` (`tenant_id` do appointment, `reason_code 'NO_ANSWER'`); chama `executeInTransaction` com `{ targetStatus:'REJECTED', rejectionReasonCode:'INSPECTOR_UNABLE', reason:'No answer at the door', actor: { role:'SYS', userId:'SYSTEM', tenantId:<tenant>, inspectorId:null, branchId:null }, auditMetadata:{...} }` e o mesmo `tx`; `runAfterCommit` diferido; resposta `{ eventId, appointmentId, appointmentStatus:'REJECTED', occurredAt, executionAbandoned:false }`.
   - `reason` com nota: `'Problem at the property — Gate locked, no access code'`.
   - **depois do check-in:** execução em andamento → `abandoned_at` gravado no mesmo `tx`; `executionAbandoned: true`; audit `inspection_execution.abandoned`.
   - **execução já finalizada** (corrida com o finish) → 409 `EXECUTION_ALREADY_FINISHED`; nada gravado.
   - **appointment de outro inspetor** → 404 `APPOINTMENT_NOT_FOUND`.
   - **appointment inexistente** → 404.
   - **já reportado (duplo toque, chave diferente):** appointment REJECTED, `inspectorId null`, último `CANT_DO` do appointment feito por `i1` → 409 `CANT_DO_ALREADY_REPORTED` "You already reported this job. It is no longer on your route."
   - **AWAITING_INSPECTOR/DONE/CANCELLED atribuído ao inspetor** → 409 `FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED` "This job is not scheduled for you any more."
   - **mesma chave repetida** → devolve o cache, sem segunda escrita; mesma chave com payload diferente → 409 `FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH`.
   - **mesma chave concorrente:** a segunda espera o lock e, ao reler a idempotência dentro do `tx`, devolve o cache (teste com 2 chamadas paralelas no repositório fake que serializa o lock).
   - **não-INSP** (OP, CL_ADMIN) → 403 `FORBIDDEN`; INSP sem `inspectorId` → 403 `INSPECTOR_NOT_LINKED`.
   - **falha na transição** (state machine recusa) → rollback: nenhum evento, nenhum `abandoned_at`, idempotência não gravada.
   - **after-commit:** audit `inspector_field_event.cant_do` (`actorType 'USER'`, `actorId` userId do inspetor, `entityType 'Appointment'`, `metadata { fieldEventId, reason, hasNote, afterCheckIn, executionId }` — **sem** o texto da nota); 1 `createNotificationUseCase.execute` por OP/AM ativo com `templateCode 'INSPECTOR_UNABLE_ALERT'` e `payloadJson` com exatamente as chaves de `INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS`; falha de um destinatário → `logger.error`, resposta continua 200; zero OP/AM → `logger.error` "No active OP/AM users to receive inspector unable alerts"; evento `INSPECTOR_FIELD_EVENTS.RECORDED` emitido com `{ eventId, type:'CANT_DO', appointmentId, tenantId, inspectorId, reason, occurredAt }`.
7. `report-late-notice.use-case.test.ts` (novo):
   - SCHEDULED atribuído, data = hoje (fuso da agência), slot 09:00–11:00, aviso às 09:30 (Sydney) com `minutesLate 20` → grava `LATE_NOTICE` (`reason_code 'TRAFFIC'`, `minutes 20`), 201 `{ eventId, appointmentId, occurredAt, reason, minutesLate: 20, estimatedArrivalAt: '<hoje>T09:20:00+11:00' em UTC }` (sem plano publicado → referência = início da janela, `referenceSource 'WINDOW_START'`, L-F03-04/D23); audit `inspector_field_event.late_notice` com `estimatedArrivalAt`; evento de domínio emitido com `estimatedArrivalAt`. **Nenhuma** transição, **nenhuma** notificação.
   - aviso às 11:20 (depois do fim da janela) com `minutesLate 20` → ok, `estimatedArrivalAt = 11:40` (`max(windowStartAt, effectiveNoticeAt) + 20`).
   - **plano publicado (D23 revisada, 2026-10-29):** `IPublishedStopStartReader` fake devolve `published_service_start_at` 10:15 (slot 09:00–11:00), aviso às 09:30 com `minutesLate 20` → `estimatedArrivalAt = 10:35`, `referenceAt = 10:15`, `referenceSource 'PUBLISHED_PLAN'`; aviso às 10:30 com `minutesLate 20` → `estimatedArrivalAt = 10:50` (`max(10:15, 10:30) + 20`); reader devolve `null` → `referenceSource 'WINDOW_START'`, `estimatedArrivalAt = 09:20`.
   - `computeEstimatedArrivalAt(reference, effectiveNoticeAt, minutesLate)` (função pura): `(10:15, 09:30, 20)` → 10:35; `(09:00, 09:30, 20)` → 09:50; `(10:15, 10:30, 20)` → 10:50.
   - `clientOccurredAt` 09:10 com servidor 09:40 → `effectiveNoticeAt = 09:10` (via `resolveEffectiveEventTime`) → `estimatedArrivalAt = 09:20`.
   - data passada (ontem) ainda SCHEDULED → 422 `LATE_NOTICE_NOT_ALLOWED` "You can only send a running-late notice on the day of the job." (era "ok" antes de L-F03-04).
   - data futura → 422 `LATE_NOTICE_NOT_ALLOWED` "You can only send a running-late notice on the day of the job."
   - execução **em andamento** (não abandonada) → 422 `LATE_NOTICE_NOT_ALLOWED` "You've already checked in to this job."
   - execução abandonada (reoferta, ainda não reiniciada) → ok.
   - execução finalizada → 422 `LATE_NOTICE_NOT_ALLOWED` "This job is already finished."
   - não atribuído / não SCHEDULED → 404 `APPOINTMENT_NOT_FOUND`.
   - segundo aviso (outra chave) → grava outro evento (permitido; o mais recente vale para F05/F06).
   - mesma chave → cache.
8. `start-inspection.use-case.test.ts` (estender, D13):
   - execução existente com `abandoned_at` e appointment SCHEDULED para o inspetor `i2` → **reinicia** a mesma linha (`inspector_id = i2`, `started_at = now`, coords/precisão/flags novas, `finished_at/resumed_at/finish_* = null`, `abandoned_at = null`, `geofence_radius_m` atual); audit `inspection_execution.restarted` com `before`/`after` contendo só `inspectorId`, `startedAt`, `finishedAt`, `abandonedAt`, distâncias, precisões e flags — **sem** nenhuma coordenada; resposta com o mesmo `executionId`.
   - execução abandonada + BLOCK fora do raio → 422 e **não** reinicia.
   - reinício com o raio alterado de 300 para 250 entre o check-in abandonado e o novo → `geofence_radius_m = 250` gravado (L-F03-05).
9. `finish-inspection.use-case.test.ts`: execução abandonada → 404 `EXECUTION_NOT_STARTED`.
10. `get-inspector-schedule.use-case.test.ts`: execução abandonada → `executionStatus 'NOT_STARTED'`.
11. `get-appointment-detail.use-case.test.ts` (inspetor): execução abandonada → `execution: null`.
    - `lastFieldIssue` (L-F03-09): último `CANT_DO` do appointment feito por `i1` e ator `i1` (reofertado e reaceito) → `{ reason:'KEY_FAILED', note:'Lockbox code wrong', occurredAt }`; último `CANT_DO` feito por `i0` e ator `i1` → `null`; sem `CANT_DO` → `null`; dois `CANT_DO` (`i1` antigo, `i0` mais recente) e ator `i1` → `null` (só o último conta).
12. `prisma-inspection-execution.repository` / worker: `findStuckExecutions` ignora `abandoned_at IS NOT NULL` (teste no worker com repo fake + teste DB no item 19).
13. `report-unavailability.use-case.test.ts`: execução abandonada → **não** lança `PortalInspectionAlreadyStartedError`; execução em andamento normal → continua lançando.
13b. Portal e `INSPECTOR_UNABLE` (L-F03-01, D20):
    - `portal-statuses.test.ts`: `isPortalChangeTimeBlocked({ status:'REJECTED', rejectionReasonCode:'INSPECTOR_UNABLE' })` → `true`; `({ status:'REJECTED', rejectionReasonCode:'TENANT_DECLINED' })` → `false`; `({ status:'REJECTED', rejectionReasonCode:null })` → `false`; `({ status:'SCHEDULED', rejectionReasonCode:'INSPECTOR_UNABLE' })` (código antigo de uma rejeição anterior já reofertada) → `false`; `DONE`/`CANCELLED`/`DRAFT` → `true` (dead).
    - `get-available-groups.use-case.test.ts`: appointment REJECTED + `INSPECTOR_UNABLE` → `{ groups: [] }` e `findPortalEligibleSlots` **não** é chamado; REJECTED + `TENANT_DECLINED` → grupos como hoje (regressão).
    - `join-group.use-case.test.ts`: REJECTED + `INSPECTOR_UNABLE` → 409 `PORTAL_APPOINTMENT_INACTIVE` "Appointment is no longer active", nenhuma transição, nenhuma reserva; REJECTED + `TENANT_DECLINED` → hop `REJECTED → AWAITING_INSPECTOR → SCHEDULED` como hoje; corrida (OP muda para REJECTED/`INSPECTOR_UNABLE` entre a leitura e o lock) → a releitura dentro do `tx` (pontos `:228`/`:286`) também recusa.
    - `get-portal-data.use-case.test.ts`: REJECTED + `INSPECTOR_UNABLE` → `appointment.canChangeTime: false`; REJECTED + `TENANT_DECLINED` → `true`; SCHEDULED → `true`; `rental_tenant_confirmation_status` devolvido sem alteração.
14. `get-appointment.use-case.test.ts` / `list-appointments.use-case.test.ts`: `inspectorIssue` mapeado do último `CANT_DO` (`reason`, `note`, `inspectorId` e `inspectorName` do inspetor **do evento**, `occurredAt`); sem evento → `null`; dois `CANT_DO` (reofertado e rejeitado de novo) → o mais recente.
14b. E-mail de rejeição à agência (L-F03-07, D26):
    - `build-notification-payload.service.test.ts`: transição REJECTED com `rejectionReasonCode 'INSPECTOR_UNABLE'` → payload com `rejectedByInspector: true` e `inspectorName` = nome do inspetor do último `CANT_DO` (o appointment já está com `inspectorId null`); `TENANT_DECLINED` → `rejectedByInspector` ausente/`false`, `inspectorName` como hoje.
    - `platform-notification-templates.test.ts`: renderizar o `INSPECTION_REJECTED_AGENCY` com `{ rejectedByInspector: true, inspectorName: 'Jane Doe', rejectionReason: "Key didn't work — Lockbox code wrong", ... }` → contém "The inspector (Jane Doe) reported from the property that they couldn't complete this inspection." e "you don't need to do anything unless we contact you", e **não** contém "Where the tenant told us when they are available"; sem `rejectedByInspector` → texto atual intacto (regressão); `TEMPLATE_VARIABLES.INSPECTION_REJECTED_AGENCY.optional` inclui `rejectedByInspector`.
15. `get-appointment-field-activity.use-case.test.ts` (novo):
    - AM → execução com `startLatitude/startLongitude/finishLatitude/finishLongitude` + eventos com `latitude/longitude`.
    - OP → igual ao AM.
    - CL_ADMIN do tenant → **sem** nenhuma lat/lng (chaves ausentes), com distâncias, precisões e flags; eventos sem lat/lng.
    - CL_USER do tenant → igual ao CL_ADMIN.
    - CL de outro tenant → 404 `APPOINTMENT_NOT_FOUND`.
    - INSP → 403 `FORBIDDEN`.
    - sem execução → `execution: null`; execução abandonada → `execution` com `abandonedAt` preenchido.
    - eventos em ordem `occurredAt` desc, no máximo 50.
16. `send-completion-reminders.use-case.test.ts` (novo, relógio e fuso fixos; L-F03-03, D22):
    - SCHEDULED, hoje, slot até 11:00, setting 30 min, agora 11:31, **sem execução** → chama `PublishSystemInspectorNoticeUseCase.execute({ type: 'COMPLETION_REMINDER', inspectorIds: [inspectorId], title: 'Finish your inspection', body: 'INS-0042 at 12 King St, Newtown was due by 11:00. Check in when you arrive, or tell operations if you can\'t do it.', dedupeKey: 'completion-reminder:<appointmentId>:2026-11-03:<inspectorId>', targetPath: '/schedule/<appointmentId>' })`.
    - execução **em andamento** sem finish (o caso "esqueceu o check-out") → `body: 'Did you finish INS-0042 at 12 King St, Newtown? Check out in the app so the job is marked done.'`, mesmo `dedupeKey`.
    - F02 devolve `{ created: true, noticeId: 'n1' }` → audit `inspection.completion_reminder_sent` com `metadata { inspectorId, scheduledDate, minutesAfterWindowEnd, dedupeKey, noticeId: 'n1', variant: 'NOT_STARTED' | 'IN_PROGRESS' }`; F02 devolve `{ created: false }` → **nenhum** audit, contado em `skippedAlreadySent`.
    - **supressão "ocupado":** o inspetor tem outra execução em andamento (não abandonada) iniciada às 11:10 (depois do fim desta janela, 11:00) → nada para este appointment, contado em `skippedBusy`; a mesma execução iniciada às 10:50 (antes do fim) → envia; execução abandonada → não conta como ocupado.
    - agora 11:29 → nada.
    - execução finalizada → nada (o appointment já seria DONE; teste defensivo).
    - segunda execução do job no mesmo dia → chama a F02 de novo com o **mesmo** `dedupeKey`; a deduplicação é da F02.
    - reoferta no mesmo dia para `i2` depois do lembrete de `i1` → `dedupeKey` com `i2` (diferente) → `i2` recebe o seu lembrete.
    - data remarcada → `dedupeKey` com a nova data civil.
    - appointment de ontem → nada (só "hoje").
    - `completionReminderEnabled: false` → nada.
    - F02 lança → loga erro e segue para o próximo appointment; contado em `failed`.
    - sem `inspectorId` → ignora.
    - log de resumo `{ candidates, sent, skippedAlreadySent, skippedBusy, failed }`.
    - **tela bloqueada (D12, L-F02-07):** com fixture cujo appointment tem inquilino `Mary Tenant`, telefone `+61412345678` e nota de acesso `Lockbox 4821`, `title` e `body` dos dois textos **não** contêm nome, telefone nem a nota; contêm só código do serviço, endereço e (no texto "não iniciado") o fim da janela.

**Backend integração (DB, testcontainers, em série)**
17. `tests/integration/db/inspector-cant-do.integration.test.ts` — **prova do 00.A3**:
    - seed: agência, imóvel, grupo ACCEPTED com 2 appointments SCHEDULED para o inspetor `i1`.
    - `POST /v1/inspector/appointments/:id/cant-do` (`Idempotency-Key k1`, `{ reason:'KEY_FAILED', note:'Lockbox code wrong', latitude, longitude, accuracy: 8 }`) como `i1` → 200.
    - DB: appointment `status 'REJECTED'`, `rejection_reason_code 'INSPECTOR_UNABLE'`, `reason 'Key didn\'t work — Lockbox code wrong'`, `service_group_id NULL`, `inspector_id NULL`; linha em `inspector_field_events` (`type CANT_DO`, `tenant_id` do appointment, `inspector_id i1`, coords, `accuracy_m 8.00`).
    - audit `appointment.status_transition` com `actor_type 'SYSTEM'`, `metadata.initiatedByInspectorId = i1`, `metadata.unlinkedServiceGroupId`, `metadata.releasedInspectorId = i1`; audit `inspector_field_event.cant_do` com `actor_type 'USER'`.
    - notificações: 1 `INSPECTION_REJECTED_AGENCY` (agência) + 1 `INSPECTOR_UNABLE_ALERT` por OP/AM ativo; **nenhuma** para o inquilino.
    - `GET /v1/appointments/:id` como OP → `inspectorIssue { reason:'KEY_FAILED', note:'Lockbox code wrong', inspectorName:'<nome de i1>', occurredAt }`.
    - `GET /v1/appointments?page=1&pageSize=50` → o item tem `inspectorIssue`; o outro appointment `null`. Contar queries (log do Prisma em modo teste): o número de queries não cresce com o tamanho da página (1 query extra para os eventos).
    - repetir o POST com `k1` → 200 idêntico, sem nova linha; com `k2` → 409 `CANT_DO_ALREADY_REPORTED`.
    - `GET /v1/inspector/schedule?date=<hoje>` como `i1` → o appointment rejeitado não aparece.
18. `tests/integration/db/inspector-cant-do-after-check-in.integration.test.ts`:
    - `start` → `cant-do` (`SITE_ISSUE`, nota) → execução com `abandoned_at`, `finished_at NULL`; appointment REJECTED.
    - OP adiciona a um grupo e o grupo é aceito por `i2` (ou transição direta `REJECTED → AWAITING_INSPECTOR → SCHEDULED` com `inspectorId i2`) → `GET /v1/inspector/schedule` de `i2` mostra `executionStatus 'NOT_STARTED'`; `start` de `i2` → 201 com o **mesmo** `executionId`, `inspector_id = i2`, `abandoned_at NULL`; `finish` de `i2` → 200, DONE.
    - o card continua: `GET /v1/appointments/:id` → `inspectorIssue` do `CANT_DO` de `i1`.
    - portal, **logo depois do `cant-do` e antes da reoferta** (L-F03-01): com o token ativo que o inquilino já tinha, `GET` dos dados do portal → `appointment.canChangeTime false`; `GET` dos grupos disponíveis → `groups: []`; `join-group` num grupo ACCEPTED compatível → 409 `PORTAL_APPOINTMENT_INACTIVE`; appointment continua REJECTED e sem grupo.
    - portal, **depois da reoferta e antes do novo `start`**: appointment em `AWAITING_INSPECTOR` (e repetir com `SCHEDULED` para `i2`) com a execução abandonada ainda na tabela → `report-unavailability` pelo token ativo **não** devolve `PortalInspectionAlreadyStartedError` e segue o fluxo normal. (Testar com o appointment ainda REJECTED passaria por vacuidade: o status já barra o portal antes da checagem da execução.)
19. `tests/integration/db/inspector-late-notice.integration.test.ts`: POST válido → 201 + linha + `estimatedArrivalAt` na resposta; data futura → 422; data de ontem → 422; depois do `start` → 422 "You've already checked in to this job."; INSP de outro → 404; OP → 403; sem `Idempotency-Key` → 400.
20. `tests/integration/db/appointment-field-activity.integration.test.ts`: `GET /v1/appointments/:id/field-activity` como OP (com lat/lng), CL_ADMIN do tenant (sem lat/lng, assert de **ausência** das chaves no JSON), CL de outro tenant (404), INSP (403).
21. `tests/integration/db/completion-reminder.integration.test.ts`: com o `PublishSystemInspectorNoticeUseCase` real da F02, rodar o use case duas vezes → 1 aviso `COMPLETION_REMINDER` para o inspetor, com `targetPath '/schedule/<id>'`, e **1** audit `inspection.completion_reminder_sent` (o segundo ciclo tem `created: false`); `inspector_notices.dedupe_key` começa com `COMPLETION_REMINDER_DEDUPE_PREFIX`.
22. `tests/integration/db/stuck-execution-abandoned.integration.test.ts`: execução abandonada há 7 h → `findStuckExecutions(6)` não a devolve.
23. `tests/integration/db/cant-do-finish-concurrency.integration.test.ts` (prova do lock; **precisa falhar sem ele**):
    - execução em andamento; disparar `POST /finish` e `POST /cant-do` em paralelo 20 vezes (appointments novos a cada rodada), com barreira para os dois entrarem na transação juntos.
    - esperado em toda rodada: exatamente **um** vence (DONE com execução finalizada **ou** REJECTED com execução abandonada), o outro recebe 409/422 limpo; **nenhum** deadlock (`40P01`), nenhum estado misto (DONE + evento CANT_DO, ou REJECTED + `finished_at`).
    - verificação de mutação: remover o `lockAppointmentForFieldEvent` do finish (ou o CAS) → o teste falha (deadlock ou estado misto) — registrar o resultado no PR (`feedback_concurrency_test_must_fail_without_guard`).

### Escopo / Passos
1. **Shared — enums** em `packages/shared/src/enums/field-events.ts` (criado na TASK-F03-1 com `GeofenceMode`): `InspectorFieldEventType`, `FieldIssueReason`, `FIELD_ISSUE_REASON_LABELS`, `FIELD_ISSUE_NOTE_REQUIRED_REASONS`, `LateNoticeReason`, `LATE_NOTICE_REASON_LABELS`, `LATE_NOTICE_MINUTES_OPTIONS = [10, 20, 30, 45, 60, 90] as const`.
1b. **Shared — constante do lembrete (L-F03-03):** `packages/shared/src/constants/inspector-notices.ts` (criado aqui se a F02 ainda não o criou; senão acrescentar) com `COMPLETION_REMINDER_DEDUPE_PREFIX = 'completion-reminder'` e `buildCompletionReminderDedupeKey({ appointmentId, civilDate, inspectorId })`; exportado no `index.ts`. A F05 lê por este prefixo.
2. **Shared — `INSPECTOR_UNABLE`:** em `reason-codes.ts`, `RejectionReasonCode.INSPECTOR_UNABLE` (com docblock "System-assigned only: the inspector reported 'Can't do this job' from the app") e `SYSTEM_ONLY_REJECTION_CODES: RejectionReasonCode[] = ['INSPECTOR_UNABLE']`, exportado. Atualizar `reason-codes.test.ts`.
2b. **Shared — origens de transição (D31, L-F06-04):** `packages/shared/src/constants/transition-sources.ts` com `TRANSITION_SOURCE_INSPECTOR_CANT_DO = 'INSPECTOR_CANT_DO'` (docblock: "Values of `metadata.source` on `appointment.status_transition`; F06 adds `TRANSITION_SOURCE_INSPECTOR_FINISH`"), exportado no `index.ts`.
3. **Shared — schemas** em `packages/shared/src/schemas/field-events.ts` (+ `schemas/index.ts`): `cantDoRequestSchema`, `cantDoResponseSchema`, `lateNoticeRequestSchema`, `lateNoticeResponseSchema`, `inspectorIssueSchema`, `fieldEventItemSchema`, `executionSummarySchema`, `appointmentFieldActivityResponseSchema`. Em `responses.ts`, `appointmentResponseSchema.inspectorIssue = inspectorIssueSchema.nullable().optional()` (com o comentário "Must stay declared here — undeclared fields are stripped").
4. **Prisma + migration** `<timestamp>_inspector_field_events` (ex.: `20261110090000_…`; **placeholder** regenerado na implementação, ordena depois da F02 — D19): enum `InspectorFieldEventType`, tabela `inspector_field_events`, coluna `inspection_executions.abandoned_at` (ver modelo).
5. **Transição:** em `execute-status-transition.use-case.ts`:
   - input `auditMetadata?: Record<string, unknown>` (doc: "Extra audit/event metadata merged into the status_transition record; used to attribute a SYS transition to the human who triggered it"), mesclado em `metadata` antes do audit e do evento `STATUS_TRANSITION`. Genérico e aceito para qualquer ator (a TASK-F06-2 o usa no finish com `source: 'INSPECTOR_FINISH'`); o `cant-do` passa `source: TRANSITION_SOURCE_INSPECTOR_CANT_DO`.
   - guarda 3a-bis-2: `if (rejectionReasonCode && SYSTEM_ONLY_REJECTION_CODES.includes(rejectionReasonCode) && !isSystemActor) throw new ForbiddenError('REJECTION_REASON_CODE_SYSTEM_ONLY', 'The INSPECTOR_UNABLE rejection reason is assigned by the system only')`.
   - input `expectedStatus?: AppointmentStatus` (CAS): quando informado, o write usa `updateMany({ where: { id, tenant_id, status: expectedStatus } })` em vez do update por id; `count === 0` → `AppointmentStatusChangedError` (409 `APPOINTMENT_STATUS_CHANGED`, "This appointment was changed by someone else. Reload and try again."). Só o finish e o `cant-do` passam `expectedStatus: 'SCHEDULED'`; os demais chamadores não mudam. Porta `IAppointmentRepository.update` ganha o parâmetro opcional `expectedStatus`.
   - **Não** tocar em `appointment-state-machine.ts` nem nos outros 4 lugares de RBAC de transição (`project_appointment_transition_rbac_multisource`).
6. **Domínio inspector-execution:**
   - `domain/inspector-field-event.entity.ts`, `domain/inspector-field-event.repository.ts` (porta: `create(event, tx)`, `findLatestCantDoByAppointmentIds(ids)`, `findLatestCantDoByAppointmentId(id, tx?)`, `listByAppointmentId(id, limit)`, `lockAppointmentForFieldEvent(appointmentId, tx)` → `SELECT id FROM appointments WHERE id = $1 FOR UPDATE`).
   - `infrastructure/prisma-inspector-field-event.repository.ts`.
   - Erros novos em `inspection-execution.errors.ts`: `CantDoAlreadyReportedError` (409 `CANT_DO_ALREADY_REPORTED`), `FieldEventAppointmentNotScheduledError` (409 `FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED`), `LateNoticeNotAllowedError(message)` (422 `LATE_NOTICE_NOT_ALLOWED`), `FieldEventIdempotencyPayloadMismatchError` (409 `FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH`, "This Idempotency-Key was already used with a different request").
   - Entidade/porta/repositório de execução: `abandonedAt`, `isAbandoned()`; `markAbandoned(id, at, tx)`; `restart(id, data, tx)`; `findStuckExecutions` com `abandoned_at: null`.
7. **`ReportCantDoUseCase`** (`application/use-cases/report-cant-do.use-case.ts`):
   1. `assertRoles(actor, ['INSP'], { action: 'inspector_field_event.cant_do', entityType: 'InspectorFieldEvent' })`; `inspectorId` obrigatório.
   2. `payloadHash`; `getWithHash(key, 'cant-do')` → cache com hash igual → devolve; hash diferente → 409 mismatch.
   3. `runInTransaction(prisma, async ({ tx, defer }) => { ... })`:
      - `lockAppointmentForFieldEvent(appointmentId, tx)` (**sempre o primeiro statement da transação**, mesma ordem do finish);
      - reler idempotência no `tx` (concorrência com a mesma chave);
      - `appointmentRepo.findById(appointmentId, null, tx)` → ausente → 404;
      - não atribuído ao ator → se `status === 'REJECTED'` e `findLatestCantDoByAppointmentId(id, tx).inspectorId === actor.inspectorId` → 409 `CANT_DO_ALREADY_REPORTED`; senão 404;
      - atribuído e `status !== 'SCHEDULED'` → 409 `FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED`;
      - execução: finalizada → 409 `EXECUTION_ALREADY_FINISHED`; em andamento e não abandonada → `markAbandoned(now, tx)`;
      - `create(event, tx)` com `tenant_id = appointment.tenantId`, `client_occurred_at` (valor cru do cliente, se válido);
      - `executeStatusTransition.executeInTransaction({ appointmentId, targetStatus: 'REJECTED', reason, rejectionReasonCode: 'INSPECTOR_UNABLE', expectedStatus: 'SCHEDULED', actor: { ...SYSTEM_ACTOR, tenantId: appointment.tenantId }, auditMetadata }, tx)` → `defer(result.runAfterCommit)`;
      - `idempotencyService.set(key, 'cant-do', output, 24, payloadHash, tx)`.
   4. After-commit (cada passo com seu próprio try/catch, nunca falha a resposta): audits `inspector_field_event.cant_do` e, se houve, `inspection_execution.abandoned`; alerta OP/AM; evento de domínio.
   - `reason` (texto) = `FIELD_ISSUE_REASON_LABELS[reason] + (note ? ' — ' + note.trim() : '')`.
8. **`ReportLateNoticeUseCase`** (`application/use-cases/report-late-notice.use-case.ts`; regras de L-F03-04/D23): INSP; idempotência escopo `'late-notice'` (mesmo padrão getWithHash + set no tx); appointment SCHEDULED e atribuído (senão 404); `scheduledDate == hoje` no fuso da agência (`ITenantTimezoneLookup`), senão 422 "You can only send a running-late notice on the day of the job."; execução em andamento e não abandonada → 422 "You've already checked in to this job."; execução finalizada → 422 "This job is already finished."; `effectiveNoticeAt = resolveEffectiveEventTime(clientOccurredAt, now).effectiveAt` (TASK-F03-1); `windowStartAt` = `scheduledDate` + `timeSlotStart` no fuso da agência; `reference = (await publishedStopStartReader.find(appointmentId, inspectorId, scheduledDate)) ?? windowStartAt` (D23 revisada, 2026-10-29); `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate`; grava evento (sem nota; `minutes` = `minutesLate` relativo à referência); audit `inspector_field_event.late_notice` (`metadata { fieldEventId, reason, minutesLate, estimatedArrivalAt }`); evento de domínio com `estimatedArrivalAt`. Sem notificação (F05/F06/F07 consomem e **não** recalculam a chegada). `estimatedArrivalAt` não é coluna: é derivado e devolvido; consumidores que leem a tabela recalculam pela mesma função pura exportada `computeEstimatedArrivalAt(reference, effectiveNoticeAt, minutesLate)` (`domain/late-notice.ts`), com `reference = published_service_start_at ?? windowStartAt`.
8b. **Detalhe do inspetor — `lastFieldIssue` (L-F03-09, D28):** `get-appointment-detail.use-case.ts` chama `fieldEventRepo.findLatestCantDoByAppointmentId(id)` e devolve `lastFieldIssue: { reason, note, occurredAt }` só quando `event.inspectorId === actor.inspectorId`; senão `null`. Nova dependência `IInspectorFieldEventRepository` no construtor (ajustar wirings de teste). `inspectorIssue` (lista/detalhe web) ganha `inspectorId` (já vem da query `DISTINCT ON`: acrescentar `e.inspector_id`).
8c. **Portal sem reoferta para `INSPECTOR_UNABLE` (L-F03-01, D20):** em `rental-tenant-portal/domain/portal-statuses.ts`, `isPortalChangeTimeBlocked({ status, rejectionReasonCode })` = `isPortalDeadStatus(status) || (status === 'REJECTED' && SYSTEM_ONLY_REJECTION_CODES.includes(rejectionReasonCode))`, com docblock explicando que a reoferta de uma rejeição do inspetor é só da OP. Usar em `join-group.use-case.ts` nos 3 pontos que hoje chamam `isPortalDeadStatus` (`:120`, `:228`, `:286`; mesmo erro `PortalAppointmentInactiveError`), em `get-available-groups.use-case.ts` (devolve `{ groups: [] }` antes de consultar slots) e em `get-portal-data.use-case.ts` (`appointment.canChangeTime = !isPortalChangeTimeBlocked(...)`, declarado como `.optional()` em `portalDataResponseSchema`, `packages/shared/src/schemas/responses.ts:760`). `report-unavailability` já recusa o "No" em REJECTED (`isPortalUnanswerableStatus`): sem mudança. A UI do portal é da TASK-F03-4.
8d. **E-mail de rejeição à agência (L-F03-07, D26):** em `modules/notification/domain/build-notification-payload.service.ts` (`rejectionReason` em `:152`), quando a transição é REJECTED com `rejectionReasonCode === 'INSPECTOR_UNABLE'`, acrescentar `rejectedByInspector: true` e `inspectorName` = nome do inspetor do último `CANT_DO` (o contexto do handler passa a ler `findLatestCantDoByAppointmentId`, porque o appointment já está com `inspectorId null`). Em `platform-notification-templates.ts` (`REJECTED_AGENCY_HTML`, `:209-222`), trocar o parágrafo final por `{{#if rejectedByInspector}}<p>The inspector{{#if inspectorName}} ({{inspectorName}}){{/if}} reported from the property that they couldn't complete this inspection. Operations have been notified and will offer the job again; you don't need to do anything unless we contact you.</p>{{else}}<p>…parágrafo atual…</p>{{/if}}`. Acrescentar `rejectedByInspector` ao `optional` de `TEMPLATE_VARIABLES.INSPECTION_REJECTED_AGENCY` (`notification-templates.ts:507`; `inspectorName` já é opcional) e ao teste de variáveis. Sem template novo, sem registro nos 8 lugares.
9. **Alerta OP/AM** `INSPECTOR_UNABLE_ALERT`: serviço `application/services/notify-inspector-unable.service.ts` (padrão do `notify-stuck.worker.ts`), com `INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS` tipando o payload. Registrar o template nos 8 lugares (ver Contexto; **não** no `prisma/seed.ts`), com `notificationClass: 'TRANSACTIONAL'` **explícito** na entry de plataforma, `TEMPLATE_TARGETS = 'PLATFORM_OPS'`, em `PLATFORM_ONLY_TEMPLATE_CODES` e `SYSTEM_TEMPLATE_CODES`.
10. **Rotas** em `inspector-execution.routes.ts`: `POST .../cant-do` e `POST .../late-notice` (schemas declarados em `body` e `response`). Rota nova no módulo appointment: `GET /v1/appointments/:appointmentId/field-activity` (`appointment.routes.ts`), use case `get-appointment-field-activity.use-case.ts` com o **mesmo recorte de tenant** do `GetAppointmentUseCase`.
11. **`inspectorIssue`:**
    - **Sem** `include` aninhado com `take: 1` (o Prisma pode buscar todas as linhas da relação e cortar em memória). O repositório faz **uma** query por página com `DISTINCT ON`, no novo `findLatestCantDoByAppointmentIds(ids)`:
      ```sql
      SELECT DISTINCT ON (e.appointment_id)
             e.appointment_id, e.reason_code, e.note, e.created_at, i.name AS inspector_name
        FROM inspector_field_events e
        JOIN inspectors i ON i.id = e.inspector_id
       WHERE e.appointment_id = ANY(${ids}::uuid[])
         AND e.type = 'CANT_DO'
       ORDER BY e.appointment_id, e.created_at DESC
      ```
      (`$queryRaw` com `::uuid[]`, ver `project_prisma_queryraw_int_params`; usa o índice `(appointment_id, type, created_at desc)`). `findById`/`findAll` chamam esse método uma vez com os ids da página e fazem o merge em memória. Lista vazia → nenhuma query.
    - `AppointmentWithRelations`/`AppointmentListItem` ganham `inspectorIssue`; `get-appointment.use-case.ts` e `list-appointments.use-case.ts` mapeiam para a resposta.
    - O export (`export-appointments.use-case.ts`) **não** ganha coluna nova; a coluna "Cancellation Reason" já humaniza `INSPECTOR_UNABLE` → teste de regressão no export.
12. **D13 — execução abandonada:** start (reinício), finish (404), schedule (`NOT_STARTED`), detalhe do inspetor (`null`), stuck (filtro), portal (ignora abandonada).
13. **Lembrete 03.16** (com L-F03-03/D22): `application/use-cases/send-completion-reminders.use-case.ts` + job `inspection-execution.completion-reminder` em `main/workers.ts` (`boss.schedule(..., '*/15 * * * *', {}, SYDNEY_TZ)`, com `withJobMetrics`). Seleção: `status = 'SCHEDULED'`, `inspector_id IS NOT NULL`, `deleted_at IS NULL`, `scheduled_date` entre ontem e amanhã (UTC, para cobrir fusos) e, em código, `scheduled_date == hoje` no fuso da agência; `agora >= fim do slot (fuso da agência) + completionReminderMinutesAfterWindowEnd`; sem execução finalizada (abandonada não conta).
    - **Supressão "ocupado":** uma query por rodada busca as execuções em andamento (`finished_at IS NULL AND abandoned_at IS NULL`) dos inspetores candidatos; o candidato é pulado (`skippedBusy`) se o inspetor tem **outra** execução em andamento com `started_at` posterior ao fim da janela deste appointment. O ciclo seguinte reavalia.
    - **Texto:** execução em andamento → `body: 'Did you finish {appointmentCode} at {propertyAddress}? Check out in the app so the job is marked done.'`; sem execução (ou abandonada) → `body: '{appointmentCode} at {propertyAddress} was due by {timeSlotEnd}. Check in when you arrive, or tell operations if you can\'t do it.'`. `title: 'Finish your inspection'` nos dois. Título e corpo aparecem na tela bloqueada (D12, L-F02-07): só código e endereço; nunca nome/telefone do inquilino, códigos de chave/lockbox ou notas de acesso. O fallback SMS do tipo crítico obedece ao teto `INSPECTOR_NOTICE_SMS_DAILY_CAP` da F02 (L-F02-01), sem lógica na F03.
    - Para cada candidato: **F02 `PublishSystemInspectorNoticeUseCase` (see F02-tarefas)** `.execute({ type: 'COMPLETION_REMINDER', inspectorIds: [appointment.inspectorId], title, body, dedupeKey: buildCompletionReminderDedupeKey({ appointmentId, civilDate, inspectorId }), targetPath: '/schedule/{appointmentId}' })`. O tipo `COMPLETION_REMINDER` é crítico por definição na F02 (push + fallback SMS). A garantia de "1 vez por appointment, data e inspetor" é o `dedupeKey` da F02; **sem** coluna nova na F03.
    - Audit `inspection.completion_reminder_sent` **só** quando a F02 devolve `created === true` (com `noticeId` e `variant`); `created === false` → `skippedAlreadySent`. Falha → loga e segue (`failed`; o job seguinte tenta de novo).
13b. **Finish com lock e CAS (deadlock):** em `finish-inspection.use-case.ts`, dentro do `runInTransaction`, o **primeiro** statement passa a ser `fieldEventRepo.lockAppointmentForFieldEvent(appointmentId, tx)` (a mesma `SELECT … FOR UPDATE` do `cant-do`, na mesma ordem: appointment → execução → transição). Depois do lock, reler a execução no `tx` (abandonada/finalizada → 404/409) e chamar a transição com `expectedStatus: 'SCHEDULED'`. Nova dependência `IInspectorFieldEventRepository` no construtor (ajustar wirings de teste).
14. **Evento de domínio:** `INSPECTOR_FIELD_EVENTS = { RECORDED: 'inspector_field_event.recorded.v1' }` em `domain-event-bus.ts`.
15. **OpenAPI + api-types** regenerados; build do shared antes do backend.

### Modelo de dados / Contratos / UI

**Prisma**
```prisma
enum InspectorFieldEventType {
  CANT_DO
  LATE_NOTICE
}

model InspectorFieldEvent {
  id                 String                  @id @default(uuid())
  appointment_id     String
  inspector_id       String
  tenant_id          String                  // appointment's tenant — scope + reports
  type               InspectorFieldEventType
  reason_code        String                  @db.VarChar(50)   // FieldIssueReason | LateNoticeReason (validated in shared Zod)
  note               String?                 @db.Text          // CANT_DO only, ≤ 500 chars (Zod); LATE_NOTICE has no note
  minutes            Int?                                      // LATE_NOTICE only (5..240)
  latitude           Decimal?                @db.Decimal(10, 7)
  longitude          Decimal?                @db.Decimal(10, 7)
  accuracy_m         Decimal?                @db.Decimal(10, 2)
  client_occurred_at DateTime?
  created_at         DateTime                @default(now())

  appointment Appointment @relation(fields: [appointment_id], references: [id])
  inspector   Inspector   @relation(fields: [inspector_id], references: [id])
  tenant      Tenant      @relation(fields: [tenant_id], references: [id])

  @@index([appointment_id, type, created_at(sort: Desc)])
  @@index([inspector_id, created_at])
  @@index([tenant_id, created_at])
  @@index([type, created_at])
  @@map("inspector_field_events")
}
```
- `Appointment.field_events InspectorFieldEvent[]`, `Inspector.field_events InspectorFieldEvent[]`, `Tenant.inspector_field_events InspectorFieldEvent[]`.
- `InspectionExecution.abandoned_at DateTime?` + `@@index([abandoned_at])` não é necessário (filtro junto de `finished_at: null` em poucos registros); **não** criar.
- Eventos são **imutáveis** (sem `updated_at`, sem endpoint de edição/remoção).

**Shared — enums e rótulos (inglês, exibidos no app e no web)**

| `FieldIssueReason` | Rótulo |
|---|---|
| `NO_ANSWER` | No answer at the door |
| `KEY_FAILED` | Key didn't work |
| `TENANT_REFUSED` | Tenant refused entry |
| `UNSAFE` | Unsafe to enter |
| `SITE_ISSUE` | Problem at the property (nota obrigatória) |
| `CANT_ATTEND` | I can't attend |

| `LateNoticeReason` | Rótulo |
|---|---|
| `TRAFFIC` | Traffic |
| `PREVIOUS_JOB_OVERRAN` | Previous job ran over |
| `PERSONAL` | Personal reason |
| `OTHER` | Other |

**Shared — schemas**
```ts
const optionalPosition = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().nonnegative().finite().optional(),
  clientOccurredAt: z.string().datetime({ offset: true }).optional(),
};
export const cantDoRequestSchema = z.object({
  reason: z.nativeEnum(FieldIssueReason),
  note: z.string().trim().max(500).optional(),
  ...optionalPosition,
}).superRefine(/* note required (non-empty) for FIELD_ISSUE_NOTE_REQUIRED_REASONS → path ['note'], "Add a short note for this reason"; lat/lng together → path ['longitude'], "Latitude and longitude must be sent together" */);
export const cantDoResponseSchema = z.object({
  eventId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  appointmentStatus: z.literal('REJECTED'),
  occurredAt: instantStr(),
  executionAbandoned: z.boolean(),
});
export const lateNoticeRequestSchema = z.object({
  reason: z.nativeEnum(LateNoticeReason),
  minutesLate: z.number().int().min(5).max(240),
  ...optionalPosition,
}).superRefine(/* lat/lng together */);
export const lateNoticeResponseSchema = z.object({
  eventId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  occurredAt: instantStr(),
  reason: z.nativeEnum(LateNoticeReason),
  minutesLate: z.number().int(),          // estimated delay relative to referenceAt (published ETA of the stop, else booked window start)
  referenceAt: instantStr(),              // published_service_start_at of the published plan stop, else window start (D23, 2026-10-29)
  referenceSource: z.enum(['PUBLISHED_PLAN', 'WINDOW_START']),
  estimatedArrivalAt: instantStr(),       // max(referenceAt, effectiveNoticeAt) + minutesLate, computed server-side (L-F03-04, D23)
});
export const inspectorIssueSchema = z.object({
  reason: z.string(),            // FieldIssueReason; z.string() so a future value never trips the serializer
  note: z.string().nullable(),
  inspectorId: z.string().uuid().nullable().optional(), // L-F03-09: lets the web mark "(current inspector)"
  inspectorName: z.string().nullable(),
  occurredAt: instantStr(),
});
export const fieldEventItemSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),              // InspectorFieldEventType
  reason: z.string(),
  note: z.string().nullable(),               // CANT_DO only; always null for LATE_NOTICE
  minutesLate: z.number().int().nullable(),
  inspectorName: z.string().nullable(),
  occurredAt: instantStr(),
  clientOccurredAt: instantStrNullable(),
  accuracyMeters: z.number().nullable(),
  latitude: z.number().nullable().optional(),   // AM/OP only — absent for CL
  longitude: z.number().nullable().optional(),  // AM/OP only — absent for CL
});
export const executionSummarySchema = z.object({
  id: z.string().uuid(),
  inspectorName: z.string().nullable(),
  startedAt: instantStr(),
  finishedAt: instantStrNullable(),
  abandonedAt: instantStrNullable(),
  startClientAt: instantStrNullable(),
  finishClientAt: instantStrNullable(),
  startDistanceMeters: z.number().nullable(),
  finishDistanceMeters: z.number().nullable(),
  startAccuracyMeters: z.number().nullable(),
  finishAccuracyMeters: z.number().nullable(),
  outOfRadius: z.boolean(),
  outOfWindow: z.boolean(),
  finishOutOfRadius: z.boolean(),
  geofenceRadiusMeters: z.number().int().nullable(),
  startLatitude: z.number().optional(),            // AM/OP only
  startLongitude: z.number().optional(),           // AM/OP only
  finishLatitude: z.number().nullable().optional(),// AM/OP only
  finishLongitude: z.number().nullable().optional(),// AM/OP only
});
export const appointmentFieldActivityResponseSchema = z.object({
  execution: executionSummarySchema.nullable(),
  events: z.array(fieldEventItemSchema),
});

// L-F03-09 — inspector's own last "Can't do", on GET /v1/inspector/appointments/:id
export const inspectorLastFieldIssueSchema = z.object({
  reason: z.string(),
  note: z.string().nullable(),
  occurredAt: instantStr(),
});
// inspectorAppointmentDetailResponseSchema.lastFieldIssue = inspectorLastFieldIssueSchema.nullable().optional()

// L-F03-01 — portalDataResponseSchema.appointment.canChangeTime = z.boolean().optional()
// (absent = legacy payload = true). false when REJECTED with a SYSTEM_ONLY_REJECTION_CODES code.
```

**Endpoints**

| Método e rota | Request | Response | Erros (código · mensagem) | RBAC | Idempotency-Key |
|---|---|---|---|---|---|
| `POST /v1/inspector/appointments/:appointmentId/cant-do` | `cantDoRequestSchema` | 200 `success(CantDoResponse)` | 400 `IDEMPOTENCY_KEY_MISSING` · "Idempotency-Key header is required"; 400 `VALIDATION_ERROR` · "Request payload is invalid"; 403 `FORBIDDEN`; 403 `INSPECTOR_NOT_LINKED` · "Inspector profile not linked to user account"; 404 `APPOINTMENT_NOT_FOUND` · "Appointment not found or not assigned to this inspector"; 409 `CANT_DO_ALREADY_REPORTED` · "You already reported this job. It is no longer on your route."; 409 `FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED` · "This job is not scheduled for you any more."; 409 `EXECUTION_ALREADY_FINISHED` · "Inspection execution already completed"; 409 `FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH` | INSP, só nos próprios SCHEDULED | **obrigatório**, escopo `cant-do`, TTL 24 h |
| `POST /v1/inspector/appointments/:appointmentId/late-notice` | `lateNoticeRequestSchema` | 201 `success(LateNoticeResponse)` | 400 `IDEMPOTENCY_KEY_MISSING`; 400 `VALIDATION_ERROR`; 403 `FORBIDDEN`/`INSPECTOR_NOT_LINKED`; 404 `APPOINTMENT_NOT_FOUND`; 422 `LATE_NOTICE_NOT_ALLOWED` · "You can only send a running-late notice on the day of the job." / "You've already checked in to this job." / "This job is already finished."; 409 `FIELD_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH` | INSP, só nos próprios SCHEDULED | **obrigatório**, escopo `late-notice`, TTL 24 h |
| `GET /v1/appointments/:appointmentId/field-activity` | – | 200 `success(AppointmentFieldActivityResponse)` | 401; 403 `FORBIDDEN` (INSP, TNT); 404 `APPOINTMENT_NOT_FOUND` (fora do tenant do CL) | AM, OP (todas as agências, igual ao `GET /v1/appointments/:id`); CL_ADMIN e CL_USER (só o próprio tenant, **sem** lat/lng) | não |
| `GET /v1/appointments/:appointmentId` e `GET /v1/appointments` (alterados) | – | + `inspectorIssue: InspectorIssue \| null` (com `inspectorId`) | inalterados | inalterado (CL também recebe `inspectorIssue`) | – |
| `GET /v1/inspector/appointments/:appointmentId` (alterado, L-F03-09) | – | + `lastFieldIssue: { reason, note, occurredAt } \| null` (só o `CANT_DO` do próprio inspetor) | inalterados | INSP | – |
| Portal: dados, grupos disponíveis e `join-group` (alterados, L-F03-01) | – | dados: + `appointment.canChangeTime`; grupos: `[]` para REJECTED/`INSPECTOR_UNABLE` | `join-group`: 409 `PORTAL_APPOINTMENT_INACTIVE` · "Appointment is no longer active" para REJECTED/`INSPECTOR_UNABLE` | token do portal (inalterado) | – |
| `PUT/GET` de settings | ver TASK-F03-1 | – | – | – | – |

**Template `INSPECTOR_UNABLE_ALERT`** (EMAIL, TRANSACTIONAL, plataforma, alvo `PLATFORM_OPS`)
- Payload (`INSPECTOR_UNABLE_ALERT_PAYLOAD_KEYS`): `appointmentCode`, `agencyName`, `propertyAddress`, `scheduledDate` (civil `dd/MM/yyyy`), `timeWindow` (`09:00 – 11:00`), `inspectorName`, `reasonLabel`, `note` (vazio se não houver), `reportedAt` (data/hora em Sydney), `appointmentUrl` (`${WEB_APP_BASE_URL}/appointments/{id}`).
- Assunto: `Inspector couldn't complete {{appointmentCode}} — {{reasonLabel}}`.
- Texto: `{{inspectorName}} reported they couldn't complete inspection {{appointmentCode}} at {{propertyAddress}} ({{agencyName}}), scheduled for {{scheduledDate}} {{timeWindow}}. Reason: {{reasonLabel}}. {{note}} The job was moved to Rejected and removed from the inspector's route. Review it and offer it again: {{appointmentUrl}}`.
- HTML via `renderSystemEmailHtml({ heading: "Inspector couldn't complete a job", contentHtml })`, sem rodapé de descadastro.
- `TEMPLATE_VARIABLES.INSPECTOR_UNABLE_ALERT = { required: [], optional: [...payload keys, 'properfyLogoUrl'] }`.

**Template `INSPECTION_REJECTED_AGENCY` (alterado, L-F03-07)** — variável opcional nova `rejectedByInspector` (boolean) e `inspectorName` vindo do último `CANT_DO`. Parágrafo final condicional:
- com `rejectedByInspector`: "The inspector ({{inspectorName}}) reported from the property that they couldn't complete this inspection. Operations have been notified and will offer the job again; you don't need to do anything unless we contact you."
- sem: o parágrafo atual ("This inspection will not go ahead as scheduled and needs to be rearranged. Where the tenant told us…").
- Assunto e cabeçalho inalterados. A nota do inspetor continua em `{{rejectionReason}}` (D14).

**Audits**
| Ação | Entidade | Ator | Metadata |
|---|---|---|---|
| `inspector_field_event.cant_do` | `Appointment` | USER (inspetor) | `fieldEventId`, `reason`, `hasNote`, `afterCheckIn`, `executionId` |
| `inspector_field_event.late_notice` | `Appointment` | USER | `fieldEventId`, `reason`, `minutesLate`, `estimatedArrivalAt` |
| `appointment.status_transition` | `Appointment` | SYSTEM | + `initiatedByUserId`, `initiatedByInspectorId`, `source: 'INSPECTOR_CANT_DO'` (`TRANSITION_SOURCE_INSPECTOR_CANT_DO`, D31), `fieldEventId` |
| `inspection_execution.abandoned` | `InspectionExecution` | USER | `appointmentId`, `fieldEventId` |
| `inspection_execution.restarted` | `InspectionExecution` | USER (novo inspetor) | `before`/`after` só com `inspectorId`, `startedAt`, `finishedAt`, `abandonedAt`, distâncias, precisões e flags (**sem** coordenadas) |
| `inspection.completion_reminder_sent` | `Appointment` | SYSTEM | `inspectorId`, `scheduledDate`, `minutesAfterWindowEnd`, `dedupeKey`, `noticeId`, `variant` (`IN_PROGRESS`/`NOT_STARTED`); gravado **só** quando a F02 devolve `created === true` |

Nenhum audit novo desta tarefa grava lat/lng do inspetor (D10); as coordenadas do evento ficam só na tabela `inspector_field_events`, servidas a AM/OP pelo endpoint de atividade de campo.

**UI:** nenhuma.

### Casos de borda
- **Duplo toque (mesma chave):** devolve o cache; com chave nova: 409 `CANT_DO_ALREADY_REPORTED`. Nunca duas rejeições.
- **Duas requisições simultâneas com chaves diferentes:** o `FOR UPDATE` serializa; a segunda vê REJECTED → 409.
- **Itens da fila offline:** `CANT_DO`/`LATE_NOTICE` nunca estão na fila (D7). Um `FINISH` da fila que chega depois do `CANT_DO` falha na transição (`REJECTED → DONE` inválida) → erro permanente; o PWA (TASK-F03-3) limpa a fila do appointment ao reportar. Um `START` da fila que chega depois → 404 (não atribuído).
- **Rejeição depois do check-in:** permitida; `abandoned_at` gravado; leitores tratam como não iniciada; reinício na reoferta (D13).
- **Corrida com o finish:** os dois pegam o mesmo `FOR UPDATE` no appointment como primeiro statement, então serializam sem deadlock. Se o finish commitou antes, o `cant-do` vê DONE → 409 `FIELD_EVENT_APPOINTMENT_NOT_SCHEDULED`. Se o `cant-do` commitou antes, o finish relê a execução abandonada → 404 `EXECUTION_NOT_STARTED`. O CAS (`expectedStatus: 'SCHEDULED'`) cobre qualquer outro escritor que não pegue o lock (409 `APPOINTMENT_STATUS_CHANGED`). Prova: teste 23.
- **Appointment não SCHEDULED:** 409 (atribuído) ou 404 (não atribuído).
- **Appointment de outro inspetor:** 404 (sem revelar existência).
- **Imóvel sem coordenadas:** irrelevante para os eventos (lat/lng do inspetor são opcionais).
- **Precisão ruim:** gravada como veio; sem regra.
- **Appointment num grupo:** desvinculado pelo bloco 7c; o subscriber de grupo vazio recebe o `serviceGroupId` anterior pelo evento (comportamento existente).
- **Caminhos em massa** (reassign/reject de grupo) não disparam subscribers de `STATUS_TRANSITION` (plano): não afetam esta tarefa, porque o `cant-do` é individual.
- **Nenhum OP/AM ativo:** loga erro; a rejeição continua.
- **Nota no e-mail da agência (D14):** o HTML padrão do `INSPECTION_REJECTED_AGENCY` já mostra `{{rejectionReason}}`, então a nota do inspetor chega à agência. É o comportamento decidido. Com L-F03-07 o e-mail também diz que foi o inspetor e que a OP vai reofertar; agências com cópia personalizada do template não recebem o bloco novo até restaurar o padrão (o `{{rejectionReason}}` continua chegando).
- **Portal depois do "Não consigo fazer" (L-F03-01):** o link do inquilino continua válido, mas "change time" fica bloqueado (grupos vazios, `join-group` 409, banner "The agency will contact you to arrange a new time."). Depois que a OP reoferta (status sai de REJECTED), o portal volta ao comportamento normal. A confirmação do inquilino não é alterada.
- **"Vou atrasar" depois do check-in:** 422 "You've already checked in to this job." (L-F03-04).
- **"Vou atrasar" depois do fim da janela:** permitido; `estimatedArrivalAt = agora + minutesLate`.
- **"Vou atrasar" num job de ontem ainda SCHEDULED:** 422 (só no dia).
- **Lembrete com várias paradas (L-F03-03):** um aviso por appointment; o inspetor ocupado com outra execução iniciada depois do fim da janela não é lembrado até terminar.
- **Lembrete depois de reoferta no mesmo dia:** o `dedupeKey` inclui o inspetor; o novo inspetor recebe o seu.
- **Mesmo inspetor reaceita um job que ele reportou (L-F03-09):** o detalhe do PWA mostra o `lastFieldIssue` dele.
- **"Vou atrasar" sem nota:** o aviso de atraso não tem campo de nota (escopo mínimo); um `note` enviado é descartado pelo Zod.
- **"Vou atrasar" repetido:** cada aviso é um evento novo; consumidores usam o mais recente.
- **"Vou atrasar" em data futura:** 422.
- **Referência do `minutesLate` (D23 revisada, 2026-10-29):** `published_service_start_at` da parada quando existe plano publicado; senão o início da janela combinada. A ETA recalculada (não publicada) nunca é referência. F05/F06/F07 usam `estimatedArrivalAt` e não recalculam com outra ETA.
- **Lembrete com `timeSlotEnd` 23:45 + 30 min:** passa da meia-noite; como a regra é "hoje", não envia. **Limitação conhecida** (D17), documentada na spec.
- **Lembrete e remarcação no mesmo dia:** mesma data civil e mesmo inspetor → mesmo `dedupeKey` → a F02 não reenvia.

### Fora do escopo
- Novo estado ou nova regra de RBAC na máquina de estados.
- Aviso ao inquilino quando o inspetor não consegue.
- Desatribuição self-service; foto de entrada; "ligou para o inquilino"; rastreamento contínuo.
- Item "Needs attention" do Dia ao Vivo (F05) e aviso de horário ao inquilino (F06).
- Marcar o `DayPlan` como STALE: a F04 assina `APPOINTMENT_EVENTS.STATUS_TRANSITION` e/ou `INSPECTOR_FIELD_EVENTS.RECORDED` (contrato exportado).
- Retorno da OP ao inspetor sobre o "Não consigo fazer" (ver Achados).
- Filtro por código de motivo na lista (não existe hoje; ver Achados).

### Critérios de aceite
- **00.A3:** check-in, check-out e "Não consigo fazer" gravam data, hora e inspetor e aparecem na API de detalhe/atividade. O "cancelamento" do contrato é o "Não consigo fazer" → REJECTED com motivo. **Prova:** teste de integração 17 (o evento cria a transição, desvincula o grupo, libera o inspetor e expõe o `inspectorIssue`) e 18 (depois do check-in).
- **03.A2:** sem mudança nesta tarefa (coberto na TASK-F03-1).
- `INSPECTOR_UNABLE` é recusado para atores humanos (teste 5).
- O lembrete chega 1 vez por appointment, data e inspetor, com o texto certo para "em andamento" e "não iniciado" (teste 16/21).
- Depois de um "Não consigo fazer", o inquilino não consegue reagendar pelo portal (testes 13b e 18).
- O e-mail de rejeição à agência diz que foi o inspetor quando o código é `INSPECTOR_UNABLE` (teste 14b).
- `POST .../late-notice` devolve `estimatedArrivalAt` e só aceita no dia, antes do check-in (testes 7 e 19).

### Dependências
- TASK-F03-1 mergeada (`PlatformSetting`, colunas de execução, schemas de start/finish).
- **F02 `PublishSystemInspectorNoticeUseCase` (see F02-tarefas)** mergeada para o passo 13 (tipo `COMPLETION_REMINDER`, `dedupeKey`, `targetPath`). Se a F02 atrasar, o passo 13 pode sair num PR seguinte sem mudar o resto (registrar na spec).

### Riscos e armadilhas
- **Não tocar nos 5 lugares de RBAC de transição.** A rejeição usa o SYS existente. Revisar o diff de `appointment-state-machine.ts`, `packages/shared/src/lib/appointment-transitions.ts` e afins: devem ficar intactos.
- **Ator SYS precisa do `tenantId`** do appointment (`findById(id, actor.tenantId)`); sem isso, 404.
- **Efeitos fora da transação:** os efeitos da transição só rodam no `defer`. Nunca chamar `execute()` (que roda os efeitos) dentro do `runInTransaction`.
- **Template novo = 8 lugares** (sem `seed.ts`; `syncPlatformTemplates` semeia no boot) e o `notificationClass` explícito na entry (senão nasce `OPERATIONAL` e fica sujeito a consentimento).
- **Response schemas** removem `inspectorIssue` se não declarado em `appointmentResponseSchema`; e o tipo web `AppointmentDetail` precisa do campo (TASK-F03-4).
- **`DISTINCT ON` com `$queryRaw`:** passar o array como `${ids}::uuid[]` e mapear `created_at` como instante; teste unitário do repositório (fixture com 3 eventos em 2 appointments → 2 linhas, cada uma a mais recente) + o assert de "1 query por página" no teste 17.
- **Lock do finish:** o `FOR UPDATE` tem de ser o **primeiro** statement da transação no finish e no `cant-do`; qualquer leitura com lock de outra tabela antes inverte a ordem e reabre o deadlock.
- **Nova dependência em use cases existentes** (`StartInspection`, `ReportUnavailability`, `GetInspectorSchedule`, `GetAppointmentDetail` do inspetor, o handler de notificação de transição) quebra wirings de teste não tipados.
- **Portal: não remover REJECTED de `PORTAL_DEAD_STATUSES`** nem mudar `isPortalDeadStatus` (o `TENANT_DECLINED` precisa continuar revivendo pelo portal); a regra nova é uma função à parte que olha o código.
- **Idempotência no `tx`:** gravar com `set(..., tx)` dentro da transação (o rollback não pode deixar um "sucesso" cacheado).
- **Testcontainers em série** e a suíte DB fica fora do run principal: rodar `test:integration:db` explicitamente.

### Deploy / rollout / rollback
- **Ordem:** migration (expand: enum, tabela, 2 colunas nullable) → backend → seed de templates de plataforma (o seeder de templates roda no release; conferir que `INSPECTOR_UNABLE_ALERT` existe em staging antes de prod — `project_prod_stuck_alert_template_missing`).
- **Migration:** timestamp placeholder, regenerado na implementação para ordenar depois da F02 (D19).
- **Rollout:** os endpoints novos ficam inertes até a TASK-F03-3 (PWA) chegar. O job de lembrete começa a rodar no deploy: em staging, verificar 1 ciclo antes de prod. O bloqueio do portal (L-F03-01) vale no deploy do backend; o portal web antigo continua mostrando "pick another available time" até a TASK-F03-4, mas a lista de grupos já vem vazia e o `join-group` recusa. O texto novo do `INSPECTION_REJECTED_AGENCY` chega ao padrão de plataforma pelo `syncPlatformTemplates` no boot; conferir em staging que o hash do padrão foi atualizado (`project_template_reset_reseed_hash`).
- **Rollback:** reverter o backend. Appointments já rejeitados com `INSPECTOR_UNABLE` continuam válidos (`VarChar`); o web antigo humaniza o código. A tabela fica. Para parar o lembrete sem deploy: `completionReminderEnabled: false` no setting.
- **Observabilidade:** logs `info` "Inspector reported cant-do" (`{ appointmentId, inspectorId, reason, afterCheckIn }`) e "Late notice recorded"; `error` em falha de alerta/lembrete; métricas do job via `withJobMetrics('inspection-execution.completion-reminder')`; log de resumo do lembrete (`{ candidates, sent, skippedAlreadySent, skippedBusy, failed }`); log `info` "Portal change-time blocked for inspector-unable rejection" (`{ appointmentId }`) no `join-group` recusado.

### Dias · Branch · Verificação
- **4,75 dias** (00.7b backend 1,5, incl. lock/CAS do finish · execução abandonada 0,25 · 00.7c backend 0,5 · 00.8 backend 0,5 · 03.16 1,0 · lacunas 2026-10-29 1,0: portal sem reoferta 0,25 (L-F03-01), lembrete 2 textos/ocupado/`dedupeKey` 0,25 (L-F03-03), "Vou atrasar" com referência 0,125 (L-F03-04), e-mail de rejeição 0,25 (L-F03-07), `lastFieldIssue`/`inspectorId` 0,125 (L-F03-09)).
- Branch: `feat/f03-field-events-backend` a partir de `develop` (depois do merge da TASK-F03-1).
- Verificação: `pnpm --filter @properfy/shared build && pnpm --filter @properfy/shared test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test`; `pnpm --filter backend test:integration:db` (suíte completa da área, via subagente); `pnpm --filter web typecheck && pnpm --filter pwa typecheck`; ≤ 150 arquivos.

---

## TASK-F03-3 · PWA: Check in / Check out no card, "Can't do this job", "Running late", precisão e horário, raio do servidor

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F03-1, TASK-F03-2
> - **Desbloqueia:** TASK-F04-3
> - **Pode rodar em paralelo com:** TASK-F01-3, TASK-F02-1, TASK-F03-4, TASK-F04-1, TASK-F09-1, TASK-F09-2
> - **Pista sugerida (time de 6):** C · PWA

### Objetivo
- Botões **Check in** e **Check out** no card da agenda (2 toques, D5), reusando `useStartInspection`, `useFinishInspection`, `useGeolocation`, a fila offline e o estado local da execução. O card abre o detalhe só para o resto.
- Folha **"Can't do this job"** (motivos + nota) e folha **"Running late"** (motivo + minutos), só online (D7).
- Enviar `accuracy` e `clientOccurredAt` no start/finish (online e na fila).
- Usar o raio do servidor (`geofence` no detalhe) no aviso de distância, acabando com os 200 m fixos. **Sem** pré-checagem do BLOCK no app: o servidor decide e o PWA mostra a mensagem do 422.

### Contexto no código
- **Card:** `apps/pwa/src/features/schedule/components/AppointmentCard.tsx` — o card inteiro é um `<button onClick={navigate('/schedule/:id')}>` (`:54`); recebe `InspectorAppointment` (inclui `executionStatus`, `status`, `scheduledDate`, `timeSlotStart/End`, `appointmentCode`, `propertyAddress`, `suburb`); `memo`. Lista em `AppointmentDayList.tsx`.
- **Botão atual:** `StartInspectionButton.tsx` só navega para `/execution/:id`; regra de dia em `getGateState` (`todayInTzDateString(useEffectiveTimezone())`).
- **Execução:** `apps/pwa/src/features/execution/pages/ExecutionPage.tsx` — `handleStart`, `handleSubmitRequest` (passa por `SyncConfirmModal` quando há `jobDetails.inspectionAppLink`, e por `PastTimeConfirmModal` quando `isPastScheduledEnd`), `handleSubmit`; estado local via `useLocalExecutionState` (IndexedDB, `ExecutionState` em `features/execution/types/index.ts`); `canTransition` (`lib/execution-state-machine.ts`).
- **Hooks:** `useStartInspection.ts` / `useFinishInspection.ts` (body `{latitude, longitude}`; offline → `enqueueAction` + `refreshQueueSnapshot`; chave `getOrCreateIdempotencyKey('start-'|'finish-' + id)`, `sessionStorage`). `useGeolocation.ts` já captura `accuracy` e `capturedAt` (`CapturedLocation`). Fila: `useOfflineQueue.ts` (só START/FINISH, em cadeia por appointment), `lib/indexeddb.ts` (`QueuedAction.type: 'START' | 'FINISH'`, `removeQueuedAction`, `clearExecutionState`).
- **Geo UI:** `components/GeoLocationCapture.tsx` (`DISTANCE_WARNING_THRESHOLD = 200`, `:12`), usado por `PreStartPanel` e `FinishingPanel`; `InProgressPanel` (`onFinish`).
- **Detalhe:** `features/schedule/pages/AppointmentDetailPage.tsx` (usa `StartInspectionButton` em ~:223; `useInspectorAppointment`).
- **UI kit:** `apps/pwa/src/components/ui/` (`Sheet`, `Button`, `Alert`, `Badge`, `Segmented`, `Card`, `MenuRow`, `Dialog`); snackbar `useSnackbar`; `useIsOnline`.
- **Testes:** Vitest + RTL (`__tests__` ao lado). **A suíte Playwright do PWA falha 56/56 em `develop`** (`project_pwa_e2e_suite_broken_vacuous`): não serve de gate.

### Decisões aplicáveis
D4, D5, D7, D8, D13 (2026-10-27); D14, D15, D16, D18 (2026-10-28); D21, D23, D27, D28 (2026-10-29).
- **2026-10-29 · L-F03-02 (D21):** falha **permanente** de START na fila (qualquer 4xx exceto 401/408/429) → além de `FAILED` + `showError`: `clearExecutionState(appointmentId)`, remoção do FINISH encadeado do mesmo appointment, `refreshQueueSnapshot()` e invalidação de `['inspector','schedule']`; o card volta a "Check in". 422 `GEOFENCE_OUT_OF_RADIUS` é permanente já na 1ª resposta (sem as 3 tentativas, sem "Retry") e a mensagem termina com "Check in again when you're at the property." 5xx/rede: retry como hoje.
- **2026-10-29 · L-F03-04 (D23, revisada pelo dev em 2026-10-29):** a folha "Running late" pergunta "How late will you arrive? (from {HH:mm})", com `{HH:mm}` = `publishedServiceStartAt` da parada no plano de hoje (cache da F04) quando existe, senão `timeSlotStart`; o snackbar usa o `estimatedArrivalAt` do servidor.
- **2026-10-29 · L-F03-08 (D27):** o PWA só exibe a mensagem do 422, que já orienta "If you are at the right address, contact operations." Sem botão de override.
- **2026-10-29 · L-F03-09 (D28):** alerta informativo no `AppointmentDetailPage` quando o detalhe traz `lastFieldIssue`.
- Design v3: "Check in / Check out" e fluxo "Can't get in" com motivos (layout de referência; valores de exemplo).

### Testes primeiro (TDD)

**Unit / componente (Vitest + RTL, `apps/pwa`)**
1. `useStartInspection.test.ts` / `useFinishInspection.test.ts`:
   - online: body enviado = `{ latitude, longitude, accuracy, clientOccurredAt: location.capturedAt }`.
   - offline: o `QueuedAction.payload` gravado contém `accuracy` e `clientOccurredAt`.
2. `useOfflineQueue.test.ts`: item antigo `{latitude, longitude}` continua sendo enviado sem alteração; um `QueuedAction` com `type` desconhecido nunca é criado pelos hooks novos (assert: `enqueueAction` não é chamado por `useReportCantDo`/`useReportLateNotice`).
   - **L-F03-02 (D21):** fila com START + FINISH do appointment `a1` e `ExecutionState { phase: 'IN_PROGRESS' }` no IndexedDB; START recebe 422 `GEOFENCE_OUT_OF_RADIUS` → START vira `FAILED` na **1ª** resposta (sem retry), FINISH de `a1` removido da fila, `clearExecutionState('a1')` chamado, `refreshQueueSnapshot` chamado, `invalidateQueries(['inspector','schedule'])` chamado, `showError("A queued inspection sync failed: You are 640 m from the property. Check-in is only allowed within 300 m. If you are at the right address, contact operations. Check in again when you're at the property.")`.
   - START recebe 404 `APPOINTMENT_NOT_FOUND` (OP reatribuiu) ou 403 `EXECUTION_T1_BLOCKED` → mesma limpeza (estado local, FINISH encadeado), mensagem do servidor sem o sufixo de geofence.
   - START recebe 503 ou erro de rede → item continua `PENDING` com `retryCount + 1`; estado local e FINISH **intactos**.
   - START recebe 401 → nada limpo (comportamento atual de logout).
   - FINISH de outro appointment `a2` na fila → intacto.
3. `useExecutionActions.test.ts` (hook extraído):
   - `checkIn(location)` chama start, grava `ExecutionState { phase: 'IN_PROGRESS', startLocation, startedAt }` no IndexedDB e devolve a resposta do servidor (`outOfRadius`, `geofence`).
   - `requestCheckOut(location)` com `inspectionAppLink` → pede a etapa `SYNC`; depois de confirmar e com `isPastScheduledEnd` → etapa `PAST_TIME`; depois de confirmar → finish e estado `DONE` (`pendingSync` conforme `queued`).
   - sem link e sem passado → finish direto.
   - erro de finish → estado `ERROR` com a mensagem.
   - 422 `GEOFENCE_OUT_OF_RADIUS` no check-in → **não** grava estado local; expõe a mensagem do servidor.
4. `AppointmentCard.test.tsx`:
   - SCHEDULED, `executionStatus 'NOT_STARTED'`, data = hoje → mostra "Check in"; não mostra "Check out".
   - data futura → "Check in" desabilitado com o texto "Available on inspection day" (mesma regra do `getGateState`).
   - `IN_PROGRESS` → mostra "Check out".
   - DONE/REJECTED/CANCELLED → nenhum botão de ação, nem o menu.
   - tocar na área do card (fora dos botões) → navega para `/schedule/:id`; tocar em "Check in" **não** navega.
   - "Check in" → mostra "Getting your location…" (desabilitado, `aria-busy`), depois chama start com a localização; sucesso → snackbar "Checked in at 09:42".
   - resposta `outOfRadius: true` → snackbar de aviso "You're 640 m from the property. Operations will see this check-in." 
   - 422 de geofence → snackbar de erro com a mensagem do servidor; botão volta a "Check in".
   - estado local `IN_PROGRESS` limpo pela fila (L-F03-02) e agenda refeita com `executionStatus 'NOT_STARTED'` → card volta a mostrar "Check in" e não mostra "Check out".
   - geolocalização negada → snackbar "Location is required to check in. Turn on location access and try again."; start não é chamado.
   - offline → enfileira; snackbar "You're offline. Check-in saved and will sync automatically."
   - "Check out" com link de app → abre `SyncConfirmModal`; cancelar → nada enviado.
   - "Check out" quando o detalhe não está no cache e não há rede → navega para `/execution/:id` (fallback).
   - menu "More actions" (SCHEDULED) tem "Running late" e "Can't do this job"; "Running late" some quando a data é futura, passada ou o `executionStatus` é `IN_PROGRESS` (L-F03-04).
   - DOM válido: nenhum `<button>` dentro de outro `<button>` (assert `container.querySelectorAll('button button').length === 0`).
5. `CantDoSheet.test.tsx`:
   - lista os 6 motivos com os rótulos do shared, como `radio` num `radiogroup` rotulado "Reason".
   - "Send to operations" desabilitado sem motivo; com `SITE_ISSUE` e nota vazia → desabilitado e texto de ajuda "Add a short note for this reason".
   - contador "0/500"; corta em 500.
   - offline → botão desabilitado e alerta "You need a connection to report this. Try again when you're back online."
   - envio → POST `/cant-do` com `{ reason, note, latitude, longitude, accuracy, clientOccurredAt }` (posição se disponível sem bloquear: tenta capturar por até 5 s; sem posição envia só motivo/nota) e `Idempotency-Key` estável por abertura da folha.
   - duplo toque em "Send" → **1** POST (botão `disabled` + `aria-busy` durante o envio).
   - sucesso → fecha a folha, snackbar "Sent to operations. This job has been removed from your route.", invalida `['inspector','schedule']` e `['inspector','appointment', id]`, **remove da fila** os `QueuedAction` do appointment e chama `clearExecutionState(id)`; se estava no detalhe/execução, navega para `/schedule` com `replace`.
   - 409 `CANT_DO_ALREADY_REPORTED` → trata como sucesso (mesma limpeza) com a mensagem do servidor.
   - 404/409 outros → alerta na folha com a mensagem do servidor e botão "Close".
   - 5xx/rede → alerta "Couldn't send. Check your connection and try again." mantendo os dados preenchidos.
6. `LateNoticeSheet.test.tsx`:
   - 4 motivos (radio); minutos como `Segmented`/chips 10, 20, 30, 45, 60, 90 (obrigatório); **sem** campo de nota.
   - rótulo dos chips: "How late will you arrive? (from 09:00)" com o `timeSlotStart` do appointment quando não há parada publicada; com parada publicada `publishedServiceStartAt` 10:15 → "How late will you arrive? (from 10:15)" e texto de ajuda "Count from your planned arrival time." (L-F03-04, D23 revisada 2026-10-29).
   - envio → POST `/late-notice` com `{ reason, minutesLate, ...posição opcional }` → 201 com `estimatedArrivalAt` 09:20 (local) → snackbar "Operations know you'll arrive around 09:20 (about 20 min late)."
   - 422 "You've already checked in to this job." → mensagem do servidor na folha.
   - offline → desabilitado com o mesmo alerta de conexão.
   - 422 → mensagem do servidor.
7. `GeoLocationCapture.test.tsx`:
   - sem `radiusMeters` → usa 300 (default do shared) em vez de 200.
   - `radiusMeters 150`, distância 180 → aviso "You are 180 m from the property (limit 150 m). Are you at the correct location?".
   - o componente **não** muda de comportamento com `mode 'BLOCK'`: continua só avisando (sem desabilitar nada).
8. `PreStartPanel.test.tsx` / `ExecutionPage.test.tsx`: "Start Inspection" nunca é desabilitado pela distância; um 422 `GEOFENCE_OUT_OF_RADIUS` mostra a mensagem do servidor num alerta destrutivo e mantém o painel em PRE_START.
8b. `useOfflineQueue.test.ts`: item START que recebe 422 `GEOFENCE_OUT_OF_RADIUS` na sincronização → vira FAILED na 1ª resposta (D16 + D21) e o `showError` exibe "A queued inspection sync failed: You are 640 m from the property. Check-in is only allowed within 300 m. If you are at the right address, contact operations. Check in again when you're at the property."; a lista da fila não oferece "Retry" para esse item.
9. `InProgressPanel.test.tsx`: link "Can't complete this job" abre a `CantDoSheet` (rejeição depois do check-in).
10. `AppointmentDetailPage.test.tsx`: SCHEDULED mostra "Running late" e "Can't do this job" abaixo do botão de início; DONE não mostra.
    - com `lastFieldIssue { reason:'KEY_FAILED', occurredAt: 2026-11-03T09:41 }` → `Alert` informativo "You reported 'Key didn't work' on 03/11/2026. This job was offered again." (L-F03-09); com nota → a nota aparece abaixo; `lastFieldIssue null`/ausente → sem alerta.

**E2E:** nenhum spec Playwright novo no PWA (D18: a suíte está quebrada no repositório inteiro). O gate é o Vitest acima + o checklist de QA manual abaixo.

**Checklist de QA manual** (iOS simulado e Android, backend local; marcar no PR):
- [ ] Q1: agenda de hoje → "Check in" no card → permissão concedida → snackbar de sucesso → card mostra "Check out" → "Check out" (sem link, dentro do horário) → job aparece como DONE.
- [ ] Q2: "Check out" num job com link de app → `SyncConfirmModal`; depois do horário → `PastTimeConfirmModal`.
- [ ] Q3: "More actions" → "Can't do this job" → `KEY_FAILED` → "Send to operations" → snackbar → card some da agenda.
- [ ] Q4: `SITE_ISSUE` sem nota → botão desabilitado; a dica "This note is shared with the agency." está visível.
- [ ] Q5: modo avião → "Check in" → snackbar offline → sair do modo avião → fila sincroniza → badge zera.
- [ ] Q6: modo avião → "Can't do this job" e "Running late" desabilitados com o alerta de conexão.
- [ ] Q7: "Running late" → `TRAFFIC` + 20 → snackbar.
- [ ] Q8: BLOCK configurado, posição a 900 m → erro com a mensagem do servidor; offline em BLOCK fora do raio → item FAILED com a mesma mensagem ao sincronizar **e o card volta a mostrar "Check in"** (L-F03-02); novo check-in perto do imóvel funciona.
- [ ] Q11: reportar "Can't do this job" (`KEY_FAILED`), OP reoferta e o mesmo inspetor reaceita → detalhe mostra "You reported 'Key didn't work' on …" (L-F03-09).
- [ ] Q9: depois do check-in, "Can't complete this job" no `InProgressPanel` → volta para a agenda sem o aviso de saída.
- [ ] Q10: leitor de tela (VoiceOver/TalkBack) lê rótulos dos botões do card e das folhas.

### Escopo / Passos
1. **Hooks de start/finish:** acrescentar `accuracy: location.accuracy` e `clientOccurredAt: location.capturedAt` ao body (online e fila).
2. **Extrair `useExecutionActions(appointmentId)`** (`features/execution/hooks/useExecutionActions.ts`) com a lógica do `ExecutionPage` (check-in, pedido de check-out com etapas `SYNC`/`PAST_TIME`, submit, retry), lendo `inspectionAppLink`, `scheduledDate`, `timeSlotEnd` do detalhe (`useInspectorAppointment`) e persistindo via `useLocalExecutionState`. O `ExecutionPage` passa a usar o hook (sem mudança visível).
3. **Card** (`AppointmentCard.tsx`): trocar o `<button>` externo por `<article aria-labelledby>` contendo:
   - um `<button>` (ou `<Link>`) "área principal" com todo o conteúdo atual, que navega para o detalhe (mantém `data-testid="appointment-card-{id}"`);
   - uma barra de ações (só SCHEDULED): botão primário "Check in" (NOT_STARTED) ou "Check out" (IN_PROGRESS), mínimo 48 px de altura; botão ícone "More actions" (`aria-haspopup="menu"`) que abre um menu/folha com "Running late" (data == hoje e NOT_STARTED, L-F03-04) e "Can't do this job".
   - Check in: `useGeolocation().requestLocation()` → ao obter, `checkIn(location)`.
   - Check out: carrega o detalhe com `queryClient.fetchQuery(['inspector','appointment', id])` (usa o cache); se falhar sem rede → `navigate('/execution/:id')`; senão captura a localização e chama `requestCheckOut(location)`, renderizando `SyncConfirmModal`/`PastTimeConfirmModal` a partir do card.
4. **Folhas** em `features/field-events/components/` (pasta nova): `CantDoSheet.tsx`, `LateNoticeSheet.tsx`; hooks `features/field-events/hooks/useReportCantDo.ts`, `useReportLateNotice.ts` (`apiPost` direto, **sem** `enqueueAction`; `Idempotency-Key = generateIdempotencyKey()` criada ao abrir a folha e mantida em `useRef`).
5. **Limpeza após `CANT_DO`:** helper `purgeAppointmentFromOfflineQueue(appointmentId)` em `features/execution/lib/indexeddb.ts` (remove todos os `QueuedAction` do appointment + `clearExecutionState`) e `refreshQueueSnapshot()`.
6. **Pontos de entrada:** card (menu), `AppointmentDetailPage` (botões secundários abaixo do `StartInspectionButton`, só SCHEDULED), `InProgressPanel` (link "Can't complete this job").
7. **Geofence no PWA:** `GeoLocationCapture` recebe `radiusMeters` (do `geofence` do detalhe; default do `PLATFORM_SETTINGS_REGISTRY.fieldEvents.defaults`) e remove `DISTANCE_WARNING_THRESHOLD`; só avisa. Nenhuma pré-checagem de BLOCK: o 422 do servidor é mostrado no `PreStartPanel`, no card e, para itens da fila, pelo `showError` existente.
8. **Tipos:** usar os tipos gerados (`api-types`) para as respostas novas; `InspectorAppointmentDetail` ganha `geofence?` e `lastFieldIssue?`.
9. **Falha permanente de START na fila (L-F03-02, D21):** em `features/execution/hooks/useOfflineQueue.ts`, classificar o erro (`isPermanentQueueError(err)`: status 4xx exceto 401/408/429; 422 `GEOFENCE_OUT_OF_RADIUS` é permanente na 1ª resposta). Para START permanente: `updateQueuedAction({ status: 'FAILED' })`, remover os FINISH pendentes do mesmo `appointmentId` (`removeQueuedAction`), `clearExecutionState(appointmentId)`, `refreshQueueSnapshot()`, `queryClient.invalidateQueries({ queryKey: ['inspector','schedule'] })` e `showError` com a mensagem do servidor (+ " Check in again when you're at the property." para geofence). O item FAILED de geofence não expõe "Retry" na UI da fila. FINISH permanente continua como hoje. O `ExecutionPage`/`useExecutionActions` seguem gravando `IN_PROGRESS` no toque (necessário offline); a limpeza é responsabilidade da fila.
10. **Alerta "You reported…" (L-F03-09, D28):** no `AppointmentDetailPage`, `Alert` (variante info) no topo quando `appointment.lastFieldIssue` existe: "You reported '{FIELD_ISSUE_REASON_LABELS[reason]}' on {dd/MM/yyyy}. This job was offered again." + nota, se houver. Sem histórico/lista nova.

### Modelo de dados / Contratos / UI
- **Contratos consumidos:** start/finish estendidos e detalhe com `geofence` (TASK-F03-1); `POST .../cant-do` e `POST .../late-notice` (TASK-F03-2). Nenhum endpoint novo.
- **IndexedDB:** nenhuma mudança de schema (o `payload` do `QueuedAction` já é livre). **Não** há tipos novos de `QueuedAction`.

**UI — Card da agenda (estados)**
| Estado | Ações visíveis |
|---|---|
| SCHEDULED, NOT_STARTED, data ≤ hoje | "Check in" (primário) + "More actions" (Running late, Can't do this job) |
| SCHEDULED, NOT_STARTED, data futura | "Check in" desabilitado + sublegenda "Available on inspection day"; "More actions" só com "Can't do this job" |
| SCHEDULED, IN_PROGRESS | "Check out" (primário) + "More actions" (só Can't do this job; "Running late" não se aplica depois do check-in, L-F03-04) |
| Check in em andamento | botão com spinner "Getting your location…" e depois "Checking in…", `disabled`, `aria-busy="true"` |
| DONE / REJECTED / CANCELLED | sem barra de ações (aparência atual com `opacity-60`) |

**UI — Folha "Can't do this job"**
- Título: "Can't do this job"; subtítulo: "{appointmentCode} · {propertyAddress}".
- Grupo de rádio "Reason" com os 6 rótulos do shared.
- Campo "Note" (textarea, rótulo visível; "(required)" quando `SITE_ISSUE`, senão "(optional)"), placeholder "What happened?", contador "{n}/500".
- Dica sob o campo de nota: "This note is shared with the agency." (D14, ligada por `aria-describedby`).
- Texto de aviso: "Operations will be notified and this job will be removed from your route."
- Botões: "Send to operations" (primário, destrutivo) e "Cancel".
- Estados: inicial; enviando ("Sending…"); erro (alerta com mensagem); offline (alerta "You need a connection to report this. Try again when you're back online." e botão desabilitado).
- Sucesso: snackbar "Sent to operations. This job has been removed from your route."

**UI — Folha "Running late"**
- Título: "Running late"; subtítulo igual.
- Rádio "Reason" (4 rótulos); "How late will you arrive? (from {timeSlotStart})" com chips 10, 20, 30, 45, 60, 90 min (rótulo acessível "{n} minutes late"). Sem nota. Texto de ajuda: "Count from your planned arrival time." quando há parada publicada (`{HH:mm}` = `publishedServiceStartAt`), senão "Count from the start of the booked window." (`{HH:mm}` = `timeSlotStart`) (L-F03-04, D23 revisada 2026-10-29).
- Botões: "Notify operations" e "Cancel".
- Sucesso: "Operations know you'll arrive around {HH:mm de estimatedArrivalAt} (about {n} min late)."
- Erro 422 depois do check-in: "You've already checked in to this job." (a ação some do menu quando `executionStatus` é `IN_PROGRESS`; o 422 cobre a corrida).
- Offline: mesmo alerta de conexão.

**Acessibilidade**
- Folhas com `role="dialog"`, `aria-modal="true"`, `aria-labelledby` no título, foco inicial no primeiro rádio, `Esc`/gesto fecham, foco volta ao botão que abriu.
- Rádios nativos dentro de `fieldset`/`legend`; erros ligados por `aria-describedby`; contador anunciado só ao passar de 450 (`aria-live="polite"`).
- Alvos de toque ≥ 48 px; "More actions" com `aria-label="More actions for {appointmentCode}"`; "Check in"/"Check out" com `aria-label` incluindo o código do job.
- Snackbars em `aria-live` (comportamento atual do `useSnackbar`).
- Contraste dos estados desabilitados segue o design system (`check:ds`).

### Casos de borda
- **Duplo toque em Check in/Check out:** botão desabilitado durante a captura/envio; a chave `start-{id}`/`finish-{id}` em `sessionStorage` garante o cache no servidor.
- **Duplo toque em "Send to operations":** 1 POST; um segundo envio com outra chave recebe 409 `CANT_DO_ALREADY_REPORTED` e é tratado como sucesso.
- **Itens na fila offline:** check-in/out offline continuam enfileirando; "Can't do"/"Running late" ficam desabilitados offline. Ao reportar "Can't do", a fila do appointment é limpa (um FINISH pendente falharia para sempre).
- **Rejeição depois do check-in:** link no `InProgressPanel`; a limpeza apaga o estado local `IN_PROGRESS` e o `useBlocker` não pode prender a navegação (liberar antes de navegar).
- **Appointment que deixou de ser SCHEDULED** (OP rejeitou enquanto o card estava aberto): o servidor devolve 404/409; a folha mostra a mensagem e a agenda é invalidada.
- **Appointment de outro inspetor:** 404 → mensagem; agenda invalidada.
- **Imóvel sem coordenadas:** sem aviso de distância; BLOCK nunca pré-bloqueia.
- **Precisão ruim:** o badge de precisão continua (vermelho > 50 m); BLOCK cai para aviso.
- **Geolocalização negada:** check-in exige localização (regra atual); "Can't do"/"Running late" seguem sem posição.
- **Detalhe fora do cache e sem rede no check-out:** fallback para `/execution/:id` (fluxo atual).
- **Data futura:** check-in desabilitado; "Running late" escondido; "Can't do this job" disponível (motivo `CANT_ATTEND`).
- **Check-in offline recusado em definitivo na sincronização (L-F03-02):** o card volta a "Check in" (estado local limpo, FINISH encadeado removido); o inspetor faz um check-in novo quando estiver no imóvel. Sem precisar limpar dados do app.
- **START da fila com 5xx/rede:** continua tentando; o card continua "Check out" (o estado local só é limpo em falha permanente).
- **Mesmo inspetor reaceita um job que reportou (L-F03-09):** alerta "You reported…" no detalhe.
- **Logout com folha aberta:** a folha fecha com o desmonte; nada é enfileirado.

### Fora do escopo
- Navegação Today/Schedule/Offers/More e "View and reorder" (F04).
- Caixa de avisos e o push do lembrete (F02 entrega a recepção).
- Foto de entrada, controle de chave, checklist (design v3, fora do contrato).
- Qualquer mudança no backend.

### Critérios de aceite
- **00.A3 (app):** check-in e check-out a partir do card em 2 toques (mais a permissão de localização); "Can't do this job" envia o motivo e tira o job da rota.
- **03.A2 (app):** com FLAG, check-in fora do raio é aceito e o inspetor vê o aviso; com BLOCK, o app mostra a mensagem clara do 422 do servidor (online, no card ou na fila).
- Precisão e horário do dispositivo chegam ao servidor no start/finish, online e pela fila.
- Nenhum evento novo entra na fila offline.
- Um START da fila recusado em definitivo nunca deixa o app preso em "Check out" (teste 2 e Q8).

### Dependências
- TASK-F03-1 e TASK-F03-2 mergeadas e com api-types regenerados.

### Riscos e armadilhas
- **Botão dentro de botão:** o card atual é um `<button>`; reestruturar sem quebrar os testes existentes (`AppointmentCard.test.tsx`, `AppointmentDayList`) e o `memo`.
- **Divergência entre card e `ExecutionPage`:** os dois precisam escrever o **mesmo** `ExecutionState` no IndexedDB; por isso a extração do hook é obrigatória.
- **`useBlocker`** do `ExecutionPage` bloqueia a saída em `IN_PROGRESS`: depois de "Can't complete", limpar o estado antes de navegar.
- **E2E vazio (D18):** a suíte Playwright do PWA não roda; nenhum spec novo é escrito. O gate é `pnpm --filter pwa test` + o checklist de QA manual (`feedback_qa_must_test_in_browser`).
- **Fuso:** regra de "hoje" sempre com `useEffectiveTimezone` (nunca o fuso do dispositivo).
- **`check:ds`** recusa cores/classes fora do design system.

### Deploy / rollout / rollback
- **Ordem:** só depois do backend das TASK-F03-1/2 em produção.
- **Rollout:** deploy do PWA; service worker atualiza na próxima abertura (`project_stale_chunk_retry`). Itens já na fila seguem funcionando (formato antigo aceito).
- **Rollback:** reverter o PWA. O backend continua compatível com o PWA antigo.
- **Observabilidade:** sem telemetria nova no cliente; o servidor registra tudo (audits e logs das TASK-F03-1/2).

### Dias · Branch · Verificação
- **3,25 dias** (00.7a 1,25 incl. reestruturação do card e extração do hook · 00.7b PWA 0,5 · 00.8 PWA 0,5 · 03.1 PWA 0,25 · 03.2 PWA 0,25 · lacunas 2026-10-29 0,5: limpeza de START permanente na fila 0,375 (L-F03-02), alerta "You reported…" 0,125 (L-F03-09); copy de L-F03-04/08 sem custo). QA manual dentro de cada item.
- Branch: `feat/f03-field-events-pwa` a partir de `develop`.
- Verificação: `pnpm --filter @properfy/shared build`; `pnpm --filter pwa typecheck && pnpm --filter pwa lint && pnpm --filter pwa test && pnpm --filter pwa check:ds && pnpm --filter pwa build`; checklist de QA manual Q1–Q11 (iOS simulado + Android) com o backend local; ≤ 150 arquivos.

---

## TASK-F03-4 · Web: "Field activity", card "Inspector couldn't complete", rótulos do timeline, `INSPECTOR_UNABLE`, "Platform settings"

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F03-1, TASK-F03-2
> - **Desbloqueia:** TASK-F04-5, TASK-F05-3, TASK-F07-3, TASK-F08-3
> - **Pode rodar em paralelo com:** TASK-F01-3, TASK-F02-1, TASK-F03-3, TASK-F04-1, TASK-F09-1, TASK-F09-2
> - **Pista sugerida (time de 6):** D · Web

### Objetivo
- Bloco **"Field activity"** no detalhe do appointment (início/fim, distância, precisão, flags, eventos de campo), com recorte de privacidade para CL.
- Card **"Inspector couldn't complete"** (motivo, nota, inspetor, data/hora), só quando existe, no detalhe e no modal do mapa.
- Rótulos novos no `AuditTimeline`, incluindo `inspection.geolocation_mismatch`.
- `INSPECTOR_UNABLE` em todos os lugares do web que listam ou rotulam códigos de motivo.
- Página **"Platform settings"** (AM/OP) com a seção "Field events" (raio, modo, tolerância, lembrete), pronta para outras features acrescentarem seções.
- **Portal do inquilino:** sem "pick another available time" quando o appointment foi rejeitado pelo inspetor (`canChangeTime: false`, L-F03-01).

### Contexto no código
- **Detalhe:** `apps/web/src/features/appointments/pages/AppointmentDetailPage.tsx` — aba `overview` renderiza `AppointmentDetailSections` + `AppointmentSatisfactionSection` (~:470); aba `timeline` só para `isPrivileged` (AM/OP, `:89`); rota `appointments/:id` para AM/OP/CL_ADMIN/CL_USER (`app/router.tsx:233`).
- **Seções:** `components/AppointmentDetailSections.tsx` (alerta de overdue com `role="alert"`, `FormSection`, `DetailRow`).
- **Mapa:** `components/AppointmentMapDetailPanel.tsx` — banner REJECTED (`data-testid="map-detail-rejected-banner"`, ~:181-200) mostra `rejectionReasonCode` **cru** (sem `formatReasonCodeLabel`); usa `useAppointmentDetail` (`GET /v1/appointments/:id`) e o item do mapa (`useAppointmentMapData` → `GET /v1/appointments`).
- **Timeline:** `components/AuditTimeline.tsx` (`ACTION_LABELS`, `ACTION_STYLES`, `getMetadataBadges`).
- **Códigos de motivo no web:** `components/StatusTransitionDialog.tsx` (`REJECTION_OPTIONS = Object.values(RejectionReasonCode)` — sem filtro; `SYSTEM_ONLY_CANCELLATION_CODES` é o precedente); `components/AppointmentTable.tsx:205-225` (coluna "Cancellation Reason" com `formatReasonCodeLabel(cancellation ?? rejection)`); banner do mapa acima. `AppointmentBoardCard.tsx` não mostra código de motivo; `AppointmentFilters.tsx` **não** tem filtro por motivo.
- **Tipos:** `features/appointments/types/index.ts` (`AppointmentDetail`), `hooks/useAppointmentMapData.ts` (`AppointmentMapItem`).
- **Menu:** `components/shell/Sidebar.tsx` — grupo "Configuration" (AM/OP) com Service Types, Service Regions, Pricing Rules, Notification Templates, Integrations. A X01 mexe no mesmo arquivo (grupo Dashboard).
- **Formatação:** `@/lib/format-date` (`formatInstantDateTime`, `formatCivilDate`, `formatWallTimeRange`).
- **Testes:** Vitest + RTL; e2e em `apps/web/tests/e2e/` (ex.: `appointment-reject-scheduled.spec.ts`).
- **Portal do inquilino:** `apps/web/src/features/rental-tenant-portal/pages/PortalPage.tsx` — `isRejected` (~:216) e o banner "This inspection will not go ahead as scheduled. You can still pick another available time below, or the agency will contact you to arrange a new one." (~:290-296); o picker de "change time" aparece para REJECTED.

### Decisões aplicáveis
D3, D4, D6, D10, D11 (2026-10-27); D14, D17, D18 (2026-10-28); D20, D25, D27, D28, D31 (2026-10-29). Regra do dev: telas de dashboard existentes não mudam; a página nova fica em "Configuration".
- **2026-10-29 · L-F03-01 (D20):** com `appointment.canChangeTime === false`, o `PortalPage` não mostra o picker de "change time" e o banner de REJECTED vira "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time." `canChangeTime` ausente (backend antigo) = `true`.
- **2026-10-29 · L-F03-08 (D27):** a ajuda do modo "Block" na página de settings avisa que não há liberação por appointment e que BLOCK pressupõe imóveis geocodificados corretamente.
- **2026-10-29 · L-F03-09 (D28):** o `InspectorIssueCard` mostra "(current inspector)" quando `issue.inspectorId === appointment.inspectorId`.
- **2026-10-29 · L-F03-06 (D25):** no bloco "Field activity", a nota "Device time … (synced later)" continua; nenhuma flag "Outside time window" aparece quando a janela foi pulada (o backend grava `out_of_window = false`).

### Testes primeiro (TDD)

**Unit / componente (Vitest + RTL, `apps/web`)**
1. `InspectorIssueCard.test.tsx`:
   - `issue = null` → não renderiza nada.
   - com issue `{ reason:'KEY_FAILED', note:'Lockbox code wrong', inspectorName:'Jane Doe', occurredAt }` → título "Inspector couldn't complete", linha "Reason: Key didn't work", "Note: Lockbox code wrong", "Reported by Jane Doe on 03/11/2026 09:41", `role="status"`.
   - sem nota → linha "Note" ausente; `inspectorName null` → "Reported by Inspector".
   - motivo desconhecido (`'NEW_REASON'`) → rótulo humanizado com `formatReasonCodeLabel`.
   - `issue.inspectorId === currentInspectorId` → "Reported by Jane Doe (current inspector) on 03/11/2026 09:41"; diferente, `null` ou ausente → sem o sufixo (L-F03-09).
2. `AppointmentDetailSections.test.tsx`: com `appointment.inspectorIssue` → card no topo da aba (abaixo do alerta de overdue); com `status 'SCHEDULED'` e issue antigo (reofertado) → card continua.
3. `AppointmentMapDetailPanel.test.tsx`:
   - banner REJECTED mostra "Inspector Unable" (humanizado), não `INSPECTOR_UNABLE`; regressão: `TENANT_DECLINED` → "Tenant Declined".
   - com `inspectorIssue` (do detalhe, ou do item enquanto o detalhe carrega) → card compacto abaixo do banner (`data-testid="map-detail-inspector-issue"`); sem → ausente.
4. `AppointmentFieldActivitySection.test.tsx` (hook mockado):
   - carregando → skeleton; erro → `ErrorState` "Couldn't load field activity" com "Retry".
   - `execution null` e sem eventos → "No field activity yet."
   - execução completa (AM/OP) → linhas "Checked in" (data/hora), "Checked out", "Distance at check-in: 120 m (accuracy ±8 m)", "Distance at check-out", chips "Outside geofence (300 m)" quando `outOfRadius`, "Outside time window" quando `outOfWindow`, "Checked out outside geofence" quando `finishOutOfRadius`; nenhum link de mapa externo.
   - CL (sem coords no payload) → mesmas linhas e nenhuma coordenada no DOM.
   - `abandonedAt` → linha "Check-in abandoned: 03/11/2026 10:05" e chip "Abandoned".
   - `clientOccurredAt` diferente de `startedAt` em mais de 2 min → nota "Device time 09:38 (synced later)".
   - eventos: lista "Can't do this job — Key didn't work" e "Running late — Traffic, ~20 min", com inspetor e hora, em ordem decrescente.
5. `AuditTimeline.test.tsx`: rótulos para `inspection.geolocation_mismatch` ("Location Mismatch"), `inspection.check_in_blocked` ("Check-in Blocked (Outside Geofence)"), `inspector_field_event.cant_do` ("Inspector Couldn't Complete"), `inspector_field_event.late_notice` ("Inspector Running Late"), `inspection.completion_reminder_sent` ("Completion Reminder Sent"); badge "Initiated by inspector" quando `metadata.source === 'INSPECTOR_CANT_DO'`; badge "Check-out" quando `metadata.phase === 'FINISH'` **ou** `metadata.source === 'INSPECTOR_FINISH'` (origem gravada pela TASK-F06-2; D31, L-F06-04); `appointment.status_transition` sem `source` → nenhum dos dois badges.
6. `StatusTransitionDialog.test.tsx`: opções de REJECTED **não** incluem "Inspector Unable"; as 8 anteriores continuam. O filtro é feito removendo `SYSTEM_ONLY_REJECTION_CODES` de uma lista de entrada, para a TASK-F07-3 encadear o filtro por origem (`allowedRejectionCodesFrom`) sem reescrever este (L-F07-01/04).
7. `AppointmentTable.test.tsx`: linha REJECTED com `rejectionReasonCode 'INSPECTOR_UNABLE'` → coluna "Cancellation Reason" = "Inspector Unable", com tooltip do `reason`.
8. `PlatformSettingsPage.test.tsx`:
   - carrega `GET /v1/platform-settings` → seção "Field events" com os valores; badge "Default" quando `isDefault`.
   - "Last changed by Ana Ops on 03/11/2026 10:00" quando há `updatedBy`.
   - validação no cliente: raio 49 → "Enter a radius between 50 and 5000 m"; tolerância 241 → "Enter 0 to 240 minutes"; lembrete 721 → "Enter 0 to 720 minutes".
   - escolher "Block" mostra o texto de ajuda do fallback.
   - salvar → `PUT /v1/platform-settings/fieldEvents` com o objeto completo → snackbar "Field event settings saved. Changes apply within a minute."
   - 400 do servidor → erros nos campos via `details`; 403 → `ErrorState` "You don't have access to platform settings".
   - "Discard changes" restaura os valores carregados; navegar com alterações não salvas pede confirmação (padrão das telas de edição).
9. `Sidebar.roles.test.tsx`: AM e OP veem "Platform Settings" em "Configuration"; CL_ADMIN, CL_USER e INSP não.
10. `PortalPage.test.tsx` (L-F03-01):
    - `status 'REJECTED'`, `canChangeTime: false` → banner "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time."; **sem** a frase "pick another available time"; picker de grupos não renderizado e `GET` de grupos não disparado.
    - `status 'REJECTED'`, `canChangeTime: true` (ex.: `TENANT_DECLINED`) → banner e picker atuais (regressão).
    - `status 'REJECTED'`, `canChangeTime` ausente → comportamento atual (compatibilidade).
    - `join-group` devolve 409 `PORTAL_APPOINTMENT_INACTIVE` (corrida) → mensagem de erro existente e recarga dos dados do portal.

**E2E (Playwright, `apps/web/tests/e2e/`)**
- `appointment-inspector-issue.spec.ts`: OP abre um appointment REJECTED com `inspectorIssue` (API mockada) → card visível no detalhe; abre o mapa e clica no pin → card no modal; aba Timeline mostra "Inspector Couldn't Complete".
- `appointment-field-activity-cl.spec.ts`: CL_ADMIN abre o detalhe → bloco "Field activity" com distância e flags e nenhuma coordenada na página.
- `platform-settings.spec.ts`: AM muda o raio para 250 e o modo para Block → salva → recarrega e vê os valores.
- `portal-inspector-unable.spec.ts` (API mockada): portal de um appointment REJECTED com `canChangeTime: false` → banner novo e nenhum horário oferecido.

### Escopo / Passos
1. **Tipos:** `AppointmentDetail.inspectorIssue?: InspectorIssue | null` e `AppointmentMapItem.inspectorIssue?: InspectorIssue | null` (tipos gerados do shared).
2. **`InspectorIssueCard`** (`features/appointments/components/InspectorIssueCard.tsx`) com variantes `full` (detalhe) e `compact` (mapa).
3. **Detalhe:** renderizar o card no topo de `AppointmentDetailSections`; acrescentar `AppointmentFieldActivitySection` na aba `overview`, depois de `AppointmentDetailSections` e antes de `AppointmentSatisfactionSection`; hook `useAppointmentFieldActivity(id)` (`GET /v1/appointments/:id/field-activity`, React Query, chave `['appointment', id, 'field-activity']`), invalidado junto com o detalhe nas transições.
4. **Mapa:** banner REJECTED usa `formatReasonCodeLabel`; card compacto logo abaixo do banner (ou no topo, se o status não for REJECTED, porque o card persiste após a reoferta).
5. **`AuditTimeline`:** labels/estilos e badges novos (ver testes). Comparar `metadata.source` com as constantes `TRANSITION_SOURCE_*` do shared (D31), não com literais.
6. **`INSPECTOR_UNABLE` no web:** `StatusTransitionDialog` filtra `SYSTEM_ONLY_REJECTION_CODES` (importado do shared), no mesmo padrão de `SYSTEM_ONLY_CANCELLATION_CODES`, como um passo isolado sobre a lista de opções (a TASK-F07-3 acrescenta antes dele o filtro por origem `allowedRejectionCodesFrom(fromStatus)` e os rótulos de `INSPECTOR_NO_SHOW`/`NOT_EXECUTED`; os dois filtros convivem, L-F07-01/04); `AppointmentTable` e export já humanizam (só testes de regressão); banner do mapa corrigido (passo 4). Board e filtros: nada a mudar (não exibem/filtram código hoje).
7. **"Platform settings":**
   - rota `platform-settings` em `app/router.tsx` com `<AuthGuard roles={[UserRole.AM, UserRole.OP]}>`, página lazy `features/platform-settings/pages/PlatformSettingsPage.tsx`;
   - item `{ icon: 'mdi-tune-vertical', label: 'Platform Settings', to: '/platform-settings' }` no submenu "Configuration" (herda AM/OP do grupo);
   - página com `PageHeader` "Platform settings" e uma `FormSection` por chave do registro; nesta tarefa só "Field events" (`FieldEventsSettingsSection.tsx`). Cada feature futura acrescenta uma seção que lê/grava a sua chave pelo mesmo hook genérico `usePlatformSetting(key)`.
8. **api-types:** usar os tipos gerados; nenhum `as any`.
9. **Portal do inquilino (L-F03-01):** em `PortalPage.tsx`, `const canChangeTime = appointment.canChangeTime ?? true;` banner de REJECTED com duas variantes (atual quando `canChangeTime`, novo quando não) e picker/consulta de grupos condicionados a `canChangeTime`. Sem mudança de rota nem de token.
10. **"(current inspector)" (L-F03-09):** `InspectorIssueCard` recebe `currentInspectorId` (do detalhe/item do mapa) e compara com `issue.inspectorId`.

### Modelo de dados / Contratos / UI
- **Contratos consumidos:** `GET/PUT /v1/platform-settings[/:key]` (TASK-F03-1); `GET /v1/appointments/:id/field-activity` e `inspectorIssue` em detalhe/lista (TASK-F03-2). Nenhum endpoint novo.

**UI — Card "Inspector couldn't complete"**
- Contêiner com borda esquerda de alerta (tom warning do DS), ícone `mdi-account-alert`, `role="status"`.
- Título: "Inspector couldn't complete".
- Linhas: "Reason: {rótulo}", "Note: {nota}" (se houver), "Reported by {inspectorName ?? 'Inspector'}{' (current inspector)' se `inspectorId` = inspetor atual} on {dd/MM/yyyy HH:mm}".

**UI — Portal do inquilino, appointment rejeitado pelo inspetor**
- Banner (`InfoBanner`): "This inspection **will not go ahead** as scheduled. The agency will contact you to arrange a new time."
- Sem picker de horários, sem botão "Change time". Os demais blocos (dados de contato, notas) seguem as regras atuais de REJECTED.
- Variante compacta (mapa): título + motivo + "by {inspector} · {data hora}"; nota truncada em 2 linhas com tooltip.

**UI — Bloco "Field activity"** (`FormSection title="Field activity"`)
| Linha | Conteúdo | CL |
|---|---|---|
| Checked in | data/hora (servidor) + "Device time …" se divergente | sim |
| Checked out | data/hora ou "—" | sim |
| Check-in abandoned | data/hora (se `abandonedAt`) | sim |
| Distance at check-in | "120 m (accuracy ±8 m)" ou "Property has no coordinates" | sim |
| Distance at check-out | idem | sim |
| Flags | chips "Outside geofence ({raio} m)", "Outside time window", "Checked out outside geofence", "Abandoned" | sim |
| Field events | lista: tipo, motivo, minutos (late), nota, inspetor, hora | sim (sem coords) |
- Estados: carregando (skeleton 3 linhas), vazio ("No field activity yet."), erro (com "Retry").

**UI — "Platform settings" → seção "Field events"**
| Campo | Controle | Ajuda |
|---|---|---|
| Geofence radius | número (m), 50–5000 | "Check-ins farther than this from the property are flagged." |
| Geofence mode | rádio "Flag (recommended)" / "Block" | Block: "Inspectors outside the radius can't check in. Falls back to Flag when the property has no coordinates or the phone's GPS accuracy is worse than the radius. There is no per-job override: if a property's location is wrong, fix the property's address before the inspector tries again." (L-F03-08) |
| Time window tolerance | número (min), 0–240 | "Check-ins this many minutes before or after the booked window are not flagged. Out-of-window check-ins are never sent to the tenant." |
| Completion reminder | switch "Send a reminder to the inspector" | – |
| Remind after window end | número (min), 0–720, desabilitado se o switch estiver desligado | "If the job isn't checked out by the end of the window plus this time, the inspector gets one reminder." |
- Botões "Save changes" (desabilitado sem alterações ou com erro) e "Discard changes"; texto "Changes apply within a minute."
- Acessibilidade: rótulos visíveis, `aria-describedby` para ajuda e erro, rádios em `fieldset/legend`, foco no primeiro campo com erro após 400.

### Casos de borda
- **Appointment sem execução e sem eventos:** bloco com estado vazio; card ausente.
- **Reofertado depois do "Não consigo fazer":** card continua (histórico do último impedimento) e o bloco mostra a execução reiniciada pelo novo inspetor + os eventos antigos.
- **Rejeição depois do check-in:** linha "Check-in abandoned" e chip "Abandoned".
- **Imóvel sem coordenadas:** "Property has no coordinates" no lugar da distância; sem chip de raio.
- **Precisão ruim:** mostra "±350 m"; o chip de raio aparece se a flag estiver gravada.
- **CL:** nenhuma coordenada no DOM nem no payload (o backend já remove; o componente não depende disso para esconder o link).
- **INSP:** não acessa o web de detalhe (rota já protegida).
- **Código de motivo novo no futuro:** humanizado pelo `formatReasonCodeLabel`.
- **Setting em default:** badge "Default"; salvar grava a linha.
- **Dois operadores editando ao mesmo tempo:** o último a salvar vence (D18, aceito).
- **Portal aberto antes do "Não consigo fazer":** o inquilino que tenta escolher um grupo recebe o 409 do `join-group`; a página recarrega e mostra o banner novo.
- **Portal depois da reoferta pela OP:** status sai de REJECTED → `canChangeTime` volta a `true` e o portal segue o fluxo normal.

### Fora do escopo
- Telas de dashboard existentes (D11) e o Dia ao Vivo (F05).
- Seções de settings de outras features (F04/F05/F07/F08/F10).
- Filtro por código de motivo na lista (não existe; ver Achados).
- Mapa embutido ou link externo de mapa no bloco.

### Critérios de aceite
- **00.A3 (web):** check-in, check-out e "Não consigo fazer" aparecem no detalhe web com data, hora e inspetor; o card com o motivo aparece no detalhe e no modal do mapa só quando existe.
- **03.A2 (web):** a flag "Outside geofence" aparece no bloco de execução; o modo SINALIZAR/BLOQUEAR é configurável por AM/OP.
- CL vê distância e flags sem coordenadas cruas.
- `INSPECTOR_UNABLE` aparece humanizado na tabela, no export e no mapa, e não é oferecido no diálogo manual.
- O portal do inquilino não oferece novo horário para um appointment rejeitado pelo inspetor (teste 10 e e2e `portal-inspector-unable`).

### Dependências
- TASK-F03-1 e TASK-F03-2 mergeadas (api-types regenerados).
- Coordenar com a TASK-X01-1 (mesmo `Sidebar.tsx`): rebase simples, o item novo fica no grupo "Configuration", que a X01 não altera.

### Riscos e armadilhas
- **Telas de dashboard:** não importar nada novo em `DashboardPage`/`AnalyticsPage`/`InspectorWorkloadPage`.
- **Response schema:** se o web não vê `inspectorIssue`, conferir o schema de resposta (TASK-F03-2), não o front.
- **Cache de typecheck incremental mente** (`project_web_typecheck_incremental_cache_lies`): rodar typecheck limpo.
- **Popup do mapa fecha modais da página** (`project_map_popup_outside_click_kills_page_modals`): o card compacto não abre modal próprio.

### Deploy / rollout / rollback
- **Ordem:** depois do backend das TASK-F03-1/2. Independente do PWA.
- **Rollout:** deploy do web; a página de settings fica visível para AM/OP imediatamente.
- **Rollback:** reverter o web; backend segue compatível.
- **Observabilidade:** nenhuma nova no cliente; mudanças de setting já são auditadas no servidor.

### Dias · Branch · Verificação
- **2,0 dias** (00.A3 1,0 · 00.7c web 0,25 · `INSPECTOR_UNABLE` nos rótulos/diálogo/mapa (parte web do 00.7b) 0,25 · página "Platform settings" = "tela" do B6 0,25 · lacunas 2026-10-29 0,25: portal do inquilino (L-F03-01) e "(current inspector)" (L-F03-09)).
- Branch: `feat/f03-field-activity-web` a partir de `develop`.
- Verificação: `pnpm --filter @properfy/shared build`; `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`; e2e dos 4 specs; QA do portal do inquilino com um link real depois de um `cant-do` em ambiente local; QA no navegador com AM, OP, CL_ADMIN e CL_USER (`feedback_test_portals_each_session`); ≤ 150 arquivos.

---

## Contratos exportados para outras features

Consumidores: **F04** (ações no card, `PlatformSetting`, STALE do plano), **F05** (exceções e "Needs attention", limites no `PlatformSetting`), **F07** (índice: eventos, flags, aviso antecipado), **F09** (densidade), **F08/F10** (`PlatformSetting`).

### 1. `PlatformSetting` (nasce na TASK-F03-1)
- **Tabela:** `platform_settings(id uuid, key varchar(100) unique, value_json jsonb, updated_by_id uuid null → users, created_at, updated_at)`. Sem `tenant_id` (exceção ao §7.1 registrada em cada spec).
- **Registro tipado (shared):** `packages/shared/src/schemas/platform-settings.ts` — `PLATFORM_SETTINGS_REGISTRY`, `PlatformSettingKey`, `PlatformSettingValue<K>`, `resolvePlatformSettingValue`, `isPlatformSettingKey`, `platformSettingResponseSchema`, `platformSettingsListResponseSchema`, `updatePlatformSettingSchema`.
- **Como uma feature acrescenta configuração:** criar **uma chave nova** no registro (`{ schema, defaults, section }`), com defaults completos; `section` é o **rótulo de exibição** da seção, igual ao título da `FormSection` web (ex.: `'Field events'`, `'Tenant arrival notices'` da F06; L-F06-10); acrescentar a seção na página web `features/platform-settings/pages/PlatformSettingsPage.tsx` usando `usePlatformSetting(key)`. Não reaproveitar chaves de outra feature.
- **Leitura no backend:** porta `IPlatformSettingsReader.get(key)` em `apps/backend/src/shared/domain/platform-settings.ts`, implementada por `PlatformSettingsService` (`apps/backend/src/modules/platform-settings/application/platform-settings.service.ts`), cache por instância de **30 s**; valor inválido → defaults + log de erro.
- **API:** `GET /v1/platform-settings`, `GET /v1/platform-settings/:key`, `PUT /v1/platform-settings/:key` (AM/OP), audit `platform_setting.updated`.
- **Chave da F03:** `fieldEvents = { geofenceRadiusMeters (300), geofenceMode ('FLAG'|'BLOCK', 'FLAG'), checkInWindowToleranceMinutes (15), completionReminderEnabled (true), completionReminderMinutesAfterWindowEnd (30) }` — todos valores de onboarding (D17).
- **Concorrência:** `PUT` é último-vence (D18).
- **Evento de gravação (L-F03-10):** `PLATFORM_SETTING_EVENTS.UPDATED = 'platform_setting.updated.v1'` (`domain-event-bus.ts`), payload `{ key, before, after, actorId, occurredAt }`, emitido após o commit. Features que precisam reagir a mudança de setting (F07 pesos, F04 `routeWeights`) **assinam** este evento em vez de alterar o `UpdatePlatformSettingUseCase`. Outras instâncias continuam com cache de até 30 s.
- **Ganchos de save (D30, L-F08-08):** `PLATFORM_SETTING_SAVE_HOOKS` (`apps/backend/src/modules/platform-settings/application/platform-setting-save-hooks.ts`, backend) mapeia chave → `(previous, next, now) => value`, aplicado depois da validação e antes da escrita/audit/evento. Uma feature que precisa derivar um campo na gravação (F08: `inspectorProgram.earlyAccess.enabledAt`) **registra uma entrada** no mapa; não altera o use case.

### 2. `InspectorFieldEvent` (nasce na TASK-F03-2)
- **Tabela:** `inspector_field_events(id, appointment_id, inspector_id, tenant_id, type InspectorFieldEventType {CANT_DO, LATE_NOTICE}, reason_code varchar(50), note text null, minutes int null, latitude/longitude decimal(10,7) null, accuracy_m decimal(10,2) null, client_occurred_at timestamp null, created_at)`. Imutável. Índices: `(appointment_id, type, created_at desc)`, `(inspector_id, created_at)`, `(tenant_id, created_at)`, `(type, created_at)`.
- **Enums/rótulos (shared):** `packages/shared/src/enums/field-events.ts` — `InspectorFieldEventType`, `FieldIssueReason`, `FIELD_ISSUE_REASON_LABELS`, `FIELD_ISSUE_NOTE_REQUIRED_REASONS`, `LateNoticeReason`, `LATE_NOTICE_REASON_LABELS`, `LATE_NOTICE_MINUTES_OPTIONS`, `GeofenceMode`.
- **Schemas (shared):** `packages/shared/src/schemas/field-events.ts` — `cantDoRequestSchema`, `lateNoticeRequestSchema`, respostas, `inspectorIssueSchema`, `fieldEventItemSchema`, `executionSummarySchema`, `appointmentFieldActivityResponseSchema`.
- **Porta de leitura (backend):** `IInspectorFieldEventRepository` em `apps/backend/src/modules/inspector-execution/domain/inspector-field-event.repository.ts` — `findLatestCantDoByAppointmentIds(ids)`, `findLatestCantDoByAppointmentId(id)`, `listByAppointmentId(id, limit)`. Consultas de agregação para F05/F07 (ex.: "último `LATE_NOTICE` por appointment do dia", "contagem de `CANT_DO` por inspetor no período") devem ser **acrescentadas a esta porta** pela feature consumidora, sempre filtrando por `created_at` com os índices acima.
- **Evento de domínio:** `INSPECTOR_FIELD_EVENTS.RECORDED = 'inspector_field_event.recorded.v1'` (`apps/backend/src/shared/application/events/domain-event-bus.ts`), payload `{ eventId, type, appointmentId, tenantId, inspectorId, reason, minutesLate: number | null, estimatedArrivalAt: string | null, occurredAt }` (`estimatedArrivalAt` só em `LATE_NOTICE`). F04 usa (junto de `APPOINTMENT_EVENTS.STATUS_TRANSITION`) para marcar o `DayPlan` como STALE; F05 para "Needs attention"; F06 para o aviso ao inquilino (LATE_NOTICE).
- **Endpoints de escrita:** `POST /v1/inspector/appointments/:id/cant-do`, `POST /v1/inspector/appointments/:id/late-notice` (INSP, `Idempotency-Key` obrigatório, nunca na fila offline).
- **Semântica do `LATE_NOTICE` (L-F03-04, D23 revisada em 2026-10-29):** `minutes` = atraso estimado em relação à **ETA publicada** da parada (`published_service_start_at`) quando existe plano publicado, senão ao **início da janela combinada** (`timeSlotStart`); `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutes` (função pura `computeEstimatedArrivalAt(reference, effectiveNoticeAt, minutes)` em `apps/backend/src/modules/inspector-execution/domain/late-notice.ts`, para quem lê a tabela). Só aceito no dia, antes do check-in. F05/F06/F07 usam `estimatedArrivalAt`; não reinterpretam `minutes` contra a ETA do roteiro.
- **Lembrete de conclusão (L-F03-03):** avisos `COMPLETION_REMINDER` têm `dedupe_key = completion-reminder:{appointmentId}:{civilDate}:{inspectorId}`; prefixo em `COMPLETION_REMINDER_DEDUPE_PREFIX` (`packages/shared/src/constants/inspector-notices.ts`). A F05 deriva o alerta "lembrete disparado" por esse prefixo. Título/corpo sem dado sensível (tela bloqueada) e SMS sujeito ao teto `INSPECTOR_NOTICE_SMS_DAILY_CAP` da F02 (D12, L-F02-07/01).
- **Portal (L-F03-01):** `isPortalChangeTimeBlocked` em `rental-tenant-portal/domain/portal-statuses.ts`; `portalDataResponseSchema.appointment.canChangeTime`. Qualquer feature que mexa no "change time" do portal (ex.: F06) respeita a regra.

### 3. Flags e campos de execução (TASK-F03-1/2)
- `inspection_executions`: `start_accuracy_m`, `finish_accuracy_m`, `start_client_at`, `finish_client_at`, `finish_geolocation_distance_meters`, `out_of_radius`, `out_of_window`, `finish_out_of_radius`, `geofence_radius_m`, `abandoned_at`. Índices `(out_of_radius, started_at)` e `(out_of_window, started_at)`.
- **Regra para consumidores:** execução com `abandoned_at` **não** conta como iniciada nem como concluída. F07: "pontualidade" usa `out_of_window` de execuções **não abandonadas**. "Aviso antecipado" e a regra de antecedência do `CANT_ATTEND` são definidos pela **F07** (P4 e L1 de `F07-tarefas.md`; superam a regra antiga "compara `LATE_NOTICE.created_at` com o início do slot", L-F07-01): o horário efetivo do evento vem de `resolveEffectiveEventTime(client_occurred_at, created_at)` desta feature, com a janela de plausibilidade da D25 (−7 dias / +5 min); `CANT_ATTEND` com aviso efetivo antes de `windowStartAt − 24 h` é aviso antecipado na F07. A F03 não grava nada disso; só fornece os campos e a função.
- **`geofence_radius_m` (L-F03-05):** preenchido em **todo** check-in pós-F03 (inclusive sem coordenadas do imóvel, com fallback e no reinício). `NULL` significa exclusivamente "execução anterior à F03" — é o marcador que F05/F07/F09 podem usar.
- **`out_of_window` (L-F03-06):** avaliado com `start_client_at` quando plausível (−7 dias / +5 min), com o horário do servidor quando o cliente não mandou horário (item antigo) e **sempre `false`** quando o horário do cliente era implausível (audit `inspection.started` com `metadata.windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'`). Nunca é `true` sem evidência; consumidores usam a flag tal como gravada.
- **Audits de exceção:** `inspection.geolocation_mismatch` (`phase START|FINISH`), `inspection.check_in_blocked`, `inspection.completion_reminder_sent`. Audits novos não carregam coordenadas do inspetor; `GET /v1/audit-logs` mascara chaves de coordenada para CL (`maskCoordinateKeys`, `apps/backend/src/modules/audit/domain/mask-coordinate-keys.ts`) — features futuras que gravem coordenadas em audit herdam a máscara se usarem os nomes de chave da lista.
- **Domínio puro reusável:** `evaluateGeofence`, `isOutOfCheckInWindow`, `resolveEffectiveEventTime` em `apps/backend/src/modules/inspector-execution/domain/`.

### 4. `inspectorIssue` (TASK-F03-2)
- Campo em `appointmentResponseSchema` (`packages/shared/src/schemas/responses.ts`), presente em `GET /v1/appointments/:id` e em cada item de `GET /v1/appointments`: `{ reason: string; note: string | null; inspectorId?: string | null; inspectorName: string | null; occurredAt: string } | null`, vindo do **último** `CANT_DO` do appointment, persistente após reoferta.
- Componente web reusável: `apps/web/src/features/appointments/components/InspectorIssueCard.tsx` (variantes `full`/`compact`, prop `currentInspectorId`) — F05 pode reusá-lo no painel do Dia ao Vivo.
- No app do inspetor: `lastFieldIssue` em `GET /v1/inspector/appointments/:id`, só para o autor do último `CANT_DO` (L-F03-09).

### 5. Código de rejeição
- `RejectionReasonCode.INSPECTOR_UNABLE` e `SYSTEM_ONLY_REJECTION_CODES` (`packages/shared/src/enums/reason-codes.ts`). Recusado para atores humanos no `ExecuteStatusTransitionUseCase` (`REJECTION_REASON_CODE_SYSTEM_ONLY`).
- **Extensão pela F07 (L-F07-01, L-F07-04):** a TASK-F07-1 acrescenta `INSPECTOR_NO_SHOW` e `NOT_EXECUTED` (total 11) e `allowedRejectionCodesFrom(fromStatus)`, que respeita `SYSTEM_ONLY_REJECTION_CODES`. As regras da F03 olham **códigos específicos** e não mudam com os novos: o bloco `rejectedByInspector` do e-mail à agência só com `INSPECTOR_UNABLE`; o bloqueio do "change time" do portal só com código em `SYSTEM_ONLY_REJECTION_CODES`; o `StatusTransitionDialog` remove `SYSTEM_ONLY_REJECTION_CODES` depois do filtro por origem da F07.
- **Origens de transição (D2, D31, L-F06-04):** `metadata.source` do `appointment.status_transition` usa as constantes de `packages/shared/src/constants/transition-sources.ts`: `TRANSITION_SOURCE_INSPECTOR_CANT_DO` (F03) e `TRANSITION_SOURCE_INSPECTOR_FINISH` (acrescentada pela TASK-F06-2, passada pelo `FinishInspectionUseCase` no `auditMetadata`).
- `INSPECTION_REJECTED_AGENCY` ganha a variável opcional `rejectedByInspector` (L-F03-07); o payload é montado com `inspectorName` do último `CANT_DO` quando o código é `INSPECTOR_UNABLE`.
- `ExecuteStatusTransitionInput.auditMetadata` (opcional) para atribuir uma transição SYS ao humano que a disparou; `ExecuteStatusTransitionInput.expectedStatus` (opcional, CAS → 409 `APPOINTMENT_STATUS_CHANGED`).
- Lock de appointment: `IInspectorFieldEventRepository.lockAppointmentForFieldEvent(id, tx)` — qualquer feature que escreva no appointment junto com execução/eventos (ex.: F04) deve pegar este lock **primeiro**, na mesma ordem.

---

## Achados para revisão

Fechados em 2026-10-28 pelo dev: nota compartilhada com a agência (D14); BLOCK só no check-in (D15); fila offline em BLOCK (D16); valores de onboarding e limitação da meia-noite (D17); gate do PWA e último-vence nos settings (D18). O link externo de mapa saiu do escopo.

1. **Retorno da OP sobre "Não consigo fazer" (F02 × F03).** A F02 (Q16) lista como aviso crítico o "retorno da OP sobre 'Não consigo fazer' (F03)". Com a Q1 decidida como liberação automática, a F03 não tem esse retorno: o app só confirma "Sent to operations…". Decidir se a F02 tira o item da lista ou se a OP usa um aviso manual crítico (já coberto pela F02).
2. **Filtros por motivo não existem.** O plano pede `INSPECTOR_UNABLE` "nos filtros de motivo do web (lista, exportação, board)". Não há filtro por código de motivo na lista nem no board, e o board não exibe o código. Os lugares reais são: enum + teste (shared), `statusTransitionSchema` (openapi/api-types), guarda no `ExecuteStatusTransitionUseCase`, `StatusTransitionDialog` (excluir), coluna "Cancellation Reason" da `AppointmentTable`, coluna do export e banner do `AppointmentMapDetailPanel`. Criar um filtro seria escopo novo (estacionamento).
3. **Audits legados com coordenadas.** A máscara resolve a leitura por CL, mas `inspection.started`/`inspection.finished`/`geolocation_mismatch` START continuam **gravando** lat/lng do inspetor (visíveis para AM/OP e sujeitos à retenção de audit). Parar de gravar mudaria audits existentes fora do escopo da F03; avaliar junto da política de retenção/erasure (feature 020).

---

## Ajustes necessários em outras tarefas (para reconciliar)

- `tarefas/F05-tarefas.md` — usar `COMPLETION_REMINDER_DEDUPE_PREFIX` (shared) para derivar o alerta "lembrete disparado" e considerar o novo formato `completion-reminder:{appointmentId}:{civilDate}:{inspectorId}`; por quê: L-F03-03.
- `tarefas/F05-tarefas.md` — projetar o atraso pelo `estimatedArrivalAt` do `LATE_NOTICE` (evento/resposta ou `computeEstimatedArrivalAt`) em vez de somar `minutesLate` à ETA; `OUT_OF_WINDOW` nunca vem de horário implausível (`windowSkipped`); `geofence_radius_m` nulo só em execuções pré-F03; por quê: L-F03-04, L-F03-05, L-F03-06.
- `tarefas/F06-tarefas.md` — o aviso de atraso ao inquilino deve usar `estimatedArrivalAt` (referência = `published_service_start_at` da parada publicada, senão início da janela; D23 revisada, resolvido 2026-10-29) e não reinterpretar `minutesLate`; e o "change time" do portal fica bloqueado para REJECTED/`INSPECTOR_UNABLE` (`isPortalChangeTimeBlocked`, `canChangeTime`); por quê: L-F03-04, L-F03-01.
- `tarefas/F07-tarefas.md` — assinar `platform_setting.updated.v1` para recalcular o snapshot em vez de alterar `update-platform-setting.use-case.ts`; tratar `geofence_radius_m IS NULL` só como "pré-F03" (todo check-in pós-F03 tem raio); `out_of_window` já vem `false` em sincronização tardia implausível; P4 pode usar `estimatedArrivalAt`; por quê: L-F03-10, L-F03-05, L-F03-06, L-F03-04.
- `tarefas/F04-tarefas.md` — se precisar reagir a mudança de `routeWeights`, assinar `platform_setting.updated.v1`; o payload de `INSPECTOR_FIELD_EVENTS.RECORDED` ganha `estimatedArrivalAt`; por quê: L-F03-10, L-F03-04.
- `tarefas/F02-tarefas.md` — o `COMPLETION_REMINDER` da F03 tem dois textos e `dedupeKey` com `inspectorId`; confirmar que `PublishSystemInspectorNoticeOutput` expõe `created` e `noticeId` (a F03 só audita com `created === true`) e que `packages/shared/src/constants/inspector-notices.ts` é o lugar da constante de prefixo; por quê: L-F03-03.
- (encaminhado) `tarefas/X02-tarefas.md` (e `README.md`/rollout) — registrar que ligar o geofence BLOCK da F03 depende da X02 em produção e de uma auditoria de geocodificação dos imóveis ativos; por quê: L-F03-08.
- (resolvido 2026-10-29) `tarefas/F04-tarefas.md` — a TASK-F04-2 liga o adaptador real de `IPublishedStopStartReader` (lê `day_plan_stops.published_service_start_at` do plano publicado do inspetor) no lugar do stub `null` da F03; `tarefas/F07-tarefas.md` — P4 inalterada (R7). Por quê: D23 revisada pelo dev em 2026-10-29.
