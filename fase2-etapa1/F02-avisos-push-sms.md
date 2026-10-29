# F02 · Avisos da operação + Web Push + fallback SMS

| | |
|---|---|
| **Contrato** | 00.6, 00.9 (critérios 00.A2, 00.A4) |
| **Esforço** | **10,25 dias** · dificuldade **A** (service worker + iOS; inclui varredura de segurança, ressincronização do push e as lacunas de 2026-10-29). Por tarefa: TASK-F02-1 5,25 · TASK-F02-2 1,75 · TASK-F02-3 3,25 (`tarefas/F02-tarefas.md`) |
| **Status** | Decisões fechadas em 2026-10-27; complementadas em 2026-10-28 e 2026-10-29 (lacunas L-F02-01 a L-F02-11). Pronto para spec. |
| **Depende de** | F01 (estado de instalação) |
| **Bloqueia** | F03 (lembrete), F04 (aviso de plano publicado), F08 (mensagens automáticas) |
| **Decisões** | Q16 ✅ + as do quadro abaixo |

## Objetivo

Criar o canal entre a operação e o inspetor:

- a OP publica avisos e vê quem leu;
- o inspetor recebe os avisos numa caixa de avisos no app;
- os avisos **críticos** chegam por push, e por SMS quando não há push.

Este bloco é usado por todo o resto: plano publicado, lembretes e mensagens de desempenho.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| O que é crítico (Q16) | **Lista fixa + marcação.** Do sistema: roteiro publicado ou alterado (F04) e lembrete de conclusão (F03). O "retorno da OP sobre Não consigo fazer" saiu porque, com a Q1, o inspetor libera direto. Além desses, os avisos manuais que a OP marcar como críticos. Desafios e mensagens de desempenho (F08) **nunca** são críticos. |
| Quando o SMS sai | **Na hora**, para quem não tem push ativo ou quando o push **falha por qualquer motivo** (404/410, 429/5xx/timeout; decisão de 2026-10-28). Sem job de "não leu em X min". Uma **varredura a cada 5 min** reenfileira avisos publicados que ficaram sem tentativa de entrega. |
| Público dos avisos manuais | **Todos os ativos / seleção manual / uma região** (via `InspectorRegion`). |
| Depois de publicado | **Não se edita nem se exclui; só se arquiva.** Arquivado sai da caixa do inspetor e continua no histórico da OP e na auditoria. Para corrigir, publica-se outro aviso. |
| Preferência do inspetor | Só o controle de push (decisão F01). Nunca SMS para não críticos. |

## Decisões das lacunas (2026-10-29)

Todas as recomendações de `tarefas/lacunas/F02-lacunas.md` foram aceitas. O detalhe de cada uma está em `tarefas/F02-tarefas.md` (D17-D27).

| Tema | Decisão |
|---|---|
| Teto de SMS da plataforma (L-F02-01, D17) | O `INSPECTOR_NOTICE_SMS` (`tenantId null`, TRANSACTIONAL) fica fora do orçamento por tenant; por isso tem teto diário próprio `INSPECTOR_NOTICE_SMS_DAILY_CAP` (padrão 500, dia de Sydney). Acima do teto o aviso segue na caixa e no push, sem SMS. Warn de burst com ≥ 20 SMS num aviso. O ConfirmDialog de crítico no web mostra o tamanho do público ("Up to N inspectors may receive an SMS."). |
| Sem janela de silêncio (L-F02-02, D18) | Push e SMS saem na hora, a qualquer hora. O ConfirmDialog avisa entre 21:00 e 07:00 Sydney; a varredura não reenfileira entre 22:00 e 06:00 Sydney; `sydneyHour` no log de entrega. |
| Entrega incompleta (L-F02-03, D19) | Coluna `delivery_completed_at`; a varredura também reenfileira entrega iniciada há ≥ 20 min e não concluída, só para os pendentes. `expireInMinutes` do job dimensionado pelo número de destinatários. |
| Assinatura com falha permanente (L-F02-04, D20) | 401/403 do push service revogam (`REJECTED`); 5 falhas seguidas (`failure_count`) revogam (`FAILED`). O PWA reassina sozinho quando a chave VAPID do servidor muda (com permissão já concedida). |
| Estados do controle de push (L-F02-05, D21) | Precedência fixa: `ios-needs-install` → `unsupported` → `blocked` → `unavailable` → `on`/`off`. |
| Retenção (L-F02-06, D22) | Avisos **de sistema** são arquivados automaticamente após 30 dias (`INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS`); manuais nunca. Assinaturas revogadas há mais de 90 dias são apagadas. Job diário `inspector-notice.auto-archive`. |
| Conteúdo do push (L-F02-07, D23) | Título e corpo completos aparecem na tela bloqueada. Regra para avisos de sistema e hint no formulário manual: nada de chaves, códigos de acesso, senhas, nome ou telefone de inquilino; endereço e código do serviço podem. |
| Allowlist de destino (L-F02-08, D24) | Casamento exato segmento a segmento, `:id` só UUID minúsculo, sem barra final, sem `?`/`#`/`%`/`//`/`\`, ≤ 200 caracteres; padrões estáticos casam só a string exata. Backend e service worker usam a mesma função. |
| Destinatários sem acesso (L-F02-09, D25) | "All" continua incluindo inspetores ACTIVE sem login (o SMS é o canal deles em críticos). O detalhe traz `inspectorStatus` e `hasAppAccess` por destinatário, com chips "Inactive"/"No app access". |
| Arquivar durante a entrega (L-F02-10, D26) | O job relê `archived_at` a cada lote e para os lotes seguintes. |
| Desativar revoga o push (L-F02-11, D27) | Desativar o inspetor revoga as assinaturas ativas (`DEACTIVATED`) e `push_enabled` vira `false`. |

## Estado atual (verificado @042a9674)

- **Canais:** `NotificationChannel` só tem `EMAIL | SMS` (`schema.prisma:1053`). `notification.test.ts:18-19` **garante** que não existe `IN_APP`.
- **Push:** não há nenhuma ocorrência de web-push, VAPID, PushSubscription ou PushManager. O service worker é o `generateSW` padrão do `vite-plugin-pwa` (`apps/pwa/vite.config.ts:9-35`), sem SW customizado.
- **Modelo `Notification`:** é log de entrega, sem estado de leitura. Não existe nenhum modelo de aviso ou caixa de avisos.
- **SMS:** o pipeline está em `send-notification.use-case.ts` (resolve template → supressões → consentimento → orçamento diário → E.164 → dispatch). Para texto livre, o caminho recomendado é um template de plataforma com corpo `{{message}}`, classe TRANSACTIONAL, `tenantId=null`, via `CreateNotificationUseCase`. Assim vêm de graça retry, polling de entrega e log.
- **Telefone do inspetor:** armazenado em E.164 (`auPhoneSchema`).

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| 00.6a | Modelos `InspectorNotice(id, title, body, critical, audience_json, author_user_id NULL=sistema, published_at)` e `InspectorNoticeRecipient(notice_id, inspector_id, read_at)`, **sem tenant_id**. Os destinatários são materializados na publicação. Coluna `archived_at`. Use cases: publicar, arquivar, listar (admin, com contagem de lidos e filtro de arquivados), caixa do inspetor (exclui arquivados) e marcar lido. Auditoria `inspector_notice.published` e `inspector_notice.archived`. **Sem endpoint de edição.** | M | 1,75 | – |
| 00.6b | Web (AM/OP): página "Inspector notices" com lista, botão "New notice" (título, texto, público: todos / selecionados / região, marcação de crítico) e detalhe com lidos X/Y e nomes. | M | 1,5 | 00.6a |
| 00.6c | PWA: caixa de avisos ("Announcements" do design, **sem** fixados) com badge de não lidos. A leitura é marcada ao abrir. A entrada fica em `/profile` hoje e move para "More" em F04. | B | 1,0 | 00.6a |
| 00.9a | Web Push: trocar para `injectManifest` com `src/sw.ts` (precache atual + `push` + `notificationclick` abrindo a rota do aviso). Modelo `PushSubscription(inspector_id, endpoint unique, p256dh, auth, revoked_at)`. Chaves VAPID via env. Lib `web-push` no backend. Controle "Push notifications" em `/profile/settings` (a única preferência do 00.3): liga ou desliga a assinatura deste dispositivo. Um 404/410 do endpoint revoga a assinatura (e, desde 2026-10-29, 401/403, 5 falhas seguidas e a desativação do inspetor). | A | 3,0 | F01 |
| 00.9b | Fallback: ao publicar um aviso **crítico**, envia push para quem tem assinatura ativa e SMS (template de plataforma `INSPECTOR_NOTICE_SMS`, TRANSACTIONAL) para quem não tem ou cujo push falhou. Não crítico: só caixa de avisos, mais push se habilitado. **Nunca SMS** (decisão F01: não há preferência de SMS). | M | 1,0 | 00.9a |

Os dias acima são os do plano (8,25). Acréscimos: +0,5 em 2026-10-28 (varredura de segurança, ressincronização da assinatura e `pushsubscriptionchange`) e +1,5 em 2026-10-29 pelas lacunas (backend +1,0: teto de SMS, entrega incompleta, revogação 401/403/`failure_count`/desativação, arquivamento automático e purga; web +0,25; PWA +0,25). **Total: 10,25 dias.**

**Push é entrega do aviso, não um canal de template.** Não adicionar `PUSH` ao `NotificationChannel`; isso evita mexer no teste que proíbe `IN_APP` e em todo o catálogo de templates.

## Fora do escopo

- Avisos fixados.
- Editar ou excluir um aviso publicado (só arquivar).
- SMS por "não leu em X min".
- Janela de silêncio para push/SMS (decisão explícita de 2026-10-29, L-F02-02).
- Agendar publicação.
- Anexos no aviso.
- Respostas do inspetor.
- Recibo de entrega do push.
- Push no portal web (só PWA).
- Preferências por tipo de aviso.

## RBAC

| Ação | Quem pode |
|---|---|
| Publicar avisos e ver leituras | AM/OP |
| Ler e marcar como lido | INSP (os próprios) |

## Critérios de aceite → como provar

- **00.A2:** um inspetor com push recebe a notificação na publicação do plano do dia (gatilho em F04). Um inspetor sem push recebe SMS. Aqui é provado com um aviso crítico manual; o gatilho do plano é provado em F04.
- **00.A4:** um aviso publicado aparece na caixa do destinatário, e o painel mostra a leitura.

## Riscos e armadilhas

- **iOS:** push só funciona com o PWA **instalado** (16.4+), por isso a dependência de F01.
- **Troca do service worker:** trocar `generateSW` → `injectManifest` pode quebrar o cache NetworkFirst atual de `/v1/inspector/schedule`. A spec precisa migrar o `runtimeCaching` para dentro do `sw.ts`. Testar a atualização do app (autoUpdate) num dispositivo instalado.
- **TRANSACTIONAL obrigatório:** uma notificação com `tenantId=null` precisa ser TRANSACTIONAL, senão consentimento e orçamento tentam um tenant nulo.
- **Registro do template:** registrar o template SMS no catálogo de plataforma. `TEMPLATE_NOT_FOUND` falha permanentemente.
- **Custo de SMS:** medir na homologação (§7 do contrato). Limitado pelo teto diário `INSPECTOR_NOTICE_SMS_DAILY_CAP` (L-F02-01); calibrar o teto com o custo medido.
- **Push na tela bloqueada:** o corpo do aviso é público em tela bloqueada e relógios; os consumidores (F03, F04, F08) não podem pôr dados sensíveis no título/corpo (L-F02-07).

## Quebra em PRs

1. Backend (avisos + destinatários + push sender + SMS fallback).
2. Web (avisos).
3. PWA (`sw.ts`, assinatura, caixa de avisos).
