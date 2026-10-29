# Decisões sobre as lacunas (agentes Fable)

## Lote 1 (X00, X01, X02, X03, F00, F01, F02) — DECIDIDO pelo dev em 2026-10-28
**Aceitas todas as recomendações** marcadas como "(recomendada)" em cada `*-lacunas.md` deste lote, inclusive:
- X02-01: spike de 0,25 dia antes de codar; se a v5 não aceitar `permanent=true`, migrar só o adaptador para a v6 (+0,25).
- F02-03: a varredura também cobre entregas iniciadas e não concluídas (+0,25).
**APLICADO** em 2026-10-29: as recomendações entraram nas tarefas e foram reconciliadas entre os arquivos.

## Lote 2 (F03, F04, F05, F06, F07, F08, F09) — DECIDIDO pelo dev em 2026-10-29
**Aceitas todas as recomendações** de cada `*-lacunas.md` deste lote.
- F03: 7 decisões · F04: 9 · F05: 7 (8 títulos) · F06: 6 · F07: 9 · F08: 8 · F09: 4


**APLICADO** em 2026-10-29 (lote 2).

## Conflitos resolvidos na reconciliação (2026-10-29)
1. Plausibilidade do horário do cliente: vale a F03 D25 (−7 dias / +5 min).
2. Troca da base do inspetor: só marca o plano STALE, sem aviso à OP.
3. Fuso do plano do dia: **fuso do inspetor** (decisão do dev), registrado como exceção na regra N13 da X00.
4. Plano inviável no Dia ao Vivo: indicador na linha do inspetor, não um 8º tipo de alerta.
5. "Vou atrasar N min": **a partir do horário previsto publicado; sem plano, a partir do início da janela** (decisão do dev).
