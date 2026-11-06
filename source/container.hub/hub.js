/* Container Hub for Unraid */
(function () {
  'use strict';
  var API = '/plugins/container.hub/include/api.php';
  var EVENTS = '/plugins/dynamix.docker.manager/include/Events.php';
  var UPDCFG = '/plugins/dynamix.docker.manager/include/UpdateConfig.php';
  var root = document.getElementById('ch');
  if (!root) return;

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('ch-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('ch-' + k, JSON.stringify(v)); } catch (e) {} }
  };
  var S = {
    data: null, stats: {}, hist: {}, view: store.get('view', 'cards'), q: '', group: store.get('group', 'folder'),
    dim: store.get('dim', true), collapsed: store.get('collapsed', {}), filter: 'all', sort: store.get('sort', ['name', 1]),
    checked: {}, sel: null, tab: 'info', log: '', logFor: '', tail: 200, icons: null, iconSettings: null, scan: null, busy: false
  };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function csrf() { return typeof csrf_token !== 'undefined' ? csrf_token : ''; }
  function api(action, params) { return $.ajax({ url: API, data: $.extend({ action: action }, params || {}), dataType: 'json', cache: false }); }
  function apiPost(action, params) { return $.ajax({ url: API, method: 'POST', data: $.extend({ action: action, csrf_token: csrf() }, params || {}), dataType: 'json' }); }
  function unraid(url, params) { return $.ajax({ url: url, method: 'POST', data: $.extend({ csrf_token: csrf() }, params) }); }
  function err(x) { return (x && x.responseJSON && x.responseJSON.error) || (x && x.statusText) || 'Error'; }
  function toast(t, bad) {
    var el = $('<div class="ch-toast' + (bad ? ' bad' : '') + '"></div>').text(t).appendTo(root);
    setTimeout(function () { el.fadeOut(300, function () { el.remove(); }); }, bad ? 6000 : 3000);
  }
  var PAL = ['#2563eb', '#7c3aed', '#0f766e', '#b45309', '#be185d', '#15803d', '#b91c1c', '#0e7490', '#4338ca', '#a16207'];
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function initials(n) {
    var p = n.replace(/^binhex-/i, '').split(/[-_. ]+/).filter(Boolean);
    return (p.length > 1 ? p[0][0] + p[1][0] : n.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).toUpperCase();
  }
  function mono(n, size) {
    return '<span class="mono" style="background:' + PAL[hash(n) % PAL.length] + ';font-size:' + Math.round(size * 0.36) + 'px">' + esc(initials(n)) + '</span>';
  }
  window.chIconErr = function (img) {
    var n = img.getAttribute('data-n'), s = +img.getAttribute('data-s');
    $(img).replaceWith(mono(n, s));
  };
  function avatar(c, size, k) {
    var inner = c.icon
      ? '<img src="' + esc(c.icon) + '" alt="" loading="lazy" data-n="' + esc(c.name) + '" data-s="' + size + '" onerror="chIconErr(this)">'
      : mono(c.name, size);
    return '<span class="ch-av k-' + (k || 'off') + '" style="width:' + size + 'px;height:' + size + 'px">' + inner + (k ? '<span class="ch-dot"></span>' : '') + '</span>';
  }
  var I = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    play: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
    stop: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
    restart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    up: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    ext: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    term: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m5 8 4 4-4 4M12 17h7"/></svg>',
    list: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'
  };

  /* ---------- derived data ---------- */
  function status(c) {
    if (c.paused) return { k: 'warn', t: 'paused' };
    if (c.state === 'restarting') return { k: 'bad', t: 'restarting' };
    if (c.running && c.health === 'unhealthy') return { k: 'bad', t: 'unhealthy' };
    if (c.running && c.health === 'starting') return { k: 'warn', t: 'starting' };
    if (c.running) return { k: 'ok', t: 'running' };
    if (c.autostart) return { k: 'bad', t: c.exit ? 'exited with code ' + c.exit : 'not running' };
    return { k: 'off', t: 'stopped' };
  }
  function since(iso) {
    var t = Date.parse(iso);
    if (!t || t < 86400000) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 60) return m + ' min';
    if (m < 1440) return Math.round(m / 60) + ' h';
    return Math.round(m / 1440) + ' d';
  }
  function primaryIp(c) {
    for (var i = 0; i < c.nets.length; i++) if (c.nets[i].ip) return c.nets[i].ip;
    return '';
  }
  function fmtMb(mb) {
    if (mb == null || isNaN(mb)) return '–';
    return mb >= 1024 ? (mb / 1024).toFixed(mb >= 10240 ? 0 : 1) + ' GB' : Math.round(mb) + ' MB';
  }
  function byName(n) { return (S.data.containers || []).filter(function (c) { return c.name === n; })[0]; }
  function matches(c) {
    if (!S.q) return true;
    var h = [c.name, c.image, c.netmode, c.compose].concat(c.nets.map(function (x) { return x.ip + ' ' + x.net; }), c.ports.map(function (p) { return p.priv + ' ' + p.pub; })).join(' ').toLowerCase();
    return h.indexOf(S.q) >= 0;
  }
  function memOf(c) {
    var s = S.stats[c.name];
    if (!s || !c.running) return null;
    var lim = c.mem_limit || 0;
    return { used: s.mem, lim: lim, pct: lim ? Math.min(100, s.mem / lim * 100) : null, cpu: s.cpu };
  }
  function groups() {
    var cs = S.data.containers, out = [], used = {};
    if (S.group === 'folder' && S.data.folders.length) {
      S.data.folders.forEach(function (f) {
        var items = f.containers.map(byName).filter(Boolean);
        items.forEach(function (c) { used[c.name] = 1; });
        if (items.length) out.push({ key: 'f:' + f.name, name: f.name, icon: f.icon, items: items });
      });
      var rest = cs.filter(function (c) { return !used[c.name]; });
      if (rest.length) out.push({ key: 'f:~', name: 'Not in a folder', items: rest });
    } else if (S.group === 'network') {
      var by = {};
      cs.forEach(function (c) {
        var n = c.netmode || 'none';
        if (n.indexOf('container:') === 0) { var p = byName(n.slice(10)); n = p ? (p.netmode.indexOf('container:') === 0 ? p.netmode.slice(10) : p.netmode) : n; }
        (by[n] = by[n] || []).push(c);
      });
      Object.keys(by).sort(natural).forEach(function (n) { out.push({ key: 'n:' + n, name: n, items: by[n] }); });
    } else if (S.group === 'compose') {
      var bc = {};
      cs.forEach(function (c) { var n = c.compose ? 'Compose: ' + c.compose : (c.managed === 'dockerman' ? 'Unraid templates' : 'Other'); (bc[n] = bc[n] || []).push(c); });
      Object.keys(bc).sort(natural).forEach(function (n) { out.push({ key: 'c:' + n, name: n, items: bc[n] }); });
    } else {
      out.push({ key: 'all', name: 'All containers', items: cs.slice() });
    }
    out.forEach(function (g) { g.items.sort(function (a, b) { return natural(a.name, b.name); }); });
    return out;
  }
  function natural(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); }
  function isCollapsed(g) {
    if (S.q) return false;
    if (g.key in S.collapsed) return S.collapsed[g.key];
    return g.items.every(function (c) { return !c.running && !c.autostart; });
  }

  /* ---------- rendering ---------- */
  function renderShell() {
    root.innerHTML =
      '<div class="ch-top">' +
        '<div class="ch-tabs" role="tablist" aria-label="View">' +
          tab('cards', 'Cards') + tab('list', 'List') + tab('nets', 'Networks') + tab('logos', 'Logos <span class="ch-badge" id="ch-logo-n" hidden></span>') +
        '</div>' +
        '<label class="ch-search">' + I.search + '<input id="ch-q" type="search" placeholder="Search name, image, IP, port …" aria-label="Search containers"></label>' +
        '<span class="ch-grow"></span>' +
        '<span id="ch-upd-wrap"></span>' +
        '<a class="ch-btn pri" href="/Docker/AddContainer">+ Add container</a>' +
      '</div>' +
      '<div id="ch-summary"></div><div id="ch-body"></div>' +
      '<div class="ch-shade" data-act="close"></div><aside class="ch-drawer" aria-label="Container details" id="ch-drawer"></aside>';
    $('#ch-q').val(S.q);
  }
  function tab(v, label) { return '<button type="button" role="tab" class="ch-tab' + (S.view === v ? ' on' : '') + '" data-act="view" data-v="' + v + '" aria-selected="' + (S.view === v) + '">' + label + '</button>'; }

  function render() {
    if (!S.data) return;
    var cs = S.data.containers;
    var run = cs.filter(function (c) { return c.running; }).length;
    var bad = cs.filter(function (c) { return status(c).k === 'bad'; });
    var upd = cs.filter(function (c) { return c.update; });
    var memUsed = 0;
    Object.keys(S.stats).forEach(function (k) { memUsed += S.stats[k].mem || 0; });
    var host = S.data.host_mem_mb || 0;
    $('#ch-upd-wrap').html(upd.length ? '<button type="button" class="ch-btn info" data-act="update-all">' + I.up + ' Update ' + upd.length + '</button>' : '');
    var miss = S.data.missing_icons;
    $('#ch-logo-n').text(miss).prop('hidden', !miss);
    $('.ch-tab').each(function () { var on = $(this).data('v') === S.view; $(this).toggleClass('on', on).attr('aria-selected', on); });

    var h = '<div class="ch-kpis">' +
      kpi('', 'Running', run, 'of ' + cs.length, '<div class="ch-bar"><i style="width:' + (cs.length ? Math.round(run / cs.length * 100) : 0) + '%"></i></div>') +
      kpi(bad.length ? 'bad' : '', 'Needs attention', bad.length, bad.length ? 'unhealthy or should be running' : 'all good', '') +
      kpi(upd.length ? 'info' : '', 'Updates available', upd.length, upd.length ? 'containers' : 'everything up to date', '') +
      kpi('', 'Memory used', Object.keys(S.stats).length ? fmtMb(memUsed) : '…', host ? 'of ' + fmtMb(host) : '',
        host ? '<div class="ch-bar"><i style="width:' + Math.min(100, Math.round(memUsed / host * 100)) + '%;background:var(--ac)"></i></div>' : '') +
      '</div>';
    if (bad.length) {
      h += '<div class="ch-alerts">' + bad.map(function (c) {
        var st = status(c);
        return '<button type="button" class="ch-alert" data-act="open" data-n="' + esc(c.name) + '">' + avatar(c, 36, st.k) +
          '<span style="min-width:0;flex:1"><span class="t">' + esc(c.name) + '</span><br><span class="d">' + esc(st.t) + (c.autostart && !c.running ? ' · autostart is on' : '') + '</span></span>' +
          '<span class="ch-btn sm">' + (c.running ? 'Logs' : 'Details') + '</span></button>';
      }).join('') + '</div>';
    }
    $('#ch-summary').html(h);

    var body = S.view === 'list' ? renderList() : S.view === 'nets' ? renderNets() : S.view === 'logos' ? renderLogos() : renderCards();
    $('#ch-body').html(body);
    if (S.sel) renderDrawer(false);
  }
  function kpi(cls, label, val, sub, extra) {
    return '<div class="ch-kpi ' + cls + '"><div class="l">' + label + '</div><div class="v"><b>' + val + '</b><span>' + esc(sub) + '</span></div>' + extra + '</div>';
  }

  function groupBar(extra) {
    var opts = [['folder', 'Folders'], ['network', 'Networks'], ['compose', 'Compose / templates'], ['none', 'No grouping']];
    return '<span class="ch-muted" style="font-size:12px">Group by</span>' + opts.map(function (o) {
      return '<button type="button" class="ch-pill' + (S.group === o[0] ? ' on' : '') + '" data-act="group" data-g="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '<span class="ch-grow"></span>' + (extra || '');
  }

  function tile(c) {
    var st = status(c), m = memOf(c), ip = primaryIp(c), sub = st.t;
    if (st.k === 'ok') sub = (since(c.started) ? 'up ' + since(c.started) : 'running') + (ip ? ' · ' + ip : '');
    var bar = m ? '<div class="mb" title="' + esc(fmtMb(m.used) + (m.lim ? ' of ' + fmtMb(m.lim) : '')) + '"><i class="' + (m.pct > 85 ? 'hi' : '') + '" style="width:' + (m.pct != null ? m.pct : Math.min(100, m.used / Math.max(1, S.data.host_mem_mb) * 100 * 4)) + '%"></i></div>' : '';
    return '<button type="button" class="ch-tile k-' + st.k + (S.sel === c.name ? ' sel' : '') + '" data-act="open" data-n="' + esc(c.name) + '">' +
      avatar(c, 40, st.k) + '<span class="tx"><span class="nm" title="' + esc(c.name) + '">' + esc(c.name) + '</span><span class="ch-st" style="display:block">' + esc(sub) + '</span>' + bar + '</span>' +
      (c.update ? '<span class="ch-upd" title="Update available">' + I.up + '</span>' : '') + '</button>';
  }

  function renderCards() {
    var gs = groups(), h = '<div class="ch-groupbar">' + groupBar('<label class="ch-set" style="margin:0"><input type="checkbox" data-act="dim"' + (S.dim ? ' checked' : '') + '> Fade stopped containers</label>') + '</div>';
    var any = false;
    h += '<div class="' + (S.dim ? 'ch-dim' : '') + '">';
    gs.forEach(function (g) {
      var items = g.items.filter(matches);
      if (!items.length) return;
      any = true;
      var run = g.items.filter(function (c) { return c.running; }).length;
      var bad = g.items.filter(function (c) { return status(c).k === 'bad'; }).length;
      var closed = isCollapsed(g);
      h += '<section class="ch-group' + (closed ? ' closed' : '') + '">' +
        '<div class="ch-ghead"><button type="button" class="ch-gtoggle" data-act="toggle" data-g="' + esc(g.key) + '" aria-expanded="' + !closed + '">' + I.chev +
        (g.icon ? '<img class="ch-ficon" src="' + esc(g.icon) + '" alt="" onerror="this.remove()">' : '') +
        '<h2>' + esc(g.name) + '</h2></button>' +
        '<span class="ch-chip' + (run === g.items.length ? ' ok' : '') + '">' + run + ' / ' + g.items.length + ' running</span>' +
        (bad ? '<span class="ch-chip bad">' + bad + ' need attention</span>' : '') +
        '<span class="ch-grow"></span>' +
        '<button type="button" class="ch-ibtn" data-act="group-start" data-g="' + esc(g.key) + '" aria-label="Start all in ' + esc(g.name) + '" title="Start all">' + I.play + '</button>' +
        '<button type="button" class="ch-ibtn" data-act="group-stop" data-g="' + esc(g.key) + '" aria-label="Stop all in ' + esc(g.name) + '" title="Stop all">' + I.stop + '</button>' +
        '</div><div class="ch-tiles">' + items.map(tile).join('') + '</div></section>';
    });
    h += '</div>';
    return h + (any ? '' : '<div class="ch-empty">No container matches “' + esc(S.q) + '”.</div>');
  }

  function spark(name) {
    var v = S.hist[name] || [];
    if (v.length < 2) return '';
    var max = Math.max(5, Math.max.apply(null, v)), w = 80, hgt = 20;
    var pts = v.map(function (x, i) { return (i * w / (v.length - 1)).toFixed(1) + ',' + (hgt - 1 - x / max * (hgt - 3)).toFixed(1); }).join(' ');
    return '<svg class="ch-spark" width="' + w + '" height="' + hgt + '" viewBox="0 0 ' + w + ' ' + hgt + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--info)" stroke-width="1.5"/></svg>';
  }

  function renderList() {
    var cs = S.data.containers.filter(matches);
    var counts = { all: cs.length, running: 0, stopped: 0, problems: 0, updates: 0 };
    cs.forEach(function (c) {
      var k = status(c).k;
      if (c.running) counts.running++; else counts.stopped++;
      if (k === 'bad') counts.problems++;
      if (c.update) counts.updates++;
    });
    var f = S.filter;
    cs = cs.filter(function (c) {
      return f === 'all' || (f === 'running' && c.running) || (f === 'stopped' && !c.running) || (f === 'problems' && status(c).k === 'bad') || (f === 'updates' && c.update);
    });
    var sk = S.sort[0], sd = S.sort[1];
    var key = {
      name: function (c) { return c.name.toLowerCase(); },
      status: function (c) { return ['bad', 'warn', 'ok', 'off'].indexOf(status(c).k) + c.name.toLowerCase(); },
      cpu: function (c) { var s = S.stats[c.name]; return s && c.running ? s.cpu : -1; },
      mem: function (c) { var s = S.stats[c.name]; return s && c.running ? s.mem : -1; },
      ip: function (c) { return (c.netmode || '') + ' ' + primaryIp(c); }
    }[sk] || function (c) { return c.name; };
    cs.sort(function (a, b) { var x = key(a), y = key(b); return (typeof x === 'number' ? x - y : natural(x, y)) * sd; });
    var nChecked = Object.keys(S.checked).filter(function (n) { return S.checked[n]; }).length;
    var chips = [['all', 'All'], ['running', 'Running'], ['stopped', 'Stopped'], ['problems', 'Needs attention'], ['updates', 'Updates']].map(function (o) {
      return '<button type="button" class="ch-pill' + (f === o[0] ? ' on' : '') + '" data-act="filter" data-f="' + o[0] + '">' + o[1] + ' <b>' + counts[o[0]] + '</b></button>';
    }).join('');
    var bulk = nChecked ? '<span class="ch-muted" style="font-size:12px">' + nChecked + ' selected</span>' +
      '<button type="button" class="ch-btn sm" data-act="bulk" data-a="start">Start</button>' +
      '<button type="button" class="ch-btn sm" data-act="bulk" data-a="stop">Stop</button>' +
      '<button type="button" class="ch-btn sm" data-act="bulk" data-a="restart">Restart</button>' +
      '<button type="button" class="ch-btn sm info" data-act="bulk" data-a="update">Update</button>' : '';
    function th(k, label) { return '<th class="sort" data-act="sort" data-k="' + k + '" aria-sort="' + (sk === k ? (sd > 0 ? 'ascending' : 'descending') : 'none') + '">' + label + (sk === k ? (sd > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }
    var rows = cs.map(function (c) {
      var st = status(c), s = S.stats[c.name], m = memOf(c), ip = primaryIp(c);
      return '<tr class="row' + (S.sel === c.name ? ' sel' : '') + '" data-act="open" data-n="' + esc(c.name) + '">' +
        '<td style="width:34px;padding-left:14px"><input type="checkbox" data-act="check" data-n="' + esc(c.name) + '"' + (S.checked[c.name] ? ' checked' : '') + ' aria-label="Select ' + esc(c.name) + '"></td>' +
        '<td><span class="ch-namecell">' + avatar(c, 28, st.k) + '<span><b>' + esc(c.name) + '</b><br><span class="ch-muted ch-mono">' + esc(c.image.replace(/^(docker\.io|ghcr\.io|lscr\.io)\//, '')) + '</span></span></span></td>' +
        '<td class="k-' + st.k + '"><span class="ch-st">' + esc(st.t) + '</span>' + (c.running && since(c.started) ? '<br><span class="ch-muted" style="font-size:12px">up ' + since(c.started) + '</span>' : '') + '</td>' +
        '<td>' + (s && c.running ? '<span class="ch-mono">' + s.cpu.toFixed(1) + ' %</span>' + spark(c.name) : '') + '</td>' +
        '<td>' + (m ? '<span class="ch-memcell"><span class="ch-bar"><i style="width:' + (m.pct != null ? m.pct : 0) + '%;background:' + (m.pct > 85 ? 'var(--ac)' : 'var(--info)') + '"></i></span><span class="ch-mono">' + fmtMb(m.used) + (m.lim ? ' / ' + fmtMb(m.lim) : '') + '</span></span>' : '') + '</td>' +
        '<td class="ch-mono">' + esc(c.netmode) + (ip ? '<br>' + esc(ip) : '') + '</td>' +
        '<td>' + (c.update ? '<span class="ch-chip info">available</span>' : '') + '</td>' +
        '<td style="text-align:right;white-space:nowrap;padding-right:12px">' +
          (c.running ? '<button type="button" class="ch-ibtn" data-act="do" data-a="stop" data-n="' + esc(c.name) + '" aria-label="Stop ' + esc(c.name) + '" title="Stop">' + I.stop + '</button>'
                     : '<button type="button" class="ch-ibtn" data-act="do" data-a="start" data-n="' + esc(c.name) + '" aria-label="Start ' + esc(c.name) + '" title="Start">' + I.play + '</button>') +
          '<button type="button" class="ch-ibtn" data-act="do" data-a="restart" data-n="' + esc(c.name) + '" aria-label="Restart ' + esc(c.name) + '" title="Restart">' + I.restart + '</button>' +
          (c.url && c.running ? '<a class="ch-ibtn" href="' + esc(c.url) + '" target="_blank" rel="noopener" aria-label="Open WebUI of ' + esc(c.name) + '" title="WebUI" data-act="noop">' + I.ext + '</a>' : '') +
        '</td></tr>';
    }).join('');
    return '<div class="ch-listbar">' + chips + '<span class="ch-grow"></span>' + bulk + '</div>' +
      '<div class="ch-tablewrap"><table class="ch-table"><thead><tr><th style="width:34px;padding-left:14px"><input type="checkbox" data-act="check-all" aria-label="Select all"></th>' +
      th('name', 'Container') + th('status', 'Status') + th('cpu', 'CPU') + th('mem', 'Memory / limit') + th('ip', 'Network · IP') + '<th>Update</th><th style="text-align:right;padding-right:12px">Actions</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8" class="ch-empty">Nothing to show.</td></tr>') + '</tbody></table></div>';
  }

  function renderNets() {
    var cs = S.data.containers, kids = {}, top = {};
    cs.forEach(function (c) {
      if (c.netmode.indexOf('container:') === 0) (kids[c.netmode.slice(10)] = kids[c.netmode.slice(10)] || []).push(c);
    });
    cs.forEach(function (c) {
      if (c.netmode.indexOf('container:') === 0 && byName(c.netmode.slice(10))) return;
      var n = c.netmode || 'none';
      (top[n] = top[n] || []).push(c);
    });
    function show(c) { return matches(c) || (kids[c.name] || []).some(matches); }
    function item(c, small) {
      var st = status(c), ip = '';
      c.nets.forEach(function (x) { if (x.ip && !ip) ip = x.ip; });
      var h = '<button type="button" class="ch-nitem k-' + st.k + '" data-act="open" data-n="' + esc(c.name) + '">' + avatar(c, small ? 24 : 30, st.k) +
        '<span style="min-width:0;flex:1"><span class="nm" style="display:block">' + esc(c.name) + '</span>' + (small ? '' : '<span class="ch-muted ch-mono">' + esc(ip || (c.ports.length ? 'ports ' + c.ports.map(function (p) { return p.pub || p.priv; }).filter(Boolean).join(', ') : '')) + '</span>') + '</span></button>';
      var k = (kids[c.name] || []).filter(matches);
      if (k.length) h += '<div class="ch-kids" title="share the network of ' + esc(c.name) + '">' + k.sort(function (a, b) { return natural(a.name, b.name); }).map(function (x) { return item(x, true); }).join('') + '</div>';
      return h;
    }
    var names = Object.keys(top).sort(function (a, b) {
      var w = function (n) { var d = (S.data.networks[n] || {}).driver; return d === 'macvlan' || d === 'ipvlan' ? 0 : n === 'bridge' ? 2 : n === 'host' ? 3 : 1; };
      return w(a) - w(b) || natural(a, b);
    });
    var h = '<div class="ch-nets">';
    names.forEach(function (n) {
      var list = top[n].filter(show).sort(function (a, b) {
        return (toNum(primaryIp(a)) - toNum(primaryIp(b))) || natural(a.name, b.name);
      });
      if (!list.length) return;
      var net = S.data.networks[n] || {};
      var count = top[n].length + top[n].reduce(function (s, c) { return s + (kids[c.name] || []).length; }, 0);
      h += '<section class="ch-net"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><h3>' + esc(n) + '</h3><span class="sub">' + esc(net.driver || '') + '</span></div>' +
        '<div class="sub ch-mono">' + esc(net.subnet || (n === 'host' ? 'host network' : '')) + (net.gateway ? ' · gw ' + esc(net.gateway) : '') + '</div>' +
        '<div class="sub" style="margin-top:4px">' + count + ' containers' + (S.data.toolkit && net.subnet && (net.driver === 'macvlan' || net.driver === 'ipvlan') ? ' · <a href="/IPAM">address map</a>' : '') + '</div>' +
        list.map(function (c) { return item(c, false); }).join('') + '</section>';
    });
    return h + '</div><p class="ch-muted" style="font-size:12px;margin-top:12px">Indented containers share the network of the one above (<span class="ch-mono">--network container:…</span>). Restarting the parent cuts them off; the details panel offers to restart them too.</p>';
  }
  function toNum(ip) { return ip ? ip.split('.').reduce(function (s, x) { return s * 256 + (+x); }, 0) : 4e9; }

  /* ---------- logos ---------- */
  function renderLogos() {
    if (!S.icons) { loadIcons(); return '<div class="ch-empty">Loading logo data …</div>'; }
    var set = S.iconSettings || {}, ic = S.icons;
    var cs = S.data.containers.filter(matches);
    var rows = cs.filter(function (c) { return c.icon_src !== 'unraid' || ic[c.name]; }).map(function (c) {
      var e = ic[c.name] || {}, stt = e.status || (c.icon ? '' : 'new');
      var label = { auto: ['found automatically', 'ok'], manual: ['set by you', 'ok'], review: ['please check', 'warn'], none: ['nothing found', ''], dismissed: ['initials (your choice)', ''], 'new': ['not checked yet', ''] }[stt] || ['', ''];
      var cands = (e.candidates || []).filter(function (k) { return k.url !== e.url; }).map(function (k) {
        return '<button type="button" class="ch-cand" data-act="icon-apply" data-n="' + esc(c.name) + '" data-u="' + esc(k.url) + '" data-s="' + esc(k.source) + '" title="' + esc(k.source + ' · ' + k.label + ' · ' + k.score + ' %') + '">' +
          '<img src="' + esc(k.url) + '" alt="" loading="lazy" onerror="this.parentNode.style.display=\'none\'">' + esc(k.source === 'GitHub' ? 'GitHub ' + k.label : k.source === 'WebUI' ? 'favicon' : k.label) + ' <span class="ch-muted">' + k.score + '%</span></button>';
      }).join('');
      return '<div class="ch-lrow"><div class="who">' + avatar(c, 40, '') + '<div style="min-width:0"><b>' + esc(c.name) + '</b><br><span class="ch-muted ch-mono">' + esc(c.image) + '</span></div></div>' +
        '<span class="ch-chip ' + label[1] + '">' + label[0] + (e.source && (stt === 'auto' || stt === 'manual') ? ' · ' + esc(e.source) : '') + '</span>' +
        '<div class="ch-cands">' + cands + '</div>' +
        '<div class="ch-urlin"><input type="url" placeholder="Image address (https://…)" aria-label="Logo address for ' + esc(c.name) + '" data-n="' + esc(c.name) + '"><button type="button" class="ch-btn sm" data-act="icon-url" data-n="' + esc(c.name) + '">Use</button>' +
        (stt === 'auto' || stt === 'manual' ? '<button type="button" class="ch-btn sm" data-act="icon-reset" data-n="' + esc(c.name) + '">Remove</button>' : '') + '</div></div>';
    }).join('');
    var withUnraid = S.data.containers.filter(function (c) { return c.icon_src === 'unraid' && !ic[c.name]; }).length;
    var last = S.scan && S.scan.last ? new Date(S.scan.last * 1000).toLocaleString() : 'never';
    return '<div class="ch-logos">' +
      '<div style="flex:999 1 620px;min-width:0"><div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px"><b>' + S.data.missing_icons + ' without a logo</b>' +
      '<span class="ch-muted" style="font-size:12px">' + withUnraid + ' containers already have one from their template and are left alone · last search: ' + esc(last) + '</span><span class="ch-grow"></span>' +
      '<button type="button" class="ch-btn pri" data-act="icon-scan"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Searching …' : 'Search now') + '</button></div>' +
      (rows || '<div class="ch-empty">Every container has a logo.</div>') + '</div>' +
      '<div class="ch-panel" style="flex:1 1 300px;max-width:400px"><h3>How logos are found</h3><ol class="ch-steps">' +
        '<li><b>1</b><span><strong>Icon collections</strong> – image and container name are matched against dashboard-icons and selfh.st (about 3,000 self-hosted apps).</span></li>' +
        '<li><b>2</b><span><strong>Project avatar</strong> – the GitHub picture of the project behind the image (always needs your OK).</span></li>' +
        '<li><b>3</b><span><strong>WebUI favicon</strong> – the icon of the running web interface.</span></li>' +
        '<li><b>4</b><span><strong>Initials</strong> – two letters on a fixed colour, never a question mark.</span></li></ol>' +
        '<h3 style="margin-top:16px">Settings</h3>' +
        setting('auto_apply', set.auto_apply, 'Apply safe matches automatically', 'from ' + (set.threshold || 90) + ' % match, everything else waits for you') +
        setting('scan_new', set.scan_new, 'Check new containers right away', 'runs in the background when a container without logo appears') +
        setting('write_template', set.write_template, 'Write logos into the Unraid templates', 'so the Docker tab, Folder View and dashboard show them too (templates are backed up first)') +
      '</div></div>';
  }
  function setting(k, on, label, hint) {
    return '<label class="ch-set"><input type="checkbox" data-act="icon-setting" data-k="' + k + '"' + (on ? ' checked' : '') + '><span>' + label + '<small>' + hint + '</small></span></label>';
  }
  function loadIcons() {
    return api('icons').done(function (r) { S.icons = r.icons; S.iconSettings = r.settings; S.scan = r.scan; if (S.view === 'logos') render(); });
  }

  /* ---------- drawer ---------- */
  function renderDrawer(open) {
    var c = byName(S.sel);
    if (!c) { closeDrawer(); return; }
    var st = status(c), m = memOf(c), s = S.stats[c.name];
    var dependents = S.data.containers.filter(function (x) { return x.netmode === 'container:' + c.name; });
    var acts = (c.running
      ? btn('do', 'stop', I.stop + ' Stop') + btn('do', 'restart', I.restart + ' Restart') + (c.paused ? btn('do', 'resume', 'Resume') : btn('do', 'pause', 'Pause'))
      : btn('do', 'start', I.play + ' Start')) +
      (c.url && c.running ? '<a class="ch-btn sm" href="' + esc(c.url) + '" target="_blank" rel="noopener">' + I.ext + ' WebUI</a>' : '') +
      (c.running ? btn('console', '', I.term + ' Console') : '') +
      btn('fulllog', '', I.list + ' Log window') +
      (c.template ? btn('edit', '', I.edit + ' Edit') : '') +
      (c.update ? '<button type="button" class="ch-btn sm info" data-act="update" data-n="' + esc(c.name) + '">' + I.up + ' Update</button>' : '');
    function btn(a, x, label) { return '<button type="button" class="ch-btn sm" data-act="' + a + '" data-a="' + x + '" data-n="' + esc(c.name) + '">' + label + '</button>'; }
    var info = '<dl class="ch-dl">' +
      '<dt>Status</dt><dd class="k-' + st.k + '"><span class="ch-st">' + esc(st.t) + '</span>' + (c.running && since(c.started) ? ' · up ' + since(c.started) : (!c.running && since(c.finished) ? ' · stopped ' + since(c.finished) + ' ago' : '')) + (c.restarts ? ' · ' + c.restarts + ' restarts' : '') + '</dd>' +
      '<dt>Autostart</dt><dd><label class="ch-switch"><input type="checkbox" data-act="autostart" data-n="' + esc(c.name) + '"' + (c.autostart ? ' checked' : '') + '><span></span>' + (c.autostart ? 'on' : 'off') + '</label></dd>' +
      '<dt>Image</dt><dd class="ch-mono">' + esc(c.image) + (c.update ? ' <span class="ch-chip info">update available</span>' : '') + '</dd>' +
      '<dt>Network</dt><dd class="ch-mono">' + esc(c.netmode) + '</dd>' +
      c.nets.map(function (x) { return '<dt>' + esc(x.net) + '</dt><dd class="ch-mono">' + esc(x.ip || '–') + (x.mac ? '<br><span class="ch-muted">' + esc(x.mac) + '</span>' : '') + '</dd>'; }).join('') +
      (c.ports.length ? '<dt>Ports</dt><dd class="ch-mono">' + c.ports.map(function (p) { return esc((p.pub ? p.pub + ' → ' : '') + p.priv + (p.type ? '/' + p.type : '')); }).join('<br>') + '</dd>' : '') +
      (c.compose ? '<dt>Compose</dt><dd>' + esc(c.compose) + '</dd>' : '') +
      '</dl>';
    if (dependents.length) {
      info += '<div class="ch-sec"><h4>Shares its network with</h4>' + dependents.map(function (d) { return '<button type="button" class="ch-nitem" data-act="open" data-n="' + esc(d.name) + '">' + avatar(d, 24, status(d).k) + '<span class="nm">' + esc(d.name) + '</span></button>'; }).join('') +
        '<p class="ch-muted" style="font-size:12px;margin:6px 0 0">A restart of ' + esc(c.name) + ' cuts these off. <button type="button" class="ch-btn sm" data-act="restart-tree" data-n="' + esc(c.name) + '">Restart all ' + (dependents.length + 1) + '</button></p></div>';
    }
    info += '<div class="ch-sec"><h4>Resources</h4>' +
      (m ? '<div style="display:flex;justify-content:space-between;font-size:13px"><span>Memory</span><span class="ch-mono">' + fmtMb(m.used) + (m.lim ? ' of ' + fmtMb(m.lim) : ' (no limit)') + '</span></div>' +
        '<div class="ch-bar"><i style="width:' + (m.pct != null ? m.pct : 0) + '%;background:' + (m.pct > 85 ? 'var(--ac)' : 'var(--info)') + '"></i></div>' : '<span class="ch-muted">not running</span>') +
      (s && c.running ? '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-top:10px"><span>CPU</span><span class="ch-mono">' + s.cpu.toFixed(1) + ' %</span></div>' + spark(c.name).replace('width="80"', 'width="100%"').replace('class="ch-spark"', 'class="ch-spark" preserveAspectRatio="none" style="height:36px"') : '') +
      (S.data.toolkit && c.template ? '<p style="font-size:12px;margin:8px 0 0"><a href="/Docker/UpdateContainer?xmlTemplate=edit:' + encodeURIComponent(c.template) + '">Change memory limit</a></p>' : '') + '</div>';
    if (c.mounts.length) {
      info += '<div class="ch-sec"><h4>Volumes</h4>' + c.mounts.map(function (v) { return '<div class="ch-vol ch-mono">' + esc(v.dst) + '<br><span class="ch-muted">' + esc(v.src) + (v.rw ? '' : ' (read-only)') + '</span></div>'; }).join('') + '</div>';
    }
    if (c.project || c.support || c.source) {
      info += '<div class="ch-sec"><h4>Links</h4>' + [[c.project || c.source, 'Project'], [c.support, 'Support']].filter(function (x) { return /^https?:/.test(x[0] || ''); }).map(function (x) { return '<a href="' + esc(x[0]) + '" target="_blank" rel="noopener">' + x[1] + '</a>'; }).join(' · ') + '</div>';
    }
    var logs = '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><button type="button" class="ch-btn sm" data-act="logs" data-n="' + esc(c.name) + '">Refresh</button>' +
      '<label class="ch-muted" style="font-size:12px">Lines <select data-act="tail" aria-label="Number of log lines">' + [100, 200, 500, 1000].map(function (n) { return '<option' + (S.tail === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></div>' +
      '<pre class="ch-log" id="ch-log">' + (S.logFor === c.name ? esc(S.log) || 'No output.' : 'Loading …') + '</pre>';
    var keep = open ? 0 : $('#ch-drawer .ch-dbody').scrollTop();
    $('#ch-drawer').html(
      '<div class="ch-dhead">' + avatar(c, 52, st.k) + '<div style="min-width:0;flex:1"><div class="nm">' + esc(c.name) + '</div><div class="ch-st k-' + st.k + '" style="margin-top:2px"><span class="ch-st">' + esc(st.t) + '</span></div></div>' +
      '<button type="button" class="ch-ibtn" data-act="close" aria-label="Close details">' + I.close + '</button></div>' +
      '<div class="ch-dacts">' + acts + '</div>' +
      '<div class="ch-dtabs" role="tablist"><button type="button" role="tab" class="ch-dtab' + (S.tab === 'info' ? ' on' : '') + '" data-act="dtab" data-t="info">Overview</button><button type="button" role="tab" class="ch-dtab' + (S.tab === 'logs' ? ' on' : '') + '" data-act="dtab" data-t="logs">Logs</button></div>' +
      '<div class="ch-dbody">' + (S.tab === 'logs' ? logs : info) + '</div>');
    $('#ch-drawer .ch-dbody').scrollTop(keep || 0);
    if (open) root.classList.add('ch-open');
    if (S.tab === 'logs' && S.logFor !== c.name) loadLogs(c.name);
  }
  function openDrawer(n) {
    if (S.sel !== n) { S.tab = 'info'; }
    S.sel = n;
    renderDrawer(true);
    $('.ch-tile.sel, tr.row.sel').removeClass('sel');
    $('[data-act=open][data-n="' + cssEsc(n) + '"]').addClass('sel');
  }
  function closeDrawer() {
    S.sel = null;
    root.classList.remove('ch-open');
    $('.ch-tile.sel, tr.row.sel').removeClass('sel');
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function loadLogs(n) {
    api('logs', { name: n, tail: S.tail }).done(function (r) {
      S.log = r.log; S.logFor = n;
      if (S.sel === n && S.tab === 'logs') { var el = document.getElementById('ch-log'); if (el) { el.textContent = r.log || 'No output.'; el.parentNode.scrollTop = el.parentNode.scrollHeight; } }
    }).fail(function (x) { toast(err(x), true); });
  }

  /* ---------- actions ---------- */
  function act(c, a) {
    return unraid(EVENTS, { action: a, container: c.id }).then(function (r) {
      var res = typeof r === 'string' ? (function () { try { return JSON.parse(r); } catch (e) { return {}; } })() : r;
      if (res && res.success && res.success !== true) toast(c.name + ': ' + res.success, true);
      if (res && res.error) toast(c.name + ': ' + res.error, true);
    });
  }
  function seq(list, fn) {
    var p = $.Deferred().resolve().promise();
    list.forEach(function (c) { p = p.then(function () { return fn(c); }); });
    return p;
  }
  function runMany(list, a, label) {
    if (!list.length) return;
    toast(label + ' ' + list.length + ' container' + (list.length > 1 ? 's' : '') + ' …');
    seq(list, function (c) { return act(c, a); }).always(function () { load(); });
  }
  function update(names) {
    if (!names.length) return;
    if (typeof window.openDocker !== 'function') { location.href = '/Docker'; return; }
    window.openDocker('update_container ' + names.map(encodeURIComponent).join('*'), names.length > 1 ? 'Updating containers' : 'Updating the container', '', 'chReload');
  }
  window.chReload = function () { load(); };

  $(root).on('click', '[data-act]', function (ev) {
    var el = $(this), a = el.data('act'), n = el.data('n') != null ? String(el.data('n')) : '', c = n ? byName(n) : null;
    if (a === 'noop') { ev.stopPropagation(); return; }
    if (a === 'check' || a === 'check-all' || a === 'autostart' || a === 'dim' || a === 'icon-setting' || a === 'tail') { ev.stopPropagation(); return; }
    switch (a) {
      case 'view': S.view = el.data('v'); store.set('view', S.view); if (S.view === 'logos') S.icons = null; render(); break;
      case 'group': S.group = el.data('g'); store.set('group', S.group); render(); break;
      case 'filter': S.filter = el.data('f'); render(); break;
      case 'sort': var k = el.data('k'); S.sort = [k, S.sort[0] === k ? -S.sort[1] : 1]; store.set('sort', S.sort); render(); break;
      case 'toggle':
        var g = String(el.data('g')), gr = groups().filter(function (x) { return x.key === g; })[0];
        S.collapsed[g] = !(gr && isCollapsed(gr)); store.set('collapsed', S.collapsed); render(); break;
      case 'group-start': case 'group-stop':
        ev.stopPropagation();
        var gs = groups().filter(function (x) { return x.key === String(el.data('g')); })[0];
        if (!gs) break;
        if (a === 'group-start') runMany(gs.items.filter(function (x) { return !x.running; }), 'start', 'Starting');
        else runMany(gs.items.filter(function (x) { return x.running; }), 'stop', 'Stopping');
        break;
      case 'open': if (n) openDrawer(n); break;
      case 'close': closeDrawer(); break;
      case 'dtab': S.tab = el.data('t'); renderDrawer(false); break;
      case 'do':
        ev.stopPropagation();
        if (!c) break;
        el.prop('disabled', true);
        act(c, el.data('a')).always(function () { load(); });
        break;
      case 'restart-tree':
        var deps = S.data.containers.filter(function (x) { return x.netmode === 'container:' + n && x.running; });
        toast('Restarting ' + n + ' and ' + deps.length + ' dependent container' + (deps.length === 1 ? '' : 's') + ' …');
        act(c, 'restart').then(function () { return seq(deps, function (d) { return act(d, 'restart'); }); }).always(function () { load(); });
        break;
      case 'bulk':
        var sel = S.data.containers.filter(function (x) { return S.checked[x.name]; }), ba = el.data('a');
        if (ba === 'update') update(sel.filter(function (x) { return x.update; }).map(function (x) { return x.name; }));
        else runMany(sel.filter(function (x) { return ba === 'start' ? !x.running : x.running; }), ba, { start: 'Starting', stop: 'Stopping', restart: 'Restarting' }[ba]);
        break;
      case 'update': if (c) update([c.name]); break;
      case 'update-all': update(S.data.containers.filter(function (x) { return x.update; }).map(function (x) { return x.name; })); break;
      case 'console': if (c && typeof window.openTerminal === 'function') window.openTerminal('docker', c.name, c.shell || 'sh'); break;
      case 'fulllog': if (c && typeof window.openTerminal === 'function') window.openTerminal('docker', c.name, '.log'); break;
      case 'edit': if (c && c.template) location.href = '/Docker/UpdateContainer?xmlTemplate=edit:' + encodeURIComponent(c.template); break;
      case 'logs': if (c) { S.logFor = ''; renderDrawer(false); } break;
      case 'icon-scan':
        S.busy = true; render();
        apiPost('icons_scan', { force: 1 }).done(function (r) {
          var x = r.result || {};
          toast(x.busy ? 'A search is already running' : 'Checked ' + (x.checked || 0) + ': ' + (x.applied || 0) + ' applied, ' + (x.review || 0) + ' to check, ' + (x.none || 0) + ' without match');
        }).fail(function (x) { toast(err(x), true); }).always(function () { S.busy = false; S.icons = null; load(); });
        break;
      case 'icon-apply':
        el.prop('disabled', true);
        apiPost('icon_apply', { name: n, url: el.data('u'), source: el.data('s') }).done(function (r) { toast(r.message); })
          .fail(function (x) { toast(err(x), true); }).always(function () { S.icons = null; load(); });
        break;
      case 'icon-url':
        var u = $.trim(el.siblings('input').val());
        if (!u) { el.siblings('input').focus(); break; }
        apiPost('icon_apply', { name: n, url: u, source: 'manual' }).done(function (r) { toast(r.message); })
          .fail(function (x) { toast(err(x), true); }).always(function () { S.icons = null; load(); });
        break;
      case 'icon-reset':
        apiPost('icon_reset', { name: n }).done(function (r) { toast(r.message); }).fail(function (x) { toast(err(x), true); }).always(function () { S.icons = null; load(); });
        break;
    }
  });
  $(root).on('change', '[data-act]', function () {
    var el = $(this), a = el.data('act'), n = el.data('n') != null ? String(el.data('n')) : '';
    if (a === 'check') { S.checked[n] = this.checked; render(); }
    else if (a === 'check-all') { var on = this.checked; S.data.containers.filter(matches).forEach(function (c) { S.checked[c.name] = on; }); render(); }
    else if (a === 'dim') { S.dim = this.checked; store.set('dim', S.dim); render(); }
    else if (a === 'tail') { S.tail = +this.value; S.logFor = ''; renderDrawer(false); }
    else if (a === 'autostart') {
      var c = byName(n), on2 = this.checked;
      unraid(UPDCFG, { action: 'autostart', container: encodeURIComponent(n), auto: on2 ? 'true' : 'false', wait: c ? c.wait : '' })
        .done(function () { toast('Autostart for ' + n + (on2 ? ' enabled' : ' disabled')); }).fail(function (x) { toast(err(x), true); }).always(function () { load(); });
    } else if (a === 'icon-setting') {
      var p = {}; p[el.data('k')] = this.checked ? '1' : '0';
      apiPost('settings', p).done(function (r) { S.iconSettings = r.settings; }).fail(function (x) { toast(err(x), true); });
    }
  });
  $(root).on('input', '#ch-q', function () { S.q = $.trim(this.value).toLowerCase(); render(); });
  $(root).on('keydown', '.ch-urlin input', function (ev) { if (ev.key === 'Enter') $(this).siblings('[data-act=icon-url]').click(); });
  $(document).on('keydown', function (ev) { if (ev.key === 'Escape' && S.sel) closeDrawer(); });

  /* ---------- data loading ---------- */
  var loading = false;
  function load() {
    if (loading) return;
    loading = true;
    api('state').done(function (r) {
      S.data = r;
      S.data.networks = r.networks || {};
      if (S.view === 'logos') { loadIcons(); }
      render();
    }).fail(function (x) {
      if (!S.data) $('#ch-body').html('<div class="ch-empty">Could not load containers: ' + esc(err(x)) + '</div>');
    }).always(function () { loading = false; });
  }
  function loadStats() {
    api('stats').done(function (r) {
      S.stats = r.stats || {};
      Object.keys(S.stats).forEach(function (n) {
        var h = S.hist[n] = S.hist[n] || [];
        h.push(S.stats[n].cpu);
        if (h.length > 30) h.shift();
      });
      render();
    });
  }
  renderShell();
  load();
  loadStats();
  setInterval(function () { if (!document.hidden && !$('#ch-q').is(':focus')) load(); }, 10000);
  setInterval(function () { if (!document.hidden) loadStats(); }, 15000);
})();
