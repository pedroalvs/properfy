# F06 · Lacunas

Revisão de `tarefas/F06-tarefas.md` (plano `F06-avisos-horario-inquilino.md`; contratos F03/F04; consumidor F05). Código verificado no snapshot read-only de `origin/develop`. Nada do que já está em "Decisões" (D1–D19, Q3, Q21) ou nos "Achados" fechados em 2026-10-28 é reaberto aqui.

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 11 | 3 | 4 | 4 |

Decisão do dev necessária em: L-F06-01, L-F06-02, L-F06-03, L-F06-04, L-F06-05, L-F06-06.

---

## L-F06-01 · "A caminho" dispara no check-out mesmo quando a próxima janela só abre horas depois

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F06-2 · Gatilhos §2 (passos 3–4) e §2b (passo 4); Templates (`TENANT_ETA_ON_THE_WAY`); Casos de borda 3b.
- **O que falta / está ambíguo:** o gatilho envia `ON_THE_WAY` para "a 1ª parada depois da finalizada" sem nenhuma condição sobre a **distância no tempo** entre o fim da parada anterior e o início projetado da próxima. O `evaluateSequence` da F04 aplica "folga para frente": quando a próxima janela abre mais tarde, a partida é **adiada** para não haver espera fantasma, e o `projectedStartAt` vira o início da janela. O texto, porém, afirma "has finished the previous visit and is on the way".
- **Por que importa:** A termina 09:00; B tem janela 13:00–15:00, trecho 20 min. Projeção de B = 13:00 (início da janela). Às 09:00 o inquilino de B recebe SMS "your inspector is on the way … between 1:00 pm and 1:30 pm" — 4 horas antes, com o inspetor possivelmente indo a outra agência ou almoçando. O inquilino fica esperando "a caminho" a manhã inteira; é o aviso mais visível do contrato (01.10) e sai errado em qualquer dia com janela da tarde. Não há teste que cubra "próxima com espera de janela".
- **Evidência:** F06-tarefas §2 passo 3–4 (sem condição de proximidade); F04-tarefas "Folga para frente" (Algoritmo da TASK-F04-1: `d` adia a partida para que esperas só sobrem quando inevitáveis); copy do `TENANT_ETA_ON_THE_WAY` ("has finished the previous visit and is on the way"); fixture de testes (B 09:00–12:00 logo após A) nunca exercita uma janela distante.
- **Proposta de regra/detalhe:** definir `onTheWayMaxLeadMinutes` (constante ou campo da chave `tenantEtaNotices`, padrão 60): `ON_THE_WAY` só sai quando `projectedArrivalAt − now ≤ lead`; caso contrário `reason 'NEXT_TOO_FAR'`, sem reagendar (a parada continua coberta pelo MORNING e pela varredura de atraso). Acrescentar teste: A fim 09:00, B janela 13:00–15:00 → nenhum ON_THE_WAY; B janela 09:30–11:00 → envia. Registrar que, sem rastreamento, "a caminho" significa "sai da parada anterior em direção a você dentro de N min".
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Limite de antecedência (60 min) + `NEXT_TOO_FAR`; nada é reagendado.
  2. Enfileirar o ON_THE_WAY com `startAfter = projectedArrivalAt − travelS − 5 min` (job durável com `singletonKey`), reavaliando o plano na hora (mais fiel, +0,25 dia, mais um caminho de dedupe).
  3. Manter como está (sem limite) e trocar o copy para "will visit you next … between {{etaFrom}} and {{etaTo}}" (sem "on the way").

## L-F06-02 · Inquilino não confirmado (ou "indisponível") com `key_required` recebe "sua inspeção é hoje" e "a caminho"

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F06-2 · Gatilhos §1 "Condições por parada", §2, §2b, §4; Casos de borda; TASK-F06-1 · Algoritmo §C (`loadPlan` não lê `rental_tenant_confirmation_status`/`key_required`).
- **O que falta / está ambíguo:** nenhuma condição por **status de confirmação do inquilino** nem por `key_required`. O T-1 (`reject-unconfirmed-appointments`) só rejeita `rental_tenant_confirmation_status <> 'CONFIRMED' AND key_required = false`; ou seja, appointments com chave e inquilino `PENDING`, `NO_RESPONSE` ou **`UNAVAILABLE`** continuam SCHEDULED, entram no plano (o `T1VisibilityService` torna `keyRequired` visível) e a F06 os trata como qualquer outra parada.
- **Por que importa:** o inquilino respondeu no portal "não estarei disponível" (UNAVAILABLE); a agência mantém a inspeção com a chave da imobiliária. Às 07:00 ele recebe "your inspection is today, the inspector is expected to arrive between 9:00 am and 9:30 am" e, depois, "your inspector is on the way". Para quem disse que não estará lá (ou nunca respondeu), isso parece erro ou pressão para estar presente; em volume, gera chamadas à agência e opt-outs. O mesmo vale para o `NO_RESPONSE` que o portal já marcou como "sem resposta".
- **Evidência:** `apps/backend/src/modules/appointment/infrastructure/prisma-appointment.repository.ts:867-868` (`rental_tenant_confirmation_status: { not: 'CONFIRMED' }, key_required: false`); `apps/backend/src/modules/inspector-execution/domain/t1-visibility.service.ts` (`keyRequired` → visível); `RentalTenantConfirmationStatus { PENDING, CONFIRMED, UNAVAILABLE, NO_RESPONSE }` em `schema.prisma:93-98`; F06-tarefas `loadPlan` (§C) não seleciona esses campos; D10 só pula por `enabled`, switch da agência e flow type.
- **Proposta de regra/detalhe:** o leitor expõe `rentalTenantConfirmationStatus` e `keyRequired` por parada; o notificador pula com `reason 'TENANT_UNAVAILABLE'` quando `UNAVAILABLE`, e com `reason 'TENANT_UNCONFIRMED'` quando `PENDING`/`NO_RESPONSE` **e** `keyRequired` (o inquilino não combinou presença). `CONFIRMED`, flow sem confirmação (`requiresRentalTenantConfirmation = false`) e `keyRequired` com `CONFIRMED` recebem normalmente. A projeção continua usando todas as paradas (só o envio é filtrado). Testes: uma parada `UNAVAILABLE` com chave no plano → nenhum `TENANT_ETA_*`, demais paradas normais.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Pular `UNAVAILABLE` sempre e `PENDING`/`NO_RESPONSE` com chave; avisar só quem confirmou ou não precisa confirmar.
  2. Pular só `UNAVAILABLE`; não confirmados com chave recebem (o aviso pode servir de lembrete).
  3. Enviar a todos (comportamento atual implícito); registrar como decisão e medir reclamações na homologação.

## L-F06-03 · Consentimento por canal (D2) não tem como ser registrado, e os SMS diários não trazem opt-out

- **Severidade:** ALTA
- **Tarefa/seção:** Decisões D2, D11 (classe OPERATIONAL "respeita opt-out"); TASK-F06-2 · teste 10, 22, Casos de borda 7; Riscos ("Classe errada").
- **O que falta / está ambíguo:** a tarefa confia no `isBlockedByConsent` do pipeline, mas no código **não existe caminho que crie um opt-out**: `NotificationConsentEntity.markOptedOut` não tem chamador em `src/`, o único escritor do repositório é `OverrideConsentUseCase` (que **desfaz** um opt-out), não há tratamento de "STOP" no webhook do provedor nem link de descadastro no portal. Os SMS de plataforma não trazem instrução de opt-out. A F06 cria o primeiro fluxo de SMS **recorrente e diário** ao inquilino (até 3 por inspeção) e não diz qual é a posição de conformidade (Spam Act 2003: mensagem puramente factual sobre um serviço contratado é isenta de unsubscribe; se não for assim classificada, exige meio funcional de opt-out) nem como um inquilino que peça para parar é atendido.
- **Por que importa:** um inquilino responde "STOP" ao SMS ou liga para a agência pedindo para não receber mais; hoje nem a OP consegue registrar o pedido (a tela de consentimento só lista e "override"), e no dia seguinte ele recebe de novo MORNING + ON_THE_WAY. O teste 22 (opt-out SMS → `SKIPPED_OPT_OUT`) prova um caminho que só existe por seed.
- **Evidência:** `grep -rn markOptedOut apps/backend/src` → só a entidade (`notification-consent.entity.ts:54`); `override-consent.use-case.ts:62` único `consentRepo.upsert`; `handle-provider-webhook.use-case.ts` sem "STOP"/opt; `platform-notification-templates.ts` sem "reply STOP"/"unsubscribe" em SMS; F06-tarefas D2/D11.
- **Proposta de regra/detalhe:** (1) registrar na spec a classificação: "avisos de horário = mensagem factual de serviço (não comercial), classe OPERATIONAL, sem rodapé de opt-out no SMS"; (2) como atendimento mínimo ao pedido de parar, uma forma de **registrar** o opt-out por recipient/canal: ou reaproveitar o `override-consent` com direção inversa (`POST /v1/notifications/consents` AM/OP com `optedOut: true`, motivo e `ConsentChangeSource 'OPERATOR'`), ou tratar a resposta "STOP" do MobileMessage no webhook existente; (3) o teste 22 passa a criar o opt-out por esse caminho, não por seed.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Posição "factual/operacional" documentada + endpoint de opt-out manual AM/OP (reuso do use case de consentimento; ~0,25 dia; serve a todos os avisos ao inquilino, não só à F06).
  2. Só documentar a posição e deixar o opt-out para uma tarefa separada (risco: a F06 entra em produção sem meio de parar um destinatário).
  3. Tratar "STOP" no webhook (mais completo, depende do suporte do MobileMessage a inbound; estimar à parte).

## L-F06-04 · Gatilho FINISH reage a qualquer `SCHEDULED → DONE`, inclusive o DONE manual da OP sem execução

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F06-2 · Gatilhos §2 ("Fonte", "Condições"); testes 28, 30–34; Contratos §5 (payload de `tenant-eta.evaluate`).
- **O que falta / está ambíguo:** o subscriber enfileira em **todo** `STATUS_TRANSITION` com `toStatus 'DONE'`, sem distinguir o check-out do inspetor (finish, `actorType 'INSPECTOR'`/execução com `finished_at`) de um DONE marcado pela OP/AM sem execução (`actorType 'USER'`, sem `finished_at`). O §2 passo 3 só exclui a próxima se ela já começou. Também usa `occurredAt` no payload e na `singletonKey`, mas o payload do `STATUS_TRANSITION` não tem esse campo (o evento tem `occurredAt` no envelope, não no payload); a tarefa não diz de onde o subscriber o tira.
- **Por que importa:** o inspetor esqueceu o check-in/check-out de A; às 11:30 a OP marca A como DONE pelo web enquanto o inspetor já está em C (B pendente porque foi reordenada para o fim). O job FINISH toma A como "finalizada agora", a próxima da ordem é B (pendente) → SMS "your inspector is on the way" para B com faixa calculada a partir de `max(fim previsto de A, 11:30)`, sem relação com onde o inspetor está. O mesmo acontece quando a OP fecha vários DONE em lote no fim da manhã.
- **Evidência:** `execute-status-transition.use-case.ts:628-644` (payload sem `occurredAt`; `occurredAt: now` só no envelope); F06-tarefas §2 "Fonte" (filtro só por `toStatus`); Algoritmo §A passo 2 ("DONE sem execução (OP marcou): `anchorEnd = min(serviceEndAt ?? now, now)`" — a âncora existe, mas o gatilho não é filtrado).
- **Proposta de regra/detalhe:** o subscriber FINISH só enfileira quando a transição veio do check-out: `actorType === 'INSPECTOR'` **ou** `metadata.phase === 'FINISH'`/`metadata.source` equivalente que a F03 grava no finish (a F03 já põe `metadata.phase = 'FINISH'` em outros audits; confirmar o campo na transição); DONE manual da OP → `reason 'MANUAL_DONE'`, sem ON_THE_WAY (a varredura continua cobrindo atrasos). `occurredAt` = `event.occurredAt` do envelope (documentar). Testes: DONE por `USER` sem execução → nada; DONE por finish → ON_THE_WAY.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Só check-out do inspetor dispara ON_THE_WAY; DONE manual não.
  2. DONE manual dispara, mas só se a execução tiver `finished_at` (OP marcando DONE depois de um check-out sincronizado tarde).
  3. Manter qualquer DONE (aceitar o falso "a caminho" e registrar na homologação).

## L-F06-05 · Reordenação/recálculo que antecipa uma parada não gera correção do aviso matinal

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F06-2 · Casos de borda 13; Gatilhos §4; Fora do escopo ("evento de domínio para ordem salva").
- **O que falta / está ambíguo:** a única correção prevista é o DELAY (projeção **depois** do fim da janela + limite). Se a ordem salva, um recálculo da OP, um CANT_DO em parada anterior ou um check-in antecipado **adiantam** a previsão para antes da faixa dita de manhã, nada é enviado. O "a caminho" cobre parcialmente (sai quando a anterior termina), mas a **1ª parada do dia** nunca recebe ON_THE_WAY (Caso de borda 4) e a janela larga (ex.: 08:00–14:00) permite antecipação de horas dentro da janela.
- **Por que importa:** matinal às 07:00: "between 10:00 am and 10:55 am" para C (janela 08:00–14:00). Às 07:30 o inspetor reordena C para 1ª e chega 08:20. O inquilino, avisado para 10:00, não está em casa ou não abriu; o inspetor registra "sem resposta" (CANT_DO) e a visita é perdida — exatamente o que o 01.12 quer evitar. Nenhum gatilho da F06 vê "antecipação".
- **Evidência:** F06-tarefas Caso de borda 13 ("se piorar além do limite, a varredura avisa"); Caso de borda 4 (1ª parada nunca recebe ON_THE_WAY); F04 D3 (reordenação manual salva mesmo estourando janela; F06 segue a ordem salva).
- **Proposta de regra/detalhe:** na varredura e no `evaluate`, para paradas `PENDING` com MORNING já enviado hoje: se `projectedStartAt < bandFrom(MORNING) − 30 min` (guardar o instante da faixa em `payloadJson.bandFromAt` na linha MORNING, ou reler `etaFrom`), enviar **uma** correção reusando o `TENANT_ETA_ON_THE_WAY` (o DELAY não serve: o texto fala em atraso), inclusive para a 1ª parada do dia (`trigger 'EARLY_CHANGE'`, mesmo ID determinístico `(ON_THE_WAY, parada, data, canal)`), com a faixa recalculada — o copy "on the way … between …" é verdadeiro nesse momento se combinado com a L-F06-01. Se preferir não corrigir, registrar explicitamente "antecipação não gera aviso" como decisão e orientar a OP a não reordenar depois das 07:00 sem avisar.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Correção única por antecipação ≥ 30 min, usando o ON_THE_WAY existente (inclusive para a 1ª parada), 1 por parada por dia.
  2. Sem correção; registrar como decisão + orientação operacional (custo zero, risco na homologação).
  3. 4º template "arrival time updated" (fora do escopo do plano; +0,5 dia).

## L-F06-06 · `enabled` é só de plataforma: nenhuma agência consegue ficar fora dos avisos de horário sem desligar todos os avisos ao inquilino

- **Severidade:** MÉDIA
- **Tarefa/seção:** Decisões D10, D15; TASK-F06-1 · Contratos §2 (chave `tenantEtaNotices`); TASK-F06-2 · Deploy/rollout.
- **O que falta / está ambíguo:** a configuração é global (`PlatformSetting`). O único controle por agência é `rentalTenantNotificationsEnabled`, que desliga **todos** os avisos ao inquilino (notice, lembretes, portal). Não há como uma agência pedir "quero lembretes mas não quero SMS de horário" (cliente que já avisa o inquilino por conta própria, ou que não quer 3 SMS por inspeção no seu nome — o template é customizável por agência e leva a identidade dela). O rollout ("um AM liga em prod") liga para todas as agências de uma vez.
- **Por que importa:** na homologação, o cliente pede para ativar só na agência-piloto; a única alavanca é o `enabled` global, então ou liga para todas ou para nenhuma. Depois do go-live, uma agência que reclame do volume só pode ser atendida desligando todas as suas notificações ao inquilino.
- **Evidência:** F06-tarefas Contratos §2 (chave única, sem campo por agência); `isRentalTenantNotificationsEnabled` (`rental-tenant-notifications.ts`) é binário para todos os `RENTAL_TENANT`; D10.
- **Proposta de regra/detalhe:** campo `tenantEtaNoticesEnabled?: boolean` em `tenants.settings_json` (default `true`, mesmo padrão do `rentalTenantNotificationsEnabled`, sem migration), lido pelo notificador antes do switch (`reason 'AGENCY_ETA_OFF'`), com toggle na tela de configurações da agência que já expõe o switch de inquilino (AM/OP; CL_ADMIN se o dev quiser). Alternativa mais barata para o piloto: lista `pilotTenantIds` na chave de plataforma (vazia = todas), removida depois da homologação.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Flag por agência em `settings_json` + toggle na tela da agência (~0,25 dia).
  2. Allow-list temporária `pilotTenantIds` na chave de plataforma (só para o rollout).
  3. Manter global; aceitar que a única saída por agência é o switch geral.

## L-F06-07 · Contrato do `projectStopEta` diverge do que a F05 espera (nomes de tipos, adaptadores e regra de partida)

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F06-1 · Algoritmo §A e Contratos exportados §3; F05-tarefas (cabeçalho, D7, teste 9c, passos 5, Dependências, Achado 2).
- **O que falta / está ambíguo:** a F05 importa `EtaPlanSnapshot` e monta a entrada com `toEtaPlanSnapshot`/`toEtaRealEvents` próprios (`modules/live-day/domain/to-eta-inputs.ts`), e descreve a regra como `earliestDepartureS = max(âncora, now − travelS)`. A F06 exporta `EtaPlanInput`, o adaptador `etaPlanInputFromDayPlanResponse` e a regra revisada `max(anchorEnd ?? now, now)`. Os dois arquivos citam um ao outro como já alinhados, mas não estão. Também não está dito se a F05 deve usar o adaptador da F06 (que parte do `DayPlanResponse` e deixa `publishedServiceStartAt = null`, alterando o piso D18) ou montar o `EtaPlanInput` com `publishedServiceStartAt` lido do banco (a F05 lê `day_plan_stops` diretamente, então tem o campo).
- **Por que importa:** quem implementar a F05 primeiro escreve contra `EtaPlanSnapshot`; a F06-1 entrega `EtaPlanInput`; o typecheck da F05 quebra no merge, ou pior, a F05 monta a entrada sem `publishedServiceStartAt` e o "atraso > limite" do Dia ao Vivo usa um piso diferente do SMS ao inquilino — exatamente a divergência que D7 proíbe.
- **Evidência:** F05-tarefas l. 127 ("`earliestDepartureS = max(âncora, now − travelS)`"), l. 369/891 (`EtaPlanSnapshot`, `toEtaPlanSnapshot`); F06-tarefas Algoritmo §A (`EtaPlanInput`, partida `max(anchorEnd ?? now, now)`), E12b (adaptador deixa `publishedServiceStartAt null`).
- **Proposta de regra/detalhe:** fixar na F06 (dona do contrato) os nomes finais e acrescentar uma linha em Contratos §3: "consumidores backend (F05) montam `EtaPlanInput` com `publishedServiceStartAt` do banco; `etaPlanInputFromDayPlanResponse` é só para quem tem a resposta HTTP (PWA)". Atualizar o F05-tarefas (nomes e regra de partida) antes das specs; o teste 9c da F05 passa a usar o fixture e os nomes da F06.
- **Precisa de decisão do dev?** Não (alinhamento de texto; a F06 é a fonte).

## L-F06-08 · Copy do "a caminho" afirma "finished the previous visit" em casos em que isso não aconteceu

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F06-1 · Templates (`TENANT_ETA_ON_THE_WAY`, e-mail `body`/`bodyHtml`); TASK-F06-2 · §2b, testes 43b–43c.
- **O que falta / está ambíguo:** o e-mail diz "the inspector has finished the previous visit and is on the way". No CANT_DO (D16) a parada anterior **não** foi concluída (43b: inspetor desistiu depois do check-in; 43c: desistiu antes de chegar, sem nenhuma parada em andamento). O SMS ("your inspector is on the way") está correto; só o e-mail erra. Não há variante de copy por `trigger`.
- **Por que importa:** o inquilino da próxima parada lê que "a visita anterior terminou" enquanto a agência recebe, no mesmo minuto, o REJECTED por `INSPECTOR_UNABLE`. Em disputa ("você disse que ele terminou a anterior…") o texto é citável.
- **Evidência:** F06-tarefas Templates (`TENANT_ETA_ON_THE_WAY` body); §2b passo 4; teste 43c.
- **Proposta de regra/detalhe:** neutralizar o e-mail: "The inspector{{#if inspectorName}}, …{{/if}} is on the way to your {{service}} …" (sem "finished the previous visit"), mantendo o `body` texto equivalente; ajustar os comprimentos documentados.
- **Precisa de decisão do dev?** Não.

## L-F06-09 · "Template de agência sem `{{etaFrom}}` → o editor bloqueia o save" só vale no web; a API aceita e o envio sai sem horário

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F06-1 · Casos de borda 2; Riscos ("`required` derruba envio").
- **O que falta / está ambíguo:** `UpsertNotificationTemplateUseCase` só valida "Body is required"/"Subject is required"; a lista `TEMPLATE_VARIABLES[code].required` é aplicada apenas no `TemplateFormDrawer` do web. O `MissingRequiredVariableError` do `BuildNotificationPayloadService` checa o **payload** (que os gatilhos sempre preenchem), não o **template**. Logo, um template de agência salvo por API (ou por um web antigo) sem `{{etaFrom}}`/`{{etaTo}}` passa e o inquilino recebe "your inspector is on the way" sem faixa de horário — o aviso "sem horário" que a tarefa diz ser impossível.
- **Por que importa:** o que a tarefa descreve como garantia não existe no servidor; o critério de aceite "nunca aviso sem horário" não tem teste que o prove para templates customizados.
- **Evidência:** `upsert-notification-template.use-case.ts:111-128` (só body/subject); `grep TEMPLATE_VARIABLES apps/backend/src/modules/notification/application/use-cases/` → vazio; web `TemplateFormDrawer.tsx:148-152`.
- **Proposta de regra/detalhe:** ou (a) registrar o caso como limitação conhecida ("validação de obrigatórias é só no editor web"), ou (b) no `upsert` exigir que o corpo de um template `TENANT_ETA_*` contenha as variáveis `required` do spec (regra genérica para qualquer código com `required`, 422 "Template must include {{etaFrom}} and {{etaTo}}"), com teste. (b) é pequeno e fecha o buraco para todos os códigos.
- **Precisa de decisão do dev?** Não (recomendado (b); se o dev preferir (a), só documentar).

## L-F06-10 · Convenção do campo `section` diverge da F03

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F06-1 · Passo 2 e Contratos §2 (`section: 'tenantEtaNotices'`); teste 2.
- **O que falta / está ambíguo:** a F03 define `section` como rótulo de exibição (`section: 'Field events'`), devolvido em `platformSettingResponseSchema.section` e usado pela página para agrupar. A F06 usa a própria chave (`'tenantEtaNotices'`) como `section`, enquanto o título da seção web é "Tenant arrival notices".
- **Por que importa:** a página de Platform settings mostraria "tenantEtaNotices" como cabeçalho (ou o dev inventa um mapa chave→rótulo só para a F06); a lista `GET /v1/platform-settings` fica inconsistente entre as duas chaves.
- **Evidência:** F03-tarefas l. 283 (`section: 'Field events'`) e `platformSettingResponseSchema.section: z.string()`; F06-tarefas Contratos §2.
- **Proposta de regra/detalhe:** `section: 'Tenant arrival notices'` (mesmo texto do título da seção web).
- **Precisa de decisão do dev?** Não.

## L-F06-11 · Observabilidade de volume e custo depende de log e SQL manual; a métrica é "opcional"

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F06-2 · Passo 8 ("Métrica opcional"), Riscos ("Custo de SMS"), Deploy ("Consulta de custo (homologação)"); TASK-F06-1 · Passo 8 (log `notification.sms_dispatched`).
- **O que falta / está ambíguo:** não há contador no `/metrics` para avisos criados por `kind`/canal nem para `parts` de SMS, nem um alerta/limiar de plataforma (ex.: "mais de N SMS `TENANT_ETA_*` por dia"). O único teto é o por agência (D15); um bug de loop ou um plano com 200 paradas num dia só aparece na consulta SQL feita à mão na homologação.
- **Por que importa:** depois da homologação ninguém roda a consulta; um dia com `sweep` disparando DELAY em massa (ex.: todos os inspetores sem check-in, Risco "Falso atraso") só é visto na fatura do MobileMessage.
- **Evidência:** F06-tarefas Passo 8 ("opcional"); `MetricsCollector` (`shared/infrastructure/metrics.ts`) já tem contadores por domínio; nenhum log de agregação diária previsto.
- **Proposta de regra/detalhe:** tornar obrigatórios `incrementTenantEtaNoticeCount(kind, channel)` e `addSmsParts(templateCode, parts)` no ramo do `sms_dispatched`; `tenant_eta.sweep_completed` já existe — acrescentar `smsCreatedToday` (contagem de `TENANT_ETA_*` SMS criados no dia) e um `logger.warn('tenant_eta.daily_volume_high')` acima de um limiar fixo (ex.: 500/dia de plataforma), sem bloquear.
- **Precisa de decisão do dev?** Não.
