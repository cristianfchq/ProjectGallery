# Diagrama UML — Sport Style Catalog

## Diagrama de Clases (PlantUML)

Copia el bloque siguiente en https://www.plantuml.com/plantuml/uml/ para ver el diagrama renderizado.

```plantuml
@startuml SportStyleCatalog

skinparam backgroundColor #f8faff
skinparam classBackgroundColor #ffffff
skinparam classBorderColor #667eea
skinparam classArrowColor #764ba2
skinparam classFontStyle bold
skinparam noteFontSize 11

title Sport Style Catalog — Diagrama de Clases (OOP + SOLID)

' ─────────────────────────────────────────
' INTERFACES / TIPOS DE DATOS
' ─────────────────────────────────────────

class Product <<interface>> {
  + id        : string
  + name      : string
  + price     : string
  + image     : string
  + category  : string
  + description: string
}

class StoreConfig <<interface>> {
  + name     : string
  + tagline  : string
  + whatsapp : string
}

class Config <<interface>> {
  + store      : StoreConfig
  + categories : string[]
}

' ─────────────────────────────────────────
' CAPA DE DATOS (Infraestructura)
' ─────────────────────────────────────────

class ConfigLoader {
  - path : string
  --
  + ConfigLoader(path?: string)
  + load() : Promise<Config>
}

class DataLoader {
  --
  + loadCategory(name: string) : Promise<Product[]>
  + loadAll(names: string[])   : Promise<Product[]>
}

note right of DataLoader
  Usa Promise.allSettled() para tolerar
  errores en categorías individuales.
  Si falla un JSON, el resto carga igual.
end note

' ─────────────────────────────────────────
' CAPA DE PRESENTACIÓN — Managers de UI
' ─────────────────────────────────────────

class ThemeManager {
  - {static} KEY : string
  - current : string
  --
  + ThemeManager()
  + init() : void
  - toggle() : void
  - apply(theme: string) : void
}

note right of ThemeManager
  Persiste el tema en localStorage.
  Cambia data-theme en <html>.
end note

class ShareManager {
  - platforms : Platform[]
  --
  + open(platformId: string, product: Product) : void
  + buildHTML() : string
}

class Modal {
  - share   : ShareManager
  - wa      : string
  - overlay : HTMLElement
  - content : HTMLElement
  --
  + Modal(share: ShareManager, waNumber: string)
  + open(product: Product) : void
  + close() : void
  - bindGlobal() : void
}

class ProductRenderer {
  - modal   : Modal
  - onCount : Function
  --
  + ProductRenderer(modal: Modal, onCount: Function)
  + render(products: Product[]) : void
  - cardHTML(p: Product, i: number) : string
}

class FilterManager {
  - renderer : ProductRenderer
  - all      : Product[]
  - category : string
  - query    : string
  --
  + FilterManager(renderer: ProductRenderer)
  + setProducts(products: Product[]) : void
  + setCategory(cat: string) : void
  + setQuery(q: string) : void
  + refresh() : void
  - apply() : void
}

class CategoryManager {
  - onSelect : Function
  --
  + CategoryManager(onSelect: Function)
  + build(products: Product[]) : void
}

class CountDisplay {
  --
  + update(n: number) : void
}

' ─────────────────────────────────────────
' ORQUESTADOR PRINCIPAL
' ─────────────────────────────────────────

class App {
  - cfg   : ConfigLoader
  - data  : DataLoader
  - theme : ThemeManager
  - share : ShareManager
  - count : CountDisplay
  --
  + init() : Promise<void>
  - loader(show: boolean) : void
  - setText(id, val) : void
  - fatalError(msg: string) : void
}

note bottom of App
  Dependency Inversion: App depende de
  abstracciones, no de implementaciones.
  Inyecta dependencias en el constructor
  de cada componente.
end note

' ─────────────────────────────────────────
' RELACIONES
' ─────────────────────────────────────────

App *-- ConfigLoader    : crea
App *-- DataLoader      : crea
App *-- ThemeManager    : crea
App *-- ShareManager    : crea
App *-- CountDisplay    : crea
App ..> Modal           : instancia
App ..> ProductRenderer : instancia
App ..> FilterManager   : instancia
App ..> CategoryManager : instancia

Modal           --> ShareManager     : usa
ProductRenderer --> Modal            : abre modal
FilterManager   --> ProductRenderer  : llama render()
CategoryManager ..> FilterManager   : notifica via callback

ConfigLoader ..> Config   : retorna
DataLoader   ..> Product  : retorna []

@enduml
```

---

## Diagrama de Flujo — Carga Inicial

```
Navegador abre index.html
        │
        ▼
  DOMContentLoaded → new App().init()
        │
        ├─► ThemeManager.init()       ← aplica tema guardado
        │
        ├─► loader(true)              ← muestra spinner
        │
        ├─► ConfigLoader.load()
        │     └─ fetch data/config.json
        │           ├─ store.name, tagline, whatsapp
        │           └─ categories: ["zapatillas","camisetas","accesorios"]
        │
        ├─► DataLoader.loadAll(categories)
        │     ├─ fetch data/zapatillas.json  ─┐
        │     ├─ fetch data/camisetas.json    ├─ Promise.allSettled
        │     └─ fetch data/accesorios.json  ─┘
        │           └─ retorna Product[] (todos juntos)
        │
        ├─► new Modal(shareManager, whatsapp)
        ├─► new ProductRenderer(modal, count => CountDisplay.update(count))
        ├─► new FilterManager(renderer)
        │
        ├─► CategoryManager.build(products)
        │     └─ genera botones: [Todos | Zapatillas | Camisetas | Accesorios]
        │
        ├─► search-input.addEventListener('input', filter.setQuery)
        │
        ├─► filter.refresh()          ← render inicial completo
        │
        └─► loader(false)             ← oculta spinner
```

---

## Diagrama de Secuencia — Click en Producto

```
Usuario                 ProductCard     Modal           ShareManager
  │                         │             │                  │
  │── click ──────────────► │             │                  │
  │                         │             │                  │
  │                   JS captura evento   │                  │
  │                         │── open(p) ─►│                  │
  │                         │             │── buildHTML() ──►│
  │                         │             │◄── HTML ─────────│
  │                         │             │                  │
  │                         │             │ popula DOM       │
  │                         │             │ modal.classList.add('active')
  │                         │             │                  │
  │◄── modal visible ───────────────────── │                  │
  │                         │             │                  │
  │── click "Pedir" ────────────────────►  │                  │
  │                         │             │ abre wa.me/...   │
  │── click "Compartir" ────────────────►  │                  │
  │                         │             │── open(platform,p)─►│
  │                         │             │                  │ abre red social
```

---

## Estructura de Carpetas

```
galeryProject/
├── index.html                    ← HTML puro, sin lógica
├── css/
│   └── style.css                 ← Estilos + variables CSS (dark/light)
├── js/
│   └── script.js                 ← 10 clases OOP, ~320 líneas
├── data/
│   ├── config.json               ← ⚙️  WhatsApp, nombre, categorías
│   ├── zapatillas.json           ← Productos de zapatillas
│   ├── camisetas.json            ← Productos de camisetas
│   └── accesorios.json           ← Productos de accesorios
└── assets/
    ├── placeholder.svg           ← Imagen de respaldo si falla img
    ├── zapatillas/
    │   ├── jordan_air_force.svg
    │   ├── jordan_1_retro.svg
    │   └── nike_air_max.svg
    ├── camisetas/
    │   ├── nike_dryfit.svg
    │   ├── adidas_basic.svg
    │   └── under_armour.svg
    └── accesorios/
        ├── gorra_nike.svg
        └── mochila_adidas.svg
```
