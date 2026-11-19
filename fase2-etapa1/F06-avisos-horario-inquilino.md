# F06 · Avisos de horário ao inquilino

| | |
|---|---|
| **Contrato** | 01.10, 01.12, 01.12-B (= 01.15 após Q4) (critérios 01.A5 parcial, 01.A7) |
| **Esforço** | **7,25 dias** · dificuldade **M** (inclui flag `created` no CreateNotification, reserva de 20% do SMS, gatilho por CANT_DO e matriz de testes) |
| **Depende de** | F04 (plano e horários previstos), F03 (aviso de atraso) |
| **Bloqueia** | – |
| **Status** | Decisões fechadas em 2026-10-27. Pronto para spec. |
| **Decisões** | Q3 ✅, Q21 ✅; Q4 (só renumeração no contrato) |

## Objetivo

Manter o inquilino informado sem rastrear o inspetor. Um único módulo de previsão alimenta três gatilhos:

- **Matinal:** "sua inspeção hoje, previsão hh:mm–hh:mm".
- **A caminho:** quando a parada anterior termina.
- **Atraso:** quando o horário projetado estoura a janela.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Canal (Q21) | **SMS + e-mail sempre**: cada gatilho envia pelos dois canais disponíveis. Sem telefone, só e-mail; sem e-mail, só SMS. O consentimento é checado por canal, e o switch da agência vale para os dois. |
| Aviso matinal | **07:00 locais** (configurável na plataforma), **enviado só até 09:00**. Se o job atrasar, o aviso não é enviado. |
| Formato da previsão | **Faixa de ±30 min** recortada pela janela acordada ("between 10:15 and 11:15"). **Exceção:** o aviso de atraso **não** é recortado no fim da janela, porque o objetivo dele é justamente informar que vai passar dela. Se o job das 07:00 for perdido depois das 09:00, o aviso matinal não é reenviado. (2026-10-28) |
| Atraso | **1 aviso de atraso por parada por dia.** O "a caminho" continua chegando quando a parada anterior termina. |
| Teto de SMS | Os SMS de horário param quando a agência atinge **80% do teto diário**; os 20% restantes ficam para os avisos obrigatórios. O e-mail continua. (2026-10-28) |
| "A caminho" depois de "Não consigo fazer" | **Também dispara** quando a parada anterior termina por CANT_DO. (2026-10-28) |
| Módulo de previsão | Existe um único `projectStopEta` (shared, puro, partida ≥ agora), que a F05 também usa. |
| Ordem usada | A ordem **salva** do plano, inclusive a reordenada manualmente (decisão F04). |

## Estado atual (verificado @042a9674)

- **Subscriber de DONE:** o único que existe é `invite-survey-on-done.subscriber.ts`, sobre `STATUS_TRANSITION`.
- **Template novo de inquilino:** são **6 registros** em `packages/shared/src/constants/notification-templates.ts`:
  - `MANDATORY_TEMPLATE_CODES` ou `PLATFORM_ONLY`;
  - `TEMPLATE_CODE_LABELS`;
  - `TEMPLATE_TARGETS`;
  - `DEFAULT_TEMPLATE_CLASSIFICATIONS`;
  - `TEMPLATE_VARIABLES`;
  - `ALLOWED_VARIABLES`/`SAMPLE_DATA` se houver variável nova.

  Além disso: o corpo em `platform-notification-templates.ts` (hash automático) e, se houver variável nova, `build-notification-payload.service.ts`.
- **Switch da agência e consentimento:** `rentalTenantNotificationsEnabled` e `NotificationConsent` são aplicados automaticamente no `send-notification.use-case.ts`.
- **Dedupe:** a tabela `notifications` não tem coluna de dedupe. O padrão é `count({appointmentId, templateCode, fromDate})`, como no stuck worker.
- **Tick por agência:** `TenantCronTick.runDue(job, hora, …)` usa `>=` na hora, então depois de uma queda ele **dispara atrasado**. Um aviso matinal precisa de hora-limite.
- **SMS:** limite de 1530/670 caracteres e `prepareSmsBody`. Os SMS atuais têm de 100 a 150 caracteres.

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| Previsão | Serviço de domínio `projectStopEta(plan, events, now)`: horário previsto de cada parada restante a partir do último evento real (finish/start) + deslocamento do plano + duração. Puro e testável. | M | 1,5 | F04 |
| 01.12-B | Job `tenant-eta.morning` (tick às 07:00 local, **só envia até 09:00**): para cada parada do plano publicado de hoje, envia "previsão hh:mm–hh:mm" (faixa de ±30 min, limitada à janela). | B | 1,0 | Previsão |
| 01.10 | Subscriber do finish (DONE) → próxima parada do plano daquele inspetor → "o inspetor está a caminho, previsão hh:mm". Não dispara se a próxima já começou ou foi cancelada. | B | 1,0 | Previsão |
| 01.12 | Atraso projetado: recalcula no finish, no aviso de atraso (F03) e numa varredura a cada 30 min dos dias com plano. Se a previsão passar do fim da janela + limite, envia "atraso, nova previsão hh:mm". **1 aviso por parada por dia** (dedupe por `count` desde a meia-noite local). | M | 1,5 | Previsão, F03 |
| Templates | 3 códigos (`TENANT_ETA_MORNING`, `TENANT_ETA_ON_THE_WAY`, `TENANT_ETA_DELAY`) × SMS + e-mail, os dois enviados em cada gatilho. Variáveis novas: `etaFrom`, `etaTo`. Público = inquilino (rental tenant), então o switch da agência e o consentimento se aplicam automaticamente. | B | 1,0 | – |

## Fora do escopo

- Botão manual "avisar inquilino" (design v3).
- Rastreamento GPS.
- Reagendar pelo aviso (o link do portal existente já atende).
- Avisos à agência.
- Previsão com trânsito.

## Critérios de aceite → como provar

- **01.A7:** quando o atraso projetado passa do limite, o próximo inquilino recebe o aviso, só uma vez. Provar com teste do serviço de previsão + teste do dedupe.
- **01.A5 (parte inquilino):** o limite configurado governa o disparo.

## Riscos e armadilhas

- Não deduplicar por família de template (o sufixo `_SMS` causa supressão cruzada; ver comentários do handler).
- Flow types com supressão (Ingoing/Outgoing etc.): respeitar `isSuppressedByFlowType`.
- Custo: até 3 SMS + 3 e-mails por inspeção. Medir na homologação (§7). Se pesar, a alavanca é trocar o canal para "SMS, senão e-mail" (só configuração).
- Janela fixa: se o aviso matinal disser 10:00–11:00 e a janela for 08:00–14:00, não mostrar a janela inteira de novo. Mostrar só a faixa prevista.

## Quebra em PRs

1. Shared (templates + variáveis) + serviço de previsão.
2. Gatilhos (job matinal, subscriber, varredura).
