# F04 · Lacunas

Revisão de `tarefas/F04-tarefas.md` (6 tarefas) contra `F04-plano-do-dia-roteiro.md`, `decisoes.md`, F01/F02/F03/X02/X03 (contratos), F05/F06 (consumidores) e o snapshot `origin/develop` @042a9674. Não repete o que já está nas tabelas "Decisões" (D1–D18, DB1–DB11) nem o que o plano excluiu.

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 16 | 4 | 7 | 5 |

| Tarefa (primária) | Lacunas |
|---|---|
| TASK-F04-1 | L-F04-03, L-F04-11, L-F04-13 |
| TASK-F04-2 | L-F04-01, L-F04-02, L-F04-04, L-F04-05, L-F04-06, L-F04-07, L-F04-08, L-F04-09, L-F04-10, L-F04-15, L-F04-16 |
| TASK-F04-3 | (secundária em L-F04-02, L-F04-05, L-F04-07, L-F04-08) |
| TASK-F04-3b | L-F04-12 |
| TASK-F04-4 | (secundária em L-F04-03, L-F04-07) |
| TASK-F04-5 | L-F04-14 |

---

## L-F04-01 · STALE por evento recalcula com Mapbox mesmo quando nada mudou (check-out, DONE)

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F04-2 · Testes 1, 4 e 8; Algoritmo §2 e §7; Achado 15.
- **O que falta / está ambíguo:** a impressão digital diz que **check-out e SCHEDULED→DONE de parada já iniciada não mudam o hash** (teste 1, Algoritmo §2), mas o subscriber marca `STALE` em **qualquer** `STATUS_TRANSITION` de appointment presente em `day_plan_stops` (teste 8, §7), e o `GET` do inspetor **recalcula sempre que `status = STALE`** (teste 4: "hoje com `status STALE` → recalcula"). Não está dito se o recálculo por STALE deve antes comparar a impressão e, se igual, só limpar o STALE sem chamar o roteamento.
- **Por que importa:** todo check-out (3–4 por dia por inspetor) vira `STALE` → o próximo `GET` dispara Matrix + Directions por trecho, mostra "Updating your route…" e gera uma `version` nova (o que congela rascunhos de reordenação em andamento, TASK-F04-4). O Achado 15 contabiliza só "1 recálculo por check-in"; com check-out dobra o custo Mapbox e contraria a intenção declarada de não recalcular por check-out.
- **Evidência:** `F04-tarefas.md` l. 615 ("check-out … não muda"), l. 635 ("hoje com `status STALE` → recalcula"), l. 673 (qualquer `STATUS_TRANSITION` → STALE), l. 1480 (Achado 15).
- **Proposta de regra/detalhe:** no `GET`/`getFreshStopForAppointment`, ao encontrar `status = STALE`, recalcular a impressão **antes** de rotear: se igual à gravada, apenas `status = PUBLISHED` (ou mantém `DRAFT`), zera `stale_at/stale_reason`, `version + 1`, sem chamar `PlanRouteService` (log `day_plan.stale_cleared_noop`). Alternativa equivalente: o subscriber ignora transições `SCHEDULED → DONE` cuja execução já tem `started_at` (só reage a REJECTED/CANCELLED/DRAFT). Adicionar teste: "check-out → STALE → GET não chama o routing e devolve o plano com a mesma ordem/ETAs".
- **Precisa de decisão do dev?** Não (é coerência interna); qualquer das duas formas acima fecha.

## L-F04-02 · Janela de publicação no fuso do inspetor × job no fuso da agência: `GET` de um plano já PUBLISHED pode dar 404

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F04-2 · Algoritmo §5 (`isPublicationOpen` com `tz` = fuso do inspetor), teste 4, Casos de borda 8; TASK-F04-3 · copy "Tomorrow's route will be ready at 7:30 pm".
- **O que falta / está ambíguo:** o job publica às 19:30 **da agência** e manda o push "Your route for tomorrow is ready"; o `GET /:date` do inspetor para D+1 devolve 404 `DAY_PLAN_NOT_PUBLISHED` "antes das 19:30 **no fuso do inspetor**". O teste 4 só diz que D+1 com plano `DRAFT` antes das 19:30 dá 404; não diz o que acontece com plano **`PUBLISHED`** antes das 19:30 do inspetor. Também não está dito como a Tela do Dia descobre a hora correta para o texto "ready at 7:30 pm" quando os fusos diferem.
- **Por que importa:** inspetor com `users.timezone = Australia/Perth` e agências em Sydney: o push chega às 16:30 (Perth), o toque abre `/today` e o card diz "Tomorrow's route will be ready at 7:30 pm" por 3 horas (se a regra for "janela fechada → 404"). O inverso (inspetor Sydney, agência Perth) faz o `GET` **calcular e publicar** às 19:30 de Sydney = 16:30 de Perth, antes do T-1 de Perth, com `notified_at` nulo; o job depois avisa um plano que pode já estar STALE pelas rejeições do T-1.
- **Evidência:** `F04-tarefas.md` l. 636–637, l. 1122 ("`tz` = fuso do inspetor"), l. 1191, l. 1791 ("texto fixo").
- **Proposta de regra/detalhe:** regra explícita de leitura do INSP: `published_at IS NOT NULL` → 200 **sempre**, independentemente da hora local; `isPublicationOpen` só decide se o `GET` pode **criar/publicar** um plano que não existe. Para o segundo caso, o `GET` de D+1 só auto-publica quando a janela está aberta em **todas** as agências das paradas (mesma regra (b) do conjunto devido) ou, mais simples, quando `now ≥ 19:30` no fuso do inspetor **e** no `PLATFORM_TIMEZONE`. Adicionar os dois testes. No PWA, o texto "ready at 7:30 pm" fica como está (decisão Q9), com nota na spec de que é hora da agência.
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** `published_at` manda; auto-publicação pelo `GET` só com janela aberta no fuso do inspetor **e** da plataforma. (2) `isPublicationOpen` pelo fuso da plataforma (Sydney) em vez do inspetor, aceitando a borda para inspetores fora de Sydney. (3) Manter como está e documentar o 404 transitório como limitação (não recomendado: o push aponta para uma tela vazia).

## L-F04-03 · Termos da Mapbox (D8): sem plano B, dono nem prazo se a resposta for negativa

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F04-1 · D8; TASK-F04-2 · Riscos ("Termos Mapbox"), Deploy ("Pré-requisitos de go-live"); Achado 4; TASK-F04-4 (recálculo local depende da matriz no cliente).
- **O que falta / está ambíguo:** a confirmação com a Mapbox cobre 3 pontos (guardar traçado, guardar matriz/durações, **repassar a matriz crua ao PWA**). Não há: quem pergunta, até quando, e o que muda em cada tarefa se a resposta a (c) ou (b) for "não". A TASK-F04-4 inteira (recálculo local sem API) e o `routingInput` do contrato dependem de (c).
- **Por que importa:** uma resposta negativa depois da TASK-F04-2 em produção obriga a trocar o contrato do `GET` (remover `routingInput`), reescrever a reordenação (recálculo no servidor por `POST /preview-order`) e expurgar dados — um pedido de mudança no meio da Parte B. A consulta pode levar semanas (suporte comercial).
- **Evidência:** `F04-tarefas.md` l. 52, l. 1240, l. 1244, l. 1470.
- **Proposta de regra/detalhe:** registrar na TASK-F04-1 (a primeira a sair) uma ação "Consulta Mapbox" com responsável, data-limite = início da TASK-F04-2, e o **plano B já desenhado**: se (c) for negado, `routingInput` sai do contrato e a reordenação usa um endpoint `POST /v1/inspector/day-plans/:date/order/preview` (avaliação no servidor com a matriz gravada, sem Directions, `etaSource 'MATRIX'`, 30/min); se (b) for negado, `routing_matrix_json`/`leg_travel_json` não são gravados e `PUT /order`/`PRESERVE_ORDER` chamam Matrix de novo (custo +1 Matrix por salvamento). A TASK-F04-4 recebe a variante escolhida antes de começar.
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** manter o desenho atual e fechar a consulta antes da TASK-F04-2, com o plano B acima documentado. (2) Adotar desde já o preview no servidor (elimina o risco, +0,5 dia na F04-2, −0,25 na F04-4, perde "sem API" na reordenação). (3) Seguir sem consulta formal (não recomendado).

## L-F04-04 · Join "vivo" do `GET` não filtra `status`: parada que sai de SCHEDULED/DONE mantendo `inspector_id` quebra o serializer

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F04-2 · Modelo de dados "Escopo de tenant" item 3; Contratos `dayPlanStopSchema.appointmentStatus: z.enum(['SCHEDULED','DONE'])`; Algoritmo §1.
- **O que falta / está ambíguo:** a seleção no **cálculo** filtra `status IN ('SCHEDULED','DONE')`, mas a re-união na **leitura** é só `a.inspector_id = day_plans.inspector_id AND a.deleted_at IS NULL`. Entre um cálculo e a leitura seguinte, um appointment pode sair desses dois status sem perder o `inspector_id`: `DONE → DRAFT` (reabertura pelo AM; a transição só zera `inspector_id` em REJECTED/CANCELLED), `bulk-edit` de status, correções diretas. A resposta carregaria `appointmentStatus 'DRAFT'`, fora do enum.
- **Por que importa:** o serializer do Fastify lança com valor fora do enum (memória "serializer throws") → **500 na home do inspetor** até alguém recalcular. Como a impressão digital também é calculada sobre os candidatos filtrados por status, a parada "fantasma" some do hash (→ STALE → recálculo), mas o `GET` que devolve o plano gravado após 2 falhas de CAS, o `GET` AM/OP (que nunca recalcula) e a folha leem o join bruto.
- **Evidência:** `F04-tarefas.md` l. 792, l. 928, l. 1100; snapshot `execute-status-transition.use-case.ts:475-485` (só REJECTED/CANCELLED liberam o inspetor); CLAUDE.md §5 (`DONE → DRAFT` pelo AM).
- **Proposta de regra/detalhe:** o join de leitura inclui `AND a.status IN ('SCHEDULED','DONE')` em todos os leitores (`GET` INSP, `GET` AM/OP, folha, `getFreshStopForAppointment`, F05 por contrato). Teste de rota: plano gravado com A; `UPDATE appointments SET status='DRAFT'` direto; `GET` AM/OP → 200 sem A e `status 'STALE'`; `GET` INSP → recalcula. Documentar no contrato exportado §2 para a F05.
- **Precisa de decisão do dev?** Não.

## L-F04-05 · Plano publicado inviável: ninguém é avisado além das chips no app

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F04-2 · Algoritmo §4/§6, Avisos (corpo do `ROUTE_PUBLISHED`), Auditoria (`day_plan.published`), Observabilidade; TASK-F04-3 · `RouteSummary` / chips.
- **O que falta / está ambíguo:** quando nenhuma sequência respeita as janelas (`feasible false` já na publicação automática), o plano é gravado e o aviso diz "Your route for tomorrow is ready" como se tudo estivesse bem. Não há aviso à OP, o corpo do push não menciona o conflito, o audit `day_plan.published` não registra `feasible`/`lateS`, e o inspetor só descobre ao abrir a Route ("{k} stop(s) would arrive after their window"). Não está dito se o inspetor deve fazer algo (ligar para a OP? avisar o inquilino?) nem se a F05 trata isso como alerta.
- **Por que importa:** o caso real é janela sobreposta/apertada criada pela agência (duas paradas 09:00–10:00 a 40 min uma da outra). Quem pode resolver (OP: remarcar, trocar inspetor, dividir) só vê na véspera se abrir o Dia ao Vivo do dia seguinte; o inquilino recebe o aviso matinal da F06 já com atraso previsto.
- **Evidência:** `F04-tarefas.md` l. 469, l. 1060 (corpo do aviso), l. 1086 (metadata sem `feasible`), l. 1807.
- **Proposta de regra/detalhe:** (a) `day_plan.published` e `day_plan.publish_completed` ganham `feasible` e `lateS`/`infeasible` (contagem); (b) corpo do `ROUTE_PUBLISHED` acrescenta ", 1 stop may arrive after its window" quando `feasible false`; (c) log `day_plan.published_infeasible { inspectorId, date, violations }` em nível `warn` para o alerta de operação; (d) contrato exportado §2: a F05 mostra `feasible false` como alerta `route_infeasible` no roster. Nada de e-mail novo nesta feature.
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** (a)+(b)+(c)+(d) acima, sem canal novo. (2) Além disso, notificação à OP/AM pelo `CreateNotificationUseCase` (precedente `INSPECTOR_UNABLE_ALERT` da F03), +0,25 dia. (3) Só (a) e (d), deixando o aviso ao inspetor como está.

## L-F04-06 · `ROUTE_CHANGED` sem limite: cada clique da OP em "Recalcular" é um push crítico com fallback SMS

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F04-2 · Avisos (`dedupeKey 'route-changed:{dayPlanId}:{version}'`), endpoint `POST /v1/day-plans/:inspectorId/:date/recalculate` (30/min), teste 6.
- **O que falta / está ambíguo:** o `dedupeKey` inclui a `version`, então recálculos repetidos pela OP (cada um gera versão nova) produzem **um aviso crítico cada**, e crítico sem push entregue vira SMS (F02 D2-a). Não há janela de agregação nem distinção entre "recalculei e nada mudou" (mesma ordem e ETAs iguais) e mudança real. Também não está definido o corpo para **hoje** com prefixo executado ("first stop at …" é a 1ª restante ou a 1ª do dia?).
- **Por que importa:** uma OP testando pesos ou corrigindo um dia dispara 5 pushes/SMS ao mesmo inspetor em minutos (custo de SMS e ruído num canal "crítico"); o rate limit de 30/min não protege.
- **Evidência:** `F04-tarefas.md` l. 659, l. 1020, l. 1061.
- **Proposta de regra/detalhe:** só avisar quando a ordem das reordenáveis **ou** alguma `serviceStartAt` mudou mais de 5 min em relação ao plano anterior; `dedupeKey 'route-changed:{dayPlanId}:{floor(now/10min)}'` (um aviso por plano a cada 10 min, o último estado prevalece ao abrir). Para hoje: "first stop" = 1ª parada não iniciada; se não houver, "{n} inspections remaining". Teste: 3 recálculos em 2 min → 1 aviso.
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** agregação por 10 min + só com mudança efetiva. (2) Só "mudança efetiva", sem janela. (3) Manter 1 aviso por versão e confiar na OP (não recomendado).

## L-F04-07 · Trocar a origem do dia depois do 1º check-in: aceito, mas sem efeito, e a UI não diz

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F04-2 · Algoritmo §3 (prefixo executado → origem = imóvel da última executada), `PUT/DELETE /:date/origin`, teste 7; TASK-F04-3 · `OriginRow`/`OriginSheet` (lápis visível para hoje).
- **O que falta / está ambíguo:** o `PUT /origin` de hoje recalcula com `ORIGIN_CHANGE`, mas com prefixo executado o restante **parte do imóvel da última executada**, então o override não altera nada. Não está dito: se o endpoint deve recusar (422) ou aceitar; o que `origin.source/label/lat/lng` devolvem nesse estado (`OVERRIDE` com coordenadas que não são a origem real do restante?); e se a `OriginRow` esconde o lápis depois do 1º check-in.
- **Por que importa:** o inspetor troca o endereço, vê "Route updated. Starting from X for this day." e os horários não mudam — parece bug. O `routingInput.originKey 'origin'` passa a ser o imóvel da última executada enquanto `origin.label` mostra o override: a F05 e o PWA podem desenhar o pin de início no lugar errado.
- **Evidência:** `F04-tarefas.md` l. 1108, l. 1011–1012, l. 1816–1820.
- **Proposta de regra/detalhe:** definir `origin` da resposta como "origem **efetiva** do trecho restante": com prefixo executado → `source 'LAST_STOP'` (novo valor) com `label` = suburb da última executada; `originOverride` continua informativo. `PUT /origin` com prefixo executado para hoje → 422 `DAY_PLAN_ALREADY_STARTED` "Your day has started; the route continues from your last stop." e a `OriginRow` fica só texto (sem lápis) quando `origin.source = 'LAST_STOP'`. Enum `DayPlanOriginSource` ganha `LAST_STOP` (migration é só o enum). Testes em F04-2 (use case + rota) e F04-3 (`OriginRow`).
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** 422 + `LAST_STOP` na resposta. (2) Aceitar o `PUT` sem efeito e só esconder o lápis no PWA (menor, mas deixa a API incoerente para a F05). (3) Permitir que o override valha também depois do check-in (o restante parte do override, não da última parada) — muda a semântica do dia e a métrica.

## L-F04-08 · Regra do "contato principal" da parada não está definida

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F04-2 · Algoritmo §1 ("contato primário (`is_primary`, role RENTAL_TENANT, snapshot)"), `dayPlanStopSchema.primaryContact`, folha (coluna Contact); TASK-F04-3 · `CallContactLink`.
- **O que falta / está ambíguo:** não está claro se a regra é `is_primary = true` (qualquer role), `is_primary AND role = RENTAL_TENANT`, ou uma ordem de preferência. Não há fallback quando não existe `is_primary` (primeiro contato por `created_at`? nenhum?). Para `key_required = true` (inquilino não precisa estar) e para `PROPERTY_MANAGER`/`HOUSEKEEPER` como quem abre a porta, a pessoa a ligar pode não ser o inquilino. O detalhe do app hoje devolve **todos** os contatos com `isPrimary` (`get-appointment-detail.use-case.ts:37,380`), então o `DayPlanStop` seleciona um critério que o detalhe não tem.
- **Por que importa:** o botão "Call" do card e a coluna "Contact" da folha (dado pessoal impresso) apontam para a pessoa errada ou ficam vazios em todos os appointments importados sem `is_primary`. É o único ponto do plano que expõe o telefone do inquilino fora do detalhe.
- **Evidência:** `F04-tarefas.md` l. 1100, l. 949, l. 1174, l. 1838; snapshot `schema.prisma:139-146` (`AppointmentContactRole`).
- **Proposta de regra/detalhe:** `primaryContact` = 1º da lista ordenada por: `is_primary desc`, depois role na ordem `RENTAL_TENANT, RENTAL_TENANT_REPRESENTATIVE, HOUSEKEEPER, PROPERTY_MANAGER, BROKER, OTHER`, depois `created_at asc`; `null` sem contatos; telefone só se E.164 válido. Expor `primaryContact.role` no schema (o card mostra "Call Sam Lee (tenant)"). Teste do leitor com os 3 arranjos (com `is_primary`, sem `is_primary`, só PM).
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** ordem acima com `role` exposto. (2) Estritamente `is_primary`, `null` caso contrário (mais simples; deixa o botão vazio em dados legados). (3) Sempre o inquilino; para `key_required`, o contato de chave (`meeting_location` já cobre o local, não a pessoa).

## L-F04-09 · Falha persistente do provedor (token revogado, 402/403, cota mensal): tudo vira "aproximado" em silêncio

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F04-1 · `RoutingProviderError`, Casos de borda 5–6; TASK-F04-2 · Job §6 (tentativa 3 → `strict: false`), Observabilidade, Deploy (rollout passo 4).
- **O que falta / está ambíguo:** o limitador trata o **por-minuto**; para falhas duráveis (`HTTP_401` token trocado, `HTTP_402/403` cota/billing, circuito aberto por horas) o job publica **todos** os inspetores com stub na 3ª tentativa, todo dia, e o `GET` interativo cai no stub a cada 5 min. Só há logs; nenhum contador agregado, limiar de alerta ou kill switch do provedor. Também não há guarda da cota mensal (100 mil elementos/req), só "medir na homologação".
- **Por que importa:** o produto degrada para linha reta sem ninguém perceber até um inspetor reclamar dos horários (ou a métrica de ETA piorar semanas depois). O `system.dlq-monitor` existente não cobre isso porque o job não falha.
- **Evidência:** `F04-tarefas.md` l. 521–522, l. 1133, l. 1094–1095, l. 1245.
- **Proposta de regra/detalhe:** (a) `metrics` ganha `routingProviderFailuresByCode` e `dayPlansApproximateTotal`; (b) o `day_plan.publish_completed` loga em `error` (não `info`) quando `approximate > 0` por motivo ≠ `NO_PROVIDER` ou quando `deferred > 0` na 3ª tentativa; (c) env `DAY_PLAN_ROUTING_PROVIDER=mapbox|stub` como kill switch explícito (hoje só dá para desligar o job inteiro); (d) `routing.provider_call` com `outcome 'HTTP_401'|'HTTP_402'|'HTTP_403'` abre o circuito por 15 min em vez de 60 s (evita 30×5 chamadas inúteis por lote). Guardar a cota mensal fica fora (medição na homologação é suficiente).
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** (a)+(b)+(c). (2) Só (a)+(b) e observar pelo log. (3) Nada agora; revisar depois da homologação.

## L-F04-10 · Folha do dia: exportação de dados pessoais sem auditoria, fuso misto sem rótulo, formatos abertos

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F04-2 · Algoritmo §9, teste 15/21, Auditoria, RBAC (`day_plan.export`).
- **O que falta / está ambíguo:** (a) a folha leva **nome e telefone do inquilino** e endereços de várias agências; a ação `day_plan.export` existe no `assertRoles`, mas a tabela de auditoria não tem `day_plan.exported` (nem para AM/OP nem para INSP), e o INSP pode baixar **qualquer data passada** sem limite; (b) ETA por linha no fuso da agência e "Finish: ~HH:mm" / "generated dd/MM/yyyy HH:mm" sem dizer em que fuso (plano com Perth + Sydney mostra 08:00 e 08:00 que são instantes diferentes); (c) "Approximate route: travel times are straight-line estimates" mesmo quando só um trecho é aproximado ou quando o motivo foi `RATE_LIMITED` na Matrix; (d) slug do nome do inspetor `[a-z0-9-]` vira vazio para nomes não-ASCII (`route--2026-11-05.pdf`); (e) "Date: {EEEE d MMMM yyyy}" e "generated dd/MM/yyyy" misturam dois formatos no mesmo documento.
- **Por que importa:** é o único artefato da feature que sai do sistema (PDF no celular, planilha por e-mail). Sem audit, não há rastro de quem exportou contatos de inquilinos; o fuso sem rótulo produz folha errada para inspetor multi-agência; o texto "straight-line" mente quando só um trecho é aproximado.
- **Evidência:** `F04-tarefas.md` l. 1013, l. 1021, l. 1082–1091, l. 1173–1176.
- **Proposta de regra/detalhe:** audit `day_plan.exported` (USER, `metadata { format, date, stops, actorRole }`, sem dados pessoais) para INSP e AM/OP; folha de data passada para INSP limitada a 30 dias (`422 DAY_PLAN_SHEET_TOO_OLD`); quando as paradas têm mais de um `window_timezone`, cada ETA/janela ganha sufixo de fuso curto ("08:00 AWST") e o preâmbulo diz "Times in each agency's local time"; "Finish"/"generated" no `plan.timezone` com o sufixo; copy do aproximado: "Approximate route: some travel times are estimates"; slug com `transliterate` simples ou fallback `inspector`; um só formato de data (`dd/MM/yyyy`) no preâmbulo.
- **Precisa de decisão do dev?** Sim, só para o limite de 30 dias do INSP. (1) **Recomendada:** 30 dias. (2) Sem limite (como hoje). (3) Só hoje e amanhã (bloqueia conferência de dias passados).

## L-F04-11 · Grupos de serviço: nada diz se impõem restrição ao otimizador, nem de onde vem a janela de um appointment agrupado

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F04-1 · Algoritmo §1/§4; TASK-F04-2 · Algoritmo §1 (seleção), teste 8 (eventos de grupo).
- **O que falta / está ambíguo:** o otimizador trata cada appointment como parada independente. Não está escrito que (a) appointments do mesmo `ServiceGroup` **não** precisam ficar juntos nem em sequência; (b) a janela usada é `appointments.time_slot_start/end` e **não** `service_groups.time_window` (`schema.prisma:663`, `VarChar(11)`), e o que fazer se divergirem; (c) um grupo publicado no marketplace com linha "na ordem do `appointment_number`" não é a ordem do plano (só o plano diz "não chamá-la de rota").
- **Por que importa:** o inspetor aceita um grupo vendo uma janela do grupo (ex.: "08:00–12:00") e appointments com slots próprios; se a ordem ótima intercala paradas de dois grupos ou de duas agências, ele pode achar que o app "misturou" os grupos. Sem teste, uma mudança futura que sincronize `time_window` → slots (memória "data manda" já sincroniza a data) muda a entrada do otimizador sem ninguém notar.
- **Evidência:** `F04-tarefas.md` l. 1100 (só `time_slot_*`), l. 126 do plano ("não chamá-la de rota"); snapshot `schema.prisma:651-681`.
- **Proposta de regra/detalhe:** adicionar à TASK-F04-1 (Algoritmo §4) a frase: "Grupos não são restrição: paradas do mesmo grupo podem ser intercaladas com outras; a janela é sempre `time_slot_start/end` do appointment (o `time_window` do grupo é só de oferta)". Teste de unidade com 2 grupos intercalados (Exemplo 1 com A,C de um grupo e B de outro → `A,B,C`). No PWA, o card da parada mostra o código do appointment, não o grupo (já é assim).
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** grupos sem restrição, janela do appointment. (2) Grupos como bloco contíguo (restrição dura; piora rotas e exige mudança no otimizador, +0,5 dia). (3) Grupo como bloco só quando `time_window` dos membros é idêntico (meio-termo, difícil de explicar).

## L-F04-12 · Tour: contagem de passos inconsistente e textos ainda "propostos"

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F04-3b · E2E E1/E3/E6, `tour-steps.test.ts`, `AppTour.test.tsx`, tabela "Passos".
- **O que falta / está ambíguo:** a tabela tem **8** passos com alvo + instalação (9 no browser, 8 em standalone), o E2E espera "Step 1 of 9" / "Step 8 of 8", mas `tour-steps.test.ts` diz "**7** passos de alvo + instalação" e `AppTour.test.tsx` usa "Step 1 of 8" com "passo 3 ausente → total vira 7". O plano fala em "3 de 7". A tabela de textos diz "a spec fecha os textos; estes são os propostos", e o passo 4 ("Let operations know here. They'll be notified straight away.") descreve o fluxo anterior à Q1 (hoje o "Can't do" rejeita direto via SYS; a OP recebe um alerta, mas não "retorna").
- **Por que importa:** os E2E são o gate do 00.A1; com contagens divergentes, um dos testes nasce errado. Texto não fechado vira decisão do implementador numa tela vista por todos os inspetores no 1º acesso.
- **Evidência:** `F04-tarefas.md` l. 1962–1967, l. 1985, l. 1991/1997, l. 2059–2069.
- **Proposta de regra/detalhe:** fixar **8 alvos + instalação** em todos os testes (E2E 9/8; unit "Step 1 of 9" no browser, ausente → 8); marcar a tabela de textos como **final** e ajustar o passo 4 para "Running late or can't do it? Tell us here. The job is released and operations are alerted straight away." (≤ 140 caracteres).
- **Precisa de decisão do dev?** Não (só fechar os números e os textos na spec).

## L-F04-13 · Duas paradas no mesmo imóvel / coordenadas idênticas

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F04-1 · Algoritmo §9 (passada final), Casos de borda; TASK-F04-4 · pins (`applyCollisionOffsets`).
- **O que falta / está ambíguo:** dois appointments do mesmo imóvel no mesmo dia (ex.: ingoing + outgoing, ou duas unidades do mesmo prédio com a mesma geocodificação) geram trecho de 0 s. Não está dito se a passada final **pula a chamada Directions** para pontos idênticos (economiza cota e evita `NoRoute`/geometria degenerada de 2 pontos iguais), nem como o mapa mostra dois pins no mesmo ponto (o `applyCollisionOffsets` existe, mas o teste do `RouteMapView` não cobre).
- **Por que importa:** pequeno custo e um traçado com `LineString` de 2 pontos iguais que alguns renderizadores tratam como inválido; no mapa, um pin esconde o outro.
- **Evidência:** `F04-tarefas.md` l. 491–497, l. 2320.
- **Proposta de regra/detalhe:** na passada final, `haversineMeters(de, para) < 10 m` → trecho `travelS 0`, `distanceM 0`, sem chamada e sem feature na geometria (ou feature vazia marcada `approximate false`); teste 44b. No `RouteMapView`, teste com dois pins idênticos → offsets aplicados e `aria-label` distintos.
- **Precisa de decisão do dev?** Não.

## L-F04-14 · Limites e validações soltas: rate limit do `GET`/folha AM/OP, data do preview, seletor de inspetores com `pageSize=100`

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F04-2 · tabela "Endpoints AM/OP", `POST /v1/day-plans/preview`; TASK-F04-5 · `RouteWeightsPreview`.
- **O que falta / está ambíguo:** (a) `GET /v1/day-plans/:inspectorId/:date` e a folha AM/OP não têm rate limit (os do INSP têm); (b) o preview não diz se aceita data passada (hoje recalcularia a partir do estado atual, não do que foi publicado) nem D+30; (c) o seletor do preview usa `GET /v1/inspectors?status=ACTIVE&pageSize=100` sem busca no servidor; acima de 100 inspetores a lista trunca em silêncio.
- **Por que importa:** o preview chama a Matrix (custo) e a folha gera binário síncrono; sem limites, um loop de polling da F05 ou um script derruba a cota. A data passada no preview dá uma resposta que parece histórica e não é.
- **Evidência:** `F04-tarefas.md` l. 1019–1023, l. 1321.
- **Proposta de regra/detalhe:** `GET` AM/OP 120/min por usuário, folha 20/min (como o INSP); preview: `date` entre hoje e hoje+14 → fora disso 422 `DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` "Pick a day between today and 14 days ahead"; seletor com `search` no servidor (`GET /v1/inspectors?status=ACTIVE&search=`) ou `pageSize` máximo documentado com nota "showing first 100".
- **Precisa de decisão do dev?** Não.

## L-F04-15 · Histórico do plano: só a última versão existe; definir o que basta para F05/F06 e para disputas

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F04-2 · Modelo de dados (`DELETE/INSERT` das paradas a cada cálculo), Auditoria (ON_OPEN, STALE e expurgo não auditam), Retenção.
- **O que falta / está ambíguo:** cada cálculo substitui as paradas; a única memória do passado é `published_*` por parada (e some quando a parada sai do plano: reatribuída, rejeitada). Não há forma de responder "qual era o roteiro às 10:00 quando o inquilino recebeu o aviso da F06" nem "quantas vezes o plano mudou hoje". A spec não declara isso como aceito.
- **Por que importa:** a F06 envia horários ao inquilino a partir de um plano que pode mudar 5 minutos depois; uma reclamação ("me disseram 10:00") só é verificável pelo log `day_plan.computed` (sem ETAs) e pela `notifications.payload_json` da F06. Para a métrica de ETA, paradas rejeitadas depois da publicação somem da amostra (viés a favor).
- **Evidência:** `F04-tarefas.md` l. 1118, l. 1091, l. 887.
- **Proposta de regra/detalhe:** registrar como decisão explícita "sem histórico de versões na Etapa 1; a prova do que foi comunicado fica no payload da notificação (F06) e nos audits de `reordered/recalculated/published`"; acrescentar ao log `day_plan.computed` a lista `stops: [{ appointmentId, sequence, serviceStartAt }]` (sem coordenadas) para reconstrução por log; e na métrica, documentar que paradas removidas depois da publicação não contam.
- **Precisa de decisão do dev?** Sim. (1) **Recomendada:** sem histórico + log enriquecido. (2) Tabela `day_plan_versions` (snapshot JSON por cálculo, retenção 30 dias), +0,5 dia. (3) Nada a registrar.

## L-F04-16 · `classifyStops` e a impressão digital são contrato para a F05, mas não têm lugar nem assinatura definidos

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F04-2 · Algoritmo §1 ("a mesma função `classifyStops(candidates)`"), Contratos exportados §2.
- **O que falta / está ambíguo:** a F05 cita "`classifyStops` da TASK-F04-2" e "`day-plan-fingerprint.ts` (função real da F04)" para montar o read model em memória, mas a F04 não diz em que arquivo `classifyStops` vive (domínio? application?), qual é o tipo de entrada (`candidates` do leitor Prisma) nem se ambos são exportados de `modules/day-plan/domain` sem puxar Prisma. O contrato exportado §2 lista só a porta `IDayPlanRepository` e o `dayPlanGeometrySchema`.
- **Por que importa:** a F05 vai reimplementar a classificação se a função estiver acoplada ao leitor, e duas regras de "executada" divergem (exatamente o que D18 quer evitar).
- **Evidência:** `F04-tarefas.md` l. 1103, l. 1442–1448; `F05-tarefas.md` l. 118, 126.
- **Proposta de regra/detalhe:** `modules/day-plan/domain/classify-stops.ts` exportando `classifyStops(stops: Array<{ appointmentId, appointmentStatus, startedAt, finishedAt, abandonedAt, windowStartAt }>) → { executed: [...], reorderable: [...] }` (tipos planos, sem Prisma), e `computeDayPlanFingerprint(input: FingerprintInput)` com `FingerprintInput` exportado; ambos listados no contrato exportado §2 com os testes que a F05 pode reusar.
- **Precisa de decisão do dev?** Não.
