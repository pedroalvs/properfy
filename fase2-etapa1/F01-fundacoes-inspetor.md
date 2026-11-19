# F01 · Fundações do inspetor

| | |
|---|---|
| **Contrato** | 00.3, 00.4, 00.10 (critério 00.A5 parcial). O 00.2, guia de instalação, foi movido para a F04 como tour do app. |
| **Esforço** | **5,0 dias** · dificuldade **M** (inclui backfill, ocultar dados de CL e QA realista) |
| **Status** | Decisões fechadas em 2026-10-27. Pronto para spec. |
| **Depende de** | X02 (porta de geocodificação com modo permanente) |
| **Bloqueia** | F02 (estado de instalação), F04 (endereço-base), F06 |
| **Decisões** | Todas fechadas (abaixo) |

## Objetivo

Preparar o terreno para as features seguintes:

- o inspetor tem um **endereço-base geocodificado** (o ponto de partida do roteiro);
- a operação vê **quem instalou, quem ativou o push e o último acesso** de cada inspetor.

## Estado atual (verificado @042a9674)

- **`Inspector.address`:** é `Json?` sem lat/lng (`schema.prisma:483`). O shared aceita `z.record(z.unknown())` (`packages/shared/src/schemas/inspector.ts:50,71`). O campo **não aparece** em nenhuma tela: `InspectorFormDrawer` não tem endereço e o PWA também não.
- **Auto-edição do inspetor:** `PATCH /v1/inspectors/me` aceita só `phone/fullName/paymentSettings` (`inspectorSelfUpdateSchema`, `inspector.ts:126-130`). A rota **não tem response schema** (`inspector.routes.ts:643-663`). Telefone e fuso são editados em `ProfileAccountPage.tsx`. O fuso vai por `PATCH /v1/me`.
- **Perfil no PWA:** é uma grade de tiles (#1298) em `ProfilePage.tsx:73-100` (Earnings, Availability, Documents, My account) com as sub-rotas `availability|documents|account|settings` (`router.tsx:173-181`). Não existe aba "More".
- **Instalação:** `useInstallPrompt.tsx` já detecta `beforeinstallprompt`, standalone e iOS Safari. Os banners `InstallBanner{Ios,Native}` ficam na Agenda e o `InstallAppCard` em `/profile/settings`. **Nada é enviado ao servidor.**
- **Dados de acesso:** `User.last_login_at` e `Session.last_used_at` existem, mas não aparecem na área de inspetores do web.
- **Geocodificação:** a porta `IGeocodingService` (`property/domain/geocoding.service.ts`) é usada pelo `DynamicGeocodingService` (`integration/infrastructure/dynamic-providers.ts:131`). Já existe um endpoint de sugestão de endereço (`addressSuggestionSchema`, `property.routes.ts:70`) que serve para autocomplete. Para o schema, derivar do `branchAddressSchema` **depois da X02**, que remove o lat/lng do cliente.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Endereço-base obrigatório | **Obrigatório no cadastro.** A OP não salva um inspetor novo sem base e não pode apagar a base de um inspetor existente. Inspetores atuais sem base veem um **aviso fixo no app** ("Add your base address", com link para o perfil) até preencherem. Nada bloqueia o uso do app. |
| Edição | O inspetor (pelo perfil) e a OP (pelo cadastro) editam **livremente**, com auditoria. |
| Base do dia | Fica na **F04**: na tela do roteiro, o inspetor troca a origem **só daquele dia** (hoje ou um dia futuro já planejado). A base padrão não muda. |
| Sem base no dia | O roteiro é calculado começando pela 1ª janela, com o aviso "No base address: route has no starting point" (F04). |
| Preferências (00.3) | **Só push**: o controle "ativar/desativar push neste dispositivo" (UI e lógica na F02). Sem preferência de SMS. Avisos críticos sem push sempre vão por SMS. |
| Coluna de endereço | **Reusar o `Inspector.address`** (JSON que já existe) como endereço-base, validado pelo schema novo. Entram só `base_lat`, `base_lng` e `base_geocoded_at`. Os endereços já preenchidos passam pela geocodificação permanente num backfill único. |
| Privacidade | O endereço-base e as coordenadas **ficam ocultos para CL_ADMIN/CL_USER**. Só AM/OP e o próprio inspetor veem. Muda o comportamento atual, em que o CL recebe o `address`. |
| Banner | Duas variantes: sem base → "Add your base address"; base salva mas sem coordenadas → "We couldn't locate your base address — please check it". |
| Guia de instalação (00.2) | Virou um **tour do app** com instalação, construído na F04 (ver lá). |

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| 00.4a | Reusar `Inspector.address` como endereço-base e adicionar as colunas `base_lat`, `base_lng` e `base_geocoded_at` (migration + backfill dos endereços já preenchidos). Schema `inspectorBaseAddressSchema` derivado do `branchAddressSchema`. A geocodificação é **síncrona** no save via `IGeocodingService`, **em modo permanente (`permanent=true`)**, porque os termos da Mapbox proíbem guardar o resultado do modo temporário. A porta com modo permanente vem da X02: um único endereço, sem job. Se falhar, salva sem coordenadas e mostra um aviso. Obrigatório no `createInspectorSchema`; no update da OP, a base pode ser trocada mas não removida. | M | 1,25 | – |
| 00.4b | Web: campo de endereço com autocomplete no `InspectorFormDrawer` (OP/AM). PWA: seção "Base address" em `/profile/account`. Ampliar `inspectorSelfUpdateSchema` e o update da OP. Os dois caminhos já são auditados. | M | 1,0 | 00.4a |
| Aviso | Banner fixo "Add your base address" (não dispensável) na home e no perfil enquanto `base_lat` for nulo. Na web, filtro/indicador "No base address" na tabela de inspetores. | B | 0,25 | 00.4a |
| 00.3 | O perfil já existe (#1298). Entram a seção de endereço (00.4b) e o lugar do controle de push em `/profile/settings` (o controle em si é da F02). Sem coluna de preferências. | B | 0,25 | F02 |
| 00.10 | Heartbeat: ao abrir o app, `POST /v1/inspectors/me/app-state {displayMode, pushPermission, appVersion}`, com throttle de 1 vez a cada 6 h por dispositivo. Grava `app_installed_at` (primeiro standalone), `app_last_seen_at`, `push_enabled` e `app_version` no Inspector. No web, adicionar colunas "App", "Push" e "Last seen" no `InspectorTable` e uma seção "App adoption" no `InspectorDetailSections`. | B | 1,25 | – |
| QA | Smoke no PWA (iOS simulado + Android) e no web. | – | 0,25 | – |

## Fora do escopo

- Uma tabela separada de instalações por dispositivo: basta o último estado no Inspector.
- Um dashboard de adoção separado: a tabela de inspetores já é o painel.
- Redesenhar o perfil (já foi feito no #1298).
- Preferência de SMS ou por tipo de aviso.
- O tour e o guia de instalação, que ficam na F04.
- A aba "More" (fica em F04).

## RBAC

| Ação | Quem pode |
|---|---|
| Editar o endereço-base | AM/OP (qualquer inspetor) e INSP (o próprio) |
| Ver colunas de adoção | AM/OP |
| Enviar heartbeat | INSP (o próprio) |

## Critérios de aceite → como provar

- **00.A1:** provado na F04 (tour + instalação).
- **00.A5:** só é provado em F04. Aqui o critério é: o endereço salvo tem lat/lng.

## Riscos e armadilhas

- A rota `GET /v1/me` usa `meResponseSchema`, que **remove campos não declarados**. Qualquer campo novo exposto ali tem que ser declarado.
- O endpoint `/v1/inspectors/me` não tem response schema hoje. Ao adicionar um, conferir tudo o que o PWA lê.
- O shared precisa de build antes de web e PWA consumirem. Regenerar `api-types` (`generate:openapi` → `generate:types`).
- A porta de geocodificação mora no módulo `property`. Importar entre módulos ou mover para `shared/domain` (decisão da spec; mover é mais limpo).

## Quebra em PRs

1. Backend + shared (migration, endereço, heartbeat).
2. Web (drawer + colunas).
3. PWA (endereço, aviso de base ausente, heartbeat).
