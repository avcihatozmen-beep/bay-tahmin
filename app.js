// Bay Tahmin - veri çekme ve arayüz.
(function () {
  'use strict';
  const M = window.BTModel;
  const API = 'https://v3.football.api-sports.io';
  const TZ = 'Europe/Istanbul';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = p => (p == null ? '–' : Math.round(p * 100) + '%');

  const LEAGUES = [
    { id: 203, name: 'Süper Lig', c: 'Türkiye' },
    { id: 204, name: '1. Lig', c: 'Türkiye' },
    { id: 206, name: 'Türkiye Kupası', c: 'Türkiye' },
    { id: 2, name: 'Şampiyonlar Ligi', c: 'Avrupa' },
    { id: 3, name: 'Avrupa Ligi', c: 'Avrupa' },
    { id: 848, name: 'Konferans Ligi', c: 'Avrupa' },
    { id: 39, name: 'Premier League', c: 'İngiltere' },
    { id: 40, name: 'Championship', c: 'İngiltere' },
    { id: 140, name: 'La Liga', c: 'İspanya' },
    { id: 135, name: 'Serie A', c: 'İtalya' },
    { id: 78, name: 'Bundesliga', c: 'Almanya' },
    { id: 61, name: 'Ligue 1', c: 'Fransa' },
    { id: 88, name: 'Eredivisie', c: 'Hollanda' },
    { id: 94, name: 'Primeira Liga', c: 'Portekiz' },
    { id: 144, name: 'Jupiler Pro League', c: 'Belçika' },
    { id: 179, name: 'Premiership', c: 'İskoçya' },
  ];
  // Farklı liglerden takımları kıyaslamak için kaba lig gücü katsayıları.
  const LEAGUE_COEF = { 39: 1.0, 140: 0.96, 135: 0.94, 78: 0.93, 61: 0.87, 94: 0.82, 88: 0.8, 144: 0.76, 203: 0.74, 179: 0.68, 40: 0.78, 141: 0.72, 136: 0.7, 79: 0.72, 62: 0.66, 204: 0.56, 197: 0.66, 218: 0.66, 207: 0.68, 119: 0.66, 235: 0.7, 333: 0.62, 210: 0.64, 345: 0.66 };
  const coef = id => LEAGUE_COEF[id] || 0.6;

  // ---------- Ayarlar ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* yer yok */ } },
  };
  const settings = Object.assign({ key: '', leagues: LEAGUES.map(l => l.id), marketWeight: 0.55, demo: false }, store.get('bt:settings', {}));
  const saveSettings = () => store.set('bt:settings', settings);

  // ---------- API ----------
  const TTL = { fixturesDay: 30, standings: 360, last: 360, injuries: 180, odds: 60, players: 4320, leagues: 10080 };
  let usedThisSession = 0;

  function cacheGet(k, ttlMin) {
    const v = store.get('bt:c:' + k, null);
    if (v && Date.now() - v.t < ttlMin * 60000) return v.d;
    return undefined;
  }
  function cacheSet(k, d) {
    try { localStorage.setItem('bt:c:' + k, JSON.stringify({ t: Date.now(), d })); }
    catch (e) { pruneCache(); try { localStorage.setItem('bt:c:' + k, JSON.stringify({ t: Date.now(), d })); } catch (e2) { /* geç */ } }
  }
  function pruneCache() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('bt:c:')) keys.push(k); }
    keys.forEach(k => localStorage.removeItem(k));
  }

  async function api(path, ttlMin) {
    if (settings.demo) return window.BTDemo.api(path);
    const cached = ttlMin ? cacheGet(path, ttlMin) : undefined;
    if (cached !== undefined) return cached;
    if (!settings.key) throw new Error('Önce Ayarlar bölümünden API anahtarını gir.');
    const res = await fetch(API + path, { headers: { 'x-apisports-key': settings.key } });
    usedThisSession++;
    if (!res.ok) throw new Error('Sunucu hatası: ' + res.status);
    const j = await res.json();
    const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
    if (errs && errs.length) {
      const msg = errs.join(' ');
      if (/season/i.test(msg) && /plan/i.test(msg)) throw new Error('Ücretsiz plan bu sezona erişim vermiyor: ' + msg);
      if (/request/i.test(msg) && /limit/i.test(msg)) throw new Error('Günlük istek limiti doldu: ' + msg);
      throw new Error(msg);
    }
    if (ttlMin) cacheSet(path, j.response);
    return j.response;
  }

  async function refreshStatus() {
    const el = $('#quota');
    if (settings.demo) { el.textContent = 'Demo modu'; return; }
    if (!settings.key) { el.textContent = 'Anahtar yok'; return; }
    try {
      const res = await fetch(API + '/status', { headers: { 'x-apisports-key': settings.key } });
      const j = await res.json();
      const r = j.response && j.response.requests;
      el.textContent = r ? `Kalan istek: ${r.limit_day - r.current} / ${r.limit_day}` : 'Durum alınamadı';
    } catch (e) { el.textContent = 'Durum alınamadı'; }
  }

  // ---------- Veri toplama ----------
  const standingsCache = {};
  async function standings(league, season) {
    const k = league + '/' + season;
    if (!standingsCache[k]) standingsCache[k] = api(`/standings?league=${league}&season=${season}`, TTL.standings)
      .then(r => (r[0] && r[0].league && r[0].league.standings) ? r[0].league.standings.flat() : [])
      .catch(() => []);
    return standingsCache[k];
  }

  async function domesticLeague(teamId, season) {
    const r = await api(`/leagues?team=${teamId}&season=${season}`, TTL.leagues).catch(() => []);
    const lg = (r || []).filter(x => x.league.type === 'League');
    if (!lg.length) return null;
    // Bilinen katsayısı en yüksek olanı (genellikle takımın ana ligi) seç.
    lg.sort((a, b) => coef(b.league.id) - coef(a.league.id));
    return { id: lg[0].league.id, name: lg[0].league.name, season };
  }

  async function lastMatches(teamId) {
    const r = await api(`/fixtures?team=${teamId}&last=6&timezone=${TZ}`, TTL.last).catch(() => []);
    return (r || []).filter(f => f.goals.home != null).sort((a, b) => b.fixture.timestamp - a.fixture.timestamp).map(f => {
      const home = f.teams.home.id === teamId;
      return {
        gf: home ? f.goals.home : f.goals.away, ga: home ? f.goals.away : f.goals.home,
        opp: home ? f.teams.away.name : f.teams.home.name, venue: home ? 'E' : 'D', comp: f.league.name,
      };
    });
  }

  async function playerInfo(id, season) {
    const r = await api(`/players?id=${id}&season=${season}`, TTL.players).catch(() => []);
    const p = r && r[0];
    if (!p) return null;
    let minutes = 0, apps = 0, goals = 0, assists = 0, rsum = 0, rw = 0, pos = '';
    for (const s of p.statistics || []) {
      const m = s.games.minutes || 0;
      minutes += m; apps += s.games.appearences || 0;
      goals += s.goals.total || 0; assists += s.goals.assists || 0;
      if (s.games.rating) { rsum += parseFloat(s.games.rating) * m; rw += m; }
      if (!pos && s.games.position) pos = s.games.position;
    }
    return { minutes, apps, goals, assists, rating: rw ? rsum / rw : 0, pos };
  }

  async function analyzeFixture(fx) {
    const L = fx.league, season = L.season;
    const hId = fx.teams.home.id, aId = fx.teams.away.id;

    const [compTable, hLast, aLast, injuries, odds] = await Promise.all([
      standings(L.id, season),
      lastMatches(hId), lastMatches(aId),
      api(`/injuries?fixture=${fx.fixture.id}`, TTL.injuries).catch(() => []),
      api(`/odds?fixture=${fx.fixture.id}`, TTL.odds).catch(() => []),
    ]);

    const findRow = (rows, id) => rows.find(r => r.team && r.team.id === id);
    let isLeague = !!(findRow(compTable, hId) && findRow(compTable, aId)) && L.type !== 'Cup' && !/cup|kupa|champions|europa|conference/i.test(L.name);

    let hDom, aDom, hRows, aRows;
    if (isLeague) {
      hDom = aDom = { id: L.id, name: L.name, season };
      hRows = aRows = compTable;
    } else {
      [hDom, aDom] = await Promise.all([domesticLeague(hId, season), domesticLeague(aId, season)]);
      [hRows, aRows] = await Promise.all([hDom ? standings(hDom.id, season) : [], aDom ? standings(aDom.id, season) : []]);
    }
    const hRow = findRow(hRows, hId), aRow = findRow(aRows, aId);
    const hAvg = M.leagueAverages(hRows), aAvg = M.leagueAverages(aRows);
    const avg = isLeague ? hAvg : { home: (hAvg.home + aAvg.home) / 2, away: (hAvg.away + aAvg.away) / 2 };

    const hStr = M.teamStrength(hRow, hAvg, 'home');
    const aStr = M.teamStrength(aRow, aAvg, 'away');
    if (!isLeague && hDom && aDom && hDom.id !== aDom.id) {
      // Farklı liglerdeki takımlar: lig gücü farkını hücum/savunmaya yansıt.
      const ratio = Math.sqrt(coef(hDom.id) / coef(aDom.id));
      hStr.att *= ratio; hStr.def /= ratio;
      aStr.att /= ratio; aStr.def *= ratio;
    }

    // Sakatlık / ceza: oyuncu önemini sezon istatistiğinden hesapla.
    const absences = { home: [], away: [] };
    const injList = (injuries || []).filter(x => x.team && (x.team.id === hId || x.team.id === aId)).slice(0, 16);
    await Promise.all(injList.map(async inj => {
      const side = inj.team.id === hId ? 'home' : 'away';
      const row = side === 'home' ? hRow : aRow;
      const teamGames = row ? row.all.played : 10;
      const teamGoals = row ? row.all.goals.for : 12;
      const info = await playerInfo(inj.player.id, season) || { minutes: 0, goals: 0, assists: 0, rating: 0, pos: '' };
      const status = /question|doubt/i.test(inj.player.type || '') ? 'doubt' : 'out';
      const imp = M.playerImpact(Object.assign({}, info, { status }), teamGames, teamGoals);
      absences[side].push(Object.assign({ name: inj.player.name, reason: inj.player.reason, status, info }, imp));
    }));
    absences.home.sort((a, b) => b.importance - a.importance);
    absences.away.sort((a, b) => b.importance - a.importance);

    const bms = odds && odds[0] ? odds[0].bookmakers : [];
    const market = M.marketProbs(bms);

    const pred = M.predict({
      avg,
      home: { strength: hStr, form: M.formScore(hLast), absences: absences.home },
      away: { strength: aStr, form: M.formScore(aLast), absences: absences.away },
      market, marketWeight: settings.marketWeight,
    });

    const cupRow = !isLeague ? { home: findRow(compTable, hId), away: findRow(compTable, aId) } : null;
    return {
      fx, pred, isLeague,
      home: { name: fx.teams.home.name, row: hRow, dom: hDom, cup: cupRow && cupRow.home, last: hLast, form: M.formScore(hLast), abs: absences.home, tableSize: hRows.length },
      away: { name: fx.teams.away.name, row: aRow, dom: aDom, cup: cupRow && cupRow.away, last: aLast, form: M.formScore(aLast), abs: absences.away, tableSize: aRows.length },
    };
  }

  // ---------- Arayüz ----------
  let fixtures = [];
  const results = {};

  function todayStr(offset = 0) {
    const d = new Date(Date.now() + offset * 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }

  async function loadFixtures() {
    const date = $('#date').value || todayStr();
    const list = $('#list');
    list.innerHTML = '<p class="muted center">Maçlar yükleniyor…</p>';
    try {
      const r = await api(`/fixtures?date=${date}&timezone=${TZ}`, TTL.fixturesDay);
      const wanted = new Set(settings.leagues);
      fixtures = (r || []).filter(f => wanted.has(f.league.id)).sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
      renderList();
    } catch (e) {
      list.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    }
    refreshStatus();
  }

  function renderList() {
    const list = $('#list');
    if (!fixtures.length) { list.innerHTML = '<p class="muted center">Seçili liglerde bu tarihte maç yok. Ayarlardan lig ekleyebilirsin.</p>'; return; }
    const groups = {};
    fixtures.forEach(f => { (groups[f.league.id] = groups[f.league.id] || { L: f.league, items: [] }).items.push(f); });
    const order = settings.leagues;
    list.innerHTML = Object.values(groups).sort((a, b) => order.indexOf(a.L.id) - order.indexOf(b.L.id)).map(g => `
      <section class="league">
        <h2>${g.L.logo ? `<img src="${esc(g.L.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}${esc(g.L.name)} <span class="muted">${esc(g.L.country)}</span></h2>
        ${g.items.map(matchCard).join('')}
      </section>`).join('');
    list.querySelectorAll('[data-an]').forEach(b => b.addEventListener('click', () => runOne(+b.dataset.an)));
    Object.keys(results).forEach(id => { if (results[id] && document.getElementById('r' + id)) renderResult(+id); });
  }

  function matchCard(f) {
    const t = new Date(f.fixture.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
    const done = f.goals.home != null && /FT|AET|PEN/.test(f.fixture.status.short);
    const live = f.goals.home != null && !done;
    return `<article class="match" id="m${f.fixture.id}">
      <div class="row">
        <span class="time">${done ? 'MS' : live ? '<b class="live">' + esc(f.fixture.status.elapsed || '') + "'</b>" : t}</span>
        <span class="teams"><span>${esc(f.teams.home.name)}</span><span>${esc(f.teams.away.name)}</span></span>
        <span class="score">${f.goals.home != null ? `<span>${f.goals.home}</span><span>${f.goals.away}</span>` : ''}</span>
        <button class="btn small" data-an="${f.fixture.id}">Analiz</button>
      </div>
      <div class="result" id="r${f.fixture.id}"></div>
    </article>`;
  }

  async function runOne(id) {
    const f = fixtures.find(x => x.fixture.id === id);
    const box = document.getElementById('r' + id);
    if (!f || !box) return;
    if (results[id]) { box.classList.toggle('hidden'); return; }
    box.innerHTML = '<p class="muted">Analiz ediliyor: puan durumu, form, sakatlıklar, piyasa…</p>';
    try {
      results[id] = await analyzeFixture(f);
      renderResult(id);
    } catch (e) {
      box.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    }
    refreshStatus();
  }

  async function runAll() {
    const pending = fixtures.filter(f => !results[f.fixture.id] && f.goals.home == null);
    if (!pending.length) return;
    if (!settings.demo && !confirm(`${pending.length} maç analiz edilecek. Maç başına yaklaşık 6-15 istek harcanır (önbellekte olanlar hariç). Devam edilsin mi?`)) return;
    for (const f of pending) { await runOne(f.fixture.id); }
    renderSummary();
  }

  function standingLine(t) {
    const out = [];
    if (t.row) out.push(`${esc(t.dom ? t.dom.name : '')}: <b>${t.row.rank}.</b> / ${t.tableSize} · ${t.row.points} puan · ${t.row.all.win}G ${t.row.all.draw}B ${t.row.all.lose}M · Av ${t.row.goalsDiff > 0 ? '+' : ''}${t.row.goalsDiff}`);
    else out.push('<span class="muted">Lig puan durumu bulunamadı</span>');
    if (t.cup) out.push(`Kupa grubu/tablosu: <b>${t.cup.rank}.</b> · ${t.cup.points} puan (${t.cup.all.played} maç)`);
    return out.join('<br>');
  }

  function formBadges(t) {
    if (!t.last.length) return '<span class="muted">Son maç verisi yok</span>';
    return t.last.map(m => {
      const r = m.gf > m.ga ? 'G' : m.gf === m.ga ? 'B' : 'M';
      return `<span class="fb ${r}" title="${esc(m.comp)} · ${esc(m.opp)} (${m.venue})">${r}</span>`;
    }).join('') + ` <span class="muted small">son ${t.last.length}: ${t.last.map(m => m.gf + '-' + m.ga).join(', ')}</span>`;
  }

  function absList(t) {
    if (!t.abs.length) return '<span class="muted">Bildirilen eksik yok</span>';
    return '<ul class="abs">' + t.abs.map(a => {
      const posTr = { G: 'Kaleci', D: 'Defans', M: 'Orta saha', A: 'Forvet' }[(a.info.pos || '').charAt(0)] || '';
      const stat = a.info.apps ? `${a.info.apps} maç, ${a.info.goals}G ${a.info.assists}A${a.info.rating ? ', ' + a.info.rating.toFixed(2) : ''}` : 'sezon verisi yok';
      return `<li><span class="imp ${a.label}">${a.label}</span> <b>${esc(a.name)}</b> <span class="muted small">${posTr} · ${stat} · ${a.status === 'doubt' ? 'şüpheli' : 'yok'} (${esc(a.reason || '')})</span></li>`;
    }).join('') + '</ul>';
  }

  function bar(label, p, m) {
    return `<div class="bar"><span class="bl">${label}</span><span class="bt"><span style="width:${Math.round(p * 100)}%"></span></span><span class="bv">${pct(p)}</span><span class="bm muted small">${m != null ? 'piyasa ' + pct(m) : ''}</span></div>`;
  }

  function renderResult(id) {
    const R = results[id], box = document.getElementById('r' + id);
    if (!R || !box) return;
    const P = R.pred, f = P.final, mk = P.market;
    const picks = P.picks.length ? P.picks.map(p => `
      <div class="pick"><b>${p.label}</b><span>${pct(p.p)}</span><span class="muted small">adil oran ${p.fair.toFixed(2)}</span><span class="conf ${p.conf}">${p.conf}</span>${p.edge != null && p.edge > 0.04 ? '<span class="value">değer</span>' : ''}</div>`).join('')
      : '<p class="muted">Güçlü bir öneri çıkmadı; maç dengeli görünüyor.</p>';
    box.innerHTML = `
      <div class="picks">${picks}</div>
      <div class="xg">Gol beklentisi: <b>${P.lambda.home.toFixed(2)}</b> – <b>${P.lambda.away.toFixed(2)}</b> · Olası skorlar: ${P.model.topScores.map(s => s.s + ' (' + pct(s.p) + ')').join(', ')}</div>
      ${bar('1', f.home, mk.home)}${bar('X', f.draw, mk.draw)}${bar('2', f.away, mk.away)}
      ${bar('2.5 Üst', f.over25, mk.over25)}${bar('KG Var', f.btts, mk.btts)}
      <div class="muted small">${mk.n ? mk.n + ' bahis firmasının oranları harmanlandı (ağırlık %' + Math.round(settings.marketWeight * 100) + ')' : 'Oran verisi yok, yalnızca model kullanıldı'}</div>
      <details><summary>Takım detayları</summary>
        ${['home', 'away'].map(s => `<div class="team">
          <h3>${esc(R[s].name)}</h3>
          <p>${standingLine(R[s])}</p>
          <p>Form: ${formBadges(R[s])}</p>
          <p>Eksikler (hücum etkisi −${Math.round((1 - P.absence[s].attMult) * 100)}%, savunma zaafı +${Math.round((P.absence[s].defMult - 1) * 100)}%):</p>${absList(R[s])}
        </div>`).join('')}
      </details>`;
    box.classList.remove('hidden');
  }

  function renderSummary() {
    const all = [];
    Object.values(results).forEach(R => R.pred.picks.slice(0, 1).forEach(p => all.push({ R, p })));
    all.sort((a, b) => b.p.score - a.p.score);
    const top = all.filter(x => x.p.conf !== 'Düşük').slice(0, 6);
    $('#summary').innerHTML = top.length ? `<h2>Günün öne çıkanları</h2>` + top.map(x => `
      <div class="pick" data-go="${x.R.fx.fixture.id}"><span class="small">${esc(x.R.home.name)} – ${esc(x.R.away.name)}</span><b>${x.p.label}</b><span>${pct(x.p.p)}</span><span class="conf ${x.p.conf}">${x.p.conf}</span></div>`).join('') : '';
    $('#summary').querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => document.getElementById('m' + el.dataset.go).scrollIntoView({ behavior: 'smooth' })));
  }

  // ---------- Ayarlar paneli ----------
  function openSettings() {
    $('#key').value = settings.key;
    $('#mw').value = Math.round(settings.marketWeight * 100);
    $('#mwv').textContent = $('#mw').value + '%';
    $('#demo').checked = settings.demo;
    $('#leagues').innerHTML = LEAGUES.map(l => `<label><input type="checkbox" value="${l.id}" ${settings.leagues.includes(l.id) ? 'checked' : ''}> ${esc(l.name)} <span class="muted small">${esc(l.c)}</span></label>`).join('');
    $('#extra').value = settings.leagues.filter(id => !LEAGUES.some(l => l.id === id)).join(', ');
    $('#settings').showModal();
  }
  function closeSettings(save) {
    if (save) {
      settings.key = $('#key').value.trim();
      settings.marketWeight = (+$('#mw').value) / 100;
      settings.demo = $('#demo').checked;
      const ids = [...$('#leagues').querySelectorAll('input:checked')].map(i => +i.value);
      $('#extra').value.split(/[,\s]+/).map(Number).filter(n => n > 0).forEach(n => ids.includes(n) || ids.push(n));
      settings.leagues = ids;
      saveSettings();
      Object.keys(results).forEach(k => delete results[k]);
      loadFixtures();
    }
    $('#settings').close();
  }

  function init() {
    $('#date').value = todayStr();
    $('#load').addEventListener('click', loadFixtures);
    $('#all').addEventListener('click', runAll);
    $('#date').addEventListener('change', () => { Object.keys(results).forEach(k => delete results[k]); $('#summary').innerHTML = ''; loadFixtures(); });
    $('#gear').addEventListener('click', openSettings);
    $('#save').addEventListener('click', () => closeSettings(true));
    $('#cancel').addEventListener('click', () => closeSettings(false));
    $('#mw').addEventListener('input', () => { $('#mwv').textContent = $('#mw').value + '%'; });
    $('#clear').addEventListener('click', () => { pruneCache(); alert('Önbellek temizlendi.'); });
    if (!settings.key && !settings.demo) openSettings(); else loadFixtures();
    refreshStatus();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  document.addEventListener('DOMContentLoaded', init);
})();
