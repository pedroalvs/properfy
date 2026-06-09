# QA FIX — Feature 030 — UI-B1 (E2E pelo portal)

> Coordenação: GUIA. Rodada de correção FOCADA em 1 bug MAJOR de frontend achado no teste E2E pela UI. NÃO reimplemente nada além disso. Ao terminar: handoff "Ready for QA" → GUIA com checks. Sem peer-to-peer.

## O que JÁ passou no E2E pela UI (NÃO regredir)
Login AM ✅ | criar/configurar filial ✅ | salvar HTML cru (<table>/<h1 style>/<a href>/{{vars}}) ✅ | 7/7 HTML inválidos rejeitados com toast correto (script, img+onerror, javascript:, onclick, img literal, {{image:key}} inexistente, iframe) ✅ | test-send → qa@pedroalvs.com (messageId 708f0c1d) ✅

## UI-B1 (MAJOR) — botão "Images" e preview não renderizam no editor de template EMAIL
**Sintoma (QA E2E):** ao editar um template EMAIL no portal, o botão "Images" NÃO aparece na toolbar e a seção de PREVIEW também NÃO renderiza. Resultado: a library de imagens (US2) fica INACESSÍVEL pela UI — usuário não consegue inserir imagem. O botão "Send Test Email" (que o QA diz usar a MESMA condição channel===EMAIL) APARECE → inconsistência.

**Localização (confirmada por Guia):**
- apps/web/src/features/notification-templates/components/TemplateFormDrawer.tsx:202
  `onOpenImages={template?.channel === 'EMAIL' ? () => setShowImageLibrary(true) : undefined}`
- VariableInsertToolbar.tsx:28 renderiza o botão só se `onOpenImages` for truthy.

**Investigar (causa provável):**
- Por que `template?.channel === 'EMAIL'` resulta em undefined AQUI, mas o botão "Send Test Email" (supostamente mesma condição) renderiza? Verifique de QUAL variável cada um depende. Hipótese: `template` (objeto carregado) está undefined/stale neste ponto, enquanto o channel "ativo" do formulário vem de outro estado (ex: form state / channel selecionado). Use a MESMA fonte confiável de channel que o Send Test Email usa.
- Por que a SEÇÃO DE PREVIEW também não renderiza? Provável que dependa do mesmo gate quebrado. Confirme e corrija junto.

**Fix esperado:**
- Botão "Images" aparece e abre o ImageLibraryModal para templates EMAIL (em criação E edição).
- Seção de preview renderiza para EMAIL.
- Consistência: Images + Preview + Send Test Email usam a mesma condição de channel confiável.
- Adicione/estenda um teste de componente (TemplateFormDrawer/VariableInsertToolbar) que falha sem o fix e passa com ele (evita regressão).

## Ao terminar
lint/typecheck/test/build. Handoff "Ready for QA" → GUIA com arquivos alterados. Falhas pré-existentes (não regressão): service-group, tenant-portal(flaky), typecheck pwa (mapbox-gl).
Contexto p/ re-teste: filial QA c75f85e5; template INSPECTION_NOTICE EMAIL a835eda9.
