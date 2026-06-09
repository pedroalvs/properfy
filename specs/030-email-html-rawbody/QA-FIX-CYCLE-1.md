# QA FIX — Feature 030 — Ciclo 1/2

> Coordenação: GUIA. Esta é uma rodada de CORREÇÃO de bugs (não reimplementar). Corrija SÓ os 7 bugs abaixo. A feature já está implementada (54 tasks); QA reprovou com estes itens. Ao terminar, mande o handoff "Ready for QA" para o GUIA com checks (lint/typecheck/test/build) ✅. NÃO coordene com Arquiteto/Crítico/QA direto.

## Contexto que passou no QA (NÃO mexer/regredir)
US1 HTML cru + round-trip + preview ✅ | envio real Resend → qa@pedroalvs.com ✅ | guard 403 allowlist ✅ | rejeição XSS/script/onerror/javascript: ✅ | rejeição <img> literal 422 ✅ | rejeição SVG disfarçado (content-verify) 422 ✅ | >5MB 400 ✅ | delete in-use 409 / sem confirm 400 / com confirm 200 ✅ | audit before/after ✅ | fila singletonKey+expireIn+MAX_RETRY ✅

## BLOCKERS
### B1 — EMAIL_ASSETS_PUBLIC_URL_BASE ausente do .env.example (storage=null → 500)
- emailAssetStorage fica null (container.ts:1050 exige SUPABASE_S3_ENDPOINT && EMAIL_ASSETS_PUBLIC_URL_BASE) → POST /v1/email-assets e DELETE crasham 500.
- O valor JÁ está setado no apps/backend/.env (projeto Supabase pfpjubrmzbbfioadihgh). Verifique que emailAssetStorage NÃO é null com o backend reiniciado.
- Fix: adicionar EMAIL_ASSETS_PUBLIC_URL_BASE ao apps/backend/.env.example documentando o formato `https://<project>.supabase.co/storage/v1/object/public` (sem bucket; o service appenda /{bucketName}/{storageKey}). Bucket email-assets já criado via provision-storage-buckets.ts.

### B2 — findByPlaceholderKey(null, key) crasha p/ tenantId=null (AM/OP global)
- Arquivo: apps/backend/src/modules/notification/infrastructure/prisma-email-asset.repository.ts:55
- Prisma rejeita null em lookup de composite unique key. Afeta AM/OP sem tenantId, templates globais, e o checklist P4.18 (retorna 500 em vez de 400/rejeição correta).
- Fix: usar findFirst({ where: { tenantId, placeholderKey } }) quando tenantId é null (não o composite unique findUnique).

## MAJORS
### B3 — imageBindings sempre [] no GET /v1/notification-templates
- Arquivo: apps/backend/src/modules/notification/application/use-cases/list-notification-templates.use-case.ts:84 (imageBindings: [] hardcoded)
- Bindings existem no banco mas não são retornados. Fix: JOIN/buscar os bindings ao montar a resposta.

### B4 — bodyText corrompe variáveis Handlebars em headings (uppercase)
- html-to-text converte <h1>{{tenantName}}</h1> → "HI {{TENANTNAME}}"; Handlebars é case-sensitive → variável não substitui no texto.
- Fix: configurar html-to-text para NÃO uppercasear headings (ex: opção de formatação do h1), ou pós-processar para preservar os {{vars}} originais.

### B5 — Pipeline test-send ≠ send-notification (sem resolução de imagem/sanitizeForRender)
- Arquivo: apps/backend/src/modules/notification/application/use-cases/send-test-notification.use-case.ts
- Não chama o resolver de imagem + htmlSanitizer.sanitizeForRender() → {{image:key}} aparece LITERAL no email de teste.
- Fix: extrair o pipeline render (image-resolve → Handlebars → sanitizeForRender → html-to-text) para um helper compartilhado e usar tanto no send-notification quanto no send-test-notification. Test-send deve produzir email idêntico ao envio real.

## MINORS
### B6 — 409 ASSET_IN_USE sem details.usages
- Incluir os templateIds/placeholders no details do erro 409 (não só a contagem).

### B7 — cron retry-poll não removido conforme plano
- Funcional, mas diverge do design (motor de retry único). Remova o cron retry-poll redundante OU, se ele É o motor único, documente claramente e remova a duplicação. Alinhe com a decisão de fila (worker self-reschedule como motor único).

## Ao terminar
Rode lint/typecheck/test/build. Confirme: nenhuma regressão nos itens que passaram; B1-B7 corrigidos. Handoff "Ready for QA" → GUIA com checks + lista de arquivos alterados. Falhas pré-existentes (NÃO regressão): service-group, tenant-portal, 1 flaky, typecheck pwa (mapbox-gl ausente).
