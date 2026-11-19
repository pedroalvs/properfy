# X03 · Recuperar a suíte E2E do PWA

| | |
|---|---|
| **Contrato** | **Fora do Anexo I.** Decisão do dev em 2026-10-28: o critério 00.A1 (tour do app) precisa ser provado por E2E, e a suíte E2E do PWA está quebrada no repositório inteiro. |
| **Esforço** | **3,0 dias** (2,5 → 3,0 em 2026-10-29 pelas lacunas L-X03; detalhe em `tarefas/X03-tarefas.md` "Dias"; a causa ainda não foi isolada, ver Riscos) · dificuldade **M** |
| **Depende de** | – |
| **Bloqueia** | F04-3b (tour, critério 00.A1 por E2E) |
| **Status** | Pronto para spec, com uma etapa de diagnóstico no início. |

## Objetivo

Deixar a suíte Playwright mobile do PWA (`apps/pwa/tests/e2e`) **verde e confiável** no `develop` e no CI. Assim o E2E volta a ser um gate real e o tour da F04-3b pode ser provado por E2E.

## Estado atual

Memória `project_pwa_e2e_suite_broken_vacuous`, verificada em 2026-10-17 @1bad8154:

- **Todas as specs falham do mesmo jeito (56/56) num `origin/develop` limpo:** o shell do app nunca renderiza, e `getByTestId('login-form')` estoura o timeout em `apps/pwa/tests/e2e/auth.spec.ts:9`.
- **As specs não usam backend:** a API é mockada via `page.route` e elas rodam contra `pnpm dev`. A causa provável é um env do dev server do Vite que falta, ou um crash no carregamento sob o harness.
- **O gate não protege nada hoje:** o job de CI "pwa Playwright mobile e2e" não cobre comportamento algum.

## Escopo mínimo

| Item | O que fazer | Dif. | Dias |
|---|---|---|---|
| Diagnóstico | Reproduzir a falha em worktree limpo. Capturar o console e a rede do browser no Playwright (trace) e achar a causa raiz do shell não renderizar. Candidatos: env `VITE_*` ausente, SW/vite-plugin-pwa em dev, mudança de bootstrap (auth "The Round", two-pane), mocks `page.route` desatualizados. | M | 0,75 |
| Correção | Corrigir a causa raiz no harness (config Playwright, env de teste, mocks). Só mexer em código do app se o bug for real, e nesse caso com teste. Os mocks de API voltam a seguir os contratos atuais. | M | 0,75 |
| Specs quebradas por drift | Atualizar as specs cujas asserções ficaram desatualizadas por mudanças de UI legítimas (perfil em tiles, marketplace map+list, auth). **Não** criar specs novas. Uma spec que não fizer mais sentido é removida com justificativa. | B | 0,25 |
| CI | **O job de E2E do PWA não existe no CI** (auditoria da X00, 2026-10-28): criar o job (+0,25). Garantir que ele roda e falha de verdade (sanity: quebrar uma asserção de propósito localmente e ver ficar vermelho). Atualizar a memória e o README de testes. | B | 0,25 |

## Decisões tomadas (2026-10-28)

| Tema | Decisão |
|---|---|
| Navegadores no CI | **Chromium + WebKit** (os 4 projetos), com retries e trace no CI. |
| Servidor de teste | Nada de reaproveitar um servidor que já esteja rodando. Usar `reuseExistingServer: false` ou uma porta por worktree. |
| Modelo de gate (2026-10-29, L-X03-01) | Merge em `develop`/`staging`/`main` **não tem check obrigatório** (sem branch protection; o ruleset "Basic Security" não tem `required_status_checks`). O gate efetivo é o **deploy**: `frontend-deploy.yml` e `fly-deploy.yml` exigem o CI inteiro verde (`workflow_run.conclusion == 'success'`). Logo, o job `test-pwa-e2e` **bloqueia deploy desde o primeiro merge** e nasce hard. Promover a check de merge (`required_status_checks`) é ação de admin, fora desta tarefa. |
| Kill switch (2026-10-29, L-X03-01) | `continue-on-error: ${{ vars.PWA_E2E_ADVISORY == 'true' }}` (variável de repositório; ausente = hard), com runbook no `apps/pwa/CLAUDE.md` §10. Nenhum critério de aceite vale com a variável ligada. |
| Flake é falha (2026-10-29, L-X03-02) | `failOnFlakyTests: !!process.env.CI` na config (mantém `retries: 2` para o trace do 1º retry) e reporter JSON (`test-results/e2e.json`) com `stats.flaky` como evidência. |

## Fora do escopo

- Ampliar a cobertura E2E das features da Fase 2. Cada feature decide os próprios testes; a F04-3b passa a usar E2E para o tour.
- Trocar de ferramenta (Playwright continua).

## Critérios de aceite

- `pnpm --filter pwa test:e2e` (ou o comando equivalente da suíte) passa 100% no `develop` limpo, localmente e no CI.
- Uma asserção quebrada de propósito deixa o job vermelho (conclusão `failure`, com `PWA_E2E_ADVISORY` ausente), provando que o gate não é vazio.
- No CI, um teste que só passa no retry deixa o job vermelho (`failOnFlakyTests`; `stats.flaky === 0` no `e2e.json`).
- A causa raiz fica documentada no PR.

## Riscos

- **Deploy travado por flake (L-X03-01):** como os deploys exigem o CI inteiro verde, um flake (sobretudo WebKit) em `develop` trava o deploy de DEV. Rollback sem PR: `PWA_E2E_ADVISORY=true`, issue e correção na causa.
- **Estimativa incerta:** os 3,0 dias valem para uma causa de harness/env. Se a causa for um bug real de bootstrap do app, reestimar depois do diagnóstico e avisar.
- **Encaixe na sequência:** deve entrar **antes da F04-3b**. Dá para fazer em paralelo com qualquer onda.

## Quebra em PRs

1 PR (pwa, testes + config).
