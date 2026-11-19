# X00 · Revisão dos CLAUDE.md (antes de tudo)

| | |
|---|---|
| **Contrato** | **Fora do Anexo I.** Decisão do dev em 2026-10-28: os CLAUDE.md estão desatualizados e precisam ser revistos **antes** de começar a implementação da Fase 2. |
| **Esforço** | **1,0 dia** (estimativa; a auditoria define o tamanho real) · dificuldade **B** |
| **Depende de** | – |
| **Bloqueia** | Todas as outras tarefas: as sessões de implementação leem esses arquivos. |
| **Status** | Pronto para spec. A auditoria detalhada fica em `tarefas/X00-tarefas.md`. |

## Objetivo

Deixar os arquivos de instrução coerentes com o código atual e com as regras definidas no planejamento da Fase 2:
- `CLAUDE.md` da raiz;
- `apps/backend/CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/pwa/CLAUDE.md` e `packages/shared/CLAUDE.md`;
- os espelhos `AGENTS.md`/`AGENT.md`, se existirem.

Assim, cada sessão que implementar uma tarefa já parte das regras certas.

## Escopo mínimo

1. **Auditoria contra o código** (`origin/develop`). Corrigir o que estiver errado ou desatualizado: estrutura de pastas, comandos, stack, rotas e navegação, padrões, testes. Exemplo: o PWA diz ter E2E Playwright funcional, mas a suíte está quebrada; isso só deixa de ser verdade quando a X03 for feita.
2. **Regras novas da Fase 2**, cada uma no CLAUDE.md certo:
   - as telas de dashboard que já existem **não são alteradas**; para qualquer mudança, perguntar ao dev; requisito novo vai para tela nova;
   - as telas de painel ficam no menu lateral, **grupo Dashboard**;
   - **todas as sub telas do web têm botão voltar** ("Back", `useGoBack`: tela anterior, senão a tela pai);
   - toda coordenada gravada vem de **geocodificação no modo permanente** (termos da Mapbox);
   - provedor de rota **Mapbox** (Matrix só para a ordem, Directions com `depart_at` por trecho), sem APIs em beta; o Google é só uma saída medida, e os termos dele proíbem mapa que não seja Google;
   - configurações de plataforma via **`PlatformSetting`** (F03), configurações por agência via `tenantSettingsSchema`;
   - entidades de plataforma **sem `tenant_id`** (exceção documentada ao §7.1) e como garantir o escopo;
   - **1 tarefa = 1 PR = 1 spec**, com os insumos em `fase2-etapa1/tarefas/`;
   - a coordenada GPS do inspetor **nunca é exposta** para os perfis CL (auditoria inclusa);
   - o PWA mantém o cache offline do plano do dia, seguindo a regra que já existe.
3. **Regra de manutenção:** cada feature da Fase 2 atualiza o CLAUDE.md do workspace que mudar, **como passo do próprio PR**. A regra entra no README do plano e no CLAUDE.md da raiz.

## Decisões tomadas (2026-10-28)

| Tema | Decisão |
|---|---|
| Versionar o plano | A pasta `fase2-etapa1/` (plano + tarefas) **entra no repositório no mesmo PR da X00**, para que worktrees e sessões do speckit leiam os arquivos. |
| `projeto-consolidado/` | As referências a documentos que não existem mais (a pasta está no `.gitignore` e só tem 2 arquivos) são **removidas** dos CLAUDE.md. |
| Afirmações falsas | Corrigir no texto dos CLAUDE.md, por exemplo "SAST mandatory in CI" (não existe). Comentários desatualizados no código e no CI vão para o estacionamento. |

## Fora do escopo

- Reescrever os arquivos inteiros ou mudar o tom e a estrutura deles: só correções e acréscimos.
- Documentar features da Fase 2 que ainda não existem. Isso é feito por cada feature, no próprio PR.

## Critérios de aceite

- Toda afirmação dos CLAUDE.md conferida na auditoria bate com `origin/develop`, ou foi corrigida.
- As regras da Fase 2 listadas acima estão presentes, cada uma no arquivo certo.
- Nenhuma regra nova contradiz outra que já existe; os conflitos ficam resolvidos e registrados no PR.

## Quebra em PRs

1 PR, só de documentação. Pela seção 16 do CLAUDE.md da raiz, mudanças em CLAUDE.md não exigem worktree; ainda assim passam por PR.
