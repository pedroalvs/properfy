# X02 · Lacunas

| | |
|---|---|
| **Arquivo revisado** | `fase2-etapa1/tarefas/X02-tarefas.md` (TASK-X02-1 e TASK-X02-2) |
| **Base** | Plano `X02-geocodificacao-permanente.md`, `README.md`, `decisoes.md`, consumidores `F01-tarefas.md` e `F04-tarefas.md`, snapshot read-only de `origin/develop`, docs públicas da Mapbox (help article "temporary vs permanent", referência Geocoding v5/v6, página de pricing) consultadas em 2026-10-28 |
| **Total** | **9** |
| **ALTA** | 3 |
| **MÉDIA** | 4 |
| **BAIXA** | 2 |
| **Precisam de decisão do dev** | 4 (L-X02-01, L-X02-02, L-X02-03, L-X02-04) |

Não reportado por já estar decidido: filiais no escopo, marcadora em coluna, FAILED sem retry por erro de conta, custo do modo permanente no preview de import, MANUAL digitado mantido, violação residual no legado sem resultado, tolerância de 5 m dos falsos MANUAL, ausência de métrica nova.

---

## L-X02-01 · O contrato `permanent=true` na v5 e a forma da recusa são suposições; o smoke não prova o modo permanente
- **Severidade:** ALTA
- **Tarefa/seção:** TASK-X02-1 · "Contratos → Mapbox (externo)", "Testes → mapbox-geocoding.service.test.ts" casos 4–7, passo 9, "Deploy, rollout e rollback" passo 1; TASK-X02-2 depende disso ("Conta Mapbox com o modo permanente confirmado pelo smoke").
- **O que falta / está ambíguo:**
  1. A tarefa fixa `GET …/geocoding/v5/mapbox.places/{q}.json?…&permanent=true`. O help article da Mapbox mostra exatamente essa forma, mas a **referência da API v5** não documenta nenhum parâmetro `permanent`: nela o produto permanente é o endpoint `mapbox.places-permanent`, liberado só via Sales ("speak with an Account Manager on the Sales team before making requests"), e avisa que "unsuccessful requests made by an account that does not have access to the endpoint may be billable". A referência da **v6** (`/search/geocode/v6/forward`) é a que documenta `permanent=true` (exigindo cartão válido ou contrato enterprise). Qual das duas fontes vale para a conta da Properfy não está verificado.
  2. A detecção da recusa (401/403/422 **e** `message` contendo "permanent") e a mensagem literal fixada no teste 4 (`Permanent geocodes are not enabled for this account`) não vêm de nenhuma documentação; são chute. A tarefa reconhece isso ("Confirmar no smoke antes do merge"), mas o smoke do passo 9 está no **fim** da implementação (passo 9 de 9) e só é executável se a conta **recusar**. Se a conta já aceitar, não há como fixar o formato da recusa; se não aceitar, a dev já gastou ~3 dias em cima de uma forma de URL possivelmente errada.
  3. O smoke define sucesso como "200 com `features[0].center`". Isso **não distingue** "aceito como permanente" de "parâmetro desconhecido ignorado, resposta temporária". No segundo caso o sistema inteiro passa a gravar coordenadas temporárias carimbadas com `geocoded_permanently_at`, que é o oposto do objetivo, e nada acusa.
  4. O passo 1 do rollout ("Se a conta recusar, habilitar o modo permanente antes de seguir") não tem responsável nem prazo. Se a habilitação depender de Sales, isso é um lead time de dias/semanas num item que bloqueia F01, F04 e F09 (Onda 1).
- **Por que importa:** cenário A: v5 ignora `permanent` → prod grava milhares de coordenadas temporárias marcadas como permanentes, violação pior que a atual porque agora é invisível. Cenário B: a recusa vem com outro status/mensagem (por exemplo 403 sem a palavra "permanent") → cai no ramo genérico, `geocoding_failure_code` fica `NULL`, o sweep de 24 h reenfileira todo FAILED para sempre, pagando uma requisição permanente (possivelmente faturável mesmo sem acesso) por imóvel por dia; exatamente o que a decisão 6 quis evitar.
- **Evidência:** X02-tarefas.md "Mapbox (externo)" e "Riscos → Detecção do erro de conta"; `apps/backend/src/modules/property/infrastructure/mapbox-geocoding.service.ts:14` (URL atual, v5); docs Mapbox: referência Geocoding v5 (endpoint `mapbox.places-permanent`, contato com Sales, "may be billable"), referência v6 (`permanent=true`, "valid credit card on file"), help article (exemplos v5 com `permanent=true`).
- **Proposta de regra/detalhe:**
  - Mover o smoke para **antes** do passo 1 como "passo 0 · spike de 0,25 dia" (já cabe nos 3,0 dias se o passo 2 encolher): fazer, com o token de **dev**, (a) `curl` v5 com `permanent=true`, (b) `curl` v5 sem o parâmetro, (c) `curl` em `mapbox.places-permanent`; registrar status, corpo e **o contador de "Permanent Geocoding API" na página de Statistics/Billing da conta Mapbox** antes e depois. Critério de "modo permanente confirmado": o contador de permanente sobe com (a). Só então fixar URL, status e mensagem da recusa no passo 2 e nos testes 4–7.
  - Trocar a regra de detecção por uma que não dependa de texto: `status ∈ {401, 403, 422}` **e** (`message` contém "permanent" **ou** a resposta é diferente da mesma requisição sem `permanent`, provada no spike). Se o spike mostrar que a recusa não é distinguível, documentar e tratar 403 como erro de conta (hoje 403 nunca acontece com token válido).
  - Abrir hoje, em paralelo à implementação, o pedido de habilitação à Mapbox para dev, staging e prod, com responsável nomeado no passo 1 do rollout. Registrar no `docs/ops/pre-deploy-smoke-checklist.md` a prova positiva (contador), não só o 200.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Spike de 0,25 dia antes de codar, com prova positiva pelo contador de uso; manter v5 se confirmado.
  2. Se o spike mostrar que a v5 não aceita `permanent=true` na conta: migrar só o adaptador de geocodificação para a v6 (`/search/geocode/v6/forward?q=…&permanent=true`, coordenadas em `features[0].geometry.coordinates` `[lng, lat]`), mantendo autocomplete e teste de conexão na v5. É "trocar de API", excluído pelo plano, então precisa de aval explícito e +0,25 dia.
  3. Seguir como está e confiar no smoke do passo 9 (não recomendado pelos cenários A e B).

## L-X02-02 · `PATCH /v1/properties/:id` com os dois campos nulos em imóvel não-MANUAL não tem regra, e o "como hoje" do unlock no web é falso
- **Severidade:** ALTA
- **Tarefa/seção:** TASK-X02-1 · "Contratos → PATCH /v1/properties/:propertyId", "UI web, imóvel", edge cases 8–10, testes `update-property.use-case.test.ts` e `PropertyFormDrawer.test.tsx` casos 1 e 4.
- **O que falta / está ambíguo:**
  1. O contrato cobre três casos: ambos presentes e diferentes (MANUAL), ambos iguais (ignora), ambos nulos **em um MANUAL** (unlock). Falta o quarto: **ambos nulos em um imóvel SUCCESS, PENDING ou FAILED**. Hoje o backend cai no primeiro ramo e grava `lat = null, lng = null, geocodingStatus = 'MANUAL'`, um estado absurdo (MANUAL sem coordenada, que o worker pula para sempre). A regra nova "diferentes do gravado" (null ≠ -33.8) manteria esse comportamento.
  2. A tarefa diz "Limpar os dois campos de um MANUAL envia `null` (unlock), como hoje" e o teste 4 do drawer exige `latitude: null, longitude: null`. Mas o `usePropertySave.ts` atual **só inclui o campo quando não está vazio**; vazio = chave ausente. Não existe hoje nenhum lugar no web que envie `null` de coordenada. Logo o unlock pelo web é comportamento **novo**, e a regra de "só enviar quando diferente do inicial" vai produzir, naturalmente, `null/null` sempre que o usuário limpar os campos de um imóvel que tinha coordenada, qualquer que seja o status; o que recai no caso 1.
  3. O teste 1 do drawer ("selecionar uma sugestão: os campos ficam `''`") combinado com o modo de edição torna o caso 1 rotineiro: editar um imóvel SUCCESS, escolher outra sugestão do autocomplete (campos de coordenada viram `''`, diferentes do inicial) e salvar → o web manda `null/null` + endereço novo → backend grava MANUAL sem coordenada e **não enfileira job** (edge 11: "MANUAL vence, sem job").
  4. Um campo vazio e o outro preenchido (edge 10 só cobre "um alterado, ambos não vazios"): o web atual manda só um; o backend ignora silenciosamente. Não está dito se a nova regra do par muda isso.
- **Por que importa:** um fluxo comum de correção de endereço (trocar a sugestão do autocomplete no form de edição) passa a deixar o imóvel sem coordenada e sem regeocodificação, derrubando-o do mapa e do roteiro da F04, sem nenhum erro para o usuário.
- **Evidência:** `apps/backend/src/modules/property/application/use-cases/update-property.use-case.ts:176-194` (ramo `data.latitude !== undefined && data.longitude !== undefined && !isManualCoordinateUnlock` aceita `null`); `apps/web/src/features/properties/hooks/usePropertySave.ts:90-95` (`if (data.latitude.trim()) payload.latitude = …`; nunca envia `null`); grep por `latitude: null` em `apps/web/src/features/properties` sem resultado; X02-tarefas.md "UI web, imóvel" e teste 4 do drawer.
- **Proposta de regra/detalhe:**
  - Backend, quarto caso: **ambos nulos em imóvel não-MANUAL → ignorados** (sem alterar lat/lng/status; log debug `property.update_coordinates_null_ignored`). Se o endereço mudou no mesmo PATCH, segue o fluxo de endereço (PENDING + job). Nunca gravar MANUAL com lat/lng nulos; acrescentar esse invariante ao teste 1 do use-case.
  - Backend, par incompleto: um campo presente e o outro ausente/nulo → ignorar os dois (comportamento atual, agora explícito e testado).
  - Web: ao selecionar sugestão em **modo edição**, zerar os campos de coordenada só se o imóvel for MANUAL; para os demais, manter os valores iniciais (não serão enviados). Enviar `latitude: null, longitude: null` **somente** quando o imóvel atual é MANUAL e os dois campos foram limpos; nos outros status, campos vazios = chaves ausentes.
  - Acrescentar aos testes: use-case caso 7 "SUCCESS recebe `null/null` → ignorado, status SUCCESS"; drawer caso 5 "imóvel SUCCESS, trocar sugestão e salvar → payload sem lat/lng, com endereço novo"; integração 6 idem com `coordinates` intacta até o worker rodar.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Backend ignora `null/null` fora de MANUAL; web só envia `null` em MANUAL.
  2. Backend trata `null/null` fora de MANUAL como "limpar coordenadas e regeocodificar" (PENDING + job, lat/lng nulos). Mais poderoso, mas muda semântica de um PATCH que hoje nem acontece e precisa de copy no form.
  3. Backend devolve 400 `VALIDATION_ERROR` para `null/null` fora de MANUAL. Simples, porém transforma o fluxo do item 3 num erro para o usuário.

## L-X02-03 · O CAS do script de legado não detecta mudança de endereço entre a seleção e a escrita (imóvel e filial)
- **Severidade:** ALTA
- **Tarefa/seção:** TASK-X02-2 · "Modelo de dados → Imóveis (`applyPermanentBackfill`)", "Filiais (CAS em `geocoded_permanently_at IS NULL`)", edge case 6, teste de integração 4.
- **O que falta / está ambíguo:**
  - **Imóvel:** o CAS compara `lat`, `lng` (lidos), `geocoding_status <> 'MANUAL'` e `geocoded_permanently_at IS NULL`. Uma edição de endereço durante a rodada deixa o imóvel em PENDING **com lat/lng antigos mantidos** (`update-property.use-case.ts:191-194` não zera as coordenadas) e enfileira `property.geocode`. O CAS passa (lat igual, status não-MANUAL, marcadora nula) e o script grava `SUCCESS` + marcadora com as coordenadas do **endereço antigo**. O worker chega depois e pula ("already geocoded or manual"). Resultado: imóvel SUCCESS, permanente, apontando para o endereço anterior; e nenhuma rodada futura o pega, porque a marcadora está preenchida.
  - **Filial:** o CAS é só `geocoded_permanently_at IS NULL`. Se o usuário trocou o endereço durante a rodada e a geocodificação síncrona falhou (marcadora continua `NULL`), o script escreve "`address_json` com as novas lat/lng", isto é, o JSON **lido na seleção** (endereço antigo) por cima do endereço novo do usuário. Perde dado do cliente.
  - O edge 6 e o teste de integração 4 só exercitam "lat mudou"; "endereço mudou com lat igual" não é coberto.
- **Por que importa:** a janela por lote é curta (100 linhas × `60000/rate` ms ≈ 20 s), mas a rodada de prod roda cross-tenant sobre todos os imóveis e o dano é silencioso e permanente (marcadora preenchida). Com `--rate` conservador e vários milhares de linhas, a rodada leva dezenas de minutos durante os quais agências podem estar editando.
- **Evidência:** X02-tarefas.md "Encontrado: `applyPermanentBackfill` … `where: { id, tenant_id, lat, lng, geocoding_status: { not: 'MANUAL' }, geocoded_permanently_at: null }`"; "Filiais → CAS em `geocoded_permanently_at IS NULL`"; `update-property.use-case.ts:191-194` (PENDING sem zerar lat/lng); `geocode.worker.ts:40-48` (pula SUCCESS); `prisma-branch.repository.ts:128-134` (`address_json` substituído inteiro).
- **Proposta de regra/detalhe:**
  - Incluir `updated_at` lido na seleção no CAS dos três métodos novos (`applyPermanentBackfill`, `markLegacyNoResult`, `restoreFalseManual`) e no da filial: `where: { …, updated_at: <lido> }`. É o guard mais barato e cobre qualquer edição concorrente (endereço, status, soft-delete).
  - Para a filial, escrever por merge e não por substituição: `UPDATE branches SET address_json = address_json || jsonb_build_object('latitude', $lat, 'longitude', $lng), geocoded_permanently_at = now() WHERE id = $id AND tenant_id = $t AND geocoded_permanently_at IS NULL AND updated_at = $lido`.
  - Acrescentar ao teste de integração 4 o caso "endereço mudou, lat igual": o imóvel fica PENDING com lat antiga e o script soma em `skippedConcurrent`; e um caso de filial equivalente.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** CAS com `updated_at` + merge jsonb na filial.
  2. CAS por `normalized_address_key` (imóvel) e por igualdade do `address_json` completo (filial). Funciona, mas é mais SQL e não cobre outras edições concorrentes.
  3. Aceitar a janela e documentar no runbook "rodar fora do horário comercial de Sydney" (já está) como mitigação única. Não recomendado: a corrupção é silenciosa e irreversível pela marcadora.

## L-X02-04 · Update de filial: "endereço normalizado" e "manter lat/lng" não estão definidos
- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X02-1 · "Estados e comportamentos" (linhas de filial), edge cases 13–14, passo 7 ("comparação de endereço normalizado"), testes `update-branch.use-case.test.ts` casos 2–3.
- **O que falta / está ambíguo:**
  1. O que é "mesmo endereço": campo a campo? com `trim` e sem diferenciar maiúsculas? `city` e `number`/`complement` contam? O `address_json` gravado pode ter chaves extras (`latitude`, `longitude`, `formattedAddress`, `provider` de clientes antigos) que a comparação precisa ignorar.
  2. "Mantém lat/lng e marcadora": o cliente agora **nunca** envia lat/lng (Zod remove), e o repositório substitui `address_json` inteiro. Logo o use-case precisa **copiar** `latitude/longitude` do JSON antigo para o novo. Não está escrito, e a tabela de estados diz só "mantém".
  3. Endereço diferente **e** geocodificação falhou: o JSON novo fica sem lat/lng (coerente com "nunca falha o save"), mas a marcadora precisa virar `NULL` explicitamente, senão a filial fica com marcadora antiga e sem coordenada (e o script de legado a ignora para sempre, porque seleciona `geocoded_permanently_at IS NULL`).
  4. Endereço diferente e a Mapbox responde `null`: a filial perde a coordenada antiga (do endereço errado, correto perder) — ok, mas vale dizer.
- **Por que importa:** sem a regra 1, cada save de filial com o mesmo endereço (por exemplo só mudando `contactEmail` com o form reenviando `address`) paga uma requisição permanente a US$ 5/1000; sem a regra 2, a filial perde lat/lng em qualquer update de nome; sem a regra 3, nasce um estado (marcadora preenchida, sem coordenada) que nenhum caminho corrige.
- **Evidência:** X02-tarefas.md passo 7 ("comparação de endereço normalizado", sem definição); `prisma-branch.repository.ts:128-129` (substituição inteira do JSON); `update-branch.use-case.ts:76-79` (`updateData.addressJson = data.address` sem merge); `useBranchSave.ts:58-70` (form sempre reenvia `address` quando existe, com `city = suburb`).
- **Proposta de regra/detalhe:**
  - "Mesmo endereço" ⇔ `formatGeocodingQuery(old) === formatGeocodingQuery(new)`, com ambos passando pelo `GeocodableAddress` (chaves extras ignoradas; `trim` e `toLowerCase` dentro da comparação, não no formatador). Reaproveita o helper exportado e vale também para a F01 (que já prevê "mesmo endereço → não chama o serviço").
  - Regra de escrita do update: (a) `address` ausente → não toca em `address_json` nem na marcadora; (b) mesmo endereço e marcadora presente → `addressJson = { ...data.address, latitude: old.latitude, longitude: old.longitude }`, marcadora mantida, sem Mapbox; (c) mesmo endereço e marcadora `NULL`, ou endereço diferente → geocodifica; sucesso: JSON novo + lat/lng + marcadora `now()`; `null`/erro/timeout: JSON novo **sem** lat/lng e marcadora `NULL`.
  - Acrescentar ao teste 2 a asserção de que o `addressJson` passado ao repositório contém as lat/lng antigas, e um caso 6 "endereço alterado + falha → marcadora `null`".
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Igualdade por `formatGeocodingQuery` (trim + case-insensitive).
  2. Igualdade campo a campo em `street, number, complement, suburb, state, postcode, country` (ignorando `city`). Mais explícito, mas duplica a lista de campos que o formatador já conhece.

## L-X02-05 · Custo, limite de taxa e faturamento de falhas não têm número nem campo no relatório
- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X02-1 "Fonte e termos" e "Decisões 7"; TASK-X02-2 "Contratos (CLI)" (dry-run "informa o custo estimado"), `RegeocodeReport`, "Riscos → Custo", "Riscos → Limite de taxa", `--rate` padrão 300.
- **O que falta / está ambíguo:**
  1. O plano pede "estimar com o número de imóveis antes de rodar em prod", mas nem o plano nem a tarefa trazem o preço nem uma fórmula. Pela página de pricing da Mapbox (2026-10-28): Permanent Geocoding **US$ 5,00 por 1.000 requisições desde a primeira, sem faixa gratuita**; Temporary: 100.000/mês grátis, depois US$ 0,75/1.000. Ou seja, o custo unitário sobe de 0 para US$ 0,005 em **todo** caminho que grava (create, worker, retry diário de todo FAILED-sem-código, preview de import inteiro, save de filial, prova 2 dos falsos MANUAL a cada rodada).
  2. A tabela de CLI diz que o dry-run "informa o custo estimado (número de requisições)", mas `RegeocodeReport` não tem nenhum campo para isso. Implementador vai ter que inventar o nome ou imprimir fora do JSON.
  3. "Mesmo limite de taxa" é assumido; a referência v5 diz **600 req/min por padrão** (ajustável por conta), a v6 diz 1.000. O `--rate=300` padrão do script mais o tráfego de prod (previews de import rodam com concorrência) podem bater o 429, que o script trata como "erro genérico" (soma em `errors` e segue, sem backoff) e o adaptador conta no breaker.
  4. A referência v5 avisa que requisições sem acesso ao modo permanente "may be billable". Isso muda a economia do cenário "conta sem o recurso": cada FAILED-sem-código reenfileirado pelo sweep paga.
- **Por que importa:** sem fórmula e limiar, o passo 3 do rollout da X02-2 ("estimar o custo") é opinião; e o retry diário de FAILED por `null` (decidido como "segue como hoje") passa a ter custo recorrente de US$ 0,005 × FAILED/dia que ninguém quantificou (se houver 2.000 endereços não geocodificáveis, são ~US$ 300/mês para sempre).
- **Evidência:** X02-tarefas.md "Regras de escrita → FAILED por `null` da Mapbox: código `NULL`, e o sweep de 24 h segue como hoje"; `geocode-retry.worker.ts:27-38` (reenfileira todo FAILED a cada 24 h); `RegeocodeReport` sem campo de custo; `--rate` padrão 300; docs Mapbox pricing e referência v5 (600 req/min, "may be billable").
- **Proposta de regra/detalhe:**
  - Acrescentar ao `RegeocodeReport`: `estimatedRequests: { falseManual: number; properties: number; branches: number; total: number }` (preenchido no dry-run e no apply) e, no runbook, a fórmula `custo ≈ total × 0,005 USD` com o preço vigente anotado e um limiar de go/no-go (por exemplo, acima de US$ 200 exige aval do dev).
  - No sweep de 24 h, logar `reenqueuedCount` já existe; acrescentar ao passo 5 do rollout da X02-1 o número de FAILED-sem-código em prod (`countFailedGeocoding - countBlockedFailedGeocoding`) como custo diário esperado, e decidir ali se o cool-off de 24 h continua ou vira semanal. (Se mantiver 24 h, registrar como decisão com o número.)
  - Tratar 429 explicitamente no script: `sleep` de 60 s e retry da mesma linha uma vez antes de somar em `errors`; e reduzir o `--rate` padrão para 120 (um quinto do limite v5) ou documentar o limite real da conta no runbook.
- **Precisa de decisão do dev?** Não (acrescentar; o cool-off é só registro do número).

## L-X02-06 · Regra 1 dos falsos MANUAL não cobre `postcode`/`addressLine2` nem a transição MANUAL→MANUAL com mudança de endereço posterior; edge 20 contradiz a prova 2
- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X02-2 · "Como a decisão 10 foi implementada", classificação passos 3–4, edge cases 15 e 20.
- **O que falta / está ambíguo:**
  1. Edge 20 diz que mudança só de `postcode`/`addressLine2` na transição "passa na prova 1" e que "a prova 2 usa o endereço atual, o que protege". Mas a prova 2 compara a coordenada MANUAL atual com o geocode do endereço **atual**; se a edição que criou o MANUAL mudou `postcode` e o form reenviou a coordenada do endereço **antigo** (o padrão do bug), a coordenada antiga e o geocode do endereço novo geralmente **diferem** (> 5 m) → `coordinates_differ`, ambíguo. Correto por ser conservador, mas o texto diz o oposto ("protege" sugere restaurar). Precisa dizer explicitamente que esses casos ficam ambíguos e vão ao relatório.
  2. Edge 15: "edições MANUAL→MANUAL posteriores não entram na prova 1". Mas uma edição MANUAL→MANUAL que **mudou o endereço** (hoje possível: lat/lng presentes vencem o `addressChanged`, edge 11 da X02-1) deixa o imóvel com coordenada do endereço antigo e status MANUAL; a prova 1 passa (transição original sem mudança), a prova 2 falha (geocode do endereço novo ≠ coordenada antiga) → ambíguo, intacto. Ok, mas deve ser dito, porque é um imóvel que ficará **errado** (coordenada de outro endereço) e não aparece em lugar nenhum como "corrigir à mão" além da lista `ambiguous`.
  3. A tarefa não define o que a operação faz com `ambiguous`/`missingAudit` além de "entregar a lista": não há critério de correção manual (por exemplo "abrir o imóvel, limpar os dois campos → unlock → regeocodifica permanente"). Esse é o único caminho de saída para a violação residual e cabe numa linha do runbook.
- **Por que importa:** o relatório de staging vai mostrar uma contagem de `coordinates_differ` possivelmente alta (todo falso MANUAL criado numa edição que tocou `postcode`), e sem a explicação o dev vai achar que a tolerância está errada e subir `--false-manual-tolerance-m`, o que restaura MANUAL legítimo.
- **Evidência:** X02-tarefas.md edge 20 ("a prova 2 usa o endereço atual, o que protege contra coordenada de endereço antigo") vs. classificação 4 ("resultado mais distante → ambiguous"); `update-property.use-case.ts:182-190` (lat/lng presentes vencem `addressChanged`, sem job); audit `before/after` sem `postcode`/`addressLine2` (`update-property.use-case.ts:198-206, 223-231`).
- **Proposta de regra/detalhe:**
  - Reescrever o edge 20: "mudança só de `postcode`/`addressLine2` na transição passa na prova 1; a prova 2 então compara com o endereço atual e, como a coordenada regravada era do endereço anterior, o caso normalmente vira `coordinates_differ` e fica no relatório, sem alteração. Isso é intencional."
  - Acrescentar ao runbook a receita de correção manual para `ambiguous`/`missingAudit`/`noResult`: "no web, editar o imóvel, limpar Latitude e Longitude e salvar (unlock → PENDING → worker permanente)"; para filial, "reabrir e salvar o endereço".
  - Acrescentar ao relatório, em `ambiguous`, o campo `addressChangedAfterTransition: boolean` (há `property.updated` posterior com `street/suburb/state/country` diferentes), para a operação priorizar os imóveis que estão com coordenada de outro endereço.
- **Precisa de decisão do dev?** Não.

## L-X02-07 · Preview de import com erro de conta vira `unverified` em silêncio
- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-X02-1 · "Estados e comportamentos" (linha "Preview de import → Erro de conta → `unverified`"), "Copy de logs" (sem linha para o verificador), CA3.
- **O que falta / está ambíguo:** o `verifyOne` atual engole **qualquer** exceção (`catch { return UNVERIFIED }`) sem log. Com a conta sem o recurso, um import de 500 linhas gera 500 chamadas pagas (ou faturáveis), todas `unverified`, e nada aparece no log até o worker rodar no commit. CA3 promete "o erro aparece no log (`code`)", mas no caminho do preview isso só acontece depois, por outra peça, se o import for commitado. Também não está dito se o verificador deve **parar** o lote ao primeiro erro de conta (as 499 chamadas seguintes vão falhar igual).
- **Por que importa:** o operador vê um preview "não verificado" inteiro e assume problema de rede; custo e ruído repetem a cada preview até alguém abrir o log do worker.
- **Evidência:** `apps/backend/src/modules/property/application/services/import-geocode-verifier.ts:118-121` (`catch { return UNVERIFIED; }` sem log); X02-tarefas.md tabela de copy sem entrada para o verificador; teste do verificador caso 3 só exige `unverified`.
- **Proposta de regra/detalhe:**
  - No verificador: ao capturar `MapboxPermanentGeocodingUnavailableError`, logar `error` uma vez por lote (`import.geocode_verify_permanent_unavailable { code, remaining }`), marcar as chaves **restantes** do lote como `unverified` sem chamar a Mapbox (curto-circuito) e seguir. Outros erros continuam como hoje (um `warn` agregado com a contagem bastaria).
  - Teste do verificador caso 3 passa a exigir: 1 chamada ao geocoder para 3 endereços, 3 `unverified`, `logger.error` chamado uma vez.
- **Precisa de decisão do dev?** Não.

## L-X02-08 · String de endereço do legado de imóveis não está definida (e a equivalência `fullAddress` ≡ `formatGeocodingQuery` não está travada)
- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-X02-1 "Contratos exportados (a)" ("`PropertyEntity.fullAddress` não muda"); TASK-X02-2 passo 1 (só filiais "reusam o formatador"), teste unitário 32 (falsos MANUAL usam `formatGeocodingQuery`).
- **O que falta / está ambíguo:** para a fase de imóveis do legado não se diz qual texto é enviado (`fullAddress` como o worker, ou `formatGeocodingQuery` como os falsos MANUAL). Hoje as duas dão o **mesmo** resultado para imóvel (`street, addressLine2, suburb, state, postcode, country`, porque `number/complement/city` não existem), mas isso é coincidência não testada; se a F01 ou alguém mudar a ordem ou o tratamento de `city`, a prova 2 dos falsos MANUAL (5 m) passa a comparar geocodes de strings diferentes e vira ruído.
- **Por que importa:** divergência silenciosa entre o que o worker grava e o que o script usa como prova; falsos negativos em massa no `false-manual`.
- **Evidência:** `apps/backend/src/modules/property/domain/property.entity.ts:112-117` (`fullAddress`); X02-tarefas.md "(a) Formatador" (ordem e regra do `city`); X02-2 passo 1 sem a string para imóveis.
- **Proposta de regra/detalhe:** fixar "fase de imóveis e falsos MANUAL usam `formatGeocodingQuery({ street, addressLine2, suburb, state, postcode, country })`" e acrescentar ao `geocoding-address.test.ts` o caso 6: "para um `PropertyEntity`, `formatGeocodingQuery(entity) === entity.fullAddress`", que trava a equivalência enquanto `fullAddress` existir.
- **Precisa de decisão do dev?** Não.

## L-X02-09 · `--limit` e `--tenant` não dizem a que fases se aplicam nem como contam
- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-X02-2 · "Contratos (CLI)" (`--limit`: "máximo de entidades na regeocodificação"), "Ordem das fases".
- **O que falta / está ambíguo:** `--limit=20` no rollout de staging ("`--apply --limit=20`") é por fase (20 falsos MANUAL + 20 imóveis + 20 filiais), total, ou só imóveis? Conta candidatos selecionados ou chamadas à Mapbox (os ambíguos de audit não chamam)? E `--tenant` vale para a limpeza de previews (`appointment_imports.tenant_id`) e para a retomada em massa, ou só para "as fases de regeocodificação"?
- **Por que importa:** o roteiro de staging usa `--limit=20` como amostra para revisar pins; sem a regra, a amostra pode ser 60 linhas ou zero filiais.
- **Evidência:** X02-tarefas.md tabela de CLI e passo 2 do rollout.
- **Proposta de regra/detalhe:** `--limit` é **por fase** e conta entidades **selecionadas** (não chamadas); `--tenant` vale para todas as fases, inclusive `--strip-import-previews` e `--retry-failed-permanent`. Registrar no `regeocode.started` o `limit` e testar com um caso "`--limit=1` com 2 imóveis e 2 filiais → `scanned` 1 e 1".
- **Precisa de decisão do dev?** Não.
