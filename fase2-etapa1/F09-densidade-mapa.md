# F09 · Densidade no mapa

| | |
|---|---|
| **Contrato** | D.1–D.4 (critérios D.A1, D.A2, D.A3). O 01.13 foi movido para a F05, por decisão de 2026-10-27. |
| **Esforço** | **3,4 dias** · dificuldade **M** (era 3,0; +0,4 pelas lacunas de 2026-10-29: presets fixos para CL, chave na `ROLE_ACTION_MATRIX`, legenda/estados no web) |
| **Depende de** | F03 (evento de execução com geo; os dados históricos já existem) |
| **Bloqueia** | – |
| **Status** | Decisões fechadas em 2026-10-27. Pronto para spec. |
| **Decisões** | Período, ponto e acesso CL ✅; Q5/Q6 (só redação do contrato) |

## Objetivo

1. Mostrar no `/map` onde a atividade de campo se concentra, como uma camada de calor sobre os eventos de execução. Os filtros de período, agência e inspetor que já existem também filtram a camada.
2. O indicador de horário travado (01.13) foi para a F05. As telas de dashboard que já existem **não são alteradas**.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Período da camada | **Seletor próprio, padrão últimos 30 dias**, independente do filtro de datas dos pins (a janela da F00 é futura e as execuções são passadas). Agência e inspetor vêm dos filtros do mapa (D.3). |
| Ponto do calor | **Local do check-in** (geo do início da execução). |
| Agências (CL) | **Veem só as execuções dos próprios appointments**, agregadas numa grade de ~100 m, e **células com menos de 3 check-ins ficam ocultas** (k-anonimato, decisão de 2026-10-28). Nunca o ponto exato do inspetor. AM/OP veem tudo, também agregado. |

## Decisões tomadas (2026-10-29)

| Tema | Decisão |
|---|---|
| Período para CL (L-F09-01) | O k = 3 por consulta não resiste à diferença de janelas. Para CL o período **só pode ser um dos presets de 7, 30 ou 90 dias terminando hoje** (Sydney), validado no servidor (fora disso → 400 `VALIDATION_ERROR`, `details.reason = 'PERIOD_NOT_A_PRESET'`). AM/OP mantêm período livre (≤ 366 dias). Risco residual aceito: a diferença entre presets revela o agregado das faixas de 8–30 e 31–90 dias atrás, sem isolar um dia. |
| Permissão (L-F09-09) | Nova chave `map.execution_density` na `ROLE_ACTION_MATRIX` (`packages/shared/src/permissions/role-matrix.ts`). |

## Estado atual (verificado @042a9674)

- **Camada de calor existente:** `RegionHeatmap.tsx:47-70` (no `/analytics`) já tem fonte GeoJSON + camada `heatmap` + `HEATMAP_RAMP` (`charts/theme.ts:78`). Ela usa o centróide do bairro dos imóveis, não a execução.
- **`/map`:** só tem marcadores DOM, sem `addSource`/`addLayer` próprios. As únicas camadas são as do `mapbox-gl-draw` (laço). Período, agência e inspetor já existem como filtros (D.2 e D.3 ✅).
- **Geo da execução:** fica em `InspectionExecution`, exposta só para o próprio inspetor. A tabela não tem `tenant_id`, então o escopo vem do join com o appointment.
- **Isolamento:** `/map` usa `resolveAppointmentListTenantScope` → `requireTenantScope` (D.A3 ✅ no padrão).
- **Confirmação no analytics:** `confirmationRate {confirmed, eligible}` (`prisma-dashboard-analytics.repository.ts:185`) é escopado só por agência. Há link indireto appointment → grupo → região (`ServiceGroup.service_region_id`), ou `ST_Intersects` com o polígono da região.

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| D.1 API | `GET /v1/map/execution-density?fromDate&toDate&tenantId&inspectorId` devolve apenas pontos (`start_lat/lng` da execução, agregados numa grade de ~100 m com contagem). **Não devolve a geo crua individual** para perfis CL. Escopo via `resolveAppointmentListTenantScope` sobre o join com o appointment. Para CL, só períodos-preset de 7/30/90 dias terminando hoje (400 `PERIOD_NOT_A_PRESET` fora disso). Autorização pela chave `map.execution_density`. | M | 1,7 | – |
| D.1 / D.4 web | Toggle **"Activity density"** no `/map`. Ao ligar, aparece o seletor de período da camada (padrão: últimos 30 dias; `Custom` só AM/OP, CL vê só os presets). O componente novo `components/map/DensityLayer.tsx` reusa o padrão de fonte/camada do `RegionHeatmap` e lê os filtros de agência e inspetor da página. É reaplicado depois de `style.load`. | M | 1,7 | D.1 API |

## Fora do escopo

- Mapa de calor de outras dimensões.
- Exportar o mapa como imagem.
- Análise preditiva.
- A camada na tela Dia ao Vivo (opcional; só se for trivial).
- O badge "travado" nos pins.

## RBAC

| Ação | Quem pode |
|---|---|
| Densidade de todas as agências, período livre (≤ 366 dias) | AM/OP |
| Densidade só das próprias execuções, agregada (k = 3), **só com os períodos de 7/30/90 dias terminando hoje** | CL |

Chave na matriz: `map.execution_density` (L-F09-09).

## Critérios de aceite → como provar

- **D.A1:** a camada reflete o período selecionado no seletor dela (padrão: 30 dias).
- **D.A2:** os filtros de agência e inspetor mudam a camada.
- **D.A3:** um usuário CL de outra agência não vê pontos alheios. Provar com teste do use case usando duas agências.

## Riscos e armadilhas

- Paint do Mapbox com HSL de vírgula.
- Ordem das camadas: as do draw ficam por cima.
- **Privacidade:** a geo da execução é a posição do inspetor. Por isso só se devolve o agregado.
- Não crescer o `AppointmentMapPage.tsx`; o componente da camada é separado.

## Quebra em PRs

1. Backend (densidade).
2. Web (camada).
