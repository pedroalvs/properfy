# EXECUTOR BRIEF — Feature 030 (clean slate restart)

> Coordenação: GUIA. Você só age por handoff do Guia. Ao terminar, mande o handoff "Ready for QA" para o GUIA (não peer-to-peer). QA, PR e merge passam pelo Guia + gate do Pedro.

## Estado da branch
- Branch `refactor/email` foi **revertida para develop (clean slate)** por ordem do Pedro. NADA do email está implementado. Comece do T001.
- Fonte da verdade: `spec.md` + `tasks.md` (0/36 done). Leia os dois antes de começar.

## Decisões já travadas (não re-perguntar; estão na spec)
1. Editor de corpo = HTML cru; variáveis `{{var}}` Handlebars continuam funcionando.
2. Sanitização **reject-on-save** (save valida e REJEITA script/on*/javascript: e qualquer `<img>` literal; não muta). Preview e send sanitizam (defesa em profundidade). Preview==send.
3. `bodyText` auto-derivado do HTML (multipart html+text).
4. Audit **before/after** do corpo (US4).
5. Imagens: library gerenciada (bucket público dedicado `email-assets`), upload presign→confirm com **validação por conteúdo** (sniff+decode, não MIME), placeholders `{{image:key}}` (corpo salvo NUNCA tem `<img>` literal), resolução para `<img>` no preview+envio, separação asset físico × binding lógico, max 5MB, png/jpeg/webp(+gif opcional), bloquear svg.
6. **Exclusão de imagem (regra final):** bound a ≥1 template → BLOQUEIA (`409 ASSET_IN_USE`, lista os templates). Unbound → purge REAL (storage+row) com `confirm` obrigatório **enforced no servidor** (Zod) + modal de confirmação. `everSent` NÃO bloqueia, só seleciona o texto do aviso histórico. ZERO retenção-para-sempre. Modal copy: título `Delete image?`; msg `This image is no longer used in any template, so it can be deleted. However, if this image was already included in emails that have been sent, those emails may no longer display the image correctly after deletion.`
7. Fila pg-boss (hardening crítico inline): idempotência por `Notification.id` (singletonKey), motor de retry ÚNICO (6 tentativas, backoff 15s→45s→2m→5m→15m ±10% jitter), DLQ explícito (status FAILED), visibility/expiry 5min, retenção 30d.
8. Resend: validar envio end-to-end; test-send com **allowlist de destinatário** (inbox de teste seguro) — env é COMPARTILHADO.

## Sequência
T001+ conforme tasks.md. TDD obrigatório (red→green→refactor). Rode lint/typecheck/test/build antes do handoff.

## Gotchas
- Migration: usar `prisma migrate diff` + `deploy` (não `migrate dev` — sem TTY).
- Falhas PRÉ-EXISTENTES (não são regressão): service-group (~22) e tenant-portal (1). Verifique via git stash se na dúvida.
- Ao terminar: handoff ao GUIA com checks (lint/typecheck/test/build), TODOs 100%, e lista de endpoints/mudanças (shared|backend|web|prisma).
