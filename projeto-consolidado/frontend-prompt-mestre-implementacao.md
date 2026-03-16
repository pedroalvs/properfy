# Properfy - Prompt Mestre de Implementacao do Frontend

Use este prompt para pedir implementacao do frontend a outra IA com o minimo possivel de ambiguidade.

## Prompt mestre

```text
Quero que voce implemente o frontend do Properfy seguindo estritamente os documentos do diretorio `projeto-consolidado` como fonte de verdade.

Contexto do projeto:
- Stack: React + Vite + Tailwind CSS
- Estrutura do monorepo: `apps/web`, `apps/pwa`, `packages/shared`
- O frontend novo e uma evolucao do UI system atual, nao um redesign livre
- O visual deve preservar a linguagem do sistema existente, mas com implementacao moderna
- O projeto e de producao, entao a implementacao precisa ser robusta, consistente e reutilizavel

Arquivos obrigatorios para leitura antes de qualquer codigo:
1. `projeto-consolidado/frontend-plano-consolidado.md`
2. `projeto-consolidado/frontend-decisoes-finais.md`
3. `projeto-consolidado/frontend-system-spec.md`
4. `projeto-consolidado/component-inventory.md`
5. `projeto-consolidado/layout-behavior-rules.md`
6. `projeto-consolidado/frontend-auditoria-ui-system.md`
7. `projeto-consolidado/ui-system-atual.md`

Objetivo desta execucao:
[SUBSTITUIR AQUI PELO ESCOPO DA FASE OU TELA]

Regras obrigatorias:
1. nao redesenhe a interface livremente
2. nao use componentes genericos que descaracterizem o sistema visual
3. implemente primeiro os componentes base antes de montar telas finais
4. reuse componentes do inventario sempre que possivel
5. use tokens centralizados de cor, tipografia, spacing e raio
6. respeite os estados de loading, empty, error e permission state
7. respeite a responsividade descrita no dossie
8. nao implemente Board/Kanban a menos que a tarefa mencione explicitamente
9. nao use assets SVG com branding legado sem validacao explicita
10. nao exponha payload tecnico bruto em snackbar de producao

Decisoes finais que devem ser consideradas fechadas:
1. `DONE` e `REJECTED` existem no mapa oficial de status visual
2. `TableSwitch` e opt-in por tela, nao global
3. snackbar de producao mostra mensagem amigavel e `request_id` quando houver
4. drawer possui variantes `480px` e `970px`
5. filtros devem reproduzir o estilo real auditado, nao apenas `outlined` generico

Forma de execucao esperada:
1. leia os documentos
2. resuma em poucas linhas o que voce entendeu da fase solicitada
3. liste assuncoes, se existirem
4. implemente a menor unidade correta que gere base reutilizavel
5. valide visual e funcionalmente o que foi criado
6. informe claramente o que ficou pronto e o que ainda depende de outra fase

Requisitos tecnicos de qualidade:
1. componentes controlados por props previsiveis
2. nada de hardcode de cor espalhado sem token
3. evitar duplicacao de componente base em tela isolada
4. manter separacao clara entre design system, templates e componentes de dominio
5. escrever codigo que uma equipe continuaria sem retrabalho estrutural

Formato da resposta:
1. resumo do que sera implementado
2. arquivos alterados/criados
3. componentes base criados ou reutilizados
4. assuncoes feitas
5. validacoes executadas
6. riscos residuais
```

## Como usar

Substitua a linha:

`[SUBSTITUIR AQUI PELO ESCOPO DA FASE OU TELA]`

Por algo como:

1. `Implemente a Fase 0 - Fundacao visual`
2. `Implemente a Fase 1 - Shell da aplicacao`
3. `Implemente a Fase 3 - Sistema de filtros`
4. `Implemente a tela de Appointments List usando os componentes base ja definidos`

## Prompts curtos por fase

### Fase 0

```text
Use o prompt mestre e implemente a Fase 0 - Fundacao visual do frontend do Properfy.
``` 

### Fase 1

```text
Use o prompt mestre e implemente a Fase 1 - Shell da aplicacao do frontend do Properfy.
``` 

### Fase 2

```text
Use o prompt mestre e implemente a Fase 2 - Primitive components do frontend do Properfy.
``` 

### Fase 3

```text
Use o prompt mestre e implemente a Fase 3 - Sistema de filtros do frontend do Properfy.
``` 

### Fase 4

```text
Use o prompt mestre e implemente a Fase 4 - Tabela e estados de tela do frontend do Properfy.
``` 

### Fase 5

```text
Use o prompt mestre e implemente a Fase 5 - Navegacao de conteudo e templates do frontend do Properfy.
``` 

### Fase 6

```text
Use o prompt mestre e implemente a Fase 6 - Templates especiais do frontend do Properfy, excluindo Board/Kanban se ele nao fizer parte da tarefa.
``` 

### Fase 7

```text
Use o prompt mestre e implemente a Fase 7 - Componentes de dominio do frontend do Properfy.
``` 

## Checklist de aprovacao da resposta da IA

Antes de aceitar o resultado, verifique se a IA:

1. leu os documentos corretos
2. nao reinventou o visual
3. criou base reutilizavel antes de tela final
4. respeitou os tokens e espacamentos
5. cobriu loading, empty e error states
6. nao introduziu Board/Kanban sem necessidade
7. nao trouxe branding antigo para o Properfy
8. explicou assuncoes e validacoes
