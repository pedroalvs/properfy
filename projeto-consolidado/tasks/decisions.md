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
