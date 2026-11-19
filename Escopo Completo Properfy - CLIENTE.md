**PROPERFY**

## **DOCUMENTO DE ESCOPO TÉCNICO**

### **CONTEÚDO**

    1. Visão Geral do Projeto

2. Arquitetura e Stack Tecnológica
3. Níveis de Acesso e Permissões

   4. Portal Master Admin (Web)
4. Portal Cliente/Imobiliária (Web)

   6. Portal Inquilino (Web)
   7. App Inspetor (PWA Mobile)

### **1. Visão Geral do Projeto**

#### **1.1 O que é o Properfy**

O Properfy é uma plataforma marketplace B2B que conecta imobiliárias (Real Estates) com prestadores de serviço (Inspetores) para execução de inspeções, vistorias e outros serviços relacionados a imóveis.

O sistema funciona como um hub central onde:

- Imobiliárias agendam serviços de inspeção para seus imóveis
- Administradores agrupam serviços geograficamente através de um mapa interativo
- Grupos de serviço são publicados em um marketplace
- Inspetores aceitam e executam os trabalhos através de um app mobile (PWA)
- Inquilinos confirmam presença e respondendo formulários via links

#### **1.2 Principais Funcionalidades**

- **Mapa Interativo:** Visualização geográfica de todos os serviços pendentes com ferramenta de seleção em lote (lasso) para criar grupos otimizados
- **Marketplace de Serviços:** Inspetores visualizam ofertas disponíveis com valores, localização e detalhes para aceitar grupos
- **Gestão de Appointments:** Fluxo completo desde agendamento até finalização e preenchimento de formulários
- **Controle Financeiro:** Custo de imobiliaria, ganhos de inspetores e relatórios
- **Notificações Automatizadas:** SMS e email para inquilinos, e para inspetores
- **Execução Mobile:** App PWA para inspetores e geolocalização

#### **1.3 Volumetria Esperada**

| **Entidade**           | **Quantidade** | **Observação**     |
| ---------------------------- | -------------------- | -------------------------- |
| Imobiliárias                | +- 50                | Clientes contratantes      |
| Corretores (PropertyManager) | +- 100               | Usuários dasimobiliárias |
| Inspetores                   | +- 50                | Prestadores de serviço    |
| Administradores              | +- 5                 | Equipe interna Properfy    |

### **2. Arquitetura e Stack Tecnológica**

#### **2.2 Plataformas a Desenvolver**

| **Plataforma**                        | **Tipo**  | **Usuários**             | **Descrição**                                     |
| ------------------------------------------- | --------------- | ------------------------------- | --------------------------------------------------------- |
| Portal MasterAdmin (web visão admin)       | WebDesktop      | Admins (5)                      | Gestão completa, mapa,financeiro                         |
| Portal Imobiliária(Web visão imobiliaria) | WebDesktop      | Imobiliárias +Corretores (130) | Agendamento,acompanhamento                                |
| Portal Inquilino                            | WebMobile-first | Inquilinos (N)                  | Confirmação e formularios desatisfação e remarcação |
| App Inspetor                                | PWAMobile       | Inspetores (30)                 | Marketplace, execução, ganhos                           |

#### **2.3 Fluxo Principal do Sistema**

O ciclo de vida de um serviço segue estas etapas:

**1. AGENDAMENTO:** Imobiliária cria appointment → Status: DRAFT ou OPEN ( Tambem deve poder ser feito o agendamento via planilha, para realizar o cadastro de apontamentos em massa)

**2. AGRUPAMENTO:** Admin seleciona no mapa → Cria Service Group → Define data/horário

**3. PUBLICAÇÃO:** Grupo disponibilizado no marketplace → Visível para inspetores

**4. ACEITE:** Inspetor aceita grupo → Status: SCHEDULED → Sistema notifica inquilino

**5. CONFIRMAÇÃO:** Inquilino confirma via SMS/Email → Status atualizado

**6. EXECUÇÃO:** Inspetor inicia serviço → Finaliza

**7. CONCLUSÃO:** Status: DONE → Débito imobiliária → Crédito inspetor

#### **2.4 Estados do Appointment**

| **Status** | **Descrição**                    | **Transições Possíveis** |
| ---------------- | ---------------------------------------- | --------------------------------- |
| DRAFT            | Rascunho, não publicado                 | → OPEN, REJECTED                 |
| OPEN             | Aguardando inspetor nomarketplace        | → SCHEDULED, CANCELED            |
| SCHEDULED        | Inspetor designado,aguardando execução | → DONE, CANCELED                 |
| DONE             | Serviço finalizado com sucesso          | (estado final)                    |
| CANCELED         | Cancelado por qualquer parte             | (estado final)                    |
| REJECTED         | Rejeitado pelo sistema/admin             | (estado final)                    |

### **3. Níveis de Acesso e Permissões**

#### **3.1 Perfis de Usuário**

##### **Master Admin**

Acesso total ao sistema. Responsável pela operação da plataforma.

- Dashboard geral com KPIs de toda a operação
- Mapa interativo para agrupamento de serviços
- Gestão de todas as imobiliárias, inspetores e usuários
- Controle financeiro completo (saldos, pagamentos)
- Configuração de tipos de serviço e precificação
- Gestão de disputas e resolução de conflitos
- Relatórios gerenciais e exportações
- Alertas de serviços sem inspetor designado

##### **Admin**

Acesso total ao sistema. Responsável pela operação da plataforma.

- Mapa interativo para agrupamento de serviços
- Gestão de Agendamentos
- Configuração de tipos de serviço e precificação
- Relatórios gerenciais e exportações
- Alertas de serviços sem inspetor designado

##### **Cliente (Imobiliária)**

Acesso ao portal da imobiliária. Pode ter sub-usuários (corretores).

- Dashboard próprio com métricas da imobiliária
- Agendar novos serviços de inspeção
- Cadastrar e gerenciar imóveis
- Acompanhar status dos appointments
- Controle de extrato financeiro
- Gestão de corretores (sub-usuários)

##### **Corretor (Sub-usuário da Imobiliária)**

Acesso limitado dentro da imobiliária, definido pelo admin da imobiliária.

- Agendar serviços (se permitido)
- Visualizar appointments da imobiliária ou apenas os próprios
- Sem acesso a financeiro (configurável)

##### **Inspetor**

Acesso ao app mobile (PWA). Prestador de serviço.

- Visualizar marketplace de ofertas disponíveis
- Aceitar grupos de serviço
- Gerenciar agenda pessoal
- Executar serviços
- Acompanhar ganhos e histórico financeiro

##### **Inquilino**

Acesso via link único (sem cadastro). Parte interessada no imóvel.

- Confirmar presença no serviço agendado
- Realizar reagendamento
- Visualizar detalhes do agendamento
- Formulário de Satisfação

#### **3.2 Hierarquia de Acessos por Imobiliária**

Cada imobiliária pode ter configurações específicas de:

- Tipos de serviço habilitados (nem toda imobiliária acessa todos os 150+ tipos)
- Permissões dos corretores (criar appointments, ver financeiro, etc.)
- Filiais (branches) com gestão independente
- Limites de agendamento e alertas de saldo

### **4. Portal Master Admin (Web)**

#### **4.1 Dashboard**

###### **Visão Geral**

Tela inicial com indicadores-chave de toda a operação.

###### **KPIs Principais**

- Serviços hoje / esta semana / este mês
- Serviços por status (aguardando host, agendados, finalizados, cancelados)
- Taxa de confirmação de inquilinos
- Tempo médio de execução por tipo de serviço
- Receita do período

###### **Alertas e Ações Pendentes**

- Serviços sem inspetor designado há mais de X horas
- Serviços próximos do horário sem confirmação do inquilino

###### **Gráficos**

- Evolução de serviços por dia/semana
- Distribuição por tipo de serviço
- Mapa de calor de regiões com mais serviços

#### **4.2 Mapa Interativo**

##### **Permite visualização geográfica e agrupamento otimizado de serviços.**

###### **Visualização**

- Mapa fullscreen com Mapbox GL JS
- Markers coloridos por status (Draft, Open, Scheduled, etc.)
- Clusters para áreas com muitos serviços
- Zoom e navegação fluidos
- Markers com ícone diferenciado por tipo de serviço

###### **Filtros (Painel Lateral ou Top Bar)**

- Por status: Draft, Open, Scheduled, Rejected, etc.
- Por tipo de serviço: Routine Inspection, Ingoing, Outgoing, etc.
- Por imobiliária (Real Estate)
- Por cidade
- Por data/período
- Por confirmação do inquilino

###### **Click no Marker - Modal de Detalhes**

Ao clicar em um marker, abre modal com:

- Tipo de serviço e código
- Status com badge colorido
- Data e horário
- Cliente (imobiliária)
- Properties: código do imóvel + endereço
- Scheduled by: quem agendou
- Tenant: dados do inquilino
- Bonus and Authorization
- Confirmation: status de confirmação
- Meeting location
- Botão 'MORE DETAILS' direciona para tela completa

###### **Ferramenta de Seleção em Lote (Lasso Tool)**

Funcionalidade principal para criação de grupos:

- Botão para ativar modo de desenho
- Usuário desenha polígono no mapa
- Sistema seleciona todos os markers dentro da área
- Abre painel lateral com lista dos serviços selecionados

###### **Painel de Seleção (após desenhar área)**

Lista tabular com os serviços selecionados:

| **Coluna** | **Descrição**                          |
| ---------------- | ---------------------------------------------- |
| Checkbox         | Para selecionar/deselecionar individualmente   |
| Service          | Tipo + código (ex: Routine inspection 434489) |
| Date             | Data e horário agendado                       |
| Status           | Draft, Rejected, Open, etc.                    |
| Confirmations    | Ícones indicando email/SMS enviados           |
| Group            | Código do grupo (se já agrupado)             |

###### **Ações do Painel de Seleção**

- Close: fecha o painel e limpa seleção
- Add to group: adiciona serviços selecionados a um grupo existente
- Create group: cria novo grupo com os serviços selecionados

###### **Criação de Grupo**

Ao clicar em 'Create group':

- Modal para definir data do grupo
- Definir slot de horário (ex: 9:00 - 12:00)
- Visualizar valor total do grupo
- Confirmar criação → Grupo disponível no marketplace

#### **4.3 Gestão de Appointments**

A PROPERFY DEVE PODER REALIZAR ATUALIZAÇÃO DE STATUS DE APPOITMENTS EM CASOS ONDE O INQUILINO NÃO REALIZOU A CONFIRMAÇÃO VIA LINK OU EM CASOS QUE A IMOBILIARIA FAZ A CONFIRMAÇÃO.

###### **Visualização Kanban (Service Dashboard)**

Visão em colunas por status:

- Awaiting Host: aguardando inspetor aceitar
- Scheduled: agendados com inspetor
- Rejected: Rejeitado, precisa ser reagendado
- Cancelled: cancelados
- Done: finalizados

Cada card mostra: tipo, data/hora, código, inquilino, endereço, metragem.

###### **Appointment History (Lista Tabular)**

Histórico completo com filtros avançados:

##### **Filtros disponíveis:**

- Search: busca textual
- Type: tipo de serviço
- Dates: período (Recent, custom range)
- Status: todos os status
- Hosts: filtro por inspetor
- City: cidade
- Real Estate: imobiliária
- Branch: filial
- Plan: tipo de plano/contrato
- Confirmed: se inquilino confirmou
- Confirmation email sent: se email foi enviado

##### **Colunas da tabela:**

- Checkbox (seleção múltipla)
- Code: código do appointment
- Service: tipo de serviço
- Properties: código do imóvel + endereço
- Status: badge colorido
- Date: data/hora
- Group code: código do grupo
- Cancellation: motivo se cancelado
- Host: inspetor designado
- Customer: imobiliária

##### **Ações:**

- Generate Excel: exportar resultados
- Click na linha: abre detalhes
- Ações em massa com checkboxes

#### **4.4 Gestão de Imóveis (Properties)**

**Lista de Imóveis**

- Busca por código ou endereço
- Filtro por cidade
- Colunas: Code, City, Address, Additional, m² Private, m² Total, Furniture, Linen
- Ações: visualizar, editar, excluir
- Botão '+ New Property'

###### **Cadastro/Edição de Imóvel**

Campos do formulário:

- Código interno
- Endereço completo (com autocomplete de geolocalização)
- Complemento
- CEP
- Cidade
- Tipo: Apartment, House, Comercial, etc.
- Área privativa (m²)
- Área total (m²)
- Mobiliado: Sim/Não
- Enxoval: Sim/Não
- Valor aluguel

###### **Importação via Planilha**

- Upload de arquivo Excel/CSV
- Mapeamento de colunas
- Validação prévia
- Importação em lote
- Relatório de erros

#### **4.5 Gestão de Usuários**

###### **Inspetores**

- Lista com nome, email, telefone, avaliação, total de serviços, status
- Filtros por status ativo/inativo, região
- Cadastro: dados pessoais, documentos, região de atuação
- Ativar/desativar
- Visualizar histórico de serviços
- Visualizar ganhos

###### **Imobiliárias**

- Lista com nome, CNPJ, saldo, plano, status
- Cadastro completo com dados fiscais
- Configurar tipos de serviço habilitados
- Configurar hierarquia de permissões
- Gerenciar filiais (branches)
- Visualizar histórico e financeiro

###### **Corretores**

- Vinculados a uma imobiliária
- Permissões configuráveis
- Gestão feita pela imobiliária ou admin

###### **Administradores**

- CRUD de outros admins
- Níveis de permissão (se necessário)

#### **4.7 Financeiro**

###### **Pagamentos a Imobiliarias**

- **Lista de serviços realizados**
- **Histórico de pagamentos**

###### **Pagamentos a Inspetores**

- Lista de pagamentos pendentes
- Histórico de pagamentos realizados

#### **4.8 Relatórios**

###### **Gerador de Relatórios**

Filtros disponíveis:

- Type: Appointments Report, Financial Report, etc.
- Date: Scheduled, Created, Completed
- Period: seleção de período
- City
- Branch
- Status
- Toggle 'Group properties': agrupar por imóvel
- Botão 'Generate'

###### **Tipos de Relatório**

- Relatório de Appointments: listagem detalhada por período
- Relatório Financeiro: receitas, despesas
- Relatório de Performance: métricas por inspetor
- Relatório de Imobiliárias: uso por cliente

#### **4.9 Configurações**

- Tipos de serviço: CRUD, precificação, duração estimada
- Templates de notificação: SMS, email
- Parâmetros gerais: timezone, moeda, etc.
- Integrações: chaves de API (Resend, etc.)

### **5. Portal Cliente/Imobiliária (Web)**

#### **5.1 Dashboard**

- KPIs da imobiliária: serviços do mês, finalizados, cancelados
- Pagementos
- Gráfico de evolução de serviços
- Últimos serviços e status
- Alertas: Serviços pendentes

#### **5.2 Agendar Serviço (+ New Appointment)**

A IMOBILIÁRIA DEVE PODER REALIZAR A CONFIRMAÇÃO E ALTERAÇÃO DE STATUS DE APPOITMENTS.

**Formulário de Agendamento**

Campos obrigatórios:

- Tipo de serviço (dropdown dos habilitados para a imobiliária)
- Imóvel: selecionar existente ou cadastrar novo
- Data desejada
- Filial (Branch) responsável

Dados do Inquilino:

- Nome
- Email
- Telefone

Localização:

- Local da chave: Real Estate, Realty, Smart Box, Owner, Other
- Endereço da chave (se Other/Owner)
- Quem pega a chave: Host, Visitor, Not needed
- Local de encontro: Real Estate, Realty, Other
- Endereço de encontro (se Other)

##### Adicional:

- Observações

#### **5.3 Meus Serviços**

###### **Lista de Appointments**

- Filtros: período, status, tipo, imóvel
- Colunas: código, tipo, imóvel, status, data, inspetor
- Click para ver detalhes

###### **Detalhes do Appointment**

- Todas as informações do serviço
- Timeline de status
- Dados do inspetor designado
- Status de confirmação do inquilino
- Geolocalização da inspeção.
- Ações: cancelar (se permitido pelo status)

#### **5.4 Meus Imóveis**

- CRUD de imóveis da imobiliária
- Mesmos campos do admin
- Histórico de serviços por imóvel
- Importação via planilha

#### **5.5 Financeiro**

- Serviços realizados
- Relatórios financeiros realizados

#### **5.6 Gestão de Corretores**

- Lista de corretores da imobiliária
- Adicionar novo corretor
- Definir permissões
- Ativar/desativar
- Resetar senha

#### **5.7 Configurações**

- Dados da empresa
- Logo
- Filiais

### **6. Portal Inquilino (Web via Link)**

_Acesso sem cadastro, através de link único enviado por SMS/Email._

#### **6.1 Página de Confirmação**

Primeira tela ao acessar o link:

- Dados do serviço: tipo, data, horário
- Endereço do imóvel
- Nome da imobiliária
- Instruções (onde encontrar, chave, etc.)
- Botão 'Confirmar Presença'
- Botão 'Não poderei comparecer' (solicita reagendamento)

#### **6.2 Status de Confirmação**

Após confirmar:

- Mensagem de confirmação
- Resumo do agendamento
- Opção de adicionar ao calendário
- Contato para dúvidas
- Formulário de Satisfação de Execução de serviço

### **7. App Inspetor (PWA Mobile)**

_Progressive Web App otimizado para mobile. Instalável na home screen._

#### **7.1 Navegação (Bottom Tab Bar)**

| **Tab** | **Ícone**  | **Função**       |
| ------------- | ----------------- | ------------------------ |
| Offers        | Pin/localização | Marketplace de serviços |
| Schedule      | Calendário       | Agenda pessoal           |
| Profile       | Pessoa            | Perfil e ganhos          |

#### **7.2 Offers (Marketplace)**

###### **Toggle List**

- Vista em lista (padrão)

###### **Card de Oferta (Lista)**

Cada card exibe:

- Ícone do tipo de imóvel (apartamento, casa, etc.)
- Tipo de serviço: 'Ingoing - Apartments up to 3 Beds'
- Nome da imobiliária + quantidade de serviços: 'Belle Property St George, 1 service(s)'
- Data e horário: '08 Dec ⏰ 9:00 am'
- Endereço completo
- Valor em destaque: 'A$79.94' (verde)

###### **Tipos de Serviço Exibidos**

- Ingoing (entrada): Apartments, House, variações por quartos
- Outgoing (saída): mesmas variações
- Routine inspection
- Outros tipos conforme contrato

###### **Aceitar Oferta**

- Click no card abre detalhes
- Visualiza todos os serviços do grupo
- Valor total
- Endereços e roteiro
- Botão 'Accept' para aceitar o grupo completo

#### **7.3 Schedule (Agenda)**

###### **Visualização por Data**

Header com data destacada

##### **O INSPETOR DEVE TER VISÃO DE MAPA E NO MARKETPLACE, DEVE PODER VERIFICAR COM ICONES A LOCALIZAÇÃO DOS SERVIÇOS A SEREM REALIZADOS.**

Lista de serviços do dia:

- Horário: '9:00 am - 12:00 pm'
- Código: 'Code: 445534'
- Tipo + imobiliária: 'Routine inspection - Paris Property, 1 service(s)'
- Endereço
- Realty codes: código do imóvel
- Badge 'Pending confirmation' se inquilino não confirmou

###### **Indicadores Visuais**

- Serviço confirmado: sem badge
- Pendente confirmação: badge amarelo 'Pending confirmation'
- Atrasado: badge vermelho (se aplicável)

#### **7.4 Detalhes do Serviço Agendado**

**Header**

- Título: 'Scheduled service'
- Horário: '9:00 am - 12:00 pm'
- Data: '10 Dec'

###### **Ações Principais**

- Botão 'Start service' (azul, destaque) - Geolocalização
- Botão “Done” - Geolização
- Botão 'Cancel' (cinza escuro)

###### **Informações**

- Service type: tipo de serviço
- Service code: código
- Realty codes: código do imóvel
- Meeting location: endereço de encontro
- Key location: onde pegar a chave
- Customer: nome da imobiliária

###### **Navegação**

- Click no endereço abre app de mapas para navegação

#### **7.5 Execução do Serviço**

**Início (Start Service)**

- Captura de geolocalização
- Registro de horário de início

###### **Finalização**

- Captura de geolocalização final
- Registro de horário de término
- Botão 'Finish service'
- Confirmação de conclusão

#### **7.6 Profile (Perfil)**

**Header do Perfil**

- Foto do inspetor
- Nome
- Avaliação: '5.00 ★' - Baseado na pesquisa de satifação
- Total de serviços: '245 Services'

###### **Abas**

##### **Earnings | History | User**

###### **Aba Earnings (Ganhos)**

Métricas financeiras:

- Next payment: valor do próximo pagamento (destaque grande, verde)
- Total earnings with Properfy: ganho histórico total
- Filtro de análise de ganhos por data

Gráfico de barras ou semelhante:

- Barras por dia da semana (M T W T F S S)
- Altura proporcional ao ganho do dia
- Dia atual destacado (azul)

###### **Aba History**

- Lista de serviços realizados
- Filtro por período
- Status de pagamento

###### **Aba User**

- Edição de dados pessoais
- Foto
- Telefone
- Dados bancários para pagamento
- Região de atuação preferida
- Configurações de notificação

#### **7.7 Notificações via SMS**

- Inquilino confirmou presença
- Pagamento processado
- Oferta prestes a expirar
