# F03 · Lacunas

Revisão de `tarefas/F03-tarefas.md` contra `F03-eventos-de-campo.md`, `README.md`, `decisoes.md`, os contratos da F02 e os consumidores F04/F05/F07/F09. Código verificado no snapshot de `origin/develop` @ `042a9674`. Decisões já fechadas (D1–D19, Q1, Q2, Q10, Q11) não são reabertas.

| Severidade | Quantidade |
|---|---|
| ALTA | 2 |
| MÉDIA | 6 |
| BAIXA | 2 |
| **Total** | **10** |

---

## L-F03-01 · O portal do inquilino revive um `INSPECTOR_UNABLE` sem passar pela OP

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F03-2 · "Não consigo fazer" (D1), casos de borda; o plano só trata o portal pelo ângulo do `PortalInspectionAlreadyStartedError`.
- **O que falta / está ambíguo:** a tarefa não diz o que o **inquilino** vê e pode fazer no portal depois que o inspetor reporta "Não consigo fazer". Hoje o link do portal **continua válido** depois de uma rejeição (o handler de rejeição não cunha token novo), a página trata `REJECTED` como estado **não terminal** e oferece "pick another available time", e o `join-group` faz `REJECTED → AWAITING_INSPECTOR → SCHEDULED` para **qualquer** `REJECTED`, sem olhar o `rejection_reason_code`. Esse caminho foi desenhado para `TENANT_DECLINED`; com a Q1 ele passa a valer também para `UNSAFE`, `SITE_ISSUE`, `TENANT_REFUSED` e `CANT_ATTEND`. A tarefa também não define se a confirmação já dada (`rental_tenant_confirmation_status = CONFIRMED`) continua valendo na reoferta.
- **Por que importa:** o inspetor reporta `UNSAFE` ("Unsafe to enter") às 09:40; a OP recebe o e-mail e ainda está avaliando. Às 09:50 o inquilino abre o link que já tinha, vê "This inspection will not go ahead as scheduled. You can still pick another available time below", escolhe um grupo de amanhã e o appointment volta a `SCHEDULED` dentro desse grupo, atribuído a outro inspetor (ou ao mesmo), com a mesma situação de segurança não resolvida e sem nenhuma decisão da OP. O card "Inspector couldn't complete" aparece no web, mas ninguém precisou agir sobre ele.
- **Evidência:** `apps/backend/src/modules/notification/application/handlers/notify-on-status-transition.handler.ts:238-258` ("No portal token is minted either … after a portal decline they need it to change time"); `apps/web/src/features/rental-tenant-portal/pages/PortalPage.tsx:210-216, 290-296` (banner de REJECTED com "pick another available time"); `apps/backend/src/modules/rental-tenant-portal/application/use-cases/join-group.use-case.ts:394-401, 548-552` (hop de recuperação sem filtro de motivo); `report-unavailability.use-case.ts:114-118` (só bloqueia o "No", não o "change time").
- **Proposta de regra/detalhe:** na TASK-F03-2, o `join-group` (e o `get-portal-data`, para a lista de grupos) passa a tratar `status = REJECTED` **com** `rejection_reason_code ∈ SYSTEM_ONLY_REJECTION_CODES` (hoje só `INSPECTOR_UNABLE`) como **não elegível** para "change time": `eligible: false`, banner do portal "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time." (sem a frase "pick another available time"), e `join-group` devolve o erro existente de appointment inativo. A reoferta fica exclusivamente com a OP (`REJECTED → AWAITING_INSPECTOR` manual ou adição a grupo). Teste de integração 18 ganha um passo: portal com token ativo depois do `cant-do` → lista de grupos vazia/`eligible false` e `join-group` recusado. Registrar que a confirmação do inquilino **não** é alterada pela F03 (comportamento atual da reoferta).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Bloquear "change time" no portal quando o código é `INSPECTOR_UNABLE`; só a OP reoferta.
  2. Permitir como hoje, mas só quando o motivo é "do inquilino" (`NO_ANSWER`, `TENANT_REFUSED`, `KEY_FAILED`) e bloquear para `UNSAFE`/`SITE_ISSUE`/`CANT_ATTEND` — exige guardar o `FieldIssueReason` acessível ao portal (último `CANT_DO`).
  3. Manter o comportamento atual (qualquer `REJECTED` revive pelo portal) e registrar como premissa na spec.

---

## L-F03-02 · Check-in offline que falha de forma permanente deixa o app em `IN_PROGRESS` sem saída

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F03-3 · casos de borda "Check-in offline em BLOCK fora do raio (D16)" e teste 8b; TASK-F03-1 · D16.
- **O que falta / está ambíguo:** D16 decide que o START enfileirado recebe 422 na sincronização, vira `FAILED` e mostra a mensagem. Mas o `ExecutionPage` (e o `useExecutionActions` extraído) grava `ExecutionState { phase: 'IN_PROGRESS' }` no IndexedDB **no momento do toque**, antes de o servidor aceitar. A tarefa não define o que acontece com esse estado local quando o START é rejeitado em definitivo (422 `GEOFENCE_OUT_OF_RADIUS`, 404 porque a OP reatribuiu, 403 T-1). Também não diz se "Retry" faz sentido para um 422 de geofence (reenvia as mesmas coordenadas e falha de novo) nem como o inspetor faz um check-in novo.
- **Por que importa:** o inspetor estava a 900 m, em modo avião, tocou "Check in"; horas depois o item sincroniza e falha. O card mostra "Check out" (estado local `IN_PROGRESS`), o servidor não tem execução. "Check out" → `finish` → 404 `EXECUTION_NOT_STARTED`; o item FINISH também entra na fila e falha para sempre (a cadeia para no START `FAILED`). O inspetor fica preso: não há botão "Check in" de novo e o único caminho é limpar dados do app. Como a F03 passa a gravar `IN_PROGRESS` a partir do card (00.7a), o caso fica muito mais frequente do que hoje.
- **Evidência:** `apps/pwa/src/features/execution/pages/ExecutionPage.tsx:89-96` (`updateState({ phase: 'IN_PROGRESS' })` logo após `mutateAsync`, que para o caminho offline resolve com `queued: true`); `apps/pwa/src/features/execution/hooks/useOfflineQueue.ts:110-120, 148-157` (`FAILED` após `MAX_RETRIES = 3`, `break` da cadeia, só `showError`); `AppointmentCard` da tarefa: "IN_PROGRESS → mostra Check out".
- **Proposta de regra/detalhe:** em `useOfflineQueue`, uma falha **permanente** de START (qualquer 4xx exceto 401/408/429) faz, além de `FAILED` + `showError`: `clearExecutionState(appointmentId)`, remoção do FINISH encadeado do mesmo appointment, `refreshQueueSnapshot()` e invalidação de `['inspector','schedule']`, para o card voltar a "Check in". Para 422 de geofence o item **não** oferece "Retry" (as coordenadas não mudam); a mensagem termina com "Check in again when you're at the property." Para 5xx/rede continua como hoje (retry). Testes: `useOfflineQueue.test.ts` (START 422 → estado local limpo, FINISH encadeado removido; START 503 → permanece PENDING) e `AppointmentCard.test.tsx` (após a limpeza, "Check in" reaparece). Q8 do checklist manual ganha o passo "volta a mostrar Check in".
- **Precisa de decisão do dev?** Não.

---

## L-F03-03 · Lembrete de conclusão: copy para serviço nunca iniciado, dias com várias paradas e `dedupeKey` sem inspetor

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F03-2 · passo 13, teste 16, D12/D17; contrato com F02 (`dedupeKey`) e F05 (alerta `COMPLETION_REMINDER` lido por `inspector_notices.dedupe_key`).
- **O que falta / está ambíguo:**
  1. O candidato inclui "sem execução" (teste 16, 1º caso), mas o único texto é "Did you finish {code}…? Check out in the app so the job is marked done." — para um serviço que o inspetor **nem iniciou** a mensagem está errada e induz um check-out sem check-in (que o servidor recusa com 404).
  2. Em dia com várias paradas, cada appointment gera seu próprio aviso crítico (push + SMS quando o push falha, F02 D2-a). Não há limite por inspetor por rodada nem agrupamento; duas janelas que terminam no mesmo horário geram 2 pushes e até 2 SMS. Não está definido se o lembrete deve ser suprimido quando o inspetor está com **outra** execução em andamento (está trabalhando; só vai fechar a anterior depois).
  3. `dedupeKey = completion-reminder:{appointmentId}:{civilDate}` não tem o inspetor: se o lembrete já foi para `i1`, o `cant-do` abandona, a OP reoferta no mesmo dia e `i2` assume, `i2` nunca recebe o lembrete (a F02 devolve `created: false`). O audit `inspection.completion_reminder_sent` é gravado de novo mesmo quando a F02 não criou nada? O teste 16 não cobre.
  4. A F05 deriva o alerta "lembrete disparado" pelo prefixo do `dedupe_key`; o prefixo não é uma constante compartilhada.
- **Por que importa:** inspetor com 4 paradas, a primeira termina 11:00 e ele só fará o check-out dela quando sair, às 11:40 (terminou a vistoria, ficou conversando com o inquilino): recebe push + SMS "Did you finish…" às 11:31 enquanto ainda está no imóvel; a terceira parada, que ele nem começou porque está atrasado, recebe o mesmo texto, contraditório com o alerta `NOT_STARTED` que a OP vê na F05. O custo de SMS escala com paradas × inspetores.
- **Evidência:** F03-tarefas teste 16 ("sem execução → chama"; "execução em andamento sem finish → envia"); passo 13 (`body` único; `dedupeKey` sem inspetor); F02-tarefas D2-a (crítico sem push `SENT` → SMS) e `PublishSystemInspectorNoticeOutput { created }`; F05-tarefas linha 8 ("F02 só pela tabela `inspector_notices.dedupe_key`").
- **Proposta de regra/detalhe:** (a) dois textos: execução em andamento → "Did you finish {code} at {address}? Check out in the app so the job is marked done."; sem execução → "{code} at {address} was due by {timeSlotEnd}. Check in when you arrive, or tell operations if you can't do it."; (b) `dedupeKey = completion-reminder:{appointmentId}:{civilDate}:{inspectorId}` e constante `COMPLETION_REMINDER_DEDUPE_PREFIX` em `packages/shared/src/constants/inspector-notices.ts`, usada pela F05; (c) audit `inspection.completion_reminder_sent` só quando `created === true`, com `noticeId`; (d) supressão: não lembrar um appointment enquanto o inspetor tem outra execução **em andamento** (não abandonada) iniciada depois do fim da janela deste (ele está ocupado; o próximo ciclo reavalia); (e) o log de resumo passa a ter `skippedBusy`.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Lembrar os dois casos (em andamento e não iniciado) com textos distintos, supressão "ocupado" e `dedupeKey` com inspetor.
  2. Lembrar só "em andamento sem finish" (o caso literal "esqueceu o check-out"); o "não iniciado" fica só com o alerta da OP na F05.
  3. Manter como está (um texto, sem supressão), aceitando o custo de SMS e o texto incorreto para não iniciados.

---

## L-F03-04 · "Vou atrasar": `minutesLate` não tem referência e os estados permitidos estão incompletos

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F03-2 · `ReportLateNoticeUseCase` (passo 8, teste 7), contrato §2; TASK-F03-3 · folha "Running late"; consumidores F05 (alerta), F06 (aviso ao inquilino), F07 (P4).
- **O que falta / está ambíguo:** `minutesLate` é "minutos estimados", mas não diz **em relação a quê**: ao início da janela combinada com o inquilino, à ETA publicada do roteiro (F04) ou ao "agora". A folha pergunta só "How late?". A F06 vai dizer ao inquilino algo como "running about 20 min late" — o inquilino só conhece a janela; a F05 projeta com "piso do LATE_NOTICE" (precisa de um instante absoluto); a F07 compara o **horário do aviso** com a ETA. Também não está definido: (a) se o aviso é aceito com execução **em andamento** (já fez check-in — "atrasar" não faz sentido; só "finalizada → 422" está especificado); (b) se é aceito **depois** do fim da janela (o inspetor ainda não chegou, janela 09–11, são 11:20: "20 min late" significa chega 11:40?); (c) "data passada ainda SCHEDULED → ok" aceita um aviso para um serviço de ontem, que a F05/F06 não têm como consumir.
- **Por que importa:** janela 09:00–11:00, ETA publicada 10:10. O inspetor manda "20 min" às 09:30. A F06 avisa o inquilino "o inspetor chega ~20 min atrasado" (ele entende 11:20, fora da janela); a F05 projeta 10:30 (ETA + 20). Os dois consumidores leem o mesmo número de formas diferentes e o inquilino recebe uma informação errada.
- **Evidência:** F03-tarefas: "minutos estimados" (plano), `lateNoticeRequestSchema.minutesLate: int 5..240`, testes 7 ("data passada ainda SCHEDULED → ok"; só "execução finalizada → 422"); F05-tarefas linha 127 ("piso do `LATE_NOTICE`"), 732; F07-tarefas P4 (compara `effectiveNoticeAt` com `published_eta`).
- **Proposta de regra/detalhe:** definir `minutesLate` como **atraso estimado em relação ao início da janela combinada (`timeSlotStart`)**, que é a referência que inquilino, OP e inspetor compartilham; a resposta e o evento de domínio passam a carregar também `estimatedArrivalAt = max(windowStartAt, effectiveNoticeAt) + minutesLate` (instante), calculado no servidor no fuso da agência, para F05/F06 não recalcularem. Folha: "How late will you arrive? (from {timeSlotStart})". Regras de estado: `SCHEDULED`, atribuído, **sem execução em andamento ou finalizada** (em andamento → 422 "You've already checked in to this job."), `scheduledDate == hoje` no fuso da agência (não "≤ hoje"; ontem → 422 "You can only send a running-late notice on the day of the job."). Depois do fim da janela continua permitido (o atraso já aconteceu; o número ajusta a ETA).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Referência = início da janela; servidor devolve `estimatedArrivalAt`; só hoje; recusado após check-in.
  2. Referência = ETA publicada do roteiro quando existe (F04), senão início da janela — mais preciso para a OP, mas o inquilino não conhece a ETA e a F03 passaria a depender da F04.
  3. Manter "minutos estimados" sem referência e deixar cada consumidor interpretar (F05/F06/F07 precisariam combinar entre si).

---

## L-F03-05 · `geofence_radius_m` não é garantido em todo check-in pós-F03, e a F07 usa `NULL` como "pré-F03"

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F03-1 · colunas novas, passo 6.10, teste 9 ("`geofence_radius_m` gravado = 300"); TASK-F03-2 · D13 (reinício); contrato §3.
- **O que falta / está ambíguo:** a coluna é descrita como "snapshot do raio aplicado no check-in", nullable. Não está dito se ela é gravada quando o imóvel **não tem coordenadas** (o geofence não foi "aplicado"), quando houve fallback (`NO_ACCURACY`/`POOR_ACCURACY`) e no reinício de execução abandonada. A F07 usa `geofence_radius_m IS NULL` como marcador de "execução anterior à F03" para **excluir** a execução das métricas `PUNCTUALITY` e `GEOFENCE` — e `PUNCTUALITY` não depende de coordenadas do imóvel.
- **Por que importa:** implementador deixa `NULL` quando não há coordenadas. Uma agência com 30% de imóveis sem geocodificação tem 30% dos check-ins fora da pontualidade do índice (F07), e a F05 mostra o chip "Outside geofence ({raio} m)" sem raio. O teste 9 só cobre o caso com coordenadas.
- **Evidência:** F03-tarefas tabela de colunas ("snapshot do raio aplicado no check-in"), teste 9 "BLOCK, imóvel sem coordenadas → cria, `geolocationDistanceMeters null`" (sem assert do raio); F07-tarefas linhas 100 ("**nulo em execuções anteriores à F03**"), 383 ("`EXECUTED` com `geofence_radius_m` nulo (anterior à F03: `out_of_window` não confiável)"), 596.
- **Proposta de regra/detalhe:** regra explícita: **todo** `start` pós-F03 grava `geofence_radius_m = settings.geofenceRadiusMeters`, inclusive sem coordenadas do imóvel, com fallback e no reinício (D13). `NULL` significa exclusivamente "linha anterior à F03" e isso entra no contrato §3 para F05/F07/F09. Acrescentar ao teste 9 os asserts "sem coordenadas → `geofenceRadiusMeters 300`" e ao teste 8 (F03-2) "reinício → raio atual gravado". O audit `inspection.geolocation_mismatch` continua usando `thresholdMeters` = o mesmo valor.
- **Precisa de decisão do dev?** Não.

---

## L-F03-06 · Sincronização tardia (> 24 h) penaliza um check-in pontual

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F03-1 · `resolveEffectiveEventTime` (teste 6, janela −24 h / +5 min), casos de borda "Item novo na fila offline sincronizado horas depois"; consumidores F05 (`OUT_OF_WINDOW`) e F07 (`PUNCTUALITY`).
- **O que falta / está ambíguo:** fora da janela de plausibilidade o servidor usa `serverNow` para avaliar `out_of_window`, e a flag fica gravada como fato. A fila offline do PWA **não expira** itens, então um START feito sexta às 09:30 e sincronizado segunda vira `out_of_window = true` e "check-in no dia seguinte ao agendado → LATE" na F07, embora `start_client_at` prove o contrário. Não há como distinguir, na linha, "fora da janela de verdade" de "janela avaliada com o horário do servidor por falta de plausibilidade". O valor 24 h também não foi justificado (relógio do aparelho adiantado em 6 min já cai no `serverNow` pela borda de +5 min).
- **Por que importa:** inspetor em área sem sinal (comum em propriedades rurais) faz 3 check-ins pontuais na sexta e só sincroniza na segunda. A F05 mostra 3 alertas `OUT_OF_WINDOW` já vencidos, e o índice da F07 registra 3 `LATE`, derrubando a pontualidade e, na F08, a faixa de recompensa.
- **Evidência:** F03-tarefas teste 6 (`serverNow − 25 h → serverNow`), caso de borda "fora disso usa o servidor"; `apps/pwa/src/features/execution/hooks/useOfflineQueue.ts` (sem expiração; ordena por `createdAt`); F07-tarefas linhas 154, 400 ("`out_of_window` é usado tal como gravado").
- **Proposta de regra/detalhe:** manter a janela de plausibilidade só como proteção contra relógio absurdo, mas **ampliar para 7 dias no passado** (um item mais antigo que isso é lixo da fila) e gravar `window_evaluated_with` (`'CLIENT' | 'SERVER'`) na execução — ou, mais simples, definir que `out_of_window` só é `true` quando houve `start_client_at` plausível **ou** `clientOccurredAt` ausente (item antigo); quando o cliente mandou um horário implausível, `out_of_window = false` e audit `inspection.started` com `metadata.windowSkipped = 'IMPLAUSIBLE_CLIENT_TIME'`. Teste 6 e teste 9 ganham o caso. Contrato §3 registra a semântica para F05/F07.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Janela de plausibilidade de 7 dias para trás e `out_of_window = false` + audit quando o horário do cliente é implausível (nunca penalizar sem evidência).
  2. Manter 24 h, mas gravar `window_evaluated_with` para a F07 excluir as linhas `SERVER`.
  3. Manter como está e registrar na spec que sincronização > 24 h conta como atraso.

---

## L-F03-07 · O e-mail de rejeição à agência não diz que foi o inspetor nem o que acontece depois

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F03-2 · D1/D14 (reuso do `INSPECTION_REJECTED_AGENCY`), casos de borda "Nota no e-mail da agência".
- **O que falta / está ambíguo:** a tarefa reusa o template de rejeição sem adaptar o texto. O HTML atual diz "has been rejected … This inspection will not go ahead as scheduled and needs to be rearranged. Where the tenant told us when they are available, those times are recorded against the appointment." A única pista do que houve é a linha "Reason: Key didn't work — Lockbox code wrong". Para `CANT_ATTEND` dias antes, a agência lê "rejected" e "tenant told us when they are available" — o inquilino não disse nada; para `TENANT_REFUSED`/`NO_ANSWER` a agência não sabe se precisa falar com o inquilino ou esperar a OP reofertar. Também não está definido o assunto do e-mail nem se a agência recebe um segundo aviso quando a OP reoferta (hoje a reoferta não avisa a agência; `INSPECTION_NOTICE` vai ao inquilino quando volta a SCHEDULED).
- **Por que importa:** o CL_ADMIN recebe "Inspection rejected — Reason: I can't attend" três dias antes da vistoria e abre chamado com a OP perguntando se o imóvel foi recusado pela plataforma. A nota do inspetor ("tenant was aggressive") chega sem contexto de quem escreveu.
- **Evidência:** `apps/backend/src/modules/notification/domain/platform-notification-templates.ts:205-222` (`REJECTED_AGENCY_HTML`); `build-notification-payload.service.ts:151-152` (`rejectionReason = appointment.reason`); F03-tarefas D14 e "Casos de borda · Nota no e-mail da agência (D14)".
- **Proposta de regra/detalhe:** sem template novo: acrescentar ao payload do `INSPECTION_REJECTED_AGENCY` a variável opcional `rejectedByInspector` (true quando `rejectionReasonCode === 'INSPECTOR_UNABLE'`, com `inspectorName`) e ao HTML um bloco `{{#if rejectedByInspector}}<p>The inspector ({{inspectorName}}) reported from the property that they couldn't complete this inspection. Operations have been notified and will offer the job again; you don't need to do anything unless we contact you.</p>{{else}}…parágrafo atual…{{/if}}`. Registrar a variável em `TEMPLATE_VARIABLES` (optional) e no teste de variáveis. Isso respeita D14 (a nota continua no `{{rejectionReason}}`).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Bloco condicional no template existente com `rejectedByInspector`/`inspectorName`.
  2. Template de agência novo `INSPECTION_INSPECTOR_UNABLE_AGENCY` (mais 8 lugares de registro e mais um template para a agência personalizar).
  3. Manter o texto atual (aceitar a ambiguidade; registrar na spec).

---

## L-F03-08 · BLOCK não tem saída por appointment quando as coordenadas do imóvel estão erradas

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F03-1 · D4, `evaluateGeofence`, deploy/rollback; TASK-F03-3 · 422 no card/painel.
- **O que falta / está ambíguo:** o fallback para FLAG só cobre "imóvel sem coordenadas" e "precisão > raio". Um imóvel **geocodificado no lugar errado** (centroide do bairro, número trocado, geocodificação antiga da X02) com precisão boa do GPS bloqueia o check-in com 422 e a única saída especificada é a OP mudar o modo **global** para FLAG (vale para todos os inspetores em ≤ 30 s). Não há regra para o inspetor contestar, nem para a OP liberar um appointment/imóvel específico, nem um sinal de qualidade da geocodificação do imóvel alimentando o fallback.
- **Por que importa:** com BLOCK ligado, um inspetor na porta certa de um imóvel geocodificado 600 m fora liga para a OP; a OP desliga o BLOCK da plataforma inteira por causa de um imóvel e esquece de religar. O 03.A2 ("recusado com mensagem clara") é atendido, mas a operação não.
- **Evidência:** F03-tarefas D4 (três causas de fallback), "Rollback: se for preciso desligar o BLOCK sem deploy: `PUT … geofenceMode: 'FLAG'`", TASK-F03-3 "Nenhuma pré-checagem de BLOCK: o 422 do servidor é mostrado"; X02 (geocodificação permanente) não expõe confiança do geocode no contrato lido pela F03.
- **Proposta de regra/detalhe:** mínimo dentro do escopo: a mensagem do 422 orienta ("You are 640 m from the property. Check-in is only allowed within 300 m. If you are at the right address, contact operations.") e o audit `inspection.check_in_blocked` + log `warn` já existem para a OP investigar; a OP corrige as coordenadas do imóvel (edição de property existente) e o inspetor tenta de novo com a mesma `Idempotency-Key` (o 422 não é cacheado). Registrar na spec que **não** há override por appointment nesta fase e que BLOCK só deve ser ligado depois da X02 e de uma auditoria de geocodificação.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Sem override por appointment; mensagem orienta a contatar a OP; a OP corrige o imóvel; documentar o pré-requisito (X02) para ligar BLOCK.
  2. Override por appointment: flag `geofence_block_waived` gravada pela OP (AM/OP, auditada), lida pelo `evaluateGeofence` como fallback `OPERATOR_WAIVED` (+0,5 dia, 2 endpoints e UI).
  3. Fallback automático quando a propriedade foi geocodificada com baixa confiança (depende de a X02 persistir `geocode_confidence`; acoplamento com a X02).

---

## L-F03-09 · O inspetor não vê o próprio "Não consigo fazer" depois de enviar

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F03-3 · folha "Can't do this job", 409 `CANT_DO_ALREADY_REPORTED`; TASK-F03-2 · detalhe do inspetor (`inspectorAppointmentDetailResponseSchema`).
- **O que falta / está ambíguo:** depois do envio o appointment some da agenda (REJECTED) e não há nenhum lugar no PWA onde o inspetor veja o que reportou. Se a OP reoferta e o **mesmo** inspetor aceita o grupo (comum em `NO_ANSWER`/`KEY_FAILED`: volta no dia seguinte), o detalhe no PWA não mostra "You reported: Key didn't work, Mon 09:41", embora o web mostre o card para a OP e para a agência. Também não está definido se a OP consegue ver que o inspetor atual é o mesmo que reportou (o `inspectorIssue` traz o nome, mas não o id).
- **Por que importa:** o inspetor reaceita o grupo sem lembrar que foi ele que reportou "key didn't work", chega ao imóvel com o mesmo código de lockbox e reporta de novo; a OP vê dois `CANT_DO` idênticos e não sabe se a agência corrigiu o código.
- **Evidência:** F03-tarefas: `inspectorAppointmentDetailResponseSchema` só ganha `geofence` e campos de `execution`; `GET /v1/inspector/schedule` "o appointment rejeitado não aparece"; `inspectorIssue` só nas rotas de AM/OP/CL.
- **Proposta de regra/detalhe:** acrescentar `lastFieldIssue: { reason, note, occurredAt } | null` ao detalhe do inspetor **apenas quando** o último `CANT_DO` do appointment é do próprio inspetor (`inspector_id = actor.inspectorId`), e um `Alert` informativo no `AppointmentDetailPage` do PWA: "You reported '{label}' on {date}. This job was offered again." Nenhum histórico/lista nova. Opcionalmente `inspectorId` no `inspectorIssue` para o web mostrar "(current inspector)".
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Alerta no detalhe do PWA só quando o último `CANT_DO` é do próprio inspetor (+0,25 dia na TASK-F03-2/3).
  2. Nada nesta fase; registrar no estacionamento.

---

## L-F03-10 · `UpdatePlatformSettingUseCase` não emite evento; a F07 precisa de um gancho e vai alterar código da F03

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F03-1 · módulo `platform-settings`, contrato §1; consumidor F07 (D7: salvar pesos recalcula o snapshot).
- **O que falta / está ambíguo:** o contrato exportado descreve `PUT` auditado e cache de 30 s por instância, mas não define nenhum evento de domínio na gravação. A F07 registra explicitamente que "sem um gancho nele, a F07 não tem como saber que os pesos mudaram" e que o worker em outra máquina pode ler o valor antigo por até 30 s. Sem o evento na F03, a F07 modifica o use case da F03 (fora do seu PR) ou faz polling.
- **Por que importa:** a F07 abre PR mexendo em `update-platform-setting.use-case.ts` e no teste 8 da F03; qualquer outra feature que precise reagir (F04 recalcular planos quando `routeWeights` muda) repete a cirurgia.
- **Evidência:** F03-tarefas contrato §1 (sem evento); F07-tarefas linha 665 ("Não emite evento, e é o único caminho de gravação dos pesos: sem um gancho nele, a F07 não tem como saber").
- **Proposta de regra/detalhe:** na TASK-F03-1, `PLATFORM_SETTING_EVENTS = { UPDATED: 'platform_setting.updated.v1' }` em `domain-event-bus.ts`, emitido **após o commit** do `upsert` com payload `{ key, before, after, actorId, occurredAt }` (mesmo `Promise.allSettled` dos outros eventos). Teste 8 ganha "sucesso → evento emitido uma vez; falha de subscriber não falha o PUT". Contrato §1 passa a listar o evento. A invalidação cross-máquina continua sendo o TTL de 30 s (D18 não muda).
- **Precisa de decisão do dev?** Não.
