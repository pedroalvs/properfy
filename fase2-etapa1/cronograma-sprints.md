# Properfy · Fase 2 · Etapa 1 "O campo equipado" — Cronograma de entregas

**Período:** quarta-feira, 04/11/2026 → terça-feira, 01/12/2026
**Formato:** 4 sprints semanais (quarta → terça). Ao fim de cada sprint, as entregas ficam disponíveis no ambiente de **staging** para validação.
**Referência:** Anexo I, entregas 00, 01, 03, D, E e C. Os códigos entre parênteses (ex.: 00.4) remetem aos itens do contrato.

**Onde:** **Web** = portal da operação/agência · **App** = app do inspetor · **Sistema** = processos automáticos e integrações (sem tela).

---

## Visão geral

| Sprint | Período | Tema | Itens do contrato |
|---|---|---|---|
| **1** | 04/11 → 10/11 | Fundações do inspetor e do mapa | E.1, E.2, 00.3, 00.4, 00.10 |
| **2** | 11/11 → 17/11 | Comunicação com o inspetor e eventos de campo | 00.6, 00.7, 00.8, 00.9, 03.1, 03.2, 03.3, 03.16, D.1–D.4, 01.14 |
| **3** | 18/11 → 24/11 | Roteiro do dia e índice de confiabilidade | 00.1, 00.5, 01.1–01.7, 03.4, 03.5, 03.11, 03.12 |
| **4** | 25/11 → 01/12 | Operação ao vivo, avisos ao inquilino e programa do inspetor | 00.2, 01.8–01.13, 03.6–03.10, 03.13–03.15, 03.17, C.1–C.9 |

---

## Sprint 1 · 04/11 → 10/11 — Fundações do inspetor e do mapa

**Objetivo:** preparar a base que o resto da etapa usa: o endereço de partida de cada inspetor, a visibilidade sobre o uso do app, a janela de período do mapa e a navegação do portal.

### 1.1 Janela de período do mapa (E.1, E.2)

| # | Tarefa | Onde |
|---|---|---|
| 1.1.1 | O mapa da operação passa a abrir com o período padrão "hoje + N dias", em vez de carregar tudo | Web |
| 1.1.2 | Indicador do período ativo visível acima do mapa ("Today + 14 days"), mesmo com o painel de filtros fechado | Web |
| 1.1.3 | Operação (Admin/Operador) pode remover a janela com um clique e ver todo o período; "Limpar filtros" volta para a janela padrão, não para vazio | Web |
| 1.1.4 | Para os usuários da agência, a janela é sempre aplicada e o período escolhido fica limitado a ela, com texto de ajuda | Web |
| 1.1.5 | Novo campo "Map window (days)" no cadastro da agência (1 a 90 dias, padrão 14), editável só pela operação, com registro de auditoria | Web |
| 1.1.6 | Testes automatizados e validação com os 4 perfis de acesso | Qualidade |

### 1.2 Endereço-base do inspetor (00.3, 00.4)

| # | Tarefa | Onde |
|---|---|---|
| 1.2.1 | Endereço-base obrigatório no cadastro do inspetor, com autocompletar de endereço | Web |
| 1.2.2 | Seção "Base address" no perfil do app, para o inspetor manter o próprio endereço | App |
| 1.2.3 | Conversão automática do endereço em coordenadas ao salvar; o endereço-base é o ponto de partida do roteiro diário | Sistema |
| 1.2.4 | Aproveitamento dos endereços já cadastrados: os inspetores existentes têm o endereço convertido automaticamente | Sistema |
| 1.2.5 | Aviso fixo "Add your base address" na tela inicial e no perfil do app enquanto o endereço estiver faltando | App |
| 1.2.6 | Filtro e indicador "No base address" na lista de inspetores | Web |
| 1.2.7 | Localização do inspetor protegida: coordenadas nunca exibidas para os usuários da agência | Sistema |
| 1.2.8 | Toda alteração de endereço registrada na auditoria | Sistema |

### 1.3 Adoção do app (00.10)

| # | Tarefa | Onde |
|---|---|---|
| 1.3.1 | O app informa, ao ser aberto, se está instalado na tela inicial, se as notificações estão ativas e qual a versão | App |
| 1.3.2 | Registro da data de instalação, último acesso, status do push e versão de cada inspetor | Sistema |
| 1.3.3 | Colunas "App", "Push" e "Last seen" na lista de inspetores | Web |
| 1.3.4 | Seção "App adoption" no detalhe do inspetor | Web |
| 1.3.5 | Validação em iOS e Android | Qualidade |

### 1.4 Melhorias de plataforma que sustentam a etapa

| # | Tarefa | Onde |
|---|---|---|
| 1.4.1 | Menu lateral com o grupo "Dashboard", reunindo Overview, Analytics, Workload e as novas telas desta etapa | Web |
| 1.4.2 | Botão "Back" no canto superior esquerdo de todas as sub telas, voltando para a tela anterior (ou para a tela pai, quando aberta por link) | Web |
| 1.4.3 | Endereços de imóveis e filiais convertidos em coordenadas no modo permanente, conforme os termos de uso da Mapbox | Sistema |
| 1.4.4 | Correção: editar um imóvel não marca mais a localização como "manual" quando o usuário não mexeu nela | Web / Sistema |
| 1.4.5 | Nova área "Platform settings" para os parâmetros configuráveis desta etapa (raio, pesos, limites de alerta) | Web |
| 1.4.6 | Recuperação dos testes automatizados de ponta a ponta do app do inspetor (iOS e Android simulados) | Qualidade |

---

## Sprint 2 · 11/11 → 17/11 — Comunicação com o inspetor e eventos de campo

**Objetivo:** a operação passa a falar com os inspetores por avisos e notificações, e o inspetor passa a registrar no app o que acontece em campo.

### 2.1 Avisos da operação para os inspetores (00.6)

| # | Tarefa | Onde |
|---|---|---|
| 2.1.1 | Nova tela "Inspector notices" com a lista de avisos publicados | Web |
| 2.1.2 | Botão "New notice": título, texto, público (todos, selecionados ou por região) e marcação de aviso crítico | Web |
| 2.1.3 | Detalhe do aviso com confirmação de leitura ("lido por X de Y", com os nomes) | Web |
| 2.1.4 | Arquivar avisos antigos | Web |
| 2.1.5 | Caixa "Announcements" no app, com contador de não lidos; o aviso é marcado como lido ao ser aberto | App |
| 2.1.6 | Registro de publicação e arquivamento na auditoria | Sistema |

### 2.2 Notificações push com SMS de reserva (00.9)

| # | Tarefa | Onde |
|---|---|---|
| 2.2.1 | Notificações push no app instalado (iOS 16.4+ e Android) | App |
| 2.2.2 | Controle "Push notifications" nas configurações do app, por dispositivo | App |
| 2.2.3 | Tocar na notificação abre diretamente o aviso correspondente | App |
| 2.2.4 | Aviso crítico: envia push para quem tem notificação ativa e SMS automático para quem não tem ou cujo push falhou | Sistema |
| 2.2.5 | Limpeza automática de dispositivos que deixaram de receber push (desinstalação, permissão retirada, inspetor desativado) | Sistema |
| 2.2.6 | Novo modelo de SMS de aviso ao inspetor | Sistema |

### 2.3 Check in / Check out e "Não consigo fazer" (00.7)

| # | Tarefa | Onde |
|---|---|---|
| 2.3.1 | Botões "Check in" e "Check out" direto no card da agenda, sem precisar abrir o detalhe; continuam funcionando sem internet | App |
| 2.3.2 | Botão "Can't do this job" com motivos (ninguém atendeu, chave não funcionou, inquilino recusou, local inseguro, problema no imóvel, não consigo comparecer) e nota | App |
| 2.3.3 | Ao confirmar, o serviço é liberado automaticamente: sai do grupo e da agenda do inspetor, com registro de quem e por quê | Sistema |
| 2.3.4 | Alerta para a operação por e-mail e no painel quando o inspetor não consegue fazer um serviço | Sistema |
| 2.3.5 | Card "Inspector couldn't complete" (motivo, nota, inspetor, data/hora) no detalhe do appointment e no modal do mapa, exibido só quando existe | Web |

### 2.4 "Vou atrasar" (00.8, 03.3)

| # | Tarefa | Onde |
|---|---|---|
| 2.4.1 | Botão "Running late" no app, com motivo (trânsito, serviço anterior demorou, pessoal, outro) e minutos estimados | App |
| 2.4.2 | Registro do aviso de atraso, que alimenta o painel Live Day, os avisos ao inquilino e o índice de confiabilidade (sprints 3 e 4) | Sistema |
| 2.4.3 | Aviso de atraso visível no histórico do appointment | Web |

### 2.5 Precisão do GPS e local da vistoria (03.1, 03.2)

| # | Tarefa | Onde |
|---|---|---|
| 2.5.1 | Registro da precisão do GPS e do horário do aparelho no início e no fim da vistoria | App / Sistema |
| 2.5.2 | Cálculo da distância até o imóvel também no fim da vistoria (hoje só no início) | Sistema |
| 2.5.3 | Raio de tolerância e modo (só sinalizar ou bloquear) configuráveis em "Platform settings" | Web |
| 2.5.4 | Marcação automática de vistoria fora do raio ou fora da janela de horário | Sistema |
| 2.5.5 | Bloco "Execution" no detalhe do appointment: início/fim, distância, precisão, sinalizações e eventos de campo | Web |
| 2.5.6 | Novos rótulos no histórico (timeline) do appointment para os eventos de campo | Web |

### 2.6 Lembrete de conclusão ao inspetor (03.16)

| # | Tarefa | Onde |
|---|---|---|
| 2.6.1 | Se a vistoria passou do fim da janela sem ser concluída, o inspetor recebe um lembrete (push ou SMS), uma única vez por serviço | Sistema |
| 2.6.2 | Tempo de tolerância configurável em "Platform settings" | Web |

### 2.7 Densidade de atividade no mapa (D.1–D.4)

| # | Tarefa | Onde |
|---|---|---|
| 2.7.1 | Camada "Activity density" no mapa, com liga/desliga | Web |
| 2.7.2 | Seletor de período da camada (7, 30 ou 90 dias; período livre só para a operação) | Web |
| 2.7.3 | A camada respeita os filtros de agência e de inspetor do mapa | Web |
| 2.7.4 | Dados agregados por área: nenhum ponto individual do inspetor é exposto às agências | Sistema |

### 2.8 Preparação do roteiro (01.14)

| # | Tarefa | Onde |
|---|---|---|
| 2.8.1 | Campo "Estimated duration (min)" obrigatório no cadastro do tipo de serviço, usado como tempo de cada parada no roteiro | Web |
| 2.8.2 | Preenchimento automático da duração dos tipos já cadastrados (média real medida ou 45 min) | Sistema |
| 2.8.3 | Pesos do cálculo da rota configuráveis em "Platform settings", com pré-visualização do roteiro de um inspetor num dia | Web |
| 2.8.4 | Motor de otimização do roteiro: ordem das paradas a partir do endereço-base, respeitando as janelas de horário e a duração de cada serviço | Sistema |
| 2.8.5 | Integração com a Mapbox para tempo de deslocamento com trânsito e traçado real das rotas | Sistema |

---

## Sprint 3 · 18/11 → 24/11 — Roteiro do dia e índice de confiabilidade

**Objetivo:** o inspetor recebe o roteiro pronto na véspera e trabalha a partir dele; a operação passa a medir a confiabilidade de cada inspetor.

### 3.1 Roteiro do dia (01.1, 01.2)

| # | Tarefa | Onde |
|---|---|---|
| 3.1.1 | Geração automática do roteiro de cada inspetor para o dia seguinte, com ordem otimizada e horário previsto por parada | Sistema |
| 3.1.2 | Publicação diária às 19:30, depois do corte de confirmações do inquilino | Sistema |
| 3.1.3 | Push "Seu roteiro de amanhã está pronto" para o inspetor | Sistema |
| 3.1.4 | Paradas já confirmadas com janela mais cedo sempre entram primeiro | Sistema |
| 3.1.5 | Mudanças no dia (nova atribuição, reagendamento, cancelamento) atualizam o roteiro | Sistema |
| 3.1.6 | Troca do ponto de partida só para aquele dia ("Starting from: …"), sem mudar o endereço-base do perfil | App |
| 3.1.7 | Inspetor sem endereço-base: o roteiro começa pela primeira janela, com aviso | App |

### 3.2 Tela "Today" no app (00.1, 00.5)

| # | Tarefa | Onde |
|---|---|---|
| 3.2.1 | Nova tela inicial "Today": saudação, "X de N feitas · término previsto ~hh:mm" | App |
| 3.2.2 | Card "Próxima inspeção" com endereço, janela, horário previsto, distância e os botões "Navigate" e "Check in" | App |
| 3.2.3 | Lista "Coming up" com as próximas paradas e card de avisos não lidos | App |
| 3.2.4 | Nova barra de navegação: Today / Schedule / Offers / More (Earnings e Profile passam para More) | App |
| 3.2.5 | Roteiro do dia disponível sem internet | App |

### 3.3 Mapa e reordenação do roteiro (01.3, 01.4)

| # | Tarefa | Onde |
|---|---|---|
| 3.3.1 | Aba de mapa no roteiro: paradas numeradas e traçado real das ruas | App |
| 3.3.2 | Reordenar paradas arrastando ou com setas de subir/descer | App |
| 3.3.3 | Recálculo imediato ao reordenar, mostrando a diferença ("+12 min vs. suggested") | App |
| 3.3.4 | Aviso quando a nova ordem faz uma parada chegar fora da janela; o inspetor decide e salva | App |
| 3.3.5 | Opção de voltar à ordem sugerida | App |

### 3.4 Card da parada, navegação e folha do dia (01.5, 01.6, 01.7)

| # | Tarefa | Onde |
|---|---|---|
| 3.4.1 | Card da parada com endereço, janela, horário previsto, chave/local de encontro e botão de ligar para o contato principal | App |
| 3.4.2 | Botão "Navigate" abre o Apple Maps no iPhone e o Google Maps nos demais | App |
| 3.4.3 | Folha do dia em PDF e XLSX, para o inspetor (o próprio dia) e para a operação (qualquer inspetor) | App / Web |
| 3.4.4 | Medição da precisão do horário previsto (previsto × real), exibida para a operação no Sprint 4 | Sistema |

### 3.5 Índice de confiabilidade (03.4, 03.5)

| # | Tarefa | Onde |
|---|---|---|
| 3.5.1 | Cálculo diário do índice de cada inspetor sobre os últimos 30 dias | Sistema |
| 3.5.2 | 8 métricas: pontualidade, vistoria dentro do raio do imóvel, conclusão sem pendência, nota de satisfação, atrasos avisados com antecedência, desistências por motivo do inspetor, volume de inspeções atendidas e serviços concluídos que precisaram ser revertidos | Sistema |
| 3.5.3 | Normalização pela duração do tipo de serviço e pelo deslocamento, para comparar inspetores com perfis diferentes | Sistema |
| 3.5.4 | Volume mínimo de 10 serviços na janela; abaixo disso, "Not enough data" | Sistema |
| 3.5.5 | Pesos das métricas configuráveis em "Platform settings", com recálculo imediato ao salvar e auditoria | Web |
| 3.5.6 | Histórico diário guardado para níveis e metas (Sprint 4) | Sistema |

### 3.6 Tela "Inspector performance" (03.11, 03.12)

| # | Tarefa | Onde |
|---|---|---|
| 3.6.1 | Nova tela no grupo Dashboard: ranking atual (posição, nome, índice, volume) | Web |
| 3.6.2 | Bloco separado para inspetores com pouco volume | Web |
| 3.6.3 | Painel lateral com as 8 métricas de cada inspetor e a evolução em 30 dias | Web |
| 3.6.4 | Acesso restrito à operação (Admin/Operador) | Sistema |

---

## Sprint 4 · 25/11 → 01/12 — Operação ao vivo, inquilino e programa do inspetor

**Objetivo:** a operação acompanha o dia em tempo real, o inquilino é avisado do horário previsto, e o inspetor passa a ter metas, níveis e prêmios.

### 4.1 Tour guiado do app (00.2)

| # | Tarefa | Onde |
|---|---|---|
| 4.1.1 | Tour no primeiro acesso: tela escurecida, destaque em cada função e texto explicativo, com "Back", "Next" e "Skip" | App |
| 4.1.2 | Passo final com instruções para instalar o app na tela inicial (iOS e Android) | App |
| 4.1.3 | Depois de concluído ou pulado, o tour não aparece mais, em nenhum dispositivo | App |
| 4.1.4 | Opção "Show app tour" nas configurações para rever | App |
| 4.1.5 | Teste automatizado do tour de ponta a ponta | Qualidade |

### 4.2 Tela "Live Day" (01.8, 01.9 + rotas em tempo real)

| # | Tarefa | Onde |
|---|---|---|
| 4.2.1 | Nova tela no grupo Dashboard com todos os inspetores do dia no mapa, com cor por situação (não iniciado, no imóvel, em trânsito, dia concluído) | Web |
| 4.2.2 | Lista lateral com progresso (feitas × restantes) e atraso acumulado de cada inspetor | Web |
| 4.2.3 | Clicar num inspetor mostra a rota e as paradas do dia (feitas, atual e restantes), com link para cada appointment | Web |
| 4.2.4 | Botão "Show all routes": rotas de todos os inspetores ao mesmo tempo, cada uma com uma cor própria | Web |
| 4.2.5 | Atualização automática a cada 30 segundos e seletor de data | Web |
| 4.2.6 | Indicador "Route ETA accuracy" (precisão do horário previsto nos últimos 30 dias) | Web |

### 4.3 Alertas da operação (01.11)

| # | Tarefa | Onde |
|---|---|---|
| 4.3.1 | Filtro "Needs attention": atraso acima do limite, não iniciado no horário, aviso de atraso, "Não consigo fazer", fora do raio e lembrete de conclusão disparado | Web |
| 4.3.2 | Ordenação por gravidade | Web |
| 4.3.3 | Limites de alerta padrão em "Platform settings" e ajuste individual por inspetor | Web |

### 4.4 "Locked time" (01.13)

| # | Tarefa | Onde |
|---|---|---|
| 4.4.1 | Seção "Locked time" no Live Day: % da agenda confirmada pelos inquilinos nos próximos 14 dias (período ajustável) | Web |
| 4.4.2 | Quebra por agência e por região | Web |

### 4.5 Avisos de horário ao inquilino (01.10, 01.12, 01.12-B)

| # | Tarefa | Onde |
|---|---|---|
| 4.5.1 | Aviso pela manhã (enviado até 09:00) com a faixa de horário prevista (±30 min, dentro da janela) | Sistema |
| 4.5.2 | "O inspetor está a caminho", enviado quando o inspetor conclui a parada anterior | Sistema |
| 4.5.3 | Aviso de atraso com nova previsão, quando o horário projetado passa do fim da janela; no máximo 1 por parada por dia | Sistema |
| 4.5.4 | Previsão recalculada a cada conclusão, a cada aviso de atraso e a cada 30 minutos | Sistema |
| 4.5.5 | Enviados por SMS e e-mail, com novos modelos editáveis e as variáveis de horário previsto | Sistema / Web |
| 4.5.6 | Respeita a configuração da agência de não notificar inquilinos | Sistema |

### 4.6 Metas, prêmios e níveis (03.6–03.10)

| # | Tarefa | Onde |
|---|---|---|
| 4.6.1 | Nova tela "Goals & rewards" no grupo Dashboard: criar metas por volume, região, tipo de serviço, índice mínimo ou qualquer métrica do índice | Web |
| 4.6.2 | Período da meta, público (todos, selecionados ou por região) e prêmio em dinheiro | Web |
| 4.6.3 | Apuração automática no fechamento de cada período, com geração dos prêmios conquistados | Sistema |
| 4.6.4 | 3 níveis de inspetor pelo índice (ex.: Bronze, Silver, Gold, com faixas configuráveis) e sequência de períodos com meta atingida | Sistema |
| 4.6.5 | Acesso antecipado às ofertas: grupos recém-publicados ficam visíveis primeiro para os níveis mais altos (tempo e nível configuráveis; começa desligado) | Sistema |
| 4.6.6 | Coluna "Level" na tela "Inspector performance" | Web |

### 4.7 Controle de prêmios e relatório (03.13, 03.14)

| # | Tarefa | Onde |
|---|---|---|
| 4.7.1 | Painel de prêmios por período: prometido × atingido | Web |
| 4.7.2 | Aprovar (por outra pessoa da operação, não quem criou), marcar como pago e anular, com auditoria | Web |
| 4.7.3 | Relatório do programa (metas, prêmios e histórico do índice) em XLSX, no fluxo de relatórios existente | Web |

### 4.8 "Challenges" no app (03.10, 03.15, 03.17)

| # | Tarefa | Onde |
|---|---|---|
| 4.8.1 | Nova área "Challenges" em More, com a aba "Active": metas em andamento, progresso, prêmio e prazo | App |
| 4.8.2 | Aba "My results": índice, nível, sequência e histórico de prêmios com status | App |
| 4.8.3 | Aba "Ranking": posição própria e pontuações dos demais, sem nomes | App |
| 4.8.4 | Mensagens automáticas na caixa de avisos: meta atingida, mudança de nível e sequência em risco | Sistema |

### 4.9 Anexos e mídias (C.1–C.9) — condicionado à validação do cliente

Entra neste sprint se a validação da parte de imagens e arquivos for concluída **até 11/11**. Depois dessa data, é agendada como entrega complementar.

| # | Tarefa | Onde |
|---|---|---|
| 4.9.1 | Aba "Files" no detalhe do appointment e do imóvel: enviar (arrastar ou escolher), filtrar, pré-visualizar, baixar e excluir | Web |
| 4.9.2 | Controle de versões: "New version" e histórico de versões de cada arquivo | Web |
| 4.9.3 | O imóvel mostra os próprios arquivos e os de todos os seus appointments, agrupados | Web |
| 4.9.4 | Tipos e tamanho de arquivo aceitos e tempo de retenção configuráveis | Web |
| 4.9.5 | Seção "Files" somente leitura no detalhe do serviço no app | App |
| 4.9.6 | No portal do inquilino: "Report something about the property", com nota e até 5 fotos | Portal do inquilino |
| 4.9.7 | Limpeza automática de arquivos excluídos e vencidos, com auditoria | Sistema |

---

## Validação

- Cada sprint é validado em staging durante o sprint seguinte. Os ajustes apontados entram na sequência.
- A validação do Sprint 4 acontece de **02/12 a 08/12**. Depois dela vem a publicação em produção.
- Itens que dependem de definição do cliente:
  - formato de pagamento dos prêmios (hoje previsto como pagamento manual, fora do financeiro da plataforma);
  - validação da parte de imagens e arquivos (4.9).
