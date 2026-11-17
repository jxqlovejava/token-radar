// Token Launch Radar: the page. Vanilla script, no framework, no fetch, no network: everything
// renders from window.TOKEN_RADAR, the data.js the entry program wrote beside this page from the
// same board it wrote to board.json, so what the page shows and what the file says cannot drift.

(function () {
  'use strict';
  var D = window.TOKEN_RADAR;
  if (!D) return;

  var $ = function (id) { return document.getElementById(id); };
  var rows = D.rows;
  var state = { sort: 'rank', dir: 1, q: '', category: '', chain: '', tvl: 0, watch: false, live: false };

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 730) return Math.round(days / 30.4) + ' mo';
    return (days / 365.25).toFixed(1) + ' yr';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- masthead and the fitted model -------------------------------------

  $('model-version').textContent = D.model.version;
  $('as-of').textContent = D.as_of;
  $('fit-sample').textContent = D.model.sample_size;
  $('excluded-count').textContent = D.counts.excluded_products;
  $('fit-global').textContent = '×' + D.model.global_median.toFixed(3);
  $('source-line').textContent = 'Source: ' + D.source + ' · Board generated ' + D.as_of + ' by model ' + D.model.version + '.';

  var statDefs = [
    ['Protocols scanned', D.counts.protocols],
    ['Watchlist covered', D.counts.watchlist + ' / ' + D.counts.watchlist],
    ['Rows ranked', D.counts.board],
    ['Below the floor', D.counts.early],
    ['Top implied value', money(rows.length ? rows[0].implied_value_usd : 0)],
  ];
  $('stats').innerHTML = statDefs
    .map(function (s) { return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>'; })
    .join('');

  var fits = D.model.categories.filter(function (c) { return c.sample >= 2; });
  $('fit-table').innerHTML =
    '<table><caption>The fitted multiples, category by category (only categories with at least two traded protocols are listed; ' +
    'the rest take the global median). Multiple = the shrunk median of market cap / TVL among the category&rsquo;s traded protocols.</caption>' +
    '<thead><tr><th>Category</th><th class="num">Traded sample</th><th class="num">Median mcap/TVL</th><th class="num">Multiple used</th></tr></thead><tbody>' +
    fits
      .map(function (c) {
        return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.sample + '</td><td class="num">×' +
          (c.median_ratio === null ? '—' : c.median_ratio.toFixed(3)) + '</td><td class="num">×' + c.multiple.toFixed(3) + '</td></tr>';
      })
      .join('') +
    '</tbody></table>';

  // ---- filters ------------------------------------------------------------

  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  $('f-category').innerHTML += cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  $('f-chain').innerHTML += chains.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');

  function visible() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.tvl) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function sorted(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var x = a[key], y = b[key];
      if (x === null || x === undefined) x = -Infinity;
      if (y === null || y === undefined) y = -Infinity;
      if (typeof x === 'string') return dir * (x < y ? -1 : x > y ? 1 : 0);
      return dir * (x - y) || (a.rank - b.rank);
    });
  }

  function renderBoard() {
    var list = sorted(visible());
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols shown';
    $('board-empty').hidden = list.length > 0;
    $('board-body').innerHTML = list
      .map(function (r) {
        var chg = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
        return '<tr data-slug="' + esc(r.slug) + '"' + (r.rank <= 3 ? ' class="top"' : '') + '>' +
          '<td class="num rank">' + r.rank + '</td>' +
          '<td><span class="pname">' + esc(r.name) + '</span>' + (r.on_watchlist ? '<span class="watch">WATCHLIST</span>' : '') +
          '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">' + chg + '</td>' +
          '<td class="num">' + ageText(r.age_days) + '</td>' +
          '<td class="num">×' + r.multiple.toFixed(2) + '</td>' +
          '<td class="num implied">' + money(r.implied_value_usd) + '</td>' +
          '<td><button class="farmbtn" data-farm="' + esc(r.slug) + '">Farm plan</button></td></tr>';
      })
      .join('');
    var heads = document.querySelectorAll('#board th[data-sort]');
    heads.forEach(function (th) {
      var label = th.getAttribute('data-label') || th.textContent;
      th.setAttribute('data-label', label);
      th.innerHTML = esc(label) + (th.getAttribute('data-sort') === state.sort ? ' <span class="dir">' + (state.dir === 1 ? '▲' : '▼') + '</span>' : '');
    });
  }

  // ---- detail view ----------------------------------------------------------

  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var fitNote = 'the global median, because its category has too few traded protocols to fit';
    D.model.categories.forEach(function (c) { if (c.category === r.category) fitNote = 'fitted on ' + c.sample + ' traded ' + c.category + ' protocols'; });
    var box = $('detail');
    box.innerHTML =
      '<button class="close" id="detail-close">Close</button>' +
      '<h2>' + esc(r.name) + (r.on_watchlist ? '<span class="watch">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">Rank #' + r.rank + ' of ' + rows.length + ' · ' + esc(r.category || 'Uncategorised') + ' · records no token in the snapshot' +
      (r.listed_at ? ' · tracked by DefiLlama since ' + esc(r.listed_at) : ' · listing date unreported') + '</p>' +
      '<div class="arith">' +
      '<div class="term"><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div><div class="op">×</div>' +
      '<div class="term"><span>Category multiple</span><b>×' + r.multiple.toFixed(3) + '</b></div><div class="op">×</div>' +
      '<div class="term"><span>Growth factor</span><b>×' + r.growth_factor.toFixed(2) + '</b></div><div class="op">×</div>' +
      '<div class="term"><span>Maturity factor</span><b>×' + r.maturity_factor.toFixed(2) + '</b></div><div class="op">=</div>' +
      '<div class="term result"><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<dl class="facts">' +
      '<div><dt>Multiple source</dt><dd>' + esc(fitNote) + '</dd></div>' +
      '<div><dt>7-day TVL change</dt><dd>' + pct(r.change_7d) + '</dd></div>' +
      '<div><dt>Age with no token</dt><dd>' + (r.age_days === null ? 'unknown' : r.age_days + ' days') + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + esc(r.chains.join(', ') || '—') + '</dd></div>' +
      '<div><dt>Watchlist (TVL ≥ $50M)</dt><dd>' + (r.on_watchlist ? 'Yes' : 'No — early radar row') + '</dd></div>' +
      '</dl>' +
      '<h3>How to farm ' + esc(r.name) + '</h3>' +
      '<ol class="plan">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="sub">A launch is not promised by any of this: the plan earns a position in the protocol&rsquo;s own points or activity record if it ever keeps one, and the capital is at risk the whole time it sits there.</p>';
    box.hidden = false;
    $('detail-close').addEventListener('click', function () { box.hidden = true; });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- live view --------------------------------------------------------------

  function renderLive() {
    $('live-wrap').hidden = !state.live;
    if (!state.live) return;
    $('live-body').innerHTML = D.live
      .map(function (r) {
        return '<tr><td><span class="pname">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.symbol || '—') + '</td><td>' + esc(r.category || '—') + '</td>' +
          '<td class="num">' + money(r.mcap_usd) + '</td><td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">×' + r.mcap_to_tvl.toFixed(2) + '</td>' +
          '<td class="num">' + (r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>') + '</td></tr>';
      })
      .join('');
  }

  // ---- wiring -------------------------------------------------------------------

  $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('f-category').addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
  $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  $('f-tvl').addEventListener('change', function (e) { state.tvl = Number(e.target.value); renderBoard(); });
  $('f-watch').addEventListener('change', function (e) { state.watch = e.target.checked; renderBoard(); });
  $('f-live').addEventListener('change', function (e) { state.live = e.target.checked; renderLive(); });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
      if (key === 'rank') state.dir = 1;
      renderBoard();
    });
  });
  $('board-body').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-farm]');
    var tr = e.target.closest('tr[data-slug]');
    if (btn) openDetail(btn.getAttribute('data-farm'));
    else if (tr) openDetail(tr.getAttribute('data-slug'));
  });

  renderBoard();
})();
