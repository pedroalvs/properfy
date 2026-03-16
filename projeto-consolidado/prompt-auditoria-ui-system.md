# Prompt - Auditoria do UI System Atual

Use este prompt em outra IA para auditar a aplicacao atual em producao e verificar se a documentacao consolidada reflete corretamente o sistema existente.

## Prompt sugerido

```text
Quero que voce faca uma auditoria detalhada do frontend atual da aplicacao em producao e compare com a documentacao consolidada que preparei.

Objetivo:
1. verificar o que esta fielmente documentado
2. identificar o que esta faltando
3. identificar o que esta incorreto ou superficial
4. apontar padroes visuais e comportamentais que ainda nao foram capturados
5. preparar uma base mais confiavel para reimplementar esse frontend em React + Vite + Tailwind CSS

Contexto:
- O sistema atual e uma SPA em Vue 2 + Vuetify 2
- Estou usando uma IA para documentar e depois reimplementar o frontend
- Eu preciso de uma analise fria, tecnica e especifica
- Nao quero elogio generico; quero gaps, inconsistencias e evidencias

Arquivos de referencia que voce deve usar como fonte inicial:
1. `projeto-consolidado/ui-system-atual.md`
2. `projeto-consolidado/frontend-system-spec.md`
3. `projeto-consolidado/component-inventory.md`
4. `projeto-consolidado/layout-behavior-rules.md`

Tarefa:
1. leia a documentacao
2. navegue no app atual ou revise os arquivos-fonte disponiveis
3. compare implementacao real vs documentacao
4. liste os achados por severidade
5. sempre que possivel, cite pagina, rota, componente ou trecho de codigo

Quero a resposta organizada assim:

## 1. Itens corretos e bem documentados
- liste o que esta bem capturado

## 2. Itens faltando na documentacao
- componentes ausentes
- estados de tela nao documentados
- comportamentos responsivos nao descritos
- variacoes de layout ou interacao faltantes

## 3. Itens incorretos ou imprecisos
- qualquer token, comportamento ou padrao descrito de forma errada

## 4. Inventario adicional recomendado
- novos componentes base que deveriam entrar no design system
- novos patterns de layout
- novos patterns de estado

## 5. Riscos para reimplementacao
- pontos que podem gerar uma reimplementacao visualmente parecida, mas funcionalmente errada

## 6. Recomendacoes para fortalecer a especificacao
- o que eu deveria adicionar antes de pedir para uma IA implementar

Regras:
1. seja especifico
2. nao invente comportamento sem evidencias
3. quando inferir algo, deixe claro que e inferencia
4. priorize gaps que impactam diretamente a qualidade de uma reimplementacao
5. se encontrar diferencas entre paginas parecidas, destaque isso

Se houver acesso ao codigo, eu quero referencias por arquivo.
Se houver acesso visual ao app, eu quero referencias por rota/tela/componente visivel.
```

## O que pedir junto para melhorar o resultado

Se voce for acionar outra IA com acesso ao app ou ao codigo, envie junto:

1. lista de rotas principais
2. screenshots das telas principais
3. arquivos de layout base
4. componentes compartilhados mais usados
5. qualquer CSS global relevante

## Resultado esperado

O ideal e receber uma resposta que permita:

1. revisar a documentacao atual
2. fechar os gaps de design system
3. gerar backlog de frontend com mais confianca
4. reduzir o risco de uma reimplementacao generica ou imprecisa
