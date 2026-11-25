# Investigação O-11: gerar o link do portal desfaz a confirmação do inquilino

Data: 25/11/2026. Só análise; nenhum código foi alterado e nada foi acessado em produção.
Base: `develop` local (`6651c546`) e `origin/main` (`13f8f34a`, 06/11). Os arquivos envolvidos são idênticos nos dois ramos (só `notify-on-status-transition.handler.ts` difere, em trecho alheio a isto).

Observação de origem: `fase2-etapa1/reteste-dev-2026-11-24.md:410` (O-11).

---

## Resumo

1. **A causa não é o `notify:false`.** Qualquer geração de link (Send Portal Link, Generate and copy, reenvio em massa, Send portal link do grupo) zera a confirmação **quando o agendamento está CONFIRMED sem ciclo de confirmação ativo**.
2. **Um CONFIRMED sem ciclo é o caso comum, não a exceção.** A spec 028 manda criar o ciclo na transição para SCHEDULED, mas isso nunca foi implementado: o único lugar que cria ciclo é a própria geração manual do link. Quando o inquilino confirma pelo link do e-mail automático, ou o operador força a confirmação antes de alguém ter gerado um link à mão, o código grava só o campo `rental_tenant_confirmation_status = CONFIRMED`, sem ciclo.
3. **Na próxima geração de link, o serviço não encontra ciclo, cria um ciclo PENDING novo e sobrescreve o CONFIRMED.** Nada avisa o operador.
4. **A geração no dia anterior à visita é a mais grave.** Passado o corte T-1, o inquilino não consegue confirmar de novo pelo portal ("The confirmation deadline has passed"). Às 19:00 o job T-1 rejeita o agendamento com `TENANT_NO_RESPONSE`, tira-o do grupo e notifica. Isso acontece mesmo com o inquilino tendo confirmado.
5. **A auditoria existe, mas fica invisível.** O ciclo novo é registrado (`appointment_confirmation_cycle.created`) com `entityId` = id do ciclo, não do agendamento. Por isso o registro não aparece na linha do tempo do agendamento, e ele também não guarda o status anterior nem o operador.
6. **É efeito colateral, não comportamento desenhado.** Está em produção desde 26/05/2026 (#30). Recomendo uma correção só de backend, sem mudança de tela nem de contrato (opção B abaixo).

---

## (a) Caminho de código

### Onde o status volta para PENDING

1. Rota `POST /v1/appointments/:appointmentId/portal-token` → `GeneratePortalTokenUseCase.execute` (`apps/backend/src/modules/rental-tenant-portal/application/use-cases/generate-portal-token.use-case.ts:105`).
2. O mint do token e a ligação ao ciclo acontecem na mesma transação, **antes** do ramo `notify` (`:164-176`):
   ```ts
   const minted = await this.mintPortalTokenService.mint(appointment, tenant, ctx.tx);
   await this.cycleService.createInitial(appointmentId, tenantId, scheduledDate, timeSlot, minted.tokenId, ctx.tx, ctx.defer);
   ```
   O `notify:false` só entra depois do commit, em `completeAfterCommit` (`:306-325`), e decide apenas se envia ou não. O ciclo já foi gravado nesse ponto.
3. `ConfirmationCycleService.createInitial` (`apps/backend/src/modules/appointment/application/services/confirmation-cycle.service.ts:33`):
   - **Com ciclo ativo** (`:45-64`): só liga o token novo ao ciclo e mantém o status. Um ciclo CONFIRMED continua CONFIRMED, então esse caminho é seguro.
   - **Sem ciclo ativo** (`:67-96`): cria um ciclo `status: 'PENDING'` e chama `setAppointmentActiveCycle(..., 'PENDING')` (`:86`).
4. `setAppointmentActiveCycle` (`:323-337`) faz o `appointment.updateMany` com `rental_tenant_confirmation_status: 'PENDING'`. **É esta linha que zera o status.** Ela não lê o valor anterior.

O ciclo ativo é lido em `findActiveByAppointmentId`, que busca o primeiro ciclo não SUPERSEDED (`prisma-confirmation-cycle.repository.ts:86-96`).

### Como nasce um CONFIRMED sem ciclo

Só existe um chamador de `createInitial`: a geração de link (`grep createInitial(` em `apps/backend/src`). Os outros caminhos que entregam link ou confirmam não criam ciclo:

| Caminho | O que faz | Arquivo |
|---|---|---|
| E-mail automático na transição para SCHEDULED (aviso de inspeção) | Faz o mint do token **sem ciclo** | `notification/application/handlers/notify-on-status-transition.handler.ts:351-353` |
| Aviso de reagendamento pelo admin | Faz o mint do token **sem ciclo** | `notification/application/handlers/notify-on-admin-reschedule.handler.ts:86` |
| Inquilino confirma no portal | `cycleService.confirm` → sem ciclo lança `ConfirmationCycleNotFoundError` → grava só o campo CONFIRMED | `rental-tenant-portal/application/use-cases/confirm-appointment.use-case.ts:189-199` |
| Operador força a confirmação | Igual, e o `catch {}` vazio engole **qualquer** erro | `appointment/application/use-cases/force-manual-confirmation.use-case.ts:58-70` |
| Inquilino entra em outro horário do grupo | `updateMany ... rental_tenant_confirmation_status: 'CONFIRMED'`; `confirm` sem ciclo cai no mesmo fallback | `service-group/infrastructure/prisma-service-group.repository.ts:1519`, `join-group.use-case.ts:331-350` |
| Informa que não pode comparecer | O mesmo fallback, com UNAVAILABLE | `report-unavailability.use-case.ts:218-227` |

### O caso do reteste

No INS-0118 e no INS-0119 a confirmação foi forçada pelo OP em agendamentos que nunca tinham tido um link gerado à mão, portanto sem ciclo. O `Generate and copy` (`notify:false`) caiu em `createInitial` sem ciclo → PENDING.

A conclusão sai do código por eliminação, porque `createInitial` só grava PENDING quando não há ciclo ativo. Não consultei o banco de DEV. Os outros agendamentos do grupo ficaram CONFIRMED porque ninguém gerou link para eles.

---

## (b) Desenhado ou efeito colateral?

**É efeito colateral.** A spec previa outra coisa:

- `docs/superpowers/specs/2026-05-26-tenant-confirmation-cycles-design.md` (spec 028):
  - **§4.2 (`:104-105`):** "Transition `→ SCHEDULED`: call `ConfirmationCycleService.createInitial()`". Isso **nunca foi implementado**: `git log -S createInitial` em `execute-status-transition.use-case.ts` e em `notification/` não retorna nada.
  - **§6 (`:214-215`):** na geração de link, "call `createInitial()` if no active PENDING cycle exists". A intenção era abrir o ciclo quando ainda não há confirmação, não apagar uma confirmação existente.
  - **§"Fora de escopo" (`:264`):** "historical data stays as-is; cycles start from the first transition post-deploy". A spec contava com que todo agendamento novo tivesse ciclo desde o SCHEDULED, e tratou "CONFIRMED sem ciclo" como resíduo de antes da feature. Os fallbacks no código têm esse mesmo comentário ("pre-feature appointment").
- Como o gancho no SCHEDULED nunca entrou, o "resíduo pré-feature" virou o estado normal de toda confirmação feita pelo link automático ou forçada antes de um link manual.

Há uma parte **desenhada de propósito**, mas com uma premissa que caducou: a regra 3 do "Send portal link" do grupo (`appointment/domain/portal-link-eligibility.ts:20-25`, `:71-78`, commit `9ba1fc34`, 30/06, marcada "user-locked").
- **O que a regra faz:** trata como velho um CONFIRMED sem ciclo, ou com ciclo de outra data (`SEND_AFTER_RESET`), e zera e reenvia.
- **Justificativa escrita:** "an operator can edit an AWAITING_INSPECTOR appointment's date without resetting confirmation".
- **Por que a premissa caiu para edições individuais:** três dias depois, `3ecd8f9f` (03/07) passou a zerar o status quando a data muda sem ciclo (`update-appointment.use-case.ts:344-352`).
- **Onde a regra ainda faz sentido:** mover a data de um grupo com a estratégia RESEND depende dela para zerar membros sem ciclo (`change-group-schedule.use-case.ts:207-226`). Por isso **não proponho mexer nessa regra** (ver (g)).

Não achei decisão de produto que diga "gerar ou copiar o link reabre a confirmação". O texto da tela diz o contrário: o diálogo do Generate and copy fala só em "will NOT be sent to the tenant" (`AppointmentDetailPage.tsx:562`).

---

## (c) Desde quando, e se está em produção

| Peça | Commit | Data | Em `origin/main`? |
|---|---|---|---|
| Ciclos, `createInitial` na geração de link e fallback "denorm only" no force-confirm (`catch {}`) | `d85442ec` (#30) | 26/05/2026 | sim |
| Send portal link do grupo com `SEND_AFTER_RESET` para CONFIRMED sem ciclo | `9ba1fc34` | 30/06/2026 | sim |
| Botão "Generate and copy" (`notify:false`) | `268df336` | 16/07/2026 | sim |
| Fallback do portal restrito a `ConfirmationCycleNotFoundError` | `7c5a4a49` | 12/09/2026 | sim |
| Gancho `createInitial` no SCHEDULED (spec 028 §4.2) | — | nunca implementado | — |

**Está em produção hoje**, com o mesmo código de DEV. O caminho pelo Send Portal Link existe desde 26/05; o `notify:false` só acrescentou mais um botão que leva a ele.

Não sei quantos casos já aconteceram em produção, porque não acessei o banco. A consulta somente leitura de (e) permite medir.

---

## (d) Ações que disparam

Disparam qualquer chamada que passe por `GeneratePortalTokenUseCase` com o agendamento CONFIRMED sem ciclo:

| Ação | Onde | Desfaz? |
|---|---|---|
| **Send Portal Link** (detalhe do agendamento) | `AppointmentDetailPage.tsx:208` → `POST …/portal-token` (notify padrão = true) | **Sim**, e ainda envia e-mail/SMS pedindo nova confirmação |
| **Copy Portal Link sem token ativo** → diálogo "Generate and copy?" | `AppointmentDetailPage.tsx:388-393` abre o diálogo; `:285-291` faz `POST` com `notify:false` | **Sim** (o caso do O-11) |
| **Copy Portal Link com token ativo** | `GET …/portal-link` (`get-portal-link.use-case.ts:55-75`); só decifra o token existente | Não |
| **Reenvio em massa** (mapa/lista, "bulk resend reminder") | `MapBulkActionModal.tsx` → `bulk-resend-reminder.use-case.ts:58` | **Sim**, para cada selecionado nessa condição, e envia |
| **Send portal link do grupo** | `send-group-portal-links.use-case.ts:195-221` + `portal-link-eligibility.ts:71-78` | **Sim**, pela regra 3: `rotateOnDateChange` → PENDING, e envia. Esse caminho pelo menos fica registrado como `rotated` |
| **Mudar a data do grupo com estratégia RESEND** | `change-group-schedule.use-case.ts:216-226` → Send portal link do grupo | Sim, mas aqui é o desejado, porque a data mudou |
| Lembretes automáticos de 7/5/3 dias | `dispatch-reminders.use-case.ts:39` (pula CONFIRMED e UNAVAILABLE) | Não; os lembretes não fazem mint nem mexem em ciclo |
| Aviso automático na transição para SCHEDULED e no reagendamento pelo admin | Mint sem ciclo | Não desfazem, mas são eles que **criam** o estado vulnerável quando o inquilino confirma pelo link |

---

## (e) Impacto

### Quantos fluxos reais deixam um CONFIRMED vulnerável

Ficam vulneráveis os agendamentos CONFIRMED sem ciclo ativo. Esse estado nasce de quatro fluxos de confirmação que acontecem no dia a dia:
1. O inquilino confirma pelo link do e-mail automático do SCHEDULED, que é o caminho padrão.
2. O inquilino confirma pelo link do aviso de reagendamento.
3. O operador ou a agência forçam a confirmação antes de alguém ter gerado um link à mão.
4. O inquilino escolhe outro horário do grupo no portal.

Só fica protegida a confirmação feita pelo link que um operador gerou com Send Portal Link, Generate and copy ou o envio do grupo, porque esse link criou o ciclo.

Esse estado depois é desfeito por **quatro ações de tela** (d): Send, Generate and copy, reenvio em massa e envio do grupo.

**Para medir em produção** (Pedro, somente leitura):
```sql
SELECT count(*)
FROM appointments
WHERE rental_tenant_confirmation_status = 'CONFIRMED'
  AND active_confirmation_cycle_id IS NULL
  AND status IN ('AWAITING_INSPECTOR', 'SCHEDULED')
  AND deleted_at IS NULL
  AND scheduled_date >= current_date;
```
**Para achar confirmações já desfeitas:** procurar na auditoria um `appointment.force_manual_confirmation` ou uma confirmação pelo portal seguida, para o mesmo agendamento, de `rental_tenant_portal.token_generated` sem nova confirmação depois. O ciclo PENDING criado fica em `appointment_confirmation_cycle.created` com o `entityId` do ciclo; o elo com o agendamento é `appointment_confirmation_cycles.appointment_id`.

### Lembretes

- **O que volta:** com o status em PENDING, os lembretes de 7/5/3 dias voltam a sair para quem já tinha confirmado. `ANSWERED_CONFIRMATION_STATUSES` (`dispatch-reminders.use-case.ts:39`) deixa de pular o agendamento.
- **A escalada ao gestor:** volta junto, porque `dispatch-escalations.use-case.ts:46` só pula CONFIRMED.
- **Send e reenvio em massa:** além disso, mandam na hora uma mensagem de "confirme".

### T-1 (`TENANT_NO_RESPONSE`), o efeito mais grave

1. `findUnconfirmedForDate` pega tudo o que **não** é CONFIRMED para amanhã (`prisma-appointment.repository.ts:875-893`).
2. O job roda às 19:00 no horário da agência (`main/workers.ts:318-324`) e rejeita como `TENANT_NO_RESPONSE`.
3. A rejeição tira o agendamento do grupo e grava NO_RESPONSE (`reject-unconfirmed-appointments.use-case.ts:60-120`).
4. Se o link foi gerado no dia anterior, já depois do corte de confirmação (`isPastConfirmCutoff`, `portal-token-middleware.ts:84`), **o inquilino não consegue reconfirmar**. O portal mostra "The confirmation deadline has passed" (`PortalPage.tsx:283-289`; `InspectionConfirmationForm.tsx:103`). Ele pode apenas dizer que não vai ou trocar de horário.
5. Resultado: a vistoria que o inquilino confirmou é rejeitada à noite, o inspetor perde a parada e a agência recebe o aviso de rejeição. Só uma nova confirmação forçada pelo operador antes das 19:00 evita isso, que foi o que se fez no reteste.

A mensagem de prazo encerrado no O-11 **não vem do O-11**: o INS-0118 é de 25/11 e o reteste foi em 24/11, então o corte já tinha passado. Somada ao PENDING, porém, ela tranca o inquilino.

### Grupo

- O agendamento que volta para PENDING continua no grupo até o T-1. Às 19:00 ele sai, por causa da rejeição.
- O grupo pode ficar menor ou ser fechado (`groupsClosedCount`, `workers.ts:324`), e a rota do inspetor (day plan) muda: `ROUTE_CHANGED`.
- No Send portal link do grupo, todo membro CONFIRMED sem ciclo recebe nova cobrança e volta para PENDING de uma vez. Um operador que só queria mandar o link aos membros que faltam desfaz a confirmação de todos esses membros.

---

## (f) Lacuna de auditoria

Com notify:false, a linha do tempo do agendamento mostra:
- `rental_tenant_portal.token_generated`: `entityType: 'tenant_portal_token'`, `entityId` = id do agendamento (`generate-portal-token.use-case.ts:183-196`);
- `rental_tenant_portal.dispatch_skipped` com `reason: NOTIFY_DISABLED` (`:306-318`).

A mudança de status **é registrada**, mas não aparece:
- `appointment_confirmation_cycle.created` (`confirmation-cycle.service.ts:89-96`) usa `entityType: 'AppointmentConfirmationCycle'` e `entityId` = **id do ciclo**. A linha do tempo busca por `entityId` = id do agendamento (`apps/web/src/features/appointments/hooks/useAppointmentAuditLog.ts:35`), por isso o registro não aparece.
- O registro tem `actorType: 'SYSTEM'`, sem `actorId`, embora quem disparou tenha sido um operador.
- Só traz `after: { status: 'PENDING' }`, **sem `before`**. Não dá para ler que havia um CONFIRMED.
- Nenhuma tela lê `AppointmentConfirmationCycle`; não há uso em `apps/web`.

O mesmo vale para `rotated` no envio do grupo (`:157-164`) e para os `updated` de confirm/markUnavailable (`:383-402`).

**Efeito:** quem olha o agendamento vê "link gerado, nada enviado" e um status que mudou sem explicação. É exatamente o que o reteste registrou.

Lacuna irmã: o `appointment.force_manual_confirmation` grava `before/after` do campo (`force-manual-confirmation.use-case.ts:73-83`), mas o caminho do portal sem ciclo grava o CONFIRMED sem nenhum registro de mudança de status.

---

## (g) Opções de correção

### A. Preservar a confirmação em `createInitial` (mínima)

- **O que muda:** sem ciclo ativo, `createInitial` lê o status atual do agendamento na mesma transação. Se for CONFIRMED, cria o ciclo **já CONFIRMED**, adotando a confirmação existente, e não sobrescreve o campo. Se for PENDING ou NO_RESPONSE, segue como hoje.
- **Arquivos:** `confirmation-cycle.service.ts` e os testes (`confirmation-cycle.service.test.ts`, os dois `generate-portal-token.use-case.test.ts`, `confirmation-cycle.integration.test.ts`). Cerca de 5 arquivos, só backend. Sem migração, sem mudança de contrato, sem tela.
- **Resolve:** Send, Generate and copy e reenvio em massa.
- **Não resolve:** o Send portal link do grupo, que vai por `rotateOnDateChange` pela regra 3, e o fato de o CONFIRMED continuar sem data registrada até alguém gerar um link.
- **Risco:** baixo.
  - O ciclo adotado precisa de uma `confirmationSource`. O enum tem `RENTAL_TENANT_PORTAL | OPERATOR_FORCED | RENTAL_TENANT_RESCHEDULE` e não sabemos a origem real. Pode usar `null`, e `confirmedAt` = agora ou nulo.
  - A coluna aceita nulo (o próprio `createInitial` cria com `null`), mas as leituras de `confirmed_at` precisam ser conferidas (`appointment.repository.ts:122`).

### B. Toda confirmação cria o seu ciclo, mais a A para o legado (recomendada)

- **O que muda:**
  - `confirm()` e `markUnavailable()`, quando não há ciclo ativo, **criam** o ciclo com a data e o horário atuais e o status pedido, em vez de lançar `ConfirmationCycleNotFoundError`.
  - Os fallbacks que gravam só o campo nos quatro chamadores somem ou ficam inalcançáveis: force-confirm, portal confirm, join-group e report-unavailability.
  - O `catch {}` vazio do force-confirm deixa de engolir erros de banco.
  - A (adotar em `createInitial`) cobre os CONFIRMED antigos que já estão sem ciclo.
- **Ganho sobre a A:** toda confirmação nova passa a ter data. Assim a regra 3 do grupo **passa a funcionar como desenhada** sem ser alterada: um CONFIRMED com ciclo da data atual vira `SKIP_ALREADY_CONFIRMED`, e só um CONFIRMED de outra data é zerado. Isso preserva o RESEND da mudança de data do grupo.
- **Tamanho:** de 10 a 14 arquivos, só backend: o serviço, os quatro use cases e testes unitários e de integração (incluindo `send-group-portal-links.integration.test.ts`). Sem migração, sem contrato, sem tela.
- **Risco:** médio-baixo.
  - Muda o contrato interno de `confirm`: quem espera `NotFound` precisa ser revisto.
  - Há concorrência no `@@unique([appointment_id, cycle_number])` entre dois confirms simultâneos. O padrão `retryOnUniqueConflict` já existe para isso.
  - O grupo continua zerando CONFIRMED antigos sem ciclo até que eles ganhem ciclo, seja pela A numa geração de link, seja pelo backfill opcional abaixo.

### C. Auditoria (junto com A ou B)

- **O que muda:** quando um ciclo é criado, adotado ou girado **e o status do agendamento muda**, gravar também um registro no agendamento. Por exemplo `appointment.rental_tenant_confirmation_reset`, com `entityType: 'Appointment'`, `entityId` = agendamento, `before/after` do status, o operador da ação (`actorId`) e a causa (`PORTAL_LINK_GENERATED` ou `GROUP_PORTAL_LINK_RESEND`).
- **Tamanho:** 2 ou 3 arquivos mais testes.
- **Risco:** baixo.
- **Ressalva:** a linha do tempo do web só mostra um rótulo bonito se o `AuditTimeline` souber traduzir a ação nova. Isso é mudança visível de tela e passa pelo gate de design do Pedro. Sem ela, o registro aparece com o rótulo genérico.

### D. Criar o ciclo na transição para SCHEDULED (o que a spec 028 §4.2 pedia)

- **O que muda:** `createInitial` na transição para SCHEDULED e ligação do token do aviso automático ao ciclo.
- **Tamanho:** médio. Mexe em `execute-status-transition.use-case.ts`, nos handlers de notificação, que fazem o mint fora de transação, e nas transições pelo marketplace e pelo grupo.
- **Risco:** médio-alto, porque são muitos caminhos para SCHEDULED e o mint é fire-and-forget.
- **Por que não é a primeira:** a B fecha o buraco pelo lado da confirmação com muito menos superfície. A D fica para o estacionamento.

### E. Backfill dos CONFIRMED sem ciclo (opcional, depois da B)

- **O que é:** um script único (dry-run por padrão, no molde do `regeocode-permanent`) que cria um ciclo CONFIRMED para cada agendamento futuro CONFIRMED sem ciclo.
- **Ganho:** protege também o envio do grupo para os casos antigos.
- **Quem roda:** o Pedro, em staging e produção.
- **Risco:** baixo, mas é uma operação de dados.

### Recomendação

**B + C num PR só de backend**, com E como passo operacional opcional, decidido pelo Pedro depois de rodar a consulta de (e).

Até o PR entrar, o contorno operacional é este:
- em agendamento confirmado, usar **Copy Portal Link** só quando há token ativo;
- não usar Send, Generate and copy ou o reenvio em massa sem antes conferir o status;
- se a confirmação cair, forçá-la de novo antes das 19:00 do dia anterior.

### Decisões para o Pedro

1. **Corrigir agora ou estacionar?** Recomendo corrigir antes da próxima promoção. O risco de rejeição T-1 de vistoria confirmada já existe em produção.
2. **UNAVAILABLE:** gerar um link novo para quem disse "não posso" deve continuar zerando para PENDING (pedir de novo) ou também preservar? Recomendo zerar, como hoje. Mandar um link novo a quem recusou é pedir nova resposta, e o lembrete continua suspenso só enquanto o status é UNAVAILABLE.
3. **Origem do ciclo adotado** (A/E): `confirmationSource` nulo, ou um valor novo `LEGACY` no enum? Um valor novo mexe no shared e exige regenerar api-types só se o enum aparecer em alguma resposta. Recomendo nulo.
4. **Texto na linha do tempo para o registro novo de C:** entra no gate de design. Recomendo "Tenant confirmation reset to Pending (portal link generated)".
5. **Rodar o backfill E** em staging e produção depois da B? A decisão depende da contagem da consulta de (e).
