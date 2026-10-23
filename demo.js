// Bay Tahmin - demo modu için uydurma örnek veri (gerçek değildir).
(function () {
  'use strict';
  const T = {
    1: 'Galatasaray', 2: 'Fenerbahçe', 3: 'Beşiktaş', 4: 'Trabzonspor', 5: 'Başakşehir', 6: 'Samsunspor',
    11: 'Liverpool', 12: 'Arsenal', 13: 'Chelsea', 14: 'Brighton',
  };
  const team = id => ({ id, name: T[id], logo: '' });
  const row = (rank, id, w, d, l, hf, ha, af, aa, hp, ap) => ({
    rank, team: team(id), points: w * 3 + d, goalsDiff: hf + af - ha - aa,
    all: { played: w + d + l, win: w, draw: d, lose: l, goals: { for: hf + af, against: ha + aa } },
    home: { played: hp, goals: { for: hf, against: ha } }, away: { played: ap, goals: { for: af, against: aa } },
  });
  const tables = {
    203: [row(1, 1, 7, 2, 0, 14, 3, 9, 5, 5, 4), row(2, 2, 6, 2, 1, 12, 4, 8, 6, 4, 5), row(3, 3, 5, 2, 2, 10, 6, 6, 7, 5, 4),
      row(4, 4, 4, 3, 2, 9, 6, 5, 7, 4, 5), row(5, 5, 2, 3, 4, 5, 6, 4, 10, 5, 4), row(6, 6, 1, 2, 6, 4, 9, 3, 13, 4, 5)],
    39: [row(1, 12, 6, 2, 1, 11, 2, 7, 5, 5, 4), row(2, 11, 6, 1, 2, 12, 5, 8, 6, 4, 5), row(3, 13, 4, 3, 2, 8, 5, 6, 6, 5, 4), row(4, 14, 3, 3, 3, 7, 6, 6, 8, 4, 5)],
    2: [row(5, 11, 2, 0, 1, 4, 1, 2, 3, 2, 1), row(14, 1, 1, 1, 1, 3, 2, 2, 4, 1, 2)],
  };
  const today = new Date(); today.setHours(19, 0, 0, 0);
  const fx = (id, lid, lname, h, a, hour) => ({
    fixture: { id, date: new Date(today.getTime() + (hour - 19) * 3600000).toISOString(), timestamp: Math.floor(today.getTime() / 1000) + (hour - 19) * 3600, status: { short: 'NS' } },
    league: { id: lid, name: lname, country: lid === 2 ? 'World' : lid === 39 ? 'England' : 'Turkey', logo: '', season: 2026 },
    teams: { home: team(h), away: team(a) }, goals: { home: null, away: null },
  });
  const fixtures = [fx(901, 203, 'Süper Lig', 1, 4, 19), fx(902, 203, 'Süper Lig', 6, 3, 21), fx(903, 39, 'Premier League', 13, 12, 22), fx(904, 2, 'UEFA Champions League', 11, 1, 22)];
  const lastOf = id => {
    const seq = { 1: [[3, 1], [2, 0], [1, 1], [4, 0], [2, 1], [0, 0]], 4: [[1, 1], [0, 2], [2, 1], [1, 0], [0, 1], [2, 2]], 6: [[0, 2], [1, 3], [1, 1], [0, 1], [2, 1], [0, 0]], 3: [[2, 1], [1, 0], [0, 0], [3, 2], [1, 2], [2, 0]], 13: [[1, 0], [2, 2], [0, 1], [3, 1], [1, 1], [2, 0]], 12: [[2, 0], [1, 0], [3, 1], [0, 0], [2, 1], [1, 1]], 11: [[2, 1], [3, 0], [1, 2], [2, 2], [4, 1], [1, 0]] }[id] || [];
    return seq.map((s, i) => ({ fixture: { timestamp: 1e9 - i }, league: { name: 'Lig' }, teams: { home: team(id), away: { id: 99, name: 'Rakip' } }, goals: { home: s[0], away: s[1] } }));
  };
  const inj = {
    901: [{ player: { id: 501, name: 'M. Icardi', type: 'Missing Fixture', reason: 'Sakatlık' }, team: { id: 1 } }, { player: { id: 502, name: 'U. Nwakaeme', type: 'Questionable', reason: 'Kas ağrısı' }, team: { id: 4 } }],
    902: [{ player: { id: 503, name: 'Kaleci Örnek', type: 'Missing Fixture', reason: 'Kırmızı kart' }, team: { id: 6 } }],
    904: [{ player: { id: 504, name: 'V. van Dijk', type: 'Missing Fixture', reason: 'Sakatlık' }, team: { id: 11 } }],
  };
  const players = {
    501: { pos: 'Attacker', minutes: 640, apps: 8, goals: 7, assists: 2, rating: '7.6' }, 502: { pos: 'Midfielder', minutes: 500, apps: 8, goals: 1, assists: 3, rating: '7.0' },
    503: { pos: 'Goalkeeper', minutes: 810, apps: 9, goals: 0, assists: 0, rating: '6.9' }, 504: { pos: 'Defender', minutes: 810, apps: 9, goals: 1, assists: 0, rating: '7.3' },
  };
  const odds = { 901: [1.55, 4.2, 5.5, 1.75, 2.05, 1.85, 1.95], 902: [3.6, 3.4, 2.05, 2.1, 1.72, 1.8, 2.0], 903: [2.9, 3.4, 2.4, 1.8, 2.0, 1.66, 2.2], 904: [1.45, 4.8, 6.5, 1.55, 2.45, 1.7, 2.1] };
  const oddsResp = o => [{ bookmakers: [{ bets: [
    { id: 1, values: [{ value: 'Home', odd: o[0] }, { value: 'Draw', odd: o[1] }, { value: 'Away', odd: o[2] }] },
    { id: 5, values: [{ value: 'Over 2.5', odd: o[3] }, { value: 'Under 2.5', odd: o[4] }] },
    { id: 8, values: [{ value: 'Yes', odd: o[5] }, { value: 'No', odd: o[6] }] },
  ] }] }];

  function api(path) {
    const q = Object.fromEntries(new URLSearchParams(path.split('?')[1] || ''));
    const p = path.split('?')[0];
    let r = [];
    if (p === '/fixtures' && q.date) r = fixtures;
    else if (p === '/fixtures' && q.team) r = lastOf(+q.team);
    else if (p === '/standings') r = tables[q.league] ? [{ league: { standings: [tables[q.league]] } }] : [];
    else if (p === '/injuries') r = inj[q.fixture] || [];
    else if (p === '/odds') r = odds[q.fixture] ? oddsResp(odds[q.fixture]) : [];
    else if (p === '/players') { const s = players[q.id]; r = s ? [{ statistics: [{ games: { minutes: s.minutes, appearences: s.apps, position: s.pos, rating: s.rating }, goals: { total: s.goals, assists: s.assists } }] }] : []; }
    else if (p === '/leagues') r = [{ league: { id: [11, 12, 13, 14].includes(+q.team) ? 39 : 203, name: [11, 12, 13, 14].includes(+q.team) ? 'Premier League' : 'Süper Lig', type: 'League' } }];
    return new Promise(res => setTimeout(() => res(JSON.parse(JSON.stringify(r))), 120));
  }
  window.BTDemo = { api };
})();
