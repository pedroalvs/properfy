# F09 · Lacunas

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 9 | 1 | 4 | 4 |

Revisão de `tarefas/F09-tarefas.md` (TASK-F09-1, TASK-F09-2) contra o plano `F09-densidade-mapa.md`, `README.md`, `decisoes.md`, `tarefas/F00-tarefas.md`, `tarefas/F03-tarefas.md` e o snapshot de `origin/develop`. As decisões já fechadas (ponto = check-in, grade ~100 m, período próprio com padrão 30 dias, k = 3 só para CL sem exclusão de `out_of_radius`, camada só no modo Appointments, sem persistência de toggle/período, sem aplicar status/branch/serviço/datas dos pins, `inspectorId` recusado para CL, 366 dias, 5.000 células) foram tratadas como fechadas e não aparecem aqui.

---

## L-F09-01 · O k = 3 é aplicado por consulta, e o CL controla o período dia a dia: subtração de duas janelas revela células de 1 check-in

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F09-1 · Algoritmo §7 (k-anonimato), Contratos (query `fromDate`/`toDate` livres), Casos de borda; TASK-F09-2 · UI "Custom" (`FilterDateRange` com qualquer intervalo ≤ 366 dias).
- **O que falta / está ambíguo:** a supressão `HAVING COUNT(*) >= 3` é calculada **dentro de cada pedido**, e o CL escolhe `fromDate`/`toDate` com granularidade de **1 dia** (presets e "Custom"). Nada na spec trata o ataque por diferença: duas consultas que diferem em um dia (`01/10..10/10` → célula A = 3; `01/10..11/10` → célula A = 4) revelam que houve **exatamente 1 check-in em A no dia 11/10**. Como o CL sabe quais appointments seus estavam agendados em 11/10 (lista, detalhe, F03 `field-activity` com distância e flags), ele liga o check-in ao appointment e ao inspetor. O k só protege a **primeira** visualização; a partir da terceira execução numa célula, cada check-in novo é isolável deslizando a janela. A nota de privacidade do §7 ("dilui a identificação de uma visita isolada") não vale sob esse uso, e nenhum teste (U14–U19, D12–D15) cobre duas consultas combinadas.
- **Por que importa:** um CL_USER curioso com o inspetor que atendeu o imóvel X em 11/10 abre "Custom" duas vezes e obtém a célula de ~100 m onde ele fez o check-in, mesmo que longe do imóvel (o caso que motivou o k). É a situação que a F03 D10 e a decisão de 2026-10-28 dizem proteger; a proteção existe no papel.
- **Evidência:** F09-tarefas l.72 (decisão k = 3), l.209-210 (query livre `YYYY-MM-DD` ≤ 366 dias), l.302 (`HAVING COUNT(*) >= ${minCellCount}`), l.308-310 (nota de privacidade), l.483 e l.574 ("Custom" para todos os perfis, inclusive CL); F03-tarefas l.46 (D10).
- **Proposta de regra/detalhe:** registrar explicitamente que o k por consulta **não** resiste a diferença de janelas e escolher uma das opções abaixo. A mais barata dentro do escopo: para CL, (a) **só presets** (`Last 7/30/90 days`, sem "Custom") e (b) `fromDate/toDate` **validados no backend** contra os presets ancorados no "hoje" de Sydney (`toDate === today` e `today − fromDate ∈ {6, 29, 89}`), com 400 `VALIDATION_ERROR` fora disso. Isso reduz o ataque a 3 janelas fixas por dia (a diferença entre 7d e 30d ainda revela o intervalo de 8–30 dias, mas sem isolar um dia). Testes a acrescentar: S13 (CL com `fromDate` fora dos presets → 400; AM/OP livre), C4 (aba "Custom" ausente para CL), U20 (duas chamadas CL com janelas que diferem em 1 dia não são possíveis). Documentar o risco residual no PR e no CLAUDE.md do backend.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** CL só com presets, validados no backend; AM/OP livres. Custo ~0,15 dia; mantém o k = 3.
  2. Aceitar o risco residual e registrar por escrito (a agência já conhece endereço, data, distância e flags do próprio appointment; o que vaza é a direção do desvio com ~100 m de precisão). Custo zero; a nota de privacidade do §7 precisa ser reescrita para não prometer o que não entrega.
  3. Trocar o k por supressão **estável por célula**: a célula só aparece para CL se tiver ≥ 3 check-ins **em toda a história da agência** (independente do período) **e** o período mínimo for 7 dias. Ainda difereciável, mas por semana e só em células já "públicas". Custo ~0,3 dia (segunda query de elegibilidade).

---

## L-F09-02 · "Execução" inclui appointments que voltaram de DONE para REJECTED (serviço marcado como feito mas não executado) e reabertos: regra dita, sem confronto com o significado financeiro

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F09-1 · Algoritmo §9 ("em qualquer status"), Casos de borda, teste D8.
- **O que falta / está ambíguo:** a spec fixa que toda linha de `inspection_executions` não abandonada conta, "em qualquer status (… appointment que depois voltou para REJECTED/DRAFT: o check-in aconteceu)". Mas `DONE → REJECTED` (AM only, emite `DONE_REJECTED`) é, pelo CLAUDE.md §8.5, o caso em que "o serviço foi marcado como feito mas **não foi executado**" (base do reembolso). Nesse cenário o check-in é justamente o dado suspeito (fraude, local errado, toque acidental), e a camada o mostra como "atividade de campo". O mesmo vale para `DONE → DRAFT` + nova execução por outro inspetor: hoje o `start` devolve a execução existente (idempotente, `start-inspection.use-case.ts:149-165`), então a linha mantém o check-in **do primeiro inspetor**, e a densidade conta a posição dele, não a de quem de fato executou. A spec diz "conta uma vez" sem dizer **qual** vez nesse caminho (só trata o reinício via `abandoned_at` da F03). Não há teste para nenhum dos dois casos.
- **Por que importa:** AM analisa a densidade para ver onde a operação "aconteceu" e vê calor num imóvel cujo serviço foi estornado por não ter sido feito; ou um CL vê o check-in de um inspetor que foi trocado. Em volume pequeno é ruído; em auditoria de um inspetor (`inspectorId`) é informação errada atribuída a ele.
- **Evidência:** F09-tarefas l.314 ("em qualquer status … REJECTED/DRAFT"), l.160 (D8 só cobre `finished_at null`); CLAUDE.md raiz §5 (`DONE → REJECTED` "Emits `DONE_REJECTED` for financial compensation") e §8.5; snapshot `apps/backend/src/modules/inspector-execution/application/use-cases/start-inspection.use-case.ts:149-165` (execução existente em andamento é devolvida sem atualizar coordenadas) e `reopen-execution.use-case.ts:56-61` (reabertura mantém `started_at` e coordenadas originais).
- **Proposta de regra/detalhe:** manter a regra "densidade = check-ins registrados", mas **escrever a consequência** nos dois casos e cobrir com teste: (1) D17: appointment REJECTED com `rejection_reason_code = 'DONE_REJECTED'` → **conta** (ou não, conforme a decisão); (2) D18: appointment reaberto (`resumed_at` preenchido) → conta uma vez, com as coordenadas do `started_at` original. Acrescentar a nota ao "O que conta como execução" e ao CLAUDE.md do backend.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Contar tudo, como está, e documentar que a camada mede check-ins, não serviços concluídos (zero custo; adicionar D17/D18 como testes de caracterização).
  2. Excluir `a.status = 'REJECTED' AND a.rejection_reason_code = 'DONE_REJECTED'` (um `AND` a mais no SQL e um teste); o caso "marcado como feito mas não executado" sai da camada.
  3. Excluir também appointments em `DRAFT`/`CANCELLED` com execução (check-in sem serviço válido) — mais invasivo e muda o significado para "execuções de serviços vivos".

---

## L-F09-03 · O contrato do `useExecutionDensity` não devolve `minCellCount` nem `cellCount`, mas a UI depende dos dois

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F09-2 · Contratos (hook), testes C9, C11a, C11b, C11c.
- **O que falta / está ambíguo:** o retorno do hook está fixado como `{ cells, totalExecutions, excludedWithoutCoordinates, truncated, isLoading, isFetching, isError, refetch }`. Os testes C11a/C11b exigem que o texto use "o número vem de `minCellCount` da resposta", e a decisão diz que o web só explica o que o backend ocultou. Sem `minCellCount` no hook, o `ExecutionDensityControl` teria de importar `MIN_CELL_COUNT_CL` e inferir pelo role, exatamente o que a spec proíbe ("quem aplica é o backend"; "k por escopo, não por lista"). O `cellCount` também falta (C9 pode usar `cells.length`, mas quando `truncated` os dois divergem do total real e a spec não diz qual exibir).
- **Por que importa:** o implementador segue o contrato do hook, o teste C11a falha e ele "resolve" com `isGlobalRole ? 1 : MIN_CELL_COUNT_CL` no componente, criando a segunda fonte de verdade que a TASK-F09-1 evitou. Se um dia o backend mudar o k (ou um role pinned novo surgir), o texto da UI mente.
- **Evidência:** F09-tarefas l.544 (retorno do hook), l.491-493 (C11a–C11c), l.93 (S11: "o web usa `MIN_CELL_COUNT_CL` só para o texto; quem aplica é o backend" — contradiz o C11a, que manda usar a resposta), l.578.
- **Proposta de regra/detalhe:** retorno do hook = `{ cells, totalExecutions, cellCount, excludedWithoutCoordinates, truncated, minCellCount, isLoading, isFetching, isError, refetch }`, com `minCellCount` default `1` enquanto não há resposta. Reescrever S11 para "o web **não** importa `MIN_CELL_COUNT_CL`; lê `minCellCount` da resposta". Resumo usa `cellCount` da resposta (igual a `cells.length` por construção; evita divergir se o backend mudar o corte).
- **Precisa de decisão do dev?** Não.

---

## L-F09-04 · Escala de intensidade e legenda: o peso é relativo ao máximo da resposta, a legenda é "Fewer/More" sem âncora, e a cor do heatmap do Mapbox não é contagem

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F09-2 · Algoritmo (cliente) "Peso", UI "Legenda", teste L4, C9.
- **O que falta / está ambíguo:** (1) `heatmap-weight` é normalizado por `maxCount` **da resposta atual**: a mesma célula com 5 check-ins aparece escura quando o máximo é 5 e quase invisível quando o máximo é 200 (trocar de "7 dias" para "90 dias", ou de um inspetor para "todos", muda a cor de tudo sem mudar os dados). A legenda `Fewer → More` não diz "relativo à área mais movimentada deste recorte", e não há número em nenhuma ponta. (2) `heatmap-density` do Mapbox é densidade de kernel ponderada, dependente de `heatmap-radius`/`intensity` por zoom: duas células vizinhas de 3 somam visualmente mais que uma célula isolada de 6. O resumo em texto dá os totais, mas não há como ler "quantos check-ins" de uma área. (3) Quando todas as células têm `count` igual (ex.: CL com tudo em 3) `maxCount = count` e todas ficam no tom máximo — a camada parece "saturada" com 3 check-ins. Nada disso é erro de implementação; é comportamento que a spec não descreve e que o usuário vai questionar.
- **Por que importa:** OP compara duas agências alternando o filtro e conclui que a B "tem muito mais atividade" porque a cor é mais forte, quando B só tem um máximo menor. CL vê calor máximo numa área com 3 check-ins e acha que há dezenas.
- **Evidência:** F09-tarefas l.565 (`maxCount = max(count)`), l.576 (legenda `Fewer`/`More`, `aria-hidden`), l.595-596 (`heatmap-radius`/`intensity` por zoom).
- **Proposta de regra/detalhe:** manter a escala relativa (é o padrão do `RegionHeatmap` e evita saturação), mas **dizer isso na UI**: rótulos da legenda `1` e `{maxCount}` (com `toLocaleString('en-AU')`) em vez de `Fewer/More`, e texto auxiliar `Colour is relative to the busiest area in this view.` abaixo da barra (também no resumo acessível). Quando `maxCount === 1`, legenda com um só rótulo `1`. Acrescentar teste C9b (legenda mostra `1` e `12` para `maxCount = 12`; muda quando o período muda). Registrar no "Fora do escopo" que não há escala absoluta nem tooltip por célula.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Escala relativa com legenda numerada `1 … {maxCount}` + frase explicativa.
  2. Escala absoluta fixa por perfil (ex.: `0 … 20` check-ins; acima satura) — comparável entre recortes, mas um CL pequeno nunca sai do tom claro e exige constante nova.
  3. Manter `Fewer/More` como está e aceitar a ambiguidade (zero custo; recomendo pelo menos a frase explicativa).

---

## L-F09-05 · Quando o "hoje" dos presets é calculado, e o que acontece na virada do dia e no refetch automático

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F09-2 · Algoritmo (cliente) "Período", Contratos (hook: `staleTime` 5 min), testes P1–P3, H5, H7.
- **O que falta / está ambíguo:** `today = todayInTzDateString(PLATFORM_TIMEZONE)` aparece na fórmula, mas a spec não diz **quando** é avaliado: a cada render, ao ligar a camada, ao trocar de preset? Isso muda o comportamento observável: (a) se for a cada render, à meia-noite de Sydney qualquer rerender troca `fromDate/toDate`, logo a query key (H7), e dispara uma requisição nova "sozinha"; (b) se for só ao ligar, a camada mostra "Last 30 days" de ontem até o usuário mexer, sem indicação; (c) o React Query refaz o fetch no foco da janela e no `staleTime` de 5 min, mas com a mesma key o período continua o antigo. A F00 decidiu para a janela dos pins que "hoje" não avança sozinho (aceito, sem timer); a F09 não registra a mesma escolha. O relógio fixo dos testes P1–P3 prova a conversão, não o momento da avaliação.
- **Por que importa:** OP deixa o `/map` aberto no turno da noite; às 00:00 o `Custom` com `max = hoje` passa a recusar a data que ele mesmo escolheu ou o preset muda sem aviso; ou, ao contrário, ele vê "Last 7 days" que não inclui hoje. Sem regra, dois implementadores fazem diferente e os testes passam nos dois.
- **Evidência:** F09-tarefas l.563 (fórmula com `today`), l.544 (`staleTime`), l.474 (query key inclui as datas), l.603 (só trata a troca de modo); F00-tarefas l.181 (decisão "hoje não avança sozinho" para os pins).
- **Proposta de regra/detalhe:** "hoje" é avaliado **ao ligar a camada e ao trocar de preset/aplicar Custom** (guardado no estado junto com o preset, não derivado em render); não há timer; o refetch por `staleTime`/foco reutiliza o mesmo período. Ao religar a camada depois de desligada, recalcula. Testes: P9 (`presetRange` chamado uma vez ao selecionar; rerender com relógio avançado 1 dia não muda o período nem dispara fetch), C17 (desligar/ligar com relógio avançado → período novo). Mesma regra da F00, citada na spec.
- **Precisa de decisão do dev?** Não.

---

## L-F09-06 · "Hoje" da camada usa `PLATFORM_TIMEZONE`, enquanto a F00 usa `tenant.timezone` para o CL e para a agência filtrada, na mesma página

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F09-2 · Contexto "Fuso no web", Algoritmo (cliente); contrato com `F00-tarefas.md` §4.
- **O que falta / está ambíguo:** a F00 resolve o "hoje" da janela dos pins com `resolveWindowTimezone(tenant.timezone)` (fallback Sydney) para CL e para AM/OP com agência filtrada; a F09 fixa `PLATFORM_TIMEZONE` no web **e** no backend (`parseDateInTimezone(…, PLATFORM_TIMEZONE)`). Hoje todas as agências têm `Australia/Sydney` (default da coluna; projeto Sydney-only), então o efeito é nulo, mas as duas specs vão para o mesmo `AppointmentMapPage` com duas fontes de "hoje" e nenhuma registra a divergência. Se uma agência de Perth for cadastrada com `timezone` próprio, a janela dos pins e o período da densidade passam a virar o dia em horas diferentes, e o `max` do `Custom` da densidade recusa uma data que o Date Range dos pins aceita.
- **Por que importa:** não quebra nada hoje; é uma inconsistência de contrato entre duas tarefas da mesma onda que custará uma investigação quando aparecer.
- **Evidência:** F09-tarefas l.412, l.563, l.313; F00-tarefas l.85, l.156, l.165-168.
- **Proposta de regra/detalhe:** registrar na TASK-F09-2 ("Decisões aplicáveis") que a densidade é **Sydney-only por desenho** (o backend agrega em `PLATFORM_TIMEZONE`, então o web precisa usar o mesmo fuso para que `toDate = hoje` inclua o dia corrente), e que isso diverge da F00 de propósito. Opcional: a F00 citar a F09 na nota dela.
- **Precisa de decisão do dev?** Não.

---

## L-F09-07 · Linha de escopo do painel: não diz que branch, status e serviço são ignorados, e o caso "só inspetor filtrado" não tem texto

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F09-2 · UI "Linha de escopo", teste C7, "Fora do escopo".
- **O que falta / está ambíguo:** (1) C7 define o texto para "AM sem filtros" e "com agência"; com **só `inspectorId`** preenchido (agência vazia) a spec não diz se vale `All agencies · …` ou `Filtered by …`. (2) `branchId` é um filtro que o **CL também** tem (`AppointmentModeFilters.branchId`, sem restrição de role) e a camada o ignora (decidido). O texto do CL, `Your agency's inspections only.`, não avisa; o CL filtra a filial Norte, vê pins só do Norte e calor na cidade inteira. O mesmo para status/serviço/datas dos pins em todos os perfis: `Agency and inspector filters apply.` sugere, por omissão, que os outros também se aplicam.
- **Por que importa:** é a única explicação que o usuário tem de por que o calor não "bate" com os pins; a decisão de não aplicar os outros filtros só é defensável se estiver dita na tela.
- **Evidência:** F09-tarefas l.486 (C7), l.575, l.626 (fora do escopo); snapshot `apps/web/src/features/appointments/components/AppointmentMapFilterPanel.tsx:16-34` (`branchId` sem comentário "AM/OP-only").
- **Proposta de regra/detalhe:** texto único por perfil, sempre com a segunda frase: AM/OP → `All agencies` / `Filtered by agency` / `Filtered by inspector` / `Filtered by agency and inspector` + `Other map filters (status, branch, service, dates) don't apply.`; CL → `Your agency's inspections only. Other map filters don't apply.`. C7 ganha o caso "só inspetor".
- **Precisa de decisão do dev?** Não.

---

## L-F09-08 · Estado de erro: `cells: []` no hook contradiz `keepPreviousData`, e a spec não diz se a camada some ou fica com os dados antigos

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F09-2 · testes H5, H6, C13; Casos de borda "Agência trocada com o painel aberto".
- **O que falta / está ambíguo:** H5 exige `placeholderData: keepPreviousData` (dados anteriores ficam durante o fetch); H6 exige `isError: true, cells: []` em 403/500. No React Query, um fetch que falha **mantém `data`** do último sucesso (e o placeholder), então `cells: []` só acontece se o hook zerar explicitamente em `isError`. A spec não diz qual é a intenção: (a) apagar o calor e mostrar só `Couldn't load activity density.` + `Retry`, ou (b) manter o calor anterior (de outro período/agência, agora enganoso) com o erro por cima. Também não diz o que o resumo mostra nesse estado (`{n} check-ins` antigos?).
- **Por que importa:** OP troca a agência, o backend falha, e a camada continua mostrando a agência anterior sem que a linha de escopo diga isso; ou o implementador segue H6 ao pé da letra e a camada pisca para vazio a cada erro transitório.
- **Evidência:** F09-tarefas l.472-473 (H5/H6), l.495 (C13), l.617.
- **Proposta de regra/detalhe:** em `isError`, o hook devolve `cells: []`, `totalExecutions: 0` etc. (derivado: `isError ? EMPTY : data`), a camada é esvaziada (`setData` com coleção vazia; não removida), o resumo mostra só a mensagem de erro + `Retry`, e a legenda fica oculta. Teste C13 passa a verificar também `DensityLayer` com `cells: []`.
- **Precisa de decisão do dev?** Não.

---

## L-F09-09 · Novo endpoint com RBAC próprio fora do `ROLE_ACTION_MATRIX` (fonte única declarada para backend e UI)

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F09-1 · "Fora do escopo: Ação nova no `ROLE_ACTION_MATRIX`", Contratos "RBAC e escopo por role".
- **O que falta / está ambíguo:** a tarefa exclui a matriz por decisão própria (não é exclusão do plano), mas `packages/shared/src/permissions/role-matrix.ts` se declara "single source of truth" e já lista leituras (`report.view`, `financial.agency_view`, `property.list`, `inspector.view_eligible`). O endpoint cria uma regra nova e não trivial (CL pode ler, mas não com `inspectorId`; INSP/TNT não podem) usando a string `'map.execution_density'` só como rótulo do `requireTenantScope`. O checklist de ampliação de RBAC do projeto pede atualização dos docs canônicos; a spec não lista nenhum.
- **Por que importa:** quem auditar permissões pela matriz não verá que CL lê densidade; quem adicionar um role novo não terá a linha para decidir. Não é vazamento (o use case é fail-closed), é dívida de documentação que a F00 já apontou para `tenant.update`.
- **Evidência:** F09-tarefas l.345, l.255-256; snapshot `packages/shared/src/permissions/role-matrix.ts` (cabeçalho e chaves de leitura listadas acima); `lacunas/F00-lacunas.md` L-F00-02.
- **Proposta de regra/detalhe:** acrescentar `'map.execution_density': { roles: ['AM','OP','CL_ADMIN','CL_USER'] }` à matriz (com comentário "inspectorId filter is AM/OP-only; enforced in the use case") e usar a mesma chave no `requireTenantScope`. Um teste na matriz (shared) e um `it` no use case que compara `EXECUTION_DENSITY_ROLES` com `ROLE_ACTION_MATRIX['map.execution_density'].roles`, para não divergirem. ~10 linhas.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Incluir a chave na matriz neste PR (P1/P4) e citar no CLAUDE.md do shared.
  2. Manter fora e registrar em `escopo-pendencias` como dívida de RBAC junto com o `tenant.update` da F00.
  3. Incluir só a entrada de docs (`specs/015-…`) sem mexer na matriz.
