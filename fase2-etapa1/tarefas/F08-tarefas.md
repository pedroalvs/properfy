# F08 · Tarefas (cada tarefa = 1 PR = 1 spec)

| | |
|---|---|
| **Feature** | F08 · Metas e recompensas (contrato 03.6, 03.7, 03.8, 03.9, 03.10, 03.13, 03.14, 03.15, 03.17; critérios **03.A3, 03.A4, 03.A5**) |
| **Total** | **19,125 dias** (plano 14,0 + 2,0 das lacunas L-F08-01…14 aplicadas em 2026-10-29 + 0,125 da reconciliação entre tarefas de 2026-10-29 — `index_snapshot_date`, DR2 + **3,5 do aditivo Q12 (TASK-F08-6, 2026-10-30)** − 0,5 do pagamento manual retirado das TASK-F08-1/3; distribuição abaixo) |
| **Tarefas / PRs** | 6: as 5 da "Quebra em PRs" do plano (backend de metas + prêmios + job → prioridade de oferta → web (metas, rewards) → PWA Challenges + mensagens → relatório) + a TASK-F08-6 do aditivo Q12 (bônus no ledger e na fatura do inspetor) |
| **Depende de** | **F07** (TASK-F07-1: `ReliabilityMetricsService.computeMetric`/`computeAll` → `ReliabilityComputationBatch`, `computeReliabilityScore`, leitor de fatos; TASK-F07-2: snapshots com `settings_json`, `ReliabilityIndexReader.getCurrentIndexes`, job `reliability.compute-snapshots` 04:15; TASK-F07-3: página "Inspector performance"); **F02** (TASK-F02-1: `PublishSystemInspectorNoticeUseCase`, tipo `PERFORMANCE_MESSAGE`, allowlist de destinos); **F03** (TASK-F03-1: `PlatformSetting`; TASK-F03-4: página "Platform settings"); **X01** (grupo Dashboard, `BackButton`/`backTo`); **F04** (TASK-F04-3: aba More = hub `/profile`; TASK-F04-3b: passo 8 do tour) |
| **Bloqueia** | – |
| **Código verificado em** | `origin/develop` @ `042a9674` (snapshot read-only, 2026-10-27); billing da TASK-F08-6 reverificado @ `ba076fc4` (2026-10-30). O que F02, F03, F04, F07 e X01 entregam é tratado como existente (Onda 5). |
| **Decisões** | Do plano: **2026-10-27** (`F08-metas-recompensas.md`; `decisoes.md` Q12 ✅ **DECIDIDA pelo cliente em 2026-10-30: bônus no financeiro, aditivo (cláusula 9.4), TASK-F08-6**, Q13, Q18). Do dev: **2026-10-28** (DV1–DV6 abaixo). Premissas desta quebra: P1–P11 (2026-10-28). Lacunas: **2026-10-29** (L-F08-01…14, todas as recomendações aceitas; regras DL1–DL14 abaixo). Reconciliação com F02, F07, X00 e X01: **2026-10-29** (DR1–DR7 abaixo). |

**Distribuição do plano (14,0) pelas 6 tarefas.** Sem item novo pago acima do plano: a extensão de escopo do `computeMetric` e a coluna de nível na página da F07 são pagas com os cortes de escopo de 2026-10-28.

| Item do plano | Dias plano | TASK-F08-1 | TASK-F08-2 | TASK-F08-3 | TASK-F08-4 | TASK-F08-5 | TASK-F08-6 |
|---|---|---|---|---|---|---|---|
| 03.6/03.7/03.8 modelo + regras + CRUD + auditoria | 3,0 | 1,75 (modelo, migration, API, validação, audit, guarda de exclusão de região) | – | 1,25 (lista, formulário, item de menu, coluna de nível na F07) | – | – | – |
| 03.9 + apuração | 4,0 | 4,0 (inclui o escopo `{ regionId?, serviceTypeId? }` no leitor da F07) | – | – | – | – | – |
| 03.13 painel Rewards | 1,5 | 0,5 (resumo, aprovar/anular, CAS) | – | 1,0 (painel, diálogos, seção de settings) | – | – | – |
| 03.7 prioridade (acesso antecipado) | 1,5 | – | 1,5 | – | – | – | – |
| 03.10/03.15 PWA + `GET /v1/inspector/program` | 2,5 | – | – | – | 2,5 | – | – |
| 03.17 mensagens automáticas | 0,5 | – | – | – | 0,5 | – | – |
| 03.14 exportação | 1,0 | – | – | – | – | 1,0 | – |
| Lacunas 2026-10-29 (L-F08-01…14) | +2,0 | +0,75 (L-02 reativação/`endsAt`/termos do próximo período; L-03 `PAID → VOID`; L-05, L-10, L-11, L-13 em contratos e testes) | +0,25 (L-08 `enabledAt` + mensagem com dia) | +0,25 (L-02 copy e alteração pendente; L-03 anular pago; L-04 aviso; L-05 nota ao inspetor; L-11 "hoje" em Sydney) | +0,5 (L-01 envio às 08:00 agregado; L-06 guarda de 7 dias; L-12 "Starting soon"; L-07, L-09, L-14 copy) | +0,25 (L-02 linhas puladas; L-03, L-05, L-13 colunas) | – |
| Reconciliação 2026-10-29 (DR1–DR7) | +0,125 | +0,125 (DR2: `index_snapshot_date` em fechamento e prêmio, regra do snapshot atrasado, teste) | – | – | – | – | – |
| Q12 decidida 2026-10-30: pagamento manual retirado | −0,5 | −0,25 (rota `mark-paid`, `paidOn` em Sydney/L-F08-11, ramo `PAID → VOID` com `recovery_note`) | – | −0,25 (diálogo "Mark as paid", "Paid on" em Sydney, variante "Void" de pago) | 0 (só copy) | 0 (troca de colunas) | – |
| **Aditivo Q12 (cláusula 9.4, 2026-10-30)** | +3,5 | – | – | – | – | – | 3,5 (ledger, fatura, PAID pela fatura, reversão, agências, web, PWA) |
| **Total** | **19,125** | **6,875** | **1,75** | **2,25** | **3,5** | **1,25** | **3,5** |

**Lacunas (2026-10-29).** As 14 lacunas de `tarefas/lacunas/F08-lacunas.md` foram aplicadas (dev aceitou todas as recomendações, lote 2). Elas acrescentam **2,0 dias** acima do plano, pagos como pedido de ajuste da quebra (não cabem nos cortes de 2026-10-28).

**Aditivo Q12 (2026-10-30).** O cliente decidiu que o bônus entra no módulo financeiro (ledger + fatura do inspetor). É pedido de mudança (cláusula 9.4 do contrato), **+3,5 dias** na TASK-F08-6. Como as TASK-F08-1/3 ainda não foram feitas, o pagamento manual ("Mark as paid", `paidOn`, `payment_reference`, `recovery_note`, `PAID → VOID` manual) **não é construído** nelas (−0,5): saldo líquido **+3,0** (16,125 → 19,125).

**Como os itens sem dono cabem no plano.**
- **Escopo no `computeMetric` (TASK-F08-1, ~0,5).** Os contratos exportados da F07 (item 1) deixam a extensão para a F08. Cabe nos 4,0 da apuração porque saíram desta quebra: recompensa `OFFER_PRIORITY` e o seu efeito no marketplace, a lógica de autor/autoaprovação dos prêmios, o título único com índice parcial, a configuração `streakCycle`, os jobs extras e o `canonical-period.ts` duplicado.
- **Coluna "Level" na página "Inspector performance" (TASK-F08-3, ~0,25).** O plano (linha 03.11) dá a coluna à F08 e nenhuma tarefa a tinha. Cabe nos 1,25 do CRUD web porque o formulário perdeu o tipo de recompensa, o título único e a configuração da sequência. É **só web**: o nível é derivado do `score` que a resposta da F07 já traz, com `resolveInspectorLevel` e a chave `inspectorProgram`.

## Resumo

| ID | Título | Dias | Depende de |
|---|---|---|---|
| TASK-F08-1 | Backend + shared: `InspectorGoal`, `RewardAward`, `GoalPeriodClosure`, chave `inspectorProgram`, CRUD de metas (reativação pula períodos inativos, `endsAt` ≥ período corrente, alvo/bônus valem do próximo período), guarda na exclusão de região, job diário `inspector-program.daily` (fechamento + apuração), níveis e sequência derivados, progresso parcial, escopo no `computeMetric`, resumo e ações de prêmio (aprovar com CAS, anular `PENDING`/`APPROVED`; sem pagamento manual, Q12), `index_snapshot_date` no fechamento | 6,875 | F07-1, F07-2, F03-1 |
| TASK-F08-2 | Backend: acesso antecipado por nível (Q13) em `findEligibleGroupIds`, contagem, detalhe e `accept-offer`, com as regras de partida (desligado por padrão, só se houver qualificado elegível, nunca hoje/D+1, só para publicações depois de `enabledAt`) | 1,75 | TASK-F08-1 |
| TASK-F08-3 | Web (AM/OP): "Goals & rewards" (abas Goals e Rewards), formulário de meta, painel prometido × atingido, aprovar/anular (nota ao inspetor; sem "Mark as paid", Q12), item no grupo Dashboard, seção "Inspector program" em "Platform settings", coluna "Level" na página da F07, E2E do 03.A4 | 2,25 | TASK-F08-1; X01; F03-4; F07-3 |
| TASK-F08-4 | Backend + shared + PWA: `GET /v1/inspector/program`, tile "Challenges" em More (Active com "Starting soon" / My results / Ranking anônimo com coorte mínima), mensagens `PERFORMANCE_MESSAGE` calculadas pelo job diário e enviadas às 08:00 (agregadas por inspetor, guarda de 7 dias no nível), `/profile/challenges` na allowlist da F02, passo 8 do tour | 3,5 | TASK-F08-1, TASK-F08-3 (`describeGoal`); F02-1/F02-3; F04-3/F04-3b |
| TASK-F08-5 | Backend + shared + web: `ReportType` `INSPECTOR_PROGRAM` (AM/OP) nos 10 lugares do plano + os 2 que o código exige; colunas de lançamento e fatura do bônus | 1,25 | TASK-F08-1, TASK-F08-3 (`describeGoal`), TASK-F08-6 (`inspector_invoice_id`, lançamento) |
| TASK-F08-6 | Backend + shared + web + PWA: aditivo Q12 — `FinancialEntryType` `INSPECTOR_BONUS` (`tenant_id` nulo só nele), lançamento criado na aprovação do prêmio, linha na fatura do inspetor (snapshot, total, PDF), `PAID` automático pela fatura, anulação com reversão (faturado: só AM), isolamento das agências, leitores do billing, Earnings no PWA | 3,5 | TASK-F08-1, TASK-F08-3 |

Ordem de merge: 1 → 2 → 3 → 6 → 4 → 5. A 2 e a 3 só dependem da 1; a 6 depende da 1 (aprovação) e da 3 (aba Rewards); a 4 depende da 1 e da 3 (`describeGoal`) e pode ser feita em paralelo com a 6, mas entra **depois** dela para a copy do app (DL14) já ser verdade no merge; a 5 depende também da 6 (colunas de lançamento/fatura). Cada PR parte de `develop` depois do merge da anterior (memória `project_stacked_pr_ci_does_not_run`).

## Decisões que valem para as 6 tarefas

**Do plano (2026-10-27):**

- **D1 · Q12 ✅ DECIDIDA pelo cliente (2026-10-30): bônus no financeiro, aditivo (cláusula 9.4, +3,5 dias, TASK-F08-6).** A aprovação do prêmio cria, na mesma transação, um lançamento `INSPECTOR_BONUS` (`APPROVED`, sem agência) que entra na **fatura do inspetor** do período que contém a data da aprovação. O `RewardAward` segue `PENDING → APPROVED → PAID`, com `PAID` **automático** quando a fatura que contém a linha do bônus é marcada paga (e de volta a `APPROVED` se o pagamento da fatura for estornado), ou `VOID` (antes de faturado, anula o lançamento; depois, só AM, com lançamento de reversão — DL3). **Não existe pagamento manual** ("Mark as paid", `paidOn`, `payment_reference`, `recovery_note`). As TASK-F08-1…5 não tocam `financial_entries`, `inspector_invoices` nem o billing: o único ponto de integração é a TASK-F08-6 (na aprovação, no fechamento/pagamento/estorno da fatura e na anulação). Entre o merge da TASK-F08-1 e o da TASK-F08-6, um prêmio aprovado só fica `APPROVED`.
- **D2 · Q13 · Acesso antecipado por nível.** Um grupo publicado há menos de **H** horas só aparece e só pode ser aceito por inspetores de nível **≥ X** (regras de partida em DV3). H e X ficam no `PlatformSetting`. Vale em `findEligibleGroupIds` **e** no `accept-offer`. Depois de H horas o grupo fica visível para todos.
- **D3 · Níveis.** 3 níveis por faixa do índice atual da F07: Bronze < 60, Silver 60–84,9, Gold ≥ 85, com os limites configuráveis. Score nulo = sem nível. Nível e sequência são **derivados, sem tabela**.
- **D4 · Sequência.** Períodos fechados consecutivos com pelo menos uma meta atingida (derivação em P11).
- **D5 · Métricas de meta.** Volume (geral, por região, por tipo de serviço), índice ≥ X ou qualquer métrica do índice ≥ X% (≤ X% para "não consigo fazer") no período da meta, pelo `computeMetric` da F07. Taxas exigem **10 serviços** no período.
- **D6 · Regras fixas do 03.8.** Participam os inspetores ativos no escopo; contam os DONE do período (data do serviço = P2 da F07: `finished_at` para executados, `scheduled_date` para DONE sem execução, `created_at` do evento para `CANT_ATTEND`, sempre no fuso da agência; DR1); o fechamento é no fim do período; desempate pelo índice e depois por quem atingiu primeiro; prêmio idempotente por `(meta, inspetor, período)`.
- **D7 · Ranking no app (03.A3).** Posição própria + pontuações dos outros, **sem nome, foto nem id**.
- **D8 · Agências (Q18).** Não veem nada: CL_ADMIN, CL_USER e TNT recebem 403 em todas as rotas; `INSPECTOR_PROGRAM` fica fora de `AGENCY_REPORT_TYPES`.
- **D9 · Navegação.** Web: **"Goals & rewards"** no grupo Dashboard (X01). PWA: tile **"Challenges"** no hub More (`ProfilePage`, rotas `/profile/*`, DB1 da F04; forma de tile por DL9). Dashboards existentes não mudam (a página "Inspector performance" é da Fase 2, F07, e a coluna de nível é atribuída à F08 pelo plano).
- **D10 · Mensagens (03.17).** Pela F02, `PERFORMANCE_MESSAGE` (nunca crítico: caixa + push, sem SMS): meta atingida, subiu/desceu de nível, sequência em risco.
- **D11 · Exportação (03.14).** `ReportType` `INSPECTOR_PROGRAM`, só AM/OP.
- **D12 · Sem `tenant_id`.** `InspectorGoal`, `RewardAward` e `GoalPeriodClosure` são entidades de plataforma (inspetor cross-tenant; precedentes: `Inspector`, `ServiceRegion` global, `PlatformSetting`, `InspectorReliabilitySnapshot`). **Cada spec registra a exceção ao §7.1 do CLAUDE.md.** Isolamento pelo RBAC (D8); nenhuma linha guarda nome de agência, endereço ou coordenada.

**Do dev (2026-10-28):**

- **DV1 · Prioridade de oferta só pelo nível.** As recompensas de meta são **só CASH**. Não existe tipo de recompensa nem prêmio que dê acesso antecipado.
- **DV2 · Aprovação.** O prêmio é gerado pelo sistema (sem autor humano, como um lançamento com `initiated_by` nulo no billing), então **qualquer AM/OP aprova**, inclusive quem criou a meta. O CAS `PENDING → APPROVED` fica para concorrência, com auditoria.
- **DV3 · Partida do acesso antecipado.** Padrão **desligado** (`enabled: false`); um AM liga depois do onboarding. Ligado, a janela só vale para um grupo se **existir pelo menos um inspetor elegível para aquele grupo que se qualifica** (nível ≥ X, região e tipo de serviço do grupo, fora da denylist). **Nunca** vale para grupos de hoje ou D+1 (Sydney).
- **DV4 · Ranking anônimo.** Empates na mesma pontuação ordenados por um hash estável por período (data do snapshot + inspetor), nunca por nome ou ordem de inserção. **Coorte mínima de 5** ranqueados: abaixo disso o app mostra só a posição e a pontuação do próprio inspetor.
- **DV5 · 03.A4 por E2E obrigatório** (Playwright do web).
- **DV6 · `LATE_NOTICE` sem atrasos.** Só nas metas `LATE_NOTICE`: com o mínimo de 10 serviços atendido e **zero** atrasos no período (a taxa de aviso antecipado fica indefinida), a meta conta como **atingida**, com valor 100%. Nas demais métricas de taxa, `rate = null` continua não atingida; o mínimo de 10 serviços vale para todas.

**Premissas desta quebra (2026-10-28, assumidas; confirmar nos Achados):**

- **P1 · Comparador fixo por métrica.** `CANT_DO_MAX` usa `LTE`; as outras, `GTE`. O campo existe (plano), mas o servidor rejeita combinação diferente.
- **P2 · Escopo por métrica.** `REGION_VOLUME` exige `scope_region_id`; `SERVICE_TYPE_VOLUME` exige `scope_service_type_id`; as demais não aceitam esses escopos. `scope_inspector_id` é opcional em qualquer métrica.
- **P3 · Participantes.** Inspetores `ACTIVE` e não apagados **no fechamento**. `REGION_VOLUME`: só os vinculados à região (`inspector_regions`). `SERVICE_TYPE_VOLUME`: só os que atendem o tipo (`service_types_json`). `scope_inspector_id`: só ele. A lista é gravada no fechamento (`participant_ids`).
- **P4 · Região de um serviço.** O imóvel está dentro do polígono (`ST_Intersects(sr.geom, p.coordinates)`, padrão do marketplace), qualquer que seja o status da região. Imóvel sem coordenadas não conta.
- **P5 · Períodos.** Os de `getCanonicalPeriod` (`billing-period.service.ts:70`), em datas civis de Sydney: semanas segunda–domingo; quinzenas em blocos de 14 dias a partir de 2024-01-01 (segunda), então 2026-11-02 é início de quinzena (1036 dias = 74 × 14) e 2026-11-09 não é; meses civis. `starts_at` precisa ser o 1º dia de um período (`isCycleAligned`, `:88`) e não pode ser anterior ao período corrente; `ends_at` é opcional e, quando informado, é o último dia de um período.
- **P6 · `INDEX_AT_LEAST` no período da meta.** Score recalculado sobre o período com `computeAll` + `computeReliabilityScore` (pesos e `minimumVolume` atuais), não lido do snapshot de 30 dias.
- **P7 · Taxa sem denominador** (`rate = null`) = meta **não** atingida, **exceto** `LATE_NOTICE` (DV6).
- **P8 · Comparação em %.** `valor = roundHalfUp(rate × 100, 2)` (`CANT_DO_MAX`: `(1 − rate) × 100`), comparado ao `target`.
- **P9 · Desempate (só ordenação).** Sem limite de ganhadores, o desempate só ordena listas AM/OP (painel, exportação): valor (melhor primeiro) → `index_score_at_close` desc (nulos por último) → `achieved_on` asc → `inspector_id`. `achieved_on` = data do serviço que bateu o alvo nas metas de volume; nas demais, o último dia do período.
- **P10 · "Prometido".** Por meta: `reward_amount × participantes`; total = soma. "Atingido" = soma dos prêmios não anulados.
- **P11 · Sequência derivada do período das metas.** O ciclo da sequência de um inspetor é o **menor** ciclo (semana < quinzena < mês) entre os fechamentos dos quais ele foi participante. Anda-se para trás pelos períodos fechados desse ciclo **em que ele participou** de pelo menos uma meta desse ciclo: com prêmio não anulado conta; sem prêmio para; período em que não participou de nenhuma meta é pulado. Fechamentos `SKIPPED_INACTIVE` (DL2) não têm participantes e não entram.

**Das lacunas (2026-10-29, dev aceitou todas as recomendações):**

- **DL1 · Mensagens às 08:00 e agregadas (L-F08-01).** O job das 04:45 só **calcula** (fecha períodos, cria prêmios). O envio das 3 mensagens roda às **08:00 Sydney** na **mesma fila** `inspector-program.daily`, com `{ trigger: 'MESSAGES' }`. Como no pg-boss 9 (`apps/backend/package.json`: `pg-boss ^9.0.3`) um segundo `boss.schedule` com o mesmo nome substitui o primeiro, o run das 04:45 enfileira o run de mensagens com `startAfter` = 08:00 Sydney do dia e `singletonKey 'inspector-program.messages:<today>'` (`PgBossJobQueue.enqueue` já repassa `startAfter` e `singletonKey`, `apps/backend/src/shared/infrastructure/pgboss-job-queue.ts`). Prêmios do mesmo inspetor fechados no mesmo dia viram **uma** mensagem ("You reached {n} goals"), `dedupeKey` `program-goals-reached:<inspectorId>:<periodEnd>`.
- **DL2 · Reativação, fim e alteração de meta (L-F08-02).** (a) `deactivated_at` gravado ao desativar; na reativação, todo período ainda não fechado cujo início é ≤ hoje é registrado como `GoalPeriodClosure` `trigger 'SKIPPED_INACTIVE'` (0 participantes, sem prêmio): a meta volta a contar no **próximo** período. (b) `endsAt` precisa ser ≥ fim do período corrente (`GOAL_END_IN_CURRENT_PERIOD`); para encerrar já, desativar. (c) `target` e `rewardAmount` editados numa meta já iniciada valem a partir do **próximo** período (`next_target`, `next_reward_amount`, `next_effective_from`); o fechamento usa os termos vigentes no período. Copy: "Changes to target and bonus apply from the next period."
- **DL3 · Anular prêmio já faturado só AM (L-F08-03, revista por Q12 em 2026-10-30).** Antes de a linha do bônus estar numa fatura `CLOSED`/`PAID`, AM/OP anulam (`PENDING`/`APPROVED → VOID`; o lançamento vira `VOIDED` na mesma transação, TASK-F08-6). Depois (prêmio `APPROVED` faturado ou `PAID`), só **AM**, com motivo obrigatório: o prêmio vira `VOID` e um lançamento de **reversão** (valor negativo) cai na próxima fatura; `paid_at` é mantido. Sem `recoveryNote` (a recuperação é a própria reversão). O usuário não volta um prêmio para `APPROVED`; só o estorno do pagamento da fatura faz `PAID → APPROVED` (TASK-F08-6). Detecção automática de dado tardio fica no estacionamento.
- **DL4 · Metas independentes e cumulativas (L-F08-04).** Um serviço conta em todas as metas cujo escopo ele satisfaz; não há teto de bônus por inspetor nem orçamento por período nesta fase. O formulário avisa quando já existem metas ativas do mesmo ciclo que podem incluir os mesmos inspetores. "Teto por inspetor/período" fica no estacionamento.
- **DL5 · Motivo de anulação é interno (L-F08-05).** `void_reason` é só AM/OP e relatório. O diálogo ganha `inspectorNote` opcional (≤ 200), que é o único texto mostrado no app. Sem mensagem automática de pago/anulado (estacionamento).
- **DL6 · Guarda de 7 dias na mensagem de nível (L-F08-06).** D3 continua (nível e acesso antecipado sem histerese). Só a **mensagem** de mudança de nível não é publicada se o inspetor recebeu outra `program-level:<inspectorId>:*` nos últimos 7 dias.
- **DL7 · Coorte do ranking = plataforma inteira (L-F08-07).** Todos os inspetores ACTIVE com `SCORED`, independente de região, tipo de serviço ou metas. Nunca recortar por região (03.A3).
- **DL8 · Acesso antecipado só para publicações depois de ligar (L-F08-08).** `earlyAccess.enabledAt` é gravado pelo backend quando `enabled` passa de `false` para `true`; a janela só vale para grupos com `published_at ≥ enabledAt`. Aumentar H retroage (aceito e documentado). O 403 diz dia e hora.
- **DL9 · Challenges é um `ProfileTile` (L-F08-09).** Tile logo depois de Earnings na grade do `ProfilePage`; nenhum grupo ou título novo no hub.
- **DL10 · Rota de períodos (L-F08-10).** `direction: 'upcoming' | 'past'`; `upcoming` começa no corrente (`IN_PROGRESS`); `past` começa no último fechado e volta, sem o corrente.
- **DL11 · ~~`paidOn` em Sydney~~ (L-F08-11) — RETIRADA por Q12 (2026-10-30).** Não há data de pagamento manual: `reward_awards.paid_at` copia o `paid_at` da fatura do inspetor (TASK-F08-6), que já tem as suas regras (`mark-invoice-paid.use-case.ts`, "não no futuro, não antes da emissão").
- **DL12 · Metas futuras visíveis (L-F08-12).** Active ganha "Starting soon" (metas ativas que começam nos próximos 7 dias, inclusive a meta reativada que volta no próximo período); a meta criada no meio do período mostra "Counts jobs since {periodStart}". Sem mensagem de "meta nova" (D10 tem só 3 gatilhos).
- **DL13 · Fotografia do escopo (L-F08-13).** `scope_label` em `RewardAward` e `GoalPeriodClosure`; `describeGoal` aceita `scopeLabel` nulo ("in a deleted region").
- **DL14 · Bônus na fatura, na copy do inspetor (L-F08-14, revista por Q12 em 2026-10-30).** O app diz que o bônus aprovado é somado à **próxima fatura** e aparece em Earnings: rodapé "Bonuses are reviewed by the Properfy team. Once approved, they're added to your next invoice and show in Earnings."; chips de My results "Pending review" / "Approved – on your next invoice" / "Paid" / "Voided".

**Da reconciliação entre tarefas (2026-10-29; ajustes pedidos por F02, F07, X00 e X01):**

- **DR1 · Data do serviço = P2 da F07 (L-F07-08).** Toda menção à data de um serviço numa meta é a P2 da F07: `finished_at` para executados, `scheduled_date` para DONE sem execução própria, `created_at` do evento para `CANT_ATTEND`, sempre no fuso da agência. Nunca "só `finished_at`".
- **DR2 · Snapshot do índice no fechamento (L-F07-02, L-F07-08).** O fechamento das 04:45 **não assume** que o snapshot de hoje existe: usa o que `getCurrentIndexes` devolve (última `snapshot_date` ≤ hoje) e grava essa data em `index_snapshot_date` no `GoalPeriodClosure` e em cada `RewardAward`. Com `snapshotDate < hoje`, o fechamento **segue** (o índice só ordena o desempate P9 e dá `level_at_close`; esperar o `reliability.ensure-today` atrasaria prêmios sem ganho) e loga `warn` `inspector_program.index_snapshot_stale { snapshotDate, today }`. Sem nenhum snapshot: `index_score_at_close`/`level_at_close`/`index_snapshot_date` nulos. Fechamento já gravado não é refeito quando o snapshot de hoje chega. **Sem `getUncached`:** nem a F03 nem a F07 o entregam; o job lê as chaves com `IPlatformSettingsReader.get` (cache de 30 s, aceitável num job diário).
- **DR3 · Override escalado e pro-rata (L-F07-09, L-F07-05).** As metas de volume (`VOLUME`, `REGION_VOLUME`, `SERVICE_TYPE_VOLUME`) comparam a **contagem** `completedCount` com o alvo: sem referência de volume e sem pro-rata. `INDEX_AT_LEAST` (P6) usa o batch do `computeAll` do período, cuja `volumeReference` já vem escalada pelo período (`override × periodDays / 30`, arredondado a 0,5, piso 1; `batch.volumeReference.periodDays`) e cuja `VOLUME.rate` já tem pro-rata por `activeDays`. A F08 **não** recalcula referência nem pro-rata.
- **DR4 · Histórico e fechamento definitivo (L-F07-12, L-F07-07).** A F08 não lê histórico de snapshots: o nível usa `getCurrentIndexes`; a mensagem de nível lê só `latest` e `latest − 1`; a sequência e o histórico de prêmios vêm de `goal_period_closures`/`reward_awards`. Nunca depende de snapshot com mais de 400 dias nem de inspetor apagado (expurgados pela F07). O fechamento é **definitivo**: uma rejeição `NOT_EXECUTED` posterior (inclusive a tardia, que a F07 conta no período da rejeição) afeta só o índice, nunca um período já fechado nem um prêmio já criado.
- **DR5 · Fuso de cada campo de data (N13, L-X00-03).** Datas civis e janelas de serviço no fuso da **agência**; entidades e jobs de plataforma em `PLATFORM_TIMEZONE` (`Australia/Sydney`); instantes em UTC; `users.timezone` nunca entra em cálculo. Tabela por campo:

  | Campo | Tipo | Fuso |
  |---|---|---|
  | data do serviço (contagem, `achieved_on`, `completedServiceDates`) | civil | agência (P2 da F07, DR1) |
  | `starts_at`, `ends_at`, `next_effective_from`, `period_start`, `period_end`, `minEndsAt`, `resumesOn`, `startsOn`, `countsSince`, "hoje" do job e da rota de períodos | civil | `PLATFORM_TIMEZONE` (programa de plataforma, P5) |
  | `index_snapshot_date` | civil | `PLATFORM_TIMEZONE` (data do snapshot da F07) |
  | cron 04:45, run de mensagens 08:00, `messagesRunAt` | horário de job | `PLATFORM_TIMEZONE` |
  | `published_at`, `cutoffUtc`, `earlyAccess.enabledAt`, `opensAt`, `approved_at`, `paid_at` (do prêmio = `paid_at` da fatura, Q12), `voided_at`, `deactivated_at`, `closed_at`, `created_at`, `effective_at` do lançamento `INSPECTOR_BONUS` | instante | UTC; exibidos em `PLATFORM_TIMEZONE` ("On since", 403 de acesso antecipado, push) |
  | "hoje/D+1" do acesso antecipado (`protectedFrom`) | civil | `PLATFORM_TIMEZONE` (DV3) |
  | relatório `INSPECTOR_PROGRAM` | instantes | fuso do solicitante (só exibição, padrão do fluxo de relatórios); datas civis como gravadas |
  | período de faturamento que recebe o bônus; `serviceDate` da linha de bônus no snapshot | civil | `PLATFORM_TIMEZONE` (`periodEffectiveRange` do billing, TASK-F08-6) |

- **DR6 · Menu e voltar (L-X01-02, L-X01-03, L-X01-08).** "Goals & rewards" é o **último** filho do grupo Dashboard na ordem canônica do X01 (… Workload · Inspector performance · Goals & rewards). Testes de menu por **rótulo** (nunca índice nem contagem), em `Sidebar.roles.test.tsx` com `MemoryRouter` e **sem** mocks de `SidebarSubmenu`/`SidebarItem`. Sub telas: o `backTo` (`/goals-rewards?tab=goals`) tem `AuthGuard [AM, OP]`, que cobre todos os papéis da sub tela; o teste P-b roda com o papel mais restrito que a acessa (**OP**); a confirmação de saída usa o override `onBack(goBack)` do `PageHeader`, com a mesma constante de fallback da página.
- **DR7 · Avisos da F02 (L-F02-06, L-F02-07, L-F02-08).** `/profile/challenges` entra em `INSPECTOR_NOTICE_TARGET_PATTERNS` como padrão **estático exato** (sem barra final, sem sufixo). Os `PERFORMANCE_MESSAGE` são de sistema e são **arquivados automaticamente após 30 dias** pela F02: nada da F08 depende deles depois disso (o histórico do inspetor vem de `reward_awards`; a guarda de 7 dias da DL6 fica dentro da janela). Título e corpo aparecem na tela bloqueada: só título da meta, valores, datas e nível; nunca nome de agência, endereço, inquilino, código de chave ou id.

---

## TASK-F08-1 · Backend + shared: metas, prêmios, fechamento de período, níveis, sequência, escopo no `computeMetric` e ações de prêmio

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F07-1, TASK-F07-2, TASK-F03-1
> - **Desbloqueia:** TASK-F08-2, TASK-F08-3, TASK-F08-4, TASK-F08-5, TASK-F08-6
> - **Pode rodar em paralelo com:** TASK-F05-1, TASK-F06-2, TASK-F04-4, TASK-F07-3, TASK-F04-3b, TASK-F05-2
> - **Pista sugerida (time de 6):** A + A2 · Backend crítico **em par** · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Criar no shared os enums, rótulos, schemas Zod, a chave **`inspectorProgram`** no `PLATFORM_SETTINGS_REGISTRY` (limites de nível e acesso antecipado) e as funções puras `resolveInspectorLevel` e `isEarlyAccessLevel`.
- Criar o módulo backend `apps/backend/src/modules/inspector-program/` com:
  - modelos `InspectorGoal`, `RewardAward`, `GoalPeriodClosure` (sem `tenant_id`);
  - CRUD AM/OP de metas, auditado (03.A5), e uma rota de períodos canônicos para os seletores do web;
  - **um** job diário `inspector-program.daily` (04:45 Sydney) que fecha cada período terminado, apura os participantes com o `computeAll` da F07 e cria prêmios idempotentes (03.9, 03.A4) e, no fim, enfileira na mesma fila o run de mensagens das 08:00 (`trigger 'MESSAGES'`, DL1); a TASK-F08-4 acrescenta os passos de mensagem a esse run;
  - reativação que registra os períodos inativos como pulados, `endsAt` ≥ período corrente e alteração de alvo/bônus a partir do próximo período (DL2);
  - derivação de nível e sequência (sem tabela) e o progresso parcial sob demanda (consumido pela TASK-F08-4);
  - resumo prometido × atingido e as ações aprovar (CAS) e anular `PENDING`/`APPROVED` (backend do 03.13). **Sem pagamento manual** (Q12 decidida em 2026-10-30, D1): nenhuma rota leva o prêmio a `PAID`; `PAID` e a anulação depois de faturado (DL3) chegam na TASK-F08-6.
- Estender `computeMetric`/`computeAll` da F07 com escopo opcional `{ regionId?, serviceTypeId? }` e com `completedServiceDates`, **sem mudar o comportamento da F07**.
- Proteger a exclusão de região: regiões são apagadas de verdade, então a exclusão é bloqueada quando há meta ativa que a usa.

### Contexto no código
- **Períodos:** `getCanonicalPeriod(cycle, ymd)` (`apps/backend/src/modules/billing/domain/billing-period.service.ts:70`), `isCycleAligned(cycle, start, end)` (`:88`), `computeClosedPeriods(cycle, now, count)` (`:122`), `periodDateColumns` — funções puras com `PLATFORM_TIMEZONE`. Reusadas **sem alteração e sem cópia**; o web pede períodos ao backend (rota `GET /v1/inspector-program/periods`). `BillingPeriodType` (`WEEKLY | FORTNIGHTLY | MONTHLY`) existe como enum Prisma (`schema.prisma:1041`) e no shared (`packages/shared/src/enums/financial.ts:35`); a F08 reusa os dois.
- **CAS de aprovação:** `approve-financial-entry.use-case.ts:40-120` (claim `tryAcquire` antes da escrita; `approvePendingEntry` com `updateMany WHERE status='PENDING'` em `prisma-financial-entry.repository.ts:331-356`; releitura quando o CAS afeta 0 linhas). O ramo `initiated_by_user_id IS NULL` desse CAS é o precedente de DV2: um lançamento do sistema é aprovável por qualquer AM/OP (`AuthorizationService.assertNotSelfApproval` não bloqueia originador nulo, `authorization.service.ts:92-97`). Os prêmios da F08 não têm autor, então não há checagem de autoaprovação. `IIdempotencyService.tryAcquire/complete/release` (`apps/backend/src/shared/domain/idempotency.service.ts:20-41`).
- **Regiões:** `ServiceRegion.geom Unsupported("GEOMETRY(Polygon, 4326)")` com GIST em SQL (`schema.prisma:1473-1507`), `InspectorRegion` (`:1510`), `Property.coordinates Unsupported("GEOMETRY(Point, 4326)")` (`:403,417`). Junção espacial: `prisma-service-group.repository.ts:964-999`.
- **Exclusão de região:** `DeleteServiceRegionUseCase` (`apps/backend/src/modules/service-region/application/use-cases/delete-service-region.use-case.ts`) checa região ativa (`ServiceRegionStillActiveError`) e grupos publicados (`countPublishedGroupsByRegionId` → `ServiceRegionHasPublishedGroupsError`, `ConflictError` em `domain/service-region.errors.ts:27`) e chama `PrismaServiceRegionRepository.delete` (`infrastructure/prisma-service-region.repository.ts:345-361`), que apaga os vínculos e a região numa transação (**hard delete**). Uma violação de FK (P2003) não é mapeada e viraria 500.
- **Inspetor:** `inspectors.status`, `deleted_at`, `service_types_json` (`ServiceTypeEntry[]` com `serviceTypeId`), `blocked_clients_json` (`string[]` de tenant ids), `name`, `email` (`schema.prisma:467-500`; `inspector.entity.ts:19-21`).
- **Workers:** `apps/backend/src/main/workers.ts` (`withJobMetrics`, `SYDNEY_TZ`, `boss.schedule`/`boss.work`). Madrugada ocupada: 02:00, 03:00, 03:30, 03:45 (F04), **04:15 `reliability.compute-snapshots` (F07)**. `PgBossJobQueue.enqueue` com `singletonKey` descarta o envio quando já há job ativo com a mesma chave (`pgboss-job-queue.ts:18-25`) — aqui isso é o comportamento desejado (catch-up do startup não roda junto do agendado).
- **Audit:** `AuditService.log()` (`apps/backend/src/shared/domain/audit.ts`). **RBAC:** `ROLE_ACTION_MATRIX` (`packages/shared/src/permissions/role-matrix.ts:25`), `AuthorizationService.assertRoles`.
- **Respostas:** o response schema remove campos não declarados (memória `project_response_schema_strips_undeclared_fields`); validação antes do auth (memória `project_fastify_validation_before_auth`).
- **F07 (existente):** `ReliabilityMetricsService` (`apps/backend/src/modules/reliability/application/reliability-metrics.service.ts`): `computeMetric(metric, inspectorId, from, to)`, `computeAll(from, to, inspectorIds?)` → **`ReliabilityComputationBatch { volumeReference, byInspector: Map<inspectorId, InspectorReliabilityComputation> }`**, `computeAllWith(tx, …)`; com `inspectorIds`, a mediana de volume vem de `loadCompletedCounts(from, to)` (1 consulta a mais). `PrismaReliabilityFactsReader.load({ from, to, inspectorIds? })` com Q1–Q6; `computeReliabilityScore`; `roundHalfUp`; `ReliabilityIndexReader.getCurrentIndexes(inspectorIds?)`; `IReliabilitySnapshotRepository` (`findLatestSnapshotDate`, `findByDate`); snapshot com `settings_json { weights, minimumVolume, toleranceMinutes, volumeReference: { value, source, activeInspectors } }`; chave `reliabilityIndex` (`minimumVolume` 10, `volumeReferenceOverride` nulo).
- **F03 (existente):** `PLATFORM_SETTINGS_REGISTRY`, `IPlatformSettingsReader.get(key)` (cache 30 s; não existe `getUncached`, DR2), `GET/PUT /v1/platform-settings/:key` (audit `platform_setting.updated`).

### Decisões aplicáveis
D1 (Q12 ✅ decidida em 2026-10-30: bônus no financeiro pela TASK-F08-6; aqui só o fluxo do prêmio, sem tocar o billing), D3, D4, D5, D6, D8, D12 (2026-10-27); DV1, DV2, DV6 (2026-10-28); P1–P11 (2026-10-28).

Das lacunas (2026-10-29):
- **DL1 (L-F08-01, 2026-10-29):** o run das 04:45 termina enfileirando `inspector-program.daily` `{ trigger: 'MESSAGES' }` com `startAfter` 08:00 Sydney e `singletonKey 'inspector-program.messages:<today>'`. Nunca um segundo `boss.schedule` com o mesmo nome (pg-boss 9 guarda um agendamento por nome; o segundo substituiria o das 04:45). Com `trigger 'MESSAGES'`, `RunInspectorProgramDailyUseCase` roda **só** os passos de mensagem (registrados pela TASK-F08-4); com `SCHEDULED`/`STARTUP`, só os de cálculo.
- **DL2 (L-F08-02, 2026-10-29):** `deactivated_at`; reativação registra `SKIPPED_INACTIVE`; `endsAt` ≥ fim do período corrente (`GOAL_END_IN_CURRENT_PERIOD`, substitui `GOAL_END_BEFORE_CLOSED_PERIOD`); `target`/`rewardAmount` de meta já iniciada valem do próximo período.
- **DL3 (L-F08-03, revista 2026-10-30):** nesta tarefa só `PENDING`/`APPROVED → VOID` (AM/OP); o CHECK já permite `paid_at` em `VOID` para a anulação depois de pago da TASK-F08-6 (só AM, com reversão). Sem `recovery_note`.
- **DL4 (L-F08-04, 2026-10-29):** metas independentes e cumulativas, sem teto; o backend não muda (o aviso do formulário é da TASK-F08-3).
- **DL5 (L-F08-05, 2026-10-29):** `void_reason` interno; `inspector_note` opcional (≤ 200) gravado na anulação.
- **DL10 (L-F08-10, 2026-10-29):** semântica de `direction` da rota de períodos.
- **DL13 (L-F08-13, 2026-10-29):** `scope_label` na fotografia do prêmio e do fechamento.

Da reconciliação (2026-10-29):
- **DR1 (L-F07-08, 2026-10-29):** data do serviço = P2 da F07 em contagem, `achieved_on` e `completedServiceDates`.
- **DR2 (L-F07-02/08, 2026-10-29):** fechamento com o último snapshot ≤ hoje, `index_snapshot_date` gravado, segue com `snapshotDate < hoje` (log `warn`); settings lidas com `get` (sem `getUncached`).
- **DR3 (L-F07-09/05, 2026-10-29):** metas de volume por contagem; `INDEX_AT_LEAST` usa a referência escalada e o pro-rata que o batch da F07 já traz.
- **DR4 (L-F07-12/07, 2026-10-29):** nenhuma leitura de histórico de snapshots; fechamento definitivo.
- **DR5 (N13, L-X00-03, 2026-10-29):** fuso de cada campo pela tabela de DR5.

### Testes primeiro (TDD)

Vitest; relógio injetado; suíte de domínio também com `TZ=America/Los_Angeles` (memória `feedback_tz_dependent_test_must_pin_away`). Builders em `apps/backend/src/modules/inspector-program/domain/__fixtures__/`: `buildGoal(overrides)` (padrão: `VOLUME`, `GTE`, target 10, `WEEKLY`, `rewardAmount 30`, `starts_at '2026-11-02'` (segunda; também início de quinzena), sem `ends_at`, ativa) e `buildComputation(overrides)` (formato `InspectorReliabilityComputation` + `completedServiceDates`). As métricas das metas de índice e de taxa usam **as fixtures da F07** (`apps/backend/src/modules/reliability/domain/__fixtures__/service-facts.ts`, exemplos trabalhados da TASK-F07-1: população Ana, Ben, Carla, Dan, Eva, Fábio; mediana de volume 9.5; scores Ana 88.3, Dan 89.0, Eva 100, Fábio 97.5, Carla `INSUFFICIENT_VOLUME`).

**1. Shared — `packages/shared/src/enums/inspector-program.test.ts`**
- `GoalMetric` = exatamente `['VOLUME','REGION_VOLUME','SERVICE_TYPE_VOLUME','INDEX_AT_LEAST','PUNCTUALITY','GEOFENCE','NO_STUCK','SATISFACTION','LATE_NOTICE','CANT_DO_MAX']`.
- `GOAL_METRIC_COMPARATOR`: `CANT_DO_MAX → 'LTE'`, as outras 9 → `'GTE'`.
- `GOAL_METRIC_RELIABILITY_KEY`: `PUNCTUALITY`, `GEOFENCE`, `NO_STUCK`, `SATISFACTION`, `LATE_NOTICE` iguais; `CANT_DO_MAX → CANT_ATTEND`; volumes e `INDEX_AT_LEAST` → `null`.
- `GOAL_METRIC_KIND`: 3 volumes → `'VOLUME'`; `INDEX_AT_LEAST` → `'INDEX'`; 6 de taxa → `'RATE'`.
- `GOAL_METRIC_LABELS`, `REWARD_AWARD_STATUS_LABELS`, `INSPECTOR_LEVEL_LABELS` cobrem todas as chaves.
- `GOAL_RATE_MINIMUM_VOLUME === 10`.

**2. Shared — `packages/shared/src/lib/inspector-level.test.ts`** (`resolveInspectorLevel(score, { silverMinScore: 60, goldMinScore: 85 })`)

| score | Esperado |
|---|---|
| `null` | `null` |
| 0 / 59.9 | `BRONZE` |
| 60 / 84.9 | `SILVER` |
| 85 / 88.3 / 100 | `GOLD` |
| 72 com `{ 70, 90 }` | `SILVER` |

- `isEarlyAccessLevel(level, minLevel)`: `GOLD ≥ SILVER` true; `BRONZE ≥ SILVER` false; `SILVER ≥ SILVER` true; `null` false.
- `minScoreForLevel(level, levels)`: `BRONZE → 0`, `SILVER → 60`, `GOLD → 85` (usado no SQL da TASK-F08-2).

**3. Shared — `platform-settings.test.ts` (acréscimo)**

| Caso | Esperado |
|---|---|
| `PLATFORM_SETTINGS_REGISTRY.inspectorProgram.defaults` | `{ levels: { silverMinScore: 60, goldMinScore: 85 }, earlyAccess: { enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null } }` |
| `earlyAccess.enabledAt` `'2026-11-10T09:00:00.000Z'` / `null` / `'ontem'` (L-F08-08) | ok / ok / erro (ISO 8601 com `Z`) |
| silver = gold (85/85) | erro "Gold must be above Silver" em `levels.goldMinScore` |
| silver 0 / gold 101 / 60.55 | erro (0 < silver < gold ≤ 100, 1 casa) |
| `hours` 0 / 73 / 1.5 | erro (inteiro 1–72) |
| `resolvePlatformSettingValue('inspectorProgram', null)` | defaults |

**4. Shared — `inspector-program.test.ts`** (`createGoalSchema`, `updateGoalSchema`)

| Caso | Esperado |
|---|---|
| válido mínimo (`VOLUME`, 60, `WEEKLY`, 60.00, `startsAt '2026-11-02'`) | ok; `comparator` ausente vira `GTE` |
| `title` vazio / 121 caracteres | erro em `title` |
| `CANT_DO_MAX` com `GTE` | erro em `comparator` ("This metric uses 'at most'") |
| `REGION_VOLUME` sem `scopeRegionId` | erro ("Choose a region") |
| `SERVICE_TYPE_VOLUME` sem `scopeServiceTypeId` | erro ("Choose a service type") |
| `PUNCTUALITY` com `scopeRegionId` | erro ("Region applies only to region volume goals") |
| volume com target 0 / 2.5 / 10001 | erro (inteiro 1–10000) |
| taxa com target 0 / 101 / 50.555 | erro (0 < target ≤ 100, 2 casas) |
| `INDEX_AT_LEAST` com 100.5 | erro (0 < target ≤ 100, 1 casa) |
| `rewardAmount` ausente / 0 / 100000 / 30.005 | erro (0 < amount ≤ 99999.99, 2 casas) |
| `endsAt` antes de `startsAt` | erro em `endsAt` |
| `updateGoalSchema` com `metric`, `period`, `scope*` ou `startsAt` | erro "This field can't be changed. Create a new goal instead." (`.strict()`) |
| `updateGoalSchema` vazio | erro "Nothing to update" |
| `voidAwardSchema` `{ reason: 'Agency rejected the job' }` (L-F08-05) | ok; `inspectorNote` ausente |
| `voidAwardSchema` com `inspectorNote` de 201 caracteres / com `recoveryNote` | erro em `inspectorNote` (≤ 200) / erro (`.strict()`, campo não existe — Q12) |
| `programPeriodsQuerySchema` `{ periodType: 'FORTNIGHTLY', from: 'current', count: 3 }` (L-F08-10) | erro (`direction` obrigatório; `from` não existe, `.strict()`) |

(O alinhamento de `startsAt`/`endsAt` ao período é validado no use case, com `isCycleAligned`, para não copiar o cálculo para o shared — teste 13.)

**5. Domínio — `goal-periods.test.ts`**
- `goalPeriodsToClose(goal, today, closedStarts)`:
  - semanal `starts_at 2026-11-02`, hoje `2026-11-09` (segunda), sem fechamentos → `[{ '2026-11-02', '2026-11-08' }]`;
  - hoje `2026-11-08` (domingo, último dia) → `[]`;
  - hoje `2026-11-23`, fechado `['2026-11-02']` → `['2026-11-09', '2026-11-16']` (catch-up);
  - `ends_at 2026-11-15`, hoje `2026-12-01` → só até `2026-11-09`;
  - **quinzenal** `starts_at 2026-11-02` (alinhado: 1036 dias desde 2024-01-01 = 74 × 14), hoje `2026-11-16` → `[{ '2026-11-02', '2026-11-15' }]`; hoje `2026-11-30` → mais `[{ '2026-11-16', '2026-11-29' }]`;
  - mensal `starts_at 2026-11-01`, hoje `2026-12-01` → `[{ '2026-11-01', '2026-11-30' }]`;
  - nunca mais que `CLOSE_CATCH_UP_MAX_PERIODS = 8` (os mais antigos primeiro), com log `warn`.
- `currentGoalPeriod(goal, today)` → período corrente; `null` antes de `starts_at` ou depois de `ends_at`.
- **(L-F08-02)** `periodsToSkipOnReactivation(goal, today, closedStarts)`: semanal `starts_at 2026-11-02`, fechado `['2026-11-02']`, desativada em `2026-11-05`, reativada hoje `2026-12-20` (domingo) → `['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14']` (o corrente `2026-12-14` entra: a meta volta no próximo período, `2026-12-21`); sem fechamentos, desativada em `2026-11-04` e reativada hoje `2026-11-05` (dia seguinte) → `['2026-11-02']` (o corrente fica pulado; conta de novo a partir de `2026-11-09`); com `ends_at 2026-11-29` → só até `2026-11-23`; sem nenhum período iniciado (`starts_at` futuro) → `[]`. Sem teto de 8 (não há apuração).
- `goalPeriodsToClose` não devolve períodos com fechamento `SKIPPED_INACTIVE` (estão em `closedStarts`).
- **(L-F08-02)** `goalTermsForPeriod(goal, periodStart)`: `target 10`, `reward 30`, `next_target 12`, `next_reward_amount 40`, `next_effective_from '2026-11-16'` → para `2026-11-09` `{ target: 10, rewardAmount: 30 }`; para `2026-11-16` `{ 12, 40 }`; sem `next_*` → valores atuais.
- **(L-F08-02)** `minEndsAt(goal, today)`: semanal, hoje `2026-11-11` → `'2026-11-15'` (fim do corrente); meta que ainda não começou (`starts_at '2026-11-16'`) → `'2026-11-22'` (fim do primeiro período).

**6. Domínio — `evaluate-goal.test.ts`** (`evaluateGoal(goal, computation | undefined, ctx)`; `ctx = { reliabilityIndex: defaults, periodEnd: '2026-11-30' }`; período `[2026-11-01, 2026-11-30]` mensal, a população e as métricas são as fixtures da F07)

| Caso | Entrada | Esperado |
|---|---|---|
| volume atingido | `VOLUME` target 10, Ana (`completedCount 12`) | `{ achieved: true, value: 12, achievedOn: <10ª data de Ana> }` |
| volume não atingido | target 10, Dan (`completedCount 8`) | `{ achieved: false, value: 8, achievedOn: null }` |
| sem serviços | `computation undefined` | `{ achieved: false, value: 0, serviceCount: 0 }` |
| região | `REGION_VOLUME` target 9, Eva com escopo (computação escopada `completedCount 10`) | atingida, `achievedOn` = 9ª data |
| taxa com volume 9 | `PUNCTUALITY` target 90, Carla (9 serviços, tudo pontual) | `{ achieved: false, value: 100, reason: 'NOT_ENOUGH_SERVICES' }` |
| taxa abaixo | `PUNCTUALITY` target 90, Ana (0.8333) | `{ achieved: false, value: 83.33 }` |
| taxa atingida | `GEOFENCE` target 90, Ana (0.9167) | `{ achieved: true, value: 91.67, achievedOn: '2026-11-30' }` |
| fronteira | `CANT_DO_MAX` target 20, Dan (`CANT_ATTEND` 0.8 → 20.00) | atingida (20 ≤ 20) |
| CANT_DO_MAX abaixo | target 10, Dan (20.00) | não atingida |
| arredondamento (P8) | rate sintético 0.89995 → 90.00, target 90 | atingida |
| taxa nula (P7) | `SATISFACTION` target 50, Eva (sem pesquisa) | `{ achieved: false, value: null, reason: 'NO_DATA' }` |
| `LATE_NOTICE` sem atrasos (DV6) | target 80, Eva (10 serviços, nenhum atraso, `rate null`) | `{ achieved: true, value: 100, achievedOn: '2026-11-30' }` |
| `LATE_NOTICE` sem atrasos, volume 9 | target 80, Carla (9 serviços, nenhum atraso) | `{ achieved: false, reason: 'NOT_ENOUGH_SERVICES' }` (o mínimo vem antes) |
| `LATE_NOTICE` com atrasos | target 80, Ana (2 atrasos, 1 avisado → 0.5) | `{ achieved: false, value: 50 }` |
| outra taxa nula não ganha a exceção | `SATISFACTION` target 50, Dan (10 serviços, sem pesquisa) | `{ achieved: false, reason: 'NO_DATA' }` |
| índice | `INDEX_AT_LEAST` 90, Ana (88.3) | `{ achieved: false, value: 88.3 }` |
| índice atingido | `INDEX_AT_LEAST` 95, Eva (100) | `{ achieved: true, value: 100 }` |
| índice atingido 2 | `INDEX_AT_LEAST` 95, Fábio (97.5) | atingida |
| índice com volume insuficiente | Carla | `{ achieved: false, value: null, reason: 'NOT_ENOUGH_SERVICES' }` |
| **(DR3)** volume não usa referência nem pro-rata | `VOLUME` target 4, semana `[2026-11-02, 2026-11-08]`, `volumeReferenceOverride 20` (batch `volumeReference { value: 4.5, source: 'OVERRIDE', periodDays: 7 }`), Ana com 4 DONE | `{ achieved: true, value: 4 }` (contagem; `VOLUME.rate 0.8889` da F07 não entra) |
| **(DR3)** inspetor cadastrado no meio do período | `VOLUME` target 4, inspetor com `inspectorCreatedOn '2026-11-05'` e 4 DONE na semana | atingida (a contagem não é proporcional; `activeDays` só afeta a `rate` do índice) |
| **(DR3)** índice semanal com override | `INDEX_AT_LEAST`, mesma semana e mesmo batch | `value` = `computeReliabilityScore(c.metrics, ctx.reliabilityIndex, c.volume)` com a `VOLUME.rate` que veio no batch (referência 4.5); `evaluateGoal` não lê `volumeReferenceOverride` (o fake do batch prova: trocar o override no `ctx` não muda o valor) |

**7. Domínio — `streak.test.ts`** (`computeStreak({ today, participations })`, `participations = [{ goalPeriodType, periodStart, awarded: boolean }]` só dos fechamentos em que o inspetor foi participante — P11)
- só fechamentos semanais, 3 últimas semanas com prêmio → `{ cycle: 'WEEKLY', count: 3 }`;
- última semana em que participou sem prêmio → `0`;
- semana mais recente **sem participação** (não era participante de nenhuma meta semanal, ou o job ainda não fechou) → pulada; as anteriores contam;
- buraco (participou, não atingiu) no meio → para no buraco;
- semanal e mensal ao mesmo tempo → ciclo `WEEKLY` (o menor); prêmios mensais não contam;
- só mensal → `{ cycle: 'MONTHLY' }`;
- sem nenhuma participação → `{ cycle: null, count: 0 }`;
- lookback máximo 104 períodos.
- `isStreakAtRisk({ streak, today, currentPeriodEnd, participatesInCycleGoal, achievedSoFar })`: `streak ≥ 1`, hoje = último dia, participa de meta do ciclo, nada atingido → `true`; qualquer condição falsa → `false`.

**8. Domínio — `participants.test.ts`** (`resolveParticipants(goal, inspectors, regionLinks)`)
- `VOLUME` sem escopo → todos `ACTIVE` sem `deleted_at`; `INACTIVE` fora.
- `REGION_VOLUME` → só vinculados à região, ativos.
- `SERVICE_TYPE_VOLUME` → só quem tem o tipo em `service_types_json`.
- `scope_inspector_id` → só ele (se ativo); com `REGION_VOLUME` e ele fora da região → `[]`.

**9. Domínio — `ordering.test.ts`** (`compareAwardsForRanking`, P9) — valor maior primeiro em `GTE`, menor em `CANT_DO_MAX`; empate → `indexScoreAtClose` desc, nulo por último; → `achievedOn` asc; → `inspectorId` asc.

**10. Domínio — `promised-summary.test.ts`** (`summarizePeriod`, P10) — metas 30 × 10 participantes e 60 × 4 → `promised 540`; prêmios 30 + 30 + 60 e um `VOID` de 30 → `achieved 120`; `approved`, `paid`, `pending`, `voided` separados; período aberto → participantes atuais vindos do chamador, `achieved 0`, `status 'IN_PROGRESS'`.

**11. Aplicação — `close-goal-periods.use-case.test.ts`** (fakes de repositório, métricas, índice e settings)
- meta semanal fechada, 3 participantes, 2 atingem → 2 prêmios `PENDING` com `amount 30`, `index_score_at_close`/`level_at_close` do `getCurrentIndexes`; 1 fechamento com `participant_ids` (3), `participants_count 3`, `achievers_count 2`, `promised_amount 90`; audit `reward_award.created` (SYSTEM) por prêmio e `goal_period.closed` por fechamento.
- o resultado do inspetor vem de **`batch.byInspector.get(id)`**; inspetor ausente do `Map` = sem serviço.
- rodar de novo no mesmo dia → nada novo (o período já tem fechamento).
- fechamento já existente no momento do insert (`createMany` com `skipDuplicates` devolve `count 0`) → nenhum prêmio é gravado para aquele período e nada é auditado.
- `computeAll` recebe `(periodStart, periodEnd, participantIds, scope)`: `{ regionId }` em `REGION_VOLUME`, `{ serviceTypeId }` em `SERVICE_TYPE_VOLUME`, `undefined` nos demais; metas com o mesmo `(período, escopo)` compartilham **uma** chamada.
- meta desativada → não fecha nada; 0 participantes → fechamento com `participants_count 0`, sem prêmios.
- **(L-F08-02)** meta com `target 10`/`reward 30` e `next_target 12`/`next_reward_amount 40`/`next_effective_from '2026-11-16'`: fechar `2026-11-09` usa 10/30 (Ana com 11 serviços atinge, prêmio `amount 30`, fotografia `target 10`); na mesma transação, como `2026-11-16` é o próximo período e não há período pendente anterior a ele, os `next_*` são promovidos (`target 12`, `reward_amount 40`, `next_*` nulos) com audit `inspector_goal.terms_applied` (SYSTEM, before/after).
- **(L-F08-13)** fechamento de `REGION_VOLUME` da região "Sydney North" → `scope_label 'Sydney North'` no fechamento e em cada prêmio; `SERVICE_TYPE_VOLUME` → nome do tipo; `scope_inspector_id` → nome do inspetor; sem escopo → `null`.
- **(L-F08-01)** run `trigger 'SCHEDULED'` às `2026-11-09T04:45` Sydney → executa só os passos de cálculo e, no fim, `jobQueue.enqueue('inspector-program.daily', { trigger: 'MESSAGES' }, { startAfter: 2026-11-09T08:00 Sydney (= 2026-11-08T21:00:00.000Z, AEDT), singletonKey: 'inspector-program.messages:2026-11-09' })`; run `STARTUP` às 09:30 → enfileira com `startAfter` = agora (já passou das 08:00) e a mesma `singletonKey`; run `MESSAGES` → não executa `closeGoalPeriods` e não enfileira nada.
- **(DR2)** relógio `2026-11-09T04:45` Sydney, `getCurrentIndexes` com `snapshotDate '2026-11-08'` (job da F07 de hoje falhou) → o período `2026-11-02…08` fecha normalmente; fechamento e prêmios com `index_snapshot_date '2026-11-08'` e `index_score_at_close` desse snapshot; log `warn` `inspector_program.index_snapshot_stale { snapshotDate: '2026-11-08', today: '2026-11-09' }`; com `snapshotDate '2026-11-09'` → `index_snapshot_date '2026-11-09'` e sem `warn`; sem nenhum snapshot (`snapshotDate null`) → prêmios com `index_score_at_close`, `level_at_close` e `index_snapshot_date` nulos; o snapshot de hoje chegando às 05:00 não muda nada já fechado.
- **(DR2)** as chaves `inspectorProgram` e `reliabilityIndex` são lidas com `IPlatformSettingsReader.get` (o fake não tem `getUncached`).
- **(DR4)** um DONE contado no período fechado e depois rejeitado com `NOT_EXECUTED` → rodar o job de novo não altera fechamento nem prêmio (nada é recalculado).
- `INSPECTOR_PROGRAM_JOBS_ENABLED=false` → o worker não agenda.

**12. Aplicação — `reward-award-actions.use-case.test.ts`**

| Caso | Esperado |
|---|---|
| OP aprova `PENDING` | `APPROVED`, `approved_by`, `approved_at`; audit `reward_award.approved` com before/after |
| quem criou a meta aprova o prêmio dela | aprovado (DV2: prêmio do sistema, sem autor) |
| dois aprovadores ao mesmo tempo | o CAS deixa um vencer; o outro recebe 409 `REWARD_AWARD_INVALID_STATUS` depois da releitura |
| aprovar `APPROVED`/`PAID`/`VOID` | 409 `REWARD_AWARD_INVALID_STATUS` "This reward is already {status}" |
| anular `PENDING`/`APPROVED` com motivo | `VOID`, `voided_by`, `voided_at`, `void_reason`; audit `reward_award.voided` |
| anular `PAID` (linha criada à mão no teste; nesta tarefa nenhuma rota chega a `PAID`) | 409 `REWARD_AWARD_INVALID_STATUS` (a anulação depois de pago é da TASK-F08-6) |
| rotas `POST /awards/:id/mark-paid` | não existem (404 da rota; Q12) |
| **(L-F08-05)** anular com `inspectorNote 'The job was cancelled by the agency.'` | `inspector_note` gravado; aparece no audit `after` |
| anular `VOID` | 409 `REWARD_AWARD_INVALID_STATUS` "This reward is already voided" |
| motivo ausente / 4 caracteres | 400 `VALIDATION_ERROR` |
| mesma `Idempotency-Key` + mesmo payload | resposta guardada, nenhuma escrita |
| mesma chave + payload diferente | 409 `IDEMPOTENCY_PAYLOAD_MISMATCH` |
| sem `Idempotency-Key` | 400 `IDEMPOTENCY_KEY_REQUIRED` |
| CL_ADMIN / CL_USER / INSP / TNT | 403 `FORBIDDEN` antes de qualquer leitura |

**13. Aplicação — `goal-crud.use-case.test.ts`**
- criar → `created_by_user_id = actor`; audit `inspector_goal.created` com `after` completo.
- editar `target` e `rewardAmount` → audit `inspector_goal.updated` com before/after só dos campos alterados; `updated_by_user_id = actor`.
- `active: false` → `inspector_goal.deactivated`, `deactivated_at = now`; `true` → `inspector_goal.reactivated`, `deactivated_at = null`; PATCH sem mudança real → 200 sem audit.
- **(L-F08-02) reativação:** meta semanal desativada em `2026-11-05`, reativada hoje `2026-12-20` → na mesma transação, 6 `GoalPeriodClosure` `trigger 'SKIPPED_INACTIVE'` (`participant_ids []`, contagens 0, `promised_amount 0`, `scope_label` atual) via `createMany skipDuplicates`; audit `inspector_goal.reactivated` com `{ skippedPeriods: 6, resumesOn: '2026-12-21' }`; nenhum prêmio; rodar o job depois → nada fecha para esses períodos. Resposta `currentPeriod null`, `resumesOn '2026-12-21'`.
- **(L-F08-02) termos:** meta iniciada (corrente `2026-11-09…15`, hoje `2026-11-11`), PATCH `{ target: 12, rewardAmount: 40 }` → `target`/`reward_amount` inalterados; `next_target 12`, `next_reward_amount 40`, `next_effective_from '2026-11-16'`; audit `inspector_goal.updated` com `after.pendingChange`; resposta `pendingChange: { target: 12, rewardAmount: 40, effectiveFrom: '2026-11-16' }`. Segundo PATCH no mesmo período `{ target: 15 }` → `next_target 15`, `next_reward_amount 40` (mantido). PATCH que volta aos valores atuais → `next_*` nulos. Meta que ainda não começou (`currentPeriod null`, `starts_at` futuro) → aplica direto em `target`/`reward_amount`.
- `startsAt` quarta-feira em `WEEKLY`, ou `2026-11-09` em `FORTNIGHTLY` → 422 `GOAL_START_NOT_ALIGNED` "Start on the first day of a period"; `endsAt` fora do fim de período → 422 `GOAL_END_NOT_ALIGNED`.
- `startsAt` antes do período corrente → 422 `GOAL_START_IN_PAST`.
- **(L-F08-02)** `endsAt` antes do fim do período corrente (hoje `2026-11-11`, semanal, `endsAt '2026-11-08'`) → 422 `GOAL_END_IN_CURRENT_PERIOD` "A goal can only end after the current period. To stop it now, deactivate it."; `endsAt '2026-11-15'` → ok.
- escopo inexistente → 422 `GOAL_SCOPE_REGION_NOT_FOUND` / `GOAL_SCOPE_SERVICE_TYPE_NOT_FOUND` / `GOAL_SCOPE_INSPECTOR_NOT_FOUND`.
- reativar meta `REGION_VOLUME` cuja região foi apagada (`scope_region_id` nulo) → 422 `GOAL_SCOPE_REGION_DELETED` "This goal's region was deleted. Create a new goal."
- CL_*, INSP, TNT → 403.
- **(L-F08-10)** hoje `2026-11-20`: `GET /periods?periodType=FORTNIGHTLY&direction=upcoming&count=3` → `[{ '2026-11-16', '2026-11-29', 'IN_PROGRESS' }, { '2026-11-30', '2026-12-13', 'UPCOMING' }, { '2026-12-14', '2026-12-27', 'UPCOMING' }]` a partir de `getCanonicalPeriod`; `direction=past&count=2` → `[{ '2026-11-02', '2026-11-15', 'CLOSED' }, { '2026-10-19', '2026-11-01', 'CLOSED' }]` via `computeClosedPeriods` (sem o corrente); `from=current` → 400.

**14. Exclusão de região — `apps/backend/tests/unit/service-region/delete-service-region.use-case.test.ts` (acréscimo)**
- região inativa, sem grupos publicados, referenciada por 2 metas **ativas** → 409 `SERVICE_REGION_HAS_ACTIVE_GOALS` "This region is used by 2 active goals. Deactivate them first."; `delete` não é chamado; nada é auditado.
- referenciada só por metas **inativas** → apaga; as metas ficam com `scope_region_id` nulo (`onDelete: SetNull`, teste 16).
- a checagem roda depois das checagens atuais (ativa → `ServiceRegionStillActiveError` continua com prioridade).
- teste de rota existente da exclusão ganha o caso 409 com o envelope `{ error: { code, message } }`.

**15. Extensão da F07 — `reliability-metrics.service.test.ts` (acréscimo)**
- **regressão:** sem `scope`, todos os casos existentes da F07 continuam com os mesmos números (Ana 88.3, Dan 89.0, Eva 100, Fábio 97.5, mediana 9.5); o leitor recebe `scope` `undefined`.
- `computeAll(from, to, ids, { serviceTypeId })` → o leitor recebe o escopo; `byInspector` só tem serviços do tipo; `volumeReference` continua vindo de `loadCompletedCounts` **sem escopo** (a mediana do índice não muda por causa de uma meta).
- `completedServiceDates` = datas de serviço dos concluídos (P2 da F07: `finished_at` do executado, `scheduled_date` do DONE sem execução, no fuso da agência; DR1), crescente, com repetição, `length === completedCount`.
- **(DR3)** com escopo e `volumeReferenceOverride 20` em `computeAll('2026-11-02', '2026-11-08', ids, { regionId })` → `batch.volumeReference` igual ao da chamada sem escopo (`{ value: 4.5, source: 'OVERRIDE', periodDays: 7 }`); `VOLUME.rate` com pro-rata da F07 inalterado pela extensão.
- `computeMetric(metric, id, from, to, scope)` repassa o escopo.

**16. Banco — `reliability-facts.reader.db.test.ts` (acréscimo, Testcontainers + PostGIS)**
- seed: região R, imóveis dentro e fora de R e sem coordenadas; 2 tipos; DONE com execução, DONE sem execução, DONE → REJECTED e `CANT_ATTEND` em cada combinação.
- `{ regionId: R }` → só imóveis dentro de R em Q1, nos dois ramos de Q2 e em Q3; sem coordenadas fora; `geom NULL` → nenhum serviço.
- `{ serviceTypeId }` → só o tipo; os dois → interseção.
- **contagem de consultas** = a mesma da F07 para a mesma chamada (6 sem `inspectorIds`; 7 com `inspectorIds`, contando `loadCompletedCounts`).
- **regressão:** sem escopo, resultado deep-equal ao do seed original da F07.

**17. Banco — `inspector-program.repository.db.test.ts`**
- unique `(goal_id, inspector_id, period_start)` em `reward_awards` e `(goal_id, period_start)` em `goal_period_closures`; `createMany({ skipDuplicates: true })` ignora a duplicata e devolve `count 0`.
- CHECKs: `REGION_VOLUME` **ativa** sem região → violação; inativa sem região → ok; `ends_at < starts_at` → violação; `APPROVED` sem `approved_by` → violação; **(L-F08-03)** `VOID` com `paid_at` e `approved_by` → ok (anulado depois de pago, TASK-F08-6); `PAID` sem `paid_at` → violação; `PENDING`/`APPROVED` com `paid_at` → violação; **(L-F08-02)** `next_target` sem `next_effective_from` → violação; `active true` com `deactivated_at` → violação.
- apagar uma região referenciada por meta inativa → `scope_region_id` vira `NULL`.
- CAS `approvePending(id, approverId, at)`: `PENDING` → 1 linha; já `APPROVED` → 0.
- `findParticipations(inspectorId)` usa `participant_ids` e marca `awarded` só com prêmio não `VOID`.
- **(DR2)** `index_snapshot_date` nulo aceito em fechamento e prêmio; gravado e relido como `YYYY-MM-DD`.

**18. Rotas — `inspector-program.routes.test.ts`** (Supertest) — cada rota com AM/OP (2xx), CL_ADMIN, CL_USER, INSP, TNT (403), sem token (401); response schemas completos; `GET /goals/:id` inexistente → 404 `GOAL_NOT_FOUND`.

**19. Worker** — `inspector-program.daily` agendado `45 4 * * *` com `SYDNEY_TZ`, em `withJobMetrics`; no startup enfileira `{ trigger: 'STARTUP' }` com `singletonKey 'inspector-program.daily'` quando há período que já deveria estar fechado. **(L-F08-01)** existe **um** `boss.schedule` para a fila (nenhum `0 8 * * *`); o handler repassa `job.data.trigger` ao use case (`'MESSAGES'` vindo do enfileiramento com `startAfter`).

**20. Domínio — `messages-run-at.test.ts` (L-F08-01)** — `messagesRunAt(2026-11-08T17:45:00Z)` (= 9 nov 04:45 AEDT) → `2026-11-08T21:00:00.000Z` (9 nov 08:00 AEDT); `messagesRunAt(2026-07-05T18:45:00Z)` (= 6 jul 04:45 AEST) → `2026-07-05T22:00:00.000Z`; `messagesRunAt(2026-11-08T22:30:00Z)` (09:30 Sydney) → o próprio `now`. Também com `TZ=America/Los_Angeles`.

**21. Aplicação — `standing-progress.test.ts` (L-F08-12, L-F08-02)** — hoje `2026-11-11` (quarta):
- meta semanal ativa com `starts_at '2026-11-16'` → `{ state: 'UPCOMING', period: { start: '2026-11-16', end: '2026-11-22' }, value: null, serviceCount: 0, daysLeft: 5 }`; nenhuma chamada a `computeAll` para ela;
- meta mensal com `starts_at '2026-12-01'` → fora (20 dias > 7);
- meta reativada hoje com o corrente pulado → `UPCOMING` com `period.start '2026-11-16'`;
- meta criada em `2026-11-11` com corrente `2026-11-09…15` → `countsSince '2026-11-09'`; criada em `2026-11-09` → `countsSince null`;
- meta com `pendingChange` → progresso usa os termos atuais (`target 10`, `rewardAmount 30`).

### Escopo / Passos
1. **Shared — enums** `packages/shared/src/enums/inspector-program.ts`: `GoalMetric`, `GoalComparator` (`GTE`, `LTE`), `RewardAwardStatus` (`PENDING`, `APPROVED`, `PAID`, `VOID`), `InspectorLevel` (`BRONZE`, `SILVER`, `GOLD`), `GOAL_METRIC_COMPARATOR`, `GOAL_METRIC_RELIABILITY_KEY`, `GOAL_METRIC_KIND`, rótulos, `GOAL_RATE_MINIMUM_VOLUME = 10`, `CLOSE_CATCH_UP_MAX_PERIODS = 8`. Padrão `as const` + tipo. Exportar em `enums/index.ts`. Período = `BillingPeriodType` existente.
2. **Shared — níveis:** `packages/shared/src/lib/inspector-level.ts` (`resolveInspectorLevel`, `isEarlyAccessLevel`, `minScoreForLevel`).
3. **Shared — settings:** `inspectorProgramSettingSchema` + `inspectorProgram: { schema, defaults, section: 'inspectorProgram' }` no `PLATFORM_SETTINGS_REGISTRY` (com `earlyAccess.enabledAt`, L-F08-08; o preenchimento pelo servidor é da TASK-F08-2).
4. **Shared — schemas** `packages/shared/src/schemas/inspector-program.ts`: `createGoalSchema`, `updateGoalSchema`, `listGoalsQuerySchema`, `goalResponseSchema`, `goalsListResponseSchema`, `programPeriodsQuerySchema`, `programPeriodsResponseSchema`, `listAwardsQuerySchema`, `rewardAwardResponseSchema`, `rewardAwardsListResponseSchema`, `voidAwardSchema` (`.strict()`), `programPeriodSummaryQuerySchema`, `programPeriodSummaryResponseSchema`. `pnpm --filter @properfy/shared build`.
5. **Shared — permissões** em `ROLE_ACTION_MATRIX`: `inspector_program.goals.manage`, `inspector_program.awards.view`, `inspector_program.awards.approve`, `inspector_program.awards.void` (todas `AM`, `OP`) e `inspector_program.view_own` (`INSP`). Sem `awards.pay` (Q12); a ação só AM de anular faturado (`inspector_program.awards.void_invoiced`) é da TASK-F08-6.
6. **Extensão da F07 (dono: F08):**
   - `IReliabilityFactsReader.load({ from, to, inspectorIds?, scope? })` com `ReliabilityFactsScope = { regionId?: string; serviceTypeId?: string }` exportado de `domain/reliability-facts.reader.ts`;
   - `PrismaReliabilityFactsReader`: parâmetros novos só em Q1, Q2 (os dois ramos) e Q3 (Algoritmo A). Q4–Q6 e `loadCompletedCounts` não mudam;
   - `computeMetric(metric, inspectorId, from, to, scope?)` e `computeAll(from, to, inspectorIds?, scope?)`; `computeAllWith` não muda;
   - `InspectorReliabilityComputation.completedServiceDates: CivilDate[]` (aditivo). Antes, `grep` em todos os mocks de `computeAll`/`InspectorReliabilityComputation` (memória `feedback_usecase_output_shape_change_grep_all_mocks`).
7. **Prisma + migration** `apps/backend/prisma/migrations/YYYYMMDDhhmmss_inspector_program/migration.sql` (placeholder, regenerado na implementação; depois das migrations da F07). Modelos e SQL extra em Modelo de dados. Conferir o diff do `prisma migrate dev` contra os índices `Unsupported()` existentes (memória `project_prisma_drift_drops_unsupported_indexes`) e aplicar localmente (memória `feedback_migration_apply_locally`).
8. **Backend — módulo `apps/backend/src/modules/inspector-program/`:**
   - `domain/`: `goal.entity.ts`, `reward-award.entity.ts` (transições), `goal-periods.ts`, `evaluate-goal.ts`, `participants.ts`, `streak.ts`, `ordering.ts`, `promised-summary.ts`, `inspector-program.errors.ts`, portas `goal.repository.ts`, `reward-award.repository.ts`, `goal-period-closure.repository.ts`;
   - `domain/goal-periods.ts` ganha `periodsToSkipOnReactivation`, `goalTermsForPeriod` e `minEndsAt` (L-F08-02);
   - `application/use-cases/`: `create-goal`, `update-goal` (reativação com `SKIPPED_INACTIVE`, termos pendentes, `GOAL_END_IN_CURRENT_PERIOD` — L-F08-02), `list-goals`, `get-goal`, `list-program-periods`, `run-inspector-program-daily` (orquestra os passos do job por `trigger`: `SCHEDULED`/`STARTUP` → passos de cálculo + enfileiramento do run `MESSAGES` das 08:00; `MESSAGES` → só passos de mensagem, que a TASK-F08-4 registra — L-F08-01), `close-goal-periods` (usa `goalTermsForPeriod`, promove `next_*`, grava `scope_label` — L-F08-02/13), `list-reward-awards`, `get-program-period-summary`, `approve-reward-award` (CAS; deixa um ponto de extensão na transação para a TASK-F08-6 criar o lançamento — porta `IRewardAwardApprovalHook`, padrão no-op), `void-reward-award` (só `PENDING`/`APPROVED`; CAS `updateMany WHERE status IN ('PENDING','APPROVED')`; `inspectorNote` — L-F08-05; mesmo ponto de extensão para a TASK-F08-6); serviço `inspector-program-standing.service.ts`;
   - `infrastructure/`: repositórios Prisma e `workers/inspector-program-daily.worker.ts`;
   - `interfaces/inspector-program.routes.ts`.
9. **Guarda na exclusão de região:** `IGoalRepository.countActiveByScopeRegionId(regionId)` exposto por uma porta pequena `IRegionGoalUsageChecker` no domínio de `service-region` (dependência aponta para a porta; o inspector-program implementa — mesmo padrão do `IAppointmentChecker` de tenants). `DeleteServiceRegionUseCase` chama a porta depois das checagens atuais e lança `ServiceRegionHasActiveGoalsError` (`ConflictError('SERVICE_REGION_HAS_ACTIVE_GOALS', …)`) em `service-region.errors.ts`. Parâmetro opcional no fim do construtor (memória `project_adding_usecase_dep_breaks_untyped_test_wirings`).
10. **Container:** `container.inspectorProgram = { …useCases, standingService, regionGoalUsageChecker }`, com `container.reliability.metricsService`, `indexReader`, o snapshot repository, `IPlatformSettingsReader`, `AuditService`, `IIdempotencyService`, `AuthorizationService`. Registrar as rotas.
11. **Worker:** `boss.schedule('inspector-program.daily', '45 4 * * *', {}, SYDNEY_TZ)` + `boss.work(...)` com `withJobMetrics`, atrás de `INSPECTOR_PROGRAM_JOBS_ENABLED` (padrão `true`); enfileiramento de startup com `singletonKey`. Incluir a fila no log final. **(L-F08-01)** O run de mensagens das 08:00 é um `IJobQueue.enqueue` da mesma fila com `startAfter` (calculado com `PLATFORM_TIMEZONE`, função pura testável `messagesRunAt(now)` = 08:00 Sydney de hoje ou `now` se já passou) e `singletonKey 'inspector-program.messages:<today>'`; **não** criar um segundo `boss.schedule` com o mesmo nome (pg-boss 9 sobrescreve) nem fila nova.
12. **OpenAPI:** `generate:openapi` + `generate:types` (memória `reference_generate_openapi_env`), commitados (memória `feedback_generated_apitypes_merge`).
13. **Doc (X00):** `apps/backend/CLAUDE.md` — módulo `inspector-program` (exceção de tenant D12, job único 04:45 depois do 04:15 da F07 com run de mensagens às 08:00 na mesma fila via `startAfter`, "prêmio é do sistema: qualquer AM/OP aprova", "reativar pula os períodos inativos; alvo/bônus valem do próximo período", "Q12: bônus no ledger e na fatura pela TASK-F08-6; aqui não há pagamento manual", escopo do leitor de fatos da F07, guarda de exclusão de região, "o fechamento não espera o snapshot de hoje e grava `index_snapshot_date`", fuso de cada campo de data conforme N13 (tabela DR5)); `packages/shared/CLAUDE.md` — `enums/inspector-program.ts`, `lib/inspector-level.ts`, chave `inspectorProgram`.

### Modelo de dados

**Escopo de tenant (exceção explícita ao §7.1 do CLAUDE.md, D12).** `inspector_goals`, `reward_awards` e `goal_period_closures` **não têm `tenant_id`**: metas e prêmios são do programa de plataforma e o inspetor é cross-tenant. Isolamento: (1) role check AM/OP (admin) ou INSP + `requireLinkedInspector` (próprios dados) antes de qualquer leitura; (2) nenhuma rota de agência lê estas tabelas; (3) nenhuma linha guarda nome de agência, endereço ou coordenada.

```prisma
enum GoalMetric {
  VOLUME
  REGION_VOLUME
  SERVICE_TYPE_VOLUME
  INDEX_AT_LEAST
  PUNCTUALITY
  GEOFENCE
  NO_STUCK
  SATISFACTION
  LATE_NOTICE
  CANT_DO_MAX
}

enum GoalComparator {
  GTE
  LTE
}

enum RewardAwardStatus {
  PENDING
  APPROVED
  PAID
  VOID
}

model InspectorGoal {
  id                    String            @id @default(uuid())
  title                 String            @db.VarChar(120)
  metric                GoalMetric
  comparator            GoalComparator    // fixo por métrica (P1)
  target                Decimal           @db.Decimal(8, 2) // volume: inteiro; taxa: %; índice: pontos
  period                BillingPeriodType
  scope_region_id       String?           // SetNull se a região for apagada (só metas inativas chegam lá)
  scope_service_type_id String?
  scope_inspector_id    String?
  reward_amount         Decimal           @db.Decimal(10, 2) // AUD, bônus em dinheiro (DV1)
  starts_at             DateTime          @db.Date // 1º dia de um período (P5)
  ends_at               DateTime?         @db.Date // último dia de um período; null = sem fim
  active                Boolean           @default(true)
  deactivated_at        DateTime?         // L-F08-02: instante da desativação; null quando ativa
  next_target           Decimal?          @db.Decimal(8, 2)  // L-F08-02: termos pendentes,
  next_reward_amount    Decimal?          @db.Decimal(10, 2) // valem a partir de next_effective_from
  next_effective_from   DateTime?         @db.Date           // 1º dia do próximo período
  created_by_user_id    String
  updated_by_user_id    String?
  created_at            DateTime          @default(now())
  updated_at            DateTime          @updatedAt

  scope_region       ServiceRegion?      @relation(fields: [scope_region_id], references: [id], onDelete: SetNull)
  scope_service_type ServiceType?        @relation(fields: [scope_service_type_id], references: [id], onDelete: Restrict)
  scope_inspector    Inspector?          @relation("InspectorGoalScope", fields: [scope_inspector_id], references: [id], onDelete: Restrict)
  created_by         User                @relation("InspectorGoalCreatedBy", fields: [created_by_user_id], references: [id])
  updated_by         User?               @relation("InspectorGoalUpdatedBy", fields: [updated_by_user_id], references: [id])
  awards             RewardAward[]
  closures           GoalPeriodClosure[]

  @@index([active, period])
  @@index([scope_region_id])
  @@index([scope_inspector_id])
  @@map("inspector_goals")
}

model RewardAward {
  id                   String            @id @default(uuid())
  goal_id              String
  inspector_id         String
  period_type          BillingPeriodType
  period_start         DateTime          @db.Date
  period_end           DateTime          @db.Date
  // Fotografia da meta no fechamento
  goal_title           String            @db.VarChar(120)
  metric               GoalMetric
  comparator           GoalComparator
  target               Decimal           @db.Decimal(8, 2)
  amount               Decimal           @db.Decimal(10, 2)
  scope_label          String?           @db.VarChar(200) // L-F08-13: nome da região/tipo/inspetor no fechamento
  // Resultado
  achieved_value       Decimal           @db.Decimal(8, 2)
  service_count        Int
  achieved_on          DateTime          @db.Date
  index_score_at_close Decimal?          @db.Decimal(4, 1)
  level_at_close       String?           @db.VarChar(10)
  index_snapshot_date  DateTime?         @db.Date // DR2: snapshot da F07 usado (pode ser < period_end + 1)
  // Fluxo (prêmio do sistema: sem autor humano, DV2)
  status               RewardAwardStatus @default(PENDING)
  approved_by_user_id  String?
  approved_at          DateTime?
  paid_at              DateTime?         // Q12: preenchido pela TASK-F08-6 com o paid_at da fatura; nulo até lá
  voided_by_user_id    String?
  voided_at            DateTime?
  void_reason          String?           @db.VarChar(500) // interno (AM/OP, relatório), L-F08-05
  inspector_note       String?           @db.VarChar(200) // L-F08-05: único texto da anulação mostrado no app
  created_at           DateTime          @default(now())
  updated_at           DateTime          @updatedAt

  goal        InspectorGoal @relation(fields: [goal_id], references: [id], onDelete: Restrict)
  inspector   Inspector     @relation(fields: [inspector_id], references: [id], onDelete: Restrict)
  approved_by User?         @relation("RewardAwardApprovedBy", fields: [approved_by_user_id], references: [id])
  voided_by   User?         @relation("RewardAwardVoidedBy", fields: [voided_by_user_id], references: [id])

  @@unique([goal_id, inspector_id, period_start])
  @@index([status, period_end])
  @@index([inspector_id, period_end])
  @@index([period_type, period_start])
  @@map("reward_awards")
}

model GoalPeriodClosure {
  id                 String            @id @default(uuid())
  goal_id            String
  period_type        BillingPeriodType
  period_start       DateTime          @db.Date
  period_end         DateTime          @db.Date
  participant_ids    String[]          // P3/P11
  participants_count Int
  achievers_count    Int
  promised_amount    Decimal           @db.Decimal(12, 2) // reward_amount × participantes (P10); 0 em SKIPPED_INACTIVE
  scope_label        String?           @db.VarChar(200)   // L-F08-13
  index_snapshot_date DateTime?        @db.Date           // DR2: snapshot da F07 lido no fechamento; null sem snapshot ou em SKIPPED_INACTIVE
  trigger            String            @db.VarChar(20)    // SCHEDULED | STARTUP | SKIPPED_INACTIVE (L-F08-02)
  closed_at          DateTime

  goal InspectorGoal @relation(fields: [goal_id], references: [id], onDelete: Restrict)

  @@unique([goal_id, period_start])
  @@index([period_type, period_start])
  @@map("goal_period_closures")
}
```
- Back-relations: `Inspector.reward_awards`, `Inspector.scoped_goals`, `ServiceRegion.inspector_goals`, `ServiceType.inspector_goals`, `User` (4 relações nomeadas; sem `paid_by` — quem paga é a fatura, Q12).
- **SQL extra na migration:**
  ```sql
  ALTER TABLE "inspector_goals"
    ADD CONSTRAINT "inspector_goals_scope_chk" CHECK (
      (("metric" = 'REGION_VOLUME') OR "scope_region_id" IS NULL)
      AND (("metric" <> 'REGION_VOLUME') OR "scope_region_id" IS NOT NULL OR NOT "active")
      AND (("metric" = 'SERVICE_TYPE_VOLUME') = ("scope_service_type_id" IS NOT NULL))),
    ADD CONSTRAINT "inspector_goals_comparator_chk" CHECK (("metric" = 'CANT_DO_MAX') = ("comparator" = 'LTE')),
    ADD CONSTRAINT "inspector_goals_dates_chk" CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at"),
    ADD CONSTRAINT "inspector_goals_values_chk" CHECK ("target" > 0 AND "reward_amount" > 0),
    -- L-F08-02
    ADD CONSTRAINT "inspector_goals_active_chk" CHECK ("active" = ("deactivated_at" IS NULL)),
    ADD CONSTRAINT "inspector_goals_next_terms_chk" CHECK (
      ("next_target" IS NOT NULL OR "next_reward_amount" IS NOT NULL) = ("next_effective_from" IS NOT NULL)
      AND ("next_target" IS NULL OR "next_target" > 0)
      AND ("next_reward_amount" IS NULL OR "next_reward_amount" > 0));
  ALTER TABLE "reward_awards"
    ADD CONSTRAINT "reward_awards_status_fields_chk" CHECK (
      ("status" IN ('APPROVED','PAID')) <= ("approved_by_user_id" IS NOT NULL)
      AND ("status" = 'PAID') <= ("paid_at" IS NOT NULL)              -- L-F08-03: PAID exige paid_at
      AND ("paid_at" IS NOT NULL) <= ("status" IN ('PAID','VOID'))    -- VOID pode guardar paid_at (anulado depois de pago)
      AND ("inspector_note" IS NOT NULL) <= ("status" = 'VOID')
      AND ("status" = 'VOID') = ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL));
  ```
  (`bool <= bool` = implicação.) Em `next_terms_chk`, `next_target` e `next_reward_amount` guardam o valor que vale a partir de `next_effective_from` (o que não mudou é copiado do atual no PATCH, então os dois ficam preenchidos juntos). Sem índice parcial e sem `Unsupported()` nesta migration, então não há risco novo de drift; o diff só precisa não tocar os índices existentes.
- **Datas:** civis como `@db.Date` (`periodDateColumns`); instantes `timestamp(3)` em UTC. Decimais → `number` no repositório. Fuso de cada campo: tabela de DR5 (N13); **exceção explícita ao fuso da agência:** períodos e `index_snapshot_date` são civis de `PLATFORM_TIMEZONE` porque o programa é de plataforma (D12).
- **Retenção:** sem expurgo (volume baixo).
- **Settings — chave `inspectorProgram`:**
  ```ts
  const levelScore = z.number().min(0.1).max(100).multipleOf(0.1);
  export const inspectorProgramSettingSchema = z.object({
    levels: z.object({ silverMinScore: levelScore, goldMinScore: levelScore })
      .refine((l) => l.goldMinScore > l.silverMinScore, { message: 'Gold must be above Silver', path: ['goldMinScore'] }),
    earlyAccess: z.object({
      enabled: z.boolean(),
      hours: z.number().int().min(1).max(72),
      minLevel: z.nativeEnum(InspectorLevel),
      enabledAt: z.string().datetime().nullable(), // L-F08-08: preenchido pelo servidor (TASK-F08-2); o valor enviado pelo cliente é ignorado
    }),
  });
  // defaults: { levels: { silverMinScore: 60, goldMinScore: 85 }, earlyAccess: { enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null } }
  ```
  12 h vem de `decisoes.md`; `enabled: false` é DV3; `minLevel 'GOLD'` é valor de onboarding a confirmar.

### Contratos

Todas as rotas: `preHandler: authenticate`; schemas do shared; envelope de erro `{ error: { code, message, details } }`. Datas civis `YYYY-MM-DD`; instantes ISO 8601; valores com 2 casas (AUD).

**Metas e períodos (AM/OP; `inspector_program.goals.manage`)**

| Método e rota | Request | Resposta | Erros |
|---|---|---|---|
| `GET /v1/inspector-program/goals` | `active?` (boolean de query, memória `project_boolean_query_param_coercion`; padrão `true`), `metric?`, `period?`, `page`, `pageSize ≤ 100`, `sortBy` (`createdAt`\|`title`\|`startsAt`), `sortOrder` | 200 paginado `{ data: GoalResponse[], page, pageSize, total }` | 400, 401, 403 |
| `POST /v1/inspector-program/goals` | `createGoalSchema` | 201 `GoalResponse` | 400; 422 `GOAL_START_NOT_ALIGNED`, `GOAL_END_NOT_ALIGNED`, `GOAL_START_IN_PAST`, `GOAL_SCOPE_*_NOT_FOUND` |
| `GET /v1/inspector-program/goals/:goalId` | params uuid | 200 `GoalResponse` | 404 `GOAL_NOT_FOUND` |
| `PATCH /v1/inspector-program/goals/:goalId` | `updateGoalSchema` (`title`, `target`, `rewardAmount`, `endsAt`, `active`) | 200 `GoalResponse` | 400; 404; 422 `GOAL_END_NOT_ALIGNED`, `GOAL_END_IN_CURRENT_PERIOD` (L-F08-02), `GOAL_SCOPE_REGION_DELETED` |
| `GET /v1/inspector-program/periods` | `periodType`, `direction` (`upcoming`\|`past`, obrigatório), `count` (1–26); `.strict()` | 200 `{ data: Array<{ start, end, status: 'CLOSED' \| 'IN_PROGRESS' \| 'UPCOMING' }> }` | 400 |

- **(L-F08-10) `direction`:** `upcoming` começa no período **corrente** (`IN_PROGRESS`) e segue para a frente (`UPCOMING`); `past` começa no último período **fechado** e volta no tempo (só `CLOSED`, sem o corrente). Quem precisa de "passados + corrente" (RewardsTab) faz `past&count=12` e `upcoming&count=1`.
- **(L-F08-02) PATCH:** `target`/`rewardAmount` numa meta com período corrente gravam `next_*` (valem do próximo período); em meta que ainda não começou, aplicam direto. `endsAt` < `minEndsAt` → `GOAL_END_IN_CURRENT_PERIOD` "A goal can only end after the current period. To stop it now, deactivate it." `active: true` grava os períodos pulados (`SKIPPED_INACTIVE`) na mesma transação.

```ts
// createGoalSchema
{ title: string (1–120, trim), metric: GoalMetric, comparator?: GoalComparator, target: number,
  period: BillingPeriodType, scopeRegionId?: uuid | null, scopeServiceTypeId?: uuid | null,
  scopeInspectorId?: uuid | null, rewardAmount: number, startsAt: CivilDate, endsAt?: CivilDate | null }
// GoalResponse
{ id, title, metric, comparator, target, period,
  scopeRegion: { id, name } | null, scopeRegionDeleted: boolean, scopeServiceType: { id, name } | null,
  scopeInspector: { id, name } | null, rewardAmount: number, startsAt, endsAt: string | null, active,
  deactivatedAt: string | null,                                                        // L-F08-02
  pendingChange: { target: number, rewardAmount: number, effectiveFrom: string } | null, // L-F08-02
  resumesOn: string | null,  // L-F08-02: 1º dia do próximo período quando o corrente foi pulado na reativação
  minEndsAt: string | null,  // L-F08-02: menor `endsAt` aceito (fim do período corrente ou do primeiro)
  currentPeriod: { start, end } | null, lastClosedPeriod: { start, end } | null,       // currentPeriod null se pulado
  createdBy: { id, name }, updatedBy: { id, name } | null, createdAt, updatedAt }
```
- Sem DELETE (prêmios referenciam a meta; desativar é o caminho). Criar meta não exige `Idempotency-Key`.

**Prêmios (AM/OP)**

| Método e rota | Action | Request | Resposta | Erros |
|---|---|---|---|---|
| `GET /v1/inspector-program/awards` | `awards.view` | `status?`, `periodType?`, `periodStart?`, `goalId?`, `inspectorId?`, `page`, `pageSize ≤ 100`; ordenação P9 quando `goalId` + `periodStart`, senão `period_end desc, created_at desc` | 200 paginado | 400, 401, 403 |
| `GET /v1/inspector-program/summary` | `awards.view` | `periodType`, `periodStart` (alinhado, senão 400) | 200 `ProgramPeriodSummaryResponse` | 400, 401, 403 |
| `POST /v1/inspector-program/awards/:awardId/approve` | `awards.approve` | header `Idempotency-Key`; sem corpo | 200 `RewardAwardResponse` | 400 `IDEMPOTENCY_KEY_REQUIRED`; 404 `REWARD_AWARD_NOT_FOUND`; 409 `REWARD_AWARD_INVALID_STATUS`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `IDEMPOTENCY_IN_PROGRESS` |
| `POST /v1/inspector-program/awards/:awardId/void` | `awards.void` | `Idempotency-Key`; `{ reason: string 5–500, inspectorNote?: string 1–200 }` (`.strict()`) | 200 | idem; 409 `REWARD_AWARD_INVALID_STATUS` em `PAID`/`VOID` (a anulação de faturado/pago, só AM, é da TASK-F08-6) |

- **Sem pagamento manual (Q12, 2026-10-30):** não há rota `mark-paid` nem `paidOn`/`paymentReference`; `PAID` só pela fatura (TASK-F08-6).
- **(L-F08-05) Textos:** `void_reason` ("Internal reason") nunca sai para o inspetor; `inspector_note` é o único texto da anulação no `GET /v1/inspector/program`.

```ts
// RewardAwardResponse
{ id, goal: { id, title }, inspector: { id, name, email }, periodType, periodStart, periodEnd,
  metric, comparator, target, amount, achievedValue, serviceCount, achievedOn,
  indexScoreAtClose: number | null, levelAtClose: InspectorLevel | null,
  indexSnapshotDate: string | null, // DR2: data do snapshot da F07 usado no fechamento
  status,
  approvedBy: { id, name } | null, approvedAt: string | null,
  paidAt: string | null, // Q12: paid_at da fatura (TASK-F08-6); null até lá
  voidedBy: { id, name } | null, voidedAt: string | null, voidReason: string | null,
  inspectorNote: string | null, // L-F08-05
  // a TASK-F08-6 acrescenta financialEntryId, invoice e voidedAfterInvoicing
  scopeLabel: string | null,                                                              // L-F08-13
  createdAt }
// ProgramPeriodSummaryResponse
{ periodType, periodStart, periodEnd, status: 'CLOSED' | 'IN_PROGRESS' | 'UPCOMING',
  totals: { promised, achieved, approved, paid, pending, voided }, // paid = 0 até a TASK-F08-6
  goals: Array<{ goalId, title, metric, rewardAmount, participants, promised, achievers, achievedAmount, closed,
                 skipped: boolean }> } // L-F08-02: true no fechamento SKIPPED_INACTIVE (promised 0)
```
- **Idempotência das ações:** `tryAcquire(key, 'reward-award', hash({ awardId, action, body, actor.userId }), 24 h)`, mesmo padrão do billing.
- **Resumo de período aberto:** metas ativas cujo `currentPeriod` é o pedido; participantes = `resolveParticipants` atual; `achieved 0`.

**RBAC**

| Papel | Metas / períodos | Prêmios (listar, resumo) | Aprovar / anular (`PENDING`/`APPROVED`) |
|---|---|---|---|
| AM | sim | sim | sim (qualquer prêmio, DV2); anular faturado/pago chega na TASK-F08-6 (só AM, DL3) |
| OP | sim | sim | sim |
| CL_ADMIN / CL_USER / INSP / TNT | 403 | 403 | 403 |

**Exclusão de região (rota existente `DELETE /v1/service-regions/:id`):** novo 409 `SERVICE_REGION_HAS_ACTIVE_GOALS`, `message` "This region is used by {n} active goals. Deactivate them first.", `details: { activeGoalCount }`. Declarar no schema da rota e regenerar `api-types`.

**Interno (exportado para as TASK-F08-2/4/5):**
```ts
// apps/backend/src/modules/inspector-program/application/inspector-program-standing.service.ts
export interface InspectorStanding {
  inspectorId: string;
  index: { score: number | null; status: ReliabilityScoreStatus | 'NOT_COMPUTED'; snapshotDate: CivilDate | null; position: number | null };
  level: InspectorLevel | null;
  streak: { cycle: BillingPeriodType | null; count: number; atRisk: boolean };
}
export class InspectorProgramStandingService {
  getStanding(inspectorId: string, now: Date): Promise<InspectorStanding>;
  getActiveGoalProgress(inspectorId: string, now: Date): Promise<GoalProgress[]>;
  getActiveGoalProgressForMany(inspectorIds: string[], now: Date): Promise<Map<string, GoalProgress[]>>;
  hasEarlyAccess(inspectorId: string, now: Date): Promise<{ hasAccess: boolean; reason: 'LEVEL' | 'DISABLED' | null }>;
}
export interface GoalProgress {
  goalId: string; title: string; metric: GoalMetric; comparator: GoalComparator; target: number;
  period: { type: BillingPeriodType; start: CivilDate; end: CivilDate }; daysLeft: number;
  rewardAmount: number; scopeLabel: string | null;   // termos do período corrente (goalTermsForPeriod)
  value: number | null; serviceCount: number;
  countsSince: CivilDate | null; // L-F08-12: periodStart quando a meta foi criada depois do início do período
  state: 'MET_SO_FAR' | 'IN_PROGRESS' | 'BELOW_TARGET' | 'NOT_ENOUGH_SERVICES' | 'NO_DATA' | 'UPCOMING';
  // L-F08-12: 'UPCOMING' = meta ativa (participante pela regra P3 atual) cujo período começa nos próximos 7 dias
  // (inclui a reativada com o corrente pulado); period = esse próximo período; value null; serviceCount 0; daysLeft = dias até o início
}
// run-inspector-program-daily.use-case.ts — passos por fase; a TASK-F08-4 registra os de mensagens (L-F08-01)
export type InspectorProgramDailyTrigger = 'SCHEDULED' | 'STARTUP' | 'MESSAGES';
export interface InspectorProgramDailyStep {
  name: string; phase: 'COMPUTE' | 'MESSAGES';
  run(ctx: { now: Date; today: CivilDate; trigger: InspectorProgramDailyTrigger; createdAwardIds: string[] }): Promise<void>;
}
export const UPCOMING_GOAL_LOOKAHEAD_DAYS = 7; // L-F08-12
```

### Algoritmos

**A. Escopo no leitor de fatos da F07.** Q1, Q2 (ramo DONE e ramo REJECTED) e Q3 ganham dois parâmetros, `$6` (tipo de serviço) e `$7` (região), sempre com cast explícito (memória `project_prisma_queryraw_int_params`). O alias `a` é o appointment nas três:
```sql
  AND ($6::text IS NULL OR a.service_type_id = $6::text)
  AND ($7::text IS NULL OR EXISTS (
        SELECT 1
        FROM properties p
        JOIN service_regions sr ON sr.id = $7::text AND sr.geom IS NOT NULL
        WHERE p.id = a.property_id
          AND p.coordinates IS NOT NULL
          AND ST_Intersects(sr.geom, p.coordinates)))
```
- Sem escopo, `$6` e `$7` são `NULL`, as duas condições ficam verdadeiras e o resultado é o da F07.
- **Número de consultas:** não muda. É o mesmo da F07 para a mesma chamada: 6 sem `inspectorIds` (Q4–Q6 só rodam quando Q1–Q3 devolvem linhas) e 7 com `inspectorIds` (mais `loadCompletedCounts`, que fica **sem escopo**: a mediana é do índice, não da meta).
- `completedServiceDates`: no `computeAllWith`, depois de montar os fatos, coletar a `service_date` dos fatos contados em `completedCount` (mesma regra da métrica `VOLUME` da F07), em ordem crescente.
- O status da região não filtra (P4); `geom NULL` → nenhum serviço.

**B. Fechamento — `CloseGoalPeriodsUseCase.execute({ trigger, now })`** (passo 1 do job diário, fase `COMPUTE`).
1. `today = civilDateInTimezone(now, PLATFORM_TIMEZONE)`.
2. `goals = goalRepo.findActive()`; para cada meta, `pending = goalPeriodsToClose(goal, today, closureRepo.findStarts(goal.id))` (no máximo 8, mais antigos primeiro; `findStarts` inclui os `SKIPPED_INACTIVE`). Os termos de cada período vêm de `goalTermsForPeriod(goal, periodStart)` (L-F08-02).
3. `settings = settingsReader.get('inspectorProgram')`, `reliabilityIndex = settingsReader.get('reliabilityIndex')`, uma vez (cache de 30 s; não existe `getUncached`, DR2).
4. Inspetores ativos (`id, status, deleted_at, service_types_json`) e vínculos das regiões das metas pendentes, uma vez.
5. Agrupar `(meta, período)` por `(periodStart, periodEnd, scopeKey)` (`region:<id>` \| `type:<id>` \| `none`). Para cada grupo: `participants = ∪ resolveParticipants(goal)`; `batch = metricsService.computeAll(periodStart, periodEnd, participantIds, scope)`.
6. `indexes = indexReader.getCurrentIndexes(allParticipantIds)`, uma vez. **(DR2)** Não assumir que às 04:45 o snapshot de hoje existe (o das 04:15 pode ter falhado; o `reliability.ensure-today` só tenta a partir das 05:00): `indexSnapshotDate` = `snapshotDate` devolvido (último ≤ hoje, ou `null`). `indexSnapshotDate < today` → log `warn` `inspector_program.index_snapshot_stale { snapshotDate, today }` e o fechamento **segue** com esse snapshot; `null` → índice e nível de fechamento nulos. `index_snapshot_date` vai para o fechamento e para cada prêmio.
7. Para cada `(meta, período)`:
   - `results = participants.map(id => evaluateGoal(goal, batch.byInspector.get(id), ctx))`;
   - `prisma.$transaction(async (tx) => { … })`:
     1. `goalPeriodClosure.createMany({ data: [closure], skipDuplicates: true })` (`participant_ids`, contagens, `promised_amount = reward_amount × participantes`, `trigger`, `closed_at`). `count 0` → o período já foi fechado: sair da transação sem gravar prêmios;
     2. `rewardAward.createMany({ data: achievers.map(...), skipDuplicates: true })` com a fotografia da meta, `achieved_value`, `service_count = computation.volume`, `achieved_on`, `index_score_at_close`, `level_at_close = resolveInspectorLevel(score, settings.levels)`;
     3. reler os ids criados (para o audit e para `ctx.createdAwardIds`; o envio das 08:00 relê os prêmios do dia, L-F08-01);
     4. **(L-F08-02)** se `next_effective_from` não é nulo e não resta período pendente da meta com início < `next_effective_from`, promover `target = next_target`, `reward_amount = next_reward_amount` e zerar `next_*` (audit `inspector_goal.terms_applied` depois do commit). Também promove, sem fechar nada, quando `today ≥ next_effective_from` e nenhum período anterior ficou pendente (ex.: o período anterior foi pulado).
   - `scope_label` (fechamento e prêmios) = nome atual da região / tipo / inspetor do escopo (L-F08-13).
   - Depois do commit: audit `goal_period.closed` (SYSTEM, `entityType 'InspectorGoal'`, `{ periodStart, periodEnd, participants, achievers }`) e `reward_award.created` por prêmio.
8. Log `inspector_program.periods_closed { trigger, goals, periods, awardsCreated, skipped, durationMs }`.
9. **(L-F08-01)** Último passo da fase `COMPUTE` (`ScheduleMessagesRunStep`): `jobQueue.enqueue('inspector-program.daily', { trigger: 'MESSAGES' }, { startAfter: messagesRunAt(now), singletonKey: 'inspector-program.messages:' + today })`. `messagesRunAt(now)` = 08:00 de `today` em Sydney, ou `now` se já passou.

**B2. Reativação (L-F08-02)** — no `UpdateGoalUseCase`, quando `active` passa a `true`: `skip = periodsToSkipOnReactivation(goal, today, closedStarts)` = todo período canônico da meta com `start ≤ today`, `start ≥ starts_at`, `end ≤ ends_at` (se houver) e sem fechamento. Na mesma transação do PATCH: `goalPeriodClosure.createMany({ data: skip.map(p => ({ …, participant_ids: [], participants_count: 0, achievers_count: 0, promised_amount: 0, scope_label, trigger: 'SKIPPED_INACTIVE', closed_at: now })), skipDuplicates: true })` e `deactivated_at = null`. A meta volta a contar no primeiro período que começa depois de hoje (`resumesOn`). Ao desativar: `deactivated_at = now`; nada é fechado.
- **Concorrência:** o agendado e o enfileiramento de startup usam o mesmo `singletonKey`, então não rodam juntos; os uniques de fechamento e de prêmio são a segunda barreira (`skipDuplicates`, sem mapear erro de unique).
- **Idempotência:** `GoalPeriodClosure (goal_id, period_start)` impede refechar; `RewardAward (goal_id, inspector_id, period_start)` impede prêmio duplicado.
- **Fuso:** períodos em datas civis de Sydney; data de cada serviço no fuso da agência (P2 da F07: `finished_at` do executado, `scheduled_date` do DONE sem execução, `created_at` do evento de `CANT_ATTEND`; DR1, DR5). Às 04:45 de Sydney o dia anterior terminou em qualquer fuso até 4h45 atrás de Sydney (Perth, Darwin, Adelaide, Brisbane). Agência num fuso mais atrás exigiria mover o horário (hoje só Sydney, memória `project_sydney_only_timezone`).
- **Dados tardios:** execução sincronizada, pesquisa respondida ou DONE → REJECTED depois do fechamento não reabrem o período; a OP anula o prêmio (VOID com motivo). Se a linha do bônus já está numa fatura fechada ou paga, só um AM anula, com reversão no ledger (DL3, TASK-F08-6). Não há detecção automática do dado tardio nesta fase. **(DR4)** O fechamento é definitivo: uma rejeição `NOT_EXECUTED` posterior (inclusive a tardia, que a F07 conta no período da rejeição, só na métrica 8) afeta só o índice e os níveis futuros, nunca um período fechado.

**C. Avaliação — `evaluateGoal(goal, c, ctx)`.**
- Volumes: `value = c?.completedCount ?? 0`; `achieved = value ≥ target`; `achievedOn = c.completedServiceDates[target − 1]`.
- `INDEX_AT_LEAST`: `{ status, score } = computeReliabilityScore(c.metrics, ctx.reliabilityIndex, c.volume)`; `achieved = status === 'SCORED' && score ≥ target`; `INSUFFICIENT_VOLUME` → `NOT_ENOUGH_SERVICES`; `NO_WEIGHTED_DATA` → `NO_DATA`; `achievedOn = periodEnd`.
- Taxa: `m = c.metrics.find(GOAL_METRIC_RELIABILITY_KEY[metric])`; `c.volume < 10` → `NOT_ENOUGH_SERVICES`; `m.rate === null` → em `LATE_NOTICE`, `value = 100` e segue para a comparação (DV6: zero atrasos = taxa perfeita); nas demais, `NO_DATA`; `value` por P8; `achieved` pelo comparador; `achievedOn = periodEnd`.

**D. Nível.** `resolveInspectorLevel(currentIndex.score, settings.levels)`, com o índice atual da F07. Sem tabela.

**E. Sequência.** `participations` = para cada fechamento cujo `participant_ids` contém o inspetor: `{ goalPeriodType, periodStart, awarded }`, onde `awarded` = existe prêmio não `VOID` do inspetor para aquela meta e período. `computeStreak` (P11) escolhe o menor ciclo presente e anda para trás pelos `periodStart` distintos desse ciclo: com participação e prêmio → `count++`; com participação sem prêmio em nenhuma meta → para; sem participação → pula. `atRisk` (passo da TASK-F08-4) usa o período corrente desse ciclo.

**F. Progresso parcial (sob demanda).** Para cada inspetor: metas ativas em que ele é participante (P3) com período corrente; agrupa por `(período, escopo)`; `batch = computeAll(periodStart, min(today, periodEnd), inspectorIds, scope)`; `evaluateGoal(goal, batch.byInspector.get(id), { …, periodEnd: today })`; `state`: volume atingido → `MET_SO_FAR`, abaixo → `IN_PROGRESS`; taxa com volume < 10 → `NOT_ENOUGH_SERVICES`; taxa nula → `NO_DATA` (exceto `LATE_NOTICE`, que vira valor 100, DV6); taxa atingindo → `MET_SO_FAR`, senão `BELOW_TARGET`; `daysLeft = periodEnd − today`. Termos (alvo, bônus) do período corrente por `goalTermsForPeriod`. Meta cujo período corrente tem fechamento `SKIPPED_INACTIVE` não tem progresso. **(L-F08-12)** Metas ativas cujo próximo período (início > hoje) começa em até `UPCOMING_GOAL_LOOKAHEAD_DAYS = 7` dias e que não têm período corrente avaliável (ainda não começaram ou o corrente foi pulado) entram com `state 'UPCOMING'`, sem `computeAll`. `countsSince = periodStart` quando `civilDate(goal.created_at) > periodStart`, senão `null`.

**G. Metas independentes (L-F08-04).** Cada meta é apurada sozinha: o mesmo DONE conta em todas as metas cujo escopo ele satisfaz; não há teto por inspetor nem orçamento por período. "Prometido" (P10) e `openCashTotal` somam todas as metas sem desconto.

### UI
Nenhuma (web na TASK-F08-3; PWA na TASK-F08-4).

### Casos de borda
1. Meta criada no meio do período corrente: os serviços desde o início do período contam (P5); o app mostra "Counts jobs since {periodStart}" (L-F08-12).
2. **(L-F08-02)** Meta editada no meio do período: `title` e `endsAt` valem já; `target` e `rewardAmount` valem do **próximo** período (`next_*`), então o fechamento do período corrente usa os termos que o inspetor acompanhou; prêmios já criados guardam a fotografia. Editar entre o fim do período (domingo 23:59) e o fechamento (segunda 04:45) também só afeta o período seguinte.
3. **(L-F08-02)** Meta desativada antes do fechamento de um período terminado: não fecha. Reativada (no dia seguinte ou meses depois), todos os períodos não fechados iniciados até hoje, inclusive o corrente, viram `SKIPPED_INACTIVE` (sem prêmio, sem "Prometido"); a meta volta a contar no próximo período. Não há catch-up retroativo.
3a. **(L-F08-02)** `endsAt` encurtado: só aceito ≥ fim do período corrente; para parar já, "Deactivate goal".
3b. **(L-F08-02)** Reativar e desativar várias vezes no mesmo período: o corrente já tem `SKIPPED_INACTIVE` desde a primeira reativação; `skipDuplicates` evita linha repetida.
3c. **(L-F08-02)** `pendingChange` numa meta que é desativada antes de `next_effective_from`: na reativação, os períodos pulados não promovem os termos; a promoção acontece no primeiro run com `today ≥ next_effective_from` sem período pendente anterior.
4. Inspetor desativado antes do fechamento: não participa; prêmio já criado continua.
5. Região apagada: bloqueada enquanto houver meta ativa (409); com só metas inativas, a exclusão segue e as metas ficam sem região (não podem ser reativadas: 422).
6. Tipo de serviço: não existe exclusão de tipo no código atual; `onDelete: Restrict` cobre o caso.
7. Job não rodou por dias: o startup e o próximo agendamento fecham até 8 períodos atrasados por meta.
8. Snapshot da F07 atrasado (DR2): `getCurrentIndexes` devolve o último; o fechamento segue com ele, grava `index_snapshot_date` e loga `warn` `inspector_program.index_snapshot_stale` quando `snapshotDate < today`; não é refeito quando o snapshot de hoje chega.
8a. **(DR4)** Snapshots com mais de 400 dias e de inspetor apagado são expurgados pela F07: a F08 não os lê (nível pelo índice atual, sequência e histórico pelas tabelas da F08).
8b. **(DR3)** Meta semanal com `volumeReferenceOverride` configurado: o score do `INDEX_AT_LEAST` usa a referência escalada pelo período que o batch traz (override 20 → 4,5 na semana); metas de volume contam serviços e não são afetadas.
9. Meta individual para inspetor fora do escopo: 0 participantes, fechamento registrado.
10. Meses de 28–31 dias e quinzenas que cruzam meses: `getCanonicalPeriod`.
11. DST de Sydney: 04:45 fica fora da hora pulada/repetida (02:00–03:00).
12. Dois títulos iguais: permitido (sem unicidade).
13. **(Q12)** Prêmio aprovado entre o merge desta tarefa e o da TASK-F08-6: fica `APPROVED`, sem lançamento; a TASK-F08-6 não faz backfill (Deploy da TASK-F08-6: as duas vão juntas para prod, sem prêmio aprovado no meio).
15. **(L-F08-04)** Metas sobrepostas (ex.: `VOLUME` semanal e `REGION_VOLUME` semanal): o mesmo serviço conta nas duas; o inspetor pode ganhar os dois bônus.
16. **(L-F08-13)** Região apagada depois do fechamento: fechamentos e prêmios mantêm `scope_label`; a meta fica com `scopeRegionDeleted`.

### Fora do escopo
- Ledger/fatura e qualquer mudança em `billing`/`financial_entries` (Q12 decidida: TASK-F08-6). Pagamento manual de prêmio (retirado em 2026-10-30).
- Recompensas não monetárias, valores das recompensas, tributação, badges, "Quality reports sent back".
- Reabrir período; recalcular prêmio com dados tardios; limite de ganhadores.
- **Estacionamento (lacunas 2026-10-29):** detecção automática de dado tardio depois do fechamento (L-F08-03); teto de bônus por inspetor/período ou orçamento por período (L-F08-04); mensagem automática de prêmio pago/anulado (L-F08-05). `PAID → APPROVED` só pelo estorno da fatura (TASK-F08-6).
- Unicidade de título; configuração do ciclo da sequência.
- Telas (TASK-F08-3/4), acesso antecipado (TASK-F08-2), mensagens (TASK-F08-4), relatório (TASK-F08-5).
- Avaliar `bonus_rule_json` (estacionamento).

### Critérios de aceite
1. **03.A4 (backend):** uma meta atingida num período fechado gera, pelo job, exatamente um `RewardAward PENDING` por inspetor atingente, visível em `GET /awards` e somado em `GET /summary` (teste 11 + rota). A prova ponta a ponta é o E2E da TASK-F08-3.
2. **03.A5:** criar, editar, desativar/reativar meta e aprovar e anular prêmio geram audit com autor e data (before/after); mudanças em `inspectorProgram` geram `platform_setting.updated` (F03).
3. **Concorrência:** dois aprovadores simultâneos → um aprova, o outro recebe 409.
4. **Idempotência:** job e ações não duplicam escrita.
5. **F07 intacta:** sem escopo, os testes da F07 passam sem mudar expectativa nem número de consultas.
6. **Região:** apagar região usada por meta ativa responde 409 com mensagem clara, nunca 500.
7. **Q18:** CL_*, INSP e TNT → 403. **03.A3:** não se aplica (ranking na TASK-F08-4).
8. **(L-F08-02)** Reativar uma meta nunca gera prêmio de período em que ela estava inativa; `endsAt` não corta o período corrente; alterar alvo/bônus não muda o período em andamento (testes 5, 11, 13).
9. **(Q12)** Não existe rota nem permissão de pagamento manual; anular só `PENDING`/`APPROVED` (teste 12). A anulação de faturado/pago (só AM) é critério da TASK-F08-6.
10. **(L-F08-01)** O run das 04:45 não envia mensagem; ele enfileira o run `MESSAGES` das 08:00 na mesma fila, sem segundo `boss.schedule` (testes 11, 19, 20).

### Dependências
F07-1, F07-2 (métricas, leitor, snapshots, `getCurrentIndexes`); F03-1 (`IPlatformSettingsReader.get`; sem `getUncached`, DR2).

### Riscos e armadilhas
- **Formato do `computeAll`:** é `ReliabilityComputationBatch`; ler sempre `byInspector.get(id)`.
- **Mocks da F07:** `completedServiceDates` e o parâmetro `scope` podem quebrar fakes não tipados (memória `project_adding_usecase_dep_breaks_untyped_test_wirings`).
- **`NULL` sem tipo no `$queryRaw`:** sempre `$6::text`/`$7::text`.
- **Custo do fechamento:** 1 `computeAll` por grupo `(período, escopo)` (7 consultas cada), nunca 1 por inspetor.
- **PR grande (6,875 dias):** manter ≤ 150 arquivos (estimativa ~60); se passar, separar as ações de prêmio num PR seguinte.
- **CHECK × `SetNull`:** o CHECK aceita região nula só em meta inativa; a guarda impede chegar lá com meta ativa. Uma corrida (reativar enquanto se apaga) falharia a exclusão por CHECK; aceitável e raro.
- **(L-F08-01) pg-boss 9 e agendamentos:** a tabela de agendamentos tem um registro por nome; um `boss.schedule('inspector-program.daily', '0 8 * * *')` apagaria o das 04:45 sem erro. Usar só o enfileiramento com `startAfter`.
- **(L-F08-02) Termos pendentes:** qualquer leitor de `target`/`reward_amount` de período (fechamento, progresso, resumo aberto, "Prometido") passa por `goalTermsForPeriod`; ler a coluna direto é bug.

### Deploy / rollout / rollback
- **Migration:** expand (3 tabelas, 3 enums, índices, CHECKs, inclusive `inspector_goals_active_chk`/`next_terms_chk` e o `reward_awards_status_fields_chk` revisto pelas lacunas; `index_snapshot_date` em `reward_awards` e `goal_period_closures`, DR2). Staging, depois prod. Sem backfill.
- **Rollout:** o job roda vazio até haver meta; a OP cadastra metas depois da TASK-F08-3. Nesta tarefa o run `MESSAGES` das 08:00 já é enfileirado, mas não tem passos até a TASK-F08-4 (roda vazio, só log).
- **Rollback:** `INSPECTOR_PROGRAM_JOBS_ENABLED=false`; reverter o código deixa as tabelas; `boss.unschedule('inspector-program.daily')`. A extensão da F07 é retrocompatível; a guarda da região some com o código.
- **Observabilidade:** `withJobMetrics`; logs `inspector_program.periods_closed`, `inspector_program.index_snapshot_stale`, `inspector_program.close_catch_up_capped`; audit por prêmio.

### Dias · Branch · Verificação
- **Dias:** 6,875 (**−0,25 em 2026-10-30**, Q12: sem `mark-reward-award-paid`, sem `paidOn` em Sydney/L-F08-11, sem ramo `PAID → VOID` com `recovery_note`; as colunas e o CHECK de `paid_at` ficam) = 03.6/03.8 backend 1,75 (modelo, CHECKs, CRUD, rota de períodos, validação, audit, guarda de região) + 03.9/apuração 4,0 (job, 10 métricas, participantes, catch-up, níveis, sequência, progresso parcial, escopo e `completedServiceDates` no leitor da F07 com testes de regressão) + 03.13 backend 0,4 (resumo, aprovar com CAS, anular, porta de extensão) + **lacunas 0,6** (L-F08-02 reativação com `SKIPPED_INACTIVE`, `GOAL_END_IN_CURRENT_PERIOD`, termos do próximo período e promoção 0,4; L-F08-03 CHECK 0,05; L-F08-01 enfileiramento do run das 08:00, L-F08-05/10/13 e "Starting soon" no progresso 0,15) + **reconciliação 0,125** (DR2: coluna `index_snapshot_date` nas 2 tabelas, regra do snapshot atrasado e testes; DR1/DR3/DR4/DR5 só texto e casos de teste, sem custo).
- **Branch:** `feat/f08-inspector-program-backend` a partir de `develop`, em worktree. ~60 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `test:integration` (testes 14 e 18) e `test:integration:db` (16, 17) via subagente com resumo; `generate:openapi` + `generate:types` commitados; `git diff --stat origin/develop... | tail -1` < 150.

---

## TASK-F08-2 · Backend: acesso antecipado por nível nas ofertas (Q13)

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F08-1
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F05-2, TASK-F08-3, TASK-F05-3
> - **Pista sugerida (time de 6):** A · Backend crítico

### Objetivo
- Com `inspectorProgram.earlyAccess.enabled = true`, nas primeiras **H** horas depois de `service_groups.published_at`, um grupo só **aparece** (lista, contagem, detalhe) e só pode ser **aceito** por inspetores de nível ≥ **X**.
- Regras de partida (DV3): desligado por padrão; a janela só vale para um grupo se existir pelo menos um inspetor **elegível para aquele grupo** que se qualifica; nunca para grupos de hoje ou D+1.
- Depois de H horas, o grupo fica visível e aceitável para todos os elegíveis. Ordenação e aceite por ordem de chegada não mudam.

### Contexto no código
- **Lista:** `GetMarketplaceOffersUseCase.execute` (`apps/backend/src/modules/service-group/application/use-cases/get-marketplace-offers.use-case.ts`) chama `findPublishedForInspector` e `countPublishedForInspector` em paralelo.
- **SQL de elegibilidade:** `findEligibleGroupIds` (`apps/backend/src/modules/service-group/infrastructure/prisma-service-group.repository.ts:964-999`: `ST_Intersects` + `inspector_regions` + tipo + denylist `NOT EXISTS`; `GROUP BY sg.id, sg.scheduled_date ORDER BY sg.scheduled_date, sg.id LIMIT/OFFSET`), `countPublishedForInspector` (`:756-791`) e `findPublishedOfferDetail` (`:794-…`) repetem o mesmo `WHERE`. As três precisam do filtro (senão a contagem diverge e o detalhe vaza).
- **Detalhe:** `GetMarketplaceOfferDetailUseCase` → 404 `MARKETPLACE_OFFER_NOT_FOUND` quando o SQL não devolve o grupo.
- **Aceite:** `AcceptOfferUseCase.execute` (`accept-offer.use-case.ts`): cache de idempotência → `assertRoles INSP` → inspetor ativo → `findById` → `canAccept()` → tipo → denylist → `acceptOptimistic(groupId, inspectorId, now)` (`prisma-service-group.repository.ts:602`) → saga.
- **`published_at`:** gravado em `publish-service-group.use-case.ts:148`; zerado em `unpublishOptimistic` (`:628`) e em `republish-service-group.use-case.ts:49`. Cada publicação reabre a janela.
- **Sem aviso de publicação:** `SERVICE_GROUP_EVENTS.PUBLISHED` não tem assinante.
- **Morto:** `priorityOfferHours` por agência (`packages/shared/src/schemas/tenant.ts:50`; Q13: não reaproveitar).
- **Inspetor:** `service_types_json` (`[{ serviceTypeId, … }]`), `blocked_clients_json` (`string[]`).
- **F07:** snapshot `inspector_reliability_snapshots (inspector_id, snapshot_date, status, score)`; `findLatestSnapshotDate()`.
- **TASK-F08-1:** `standingService.hasEarlyAccess`, `minScoreForLevel`, chave `inspectorProgram.earlyAccess`.

### Decisões aplicáveis
D2 (Q13, 2026-10-27), D3 (2026-10-27); DV1, DV3 (2026-10-28).
- **DL8 (L-F08-08, 2026-10-29):** a janela só vale para grupos com `published_at ≥ earlyAccess.enabledAt`. `enabledAt` é gravado pelo backend no `PUT /v1/platform-settings/inspectorProgram` quando `enabled` passa de `false` para `true` (instante do PUT), mantido enquanto continua ligado e zerado ao desligar; o valor enviado pelo cliente é ignorado. `enabled true` com `enabledAt null` (estado que só um dado manual produziria) → a política devolve `null` (janela nunca vale) + log `warn`. Aumentar H retroage para grupos já publicados (aceito, documentado no runbook). O 403 diz dia e hora em Sydney.
- **DR5 (N13, L-X00-03, 2026-10-29):** `published_at`, `cutoffUtc`, `enabledAt` e `opensAt` são instantes UTC (exibidos em `PLATFORM_TIMEZONE` no 403); "hoje/D+1" (`protectedFrom`) é data civil de `PLATFORM_TIMEZONE`; `scheduled_date` do grupo é civil da agência e é comparada com `protectedFrom` (iguais enquanto tudo é Sydney, memória `project_sydney_only_timezone`).

### Testes primeiro (TDD)

**1. Domínio — `apps/backend/src/modules/service-group/domain/early-access.test.ts`** (`resolveEarlyAccessParams({ enabled, hours, minScore, latestSnapshotDate, viewerQualifies, now, todaySydney })`)

| Caso | Esperado |
|---|---|
| `enabled false` | `null` (sem filtro) |
| viewer qualifica | `null` |
| sem snapshot (`latestSnapshotDate null`) | `null` (ninguém qualifica: a janela nunca vale) |
| viewer não qualifica, `hours 12`, `enabledAt '2026-11-01T00:00:00.000Z'`, now `2026-11-10T10:00Z`, hoje `2026-11-10` | `{ cutoffUtc: '2026-11-09T22:00:00.000', enabledAtUtc: '2026-11-01T00:00:00.000', protectedFrom: '2026-11-12', minScore, latestSnapshotDate }` (`protectedFrom` = hoje + 2: hoje e D+1 nunca entram) |
| **(L-F08-08)** `enabled true`, `enabledAt null` | `null` + log `warn` `marketplace.early_access_missing_enabled_at` |

- `isGroupInEarlyAccess({ publishedAt, scheduledDate, hasQualifiedEligible }, params)`: `params null` → `false`; `publishedAt null` → `false`; `publishedAt ≤ cutoff` → `false`; **(L-F08-08)** `publishedAt < enabledAtUtc` → `false`; `scheduledDate < protectedFrom` (hoje ou D+1) → `false`; `!hasQualifiedEligible` → `false`; senão `true`.
- **(L-F08-08)** `formatOpensAt(opensAt)`: `2026-11-10T11:00:00Z` → `'Tue 10 Nov'` e `'10:00 pm'` (Sydney, AEDT); com `TZ=America/Los_Angeles` o mesmo texto.

**1b. Settings — `inspector-program-setting-save-hook.test.ts` (L-F08-08)** (`prepareInspectorProgramSettingForSave(previous, next, now)`)

| previous.enabled → next.enabled | Esperado `next.earlyAccess.enabledAt` |
|---|---|
| `false → true` (cliente manda `enabledAt: '2020-01-01T00:00:00.000Z'`) | `now.toISOString()` (o do cliente é ignorado) |
| `true → true` (previous `enabledAt '2026-11-01T00:00:00.000Z'`, `hours` 12 → 24) | `'2026-11-01T00:00:00.000Z'` (mantido) |
| `true → false` | `null` |
| `false → false` | `null` |
| sem registro anterior (defaults) `→ true` | `now.toISOString()` |

**2. Aplicação — `has-early-access.test.ts`** (`standingService.hasEarlyAccess`)

| Caso | Esperado |
|---|---|
| `enabled false` | `{ hasAccess: true, reason: 'DISABLED' }` |
| score 88.3 (Ana), `minLevel GOLD` | `{ true, 'LEVEL' }` |
| score 70 (Silver), `minLevel GOLD` | `{ false, null }` |
| score 70, `minLevel SILVER` | `{ true, 'LEVEL' }` |
| score `null` / `NOT_COMPUTED`, `minLevel BRONZE` | `{ false, null }` |

**3. Aplicação — `get-marketplace-offers.use-case.test.ts`, `get-marketplace-offer-detail.use-case.test.ts` (acréscimo)** — sem acesso → o repositório recebe os parâmetros de janela; com acesso ou desligado → `null`; a política é consultada **uma** vez por requisição.

**4. Aplicação — `accept-offer.use-case.test.ts` (acréscimo)**

| Caso | Esperado |
|---|---|
| grupo para D+3 publicado há 2 h, H 12, existe Gold elegível, viewer Silver | 403 `OFFER_EARLY_ACCESS_ONLY` com `details.opensAt` = `published_at + 12 h` (ISO) e `message` "This offer opens to all inspectors on {EEE d MMM} at {h:mm a}."; `acceptOptimistic` não é chamado |
| **(L-F08-08)** mesmo grupo publicado **antes** de `enabledAt` | aceita |
| mesmo grupo, viewer Gold | aceita |
| mesmo grupo, nenhum Gold elegível para ele (o único Gold não cobre a região) | aceita (DV3) |
| grupo para D+1 publicado há 2 h | aceita (nunca hoje/D+1) |
| grupo para hoje | aceita |
| publicado há 12 h 0 min 1 s | aceita |
| `published_at null` | aceita |
| desligado | aceita |
| cache de idempotência do mesmo inspetor | devolvido antes da checagem (comportamento atual) |
| ordem | a janela é checada depois de `canAccept()`/tipo/denylist e antes do `acceptOptimistic` |

**5. Banco — `apps/backend/tests/integration/db/marketplace-early-access.db.test.ts`** (Testcontainers + PostGIS; hoje fixo `2026-11-10` Sydney; região R; tipo T; Gina (Gold, R, T), Sam (Silver, R, T), Gus (Gold, só região S); snapshot de `2026-11-10` com os scores; H 12; `minLevel GOLD`)

| Grupo | `scheduled_date` | `published_at` | Gina | Sam |
|---|---|---|---|---|
| G1 | 2026-11-13 | now − 1 h | vê | **não vê** |
| G2 | 2026-11-13 | now − 11 h 59 min | vê | não vê |
| G3 | 2026-11-13 | now − 12 h | vê | **vê** (fronteira) |
| G4 | 2026-11-13 | now − 3 dias | vê | vê |
| G5 | 2026-11-13 | `NULL` (legado) | vê | vê |
| G6 | **2026-11-11** (D+1) | now − 1 h | vê | **vê** (nunca hoje/D+1) |
| G7 | **2026-11-10** (hoje) | now − 1 h | vê | **vê** |
| G8 | 2026-11-13, região S | now − 1 h | não vê (fora de S) | não vê (fora de S); um Silver de S **vê** já com 1 h se Gus (único Gold de S) estiver bloqueado pela agência do grupo |

- **Só se houver qualificado elegível:** grupo em R com Gina **INACTIVE** (sem Gold ativo em R) → Sam vê G1 já com 1 h; grupo de tipo que nenhum Gold atende → visível; grupo de agência que bloqueia todos os Gold (denylist de Gina) → visível para Sam.
- **Visibilidade depois de H horas sem ninguém qualificado:** com Gina presente, avançando o relógio para `published_at + 12 h`, Sam vê G1.
- **Desligado:** Sam vê G1–G7.
- **(L-F08-08) Ativação com ofertas no ar:** `enabledAt = now − 30 min`; G1 (publicado há 1 h, antes de ligar) → Sam **vê**; G9 (2026-11-13, publicado há 10 min) → Sam não vê, Gina vê.
- **Sem snapshot:** tabela de snapshots vazia → Sam vê tudo.
- `countPublishedForInspector` bate com os ids de cada linha; `findPublishedOfferDetail(G1, Sam)` → `null`, `(G1, Gina)` → detalhe.
- paginação: com `pageSize 2`, o filtro vem antes do `LIMIT/OFFSET`.
- fuso da sessão: mesmo resultado com `SET TIME ZONE 'Australia/Sydney'` e `UTC`.

**6. Rota — `marketplace-early-access.routes.test.ts`** (Supertest) — G1 publicado em `2026-11-10T10:00:00Z`, H 12 → aceite de Sam → 403 `{ error: { code: 'OFFER_EARLY_ACCESS_ONLY', message: 'This offer opens to all inspectors on Wed 11 Nov at 9:00 am.', details: { opensAt: '2026-11-10T22:00:00.000Z' } } }` (L-F08-08: dia + hora de Sydney); `GET /v1/marketplace/offers` de Sam sem G1 e com `total` coerente.
- **(L-F08-08)** `PUT /v1/platform-settings/inspectorProgram` como AM com `earlyAccess.enabled` `false → true` → resposta e `GET` seguinte com `enabledAt` = instante do PUT; audit `platform_setting.updated` com o `enabledAt` no `after`.

### Escopo / Passos
1. **Domínio (service-group):** `domain/early-access.ts` com `resolveEarlyAccessParams`, `isGroupInEarlyAccess`, porta `IOfferEarlyAccessPolicy { resolve(inspectorId, now): Promise<EarlyAccessParams | null> }` e `OfferEarlyAccessOnlyError` (`ForbiddenError('OFFER_EARLY_ACCESS_ONLY', …, { opensAt })`) em `service-group.errors.ts`.
2. **Adapter (inspector-program):** `application/offer-early-access.policy.ts` implementa a porta com `standingService.hasEarlyAccess`, `findLatestSnapshotDate` e `minScoreForLevel(settings.minLevel, settings.levels)`.
3. **Repositório:** `findPublishedForInspector`, `countPublishedForInspector`, `findPublishedOfferDetail` e `findEligibleGroupIds` recebem `earlyAccess: EarlyAccessParams | null` (último parâmetro; interface em `domain/service-group.repository.ts`). Novo `findEarlyAccessStateForGroup(groupId, params)` → `{ publishedAt, scheduledDate, hasQualifiedEligible }` para o aceite, com o mesmo fragmento SQL.
4. **Use cases:** lista e detalhe recebem a porta, resolvem uma vez e repassam. `AcceptOfferUseCase` recebe a porta (parâmetro opcional no fim do construtor) e checa antes do `acceptOptimistic`.
5. **Container:** injetar `container.inspectorProgram.offerEarlyAccessPolicy`.
6. **(L-F08-08) `enabledAt` gravado pelo servidor (extensão da F03, dono: F08):** função pura `prepareInspectorProgramSettingForSave(previous, next, now)` em `apps/backend/src/modules/inspector-program/application/`; o use case de `PUT /v1/platform-settings/:key` da F03 ganha um mapa opcional `PLATFORM_SETTING_SAVE_HOOKS: Partial<Record<PlatformSettingKey, (prev, next, now) => value>>` (backend, não shared), aplicado depois da validação e antes da escrita/audit; a F08 registra o hook de `inspectorProgram`. Sem hook, comportamento da F03 inalterado.
7. **(L-F08-08)** `EarlyAccessParams.enabledAtUtc` + condição no fragmento SQL e em `isGroupInEarlyAccess`; `OfferEarlyAccessOnlyError` monta a mensagem com `formatOpensAt` (Sydney).
8. **OpenAPI:** declarar o 403 na rota de aceite (`marketplace.routes.ts:90-115`); regenerar.
9. **Doc (X00):** `apps/backend/CLAUDE.md`, seção do marketplace: janela de acesso antecipado nas 3 consultas + aceite, regras DV3, `published_at` reabre a janela, só publicações depois de `enabledAt`, aumentar H retroage; seção de platform settings: hooks de gravação por chave.

### Modelo de dados
Nenhuma mudança. Usa `service_groups.published_at`, `inspectors`, `inspector_regions` e `inspector_reliability_snapshots`.

### Contratos
- **Lista/contagem/detalhe:** sem mudança de request/response; grupo dentro da janela não aparece para quem não tem acesso (detalhe: 404 existente).
- **Aceite:** novo `403 OFFER_EARLY_ACCESS_ONLY`, `message` "This offer opens to all inspectors on {EEE d MMM} at {h:mm a}." (dia e hora de Sydney, L-F08-08), `details: { opensAt }` (ISO 8601 UTC).
- **Settings (L-F08-08):** `GET/PUT /v1/platform-settings/inspectorProgram` passam a trazer `earlyAccess.enabledAt: string | null`; no PUT o campo é recalculado pelo servidor (o enviado é ignorado).
- **RBAC e idempotência:** inalterados.

### Algoritmos
- **Quem vê tudo:** `viewerQualifies = !enabled || isEarlyAccessLevel(resolveInspectorLevel(score, levels), minLevel)`. Sem snapshot, a política devolve `null` (ninguém qualifica, a janela nunca vale).
- **Parâmetros:** `cutoffUtc = (now − hours h).toISOString().replace('Z', '')` (texto UTC, sem depender do `TimeZone` da sessão); `enabledAtUtc = enabledAt.replace('Z', '')` (mesmo formato, L-F08-08); `protectedFrom = addCivilDays(todaySydney, 2)`; `minScore = minScoreForLevel(minLevel, levels)`; `latestSnapshotDate`.
- **SQL** (no `WHERE` das 3 consultas, com `sg` = grupo; `$cutoff`, `$protectedFrom`, `$minScore`, `$snap` vêm de `earlyAccess`; com `earlyAccess = null` o fragmento não é incluído):
  ```sql
  AND NOT (
        sg.published_at IS NOT NULL
    AND sg.published_at > ${cutoffUtc}::timestamp
    AND sg.published_at >= ${enabledAtUtc}::timestamp   -- L-F08-08: só publicações depois de ligar
    AND sg.scheduled_date >= ${protectedFrom}::date
    AND EXISTS (
      SELECT 1
      FROM inspector_reliability_snapshots rs
      JOIN inspectors qi ON qi.id = rs.inspector_id
        AND qi.status = 'ACTIVE' AND qi.deleted_at IS NULL
      WHERE rs.snapshot_date = ${snap}::date
        AND rs.status = 'SCORED' AND rs.score >= ${minScore}::numeric
        AND qi.service_types_json @> jsonb_build_array(jsonb_build_object('serviceTypeId', sg.service_type_id))
        AND EXISTS (
          SELECT 1
          FROM appointments qa
          JOIN properties qp ON qp.id = qa.property_id AND qp.deleted_at IS NULL AND qp.coordinates IS NOT NULL
          JOIN service_regions qsr ON qsr.status = 'ACTIVE' AND qsr.geom IS NOT NULL AND ST_Intersects(qsr.geom, qp.coordinates)
          JOIN inspector_regions qir ON qir.region_id = qsr.id AND qir.inspector_id = qi.id
          WHERE qa.service_group_id = sg.id AND qa.deleted_at IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM appointments qb
          WHERE qb.service_group_id = sg.id AND qb.deleted_at IS NULL
            AND qi.blocked_clients_json ? qb.tenant_id)
    )
  )
  ```
  - "Elegível para o grupo" reproduz a elegibilidade da lista (região por `ST_Intersects`, tipo, denylist); "qualifica" = score do snapshot mais recente ≥ limite do nível X.
  - Visibilidade para todos depois de H horas é só tempo (`published_at > cutoff` deixa de valer).
  - O `EXISTS` só é avaliado para grupos recém-publicados e fora de hoje/D+1 (poucos).
- **Aceite:** depois das checagens atuais: `state = findEarlyAccessStateForGroup(groupId, params)`; `isGroupInEarlyAccess(state, params)` → `OfferEarlyAccessOnlyError(publishedAt + hours)`.
- **Corrida:** o nível muda 1×/dia; o `acceptOptimistic` continua a única trava do "primeiro que chega".

### UI
Nenhuma. O PWA mostra a lista do servidor e a mensagem de erro do servidor no aceite.

### Casos de borda
1. Grupo despublicado e publicado de novo: nova janela.
2. `published_at NULL` com `PUBLISHED` (legado): visível.
3. Setting alterado: vale na próxima leitura (cache de 30 s da F03). **(L-F08-08)** Ligar a janela não esconde ofertas já publicadas (`published_at < enabledAt`); desligar e religar gera novo `enabledAt`. Aumentar H retroage: um grupo publicado depois de `enabledAt` que já estava visível para todos pode voltar a ficar restrito até `published_at + H_novo` (aceito; o runbook orienta a mudar H fora do horário comercial).
3a. **(L-F08-08)** Inspetor tenta aceitar às 23:00 uma oferta que abre às 9:00 do dia seguinte: a mensagem diz o dia ("on Wed 11 Nov at 9:00 am"), sem ambiguidade.
4. Inspetor sem snapshot: sem nível; vê o grupo depois de H horas (ou já, se ninguém qualificado for elegível).
5. Gold que cai para Silver no snapshot de hoje: perde o acesso na hora.
6. Único Gold elegível desativado durante a janela: o grupo aparece para todos na próxima leitura.
7. Grupo de hoje/D+1: nunca tem janela (DV3).
8. Detalhe por link antigo durante a janela: 404 existente.
9. OP atribui manualmente durante a janela: permitido.

### Fora do escopo
Ordenação das ofertas; `priorityOfferHours`; selo/contagem no PWA; auditoria de aceite negado (só log).
- **Estacionamento:** o `accept-offer` não confere a região do inspetor (só tipo e denylist), enquanto a lista confere. Lacuna existente, fora da F08, acompanhada à parte pelo coordenador.

### Critérios de aceite
1. **03.7:** com a janela ligada, um grupo para D+2 ou depois, publicado há menos de H horas e com pelo menos um qualificado elegível, não aparece, não conta e não abre para quem tem nível < X, e o aceite responde 403; para nível ≥ X tudo funciona como hoje (testes 4–6).
2. **DV3:** desligado por padrão; sem qualificado elegível o grupo é visível de imediato; grupos de hoje e D+1 nunca têm janela (testes 1, 4, 5).
2a. **(L-F08-08)** Ligar a janela não esconde nenhum grupo publicado antes da ativação; `enabledAt` é sempre do servidor; o 403 informa dia e hora de Sydney (testes 1, 1b, 4–6).
3. **Visibilidade garantida:** depois de H horas o grupo aparece para todos (teste 5).
4. **03.A5:** mudanças de H/X/liga-desliga auditadas pela F03. **03.A3/03.A4:** não se aplicam.

### Dependências
TASK-F08-1; F07-2.

### Riscos e armadilhas
- Esquecer uma das 3 consultas (teste 5 cobre as três).
- Fuso do cast `timestamp`: resolvido passando texto UTC (teste 5).
- Filtro depois da paginação: tem que estar no `WHERE`.
- Mocks do `IServiceGroupRepository`: 4 assinaturas mudam (`grep findPublishedForInspector`).
- Custo do `EXISTS` espacial: medir em staging com o `EXPLAIN` do teste 5 (usa os GIST existentes).

### Deploy / rollout / rollback
- Sem migration. Deploy sem efeito (padrão desligado). Um AM liga em "Platform settings" (TASK-F08-3) depois do onboarding, quando a F07 já tiver snapshots. **(L-F08-08)** A ativação só afeta grupos publicados depois dela, então pode ser feita em horário comercial; mudar H, ao contrário, retroage (fazer fora do horário comercial).
- **Rollback:** `earlyAccess.enabled = false` (≤ 30 s, sem deploy).
- **Observabilidade:** log `info` `marketplace.early_access_denied { groupId, inspectorId, opensAt }` no aceite negado.

### Dias · Branch · Verificação
- **Dias:** 1,75 = política + porta 0,25 + SQL nas 3 consultas com a regra do qualificado elegível 0,5 + aceite 0,25 + testes de banco 0,5 + **lacuna L-F08-08 0,25** (hook de gravação na F03, `enabledAt` no SQL e na política, mensagem com dia).
- **Branch:** `feat/f08-offer-early-access` a partir de `develop` (depois da TASK-F08-1), em worktree. ~19 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `test:integration` (6) e `test:integration:db` (5) via subagente; `generate:openapi` + `generate:types` commitados; `git diff --stat origin/develop... | tail -1` < 150.

---

## TASK-F08-3 · Web (AM/OP): "Goals & rewards", seção "Inspector program", coluna "Level" na página da F07 e E2E do 03.A4

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F08-1, TASK-X01-1, TASK-F03-4, TASK-F07-3
> - **Desbloqueia:** TASK-F08-4, TASK-F08-5, TASK-F08-6
> - **Pode rodar em paralelo com:** TASK-F05-2, TASK-F08-2, TASK-F05-3
> - **Pista sugerida (time de 6):** D · Web · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Página nova **"Goals & rewards"** (`/goals-rewards`) no grupo **Dashboard** (X01), só AM/OP, com abas **Goals** (lista, nova meta, editar, desativar/reativar) e **Rewards** (prometido × atingido por período; aprovar, anular). Sem "Mark as paid" (Q12 decidida em 2026-10-30: o prêmio fica `PAID` pela fatura do inspetor, TASK-F08-6, que acrescenta à aba o link da fatura).
- Sub telas com `BackButton`: `/goals-rewards/goals/new` e `/goals-rewards/goals/:goalId`.
- Seção **"Inspector program"** em "Platform settings" (limites de nível e acesso antecipado).
- **Coluna "Level"** na página "Inspector performance" da F07 (linha 03.11 do plano atribui à F08).
- **E2E Playwright** que prova o 03.A4.

### Contexto no código
- **Menu:** `apps/web/src/components/shell/Sidebar.tsx`, `submenu` Dashboard do X01 ("F08 acrescenta filho AM/OP").
- **Rotas:** `apps/web/src/app/router.tsx` (`Loadable(lazyRetry(...))`, `<AuthGuard roles={[UserRole.AM, UserRole.OP]}>`, precedente `inspector-workload` `:168-176`).
- **Componentes:** `PageHeader` com `backTo` (X01), `ListFilterTableTemplate`, `DataTable`, `Dialog` (memória `project_dialog_focus_steal_oncloseref`), `FormField`, `SelectInput` (memória `project_select_option_scope_bugs`), `TextInput`, `Button`, snackbar, mapas de `apps/web/src/lib/status-colors.ts`.
- **Cliente:** `openapi-fetch` tipado por `api-types.ts` (memória `project_openapi_fetch_error_never_on_200_only_routes`).
- **Settings (F03):** `apps/web/src/features/platform-settings/pages/PlatformSettingsPage.tsx` + `usePlatformSetting(key)`.
- **F07-3:** página "Inspector performance" (feature da F07 no web, tabela do ranking a partir de `GET /v1/dashboard/inspector-performance`, que traz `score` e `status` por inspetor).
- **E2E web:** `apps/web/playwright.config.ts`, specs em `apps/web/tests/e2e/*.spec.ts`, `pnpm --filter web test:e2e`.
- **TASK-F08-1:** rotas, schemas e rótulos; `resolveInspectorLevel`; rota de períodos.

### Decisões aplicáveis
D1 (Q12 ✅ decidida em 2026-10-30: bônus na fatura do inspetor; esta tarefa não tem pagamento manual nem copy de "pago fora do Properfy"), D3, D8, D9 (2026-10-27); DV1, DV2, DV3, DV5 (2026-10-28); P1, P2, P5, P9, P10 (2026-10-28).

Das lacunas (2026-10-29):
- **DL2 (L-F08-02, 2026-10-29):** o formulário avisa "Changes to target and bonus apply from the next period." e mostra a alteração pendente; "Ends" só oferece fins ≥ `minEndsAt`; reativar avisa que a meta volta no próximo período.
- **DL3 (L-F08-03, revista 2026-10-30):** nesta tarefa "Void" só em `PENDING`/`APPROVED`; "Void" de faturado/pago (só AM, reversão) e o chip "Voided after invoicing" são da TASK-F08-6.
- **DL4 (L-F08-04, 2026-10-29):** metas cumulativas; aviso informativo no formulário quando há outras metas ativas do mesmo ciclo que podem incluir os mesmos inspetores.
- **DL5 (L-F08-05, 2026-10-29):** diálogo de anulação com "Internal reason" (obrigatório) e "Note to the inspector (optional)".
- **DL10 (L-F08-10, 2026-10-29):** RewardsTab = `past&count=12` + `upcoming&count=1`.
- **DL13 (L-F08-13, 2026-10-29):** `describeGoal` aceita `scopeLabel` nulo.
- **DL8 (L-F08-08, 2026-10-29):** a seção de settings não mostra nem envia `enabledAt` como campo editável; mostra "On since {d MMM yyyy, h:mm a}" quando ligado.

Da reconciliação (2026-10-29):
- **DR5 (N13, L-X00-03, 2026-10-29):** datas civis de período em `PLATFORM_TIMEZONE`, vindas do backend; instantes (`approvedAt`, `paidAt`, `enabledAt`) exibidos em `PLATFORM_TIMEZONE`; `users.timezone` e o fuso do navegador nunca entram.
- **DR6 (L-X01-02/03/08, 2026-10-29):** "Goals & rewards" é o último filho do grupo Dashboard; testes de menu por rótulo e sem mocks de `SidebarSubmenu`/`SidebarItem`; `backTo` com `AuthGuard` que cobre AM e OP; P-b com OP; confirmação de saída por `onBack(goBack)`.

### Testes primeiro (TDD)

Vitest + RTL + MSW; `findBy` só depois da transição estável (memória `project_web_findby_races_state_transition`).

**1. `Sidebar.roles.test.tsx` (render real) e `Sidebar.test.tsx` (`filterNavItems`)** — **(DR6)** em `Sidebar.roles.test.tsx`, com `MemoryRouter` + `initialEntries` por caso e **sem** mocks de `SidebarSubmenu`/`SidebarItem`: AM/OP abrem o flyout do grupo Dashboard e veem o `menuitem` "Goals & rewards" → `/goals-rewards` (presença por **rótulo**, nunca índice nem contagem); CL_ADMIN, CL_USER, INSP não; grupo ativo em `/goals-rewards/*`. Em `Sidebar.test.tsx`: `filterNavItems(NAV_ITEMS, 'OP')` traz "Goals & rewards" depois de "Inspector performance" quando este existe (ordem relativa da tabela canônica do X01, sem posição absoluta).

**2. `router.test.tsx`** — as 3 rotas com `AuthGuard [AM, OP]`; CL_ADMIN cai no acesso negado.

**3. `GoalsTab.test.tsx`** — carrega `GET /goals?active=true`; filtros Status (Active/Inactive/All), Metric, Period; vazio "No goals yet. Create one to start the program."; erro "Couldn't load goals." + "Retry"; linha (clique ou Enter) abre o formulário.

**4. `GoalFormPage.test.tsx`**
- "Region volume" mostra "Region" (obrigatório); "Service type volume" mostra "Service type"; taxas mostram "%" e "at least" (ou "at most" em "Can't-do rate"); índice mostra "points".
- "Starts" carrega `GET /periods?periodType=…&direction=upcoming&count=13` e mostra "Week of Mon 2 Nov 2026" / "Fortnight of Mon 2 Nov 2026" / "November 2026"; trocar o ciclo recarrega e limpa a escolha. "Ends": "No end date" + fins de período (`count=26` a partir do início).
- envio válido → `POST` com o corpo exato; 201 → "Goal created" e volta para a aba Goals; 422 → mensagem do servidor no topo; 400 com `details` → erros por campo.
- edição: `metric`, `period`, escopo e `startsAt` desabilitados ("Create a new goal to change this."); envia só o que mudou; sem mudança → "Save" desabilitado.
- meta com `scopeRegionDeleted` → aviso "This goal's region was deleted. It can't be reactivated." e "Reactivate goal" desabilitado.
- desativar → `Dialog` "Deactivate this goal? Open periods won't be evaluated and no new rewards will be created." → `PATCH { active: false }` → "Goal deactivated".
- **(L-F08-02)** reativar → `Dialog` "Reactivate this goal? It counts again from {EEE d MMM yyyy}. Periods while it was inactive won't be evaluated." (data = início do próximo período, vinda da rota de períodos `upcoming&count=2`) → `PATCH { active: true }` → "Goal reactivated"; meta com `resumesOn` mostra "Counts again from Mon 21 Dec 2026".
- **(L-F08-02)** edição de meta iniciada: abaixo de Target e Bonus, texto fixo "Changes to target and bonus apply from the next period."; meta com `pendingChange { target: 12, rewardAmount: 40, effectiveFrom: '2026-11-16' }` → "From Mon 16 Nov 2026: target 12, bonus $40.00." "Ends" lista só fins de período ≥ `minEndsAt` (ex.: hoje `2026-11-11`, semanal → primeira opção "Sun 15 Nov 2026"); 422 `GOAL_END_IN_CURRENT_PERIOD` → mensagem do servidor no topo.
- **(L-F08-04)** Period "Weekly" com outras 2 metas ativas semanais sem `scopeInspector` (ou com o mesmo inspetor escolhido) em `GET /goals?active=true&period=WEEKLY` → aviso informativo (não bloqueia) "Inspectors can earn this on top of 2 other active weekly goals."; 0 outras → sem aviso; na edição, a própria meta não conta.
- `BackButton` `to="/goals-rewards?tab=goals"`; com alterações não salvas, "Leave without saving?".
- **(DR6, L-X01-08)** P-a/P-b/P-c do X01 nas 2 sub telas; **P-b** (entrada direta → clique em voltar → fallback `/goals-rewards?tab=goals`) roda com **OP**, o papel mais restrito que acessa a tela (o `AuthGuard` do fallback é `[AM, OP]`); com alterações não salvas, o voltar chama o override `onBack(goBack)` do `PageHeader`: "Leave" executa o `goBack` recebido, "Stay" não navega; a página e o `backTo` usam a mesma constante `BACK_TO`.

**5. `RewardsTab.test.tsx`**
- "Cycle" (Weekly padrão) e "Period" (L-F08-10: `GET /periods?direction=past&count=12` + `GET /periods?direction=upcoming&count=1` para o corrente "In progress", corrente no topo); URL `?tab=rewards&cycle=WEEKLY&period=2026-11-02`; refaz `GET /summary` e `GET /awards`.
- **(L-F08-02)** meta com fechamento pulado no período → linha da tabela por meta com "Skipped (goal inactive)" e Max payout "$0.00".
- tiles Promised, Achieved, Approved, Paid em AUD (Paid fica 0 até a TASK-F08-6); tabela por meta (Per winner, Participants, Max payout, Achievers, Achieved); período em andamento: "This period is still open. Rewards are created after it closes."
- **Aprovar:** "Approve" em todo `PENDING` (qualquer AM/OP, DV2) → `POST /approve` com `Idempotency-Key` → linha atualizada, "Reward approved"; 409 → "This reward was updated by someone else." e recarga.
- **Sem pagamento manual (Q12):** nenhum botão "Mark as paid" em nenhum status; `APPROVED` mostra só "Void".
- **Anular:** `PENDING`/`APPROVED` → `Dialog` "Void reward" com "Internal reason" (5–500, ajuda "Only the Properfy team sees this.") e "Note to the inspector (optional)" (≤ 200, ajuda "Shown in the inspector's app.") (L-F08-05) → corpo `{ reason, inspectorNote? }` → "Reward voided".
- `PAID`/`VOID` (linhas de fixture): sem "Void" nesta tarefa (a ação só AM em faturado/pago chega na TASK-F08-6).
- duplo clique → um só `POST`; retry reaproveita a `Idempotency-Key`.

**6. `InspectorProgramSettingsSection.test.tsx`** — "Silver from", "Gold from", "Early offer access" (switch, desligado por padrão), "Early access window (hours)", "Minimum level"; Gold ≤ Silver → erro sem enviar; horas fora de 1–72 → erro; salvar → `PUT /v1/platform-settings/inspectorProgram` com o objeto completo (o `enabledAt` lido é devolvido como veio; o servidor recalcula) → "Inspector program settings saved". **(L-F08-08)** com `enabled true`, `enabledAt '2026-11-01T00:00:00.000Z'` → "On since 1 Nov 2026, 11:00 am" (Sydney); ajuda do switch "Only offers published after you turn this on are affected. Changing the window applies to offers already published."

**6b. `goal-copy.test.ts` (shared, L-F08-13)** — `describeGoal({ metric: 'REGION_VOLUME', target: 9, scopeLabel: 'Sydney North' })` → "9 inspections in Sydney North"; `scopeLabel null` → "9 inspections in a deleted region"; `SERVICE_TYPE_VOLUME` com `scopeLabel null` → "9 inspections of a deleted service type"; as outras métricas ignoram `scopeLabel`.

**7. Página "Inspector performance" (F07) — teste existente + acréscimo** — coluna "Level" depois de "Score": 88.3 → "Gold", 70 → "Silver", 50 → "Bronze" com os limites de `usePlatformSetting('inspectorProgram')`; limites alterados (70/90) → 88.3 vira "Silver"; o bloco "Not enough data" não tem a coluna; enquanto a chave carrega, a coluna mostra "–"; nenhuma outra coluna muda.

**8. a11y** — `axe` nas telas novas, sem violações; abas com `role="tablist"` e setas.

**9. E2E obrigatório (03.A4) — `apps/web/tests/e2e/inspector-program-rewards.spec.ts`** (Playwright)
- *Preparação:* script `apps/backend/src/scripts/e2e-inspector-program-fixture.ts` (só dev/test, recusa rodar com `NODE_ENV=production`), chamado pelo `globalSetup` do spec: cria um inspetor com 10 DONE na semana fechada anterior (dados de seed existentes do E2E + appointments novos), e executa `RunInspectorProgramDailyUseCase` com `now` = segunda-feira seguinte.
- *Fluxo:* o fixture cria a meta (Volume, 10, Weekly, $30) com `starts_at` na semana já fechada, porque o formulário não aceita início no passado; o spec cria **outra** meta pelo formulário só para provar o CRUD. AM faz login → menu Dashboard → "Goals & rewards" → "New goal" → salva → aba Rewards → escolhe a semana fechada → vê o inspetor com "Pending approval" e "Achieved $30.00" → "Approve" → "Approved". (A TASK-F08-6 estende o E2E: fatura do período aprovada e paga → o prêmio mostra "Paid" com o link da fatura.)
- *Também:* logado como CL_ADMIN, `/goals-rewards` mostra o acesso negado.

### Escopo / Passos
1. **Feature** `apps/web/src/features/inspector-program/`: `pages/GoalsRewardsPage.tsx`, `pages/GoalFormPage.tsx`; `components/GoalsTab.tsx`, `RewardsTab.tsx`, `GoalFilters.tsx`, `PeriodSelect.tsx` (dados da rota de períodos), `ProgramTotals.tsx`, `GoalSummaryTable.tsx`, `RewardAwardsTable.tsx`, `VoidAwardDialog.tsx`, `InspectorProgramSettingsSection.tsx`; `hooks/useGoals.ts`, `useGoal.ts`, `useSaveGoal.ts`, `useProgramPeriods.ts`, `useProgramSummary.ts`, `useRewardAwards.ts`, `useRewardAwardAction.ts`; `lib/goal-labels.ts`.
2. **Shared:** `packages/shared/src/lib/goal-copy.ts` com `describeGoal({ metric, target, scopeLabel })` (textos na seção UI; `scopeLabel: string | null`, fallback de escopo apagado — L-F08-13), consumido aqui, no PWA (TASK-F08-4) e no relatório (TASK-F08-5). `pnpm --filter @properfy/shared build`.
2b. **(L-F08-02/03/04/05)** Formulário: aviso de termos do próximo período, `pendingChange`, "Ends" ≥ `minEndsAt`, diálogo de reativação, aviso de metas sobrepostas (contagem no cliente a partir de `GET /goals?active=true&period=…`, sem rota nova). `VoidAwardDialog` com "Internal reason" e "Note to the inspector" (sem "Recovery note", Q12); "Void" só em `PENDING`/`APPROVED`.
3. **Status:** `REWARD_AWARD_STATUS_MAP` em `status-colors.ts` com tokens de status existentes (sem token novo).
4. **Menu:** filho `{ icon: 'mdi-trophy-outline', label: 'Goals & rewards', to: '/goals-rewards', roles: [UserRole.AM, UserRole.OP] }`, **último** filho do `submenu` Dashboard (ordem canônica do X01: Overview · Live Day · Inspector notices · Analytics · Workload · Inspector performance · Goals & rewards; DR6). Se um vizinho ainda não existir no merge, fica no fim mesmo assim.
4a. **Voltar (DR6):** `const BACK_TO = '/goals-rewards?tab=goals'` usado em `useGoBack(BACK_TO)` e `backTo={BACK_TO}`; a confirmação "Leave without saving?" usa `onBack={(goBack) => …}` do `PageHeader` (contrato do X01).
5. **Router:** 3 rotas com `AuthGuard [AM, OP]`.
6. **Settings:** `<InspectorProgramSettingsSection />` em `PlatformSettingsPage.tsx`.
7. **Coluna "Level" na F07:** na tabela do ranking da página "Inspector performance", coluna derivada no cliente com `resolveInspectorLevel(row.score, setting.levels)` e `INSPECTOR_LEVEL_LABELS`. Sem mudança no backend nem na resposta da F07.
8. **E2E:** spec + script de fixture.
9. **Doc (X00):** `apps/web/CLAUDE.md` — feature `inspector-program`, item de menu, "bônus pago pela fatura do inspetor (Q12, TASK-F08-6); sem pagamento manual", coluna de nível derivada no cliente.

### Modelo de dados
Nenhum.

### Contratos
Consome as rotas da TASK-F08-1, `GET/PUT /v1/platform-settings/inspectorProgram` (F03) e `GET /v1/dashboard/inspector-performance` (F07, sem mudança). Nenhuma rota nova.

### Algoritmos
- **`describeGoal`:** `VOLUME` "Complete {n} inspections"; `REGION_VOLUME` "{n} inspections in {scopeLabel}" (nulo: "{n} inspections in a deleted region"); `SERVICE_TYPE_VOLUME` "{n} {scopeLabel} inspections" (nulo: "{n} inspections of a deleted service type"); `INDEX_AT_LEAST` "Reliability index of at least {n}"; `PUNCTUALITY` "Arrive within the window at least {n}% of the time"; `GEOFENCE` "Check in and out on site at least {n}% of the time"; `NO_STUCK` "Finish without getting stuck at least {n}% of the time"; `SATISFACTION` "Tenant satisfaction of at least {n}%"; `LATE_NOTICE` "Warn ahead when running late at least {n}% of the time"; `CANT_DO_MAX` "Drop no more than {n}% of jobs".
- **Períodos:** sempre do backend (rota de períodos); o web não calcula períodos.

### UI

**`/goals-rewards`** — `PageHeader` "Goals & rewards", subtítulo "Set goals for inspectors and review the rewards they earn." Abas "Goals" | "Rewards".

**Aba Goals** — botão "New goal"; filtros Status / Metric / Period; colunas:

| Coluna | Conteúdo |
|---|---|
| Goal | título + `describeGoal` |
| Period | Weekly / Fortnightly / Monthly |
| Who | "All inspectors" · "Inspectors in {region}" · "Inspectors doing {type}" · nome do inspetor |
| Bonus | "$60.00" |
| Runs | "From Mon 2 Nov 2026" ou "Mon 2 Nov – Sun 29 Nov 2026" |
| Status | Active / Inactive |

Rótulos de métrica: Volume · Region volume · Service type volume · Reliability index · On-time arrival · On-site check-in · Finished without getting stuck · Tenant satisfaction · Late notice in advance · Can't-do rate.

**Formulário** — `PageHeader` "New goal" / "Edit goal" com `backTo`. Campos: Title · Metric · Target (unidade + "at least"/"at most") · Period · Region (só Region volume) · Service type (só Service type volume) · Inspector ("All eligible inspectors" padrão) · Bonus (AUD) · Starts · Ends · (edição) Status. Rodapé: "Bonuses are paid outside Properfy. Mark them as paid here once you've paid them." Botões "Create goal"/"Save", "Cancel"; "Deactivate goal"/"Reactivate goal". **(L-F08-02)** Edição de meta iniciada: "Changes to target and bonus apply from the next period." e, havendo, "From {EEE d MMM yyyy}: target {n}, bonus {$}." **(L-F08-04)** Aviso informativo: "Inspectors can earn this on top of {n} other active {weekly|fortnightly|monthly} goals."

**Aba Rewards** — Cycle, Period; tiles Promised (ajuda "The most you could pay if every eligible inspector reached every goal."), Achieved, Approved, Paid; tabela por meta; lista de prêmios: Inspector (nome + e-mail) · Goal · Result ("62 inspections", "96.4%") · Index at close · Level · Amount · Status ("Pending approval", "Approved", "Paid", "Voided") · Actions ("Approve" em `PENDING`; "Void" em `PENDING`/`APPROVED`). Diálogo "Void reward": "Internal reason" · "Note to the inspector (optional)" (L-F08-05). A coluna "Invoice" e o "Void" de faturado são da TASK-F08-6.

**Seção "Inspector program"** — "Levels" (Silver from [60], Gold from [85]; "Bronze is below Silver. Inspectors without enough jobs have no level."); "Early offer access" (switch, desligado; "When on, new offers for two or more days ahead are shown first to inspectors at or above the minimum level for [12] hours. It only applies when at least one of them can take the offer."; "Only offers published after you turn this on are affected. Changing the window applies to offers already published." (L-F08-08); quando ligado, "On since {d MMM yyyy, h:mm a}"; "Minimum level").

**"Inspector performance" (F07)** — coluna "Level" com o rótulo do nível; sem chip novo.

**Estados:** skeleton, vazio, erro com "Retry", 403 existente. **A11y (WCAG 2.1 AA):** abas por teclado; `<th scope>`; `aria-label` nas ações com o nome do inspetor ("Approve reward for Jane Doe"); diálogos com `aria-labelledby`; erros por `aria-describedby`; nada de id cru (memória `feedback_no_raw_ids_in_ui`).

### Casos de borda
1. Meta inativa aberta pela URL: editável, chip "Inactive".
2. Meta inexistente: "Goal not found" + "Back to goals".
3. Período sem metas: tiles zerados + "No goals ran in this period."
4. Prêmio alterado por outra pessoa com diálogo aberto: 409 → mensagem e recarga.
5. Período da URL inválido para o ciclo: volta ao corrente.
6. Valores em `Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })`.
7. Chave `inspectorProgram` ilegível na página da F07: coluna "–".
8. **(Q12)** Prêmio `APPROVED` antes da TASK-F08-6: fica "Approved" sem ação de pagamento; o tile Paid mostra $0.00.
10. **(L-F08-02)** Meta reativada com o período corrente pulado: Rewards mostra o período como "Skipped (goal inactive)"; o formulário mostra "Counts again from …".
11. **(L-F08-13)** Meta de região apagada: "Who" e `describeGoal` usam "a deleted region".

### Fora do escopo
Mudar `DashboardPage`, `AnalyticsPage`, `InspectorWorkloadPage` ou outras colunas da página da F07; aprovação em lote; exportação (TASK-F08-5); histórico de auditoria na página; lançamento financeiro, link da fatura e anular faturado (Q12, TASK-F08-6); pagamento manual (retirado).

### Critérios de aceite
1. **03.A4 (obrigatório por E2E, DV5):** o spec Playwright `inspector-program-rewards.spec.ts` passa: uma meta atingida e fechada pelo job aparece no painel Rewards do período, somada em "Achieved", e pode ser aprovada e marcada como paga.
2. **03.13:** prometido × atingido por período; aprovar (qualquer AM/OP); anular `PENDING`/`APPROVED` com motivo interno e nota opcional ao inspetor (L-F08-05); nenhum controle de pagamento manual (Q12; `PAID` e anular faturado na TASK-F08-6).
2a. **(L-F08-02/04)** O formulário avisa que alvo/bônus valem do próximo período, mostra a alteração pendente, não oferece fim antes do período corrente e avisa sobre metas cumulativas do mesmo ciclo.
3. **03.11 (coluna):** "Level" na página da F07, coerente com os limites configurados.
4. **03.A5:** toda escrita passa pelos endpoints auditados.
5. **Q18:** CL_* não veem item nem rotas (E2E + teste de router). **X01:** sub telas com `BackButton`, fallback acessível a AM e OP (P-b com OP) e menu no fim do grupo Dashboard, testado por rótulo sem mocks (DR6). **03.A3:** não se aplica (lista com nomes é AM/OP).

### Dependências
TASK-F08-1; X01; F03-4; F07-3.

### Riscos e armadilhas
- `api-types` desatualizado (memória `project_tenant_apitypes_openapi_drift`); typecheck incremental mente (memória `project_web_typecheck_incremental_cache_lies`).
- Datas: nunca o fuso do navegador; períodos vêm do backend.
- E2E: o fixture não pode ser exposto por HTTP nem rodar em produção.

### Deploy / rollout / rollback
- Front + script de E2E (fora do bundle do backend em produção: fica em `src/scripts`, não registrado em rota nem worker). Rollback: reverter o PR.

### Dias · Branch · Verificação
- **Dias:** 2,25 (**−0,25 em 2026-10-30**, Q12: sem diálogo "Mark as paid", sem "Paid on" em Sydney/L-F08-11, sem variante de "Void" para pago com "Recovery note") = 03.6/03.8 web 1,0 (lista, filtros, formulário, desativar, menu, router) + coluna "Level" na F07 0,25 + 03.13 web 0,85 (seletores, tiles, tabelas, 2 diálogos, seção de settings, E2E) + **lacunas 0,15** (L-F08-02 copy/pendente/reativação/"Ends"; L-F08-04 aviso; L-F08-05 nota; L-F08-08 "On since"; L-F08-13 `describeGoal`).
- **Branch:** `feat/f08-goals-rewards-web` a partir de `develop` (depois da TASK-F08-1), em worktree. ~34 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build`; `pnpm --filter web typecheck lint test`; `pnpm --filter web test:e2e -- inspector-program-rewards` com backend local (via subagente com resumo); QA no navegador (AM, OP, CL_ADMIN; memória `feedback_qa_must_test_in_browser`); `git diff --stat origin/develop... | tail -1` < 150. Screenshots nunca no commit.

---

## TASK-F08-4 · Backend + shared + PWA: "Challenges" em More, `GET /v1/inspector/program` e mensagens automáticas

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F08-1, TASK-F08-3, TASK-F02-1, TASK-F02-3, TASK-F04-3, TASK-F04-3b
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F08-5, TASK-F08-6 (merge **depois** da TASK-F08-6, para a copy de DL14 já ser verdade)
> - **Pista sugerida (time de 6):** C · PWA · ⚠️ **caminho crítico**: atraso aqui atrasa a entrega inteira

### Objetivo
- Endpoint do inspetor **`GET /v1/inspector/program`** (INSP, próprios dados): metas ativas com progresso, índice, nível, sequência, histórico de prêmios e **ranking anônimo** (03.A3) com coorte mínima de 5 (DV4).
- Tela PWA **"Challenges"** (`/profile/challenges`), tile no hub More (DL9), com abas **Active** (com "Starting soon", DL12), **My results**, **Ranking** (03.10/03.15). Layout do design v3; "Quality reports sent back" **não** é construído.
- Mensagens `PERFORMANCE_MESSAGE` (03.17) enviadas como **passos do run `MESSAGES` das 08:00** da fila `inspector-program.daily` (DL1): meta atingida (agregada por inspetor), mudança de nível (só sob a mesma versão de pesos e no máximo 1 a cada 7 dias, DL6), sequência em risco.
- `/profile/challenges` na allowlist da F02 (mesmo PR) e texto do passo 8 do tour.

### Contexto no código
- **Rota INSP:** `requireLinkedInspector` (`apps/backend/src/modules/inspector-execution/interfaces/inspector-execution.routes.ts:256-270`: 403 `FORBIDDEN` "Only inspectors can {action}"; 400 `INSPECTOR_NOT_LINKED`), helper local; a F08 replica o mesmo helper (mesmos códigos e mensagens).
- **PWA:** `apps/pwa/src/app/router.tsx` (filhas de `profile` com `ProfileLayout`, `:173-183`); `features/profile/pages/ProfilePage.tsx` (hub More, `ProfileTile`); feature `earnings` como modelo; voltar no master-detail (memória `project_pwa_back_nav_master_detail`); rolagem por painel (memória `project_pwa_two_pane_fillheight_scroll`); safe-area (memória `project_pwa_shell_ios_safe_area`).
- **F02:** `PublishSystemInspectorNoticeUseCase.execute({ type: 'PERFORMANCE_MESSAGE', inspectorIds, title (1–120), body (1–2000), dedupeKey (1–200), targetPath? })` → `{ noticeId, created }`, idempotente por `dedupeKey`, não crítico; `INSPECTOR_NOTICE_TARGET_PATTERNS`, `isAllowedInspectorNoticeTargetPath`, `resolveInspectorNoticeTargetPath` em `packages/shared/src/constants/inspector-notices.ts`.
- **F04-3b:** passo 8 do tour (`nav-more`): "Announcements, earnings, your profile and app settings.".
- **F07:** `getCurrentIndexes()`; `findLatestSnapshotDate()`, `findByDate(date)`; `settings_json { weights, minimumVolume, toleranceMinutes, volumeReference: { value, source, activeInspectors } }` por linha; o recálculo ao salvar pesos (`trigger 'SETTINGS_CHANGED'`) substitui as linhas do dia.
- **TASK-F08-1:** `InspectorProgramStandingService`, `RunInspectorProgramDailyUseCase` (passos), `ctx.createdAwardIds`, prêmios; **TASK-F08-3:** `describeGoal`.

### Decisões aplicáveis
D1 (Q12 ✅ decidida em 2026-10-30: bônus na próxima fatura; copy abaixo), D3, D4, D5, D7, D8, D9, D10 (2026-10-27); DV4 (2026-10-28); P7, P8, P11 (2026-10-28); DB1/DB7 da F04.

Das lacunas (2026-10-29):
- **DL1 (L-F08-01, 2026-10-29):** os 3 passos de mensagem têm `phase 'MESSAGES'` e rodam às 08:00 Sydney (run `{ trigger: 'MESSAGES' }` enfileirado pela TASK-F08-1). Meta atingida: um aviso por `(inspetor, periodEnd)` agregando todos os prêmios não anulados criados nas últimas 48 h para aquele fim de período; `dedupeKey` `program-goals-reached:<inspectorId>:<periodEnd>` (usa o fim, não o início do período, porque uma semana e uma quinzena podem começar no mesmo dia e fechar em dias diferentes — a chave por início faria a F02 descartar a segunda).
- **DL5 (L-F08-05, 2026-10-29):** `awards[]` traz `voidedAt` e `inspectorNote`; nunca `voidReason`.
- **DL6 (L-F08-06, 2026-10-29):** mensagem de nível suprimida se houve outra `program-level:<inspectorId>:*` nos últimos 7 dias.
- **DL7 (L-F08-07, 2026-10-29):** coorte do ranking = todos os ACTIVE com `SCORED` da plataforma; rodapé diz isso.
- **DL9 (L-F08-09, 2026-10-29):** `ProfileTile` "Challenges" logo depois de Earnings; Announcements (F02-3) continua `col-span-2` no fim.
- **DL12 (L-F08-12, 2026-10-29):** "Starting soon" (7 dias) e "Counts jobs since {periodStart}".
- **DL14 (L-F08-14, revista 2026-10-30):** copy do bônus somado à próxima fatura e visível em Earnings; chips "Pending review" / "Approved – on your next invoice" / "Paid" / "Voided". As linhas de bônus em Earnings e na fatura são da TASK-F08-6.

Da reconciliação (2026-10-29):
- **DR4 (L-F07-12, 2026-10-29):** a mensagem de nível lê só os snapshots `latest` e `latest − 1`; nenhuma leitura de histórico (retenção de 400 dias e expurgo de inspetor apagado na F07).
- **DR5 (N13, L-X00-03, 2026-10-29):** datas do app ("Mon 2 Nov", "Starts …", "Counts jobs since …") são civis de `PLATFORM_TIMEZONE` vindas do servidor; `generatedAt`, `paidAt`, `voidedAt` são instantes UTC; o PWA não usa `users.timezone` nem o fuso do aparelho para calcular nada.
- **DR7 (L-F02-06/07/08, 2026-10-29):** `/profile/challenges` como padrão estático exato (sem barra final); `PERFORMANCE_MESSAGE` arquivado pela F02 após 30 dias (nada da F08 depende dele depois disso); título e corpo sem dados sensíveis (aparecem na tela bloqueada).

### Testes primeiro (TDD)

**1. Shared — `inspector-notices.test.ts` (acréscimo)** — `'/profile/challenges'` permitido; `'/profile/challenges/x'`, `'/profile/challengesx'`, **(DR7, L-F02-08)** `'/profile/challenges/'` (barra final), `'/Profile/Challenges'` e `'/profile/challenges?tab=ranking'` não; o padrão é estático exato (sem segmento variável); destinos existentes inalterados.

**2. Shared — `inspector-program.test.ts` (acréscimo)** — `ranking.entries[]` é `.strict()` com exatamente `position`, `score`, `level`, `isMe`; objeto com `inspectorId` ou `name` falha.

**3. Backend — `get-inspector-program.use-case.test.ts`**
- resposta = standing + progresso + prêmios do inspetor (últimos 50, `period_end desc`) + ranking.
- `summary.openCashTotal` = soma de `rewardAmount` das metas ativas em que ele participa.
- **ranking** (fixtures da F07 + inspetores extras para formar a coorte): entradas = inspetores com `position ≠ null`, por `position` asc; **empates de score** ordenados por `sha256(snapshotDate + ':' + inspectorId)` asc — mesma ordem em duas chamadas do mesmo dia; ordem diferente (mas estável) com outro `snapshotDate`; inserção e nomes não influenciam (teste que inverte a ordem de inserção e troca nomes e compara);
- posições de competição da F07 preservadas (duas com `position 3`, a próxima `5`);
- **coorte mínima:** `totalRanked 4` → `entries: []`, `cohortTooSmall: true`, `myPosition` e `myScore` presentes; `totalRanked 5` → lista completa;
- não ranqueado → `myPosition null`, `notRankedReason 'NOT_ENOUGH_DATA'` ou `'NOT_COMPUTED'`;
- só metas em que ele participa aparecem em `activeGoals`.
- **(L-F08-12)** meta que começa em 5 dias → item com `state 'UPCOMING'`, `startsOn` = início, `value null`; não entra em `summary.openCashTotal`; meta que começa em 8 dias → fora.
- **(L-F08-05)** prêmio `VOID` com `inspector_note 'The job was cancelled by the agency.'` → `awards[i]` `{ status: 'VOID', voidedAt, inspectorNote: 'The job was cancelled by the agency.' }`; `JSON.stringify(body)` não contém o `void_reason` ("Agency X suspected fraud").

**4. Backend — contrato 03.A3 — `inspector-program-anonymity.routes.test.ts`** (Supertest; 6 inspetores com nomes, e-mails, telefones e ids conhecidos, todos `SCORED`)
- `GET /v1/inspector/program` como A: `JSON.stringify(body)` não contém nenhum id, nome, e-mail ou telefone dos outros 5; varredura recursiva: nenhuma chave `inspectorId`, `id`, `name`, `photoUrl`, `avatarUrl`, `email` ou `phone`; cada `entries[i]` tem só as 4 chaves.
- com 4 ranqueados: `entries` vazio.
- CL_ADMIN, CL_USER, AM, OP, TNT → 403; INSP sem `inspectorId` → 400 `INSPECTOR_NOT_LINKED`; sem token → 401.

**5. Backend — passos de mensagem — `program-message-steps.test.ts`**

| Gatilho | Entrada | Esperado |
|---|---|---|
| meta atingida (1 prêmio) | run `MESSAGES` às 08:00 de 9 nov; um prêmio `PENDING` de 30 criado às 04:45, semana 2–8 Nov | `publish({ type: 'PERFORMANCE_MESSAGE', inspectorIds: [id], title: 'Goal reached: Weekly volume', body: 'You reached "Weekly volume" for the week of Mon 2 Nov. Your $30.00 bonus will be reviewed and, once approved, added to your next invoice.', dedupeKey: 'program-goals-reached:<inspectorId>:2026-11-08', targetPath: '/profile/challenges' })` (L-F08-01, L-F08-14) |
| **(L-F08-01)** agregação | run `MESSAGES` de 16 nov; mesmo inspetor, 3 prêmios da semana 9–15 Nov (30 + 30 + 60) e 1 da quinzena 2–15 Nov (40), todos com `periodEnd 2026-11-15` | **um** `publish`: title `'You reached 4 goals'`, body `'You reached "Weekly volume", "On-time arrival", "Region volume" and "Fortnight volume". Your bonuses (total $160.00) will be reviewed and, once approved, added to your next invoice.'`, `dedupeKey 'program-goals-reached:<inspectorId>:2026-11-15'` |
| **(L-F08-01)** mesmo início, fins diferentes | prêmio semanal 2–8 Nov avisado em 9 nov; prêmio quinzenal 2–15 Nov em 16 nov | 2 avisos distintos (`…:2026-11-08` e `…:2026-11-15`); nenhum descartado como repetido |
| **(L-F08-01)** inspetores diferentes | 2 inspetores com prêmio no mesmo dia | 2 `publish`, um por inspetor |
| **(L-F08-01)** horário | run `SCHEDULED` das 04:45 | nenhum `publish` (os passos de mensagem não rodam fora do run `MESSAGES`) |
| recuperação | prêmio criado ontem sem aviso (run `MESSAGES` falhou) | republicado no run de hoje com o mesmo `dedupeKey` (varredura dos prêmios não anulados das últimas 48 h, agrupados por `(inspetor, periodEnd)`) |
| prêmio anulado antes das 08:00 | | fica fora da agregação; se todos foram anulados, nada é enviado |
| título longo | 118 caracteres | truncado em 120 com "…"; corpo truncado em 2000 com "…" se a lista for longa |
| subiu | snapshots de ontem 82 e hoje 86, **mesmos** pesos/`minimumVolume`/`toleranceMinutes`/`volumeReference.source` | "You're now Gold" / "Your reliability index is 86.0. Keep it up to stay at Gold.", dedupe `program-level:<id>:<hoje>` |
| desceu | 86 → 83, mesma versão | "You're now Silver" / "Your reliability index is 83.0. Reach 85.0 to get back to Gold." |
| **pesos mudaram** | ontem pesos todos 1; hoje (recálculo `SETTINGS_CHANGED` ou snapshot diário já com os pesos novos) `PUNCTUALITY: 3`; o nível muda | **nada**; log `inspector_program.level_messages_skipped { reason: 'WEIGHTS_CHANGED' }` |
| mediana mudou (dado, não peso) | `volumeReference.value` 9.5 → 10, mesma `source` | mensagem enviada (é mudança de dado) |
| **(L-F08-06)** oscilação na fronteira | ontem 84.9 → hoje 85.0, mas já houve `program-level:<id>:2026-11-06` (4 dias atrás) | nada; log `inspector_program.level_messages_skipped { reason: 'RECENT_MESSAGE' }` |
| **(L-F08-06)** depois de 7 dias | última `program-level:<id>:*` há 8 dias | mensagem enviada |
| **(L-F08-06)** janela exata | última há exatamente 7 × 24 h | enviada (`created_at < now − 7 d` não suprime; `≥` suprime) |
| sem nível ↔ nível | `null` → 70 ou 70 → `null` | nada |
| snapshot de hoje ausente | | nada + log `warn` |
| sequência em risco | ciclo semanal, hoje domingo, sequência 3, participa de meta semanal, nenhuma `MET_SO_FAR` | "Your 3-week streak is at risk" / "Today is the last day of the week. Reach any weekly goal to keep your streak going.", dedupe `program-streak-risk:<id>:<periodStart>` |
| sem risco | sequência 0, não é o último dia, já atingiu ou não participa | nada |
| repetição | job rodado 2× | a F02 devolve `created: false` |
| inspetor inativo | | nada |
| **(DR7, L-F02-07)** conteúdo | todos os casos acima | título e corpo só com título da meta, valores, datas, nível e sequência; nenhum id, nome de agência, endereço ou dado de inquilino (asserção por regex de UUID e pelos nomes das fixtures) |
| **(DR4)** histórico | qualquer caso de nível | o repositório de snapshots só recebe `findLatestSnapshotDate()` e `findByDate(latest)`/`findByDate(latest − 1)`; nunca `findForInspectorBetween` |

**6. Backend — job** — **(L-F08-01)** com `trigger 'SCHEDULED'`/`'STARTUP'`, `RunInspectorProgramDailyUseCase` roda só a fase `COMPUTE` (`closeGoalPeriods` → `scheduleMessagesRun`); com `trigger 'MESSAGES'`, só a fase `MESSAGES` na ordem `sendGoalReachedMessages` → `sendLevelChangeMessages` → `sendStreakRiskMessages`; a falha de um passo de mensagem é logada e não impede os demais; **nenhuma fila nova e nenhum `boss.schedule` novo** (só `inspector-program.daily`).

**7. PWA — `apps/pwa/src/features/challenges/pages/__tests__/ChallengesPage.test.tsx`** (Vitest + RTL + MSW)
- abre em **Active**; `?tab=results`/`?tab=ranking`; troca com `replace`.
- **Active:** card por meta com título, "$60", `describeGoal`, progresso e prazo; barra só em volume (`role="progressbar"`, `aria-valuenow 47`, `aria-valuemax 60`, `aria-valuetext "47 of 60 inspections"`); textos dos 5 estados.
- **(L-F08-12)** item `UPCOMING` com `startsOn '2026-11-16'` → seção "Starting soon" abaixo das ativas, card sem barra com "Starts Mon 16 Nov"; sem itens `UPCOMING` → seção ausente; `countsSince '2026-11-09'` → "Counts jobs since Mon 9 Nov" na descrição.
- **(L-F08-14)** rodapé de Active e de My results: "Bonuses are reviewed by the Properfy team. Once approved, they're added to your next invoice and show in Earnings."
- **My results:** índice "88.3" ou "Not enough data yet"; nível "Gold" ou "No level yet"; sequência "3 weeks in a row" e aviso de risco; histórico com chips.
- **(L-F08-05)** prêmio `VOID` com `inspectorNote` → chip "Voided" + nota abaixo; sem nota → "Contact the Properfy team for details."
- **Ranking:** "You're #4 of 37"; **(L-F08-07)** rodapé "Ranked against all active inspectors on the platform. Other inspectors are shown without names. Updated daily."; `<ol>` "#1 · 96.4 · Gold"; linha própria com "You" e `aria-label "Your position: 4 of 37, score 88.3"`; empates com a mesma posição; **coorte < 5** → só o cartão próprio + "The ranking appears once at least 5 inspectors have a score."; não ranqueado → "You're not ranked yet" + "You'll appear once you have 10 jobs in the last 30 days."; **nenhum nome renderizado**.
- vazio: "No active challenges right now. New ones will show up here."; erro: "Couldn't load your challenges." + "Try again"; offline com cache: "You're offline. Showing your last update."
- **More (L-F08-09):** `ProfileTile` "Challenges" (ícone de troféu) com `value` "Up to $110 in bonuses" / "See your goals and ranking" → `/profile/challenges`; na grade, é o 2º tile (logo depois de Earnings: ordem Earnings, Challenges, Availability, Documents, My account); o tile "Announcements" da F02-3 continua `col-span-2` no fim; nenhum título de grupo novo.
- **Voltar:** para `/profile`, inclusive com link direto.
- **Tour:** passo 8 com o texto novo. `nav-clearance-contract.test.ts` verde sem alteração.

### Escopo / Passos
1. **Shared:** `inspectorProgramResponseSchema` (+ tipos); `'/profile/challenges'` em `INSPECTOR_NOTICE_TARGET_PATTERNS` como padrão **estático exato** (sem barra final, casado pelo algoritmo de L-F02-08; DR7) e `INSPECTOR_CHALLENGES_PATH`. `pnpm --filter @properfy/shared build`.
2. **Backend — use case** `get-inspector-program.use-case.ts` (standing, progresso, prêmios, ranking anônimo com hash e coorte; constante `RANKING_MINIMUM_COHORT = 5`).
3. **Backend — rota** `GET /v1/inspector/program` com `requireLinkedInspector` local e `schema.response 200`.
4. **Backend — passos de mensagem** `application/program-messages.ts` (montagem de título/corpo/dedupe, agregação por `(inspetor, periodEnd)`, datas em Sydney "Mon 2 Nov"), `send-goal-reached-messages.step.ts` (lê os prêmios não anulados com `created_at ≥ now − 48 h`; não depende de `ctx.createdAwardIds`, que é de outro run — L-F08-01), `send-level-change-messages.step.ts` (compara `weightsVersion`; guarda de 7 dias — L-F08-06), `send-streak-risk-messages.step.ts`; registrar os 3 passos com `phase 'MESSAGES'` no `RunInspectorProgramDailyUseCase`. Sem fila, worker, agendamento ou assinante novo.
4a. **(L-F08-06) Guarda de 7 dias:** porta `IRecentProgramNoticeReader.hasRecentNotice(dedupeKeyPrefix, since)` no inspector-program, implementada sobre a leitura que a F02 expõe para avisos de sistema por prefixo de `dedupe_key` (ver "Ajustes necessários em outras tarefas"); nunca consultar `inspector_notices` direto deste módulo. Uma consulta por inspetor com mudança de nível candidata (poucos por dia).
5. **PWA — feature** `apps/pwa/src/features/challenges/`: `pages/ChallengesPage.tsx`; `components/ActiveGoalsTab.tsx` (com seção "Starting soon", L-F08-12), `MyResultsTab.tsx`, `RankingTab.tsx`, `GoalProgressCard.tsx`, `UpcomingGoalCard.tsx`, `RewardStatusChip.tsx` (nota do inspetor no `VOID`, L-F08-05), `StandingCards.tsx`; `hooks/useInspectorProgram.ts` (React Query, `staleTime 60_000`); `lib/challenge-copy.ts` (rodapés de L-F08-07/14).
6. **PWA — rota** `{ path: 'challenges', element: lazyElement(ChallengesPage) }` em `profile`; **(L-F08-09)** `ProfileTile` "Challenges" (`label "Challenges"`, `value` = "Up to {openCashTotal} in bonuses" / "See your goals and ranking", `to="/profile/challenges"`, ícone de troféu do lucide) inserido **imediatamente depois** do tile Earnings em `ProfilePage.tsx` (grade `grid-cols-2`, `:74-97` no snapshot); Announcements (F02-3) continua `col-span-2` no fim; nenhum grupo/título novo. O `value` lê `summary.openCashTotal` do mesmo `useInspectorProgram` (só quando o tile está visível; erro/offline → "See your goals and ranking").
7. **PWA — tour:** passo 8 = "Announcements, challenges, earnings, your profile and app settings."
8. **OpenAPI:** regenerar.
9. **Doc (X00):** `apps/pwa/CLAUDE.md` (feature `challenges`, ranking anônimo com coorte da plataforma inteira, coorte mínima, nenhum dado de outro inspetor no cliente, tile no hub); `apps/backend/CLAUDE.md` (rota INSP, passos de mensagem no run das 08:00, agregação e dedupe por `periodEnd`, regra da versão de pesos, guarda de 7 dias); `packages/shared/CLAUDE.md` (destino novo).

### Modelo de dados
Nenhuma tabela nova. Lê as tabelas da TASK-F08-1 e os snapshots da F07; escreve só pela F02. Sem `tenant_id` (D12; exceção repetida na spec).

### Contratos

**`GET /v1/inspector/program`** — INSP (`inspector_program.view_own`), `requireLinkedInspector`; sem query; leitura.

```ts
{
  generatedAt: string; timezone: 'Australia/Sydney';
  summary: { openCashTotal: number; currency: 'AUD' };
  activeGoals: Array<{
    goalId: string; title: string; description: string;
    metric: GoalMetric; comparator: GoalComparator; target: number;
    periodType: BillingPeriodType; periodStart: string; periodEnd: string; daysLeft: number;
    rewardAmount: number; value: number | null; serviceCount: number; minimumServices: number | null;
    state: 'MET_SO_FAR' | 'IN_PROGRESS' | 'BELOW_TARGET' | 'NOT_ENOUGH_SERVICES' | 'NO_DATA' | 'UPCOMING'; // UPCOMING: L-F08-12
    startsOn: string | null;     // L-F08-12: início do período em UPCOMING; null nos demais
    countsSince: string | null;  // L-F08-12: periodStart quando a meta foi criada depois do início do período
  }>;
  standing: {
    index: { score: number | null; status: 'SCORED' | 'INSUFFICIENT_VOLUME' | 'NO_WEIGHTED_DATA' | 'NOT_COMPUTED'; snapshotDate: string | null };
    level: InspectorLevel | null;
    streak: { cycle: BillingPeriodType | null; count: number; atRisk: boolean };
  };
  awards: Array<{ goalTitle: string; metric: GoalMetric; periodType: BillingPeriodType; periodStart: string; periodEnd: string;
                  amount: number; achievedValue: number; status: RewardAwardStatus; paidAt: string | null;
                  voidedAt: string | null; inspectorNote: string | null }>; // L-F08-05: nunca voidReason; paidAt = paid_at da fatura (TASK-F08-6)
  ranking: {
    myPosition: number | null; myScore: number | null; totalRanked: number;
    notRankedReason: 'NOT_ENOUGH_DATA' | 'NOT_COMPUTED' | null;
    cohortTooSmall: boolean;
    entries: Array<{ position: number; score: number; level: InspectorLevel | null; isMe: boolean }>; // .strict(); vazio quando cohortTooSmall
  };
}
```
- **Erros:** 401; 403 `FORBIDDEN` (não-INSP, inclusive AM/OP); 400 `INSPECTOR_NOT_LINKED`.
- **03.A3:** `entries` nunca tem id, nome, foto, e-mail ou telefone; nenhum campo descreve outro inspetor.
- `summary.openCashTotal` soma só itens com período corrente (não `UPCOMING`), sem teto (L-F08-04).
- **Mensagens (interno):** `PERFORMANCE_MESSAGE`, `targetPath '/profile/challenges'`, enviadas no run `MESSAGES` das **08:00 Sydney** (L-F08-01); `dedupeKey`s `program-goals-reached:<inspectorId>:<periodEnd>` (agregado por inspetor e fim de período, L-F08-01), `program-level:<inspectorId>:<snapshotDate>` (no máximo 1 a cada 7 dias por inspetor, L-F08-06), `program-streak-risk:<inspectorId>:<periodStart>`.
- **Conteúdo e retenção (DR7):** título e corpo aparecem na tela bloqueada (D23 da F02): só título da meta, valores, datas, nível e sequência; nunca id, nome de agência, endereço ou dado de inquilino. Os avisos são de sistema e a F02 os arquiva após 30 dias; "My results" não depende deles (lê `reward_awards`).
- **Copy das mensagens:** 1 prêmio — title "Goal reached: {title}", body "You reached "{title}" for {period text}. Your {amount} bonus will be reviewed and, once approved, added to your next invoice."; n > 1 — title "You reached {n} goals", body "You reached "{t1}", "{t2}" and "{tn}". Your bonuses (total {sum}) will be reviewed and, once approved, added to your next invoice." (L-F08-01, L-F08-14 revista por Q12).

### Algoritmos
- **Ranking anônimo:** **(L-F08-07)** a coorte é a **plataforma inteira** (todos os ACTIVE com `SCORED`, `position` da F07), nunca recortada por região, tipo de serviço ou metas; `indexes = getCurrentIndexes()` sem filtro; `ranked = [...indexes].filter(position ≠ null)`; ordenar por `position` asc, depois `sha256(snapshotDate + ':' + inspectorId)` asc (estável no dia, sem nome nem ordem de inserção); mapear para `{ position, score, level, isMe }` descartando o id. `totalRanked < 5` → `entries = []`, `cohortTooSmall = true`.
- **Meta atingida (L-F08-01):** no run `MESSAGES` (08:00): prêmios não `VOID` com `created_at ≥ now − 48 h` de inspetores ACTIVE, agrupados por `(inspectorId, periodEnd)`; um `publish` por grupo (1 prêmio → copy individual; n > 1 → copy agregada, títulos na ordem P9 do prêmio, total somado). O `dedupeKey` por `(inspetor, periodEnd)` faz a recuperação do dia seguinte não duplicar. Limitação aceita: um prêmio criado num catch-up **depois** de o grupo já ter sido avisado não gera novo aviso (aparece em "My results").
- **Mudança de nível:** `latest = findLatestSnapshotDate()`; `latest ≠ hoje` → pula; `prev = findByDate(latest − 1)`. `weightsVersion(row) = hash(settings_json.weights, settings_json.minimumVolume, settings_json.toleranceMinutes, settings_json.volumeReference.source)`. Para cada inspetor ACTIVE com score nos dois dias: se `weightsVersion(prev) ≠ weightsVersion(latest)` → pula (a mudança veio de um recálculo de pesos); senão, níveis pelos limites atuais; mudança entre níveis não nulos → **(L-F08-06)** se `hasRecentNotice('program-level:' + inspectorId + ':', now − 7 d)` → pula com log `RECENT_MESSAGE`; senão, mensagem. Nível e acesso antecipado continuam sem histerese (D3).
- **Sequência em risco:** para cada inspetor ACTIVE com `streak.count ≥ 1`: `period = getCanonicalPeriod(streak.cycle, hoje)`; hoje = `period.periodEnd`, participa de ≥ 1 meta ativa do ciclo e nenhuma `MET_SO_FAR` (`getActiveGoalProgressForMany`, uma passada) → mensagem. Roda às **08:00** do último dia (L-F08-01).
- **Textos de período:** "the week of Mon 2 Nov", "the fortnight of Mon 2 Nov", "November"; sequência "{n}-week" / "{n}-fortnight" / "{n}-month".

### UI

**Tile em More (L-F08-09):** `ProfileTile` "Challenges", 2º da grade (depois de Earnings); `value` "Up to {openCashTotal} in bonuses" se > 0, senão "See your goals and ranking". Sem grupo "Work" (o hub é uma grade de tiles, não lista agrupada).

**`/profile/challenges`** — TopBar "Challenges" com voltar; abas "Active" · "My results" · "Ranking" (`role="tablist"`, setas).

*Active* (ordem: menor `daysLeft`, depois maior bônus):

| Elemento | Texto |
|---|---|
| Título + bônus | "{title}" · "$60" (sem centavos quando inteiro) |
| Descrição | `describeGoal` |
| Progresso | volume "47 of 60"; taxa "96% so far" (`CANT_DO_MAX` "3% so far"; `LATE_NOTICE` sem atrasos: "No late arrivals so far"); índice "Index 82.4 so far"; `NOT_ENOUGH_SERVICES` "{n} of 10 jobs to qualify"; `NO_DATA` "No data yet" |
| Situação | volume `MET_SO_FAR` "Target reached"; taxa/índice `MET_SO_FAR` "On track"; senão "{n} days left" / "1 day left" / "Last day"; `BELOW_TARGET` + "Target {target}%" |
| Descrição extra (L-F08-12) | meta criada depois do início do período: "Counts jobs since {EEE d MMM}" |
| Rodapé (L-F08-14) | "Bonuses are reviewed by the Properfy team. Once approved, they're added to your next invoice and show in Earnings." |

*Starting soon* (L-F08-12; só quando há itens `UPCOMING`; depois das ativas, ordem por `startsOn`): card com título, bônus, `describeGoal` e "Starts {EEE d MMM}"; sem barra nem progresso.

*My results* — cartões **Reliability index** ("88.3" / "Not enough data yet"; "Based on your last 30 days. You need 10 jobs for a score."), **Level** ("Gold" / "No level yet"), **Streak** ("3 weeks in a row" / "No streak yet"; em risco "Reach a weekly goal today to keep it."). Lista "Rewards": título, "Week of Mon 2 Nov", valor, chip "Pending review" / "Approved – on your next invoice" / "Paid" / "Voided" (texto + cor; DL14 revista por Q12); **(L-F08-05)** em "Voided", abaixo do chip, a `inspectorNote` ou "Contact the Properfy team for details.". Vazio: "No rewards yet. Reach a goal to earn one." Rodapé igual ao de Active (L-F08-14).

*Ranking* — "You're #4 of 37" (ou "You're not ranked yet" + ajuda); `<ol>` "#", score, nível; linha própria "You"; coorte < 5: só o cartão "Your score: 88.3" + "The ranking appears once at least 5 inspectors have a score."; rodapé **(L-F08-07)** "Ranked against all active inspectors on the platform. Other inspectors are shown without names. Updated daily."

**Estados:** skeleton, erro com "Try again", offline com cache, vazio por aba, `INSPECTOR_NOT_LINKED` (tratamento global). **A11y:** alvos ≥ 44 px; `progressbar` com `aria-valuetext`; status por texto; foco visível; `prefers-reduced-motion`.

### Casos de borda
1. Inspetor sem meta em que participe: Active vazio; o resto normal.
2. Meta criada hoje: progresso desde o início do período, com "Counts jobs since {periodStart}" (L-F08-12).
3. Meta desativada no meio do período: some na próxima leitura. Reativada: aparece em "Starting soon" se o próximo período começa em até 7 dias (L-F08-02/12).
3a. **(L-F08-12)** Meta que começa daqui a mais de 7 dias: invisível até entrar na janela; nenhuma mensagem de "meta nova".
3b. **(L-F08-01)** Inspetor com 4 prêmios no mesmo fechamento: 1 push às 08:00 ("You reached 4 goals"), não 4 às 04:45.
3c. **(L-F08-06)** Índice oscilando 84.9 ↔ 85.0: no máximo 1 mensagem de nível por 7 dias; o nível exibido e o acesso antecipado seguem o índice do dia (D3).
3d. **(L-F08-05)** Prêmio anulado sem nota: "Contact the Properfy team for details."; o motivo interno nunca chega ao app.
4. Score `null` ou `NOT_COMPUTED`: sem nível, sem posição ("Your index will appear tomorrow." no `NOT_COMPUTED`).
5. Exatamente 5 ranqueados: lista completa; 4: só o próprio.
6. Empates: mesma posição; ordem entre eles pelo hash do dia.
7. Toque no push: o SW abre `/profile/challenges`; cliente antigo cai no fallback da F02.
7a. **(DR7)** Aviso de meta atingida com mais de 30 dias: arquivado pela F02; o prêmio continua em "My results".
8. Limites de nível alterados: sem rajada (limites atuais nos dois lados); pesos alterados: sem mensagem naquele par de dias.
9. Várias metas semanais com uma já atingida: sem aviso de risco.

### Fora do escopo
"Quality reports sent back", badges, "Help and support"; nomes/fotos/ids no ranking; distância até o próximo nível; selo de acesso antecipado; mensagens críticas/SMS; filas, agendamentos ou jobs novos; mudanças em Earnings (as linhas de bônus são da TASK-F08-6) ou na caixa de avisos; ranking por região (L-F08-07); mensagem de "meta nova" (L-F08-12) e de prêmio pago/anulado (L-F08-05, estacionamento).

### Critérios de aceite
1. **03.A3:** o ranking mostra a própria posição e as pontuações dos outros sem identificação — teste de contrato (ausência de nome e id), teste de componente (sem nomes), desempate estável por hash e coorte mínima de 5.
2. **03.10/03.15:** metas com progresso, bônus e prazo; índice, nível, sequência e histórico com status.
3. **03.17:** as 3 mensagens chegam como `PERFORMANCE_MESSAGE`, sem duplicata, **às 08:00 Sydney** (nunca no run das 04:45), com prêmios do mesmo inspetor e fim de período agregados num aviso; nenhuma mudança de nível é avisada quando os pesos mudaram entre os dois snapshots nem mais de 1 vez a cada 7 dias (L-F08-01, L-F08-06).
3a. **(L-F08-05/07/09/12/14)** "Voided" mostra só a nota ao inspetor; o rodapé do ranking declara a coorte da plataforma; Challenges é um tile depois de Earnings; "Starting soon" lista metas dos próximos 7 dias; o app diz que o bônus aprovado entra na próxima fatura e aparece em Earnings (Q12).
4. **03.A4 (PWA):** o prêmio criado pelo fechamento aparece em "My results" como "Pending review".
5. **03.A5:** nenhuma escrita fora da F02 (que audita os avisos). **Q18:** CL_* e AM/OP → 403 no endpoint do inspetor.

### Dependências
TASK-F08-1, TASK-F08-3; F02-1, F02-3; F04-3, F04-3b.

### Riscos e armadilhas
- Vazamento pelo serializer: `.strict()` + teste de substring; nunca serializar o `Map` direto.
- Allowlist esquecida: teste 1 trava.
- Custo do endpoint: 1 `computeAll` por `(período, escopo)` das metas dele (7 consultas cada); alvo p95 < 800 ms em staging; `staleTime` 60 s.
- Ordem dos passos: as mensagens rodam no run `MESSAGES` (08:00), depois do fechamento das 04:45 e do snapshot das 04:15; se o run das 04:45 falhar, o das 08:00 não é enfileirado e a varredura de 48 h do dia seguinte recupera (L-F08-01).
- Porta da F02 para a guarda de 7 dias: sem ela a TASK-F08-4 não fecha (dependência listada em "Ajustes necessários em outras tarefas").
- Gate do PWA: Vitest + RTL + QA manual (DB9 da F04).

### Deploy / rollout / rollback
- Sem migration. Backend e PWA no mesmo release.
- **Rollout (L-F08-01):** o primeiro push de meta atingida chega às 08:00 da segunda-feira seguinte ao primeiro fechamento; avisar a OP desse horário no onboarding.
- **Rollback:** `INSPECTOR_PROGRAM_JOBS_ENABLED=false` (desliga fechamento e mensagens juntos) ou reverter os passos; reverter o PWA esconde o tile.
- **Observabilidade:** `inspector_program.messages_sent { step, created, deduped, aggregatedAwards }`, `inspector_program.level_messages_skipped { reason: 'WEIGHTS_CHANGED' | 'RECENT_MESSAGE' }`, falhas por passo.

### Dias · Branch · Verificação
- **Dias:** 3,5 = 03.10/03.15 2,5 (endpoint, schema, ranking com hash e coorte, contrato 03.A3 0,75; tela com 3 abas, estados, a11y, More, rota, tour 1,75) + 03.17 0,5 (3 passos no job diário, dedupe, versão de pesos, allowlist) + **lacunas 0,5** (L-F08-01 fase `MESSAGES` e agregação 0,2; L-F08-06 guarda de 7 dias 0,1; L-F08-12 "Starting soon" e "Counts jobs since" 0,15; L-F08-05/07/09/14 copy e tile 0,05).
- **Branch:** `feat/f08-challenges-pwa` a partir de `develop` (depois das TASK-F08-1 e F08-3), em worktree. ~38 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `test:integration` (4) via subagente; `generate:openapi` + `generate:types`; `pnpm --filter pwa typecheck lint test`; QA manual no iOS Simulator e Android/Chrome instalado; `git diff --stat origin/develop... | tail -1` < 150.

---

## TASK-F08-5 · Backend + shared + web: relatório `INSPECTOR_PROGRAM` (03.14)

> **Dependências de execução** (2026-10-29 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F08-1, TASK-F08-3, TASK-F08-6 (colunas `reward_awards.inspector_invoice_id` e `financial_entries.reward_award_id`)
> - **Desbloqueia:** — (fim de cadeia)
> - **Pode rodar em paralelo com:** TASK-F08-4
> - **Pista sugerida (time de 6):** D · Web

### Objetivo
- `ReportType` **`INSPECTOR_PROGRAM`** no fluxo de relatórios existente, **só AM/OP**, com metas, prêmios, o índice no fechamento e, por prêmio, a referência do lançamento e da fatura do bônus (Q12, TASK-F08-6).
- Os **10 lugares** do plano e os **2** que o código também exige.

### Contexto no código (os lugares)

| # | Lugar | Arquivo | Mudança |
|---|---|---|---|
| 1 | Enum Prisma + migration | `apps/backend/prisma/schema.prisma:1380-1385` | `INSPECTOR_PROGRAM`; migration `YYYYMMDDhhmmss_report_type_inspector_program` com `ALTER TYPE "ReportType" ADD VALUE 'INSPECTOR_PROGRAM';` |
| 2 | Enum shared | `packages/shared/src/enums/misc.ts:27-32` | `INSPECTOR_PROGRAM: 'INSPECTOR_PROGRAM'` |
| 3 | Período máximo | `apps/backend/src/modules/report/domain/report.constants.ts:5-10` | `INSPECTOR_PROGRAM: 12` |
| 4 | Colunas | `report.constants.ts:104-109` (`REPORT_COLUMNS`) | `INSPECTOR_PROGRAM_COLUMNS` |
| 5 | Tipos de agência | `apps/backend/src/modules/report/application/report-access.ts:15` | **não** incluir; comentário + teste |
| 6 | Switch do job | `process-report-job.use-case.ts:80-95` | `case 'INSPECTOR_PROGRAM'` → `getInspectorProgramRows` |
| 7 | Porta | `apps/backend/src/modules/report/domain/report-data-reader.ts` | `getInspectorProgramRows(filters)` |
| 8 | Implementação | `apps/backend/src/modules/report/infrastructure/prisma-report-data-reader.ts` | consulta abaixo |
| 9 | Mapa web | `apps/web/src/lib/status-colors.ts:144-149` (`REPORT_TYPE_MAP`) | `label: 'Inspector program'`, `bg: 'var(--color-report-type-inspector-program)'` |
| 10 | Token CSS + api-types | `apps/web/src/styles/tokens.css:105-108`; `packages/shared/openapi.json`, `api-types.ts` | `--color-report-type-inspector-program: #FFF9C4;` (contraste ≥ 4.5:1 com o texto); regenerar os tipos. **Sem relatório de exemplo no seed.** |
| +1 | Pedido | `request-report.use-case.ts:48-62` | `dateAxisField = 'period_end'` (como o `'effective_at'` do FINANCIAL) e tenant forçado a `null` |
| +2 | Diálogo web | `apps/web/src/features/reports/components/GenerateReportDialog.tsx:29-32,82-83,189-200` | excluir `INSPECTOR_PROGRAM` de `AGENCY_REPORT_TYPE_OPTIONS` (hoje só exclui `AGENCIES`) e esconder Agency, Branch, Suburb, Status, Date axis e "Group properties" quando escolhido |

- `ReportTypeChip` e `ReportFilters` derivam de `REPORT_TYPE_MAP`.
- XLSX: `generate(columns, rows)` (uma planilha).
- Testes que listam os tipos: `packages/shared/src/schemas/report.test.ts:187`, `request-report.use-case.test.ts`, `process-report-job.use-case.test.ts`, `GenerateReportDialog.test.tsx`.

### Decisões aplicáveis
D8, D11, D12 (2026-10-27); P9, P10 (2026-10-28). D1/Q12 ✅ decidida em 2026-10-30: o relatório mostra a fatura do bônus e o status do lançamento (não há pagamento manual nem referência de pagamento).
- **DR5 (N13, L-X00-03, 2026-10-29):** instantes (`Approved at`, `Paid at`, `Voided at`) no fuso do solicitante, como o fluxo de relatórios já faz (só exibição); datas civis (`Period start/end`, `Achieved on`) como gravadas (`PLATFORM_TIMEZONE` para períodos; agência para `Achieved on`).

Das lacunas (2026-10-29):
- **DL2 (L-F08-02, 2026-10-29):** fechamentos `SKIPPED_INACTIVE` viram uma linha "Skipped (goal inactive)" (o buraco fica visível).
- **DL3 (L-F08-03, revista 2026-10-30):** coluna "Voided after invoicing" (Yes/No); sem "Recovery note" (a recuperação é a reversão no ledger, coluna "Reversal invoice").
- **DL5 (L-F08-05, 2026-10-29):** coluna "Inspector note" ao lado de "Void reason" (interno).
- **DL13 (L-F08-13, 2026-10-29):** "Scope" e "Goal description" usam `scope_label` da fotografia (prêmio; na linha sem prêmio, do fechamento).

### Testes primeiro (TDD)
1. **Shared `report.test.ts`:** aceita `INSPECTOR_PROGRAM`; laço com 5 tipos.
2. **`request-report.use-case.test.ts`:** AM/OP → `tenantId null`, `agencyScoped false`, `dateAxisField 'period_end'`, mesmo com `filters.tenantId`; CL_ADMIN/CL_USER → `ReportForbiddenError` "Agencies cannot generate the INSPECTOR_PROGRAM report"; > 12 meses → `ReportDateRangeExceededError(12)`.
3. **`process-report-job.use-case.test.ts`:** despacha para `getInspectorProgramRows`; colunas certas; vazio → só cabeçalho, `READY`, `rowCount 0`.
4. **`prisma-report-data-reader.integration.test.ts`** (2 metas, 3 fechamentos, prêmios em todos os status, um fechamento sem atingentes): uma linha por prêmio dos fechamentos com `period_end` no intervalo + uma por fechamento sem prêmio; ordem `period_start`, título, P9; instantes no fuso do solicitante; datas civis `YYYY-MM-DD`; fora do intervalo não entra; nenhuma coluna de agência, endereço ou coordenada.
   - **(L-F08-02)** fechamento `SKIPPED_INACTIVE` → uma linha com Status "Skipped (goal inactive)", Participants 0, Promised 0.00, colunas de inspetor vazias.
   - **(L-F08-03/Q12)** prêmio `PAID` na fatura 42 → "Invoice" `PINV-000042` (formato de `invoiceNumberDisplay`), "Ledger status" `Approved`, "Paid at" = `paid_at` da fatura; prêmio `APPROVED` sem fatura → "Invoice" vazio, "Ledger status" `Approved`; prêmio `VOID` anulado antes de faturar → "Ledger status" `Voided`, "Voided after invoicing" `No`; prêmio `VOID` anulado depois de pago, com reversão na fatura 57 → "Voided after invoicing" `Yes`, "Paid at" mantido, "Reversal invoice" `PINV-000057` (vazio enquanto a reversão não foi faturada); `PENDING` → colunas de lançamento vazias. Nenhuma coluna mostra id cru (memória `feedback_no_raw_ids_in_ui`).
   - **(L-F08-05)** "Void reason" e "Inspector note" em colunas separadas.
   - **(L-F08-13)** meta `REGION_VOLUME` cuja região foi apagada depois do fechamento (`scope_region_id` nulo, `scope_label 'Sydney North'` na fotografia) → "Scope" `Sydney North` e "Goal description" "9 inspections in Sydney North"; fotografia com `scope_label` nulo → "a deleted region".
5. **`GenerateReportDialog.test.tsx`:** AM/OP veem "Inspector program", CL_* não; escolhido, os campos de agência somem e o envio leva só `fromDate`/`toDate`; `REPORT_TYPE_MAP` com 5 chaves.

### Escopo / Passos
1. Os 12 lugares, nesta ordem: shared (2) → `pnpm --filter @properfy/shared build` → Prisma (1) + `prisma generate` → backend (3–8, +1) → web (9, 10, +2) → `generate:openapi` + `generate:types`.
2. `INSPECTOR_PROGRAM_COLUMNS` (lista em UI).
3. Leitor com Prisma (`goal_period_closures` + `inspector_goals` + `reward_awards` + `inspectors` + `users` + `financial_entries` por `reward_award_id` e a reversão por `reference_entry_id` + `inspector_invoices` por `reward_awards.inspector_invoice_id`/snapshot), sem `$queryRaw`.
4. **Doc (X00):** `apps/backend/CLAUDE.md` — "adicionar um `ReportType` mexe em 12 lugares" (tabela acima).

### Modelo de dados
Só o valor novo do enum (migration expand; o valor não é usado na mesma transação). Relatórios com `tenant_id NULL`, `agency_scoped false`, pasta `reports/platform/INSPECTOR_PROGRAM/<id>.xlsx`.

### Contratos
`POST /v1/reports` com `{ reportType: 'INSPECTOR_PROGRAM', filters: { fromDate, toDate } }` — AM/OP 201; CL_* 403 (erro existente). Lista, status e download sem mudança. INSP/TNT sem acesso a relatórios.

### Algoritmos
- `closures` com `period_end` em `[from, to]`, com a meta e os nomes do escopo; `awards` desses fechamentos com inspetor e usuários.
- Por fechamento: prêmios em ordem P9, uma linha cada; sem prêmios → uma linha "sem atingentes"; `trigger 'SKIPPED_INACTIVE'` → uma linha "Skipped (goal inactive)" (L-F08-02).
- `Per winner` = `amount` do prêmio (fotografia) ou, na linha sem atingentes, o valor vigente no período (`goalTermsForPeriod`, L-F08-02; vazio na linha pulada); `Promised` = `promised_amount` do fechamento.
- `Scope`/`Goal description` = `scope_label` do prêmio ou do fechamento (L-F08-13), passado a `describeGoal({ metric, target, scopeLabel })`.
- `Voided after invoicing` = `status = 'VOID' AND inspector_invoice_id IS NOT NULL` (L-F08-03 revista; o vínculo é gravado no fechamento da fatura, TASK-F08-6).
- `Invoice` = `invoiceNumberDisplay` da fatura de `inspector_invoice_id`; `Ledger status` = status do lançamento `INSPECTOR_BONUS` (`reward_award_id`); `Reversal invoice` = fatura `CLOSED`/`PAID` cujo snapshot contém a linha da reversão (`entryId`).

### UI
- Tipo "Inspector program" no diálogo e na lista (chip com o token novo).
- **Colunas:** Period type · Period start · Period end · Goal · Goal description (`describeGoal`) · Metric · Target · Scope · Per winner (AUD) · Participants · Achievers · Promised (AUD) · Inspector · Inspector email · Result · Jobs in period · Achieved on · Index at close · Level at close · Status · Amount (AUD) · Approved by · Approved at · Ledger status (Q12) · Invoice (Q12) · Paid at · Voided at · Void reason · Inspector note (L-F08-05) · Voided after invoicing (L-F08-03) · Reversal invoice (Q12). Status inclui "Skipped (goal inactive)" (L-F08-02).

### Casos de borda
1. Intervalo sem fechamentos → só cabeçalho, `READY`, `rowCount 0`.
2. Meta renomeada depois do fechamento → linhas com prêmio usam a fotografia; a linha sem atingentes usa o título atual.
3. Inspetor apagado (soft delete) → nome e e-mail continuam.
4. OP com agência escolhida antes de trocar o tipo → o diálogo limpa ao esconder o campo; o backend ignora.
5. **(L-F08-13)** Região/tipo/inspetor do escopo apagado ou renomeado depois do fechamento → "Scope" mostra o nome do fechamento (fotografia).
6. **(L-F08-02)** Meta inativa por meses e reativada → uma linha "Skipped (goal inactive)" por período pulado.
7. **(L-F08-03/Q12)** Prêmio pago e anulado → linha com Status "Voided", "Voided after invoicing" `Yes`, "Paid at" mantido, "Reversal invoice" vazio até a fatura seguinte fechar.
8. **(Q12)** Fatura com pagamento estornado (`PAID → CLOSED`) → prêmio volta a `APPROVED`: "Paid at" vazio, "Invoice" mantido.

### Fora do escopo
Várias planilhas, gráficos, filtros por meta/inspetor, histórico diário do índice, relatório para agências, relatório de exemplo no seed.

### Critérios de aceite
1. **03.14:** AM/OP geram e baixam o XLSX com metas, prêmios e índice no fechamento.
2. **03.A4:** o prêmio apurado aparece no XLSX do período (teste 4).
3. **Q18:** CL_* não veem nem geram o tipo. **03.A5:** pedido auditado (`reportRequested`). **03.A3:** não se aplica (relatório AM/OP com nomes).
4. Os 12 lugares cobertos por teste ou typecheck (`Record<ReportType, …>` obriga 3, 4 e 9).

### Dependências
TASK-F08-1; TASK-F08-3 (`describeGoal`).

### Riscos e armadilhas
- Esquecer os 2 extras (`dateAxisField` indefinido; CL_ADMIN veria a opção).
- `ADD VALUE` é irreversível sem recriar o tipo (inofensivo no rollback).
- Drift do `api-types` (memória `feedback_generated_apitypes_merge`).

### Deploy / rollout / rollback
Migration expand (staging → prod). Backend antes do web. Rollback: reverter o código; o valor do enum fica sem uso; arquivos expiram pela retenção de 30 dias. Observabilidade: logs e notificações de relatório existentes.

### Dias · Branch · Verificação
- **Dias:** 1,25 (sem mudança em 2026-10-30: as colunas de pagamento manual são trocadas pelas de lançamento/fatura no mesmo custo) = 03.14 (12 lugares, leitor, colunas, testes) 1,0 + **lacunas 0,25** (L-F08-02 linhas puladas; L-F08-03/05 colunas novas; L-F08-13 escopo da fotografia, com testes).
- **Branch:** `feat/f08-inspector-program-report` a partir de `develop` (depois das TASK-F08-1, F08-3 e F08-6), em worktree. ~17 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `test:integration` (4) via subagente; `generate:openapi` + `generate:types`; `pnpm --filter web typecheck lint test`; QA no navegador (AM gera e baixa; CL_ADMIN não vê); `git diff --stat origin/develop... | tail -1` < 150.

---

## TASK-F08-6 · Backend + shared + web + PWA: bônus no financeiro (ledger, fatura do inspetor, aditivo Q12)

> **Dependências de execução** (2026-10-30 · ver `../paralelizacao.md`)
> - **Bloqueada por (precisa estar mergeada antes):** TASK-X00-1, TASK-F08-1 (`ApproveRewardAwardUseCase`, `VoidRewardAwardUseCase`, porta `IRewardAwardApprovalHook`), TASK-F08-3 (aba Rewards)
> - **Desbloqueia:** TASK-F08-5 (colunas de lançamento/fatura); TASK-F08-4 entra depois dela (copy de DL14)
> - **Pode rodar em paralelo com:** TASK-F08-2, TASK-F08-4
> - **Pista sugerida (time de 6):** A2 · Backend em par (billing + inspector-program), com D · Web e C · PWA no último dia

### Objetivo
- Aditivo Q12 (cláusula 9.4, decidido pelo cliente em 2026-10-30): o bônus aprovado vira **lançamento no ledger** e **linha na fatura do inspetor**; o `RewardAward` fica `PAID` quando essa fatura é paga.
- `FinancialEntryType` **`INSPECTOR_BONUS`** (Prisma + shared): `appointment_id NULL`, `inspector_id` obrigatório, **`tenant_id NULL`** (bônus é de plataforma), `reward_award_id UNIQUE` (idempotência).
- Ponto de integração único no inspector-program: aprovar o prêmio cria o lançamento `APPROVED` na mesma transação do CAS; anular antes de faturado anula o lançamento; anular depois de faturado (só AM) cria a reversão.
- Ganchos no billing: fechar a fatura (`PENDING_REVIEW → CLOSED`) vincula os prêmios; pagar (`CLOSED → PAID`, unitário e em lote) leva os prêmios a `PAID`; estornar o pagamento (`PAID → CLOSED`) devolve a `APPROVED`.
- Agências **nunca** veem o bônus (lista, detalhe, resumo, exportação, relatório FINANCIAL, dashboard).
- Web: aba Rewards com a fatura do prêmio e "Void" de faturado (só AM); lista financeira e fatura com a linha "Bonus". PWA: bônus no histórico de Earnings e na fatura.

### Contexto no código (verificado @ `ba076fc4`, `origin/develop`, 2026-10-30)
- **Modelo:** `FinancialEntry` (`apps/backend/prisma/schema.prisma:1233-1273`): `tenant_id String` obrigatório (`:1235`) com relação obrigatória `tenant Tenant` (`:1252`); `appointment_id`/`inspector_id` já opcionais; `initiated_by_user_id` opcional; auto-relação `reference_entry_id`/`EntryReference` (`:1247,1261-1262`). `enum FinancialEntryType` (`:1021-1026`) = `TENANT_DEBIT`, `INSPECTOR_PAYOUT`, `REFUND`, `MANUAL_ADJUSTMENT`. `InspectorInvoice` (`:1275-1313`): `line_items_snapshot Json?`, `total_amount`, `paid_at`, `paid_by_user_id`, `payment_reference`, índice único **parcial** por `(inspector_id, period_start, period_end)` só nos status ativos (`:1303-1307`, SQL da spec 032) e GIN em `line_items_snapshot` (`:1311`). Shared: `FinancialEntryType` (`packages/shared/src/enums/financial.ts:1-7`), `AGENCY_VISIBLE_ENTRY_TYPES` (`:21-25`), filtro `type` com enum fixo (`packages/shared/src/schemas/billing.ts:4`), `financialEntryResponseSchema.tenantId: z.string().uuid()` obrigatório (`packages/shared/src/schemas/responses.ts:966-968`), `invoiceSnapshotLineSchema` com `appointmentId: uuid` e `appointmentCode: string` obrigatórios (`responses.ts:995-1006`).
- **Fatura não tem FK para lançamento:** é por **período**. `RequestInvoiceUseCase` (`apps/backend/src/modules/billing/application/use-cases/request-invoice.use-case.ts:58-94`): período fechado e alinhado ao ciclo do inspetor, soma `aggregateApprovedPayoutsForInspectorInPeriod` em `periodEffectiveRange` (≥ 1 lançamento, uma moeda), nenhuma fatura ativa no período. `PreviewInvoiceUseCase` devolve `payoutCount` (`preview-invoice.use-case.ts:59`). `ApproveDraftInvoiceUseCase` (`approve-draft-invoice.use-case.ts:110-151`): relê o ledger com `findApprovedPayoutLinesForSnapshot`, soma as linhas e congela snapshot, total, nome e ABN em `assignNumberAndFreeze` (`prisma-inspector-invoice.repository.ts:215-249`, `$transaction`); PDF enfileirado depois (`:154-160`).
- **Pagamento e estorno da fatura:** `MarkInvoicePaidUseCase` (`mark-invoice-paid.use-case.ts:136-160`) e `BatchMarkInvoicesPaidUseCase` (`batch-mark-invoices-paid.use-case.ts:140-190`) gravam com `invoiceRepo.update` **sem transação e sem CAS**; `ReverseInvoicePaymentUseCase` faz `PAID → CLOSED` (`reverse-invoice-payment.use-case.ts:33,80-130`). Transições no domínio: `inspector-invoice.entity.ts:126-183`.
- **VOID de fatura hoje:** só `PENDING_REVIEW → VOID` (`RejectDraftInvoiceUseCase`, `reject-draft-invoice.use-case.ts:99-111`; `voidIfPendingReview`, `prisma-inspector-invoice.repository.ts:251`). Fatura `CLOSED`/`PAID` **não** é anulada. Como não há vínculo lançamento→fatura, o lançamento "volta" sozinho: um novo pedido para o mesmo período o relê (o índice parcial deixa a fatura VOID coexistir). A F08-6 segue isso: rejeitar rascunho não mexe no prêmio; o vínculo do prêmio só é gravado no fechamento.
- **Os 3 leitores de fatura que filtram `INSPECTOR_PAYOUT`** (`apps/backend/src/modules/billing/infrastructure/prisma-financial-entry.repository.ts`): `sumApprovedPayoutsForInspectorInPeriod` (`:393-406`, filtro `:401`), `aggregateApprovedPayoutsForInspectorInPeriod` (`:408-430`, `:419`), `findApprovedPayoutLinesForSnapshot` (`:432-490`, `:445`, que ainda exige `appointment_id: { not: null }` e monta `agencyName: appt.tenant?.name`, `:485`). Outros leitores do inspetor: `getInspectorEarningsSummary` (`:125-160`, `payoutWhere` `:126`); `getSummary` com `switch` por tipo (`:112-119`, sem caso para tipo novo).
- **Escopo por papel:** `ListFinancialEntriesUseCase` (`list-financial-entries.use-case.ts`): AM sem filtro de tenant (`:74-79`); **OP com `filters.tenantId = actor.tenantId`** (`:97-103`); CL com `requireAgencyTenantScope` + `excludeInspectorScoped` (`inspector_id IS NULL`) + `AGENCY_VISIBLE_ENTRY_TYPES` (`:104-124`); INSP com `entryType = 'INSPECTOR_PAYOUT'` forçado (`:125-133`). `GetFinancialEntryUseCase` (`get-financial-entry.use-case.ts:30-46`): CL → 404 fora do tenant/tipo; INSP → 404 se não for `INSPECTOR_PAYOUT`. Repositório: `if (filters.tenantId) where.tenant_id` (`:48`), `excludeInspectorScoped` (`:55`), lista de agência (`:81`), `sumApprovedEntriesForTenantInPeriod` (`:507-520`).
- **Lugares que supõem `tenant_id` não nulo:** entidade `tenantId: string` (`financial-entry.entity.ts:6,26,43`); mapper `tenantId: row.tenant_id` (`prisma-financial-entry.repository.ts:20`); `create` grava `tenant_id: entry.tenantId` (`:272`); escritas com `where: { id, tenant_id: tenantId }` e `tenantId: string` em `updateStatus` (`:292-298`), atualização de ajuste (`:309-325`), `approvePendingEntry` (`:333-356`), transição (`:363-380`) e `voidEntry` (`:544-550`), chamadas com `entry.tenantId` (ex.: `void-financial-entry.use-case.ts:88,97`); `relatedEntityName: inspector?.name ?? tenant?.name` (`:189,253`, já tolera nulo); `financialEntryResponseSchema.tenantId` obrigatório (`responses.ts:968`); relatório FINANCIAL com comentário "tenant_id is always set" e `agency: e.tenant?.name ?? ''` (`apps/backend/src/modules/report/infrastructure/prisma-report-data-reader.ts:197,220`).
- **Agências e relatórios:** relatório FINANCIAL (`prisma-report-data-reader.ts:146-158`): `tenantId` opcional; `agencyScoped` → `AGENCY_VISIBLE_ENTRY_TYPES` + `inspector_id: null`; `switch` de receita/despesa (`:199-213`, sem caso novo). `FINANCIAL_AGENCY_COLUMNS` (`apps/backend/src/modules/report/domain/report.constants.ts:67`). `ExportAgencyFinancialUseCase` (`export-agency-financial.use-case.ts:75-78`). Dashboard: pendentes com allowlist de agência (`apps/backend/src/modules/dashboard/infrastructure/prisma-dashboard.repository.ts:189-196`); analytics só soma `TENANT_DEBIT` (`prisma-dashboard-analytics.repository.ts:133-137`, não muda).
- **Lançamento do sistema:** `CreateFinancialEntriesOnDoneUseCase` grava `initiatedByUserId: null` (`create-financial-entries-on-done.use-case.ts:93-96,151-154`); o literal `'SYSTEM'` violava a FK de `users` e zerou o ledger em prod (PR #1229, memória `project_financial_entries_system_initiator_fk_bug`). Reversão com vínculo: compensação DONE→REJECTED cria `REFUND` com `referenceEntryId` (`apps/backend/src/modules/appointment/application/handlers/compensate-financial-on-done-rejected.handler.ts:71-80`).
- **Arquivos da fatura:** só PDF (`generate-invoice-file.worker.ts:39-55`; colunas Appointment, Property, Service Type, Agency em `pdfkit-invoice-pdf.generator.ts:14-17`, linhas `:81-90`); não há XLSX de fatura.
- **Web:** linhas da fatura em `apps/web/src/features/financial/components/InvoiceDetailDrawer.tsx:198-217` (`line.appointmentCode`); rótulos de tipo em `apps/web/src/lib/status-colors.ts:92` e `apps/web/src/features/financial/constants/form-options.ts:5`; `FinancialTable.tsx:45,76` (`appointmentCode ?? description`).
- **PWA:** histórico de Earnings pede `/v1/financial/entries?type=INSPECTOR_PAYOUT` (`apps/pwa/src/features/earnings/hooks/useInspectorEarnings.ts:60`); linhas da fatura com chave `line.appointmentCode` (`apps/pwa/src/features/earnings/pages/InvoiceDetailPage.tsx:67-79`); pedido de fatura mostra "{n} approved payouts" (`RequestInvoicePage.tsx:41,114`).
- **TASK-F08-1:** `ApproveRewardAwardUseCase` e `VoidRewardAwardUseCase` com CAS e `IRewardAwardApprovalHook` no-op; `reward_awards.paid_at` nulo; CHECK `reward_awards_status_fields_chk` já aceita `paid_at` em `VOID`.

### Decisões aplicáveis
D1 (Q12 ✅ decidida pelo cliente em 2026-10-30), D8, D12 (2026-10-27); DV2 (2026-10-28: prêmio do sistema, aprovação sem autoaprovação = maker-checker); DL3 e DL14 revistas (2026-10-30); DR5 (fuso de cada campo).

Do dev (2026-10-30):
- **DQ1 · Tipo novo** `INSPECTOR_BONUS` no enum Prisma e no shared; `appointment_id NULL`, `inspector_id` obrigatório, `reward_award_id UNIQUE`.
- **DQ2 · `tenant_id NULL` só no `INSPECTOR_BONUS`.** Migration expand (`DROP NOT NULL`) + CHECK `("entry_type" = 'INSPECTOR_BONUS') = ("tenant_id" IS NULL)`. Leitores de agência filtram por `tenant_id` (o `NULL` sai sozinho), mas cada um é conferido e ganha teste explícito.
- **DQ3 · Integração única na aprovação:** na transação do CAS do `ApproveRewardAwardUseCase`, criar o lançamento `APPROVED` com `initiated_by_user_id NULL` e `approved_by_user_id` = quem aprovou o prêmio (padrão PR #1229; o CAS do prêmio sem autoaprovação **é** o maker-checker).
- **DQ4 · Fatura:** o bônus entra na fatura do período (ciclo do inspetor) que contém a data da aprovação (`effective_at = approved_at`), como linha sem atendimento "Bonus: {goal title} · {period}", no total, no snapshot e no PDF.
- **DQ5 · Sem "Mark as paid".** As TASK-F08-1/3 não constroem pagamento manual. `PAID` automático no pagamento da fatura (mesma transação, idempotente); estorno do pagamento devolve a `APPROVED`. Rejeitar rascunho de fatura (`PENDING_REVIEW → VOID`) não mexe no prêmio: o lançamento entra no próximo pedido do mesmo período (comportamento atual).
- **DQ6 · Anular:** antes de faturado, lançamento `VOIDED` na mesma transação; depois (fatura `CLOSED`/`PAID`), só AM, com lançamento de **reversão** `INSPECTOR_BONUS` negativo que cai na próxima fatura. Vínculo da reversão pela coluna **existente** `reference_entry_id` (→ lançamento original), não por coluna nova: a auto-relação já existe e é o padrão do `REFUND` da compensação; `reward_award_id` fica só no original (o `UNIQUE` continua 1:1) e a idempotência da reversão é um índice único parcial em `reference_entry_id` para o tipo. `recovery_note` não existe.
- **DQ7 · PWA:** bônus no histórico de Earnings e nas linhas da fatura; copy de DL14 (TASK-F08-4).
- **DQ8 · Relatórios:** FINANCIAL de AM/OP inclui o bônus (despesa); FINANCIAL de agência e `FINANCIAL_AGENCY_COLUMNS` nunca. `INSPECTOR_PROGRAM` (TASK-F08-5) mostra lançamento e fatura.
- **DQ9 · Leitores do billing:** os 3 leitores de fatura e o resumo de ganhos incluem `INSPECTOR_BONUS`.

Desta quebra (2026-10-30, a confirmar nos Achados):
- **DQ10 · OP vê as linhas de bônus na lista financeira.** O ramo OP (`list-financial-entries.use-case.ts:97-103`) força `tenant_id = actor.tenantId` e esconderia o bônus de quem aprova os prêmios. Proposta: filtro novo `includePlatformBonus` só para OP (`OR (tenant_id IS NULL AND entry_type = 'INSPECTOR_BONUS')`). É ampliação de RBAC: seguir o checklist (memória `project_rbac_widening_checklist`). Alternativa sem ampliação: OP vê o bônus só na aba Rewards e na fatura.
- **DQ11 · Vínculo prêmio → fatura no fechamento.** Coluna nova `reward_awards.inspector_invoice_id` (FK, nula) gravada quando a fatura passa a `CLOSED` (a única fatura que não pode mais ser anulada). "Faturado" = `inspector_invoice_id IS NOT NULL`; dá o link "Invoice PINV-…" sem varrer JSON.
- **DQ12 · Lançamento do bônus é gerido só pelo prêmio:** `void`/`update`/`approve`/`cancel`/`refund` genéricos do billing em `INSPECTOR_BONUS` → 409 `BONUS_ENTRY_MANAGED_BY_REWARD` "Bonus entries are managed from Goals & rewards.".
- **DQ13 · Período com total ≤ 0** (só reversão, ou reversão maior que os ganhos): o pedido de fatura responde 422 `INVOICE_NON_POSITIVE_TOTAL` "This period has no amount to invoice." (o preview só mostra o total, e o PWA desabilita "Request"); a OP resolve com ajuste manual. Raro (o bônus é pequeno perto dos ganhos do período).

### Testes primeiro (TDD)

Vitest; relógio injetado; datas de período com `TZ=America/Los_Angeles` também (memória `feedback_tz_dependent_test_must_pin_away`). Inspetor `I` com ciclo `WEEKLY`; meta "Weekly volume" $30; prêmio `A` `PENDING` da semana 2–8 Nov 2026.

**1. Shared — `financial.test.ts` e `responses.test.ts`**
- `FinancialEntryType` contém `INSPECTOR_BONUS`; `AGENCY_VISIBLE_ENTRY_TYPES` **não** contém (`['TENANT_DEBIT','REFUND','MANUAL_ADJUSTMENT']` exato).
- `financialEntryResponseSchema` aceita `tenantId: null`; `invoiceSnapshotLineSchema`: linha antiga (sem `kind`) → `kind 'SERVICE'`; `{ kind: 'BONUS', appointmentId: null, appointmentCode: null, entryId, rewardAwardId, description: 'Bonus: Weekly volume · Week of Mon 2 Nov' }` → ok; `kind 'SERVICE'` sem `appointmentId` → erro.
- `listFinancialEntriesQuerySchema.type` aceita `INSPECTOR_BONUS`.

**2. Aplicação — `approve-reward-award.use-case.test.ts` (acréscimo)**

| Caso | Esperado |
|---|---|
| OP aprova `A` às `2026-11-10T01:00:00Z` | na mesma transação: `A` `APPROVED` e 1 lançamento `{ entry_type: 'INSPECTOR_BONUS', tenant_id: null, appointment_id: null, inspector_id: I, reward_award_id: A, amount: 30.00, currency: 'AUD', status: 'APPROVED', effective_at: approved_at, initiated_by_user_id: null, approved_by_user_id: <OP>, approved_at, description: 'Bonus: Weekly volume · Week of Mon 2 Nov' }`; audit `reward_award.approved` com `after.financialEntryId` e `financial_entry.created` |
| quem criou a meta aprova | aprovado; lançamento criado (DV2) |
| inserção do lançamento falha (simulada) | rollback: `A` continua `PENDING`; 500 logado; nada engolido por `catch {}` (lição do PR #1229) |
| dois aprovadores simultâneos | um vence; o outro recebe 409 depois da releitura; **1** lançamento |
| mesma `Idempotency-Key` repetida | resposta guardada; 1 lançamento |
| `reward_award_id` já existe (CAS forçado a passar no teste) | `P2002` no `UNIQUE` → 409 `REWARD_AWARD_INVALID_STATUS`, rollback |

**3. Aplicação — `void-reward-award.use-case.test.ts` (acréscimo)**

| Caso | Esperado |
|---|---|
| OP anula `PENDING` | `VOID`; nenhum lançamento tocado (não existe) |
| OP anula `APPROVED` não faturado (`inspector_invoice_id` nulo) | `VOID` e lançamento `APPROVED → VOIDED` (`voided_by`, `voided_at`, `void_reason` = motivo) na mesma transação |
| idem com fatura do período em `PENDING_REVIEW` | igual; ao aprovar o rascunho, o snapshot não tem a linha e o total é recalculado (comportamento atual) |
| OP anula `APPROVED` faturado (fatura `CLOSED`) | 403 `FORBIDDEN` "Only an Admin Master can void an invoiced reward"; nada gravado |
| AM anula `APPROVED` faturado | `VOID`; lançamento original **intocado**; reversão `{ INSPECTOR_BONUS, amount: -30.00, tenant_id: null, reward_award_id: null, reference_entry_id: <original>, status: 'APPROVED', effective_at: now, description: 'Bonus reversal: Weekly volume · Week of Mon 2 Nov' }`; audit com `afterInvoicing: true` |
| AM anula `PAID` | igual; `paid_at` mantido; `voidedAfterInvoicing true` |
| mesma `Idempotency-Key` / segunda anulação | 1 reversão (índice único parcial); 409 `REWARD_AWARD_INVALID_STATUS` na segunda |
| corrida: AM anula `APPROVED` enquanto a OP aprova o rascunho da fatura do período | um vence: (a) anulação primeiro → fechamento vê o prêmio `VOID`, a contagem de vínculos não bate e o fechamento falha com 409 `INVOICE_LINES_CHANGED` "Invoice lines changed. Try again." (retry congela sem a linha); (b) fechamento primeiro → a anulação lê `inspector_invoice_id` e segue o ramo de reversão |
| `recoveryNote` no corpo | 400 (`.strict()`) |

**4. Billing — leitores (`prisma-financial-entry.repository.integration.test.ts`, banco real)**
- `aggregateApprovedPayoutsForInspectorInPeriod(I, semana 9–15 Nov)` com 2 payouts (80 + 70) e o bônus aprovado em 10 nov → `{ totalAmount: 180, count: 3 }`; bônus `VOIDED` → fora; bônus de outro inspetor → fora.
- `sumApprovedPayoutsForInspectorInPeriod` → 180.
- `findApprovedPayoutLinesForSnapshot` → 2 linhas `SERVICE` (inalteradas) + 1 `{ kind: 'BONUS', serviceDate: '2026-11-10', appointmentId: null, appointmentCode: null, propertyAddress: null, serviceType: null, agencyId: null, agencyName: null, branchId: null, branchName: null, amount: 30, entryId, rewardAwardId: A, description: 'Bonus: Weekly volume · Week of Mon 2 Nov' }`, em ordem de `effective_at`; reversão → linha `BONUS` com `amount -30`, `rewardAwardId` do original via `reference_entry_id`, `description` "Bonus reversal: …".
- `getInspectorEarningsSummary(I)` soma o bônus em `totalApproved` e no mês de `effective_at`.
- `getSummary` (AM) → `totalBonuses 30` separado de `totalPayouts`.

**5. Billing — fatura (unit + integração)**
- `request-invoice`: período só com bônus (30) → cria `PENDING_REVIEW` (`payoutCount 1`); período só com reversão (−30) → 422 `INVOICE_NON_POSITIVE_TOTAL` (DQ13); bônus em AUD com payouts em outra moeda → `InvoiceMixedCurrencyError` (existente).
- `approve-draft-invoice` da semana 9–15 Nov: `total_amount 180`, snapshot com a linha `BONUS`; **na mesma transação** `A.inspector_invoice_id = invoice.id` (`UPDATE … WHERE id IN (rewardAwardIds) AND status = 'APPROVED'`; contagem ≠ linhas `BONUS` com `rewardAwardId` de prêmio original → rollback + 409 `INVOICE_LINES_CHANGED`); fatura sem linha `BONUS` → nenhum `UPDATE` (zero regressão nos testes atuais).
- `mark-invoice-paid` da fatura com `A`: fatura `PAID` e `A` `APPROVED → PAID` com `paid_at = invoice.paid_at` na **mesma transação**; audit `reward_award.paid` (`actorType 'SYSTEM'`, `metadata.invoiceId`); repetir (idempotência do billing) → nada novo; prêmio já `VOID` (anulado depois do fechamento) → não muda (`WHERE status = 'APPROVED'`, 0 linhas, sem erro).
- `batch-mark-invoices-paid` com 2 faturas, uma com bônus → só os prêmios dela viram `PAID`; fatura pulada (`NOT_CLOSED`) não mexe em prêmio.
- `reverse-invoice-payment` (`PAID → CLOSED`) → `A` `PAID → APPROVED`, `paid_at` nulo, `inspector_invoice_id` mantido; audit `reward_award.payment_reversed`.
- `reject-draft-invoice` (`PENDING_REVIEW → VOID`) → `A` não muda (`APPROVED`, sem vínculo); novo pedido do mesmo período relê o bônus.
- falha no `UPDATE` dos prêmios ao pagar → rollback da fatura (continua `CLOSED`).

**6. Isolamento de agência (integração, Supertest)** — seed: agência X com payout/débito; bônus de `I` (que atende X).
- CL_ADMIN/CL_USER de X: `GET /v1/financial/entries` sem filtro, com `type=INSPECTOR_BONUS` (→ 403 existente "Agencies cannot view this entry type") e com `appointmentId`; `GET /v1/financial/entries/:bonusId` → **404**; resumo, exportação agency (`export-agency-financial`) e contagem de pendentes do dashboard → bônus ausente em todos.
- relatório FINANCIAL `agencyScoped` de X → nenhuma linha `INSPECTOR_BONUS`; colunas = `FINANCIAL_AGENCY_COLUMNS` (inalteradas).
- AM: lista sem `tenantId` → bônus presente; com `tenantId = X` → ausente (o bônus não é de agência). OP: presente com `includePlatformBonus` (DQ10) e ausente o bônus de agência alheia.
- INSP `I`: lista sem `type` → payouts + bônus próprios; `type=INSPECTOR_BONUS` → só bônus; bônus de outro inspetor por id → 404.

**7. Ações genéricas no lançamento de bônus** — `void-financial-entry`, `update-financial-entry`, `approve-financial-entry`, `cancel-financial-entry`, `create-refund` com id de `INSPECTOR_BONUS` → 409 `BONUS_ENTRY_MANAGED_BY_REWARD`, nada gravado (DQ12).

**8. Banco — `financial-entries-bonus.db.test.ts` (Testcontainers)**
- CHECK `financial_entries_bonus_tenant_chk`: `INSPECTOR_BONUS` com `tenant_id` → violação; `TENANT_DEBIT` com `tenant_id NULL` → violação.
- CHECK `financial_entries_bonus_shape_chk`: bônus sem `inspector_id`, com `appointment_id`, com `reward_award_id` **e** `reference_entry_id`, original com valor ≤ 0, reversão com valor ≥ 0 → violação; `reward_award_id` em tipo ≠ `INSPECTOR_BONUS` → violação.
- `UNIQUE (reward_award_id)`; índice parcial `financial_entries_bonus_reversal_unique` → segunda reversão do mesmo original falha com `23505` (cru, não `P2002`: memória `project_pricing_catalog_spec_execution`) e o repositório mapeia para 409.
- `reward_awards.inspector_invoice_id` FK `Restrict`.
- migração sobre dump com lançamentos existentes: nenhum dado alterado; `tenant_id` continua preenchido em todas as linhas antigas.

**9. Relatório FINANCIAL (`prisma-report-data-reader.integration.test.ts`, acréscimo)** — AM/OP sem agência: linha do bônus com `agency` vazio, `entryType 'INSPECTOR_BONUS'`, `expense 30`; reversão `expense -30`; com filtro de agência → ausente.

**10. Web (Vitest + RTL)**
- `RewardAwardsTable`: `APPROVED` sem fatura → "Approved · next invoice"; com `invoice` → link "PINV-000042" para o drawer da fatura; `PAID` → "Paid" + link; AM vê "Void" em `APPROVED` faturado e em `PAID` (diálogo com aviso "This bonus is already on an invoice. Voiding it adds a reversal to the inspector's next invoice."); OP não vê; 403 → "Only an Admin Master can void an invoiced reward."; `VOID` com `voidedAfterInvoicing` → chip "Voided after invoicing". Nenhum "Mark as paid".
- `FinancialTable`: linha `INSPECTOR_BONUS` com chip "Bonus" e descrição no lugar do código; agência "—".
- `InvoiceDetailDrawer`: linha `BONUS` com "Bonus" na coluna Appointment e a descrição; total igual à soma.

**11. PWA (Vitest + RTL)**
- `useInspectorPayoutHistory` não manda `type` (o backend devolve payouts + bônus do inspetor); item `INSPECTOR_BONUS` com rótulo "Bonus" e descrição; reversão com valor negativo "−$30.00".
- `InvoiceDetailPage`: linha `BONUS` sem endereço, com "Bonus: Weekly volume · Week of Mon 2 Nov"; chave da lista por `entryId ?? appointmentCode`.
- `RequestInvoicePage`: "{n} approved items" (payouts + bônus).

**12. E2E web (estende o da TASK-F08-3)** — depois de "Approve": fixture fecha a semana do faturamento, o inspetor pede a fatura, AM aprova e marca paga → aba Rewards mostra "Paid" e "PINV-…"; CL_ADMIN da agência do inspetor abre Financial → nenhuma linha "Bonus".

### Escopo / Passos
1. **Shared:** `INSPECTOR_BONUS` em `FinancialEntryType` (fora de `AGENCY_VISIBLE_ENTRY_TYPES`, comentário); `billing.ts:4` aceita o tipo; `financialEntryResponseSchema.tenantId` `.nullable()`; `invoiceSnapshotLineSchema` com `kind: z.enum(['SERVICE','BONUS']).default('SERVICE')`, `appointmentId`/`appointmentCode` `.nullable()` com `refine` (`SERVICE` exige os dois), `entryId?: uuid`, `rewardAwardId?: uuid | null`, `description?: string | null`; `rewardAwardResponseSchema` ganha `financialEntryId`, `invoice`, `voidedAfterInvoicing`; `voidAwardSchema` sem mudança. `pnpm --filter @properfy/shared build`.
2. **Prisma + 2 migrations** (Modelo de dados). Relação `tenant Tenant?`; `rewardAward RewardAward?`; `RewardAward.inspector_invoice` e back-relations. `prisma generate`.
3. **Ripple do `tenant_id` nulo** (lista do Contexto): entidade `tenantId: string | null`; mapper; `create`; os métodos de escrita com `where: { id, tenant_id }` passam a receber `tenantId: string | null` só onde o bônus pode chegar — como as ações genéricas são bloqueadas em bônus (DQ12) antes da escrita, eles mantêm `string` e o guarda fica no use case (typecheck acusa qualquer chamada com `entry.tenantId` nulo). Relatório: tirar o comentário "tenant_id is always set" e tratar `INSPECTOR_BONUS` como despesa.
4. **Billing — leitores:** `entry_type: { in: ['INSPECTOR_PAYOUT','INSPECTOR_BONUS'] }` nos 3 leitores de fatura e em `getInspectorEarningsSummary`; `findApprovedPayoutLinesForSnapshot` passa a ler o bônus numa segunda consulta (sem `appointment`) com a meta do prêmio para a descrição já gravada no lançamento, e intercala por `effective_at`; `getSummary` com `totalBonuses`. `RequestInvoiceUseCase`: total ≤ 0 → `InvoiceNonPositiveTotalError` (DQ13); `PreviewInvoiceUseCase` só devolve o total (o `payoutCount` passa a contar bônus).
5. **Billing — escopo:** `ListFinancialEntriesUseCase` INSP → `entryTypeIn: ['INSPECTOR_PAYOUT','INSPECTOR_BONUS']` sem `type`, `type` restrito a esses dois; OP → `includePlatformBonus` (DQ10); `GetFinancialEntryUseCase` INSP aceita os dois tipos. Guarda `BONUS_ENTRY_MANAGED_BY_REWARD` em void/update/approve/cancel/refund (DQ12).
6. **Billing — ganchos da fatura** via porta `IRewardAwardInvoiceSync` (domínio do billing; implementação no inspector-program; parâmetro opcional no fim do construtor, memória `project_adding_usecase_dep_breaks_untyped_test_wirings`): `linkToInvoice(tx, invoiceId, rewardAwardIds)` no `assignNumberAndFreeze` (a leitura do snapshot entra na mesma `$transaction`); `markPaidForInvoice(tx, invoiceId, paidAt)` em `MarkInvoicePaidUseCase` e por fatura no lote (escrita da fatura + prêmios numa `$transaction`; método novo `invoiceRepo.markPaidInTransaction`); `revertPaidForInvoice(tx, invoiceId)` em `ReverseInvoicePaymentUseCase`.
7. **Inspector-program:** `IRewardAwardApprovalHook` real (`BonusLedgerHook`) usando um repositório pequeno `IBonusEntryWriter` (porta no inspector-program, implementação no billing — o prêmio não importa o repositório financeiro); `VoidRewardAwardUseCase` com os 2 ramos (DQ6) e `assertRoles([AM])` no ramo faturado; permissão `inspector_program.awards.void_invoiced` (só AM) em `ROLE_ACTION_MATRIX`; listagem e resposta com `financialEntryId`, `invoice: { id, invoiceNumberDisplay, status } | null`, `voidedAfterInvoicing`.
8. **PDF:** linha `BONUS` → Appointment "Bonus", Property = `description`, Service Type/Agency "-"; total inalterado (soma das linhas).
9. **Web:** `RewardAwardsTable` (coluna "Invoice", chips, "Void" de faturado só AM, diálogo com aviso), `RewardsTab` tile "Paid" passa a refletir faturas pagas; `status-colors.ts` + `form-options.ts` com "Bonus" (token `--color-fin-type-bonus`, contraste ≥ 4.5:1); `FinancialTable`/drawer do lançamento sem atendimento; `InvoiceDetailDrawer` linha `BONUS`.
10. **PWA:** histórico sem `type` fixo; rótulo "Bonus"; `InvoiceDetailPage` e `RequestInvoicePage`.
11. **OpenAPI:** `generate:openapi` + `generate:types` (memória `reference_generate_openapi_env`), commitados (memória `feedback_generated_apitypes_merge`).
12. **Doc (X00):** `apps/backend/CLAUDE.md` — billing: "`INSPECTOR_BONUS` é o único lançamento sem `tenant_id`; leitores de agência nunca o devolvem; só o inspector-program o cria/anula"; inspector-program: ganchos da fatura e regra de anulação; `packages/shared/CLAUDE.md` — `invoiceSnapshotLineSchema.kind`. Atualizar `CLAUDE.md` da raiz §8 (regras financeiras: bônus de meta entra na fatura do inspetor).

### Modelo de dados
```prisma
enum FinancialEntryType { TENANT_DEBIT INSPECTOR_PAYOUT REFUND MANUAL_ADJUSTMENT INSPECTOR_BONUS }

model FinancialEntry {
  tenant_id       String?        // Q12: NULL só em INSPECTOR_BONUS (CHECK)
  reward_award_id String?  @unique // Q12: lançamento original do bônus (1:1 com o prêmio)
  tenant          Tenant?        @relation(fields: [tenant_id], references: [id])
  rewardAward     RewardAward?   @relation(fields: [reward_award_id], references: [id], onDelete: Restrict)
  // demais campos inalterados; reversão usa reference_entry_id (existente)
}

model RewardAward {
  inspector_invoice_id String?           // Q12/DQ11: gravado no fechamento da fatura (CLOSED)
  inspector_invoice    InspectorInvoice? @relation(fields: [inspector_invoice_id], references: [id], onDelete: Restrict)
  financial_entry      FinancialEntry?
  @@index([inspector_invoice_id])
}
```
- **Migration 1** `YYYYMMDDhhmmss_financial_entry_type_inspector_bonus`: `ALTER TYPE "FinancialEntryType" ADD VALUE 'INSPECTOR_BONUS';` sozinha (o Postgres não deixa usar o valor novo na mesma transação, e os CHECKs abaixo o citam).
- **Migration 2** `YYYYMMDDhhmmss_inspector_bonus_ledger` (expand):
  ```sql
  ALTER TABLE "financial_entries" ALTER COLUMN "tenant_id" DROP NOT NULL;
  ALTER TABLE "financial_entries" ADD COLUMN "reward_award_id" TEXT;
  ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_reward_award_id_fkey"
    FOREIGN KEY ("reward_award_id") REFERENCES "reward_awards"("id") ON DELETE RESTRICT;
  CREATE UNIQUE INDEX "financial_entries_reward_award_id_key" ON "financial_entries"("reward_award_id");
  ALTER TABLE "financial_entries"
    ADD CONSTRAINT "financial_entries_bonus_tenant_chk" CHECK (("entry_type" = 'INSPECTOR_BONUS') = ("tenant_id" IS NULL)),
    ADD CONSTRAINT "financial_entries_bonus_shape_chk" CHECK (
      ("reward_award_id" IS NOT NULL) <= ("entry_type" = 'INSPECTOR_BONUS')
      AND (("entry_type" <> 'INSPECTOR_BONUS') OR (
        "inspector_id" IS NOT NULL AND "appointment_id" IS NULL
        AND (("reward_award_id" IS NOT NULL) <> ("reference_entry_id" IS NOT NULL))
        AND (("reward_award_id" IS NOT NULL) = ("amount" > 0))
        AND (("reference_entry_id" IS NOT NULL) = ("amount" < 0)))));
  -- idempotência da reversão (Prisma não expressa índice parcial: fica só no SQL)
  CREATE UNIQUE INDEX "financial_entries_bonus_reversal_unique"
    ON "financial_entries"("reference_entry_id") WHERE "entry_type" = 'INSPECTOR_BONUS';
  ALTER TABLE "reward_awards" ADD COLUMN "inspector_invoice_id" TEXT
    REFERENCES "inspector_invoices"("id") ON DELETE RESTRICT;
  CREATE INDEX "reward_awards_inspector_invoice_id_idx" ON "reward_awards"("inspector_invoice_id");
  ALTER TABLE "reward_awards" ADD CONSTRAINT "reward_awards_paid_invoice_chk"
    CHECK (("status" = 'PAID') <= ("inspector_invoice_id" IS NOT NULL));
  ```
- **Backfill:** nenhum (nenhum prêmio aprovado antes desta tarefa em prod: Deploy). Contract: nenhum — `tenant_id` nulo é permanente para o tipo.
- **Drift:** o índice parcial não aparece no `schema.prisma`; conferir o diff do `prisma migrate dev` para ele não ser dropado (memória `project_prisma_drift_drops_unsupported_indexes`) e aplicar localmente (memória `feedback_migration_apply_locally`).

### Contratos
| Rota | Mudança |
|---|---|
| `POST /v1/inspector-program/awards/:awardId/approve` | resposta ganha `financialEntryId`; mesmos erros |
| `POST /v1/inspector-program/awards/:awardId/void` | `awards.void`; prêmio faturado (`inspector_invoice_id` não nulo) ou `PAID` exige `awards.void_invoiced` (só AM) → 403 `FORBIDDEN` "Only an Admin Master can void an invoiced reward"; 409 `INVOICE_LINES_CHANGED` não se aplica aqui |
| `GET /v1/inspector-program/awards`, `GET /summary` | item ganha `financialEntryId: string \| null`, `invoice: { id, invoiceNumberDisplay, status } \| null`, `voidedAfterInvoicing: boolean`; `totals.paid` = prêmios `PAID` |
| `GET /v1/inspector/program` (TASK-F08-4) | `awards[i].paidAt` = `paid_at` da fatura; sem campo novo |
| `GET /v1/financial/entries` | `type` aceita `INSPECTOR_BONUS` (AM, OP, INSP); CL → 403 existente; item com `tenantId: null`; INSP sem `type` devolve payouts + bônus |
| `GET /v1/financial/entries/:id` | CL → 404 no bônus; INSP → só o próprio |
| `GET /v1/financial/entries/summary` (AM/OP) | `totalBonuses` |
| `POST /v1/financial/entries/:entryId/{void,approve,cancel,refund}`, `PATCH /v1/financial/entries/:entryId` | 409 `BONUS_ENTRY_MANAGED_BY_REWARD` em bônus (o `refund` copiaria `tenant_id` nulo num `REFUND` e estouraria o CHECK) |
| `POST /v1/inspector/invoices/request`, `GET /v1/inspector/invoices/preview` (`inspector-execution.routes.ts:292-315`) | contam bônus; o pedido responde 422 `INVOICE_NON_POSITIVE_TOTAL` com total ≤ 0 |
| `POST /v1/billing/invoices/:invoiceId/approve-draft` | 409 `INVOICE_LINES_CHANGED` "Invoice lines changed. Try again." |
| `GET /v1/billing/invoices/:invoiceId` | `lineItemsSnapshot[i]` com `kind`, `entryId`, `rewardAwardId`, `description`; `appointmentId`/`appointmentCode` nulos no bônus |
| `POST /v1/billing/invoices/:invoiceId/mark-paid`, `/batch-mark-paid`, `/:invoiceId/reverse-payment`, `/:invoiceId/reject-draft` | sem mudança de contrato; efeito colateral nos prêmios (reject-draft: nenhum) |
- Rota `mark-paid` de prêmio: **não existe** (as TASK-F08-1/3 não a constroem).
- Declarar os códigos novos nos response schemas das rotas (o serializer remove/estoura campos não declarados: memórias `project_response_schema_strips_undeclared_fields`, `project_fastify_response_schema_serializer_throws`).

### UI
- **Web · aba Rewards (TASK-F08-3, estendida):** coluna **Invoice** ("PINV-000042" abre o `InvoiceDetailDrawer` na mesma aba; vazio enquanto não faturado); chips "Pending approval" · "Approved · next invoice" (sem fatura) / "Approved · on PINV-000042" · "Paid" · "Voided" · "Voided after invoicing"; "Void" em `APPROVED` faturado e `PAID` só para AM, com o aviso "This bonus is already on an invoice. Voiding it adds a reversal to the inspector's next invoice."; nenhum "Mark as paid"; ajuda do tile Paid "Paid through the inspector's invoice."
- **Web · Financial (AM/OP):** chip de tipo **"Bonus"**; coluna Inspection mostra a descrição ("Bonus: Weekly volume · Week of Mon 2 Nov"); Agency "—"; filtro de tipo com "Bonus". **Fatura:** linha "Bonus" com a descrição, sem endereço/agência.
- **PWA · Earnings:** histórico com itens "Bonus" (descrição, valor; reversão "Bonus reversal", valor negativo); fatura com a linha "Bonus"; pedido de fatura "{n} approved items". **Challenges** (TASK-F08-4): rodapé e chips de DL14.

### Casos de borda
1. Aprovação no último dia do período de faturamento (domingo 23:30 Sydney) → `effective_at` no período que fecha; `periodEffectiveRange` decide (DR5).
2. Inspetor com ciclo `MONTHLY` → o bônus entra na fatura do mês da aprovação, não da semana da meta.
3. Fatura do período já pedida (`PENDING_REVIEW`) quando o bônus é aprovado: impossível — o pedido exige período fechado e o bônus nasce em `now` (período aberto). Coberto por teste (aprovar com rascunho de período anterior não muda o rascunho).
4. Rascunho rejeitado (`VOID`) → prêmio intocado; o próximo pedido do período inclui o bônus.
5. Fatura paga e estornada → prêmio volta a `APPROVED` (faturado); paga de novo → `PAID` com o novo `paid_at`.
6. Prêmio anulado depois do fechamento e antes do pagamento → reversão na próxima fatura; ao pagar a fatura original, o prêmio `VOID` não vira `PAID`.
7. Reversão num período sem outros ganhos → 422 `INVOICE_NON_POSITIVE_TOTAL` (DQ13); a OP resolve com ajuste manual.
8. Inspetor apagado/inativo com bônus aprovado → lançamento existe; a fatura segue o fluxo atual do inspetor.
9. ABN e nome congelados no fechamento (`assignNumberAndFreeze`) valem também para a linha de bônus; nada novo a congelar.
10. Filtro de faturas por agência/filial (GIN no snapshot): linha `BONUS` tem `agencyId null`, então não faz uma fatura "pertencer" a uma agência; faturas só com bônus não aparecem em filtro por agência.
11. Moeda: o programa é AUD; se o inspetor tiver payouts em outra moeda no período, o pedido falha com o erro de moeda mista existente.
12. Lançamentos antigos (`tenant_id` preenchido) não mudam; CHECK garante que nenhum tipo antigo fique sem tenant.

### Fora do escopo
- Pagamento manual de prêmio (retirado); `recovery_note`; reabrir/anular fatura `CLOSED`/`PAID` (não existe no billing).
- Tributação do bônus, ABN/GST novos, lançamento de bônus para agência.
- Mostrar o bônus a agências em qualquer superfície; dashboard Analytics (soma só `TENANT_DEBIT`).
- Backfill de prêmios aprovados antes desta tarefa (não haverá em prod).
- Carregar automaticamente a reversão para um período seguinte quando o total fica ≤ 0 (DQ13; manual).

### Critérios de aceite
1. **Q12:** aprovar um prêmio cria exatamente um lançamento `INSPECTOR_BONUS` `APPROVED` sem agência, na mesma transação; a fatura do período da aprovação mostra a linha "Bonus" no snapshot, no total e no PDF (testes 2, 4, 5).
2. Pagar a fatura leva o prêmio a `PAID` (mesmo `paid_at`), unitário e em lote; estornar devolve a `APPROVED`; rejeitar rascunho não mexe no prêmio (teste 5).
3. Anular antes de faturado anula o lançamento; depois, só AM, com reversão negativa na próxima fatura; OP recebe 403 (teste 3).
4. **Agências:** nenhuma superfície de CL_ADMIN/CL_USER (lista, detalhe 404, resumo, exportação, relatório FINANCIAL agency-scoped, dashboard) mostra bônus (testes 6, 9).
5. CHECKs e índices impedem bônus com agência, tipo antigo sem agência, lançamento duplicado e reversão duplicada (teste 8).
6. Idempotência e concorrência: aprovação repetida/simultânea gera 1 lançamento; corrida anulação × fechamento termina em um estado coerente (testes 2, 3).
7. Nenhuma rota de pagamento manual de prêmio; nenhuma ação genérica do billing altera um bônus (teste 7).
8. **03.A5:** aprovar, anular, `PAID` e estorno geram audit com autor (ou `SYSTEM` nos ganchos da fatura) e before/after.

### Dependências
TASK-F08-1 (aprovação, anulação, porta de extensão, `paid_at`); TASK-F08-3 (aba Rewards). Billing existente (spec 032: pedido/aprovação de fatura do inspetor, pagamento em lote, estorno).

### Riscos e armadilhas
- **Vazamento para agência:** todo leitor novo de `financial_entries` precisa da allowlist ou do `tenant_id`; o teste 6 cobre os atuais. Atenção ao `appointmentId` aditivo da lista (`list-financial-entries.use-case.ts:136`): o bônus não tem atendimento, mas o teste confirma.
- **`tenant_id` nulo quebrando código existente:** o typecheck acusa `entry.tenantId` usado como `string`; escritas com `where: { id, tenant_id: tenantId }` silenciosamente não acham o bônus (0 linhas → `InvalidEntryStatusTransitionError`): por isso a guarda DQ12 vem antes, com teste.
- **Serializer e response schema:** `tenantId` nulo num schema que exige uuid estoura o serializer (memória `project_fastify_response_schema_serializer_throws`); campos novos não declarados somem (memória `project_response_schema_strips_undeclared_fields`).
- **`ADD VALUE` em migration própria** (uso na mesma transação falha); irreversível sem recriar o tipo.
- **Índice parcial e drift do Prisma** (Modelo de dados); `23505` cru do índice parcial não vira `P2002`.
- **Lição do PR #1229:** nunca `initiated_by_user_id = 'SYSTEM'`; nunca `catch {}` em volta da criação do lançamento (aqui ela é transacional com o CAS, então falhar é falhar a aprovação).
- **Mark-paid sem transação hoje:** o gancho exige mover a escrita da fatura para uma `$transaction`; o lote processa fatura a fatura (uma transação por fatura) para manter a semântica "processa o que der".
- **ABN/nome congelados:** o snapshot do bônus entra pelo mesmo `assignNumberAndFreeze`; não criar caminho paralelo que escreva no snapshot depois do fechamento.
- **`api-types`:** regenerar com `generate:openapi` → `generate:types` (memória `reference_generate_openapi_env`) e conferir drift (memória `project_tenant_apitypes_openapi_drift`).
- **PR:** ~55 arquivos (backend ~30, shared ~6, web ~10, PWA ~6); se passar de 150, separar web/PWA num PR seguinte.

### Deploy / rollout / rollback
- **Migrations:** expand (enum em migration própria; `DROP NOT NULL`, colunas, CHECKs, índices). Staging, depois prod. Sem backfill.
- **Rollout:** TASK-F08-1, F08-3 e F08-6 vão juntas para prod (nenhum prêmio aprovado no meio); a TASK-F08-4 só depois desta (copy). Smoke em staging: aprovar prêmio → linha no ledger (AM) → pedir/aprovar/pagar fatura → prêmio `PAID`; CL_ADMIN não vê "Bonus".
- **Rollback:** reverter o código desliga a criação do lançamento; colunas e enum ficam (inofensivos). Lançamentos já criados continuam válidos no ledger e nas faturas; prêmios ficam no último status.
- **Observabilidade:** audit `financial_entry.created` (bônus), `reward_award.paid`/`payment_reversed`; log `inspector_program.bonus_entry_created { awardId, entryId, inspectorId }`; erro `INVOICE_LINES_CHANGED` logado em `warn`.

### Dias · Branch · Verificação
- **Dias:** 3,5 (aditivo Q12, cláusula 9.4) = migrations + shared (enum, CHECKs, índices, snapshot com `kind`, schemas) 0,5 + inspector-program (lançamento na aprovação, anulação em 2 ramos, reversão, permissão AM, respostas) 0,75 + billing (3 leitores + ganhos + resumo, escopo INSP/OP, guarda das ações genéricas, snapshot com linha de bônus, PDF, ganchos de fechamento/pagamento/lote/estorno com transação) 1,0 + ripple do `tenant_id` nulo (entidade, mappers, relatório FINANCIAL, response schemas, `api-types`) 0,25 + web (aba Rewards, Financial, fatura) 0,5 + PWA (Earnings, fatura, pedido) 0,25 + testes de banco/integração (isolamento de agência, CHECKs, concorrência, E2E estendido) 0,25.
- **Branch:** `feat/f08-bonus-ledger` a partir de `develop` (depois das TASK-F08-1 e F08-3), em worktree. ~55 arquivos.
- **Verificação:** `pnpm --filter @properfy/shared build test`; `pnpm --filter backend exec prisma generate`; `pnpm --filter backend typecheck lint test`; `test:integration` (5, 6, 9) e `test:integration:db` (4, 8) via subagente com resumo (memória `feedback_verify_backend_full_suite_includes_integration`); `generate:openapi` + `generate:types` commitados; `pnpm --filter web typecheck lint test` e `test:e2e` (12); `pnpm --filter pwa typecheck lint test`; QA no navegador (AM aprova → fatura paga → "Paid"; CL_ADMIN sem "Bonus"; PWA Earnings com "Bonus"); `git diff --stat origin/develop... | tail -1` < 150.

---

## Contratos exportados (para revisão e features futuras)

| Contrato | Onde | Uso |
|---|---|---|
| `InspectorProgramStandingService` (`getStanding`, `getActiveGoalProgress`, `getActiveGoalProgressForMany`, `hasEarlyAccess`) | `apps/backend/src/modules/inspector-program/application/inspector-program-standing.service.ts` | TASK-F08-2, TASK-F08-4 |
| `RunInspectorProgramDailyUseCase` + `InspectorProgramDailyStep` | `application/use-cases/run-inspector-program-daily.use-case.ts` | TASK-F08-4 (mensagens); a TASK-F08-6 não usa o job (integra na aprovação e na fatura) |
| `IOfferEarlyAccessPolicy` | `apps/backend/src/modules/service-group/domain/early-access.ts` | lista, detalhe e aceite do marketplace |
| `IRegionGoalUsageChecker` | `apps/backend/src/modules/service-region/domain/` | exclusão de região |
| `resolveInspectorLevel`, `isEarlyAccessLevel`, `minScoreForLevel`; `describeGoal` | `packages/shared/src/lib/` | web, PWA, backend |
| Chave `inspectorProgram` | `PLATFORM_SETTINGS_REGISTRY` | TASK-F08-2/3/4 |
| `ReliabilityFactsScope` e `completedServiceDates` | F07, estendidos pela TASK-F08-1 | métricas futuras por região/tipo |
| `InspectorProgramDailyTrigger` (`SCHEDULED`/`STARTUP`/`MESSAGES`) e `phase` dos passos (L-F08-01) | `run-inspector-program-daily.use-case.ts` | TASK-F08-1 (cálculo + enfileiramento das 08:00), TASK-F08-4 (mensagens) |
| `PLATFORM_SETTING_SAVE_HOOKS` (L-F08-08) | use case do `PUT /v1/platform-settings/:key` (F03, estendido pela TASK-F08-2) | `inspectorProgram.earlyAccess.enabledAt`; futuras chaves com campo derivado |
| `IRecentProgramNoticeReader` (L-F08-06) | `apps/backend/src/modules/inspector-program/domain/` | guarda de 7 dias da mensagem de nível |
| `IRewardAwardApprovalHook` (TASK-F08-1, no-op) → `BonusLedgerHook` | `apps/backend/src/modules/inspector-program/` | TASK-F08-6: lançamento `INSPECTOR_BONUS` na transação da aprovação/anulação |
| `IRewardAwardInvoiceSync` (`linkToInvoice`, `markPaidForInvoice`, `revertPaidForInvoice`) | porta em `apps/backend/src/modules/billing/domain/`, implementada pelo inspector-program | TASK-F08-6: fechamento, pagamento (unitário e lote) e estorno da fatura |
| `IBonusEntryWriter` | porta em `apps/backend/src/modules/inspector-program/domain/`, implementada pelo billing | TASK-F08-6: criar/anular/reverter o lançamento sem o prêmio importar o repositório financeiro |
| `invoiceSnapshotLineSchema.kind` (`SERVICE`/`BONUS`) | `packages/shared/src/schemas/responses.ts` | fatura do inspetor (web, PWA, PDF); futuras linhas sem atendimento |

## Achados para revisão

1. **Q12 ✅ decidida pelo cliente (2026-10-30): bônus no financeiro, aditivo (cláusula 9.4).** TASK-F08-6 (+3,5 dias); pagamento manual retirado das TASK-F08-1/3 antes de construir (−0,5); total 16,125 → **19,125**. Verificado @ `ba076fc4`: a fatura do inspetor é por período (sem FK lançamento→fatura) e só `PENDING_REVIEW` pode ser anulada, então "fatura anulada" vira dois casos: rejeitar rascunho (prêmio intocado, o lançamento entra no próximo pedido do período) e estornar pagamento `PAID → CLOSED` (prêmio volta a `APPROVED`). **Confirmar com o dev:** (a) **DQ10** — OP passa a ver o bônus na lista financeira (o ramo OP hoje força `tenant_id = actor.tenantId`; é ampliação de RBAC) ou só na aba Rewards e na fatura; (b) **DQ11** — vínculo `reward_awards.inspector_invoice_id` gravado no fechamento da fatura; (c) **DQ13** — período com total ≤ 0 (só reversão) bloqueia o pedido com 422 e vira ajuste manual; (d) reversão ligada pelo `reference_entry_id` existente (sem coluna nova), com índice único parcial.
2. **`minLevel` padrão `GOLD`.** `decisoes.md` só fixa H = 12 h. Com a janela desligada por padrão (DV3), o valor só importa quando o AM ligar; confirmar no onboarding.
3. **Premissas a confirmar:** taxa sem denominador = não atingida (P7; `LATE_NOTICE` sem atrasos é a exceção decidida em DV6); `INDEX_AT_LEAST` sobre o período da meta (P6; numa meta semanal exige 10 serviços na semana); "prometido" = bônus × participantes (P10); sequência pelo menor ciclo entre as metas de que o inspetor participou (P11); dados tardios não reabrem o período.
4. **Lacunas aplicadas (2026-10-29).** L-F08-01…14 aplicadas com as opções recomendadas (+2,0 dias: TASK-F08-1 +0,75, TASK-F08-2 +0,25, TASK-F08-3 +0,25, TASK-F08-4 +0,5, TASK-F08-5 +0,25). Desvios conscientes da proposta, verificados no snapshot: (a) L-F08-01 propunha `boss.schedule('inspector-program.daily', '0 8 * * *', …)`; no pg-boss 9 (`^9.0.3`) há um agendamento por nome e o segundo substituiria o das 04:45, então o run das 08:00 é um `enqueue` com `startAfter` na mesma fila (sem fila nova, como pedido); (b) a `dedupeKey` agregada usa `<periodEnd>` em vez de `<periodStart>` (semana e quinzena podem começar no mesmo dia e a F02 descartaria o segundo aviso).
5. **Reconciliação entre tarefas (2026-10-29).** Ajustes pedidos por F02 (L-F02-06/07/08), F07 (L-F07-02/05/07/08/09/12), X00 (L-X00-03) e X01 (L-X01-02/03/08) aplicados como DR1–DR7 (+0,125 na TASK-F08-1, só pelo `index_snapshot_date` de DR2). Escolha consciente em DR2: com o snapshot de hoje ausente às 04:45, o fechamento segue com o último snapshot em vez de esperar o `reliability.ensure-today`, porque o índice só serve ao desempate e ao `level_at_close`.

## Ajustes necessários em outras tarefas (para reconciliar)

- `F02-tarefas.md` (TASK-F02-1): expor uma leitura de avisos de sistema por prefixo de `dedupe_key` (ex.: `hasRecentSystemNotice({ dedupeKeyPrefix, since }) → boolean`, consulta `inspector_notices.dedupe_key LIKE '<prefix>%' AND created_at ≥ since`), para a guarda de 7 dias da mensagem de nível sem a F08 ler a tabela da F02 (L-F08-06).
- `F02-tarefas.md` (TASK-F02-3): o tile "Announcements" continua `col-span-2` no fim da grade do `ProfilePage`, agora depois de 5 tiles (Earnings, Challenges, Availability, Documents, My account); conferir o teste do hub (L-F08-09).
- `F03-tarefas.md` (TASK-F03-1): o use case do `PUT /v1/platform-settings/:key` aceita um mapa opcional `PLATFORM_SETTING_SAVE_HOOKS` (backend) aplicado depois da validação e antes da escrita/audit; a TASK-F08-2 registra o hook de `inspectorProgram` que grava `earlyAccess.enabledAt` (L-F08-08).
- `F04-tarefas.md` (DB1, seção "Perfil (hub de More)", Achado "More sem Challenges", nota do passo 8 do tour): trocar "linha Challenges em More" por "`ProfileTile` Challenges logo depois de Earnings na grade 2 colunas, sem grupo novo" (L-F08-09).
- `F07-tarefas.md` (TASK-F07-2, `ReliabilityIndexReader.getCurrentIndexes`/`position`): registrar que a F08 depende de `position` ser o ranking da plataforma inteira (todos os ACTIVE com `SCORED`) e que ele não pode ser recortado por região (03.A3) (L-F08-07).
- `F08-metas-recompensas.md` (plano): registrar DL1–DL14 e acrescentar ao estacionamento "teto de bônus por inspetor/período" (L-F08-04), "detecção automática de dado tardio" (L-F08-03) e "aviso de prêmio pago/anulado" (L-F08-05). (encaminhado: DL1–DL14 e os 3 itens registrados no plano, seções "Decisões das lacunas" e "Fora do escopo"; o `estacionamento.md` em si não foi tocado)
- `README.md` (fase2-etapa1): total da F08 14,0 → 16,0 dias (+2,0 das lacunas L-F08-01…14) → **19,125** (+0,125 da reconciliação DR2, +3,5 do aditivo Q12, −0,5 do pagamento manual retirado; 6 tarefas).
- `decisoes.md`: Q12 de "⚠️ assumida" para "✅ decidida pelo cliente em 2026-10-30: bônus no ledger e na fatura do inspetor, aditivo (cláusula 9.4), TASK-F08-6".
- `F08-metas-recompensas.md` (plano): "Quebra em PRs" ganha a TASK-F08-6; DL3, DL11 e DL14 revistas por Q12; estacionamento perde "bônus no financeiro".
- `paralelizacao.md` e `cronograma-sprints.md`: TASK-F08-6 (pista A2, 3,5 dias) depois das TASK-F08-1/3 e antes das TASK-F08-4 (merge) e F08-5; TASK-F08-1 6,875 e TASK-F08-3 2,25.
- `CLAUDE.md` da raiz, §8 (regras financeiras): acrescentar "bônus de meta do inspetor (`INSPECTOR_BONUS`, sem agência) entra na fatura do inspetor" (feito pela TASK-F08-6, passo 12).
