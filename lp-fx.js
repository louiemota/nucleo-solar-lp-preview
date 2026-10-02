/* Núcleo Solar LP · efeitos: narrativa "um dia na sua casa", depoimentos em vídeo. */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* ---------- 1. Um dia na sua casa ----------
     Sem JS ou com movimento reduzido: seção estática, 3 passos visíveis, cena de meio-dia.
     Com movimento: sticky. Relógio, sol e céu usam a MESMA hora. */
  const day = document.querySelector('.day');
  if (day) {
    const path = day.querySelector('.day__arc-done');
    const arc = day.querySelector('.day__arc');
    const timeEl = day.querySelector('.day__time');
    const stateEl = day.querySelector('.day__state');
    const steps = [...day.querySelectorAll('.day__steps li')];
    const dots = [...day.querySelectorAll('.day__dots i')];
    const H0 = 6, H1 = 22, SUNRISE = 6, SUNSET = 18.5;
    const states = [[6, 'Amanhecer'], [9, 'Sol forte'], [15, 'Fim de tarde'], [17.5, 'Pôr do sol'], [19, 'Noite']];
    let len = 0, raf = 0;
    const measure = () => { len = path.getTotalLength(); };

    const paint = hour => {
      const sunp = clamp((hour - SUNRISE) / (SUNSET - SUNRISE));
      // dourado no amanhecer (6h–7h30) e no fim de tarde
      const gold = Math.max(smooth(15, 17.5, hour) * (1 - smooth(18.3, 19.2, hour)), 1 - smooth(6.2, 7.6, hour));
      const night = smooth(18.2, 19.4, hour);
      const gen = Math.sin(Math.PI * sunp) * (1 - night);
      const cred = clamp(smooth(10, 16, hour) - smooth(19, 22, hour) * .85);
      const box = arc.getBoundingClientRect();
      const pt = path.getPointAtLength(len * sunp);
      const st = day.style;
      st.setProperty('--sunp', sunp.toFixed(4));
      st.setProperty('--gold', gold.toFixed(3));
      st.setProperty('--night', night.toFixed(3));
      st.setProperty('--gen', gen.toFixed(3));
      st.setProperty('--cred', cred.toFixed(3));
      st.setProperty('--sx', ((pt.x / 1000) * box.width).toFixed(1) + 'px');
      st.setProperty('--sy', ((pt.y / 320) * box.height).toFixed(1) + 'px');
      const m = Math.round(hour * 60 / 15) * 15;
      timeEl.textContent = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      let s = states[0][1]; states.forEach(([h, n]) => { if (hour >= h) s = n; }); stateEl.textContent = s;
    };

    if (reduce) {
      measure(); paint(12);
      addEventListener('resize', () => { measure(); paint(12); });
    } else {
      day.classList.add('is-anim');
      const render = () => {
        raf = 0;
        const r = day.getBoundingClientRect();
        const total = day.offsetHeight - innerHeight;
        // fase útil termina em 92% da rolagem: o fim não fica "morto"
        const p = clamp(-r.top / (total * .92));
        day.style.setProperty('--p', p.toFixed(4));
        paint(H0 + p * (H1 - H0));
        steps.forEach((li, i) => {
          const on = p >= +li.dataset.from && p < +li.dataset.to;
          li.classList.toggle('is-on', on);
          if (dots[i]) dots[i].classList.toggle('is-on', on);
        });
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(render); };
      measure(); render();
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', () => { measure(); onScroll(); });
    }
  }

  /* ---------- 3. Etapas do caminho e gráfico do financiamento ---------- */
  const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { rootMargin: '0px 0px -15% 0px' });
  document.querySelectorAll('.fin__chart, .path__steps li').forEach(el => rio.observe(el));

  /* ---------- 4. Depoimentos em vídeo (YouTube só carrega no clique) ---------- */
  const lb = document.getElementById('lightbox');
  const frame = lb && lb.querySelector('.lightbox__frame');
  document.querySelectorAll('.vid[data-yt]').forEach(b => b.addEventListener('click', () => {
    if (!lb) return;
    frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Depoimento de cliente"></iframe>`;
    lb.showModal();
    if (typeof window.gtag === 'function') window.gtag('event', 'video_depoimento', { video: b.dataset.yt });
  }));
  if (lb) {
    const close = () => { lb.close(); frame.innerHTML = ''; };
    lb.querySelector('.lightbox__x').addEventListener('click', close);
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    lb.addEventListener('close', () => { frame.innerHTML = ''; });
  }
})();
