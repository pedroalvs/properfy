# Properfy - UI System Atual (Aplicacao Legada em Producao)

Fonte: documentacao manual enviada pelo usuario em 2026-03-15

## 1. Stack tecnica

```text
Framework:        Vue.js 2.6.11
UI Framework:     Vuetify 2.x (light theme)
Build:            Vue CLI / Webpack (chunk-vendors + app bundle)
Router:           Vue Router (SPA)
Editor rich text: CKEditor 5 v35.2.1
Mapa:             Google Maps JavaScript API
Icones:           @mdi/font (Material Design Icons) via CDN
Fontes:           Google Fonts - Nunito
Analytics:        Hotjar
Monitoramento:    Sentry
```

## 2. Configuracao do Vuetify (`src/plugins/vuetify.js`)

```js
import Vue from 'vue'
import Vuetify from 'vuetify/lib'
import '@mdi/font/css/materialdesignicons.css'

Vue.use(Vuetify)

export default new Vuetify({
  icons: { iconfont: 'mdi' },
  theme: {
    themes: {
      light: {
        primary:    '#009DD9',   // Azul ciano
        secondary:  '#21566E',   // Azul petroleo
        accent:     '#41A69D',   // Verde-azulado (teal)
        error:      '#FF5252',   // Vermelho
        info:       '#00CAE3',   // Ciano claro
        success:    '#4CAF50',   // Verde
        warning:    '#FB8C00',   // Laranja
        realty:     '#215676',   // Azul escuro
        realEstate: '#F37A76',   // Coral/salmao
      }
    }
  }
})
```

## 3. Tipografia e CSS global (`src/assets/global.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap');

.v-application {
  font-family: 'Nunito', sans-serif !important;
  font-size: 16px;
  letter-spacing: 0.5px;
  line-height: 24px;
  font-weight: 500;
}

.v-application .v-btn.primary {
  background-color: #F37A76 !important;
  border-color: #F37A76 !important;
}
.v-application .v-btn.primary--text {
  color: #009DD9 !important;
}
```

## 4. Paleta completa de cores

### Cores do tema Vuetify

| Token | HEX | RGB | Uso |
|---|---|---|---|
| `primary` | `#009DD9` | `rgb(0,157,217)` | Links, inputs focados, icones ativos, confirmacao ativa |
| `secondary` | `#21566E` | `rgb(33,86,110)` | Titulos de pagina, tabs ativas, indicadores sidebar |
| `accent` | `#41A69D` | `rgb(65,166,157)` | Elementos teal |
| `error` | `#FF5252` | `rgb(255,82,82)` | Botao delete, erros |
| `info` | `#00CAE3` | `rgb(0,202,227)` | Informacoes |
| `success` | `#4CAF50` | `rgb(76,175,80)` | Booleans verdadeiros, check icons |
| `warning` | `#FB8C00` | `rgb(251,140,0)` | Status pendente |
| `realEstate` | `#F37A76` | `rgb(243,122,118)` | Botoes primarios (CTA), tab slider, action buttons |
| `realty` | `#215676` | `rgb(33,86,110)` | Sidebar active, secondary titles |

### Cores custom da aplicacao

| Uso | HEX/RGB | Classe Vuetify |
|---|---|---|
| Background app/main | `#F5F5F5` | `grey lighten-4` |
| Background cards | `#FFFFFF` | - |
| Background sidebar (map views) | `#F5F5F5` | - |
| Background submenu sidebar | `rgba(255,255,255,0.65)` + blur | - |
| Disabled button bg | `rgba(0,0,0,0.12)` | - |
| Disabled button text | `rgba(0,0,0,0.26)` | - |
| Table header text | `rgba(0,0,0,0.6)` | - |
| Body text | `rgba(0,0,0,0.87)` | - |
| Secondary/caption text | `rgb(158,158,158)` | `grey--text` |
| Empty state/disabled text | `rgba(0,0,0,0.38)` | - |
| Money positivo | `rgb(102,187,106)` | `green--text text--lighten-1` |
| Money negativo | `rgb(239,83,80)` | `red--text text--lighten-1` |

## 5. Tipografia e hierarquia

| Elemento | Classe CSS | Tamanho | Peso | Cor |
|---|---|---|---|---|
| Titulo de pagina | `h2.title__principal` | `24px` | `700` | `#21566E` |
| Titulo de dialog | `.v-card__title` | `20px` | `500` | `rgba(0,0,0,0.87)` |
| Subtitulo de secao | `h3` | `~18.72px` | `700` | `rgba(0,0,0,0.87)` |
| Label de input focado | `.v-label` | `16px` | `400` | `#009DD9` |
| Body/default | - | `16px` | `500` | `rgba(0,0,0,0.87)` |
| Table header | `th` | `14px` | `700` | `rgba(0,0,0,0.6)` |
| Table body | `td` | `14px` | `400` | `rgba(0,0,0,0.87)` |
| Caption | `.caption.grey--text` | `12px` | `400` | `rgb(158,158,158)` |
| Empty state | - | `14px` | `400` | `rgba(0,0,0,0.38)` |
| Tab ativa | `.v-tab--active` | `14px` | `700` | `#21566E` |
| Tab inativa | `.v-tab` | `14px` | `700` | `rgb(153,153,153)` |

## 6. Status chips

Todos os chips seguem o padrao: `<v-chip small label no-color [classes]>`

| Status | Classes Vuetify | Background | HEX aproximado |
|---|---|---|---|
| Active / Enabled | `primary` | `#009DD9` + texto branco | `#009DD9` |
| Scheduled | `light-blue lighten-4` | `rgb(179,229,252)` | `#B3E5FC` |
| Confirmed / Received | `green lighten-4` | `rgb(200,230,201)` | `#C8E6C9` |
| Awaiting Host / Pending | `orange lighten-4` | `rgb(255,224,178)` | `#FFE0B2` |
| Cancelled | `red lighten-4` | `rgb(255,205,210)` | `#FFCDD2` |
| Draft | `purple lighten-4` | `rgb(225,190,231)` | `#E1BEE7` |
| Disabled | default | `rgb(224,224,224)` | `#E0E0E0` |
| Code/ID chip | default | `rgb(224,224,224)` | `#E0E0E0` |

## 7. Componentes Vuetify - padroes de uso

### 7.1 Page Header

```html
<div class="d-flex align-center justify-space-between pa-6">
  <h2 class="title__principal mr-2">Appointment History</h2>
  <v-btn elevation="0" color="primary" class="white--text">
    <v-icon left>mdi-plus</v-icon>
    New item
  </v-btn>
</div>
```

Notas:

1. Titulo: `24px`, `700`, `#21566E`
2. CTA primario: coral `#F37A76`, raio `4px`, altura `36px`, sem elevacao

### 7.2 Filtros de lista

```html
<v-row class="mb-4 px-6">
  <v-col cols="3">
    <v-text-field
      v-model="search"
      outlined dense
      label="Search"
      prepend-inner-icon="mdi-magnify"
      hide-details
    />
  </v-col>
  <v-col cols="2">
    <v-select
      v-model="type"
      outlined dense
      label="Type"
      :items="types"
      hide-details
      append-icon="mdi-menu-down"
    />
  </v-col>
  <v-col cols="3">
    <v-autocomplete
      v-model="realEstate"
      outlined dense
      label="Real Estate"
      :items="realEstates"
      prepend-inner-icon="mdi-magnify"
      hide-details
    />
  </v-col>
</v-row>
```

Padrao:

1. Todos os inputs de filtro: `outlined`, `dense`, `hide-details`
2. Search com `mdi-magnify`
3. Select com `mdi-menu-down`

### 7.3 Data Table

```html
<v-data-table
  :headers="headers"
  :items="items"
  class="clickable"
  elevation="0"
  :items-per-page="20"
>
  <template #[`item.code`]="{ item }">
    <strong>{{ item.code }}</strong>
  </template>

  <template #[`item.status`]="{ item }">
    <v-chip small label :class="getStatusClass(item.status)">
      {{ item.status }}
    </v-chip>
  </template>

  <template #[`item.actions`]="{ item }">
    <v-btn icon small @click="view(item)">
      <v-icon size="18">mdi-eye</v-icon>
    </v-btn>
    <v-btn icon small @click="edit(item)">
      <v-icon size="18">mdi-pencil</v-icon>
    </v-btn>
    <v-btn icon small class="error--text" @click="deleteItem(item)">
      <v-icon size="18">mdi-delete</v-icon>
    </v-btn>
  </template>

  <template #no-data>
    <span class="text--disabled">No results</span>
  </template>
</v-data-table>
```

Padrao visual:

1. `elevation: 0`
2. `border-radius: 4px`
3. background branco
4. header `14px`, `700`, `rgba(0,0,0,0.6)`
5. acoes com icones neutros; delete em vermelho

### 7.4 Tabs

```html
<v-tabs v-model="tab" color="secondary" :slider-color="'realEstate'">
  <v-tab>Pending</v-tab>
  <v-tab>Sent</v-tab>
  <v-tab>Approved</v-tab>
</v-tabs>
<v-tabs-items v-model="tab">
  <v-tab-item>...</v-tab-item>
</v-tabs-items>
```

Padrao:

1. ativa: `#21566E`, `700`
2. inativa: `#999999`, `700`
3. slider: `#F37A76`

### 7.5 Dialog / Modal

```html
<v-dialog v-model="dialog" max-width="500" scrollable>
  <v-card>
    <v-card-title class="d-flex justify-space-between align-center">
      Create category
      <v-btn icon small @click="dialog = false">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </v-card-title>
    <v-card-text class="pt-4">
      <v-text-field
        v-model="name"
        outlined
        label="Name"
        hide-details
      />
    </v-card-text>
    <v-card-actions class="pb-4 px-6 justify-end">
      <v-btn
        large elevation="0"
        class="grey lighten-4"
        @click="dialog = false"
      >
        Cancel
      </v-btn>
      <v-btn
        large elevation="0"
        color="primary"
        @click="save"
      >
        Create category
      </v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

Padrao:

1. sombra forte padrao do Vuetify
2. titulo `20px`, `500`
3. cancel em `#F5F5F5`
4. foco do input em `#009DD9`

### 7.6 Alert / Info Banner

```html
<v-alert type="info" text class="blue--text mw-500">
  <v-icon left>mdi-information</v-icon>
  Select a client to access the movements
</v-alert>
```

Padrao:

1. variante `text`
2. sem fundo solido
3. cor azul de info

### 7.7 Sidebar Layout (`src/components/Sidebar.vue`)

```html
<aside class="sidebar" :class="`view--${$route.name}`">
  <v-list dense class="sidebar__menu">
    <div class="sidebar__logo pa-2 text-center">
      <img src="@/assets/logo.svg" width="40" />
    </div>

    <v-list-item class="px-0 my-4">
      <router-link to="/operation-map" class="sidebar__link">
        <v-icon>mdi-map-marker-radius-outline</v-icon>
        <div>Operation map</div>
      </router-link>
    </v-list-item>

    <v-list-item class="px-0 my-4">
      <div class="sidebar__link has-submenu">
        <v-icon>mdi-account-group-outline</v-icon>
        <div class="sidebar__submenu">
          <div class="sidebar__submenu-title">Users</div>
          <router-link to="/hosts" class="sidebar__submenu-link">
            <v-icon left class="sidebar__submenu-icons">mdi-badge-account-outline</v-icon>
            Hosts
          </router-link>
          <router-link to="/customers" class="sidebar__submenu-link">
            <v-icon left class="sidebar__submenu-icons">mdi-account-multiple-outline</v-icon>
            Customers
          </router-link>
        </div>
      </div>
    </v-list-item>

    <div class="sidebar__user">
      <v-btn icon block tile elevation="0">
        <v-icon>mdi-account-circle-outline</v-icon>
      </v-btn>
    </div>
  </v-list>
</aside>
```

CSS principal:

```css
.sidebar {
  position: fixed;
  z-index: 3;
  width: 75px;
  height: 100vh;
  background-color: transparent;
}
.sidebar.view--adminOperationMap,
.sidebar.view--adminGroupMap,
.sidebar.view--adminMap { background-color: #F5F5F5; }

.sidebar__menu { margin: 0; padding: 0; background-color: transparent !important; }
.sidebar__menu .v-list-item { margin: 15px 0; padding: 0; min-height: unset; }

.sidebar__link {
  display: block;
  width: 75px;
  padding: 0 5px;
  text-align: center;
  position: relative;
}
.sidebar__link i { opacity: 0.65; }

.sidebar__link.active > i,
.sidebar__link:hover > i,
.sidebar__link.router-link-active > i { opacity: 1; color: #21566E; }

.sidebar__link::before {
  content: '';
  position: absolute;
  top: -4px; left: 0;
  width: 4px;
  height: calc(100% + 8px);
  border-radius: 0 2px 2px 0;
  background-color: transparent;
}
.sidebar__link.active::before,
.sidebar__link.router-link-active::before {
  background-color: #21566E !important;
}

.sidebar__link.has-submenu::after {
  content: '';
  top: calc(50% - 4px); right: 15px;
  position: absolute;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 5px solid rgba(0,0,0,0.2);
  transition: 0.5s;
}

.sidebar__submenu {
  position: absolute;
  left: 80px; top: -13px;
  opacity: 0; visibility: hidden;
  padding: 20px 25px 15px 20px;
  border: 1px solid rgba(0,0,0,0.1);
  backdrop-filter: blur(10px);
  background-color: rgba(255,255,255,0.65);
  border-radius: 6px !important;
  box-shadow: rgba(0,0,0,0.2) -2px 6px 12px 0 !important;
  transition: 0.35s;
  z-index: 2;
  min-width: 180px;
}
.sidebar__link:hover .sidebar__submenu,
.sidebar__link.active .sidebar__submenu { opacity: 1; visibility: visible; left: 65px; }

.sidebar__submenu-link {
  display: block;
  padding: 10px 0;
  color: rgb(153,153,153) !important;
  text-decoration: none;
  cursor: pointer;
  font-size: 14px;
}
.sidebar__submenu-link.router-link-active { color: #21566E !important; font-weight: 600; }

.sidebar__submenu-link::before {
  content: '';
  position: absolute;
  top: 5px; left: -20px;
  width: 4px; height: 30px;
  background-color: transparent;
  border-radius: 0 2px 2px 0;
}
.sidebar__submenu-link.router-link-active::before { background-color: #21566E; }

.sidebar__action {
  background-color: #F37A76;
  border-radius: 8px;
}

.sidebar__user {
  bottom: 0; width: 75px;
  position: absolute;
  background-color: transparent;
  border-top: 1px solid rgba(0,0,0,0.05);
}
```

## 8. Layout principal

```html
<v-app>
  <sidebar />
  <v-main class="ml-[75px] grey lighten-4">
    <div class="pa-6">
      <!-- conteudo das paginas -->
    </div>
  </v-main>
</v-app>
```

Notas:

1. `v-main` com background `#F5F5F5`
2. padding interno `24px`

## 9. Padroes de botoes

| Tipo | Template | Estilo |
|---|---|---|
| CTA primario | `<v-btn color="primary" elevation="0">` | bg `#F37A76`, texto branco, radius `4px`, h `36px` |
| Secundario/Cancel | `<v-btn elevation="0" class="grey lighten-4">` | bg `#F5F5F5`, texto escuro |
| Outlined | `<v-btn outlined color="primary" small>` | borda `#009DD9`, texto `#009DD9`, bg transparente |
| Icon button | `<v-btn icon>` | bg transparente, cor `rgba(0,0,0,0.54)` |
| Delete icon | `<v-btn icon class="error--text">` | cor `#FF5252` |
| Toggle/Filter | `<v-btn outlined x-small class="black--text">` | x-small, outlined |
| Disabled | automatico | bg `rgba(0,0,0,0.12)`, texto `rgba(0,0,0,0.26)` |

## 10. Padrao de campos de formulario

```html
<v-text-field outlined dense label="Search" prepend-inner-icon="mdi-magnify" hide-details />
<v-select outlined dense label="Status" :items="items" hide-details />
<v-autocomplete outlined dense label="City" :items="cities" prepend-inner-icon="mdi-magnify" hide-details />

<v-text-field outlined label="Name" hide-details />

<v-checkbox v-model="filter" label="Favorites" hide-details class="ma-0 pa-0" />

<v-switch inset dense hide-details class="table-switch my-2" />
```

Padrao:

1. foco com borda e label `#009DD9`
2. filtros: `outlined + dense`
3. dialogs: `outlined` sem `dense`

## 11. Icones MDI

### Sidebar / Navegacao

```text
mdi-map-marker-radius-outline    Maps / Operation Map
mdi-office-building-marker       Group Map
mdi-map-marker-multiple          Sub-map
mdi-calendar-month               Appointments
mdi-text-box-search-outline      Disputes
mdi-account-group-outline        Users (group)
mdi-badge-account-outline        Hosts
mdi-account-multiple-outline     Customers
mdi-shield-account-outline       Legacy Users
mdi-account-file-text-outline    Docs/Reports
mdi-text-box-outline             Invoices
mdi-account-tie-outline          Service Providers
mdi-account-outline              User generico
mdi-folder-home-outline          Rent Out / Categories
mdi-label-multiple-outline       Categories
mdi-format-list-bulleted         Items List
mdi-account-hard-hat-outline     Vendors
mdi-axis-arrow                   Split Configurations
mdi-bank-outline                 Financial / Balance
mdi-book-open-variant            Refills
mdi-credit-card-sync-outline     Invoice tracking
mdi-hand-coin-outline            Charges
mdi-cash-fast                    Transfers
mdi-account-credit-card-outline  Payments
mdi-briefcase-edit-outline       Tabela de Precos
mdi-bullseye-arrow               Missions
mdi-city-variant-outline         Cities
mdi-book-edit-outline            Questionnaires
mdi-handshake-outline            Partners
mdi-bullhorn-outline             Announcements
mdi-link                         Inspection Models
mdi-frequently-asked-questions   FAQ
mdi-account-circle-outline       Perfil de usuario
```

### UI / Acoes

```text
mdi-plus
mdi-pencil
mdi-delete
mdi-eye
mdi-information-outline
mdi-dots-vertical
mdi-check-bold
mdi-close
mdi-magnify
mdi-menu-down
mdi-close-circle
mdi-filter-outline
mdi-table
mdi-arrow-right
mdi-chevron-left/right
mdi-calendar
mdi-microsoft-excel
```

## 12. Rotas e paginas

```js
const routes = [
  { path: '/operation-map', name: 'adminOperationMap' },
  { path: '/group-map', name: 'adminGroupMap' },

  { path: '/admin-appointments', name: 'adminAppointmentsList' },
  { path: '/disputes', name: 'adminDisputes' },

  { path: '/hosts', name: 'adminHosts' },
  { path: '/customers', name: 'adminCustomerList' },
  { path: '/legacy-users', name: 'legacyUsers' },
  { path: '/service-providers', name: 'serviceProviders' },

  { path: '/invoices/legacy', name: 'adminLegacyInvoices' },
  { path: '/invoices/hosts', name: 'adminHostsInvoices' },

  { path: '/categories', name: 'adminCategories' },
  { path: '/items', name: 'adminItems' },
  { path: '/vendors', name: 'adminVendors' },
  { path: '/split-configuration', name: 'adminSplitConfiguration' },

  { path: '/admin-movements', name: 'adminMovements' },
  { path: '/admin-recharge', name: 'adminRecharge' },
  { path: '/admin-charge', name: 'adminCharge' },
  { path: '/transfers', name: 'adminTransfers' },
  { path: '/payments', name: 'adminPaymentList' },
  { path: '/default-service-values', name: 'adminDefaultServiceValues' },

  { path: '/missions', name: 'adminMissions' },
  { path: '/cities', name: 'adminCities' },
  { path: '/questionnaire', name: 'adminQuestionnaire' },
  { path: '/partners', name: 'adminPartners' },
  { path: '/announcements', name: 'adminAnnouncements' },
  { path: '/inspection-models', name: 'adminInspectionModelList' },
]
```

## 13. Padroes de pagina

### Tipo A - Lista com filtros e tabela

Paginas:

1. Appointments
2. Hosts
3. Customers
4. Missions
5. Cities
6. Partners
7. Announcements
8. Questionnaires
9. Service Providers
10. Payments
11. Transfers

Estrutura:

1. Header com `h2` + botao `+ New`
2. Filtros em 1-3 linhas
3. `v-data-table`
4. Colunas com texto, chips e icones de acao
5. Paginacao nativa

### Tipo B - Lista com abas

Paginas:

1. Legacy Invoices
2. Invoice tracking for hosts
3. Refills
4. Tabela de Precos

Estrutura:

1. Header com `h2` + botao de acao
2. Tabs com slider coral
3. Conteudo em tabela ou lista agrupada

### Tipo C - Mapa

Paginas:

1. Operation Map
2. Group Map

Estrutura:

1. Sidebar cinza
2. Google Maps fullscreen
3. Painel lateral com glassmorphism
4. Filtros flutuantes
5. Botao expand coral circular

### Tipo D - Tela vazia com filtro obrigatorio

Paginas:

1. Balance
2. Disputes
3. Transfers

Estrutura:

1. `v-alert` informativo em texto
2. tabela vazia com mensagem orientativa

## 14. Observacoes de consolidacao

1. Este documento descreve o UI system atual de uma aplicacao legada em producao.
2. Ele deve ser usado como referencia visual e de padrao antes de propor migracoes ou modernizacao.
3. Em fase futura, o ideal e cruzar estes padroes com:
   - inventario real de componentes
   - tokens reutilizaveis
   - mapa de telas por modulo
