# F03 · Eventos de campo

| | |
|---|---|
| **Contrato** | 00.7, 00.8, 03.1, 03.2, 03.3 (o evento), 03.16 (critérios 00.A3, 03.A2) |
| **Esforço** | **11,0 dias** · dificuldade **M** (inclui máscara de coordenadas na auditoria para CL e o tratamento da execução abandonada) |
| **Status** | Decisões fechadas em 2026-10-27. Pronto para spec. |
| **Depende de** | F02 (lembrete e alerta via push/SMS) |
| **Bloqueia** | F04 (ações no card), F05, F07, F09 |
| **Decisões** | Q1 ✅ (diferente da recomendação), Q10 ✅, Q11 ✅, Q2 (só redação do contrato) |

## Objetivo

Fazer o inspetor registrar o que acontece **na hora** e a operação **ver** isso:

- check-in e check-out direto da agenda;
- "Não consigo fazer" com motivo;
- "Vou atrasar";
- geofence configurável com sinalização;
- lembrete de conclusão não registrada.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| "Não consigo fazer" (Q1) | **Libera automaticamente.** O appointment vai para **REJECTED** com o motivo do inspetor. Desde o #1293, rejeitar já desvincula o grupo e libera o inspetor. A OP é alertada (e-mail + painel) e a agência recebe o e-mail de rejeição que já existe (`INSPECTION_REJECTED_AGENCY`). Um **alerta com o motivo** aparece no detalhe do appointment e no modal do appointment no mapa, **só quando existe**. |
| Geofence (Q10) | Padrão **SINALIZAR**. BLOQUEAR fica como opção, com queda automática para SINALIZAR. |
| Alerta para a OP | **E-mail para OP/AM** (padrão do alerta de inspeção travada) + item em "Needs attention" no Dia ao Vivo (F05). |
| Nota do inspetor | **Visível para a agência** (detalhe e e-mail de rejeição). O app avisa: "This note is shared with the agency." (2026-10-28) |
| Privacidade da auditoria | As auditorias novas guardam só distância, precisão e flags, **sem lat/lng**. As coordenadas das auditorias antigas ficam mascaradas para os perfis CL. |
| Toques (Q11) | **2 toques**: check-in e check-out. O fechamento é o DONE, que já acontece no check-out. |
| Referência do "Vou atrasar N min" (D23, L-F03-04; dev, 2026-10-29) | Os minutos contam a partir da **ETA publicada** da parada (`published_service_start_at`) quando existe plano publicado; senão, do **início da janela**. `estimatedArrivalAt = max(reference, effectiveNoticeAt) + minutesLate`, calculado no servidor. A F06 (D18) usa o mesmo valor como piso; a regra de aviso antecipado da F07 (P4) não muda. |
| Plausibilidade do horário do cliente (D25; dev, 2026-10-29) | Horário do cliente aceito de **−7 dias a +5 min** do horário do servidor; fora disso vale o `created_at`. É a regra única para F05/F06/F07. |

## Estado atual (verificado @042a9674)

- **Execução:** `InspectionExecution` guarda início, fim, lat/lng de início e fim e `geolocation_distance_meters` (`schema.prisma:1181-1202`). Não tem precisão nem `tenant_id`, e é 1 por appointment.
- **Rotas:** `POST /v1/inspector/appointments/:id/start` (`inspector-execution.routes.ts:149`) e `/finish` (`:175`), com Idempotency-Key obrigatório. O body é só `{latitude, longitude}`.
- **Validações e distância:**
  - Ordem das validações em `start-inspection.use-case.ts`: INSP → idempotência → SCHEDULED + atribuição → T-1 → confirmação do inquilino → trava do dia.
  - A trava do dia só abre na meia-noite do dia agendado; **não há janela de horário**.
  - A distância só é calculada no **início**, com 500 m fixos (`geolocation-distance.service.ts:26`) e apenas auditoria. O PWA usa outro limite: **200 m** (`GeoLocationCapture.tsx:12`).
- **Precisão e fila offline:** o PWA captura `accuracy` (`useGeolocation.ts:38`) e não envia. A fila offline (`useOfflineQueue.ts`) só conhece START/FINISH, em cadeia.
- **Onde ficam os botões:** check-in/out só existem no detalhe (`StartInspectionButton` → `AppointmentDetailPage.tsx:17`). O `AppointmentCard.tsx:54` só navega.
- **Transições do inspetor:** o INSP só pode fazer `SCHEDULED → DONE`. Já `SCHEDULED → REJECTED` aceita **AM/OP/SYS** com motivo obrigatório (`appointment-state-machine.ts`). O ator SYS é o mesmo usado pelo T-1 (`TENANT_DECLINED`/`TENANT_NO_RESPONSE`), então a rejeição disparada pelo inspetor roda como SYS **sem mexer nos 5 lugares de RBAC de transição**.
- **Motivo de rejeição:** `rejection_reason_code` é `VarChar(50)` (`schema.prisma:573`); o enum do shared (`reason-codes.ts`) já tem `PROPERTY_INACCESSIBLE`, `SAFETY_CONCERN` e `OTHER`. Rejeitar avisa **só a agência** (`notify-on-status-transition.handler.ts:207-252`), sem perna para o inquilino. Não existe nada parecido com cancelar, liberar, "não consigo entrar" ou atrasar.
- **O que a OP já tem para tirar o inspetor de um serviço:** rejeitar ou cancelar o appointment individual. Desde o #1293 isso já desvincula o grupo e libera o inspetor. Depois, `REJECTED → AWAITING_INSPECTOR` serve para reofertar.
- **Web:** mostra a execução só no `AuditTimeline` (sem rótulo para `inspection.geolocation_mismatch`).
- **Worker de travados:** `notify-stuck.worker.ts` (job com o nome enganoso `inspection-execution.notify-not-started`) avisa só OP/AM, depois de 6 h iniciado e não finalizado. Para um SCHEDULED com a data já passada e nunca iniciado, não há nada.

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| B6 | Criar `PlatformSetting(key unique, value_json, updated_by, updated_at)` com leitura/escrita AM/OP auditada (`platform_setting.updated`) e um cache curto. É usado por F03 a F10. Tela: uma página simples "Platform settings" no web com seções que cada feature acrescenta. | B | 0,5 | – |
| 03.1 | Enviar `accuracy` e `clientOccurredAt` no start/finish (schemas opcionais, compatíveis com a fila offline). Colunas `start_accuracy_m`, `finish_accuracy_m`, `start_client_at`, `finish_client_at`. Calcular a distância também no **finish**. Sem 3º evento (Q11). | B | 1,0 | – |
| 03.2 | O raio e o modo (SINALIZAR/BLOQUEAR) vêm do `PlatformSetting` e são servidos ao PWA no detalhe do appointment, acabando com o 200 × 500. Flags `out_of_radius` e `out_of_window` na execução. BLOQUEAR cai para SINALIZAR sem coordenadas ou com precisão maior que o raio. Fora da janela nunca notifica o inquilino (Q10). | M | 2,0 | B6 |
| 00.7a | Botões **Check in / Check out** no card da agenda, reusando os hooks existentes (`useStartInspection`, `useFinishInspection`, geo e fila offline). O card abre o detalhe só para o resto. | B | 1,0 | – |
| 00.7b | **"Não consigo fazer"**: folha com motivos (enum `FieldIssueReason`: `NO_ANSWER`, `KEY_FAILED`, `TENANT_REFUSED`, `UNSAFE`, `SITE_ISSUE`, `CANT_ATTEND`) + nota opcional (obrigatória para `SITE_ISSUE`). Em **uma transação**: grava o `InspectorFieldEvent(type=CANT_DO)` e executa `SCHEDULED → REJECTED` pelo `ExecuteStatusTransitionUseCase` como **SYS**, com o inspetor como iniciador na auditoria. Usa um código novo `INSPECTOR_UNABLE` em `RejectionReasonCode` (shared + teste) e `rejection_reason` = rótulo do motivo + nota. Os efeitos que já existem rodam sozinhos: desvincula o grupo, libera o inspetor e manda e-mail à agência. Depois, e-mail a OP/AM (template de plataforma novo `INSPECTOR_UNABLE_ALERT`, no padrão do `INSPECTION_STUCK_ALERT`). Confirmação no app: "Sent to operations. This job has been removed from your route." O plano do dia (F04) fica STALE. | M | 2,25 |
| 00.7c | **Alerta do motivo no web**, mostrado só quando existe: card "Inspector couldn't complete" (motivo, nota, inspetor, data/hora) no detalhe do appointment e no `AppointmentMapDetailPanel` (modal do mapa). Fonte: o último evento `CANT_DO` do appointment. A API expõe `inspectorIssue: {reason, note, inspectorName, occurredAt} \| null` no detalhe e no item da lista/mapa (left join no último evento, sem N+1). O card continua visível depois que a OP reoferta o serviço, como histórico do último impedimento. | B | 0,75 |
| 00.8 / 03.3 | **"Vou atrasar"**: motivo (enum curto: trânsito, serviço anterior demorou, pessoal, outro) + minutos estimados. Grava `InspectorFieldEvent(type=LATE_NOTICE)`. Alimenta F05 (exceção), F06 (aviso ao inquilino) e F07 (o índice premia o aviso antecipado). | B | 1,0 | 00.7b (mesma tabela e folha) |
| 00.A3 | No web: bloco "Execution" no detalhe do appointment (início/fim, distância, precisão, flags, eventos de campo) + rótulos novos no `AuditTimeline` (incluindo `geolocation_mismatch`). | B | 1,0 | 03.1, 00.7b |
| 03.16 | Lembrete ao **inspetor**: SCHEDULED, hoje, sem finish depois de (fim da janela + X min) → push crítico/SMS via F02, 1 vez por appointment. O alerta de 6 h para a OP continua como está. | B | 1,0 | F02 |

`InspectorFieldEvent(appointment_id, inspector_id, tenant_id, type, reason_code, note, minutes, lat, lng, accuracy_m, client_occurred_at, created_at)` leva o `tenant_id` do appointment, para escopo e relatórios. Eventos novos exigem conexão e **não** entram na fila offline (Q2).

## Fora do escopo

- Novo estado ou nova regra de RBAC na máquina de estados (usa a transição SYS que já existe).
- Aviso ao inquilino quando o inspetor não consegue (a rejeição já avisa só a agência).
- Desatribuição self-service.
- Foto de entrada ou interfone (design v3).
- Registro de "ligou para o inquilino".
- Novo estado na máquina de estados.
- Rastreamento contínuo de localização.

## RBAC

| Ação | Quem pode |
|---|---|
| Registrar eventos | INSP (só nos próprios appointments SCHEDULED) |
| Ver eventos e bloco de execução | AM/OP, e CL do próprio tenant (o bloco no detalhe, sem a geo crua do inspetor: só a distância e as flags) |
| Configurar geofence | AM/OP |

## Critérios de aceite → como provar

- **00.A3:** check-in, check-out e "Não consigo fazer" gravam data, hora e inspetor, e aparecem no detalhe web. O "cancelamento" do contrato vira "Não consigo fazer" → REJECTED com motivo. Provar com teste de integração: o evento cria a transição, desvincula o grupo, libera o inspetor e expõe o `inspectorIssue`.
- **03.A2:** com SINALIZAR, um check-in fora do raio grava a flag e aparece na exceção. Com BLOQUEAR, é recusado com uma mensagem clara (testes de unidade para os dois modos e para a queda automática).

## Riscos e armadilhas

- Campos novos no start/finish precisam ser **opcionais**: itens antigos na fila offline continuam válidos.
- A cadeia da fila assume START → FINISH. Não colocar tipos novos nela.
- Detalhe web para CL: não expor lat/lng do inspetor (privacidade).
- Os caminhos em massa (reassign/reject de grupo) não disparam subscribers de `STATUS_TRANSITION`.
- **A rejeição pelo inspetor precisa ser idempotente** (Idempotency-Key) e validar que o appointment ainda está SCHEDULED e atribuído a ele. Dois toques ou um item da fila não podem rejeitar duas vezes.
- **Rejeição depois do check-in** (ex.: problema no local) também é permitida. A execução fica aberta sem finish, e a spec define se ela é fechada ou mantida como registro (recomendado: manter e marcar `abandoned_at`).
- O código novo `INSPECTOR_UNABLE` precisa entrar nos filtros e rótulos de motivo do web (lista, exportação, board).

## Quebra em PRs

1. `PlatformSetting` + precisão/distância + geofence (backend + shared).
2. Eventos de campo + alerta OP + lembrete (backend).
3. PWA (botões no card, folhas "Não consigo fazer" e "Vou atrasar", envio de precisão).
4. Web (bloco de execução, timeline, configurações).
