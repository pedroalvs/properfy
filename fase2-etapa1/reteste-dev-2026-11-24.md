# Reteste em DEV — primeira perna (onda pós-validação) — 24/11/2026

Executor: Batedor, a pedido do coordenador "Claude Code #3". Roteiro: `plano-execucao-pos-validacao.md` § 6-B, coluna "Reteste em tela". Origem de cada defeito: `smoke-dev-2026-11-23.md`.

- **Ambiente:** só DEV — web `properfy.pedroalvs.com`, app `pwa-properfy.pedroalvs.com`, API `properfy-api-dev.fly.dev`. Nada de staging ou produção.
- **Contatos:** só fictícios (`@example.invalid`, celulares da faixa ACMA `+61 491 57x xxx`).
- **Versão no ar:**
  - De 21:23Z a 21:53Z: release v117 = `develop` até o #1388 (PR-08).
  - A partir de 21:53Z: release v118 = `553797b2` (#1389, ajuste do PR-05). O deploy foi conferido no log do workflow (`ref: 553797b2…`).
- **Capturas:** `output/smoke-dev/reteste/` (42 arquivos), não commitadas.
- **Horário:** de 24/11 21:10Z a 22:50Z, o que dá 08:10–09:50 de 25/11 em Sydney e 18:10–19:50 de 24/11 em Brasília.

**Legenda:** PASSOU / FALHOU / NÃO DEU PARA TESTAR.

## Resumo

| PR | Resultado | Em uma linha |
|---|---|---|
| PR-02 | **PASSOU** | Depois do check-out, o próximo cartão mostra "Check in" sem recarregar (duas vezes) |
| PR-07 | **PASSOU** | CL recebe 404 nas 4 listagens de outra imobiliária e para imóvel inexistente; a tela mostra "Property not found" |
| PR-01 | **PASSOU** | Cartão de oferta sem selo de prioridade |
| PR-03 | **FALHOU** (ponto a) | Caso original PASSOU ("+61 min vs. suggested" fica depois de salvar e de recarregar). **Ponto (a):** depois do recálculo automático por troca de origem, a tela volta a dizer "Same finish time as suggested" |
| PR-09 | **PASSOU** | Base mostra "1 Martin Place…"; filial com número em campo separado: lista "200 George Street…" sem duplicar |
| PR-13 | **PASSOU** | Live Day abre; folha de rota do inspetor (PDF/XLSX) 200; "Reset to suggested order" recalcula; rotas de AM/OP respondem 404 |
| PR-10 | **PASSOU** | Armazenamento devolveu **415** para PDF → "This file type isn't accepted."; **413** para 55 MB → "This file is too large." |
| PR-04 | **PASSOU** (1 texto) / **NÃO DEU** (outro) | "My results": "You need 1 job for a score.". O texto do Ranking só aparece para inspetor não ranqueado, e os dois com login conhecido estão ranqueados |
| PR-11 | **PASSOU** | Portal depois de "Can't do": só "This inspection will not go ahead as scheduled. The agency will contact you to arrange a new time." |
| PR-12 | **PASSOU** | More e App settings mostram a mesma versão: `v0.1.0+dev` |
| PR-05 | **PASSOU** (1) e (2), com o #1389 | (1) Remarcada para 08:50: "não iniciado" às 08:55 e atraso de 55 min medido contra 08:50. (2) Janela 09:30–17:00, previstas 10:32 e 11:22: sem alerta às 09:41 |
| PR-15 | **PASSOU** | Sessão de inspetor descartada no web; alerta + modal; botão → app de DEV; fechar limpa os campos (login pelo formulário verificado pelo coordenador); AM/OP/CL entram; sem Marketplace |
| PR-06 | **PASSOU** (parte 1) / **NÃO DEU** (parte 2) | Abrir o "Today" de um dia sem plano criou um plano sem paradas e nenhum aviso. A publicação das 19:30 só ocorre hoje às 19:30 de Sydney (25/11 08:30Z, 05:30 BRT); o dado está preparado |
| PR-08 | **PASSOU** | Início, fim e as 2 divergências de localização sem coordenada do inspetor, inclusive para AM/OP; só a coordenada do imóvel (mascarada para CL); "Field activity" mostra distância e precisão |

**Contagem por PR (14):** 11 PASSOU · 1 FALHOU (PR-03, ponto a) · 2 com parte NÃO DEU PARA TESTAR (PR-04 texto do Ranking; PR-06 publicação das 19:30). Nenhum defeito novo nos critérios dos PRs além do PR-03 (a).

**Pendentes por data:** P1 PASSOU (F08-c sem posição, por regra: menos de 5 inspetores com nota) · P2 PASSOU até o provedor · P4 PASSOU · P3 NÃO DEU (vence 30/11).

## Resultado por PR (ordem do § 6-B)

### PR-02 — próximo cartão depois do check-out (D-02 / 00.A3) — PASSOU
- **Passos:** app como Mike, Today. Check-in e check-out em INS-0100 (GPS simulado no imóvel). Depois, check-in e check-out em INS-0101.
- **Esperado:** o cartão "Next inspection" passa para a próxima parada com o botão "Check in", sem recarregar.
- **Obtido:** depois de ~3 s o cartão mostrou "14 Miller St… Check in"; da segunda vez, "12 Harbour St… Check in". Não recarreguei.
- **Observação menor:** nesses ~3 s o cartão antigo fica sem botão.
- **Captura:** `pr02-proximo-cartao-check-in-sem-recarregar.jpg`.

### PR-07 — CL listando arquivos de outra imobiliária (D-15 / C.A2) — PASSOU
- **Passos:**
  - CL_ADMIN da Sydney chamou `GET /v1/property-files` e `GET /v1/property-issues` com `propertyId` e com `appointmentId` da Melbourne Real Estate, e com `propertyId` inexistente.
  - Controles: OP nas mesmas chamadas; CL no próprio imóvel.
  - Na tela: CL abriu `/properties/<imóvel da Melbourne>`.
- **Obtido:**
  - CL → **404** `PROPERTY_FILE_NOT_FOUND` nos 5 casos.
  - OP → 200 com lista vazia, sem mudança, como previsto na leitura do diff.
  - CL no próprio imóvel → 200.
  - Tela: "Property not found — This property does not exist or you do not have permission to view it."
- **Captura:** `pr07-cl-imovel-outra-agencia-nao-encontrado.jpg`.

### PR-01 — selo de prioridade morto (B1) — PASSOU
- Offers (Mike) com a oferta do grupo 24: nenhum selo nem contagem regressiva; não há `[data-testid=priority-countdown]` nem o texto "priority" na página.
- **Captura:** `pr01-oferta-sem-selo.jpg`.

### PR-03 — sugestão preservada depois de salvar ordem manual (D-06 / 01.A2) — FALHOU (ponto a)
- **Caso original — PASSOU.**
  - Today's route de 25/11: movi a parada 3 (janela 13:00) para a posição 2 → "Finish ~2:46 pm · **+61 min vs. suggested**" → "Save order" → "Route saved. 1 stop arrives after its window." O texto "+61 min vs. suggested" ficou na tela.
  - Depois de recarregar, continua "+61 min vs. suggested".
  - API: `manualOrder=true`, `suggestedOrder` = ordem do otimizador.
  - Capturas: `pr03-salvo-61min-vs-suggested.jpg`, `pr03-apos-recarregar-61min.jpg`.
- **Ponto (a) — FALHOU.**
  - Passos: com a ordem manual salva (+61 min), troquei o ponto de partida do dia (Start this day from: George Street 200, Sydney NSW 2000). Isso dispara um recálculo automático que mantém a ordem (`lastTrigger = ORIGIN_CHANGE`, PRESERVE_ORDER, mesmo conjunto de paradas).
  - Esperado: continuar mostrando a diferença para a sugestão do otimizador.
  - Obtido: "Finish ~2:46 pm · **Same finish time as suggested**", e na API `suggestedOrder` passou a ser a própria ordem manual (INS-0100, INS-0102, INS-0101).
  - Causa no código: `compute-day-plan.use-case.ts` preserva a sugestão só em FIXED_ORDER; em PRESERVE_ORDER usa `result.optimizedOrder ?? result.order`, e `optimizedOrder` é nulo nesse modo. Exatamente o risco apontado na leitura do diff.
  - Captura: `pr03-a-apos-troca-origem-same-finish.jpg`.
  - Desfeito depois: "Use my base address" + "Reset to suggested order" (ver PR-13).

### PR-09 — número da rua no endereço-base (D-04 / 00.A5) e filiais — PASSOU
- Detalhe do inspetor Mike: Base Address = "**1 Martin Place**, Sydney NSW 2000, AU". Captura: `pr09-base-inspetor-com-numero.jpg`.
- Filiais (Sydney Property Services › Branches):
  - Antes: as três filiais tinham o número dentro de `street` → lista sem mudança ("100 George St…", "45 Pacific Hwy…"). Captura: `pr09-lista-filiais.jpg`.
  - Endereço verificado escolhido na tela para a filial inativa → "200 George Street, Sydney NSW 2000, AU", sem duplicar. Captura: `pr09-filial-endereco-verificado-sem-duplicar.jpg`.
  - **Número em campo separado.** Pela tela não dá para gravar assim: o formulário não tem campo Número e a busca grava o número dentro de `street`. Gravei pela API, na filial inativa: `{street:"George Street", number:"200"}`. Lista: "**200 George Street**, Sydney NSW 2000, AU", sem duplicar. Captura: `pr09-filial-numero-separado-lista.jpg`.
  - Detalhe (gaveta "Edit Branch"): ver observação O-2. Captura: `pr09-filial-numero-separado-gaveta-sem-numero.jpg`.

### PR-13 — rotas de leitura/recálculo/folha da operação removidas — PASSOU
- **Live Day abre normal:** contadores, lista, mapa, detalhe do inspetor. Captura: `pr13-live-day-abre.jpg`.
- **Folha de rota do inspetor:** menu Download (PDF / Spreadsheet (XLSX)). Captura: `pr13-folha-rota-menu.jpg`.
  - Não baixei arquivo pelo navegador. Chamei o mesmo endpoint do app como inspetor: PDF **200** `application/pdf` (1 página) e XLSX **200**.
- **"Today's route" recalcula:** "Reset to suggested order" → confirmação → ordem do otimizador, "57 min driving · Finish 1:45 pm". Captura: `pr13-recalcular-reset-ok.jpg`.
- **Rotas de AM/OP removidas:** GET `/v1/day-plans/:inspectorId/:date`, GET `…/sheet` e POST `…/recalculate` como OP → **404**.

### PR-10 — mensagem para tipo ou tamanho recusado (D-08) — PASSOU
- **Status que o armazenamento devolve** (PUT direto na URL assinada, imóvel SPS-007):
  - PDF → **415** `InvalidMimeType` ("mime type application/pdf is not supported").
  - JPEG de 55 MB → **413** `EntityTooLarge`.
  - JPEG de 9 MB e de 15 MB → 200. O limite do bucket está acima de 15 MB; o 413 apareceu com 55 MB, o que bate com o limite padrão de 50 MB do Supabase.
- **Na tela** (OP, Property › Files › Documents › Upload), com o registro de rede da página:
  - PDF → PUT **415** → aviso "**This file type isn't accepted.**" Capturas: `pr10-pdf-415-tipo-nao-aceito.jpg`, `pr10-pdf-tipo-nao-aceito-full.jpg`.
  - Arquivo de 55 MB (gerado na página e entregue ao campo de arquivo) → PUT **413** → aviso "**This file is too large.**" Captura: `pr10-55mb-413-muito-grande.jpg`.
- Ver observação O-3: a aplicação não barrou os 55 MB apesar do limite de 20 MB nas configurações.

### PR-04 — "Minimum services to be ranked" no texto dos desafios (D-07 / 03.A3) — PASSOU / NÃO DEU (parte)
- **Configuração:** continua 1, como pedido; não voltei para 10. `GET /v1/inspector/program` → `standing.index.minimumVolume = 1`.
- **"My results" (Mike) — PASSOU:** "RELIABILITY INDEX 87.5 — Based on your last 30 days. You need **1 job** for a score." Captura: `pr04-my-results-1-job.jpg`.
- **Texto do Ranking — NÃO DEU PARA TESTAR:**
  - O texto esperado é "You'll appear once you have 1 job in the last 30 days."
  - Ele só aparece quando `myPosition = null`. Mike e Lisa, os inspetores com login conhecido, estão ranqueados.
  - O Ranking do Mike mostra "Your score: 87.5 — The ranking appears once at least 5 inspectors have a score." Captura: `pr04-ranking-mike-ranqueado.jpg`.
  - Para ver o texto falta um inspetor ativo sem serviço nos últimos 30 dias e com senha conhecida. O "Carlos Mendez QA" serve, mas a senha não está na nota de acessos.
- Fora do critério, ver O-4: "Complete 1 inspections" no cartão do desafio. Captura: `pr04-active-complete-1-inspections.jpg`.

### PR-11 — texto contraditório no portal depois de "Can't do" (D-10) — PASSOU
- **Passos:**
  - Gerei o token do portal do INS-0115 como OP (`notify:false`, `dispatched=false`, nada enviado).
  - Mike, no app: Can't do this job › "I can't attend" › Send to operations ("This job has been removed from your route"). O agendamento foi para REJECTED.
  - Abri `/portal/<token>`. A janela 09:30 do mesmo dia já estava aberta, então o prazo de reagendamento tinha passado.
- **Obtido:**
  - Aparece só "This inspection **will not go ahead** as scheduled. The agency will contact you to arrange a new time.".
  - Não aparece mais "…You can still report that you cannot attend, or change to another available time."
  - Não há controle de troca de horário.
- **Captura:** `pr11-portal-apos-cant-do.jpg`.

### PR-12 — uma só versão do app (D-03) — PASSOU
- More (rodapé): "Properfy Inspector **v0.1.0+dev**". App settings: "Properfy Inspector **v0.1.0+dev**". As duas iguais; antes o More mostrava "v1.0".
- O "+dev" no lugar do identificador do build é o diagnóstico separado do D-03 e não faz parte deste PR.
- **Capturas:** `pr12-more-rodape-versao.jpg`, `pr12-app-settings-versao.jpg`.

### PR-05 — base do "não iniciado" e do atraso no horário atual da parada (D-12) — PASSOU, com o #1389
A ressalva (d) deixou de valer pelo #1389. Os dois casos rodaram em v118 (#1389), com limite do Mike de 5 min ("custom").

**Caso (1) — parada remarcada — PASSOU.**
- **Passos:** INS-0102 estava no plano publicado às 13:00–14:00. Pela tela, remarquei para 08:50–09:05. O formulário recusa horário no passado, então usei um horário logo à frente, como no teste original. Reconfirmei como OP.
- **Alerta:** "INS-0102 not started — due at **8:50 am**" nasceu às 08:55 (= 08:50 + 5 min; API `occurredAt 21:55Z`). Antes do PR ficaria preso no horário publicado.
- **Atraso:** check-in às 09:45 → "Running **55 min** late (limit 5 min, custom)" (API DELAY 55 = 09:45 − 08:50), além de "Checked in outside the window for INS-0102 (40 min off, tolerance 15 min)".
- **Capturas:** `pr05-caso1-nao-iniciado-horario-novo.jpg`, `pr05-caso1-atraso-55min-horario-novo.jpg`.

**Caso (2) — várias paradas na mesma janela larga — PASSOU.**
- **Passos:**
  - Criei INS-0114 e INS-0115, com contatos fictícios smoke.wide6/7, janela **09:30–17:00** de 25/11.
  - Grupo 27, atribuído ao Mike e confirmado.
  - O plano recalculou com INS-0114 previsto para **10:32** e INS-0115 para **11:22**, junto com INS-0102. Captura: `pr05-dia-janela-larga-plano.jpg`.
- **Obtido:**
  - Às 09:41 (janela aberta havia 11 min, acima do limite de 5): nenhum NOT_STARTED nem atraso para INS-0114/0115. A API só tinha o NOT_STARTED do INS-0102 e o GEOFENCE do INS-0101.
  - Na tela, as duas aparecem só com "ETA 11:17 am / 12:07 pm" (ETAs recalculados).
  - Antes do #1389, o alerta dispararia às 09:35 contra o início da janela.
- **Captura:** `pr05-caso2-janela-larga-sem-alerta-0941.jpg`.

### PR-15 — login de inspetor no web (E-5) — PASSOU
- **Sessão de inspetor já existente (eu):** com tokens de inspetor no navegador, abrir o web leva a `/login`, apaga os tokens e mostra o alerta "Your account doesn't have access to this website. Inspectors use the Properfy app." e o modal "Inspectors use the Properfy app".
  - "Open the app" = link `https://pwa-properfy.pedroalvs.com`.
  - Fechar no X tira modal e alerta.
  - Captura: `pr15-sessao-inspetor-descartada.jpg`.
- **Login pelo formulário — verificado pelo coordenador** (navegador isolado, insp@pedroalvs.com; eu não digito senha):
  - Não abre sessão; localStorage e sessionStorage ficam vazios.
  - Mostra alerta + modal com o texto aprovado.
  - "Open the app" → `https://pwa-properfy.pedroalvs.com/` (responde 200).
  - Fechar no X volta ao login com e-mail e senha vazios.
- **AM, OP e CL_ADMIN** entram no Dashboard normalmente. Nenhum item "Marketplace" no menu (AM 31 links, OP 29, CL 9). Capturas: `pr15-op-entra-sem-marketplace.jpg`, `pr15-cl-entra-sem-marketplace.jpg`.

### PR-06 — aviso "Your route for tomorrow is ready" (D-13) — PASSOU (parte 1) / NÃO DEU (parte 2)
- **Parte 1 — dia sem plano não gera aviso — PASSOU.**
  - Lisa abriu o "Today" de 25/11, um dia sem plano. Isso criou na hora um plano PUBLISHED de 0 paradas (21:21:45Z), exatamente o caminho do D-13, e **nenhum aviso** foi criado. O último aviso dela continua o de 24/11 01:17Z.
  - Mike abriu `/today/route/2026-11-26` e `/2026-11-27`: "Your route for this day isn't ready yet…", sem aviso novo.
  - Capturas: `pr06-lisa-today-sem-plano.jpg`, `pr06-dia-sem-plano-27-11.jpg`.
- **Parte 2 — a publicação das 19:30 avisa uma vez — NÃO DEU PARA TESTAR hoje.**
  - A publicação de 25/11 rodou em 24/11 08:30Z, antes do deploy do PR-06 (20:23Z).
  - A próxima é hoje às **19:30 de Sydney = 25/11 08:30Z (05:30 BRT)**.
  - Dado preparado: o Mike aceitou pela tela a oferta do grupo 24 (INS-0104, 26/11, contatos fictícios), confirmada como OP.
  - Conferir na segunda perna: `GET /v1/inspectors/me/notices` do Mike deve ter **um** "Your route for tomorrow is ready" para Thu 26 Nov, criado logo depois de 08:30Z, e nenhum outro depois.

### PR-08 — coordenada do inspetor fora da auditoria de execução (D-09 / § 7.9) — PASSOU
- **Passos:** em v117 (#1388 no ar):
  - INS-0100: check-in e check-out com GPS no imóvel.
  - INS-0101: check-in e check-out a 1012 m do imóvel, o que gera duas divergências de localização (START e FINISH).
- **API `/v1/audit-logs`, como OP e como CL:**
  - `inspection.started`, `inspection.finished` e `inspection.geolocation_mismatch` (FINISH) não têm nenhuma chave de latitude/longitude.
  - `geolocation_mismatch` (START) traz só `propertyLatitude`/`propertyLongitude`: valor real para OP, `"[MASKED]"` para CL.
  - Ficam distância, precisão, raio e flags.
- **Tela (AM):**
  - Linha do tempo do INS-0100 e do INS-0101 ("Location Mismatch", "Inspection Started/Finished") sem coordenada do inspetor. Busquei no texto da página: nada.
  - "Field activity": "Distance at check-in: 0 m (accuracy ±12 m)…".
- **Capturas:** `pr08-field-activity-distancia.jpg`, `pr08-timeline-divergencia-sem-coordenada.jpg`.

## Pendentes por data do relatório de 23/11

| # | Resultado | Evidência |
|---|---|---|
| P1 — snapshot / F07-a / F08-c / F08-d,e,f | **PASSOU** (F08-c: posição não mostrada, por regra) | Ver detalhes abaixo da tabela |
| P2 — aviso da manhã ao inquilino | **PASSOU** (até o provedor) | `TENANT_ETA_MORNING` às 07:00 de Sydney (24/11 20:00:08Z) para INS-0100/0101/0102. EMAIL **SENT** (smoke.tenant10 / tom2 / tom3 @example.invalid). SMS aceito pelo provedor (`sentAt` 20:00:13Z) e depois **FAILED**, "Provider mobile-message reported: failed" — esperado para números fictícios da ACMA, que o Pedro aceita como retorno da API. Captura: `p2-aviso-manha-ins0100.jpg` |
| P3 — prêmios e bônus F08-a/b | **NÃO DEU PARA TESTAR** (data) | Vence **30/11 a partir de 04:45 Sydney (29/11 15:45 BRT)**, no job `inspector-program.daily`. Passos inalterados no relatório de 23/11. Hoje o desafio "Smoke weekly volume" mostra "4 of 1 · Target reached" para o Mike |
| P4 — trocar o ponto de partida | **PASSOU** | Mike, antes do primeiro check-in: "Start this day from" → George Street 200 → "Starting from: Sydney NSW 2000 (this day only)" + "Use my base address". O plano recalculou (`lastTrigger ORIGIN_CHANGE`, 43 → 45 min dirigindo, origem OVERRIDE). Voltei para a base. Ver O-1 (rótulo) e PR-03 (a) |

**Detalhes do P1:**
1. **F07-a.** Inspector performance foi atualizado em 25/11 às 04:15 (janela 26/10–24/11). Lisa 90,0 Gold, 1 serviço; Mike 87,5 Gold, 4 serviços; Carlos em "Not enough data · 0 of 1 services". Captura: `p1-inspector-performance.jpg`.
2. **Ajuste de nível.** "Gold from" 85 → **89**. Mike ficou SILVER e Lisa GOLD. Captura: `p1-gold-from-89.jpg`.
3. **Oferta.** Grupo **26** com INS-0105/0106 (27/11, All australia), criado e **publicado** pela tela às 21:43Z.
4. **F08-d — PASSOU.** Offers do Mike: "0 available offers". Captura: `p1-f08d-mike-silver-sem-oferta.jpg`.
5. **F08-e — PASSOU.** Lisa vê o grupo 26 e aceita: "You accepted the group!". Capturas: `p1-f08e-lisa-gold-ve-oferta.jpg`, `p1-f08e-lisa-aceitou.jpg`.
6. **F08-f — PASSOU, pela API.** O app não tem link direto para uma oferta escondida, e o detalhe responde 404. No aceite, o Mike recebe 403 `OFFER_EARLY_ACCESS_ONLY` "This offer opens to all inspectors on Wed 25 Nov at 8:43 pm." (publicação + 12 h).
7. **Janela reduzida — PASSOU.** "Early access window" 12 → **1 h** → a mensagem passou a "…at 9:43 am". Às 22:44Z a oferta 26 apareceu para o Mike. Captura: `p1-janela-1h.jpg`.
8. **Restauração.** Gold 85 e janela 12 h. Captura: `p1-config-restaurada.jpg`.
9. **F08-c — NÃO DEU (por regra).** O app mostra "Your score: 87.5 — The ranking appears once at least 5 inspectors have a score". DEV tem só 2 inspetores com nota.

## Observações fora dos critérios (não contadas como defeito destes PRs)

- **O-1 — Rótulo da origem do dia sem a rua.** Depois de "Start this day from: George Street 200, Sydney NSW 2000" o app mostra "Starting from: **Sydney NSW 2000** (this day only)". A API guarda `origin.label = "Sydney NSW 2000"`, sem rua e número.
- **O-2 — Gaveta "Edit Branch" esconde o número separado.** Com `number` em campo separado, a lista mostra "200 George Street…", mas a gaveta mostra "George Street, Sydney NSW 2000, AU" e não tem campo Número. Salvar por ela apagaria o número. Só acontece com dado gravado pela API ou importação.
- **O-3 — Limite de tamanho da aplicação (20 MB) não é aplicado no envio pelo web.**
  - O web aceitou um arquivo de 55 MB e foi até o armazenamento, que barrou com 413.
  - O presign aceitou `sizeBytes = 25 000 000` (acima de 20 MB) sem erro.
  - O limite efetivo hoje é o do bucket, cerca de 50 MB.
- **O-4 — Plural.**
  - Cartão do desafio no app: "Complete **1 inspections**".
  - Inspector performance no web: "Inspectors with fewer than **1 services**…" e "0 of **1 services**".
  - Mesma família do D-07, em telas que o PR-04 não cobre.
- **O-5 — Live Day: cabeçalho "On time" com a próxima parada já atrasada.** Antes do check-in do INS-0102, o cabeçalho do Mike dizia "2 of 5 done · On time" com a parada prevista para 10:08 contra janela 08:50–09:05. O atraso acumulado só conta paradas iniciadas (`delayMinutes −178`); o "não iniciado" cobria o caso. Registro para o Pedro, sem classificar.
- **O-6 — ETA velha no app.** Às 09:45 o cartão "Next inspection" do app mostrava "ETA 9:23 am" para o INS-0102. O Live Day mostrava "ETA 10:08 am".
- **O-7 — Arquivos órfãos do teste do PR-10.** As sondagens deixaram registros PENDING (não confirmados) no imóvel SPS-007, e dois objetos de 9 MB e 15 MB no bucket. A limpeza de pendentes do F10 deve tratar.

## Alterações feitas em DEV neste reteste (com valor anterior)

| O quê | Antes | Depois |
|---|---|---|
| Plano do Mike de 25/11 | ordem do otimizador, origem BASE | ordem manual salva → origem OVERRIDE (George St 200) → volta à base → "Reset to suggested order" (ordem do otimizador); recalculado depois com as paradas novas |
| INS-0100, INS-0101 (Mike, 25/11) | SCHEDULED | check-in/check-out → DONE pendente de conferência (INS-0101 a 1012 m) |
| INS-0102 | 13:00–14:00, confirmado | **08:50–09:05** (o grupo 22 pode ter alargado a janela), reconfirmado (OP), check-in 09:45 / "Complete anyway" → DONE pendente de conferência |
| INS-0104 (grupo 24, 26/11) | AWAITING_INSPECTOR, confirmação nula | aceito pelo Mike + confirmação forçada (OP) — preparação da parte 2 do PR-06 |
| INS-0114, INS-0115 + grupo 27 | — | criados (contatos smoke.wide6/7 @example.invalid, +61491570156/157), 25/11 09:30–17:00, atribuídos ao Mike, confirmados; INS-0115 → "Can't do" → REJECTED; token de portal do INS-0115 gerado sem envio |
| Grupo 26 (INS-0105/0106, 27/11) | INS-0105/0106 em DRAFT, sem grupo | grupo criado (All australia), publicado, aceito pela Lisa |
| Plano da Lisa de 25/11 | inexistente | criado ao abrir o Today (0 paradas) |
| Filial "Inactive Branch" (inativa) | endereço nulo | `{street:"George Street", number:"200", suburb/city:"Sydney", NSW 2000, AU}` (gravado pela API; antes pela tela "200 George Street") |
| Platform settings › Inspector program | Gold 85, janela 12 h | 89 / 1 h durante o P1 → **restaurado** 85 / 12 h |
| Platform settings › Reliability index "Minimum services to be ranked" | 1 | **1 (mantido, como pedido)** |
| Imóvel SPS-007 › Files | — | registros PENDING das sondagens (O-7); nenhum arquivo confirmado |

**Mensagens disparadas, todas para contatos fictícios ou internos:**
- INSPECTION_RESCHEDULED (INS-0102).
- Pesquisa de satisfação (INS-0100/0101/0102).
- Avisos de criação/agendamento dos INS-0105/0106/0114/0115.
- Alerta de "Can't do" para AM/OP.
- Avisos de chegada ao inquilino do motor F06, se a varredura pegou.
- Nenhum envio para contato real.

**Capturas:** 42 arquivos em `output/smoke-dev/reteste/`.

## Roteiro da segunda perna (registrado, não executado)

Aguardar o coordenador disparar. Itens já combinados:

1. **PR-06 parte 2.** Depois de 25/11 08:30Z, `GET /v1/inspectors/me/notices` do Mike deve ter **um** "Your route for tomorrow is ready" para Thu 26 Nov.
2. **P3.** Depois de 30/11 04:45 Sydney.
3. **PR-04, texto do Ranking.** Precisa de um inspetor não ranqueado com senha conhecida.
4. **Envio REAL de arquivo fim a fim em DEV.** Pedido de 24/11: o bucket `inspection-assets` foi configurado no S3 de DEV. Usar só arquivos fictícios: imagem e PDF pequenos.
   - Web › Files do **imóvel** e do **agendamento**:
     - upload de imagem e de PDF;
     - baixar;
     - nova versão;
     - apagar.
   - Web: criar issue com foto.
   - App do inspetor: "Report issue" com foto.
   - Portal do inquilino: "reportar problema" com foto, usando token sem envio e contato fictício.
   - Em cada passo, anotar o status HTTP do presign, do PUT no armazenamento e do confirm. Anotar também qualquer 503, "file storage unavailable" ou erro de bucket.
5. Ao terminar, limpar ou anotar os arquivos de teste. Rever também os PENDING órfãos do O-7.

## Segunda perna — 25/11/2026 (03:17–04:02 UTC)

DEV em `e3cdb956` (#1402). Executor: Batedor, pelo navegador. Capturas em `output/smoke-dev/reteste2/`, fora do commit. Contatos todos fictícios (`@example.invalid`, `+614915701xx`).

### Resumo

| Item | PR | Resultado |
|---|---|---|
| 1 | PR-14 #1391 | PASSOU |
| 2 | PR-16 #1392 | PASSOU (CL_ADMIN sem acesso: ver nota) |
| 3 | PR-17 #1393 | PASSOU, com observação O-8 |
| 4 | PR-18 #1390 / PR-18b #1394 | PASSOU, depois que o bucket `s3_app` foi criado (antes: 500) |
| 5 | PR-03 correção #1395 | PASSOU |
| 6 | V-1 #1396 (imóvel) | **FALHOU** em um ponto (cadastro antigo com falha não salva outros campos); demais pontos passaram |
| 7 | V-2 #1400 (filial) | PASSOU, com observação O-9 |
| 8 | V-3 #1402 (base do inspetor) | PASSOU na edição (web e app); criação no web NÃO DEU PARA TESTAR (exige digitar senha) |
| 9 | V-4 #1399 (ponto de partida) | PASSOU nos casos inventado, bom, rótulo e "Use my base address"; **rua sem número em área rural foi ACEITA** (ver nota) |
| 10 | Arquivos fim a fim | PASSOU (nenhum 503 nem erro de bucket em `inspection-assets`) |
| 11 | Datas | PR-06 parte 2: pendente, conferir depois de 25/11 08:30 UTC. P3: só em 30/11 |

### 1. PR-14 — Consent Lookup sem "Record opt-out" — PASSOU

- OP: tela de Consent Lookup sem o botão "Record opt-out", buscando nas duas agências (`pr14-pr16-op-melbourne-sem-record-optout.jpg`).
- `POST /v1/notifications/consents/opt-out` → **404** "Route … not found" (03:18 UTC).
- Limite: nenhum destinatário com registro de consentimento em DEV, então a tabela veio vazia ("No consent records for this recipient."). A ausência do botão vale para a tela inteira.

### 2. PR-16 — Consent Lookup por agência — PASSOU

- Item "Consent Lookup" em Configuration, logo depois de "Notification Templates", para OP (`pr16-op-sem-agencia-search-desabilitado-menu.png`) e AM (`pr16-am-menu-e-tela.jpg`).
- Sem agência escolhida, "Search" fica desabilitado. Pela API, sem `tenantId` → 400 "tenantId is required: choose an agency to look up" (OP e AM).
- OP buscou em Sydney Property Services e em Melbourne Real Estate, as duas responderam.
- **CL_ADMIN:** o pedido dizia "CL_ADMIN vê só a própria". Em DEV, CL_ADMIN não tem acesso à tela: ao abrir `/notification-consents` volta ao Dashboard com o aviso "You do not have permission to access this page"; a API responde 403 "Role CL_ADMIN is not permitted to perform consent.list". Isso bate com o que o plano registra para o #1392 ("rota segue AM/OP"). Conto como PASSOU; se a expectativa é CL_ADMIN ver a própria agência, é escopo novo.

### 3. PR-17 — formulário da agência — PASSOU

- "Edit Agency" (Melbourne) sem "priorityOfferHours" nem "inspectorOfferRadiusKm". Salvar trocando o Legal Name → "Agency updated successfully" (`pr17-melbourne-salvo.jpg`). Revertido pela API.
- Registro antigo com a chave: gravei `priorityOfferHours: 4` pela API (ver O-8), abri e salvei pela tela de novo → salvou normal (`pr17-melbourne-com-chave-antiga-salvo.jpg`).

### 4. PR-18 / PR-18b — importação com endereço ruim — PASSOU

- **Primeira tentativa (03:24–03:25 UTC): FALHOU por ambiente.** Preview → 500. Log: `NoSuchBucket` "Bucket not found", recurso `s3_app/imports/appointments/<id>/import-endereco-ruim.xlsx`, em `SupabaseReportStorageService.upload` (`pr18-importacao-preview-500-bucket.jpg`). Avisado o coordenador.
- **Depois do bucket criado (03:37–03:40 UTC):** planilha com uma linha inventada ("995 Zzyzxqua Gardens, Plmkoville NSW 2998") e uma boa ("5 Martin Place, Sydney NSW 2000").
  - Preview: 2 importáveis, 0 erros. Linha ruim com "New property · Failed" e o aviso "Address was not found by geocoding — the property will be created but flagged for manual location"; linha boa "Success" (`pr18-preview-linha-ruim-nao-bloqueia.jpg`).
  - Confirmação: "Import completed", 2 de 2 (`pr18-importacao-concluida-2-de-2.jpg`). INS-0116/INS-0117 em DRAFT; PROP-0020 FAILED sem coordenada; PROP-0021 SUCCESS.
  - Corrigível depois: PROP-0020 abre com a faixa amarela; com latitude/longitude manuais salvou como MANUAL (`pr18-prop0020-faixa-amarela.jpg`, `pr18-prop0020-corrigido-manual.jpg`).
- Primeira tentativa depois do bucket casou com imóveis que eu tinha criado no V-1 (PROP-0017/0018) e a data em texto "03/12/2026" virou "today (defaulted)". Refeito com endereços novos e data como data de planilha.

### 5. PR-03 correção — PASSOU

Dia montado para a Lisa (sem base): 3 paradas, INS-0118/0119/0120, 25/11 16:00–18:30.

1. Origem "200 George Street, Sydney NSW 2000" → sugestão 5 Martin Pl → 88 Crown St → 33 Glebe Point Rd, término 6:35 pm.
2. Ordem manual pior salva → "Finish ~6:42 pm · +7 min vs. suggested" (`pr03-ordem-manual-salva-mais7.jpg`).
3. **Troca de origem** para "50 Glebe Point Road, Glebe NSW 2037" → ordem manual mantida, "**+15 min vs. suggested**"; a sugestão gravada passou a ser 0118 → 0120 → 0119, a ótima a partir de Glebe (`pr03-apos-troca-origem-mais15.jpg`). O "Same finish time as suggested" da primeira perna não voltou.
4. "Reset to suggested order" → confirma → "Route reset to the suggested order.", ordem 33 Glebe → 5 Martin → 88 Crown, término 6:31 pm (`pr03-reset-ordem-sugerida.jpg`).

### 6. V-1 — imóvel — FALHOU (um ponto)

| Ponto | Resultado | Evidência |
|---|---|---|
| Endereço inventado bloqueia com o motivo e marca os campos | PASSOU: "This address doesn't match a known address closely enough. Check the street, number, suburb and postcode."; Street, Suburb, Postcode e State marcados; botão "Set location manually" | `v1-imovel-inventado-bloqueado.png` |
| Corrigir limpa o erro | PASSOU: ao editar a rua, o bloco e as marcas somem | `v1-editar-limpa-erro.jpg` |
| "Set location manually" salva como manual | PASSOU: PROP-0017 criado, Geocoding "Manual" (-33.4521, 150.6612) | `v1-manual-salvo-prop0017.jpg` |
| Endereço bom salva com pino, sem "Geocoding in progress." | PASSOU: PROP-0018 (1 Martin Place), "Success" e mapa com pino logo ao abrir | `v1-endereco-bom-pino-success-prop0018.jpg` |
| Cadastro antigo com falha abre com a faixa amarela | PASSOU: "This address couldn't be located. Update it or set the location manually." | `v1-cadastro-antigo-faixa-amarela.jpg` |
| **… e salva outros campos** | **FALHOU** | `v1-cadastro-antigo-salvar-notes-422.jpg` |
| Mesmo fluxo pelo imóvel criado dentro do agendamento | PASSOU: inventado bloqueado com o mesmo bloco; 2 Martin Place criou PROP-0019 (SUCCESS) e já veio selecionado no agendamento (agendamento não criado, cancelei) | `v1-agendamento-imovel-inventado-bloqueado.jpg`, `v1-agendamento-imovel-bom-prop0019.jpg` |

**Falha — passo a passo:**
1. Abrir IMP-D3CE99EF20 (9a Carrington St, Bexley, FAILED) e clicar no lápis.
2. Sem tocar no endereço, escrever em Notes e salvar.
3. Resultado: bloco vermelho "This address doesn't match a known address closely enough." e campos marcados; `PATCH /v1/properties/:id` → **422** `ADDRESS_NOT_VERIFIED` (`LOW_RELEVANCE`). Nada salvo.

Reproduzido pela API:
- PATCH só com `notes` → 200.
- PATCH com o endereço **idêntico** ao gravado + notes → 422, em IMP-D3CE99EF20 e em SPS-006 (14 Miller St, Chatswood, FAILED).

**Causa:** `update-property.use-case.ts` considera "endereço alterado" qualquer campo de endereço presente no corpo (`ADDRESS_FIELDS.some(field => data[field] !== undefined)`), sem comparar com o valor gravado. A gaveta sempre reenvia o endereço. Efeitos:
- imóvel antigo com falha não salva nenhum outro campo pela tela;
- toda edição de imóvel pela tela consulta o geocodificador de novo, inclusive em imóvel SUCCESS.

O V-2 e o V-3 já comparam com o gravado ("endereço igual … salva sem erro"); o V-1 não.

### 7. V-2 — filial — PASSOU

- **Criação** ("QA Branch V2"): a filial só aceita endereço vindo de uma sugestão; escolhi "3 Martin Place" e troquei Street/Number/Suburb/Postcode por inventados. Recusada com o mesmo bloco; Street, **Number**, Suburb, Postcode e State marcados; sem botão de pino (`v2-criacao-filial-inventada-recusada.jpg`). Descartada, nada criado.
- **Edição** (Inactive Branch): campo Number preenchido com 200 e rótulo da busca "200 George Street, Sydney NSW 2000, AU" (`v2-edicao-number-preenchido.jpg`). Trocar rua e subúrbio por inventados → recusada, campos marcados (`v2-edicao-filial-inventada-recusada.jpg`).
- **Corrigir salva e o Number não some:** voltei ao endereço original, troquei o nome e salvei → "Branch updated successfully"; `addressJson.number` continua "200" (`v2-corrigido-salvo-number-mantido.jpg`).
- **Filial antiga sem localização** (North Shore Office, sem coordenada): troca de nome salvou e a lista mantém "45 Pacific Hwy, North Sydney NSW 2060" (`v2-filial-antiga-troca-nome-salva.jpg`). Ver O-9.
- Nomes revertidos pela API.

### 8. V-3 — base do inspetor — PASSOU (edição) / NÃO DEU (criação)

- **Web, criação: NÃO DEU PARA TESTAR.** O formulário "New Inspector" exige Password e Confirm Password, e eu não digito senhas. Precisa de alguém para preencher a senha, ou de um caminho de teste combinado.
- **Web, edição** (Carlos Mendez QA): base inventada → ao salvar, a gaveta rolou até o bloco "This address doesn't match a known address closely enough." no topo de Base Address; Street, **Unit / Number**, Suburb, City e State marcados (`v3-web-base-inventada-recusada-rolou.jpg`). Descartado.
- **Web, inspetor antigo sem base localizada** (Carlos, sem base): troca só do telefone → "Inspector updated successfully" (`v3-web-inspetor-sem-base-troca-telefone-salva.jpg`). Telefone revertido pela API.
- **App, perfil** (Mike › My account › Base address):
  - base inventada → bloco "This address doesn't match a known address closely enough. / Check the street, number, suburb and postcode." acima de "Save address" (`v3-app-base-inventada-recusada.jpg`); log: 422, `low_relevance`, relevância 0,55; nada gravado.
  - base boa (2 Martin Place) → "Saved successfully" (`v3-app-base-boa-salva.jpg`); depois voltei para 1 Martin Place (valor original).
  - Ver O-10: na primeira tentativa o app rodava o pacote antigo do cache e não mostrou mensagem nenhuma.

### 9. V-4 — ponto de partida do dia — PASSOU, com um caso a decidir

Dia da Lisa (o dia do Mike já começou, origem presa na última parada).

| Caso | Resultado | Evidência |
|---|---|---|
| Origem inventada (997 Zzyzxqua Fakestreet, Qwertyvale NSW 2999) | Recusada: "This address doesn't match a known address closely enough. Check the street, number, suburb and postcode."; origem não mudou | `v4-origem-inventada-recusada.jpg` |
| Só subúrbio (Chatswood NSW 2067, sem rua) | A tela não envia: "Street is required" | `v4-so-suburbio-rua-obrigatoria.jpg` |
| **Rua sem número em área rural** (Bylong Valley Way, Bylong NSW 2849) | **ACEITA** às 03:49 UTC: "Route updated. Starting from Bylong Valley Way, Bylong NSW 2849 for this day.", ponto -32.348206, 150.183032, rota de 345 km | `v4-rua-sem-numero-rural-aceita.jpg` |
| Origem boa (200 George Street, Sydney NSW 2000) | Rota recalculou; "Starting from: 200 George Street, Sydney NSW 2000 (this day only)" | `v4-origem-boa-recalculou-rotulo-numero.jpg` |
| "Use my base address" | "Route updated. Starting from your base address."; Lisa não tem base, voltou ao aviso "No base address" | `v4-use-my-base-volta.jpg` |

**Rua sem número:** o coordenador esperava recusa. `classifyGeocodingResult` aceita qualquer resultado `placeType === 'address'` com relevância ≥ 0,8, e o Mapbox devolve uma rua sem número como `address`. Esse resultado depende da decisão pendente sobre exigir número de casa (roteiro final, linha "sem número"). Não conto como falha do V-4 até a decisão. A hora foi anotada por causa do PR do limiar 0,8 → 0,7.

### 10. Arquivos reais fim a fim — PASSOU

Bucket `inspection-assets`. Cada envio fez presign → PUT no armazenamento → confirm; todos os PUT deram 200 e os arquivos ficaram READY. No log não apareceu 5xx, `NoSuchBucket` nem "file storage unavailable" entre 03:52 e 04:00 UTC.

| Onde | Passo | Resultado | Evidência |
|---|---|---|---|
| Web › imóvel PROP-0018 › Files | PDF em Documents | "File uploaded"; READY | `arq-web-imovel-pdf-enviado.jpg` |
| | Imagem em Other | "File uploaded"; READY | `arq-web-imovel-imagem-enviada.jpg` |
| | Abrir/baixar o PDF | abriu em aba nova pela URL assinada do bucket (`…/inspection-assets/files/…/e0d38a33….pdf`); sem salvar em disco | — |
| | Nova versão | "New version uploaded", selo v2 | `arq-web-imovel-nova-versao-v2.jpg` |
| | Apagar | "File deleted" | `arq-web-imovel-apagado.jpg` |
| | Issue com foto | "Issue reported", com 1 foto | `arq-web-issue-com-foto.jpg` |
| Web › agendamento INS-0118 › Files | PDF, imagem, nova versão, apagar | os quatro funcionaram | `arq-web-agendamento-pdf.jpg`, `arq-web-agendamento-nova-versao.jpg`, `arq-web-agendamento-apagar-v2-volta-v1.jpg` |
| App (Lisa) › INS-0118 | "Report issue" com foto | issue "Inspector" com "Photo 1" | `arq-app-report-issue-com-foto.jpg` |
| Portal do inquilino (INS-0119, link gerado sem envio) | "Report a problem" com foto | "Thanks — your report has been sent to the team."; aparece em "Your reports" | `arq-portal-problema-com-foto.jpg` |

- Apagar um arquivo com duas versões remove só a última, e a v1 volta à lista. Comportamento igual ao do smoke de 23/11. Apaguei a v1 também.
- A aba do PDF aberto ficou no navegador: a extensão não fecha abas do domínio do armazenamento.

### 11. Itens com data

- **PR-06 parte 2:** pendente. Conferir depois de 25/11 08:30 UTC (19:30 Sydney) que o Mike recebeu **um** "Your route for tomorrow is ready" para Thu 26 Nov (INS-0104).
- **P3:** pendente até 30/11, depois de 04:45 Sydney.
- **PR-04 (texto do Ranking):** continua sem inspetor fora do ranking com senha conhecida.

### Observações novas (fora dos critérios)

- **O-8 — Agência aceita gravar a chave removida.** `PATCH /v1/tenants/:id` com `settings.priorityOfferHours: 4` respondeu 200 e gravou a chave em `settingsJson`: o schema de configurações da agência não recusa chave desconhecida. Ninguém lê a chave. Não consigo removê-la pela API; ficou `priorityOfferHours: null` em Melbourne Real Estate. Além disso, o primeiro save pela tela gravou os valores-padrão explícitos (`mapWindowDays: 14`, os três `…Enabled: true`) onde antes havia `{}`.
- **O-9 — Gaveta da filial antiga mostra o endereço vazio.** North Shore Office (endereço sem número separado e sem coordenada) abre "Edit Branch" com Address em branco, embora a lista mostre "45 Pacific Hwy…". Salvar só o nome manteve o endereço. Mas quem preencher a busca achando que não há endereço vai trocá-lo.
- **O-10 — App preso no pacote antigo.** No perfil do Mike o app rodava `index-LIvp4cUz.js` vindo do cache do service worker, enquanto o servidor já servia `index-BpJi1aGa.js`. Com o pacote antigo, a base inventada era recusada pelo servidor (422) sem nenhuma mensagem na tela. Só depois de desregistrar o service worker e recarregar apareceu o bloco novo. Inspetores com o app aberto podem ver a versão velha até o service worker atualizar. O rodapé continua "Properfy Inspector v0.1.0+dev".
- **O-11 — Gerar o link do portal volta a confirmação para PENDING.** Num agendamento CONFIRMED, `POST …/portal-token {"notify":false}` mudou `rentalTenantConfirmationStatus` para PENDING. Reproduzido no INS-0118 e no INS-0119; os outros agendamentos do grupo ficaram CONFIRMED. É o novo ciclo de confirmação (`ConfirmationCycleService`). Mas a auditoria só registra `token_generated`/`dispatch_skipped`, sem a mudança de status, e o portal passa a mostrar "Pending" com "The confirmation deadline has passed". Restaurei as duas confirmações. Fica para decidir se é o esperado.
- **O-12 — Mensagem do servidor fica na tela depois de mudar o campo.** No "Start this day from", a mensagem da recusa anterior continua abaixo do formulário enquanto se corrige, ao lado do novo "Street is required".
- **O-13 — Logs de DEV marcados como `env":"staging"`.** Todas as linhas do `properfy-api-dev` trazem `"env":"staging"`.

### Alterações em DEV nesta perna

| O quê | Antes | Depois |
|---|---|---|
| Melbourne Real Estate › settingsJson | `{}` | padrões explícitos + `priorityOfferHours: null` (O-8); Legal Name revertido |
| PROP-0017 (999 Zzyzxqua Fakestreet, Qwertyvale) | — | criado, MANUAL |
| PROP-0018 (1 Martin Place) | — | criado, SUCCESS; Documents com smoke-doc.pdf v2 (v1 smoke-route.pdf); 1 issue "QA reteste" com foto |
| PROP-0019 (2 Martin Place) | — | criado pelo formulário do agendamento, SUCCESS |
| PROP-0020 (995 Zzyzxqua Gardens) e PROP-0021 (5 Martin Place) | — | criados pela importação; PROP-0020 corrigido para MANUAL |
| INS-0116, INS-0117 | — | importados, DRAFT, 03/12 |
| INS-0118/0119/0120 + grupo `a3185fa2…` | — | criados (smoke.v4n1-3@example.invalid, +61491570181-183), 25/11 16:00–18:30, grupo atribuído à Lisa, confirmação forçada (OP) duas vezes por causa de O-11 |
| Plano da Lisa de 25/11 | 0 paradas | 3 paradas; ordem sugerida; origem de volta à base (NONE) |
| INS-0118 › Files | — | PDF smoke-route.pdf; imagem v1/v2 apagadas; 1 issue do app com foto |
| INS-0119 | — | 1 problema do portal com foto; link de portal válido até 25/11 13:00 UTC (sem envio) |
| Inactive Branch, North Shore Office | — | nome trocado e revertido; endereço inalterado |
| Carlos Mendez QA | telefone +61491574632 | trocado e revertido |
| Mike › base | 1 Martin Place | 2 Martin Place → de volta a 1 Martin Place |
| Service worker do app neste navegador | pacote antigo | desregistrado e recarregado (O-10) |

## Reteste do V-1 com a correção #1404 — 25/11/2026 (04:40–04:45 UTC)

DEV em `19b3c663` (release v126 do `properfy-api-dev`, publicada depois do CI verde desse commit). Pela tela, logado como AM. Capturas `output/smoke-dev/reteste2/v1b-*`.

| # | Caso | Antes | Depois | Resultado |
|---|---|---|---|---|
| 1 | Imóvel antigo com falha (IMP-D3CE99EF20, 9a Carrington St, Bexley): só Notes | FAILED, -33.954873 / 151.122549 | "Property updated successfully", **sem 422**; FAILED, -33.954873 / 151.122549 (igual, em 04:41:42, 04:42:03 e 04:42:43) | PASSOU |
| 2 | Imóvel localizado (PROP-0018, SUCCESS): só Notes | SUCCESS, -33.867753 / 151.207639 | SUCCESS, -33.867753 / 151.207639 | PASSOU |
| 3 | Imóvel com pino manual (PROP-0017): só Notes | MANUAL, -33.4521 / 150.6612 | MANUAL, -33.4521 / 150.6612 | PASSOU |
| 4a | PROP-0018: endereço trocado por inventado (994 Zzyzxqua Fakestreet, Qwertyvale NSW 2999) | — | bloco "This address doesn't match a known address closely enough. Check the street, number, suburb and postcode.", campos marcados, nada salvo | PASSOU |
| 4b | PROP-0018: endereço trocado por bom (9 Martin Place, Sydney NSW 2000, pela busca verificada) | SUCCESS, -33.867753 / 151.207639 | "Property updated successfully"; SUCCESS, **-33.867478 / 151.207179**, mapa com o pino novo | PASSOU |

Sobre o caso 1: o coordenador perguntou se o imóvel volta para "Geocoding in progress."/pendente. **Não volta.** Como o endereço não mudou, nenhuma localização nova é feita. O status continua FAILED e a coordenada antiga gravada (-33.954873, 151.122549) fica onde estava. O detalhe segue mostrando "Failed", a mensagem "Geocoding failed. Please verify the address or retry." e o botão "Retry Geocoding" (`v1b-antigo-falha-continua-failed.jpg`). Fica para o coordenador decidir se um imóvel FAILED deve manter uma coordenada antiga.

**V-1 agora PASSOU por inteiro.** A regra final de endereço (subúrbio + complemento) não foi testada, como pedido.

**Alterações em DEV:**
- Notes "QA reteste V-1 #1404" em IMP-D3CE99EF20, PROP-0018 e PROP-0017 (antes vazias).
- PROP-0018 passou de 1 Martin Place para 9 Martin Place.

## Reteste do O-9 com a correção #1405 — 25/11/2026 (05:26–05:30 UTC)

DEV em `d10bad2b` (release v127 do `properfy-api-dev`, depois do CI verde desse commit). Pela tela, logado como AM, aba "Branches" da agência. O pedido citava "North Shore Office (Acme Realty)"; em DEV essa filial pertence a **Sydney Property Services**. Capturas `output/smoke-dev/reteste2/o9-*`.

| # | Caso | Antes | Depois | Resultado |
|---|---|---|---|---|
| 1 | "Edit Branch" da filial antiga North Shore Office | — | Address "45 Pacific Hwy, North Sydney NSW 2060"; Street "45 Pacific Hwy", Suburb "North Sydney", Postcode "2060", State "NSW" preenchidos como na lista. Number vazio porque o número está dentro de Street (`o9-filial-antiga-gaveta-preenchida.jpg`) | PASSOU |
| 2 | Só o nome trocado ("North Shore Office QA") e salvo | `{street:"45 Pacific Hwy", suburb:"North Sydney", postcode:"2060", state:"NSW"}`, sem coordenada | "Branch updated successfully", sem recusa. A lista mostra "45 Pacific Hwy, North Sydney NSW 2060, AU" (ganhou ", AU"). **A filial ganhou coordenada no próprio save:** -33.842616 / 151.210577, e `city:"North Sydney"` e `country:"AU"` foram acrescentados (conferido às 05:27:24) | PASSOU |
| 3 | Filial já localizada e com número (Inactive Branch): abrir e salvar sem mexer | 200 George Street, `number:"200"`, -33.862599 / 151.207914 | "Branch updated successfully"; endereço, número e coordenada idênticos (`o9-localizada-salva-sem-mexer.jpg`) | PASSOU |
| 4a | Inactive Branch: endereço trocado por inventado (Zzyzxqua Fakestreet, Qwertyvale) | — | "This address doesn't match a known address closely enough."; Street, Number, Suburb e Postcode marcados; nada salvo (`o9-troca-inventado-recusado.jpg`) | PASSOU |
| 4b | Inactive Branch: endereço trocado por bom (300 George Street, Sydney NSW 2000) | — | "Branch updated successfully"; lista "300 George Street, Sydney NSW 2000, AU"; coordenada -33.865718 / 151.207465 (`o9-troca-bom-salvo.jpg`) | PASSOU |

**Desfeito:**
- Inactive Branch voltou a 200 George Street, com a coordenada de volta exatamente em -33.862599 / 151.207914.
- North Shore Office voltou ao nome original.
- A coordenada que a North Shore ganhou no caso 2 (-33.842616 / 151.210577), e os campos `city`/`country`, ficam. São o efeito esperado da correção.

**O-9 PASSOU.** A regra final de endereço não foi testada.

## Rodada final — 25/11/2026 (06:05–06:54 UTC; item 35 e Parte 3 depois de 08:30 UTC)

DEV em `0cf910b4` (#1406, regra final de endereço), release v128 do `properfy-api-dev`, publicada depois do CI verde. Roteiro: `fase2-etapa1/roteiro-reteste-final-dev.md`, relido. Pela tela, como usuário: AM no web, Lisa no app. Capturas em `output/smoke-dev/final/`, fora do commit. Contatos fictícios (`@example.invalid`, `+614915701xx`).

### Contagem (parcial)

| Resultado | Itens |
|---|---|
| **Passou (44)** | 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48 |
| **Falhou (1)** | 5 |
| **Não testável (2)** | 15 e 16 (criação de inspetor exige digitar senha; o coordenador faz) |
| **Pendente (1)** | 35 (plano de 26/11 só é publicado às 19:30 de Sydney = 08:30 UTC) |

Parte 3: PR-06 parte 2 pendente (depois de 08:30 UTC); P3 em 30/11; texto do Ranking (PR-04) não testável (nenhum inspetor fora do ranking com senha conhecida).

### Falha

**Item 5 — "só latitude": a tela não impede nem explica.** Avisado o coordenador na hora (06:12 UTC).
1. Novo imóvel com "10 Main Street, Faketown NSW 2999" → Create → recusado (bloco vermelho e "Set location manually").
2. "Set location manually" → preencher só Latitude (-33.5011) → Create Property.
3. Obtido: a tela envia o pedido sem coordenada e recebe 422 de endereço (06:11:41 UTC). Continua mostrando só "This address doesn't match a known address closely enough."; nada sobre a longitude. Nada é salvo.
4. Esperado: a tela impedir o envio, ou dizer que falta a longitude.

Causa: na criação, `apps/web/src/features/properties/hooks/usePropertySave.ts` (linha 122) só envia o par quando os dois campos estão preenchidos; uma latitude sozinha é descartada sem aviso. `PropertyCreatePage.tsx` não passa `error` aos campos Latitude/Longitude. A API sozinha está certa: `POST /v1/properties` só com latitude → 400 `VALIDATION_ERROR` "latitude and longitude must be provided together".

### Resultado por item

**Endereços de teste (tabela do roteiro):**
- Bom (200 George Street, Sydney NSW 2000): aceito, PROP-0022, pino no lugar.
- Subúrbio errado (345 Military Road, Newtown NSW 2042): recusado.
- Inexistente (10 Main Street, Faketown NSW 2999): recusado.
- Rua sem número (Victoria Avenue, Chatswood NSW 2067): **aceito**, PROP-0025 SUCCESS -33.791125 / 151.200094, pino na Victoria Ave (`tab-rua-sem-numero-aceita-prop0025.jpg`). Bate com a decisão 36.

#### 1.1 Imóvel (web)

| # | Resultado | Evidência |
|---|---|---|
| 1 | PASSOU — PROP-0022 criado, detalhe já com "Success" e mapa com pino (-33.862599 / 151.207914), sem "Geocoding in progress." | `01-imovel-bom-prop0022.jpg` |
| 2 | PASSOU — 345 Military Road, Newtown 2042: bloco "This address doesn't match a known address closely enough. Check the street, number, suburb and postcode.", Street/Suburb/Postcode/State marcados, "Set location manually"; nada salvo | `02-suburbio-errado-bloqueado.jpg` |
| 3 | PASSOU — na mesma tela, Suburb → Mosman (o bloco some ao editar), CEP 2088 → PROP-0023 criado, SUCCESS -33.82755 / 151.2313 | `03-corrigido-mosman-criado.jpg` |
| 4 | PASSOU — depois da recusa, "Set location manually" com o par → PROP-0024, "Manual", -33.5011 / 150.6703 | `04-inexistente-recusado.jpg`, `04-manual-salvo.jpg` |
| 5 | **FALHOU** — ver acima | `05-so-latitude-sem-aviso.jpg` |
| 6 | PASSOU — PROP-0022, só Notes → "Property updated successfully"; SUCCESS mantido | `06-so-notes-salvo.jpg` |
| 7 | PASSOU — PROP-0022: endereço ruim (Newtown) recusado com bloco e campos marcados; bom (1 Macquarie Place, Sydney, pela busca) → SUCCESS, pino novo -33.862029 / 151.209859 | `07-endereco-ruim-recusado.jpg`, `07-endereco-bom-pino-novo.jpg` |
| 8 | PASSOU — SPS-006 (FAILED): faixa amarela "This address couldn't be located. Update it or set the location manually."; só Notes → salvo | `08-antigo-falha-faixa-amarela.jpg`, `08-antigo-falha-notes-salvo.jpg` |

#### 1.2 Imóvel criado dentro do agendamento

| # | Resultado | Evidência |
|---|---|---|
| 10 | PASSOU — "Property not listed? Create one" com 345 Military Road, Newtown 2042: mesmo bloco, campos marcados e "Set location manually". Nenhum imóvel Newtown criado; agendamento não criado | `10-agendamento-imovel-ruim-recusado.jpg` |
| 9 | PASSOU — na mesma gaveta, 1 Bligh Street, Sydney (pela busca) → PROP-0026 criado e já selecionado; agendamento INS-0121 criado (DRAFT, 26/11 10:00–11:00, contato fictício) | `09-imovel-bom-no-agendamento.jpg`, `09-agendamento-criado.jpg` |

#### 1.3 Filial

| # | Resultado | Evidência |
|---|---|---|
| 11 | PASSOU — "QA Final Branch" (88 Phillip Street, pela busca) criada; lista "88 Phillip Street, Sydney NSW 2000, AU" (o número fica dentro de Street) | `11-filial-boa-criada.jpg` |
| 12 | PASSOU — Military Road / 345 / Newtown / 2042: bloco vermelho; Street, **Number**, Suburb e Postcode marcados; sem botão de pino; descartada | `12-filial-ruim-recusada.jpg` |
| 13 | PASSOU — Inactive Branch: Number "200" preenchido; salvar sem mexer → lista igual, número mantido | `13-number-preenchido.jpg`, `13-salvo-sem-mexer-48-lista-antes.jpg` |
| 14 | PASSOU — City Office (filial antiga sem localização), só o nome → "Branch updated successfully"; nome revertido pela API | `14-48-city-office-salva-lista-au.jpg` |

#### 1.4 Base do inspetor (web)

| # | Resultado | Evidência |
|---|---|---|
| 15, 16 | NÃO TESTÁVEL — criação exige digitar senha; com o coordenador | — |
| 17 | PASSOU — Mike (base localizada), só telefone → "Inspector updated successfully"; revertido | `17-mike-telefone-salvo.jpg` |
| 18 | PASSOU — Carlos (sem base), só telefone → salvo sem erro; revertido | `18-carlos-telefone-salvo.jpg` |
| 19 | PASSOU — Carlos, base Military Road / 345 / Newtown / 2042: a gaveta rolou até o bloco; Street, **Unit / Number**, Suburb, City e State marcados. Mosman 2088 → salvo, e o selo "No base address" sumiu da lista | `19-base-ruim-recusada.jpg`, `19-base-boa-selo-sumiu.jpg` |

#### 1.5 Base do inspetor (app, Lisa)

| # | Resultado | Evidência |
|---|---|---|
| 20 | PASSOU — Military Road 345 Newtown 2042 → "This address doesn't match a known address closely enough. Check the street, number, suburb and postcode."; nada salvo | `20-app-base-ruim-recusada.jpg` |
| 22 | PASSOU — sem conexão (simulada por script: `navigator.onLine` falso, evento `offline`, rede derrubada): faixa "You are offline", "You're offline. Connect to save this address.", "Save address" desabilitado, nenhuma chamada de rede | `22-app-offline-nao-salva.jpg` |
| 21 | PASSOU — 100 Market Street, Sydney 2000 → salvo (-33.870497 / 151.208903); o aviso "Add your base address" sumiu e o "Today" passou a "Starting from: 100 Market Street, Sydney NSW 2000". Desta vez não apareceu "Saved successfully" (com o Mike, na segunda perna, apareceu) | `21-app-base-boa-salva.jpg`, `21-rota-parte-da-base-nova.jpg` |

#### 1.6 Ponto de partida do dia (app, Lisa, 25/11)

| # | Resultado | Evidência |
|---|---|---|
| 23 | PASSOU — Military Road 345 Newtown 2042 → mensagem com o motivo; origem não mudou. Ao editar um campo a mensagem some (O-12 resolvido) | `23-origem-ruim-recusada.jpg`, `23-mensagem-some-ao-editar.jpg` |
| 24 | PASSOU — 200 George Street → "Route updated. Starting from 200 George Street, Sydney NSW 2000 for this day."; rótulo "Starting from: 200 George Street, Sydney NSW 2000 (this day only)" | `24-origem-boa-rotulo.jpg` |
| 26 | PASSOU — ordem manual salva (+3 vs. suggested; a prévia mostrava +4) → origem 50 Glebe Point Road → ordem manual mantida e "**+14 min vs. suggested**" → "Reset to suggested order" → "Route reset to the suggested order." (Glebe, Martin, Crown) | `26-ordem-manual-mais3.jpg`, `26-troca-origem-mais14.jpg`, `26-reset-sugerida.jpg` |
| 25 | PASSOU — "Use my base address" → "Route updated. Starting from your base address." / "Starting from: 100 Market Street, Sydney NSW 2000" | `25-use-my-base.jpg` |

#### 2.1 Importação

| # | Resultado | Evidência |
|---|---|---|
| 27 | PASSOU — preview abriu (bucket `s3_app` existe): 346 Military Road, Newtown 2042 "New property · Failed" + "Address was not found by geocoding — the property will be created but flagged for manual location"; 60 Margaret Street "Success"; 2 importáveis, 0 erros | `27-preview-linha-ruim-nao-bloqueia.jpg` |
| 28 | PASSOU — "Import completed" 2 de 2: INS-0122/INS-0123 (DRAFT, 26/11). PROP-0027 FAILED sem coordenada, faixa amarela na edição; PROP-0028 SUCCESS. Corrigível: a edição para "346 Military Road, Mosman 2088" também foi recusada (o número não bate no mapa); corrigido com coordenada manual → MANUAL -33.8279 / 151.2318 | `28-*.jpg` |

#### 2.2 Mapa

| # | Resultado | Evidência |
|---|---|---|
| 29 | PASSOU — marcadores no ponto da coordenada de cada imóvel (cruzado com `/v1/appointments` e `/v1/properties`); os pinos manuais (INS-0116 → PROP-0020, INS-0122 → PROP-0027) no ponto informado | `29-30-mapa-pontos.jpg` |
| 30 | PASSOU — criei o INS-0124 (PROP-0029, 347 Military Road Newtown, FAILED sem coordenada, por importação): não aparece no mapa; os 8 marcadores são os imóveis com coordenada. SPS-006 e o de Penshurst (FAILED) guardam a coordenada antiga, perto do lugar real | `29-30-mapa-pontos.jpg` |
| 31 | PASSOU — "Activity density" liga (painel "8 check-ins · 8 areas", 30 dias) e desliga, sem erro no console | `31-density-ligada.jpg`, `31-density-desligada.jpg` |

#### 2.3 Grupos e ofertas

| # | Resultado | Evidência |
|---|---|---|
| 32 | PASSOU — web "New Service Group": Sydney / Routine, INS-0121/0122/0123 (26/11), região All australia ("Sydney CBD (2/3)" deixaria Mosman fora) → Group 29 → Publish → "Service group published". App (Lisa) "Offers": "1 available offer", #29, Tomorrow 26/11, $240 | `32-grupo29-*.jpg`, `32-oferta-no-app.jpg` |
| 33 | PASSOU — mapa da oferta: ponto 2 em Mosman, na Military Rd (manual), 1 e 3 no CBD (Bligh St e Margaret St) | `33-mapa-oferta-pontos.jpg` |
| 34 | PASSOU — "Accept group" → "You accepted the group!"; "Schedule" quinta 26: 3 serviços (INS-0121…), "3 require tenant confirmation" | `34-schedule-thu26.jpg` |

#### 2.4 Plano do dia e rota (app)

| # | Resultado | Evidência |
|---|---|---|
| 35 | PENDENTE — o plano de 26/11 da Lisa (INS-0121/0122/0123, base 100 Market Street) só é publicado às 08:30 UTC. Confirmação dos inquilinos forçada (OP) às 06:37 para entrarem no plano | — |
| 36 | PASSOU — "Navigate" do cartão: link Google Maps `/maps/dir/` com `destination=-33.868044,151.208821` (PROP-0021, 5 Martin Place), `target=_blank`. Não abri o app de mapas | — |
| 37 | PASSOU, com observação — INS-0120 com GPS simulado a cerca de 1 km: check-in e check-out sem bloqueio ("1 of 3 done"); o web registra 1002 m (precisão 12 m) e os selos "Outside geofence (300 m)" e "Checked out outside geofence". **Obs.:** no cartão do app não apareceu aviso de distância | `37-*.jpg` |

#### 2.5 Operação (web)

| # | Resultado | Evidência |
|---|---|---|
| 38 | PASSOU, com observação — "Live Day" (`/live-day`): Lisa "In transit", 1/3, alertas "INS-0118 not started" e "Checked out 1002 m from the property (limit 300 m) · INS-0120". Linha reta tracejada 5 Martin Place → 88 Crown St → 33 Glebe Point Rd, igual à geometria da API (LineString com os 3 pontos, `approximate: true`). **Obs.:** no primeiro clique na Lisa, vindo da lista, a linha não apareceu por uns 15 s; apareceu depois de recarregar | `38-live-day-lista.jpg`, `38-primeiro-clique-sem-linha.jpg`, `38-apos-recarregar-linha-reta.jpg` |
| 39 | PASSOU — filtro "No base address" → só Lisa (antes da base) e Tom Retired; Carlos saiu depois do item 19 | `39-filtro-no-base.jpg` |
| 40 | PASSOU — "Field activity" do INS-0120: AM vê distâncias e selos; CL_ADMIN vê o mesmo, sem coordenada (texto da tela sem números de lat/lng; `/field-activity` para CL sem chaves de lat/lng) | `37-40-field-activity-am.jpg`, `40-field-activity-cl.jpg` |

#### 2.6 Notificações e agência

| # | Resultado | Evidência |
|---|---|---|
| 41 | PASSOU — menu "Notification Templates" → "Consent Lookup"; "Search" desabilitado sem agência; nenhum "Record opt-out" | `41-consent-lookup-am.jpg` |
| 42 | PASSOU, com observação — "Edit Agency" (Melbourne) sem os campos de oferta; salvar → "Agency updated successfully". **Obs. (anterior a esta onda):** o campo "Notes" da gaveta é descartado, porque o schema da agência não tem `notes`; o detalhe continua "—" | `42-agencia-salva-notes-perdida.jpg` |

#### 2.7 Arquivos

| # | Resultado | Evidência |
|---|---|---|
| 43 | PASSOU — PROP-0022: PDF (Documents), imagem (Other), nova versão (v2), download (URL assinada → 200, `application/pdf`, 2272 bytes, descartado), apagar (v2 e v1). INS-0121: PDF e imagem enviados, imagem apagada. Todos os PUT no bucket `inspection-assets` deram 200; nenhum 5xx ou `NoSuchBucket` no log | `43-*.jpg` |
| 44 | PASSOU — issue com foto no web (PROP-0022, "Issue reported"); "Report issue" com foto no app (Lisa, INS-0121, "Inspector · Photo 1"); portal do INS-0123 (link sem envio) "Thanks — your report has been sent to the team." e "Your reports". A confirmação do INS-0123 voltou a PENDING ao gerar o link (O-11) e foi restaurada (OP) | `44-*.jpg` |

#### 2.8 Regra final nos casos reais

**45 — PASSOU.** "Retry Geocoding" pela tela às 06:05–06:08 UTC. Depois do clique o status fica "Pending" ("Geocoding is taking longer than expected…") até o worker processar (~15 s).

| Imóvel | Antes | Depois | Esperado |
|---|---|---|---|
| IMP-2A412183A9 (Brighton-le-sands) | FAILED -33.960706 / 151.152431 | SUCCESS, mesma coordenada | aceito ✔ |
| IMP-748F05CA28 (Carlton) | FAILED -33.970092 / 151.126711 | SUCCESS | aceito ✔ |
| IMP-90EC930570 (Bexley) | FAILED -33.960694 / 151.12867 | SUCCESS | aceito ✔ |
| IMP-D3CE99EF20 (Bexley) | já SUCCESS (backfill SYSTEM às 06:00:46), sem botão Retry | SUCCESS | aceito ✔ |
| IMP-D45E7C3CEF (Hurstville) | FAILED -33.963655 / 151.103743 | SUCCESS | aceito ✔ |
| IMP-FF4AB720F8 (Hurstville) | FAILED -33.971342 / 151.108435 | SUCCESS | aceito ✔ |
| IMP-6238CD8E93 (Penshurst) | FAILED -33.960835 / 151.086088 | **FAILED**, `LOW_RELEVANCE` (relevância 0,825), **coordenada antiga mantida** | recusado ✔ |
| SPS-006 (Chatswood) | FAILED -33.7969 / 151.1803 | **FAILED**, `LOW_RELEVANCE` (0,78), **coordenada antiga mantida** | recusado ✔ |

Capturas: `45-retry-pending.jpg`, `45-brighton-aceito.jpg`, `45-penshurst-recusado-coord-mantida.jpg`. Obs.: Penshurst foi recusado com relevância 0,825, acima do limiar; o motivo real é o subúrbio, mas o código gravado é `LOW_RELEVANCE`.

**46 — PASSOU.** 120 Phillip Street, Sydney 2000: PROP-0030 (sem complemento), PROP-0031 (Line 2 "Unit 5") e PROP-0032 (Line 2 "120 Phillip Street", repetindo a rua). Os três foram criados, SUCCESS, no mesmo ponto (-33.86511 / 151.211571), como imóveis distintos (`46-*.jpg`).

**47 — PASSOU.** PROP-0030, só Line 2 → "Unit 5" (igual ao PROP-0031): aviso "An active property with this exact address already exists in this tenant", sem erro interno; o mesmo PATCH pela API → 409 (`47-line2-duplicado-aviso.jpg`).

**48 — PASSOU, com observação.** Antes de salvar, a City Office aparecia "100 George St, Sydney NSW 2000" (sem ", AU"), e as outras três filiais com ", AU". Depois do save do item 14, as quatro aparecem com ", AU". O ", AU" só aparece depois que a filial é salva.

### Observações novas

- **O-14 — Sugestão da busca verificada pode ser recusada.** "30 Bridge Street, Sydney NSW 2000", escolhido na própria lista da busca, foi recusado (422 `LOW_RELEVANCE`, 06:17:18 UTC; confirmado pela API, também como "30 Bridge St"). O mesmo com "346 Military Road, Mosman 2088" no item 28. O usuário escolhe uma sugestão e recebe "doesn't match a known address".
- **O-15 — City Office não ganhou coordenada ao salvar.** Depois do save do item 14 continua sem latitude/longitude, enquanto a North Shore Office ganhou às 05:27. Sem erro na tela.
- **O-16 — Aviso de distância só no web.** No item 37, o cartão do app fez check-in e check-out a 1 km sem nenhum aviso; o desvio só aparece no web e no Live Day.
- **O-17 — Linha do Live Day no primeiro clique.** Ver item 38.
- **O-18 — Notes da agência descartado.** Ver item 42 (anterior a esta onda).
- **O-19 — Ordem dos itens em "Branch" muda com filial nova.** A "QA Final Branch" entrou no topo do seletor de filial do imóvel; quem clica por posição escolhe outra filial. Só nota de uso.

### Alterações em DEV nesta rodada

| O quê | Depois |
|---|---|
| Imóveis criados | PROP-0022 (200 George St → 1 Macquarie Place, Notes "QA rodada final item 6"), PROP-0023 (345 Military Rd Mosman), PROP-0024 (10 Main St Faketown, MANUAL), PROP-0025 (Victoria Ave Chatswood), PROP-0026 (1 Bligh St), PROP-0027 (346 Military Rd → Mosman, MANUAL), PROP-0028 (60 Margaret St), PROP-0029 (347 Military Rd Newtown, FAILED sem coordenada), PROP-0030/0031/0032 (120 Phillip St) |
| Agendamentos | INS-0121 (formulário), INS-0122/0123 (importação), INS-0124 (importação, sem coordenada); 0121–0123 no Group 29 (All australia, 26/11), aceito pela Lisa, confirmação forçada (OP) |
| Filial nova | "QA Final Branch" (88 Phillip Street), ativa |
| Filiais | City Office: nome trocado e revertido |
| Inspetores | Carlos: base 345 Military Road, Mosman (antes sem base); telefone trocado e revertido. Mike: telefone trocado e revertido. Lisa: base 100 Market Street, Sydney (antes sem base) |
| Plano da Lisa 25/11 | ordem manual → Reset (sugerida); origem de volta à base; INS-0120 check-in/check-out (DONE, pendente de conferência) |
| Imóveis existentes | SPS-006 Notes "QA rodada final item 8"; 7 "Retry Geocoding" (6 viraram SUCCESS) |
| Arquivos | PROP-0022: smoke-route.pdf + 1 issue com foto; INS-0121: smoke-route.pdf + 1 issue do app; INS-0123: 1 problema do portal; link de portal do INS-0123 (sem envio) |
| Agência Melbourne | Notes digitado (não gravado, O-18) |
