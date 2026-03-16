# Properfy - Consolidado de Decisoes Tecnicas e Escopo

Data de consolidacao: 2026-03-06

## 1) Escopo do Produto

Plataforma B2B para conectar imobiliarias e inspetores em servicos de inspecao imobiliaria, com fluxo ponta a ponta:

1. Agendamento do appointment
2. Agrupamento geografico (mapa + lasso)
3. Publicacao no marketplace
4. Aceite pelo inspetor
5. Confirmacao do inquilino (via link SMS/email)
6. Execucao (start/done com geolocalizacao)
7. Conclusao com impacto financeiro

Portais previstos:

1. Portal Master Admin (web)
2. Portal Imobiliaria/Cliente (web)
3. Portal Inquilino (web via link unico)
4. App Inspetor (PWA mobile)

Estados do appointment:

1. DRAFT
2. OPEN
3. SCHEDULED
4. DONE
5. CANCELED
6. REJECTED

## 2) Decisoes Tecnicas Fechadas

1. Modelo de entrega: front e back separados
2. Backend: Node.js
3. Arquitetura backend: Clean Architecture (unica, sem misturar)
4. Estrategia de deploy: monolito
5. ORM: Prisma
6. Frontend web e PWA: React + Vite + Tailwind CSS
7. Banco de dados: PostgreSQL (Supabase como infraestrutura)
8. Storage de arquivos: Supabase Storage via S3-compatible
9. Autenticacao: servico interno (sem Supabase Auth)
10. Aplicacao stateless
11. Isolamento e seguranca multi-tenant: regra principal no app
12. RLS: opcional como camada extra (defense-in-depth), nao como base
13. Evitar dependencia de supabase-js como camada central de dados

## 3) Diretrizes de Seguranca e Isolamento

1. `tenant_id` obrigatorio nas entidades de negocio
2. JWT interno com claims de tenant e role
3. Middleware de contexto de autenticacao por request
4. Autorizacao centralizada no application layer (RBAC/ABAC)
5. Repositorios sempre escopados por tenant
6. Auditoria para operacoes criticas (status, financeiro, permissao)
7. Idempotencia em operacoes criticas (execucao, notificacao, financeiro)
8. URL assinada para upload/download no storage
9. Rate limit e politicas de seguranca na borda da API

## 4) Decisao de Arquitetura (resumo comparativo)

Escolha final: monolito com Clean Architecture.

Motivos:

1. Melhor equilibrio entre velocidade de entrega e manutencao de longo prazo
2. Menor complexidade operacional que microservicos no momento
3. Alta testabilidade e controle de regras criticas (status/financeiro/permissoes)
4. Melhor previsibilidade para evolucao incremental do produto

## 5) Modulos de Dominio (backlog base)

1. Identity & Access
2. Tenants / Imobiliarias / Branches
3. Properties
4. Appointments (maquina de estados)
5. Service Groups / Marketplace
6. Inspector Execution (start/done + geolocalizacao)
7. Tenant Confirmation (link unico)
8. Notifications (SMS/Email)
9. Billing / Ledger / Pagamentos
10. Reports / Export / Auditoria

## 6) Estrutura de Projeto (direcao inicial)

Sugestao de monorepo:

1. `apps/backend`
2. `apps/web`
3. `apps/pwa`
4. `packages/shared`

Estrutura Clean no backend:

1. `domain/`
2. `application/`
3. `infrastructure/`
4. `interfaces/`

Regra de dependencia:

1. `interfaces -> application -> domain`
2. `infrastructure` implementa portas/interfaces do nucleo

## 7) Proximo Passo Imediato

Fechar baseline para iniciar backlog sem retrabalho:

1. `docs/architecture.md`
2. `docs/domain.md`
3. `docs/api-contracts.md`
4. `docs/security.md`
5. backlog por epicos com criterios de aceite e dependencias

## 8) Assuncoes Registradas

1. Escopo funcional principal segue documento "Properfy - Escopo Tecnico Completo v2.0"
2. RLS pode ser ativado por fases apos estabilizacao do isolamento no app
3. Integracoes externas (SMS/email) serao tratadas de forma desacoplada via adapters
4. Foco inicial em MVP ponta a ponta antes de expansoes secundarias
