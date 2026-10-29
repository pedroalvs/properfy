# F08 · Metas e recompensas (programa do inspetor)

| | |
|---|---|
| **Contrato** | 03.6, 03.7, 03.8, 03.9, 03.10, 03.13, 03.14, 03.15, 03.17 (critérios 03.A3, 03.A4, 03.A5) |
| **Esforço** | **14,0 dias** · dificuldade **A** (quebra em tarefas: 16,125 = 14,0 + 2,0 das lacunas L-F08-01…14 + 0,125 da reconciliação, 2026-10-29; ver `tarefas/F08-tarefas.md`) |
| **Depende de** | F07 (índice e níveis), F02 (mensagens automáticas), X01 (itens de menu) |
| **Bloqueia** | – |
| **Status** | Decisões fechadas em 2026-10-27, **com 1 alerta aberto** (Q12, aguardando o cliente). Pronto para spec, assumindo Q12 = fora do financeiro. |
| **Decisões** | Q12 ⚠️ assumida, aguardando o cliente · Q13 ✅ · Q18 ✅ |

## Objetivo

Incentivar o inspetor a registrar os eventos na hora. A operação cadastra **metas**: volume, região, tipo de serviço ou índice. Uma meta atingida gera uma **recompensa**, que é aprovada pela operação. O inspetor vê os desafios, o próprio resultado, o nível e um ranking anônimo.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Bônus em dinheiro (Q12) | ⚠️ **ALERTA: o dev vai confirmar com o cliente.** A spec assume **fora do financeiro**: o prêmio é aprovado pela OP, pago por fora e marcado como pago. **Se o cliente pedir lançamento no financeiro ou na fatura:** +3 a 4 dias, um novo tipo de lançamento `INSPECTOR_BONUS`, ajuste nos 3 leitores do billing (`prisma-financial-entry.repository.ts:126,393,437`), uma linha de fatura sem `appointment_id` e os filtros de visibilidade das agências. Isso entra como pedido de mudança (§9). |
| Prioridade de oferta (Q13) | **Acesso antecipado por nível**, com H horas e nível mínimo X na configuração da plataforma. **Só o nível dá prioridade; as metas pagam só em dinheiro** (2026-10-28). **Nasce desligado**: o AM liga depois do onboarding. Mesmo ligado, a janela só se aplica se houver pelo menos um inspetor qualificado e elegível para o grupo, e nunca a grupos de hoje ou D+1. |
| Aprovação de prêmio | **Qualquer AM/OP aprova** um prêmio gerado pelo sistema, inclusive quem criou a meta (2026-10-28). |
| Ranking no app (privacidade) | O desempate usa um hash estável por período. Com coorte menor que 5, o app mostra só a posição e a nota do próprio inspetor. |
| Níveis | **3 níveis por faixa do índice** (ex.: Bronze < 60, Silver 60–84, Gold ≥ 85, configuráveis), seguindo o índice atual (janela móvel de 30 dias do F07). A sequência conta os períodos seguidos com pelo menos uma meta atingida. |
| Métricas de meta | **Todas as do índice + volume.** A OP escolhe: volume (geral, por região ou por tipo de serviço), índice ≥ X, ou **qualquer métrica do índice ≥ X% no período da meta** (pontualidade, geofence, conclusão sem travar, satisfação, avisos de atraso antecipados, e "não consigo fazer" ≤ X%). O cálculo reusa o `computeMetric` da F07 sobre o período da meta. |
| Ranking no app | **Posição + pontuações dos outros**, sem nome, foto nem id. |
| Agências (Q18) | Não veem nada do programa. |
| Acesso | Item **"Goals & rewards" no grupo Dashboard** do menu (X01). |

## Decisões das lacunas (2026-10-29)

O dev aceitou todas as recomendações de `tarefas/lacunas/F08-lacunas.md` (lote 2). O detalhe de cada regra está em `tarefas/F08-tarefas.md`.

| Regra | Decisão |
|---|---|
| DL1 (L-F08-01) | O job das 04:45 só calcula. As 3 mensagens saem às **08:00 Sydney**, na mesma fila `inspector-program.daily` (run `MESSAGES` enfileirado com `startAfter`; nunca um segundo `boss.schedule` com o mesmo nome). Prêmios do mesmo inspetor e fim de período viram **um** aviso. |
| DL2 (L-F08-02) | Reativar uma meta pula os períodos inativos (`SKIPPED_INACTIVE`, sem prêmio); `endsAt` ≥ fim do período corrente; alvo e bônus editados valem a partir do **próximo** período. |
| DL3 (L-F08-03) | `PAID → VOID` só por AM, com motivo e nota de recuperação opcional; `paid_at` fica. Não existe `PAID → APPROVED`. |
| DL4 (L-F08-04) | Metas independentes e cumulativas; sem teto por inspetor nem orçamento por período; o formulário avisa sobre metas do mesmo ciclo. |
| DL5 (L-F08-05) | Motivo de anulação é interno; o inspetor vê só uma nota opcional (≤ 200). |
| DL6 (L-F08-06) | A mensagem de mudança de nível não sai se houve outra nos últimos 7 dias; nível e acesso antecipado seguem sem histerese. |
| DL7 (L-F08-07) | Coorte do ranking = plataforma inteira (todos os ACTIVE com score); nunca por região. |
| DL8 (L-F08-08) | O acesso antecipado só vale para grupos publicados depois de ligar (`enabledAt`, gravado pelo servidor); aumentar H retroage; o 403 diz dia e hora. |
| DL9 (L-F08-09) | Challenges é um tile logo depois de Earnings no hub More. |
| DL10 (L-F08-10) | Rota de períodos com `direction: 'upcoming' \| 'past'`. |
| DL11 (L-F08-11) | `paidOn` é data civil de Sydney (nunca futura nem antes da aprovação); o web calcula "hoje" em Sydney. |
| DL12 (L-F08-12) | Active ganha "Starting soon" (próximos 7 dias) e "Counts jobs since {início}"; sem mensagem de meta nova. |
| DL13 (L-F08-13) | Fotografia do escopo (`scope_label`) em prêmios e fechamentos; escopo apagado vira "a deleted region". |
| DL14 (L-F08-14) | O app diz que o bônus é pago à parte da fatura e não aparece em Earnings (muda só se Q12 mudar). |

Custo: **+2,0 dias** sobre o plano (pedido de ajuste da quebra).

## Estado atual (verificado @042a9674)

- **Programa:** não existe nenhum modelo de meta, desafio, prêmio, badge, sequência ou nível.
- **Bônus via financeiro:** o `MANUAL_ADJUSTMENT` exige `tenantId`. Ajustes **nunca** chegam à fatura nem aos ganhos do inspetor (os 3 leitores filtram `INSPECTOR_PAYOUT`: `prisma-financial-entry.repository.ts:126,393,437`). Por isso o bônus fica fora do ledger (Q12).
- **Aprovação:** a aprovação maker-checker com CAS (`approve-financial-entry.use-case.ts:76-95`) é o padrão a copiar para aprovar prêmios.
- **Ofertas:** ordenadas por `scheduled_date` para todos (`prisma-service-group.repository.ts:721,999`), e o aceite é por ordem de chegada (`acceptOptimistic` `:602`). O `priorityOfferHours` está morto. O #1299 não mudou a consulta.
- **Períodos:** `getCanonicalPeriod` (`billing-period.service.ts:70`) dá semanas de segunda a domingo e quinzenas ancoradas.
- **Relatórios:** adicionar um `ReportType` mexe em **10 lugares**: enum Prisma + migration, `enums/misc.ts`, `MAX_DATE_RANGE_MONTHS`, `REPORT_COLUMNS`, `AGENCY_REPORT_TYPES`, o switch do `process-report-job`, a interface do data reader + implementação, `REPORT_TYPE_MAP` no web, o token CSS e a regeneração de `api-types` + seed.
- **Modelo de tela no PWA:** a feature `earnings` (rota com `requireLinkedInspector`).

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| 03.6 / 03.7 / 03.8 | Modelo `Goal(id, title, metric VOLUME\|REGION_VOLUME\|SERVICE_TYPE_VOLUME\|INDEX_AT_LEAST\|PUNCTUALITY\|GEOFENCE\|NO_STUCK\|SATISFACTION\|LATE_NOTICE\|CANT_DO_MAX, comparator ≥/≤, target, period WEEKLY\|FORTNIGHTLY\|MONTHLY, scope_region_id?, scope_service_type_id?, scope_inspector_id?, reward_type CASH\|OFFER_PRIORITY, reward_amount?, starts_at, ends_at, active)`. As regras (03.8) são campos fixos: participam os inspetores ativos no escopo; contam os DONE do período (data = `finished_at` no fuso da agência); o fechamento é no fim do período; o desempate é pelo índice e depois por quem atingiu primeiro. CRUD no web (AM/OP), com auditoria de criação, edição e desativação (03.A5). | M | 3,0 | – |
| 03.9 + apuração | Job no fechamento de cada período: calcula o progresso via `computeMetric` da F07 (as métricas de taxa respeitam o volume mínimo de 10 no período; abaixo disso a meta não é atingida) e cria um `RewardAward(goal_id, inspector_id, period, amount, status PENDING\|APPROVED\|PAID\|VOID)` (unique `(goal, inspector, period)`, idempotente). Os **níveis** são faixas do índice do F07 (3 níveis no `PlatformSetting`). A **sequência** é o número de períodos consecutivos com pelo menos uma meta atingida. Ambos são derivados, sem tabela. O progresso parcial é calculado sob demanda para a tela do inspetor. | A | 4,0 | F07 |
| 03.13 | Web "Rewards" (AM/OP): por período, **prometido** (soma dos prêmios em dinheiro possíveis das metas ativas) × **atingido** (prêmios gerados). Ações: aprovar (sem autoaprovação), marcar pago e anular. Pagamento manual, fora da plataforma (Q12). | M | 1,5 | apuração |
| 03.7 prioridade | **Acesso antecipado** (Q13): um grupo publicado há menos de H horas só aparece e só pode ser aceito por inspetores de nível ≥ X. Filtro em `findEligibleGroupIds` (`published_at + H > now()` → exige nível) + a mesma checagem no `accept-offer`. H e X ficam no `PlatformSetting`. | M | 1,5 | 03.9 |
| 03.10 / 03.15 | PWA **"Challenges"** em "More" (design v3), com 3 abas: **Active** (metas com progresso, prêmio e prazo), **My results** (índice, nível, sequência e histórico de prêmios com status) e **Ranking** (posição própria + pontuações dos outros **sem nome nem id**, 03.A3). Um endpoint `GET /v1/inspector/program`. | M | 2,5 | apuração, F07 |
| 03.17 | Mensagens automáticas do sistema na caixa de avisos (F02, não críticas) em 3 gatilhos: meta atingida, subiu/desceu de nível e sequência em risco (último dia do período sem meta). | B | 0,5 | F02 |
| 03.14 | Exportação: um `ReportType` `INSPECTOR_PROGRAM` (metas, prêmios, snapshots do índice) no fluxo de relatórios existente, só AM/OP (fora de `AGENCY_REPORT_TYPES`). A auditoria já vem dos itens anteriores. | B | 1,0 | apuração |

## Fora do escopo

- Lançar o bônus no ledger ou na fatura (estacionamento).
- Valores das recompensas.
- Tributação.
- Badges ilustrados.
- Desafio de "relatórios devolvidos" (o conceito não existe).
- Agências verem o programa.
- Avaliar o `bonus_rule_json` (estacionamento).
- Teto de bônus por inspetor/período ou orçamento por período (estacionamento, L-F08-04, 2026-10-29).
- Detecção automática de dado tardio depois do fechamento do período (estacionamento, L-F08-03, 2026-10-29).
- Aviso automático ao inspetor de prêmio pago ou anulado (estacionamento, L-F08-05, 2026-10-29).

## RBAC

| Ação | Quem pode |
|---|---|
| Metas, prêmios, ranking com nome, exportação | AM/OP |
| Próprios dados + ranking anônimo | INSP |
| Agências | Nada (Q18) |

## Critérios de aceite → como provar

- **03.A3:** o ranking do app mostra a própria posição e os números dos outros sem identificação. Provar com teste de contrato do response: ausência de nome e id.
- **03.A4:** uma meta atingida aparece apurada no painel de rewards. Provar com teste do job + E2E.
- **03.A5:** toda alteração de meta, peso ou benefício gera auditoria com autor e data.

## Riscos e armadilhas

- **Unicidade:** entidades de plataforma com escopo nulo precisam de unique parcial em SQL. O drift do Prisma pode derrubá-lo (memória `project_prisma_drift_drops_unsupported_indexes`).
- **Fuso:** "DONE na semana" usa o fuso da agência do appointment. Um mesmo inspetor atende agências no mesmo fuso hoje (só Sydney), mas a spec deve fixar essa regra.
- **Visibilidade de ofertas:** o acesso antecipado muda o que cada inspetor vê. Testar que um grupo sem nenhum inspetor elegível no nível ainda fica visível depois de H horas.
- **ReportType:** são 10 lugares. Seguir a lista acima à risca.

## Quebra em PRs

1. Backend de metas + prêmios + job.
2. Prioridade de oferta.
3. Web (metas, rewards).
4. PWA Challenges + mensagens.
5. Relatório.
