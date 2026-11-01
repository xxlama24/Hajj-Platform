/*
 * Hajj Live Operations Platform — Browser Demo Layer
 * ---------------------------------------------------
 * This file replaces the Flask + PostgreSQL backend in the public demo.
 * It intercepts every call to /api/... (fetch + EventSource) and answers it
 * locally, storing all data in the visitor's own browser (localStorage).
 * Nothing is sent to any server. The routes mirror backend/*.py one-to-one.
 */
(function () {
  'use strict';

  var DB_KEY = 'hajj_demo_db_v1';
  var ATT_PREFIX = 'hajj_demo_att_';
  var DEMO_PASSWORD = 'demo123';

  /* ───────────────────────── helpers ───────────────────────── */

  function Err(msg, status) { this.message = msg; this.status = status || 400; }

  function riyadhDate() { return new Date(Date.now() + 3 * 3600 * 1000); }
  function todayRiyadh() { return riyadhDate().toISOString().slice(0, 10); }
  function nowTs() { return riyadhDate().toISOString().slice(0, 23); }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function currentShiftType() {
    var h = riyadhDate().getUTCHours();
    if (h >= 7 && h < 15) return 'صباح';
    if (h >= 15 && h < 23) return 'مساء';
    return 'ليل';
  }
  function has(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }
  function toInt(v, dflt) {
    if (v === undefined) return dflt;
    if (v === null || v === '') return null;
    var n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }
  function normTime(t) {
    if (!t) return null;
    t = String(t);
    return /^\d{2}:\d{2}$/.test(t) ? t + ':00' : t;
  }
  function procMinutes(start, end) {
    if (!start || !end) return null;
    var a = String(start).slice(0, 5).split(':'), b = String(end).slice(0, 5).split(':');
    var s = +a[0] * 60 + +a[1], e = +b[0] * 60 + +b[1];
    if (isNaN(s) || isNaN(e)) return null;
    var diff = e - s;
    if (diff < 0) diff += 1440;
    return diff;
  }
  function sum(arr, f) { var t = 0; arr.forEach(function (x) { t += (f(x) || 0); }); return t; }
  function byIdDesc(a, b) { return b.id - a.id; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ───────────────────────── seed data ───────────────────────── */

  var VIOLATIONS = ['عدم مطابقة عدد الحجاج مع العقد', 'عدم وجود مسؤول الحجاج في موقع المغادرة', 'مغادرة الحجاج دون الرجوع إلى مكتب الخدمة', 'رفض الحجاج للحافلات في موقع المغادرة', 'تأخر شركة التحميل والتنزيل', 'الخروج المبكر للحجاج قبل موعد المغادرة', 'تأخر وصول الحافلات في موقع المغادرة', 'رفض مسؤول الحجاج تأمين شاحنة لنقل الأمتعة الزائدة', 'وصول الحجاج قبل موعد بداية عقد السكن', 'عدم توزيع الحجاج بالشكل المناسب على الحافلات', 'عدم جاهزية الحجاج عند الوصول إلى موقع المغادرة', 'رفض تسليم الجوازات من قبل الحجاج', 'عدم جاهزية الحجاج للمغادرة', 'رفض الحجاج للسكن', 'وصول الحجاج بعد موعد بداية عقد السكن', 'تأخر مسؤول الحجاج في إنهاء إجراءات المغادرة', 'عدم جاهزية السكن عند وصول الحجاج', 'اختلاف تفويج', 'رقم الحافلة غير مطابق', 'عدد الحجاج غير مطابق للكشف', 'عدد الجوازات غير مطابق لعدد الحجاج', 'وصول حافلة بدون كشف مغادرة', 'تكرار برنت التصاريح', 'عدم الالتزام بالعدد المحدد للتصاريح', 'وصول قبل أو بعد الموعد', 'وصول الحجاج بدون تصريح', 'عدم وجود عدد كافي من المناديب من قبل الحملة', 'أمتعة للحجاج مفقودة', 'أمتعة للحجاج تالفة', 'أخرى'];
  var LOCATIONS = ['مكتب شؤون الحجاج', 'المطار', 'الهجرة', 'الميدان', 'القطار', 'الميقات', 'المنظم', 'أخرى'];
  var PARTIES = ['إرشاد الحافلات', 'متعهد نقل أمتعة', 'متعهد الإعاشة', 'التحميل والتنزيل', 'شركة النقل', 'إرشاد التائهين', 'الوحدة السكنية'];
  var SOURCES = ['وزارة الحج والعمرة', 'العمليات الميدانية', 'مركز الاتصال الموحد', 'الجهة المقدمة للخدمة'];
  var NATIONALITIES = ['باكستان', 'السودان', 'المغرب', 'فلسطين', 'تشاد', 'سريلانكا', 'قرغيزستان', 'ألبانيا'];
  var PORTS = ['المطار', 'القطار', 'محطة الهجرة', 'المنافذ البرية'];
  var SECTION_NAMES = ['الاستعداد', 'التفويج', 'الروضة', 'الصحة', 'نسك', 'السكن', 'الميقات'];

  var TABLES = ['employees', 'shifts', 'section1_istedad', 'section2_pilgrims', 'section2_flights',
    'section2_buses', 'section2_timing', 'section3_rawda', 'section4_health', 'section5_nusuk',
    'section6_sokn', 'section7_meeqat', 'mahadir', 'complaints', 'attachments'];

  function lookupRows(names) {
    return names.map(function (n, i) { return { id: i + 1, name_ar: n, is_active: true, sort_order: i + 1 }; });
  }

  function buildSeed() {
    var db = { v: 1, seq: {} };
    TABLES.forEach(function (t) { db[t] = []; db.seq[t] = 0; });
    db.lookups = {
      violation_types: lookupRows(VIOLATIONS),
      location_types: lookupRows(LOCATIONS),
      responsible_parties: lookupRows(PARTIES),
      complaint_sources: lookupRows(SOURCES)
    };
    function ins(table, row) {
      row.id = ++db.seq[table];
      if (!row.created_at && table !== 'employees' && table !== 'shifts' && table !== 'attachments') row.created_at = nowTs();
      db[table].push(row);
      return row;
    }

    // employees: 1-7 section users, 8 manager, 9 admin, 10-16 "pre-filled" bot users for today's seed
    for (var i = 1; i <= 7; i++) {
      ins('employees', { name: 'موظف القسم ' + i + ' — ' + SECTION_NAMES[i - 1], username: 'user' + i, password: DEMO_PASSWORD, role: 'section_' + i, is_active: true, created_at: nowTs() });
    }
    ins('employees', { name: 'مدير النظام', username: 'manager', password: DEMO_PASSWORD, role: 'manager', is_active: true, created_at: nowTs() });
    ins('employees', { name: 'المشرف العام', username: 'admin', password: DEMO_PASSWORD, role: 'full_access', is_active: true, created_at: nowTs() });
    for (var b = 1; b <= 7; b++) {
      ins('employees', { name: 'موظف ميداني — قسم ' + b, username: 'seed' + b, password: Math.random().toString(36).slice(2), role: 'section_' + b, is_active: true, created_at: nowTs() });
    }

    var rnd = mulberry32(42);
    function ri(a, b2) { return a + Math.floor(rnd() * (b2 - a + 1)); }
    function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
    function sample(arr, k) {
      var c = arr.slice(), out = [];
      while (out.length < k && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]);
      return out;
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    var today = todayRiyadh();
    var nextReport = 100000, nextCase = 200000;

    for (var daysAgo = 6; daysAgo >= 0; daysAgo--) {
      var d = addDays(today, -daysAgo);
      for (var sec = 1; sec <= 7; sec++) {
        // Today's seed belongs to bot employees so the real demo users can still submit once today.
        var empId = daysAgo === 0 ? 9 + sec : sec;
        var shift = ins('shifts', {
          shift_type: 'daily', shift_date: d, submitted_at: d + 'T' + pad(8 + sec) + ':' + pad(ri(0, 59)) + ':00.000',
          section_number: sec, status: 'submitted', employee_id: empId
        });
        var sid = shift.id;

        if (sec === 1) {
          sample(NATIONALITIES, 4).forEach(function (n) {
            ins('section1_istedad', { shift_id: sid, nationality: n, expected_arrivals: ri(80, 500), expected_departures: ri(60, 400) });
          });
        } else if (sec === 2) {
          sample(NATIONALITIES, 3).forEach(function (n) {
            ins('section2_pilgrims', { shift_id: sid, nationality: n, arrivals_count: ri(50, 350), departures_count: ri(40, 300) });
          });
          PORTS.forEach(function (p) {
            ins('section2_flights', { shift_id: sid, port_type: p, arriving_flights: ri(1, 6), departing_flights: ri(1, 6) });
            ins('section2_buses', { shift_id: sid, port_type: p, arriving_buses: ri(4, 14), departing_buses: ri(4, 14) });
          });
          ins('section2_timing', { shift_id: sid, avg_flight_processing_time: '00:35:00', avg_bus_processing_time: '00:22:00' });
        } else if (sec === 3) {
          ins('section3_rawda', { shift_id: sid, total_visitors: ri(700, 1500), permits_issued: ri(600, 1400), avg_visit_processing_time: '00:18:00' });
        } else if (sec === 4) {
          ins('section4_health', { shift_id: sid, hospital_visits: ri(80, 200), admitted_cases: ri(10, 40), death_cases: ri(0, 2), patient_cases: ri(50, 150) });
        } else if (sec === 5) {
          ins('section5_nusuk', { shift_id: sid, archive_cards: ri(300, 600), activated_cards: ri(280, 580), total_arrivals: ri(320, 620), unreceived_cards: ri(0, 25) });
        } else if (sec === 6) {
          ins('section6_sokn', { shift_id: sid, bus_count: ri(20, 60), avg_processing_time: '00:25:00' });
        } else if (sec === 7) {
          ins('section7_meeqat', { shift_id: sid, bus_count: ri(15, 50), avg_processing_time: '00:31:00' });
        }

        var nM = ri(1, 3), k;
        for (k = 0; k < nM; k++) {
          var sh = ri(8, 21), sm = pick([0, 15, 30, 45]), eh = sh + ri(0, 1), em = (sm + ri(15, 45)) % 60;
          var pm = (eh * 60 + em) - (sh * 60 + sm); if (pm < 0) pm += 1440;
          ins('mahadir', {
            shift_id: sid, report_number: nextReport++, violation_type_id: ri(1, VIOLATIONS.length),
            location_type_id: ri(1, LOCATIONS.length), responsible_party_id: ri(1, PARTIES.length),
            photo_path: null, start_time: pad(sh) + ':' + pad(sm) + ':00', end_time: pad(eh) + ':' + pad(em) + ':00',
            processing_minutes: pm, notes: pick(['ملاحظة عامة', 'تم التعامل مع الحالة', 'متابعة لاحقة', ''])
          });
        }
        var nC = ri(1, 3);
        for (k = 0; k < nC; k++) {
          var kind = pick(['شكوى', 'بلاغ']);
          var csh = ri(8, 21), csm = pick([0, 15, 30, 45]), ceh = csh, cem = (csm + ri(10, 40)) % 60;
          if (cem < csm) ceh += 1;
          ins('complaints', {
            shift_id: sid, case_number: nextCase++, type: kind, source_party_id: ri(1, SOURCES.length),
            photo_path: null, start_time: pad(csh) + ':' + pad(csm) + ':00', end_time: pad(ceh) + ':' + pad(cem) + ':00',
            processing_minutes: Math.max(0, (ceh * 60 + cem) - (csh * 60 + csm)),
            notes: pick(['تم تسجيل الحالة', 'في انتظار الرد', 'تم الإغلاق', ''])
          });
        }
        if (rnd() < 0.55) {
          ins('attachments', { shift_id: sid, section_number: sec, record_type: 'section', record_id: null, original_name: 'photo_' + sid + '.svg', stored_path: d + '/' + sid + '/photo_' + sid + '.svg', mime_type: 'image/svg+xml', size_bytes: 612, uploaded_by: empId, uploaded_at: d + 'T10:00:00.000', seed: 'img' });
        }
        if (rnd() < 0.40) {
          ins('attachments', { shift_id: sid, section_number: sec, record_type: 'section', record_id: null, original_name: 'report_' + sid + '.pdf', stored_path: d + '/' + sid + '/report_' + sid + '.pdf', mime_type: 'application/pdf', size_bytes: 330, uploaded_by: empId, uploaded_at: d + 'T10:05:00.000', seed: 'pdf' });
        }
      }
    }
    return db;
  }

  /* ───────────────────────── storage ───────────────────────── */

  var db = null;
  var memoryOnly = false;

  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // Re-seed when the stored seed is older than a week so dashboards always show recent days.
        var newest = '';
        parsed.shifts.forEach(function (s) { if (s.shift_date > newest) newest = s.shift_date; });
        if (parsed.v === 1 && newest >= addDays(todayRiyadh(), -1)) { db = parsed; return; }
      }
    } catch (e) { /* fall through to seed */ }
    db = buildSeed();
    save();
  }

  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) { memoryOnly = true; }
  }

  function nextId(table) { return ++db.seq[table]; }
  function insert(table, row) {
    row.id = nextId(table);
    if (!row.created_at && table !== 'shifts' && table !== 'attachments') row.created_at = nowTs();
    db[table].push(row);
    return row;
  }

  /* ───────────────────────── pub/sub (SSE replacement) ───────────────────────── */

  var channel = null;
  try { if ('BroadcastChannel' in window) channel = new BroadcastChannel('hajj_demo_events'); } catch (e) {}
  var listeners = [];
  function publish(evt) {
    listeners.slice().forEach(function (fn) { try { fn(evt); } catch (e) {} });
    try { if (channel) channel.postMessage(evt); } catch (e) {}
  }
  if (channel) channel.onmessage = function (m) {
    // another tab changed data → re-read storage so this tab sees it
    try { var raw = localStorage.getItem(DB_KEY); if (raw) db = JSON.parse(raw); } catch (e) {}
    listeners.slice().forEach(function (fn) { try { fn(m.data); } catch (e) {} });
  };

  function FakeEventSource(url) {
    var self = this;
    this.url = url; this.readyState = 0;
    this.onopen = null; this.onmessage = null; this.onerror = null;
    this._fn = function (evt) { if (self.onmessage) self.onmessage({ data: JSON.stringify(evt) }); };
    listeners.push(this._fn);
    setTimeout(function () { self.readyState = 1; if (self.onopen) self.onopen({}); }, 60);
  }
  FakeEventSource.prototype.close = function () {
    var i = listeners.indexOf(this._fn);
    if (i >= 0) listeners.splice(i, 1);
    this.readyState = 2;
  };
  FakeEventSource.prototype.addEventListener = function (type, fn) {
    if (type === 'message') this.onmessage = fn;
    if (type === 'open') this.onopen = fn;
  };

  /* ───────────────────────── lookups ───────────────────────── */

  function resolveLookup(list, value, label) {
    if (value === null || value === undefined || value === '') throw new Err('حقل ' + label + ' مطلوب');
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
    for (var i = 0; i < list.length; i++) if (list[i].name_ar === value) return list[i].id;
    throw new Err(label + ' غير معروف: ' + value);
  }

  function prepareMahadir(rows) {
    return (rows || []).map(function (row) {
      return {
        report_number: row.report_number,
        violation_type_id: resolveLookup(db.lookups.violation_types, row.violation_type_id || row.violation_type, 'نوع المخالفة'),
        location_type_id: resolveLookup(db.lookups.location_types, row.location_type_id || row.location_type, 'موقع الحالة'),
        responsible_party_id: resolveLookup(db.lookups.responsible_parties, row.responsible_party_id || row.responsible_party, 'الجهة المسؤولة'),
        photo_path: row.photo_path || null,
        start_time: normTime(row.start_time), end_time: normTime(row.end_time),
        processing_minutes: procMinutes(row.start_time, row.end_time),
        notes: row.notes === undefined ? null : row.notes
      };
    });
  }
  function prepareComplaints(rows) {
    return (rows || []).map(function (row) {
      var src = resolveLookup(db.lookups.complaint_sources, row.source_party_id || row.source_party, 'الجهة المصدرة');
      if (!row.type) throw new Err('حقل النوع (شكوى/بلاغ) مطلوب');
      return {
        case_number: row.case_number, type: row.type, source_party_id: src,
        photo_path: row.photo_path || null,
        start_time: normTime(row.start_time), end_time: normTime(row.end_time),
        processing_minutes: procMinutes(row.start_time, row.end_time),
        notes: row.notes === undefined ? null : row.notes
      };
    });
  }

  /* ───────────────────────── employee-facing routes ───────────────────────── */

  function employeeById(id) {
    for (var i = 0; i < db.employees.length; i++) if (db.employees[i].id === id) return db.employees[i];
    return null;
  }

  function login(body) {
    var username = (body.username || '').trim(), password = body.password;
    if (!username || !password) throw new Err('username and password required');
    var u = null;
    db.employees.forEach(function (e) { if (e.username.toLowerCase() === username.toLowerCase()) u = e; });
    if (!u || u.password !== password) throw new Err('invalid credentials', 401);
    return { status: 'ok', user: { id: u.id, name: u.name, role: u.role } };
  }

  function todayStatus(q) {
    var emp = toInt(q.get('employee_id')), sec = toInt(q.get('section'));
    if (!emp || !sec) throw new Err('employee_id and section required');
    var t = todayRiyadh(), hit = null;
    db.shifts.forEach(function (s) {
      if (!hit && s.employee_id === emp && s.section_number === sec && s.shift_date === t) hit = s;
    });
    if (hit) return { status: 'ok', submitted: true, shift_id: hit.id, shift_status: hit.status, submitted_at: hit.submitted_at.replace('T', ' ') };
    return { status: 'ok', submitted: false };
  }

  function resolveSubmitDate(employeeId, requested) {
    var today = todayRiyadh();
    if (!requested || typeof requested !== 'string' || !requested.trim()) return today;
    var emp = employeeById(employeeId);
    if (!emp || (emp.role !== 'full_access' && emp.role !== 'manager')) return today;
    var r = requested.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r) || isNaN(new Date(r + 'T00:00:00Z').getTime())) throw new Err('تنسيق التاريخ غير صحيح (المتوقع YYYY-MM-DD)');
    if (r > today) throw new Err('لا يمكن إدخال تاريخ في المستقبل');
    return r;
  }

  var SECTION_WRITERS = {
    1: function (sid, data) {
      (data.rows || []).forEach(function (r) {
        insert('section1_istedad', { shift_id: sid, nationality: r.nationality, expected_arrivals: has(r, 'expected_arrivals') ? toInt(r.expected_arrivals, 0) : 0, expected_departures: has(r, 'expected_departures') ? toInt(r.expected_departures, 0) : 0 });
      });
    },
    2: function (sid, data) {
      (data.pilgrims || []).forEach(function (r) {
        insert('section2_pilgrims', { shift_id: sid, nationality: r.nationality, arrivals_count: has(r, 'arrivals_count') ? toInt(r.arrivals_count, 0) : 0, departures_count: has(r, 'departures_count') ? toInt(r.departures_count, 0) : 0 });
      });
      (data.flights || []).forEach(function (r) {
        insert('section2_flights', { shift_id: sid, port_type: r.port_type, arriving_flights: has(r, 'arriving_flights') ? toInt(r.arriving_flights, 0) : 0, departing_flights: has(r, 'departing_flights') ? toInt(r.departing_flights, 0) : 0 });
      });
      (data.buses || []).forEach(function (r) {
        insert('section2_buses', { shift_id: sid, port_type: r.port_type, arriving_buses: has(r, 'arriving_buses') ? toInt(r.arriving_buses, 0) : 0, departing_buses: has(r, 'departing_buses') ? toInt(r.departing_buses, 0) : 0 });
      });
      var t = data.timing || {};
      insert('section2_timing', { shift_id: sid, avg_flight_processing_time: normTime(t.avg_flight_processing_time), avg_bus_processing_time: normTime(t.avg_bus_processing_time) });
    },
    3: function (sid, data) {
      insert('section3_rawda', { shift_id: sid, total_visitors: has(data, 'total_visitors') ? toInt(data.total_visitors, 0) : 0, permits_issued: has(data, 'permits_issued') ? toInt(data.permits_issued, 0) : 0, avg_visit_processing_time: normTime(data.avg_visit_processing_time) });
    },
    4: function (sid, data) {
      insert('section4_health', { shift_id: sid, hospital_visits: has(data, 'hospital_visits') ? toInt(data.hospital_visits, 0) : 0, admitted_cases: has(data, 'admitted_cases') ? toInt(data.admitted_cases, 0) : 0, death_cases: has(data, 'death_cases') ? toInt(data.death_cases, 0) : 0, patient_cases: has(data, 'patient_cases') ? toInt(data.patient_cases, 0) : 0 });
    },
    5: function (sid, data) {
      insert('section5_nusuk', { shift_id: sid, archive_cards: has(data, 'archive_cards') ? toInt(data.archive_cards, 0) : 0, activated_cards: has(data, 'activated_cards') ? toInt(data.activated_cards, 0) : 0, total_arrivals: has(data, 'total_arrivals') ? toInt(data.total_arrivals, 0) : 0, unreceived_cards: has(data, 'unreceived_cards') ? toInt(data.unreceived_cards, 0) : 0 });
    },
    6: function (sid, data) {
      insert('section6_sokn', { shift_id: sid, bus_count: has(data, 'bus_count') ? toInt(data.bus_count, 0) : 0, avg_processing_time: normTime(data.avg_processing_time) });
    },
    7: function (sid, data) {
      insert('section7_meeqat', { shift_id: sid, bus_count: has(data, 'bus_count') ? toInt(data.bus_count, 0) : 0, avg_processing_time: normTime(data.avg_processing_time) });
    }
  };

  function submitSection(n, data) {
    var employeeId = data.employee_id;
    var target = resolveSubmitDate(employeeId, data.shift_date);
    var dup = db.shifts.some(function (s) { return s.employee_id === employeeId && s.section_number === n && s.shift_date === target; });
    if (dup) throw new Err('لا يمكنك الإرسال مرتين في نفس اليوم، لقد قمت بالإرسال مرة واحدة بالفعل');

    // Validate lookups first so a bad row never leaves a half-saved shift (mirrors the SQL rollback).
    var mahadir = prepareMahadir(data.mahadir);
    var complaints = prepareComplaints(data.complaints);

    var shift = insert('shifts', { shift_type: currentShiftType(), shift_date: target, submitted_at: nowTs(), section_number: n, status: 'submitted', employee_id: employeeId });
    SECTION_WRITERS[n](shift.id, data);
    mahadir.forEach(function (m) { m.shift_id = shift.id; insert('mahadir', m); });
    complaints.forEach(function (c) { c.shift_id = shift.id; insert('complaints', c); });
    save();
    publish({ type: 'data_changed', section: n, shift_id: shift.id });
    return { status: 'ok', shift_id: shift.id };
  }

  /* ───────────────────────── uploads ───────────────────────── */

  var ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'pdf', 'doc', 'docx'];
  var MAX_BYTES = 15 * 1024 * 1024;
  var MAX_STORED_BYTES = 1.2 * 1024 * 1024; // browser storage is small; larger files keep metadata only

  function readAsDataURL(file) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { resolve(null); };
      fr.readAsDataURL(file);
    });
  }

  function upload(fd) {
    var f = fd.get('file');
    if (!f || !f.name) throw new Err('لا يوجد ملف مرفق');
    var ext = f.name.indexOf('.') >= 0 ? f.name.split('.').pop().toLowerCase() : '';
    if (ALLOWED_EXTS.indexOf(ext) < 0) throw new Err('نوع الملف غير مسموح');
    var shiftId = toInt(fd.get('shift_id')), sectionNumber = toInt(fd.get('section_number'));
    var recordType = fd.get('record_type') || 'section';
    var recordId = toInt(fd.get('record_id')) || null;
    var uploadedBy = toInt(fd.get('uploaded_by')) || null;
    if (!shiftId || !sectionNumber) throw new Err('shift_id and section_number required');
    if (['section', 'mahadir', 'complaint'].indexOf(recordType) < 0) throw new Err('record_type غير صالح');
    if (f.size > MAX_BYTES) throw new Err('حجم الملف أكبر من المسموح (15 ميجا)');

    var p = f.size <= MAX_STORED_BYTES ? readAsDataURL(f) : Promise.resolve(null);
    return p.then(function (dataUrl) {
      var row = insert('attachments', {
        shift_id: shiftId, section_number: sectionNumber, record_type: recordType, record_id: recordId,
        original_name: f.name, stored_path: todayRiyadh() + '/' + shiftId + '/' + f.name,
        mime_type: f.type || 'application/octet-stream', size_bytes: f.size, uploaded_by: uploadedBy, uploaded_at: nowTs()
      });
      if (dataUrl) { try { localStorage.setItem(ATT_PREFIX + row.id, dataUrl); } catch (e) { /* preview not kept */ } }
      save();
      publish({ type: 'attachment_added', section: sectionNumber, shift_id: shiftId });
      return { status: 'ok', id: row.id, stored_path: row.stored_path, original_name: row.original_name, mime_type: row.mime_type, size_bytes: row.size_bytes, uploaded_at: row.uploaded_at };
    });
  }

  var blobCache = {};
  function dataUrlToBlob(u) {
    var parts = u.split(','), mime = (parts[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    var bin = atob(parts[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function attachmentUrl(id) {
    if (blobCache[id]) return blobCache[id];
    var a = null;
    db.attachments.forEach(function (x) { if (x.id === id) a = x; });
    if (!a) return '#';
    var blob = null;
    if (a.seed === 'img') {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f5132"/><stop offset="1" stop-color="#c9a84c"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><circle cx="320" cy="170" r="70" fill="none" stroke="#fff" stroke-width="8" opacity=".85"/><path d="M285 170h70M320 135v70" stroke="#fff" stroke-width="8" opacity=".85"/><text x="320" y="320" font-family="Arial,sans-serif" font-size="26" fill="#fff" text-anchor="middle">Demo attachment</text></svg>';
      blob = new Blob([svg], { type: 'image/svg+xml' });
    } else if (a.seed === 'pdf') {
      var pdf = '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000095 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n151\n%%EOF\n';
      blob = new Blob([pdf], { type: 'application/pdf' });
    } else {
      var d = null;
      try { d = localStorage.getItem(ATT_PREFIX + id); } catch (e) {}
      if (d) blob = dataUrlToBlob(d);
    }
    if (!blob) return '#';
    blobCache[id] = URL.createObjectURL(blob);
    return blobCache[id];
  }

  /* ───────────────────────── manager routes ───────────────────────── */

  var SECTION_META = {
    1: { name_ar: 'الاستعداد المسبق', tables: ['section1_istedad'] },
    2: { name_ar: 'التفويج والمغادرة', tables: ['section2_pilgrims', 'section2_flights', 'section2_buses', 'section2_timing'] },
    3: { name_ar: 'زيارة الروضة', tables: ['section3_rawda'] },
    4: { name_ar: 'الرعاية الصحية', tables: ['section4_health'] },
    5: { name_ar: 'نسك', tables: ['section5_nusuk'] },
    6: { name_ar: 'السكن', tables: ['section6_sokn'] },
    7: { name_ar: 'الميقات', tables: ['section7_meeqat'] }
  };

  function resolveWindow(q) {
    var mode = (q.get('date_mode') || 'day').toLowerCase();
    var df = q.get('date_from'), dt = q.get('date_to'), today = todayRiyadh();
    if (mode === 'day') { var d = df || today; return { from: d, to: d, mode: mode }; }
    if (mode === 'range') return { from: df || addDays(today, -30), to: dt || today, mode: mode };
    return { from: '1900-01-01', to: '9999-12-31', mode: 'season' };
  }

  function shiftMap() { var m = {}; db.shifts.forEach(function (s) { m[s.id] = s; }); return m; }
  function empName(id) { var e = employeeById(id); return e ? e.name : null; }
  function nameOf(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name_ar; return null; }
  function inWin(s, w) { return s && s.shift_date >= w.from && s.shift_date <= w.to; }
  function avgOf(items) {
    var v = items.map(function (r) { return r.processing_minutes; }).filter(function (x) { return x !== null && x !== undefined; });
    return v.length ? Math.round(sum(v, function (x) { return x; }) / v.length * 10) / 10 : null;
  }
  function paramInt(q, k) { var v = parseInt(q.get(k), 10); return isNaN(v) ? null : v; }

  function mahadirRow(m, s) {
    return {
      id: m.id, shift_id: m.shift_id, report_number: m.report_number,
      violation_type_id: m.violation_type_id, violation_name: nameOf(db.lookups.violation_types, m.violation_type_id),
      location_type_id: m.location_type_id, location_name: nameOf(db.lookups.location_types, m.location_type_id),
      responsible_party_id: m.responsible_party_id, responsible_party_name: nameOf(db.lookups.responsible_parties, m.responsible_party_id),
      start_time: m.start_time, end_time: m.end_time, processing_minutes: m.processing_minutes,
      notes: m.notes, photo_path: m.photo_path, created_at: m.created_at,
      shift_date: s.shift_date, section_number: s.section_number, employee_id: s.employee_id, employee_name: empName(s.employee_id)
    };
  }
  function complaintRow(c, s) {
    return {
      id: c.id, shift_id: c.shift_id, case_number: c.case_number, type: c.type,
      source_party_id: c.source_party_id, source_party_name: nameOf(db.lookups.complaint_sources, c.source_party_id),
      start_time: c.start_time, end_time: c.end_time, processing_minutes: c.processing_minutes,
      notes: c.notes, photo_path: c.photo_path, created_at: c.created_at,
      shift_date: s.shift_date, section_number: s.section_number, employee_id: s.employee_id, employee_name: empName(s.employee_id)
    };
  }

  function managerSection(n, q) {
    if (!SECTION_META[n]) throw new Err('section out of range');
    var w = resolveWindow(q), sm = shiftMap();
    var vt = paramInt(q, 'violation_type_id'), rp = paramInt(q, 'responsible_party_id'), sp = paramInt(q, 'source_party_id');
    var kind = q.get('complaint_kind');

    var shifts = db.shifts.filter(function (s) { return s.section_number === n && inWin(s, w); })
      .sort(function (a, b) { return a.shift_date < b.shift_date ? 1 : a.shift_date > b.shift_date ? -1 : b.id - a.id; })
      .map(function (s) { return { id: s.id, shift_type: s.shift_type, shift_date: s.shift_date, submitted_at: s.submitted_at, status: s.status, employee_id: s.employee_id, employee_name: empName(s.employee_id) }; });
    var ids = {}; shifts.forEach(function (s) { ids[s.id] = true; });

    var sectionData = {};
    SECTION_META[n].tables.forEach(function (t) { sectionData[t] = db[t].filter(function (r) { return ids[r.shift_id]; }).sort(byIdDesc); });

    var mahadir = db.mahadir.filter(function (m) {
      var s = sm[m.shift_id];
      return s && s.section_number === n && inWin(s, w) && (!vt || m.violation_type_id === vt) && (!rp || m.responsible_party_id === rp);
    }).sort(byIdDesc).map(function (m) { return mahadirRow(m, sm[m.shift_id]); });

    var complaintsAll = db.complaints.filter(function (c) {
      var s = sm[c.shift_id];
      return s && s.section_number === n && inWin(s, w) && (!sp || c.source_party_id === sp) && ((kind !== 'شكوى' && kind !== 'بلاغ') || c.type === kind);
    }).sort(byIdDesc).map(function (c) { return complaintRow(c, sm[c.shift_id]); });
    var shakawi = complaintsAll.filter(function (r) { return r.type === 'شكوى'; });
    var balaghat = complaintsAll.filter(function (r) { return r.type === 'بلاغ'; });

    var attachments = db.attachments.filter(function (a) { return ids[a.shift_id]; }).sort(byIdDesc).map(function (a) {
      return { id: a.id, shift_id: a.shift_id, section_number: a.section_number, record_type: a.record_type, record_id: a.record_id, original_name: a.original_name, stored_path: a.stored_path, mime_type: a.mime_type, size_bytes: a.size_bytes, uploaded_by: a.uploaded_by, uploaded_at: a.uploaded_at, uploaded_by_name: empName(a.uploaded_by) };
    });

    var allInSection = db.mahadir.filter(function (m) { var s = sm[m.shift_id]; return s && s.section_number === n && inWin(s, w); });
    var breakdown = db.lookups.violation_types.map(function (v) {
      return { id: v.id, name_ar: v.name_ar, count: allInSection.filter(function (m) { return m.violation_type_id === v.id; }).length, _so: v.sort_order };
    }).sort(function (a, b) { return b.count - a.count || a._so - b._so || a.id - b.id; })
      .map(function (r) { return { id: r.id, name_ar: r.name_ar, count: r.count }; });

    var trend = shifts.slice().sort(function (a, b) { return a.shift_date < b.shift_date ? -1 : a.shift_date > b.shift_date ? 1 : 0; }).map(function (s) {
      return {
        day: s.shift_date,
        mahadir_count: db.mahadir.filter(function (m) { return m.shift_id === s.id; }).length,
        shakawi_count: db.complaints.filter(function (c) { return c.shift_id === s.id && c.type === 'شكوى'; }).length,
        balaghat_count: db.complaints.filter(function (c) { return c.shift_id === s.id && c.type === 'بلاغ'; }).length,
        attachments_count: db.attachments.filter(function (a) { return a.shift_id === s.id; }).length
      };
    });

    function avgLabel(items) { var a = avgOf(items); return a !== null ? a.toFixed(1) + ' د' : '—'; }
    var kpis = [
      { key: 'total_shifts', label_ar: 'عدد التسليمات', value: shifts.length },
      { key: 'total_mahadir', label_ar: 'إجمالي المحاضر', value: mahadir.length },
      { key: 'total_shakawi', label_ar: 'إجمالي الشكاوى', value: shakawi.length },
      { key: 'total_balaghat', label_ar: 'إجمالي البلاغات', value: balaghat.length },
      { key: 'total_attachments', label_ar: 'إجمالي المرفقات', value: attachments.length },
      { key: 'avg_mahadir', label_ar: 'متوسط زمن معالجة المحاضر', value: avgLabel(mahadir) },
      { key: 'avg_shakawi', label_ar: 'متوسط زمن معالجة الشكاوى', value: avgLabel(shakawi) },
      { key: 'avg_balaghat', label_ar: 'متوسط زمن معالجة البلاغات', value: avgLabel(balaghat) }
    ];
    var sd = sectionData, ins = [];
    function S(t, k) { return sum(sd[t] || [], function (r) { return r[k]; }); }
    if (n === 1) ins = [{ key: 'expected_arrivals', label_ar: 'إجمالي الحجاج المتوقع وصولهم', value: S('section1_istedad', 'expected_arrivals') }, { key: 'expected_departures', label_ar: 'إجمالي الحجاج المتوقع مغادرتهم', value: S('section1_istedad', 'expected_departures') }];
    else if (n === 2) ins = [{ key: 'total_arrivals', label_ar: 'إجمالي القادمين', value: S('section2_pilgrims', 'arrivals_count') }, { key: 'total_departures', label_ar: 'إجمالي المغادرين', value: S('section2_pilgrims', 'departures_count') }, { key: 'total_flights', label_ar: 'إجمالي الرحلات', value: S('section2_flights', 'arriving_flights') + S('section2_flights', 'departing_flights') }, { key: 'total_buses', label_ar: 'إجمالي الحافلات', value: S('section2_buses', 'arriving_buses') + S('section2_buses', 'departing_buses') }];
    else if (n === 3) ins = [{ key: 'total_visitors', label_ar: 'إجمالي زيارات الروضة', value: S('section3_rawda', 'total_visitors') }, { key: 'total_permits', label_ar: 'إجمالي التصاريح المصدرة', value: S('section3_rawda', 'permits_issued') }];
    else if (n === 4) ins = [{ key: 'hospital_visits', label_ar: 'إجمالي زيارات المستشفيات', value: S('section4_health', 'hospital_visits') }, { key: 'admitted_cases', label_ar: 'إجمالي المنومين', value: S('section4_health', 'admitted_cases') }, { key: 'death_cases', label_ar: 'إجمالي الوفيات', value: S('section4_health', 'death_cases') }, { key: 'patient_cases', label_ar: 'إجمالي الحالات الطبية', value: S('section4_health', 'patient_cases') }];
    else if (n === 5) ins = [{ key: 'archive_cards', label_ar: 'بطاقات الأرشيف', value: S('section5_nusuk', 'archive_cards') }, { key: 'activated_cards', label_ar: 'بطاقات مفعّلة', value: S('section5_nusuk', 'activated_cards') }, { key: 'total_arrivals', label_ar: 'إجمالي الواصلين', value: S('section5_nusuk', 'total_arrivals') }, { key: 'unreceived_cards', label_ar: 'بطاقات لم تُستلم', value: S('section5_nusuk', 'unreceived_cards') }];
    else if (n === 6) ins = [{ key: 'sokn_buses', label_ar: 'إجمالي حافلات السكن', value: S('section6_sokn', 'bus_count') }];
    else if (n === 7) ins = [{ key: 'meeqat_buses', label_ar: 'إجمالي حافلات الميقات', value: S('section7_meeqat', 'bus_count') }];
    kpis = ins.concat(kpis);

    return {
      status: 'ok', section_number: n, section_name_ar: SECTION_META[n].name_ar,
      filters_echo: { date_mode: w.mode, date_from: w.from, date_to: w.to, violation_type_id: vt, responsible_party_id: rp, source_party_id: sp, complaint_kind: kind },
      kpis: kpis, shifts: shifts, section_data: sectionData, mahadir: mahadir, shakawi: shakawi, balaghat: balaghat,
      attachments: attachments, violation_breakdown: breakdown, daily_trend: trend
    };
  }

  function avgTimeStr(times) {
    if (!times.length) return null;
    var total = 0;
    times.forEach(function (t) { var p = t.split(':'); total += (+p[0]) * 3600 + (+p[1]) * 60 + (+(p[2] || 0)); });
    var avg = Math.floor(total / times.length);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(Math.floor(avg / 3600)) + ':' + pad(Math.floor((avg % 3600) / 60));
  }

  function dailyReport(q) {
    var d = q.get('date') || todayRiyadh(), sm = shiftMap();
    var portMap = [['المطار', 'مطار الأمير محمد بن عبد العزيز'], ['القطار', 'قطار الحرمين'], ['محطة الهجرة', 'الحديثة'], ['المنافذ البرية', 'حالة عمار']];
    function onDay(r) { var s = sm[r.shift_id]; return s && s.shift_date === d; }

    var ports = portMap.map(function (p) {
      var fl = db.section2_flights.filter(function (f) { return onDay(f) && f.port_type === p[0]; });
      var bs = db.section2_buses.filter(function (b) { return onDay(b) && b.port_type === p[0]; });
      var fa = sum(fl, function (x) { return x.arriving_flights; }), fd = sum(fl, function (x) { return x.departing_flights; });
      var ba = sum(bs, function (x) { return x.arriving_buses; }), bd = sum(bs, function (x) { return x.departing_buses; });
      return { form_name: p[0], display_name: p[1], flights_arriving: fa, flights_departing: fd, buses_arriving: ba, buses_departing: bd, total_trips: fa + fd + ba + bd, total_arrivals: fa + ba, total_departures: fd + bd };
    });

    var natMap = {};
    db.section2_pilgrims.filter(onDay).forEach(function (p) {
      var k = natMap[p.nationality] || (natMap[p.nationality] = { nationality: p.nationality, arrivals: 0, departures: 0 });
      k.arrivals += p.arrivals_count || 0; k.departures += p.departures_count || 0;
    });
    var nat = Object.keys(natMap).map(function (k) { return natMap[k]; }).sort(function (a, b) { return (b.arrivals + b.departures) - (a.arrivals + a.departures); });

    var timing = db.section2_timing.filter(onDay);
    var avgFlight = avgTimeStr(timing.map(function (t) { return t.avg_flight_processing_time; }).filter(Boolean));
    var avgKilo9 = avgTimeStr(db.section6_sokn.filter(onDay).map(function (t) { return t.avg_processing_time; }).filter(Boolean));
    var avgMeeqat = avgTimeStr(db.section7_meeqat.filter(onDay).map(function (t) { return t.avg_processing_time; }).filter(Boolean));

    function avgComplaint(type) {
      var v = db.complaints.filter(function (c) { var s = sm[c.shift_id]; return s && s.shift_date === d && c.type === type && c.processing_minutes !== null && c.processing_minutes !== undefined; });
      return v.length ? Math.round(sum(v, function (x) { return x.processing_minutes; }) / v.length * 10) / 10 : null;
    }

    var rawda = sum(db.section3_rawda.filter(onDay), function (r) { return r.total_visitors; });

    var topT = null, from = addDays(d, -6), perDay = {};
    db.section2_pilgrims.forEach(function (p) {
      var s = sm[p.shift_id];
      if (s && s.shift_date >= from && s.shift_date <= d) {
        var k = perDay[s.shift_date] || (perDay[s.shift_date] = { a: 0, d: 0 });
        k.a += p.arrivals_count || 0; k.d += p.departures_count || 0;
      }
    });
    Object.keys(perDay).forEach(function (day) {
      if (perDay[day].a > 0) { var r = perDay[day].d / perDay[day].a; if (topT === null || r > topT) topT = r; }
    });

    var h = db.section4_health.filter(onDay);
    var e = db.section1_istedad.filter(onDay);
    var totA = sum(nat, function (x) { return x.arrivals; }), totD = sum(nat, function (x) { return x.departures; });

    return {
      status: 'ok', date: d, ports: ports, nationality_breakdown: nat,
      total_arrivals_all_ports: totA, total_departures_all_ports: totD,
      operations: {
        avg_flight_processing: avgFlight, avg_train_processing: avgFlight,
        avg_bus_meeqat_processing: avgMeeqat, avg_bus_kilo9_processing: avgKilo9,
        avg_complaints_processing_minutes: avgComplaint('شكوى'), avg_reports_processing_minutes: avgComplaint('بلاغ'),
        rawda_visitors: rawda, top_tafweej_percent: topT !== null ? Math.round(topT * 1000) / 10 : null
      },
      health: {
        hospital_visits: sum(h, function (x) { return x.hospital_visits; }), admitted: sum(h, function (x) { return x.admitted_cases; }),
        deaths: sum(h, function (x) { return x.death_cases; }), cases: sum(h, function (x) { return x.patient_cases; })
      },
      expected_tomorrow: { arrivals: sum(e, function (x) { return x.expected_arrivals; }), departures: sum(e, function (x) { return x.expected_departures; }) }
    };
  }

  function aggregate(q) {
    var tab = (q.get('tab') || 'mahadir').toLowerCase();
    if (['mahadir', 'shakawi', 'balaghat', 'complaints'].indexOf(tab) < 0) throw new Err('tab must be mahadir|complaints|shakawi|balaghat');
    var w = resolveWindow(q), sm = shiftMap();
    var secNo = paramInt(q, 'section_number'), vt = paramInt(q, 'violation_type_id'), rp = paramInt(q, 'responsible_party_id'), sp = paramInt(q, 'source_party_id');
    var page = Math.max(1, paramInt(q, 'page') || 1);
    var pageSize = Math.min(500, Math.max(1, paramInt(q, 'page_size') || 50));
    var off = (page - 1) * pageSize, rows, total, breakdown;

    if (tab === 'mahadir') {
      var all = db.mahadir.filter(function (m) {
        var s = sm[m.shift_id];
        return s && inWin(s, w) && (!secNo || s.section_number === secNo) && (!vt || m.violation_type_id === vt) && (!rp || m.responsible_party_id === rp);
      }).sort(byIdDesc);
      total = all.length;
      rows = all.slice(off, off + pageSize).map(function (m) { return mahadirRow(m, sm[m.shift_id]); });
      breakdown = db.lookups.violation_types.map(function (v) {
        return { id: v.id, name_ar: v.name_ar, count: all.filter(function (m) { return m.violation_type_id === v.id; }).length, _so: v.sort_order };
      });
    } else {
      var kindFilter = null, ck = q.get('complaint_kind');
      if (tab === 'shakawi') kindFilter = 'شكوى';
      else if (tab === 'balaghat') kindFilter = 'بلاغ';
      else if (ck === 'شكوى' || ck === 'بلاغ') kindFilter = ck;
      var allC = db.complaints.filter(function (c) {
        var s = sm[c.shift_id];
        return s && inWin(s, w) && (!kindFilter || c.type === kindFilter) && (!secNo || s.section_number === secNo) && (!sp || c.source_party_id === sp);
      }).sort(byIdDesc);
      total = allC.length;
      rows = allC.slice(off, off + pageSize).map(function (c) { return complaintRow(c, sm[c.shift_id]); });
      breakdown = db.lookups.complaint_sources.map(function (cs) {
        return { id: cs.id, name_ar: cs.name_ar, count: allC.filter(function (c) { return c.source_party_id === cs.id; }).length, _so: cs.sort_order };
      });
    }
    breakdown = breakdown.sort(function (a, b) { return b.count - a.count || a._so - b._so || a.id - b.id; })
      .map(function (r) { return { id: r.id, name_ar: r.name_ar, count: r.count }; });

    return {
      status: 'ok', tab: tab,
      filters_echo: { date_mode: w.mode, date_from: w.from, date_to: w.to, section_number: secNo, violation_type_id: vt, responsible_party_id: rp, source_party_id: sp },
      total: total, page: page, page_size: pageSize, rows: rows, breakdown: breakdown
    };
  }

  function lookups(q) {
    var flag = (q.get('include_inactive') || '').toLowerCase();
    var inc = flag === '1' || flag === 'true' || flag === 'yes', out = {};
    Object.keys(db.lookups).forEach(function (k) {
      out[k] = db.lookups[k].filter(function (r) { return inc || r.is_active; })
        .sort(function (a, b) { return a.sort_order - b.sort_order || a.id - b.id; })
        .map(function (r) { return { id: r.id, name_ar: r.name_ar, is_active: r.is_active, sort_order: r.sort_order }; });
    });
    return { status: 'ok', data: out };
  }

  /* ───────────────────────── router ───────────────────────── */

  function route(method, path, q, body) {
    var m;
    if (method === 'POST' && path === '/api/login') return login(body || {});
    if (method === 'GET' && path === '/api/lookups') return lookups(q);
    if (method === 'GET' && path === '/api/today-status') return todayStatus(q);
    if (method === 'POST' && (m = path.match(/^\/api\/section([1-7])\/submit$/))) return submitSection(+m[1], body || {});
    if (method === 'POST' && path === '/api/upload') return upload(body);
    if (method === 'GET' && (m = path.match(/^\/api\/manager\/section\/(\d+)$/))) return managerSection(+m[1], q);
    if (method === 'GET' && path === '/api/manager/daily-report') return dailyReport(q);
    if (method === 'GET' && path === '/api/manager/aggregate') return aggregate(q);
    if (method === 'GET' && path === '/api/test') return { status: 'ok', message: 'demo api (browser)' };
    throw new Err('endpoint not available in demo: ' + path, 404);
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var u;
    try { u = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
    var idx = u.pathname.indexOf('/api/');
    if (idx < 0) return realFetch(input, init);
    var path = u.pathname.slice(idx);
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var body = null;
    if (init && init.body) {
      if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch (e) { body = {}; } }
      else body = init.body;
    }
    return new Promise(function (resolve) { setTimeout(resolve, 90); }).then(function () {
      return Promise.resolve().then(function () { return route(method, path, u.searchParams, body); })
        .then(function (obj) { return reply(200, obj); })
        .catch(function (e) {
          if (e instanceof Err) return reply(e.status, { status: 'error', message: e.message });
          return reply(500, { status: 'error', message: String(e && e.message || e) });
        });
    });
  };
  function reply(status, obj) {
    return new Response(JSON.stringify(obj), { status: status, headers: { 'Content-Type': 'application/json' } });
  }
  window.EventSource = FakeEventSource;

  /* ───────────────────────── public helpers + UI ───────────────────────── */

  load();

  window.DemoAPI = {
    attachmentUrl: attachmentUrl,
    reset: function () {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k === DB_KEY || k.indexOf(ATT_PREFIX) === 0 || k.indexOf('draft') >= 0) localStorage.removeItem(k);
        });
      } catch (e) {}
      db = buildSeed(); save(); publish({ type: 'data_changed', section: 0, shift_id: 0 });
    }
  };

  function addBanner() {
    if (document.getElementById('demo-banner')) return;
    var b = document.createElement('div');
    b.id = 'demo-banner';
    b.setAttribute('dir', 'rtl');
    var st = document.createElement('style'); st.textContent = '@media print{#demo-banner{display:none!important}}'; document.head.appendChild(st);
    b.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:99999;background:#0a2e1a;color:#e8f3ec;border:1px solid #c9a84c;border-radius:999px;padding:7px 14px;font:600 12px/1.4 Tahoma,Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;max-width:calc(100vw - 24px)';
    b.innerHTML = '<span>نسخة تجريبية · البيانات محفوظة في متصفحك فقط</span>';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'إعادة ضبط';
    btn.style.cssText = 'background:#c9a84c;color:#0a2e1a;border:0;border-radius:999px;padding:3px 10px;font:700 11px Tahoma,Arial,sans-serif;cursor:pointer';
    btn.onclick = function () {
      if (window.confirm('سيتم مسح بياناتك التجريبية وإعادتها للوضع الأصلي. هل تريد المتابعة؟')) {
        window.DemoAPI.reset();
        window.location.reload();
      }
    };
    b.appendChild(btn);
    document.body.appendChild(b);
  }

  function addLoginHelp() {
    var btn = document.getElementById('loginBtn');
    var pass = document.getElementById('passInput');
    if (!btn || !pass) return;
    var user = document.querySelector('input[type="text"]');
    if (user) user.placeholder = 'manager';
    pass.placeholder = DEMO_PASSWORD;

    var card = document.createElement('div');
    card.setAttribute('dir', 'rtl');
    card.style.cssText = 'margin-top:16px;border:1px dashed #c9a84c;background:#fffaf0;border-radius:12px;padding:12px 14px;font:13px/1.7 Tahoma,Arial,sans-serif;color:#0a2e1a';
    var rows = [
      ['manager', 'مدير — لوحات المتابعة والتقرير اليومي'],
      ['admin', 'مشرف عام — كل الأقسام'],
      ['user1 … user7', 'موظف قسم (1 إلى 7) — إدخال التقارير']
    ];
    var html = '<div style="font-weight:800;margin-bottom:6px">حسابات التجربة (متاحة للجميع)</div>'
      + '<div style="margin-bottom:8px">كلمة المرور لكل الحسابات: <b dir="ltr" style="font-family:monospace">' + DEMO_PASSWORD + '</b></div>';
    rows.forEach(function (r) {
      html += '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin:3px 0"><span><b dir="ltr" style="font-family:monospace">' + r[0] + '</b> — ' + r[1] + '</span></div>';
    });
    html += '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'
      + '<button type="button" data-u="manager" style="cursor:pointer;border:1px solid #0f5132;background:#0f5132;color:#fff;border-radius:8px;padding:6px 12px;font:700 12px Tahoma,Arial,sans-serif">دخول كمدير</button>'
      + '<button type="button" data-u="user1" style="cursor:pointer;border:1px solid #0f5132;background:#fff;color:#0f5132;border-radius:8px;padding:6px 12px;font:700 12px Tahoma,Arial,sans-serif">دخول كموظف (قسم 1)</button></div>'
      + '<div style="margin-top:8px;font-size:11.5px;color:#5a6b60">لا يوجد خادم ولا قاعدة بيانات: كل ما تُدخله يُحفظ في متصفحك فقط.</div>';
    card.innerHTML = html;
    btn.parentNode.appendChild(card);
    card.querySelectorAll('button[data-u]').forEach(function (b) {
      b.onclick = function () {
        if (user) user.value = b.getAttribute('data-u');
        pass.value = DEMO_PASSWORD;
        if (typeof window.handleLogin === 'function') window.handleLogin();
      };
    });
  }

  function onReady() { addBanner(); addLoginHelp(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
