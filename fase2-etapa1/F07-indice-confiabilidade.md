# F07 · Índice de confiabilidade

| | |
|---|---|
| **Contrato** | 03.4, 03.5, 03.11, 03.12, efeito do 03.3 (critério 03.A1) |
| **Esforço** | **6,5 dias** · dificuldade **A** |
| **Depende de** | F03 (eventos, flags, precisão), F04 (deslocamento planejado, para normalizar), X01 (item de menu) |
| **Bloqueia** | F08 (níveis e metas por índice) |
| **Status** | Decisões fechadas em 2026-10-27. Pronto para spec. |
| **Decisões** | Q18 ✅ + as do quadro abaixo |

## Objetivo

Calcular uma nota de confiabilidade de 0 a 100 por inspetor e período, com pesos configuráveis. A operação vê o ranking e o detalhe das métricas.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Métricas | **8 métricas com pesos configuráveis.** A **quantidade de inspeções atendidas** entra no lugar de "aceites ÷ ofertas" (decisão do dev, 2026-10-27). Lista abaixo. |
| Janela de cálculo | **Últimos 30 dias, móvel**, recalculada todo dia. Metas e prêmios (F08) mantêm o período próprio de cada meta. |
| Volume mínimo | **10 serviços** na janela (configurável). Abaixo disso, o inspetor aparece como "Not enough data" e fica fora do ranking. |
| Agências (Q18) | **Não veem** índice nem ranking. Só AM/OP. |
| Acesso | Item **"Inspector performance" no grupo Dashboard** do menu (X01). É uma tela nova; os dashboards existentes não são alterados. |

## Estado atual (verificado @042a9674)

**Insumos que já existem:**

| Insumo | Onde |
|---|---|
| Nota de satisfação | `SatisfactionSurvey` (`schema.prisma:1160`), agregada em `prisma-inspector-rating.reader.ts:25` |
| Concluídos / cancelados / rejeitados e duração média | `getPerformanceRows` (`prisma-report-data-reader.ts:58`) |
| Início real × janela | `InspectionExecution.started_at` × `scheduled_date` + `time_slot_*` (converter no fuso da agência) |
| DONE → REJECTED | Evento `appointment.done_rejected.v1` e auditoria `appointment.done_rejected`. Não está denormalizado. |

**O que não existe:**
- Nenhum modelo de score, ranking ou nível.
- O conceito "relatório devolvido pela agência" do design v3.

**Precedente de visibilidade:** a tela AM/OP de workload usa `WORKLOAD_ROLES` fixo (`get-inspector-workload.use-case.ts:15`).

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| 03.4a | Modelo `InspectorReliabilitySnapshot(inspector_id, snapshot_date, window_days=30, score NULL quando há pouco volume, volume, metrics_json, computed_at)`, **sem tenant_id**, unique `(inspector, snapshot_date)`. Job diário de plataforma (madrugada) calcula a janela móvel de 30 dias. O "índice atual" é o snapshot mais recente. O histórico diário fica disponível para o F08 (níveis e sequência). | M | 1,0 | – |
| 03.4b | **8 métricas**, todas de dados existentes ou do F03. Cada uma vira uma taxa de 0 a 1. Se o inspetor tiver menos de 10 serviços na janela, o score fica nulo ("Not enough data"). Ver a lista abaixo. | A | 2,0 | F03 |
| 03.5 | Normalização: o peso de cada serviço é a duração do tipo (F04) mais um fator de deslocamento planejado (F04). Sem modelo de "dificuldade do imóvel". | B | 0,5 | F04 |
| 03.A1 | Pesos das métricas no `PlatformSetting`. Ao salvar, **recalcula o snapshot do dia** de todos os inspetores (03.A1). Auditado. | B | 1,0 | B6 (F03) |
| 03.11 / 03.12 | Página web **"Inspector performance"** (AM/OP): ranking atual, janela de 30 dias (posição, nome, score, nível do F08 quando existir, volume). Quem tem pouco volume aparece num bloco separado "Not enough data". Drawer com as 8 métricas. Uma só página, cobrindo os dois itens do contrato. | M | 2,0 | 03.4a |

**As 8 métricas (03.4b).** Cada uma é calculada por uma função `computeMetric(metric, inspector, from, to)` que aceita **qualquer período**. A F07 usa a janela de 30 dias; a F08 reusa a mesma função no período de cada meta.
1. Pontualidade: início dentro da janela ou do previsto.
2. Conformidade de geofence.
3. Conclusão sem travar (sem alerta de 6 h).
4. Nota de satisfação.
5. Atraso avisado com antecedência ÷ atrasos totais (03.3). Conta como antecipado o aviso dado **antes do horário previsto publicado** da parada; sem roteiro, vale o início da janela (decisão de 2026-10-28).
6. "Não consigo fazer" por motivo do inspetor (`CANT_ATTEND`).
7. **Volume atendido:** inspeções concluídas (DONE) nos 30 dias ÷ **mediana do volume dos inspetores ativos** (pelo menos 1 DONE na janela), recalculada a cada snapshot, com piso de 1 e limitada a 100%. Substitui "aceites ÷ ofertas" (decisão de 2026-10-28).
8. DONE → REJECTED, via auditoria.

## Fora do escopo

- Visão para agências (Q18).
- Coluna do índice no relatório PERFORMANCE das agências.
- Detecção de fraude.
- Histórico gráfico de evolução.
- Exportação: fica no F08, como relatório do programa.

## RBAC

| Ação | Quem pode |
|---|---|
| Ranking com nomes e detalhe | AM/OP |
| Próprio índice e ranking anônimo (no F08) | INSP |

## Critérios de aceite → como provar

- **03.A1:** o índice segue os pesos configurados e é recalculado quando a configuração muda. Provar com teste de unidade da fórmula + teste de integração do recálculo.

## Riscos e armadilhas

- No-show não tem linha de execução. Tratar "não iniciou" como falha de pontualidade **só** se o appointment terminou DONE ou foi rejeitado por motivo do inspetor.
- Fuso: as janelas são horário de parede da agência.
- DONE → REJECTED exige consultar `audit_logs` por tipo de ação, com índice adequado.
- Métricas com pouco volume distorcem o ranking. O piso de volume é obrigatório.

## Quebra em PRs

1. Backend (snapshot, métricas, job, pesos).
2. Web (página de desempenho).
