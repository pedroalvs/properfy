# F01 · Lacunas

Revisão de `tarefas/F01-tarefas.md` (2026-10-28) contra o plano `F01-fundacoes-inspetor.md`, `decisoes.md`, os contratos de X02/F02/F04 e o snapshot read-only de `origin/develop` @ `042a9674`. Só entram pontos que um spec writer ou implementador teria de **adivinhar**. Decisões já fechadas (D1–D14) não são reabertas.

| Severidade | Qtd |
|---|---|
| ALTA | 2 |
| MÉDIA | 6 |
| BAIXA | 4 |
| **Total** | **12** |

Precisam de decisão do dev: L-F01-01, L-F01-03, L-F01-04, L-F01-05.

---

## L-F01-01 · Regras AU do endereço-base (estado, CEP, trim) não existem no schema — e abrem uma brecha no "não pode apagar"

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F01-1 › Contratos › Schemas shared (`inspectorBaseAddressSchema = branchAddressSchema`); TASK-F01-2 › Drawer › Validação; TASK-F01-3 › Card "Base address" › Validação.
- **O que falta / está ambíguo:**
  - O schema é um **alias** do `branchAddressSchema`, que hoje aceita `state: z.string().min(1).max(100)`, `postcode: z.string().min(1).max(20)`, `country: z.string().length(2)` e **não tem `.trim()`** em nenhum campo (`packages/shared/src/schemas/address.ts:16-27`; a X02 só remove lat/lng). O `propertyAddressSchema` do mesmo arquivo tem `.trim()`, o de filial não.
  - A regra "Postcode must be 4 digits" e o select de estado (NSW/VIC/…) valem **só na UI do PWA** ("os 4 dígitos valem só na UI AU; o schema aceita 1-20"). No web, State e Country são **texto livre** (padrão `BranchFormDrawer.tsx:208-222`), e a sugestão da Mapbox devolve o código (`NSW`) só quando há `short_code`; sem ele devolve o nome por extenso (`mapbox-address-lookup.service.ts:41-43`).
  - A regra "mesmo endereço (deep-equal) → não geocodifica" não diz se compara com `trim`/caixa nem o que fazer quando o `address` gravado é legado.
- **Por que importa:**
  1. **Brecha do "não removível":** `{ street: ' ', suburb: ' ', state: 'X', postcode: '0', country: 'AU' }` passa no schema (sem trim, `min(1)` aceita espaço), é gravado, e `formatGeocodingQuery` (que **trima** e omite partes vazias) manda `"X, 0, AU"` à Mapbox. Resultado: base "presente" sem coordenadas, equivalente a apagar, e o filtro "No base address" diz que o endereço existe mas "could not be located". A D1 fica sem efeito prático.
  2. **Web × PWA incompatíveis:** a OP cadastra pelo web `state: "New South Wales"` (ou um país ≠ AU); o inspetor abre `/profile/account`, o select de estado não tem essa opção, o form fica inválido ("Select a state") e ele é obrigado a redigitar um endereço que já estava certo. O backfill classifica esse mesmo endereço como compatível, mas o PWA o trata como "incomplete".
  3. Sem trim, `"NSW"` e `"NSW "` são endereços diferentes para o deep-equal → geocodificação permanente paga de novo a cada save "idêntico".
- **Evidência:** `address.ts:16-27` (sem trim, state/postcode livres); X02-tarefas.md:226 (o trim é do formatador, não do schema); F01-tarefas.md:159-161, 489-497 (web livre), 683-686 (PWA restrito); `mapbox-address-lookup.service.ts:28-49`.
- **Proposta de regra/detalhe:** derivar em vez de aliasar — `inspectorBaseAddressSchema = branchAddressSchema.extend({ street/number/complement/suburb/city: .trim() nos mesmos limites, state: z.string().trim().toUpperCase().pipe(z.enum(['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'])), postcode: z.string().trim().regex(/^\d{4}$/), country: z.literal('AU').default('AU') })`. O web usa o mesmo select de estado do PWA (ou mapeia o nome por extenso para o código ao selecionar a sugestão) e esconde Country. "Mesmo endereço" = igualdade campo a campo **dos dois lados parseados pelo schema**; se o atual não parsear (legado), sempre geocodifica. A mensagem de erro do web para estado inválido: "Select a state". O backfill passa a listar como `incompatible` os legados com estado por extenso (poucas linhas; o relatório já os expõe).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** Schema derivado com regras AU + trim, como acima; legado fora do padrão vira `incompatible` e segue o fluxo da variante 2.
  2. Manter o alias e aplicar as regras AU + trim só nas duas UIs (web e PWA iguais); a API continua aceitando qualquer coisa e a brecha 1 fica aberta.
  3. Schema derivado com `transform` que normaliza nome por extenso → código (NSW etc.) antes de validar; mais código, menos linhas incompatíveis no backfill.

## L-F01-02 · O `COALESCE` do heartbeat não existe em `updateMany` do Prisma; a garantia "nunca sobrescrito" não é provável como está escrita

- **Severidade:** ALTA
- **Tarefa/seção:** TASK-F01-1 › Regras do heartbeat (servidor); Casos de borda 8; Critério de aceite 6; teste `record-inspector-app-state.use-case.test.ts` ("dois standalone concorrentes → o primeiro").
- **O que falta / está ambíguo:** a regra diz `app_installed_at = COALESCE(app_installed_at, now())` em "uma escrita (`updateMany` com `where: { id, deleted_at: null }`)". O `data` do `updateMany` não referencia colunas, então o implementador precisa escolher entre (a) ler e depois escrever (duas operações, e a corrida de dois `standalone` deixa de ser "o primeiro vence"), (b) `$executeRaw` com SQL, ou (c) duas escritas (`updateMany` geral + `updateMany where app_installed_at IS NULL`). A F04 vai estender o **mesmo** use case com `onboarding_completed_at = COALESCE(...)` "na mesma escrita" (F04-tarefas.md:783), então a escolha vira contrato.
- **Por que importa:** com (a), o teste unitário passa com mocks e o caso de borda 8 ("dois `standalone` concorrentes → `app_installed_at` do primeiro") não é provado por nenhum teste de integração listado (a suíte db só cobre migration, Decimal e o CAS do backfill). O critério de aceite 6 fica sem prova real. Com (c), `count === 0 → 404` precisa vir da primeira escrita, não da segunda.
- **Evidência:** F01-tarefas.md:208-212, 222, 338-341; F04-tarefas.md:733, 783.
- **Proposta de regra/detalhe:** uma única instrução via `prisma.$executeRaw`: `UPDATE inspectors SET app_last_seen_at = $now, app_version = $v, push_enabled = $p, app_installed_at = CASE WHEN $mode = 'standalone' THEN COALESCE(app_installed_at, $now) ELSE app_installed_at END WHERE id = $id AND deleted_at IS NULL`; `affected === 0 → InspectorNotFoundError`. Colocar o SQL no repositório (`recordAppState()`), com `::text`/`::timestamptz` explícitos (memória "$queryRaw ::int"). Adicionar à suíte db `inspector-base-coords.integration.test.ts` um caso: dois `recordAppState` em paralelo com `standalone` → `app_installed_at` único e igual ao menor `now`. Documentar que a F04 acrescenta `onboarding_completed_at` nessa mesma instrução.
- **Precisa de decisão do dev?** Não.

## L-F01-03 · Trocar a base não diz nada sobre o plano do dia já publicado (contrato com a F04)

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F01-1 › Regras do geocode síncrono / Modelo de dados › Invariante; TASK-F01-3 › Card "Base address".
- **O que falta / está ambíguo:** a F01 grava `base_lat/base_lng` novos (ou os zera) sem emitir evento nem dizer o que acontece com um `DayPlan` `PUBLISHED` de hoje ou de D+1. A F04 lista os motivos de `STALE` (`APPOINTMENT_STATUS_CHANGED`, `GROUP_CHANGED`, `INSPECTOR_CANT_DO` — F04-tarefas.md:827) e **nenhum** é "base mudou"; a origem entra só no `inputFingerprint` (F04-tarefas.md:615), ou seja, o plano é recalculado quando o inspetor abrir, sem aviso `ROUTE_CHANGED`, sem marcar `STALE` para a OP, e as ETAs publicadas (congeladas, usadas pela F06 e pela métrica "Route ETA accuracy") continuam as da base antiga.
- **Por que importa:** o inspetor muda de casa às 21h, o plano de amanhã já foi publicado às 19:30 a partir da base antiga; o aviso matinal ao inquilino (F06) usa a ETA publicada errada; a OP no Dia ao Vivo vê um plano "fresco" calculado de outro ponto. Nenhuma das duas specs assume o caso, e ambas vão supor que a outra trata.
- **Evidência:** F01-tarefas.md:118, 205; F04-tarefas.md:51, 615, 827, 1140-1148.
- **Proposta de regra/detalhe:** registrar na F01 a regra mínima: "trocar a base **não** altera nenhum `DayPlan`; a F04 detecta pela `inputFingerprint` no próximo `GET`/recálculo". E, para que a F04 possa fazer mais sem reabrir a F01, publicar na F01 um ponto de extensão barato: constante `INSPECTOR_EVENTS.BASE_CHANGED` + `eventBus.emit({ inspectorId, hadCoordinates, hasCoordinates })` nos três use cases de escrita, após o commit, sem assinante nesta feature (o padrão de evento já existe: `INSPECTOR_FIELD_EVENTS.RECORDED` na F03).
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** F01 emite `BASE_CHANGED`; a F04 decide se marca `STALE` (novo `stale_reason 'BASE_CHANGED'`) para planos `PUBLISHED` de hoje/D+1 do inspetor.
  2. F01 não emite nada; a F04 confia só na `inputFingerprint` (plano muda silenciosamente ao abrir; ETAs publicadas ficam as antigas). Registrar isso na F04 como premissa.
  3. F01 bloqueia a troca de base quando existe plano publicado para hoje/D+1 (contraria D3 "edição livre"; não recomendado).

## L-F01-04 · `appVersion` vinda do `package.json` é constante: `0.1.0` desde o primeiro commit

- **Severidade:** MÉDIA
- **Tarefa/seção:** D12; TASK-F01-3 › Regras do heartbeat › `__APP_VERSION__`; TASK-F01-2 › "App version" no detalhe.
- **O que falta / está ambíguo:** `apps/pwa/package.json` está em `"version": "0.1.0"` desde `66f9a142` (único commit que tocou o campo) e não há processo de bump, release-please ou tag que o altere. Sem uma regra de bump ou um identificador de build, a coluna `app_version` terá o mesmo valor para todos os inspetores, para sempre.
- **Por que importa:** o objetivo do 00.10 é a operação saber "quem está em qual versão" (ex.: quem ainda não recebeu o push da F02 ou a Tela do Dia da F04). Com um valor constante, a coluna, o campo "App version" do detalhe e o passo 6 do smoke ("versão correta") não provam nada.
- **Evidência:** `git log -S'"version"' -- apps/pwa/package.json` → 1 commit; `apps/pwa/package.json:4`; não existe Dockerfile do PWA nem build-arg de SHA (`find -iname 'Dockerfile*'` → só backend).
- **Proposta de regra/detalhe:** `__APP_VERSION__ = \`${pkg.version}+${(process.env.APP_BUILD_SHA ?? 'dev').slice(0, 7)}\`` no `vite.config.ts`, com `APP_BUILD_SHA` injetado pelo workflow de build do PWA a partir de `GITHUB_SHA` (staging e prod). O rodapé mostra `v0.1.0+ab12cd3`; o web mostra o valor como vem. `max(40)` já comporta. Registrar que `pkg.version` só sobe em release (memória "Release major").
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** versão + SHA curto do build, injetado pelo CI.
  2. Bump manual de `package.json` em cada PR que muda o PWA (regra de processo, fácil de esquecer; CI poderia falhar se o PWA mudou e a versão não).
  3. Aceitar constante agora e revisitar na F02 (a coluna nasce inútil).

## L-F01-05 · Backfill: o dry-run chama a Mapbox? E a seleção `address IS NOT NULL` ignora `null` em JSON

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F01-1 › Script de backfill (passos 1-6); Caso de borda 11-12; Deploy passos 4 e 6.
- **O que falta / está ambíguo:**
  1. O passo 3 ("Geocodificação") não é condicionado a `--apply`; só a escrita (passo 5) é. Lido literalmente, o dry-run faz todas as chamadas em **modo permanente** (pagas, e sem gravar o resultado) e o `--apply` repete todas. A X02 resolveu isso explicitamente ("Geocodifica … só com `--apply`", X02-tarefas.md:659); a F01 não. Consequência no relatório: `notFound` e `failed` só podem existir se o dry-run geocodificar — o formato do relatório não diz o que esses campos valem no dry-run.
  2. O abort "sem config Mapbox" acontece "antes de ler as linhas" — também no dry-run? Em dev local sem Mapbox (passo 8 do deploy) o dry-run deixa de servir para revisar os incompatíveis.
  3. A seleção `address IS NOT NULL` não cobre o **JSON `null`**: o caminho de escrita atual passa `null` cru para uma coluna `Json?` (`create-inspector.use-case.ts:129` → `prisma-inspector.repository.ts:148`, com cast `as Prisma.InputJsonValue`; `update` idem na l. 197-198), e o Prisma distingue `DbNull` de `JsonNull`. Dependendo do que foi gravado, linhas "sem endereço" entram no `scanned`, caem em `incompatible` com `issues` do Zod e poluem o relatório que a OP vai revisar.
- **Por que importa:** custo dobrado na Mapbox (modo permanente) e um relatório de staging/prod que mistura "sem endereço" com "endereço quebrado", justamente a lista que o deploy manda revisar antes do `--apply`.
- **Evidência:** F01-tarefas.md:137-152, 399-401; X02-tarefas.md:659; `prisma-inspector.repository.ts:148,197-198`.
- **Proposta de regra/detalhe:** dry-run = **sem chamada à Mapbox** e sem exigir config: lê, valida, imprime `{ dryRun: true, scanned, compatible, incompatible: [...], toGeocode: n }` (sem `geocoded/notFound/failed`). `--apply` exige config (abort antes de ler linhas) e geocodifica. Seleção no Prisma: `where: { deleted_at: null, base_lat: null, AND: [{ address: { not: Prisma.DbNull } }, { address: { not: Prisma.JsonNull } }] }` e testar no `.test.ts` com uma linha `JsonNull` → fora do `scanned`. De quebra, trocar o `?? null` do create por `Prisma.DbNull` para parar de gerar o caso.
- **Precisa de decisão do dev?** Sim.
  1. **(recomendada)** dry-run sem geocodificação (relatório estrutural); `--apply` geocodifica.
  2. Dry-run geocodifica em modo `temporary` só para contar `notFound` (não grava; mas o relatório "guardado no registro do deploy" com resultados temporários é zona cinzenta nos termos da Mapbox).
  3. Dry-run geocodifica em modo permanente (custo em dobro; aceitável pelo volume de dezenas de linhas, mas contraria a X02).

## L-F01-06 · Limites: "10/min por usuário" não é o que o plugin faz, e `PATCH /me` com endereço não tem limite nenhum

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F01-1 › Contratos › `POST /v1/inspectors/me/app-state` (429 "10/min por usuário, `config.rateLimit`"); `PATCH /v1/inspectors/me`; TASK-F01-3 › Throttle › "429: grava, para não insistir".
- **O que falta / está ambíguo:**
  - `@fastify/rate-limit` está registrado **por IP** (`main/plugins.ts:65-66`), e `config.rateLimit` por rota herda a chave; só `fy.routes.ts:67` define um `keyGenerator`. "Por usuário" exige um `keyGenerator` com `request.authContext.userId`, que a tarefa não cita.
  - O cliente trata 429 como "enviado" (grava o storage e fica 6 h sem tentar). Com chave por IP, 11 inspetores atrás do mesmo NAT (escritório, treinamento, Wi-Fi do prédio) no mesmo minuto → os seguintes perdem o heartbeat (e a primeira abertura instalada) por 6 h.
  - `PATCH /v1/inspectors/me` com `address` dispara uma geocodificação **permanente paga** por chamada e não tem limite por rota; um inspetor (ou um script com o token dele) pode gerar chamadas Mapbox à vontade. O mesmo vale, com menos risco, para a OP.
- **Por que importa:** o teste "11 chamadas em 1 min → 429" passa com qualquer chave, então a diferença não é detectada; e o custo do modo permanente fica sem teto.
- **Evidência:** `apps/backend/src/main/plugins.ts:65-66`; `fy.routes.ts:64-79`; F01-tarefas.md:192, 726.
- **Proposta de regra/detalhe:** `config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (req) => req.authContext?.userId ?? req.ip } }` em `app-state` **e** em `PATCH /v1/inspectors/me` (o inspetor não edita o perfil 10 vezes por minuto). Teste de integração: dois usuários no mesmo IP, 10 chamadas cada → nenhum 429. No cliente, manter "429 grava", já que com chave por usuário só o próprio excesso é penalizado.
- **Precisa de decisão do dev?** Não.

## L-F01-07 · A lista AM/OP precisa devolver `address` (ou um booleano) para o tooltip do badge

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F01-1 › Contratos › `GET /v1/inspectors`; Testes `list-inspectors.use-case.test.ts`; TASK-F01-2 › Tabela › Badge "No base address".
- **O que falta / está ambíguo:** o web decide o tooltip do badge pelo par `address`/`baseLat` ("Missing base address" se `address` nulo; "Address could not be located" se presente). Hoje o ramo AM/OP da lista **não devolve `address`** (`list-inspectors.use-case.ts:118-130`, só o `get` devolve). A tabela de visibilidade diz "sim" para `address` em AM/OP, mas o passo 5 e os testes da lista só citam "adoção e coords" para OP e `address` para o ramo INSP. Um implementador que siga os testes deixa `address` fora da lista e o web não tem como distinguir as duas variantes.
- **Por que importa:** o badge mostra o tooltip errado (ou o web tenta um `GET` por linha), e o filtro "No base address" lista os dois casos sem dizer qual é qual — o sinal operacional que a tarefa chama de "painel".
- **Evidência:** `list-inspectors.use-case.ts:118-130`; F01-tarefas.md:179-183, 295-300, 521.
- **Proposta de regra/detalhe:** o item da lista para AM/OP inclui `address` (JSON como está, `z.unknown().optional()` já cobre) — ou, se quiser evitar JSON em lista paginada, um `hasBaseAddress: boolean` declarado no `inspectorResponseSchema`. Acrescentar o caso ao teste da lista: "OP recebe `address`" e ao de visibilidade.
- **Precisa de decisão do dev?** Não.

## L-F01-08 · Vários dispositivos por inspetor: semântica de "último estado" e os casos de detecção não estão escritos

- **Severidade:** MÉDIA
- **Tarefa/seção:** TASK-F01-1 › Regras do heartbeat; TASK-F01-2 › Colunas App/Push/Last seen; TASK-F01-3 › Throttle / Valores.
- **O que falta / está ambíguo:** o plano decidiu "basta o último estado no Inspector" (sem tabela por dispositivo), mas a tarefa não enuncia as consequências que o web vai mostrar:
  - `push_enabled` é **o último aparelho que reportou**: celular instalado com `granted` → depois o inspetor abre no Chrome do desktop (`browser`, `default`) → a coluna "Push" vira "Off" enquanto o celular tem push. Até a F02 redefinir (F02 D10), o tooltip "Browser notification permission" não diz "do último aparelho".
  - "App: Installed" conta **qualquer** standalone: Chrome desktop instalado e Safari macOS "Add to Dock" (`getIsStandalone()` em `useInstallPrompt.tsx:16-23` só olha `display-mode` e `navigator.standalone`) marcam o inspetor como instalado sem nenhum celular.
  - Android Chrome: o app instalado **compartilha** o `localStorage` com a aba do navegador; alternar aba ↔ app dispara um POST a cada troca (o bypass "displayMode diferente do salvo") — não é bug, mas precisa estar escrito, inclusive para o passo 4 do smoke ("recarregar dentro de 6 h → nenhum POST").
  - iOS: o app da tela inicial tem storage **isolado** do Safari (a chave de throttle e o logout de um não afetam o outro); iOS < 16.4 instalado → `unsupported`; navegadores embutidos (Gmail, Instagram) → `browser`. A tarefa cobre só "Safari fora do standalone".
  - `app_version` também é "do último aparelho".
- **Por que importa:** a OP lê "Push: Off" e manda SMS/cobra o inspetor que tem push ligado; "Installed" num inspetor que só instalou no desktop vira falso positivo na adoção; o QA reporta "POST duplicado" no Android como bug.
- **Evidência:** `useInstallPrompt.tsx:16-23`; F01-tarefas.md:208-212, 518-520, 722-731, 742.
- **Proposta de regra/detalhe:** escrever a regra "**último heartbeat vence** para `push_enabled`, `app_version` e `app_last_seen_at`; `app_installed_at` é o primeiro standalone de qualquer aparelho (desktop incluído)". Copy: tooltip Push "Browser notification permission on the last device seen" e App "Installed on {date} (any device)". Listar no PWA os casos acima como esperados (não bugs) e acrescentar ao teste do hook: "`standalone` → `browser` → `standalone` com storage compartilhado → 3 POSTs".
- **Precisa de decisão do dev?** Não.

## L-F01-09 · "Last seen" pode estar até 6 h atrasado e a UI sugere tempo real

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F01-2 › Tabela › "Last seen" relativo ("3 h ago"); Detalhe › "Last seen".
- **O que falta / está ambíguo:** com o throttle de 6 h por aparelho, "3 h ago" pode significar "abriu há 3 h" ou "abriu há 9 h e o heartbeat de 6 h atrás foi o último permitido". Nada no copy ou tooltip avisa.
- **Por que importa:** a OP vai usar a coluna para decidir se o inspetor "está ativo hoje" (F05 lê a mesma coluna). Um "2 h ago" às 15h pode ser um inspetor que abriu às 07h.
- **Evidência:** F01-tarefas.md:520, 534, 722-724.
- **Proposta de regra/detalhe:** tooltip absoluto "Last reported {date time} (Sydney) · reported at most every 6 h" no web (tabela e detalhe). Sem mudança de dado.
- **Precisa de decisão do dev?** Não.

## L-F01-10 · Coordenadas da base nos audits contrariam a norma adotada por F03/F04

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F01-1 › Auditoria e observabilidade (`inspector.created/updated/self_profile_updated` com `baseLat/baseLng`; `inspector.base_geocoded` com `after: { baseLat, baseLng }`).
- **O que falta / está ambíguo:** a F03 fixou (D10) que audits **novos** não gravam lat/lng do inspetor, e a F04 seguiu isso no `day_plan.origin_overridden` (`after { suburb, state, postcode }`, "sem coordenadas"). A F01 grava `baseLat/baseLng` em quatro ações. Hoje não vaza para CL (audits de `Inspector` não têm `tenant_id` e o CL_ADMIN é escopado por tenant em `list-audit-logs.use-case.ts:104`), mas a norma fica inconsistente entre as specs e a máscara de leitura da F03 precisa conhecer mais chaves.
- **Por que importa:** a próxima pessoa que abrir o audit de inspetor para CL (ou exportar audits) precisa descobrir que `baseLat/baseLng` estão lá; e três specs com três regras para "coordenada em audit" viram dívida.
- **Evidência:** F01-tarefas.md:385-386; F03-tarefas.md:46; F04-tarefas.md:665, 1089.
- **Proposta de regra/detalhe:** alinhar à F03/F04: before/after com `address` (o endereço já é PII aceita para AM/OP) e `baseLocated: boolean` + `baseGeocodedAt`, **sem** lat/lng; `inspector.base_geocoded` com `metadata: { source: 'backfill' }` e `after: { baseLocated: true, baseGeocodedAt }`. Se o dev preferir manter as coordenadas, registrar a exceção na F03 (lista de chaves mascaradas).
- **Precisa de decisão do dev?** Não.

## L-F01-11 · Ordem do geocode no create não está definida (e o create escreve `User` e `Inspector` sem transação)

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F01-1 › Passo 3 (`create-inspector.use-case.ts`) e Regras do geocode síncrono.
- **O que falta / está ambíguo:** o use case hoje verifica conflito de e-mail (l. 66-77), grava o `User` (l. 116) e depois o `Inspector` (l. 156), "fora de uma transação compartilhada" (comentário na l. 146). A tarefa não diz **onde** entra a chamada síncrona de até 4 s: antes de qualquer escrita, entre as duas escritas, ou depois (com um `update` extra).
- **Por que importa:** se entrar entre as escritas, um timeout/erro inesperado do geocoder (que "nunca lança", mas um bug lança) deixa `User` sem `Inspector` — exatamente a inconsistência que o comentário da l. 146 tenta conter. Se entrar depois, há duas escritas no `Inspector` e o audit `inspector.created` pode sair antes das coords.
- **Evidência:** `create-inspector.use-case.ts:66-77, 116, 146-156`; F01-tarefas.md:200-205, 355-358.
- **Proposta de regra/detalhe:** ordem fixa: validar → conflito de e-mail → `geocodeInspectorBase` (sem I/O de escrita antes) → `userRepo.save` → `inspectorRepo.save` com coords → audit único. Mesmo princípio nos dois updates: geocodificar antes do `update`.
- **Precisa de decisão do dev?** Não.

## L-F01-12 · Posição do `push-preference-slot` diverge do que a F02 espera

- **Severidade:** BAIXA
- **Tarefa/seção:** TASK-F01-3 › UI › `/profile/settings`; D8.
- **O que falta / está ambíguo:** a F01 descreve "container vazio `<div data-testid="push-preference-slot" />`" sem dizer onde fica em relação ao `InstallAppCard` e ao rodapé. A F02-3 assume o card de push "dentro de `data-testid="push-preference-slot"`, **acima** do `InstallAppCard`" (F02-tarefas.md:1297) e que o teste da página continua verificando `InstallAppCard` e rodapé.
- **Por que importa:** se a F01 colocar o slot abaixo do card de instalação, a F02 reposiciona e reescreve o teste que a F01 acabou de criar.
- **Evidência:** F01-tarefas.md:715-717, 796; F02-tarefas.md:1091, 1144, 1297.
- **Proposta de regra/detalhe:** "o slot é o primeiro filho do conteúdo, acima do `InstallAppCard`; o rodapé de versão é o último". Teste da página: ordem DOM slot → `InstallAppCard` → rodapé.
- **Precisa de decisão do dev?** Não.
