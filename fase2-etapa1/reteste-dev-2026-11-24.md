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
