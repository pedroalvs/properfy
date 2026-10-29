# F02 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | F02 · Avisos da operação + Web Push + fallback SMS (contrato 00.6, 00.9; critérios 00.A2, 00.A4) |
| **Total** | **10,25 dias** (plano: 8,25; ajustes justificados abaixo: +0,5 em 2026-10-28, +1,5 pelas lacunas em 2026-10-29) |
| **Tarefas / PRs** | 3 (backend+shared → web → pwa) |
| **Depende de** | TASK-F01-1 mergeada (colunas `push_enabled`/`app_*` em `inspectors`, `POST /v1/inspectors/me/app-state`, use case `record-inspector-app-state`); TASK-F01-2 (coluna/tooltip "Push" no web) para a TASK-F02-2; TASK-F01-3 (slot `push-preference-slot` em `/profile/settings`, `__APP_VERSION__`, `getIsStandalone()` exportada) para a TASK-F02-3; TASK-X01-1 (grupo "Dashboard" no menu, `BackButton`/`PageHeader backTo`) para a TASK-F02-2 |
| **Bloqueia** | F03 (lembrete de conclusão, retorno sobre "Não consigo fazer"), F04 (aviso de roteiro publicado/alterado, card de não lidos na tela Today), F08 (mensagens automáticas não críticas) |
| **Código verificado em** | snapshot de `origin/develop` @ `042a9674` (2026-10-27) |

**Ajuste de estimativa: 8,25 → 8,75 → 10,25 dias.** O escopo não foi cortado. Em 2026-10-28 entraram os dois acréscimos reais (varredura e ressincronização); registro do template, redefinição de `push_enabled` e API de aviso de sistema já estavam custeados nos itens do plano (00.9b, 00.9a e 00.6a) e foram reabsorvidos neles. Em 2026-10-29 entraram as 11 lacunas de `lacunas/F02-lacunas.md` (todas as recomendações aceitas pelo dev): +1,0 no backend, +0,25 no web, +0,25 no PWA. As lacunas pequenas (L-F02-05, 07, 08, 09, 10) foram absorvidas nos passos existentes. Na reconciliação com as outras tarefas (2026-10-29) entraram ajustes pequenos, todos absorvidos nos passos existentes, sem mudar o total: leitura `hasRecentSystemNotice` para a F08 (L-F08-06), heartbeat em instrução SQL única da F01 (L-F01-02), `cacheableResponse: [200]` nos 2 caches de API do PWA + bloco P08 do `apps/pwa/CLAUDE.md` (L-X00-10), posição canônica no menu e regra de fallback do Back (L-X01-02/03/08), stubs do boot no e2e do PWA (L-X03-05) e confirmações de testes da F01/F03/F08 (L-F01-04/08/12, L-F03-03, L-F08-09).

| Item | Plano | Agora | Motivo |
|---|---|---|---|
| TASK-F02-1 (backend+shared: 00.6a + backend do 00.9a + 00.9b) | 4,0 (1,75 + ~1,25 + 1,0) | 5,25 | +0,25: varredura de segurança `inspector-notice.delivery-sweep` a cada 5 min (decisão do dev, 2026-10-28, nº 2). +0,25: varredura também recupera entrega iniciada e não concluída, `delivery_completed_at`, `expireInMinutes` pelo volume e janela noturna da varredura (L-F02-03, L-F02-02). +0,25: teto diário de SMS da plataforma + warn de burst (L-F02-01). +0,25: revogação por 401/403, `failure_count` e revogação ao desativar inspetor (L-F02-04, L-F02-11). +0,25: job `inspector-notice.auto-archive` (30 dias, sistema) + purga de assinaturas revogadas (90 dias) (L-F02-06). |
| TASK-F02-2 (web: 00.6b) | 1,5 | 1,75 | +0,25: ConfirmDialog de crítico com o tamanho do público e o aviso de horário noturno, hint de tela bloqueada, chips "Inactive"/"No app access" no detalhe (L-F02-01, 02, 07, 09). |
| TASK-F02-3 (pwa: 00.6c + PWA do 00.9a + QA) | 2,75 (1,0 + ~1,75) | 3,25 | +0,25: ressincronizar a assinatura no início do app (`PwaLayout`) e tratar `pushsubscriptionchange` no `sw.ts` (revisão 2026-10-28, nº 8). +0,25: reassinar quando a chave VAPID do servidor muda e precedência fixa dos estados do controle (L-F02-04, L-F02-05). |
| **Total** | **8,25** | **10,25** | |

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F02-1 | Backend + shared: avisos, destinatários, assinaturas de push, envio Web Push, fallback SMS, varredura, teto de SMS, arquivamento automático e API de aviso de sistema | 5,25 | TASK-F01-1 |
| TASK-F02-2 | Web (AM/OP): página "Inspector notices" (lista, novo aviso, detalhe com leituras, arquivar) | 1,75 | TASK-F02-1; TASK-X01-1; TASK-F01-2 |
| TASK-F02-3 | PWA: `sw.ts` (injectManifest + push), controle e ressincronização do push, caixa "Announcements" com badge + QA | 3,25 | TASK-F02-1; TASK-F01-3; TASK-F02-2 só para o QA ponta a ponta |

## Decisões que valem para as 3 tarefas

D1-D12 são de **2026-10-27** (quadro "Decisões tomadas" do F02, decisão Q16 em `decisoes.md`, e decisões da F01/X01). D2-a e D13-D16 são de **2026-10-28** (decisões do dev e revisão). D17-D27 são de **2026-10-29** (lacunas `L-F02-01` a `L-F02-11`, todas as recomendações aceitas); o texto completo de cada uma está no "Decisões aplicáveis" da tarefa que a implementa. Cada tarefa referencia as que se aplicam pelo código.

- **D1 · O que é crítico (Q16):** lista fixa + marcação. Do sistema: roteiro publicado ou alterado (F04), retorno da OP sobre "Não consigo fazer" (F03) e lembrete de conclusão (F03). Além desses, os avisos manuais que a OP marcar como críticos. Desafios e mensagens de desempenho (F08) **nunca** são críticos.
  - *Revisão 2026-10-28:* a fonte "retorno da OP sobre 'Não consigo fazer'" deixou de existir com a Q1 (o inspetor libera direto, REJECTED via SYS com `INSPECTOR_UNABLE`). Por isso **não há** tipo de sistema para ela. Os tipos críticos de sistema são `ROUTE_PUBLISHED`, `ROUTE_CHANGED` (F04) e `COMPLETION_REMINDER` (F03).
- **D2 · Quando o SMS sai:** **na hora**, só para quem não tem push ativo ou teve o push recusado (404/410). Sem job de "não leu em X min".
- **D2-a · Falha de push em crítico (dev, 2026-10-28):** um aviso **crítico** cujo push falha por **qualquer** motivo (404/410, 429, 5xx, timeout, rede) também dispara o SMS. Regra efetiva: **crítico e nenhum push `SENT` para o inspetor → SMS**. Não crítico continua sem SMS (D5).
- **D3 · Público dos avisos manuais:** todos os ativos / seleção manual / uma região (via `InspectorRegion`).
- **D4 · Depois de publicado:** não se edita nem se exclui; só se arquiva. Arquivado sai da caixa do inspetor e continua no histórico da OP e na auditoria. Para corrigir, publica-se outro aviso.
- **D5 · Preferência do inspetor:** só o controle de push (decisão F01 D8). Nunca SMS para não críticos.
- **D6 · Push não é canal de template:** não adicionar `PUSH` ao `NotificationChannel` (evita mexer no teste que proíbe `IN_APP` e no catálogo de templates).
- **D7 · SMS via pipeline existente:** template de plataforma `INSPECTOR_NOTICE_SMS`, classe TRANSACTIONAL, `tenantId = null`, via `CreateNotificationUseCase` (retry, polling de entrega e log vêm de graça).
- **D8 · RBAC:** publicar avisos e ver leituras = AM/OP; ler e marcar como lido = INSP (os próprios).
- **D9 · Multi-tenant:** `InspectorNotice`, `InspectorNoticeRecipient` e a assinatura de push **não têm `tenant_id`** (o inspetor é cross-tenant; precedente: `Inspector`, `ServiceRegion` global, `IntegrationSetting`). **Exceção explícita ao §7.1 do CLAUDE.md**, registrada em cada spec. O escopo de acesso é dado por papel (AM/OP, plataforma) e por `inspector_id` do JWT (INSP).
- **D10 · `push_enabled` (F01 D9):** a F02 redefine: passa a significar "existe ao menos uma assinatura de push ativa (não revogada) para o inspetor", mantido pelo backend; o heartbeat deixa de escrevê-lo.
- **D11 · Entrada do PWA:** a caixa fica em `/profile` hoje e move para "More" em F04. Sem avisos fixados ("Pinned" do design não é construído).
- **D12 · Menu web (X01):** a F02 acrescenta o filho **"Inspector notices"** (AM/OP) ao grupo "Dashboard". Telas de dashboard existentes não são alteradas.
- **D13 · Varredura de segurança (dev, 2026-10-28):** a cada 5 min, um job reenfileira a entrega dos avisos publicados sem tentativa de entrega depois de 2 min. Idempotente pela deduplicação existente (`singletonKey`, `delivery_processed_at`, id determinístico do SMS).
- **D14 · Selo na aba Profile (dev, 2026-10-28):** aceito. O selo de não lidos aparece no tile "Announcements" e na aba Profile da barra inferior.
- **D15 · Destino do toque (revisão, 2026-10-28):** o aviso de sistema pode ter um `targetPath` opcional, validado contra uma allowlist compartilhada: `/profile/announcements/:id` (padrão) e `/schedule/:id`. A F04 acrescenta `/today`. O `resolveClickTarget` do SW usa a **mesma** constante. Avisos manuais sempre usam o padrão.
- **D16 · Idempotência da publicação manual (revisão, 2026-10-28):** `Idempotency-Key` obrigatória, verificada **dentro** da transação com lock e gravada com `set(..., tx)` (padrão da F03), para que dois POSTs concorrentes não criem dois avisos.
- **D17 · Teto de SMS da plataforma (L-F02-01, 2026-10-29):** teto diário `INSPECTOR_NOTICE_SMS_DAILY_CAP` (padrão 500), warn de burst (≥ 20 SMS num aviso) e o tamanho do público no ConfirmDialog de crítico. Detalhe na TASK-F02-1 e na TASK-F02-2.
- **D18 · Sem janela de silêncio (L-F02-02, 2026-10-29):** push e SMS saem na hora a qualquer hora; o ConfirmDialog avisa quando são 21:00-07:00 em Sydney; a varredura não reenfileira entre 22:00 e 06:00 Sydney; `sydneyHour` no log de entrega.
- **D19 · Entrega incompleta é recuperada (L-F02-03, 2026-10-29):** `delivery_completed_at`; a varredura também reenfileira entrega iniciada há ≥ 20 min e não concluída; `expireInMinutes` dimensionado pelo volume.
- **D20 · Assinatura com falha permanente (L-F02-04, 2026-10-29):** 401/403 revogam (`REJECTED`); `failure_count >= 5` revoga (`FAILED`); o PWA reassina quando a chave VAPID do servidor muda.
- **D21 · Precedência dos estados do controle de push (L-F02-05, 2026-10-29):** `ios-needs-install` → `unsupported` → `blocked` → `unavailable` → `on`/`off`.
- **D22 · Retenção (L-F02-06, 2026-10-29):** avisos **de sistema** são arquivados automaticamente após 30 dias (`INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS`); manuais não; assinaturas revogadas há mais de 90 dias são apagadas.
- **D23 · Conteúdo do push é público (L-F02-07, 2026-10-29):** corpo completo no push; hint no drawer e regra para consumidores: nada de chaves, códigos de acesso ou dados do inquilino no título/corpo.
- **D24 · Casamento da allowlist (L-F02-08, 2026-10-29):** algoritmo exato, segmento a segmento, UUID minúsculo, sem barra final, ≤ 200 chars.
- **D25 · Destinatários inativos/sem login (L-F02-09, 2026-10-29):** "All" continua incluindo ACTIVE sem login; o detalhe traz `inspectorStatus` e `hasAppAccess` por destinatário.
- **D26 · Arquivar durante a entrega (L-F02-10, 2026-10-29):** o job relê `archived_at` a cada lote e para.
- **D27 · Desativar revoga o push (L-F02-11, 2026-10-29):** `DeactivateInspectorUseCase` revoga as assinaturas ativas (`DEACTIVATED`) e recomputa `push_enabled`.

---

## TASK-F02-1 · Backend + shared: avisos, destinatários, assinaturas de push, envio Web Push, fallback SMS e API de aviso de sistema

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F01-1
> - **Desbloqueia:** TASK-F02-2, TASK-F02-3, TASK-F04-2, TASK-F05-1, TASK-F08-4
> - **Pode rodar em paralelo com:** TASK-F03-2, TASK-F01-2, TASK-F01-3, TASK-F03-3, TASK-F03-4, TASK-F04-1, TASK-F09-1, TASK-F09-2
> - **Pista sugerida (time de 6):** B · Backend de integração

### Objetivo
- Criar o domínio de avisos ao inspetor: publicar (manual AM/OP e de sistema), arquivar, listar com contagem de lidos, detalhe com nomes, caixa do inspetor e marcar lido.
- Criar o registro de assinaturas Web Push por dispositivo, as rotas de assinar/desassinar e a configuração VAPID.
- Entregar cada aviso publicado por um job: push para quem tem assinatura ativa; SMS imediato (template de plataforma TRANSACTIONAL) só para avisos **críticos** e só para quem não recebeu nenhum push com sucesso (sem assinatura, ou push recusado/falho por qualquer motivo, D2-a).
- Reenfileirar, por uma varredura a cada 5 min, os avisos cuja entrega não começou (D13) ou começou e não terminou (D19).
- Limitar o custo do SMS da plataforma com um teto diário (D17), revogar assinaturas com falha permanente ou de inspetor desativado (D20, D27) e arquivar automaticamente avisos de sistema antigos (D22).
- Expor um contrato interno estável (`PublishSystemInspectorNoticeUseCase`) para F03, F04 e F08.

### Contexto no código
Caminhos relativos à raiz do monorepo.

- **Canais:** `apps/backend/prisma/schema.prisma:1053` `enum NotificationChannel { EMAIL SMS }`. `packages/shared/src/enums/notification.test.ts:18-19` garante `!('IN_APP' in NotificationChannel)`. Não se altera (D6).
- **Notification:** `schema.prisma:1300` `model Notification` é log de entrega (`tenant_id String?`, NULL = plataforma). Sem estado de leitura.
- **Criação de notificação:** `apps/backend/src/modules/notification/application/use-cases/create-notification.use-case.ts`.
  - `CreateNotificationInput { notificationId?, tenantId: string | null, appointmentId?, recipient, channel, templateCode, payloadJson: Record<string,string> }`.
  - Com `notificationId` informado usa `notificationRepo.saveIfAbsent` (idempotente: segunda chamada com o mesmo id não cria nem enfileira).
  - Resolve a classe pelo template do tenant e cai no default de plataforma (`findByTenantCodeChannel(null, code, channel)`); enfileira `notification.send` com `singletonKey = notificationId`.
- **Pipeline de envio:** `.../use-cases/send-notification.use-case.ts` (980 linhas): template (`TEMPLATE_NOT_FOUND`/`TEMPLATE_INACTIVE` falham permanentemente, l. 503-538) → supressões (`getTemplateTarget(...) === 'RENTAL_TENANT'`, l. 617) → consentimento (TRANSACTIONAL faz bypass, l. 667) → orçamento diário (plataforma `tenantId === null` + TRANSACTIONAL é isento, l. 711-721) → `toE164Au` (`INVALID_RECIPIENT_PHONE`, l. 770) → render → `EMPTY_SMS_BODY` (l. 848) → dispatch.
- **Render de SMS:** `.../application/render-email-body.ts` faz Handlebars sobre `body_text`; `domain/template-renderer.service.ts:69` compila com `noEscape: false`, ou seja, `{{x}}` **escapa** `&`, `<`, `>`, `"`, `'` → `&amp;` etc. no texto do SMS. Texto livre da OP precisa de triple-stash `{{{message}}}`.
- **Tamanho de SMS:** `packages/shared/src/utils/sms-content.ts` (`SMS_MAX_CHARS_GSM7 = 1530`, `SMS_MAX_CHARS_UCS2 = 670`); `domain/sms-content.ts` `prepareSmsBody` trunca acima do limite.
- **ID determinístico:** `apps/backend/src/modules/notification/domain/agency-forward.ts:27` `getAgencyForwardNotificationId` (UUIDv5 via sha1 + namespace). Padrão a copiar.
- **Catálogo de templates (shared):** `packages/shared/src/constants/notification-templates.ts`:
  - `PLATFORM_ONLY_TEMPLATE_CODES` (l. 63-71), `PLATFORM_TEMPLATE_CODE_LABELS` (l. 173-181), `TEMPLATE_TARGETS` (l. 266-297, `Record` tipado sobre a união: único lugar que o compilador cobra), `PROTECTED_TEMPLATE_CLASSIFICATIONS` (l. 328-349), `TEMPLATE_VARIABLES` (l. 422+), `ALLOWED_VARIABLES` (l. 585-621), `SAMPLE_DATA` (l. 635+).
  - `SYSTEM_TEMPLATE_CODES` é identidade de **e-mail**; não se aplica a SMS.
- **Catálogo de plataforma (backend):** `apps/backend/src/modules/notification/domain/platform-notification-templates.ts` (`PLATFORM_TEMPLATES`, entradas SMS l. 534-581); `resolvePlatformTemplateClass(entry)` = `entry.notificationClass ?? getDefaultClass(code)`.
- **Sincronização no boot:** `apps/backend/src/main/server.ts:134` chama `syncPlatformTemplates` (`src/shared/infrastructure/template-startup-check.ts`): cria as linhas de plataforma que faltam a partir de `PLATFORM_TEMPLATES` com `notification_class: resolvePlatformTemplateClass(entry)`. O template novo nasce sozinho no deploy.
- **`prisma/seed.ts`** (l. 1-11): o comentário proíbe incluir códigos platform-only TRANSACTIONAL na lista inline (resolve classe só pelo código). **Não** adicionar o código novo lá.
- **Testes do catálogo:** `apps/backend/tests/unit/notification/platform-notification-templates.test.ts` (l. 359-378: todo código semeado declara target e label; piso `>= 25`); `tests/unit/notification/template-editor-catalogue-guard.test.ts` (todo editável tem seed e salva sem mudanças); `tests/unit/notification/sms-template-roundtrip.test.ts`.
- **Inspetor:** `schema.prisma:467` `model Inspector` (`status InspectorStatus` = `ACTIVE | INACTIVE`, `phone String? @db.VarChar(20)` em E.164, `user_id String? @unique`, `deleted_at`). Após a TASK-F01-1: `push_enabled Boolean?`, `app_last_seen_at`, etc.
- **Região:** `schema.prisma:1473` `ServiceRegion` (`tenant_id String?`, `name`, `status RegionStatus`), `schema.prisma:1510` `InspectorRegion(inspector_id, region_id)` PK composta, `@@index([region_id])`. `prisma-inspector.repository.ts:222` `findByRegionId(regionId)` já filtra `deleted_at: null` (não filtra status).
- **Auth/RBAC:** `request.authContext` tem `role` e `inspectorId` (`inspector.routes.ts:627-639`: INSP sem `inspectorId` → `ForbiddenError('INSP_ONLY', 'This endpoint is only accessible to inspectors')`). `src/shared/interfaces/role-guard.ts` `requireRoles(['AM','OP'])` → 403 `FORBIDDEN` "Insufficient permissions".
- **Erros:** `src/shared/domain/errors.ts`: `ValidationError` 400, `NotFoundError` 404, `ConflictError` 409, `UnprocessableEntityError` 422, `TooManyRequestsError` 429.
- **Auditoria:** `src/shared/domain/audit.ts` `AuditService.log({ action, actorType: 'USER'|'SYSTEM', actorId?, entityType, entityId?, tenantId?: string|null, before?, after?, reason?, requestId?, metadata? })`.
- **Idempotência:** `src/shared/domain/idempotency.service.ts` `IIdempotencyService.getWithHash<T>(key, scope, tx?)` e `set(key, scope, response, ttlHours, payloadHash?, tx?)` (o docblock avisa: chave gravada fora do `tx` sobrevive a um rollback e o retry lê um "sucesso" falso); hash do payload em `src/shared/domain/idempotency-payload-hash.ts`; transação com efeitos pós-commit em `src/shared/application/unit-of-work.ts:91` `runInTransaction(prisma, ({ tx, defer }) => ...)`; lock por chave com precedente `tx.$executeRaw\`SELECT pg_advisory_xact_lock(...)\`` (`src/scripts/provision-admin.ts:71`). Padrão a seguir: `ReportCantDoUseCase` da TASK-F03 (getWithHash → transação → reler no `tx` → escrever → `set(..., tx)`).
- **Paginação:** `src/shared/interfaces/response.ts` `paginated(data, total, page, pageSize)` devolve `{ data, pagination: { page, pageSize, total, totalPages } }`, sem campo extra (um `meta.unreadCount` seria descartado).
- **Jobs:** `src/shared/domain/job-queue.ts` `IJobQueue.enqueue(name, payload, { retryLimit, retryBackoff, singletonKey, expireInMinutes })`; workers em `src/main/workers.ts` (`boss.work(name, withJobMetrics(name, handler))`); `StubJobQueue` quando `ENABLE_JOB_QUEUE=false`.
- **Env:** `src/main/env.ts` (Zod; integrações opcionais com `console.warn` em staging/prod, l. 168-180).
- **Rotas/container:** `src/main/routes.ts` (`registerXRoutes(app, container.x)`), `src/main/container.ts` (`createNotificationUseCase` l. 747; `smsProvider` l. 1199).
- **OpenAPI/tipos:** `pnpm --filter backend generate:openapi` (gera `packages/shared/openapi.json`) e `pnpm --filter @properfy/shared generate:types` (gera `packages/shared/src/api-types.ts`).
- **Heartbeat (F01):** `apps/backend/src/modules/inspector/application/use-cases/record-inspector-app-state.use-case.ts` (criado na TASK-F01-1) grava `push_enabled = (pushPermission === 'granted')` por meio de `recordAppState()` do repositório (`prisma-inspector.repository.ts`), que é **uma única instrução SQL** via `prisma.$executeRaw` (CASE + COALESCE), não um `updateMany` (L-F01-02 da F01).
- **Nenhuma ocorrência** de `web-push`, VAPID ou `PushSubscription` no backend hoje.

### Decisões aplicáveis
D1, D2, D3, D4, D5, D6, D7, D8, D9, D10 (2026-10-27); D2-a, D13, D15, D16 (2026-10-28); D17, D18, D19, D20, D22, D23, D24, D25, D26, D27 (2026-10-29), com as regras abaixo:

- **2026-10-29 · L-F02-01 (D17) · Teto diário de SMS da plataforma.** O `INSPECTOR_NOTICE_SMS` é `tenantId = null` + TRANSACTIONAL e o pipeline o isenta do orçamento diário (`send-notification.use-case.ts:711-723`, `isPlatformTransactional`); a reserva por tenant da F06 também não o enxerga. Por isso a F02 tem teto próprio:
  - env `INSPECTOR_NOTICE_SMS_DAILY_CAP` (inteiro ≥ 0, padrão `500`; string vazia/`none` = sem teto);
  - checado no `DeliverInspectorNoticeUseCase` **antes** de cada `createNotification` de SMS, contando `notifications` com `tenant_id IS NULL`, `channel = 'SMS'`, `template_code = 'INSPECTOR_NOTICE_SMS'`, `created_at >= início do dia em Sydney` (método novo `countByTemplateChannelSince(null, 'INSPECTOR_NOTICE_SMS', 'SMS', since)` no `INotificationRepository`, mesma exclusão de `SKIPPED*` do `countByTenantChannelSince` existente);
  - acima do teto: não cria o SMS, marca `delivery_processed_at` normalmente (o aviso continua na caixa + push), conta `smsSkippedCap` no `delivery_completed` e loga **uma vez por job** `logger.warn('inspector_notice.sms_cap_reached', { noticeId, cap })`;
  - warn de burst: `logger.warn('inspector_notice.sms_burst', { noticeId, smsQueued })` no fim do job quando `smsQueued >= 20`.
- **2026-10-29 · L-F02-02 (D18) · Sem janela de silêncio na F02.** Decisão explícita: push e SMS saem na hora, a qualquer hora (D2 mantida; o "não perturbe" do aparelho é do inspetor). Mitigações: (a) aviso de horário no ConfirmDialog de crítico do web (TASK-F02-2); (b) a varredura **não reenfileira** entre 22:00 e 06:00 Sydney (sai de manhã; a janela de 24 h continua); (c) o log `inspector_notice.delivery_completed` ganha `sydneyHour` (0-23) para medir.
- **2026-10-29 · L-F02-03 (D19) · Entrega iniciada e não concluída é recuperada.**
  - coluna `inspector_notices.delivery_completed_at`, gravada no fim do job (depois do último lote, também quando o job para por arquivamento);
  - a varredura ganha um segundo critério: `delivery_started_at <= now() - 20 min AND delivery_completed_at IS NULL AND EXISTS (destinatário com delivery_processed_at IS NULL)`, mesma janela de 24 h por `published_at`, mesmo `singletonKey` (o pg-boss evita dois jobs ativos);
  - quando reenfileira por esse critério: `logger.error('inspector_notice.delivery_incomplete', { noticeId, pending })`;
  - `expireInMinutes` do job pelo volume: `getInspectorNoticeDeliverExpireMinutes(recipientCount) = max(15, ceil(recipientCount × 2 × 10 ÷ 10 ÷ 60) + 5)` (2 assinaturas × 10 s de timeout ÷ 10 em paralelo); usado na publicação manual, na de sistema e na varredura (500 destinatários → 22 min).
- **2026-10-29 · L-F02-04 (D20) · Assinatura com falha permanente é revogada.**
  - 401/403 do push service (VAPID inválido ou trocado) → novo outcome `REJECTED` do sender → revoga com `revoked_reason = 'REJECTED'` + `recomputePushEnabled` na mesma transação;
  - coluna `inspector_push_subscriptions.failure_count` (int, default 0): `FAILED` incrementa, `SENT` zera, upsert pelo app zera; ao chegar a `5` → revoga com `revoked_reason = 'FAILED'`;
  - `revoked_reason` passa a aceitar `'GONE' | 'UNSUBSCRIBED' | 'REJECTED' | 'FAILED' | 'DEACTIVATED'` (cabe no `VarChar(20)`);
  - para fins de SMS (D2-a), `REJECTED` conta como push sem sucesso;
  - o lado cliente (reassinar quando a chave muda) está na TASK-F02-3.
- **2026-10-29 · L-F02-06 (D22) · Retenção e arquivamento automático.**
  - job diário `inspector-notice.auto-archive`, cron `45 3 * * *` Sydney (depois do `audit.retention` das 03:30, `workers.ts:268`);
  - arquiva (`archived_at = now()`, D4) avisos **de sistema** (`system_type IS NOT NULL`) com `archived_at IS NULL AND published_at < now() - INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (env, padrão `30`); avisos manuais nunca são tocados;
  - sem audit por linha; um `logger.info('inspector_notice.auto_archived', { count })`;
  - apaga `inspector_push_subscriptions` com `revoked_at < now() - 90 dias` (`logger.info('push_subscription.purged', { count })`);
  - em lotes de 1000 (`updateMany`/`deleteMany` por ids) para não segurar lock longo.
- **2026-10-29 · L-F02-07 (D23) · O corpo do push é público na tela bloqueada.** O push continua levando título + corpo completos (até 180 chars). Regra documentada no docblock de `PublishSystemInspectorNoticeInput` e na seção "API de aviso de sistema": título e corpo aparecem na tela bloqueada e em relógios; **nunca** incluir códigos de chave/lockbox, senhas, nome ou telefone de inquilino. Endereço e código do serviço são aceitos. Para avisos manuais, hint no drawer (TASK-F02-2).
- **2026-10-29 · L-F02-08 (D24) · Algoritmo da allowlist.** `isAllowedInspectorNoticeTargetPath(path)` (backend e SW usam a mesma função):
  1. `typeof path === 'string'`, `1 <= path.length <= 200`, começa com `/`;
  2. não contém `?`, `#`, `//`, `%`, `\`;
  3. não termina em `/`;
  4. `path.split('/')` tem o mesmo número de segmentos de algum padrão de `INSPECTOR_NOTICE_TARGET_PATTERNS` e casa **segmento a segmento** (sem prefixo): segmento literal por igualdade exata (case-sensitive), `:id` só com `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` (minúsculas);
  5. padrões estáticos (ex.: `/today` da F04, `/profile/challenges` da F08) casam só a string exata.
- **2026-10-29 · L-F02-09 (D25) · Destinatários inativos ou sem login.** "All" continua = `ACTIVE AND deleted_at IS NULL`, **inclusive** sem `user_id` (o SMS é o canal deles em críticos). Cada item de `recipients` no detalhe ganha `inspectorStatus: 'ACTIVE' | 'INACTIVE'` (status **atual**; soft-deleted conta como `INACTIVE`) e `hasAppAccess: boolean` (`user_id IS NOT NULL`). A lista admin continua X/Y simples.
- **2026-10-29 · L-F02-10 (D26) · Arquivar durante a entrega.** O job relê `archived_at` no início de **cada** lote de 50; se arquivado, para, marca os destinatários restantes com `delivery_processed_at = now()` (sem enviar), grava `delivery_completed_at` e loga `inspector_notice.delivery_skipped_archived { noticeId, processed, skipped }`.
- **2026-10-29 · L-F02-11 (D27) · Desativar inspetor revoga o push.** `DeactivateInspectorUseCase` (`deactivate-inspector.use-case.ts:72-79`, que hoje só põe INACTIVE e revoga sessões) passa a revogar as assinaturas ativas com `revoked_reason = 'DEACTIVATED'` e recomputar `push_enabled` (vira `false`). Reativar não religa nada: o app ressincroniza no próximo login (D10, `usePushSubscriptionSync`).

### Testes primeiro (TDD)

Escrever antes da implementação; todos começam vermelhos.

**Shared (Vitest)**

`packages/shared/src/schemas/inspector-notice.test.ts` (novo):

| Caso | Entrada | Esperado |
|---|---|---|
| ALL válido | `{title:'Road closure', body:'Pacific Hwy closed', audience:{type:'ALL'}}` | `success=true`, `critical=false` (default) |
| título vazio | `title:'   '` | `success=false`, path `['title']` |
| título longo | 121 caracteres | `success=false` |
| corpo longo | 2001 caracteres | `success=false` |
| corpo trim | `body:'  hi  '` | `body === 'hi'` |
| SELECTED vazio | `audience:{type:'SELECTED',inspectorIds:[]}` | `success=false` |
| SELECTED > 500 | 501 UUIDs | `success=false` |
| SELECTED duplicado | `[a,a,b]` | `inspectorIds` = `[a,b]` (dedupe na transform) |
| SELECTED id inválido | `['x']` | `success=false` |
| REGION sem id | `{type:'REGION'}` | `success=false` |
| tipo desconhecido | `{type:'TENANT'}` | `success=false` |
| chave extra | `{..., foo:1}` | `success=true`, `foo` removido |
| assinatura válida | `{endpoint:'https://fcm.googleapis.com/fcm/send/abc', keys:{p256dh:'B..', auth:'x..'}}` | `success=true` |
| assinatura http | `endpoint:'http://...'` | `success=false` |
| endpoint > 2048 | | `success=false` |
| sem `keys.auth` | | `success=false` |
| list query | `{status:'archived'}` | ok; `status` default `'active'`; `pageSize` máx 100 |

`packages/shared/src/constants/inspector-notices.test.ts` (novo):

| Caso | Esperado |
|---|---|
| `isCriticalSystemNoticeType('ROUTE_PUBLISHED')` | `true` |
| `ROUTE_CHANGED`, `COMPLETION_REMINDER` | `true` (F03 chama com `type:'COMPLETION_REMINDER'`) |
| `PERFORMANCE_MESSAGE` | `false` |
| `SYSTEM_INSPECTOR_NOTICE_TYPES` | exatamente `['ROUTE_PUBLISHED','ROUTE_CHANGED','COMPLETION_REMINDER','PERFORMANCE_MESSAGE']` |
| `isAllowedInspectorNoticeTargetPath('/profile/announcements/<uuid>')` | `true` |
| `isAllowedInspectorNoticeTargetPath('/schedule/<uuid>')` | `true` |
| `'/schedule/abc'`, `'/schedule/<uuid>/x'`, `'/schedule/<uuid>?a=1'`, `'/today'`, `'https://evil.example/schedule/<uuid>'`, `'//evil.example'`, `''` | `false` (`/today` só entra com a F04) |
| L-F02-08: `'/profile/announcements/<uuid>/'` (barra final), `'/Schedule/<uuid>'`, `'/schedule/<UUID maiúsculo>'`, `'/schedule/%2e%2e'`, `'/schedule/<uuid>\\x'`, `'/schedule//<uuid>'`, `'/schedule/<uuid>#a'` | `false` |
| L-F02-08: `'/schedule/' + 'a'.repeat(191)` (201 chars) | `false` |
| L-F02-08: `'/schedule/<uuid v4 minúsculo>'` | `true` |
| L-F02-08: `'/schedule/00000000-0000-0000-0000-000000000000'` (versão 0) | `false` |
| L-F02-08: entrada não-string (`null`, `undefined`, `123`) | `false`, sem lançar |
| `getInspectorNoticeDeliverExpireMinutes(2)` / `(150)` / `(500)` | `15` / `15` / `22` (L-F02-03) |
| `resolveInspectorNoticeTargetPath('n1', undefined)` | `'/profile/announcements/n1'` |
| `resolveInspectorNoticeTargetPath('n1', '/schedule/<uuid>')` | `'/schedule/<uuid>'` |
| `INSPECTOR_NOTICE_TARGET_PATTERNS` | exatamente 2 padrões: `/profile/announcements/:id` e `/schedule/:id` |
| `buildInspectorNoticeSmsMessage('Road closure','Pacific Hwy closed')` | `'Properfy: Road closure. Pacific Hwy closed'` |
| título já terminado em pontuação (`'Heads up!'`) | `'Properfy: Heads up! ...'` (sem ponto duplo) |
| total > 300 caracteres | resultado com `length <= 300`, termina em `'… Open the Properfy app.'` |
| corpo com quebras de linha | quebras viram espaço simples |

`packages/shared/src/constants/notification-templates.test.ts` (modificar, ou o teste existente do catálogo):

| Caso | Esperado |
|---|---|
| `PLATFORM_ONLY_TEMPLATE_CODES` | contém `'INSPECTOR_NOTICE_SMS'`; `MANDATORY_TEMPLATE_CODES` **não** contém |
| `getTemplateTarget('INSPECTOR_NOTICE_SMS')` | `'INSPECTOR'` |
| `getProtectedClass('INSPECTOR_NOTICE_SMS')` | `'TRANSACTIONAL'` |
| `getTemplateCodeLabel('INSPECTOR_NOTICE_SMS')` | `'Inspector Notice (SMS)'` |
| `TEMPLATE_VARIABLES.INSPECTOR_NOTICE_SMS` | `{ required: ['message'], optional: [] }` |
| `ALLOWED_VARIABLES` / `SAMPLE_DATA` | contém `message`; `SAMPLE_DATA.message` não vazio |
| `isSystemTemplate('INSPECTOR_NOTICE_SMS')` | `false` (identidade de e-mail não se aplica) |

`packages/shared/src/enums/notification.test.ts` (**sem mudança**): o caso `expect('PUSH' in NotificationChannel).toBe(false)` já existe (l. 14-16), ao lado do `IN_APP` (l. 18-20) e de "exactly 2 channels". Ele é a prova de D6 e precisa continuar verde.

**Backend unit (Vitest), em `apps/backend/tests/unit/inspector-notice/` (novo diretório)**

`publish-inspector-notice.use-case.test.ts` (repositórios em memória, clock fixo `2026-11-10T00:00:00Z`):

| Caso | Entrada | Esperado |
|---|---|---|
| ALL | 2 ACTIVE, 1 INACTIVE, 1 ACTIVE soft-deleted | 2 destinatários; `audience_json = {type:'ALL'}`; `recipientCount = 2` |
| SELECTED ok | 2 ids ACTIVE | 2 destinatários; `audience_json = {type:'SELECTED', inspectorIds:[...]}` |
| SELECTED inválido | 1 ACTIVE + 1 INACTIVE + 1 inexistente | 400 `INSPECTOR_NOTICE_INVALID_RECIPIENTS`, `details.inspectorIds` = os 2 inválidos; nada gravado |
| REGION | região ACTIVE com 3 inspetores (1 INACTIVE) | 2 destinatários; `audience_json = {type:'REGION', regionId, regionName:'North Shore'}` |
| REGION inexistente | | 404 `INSPECTOR_NOTICE_REGION_NOT_FOUND` |
| REGION inativa | `status = INACTIVE` | 422 `INSPECTOR_NOTICE_REGION_INACTIVE` |
| sem destinatários | ALL sem nenhum ativo | 422 `INSPECTOR_NOTICE_NO_RECIPIENTS`; nada gravado |
| crítico | `critical:true` | gravado `critical=true` |
| autor | actor AM `u1` | `author_user_id = 'u1'`, `system_type = null`, `dedupe_key = null` |
| auditoria | sucesso | 1 `audit.log` `inspector_notice.published`, `actorType:'USER'`, `entityType:'InspectorNotice'`, `tenantId:null`, `after:{title, critical, audience, recipientCount, systemType:null}`, `requestId` |
| job | sucesso (2 destinatários) | `enqueue('inspector-notice.deliver', {noticeId}, {singletonKey: noticeId, retryLimit: 3, retryBackoff: true, expireInMinutes: 15})` **depois** do commit |
| job grande (L-F02-03) | ALL com 500 destinatários | `expireInMinutes: 22` (`getInspectorNoticeDeliverExpireMinutes(500)`) |
| sem `Idempotency-Key` | header ausente | 400 `IDEMPOTENCY_KEY_MISSING` "Idempotency-Key header is required"; nada gravado |
| chave repetida (sequencial) | mesma chave e payload 2x | 2ª chamada devolve o mesmo `noticeId` lido do cache; 1 insert, 1 audit, 1 enqueue |
| chave com payload diferente | mesma chave, título diferente | 409 `INSPECTOR_NOTICE_IDEMPOTENCY_PAYLOAD_MISMATCH` "This Idempotency-Key was already used with a different request" |
| ordem na transação | sucesso | dentro do mesmo `tx`: `pg_advisory_xact_lock(hashtext('inspector-notice.publish:' + key))` → `getWithHash(key, scope, tx)` → inserts → `set(key, 'inspector-notice.publish', output, 24, payloadHash, tx)`; audit e enqueue só via `defer` (pós-commit) |
| rollback | insert de destinatários lança | nenhuma chave gravada (o `set` estava no `tx`); retry com a mesma chave publica normalmente |
| enqueue falha | `enqueue` lança | o use case **não** lança; devolve o aviso; `logger.error('inspector_notice.enqueue_failed', {noticeId})` |

`archive-inspector-notice.use-case.test.ts`:

| Caso | Esperado |
|---|---|
| ativo | `archived_at = now`; audit `inspector_notice.archived` com `before:{archivedAt:null}`, `after:{archivedAt}` |
| já arquivado | devolve o aviso com o `archived_at` original; **nenhum** audit novo; nenhum erro |
| corrida (CAS `updateMany where archived_at IS NULL` retorna 0) | relê e devolve o estado atual, sem audit |
| inexistente | 404 `INSPECTOR_NOTICE_NOT_FOUND` |

`list-inspector-notices.use-case.test.ts`:

| Caso | Esperado |
|---|---|
| `status:'active'` (default) | só `archived_at IS NULL`, ordem `published_at desc, id desc` |
| `status:'archived'` | só arquivados |
| `status:'all'` | todos |
| contagens | aviso com 5 destinatários, 2 com `read_at` → `recipientCount:5`, `readCount:2` |
| autor | manual → `author:{type:'USER', name:'Ana Op'}`; sistema → `author:{type:'SYSTEM', name:null}` |
| paginação | `page:2,pageSize:1` com 3 avisos → 1 item, `total:3` |

`get-inspector-notice.use-case.test.ts`: destinatários ordenados por não lidos primeiro e depois `name` asc (case-insensitive); cada item `{inspectorId, inspectorName, readAt, inspectorStatus, hasAppAccess}`; inexistente → 404 `INSPECTOR_NOTICE_NOT_FOUND`. Casos L-F02-09: destinatário ACTIVE com `user_id` → `inspectorStatus:'ACTIVE', hasAppAccess:true`; ACTIVE sem `user_id` → `hasAppAccess:false`; desativado depois da publicação → `inspectorStatus:'INACTIVE'`; soft-deleted → `inspectorStatus:'INACTIVE'`; `recipientCount`/`readCount` não mudam com esses campos.

`list-my-inspector-notices.use-case.test.ts` (caixa):

| Caso | Esperado |
|---|---|
| exclui arquivados | aviso arquivado do inspetor não aparece |
| isolamento | avisos de outro inspetor não aparecem |
| ordem | `published_at desc` |
| item | `{id, title, body, critical, publishedAt, readAt}`; sem `audience`, autor, contagens ou `unreadCount` |
| envelope | `{ data, pagination }` do helper `paginated` (sem `meta`) |

`count-my-unread-inspector-notices.use-case.test.ts`: conta só avisos não arquivados, não lidos e do próprio inspetor; 0 quando não há; arquivar um não lido reduz o contador.

`get-my-inspector-notice.use-case.test.ts`: destinatário + ativo → item; não destinatário → 404 `INSPECTOR_NOTICE_NOT_FOUND`; arquivado → 404 `INSPECTOR_NOTICE_NOT_FOUND` (mesma resposta, sem vazar existência).

`mark-inspector-notice-read.use-case.test.ts`:

| Caso | Esperado |
|---|---|
| primeira leitura | `read_at = now`, devolve `{noticeId, readAt}` |
| segunda leitura | `read_at` original mantido (`COALESCE`) |
| não destinatário | 404 `INSPECTOR_NOTICE_NOT_FOUND` |
| arquivado | 404 `INSPECTOR_NOTICE_NOT_FOUND` |
| auditoria | **nenhuma** (telemetria de leitura) |

`upsert-push-subscription.use-case.test.ts`:

| Caso | Esperado |
|---|---|
| endpoint novo | linha criada para o inspetor; `inspectors.push_enabled = true`; `failure_count = 0` |
| mesmo endpoint, mesmo inspetor, revogado | `p256dh/auth` atualizados, `revoked_at = null`, `revoked_reason = null`, `failure_count = 0` (L-F02-04) |
| endpoint de outro inspetor (aparelho trocou de dono) | `inspector_id` passa ao atual, `revoked_at = null`; `push_enabled` recomputado para os **dois** inspetores |
| VAPID não configurado | 503 `PUSH_NOT_CONFIGURED` "Push notifications are not configured" |

`unsubscribe-push-subscription.use-case.test.ts`:

| Caso | Esperado |
|---|---|
| endpoint ativo do inspetor | `revoked_at = now`, `revoked_reason = 'UNSUBSCRIBED'`; `push_enabled = false` se era a última |
| ainda há outra ativa | `push_enabled` continua `true` |
| endpoint inexistente ou de outro inspetor | no-op (204), nada alterado |

`get-push-config.use-case.test.ts`: com `VAPID_PUBLIC_KEY` → `{vapidPublicKey:'B...'}`; sem → `{vapidPublicKey:null}`.

`deliver-inspector-notice.use-case.test.ts` (sender de push e `CreateNotificationUseCase` falsos):

| # | crítico | assinaturas ativas | resultado do push | telefone | Esperado |
|---|---|---|---|---|---|
| 1 | sim | 1 | `SENT` | sim | 1 push; **nenhum** SMS |
| 2 | sim | 0 | – | sim | `createNotification({notificationId: getInspectorNoticeSmsNotificationId(noticeId, inspectorId), tenantId:null, recipient:'+61412345678', channel:'SMS', templateCode:'INSPECTOR_NOTICE_SMS', payloadJson:{message}})` |
| 3 | sim | 1 | `GONE` (410) | sim | assinatura revogada `revoked_reason='GONE'`; `push_enabled` recomputado; SMS criado |
| 4 | sim | 1 | `GONE` (404) | sim | idem 3 |
| 5 | sim | 2 | 1 `SENT` + 1 `GONE` | sim | 1 revogada; **nenhum** SMS |
| 6 | sim | 1 | `FAILED` (429/500/timeout/rede) | sim | assinatura **não** revogada; `failure_count` 0 → 1; `logger.warn('inspector_notice.push_failed')`; **SMS criado** (D2-a) |
| 6b | sim | 2 | 1 `GONE` + 1 `FAILED` | sim | 1 revogada; SMS criado (D2-a) |
| 6c | não | 1 | `FAILED` | sim | nenhum SMS (D5) |
| 7 | sim | 0 | – | `null` | nenhum SMS; `logger.warn('inspector_notice.sms_skipped_no_phone')` |
| 8 | não | 0 | – | sim | nenhum push, **nenhum** SMS (D5) |
| 9 | não | 1 | `SENT` | sim | 1 push, nenhum SMS |
| 10 | não | 1 | `GONE` | sim | revogada; nenhum SMS |
| 11 | sim | – (VAPID ausente: sender `DISABLED`) | – | sim | trata como sem assinatura → SMS |
| 12 | – | – | – | – | destinatário com `delivery_processed_at` preenchido é pulado (retry do job) |
| 13 | sim | 0 | – | sim | reexecução após falha no meio: SMS chamado de novo com o **mesmo** `notificationId` (o `saveIfAbsent` impede duplicata) |
| 14 | – | – | – | – | aviso arquivado antes do job → nada é enviado; log `inspector_notice.delivery_skipped_archived` |
| 14b | – | – | – | – | início do job grava `inspector_notices.delivery_started_at = COALESCE(delivery_started_at, now)` antes de qualquer envio (marca a tentativa para a varredura) |
| 15 | sim | 1 | – | sim | inspetor `INACTIVE` ou soft-deleted no momento da entrega → nada enviado; marca `delivery_processed_at` |
| 16 | – | – | – | – | payload do push: `{v:1, noticeId, title, body (≤180 chars, com "…"), critical, url: resolveInspectorNoticeTargetPath(noticeId, target_path)}`; opções `{TTL: 86400, urgency: critical ? 'high' : 'normal'}` |
| 16b | – | – | – | – | aviso de sistema com `target_path = '/schedule/<appointmentId>'` → `url = '/schedule/<appointmentId>'` |
| 17 | – | – | – | – | resumo `logger.info('inspector_notice.delivery_completed', {noticeId, recipients, pushSent, pushGone, pushRejected, pushFailed, smsQueued, smsSkippedNoPhone, smsSkippedCap, sydneyHour})`; clock `2026-11-10T11:40:00Z` → `sydneyHour: 22` (L-F02-02) |
| 18 | sim | 1 | `REJECTED` (401/403) | sim | assinatura revogada `revoked_reason='REJECTED'`; `push_enabled` recomputado; SMS criado (L-F02-04) |
| 19 | sim | 1 | `FAILED` com `failure_count = 4` antes | sim | `failure_count = 5` → revogada `revoked_reason='FAILED'`; `push_enabled` recomputado; SMS criado (L-F02-04) |
| 20 | não | 1 | `SENT` com `failure_count = 3` antes | sim | `failure_count = 0`; nenhum SMS (L-F02-04) |
| 21 | sim | 0 | – | sim | teto `cap = 2`, contador do dia já em `2` → **nenhum** `createNotification`; `delivery_processed_at` marcado; `smsSkippedCap: 1`; 1 `logger.warn('inspector_notice.sms_cap_reached', {noticeId, cap: 2})` (L-F02-01) |
| 21b | sim | 0 (3 destinatários) | – | sim | `cap = 2`, contador em `1` → 1º SMS criado, 2º e 3º pulados; `smsQueued: 1`, `smsSkippedCap: 2`; o warn de teto sai **uma** vez no job |
| 21c | sim | 0 | – | sim | `cap = null` (sem teto) → SMS criado; contador não é consultado |
| 21d | não | 0 | – | sim | teto atingido não muda nada (não crítico nunca gera SMS) |
| 22 | sim | 0 (20 destinatários) | – | sim | `smsQueued: 20` → `logger.warn('inspector_notice.sms_burst', {noticeId, smsQueued: 20})`; com 19 → sem warn (L-F02-01) |
| 23 | – | – | – | – | aviso arquivado entre o lote 1 e o lote 2 (120 destinatários, lotes de 50) → lote 2 e 3 não enviam push nem SMS; os 70 restantes ficam com `delivery_processed_at`; `delivery_completed_at` gravado; log `delivery_skipped_archived {noticeId, processed: 50, skipped: 70}` (L-F02-10) |
| 24 | – | – | – | – | fim normal do job grava `delivery_completed_at = now`; retry de um job já concluído não altera o valor (`COALESCE`) (L-F02-03) |

`sweep-undelivered-inspector-notices.use-case.test.ts` (novo, D13; clock fixo `T`):

| Caso | Estado do aviso | Esperado |
|---|---|---|
| perdido | `delivery_started_at null`, `archived_at null`, `published_at = T-3min` | `enqueue('inspector-notice.deliver', {noticeId}, {singletonKey: noticeId, ...mesmas opções da publicação})` |
| recente | `published_at = T-1min` | não reenfileira (o job normal ainda pode estar na fila) |
| já tentou | `delivery_started_at` preenchido | não reenfileira |
| arquivado | `archived_at` preenchido | não reenfileira |
| antigo | `published_at = T-25h` | não reenfileira (janela máx. 24 h) |
| lote | 250 elegíveis | reenfileira no máx. 100 por execução, mais antigos primeiro |
| idempotência | job reenfileirado roda 2x | 2ª execução pula destinatários com `delivery_processed_at`; SMS com o mesmo id determinístico não duplica |
| log | sempre | `logger.info('inspector_notice.sweep_completed', {requeued})`; `requeued > 0` também gera `logger.warn('inspector_notice.sweep_requeued', {noticeIds})` |
| incompleto (L-F02-03) | `delivery_started_at = T-25min`, `delivery_completed_at null`, 1 destinatário com `delivery_processed_at null`, `published_at = T-30min` | reenfileira com `expireInMinutes` pelo `recipientCount`; `logger.error('inspector_notice.delivery_incomplete', {noticeId, pending: 1})` |
| em andamento | `delivery_started_at = T-10min`, `delivery_completed_at null` | não reenfileira (job ainda pode estar rodando) |
| concluído | `delivery_completed_at` preenchido | não reenfileira |
| iniciado sem pendentes | `delivery_started_at = T-25min`, `delivery_completed_at null`, todos os destinatários com `delivery_processed_at` | não reenfileira (job morreu depois do último destinatário; nada a entregar) |
| incompleto antigo | `published_at = T-25h` | não reenfileira (janela de 24 h) |
| madrugada (L-F02-02) | clock `T = 2026-11-10T13:00:00Z` (00:00 Sydney, AEDT) com 1 aviso perdido | nenhum enqueue; `logger.info('inspector_notice.sweep_skipped_quiet_hours', {sydneyHour: 0})` |
| bordas da janela | 21:59 Sydney → roda; 22:00 → pula; 05:59 → pula; 06:00 → roda | conforme |

`publish-system-inspector-notice.use-case.test.ts`:

| Caso | Esperado |
|---|---|
| `type:'ROUTE_PUBLISHED'` | `critical = true`, `system_type = 'ROUTE_PUBLISHED'`, `author_user_id = null`, `audience_json = {type:'SYSTEM', systemType:'ROUTE_PUBLISHED'}` |
| `type:'COMPLETION_REMINDER'` (chamada da F03) | `critical = true` |
| `type:'PERFORMANCE_MESSAGE'` | `critical = false` (D1: nunca crítico) |
| sem `targetPath` | `target_path = null`; push com `url = '/profile/announcements/<noticeId>'` |
| `targetPath:'/schedule/<uuid>'` | gravado `target_path = '/schedule/<uuid>'` |
| `targetPath:'/today'` ou `'https://x'` ou `'/schedule/abc'` | `ValidationError` `VALIDATION_ERROR` "targetPath is not allowed" (bug do chamador); nada gravado |
| `dedupeKey` repetida | devolve `{noticeId: <existente>, created:false}`; nenhum insert, audit ou enqueue novo |
| corrida no `dedupe_key` (P2002 / 23505 no insert) | trata como repetida e devolve o existente |
| ids inativos/inexistentes | filtrados em silêncio |
| todos filtrados | `{noticeId:null, created:false}`; nada gravado; `logger.info('inspector_notice.system_no_recipients')` |
| auditoria | `inspector_notice.published` com `actorType:'SYSTEM'`, `after.systemType` |
| título/corpo inválidos (vazio, >120, >2000) | lança `ValidationError` `VALIDATION_ERROR` (bug do chamador) |

`web-push.sender.test.ts` (mock da lib `web-push`):

| Resposta da lib | Esperado |
|---|---|
| `statusCode 201` | `{outcome:'SENT'}` |
| `WebPushError` 404 / 410 | `{outcome:'GONE', statusCode}` |
| `WebPushError` 401 / 403 (L-F02-04) | `{outcome:'REJECTED', statusCode}` |
| 400 / 413 / 429 / 500 | `{outcome:'FAILED', statusCode}` |
| erro de rede (sem `statusCode`) | `{outcome:'FAILED', statusCode:null}` |
| chamada | `sendNotification({endpoint, keys}, JSON.stringify(payload), {TTL, urgency, vapidDetails:{subject, publicKey, privateKey}, timeout: 10000})` |

`disabled-push.sender.test.ts`: sempre `{outcome:'DISABLED'}`; `isEnabled() === false`.

`auto-archive-inspector-notices.use-case.test.ts` (novo, L-F02-06; clock fixo `T`, `retentionDays = 30`):

| Caso | Estado | Esperado |
|---|---|---|
| sistema antigo | `system_type='ROUTE_PUBLISHED'`, `published_at = T-31d`, `archived_at null` | `archived_at = T` |
| sistema recente | `published_at = T-29d` | intocado |
| manual antigo | `system_type null`, `published_at = T-400d` | intocado (manuais nunca são arquivados automaticamente) |
| já arquivado | `archived_at = T-40d` | `archived_at` original mantido |
| auditoria | 3 arquivados | **nenhum** `audit.log`; 1 `logger.info('inspector_notice.auto_archived', {count: 3})` |
| lote | 2500 elegíveis | 3 lotes (1000, 1000, 500); `count: 2500` |
| retenção por env | `retentionDays = 7`, `published_at = T-8d` | arquivado |
| purga de assinaturas | revogada há 91 dias / há 89 dias / ativa | só a de 91 dias apagada; `logger.info('push_subscription.purged', {count: 1})` |
| contador do inspetor | aviso de sistema não lido de 31 dias | depois do job, `count-my-unread` não o conta (arquivado sai da caixa, D4) |

`deactivate-inspector.use-case.test.ts` (modificar, L-F02-11):

| Caso | Esperado |
|---|---|
| inspetor com 2 assinaturas ativas | as 2 com `revoked_at = now`, `revoked_reason = 'DEACTIVATED'`; `push_enabled = false` |
| inspetor sem assinatura | nada muda nas assinaturas; `push_enabled` recomputado (`false` se era `true`, `null` fica `null`) |
| assinatura já revogada (`GONE`) | mantém `revoked_reason = 'GONE'` e `revoked_at` original |
| falha de pré-condição (`InspectorHasOpenAppointmentsError`) | nenhuma assinatura revogada |
| reativar depois | nenhuma assinatura volta sozinha (D10) |

`env.test.ts` (ou o teste existente de `env.ts`): `INSPECTOR_NOTICE_SMS_DAILY_CAP` ausente → `500`; `'120'` → `120`; `'none'` ou `''` → `null`; `'-1'`/`'abc'` → erro de validação no boot. `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` ausente → `30`; `'0'` → erro (mínimo 1).

`prisma-notification.repository` (caso na suíte DB): `countByTemplateChannelSince(null, 'INSPECTOR_NOTICE_SMS', 'SMS', since)` conta só linhas desse template, plataforma e canal desde `since`, excluindo `SKIPPED`/`SKIPPED_OPT_OUT` como o `countByTenantChannelSince` existente.

`record-inspector-app-state.use-case.test.ts` (modificar, F01): os casos de `pushPermission` deixam de gravar `push_enabled` (a coluna fica intocada em todos os casos); os demais campos (`app_last_seen_at`, `app_version`, `app_installed_at`) seguem iguais. O contrato do repo da F01 (uma única chamada a `repo.recordAppState(...)`, sem `findById` antes) continua, agora **sem** `pushEnabled` no argumento.

Suíte DB, casos de `recordAppState` da F01 (`inspector-base-coords.integration.test.ts`, modificar, L-F01-02): com `push_enabled = true` gravado antes (por uma assinatura ativa), um heartbeat com `pushPermission: 'denied'` mantém `push_enabled = true`; o caso concorrente de `app_installed_at` continua verde (a instrução continua única).

`has-recent-system-inspector-notice.use-case.test.ts` (novo, L-F08-06; consumido pela F08):

| Caso | Entrada | Esperado |
|---|---|---|
| há aviso recente | aviso de sistema `dedupe_key = 'program-level:i1:2026-11-06'`, `created_at` = 4 dias atrás; `{dedupeKeyPrefix:'program-level:i1:', since: now − 7 d}` | `true` |
| fora da janela | mesmo aviso com `created_at` = 8 dias atrás | `false` |
| borda | `created_at` exatamente igual a `since` | `true` (`created_at >= since`) |
| outro inspetor | só existe `program-level:i2:*` | `false` |
| arquivado | aviso recente já arquivado (manual ou automático) | `true` (conta o envio, não a caixa) |
| aviso manual | `dedupe_key` nulo | nunca conta |
| prefixo com `%` ou `_` | `{dedupeKeyPrefix:'a_b%'}` | caracteres escapados no `LIKE` (casa só o literal) |
| prefixo inválido | `''` ou > 200 chars | `ValidationError` (bug do chamador) |

Suíte DB (`inspector-notice.integration.test.ts`): `existsSystemNoticeByDedupeKeyPrefixSince` com Postgres real casa `LIKE '<prefixo escapado>%' ESCAPE '\'` e `created_at >= since`.

`platform-notification-templates.test.ts` (modificar):
- entrada `INSPECTOR_NOTICE_SMS`/`SMS` existe com `subject: null`, `body: '{{{message}}}'`, `notificationClass: 'TRANSACTIONAL'`;
- `resolvePlatformTemplateClass(entry) === getProtectedClass('INSPECTOR_NOTICE_SMS')`;
- render do body com `{message: 'Tom & Jerry <test>'}` pelo `TemplateRendererService` → `'Tom & Jerry <test>'` (sem `&amp;`).

`template-editor-catalogue-guard.test.ts`: sem mudança de código; deve passar com o código novo (prova que o seed salva sem alteração no editor).

**Backend integration (Supertest), em `apps/backend/tests/integration/inspector-notice/` (novo)**

`inspector-notice.routes.test.ts`:
- `POST /v1/inspector-notices` AM → 201 com o shape do contrato; OP → 201; payload inválido → 400 `VALIDATION_ERROR` "Request payload is invalid".
- `GET /v1/inspector-notices?status=all` → 200 paginado; `readCount`/`recipientCount` corretos.
- `GET /v1/inspector-notices/:id` → 200 com `recipients` (cada item com `inspectorStatus` e `hasAppAccess` declarados no schema e presentes na resposta, L-F02-09); id inexistente → 404; id não-UUID → 400.
- `POST /v1/inspector-notices/:id/archive` → 200 com `archivedAt`; repetido → 200 com o mesmo valor.
- INSP: `GET /v1/inspectors/me/notices` → 200 `{data, pagination}` (sem `unreadCount`); `GET /v1/inspectors/me/notices/unread-count` → `{data:{count}}`; `GET /v1/inspectors/me/notices/:id` → 200; `POST .../:id/read` → 200 e o contador cai.
- **00.A4:** AM publica para o inspetor X → `GET /v1/inspectors/me/notices` de X contém o aviso → `GET /v1/inspector-notices/:id` mostra `readCount: 0` e X com `readAt: null` → X faz `POST .../:id/read` → o mesmo GET admin mostra `readCount: 1` e X com `readAt` preenchido; a lista admin `GET /v1/inspector-notices` também mostra `readCount: 1`.
- `POST /v1/inspector-notices` sem `Idempotency-Key` → 400 `IDEMPOTENCY_KEY_MISSING`.
- push: `GET /v1/inspectors/me/push-config` → 200; `POST /v1/inspectors/me/push-subscriptions` → 204; `POST /v1/inspectors/me/push-subscriptions/unsubscribe` → 204; 11ª chamada em 1 min → 429.
- Rotas estáticas `/v1/inspectors/me/notices*` e `/v1/inspectors/me/push-*` **não** caem em `/v1/inspectors/:inspectorId` (find-my-way).
- Resposta não carrega campos não declarados (serializer com schema): conferir que `audience` volta com `regionName` (declarado) e que nenhum campo interno (`dedupe_key`, `delivery_processed_at`) aparece.

`apps/backend/tests/integration/rbac/inspector-notice-rbac.test.ts` (novo): matriz com **body válido** em todas as chamadas (Fastify valida antes do preHandler):

| Rota | AM | OP | CL_ADMIN | CL_USER | INSP | sem token |
|---|---|---|---|---|---|---|
| `POST /v1/inspector-notices` | 201 | 201 | 403 `FORBIDDEN` | 403 | 403 | 401 |
| `GET /v1/inspector-notices` | 200 | 200 | 403 | 403 | 403 | 401 |
| `GET /v1/inspector-notices/:id` | 200 | 200 | 403 | 403 | 403 | 401 |
| `POST /v1/inspector-notices/:id/archive` | 200 | 200 | 403 | 403 | 403 | 401 |
| `GET /v1/inspectors/me/notices` (+ `/unread-count`, `/:id`, `/:id/read`) | 403 `INSP_ONLY` | 403 | 403 | 403 | 200 | 401 |
| `GET /v1/inspectors/me/push-config`, `POST .../push-subscriptions`, `POST .../push-subscriptions/unsubscribe` | 403 `INSP_ONLY` | 403 | 403 | 403 | 200/204 | 401 |

`apps/backend/tests/integration/db/inspector-notice.integration.test.ts` (novo; suíte DB com `vitest.integration-db.config.ts`, testcontainers em série):
- migration aplica; `inspector_notice_recipients` rejeita par duplicado (PK composta);
- `inspector_notices.dedupe_key` único (NULL repetido permitido);
- `inspector_push_subscriptions.endpoint` único;
- recomputação de `push_enabled` via SQL do repositório (`EXISTS ... revoked_at IS NULL`) com 0, 1 e 2 assinaturas;
- **idempotência concorrente (D16):** dois `PublishInspectorNoticeUseCase.execute` em paralelo (`Promise.all`) com a mesma `Idempotency-Key` e o mesmo payload → **1** linha em `inspector_notices`, os dois resultados com o mesmo `noticeId`. O teste precisa falhar sem o `pg_advisory_xact_lock` (memória "prova de concorrência");
- **00.A2 ponta a ponta com repositórios reais:** inspetor ACTIVE com `phone` e **sem** assinatura → `PublishInspectorNoticeUseCase` (crítico, SELECTED) com repositórios Prisma reais → executar o handler do job `inspector-notice.deliver` (`DeliverInspectorNoticeUseCase` real, `DisabledPushSender` ou sender falso só na borda HTTP) → `CreateNotificationUseCase` real → existe 1 linha `notifications` com `template_code = 'INSPECTOR_NOTICE_SMS'`, `channel = 'SMS'`, `tenant_id IS NULL`, `notification_class = 'TRANSACTIONAL'`, `recipient` = telefone do inspetor, `payload_json.message` começando por `'Properfy: '`; `inspector_notice_recipients.delivery_processed_at` preenchido; `inspector_notices.delivery_started_at` preenchido. Repetir o handler → continua 1 linha. Variante com sender falso `SENT` → 0 linhas `notifications`; variante `FAILED` (D2-a) → 1 linha;
- **varredura:** aviso inserido com `published_at = now() - 3 min` e `delivery_started_at null` → `SweepUndeliveredInspectorNoticesUseCase` reenfileira (fila falsa só na borda) e o deliver real produz o mesmo resultado acima;
- **entrega incompleta (L-F02-03):** aviso crítico com 3 destinatários sem push; o handler real é interrompido depois de processar o 2º (sender/`createNotification` falso que lança no 3º) → `delivery_completed_at` nulo; recuar `delivery_started_at` 25 min → varredura reenfileira → deliver real completa só o 3º: 3 linhas `notifications` no total (nenhuma repetida para o 1º e o 2º), `delivery_completed_at` preenchido;
- **teto de SMS (L-F02-01):** `INSPECTOR_NOTICE_SMS_DAILY_CAP = 1`, aviso crítico com 2 destinatários sem push → 1 linha `notifications`; os 2 destinatários com `delivery_processed_at`;
- **auto-arquivamento (L-F02-06):** aviso de sistema com `published_at = now() - 31 dias` e aviso manual com a mesma data → o job real arquiva só o de sistema; assinatura revogada há 91 dias é apagada;
- **desativação (L-F02-11):** `DeactivateInspectorUseCase` real com 1 assinatura ativa → `revoked_reason = 'DEACTIVATED'`, `inspectors.push_enabled = false`;
- `CreateNotificationUseCase` real + template semeado pelo `syncPlatformTemplates`: linha `notifications` com `tenant_id NULL`, `notification_class = 'TRANSACTIONAL'`, `template_code = 'INSPECTOR_NOTICE_SMS'`; segunda chamada com o mesmo id não cria outra.

**E2E:** não há (o backend não tem Playwright; o QA ponta a ponta fica na TASK-F02-3).

### Escopo / Passos

- [ ] **1. Migration + Prisma** (infra/db, 0,5)
  - Modify: `apps/backend/prisma/schema.prisma` (modelos `InspectorNotice` com `delivery_completed_at`, `InspectorNoticeRecipient`, `InspectorPushSubscription` com `failure_count`; relações em `Inspector` e `User`).
  - Novo: `apps/backend/prisma/migrations/20261110000000_inspector_notices_push/migration.sql`.
  - Gerar com `prisma migrate dev --create-only`; conferir que o diff **não** derruba índices `Unsupported()` (GIST de `service_regions.geom`, `service_regions_*_lower_name_key`); aplicar local; `prisma generate`.
- [ ] **2. Domínio + publicar/arquivar/listar/detalhe + rotas AM/OP + auditoria** (domain/application/interfaces, 0,75)
  - Novo módulo `apps/backend/src/modules/inspector-notice/`:
    - `domain/inspector-notice.entity.ts`, `domain/inspector-notice.repository.ts` (porta), `domain/inspector-notice.errors.ts`, `domain/audience.ts` (tipo `InspectorNoticeAudience`);
    - `application/use-cases/publish-inspector-notice.use-case.ts` (idempotência no `tx` com lock, D16), `archive-inspector-notice.use-case.ts`, `list-inspector-notices.use-case.ts`, `get-inspector-notice.use-case.ts` (com `inspectorStatus`/`hasAppAccess` por destinatário, L-F02-09);
    - `application/services/resolve-notice-recipients.ts` (ALL/SELECTED/REGION → ids ativos);
    - `infrastructure/prisma-inspector-notice.repository.ts`;
    - `interfaces/inspector-notice.routes.ts`.
  - Modify: `apps/backend/src/main/routes.ts`, `apps/backend/src/main/container.ts`.
- [ ] **3. Caixa do inspetor + marcar lido + contador** (application/interfaces, 0,5)
  - Novo: `.../use-cases/list-my-inspector-notices.use-case.ts`, `get-my-inspector-notice.use-case.ts`, `mark-inspector-notice-read.use-case.ts`, `count-my-unread-inspector-notices.use-case.ts`.
  - Rotas INSP no mesmo `inspector-notice.routes.ts` (paths `/v1/inspectors/me/notices*`). A ordem de registro não importa (no find-my-way a rota estática vence `:inspectorId`); o teste de precedência garante isso.
- [ ] **4. Assinaturas de push + `push_enabled` (D10) + ajuste do heartbeat** (domain/application/infra, 0,5)
  - Novo: `domain/push-subscription.repository.ts`, `infrastructure/prisma-push-subscription.repository.ts` (inclui `recomputePushEnabled(tx, inspectorId)`), `use-cases/upsert-push-subscription.use-case.ts`, `unsubscribe-push-subscription.use-case.ts`, `get-push-config.use-case.ts`.
  - Modify: `apps/backend/src/modules/inspector/application/use-cases/record-inspector-app-state.use-case.ts` (para de gravar `push_enabled`) + seu teste.
  - Modify (L-F01-02): `apps/backend/src/modules/inspector/domain/inspector.repository.ts` (tira `pushEnabled` do argumento de `recordAppState()`) e `infrastructure/prisma-inspector.repository.ts`: remover a coluna `push_enabled` da **instrução SQL única** do `$executeRaw` de `recordAppState()` (não existe `updateMany` para editar); manter tagged template e casts; ajustar os casos de `recordAppState` na suíte DB da F01.
- [ ] **5. Web Push sender + VAPID + job de entrega** (infra/worker, 0,75)
  - Modify: `apps/backend/package.json` (+ `web-push@^3.6.7`, devDep `@types/web-push@^3.6.4`), `pnpm-lock.yaml`.
  - Modify: `apps/backend/src/main/env.ts` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; warn em staging/prod se faltar).
  - Novo: `domain/push-sender.ts` (porta `IPushSender`), `infrastructure/web-push.sender.ts`, `infrastructure/disabled-push.sender.ts`, `use-cases/deliver-inspector-notice.use-case.ts` (releitura de `archived_at` por lote, L-F02-10; `sydneyHour` no resumo, L-F02-02).
  - Modify: `apps/backend/src/main/workers.ts` (`boss.work('inspector-notice.deliver', ...)`).
- [ ] **6. Fallback SMS + registro do template** (notification/shared, 0,5)
  - Novo: `apps/backend/src/modules/inspector-notice/domain/sms-notification-id.ts` (`getInspectorNoticeSmsNotificationId`).
  - Modify (shared): `packages/shared/src/constants/notification-templates.ts` (6 pontos, ver "Registro do template").
  - Modify (backend): `apps/backend/src/modules/notification/domain/platform-notification-templates.ts` (1 ponto).
  - Modify (testes): `apps/backend/tests/unit/notification/platform-notification-templates.test.ts`.
- [ ] **7. API de aviso de sistema + allowlist de destino** (application/shared, 0,25)
  - Novo (L-F08-06): `.../use-cases/has-recent-system-inspector-notice.use-case.ts` (+ teste) e o método `existsSystemNoticeByDedupeKeyPrefixSince(prefix, since)` na porta `domain/inspector-notice.repository.ts` e em `infrastructure/prisma-inspector-notice.repository.ts` (`dedupe_key LIKE '<prefixo escapado>%' ESCAPE '\' AND created_at >= since`, `SELECT EXISTS`); exposto no container como `container.inspectorNotice.hasRecentSystemNoticeUseCase`.
  - Novo: `.../use-cases/publish-system-inspector-notice.use-case.ts` (docblock com a regra de conteúdo público na tela bloqueada, L-F02-07); `packages/shared/src/constants/inspector-notices.ts` (tipos, criticidade, `INSPECTOR_NOTICE_TARGET_PATTERNS`, `isAllowedInspectorNoticeTargetPath` com o algoritmo de L-F02-08, `resolveInspectorNoticeTargetPath`, `getInspectorNoticeDeliverExpireMinutes`).
- [ ] **8. Shared schemas + OpenAPI + api-types + matriz RBAC + smoke local** (shared/interfaces/QA, 0,25)
  - Novo: `packages/shared/src/schemas/inspector-notice.ts` (+ export em `schemas/index.ts`), `packages/shared/src/constants/inspector-notices.ts` (+ export em `constants/index.ts`).
  - Regenerar: `pnpm --filter @properfy/shared build && pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types` → `packages/shared/openapi.json`, `packages/shared/src/api-types.ts`.
  - Testes de integração e RBAC listados acima.
  - Smoke: chaves VAPID locais (`npx web-push generate-vapid-keys`) em `apps/backend/.env.example` (só os nomes, valores vazios) e no `.env` local; publicar um aviso crítico via `curl` para um inspetor sem assinatura e ver a linha `notifications` (stub de SMS) com `tenant_id NULL` e classe TRANSACTIONAL.

- [ ] **9. Varredura de segurança (D13) + entrega incompleta + janela noturna** (application/worker, 0,5)
  - Novo: `.../use-cases/sweep-undelivered-inspector-notices.use-case.ts` (+ teste), com os dois critérios (não iniciada; iniciada há ≥ 20 min e não concluída com pendentes, L-F02-03) e a saída antecipada entre 22:00 e 06:00 Sydney (L-F02-02).
  - Modify: `deliver-inspector-notice.use-case.ts` (grava `delivery_completed_at` no fim), `publish-inspector-notice.use-case.ts` e `publish-system-inspector-notice.use-case.ts` (`expireInMinutes = getInspectorNoticeDeliverExpireMinutes(recipientCount)`).
  - Modify: `apps/backend/src/main/workers.ts` (`boss.schedule('inspector-notice.delivery-sweep', '*/5 * * * *', {}, SYDNEY_TZ)` + `boss.work(...)`, como `notification.retry-poll`), `apps/backend/src/main/container.ts`.
- [ ] **10. Teto diário de SMS + warn de burst (L-F02-01)** (application/infra, 0,25)
  - Modify: `apps/backend/src/main/env.ts` (`INSPECTOR_NOTICE_SMS_DAILY_CAP`), `apps/backend/src/modules/notification/domain/notification.repository.ts` e `infrastructure/prisma-notification.repository.ts` (`countByTemplateChannelSince`), `deliver-inspector-notice.use-case.ts` (checagem antes de cada SMS, `smsSkippedCap`, `sms_cap_reached`, `sms_burst`), `apps/backend/src/main/container.ts`.
  - Modify (testes): fakes de `INotificationRepository` que implementam a interface (grep por `countByTenantChannelSince` nos testes) ganham o método novo.
- [ ] **11. Falha permanente de push + desativação (L-F02-04, L-F02-11)** (domain/infra, 0,25)
  - Modify: `domain/push-sender.ts` (outcome `REJECTED`), `infrastructure/web-push.sender.ts` (401/403), `infrastructure/prisma-push-subscription.repository.ts` (`incrementFailure`, `resetFailure`, `revokeAllForInspector(tx, inspectorId, reason)`), `deliver-inspector-notice.use-case.ts` (revogação `REJECTED`/`FAILED`).
  - Modify: `apps/backend/src/modules/inspector/application/use-cases/deactivate-inspector.use-case.ts` (nova dep `IPushSubscriptionRepository`; chama `revokeAllForInspector(..., 'DEACTIVATED')` depois do `update` de status) + teste; `container.ts` (wiring).
  - Atenção (memória "nova dep de use-case quebra wirings de teste não tipados"): procurar todas as construções de `DeactivateInspectorUseCase` em testes e atualizar.
- [ ] **12. Arquivamento automático + purga de assinaturas (L-F02-06)** (application/worker, 0,25)
  - Novo: `.../use-cases/auto-archive-inspector-notices.use-case.ts` (+ teste).
  - Modify: `apps/backend/src/main/env.ts` (`INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS`), `apps/backend/src/main/workers.ts` (`boss.schedule('inspector-notice.auto-archive', '45 3 * * *', {}, SYDNEY_TZ)` + `boss.work(...)`, e o nome na linha de log `pg-boss workers registered`), `container.ts`.

**Total: 0,5 + 0,75 + 0,5 + 0,5 + 0,75 + 0,5 + 0,25 + 0,25 + 0,5 + 0,25 + 0,25 + 0,25 = 5,25 dias.** Arquivos estimados: ~68 (bem abaixo de 150).

### Modelo de dados

**Exceção multi-tenant (D9):** as três tabelas são de plataforma e **não têm `tenant_id`**. Escopo por papel (AM/OP) e por `inspector_id` do JWT (INSP). Toda query de INSP filtra `inspector_id = authContext.inspectorId`. Registrar na spec como exceção ao §7.1 do CLAUDE.md.

**`InspectorNotice`** (`@@map("inspector_notices")`)

| Coluna | Tipo Prisma | Nulo | Default | Índice | Semântica |
|---|---|---|---|---|---|
| `id` | `String @id @default(uuid())` | não | uuid | PK | |
| `title` | `String @db.VarChar(120)` | não | – | – | 1-120 após trim |
| `body` | `String @db.Text` | não | – | – | 1-2000 após trim (validado no Zod); texto puro, quebras de linha preservadas |
| `critical` | `Boolean` | não | `false` | – | D1. Sistema: derivado do tipo |
| `audience_json` | `Json` | não | – | – | `{type:'ALL'}` \| `{type:'SELECTED', inspectorIds}` \| `{type:'REGION', regionId, regionName}` (snapshot do nome) \| `{type:'SYSTEM', systemType}` |
| `system_type` | `String? @db.VarChar(40)` | sim | – | – | Um de `SYSTEM_INSPECTOR_NOTICE_TYPES`; nulo = manual |
| `dedupe_key` | `String? @db.VarChar(200)` | sim | – | `@unique` | Idempotência dos avisos de sistema (§7.7 do CLAUDE.md). Nulo nos manuais |
| `target_path` | `String? @db.VarChar(200)` | sim | – | – | D15. Só avisos de sistema; validado por `isAllowedInspectorNoticeTargetPath`. Nulo = `/profile/announcements/<id>` |
| `author_user_id` | `String?` | sim | – | – | FK `users.id` `onDelete: Restrict`. **Nulo = sistema** |
| `published_at` | `DateTime` | não | `now()` | `@@index([published_at])` | Publicação = criação (não há rascunho nem agendamento) |
| `archived_at` | `DateTime?` | sim | – | `@@index([archived_at])` | D4 |
| `delivery_started_at` | `DateTime?` | sim | – | – (a varredura filtra por `published_at`, já indexado) | Primeira execução do job de entrega (D13). Nulo depois de 2 min = enqueue perdido |
| `delivery_completed_at` | `DateTime?` | sim | – | – | Fim do job de entrega (todos os destinatários processados, ou parada por arquivamento). Iniciado há ≥ 20 min e ainda nulo, com pendentes = entrega incompleta (L-F02-03) |
| `created_at` | `DateTime` | não | `now()` | – | |
| `updated_at` | `DateTime @updatedAt` | não | – | – | |

Relações: `author User? @relation("InspectorNoticeAuthor", fields:[author_user_id], references:[id])`, `recipients InspectorNoticeRecipient[]`. Em `User`: `authored_inspector_notices InspectorNotice[] @relation("InspectorNoticeAuthor")`.

**`InspectorNoticeRecipient`** (`@@map("inspector_notice_recipients")`), materializado na publicação

| Coluna | Tipo | Nulo | Default | Índice | Semântica |
|---|---|---|---|---|---|
| `notice_id` | `String` | não | – | PK composta | FK `inspector_notices.id` `onDelete: Restrict` |
| `inspector_id` | `String` | não | – | PK composta; `@@index([inspector_id, read_at])` | FK `inspectors.id` `onDelete: Restrict` |
| `read_at` | `DateTime?` | sim | – | (no índice acima) | Primeira abertura; nunca sobrescrito |
| `delivery_processed_at` | `DateTime?` | sim | – | – | Checkpoint do job de entrega (push/SMS já decididos); torna o retry idempotente. Não é recibo de entrega |
| `created_at` | `DateTime` | não | `now()` | – | |

`@@id([notice_id, inspector_id])`. Em `Inspector`: `notice_recipients InspectorNoticeRecipient[]`.

**`InspectorPushSubscription`** (`@@map("inspector_push_subscriptions")`). O plano chama de `PushSubscription`; o nome muda só para não colidir com o tipo `PushSubscription` da lib `web-push`/DOM.

| Coluna | Tipo | Nulo | Default | Índice | Semântica |
|---|---|---|---|---|---|
| `id` | `String @id @default(uuid())` | não | uuid | PK | |
| `inspector_id` | `String` | não | – | `@@index([inspector_id, revoked_at])` | FK `inspectors.id` `onDelete: Cascade` (como `InspectorRegion`) |
| `endpoint` | `String @db.VarChar(2048)` | não | – | `@unique` | URL https do push service; identifica o dispositivo/navegador |
| `p256dh` | `String @db.VarChar(255)` | não | – | – | Chave pública do cliente (base64url) |
| `auth` | `String @db.VarChar(255)` | não | – | – | Segredo de auth (base64url) |
| `revoked_at` | `DateTime?` | sim | – | (índice acima) | Nulo = ativa |
| `revoked_reason` | `String? @db.VarChar(20)` | sim | – | – | `'GONE'` (404/410) \| `'UNSUBSCRIBED'` (inspetor desligou ou fez logout) \| `'REJECTED'` (401/403, L-F02-04) \| `'FAILED'` (5 falhas seguidas, L-F02-04) \| `'DEACTIVATED'` (inspetor desativado, L-F02-11) |
| `failure_count` | `Int` | não | `0` | – | Falhas `FAILED` consecutivas; `SENT` e upsert zeram; `>= 5` revoga (L-F02-04) |
| `created_at` | `DateTime` | não | `now()` | – | |
| `updated_at` | `DateTime @updatedAt` | não | – | – | |

**`inspectors.push_enabled`** (coluna da F01, D10): passa a ser `EXISTS(SELECT 1 FROM inspector_push_subscriptions WHERE inspector_id = $1 AND revoked_at IS NULL)`, recomputada na mesma transação de cada escrita em assinaturas (`upsert`, `unsubscribe`, revogação por 404/410). Nulo continua significando "nunca reportou/assinou"; a recomputação grava `true`/`false`.

**Migration** `apps/backend/prisma/migrations/20261110000000_inspector_notices_push/migration.sql` (ajustar o timestamp para a data real, sempre maior que a última migration mergeada, incluindo a da TASK-F01-1 `20261103000000_*`):

```sql
CREATE TABLE "inspector_notices" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "body" TEXT NOT NULL,
  "critical" BOOLEAN NOT NULL DEFAULT false,
  "audience_json" JSONB NOT NULL,
  "system_type" VARCHAR(40),
  "dedupe_key" VARCHAR(200),
  "target_path" VARCHAR(200),
  "author_user_id" TEXT,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMP(3),
  "delivery_started_at" TIMESTAMP(3),
  "delivery_completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inspector_notices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inspector_notices_dedupe_key_key" ON "inspector_notices"("dedupe_key");
CREATE INDEX "inspector_notices_published_at_idx" ON "inspector_notices"("published_at");
CREATE INDEX "inspector_notices_archived_at_idx" ON "inspector_notices"("archived_at");
ALTER TABLE "inspector_notices" ADD CONSTRAINT "inspector_notices_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inspector_notice_recipients" (
  "notice_id" TEXT NOT NULL,
  "inspector_id" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "delivery_processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspector_notice_recipients_pkey" PRIMARY KEY ("notice_id", "inspector_id")
);
CREATE INDEX "inspector_notice_recipients_inspector_id_read_at_idx"
  ON "inspector_notice_recipients"("inspector_id", "read_at");
ALTER TABLE "inspector_notice_recipients" ADD CONSTRAINT "inspector_notice_recipients_notice_id_fkey"
  FOREIGN KEY ("notice_id") REFERENCES "inspector_notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inspector_notice_recipients" ADD CONSTRAINT "inspector_notice_recipients_inspector_id_fkey"
  FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inspector_push_subscriptions" (
  "id" TEXT NOT NULL,
  "inspector_id" TEXT NOT NULL,
  "endpoint" VARCHAR(2048) NOT NULL,
  "p256dh" VARCHAR(255) NOT NULL,
  "auth" VARCHAR(255) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "revoked_reason" VARCHAR(20),
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inspector_push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inspector_push_subscriptions_endpoint_key" ON "inspector_push_subscriptions"("endpoint");
CREATE INDEX "inspector_push_subscriptions_inspector_id_revoked_at_idx"
  ON "inspector_push_subscriptions"("inspector_id", "revoked_at");
ALTER TABLE "inspector_push_subscriptions" ADD CONSTRAINT "inspector_push_subscriptions_inspector_id_fkey"
  FOREIGN KEY ("inspector_id") REFERENCES "inspectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- D10: push_enabled deixa de refletir a permissão do navegador (F01 D9).
-- Ninguém tem assinatura ainda, então todo TRUE vira FALSE. NULL (nunca reportou) fica.
UPDATE "inspectors" SET "push_enabled" = FALSE WHERE "push_enabled" = TRUE;
```

- Só expand (tabelas novas) + um UPDATE de dados barato (dezenas de linhas).
- Rollback de schema: `DROP TABLE` das 3, só num PR de contract posterior. O UPDATE não é revertido (o valor antigo era só a permissão do navegador e o heartbeat da F01 já não o reescreve depois deste PR).

### Contratos

Envelope de erro: `{ error: { code, message, details } }`. Zod → 400 `VALIDATION_ERROR` "Request payload is invalid" (body), "Invalid query parameters" (query) ou "Invalid notice ID" (params), `details` = issues. Todas as rotas declaram `schema.response` (o serializer remove campos não declarados: tudo o que o cliente usa precisa estar no schema). Instantes em ISO-8601 UTC.

**Schemas shared** (`packages/shared/src/schemas/inspector-notice.ts`, novo)

```ts
export const INSPECTOR_NOTICE_TITLE_MAX = 120;
export const INSPECTOR_NOTICE_BODY_MAX = 2000;
export const INSPECTOR_NOTICE_SELECTED_MAX = 500;

export const inspectorNoticeAudienceInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALL') }),
  z.object({ type: z.literal('SELECTED'),
    inspectorIds: z.array(z.string().uuid()).min(1).max(INSPECTOR_NOTICE_SELECTED_MAX)
      .transform((ids) => [...new Set(ids)]) }),
  z.object({ type: z.literal('REGION'), regionId: z.string().uuid() }),
]);

export const publishInspectorNoticeSchema = z.object({
  title: z.string().trim().min(1).max(INSPECTOR_NOTICE_TITLE_MAX),
  body: z.string().trim().min(1).max(INSPECTOR_NOTICE_BODY_MAX),
  critical: z.boolean().default(false),
  audience: inspectorNoticeAudienceInputSchema,
});

export const inspectorNoticeAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALL') }),
  z.object({ type: z.literal('SELECTED'), inspectorIds: z.array(z.string()) }),
  z.object({ type: z.literal('REGION'), regionId: z.string(), regionName: z.string() }),
  z.object({ type: z.literal('SYSTEM'), systemType: z.enum(SYSTEM_INSPECTOR_NOTICE_TYPES) }),
]);

export const listInspectorNoticesQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
});

export const inspectorNoticeSummarySchema = z.object({
  id: z.string(), title: z.string(), body: z.string(), critical: z.boolean(),
  audience: inspectorNoticeAudienceSchema,
  author: z.object({ type: z.enum(['USER', 'SYSTEM']), name: z.string().nullable() }),
  publishedAt: z.string(), archivedAt: z.string().nullable(),
  recipientCount: z.number().int(), readCount: z.number().int(),
});

export const inspectorNoticeDetailSchema = inspectorNoticeSummarySchema.extend({
  recipients: z.array(z.object({
    inspectorId: z.string(), inspectorName: z.string(), readAt: z.string().nullable(),
    inspectorStatus: z.enum(['ACTIVE', 'INACTIVE']), // status atual; soft-deleted = INACTIVE (L-F02-09)
    hasAppAccess: z.boolean(),                      // inspectors.user_id IS NOT NULL (L-F02-09)
  })),
});

export const myInspectorNoticeSchema = z.object({
  id: z.string(), title: z.string(), body: z.string(), critical: z.boolean(),
  publishedAt: z.string(), readAt: z.string().nullable(),
});

export const listMyInspectorNoticesQuerySchema = paginationSchema; // sortBy ignorado

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).refine((u) => u.startsWith('https://'), 'Endpoint must use https'),
  expirationTime: z.number().nullable().optional(), // aceito e ignorado
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) });
export const pushConfigResponseSchema = z.object({ vapidPublicKey: z.string().nullable() });
```

Atenção à memória "`.extend()` propaga": `inspectorNoticeDetailSchema` estende o summary; não reaproveitar o detail em respostas de lista.

**Constantes shared** (`packages/shared/src/constants/inspector-notices.ts`, novo)

```ts
export const SYSTEM_INSPECTOR_NOTICE_TYPES = [
  'ROUTE_PUBLISHED',            // F04 – crítico (D1)
  'ROUTE_CHANGED',              // F04 – crítico (D1)
  'COMPLETION_REMINDER',        // F03 – crítico (D1)
  'PERFORMANCE_MESSAGE',        // F08 – nunca crítico (D1)
] as const;
export type SystemInspectorNoticeType = (typeof SYSTEM_INSPECTOR_NOTICE_TYPES)[number];
export const SYSTEM_NOTICE_CRITICALITY: Record<SystemInspectorNoticeType, boolean> = {
  ROUTE_PUBLISHED: true, ROUTE_CHANGED: true,
  COMPLETION_REMINDER: true, PERFORMANCE_MESSAGE: false,
};
export function isCriticalSystemNoticeType(t: SystemInspectorNoticeType): boolean;
export const INSPECTOR_NOTICE_SMS_MAX_CHARS = 300;
export function buildInspectorNoticeSmsMessage(title: string, body: string): string;
// 'Properfy: ' + title (+ '.' se não terminar em . ! ?) + ' ' + body (quebras → espaço, espaços colapsados);
// se > 300: corta e termina em '… Open the Properfy app.' com length total ≤ 300.
export const INSPECTOR_NOTICE_PUSH_BODY_MAX_CHARS = 180;
export function inspectorNoticeDeepLink(noticeId: string): string; // `/profile/announcements/${noticeId}`

// D15 – allowlist única de destinos do toque (backend valida, SW usa a mesma constante).
// `:id` = UUID. Sem query, sem fragmento, sem host. A F04 acrescenta '/today' aqui.
export const INSPECTOR_NOTICE_TARGET_PATTERNS = [
  '/profile/announcements/:id', // padrão (id = noticeId)
  '/schedule/:id',              // detalhe do serviço na agenda (id = appointmentId)
] as const;
export function isAllowedInspectorNoticeTargetPath(path: unknown): boolean;
// L-F02-08: string de 1-200 chars, começa com '/', sem '?', '#', '//', '%', '\', sem '/' final;
// casa segmento a segmento (mesmo nº de segmentos, sem prefixo) com algum padrão;
// literal = igualdade exata (case-sensitive); ':id' = INSPECTOR_NOTICE_UUID_RE (minúsculas).
export const INSPECTOR_NOTICE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function resolveInspectorNoticeTargetPath(noticeId: string, targetPath?: string | null): string;
// targetPath válido → ele; senão → inspectorNoticeDeepLink(noticeId)

// L-F02-03: expiração do job de entrega pelo volume (2 assinaturas × 10 s ÷ 10 em paralelo + 5 min de folga).
export function getInspectorNoticeDeliverExpireMinutes(recipientCount: number): number;
// = Math.max(15, Math.ceil((recipientCount * 2 * 10) / 10 / 60) + 5)
```

**Endpoints**

| Endpoint | Request | Response | Erros (code · message) | RBAC |
|---|---|---|---|---|
| `POST /v1/inspector-notices` | body `publishInspectorNoticeSchema`; header **obrigatório** `Idempotency-Key` (escopo `inspector-notice.publish`, TTL 24 h, D16) | 201 `{data: inspectorNoticeSummarySchema}` (`readCount: 0`) | 400 `IDEMPOTENCY_KEY_MISSING` · "Idempotency-Key header is required"; 409 `INSPECTOR_NOTICE_IDEMPOTENCY_PAYLOAD_MISMATCH` · "This Idempotency-Key was already used with a different request"; 400 `VALIDATION_ERROR` · "Request payload is invalid"; 400 `INSPECTOR_NOTICE_INVALID_RECIPIENTS` · "Some selected inspectors are not active" (`details.inspectorIds`); 404 `INSPECTOR_NOTICE_REGION_NOT_FOUND` · "Region not found"; 422 `INSPECTOR_NOTICE_REGION_INACTIVE` · "This region is inactive"; 422 `INSPECTOR_NOTICE_NO_RECIPIENTS` · "No active inspectors match this audience" | AM, OP. Outros: 403 `FORBIDDEN` · "Insufficient permissions" (`requireRoles`) |
| `GET /v1/inspector-notices` | query `listInspectorNoticesQuerySchema` | 200 paginado `{data: inspectorNoticeSummarySchema[], pagination:{page,pageSize,total,totalPages}}` (helper `paginated` existente) | 400 `VALIDATION_ERROR` · "Invalid query parameters" | AM, OP |
| `GET /v1/inspector-notices/:noticeId` | params `{noticeId: uuid}` | 200 `{data: inspectorNoticeDetailSchema}` | 400 "Invalid notice ID"; 404 `INSPECTOR_NOTICE_NOT_FOUND` · "Notice not found" | AM, OP |
| `POST /v1/inspector-notices/:noticeId/archive` | params; sem body (body ausente ou `{}` são aceitos) | 200 `{data: inspectorNoticeSummarySchema}` com `archivedAt` | 404 `INSPECTOR_NOTICE_NOT_FOUND`. Já arquivado → 200 idempotente | AM, OP |
| `GET /v1/inspectors/me/notices` | query `listMyInspectorNoticesQuerySchema` | 200 `{data: myInspectorNoticeSchema[], pagination:{page,pageSize,total,totalPages}}`. **Sem** `unreadCount` (o `paginated` descarta campos extras); o contador vem de `/unread-count` | 400; 403 `INSP_ONLY` · "This endpoint is only accessible to inspectors" | INSP (próprio) |
| `GET /v1/inspectors/me/notices/unread-count` | – | 200 `{data:{count: number}}` | 403 `INSP_ONLY` | INSP |
| `GET /v1/inspectors/me/notices/:noticeId` | params | 200 `{data: myInspectorNoticeSchema}` | 404 `INSPECTOR_NOTICE_NOT_FOUND` (não destinatário **ou** arquivado); 403 `INSP_ONLY` | INSP |
| `POST /v1/inspectors/me/notices/:noticeId/read` | params | 200 `{data:{noticeId, readAt}}` (idempotente) | 404 `INSPECTOR_NOTICE_NOT_FOUND`; 403 `INSP_ONLY` | INSP |
| `GET /v1/inspectors/me/push-config` | – | 200 `{data: pushConfigResponseSchema}` | 403 `INSP_ONLY` | INSP |
| `POST /v1/inspectors/me/push-subscriptions` | `pushSubscriptionSchema` | 204 | 400; 403 `INSP_ONLY`; 503 `PUSH_NOT_CONFIGURED` · "Push notifications are not configured"; 429 (10/min por usuário, `config.rateLimit`) | INSP |
| `POST /v1/inspectors/me/push-subscriptions/unsubscribe` | `pushUnsubscribeSchema` | 204 (idempotente, no-op se não existir/for de outro) | 400; 403 `INSP_ONLY`; 429 (10/min) | INSP |

- **Não existe** endpoint de edição nem de exclusão de aviso (D4). `PATCH`/`DELETE /v1/inspector-notices/:id` → 404 do Fastify (rota inexistente).
- Desassinar usa `POST .../unsubscribe` (e não `DELETE` com body) porque alguns clientes/proxies descartam body de DELETE.

**Regras de publicação** (`PublishInspectorNoticeUseCase`)
1. Resolver destinatários (`resolve-notice-recipients.ts`): `status = 'ACTIVE' AND deleted_at IS NULL`.
   - ALL: todos que satisfazem.
   - SELECTED: todos os ids precisam satisfazer; senão 400 com a lista dos inválidos.
   - REGION: região existe (404) e `status = 'ACTIVE'` (422); destinatários = `inspector_regions.region_id = X` ∩ ativos. Grava `regionName` no `audience_json`.
2. Zero → 422 `INSPECTOR_NOTICE_NO_RECIPIENTS`.
3. Idempotência (D16, padrão `ReportCantDoUseCase` da F03): sem `Idempotency-Key` → 400. `payloadHash = hashIdempotencyPayload(parsedBody)`. Fora do `tx`: `getWithHash(key, 'inspector-notice.publish')` → hash igual → devolve o cache; hash diferente → 409 mismatch.
4. `runInTransaction(prisma, async ({ tx, defer }) => { ... })`:
   - `tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtext(${'inspector-notice.publish:' + key}))\`` (serializa POSTs concorrentes com a mesma chave);
   - reler `getWithHash(key, scope, tx)`: se completo → devolve o cache (o concorrente venceu); hash diferente → 409;
   - resolver destinatários (passos 1-2) e gravar aviso + `createMany` dos destinatários no `tx`;
   - `idempotencyService.set(key, 'inspector-notice.publish', output, 24, payloadHash, tx)`;
   - `defer`: `audit.log('inspector_notice.published')` e `enqueue('inspector-notice.deliver')` (falha de enqueue: log de erro, sem lançar; a varredura D13 recupera).

**Regras de entrega** (`DeliverInspectorNoticeUseCase`, job `inspector-notice.deliver` `{noticeId}`)
1. Carrega o aviso; se `archived_at` não nulo → marca os destinatários pendentes como processados, grava `delivery_completed_at` e sai (log `inspector_notice.delivery_skipped_archived`). Senão grava `delivery_started_at = COALESCE(delivery_started_at, now())` antes de qualquer envio.
2. Itera destinatários com `delivery_processed_at IS NULL` em lotes de 50, com no máximo 10 envios de push em paralelo. **No início de cada lote** relê `archived_at` (L-F02-10); se arquivado → marca os restantes com `delivery_processed_at = now()` sem enviar, grava `delivery_completed_at`, loga `delivery_skipped_archived { noticeId, processed, skipped }` e termina.
3. Para cada um: se inspetor `INACTIVE`/soft-deleted → marca processado e segue.
4. Push: para cada assinatura ativa, `pushSender.send(...)`.
   - `SENT` → `failure_count = 0`.
   - `GONE` → revoga (`revoked_reason 'GONE'`) + `recomputePushEnabled` na mesma transação.
   - `REJECTED` (401/403) → revoga (`revoked_reason 'REJECTED'`) + `recomputePushEnabled` (L-F02-04).
   - `FAILED` → log warn `inspector_notice.push_failed`, `failure_count += 1`; ao chegar a 5 → revoga (`revoked_reason 'FAILED'`) + `recomputePushEnabled`; abaixo disso, assinatura **não** revogada (L-F02-04).
5. `pushReached` = ao menos um `SENT` (sem assinatura, todas `GONE`/`REJECTED`/`FAILED` ou sender `DISABLED` → `false`).
6. SMS só se `critical && !pushReached` (D2, D2-a, D5): sem `phone` → log warn e segue; teto diário atingido (L-F02-01, `INSPECTOR_NOTICE_SMS_DAILY_CAP` contra `countByTemplateChannelSince(null, 'INSPECTOR_NOTICE_SMS', 'SMS', início do dia em Sydney)`) → não cria, conta `smsSkippedCap`, warn `sms_cap_reached` uma vez por job; senão → `createNotificationUseCase.execute({ notificationId: getInspectorNoticeSmsNotificationId(noticeId, inspectorId), tenantId: null, recipient: inspector.phone, channel: 'SMS', templateCode: 'INSPECTOR_NOTICE_SMS', payloadJson: { message: buildInspectorNoticeSmsMessage(title, body) } })`. Reexecução com o mesmo id determinístico não cria linha nova, então não consome teto a mais.
7. Marca `delivery_processed_at = now` (por destinatário, após decidir push/SMS).
8. Qualquer falha de push sem nenhum `SENT` num aviso crítico → **SMS** (D2-a), respeitado o teto. Não crítico nunca gera SMS.
9. Fim do job: `delivery_completed_at = COALESCE(delivery_completed_at, now())`; resumo `delivery_completed` (com `sydneyHour`, L-F02-02); `sms_burst` warn se `smsQueued >= 20` (L-F02-01).
10. Opções do job: `retryLimit: 3`, `retryBackoff: true`, `singletonKey: noticeId`, `expireInMinutes: getInspectorNoticeDeliverExpireMinutes(recipientCount)` (mín. 15; 500 destinatários → 22; L-F02-03). Exceção não tratada (ex.: banco fora) → o pg-boss refaz; os destinatários já processados são pulados. Se os retries esgotarem, a varredura recupera pelo critério de entrega incompleta.

**Varredura de segurança** (`SweepUndeliveredInspectorNoticesUseCase`, job `inspector-notice.delivery-sweep`, cron `*/5 * * * *` Sydney, D13)
0. Janela noturna (L-F02-02): se a hora atual em Sydney está em `[22, 6)` → `logger.info('inspector_notice.sweep_skipped_quiet_hours', { sydneyHour })` e sai sem consultar nada. O cron continua `*/5 * * * *` (a regra fica no use case para ser testável).
1. Seleciona até 100 avisos com `archived_at IS NULL AND published_at >= now() - 24 h` e **um** dos critérios, `ORDER BY published_at ASC`:
   - (a) não iniciada: `delivery_started_at IS NULL AND published_at <= now() - 2 min`;
   - (b) incompleta (L-F02-03): `delivery_started_at <= now() - 20 min AND delivery_completed_at IS NULL AND EXISTS (SELECT 1 FROM inspector_notice_recipients r WHERE r.notice_id = id AND r.delivery_processed_at IS NULL)`.
2. Para cada um, `enqueue('inspector-notice.deliver', {noticeId}, {singletonKey: noticeId, retryLimit: 3, retryBackoff: true, expireInMinutes: getInspectorNoticeDeliverExpireMinutes(recipientCount)})` (mesmas opções da publicação; o `singletonKey` evita dois jobs ativos).
3. Idempotência: o deliver pula destinatários com `delivery_processed_at` e o SMS usa id determinístico (`saveIfAbsent`). Rodar a varredura N vezes não duplica push de destinatário já processado nem SMS.
4. Janela de 24 h: um aviso mais antigo nunca é entregue tardiamente (fica só na caixa).
5. Logs: `inspector_notice.sweep_completed` (info, `requeued`), `inspector_notice.sweep_requeued` (warn, `noticeIds`) quando `requeued > 0` (sinal de enqueue perdido), `inspector_notice.delivery_incomplete` (error, `{noticeId, pending}`) para cada aviso do critério (b).

**Payload do push** (JSON, criptografado pela lib): `{ "v": 1, "noticeId": "...", "title": "...", "body": "<até 180 chars + …>", "critical": true, "url": resolveInspectorNoticeTargetPath(noticeId, target_path) }` (padrão `/profile/announcements/<id>`). Opções: `TTL: 86400`, `urgency: critical ? 'high' : 'normal'`, `timeout: 10000` ms.

- **Conteúdo público (L-F02-07, D23):** o título e o corpo do push aparecem na tela bloqueada e em relógios. O corpo continua completo (sem modo "genérico"); a proteção é por regra de conteúdo: avisos de sistema não incluem códigos de chave/lockbox, senhas, nome ou telefone de inquilino (endereço e código do serviço são aceitos); avisos manuais têm hint no drawer (TASK-F02-2).

**Arquivamento automático e retenção** (`AutoArchiveInspectorNoticesUseCase`, job `inspector-notice.auto-archive`, cron `45 3 * * *` Sydney, L-F02-06)
1. `UPDATE inspector_notices SET archived_at = now() WHERE system_type IS NOT NULL AND archived_at IS NULL AND published_at < now() - (INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS || ' days')`, em lotes de 1000 ids (`ORDER BY published_at ASC`).
2. Avisos manuais (`system_type IS NULL`) nunca são arquivados automaticamente (histórico da OP).
3. Sem audit por linha (operação de sistema em massa); `logger.info('inspector_notice.auto_archived', { count })`.
4. `DELETE FROM inspector_push_subscriptions WHERE revoked_at < now() - 90 days`, em lotes de 1000; `logger.info('push_subscription.purged', { count })`. O valor 90 é constante (`INSPECTOR_PUSH_SUBSCRIPTION_PURGE_DAYS = 90` no módulo).
5. `inspector_notice_recipients` não é apagado (as leituras ficam no detalhe da OP, D4); o volume é contido porque a caixa e o contador só olham não arquivados.

**Porta `IPushSender`** (`modules/inspector-notice/domain/push-sender.ts`)

```ts
export type PushSendOutcome =
  | { outcome: 'SENT' }
  | { outcome: 'GONE'; statusCode: 404 | 410 }
  | { outcome: 'REJECTED'; statusCode: 401 | 403 } // VAPID inválido/trocado (L-F02-04)
  | { outcome: 'FAILED'; statusCode: number | null }
  | { outcome: 'DISABLED' };
export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export interface InspectorNoticePushPayload { v: 1; noticeId: string; title: string; body: string; critical: boolean; url: string }
export interface IPushSender {
  isEnabled(): boolean;
  send(target: PushTarget, payload: InspectorNoticePushPayload, opts: { ttlSeconds: number; urgency: 'normal' | 'high' }): Promise<PushSendOutcome>;
}
```

`container.ts`: `WebPushSender` quando as 3 variáveis VAPID existem; senão `DisabledPushSender` (e `GetPushConfig` devolve `null`).

**Env** (`apps/backend/src/main/env.ts`)
- `VAPID_PUBLIC_KEY: z.string().optional()`, `VAPID_PRIVATE_KEY: z.string().optional()`, `VAPID_SUBJECT: z.string().regex(/^(mailto:|https:)/).optional()`.
- Em staging/production: se alguma faltar, `console.warn('[env] VAPID keys not configured; web push disabled and critical inspector notices fall back to SMS')`. Não bloqueia o boot.
- Chaves **distintas por ambiente** (dev/staging/prod). Trocar a chave invalida todas as assinaturas daquele ambiente. Recuperação (L-F02-04): o primeiro envio a cada assinatura antiga recebe 401/403 → revogada como `REJECTED` (o crítico daquele envio vai por SMS); o PWA compara a chave da assinatura local com a de `push-config` e reassina sozinho no próximo carregamento (TASK-F02-3).
- `INSPECTOR_NOTICE_SMS_DAILY_CAP`: `z.preprocess` de string → `number | null`; ausente → `500`; `''`/`'none'` → `null` (sem teto); inteiro ≥ 0, senão erro de boot (L-F02-01).
- `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS`: inteiro ≥ 1, ausente → `30` (L-F02-06).

**Registro do template `INSPECTOR_NOTICE_SMS`** (exatamente estes lugares)

`packages/shared/src/constants/notification-templates.ts`:
1. `PLATFORM_ONLY_TEMPLATE_CODES`: acrescentar `'INSPECTOR_NOTICE_SMS'` (não customizável por agência; **não** entra em `MANDATORY_TEMPLATE_CODES`).
2. `PLATFORM_TEMPLATE_CODE_LABELS`: `INSPECTOR_NOTICE_SMS: 'Inspector Notice (SMS)'`.
3. `TEMPLATE_VARIABLES`: `INSPECTOR_NOTICE_SMS: { required: ['message'], optional: [] }`. `required` aqui só trava o editor (payload montado à mão); exigido porque sem `{{{message}}}` o SMS sai vazio e falha como `EMPTY_SMS_BODY`.
4. `PROTECTED_TEMPLATE_CLASSIFICATIONS`: `INSPECTOR_NOTICE_SMS: 'TRANSACTIONAL'` (obrigatório com `tenantId = null`: senão consentimento e orçamento olham um tenant nulo).
5. `ALLOWED_VARIABLES`: `'message'`; `SAMPLE_DATA`: `message: 'Properfy: Road closure on Pacific Hwy. Allow extra travel time today.'`.
6. `TEMPLATE_TARGETS`: `INSPECTOR_NOTICE_SMS: 'INSPECTOR'` + atualizar o docblock: "INSPECTOR — ..., `deliver-inspector-notice.use-case.ts` (INSPECTOR_NOTICE_SMS, via `inspector.phone`)".

`apps/backend/src/modules/notification/domain/platform-notification-templates.ts`:

7. Entrada em `PLATFORM_TEMPLATES`: `{ code: 'INSPECTOR_NOTICE_SMS', channel: 'SMS', subject: null, body: '{{{message}}}', notificationClass: 'TRANSACTIONAL' }`. Triple-stash porque o renderer escapa HTML (`noEscape: false`) e o texto é livre da OP. O `notificationClass` é declarado explicitamente (armadilha: o seed só grava a classe declarada/derivada; o teste compara com `getProtectedClass`).

**Não** tocar: `prisma/seed.ts` (o comentário proíbe platform-only TRANSACTIONAL na lista inline; o `syncPlatformTemplates` cria a linha no boot), `SYSTEM_TEMPLATE_CODES` (e-mail), `APPOINTMENT_EMAIL_CODES` (só e-mails de appointment). O piso `seededCodes.length >= 25` continua válido.

**ID determinístico do SMS** (`modules/inspector-notice/domain/sms-notification-id.ts`): UUIDv5 com namespace próprio (constante nova) sobre `${noticeId}:${inspectorId}`, mesmo algoritmo de `getAgencyForwardNotificationId`.

**API de aviso de sistema** (contrato exportado; sem rota HTTP)

```ts
// apps/backend/src/modules/inspector-notice/application/use-cases/publish-system-inspector-notice.use-case.ts
export interface PublishSystemInspectorNoticeInput {
  type: SystemInspectorNoticeType;   // define critical via SYSTEM_NOTICE_CRITICALITY (D1)
  inspectorIds: string[];            // filtrados para ACTIVE e não deletados
  title: string;                     // 1-120 após trim. Público na tela bloqueada (L-F02-07)
  body: string;                      // 1-2000 após trim. Público na tela bloqueada: sem códigos de chave/lockbox,
                                     // senhas, nome ou telefone de inquilino (endereço e código do serviço ok)
  dedupeKey: string;                 // 1-200; ex.: `route-published:${dayPlanId}:${version}`
  targetPath?: string;               // D15: allowlist INSPECTOR_NOTICE_TARGET_PATTERNS; padrão /profile/announcements/:id
  requestId?: string;
}
export interface PublishSystemInspectorNoticeOutput { noticeId: string | null; created: boolean }

// apps/backend/src/modules/inspector-notice/application/use-cases/has-recent-system-inspector-notice.use-case.ts (L-F08-06)
export interface HasRecentSystemInspectorNoticeInput {
  dedupeKeyPrefix: string;           // 1-200; casado como literal (% e _ escapados), ex.: `program-level:${inspectorId}:`
  since: Date;                       // inclusivo: created_at >= since
}
export type HasRecentSystemInspectorNoticeOutput = boolean; // conta avisos de sistema arquivados também
```

`created` é `true` só quando esta chamada gravou o aviso; com `dedupeKey` repetida ou corrida, `created:false` e `noticeId` do existente; sem destinatários, `{noticeId:null, created:false}`. Consumidores que fazem efeitos próprios (ex.: a F03 audita o lembrete) condicionam a `created === true` (L-F03-03).

**Leitura de avisos de sistema por prefixo** (contrato exportado; sem rota HTTP; L-F08-06): `HasRecentSystemInspectorNoticeUseCase` responde se existe aviso de sistema com `dedupe_key` começando pelo prefixo e `created_at >= since`. Serve à guarda de 7 dias da F08 sem que outro módulo leia `inspector_notices` direto. Avisos manuais (`dedupe_key` nulo) nunca contam. Consulta pontual (poucas por dia) numa tabela pequena (avisos de sistema arquivados continuam, mas o volume é baixo): sem índice novo; se o volume crescer, um índice `text_pattern_ops` em `dedupe_key` resolve.

Exposto no container como `container.inspectorNotice.publishSystemInspectorNoticeUseCase`. O chamador **não** escolhe `critical` (vem do tipo). `targetPath` fora da allowlist → `ValidationError` (bug do chamador). Avisos de sistema são arquivados automaticamente após `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (30) dias (L-F02-06). O `dedupeKey` precisa ser estável por evento (um loop do chamador com chave variável só é contido pelo teto diário de SMS, L-F02-01).

### Casos de borda
1. OP publica com duplo clique ou dois POSTs simultâneos com a mesma `Idempotency-Key`: o lock no `tx` garante um só aviso. Sem a chave: 400.
2. Inspetor entra na região depois da publicação: não recebe (destinatários materializados).
3. Inspetor desativado depois da publicação: continua na lista de destinatários (histórico); se a entrega ainda não rodou, nada é enviado; a caixa não importa (não loga).
4. Região renomeada depois: o histórico mostra o `regionName` do momento da publicação.
5. Aviso arquivado entre a publicação e o job: nada sai.
6. Aviso arquivado já lido/não lido: some da caixa e do contador do inspetor; no detalhe da OP as leituras ficam.
7. Inspetor com 2 aparelhos: push para os dois; basta um `SENT` para não haver SMS.
8. Aparelho trocou de inspetor (logout sem desassinar + login de outro + assinar): o `endpoint` é reatribuído ao novo inspetor; o antigo perde aquela assinatura.
9. Push service responde 429/5xx/timeout em um aviso crítico: SMS (D2-a). Em não crítico: só log.
9b. Worker cai depois do commit e o enqueue se perde: em até ~7 min (2 min + ciclo de 5 min) a varredura reenfileira.
9c. Aviso de sistema com `targetPath = /schedule/<id>` de um serviço que saiu da agenda: o PWA abre a agenda e mostra o estado de "não encontrado" que já existe.
10. Inspetor sem telefone e sem push em aviso crítico: só a caixa; log `sms_skipped_no_phone`.
11. Telefone fora do E.164 AU: o pipeline existente falha como `INVALID_RECIPIENT_PHONE` sem retry (já tratado).
12. Corpo com `&`, `<`, aspas ou emoji: push leva texto puro; SMS sem escape (triple-stash); emoji vira UCS-2 (mais segmentos).
13. Texto > 300 caracteres no SMS: truncado com "… Open the Properfy app.".
14. VAPID ausente: `push-config` devolve `null`, assinar dá 503, todo crítico vai por SMS.
15. Job desligado (`ENABLE_JOB_QUEUE=false`, dev): `StubJobQueue` não entrega; a caixa funciona.
16. Marcar lido duas vezes ou em dois aparelhos: o primeiro `read_at` vence.
17. INSP pede aviso de outro inspetor pelo id: 404 (não 403), sem vazar existência.
18. Seleção com mais de 500 inspetores: 400 (a OP usa "All" ou "Region").
19. Template `INSPECTOR_NOTICE_SMS` desativado por AM no editor: o pipeline falha como `TEMPLATE_INACTIVE` (comportamento existente); sem SMS.
20. (L-F02-01) Teto diário de SMS atingido: o crítico continua na caixa e no push; destinatários sem push não recebem SMS naquele dia; warn `sms_cap_reached`. O contador zera à meia-noite de Sydney. Bug de loop num consumidor com `dedupeKey` variável fica limitado ao teto.
21. (L-F02-02) OP publica crítico às 22:40: push e SMS saem na hora (decisão explícita, sem janela de silêncio). Um enqueue perdido às 21:58 só é reenfileirado às 06:00 (varredura pausada 22:00-06:00), dentro da janela de 24 h.
22. (L-F02-03) Job expira ou esgota os retries no meio (push service em timeout): destinatários pendentes ficam com `delivery_processed_at` nulo; 20 min depois do início a varredura reenfileira (log `error delivery_incomplete`) e completa só os pendentes.
23. (L-F02-04) Chave VAPID trocada no ambiente: cada assinatura antiga recebe 401/403 no próximo envio → revogada `REJECTED`; crítico daquele envio vai por SMS; o app reassina com a chave nova no próximo carregamento.
24. (L-F02-04) Assinatura com 5 falhas `FAILED` seguidas (413, 429, 5xx repetidos): revogada `FAILED`; `push_enabled` recalculado; o app reassina no próximo carregamento se a permissão continuar `granted`.
25. (L-F02-06) Inspetor que nunca abre a caixa: avisos de sistema com mais de 30 dias são arquivados e saem do contador; avisos manuais não lidos continuam contando.
26. (L-F02-09) "All" com inspetor ACTIVE sem login (`user_id` nulo): é destinatário, recebe SMS em crítico, aparece com `hasAppAccess:false` no detalhe.
27. (L-F02-10) OP arquiva no meio da entrega: o lote em andamento termina; os lotes seguintes não enviam.
28. (L-F02-11) Inspetor desativado: assinaturas revogadas `DEACTIVATED`, `push_enabled = false`; reativado, só volta a ter push quando abrir o app (ressincronização) ou ligar de novo.
29. (L-F02-08) `targetPath` com barra final, maiúsculas no UUID ou segmento codificado: `ValidationError` no backend e fallback `/profile/announcements` no SW (mesma função).
30. (L-F08-06) Prefixo passado à leitura por prefixo com `%` ou `_` (ex.: id com sublinhado): escapado; casa só o literal, sem falso positivo de outro inspetor.

### Auditoria e observabilidade
- **Audit:** `inspector_notice.published` (USER ou SYSTEM) e `inspector_notice.archived` (USER), `entityType: 'InspectorNotice'`, `tenantId: null`, `requestId`. Marcar lido, assinar/desassinar e entrega **não** são auditados (telemetria).
- **Logs estruturados** (com `request_id`/`noticeId`): `inspector_notice.published` (info: `recipientCount`, `critical`, `audienceType`), `inspector_notice.enqueue_failed` (error), `inspector_notice.delivery_completed` (info, contadores), `inspector_notice.push_failed` (warn: `statusCode`, `inspectorId`, endpoint **mascarado** = host apenas), `inspector_notice.sweep_completed` / `.sweep_requeued`, `inspector_notice.push_gone_revoked` (info), `inspector_notice.sms_skipped_no_phone` (warn), `inspector_notice.system_no_recipients` (info), `push_subscription.upserted` / `.unsubscribed` (debug).
  - Lacunas 2026-10-29: `inspector_notice.sms_cap_reached` (warn: `cap`) e `inspector_notice.sms_burst` (warn: `smsQueued`) (L-F02-01); `sydneyHour` no `delivery_completed` e `inspector_notice.sweep_skipped_quiet_hours` (info) (L-F02-02); `inspector_notice.delivery_incomplete` (error: `pending`) (L-F02-03); `inspector_notice.push_rejected_revoked` e `inspector_notice.push_failed_revoked` (info: `inspectorId`, `statusCode`) (L-F02-04); `inspector_notice.auto_archived` e `push_subscription.purged` (info: `count`) (L-F02-06); `delivery_skipped_archived` com `processed`/`skipped` (L-F02-10); `push_subscription.revoked_on_deactivation` (info: `inspectorId`, `count`) (L-F02-11).
- **Métricas:** o `withJobMetrics` existente em `inspector-notice.deliver`, `inspector-notice.delivery-sweep` e `inspector-notice.auto-archive`; os contadores do resumo vão no log. Custo de SMS: filtrar `notifications.template_code = 'INSPECTOR_NOTICE_SMS'` (§7 do contrato); limitado pelo teto diário (L-F02-01).
- Nunca logar `p256dh`, `auth` ou o endpoint completo.

### Fora do escopo
- Avisos fixados; editar/excluir aviso publicado; SMS por "não leu em X min"; agendar publicação; anexos; respostas do inspetor; recibo de entrega do push; push no portal web; preferências por tipo de aviso (todos do plano).
- Os gatilhos de F03/F04/F08 (esta tarefa só entrega a API).
- Telas web e PWA (TASK-F02-2 e TASK-F02-3).
- Adicionar `PUSH` a `NotificationChannel` (D6).

### Critérios de aceite
1. Migration aplica limpa; as 3 tabelas não têm `tenant_id`, com a exceção registrada na spec.
2. AM/OP publicam para ALL, SELECTED e REGION; destinatários materializados só com ativos; erros 400/404/422 conforme o contrato; nenhum endpoint de edição/exclusão existe.
3. Arquivar é idempotente, gera um único audit, e o aviso some da caixa e do contador do inspetor.
4. Lista admin com `status` active/archived/all, `recipientCount` e `readCount`; detalhe com nomes e `readAt`.
5. INSP lê só os próprios avisos não arquivados; marcar lido é idempotente.
6. Assinar/desassinar mantém `inspectors.push_enabled` = existe assinatura ativa; o heartbeat não altera mais `push_enabled` (a coluna saiu da instrução SQL única de `recordAppState()`, L-F01-02).
7. A entrega segue a matriz de casos; nenhum SMS para não crítico; aviso crítico sem nenhum push `SENT` (sem assinatura, 404/410, 429, 5xx, timeout ou rede) gera SMS (D2-a).
7b. A varredura reenfileira avisos sem tentativa de entrega depois de 2 min (janela de 24 h) sem duplicar push nem SMS (D13).
7c. Dois POSTs concorrentes com a mesma `Idempotency-Key` criam um só aviso (teste DB, D16).
8. O SMS gera linha `notifications` com `tenant_id NULL`, `template_code 'INSPECTOR_NOTICE_SMS'`, `notification_class 'TRANSACTIONAL'`, e não é bloqueado por consentimento nem orçamento.
9. `PublishSystemInspectorNoticeUseCase` deriva `critical` do tipo (`COMPLETION_REMINDER` crítico), aceita `targetPath` só da allowlist, é idempotente por `dedupeKey`, devolve `{noticeId, created}` (`created:true` só na gravação) e não tem rota HTTP.
9b. (L-F08-06) `HasRecentSystemInspectorNoticeUseCase` responde por prefixo literal de `dedupe_key` e `created_at >= since`, conta arquivados e ignora manuais; exposto no container, sem rota HTTP.
10. `NotificationChannel` continua `EMAIL | SMS`: os testes **existentes** em `packages/shared/src/enums/notification.test.ts` ("exactly 2 channels", `PUSH` l. 14-16, `IN_APP` l. 18-20) seguem verdes sem alteração.
11. `api-types.ts` regenerado e commitado; `pnpm --filter backend lint typecheck test` e a suíte DB verdes.
12. **00.A2 (parte backend):** um aviso **crítico manual** publicado gera push para o inspetor com assinatura ativa e SMS para o inspetor sem push. Prova: teste DB ponta a ponta publish → `inspector-notice.deliver` → linha `notifications` SMS com repositórios reais; prova em aparelho na TASK-F02-3.
13. **00.A4 (parte backend):** o aviso publicado aparece em `GET /v1/inspectors/me/notices` do destinatário e, após `POST .../read`, o `readCount` do admin (detalhe e lista) sobe de 0 para 1 (teste de integração).
14. (L-F02-01) Com o teto diário de `INSPECTOR_NOTICE_SMS` atingido, nenhum SMS novo é criado no dia; o warn `sms_cap_reached` sai uma vez por job; `sms_burst` sai com ≥ 20 SMS num aviso.
15. (L-F02-02) A varredura não reenfileira entre 22:00 e 06:00 Sydney; o resumo da entrega traz `sydneyHour`.
16. (L-F02-03) Entrega iniciada e não concluída é reenfileirada pela varredura depois de 20 min sem repetir destinatários processados (teste DB); `delivery_completed_at` é gravado no fim; `expireInMinutes` segue `getInspectorNoticeDeliverExpireMinutes`.
17. (L-F02-04) 401/403 revogam (`REJECTED`); 5 `FAILED` seguidas revogam (`FAILED`); `SENT` e upsert zeram `failure_count`.
18. (L-F02-06) O job diário arquiva só avisos de sistema com mais de 30 dias e apaga assinaturas revogadas há mais de 90 dias.
19. (L-F02-08) `isAllowedInspectorNoticeTargetPath` segue o algoritmo de D24 e passa os casos negativos novos.
20. (L-F02-09) O detalhe traz `inspectorStatus` e `hasAppAccess` por destinatário.
21. (L-F02-10) Arquivar no meio da entrega impede os lotes seguintes.
22. (L-F02-11) Desativar um inspetor revoga as assinaturas (`DEACTIVATED`) e deixa `push_enabled = false`.

### Dependências
- TASK-F01-1 mergeada (coluna `push_enabled`, use case de heartbeat).
- Nenhuma dependência de X01/X02 no backend.

### Riscos e armadilhas
- **TRANSACTIONAL obrigatório** com `tenantId = null`: senão `consentRepo.findByScope` e o orçamento diário tentam um tenant nulo. Declarar a classe na entrada do catálogo **e** em `PROTECTED_TEMPLATE_CLASSIFICATIONS`, com teste comparando.
- **`TEMPLATE_NOT_FOUND`** é falha permanente: o `syncPlatformTemplates` cria a linha no boot; conferir no banco de staging/prod após o deploy (`SELECT template_code, channel, notification_class FROM notification_templates WHERE tenant_id IS NULL AND template_code = 'INSPECTOR_NOTICE_SMS'`).
- **Escape do Handlebars:** `{{message}}` mandaria `&amp;` por SMS; usar `{{{message}}}` (teste com `&`).
- **Enqueue fora da transação:** se o `enqueue` falhar depois do commit, a varredura (D13) reenfileira em até ~7 min. Com `ENABLE_JOB_QUEUE=false` (dev) nem a varredura roda.
- **Lock da idempotência:** o `pg_advisory_xact_lock` usa `hashtext` (int4); colisão entre chaves diferentes só serializa, não mistura resultados. O teste concorrente precisa falhar sem o lock.
- **SMS a mais (D2-a):** um push service instável em aviso crítico gera SMS mesmo que o push chegue depois. Limitado pelo teto diário (L-F02-01); medir o custo na homologação (`template_code = 'INSPECTOR_NOTICE_SMS'`) e ajustar `INSPECTOR_NOTICE_SMS_DAILY_CAP`.
- **Teto conta só o que já existe:** dois jobs de avisos diferentes em paralelo podem passar do teto por alguns SMS (checagem por leitura, sem lock). Aceito: o teto é guarda de custo, não cota exata.
- **`failure_count` concorrente:** dois jobs enviando à mesma assinatura incrementam sem lock; usar `UPDATE ... SET failure_count = failure_count + 1 ... RETURNING failure_count` (atômico) e revogar pelo valor devolvido.
- **Dia de Sydney para o teto:** calcular o início do dia com o helper de fuso existente (memória "Sydney only"), não com `new Date().setHours(0)` do servidor (UTC no Fly).
- **Serializer de resposta:** campo não declarado some, e tipo divergente faz o serializer lançar 500 pós-commit (memória). Declarar `audience` como união discriminada completa, incluindo `SYSTEM`.
- **Validação antes da auth:** nos testes de RBAC, mandar body válido; senão o 400 mascara o 403.
- **Rota estática vs `:inspectorId`:** cobrir com teste.
- **Drift de migration:** `migrate dev` pode tentar derrubar índices `Unsupported()` de `service_regions`; revisar o SQL gerado.
- **P2002 × 23505:** a corrida do `dedupe_key` pode chegar como erro Prisma `P2002` ou como 23505 cru se a escrita for raw; tratar os dois.
- **Fixtures não tipadas:** acrescentar deps a use cases existentes (container) quebra wirings de teste não tipados (memória); rodar a suíte inteira.
- **Testes de fixture:** reaproveitar o `CreateNotificationUseCase` real na suíte DB (memória "mock mascara bug real" do PR #1035).

### Deploy / rollout / rollback
1. Antes do merge: gerar chaves VAPID por ambiente (`npx web-push generate-vapid-keys`).
   - Staging: variáveis no stack do Portainer (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:<inbox de ops>`).
   - Prod: `fly secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:... -a <app prod>` (o dev executa; nunca sem pedido explícito).
   - Sem as chaves, a feature funciona com SMS para críticos (degradação segura).
   - Opcionais (L-F02-01, L-F02-06): `INSPECTOR_NOTICE_SMS_DAILY_CAP` (padrão 500) e `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (padrão 30); só definir se a homologação pedir outro valor. Em staging, um teto baixo (ex.: 20) protege o QA. Acrescentar os nomes em `apps/backend/.env.example`.
2. Merge em `develop` → DEV; migration roda no release; o boot cria o template; conferir a linha (SQL acima).
3. Staging: `SMS_TEST_RECIPIENT_ALLOWLIST` com os telefones de QA para o SMS não sair para inspetores reais; publicar aviso crítico de teste.
4. Prod: mesma conferência do template; o primeiro aviso real é o QA da TASK-F02-3.
5. Ordem entre PRs: este primeiro; web e PWA podem ir em qualquer ordem depois. O PWA em produção antes deste PR quebraria (rotas 404), por isso a ordem é obrigatória.
6. Rollback: reverter o PR. As tabelas ficam (expand); o heartbeat volta a escrever `push_enabled` pela permissão. Se o PWA já estiver no ar, reverter também a TASK-F02-3 (ou aceitar 404s silenciosos no badge e no toggle).

### Dias · Branch sugerida · Comandos de verificação
- **Dias:** 5,25 (0,5 + 0,75 + 0,5 + 0,5 + 0,75 + 0,5 + 0,25 + 0,25 + 0,5 + 0,25 + 0,25 + 0,25).
- **Branch:** `feat/f02-inspector-notices-backend` a partir de `develop`, depois da TASK-F01-1.
- **Verificação:**
  - `pnpm --filter @properfy/shared build && pnpm --filter backend exec prisma generate`
  - `pnpm --filter @properfy/shared lint typecheck test`
  - `pnpm --filter backend lint && pnpm --filter backend typecheck && pnpm --filter backend test`
  - `pnpm --filter backend test:integration:db` (testcontainers, em série)
  - `pnpm --filter backend generate:openapi && pnpm --filter @properfy/shared generate:types && git diff --stat packages/shared/src/api-types.ts`
  - `git diff --stat origin/develop... | tail -1` (≤ 150 arquivos)

---

## TASK-F02-2 · Web (AM/OP): página "Inspector notices" (lista, novo aviso, detalhe com leituras, arquivar)

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F02-1, TASK-X01-1, TASK-F01-2
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F04-1, TASK-F02-3
> - **Pista sugerida (time de 6):** D · Web

### Objetivo
- A OP publica avisos para os inspetores (todos os ativos, seleção manual ou uma região), marcando ou não como críticos.
- A OP vê o histórico (ativos/arquivados), quem leu (X/Y e nomes) e arquiva.
- Entrada pelo menu lateral, grupo "Dashboard" → "Inspector notices" (AM/OP).

### Contexto no código
Caminhos relativos a `apps/web/src/`.

- **Router:** `app/router.tsx` (rotas sob o layout autenticado; `AuthGuard roles={[UserRole.AM, UserRole.OP]}` como em `inspector-workload` l. 170-174 e `service-groups` l. 305-325).
- **Menu:** `components/shell/Sidebar.tsx` (`NAV_ITEMS`, `filterNavItems`). Após a TASK-X01-1, o primeiro item é o grupo "Dashboard" com `collapseIfSingle: true` e filhos Overview/Analytics/Workload (Live Day entra com a F05), em ordem canônica fixa; `NAV_ITEMS` e `filterNavItems` exportados. Testes em `components/shell/Sidebar.roles.test.tsx` (sem mocks de `SidebarSubmenu`/`SidebarItem` após a X01) e `Sidebar.test.tsx`.
- **Cabeçalho/voltar:** `components/layout/PageHeader.tsx` (com `backTo` após a TASK-X01-1) e `components/layout/BackButton.tsx` (X01).
- **Lista:** `components/layout/templates/ListFilterTableTemplate.tsx`, `components/data/DataTable.tsx` (com `DataTablePagination`), padrão de `features/service-regions/pages/ServiceRegionListPage.tsx` + `hooks/useServiceRegionList.ts` (`usePaginatedQuery`, volta à página 1 ao mudar filtro).
- **Formulário/painel:** `components/ui/DrawerPanel.tsx`, `components/ui/DrawerHeader.tsx`, `components/ui/ConfirmDialog.tsx`, `components/forms/{FormField,TextInput,Textarea,SelectInput,Checkbox,FormActions}.tsx`, `components/filters/FilterSegmented.tsx`, `components/feedback/{EmptyState,ErrorState,LoadingState,InfoBanner}.tsx`, `components/ui/StatusChip.tsx`, `hooks/useSnackbar.tsx`, `hooks/useApiQuery.ts`, `services/api.ts` (openapi-fetch com `api-types.ts` do shared).
- **Inspetores:** `GET /v1/inspectors?status=ACTIVE&pageSize=100` (paginação máx. 100, `packages/shared/src/schemas/pagination.ts`); padrão de carga de opções em `features/appointments/hooks/useAppointmentFilterOptions.ts`.
- **Regiões:** `GET /v1/service-regions?status=ACTIVE&pageSize=100`; o item traz `inspectorCount` (`packages/shared/src/schemas/service-region.ts:65`).
- Não existe multi-select de formulário genérico no web (`components/filters/FilterMultiSelect.tsx` é de barra de filtros).
- **Inspetores (F01-2):** a coluna "Push" da tabela e o campo "Push notifications" do detalhe do inspetor, com tooltip de On/Off "Browser notification permission on the last device seen" (TASK-F01-2, L-F01-08), trocado aqui pela copy de assinatura de D10 (UI 5).
- Datas: fuso Sydney (`lib/format-date.ts`, `lib/display-timezone.ts`).

### Decisões aplicáveis
D1 (só a marcação manual de crítico existe na UI), D2 (texto do aviso de SMS), D3, D4, D8, D10 (copy do tooltip), D12. Todas de 2026-10-27. D17, D18, D23, D25 (2026-10-29), com as regras abaixo:

- **2026-10-29 · L-F02-01 (D17) · Tamanho do público no ConfirmDialog de crítico.** Quando `critical` está marcado, o ConfirmDialog acrescenta "Up to {N} inspectors may receive an SMS." (singular "Up to 1 inspector may receive an SMS."). `N` = tamanho do público escolhido: ALL → `pagination.total` de `GET /v1/inspectors?status=ACTIVE&pageSize=1` (carregado ao escolher "All"); REGION → `inspectorCount` da região escolhida; SELECTED → tamanho da seleção. Se a contagem de ALL falhar ou ainda estiver carregando: "Inspectors without push may receive an SMS." (sem número; não bloqueia publicar). Não é prévia de destinatários (continua fora do escopo): é só o tamanho do público, como teto.
- **2026-10-29 · L-F02-02 (D18) · Aviso de horário.** Sem janela de silêncio. Quando `critical` e a hora atual em Sydney está em `[21:00, 07:00)`, o ConfirmDialog acrescenta "It's {h:mm a} in Sydney. Inspectors will be notified now." (ex.: "It's 10:40 pm in Sydney. Inspectors will be notified now."). Não críticos não mostram.
- **2026-10-29 · L-F02-07 (D23) · Hint de tela bloqueada.** O campo Message ganha a segunda linha de hint: "Shown on the lock screen. Don't include keys, codes or tenant details."
- **2026-10-29 · L-F02-09 (D25) · Destinatários sem acesso.** No detalhe, ao lado do nome: chip "Inactive" (muted) quando `inspectorStatus === 'INACTIVE'` e chip "No app access" (muted) quando `hasAppAccess === false`. O resumo vira "Read by X of Y (Z can't read in the app)" quando `Z > 0`, com `Z` = destinatários **não lidos** com `inspectorStatus === 'INACTIVE'` ou `hasAppAccess === false`; com `Z = 0` fica "Read by X of Y". A barra de progresso continua X/Y. A lista admin continua "X/Y" simples.

### Contratos consumidos
Todos da TASK-F02-1: `POST /v1/inspector-notices` (+ `Idempotency-Key`), `GET /v1/inspector-notices`, `GET /v1/inspector-notices/:noticeId`, `POST /v1/inspector-notices/:noticeId/archive`, com os códigos de erro da tabela de contratos. Schemas `publishInspectorNoticeSchema`, `INSPECTOR_NOTICE_TITLE_MAX/BODY_MAX/SELECTED_MAX` do shared.

### Testes primeiro (TDD)

**Unit (Vitest + RTL)**

`components/shell/Sidebar.roles.test.tsx` (modificar):

| Caso | Papel | Esperado |
|---|---|---|
| N1 | AM, OP | ao abrir o flyout "Dashboard": `menuitem` "Inspector notices" com `href="/inspector-notices"`, na posição canônica de X01: depois de Live Day (F05, se já mergeada; senão depois de Overview) e antes de Analytics (L-X01-03). Asserção por rótulo e ordem relativa a Analytics, nunca índice nem contagem; render com `MemoryRouter` sem mocks de `SidebarSubmenu`/`SidebarItem` (L-X01-02) |
| N2 | CL_ADMIN, CL_USER | sem "Inspector notices"; grupo com Overview + Analytics (inalterado) |
| N3 | INSP | item simples "Dashboard" (inalterado); sem "Inspector notices" |

`features/inspector-notices/pages/InspectorNoticeListPage.test.tsx` (novo):

| Caso | Entrada | Esperado |
|---|---|---|
| linhas | 2 avisos (1 crítico ALL 3/10, 1 REGION "North Shore" 0/4) | título; chip "Critical" só no primeiro; "All active inspectors"; "Region: North Shore"; "3/10" e "0/4"; status "Active" |
| autor | sistema / usuário | "System" / "Ana Op" |
| SELECTED | `inspectorIds.length=3` | "3 selected inspectors" |
| SYSTEM | `{type:'SYSTEM'}` | "Automatic" |
| filtro | clicar "Archived" | nova query com `status=archived`, `page=1` |
| vazio (active) | `[]` | EmptyState "No notices yet" + botão "New notice" |
| vazio (archived) | `[]` | "No archived notices" (sem CTA) |
| erro | 500 | ErrorState "Couldn't load notices." + "Retry" que refaz a query |
| carregando | pendente | LoadingState/skeleton da tabela |
| navegação | clicar na linha / Enter na linha | `navigate('/inspector-notices/<id>')` |

`features/inspector-notices/components/NewInspectorNoticeDrawer.test.tsx` (novo):

| Caso | Ação | Esperado |
|---|---|---|
| obrigatórios | Publish vazio | "Title is required", "Message is required"; nenhum POST |
| limites | título 121 chars | "Title must be 120 characters or fewer"; contador "121/120" em erro |
| contador | digitar | "12/120" e "34/2000" atualizam (`aria-live="polite"`) |
| seleção vazia | Audience "Selected inspectors", nada marcado | "Select at least one inspector" |
| região vazia | Audience "Region", sem escolha | "Select a region" |
| confirmar não crítico | Publish válido | ConfirmDialog título "Publish notice?" corpo "Notices can't be edited or deleted after publishing. You can archive them later." |
| confirmar crítico | `critical` marcado | corpo acrescenta "Critical notices are sent by push, or by SMS to inspectors without push." |
| crítico REGION (L-F02-01) | região "North Shore (8 inspectors)" | corpo acrescenta "Up to 8 inspectors may receive an SMS." |
| crítico SELECTED (L-F02-01) | 1 marcado | "Up to 1 inspector may receive an SMS." |
| crítico ALL (L-F02-01) | `GET /v1/inspectors?status=ACTIVE&pageSize=1` → `pagination.total = 42` | "Up to 42 inspectors may receive an SMS." |
| crítico ALL, contagem falhou (L-F02-01) | GET → 500 | "Inspectors without push may receive an SMS."; botão "Publish" habilitado |
| não crítico | `critical` desmarcado | nenhuma frase de SMS nem de horário |
| horário noturno (L-F02-02) | clock `2026-11-10T11:40:00Z` (22:40 Sydney), crítico | corpo acrescenta "It's 10:40 pm in Sydney. Inspectors will be notified now." |
| horário diurno (L-F02-02) | clock `2026-11-09T23:00:00Z` (10:00 am Sydney), crítico | sem a frase de horário |
| bordas (L-F02-02) | 20:59 → sem frase; 21:00 → com frase; 06:59 → com frase; 07:00 → sem frase (horário de Sydney) | conforme |
| hint (L-F02-07) | abrir o drawer | Message com hint "Shown on the lock screen. Don't include keys, codes or tenant details." ligado por `aria-describedby` |
| payload | confirmar | POST com `{title, body, critical, audience:{type:'REGION', regionId}}` e header `Idempotency-Key` UUID |
| retry mesma chave | 1º POST falha por rede, clicar de novo | 2º POST com a **mesma** `Idempotency-Key` |
| chave nova | reabrir o drawer após sucesso | chave diferente |
| 422 NO_RECIPIENTS | resposta | InfoBanner de erro "No active inspectors match this audience." no drawer; drawer aberto |
| 400 INVALID_RECIPIENTS | `details.inspectorIds=[x]` | "Some selected inspectors are no longer active. Review the selection." e os ids inválidos desmarcados na lista |
| 422 REGION_INACTIVE | | "This region is inactive. Choose another region." |
| sucesso | 201 | snackbar "Notice published to 12 inspectors"; drawer fecha; lista invalidada |
| descartar | form sujo, "Cancel" ou Esc | ConfirmDialog "Discard this notice?" ("Discard"/"Keep editing") |

`features/inspector-notices/components/InspectorMultiSelect.test.tsx` (novo):

| Caso | Esperado |
|---|---|
| carga | busca todas as páginas de `GET /v1/inspectors?status=ACTIVE&pageSize=100` até `page = totalPages`; lista ordenada por nome |
| busca | "jo" filtra por nome/e-mail (case-insensitive) |
| marcar | checkbox marca; resumo "2 selected" |
| selecionar visíveis | "Select all shown" marca só os filtrados; "Clear" limpa tudo |
| teclado | Tab entra na busca, setas não são exigidas (checkboxes nativos), Espaço marca |
| erro | "Couldn't load inspectors." + "Retry" |
| > 500 | ao passar de 500 marcados: erro "You can select up to 500 inspectors. Use All active inspectors or Region instead." |

`features/inspector-notices/components/RegionSelect.test.tsx` (novo): opções "North Shore (8 inspectors)"; região com 0 inspetores aparece com "(0 inspectors)" e, se escolhida, aviso "This region has no inspectors."; erro de carga com Retry.

`features/inspector-notices/pages/InspectorNoticeDetailPage.test.tsx` (novo):

| Caso | Esperado |
|---|---|
| cabeçalho | `PageHeader` com Back (fallback `/inspector-notices`), título, chip "Critical" se crítico, chip "Archived" se arquivado |
| Back P-b (L-X01-08) | entrada direta (primeira entrada do histórico) com o papel **OP** (o mais restrito que acessa a tela) → clicar Back | navega para `/inspector-notices` e a lista renderiza (o `AuthGuard` do fallback aceita AM/OP, os mesmos papéis do detalhe); sem override `onBack` |
| meta | "Published 10 Nov 2026, 9:30 am" (Sydney), "By Ana Op" / "By System", audiência como na lista |
| corpo | texto com quebras de linha preservadas (`whitespace-pre-wrap`), sem HTML interpretado |
| leituras | "Read by 3 of 10" + barra de progresso com `aria-valuenow=3 aria-valuemax=10` |
| tabela | colunas Inspector, Status ("Read"/"Unread"), Read at; não lidos primeiro |
| sem acesso (L-F02-09) | 10 destinatários, 3 lidos, 1 não lido INACTIVE e 1 não lido `hasAppAccess:false` → "Read by 3 of 10 (2 can't read in the app)"; chips "Inactive" e "No app access" ao lado dos nomes |
| sem acesso lido (L-F02-09) | destinatário INACTIVE que já leu → chip "Inactive" aparece, mas não entra no `Z` |
| todos com acesso | `Z = 0` → "Read by 3 of 10" sem parênteses |
| abas | "All (10)", "Read (3)", "Unread (7)" filtram no cliente |
| arquivar | botão "Archive" → ConfirmDialog "Archive this notice?" / "It will be removed from inspectors' announcements. It stays here and in the audit log." → POST → snackbar "Notice archived"; botão some; InfoBanner "This notice is archived. Inspectors no longer see it." |
| arquivado | sem botão "Archive" |
| 404 | EmptyState "Notice not found" + link "Back to notices" |
| erro | ErrorState + Retry |

`app/router.test.tsx` (ou teste de rotas existente): `/inspector-notices` e `/inspector-notices/:id` renderizam para AM/OP e redirecionam/negam para CL_ADMIN, CL_USER e INSP como os demais `AuthGuard`.

Tooltip (F01-2): teste existente da coluna "Push" (e do campo do detalhe) deixa de esperar "Browser notification permission on the last device seen" e passa a esperar o texto novo "Push is on for at least one of the inspector's devices" (On) / "No device has push turned on" (Off).

**E2E:** sem Playwright novo (o QA ponta a ponta é manual, na TASK-F02-3).

### Escopo / Passos

- [ ] **1. Lista + filtros + hooks + tipos** (web/feature, 0,5)
  - Novo: `features/inspector-notices/index.ts`, `types/index.ts`, `hooks/useInspectorNoticeList.ts`, `pages/InspectorNoticeListPage.tsx`, `components/InspectorNoticeTable.tsx`, `lib/format-audience.ts` (+ testes).
- [ ] **2. Drawer "New notice"** (web/feature, 0,75)
  - Novo: `components/NewInspectorNoticeDrawer.tsx`, `components/InspectorMultiSelect.tsx`, `components/RegionSelect.tsx`, `hooks/usePublishInspectorNotice.ts`, `hooks/useActiveInspectorOptions.ts`, `hooks/useActiveRegionOptions.ts` (+ testes).
  - Lacunas 2026-10-29: `hooks/useActiveInspectorCount.ts` (`pageSize=1`, lê `pagination.total`, só habilitado com Audience "All"), `lib/critical-confirm-copy.ts` (monta as frases de SMS e de horário a partir de `{critical, audienceSize, now}`; hora de Sydney via `lib/display-timezone.ts`) (+ testes) (L-F02-01, L-F02-02); hint de tela bloqueada no Message (L-F02-07).
- [ ] **3. Detalhe + arquivar** (web/feature, 0,25)
  - Novo: `pages/InspectorNoticeDetailPage.tsx`, `hooks/useInspectorNoticeDetail.ts`, `hooks/useArchiveInspectorNotice.ts` (+ testes). Inclui chips "Inactive"/"No app access" e o "(Z can't read in the app)" (L-F02-09).
- [ ] **4. Menu + rotas + tooltip do Push** (web/shell, 0,25)
  - Modify: `components/shell/Sidebar.tsx` (filho no grupo Dashboard), `components/shell/Sidebar.roles.test.tsx`, `app/router.tsx`.
  - Modify: os 2 pontos de copy do tooltip "Push" criados pela TASK-F01-2 (tabela e detalhe de inspetor) e seus testes.

**Total: 0,5 + 0,75 + 0,25 + 0,25 = 1,75 dia.** Arquivos estimados: ~34.

### UI por tela

**1. Menu** — no `submenu` do grupo "Dashboard" (X01), na posição da ordem canônica (L-X01-03): Overview · Live Day (F05) · **Inspector notices** · Analytics · Workload · … Ou seja, **entre Live Day e Analytics** (se a F05 ainda não mergeou, entre Overview e Analytics):

```ts
{ icon: 'mdi-bullhorn-outline', label: 'Inspector notices', to: '/inspector-notices', roles: [UserRole.AM, UserRole.OP] }
```
Grupo fica ativo também em `/inspector-notices/*`. Nenhuma tela de dashboard existente muda.

**2. `/inspector-notices` — lista** (tela de topo do menu: **sem** Back)
- `ListFilterTableTemplate` com título "Inspector notices", subtítulo "Messages sent to inspectors' app", `primaryAction` "New notice" (ícone `mdi-plus`).
- Filtro: `FilterSegmented` "Status": **Active** (padrão) / **Archived** / **All**. Mudar volta à página 1.
- Colunas:
  - **Title**: título (truncado em 1 linha, `title` attr com o completo) + chip "Critical" (tom `danger`) quando `critical`;
  - **Audience**: "All active inspectors" / "N selected inspectors" / "Region: {regionName}" / "Automatic" (SYSTEM);
  - **Published**: data e hora Sydney ("10 Nov 2026, 9:30 am");
  - **Author**: nome do usuário ou "System";
  - **Read**: "X/Y" + mini barra (decorativa, `aria-hidden`; o texto é o nome acessível);
  - **Status**: chip "Active" (neutro) / "Archived" (muted).
- Ordem: `publishedAt` desc (fixa, sem ordenação por coluna). Paginação 20 por página (opções 10/20/50).
- Linha inteira clicável e focável (Enter abre), `aria-label="Open notice {title}"`.
- Estados: carregando (skeleton da tabela); erro ("Couldn't load notices." + "Retry"); vazio Active ("No notices yet" / "Publish a notice to reach inspectors in their app." + "New notice"); vazio Archived ("No archived notices"); vazio All ("No notices yet").

**3. Drawer "New notice"** (`DrawerPanel` à direita; no mobile ocupa a tela)
- Cabeçalho "New notice"; fechar (X) com confirmação se sujo.
- Campos (react-hook-form + `zodResolver(publishInspectorNoticeSchema)` com mensagens próprias):
  - **Title** (`TextInput`, obrigatório, contador "n/120"). Erros: "Title is required", "Title must be 120 characters or fewer".
  - **Message** (`Textarea`, 6 linhas, obrigatório, contador "n/2000", texto puro). Erros: "Message is required", "Message must be 2000 characters or fewer". Hint: "Plain text. Inspectors see it in the app's Announcements." + segunda linha (L-F02-07): "Shown on the lock screen. Don't include keys, codes or tenant details."
  - **Audience** (`fieldset` com `legend` "Audience", radios): "All active inspectors" (padrão) / "Selected inspectors" / "Region".
    - "Selected inspectors" → `InspectorMultiSelect`: busca ("Search inspectors"), lista com checkbox (nome + e-mail), altura máx. 280 px com rolagem, "Select all shown", "Clear", resumo "N selected". Erros: "Select at least one inspector"; "You can select up to 500 inspectors. Use All active inspectors or Region instead."
    - "Region" → `RegionSelect` (`SelectInput`): "Choose a region", opções "{name} ({inspectorCount} inspectors)", só ACTIVE. Erro: "Select a region". Com 0 inspetores: hint em warning "This region has no inspectors."
  - **Critical** (`Checkbox`): "Mark as critical". Descrição: "Sent by push, or by SMS to inspectors without push. Use for urgent operational changes."
- Ações (`FormActions`): "Cancel" / "Publish" (primário). Publish valida e abre ConfirmDialog:
  - título "Publish notice?";
  - corpo "Notices can't be edited or deleted after publishing. You can archive them later." (+ crítico: "Critical notices are sent by push, or by SMS to inspectors without push.");
  - crítico, em parágrafo próprio (L-F02-01): "Up to {N} inspectors may receive an SMS." (fallback sem número: "Inspectors without push may receive an SMS.");
  - crítico entre 21:00 e 07:00 Sydney (L-F02-02): "It's {h:mm a} in Sydney. Inspectors will be notified now." (hora calculada ao abrir o ConfirmDialog);
  - botões "Publish" / "Back to editing".
- Envio: `Idempotency-Key` = `crypto.randomUUID()` gerado ao abrir o drawer e mantido até sucesso ou fechamento. Durante o envio: botão "Publishing…" desabilitado, campos `disabled`.
- Sucesso: snackbar "Notice published to {recipientCount} inspectors" (singular "1 inspector"); fecha; invalida `['inspector-notices']`.
- Erros: mapeados como na tabela de testes, em `InfoBanner` de erro no topo do drawer (`role="alert"`); erro genérico "Couldn't publish the notice. Try again."; offline: "You're offline. Check your connection and try again."
- Acessibilidade: foco inicial no Title; `aria-describedby` em erros e contadores; Esc fecha (com confirmação se sujo) e devolve o foco ao "New notice"; alvos ≥ 44 px; contraste AA dos chips.

**4. `/inspector-notices/:noticeId` — detalhe** (sub tela: `PageHeader backTo="/inspector-notices"`, padrão X01; regra de fallback por papel de L-X01-08 atendida: o `AuthGuard` de `/inspector-notices` inclui todos os papéis do detalhe, AM/OP; se um dia houver override, usa `onBack(goBack)`)
- Cabeçalho: Back, título do aviso, chips "Critical"/"Archived"; ação "Archive" (secundária, só se ativo).
- Bloco meta: "Published {data}", "By {autor}", "Audience: {texto}".
- Corpo: card com o texto (`whitespace-pre-wrap break-words`), sem interpretar HTML.
- Leituras: "Read by X of Y" (ou "Read by X of Y (Z can't read in the app)" quando há não lidos inativos/sem acesso ao app, L-F02-09) + `role="progressbar"` com `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=Y`, `aria-label="Read progress"`.
- Abas (`TabsNav` ou `FilterSegmented`): "All (Y)", "Read (X)", "Unread (Y−X)", filtro no cliente.
- Tabela: Inspector (nome + chips "Inactive" / "No app access" em tom muted quando aplicável, L-F02-09), Status (chip "Read" sucesso / "Unread" muted), Read at (data e hora Sydney ou "—"). Ordem do backend (não lidos primeiro, depois nome).
- Arquivar: ConfirmDialog "Archive this notice?" / "It will be removed from inspectors' announcements. It stays here and in the audit log." / "Archive" (tom perigo) / "Cancel". Sucesso: snackbar "Notice archived"; refetch; InfoBanner "This notice is archived. Inspectors no longer see it."
- Estados: carregando (skeleton); 404 ("Notice not found" + "Back to notices"); erro ("Couldn't load this notice." + "Retry").

**5. Tooltip "Push" (F01-2)** — só copy (D10): On → "Push is on for at least one of the inspector's devices"; Off → "No device has push turned on"; "—" continua "No data yet".

### Casos de borda
1. OP clica Publish duas vezes ou a rede cai no meio: a mesma `Idempotency-Key` garante um só aviso.
2. Inspetor desativado entre abrir o drawer e publicar (SELECTED): 400 com os ids; são desmarcados e a OP republica.
3. Região desativada entre carregar e publicar: 422 com a mensagem da região.
4. Mais de 100 inspetores ativos: o multi-select pagina até o fim antes de habilitar a busca (loader "Loading inspectors…").
5. Aviso com muitos destinatários (centenas): a tabela do detalhe renderiza tudo (sem paginação; volume da plataforma é de dezenas).
6. Aviso de sistema (F04/F08, futuro) na lista: autor "System", audiência "Automatic", arquivável como qualquer outro.
7. Arquivar um aviso já arquivado em outra aba: 200 idempotente; a tela atualiza para arquivado.
8. CL/INSP digitando a URL: `AuthGuard` nega como nas outras telas AM/OP.
9. Título longo na lista: truncado com reticências; completo no detalhe e no `title`.
10. (L-F02-01) Contagem de ativos para "All" falha ou demora: o ConfirmDialog usa a frase sem número; publicar não é bloqueado.
11. (L-F02-01) Região com `inspectorCount` que inclui inativos: o número é teto ("Up to"), não exato.
12. (L-F02-02) OP com o navegador em outro fuso: a frase de horário usa sempre a hora de Sydney.
13. (L-F02-02) ConfirmDialog aberto às 20:59 e confirmado às 21:01: a frase reflete a hora de quando o diálogo abriu (sem relógio vivo).
14. (L-F02-09) Destinatário desativado depois de ler: chip "Inactive" aparece, mas ele conta como lido e não entra no "can't read".
15. (L-F02-06) Avisos de sistema com mais de 30 dias aparecem como "Archived" (arquivados automaticamente, sem audit por linha).

### Auditoria e observabilidade
- A auditoria é do backend (`inspector_notice.published`/`.archived`). O web não loga nada novo.

### Fora do escopo
- Editar/excluir aviso; agendamento; anexos; prévia da lista de destinatários antes de publicar (o ConfirmDialog de crítico mostra só o tamanho do público como teto de SMS, L-F02-01); janela de silêncio (L-F02-02, decisão explícita); reenviar push/SMS; filtro por origem (manual/sistema) ou busca por título; qualquer mudança nas telas de dashboard existentes.

### Critérios de aceite
1. AM/OP veem "Inspector notices" no grupo "Dashboard", entre Live Day e Analytics (ordem canônica da X01); CL_ADMIN/CL_USER/INSP não, e a rota nega acesso a eles.
2. Lista com filtro Active/Archived/All, colunas do contrato, X/Y de leituras, estados de loading/vazio/erro.
3. "New notice" publica para os 3 públicos, com validação, confirmação (texto de crítico), `Idempotency-Key` estável no retry e mensagens para cada erro do contrato.
4. Detalhe mostra "Read by X of Y" e os nomes com status e hora; arquivar com confirmação, idempotente.
5. Não existe UI de edição ou exclusão.
6. Tooltip "Push" do inspetor reflete D10.
7. **00.A4 (painel):** após o inspetor abrir o aviso no app, o detalhe mostra a leitura (nome com "Read" e a hora) e o X/Y sobe.
8. `pnpm --filter web lint typecheck test` verdes (`--max-warnings 0`).
9. (L-F02-01) ConfirmDialog de crítico mostra "Up to N inspectors may receive an SMS." com N do público (ALL/REGION/SELECTED) ou o fallback sem número.
10. (L-F02-02) ConfirmDialog de crítico entre 21:00 e 07:00 Sydney mostra a frase de horário.
11. (L-F02-07) O campo Message mostra o hint de tela bloqueada.
12. (L-F02-09) O detalhe mostra chips "Inactive"/"No app access" e "(Z can't read in the app)".

### Dependências
- TASK-F02-1 mergeada (rotas + `api-types.ts`).
- TASK-X01-1 mergeada (grupo "Dashboard", `PageHeader backTo`/`BackButton`).
- TASK-F01-2 mergeada (tooltip "Push").

### Riscos e armadilhas
- **Build do shared** antes do typecheck do web (importa o dist).
- **Cache incremental do typecheck do web mente** (memória): rodar limpo antes do PR.
- **openapi-fetch:** rotas com só 200 declarado tipam `error` como `never`; tratar erro pelo status/`response` (memória). Declarar 201/400/404/422 no backend ajuda.
- **`findBy` em transição de estado** pode correr (memória): usar `waitFor` nos testes de sucesso do drawer.
- **jsdom localStorage** instável: não usar storage nesta tela.
- **Lint zero warnings** (`--max-warnings 0`) e jsx-a11y: linha clicável precisa de `tabIndex=0` + `onKeyDown` (padrão do `DataTable`).

### Deploy / rollout / rollback
1. Merge depois da TASK-F02-1 (as rotas precisam existir).
2. Sem migration nem env.
3. Rollback: reverter o PR; os avisos continuam no banco e os inspetores seguem lendo no app.

### Dias · Branch sugerida · Comandos de verificação
- **Dias:** 1,75 (0,5 + 0,75 + 0,25 + 0,25).
- **Branch:** `feat/f02-inspector-notices-web` a partir de `develop`, depois da TASK-F02-1 e da TASK-X01-1.
- **Verificação:** `pnpm --filter @properfy/shared build && pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test`; smoke no navegador com o backend local (AM e OP publicam; CL_ADMIN não vê o item).

---

## TASK-F02-3 · PWA: `sw.ts` (injectManifest + push), controle de push em `/profile/settings`, caixa "Announcements" com badge + QA

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F02-1, TASK-F01-3
> - **Dependência parcial:** TASK-F02-2: só para o QA ponta a ponta.
> - **Desbloqueia:** TASK-F04-3, TASK-F08-4
> - **Pode rodar em paralelo com:** TASK-F04-1, TASK-F02-2, TASK-F04-2
> - **Pista sugerida (time de 6):** C · PWA

### Objetivo
- Trocar o service worker de `generateSW` para `injectManifest` com `src/sw.ts`, preservando precache, fallback de navegação, `runtimeCaching` e `autoUpdate`, e acrescentando `push` e `notificationclick`.
- Preencher o slot reservado pela F01 em `/profile/settings` com o controle "Push notifications" (liga/desliga a assinatura **deste dispositivo**).
- Criar a caixa "Announcements" (sem fixados) em `/profile`, com badge de não lidos; a leitura é marcada ao abrir o aviso.
- QA ponta a ponta da F02 em aparelho (00.A2 e 00.A4).

### Contexto no código
Caminhos relativos a `apps/pwa/`.

- **SW atual:** `vite.config.ts` usa `VitePWA({ registerType: 'autoUpdate', includeAssets, manifest, workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'], runtimeCaching: [...] } })` (l. 9-75): 5 rotas:
  1. `^https://fonts.googleapis.com/.*` CacheFirst `google-fonts-cache` (10 entradas, 1 ano);
  2. `^https://fonts.gstatic.com/.*` CacheFirst `gstatic-fonts-cache` (10, 1 ano);
  3. `/v1/inspector/schedule` NetworkFirst `api-schedule-cache` (50, 24 h, timeout 10 s);
  4. `/v1/inspector/appointments/.*` NetworkFirst `api-appointment-cache` (100, 5 min, timeout 10 s);
  5. `/v1/marketplace/offers` NetworkOnly.
  - O `generateSW` do vite-plugin-pwa aplica por padrão `navigateFallback: 'index.html'`, `cleanupOutdatedCaches`, e com `autoUpdate` usa `skipWaiting` + `clientsClaim`.
- **Registro do SW:** automático pelo plugin (`injectRegister` padrão); `src/main.tsx` não registra nada; `src/vite-env.d.ts` referencia `vite-plugin-pwa/client`.
- **Deps:** `vite-plugin-pwa@^0.21.1` (workbox 7.x por baixo); não há `workbox-*` diretos.
- **Logout:** `src/hooks/useAuth.tsx` l. 10-12 `INSPECTOR_API_CACHES = ['api-schedule-cache', 'api-appointment-cache']` (nomes **acoplados** ao SW) e `logout` (l. 158-168, **síncrono**, tipo `logout: () => void` na l. 54): `api.POST('/v1/auth/logout')` sem await, limpa tokens, `queryClient.clear()`, `clearInspectorCachedData()`.
  - Chamadores: `features/profile/pages/ProfilePage.tsx:108` (`onClick={logout}`, botão "Log out"), `features/profile/components/ChangePasswordSection.tsx:89` (logout depois de trocar a senha), `features/auth/pages/DeactivatedPage.tsx:11`, `features/auth/pages/AccessDeniedPage.tsx:11`.
- **Rotas:** `src/app/router.tsx` l. 173-182: `profile` com `ProfileLayout` (`handle: { wide: true }`) e filhos `availability|documents|account|settings|edit`.
- **Layout do perfil:** `src/features/profile/pages/ProfileLayout.tsx`: `hasSelection = useMatch('/profile/:section') !== null` (só 1 segmento) + `TwoPaneLayout fillHeight`.
- **Perfil:** `src/features/profile/pages/ProfilePage.tsx` (cartão de identidade + grade 2×2 de `ProfileTile`: Earnings, Availability, Documents, My account); `components/ProfileTile.tsx` (`tone` com ponto de status, `aria-label` = label + value).
- **Settings:** `src/features/profile/pages/ProfileSettingsPage.tsx` (`TopBar title="App settings" showBack backTo="/profile" backHideOnWide`, `InstallAppCard`; após a TASK-F01-3: `<div data-testid="push-preference-slot" />` como primeiro filho, depois `InstallAppCard`, e por último o rodapé `Properfy Inspector v{__APP_VERSION__}` = `v{pkg.version}+{sha7}`, L-F01-04/L-F01-12). Entrada por `ProfileAccountPage.tsx:255` ("App settings").
- **Navegação:** `src/components/shell/BottomNavBar.tsx` (Schedule, Offers, Earnings, Profile com `NavLink`), `PwaLayout.tsx`, `TopBar.tsx`, `TwoPaneLayout.tsx`.
- **UI:** `src/components/ui/{Badge,Button,Card,MenuRow,Skeleton,Alert}.tsx`; `hooks/useApiQuery.ts` (`useDetailQuery`, `useListQuery`, `apiGet`, `apiPost`), `services/api.ts`, `hooks/useEffectiveTimezone.ts`, `lib/format-date.ts`, `hooks/useIsOnline.ts`.
- **Instalação:** `src/app/useInstallPrompt.tsx` (`getIsStandalone()` exportada pela TASK-F01-3; `getIsIosSafariEligible`).
- **Testes:** `src/features/profile/pages/__tests__/*`, `src/components/shell/__tests__/{BottomNavBar,PwaLayout}.test.tsx`; e2e Playwright em `tests/e2e/` rodando no job de CI `test-pwa-e2e` (gate de deploy, TASK-X03), com `loginAsInspector` + `BASELINE_STUBS` em `tests/e2e/support/auth.ts` e catch-all 501 `E2E_UNMOCKED` (L-X03-05).

### Decisões aplicáveis
D2/D2-a (só o backend decide SMS; o PWA não mostra nada de SMS), D4 (arquivado some da caixa), D5 (único controle = push), D6, D10, D11 (2026-10-27); D14 (selo na aba Profile), D15 (allowlist de destino no SW) (2026-10-28); D20, D21, D24 (2026-10-29), com as regras abaixo:

- **2026-10-29 · L-F02-04 (D20) · Reassinar quando a chave VAPID muda.** Em `usePushSubscription` (ao montar) e em `usePushSubscriptionSync` (a cada carregamento), com assinatura local e `push-config.vapidPublicKey` não nulo: comparar os bytes de `subscription.options.applicationServerKey` com `urlBase64ToUint8Array(vapidPublicKey)` (`keysEqual` em `src/features/push/lib/vapid.ts`). Se diferirem → `subscription.unsubscribe()` e, com `Notification.permission === 'granted'`, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <chave atual> })` (não exige gesto porque a permissão já existe) e `POST /v1/inspectors/me/push-subscriptions`. Sem permissão `granted` → só desassina localmente (estado `off`/`blocked`). `applicationServerKey` nulo na assinatura local (navegadores antigos) → não compara (segue o fluxo atual). O backend já revoga a assinatura antiga como `REJECTED` no 401/403 (TASK-F02-1).
- **2026-10-29 · L-F02-05 (D21) · Precedência fixa dos estados do controle.** `usePushSubscription` resolve o estado nesta ordem, parando no primeiro que casar:
  1. `getIsIosSafariEligible() && !getIsStandalone()` → `ios-needs-install` (iOS Safari fora do standalone não tem `PushManager`; sem esta ordem o inspetor veria "unsupported" e nunca descobriria o caminho);
  2. sem `navigator.serviceWorker` **ou** sem `PushManager` **ou** sem `Notification` → `unsupported`;
  3. `Notification.permission === 'denied'` → `blocked`;
  4. `push-config.vapidPublicKey === null` → `unavailable`;
  5. `getSubscription()` não nulo → `on` (depois da checagem de chave de L-F02-04); nulo → `off`.
- **2026-10-29 · L-F02-08 (D24) · Allowlist no SW.** O SW usa a mesma `isAllowedInspectorNoticeTargetPath` do shared (algoritmo exato: segmento a segmento, UUID minúsculo, sem barra final, sem `%`/`?`/`#`/`//`/`\`, ≤ 200 chars); nenhuma normalização local antes de chamar (ex.: não aplicar `toLowerCase`).

### Contratos consumidos
Da TASK-F02-1: `GET /v1/inspectors/me/notices` (`{data, pagination}`, sem contador), `GET /v1/inspectors/me/notices/unread-count` (única fonte do selo), `GET /v1/inspectors/me/notices/:noticeId`, `POST /v1/inspectors/me/notices/:noticeId/read`, `GET /v1/inspectors/me/push-config`, `POST /v1/inspectors/me/push-subscriptions`, `POST /v1/inspectors/me/push-subscriptions/unsubscribe`; payload do push `{v:1, noticeId, title, body, critical, url}` (`url` já resolvido pelo backend); `INSPECTOR_NOTICE_TARGET_PATTERNS` / `isAllowedInspectorNoticeTargetPath` de `@properfy/shared`. Da TASK-F01-3: slot `push-preference-slot`, `getIsStandalone()`.

### Testes primeiro (TDD)

**Unit (Vitest)**

`src/sw/__tests__/push-handlers.test.ts` (novo; funções puras usadas pelo `sw.ts`):

| Caso | Entrada | Esperado |
|---|---|---|
| payload válido | `{v:1,noticeId:'n1',title:'T',body:'B',critical:true,url:'/profile/announcements/n1'}` | `{title:'T', options:{body:'B', tag:'notice-n1', data:{url:'/profile/announcements/n1'}, requireInteraction:true, icon:'/icons/icon-192.png', badge:'/icons/icon-192.png'}}` |
| não crítico | `critical:false` | `requireInteraction:false` |
| payload inválido / vazio / não-JSON | | fallback `{title:'Properfy', options:{body:'You have a new announcement.', tag:'notice', data:{url:'/profile/announcements'}}}` |
| url externa | `url:'https://evil.example/x'` | `data.url = '/profile/announcements'` |
| url fora da allowlist | `url:'/schedule'` (sem id), `'/today'` (até a F04), `'/earnings'` | `'/profile/announcements'` |
| url de sistema permitida | `url:'/schedule/<uuid>'` | `data.url = '/schedule/<uuid>?fromNotice=n1'` |
| L-F02-08: url quase válida | `'/schedule/<uuid>/'`, `'/schedule/<UUID maiúsculo>'`, `'/schedule/%2e%2e'` | `'/profile/announcements'` (sem normalizar) |
| url padrão | `url:'/profile/announcements/n1'` | sem `fromNotice` (a página do aviso já marca lido) |
| allowlist única | – | `push-handlers.ts` importa `isAllowedInspectorNoticeTargetPath` do shared; não existe lista local no SW |
| `resolveClickTarget` | cliente aberto na mesma origem | foca e navega o cliente existente; sem cliente → `openWindow(url)` |
| `handleSubscriptionChange` | evento com `newSubscription` | não chama `subscribe`; manda `{type:'push-subscription-changed'}` às janelas |
| `handleSubscriptionChange` | sem `newSubscription`, com `oldSubscription.options.applicationServerKey` | `pushManager.subscribe({userVisibleOnly:true, applicationServerKey})` e depois a mensagem |
| `handleSubscriptionChange` | `subscribe` lança | só manda a mensagem (o app ressincroniza ou o servidor revoga no 410 e o crítico vira SMS) |

`src/sw/__tests__/runtime-caching.test.ts` (novo): o array exportado de `src/sw/runtime-caching.ts` tem exatamente as 5 rotas, na mesma ordem, com os mesmos padrões, estratégias, `cacheName`, `maxEntries`, `maxAgeSeconds` e `networkTimeoutSeconds` da config atual; os `cacheName` de API batem com `INSPECTOR_API_CACHES` exportado de `useAuth.tsx` (passa a ser exportado). Única mudança intencional (L-X00-10, regra N10): `api-schedule-cache` e `api-appointment-cache` ganham `cacheableResponse: { statuses: [200] }` (hoje sem, default Workbox `0`/`200`); o teste afirma isso nas duas e a ausência nas rotas de fontes e no `NetworkOnly` de ofertas.

`src/features/push/hooks/__tests__/usePushSubscription.test.tsx` (novo; `navigator.serviceWorker`, `PushManager`, `Notification` e API injetados/mocados):

| Caso | Ambiente | Esperado |
|---|---|---|
| sem suporte | sem `PushManager` | `state:'unsupported'` |
| iOS fora do standalone | `getIsIosSafariEligible()` true, `getIsStandalone()` false | `state:'ios-needs-install'` |
| sem VAPID | `push-config` → `null` | `state:'unavailable'` |
| bloqueado | `Notification.permission='denied'` | `state:'blocked'` |
| desligado | sem assinatura local | `state:'off'` |
| ligado | `getSubscription()` não nulo | `state:'on'` (a sincronização com o servidor é do `usePushSubscriptionSync`, não deste hook) |
| ligar | `enable()` → permissão `granted` | `subscribe({userVisibleOnly:true, applicationServerKey: <Uint8Array do VAPID>})` → POST → `state:'on'` |
| ligar negado | permissão `denied` | `state:'blocked'`; nenhum POST |
| ligar falha no POST | 5xx | `unsubscribe()` local desfeito; `state:'off'`; `error:'save-failed'` |
| desligar | `disable()` | POST `/unsubscribe` **e depois** `subscription.unsubscribe()` → `state:'off'` |
| desligar offline | POST falha | `subscription.unsubscribe()` local mesmo assim; `state:'off'` (o servidor revoga no próximo 410) |
| precedência (L-F02-05) | iOS não instalado **e** sem `PushManager`/`Notification` | `state:'ios-needs-install'` (não `unsupported`) |
| precedência (L-F02-05) | `Notification.permission='denied'` **e** `push-config` → `null` | `state:'blocked'` (não `unavailable`) |
| precedência (L-F02-05) | sem `PushManager` **e** `push-config` → `null` (não iOS) | `state:'unsupported'` |
| precedência (L-F02-05) | `permission='granted'`, `push-config` → `null`, assinatura local existe | `state:'unavailable'` |
| chave mudou (L-F02-04) | assinatura local com `applicationServerKey` = chave A; `push-config` → chave B; `permission='granted'` | `unsubscribe()` → `subscribe({userVisibleOnly:true, applicationServerKey:<bytes de B>})` → POST → `state:'on'` |
| chave mudou sem permissão (L-F02-04) | chave A ≠ B; `permission='default'` | `unsubscribe()` local; nenhum `subscribe`; `state:'off'` |
| chave igual | A = A | nenhum `unsubscribe`/`subscribe`; `state:'on'` |
| reassinar falha (L-F02-04) | `subscribe` lança | `state:'off'`; `error:'save-failed'`; nenhuma exceção sobe |

`src/features/push/components/__tests__/PushPreferenceCard.test.tsx` (novo): textos e controles de cada estado (tabela de UI abaixo); o switch tem `role="switch"`, `aria-checked`, nome acessível "Push notifications"; desabilitado nos estados sem ação; mensagens em `role="status"`.

`src/features/profile/pages/__tests__/ProfileSettingsPage.test.tsx` (modificar): `push-preference-slot` agora contém o `PushPreferenceCard`; `InstallAppCard` e rodapé de versão continuam. Os casos da F01 seguem verdes sem afrouxar: rodapé `Properfy Inspector v{__APP_VERSION__}` (no teste, `v{pkg.version}+{sha7}`, L-F01-04) e ordem DOM slot → `InstallAppCard` → rodapé por `compareDocumentPosition` (L-F01-12).

`src/features/announcements/pages/__tests__/AnnouncementsPage.test.tsx` (novo):

| Caso | Entrada | Esperado |
|---|---|---|
| lista | 2 avisos (1 não lido crítico) | ordem do backend; não lido com ponto e título em negrito; chip "Critical"; prévia em 2 linhas; data relativa ("2h ago"; "Yesterday"; acima de 6 dias "3 Nov") |
| vazio | `[]` | "No announcements yet" + "Messages from the Properfy team will show up here." |
| erro | 500 | "Couldn't load announcements." + "Retry" |
| carregando | | 3 skeletons |
| paginação | `totalPages=2` | botão "Load more" busca `page=2` e anexa |
| abrir | toque no item | navega `/profile/announcements/<id>` |
| a11y | | lista `role="list"`; item é link com nome "{title}, unread" quando não lido |

`src/features/announcements/pages/__tests__/AnnouncementDetailPage.test.tsx` (novo):

| Caso | Esperado |
|---|---|
| abrir não lido | GET + **um** POST `/read` (StrictMode não duplica: guarda por `noticeId`); invalida `['inspector-notices']` |
| abrir já lido | nenhum POST |
| conteúdo | TopBar "Announcement" com Back para `/profile/announcements`; título, chip "Critical", data completa no fuso do inspetor ("Mon 10 Nov, 9:30 am"), corpo `whitespace-pre-wrap` |
| 404 | "This announcement is no longer available." + "Back to announcements" |
| erro | "Couldn't load this announcement." + "Retry" |
| POST read falha | conteúdo continua visível; nova tentativa no próximo mount |

`src/features/profile/pages/__tests__/ProfilePage.test.tsx` (modificar): tile "Announcements" (largura total, `col-span-2`, último item da grade: depois de My account no DOM, por `compareDocumentPosition`, sem depender de índice/contagem de tiles, para seguir verde quando a F08 acrescentar Challenges, L-F08-09) com value "3 unread" e ponto de alerta (`tone='warning'`) quando `count > 0`; "No new announcements" e sem ponto quando 0; `aria-label="Announcements, 3 unread"`; `href="/profile/announcements"`.

`src/components/shell/__tests__/BottomNavBar.test.tsx` (modificar): com `count=3`, a aba Profile mostra o selo "3" (e "9+" acima de 9) e o nome acessível "Profile, 3 unread announcements"; com 0, sem selo.

`src/features/profile/pages/__tests__/ProfileLayout.test.tsx` (modificar): `/profile/announcements/n1` conta como seleção (painel de detalhe aberto no layout largo).

`src/features/push/hooks/__tests__/usePushSubscriptionSync.test.tsx` (novo; montado no `PwaLayout`):

| Caso | Ambiente | Esperado |
|---|---|---|
| início do app com assinatura | `permission='granted'`, `getSubscription()` não nulo | 1 POST `/v1/inspectors/me/push-subscriptions` com `sub.toJSON()` |
| sem assinatura local | `getSubscription()` nulo | nenhum POST (não assina sozinho) |
| sem permissão / sem suporte | `default`/`denied` ou sem `PushManager` | nenhum POST |
| remount (StrictMode, troca de rota) | mesmo carregamento | no máx. 1 POST por carregamento e por `userId` |
| troca de inspetor | `userId` muda | novo POST |
| mensagem do SW | `{type:'push-subscription-changed'}` | novo POST com a assinatura atual |
| POST falha / 429 | | silencioso; tenta no próximo carregamento ou mensagem |
| chave do servidor mudou (L-F02-04) | `permission='granted'`, assinatura local com chave A, `push-config` → B | `unsubscribe()` + `subscribe` com B + 1 POST com a assinatura **nova** |
| `push-config` falha | GET 5xx | segue o fluxo antigo (POST da assinatura atual, sem comparar chave) |

`src/features/push/lib/__tests__/vapid.test.ts` (novo, L-F02-04): `urlBase64ToUint8Array` com e sem padding; `keysEqual(ArrayBuffer, Uint8Array)` → `true` para os mesmos bytes, `false` para tamanho ou byte diferente, `false` com `null`.

`src/app/__tests__/useNoticeOpenedFromPush.test.tsx` (novo; montado no `PwaLayout`): URL `/schedule/<uuid>?fromNotice=n1` → 1 POST `/v1/inspectors/me/notices/n1/read` (sem esperar), invalida `['inspector-notices']` e faz `navigate('/schedule/<uuid>', {replace:true})`; `fromNotice` não-UUID → ignorado e removido; 404 no POST → silencioso.

`src/hooks/__tests__/useAuth.test.tsx` (modificar ou novo caso):

| Caso | Esperado |
|---|---|
| `logout()` (padrão) | `logout` continua **síncrono** (retorna `undefined`, sem Promise); o desassinar é disparado **antes** de `authStorage.clearTokens()`, sem `await`, com o access token **capturado antes** de limpar e enviado como `Authorization: Bearer <token>` explícito; depois do POST, `subscription.unsubscribe()` |
| ordem | o spy do POST de unsubscribe é chamado antes do spy de `clearTokens` |
| falha | POST ou `unsubscribe()` rejeitam → nenhuma exceção sobe; tokens limpos do mesmo jeito |
| sem SW / sem assinatura | nada é chamado |
| `logout({ keepPushSubscription: true })` (troca de senha) | **nenhum** POST de unsubscribe e nenhum `unsubscribe()` local |

`src/features/profile/components/__tests__/ChangePasswordSection.test.tsx` (modificar): após trocar a senha chama `logout({ keepPushSubscription: true })`. `ProfilePage.test.tsx`: o botão "Log out" chama `logout()` sem argumentos (o `onClick={logout}` atual passaria o evento do clique como opção).

`src/features/announcements/hooks/__tests__/useUnreadNoticeCount.test.tsx` (novo): key `['inspector-notices','unread-count']`; `refetchOnWindowFocus: true`; mensagem do SW `{type:'inspector-notice:received'}` invalida `['inspector-notices']`.

**Build:** `pnpm --filter pwa build` gera `dist/sw.js` com o manifest de precache injetado (asserção no CI: o arquivo existe e contém `index.html` no manifest).

**E2E (L-X03-05):** nenhuma spec nova (o QA manual abaixo é o gate de aceite do push), mas o job `test-pwa-e2e` precisa continuar verde. Este PR adiciona chamadas ao boot autenticado do PWA, então soma no **mesmo PR** os stubs default em `BASELINE_STUBS` (`tests/e2e/support/auth.ts`): `GET /v1/inspectors/me/notices/unread-count` → `{data:{count:0}}` (selo da aba Profile) e `GET /v1/inspectors/me/push-config` → `{data:{vapidPublicKey:null}}` (`usePushSubscriptionSync`/`usePushSubscription`); `POST /v1/inspectors/me/push-subscriptions` → 204 por segurança (só dispara com assinatura local). Listar no PR os stubs acrescentados. Sanidade: rodar `pnpm --filter pwa test:e2e` (ou o comando do job) e conferir que não aparece `[E2E_UNMOCKED]` para essas rotas.

**QA manual (gate de aceite)**
1. Android (Chrome, PWA instalado), backend staging com VAPID e `SMS_TEST_RECIPIENT_ALLOWLIST`:
   - `/profile/settings` → ligar push → permissão → "Push notifications are on for this device."; no web, o Push do inspetor vira "On".
   - OP publica aviso **crítico** para esse inspetor → notificação chega com o app fechado; tocar abre `/profile/announcements/<id>`; no web, "Read by 1 of 1" (**00.A2 com push + 00.A4**).
   - OP publica aviso **não crítico** → push chega; nenhum SMS.
2. iOS ≥ 16.4: Safari fora do standalone mostra "Install the app…"; instalado na tela inicial, ligar push e repetir o caso crítico.
3. Inspetor **sem push** (desligado) e com telefone na allowlist: aviso crítico → SMS recebido com "Properfy: {title}. {body}" (**00.A2 com SMS**); aviso não crítico → nada de SMS, só a caixa.
4. Badge: após a publicação, a aba Profile e o tile mostram o número; abrir o aviso reduz o número.
5. Arquivar no web → o aviso some da caixa e do contador no próximo foco do app.
6. Atualização do app: com a versão `generateSW` instalada, publicar a versão `injectManifest` → o app atualiza sozinho (autoUpdate) sem tela branca; offline depois disso, a agenda (`/v1/inspector/schedule`) abre do cache e uma navegação para `/schedule` funciona (fallback de navegação).
7. Logout em aparelho com push ligado e login de outro inspetor: o primeiro não recebe mais push nesse aparelho (e, num crítico, recebe SMS).
8. Trocar a senha em `/profile/account`: depois do novo login, o push continua ligado sem passar por Settings.
9. Ressincronização: com push ligado, revogar a linha no banco de staging (`revoked_at`) e reabrir o app → a assinatura volta ativa e o Push do inspetor no web volta a "On".
10. Aviso de sistema com `targetPath = /schedule/<id>` (publicado via script/curl chamando o use case em staging): tocar abre o detalhe do serviço e o aviso fica lido no painel.
11. (L-F02-04) Rotação de chave em staging: trocar `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` e redeployar o backend → publicar um crítico (a assinatura antiga é revogada `REJECTED` e o SMS sai) → reabrir o app → a assinatura é refeita com a chave nova sem passar por Settings; o próximo crítico chega por push.
12. (L-F02-05) iPhone com Safari fora do standalone: o card mostra o texto de `ios-needs-install` (não "This browser doesn't support push notifications.").

### Escopo / Passos

- [ ] **1. Caixa "Announcements": hooks + lista** (pwa/feature, 0,5)
  - Novo: `src/features/announcements/hooks/useMyNotices.ts`, `useUnreadNoticeCount.ts`, `useMarkNoticeRead.ts`; `pages/AnnouncementsPage.tsx`; `components/AnnouncementListItem.tsx`; `lib/format-relative.ts` (+ testes).
- [ ] **2. Tile, badge na barra e layout** (pwa/shell, 0,25)
  - Modify: `src/features/profile/pages/ProfilePage.tsx` (tile), `src/components/shell/BottomNavBar.tsx` (selo na aba Profile), `src/features/profile/pages/ProfileLayout.tsx` (`useMatch('/profile/:section/*')`), `src/app/router.tsx` (`announcements` e `announcements/:noticeId` dentro de `profile`) + testes.
- [ ] **3. Detalhe + marcar lido** (pwa/feature, 0,25)
  - Novo: `src/features/announcements/pages/AnnouncementDetailPage.tsx` (+ teste).
- [ ] **4. Service worker `injectManifest`** (pwa/sw, 0,75)
  - Novo: `src/sw.ts`, `src/sw/runtime-caching.ts`, `src/sw/push-handlers.ts`, `tsconfig.sw.json` (lib `WebWorker`) e exclusão de `src/sw.ts` do `tsconfig.json` principal (+ testes).
  - Modify: `vite.config.ts` (`strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, `injectManifest: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'] }`; remove o bloco `workbox`), `package.json` (+ devDeps `workbox-core`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, todas na versão do workbox que o `vite-plugin-pwa@0.21` usa, ex.: `^7.3.0`), `pnpm-lock.yaml`, `src/hooks/useAuth.tsx` (exportar `INSPECTOR_API_CACHES`).
  - Em `src/sw/runtime-caching.ts`, `cacheableResponse: { statuses: [200] }` em `api-schedule-cache` e `api-appointment-cache` (L-X00-10).
  - Doc no mesmo passo (regra X00/N11): `apps/pwa/CLAUDE.md` §5 (`generateSW` → `injectManifest` com `src/sw.ts`, push, `pushsubscriptionchange`) e bloco P08 (as linhas dos 2 caches deixam de dizer "no `cacheableResponse` today" e passam a `cacheableResponse: [200]`; a nota da N10 "the two existing caches do not set `cacheableResponse` today" sai).
- [ ] **5. Controle de push + logout** (pwa/feature, 0,5)
  - Novo: `src/features/push/hooks/usePushSubscription.ts`, `src/features/push/lib/vapid.ts` (`urlBase64ToUint8Array`), `src/features/push/components/PushPreferenceCard.tsx` (+ testes).
  - Modify: `src/features/profile/pages/ProfileSettingsPage.tsx` (card dentro do slot), `src/hooks/useAuth.tsx` (`logout(options?: { keepPushSubscription?: boolean })`, desassinar fire-and-forget), `src/features/profile/components/ChangePasswordSection.tsx` (`logout({ keepPushSubscription: true })`), `src/features/profile/pages/ProfilePage.tsx` (`onClick={() => logout()}`).
- [ ] **6. QA em aparelho (Android + iOS) e smoke da F02** (QA, 0,5)
  - Modify (L-X03-05): `tests/e2e/support/auth.ts` (`BASELINE_STUBS` + `unread-count`, `push-config`, `push-subscriptions`); rodar `pnpm --filter pwa test:e2e` localmente antes do PR.
- [ ] **7. Ressincronização + `pushsubscriptionchange` + abertura via push** (pwa/sw/shell, 0,25)
  - Novo: `src/features/push/hooks/usePushSubscriptionSync.ts`, `src/app/useNoticeOpenedFromPush.ts` (+ testes).
  - Modify: `src/sw.ts` e `src/sw/push-handlers.ts` (`handleSubscriptionChange`, `fromNotice`), `src/components/shell/PwaLayout.tsx` (monta os 2 hooks e o listener de mensagens do SW).
- [ ] **8. Rotação de chave VAPID + precedência dos estados (L-F02-04, L-F02-05)** (pwa/feature, 0,25)
  - Modify: `src/features/push/lib/vapid.ts` (`keysEqual`), `src/features/push/hooks/usePushSubscription.ts` (ordem fixa de D21; checagem de chave), `src/features/push/hooks/usePushSubscriptionSync.ts` (lê `push-config` e reassina quando a chave muda) (+ testes, incluindo `vapid.test.ts`).
  - QA 11 e 12.

**Total: 0,5 + 0,25 + 0,25 + 0,75 + 0,5 + 0,5 + 0,25 + 0,25 = 3,25 dias.** Arquivos estimados: ~44.

### Service worker (`src/sw.ts`)

```ts
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { registerRuntimeCaching } from './sw/runtime-caching';
import { buildNotification, handleSubscriptionChange, resolveClickTarget, type PushSubscriptionChangeEvent } from './sw/push-handlers';
declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();            // preserva o autoUpdate atual
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'))); // = navigateFallback do generateSW
registerRuntimeCaching();      // as 5 rotas, mesmos nomes de cache

self.addEventListener('push', (event) => {
  const { title, options } = buildNotification(event.data?.text() ?? null);
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options); // sempre mostrar (userVisibleOnly; iOS revoga se não mostrar)
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'inspector-notice:received' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(resolveClickTarget(self, event.notification.data?.url));
});

// A assinatura expirou ou foi trocada pelo push service. O SW não tem token de API,
// então só reassina localmente e avisa as janelas; o usePushSubscriptionSync faz o POST.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(handleSubscriptionChange(self, event as PushSubscriptionChangeEvent));
});
```

- `buildNotification`/`resolveClickTarget`: o `url` do payload só é aceito se `isAllowedInspectorNoticeTargetPath(url)` (constante **única** `INSPECTOR_NOTICE_TARGET_PATTERNS` de `@properfy/shared`, a mesma que o backend valida, D15); senão `/profile/announcements`. Quando o destino **não** é a página do próprio aviso, o SW acrescenta `?fromNotice=<noticeId>` para o app marcar a leitura. Com janela da mesma origem: `focus()` + `navigate(url)` (ou `postMessage({type:'navigate', url})` quando `navigate` não existir); senão `clients.openWindow(url)`.
- `handleSubscriptionChange`: usa `event.newSubscription` se vier; senão `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: event.oldSubscription?.options.applicationServerKey })`; sempre termina com `postMessage({type:'push-subscription-changed'})` às janelas abertas. O tipo `PushSubscriptionChangeEvent` não está no `lib.webworker` do TS: declarar em `push-handlers.ts`.
- **Ressincronização no início do app (`usePushSubscriptionSync`, no `PwaLayout`):** a cada carregamento do app com INSP autenticado, se houver suporte, `Notification.permission === 'granted'` e `registration.pushManager.getSubscription()` não nulo → `POST /v1/inspectors/me/push-subscriptions` (upsert idempotente). Também roda ao receber `push-subscription-changed`. Nunca assina sozinho **do zero** (sem assinatura local, não faz nada); a única reassinatura automática é a troca de chave VAPID do servidor com permissão já `granted` (L-F02-04: compara `subscription.options.applicationServerKey` com `push-config` antes do POST). Recupera: assinatura revogada no servidor (inclusive `REJECTED`/`FAILED`/`DEACTIVATED`), endpoint reatribuído a outro inspetor, troca de chave feita pelo push service e rotação de chave VAPID no backend.
- **Abertura via push (`useNoticeOpenedFromPush`, no `PwaLayout`):** lê `fromNotice` (UUID) da URL, dispara `POST /v1/inspectors/me/notices/:id/read` sem esperar, invalida `['inspector-notices']` e remove o parâmetro com `navigate(pathname, { replace: true })`.
- O arquivo gerado continua `dist/sw.js` (mesmo caminho do `generateSW`), então o registro existente e o rollback trocam o SW sem intervenção.
- O app escuta `navigator.serviceWorker` `message` (`type: 'navigate'` → `router.navigate(url)`; `type: 'inspector-notice:received'` → invalida `['inspector-notices']`; `type: 'push-subscription-changed'` → `usePushSubscriptionSync`) num hook montado no `PwaLayout`.

### Logout e desassinatura do dispositivo
- Assinatura nova: `logout(options?: { keepPushSubscription?: boolean }) => void` (continua **síncrona**; o tipo do contexto muda só para aceitar a opção).
- Caminho padrão (botão "Log out", `DeactivatedPage`, `AccessDeniedPage`): antes de `authStorage.clearTokens()`, captura o access token de forma síncrona e dispara, **sem await**, `unsubscribeThisDevice(token)`: `navigator.serviceWorker.getRegistration()` → `pushManager.getSubscription()` → se existir, `fetch` POST `/v1/inspectors/me/push-subscriptions/unsubscribe` com `Authorization: Bearer <token>` **explícito** (o middleware do cliente leria um token já apagado) → `subscription.unsubscribe()` no `finally`. Todo erro é engolido. O resto do logout segue como hoje.
- Caminho da troca de senha (`ChangePasswordSection`): chama `logout({ keepPushSubscription: true })` e **não** desassina, porque o mesmo inspetor entra de novo no mesmo aparelho; a ressincronização do próximo carregamento mantém o servidor em dia.
- O que distingue os dois caminhos é só a opção explícita no chamador; nenhum caminho é inferido. `ProfilePage` passa a usar `onClick={() => logout()}` para o evento de clique não virar opção.

### UI por tela

**1. `/profile/settings` — card "Push notifications"** (dentro de `data-testid="push-preference-slot"`, acima do `InstallAppCard`)
- Cabeçalho "Push notifications"; switch à direita (`role="switch"`, `aria-checked`, rótulo associado "Push notifications"); descrição por estado:

| Estado | Switch | Texto |
|---|---|---|
| carregando | desabilitado, skeleton | – |
| `on` | ligado | "On for this device. You'll get announcements even when the app is closed." |
| `off` | desligado | "Get announcements on this device even when the app is closed." |
| `enabling` / `disabling` | desabilitado, spinner | "Turning on…" / "Turning off…" |
| `blocked` | desabilitado, desligado | "Notifications are blocked for Properfy. Turn them on in your device settings, then come back." |
| `ios-needs-install` | desabilitado | "To get push notifications on iPhone, add Properfy to your Home Screen (iOS 16.4 or later) and open it from there." |
| `unsupported` | desabilitado | "This browser doesn't support push notifications." |
| `unavailable` (sem VAPID) | desabilitado | "Push notifications aren't available right now." |
| erro ao salvar | desligado | "Couldn't turn on push notifications. Try again." (`role="alert"`) |
| offline ao ligar | desligado | "You're offline. Connect to turn on push notifications." |

- Sucesso ao ligar: mensagem `role="status"` "Push notifications are on for this device."; ao desligar: "Push notifications are off for this device."
- `Notification.requestPermission()` só dentro do clique (exigência do iOS/Chrome).
- Sem menção a SMS (D5: não existe preferência de SMS).
- Alvo ≥ 44 px; foco visível; o estado é anunciado pelo `aria-checked`.

**2. Tile "Announcements" em `/profile`** (D11)
- `ProfileTile` em largura total (`col-span-2`) como **último** item da grade do `ProfilePage` (depois de Earnings, Availability, Documents, My account; com a F08, depois dos 5 tiles: Earnings, Challenges, Availability, Documents, My account — L-F08-09), ícone `Megaphone` (lucide), label "Announcements", value "{n} unread" (n ≥ 1) ou "No new announcements"; `tone='warning'` com ponto quando n > 0; `to="/profile/announcements"`.

**3. Selo na aba Profile** (`BottomNavBar`)
- Selo numérico no ícone Profile (1-9, "9+" acima), cor `destructive`, `aria-hidden`; o `NavLink` recebe `aria-label="Profile, {n} unread announcements"` quando n > 0. Fonte: `useUnreadNoticeCount` (staleTime 30 s, `refetchOnWindowFocus: true`, invalidado pela mensagem do SW e após marcar lido).

**4. `/profile/announcements` — caixa** (TopBar "Announcements", Back para `/profile`, `backHideOnWide`)
- Lista de cartões: ponto azul + título em negrito quando não lido; chip "Critical" (tom `destructive`) quando crítico; prévia do corpo em 2 linhas (`line-clamp-2`); data relativa à direita.
- Sem fixados, sem filtros, sem busca. "Load more" quando houver mais páginas (`pageSize` 20).
- Estados: carregando (3 skeletons); vazio ("No announcements yet" / "Messages from the Properfy team will show up here."); erro ("Couldn't load announcements." + "Retry"); offline com cache do React Query: mostra o que tem + aviso existente de offline (sem cache de SW para esta rota).
- Acessibilidade: `role="list"`/`listitem`; cada item é link com nome "{title}, unread" ou "{title}"; chip "Critical" lido como texto.

**5. `/profile/announcements/:noticeId` — aviso** (TopBar "Announcement", Back para `/profile/announcements`)
- Título (h1), chip "Critical", data completa no fuso efetivo do inspetor, corpo `whitespace-pre-wrap break-words`.
- Ao carregar com `readAt == null`: `POST .../read` uma vez; invalida a lista e o contador.
- 404 (arquivado ou não destinatário): "This announcement is no longer available." + "Back to announcements".
- Erro: "Couldn't load this announcement." + "Retry".
- No layout largo, abre no painel de detalhe do `TwoPaneLayout` do perfil.

### Casos de borda
1. Push com o app aberto em outra tela: a notificação do sistema aparece; o selo atualiza pela mensagem do SW.
2. Tocar numa notificação de aviso já arquivado: abre a tela 404 amigável.
3. Payload ilegível: notificação genérica "You have a new announcement." abrindo a caixa.
4. Permissão revogada pelo usuário nas configurações do aparelho depois de ligar: o hook vê `denied` → estado `blocked`; o servidor revoga no próximo 404/410 e passa a mandar SMS em críticos.
5. Assinatura local existe mas o servidor a revogou: o próximo carregamento do app (ressincronização) a reativa; se o push service a invalidou, o próximo envio dá 410 de novo, o crítico vira SMS e o estado se corrige.
5b. `pushsubscriptionchange` com o app fechado: o SW reassina localmente; até o próximo carregamento o servidor só conhece o endpoint antigo (410 → revogado → crítico por SMS, D2-a).
5c. Troca de senha: o push continua ligado (sem desassinar).
6. Dois aparelhos: cada um liga/desliga só a si mesmo.
7. Logout offline: assinatura local removida; a do servidor é revogada no primeiro 410.
8. iOS Safari no navegador: estado `ios-needs-install`; a caixa funciona normalmente (sem push).
9. StrictMode/duplo mount: marcar lido no máximo uma vez por aviso por montagem.
10. Atualização do SW com usuário no meio de uma execução: `skipWaiting` + `clientsClaim` já eram o comportamento; a fila offline (IndexedDB) não depende do SW.
11. Cache de agenda de um inspetor anterior: os nomes de cache não mudam, então o `clearInspectorCachedData` do logout continua apagando-os.
12. (L-F02-04) Chave VAPID do backend trocada: o controle mostrava "On" com uma assinatura morta; no próximo carregamento o app detecta a chave diferente, reassina e volta a "On" de verdade. Sem permissão `granted` (ex.: revogada no aparelho), só desassina e mostra `off`/`blocked`.
13. (L-F02-04) Servidor revogou a assinatura por 5 falhas (`FAILED`): a ressincronização a reativa no próximo carregamento (upsert zera `failure_count`); se o push service continuar falhando, ela volta a ser revogada.
14. (L-F02-05) iOS Safari fora do standalone sem `PushManager`: estado `ios-needs-install`, nunca `unsupported`. Permissão negada com VAPID ausente: `blocked`.
15. (L-F02-11) Inspetor desativado e depois reativado: o servidor tinha revogado a assinatura (`DEACTIVATED`); no primeiro carregamento após o login a ressincronização a reativa se a assinatura local ainda existir.
16. (L-F02-06) Avisos de sistema com mais de 30 dias somem da caixa e do selo (arquivados automaticamente); tocar numa notificação antiga abre o 404 amigável.

### Auditoria e observabilidade
- Nada auditado no cliente. Erros de push/assinatura: `console.debug` só em dev. O backend registra assinar/desassinar (debug) e a entrega.

### Fora do escopo
- Aba "More" e mudança da navegação (F04); card de não lidos na tela Today (F04); fixados; respostas; preferências por tipo; qualquer controle de SMS; push no portal web; recibo de entrega.

### Critérios de aceite
1. O build gera `dist/sw.js` via `injectManifest`; precache, fallback de navegação, as 5 rotas de `runtimeCaching` (mesmos nomes) e o `autoUpdate` se comportam como antes (QA 6); a única mudança é `cacheableResponse: [200]` nos 2 caches de API (L-X00-10), com §5/P08 do `apps/pwa/CLAUDE.md` atualizados.
2. `push` mostra a notificação (título, corpo, crítico com `requireInteraction`) e `notificationclick` abre a rota do aviso.
3. O controle em `/profile/settings` liga/desliga a assinatura deste dispositivo com todos os estados da tabela; o web mostra o Push do inspetor coerente (D10).
4. Logout padrão desassina o dispositivo (fire-and-forget, `logout` síncrono, token capturado antes de limpar); logout da troca de senha não desassina.
4b. A assinatura é ressincronizada a cada carregamento do app (`PwaLayout`) e após `pushsubscriptionchange`.
4c. O SW só abre destinos da allowlist compartilhada (`/profile/announcements/:id`, `/schedule/:id`) e marca a leitura via `fromNotice` quando o destino não é a página do aviso.
5. A caixa lista só avisos não arquivados do inspetor, sem fixados, com estados de loading/vazio/erro; abrir marca como lido uma única vez.
6. Selo de não lidos no tile "Announcements" e na aba Profile, atualizado ao abrir, ao focar o app e ao receber push.
7. **00.A2:** inspetor com push recebe a notificação de um aviso **crítico manual** (o gatilho do plano do dia é provado em F04); inspetor sem push recebe SMS (QA 1 e 3).
8. **00.A4:** o aviso publicado aparece na caixa do destinatário e o painel web mostra a leitura (QA 1).
9. `pnpm --filter pwa lint typecheck test build` verdes.
9b. (L-X03-05) `BASELINE_STUBS` cobre as chamadas novas do boot (`unread-count`, `push-config`) e o job `test-pwa-e2e` segue verde.
10. (L-F02-04) Com a chave VAPID do servidor diferente da assinatura local e permissão `granted`, o app reassina com a chave nova e faz o POST, sem gesto do usuário (QA 11).
11. (L-F02-05) O estado do controle segue a ordem fixa `ios-needs-install` → `unsupported` → `blocked` → `unavailable` → `on`/`off` (testes combinados + QA 12).
12. (L-F02-08) O SW rejeita URLs quase válidas (barra final, UUID maiúsculo, segmento codificado) usando a função do shared, sem normalização local.

### Dependências
- TASK-F02-1 mergeada (rotas, payload do push, `api-types.ts`).
- TASK-F01-3 mergeada (slot, `getIsStandalone()` exportada, `__APP_VERSION__`).
- TASK-F02-2 mergeada para o QA ponta a ponta (publicar pela UI); sem ela, o QA publica via `curl`.

### Riscos e armadilhas
- **Troca do SW:** esquecer `NavigationRoute(createHandlerBoundToURL('index.html'))` quebra a navegação offline/refresh em rotas profundas; esquecer `skipWaiting`/`clientsClaim` quebra o `autoUpdate`. Testar a atualização num dispositivo instalado (QA 6).
- **Nomes de cache acoplados** ao `useAuth.tsx`: o teste de `runtime-caching` cobre.
- **`cacheableResponse: [200]`** (L-X00-10): uma resposta de erro de `/v1/inspector/schedule` deixa de ser guardada; o offline passa a mostrar a última resposta 200. É a regra N10; conferir no QA 6.
- **Chamada nova no boot sem stub** pode derrubar o `test-pwa-e2e` (gate de deploy) via 501 `E2E_UNMOCKED` quando uma asserção depende dela (L-X03-05).
- **Tipos do SW:** `lib: ["WebWorker"]` conflita com `DOM` no `tsconfig` principal; usar `tsconfig.sw.json` e excluir `src/sw.ts` do principal (ou `/// <reference lib="webworker" />` + `declare let self`), e garantir que `tsc -b` do script `build` cubra os dois.
- **Versões do workbox:** as deps diretas precisam casar com a versão interna do `vite-plugin-pwa@0.21` (senão dois workbox no bundle do SW).
- **iOS:** push só no PWA instalado (16.4+); a permissão só pode ser pedida num gesto; todo `push` precisa mostrar notificação, senão o iOS revoga a assinatura.
- **`useMatch('/profile/:section')`** não casa com 2 segmentos: sem o ajuste, o detalhe do aviso não abre no layout largo.
- **Scroll por painel** no layout largo (memória "two-pane per-pane scroll"): a lista da caixa não pode quebrar o `fillHeight` do perfil.
- **jsdom:** `PushManager`, `Notification` e `navigator.serviceWorker` não existem; injetar dependências no hook. `localStorage` do jsdom é instável (não usar).
- **Build do shared** antes do typecheck do PWA.
- **SW importando o shared:** importar só as funções da allowlist (o bundle do SW passa pelo Rollup do plugin e deve sacudir o resto); conferir o tamanho de `dist/sw.js` no PR (sem zod/schemas dentro).
- **`logout` síncrono:** não transformar em `async` (os chamadores não esperam); o desassinar é fire-and-forget.
- **Screenshots do QA** nunca entram no commit (memória).

### Deploy / rollout / rollback
1. Merge depois da TASK-F02-1 (e de preferência da TASK-F02-2).
2. Sem env no PWA (a chave VAPID vem do backend em `push-config`).
3. Em produção, a primeira abertura após o deploy instala o SW novo (autoUpdate); os inspetores precisam ligar o push em Settings (comunicar pela própria caixa de avisos, com um aviso não crítico de boas-vindas publicado pela OP).
4. Rollback: reverter o PR e redeployar; o `dist/sw.js` volta a ser o do `generateSW` e substitui o `injectManifest` pelo mesmo caminho. As assinaturas ficam no servidor; pushes chegariam a um SW sem handler `push` (o navegador mostra notificação genérica ou descarta) — por isso, ao reverter o PWA, desligar também o envio removendo as chaves VAPID do backend (vira tudo SMS para críticos).

### Dias · Branch sugerida · Comandos de verificação
- **Dias:** 3,25 (0,5 + 0,25 + 0,25 + 0,75 + 0,5 + 0,5 + 0,25 + 0,25).
- **Branch:** `feat/f02-inspector-notices-pwa` a partir de `develop`, depois da TASK-F02-1.
- **Verificação:** `pnpm --filter @properfy/shared build && pnpm --filter pwa lint && pnpm --filter pwa typecheck && pnpm --filter pwa test && pnpm --filter pwa build && test -f apps/pwa/dist/sw.js && pnpm --filter pwa test:e2e` (mesmo conjunto do job `test-pwa-e2e`, L-X03-05); QA manual 1-12 (Android instalado + iOS ≥ 16.4 instalado) com o backend de staging.

---

## Contratos exportados para outras features

| Contrato | Onde | Quem consome | Como usar |
|---|---|---|---|
| `PublishSystemInspectorNoticeUseCase.execute({ type, inspectorIds, title, body, dedupeKey, targetPath?, requestId? }) → { noticeId: string \| null, created: boolean }` | `apps/backend/src/modules/inspector-notice/application/use-cases/publish-system-inspector-notice.use-case.ts`; no container: `container.inspectorNotice.publishSystemInspectorNoticeUseCase` | F03 (`type:'COMPLETION_REMINDER'`, crítico, ex.: `targetPath:'/schedule/<appointmentId>'`), F04 (`ROUTE_PUBLISHED`, `ROUTE_CHANGED`, críticos), F08 (`PERFORMANCE_MESSAGE`, nunca crítico) | Grava o aviso + destinatários, audita (SYSTEM) e enfileira a entrega. Idempotente por `dedupeKey` (ex.: `completion-reminder:${appointmentId}`, `route-published:${dayPlanId}:${publishedAt}`). O chamador **não** define `critical` (vem do tipo). `targetPath` opcional, só da allowlist (padrão `/profile/announcements/:id`). Título e corpo aparecem na tela bloqueada: sem códigos de chave/lockbox, senhas, nome ou telefone de inquilino (L-F02-07). Avisos de sistema são arquivados automaticamente após 30 dias (L-F02-06). `dedupeKey` estável por evento; o SMS de críticos está sujeito ao teto diário `INSPECTOR_NOTICE_SMS_DAILY_CAP` (L-F02-01). `created:true` só quando esta chamada gravou o aviso; efeitos próprios do consumidor (ex.: audit do lembrete da F03) só com `created === true` (L-F03-03). |
| `HasRecentSystemInspectorNoticeUseCase.execute({ dedupeKeyPrefix, since }) → boolean` | `apps/backend/src/modules/inspector-notice/application/use-cases/has-recent-system-inspector-notice.use-case.ts`; no container: `container.inspectorNotice.hasRecentSystemNoticeUseCase` | F08 (guarda de 7 dias da mensagem de nível, via porta `IRecentProgramNoticeReader`) | `true` se existe aviso de sistema com `dedupe_key` começando pelo prefixo (literal, `%`/`_` escapados) e `created_at >= since`; conta arquivados; manuais nunca. Nenhum outro módulo consulta `inspector_notices` direto (L-F08-06). |
| `SYSTEM_INSPECTOR_NOTICE_TYPES` = `ROUTE_PUBLISHED`, `ROUTE_CHANGED`, `COMPLETION_REMINDER`, `PERFORMANCE_MESSAGE`; `SystemInspectorNoticeType`, `SYSTEM_NOTICE_CRITICALITY`, `isCriticalSystemNoticeType` | `packages/shared/src/constants/inspector-notices.ts` | F03, F04, F08 | Lista fixa de D1/Q16. Um tipo novo exige mudar esta constante (decisão de produto). |
| `INSPECTOR_NOTICE_TARGET_PATTERNS` (`/profile/announcements/:id`, `/schedule/:id`), `isAllowedInspectorNoticeTargetPath`, `resolveInspectorNoticeTargetPath` | `packages/shared/src/constants/inspector-notices.ts` | backend (validação), SW do PWA (`resolveClickTarget`), F04, F08 | Allowlist **única** de destinos do toque (D15). Casamento exato segmento a segmento (D24, L-F02-08): padrões estáticos (`/today`, `/profile/challenges`) casam só a string exata; `:id` só UUID minúsculo; sem barra final. **A F04 precisa, no mesmo PR que move a caixa para "More", atualizar esta constante** (acrescentar `/today` e trocar `/profile/announcements/:id` pelo novo caminho da caixa, mantendo o antigo como redirect), junto com `inspectorNoticeDeepLink`; senão os pushes já entregues e os novos abrem a caixa errada ou caem no fallback. |
| Entrega push + fallback SMS (job `inspector-notice.deliver`, `DeliverInspectorNoticeUseCase`) + varredura (`inspector-notice.delivery-sweep`) | `apps/backend/src/modules/inspector-notice/application/use-cases/deliver-inspector-notice.use-case.ts`, `sweep-undelivered-inspector-notices.use-case.ts` | indireto (todos os avisos) | Automática após qualquer publicação; a varredura recupera enqueue perdido. Crítico: push; SMS `INSPECTOR_NOTICE_SMS` (TRANSACTIONAL, `tenantId null`) quando nenhum push teve sucesso, por qualquer motivo (D2-a). Não crítico: só caixa + push. Ninguém chama direto. |
| Porta `IPushSender` (`WebPushSender` / `DisabledPushSender`) | `apps/backend/src/modules/inspector-notice/domain/push-sender.ts` (+ `infrastructure/web-push.sender.ts`) | reservado; nenhuma feature planejada precisa enviar push fora de um aviso | Push é sempre entrega de um aviso (D6). |
| `inspectors.push_enabled` = existe assinatura ativa (D10) | coluna existente (F01), mantida pelo módulo `inspector-notice` | F05 (Dia ao Vivo), web de inspetores | Leitura apenas. Vira `false` ao desativar o inspetor (L-F02-11) e quando a assinatura é revogada por 401/403 ou 5 falhas (L-F02-04). |
| Rotas da caixa do inspetor (`GET /v1/inspectors/me/notices`, `/unread-count`, `/:noticeId`, `POST /:noticeId/read`) e deep link `inspectorNoticeDeepLink(noticeId)` = `/profile/announcements/:noticeId` | TASK-F02-1 / `packages/shared/src/constants/inspector-notices.ts` | F04 (card de não lidos na tela Today; mover a entrada para "More") | F04 reaproveita `useUnreadNoticeCount` (contador só via `/unread-count`; a lista não traz `unreadCount`) e as páginas `features/announcements/*` do PWA. Ao mover a caixa, atualizar a allowlist e o deep link no mesmo PR (linha acima). |

## Manutenção de documentação (regra X00)

- A TASK-F02-3 atualiza a §5 do `apps/pwa/CLAUDE.md` (troca de `generateSW` para `injectManifest`, push, `pushsubscriptionchange`), o bloco P08 (`cacheableResponse: [200]` nos 2 caches de API, L-X00-10) e a estrutura de features (inbox), como passo do próprio PR.

## Achados para revisão

**Fechados em 2026-10-28:** falha transitória de push em crítico (agora gera SMS, D2-a); enqueue perdido (varredura D13, +0,25); `UNABLE_TO_ATTEND_RESPONSE` (removido, morto desde a Q1); selo na aba Profile (aceito, D14); estimativa (8,75 = 8,25 do plano + 0,25 varredura + 0,25 ressincronização/`pushsubscriptionchange`; o +0,5 anterior foi retirado porque já estava custeado).

**Fechados em 2026-10-29 (lacunas `lacunas/F02-lacunas.md`, todas as recomendações aceitas):** L-F02-01 teto diário de SMS + burst + número no ConfirmDialog (D17, +0,25 backend); L-F02-02 sem janela de silêncio, aviso de horário, varredura pausada de madrugada (D18); L-F02-03 entrega incompleta recuperada pela varredura (D19, +0,25); L-F02-04 revogação 401/403 e por `failure_count` + reassinatura no PWA (D20, +0,25 backend com L-F02-11, +0,25 PWA com L-F02-05); L-F02-05 precedência dos estados (D21); L-F02-06 auto-arquivamento de avisos de sistema e purga de assinaturas (D22, +0,25); L-F02-07 hint e regra de conteúdo público (D23); L-F02-08 algoritmo da allowlist (D24); L-F02-09 `inspectorStatus`/`hasAppAccess` (D25); L-F02-10 releitura de `archived_at` por lote (D26); L-F02-11 desativar revoga push (D27). Web +0,25 (L-F02-01/02/07/09). Total 8,75 → 10,25.

Em aberto:
1. **Filtro por origem na lista web.** Quando a F04 publicar um aviso de sistema por inspetor por dia, a lista da OP vai encher de avisos "Automatic". Um filtro "Source: Manual / System" não está no escopo; avaliar na F04. O arquivamento automático de 30 dias (L-F02-06) limita a aba "Active", mas não a "All".
2. **Escape latente nos SMS existentes.** O renderer escapa HTML também no SMS (`noEscape: false`); os templates SMS atuais com `{{propertyAddress}}` etc. mandariam `&amp;` se o texto tiver `&`. A F02 evita com `{{{message}}}`, mas não corrige os outros.
3. **Custo de SMS com D2-a.** Com o SMS disparando em qualquer falha de push, um push service instável num aviso crítico gera SMS mesmo que o push chegue depois. Agora limitado pelo teto diário (L-F02-01, padrão 500); medir na homologação (`template_code = 'INSPECTOR_NOTICE_SMS'`) e calibrar o teto.
4. **Nome do modelo.** O plano chama a tabela de `PushSubscription`; a tarefa usa `InspectorPushSubscription` (`inspector_push_subscriptions`) para não colidir com o tipo `PushSubscription` da lib `web-push`/DOM. Só o nome muda.
5. **README.** O total da F02 passa de 8,25 (plano) para 10,25 (8,75 em 2026-10-28 + 1,5 das lacunas em 2026-10-29); somar +2,0 ao total de desenvolvimento do README em relação ao plano (antes era +0,5: 98,5 → 99,0; agora a contribuição da F02 é 98,5 → 100,5, antes de somar os ajustes das outras features).

## Ajustes necessários em outras tarefas (para reconciliar)

- `tarefas/F04-tarefas.md`: avisos `ROUTE_PUBLISHED`/`ROUTE_CHANGED` precisam de `dedupeKey` estável, título/corpo sem dados sensíveis (tela bloqueada), contar com o teto diário de SMS `INSPECTOR_NOTICE_SMS_DAILY_CAP` e com o arquivamento automático de 30 dias no card de não lidos; `/today` entra na allowlist como padrão estático exato (L-F02-01, L-F02-06, L-F02-07, L-F02-08).
- `tarefas/F03-tarefas.md`: o corpo do `COMPLETION_REMINDER` aparece na tela bloqueada; manter só endereço/código do serviço (sem nome/telefone de inquilino nem códigos de acesso) e `dedupeKey` estável; o SMS fica sujeito ao teto diário (L-F02-07, L-F02-01).
- `tarefas/F08-tarefas.md`: `/profile/challenges` entra em `INSPECTOR_NOTICE_TARGET_PATTERNS` como padrão estático exato (sem barra final) e os `PERFORMANCE_MESSAGE` são arquivados automaticamente após 30 dias; corpo sem dados sensíveis (L-F02-08, L-F02-06, L-F02-07).
- `tarefas/F01-tarefas.md`: na matriz da coluna/campo "Push" (TASK-F01-2), acrescentar o caso "desativar inspetor → Push 'Off'" (assinaturas revogadas `DEACTIVATED`); o heartbeat `pushPermission` em iOS fora do standalone segue reportando `unsupported`, coerente com a precedência D21 só no controle (L-F02-11, L-F02-05).
- `tarefas/F06-tarefas.md`: registrar que a reserva/orçamento de SMS por tenant (D15 da F06) não cobre o `INSPECTOR_NOTICE_SMS` (plataforma, `tenantId null`), que tem teto próprio `INSPECTOR_NOTICE_SMS_DAILY_CAP` (L-F02-01).
- (encaminhado) `F02-avisos-push-sms.md` (plano): refletir D17-D27 (teto de SMS, sem janela de silêncio, entrega incompleta, revogação 401/403/`failure_count`/desativação, retenção 30/90 dias, regra de conteúdo do push, algoritmo da allowlist, campos do detalhe) e a estimativa 10,25 (L-F02-01 a L-F02-11).
- `README.md`: total da F02 10,25 dias (TASK-F02-1 5,25; TASK-F02-2 1,75; TASK-F02-3 3,25) e o total geral recalculado; novas envs `INSPECTOR_NOTICE_SMS_DAILY_CAP` e `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` na lista de configuração de deploy, se houver (L-F02-01, L-F02-06).
