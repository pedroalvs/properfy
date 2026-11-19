# F04 · Plano do dia e roteiro

| | |
|---|---|
| **Contrato** | 00.1, 00.2, 00.5, 01.1–01.7, 01.14 (critérios 00.A1, 00.A5, 01.A1, 01.A2, 01.A3, 01.A6, parte do 00.A2) |
| **Esforço** | **25,75 dias** · dificuldade **A** (Parte A 16,5 + Parte B 9,25; reestimado na quebra em tarefas, 2026-10-28, para 23,75: limitador Mapbox compartilhado, folga para frente no otimizador, B4 subcusteado, preview de pesos, E2E do tour; +1,75 das lacunas L-F04-01..16 e +0,25 da reconciliação com a F01, ambas em 2026-10-29) |
| **Status** | Decisões fechadas em 2026-10-27. Pronto para spec. |
| **Depende de** | F01 (endereço-base), F02 (aviso de publicação), F03 (ações no card, `PlatformSetting`) |
| **Bloqueia** | F05, F06, F07 |
| **Decisões** | Q9 ✅, Q14 ✅ (resolvida pela lógica do T-1), Q19 ✅, reordenação ✅; Q8 (só redação do contrato) |

## Objetivo

Cada inspetor recebe, na véspera, o **roteiro do dia**: paradas em ordem, com horário previsto, traçado no mapa e tempo total. Ele pode reordenar e vê o impacto da mudança. Para isso, o app do inspetor ganha uma **Tela do Dia** como home.

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
|---|---|
| Publicação (Q9) | **Automática às 19:30 locais da véspera**, logo depois do corte T-1. Push/SMS "Your route for tomorrow is ready" (crítico, F02). A OP pode recalcular. Mudanças depois disso deixam o plano STALE, e ele é recalculado ao abrir. |
| Janelas (Q14) | **Todas rígidas no cálculo.** Não há o que decidir entre confirmada e não confirmada, porque às 19:30 **só sobram no D+1 appointments confirmados ou que não precisam de confirmação** (ver a lógica abaixo). |
| Reordenação que estoura janela | **Só avisa**, mesmo em parada confirmada ("Stop 4 would arrive after its window 10:00–12:00"). O inspetor decide e salva. Os avisos de horário ao inquilino (F06) passam a seguir a ordem salva, então um estouro gera o aviso de atraso. |
| Interação (Q19) | **Arrastar (`@dnd-kit`) + setas subir/descer.** |
| Provedor do cálculo (2026-10-27) | **Mapbox Matrix (perfil `driving-traffic`) + otimizador próprio**, atrás da porta `IRoutingService`. A **Google Route Optimization API** foi avaliada e descartada por agora. Os termos do Google (*Service Specific Terms*, §18.2) proíbem usar o resultado dela "in conjunction with a non-Google map", o que obrigaria a trocar para Google Maps **também o mapa do Dia ao Vivo no web**, além do roteiro no PWA. Isso traria dois provedores de mapa e um risco contratual permanente para qualquer tela futura que desenhe a rota. O esforço seria equivalente. A Mapbox Optimization v2 (beta) não é usada. |
| Saída medida para o Google | Na homologação, medir o **erro do deslocamento previsto × real** (horário previsto da parada × `started_at` do check-in, descontando a espera de janela). **Gatilho:** erro médio acima de 10 min nos últimos 30 dias → trocar o adaptador do `IRoutingService` para a Google Route Optimization e os 2 mapas de rota (PWA e Dia ao Vivo) para Google Maps, sem mexer no resto. |
| Duração da inspeção | **Definida no cadastro e na edição do tipo de serviço** (campo obrigatório "Estimated duration (min)" no `ServiceTypeFormDrawer`). É o tempo que o inspetor fica em cada parada; o otimizador soma esse tempo ao deslocamento. |
| Base do dia / sem base | Ver a decisão F01: origem trocável só para um dia; sem base, começa pela 1ª janela. |

### Decisões complementares (2026-10-29, lacunas L-F04 e reconciliação)

Detalhe e testes em `tarefas/F04-tarefas.md` ("Decisões aplicáveis" de cada tarefa).

| Tema | Decisão |
|---|---|
| Consulta à Mapbox (L-F04-03) | Dono: dev líder da F04 (Pedro Alves). Prazo: início da TASK-F04-2. Perguntas: (a) guardar traçado/resultados de Directions na vigência do plano; (b) guardar a matriz e as durações por trecho; (c) repassar a matriz crua ao cliente. **Plano B:** (c) negado → `routingInput` sai do contrato e a reordenação usa `POST /v1/inspector/day-plans/:date/order/preview` (avaliação no servidor); (b) negado → nada de matriz gravada, e salvar/preservar a ordem chama a Matrix de novo. **Resposta:** pendente (registrar aqui e no PR da TASK-F04-2). |
| STALE sem mudança não roteia (L-F04-01) | Antes de rotear, a leitura compara a impressão digital; se for igual, só limpa o STALE, sem chamada à Mapbox (check-out e DONE de parada iniciada não custam nada). |
| `published_at` manda (L-F04-02) | Plano publicado é sempre visível ao inspetor, em qualquer fuso. A auto-publicação pelo `GET` de D+1 exige a janela de 19:30 aberta no fuso do inspetor **e** no `PLATFORM_TIMEZONE`. |
| Origem `LAST_STOP` (L-F04-07) | Depois do 1º check-in do dia, o trecho restante parte da última parada executada; trocar a origem do dia passa a dar 422 `DAY_PLAN_ALREADY_STARTED`. |
| `ROUTE_CHANGED` agregado (L-F04-06) | Só com mudança efetiva (ordem das paradas restantes ou horário > 5 min) e no máximo 1 aviso por plano a cada 10 min. |
| Contato principal (L-F04-08) | `is_primary`, depois a ordem de `role` (inquilino → representante → housekeeper → PM → broker → outro), depois o mais antigo; telefone só se E.164; o card mostra o papel. |
| Folha do dia (L-F04-10) | Toda folha baixada é auditada; o inspetor baixa folhas de até 30 dias atrás; fusos misturados aparecem rotulados. |
| Sem histórico de versões (L-F04-15) | Cada cálculo substitui as paradas; a prova do horário comunicado ao inquilino fica no payload da notificação da F06 e no log `day_plan.computed`. |
| Plano inviável (L-F04-05) | Sinalizado no audit, no corpo do aviso ao inspetor e num log `warn`; a F05 mostra o alerta no roster. Sem notificação à OP. |
| Kill switch do provedor (L-F04-09) | `DAY_PLAN_ROUTING_PROVIDER=mapbox\|stub`. |
| Troca da base do inspetor (reconciliação F01) | A F01 não mexe em planos e emite `BASE_CHANGED`; a F04 marca STALE os planos publicados de hoje e de amanhã do inspetor, recalculados ao abrir. |
| Conteúdo dos avisos de roteiro (reconciliação F02) | Título e corpo aparecem na tela bloqueada: só data, contagem, horários e suburb. O SMS de fallback respeita o teto diário da F02; avisos de sistema são arquivados após 30 dias; `/today` entra na allowlist como padrão exato. |
| Token Mapbox (reconciliação X00, N5) | Resolvido a cada chamada pela config `mapbox` do Integrations Hub; nenhum adaptador lê `MAPBOX_ACCESS_TOKEN` direto. |

### Lógica verificada: quem chega no roteiro publicado às 19:30

O corte T-1 (`reject-unconfirmed-appointments.use-case.ts` + `findUnconfirmedForDate`, `prisma-appointment.repository.ts:858`) roda às 19:00 e **rejeita** os appointments de amanhã que cumprem todas estas condições: não CONFIRMED, `key_required = false`, `flow_type = ROUTINE` e `requires_rental_tenant_confirmation = true`. Então, às 19:30, os SCHEDULED do D+1 são só de três tipos:

1. **Confirmados pelo inquilino.**
2. **Com chave** (`key_required = true`): o inquilino não precisa estar em casa, então não passam pela confirmação.
3. **Tipos que não exigem confirmação** (Ingoing/Outgoing ou `requires_rental_tenant_confirmation = false`).

Não existe "não confirmado arriscado" no plano publicado, e todas as janelas entram como restrição. Os casos que entram **depois** do corte (confirmação forçada pela OP, reagendamento ou atribuição de última hora) deixam o plano STALE e são recalculados ao abrir. O plano de **hoje** sempre usa o estado atual.

Consequência para a F09 (01.13): "travado" passa a ser **CONFIRMED entre os que exigem confirmação**, medido antes do corte. Depois do corte, todo o restante já está, na prática, travado.

### Validação da API Mapbox (pesquisa de 2026-10-27)

| Ponto | O que a documentação diz | Como o plano usa |
|---|---|---|
| **Matrix API** (tempos par a par) | `driving-traffic`: **até 10 coordenadas** e 30 req/min. `driving`: até 25 coordenadas e 60 req/min. `depart_at` é **beta** (exige cadastro). Cobrança por elemento (origem × destino), com as **primeiras 100 mil por mês grátis**. | Usada **só para decidir a ordem**. Até 9 paradas + a base, perfil `driving-traffic`; acima disso, `driving`. Não usamos `depart_at` da Matrix (beta). |
| **Directions API** (rota em ordem fixa) | `driving-traffic` com até 25 waypoints; **`depart_at` suportado** (GA) para driving e driving-traffic; geometria em GeoJSON. Cobrança por requisição, com as **primeiras 100 mil por mês grátis**. | Depois de escolher a ordem, **calcula os horários previstos finais e o traçado** com `depart_at` = saída prevista de cada trecho (uma chamada por trecho, que absorve as esperas de janela). Isso resolve o problema de calcular às 19:30 com o trânsito da noite: o horário previsto reflete o trânsito típico do horário real do trecho. |
| **Optimization API** | A v1 tem limite de 12 coordenadas e **não tem janelas de horário**. A v2 tem janelas e durações, mas está em **beta público**. | **Não usada.** Otimizador próprio (busca exata para ≤ 8 paradas, que é a carga real de 3–4 por dia). |
| **Volume e custo** | Ex.: 30 inspetores × 22 dias × matriz 5×5 ≈ 16,5 mil elementos/mês. Directions ≈ 30 × 22 × 5 trechos × ~2 (publicação + recálculos) ≈ 6,6 mil req/mês. | **Dentro da faixa gratuita** das duas APIs no volume atual. Medir na homologação (§7). |
| **Guardar o traçado** | Não encontrei nos termos públicos da Mapbox uma cláusula explícita sobre guardar resultados de Directions/Matrix. A Geocoding tem uma regra explícita (ver abaixo). | Guardar `route_geometry` **só durante a vigência do plano** e apagar o traçado de planos passados (job diário). Os horários previstos e a ordem são cálculo nosso. **Confirmar com a Mapbox** (suporte ou comercial) antes do go-live. |
| **Geocodificação (dependência)** | O modo **temporário** (padrão) **proíbe guardar coordenadas no banco**. O modo **permanente** (`permanent=true`) permite, com preço maior por requisição. | O endereço-base da F01 usa `permanent=true`. **Achado:** a geocodificação de imóveis que já existe (`mapbox-geocoding.service.ts:14`) usa o modo temporário e grava lat/lng. Isso é um risco de conformidade que já existe hoje (ver estacionamento). |

**Conclusão:** a Mapbox atende ao contrato sem depender de nada em beta. A precisão do horário previsto vem do Directions com `depart_at` por trecho, não da Matrix. O que o Google faria melhor (otimizador maduro com janelas) não faz diferença com 3–4 paradas por dia. A saída para o Google continua valendo pelo gatilho de 10 min.

## Estado atual (verificado @042a9674)

- **Mapbox:** sem Directions, Matrix ou Optimization; só geocodificação v5. Também não há SDK de LLM.
- **Ordem das paradas:** o Appointment não tem coluna de ordem. O PWA ordena por `timeSlotStart` e depois por bairro (`useScheduleDay.ts:13-16`).
- **Duração:** `ServiceType` não tem duração (`schema.prisma:421-440`). Existe `avgExecutionMinutes` no analytics (`prisma-dashboard-analytics.repository.ts:201,239`).
- **Janelas:** `time_slot_start/end` são `HH:mm` NOT NULL. O "travado" é inferido de `rental_tenant_confirmation_status` (`:556`) + `requires_rental_tenant_confirmation` (`:426`). Para converter em instante, usar `zonedWallTimeToUtc`.
- **Carga diária:** limites de 3/4 paradas (`inspector-workload.ts:19-20`). Isso torna viável uma busca exata.
- **Reúso no PWA:** o mapa de ofertas já tem pins numerados (`lib/offers-map/markers.ts:60`) e uma linha GeoJSON (`useOfferRoute.ts`, reta e na ordem do `appointment_number`). Generalizar esses hooks para `apps/pwa/src/lib/map/`.
- **Navegação do PWA:** `/` redireciona para `/schedule` (`router.tsx:150`). A barra tem Schedule / Offers / Earnings / Profile (`BottomNavBar.tsx:70-73`), com o teste `nav-clearance-contract.test.ts`.
- **Detalhe do serviço no PWA:** já mostra chave, local de encontro, endereço (link do Google Maps em `PropertyAddressSection.tsx:32-34`), contatos, apps, restrições e nota do inquilino.
- **Geradores de arquivo:** XLSX (`report/infrastructure/exceljs-xlsx-generator.ts`) e PDF (`billing/infrastructure/pdfkit-invoice-pdf.generator.ts`) já existem.
- **Padrão de porta de provedor:** `IGeocodingService` + `DynamicGeocodingService` (`dynamic-providers.ts:131`), com o token do servidor (`MAPBOX_ACCESS_TOKEN`).
- **Corte T-1:** `appointment.reject-unconfirmed` roda às 19h locais **fixas** (`workers.ts:290-295`).

## Escopo mínimo

| Item | O que fazer | Dif. | Dias | Depende de |
|---|---|---|---|---|
| B5 (01.12) | `ServiceType.default_duration_minutes` **obrigatório** (migration com backfill de 45 min ou da média medida em `avgExecutionMinutes`). Campo "Estimated duration (min)" no `ServiceTypeFormDrawer` (`apps/web/src/features/service-types/components/`), na criação e na edição, com validação de 5 a 480 no shared. É o tempo de cada parada no roteiro. | B | 0,5 | – |
| 01.1a | Porta `IRoutingService { matrix(points), directions(orderedPoints) }`. Adaptador Mapbox Matrix (`driving-traffic` até 10 pontos, `driving` acima disso) **só para a ordem** + Directions v5 com `depart_at` **por trecho** para os horários previstos e o traçado (ver "Validação da API Mapbox"), um stub com haversine e um `DynamicRoutingService` que reusa a config `mapbox` do Integrations Hub. | M | 2,0 | – |
| 01.1b | Otimizador puro (domínio, sem I/O): origem na base; janelas rígidas; duração por tipo; pesos (01.14). Busca exata para ≤ 8 paradas; acima disso, vizinho mais próximo viável + 2-opt. A saída é sequência, horários previstos, esperas e violações. Coberto por testes de unidade com casos de janela. | A | 2,5 | 01.1a, B5 |
| 01.2 / 01.A3 | A origem é `base_lat/lng` (F01); sem base, usa a primeira janela. Exceção: uma parada CONFIRMED com janela mais cedo vem primeiro (Q14), o que já sai naturalmente das janelas rígidas. | – | incl. | F01 |
| B4 | Modelos `DayPlan(inspector_id, date, status DRAFT/PUBLISHED/STALE, published_at, total_drive_s, finish_eta, route_geometry GeoJSON)`. O traçado do Directions fica salvo para o app e para a tela Dia ao Vivo (F05), sem nova chamada ao Mapbox na leitura. e `DayPlanStop(appointment_id, sequence, eta, travel_s, wait_s, manual)`, **sem tenant_id**. Job `day-plan.publish` às 19:30 local (tick por agência, depois do T-1) para D+1 → push "Seu roteiro de amanhã está pronto" (F02, crítico). Mudanças em appointments do dia (atribuição, reagendamento, cancelamento) marcam STALE, e o plano é recalculado ao abrir. A OP pode "Recalcular". | A | 2,5 | 01.1b, F02 |
| 00.1 / 00.5 | **Tela do Dia** = nova home (`/today`) com o layout do design v3: saudação + "X de N feitas · término ~hh:mm", card **Próxima inspeção** (endereço, janela, previsto, distância, Navegar + Check in do F03), lista "Coming up" e o card de avisos não lidos (F02). A barra muda para **Today / Schedule / Offers / More**; Earnings e Profile vão para dentro de More. | M | 2,5 | F02, F03 |
| Base do dia | Na tela do roteiro, o inspetor vê "Starting from: [base] ✎" e pode trocar a origem **só daquele dia** (hoje ou um dia futuro com plano), usando o mesmo autocomplete de endereço. Grava `origin_override_json/lat/lng` no `DayPlan`, recalcula o roteiro e audita. A base padrão do perfil não muda. Sem base nenhuma, o roteiro começa pela 1ª janela e mostra o aviso "No base address: route has no starting point" (decisão F01). | B | 0,75 | B4, F01 |
| 00.2 tour | **Tour do app no padrão dos apps (coach marks):** tela escurecida, destaque recortado no elemento alvo, balão com título e texto curto explicando a função, **Back / Next / Skip** e um indicador de passos ("3 de 7"). Passos sugeridos (a spec fecha a lista e os textos): aba Today, card Próxima inspeção (Navigate + Check in), "Não consigo fazer" / "Vou atrasar", lista do roteiro + reordenar, aba Schedule, aba Offers, aba More (avisos, desafios, perfil), e o **passo final de instalação** (só aparece fora do modo standalone, com instruções iOS ou Android). Abre no primeiro acesso depois do login. Concluir ou pular grava `onboarding_completed_at` no Inspector (pelo endpoint do heartbeat da F01), para não reaparecer em nenhum dispositivo. Em More → Settings, a opção **"Show app tour"** reabre o tour sem alterar esse estado. Os alvos são marcados com `data-tour="..."`. O componente é próprio, sem dependência nova: overlay + recorte via `box-shadow`/`clip-path`, posicionamento por `getBoundingClientRect`, trava de foco, Escape = pular e `prefers-reduced-motion`. Se um alvo não estiver na tela, o passo é pulado sem quebrar o tour. Os banners de instalação atuais continuam. | M | 2,0 | 00.1/00.5 |
| 01.4 | Aba de mapa no roteiro: pins numerados + traçado real (Directions), reusando os hooks generalizados do mapa de ofertas. | M | 1,5 | 01.1a |
| 01.3 | **Reordenar** na lista "Today's route": arrastar (`@dnd-kit`) + setas subir/descer (Q19). O recálculo é **local** a partir da matriz em cache, sem chamada de API, e mostra "+12 min vs. sugerido" e avisos de janela violada. Ao salvar, chama Directions uma vez para o traçado e grava `manual=true`. | M | 2,0 | 01.1b |
| 01.5 | O card da parada mostra endereço, janela, previsto, chave/local de encontro e um botão de ligar para o contato principal. Tocar abre o detalhe existente. **Sem** campo novo. | B | 0,25 | – |
| 01.6 | O botão Navegar usa `maps.apple.com` no iOS e Google nos demais. | B | 0,25 | – |
| 01.7 | `GET …/day-plan/:date/sheet?format=pdf\|xlsx` (inspetor: o próprio; AM/OP: qualquer). Colunas: nº, janela, previsto, endereço, serviço, contato, chave. Síncrono. | M | 1,5 | B4 |
| Medição | Métrica "Route ETA accuracy": erro médio absoluto do previsto × real das paradas dos últimos 30 dias, calculado a partir de `DayPlanStop.eta` e do `started_at` da execução. Exibido para AM/OP como um indicador pequeno no rodapé da tela Dia ao Vivo (F05). É o dado do gatilho Mapbox → Google. | B | 0,25 | B4, F03 |
| 01.14 | Pesos da rota (3 valores) no `PlatformSetting`, com "Pré-visualizar" num inspetor/dia na página de settings. | B | 0,5 | B6 (F03), 01.1b |

## Fora do escopo

- Multi-dia.
- Realocação entre inspetores.
- Trânsito em tempo real.
- Restrições de veículo.
- Navegação dentro do app.
- Uso de LLM.
- Mover janelas automaticamente.
- Redesenhar Earnings, Offers ou o detalhe do serviço.

## RBAC

| Ação | Quem pode |
|---|---|
| Ver e reordenar o plano | INSP (o próprio) |
| Ver, recalcular e exportar qualquer plano | AM/OP |
| Plano | CL não vê (o plano cruza agências) |

## Critérios de aceite → como provar

- **01.A1:** depois da publicação, o plano tem sequência, horários previstos e traçado. Provar com o job em homologação + E2E com o Mapbox stubado.
- **01.A2:** reordenar recalcula e mostra a diferença no total.
- **01.A3:** a primeira parada é a mais próxima da base, salvo janela CONFIRMED mais cedo. Provar com testes de unidade do otimizador.
- **01.A6:** PDF e XLSX com as paradas do roteiro.
- **00.A5:** o endereço-base é a origem (mesmo teste do 01.A3).
- **00.A2:** a publicação do plano dispara o push, ou o SMS para quem não tem push.
- **00.A1:** o app é instalável no iOS 16.4+ e no Android, e o tour guiado (com o passo de instalação) aparece no 1º acesso, pode ser pulado, não reaparece depois de concluído e pode ser revisto em Settings. Provar com E2E do tour + smoke em dispositivo.

## Riscos e armadilhas

- **Contrato da F02:** ao mover a caixa de avisos para "More", atualizar **no mesmo PR** a allowlist `INSPECTOR_NOTICE_TARGET_PATTERNS` (adicionar `/today` e o novo caminho da caixa), senão os pushes antigos abrem 404. A F04 publica `ROUTE_PUBLISHED`/`ROUTE_CHANGED` via `PublishSystemInspectorNoticeUseCase`. Avaliar um filtro "Source" (manual/sistema) na lista web de avisos.

- **Token do Mapbox:** Directions e Matrix exigem o token do **servidor**. Não expor no PWA. O traçado vem do backend como GeoJSON.
- **Cor das camadas:** paint do Mapbox usa HSL com vírgula (lição do #1302).
- **Navegação:** a troca da barra precisa manter o `nav-clearance-contract.test.ts` passando.
- **Fuso:** horários previstos são instantes; janelas são horário de parede da agência. Usar sempre `zonedWallTimeToUtc`. Para testes, ver `feedback_tz_dependent_test_must_pin_away`.
- **Custo de API:** Matrix por cálculo e Directions por publicação/reordenação. Medir na homologação (§7).
- **Mapa de ofertas:** a linha atual liga as paradas na ordem do número do appointment. Não chamá-la de "rota".

## Quebra em PRs

1. Backend de domínio (duração, porta de roteamento, otimizador): testes pesados, pouca superfície.
2. `DayPlan` + job de publicação + API + folha PDF/XLSX.
3. PWA navegação + Tela do Dia + lista + base do dia.
3b. PWA tour do app (depois da navegação final, para os alvos existirem).
4. PWA mapa + reordenação.
5. Web (duração no tipo de serviço, pesos).
