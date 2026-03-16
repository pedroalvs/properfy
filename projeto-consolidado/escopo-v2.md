# Properfy - Escopo v2 (Alinhado às Decisões Técnicas)

Data: 2026-03-06

## 1. Objetivo do Produto

Properfy é uma plataforma B2B para operação de serviços de inspeção imobiliária, conectando:

1. Imobiliárias (clientes)
2. Equipe operacional (admin/master admin)
3. Inspetores (prestadores)
4. Inquilinos (acesso por link)

Objetivo operacional: orquestrar o ciclo completo de um appointment com rastreabilidade, controle financeiro e isolamento multi-tenant.

## 2. Stack e Arquitetura (Congeladas)

1. Backend: Node.js
2. Arquitetura backend: Clean Architecture
3. Modelo de deploy: Monolito
4. ORM: Prisma
5. Frontend: React + Vite + Tailwind CSS
6. Banco: PostgreSQL (Supabase como infraestrutura)
7. Storage: Supabase Storage (S3-compatible)
8. Autenticação: serviço interno (sem Supabase Auth)
9. Aplicação stateless
10. Isolamento multi-tenant no app (RLS opcional como camada extra)

## 3. Escopo Funcional

### 3.1 Portais

1. Portal Master Admin (Web)
2. Portal Imobiliária/Cliente (Web)
3. Portal Inquilino (Web, via link único)
4. App Inspetor (PWA Mobile)

### 3.2 Fluxo Core do Appointment

1. Agendamento (manual e importação por planilha)
2. Agrupamento geográfico (mapa + lasso)
3. Publicação de grupos no marketplace
4. Aceite de grupo por inspetor
5. Confirmação do inquilino (SMS/email + link)
6. Execução com geolocalização (start/done)
7. Conclusão com lançamento financeiro

### 3.3 Estados Oficiais do Appointment

1. `DRAFT`
2. `OPEN`
3. `SCHEDULED`
4. `DONE`
5. `CANCELED`
6. `REJECTED`

## 4. Módulos de Domínio (Backend)

1. Identity & Access
2. Tenants / Imobiliárias / Filiais
3. Properties
4. Appointments (state machine)
5. Service Groups / Marketplace
6. Tenant Confirmation
7. Inspector Execution
8. Notifications
9. Billing / Ledger
10. Reports / Export / Audit

## 5. Regras Transversais Obrigatórias

1. `tenant_id` obrigatório em entidades de negócio.
2. RBAC/ABAC validado no application layer.
3. Auditoria para ações críticas (status, permissões, financeiro).
4. Idempotência em comandos críticos (aceite, execução, notificações, lançamentos financeiros).
5. Logs estruturados e rastreabilidade por request.
6. Nenhuma query de negócio sem escopo de tenant.

## 6. Escopo MVP (Ponta a Ponta)

### 6.1 Incluído no MVP

1. Login interno e perfis básicos.
2. Cadastro de imóveis.
3. Criação de appointments.
4. Agrupamento e publicação no marketplace.
5. Aceite por inspetor.
6. Confirmação de inquilino por link.
7. Execução start/done com geolocalização.
8. Visão financeira básica (débito/crédito por serviço concluído).
9. Notificações essenciais (agendamento, aceite, confirmação, conclusão).

### 6.2 Fora do MVP (fase posterior)

1. Relatórios avançados com alto grau de customização.
2. Políticas financeiras complexas (regras excepcionais).
3. Automações avançadas de dispute/fraude.
4. Analytics avançado e otimizações preditivas.

## 7. Critérios de Pronto (Definition of Done)

1. Fluxo completo `DRAFT/OPEN -> SCHEDULED -> DONE` validado em ambiente de homologação.
2. Mudanças de status com autorização e trilha de auditoria.
3. Testes de isolamento multi-tenant aprovados.
4. Testes de regressão do state machine aprovados.
5. Notificações críticas com retry e idempotência.
6. Documentação técnica mínima por módulo (API, regras e eventos internos).

## 8. Dependências Externas

1. Provedor SMS (Twilio ou Zenvia)
2. Provedor de e-mail transacional (Resend)
3. Mapas e geocoding (Mapbox)
4. Infra de banco e storage (Supabase)

## 9. Riscos de Projeto

1. Complexidade de regras financeiras sem definição fechada.
2. Escopo amplo de permissões por papel e filial.
3. Ambiguidade em regras operacionais de confirmação/reagendamento.
4. Dependência de integrações externas para fluxo crítico.

## 10. Próxima Entrega de Planejamento

1. Backlog detalhado por épico/história.
2. Critérios de aceite por história.
3. Priorização por valor x risco.
4. Sequência de execução por sprints.
