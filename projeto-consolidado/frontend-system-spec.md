# Properfy - Frontend System Spec

Este documento traduz o UI system atual em especificacao executavel para implementacao do novo frontend em `React + Vite + Tailwind CSS`.

Objetivo:

1. preservar a identidade visual e os padroes fortes do sistema atual
2. reduzir ambiguidade para IA ou equipe humana
3. definir o que deve ser replicado fielmente e o que pode ser reinterpretado

## 1. Diretriz geral

O novo frontend nao deve ser um redesenho livre.

Ele deve:

1. manter a linguagem visual principal do sistema atual
2. traduzir os padroes de `Vue 2 + Vuetify 2` para `React + Tailwind`
3. modernizar a implementacao sem descaracterizar a experiencia

## 2. Prioridade de fidelidade

### 2.1 Deve ser preservado quase 1:1

1. paleta principal
2. hierarquia tipografica
3. semantica dos botoes
4. semantica dos status chips
5. estrutura do header de pagina
6. comportamento visual de tabelas, tabs e dialogs
7. sidebar vertical com 75px e submenu flutuante
8. aparencia das telas de mapa e painel lateral
9. sistema visual dos filtros com notch, box-shadow e boolean filters com borda
10. paddings reais do layout (`24px` vertical, `32px` horizontal)
11. iconografia customizada de integracoes e pagamentos
12. boolean icons e estados de tabela

### 2.2 Pode ser reinterpretado tecnicamente

1. implementacao de grid e spacing
2. estrutura interna dos componentes
3. estrutura de rotas
4. forma de composicao das tabelas
5. forma de abrir modais e drawers
6. integracao com estado e fetch

### 2.3 Pode ser melhorado

1. responsividade
2. acessibilidade
3. consistencia de estados vazios
4. loading states
5. tratamento de erro
6. padronizacao de permissoes visuais

## 3. Tokens de design

### 3.1 Cores obrigatorias

```text
--color-primary: #009DD9
--color-secondary: #21566E
--color-accent: #41A69D
--color-error: #FF5252
--color-info: #00CAE3
--color-success: #4CAF50
--color-warning: #FB8C00
--color-realty: #215676
--color-real-estate: #F37A76
--color-app-bg: #F5F5F5
--color-card-bg: #FFFFFF
--color-text-primary: rgba(0,0,0,0.87)
--color-text-secondary: rgba(0,0,0,0.6)
--color-text-muted: rgb(158,158,158)
--color-text-disabled: rgba(0,0,0,0.38)
```

### 3.2 Tipografia obrigatoria

1. fonte principal: `Nunito`
2. body base: `16px`, `500`, `line-height: 24px`, `letter-spacing: 0.5px`
3. titulo de pagina: `24px`, `700`, `#21566E`
4. titulo de pagina em mobile: `20px`
5. titulo de dialog: `20px`, `500`
6. table header: `14px`, `700`
7. table body: `14px`, `400`
8. tabs: `14px`, `700`

### 3.3 Espacamento e raio

1. padding padrao de pagina: `24px 32px`
2. raio padrao de card/tabela/botao: `4px`
3. sidebar fixa: `75px`
4. modais e submenus podem usar raio `6px` ou `8px` quando isso reproduzir melhor o legado

## 4. Layout canonico

### 4.1 Shell principal

1. sidebar fixa a esquerda com `75px`
2. area principal com background `#F5F5F5`
3. padding interno padrao `24px` no eixo vertical e `32px` no horizontal
4. pages de mapa podem ajustar o fundo da sidebar para o mesmo cinza do canvas operacional

### 4.2 Estrutura de pagina padrao

1. `PageHeader`
2. `FilterBar` opcional
3. `ContentCard` ou `DataTableCard`
4. empty/loading/error state padronizado

### 4.3 Templates oficiais de pagina

1. lista com filtros + tabela
2. tabs + conteudo
3. tabela direta sem filtros
4. mapa fullscreen com painel lateral
5. board/kanban com scroll horizontal
6. lista agrupada por periodo/secao

## 5. Estados globais obrigatorios

Toda tela com dados deve possuir estados explicitos para:

1. loading inicial
2. loading parcial de acao
3. erro recuperavel
4. empty state
5. sem permissao
6. disabled/read-only
7. filtro obrigatorio ainda nao aplicado
8. colunas expandidas por toggle

Padrao esperado:

1. loading inicial: skeleton ou placeholder consistente
2. acao em progresso: botao com estado de processamento
3. erro: banner, card de erro ou snackbar com acao de retry conforme o contexto
4. empty state: mensagem curta + CTA quando aplicavel
5. sem permissao: mensagem clara sem expor opcao de acao
6. carregamento de filtros pode usar indicador circular no bloco de filtros

## 6. Regras por familia de componente

### 6.1 Header de pagina

1. titulo alinhado a esquerda
2. CTA principal alinhado a direita
3. CTA principal sempre coral
4. pode conter uma ou mais acoes no header
5. acoes secundarias podem ser outlined ou coral, dependendo da tela

### 6.2 Filtros

1. visual compacto
2. search com icone de busca
3. selects com indicador visual claro
4. filtros devem aceitar desktop-first sem perder legibilidade no tablet
5. filtros nao seguem o outlined padrao puro; usam borda simulada por sombra e label customizada
6. filtros booleanos usam container branco com borda leve e raio `4px`
7. filtros de data podem usar campo readonly com icone de calendario

### 6.3 Tabelas

1. fundo branco
2. sem sombra pesada
3. header visual leve e tipografia forte
4. acoes por linha com icones pequenos
5. chips de status padronizados
6. pagina vazia sem colapsar layout
7. algumas tabelas usam switch bar acima para revelar colunas extras
8. colunas booleanas usam icones especificos do sistema

### 6.4 Tabs

1. tab ativa azul escuro
2. slider coral
3. tabs inativas cinza
4. peso `700` em todas

### 6.5 Dialogs

1. titulo simples e funcional
2. acao primaria coral
3. acao secundaria cinza
4. fechar por `x` no topo quando fizer sentido
5. sem visual pesado ou ornamental

### 6.6 Sidebar

1. navegacao vertical compacta
2. icones como elemento principal
3. indicador lateral esquerdo no item ativo
4. submenu flutuante com glassmorphism leve
5. usuario fixado no rodape

### 6.7 Map views

1. layout de mapa em fullscreen utilitario
2. painel lateral funcional, nao decorativo
3. filtros e acoes devem parecer ferramenta operacional
4. usar drawer/card flutuante em vez de layout tradicional de dashboard
5. painel lateral de filtros deve suportar largura `480px` com animacao `translateX`

### 6.8 Board/Kanban

1. colunas representam status operacionais
2. cada coluna tem linha lateral colorida coerente com o chip do status
3. badge de contagem neutro
4. info icon cinza por coluna
5. scroll horizontal quando largura excede viewport
6. header pode incluir view-switcher board/table

### 6.9 Drawers

1. drawer estreito: `480px`
2. drawer largo: `970px`
3. o tipo de drawer depende do contexto da tela

### 6.10 Notificacoes e feedback

1. snackbar top-right para erro global
2. variante de erro em vermelho escuro do sistema
3. suporte a mensagens multiline quando necessario

## 7. Responsividade obrigatoria

O sistema legado e desktop-first. O novo frontend deve definir comportamento explicito:

### 7.1 Desktop

1. experiencia principal
2. sidebar fixa
3. tabelas completas
4. filtros em linha
5. grid de filtros prioriza distribuicao ampla em `lg`

### 7.2 Tablet

1. filtros podem quebrar em duas linhas
2. sidebar pode colapsar para drawer
3. tabelas largas devem rolar horizontalmente sem quebrar semantica
4. grid de filtros passa a duas colunas em varios cenarios

### 7.3 Mobile

1. sidebar vira drawer
2. filtros empilhados
3. tabelas podem virar cards responsivos em telas muito estreitas, exceto quando o contexto exigir tabela horizontal
4. dialogs respeitam viewport e espacos seguros
5. titulo principal reduz de `24px` para `20px`

## 8. Acessibilidade minima obrigatoria

1. contraste minimo aceitavel em texto e botoes
2. foco visivel em controles interativos
3. labels e placeholders nao substituem descricao semantica
4. icones de acao devem ter `aria-label`
5. dialog deve gerenciar foco
6. estados disabled nao podem depender so de cor

## 9. Fronteira entre design system e produto

### 9.1 Deve virar base reutilizavel

1. tokens de tema
2. tipografia
3. botoes
4. chips
5. inputs
6. tabs
7. dialogs
8. tabela base
9. sidebar shell
10. sistema de filtros
11. boolean icon
12. integration icon
13. snackbar
14. drawer variants
15. floating total bar

### 9.2 Deve ficar em camada de produto

1. tabelas especificas por dominio
2. filtros especificos por entidade
3. drawers operacionais de mapa
4. fluxos de appointment, grupo, financeiro e relatorios
5. board de appointments
6. invoice grouped tracking

## 10. Critério de aceite visual

Uma implementacao sera considerada boa se:

1. a linguagem visual for imediatamente reconhecivel como evolucao do sistema atual
2. o frontend nao parecer um template generico de Tailwind
3. os componentes base cobrirem a maior parte das paginas listadas no legado
4. os estados vazios, loading e erro estiverem padronizados
5. a adaptacao para mobile/tablet nao parecer improvisada
6. os filtros se parecerem com o sistema atual, nao com inputs padrao genericos
7. board, drawers e feedback global estiverem contemplados

## 11. Gaps fechados pela auditoria

Os seguintes pontos agora passam a ser obrigatorios na especificacao:

1. status `REJECTED` deve existir no mapa de status visual
2. status `DONE` precisa ter estilo formalizado quando usado em tabela ou chip
3. `BooleanIcon` usa `mdi-check-bold` para verdadeiro e `mdi-close-thick` para falso
4. filtros usam sistema visual proprio, nao apenas `outlined + dense`
5. existem icones SVG customizados de integracao e pagamento
6. existem templates adicionais de pagina alem de lista simples e mapa
