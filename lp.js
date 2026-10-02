/* Núcleo Solar — LP Google Ads: simulador, captura de clique pago, envio do lead e eventos. */
(() => {
  'use strict';
  window.__lpok = true;
  const CFG = {
    // Produção: endpoint ainda a definir (decisão do Louie: não mexer no serviço atual).
    endpoint: document.documentElement.dataset.leadEndpoint || '/api/lead',
    whatsapp: '5548992220050',
    adsId: 'AW-11451877290',
    // Rótulos das ações de conversão: inertes até a conta criar as ações.
    labels: { lead: '', whatsapp: '' },
    /* Premissas do simulador (fontes públicas, conferidas em 01/10/2026; validar com a Núcleo):
       - tarifa: Celesc B1 residencial R$ 0,75975/kWh sem tributos (vigência 22/08/2026, celesc.com.br/tarifas-de-energia),
         ≈ R$ 0,95 com ICMS 17% + PIS/COFINS. Só vale para residencial B1: empresa, rural e conta acima de R$ 5 mil
         recebem "estudo sob medida" em vez de percentual.
       - fioB2026: TUSD Fio B Celesc ≈ R$ 0,1327/kWh (REH 3.511/2025); GD II paga 60% em 2026 → ≈ R$ 0,10 com tributos,
         só sobre a energia compensada. Rampa da Lei 14.300: 75% em 2027, 90% em 2028; de 2029 em diante assumimos 100%.
       - simultaneidade: ~30% consumido na hora da geração, sem Fio B (residencial).
       - geracaoKwp: ~110 kWh/mês por kWp na Grande Florianópolis (HSP ≈ 4,4 × 30 × PR 0,83).
       - Iluminação pública (CIP) fica FORA: varia por município e não muda com o solar. */
    tarifa: 0.95,
    fioB2026: 0.10,
    fioRamp: { 2026: 0.60, 2027: 0.75, 2028: 0.90 },
    simult: 0.30,
    geracaoKwp: 110,
    placaW: 610,
    m2Placa: 2.8,
    minimoKwh: { 'Monofásica': 30, 'Bifásica': 50, 'Trifásica': 100 },
  };

  /* ---------- 1. Captura de origem: gclid/gbraid/wbraid/UTM (guarda 90 dias) ---------- */
  const KEYS = ['gclid','gbraid','wbraid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','matchtype','keyword','device','network','campaignid','adgroupid'];
  const qs = new URLSearchParams(location.search);
  let attr = {};
  try { attr = JSON.parse(localStorage.getItem('ns_attr') || '{}'); } catch (e) {}
  if (attr._exp && attr._exp < Date.now()) attr = {};
  let fresh = false;
  KEYS.forEach(k => { const v = qs.get(k); if (v) { attr[k] = v.slice(0, 300); fresh = true; } });
  if (fresh || !attr.landing) {
    attr.landing = location.href.slice(0, 500);
    attr.referrer = document.referrer.slice(0, 300);
    attr.first_seen = new Date().toISOString();
    attr._exp = Date.now() + 90 * 864e5;
  }
  try { localStorage.setItem('ns_attr', JSON.stringify(attr)); } catch (e) {}

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gt = (...a) => { if (typeof window.gtag === 'function') window.gtag(...a); };
  const fb = (...a) => { if (typeof window.fbq === 'function') window.fbq(...a); };
  const money = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const moneyK = n => 'R$ ' + Math.round(n / 1000).toLocaleString('pt-BR') + ' mil';

  /* ---------- 2. Simulador ---------- */
  const $ = s => document.querySelector(s);
  const form = $('#leadForm');
  const tipo = () => (form.querySelector('input[name=tipo]:checked') || {}).value || 'Residencial';
  const faixa = () => form.querySelector('input[name=faixa]:checked');
  const fioFull = CFG.fioB2026 / CFG.fioRamp[2026];
  const fioAno = y => fioFull * (CFG.fioRamp[y] ?? (y < 2026 ? CFG.fioRamp[2026] : 1));

  function simular(conta, t) {
    const lig = conta < 300 ? 'Monofásica' : conta < 1000 ? 'Bifásica' : 'Trifásica';
    const consumo = conta / CFG.tarifa;
    const disp = CFG.minimoKwh[lig];
    const gerado = Math.max(consumo - disp, 0);
    const compensado = gerado * (1 - CFG.simult);
    const y0 = new Date().getFullYear();
    const minimo = disp * CFG.tarifa;
    const fio = compensado * fioAno(y0);
    const contaDepois = minimo + fio;
    const economiaMes = Math.max(conta - contaDepois, 0);
    let economia25 = 0;
    for (let i = 0; i < 25; i++) economia25 += Math.max(conta - minimo - compensado * fioAno(y0 + i), 0) * 12;
    const kwp = gerado / CFG.geracaoKwp;
    const placas = Math.max(Math.ceil((kwp * 1000) / CFG.placaW), 4);
    return {
      conta, lig, consumo: Math.round(consumo), kwp: (placas * CFG.placaW) / 1000, placas,
      area: Math.round(placas * CFG.m2Placa), economiaMes: Math.round(economiaMes),
      minimo: Math.round(minimo), fio: Math.round(fio),
      contaDepois: Math.round(contaDepois), economia25: Math.round(economia25),
      pct: Math.round((economiaMes / conta) * 100),
      // Tarifa B1 não vale para empresa (B3/Grupo A), rural (B2) nem para contas muito altas
      custom: t !== 'Residencial' || conta >= 5000,
    };
  }
  const calc = () => simular(Number((faixa() || {}).value || 0), tipo());

  // Exemplo da seção "dor": mesma conta do simulador, R$ 800 residencial
  const ex = simular(800, 'Residencial');
  const setTxt = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
  setTxt('#billAfter', money(ex.contaDepois));
  setTxt('#billMin', money(ex.minimo));
  setTxt('#billFio', money(ex.fio));
  const bb = $('#billBar'); if (bb) bb.style.setProperty('--w', Math.round(ex.contaDepois / 800 * 100) + '%');
  /* Variante por grupo de anúncio (?lp=...): título e subtítulo acompanham a busca.
     Textos fixos aqui; nada vindo da URL entra no HTML. Sem parâmetro, vale a versão padrão. */
  const VAR = {
    residencial: ['Energia solar residencial em Florianópolis e Palhoça <span class="h1-grad">que dá lucro.</span>', 'Placa solar para casa, dimensionada pelo seu consumo. Veja quanto o seu telhado paga da conta.', 'Residencial'],
    empresa: ['Energia solar para empresa em Florianópolis e Palhoça <span class="h1-grad">que dá lucro.</span>', 'Comércio, indústria e condomínio. Mande a fatura e receba o estudo com os números do seu negócio.', 'Empresarial'],
    rural: ['Energia solar rural em Santa Catarina <span class="h1-grad">que dá lucro.</span>', 'Sítio, granja e produtor rural. Energia é custo de produção, e o sol baixa esse custo.', 'Rural'],
    financiamento: ['Financiamento de energia solar com parcela <span class="h1-grad">no lugar da conta.</span>', 'Caixa, Sicoob, BV e Solfácil. No estudo você vê a parcela ao lado da conta de luz que ela substitui.', 'Residencial', true],
    preco: ['Quanto custa energia solar em Florianópolis e Palhoça? <span class="h1-grad">Simule agora.</span>', 'O preço sai do tamanho do sistema, e o tamanho sai do seu consumo. Comece pela sua conta de luz.', 'Residencial'],
  };
  const vk = (qs.get('lp') || '').toLowerCase();
  if (VAR[vk]) {
    const [h, l, t, fin] = VAR[vk];
    const r = form.querySelector(`input[name=tipo][value="${t}"]`); if (r) r.checked = true;
    if (fin) form.financiamento.checked = true;
    document.documentElement.dataset.lpVar = vk;
    attr.lp_variante = vk;
  }
  // Ano e percentual do Fio B gerados pela data: o texto não envelhece
  const yNow = new Date().getFullYear();
  document.querySelectorAll('.js-y').forEach(e => { e.textContent = yNow; });
  if (yNow >= 2029) document.querySelectorAll('.js-ramp').forEach(e => e.remove());
  document.querySelectorAll('.js-fio').forEach(e => { e.textContent = Math.round((CFG.fioRamp[yNow] ?? 1) * 100) + '%'; });

  let touched = false;
  const faixaErr = $('#faixaErr');
  form.addEventListener('change', e => {
    if (!touched && (e.target.name === 'faixa' || e.target.name === 'tipo')) { touched = true; gt('event', 'calc_start'); }
    if (e.target.name === 'faixa' && faixaErr) faixaErr.hidden = true;
  });

  const go = step => {
    const n = Number(step);
    if (n === 2 && !faixa()) {
      if (faixaErr) faixaErr.hidden = false;
      form.querySelector('input[name=faixa]').focus();
      return;
    }
    form.querySelectorAll('.calc__step').forEach(s => s.classList.toggle('is-active', s.dataset.step === String(n)));
    // Troca de passo: traz o card para a tela se o topo dele estiver escondido ou o fim cortado
    const card = $('#simulador'), bx = card.getBoundingClientRect(), tb = document.querySelector('.topbar').offsetHeight;
    if (bx.top < tb || bx.bottom > innerHeight) card.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    if (n === 3) { const k = card.querySelector('[data-step="3"] .calc__kicker'); k.tabIndex = -1; k.focus({ preventScroll: true }); }
    if (n === 2) {
      const r = calc();
      $('#pvPct').textContent = r.custom ? 'Estudo sob medida' : 'até ' + r.pct + '%';
      $('.preview').classList.toggle('is-custom', r.custom);
      $('#pvNote').hidden = !r.custom;
      $('#pvKwp').closest('.preview__row').hidden = r.custom;
      $('#pvKwp').textContent = r.kwp.toFixed(2).replace('.', ',') + ' kWp';
      $('#pvPlacas').textContent = r.placas + ' placas';
      $('#sendBtn').textContent = r.custom ? 'Pedir meu estudo sob medida' : 'Receber meu estudo de economia';
      gt('event', 'calc_preview', { faixa: faixa().dataset.label, tipo: tipo() });
      // Só no desktop: no celular o teclado cobriria a estimativa
      if (innerWidth > 900) setTimeout(() => $('#nome').focus({ preventScroll: true }), 250);
    }
  };
  form.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => go(b.dataset.next)));

  /* ---------- 3. WhatsApp e CTAs ---------- */
  // Origem no texto: o comercial separa Google Ads (G), outro pago (P) e orgânico (S); o código curto liga a conversa ao clique
  const ref = (() => {
    const pago = attr.gclid || attr.gbraid || attr.wbraid ? 'G' : (attr.utm_medium || '').match(/cpc|paid|ads/i) ? 'P' : 'S';
    const id = (attr.gclid || attr.gbraid || attr.wbraid || attr.first_seen || '').replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase();
    return 'LP-' + pago + (id ? '-' + id : '');
  })();
  const waLink = (extra = '') => `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent('Olá! Vim pela página de simulação de energia solar e quero um orçamento.' + extra + ' (ref. ' + ref + ')')}`;
  const trackWa = cta => {
    gt('event', 'whatsapp_click', { cta: cta || '' });
    fb('track', 'Contact');
    if (CFG.labels.whatsapp) gt('event', 'conversion', { send_to: `${CFG.adsId}/${CFG.labels.whatsapp}` });
  };
  document.querySelectorAll('.js-wa').forEach(a => {
    a.href = waLink(); a.target = '_blank'; a.rel = 'noopener';
    a.addEventListener('click', () => trackWa(a.dataset.cta));
  });
  document.querySelectorAll('[data-cta]').forEach(el => {
    if (el.classList.contains('js-wa')) return;
    el.addEventListener('click', () => {
      gt('event', 'cta_click', { cta: el.dataset.cta });
      if (el.dataset.setTipo) { const r = form.querySelector(`input[name=tipo][value="${el.dataset.setTipo}"]`); if (r) r.checked = true; }
      if (el.dataset.setFin) { const c = form.querySelector('input[name=financiamento]'); if (c) c.checked = true; }
    });
  });

  /* Máscara de telefone BR */
  const whats = $('#whats');
  whats.addEventListener('input', () => {
    const d = whats.value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
    let f = d;
    if (d.length > 2) f = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) f = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    whats.value = f;
  });
  const validPhone = v => { const d = v.replace(/\D/g, ''); return (d.length === 11 && d[2] === '9') || d.length === 10; };

  /* ---------- 4. Envio ---------- */
  const err = $('#formErr'), btn = $('#sendBtn');
  const mbar = document.querySelector('.mbar');
  let sending = false;
  const eventId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (sending) return;
    err.hidden = true;
    const nome = $('#nome'), cidade = $('#cidade');
    let bad = null;
    [nome, whats, cidade].forEach(i => i.classList.remove('is-bad'));
    if (nome.value.trim().length < 2) bad = nome;
    else if (!validPhone(whats.value)) bad = whats;
    else if (cidade.value.trim().length < 2) bad = cidade;
    if (bad) { bad.classList.add('is-bad'); bad.focus(); err.textContent = bad === whats ? 'Confira o WhatsApp com DDD, ex.: (48) 9 9999-9999.' : 'Preencha esse campo para receber o estudo.'; err.hidden = false; return; }

    const r = calc();
    const id = eventId();
    const payload = {
      event_id: id,
      nome: nome.value.trim(),
      whatsapp: whats.value.replace(/\D/g, ''),
      cidade: cidade.value.trim(),
      tipo: tipo(),
      ligacao: r.lig,
      conta_valor: r.conta,
      conta_faixa: faixa().dataset.label,
      financiamento: form.financiamento.checked ? 'Sim' : 'Não',
      simulacao: { consumo_kwh: r.consumo, kwp: r.custom ? null : Number(r.kwp.toFixed(2)), placas: r.custom ? null : r.placas, area_m2: r.custom ? null : r.area, economia_mes: r.custom ? null : r.economiaMes, economia_pct: r.custom ? null : r.pct, economia_25a: r.custom ? null : r.economia25 },
      origem: Object.fromEntries(Object.entries(attr).filter(([k]) => !k.startsWith('_'))),
      pagina: location.href.slice(0, 500),
      hp: form.ns_hp.value,
    };
    sending = true; btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      // Prévia de aprovação (GitHub Pages): não há backend; simula sucesso sem enviar dado nenhum
      const demo = /\.github\.io$/.test(location.hostname);
      const res = demo ? { ok: true } : await fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true });
      const data = demo ? { ok: true } : await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'falha');
      try { localStorage.removeItem('ns_pending'); } catch (x) {}
      // Enhanced conversions + conversão (inerte sem rótulo) + GA4 (sem valor da conta do cliente) + Meta
      gt('set', 'user_data', { phone_number: '+55' + payload.whatsapp });
      gt('event', 'generate_lead', { lead_type: payload.tipo, conta_faixa: payload.conta_faixa, transaction_id: id });
      if (CFG.labels.lead) gt('event', 'conversion', { send_to: `${CFG.adsId}/${CFG.labels.lead}`, value: 1.0, currency: 'BRL', transaction_id: id });
      fb('track', 'Lead', { content_category: payload.tipo }, { eventID: id });
      $('#okNome').textContent = payload.nome.split(' ')[0];
      $('#rCustom').hidden = !r.custom;
      $('.result').hidden = r.custom;
      $('#rPct').textContent = 'até ' + r.pct + '%';
      $('#rMes').textContent = money(r.economiaMes);
      $('#r25').textContent = moneyK(r.economia25);
      $('#rKwp').textContent = r.kwp.toFixed(2).replace('.', ',') + ' kWp';
      $('#rPlacas').textContent = r.placas;
      const wa = waLink(` Meu nome é ${payload.nome}, sou de ${payload.cidade} e minha conta fica na faixa ${payload.conta_faixa}.`);
      document.querySelectorAll('.js-wa').forEach(a => { a.href = wa; });
      if (mbar) {
        const main = mbar.querySelector('.mbar__main');
        main.textContent = 'Falar com o consultor'; main.href = wa; main.target = '_blank'; main.rel = 'noopener';
        main.addEventListener('click', () => trackWa('mbar_pos_form'));
        mbar.classList.add('is-wa');
      }
      go(3);
    } catch (e) {
      err.innerHTML = 'Não conseguimos enviar agora. <a href="' + waLink(` Conta na faixa ${payload.conta_faixa}, ${payload.cidade}.`) + '" target="_blank" rel="noopener">Fale direto no WhatsApp</a>.';
      err.querySelector('a').addEventListener('click', () => trackWa('erro_envio'));
      try { localStorage.setItem('ns_pending', JSON.stringify(payload)); } catch (x) {}
      const again = document.createElement('button'); again.type = 'button'; again.className = 'retry'; again.textContent = 'Tentar enviar de novo';
      again.addEventListener('click', () => form.requestSubmit()); err.append(' ', again);
      err.hidden = false;
      gt('event', 'lead_error', { motivo: String(e.message).slice(0, 60) });
    } finally {
      sending = false; btn.disabled = false; btn.textContent = calc().custom ? 'Pedir meu estudo sob medida' : 'Receber meu estudo de economia';
    }
  });

  // Lead que falhou numa visita anterior: reenvia em silêncio (mesmo event_id, o backend deduplica)
  try {
    const pend = JSON.parse(localStorage.getItem('ns_pending') || 'null');
    if (pend && pend.event_id) fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pend), keepalive: true })
      .then(r => r.json()).then(d => { if (d && d.ok) localStorage.removeItem('ns_pending'); }).catch(() => {});
  } catch (x) {}

  /* ---------- 5. Topbar, reveal, barra mobile e vídeo ---------- */
  const bar = document.querySelector('.topbar');
  const onScroll = () => bar.classList.toggle('is-solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  setTimeout(() => document.querySelectorAll('.reveal:not(.in)').forEach(el => { if (el.getBoundingClientRect().top < innerHeight * 1.2) el.classList.add('in'); }), 2500);
  addEventListener('beforeprint', () => document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')));

  // Barra fixa do celular: aparece depois que o simulador sai da tela; some sobre o simulador e sobre o CTA final
  if (mbar) {
    let calcGone = false, finalOn = false, dayOn = false;
    const upd = () => { const hide = !calcGone || finalOn || dayOn; mbar.classList.toggle('is-hidden', hide); document.documentElement.classList.toggle('mbar-on', !hide); };
    const dayEl = $('.day');
    if (dayEl) new IntersectionObserver(([e]) => { dayOn = e.isIntersecting && e.intersectionRatio > .5; upd(); }, { threshold: [0, .5, 1] }).observe(dayEl.querySelector('.day__sticky'));
    new IntersectionObserver(([e]) => { calcGone = !e.isIntersecting && e.boundingClientRect.top < 0; upd(); }).observe($('#simulador'));
    const fin = $('.final');
    if (fin) new IntersectionObserver(([e]) => { finalOn = e.isIntersecting; upd(); }, { threshold: .15 }).observe(fin);
  }

})();
