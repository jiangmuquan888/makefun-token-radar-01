// Token Launch Radar dashboard (model radar-2). Reads window.RADAR, written beside dashboard/ by
// main.ts from the same board that board.json carries, and renders: the ranked board, search and
// filters (category, chain, watchlist/early), five sort orders, a per-protocol detail view with
// the model's full arithmetic and the row's farm plan, and a separate live-token view holding the
// protocols that already trade (the peers the category multiples are learned from). No network:
// every byte it shows is in data.js. State lives in the location hash (#cat=Lending&sel=gauntlet)
// so any view can be linked, screenshotted and reproduced exactly.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');

  function parseHash() {
    var s = { q: '', cat: 'all', chain: 'all', seg: 'all', tab: 'pre', sort: 'implied', sel: null };
    var h = (location.hash || '').replace(/^#/, '');
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length !== 2) return;
      var k = kv[0], v = decodeURIComponent(kv[1]);
      if (k === 'q') s.q = v;
      if (k === 'cat') s.cat = v;
      if (k === 'chain') s.chain = v;
      if (k === 'seg') s.seg = v;
      if (k === 'tab') s.tab = v === 'live' ? 'live' : 'pre';
      if (k === 'sort') s.sort = v;
      if (k === 'sel') s.sel = v;
    });
    return s;
  }
  var state = parseHash();

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function setHash() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat !== 'all') parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.seg !== 'all') parts.push('seg=' + state.seg);
    if (state.tab !== 'pre') parts.push('tab=' + state.tab);
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.sel) parts.push('sel=' + encodeURIComponent(state.sel));
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  var categories = [];
  var chains = [];
  DATA.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort();
  chains.sort();

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.seg === 'watch' && !r.watchlist) return false;
      if (state.seg === 'early' && r.watchlist) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sorted(rows) {
    var out = rows.slice();
    var by = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
      score: function (a, b) { return b.radar_score - a.radar_score; },
    };
    out.sort(by[state.sort] || by.implied);
    return out;
  }

  function scoreBar(score) {
    var wrap = el('span', { class: 'score' });
    var bar = el('span', { class: 'bar' });
    var fill = el('span', { class: 'fill' });
    fill.style.width = score + '%';
    bar.appendChild(fill);
    wrap.appendChild(bar);
    wrap.appendChild(el('b', { text: String(score) }));
    return wrap;
  }

  function detailView(row) {
    var panel = el('section', { class: 'detail', id: 'detail' });
    panel.appendChild(el('div', { class: 'detail-head' },
      el('h2', { text: row.name + ' — rank #' + row.rank }),
      el('span', { class: row.watchlist ? 'badge watch' : 'badge early', text: row.watchlist ? 'WATCHLIST' : 'EARLY FIND' }),
      el('button', { class: 'close', text: 'Close', onclick: function () { state.sel = null; setHash(); render(); } })
    ));
    panel.appendChild(el('p', { class: 'detail-sub', text: (row.category || 'Uncategorized') + ' · ' + row.chains.join(', ') + ' · tracked since ' + (row.listed_at || 'unknown') + ' (' + fmtAge(row.age_days) + ') · records no token yet' }));
    var grid = el('div', { class: 'breakdown' });
    function cell(label, value, note) {
      return el('div', { class: 'cell' }, el('span', { class: 'cell-label', text: label }), el('span', { class: 'cell-value', text: value }), el('span', { class: 'cell-note', text: note }));
    }
    grid.appendChild(cell('TVL (snapshot)', fmtUsd(row.tvl_usd), 'the protocol\u2019s own size'));
    grid.appendChild(cell('Category multiple', '\u00d7' + row.category_multiple.toFixed(2), row.multiple_source === 'category' ? 'median mcap/TVL of ' + row.live_peers + ' live peers in this category' : 'global median mcap/TVL — this category has under 3 live peers'));
    grid.appendChild(cell('Base value', fmtUsd(row.base_value_usd), 'TVL \u00d7 category multiple'));
    grid.appendChild(cell('Growth', '\u00d7' + row.growth_multiplier.toFixed(2), '7d TVL change ' + fmtPct(row.change_7d) + ', damped past +60%'));
    grid.appendChild(cell('Maturity', '\u00d7' + row.maturity_multiplier.toFixed(2), fmtAge(row.age_days) + ' tracked with no token'));
    grid.appendChild(cell('Reach', '\u00d7' + row.reach_multiplier.toFixed(2), row.chains.length + (row.chains.length === 1 ? ' chain' : ' chains')));
    grid.appendChild(cell('Implied value', fmtUsd(row.implied_value_usd), 'base \u00d7 growth \u00d7 maturity \u00d7 reach'));
    grid.appendChild(cell('Radar score', String(row.radar_score) + ' / 100', 'size, momentum, maturity, reach'));
    panel.appendChild(grid);
    panel.appendChild(el('h3', { text: 'How to farm it — ' + row.farm_steps.length + ' steps' }));
    var list = el('ol', { class: 'farm' });
    row.farm_steps.forEach(function (s) { list.appendChild(el('li', { text: s })); });
    panel.appendChild(list);
    return panel;
  }

  function boardTable(rows) {
    var table = el('table', { class: 'board' });
    var head = el('tr', null,
      el('th', { text: '#' }), el('th', { text: 'Protocol' }), el('th', { text: 'Category' }),
      el('th', { text: 'Chains' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: '7d' }),
      el('th', { class: 'num', text: 'Age' }), el('th', { text: 'Radar' }), el('th', { class: 'num', text: 'Implied value' }));
    table.appendChild(el('thead', null, head));
    var body = el('tbody');
    rows.slice(0, 300).forEach(function (r) {
      var tr = el('tr', { class: state.sel === r.slug ? 'selected' : '', onclick: function () { state.sel = r.slug; setHash(); render(); var d = document.getElementById('detail'); if (d) d.scrollIntoView(); } },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('span', { class: 'pname', text: r.name }), el('span', { class: r.watchlist ? 'badge watch' : 'badge early', text: r.watchlist ? 'WATCH' : 'EARLY' })),
        el('td', { text: r.category || '—' }),
        el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : ''), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, scoreBar(r.radar_score)),
        el('td', { class: 'num implied', text: fmtUsd(r.implied_value_usd) }));
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  }

  function liveTable() {
    var table = el('table', { class: 'board' });
    table.appendChild(el('thead', null, el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Market cap' }),
      el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7d' }))));
    var body = el('tbody');
    DATA.live.forEach(function (r) {
      body.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'pname', text: r.name })),
        el('td', { text: r.category || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl === null ? 'n/a' : r.mcap_tvl.toFixed(2) + '\u00d7' }),
        el('td', { class: 'num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : ''), text: fmtPct(r.change_7d) })));
    });
    table.appendChild(body);
    return table;
  }

  function render() {
    app.innerHTML = '';
    app.removeAttribute('aria-busy');
    var totalImplied = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    app.appendChild(el('header', { class: 'masthead' },
      el('div', null,
        el('h1', { text: 'Token Launch Radar' }),
        el('p', { class: 'tagline', text: 'Pre-token protocols ranked by implied value — what each would be worth if it launched at the price the market already pays its live peers. Snapshot ' + DATA.as_of + ', DefiLlama via make.fun.' })
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'protocols ranked' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.watchlist_size) }), el('span', { text: 'watchlist covered' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.early_size) }), el('span', { text: 'early finds below the $50M floor' })),
        el('div', { class: 'stat' }, el('b', { text: fmtUsd(totalImplied) }), el('span', { text: 'combined implied value' }))
      )
    ));
    app.appendChild(el('section', { class: 'model-card' },
      el('h2', { text: 'The model — radar-2, no names priced by hand' }),
      el('p', { text: 'Implied value = TVL \u00d7 category multiple \u00d7 growth \u00d7 maturity \u00d7 reach. The category multiple is the median market-cap/TVL of the live-token protocols in the same category in this very snapshot (global median \u00d7' + DATA.global_multiple.toFixed(2) + ' where a category has under 3 live peers), clamped to \u00d70.08–\u00d72.50. Growth damps the 7-day TVL change past +60% so a one-week spike cannot buy the top. Maturity pays for years tracked with no token; reach pays up to +12% for multi-chain distribution. Protocols that already trade are never ranked — they sit in the Live tab, priced by the market, and they are the peers the multiples are learned from. Click any row for its full arithmetic and farm plan.' })
    ));
    var controls = el('section', { class: 'controls' });
    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q });
    search.addEventListener('input', function () { state.q = search.value; setHash(); renderTableOnly(); });
    controls.appendChild(el('label', null, el('span', { text: 'Search' }), search));
    var catSel = el('select', null, el('option', { value: 'all', text: 'All categories' }));
    categories.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    catSel.value = state.cat;
    catSel.addEventListener('change', function () { state.cat = catSel.value; setHash(); renderTableOnly(); });
    controls.appendChild(el('label', null, el('span', { text: 'Category' }), catSel));
    var chainSel = el('select', null, el('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; setHash(); renderTableOnly(); });
    controls.appendChild(el('label', null, el('span', { text: 'Chain' }), chainSel));
    var segSel = el('select', null,
      el('option', { value: 'all', text: 'Watchlist + early finds' }),
      el('option', { value: 'watch', text: 'Watchlist only' }),
      el('option', { value: 'early', text: 'Early finds only' }));
    segSel.value = state.seg;
    segSel.addEventListener('change', function () { state.seg = segSel.value; setHash(); renderTableOnly(); });
    controls.appendChild(el('label', null, el('span', { text: 'Radar segment' }), segSel));
    var sortSel = el('select', null,
      el('option', { value: 'implied', text: 'Implied value' }),
      el('option', { value: 'tvl', text: 'TVL' }),
      el('option', { value: 'growth', text: '7d growth' }),
      el('option', { value: 'age', text: 'Age (no token longest)' }),
      el('option', { value: 'score', text: 'Radar score' }));
    sortSel.value = state.sort;
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; setHash(); renderTableOnly(); });
    controls.appendChild(el('label', null, el('span', { text: 'Sort by' }), sortSel));
    var tabBtns = el('div', { class: 'tabs' },
      el('button', { class: state.tab === 'pre' ? 'tab active' : 'tab', text: 'Pre-token board', onclick: function () { state.tab = 'pre'; setHash(); render(); } }),
      el('button', { class: state.tab === 'live' ? 'tab active' : 'tab', text: 'Live tokens (the peers)', onclick: function () { state.tab = 'live'; setHash(); render(); } }));
    controls.appendChild(tabBtns);
    app.appendChild(controls);
    var holder = el('div', { id: 'table-holder' });
    app.appendChild(holder);
    renderTableInto(holder);
    app.appendChild(el('footer', { class: 'foot', text: 'Implied values are this radar\u2019s own claim, derived only from the sealed snapshot\u2019s figures — not a prediction that any protocol will issue a token, or when. Farm plans are starting points: check each protocol\u2019s own app before moving funds.' }));
  }
  function renderTableInto(holder) {
    holder.innerHTML = '';
    if (state.tab === 'live') {
      holder.appendChild(el('p', { class: 'count', text: DATA.live_size + ' live-token protocols, priced by the market — the peer set the category multiples are learned from.' }));
      holder.appendChild(liveTable());
      return;
    }
    var rows = sorted(filtered());
    var sel = state.sel ? DATA.rows.filter(function (r) { return r.slug === state.sel; })[0] : null;
    if (sel) {
      var dv = detailView(sel);
      holder.appendChild(dv);
      if (window.requestAnimationFrame) requestAnimationFrame(function () { dv.scrollIntoView(); });
    }
    holder.appendChild(el('p', { class: 'count', text: 'Showing ' + rows.length + ' of ' + DATA.board_size + ' ranked protocols. Rank is the implied value\u2019s order and never changes with sorting or filters.' }));
    holder.appendChild(boardTable(rows));
  }
  function renderTableOnly() {
    var holder = document.getElementById('table-holder');
    if (holder) renderTableInto(holder);
  }
  render();
})();
