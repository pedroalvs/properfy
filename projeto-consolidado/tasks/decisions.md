# Decisions Log

## 2026-03-06 - Baseline de Arquitetura

1. Backend em Node.js.
2. Arquitetura Clean Architecture.
3. Modelo de deploy monolítico.
4. ORM escolhido: Prisma.
5. Frontend e PWA com React + Vite + Tailwind CSS.
6. Supabase usado apenas como infraestrutura (PostgreSQL + Storage S3-compatible).
7. Autenticação interna, sem Supabase Auth.
8. Aplicação stateless.
9. Isolamento multi-tenant implementado no app como regra principal.
10. RLS opcional, apenas como camada adicional de segurança.

## 2026-03-10 - Documento para Cliente

1. O documento de perguntas pendentes para o cliente será entregue em PDF.
2. A fonte de verdade editorial permanece em Markdown.
3. A geração do PDF será feita por HTML estilizado e exportação via Chrome headless para garantir melhor acabamento visual.

## 2026-03-23 - Compatibilidade de Contratos na Auditoria

1. O backend passa a expor aliases compatíveis para `/v1/billing/invoices*` e `PATCH /v1/financial/entries/:entryId/approve` enquanto o frontend legado React ainda consome esses caminhos.
2. A listagem de sessões ativas foi exposta em `GET /v1/auth/sessions` para suportar a tela existente de settings sem manter um 404 permanente.
3. O contrato canônico continua sendo o definido nos módulos backend/shared; aliases servem apenas como camada de compatibilidade durante a estabilização.
