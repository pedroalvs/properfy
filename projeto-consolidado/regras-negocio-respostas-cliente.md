# Properfy - Respostas do Cliente sobre Regras de Negocio

Fonte: `/Users/pedro/Downloads/regras-negocio-pendentes-cliente.docx`
Data de consolidacao: 2026-03-14

## Status geral por bloco

1. Estados e transicoes de appointment: `RESPONDIDO`
2. Regras financeiras: `RESPONDIDO`
3. Reagendamento e cancelamento: `RESPONDIDO`
4. Ofertas e agrupamento: `RESPONDIDO`
5. Portal do inquilino: `RESPONDIDO`
6. Notificacoes de negocio: `RESPONDIDO`
7. Importacao de dados: `RESPONDIDO`
8. Relatorios: `RESPONDIDO`
9. Permissoes funcionais (RBAC): `RESPONDIDO`

## 1. Estados e transicoes de appointment

### Status possiveis

1. `DRAFT` - Servico criado no sistema, mas ainda nao liberado para operacao.
2. `AWAITING_INSPECTOR` - Servico disponivel para que inspetores aceitem.
3. `SCHEDULED` - Servico ja aceito por um inspetor e programado para execucao.
4. `REJECTED` - Servico invalido ou impossivel de executar.
5. `CANCELLED` - Servico cancelado.
6. `DONE` - Inspecao executada e finalizada.

### Transicoes definidas

1. `DRAFT -> AWAITING_INSPECTOR`
   - Responsavel: Operador ou Sistema
   - Motivo obrigatorio: Nao
2. `DRAFT -> REJECTED`
   - Responsavel: Operador ou Admin Master
   - Motivo obrigatorio: Sim
3. `DRAFT -> CANCELLED`
   - Responsavel: Operador, Cliente Admin, Cliente User (se permitido) ou Admin Master
   - Motivo obrigatorio: Sim
4. `AWAITING_INSPECTOR -> SCHEDULED`
   - Responsavel: Sistema via marketplace ou Operador (atribuicao manual)
   - Motivo obrigatorio: Nao
5. `AWAITING_INSPECTOR -> CANCELLED`
   - Responsavel: Operador, Cliente ou Admin Master
   - Motivo obrigatorio: Sim
6. `AWAITING_INSPECTOR -> REJECTED`
   - Responsavel: Operador ou Admin Master
   - Motivo obrigatorio: Sim
7. `SCHEDULED -> DONE`
   - Responsavel: Inspetor ou Operador
   - Motivo obrigatorio: Nao
8. `SCHEDULED -> CANCELLED`
   - Responsavel: Operador, Cliente ou Admin Master
   - Motivo obrigatorio: Sim
9. `SCHEDULED -> REJECTED`
   - Responsavel: Operador ou Sistema
   - Motivo obrigatorio: Sim
10. `REJECTED -> DRAFT`
   - Responsavel: Operador ou Admin Master
   - Motivo obrigatorio: Sim
11. `CANCELLED -> DRAFT`
   - Responsavel: Operador ou Admin Master
   - Motivo obrigatorio: Sim
12. `DONE -> DRAFT`
   - Responsavel: apenas Admin Master
   - Motivo obrigatorio: Sim

### Regras complementares

1. `OPEN = AWAITING_INSPECTOR`
2. Confirmacao manual pode ser forcada por:
   - Operador
   - Admin Master
   - Cliente User
3. `REJECTED` pode retornar para `DRAFT` ou `AWAITING_INSPECTOR`
4. `DONE` pode ser reaberto para `REJECTED` ou `DRAFT`, com motivo obrigatorio

### Casos que levam `SCHEDULED -> REJECTED`

1. Inquilino nao responde apos fluxo completo de comunicacao
2. Inquilino informa indisponibilidade via portal
3. Inquilino informa indisponibilidade por email, SMS ou telefone

Motivos sugeridos:

1. `Tenant unresponsive`
2. `Tenant unavailable`
3. `Tenant declined inspection`

## 2. Regras financeiras

1. Debito da imobiliaria:
   - acontece quando o servico e marcado como `DONE`
   - exige cross check do operador
2. Credito/payout do inspetor:
   - acontece quando o servico e marcado como `DONE`
   - exige cross check do operador
3. Split de repasse:
   - pode variar por servico
4. Cancelamento:
   - sem custo
5. Estorno:
   - somente em caso de servico marcado como executado mas nao realizado
6. Ajuste financeiro manual:
   - permitido para Admin Master e Operador
7. Periodicidade de fechamento/faturamento:
   - semanal, quinzenal ou mensal
   - depende do cliente e do inspetor

## 3. Reagendamento e cancelamento

### Regras por tipo de servico

1. `Routine Inspection`
   - participa do fluxo de confirmacao do inquilino
   - reagendamento permitido:
     - `TNT`: Sim
     - `CL`: Nao
     - `OP`: Sim
   - cancelamento permitido:
     - `CL`: Sim
     - `OP`: Sim
2. `Ingoing Inspection`
   - nao participa do fluxo de confirmacao do inquilino
   - reagendamento permitido:
     - `CL`: Sim
     - `OP`: Sim
   - reagendamento nao permitido:
     - `TNT`: Nao
   - cancelamento permitido:
     - `CL`: Sim
     - `OP`: Sim
3. `Outgoing Inspection`
   - nao participa do fluxo de confirmacao do inquilino
   - reagendamento permitido:
     - `CL`: Sim
     - `OP`: Sim
   - reagendamento nao permitido:
     - `TNT`: Nao
   - cancelamento permitido:
     - `CL`: Sim
     - `OP`: Sim
4. Outros servicos
   - reagendamento permitido:
     - `CL`: Sim
     - `OP`: Sim
   - reagendamento por `TNT` depende do tipo de servico
   - cancelamento permitido:
     - `CL`: Sim
     - `OP`: Sim

### Reagendamento por status

1. `DRAFT`
   - `CL`: Sim
   - `OP`: Sim
   - `TNT`: Nao
2. `AWAITING_INSPECTOR`
   - `CL`: Sim
   - `OP`: Sim
3. `SCHEDULED`
   - Routine:
     - `TNT`: Sim
     - `OP`: Sim
     - `CL`: Nao
   - Ingoing/Outgoing:
     - `CL`: Sim
     - `OP`: Sim
     - `TNT`: Nao
4. `DONE`
   - reagendamento nao permitido
   - se precisar refazer:
     - `DONE -> DRAFT`
     - `DONE -> REJECTED`

### Janela de reagendamento

1. Janela minima:
   - ate `7:00 PM` do dia anterior a inspecao
   - apos esse horario, apenas operador pode alterar
2. Janela maxima:
   - ate `30 dias` apos a data original
   - apos isso, recomenda-se cancelar e criar novo agendamento

### Regra quando nao houver slot no raio padrao

1. Raio padrao: `2 km`
2. Se nao houver slot:
   - expandir para `3 km`
   - abrir opcao para inquilino definir restricoes

### Regra T-1

1. `Routine Inspection`
   - apenas `SCHEDULED` e confirmado
2. `Ingoing/Outgoing`
   - `SCHEDULED` ja e tratado como confirmado

### Excecoes da regra T-1

1. Acesso por chave
   - se `key_required = true`, o servico pode aparecer no app
2. Confirmacao manual
   - operador pode confirmar manualmente apos contato
3. Ingoing/Outgoing
   - aparecem no app do inspetor quando `SCHEDULED`

## 4. Ofertas e agrupamento

1. Limite minimo por grupo:
   - `5` inspecoes
   - excecoes especiais em regioes de baixa densidade, servicos isolados e clientes prioritarios
2. Limite maximo por grupo:
   - `25` inspecoes
   - expectativa operacional: `25` ofertadas -> `12 a 18` confirmadas
3. Mistura de tipos no grupo:
   - nao permitido por padrao
   - cada grupo deve conter apenas um tipo de servico
4. Oferta prioritaria de 24h:
   - nao global
   - configuravel por cliente, filial e regiao operacional
5. Desempate em aceite simultaneo:
   - `First valid acceptance wins`
   - primeiro aceite valido registrado no sistema vence
6. Replanejamento sem aceite:
   - Routine:
     - operador reage nda grupo para data futura ou desfaz grupo
     - pode atribuir manualmente, reagendar algumas inspecoes ou redistribuir
   - Ingoing/Outgoing:
     - `24h` antes, enviar WhatsApp aos inspetores com oferta
     - avisar operador se servico nao for aceito

## 5. Portal do inquilino

1. Validade do token:
   - ate `7:00 PM` do dia anterior a inspecao
   - apos isso:
     - portal fica apenas para visualizacao
     - confirmar/reagendar ficam bloqueados
     - apenas operador pode alterar
2. Regra apos `7:00 PM`:
   - autorizar rejeicao de urgencia
   - enviar notificacao ao inspetor via WhatsApp que o servico foi cancelado
3. Uso do token:
   - nao e de uso unico
   - pode ser reutilizado ate expirar
4. Atualizacao de contato:
   - pode atualizar telefone principal/secundario e email
   - salva no registro da inspecao
   - registra no historico
   - nao altera automaticamente dados oficiais da agencia
5. Restricoes no portal:
   - campos disponiveis:
     - estarei em casa (sim/nao)
     - precisa reagendar
     - dias indisponiveis
     - horarios indisponiveis
     - observacoes adicionais
   - nenhum campo de restricao e obrigatorio
   - obrigatorio apenas a acao do inquilino:
     - confirmar
     - informar indisponibilidade
     - solicitar reagendamento
6. Auditoria do portal:
   - todas as interacoes devem ser registradas
   - sugestao de tabela: `tenant_portal_activity`

## 6. Notificacoes de negocio

### Eventos obrigatorios

1. Aviso inicial de inspecao
2. Lembrete 7 dias
3. Lembrete 5 dias
4. Lembrete 3 dias
5. Escalada para Property Manager
6. SMS de alerta para o inquilino
7. Confirmacao de inspecao
8. Confirmacao de reagendamento
9. Cancelamento de inspecao

### Canais obrigatorios

1. Aviso inicial: `Email`
2. Lembrete 7 dias: `Email`
3. Lembrete 5 dias: `Email`
4. Lembrete 3 dias: `Email`
5. Escalada Property Manager: `Email`
6. SMS de alerta ao inquilino: `SMS`
7. Confirmacao de inspecao: `Email`
8. Confirmacao de reagendamento: `Email`
9. Cancelamento de inspecao: `Email`

### Templates obrigatorios

1. Aviso inicial de inspecao
2. Lembrete 7 dias
3. Lembrete 5 dias
4. Lembrete 3 dias
5. Escalada para Property Manager
6. SMS de alerta ao inquilino
7. Confirmacao de inspecao
8. Confirmacao de reagendamento
9. Cancelamento de inspecao

### Regras de template

1. Configuravel por cliente/agencia
2. Permitir:
   - logotipo
   - textos personalizados
   - assinatura
3. Variaveis dinamicas:
   - endereco do imovel
   - data
   - janela de horario
   - nome da agencia
   - link do portal

### Status de entrega

1. Operacao deve visualizar:
   - `SENT`
   - `DELIVERED`
   - `FAILED`
2. Cada notificacao deve registrar:
   - `appointment_id`
   - destinatario
   - canal
   - template
   - status
   - timestamp de envio
   - timestamp de entrega

## 7. Importacao de dados

### Layout minimo da planilha

1. Colunas existentes:
   - `Service`
   - `Property code`
   - `Date`
   - `Hour`
   - `Time Slot`
   - `Street`
   - `Suburb`
   - `Postcode`
   - `State`
   - `Country`
   - `Address line 2`
   - `Notes`
   - `Realty description`
   - `Tenant name`
   - `Tenant mail`
   - `Tenant phone`
   - `PHONE: Tenant secondary phone`
   - `EMAIL: Tenant secondary mail`
   - `OTHER: Key number`

### Campos obrigatorios

1. Routine Inspection
   - `Service`
   - `Street`
   - `Suburb`
   - `Postcode`
   - `State`
   - `Tenant phone`
   - `Tenant email`
2. Ingoing/Outgoing
   - `Service`
   - `Street`
   - `Suburb`
   - `Postcode`
   - `State`
   - dados do inquilino nao sao obrigatorios

### Regras de erro

1. Rejeitar linha quando:
   - `Service` invalido
   - `Street` vazio
   - `Suburb` vazio
   - `Postcode` invalido
   - `State` invalido

### Regras de warning

1. Importar com alerta quando:
   - `Tenant phone` invalido
   - `Tenant email` invalido
   - endereco incompleto
   - falha de geolocalizacao
   - `Tenant name` vazio

### Deduplicacao

1. Regra:
   - `Street + Address line 2 + Postcode`
2. Se ja existir inspecao com:
   - mesmo endereco
   - mesmo tipo de servico
   - nos ultimos `3 meses`
3. Resultado:
   - gerar warning de possivel duplicidade

### Volume maximo

1. Maximo recomendado por arquivo:
   - `1000` inspecoes
2. Acima disso:
   - bloquear upload
   - solicitar divisao da planilha

## 8. Relatorios

### Lista fechada de relatorios

#### Cliente e Operador

1. Relatorio de inspecoes agendadas
2. Relatorio de inspecoes executadas
3. Relatorio de inspecoes canceladas
4. Relatorio de inspecoes rejeitadas

#### Operador

5. Relatorio de performance dos inspetores
6. Relatorio de confirmacoes de inspecao
7. Relatorio financeiro de servicos executados

### Filtros obrigatorios

1. Periodo de data
2. Cliente / Agencia
3. Tipo de servico
4. Endereco
5. Status da inspecao
6. Inspetor
7. Status de confirmacao
8. Status de aviso por email enviado
9. Date range
10. Status
11. Busca por endereco
12. Nome do inquilino
13. Telefone

### Formato de exportacao

1. `XLSX`

### Geracao assincrona

Relatorios assincronos por volume:

1. Relatorio de inspecoes agendadas (periodos grandes)
2. Relatorio de inspecoes executadas
3. Relatorio financeiro de servicos executados
4. Relatorio de performance de inspetores

### Funcionamento recomendado

1. Sistema inicia geracao em background
2. Usuario recebe notificacao quando estiver pronto
3. Relatorio fica disponivel para download

## 9. Permissoes funcionais (RBAC)

### Definicoes respondidas

1. Visao do corretor:
   - padrao: todos os appointments da imobiliaria
2. Permissoes configuraveis por imobiliaria:
   - visualizar todos os imoveis da agencia
   - visualizar apenas imoveis proprios
   - criar novos servicos
   - cancelar servicos
   - reagendar servicos (quando permitido)
   - exportar relatorios
   - acessar relatorios financeiros
3. Heranca por filial:
   - sim, o sistema deve suportar estrutura de filiais

### Acoes sensiveis validadas para RBAC

#### Acoes criticas com permissao elevada

1. Executadas diretamente apenas por `AM` ou `OP`:
   - reabrir servico `DONE`
   - alterar manualmente status financeiro
   - executar estorno
   - forcar confirmacao manual sem resposta do inquilino
   - marcar `SCHEDULED -> REJECTED`
   - cancelar servico `SCHEDULED` proximo da data
   - acessar credenciais externas de software de inspecao
   - desativar cliente, filial ou inspetor com servicos em aberto
   - alterar tabela de preco ou split em cliente ja operacional
   - forcar atribuicao manual de grupo ou servico para inspetor fora da regra automatica

2. Permitidas para `CL` apenas se a agencia habilitar explicitamente:
   - cancelar servico
   - reagendar servico
   - visualizar financeiro
   - exportar relatorios sensiveis
   - criar ou gerenciar usuarios internos

#### Regras obrigatorias para toda acao sensivel

1. Motivo obrigatorio
2. Registro de auditoria completo
3. Identificacao de usuario, data e contexto da alteracao

#### Casos recomendados para dupla aprovacao

1. Estorno financeiro
2. Ajuste manual de valor ou payout
3. Reabertura de inspecao finalizada, se a operacao quiser endurecer o controle

#### Regra final adotada

1. Usar `permissao elevada + auditoria` como regra padrao
2. Reservar `dupla aprovacao` apenas para eventos financeiros e excecoes de alto impacto

## 10. Pendencias remanescentes fora de regra de negocio

1. Nao ha mais pendencia funcional relevante neste documento.
2. Pendencias restantes do projeto estao concentradas em itens contratuais e operacionais:
   - backup
   - RPO/RTO
   - retencao de dados/logs
   - compliance/LGPD especifico
   - comunicacao de incidentes
   - validacao pratica dos runbooks em `staging`
