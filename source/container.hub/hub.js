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
  var view = store.get('view', 'list');
  if (['list', 'nets', 'logos'].indexOf(view) < 0) view = 'list';
  var S = {
    data: null, stats: {}, hist: {}, view: view, q: '', group: store.get('group', 'folder'),
    collapsed: store.get('collapsed', {}), filter: 'all', sort: store.get('sort', ['name', 1]),
    checked: {}, sel: null, tab: 'info', log: '', logFor: '', tail: 200, icons: null, iconSettings: null, scan: null, busy: false,
    panelW: store.get('panelW', 520), consoleFor: '', liveLog: false
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
  function avatar(c, size, k, upd) {
    var inner = c.icon
      ? '<img src="' + esc(c.icon) + '" alt="" loading="lazy" data-n="' + esc(c.name) + '" data-s="' + size + '" onerror="chIconErr(this)">'
      : mono(c.name, size);
    return '<span class="ch-av k-' + (k || 'off') + '" style="width:' + size + 'px;height:' + size + 'px">' + inner +
      (k ? '<span class="ch-dot"></span>' : '') + (upd ? '<span class="ch-avupd" title="Update available">' + I.up + '</span>' : '') + '</span>';
  }
  var I = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    play: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
    stop: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
    restart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    up: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    ext: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    term: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m5 8 4 4-4 4M12 17h7"/></svg>',
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
  function tagOf(img) { var m = /:([^/:@]+)$/.exec(img || ''); return m ? m[1] : 'latest'; }
  function byName(n) { return (S.data.containers || []).filter(function (c) { return c.name === n; })[0]; }
  function matches(c) {
    if (!S.q) return true;
    var h = [c.name, c.image, c.netmode, c.compose].concat(c.nets.map(function (x) { return x.ip + ' ' + x.net; }), c.ports.map(function (p) { return p.priv + ' ' + p.pub; })).join(' ').toLowerCase();
    return h.indexOf(S.q) >= 0;
  }
  function passFilter(c) {
    var f = S.filter;
    return f === 'all' || (f === 'running' && c.running) || (f === 'stopped' && !c.running) || (f === 'problems' && status(c).k === 'bad') || (f === 'updates' && c.update);
  }
  function memOf(c) {
    var s = S.stats[c.name];
    if (!s || !c.running) return null;
    var lim = c.mem_limit || 0;
    return { used: s.mem, lim: lim, pct: lim ? Math.min(100, s.mem / lim * 100) : null, cpu: s.cpu };
  }
  function natural(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); }
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
      out.push({ key: 'all', name: '', items: cs.slice(), flat: true });
    }
    return out;
  }
  function isCollapsed(g) {
    if (g.flat || S.q || S.filter !== 'all') return false;
    if (g.key in S.collapsed) return S.collapsed[g.key];
    return g.items.every(function (c) { return !c.running && !c.autostart; });
  }

  /* ---------- rendering ---------- */
  function renderShell() {
    root.innerHTML =
      '<div class="ch-top">' +
        '<div class="ch-tabs" role="tablist" aria-label="View">' +
          tab('list', 'Containers') + tab('nets', 'Networks') + tab('logos', 'Logos <span class="ch-badge" id="ch-logo-n" hidden></span>') +
        '</div>' +
        '<label class="ch-search">' + I.search + '<input id="ch-q" type="search" placeholder="Search name, image, IP, port …" aria-label="Search containers"></label>' +
        '<span class="ch-grow"></span>' +
        '<span id="ch-upd-wrap"></span>' +
        '<a class="ch-btn pri" href="/Docker/AddContainer">+ Add container</a>' +
      '</div>' +
      '<div id="ch-summary"></div>' +
      '<div id="ch-body"></div>' +
      '<div class="ch-shade" data-act="close"></div>' +
      '<div class="ch-resizer" id="ch-resizer" role="separator" aria-orientation="vertical" aria-label="Resize details panel" tabindex="0" title="Drag to resize"></div>' +
      '<aside class="ch-drawer" aria-label="Container details" id="ch-drawer"></aside>';
    $('#ch-q').val(S.q);
    applyPanelWidth();
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
    $('#ch-upd-wrap').html(upd.length ? '<button type="button" class="ch-btn upd" data-act="update-all">' + I.up + ' Update all (' + upd.length + ')</button>' : '');
    var miss = S.data.missing_icons;
    $('#ch-logo-n').text(miss).prop('hidden', !miss);
    $('.ch-tab').each(function () { var on = $(this).data('v') === S.view; $(this).toggleClass('on', on).attr('aria-selected', on); });

    var h = '<div class="ch-kpis">' +
      kpi('', 'Running', run, 'of ' + cs.length, '<div class="ch-bar"><i style="width:' + (cs.length ? Math.round(run / cs.length * 100) : 0) + '%"></i></div>', 'running') +
      kpi(bad.length ? 'bad' : '', 'Needs attention', bad.length, bad.length ? 'unhealthy or should be running' : 'all good', '', 'problems') +
      kpi(upd.length ? 'upd' : '', 'Updates available', upd.length, upd.length ? 'containers' : 'everything up to date', '', 'updates') +
      kpi('', 'Memory used', Object.keys(S.stats).length ? fmtMb(memUsed) : '…', host ? 'of ' + fmtMb(host) : '',
        host ? '<div class="ch-bar"><i style="width:' + Math.min(100, Math.round(memUsed / host * 100)) + '%;background:var(--ac)"></i></div>' : '', '') +
      '</div>';
    if (bad.length) {
      h += '<div class="ch-alerts">' + bad.map(function (c) {
        var st = status(c);
        return '<button type="button" class="ch-alert" data-act="open" data-n="' + esc(c.name) + '">' + avatar(c, 34, st.k) +
          '<span style="min-width:0;flex:1"><span class="t">' + esc(c.name) + '</span><br><span class="d">' + esc(st.t) + (c.autostart && !c.running ? ' · autostart is on' : '') + '</span></span>' +
          '<span class="ch-btn sm">Details</span></button>';
      }).join('') + '</div>';
    }
    $('#ch-summary').html(h);

    var mainScroll = $('#ch-body .ch-tablewrap').scrollLeft();
    $('#ch-body').html(S.view === 'nets' ? renderNets() : S.view === 'logos' ? renderLogos() : renderList());
    $('#ch-body .ch-tablewrap').scrollLeft(mainScroll || 0);
    if (S.sel) renderDrawer(false);
  }
  function kpi(cls, label, val, sub, extra, filter) {
    var inner = '<span class="l">' + label + '</span><span class="v"><b>' + val + '</b><span>' + esc(sub) + '</span></span>' + extra;
    return filter
      ? '<button type="button" class="ch-kpi ' + cls + (S.view === 'list' && S.filter === filter ? ' on' : '') + '" data-act="kpi" data-f="' + filter + '" title="Show only these">' + inner + '</button>'
      : '<div class="ch-kpi ' + cls + '">' + inner + '</div>';
  }

  function spark(name, w, hgt) {
    var v = S.hist[name] || [];
    if (v.length < 2) return '';
    w = w || 70; hgt = hgt || 18;
    var max = Math.max(5, Math.max.apply(null, v));
    var pts = v.map(function (x, i) { return (i * w / (v.length - 1)).toFixed(1) + ',' + (hgt - 1 - x / max * (hgt - 3)).toFixed(1); }).join(' ');
    return '<svg class="ch-spark" width="' + w + '" height="' + hgt + '" viewBox="0 0 ' + w + ' ' + hgt + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--info)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>';
  }

  function row(c) {
    var st = status(c), s = S.stats[c.name], m = memOf(c), ip = primaryIp(c);
    var net = c.netmode.indexOf('container:') === 0 ? '→ ' + c.netmode.slice(10) : c.netmode;
    return '<tr class="row k-' + st.k + (S.sel === c.name ? ' sel' : '') + (c.update ? ' has-upd' : '') + '" data-act="open" data-n="' + esc(c.name) + '">' +
      '<td class="c-chk"><input type="checkbox" data-act="check" data-n="' + esc(c.name) + '"' + (S.checked[c.name] ? ' checked' : '') + ' aria-label="Select ' + esc(c.name) + '"></td>' +
      '<td class="c-name"><span class="ch-namecell">' + avatar(c, 30, st.k, c.update) + '<span class="nm"><b>' + esc(c.name) + '</b><span class="ch-muted ch-mono">' + esc(c.image.replace(/^(docker\.io|ghcr\.io|lscr\.io)\//, '')) + '</span></span></span></td>' +
      '<td class="c-st"><span class="ch-st">' + esc(st.t) + '</span>' + (c.running && since(c.started) ? '<span class="ch-muted ch-sub">up ' + since(c.started) + '</span>' : '') + '</td>' +
      '<td class="c-cpu">' + (s && c.running ? '<span class="ch-mono">' + s.cpu.toFixed(1) + ' %</span>' + spark(c.name) : '') + '</td>' +
      '<td class="c-mem">' + (m ? '<span class="ch-memcell">' + (m.lim ? '<span class="ch-bar"><i style="width:' + m.pct + '%;background:' + (m.pct > 85 ? 'var(--ac)' : 'var(--info)') + '"></i></span>' : '') + '<span class="ch-mono">' + fmtMb(m.used) + (m.lim ? ' / ' + fmtMb(m.lim) : '') + '</span></span>' : '') + '</td>' +
      '<td class="c-net ch-mono">' + esc(net) + (ip ? '<span class="ch-sub">' + esc(ip) + '</span>' : '') + '</td>' +
      '<td class="c-upd">' + (c.update
        ? '<button type="button" class="ch-updbtn" data-act="update" data-n="' + esc(c.name) + '" title="Install the new image for ' + esc(tagOf(c.image)) + '">' + I.up + ' Update</button>'
        : '<span class="ch-muted ch-mono" title="Image tag">' + esc(tagOf(c.image)) + '</span>') + '</td>' +
      '<td class="c-act">' +
        (c.running ? '<button type="button" class="ch-ibtn" data-act="do" data-a="stop" data-n="' + esc(c.name) + '" aria-label="Stop ' + esc(c.name) + '" title="Stop">' + I.stop + '</button>'
                   : '<button type="button" class="ch-ibtn" data-act="do" data-a="start" data-n="' + esc(c.name) + '" aria-label="Start ' + esc(c.name) + '" title="Start">' + I.play + '</button>') +
        '<button type="button" class="ch-ibtn" data-act="do" data-a="restart" data-n="' + esc(c.name) + '" aria-label="Restart ' + esc(c.name) + '" title="Restart">' + I.restart + '</button>' +
        (c.url && c.running ? '<a class="ch-ibtn" href="' + esc(c.url) + '" target="_blank" rel="noopener" aria-label="Open WebUI of ' + esc(c.name) + '" title="WebUI" data-act="noop">' + I.ext + '</a>' : '<span class="ch-ibtn ph"></span>') +
      '</td></tr>';
  }

  function sortFn() {
    var sk = S.sort[0], sd = S.sort[1];
    var key = {
      name: function (c) { return c.name.toLowerCase(); },
      status: function (c) { return ['bad', 'warn', 'ok', 'off'].indexOf(status(c).k) + c.name.toLowerCase(); },
      cpu: function (c) { var s = S.stats[c.name]; return s && c.running ? s.cpu : -1; },
      mem: function (c) { var s = S.stats[c.name]; return s && c.running ? s.mem : -1; },
      ip: function (c) { return (c.netmode || '') + ' ' + primaryIp(c); },
      upd: function (c) { return (c.update ? '0' : '1') + c.name.toLowerCase(); }
    }[sk] || function (c) { return c.name; };
    return function (a, b) { var x = key(a), y = key(b); return (typeof x === 'number' ? x - y : natural(x, y)) * sd; };
  }

  function renderList() {
    var all = S.data.containers.filter(matches);
    var counts = { all: all.length, running: 0, stopped: 0, problems: 0, updates: 0 };
    all.forEach(function (c) {
      if (c.running) counts.running++; else counts.stopped++;
      if (status(c).k === 'bad') counts.problems++;
      if (c.update) counts.updates++;
    });
    var nChecked = Object.keys(S.checked).filter(function (n) { return S.checked[n]; }).length;
    var chips = [['all', 'All'], ['running', 'Running'], ['stopped', 'Stopped'], ['problems', 'Needs attention'], ['updates', 'Updates']].map(function (o) {
      return '<button type="button" class="ch-pill' + (S.filter === o[0] ? ' on' : '') + (o[0] === 'updates' && counts.updates ? ' upd' : '') + '" data-act="filter" data-f="' + o[0] + '">' + o[1] + ' <b>' + counts[o[0]] + '</b></button>';
    }).join('');
    var gopts = [['folder', 'Folders'], ['network', 'Networks'], ['compose', 'Compose'], ['none', 'None']].map(function (o) {
      return '<option value="' + o[0] + '"' + (S.group === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    var bulk = nChecked ? '<span class="ch-bulk"><span class="ch-muted">' + nChecked + ' selected</span>' +
      '<button type="button" class="ch-btn sm" data-act="bulk" data-a="start">Start</button>' +
      '<button type="button" class="ch-btn sm" data-act="bulk" data-a="stop">Stop</button>' +
      '<button type="button" class="ch-btn sm" data-act="bulk" data-a="restart">Restart</button>' +
      '<button type="button" class="ch-btn sm upd" data-act="bulk" data-a="update">Update</button>' +
      '<button type="button" class="ch-btn sm" data-act="uncheck">Clear</button></span>' : '';
    var sk = S.sort[0], sd = S.sort[1];
    function th(k, label, cls) { return '<th class="sort ' + cls + '" data-act="sort" data-k="' + k + '" aria-sort="' + (sk === k ? (sd > 0 ? 'ascending' : 'descending') : 'none') + '">' + label + (sk === k ? (sd > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }
    var gs = groups(), sorter = sortFn(), body = '', shown = 0, anyGroups = !gs[0].flat;
    gs.forEach(function (g) {
      var items = g.items.filter(function (c) { return matches(c) && passFilter(c); }).sort(sorter);
      if (!items.length) return;
      if (shown && !g.flat) body += '<tbody class="gap" aria-hidden="true"><tr><td colspan="8"></td></tr></tbody>';
      shown += items.length;
      var closed = isCollapsed(g);
      if (!g.flat) {
        var run = g.items.filter(function (c) { return c.running; }).length;
        var bad = g.items.filter(function (c) { return status(c).k === 'bad'; }).length;
        var upd = g.items.filter(function (c) { return c.update; }).length;
        body += '<tbody class="grp' + (closed ? ' closed' : '') + '"><tr class="ghead"><td colspan="8"><div class="ch-ghead">' +
          '<button type="button" class="ch-gtoggle" data-act="toggle" data-g="' + esc(g.key) + '" aria-expanded="' + !closed + '">' + I.chev +
          (g.icon ? '<img class="ch-ficon" src="' + esc(g.icon) + '" alt="" onerror="this.remove()">' : '') +
          '<span class="gname">' + esc(g.name) + '</span><span class="gcount">' + g.items.length + '</span></button>' +
          '<span class="ch-chip' + (run === g.items.length ? ' ok' : '') + '">' + run + ' / ' + g.items.length + ' running</span>' +
          (bad ? '<span class="ch-chip bad">' + bad + ' need attention</span>' : '') +
          (upd ? '<button type="button" class="ch-chip upd" data-act="group-update" data-g="' + esc(g.key) + '" title="Update all ' + upd + ' in this group">' + I.up + ' ' + upd + ' update' + (upd > 1 ? 's' : '') + '</button>' : '') +
          '<span class="ch-grow"></span>' +
          '<button type="button" class="ch-ibtn" data-act="group-start" data-g="' + esc(g.key) + '" aria-label="Start all in ' + esc(g.name) + '" title="Start all">' + I.play + '</button>' +
          '<button type="button" class="ch-ibtn" data-act="group-stop" data-g="' + esc(g.key) + '" aria-label="Stop all in ' + esc(g.name) + '" title="Stop all">' + I.stop + '</button>' +
          '</div></td></tr>' + (closed ? '' : items.map(row).join('')) + '</tbody>';
      } else {
        body += '<tbody>' + items.map(row).join('') + '</tbody>';
      }
    });
    return '<div class="ch-listbar">' + chips +
      '<label class="ch-groupsel">Group by <select data-act="group" aria-label="Group by">' + gopts + '</select></label>' +
      (anyGroups ? '<button type="button" class="ch-btn sm" data-act="expand-all">Expand all</button><button type="button" class="ch-btn sm" data-act="collapse-all">Collapse all</button>' : '') +
      '<span class="ch-grow"></span>' + bulk + '</div>' +
      '<div class="ch-tablewrap"><table class="ch-table"><thead><tr><th class="c-chk"><input type="checkbox" data-act="check-all" aria-label="Select all"></th>' +
      th('name', 'Container', 'c-name') + th('status', 'Status', 'c-st') + th('cpu', 'CPU', 'c-cpu') + th('mem', 'Memory', 'c-mem') + th('ip', 'Network · IP', 'c-net') + th('upd', 'Version', 'c-upd') + '<th class="c-act"></th></tr></thead>' +
      (body || '<tbody><tr><td colspan="8" class="ch-empty">Nothing to show.</td></tr></tbody>') + '</table></div>' +
      (shown ? '' : '');
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
      var st = status(c), ip = primaryIp(c);
      var h = '<button type="button" class="ch-nitem k-' + st.k + (S.sel === c.name ? ' sel' : '') + '" data-act="open" data-n="' + esc(c.name) + '">' + avatar(c, small ? 24 : 30, st.k, c.update) +
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
      var list = top[n].filter(show).sort(function (a, b) { return (toNum(primaryIp(a)) - toNum(primaryIp(b))) || natural(a.name, b.name); });
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
      return '<div class="ch-lrow"><div class="who">' + avatar(c, 40, '') + '<div style="min-width:0"><b>' + esc(c.name) + '</b><span class="ch-muted ch-mono">' + esc(c.image) + '</span></div></div>' +
        '<span class="ch-chip ' + label[1] + '">' + label[0] + (e.source && (stt === 'auto' || stt === 'manual') ? ' · ' + esc(e.source) : '') + '</span>' +
        '<div class="ch-cands">' + cands + '</div>' +
        '<div class="ch-urlin"><input type="url" placeholder="Image address (https://…)" aria-label="Logo address for ' + esc(c.name) + '" data-n="' + esc(c.name) + '"><button type="button" class="ch-btn sm" data-act="icon-url" data-n="' + esc(c.name) + '">Use</button>' +
        (stt === 'auto' || stt === 'manual' ? '<button type="button" class="ch-btn sm" data-act="icon-reset" data-n="' + esc(c.name) + '">Remove</button>' : '') + '</div></div>';
    }).join('');
    var withUnraid = S.data.containers.filter(function (c) { return c.icon_src === 'unraid' && !ic[c.name]; }).length;
    var last = S.scan && S.scan.last ? new Date(S.scan.last * 1000).toLocaleString() : 'never';
    return '<div class="ch-logos">' +
      '<div style="flex:999 1 560px;min-width:0"><div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px"><b>' + S.data.missing_icons + ' without a logo</b>' +
      '<span class="ch-muted" style="font-size:12px">' + withUnraid + ' containers already have one from their template and are left alone · last search: ' + esc(last) + '</span><span class="ch-grow"></span>' +
      '<button type="button" class="ch-btn pri" data-act="icon-scan"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Searching …' : 'Search now') + '</button></div>' +
      (rows || '<div class="ch-empty">Every container has a logo.</div>') + '</div>' +
      '<div class="ch-panel" style="flex:1 1 280px;max-width:400px"><h3>How logos are found</h3><ol class="ch-steps">' +
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

  /* ---------- details panel ---------- */
  function applyPanelWidth() {
    var max = Math.max(360, window.innerWidth - 80);
    S.panelW = Math.max(320, Math.min(max, S.panelW || 520));
    root.style.setProperty('--panel-w', S.panelW + 'px');
  }
  function termName(n) { return n.replace(/[ #]/g, '_'); }
  function renderDrawer(open) {
    var c = byName(S.sel);
    if (!c) { closeDrawer(); return; }
    var st = status(c), m = memOf(c), s = S.stats[c.name];
    var dependents = S.data.containers.filter(function (x) { return x.netmode === 'container:' + c.name; });
    function btn(a, x, label, cls) { return '<button type="button" class="ch-btn sm ' + (cls || '') + '" data-act="' + a + '" data-a="' + x + '" data-n="' + esc(c.name) + '">' + label + '</button>'; }
    var acts = (c.running
      ? btn('do', 'stop', I.stop + ' Stop') + btn('do', 'restart', I.restart + ' Restart') + (c.paused ? btn('do', 'resume', 'Resume') : btn('do', 'pause', 'Pause'))
      : btn('do', 'start', I.play + ' Start')) +
      (c.url && c.running ? '<a class="ch-btn sm" href="' + esc(c.url) + '" target="_blank" rel="noopener">' + I.ext + ' WebUI</a>' : '') +
      (c.template ? btn('edit', '', I.edit + ' Edit') : '') +
      (c.update ? btn('update', '', I.up + ' Update to newest ' + esc(tagOf(c.image)), 'upd') : '');

    // the console tab keeps its iframe alive across re-renders
    if (!open && S.tab === 'console' && S.consoleFor === c.name && $('#ch-console').length) {
      $('#ch-drawer .ch-dhead-st').html('<span class="ch-st">' + esc(st.t) + '</span>');
      return;
    }
    var body;
    if (S.tab === 'logs') {
      body = '<div class="ch-logbar"><button type="button" class="ch-btn sm" data-act="logs" data-n="' + esc(c.name) + '">' + I.restart + ' Refresh</button>' +
        '<label class="ch-muted">Lines <select data-act="tail" aria-label="Number of log lines">' + [100, 200, 500, 1000, 2000].map(function (n) { return '<option' + (S.tail === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
        '<span class="ch-grow"></span><button type="button" class="ch-btn sm" data-act="fulllog" data-n="' + esc(c.name) + '" title="Follow the log live in a separate window">' + I.ext + ' Live in window</button></div>' +
        '<pre class="ch-log" id="ch-log">' + (S.logFor === c.name ? esc(S.log) || 'No output.' : 'Loading …') + '</pre>';
    } else if (S.tab === 'console') {
      body = c.running
        ? '<div class="ch-logbar"><span class="ch-muted">docker exec -it ' + esc(c.name) + ' ' + esc(c.shell || 'sh') + '</span><span class="ch-grow"></span>' +
          '<button type="button" class="ch-btn sm" data-act="console-reconnect" data-n="' + esc(c.name) + '">' + I.restart + ' Reconnect</button>' +
          '<button type="button" class="ch-btn sm" data-act="console-window" data-n="' + esc(c.name) + '">' + I.ext + ' Window</button></div>' +
          '<div class="ch-termwrap"><iframe id="ch-console" title="Console of ' + esc(c.name) + '" src="about:blank"></iframe></div>'
        : '<div class="ch-empty">The console needs a running container.</div>';
    } else {
      body = '<dl class="ch-dl">' +
        '<dt>Status</dt><dd class="k-' + st.k + '"><span class="ch-st">' + esc(st.t) + '</span>' + (c.running && since(c.started) ? ' · up ' + since(c.started) : (!c.running && since(c.finished) ? ' · stopped ' + since(c.finished) + ' ago' : '')) + (c.restarts ? ' · ' + c.restarts + ' restarts' : '') + '</dd>' +
        '<dt>Autostart</dt><dd><label class="ch-switch"><input type="checkbox" data-act="autostart" data-n="' + esc(c.name) + '"' + (c.autostart ? ' checked' : '') + '><span></span>' + (c.autostart ? 'on' : 'off') + '</label></dd>' +
        '<dt>Image</dt><dd class="ch-mono">' + esc(c.image) + '</dd>' +
        '<dt>Version</dt><dd>' + (c.update ? '<span class="ch-chip upd">' + I.up + ' newer image available</span>' : '<span class="ch-chip ok">up to date</span>') + '</dd>' +
        '<dt>Network</dt><dd class="ch-mono">' + esc(c.netmode) + '</dd>' +
        c.nets.map(function (x) { return '<dt>' + esc(x.net) + '</dt><dd class="ch-mono">' + esc(x.ip || '–') + (x.mac ? '<br><span class="ch-muted">' + esc(x.mac) + '</span>' : '') + '</dd>'; }).join('') +
        (c.ports.length ? '<dt>Ports</dt><dd class="ch-mono">' + c.ports.map(function (p) { return esc((p.pub ? p.pub + ' → ' : '') + p.priv + (p.type ? '/' + p.type : '')); }).join('<br>') + '</dd>' : '') +
        (c.compose ? '<dt>Compose</dt><dd>' + esc(c.compose) + '</dd>' : '') +
        '</dl>';
      if (dependents.length) {
        body += '<div class="ch-sec"><h4>Shares its network with</h4>' + dependents.map(function (d) { return '<button type="button" class="ch-nitem" data-act="open" data-n="' + esc(d.name) + '">' + avatar(d, 24, status(d).k, d.update) + '<span class="nm">' + esc(d.name) + '</span></button>'; }).join('') +
          '<p class="ch-muted" style="font-size:12px;margin:6px 0 0">A restart of ' + esc(c.name) + ' cuts these off. <button type="button" class="ch-btn sm" data-act="restart-tree" data-n="' + esc(c.name) + '">Restart all ' + (dependents.length + 1) + '</button></p></div>';
      }
      body += '<div class="ch-sec"><h4>Resources</h4>' +
        (m ? '<div class="ch-kv"><span>Memory</span><span class="ch-mono">' + fmtMb(m.used) + (m.lim ? ' of ' + fmtMb(m.lim) : ' (no limit)') + '</span></div>' +
          (m.lim ? '<div class="ch-bar"><i style="width:' + m.pct + '%;background:' + (m.pct > 85 ? 'var(--ac)' : 'var(--info)') + '"></i></div>' : '') : '<span class="ch-muted">not running</span>') +
        (s && c.running ? '<div class="ch-kv" style="margin-top:10px"><span>CPU</span><span class="ch-mono">' + s.cpu.toFixed(1) + ' %</span></div><div class="ch-sparkbig">' + spark(c.name, 300, 40) + '</div>' : '') +
        (S.data.toolkit && c.template ? '<p style="font-size:12px;margin:8px 0 0"><a href="/Docker/UpdateContainer?xmlTemplate=edit:' + encodeURIComponent(c.template) + '">Change memory limit</a></p>' : '') + '</div>';
      if (c.mounts.length) {
        body += '<div class="ch-sec"><h4>Volumes</h4>' + c.mounts.map(function (v) { return '<div class="ch-vol ch-mono">' + esc(v.dst) + '<br><span class="ch-muted">' + esc(v.src) + (v.rw ? '' : ' (read-only)') + '</span></div>'; }).join('') + '</div>';
      }
      if (c.project || c.support || c.source) {
        body += '<div class="ch-sec"><h4>Links</h4>' + [[c.project || c.source, 'Project'], [c.support, 'Support']].filter(function (x) { return /^https?:/.test(x[0] || ''); }).map(function (x) { return '<a href="' + esc(x[0]) + '" target="_blank" rel="noopener">' + x[1] + '</a>'; }).join(' · ') + '</div>';
      }
    }
    var keep = open ? 0 : $('#ch-drawer .ch-dbody').scrollTop();
    $('#ch-drawer').html(
      '<div class="ch-dhead">' + avatar(c, 48, st.k) + '<div style="min-width:0;flex:1"><div class="nm">' + esc(c.name) + '</div><div class="ch-dhead-st k-' + st.k + '"><span class="ch-st">' + esc(st.t) + '</span></div></div>' +
      '<button type="button" class="ch-ibtn" data-act="close" aria-label="Close details" title="Close (Esc)">' + I.close + '</button></div>' +
      '<div class="ch-dacts">' + acts + '</div>' +
      '<div class="ch-dtabs" role="tablist">' +
        dtab('info', 'Overview') + dtab('logs', 'Logs') + dtab('console', I.term + ' Console') + '</div>' +
      '<div class="ch-dbody' + (S.tab === 'console' ? ' term' : '') + '">' + body + '</div>');
    function dtab(t, label) { return '<button type="button" role="tab" aria-selected="' + (S.tab === t) + '" class="ch-dtab' + (S.tab === t ? ' on' : '') + '" data-act="dtab" data-t="' + t + '">' + label + '</button>'; }
    $('#ch-drawer .ch-dbody').scrollTop(keep || 0);
    if (open) { root.classList.add('ch-open'); applyPanelWidth(); }
    if (S.tab === 'logs' && S.logFor !== c.name) loadLogs(c.name);
    if (S.tab === 'console' && c.running) startConsole(c);
  }
  function startConsole(c, force) {
    var n = termName(c.name);
    S.consoleFor = c.name;
    $.get('/webGui/include/OpenTerminal.php', { tag: 'docker', name: n, more: c.shell || 'sh' }).always(function () {
      setTimeout(function () {
        var f = document.getElementById('ch-console');
        if (f && S.sel === c.name) f.src = '/logterminal/' + encodeURIComponent(n) + '/' + (force ? '?r=' + Date.now() : '');
      }, 300);
    });
  }
  function openDrawer(n) {
    if (S.sel !== n) { if (S.tab === 'console') S.tab = 'info'; S.consoleFor = ''; }
    S.sel = n;
    renderDrawer(true);
    $('tr.row.sel, .ch-nitem.sel').removeClass('sel');
    $('[data-act=open][data-n="' + cssEsc(n) + '"]').addClass('sel');
  }
  function closeDrawer() {
    S.sel = null; S.consoleFor = '';
    root.classList.remove('ch-open');
    $('#ch-drawer').empty();
    $('tr.row.sel, .ch-nitem.sel').removeClass('sel');
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  function loadLogs(n) {
    api('logs', { name: n, tail: S.tail }).done(function (r) {
      S.log = r.log; S.logFor = n;
      if (S.sel === n && S.tab === 'logs') {
        var el = document.getElementById('ch-log');
        if (el) { el.textContent = r.log || 'No output.'; var b = el.parentNode; b.scrollTop = b.scrollHeight; }
      }
    }).fail(function (x) { toast(err(x), true); });
  }

  // drag the left edge of the panel to resize it
  (function () {
    var drag = null;
    $(root).on('mousedown', '#ch-resizer', function (ev) {
      ev.preventDefault();
      drag = { x: ev.clientX, w: S.panelW };
      root.classList.add('ch-resizing');
    });
    $(document).on('mousemove', function (ev) {
      if (!drag) return;
      S.panelW = drag.w + (drag.x - ev.clientX);
      applyPanelWidth();
    }).on('mouseup', function () {
      if (!drag) return;
      drag = null;
      root.classList.remove('ch-resizing');
      store.set('panelW', S.panelW);
    });
    $(root).on('keydown', '#ch-resizer', function (ev) {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      S.panelW += ev.key === 'ArrowLeft' ? 40 : -40;
      applyPanelWidth();
      store.set('panelW', S.panelW);
    });
    $(window).on('resize', applyPanelWidth);
  })();

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
    window.openDocker('update_container ' + names.map(encodeURIComponent).join('*'), names.length > 1 ? 'Updating ' + names.length + ' containers' : 'Updating ' + names[0], '', 'chReload');
  }
  window.chReload = function () { load(); };
  function groupByKey(k) { return groups().filter(function (x) { return x.key === k; })[0]; }

  $(root).on('click', '[data-act]', function (ev) {
    var el = $(this), a = el.data('act'), n = el.data('n') != null ? String(el.data('n')) : '', c = n ? byName(n) : null;
    if (a === 'noop') { ev.stopPropagation(); return; }
    if (a === 'check' || a === 'check-all' || a === 'autostart' || a === 'icon-setting' || a === 'tail' || a === 'group') { ev.stopPropagation(); return; }
    switch (a) {
      case 'view': S.view = el.data('v'); store.set('view', S.view); if (S.view === 'logos') S.icons = null; render(); break;
      case 'kpi': S.view = 'list'; store.set('view', 'list'); S.filter = S.filter === el.data('f') ? 'all' : el.data('f'); render(); break;
      case 'filter': S.filter = el.data('f'); render(); break;
      case 'sort': var k = el.data('k'); S.sort = [k, S.sort[0] === k ? -S.sort[1] : 1]; store.set('sort', S.sort); render(); break;
      case 'toggle':
        ev.stopPropagation();
        var g = String(el.data('g')), gr = groupByKey(g);
        S.collapsed[g] = !(gr && isCollapsed(gr)); store.set('collapsed', S.collapsed); render(); break;
      case 'expand-all': case 'collapse-all':
        groups().forEach(function (x) { S.collapsed[x.key] = a === 'collapse-all'; }); store.set('collapsed', S.collapsed); render(); break;
      case 'group-start': case 'group-stop': case 'group-update':
        ev.stopPropagation();
        var gs = groupByKey(String(el.data('g')));
        if (!gs) break;
        if (a === 'group-start') runMany(gs.items.filter(function (x) { return !x.running; }), 'start', 'Starting');
        else if (a === 'group-stop') runMany(gs.items.filter(function (x) { return x.running; }), 'stop', 'Stopping');
        else update(gs.items.filter(function (x) { return x.update; }).map(function (x) { return x.name; }));
        break;
      case 'open': if (n) openDrawer(n); break;
      case 'close': closeDrawer(); break;
      case 'dtab': S.tab = el.data('t'); if (S.tab !== 'console') S.consoleFor = ''; renderDrawer(false); break;
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
      case 'uncheck': S.checked = {}; render(); break;
      case 'update': ev.stopPropagation(); if (c) update([c.name]); break;
      case 'update-all': update(S.data.containers.filter(function (x) { return x.update; }).map(function (x) { return x.name; })); break;
      case 'console-window': if (c && typeof window.openTerminal === 'function') window.openTerminal('docker', c.name, c.shell || 'sh'); break;
      case 'console-reconnect': if (c) startConsole(c, true); break;
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
    else if (a === 'check-all') {
      var on = this.checked;
      S.data.containers.filter(function (c) { return matches(c) && passFilter(c); }).forEach(function (c) { S.checked[c.name] = on; });
      render();
    }
    else if (a === 'group') { S.group = this.value; store.set('group', S.group); render(); }
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
  $(document).on('keydown', function (ev) {
    if (ev.key === 'Escape' && S.sel && S.tab !== 'console') closeDrawer();
  });

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
  function busyUi() {
    var a = document.activeElement;
    return $('#ch-q').is(':focus') || (a && a.tagName === 'SELECT') || root.classList.contains('ch-resizing');
  }
  renderShell();
  load();
  loadStats();
  setInterval(function () { if (!document.hidden && !busyUi()) load(); }, 10000);
  setInterval(function () { if (!document.hidden && !busyUi()) loadStats(); }, 15000);
})();
