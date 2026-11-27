# Investigação O-16: aviso de distância no cartão do app

Data: 25/11/2026. Só análise, sem alterar código e sem acessar produção. Base: `develop` local (`6651c546`).

Observação de origem: `fase2-etapa1/reteste-dev-2026-11-24.md:596` (item 37) e `:647` (O-16). No INS-0120, com GPS simulado a cerca de 1 km, o check-in e o check-out pelo cartão do Today passaram sem aviso visível. O web registrou 1002 m e os selos "Outside geofence (300 m)" / "Checked out outside geofence".

---

## Resumo

1. **Check-in pelo cartão.** A spec do F03-3 manda mostrar o aviso **depois** do check-in, num snackbar: "You're {d} m from the property. Operations will see this check-in." (FR-024). O código faz isso (`AppointmentActionBar.tsx:126-129`). O snackbar, porém, é neutro (sem cor de aviso), some em **3 segundos** e não deixa nenhum rastro no cartão. As capturas do item 37 foram feitas depois e não mostram nada.
   - Conclusão mais provável: o aviso saiu e passou despercebido. Não é um defeito de lógica, mas o aviso é fraco demais para cumprir o critério 03.A2 do anexo, "o inspetor vê o aviso".
   - Não reproduzi; o passo de confirmação está em (b.4).
2. **Check-out pelo cartão.** Não há aviso de distância, e isso é **o que foi desenhado**. O anexo só pede a validação por geofence "no evento de início" (03.2 / 03.A2). A spec do F03-3 só pede o aviso no check-in. Avisar no check-out seria um acréscimo ao escopo e depende de decisão do Pedro.
3. **Tela de execução** (Start Inspection / Finish fora do cartão). O aviso aparece **antes** de confirmar, num alerta amarelo fixo, tanto no início quanto no fim (`GeoLocationCapture.tsx:76-84`). Está conforme a spec.
4. **Produção.** O F03-3 **não está em produção**: os commits `4db3de83` e `bb00ced2`, de 02/11, não estão em `origin/main`. Dá para ajustar antes da promoção.
5. **Recomendação:** opção 1. O aviso de check-in vira um snackbar de aviso, amarelo, que fica na tela até o inspetor fechar. É uma mudança só de PWA, pequena e de baixo risco, mas muda a tela e precisa da aprovação do Pedro (mock em (d)).

---

## (a) O que o escopo e a spec pedem

### Escopo (anexo, fonte da verdade): `fase2-etapa1/arquivo/anexo-I-texto-extraido.txt`

> **03.2** Validação por geofence **no evento de início**, com raio configurável pela operação - gera alerta para agendamentos marcados fora de horário e nao geram alertas para os inquilinos nesse caso. (`:104`)

> **03.A2** **Check-in** realizado fora do raio de geofence é bloqueado ou sinalizado, conforme a regra configurada pela operação. (`:124`)

O anexo trata **só do início**, ou seja, do check-in. Ele diz "bloqueado ou sinalizado" e não especifica se a sinalização é para o inspetor, para a operação ou para os dois. Não fala de check-out.

### Tarefa: `fase2-etapa1/tarefas/F03-tarefas.md`, TASK-F03-3

- **D4 (`:40`):** o padrão é FLAG (sinalizar). BLOCK é opcional. Valores de onboarding: raio 300 m, modo FLAG.
- **Escopo da tarefa (`:981`):** "Usar o raio do servidor (`geofence` no detalhe) no aviso de distância, acabando com os 200 m fixos. **Sem** pré-checagem do BLOCK no app: o servidor decide e o PWA mostra a mensagem do 422."
- **Teste do cartão (`:1026`):** "resposta `outOfRadius: true` → snackbar de aviso 'You're 640 m from the property. Operations will see this check-in.'"
- **Implementação (`:1089`):** "`GeoLocationCapture` recebe `radiusMeters` … só avisa."
- **Aceite (`:1157`):** "**03.A2 (app):** com FLAG, check-in fora do raio é aceito **e o inspetor vê o aviso**; com BLOCK, o app mostra a mensagem clara do 422 do servidor (online, no card ou na fila)."

### Spec: `specs/047-f03-3-checkin-card-actions/spec.md`

- **US (`:60`):** "With FLAG, an out-of-radius check-in is accepted and the inspector sees an informational warning."
- **Cenário 3 (`:70`):** "a check-in returns `outOfRadius: true` (FLAG) … a warning snackbar says 'You're {d} m from the property. Operations will see this check-in.' and the check-in still succeeds."
- **FR-022 (`:179`):** `GeoLocationCapture` usa o raio do servidor e avisa "You are {d} m from the property (limit {r} m). Are you at the correct location?" sem desabilitar Start/Check-in.
- **FR-024 (`:181`):** "A successful check-in with `outOfRadius: true` MUST show 'You're {d} m from the property. Operations will see this check-in.'"
- **SC-003 (`:211`):** "With FLAG, an out-of-radius check-in succeeds and the inspector sees the distance warning".

A spec não diz por quanto tempo nem com que destaque o aviso aparece. Ela diz "warning snackbar", mas não define o estilo. Também não pede nenhum aviso no check-out feito pelo cartão.

O roteiro do reteste (`roteiro-reteste-final-dev.md:105`) esperava, no item 37, que "o aviso de distância do imóvel se comporta como antes (só avisa, não bloqueia)".

---

## (b) O que o código faz hoje

### b.1 Cartão (Schedule e Today), check-in

O cartão do Schedule (`features/schedule/components/AppointmentCardActions.tsx:19`) e o cartão "Next inspection" do Today (`features/today/components/NextInspectionCard.tsx:23`) usam o mesmo componente, `AppointmentActionBar`.

1. `handleCheckIn` (`features/execution/components/AppointmentActionBar.tsx:138-152`):
   - captura a localização (`captureRequiredLocation`);
   - chama `doCheckIn`;
   - **não mostra distância antes**. Os 2 toques foram desenhados assim (D5): o cartão não tem o painel de localização.
2. `useExecutionActions.checkIn` (`features/execution/hooks/useExecutionActions.ts:37-44`) chama `useStartInspection` → `POST /v1/inspector/appointments/:id/start` (`useStartInspection.ts:61-65`) e devolve `result.data`. A resposta do servidor traz `outOfRadius` e `geolocationDistanceMeters`:
   - contrato em `packages/shared/src/schemas/responses.ts:992-1002`;
   - preenchimento em `start-inspection.use-case.ts:217-349`.
3. `doCheckIn` (`AppointmentActionBar.tsx:121-136`):
   - offline → "You're offline. Check-in saved and will sync automatically." Offline não há distância, porque a resposta é local (`useStartInspection.ts:48-58`);
   - online com `response.outOfRadius` → `showInfo("You're {d} m from the property. Operations will see this check-in.")` (`:126-129`);
   - senão → `showSuccess("Checked in at HH:MM")`.
4. `showInfo` é o `toast()` **neutro** do sonner (`hooks/useSnackbar.tsx:29`). Não usa a variante de aviso, então não fica amarelo. O `Toaster` fica no topo, centralizado, com `duration={TIMING.toastDismiss}` = **3000 ms** (`app/App.tsx:25`, `packages/frontend-standards/src/constants.ts:9`).
5. Depois do check-in, o cartão vira "In progress" / "Check out". Nada no cartão indica que o check-in foi fora do raio. Ver a captura `output/smoke-dev/final/37-checkin-in-progress.jpg`, que é local e não deve ser commitada.

**O aviso aparece quando:** o app está online, o servidor devolveu `outOfRadius: true` (o imóvel tem coordenadas, a distância é maior que o raio e o modo é FLAG ou o BLOCK caiu para FLAG) **e** o inspetor olha para o topo da tela nos 3 segundos seguintes.

**Teste existente:** `features/schedule/components/__tests__/AppointmentCard.test.tsx` verifica o texto do snackbar. O caminho está coberto; o que falta é visibilidade.

### b.2 Cartão, check-out

`handleCheckOut` (`AppointmentActionBar.tsx:154-181`):
1. lê o detalhe;
2. captura a localização;
3. chama `actions.requestCheckOut(...)` (`useExecutionActions.ts`). Os modais de sincronização e de horário vêm em seguida, e o `submit` (`:46-60`) grava DONE.

A resposta do finish traz `finishOutOfRadius` e `finishGeolocationDistanceMeters` (`responses.ts:970-990`; `finish-inspection.use-case.ts:93`), **mas o app não os lê**. Não há aviso, conforme a spec, que não pede.

### b.3 Tela de execução (`/execution/:id`)

- `ExecutionPage.tsx:171-177` passa `radiusMeters={appointment?.geofence?.radiusMeters}` ao `PreStartPanel`, e `:191-196` passa o mesmo ao `FinishingPanel`.
- `GeoLocationCapture` (`features/execution/components/GeoLocationCapture.tsx`):
  - o raio vem do servidor, e o padrão é 300 m (`PLATFORM_SETTINGS_REGISTRY`, `:19-20`, `:35`);
  - calcula a distância no aparelho (`:36-40`);
  - quando a distância passa do raio, mostra um `Alert tone="warning"` **fixo**: "You are {d} m from the property (limit {r} m). Are you at the correct location?" (`:76-84`).
- Não desabilita nada. O BLOCK é do servidor, e o 422 aparece no painel.

**O aviso aparece quando:** a localização foi capturada, o imóvel tem coordenadas e a distância calculada no aparelho é maior que o raio. Vale antes do início e antes do fim, nessa tela.

### b.4 Por que o reteste não viu, e como confirmar

- As duas capturas do item 37 (`37-checkin-in-progress.jpg`, `37-checkout-1-of-3.jpg`) mostram o cartão já em "In progress" e já em "1 of 3 done". Um toast neutro de 3 s quase certamente já tinha sumido.
- O servidor marcou `out_of_radius` (o selo no web prova isso), e o app estava "Online" (cabeçalho da captura). Então o caminho de `:126` foi percorrido, a menos que haja algo que não encontrei no código.
- **Confirmação barata, só em DEV com dados fictícios:** repetir o check-in a cerca de 1 km olhando o topo da tela nos primeiros 3 s, ou gravar um GIF. Se o toast não aparecer nem assim, aí é defeito e reabro a análise.

---

## (c) Defeito, lacuna de escopo ou comportamento desenhado?

| Ponto | Classificação | Desde quando |
|---|---|---|
| Cartão, check-in: o aviso existe, mas como toast neutro de 3 s, sem rastro no cartão | **Implementado conforme o texto da spec, mas fraco para o critério** (03.A2 "o inspetor vê o aviso"). A spec diz "warning snackbar" e o código usou o snackbar **informativo**, sem a cor de aviso. É um desvio pequeno da spec, mais um problema de UX | `4db3de83` (02/11, F03-3); extraído para `AppointmentActionBar` em `bb00ced2` (02/11, F04-3) sem mudar o comportamento |
| Cartão, sem aviso **antes** de confirmar o check-in | **Desenhado**: 2 toques (D5); o aviso pós-check-in substitui o painel de localização | 02/11 |
| Cartão, check-out sem aviso | **Desenhado, fora do escopo**: o anexo só pede o início; a spec não pede | 02/11 |
| Tela de execução, aviso antes do início e do fim | Conforme a spec | raio do servidor desde o F03-3; o componente é de 18/03 |
| Web e Live Day com os selos | Conforme o F03-4 / F05 | — |

**Produção:** nada disso está em produção. `origin/main` (`13f8f34a`, 06/11) ainda não tem o F03-3, porque `4db3de83` e `bb00ced2` não são ancestrais de `main`.

---

## (d) Opções de correção

Todas as opções abaixo mudam o que o inspetor vê. Por isso passam pelo gate de design do Pedro antes de qualquer implementação.

### Opção 1: aviso de check-in como snackbar de aviso que fica até fechar (recomendada)

- **O que muda:** em `AppointmentActionBar.tsx:126-129`, usar a variante de aviso do sonner (amarela, com ícone de alerta), que **só some quando o inspetor fecha** (botão ×) ou em 10 s. Valor a decidir; recomendo até fechar. O texto continua o da spec.
- **Arquivos:** `hooks/useSnackbar.tsx` (acrescentar `showWarning(message, { persistent })`), `AppointmentActionBar.tsx`, `AppointmentCard.test.tsx`, e talvez o `NextInspectionCard`. O PWA `CLAUDE.md` só muda se registrar a convenção nova do snackbar. São 3 ou 4 arquivos, só PWA. Sem backend, sem contrato, sem api-types.
- **Risco:** baixo. A variante existe no sonner com `richColors`, que já está ligado. O sonner anuncia pelo leitor de tela (live region).
- **Como ficaria:**

  ```
  ┌──────────────────────────────────────────────────────────────┐
  │ ⚠  You're 1,002 m from the property.                    [×]  │   ← topo, amarelo
  │    Operations will see this check-in.                        │     (variante warning)
  └──────────────────────────────────────────────────────────────┘

    Good afternoon, Lisa
    Wednesday, 25 Nov · Online
    0 of 3 done · finish ~8:11 pm
    ┌────────────────────────────────────────────────────────────┐
    │ IN PROGRESS                                   In progress  │
    │ 5 Martin Place, Sydney NSW 2000                            │
    │ …                                                          │
    │ [              Check out              ]  [⋮]               │
    └────────────────────────────────────────────────────────────┘
  ```
  O cartão fica igual a hoje.
- **O que não muda:** check-in dentro do raio ("Checked in at HH:MM", verde, 3 s); offline; BLOCK (o 422 continua como erro vermelho); a tela de execução; o web.

### Opção 2: opção 1 mais uma linha fixa no cartão em andamento

- **O que muda:** além do snackbar, o cartão em "In progress" mostra uma linha discreta "Checked in 1,002 m from the property" enquanto o check-out não for feito.
- **Tamanho:** médio.
  - A linha depende de onde vem o dado. O estado local (`ExecutionState` no IndexedDB) não guarda `outOfRadius`. Guardar exige acrescentar o campo ao estado; o schema do IndexedDB é livre, então não precisa de migração. Também exige tratar o caso de outro aparelho, em que não há estado local.
  - A alternativa seria ler o valor do servidor no agendamento e na parada do day plan, o que muda o contrato (api-types) e entra em fila com os outros PRs que regeneram o contrato.
- **Risco:** médio-baixo. Cerca de 6 a 10 arquivos.
- **Como ficaria (o cartão):**

  ```
    │ IN PROGRESS                                   In progress  │
    │ 5 Martin Place, Sydney NSW 2000                            │
    │ Window 4:00 pm – 6:30 pm · 5 min · 954 m                   │
    │ ⚠ Checked in 1,002 m from the property                     │   ← texto âmbar, pequeno
    │ [              Check out              ]  [⋮]               │
  ```
- **Por que não é a primeira:** o anexo e a spec pedem que o inspetor veja o aviso, e a opção 1 já cumpre isso com folga. A linha fixa é uma melhoria de uso além do critério.

### Opção 3: aviso também no check-out pelo cartão (decisão de escopo)

- **O que muda:** depois do finish, se a resposta trouxer `finishOutOfRadius: true`, mostrar o mesmo snackbar de aviso: "You checked out {d} m from the property. Operations will see this." Os dados já vêm na resposta (`finishOutOfRadius`, `finishGeolocationDistanceMeters`).
- **Tamanho:** pequeno, 2 ou 3 arquivos. O `submit` do `useExecutionActions` precisa devolver a resposta ao cartão.
- **Risco:** baixo.
- **Escopo:** **não está no anexo** (03.2 e 03.A2 falam só do início) nem na spec. Pela regra "só escopo; acréscimos só com decisão", fica para o Pedro decidir. Se não aprovar, vai para o estacionamento.

### Recomendação

Fazer a **opção 1** num PR só de PWA, antes da promoção do F03-3 para staging. Ela cumpre o 03.A2 e corrige o desvio do texto da spec ("warning snackbar" e não info), com o menor risco. Mantém o `CLAUDE.md` do PWA atualizado se entrar a convenção `showWarning`.

Antes de implementar, vale fazer a confirmação de (b.4) em DEV, para ter certeza de que o toast sai.

### Decisões para o Pedro

1. **Aprovar o mock da opção 1?** E por quanto tempo o aviso fica: até o inspetor fechar, ou 10 s? Recomendo até fechar.
2. **Acrescentar a linha fixa no cartão (opção 2)?** Recomendo não, por ora.
3. **Avisar também no check-out (opção 3, fora do anexo)?** Recomendo estacionar. O anexo trata só do início, e a operação já vê "Checked out outside geofence" no web.
