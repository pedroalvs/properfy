# Decisões pendentes

**Como ler:**
- Cada decisão tem uma recomendação (a opção mais barata que mantém a qualidade) e mostra quais features bloqueia.
- Se a decisão não vier a tempo, a spec segue a recomendação e a registra como premissa.

**Status possíveis:**
- **PENDENTE:** ainda não foi decidida.
- **ASSUMIDA:** a spec segue a recomendação.
- **DECIDIDA:** registrar quem decidiu e quando.

## Redação do contrato — resolver antes da assinatura ou na sessão de kickoff

| ID | Tema | Problema | Recomendação | Bloqueia | Status |
|---|---|---|---|---|---|
| Q1 | "Cancelamento" pelo inspetor (00.7) | A máquina de estados só permite ao inspetor `SCHEDULED → DONE`. `CANCELLED` significa que a agência cancelou, sem custo. | O inspetor registra **"Não consigo fazer"** com um motivo (os do design v3: sem resposta, chave não funcionou, inquilino recusou, inseguro, problema no local + "não poderei ir"). Isso vira um evento e um alerta para a OP. A **OP** decide com as ferramentas que já existem: rejeitar o serviço individual (desde o #1293 isso já desvincula o grupo e libera o inspetor) ou trocar o inspetor do grupo. A máquina de estados não muda. | F03 | **DECIDIDA** (dev, 2026-10-27): **diferente da recomendação**. O inspetor libera direto: o serviço vai para REJECTED via SYS com o código `INSPECTOR_UNABLE`, e o motivo aparece no detalhe e no modal do mapa |
| Q2 | "Sem operação offline" | O PWA **já tem** fila offline de início/fim. | Reescrever assim: a tolerância offline atual de início/fim é mantida e os eventos novos exigem conexão. | F03 | PENDENTE |
| Q3 | "Sem rastreamento contínuo" × "em deslocamento" / "aviso por geolocalização" | Os dois pedidos se contradizem. | Derivar o estado a partir de eventos + plano. O aviso matinal usa o **horário previsto do roteiro**, a partir do endereço-base. | F05, F06 | **DECIDIDA** (dev, 2026-10-27): último ponto conhecido, sem ping |
| Q4 | Código 01.12 aparece duas vezes | O contrato diz que os códigos são estáveis. | Renumerar o segundo para **01.15** (neste plano ele aparece como 01.12-B). | F06 | PENDENTE |
| Q5 | Título da D promete "rotas em tempo real" | Isso já é o 01.8. | Retirar essa frase da D. | F09 | **DECIDIDA** (dev, 2026-10-27): manter o texto na D e deixar claro que é atendido pelo Dia ao Vivo (F05). Não é uma segunda tela |
| Q6 | D e E "sobre o mapa da 01" | O mapa com filtros e escopo é o `/map` da Fase 1. | E e D entram no `/map`. A E não depende da 01. | F00, F09 | PENDENTE |
| Q7 | "Issues com fotos" no portal (C) × exclusão de "portal com chamados" (§6) | O pedido da C colide com a exclusão do §6. | Limitar a nota + até 5 fotos, somente leitura para o inspetor e a OP. Sem status de chamado, respostas ou SLA. | F10 | ⏸️ **PROVISÓRIA** (dev, 2026-10-27): nota + até 5 fotos. Toda a F10 aguarda validação do cliente |
| Q8 | Rota "por IA" | Não há LLM no projeto e nenhum critério de aceite exige um. | Usar um otimizador determinístico (Matrix do Mapbox + busca exata para ≤ 8 paradas). Confirmar com o comercial que "IA" quer dizer otimização. | F04 | **DECIDIDA** (dev, 2026-10-27): otimização determinística sobre o Mapbox Matrix. O Google Route Optimization foi descartado pelos termos (§18.2, proibido usar com mapa não Google). Ele fica como saída se o erro do horário previsto passar de 10 min na homologação. O comercial ainda precisa alinhar o termo \"IA\" no contrato |

## Regras de produto

| ID | Tema | Recomendação | Bloqueia | Status |
|---|---|---|---|---|
| Q9 | O que é "publicação do dia" | O plano do dia D+1 é publicado **automaticamente às 19:30 (horário da agência)**, logo depois do `appointment.reject-unconfirmed` (que roda às 19h fixas). A OP pode recalcular/republicar manualmente. Se algo mudar depois de publicado, o plano é marcado "desatualizado" e recalculado quando abrir. | F04, F02 | **DECIDIDA** (dev, 2026-10-27): automática às 19:30 locais |
| Q10 | Geofence | O modo padrão é **SINALIZAR**; BLOQUEAR fica opcional. Cai automaticamente para SINALIZAR quando o imóvel não tem coordenadas ou a precisão é maior que o raio. Fora da janela: só sinaliza para a operação, nunca notifica o inquilino. | F03 | **DECIDIDA** (dev, 2026-10-27): SINALIZAR |
| Q11 | Chegada / saída / fechamento | Manter **2 toques** (check-in = início, check-out = fim). "Fechamento" é o DONE, que já ocorre na mesma transação. | F03 | **DECIDIDA** (dev, 2026-10-27): 2 toques |
| Q12 | Bônus em dinheiro | Fica no registro `RewardAward` (PENDENTE → APROVADO → PAGO_MANUALMENTE). **Não** entra no ledger nem na fatura, porque hoje ajustes manuais não chegam à fatura e o contrato exclui integração de repasse. | F08 | ⚠️ **ASSUMIDA, AGUARDANDO O CLIENTE** (dev, 2026-10-27): fora do financeiro; o dev confirma com o cliente. Se for no financeiro, +3 a 4 dias por pedido de mudança |
| Q13 | Prioridade de oferta | É uma **janela de acesso antecipado de plataforma**: o grupo recém-publicado fica visível só para os níveis ≥ X por H horas. Não usar o `priorityOfferHours` por agência (está morto e não faz sentido para um inspetor cross-tenant). | F08 | **DECIDIDA** (dev, 2026-10-27): acesso antecipado por nível, configurado na plataforma |
| Q14 | Janelas no roteiro | Todas as janelas são **rígidas**; o otimizador nunca altera uma janela. "Travado" = `rental_tenant_confirmation_status = CONFIRMED` (ou um tipo de serviço que não exige confirmação). | F04, F09 | **DECIDIDA** (dev, 2026-10-27): todas as janelas são rígidas. Depois do T-1 só sobram confirmados, com chave ou sem exigência de confirmação. A reordenação manual só avisa |
| Q15 | Janela de 14 dias no mapa | **Misto.** AM/OP podem removê-la pelo chip; CL fica com ela fixa, aplicada no front (sem corte no servidor, porque o CL já vê esses dados na lista). A janela vai de hoje a +N. Sem agência filtrada vale o padrão de plataforma (14). | F00 | **DECIDIDA** (dev, 2026-10-27) |
| Q16 | O que é "crítico" (push com fallback SMS) | Críticos = plano publicado/alterado, retorno da OP sobre "Não consigo fazer", lembrete de conclusão e aviso marcado como crítico pela OP. O resto fica só na caixa de avisos. | F02 | **DECIDIDA** (dev, 2026-10-27/28): críticos = roteiro publicado ou alterado, lembrete de conclusão e avisos manuais marcados (o \"retorno da OP\" saiu com a Q1). SMS na hora quando não há push ou o push falha por qualquer motivo. Varredura de segurança a cada 5 min |
| Q17 | Limites de alerta "por inspetor" | Padrão de plataforma + override opcional no drawer do inspetor. | F05 | **DECIDIDA** (dev, 2026-10-27): padrão da plataforma + override por inspetor |
| Q18 | Agências veem ranking/índice? | **Não.** Fica só com AM/OP (mesmo precedente do `/inspector-workload`). | F07, F08 | **DECIDIDA** (dev, 2026-10-27): só AM/OP |
| Q19 | Reordenar: "arrastar" (contrato) × setas (design) | Fazer arrastar (`@dnd-kit`) **com** botões subir/descer. A11y exige uma alternativa ao arraste de qualquer forma. | F04 | **DECIDIDA** (dev, 2026-10-27): arrastar + setas |
| Q20 | Quem edita a janela do mapa da agência (E.2) | **AM e OP** editam, via uma allow-list só da OP; o CL_ADMIN não edita. | F00 | **DECIDIDA** (dev, 2026-10-27) |
| Q21 | Canal dos avisos de horário ao inquilino | SMS quando houver telefone, senão e-mail. Respeitar o switch da agência e o consentimento. | F06 | **DECIDIDA** (dev, 2026-10-27): SMS + e-mail em cada gatilho |

## Valores de onboarding (sessão já prevista no §3 do contrato)

| Valor | Usado em | Padrão sugerido |
|---|---|---|
| Raio do geofence (m) e modo | F03 | 300 m, SINALIZAR |
| Duração padrão por tipo de serviço (min) | F04 | Média medida em `avgExecutionMinutes` |
| Pesos da rota (deslocamento × folga de janela × proximidade da base) | F04 | 1 / 1 / 1 |
| Limite de atraso / não iniciado (min) | F05, F06 | 20 / 30 |
| Horário do aviso matinal | F06 | 07:00 (envio permitido só até 09:00) |
| Pesos das métricas do índice e faixas de nível | F07, F08 | Pesos iguais; 3 níveis |
| Horas de acesso antecipado | F08 | 12 h |
| Formatos e tamanho máximo dos anexos; retenção (dias) | F10 | jpg/png/heic/pdf/docx; 20 MB; sem expurgo (null) |
| Janela do mapa (dias) | F00 | 14 |
