/* Shared rendering for sections 1..7 dashboards.
   Uses DOM-creation API (createElement + textContent) for all user data — no innerHTML
   on dynamic content, so manager dashboards are XSS-safe by construction. */

(function () {
  'use strict';

  var state = {
    config: null,
    chartViolations: null,
    chartTrend: null,
    chartDailyBar: null,
    chartSources: null,
    chartParties: null,
    chartIncidents: null,
    lastData: null
  };

  function qs(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'style') node.setAttribute('style', attrs[k]);
        else if (k === 'text') node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // Format numbers with Arabic thousands grouping; pass through anything non-numeric.
  function fmtNum(v) {
    if (v == null || v === '') return '0';
    if (typeof v === 'number') return v.toLocaleString('en-US');
    var s = String(v);
    // If the value is a pure integer (e.g. "21321412"), format it.
    if (/^-?\d+$/.test(s)) return parseInt(s, 10).toLocaleString('en-US');
    // If it's a decimal like "224.9 د", format the numeric part only.
    var m = s.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (m) {
      var num = parseFloat(m[1]);
      if (!isNaN(num)) return num.toLocaleString('en-US', { maximumFractionDigits: 1 }) + (m[2] || '');
    }
    return s;
  }

  function buildQuery() {
    var p = MGR.params();
    var q = new URLSearchParams();
    ['date_mode', 'date_from', 'date_to', 'violation_type_id', 'responsible_party_id', 'source_party_id'].forEach(function (k) {
      if (p[k]) q.set(k, p[k]);
    });
    if (!p.date_mode) q.set('date_mode', 'day');
    return q.toString();
  }

  function renderKpis(kpis) {
    var grid = qs('kpi-grid');
    if (!grid) return;
    var palette = ['green', 'gold', 'red', 'blue', 'gray'];
    clear(grid);
    kpis.forEach(function (k, i) {
      var cls = palette[i % palette.length];
      grid.appendChild(
        el('div', { class: 'kpi-card ' + cls }, [
          el('div', { class: 'kpi-num', text: fmtNum(k.value) }),
          el('div', { class: 'kpi-label', text: k.label_ar || '' })
        ])
      );
    });
  }

  function renderViolationsChart(breakdown) {
    var canvas = qs('chart-violations');
    if (!canvas) return;
    var nonZero = (breakdown || []).filter(function (b) { return (b.count || 0) > 0; });
    if (state.chartViolations) state.chartViolations.destroy();
    if (!nonZero.length) {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9ab0a0';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات', canvas.width / 2, canvas.height / 2);
      return;
    }
    var labels = nonZero.map(function (b) { return b.name_ar; });
    var data = nonZero.map(function (b) { return b.count; });
    var colors = ['#1a7a3f', '#c9a84c', '#d64545', '#2563a8', '#888780', '#0f4d2a', '#a16207'];
    state.chartViolations = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: labels.map(function (_, i) { return colors[i % colors.length]; }),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } }
      }
    });
  }

  function renderTrendChart(daily) {
    var canvas = qs('chart-trend');
    if (!canvas) return;
    if (state.chartTrend) state.chartTrend.destroy();
    if (!daily || daily.length === 0) {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9ab0a0';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات', canvas.width / 2, canvas.height / 2);
      return;
    }
    var labels = daily.map(function (d) { return d.day; });
    state.chartTrend = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'محاضر',  data: daily.map(function (d) { return d.mahadir_count; }),     borderColor: '#d64545', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false },
          { label: 'شكاوى',  data: daily.map(function (d) { return d.shakawi_count; }),     borderColor: '#c9a84c', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false },
          { label: 'بلاغات', data: daily.map(function (d) { return d.balaghat_count; }),    borderColor: '#1a7a3f', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false },
          { label: 'مرفقات', data: daily.map(function (d) { return d.attachments_count; }), borderColor: '#2563a8', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true, precision: 0 }
        }
      }
    });
  }

  function makeRow(cells) {
    var tr = document.createElement('tr');
    cells.forEach(function (c) {
      var td = document.createElement('td');
      if (c && c.wrap) td.className = 'wrap';
      td.textContent = c == null ? '' : (c.text != null ? c.text : String(c));
      tr.appendChild(td);
    });
    return tr;
  }

  // Section-data column keys that are quantitative and benefit from thousands grouping.
  var NUMERIC_COLS = {
    expected_arrivals: 1, expected_departures: 1,
    arrivals_count: 1, departures_count: 1,
    arriving_flights: 1, departing_flights: 1, arriving_buses: 1, departing_buses: 1,
    total_visitors: 1, permits_issued: 1,
    hospital_visits: 1, admitted_cases: 1, death_cases: 1, patient_cases: 1,
    archive_cards: 1, activated_cards: 1, total_arrivals: 1, unreceived_cards: 1,
    bus_count: 1
  };

  function renderSectionTable(rowsByTable, shifts, columns) {
    var tbody = document.querySelector('#tbl-section tbody');
    if (!tbody) return;  // Page has no default section table; delegated to onSectionData.
    var shiftMap = {};
    shifts.forEach(function (s) { shiftMap[s.id] = s; });

    var allRows = [];
    Object.keys(rowsByTable).forEach(function (tname) {
      (rowsByTable[tname] || []).forEach(function (r) {
        var s = shiftMap[r.shift_id] || {};
        allRows.push({ row: r, shift: s, tableName: tname });
      });
    });

    clear(tbody);
    if (!allRows.length) {
      var em = qs('empty-section'); if (em) em.style.display = 'block';
      return;
    }
    var em2 = qs('empty-section'); if (em2) em2.style.display = 'none';

    allRows.forEach(function (item) {
      var cells = columns.map(function (col) {
        var src = (col.source === 'shift') ? item.shift : item.row;
        var v = src ? src[col.key] : '';
        if (v == null) return '';
        if (NUMERIC_COLS[col.key]) return fmtNum(v);
        return v;
      });
      tbody.appendChild(makeRow(cells));
    });
  }

  function renderMahadir(rows) {
    var tbody = document.querySelector('#tbl-mahadir tbody');
    qs('badge-mahadir').textContent = String(rows.length);
    clear(tbody);
    if (!rows.length) { qs('empty-mahadir').style.display = 'block'; return; }
    qs('empty-mahadir').style.display = 'none';
    rows.forEach(function (r, i) {
      tbody.appendChild(makeRow([
        i + 1,
        r.shift_date || '',
        r.report_number || '',
        r.violation_name || '',
        r.location_name || '',
        r.responsible_party_name || '',
        r.start_time || '—',
        r.end_time || '—',
        r.processing_minutes != null ? r.processing_minutes : '—',
        { text: r.notes || '', wrap: true },
        r.employee_name || ''
      ]));
    });
  }

  function renderComplaints(rows, badgeId, tableId, emptyId) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    qs(badgeId).textContent = String(rows.length);
    clear(tbody);
    if (!rows.length) { qs(emptyId).style.display = 'block'; return; }
    qs(emptyId).style.display = 'none';
    rows.forEach(function (r, i) {
      tbody.appendChild(makeRow([
        i + 1,
        r.shift_date || '',
        r.case_number || '',
        r.source_party_name || '',
        r.start_time || '—',
        r.end_time || '—',
        r.processing_minutes != null ? r.processing_minutes : '—',
        { text: r.notes || '', wrap: true },
        r.employee_name || ''
      ]));
    });
  }

  function renderAttachments(items) {
    var grid = qs('attach-grid');
    qs('badge-attachments').textContent = String(items.length);
    clear(grid);
    if (!items.length) { qs('empty-attachments').style.display = 'block'; return; }
    qs('empty-attachments').style.display = 'none';
    items.forEach(function (a) { grid.appendChild(buildAttachTile(a)); });
  }

  function buildAttachTile(att) {
    var isImg = (att.mime_type || '').indexOf('image/') === 0;
    var url = (window.DemoAPI ? window.DemoAPI.attachmentUrl(att.id) : '/api/upload/' + att.id);
    var thumb = el('div', {
      class: 'attach-thumb ' + (isImg ? 'img' : 'icon'),
      style: isImg ? "background-image:url('" + url + "')" : ''
    });
    var meta = el('div', { class: 'attach-meta' }, [
      el('div', { class: 'name', title: att.original_name || '', text: att.original_name || '' }),
      el('div', { class: 'sub', text: (att.mime_type || '') + ' · ' + MGR.fmtBytes(att.size_bytes) })
    ]);
    var actions = el('div', { class: 'attach-actions' }, [
      el('a', { class: 'preview', href: url, target: '_blank', rel: 'noopener', text: '👁 معاينة' }),
      el('a', { class: 'download', href: url, download: att.original_name || 'file', text: '⬇ تحميل' })
    ]);
    var card = el('div', { class: 'attach-tile' });
    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(actions);
    return card;
  }

  // Stacked bar: محاضر / شكاوى / بلاغات / مرفقات per day
  function renderDailyBar(daily) {
    var canvas = qs('chart-daily-bar');
    if (!canvas) return;
    if (state.chartDailyBar) state.chartDailyBar.destroy();
    if (!daily || !daily.length) {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9ab0a0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات', canvas.width / 2, canvas.height / 2);
      return;
    }
    var labels = daily.map(function (d) { return d.day; });
    state.chartDailyBar = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'محاضر',  data: daily.map(function (d) { return d.mahadir_count; }),     backgroundColor: '#d64545', borderRadius: 4 },
          { label: 'شكاوى',  data: daily.map(function (d) { return d.shakawi_count; }),     backgroundColor: '#c9a84c', borderRadius: 4 },
          { label: 'بلاغات', data: daily.map(function (d) { return d.balaghat_count; }),    backgroundColor: '#1a7a3f', borderRadius: 4 },
          { label: 'مرفقات', data: daily.map(function (d) { return d.attachments_count; }), backgroundColor: '#2563a8', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true, precision: 0 }
        }
      }
    });
  }

  // Donut: complaint sources distribution
  function renderSourcesChart(rows) {
    var canvas = qs('chart-sources');
    if (!canvas) return;
    if (state.chartSources) state.chartSources.destroy();
    var counts = {};
    rows.forEach(function (r) {
      var k = r.source_party_name || 'غير محدد';
      counts[k] = (counts[k] || 0) + 1;
    });
    var entries = Object.keys(counts).map(function (k) { return { name: k, count: counts[k] }; })
                                     .sort(function (a, b) { return b.count - a.count; });
    if (!entries.length) {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9ab0a0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات', canvas.width / 2, canvas.height / 2);
      return;
    }
    var colors = ['#1a7a3f', '#c9a84c', '#d64545', '#2563a8', '#888780', '#0f4d2a'];
    state.chartSources = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(function (e) { return e.name; }),
        datasets: [{
          data: entries.map(function (e) { return e.count; }),
          backgroundColor: entries.map(function (_, i) { return colors[i % colors.length]; }),
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } }
      }
    });
  }

  // Bar: top responsible parties for mahadir
  function renderPartiesChart(rows) {
    var canvas = qs('chart-parties');
    if (!canvas) return;
    if (state.chartParties) state.chartParties.destroy();
    var counts = {};
    rows.forEach(function (r) {
      var k = r.responsible_party_name || 'غير محدد';
      counts[k] = (counts[k] || 0) + 1;
    });
    var entries = Object.keys(counts).map(function (k) { return { name: k, count: counts[k] }; })
                                     .sort(function (a, b) { return b.count - a.count; })
                                     .slice(0, 7);
    if (!entries.length) {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9ab0a0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات', canvas.width / 2, canvas.height / 2);
      return;
    }
    state.chartParties = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: entries.map(function (e) { return e.name; }),
        datasets: [{ label: 'محاضر', data: entries.map(function (e) { return e.count; }),
                     backgroundColor: '#1a7a3f', borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true, precision: 0 },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  // Horizontal bar: شكاوى vs بلاغات per day
  function renderIncidentsChart(daily) {
    var canvas = qs('chart-incidents');
    if (!canvas) return;
    if (state.chartIncidents) state.chartIncidents.destroy();
    if (!daily || !daily.length) {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9ab0a0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات', canvas.width / 2, canvas.height / 2);
      return;
    }
    var labels = daily.map(function (d) { return d.day; });
    state.chartIncidents = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'شكاوى',  data: daily.map(function (d) { return d.shakawi_count; }),  backgroundColor: '#c9a84c', borderRadius: 4 },
          { label: 'بلاغات', data: daily.map(function (d) { return d.balaghat_count; }), backgroundColor: '#d64545', borderRadius: 4 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true, precision: 0 },
          y: { grid: { display: false } }
        }
      }
    });
  }

  // Mini stats row
  function renderMiniStats(data) {
    var box = qs('mini-stats');
    if (!box) return;
    clear(box);

    var topViolation = (data.violation_breakdown || []).filter(function (v) { return v.count > 0; })[0];
    var avgProc = 0, n = 0;
    (data.mahadir || []).forEach(function (m) { if (m.processing_minutes != null) { avgProc += m.processing_minutes; n++; } });
    var avgProcStr = n ? (Math.round(avgProc / n) + ' د') : '—';

    var lastSubmit = data.shifts && data.shifts.length ? data.shifts[0].submitted_at : null;
    if (lastSubmit) {
      var t = String(lastSubmit).match(/(\d{2}:\d{2})/);
      lastSubmit = t ? t[1] : '—';
    } else { lastSubmit = '—'; }

    var totalIncidents = (data.shakawi || []).length + (data.balaghat || []).length;

    // SVG icons (clean, color-inheriting, print-friendly).
    var ICONS = {
      clock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
      flag:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4h11l-2 4 2 4H4"/></svg>',
      alert: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      time:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>'
    };

    var stats = [
      { cls: 'green', icon: ICONS.clock, label: 'متوسط زمن معالجة المحاضر', value: avgProcStr },
      { cls: 'gold',  icon: ICONS.flag,  label: 'النوع الأكثر تكراراً',     value: topViolation ? topViolation.name_ar : '—' },
      { cls: 'red',   icon: ICONS.alert, label: 'إجمالي البلاغات + الشكاوى', value: totalIncidents },
      { cls: 'blue',  icon: ICONS.time,  label: 'وقت آخر تسليم',           value: lastSubmit }
    ];

    stats.forEach(function (s) {
      var iconSpan = document.createElement('span');
      iconSpan.className = 'mini-icon';
      // SVG markup is a static, code-defined constant (no user data) — safe.
      iconSpan.insertAdjacentHTML('afterbegin', s.icon);
      var row = el('div', { class: 'mini-stat ' + s.cls }, [
        iconSpan,
        el('div', { class: 'mini-body' }, [
          el('span', { class: 'mini-label', text: s.label }),
          el('span', { class: 'mini-value', text: typeof s.value === 'number' ? fmtNum(s.value) : String(s.value) })
        ])
      ]);
      box.appendChild(row);
    });
  }

  // Recent activity feed
  function renderActivityFeed(data) {
    var feed = qs('activity-list');
    if (!feed) return;
    clear(feed);

    var events = [];
    (data.mahadir || []).forEach(function (m) {
      events.push({
        kind: 'mahadir',
        ts: m.created_at,
        text: 'محضر #' + (m.report_number || '-') + ' — ' + (m.violation_name || ''),
        sub: (m.shift_date || '') + ' · ' + (m.employee_name || '')
      });
    });
    (data.shakawi || []).forEach(function (c) {
      events.push({
        kind: 'shakwa',
        ts: c.created_at,
        text: 'شكوى #' + (c.case_number || '-') + ' — ' + (c.source_party_name || ''),
        sub: (c.shift_date || '') + ' · ' + (c.employee_name || '')
      });
    });
    (data.balaghat || []).forEach(function (c) {
      events.push({
        kind: 'balagh',
        ts: c.created_at,
        text: 'بلاغ #' + (c.case_number || '-') + ' — ' + (c.source_party_name || ''),
        sub: (c.shift_date || '') + ' · ' + (c.employee_name || '')
      });
    });
    (data.attachments || []).forEach(function (a) {
      events.push({
        kind: 'attach',
        ts: a.uploaded_at,
        text: 'مرفق — ' + (a.original_name || ''),
        sub: (a.uploaded_by_name || '')
      });
    });

    events.sort(function (a, b) {
      return String(b.ts || '').localeCompare(String(a.ts || ''));
    });

    var top = events.slice(0, 12);
    if (!top.length) {
      feed.appendChild(el('div', { class: 'mgr-empty', style: 'border:none;padding:20px;', text: 'لا يوجد نشاط حديث' }));
      return;
    }

    top.forEach(function (e) {
      var row = el('div', { class: 'activity-item' }, [
        el('span', { class: 'activity-dot ' + e.kind }),
        el('div', { class: 'activity-text' }, [
          el('div', null, [el('strong', { text: e.text })]),
          el('div', { class: 'activity-time', text: (e.ts ? String(e.ts).slice(0, 16).replace('T', ' ') : '—') + ' · ' + (e.sub || '') })
        ])
      ]);
      feed.appendChild(row);
    });
  }

  function load() {
    if (MGR.showLoading) MGR.showLoading('جارٍ تحميل بيانات القسم…');
    var url = '/api/manager/section/' + state.config.sectionNumber + '?' + buildQuery();
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || data.status !== 'ok') {
        MGR.toast('فشل تحميل البيانات');
        if (MGR.hideLoading) MGR.hideLoading();
        return;
      }
      state.lastData = data;
      renderKpis(data.kpis || []);
      renderMiniStats(data);
      // Recompute violation breakdown from currently-filtered mahadir (so the donut respects filters).
      var liveBreakdown = recomputeViolationBreakdown(data.mahadir || [], data.violation_breakdown || []);
      renderViolationsChart(liveBreakdown);
      renderTrendChart(data.daily_trend || []);
      renderDailyBar(data.daily_trend || []);
      var allComplaints = (data.shakawi || []).concat(data.balaghat || []);
      renderSourcesChart(allComplaints);
      renderPartiesChart(data.mahadir || []);
      renderIncidentsChart(data.daily_trend || []);
      renderActivityFeed(data);
      if (typeof state.config.renderSectionInsights === 'function') {
        try { state.config.renderSectionInsights(data); }
        catch (e) { console.error('renderSectionInsights failed', e); }
      }
      if (typeof state.config.onSectionData === 'function') {
        state.config.onSectionData(data.section_data || {}, data.shifts || []);
      } else {
        renderSectionTable(data.section_data || {}, data.shifts || [], state.config.sectionColumns || []);
      }
      renderMahadir(data.mahadir || []);
      renderComplaints(data.shakawi || [], 'badge-shakawi', 'tbl-shakawi', 'empty-shakawi');
      renderComplaints(data.balaghat || [], 'badge-balaghat', 'tbl-balaghat', 'empty-balaghat');
      renderAttachments(data.attachments || []);
      MGR.setLastUpdated();
      if (MGR.hideLoading) MGR.hideLoading();
    }).catch(function (e) {
      MGR.toast('تعذر الاتصال بالخادم');
      console.error(e);
      if (MGR.hideLoading) MGR.hideLoading();
    });
  }

  function recomputeViolationBreakdown(mahadir, fallbackBreakdown) {
    if (!mahadir.length && fallbackBreakdown && fallbackBreakdown.length) {
      // No filtered mahadir but server-side breakdown exists — use that (no filter active).
      return fallbackBreakdown;
    }
    var counts = {};
    var nameById = {};
    (fallbackBreakdown || []).forEach(function (b) { nameById[b.id] = b.name_ar; });
    mahadir.forEach(function (m) {
      var k = m.violation_type_id;
      if (k == null) return;
      counts[k] = (counts[k] || 0) + 1;
      if (m.violation_name) nameById[k] = m.violation_name;
    });
    return Object.keys(counts).map(function (id) {
      return { id: parseInt(id, 10), name_ar: nameById[id] || '—', count: counts[id] };
    });
  }

  function init(config) {
    state.config = config;

    function onClick(id, fn) { var el = qs(id); if (el) el.addEventListener('click', fn); }

    onClick('btn-refresh', load);
    onClick('btn-print', MGR.printPage);
    onClick('btn-export-section', function () {
      MGR.exportTableToExcel(qs('tbl-section'), 'section' + config.sectionNumber + '_data');
    });
    onClick('btn-export-mahadir', function () {
      MGR.exportTableToExcel(qs('tbl-mahadir'), 'section' + config.sectionNumber + '_mahadir');
    });
    onClick('btn-export-shakawi', function () {
      MGR.exportTableToExcel(qs('tbl-shakawi'), 'section' + config.sectionNumber + '_shakawi');
    });
    onClick('btn-export-balaghat', function () {
      MGR.exportTableToExcel(qs('tbl-balaghat'), 'section' + config.sectionNumber + '_balaghat');
    });
    (config.extraExportButtons || []).forEach(function (b) {
      onClick(b.id, function () { MGR.exportTableToExcel(qs(b.tableId), b.name); });
    });

    MGR.startStream(function (ev) {
      if (ev && (ev.section === config.sectionNumber || ev.section === 'all')) load();
    });
    MGR.setStatus('warn', 'جارٍ الاتصال…');

    load();
  }

  window.DashboardPage = { init: init, load: load };

})();
