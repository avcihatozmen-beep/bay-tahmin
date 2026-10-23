// Bay Tahmin - analiz modeli. Saf fonksiyonlar; tarayıcıda window.BTModel, Node'da module.exports.
(function (root) {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

  // Az maçlı takımlarda oranları lig ortalamasına (1.0) doğru çek.
  const shrink = (ratio, n, k = 6) => (ratio * n + 1 * k) / (n + k);

  // Puan tablosundan lig ev / deplasman gol ortalamaları.
  function leagueAverages(standingsRows) {
    let hg = 0, hp = 0, ag = 0, ap = 0;
    for (const r of standingsRows || []) {
      hg += num(r.home && r.home.goals && r.home.goals.for);
      hp += num(r.home && r.home.played);
      ag += num(r.away && r.away.goals && r.away.goals.for);
      ap += num(r.away && r.away.played);
    }
    const home = hp > 0 ? hg / hp : 1.45;
    const away = ap > 0 ? ag / ap : 1.15;
    return { home: clamp(home, 0.6, 2.6), away: clamp(away, 0.5, 2.2), played: hp + ap };
  }

  // Bir takımın puan tablosundaki satırından ev/dep hücum ve savunma güçleri.
  function teamStrength(row, avg, side) {
    if (!row) return { att: 1, def: 1, n: 0, ppg: null };
    const s = row[side] || {};
    const n = num(s.played);
    const all = row.all || {};
    const nAll = num(all.played);
    const lgAll = (avg.home + avg.away) / 2;
    // Taraf bazlı (ev/dep) ve genel güçleri karıştır: taraf verisi azsa genel ağırlık artar.
    const sideFor = n ? num(s.goals.for) / n : 0;
    const sideAg = n ? num(s.goals.against) / n : 0;
    const allFor = nAll ? num(all.goals.for) / nAll : 0;
    const allAg = nAll ? num(all.goals.against) / nAll : 0;
    const myAvg = side === 'home' ? avg.home : avg.away;
    const oppAvg = side === 'home' ? avg.away : avg.home;
    const attSide = n ? sideFor / myAvg : 1;
    const defSide = n ? sideAg / oppAvg : 1;
    const attAll = nAll ? allFor / lgAll : 1;
    const defAll = nAll ? allAg / lgAll : 1;
    const w = n / (n + 4);
    const att = shrink(w * attSide + (1 - w) * attAll, nAll);
    const def = shrink(w * defSide + (1 - w) * defAll, nAll);
    return {
      att: clamp(att, 0.35, 2.6),
      def: clamp(def, 0.35, 2.6),
      n: nAll,
      ppg: nAll ? num(row.points) / nAll : null,
      rank: row.rank,
      teams: null,
    };
  }

  // Son maçlardan form: yakın maçlar daha ağır. Sonuç 0..1 (1 = hepsi galibiyet).
  // matches: [{gf, ga, opponentRank?, comp}], en yeni önce.
  function formScore(matches) {
    if (!matches || !matches.length) return { score: 0.5, ppg: null, gd: 0, n: 0, str: '' };
    let wsum = 0, pts = 0, gd = 0, str = '';
    matches.forEach((m, i) => {
      const w = Math.pow(0.85, i);
      const p = m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0;
      pts += w * p; wsum += w * 3;
      gd += w * clamp(m.gf - m.ga, -3, 3);
      str += p === 3 ? 'G' : p === 1 ? 'B' : 'M';
    });
    const raw = matches.reduce((a, m) => a + (m.gf > m.ga ? 3 : m.gf === m.ga ? 1 : 0), 0);
    return { score: pts / wsum, ppg: raw / matches.length, gd: gd / matches.length, n: matches.length, str };
  }

  // Sakat/cezalı oyuncunun takım için önemi.
  // p: {pos:'Goalkeeper'|'Defender'|'Midfielder'|'Attacker', minutes, apps, goals, assists, rating, status:'out'|'doubt'}
  // teamGames, teamGoals: takımın sezon maç ve gol sayısı.
  function playerImpact(p, teamGames, teamGoals) {
    const games = Math.max(1, teamGames || 1);
    const minShare = clamp(num(p.minutes) / (games * 90), 0, 1);
    const contrib = teamGoals > 0 ? clamp((num(p.goals) + 0.6 * num(p.assists)) / teamGoals, 0, 0.8) : 0;
    const rating = num(p.rating, 0);
    const ratingBoost = rating > 0 ? clamp((rating - 6.6) / 1.0, -0.4, 0.8) : 0;
    const certainty = p.status === 'doubt' ? 0.5 : 1;
    const pos = (p.pos || '').charAt(0).toUpperCase();
    // Hücum etkisi: gol katkısı ağır basar; süre ve reyting kilit oyuncuyu öne çıkarır.
    let att = 0, def = 0;
    if (pos === 'A') att = 0.55 * contrib + 0.07 * minShare * (1 + ratingBoost);
    else if (pos === 'M') { att = 0.45 * contrib + 0.05 * minShare * (1 + ratingBoost); def = 0.03 * minShare * (1 + ratingBoost); }
    else if (pos === 'D') { att = 0.3 * contrib; def = 0.065 * minShare * (1 + ratingBoost); }
    else if (pos === 'G') def = 0.11 * minShare * (1 + ratingBoost);
    else att = 0.4 * contrib + 0.03 * minShare;
    att *= certainty; def *= certainty;
    const importance = clamp(att + def, 0, 1);
    let label = 'düşük';
    if (importance >= 0.12) label = 'kritik';
    else if (importance >= 0.06) label = 'yüksek';
    else if (importance >= 0.025) label = 'orta';
    return { att, def, importance, label, minShare, contrib };
  }

  // Toplam eksik etkisi: hücum çarpanı (kendi golü) ve savunma çarpanı (rakip golü).
  function absenceFactors(impacts) {
    let att = 0, def = 0;
    for (const i of impacts || []) { att += i.att; def += i.def; }
    // Azalan getiri: çok sayıda eksik doğrusal toplanmaz.
    att = 1 - Math.exp(-att); def = 1 - Math.exp(-def);
    return { attMult: clamp(1 - att, 0.7, 1), defMult: clamp(1 + def, 1, 1.3) };
  }

  function poisson(k, l) {
    let f = 1; for (let i = 2; i <= k; i++) f *= i;
    return Math.exp(-l) * Math.pow(l, k) / f;
  }

  // Skor matrisi + Dixon-Coles düşük skor düzeltmesi.
  function scoreMatrix(lh, la, rho = -0.06, max = 10) {
    const m = [];
    let total = 0;
    for (let i = 0; i <= max; i++) {
      m[i] = [];
      for (let j = 0; j <= max; j++) {
        let p = poisson(i, lh) * poisson(j, la);
        if (i === 0 && j === 0) p *= 1 - lh * la * rho;
        else if (i === 0 && j === 1) p *= 1 + lh * rho;
        else if (i === 1 && j === 0) p *= 1 + la * rho;
        else if (i === 1 && j === 1) p *= 1 - rho;
        m[i][j] = Math.max(p, 0); total += m[i][j];
      }
    }
    for (let i = 0; i <= max; i++) for (let j = 0; j <= max; j++) m[i][j] /= total;
    return m;
  }

  function marketsFromMatrix(m) {
    let h = 0, d = 0, a = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0;
    const scores = [];
    for (let i = 0; i < m.length; i++) for (let j = 0; j < m[i].length; j++) {
      const p = m[i][j];
      if (i > j) h += p; else if (i === j) d += p; else a += p;
      if (i + j > 1.5) o15 += p;
      if (i + j > 2.5) o25 += p;
      if (i + j > 3.5) o35 += p;
      if (i > 0 && j > 0) btts += p;
      scores.push({ s: i + '-' + j, p });
    }
    scores.sort((x, y) => y.p - x.p);
    return { home: h, draw: d, away: a, over15: o15, over25: o25, over35: o35, btts, topScores: scores.slice(0, 3) };
  }

  // Bahis firmalarının oranlarından marjı temizlenmiş piyasa olasılıkları (medyan).
  // bookmakers: API-Football /odds yanıtındaki bookmakers dizisi.
  function marketProbs(bookmakers) {
    const coll = { x12: [], ou25: [], btts: [] };
    const median = arr => { const s = arr.slice().sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
    for (const bm of bookmakers || []) {
      for (const bet of bm.bets || []) {
        const v = {};
        for (const x of bet.values || []) v[String(x.value)] = num(x.odd);
        if (bet.id === 1 && v.Home && v.Draw && v.Away) {
          const s = 1 / v.Home + 1 / v.Draw + 1 / v.Away;
          coll.x12.push([1 / v.Home / s, 1 / v.Draw / s, 1 / v.Away / s]);
        } else if (bet.id === 5 && v['Over 2.5'] && v['Under 2.5']) {
          const s = 1 / v['Over 2.5'] + 1 / v['Under 2.5'];
          coll.ou25.push(1 / v['Over 2.5'] / s);
        } else if (bet.id === 8 && v.Yes && v.No) {
          const s = 1 / v.Yes + 1 / v.No;
          coll.btts.push(1 / v.Yes / s);
        }
      }
    }
    const out = { n: (bookmakers || []).length };
    if (coll.x12.length) {
      const h = median(coll.x12.map(x => x[0])), d = median(coll.x12.map(x => x[1])), a = median(coll.x12.map(x => x[2]));
      const s = h + d + a; out.home = h / s; out.draw = d / s; out.away = a / s;
    }
    if (coll.ou25.length) out.over25 = median(coll.ou25);
    if (coll.btts.length) out.btts = median(coll.btts);
    return out;
  }

  // Ana tahmin.
  // input: { avg, home:{strength, form, absences:[impact]}, away:{...}, market, cupBoost? }
  function predict(input) {
    const { avg, home, away } = input;
    let lh = avg.home * home.strength.att * away.strength.def;
    let la = avg.away * away.strength.att * home.strength.def;

    // Form farkı: sezon gücüne göre son maçlardaki sapma (±%12'ye kadar).
    const fd = clamp((home.form.score - away.form.score), -1, 1);
    lh *= 1 + 0.12 * fd; la *= 1 - 0.12 * fd;
    // Son maç gol farkı eğilimi küçük etki.
    lh *= 1 + clamp(0.03 * (home.form.gd - away.form.gd), -0.06, 0.06);
    la *= 1 - clamp(0.03 * (home.form.gd - away.form.gd), -0.06, 0.06);

    // Eksikler.
    const ha = absenceFactors(home.absences), aa = absenceFactors(away.absences);
    lh *= ha.attMult * aa.defMult;
    la *= aa.attMult * ha.defMult;

    lh = clamp(lh, 0.15, 4.5); la = clamp(la, 0.1, 4.0);
    const model = marketsFromMatrix(scoreMatrix(lh, la));

    // Piyasa ile harmanla: piyasa varsa ağırlık %55, yoksa yalnız model.
    const mk = input.market || {};
    const wM = input.marketWeight != null ? input.marketWeight : 0.55;
    const blend = (a, b) => (b == null ? a : (1 - wM) * a + wM * b);
    const final = {
      home: blend(model.home, mk.home),
      draw: blend(model.draw, mk.draw),
      away: blend(model.away, mk.away),
      over25: blend(model.over25, mk.over25),
      btts: blend(model.btts, mk.btts),
      over15: model.over15, over35: model.over35,
    };
    const s = final.home + final.draw + final.away;
    final.home /= s; final.draw /= s; final.away /= s;

    return { lambda: { home: lh, away: la }, model, market: mk, final, absence: { home: ha, away: aa }, picks: picks(final, model, mk) };
  }

  // Öneriler: güven eşiği + model ile piyasa arasındaki fark (değer).
  function picks(f, model, mk) {
    const list = [];
    const add = (label, p, modelP, marketP, minP) => {
      if (p < minP) return;
      const edge = marketP != null ? modelP - marketP : null;
      let conf = p >= minP + 0.15 ? 'Yüksek' : p >= minP + 0.07 ? 'Orta' : 'Düşük';
      list.push({ label, p, fair: 1 / p, edge, conf, margin: p - minP });
    };
    add('MS 1', f.home, model.home, mk.home, 0.5);
    add('MS 2', f.away, model.away, mk.away, 0.5);
    add('MS X', f.draw, model.draw, mk.draw, 0.34);
    add('Çifte Şans 1X', f.home + f.draw, model.home + model.draw, mk.home != null ? mk.home + mk.draw : null, 0.74);
    add('Çifte Şans X2', f.away + f.draw, model.away + model.draw, mk.away != null ? mk.away + mk.draw : null, 0.74);
    add('2.5 Üst', f.over25, model.over25, mk.over25, 0.58);
    add('2.5 Alt', 1 - f.over25, 1 - model.over25, mk.over25 != null ? 1 - mk.over25 : null, 0.58);
    add('KG Var', f.btts, model.btts, mk.btts, 0.58);
    add('KG Yok', 1 - f.btts, 1 - model.btts, mk.btts != null ? 1 - mk.btts : null, 0.58);
    add('1.5 Üst', f.over15, model.over15, null, 0.78);
    // Sırala: eşiği ne kadar aştığı + model ile piyasa farkı (değer). Böylece doğal olarak
    // yüksek olasılıklı pazarlar (1.5 Üst, çifte şans) listeyi tek başına doldurmaz.
    list.forEach(x => { x.score = x.margin + (x.edge != null ? clamp(x.edge, -0.1, 0.1) : 0); });
    list.sort((a, b) => b.score - a.score);
    return list.slice(0, 4);
  }

  const api = { leagueAverages, teamStrength, formScore, playerImpact, absenceFactors, scoreMatrix, marketsFromMatrix, marketProbs, predict, picks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BTModel = api;
})(typeof window !== 'undefined' ? window : this);
