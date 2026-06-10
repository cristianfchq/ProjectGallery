'use strict';

/**
 * ================================================================
 * SPORT STYLE CATALOG — JavaScript Application
 * Architecture : OOP + SOLID Principles (ES2022 private fields)
 * ================================================================
 *
 * S — Single Responsibility : cada clase hace UNA cosa
 * O — Open/Closed           : nuevos productos/categorías via JSON
 * L — Liskov Substitution   : interfaces consistentes en managers
 * I — Interface Segregation : APIs mínimas y enfocadas
 * D — Dependency Inversion  : App orquesta vía callbacks/inyección
 * ================================================================
 */

/* ──────────────────────────────────────────────────────────────
   1. ConfigLoader
   Carga config/config.json: nombre, WhatsApp, lista de categorías
   ────────────────────────────────────────────────────────────── */
class ConfigLoader {
  #path;
  constructor(path = 'data/config.json') { this.#path = path; }

  async load() {
    const res = await fetch(this.#path);
    if (!res.ok) throw new Error(`Config no encontrado (${res.status}): ${this.#path}`);
    return res.json();
  }
}

/* ──────────────────────────────────────────────────────────────
   2. DataLoader
   Lee data/<categoria>.json y agrega todos en un array plano.
   Usa Promise.allSettled para tolerar errores parciales.
   ────────────────────────────────────────────────────────────── */
class DataLoader {
  async loadCategory(name) {
    const res = await fetch(`data/${name}.json`);
    if (!res.ok) throw new Error(`data/${name}.json → HTTP ${res.status}`);
    return res.json();
  }

  async loadAll(names) {
    const settled = await Promise.allSettled(names.map(n => this.loadCategory(n)));
    const products = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') products.push(...r.value);
      else console.warn(`[DataLoader] No se cargó "${names[i]}":`, r.reason.message);
    });
    return products;
  }
}

/* ──────────────────────────────────────────────────────────────
   3. ThemeManager
   Persiste el tema elegido en localStorage y actualiza el atributo
   data-theme en <html> para que las CSS vars reaccionen.
   ────────────────────────────────────────────────────────────── */
class ThemeManager {
  static #KEY = 'catalog_theme';
  #current;

  constructor() {
    this.#current = localStorage.getItem(ThemeManager.#KEY) || 'light';
  }

  init() {
    this.#apply(this.#current);
    document.getElementById('theme-toggle')
      ?.addEventListener('click', () => this.#toggle());
  }

  #toggle() {
    this.#current = this.#current === 'light' ? 'dark' : 'light';
    localStorage.setItem(ThemeManager.#KEY, this.#current);
    this.#apply(this.#current);
  }

  #apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    if (theme === 'dark') {
      btn.innerHTML = `<span class="theme-icon">☀️</span><span class="theme-text">Modo Claro</span>`;
      btn.setAttribute('aria-label', 'Activar modo claro');
    } else {
      btn.innerHTML = `<span class="theme-icon">🌙</span><span class="theme-text">Modo Oscuro</span>`;
      btn.setAttribute('aria-label', 'Activar modo oscuro');
    }
  }
}

/* ──────────────────────────────────────────────────────────────
   4. ShareManager
   Genera y abre URLs de compartir para 6 redes sociales.
   buildHTML devuelve botones listos para insertar en el modal.
   ────────────────────────────────────────────────────────────── */
class ShareManager {
  #platforms = [
    { id: 'whatsapp',  icon: '💬', label: 'WhatsApp',  color: '#25D366',
      url: (t, u)       => `https://wa.me/?text=${t}%20${u}` },
    { id: 'facebook',  icon: '📘', label: 'Facebook',  color: '#1877F2',
      url: (t, u)       => `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}` },
    { id: 'telegram',  icon: '✈️', label: 'Telegram',  color: '#0088CC',
      url: (t, u)       => `https://t.me/share/url?url=${u}&text=${t}` },
    { id: 'twitter',   icon: '🐦', label: 'Twitter/X', color: '#1DA1F2',
      url: (t, u)       => `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { id: 'pinterest', icon: '📌', label: 'Pinterest', color: '#E60023',
      url: (t, u, img)  => `https://pinterest.com/pin/create/button/?url=${u}&description=${t}&media=${img}` },
    { id: 'linkedin',  icon: '💼', label: 'LinkedIn',  color: '#0A66C2',
      url: (t, u)       => `https://www.linkedin.com/sharing/share-offsite/?url=${u}&summary=${t}` },
  ];

  open(platformId, product) {
    const t   = encodeURIComponent(`¡Mira esto! ${product.name} — ${product.price}`);
    const u   = encodeURIComponent(window.location.href);
    const img = encodeURIComponent(window.location.origin + '/' + product.image);
    const p   = this.#platforms.find(p => p.id === platformId);
    if (p) window.open(p.url(t, u, img), '_blank', 'width=640,height=460,noopener');
  }

  buildHTML() {
    return this.#platforms.map(p => `
      <button class="share-btn" data-platform="${p.id}"
              style="--share-color:${p.color}"
              title="Compartir en ${p.label}"
              aria-label="Compartir en ${p.label}">
        <span class="share-icon">${p.icon}</span>
        <span class="share-label">${p.label}</span>
      </button>`
    ).join('');
  }
}

/* ──────────────────────────────────────────────────────────────
   5. Modal
   Lightbox de detalle de producto con animación, WhatsApp deep-link
   y botones de compartir. Cierra con Escape o clic en backdrop.
   ────────────────────────────────────────────────────────────── */
class Modal {
  #share;
  #wa;
  #overlay;
  #content;
  #selectedSize = null;    // talla actualmente elegida
  #currentProduct = null;  // referencia para refreshWaLink tras selección
  #sourceEl = null;        // <img> de la card desde donde se abrio (para FLIP de cierre) 

  constructor(shareManager, whatsappNumber) {
    this.#share   = shareManager;
    this.#wa      = whatsappNumber;
    this.#overlay = document.getElementById('product-modal');
    this.#content = this.#overlay.querySelector('.modal-content');
    this.#bindGlobal();
  }

  // Nota: el botón "Pedir por WhatsApp" usa el <a href="wa.me/<numero>?text=...">
  // que genera #refreshWaLink() — abre WhatsApp DIRECTAMENTE con el número del
  // dueño definido en config.json, sin menú "compartir con..." de ningún tipo.

  // Construye el mensaje formateado con markdown de WhatsApp (sin URL imagen)
  #buildOrderMessage(product) {
    const lines = [
      `🛍️ *NUEVO PEDIDO*`,
      `━━━━━━━━━━━━━━━━━━`,
      ``,
      `📦 *Producto:* ${product.name}`,
      `🏷️ *Categoría:* ${product.category}`,
      `💰 *Precio:* ${product.price}`,
    ];
    if (this.#selectedSize) {
      lines.push(`📏 *Talla:* ${this.#selectedSize}`);
    }
    lines.push(
      ``,
      `📝 _${product.description}_`,
      ``,
      `━━━━━━━━━━━━━━━━━━`,
      `¡Hola! 👋 Me interesa este producto.`,
      `¿Está disponible? ¿Cómo procedo con el pago?`
    );
    return lines.join('\n');
  }

  open(product, sourceEl = null) {
    this.#selectedSize  = null;
    this.#currentProduct = product;
    this.#sourceEl = sourceEl;        // guardamos para usar en close() reverse FLIP

    // Populate fields
    document.getElementById('modal-image').src         = product.image;
    document.getElementById('modal-image').alt         = product.name;
    document.getElementById('modal-name').textContent  = product.name;
    document.getElementById('modal-price').textContent = product.price;
    document.getElementById('modal-desc').textContent  = product.description; // doble salto para mejor legibilidad
    document.getElementById('modal-cat').textContent   = product.category;

    // Tallas disponibles
    this.#buildSizes(product);

    // WhatsApp deep-link (sin talla elegida aún)
    this.#refreshWaLink(product);

    // Share buttons
    const shareWrap = document.getElementById('modal-shares');
    shareWrap.innerHTML = this.#share.buildHTML();
    shareWrap.querySelectorAll('.share-btn').forEach(btn =>
      btn.addEventListener('click', () => this.#share.open(btn.dataset.platform, product))
    );

    // Mostrar overlay y animar contenido
    this.#overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (sourceEl) {
      // Shared element transition (FLIP): la imagen "vuela" de la card al modal
      this.#sharedElementOpen(sourceEl);
    } else {
      // Fallback: animacion normal blur-to-focus
      requestAnimationFrame(() => this.#content.classList.add('modal-in'));
    }

    this.#overlay.querySelector('.modal-close')?.focus();
  }

  /* ─── FLIP: shared element transition ─── 
    1. Mide el rect de la imagen ORIGEN (card) y DESTINO (modal)
    2. Coloca la imagen del modal en la posicion/escala del origen
    3. Anima a su posicion natural (transform: none)
    Resultado: la imagen "vuela" desde la card al modal. */
  #sharedElementOpen(sourceEl) {
    const modalImg = document.getElementById('modal-image');

    // El modal-content debe aparecer instantaneo (la animacion recae en la imagen)
    this.#content.style.transition = 'opacity 0.22s ease';
    this.#content.classList.add('modal-in');

    // Cancelar el blur-to-focus default sobre la imagen
    modalImg.style.transition = 'none';
    modalImg.style.filter = 'none';
    modalImg.style.opacity = '1';

    // Esperar a que el modal este en DOM para medir el rect destino
    requestAnimationFrame(() => {
      const srcRect = sourceEl.getBoundingClientRect();
      const dstRect = modalImg.getBoundingClientRect();

      // Fallback: si algun rect no es medible, mostrar sin FLIP
      if (!srcRect.width || !dstRect.width) {
        this.#cleanupFLIP(modalImg);
        return;
      }

      // Calculo FLIP: delta de centros + escala uniforme
      const dx = (srcRect.left + srcRect.width / 2) - (dstRect.left + dstRect.width / 2);
      const dy = (srcRect.top + srcRect.height / 2) - (dstRect.top + dstRect.height / 2);
      const scale = Math.min(srcRect.width / dstRect.width, srcRect.height / dstRect.height);

      // Esatdo INICIAL: imagen modal en la posicion exacta de la card
      modalImg.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      
      // Forzar reflow para que el navegador registre el estado inicial antes de animar
      void modalImg.offsetWidth;

      // PLAY: animar a su posicion natural
      modalImg.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
      modalImg.style.transform = 'translate(0, 0) scale(1)';

      // Cleanup: al terminar la animacion, limpiar estilos inline
      setTimeout(() => this.#cleanupFLIP(modalImg), 620);
    });
  }

  #cleanupFLIP(modalImg) {
    modalImg.style.transition = '';
    modalImg.style.transform = '';
    modalImg.style.filter = '';
    modalImg.style.opacity = '';
    this.#content.style.transition = '';
  }

  // Construye los botones de talla y los inyecta en el DOM
  #buildSizes(product) {
    const wrap = document.getElementById('sizes-wrap');
    const grid = document.getElementById('modal-sizes');
    const hint = document.getElementById('size-hint');

    // Ocultar si no hay tallas definidas
    if (!product.sizes || !product.sizes.length) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'flex';
    hint.textContent   = 'Elige una talla';
    hint.classList.remove('chosen');

    // Generar chips con delay escalonado para animación CSS
    grid.innerHTML = product.sizes.map((s, i) => `
      <button class="size-btn" data-size="${s}"
              style="animation-delay:${i * 40}ms"
              aria-label="Talla ${s}"
              role="radio" aria-checked="false">
        <span>${s}</span>
      </button>`
    ).join('');

    // Delegación: un solo listener en el grid
    grid.addEventListener('click', e => {
      const btn = e.target.closest('.size-btn');
      if (!btn) return;

      // Desmarcar anterior
      grid.querySelectorAll('.size-btn').forEach(b => {
        b.classList.remove('selected');
        b.setAttribute('aria-checked', 'false');
      });

      // Marcar nueva
      btn.classList.add('selected');
      btn.setAttribute('aria-checked', 'true');
      this.#selectedSize = btn.dataset.size;

      // Actualizar hint y link de WhatsApp
      hint.textContent = `Talla ${this.#selectedSize} seleccionada ✓`;
      hint.classList.add('chosen');
      this.#refreshWaLink(this.#currentProduct);
    }, { once: false });
  }

  // Regenera el href del botón WhatsApp con el mensaje formateado.
  // El URL absoluto de la imagen se pone solo (sin label) al final →
  // WhatsApp genera AUTOMÁTICAMENTE un preview con thumbnail visible en el chat.
  // El receptor "ve" la imagen como tarjeta de preview en la conversación.
  #refreshWaLink(product) {
    const baseMsg = this.#buildOrderMessage(product);
    const imgURL  = new URL(product.image, window.location.href).href;
    // URL pelada al final → WhatsApp lo procesa como link-preview con imagen
    const fullMsg = `${baseMsg}\n\n${imgURL}`;
    document.getElementById('modal-wa-btn').href =
      `https://wa.me/${this.#wa}?text=${encodeURIComponent(fullMsg)}`;
  }

  close() {
    // Si abrimos desde una card (Shared element), hacer reverse FLIP de regreso
    if (this.#sourceEl) {
      this.#sharedElementClose();
    } else {
      this.#defaultClose();
    }
  }

  // Cierre por defecto (Sin shared element): animación normal blur-to-focus
  #defaultClose() {
    this.#content.classList.remove('modal-in');
    this.#content.classList.add('modal-out');
    setTimeout(() => {
      this.#overlay.classList.remove('active');
      this.#content.classList.remove('modal-out');
      document.body.style.overflow = '';
      this.#sourceEl = null;
    }, 320);
  }

  /* ─── Reverse FLIP: La imagen vuela del modal de regreso a la card ───
    Estartegia con CLON: 
    1. Crear un <img> clon en position: fixed sobre la imagen del modal
    2. Ocultar el modal (fade)
    3. Animar el clon (top/left/width/height) a la posicion de la card origen
    4. Al terminar, eliminar el clon y resetear estado. */
  #sharedElementClose() {
    const modalImg = document.getElementById('modal-image');
    const srcEl = this.#sourceEl;

    const srcRect = srcEl.getBoundingClientRect();
    const dstRect = modalImg.getBoundingClientRect();

    // Si la card ya no esta visible (Scroll, filtro cambiado, etc) --> cierre normal sin animación
    if (!srcRect.width || !dstRect.width) {
      this.#defaultClose();
      return;
    }

    // 1. Crear el clon en la posicion actual de la imagen del modal
    const clone = document.createElement('img');
    clone.src = modalImg.src;
    clone.alt = '';
    clone.style.cssText = `
      position: fixed;
      top: ${dstRect.top}px;
      left: ${dstRect.left}px;
      width: ${dstRect.width}px;
      height: ${dstRect.height}px;
      object-fit: contain;
      margin: 0; padding: 0;
      z-index: 1100;
      pointer-events: none;
      will-change: top, left, width, height;
      transition: 
        top 0.52s cubic-bezier(0.22, 1, 0.36, 1),
        left 0.52s cubic-bezier(0.22, 1, 0.36, 1),
        width 0.52s cubic-bezier(0.22, 1, 0.36, 1),
        height 0.52s cubic-bezier(0.22, 1, 0.36, 1),
    `;
    document.body.appendChild(clone);

    // 2. Ocultar la imagen original del modal (el clon la reeemplaza visualmente)
    modalImg.style.opacity = '0';

    // 3. Fade-out del modal-content y del backdrop
    this.#content.style.transition = 'opacity 0.32s ease';
    this.#content.style.opacity = '0';
    this.#overlay.style.transition = 'background 0.42s ease, backdrop-filter 0.42s ease';
    this.#overlay.style.background = 'transparent';
    this.#overlay.style.backdropFilter = 'blur(0)';

    //4. En el siguiente frame: animar clon hacia la posicion del card
    requestAnimationFrame(() => {
      clone.style.top = `${srcRect.top}px`;
      clone.style.left = `${srcRect.left}px`;
      clone.style.width = `${srcRect.width}px`;
      clone.style.height = `${srcRect.height}px`;
    });

    // 5. Al terminar la animación, limpiar todo
    setTimeout(() => {
      clone.remove();
      this.#overlay.classList.remove('active');
      this.#content.classList.remove('modal-in');
      // Reset de estilos inline
      this.#content.style.opacity = '';
      this.#content.style.transition = '';
      this.#overlay.style.background = '';
      this.#overlay.style.backdropFilter = '';
      this.#overlay.style.transition = '';
      modalImg.style.opacity = '';
      document.body.style.overflow = '';
      this.#sourceEl = null;
    }, 540);
  }

  #bindGlobal() {
    this.#overlay.addEventListener('click', e => {
      if (e.target === this.#overlay || e.target.closest('.modal-close')) this.close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.#overlay.classList.contains('active')) this.close();
    });
  }
}

/* ──────────────────────────────────────────────────────────────
   6. ProductRenderer
   Genera el HTML de las cards e inyecta en el grid.
   Callback onCount(n) notifica cuántos productos se muestran.
   ────────────────────────────────────────────────────────────── */
class ProductRenderer {
  #modal;
  #onCount;
  static #PAL = 8; // tamaño de la paleta de fondos

  constructor(modal, onCount) {
    this.#modal   = modal;
    this.#onCount = onCount;
  }

  render(products) {
    const grid  = document.getElementById('product-grid');
    const empty = document.getElementById('empty-state');

    this.#onCount(products.length);

    if (!products.length) {
      grid.innerHTML = '';
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';

    grid.innerHTML = products.map((p, i) => this.#cardHTML(p, i)).join('');

    // Bind card interactions
    grid.querySelectorAll('.product-card').forEach((card, i) => {
      // Pasamos el <img> de la card al modal para hacer "shared element transition" con FLIP
      const open = () => {
        const sourceImg = card.querySelector('.card-img-wrap img');
        this.#modal.open(products[i], sourceImg);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      // Staggered entrance — delay driven by CSS custom prop
      card.style.setProperty('--i', i);
      requestAnimationFrame(() => card.classList.add('card-visible'));
    });
  }

  #cardHTML(p, i) {
    return `
      <article class="product-card" role="button" tabindex="0"
               aria-label="Ver detalles de ${p.name}" data-index="${i}">
        <div class="card-img-wrap" data-pal="${i % ProductRenderer.#PAL}">
          <img src="${p.image}" alt="${p.name}" loading="lazy"
               onerror="this.src='assets/placeholder.png'">
          <span class="card-badge">${p.category}</span>
          <div class="card-overlay">
            <p class="card-desc-ov">${p.description}</p>
            <span class="card-cta">Ver detalles →</span>
          </div>
        </div>
        <div class="card-footer">
          <h3 class="card-name">${p.name}</h3>
          <div class="card-footer-row">
            <p class="card-price">${p.price}</p>
            <span class="card-arrow" aria-hidden="true">→</span>
          </div>
        </div>
      </article>`;
  }
}

/* ──────────────────────────────────────────────────────────────
   7. FilterManager
   Mantiene el estado de filtro (categoría + búsqueda de texto)
   y llama a renderer.render() con el subconjunto correcto.
   ────────────────────────────────────────────────────────────── */
class FilterManager {
  #renderer;
  #all      = [];
  #category = 'Todos';
  #query    = '';

  constructor(renderer) { this.#renderer = renderer; }

  setProducts(products) { this.#all = products; }
  setCategory(cat)      { this.#category = cat;  this.#apply(); }
  setQuery(q)           { this.#query = q.toLowerCase().trim(); this.#apply(); }
  refresh()             { this.#apply(); }

  #apply() {
    let r = this.#all;
    if (this.#category !== 'Todos')
      r = r.filter(p => p.category === this.#category);
    if (this.#query)
      r = r.filter(p =>
        p.name.toLowerCase().includes(this.#query)       ||
        p.description.toLowerCase().includes(this.#query)||
        p.category.toLowerCase().includes(this.#query)
      );
    this.#renderer.render(r);
  }
}

/* ──────────────────────────────────────────────────────────────
   8. CategoryManager
   Construye el menú de filtros dinámicamente desde los datos.
   Si mañana agregas "ropa_deportiva.json", aparece solo.
   ────────────────────────────────────────────────────────────── */
class CategoryManager {
  #onSelect;

  constructor(onSelect) { this.#onSelect = onSelect; }

  build(products) {
    const nav    = document.getElementById('category-nav');
    if (!nav) return;
    const cats   = ['Todos', ...new Set(products.map(p => p.category))];

    nav.innerHTML = cats.map(c => `
      <button class="cat-btn${c === 'Todos' ? ' active' : ''}"
              data-cat="${c}" role="tab"
              aria-selected="${c === 'Todos'}">${c}</button>`
    ).join('');

    nav.addEventListener('click', e => {
      const btn = e.target.closest('.cat-btn');
      if (!btn) return;
      nav.querySelectorAll('.cat-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      this.#onSelect(btn.dataset.cat);
    });
  }
}

/* ──────────────────────────────────────────────────────────────
   9. CountDisplay
   Actualiza reactivamente el contador de productos visibles.
   ────────────────────────────────────────────────────────────── */
class CountDisplay {
  update(n) {
    const el = document.getElementById('product-count');
    if (el) el.textContent = `${n} producto${n !== 1 ? 's' : ''}`;
  }
}

/* ──────────────────────────────────────────────────────────────
   10. App — Orquestador principal (Dependency Inversion)
   Instancia y conecta todos los componentes. Nunca contiene
   lógica de presentación ni de datos.
   ────────────────────────────────────────────────────────────── */
class App {
  // Dependencias de infra (sin estado de UI)
  #cfg    = new ConfigLoader();
  #data   = new DataLoader();
  #theme  = new ThemeManager();
  #share  = new ShareManager();
  #count  = new CountDisplay();

  async init() {
    this.#theme.init();
    this.#loader(true);

    try {
      // ── 1. Cargar configuración ──────────────────────────
      const config = await this.#cfg.load();

      this.#setText('store-name',    config.store.name);
      this.#setText('store-tagline', config.store.tagline);
      this.#setText('footer-brand',  config.store.name);
      document.title = config.store.name;

      // ── 2. Crear componentes de UI (inyección de deps) ───
      const modal    = new Modal(this.#share, config.store.whatsapp);
      const renderer = new ProductRenderer(modal, n => this.#count.update(n));
      const filter   = new FilterManager(renderer);

      // ── 3. Cargar productos ──────────────────────────────
      const products = await this.#data.loadAll(config.categories);
      filter.setProducts(products);

      // ── 4. Construir menú de categorías ─────────────────
      new CategoryManager(cat => filter.setCategory(cat)).build(products);

      // ── 5. Conectar búsqueda ─────────────────────────────
      document.getElementById('search-input')
        ?.addEventListener('input', e => filter.setQuery(e.target.value));

      // ── 6. Render inicial ────────────────────────────────
      filter.refresh();

    } catch (err) {
      console.error('[App] Error fatal:', err);
      this.#fatalError(err.message);
    } finally {
      this.#loader(false);
    }
  }

  #loader(show) {
    const el = document.getElementById('loader');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  #setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  #fatalError(msg) {
    const g = document.getElementById('product-grid');
    if (g) g.innerHTML = `
      <div class="error-state">
        <span class="error-icon">⚠️</span>
        <p>No se pudo cargar el catálogo.</p>
        <small>${msg}</small>
      </div>`;
  }
}

// ── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => new App().init());
