# F02 · Lacunas

Revisão de `tarefas/F02-tarefas.md` (plano `F02-avisos-push-sms.md`; contratos F01/X01; consumidores F03/F04/F08). Código verificado no snapshot read-only de `origin/develop`. Nada do que já está nas tabelas "Decisões" (D1–D16, Q16) é reaberto aqui.

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 11 | 3 | 3 | 5 |

Decisão do dev necessária em: L-F02-01, L-F02-02, L-F02-03, L-F02-04, L-F02-06, L-F02-07.

---

## L-F02-01 · Nenhum guardrail de custo para o SMS `INSPECTOR_NOTICE_SMS`

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F02-1 · "Regras de entrega", "Registro do template", "Auditoria e observabilidade"; TASK-F02-2 · Drawer "New notice" (ConfirmDialog de crítico).
- **O que falta / está ambíguo:** a tarefa manda "medir na homologação", mas não define **nenhum limite** nem alerta: não há teto por aviso, teto diário de plataforma, nem confirmação com o número estimado de SMS. O SMS é `tenantId = null` + TRANSACTIONAL, que o pipeline **isenta** do teto diário (`isOverDailyBudget` devolve `false` para `isPlatformTransactional`). Ou seja, é o único SMS do sistema fora de qualquer balde. A reserva de 20% da F06 (D15 da F06) também não o enxerga, porque conta por `tenantId`.
- **Por que importa:** cenários concretos: (a) a OP marca "critical" num aviso "All" com 80 inspetores durante uma instabilidade do push service → com D2-a, 80 SMS de uma vez, sem aviso prévio na UI; (b) a F04 vai publicar `ROUTE_PUBLISHED` (crítico) **por inspetor, todo dia às 19:30** → todo inspetor sem push ativo recebe 1 SMS/dia para sempre, mais `ROUTE_CHANGED` a cada recálculo da OP e `COMPLETION_REMINDER`; (c) um bug de loop num consumidor (F03/F04/F08) com `dedupeKey` variável gera SMS ilimitados. Nenhum desses casos dispara alerta: só o log `delivery_completed` com `smsQueued`.
- **Evidência:** `send-notification.use-case.ts:711-721` (isenção de plataforma TRANSACTIONAL); F02-tarefas "Métricas: … medir na homologação"; "Achados em aberto · 3"; F04-tarefas D1 (publicação diária 19:30, crítica); F06-tarefas D15 (reserva por tenant). O ConfirmDialog de crítico diz só "sent by push, or by SMS to inspectors without push", sem número.
- **Proposta de regra/detalhe:** (1) teto diário de plataforma `INSPECTOR_NOTICE_SMS_DAILY_CAP` (env, padrão 500; `null` = sem teto), checado no `DeliverInspectorNoticeUseCase` pelo contador `notificationRepo.countByTenantChannelSince(null, 'SMS', início do dia)` filtrado por `template_code` (ou um contador próprio); acima do teto: não cria o SMS, marca `delivery_processed_at`, log `warn inspector_notice.sms_cap_reached { noticeId, cap }` e contador `smsSkippedCap` no `delivery_completed`; (2) no drawer web, quando `critical`, o ConfirmDialog mostra "Up to N inspectors may receive an SMS" usando `recipientCount` do público escolhido (para "All"/"Region" o número já vem das opções carregadas; para SELECTED é o tamanho da seleção) — não é "prévia de destinatários" (fora do escopo), é só o tamanho do público; (3) `logger.warn('inspector_notice.sms_burst', { noticeId, smsQueued })` quando `smsQueued >= 20` num único aviso.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Teto diário de plataforma por env + warn de burst + número no ConfirmDialog. Barato, sem tabela nova, degrada para "só caixa + push".
  2. Só observabilidade (warn de burst + número no ConfirmDialog), sem teto; aceitar o risco até a homologação.
  3. Teto por aviso (ex.: máx. 50 SMS por aviso manual; sistema sem teto).

## L-F02-02 · Sem regra para envios noturnos (push crítico com `requireInteraction` e SMS a qualquer hora)

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F02-1 · "Regras de entrega", "Varredura de segurança"; TASK-F02-2 · ConfirmDialog de crítico; API de aviso de sistema.
- **O que falta / está ambíguo:** D2 decide que o SMS sai "na hora" (isto é, sem job de "não leu em X min"), mas **não diz nada sobre horário**. Não há janela de silêncio para push (crítico = `urgency: 'high'` + `requireInteraction: true`) nem para SMS, em nenhuma das três origens: aviso manual (OP a qualquer hora), `ROUTE_CHANGED` (recálculo manual da OP, inclusive de madrugada), e a varredura D13, que pode entregar até 24 h depois (um aviso das 23:00 cujo enqueue se perdeu sai às 23:07). A F06 tem regra explícita (07:00, só até 09:00); a F02, que é o canal mais intrusivo (SMS para o telefone pessoal do contratado), não tem.
- **Por que importa:** OP publica às 22:40 um aviso "critical" para "All" sobre o dia seguinte → 80 inspetores recebem push com alerta persistente e, os sem push, SMS às 22:40. Repetido semanalmente vira reclamação e desliga o push (o oposto do objetivo do 00.9). Para `COMPLETION_REMINDER` a F03 já limita a "hoje", mas um slot 22:30 + 30 min ainda manda SMS às 23:00.
- **Evidência:** F02-tarefas D2 e "Regras de entrega" (sem qualquer filtro de hora); `workers.ts` não tem nenhum conceito de quiet hours (`grep -i quiet` só acha um comentário); F06-tarefas D3 (janela 07:00–09:00) mostra que o produto já reconhece horário como regra.
- **Proposta de regra/detalhe:** mínimo: registrar explicitamente "sem janela de silêncio na F02" como decisão, e (a) no drawer web, quando `critical` e a hora de Sydney estiver entre 21:00 e 07:00, acrescentar ao ConfirmDialog "It's {hh:mm} in Sydney. Inspectors will be notified now."; (b) a varredura D13 não reenfileira entre 22:00 e 06:00 Sydney (janela de 24 h continua; o aviso sai de manhã); (c) o log `delivery_completed` ganha `sydneyHour` para medir. Se o dev preferir uma janela real, ela deve ser só para o SMS (push continua, porque o inspetor controla o "não perturbe" do aparelho): SMS criado com `startAfter = próximas 07:00 Sydney` via `CreateNotificationUseCase` — exige que o pipeline aceite `startAfter`, o que hoje não existe.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Sem janela; aviso de hora no ConfirmDialog + varredura não roda de madrugada + medir. Mantém D2 e o escopo.
  2. Janela 21:00–07:00 Sydney só para o SMS (push imediato, SMS adiado para 07:00). Custa `startAfter` no `CreateNotificationUseCase` (+0,25 dia) e um estado "SMS adiado" no log.
  3. Janela para push e SMS (tudo adiado para 07:00), exceto `ROUTE_PUBLISHED`/`ROUTE_CHANGED` das 19:30. Mais complexo; contraria "crítico".

## L-F02-03 · Entrega parcial sem recuperação: job que expira ou esgota os retries deixa destinatários sem push/SMS e sem alerta

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F02-1 · "Regras de entrega" (passos 1, 9), "Varredura de segurança", "Auditoria e observabilidade".
- **O que falta / está ambíguo:** a varredura D13 só olha `delivery_started_at IS NULL`. Depois que o job grava `delivery_started_at` (passo 1), **nenhum mecanismo** recupera destinatários com `delivery_processed_at IS NULL` se o job falhar de vez. E ele pode falhar de vez: `expireInMinutes: 15` com `retryLimit: 3` contra o pior caso da própria regra (500 destinatários × até 2 assinaturas × `timeout: 10000` ms ÷ 10 em paralelo ≈ 17 min, exatamente no cenário de D2-a em que o push service está em timeout). Não há `delivery_completed_at`, não há log de "entrega incompleta", e o `system.dlq-monitor` só alerta com **≥ 10 jobs falhos na mesma fila** (um aviso falho fica abaixo do limiar).
- **Por que importa:** aviso crítico "All" durante uma instabilidade do push service: o job expira no destinatário 300, é refeito 3 vezes (cada vez começando do 301 em diante, mas ainda com timeouts), acaba em `failed`. Os inspetores 301–500 não recebem push nem o SMS que D2-a prometia, a OP vê `readCount` baixo e ninguém sabe por quê. É justamente o cenário que motivou D2-a.
- **Evidência:** F02-tarefas "Regras de entrega" 2 e 9 ("lotes de 50, 10 em paralelo", "`expireInMinutes: 15`", "Exceção não tratada → o pg-boss refaz"); "Varredura" 1 (`delivery_started_at IS NULL`); `dlq-monitor.ts:24,44` (threshold 10 por fila); `package.json` `pg-boss ^9.0.3` (expiração marca o job como `failed`).
- **Proposta de regra/detalhe:** (1) coluna `delivery_completed_at` em `inspector_notices`, gravada no fim do job; (2) a varredura ganha um segundo critério: `delivery_started_at <= now() - 20 min AND delivery_completed_at IS NULL AND EXISTS recipient com delivery_processed_at IS NULL` (mesma janela de 24 h, mesmo `singletonKey` — o pg-boss já evita dois jobs ativos); (3) `expireInMinutes` dimensionado pelo volume: `max(15, ceil(recipients × 2 × 10 s ÷ 10 ÷ 60) + 5)`, ou timeout do push reduzido para 5 s; (4) log `error inspector_notice.delivery_incomplete { noticeId, pending }` quando a varredura reenfileira pelo critério novo; (5) teste unitário da varredura com esse caso e teste DB "job morre no destinatário 2 de 3 → varredura completa o 3º sem repetir 1 e 2".
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Varredura cobre também entrega iniciada e não concluída (+ `delivery_completed_at`, +0,25 dia).
  2. Só dimensionar `expireInMinutes`/timeout e alertar (`error`) quando o job falhar de vez, sem reenfileirar (a OP republica à mão).
  3. Reduzir o pior caso: `INSPECTOR_NOTICE_SELECTED_MAX` e "All" limitados a 200 destinatários por aviso (quebra "All" em avisos múltiplos; pior UX).

## L-F02-04 · Assinatura que falha permanentemente nunca é revogada; rotação de chave VAPID não tem caminho de recuperação

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F02-1 · `web-push.sender`, "Regras de entrega" 4, "Env"; TASK-F02-3 · `usePushSubscription`, `usePushSubscriptionSync`.
- **O que falta / está ambíguo:** só 404/410 revogam. 400/401/403 (VAPID inválido ou **trocado**, `applicationServerKey` diferente do que a assinatura foi criada), 413 e qualquer erro repetido ficam como `FAILED` **para sempre**: a assinatura continua ativa, `push_enabled = true`, e cada aviso crítico gasta um push inútil **e um SMS** (D2-a). Do lado do cliente, `usePushSubscriptionSync` reenvia a mesma assinatura antiga a cada abertura (o `getSubscription()` não é nulo) e o controle mostra "On". A tarefa diz "trocar a chave invalida todas as assinaturas daquele ambiente", mas não diz **como** o sistema sai desse estado.
- **Por que importa:** rotação de chave em prod (ou um vazamento) → 100% dos inspetores com push ficam em `FAILED` silencioso; todos os críticos viram SMS (custo, L-F02-01) e o inspetor não tem como "religar" porque o app acha que já está ligado.
- **Evidência:** F02-tarefas `web-push.sender.test.ts` ("400 / 413 / 429 / 500 → FAILED"), "Regras de entrega" 4 ("FAILED → … assinatura **não** revogada"), "Env" ("Trocar a chave invalida todas as assinaturas"); `usePushSubscription` caso "ligado: `getSubscription()` não nulo → `on`".
- **Proposta de regra/detalhe:** backend: (a) 401/403 do push service → `GONE`-like: revogar com `revoked_reason = 'REJECTED'` (ampliar o enum de `revoked_reason`); (b) coluna `failure_count` incrementada em `FAILED` e zerada em `SENT`; `failure_count >= 5` → revogar com `'FAILED'`. Cliente: no `usePushSubscription`/`usePushSubscriptionSync`, comparar `subscription.options.applicationServerKey` (bytes) com `vapidPublicKey` de `push-config`; se diferirem → `subscription.unsubscribe()` e, com `Notification.permission === 'granted'`, `subscribe` de novo com a chave atual (não exige gesto) e POST. Teste: "chave do servidor mudou → reassina com a nova".
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** 401/403 revogam + `failure_count` com limiar + cliente reassina quando a chave muda.
  2. Só o cliente reassina quando a chave muda (cobre rotação; não cobre falha permanente de outro tipo).
  3. Só documentar rotação como "operação manual: `UPDATE inspector_push_subscriptions SET revoked_at = now(), revoked_reason = 'GONE'`" e aceitar o SMS extra em outras falhas.

## L-F02-05 · Precedência dos estados do controle de push não está definida (iOS Safari sem instalar não tem `PushManager`)

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F02-3 · `usePushSubscription.test.tsx`, "UI por tela · 1".
- **O que falta / está ambíguo:** a tabela lista `unsupported` (sem `PushManager`), `ios-needs-install`, `unavailable` (sem VAPID), `blocked` (permissão `denied`), `off`/`on` como casos independentes, mas vários ocorrem **ao mesmo tempo** e a ordem decide a cópia. No iOS Safari fora do standalone (16.4+) **não existe** `PushManager`/`Notification` → se `unsupported` for avaliado primeiro, o inspetor vê "This browser doesn't support push notifications" em vez de "add Properfy to your Home Screen", e nunca descobre o caminho. `blocked` × `unavailable` também não tem ordem.
- **Por que importa:** o caminho iOS é o risco nº 1 do plano ("iOS: push só funciona com o PWA instalado") e o copy errado o torna invisível. Sem ordem definida, dois implementadores produzem comportamentos diferentes e o teste unitário não prova o certo.
- **Evidência:** F02-tarefas `usePushSubscription` casos "sem suporte" e "iOS fora do standalone" sem precedência; F01-tarefas `pushPermission: 'unsupported' se !('Notification' in window)` (mesma situação no heartbeat).
- **Proposta de regra/detalhe:** ordem fixa: 1) `getIsIosSafariEligible() && !getIsStandalone()` → `ios-needs-install`; 2) sem `serviceWorker`/`PushManager`/`Notification` → `unsupported`; 3) `Notification.permission === 'denied'` → `blocked`; 4) `push-config.vapidPublicKey === null` → `unavailable`; 5) `getSubscription()` → `on`/`off`. Acrescentar ao teste um caso combinado (iOS não instalado **e** sem `PushManager` → `ios-needs-install`; `denied` **e** sem VAPID → `blocked`).
- **Precisa de decisão do dev?** Não.

## L-F02-06 · Sem retenção nem arquivamento automático: a caixa e a lista da OP crescem sem limite com avisos de sistema diários

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F02-1 · "Modelo de dados", "Deploy / rollout"; "Contratos exportados"; "Achados em aberto · 1".
- **O que falta / está ambíguo:** não há regra de retenção para `inspector_notices`/`inspector_notice_recipients` nem para `inspector_push_subscriptions` revogadas, e nenhum arquivamento automático. Com F03/F04/F08 em produção, cada inspetor acumula ≥ 1 aviso de sistema por dia útil (`ROUTE_PUBLISHED`), mais recálculos, lembretes e mensagens de desempenho. A caixa do PWA (sem filtro, sem busca, "Load more") e o detalhe `GET /v1/inspector-notices/:id` (recipients sem paginação) ficam inutilizáveis em meses; o achado 1 só fala do filtro da lista web. A tarefa também não diz se o aviso de sistema antigo deve continuar "não lido" no contador para sempre (um inspetor que nunca abre a caixa terá "99+" permanente, o que mata o selo D14).
- **Por que importa:** em 6 meses com 40 inspetores: ~5.000+ avisos de sistema e dezenas de milhares de recipients; o selo da aba Profile vira ruído; o `audit.retention` existente não cobre essas tabelas.
- **Evidência:** F02-tarefas modelo de dados (sem `expires_at`/retention); `workers.ts:267-285` (só `audit.retention`); F04-tarefas D1 (1 aviso/inspetor/dia); F08-tarefas (3 tipos de `PERFORMANCE_MESSAGE` por ciclo).
- **Proposta de regra/detalhe:** job diário `inspector-notice.auto-archive` (03:45 Sydney, como `audit.retention`): arquiva (`archived_at = now()`, D4) avisos **de sistema** com `published_at < now() - 30 dias`, sem audit por linha (um log `info inspector_notice.auto_archived { count }`); avisos manuais não são tocados (histórico da OP). Purga `inspector_push_subscriptions` com `revoked_at < now() - 90 dias`. Registrar o valor como env `INSPECTOR_NOTICE_SYSTEM_RETENTION_DAYS` (padrão 30). Teste unitário do job e caso na suíte DB.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Auto-arquivar avisos de sistema após 30 dias; manuais ficam; purga de assinaturas revogadas após 90 dias.
  2. Auto-arquivar todos (manuais inclusive) após 90 dias.
  3. Nada na F02; registrar como item obrigatório da F04 (que é quem gera o volume), com a caixa paginada já preparada.

## L-F02-07 · Conteúdo do push na tela bloqueada não tem regra (endereço do imóvel e texto livre da OP visíveis sem desbloquear)

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F02-1 · "Payload do push"; API de aviso de sistema; consumidores F03 (`COMPLETION_REMINDER` com `{propertyAddress}`) e F04.
- **O que falta / está ambíguo:** o payload leva `title` + `body` (≤ 180 chars) e o SW sempre mostra os dois na notificação do sistema, que aparece na tela bloqueada e em smartwatches. A F03 coloca código e endereço do imóvel no corpo; a OP pode escrever qualquer coisa (nome de inquilino, código de lockbox). Não há regra sobre o que pode ir no corpo do push vs. ficar só na caixa, nem opção de notificação "genérica" para avisos críticos.
- **Por que importa:** aparelho pessoal do contratado numa mesa/carro: "Did you finish INS-0042 at 12 King St, Newtown?" legível por terceiros; para um aviso manual com código de chave, é um vazamento operacional.
- **Evidência:** F02-tarefas "Payload do push" e `sw.ts` (`showNotification(title, options)` sempre com `body`); F03-tarefas 16 (corpo do lembrete com endereço).
- **Proposta de regra/detalhe:** documentar na spec e no hint do drawer ("Shown on the lock screen. Don't include keys, codes or tenant details.") e, no `buildNotification`, usar `options.body` só para não críticos? Não — mais simples: manter o corpo e adicionar o hint + a regra para consumidores ("o corpo do push é público na tela bloqueada; dados sensíveis ficam só no aviso"). Opcional: `pushBodyMode: 'FULL' | 'GENERIC'` por tipo de sistema (`GENERIC` → "Open the app to see details").
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Só hint no drawer + regra documentada para F03/F04/F08; corpo completo no push.
  2. Avisos críticos de sistema com corpo genérico no push ("Open the app to see details"); manuais completos.
  3. Tudo genérico no push (pior UX; contraria o design v3).

## L-F02-08 · Algoritmo de casamento da allowlist `INSPECTOR_NOTICE_TARGET_PATTERNS` não está especificado

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F02-1 · "Constantes shared" (D15); TASK-F02-3 · `push-handlers`.
- **O que falta / está ambíguo:** a constante mistura padrões com `:id` e, pelos consumidores, padrões **estáticos** (`/today` na F04, `/profile/challenges` na F08). A tarefa diz "`:id` = UUID, sem query, sem fragmento, sem host" mas não define: barra final (`/today/`), maiúsculas no UUID, `//` duplo, segmentos codificados (`/schedule/%2e%2e`), comprimento (a coluna é `VarChar(200)`), e se o casamento é exato por segmento ou prefixo. Dois implementadores (backend e SW) podem divergir, e a tarefa exige que sejam a **mesma** função.
- **Por que importa:** divergência entre o que o backend grava e o que o SW aceita → toque cai no fallback `/profile/announcements` e o `fromNotice` não marca a leitura; ou, pior, um padrão frouxo deixa passar `/schedule/<uuid>/..%2f` para fora da rota prevista.
- **Evidência:** F02-tarefas "Constantes shared" (comentário de 2 linhas); testes listam só 7 negativos; F04-tarefas 1579 (`'/today/route/x'` → erro) e F08-tarefas 1012 (`/profile/challenges`).
- **Proposta de regra/detalhe:** especificar `isAllowedInspectorNoticeTargetPath`: `path.length <= 200`; começa com `/`; sem `?`, `#`, `//`, `%`, `\`; split por `/` exato (sem barra final); cada padrão casa segmento a segmento; `:id` casa só `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` em minúsculas. Acrescentar aos testes: `/today/`, `/Schedule/<uuid>`, `/schedule/<UUID maiúsculo>`, `/schedule/%2e%2e`, string de 201 chars.
- **Precisa de decisão do dev?** Não.

## L-F02-09 · Destinatários inativos ou sem login não têm tratamento definido nas contagens e na lista de leituras

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F02-1 · "Regras de publicação" 1, `inspectorNoticeDetailSchema`; TASK-F02-2 · detalhe "Read by X of Y".
- **O que falta / está ambíguo:** (a) "All" inclui inspetores ACTIVE **sem `user_id`** (sem login no app): nunca poderão ler, mas contam no denominador "Read by X of Y" e, se crítico, recebem SMS — é intencional? (b) o inspetor desativado depois da publicação "continua na lista" (caso de borda 3), mas o item `{inspectorId, inspectorName, readAt}` não traz status, então a OP vê "Unread" sem saber que é inativo; "Read by 3 of 10" nunca chega a 10.
- **Por que importa:** a OP interpreta o X/Y como adesão; com 2 inativos e 1 sem app, "7 of 10" parece ruim e gera republicações desnecessárias (e, se críticas, SMS).
- **Evidência:** F02-tarefas "Regras de publicação" (`status = 'ACTIVE' AND deleted_at IS NULL`, sem condição de `user_id`); `inspectorNoticeDetailSchema.recipients` sem `status`; `schema.prisma` `Inspector.user_id String? @unique`.
- **Proposta de regra/detalhe:** manter "All" = ACTIVE (inclusive sem login; o SMS é o canal deles) e acrescentar `inspectorStatus: 'ACTIVE' | 'INACTIVE'` e `hasAppAccess: boolean` ao item de `recipients`; o detalhe web mostra chip "Inactive" / "No app access" ao lado do nome e o texto "Read by X of Y (Z can't read in the app)". Lista admin continua X/Y simples.
- **Precisa de decisão do dev?** Não (a proposta só acrescenta campos declarados; se o dev preferir excluir inspetores sem `user_id` do "All", isso vira decisão).

## L-F02-10 · Arquivar durante uma entrega em andamento: o job só confere `archived_at` no início

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F02-1 · "Regras de entrega" 1–2; "Casos de borda" 5.
- **O que falta / está ambíguo:** o caso 5 cobre "arquivado **antes** do job". Se a OP arquiva no meio (lotes de 50; com D2-a e timeouts, um aviso "All" leva minutos), os lotes seguintes continuam mandando push e SMS de um aviso que a OP acabou de retirar — e o toque abre o 404 amigável. Não está escrito se é aceito ou se o job relê o aviso por lote.
- **Por que importa:** a OP publica errado, percebe, arquiva em 30 s e publica a correção; os dois chegam por SMS a metade dos inspetores.
- **Evidência:** F02-tarefas "Regras de entrega" 1 ("Carrega o aviso; se `archived_at` não nulo → sai") sem repetição por lote; caso de borda 5.
- **Proposta de regra/detalhe:** reler `archived_at` no início de cada lote de 50; se arquivado, parar, marcar os destinatários restantes com `delivery_processed_at = now()` e logar `delivery_skipped_archived { processed, skipped }`. Teste: "arquivado entre o lote 1 e o 2 → lote 2 não envia".
- **Precisa de decisão do dev?** Não.

## L-F02-11 · Desativar inspetor não revoga assinaturas de push nem zera `push_enabled`

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F02-1 · "Modelo de dados" (`revoked_reason`), passo 4; TASK-F02-3 · logout em `DeactivatedPage`.
- **O que falta / está ambíguo:** `DeactivateInspectorUseCase` põe o usuário em INACTIVE e **revoga todas as sessões**; o logout do `DeactivatedPage` tenta `POST .../unsubscribe` com um token já revogado → 401 engolido → a assinatura fica ativa no servidor e `push_enabled` continua `true`. A entrega pula INACTIVE (caso 15), então não há envio indevido, mas o web mostra "Push: On" para um inspetor desativado e, se ele for reativado meses depois, a primeira entrega gasta um push num endpoint morto (410) antes de cair no SMS. `revoked_reason` só prevê `GONE | UNSUBSCRIBED`.
- **Por que importa:** dado incoerente no painel (D10 diz que `push_enabled` = "existe assinatura ativa") e um caminho de reativação não previsto.
- **Evidência:** `deactivate-inspector.use-case.ts:72-79` (`status INACTIVE`, `revokeAllSessions`); F02-tarefas "Logout" ("Todo erro é engolido"); tabela `revoked_reason`.
- **Proposta de regra/detalhe:** no `DeactivateInspectorUseCase` (ou num subscriber do audit/evento de desativação), revogar as assinaturas ativas com `revoked_reason = 'DEACTIVATED'` e recomputar `push_enabled` na mesma transação; teste unitário e caso na matriz da F01 (coluna Push vira "Off" ao desativar). Reativar não religa nada (o app ressincroniza no próximo login, D10).
- **Precisa de decisão do dev?** Não.
