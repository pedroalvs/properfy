# F08 · Lacunas

Revisão de `tarefas/F08-tarefas.md` contra `F08-metas-recompensas.md`, `decisoes.md` (Q12 ⚠️ assumida, Q13, Q18), os contratos de F07/F02/F03/F04/X01 e o snapshot de `origin/develop`. Só entram pontos que um implementador teria de **adivinhar**; o que já está em D1–D12, DV1–DV6 e P1–P11 não é repetido.

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 14 | 3 | 5 | 6 |

---

## L-F08-01 · Mensagens automáticas disparam às 04:45 (push de madrugada) e sem agregação

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F08-4 · Objetivo, Testes 5–6, Algoritmos ("Meta atingida", "Sequência em risco"); TASK-F08-1 · Passo 11 (`45 4 * * *`).
- **O que falta / está ambíguo:** os 3 passos de mensagem rodam **dentro** do job `inspector-program.daily` às 04:45 Sydney e publicam na hora via `PublishSystemInspectorNoticeUseCase`. `PERFORMANCE_MESSAGE` é "caixa + push" (D10; F02 linha 295, `critical=false`). A F02 não tem janela de silêncio nem entrega agendada (`execute` não aceita `startAfter`; nenhuma menção a quiet hours no arquivo). Também não há agregação: um inspetor que atinge 4 metas na mesma semana recebe 4 pushes seguidos, mais o de nível, mais o de sequência.
- **Por que importa:** todo inspetor com meta atingida acorda com push às 04:45 de segunda-feira; o aviso "streak at risk" chega às 04:45 de domingo. Isso é o oposto do objetivo do programa (engajar) e vai gerar pedidos para desligar o push, o que derruba também os avisos críticos da F02/F04.
- **Evidência:** TASK-F08-1 passo 11 e teste 19 (`45 4 * * *`); TASK-F08-4 teste 6 ("roda os passos na ordem `closeGoalPeriods` → `sendGoalReachedMessages` → …"), teste 5 (um `publish` por `awardId`); F02-tarefas.md:295 e :1407 (sem parâmetro de agendamento); `grep -i "quiet|silenc|startAfter"` em F02-tarefas.md sem resultado.
- **Proposta de regra/detalhe:** separar o **cálculo** (04:45) do **envio**: o job diário grava o que deve ser enviado (os `createdAwardIds` já ficam em `ctx`; nível e risco podem ser decididos às 04:45 e enviados depois) e um segundo agendamento da **mesma fila** (`boss.schedule('inspector-program.daily', '0 8 * * *', { trigger: 'MESSAGES' })`, sem fila nova) executa só os passos de mensagem às 08:00 Sydney. Agregar por inspetor quando houver mais de um prêmio no mesmo run: título "You reached {n} goals this week", corpo listando os títulos; `dedupeKey` `program-goals-reached:<inspectorId>:<periodStart>`. Documentar o horário e a agregação na seção Contratos (dedupe keys).
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Envio às 08:00 pelo mesmo job com `trigger: 'MESSAGES'` + agregação por inspetor.
  2. Envio às 04:45 como está, mas agregado por inspetor (aceita o push de madrugada).
  3. Manter como está e registrar o risco (cada prêmio = 1 push às 04:45).

## L-F08-02 · Reativação e `endsAt` reescrevem períodos em que a meta estava invisível ou em andamento

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F08-1 · Teste 5 (`goalPeriodsToClose`, catch-up 8), Teste 13 (`GOAL_END_BEFORE_CLOSED_PERIOD`), Modelo de dados (`InspectorGoal`), Casos de borda 2–3; TASK-F08-3 · diálogo "Deactivate this goal?".
- **O que falta / está ambíguo:**
  1. **Reativação tardia.** `goalPeriodsToClose(goal, today, closedStarts)` só olha `starts_at`, `ends_at` e os fechamentos existentes. Não existe `deactivated_at`/`reactivated_at`. Uma meta desativada em 5 nov e reativada em 20 dez fecha, no catch-up, até 8 períodos **durante os quais a meta não aparecia para ninguém** (o PWA só lista metas ativas — TASK-F08-4 caso 3), gerando prêmios e "Prometido" retroativos. O caso de borda 3 cobre só "reativada no dia seguinte".
  2. **`endsAt` encurtado.** `GOAL_END_BEFORE_CLOSED_PERIOD` bloqueia só períodos já **fechados**; é permitido pôr `endsAt` = fim do último período fechado, o que **cancela o período corrente** que os inspetores veem com progresso, sem aviso e sem auditoria específica (vira um `inspector_goal.updated` comum).
  3. **`target`/`rewardAmount` editados** entre o fim do período (domingo 23:59) e o fechamento (segunda 04:45) valem para o fechamento (caso de borda 2), isto é, o resultado que o inspetor acompanhou pode mudar depois de o período terminar.
- **Por que importa:** (1) a OP recebe dezenas de prêmios PENDING de períodos "fantasma" e precisa anular um a um; o inspetor recebe mensagem "Goal reached" por semanas em que não sabia da meta. (2) e (3) são a brecha mais fácil para disputa com inspetor ("eu bati a meta e ela sumiu / o alvo subiu").
- **Evidência:** TASK-F08-1 teste 5 ("hoje `2026-11-23`, fechado `['2026-11-02']` → `['2026-11-09', '2026-11-16']` (catch-up)"), modelo sem coluna de desativação, teste 13 (`GOAL_END_BEFORE_CLOSED_PERIOD` só para período fechado), casos de borda 2–3; TASK-F08-4 caso de borda 3 ("Meta desativada no meio do período: some na próxima leitura").
- **Proposta de regra/detalhe:** gravar `deactivated_at` (instante; nulo quando ativa) e, na reativação, mover o cursor de fechamento para a frente: períodos cujo **início** é anterior à reativação e que não foram fechados enquanto a meta estava ativa são registrados como `GoalPeriodClosure` com `trigger 'SKIPPED_INACTIVE'`, `participants_count 0`, sem prêmios (assim o catch-up não os reabre e o relatório mostra o buraco). `endsAt` só pode ser ≥ fim do **período corrente** (`GOAL_END_IN_CURRENT_PERIOD` quando menor; para encerrar já, usar "Deactivate"). Congelar `target` e `rewardAmount` **por período**: qualquer PATCH nesses campos passa a valer a partir do **próximo** período (o fechamento usa os valores vigentes em `period_end` 23:59:59 Sydney — basta guardar `effective_from` = início do próximo período no PATCH e ler o valor correto no fechamento). Copy do formulário: "Changes to target and bonus apply from the next period."
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** `deactivated_at` + períodos pulados registrados; `endsAt` ≥ período corrente; `target`/`rewardAmount` valem do próximo período.
  2. Só o item de reativação (pular períodos inativos); aceitar edição imediata de alvo/bônus com o aviso no formulário.
  3. Manter como está e documentar que reativar após N períodos gera catch-up (a OP anula o que não quiser).

## L-F08-03 · `PAID` é terminal: dados tardios depois do pagamento e "pago por engano" não têm saída

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F08-1 · Algoritmo B ("Dados tardios"), Teste 12 ("anular `PAID` → 409"), Contratos (ações de prêmio); TASK-F08-5 (o relatório reflete o status).
- **O que falta / está ambíguo:** o Algoritmo B diz que, se um DONE virar REJECTED (ou a execução for abandonada) depois do fechamento, "a OP anula o prêmio (VOID com motivo)". Mas `VOID` só é permitido em `PENDING`/`APPROVED` e não existe transição a partir de `PAID` (nem `PAID → APPROVED` para corrigir um clique errado em "Mark as paid"). Também não há nenhum sinal para a OP de que o dado mudou (o prêmio continua "Approved"/"Paid" no painel).
- **Por que importa:** o caso mais provável de prêmio indevido (serviço rejeitado pela agência dias depois, memória `DONE → REJECTED` emite `DONE_REJECTED` para compensação financeira) acontece **depois** do pagamento semanal/quinzenal. O ledger tem reversão; o programa não teria registro nenhum, e o relatório `INSPECTOR_PROGRAM` ficaria errado para sempre.
- **Evidência:** TASK-F08-1 Algoritmo B, último bullet; teste 12 linha "anular `PAID` → 409 ("Paid rewards can't be voided")"; `reward_awards_status_fields_chk` sem estado de estorno; CLAUDE.md §5 (`DONE → REJECTED` emite `DONE_REJECTED`).
- **Proposta de regra/detalhe:** manter `PAID` como "dinheiro saiu" e acrescentar **uma** transição `PAID → VOID` restrita a **AM**, com motivo obrigatório e campo `recovery_note` opcional (como o dinheiro foi recuperado, fora da plataforma); `voided_at` preenchido; o CHECK muda para permitir `paid_at` em `VOID`. O painel mostra "Voided after payment" e o relatório ganha a coluna `Paid then voided`. Para "pago por engano" sem recuperação, o mesmo caminho serve. Não criar `PAID → APPROVED` (ambiguidade de `paid_at`). Observabilidade: nenhuma detecção automática de dado tardio nesta fase (fora do escopo, registrar no estacionamento).
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** `PAID → VOID` só AM, com motivo; CHECK ajustado; coluna no relatório.
  2. `PAID` terminal, como está; registrar no estacionamento e orientar a OP a compensar manualmente fora da plataforma (sem rastro no sistema).
  3. Esperar a resposta da Q12: se o bônus entrar no financeiro, o estorno vira um lançamento; se não, voltar à opção 1.

## L-F08-04 · Metas sobrepostas: um serviço conta para várias metas e não há teto por período

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F08-1 · P10 ("Prometido"), Algoritmo B, `summarizePeriod`; TASK-F08-3 · tile "Promised"; TASK-F08-4 · `openCashTotal`.
- **O que falta / está ambíguo:** nada diz, em nenhuma tarefa, se as metas são independentes (o mesmo DONE conta em `VOLUME`, `REGION_VOLUME`, `SERVICE_TYPE_VOLUME` e em todas as taxas ao mesmo tempo) nem se existe um limite de bônus por inspetor por período. O "Prometido" soma `reward_amount × participantes` de todas as metas, e `openCashTotal` ("Up to $110 in bonuses") soma todas as metas em que o inspetor participa. Um implementador vai assumir independência; a OP, ao ver "Promised $18.000" numa semana com 3 metas e 60 inspetores, vai perguntar se isso é mesmo o teto.
- **Por que importa:** sem a regra escrita, (a) o painel e a mensagem do app podem prometer mais do que a operação pretende pagar; (b) qualquer pedido futuro de "máximo por inspetor por semana" muda o fechamento, o resumo e o PWA ao mesmo tempo.
- **Evidência:** P10; TASK-F08-1 teste 10 (`promised 540` = soma simples); TASK-F08-3 ajuda do tile ("The most you could pay if every eligible inspector reached every goal."); TASK-F08-4 linha "Up to {openCashTotal} in bonuses".
- **Proposta de regra/detalhe:** registrar como decisão explícita: **metas são independentes e cumulativas; um serviço conta em todas as metas cujo escopo ele satisfaz; não há teto por inspetor nem orçamento por período nesta fase.** Acrescentar ao formulário de meta um aviso quando já existir meta ativa com o mesmo `period` e escopo sobreposto ("Inspectors can earn this on top of {n} other active {period} goals."). Estacionar "teto por inspetor/período".
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Independentes e cumulativas, sem teto; aviso informativo no formulário.
  2. Teto opcional por inspetor por ciclo no `PlatformSetting` (`maxBonusPerInspectorPerCycle`), aplicado no fechamento com ordem P9 (mais 0,5 dia).

## L-F08-05 · Prêmio anulado: o inspetor vê "Voided" sem motivo e sem aviso

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F08-4 · Contratos (`awards[]`), UI "My results" (chip "Voided"), D10 (3 gatilhos de mensagem); TASK-F08-1 · `voidAwardSchema`.
- **O que falta / está ambíguo:** `awards[]` do `GET /v1/inspector/program` não traz `voidReason` (nem `approvedAt`), e nenhum dos 3 gatilhos de mensagem cobre anulação ou pagamento. O inspetor recebeu "Goal reached… Your $30.00 bonus will be reviewed before payment" e, dias depois, vê só um chip "Voided". Também não está dito se o `void_reason` (texto livre da OP, 5–500) é **interno** ou **para o inspetor** — o que muda como a OP o escreve.
- **Por que importa:** é a situação com maior chance de reclamação e de ticket de suporte; o texto livre da OP pode conter informação que não deve chegar ao inspetor (ex.: "agência X rejeitou por suspeita de fraude").
- **Evidência:** TASK-F08-4 Contratos (`awards: Array<{ goalTitle, metric, periodType, periodStart, periodEnd, amount, achievedValue, status, paidAt }>`); UI "chip Pending approval / Approved / Paid / Voided"; D10.
- **Proposta de regra/detalhe:** `void_reason` é **interno** (AM/OP e relatório). O diálogo "Void reward" ganha um segundo campo opcional `inspectorNote` (≤ 200, mostrado no app) e o rótulo do primeiro vira "Internal reason". `awards[]` ganha `voidedAt` e `inspectorNote: string | null`; o chip "Voided" mostra a nota quando existir, senão "Contact the Properfy team for details." Sem mensagem automática nova (fora dos 3 gatilhos do contrato); registrar no estacionamento "aviso de prêmio pago/anulado".
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Motivo interno + nota opcional ao inspetor no mesmo diálogo.
  2. Motivo único, sempre visível ao inspetor (copy do diálogo avisa "The inspector will see this").
  3. Nada visível além do chip (como está); documentar.

## L-F08-06 · Nível sem histerese: inspetor na fronteira recebe "You're now Gold / Silver" em dias alternados

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F08-4 · Teste 5 ("subiu"/"desceu"), Algoritmo "Mudança de nível", dedupe `program-level:<inspectorId>:<snapshotDate>`; D3.
- **O que falta / está ambíguo:** D3 fixa o nível como faixa do índice **atual** (sem histerese — decidido). O que não está definido é o comportamento da **mensagem** quando o índice oscila na fronteira (84,9 ↔ 85,0 numa janela móvel de 30 dias muda todo dia que um serviço antigo sai da janela). O dedupe é por dia, então o limite é 1 mensagem/dia/inspetor, indefinidamente. O acesso antecipado também liga/desliga a cada dia para esse inspetor (caso de borda 5 da TASK-F08-2), mas isso é consequência direta de D3.
- **Por que importa:** mensagens contraditórias em dias seguidos corroem a credibilidade do índice e do push; a F02 não tem supressão por frequência.
- **Evidência:** TASK-F08-4 teste 5 (linhas "subiu", "desceu"), Algoritmo "Mudança de nível" (compara só `latest` com `latest − 1`); caso de borda 8 ("sem rajada" trata só de limites alterados, não de oscilação).
- **Proposta de regra/detalhe:** manter D3 para nível e acesso antecipado; só a **mensagem** ganha um guarda: não publicar mudança de nível se já houve mensagem `program-level:<inspectorId>:*` nos últimos **7 dias** (consulta por `dedupeKey LIKE` ou por um `last_level_message_at` derivado da caixa de avisos). Log `inspector_program.level_messages_skipped { reason: 'RECENT_MESSAGE' }`. Copy da descida continua a mesma.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Guarda de 7 dias só na mensagem.
  2. Mensagem só na subida (descida fica visível em "My results", sem push).
  3. Sem guarda (1/dia como está).

## L-F08-07 · Coorte do ranking não é declarada (plataforma inteira, não região)

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F08-4 · Algoritmo "Ranking anônimo", UI "You're #4 of 37", DV4; F07 TASK-F07-2 (`position`).
- **O que falta / está ambíguo:** a F08 reusa `position` do `getCurrentIndexes()` da F07, que é o ranking de competição **entre todos os inspetores ACTIVE com `SCORED` na plataforma** (F07-tarefas.md:1158). Em nenhum lugar da F08 isso é dito ao implementador nem ao inspetor: o app diz "of 37" sem explicar que são todos os inspetores da plataforma (não os da região, do tipo de serviço ou das metas em que ele participa). A coorte mínima de 5 (DV4) também é contada sobre essa população.
- **Por que importa:** um inspetor de Perth comparado com 36 de Sydney vai questionar o ranking; o spec writer pode "melhorar" recortando por região e quebrar o 03.A3 (coortes pequenas reidentificam). Precisa ser regra escrita.
- **Evidência:** F07-tarefas.md:1158 ("`position` = ranking de competição entre ACTIVE com `SCORED`"); TASK-F08-4 Algoritmo ("`ranked = [...indexes].filter(position ≠ null)`"), rodapé "Other inspectors are shown without names. Updated daily."
- **Proposta de regra/detalhe:** registrar: **a coorte do ranking é a plataforma inteira (todos os inspetores ACTIVE com score), independente de região, tipo de serviço ou metas**; nunca recortar por região (privacidade). Rodapé do app: "Ranked against all active inspectors on the platform. Other inspectors are shown without names. Updated daily."
- **Precisa de decisão do dev?** Não.

## L-F08-08 · Ligar o acesso antecipado esconde ofertas já visíveis; `opensAt` sem data na mensagem

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F08-2 · Casos de borda 3 e 5, Contratos (403 `OFFER_EARLY_ACCESS_ONLY`), Deploy ("Um AM liga em Platform settings").
- **O que falta / está ambíguo:** quando o AM liga `earlyAccess.enabled`, todo grupo publicado nas últimas H horas (e para D+2 ou depois, com qualificado elegível) **desaparece** da lista de quem não qualifica, inclusive de quem estava com o detalhe aberto; o aceite devolve 403 com "Try again after 10:00 pm", sem dizer o dia (H pode chegar a 72 h). O mesmo acontece quando o AM aumenta H. Não há regra sobre aplicar a janela só a publicações **posteriores** à mudança do setting, nem copy no PWA para a oferta que sumiu.
- **Por que importa:** a primeira ativação em produção acontece com ofertas no ar; inspetores verão ofertas sumir e um erro cuja hora parece já ter passado ("after 10:00 pm" às 23:00 de hoje significa amanhã?).
- **Evidência:** TASK-F08-2 caso de borda 3 ("Setting alterado: vale na próxima leitura"); Contratos ("Try again after {h:mm a}"); Algoritmos (`cutoffUtc = now − hours`, sem referência ao momento em que o setting mudou).
- **Proposta de regra/detalhe:** a janela só vale para grupos com `published_at ≥ earlyAccess.enabledAt` (gravar `enabledAt` no próprio valor do setting quando `enabled` passa de false para true; o schema aceita `enabledAt: string | null`, preenchido pelo backend no PUT). Aumentar H não retroage para grupos já fora da janela antiga (usar `min(published_at + H_novo, published_at + H_vigente_na_publicação)` é complexo; aceitar o retroativo de H e documentar). Mensagem do 403: "This offer opens to all inspectors on {EEE d MMM} at {h:mm a}." (Sydney), com `details.opensAt` ISO.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** `enabledAt` no setting; janela só para publicações posteriores; mensagem com dia e hora.
  2. Só a mensagem com dia e hora; aceitar o sumiço na ativação e registrar no runbook do onboarding ("ligar fora do horário comercial").

## L-F08-09 · Hub More: "linha no grupo Work" não existe no `ProfilePage` (é uma grade de tiles)

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F08-4 · Passo 6, UI "Linha em More (grupo 'Work')", Teste 7 ("More: linha 'Challenges' com subtítulo").
- **O que falta / está ambíguo:** a F04 (DB1 revisada em 2026-10-28 e a seção "Perfil (hub de More)") e o código atual (`apps/pwa/src/features/profile/pages/ProfilePage.tsx:74-97`) definem o hub como **grade 2×2 de `ProfileTile`** (Earnings, Availability, Documents, My account) + tile "Announcements" `col-span-2` (F02-3), sem grupos nomeados nem "linhas". A F08 descreve "linha 'Challenges' no grupo 'Work' (entre Earnings e Announcements, como no design v3)" com subtítulo dinâmico, o que não mapeia para o componente existente nem para a posição na grade.
- **Por que importa:** o implementador terá de escolher entre criar um layout novo no hub (fere "reusar o que existe" e a DB1) ou adaptar o tile — e a ordem/colspan muda a grade inteira.
- **Evidência:** F04-tarefas.md:1504 e :1548; `ProfilePage.tsx:74` (`grid grid-cols-2`), `:75-97` (4 tiles); TASK-F08-4 passo 6 e teste 7.
- **Proposta de regra/detalhe:** `ProfileTile` com `label "Challenges"`, `value` = "Up to $110 in bonuses" / "See your goals and ranking", `to="/profile/challenges"`, ícone de troféu, inserido **imediatamente depois de Earnings** (mesma célula de largura 1; Announcements continua `col-span-2` no fim). Nenhum grupo/título novo no hub.
- **Precisa de decisão do dev?** Não.

## L-F08-10 · Rota de períodos: parâmetros divergem entre teste e contrato

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F08-1 · Teste 13 (`GET /periods?periodType=FORTNIGHTLY&from=current&count=3`) × Contratos (`periodType`, `direction` (`upcoming`|`past`), `count ≤ 26`); TASK-F08-3 · teste 4 (`direction=upcoming&count=13`) e teste 5 (`direction=past&count=12`).
- **O que falta / está ambíguo:** o teste 13 usa `from=current`; o contrato e o web usam `direction=upcoming`. Também não está dito se `direction=past` inclui o período corrente (o RewardsTab precisa de "past + corrente 'In progress'", que ele monta de dois pedidos ou de um só?).
- **Por que importa:** o `programPeriodsQuerySchema` será escrito uma vez; o teste de contrato e o web vão divergir.
- **Evidência:** TASK-F08-1 linha do teste 13 vs. tabela de Contratos; TASK-F08-3 teste 5 ("`GET /periods?direction=past&count=12` + corrente 'In progress'").
- **Proposta de regra/detalhe:** fixar `direction: 'upcoming' | 'past'`; `upcoming` começa no corrente (`status IN_PROGRESS`) e segue para a frente; `past` começa no último **fechado** e volta no tempo (sem o corrente). O RewardsTab faz `past&count=12` e acrescenta o corrente de `upcoming&count=1`. Corrigir o teste 13 para `direction=upcoming`.
- **Precisa de decisão do dev?** Não.

## L-F08-11 · `paidOn`: "hoje" e "≥ data da aprovação" sem fuso nem tipo definidos

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F08-1 · Teste 12 ("aceita `paidOn` ≤ hoje e ≥ data da aprovação"), Caso de borda 13; TASK-F08-3 · diálogo "Mark as paid" ("Paid on" padrão hoje).
- **O que falta / está ambíguo:** `paidOn` é data civil; `approved_at` é instante UTC. "Hoje" no servidor é Sydney (`PLATFORM_TIMEZONE`), mas o web preenche "hoje" com a data do navegador (um OP em fuso adiantado/atrasado manda uma data que o servidor recusa como futura). Não está dito como `paid_at` (instante) é derivado de `paidOn` (meia-noite Sydney? agora, quando `paidOn` = hoje?).
- **Por que importa:** 400 intermitente no fim do dia e `paid_at` inconsistente no relatório ("Paid at" em fuso do solicitante).
- **Evidência:** TASK-F08-1 teste 12, caso de borda 13; TASK-F08-3 teste 5; memória `project_civil_date_vs_instant_wire_split`.
- **Proposta de regra/detalhe:** `paidOn` civil em Sydney; validação `paidOn ≤ todaySydney` e `paidOn ≥ civilDateInTimezone(approved_at, Sydney)`; `paid_at = paidOn === todaySydney ? now : endOfCivilDayInTimezone(paidOn, Sydney)`. O web obtém "hoje" do servidor (a rota de períodos já devolve o corrente) ou calcula em `Australia/Sydney`, nunca no fuso do navegador (memória `project_sydney_only_timezone`).
- **Precisa de decisão do dev?** Não.

## L-F08-12 · Metas futuras e metas criadas no meio do período: o que o inspetor vê e quando

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F08-1 · Teste 5 (`currentGoalPeriod` → `null` antes de `starts_at`), Caso de borda 1; TASK-F08-4 · aba Active, Caso de borda 2.
- **O que falta / está ambíguo:** uma meta com `starts_at` na próxima segunda não aparece em lugar nenhum do app até começar (Active só lista período corrente); não há "Upcoming" nem aviso. E uma meta criada na quarta já aparece com progresso desde segunda (P5), sem explicação. Também não está dito se a mensagem de "meta nova" existe (D10 lista só 3 gatilhos — então não existe, mas o spec deve dizer isso).
- **Por que importa:** o objetivo do programa (03.6) é mudar comportamento; uma meta que o inspetor só descobre no dia em que começa, ou que já vem "atrasada", perde efeito e gera a pergunta "desde quando conta?".
- **Evidência:** TASK-F08-1 teste 5 (`currentGoalPeriod` nulo antes de `starts_at`); TASK-F08-4 UI Active (sem seção de futuras), D10.
- **Proposta de regra/detalhe:** na aba Active, uma seção "Starting soon" com metas ativas cujo `starts_at` está nos próximos **7 dias** (`GoalProgress.state 'UPCOMING'`, `value null`, texto "Starts {EEE d MMM}"); e, no card de meta criada no meio do período, nada muda (o período é canônico), mas a descrição ganha "Counts jobs since {periodStart}". Sem mensagem automática nova.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Seção "Starting soon" (7 dias) + "Counts jobs since".
  2. Só o texto "Counts jobs since"; metas futuras continuam invisíveis.

## L-F08-13 · Relatório e `describeGoal` com região apagada

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F08-5 · Colunas ("Goal description (`describeGoal`)", "Scope"), Caso de borda 2; TASK-F08-3 · `describeGoal` (`REGION_VOLUME` "{n} inspections in {region}"); TASK-F08-1 · `onDelete: SetNull`.
- **O que falta / está ambíguo:** uma meta `REGION_VOLUME` inativa pode ter `scope_region_id` nulo (região apagada). `describeGoal` recebe `region` nulo; o relatório tem as colunas "Scope" e "Goal description" para fechamentos antigos dessa meta, e o `RewardAward` não guarda o nome da região na fotografia. O caso de borda 2 cobre só renomeação do título.
- **Por que importa:** linhas do XLSX com "{n} inspections in undefined" ou vazias, sem como reconstruir o escopo histórico.
- **Evidência:** TASK-F08-1 modelo (`scope_region_id String?` SetNull; `RewardAward` sem `scope_label`); TASK-F08-5 colunas; TASK-F08-3 `describeGoal`.
- **Proposta de regra/detalhe:** acrescentar `scope_label String? @db.VarChar(200)` à fotografia do `RewardAward` **e** ao `GoalPeriodClosure` (nome da região/tipo/inspetor no fechamento). `describeGoal` aceita `scopeLabel: string | null` e cai em "{n} inspections in a deleted region" quando nulo. A coluna "Scope" do relatório usa a fotografia; o `GoalResponse` já tem `scopeRegionDeleted`.
- **Precisa de decisão do dev?** Não.

## L-F08-14 · Copy do inspetor não diz que o bônus fica fora da fatura e dos ganhos

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F08-4 · UI (rodapé "Bonuses are reviewed by the Properfy team before payment."; mensagem "Your $30.00 bonus will be reviewed before payment."); TASK-F08-3 · rodapé do formulário ("Bonuses are paid outside Properfy…"); D1 (Q12 ⚠️).
- **O que falta / está ambíguo:** com Q12 assumida fora do financeiro, o bônus **não** aparece em Earnings nem na fatura do inspetor (`INSPECTOR_PAYOUT` filtrado nos 3 leitores). Só a OP é avisada disso (rodapé do formulário). O inspetor vê "Paid" em Challenges e nada em Earnings/fatura, e o texto atual não diz onde nem como o pagamento chega. Tributação/ABN está fora do escopo (decidido), mas a copy precisa ao menos não sugerir que o valor integra a fatura.
- **Por que importa:** ticket previsível ("marcou pago mas não está na minha fatura"), e se o cliente responder a Q12 com "entra na fatura", a copy terá de mudar — melhor deixá-la neutra já.
- **Evidência:** TASK-F08-4 UI Active (rodapé) e Teste 5 (corpo da mensagem); plano "Estado atual" ("Ajustes nunca chegam à fatura nem aos ganhos do inspetor"); plano "Fora do escopo: Tributação".
- **Proposta de regra/detalhe:** rodapé de Active e de "My results": "Bonuses are reviewed by the Properfy team and paid separately from your invoice. They don't appear in Earnings." Mensagem de meta atingida: "…Your $30.00 bonus will be reviewed and paid separately from your invoice." Se Q12 mudar, só essas duas strings mudam.
- **Precisa de decisão do dev?** Não.
