# Fase 2 · Etapa 1 — Paralelização do time (6 pessoas)

**Base:** dependências entre tarefas (bloco "Dependências de execução" no topo de cada tarefa em `tarefas/*-tarefas.md`) e estimativas em dias-dev, versão de 2026-10-29. A F10 está em espera e é **independente**; quando o cliente validar, ela entra na pista E.

## Resumo

| Time | Duração estimada do desenvolvimento |
|---|---|
| 1 pessoa | ~118 dias (~24 semanas) |
| 3 pessoas | ~52 dias (~10,5 semanas) |
| 4 pessoas | ~45 dias (~9 semanas) |
| **6 pessoas (este plano)** | **~35 dias (~7 semanas)** |

Somar a homologação com o cliente (~15%) e as pausas de deploy entre as ondas.

**Por que 6 pessoas rendem mais que 5:** o caminho crítico tem 43,75 dias com uma pessoa em cada tarefa. A 6ª pessoa só acelera porque trabalha **em par** com a pista A nas cinco tarefas mais longas do caminho crítico: F03-2, F04-1, F04-2, F07-1 e F08-1. A conta assume que o par faz a tarefa em ~65% do tempo, não em 50%, por causa da coordenação. Sem par, 6 pessoas não passam de ~44 dias.

**Caminho crítico com par:**

`X00 → F03-1 → [F03-2 → F04-1] → (espera F02-1) → [F04-2 → F07-1] → F07-2 → [F08-1] → F08-3 → F08-4`

`[ ]` = em par (A + A2).

## As 6 pistas

| Pista | Perfil | Papel |
|---|---|---|
| **A · Backend crítico** | Backend sênior (líder técnico) | Dono do caminho crítico: eventos de campo, roteiro/plano do dia, índice, metas |
| **A2 · Backend em par** | Backend | Par da A nas tarefas críticas; depois avisos ao inquilino (gatilhos) |
| **B · Backend de integração** | Backend | Geocodificação, inspetor, avisos/push, previsão de horário, API do Dia ao Vivo |
| **C · PWA** | Frontend mobile | E2E do PWA, app do inspetor, Tela do Dia, mapa, tour, Challenges |
| **D · Web** | Frontend web | Navegação, janela do mapa, telas admin, desempenho, metas |
| **E · Full-stack / QA** | Full-stack | Densidade (ponta a ponta), tela do Dia ao Vivo, **F10 quando liberada**, QA ponta a ponta das ondas |

## Sequência por pista (dia de início → fim)

**A · Backend crítico**

| Tarefa | Início → Fim |
|---|---|
| X00 · CLAUDE.md + versionar o plano | 0 → 1,25 |
| F03-1 · PlatformSetting, precisão, geofence | 1,25 → 4,4 |
| F03-2 · Eventos de campo *(em par com A2)* | 4,4 → 7,5 |
| F04-1 · Roteirização e otimizador *(em par com A2)* | 7,5 → 11,2 |
| *(espera a F02-1 da pista B: revisar PRs de B/C/D)* | 11,2 → 13,0 |
| F04-2 · Plano do dia, publicação, APIs, folha *(em par com A2)* | 13,0 → 19,2 |
| F07-1 · Métricas do índice *(em par com A2)* | 19,2 → 21,7 |
| F07-2 · Snapshot e API do índice | 21,7 → 24,1 |
| F08-1 · Metas e prêmios (backend) *(em par com A2)* | 24,1 → 28,7 |
| F08-2 · Acesso antecipado | 28,7 → 30,5 |

**A2 · Backend em par**

| Tarefa | Início → Fim |
|---|---|
| *(dias 0–4,4: ambientação, revisar X00/X02/F03-1, preparar o spike da Mapbox)* | 0 → 4,4 |
| F03-2, F04-1, F04-2, F07-1, F08-1 · em par com A | 4,4 → 28,7 (com as mesmas pausas) |
| F06-2 · Gatilhos dos avisos ao inquilino | 28,7 → 33,8 |

**B · Backend de integração**

| Tarefa | Início → Fim |
|---|---|
| X02-1 · Geocodificação permanente (spike v5/v6 primeiro) | 1,25 → 4,75 |
| F01-1 · Base do inspetor, heartbeat, privacidade | 4,75 → 7,75 |
| F02-1 · Avisos, push, fallback SMS — ⚠️ **bloqueia a F04-2** | 7,75 → 13,0 |
| X02-2 · Script de legado (após a X02-1 em produção) | 13,0 → 14,25 |
| *(folga: revisar os PRs de C/D; testes de integração da F02)* | 14,25 → 19,2 |
| F06-1 · Previsão de horário + templates | 19,2 → 22,7 |
| F05-1 · API do Dia ao Vivo | 22,7 → 27,9 |

**C · PWA**

| Tarefa | Início → Fim |
|---|---|
| X03 · Recuperar o E2E do PWA | 1,25 → 4,25 |
| F01-3 · Base e aviso no app, heartbeat | 7,75 → 9,5 |
| F02-3 · Service worker, push, caixa de avisos | 13,0 → 16,25 |
| F03-3 · Check-in no card, "Não consigo fazer", "Vou atrasar" | 16,25 → 19,5 |
| F04-3 · Navegação, Tela do Dia, base do dia | 19,5 → 23,25 |
| F04-4 · Mapa do roteiro + reordenação | 23,25 → 26,5 |
| F04-3b · Tour do app + E2E | 26,5 → 28,75 |
| F08-4 · Challenges no PWA + mensagens | 31,2 → 34,7 |

**D · Web**

| Tarefa | Início → Fim |
|---|---|
| X01 · Menu Dashboard + botão voltar | 1,25 → 3,5 |
| F00 · Janela do mapa | 3,5 → 6,5 |
| F01-2 · Base do inspetor no web + adoção | 7,75 → 9,0 |
| F02-2 · Tela de avisos (OP) | 13,0 → 14,75 |
| F03-4 · Bloco de execução, alerta do motivo, Platform settings | 14,75 → 16,75 |
| F04-5 · Duração do tipo de serviço + pesos da rota | 19,2 → 20,4 |
| F07-3 · Página "Inspector performance" | 24,1 → 26,4 |
| F08-3 · Metas e prêmios (web) | 28,7 → 31,2 |
| F08-5 · Relatório do programa | 31,2 → 32,5 |

**E · Full-stack / QA**

| Tarefa | Início → Fim |
|---|---|
| F09-1 · API de densidade | 7,5 → 9,2 |
| F09-2 · Camada de densidade no `/map` | 9,2 → 10,9 |
| **F10 · Anexos e mídias** (10 dias), **se o cliente liberar** | 10,9 → ~21 |
| *(sem F10: QA ponta a ponta das ondas 1–3 em iOS/Android/web, revisão de PRs)* | 10,9 → 27,9 |
| F05-2 · Tela Dia ao Vivo | 27,9 → 33,7 |
| F05-3 · Locked time + limites de alerta | 33,7 → 34,9 |

## Marcos (o que cada entrega destrava)

| Dia ~ | Marco | Destrava |
|---|---|---|
| 1,25 | **X00 mergeada** | Todas as pistas |
| 4,4 | **F03-1** (PlatformSetting) | Configurações de F04, F05, F07, F08 |
| 4,75 | **X02-1** em produção | F01, script de legado, roteiro |
| 7,5 | **F03-2** | F04-1, F09, F03-3/4 |
| 7,75 | **F01-1** | F01-2, F01-3, F02-1 |
| 13,0 | **F02-1** | **F04-2**, F02-2/3, lembrete da F03 |
| 19,2 | **F04-2** (plano do dia) | F04-3/4/5, F05, F06, F07 |
| 24,1 | **F07-2** | F07-3, F08-1 |
| 28,7 | **F08-1** | F08-2/3/4/5 |

## Atenção especial

- **A F02-1 (pista B) é o gargalo escondido:** a F04-2, que está no caminho crítico, espera por ela, e o par A + A2 fica quase 2 dias parado no dia 11. Se a F02-1 atrasar, a entrega inteira atrasa. Priorizar a revisão dela.
- **Trabalho em par:** dividir pelas fatias que a própria tarefa já separa nos passos. Exemplos: na F04-2, A faz modelo/jobs/APIs e A2 faz folha do dia/métrica/`onboarding_completed_at`; na F08-1, A faz apuração e algoritmo e A2 faz CRUD/aprovação. O PR continua **um só**, com dois autores.
- **Revisão cruzada:** todo PR do caminho crítico é revisado por quem vai consumir o contrato (C ou D).

## Pontos de conflito (coordenar entre pistas)

| Arquivo / área | Quem mexe | Regra |
|---|---|---|
| `apps/backend/prisma/schema.prisma` + migrations | A, A2, B, E | Uma migration por PR; regenerar o timestamp ao rebasear; quem merge depois rebaseia |
| `packages/shared/src/api-types.ts` | Todas | Nunca resolver conflito à mão; **regenerar** (`generate:openapi` → `generate:types`) |
| `PLATFORM_SETTINGS_REGISTRY` (F03-1) | F04, F05, F07, F08 | Só acrescentar chaves; a F03-1 entra primeiro |
| `notification-templates.ts` + templates de plataforma | F02, F03, F06 | Acrescentar no fim de cada lista; o teste de registro roda em todos os PRs |
| `Sidebar.tsx` / grupo Dashboard | X01, depois F02, F05, F07, F08 | X01 primeiro; inserir na **ordem canônica** da X01 |
| PWA `router.tsx`, `BottomNavBar.tsx`, `sw.ts` | Só a pista C | Uma pessoa concentra o PWA |
| `INSPECTOR_NOTICE_TARGET_PATTERNS` | F02, F04, F08 | Mudar a allowlist no **mesmo PR** que muda a rota |
| `role-matrix.ts` | F00, F09, F07, F08 | Só acrescentar ações; F00 primeiro |

## Ordem de merge (por onda)

1. **Onda 0:** X00
2. **Onda 1:** X02-1 ‖ X01 ‖ F00 ‖ X03 ‖ F03-1 → F01-1 → (F01-2 ‖ F01-3)
3. **Onda 2:** F03-2 → (F09-1 → F09-2) ‖ F02-1 → (F02-2 ‖ F02-3 ‖ F03-3 ‖ F03-4 ‖ X02-2)
4. **Onda 3:** F04-1 → F04-2 → (F04-5 ‖ F04-3 → F04-4 → F04-3b)
5. **Onda 4:** F06-1 → (F05-1 → F05-2 → F05-3) ‖ F06-2
6. **Onda 5:** F07-1 → F07-2 → (F07-3 ‖ F08-1) → F08-2 ‖ F08-3 → (F08-4 ‖ F08-5)

`‖` = em paralelo.

## Variações

- **4 pessoas:** sem A2 e sem E. As tarefas da E vão para B (F09-1) e D (F09-2, F05-2, F05-3). ~45 dias.
- **3 pessoas:** C e D viram uma pista de frontend única. ~52 dias.
