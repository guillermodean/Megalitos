/* Megalitos Navarra — mejoras progresivas (todo funciona sin JS salvo mapas y visor). */
(() => {
  'use strict';

  /* 1. Miniaturas: si la .webp falta, usar el original; si no, ocultar la imagen rota. */
  const onBroken = (img) => {
    const fb = img.getAttribute('data-fallback');
    if (fb && img.getAttribute('src') !== fb) { img.src = fb; return; }
    img.classList.add('is-broken');
    img.setAttribute('hidden', '');
  };
  document.addEventListener('error', (e) => { if (e.target instanceof HTMLImageElement) onBroken(e.target); }, true);
  document.querySelectorAll('img').forEach((img) => { if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) onBroken(img); });

  /* 2. Catálogo: filtrado instantáneo de las filas ya renderizadas; los selects envían el formulario. */
  const form = document.getElementById('filters');
  if (form) {
    form.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => form.requestSubmit()));
    const q = document.getElementById('f-q');
    const rows = Array.from(document.querySelectorAll('#cat tbody tr'));
    const count = document.getElementById('list-count');
    const empty = document.getElementById('list-empty');
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (q && rows.length) {
      const index = rows.map((r) => norm(r.textContent));
      const initial = q.value;
      const apply = () => {
        const terms = norm(q.value).split(/\s+/).filter(Boolean);
        const untouched = q.value === initial;
        let n = 0;
        rows.forEach((r, i) => {
          const ok = untouched || terms.every((t) => index[i].includes(t));
          r.hidden = !ok;
          if (ok) n++;
        });
        count.textContent = n.toLocaleString('es-ES');
        if (empty) empty.hidden = n !== 0;
      };
      q.addEventListener('input', apply);
    }
  }

  /* 3. Visor de imágenes (<dialog>) para los anexos de la ficha. */
  const box = document.getElementById('lightbox');
  const links = Array.from(document.querySelectorAll('a[data-lightbox]'));
  if (box && links.length && typeof box.showModal === 'function') {
    const img = box.querySelector('.lightbox__img');
    const cnt = box.querySelector('.lightbox__count');
    const alt = box.querySelector('.lightbox__alt');
    const orig = box.querySelector('.lightbox__open');
    let i = 0;
    const show = (n) => {
      i = (n + links.length) % links.length;
      const a = links[i];
      img.src = a.getAttribute('href');
      img.alt = a.dataset.alt || '';
      cnt.textContent = `${i + 1} / ${links.length}`;
      alt.textContent = a.dataset.alt || '';
      orig.href = a.getAttribute('href');
      [links[(i + 1) % links.length], links[(i - 1 + links.length) % links.length]].forEach((l) => { new Image().src = l.getAttribute('href'); });
    };
    links.forEach((a, n) => a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); show(n); box.showModal();
    }));
    box.querySelector('.lightbox__prev').addEventListener('click', () => show(i - 1));
    box.querySelector('.lightbox__next').addEventListener('click', () => show(i + 1));
    box.querySelector('.lightbox__close').addEventListener('click', () => box.close());
    box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('lightbox__fig')) box.close(); });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
    });
    let x0 = null;
    box.addEventListener('pointerdown', (e) => { x0 = e.pointerType === 'touch' ? e.clientX : null; });
    box.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) show(dx < 0 ? i + 1 : i - 1);
    });
    box.addEventListener('close', () => { img.removeAttribute('src'); });
  }
})();
