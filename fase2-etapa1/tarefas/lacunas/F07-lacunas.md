# F07 · Lacunas

Revisão de `tarefas/F07-tarefas.md` (plano `F07-indice-confiabilidade.md`; contratos F03/F04; consumidor F08). Código verificado no snapshot read-only de `origin/develop`. Nada do que já está nas tabelas "Decisões" (D1–D12, P1–P11, Q18) é reaberto aqui: mediana par, pesos em 0, soma livre dos pesos, janela até ontem, arredondamento half-up, tie-break por nome e exclusão de `NO_ANSWER`/`KEY_FAILED`/`TENANT_*` já estão decididos e testados.

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 12 | 3 | 6 | 3 |

Decisão do dev necessária em: L-F07-01, L-F07-02, L-F07-03, L-F07-04, L-F07-05, L-F07-06, L-F07-07, L-F07-09, L-F07-12.

---

## L-F07-01 · Incentivo invertido: quem avisa "não consigo ir" é penalizado; quem simplesmente não aparece não gera fato nenhum

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F07-1 · P1 (universo), D10, métrica 6 `CANT_ATTEND`, métrica 1 `NO_SHOW`; "Casos de borda · No-show sem linha de execução".
- **O que falta / está ambíguo:** D10 diz que "não iniciou" conta como falha quando o appointment "foi rejeitado por motivo do inspetor". P1 implementa isso **só** pelo evento `CANT_DO CANT_ATTEND` (autorrelato do inspetor). Não existe nenhum outro caminho: `RejectionReasonCode` não tem código de culpa do inspetor utilizável pela OP (`INVALID_ADDRESS`, `PROPERTY_INACCESSIBLE`, `SAFETY_CONCERN`, `INSUFFICIENT_INFO`, `SERVICE_NOT_AVAILABLE`, `TENANT_NO_RESPONSE`, `TENANT_DECLINED`, `OTHER`), e o `INSPECTOR_UNABLE` da F03 é `SYSTEM_ONLY` (só nasce do `cant-do`). `CancellationReasonCode.INSPECTOR_UNAVAILABLE` existe, mas cancelamento está fora do universo (P1). Também não há distinção entre um `CANT_ATTEND` dado com 10 dias de antecedência (F03 permite "Can't do this job" em data futura) e um dado às 09:00 do próprio dia.
- **Por que importa:** cenário: o inspetor A não aparece, não avisa, o inquilino reclama; a OP rejeita o SCHEDULED com `OTHER` ("inspector no-show") e reoferta. Resultado na F07: A **não ganha fato nenhum** (volume, pontualidade e `CANT_ATTEND` intactos). O inspetor B, que avisou na véspera com `CANT_ATTEND`, perde em duas métricas (6 e, como `NO_SHOW`, na 1). Com o ranking visível à OP e níveis/acesso antecipado na F08 (Q13), o comportamento ótimo passa a ser **não reportar**. O 03.3 do contrato (aviso com antecedência) premia o oposto.
- **Evidência:** `packages/shared/src/enums/reason-codes.ts:17-32` (sem código de inspetor); F03-tarefas linha 464 (`INSPECTOR_UNABLE` recusado a atores humanos); `execute-status-transition.use-case.ts:335-340` (reject/cancel soltam o inspetor, por isso a OP não tem como "marcar culpa"); F07-tarefas tabela do universo (3 origens, nenhuma por rejeição da OP); F03-tarefas linha 979 ("Data futura: … 'Can't do this job' disponível (motivo `CANT_ATTEND`)").
- **Proposta de regra/detalhe:** (1) acrescentar ao shared `RejectionReasonCode.INSPECTOR_NO_SHOW` ("Inspector didn't attend"), permitido a OP/AM em `SCHEDULED → REJECTED`, e tratá-lo na F07 como 4ª origem do universo: fato `INSPECTOR_NO_SHOW` atribuído ao `metadata.releasedInspectorId` do `status_transition` (mesmo pareamento da Q2), data = `scheduled_date`, entra nas métricas 1 (`NO_SHOW`) e 6 (como falta) e no volume; (2) `CANT_ATTEND` com `effectiveNoticeAt < windowStartAt − 24 h` (constante `CANT_ATTEND_EARLY_NOTICE_HOURS = 24`) fica **fora da métrica 1** (não é no-show: a OP teve um dia para reofertar) e continua na 6; (3) teste 10/12 com os dois casos e contraprova "sem `INSPECTOR_NO_SHOW` a OP não tem como penalizar".
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Código `INSPECTOR_NO_SHOW` (+0,25 dia: enum, `StatusTransitionDialog`, 4ª origem no leitor) e `CANT_ATTEND` antecipado fora da métrica 1.
  2. Só o item (2) (aliviar o aviso antecipado) e registrar explicitamente que "no-show sem reporte não é medido na Fase 2" — aceita o viés.
  3. Manter como está e documentar como limitação em "Achados"; a OP compensa com `DONE → REJECTED`? Não serve: exige um DONE prévio.

## L-F07-02 · Job que falha deixa o ranking envelhecendo em silêncio: nenhum alerta, nenhum rótulo de "desatualizado", nenhuma nova tentativa no mesmo dia

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F07-2 · "Algoritmo do job", "Casos de borda · Job falha no meio / Timeout", "Deploy"; TASK-F07-3 · subtítulo "Updated …"; handoff F08 (item 4, `getCurrentIndexes`).
- **O que falta / está ambíguo:** a tarefa diz "o snapshot do dia anterior continua sendo o atual; pg-boss tenta de novo; alerta pelo `system.dlq-monitor`". Três buracos: (a) o `dlq-monitor` só alerta com **≥ 10 jobs `failed` na mesma fila**; um job diário que esgota as 6 tentativas vira **1** linha `failed` → só `logger.warn`, sem alerta; (b) a API e a página usam "a última `snapshot_date` existente" sem nenhum critério de frescor: o subtítulo mostra "Updated 28 Nov" e a OP tem que perceber sozinha; (c) não há nova tentativa dentro do dia: o `ensureTodaySnapshot` só roda no boot, e o próximo agendamento é 04:15 do dia seguinte. A F08 assume "às 04:45 já inclui o snapshot de hoje" (F08-tarefas linha 592) e deriva níveis e acesso antecipado (Q13) desse índice.
- **Por que importa:** uma migration lenta, um `timeout: 120_000` estourado por crescimento de volume ou um bug num fuso novo faz o job falhar 6× de madrugada. Durante dias (até alguém abrir a página e estranhar a data) o ranking, os níveis da F08 e o acesso antecipado ficam congelados num snapshot antigo, e um salvamento de pesos (03.A1) também "some" sem feedback: a snackbar diz "Scores are being recalculated" e nada acontece.
- **Evidência:** `apps/backend/src/shared/infrastructure/dlq-monitor.ts:24,44` (`threshold: 10`, contagem por fila); `queue.ts:115-116` (`retryLimit: 6`, `retryBackoff: true` globais — logo "retry padrão" existe, mas termina em 1 linha `failed`); F07-tarefas "Casos de borda" da TASK-F07-2 e teste 3 da TASK-F07-3 (sem estado "stale"); F08-tarefas linha 592.
- **Proposta de regra/detalhe:** (1) no catch do job: `logger.error('reliability.snapshots_failed', { snapshotDate, trigger, reason, attempt })` (hoje só o TIMEOUT é citado); (2) `ensureTodaySnapshot` também agendado de hora em hora entre 05:00 e 12:00 Sydney (`reliability.ensure-today '0 5-12 * * *'`), sem `singletonKey`, idempotente pelo lock — cobre falha transitória e máquina fora do ar às 04:15; (3) API do ranking devolve `isStale: snapshotDate < hoje (Sydney)`; a página mostra `InfoBanner` "Scores haven't been updated since {date}. The nightly job didn't finish; operations has been notified." e o drawer o repete; (4) `getCurrentIndexes` já devolve `snapshotDate` — a F08 deve registrar `index_snapshot_date` no fechamento (é dela, mas o contrato exportado deve dizer que o consumidor **não pode assumir** `snapshotDate = hoje`); (5) teste: job falha → ranking com `isStale true`; `ensure-today` às 05:00 refaz.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Itens 1–5 (~0,25 dia); o alerta operacional fica no log `error` (já capturado) sem mexer no limiar do DLQ.
  2. Só itens 1 e 3 (observabilidade + rótulo), sem retry horário; aceitar até 24 h de atraso.
  3. Baixar o limiar do `dlq-monitor` para 1 nas filas diárias (mexe em infraestrutura compartilhada; fora do escopo da F07).

## L-F07-03 · `SATISFACTION` sem mínimo de respostas: uma única nota 1 vale −12,5 pontos no score

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F07-1 · métrica 4, P5, `reliabilityIndexSettingSchema`; TASK-F07-3 · linha "Tenant satisfaction".
- **O que falta / está ambíguo:** P5 define só "sem pesquisa → `null`". Com **1** pesquisa a métrica entra com peso cheio. A taxa de resposta das pesquisas é baixa por natureza (link enviado ao inquilino depois do DONE) e nada impede que o único respondente do mês seja o inquilino insatisfeito. Não há `minimumRatings`, nem amortecimento, nem indicação no drawer de que a métrica está apoiada numa amostra de 1. As outras métricas têm piso natural (`minimumVolume` 10 cobre o denominador delas); a 4 é a única cujo denominador é independente do volume.
- **Por que importa:** Eva (10 serviços, tudo perfeito, score 100) recebe uma única pesquisa com nota 1 por um problema do imóvel (mofo, chave errada da agência) → `rate 0` → score cai para `(7×1 + 0)/8 = 87,5`, de 1º para 4º no ranking; com os limites da F08 (Gold ≥ 85) ela quase perde o nível por um respondente. A OP não tem como explicar isso ao inspetor nem a F07 oferece válvula (o peso 0 em `SATISFACTION` desliga a métrica para **todos**).
- **Evidência:** F07-tarefas P5; tabela de métricas (linha 4: "serviços … com pesquisa", sem mínimo); `reliabilityIndexSettingSchema` (3 campos: `weights`, `minimumVolume`, `volumeReferenceOverride`); teste 8 (Ana com 4 pesquisas é o menor caso testado; não há caso com 1).
- **Proposta de regra/detalhe:** campo `minimumRatings: z.number().int().min(1).max(50)` na chave `reliabilityIndex` (default **3**); `eligibleCount < minimumRatings` → `rate null` (renormaliza, P5) e o drawer mostra "Not enough ratings · 1 of 3 needed" em vez do valor; o `settings_json` grava o valor usado; teste 2 (schema), 8 (1 e 2 pesquisas → `null`; 3 → calcula) e 9 (score renormalizado); seção de settings ganha o 11º campo "Minimum ratings for satisfaction" (1–50).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** `minimumRatings` configurável, default 3 (~0,25 dia no total das 3 tarefas).
  2. Amortecimento bayesiano fixo (prior = média da plataforma com peso de 3 respostas): sem campo novo, mas a fórmula fica mais difícil de explicar e de auditar — contraria o objetivo de explicabilidade.
  3. Manter 1 resposta como suficiente e exibir o `eligibleCount` em destaque ("based on 1 rating"); aceita a distorção.

## L-F07-04 · `DONE_REJECTED` penaliza o inspetor em qualquer `DONE → REJECTED`, inclusive correção de erro administrativo

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F07-1 · métrica 8, Q2, P1 ("a penalidade da métrica 8 é dele").
- **O que falta / está ambíguo:** o audit `appointment.done_rejected` não guarda motivo estruturado (só `reason` livre e `requiresFinancialReview: true`), e o `rejection_reason_code` gravado na transição é um dos códigos genéricos de rejeição (`INVALID_ADDRESS`, `INSUFFICIENT_INFO`, `OTHER`…), nenhum deles "serviço marcado como feito mas não executado" (regra financeira 5 do CLAUDE.md, a razão de existir do `DONE → REJECTED`). A F07 conta **todo** `done_rejected` como falha do inspetor do DONE. Casos legítimos sem culpa: a OP marcou DONE no appointment errado e o AM desfaz com `DONE → REJECTED` em vez de `DONE → DRAFT`; o imóvel era o errado (`INVALID_ADDRESS`); a agência pediu o estorno por um motivo comercial.
- **Por que importa:** Fábio (10 serviços, tudo perfeito) cai de 100 para 97,5 e perde o 1º lugar porque a OP se enganou de linha ao marcar DONE e o AM corrigiu pelo caminho "errado". O inspetor não tem como contestar: o drawer diz "1 rejected of 10" e o audit não distingue.
- **Evidência:** `execute-status-transition.use-case.ts:560-571` (`metadata: { requiresFinancialReview: true }`, sem código); `reason-codes.ts:17-32`; F07-tarefas "Achados em aberto · 1" (reconhece o `done_rejected` pobre, mas só pelo ângulo da consulta); CLAUDE.md §5 (`DONE → DRAFT` AM only existe exatamente para "desfazer").
- **Proposta de regra/detalhe:** mínimo sem mudar a F03/appointments: (1) a métrica 8 só conta `done_rejected` cuja transição pareada tem `rejection_reason_code` ∈ `DONE_REJECTED_PENALTY_CODES = ['OTHER']` **e** `reason` não vazio? Frágil. Melhor: (2) acrescentar ao shared `RejectionReasonCode.NOT_EXECUTED` ("Inspection was not actually carried out"), oferecido no `StatusTransitionDialog` só em `DONE → REJECTED`, e a métrica 8 conta **só** esse código (os demais `done_rejected` ficam fora do universo como fato rejeitado, isto é, o DONE deixa de contar para ninguém); o texto do drawer vira "Completed inspections later found not carried out"; teste 12 ganha o caso "DONE → REJECTED com `INVALID_ADDRESS` → sem penalidade".
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Código `NOT_EXECUTED` e penalidade só com ele (+0,25 dia: enum, dialog, filtro na Q2).
  2. Penalizar todos os `done_rejected` (como está) e instruir o AM a usar `DONE → DRAFT` para correções — regra de processo, sem teste que a garanta.
  3. Penalizar todos, mas permitir ao AM "excluir do índice" marcando o audit (fora do escopo: UI nova).

## L-F07-05 · `VOLUME` penaliza quem não esteve disponível a janela inteira (recém-cadastrado, licença, reativado)

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F07-1 · métrica 7, P11; TASK-F07-2 · "Casos de borda · Inspetor criado depois do cálculo / desativado".
- **O que falta / está ambíguo:** a referência é a mediana dos 30 dias dos ativos; o numerador do inspetor é o que ele fez nos **seus** dias disponíveis dentro da janela. Não há pro-rata nem exclusão: um inspetor com `created_at` há 12 dias, ou que esteve `INACTIVE` por 15 dias (férias) e voltou, compete com quem trabalhou 30 dias. Não existe conceito de "pausa"/licença no modelo (`InspectorStatus` é só `ACTIVE | INACTIVE`), nem histórico de quando o status mudou. A tarefa trata o novo inspetor só pelo lado "sem linha → `NOT_COMPUTED`"; os primeiros 30 dias de quem já atingiu `minimumVolume` não são discutidos.
- **Por que importa:** inspetor novo faz 10 serviços em 10 dias (ritmo de 30/mês, acima de todos) → `VOLUME = min(1, 10/9.5) = 1`, ok. Mas com mediana 20 (plataforma madura), o mesmo inspetor fica em `0.5` durante os primeiros 20 dias e aparece no fim do ranking exatamente na fase em que a OP mais olha para ele. Inspetor que tirou 2 semanas de licença: `VOLUME 0.5` por 30 dias depois de voltar.
- **Evidência:** `schema.prisma:73-76` (`InspectorStatus { ACTIVE INACTIVE }`); F07-tarefas P11 e "Mediana" em Casos de borda (só trata população pequena); `inspectors` sem coluna de histórico de status (`schema.prisma:467-508`).
- **Proposta de regra/detalhe:** regra mínima e explicável: `activeDays = min(30, dias civis entre max(windowFrom, inspector.created_at em Sydney) e windowTo)`; `rate = min(1, completedCount / (volumeReference × activeDays / 30))`; `eligibleCount` continua `completedCount`; o resultado ganha `activeDays` (só em `VOLUME`) e o drawer mostra "12 completed in 12 days · median 9.5 / 30 days". Licenças ficam fora (não há dado); registrar em "Achados" que "pausa" é um pedido de produto (F01/estacionamento).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Pro-rata por `created_at` (barato: 1 coluna já existente, 1 teste) e licença documentada como limitação.
  2. Sem pro-rata; `VOLUME` fica `null` (renormaliza) enquanto `created_at > windowFrom` — mais simples, mas o novo inspetor "sem volume" sobe artificialmente no ranking.
  3. Manter como está e orientar a OP a usar o `volumeReferenceOverride`… que é global, logo não resolve.

## L-F07-06 · Explicabilidade: o drawer mostra contagens simples ao lado de taxas ponderadas, e não guarda **quais** serviços falharam

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F07-1 · `reliabilityMetricResultSchema`, `metrics_json`; TASK-F07-3 · `MetricRow`, tabela de rótulos, rodapé.
- **O que falta / está ambíguo:** (a) a linha "Punctuality · 53% · 8 of 10 services · Weight 1" (Ben) é contraditória para quem lê: 8 de 10 "parece" 80%; o rodapé genérico "Percentages are weighted by service duration and planned travel" não dá os números; (b) `metrics_json` guarda só agregados (`rate`, `eligibleCount`, `successCount`, minutos). Quando o inspetor pergunta "quais foram os 2 atrasos?", a OP não tem onde olhar: não há lista de appointments por métrica, e reconstruir à mão exige cruzar execuções, planos e eventos de 30 dias. O plano pede "a operação vê o ranking e o detalhe das métricas" e o critério de fairness do contrato (03.11/03.12) pressupõe que a OP consiga justificar a nota.
- **Por que importa:** reclamação de inspetor sobre o nível (F08) ou sobre ter perdido acesso antecipado → a OP abre o drawer, vê "83% · 10 of 12" e não consegue dizer quais dois serviços nem por quê (janela? previsto? dia seguinte?). A conversa vira disputa sem evidência, e a métrica perde legitimidade.
- **Evidência:** F07-tarefas teste 4 da TASK-F07-3 ("Punctuality · 83% · 10 of 12 services"); exemplo Ben ("P = 320/600 = 0.5333 (sem peso: 0.8)"); `reliabilityMetricResultSchema` (sem ids); D12 (só proíbe coordenadas, não ids de appointment).
- **Proposta de regra/detalhe:** (1) `reliabilityMetricResultSchema` ganha `failures: z.array(z.object({ appointmentId: uuid, serviceDate: civilDate, detail: z.string().max(80) })).max(20)` — só os **insucessos** (LATE/EARLY/NO_SHOW, MISS, STUCK, rating ≤ 2, atraso sem aviso, CANT_ATTEND, rejeitado), com `detail` curto em inglês gerado pela função pura ("Checked in 11:20, window 09:00–11:00, planned 10:50"); sem endereço nem coordenada; (2) o drawer lista as falhas sob a métrica expandida, cada uma com link para `/appointments/:id` (rota AM/OP existente); (3) `MetricRow` mostra, no tooltip do valor, "320 of 600 weighted minutes"; (4) o cap de 20 e a ausência de coordenadas entram no teste de privacidade (teste 7 da TASK-F07-2).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Itens 1–4 (~0,5 dia: shape, montagem no `computeMetricFromFacts`, lista no drawer). Cabe dentro do "drawer com as 8 métricas" do plano.
  2. Só o item 3 (minutos ponderados) e um texto por métrica explicando a regra; a OP investiga por fora.
  3. Adiar a lista para a F08 (que já vai mexer na página para a coluna "Level").

## L-F07-07 · `DONE → REJECTED` tardio escapa da penalidade; a F08 nunca o vê

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F07-1 · métrica 8 ("sem limite superior"), P2 (data do serviço), Q2; contrato exportado item 1.
- **O que falta / está ambíguo:** o fato rejeitado só entra num período se a **data do serviço** (não a da rejeição) está nele. Então a penalidade só aparece nos snapshots calculados entre a rejeição e `serviceDate + 30`. Uma rejeição 31+ dias depois do serviço **nunca** penaliza em nenhum snapshot, e a apuração da F08 (fechada no fim do período) nunca vê rejeições posteriores ao fechamento. O cross-check financeiro que motiva o `DONE → REJECTED` (`done_checked_by_user_id`, fechamento semanal/quinzenal/**mensal**) acontece justamente dias ou semanas depois.
- **Por que importa:** serviço de 2 Nov, fatura mensal conferida em 5 Dez, AM rejeita o DONE (não executado). Janela de 5 Dez = `[5 Nov, 4 Dez]` → o fato de 2 Nov está fora; o inspetor fica com `DONE_REJECTED = 1` para sempre e a meta de novembro da F08 já pagou o prêmio. A métrica mais grave do índice (fraude declarada) é a que mais facilmente não conta.
- **Evidência:** F07-tarefas métrica 8 ("O fato rejeitado só pertence ao período quando a sua data de serviço está nele"); CLAUDE.md §8 (fechamento mensal); F08-tarefas D6 (fechamento no fim do período, idempotente).
- **Proposta de regra/detalhe:** para a métrica 8 (e só para ela), ancorar o fato rejeitado pela **data da rejeição** (`al.created_at` no fuso da agência) quando ela é posterior a `serviceDate + 30`: o fato entra no período que contém a rejeição com `doneRejected true` e **não** conta no volume nem nas outras métricas (evita contar o mesmo DONE duas vezes). Alternativa mais simples: `eligibleCount` da 8 = DONEs do período + rejeições do período de DONEs anteriores. Em qualquer caso, documentar no contrato da F08 que o fechamento é definitivo e que rejeições posteriores afetam só o índice.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Rejeição tardia entra pela data da rejeição só na métrica 8 (1 ramo a mais na Q2, 1 caso no teste 12).
  2. Manter a regra atual e aceitar que rejeições > 30 dias não penalizam; registrar em "Achados".
  3. Janela da métrica 8 maior (90 dias) — quebra D2 (janela única) e a explicabilidade.

## L-F07-08 · Contratos F07 ↔ F08 desalinhados em três pontos

- **Severidade:** MÉDIA
- **Tarefa/seção:** "Contratos exportados para a F08" (itens 1 e 4); F08-tarefas linhas 107, 592 e D6.
- **O que falta / está ambíguo:** (a) F08-tarefas linha 107 lista `getUncached(key, tx)` como entregue pela "F07-2"; a revisão de 2026-10-28 da F07 **removeu** o `getUncached` (trocado pelo atraso de 35 s). A F08 não diz para que o usaria, mas se depender dele vai faltar. (b) F08 D6 e o item 1 do contrato da F07 dizem "DONE do período, data = `finished_at` no fuso da agência"; o `completedCount` da F07 inclui `DONE_WITHOUT_EXECUTION` pela **`scheduled_date`** (P2). Para metas de volume da F08 isso muda em que semana um DONE marcado pela OP cai. (c) F08 linha 592 assume que às 04:45 "já inclui o snapshot de hoje" — o contrato da F07 não promete isso (ver L-F07-02).
- **Por que importa:** (a) dependência fantasma descoberta na implementação da F08; (b) o mesmo serviço pode contar numa semana para o índice e noutra para a meta, e a OP não consegue conciliar "12 completed" do drawer com "11" do painel de metas; (c) nível e acesso antecipado calculados sobre snapshot de ontem sem ninguém saber.
- **Evidência:** F07-tarefas "Achados · Revisão de 2026-10-28" ("saíram … o `getUncached`"); F08-tarefas linha 107; F07-tarefas P2 e métrica 7 (`completedCount` = `CURRENT_DONE` `EXECUTED` + `DONE_WITHOUT_EXECUTION`); contrato item 1 ("DONE por `finished_at`").
- **Proposta de regra/detalhe:** corrigir o texto dos dois arquivos: F08 linha 107 remove `getUncached`; F07 contrato item 1 e F08 D6 passam a dizer "data do serviço = P2 da F07 (`finished_at` para executados, `scheduled_date` para DONE sem execução, `created_at` do evento para `CANT_ATTEND`)"; F07 contrato item 4 acrescenta "`snapshotDate` pode ser anterior a hoje; o consumidor decide o que fazer" e a F08 grava `index_snapshot_date` no fechamento.
- **Precisa de decisão do dev?** Não.

## L-F07-09 · `volumeReferenceOverride` aplicado a períodos ≠ 30 dias (F08) achata o índice de meta

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F07-1 · P11, `computeVolumeReference(override)`; contrato exportado item 1; F08 P6 (`INDEX_AT_LEAST` recalculado sobre o período da meta).
- **O que falta / está ambíguo:** o override é "referência fixa de onboarding" pensada para a janela de 30 dias, mas `computeVolumeReference` o aplica a **qualquer** período passado a `computeAll`/`computeMetric`. A F08 calcula `INDEX_AT_LEAST` e o desempate do 03.8 com `computeAll` no período da meta (semana, quinzena). Com override 20 e uma meta semanal, `VOLUME = completedCount/20` ≈ 0,2 para todos, derrubando o índice semanal de todo mundo em ~10 pontos. Com a mediana (sem override) o período curto é consistente; o override é a exceção não tratada.
- **Por que importa:** OP liga o override no onboarding (como a própria tarefa recomenda) → nenhuma meta `INDEX_AT_LEAST ≥ 85` semanal é atingível, sem que ninguém entenda por quê; desligar o override muda retroativamente o progresso parcial exibido no app do inspetor.
- **Evidência:** F07-tarefas P11 ("quando preenchido, substitui a mediana"), teste 8a (override sem noção de período), contrato item 1 ("qualquer tamanho de período"); F08-tarefas P6 e seção F ("progresso parcial … `computeAll(periodStart, min(today, periodEnd), …)`").
- **Proposta de regra/detalhe:** `computeVolumeReference(completedCounts, override, periodDays)`: `value = override × periodDays / RELIABILITY_WINDOW_DAYS` (arredondado a 0,5, piso 1) quando há override; sem override nada muda. Teste 8a ganha "override 20, 7 dias → 4.5"; o `settings_json` guarda `source: 'OVERRIDE'` e `periodDays`.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Escalar o override pelo tamanho do período (função pura, 1 parâmetro a mais).
  2. Ignorar o override fora de 30 dias (`source: 'MEDIAN'` nesses casos) e documentar no contrato.
  3. Deixar como está e avisar a F08 para não usar `INDEX_AT_LEAST` com override ligado (regra de processo).

## L-F07-10 · Pesos salvos mas recálculo não executado: a UI afirma "being recalculated" sem nenhuma verificação

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F07-2 · subscriber ("falha no enqueue → `logger.error` e não lança"); TASK-F07-3 · snackbar e "Casos de borda · Pesos salvos e a página aberta".
- **O que falta / está ambíguo:** o `PUT` é genérico (F03) e responde 200 antes do subscriber; se o enqueue falhar, ou o job falhar (L-F07-02), a página continua mostrando o snapshot com os pesos antigos e o drawer mostra "Weight 1" do `settings_json`. Nada liga o `updated_at` do setting ao `computed_at` do snapshot. O 03.A1 ("recalculado quando a configuração muda") fica sem evidência para o usuário.
- **Por que importa:** AM sobe `PUNCTUALITY` para 3 às 10:00; às 10:05 o ranking não mudou; às 10:30 também não; o AM salva de novo (2 jobs) ou conclui que "não funciona". Suporte sem pista.
- **Evidência:** F07-tarefas teste 4 da TASK-F07-2 e teste 5 da TASK-F07-3; `reliabilityRankingResponseSchema` (sem referência ao setting vigente).
- **Proposta de regra/detalhe:** a API do ranking devolve `settingsUpdatedAt` (`platform_settings.updated_at` da chave `reliabilityIndex`, ou `null`) e a página mostra `InfoBanner` "Weights were changed at {time}. Scores will update within a few minutes." enquanto `settingsUpdatedAt > computedAt`; se passar de 15 min, o texto vira "… haven't been recalculated yet. Operations has been notified." e o backend loga `reliability.recompute_overdue` no `ensure-today` horário (L-F07-02). Sem polling: a banner só muda ao recarregar/refetch.
- **Precisa de decisão do dev?** Não.

## L-F07-11 · "Configure weights" e a seção de settings: AM só, ou AM/OP?

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F07-3 · teste 3 ("link de configuração | AM"), UI "Página" (ação secundária sem papel), seção "Reliability index".
- **O que falta / está ambíguo:** o teste da página mostra o link "Configure weights" só com AM; o `PUT /v1/platform-settings/:key` da F03 aceita **AM/OP**, e a página "Platform settings" (F03-4) é AM/OP. Não está dito se o OP vê o link, se vê a seção em modo leitura, ou se pode salvar pesos (decisão com efeito direto no ranking e nos níveis da F08). O audit `platform_setting.updated` registra o autor, mas a UI é que define quem chega lá.
- **Por que importa:** implementador escolhe um comportamento para o link e outro para a seção; QA em browser (obrigatório) encontra OP com a seção editável e sem o link, ou vice-versa.
- **Evidência:** F07-tarefas TASK-F07-3 testes 3 e 5 (sem papel no 5); F03-tarefas linha 315 ("CL_ADMIN, CL_USER, INSP e TNT → 403 em todas", logo OP passa).
- **Proposta de regra/detalhe:** seguir a F03 (AM/OP editam): o link aparece para AM e OP; o teste 3 passa a "AM e OP veem 'Configure weights'; CL não chega à página". Se o dev quiser restringir pesos a AM, isso é regra da F03 (`PUT` por chave) e precisa de teste lá, não só esconder o link.
- **Precisa de decisão do dev?** Não (seguir a F03). Se quiser AM only, vira decisão da F03.

## L-F07-12 · Retenção dos snapshots: "sem expurgo" sem regra para inspetor apagado nem horizonte

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F07-2 · Modelo de dados ("Retenção: sem expurgo"), "Casos de borda · Inspetor apagado".
- **O que falta / está ambíguo:** uma linha por inspetor por dia, para sempre, incluindo inspetores apagados (soft delete) e inativos há anos. É dado de desempenho de pessoa física (contratado), guardado sem política, enquanto o `audit_logs` do mesmo sistema tem categorias de retenção e expurgo (`audit-retention.ts`). A F08 precisa do histórico "para níveis e sequência", mas não diz quanto (a sequência é derivada de fechamentos de período, não do snapshot diário).
- **Por que importa:** pedido de exclusão de dados de um ex-inspetor → não há procedimento; a tabela cresce ~73 mil linhas/ano sem uso além dos últimos meses.
- **Evidência:** F07-tarefas "Retenção: sem expurgo (uma linha por inspetor por dia; ~200 × 365 ≈ 73 mil linhas/ano). A F08 lê o histórico"; `apps/backend/src/modules/audit/domain/audit-retention.ts` (precedente de política).
- **Proposta de regra/detalhe:** constante `RELIABILITY_SNAPSHOT_RETENTION_DAYS = 400` (13 meses: cobre qualquer período anual da F08 com margem) aplicada pelo mesmo job às 04:15 (`deleteMany({ snapshot_date < hoje − 400 })`, log `reliability.snapshots_purged { count }`), e `deleted_at` do inspetor → expurgo das linhas dele no job seguinte. Confirmar com a F08 que ela não lê mais de 400 dias.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** 400 dias + expurgo de inspetor apagado, no job existente.
  2. Sem expurgo, mas documentar como decisão (D-nova) e abrir item no estacionamento para política de dados do inspetor.
  3. Expurgo só por inspetor apagado, histórico ilimitado para os demais.
