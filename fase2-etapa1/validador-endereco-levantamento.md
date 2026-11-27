# Validador de endereço em tela: levantamento e proposta

> Autor: Prumo (planejador). Data: 24/11/2026. Somente leitura: nenhum código foi alterado.
> Base: `origin/develop` em `cb29be6b`, que já tem o PR-18 #1390 (regra A) e o #1391.
> Também lidos os worktrees que estão em voo: `wt-pr-16`, `wt-pr-17` e `wt-pr-18b`.
> Origem: decisão 21 do Pedro (24/11) em `plano-execucao-pos-validacao.md` §6.
> **Não é item do anexo.** É uma adição decidida pelo Pedro, ligada aos itens 00.4, 00.A5, 01.2 e 01.A3 do anexo, que usam o endereço-base. A Entrega C (mídias) não trata de endereço. X02 é tarefa interna de conformidade com os termos do Mapbox, também fora do anexo.
> Convenção: textos de tela em inglês; o resto em português.

**Regra A** (PR-18, `apps/backend/src/modules/property/domain/geocoding.service.ts:47-59`, `classifyGeocodingResult`):
- Sucesso: só o tipo `address` com `relevance >= 0,8`.
- Rejeitado (`COARSE_RESULT`): qualquer outro tipo. Exemplos: `locality`, `place` e `postcode`. Inclui endereço rural.
- Rejeitado (`LOW_RELEVANCE`): `address` com relevância abaixo de 0,8.
- Sem resultado (`null`): também é falha.

---

## 1. Inventário: onde um endereço entra no sistema

Legenda:
- **Digitação**: *busca* = `AddressLookupInput` com sugestões; *livre* = só campos de texto.
- **Backend**: *síncrono* = geocodifica na própria requisição; *worker* = job `property.geocode`.
- **Falha**: o que o usuário vê hoje quando a geocodificação falha.

### 1.1 Imóvel: criação pela página (web)

**Tela:** `apps/web/src/features/properties/pages/PropertyCreatePage.tsx`

**Como o endereço é digitado:**
- Busca opcional, em `:250-262`.
- Ao escolher uma sugestão, `applyAddressSuggestion` (`:100-119`) copia street, suburb, postcode, state e country.
- Os campos Street, Address Line 2, Suburb, Postcode, State e Country continuam editáveis.
- **Não é preciso escolher uma sugestão**: dá para digitar tudo à mão.
- As coordenadas da sugestão nunca são enviadas (X02, CA2).

**O que o backend faz:**
- `POST /v1/properties` (`property.routes.ts:92`) chama `CreatePropertyUseCase` (`create-property.use-case.ts:186-240`).
- Geocodificação **síncrona** em modo permanente, com limite de 4 s (`geocodeWithTimeout`, `GEOCODE_SYNC_TIMEOUT_MS`).
- O resultado é aplicado por `applyGeocodingResult` (`property.entity.ts:112-133`):
  - regra A aceita → `SUCCESS`;
  - rejeita ou sem resultado → `FAILED` com `geocoding_failure_code`.
- Se der timeout ou erro, o imóvel fica `PENDING` e entra no job `property.geocode`. O worker aplica a mesma regra (`geocode.worker.ts`).

**O que o usuário vê na falha:**
- Ao salvar, sempre aparece "Property created. Geocoding in progress." (`:148`), mesmo quando o imóvel já foi gravado como `FAILED`.
- A falha só aparece depois, no detalhe do imóvel, `PropertyDetailPage.tsx:141-154`: "Geocoding failed. Please verify the address or retry."
- O botão "Retry Geocoding" aparece só para AM e OP.
- O `GeocodingStatusBadge` aparece na tabela e no detalhe.

**Pino manual:** não existe na criação.

### 1.2 Imóvel: drawer de criação e edição (web)

**Tela:** `apps/web/src/features/properties/components/PropertyFormDrawer.tsx`

**Como o endereço é digitado:**
- A mesma busca opcional (`:283-292`) e os mesmos campos livres.
- Na edição de um imóvel `MANUAL`, escolher uma sugestão limpa as coordenadas (`:133-160`, X02 L-X02-02).

**O que o backend faz:**
- Criação: igual ao 1.1.
- Edição: `PATCH` chama `UpdatePropertyUseCase` (`update-property.use-case.ts:184-263`).
  - Se o endereço mudou, o imóvel vai para `PENDING` e entra no **job** (`:236-263`). A edição **nunca geocodifica de forma síncrona**.

**O que o usuário vê na falha:**
- "Property created successfully" ou "Property updated successfully" (`:186`). Nada sobre a geocodificação.

**Pino manual:**
- **Sim, só na edição.** É a seção "Coordinates", com Latitude e Longitude em texto (`:389-414`, hint "Optional. Manually override geocoded coordinates.").
- O backend grava `MANUAL` quando o par de coordenadas difere do que está salvo (`update-property.use-case.ts:198-214`).
- Papéis: AM, OP, CL_ADMIN e CL_USER (`:86-93`).
- Não há mapa para escolher o ponto.

### 1.3 Imóvel criado dentro do agendamento (web)

- `AppointmentFormDrawer.tsx:1229-1238` abre o **mesmo** `PropertyFormDrawer` em modo de criação (`propertyId={null}`, `lockBranch`).
- Herda tudo o que está descrito em 1.2 e em 1.1 no backend.

### 1.4 Imóvel criado pela API, embutido no `POST /v1/appointments`

- O schema `inlinePropertySchema` (`packages/shared/src/schemas/appointment.ts:11-21`) aceita endereço só em texto livre.
- `create-appointment.use-case.ts:260-275` chama `CreatePropertyUseCase`, ou seja, o mesmo comportamento de 1.1.
- **Nenhum chamador web foi encontrado.** É um caminho só de API.

### 1.5 Filial (web)

**Tela:** `apps/web/src/features/tenants/components/BranchFormDrawer.tsx`

**Como o endereço é digitado:**
- Busca opcional (`:175`) mais campos livres: Street, Suburb, Postcode, State e Country.
- O campo "Address" **não é obrigatório**: uma filial pode ser salva sem endereço.
- Quando o endereço é digitado à mão, `:94-95` inicializa `latitude: 0, longitude: 0` no estado.
  - O backend descarta esses valores (`branchAddressSchema` não tem coordenadas e o Zod remove a chave).

**O que o backend faz:**
- `create-branch.use-case.ts:87-120`: geocodificação **síncrona** permanente com limite de 4 s.
- `update-branch.use-case.ts:104-121`: geocodifica só quando o endereço mudou (`isSameGeocodingAddress`).
- **Ainda sem a regra A em `develop`.** O PR de cobertura (`wt-pr-18b`, branch `fix/geocoding-rule-a-remaining-persist-paths`) aplica a regra: rejeitado → salva sem coordenada.

**O que o usuário vê na falha:**
- Nada. Aparece "Branch created successfully" ou "Branch updated successfully" (`:129`).
- **Nenhum código lê coordenada de filial.** Isso está registrado no X02, e `formatBranchAddress` em `prisma-fy.repository.ts:234` só usa os textos.

**Pino manual:** não existe.

### 1.6 Endereço-base do inspetor: drawer web (AM e OP)

**Tela:** `apps/web/src/features/inspectors/components/InspectorFormDrawer.tsx:286+`

**Como o endereço é digitado:**
- **Texto livre, sem busca.** Seção "Base Address" com Street, Number, Complement, Suburb, City, State e Postcode.
- Obrigatório na criação (`required={!isEditMode}`).
- **Divergência:** a TASK-F01-2 (`tarefas/F01-tarefas.md:574-621`) previa a busca aqui. O código em `develop` não tem.

**O que o backend faz:**
- `create-inspector.use-case.ts:114-126` e `update-inspector.use-case.ts:190` chamam `geocodeInspectorBase` (`inspector/application/services/geocode-inspector-base.ts:47-85`).
- Geocodificação **síncrona** permanente, já com a regra A.
- Nunca lança erro: salva o endereço **sem coordenada** e devolve `baseGeocodeFailed: true`.

**O que o usuário vê na falha:**
- Nada no drawer. Aparece "Inspector created successfully" ou "Inspector updated successfully" (`:190`). O `baseGeocodeFailed` é ignorado.
- Depois, no detalhe e na lista, aparece o badge ou filtro "No base address" (F01-2), e o PWA mostra o banner.

**Pino manual:** não existe.

### 1.7 Endereço-base do inspetor: PWA (o próprio inspetor)

**Tela:** `apps/pwa/src/features/profile/pages/ProfileAccountPage.tsx` mais `apps/pwa/src/features/profile/components/BaseAddressFields.tsx`

**Como o endereço é digitado:**
- **Texto livre, sem busca, por decisão.** O comentário em `BaseAddressFields.tsx:13-14` registra: "No autocomplete suggestions (F01 D11 / DB4)".
- A rota de sugestões **proíbe o papel INSP** (`search-addresses.use-case.ts:18-20`).

**O que o backend faz:**
- `update-inspector-self-profile.use-case.ts:95-106` chama `geocodeInspectorBase`: síncrono, já com a regra A, salva sem coordenada na falha.

**O que o usuário vê na falha:**
- "Saved, but we couldn't locate this address. Please check it." (`ProfileAccountPage.tsx:246-249`, estado `geocode-failed`, `role="status"`).
- Depois aparece o banner `BaseAddressBanner.tsx:31`: "We couldn't locate your base address — please check it".

**Modo offline:**
- `useUpdateInspectorSelf` chama `api` direto, **sem fila offline**. Offline, a mutação falha.
- Não há mensagem de offline dedicada nessa tela.

**Pino manual:** não existe.

### 1.8 Ponto de partida do dia: PWA OriginSheet

**Tela:** `apps/pwa/src/features/day-plan/components/OriginSheet.tsx`

**Como o endereço é digitado:**
- Texto livre, os mesmos `BaseAddressFields` do perfil. Sem busca (F04 DB4).

**O que o backend faz:**
- `PUT /v1/inspector/day-plans/:date/origin` chama `day-plan-origin.use-case.ts:123-130`.
- Geocodificação **síncrona** permanente.
- Sem resultado → **422** `DAY_PLAN_ORIGIN_NOT_FOUND` "We couldn't find this address. Check it and try again." (`day-plan.errors.ts:65-70`).
- Erro ou timeout → 503 com `DayPlanOriginGeocoderUnavailableError`.
- **Não aplica a regra A.** Um resultado no nível de CEP ou cidade é aceito como origem. A decisão 20 deixou este caminho fora do PR de cobertura e o mandou para o estacionamento.

**O que o usuário vê na falha:**
- **Já é um validador ao salvar:** a mensagem do servidor aparece em `role="alert"` (`:97`, `:109`, `:128-132`) e o formulário continua aberto.

**Modo offline:**
- **Só funciona online.** Mostra "You're offline. Connect to change your starting point." (`:133-137`).

**Pino manual:** não existe. O plano usa a base do inspetor se a origem do dia não for trocada.

### 1.9 Importação de agendamentos: planilha e prévia (web)

**Arquivo:** a importação de imóveis foi removida. Hoje imóvel novo só entra pela planilha de **agendamentos**.

**Como o endereço é digitado:** texto livre nas colunas da planilha.

**Prévia (backend):**
- `preview-appointment-import.use-case.ts:156` chama `applyGeocodeVerification` (`property/application/services/apply-geocode-verification.ts`), que usa `ImportGeocodeVerifier` (`import-geocode-verifier.ts`).
- Geocodificação **síncrona e em lote**:
  - limite de 4 s por endereço;
  - 5 em paralelo;
  - orçamento de 15 s por lote;
  - no máximo 300 endereços.
- O resultado é guardado em `previewJson`.
- Classificação:
  - `found`: tem coordenada, reaproveitada no commit;
  - `not_found`: vira **aviso que não bloqueia** `ADDRESS_NOT_FOUND`, "Address was not found by geocoding — the property will be created but flagged for manual location" (`apply-geocode-verification.ts:75-80`);
  - `unverified`: timeout, orçamento estourado ou acima de 300.
- **Ainda sem a regra A em `develop`.** O PR de cobertura (`wt-pr-18b`) aplica: rejeitado → `not_found`, e o imóvel é gravado como falha.

**Commit (backend):**
- `appointment-import-commit.worker.ts:262-360` grava o imóvel com `propertyRepo.save` **sem** passar pelo `CreatePropertyUseCase`.
- `found` → `SUCCESS`; `not_found` → `FAILED`; `unverified` → `PENDING` mais job.

**O que o usuário vê na falha:**
- Na prévia: `AppointmentImportPreview.tsx:38-48`, com `GeocodingStatusBadge` em `FAILED` ou `PENDING`, via `lib/geocode-verification.ts`, mais o aviso por linha.
- O usuário **consegue importar mesmo assim**.

**Pino manual:** depois, pela edição do imóvel (1.2).

### 1.10 Script de reprocessamento: `regeocode-permanent` (CLI)

- Script operacional (`apps/backend/src/scripts/regeocode-permanent.ts`). Não é tela.
- O PR de cobertura aplica a regra A: rejeitado → mantém a coordenada antiga.
- Fora do validador.

### 1.11 Outros pontos verificados, sem entrada de endereço

- **App credentials** (`/v1/app-credentials`): só nome, usuário e senha de app de terceiro.
- **Fy agent** (`/v1/integrations/fy/*`, chave de API com escopo `bot:fy`): notas, contato e reenvio de aviso. Só **lê** endereço (`prisma-fy.repository.ts`).
  - A chave de API só é usada pelas rotas do Fy (`api-key-auth-middleware.ts`).
  - Nenhuma integração grava endereço.
- **Portal do inquilino** (`features/rental-tenant-portal`): só **exibe** o endereço (`AppointmentInfoCard`, `AddToCalendarActions`). O inquilino não digita endereço.
- **Contatos e regiões**: `RelationsTab` só exibe; `RegionMap` desenha polígonos, sem endereço postal.
- **Re-geocodificar** (`POST /v1/properties/:id/geocode`, AM e OP, `geocode-property.use-case.ts`): reenvia para o worker e recusa imóvel `MANUAL` (`:39`).

### 1.12 Resumo do inventário

| # | Ponto | Digitação | Busca obrigatória? | Backend | Regra A hoje | Falha visível ao salvar? | Pino manual |
|---|---|---|---|---|---|---|---|
| 1.1 | Imóvel, página de criação | busca + livre | não | síncrono 4 s → worker | sim | não ("Geocoding in progress") | não |
| 1.2 | Imóvel, drawer (criação) | busca + livre | não | síncrono → worker | sim | não | não |
| 1.2 | Imóvel, drawer (edição) | busca + livre | não | **só worker** | sim (worker) | não | **sim** (Lat/Lng em texto) |
| 1.3 | Imóvel no agendamento | = 1.2 criação | não | = 1.1 | sim | não | não |
| 1.4 | Imóvel embutido na API | livre (JSON) | — | = 1.1 | sim | resposta 201 com status | não |
| 1.5 | Filial | busca + livre, opcional | não | síncrono | **não** (PR de cobertura em voo) | não | não |
| 1.6 | Base do inspetor (web) | **livre** | — | síncrono | sim | **não** (ignora `baseGeocodeFailed`) | não |
| 1.7 | Base do inspetor (PWA) | **livre** (D11) | — | síncrono | sim | sim, aviso "Saved, but…" | não |
| 1.8 | Origem do dia (PWA) | **livre** (DB4) | — | síncrono, **recusa** sem resultado | **não** | **sim, já bloqueia** | não |
| 1.9 | Importação, prévia | planilha | — | lote síncrono | **não** (PR de cobertura em voo) | aviso que não bloqueia | via 1.2 |

---

## 2. O que já existe para reaproveitar

| Peça | Onde | Observação |
|---|---|---|
| `AddressLookupInput` | `apps/web/src/components/forms/AddressLookupInput.tsx` (271 linhas) | Combobox acessível: `role="combobox"`, `aria-activedescendant`, Home/End/Esc/Tab, linha de status com `aria-live`, mínimo de 3 caracteres, debounce de 300 ms. Não obriga escolher sugestão. Não mostra estado "verificado" nem erro. |
| `useAddressSuggestions` | `apps/web/src/features/properties/hooks/useAddressSuggestions.ts` | `limit 5`, `staleTime 60s`. Fica em `features/properties`, mas é usado também por filial. |
| Rota de sugestões | `GET /v1/address/suggestions`, `property.routes.ts:59-89` | 30 por minuto por usuário. **INSP recebe 403** (`search-addresses.use-case.ts:18`). Usa Mapbox v5 **temporário** com `types=address` e `autocomplete=true` (`mapbox-address-lookup.service.ts:81-86`), com cache **em memória de 5 min** (`cached-address-lookup.service.ts`). **Não devolve `relevance`.** |
| Regra A | `classifyGeocodingResult`, `geocoding.service.ts:47-59` | Fonte única. Já usada em imóvel, worker e base do inspetor. O PR de cobertura leva a regra para filial, importação e script. |
| Geocodificação síncrona | `geocodeWithTimeout`, `property/application/services/geocode-with-timeout.ts` | Permanente por padrão, 4 s. Já roda na criação de imóvel, filial, base e origem. |
| Erro com campo que a tela já exibe | OriginSheet (422 → `role="alert"`) e `FormField error` no web | Modelo "valida ao salvar" já em produção no PWA. |
| Prévia da importação | `apply-geocode-verification.ts` + `AppointmentImportPreview.tsx` | Já separa `found`, `not_found` e `unverified` por linha. Falta só a severidade. |
| Badge e banner de falha | `GeocodingStatusBadge`, `PropertyDetailPage.tsx:120-154`, `BaseAddressBanner` | Estados para registro legado já inválido. |
| Pino manual (imóvel) | `PropertyFormDrawer.tsx:389-414` + `update-property.use-case.ts:198-214` | Único caminho `MANUAL` que existe. Só na edição. |

`★ Insight ─────────────────────────────────────`
- **Uma sugestão do autocomplete não garante que o endereço passe na regra A.** A sugestão vem do modo temporário com `autocomplete=true`. A gravação faz outra consulta, permanente, com o texto montado dos campos, incluindo "Address Line 2". Essa segunda consulta pode voltar com relevância menor. Obrigar a escolha de uma sugestão não fecha o problema; só a verificação no momento de salvar fecha.
- A consulta permanente **já é feita e cobrada** em todo salvamento. Validar ao salvar é mudar o desfecho de "grava FAILED" para "recusa com erro no campo". Não acrescenta chamada ao Mapbox.
`─────────────────────────────────────────────────`

---

## 3. Restrições

### 3.1 Termos do Mapbox (X02)

- **Só coordenada de geocodificação permanente pode ser guardada.** As coordenadas da sugestão, que vêm do modo temporário, **nunca** podem ser gravadas (X02 CA2; `branchAddressSchema` e o drawer de imóvel já descartam).
- O validador **não pode** usar a coordenada da sugestão como prova de endereço válido. Pode usar a sugestão só para preencher os campos de texto.
- **Pré-existente, sem mudança aqui:** a rota de sugestões guarda o resultado temporário em memória por 5 min (`CachedAddressLookupService`). O X02 deixou isso fora do escopo ("continuam temporários"). Vale uma consulta jurídica à parte se o Pedro quiser. O validador não amplia esse uso.
- Um resultado permanente **rejeitado** simplesmente não é gravado. Guardar resultado permanente é permitido, mas não obrigatório.

### 3.2 Custo e limites

- **Permanente:** US$ 0,005 por requisição, sem faixa gratuita (X02, preço de 28/10). Cada tentativa de salvar com endereço novo custa uma chamada, **igual a hoje**. Uma tentativa recusada que o usuário corrige custa mais uma. Mesmo com 5 tentativas, o custo é desprezível.
- **Temporário** (sugestões): 100 mil por mês grátis.
  - A opção "botão Check address antes de salvar" (§5.1, alternativa B) somaria uma chamada temporária por verificação, mas sairia barata.
  - O resultado temporário pode ser mostrado, mas não guardado, então serve só como sinal.
  - Risco: o resultado temporário diverge do permanente.
- **Limite das sugestões:** 30 por minuto por usuário. A importação tem teto de 300 endereços por lote e orçamento de 15 s. Sem mudança.
- **Latência:** a edição de imóvel hoje não espera a geocodificação; ela vai para o worker. Validar na edição **acrescenta até 4 s** ao `PATCH` quando o endereço muda. A criação já espera.

### 3.3 App offline

- A fila offline da Fase 1 cobre início e fim de execução. **Endereço nunca entra na fila.**
  - Base no perfil: chamada direta à API.
  - Origem: só online, já com aviso.
- Validar exige servidor e Mapbox, portanto só funciona online. Offline, a tela precisa dizer isso, e não fingir que salvou.
- O perfil (1.7) não tem aviso de offline. A proposta acrescenta um (§5.5).

### 3.4 Acessibilidade (padrão do projeto, WCAG)

- O erro fica **no campo**: `FormField error` + `aria-invalid` + `aria-describedby`. Também é anunciado no resumo com `role="alert"`, como o OriginSheet já faz.
- O foco vai para o primeiro campo de endereço depois de uma recusa.
- Sem cor como único sinal. O texto diz o que corrigir.
- A linha de status do `AddressLookupInput` (`aria-live="polite"`) continua como está. O estado "verificado" (se adotado) precisa de texto, não só de ícone.

### 3.5 Endereço rural legítimo

- Pela decisão 17, rural é falha: a regra exige `address` com relevância ≥ 0,8.
- Na consulta real de 24/11:
  - um rural só com localidade voltou "place" com 0,67;
  - um rural com número voltou outro endereço a ~150 km, também com 0,67.
- Se o validador **bloquear sem saída**, um imóvel rural real **nunca** é cadastrado.
- **Saída possível em cada ponto:**
  - **Imóvel:** pino manual. Já existe na edição; falta na criação (decisão V2).
  - **Filial:** nenhuma. A coordenada da filial não é usada por nada.
  - **Base do inspetor:** nenhuma hoje. Uma opção nova seria "Use my current location" pelo GPS do aparelho; não usa Mapbox, então não há questão de termos. Mas é funcionalidade nova (decisão V3).
  - **Origem do dia:** não precisa. Sem origem, o plano usa a base.
  - **Importação:** a linha precisa de outra saída (decisão V5).

### 3.6 Dados existentes já inválidos

- Existem imóveis `FAILED` (inclusive os que o regeocode vai marcar), bases "not located" e filiais sem coordenada.
- **Regra proposta:** validar **só quando o endereço muda**.
  - Editar outro campo (notas, aluguel, branch) de um registro inválido **não** pode ser bloqueado.
  - O backend já detecta a mudança nos três lugares: `addressChanged` em imóvel, `isSameGeocodingAddress` em filial, base e origem.
- Ao abrir a edição de um registro inválido, a tela mostra um aviso (não bloqueia) com o caminho para corrigir.

### 3.7 Provedor fora do ar ou timeout

- Hoje, em timeout ou erro:
  - imóvel fica `PENDING` (worker);
  - filial e base salvam sem coordenada;
  - origem devolve 503.
- "Não aceitar endereço inválido" é diferente de "não aceitar endereço **não verificado**". Bloquear todo cadastro quando o Mapbox cai é regressão operacional (decisão V4).

---

## 4. Conflitos com o que está em voo ou acabou de entrar

| Item | Estado | Arquivos que coincidem com o validador | Efeito |
|---|---|---|---|
| **PR de cobertura do PR-18** (`wt-pr-18b`, `fix/geocoding-rule-a-remaining-persist-paths`) | em andamento, sem PR aberto | `create-branch.use-case.ts`, `update-branch.use-case.ts`, `import-geocode-verifier.ts` e testes | **Conflito direto.** O validador muda as mesmas linhas: "rejeitado → salva sem coordenada" vira "rejeitado → 422". **Os PRs de filial e importação do validador começam só depois desse PR estar em `develop`.** Também segura o OPS do regeocode (decisão 20), cujo dry-run serve para medir rejeições falsas (§6, risco R1). |
| **PR-16** (`wt-pr-16`, E-3 ConsentLookup + `Sidebar.tsx`) | em andamento | nenhum | Sem conflito. Toca `Sidebar.tsx`, `ConsentLookup`, `list-consents-by-recipient`, que o validador não toca. Só disputa `apps/web/CLAUDE.md` e `apps/backend/CLAUDE.md` (resolve-se com rebase). |
| **PR-17** (`wt-pr-17`, E-4, `packages/shared/src/schemas/tenant.ts`) | em andamento | `packages/shared` (outro arquivo) e `openapi.json` / `api-types.ts` | Só conflita se o validador mudar contrato. Cenário: o pino na criação acrescenta `latitude`/`longitude` ao `createPropertySchema` → regenera `api-types`. Os dois regeneram o contrato, então **entram em série**: PR-17 primeiro. |
| **PR-09** (D-04, `formatAddressLabel`) | **já em `develop`** (#1379) | `apps/web/src/lib/address.ts`, `InspectorDetailSections.tsx` | Sem conflito vivo. Se o drawer do inspetor ganhar busca (decisão V8), reaproveita `lib/address.ts` como está. |
| **PR-15** (E-5, inspetor bloqueado no web) | **já em `develop`** (#1386) | nenhum | Confirma que o INSP só edita a própria base no PWA. O web é só AM e OP. Nada a fazer. |
| **Decisão 20** (origem do dia fora do PR de cobertura, no estacionamento) | decidido | `day-plan-origin.use-case.ts` | O validador naturalmente leva a regra A para a origem (§5.6). **Contradiz** o "estacionamento" da decisão 20, mas aqui a tela já mostra o erro; só o critério muda (decisão V6). |
| **F01 D11 / F04 DB4** (PWA sem autocomplete; sugestões proibidas para INSP) | decidido em 27/10 | `BaseAddressFields.tsx`, `search-addresses.use-case.ts` | Busca com sugestões no PWA **reverte** duas decisões e muda RBAC. A proposta mantém o PWA sem busca (decisão V7). |
| **TASK-F01-2** previa busca no drawer do inspetor (web) | não entregue | `InspectorFormDrawer.tsx` | Divergência entre a tarefa e o código. Decisão V8. |
| **Contrato da API** | — | `openapi.json`, `api-types.ts` | As respostas de erro **não são declaradas** nas rotas: `property.routes.ts:92` declara só 201, e a origem só 200. Um novo 422 **não muda** o `openapi.json`. Só o pino na criação (decisão V2) muda o contrato. |

---

## 5. Proposta de comportamento por tela

**Princípio:**
- **Valida ao salvar, no backend, com a mesma consulta permanente que já é feita.**
- Endereço recusado → **nada é gravado**. Volta 422 com o motivo, a tela marca os campos de endereço, mantém o formulário aberto e o usuário corrige.
- A busca com sugestões continua **opcional**, como ajuda para digitar.

### 5.1 Mecanismo (decisão V1)

| Alternativa | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. Valida ao salvar (recomendada)** | O backend roda a consulta permanente que já faz e aplica a regra A. Recusado → 422 `ADDRESS_NOT_VERIFIED`, com `details[].reason` igual a `NOT_FOUND`, `COARSE_RESULT` ou `LOW_RELEVANCE`. | Uma regra só, a mesma da gravação. Sem chamada a mais. Sem mudança de contrato. Vale para web, PWA e API. | O erro só aparece no clique de salvar. A edição de imóvel fica até 4 s mais lenta. |
| B. A + botão "Check address" antes de salvar | Rota nova de verificação, modo temporário, que não grava nada. | Retorno antes de salvar. | Rota nova e contrato novo (`api-types` em série). O resultado temporário pode divergir do permanente. Custo de temporário. Mais tela. |
| C. Sugestão obrigatória | Só salva endereço escolhido na lista. | Simples de entender. | **Não garante a regra A** (ver Insight do §2). Bloqueia endereço que o Mapbox não sugere. Não serve ao PWA (D11, INSP sem acesso). Não serve à importação. |

### 5.2 Mensagens (inglês), únicas para todas as telas

Ficam numa constante compartilhada em `packages/shared`, com um texto por motivo:

| Motivo | Texto no campo | Texto de apoio |
|---|---|---|
| `NOT_FOUND` | "We couldn't find this address." | "Check the street, number, suburb and postcode." |
| `COARSE_RESULT` | "We could only locate the area, not the exact address." | "Add the street number, or correct the street name." |
| `LOW_RELEVANCE` | "This address doesn't match a known address closely enough." | "Check the street, number, suburb and postcode." |
| Provedor fora do ar (se V4 = salva) | — | "We couldn't check this address right now. It was saved and will be checked again shortly." |
| Offline (PWA) | — | "You're offline. Connect to save this address." |

### 5.3 Imóvel: página de criação, drawer de criação e edição, imóvel no agendamento

- **Backend:**
  - Criação: rejeitado ou sem resultado → 422; nada gravado.
  - Timeout ou erro → mantém o comportamento atual: grava `PENDING` e o worker decide depois (V4).
  - Edição: com endereço mudado **e sem par de coordenadas manual**, passa a geocodificar **de forma síncrona**. Aceito → grava `SUCCESS` direto. Recusado → 422. Timeout → `PENDING` mais job, como hoje.
  - Um par de coordenadas manual diferente do salvo vence: grava `MANUAL`, sem validar o texto. **Essa é a saída para o rural.**
- O imóvel embutido no `POST /v1/appointments` (1.4) recebe o mesmo 422, porque passa pelo mesmo use case (V9).

Mock do campo de endereço, igual na página e no drawer:

```
── Válido (salvou) ─────────────────────────────────────────────
 Verified Address  [ 12 George St, Sydney NSW 2000          × ]
 Street [12 George St]  Suburb [Sydney]  Postcode [2000]  State [NSW]
 ✔ snackbar: "Property created."
   (sai o texto atual "Geocoding in progress." quando já está SUCCESS;
    só aparece em PENDING por timeout)

── Inválido (servidor recusou, formulário continua aberto) ─────
 ┌ ! We could only locate the area, not the exact address. ──────┐  role="alert"
 │   Add the street number, or correct the street name.          │
 │   Rural property? [Set location manually]   ← só se V2 = sim  │
 └───────────────────────────────────────────────────────────────┘
 Verified Address  [ Old Coach Rd, Kurrajong NSW 2758         × ]  (borda de erro)
 Street [Old Coach Rd ]⚠  Suburb [Kurrajong]⚠  Postcode [2758]⚠  State [NSW]
 foco → Street; aria-invalid nos 4 campos; [Create Property] continua ativo

── Corrigindo ──────────────────────────────────────────────────
 O usuário edita um campo de endereço ou escolhe uma sugestão →
 o aviso some; os campos saem do estado de erro; nada é chamado
 até o próximo clique em salvar.

── Rural / sem resultado, com saída (V2 = sim) ─────────────────
 [Set location manually] abre a seção "Coordinates" (hoje só na edição):
 Latitude [-33.4521]  Longitude [150.6612]
 hint: "Use only when the address can't be located. The address text is
        kept as typed and the location is marked as set manually."
 Salvar → MANUAL, sem validar o texto.

── Provedor fora do ar (V4 = salva) ────────────────────────────
 snackbar: "Property created. We couldn't check this address right now;
            it will be checked again shortly."  → status PENDING (como hoje)

── Registro antigo já inválido, aberto para edição ─────────────
 InfoBanner (amarelo, não bloqueia): "This address couldn't be located.
   Update it or set the location manually."
 Editar só Notes/Rent → salva normalmente (o endereço não mudou, então não valida).
```

### 5.4 Filial (drawer web)

- **Backend** (depois do PR de cobertura):
  - endereço informado e recusado → 422; nada gravado;
  - timeout → salva sem coordenada, como hoje (V4);
  - endereço vazio continua permitido.
- **Tela:** o mesmo bloco de erro do §5.3 e os campos Street, Suburb, Postcode e State marcados.
- **Sem pino manual.** A coordenada da filial não é usada; um pino só para filial seria UI sem efeito.
- O rural fica bloqueado. Saída: corrigir o texto (decisão V3).

```
 ┌ ! We couldn't find this address. ─────────────────────────────┐
 │   Check the street, number, suburb and postcode.              │
 └───────────────────────────────────────────────────────────────┘
 Address [ 99 Fake St, Parramatta NSW 2150 × ]   Street⚠ Suburb⚠ Postcode⚠ State⚠
```

### 5.5 Endereço-base do inspetor (drawer web de AM/OP e perfil no PWA)

- **Backend** (`geocodeInspectorBase` e os 3 use cases):
  - `no_results`, `coarse_result` e `low_relevance` → **422**; nada gravado.
  - `timeout`, `error` e `permanent_unavailable` → salva "not located", como hoje (V4).
  - O `baseGeocodeFailed` passa a valer só para esse caso de provedor indisponível.
  - Na criação de inspetor (base obrigatória), a recusa impede criar até o endereço ser corrigido.
- **Web (drawer):**
  - Mesmo bloco de erro do §5.3 sobre a seção "Base Address".
  - Passa a avisar o `baseGeocodeFailed` em vez de "Inspector created successfully" puro: "Inspector saved. We couldn't check the base address right now."
  - Busca com sugestões só se V8 = sim.
- **PWA (perfil):**
  - Mantém os campos livres (D11).
  - O estado `geocode-failed` ("Saved, but…") **deixa de existir** para endereço inválido.

```
── PWA, perfil: inválido ────────────────────────────────────────
 Base address
 Street [Old Coach Rd]  Number [ ]  Suburb [Kurrajong]  State [NSW]  Postcode [2758]
 ! We could only locate the area, not the exact address.          role="alert"
   Add the street number, or correct the street name.
 [ Save address ]   (o endereço salvo antes continua valendo)

── PWA, perfil: offline ─────────────────────────────────────────
 You're offline. Connect to save this address.      [ Save address ] (desabilitado)

── PWA, perfil: válido ──────────────────────────────────────────
 Saved successfully                                 (texto atual, sem mudança)
```

### 5.6 Ponto de partida do dia (PWA OriginSheet)

- **Backend:** acrescenta a regra A ao `day-plan-origin.use-case.ts`.
  - Rejeitado → o mesmo 422 `DAY_PLAN_ORIGIN_NOT_FOUND`, agora com o motivo.
  - A tela já exibe o erro e já é só online. **A mudança visível é só o texto por motivo** (V6).

```
 Start this day from
 Street [...]  Suburb [...]  State [...]  Postcode [...]
 ! We could only locate the area, not the exact address.   (antes: "We couldn't find this address.")
 You're offline. Connect to change your starting point.    (sem mudança)
```

### 5.7 Importação de agendamentos (prévia)

- **Backend** (depois do PR de cobertura):
  - `not_found`, que passa a incluir os rejeitados pela regra A, muda de aviso para **erro da linha**. A linha não é importada.
  - Mensagem: "Address couldn't be located. Correct it in the spreadsheet and upload again."
  - `unverified` (timeout, orçamento ou acima de 300) **continua aviso**: não dá para afirmar que é inválido (V5).
- **Tela:** a linha aparece com o badge de falha, entra na contagem de erros, não na de avisos, e o motivo aparece na linha.

```
 Row 14  ✖ 3 Old Coach Rd, Kurrajong NSW 2758
         Address couldn't be located. Correct it in the spreadsheet and upload again.
 Row 15  ⚠ 8 Smith St, Penrith NSW 2750   (unverified — will be checked after import)
```

### 5.8 O que NÃO muda

- A regra A em si: limiar de 0,8 e só o tipo `address`.
- O `AddressLookupInput`: continua opcional, com o mesmo comportamento de teclado. Não ganha estado "verificado" (a verificação acontece ao salvar).
- A rota de sugestões: continua temporária, com o cache atual, proibida para INSP e com 30 por minuto.
- As coordenadas da sugestão continuam nunca gravadas.
- O worker `property.geocode`, o sweep de nova tentativa e o botão "Retry Geocoding" (AM e OP), para registros antigos e para os `PENDING` por timeout.
- Registros antigos inválidos **não** são corrigidos em massa nem bloqueados para editar outros campos.
- O script `regeocode-permanent` (fica com o PR de cobertura).
- Os papéis que podem usar o pino manual na edição de imóvel (AM, OP, CL_ADMIN e CL_USER). Sem mudança de RBAC.
- O app offline: endereço continua fora da fila offline.

---

## 6. Fatiamento em PRs

O corte é **vertical por tipo de cadastro**: backend e tela juntos. Assim não há uma janela em que o servidor recusa e a tela antiga mostra um snackbar genérico.

Regras para todos os PRs:
- 1 tarefa = 1 PR.
- No máximo 150 arquivos.
- TDD.
- Um worktree por PR, a partir de `origin/develop`.
- Gates dentro do worktree, incluindo `test:integration:db` quando o backend for tocado.
- `CLAUDE.md` de cada workspace tocado atualizado.
- **Portão de design:** este documento é a proposta. Nenhum PR começa antes da aprovação do Pedro.

### V-1: imóvel (backend, shared e web)

**Título:** `feat: reject unverifiable property addresses on save`

**Arquivos:**
- shared: constante de motivos e mensagens, `ADDRESS_NOT_VERIFIED`;
- backend: `create-property.use-case.ts` e `update-property.use-case.ts` (edição síncrona), mais um erro novo em `property.errors.ts`;
- web: `PropertyCreatePage.tsx` e `PropertyFormDrawer.tsx` (bloco de erro, campos marcados, foco, aviso para registro antigo).

**Se V2 = sim:**
- `createPropertySchema` aceita `latitude` e `longitude` → `pnpm generate:api`;
- botão "Set location manually" na criação.

**Dependências:**
- Nenhuma de código.
- Se V2 = sim, entra **depois do PR-17** (`api-types` em série).
- **Recomendado:** só depois de medir pelo dry-run do regeocode (R1).

**Testes:**
- use case: aceito, `COARSE_RESULT`, `LOW_RELEVANCE`, `null` → 422 sem gravar;
- timeout → `PENDING` mais job;
- edição sem mudança de endereço não chama o Mapbox;
- coordenada manual vence;
- `POST /v1/appointments` com `property` → 422;
- web: erro por motivo, foco, `aria-invalid`, aviso de registro antigo, editar só Notes num `FAILED` salva.

**Critério de aceite:** com um endereço rural ou inexistente, a criação fica bloqueada com a mensagem do motivo e nada é gravado. Com um endereço bom, grava `SUCCESS` na hora.

### V-2: filial (backend e web)

**Título:** `feat: reject unverifiable branch addresses on save`

**Arquivos:**
- `create-branch.use-case.ts` e `update-branch.use-case.ts`;
- `BranchFormDrawer.tsx`;
- opcional: limpar o `latitude: 0, longitude: 0` morto em `:94-95`.

**Dependências:** **depois do PR de cobertura** (mesmas linhas) e de V-1 (constante compartilhada).

**Testes:**
- rejeitado → 422;
- endereço vazio é permitido;
- endereço sem mudança não chama o Mapbox;
- timeout salva sem coordenada.

**Critério de aceite:** filial com endereço inválido não salva; filial sem endereço continua salvando.

### V-3: endereço-base do inspetor (backend, web e PWA)

**Título:** `feat: reject unverifiable inspector base addresses on save`

**Arquivos:**
- `geocode-inspector-base.ts` e os 3 use cases (criação, edição e autoedição);
- web: `InspectorFormDrawer.tsx` (erro e aviso de `baseGeocodeFailed`; busca só se V8 = sim);
- PWA: `ProfileAccountPage.tsx` (erro por motivo, aviso de offline, remover a mensagem "Saved, but…" para o caso inválido).

**Dependências:** V-1.

**Atenção:** `backfill-inspector-base-coords.ts` também chama `geocodeInspectorBase`. O script **não pode** passar a lançar erro; ele precisa continuar tratando `{ failed }`.

**Testes:**
- os 3 use cases: 422 em `no_results`, `coarse` e `low_relevance`;
- "not located" só em timeout, erro ou conta sem modo permanente;
- base igual à salva não chama o Mapbox;
- backfill sem mudança;
- PWA: E2E (Chromium e WebKit) do erro e do offline.

**Critério de aceite:** nem a operação nem o inspetor conseguem gravar uma base que o sistema não localiza. Com o provedor fora do ar, o comportamento atual se mantém.

### V-4: ponto de partida do dia (backend e PWA)

**Título:** `fix: apply the geocoding rule to the day start point`

**Arquivos:**
- `day-plan-origin.use-case.ts` (regra A e motivo);
- `OriginSheet.tsx` (só texto, se o servidor já mandar a mensagem por motivo);
- o PWA talvez nem precise mudar.

**Dependências:** V-1 (constante). Decisão V6.

**Testes:**
- resultado no nível de CEP → 422;
- endereço bom → recalcula a rota;
- idempotência mantida.

**Critério de aceite:** um CEP ou uma cidade não vira origem do dia.

### V-5: importação (backend e web)

**Título:** `feat: block import rows whose property address can't be located`

**Arquivos:**
- `apply-geocode-verification.ts` (severidade `error`);
- resumo da prévia;
- `AppointmentImportPreview.tsx`.

**Dependências:** **depois do PR de cobertura** (`import-geocode-verifier.ts`). Decisão V5.

**Testes:**
- `not_found` → erro e linha fora do commit;
- `unverified` continua aviso;
- o commit nunca cria imóvel `FAILED` vindo de linha recusada.

**Critério de aceite:** a importação não cria mais imóvel com endereço que não foi localizado.

### Ordem sugerida

```
PR-17 ─┐ (api-types, só se V2 = sim)
       ├─► V-1 imóvel ─► V-3 base ─► V-4 origem
PR de cobertura (18b) ─► V-2 filial
                       └► V-5 importação
dry-run do regeocode (OPS, mede R1) ─► antes de V-1 chegar a staging
```

V-2 e V-5 só esperam o PR de cobertura e a constante de V-1. Podem andar em paralelo com V-3 e V-4, porque não compartilham arquivos.

### Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | **Recusa falsa de endereço urbano real.** O limiar tem margem curta: um endereço bom deu 0,89. O texto da consulta de imóvel inclui "Address Line 2" (`property.entity.ts:135-140`, `fullAddress`). "Unit 3" ou "Level 2" pode derrubar a relevância. Hoje isso vira `FAILED` em silêncio; com o validador, **o cadastro trava**. | Medir pelo dry-run do regeocode (já previsto na decisão 17) **antes** de V-1 chegar a staging. Avaliar à parte se a consulta deve deixar de fora o "Address Line 2" (seria decisão nova, não está neste plano). |
| R2 | Edição de imóvel até 4 s mais lenta quando o endereço muda. | Só quando o endereço muda. O botão mostra carregando. |
| R3 | Os testes do X02 (CA10, "editar troca a sugestão → PENDING + job") mudam de expectativa. | Atualizar no V-1, dizendo explicitamente que o comportamento mudou. Atualizar o `apps/backend/CLAUDE.md`. |
| R4 | Rural real sem saída na filial e na base. | Decisão V3. Registrar no estacionamento se aparecer um caso. |
| R5 | Integração externa que use `POST /v1/appointments` com `property` passa a receber 422. | Nenhum chamador conhecido; o Fy não cria imóvel. Registrar na nota do PR. |
| R6 | Conflito de rebase em `apps/*/CLAUDE.md` com PR-16 e PR-17. | Trivial. Rebase antes do merge. |

---

## 7. Decisões que precisam do Pedro (cada uma com recomendação)

> **Decidido pelo Pedro em 24/11:** segue a recomendação em todas, **exceto a V5**: a importação **não** bloqueia a linha (continua aviso; o endereço é corrigido depois no cadastro). O PR V-5 sai do pacote. Registro: decisões 22 e 25 do plano de execução.

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| **V1** | Mecanismo do validador | A valida ao salvar · B A + botão "Check address" · C sugestão obrigatória | **A.** Usa a mesma consulta que já é cobrada, é a única que garante a regra A e vale para web, PWA, API e importação. A sugestão continua como ajuda opcional. |
| **V2** | Saída para imóvel rural legítimo | (a) "Set location manually" também na **criação**, aparecendo só depois de uma recusa (contrato novo, `api-types` depois do PR-17) · (b) só na edição: criar não é possível, então o rural fica sem cadastro · (c) sem saída | **(a).** Sem isso, o imóvel rural não entra no sistema. Mesmos papéis da edição de hoje, sem mudança de RBAC. |
| **V3** | Rural na filial e na base do inspetor | (a) bloqueia sem saída · (b) "Save without location" com confirmação explícita · (c) base ganha "Use my current location" (GPS, funcionalidade nova) | **(a)** para os dois, seguindo a regra "não aceitar inválido". A filial não usa coordenada. A base de inspetor rural é caso raro: vai para o estacionamento como (c) se aparecer. |
| **V4** | Mapbox fora do ar ou timeout | (a) salva como hoje (`PENDING` ou "not located") com aviso · (b) bloqueia o salvamento | **(a).** Inválido ≠ não verificado. Bloquear todo cadastro quando o provedor cai é regressão; o worker e o retry já cobrem depois. |
| **V5** | Importação | (a) recusado vira **erro** da linha, `unverified` continua aviso · (b) continua aviso que não bloqueia | **(a).** É a regra do Pedro aplicada à planilha. `unverified` não é prova de inválido. |
| **V6** | Regra A na origem do dia | (a) entra aqui (V-4) · (b) fica no estacionamento (decisão 20) | **(a).** A tela já bloqueia e já mostra o erro; só muda o critério e o texto. A decisão 20 a deixou de fora por ser mudança de tela, e este pacote já é a proposta de tela. |
| **V7** | Sugestões no PWA | (a) mantém sem busca (F01 D11, F04 DB4) · (b) libera a rota para INSP (RBAC + custo) | **(a).** Validar ao salvar já resolve. Não reabre duas decisões nem RBAC. |
| **V8** | Busca no drawer do inspetor (web) | (a) acrescenta `AddressLookupInput`, como previa a TASK-F01-2 · (b) mantém texto livre | **(a).** Mesma peça de imóvel e filial. Reduz recusas e fecha a divergência com a F01-2. É mudança de tela, incluída no portão desta proposta. |
| **V9** | `POST /v1/appointments` com imóvel embutido | (a) mesma recusa (mesmo use case) · (b) exceção | **(a).** Uma regra só. Sem chamador conhecido. |
| **V10** | Registro antigo já inválido | (a) valida só quando o endereço muda, com aviso que não bloqueia na edição · (b) obriga corrigir ao abrir | **(a).** Não trava a operação sobre dados legados. |
| **V11** | Ordem em relação ao dry-run do regeocode | (a) V-1 chega a staging só depois de medir as recusas falsas · (b) sem esperar | **(a).** Ver R1. |

---

## 8. Lacunas encontradas (não resolvidas aqui)

1. **TASK-F01-2 × código.** A tarefa previa busca com sugestões no drawer do inspetor; o `develop` tem texto livre (§1.6). Ninguém registrou essa mudança. Decisão V8.
2. **O web ignora `baseGeocodeFailed`.** O drawer do inspetor mostra sucesso puro mesmo quando a base não foi localizada (§1.6). É defeito pré-existente, coberto em V-3.
3. **A página de criação de imóvel sempre diz "Geocoding in progress."**, mesmo quando o imóvel já saiu `FAILED` ou `SUCCESS` de forma síncrona (`PropertyCreatePage.tsx:148`). Coberto em V-1.
4. **A origem do dia aceita CEP ou cidade como ponto de partida** (sem regra A). A decisão 20 mandou isso para o estacionamento. Decisão V6.
5. **"Address Line 2" entra na consulta de imóvel.** Pode causar recusa falsa (R1). Mudar a consulta seria decisão nova, fora deste pacote.
6. **Cache em memória de 5 min de resultado temporário** na rota de sugestões. É pré-existente; o X02 o manteve. O validador não o amplia. Consulta aos termos à parte, se o Pedro quiser.
7. **O PWA não tem aviso de offline ao salvar a base** (§1.7). Coberto em V-3.
