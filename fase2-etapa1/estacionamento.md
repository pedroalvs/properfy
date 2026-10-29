# Estacionamento — fora do escopo da Fase 2 · Etapa 1

Estes itens foram encontrados durante a análise. **Nenhum deles entra nas specs F00–F10.** Cada um só pode ser feito por pedido de mudança (§9 do contrato) ou como item técnico separado.

## Encontrados no código

| # | Achado | Evidência | Observação |
|---|---|---|---|
| 1 | Ajustes manuais (`MANUAL_ADJUSTMENT`) nunca chegam à fatura nem aos ganhos do inspetor. Isso inclui o estorno de DONE → REJECTED. | `prisma-financial-entry.repository.ts:126,393,437` | Bug financeiro latente que independe da Fase 2 → abrir issue. |
| 2 | `ServicePriceRule.bonus_rule_json` é salvo e copiado no snapshot, mas nunca avaliado. | `appointment-pricing.service.ts:25` | Decidir se é para remover ou para implementar. |
| 3 | `priorityOfferHours` e `inspectorOfferRadiusKm` nas settings da agência não são usados. | `packages/shared/src/schemas/tenant.ts:50-51` | Se a Q13 for aceita, remover o `priorityOfferHours`. |
| 4 | A OP fica presa ao tenant em `get-property`, o que contraria a CORRECTION-001. | `get-property.use-case.ts:47-53` | O F10 não pode copiar esse padrão. A correção é à parte. |
| 5 | `appointment.reject-unconfirmed` usa 19h fixas e ignora `portalCutoffHour`. | `workers.ts:295` | O F04 assume as 19h. Unificar à parte. |
| 6 | Documentação desatualizada do `InspectionAsset`. | `docs/database-schema.md`, `docs/runbooks/inspection-asset-retention.md`, `specs/008-*` | Atualizar no PR do F10 (é barato). |
| 7 | O job `inspection-execution.notify-not-started` na verdade trata "iniciou e não finalizou". | `workers.ts:260` | Renomear à parte. |
| 8 | Não existe exportação de `audit_logs`. | `audit.routes.ts:29` | O F08 só exporta o programa. |
| 9 | O `AppointmentMapPage.tsx` tem 1,5 mil linhas, e o hook mencionado no comentário (`useAppointmentMapState`) não existe. | `hooks/useMapFilterPersistence.ts` | F00 e F09 não crescem o arquivo. Refatorar à parte. |
| 10 | O `DEFAULT_MAP_FILTERS` em `useAppointmentMapData.ts:59-62` é código morto. | – | Remover à parte (ou no F00, se ficar trivial). |
| 11 | Conformidade Mapbox (geocodificação temporária gravada no banco) | `mapbox-geocoding.service.ts:14` | **Promovido a spec: [X02](X02-geocodificacao-permanente.md)**, Onda 1. |
| 12 | Auditorias antigas (`inspection.started`, `inspection.finished`, `geolocation_mismatch` do START) guardam a lat/lng do inspetor. A F03 mascara isso para CL, mas AM/OP ainda veem. | `start-inspection.use-case.ts:212` | Revisar junto com a política de retenção/erasure da auditoria (feature 020). |
| 13 | O renderer escapa HTML também no SMS (`&` vira `&amp;` nos templates SMS atuais). | `send-notification.use-case.ts` (render) | Aberto como tarefa separada ("Fix HTML escaping in SMS notification bodies"). |
| 14 | `VALID_TRANSITIONS` do shared aceita `DRAFT→SCHEDULED`, mas o `TRANSITION_RULES` do backend não tem essa transição. | `packages/shared` × `appointment-state-machine.ts` | Aberto como tarefa separada. |
| 15 | Comentários desatualizados no código e no CI (`properfy-prod`, `pages-deploy.yml`, "51 migrations", `appointment-state-machine.ts:43` "date has passed" quando a regra real é idade de 45 dias). | vários | Limpar à parte. |
| 16 | `accept-offer` não revalida a região do inspetor no aceite; só a listagem filtra por região. | `accept-offer.use-case.ts` / `prisma-service-group.repository.ts` | Possível aceite fora da região via API. Aberto como tarefa separada. |
| 17 | O CLAUDE.md afirmava "SAST mandatory in CI", mas não existe scan de SAST nem de dependências no CI. | `.github/workflows/*` | A X00 corrige o texto; criar o scan fica à parte. |
| 18 | 4 dos 7 CLAUDE.md não passam no `prettier --check`. | CLAUDE.md da raiz e de workspaces | A X00 exige o prettier só nos 3 que passam; reformatar os outros à parte. |

## Encontrados no design v3 (fora do contrato)

- Itens de manutenção a checar, fotos da inspeção sincronizadas, foto de entrada ou interfone.
- Tela "Inspection in progress" com checklist.
- Controle de chave (número, coletada, devolvida).
- Botão manual "avisar inquilino que estou a caminho".
- Desafio "relatórios devolvidos pela agência" (o conceito não existe no sistema).
- Avisos fixados.
- Redesenho da tela de ganhos.
