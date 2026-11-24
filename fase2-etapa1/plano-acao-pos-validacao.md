# Fase 2 — plano de ação pós-validação

**Origem:** nota "Fase 2 — o que falta vs escopo" (23/11/2026), discutida ponto a ponto.
**Base de código:** `develop` em `64c65d66`.
**Para quem:** agente de código que vai executar cada item. Cada item diz o que foi decidido, o que fazer, o que não fazer e como provar que ficou pronto.
**Estado:** em construção — só entram aqui itens já decididos. Itens ainda em discussão estão na lista do fim.

## Regra de escopo (Pedro, 23/11/2026)

**A fonte da verdade é o escopo contratado:** o Anexo I "O campo equipado" (entregas 00, 01, 03, D, E, C). Texto extraído em `fase2-etapa1/arquivo/anexo-I-texto-extraido.txt` (arquivo local, **não commitar**; o original `.pages` está na mesma pasta). O PDF "Properfy Inspector App v3" é **só guia visual e de design**: funções e regras vêm do anexo. Uma diferença em relação ao PDF não é diferença de escopo. Vale também a regra de interpretação do próprio anexo: "funcionalidade não descrita neste anexo não integra o escopo contratado".

**Entregamos só o que está no escopo.** Se algo a mais já existe no código, a direção é **retirar** — mas nunca sem a decisão do Pedro antes, item a item. O agente não acrescenta acabamento fora do escopo e não remove nada por conta própria: levanta, pergunta, e só então age.

Regras que valem para todos os itens: `CLAUDE.md` da raiz e do workspace tocado (worktree, TDD, Conventional Commits sem referência a IA, PR para `develop`, CLAUDE.md do workspace atualizado no mesmo PR).

---

## A — "Show login details" (credenciais do app de laudo no app do inspetor)

**Natureza:** só documentação. Nenhuma mudança de tela.

### O que se descobriu

A nota e a validação de 18/11 diziam "único item do PDF sem entrega, parqueado por segurança". Isso está errado:

- O app do inspetor **já mostra** usuário e senha do app de laudo, em texto aberto, com toque para copiar: cartão "Apps" no detalhe do agendamento (`apps/pwa/src/features/schedule/components/AppsSection.tsx`, linhas 113–114), alimentado por `apt.apps` (registro `AppCredential` por imobiliária, referência viva).
- A validação olhou só `JobDetailsSection.tsx` (o link `inspectionAppLink`) e não viu o cartão "Apps".
- A apresentação difere do mockup v3 (PDF p.2): lá as credenciais ficam recolhidas atrás de "Show login details", num cartão único "Report in … / Open app"; no app são dois lugares (cartão "Apps" + link em Job details) e as credenciais ficam sempre visíveis.

Verificado por leitura de código; não testado em tela.

### Decisão (Pedro, 23/11/2026)

- O que o escopo cobre — o inspetor ter acesso às credenciais — **está entregue**. Reclassificar nos documentos.
- **Não** recolher as credenciais nem fundir os cartões: é alinhamento ao mockup, fora do escopo (regra de escopo). A tela fica como está.
- Histórico: no mesmo dia chegou a ser decidido recolher + fundir com aprovação prévia do design; a decisão foi revista ao fixar a regra de escopo. Se um dia for reaberto, a aprovação do design pelo Pedro antes de qualquer mudança de tela continua valendo.

### O que fazer (entra no PR de docs, sem worktree)

- `fase2-etapa1/estacionamento.md` linha 49: trocar "DECIDIDO 18/11: PARQUEAR … por segurança" por: entregue pelo cartão "Apps"; a apresentação difere do mockup v3 (sempre visível, dois lugares) e não será alterada por estar fora do escopo. Manter o registro de que houve a decisão de 18/11 e por que foi revista (a validação não viu o cartão "Apps").
- `fase2-etapa1/VALIDACAO-consolidada.md` linhas 130 e 144: corrigir "ÚNICO item do PDF sem registro de decisão" — o dado já chegava ao inspetor.
- A diferença de apresentação entra na lista de "diferenças frente ao mockup" (seção C), para o relatório do cliente.

### Não fazer

- Não tocar em `AppsSection.tsx`, `JobDetailsSection.tsx` nem em qualquer tela.

### Pronto quando

- Os dois documentos corrigidos e mergeados.
- Na verificação em DEV (seção G): um agendamento de imobiliária com app cadastrado mostra o cartão "Apps" com usuário e senha.

---

## B1 — Selo de prioridade nas ofertas: retirar o código morto

**Natureza:** limpeza no PWA + correção de documentação. Sem backend, sem contrato.

### O que se descobriu

- A regra de acesso antecipado (F08-2) está entregue como o escopo pede (F08 03.7 / Q13): filtro que esconde a oferta nas primeiras H horas para quem está abaixo do nível, a mesma checagem no aceite, e a configuração em Platform Settings. **O escopo não pede sinal visual.**
- O app do inspetor carrega um selo de contagem regressiva que nunca acende: o campo que o alimenta (`priorityExpiresAt`) não existe no servidor, só como campo local opcional, junto de um `priorityMode` igualmente inexistente.
- O Marketplace do web (`/marketplace`) é tela do próprio inspetor e não tem selo.

### Decisão (Pedro, 23/11/2026)

- **Retirar o código morto do selo no app.** Não ligar o selo, nem no app nem no web (fora do escopo).
- Corrigir a documentação que trata isso como "gap".
- Histórico: antes da regra de escopo chegou a ser decidido ligar o selo ("Early access · 5h 20m left", sumindo ao zerar). Revisto no mesmo dia. Se o cliente pedir o selo, o desenho técnico é: o backend envia `priorityExpiresAt = published_at + H` só para o inspetor qualificado, reusando `service-group/domain/early-access.ts`, com o campo declarado no schema de resposta.

### O que fazer — PR no PWA (`apps/pwa`, com worktree)

Remover, e só isto:

- `features/offers/components/OfferCard.tsx`: a função `usePriorityCountdown`, a chamada e o comentário que a acompanha, o bloco "Priority countdown" (`data-testid="priority-countdown"`), e os imports que ficarem sem uso (`Clock`, `ClockAlert` e hooks, **somente se** nada mais no arquivo usar).
- `features/offers/types/index.ts`: os campos `priorityMode?` e `priorityExpiresAt?`. Se a interface ficar vazia, virar um alias direto do tipo de `@properfy/shared`; ajustar o comentário do arquivo.
- Testes: apagar os dois casos do selo em `OfferCard.test.tsx` ("renders no countdown when priorityExpiresAt is absent…" e "shows priority countdown when priorityExpiresAt is set") e tirar `priorityExpiresAt: null` das fixtures em `AcceptOfferModal`, `GroupDetailBottomSheet`, `OfferAccordionList`, `OffersMapView`, `useMarketplaceOffers` e `MarketplacePage` (testes).
- Antes de fechar: `git grep -nE "priorityExpiresAt|priorityMode|priority-countdown|Priority expired" -- apps packages` deve voltar vazio (inclui stubs de E2E).
- Atualizar `apps/pwa/CLAUDE.md` se ele mencionar o selo.

### Não fazer

- Não mexer no backend, em `packages/shared`, em `openapi.json` ou `api-types.ts`.
- Não alterar o filtro, o aceite ou o 403 `OFFER_EARLY_ACCESS_ONLY`.
- Não aproveitar para remover `priorityOfferHours` (campo por imobiliária, morto) — é item separado da seção E, ainda sem decisão.
- Não redesenhar o cartão de oferta: o espaço do selo simplesmente deixa de existir.

### Documentação (entra no PR de docs)

- Onde o item aparecer como "gap" (nota de validação, `VALIDACAO-consolidada.md` se citar), registrar: acesso antecipado entregue conforme o escopo; o selo não fazia parte e o código morto foi retirado.

### Verificação

- `pnpm --filter pwa typecheck`, `lint`, `test` e o E2E do PWA verdes. Como é remoção, não há teste novo a escrever: a prova é a suíte existente continuar verde e o grep vazio.
- Em DEV (seção G), conferir o caso de borda já coberto pelo escopo: inspetor abaixo do nível que tenta aceitar uma oferta em janela vê a mensagem do servidor ("This offer opens to all inspectors on <dia> at <hora>."). Se o app mostrar erro genérico, **levantar ao Pedro** — não corrigir por conta própria.

### Pronto quando

- PR do PWA verde em CI e mergeado; grep vazio.

---

## B2 + G — Verificação completa da Fase 2 em DEV (roteiro)

**Natureza:** teste em navegador, sem código. Um agente executa; o resultado é um relatório.

### O que se descobriu (leitura da API de DEV em 23/11, sem abrir telas)

| Item | Estado em DEV |
|---|---|
| "Early offer access" (Platform Settings ▸ Inspector program) | Desligado |
| "Send arrival notices to rental tenants" (Platform Settings ▸ Tenant arrival notices) | Desligado |
| Aviso de chegada por imobiliária (formulário da imobiliária) | Ligado (padrão) nas 3 imobiliárias |
| As 7 seções de Platform Settings | Todas no padrão; nenhuma foi salva alguma vez |
| Push no app do inspetor | Desativado — `GET /v1/inspectors/me/push-config` devolve `vapidPublicKey: null` |

Desligado não é defeito (o escopo diz que o acesso antecipado nasce desligado). Mas, assim, DEV não demonstra acesso antecipado, avisos de chegada nem push. A validação de 12/11 e a nota de 23/11 foram feitas só por leitura de código: **nada da Fase 2 foi conferido em tela.**

### Decisões (Pedro, 23/11/2026)

1. **Quem executa:** um agente com navegador (Claude in Chrome ou Playwright, o que funcionar melhor).
2. **Alcance:** teste completo — todas as funcionalidades da Fase 2 (X01–X03, F00–F10), nos quatro perfis.
3. **DEV é livre:** o agente pode fazer em DEV tudo o que o teste precisar — ligar interruptores, alterar configurações, criar e alterar dados, disparar jobs.
4. **Sem dado, cria e volta:** se uma tela não tiver dado para ser testada, o agente cria o dado e **refaz** o teste. "Não deu para testar" só vale quando a causa está fora de DEV (ver "Limites").
5. **Interruptores ficam ligados** ao final, para a demo e as capturas do relatório do cliente.

### Limites (o "livre" vale só para DEV)

- Só `properfy.pedroalvs.com` (web), `pwa-properfy.pedroalvs.com` (app do inspetor) e `properfy-api-dev.fly.dev` (API). **Nunca** staging nem produção, nem para leitura "só para comparar".
- **Mensagens reais:** antes de ligar avisos de chegada ou publicar aviso crítico a inspetores, descobrir se DEV envia SMS/e-mail de verdade (provedor real ou simulado) e para quem. Se for real, usar somente contatos de teste que pertençam ao Pedro — perguntar a ele quais. Nunca disparar para número ou e-mail de terceiros.
- **Não corrigir nada durante o teste.** Defeito encontrado é registrado com evidência e levado ao Pedro; correção vira item próprio deste plano.
- Capturas de tela **nunca** entram em commit. Salvar em `output/smoke-dev/` (não rastreado).
- Regra de escopo: se aparecer em tela algo que não está no escopo, registrar na lista "a mais" do relatório para decisão do Pedro. Não remover.

### Acessos

- Contas seed de DEV (senha na referência de ambientes do projeto): `admin@` (AM), `op@` (OP), `cl.admin@` (CL_ADMIN), `cl.user@` (CL_USER), `insp@` (INSP), todas `@pedroalvs.com`. O inspetor usa o PWA.
- Portal do inquilino: pelo link único de um agendamento (gerar/copiar o link pela tela do agendamento como AM/OP).
- Se a conta AM exigir 2FA, seguir o procedimento de matrícula headless já documentado; não desativar 2FA.

### Fase 0 — Preparar DEV (antes de testar)

1. Confirmar que DEV está na versão do `develop` atual (`/health` responde; comparar a versão exibida no rodapé do PWA com o último commit).
2. **Push:** DEV não tem chave VAPID. Gerar um par exclusivo de DEV e configurar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` no app Fly `properfy-api-dev` (isto resolve em DEV o primeiro item da seção D). Conferir que `push-config` passa a devolver a chave.
3. **Roteamento:** conferir qual provedor está ativo em DEV (`DAY_PLAN_ROUTING_PROVIDER`). O teste de rota do dia tem de rodar com `mapbox`, não com o simulado (resolve em DEV o item "validar roteamento Mapbox real" da seção D).
4. **Interruptores:** ligar "Early offer access" e "Send arrival notices to rental tenants" (este último só depois do cuidado com mensagens reais). Registrar data/hora em que foram ligados.
5. **Inventário de dados.** Conferir e, se faltar, criar:
   - imobiliária com filial, imóveis geocodificados e contatos de inquilino (de teste);
   - agendamentos em cada status (DRAFT, AWAITING_INSPECTOR, SCHEDULED, DONE, CANCELLED, REJECTED), com pelo menos 3 SCHEDULED no **mesmo dia para o mesmo inspetor** (rota do dia) e alguns para **hoje** (Live Day, check-in);
   - inspetor com endereço-base e outro **sem** endereço-base; um segundo inspetor para testes de nível;
   - snapshot do índice de confiabilidade existente, com um inspetor no nível mínimo do acesso antecipado e outro abaixo;
   - grupo de serviço publicado **depois** de ligar o acesso antecipado, agendado para D+2 ou mais;
   - meta ativa e pelo menos um prêmio em cada estado alcançável;
   - imóvel com arquivos e com um problema (issue) reportado;
   - app de laudo cadastrado (Apps) e marcado como padrão da imobiliária.
   Recursos que dependem de job agendado (publicação da rota às 19:30, snapshot do índice, fechamento de metas às 04:45): preferir a ação equivalente em tela/API (recalcular, pré-visualizar); se não houver, disparar o job em DEV e registrar como foi feito.

### Roteiro — o que conferir

Para cada linha: abrir a tela com o perfil indicado, executar a ação, comparar com o esperado, capturar a tela. Anotar os **nomes exatamente como aparecem na interface** (servem ao relatório do cliente).

**Fundação**

| # | Funcionalidade | Perfil | Conferir |
|---|---|---|---|
| X01 | Navegação | AM, OP, CL_ADMIN, CL_USER | Itens do menu por perfil; botão voltar nas telas de detalhe volta para a origem; grupo com um único filho abre direto |
| X02 | Geocodificação | AM/OP | Criar/editar imóvel com endereço real → coordenadas preenchidas e pino no mapa; endereço inválido tratado sem erro genérico |
| F00 | Janela de período do mapa | AM/OP, CL_ADMIN | **Levantar os rótulos de tela** do filtro de período e do indicador de janela; a imobiliária fica limitada à sua janela; AM/OP alteram a janela da imobiliária no formulário dela |

**F01 — Endereço-base e adoção do app**

| # | Perfil | Conferir |
|---|---|---|
| F01-a | INSP (PWA) | Cartão de endereço-base e aviso quando falta; salvar endereço → geocodifica; rodapé mostra a versão |
| F01-b | AM/OP | Lista de inspetores com colunas App / Push / Last seen, selo e filtro "No base address"; detalhe com "Base Address" e "App Adoption" |
| F01-c | CL_ADMIN, CL_USER | Não veem endereço-base nem dados de adoção do inspetor |

**F02 — Avisos aos inspetores e push**

| # | Perfil | Conferir |
|---|---|---|
| F02-a | AM/OP | "Inspector notices": criar aviso normal e aviso crítico (confirmação com teto de SMS e janela noturna); arquivar; detalhe com recibos de leitura |
| F02-b | INSP (PWA) | Caixa "Announcements" com contador de não lidas; marcar como lida reflete no recibo do AM/OP |
| F02-c | INSP (PWA) | Ativar push em Settings; aviso publicado chega como notificação (no navegador do agente; aparelho real fica na seção D); sair da conta cancela a inscrição |

**F03 — Check-in/check-out, cerca geográfica e eventos de campo**

| # | Perfil | Conferir |
|---|---|---|
| F03-a | INSP (PWA) | Check in e Check out em 2 toques no cartão da agenda; aviso (não bloqueio) fora do raio |
| F03-b | INSP (PWA) | "Can't do this job": motivos, agendamento sai da agenda; "Running late": horário estimado calculado |
| F03-c | AM/OP | Detalhe do agendamento com bloco "Field activity"; linha do tempo com os rótulos de campo; alerta de inspetor impossibilitado; agendamento voltou a REJECTED |
| F03-d | AM/OP | Platform Settings ▸ Field events: alterar raio/modo e ver o efeito no app |
| F03-e | CL_ADMIN, CL_USER | Veem distância e sinalizações, **nunca** latitude/longitude do inspetor (tela, exportação e histórico) |
| F03-f | TNT (portal) | Após "Can't do", o portal não oferece trocar horário quando não deve |

**F04 — Rota do dia**

| # | Perfil | Conferir |
|---|---|---|
| F04-a | INSP (PWA) | Tela "Today" e lista da rota com ordem, horários previstos e mapa; ligar/navegar a partir da parada |
| F04-b | INSP (PWA) | Reordenar paradas → pré-visualização do servidor com novos horários; alterar ponto de partida; recalcular |
| F04-c | INSP (PWA) | Tour do app na primeira entrada e "Show app tour" depois |
| F04-d | AM/OP | Duração padrão por tipo de serviço; Platform Settings ▸ Route planning com pré-visualização dos pesos; folha de rota (PDF/XLSX) |
| F04-e | — | Rota calculada com Mapbox real (não simulado): horários coerentes com distâncias reais |

**F05 — Live Day**

| # | Perfil | Conferir |
|---|---|---|
| F05-a | AM/OP | Tela "Live Day": inspetores do dia, paradas, traçado **reto** entre paradas (decisão registrada), atualização periódica |
| F05-b | AM/OP | Alertas (atraso, não iniciado etc.) aparecem após provocar a condição; limites em Platform Settings ▸ Live Day alerts e por inspetor |
| F05-c | CL_ADMIN, CL_USER | Não têm acesso ao Live Day |

**F06 — Avisos de chegada ao inquilino**

| # | Perfil | Conferir |
|---|---|---|
| F06-a | AM/OP | Com o interruptor ligado: aviso da manhã e aviso de atraso saem por SMS/e-mail para o contato de teste; aparecem no histórico de notificações |
| F06-b | AM/OP | Interruptor da imobiliária desligado → nada sai para ela, mesmo com o da plataforma ligado |
| F06-c | TNT | Link de descadastro do aviso funciona; previsão **não** aparece no portal (decisão registrada) |

**F07 — Índice de confiabilidade / desempenho do inspetor**

| # | Perfil | Conferir |
|---|---|---|
| F07-a | AM/OP | Tela de desempenho do inspetor com índice, métricas e nível; Platform Settings ▸ Reliability index |
| F07-b | CL_ADMIN, CL_USER, INSP | Não acessam a tela de AM/OP |

**F08 — Metas, prêmios e acesso antecipado**

| # | Perfil | Conferir |
|---|---|---|
| F08-a | AM/OP | Programa do inspetor: abas Goals e Rewards; criar meta; aprovar e anular prêmio |
| F08-b | AM | Prêmio aprovado vira lançamento de bônus na fatura do inspetor; anular reverte |
| F08-c | INSP (PWA) | "Challenges": posição, metas ativas com progresso, prêmios, ranking anônimo |
| F08-d | INSP abaixo do nível | Oferta recém-publicada (D+2 ou mais) **não aparece**; passada a janela, aparece |
| F08-e | INSP no nível | A mesma oferta aparece e pode ser aceita dentro da janela |
| F08-f | INSP abaixo do nível | Tentando aceitar a oferta em janela (link direto ou tela aberta antes): mensagem com **dia e hora** de abertura, não erro genérico (pendência do item B1) |
| F08-g | AM/OP | Relatório do programa do inspetor gerado e baixado |

**F09 — Densidade de atividade no mapa**

| # | Perfil | Conferir |
|---|---|---|
| F09-a | AM/OP | Camada "Activity density" no mapa (modo Appointments), seletor de período incluindo personalizado, legenda |
| F09-b | CL_ADMIN | Só períodos pré-definidos (7/30/90 dias); células com poucos registros ocultas; texto de privacidade |

**F10 — Arquivos do imóvel**

| # | Perfil | Conferir |
|---|---|---|
| F10-a | AM/OP, CL_ADMIN | Painel de arquivos do imóvel: enviar, nova versão, excluir; tipos e tamanho aceitos (anotar o que é recusado — alimenta o item de bucket da seção D) |
| F10-b | INSP (PWA) | Seção de arquivos no agendamento, só leitura e só online; reportar problema com foto |
| F10-c | TNT (portal) | Reportar problema com fotos pelo link; limite de envios |
| F10-d | AM/OP | Platform Settings ▸ Property files |

**Itens herdados de outras seções deste plano**

| # | Origem | Conferir |
|---|---|---|
| H-1 | A | Agendamento de imobiliária com app cadastrado mostra o cartão "Apps" com usuário e senha no PWA |
| H-2 | E | Consent Lookup abre só pelo endereço `/notification-consents` (sem item de menu) |
| H-3 | E | "Properties" aparece no menu do Inspetor (web) e a rota bloqueia |
| H-4 | E | Settings ▸ Security mostra "Session management is not available yet." |

**Isolamento entre perfis (em todas as seções)**

- CL_ADMIN/CL_USER de uma imobiliária não veem dados de outra (trocar de imobiliária e repetir uma consulta de cada módulo).
- CL_* nunca recebem coordenadas do inspetor.
- INSP só vê a própria agenda, rota, avisos e prêmios.

### Entrega

Arquivo `fase2-etapa1/smoke-dev-AAAA-MM-DD.md` com:

- tabela por item do roteiro: **Passou / Falhou / Não testável** (com a causa), perfil usado, nome da tela como aparece na interface, caminho da captura;
- lista de **defeitos**, cada um com passos para reproduzir, esperado × obtido e captura;
- lista **"a mais"**: o que existe em tela e não está no escopo (para decisão do Pedro);
- o que foi alterado em DEV: interruptores ligados, configurações mudadas, dados criados, jobs disparados, segredos configurados;
- o que ficou para aparelho real / outros ambientes (seção D).

### Pronto quando

- Todos os itens do roteiro têm resultado; nenhum "Não testável" por falta de dado em DEV.
- Defeitos e itens "a mais" apresentados ao Pedro para decisão.
- Os dois interruptores ligados em DEV e o push configurado.

---

## C — "Diferenças frente ao escopo/mockup": nenhuma procede

**Natureza:** só documentação.

### O que se descobriu

A nota listava 8 "diferenças com decisão registrada". Conferidas uma a uma contra o texto literal do anexo, **nenhuma é diferença frente ao escopo**. A lista tinha sido montada comparando o app com o PDF de design.

| # | Item da nota | Texto do anexo | Veredito |
|---|---|---|---|
| 1 | Live Day com traçado reto entre paradas | O traçado é exigido no aplicativo (01.4 "Mapa do roteiro com pontos numerados e traçado"; tela "Mapa do Roteiro (aplicativo)"; 01.A1). No web: "Mapa de Estados dos Inspetores (web) — mapa onde cada inspetor está". | Não procede. O app usa o traçado real (conferido no código). |
| 2 | Check-in/check-out em 2 toques | 00.7 "Botões de check-in, checkout e cancelamento na página de agenda"; glossário: check-in e checkout = "eventos de início e de encerramento da execução". | Não procede. São os botões pedidos. |
| 3 | "Can't do this job" libera o serviço | 00.A3: check-in, checkout e cancelamento "gravam evento com data, hora e identificação do inspetor, refletidos na visão da operação". O anexo não fixa o status resultante. | Não procede. Critério atendido. |
| 4 | Previsão de chegada só por SMS/e-mail | 01.10 e 01.12 pedem alerta/aviso. Seção 6 exclui "Aplicativo ou portal do inquilino com perfil, chamados e acompanhamento do serviço". | Não procede. Expressamente fora. |
| 5 | Rota do dia sem tela no web; Challenges só no app | Telas da Entrega 01: "Roteiro do Dia (aplicativo do inspetor)"; da 03: "Desafios, Meus Resultados, Meu Índice e Recompensas (aplicativo)". 01.7/01.A6 pedem a folha em PDF e Excel, sem tela web. | Não procede. |
| 6 | Arquivos do imóvel só online | Entrega 00, não incluso: "Operação sem conexão… não havendo fila de sincronização posterior". | Não procede. Expressamente fora. |
| 7 | Itens do design v3 não construídos | Não incluso: "Qualquer funcionalidade de vistoria, inspeção ou laudo dentro do aplicativo". Os demais não constam do anexo. | Não procede. |
| 8 | Credenciais do app de laudo recolhidas | Não consta do anexo. | Não procede. |

### Decisões (Pedro, 23/11/2026)

1. A seção C da nota é reescrita: nenhuma diferença frente ao escopo; o PDF é guia visual.
2. **Roteiro de homologação pelos critérios de aceite** entra como entregável (item C-1 abaixo).

### C-1 — Roteiro de homologação pelos critérios de aceite

A cláusula 8.1 do anexo exige que cada entrega vá à homologação "acompanhada do roteiro de verificação dos critérios objetivos de aceite". O anexo tem 30 critérios (00.A1–00.A5, 01.A1–01.A7, 03.A1–03.A5, D.A1–D.A3, E.A1–E.A2, C.A1–C.A5). Não existe esse roteiro nos documentos da fase.

O que fazer (documento, sem código; depois do teste B2 + G):

- Criar `fase2-etapa1/roteiro-homologacao.md`: uma seção por entrega, uma linha por critério, com o texto literal do critério, o passo a passo para demonstrá-lo (perfil, tela com o nome como aparece na interface, ação, resultado esperado) e o resultado obtido em DEV.
- Fonte dos passos e dos nomes de tela: o relatório do teste (`smoke-dev-<data>.md`). Critério que o teste não cobriu é testado antes de entrar.
- Onde a palavra do anexo difere do rótulo de tela, dizer a correspondência. Caso conhecido: **"cancelamento" (00.7, 00.A3) = "Can't do this job"**.
- Idioma e formato para o cliente: decidir com o Pedro (o relatório do cliente em espera previa inglês e Claude Docs).
- Critério não atendido em DEV vira defeito, levado ao Pedro.

### Documentação (entra no PR de docs)

- `fase2-etapa1/VALIDACAO-consolidada.md`, "Eixo 2 — PWA × Cliente": deixar explícito que a tabela "Cliente pediu × Nós decidimos" compara com o PDF de design, que não é escopo.

### Decisão 3 (Pedro, 23/11/2026) — rotas de API da operação sobre o plano do dia: **remover**

"O que temos que oferecer é exportar o plano do dia para o inspetor na tela Today."

### C-2 — Remover as rotas AM/OP do plano do dia (PR de backend, com worktree)

Nenhuma tela do web usa estas rotas e o anexo não as pede (01.7/01.A6 pedem a folha do dia em PDF e Excel; as telas da Entrega 01 não incluem tela web de roteiro).

Remover:

- `GET /v1/day-plans/:inspectorId/:date`
- `POST /v1/day-plans/:inspectorId/:date/recalculate`
- `GET /v1/day-plans/:inspectorId/:date/sheet`

**Manter** (têm tela no web): `POST /v1/day-plans/preview` (Platform Settings ▸ Route planning) e `GET /v1/day-plans/eta-accuracy` (Live Day).
**Não tocar** nas rotas do inspetor (`/v1/inspector/day-plans/*`), incluindo a folha `…/:date/sheet`, que é o que o escopo pede.

O que essas rotas compartilham com funcionalidades reais (conferido no código em 23/11 — é o limite da remoção):

| Peça | Quem mais usa | O que fazer |
|---|---|---|
| `recalculateDayPlanUseCase` | A rota do **inspetor** `POST /v1/inspector/day-plans/:date/recalculate` | **Manter o caso de uso.** Sai só a rota AM/OP e o ramo de permissão do operador, se houver. |
| `getDayPlanSheetUseCase` | A rota do **inspetor** `GET /v1/inspector/day-plans/:date/sheet` (a folha que o escopo pede) | **Manter o caso de uso.** Sai só a rota AM/OP e o ramo "operador" dentro dele. |
| `getDayPlanForOperatorUseCase` | Só a rota AM/OP de leitura e o ramo "operador" da folha | Sai junto, depois de removido o ramo acima. |
| Live Day (web) | Chama só `/v1/dashboard/live-day`, `/v1/dashboard/locked-time` e `/v1/day-plans/eta-accuracy` | Não é afetado. No backend ele usa apenas funções de domínio do plano do dia (impressão digital, classificação de paradas), não estas rotas. |
| Platform Settings ▸ Route planning (web) | `POST /v1/day-plans/preview` | Não é afetado; a rota fica. |

Passos:

- **Regra:** nada que uma funcionalidade real use pode sair. Antes de apagar qualquer arquivo, repetir a conferência acima (`git grep` pelo nome de cada caso de uso em `apps/backend/src`, incluindo `container.ts`, workers e assinantes de eventos). Se aparecer um consumidor que não está na tabela, **parar e levar ao Pedro**.
- Remover as três rotas AM/OP, o `getDayPlanForOperatorUseCase`, o ramo "operador" da folha, a entrada correspondente na matriz de permissões e os testes dessas partes (incluindo os de limite de requisições e o caso "AM/OP sem limite de data" da folha).
- Os testes das rotas do inspetor (ler, reordenar, recalcular, origem, folha) têm de continuar passando sem alteração de comportamento.
- A auditoria `day_plan.exported` continua para o inspetor.
- `pnpm generate:api` e commitar `openapi.json` + `api-types.ts`.
- Atualizar `apps/backend/CLAUDE.md` e a linha do F04-2 em "Active Technologies" do `CLAUDE.md` da raiz, que hoje lista "AM/OP APIs (`/v1/day-plans/*`: get/recalculate/sheet/preview/eta-accuracy)".
- Verificação: typecheck, lint e testes do backend e do shared; lint do web e do PWA (mudança em `packages/shared` exige); suíte de banco real se algum teste dela cobrir essas rotas. `git grep` pelas três rotas volta vazio fora do histórico de specs.

### C-3 — Exportar o plano do dia no app do inspetor: fica como está

Decisão (Pedro, 23/11/2026): **manter**. O menu "Download" (PDF / planilha) continua na tela **Today's route** (`/today/route`), a um toque da tela **Today**. Nenhuma mudança de tela. O roteiro de homologação (C-1) descreve o caminho para o critério 01.A6.

---

## D — Preparar os ambientes (staging = homologação; depois produção)

**Natureza:** operação por ambiente, sem código. Configuração de ambiente não viaja com o merge e não aparece no CI.

### O que se descobriu

- A Fase 2 **já está em staging** desde 18/11 (staging 3 commits atrás do `develop`). Produção está 284 commits atrás, sem a Fase 2.
- O anexo exige que o aceite seja demonstrado "em ambiente de homologação". Homologação = staging.
- Ninguém conferiu ainda se as configurações abaixo existem em staging.

| # | Pendência | DEV | Staging | Produção |
|---|---|---|---|---|
| 1 | Chaves de push (VAPID) por ambiente | Feito em 24/11 (par exclusivo de DEV) | A conferir | Pendente |
| 2 | Push em aparelho real (critérios 00.A1, 00.A2) | Só navegador | Pendente | Pendente |
| 3 | Roteamento Mapbox real (não simulado) | Ativo (padrão `mapbox`) | A conferir | Pendente |
| 4 | Bucket `inspection-assets` aceitar PDF, Word e Excel (critério C.2/C.A5) | A conferir (teste F10) | A conferir | Pendente |
| 5 | Regeocodificação do legado (X02-2, fora do contrato) | A conferir | A conferir | Pendente |

O "smoke de endereço-base/adoção nos 4 perfis em DEV" da nota original está coberto pelo teste B2 + G.

Atenção ao item 4: a validação de 12/11 registra o bucket como "só imagens, 30 MB". Enquanto não for ampliado em cada ambiente, o envio de PDF/documento falha no armazenamento mesmo com o código certo, e o critério C.2 não se demonstra.

### Decisões (Pedro, 23/11/2026)

1. **Homologação é staging.**
2. **Staging: o Pedro opera, com o agente assistindo.** O agente prepara cada passo (comando exato, o que faz, saída esperada, como desfazer) e confere o resultado; quem executa é o Pedro. O agente não altera staging por conta própria.
3. **Produção: o agente só prepara** a lista e os comandos; o Pedro executa. Só depois do aceite em staging.
4. **Regeocodificação: primeiro só a simulação** (dry-run) em cada ambiente; a estimativa de custo vai ao Pedro para aprovação antes de qualquer execução real.
5. **Aparelho real: o Pedro testa primeiro, depois o cliente.**

### O que fazer

**D-1 — Conferir staging (leitura).** Para cada item da tabela, o agente prepara o comando de leitura e o Pedro roda: nomes dos segredos de push presentes no app Fly de staging (só nomes, nunca valores); `push-config` devolvendo a chave; provedor de roteamento ativo; tipos e tamanho aceitos pelo bucket; contagem de endereços pendentes pela simulação da regeocodificação. Resultado: a coluna "Staging" da tabela preenchida.

**D-2 — Corrigir o que faltar em staging.** Um passo por vez, na ordem: push → bucket → regeocodificação.
- Push: par VAPID **exclusivo de staging** (nunca reutilizar o de DEV), `VAPID_SUBJECT` com o endereço de staging.
- Bucket: ampliar tipos aceitos (imagens + PDF + Word + Excel, conforme a configuração "Property files") e o tamanho por arquivo. Registrar o valor anterior.
- Regeocodificação: seguir `docs/runbooks/regeocode-permanent.md`. Simulação → estimativa de custo (US$ 0,005 por endereço, reconfirmar o preço) → aprovação do Pedro → lote de 20 → conferir pinos → execução completa → nova simulação com zero pendentes.

**D-3 — Aparelho real.** Roteiro curto para o Pedro e depois para o cliente, em iPhone (iOS 16.4 ou superior) e Android: instalar o app na tela de início, permitir notificações, receber o aviso de publicação do dia com o app fechado, tocar na notificação e cair na tela certa; sem push permitido, receber a mesma comunicação por SMS. Entra no roteiro de homologação (C-1) sob 00.A1 e 00.A2.

**D-4 — Produção.** Depois do aceite: a mesma lista, preparada pelo agente como documento de execução (comandos, ordem, janela fora do horário comercial de Sydney, como desfazer). O Pedro executa.

### Limites

- O agente não lê valores de segredos, não altera staging nem produção, e não dispara a regeocodificação real sem a aprovação de custo.
- Defeito encontrado em staging é registrado e levado ao Pedro; não se corrige direto no ambiente.

### Pronto quando

- Tabela preenchida para staging, com os cinco itens resolvidos ou com decisão registrada.
- Push demonstrado em aparelho real pelo Pedro.
- Documento de execução de produção pronto, aguardando o aceite.

---

## E — Achados laterais

**Natureza:** nenhum destes itens está no anexo. São achados da validação, quase todos anteriores à Fase 2.

### O que se confirmou (código + teste em DEV de 24/11)

| Achado | Procede? | Fato |
|---|---|---|
| "Session management is not available yet." | Não | É a mensagem de reserva quando o servidor não responde. A tela mostra "Active Sessions" funcionando no web e no app. Nada a fazer. |
| "Consent Lookup" sem item de menu | Sim | Tela de abril/2026, restrita a AM/OP, só abre pelo endereço. A busca dá erro para AM e para OP (defeito D-14 do teste). |
| "Properties" no menu do Inspetor (web) | Sim | O item aparece para todos os perfis; a rota bloqueia o Inspetor. |
| "Dashboard" do Inspetor (web) | Sim (achado do teste) | Mostra "Couldn't load the dashboard. Please try again." |

### Decisões (Pedro, 24/11/2026)

1. **Menu do Inspetor no web:** esconder os itens que ele não pode usar ("Properties" e "Dashboard").
2. **"Record opt-out": remover.** Não está no anexo.
3. **"Consent Lookup": corrigir** a busca para AM/OP e dar item de menu.
4. **Estacionamento, itens destacados:** o 12 (coordenada do inspetor na auditoria) entra no plano junto com o defeito D-01; o 3 (`priorityOfferHours`) entra junto com B1; o 1 (ajuste manual não chega à fatura) e o 16 (aceite não revalida a região) viram tarefas separadas, fora desta entrega.
5. **Os outros 16 itens** ficam no estacionamento.

### O que fazer

**E-1 — Menu do Inspetor no web (PR web) — SUBSTITUÍDO pelo E-5; não executar.** Em `apps/web/src/components/shell/Sidebar.tsx`, restringir "Properties" e "Dashboard" aos perfis que a rota aceita (AM, OP, CL_ADMIN, CL_USER), como já é feito com "Marketplace". Definir para onde o Inspetor cai ao entrar no web (hoje `/` redireciona para `/dashboard`, que não carrega para ele): redirecionar para `/marketplace`. Teste: Inspetor vê só "Marketplace"; os outros perfis não mudam.

**E-2 — Remover "Record opt-out" (PR backend + shared + web).** Sai: botão e `ConsentOptOutModal` na tela "Consent Lookup"; rota `POST /v1/notifications/consents/opt-out`; `RecordConsentOptOutUseCase`; `recordConsentOptOutSchema`; testes dessas partes; `pnpm generate:api`. **Fica:** a leitura de consentimento no envio (incluindo a comparação de e-mail sem diferenciar maiúsculas, do F06-2) e as rotas antigas de consulta e de override (Feature 018), que não são desta fase.
- **Consequência registrada:** os avisos de chegada ao inquilino não têm link de descadastro (confirmado no teste). Sem este botão, a operação só consegue parar os avisos de uma pessoa (a) desligando os avisos da imobiliária inteira, ou (b) pelo override antigo, que só funciona se já existir um registro de consentimento daquela pessoa. O comentário do próprio código diz que este era "o único mecanismo de parada em conformidade". **Remoção confirmada pelo Pedro em 24/11, ciente da consequência** (não está no anexo).

**E-3 — Corrigir "Consent Lookup" (PR web, talvez backend).** A busca falha com "tenantId is required when querying as AM" / "Operator must have a tenant context": a tela não oferece seletor de imobiliária. Acrescentar o seletor (obrigatório para AM/OP) e enviar o `tenantId`; acrescentar o item de menu para AM/OP. Mudança de tela: mostrar ao Pedro como fica antes de executar.

**E-4 — Itens do estacionamento.**
- Item 12 → tratado em conjunto com o defeito D-01 (decisão sobre o defeito ainda pendente).
- Item 3 → `priorityOfferHours` e `inspectorOfferRadiusKm` (decisão do Pedro em 24/11: "adapta, não quero perda nem reuso ruim"). Leitura do coordenador: os dois saem, desde que nada se perca e nada os reaproveite mal. Fato: os dois campos só existem em `packages/shared/src/schemas/tenant.ts:53-54` (com padrão 24 e 2) e em dois testes; nenhuma tela os mostra e nenhum código do backend, web ou app os lê. Passos, nesta ordem:
  1. Contar, em cada ambiente, quantas imobiliárias têm um desses dois valores gravados em `settings_json` (leitura; em staging e produção o Pedro roda). Se houver valor diferente do padrão, **parar e levar ao Pedro**: alguém configurou algo esperando um efeito.
  2. Confirmar que ler uma imobiliária que ainda tenha essas chaves gravadas continua funcionando depois da remoção (teste com `settings_json` contendo as duas chaves). Nenhuma migração de dados: as chaves gravadas ficam inertes.
  3. Remover os dois campos do esquema, os testes e regenerar `api-types`.
  4. Não reaproveitar os nomes: a janela do acesso antecipado é `inspectorProgram.earlyAccess` (Platform settings) e o alcance das ofertas vem das regiões do inspetor. Nenhum dos dois passa a ler os campos antigos.
  Isto **muda o alcance de B1**: deixa de ser só PWA e passa a tocar `packages/shared` e o `api-types`.
- Itens 1 e 16 → abrir uma tarefa para cada, fora desta entrega.

---

### E-5 — Inspetor sem acesso ao web

O escopo não dá ao inspetor acesso ao web nem a propriedades. Fase 1 (`Escopo Completo Properfy - CLIENTE.md` § 2.2): quatro plataformas, e o inspetor só tem o "App Inspetor — PWA Mobile". Fase 2 (anexo, entrega 00): "aplicativo web instalável (PWA) do inspetor, entregue na Fase 1"; o web aparece só como painel da operação.

Leitura em produção em 24/11 (autorizada pelo Pedro; só contagens): 3 inspetores ativos; 30 sessões de 13/10 a 19/11 — 20 de celular (1 inspetor), 10 de computador (3 inspetores); 2 inspetores só têm sessão de computador. A sessão não registra se o acesso foi pelo web ou pelo app aberto no computador.

**Decisão (Pedro, 24/11/2026):** remover o acesso do inspetor ao web. Se ele tentar entrar, aparece a mensagem de falta de acesso e um modal com um botão para abrir o app.

**Substitui o E-1:** sem acesso ao web, não há menu do inspetor para ajustar.

O que fazer (PR web; o backend não muda, porque a mesma API atende o app):

- **Portão de design:** antes de executar, mostrar ao Pedro como ficam a mensagem e o modal (texto em inglês, botão, o que acontece ao fechar).
- **Entrada:** credenciais válidas de um inspetor no web não abrem sessão no web. A tela mostra a mensagem de falta de acesso e o modal com o botão que leva ao app. Nenhum token do inspetor fica guardado no web. Vale também para quem já está com sessão aberta no web quando a mudança entrar.
- **Endereço do app:** o web hoje não conhece o endereço do app. Criar a variável de ambiente (uma por ambiente: DEV, staging, produção) e incluir na lista da seção D.
- **Sai junto:** a rota `/marketplace` do web, o item de menu e a pasta `apps/web/src/features/marketplace/`, depois de confirmar por `git grep` que só o roteador a usa. O marketplace do escopo é o do app e não é tocado.
- **Conferir antes de mexer (e parar se algum cair no web):** para onde apontam os links de redefinição de senha, de convite e de 2FA do inspetor. Se algum levar o inspetor ao web, levar ao Pedro com a proposta de ajuste.
- **Testes:** inspetor não entra e vê mensagem + modal; AM, OP, CL_ADMIN e CL_USER entram como antes; E2E do web sem cenários de inspetor logado.
- **Aviso operacional:** antes de produção, o Pedro avisa os 3 inspetores (2 só aparecem em computador) para usarem o app.

---

## F — Documentação desatualizada

**Decisão (Pedro, 24/11/2026):** atualizar a documentação.

Estado de cada item da nota, conferido em 24/11:

| Item | Estado |
|---|---|
| `decisoes.md` — Q7 e Q12 superadas pelo cliente em 30/10 | Já corrigido na cópia local (sem commit) |
| `decisoes.md` — decisão final da Mapbox (L-F04-03, Plano B) | Já está no arquivo |
| Specs 051/052/054 descrevem o plano antigo de roteamento | Já têm o aviso "SUPERSEDIDO (parcial)" no topo, em `develop` |
| `develop` local atrás do remoto | Resolvido (atualizado em 23/11) |
| `decisoes.md` — Q2, Q4 e Q6 ainda "PENDENTE" | Corrigido em 24/11: passaram a "ASSUMIDA", com o que o anexo assinado diz e o que foi entregue |

Falta apenas **levar ao repositório** o que está só na cópia local: 8 arquivos de `fase2-etapa1/` (F08, F10, README, cronograma, decisões, paralelização, tarefas F08 e F10) e `.eslintrc.json` (acrescenta `TimeInput.tsx` a uma exceção de lint já existente para `DateInput.tsx`; origem não esclarecida — não incluir no PR de documentação sem decisão do Pedro).

**Fila offline de início/fim (Q2):** o anexo diz "não havendo fila de sincronização posterior", mas a fila vem da Fase 1. Decisão do Pedro (24/11/2026): **mantém**. Não remover.

Não vão para o repositório: o anexo (`fase2-etapa1/arquivo/*.pages` e o texto extraído), as capturas (`output/`) e os rascunhos soltos na raiz.

---

## Ainda em discussão (não executar)

- Triagem dos 14 defeitos e dos itens "a mais" do teste em DEV (`fase2-etapa1/smoke-dev-2026-11-23.md`).
- Commit/PR da documentação local (seção F).
