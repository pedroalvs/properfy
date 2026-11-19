# F05 · Lacunas

Revisão de `tarefas/F05-tarefas.md` (contra `F05-dia-ao-vivo.md`, `decisoes.md`, F03/F04/F06/X01/F00 e o snapshot de `origin/develop`). Só entram pontos em que o spec writer ou o implementador teria de **adivinhar**. Decisões já fechadas (D1–D21, Q3, Q5, Q17) e escopo excluído pelo plano (filtro por agência, GPS, WebSocket, ações de recalcular/editar) não são repetidos.

| Severidade | Qtde |
|---|---|
| ALTA | 3 |
| MÉDIA | 7 |
| BAIXA | 4 |
| **Total** | **14** |

---

## L-F05-01 · Ciclo de vida dos alertas: nada "fecha" um alerta e não existe reconhecimento pela OP

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F05-1 (Algoritmo §5, tabela de alertas) e TASK-F05-2 (filtro "Needs attention", linha do inspetor)
- **O que falta / está ambíguo:** A tabela §5 define **quando** cada alerta dispara, mas o "quando sai" só está implícito e é diferente por tipo: `LATE_NOTICE` some no check-in, `COMPLETION_REMINDER` some no check-out, `NOT_STARTED` some quando a parada inicia ou é rejeitada, mas `CANT_DO` ("ativo o dia todo"), `GEOFENCE` e `OUT_OF_WINDOW` (flags persistentes na execução) e `DELAY` (até `DONE_FOR_DAY`) **nunca saem** enquanto a data é a mesma, mesmo depois de a OP ter tratado o caso (reofertou o serviço, verificou o geofence, ligou para o inspetor). Não há "visto/reconhecido" nem no servidor nem no cliente, e o texto não diz explicitamente que isso é uma decisão.
- **Por que importa:** Num dia ruim, às 11:00 a OP já tratou três `CANT_DO` e dois `GEOFENCE`, mas o contador "Needs attention (9)" e os pins com badge vermelho continuam iguais até a meia-noite. A visão por exceção (01.11) deixa de separar "pendente" de "já tratado" justamente no cenário em que ela é mais necessária. Também afeta o caso de borda 3 da F05-1: o `CANT_DO` fica no inspetor original o dia inteiro, enquanto a parada já aparece (e pode estar concluída) no novo inspetor.
- **Evidência:** F05-tarefas §5 (`CANT_DO` "ativo o dia todo"; `GEOFENCE`/`OUT_OF_WINDOW` sem condição de saída); D20 enumera os tipos e não trata reconhecimento; "Fora do escopo" só exclui "notificação ativa para a OP", não o reconhecimento. Não há tabela nem coluna de ack no modelo de dados (só `alert_overrides_json`).
- **Proposta de regra/detalhe:** Acrescentar à tabela §5 uma coluna **"Sai quando"** por tipo (ex.: `CANT_DO` sai quando o appointment deixa de estar `REJECTED` com `INSPECTOR_UNABLE` — foi reofertado/reatribuído — ou no fim do dia; `GEOFENCE`/`OUT_OF_WINDOW` saem no check-out da execução, ou nunca; `DELAY` sai em `DONE_FOR_DAY`). E registrar explicitamente a decisão sobre reconhecimento.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Sem reconhecimento no servidor nesta etapa; definir a coluna "Sai quando" e fazer `CANT_DO` sair quando o appointment for reofertado/reatribuído (`status ≠ REJECTED` ou `inspector_id` preenchido de novo), que é o sinal natural de "OP tratou". Registrar em "Fora do escopo": "reconhecer/dispensar alerta".
  2. Reconhecimento **por sessão** no cliente (`sessionStorage` por `alert key = type:appointmentId:phase`), só esmaece o alerta e tira do contador; não persiste entre usuários.
  3. Reconhecimento no servidor (`live_day_alert_acks(user_id, date, alert_key, acked_at)`), com audit; +0,5 a 1 dia.

## L-F05-02 · Datas passadas: alertas por tempo e `predictedStartAt` usam o `now` real e produzem valores sem sentido

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F05-1 (§1c, §5, caso de borda 10) e TASK-F05-2 (textos "ETA HH:mm", "(N min ago)")
- **O que falta / está ambíguo:** O caso de borda 10 diz que, em dia passado, "os alertas são calculados com `now` real" e que "`NOT_STARTED` pode aparecer". Com isso: (a) toda parada que ficou sem check-in num dia passado gera `NOT_STARTED` com `minutes` na casa dos milhares ("due at 10:00 (4 320 min ago)"), e o contador "Needs attention" de um dia passado conta coisas que não são mais exceções; (b) `projectStopEta` com `earliestDepartureS = max(anchorEnd ?? now, now)` (regra revisada da F06) projeta as paradas pendentes de um dia **passado** para o `now` de hoje, então a lista mostra "ETA 14:32" (de hoje) numa data de semana passada; (c) `DELAY` é suprimido em `DONE_FOR_DAY`, mas quem ficou com paradas não iniciadas nunca chega a `DONE_FOR_DAY`, então o atraso do dia some e o "não iniciado" infla. Nada disso está definido como comportamento desejado.
- **Por que importa:** O seletor de data existe "para consultar" (decisão), e a consulta de ontem é o uso mais provável depois de uma reclamação de agência. Hoje a tela mostraria ETAs de hoje e alertas de milhares de minutos para um dia encerrado.
- **Evidência:** F05-tarefas caso de borda 10; §1c ("Plano `STALE` também passa pela projeção"), sem exceção para `date < today`; F06-tarefas §A passo 3 (`earliestDepartureS = max(anchorEnd ?? now, now)`); tabela §5 `NOT_STARTED` "em qualquer estado do inspetor".
- **Proposta de regra/detalhe:** Introduzir um **`effectiveNow`** por data: `date < today` → `effectiveNow = fim do dia civil da parada (23:59:59 no fuso da agência)` ou, mais simples, pular a projeção e usar `predictedStartAt = publishedStartAt ?? serviceStartAt ?? windowStart`; `date > today` → projeção normal (já funciona, `departureAt > now`). Para alertas em dia passado: `NOT_STARTED` com `minutes` medido até o fim da janela (`window_end_at`) e rótulo "not started that day" em vez de "(N min ago)"; `DELAY` calculado mesmo sem `DONE_FOR_DAY`. Acrescentar linhas de teste em 5, 9c e 13 com `date = ontem`.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Em dias passados **não projetar** (`predictedStartAt` = horário de plano) e medir `NOT_STARTED` até `window_end_at`, com copy própria ("Not started that day").
  2. Em dias passados **não calcular** alertas por tempo (`DELAY`, `NOT_STARTED`); manter só os de evento/flag. Mais simples, perde o atraso do dia.
  3. Manter `now` real e aceitar os números, mudando só a copy para "(not started)" sem minutos.

## L-F05-03 · Visibilidade T-1: a impressão digital filtra os `SCHEDULED` não confirmados, mas `stops`, `progress` e o "conjunto mudou" não

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F05-1 (§1 CTE `appts`, §1b passo 1, §2, §6 passo 1)
- **O que falta / está ambíguo:** `appts` traz **todo** appointment `SCHEDULED/DONE` do inspetor na data. O §1b aplica o `T1VisibilityService` **só** para recalcular a impressão digital (como a F04). Mas `stops`, `progress.total`, `NOT_STARTED` por parada e a regra "o conjunto de paradas mudou quando existe parada viva com `plan_id` e `sequence null`" (§6.1) usam a lista **sem** o filtro. Resultado para a visão de **amanhã** antes das 19:00 (OP recalculou um `DRAFT`, ou o plano de hoje visto hoje de manhã com uma ROUTINE não confirmada remarcada para amanhã): as ROUTINE não confirmadas aparecem como paradas "Not in route yet", entram no total, forçam `geometry` para o fallback reto e `routeApproximate true`, mesmo com `planStatus 'PUBLISHED'` e impressão igual. A F04 as mantém **fora** do plano por definição (teste 619 da F04).
- **Por que importa:** Toda visão de amanhã entre a criação do plano e o corte das 19:00 mostraria "Approximate route" + paradas fantasmas que serão rejeitadas às 19:00, contradizendo o próprio `planStatus`. O `progress.total` de amanhã também não bate com o `stops.length` do `GET /v1/day-plans/:inspectorId/:date` da F04.
- **Evidência:** F05-tarefas §1 (`WHERE … a.status IN ('SCHEDULED','DONE')`, sem T-1), §1b.1 ("aplicar o `T1VisibilityService` aos `SCHEDULED`" só para a impressão), §6.1; F04-tarefas 1101 ("SCHEDULED passa pelo `T1VisibilityService` … DONE entra sempre") e 619.
- **Proposta de regra/detalhe:** Aplicar o mesmo filtro T-1 (em memória, com os campos já carregados) **antes** de montar `stops`, `progress`, alertas e a regra do §6.1, para que F05 e F04 vejam o mesmo conjunto. As invisíveis pelo T-1 não aparecem (hoje elas tampouco aparecem na agenda do inspetor). Acrescentar ao teste 13/17: "ROUTINE não confirmada de amanhã não aparece em `stops` nem no `total`, e não derruba a geometria para o fallback".
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Mesmo filtro T-1 da F04 em tudo (paradas, total, alertas, conjunto mudou).
  2. Mostrar as invisíveis como uma 3ª classe (`inPlan false`, chip "Awaiting tenant confirmation"), fora do total e da regra do §6.1. Mais informação para a OP, mais um estado de UI.

## L-F05-04 · `MapScreenLayout` não empilha no mobile nem aceita `storageKey`: a TASK-F05-2 assume dois comportamentos que o componente não tem

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F05-2 (Layout → "Painel lateral", "Mobile (< 1024 px)", Fora do escopo)
- **O que falta / está ambíguo:** O texto diz "largura salva em `storageKey 'live-day.panel.width'`, não o do mapa de appointments" e "Mobile (< 1024 px): o `MapScreenLayout` já empilha o painel. Gutter de 16 px; sem scroll horizontal". No snapshot, `MapScreenLayout` tem a `storageKey` **fixa** (`'appointments-map.filter-panel.width'`, sem prop) e o painel é um card **`fixed left-4 top-4`** com `minPx: 360`, sobreposto ao mapa em qualquer largura — não há empilhamento. Num celular de 375 px o painel cobre o mapa e estoura a largura. A tarefa diz que não altera `AppointmentMapPage` além do import, mas não diz se pode alterar `MapScreenLayout`.
- **Por que importa:** Sem decidir, o implementador ou compartilha a largura salva com o `/map` (surpresa para o usuário) ou cria uma prop num componente compartilhado sem aviso; e o critério "sem scroll horizontal, alvos de 44 px" é inalcançável sem mudar o layout.
- **Evidência:** `apps/web/src/components/map/MapScreenLayout.tsx` (snapshot): `useResizableWidth({ initialPx: 420, minPx: 360, maxPx: 720, storageKey: 'appointments-map.filter-panel.width' })`; painel `fixed left-4 top-4 … md:left-[91px]`, sem breakpoint de empilhamento.
- **Proposta de regra/detalhe:** Acrescentar ao passo 1 da F05-2: `MapScreenLayout` ganha `storageKey?: string` (padrão = o atual, sem mudar o `/map`) e um modo mobile explícito (abaixo de `md`: painel ocupa a largura toda com `max-h 50dvh` e botão "Map / List"), coberto por teste. Ou declarar que o Live Day é **desktop-first** e, no mobile, o painel vira uma folha recolhível, sem prometer o empilhamento.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Pequena evolução do `MapScreenLayout` (`storageKey` + modo mobile recolhível), reaproveitada pelo `/map`.
  2. Live Day desktop-only nesta etapa: `storageKey` como prop e, abaixo de `md`, aviso "Best viewed on a larger screen" com a lista em tela cheia e o mapa escondido.

## L-F05-05 · O cliente precisa do "hoje" do servidor: máximo do `DateInput`, `isLive`, botão "Today" e deep-link com data inválida

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F05-2 (URL, `useLiveDay`, "Data", caso de borda 10) e contrato `liveDayResponseSchema`
- **O que falta / está ambíguo:** A resposta traz `date` (a pedida) e `isToday`, mas não traz **hoje**. A tarefa define "máximo = amanhã do `data.date`/hoje do ator", `isLive = date >= today` e "Today" desabilitado "quando a data é hoje" — todos precisam de `today`, que o cliente só conhece quando `isToday = true`. Se a OP está em ontem, `data.date + 1` = hoje e o seletor **não deixa chegar a amanhã**. Também não está definido o que a página faz com `?date=` além de amanhã (400 `LIVE_DAY_DATE_TOO_FAR`): hoje cai no EmptyState genérico "We couldn't load the Live Day."
- **Por que importa:** Navegação de datas quebrada numa direção, e o `isLive` calculado no relógio do navegador (que o próprio caso de borda 10 diz não confiar).
- **Evidência:** F05-tarefas: schema de resposta (`date`, `timezone`, `isToday`, sem `today`); "Data: `DateInput` … (máximo = amanhã do `data.date`/hoje do ator)"; "`isLive = date >= today`"; caso de borda 10 ("Toda a lógica de 'hoje' vem de `data.date`/`isToday` do servidor").
- **Proposta de regra/detalhe:** Acrescentar `today: civilDateStr()` (e opcionalmente `maxDate`) ao `liveDayResponseSchema`; `DateInput.max = addCivilDays(data.today, 1)`, `isLive = date >= data.today`, "Today" desabilitado quando `date === data.today`. Para 400 `LIVE_DAY_DATE_TOO_FAR` via URL: trocar `date` por hoje com `replace` e faixa `role="status"` "That day isn't available yet. Showing today." Enquanto não há `data` (1ª carga de uma data inválida), o hook faz a 1ª chamada sem `date` para obter `today`.
- **Precisa de decisão do dev?** Não.

## L-F05-06 · Escala: sem teto para "Show all routes", sem agrupamento de pins e sem orçamento para 100+ inspetores

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F05-1 (teste 15b, D18) e TASK-F05-2 (caso de borda 2, legenda, lista)
- **O que falta / está ambíguo:** O teto de payload (400 KB) é medido com **30** inspetores; com 100 inspetores o `all` passa de 1,3 MB a cada 30 s por aba. O caso de borda 2 diz "40 inspetores: medir no QA", sem critério de aprovação nem comportamento acima dele. Não há limite de inspetores para o toggle, nem regra para 100 pins DOM (`MapMarker`) sem cluster (o `/map` tem `clustered`, o Live Day não menciona), nem para a lista com 100 linhas (sem busca, por decisão). A legenda "Routes" com 100 nomes "em lista com rolagem" não é usável.
- **Por que importa:** O painel é a tela que fica aberta o dia inteiro em várias abas da operação; é onde um payload e uma renderização sem teto mais doem. Sem número, o QA não tem como reprovar.
- **Evidência:** F05-tarefas teste 15b (30 × 6); caso de borda 2 ("meta: interação fluida em notebook comum"); `LiveDayLegend.test` ("mais de 12 inspetores → lista com rolagem"); `MapMarker` tem `clustered`/`clusterCount` (snapshot) e a F05-2 não os usa.
- **Proposta de regra/detalhe:** (a) Constante `LIVE_DAY_SHOW_ALL_MAX = 40` inspetores **visíveis**: acima disso o toggle fica desabilitado com tooltip "Narrow the list (Needs attention) to show all routes — up to 40 at once"; (b) o servidor rejeita `includeGeometry=all` quando o roster passa de 60 (400 `LIVE_DAY_TOO_MANY_ROUTES`), para proteger o backend de um cliente antigo; (c) orçamento no teste 15b também com 100 inspetores em `none` (< 200 KB) e p95 de consulta (ver L-F05-07); (d) pins de inspetor sem cluster (são poucos por ponto e `computeMarkerOffsets` resolve a base compartilhada), registrado como decisão.
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Teto de 40 visíveis no cliente + 60 no servidor, sem cluster.
  2. Sem teto; só a medição no QA com critério numérico (ex.: < 100 ms por poll de render, < 1,5 MB).
  3. Teto menor (20) e cluster de pins de inspetor via `clustered` do `MapMarker` quando > 50.

## L-F05-07 · Orçamento e observabilidade do poll: sem latência-alvo, sem log, rate limit "por usuário" sem `keyGenerator` e sem regra de coordenadas em log

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F05-1 (passo 3 rotas, Riscos, Deploy)
- **O que falta / está ambíguo:** O critério é "1 consulta SQL" — necessário, não suficiente: a consulta agrega `json_agg` de paradas, eventos e lembretes por inspetor e, com `all`, traz `route_geometry` inteiro de cada plano; depois o Node roda impressão digital, `projectStopEta` e Douglas–Peucker para cada plano **a cada poll de cada aba**. Não há latência-alvo (p95), nem log estruturado (`live_day.read { date, inspectors, includeGeometry, durationMs, bodyBytes }`), nem contador para saber quantas abas estão abertas. O "120/min por usuário" exige `keyGenerator` por `user.id` (o limiter global do `plugins.ts` é **por IP**, 200/min; o único precedente de chave própria é o `fy.routes.ts`), e nada diz como o global de 200/min por IP convive com um escritório atrás de um NAT com N abas (2 req/min de live-day + locked-time + eta-accuracy). Por fim, as linhas do read model carregam coordenadas de check-in/out do inspetor, e a F04 tem a regra "nunca coordenadas do inspetor em log"; a F05 não repete a regra para erros do use case.
- **Por que importa:** Sem orçamento, a regressão de desempenho só aparece em produção; sem `keyGenerator`, o limite "por usuário" é na verdade por IP e um escritório pode ser bloqueado pelo global de 200.
- **Evidência:** `apps/backend/src/main/plugins.ts:66-68` (`max: 200, timeWindow: '1 minute'`, sem `keyGenerator`); `fy.routes.ts:63-72` (precedente de chave própria); F05-tarefas "rate limit 120/min por usuário" sem mecanismo; F04-tarefas 1094 ("Nunca coordenadas do inspetor nem token").
- **Proposta de regra/detalhe:** Definir p95 ≤ 300 ms para 50 inspetores em `none` e ≤ 800 ms em `all` (teste 15 mede e registra); log `live_day.read` em `info` com os campos acima e **sem** coordenadas; `keyGenerator: (req) => req.user?.id ?? req.ip` nas 3 rotas; nota de que o global por IP (200/min) comporta ~60 abas por escritório e que, se isso apertar, a chave por usuário já está pronta. Dimensionar `includeGeometry=all` para rodar a simplificação **uma vez** por plano e `version` (cache LRU em memória, chave `dayPlanId:version`), o que também reduz CPU por poll.
- **Precisa de decisão do dev?** Não.

## L-F05-08 · Ordem da lista muda a cada poll e não há prioridade entre inspetores

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F05-2 (Linha do inspetor → "Ordem: `needsAttention` primeiro, depois nome"; "polling não mexe na câmera")
- **O que falta / está ambíguo:** A ordem é `needsAttention` → nome. Como `needsAttention` é booleano e recalculado a cada 30 s, uma linha pula para o topo ou para o meio da lista enquanto a OP está lendo (a tarefa protege a câmera do poll, mas não a lista). Entre os que precisam de atenção não há prioridade: um `CANT_DO` fica abaixo de um único `NOT_STARTED` de 31 min se o nome vier depois. A ordem **dentro** do inspetor está definida (`LIVE_DAY_ALERT_TYPE_ORDER`); a ordem **entre** inspetores não usa essa mesma escala.
- **Por que importa:** 01.11 é "visão por exceção"; a OP precisa que o mais grave esteja em cima e que a lista não se mexa sob o cursor.
- **Evidência:** F05-tarefas "Ordem: `needsAttention` primeiro, depois nome"; teste 7 só cobre o caso estático.
- **Proposta de regra/detalhe:** Ordenar por `(rank do alerta mais grave pelo LIVE_DAY_ALERT_TYPE_ORDER, nome)` e **congelar** a ordem enquanto o ponteiro/foco está dentro da lista (reordenar só no próximo poll sem interação, ou ao trocar filtro/data), com teste "2º poll que muda `needsAttention` de Tom não reordena enquanto a lista tem foco".
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Rank por tipo mais grave + nome; reordenação adiada enquanto há interação.
  2. Ordem fixa por nome, com o filtro "Needs attention" como único mecanismo de prioridade (lista nunca pula).
  3. Manter booleano + nome e aceitar o salto.

## L-F05-09 · "Locked time": âncora do período (hoje × data selecionada) e relação com o 14 da F00

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F05-3 (teste 1 `useLockedTime`, UI "Period") e TASK-F05-1 (`locked-time` padrão `from`)
- **O que falta / está ambíguo:** O teste 1 diz "`from` = `data.date` do Live Day (hoje)", mas `data.date` é a **data selecionada**; se a OP está vendo ontem ou amanhã, a aba "Next 14 days" começa em ontem/amanhã, enquanto o rótulo diz "Next". O endpoint tem outro padrão (hoje do ator). Também não está escrito que o 14 é uma constante da F05 e **não** o `mapWindowDays` por agência da F00 (padrão de plataforma 14): como a tabela é por agência, alguém pode achar que cada linha devia usar a janela da própria agência.
- **Por que importa:** Dois padrões diferentes (servidor e cliente) para o mesmo indicador, e uma tabela "por agência" que pode ser lida com a janela de cada agência.
- **Evidência:** F05-tarefas F05-3 teste 1 e UI "Period"; contrato `locked-time` ("padrão hoje → hoje+13"); F00-tarefas 82 ("Padrão de plataforma 14 … Com uma agência filtrada, vale o `mapWindowDays` dela").
- **Proposta de regra/detalhe:** "Locked time" é sempre ancorado em **hoje** (`data.today` de L-F05-05), independente da data selecionada na aba "Inspectors"; subtítulo com o intervalo real; nota explícita "período fixo 7/14/30, sem relação com `mapWindowDays` (F00)".
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Ancorar em hoje; constante própria.
  2. Ancorar na data selecionada e trocar os rótulos para "7 days from {date}".

## L-F05-10 · Contrato com a F06: nomes de tipos, regra de partida citada e adaptador divergem

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F05-1 (Contexto "F06 · projeção", teste 9c, passo 3 `to-eta-inputs.ts`, Contratos exportados §5)
- **O que falta / está ambíguo:** (a) A F05 usa `EtaPlanSnapshot`/`toEtaPlanSnapshot`; a F06 exporta `EtaPlanInput`/`EtaPlanStop` e o adaptador `etaPlanInputFromDayPlanResponse` "para a F05/PWA". (b) A F05 descreve a partida como `earliestDepartureS = max(âncora, now − travelS)`; a F06 revisada (2026-10-28) usa `max(anchorEnd ?? now, now)` e diz explicitamente que a versão com `now − trecho` foi abandonada. (c) `EtaPlanStop` exige `tenantId`, `scheduledDate`, `appointmentStatus`, `sequence` (não nulo) — a F05 não lista esses campos no adaptador e precisa decidir o que faz com paradas fora do plano (`sequence null`), que a F06 nem aceita (a F05 já diz que não as projeta, mas o teste 9c não cobre que elas são **removidas** da entrada).
- **Por que importa:** Spec e implementação da F05 nascem com o nome errado e a regra errada; o teste 9c "ponta a ponta com o `projectStopEta` real" falharia ou, pior, testaria contra uma cópia local.
- **Evidência:** F05-tarefas l.127 e 9c; F06-tarefas §A ("`earliestDepartureS = max(anchorEnd ?? now, now)` … a versão anterior usava `now − trecho`"), tipos `EtaPlanInput`, `EtaPlanStop`, `etaPlanInputFromDayPlanResponse`.
- **Proposta de regra/detalhe:** Alinhar nomes (`toEtaPlanInput`), remover a fórmula da F05 ("a regra de partida é a da F06, sem repetição aqui"), listar os campos de `EtaPlanStop` montados pelo adaptador e acrescentar ao 9c: "paradas com `sequence null` ficam fora da entrada; `appointmentStatus` vem de `appts.status`". Decidir se a F05 usa o próprio adaptador (linhas brutas) ou monta um `DayPlanResponse` parcial e usa `etaPlanInputFromDayPlanResponse` — o primeiro é mais barato.
- **Precisa de decisão do dev?** Não.

## L-F05-11 · `OUT_OF_WINDOW`: qual janela mede os `minutes` e a tolerância mostrada não é a que gerou a flag

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F05-1 (§5, linha `OUT_OF_WINDOW`; teste 5)
- **O que falta / está ambíguo:** "`minutes` = distância do check-in à borda mais próxima da janela" — a janela do **plano** (`window_start_at/end_at`) ou a do **appointment** (`time_slot_start/end` no fuso da agência, que é a que a F03 usou para gravar a flag)? São iguais na prática, mas para parada fora do plano só existe a segunda. E `thresholdMinutes` = "tolerância atual" do `PlatformSetting`, que pode ter mudado desde o check-in (a F03 só faz snapshot do raio, não da tolerância), então a copy "25 min off, tolerance 15 min" pode mostrar uma tolerância diferente da que disparou.
- **Por que importa:** A OP pode ver "10 min off, tolerance 15 min" (ou seja, dentro da tolerância) com a flag ligada.
- **Evidência:** F05-tarefas §5 e teste 5 `OUT_OF_WINDOW`; F03-tarefas 257 (`out_of_window` "check-in fora da janela ± tolerância"), 259 (só `geofence_radius_m` é snapshot).
- **Proposta de regra/detalhe:** Medir contra `time_slot_start/end` convertidos no fuso da agência (mesma base da F03) e **não** exibir a tolerância atual quando `minutes ≤ tolerância atual` (mostrar só "Checked in outside the window (10 min off)"), ou mostrar "tolerance at the time: unknown". Registrar como limitação conhecida.
- **Precisa de decisão do dev?** Não.

## L-F05-12 · Paleta de 12 tons validada só por contraste, não por distinguibilidade para daltônicos

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F05-1 (Paleta) e TASK-F05-2 ("Show all routes", WCAG)
- **O que falta / está ambíguo:** O teste 9 prova contraste ≥ 4.5:1 contra o fundo, mas no modo "Show all routes" as rotas no mapa se distinguem **só pela cor** entre si (o nome está na legenda e na lista, não no traçado). A paleta percorre o círculo cromático em passos de ~25–30°, com pares que colapsam em protanopia/deuteranopia (0/25/45, 90/145/175, 250/275/305). A tarefa diz "cor nunca sozinha (1.4.1)" para estado e atraso, mas não para a diferenciação entre rotas, e não há verificação de CVD.
- **Por que importa:** ~8% dos homens não distinguem metade da paleta; no modo "todas", a única saída é clicar em cada rota.
- **Evidência:** F05-tarefas "Paleta" (12 HSL por matiz) e teste 9 (só contraste WCAG); "Teclado e WCAG 2.1 AA" não cita rotas.
- **Proposta de regra/detalhe:** Registrar que a diferenciação entre rotas é **por clique/hover** (tooltip com o nome ao passar sobre o traçado; já existe `mouseenter` no `RouteLayer`) e que a legenda é a alternativa textual; reordenar os 12 índices para que vizinhos de hash tenham luminosidade alternada (claro/escuro dentro do limite AA) e acrescentar ao teste 9 uma checagem simples de ΔL entre pares críticos. Não muda escopo nem dias.
- **Precisa de decisão do dev?** Não.

## L-F05-13 · Copys que não valem para datas passadas/futuras e rótulos ambíguos em "Locked time"

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F05-2 (estados vazios, chips de rota, rodapé) e TASK-F05-3 (tabela "By region")
- **O que falta / está ambíguo:** (a) "Nobody needs attention right now." aparece também em dias passados; (b) para **amanhã** antes das 19:30, todo inspetor mostra "No route plan" + "Approximate route" (o plano ainda não foi publicado), o que parece erro — falta um texto que diga que o plano sai às 19:30; (c) "By region" lista só `regionName`, mas `service_regions` é `@@unique([tenant_id, name])`: duas agências podem ter "North" e a tabela mostra duas linhas "North" sem distinção; (d) rodapé com `meanAbsoluteErrorMinutes null` (0 amostras) não tem texto definido além do caso "12 of 30".
- **Por que importa:** São textos que a OP lê o dia todo; "No route plan" em tudo às 15:00 vai gerar chamado.
- **Evidência:** F05-tarefas testes 7 (vazio) e 7 (chips `'NONE'` → "No route plan"); `schema.prisma` `ServiceRegion @@unique([tenant_id, name])`; F04 `routeEtaAccuracySchema.meanAbsoluteErrorMinutes nullable`.
- **Proposta de regra/detalhe:** (a) "Nobody needed attention on {EEE d MMM}." quando `!isToday && date < today`; (b) para `date > today` e `planStatus 'NONE'`: "Route not generated yet — plans publish at 19:30"; (c) `byRegion` ganha `agencyName: string | null` (null = global) e a célula mostra "North · Ray White" / "North · Platform"; (d) `sampleSize 0` → "Route ETA accuracy: no data yet".
- **Precisa de decisão do dev?** Não.

## L-F05-14 · O que a OP consegue fazer a partir da tela: alertas sem link e sem caminho para os limites do inspetor

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F05-2 (visão do inspetor, `LiveDayAlertList`) e TASK-F05-3 (override no drawer)
- **O que falta / está ambíguo:** A tela é de leitura (decidido), e a única ação é o `<Link>` do código nas **paradas**. Os itens de alerta mostram o código como texto; o `CANT_DO` de um appointment que já saiu das paradas (REJECTED) não tem parada para clicar, então não há como abrir o serviço que precisa de reoferta a partir do alerta. O override de limites vive no drawer do inspetor (F05-3), mas a visão do inspetor no Live Day não tem link para ele.
- **Por que importa:** O caminho natural da exceção (ver `CANT_DO` → abrir o serviço → reofertar) exige sair da tela e procurar o código.
- **Evidência:** F05-tarefas teste 8 (alertas com texto; só a lista de paradas tem `<Link>`); F05-3 "seção no drawer do inspetor" sem ponto de entrada no Live Day.
- **Proposta de regra/detalhe:** Em `LiveDayAlertList`, o `appointmentCode` é sempre `<Link to="/appointments/:id">` (mesma aba), inclusive para `CANT_DO`; no `<h2>` da visão do inspetor, um link discreto "Open inspector" para `/inspectors?open=<id>` (ou a rota que o drawer já usa), com o texto de ajuda "Alert limits for this inspector are set in their profile".
- **Precisa de decisão do dev?** Sim.
  1. **(Recomendada)** Links nos alertas + link para o perfil do inspetor.
  2. Só links nos alertas; limites continuam acessíveis apenas pela lista de inspetores.
