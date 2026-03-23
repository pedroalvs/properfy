# TODO - Consolidacao de Escopo e Dúvidas

- [x] Revisar `escopo.md` atual
- [x] Consolidar `escopo-v2.md` alinhado às decisões técnicas
- [x] Mapear gaps e ambiguidade de produto/negócio/técnico
- [x] Criar documento de dúvidas para refinamento de backlog
- [x] Registrar riscos residuais e próximos passos

## TODO - PDF para Cliente

- [x] Revisar `regras-negocio-pendentes-cliente.md`
- [x] Reestruturar conteúdo para apresentação executiva
- [x] Gerar PDF com layout profissional
- [x] Validar artefato final para envio ao cliente

## Riscos residuais

- Escopo funcional amplo com regras financeiras ainda em aberto.
- Matriz de permissões detalhada por papel ainda não definida.
- Regras operacionais de confirmação/reagendamento/cancelamento não fechadas.

- PDF depende de renderização local consistente para preservar paginação e tipografia.

## Próximos passos

1. Validar as dúvidas abertas com stakeholders.
2. Converter respostas em histórias com critérios de aceite.
3. Planejar MVP por fluxo crítico ponta a ponta.
4. Enviar o PDF consolidado ao cliente como pauta de alinhamento.

## TODO - Auditoria Full Stack 2026-03-23

- [x] Revisar `CLAUDE.md` raiz e por stack, além de `projeto-consolidado/`
- [x] Mapear endpoints reais do backend e cruzar com specs/contratos principais
- [x] Auditar chamadas críticas do frontend web contra endpoints reais
- [x] Auditar riscos imediatos de PWA/offline/service worker
- [x] Delegar revisão paralela para `Gemini CLI` (frontend/PWA) e `Claude Code` (backend)
- [x] Corrigir inconsistências críticas de backend e contratos web/pwa de baixo risco
- [x] Executar `typecheck` backend/web/pwa e testes web direcionados

## Resultado - Auditoria Full Stack 2026-03-23

- Corrigidos aliases/contratos críticos de billing e sessão para destravar o web atual.
- Corrigido o interceptador 401 do PWA para não entrar em fluxo de refresh sobre endpoints de auth.
- Persistem gaps maiores na PWA e em formulários financeiros avançados, que exigem alinhamento estrutural de contrato/UI antes de chamar isso de production-ready.
