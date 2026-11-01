/* Manager dashboards shared shell logic.
   Loaded by every dashboardN.html before the page-specific script.
   Owns: auth/role gate, sidebar render, filter bar, lookups, status, export, sign-out. */

(function () {
  'use strict';

  var SECTIONS = [
    { num: 1, name: 'Section 1', href: 'dashboard1.html' },
    { num: 2, name: 'Section 2', href: 'dashboard2.html' },
    { num: 3, name: 'Section 3', href: 'dashboard3.html' },
    { num: 4, name: 'Section 4', href: 'dashboard4.html' },
    { num: 5, name: 'Section 5', href: 'dashboard5.html' },
    { num: 6, name: 'Section 6', href: 'dashboard6.html' },
    { num: 7, name: 'Section 7', href: 'dashboard7.html' },
    { num: 8, name: 'Aggregate', href: 'dashboard8.html', aggregate: true },
    { num: 9, name: 'Daily report', href: 'daily_report.html', report: true }
  ];

  var ROLE_LABELS = {
    section_1: 'Section 1',
    section_2: 'Section 2',
    section_3: 'Section 3',
    section_4: 'Section 4',
    section_5: 'Section 5',
    section_6: 'Section 6',
    section_7: 'Section 7',
    full_access: 'Admin',
    manager: 'Manager'
  };

  window.MGR = window.MGR || {};

  MGR.getUser = function () {
    try { return JSON.parse(localStorage.getItem('user')); } catch (e) { return null; }
  };

  MGR.signout = function () {
    try { localStorage.removeItem('user'); } catch (e) {}
    window.location.href = '../login.html';
  };

  MGR.allowedSection = function (user) {
    if (!user) return null;
    if (user.role === 'full_access' || user.role === 'manager') return 'all';
    var m = /^section_([1-7])$/.exec(user.role);
    return m ? parseInt(m[1], 10) : null;
  };

  MGR.guardPage = function (currentSectionNum) {
    var user = MGR.getUser();
    if (!user) { window.location.href = '../login.html'; return false; }
    var allowed = MGR.allowedSection(user);
    if (allowed === null) {
      MGR.toast('No permission for manager dashboards');
      setTimeout(function () { window.location.href = '../index.html'; }, 1200);
      return false;
    }
    if (allowed === 'all') return true;
    // Section users: only their own dashboard. Aggregate (8) and daily report (9) are admin/manager only.
    if (currentSectionNum === 8 || currentSectionNum === 9 || allowed !== currentSectionNum) {
      window.location.href = 'dashboard' + allowed + '.html';
      return false;
    }
    return true;
  };

  MGR.showLoading = function (msg) {
    var ov = document.getElementById('mgr-loader');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mgr-loader';
      ov.className = 'mgr-loader-overlay';
      var sp = document.createElement('div'); sp.className = 'mgr-loader-spinner';
      var tx = document.createElement('div'); tx.className = 'mgr-loader-text';
      tx.textContent = msg || 'جارٍ تحميل البيانات…';
      ov.appendChild(sp); ov.appendChild(tx);
      document.body.appendChild(ov);
    } else {
      ov.querySelector('.mgr-loader-text').textContent = msg || 'جارٍ تحميل البيانات…';
    }
    ov.classList.add('show');
  };

  MGR.hideLoading = function () {
    var ov = document.getElementById('mgr-loader');
    if (ov) ov.classList.remove('show');
  };

  // When a sidebar nav link is clicked, briefly show the loader so the user sees feedback
  // immediately (next page navigation will replace the overlay anyway).
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('.mgr-nav-link');
    if (link && !link.classList.contains('active') && link.getAttribute('href') && link.getAttribute('href') !== '#') {
      MGR.showLoading('جارٍ تحميل لوحة البيانات…');
    }
  }, true);

  MGR.toast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(MGR._toastTimer);
    MGR._toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3000);
  };

  // Inject a hamburger button + wire mobile sidebar drawer (no-op on desktop via CSS).
  function _injectHamburger() {
    var topbar = document.querySelector('.mgr-topbar > div:first-child');
    if (!topbar || document.querySelector('.mgr-hamburger')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mgr-hamburger';
    btn.setAttribute('aria-label', 'فتح القائمة');
    btn.textContent = '☰';   // ☰
    btn.addEventListener('click', function () {
      document.body.classList.toggle('sidebar-open');
    });
    topbar.parentNode.insertBefore(btn, topbar);
    // Close on backdrop click or sidebar link click
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('sidebar-open')) return;
      var sb = document.querySelector('.mgr-sidebar');
      if (e.target === btn || (btn && btn.contains(e.target))) return;
      if (e.target.closest('.mgr-nav-link')) {
        document.body.classList.remove('sidebar-open');
        return;
      }
      if (sb && !sb.contains(e.target)) {
        document.body.classList.remove('sidebar-open');
      }
    });
  }

  MGR.renderShell = function (currentSectionNum) {
    var user = MGR.getUser();
    if (!user) return;
    var allowed = MGR.allowedSection(user);

    var sidebar = document.getElementById('mgr-sidebar-nav');
    if (sidebar) {
      while (sidebar.firstChild) sidebar.removeChild(sidebar.firstChild);
      SECTIONS.forEach(function (s) {
        // Hide entries the user can't access; only show the allowed ones.
        if (allowed !== 'all' && (s.aggregate || s.report || s.num !== allowed)) return;
        var a = document.createElement('a');
        a.className = 'mgr-nav-link' + (s.num === currentSectionNum ? ' active' : '');
        a.href = s.href;
        a.title = s.name;
        var label;
        if (s.aggregate) label = 'تجميع البلاغات والشكاوى والمحاضر';
        else if (s.report) label = 'التقرير اليومي';
        else label = 'القسم ' + s.num;
        var labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        var numSpan = document.createElement('span');
        numSpan.className = 'mgr-nav-num';
        numSpan.textContent = s.report ? '★' : String(s.num);
        a.appendChild(labelSpan);
        a.appendChild(numSpan);
        sidebar.appendChild(a);
      });
    }

    var u = document.getElementById('mgr-user-info');
    if (u) {
      u.innerHTML = '<strong>' + escHtml(user.name) + '</strong><br>' + (ROLE_LABELS[user.role] || user.role);
    }

    var b = document.getElementById('mgr-signout-btn');
    if (b) b.addEventListener('click', MGR.signout);

    _injectHamburger();
  };

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  MGR.escHtml = escHtml;

  MGR._lookupsCache = null;
  MGR.loadLookups = function () {
    if (MGR._lookupsCache) return Promise.resolve(MGR._lookupsCache);
    return fetch('/api/lookups').then(function (r) { return r.json(); }).then(function (d) {
      MGR._lookupsCache = (d && d.status === 'ok') ? d.data : null;
      return MGR._lookupsCache;
    });
  };

  MGR.params = function () {
    var u = new URL(window.location.href);
    var p = {};
    u.searchParams.forEach(function (v, k) { p[k] = v; });
    return p;
  };

  MGR.setParams = function (patch) {
    var u = new URL(window.location.href);
    Object.entries(patch).forEach(function (entry) {
      var k = entry[0], v = entry[1];
      if (v === '' || v == null) u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    });
    window.history.replaceState(null, '', u.toString());
  };

  MGR.renderFilters = function (config) {
    config = config || {};
    var bar = document.getElementById('mgr-filterbar');
    if (!bar) return;
    bar.innerHTML = '';

    var p = MGR.params();
    var dateMode = p.date_mode || 'day';
    var dateFrom = p.date_from || new Date().toISOString().slice(0, 10);
    var dateTo = p.date_to || new Date().toISOString().slice(0, 10);

    function add(label, html) {
      var w = document.createElement('div');
      w.className = 'mgr-filter';
      w.innerHTML = '<label>' + escHtml(label) + '</label>' + html;
      bar.appendChild(w);
      return w;
    }

    add('نطاق التاريخ', '<select id="f-date-mode">'
      + '<option value="day"' + (dateMode === 'day' ? ' selected' : '') + '>يوم محدد</option>'
      + '<option value="range"' + (dateMode === 'range' ? ' selected' : '') + '>من — إلى</option>'
      + '<option value="season"' + (dateMode === 'season' ? ' selected' : '') + '>الموسم بأكمله</option>'
      + '</select>');

    add('من تاريخ', '<input type="date" id="f-date-from" value="' + escHtml(dateFrom) + '">');
    add('إلى تاريخ', '<input type="date" id="f-date-to" value="' + escHtml(dateTo) + '">');

    function refreshDateInputs() {
      var mode = document.getElementById('f-date-mode').value;
      document.getElementById('f-date-from').parentElement.style.display =
        (mode === 'season') ? 'none' : '';
      document.getElementById('f-date-to').parentElement.style.display =
        (mode === 'range') ? '' : 'none';
    }

    if (config.showSection) {
      var secOpts = '<option value="">كل الأقسام</option>';
      for (var i = 1; i <= 7; i++) {
        secOpts += '<option value="' + i + '"' + (String(p.section_number) === String(i) ? ' selected' : '') + '>'
                + 'القسم ' + i + '</option>';
      }
      add('القسم', '<select id="f-section">' + secOpts + '</select>');
    }

    if (config.showComplaintKind) {
      add('تصنيف (شكوى / بلاغ)', '<select id="f-complaint-kind">'
        + '<option value="">الكل (شكاوى + بلاغات)</option>'
        + '<option value="شكوى"' + (p.complaint_kind === 'شكوى' ? ' selected' : '') + '>شكوى فقط</option>'
        + '<option value="بلاغ"' + (p.complaint_kind === 'بلاغ' ? ' selected' : '') + '>بلاغ فقط</option>'
        + '</select>');
    }

    if (config.showViolation) add('نوع المخالفة', '<select id="f-violation"><option value="">الكل</option></select>');
    if (config.showResponsibleParty) add('الجهة المسؤولة', '<select id="f-rparty"><option value="">الكل</option></select>');
    if (config.showSourceParty) add('جهة الإصدار', '<select id="f-source"><option value="">الكل</option></select>');

    MGR.loadLookups().then(function (lk) {
      function fillSelect(id, items, paramName) {
        var sel = document.getElementById(id);
        if (!sel || !items) return;
        var current = p[paramName] || '';
        var opts = '<option value="">الكل</option>';
        items.forEach(function (it) {
          opts += '<option value="' + it.id + '"' + (String(current) === String(it.id) ? ' selected' : '') + '>'
                + escHtml(it.name_ar) + '</option>';
        });
        sel.innerHTML = opts;
      }
      if (config.showViolation) fillSelect('f-violation', lk && lk.violation_types || [], 'violation_type_id');
      if (config.showResponsibleParty) fillSelect('f-rparty', lk && lk.responsible_parties || [], 'responsible_party_id');
      if (config.showSourceParty) fillSelect('f-source', lk && lk.complaint_sources || [], 'source_party_id');
    });

    var actions = document.createElement('div');
    actions.className = 'mgr-filter';
    actions.innerHTML = '<label>&nbsp;</label>'
      + '<div style="display:flex;gap:6px;">'
      + '<button class="mgr-btn primary" id="f-apply">تطبيق</button>'
      + '<button class="mgr-btn ghost" id="f-reset">إعادة تعيين</button>'
      + '</div>';
    bar.appendChild(actions);

    refreshDateInputs();
    document.getElementById('f-date-mode').addEventListener('change', refreshDateInputs);

    function gather() {
      var mode = document.getElementById('f-date-mode').value;
      var f = {
        date_mode: mode,
        date_from: mode !== 'season' ? document.getElementById('f-date-from').value : '',
        date_to: mode === 'range' ? document.getElementById('f-date-to').value : ''
      };
      if (config.showViolation) f.violation_type_id = (document.getElementById('f-violation') || {}).value || '';
      if (config.showResponsibleParty) f.responsible_party_id = (document.getElementById('f-rparty') || {}).value || '';
      if (config.showSourceParty) f.source_party_id = (document.getElementById('f-source') || {}).value || '';
      if (config.showSection) f.section_number = (document.getElementById('f-section') || {}).value || '';
      if (config.showComplaintKind) f.complaint_kind = (document.getElementById('f-complaint-kind') || {}).value || '';
      return f;
    }

    document.getElementById('f-apply').addEventListener('click', function () {
      var f = gather();
      MGR.setParams(f);
      if (config.onChange) config.onChange(f);
    });
    document.getElementById('f-reset').addEventListener('click', function () {
      var u = new URL(window.location.href);
      Array.from(u.searchParams.keys()).forEach(function (k) { u.searchParams.delete(k); });
      window.location.href = u.toString();
    });
  };

  MGR.setStatus = function (state, msg) {
    var dot = document.getElementById('mgr-dot');
    var lbl = document.getElementById('mgr-status-label');
    if (!dot || !lbl) return;
    dot.classList.remove('warn', 'error');
    if (state === 'warn') dot.classList.add('warn');
    if (state === 'error') dot.classList.add('error');
    lbl.textContent = msg || '';
  };

  MGR.setLastUpdated = function () {
    var lu = document.getElementById('mgr-last-updated');
    if (!lu) return;
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var ss = String(d.getSeconds()).padStart(2, '0');
    lu.textContent = 'آخر تحديث: ' + hh + ':' + mm + ':' + ss;
  };

  MGR.startStream = function (onEvent) {
    if (!('EventSource' in window)) return;
    try {
      var es = new EventSource('/api/manager/stream');
      es.onopen = function () { MGR.setStatus('ok', 'متصل · فوري'); };
      es.onerror = function () { MGR.setStatus('warn', 'إعادة الاتصال…'); };
      es.onmessage = function (e) {
        try {
          var data = JSON.parse(e.data);
          if (onEvent) onEvent(data);
        } catch (err) {}
      };
      MGR._eventSource = es;
    } catch (e) {
      MGR.setStatus('warn', 'تحديث يدوي');
    }
  };

  MGR.exportTableToExcel = function (tableEl, filenameBase) {
    if (!tableEl) return;
    if (typeof XLSX === 'undefined') {
      MGR.toast('Excel library not loaded');
      return;
    }
    var wb = XLSX.utils.table_to_book(tableEl, { sheet: 'Sheet1' });
    var ts = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, (filenameBase || 'export') + '_' + ts + '.xlsx');
  };

  MGR.printPage = function () { window.print(); };

  MGR.fmtBytes = function (n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };

  MGR.attachThumb = function (att) {
    var isImg = (att.mime_type || '').indexOf('image/') === 0;
    var url = '/api/upload/' + att.id;
    var thumb = isImg
      ? '<div class="attach-thumb img" style="background-image:url(\'' + url + '\')"></div>'
      : '<div class="attach-thumb icon"></div>';
    var size = MGR.fmtBytes(att.size_bytes);
    return ''
      + '<a class="attach-tile" href="' + url + '" target="_blank" rel="noopener">'
      + thumb
      + '<div class="attach-meta">'
      +   '<div class="name" title="' + escHtml(att.original_name) + '">' + escHtml(att.original_name) + '</div>'
      +   '<div class="sub">' + escHtml(att.mime_type || '') + ' · ' + size + '</div>'
      + '</div></a>';
  };

})();
