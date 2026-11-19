# X02 · Geocodificação permanente (conformidade Mapbox)

| | |
|---|---|
| **Contrato** | **Fora do Anexo I.** Correção de conformidade encontrada ao validar a API da Mapbox para o roteiro (2026-10-27). Por decisão do dev, vira uma spec **antes das features de mapa**. |
| **Esforço** | **3,75 dias** · dificuldade **B/M** |
| **Depende de** | – |
| **Bloqueia** | F01 (o endereço-base nasce no modo permanente pela mesma porta), F04 (o roteiro usa as coordenadas dos imóveis), F09 |
| **Status** | Pronto para spec (Onda 1, antes de F00/F01). |

## Objetivo

Deixar a plataforma conforme os termos da Mapbox: **toda coordenada gravada no banco precisa vir de geocodificação em modo permanente**. Hoje os imóveis gravam lat/lng obtidos no modo **temporário**, que a Mapbox proíbe guardar.

## Base nos termos (pesquisa de 2026-10-27)

Fonte: [Mapbox: temporary vs permanent geocoding](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/).

| Modo | Pode guardar no banco? | Para que serve | Como pedir | Preço |
|---|---|---|---|---|
| **Temporário** (padrão) | **Não** | Exibir no mapa ou na UI, uso imediato na sessão | (padrão) | Normal |
| **Permanente** | **Sim** (inclusive cache e reuso) | Resultados que serão gravados | Parâmetro `permanent=true` | **US$ 5,00 por 1.000 requisições (US$ 0,005 cada), sem faixa gratuita**, com os mesmos limites de taxa (600 req/min por padrão na v5, compartilhados com a produção) |

O modo permanente pode precisar ser habilitado na conta Mapbox. Ver a seção de pricing de Geocoding em [mapbox.com/pricing](https://www.mapbox.com/pricing). O preço vigente e o limite real da conta são reconferidos no spike e no checklist de smoke (TASK-X02-1, L-X02-01, L-X02-05).

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Filiais | **Entram no escopo** (+0,5 dia). O cadastro de filial grava lat/lng da sugestão do autocomplete (modo temporário, `useBranchSave.ts`/`branchAddressSchema`). A partir daqui, o backend geocodifica o endereço da filial no modo permanente ao salvar. |
| Coluna marcadora | Coluna **`geocoded_permanently_at`** (migration pequena, +0,25 dia), que torna o script de legado idempotente e permite rodá-lo de novo. |
| Previews de importação antigos | Os previews salvos antes do deploy **expiram**, porque guardam coordenadas temporárias. |
| Override MANUAL de lat/lng | O valor digitado pelo usuário não vem da Mapbox, então **continua sendo aceito**. O comportamento fica travado por testes. |
| Legado sem resultado no modo permanente | **Mantém a coordenada temporária até alguém corrigir** (o dev aceitou a violação residual dos termos). Fica FAILED com o motivo e é listado no relatório. |
| Bug MANUAL (revisão) | Hoje, editar um imóvel reenvia as coordenadas pré-preenchidas e grava como MANUAL. Correção: o web só envia lat/lng quando o usuário altera, e o backend só marca MANUAL se as coordenadas mudarem (+0,25 dia). |
| Falsos MANUAL já gravados | **Detectados pelo audit** (+0,25 dia). A auditoria não guarda lat/lng, então a prova é: endereço igual na transição para MANUAL **e** coordenada atual a até 5 m do geocode permanente (tolerância configurável). Os casos ambíguos vão para o relatório, sem alteração. |
| Conta sem o modo permanente | O imóvel vai para FAILED com o motivo explícito e **não é reenfileirado**, para não pagar a mesma falha todo dia. |

## Estado atual (verificado @042a9674)

- **Porta:** `IGeocodingService.geocode(address)` (`property/domain/geocoding.service.ts`) não tem opção de modo.
- **Adaptador:** `mapbox-geocoding.service.ts:14` chama `geocoding/v5/mapbox.places/{q}.json?...&limit=1` **sem** `permanent=true`. A ligação passa pelo `DynamicGeocodingService` (`integration/infrastructure/dynamic-providers.ts:150`), que usa a config `mapbox` do Integrations Hub.

**Caminhos que GRAVAM coordenadas (todos precisam do modo permanente):**

| Caminho | Onde | Observação |
|---|---|---|
| Geocodificação síncrona ao criar um imóvel | `create-property.use-case.ts:110` | |
| Job assíncrono `property.geocode` e o retry | `property/infrastructure/workers/geocode.worker.ts:54`, `main/workers.ts` | |
| Verificação no preview da importação | `import-geocode-verifier.ts:88` | As coordenadas "são reaproveitadas no commit", então também são gravadas. |
| Coordenadas enviadas pelo cliente | `packages/shared/src/schemas/property.ts:69` aceita `latitude/longitude` no payload | Elas podem ter vindo do **autocomplete** (`mapbox-address-lookup.service.ts:82`, modo temporário, que devolve `latitude/longitude` em `addressSuggestionSchema`). |

**Caminhos que NÃO gravam (podem continuar temporários):**
- o autocomplete de endereço (`mapbox-address-lookup.service.ts`), enquanto a coordenada dele só servir para exibição;
- o teste de conexão do Integrations Hub (`integration-connection-tester.ts:83`).

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| Porta | `geocode(address, { mode: 'permanent' \| 'temporary' })`, com **padrão `permanent`** (fail-safe: quem grava não esquece). O stub e o `DynamicGeocodingService` repassam a opção. | B | 0,25 | – |
| Adaptador | Mapbox adiciona `permanent=true` no modo permanente. Se a Mapbox recusar (conta sem o recurso), registra um erro claro (`MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE`) e **não grava coordenada temporária**: o imóvel fica PENDING/FAILED pelo fluxo de status que já existe. | B | 0,5 | Porta |
| Caminhos que gravam | Criação, job, retry e verificador da importação usam o modo permanente (explícito no código). **Coordenada do cliente:** o backend **ignora** lat/lng vindos de uma sugestão do autocomplete e geocodifica no modo permanente ao salvar. Alternativa a decidir na spec: o autocomplete devolver um id e o backend resolver no modo permanente. A recomendação é ignorar, que é o mais simples. | M | 0,75 | Adaptador |
| Conta | Checklist de deploy: confirmar que a conta e o token Mapbox de cada ambiente (dev/staging/prod) aceitam `permanent=true`. Smoke com uma requisição real por ambiente. | B | 0,25 | – |
| Legado | **Decisão da spec:** os imóveis já gravados com coordenadas temporárias precisam ser regeocodificados? Recomendado: **sim**, via script único com throttle (respeitando o limite de taxa), idempotente e com relatório (quantos foram atualizados, mudaram de posição ou falharam). Rodar em staging antes de prod. O custo da rodada única é proporcional ao número de imóveis. | M | 0,5 | Adaptador |
| QA | Testes de unidade (URL com `permanent=true` nos caminhos que gravam e sem ele no autocomplete; coordenada do cliente ignorada; erro de conta) + teste de integração do job. | – | 0,25 | – |

## Fora do escopo

- Trocar de provedor ou de API (Search Box etc.). **Exceção única (contingência v6, L-X02-01, aceita em 2026-10-28):** se o spike mostrar que a v5 não aceita `permanent=true` na conta, **só** o adaptador de geocodificação migra para `search/geocode/v6/forward?…&permanent=true` (+0,25 dia). Autocomplete e teste de conexão continuam na v5.
- Mudar o autocomplete.
- Cache próprio de geocodificação.
- Revisar os termos de Directions/Matrix: fica para a F04, que confirma com a Mapbox antes do go-live.

## Critérios de aceite (da spec)

- Toda chamada de geocodificação cujo resultado é gravado envia `permanent=true`.
- O autocomplete continua no modo temporário e as coordenadas dele nunca são gravadas.
- Com a conta sem o modo permanente, nenhuma coordenada é gravada e o erro fica visível no log e no status do imóvel.
- O script de legado regeocodifica os imóveis existentes de forma idempotente e com relatório.

## Riscos e armadilhas

- **Custo:** o modo permanente custa US$ 0,005 por requisição (US$ 5/1.000, sem faixa gratuita). O volume de criação de imóveis é baixo; o custo relevante é a rodada única do legado e o sweep diário dos FAILED sem código. Estimar com o número de imóveis antes de rodar em prod (L-X02-05).
- **Limite de taxa:** 600 req/min por padrão na v5, compartilhado com a produção (previews de importação concorrem); o script de legado roda com `--rate` 120 e trata 429 (L-X02-05).
- **Testes:** os testes do `create-property` e do import usam stubs do geocoder. Atualizar as assinaturas, porque mudar a porta quebra wirings não tipados (memória `project_adding_usecase_dep_breaks_untyped_test_wirings`).
- **Rollout:** não regeocodificar em prod sem antes validar em staging, porque as coordenadas podem mudar levemente e mover pins no mapa.

## Quebra em PRs

1. Backend (porta, adaptador, caminhos, testes).
2. Script de legado (separado, para rodar sob controle).
