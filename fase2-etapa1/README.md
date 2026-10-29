# Fase 2 · Etapa 1 — Plano de Desenvolvimento

**Contrato:** Anexo I "O campo equipado" (entregas 00, 01, 03, D, E, C).
**Código verificado em:** `origin/develop` @ `042a9674` (2026-10-27).
**Para quem:** o dev que vai escrever as specs. Cada arquivo `F##` vira **uma spec** (em inglês, via `speckit.specify`).

## Regras do dev (2026-10-27)

- **Os CLAUDE.md são atualizados antes de tudo (X00),** e cada feature atualiza o CLAUDE.md do workspace que mudar, como passo do próprio PR.

- **As telas de dashboard que já existem no web não são alteradas.** Se for preciso mexer nelas, perguntar explicitamente. Requisitos novos vão para telas novas.
- As telas novas de painel ficam no **menu lateral, grupo Dashboard** (ver X01).
- **Todas as sub telas têm botão voltar** no canto superior esquerdo (X01).

## Princípio deste plano

**É o mínimo que atende ao critério de aceite do contrato com boa UX.** O plano não inclui nada além disso.

- Quando o texto de um item pede mais do que o critério de aceite testa, constrói-se a leitura mínima. A diferença fica registrada em [decisoes.md](decisoes.md).
- Sempre se reusa o que já existe (padrões, portas, componentes) antes de criar algo novo.
- O design **"Properfy Inspector App v3.pdf"** é a referência de layout do app do inspetor. Os elementos dele que não estão no contrato **não** são construídos (lista abaixo).

## Status do detalhamento

| Feature | Status |
|---|---|
| F00 | ✅ decisões fechadas (2026-10-27) |
| F01 | ✅ decisões fechadas (2026-10-27) |
| F02 | ✅ decisões fechadas (2026-10-27) |
| F03 | ✅ decisões fechadas (2026-10-27) |
| F04 | ✅ decisões fechadas (2026-10-27) |
| F05 | ✅ decisões fechadas (2026-10-27) |
| F06 | ✅ decisões fechadas (2026-10-27) |
| X01 | ✅ decisões fechadas (2026-10-27) — fora do contrato |
| X02 | ✅ pronto para spec — fora do contrato, conformidade Mapbox, antes das features de mapa |
| X03 | ✅ pronto para spec — fora do contrato, E2E do PWA, antes da F04-3b |
| F07 | ✅ decisões fechadas (2026-10-27) |
| F08 | ✅ decisões fechadas (2026-10-27). ⚠️ Q12 (bônus fora do financeiro) aguarda confirmação do cliente |
| F09 | ✅ decisões fechadas (2026-10-27) |
| F10 | ⏸️ em espera: a parte de imagens e arquivos será revista após uma validação do cliente; as decisões atuais são provisórias |

## Mapa de features

Esforço em **dias-dev**: 1 dev full-stack, incluindo TDD, revisão e PR, mas **sem** homologação com o cliente. Dificuldade: **B** baixa · **M** média · **A** alta.

| Feature | Códigos do contrato | Dificuldade | Dias | Depende de |
|---|---|---|---|---|
| [F00 · Janela de período do mapa](F00-janela-periodo-mapa.md) | E.1, E.2 | B | 3,0 | – |
| [F01 · Fundações do inspetor](F01-fundacoes-inspetor.md) | 00.3, 00.4, 00.10 | M | 6,0 | X02 |
| [F02 · Avisos da operação + push + SMS](F02-avisos-push-sms.md) | 00.6, 00.9 | A | 10,25 | F01 |
| [F03 · Eventos de campo](F03-eventos-de-campo.md) | 00.7, 00.8, 03.1, 03.2, 03.3, 03.16 | M | 13,125 | F02 |
| [F04 · Plano do dia e roteiro](F04-plano-do-dia-roteiro.md) | 00.1, 00.2 (tour), 00.5, 01.1–01.7, 01.14 | A | 25,75 | F01, F02, F03, X03 (tour) |
| [F05 · Dia ao Vivo (operação)](F05-dia-ao-vivo.md) | 01.8 (+ rotas em tempo real da D), 01.9, 01.11, 01.13, limites de alerta | M | 12,25 | F03, F04, X01 |
| [F06 · Avisos de horário ao inquilino](F06-avisos-horario-inquilino.md) | 01.10, 01.12, 01.12-B | M | 8,625 | F04 |
| [F07 · Índice de confiabilidade](F07-indice-confiabilidade.md) | 03.4, 03.5, 03.11, 03.12 | A | 8,625 | F03, F04, X01 |
| [F08 · Metas e recompensas](F08-metas-recompensas.md) | 03.6–03.10, 03.13–03.15, 03.17 | A | 16,125 | F07, F02, X01 |
| [F09 · Densidade no mapa](F09-densidade-mapa.md) | D.1–D.4 | M | 3,4 | F03 |
| [F10 · Anexos e mídias](F10-anexos-midias.md) | C.1–C.9 + fotos do inquilino | M/A | 10,0 | – |
| [X00 · Revisão dos CLAUDE.md](X00-claude-md.md) — **fora do contrato**, antes de tudo | – | B | 1,25 | – |
| [X01 · Navegação do web](X01-navegacao-web.md) — **fora do contrato** (pedido do dev) | – | B | 2,25 | – |
| [X02 · Geocodificação permanente](X02-geocodificacao-permanente.md) — **fora do contrato** (conformidade Mapbox) | – | B/M | 4,75 | – |
| [X03 · Recuperar E2E do PWA](X03-e2e-pwa.md) — **fora do contrato** (decisão do dev para provar o tour) | – | M | 3,0 | – |
| **Total de desenvolvimento** | | | **128,4** (117,15 do contrato, incluindo a F10 em espera com 10,0, + 11,25 dos itens X00–X03) | |
| Homologação e ajustes (~15%) | | | ~19 | |
| **Total estimado** | | | **~148 dias-dev** (±20%; homologação ~15%) | |

O código `01.12-B` segue a recomendação Q4. O "cancelamento" (Q1) foi decidido como liberação automática via REJECTED (ver F03).

## Ordem de execução (ondas)

```
Onda 0  X00 (CLAUDE.md atualizados antes de qualquer implementação)
Onda 1  X02 → X01 ─ F00 ─ F01     (X02 primeiro: conformidade antes das features de mapa)
        F10 ⏸️  independente, mas só começa depois da validação do cliente
Onda 2  F02 → F03          X03 (E2E do PWA) em paralelo, antes da F04-3b
Onda 3  F04
Onda 4  F05 ─ F06 ─ F09
Onda 5  F07 → F08
```

**Grafo de dependências:**

```
F01 ─> F02 ─> F03 ─┬─> F04 ─┬─> F05
                   │        ├─> F06
                   │        └─> F07 ─> F08 (também usa F02)
                   └─> F09
F00, F10: independentes
```

**Por que esta ordem:**
- **F00** é o ganho mais rápido e não depende de nada (o contrato diz que E depende de 01, mas não é verdade — ver Q6).
- **F01 a F03** criam o que todo o resto consome: endereço-base, canal com o inspetor e eventos de campo.
- **F04** é o maior risco técnico e o coração da 01.
- **F07 e F08** dependem de dados de eventos acumulados, e o índice precisa de histórico.

## Entregas do contrato × features (para a homologação)

| Entrega do contrato | Features | Pode homologar após |
|---|---|---|
| 00 — App do inspetor | F01, F02, F03 (00.7, 00.8), F04 (00.1, 00.2, 00.5) | Onda 3 |
| 01 — Roteiro e tempo real | F04, F05 (inclui 01.13), F06 | Onda 4 |
| 03 — Registro, metas e ranking | F03 (03.1–03.3, 03.16), F07, F08 | Onda 5 |
| D — Mapa de densidade | F09 | Onda 4 |
| E — Recorte de período | F00 | Onda 1 |
| C — Mídias | F10 | Quando F10 terminar |

**Atenção:** a entrega 00 tem o critério 00.A5 ("endereço-base consumido pela 01"). Na prática, ela só é aceitável depois de F04.

## O que mudou no sistema desde a análise inicial (2026-10-01 → 2026-10-27)

| Mudança | Impacto no plano |
|---|---|
| #1293: rejeitar/cancelar **um** appointment agora desvincula o grupo e libera o inspetor | Simplifica o Q1: a OP já tem a ferramenta para tirar o inspetor de um único serviço. |
| #1299/#1302: o mapa de ofertas do PWA tem pins numerados e uma linha entre paradas (reta, na ordem do `appointment_number`) | F04 reusa os hooks (`useMapboxInstance`, `useOfferRoute`, `markers.ts`), generalizando-os para `apps/pwa/src/lib/map/`. |
| #1298: o perfil do PWA virou uma grade de tiles; não existe aba "More" | F01/F02 encaixam endereço-base, avisos e push nas sub-rotas de `/profile`. A troca da navegação para Today/Schedule/Offers/More fica em F04. |
| #1303: a nota do inquilino já aparece no detalhe do PWA | O item 7 do estacionamento antigo está resolvido. |
| `appointment.reject-unconfirmed` roda às **19h fixas** (ignora `portalCutoffHour`) | A publicação do plano do dia (F04) acontece depois desse job; o horário fixo foi registrado em Q9. |
| `AuditService` foi movido para `shared/domain/audit.ts`; Prisma 6; Node 24 | Só muda caminhos de import. Migrations seguem o formato `YYYYMMDDhhmmss_nome`. |
| Inspetores recebem 5 e-mails (incluindo `INSPECTOR_GROUP_JOBS_ADDED` e `REGION_DEACTIVATED`), não 3 | Sem impacto de escopo. |

## Design v3 — o que usar e o que NÃO construir

**Usar como referência de layout:**
- Tela do Dia: próxima inspeção, horário previsto, "coming up", "View and reorder".
- Lista "Today's route" com reordenação.
- Check in / Check out.
- Fluxo "Can't get in" com motivos.
- Announcements (avisos).
- Challenges.
- Aba "More".

**Fora do contrato — não construir:**
- maintenance items (itens de manutenção a checar);
- fotos sincronizadas da inspeção;
- foto de entrada/interfone;
- "Inspection in progress" com checklist;
- controle de chave (Key #, coletada/devolvida);
- "Quality reports sent back by agencies" (esse conceito não existe no sistema);
- botão manual "Send tenant an 'on the way' text" (o contrato pede aviso **automático**);
- Earnings redesenhado (já existe; não faz parte do escopo);
- "Pinned" nos avisos.

Os valores e números do design são de exemplo.

## Blocos transversais (onde cada um nasce)

| Bloco | Nasce em | Reusado por |
|---|---|---|
| Endereço-base geocodificado do inspetor | F01 | F04, F06 |
| Caixa de avisos + push + fallback SMS | F02 | F03, F04, F08 |
| Evento de campo (`InspectorFieldEvent`) + flags da execução | F03 | F05, F07, F09 |
| `PlatformSetting` (config de plataforma auditada) | F03 | F04, F05, F07, F08, F10 |
| Duração por tipo de serviço + `DayPlan` | F04 | F05, F06, F07 |
| `Attachment` | F10 | – |

**Regra multi-tenant:** `DayPlan`, `InspectorNotice`, `PlatformSetting`, snapshots do índice, metas e prêmios **não têm `tenant_id`**, porque o inspetor é cross-tenant (precedente: `Inspector`, `ServiceRegion` global, `IntegrationSetting`). Cada spec precisa registrar essa exceção ao §7.1 do CLAUDE.md. `Attachment` e o endpoint de densidade **são** escopados por tenant.

## Como transformar cada F## em spec

1. **Antes de escrever:** resolver as decisões listadas no cabeçalho da feature (ver [decisoes.md](decisoes.md)). Se uma decisão continuar pendente, a spec assume a recomendação e a registra como premissa.
2. **Escrever a spec:**
   - Rodar `speckit.specify` com o arquivo F## como insumo. Spec em inglês.
   - Os critérios de aceite da spec **incluem os do contrato** (`xx.A#`) com o mesmo código, para facilitar a homologação.
   - Seguir a "Quebra em PRs" da feature: worktree a partir de `develop`, TDD, até 150 arquivos por PR, empilhando backend → shared → web/PWA.
3. **Qualquer coisa fora da coluna "Escopo mínimo"** vai para [estacionamento.md](estacionamento.md), nunca para a spec.

## Tarefas (1 tarefa = 1 PR)

Cada feature é quebrada em `tarefas/<ID>-tarefas.md`. **1 tarefa = 1 PR**, e cada tarefa é **autocontida e com o máximo de detalhe**: modelo de dados, contratos, estados de UI, textos, casos de borda, casos de teste e deploy. Elas são o insumo do `speckit.specify`, que gera as specs reais (em inglês). A quebra é feita por subagentes, onda a onda, e revisada no final.

| Onda | Arquivos |
|---|---|
| 0 | X00 (auditoria dos CLAUDE.md): ✅ 76 correções + 12 regras novas + 16 conflitos resolvidos; versiona a pasta `fase2-etapa1/` |
| 1 | X02, X01, F00, F01: ✅ quebradas, revisadas e ajustadas (2026-10-27) |
| 2 | F02, F03: ✅ quebradas, revisadas e ajustadas (2026-10-28) |
| 3 | F04: ✅ quebrada (Partes A e B), revisada e ajustada (2026-10-28) |
| 4 | F05, F06, F09 + X03: ✅ quebradas, revisadas e ajustadas (2026-10-28) |
| 5 | F07, F08: ✅ quebradas, revisadas e ajustadas (2026-10-28) |
| ⏸️ | F10 (aguardando o cliente) |

## Revisão de lacunas (2026-10-28/29)

Cada conjunto de tarefas passou por um agente revisor (Fable) que procurou lacunas de detalhamento e de regra. O resultado está em `tarefas/lacunas/`, com 155 lacunas no total. O dev aceitou todas as recomendações (`tarefas/lacunas/_decisoes-lacunas.md`). Elas foram aplicadas nas tarefas e depois reconciliadas entre os arquivos, com 5 conflitos resolvidos. Os totais acima já refletem isso. Quando o campo "Esforço" de um plano divergir, **vale a tabela deste README**.

## Arquivos

- [paralelizacao.md](paralelizacao.md) — como dividir as tarefas entre pessoas do time (pistas, caminho crítico, marcos, conflitos).
- [cronograma-sprints.md](cronograma-sprints.md) — entregas por sprint semanal (4 sprints, 04/11 → 01/12) para o cliente (só a versão do cliente; premissas internas em paralelizacao.md).
- [decisoes.md](decisoes.md) — decisões pendentes (cliente/comercial/onboarding), com recomendação e impacto.
- `F00`…`F10` — uma feature por arquivo.
- `X01` — navegação do web (fora do contrato, pedido do dev).
- `X02` — geocodificação permanente (fora do contrato, conformidade Mapbox).
- [estacionamento.md](estacionamento.md) — achados fora do escopo.
- `arquivo/analise-inicial-2026-10-01.md` — análise original (histórico).
