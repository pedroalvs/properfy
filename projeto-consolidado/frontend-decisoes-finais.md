# Properfy - Decisoes Finais para Implementacao do Frontend

Este documento fecha os pontos que ainda poderiam gerar ambiguidade na implementacao do frontend por IA.

Objetivo:

1. reduzir decisoes em tempo de implementacao
2. evitar desvios visuais ou funcionais
3. alinhar o frontend com o contexto real do Properfy

## 1. Mapa final de status visual

### Recomendacao

Usar o seguinte mapa visual como padrao do produto:

1. `DRAFT` -> `purple lighten-4`
2. `OPEN` ou `AWAITING_INSPECTOR` -> `orange lighten-4`
3. `SCHEDULED` -> `light-blue lighten-4`
4. `DONE` -> `green lighten-4`
5. `CANCELED` -> `red lighten-4`
6. `REJECTED` -> `deep-orange lighten-4`

### Por que

1. respeita a logica visual herdada do sistema atual
2. mantem leitura operacional imediata
3. evita colisao semantica entre `CANCELED` e `REJECTED`
4. ajuda a IA a nao improvisar cores por tela

### Regra de implementacao

1. o `StatusChip` deve usar lookup centralizado
2. nenhuma tela pode mapear status localmente
3. `DONE` e `REJECTED` passam a ser obrigatorios no design system

## 2. Board entra ou nao no escopo novo

### Recomendacao

Nao incluir o `Board/Kanban` como parte obrigatoria da primeira fase do novo frontend.

Deixar assim:

1. `BoardKanban` continua documentado
2. fica como componente/template de fase posterior
3. so entra na implementacao se o escopo funcional do Properfy exigir explicitamente

### Por que

1. o escopo principal do Properfy ja e amplo e operacional
2. board aumenta bastante a complexidade visual e comportamental
3. ele veio do legado, mas nao aparece como parte nuclear do fluxo ja fechado do Properfy
4. manter board como opcional evita scope creep e acelera a implementacao do que realmente importa

### Regra de implementacao

1. a IA nao deve implementar board por default
2. so implementar se a fase ou a historia citar board explicitamente

## 3. Quais assets SVG reaproveitar

### Recomendacao

Nao reaproveitar assets com branding legado.

Reaproveitar apenas categorias utilitarias que continuem fazendo sentido no Properfy:

1. icones de tipo de pagamento realmente usados
2. logos de integracao de terceiros realmente ativos
3. icones funcionais neutros que nao carreguem marca antiga

### Por que

1. evita contaminar o novo produto com identidade visual antiga
2. reduz risco de confusao de marca
3. diminui acoplamento a recursos que talvez nem existam no novo escopo
4. deixa a IA trabalhar com uma pasta de assets limpa e deliberada

### Regra de implementacao

1. criar um manifest de assets oficiais do Properfy
2. qualquer SVG externo ao manifest nao deve ser usado
3. se um icone legado for necessario, ele precisa ser renomeado e validado antes

## 4. Comportamento do `TableSwitch`

### Recomendacao

Manter `TableSwitch` como recurso opt-in por tela, nao como comportamento global.

Padrao recomendado:

1. fica acima da tabela
2. label padrao: `Show extra fields`
3. abre colunas secundarias ou operacionais
4. estado local da tela

### Por que

1. nem toda tabela precisa dessa complexidade
2. preserva densidade visual nas telas principais
3. evita esconder informacao importante por padrao sem criterio
4. facilita a IA implementar de forma controlada e declarativa

### Regra de implementacao

1. cada tela define explicitamente:
   1. se usa `TableSwitch`
   2. quais colunas sao basicas
   3. quais colunas sao extras
2. a `DataTable` suporta o recurso, mas nao o ativa sozinha

## 5. Snackbar tecnico com payload completo

### Recomendacao

Nao manter raw JSON tecnico completo no frontend de producao.

Padrao recomendado:

1. producao: mensagem amigavel + `request_id` ou codigo do erro
2. staging/dev: pode haver modo expandido para detalhes tecnicos
3. detalhes completos ficam em logs e observabilidade, nao no UI final

### Por que

1. o Properfy sera um produto de producao, nao um painel de debug interno
2. expor payload tecnico completo piora UX
3. pode vazar detalhes internos desnecessarios
4. o projeto ja definiu logging e observabilidade fortes, entao o frontend nao precisa carregar esse papel

### Regra de implementacao

1. `Snackbar` tem variantes `error`, `success`, `info`
2. para erro, exibir texto amigavel e identificador de rastreio quando houver
3. modo detalhado so em ambiente nao produtivo ou quando explicitamente habilitado

## 6. Resumo executivo

Decisoes finais adotadas:

1. status visuais fechados com `DONE` e `REJECTED`
2. board fora da fase inicial por default
3. assets antigos so entram se forem neutros ou ainda validos para o Properfy
4. `TableSwitch` por tela, nao global
5. snackbar tecnico bruto nao vai para producao

## 7. Regra para a proxima IA

Ao implementar frontend, a IA deve assumir este documento como fechamento oficial desses pontos.
