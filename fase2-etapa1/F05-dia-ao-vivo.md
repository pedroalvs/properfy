# F05 · Dia ao Vivo (painel da operação)

| | |
|---|---|
| **Contrato** | 01.8 (inclui o "mapa diário de inspetor e rotas em tempo real" citado na entrega D, Q5), 01.9, 01.11, 01.13 + tela "Configuração de limites de alerta por inspetor" (critérios 01.A4, 01.A5) |
| **Esforço** | **12,25 dias** · dificuldade **M** (plano 8,5 + revisão de 2026-10-28 1,25: STALE pela leitura fresca, projeção dos horários restantes, carga de geometria sob demanda e teste HTTP do 01.A4 + lacunas de 2026-10-29 2,5; detalhe em `tarefas/F05-tarefas.md`) |
| **Depende de** | F03 (eventos e flags), F04 (plano e horários previstos), X01 (item de menu) |
| **Bloqueia** | – |
| **Status** | Decisões fechadas em 2026-10-27; revisão em 2026-10-28; lacunas decididas em 2026-10-29 (`tarefas/lacunas/F05-lacunas.md`). Pronto para spec. |
| **Decisões** | Q3 ✅, Q17 ✅ |

## Objetivo

Dar à operação uma **única tela** com o dia acontecendo. Ela cobre três itens do contrato: 01.8 (mapa de estados), 01.9 (andamento por inspetor) e 01.11 (visão por exceção). Para cada inspetor mostra onde está, quanto já fez, o atraso acumulado e quem precisa de atenção.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Posição (Q3) | **Último ponto conhecido.** O pin fica no último check-in ou check-out, ou na base enquanto o dia não começou. O estado é derivado; não há ping de localização. A tela traz o rótulo "Last known location". |
| Limites (Q17) | **Padrão da plataforma + override opcional por inspetor** (no drawer do inspetor). |
| Atualização | **Polling a cada 30 s**, só com a aba visível (`refetchIntervalInBackground: false`). |
| Rotas no mapa | **Rota do inspetor selecionado + botão "Show all routes"**, com **uma cor escura por inspetor**. |
| Andamento da rota | **Feitas × restantes.** O traçado é o planejado (sem GPS). As paradas concluídas ficam com check e o horário real; a parada atual é destacada; as restantes mostram o horário previsto recalculado. O pin do inspetor fica no último ponto conhecido. Atualiza a cada 30 s. |
| Entrega D (Q5) | O texto "mapa diário de inspetor e rotas em tempo real" **fica no contrato e é atendido por esta tela**, não por uma segunda tela na D. |
| Horários das paradas restantes | Recalculados pelo `projectStopEta` da F06, sem chamar a Mapbox. A F05 depende da TASK-F06-1. |
| Indicador 01.13 | Vira a **seção "Locked time" desta tela** (não vai para o `/analytics`; as telas de dashboard existentes não são alteradas). |
| Acesso | Item **"Live Day" no grupo Dashboard** do menu lateral (X01). |
| Datas | **Abre em hoje e tem seletor de data.** Dá para ver dias passados e o amanhã já publicado (mesmo endpoint, parâmetro `date`). |

## Decisões das lacunas (2026-10-29)

| Tema | Decisão |
|---|---|
| Alertas sem reconhecimento (L-F05-01) | Não há "visto/dispensar" nesta etapa, nem no servidor nem no cliente. Cada tipo de alerta tem uma **regra de saída** explícita (ex.: `NOT_STARTED` sai no check-in ou quando a parada deixa de ser do inspetor; `CANT_DO` sai quando o appointment é reofertado, cancelado ou reatribuído). O roster só conta `CANT_DO` ativo. |
| Dias passados (L-F05-02) | **Sem projeção** de horários: as paradas mostram o horário de plano. "Não iniciado" mede até o fim da janela, e o atraso aparece mesmo com o dia concluído. |
| Filtro T-1 em tudo (L-F05-03) | O mesmo filtro de visibilidade do T-1 da F04 vale para paradas, total, alertas, roster, impressão e "conjunto de paradas mudou". F05 e F04 veem o mesmo conjunto. |
| Teto de rotas (L-F05-06) | "Show all routes" até **40** inspetores visíveis no web; o servidor recusa `includeGeometry=all` com mais de **60** (400 `LIVE_DAY_TOO_MANY_ROUTES`). |
| Layout (L-F05-04) | `MapScreenLayout` ganha `storageKey` e um **modo mobile recolhível** abaixo de `md`; o `/map` herda o modo sem outra mudança. |
| "Locked time" (L-F05-09) | O período começa sempre em **hoje** (do servidor), independente da data escolhida na lista de inspetores; presets 7/14/30 dias. |
| Estimativa | **12,25 dias** (era 9,75): +2,5 das lacunas L-F05-01..08 e -14. |

## Estado atual (verificado @042a9674)

- **Tempo real:** não há WebSocket nem SSE. O padrão é polling do react-query com `refetchIntervalInBackground: false`.
- **Telas existentes:** `/inspector-workload` (AM/OP, matriz semanal, `dashboard.routes.ts:116`) e o `DashboardPage`. Nenhuma das duas é por dia nem ao vivo.
- **Mapa no web:** só marcadores DOM (`components/map/*`, `MapMarker` com `label`). Não há camada de linha.
- **Índice útil:** `[scheduled_date, inspector_id]` (`schema.prisma:623`).
- **Estado do inspetor:** é derivável sem rastreamento a partir da execução (iniciou sem finalizar = no imóvel) e do plano (F04).

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| API | `GET /v1/dashboard/live-day?date=` (AM/OP). Para cada inspetor com plano no dia: estado derivado (Q3: `NOT_STARTED`, `AT_PROPERTY`, `IN_TRANSIT`, `DONE_FOR_DAY`), último ponto conhecido (geo do último início/fim, senão a base), feitos/restantes, atraso acumulado (início real − previsto da última parada) e a lista de alertas ativos. **Inclui as paradas do plano** (sequência, coordenadas, status feita/atual/restante, horário real ou previsto) e o **traçado** salvo no `DayPlan` (GeoJSON da F04). Uma consulta agregada, sem N+1, e sem chamar o Mapbox na leitura. | M | 1,75 | F03, F04 |
| 01.8 / 01.9 | Página web `/live-day` (AM/OP): mapa com um pin por inspetor (cor = estado) + lista lateral com barra de progresso e atraso por inspetor. Clicar no inspetor mostra as paradas do dia e um link para cada appointment. Polling de 30 s. | M | 2,5 | API |
| Rotas | **Rota do selecionado:** clicar num inspetor (pin ou lista) desenha o traçado e as paradas numeradas, enquadra a câmera e marca feitas/atual/restantes. **"Show all routes":** toggle que desenha as rotas de todos os inspetores do dia (respeitando os filtros da tela), cada uma com a cor do inspetor e paradas como pontos pequenos; clicar numa rota seleciona o inspetor. **Cores:** paleta fixa de ~12 tons **escuros**, distinguíveis e com contraste AA sobre o mapa claro. A cor sai de um hash estável do `inspectorId` e é a mesma na lista lateral (bolinha) e na legenda. Primeira camada de linha do web: componente `components/map/RouteLayer.tsx` portando o padrão do `useOfferRoute` do PWA. | M | 1,75 | API |
| 01.11 | Filtro **"Needs attention"** na mesma tela: atraso > limite, não iniciado no previsto + X, aviso de atraso, "Não consigo fazer", flag de geofence e lembrete de conclusão disparado. | B | 0,5 | API |
| 01.13 | Seção **"Locked time"** na tela: % travado = CONFIRMED ÷ appointments que **exigem** confirmação (definição da F04), no período escolhido (padrão: próximos 14 dias), por agência e por região (região do grupo, senão `ST_Intersects`). Endpoint próprio `GET /v1/dashboard/locked-time`, tabela simples. Não reusa nem altera o `ConfirmationMeter` do analytics. | B | 1,0 | – |
| Limites | Padrão no `PlatformSetting` (atraso, não iniciado) + override opcional por inspetor (`alert_overrides_json` no Inspector, numa seção do drawer). O cálculo dos alertas usa o override quando houver. | B | 1,0 | B6 (F03) |
| Revisão (2026-10-28) | STALE pela impressão digital da F04, adaptador do `projectStopEta`, `includeGeometry` + teste de tamanho, teste HTTP do 01.A4, modo de geometria no web. | – | 1,25 | F04, F06 |
| Lacunas (2026-10-29) | Regras de saída dos alertas, dias passados sem projeção, T-1 em tudo, teto de rotas + orçamento/log/rate limit por usuário, `MapScreenLayout` mobile, `today` do servidor, ordem por gravidade, deep-link do drawer do inspetor. | – | 2,5 | – |
| **Total** | | | **12,25** | |

## Fora do escopo

- Rastreamento GPS.
- WebSocket/SSE.
- Notificação ativa para a OP a cada alerta (a tela e o e-mail do "Não consigo fazer" do F03 bastam).
- Reconhecer/dispensar alerta (os alertas saem só pelas regras de saída, 2026-10-29).
- Visão para agências.
- Histórico de dias anteriores (o seletor de data permite consultar, sem relatório).

## RBAC

Só AM/OP. O contrato não prevê acesso para agência, e o painel cruza agências.

## Critérios de aceite → como provar

- **01.A4:** depois do check-in, o estado vira "no imóvel"; depois do check-out, vira "em deslocamento" ou "dia concluído". Provar com teste de integração da derivação + smoke.
- **01.A5:** cada tipo de alerta dispara conforme o limite configurado. A spec precisa enumerar os **5 tipos**: atraso, não iniciado, aviso de atraso, não consigo fazer, geofence. Provar com testes de unidade por tipo.

## Riscos e armadilhas

- **Cores no Mapbox:** paint usa HSL com vírgula (lição do #1302). No modo "todas", a cor do inspetor fica no traçado e na borda do pin; o **estado continua no ícone/badge** do pin, para não misturar os dois significados.
- **Plano sem traçado:** se o plano não tiver traçado (falha do Directions ou plano STALE ainda não recalculado), desenhar linhas retas entre as paradas com um aviso discreto "Approximate route".

- "Em deslocamento" é uma **inferência**. A tela deve deixar claro que é o "último ponto conhecido" (texto de ajuda).
- Não crescer o `AppointmentMapPage.tsx`: é uma página nova que reusa `MapScreenLayout`, `MapContainer` e `MapMarker`.

## Quebra em PRs

1. Backend (endpoint + limites).
2. Web (página + filtro + drawer).
