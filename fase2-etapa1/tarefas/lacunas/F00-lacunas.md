# F00 · Lacunas

| Total | ALTA | MÉDIA | BAIXA |
|---|---|---|---|
| 10 | 2 | 5 | 3 |

Revisão de `tarefas/F00-tarefas.md` (TASK-F00-1) contra o plano `F00-janela-periodo-mapa.md`, `decisoes.md`, `tarefas/F09-tarefas.md`, `tarefas/X01-tarefas.md` e o snapshot de `origin/develop` @ `042a9674`. As decisões de 2026-10-27 (Q15, Q20, guarda de PATCH vazio, fallback 14/Sydney, groups sempre 14, sem botão "Limpar", sem persistência) foram tratadas como fechadas e não aparecem aqui.

---

## L-F00-01 · A janela nasce invisível: chip e Date Range ficam dentro de um painel que abre fechado

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F00-1 · §5 UI ("Chip da janela … no `AppointmentMapFilterPanel`"), critérios E.A1-1/E.A1-3, smoke P8.
- **O que falta / está ambíguo:** a spec coloca o chip `Next {N} days ✕` e o Date Range (com `min/max` para CL) **dentro** do painel de filtros, mas não diz nada sobre o estado inicial desse painel. No código, `useMapFilterPersistence` inicia `filtersOpen` com `sessionStorage['appointments-map.filters.open'] === 'true'`, ou seja, **fechado por padrão** (e fechado em janela privada/storage bloqueado). O `MapFilterToggleButton` tem `activeFilterCount` "future-proofing", sempre `0` no `AppointmentMapPage` (nenhum badge). Resultado: ao abrir `/map`, AM, OP, CL_ADMIN e CL_USER veem só os pins de hoje..hoje+N e **nenhum** sinal de que existe um recorte, nem como removê-lo (AM/OP) ou qual é o período (CL).
- **Por que importa:** cenário concreto: operadora abre o mapa na segunda-feira para ver os atrasados da semana passada (hoje o mapa mostra tudo), não encontra nada e conclui que foram resolvidos. O chip existe, mas está atrás de um botão que ela não tem motivo para clicar. O E.A1-3 ("AM/OP removem a janela pelo chip") é tecnicamente verdadeiro e praticamente inacessível. Para o CL a situação é pior: a única pista (datas preenchidas no Date Range) está escondida, e o número de pins "sumiu" sem explicação.
- **Evidência:** `apps/web/src/features/appointments/hooks/useMapFilterPersistence.ts:37-43` (`filtersOpen` default `false`); `AppointmentMapPage.tsx:1360-1363` (`MapFilterToggleButton` sem `activeFilterCount`); `apps/web/src/features/appointments/components/MapFilterToggleButton.tsx:6-7,22,38-40` (badge só quando `activeFilterCount > 0`); F00-tarefas §5 ("no `AppointmentMapFilterPanel`, logo acima do 'Date Range'").
- **Proposta de regra/detalhe:** além do chip no painel, renderizar um indicador **fora** do painel, visível com o painel fechado, no mesmo lugar onde já existe o `MapFilterToggleButton` (canto do mapa): para AM/OP, o próprio chip `Next {N} days ✕` (mesma ação); para CL, um chip **sem ✕** `Next {N} days` (somente leitura, `aria-label="Showing the next {N} days"`). Quando `windowActive=false`, nada aparece fora do painel. Acrescentar critério: "E.A1-5: com o painel de filtros fechado, o indicador da janela é visível para os 4 perfis" + teste de página M4. Isso não contraria a decisão "CL sem chip": a decisão proíbe o chip **removível** para CL; um rótulo estático de período é o mínimo para o E.A1 ("nenhum perfil vê inspeções fora de hoje..+N") não virar "nenhum perfil sabe por que não vê").
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Chip fora do painel para AM/OP (removível) e rótulo estático `Next {N} days` para CL; chip do painel continua.
  2. Chip só no painel, mas passar `activeFilterCount={windowActive ? 1 : 0}` no `MapFilterToggleButton` (badge "1") — barato, mas o badge não diz o quê, e CL não tem o que fazer com ele.
  3. Abrir o painel de filtros por padrão na primeira visita (ignorar `sessionStorage` quando não há valor gravado) — muda uma decisão de WEB-8 e come espaço do mapa.

---

## L-F00-02 · `ROLE_ACTION_MATRIX['tenant.update']` já lista a OP sem escopo e não está na lista de docs/código a atualizar (P2b)

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F00-1 · §2 (regra por ator), P2b "Docs canônicos de RBAC", "Riscos: Ampliação de RBAC".
- **O que falta / está ambíguo:** a spec lista três docs canônicos (`specs/002-…/tenant-endpoints.md`, `specs/015-…/spec.md:98`, `specs/backend/tenant.spec.md`) mas não menciona `packages/shared/src/permissions/role-matrix.ts`, que se declara "Canonical role×action permission matrix. Single source of truth consumed by both backend (enforcement) and frontend (UI visibility)" e hoje tem `'tenant.update': { roles: ['AM', 'OP'] }` — ou seja, **já diz que a OP atualiza agência**, sem nenhuma noção de "só `mapWindowDays`". A matriz não tem mecanismo para expressar escopo por chave; a condição disponível (`PermissionCondition = 'cl_user_flag' | 'tenant_setting'`) não serve. Hoje nenhum código consome `tenant.update` (grep em backend/web: zero usos), então a divergência é silenciosa — e a spec nova a mantém.
- **Por que importa:** uma sessão futura (ou o próprio implementador do drawer) lê a matriz, vê `tenant.update: ['AM','OP']`, usa `canPerform('tenant.update')` para liberar o drawer inteiro para a OP, e o backend responde 403 em `name`/`timezone` — exatamente o bug que a spec quis evitar com o caminho restrito. O contrário também: alguém "corrige" a matriz para `['AM']` e um futuro gate no front esconde o botão "Edit" da OP, quebrando E.A2-5.
- **Evidência:** `packages/shared/src/permissions/role-matrix.ts:20-24, 52-54`; `grep -rn "'tenant.update'" apps/backend/src apps/web/src` → nenhum consumidor; F00-tarefas P2b lista só os três `.md`.
- **Proposta de regra/detalhe:** incluir `role-matrix.ts` no P2b: manter `roles: ['AM','OP']` e acrescentar um comentário na entrada (`// OP: only settings.mapWindowDays, enforced in update-tenant.use-case.ts (OP_EXTRA_SETTINGS_KEYS); every other field is AM-only`) — a matriz continua dizendo quem pode **chamar** o PATCH, e o escopo por chave fica onde é aplicado. Acrescentar ao checklist do P2b: "nenhum `canPerform('tenant.update')` deve ser introduzido no drawer; o gate de seções continua `hasRole`". Se a equipe preferir expressar na matriz, é uma mudança de tipo (`scope?: 'settings.mapWindowDays'`) fora do escopo desta tarefa.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Manter `['AM','OP']` + comentário de escopo, e registrar em P2b.
  2. Desmembrar em duas ações: `tenant.update: ['AM']` e `tenant.update_map_window: ['AM','OP']` (a segunda consumida pelo drawer para decidir a seção "Map"). Mais fiel, mas cria a primeira ação "por chave" da matriz.
  3. Não tocar na matriz (status quo). Deixa a divergência que já existe e a amplia.

---

## L-F00-03 · "Next 14 days" mostra 15 dias: a janela é inclusiva em hoje e em hoje+N

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F00-1 · §4 (`computeWindowRange`: "inclusive nas duas pontas; N=14 → 15 dias civis"), §5 (chip `Next {N} days`, N=1 → `Next 1 day`; ajuda do drawer "How many days ahead the map shows by default"), testes L1–L3, C1, C3.
- **O que falta / está ambíguo:** a spec define `to = addCivilDays(today, N)` e o backend aplica `scheduled_date < nextUtcDay(toDate)` (inclusivo), então N=14 cobre hoje + 14 dias = **15 dias**; N=1 cobre hoje e amanhã = 2 dias, com o chip dizendo `Next 1 day`. O texto do chip, o texto de ajuda do drawer ("days ahead") e o rótulo do campo ("Map window (days)") sugerem três leituras diferentes, e a spec não escolhe qual é a "verdade" para o usuário. O F09 (densidade) define `presetRange(N)` como `addCivilDays(today, -(N-1))..today` — N dias exatos — então o `/map` passa a ter dois vocabulários de "N dias" na mesma tela.
- **Por que importa:** cenário: a agência configura 7 "para ver só a semana"; o mapa mostra 8 dias e inclui a segunda-feira seguinte; a operadora reporta "o filtro está errado". Ou o inverso: alguém "corrige" `computeWindowRange` para `N-1` e quebra L1–L3 e o E.A1-4 ("`toDate=hoje+N`") sem saber qual era a intenção.
- **Evidência:** F00-tarefas §4 e L1 (`computeWindowRange(14,'2026-10-27')` → `to '2026-11-10'`, 15 dias); `prisma-appointment.repository.ts:638-641` (`lt nextUtcDay(toDate)`); F09-tarefas P1 (`presetRange('30d')` → `'2026-10-06'..'2026-11-04'`, 30 dias exatos); `decisoes.md` Q15 ("a janela vai de hoje a +N").
- **Proposta de regra/detalhe:** manter a matemática aprovada (hoje..hoje+N) e alinhar a cópia ao que ela faz: chip `Today + {N} days` (N=1 → `Today + 1 day`), `aria-label="Remove date window: today plus {N} days"`, ajuda do drawer `Days ahead of today the map shows by default (1–90). Default: 14 (today through 14 days ahead).` Registrar explicitamente na spec: "N conta os dias **depois** de hoje; o período tem N+1 dias civis; difere de propósito do preset da F09, que é retrospectivo". Ajustar C1/C3 e o smoke.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Manter hoje..hoje+N e trocar a cópia para "Today + N days".
  2. Mudar para N dias exatos (`to = addCivilDays(today, N-1)`), mantendo "Next N days"; L1–L3, E.A1-1/4, H8, M1 mudam; fica coerente com o F09.
  3. Manter tudo como está e aceitar o off-by-one de cópia (documentar como conhecido).

---

## L-F00-04 · Erro/lentidão no GET da agência: a spec não define `retry`, tempo máximo nem o que a tela mostra enquanto `windowReady=false`

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F00-1 · §4 "Abertura" (`enabled: windowReady`), "Erro no GET da agência", testes H2, H5, M2.
- **O que falta / está ambíguo:** (a) o `QueryProvider` faz **2 retries com backoff** para 5xx e erros de rede (`retry: failureCount < 2`), então "GET com erro → N=14 e libera" só acontece depois de ~3–7 s em que a query de appointments fica `enabled:false`; a spec não diz se o hook usa `retry:false`, um `staleTime` próprio ou um teto. (b) Enquanto `enabled:false`, no React Query v5 `isLoading` (= `isPending && isFetching`) é **false**, então o `AppointmentMapPage` não mostra o spinner de "Updating…" nem o estado de carregamento: o cabeçalho do painel exibe "0 appointments", o `MapUnplottableWarning` e o auto-fit recebem lista vazia, e o mapa fica mudo. A spec não descreve esse estado intermediário nem exige um teste para ele. (c) Se o GET falhar e depois voltar (refetch por stale/foco), a janela muda de 14 para o N da agência com o mapa aberto — H12 cobre "N muda no cache", mas não a transição erro→sucesso.
- **Por que importa:** CL_USER em rede ruim abre o mapa: 5–7 s de "0 appointments" sem spinner, depois os pins aparecem. Parece bug, não carregamento. Em teste automatizado, H5 passa (fallback existe) sem provar que a espera é curta ou visível.
- **Evidência:** `apps/web/src/app/QueryProvider.tsx:7-14`; `AppointmentMapPage.tsx:1075-1107` (`isFetching && !isLoading` é o único indicador; `formatPinCountLabel` usa `appointmentData.length`); `useDetailQuery` (`apps/web/src/hooks/useApiQuery.ts:196-206`) repassa `options` sem `retry` próprio; F00-tarefas §4 H5 ("GET da agência com erro → N 14, Sydney, `windowReady` true") sem tempo.
- **Proposta de regra/detalhe:** no `useMapPeriodWindow`, buscar a agência com `retry: false` (falha → fallback imediato) e `staleTime` igual ao padrão; expor `windowReady` ao `AppointmentMapPage` e tratar `!windowReady` como loading no cabeçalho do painel (texto "Loading…" no lugar da contagem) e no auto-fit (não marcar `hasFittedRef` com lista vazia — já é o caso, `points.length === 0` retorna cedo). Acrescentar H5b: "falha → `windowReady` true na primeira resposta, sem retry (`fetch` chamado 1 vez)" e M2b: "enquanto o GET não resolve, o painel não mostra `0 appointments`". Definir a transição erro→sucesso como caso de H12 (reaplica se `windowActive`).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** `retry:false` + estado de loading explícito enquanto `!windowReady`.
  2. Manter o retry padrão e aceitar a espera, mas mostrar loading (resolve a confusão, não a latência).
  3. Não bloquear a query: disparar com 14/Sydney e refazer com o N real quando o GET chegar — viola o E.A1-1 ("a primeira request já sai com a janela") para CL com N≠14; só vale se o critério for reescrito.

---

## L-F00-05 · CL digitando datas fora da janela: a request é clampada em silêncio e o input fica inválido sem mensagem

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F00-1 · §4 "Edição manual por CL", §5 "CL: … o Date Range mostra as datas da janela com `min/max`", E.A1-2, H13/H14, C10.
- **O que falta / está ambíguo:** para CL, o estado guarda o valor digitado, a request sai com `clampRangeToWindow(...)`, e o `DateInput` só marca `aria-invalid` (sem texto de erro, sem `helperText`). Logo o CL vê "From 01/10 to 05/11" no painel enquanto os pins correspondem a "27/10..05/11", e não existe nenhuma frase dizendo "limitado aos próximos N dias". A spec também não diz: (a) se a contagem no cabeçalho reflete a request clampada (sim, por construção) — então "Date Range 01/10–05/11 · 12 appointments" mente sobre o período; (b) o que acontece com `dateFrom > dateTo` digitado (a lib devolve o range inteiro, mas o painel continua mostrando os valores invertidos); (c) qual mensagem acessível explica o `aria-invalid`.
- **Por que importa:** CL_ADMIN tenta ver as vistorias atrasadas do mês passado (caso de uso real: cobrar o inspetor), digita 01/10, o campo fica vermelho sem explicação, o mapa não muda, e ele abre chamado dizendo que o filtro de data "não funciona". E.A1-2 fica provado (nenhuma request fora da janela), mas a experiência não tem como ser entendida sem ler a spec.
- **Evidência:** `apps/web/src/components/forms/DateInput.tsx:84-86, 128-130, 387` ("`min`/`max` mark the field invalid rather than clamping"; `aria-invalid` sem mensagem); `FilterDateRange.tsx` não tem slot de ajuda/erro; F00-tarefas §4 ("o valor vai para o estado, mas o que sai na request é o clamp").
- **Proposta de regra/detalhe:** para CL (sem chip), renderizar abaixo do Date Range um texto fixo ligado por `aria-describedby` aos dois inputs: `Dates are limited to the next {N} days ({from} – {to}).` Quando um input está fora da janela, o mesmo texto vira a mensagem de erro (`role="status"`), sem mudar o comportamento de clamp. Alternativa mais simples e mais honesta: para CL, **não** aceitar valor fora da janela no estado (clampar no `onChange`, não só na request), de modo que o painel sempre mostra o que foi pedido ao servidor; aí `min/max` viram só limites do calendário. Acrescentar C11 (texto de ajuda presente para CL, ausente para AM/OP) e ajustar H13/H14 conforme a opção.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Clampar no `onChange` para CL (estado = request) + texto de ajuda fixo com o período.
  2. Manter o clamp só na request (como está) + texto de ajuda/erro explicando o limite.
  3. Manter como está (só `aria-invalid`), aceitando o descompasso entre painel e pins.

---

## L-F00-06 · Plano e tarefa divergem sobre "PATCH que não muda nada não audita"

- **Severidade:** MÉDIA
- **Tarefa/seção:** `F00-janela-periodo-mapa.md` "Critérios de aceite → E.A2" ("Um PATCH que não muda nada não grava auditoria") × TASK-F00-1 §2 regra 5 / §3 / P2a (guarda só quando **nada sobra após o filtro de permissão**).
- **O que falta / está ambíguo:** a tarefa implementa a guarda por "payload vazio após filtro", não por "sem diferença de valor". Casos que a frase do plano cobre e a tarefa não: OP grava `mapWindowDays: 30` numa agência que já tem 30 (passa pela guarda, `update` + `tenant.updated` com before == after); AM salva o drawer sem mudar nada (o `useTenantAdminSave` reenvia o form inteiro: `name`, `legalName`, `timezone`, `currency`, `settings`) → auditoria antes == depois em toda gravação do drawer; OP abre o drawer e clica "Save" sem mexer (o botão não é desabilitado por `isDirty`). Nenhum dos dois documentos diz qual leitura vale, e a descrição do PR vai citar os dois.
- **Por que importa:** o E.A2 ("alterar `mapWindowDays` gera `tenant.updated` com antes/depois") é verificado em audit logs no smoke; se a auditoria acumular entradas antes == depois a cada "Save" do AM, quem lê a trilha não distingue mudança real de clique vazio — o mesmo ruído que a guarda P2a quis remover, só que pela porta do drawer. E um revisor que leia o plano vai pedir diff por valor; outro que leia a tarefa vai recusar.
- **Evidência:** `F00-janela-periodo-mapa.md` seção "Critérios de aceite" (última frase do E.A2); F00-tarefas §2 item 5 e §3 ("PATCH com mudança real → auditoria normal, como hoje"); `useTenantAdminSave.ts:92-104` (`{ ...rest, settings, appointmentCodePrefix? }` sempre completo); `TenantFormDrawer.tsx:249-251` (Save sem `disabled={!isDirty}`).
- **Proposta de regra/detalhe:** manter a guarda estreita (decisão aprovada) e **corrigir a frase do plano** para "um PATCH em que nada sobra para gravar após o filtro de permissão não grava auditoria; valores iguais aos atuais continuam gravando e auditando, como hoje". No drawer, desabilitar "Save" quando `!isDirty` (edição) para AM e OP — remove o caso mais comum de antes == depois sem tocar no backend — e acrescentar W11 ("Save desabilitado sem alteração"). Nada muda em B/N.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Guarda estreita (como na tarefa) + corrigir o plano + Save desabilitado sem `isDirty`.
  2. Guarda por diff de valor (comparar `updateData` com o tenant atual, chave a chave, incluindo `settingsJson` após `deepMerge`): mais fiel à frase do plano, mas muda o contrato para todos os callers e exige N9–N12 novos.
  3. Só corrigir o plano, sem mexer no drawer.

---

## L-F00-07 · "Edição manual do Date Range" não tem critério de detecção: o painel emite o objeto inteiro em qualquer filtro

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F00-1 · §4 "Estado e transições" (edição manual → `windowActive[mode] = false`; troca de agência → recalcula), H8–H10, P6/P7.
- **O que falta / está ambíguo:** o `AppointmentMapFilterPanel` chama `onAppointmentFiltersChange({ ...filters, <campo>: v })` para **todo** filtro (status, branch, `tenantId`, time, search…), e a spec coloca `useMapWindowFilters` como dono do estado "um estado por modo" sem dizer como ele distingue (a) uma mudança de data vinda do usuário, (b) uma mudança de outro campo (não pode desligar a janela), (c) uma troca de `tenantId` (deve recalcular N/hoje **e** reaplicar as datas, sem passar pelo caminho "edição manual"), (d) a reaplicação programática (H8/H12) que também altera `dateFrom/dateTo`. Também não diz o que acontece se o usuário digita a mesma data que a janela já tinha (muda ou não `windowActive`?), nem se `windowActive=false` deve persistir quando o AM muda de agência e depois limpa as duas datas à mão (fica "sem janela" ou volta à janela? — hoje "Limpar" é `resetDates()` interno, mas o CL não tem chip e o AM não tem botão).
- **Por que importa:** implementação ingênua ("qualquer `onAppointmentFiltersChange` com datas diferentes do range → manual") desliga a janela quando o próprio hook reaplica datas na troca de agência (H8 quebra) ou quando o N muda no cache (H12 quebra). Implementação pelo outro lado ("só desliga se `dateFrom/dateTo` diferem do estado anterior") desliga na reaplicação programática também, porque ela passa pelo mesmo `setAppointmentFilters`. O teste H10 ("AM edita `dateTo` à mão → `windowActive` false") não prova nenhuma das duas, porque não exercita a reaplicação no mesmo fluxo.
- **Evidência:** `AppointmentMapFilterPanel.tsx:308-313` (`onChange({ ...filters, dateFrom: v })`), `:281-300` (tenantId/branch passam pelo mesmo `onChange`); `AppointmentMapPage.tsx:1123,1125` (`onAppointmentFiltersChange={setAppointmentFilters}`); F00-tarefas §4 descreve estados, não o critério.
- **Proposta de regra/detalhe:** definir no hook um único ponto de entrada `onFiltersChange(next)` que: (1) se `next.tenantId !== prev.tenantId` → trata como troca de agência (recalcula; se `windowActive`, sobrescreve `next.dateFrom/dateTo` com a nova janela; nunca desliga); (2) senão, se `next.dateFrom !== prev.dateFrom || next.dateTo !== prev.dateTo` → edição manual: AM/OP → `windowActive=false`; CL → clamp (L-F00-05); (3) senão → passa direto. Reaplicações internas (H8/H12/`resetDates`) usam um setter interno que **não** passa por (2). AM/OP que limpam as duas datas à mão ficam "sem janela" (`windowActive=false`, request sem datas) — equivalente ao chip. Acrescentar H15 (mudar status não altera `windowActive`), H16 (troca de agência com janela ligada não desliga mesmo mudando as datas) e H17 (AM limpa as duas datas → sem datas na request, chip some).
- **Precisa de decisão do dev?** Não.

---

## L-F00-08 · URLs e deep links: a spec não afirma que `/map` não aceita datas na URL nem o que vale para `?mode=groups`

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F00-1 · "Contexto no código", §4 "Troca de modo", "Fora do escopo" (persistir filtros/URL).
- **O que falta / está ambíguo:** o `/map` só lê `?mode=groups` (seed único, AM/OP) e nenhum caminho do app navega para `/map` com filtros de data (`/appointments` e `/service-groups` usam `navigate('/map')` / `'/map?mode=groups'`; a lista tem filtros de data na URL, mas o botão "Map View" não os carrega; a X01 mantém esses destinos). A spec não registra isso, então o implementador precisa descobrir se precisa honrar `?dateFrom=` (não precisa) e o que acontece na abertura por `?mode=groups` (janela de 14 no modo groups, com `windowActive.appointments` também `true` para quando o usuário trocar de modo).
- **Por que importa:** sem a afirmação, alguém "melhora" a tarefa lendo `?fromDate` da URL e cria uma segunda porta que ignora a janela do CL (fura o E.A1-2), ou um revisor pede suporte a deep link que foi excluído do escopo.
- **Evidência:** `useMapFilterPersistence.ts:34-36`; `router.tsx:332`; `ServiceGroupListPage.tsx:29`; `AppointmentListPage.tsx:102`; `AppointmentBoardPage.tsx:187`; X01-tarefas l.184, 191, 406, 413.
- **Proposta de regra/detalhe:** acrescentar ao "Contexto no código": "O `/map` não lê parâmetros de data da URL e nenhuma tela navega para ele com datas; `?mode=groups` continua sendo o único parâmetro honrado. A janela se aplica igual em abertura direta e via `?mode=groups` (groups: 14/Sydney; appointments: já com `windowActive=true` para a troca de modo)." Acrescentar M3b: abrir `/map?mode=groups` e trocar para Appointments → primeira request de `/v1/appointments` com `fromDate/toDate`.
- **Precisa de decisão do dev?** Não.

---

## L-F00-09 · Fuso: existem duas fontes no web (`user.timezone` do `/v1/me` e `tenant.timezone` do GET) e a spec só nomeia uma

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F00-1 · "Datas e fuso", §4 tabela "Fonte de N e de 'hoje'", H2/H4.
- **O que falta / está ambíguo:** o `useAuth` já expõe `user.timezone` = fuso **efetivo** resolvido por request (agência para CL_*, pessoal para AM/OP/INSP, plataforma como fallback), e todas as telas do web que calculam "hoje" (`AppointmentFormDrawer`, `BulkEditModal`, `MapBulkRescheduleForm`, modais de grupo) usam `todayInTzDateString` com esse valor. A spec manda usar `tenant.timezone` do GET `/v1/tenants/:id`. Para CL as duas coincidem; para AM/OP com agência filtrada são **diferentes** (pessoal × agência) e a spec escolhe a agência — correto, mas não diz "não use `user.timezone`", que é o reflexo de quem conhece o código. Também não cobre que `useUpdateAgencyTimezone` (tela de settings do CL_ADMIN) **não** invalida `['tenant-admins']`, então após trocar o fuso da agência o mapa segue com o anterior até o `staleTime` (30 s) ou reload.
- **Por que importa:** AM com fuso pessoal `America/Sao_Paulo` filtrando uma agência de Perth: `user.timezone` daria "hoje" errado em ~11 h do dia; a spec evita isso, mas só se o implementador não reutilizar o padrão das outras telas. Baixa porque H2 (Perth 23h) já falharia com a fonte errada.
- **Evidência:** `apps/web/src/hooks/useAuth.tsx:21-23, 91`; `packages/shared/src/types/auth.ts:29-35`; `grep -rl todayInTzDateString apps/web/src` (8 telas, todas via `user.timezone`); `useUpdateAgencyTimezone.ts` (sem `invalidateQueries`); F00-tarefas §4 tabela.
- **Proposta de regra/detalhe:** adicionar à seção "Datas e fuso": "Não usar `user.timezone`: para AM/OP ele é o fuso pessoal; a janela usa o fuso da **agência filtrada** (`tenant.timezone`) ou `PLATFORM_TIMEZONE`. Para CL os dois coincidem, mas a fonte é o GET, para que N e fuso venham do mesmo objeto." Registrar a defasagem de até 30 s após `useUpdateAgencyTimezone` como aceita (ou invalidar `['tenant-admins', tenantId]` nesse hook, 1 linha).
- **Precisa de decisão do dev?** Não.

---

## L-F00-10 · Rollout/rollback não declarados, e o P2b toca um contrato com linhas vizinhas já desatualizadas

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F00-1 · "Dependências", "Riscos", P2b, "Dias · Branch · Verificação".
- **O que falta / está ambíguo:** (a) a tarefa muda comportamento visível para 4 perfis (janela), amplia RBAC da OP e altera a semântica de auditoria do PATCH, tudo num PR, **sem flag** e sem dizer o que um revert faz: `mapWindowDays` gravados ficam no JSONB (inertes via `passthrough`), a OP volta a receber 403, e o mapa volta a abrir sem janela. Isso é aceitável, mas precisa estar escrito para o deploy (develop → staging → prod) e para a descrição do PR. (b) O `specs/002-tenants-branches/contracts/tenant-endpoints.md` que o P2b edita tem outras linhas sobre a OP que já divergem do código (`l.54` "list: AM only" — o `list-tenants.use-case` aceita AM/OP; `l.99` GET "OP own tenant only" — o `get-tenant.use-case` libera OP em qualquer agência; `l.160` idem). A tarefa manda reescrever só a linha do PATCH; o doc continua contradizendo o código ao lado da regra nova.
- **Por que importa:** o checklist de ampliação de RBAC (memória do projeto) exige que os docs canônicos reflitam o código; corrigir uma linha e deixar as vizinhas erradas convida a próxima sessão a "restaurar" a OP para "own tenant" no PATCH por coerência com o GET. E sem a nota de rollback, um revert em staging deixa chaves `mapWindowDays` "órfãs" que alguém pode tentar migrar.
- **Evidência:** `specs/002-tenants-branches/contracts/tenant-endpoints.md:54, 99, 134, 160`; `list-tenants.use-case.ts:44` (`assertRoles(actor, ['AM','OP'])`); `get-tenant.use-case.ts:29-36`; F00-tarefas P2b ("a linha 'OP (own tenant…)' sai").
- **Proposta de regra/detalhe:** acrescentar à seção "Riscos": "Rollback = revert do PR; sem migration; chaves `mapWindowDays` existentes ficam inertes (schema `passthrough`) e voltam a valer num re-deploy; nenhum backfill." No P2b, ampliar o escopo mínimo do `tenant-endpoints.md` para as linhas 54/99/160 (três correções de uma palavra cada: "OP (any tenant)"), já que o arquivo está sendo editado e o código é a fonte.
- **Precisa de decisão do dev?** Não.
