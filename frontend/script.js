// ── Auth & Section Control ──
const SECTION_MAP = {
  'section_1': { tab: 'ft-istedad',  index: 0, api: '/api/section1/submit' },
  'section_2': { tab: 'ft-tafweej', index: 1, api: '/api/section2/submit' },
  'section_3': { tab: 'ft-rawda',   index: 2, api: '/api/section3/submit' },
  'section_4': { tab: 'ft-health',  index: 3, api: '/api/section4/submit' },
  'section_5': { tab: 'ft-nusuk',   index: 4, api: '/api/section5/submit' },
  'section_6': { tab: 'ft-sokn',    index: 5, api: '/api/section6/submit' },
  'section_7': { tab: 'ft-meeqat',  index: 6, api: '/api/section7/submit' }
};

function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch(e) { return null; }
}

const ROLE_LABELS_AR = {
  'section_1': 'القسم 1 — الاستعداد',
  'section_2': 'القسم 2 — التفويج',
  'section_3': 'القسم 3 — الروضة',
  'section_4': 'القسم 4 — الصحة',
  'section_5': 'القسم 5 — نسك',
  'section_6': 'القسم 6 — السكن',
  'section_7': 'القسم 7 — الميقات',
  'full_access': 'مشرف عام',
  'manager': 'مدير'
};

function doSignout() {
  try { localStorage.removeItem('user'); } catch(e) {}
  window.location.href = 'login.html';
}

function lockUiAfterSubmit(submittedAt) {
  const banner = document.getElementById('submitted-banner');
  const timeEl = document.getElementById('submitted-banner-time');
  if (banner) banner.style.display = 'flex';
  if (timeEl && submittedAt) {
    const t = String(submittedAt);
    const m = t.match(/(\d{2}:\d{2})/);
    timeEl.textContent = m ? ('وقت التسليم: ' + m[1]) : '';
  }
  const submitBtn = document.querySelector('.js-extracted-event-136');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'تم التسليم لهذا اليوم';
    submitBtn.style.opacity = '0.6';
    submitBtn.style.cursor = 'not-allowed';
  }
  const draftBtn = document.querySelector('.js-save-draft-btn');
  if (draftBtn) {
    draftBtn.disabled = true;
    draftBtn.style.opacity = '0.6';
    draftBtn.style.cursor = 'not-allowed';
  }
  clearDraft();
}

function initEmployeePage() {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return; }

  // Show user name in action bar
  const infoEl = document.querySelector('.action-info');
  if (infoEl) infoEl.textContent = 'مرحباً: ' + user.name + ' | الدور: ' + (ROLE_LABELS_AR[user.role] || user.role);

  // Header user pill + sign-out
  const pill = document.getElementById('user-pill');
  const pillName = document.getElementById('user-pill-name');
  const pillRole = document.getElementById('user-pill-role');
  const signoutBtn = document.getElementById('signout-btn');
  if (pill && pillName && pillRole) {
    pillName.textContent = user.name;
    pillRole.textContent = ROLE_LABELS_AR[user.role] || user.role;
    pill.style.display = 'inline-flex';
  }
  if (signoutBtn) signoutBtn.style.display = 'inline-block';
  var mgrBtn = document.getElementById('mgr-btn');
  if (mgrBtn) mgrBtn.style.display = 'inline-flex';

  // Backdate panel — admin/manager only
  var canBackdate = (user.role === 'full_access' || user.role === 'manager');
  var backdatePanel = document.getElementById('backdate-panel');
  var backdateInput = document.getElementById('backdate-input');
  var backdateHint  = document.getElementById('backdate-hint');
  if (canBackdate && backdatePanel && backdateInput) {
    var todayIso = new Date().toISOString().slice(0, 10);
    backdateInput.value = todayIso;
    backdateInput.max = todayIso;  // prevent picking future days
    backdatePanel.style.display = 'block';
    backdateInput.addEventListener('change', function () {
      if (backdateInput.value && backdateInput.value !== todayIso) {
        backdateHint.textContent = '⚠ سيُسجَّل التسليم بتاريخ ' + backdateInput.value + ' (إدخال رجعي).';
        backdateHint.classList.add('warn');
      } else {
        backdateHint.textContent = 'سيُرفع التسليم بتاريخ اليوم. غيّر التاريخ لإدخال بيانات قديمة.';
        backdateHint.classList.remove('warn');
      }
    });
  }

  const role = user.role;
  const section = SECTION_MAP[role];

  // Restore today's draft if any (defer to next tick so dynamic row-init scripts run first)
  setTimeout(function () {
    if (restoreDraftIfAny()) {
      showToast('✓ تم استرجاع المسودة المحفوظة لليوم');
    }
    updateDraftBadge();
  }, 200);

  // Check today-status for section users only
  if (section) {
    fetch('/api/today-status?employee_id=' + encodeURIComponent(user.id) + '&section=' + (section.index + 1))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.submitted) lockUiAfterSubmit(data.submitted_at);
      })
      .catch(function () {});
  }

  // If role is not a section role, show all tabs (admin/manager)
  if (!section || role === 'full_access' || role === 'manager') return;

  // Hide all tabs except the user's section
  const tabs = document.querySelectorAll('.form-tab');
  const bodies = document.querySelectorAll('.form-body');

  tabs.forEach((tab, i) => {
    if (i !== section.index) {
      tab.style.display = 'none';
    }
  });

  // Show only the correct form body
  bodies.forEach(body => body.classList.add('tab-hidden'));
  const activeBody = document.getElementById(section.tab);
  if (activeBody) activeBody.classList.remove('tab-hidden');

  // Update header title
  const titles = {
    'ft-istedad': 'الاستعداد المسبق',
    'ft-tafweej': 'التفويج والمغادرة',
    'ft-rawda':   'زيارة الروضة الشريفة',
    'ft-health':  'الرعاية الصحية',
    'ft-nusuk':   'نسك',
    'ft-sokn':    'السكن',
    'ft-meeqat':  'الميقات'
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[section.tab] || '';

  const badges = {
    'ft-istedad': 'القسم 1 من 7',
    'ft-tafweej': 'القسم 2 من 7',
    'ft-rawda':   'القسم 3 من 7',
    'ft-health':  'القسم 4 من 7',
    'ft-nusuk':   'القسم 5 من 7',
    'ft-sokn':    'القسم 6 من 7',
    'ft-meeqat':  'القسم 7 من 7'
  };
  const badgeEl = document.getElementById('section-badge');
  if (badgeEl) badgeEl.textContent = badges[section.tab] || '';
}

// Run on page load
document.addEventListener('DOMContentLoaded', initEmployeePage);

// Custom JavaScript extracted from index.html

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.app-nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (typeof event !== 'undefined' && event && event.target) event.target.classList.add('active');

  // Toggle body classes for CSS targeting
  document.body.classList.toggle('mgr-active', name === 'manager');
  document.body.classList.toggle('adv-active', name === 'adv');

  var isEmployee = (name === 'employee');

  var actionRow = document.getElementById('emp-action-row');
  if (actionRow) actionRow.style.display = isEmployee ? '' : 'none';

  var formTabsBar = document.querySelector('#view-employee .form-tabs-bar');
  if (formTabsBar) formTabsBar.style.display = isEmployee ? '' : 'none';

  var shiftStrip = document.querySelector('#view-employee .shift-strip');
  if (shiftStrip) shiftStrip.style.display = isEmployee ? '' : 'none';

  var empHeader = document.querySelector('#view-employee .emp-header');
  if (empHeader) empHeader.style.display = isEmployee ? '' : 'none';

  var bianatSection = document.getElementById('taf-bianat-section');
  if (bianatSection) bianatSection.style.display = (name === 'manager') ? 'none' : '';
}

const tabTitles = {"ft-istedad": "الاستعداد المسبق", "ft-tafweej": "التفويج والمغادرة", "ft-rawda": "زيارة الروضة الشريفة", "ft-health": "الرعاية الصحية", "ft-nusuk": "نسك", "ft-sokn": "السكن", "ft-meeqat": "الميقات"};
const tabNumbers = {"ft-istedad": "القسم 1 من 7", "ft-tafweej": "القسم 2 من 7", "ft-rawda": "القسم 3 من 7", "ft-health": "القسم 4 من 7", "ft-nusuk": "القسم 5 من 7", "ft-sokn": "القسم 6 من 7", "ft-meeqat": "القسم 7 من 7"};

function switchFormTab(btn, targetId) {
  document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.form-body').forEach(f => f.classList.add('tab-hidden'));
  document.getElementById(targetId).classList.remove('tab-hidden');
  const titleEl = document.getElementById('page-title');
  if (titleEl && tabTitles[targetId]) titleEl.textContent = tabTitles[targetId];
  const badgeEl = document.getElementById("section-badge");
  if (badgeEl && tabNumbers[targetId]) badgeEl.textContent = tabNumbers[targetId];
}

function calcTimeDiff() {
  const startEl = document.getElementById('ist-start');
  const endEl = document.getElementById('ist-end');
  if (!startEl || !endEl) return;
  const s = startEl.value;
  const e = endEl.value;
  if (!s || !e) return;
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  let txt = '';
  if (h > 0 && m > 0) txt = h + ' ساعة و ' + m + ' دقيقة';
  else if (h > 0) txt = h + ' ساعة';
  else txt = m + ' دقيقة';
  document.getElementById('ist-diff-val').textContent = txt;
  document.getElementById('ist-diff-sub').textContent = 'من ' + s + ' إلى ' + e;
  const warn = document.getElementById('ist-diff-warn');
  const box = document.getElementById('ist-diff-box');
  const val = document.getElementById('ist-diff-val');
  if (diff > 180) {
    warn.style.display = 'inline';
    box.style.borderColor = 'var(--red)';
    box.style.background = '#fdf1f1';
    val.style.color = 'var(--red)';
  } else {
    warn.style.display = 'none';
    box.style.borderColor = 'var(--green-brand)';
    box.style.background = 'var(--green-pale)';
    val.style.color = 'var(--green-brand)';
  }
}

function rawdaHandleDrop(e) {
  e.preventDefault();
  document.getElementById('rawda-drop-zone').style.borderColor = '';
  document.getElementById('rawda-drop-zone').style.background = '';
  rawdaShowPreviews(e.dataTransfer.files);
}

function rawdaShowPreviews(files) {
  if (!files || !files.length) return;
  const grid = document.getElementById('rawda-preview-grid');
  const area = document.getElementById('rawda-preview-area');
  area.style.display = 'block';
  Array.from(files).forEach(function(file) {
    const isImage = file.type.startsWith('image/') || file.name.match(/\.(heic|heif|raw|tif|tiff)$/i);
    const reader = new FileReader();
    reader.onload = function(ev) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--green-brand);';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      const del = document.createElement('button');
      del.innerHTML = '✕';
      del.style.cssText = 'position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      del.onclick = function() {
        wrap.remove();
        if (!grid.children.length) area.style.display = 'none';
      };
      const name = document.createElement('div');
      name.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:white;font-size:9px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      name.textContent = file.name;
      wrap.appendChild(img);
      wrap.appendChild(del);
      wrap.appendChild(name);
      grid.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

function healthHandleDrop(e) {
  e.preventDefault();
  document.getElementById('health-drop-zone').style.borderColor = '';
  document.getElementById('health-drop-zone').style.background = '';
  healthShowPreviews(e.dataTransfer.files);
}

function healthShowPreviews(files) {
  if (!files || !files.length) return;
  const grid = document.getElementById('health-preview-grid');
  const area = document.getElementById('health-preview-area');
  area.style.display = 'block';
  Array.from(files).forEach(function(file) {
    const isImage = file.type.startsWith('image/') || file.name.match(/\.(heic|heif|raw|tif|tiff)$/i);
    const reader = new FileReader();
    reader.onload = function(ev) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--green-brand);';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      const del = document.createElement('button');
      del.innerHTML = '✕';
      del.style.cssText = 'position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      del.onclick = function() { wrap.remove(); if (!grid.children.length) area.style.display = 'none'; };
      const name = document.createElement('div');
      name.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:white;font-size:9px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      name.textContent = file.name;
      wrap.appendChild(img); wrap.appendChild(del); wrap.appendChild(name);
      grid.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

function nusukHandleDrop(e) {
  e.preventDefault();
  document.getElementById('nusuk-drop-zone').style.borderColor = '';
  document.getElementById('nusuk-drop-zone').style.background = '';
  nusukShowPreviews(e.dataTransfer.files);
}

function nusukShowPreviews(files) {
  if (!files || !files.length) return;
  const grid = document.getElementById('nusuk-preview-grid');
  const area = document.getElementById('nusuk-preview-area');
  area.style.display = 'block';
  Array.from(files).forEach(function(file) {
    const isImage = file.type.startsWith('image/') || file.name.match(/\.(heic|heif|raw|tif|tiff)$/i);
    const reader = new FileReader();
    reader.onload = function(ev) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--green-brand);';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      const del = document.createElement('button');
      del.innerHTML = '✕';
      del.style.cssText = 'position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      del.onclick = function() { wrap.remove(); if (!grid.children.length) area.style.display='none'; };
      const name = document.createElement('div');
      name.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:white;font-size:9px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      name.textContent = file.name;
      wrap.appendChild(img); wrap.appendChild(del); wrap.appendChild(name);
      grid.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

// ── Shift Logic ──
var SHIFTS = [
  { num: 1, label: 'الفترة 1', range: '07:00 ص — 03:00 م', pill: 'shift-pill-1', from: 7*60,  to: 15*60 },
  { num: 2, label: 'الفترة 2', range: '03:00 م — 11:00 م', pill: 'shift-pill-2', from: 15*60, to: 23*60 },
  { num: 3, label: 'الفترة 3', range: '11:00 م — 07:00 ص', pill: 'shift-pill-3', from: 23*60, to:  7*60 }
];

function getShift(h, m) {
  var mins = h * 60 + m;
  if (mins >= 7*60  && mins < 15*60) return SHIFTS[0];
  if (mins >= 15*60 && mins < 23*60) return SHIFTS[1];
  return SHIFTS[2];
}

var SHIFT_BADGE_COLORS = {
  1: { bg: 'rgba(134,239,172,0.18)', border: 'rgba(134,239,172,0.50)', color: '#86efac' },
  2: { bg: 'rgba(59,130,246,0.18)',  border: 'rgba(59,130,246,0.50)',  color: '#93c5fd' },
  3: { bg: 'rgba(168,85,247,0.18)', border: 'rgba(168,85,247,0.50)', color: '#d8b4fe' }
};

function updateShift() {
  var now  = new Date();
  var shift = getShift(now.getHours(), now.getMinutes());
  document.getElementById('shift-num').textContent       = shift.num;
  document.getElementById('shift-range').textContent     = shift.range;
  document.getElementById('shift-pill-text').textContent = shift.label;
  var pill = document.getElementById('shift-pill');
  pill.className = 'shift-pill ' + shift.pill;

  var badge = document.getElementById('shift-badge-box');
  if (badge) {
    var c = SHIFT_BADGE_COLORS[shift.num];
    badge.style.background   = c.bg;
    badge.style.borderColor  = c.border;
    badge.style.color        = c.color;
  }
  var numEl = document.getElementById('shift-num');
  if (numEl && SHIFT_BADGE_COLORS[shift.num]) {
    numEl.style.color = SHIFT_BADGE_COLORS[shift.num].color;
  }
  var labelEl = document.querySelector('.shift-badge-label');
  if (labelEl && SHIFT_BADGE_COLORS[shift.num]) {
    labelEl.style.color = SHIFT_BADGE_COLORS[shift.num].color;
  }
}

function updateClock() {
  var now = new Date();
  var d = now.toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var t = now.toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit',hour12:false});
  var el = document.getElementById('page-date');
  if (el) el.textContent = d + ' — ' + t;
  updateShift();
}
updateClock(); setInterval(updateClock, 60000);

function maskHHMM(input) {
  var v = (input.value || '').replace(/[^0-9:]/g, '');
  var hadColon = v.indexOf(':') !== -1;
  v = v.replace(/:/g, '');
  if (v.length >= 2) v = v.slice(0, 2) + ':' + v.slice(2, 4);
  if (v.length > 5) v = v.slice(0, 5);
  if (v.length >= 2) {
    var h = parseInt(v.slice(0, 2), 10);
    if (isNaN(h)) h = 0;
    if (h > 23) v = '23' + v.slice(2);
  }
  if (v.length === 5) {
    var m = parseInt(v.slice(3, 5), 10);
    if (isNaN(m)) m = 0;
    if (m > 59) v = v.slice(0, 3) + '59';
  }
  input.value = v;
}
document.addEventListener('input', function (ev) {
  var t = ev.target;
  if (t && t.matches && t.matches('input[data-time-mask="1"]')) {
    maskHHMM(t);
    if (typeof calcRowDiff === 'function' && t.closest && t.closest('tr')) calcRowDiff(t);
  }
});

function calcDiff() {
  const s = document.getElementById('t-start').value;
  const e = document.getElementById('t-end').value;
  const box = document.getElementById('diff-box');
  const val = document.getElementById('diff-val');
  const sub = document.getElementById('diff-sub');
  const warn = document.getElementById('diff-warn');
  if (!s || !e) return;
  const [sh,sm] = s.split(':').map(Number);
  const [eh,em] = e.split(':').map(Number);
  let diff = (eh*60+em)-(sh*60+sm);
  if (diff < 0) diff += 1440;
  const h = Math.floor(diff/60), m = diff%60;
  val.textContent = h>0&&m>0 ? h+' ساعة و '+m+' دقيقة' : h>0 ? h+' ساعة' : m+' دقيقة';
  sub.textContent = 'من '+s+' إلى '+e;
  if (diff > 180) {
    warn.style.display='inline'; box.style.borderColor='var(--red)';
    box.style.background='#fdf1f1'; val.style.color='var(--red)';
  } else {
    warn.style.display='none'; box.style.borderColor='var(--green-brand)';
    box.style.background='var(--green-pale)'; val.style.color='var(--green-brand)';
  }
}

function calcRowDiff(input) {
  const row = input.closest('tr');
  if (!row) return;
  const times = row.querySelectorAll('input[data-time-mask="1"]');
  const diffBox = row.querySelector('.row-diff');
  if (times.length < 2 || !diffBox) return;
  const s = times[0].value, e = times[1].value;
  if (!s || !e) { diffBox.textContent='—'; diffBox.className='row-diff'; return; }
  const [sh,sm]=s.split(':').map(Number), [eh,em]=e.split(':').map(Number);
  let diff=(eh*60+em)-(sh*60+sm);
  if (diff<0) diff+=1440;
  const h=Math.floor(diff/60), m=diff%60;
  diffBox.textContent = h>0&&m>0 ? h+'س '+m+'د' : h>0 ? h+'س' : m+'د';
  diffBox.className = 'row-diff '+(diff>180?'over':'active');
}

function removeRow(btn, bodyId, statId, countId) {
  const tbody = document.getElementById(bodyId);
  if (tbody.rows.length <= 1) return;
  btn.closest('tr').remove();
  document.getElementById(statId).textContent = tbody.rows.length;
  const filled = [...tbody.rows].filter(r=>r.querySelector('input')&&r.querySelector('input').value.trim()!=='').length;
  document.getElementById(countId).textContent = filled;
}

function addMahadirRow() {
  const tbody = document.getElementById('mahadir-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-26 js-extracted-event-137" type="number" min="1" placeholder="رقم المحضر" inputmode="numeric"></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— المخالفة —</option><option>عدم مطابقة عدد الحجاج مع العقد</option><option>عدم وجود مسؤول الحجاج في موقع المغادرة</option><option>مغادرة الحجاج دون الرجوع إلى مكتب الخدمة</option><option>رفض الحجاج للحافلات في موقع المغادرة</option><option>تأخر شركة التحميل والتنزيل</option><option>الخروج المبكر للحجاج قبل موعد المغادرة</option><option>تأخر وصول الحافلات في موقع المغادرة</option><option>رفض مسؤول الحجاج تأمين شاحنة لنقل الأمتعة الزائدة</option><option>وصول الحجاج قبل موعد بداية عقد السكن</option><option>عدم توزيع الحجاج بالشكل المناسب على الحافلات</option><option>عدم جاهزية الحجاج عند الوصول إلى موقع المغادرة</option><option>رفض تسليم الجوازات من قبل الحجاج</option><option>عدم جاهزية الحجاج للمغادرة</option><option>رفض الحجاج للسكن</option><option>وصول الحجاج بعد موعد بداية عقد السكن</option><option>تأخر مسؤول الحجاج في إنهاء إجراءات المغادرة</option><option>عدم جاهزية السكن عند وصول الحجاج</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الموقع —</option><option>المطار</option><option>القطار</option><option>محطة الهجرة</option><option>المنافذ البرية</option><option>الميدان</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الجهة —</option><option>إرشاد الحافلات</option><option>متعهد نقل امتعة</option><option>متعهد الإعاشة</option><option>التحميل والتنزيل</option><option>شركة النقل</option><option>إرشاد التائهين</option><option>الوحدة السكنية</option></select></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-138" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-139" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-140">✕</button></td>';
  tbody.appendChild(tr);
  document.getElementById('s-mahadir').textContent = tbody.rows.length;
}

function addComplaintRow() {
  const tbody = document.getElementById('complaints-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-7 js-extracted-event-141" type="number" min="1" placeholder="رقم الحالة" inputmode="numeric"></td>'
    +'<td><select class="form-select extracted-style-19"><option>شكوى</option><option>بلاغ</option></select></td>'
    +'<td><select class="form-select extracted-style-19"><option value="" disabled selected>— اختر الجهة —</option><option>وزارة الحج والعمرة</option><option>العمليات الميدانية</option><option>مركز الاتصال الموحد</option><option>الجهة المقدمة للخدمة</option></select></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-142" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-143" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-144">✕</button></td>';
  tbody.appendChild(tr);
  document.getElementById('s-complaints').textContent = tbody.rows.length;
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.style.borderColor='var(--gray-300)';
  showImgs(e.dataTransfer.files);
}
function handleImgSelect(input) { showImgs(input.files); }
function showImgs(files) {
  const area = document.getElementById('img-preview-area');
  if (area) area.style.display = 'block';
  const grid = document.getElementById('img-grid');
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      const wrap = document.createElement('div');
      wrap.className = 'img-thumb';
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--green-brand);display:flex;align-items:center;justify-content:center;background:#f2f5f3;';

      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        wrap.appendChild(img);
      } else {
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:32px;text-align:center;';
        if (file.name.match(/\.pdf$/i)) icon.textContent = '📄';
        else if (file.name.match(/\.docx?$/i)) icon.textContent = '📝';
        else icon.textContent = '📎';
        const fname = document.createElement('div');
        fname.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:white;font-size:9px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        fname.textContent = file.name;
        wrap.appendChild(icon);
        wrap.appendChild(fname);
      }

      const del = document.createElement('button');
      del.className='img-thumb-del'; del.innerHTML='✕';
      del.onclick=()=>wrap.remove();
      wrap.appendChild(del);
      grid.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
  showToast('✓ تم رفع الملف بنجاح');
  const saveBtn = document.getElementById('img-save-btn');
  if (saveBtn) saveBtn.style.display = 'inline-flex';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}

function _draftRoot() {
  const u = getUser();
  if (!u) return null;
  const sec = SECTION_MAP[u.role];
  if (sec) return document.getElementById(sec.tab);
  // Admin/manager: draft scoped to currently-visible section tab.
  const visibleBody = Array.from(document.querySelectorAll('.form-body'))
    .find(b => !b.classList.contains('tab-hidden') && b.offsetParent !== null);
  return visibleBody || document.getElementById('view-employee');
}

function _draftKey() {
  const u = getUser();
  if (!u) return null;
  const sec = SECTION_MAP[u.role];
  if (sec) return 'draft_' + u.role + '_' + u.id;
  // Admin/manager: per-section key based on visible tab.
  const visibleBody = Array.from(document.querySelectorAll('.form-body'))
    .find(b => !b.classList.contains('tab-hidden') && b.offsetParent !== null);
  if (!visibleBody) return null;
  return 'draft_' + u.role + '_' + u.id + '_' + visibleBody.id;
}

function _stableSelector(el, root) {
  const path = [];
  let n = el;
  while (n && n !== root && n.parentElement) {
    if (n.id) { path.unshift('#' + n.id); break; }
    let idx = 1, sib = n;
    while ((sib = sib.previousElementSibling)) {
      if (sib.tagName === n.tagName) idx++;
    }
    path.unshift(n.tagName.toLowerCase() + ':nth-of-type(' + idx + ')');
    n = n.parentElement;
  }
  return path.join('>');
}

function _snapshotForm(root) {
  const snap = { fields: [], rows: {} };
  if (!root) return snap;
  root.querySelectorAll('tbody[id]').forEach(function (tb) {
    snap.rows[tb.id] = tb.children.length;
  });
  root.querySelectorAll('input, select, textarea').forEach(function (el) {
    if (el.type === 'file' || el.type === 'button' || el.type === 'submit') return;
    const sel = _stableSelector(el, root);
    if (!sel) return;
    const val = (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : (el.value || '');
    snap.fields.push([sel, val]);
  });
  return snap;
}

function _restoreForm(root, snap) {
  if (!root || !snap) return;
  Object.entries(snap.rows || {}).forEach(function (entry) {
    const tb = document.getElementById(entry[0]);
    const targetCount = entry[1];
    if (!tb || tb.children.length === 0) return;
    while (tb.children.length < targetCount) {
      const clone = tb.children[tb.children.length - 1].cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(function (e) {
        if (e.type === 'checkbox' || e.type === 'radio') e.checked = false;
        else if (e.type !== 'file' && e.type !== 'button') e.value = '';
      });
      tb.appendChild(clone);
    }
  });
  (snap.fields || []).forEach(function (pair) {
    let el;
    try { el = root.querySelector(pair[0]); } catch (e) { return; }
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!pair[1];
    else el.value = pair[1];
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
  });
}

function _readDraftMeta() {
  const key = _draftKey();
  if (!key) return null;
  let raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { return null; }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return p && p.date ? p : null;
  } catch (e) { return null; }
}

function updateDraftBadge() {
  const badge = document.getElementById('draft-badge');
  if (!badge) return;
  const meta = _readDraftMeta();
  const today = new Date().toISOString().slice(0, 10);
  if (meta && meta.date === today) {
    const ts = meta.savedAt || '';
    badge.textContent = ts ? ('● مسودة محفوظة ' + ts) : '● مسودة محفوظة';
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function saveDraft() {
  const key = _draftKey();
  const root = _draftRoot();
  if (!key || !root) { showToast('⚠ تعذّر حفظ المسودة'); return; }
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  try {
    localStorage.setItem(key, JSON.stringify({ date: today, savedAt: hh + ':' + mm, snap: _snapshotForm(root) }));
    updateDraftBadge();
    showToast('✓ تم حفظ المسودة محلياً — ' + hh + ':' + mm);
  } catch (e) {
    showToast('⚠ تعذّر حفظ المسودة');
  }
}

function restoreDraftIfAny() {
  const key = _draftKey();
  const root = _draftRoot();
  if (!key || !root) return false;
  let raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { return false; }
  if (!raw) return false;
  let payload = null;
  try { payload = JSON.parse(raw); } catch (e) { return false; }
  const today = new Date().toISOString().slice(0, 10);
  if (!payload || payload.date !== today) {
    try { localStorage.removeItem(key); } catch (e) {}
    return false;
  }
  _restoreForm(root, payload.snap);
  return true;
}

function clearDraft() {
  const key = _draftKey();
  if (!key) return;
  try { localStorage.removeItem(key); } catch (e) {}
  updateDraftBadge();
}
function collectMahadirRows(tbodyId) {
  const rows = [];
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return rows;
  tbody.querySelectorAll('tr').forEach(tr => {
    const reportNum = tr.querySelector('input[placeholder="رقم المحضر"]');
    if (!reportNum || !reportNum.value.trim()) return;
    const selects = tr.querySelectorAll('select');
    const times = tr.querySelectorAll('input[data-time-mask="1"]');
    const notes = tr.querySelector('input[placeholder="ملاحظات..."]');
    rows.push({
      report_number: reportNum.value.trim(),
      violation_type: selects[0] ? selects[0].value : null,
      location_type: selects[1] ? selects[1].value : null,
      responsible_party: selects[2] ? selects[2].value : null,
      start_time: times[0] ? times[0].value : null,
      end_time: times[1] ? times[1].value : null,
      notes: notes ? notes.value.trim() : null
    });
  });
  return rows;
}

function collectComplaintRows(tbodyId) {
  const rows = [];
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return rows;
  tbody.querySelectorAll('tr').forEach(tr => {
    const caseNum = tr.querySelector('input[placeholder="رقم الحالة"]');
    if (!caseNum || !caseNum.value.trim()) return;
    const selects = tr.querySelectorAll('select');
    const times = tr.querySelectorAll('input[data-time-mask="1"]');
    const notes = tr.querySelector('input[placeholder="ملاحظات..."]');
    rows.push({
      case_number: caseNum.value.trim(),
      type: selects[0] ? selects[0].value : null,
      source_party: selects[1] ? selects[1].value : null,
      start_time: times[0] ? times[0].value : null,
      end_time: times[1] ? times[1].value : null,
      notes: notes ? notes.value.trim() : null
    });
  });
  return rows;
}

// For admin / manager: figure out which section's tab is currently visible
// (active form-body) and synthesize a SECTION_MAP entry for it.
function _activeSectionForAdmin() {
  const visibleBody = Array.from(document.querySelectorAll('.form-body'))
    .find(b => !b.classList.contains('tab-hidden') && b.offsetParent !== null);
  if (!visibleBody) return null;
  const tabIdToRole = {
    'ft-istedad': 'section_1', 'ft-tafweej': 'section_2', 'ft-rawda': 'section_3',
    'ft-health': 'section_4',  'ft-nusuk': 'section_5',   'ft-sokn': 'section_6',
    'ft-meeqat': 'section_7'
  };
  const role = tabIdToRole[visibleBody.id];
  if (!role) return null;
  return { role: role, section: SECTION_MAP[role] };
}

function submitData() {
  const user = getUser();
  if (!user) { window.location.href = 'login.html'; return; }

  let section = SECTION_MAP[user.role];
  let role = user.role;

  // Admin / manager use the currently-visible tab as the target section.
  if (!section) {
    const active = _activeSectionForAdmin();
    if (!active) { showToast('⚠ اختر القسم أولاً'); return; }
    section = active.section;
    role = active.role;
  }

  let payload = { employee_id: user.id };

  // Admin/manager can backdate. Only attach if (a) role allows and (b) panel value is set.
  if (user.role === 'full_access' || user.role === 'manager') {
    var bdInput = document.getElementById('backdate-input');
    if (bdInput && bdInput.value) {
      payload.shift_date = bdInput.value;
    }
  }

  if (role === 'section_1') {
    const bianatRows = [];
    document.querySelectorAll('#ist-bianat-body tr').forEach(tr => {
      const sel = tr.querySelector('select');
      const inputs = tr.querySelectorAll('input[type="number"]');
      if (!sel || !sel.value) return;
      bianatRows.push({
        nationality: sel.value,
        expected_arrivals: inputs[0] ? parseInt(inputs[0].value) || 0 : 0,
        expected_departures: inputs[1] ? parseInt(inputs[1].value) || 0 : 0
      });
    });
    payload.rows = bianatRows;
    payload.mahadir = collectMahadirRows('ist-mahadir-body');
    payload.complaints = collectComplaintRows('ist-complaints-body');
  }

  else if (role === 'section_2') {
    const pilgrims = [];
    document.querySelectorAll('#taf-arrivals-body tr').forEach(tr => {
      const sels = tr.querySelectorAll('select');
      const inputs = tr.querySelectorAll('input[type="number"]');
      if (!sels[0] || !sels[0].value) return;
      pilgrims.push({
        nationality: sels[1] ? sels[1].value : null,
        arrivals_count: inputs[0] ? parseInt(inputs[0].value) || 0 : 0,
        departures_count: inputs[1] ? parseInt(inputs[1].value) || 0 : 0
      });
    });
    const flights = [];
    document.querySelectorAll('#taf-flights-air-table tbody tr').forEach(tr => {
      const sel = tr.querySelector('select');
      const inputs = tr.querySelectorAll('input[type="number"]');
      if (!sel || !sel.value) return;
      flights.push({
        port_type: sel.value,
        arriving_flights: inputs[0] ? parseInt(inputs[0].value) || 0 : 0,
        departing_flights: inputs[1] ? parseInt(inputs[1].value) || 0 : 0
      });
    });
    const buses = [];
    document.querySelectorAll('#taf-flights-land-table tbody tr').forEach(tr => {
      const sel = tr.querySelector('select');
      const inputs = tr.querySelectorAll('input[type="number"]');
      if (!sel || !sel.value) return;
      buses.push({
        port_type: sel.value,
        arriving_buses: inputs[0] ? parseInt(inputs[0].value) || 0 : 0,
        departing_buses: inputs[1] ? parseInt(inputs[1].value) || 0 : 0
      });
    });
    payload.pilgrims = pilgrims;
    payload.flights = flights;
    payload.buses = buses;
    payload.timing = {
      avg_flight_processing_time: document.getElementById('taf-avg-flights-time') ? document.getElementById('taf-avg-flights-time').value : null,
      avg_bus_processing_time: document.getElementById('taf-avg-time') ? document.getElementById('taf-avg-time').value : null
    };
    payload.mahadir = collectMahadirRows('mahadir-body');
    payload.complaints = collectComplaintRows('complaints-body');
  }

  else if (role === 'section_3') {
    payload.total_visitors = parseInt(document.querySelector('#ft-rawda input[placeholder="0"]:nth-child(1)') ? document.querySelectorAll('#ft-rawda .form-input[type="number"]')[0].value : 0) || 0;
    payload.permits_issued = parseInt(document.querySelectorAll('#ft-rawda .form-input[type="number"]')[1] ? document.querySelectorAll('#ft-rawda .form-input[type="number"]')[1].value : 0) || 0;
    payload.avg_visit_processing_time = document.getElementById('rawda-avg-time') ? document.getElementById('rawda-avg-time').value : null;
    payload.mahadir = collectMahadirRows('rawda-mahadir-body');
    payload.complaints = collectComplaintRows('rawda-complaints-body');
  }

  else if (role === 'section_4') {
    const nums = document.querySelectorAll('#ft-health .form-input[type="number"]');
    payload.hospital_visits = parseInt(nums[0] ? nums[0].value : 0) || 0;
    payload.admitted_cases = parseInt(nums[1] ? nums[1].value : 0) || 0;
    payload.death_cases = parseInt(nums[2] ? nums[2].value : 0) || 0;
    payload.patient_cases = parseInt(nums[3] ? nums[3].value : 0) || 0;
    payload.mahadir = collectMahadirRows('health-mahadir-body');
    payload.complaints = collectComplaintRows('health-complaints-body');
  }

  else if (role === 'section_5') {
    const nums = document.querySelectorAll('#ft-nusuk .form-input[type="number"]');
    payload.archive_cards = parseInt(nums[0] ? nums[0].value : 0) || 0;
    payload.activated_cards = parseInt(nums[1] ? nums[1].value : 0) || 0;
    payload.total_arrivals = parseInt(nums[2] ? nums[2].value : 0) || 0;
    payload.unreceived_cards = parseInt(nums[3] ? nums[3].value : 0) || 0;
    payload.mahadir = collectMahadirRows('nusuk-mahadir-body');
    payload.complaints = collectComplaintRows('nusuk-complaints-body');
  }

  else if (role === 'section_6') {
    payload.bus_count = parseInt(document.getElementById('sokn-buses') ? document.getElementById('sokn-buses').value : 0) || 0;
    payload.avg_processing_time = document.getElementById('sokn-avg') ? document.getElementById('sokn-avg').value : null;
    payload.mahadir = collectMahadirRows('sokn-mahadir-body');
    payload.complaints = collectComplaintRows('sokn-complaints-body');
  }

  else if (role === 'section_7') {
    payload.bus_count = parseInt(document.getElementById('meeqat-buses') ? document.getElementById('meeqat-buses').value : 0) || 0;
    payload.avg_processing_time = document.getElementById('meeqat-avg') ? document.getElementById('meeqat-avg').value : null;
    payload.mahadir = collectMahadirRows('meeqat-mahadir-body');
    payload.complaints = collectComplaintRows('meeqat-complaints-body');
  }

  const submitBtn = document.querySelector('.js-extracted-event-136');
  let originalLabel = '';
  if (submitBtn) {
    originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ الإرسال…';
    submitBtn.style.opacity = '0.7';
    submitBtn.style.cursor = 'wait';
  }
  const draftBtn = document.querySelector('.js-save-draft-btn');
  if (draftBtn) draftBtn.disabled = true;

  function _restoreSubmitBtn() {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel || 'رفع البيانات';
      submitBtn.style.opacity = '';
      submitBtn.style.cursor = '';
    }
    if (draftBtn) draftBtn.disabled = false;
  }

  fetch(section.api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(data => {
    if (data.status === 'ok') {
      clearDraft();
      const sectionNumber = section.index + 1;
      uploadFilesAfterSubmit(section.tab, sectionNumber, data.shift_id, user.id)
        .then(uploadResults => {
          const ok = uploadResults.filter(x => x && x.status === 'ok').length;
          const total = uploadResults.length;
          if (total === 0) {
            showToast('✓ تم رفع البيانات بنجاح — جارٍ تحديث الواجهة…');
          } else if (ok === total) {
            showToast('✓ تم رفع البيانات و' + total + ' ملف(ات) بنجاح');
          } else {
            showToast('⚠ تم حفظ البيانات لكن فشل ' + (total - ok) + ' من ' + total + ' من المرفقات');
          }
          setTimeout(function () { window.location.reload(); }, 1400);
        });
    } else {
      _restoreSubmitBtn();
      showToast('⚠ خطأ: ' + (data.message || 'فشل الإرسال'));
    }
  })
  .catch(() => {
    _restoreSubmitBtn();
    showToast('⚠ تعذر الاتصال بالخادم');
  });
}

function _mirrorFilesToInput(input, fileList) {
  if (!input || !fileList || !fileList.length) return;
  try {
    const dt = new DataTransfer();
    if (input.files) {
      for (let i = 0; i < input.files.length; i++) dt.items.add(input.files[i]);
    }
    for (let i = 0; i < fileList.length; i++) dt.items.add(fileList[i]);
    input.files = dt.files;
  } catch (e) {
    if (!window.__fallbackFiles) window.__fallbackFiles = {};
    const k = input.id || ('input_' + Math.random().toString(36).slice(2));
    if (!input.id) input.id = k;
    if (!window.__fallbackFiles[k]) window.__fallbackFiles[k] = [];
    for (let i = 0; i < fileList.length; i++) window.__fallbackFiles[k].push(fileList[i]);
  }
}

document.addEventListener('drop', function (ev) {
  if (!ev.dataTransfer || !ev.dataTransfer.files || !ev.dataTransfer.files.length) return;
  let node = ev.target;
  let sectionBody = null;
  while (node && node !== document.body) {
    if (node.classList && node.classList.contains('form-body')) { sectionBody = node; break; }
    node = node.parentElement;
  }
  if (!sectionBody) return;
  const fileInput = sectionBody.querySelector('input[type="file"]');
  if (!fileInput) return;
  _mirrorFilesToInput(fileInput, ev.dataTransfer.files);
}, true);

function _collectInputFiles(input) {
  const out = [];
  if (input && input.files) {
    for (let i = 0; i < input.files.length; i++) out.push(input.files[i]);
  }
  if (window.__fallbackFiles && input && input.id && window.__fallbackFiles[input.id]) {
    window.__fallbackFiles[input.id].forEach(function (f) { out.push(f); });
  }
  return out;
}

function uploadFilesAfterSubmit(sectionTabId, sectionNumber, shiftId, employeeId) {
  const tab = document.getElementById(sectionTabId);
  if (!tab) return Promise.resolve([]);
  const fileInputs = tab.querySelectorAll('input[type="file"]');
  const tasks = [];
  fileInputs.forEach(function (input) {
    const files = _collectInputFiles(input);
    if (files.length === 0) return;
    files.forEach(function (file) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('shift_id', String(shiftId));
      fd.append('section_number', String(sectionNumber));
      fd.append('record_type', 'section');
      if (employeeId !== undefined && employeeId !== null) {
        fd.append('uploaded_by', String(employeeId));
      }
      tasks.push(
        fetch('/api/upload', { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .catch(function (e) { return { status: 'error', message: String(e) }; })
      );
    });
  });
  return Promise.all(tasks);
}
function validateRowFields(tbody) {
  const rows = tbody.querySelectorAll('tr');
  for (let row of rows) {
    const inputs = row.querySelectorAll('input, select');
    for (let input of inputs) {
      if (input.type === 'button') continue;
      if (!input.value || input.value.trim() === '') {
        input.style.borderColor = 'var(--red)';
        showToast('⚠ يرجى تعبئة جميع الحقول قبل الإضافة');
        return false;
      } else {
        input.style.borderColor = '';
      }
    }
  }
  return true;
}
function addIstMahadirRow() {
  const tbody = document.getElementById('ist-mahadir-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-7 js-extracted-event-145" type="number" min="1" placeholder="رقم المحضر" inputmode="numeric"></td>'
    +'<td><select class="form-input extracted-style-8"><option value="" disabled selected>— المخالفة —</option><option>عدم مطابقة عدد الحجاج مع العقد</option><option>عدم وجود مسؤول الحجاج في موقع المغادرة</option><option>مغادرة الحجاج دون الرجوع إلى مكتب الخدمة</option><option>رفض الحجاج للحافلات في موقع المغادرة</option><option>تأخر شركة التحميل والتنزيل</option><option>الخروج المبكر للحجاج قبل موعد المغادرة</option><option>تأخر وصول الحافلات في موقع المغادرة</option><option>رفض مسؤول الحجاج تأمين شاحنة لنقل الأمتعة الزائدة</option><option>وصول الحجاج قبل موعد بداية عقد السكن</option><option>عدم توزيع الحجاج بالشكل المناسب على الحافلات</option><option>عدم جاهزية الحجاج عند الوصول إلى موقع المغادرة</option><option>رفض تسليم الجوازات من قبل الحجاج</option><option>عدم جاهزية الحجاج للمغادرة</option><option>رفض الحجاج للسكن</option><option>وصول الحجاج بعد موعد بداية عقد السكن</option><option>تأخر مسؤول الحجاج في إنهاء إجراءات المغادرة</option><option>عدم جاهزية السكن عند وصول الحجاج</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-8"><option value="" disabled selected>— الموقع —</option><option>مكتب شؤون الحجاج</option><option>المطار</option><option>الهجرة</option><option>الميدان</option><option>القطار</option><option>الميقات</option><option>المنظم</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-8"><option value="" disabled selected>— الجهة —</option><option>إرشاد الحافلات</option><option>متعهد نقل امتعة</option><option>متعهد الإعاشة</option><option>التحميل والتنزيل</option><option>شركة النقل</option><option>إرشاد التائهين</option><option>الوحدة السكنية</option></select></td>'
    +'<td><input class="form-input extracted-style-7 js-extracted-event-146" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-7 js-extracted-event-147" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-148">✕</button></td>';
  tbody.appendChild(tr);
}


function addHealthMahadirRow() {
  const tbody = document.getElementById('health-mahadir-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-26 js-extracted-event-149" type="number" min="1" placeholder="رقم المحضر" inputmode="numeric"></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— المخالفة —</option><option>عدم مطابقة عدد الحجاج مع العقد</option><option>عدم وجود مسؤول الحجاج في موقع المغادرة</option><option>مغادرة الحجاج دون الرجوع إلى مكتب الخدمة</option><option>رفض الحجاج للحافلات في موقع المغادرة</option><option>تأخر شركة التحميل والتنزيل</option><option>الخروج المبكر للحجاج قبل موعد المغادرة</option><option>تأخر وصول الحافلات في موقع المغادرة</option><option>رفض مسؤول الحجاج تأمين شاحنة لنقل الأمتعة الزائدة</option><option>وصول الحجاج قبل موعد بداية عقد السكن</option><option>عدم توزيع الحجاج بالشكل المناسب على الحافلات</option><option>عدم جاهزية الحجاج عند الوصول إلى موقع المغادرة</option><option>رفض تسليم الجوازات من قبل الحجاج</option><option>عدم جاهزية الحجاج للمغادرة</option><option>رفض الحجاج للسكن</option><option>وصول الحجاج بعد موعد بداية عقد السكن</option><option>تأخر مسؤول الحجاج في إنهاء إجراءات المغادرة</option><option>عدم جاهزية السكن عند وصول الحجاج</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الموقع —</option><option>المطار</option><option>القطار</option><option>محطة الهجرة</option><option>المنافذ البرية</option><option>الميدان</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الجهة —</option><option>إرشاد الحافلات</option><option>متعهد نقل امتعة</option><option>متعهد الإعاشة</option><option>التحميل والتنزيل</option><option>شركة النقل</option><option>إرشاد التائهين</option><option>الوحدة السكنية</option></select></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-150" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-151" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-152">✕</button></td>';
  tbody.appendChild(tr);
}

function addHealthComplaintRow() {
  const tbody = document.getElementById('health-complaints-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-7 js-extracted-event-153" type="number" min="1" placeholder="رقم الحالة" inputmode="numeric"></td>'
    +'<td><select class="form-select extracted-style-19"><option>شكوى</option><option>بلاغ</option></select></td>'
    +'<td><select class="form-select extracted-style-19"><option value="" disabled selected>— اختر الجهة —</option><option>وزارة الحج والعمرة</option><option>العمليات الميدانية</option><option>مركز الاتصال الموحد</option><option>الجهة المقدمة للخدمة</option></select></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-154" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-155" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-156">✕</button></td>';
  tbody.appendChild(tr);
}

function addNusukMahadirRow() {
  const tbody = document.getElementById('nusuk-mahadir-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-26 js-extracted-event-157" type="number" min="1" placeholder="رقم المحضر" inputmode="numeric"></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— المخالفة —</option><option>عدم مطابقة عدد الحجاج مع العقد</option><option>عدم وجود مسؤول الحجاج في موقع المغادرة</option><option>مغادرة الحجاج دون الرجوع إلى مكتب الخدمة</option><option>رفض الحجاج للحافلات في موقع المغادرة</option><option>تأخر شركة التحميل والتنزيل</option><option>الخروج المبكر للحجاج قبل موعد المغادرة</option><option>تأخر وصول الحافلات في موقع المغادرة</option><option>رفض مسؤول الحجاج تأمين شاحنة لنقل الأمتعة الزائدة</option><option>وصول الحجاج قبل موعد بداية عقد السكن</option><option>عدم توزيع الحجاج بالشكل المناسب على الحافلات</option><option>عدم جاهزية الحجاج عند الوصول إلى موقع المغادرة</option><option>رفض تسليم الجوازات من قبل الحجاج</option><option>عدم جاهزية الحجاج للمغادرة</option><option>رفض الحجاج للسكن</option><option>وصول الحجاج بعد موعد بداية عقد السكن</option><option>تأخر مسؤول الحجاج في إنهاء إجراءات المغادرة</option><option>عدم جاهزية السكن عند وصول الحجاج</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الموقع —</option><option>المطار</option><option>القطار</option><option>محطة الهجرة</option><option>المنافذ البرية</option><option>الميدان</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الجهة —</option><option>إرشاد الحافلات</option><option>متعهد نقل امتعة</option><option>متعهد الإعاشة</option><option>التحميل والتنزيل</option><option>شركة النقل</option><option>إرشاد التائهين</option><option>الوحدة السكنية</option></select></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-158" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-159" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-160">✕</button></td>';
  tbody.appendChild(tr);
}

function addNusukComplaintRow() {
  const tbody = document.getElementById('nusuk-complaints-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-7 js-extracted-event-161" type="number" min="1" placeholder="رقم الحالة" inputmode="numeric"></td>'
    +'<td><select class="form-select extracted-style-19"><option>شكوى</option><option>بلاغ</option></select></td>'
    +'<td><select class="form-select extracted-style-19"><option value="" disabled selected>— اختر الجهة —</option><option>وزارة الحج والعمرة</option><option>العمليات الميدانية</option><option>مركز الاتصال الموحد</option><option>الجهة المقدمة للخدمة</option></select></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-162" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-163" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-164">✕</button></td>';
  tbody.appendChild(tr);
}

function addRawdaMahadirRow() {
  const tbody = document.getElementById('rawda-mahadir-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-26 js-extracted-event-165" type="number" min="1" placeholder="رقم المحضر" inputmode="numeric"></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— المخالفة —</option><option>عدم مطابقة عدد الحجاج مع العقد</option><option>عدم وجود مسؤول الحجاج في موقع المغادرة</option><option>مغادرة الحجاج دون الرجوع إلى مكتب الخدمة</option><option>رفض الحجاج للحافلات في موقع المغادرة</option><option>تأخر شركة التحميل والتنزيل</option><option>الخروج المبكر للحجاج قبل موعد المغادرة</option><option>تأخر وصول الحافلات في موقع المغادرة</option><option>رفض مسؤول الحجاج تأمين شاحنة لنقل الأمتعة الزائدة</option><option>وصول الحجاج قبل موعد بداية عقد السكن</option><option>عدم توزيع الحجاج بالشكل المناسب على الحافلات</option><option>عدم جاهزية الحجاج عند الوصول إلى موقع المغادرة</option><option>رفض تسليم الجوازات من قبل الحجاج</option><option>عدم جاهزية الحجاج للمغادرة</option><option>رفض الحجاج للسكن</option><option>وصول الحجاج بعد موعد بداية عقد السكن</option><option>تأخر مسؤول الحجاج في إنهاء إجراءات المغادرة</option><option>عدم جاهزية السكن عند وصول الحجاج</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الموقع —</option><option>المطار</option><option>القطار</option><option>محطة الهجرة</option><option>المنافذ البرية</option><option>الميدان</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الجهة —</option><option>إرشاد الحافلات</option><option>متعهد نقل امتعة</option><option>متعهد الإعاشة</option><option>التحميل والتنزيل</option><option>شركة النقل</option><option>إرشاد التائهين</option><option>الوحدة السكنية</option></select></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-166" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-167" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-168">✕</button></td>';
  tbody.appendChild(tr);
}
function addRawdaComplaintRow() {
  const tbody = document.getElementById('rawda-complaints-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-7 js-extracted-event-169" type="number" min="1" placeholder="رقم الحالة" inputmode="numeric"></td>'
    +'<td><select class="form-select extracted-style-19"><option>شكوى</option><option>بلاغ</option></select></td>'
    +'<td><select class="form-select extracted-style-19"><option value="" disabled selected>— اختر الجهة —</option><option>وزارة الحج والعمرة</option><option>العمليات الميدانية</option><option>مركز الاتصال الموحد</option><option>الجهة المقدمة للخدمة</option></select></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-170" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-171" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-172">✕</button></td>';
  tbody.appendChild(tr);
}

function addIstComplaintRow() {
  const tbody = document.getElementById('ist-complaints-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-7 js-extracted-event-173" type="number" min="1" placeholder="رقم الحالة" inputmode="numeric"></td>'
    +'<td><select class="form-select extracted-style-19"><option>شكوى</option><option>بلاغ</option></select></td>'
    +'<td><select class="form-select extracted-style-19"><option value="" disabled selected>— اختر الجهة —</option><option>وزارة الحج والعمرة</option><option>العمليات الميدانية</option><option>مركز الاتصال الموحد</option><option>الجهة المقدمة للخدمة</option></select></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-174" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-175" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-176">✕</button></td>';
  tbody.appendChild(tr);
}

// ── السكن JS ──
function addSoknMahadirRow() {
  const tbody = document.getElementById('sokn-mahadir-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-26 js-extracted-event-177" type="number" min="1" placeholder="رقم المحضر" inputmode="numeric"></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— المخالفة —</option><option>عدم مطابقة عدد الحجاج مع العقد</option><option>عدم وجود مسؤول الحجاج في موقع المغادرة</option><option>مغادرة الحجاج دون الرجوع إلى مكتب الخدمة</option><option>رفض الحجاج للحافلات في موقع المغادرة</option><option>تأخر شركة التحميل والتنزيل</option><option>الخروج المبكر للحجاج قبل موعد المغادرة</option><option>تأخر وصول الحافلات في موقع المغادرة</option><option>رفض مسؤول الحجاج تأمين شاحنة لنقل الأمتعة الزائدة</option><option>وصول الحجاج قبل موعد بداية عقد السكن</option><option>عدم توزيع الحجاج بالشكل المناسب على الحافلات</option><option>عدم جاهزية الحجاج عند الوصول إلى موقع المغادرة</option><option>رفض تسليم الجوازات من قبل الحجاج</option><option>عدم جاهزية الحجاج للمغادرة</option><option>رفض الحجاج للسكن</option><option>وصول الحجاج بعد موعد بداية عقد السكن</option><option>تأخر مسؤول الحجاج في إنهاء إجراءات المغادرة</option><option>عدم جاهزية السكن عند وصول الحجاج</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الموقع —</option><option>مكتب شؤون الحجاج</option><option>المطار</option><option>الهجرة</option><option>الميدان</option><option>القطار</option><option>الميقات</option><option>المنظم</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الجهة —</option><option>إرشاد الحافلات</option><option>متعهد نقل امتعة</option><option>متعهد الإعاشة</option><option>التحميل والتنزيل</option><option>شركة النقل</option><option>إرشاد التائهين</option><option>الوحدة السكنية</option></select></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-178" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-179" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-180">✕</button></td>';
  tbody.appendChild(tr);
}

function addSoknComplaintRow() {
  const tbody = document.getElementById('sokn-complaints-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-7 js-extracted-event-181" type="number" min="1" placeholder="رقم الحالة" inputmode="numeric"></td>'
    +'<td><select class="form-select extracted-style-19"><option>شكوى</option><option>بلاغ</option></select></td>'
    +'<td><select class="form-select extracted-style-19"><option value="" disabled selected>— اختر الجهة —</option><option>وزارة الحج والعمرة</option><option>العمليات الميدانية</option><option>مركز الاتصال الموحد</option><option>الجهة المقدمة للخدمة</option></select></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-182" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-183" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-184">✕</button></td>';
  tbody.appendChild(tr);
}

function soknHandleDrop(e) {
  e.preventDefault();
  document.getElementById('sokn-img-drop-zone').style.borderColor = '';
  document.getElementById('sokn-img-drop-zone').style.background = '';
  soknShowPreviews(e.dataTransfer.files);
}

function soknShowPreviews(files) {
  if (!files || !files.length) return;
  const grid = document.getElementById('sokn-preview-grid');
  const area = document.getElementById('sokn-preview-area');
  area.style.display = 'block';
  Array.from(files).forEach(function(file) {
    const isImage = file.type.startsWith('image/') || file.name.match(/\.(heic|heif|raw|tif|tiff)$/i);
    const reader = new FileReader();
    reader.onload = function(ev) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--green-brand);';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      const del = document.createElement('button');
      del.innerHTML = '✕';
      del.style.cssText = 'position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      del.onclick = function() { wrap.remove(); if (!grid.children.length) area.style.display = 'none'; };
      const name = document.createElement('div');
      name.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:white;font-size:9px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      name.textContent = file.name;
      wrap.appendChild(img); wrap.appendChild(del); wrap.appendChild(name);
      grid.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

// ── الميقات JS ──
function addMeeqatMahadirRow() {
  const tbody = document.getElementById('meeqat-mahadir-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-26 js-extracted-event-185" type="number" min="1" placeholder="رقم المحضر" inputmode="numeric"></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— المخالفة —</option><option>عدم مطابقة عدد الحجاج مع العقد</option><option>عدم وجود مسؤول الحجاج في موقع المغادرة</option><option>مغادرة الحجاج دون الرجوع إلى مكتب الخدمة</option><option>رفض الحجاج للحافلات في موقع المغادرة</option><option>تأخر شركة التحميل والتنزيل</option><option>الخروج المبكر للحجاج قبل موعد المغادرة</option><option>تأخر وصول الحافلات في موقع المغادرة</option><option>رفض مسؤول الحجاج تأمين شاحنة لنقل الأمتعة الزائدة</option><option>وصول الحجاج قبل موعد بداية عقد السكن</option><option>عدم توزيع الحجاج بالشكل المناسب على الحافلات</option><option>عدم جاهزية الحجاج عند الوصول إلى موقع المغادرة</option><option>رفض تسليم الجوازات من قبل الحجاج</option><option>عدم جاهزية الحجاج للمغادرة</option><option>رفض الحجاج للسكن</option><option>وصول الحجاج بعد موعد بداية عقد السكن</option><option>تأخر مسؤول الحجاج في إنهاء إجراءات المغادرة</option><option>عدم جاهزية السكن عند وصول الحجاج</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الموقع —</option><option>مكتب شؤون الحجاج</option><option>المطار</option><option>الهجرة</option><option>الميدان</option><option>القطار</option><option>الميقات</option><option>المنظم</option><option>أخرى</option></select></td>'
    +'<td><select class="form-input extracted-style-27"><option value="" disabled selected>— الجهة —</option><option>إرشاد الحافلات</option><option>متعهد نقل امتعة</option><option>متعهد الإعاشة</option><option>التحميل والتنزيل</option><option>شركة النقل</option><option>إرشاد التائهين</option><option>الوحدة السكنية</option></select></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-186" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-26 js-extracted-event-187" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-188">✕</button></td>';
  tbody.appendChild(tr);
}

function addMeeqatComplaintRow() {
  const tbody = document.getElementById('meeqat-complaints-body');
  if (!validateRowFields(tbody)) return;
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="form-input extracted-style-7 js-extracted-event-189" type="number" min="1" placeholder="رقم الحالة" inputmode="numeric"></td>'
    +'<td><select class="form-select extracted-style-19"><option>شكوى</option><option>بلاغ</option></select></td>'
    +'<td><select class="form-select extracted-style-19"><option value="" disabled selected>— اختر الجهة —</option><option>وزارة الحج والعمرة</option><option>العمليات الميدانية</option><option>مركز الاتصال الموحد</option><option>الجهة المقدمة للخدمة</option></select></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-190" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><input class="form-input extracted-style-20 js-extracted-event-191" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" data-time-mask="1"></td>'
    +'<td><div class="row-diff">—</div></td>'+'<td><input class="form-input" type="text" placeholder="ملاحظات..." style="min-width:120px;font-size:12px;padding:6px 8px;"></td>'
    +'<td><button type="button" class="icon-btn js-extracted-event-192">✕</button></td>';
  tbody.appendChild(tr);
}

function meeqatHandleDrop(e) {
  e.preventDefault();
  document.getElementById('meeqat-img-drop-zone').style.borderColor = '';
  document.getElementById('meeqat-img-drop-zone').style.background = '';
  meeqatShowPreviews(e.dataTransfer.files);
}

function meeqatShowPreviews(files) {
  if (!files || !files.length) return;
  const grid = document.getElementById('meeqat-preview-grid');
  const area = document.getElementById('meeqat-preview-area');
  area.style.display = 'block';
  Array.from(files).forEach(function(file) {
    const isImage = file.type.startsWith('image/') || file.name.match(/\.(heic|heif|raw|tif|tiff)$/i);
    const reader = new FileReader();
    reader.onload = function(ev) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--green-brand);';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      const del = document.createElement('button');
      del.innerHTML = '✕';
      del.style.cssText = 'position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      del.onclick = function() { wrap.remove(); if (!grid.children.length) area.style.display = 'none'; };
      const name = document.createElement('div');
      name.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:white;font-size:9px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      name.textContent = file.name;
      wrap.appendChild(img); wrap.appendChild(del); wrap.appendChild(name);
      grid.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

// ── تافويج Tables — Auto Totals ──
function tafValidateAndCalc(input) {
  var val = parseInt(input.value);
  if (isNaN(val) || val < 0) input.value = 0;
  else input.value = val;
  tafCalcArrivalsTotal();
}

function tafCalcArrivalsTotal() {
  var rows = document.querySelectorAll('#taf-arrivals-body tr');
  var arrTotal = 0, depTotal = 0;
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input[type="number"]');
    if (inputs[0]) arrTotal += parseInt(inputs[0].value) || 0;
    if (inputs[1]) depTotal += parseInt(inputs[1].value) || 0;
  });
  document.getElementById('taf-arrivals-total').textContent = arrTotal;
  var depEl = document.getElementById('taf-departures-total');
  if (depEl) depEl.textContent = depTotal;
  var countEl = document.getElementById('taf-rows-count');
  if (countEl) countEl.textContent = rows.length;
}

function tafAddRow() {
  var tbody = document.getElementById('taf-arrivals-body');
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td><select class="form-select extracted-style-3 js-extracted-event-193">'
    + '<option value="" disabled selected>— المنفذ —</option>'
    + '<option>القطار</option><option>المطار</option>'
    + '<option>محطة الهجرة</option><option>المنافذ البرية</option>'
    + '</select></td>'
    + '<td><select class="form-select extracted-style-3 js-extracted-event-194">'
    + '<option value="" disabled selected>— الجنسية —</option>'
    + '<option>باكستان</option><option>فلسطين</option><option>المغرب</option>'
    + '<option>ألبانيا</option><option>تشاد</option><option>قرغيزستان</option>'
    + '<option>السودان</option><option>سريلانكا</option>'
    + '</select></td>'
    + '<td><input class="form-input extracted-style-3 js-extracted-event-195" type="number" min="0" value="0"></td>'
    + '<td><input class="form-input extracted-style-3 js-extracted-event-196" type="number" min="0" value="0"></td>'
    + '<td><button type="button" class="icon-btn js-extracted-event-197" title="حذف">✕</button></td>';
  tbody.appendChild(tr);
  tafCalcArrivalsTotal();
}

function tafRemoveRow(btn) {
  var tbody = document.getElementById('taf-arrivals-body');
  if (tbody.rows.length <= 1) return;
  btn.closest('tr').remove();
  tafCalcArrivalsTotal();
}

function tafCalcFlightsAir() {
  var rows = document.querySelectorAll('#taf-flights-air-table tbody tr');
  var arrTotal = 0, depTotal = 0;
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input[type="number"]');
    if (inputs[0]) arrTotal += parseInt(inputs[0].value) || 0;
    if (inputs[1]) depTotal += parseInt(inputs[1].value) || 0;
  });
  document.getElementById('taf-air-arrive-total').textContent = arrTotal;
  document.getElementById('taf-air-depart-total').textContent = depTotal;
}

function tafCalcFlightsLand() {
  var rows = document.querySelectorAll('#taf-flights-land-table tbody tr');
  var arrTotal = 0, depTotal = 0;
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input[type="number"]');
    if (inputs[0]) arrTotal += parseInt(inputs[0].value) || 0;
    if (inputs[1]) depTotal += parseInt(inputs[1].value) || 0;
  });
  document.getElementById('taf-land-arrive-total').textContent = arrTotal;
  document.getElementById('taf-land-depart-total').textContent = depTotal;
}

function istOnNationalityChange() {
  var val = document.getElementById('ist-nationality').value;
  document.getElementById('ist-step2').style.display = val ? 'block' : 'none';
}

function tafOnPortChange() {
  var port = document.getElementById('taf-port').value;
  document.getElementById('taf-step2').style.display = port ? 'block' : 'none';
  document.getElementById('taf-step3').style.display = 'none';
  if (!port) {
    document.getElementById('taf-arrivals').value = 0;
  }
}

function tafOnArrivalsChange() {
  document.getElementById('taf-step3').style.display = 'block';
}

function istBianatValidate(input) {
  var val = parseInt(input.value);
  if (isNaN(val) || val < 0) input.value = 0;
  else input.value = val;
  istBianatCalc();
}

function istBianatCalc() {
  var rows = document.querySelectorAll('#ist-bianat-body tr');
  var arrTotal = 0, depTotal = 0;
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input[type="number"]');
    arrTotal += parseInt(inputs[0] ? inputs[0].value : 0) || 0;
    depTotal += parseInt(inputs[1] ? inputs[1].value : 0) || 0;
  });
  document.getElementById('ist-bianat-arrive-total').textContent = arrTotal;
  document.getElementById('ist-bianat-depart-total').textContent = depTotal;
}

function istBianatAddRow() {
  var tbody = document.getElementById('ist-bianat-body');
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td><select class="form-select extracted-style-3 js-extracted-event-198">'
    + '<option value="" disabled selected>— الجنسية —</option>'
    + '<option>باكستان</option><option>فلسطين</option><option>المغرب</option>'
    + '<option>ألبانيا</option><option>تشاد</option><option>قرغيزستان</option>'
    + '<option>السودان</option><option>سريلانكا</option>'
    + '</select></td>'
    + '<td><input class="form-input extracted-style-3 js-extracted-event-199" type="number" min="0" value="0"></td>'
    + '<td><input class="form-input extracted-style-3 js-extracted-event-200" type="number" min="0" value="0"></td>'
    + '<td><button type="button" class="icon-btn js-extracted-event-201" title="حذف">✕</button></td>';
  tbody.appendChild(tr);
  istBianatCalc();
}

function istBianatRemoveRow(btn) {
  var tbody = document.getElementById('ist-bianat-body');
  if (tbody.rows.length <= 1) return;
  btn.closest('tr').remove();
  istBianatCalc();
}

// ── رقم المحضر — Duplicate Check ──
var MAHADIR_BODIES = [
  'ist-mahadir-body','mahadir-body','rawda-mahadir-body',
  'health-mahadir-body','nusuk-mahadir-body','sokn-mahadir-body','meeqat-mahadir-body'
];

function checkDuplicateMahadirNum(input) {
  var raw = input.value;
  var cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned !== raw) { input.value = cleaned; raw = cleaned; }
  var val = raw.trim();
  var existingErr = input.parentNode.querySelector('.mahadir-dup-err');
  if (existingErr) existingErr.remove();
  input.style.borderColor = '';
  if (!val) return;
  if (!/^\d+$/.test(val)) {
    input.style.borderColor = 'var(--red, #e53e3e)';
    var intErr = document.createElement('div');
    intErr.className = 'mahadir-dup-err';
    intErr.style.cssText = 'color:#e53e3e;font-size:11px;font-weight:600;margin-top:4px;';
    intErr.textContent = 'رقم المحضر يجب أن يحتوي على أرقام فقط';
    input.parentNode.appendChild(intErr);
    return;
  }
  var allNums = [];
  MAHADIR_BODIES.forEach(function(bodyId) {
    var tbody = document.getElementById(bodyId);
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function(row) {
      var inp = row.querySelector('input[placeholder="رقم المحضر"]');
      if (inp && inp !== input && inp.value.trim()) allNums.push(inp.value.trim());
    });
  });
  if (allNums.indexOf(val) !== -1) {
    input.style.borderColor = 'var(--red, #e53e3e)';
    var dupErr = document.createElement('div');
    dupErr.className = 'mahadir-dup-err';
    dupErr.style.cssText = 'color:#e53e3e;font-size:11px;font-weight:600;margin-top:4px;';
    dupErr.textContent = 'رقم المحضر هذا مستخدم من قبل';
    input.parentNode.appendChild(dupErr);
  }
}

function checkDuplicateCaseNum(input) {
  var raw = input.value;
  var cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned !== raw) { input.value = cleaned; raw = cleaned; }
  var val = raw.trim();
  var existingErr = input.parentNode.querySelector('.case-dup-err');
  if (existingErr) existingErr.remove();
  input.style.borderColor = '';
  if (!val) return;
  if (!/^\d+$/.test(val)) {
    input.style.borderColor = 'var(--red, #e53e3e)';
    var intErr = document.createElement('div');
    intErr.className = 'case-dup-err';
    intErr.style.cssText = 'color:#e53e3e;font-size:11px;font-weight:600;margin-top:4px;';
    intErr.textContent = 'رقم الحالة يجب أن يحتوي على أرقام فقط';
    input.parentNode.appendChild(intErr);
    return;
  }
  var COMPLAINT_BODIES = ['ist-complaints-body','taf-complaints-body','rawda-complaints-body',
    'health-complaints-body','nusuk-complaints-body','sokn-complaints-body','meeqat-complaints-body'];
  var allNums = [];
  COMPLAINT_BODIES.forEach(function(bodyId) {
    var tbody = document.getElementById(bodyId);
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function(row) {
      var inp = row.querySelector('input[placeholder="رقم الحالة"]');
      if (inp && inp !== input && inp.value.trim()) allNums.push(inp.value.trim());
    });
  });
  if (allNums.indexOf(val) !== -1) {
    input.style.borderColor = 'var(--red, #e53e3e)';
    var dupErr = document.createElement('div');
    dupErr.className = 'case-dup-err';
    dupErr.style.cssText = 'color:#e53e3e;font-size:11px;font-weight:600;margin-top:4px;';
    dupErr.textContent = 'رقم الحالة هذا مستخدم من قبل';
    input.parentNode.appendChild(dupErr);
  }
}

function validateMahadirBeforeSubmit() {
  var allInputs = document.querySelectorAll('input[placeholder="رقم المحضر"]');
  var hasError = false;
  allInputs.forEach(function(input) {
    var val = input.value.trim();
    if (!val) return;
    if (!/^\d+$/.test(val)) { hasError = true; checkDuplicateMahadirNum(input); }
    if (input.parentNode.querySelector('.mahadir-dup-err')) hasError = true;
  });
  return !hasError;
}

function saveFlightsAir() {
  var rows = document.querySelectorAll('#taf-flights-air-table tbody tr');
  var hasData = false;
  rows.forEach(function(row) {
    var sel = row.querySelector('select');
    var inputs = row.querySelectorAll('input[type="number"]');
    if (sel && sel.value) hasData = true;
    if (inputs[0] && parseInt(inputs[0].value) > 0) hasData = true;
    if (inputs[1] && parseInt(inputs[1].value) > 0) hasData = true;
  });
  if (!hasData) { showToast('⚠ يرجى إدخال بيانات قبل الحفظ'); return; }
  tafCalcFlightsAir();
  showToast('✓ تم حفظ بيانات الرحلات — القطار والمطار');
}

function saveFlightsLand() {
  var rows = document.querySelectorAll('#taf-flights-land-table tbody tr');
  var hasData = false;
  rows.forEach(function(row) {
    var sel = row.querySelector('select');
    var inputs = row.querySelectorAll('input[type="number"]');
    if (sel && sel.value) hasData = true;
    if (inputs[0] && parseInt(inputs[0].value) > 0) hasData = true;
    if (inputs[1] && parseInt(inputs[1].value) > 0) hasData = true;
  });
  if (!hasData) { showToast('⚠ يرجى إدخال بيانات قبل الحفظ'); return; }
  tafCalcFlightsLand();
  showToast('✓ تم حفظ بيانات الحافلات — محطة الهجرة والمنافذ البرية');
}

function tafAddFlightsAirRow() {
  var tbody = document.querySelector('#taf-flights-air-table tbody');
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td><select class="form-input extracted-style-8 js-extracted-event-202">'
    + '<option value="" disabled selected>— المنفذ —</option>'
    + '<option>القطار</option><option>المطار</option>'
    + '</select></td>'
    + '<td><input class="form-input extracted-style-3 js-extracted-event-203" type="number" min="0" value="0"></td>'
    + '<td><input class="form-input extracted-style-3 js-extracted-event-204" type="number" min="0" value="0"></td>'
    + '<td><button type="button" class="icon-btn js-extracted-event-205" title="حذف">✕</button></td>';
  tbody.appendChild(tr);
}

function tafRemoveFlightsAirRow(btn) {
  var tbody = document.querySelector('#taf-flights-air-table tbody');
  if (tbody.rows.length <= 1) return;
  btn.closest('tr').remove();
  tafCalcFlightsAir();
}

function tafAddFlightsLandRow() {
  var tbody = document.querySelector('#taf-flights-land-table tbody');
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td><select class="form-input extracted-style-8 js-extracted-event-206">'
    + '<option value="" disabled selected>— المنفذ —</option>'
    + '<option>محطة الهجرة</option><option>المنافذ البرية</option>'
    + '</select></td>'
    + '<td><input class="form-input extracted-style-3 js-extracted-event-207" type="number" min="0" value="0"></td>'
    + '<td><input class="form-input extracted-style-3 js-extracted-event-208" type="number" min="0" value="0"></td>'
    + '<td><button type="button" class="icon-btn js-extracted-event-209" title="حذف">✕</button></td>';
  tbody.appendChild(tr);
}

function tafRemoveFlightsLandRow(btn) {
  var tbody = document.querySelector('#taf-flights-land-table tbody');
  if (tbody.rows.length <= 1) return;
  btn.closest('tr').remove();
  tafCalcFlightsLand();
}

// ══════════════════════════════════════════════════════════════
// MOBILE SAFARI INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {

  window.onerror = function (msg, src, line, col, err) {
    console.error('[JS ERROR]', msg, 'at line', line, err ? err.stack : '');
    return false;
  };
  window.addEventListener('unhandledrejection', function (e) {
    console.error('[Promise ERROR]', e.reason);
  });

  var publicFns = [
    'switchFormTab', 'switchView', 'calcTimeDiff', 'calcRowDiff', 'calcDiff',
    'removeRow', 'updateMahadirCount',
    'addMahadirRow', 'addComplaintRow',
    'addIstMahadirRow', 'addIstComplaintRow', 'istOnNationalityChange',
    'addHealthMahadirRow', 'addHealthComplaintRow',
    'addNusukMahadirRow', 'addNusukComplaintRow',
    'addRawdaMahadirRow', 'addRawdaComplaintRow',
    'addSoknMahadirRow', 'addSoknComplaintRow',
    'addMeeqatMahadirRow', 'addMeeqatComplaintRow',
    'tafAddRow', 'tafRemoveRow', 'tafValidateAndCalc', 'tafCalcArrivalsTotal',
    'tafAddFlightsAirRow', 'tafRemoveFlightsAirRow', 'tafCalcFlightsAir',
    'tafAddFlightsLandRow', 'tafRemoveFlightsLandRow', 'tafCalcFlightsLand',
    'tafOnPortChange', 'tafOnArrivalsChange',
    'istBianatAddRow', 'istBianatRemoveRow', 'istBianatCalc', 'istBianatValidate',
    'checkDuplicateMahadirNum', 'validateMahadirBeforeSubmit',
    'handleImgDrop', 'handleImgSelect', 'handleDrop', 'showImgs',
    'rawdaHandleDrop', 'rawdaShowPreviews',
    'healthHandleDrop', 'healthShowPreviews',
    'nusukHandleDrop', 'nusukShowPreviews',
    'soknHandleDrop', 'soknShowPreviews',
    'meeqatHandleDrop', 'meeqatShowPreviews',
    'saveDraft', 'submitData', 'showToast',
    'updateClock', 'updateShift', 'getShift'
  ];
  publicFns.forEach(function (name) {
    if (typeof window[name] === 'undefined') {
      try { window[name] = eval(name); } catch (e) { /* not defined */ }
    }
  });

  var s = document.createElement('style');
  s.textContent = [
    'button, a, select, input, label { touch-action: manipulation; }',
    'button { -webkit-tap-highlight-color: transparent; }'
  ].join('\n');
  document.head.appendChild(s);

  console.log('[Init] Employee page ready ✓');
});

// Extracted inline event handlers
document.addEventListener('DOMContentLoaded', function () {
  document.addEventListener('click', function (event) {
    { const target = event.target.closest('.js-extracted-event-1'); if (target) { (function (event) { switchFormTab(this,'ft-istedad'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-2'); if (target) { (function (event) { switchFormTab(this,'ft-tafweej'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-3'); if (target) { (function (event) { switchFormTab(this,'ft-rawda'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-4'); if (target) { (function (event) { switchFormTab(this,'ft-health'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-5'); if (target) { (function (event) { switchFormTab(this,'ft-nusuk'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-6'); if (target) { (function (event) { switchFormTab(this,'ft-sokn'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-7'); if (target) { (function (event) { switchFormTab(this,'ft-meeqat'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-11'); if (target) { (function (event) { istBianatRemoveRow(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-12'); if (target) { (function (event) { istBianatAddRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-17'); if (target) { (function (event) { removeRow(this,'ist-mahadir-body','ist-s-mahadir','ist-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-18'); if (target) { (function (event) { addIstMahadirRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-19'); if (target) { (function (event) { document.getElementById('img-file-input').click(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-27'); if (target) { (function (event) { removeRow(this,'ist-complaints-body','ist-s-complaints','ist-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-28'); if (target) { (function (event) { addIstComplaintRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-33'); if (target) { (function (event) { tafRemoveRow(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-34'); if (target) { (function (event) { tafAddRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-38'); if (target) { (function (event) { saveFlightsAir(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-42'); if (target) { (function (event) { saveFlightsLand(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-49'); if (target) { (function (event) { removeRow(this,'mahadir-body','s-mahadir','mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-50'); if (target) { (function (event) { addMahadirRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-51'); if (target) { (function (event) { document.getElementById('img-input').click(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-59'); if (target) { (function (event) { removeRow(this,'complaints-body','s-complaints','complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-60'); if (target) { (function (event) { addComplaintRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-64'); if (target) { (function (event) { removeRow(this,'rawda-mahadir-body','rawda-s-mahadir','rawda-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-65'); if (target) { (function (event) { addRawdaMahadirRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-66'); if (target) { (function (event) { document.getElementById('rawda-img-input').click(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-74'); if (target) { (function (event) { removeRow(this,'rawda-complaints-body','rawda-s-complaints','rawda-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-75'); if (target) { (function (event) { addRawdaComplaintRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-79'); if (target) { (function (event) { removeRow(this,'health-mahadir-body','health-s-mahadir','health-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-80'); if (target) { (function (event) { addHealthMahadirRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-81'); if (target) { (function (event) { document.getElementById('health-img-input').click(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-89'); if (target) { (function (event) { removeRow(this,'health-complaints-body','health-s-complaints','health-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-90'); if (target) { (function (event) { addHealthComplaintRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-94'); if (target) { (function (event) { removeRow(this,'nusuk-mahadir-body','nusuk-s-mahadir','nusuk-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-95'); if (target) { (function (event) { addNusukMahadirRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-96'); if (target) { (function (event) { document.getElementById('nusuk-img-input').click(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-104'); if (target) { (function (event) { removeRow(this,'nusuk-complaints-body','nusuk-s-complaints','nusuk-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-105'); if (target) { (function (event) { addNusukComplaintRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-109'); if (target) { (function (event) { removeRow(this,'sokn-mahadir-body','sokn-s-mahadir','sokn-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-110'); if (target) { (function (event) { addSoknMahadirRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-111'); if (target) { (function (event) { document.getElementById('sokn-img-input').click(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-119'); if (target) { (function (event) { removeRow(this,'sokn-complaints-body','sokn-s-complaints','sokn-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-120'); if (target) { (function (event) { addSoknComplaintRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-124'); if (target) { (function (event) { removeRow(this,'meeqat-mahadir-body','meeqat-s-mahadir','meeqat-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-125'); if (target) { (function (event) { addMeeqatMahadirRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-126'); if (target) { (function (event) { document.getElementById('meeqat-img-input').click(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-134'); if (target) { (function (event) { removeRow(this,'meeqat-complaints-body','meeqat-s-complaints','meeqat-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-135'); if (target) { (function (event) { addMeeqatComplaintRow(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-136'); if (target) { (function (event) { if (!validateMahadirBeforeSubmit()) { showToast('⚠ يرجى تصحيح أرقام المحاضر قبل الرفع'); return; } submitData(); }).call(target, event); } }
    { const target = event.target.closest('.js-save-draft-btn'); if (target) { (function (event) { saveDraft(); }).call(target, event); } }
    { const target = event.target.closest('.js-signout-btn'); if (target) { (function (event) { doSignout(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-140'); if (target) { (function (event) { removeRow(this,'mahadir-body','s-mahadir','mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-144'); if (target) { (function (event) { removeRow(this,'complaints-body','s-complaints','complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-148'); if (target) { (function (event) { removeRow(this,'ist-mahadir-body','ist-s-mahadir','ist-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-152'); if (target) { (function (event) { removeRow(this,'health-mahadir-body','health-s-mahadir','health-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-156'); if (target) { (function (event) { removeRow(this,'health-complaints-body','health-s-complaints','health-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-160'); if (target) { (function (event) { removeRow(this,'nusuk-mahadir-body','nusuk-s-mahadir','nusuk-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-164'); if (target) { (function (event) { removeRow(this,'nusuk-complaints-body','nusuk-s-complaints','nusuk-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-168'); if (target) { (function (event) { removeRow(this,'rawda-mahadir-body','rawda-s-mahadir','rawda-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-172'); if (target) { (function (event) { removeRow(this,'rawda-complaints-body','rawda-s-complaints','rawda-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-176'); if (target) { (function (event) { removeRow(this,'ist-complaints-body','ist-s-complaints','ist-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-180'); if (target) { (function (event) { removeRow(this,'sokn-mahadir-body','sokn-s-mahadir','sokn-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-184'); if (target) { (function (event) { removeRow(this,'sokn-complaints-body','sokn-s-complaints','sokn-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-188'); if (target) { (function (event) { removeRow(this,'meeqat-mahadir-body','meeqat-s-mahadir','meeqat-mahadir-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-192'); if (target) { (function (event) { removeRow(this,'meeqat-complaints-body','meeqat-s-complaints','meeqat-complaints-count'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-197'); if (target) { (function (event) { tafRemoveRow(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-201'); if (target) { (function (event) { istBianatRemoveRow(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-205'); if (target) { (function (event) { tafRemoveFlightsAirRow(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-209'); if (target) { (function (event) { tafRemoveFlightsLandRow(this); }).call(target, event); } }
  }, false);

  document.addEventListener('change', function (event) {
    { const target = event.target.closest('.js-extracted-event-8');   if (target) { (function (event) { istBianatCalc(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-13');  if (target) { (function (event) { istOnNationalityChange(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-23');  if (target) { (function (event) { handleImgSelect(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-29');  if (target) { (function (event) { tafCalcArrivalsTotal(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-30');  if (target) { (function (event) { tafCalcArrivalsTotal(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-35');  if (target) { (function (event) { tafCalcFlightsAir(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-39');  if (target) { (function (event) { tafCalcFlightsLand(); }).call(target, event); } }
    // CORRECT — should be:
    { const target = event.target.closest('.js-extracted-event-55');  if (target) { (function (event) { tafShowPreviews(this.files); }).call(target, event); } }     
    { const target = event.target.closest('.js-extracted-event-70');  if (target) { (function (event) { rawdaShowPreviews(this.files); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-85');  if (target) { (function (event) { healthShowPreviews(this.files); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-100'); if (target) { (function (event) { nusukShowPreviews(this.files); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-115'); if (target) { (function (event) { soknShowPreviews(this.files); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-130'); if (target) { (function (event) { meeqatShowPreviews(this.files); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-193'); if (target) { (function (event) { tafCalcArrivalsTotal(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-194'); if (target) { (function (event) { tafCalcArrivalsTotal(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-198'); if (target) { (function (event) { istBianatCalc(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-202'); if (target) { (function (event) { tafCalcFlightsAir(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-206'); if (target) { (function (event) { tafCalcFlightsLand(); }).call(target, event); } }
  }, true);

  document.addEventListener('input', function (event) {
    { const target = event.target.closest('.js-extracted-event-9');   if (target) { (function (event) { istBianatValidate(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-10');  if (target) { (function (event) { istBianatValidate(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-14');  if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-15');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-16');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-24');  if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-25');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-26');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-31');  if (target) { (function (event) { tafValidateAndCalc(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-32');  if (target) { (function (event) { tafValidateAndCalc(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-36');  if (target) { (function (event) { tafCalcFlightsAir(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-37');  if (target) { (function (event) { tafCalcFlightsAir(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-40');  if (target) { (function (event) { tafCalcFlightsLand(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-41');  if (target) { (function (event) { tafCalcFlightsLand(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-43');  if (target) { (function (event) { tafOnArrivalsChange(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-44');  if (target) { (function (event) { calcDiff(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-45');  if (target) { (function (event) { calcDiff(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-46');  if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-47');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-48');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-56');  if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-57');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-58');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-61');  if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-62');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-63');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-71');  if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-72');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-73');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-76');  if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-77');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-78');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-86');  if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-87');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-88');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-91');  if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-92');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-93');  if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-101'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-102'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-103'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-106'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-107'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-108'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-116'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-117'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-118'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-121'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-122'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-123'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-131'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-132'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-133'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-137'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-138'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-139'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-141'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-142'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-143'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-145'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-146'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-147'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-149'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-150'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-151'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-153'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-154'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-155'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-157'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-158'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-159'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-161'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-162'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-163'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-165'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-166'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-167'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-169'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-170'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-171'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-173'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-174'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-175'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-177'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-178'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-179'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-181'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-182'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-183'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-185'); if (target) { (function (event) { checkDuplicateMahadirNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-186'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-187'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-189'); if (target) { (function (event) { checkDuplicateCaseNum(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-190'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-191'); if (target) { (function (event) { calcRowDiff(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-195'); if (target) { (function (event) { tafValidateAndCalc(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-196'); if (target) { (function (event) { tafValidateAndCalc(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-199'); if (target) { (function (event) { istBianatValidate(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-200'); if (target) { (function (event) { istBianatValidate(this); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-203'); if (target) { (function (event) { tafCalcFlightsAir(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-204'); if (target) { (function (event) { tafCalcFlightsAir(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-207'); if (target) { (function (event) { tafCalcFlightsLand(); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-208'); if (target) { (function (event) { tafCalcFlightsLand(); }).call(target, event); } }
  }, true);

  document.addEventListener('dragover', function (event) {
    { const target = event.target.closest('.js-extracted-event-20');  if (target) { (function (event) { event.preventDefault(); this.classList.add('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-52');  if (target) { (function (event) { event.preventDefault(); this.classList.add('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-67');  if (target) { (function (event) { event.preventDefault(); this.classList.add('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-82');  if (target) { (function (event) { event.preventDefault(); this.classList.add('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-97');  if (target) { (function (event) { event.preventDefault(); this.classList.add('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-112'); if (target) { (function (event) { event.preventDefault(); this.classList.add('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-127'); if (target) { (function (event) { event.preventDefault(); this.classList.add('drag-active'); }).call(target, event); } }
  }, true);

  document.addEventListener('dragleave', function (event) {
    { const target = event.target.closest('.js-extracted-event-21');  if (target) { (function (event) { this.classList.remove('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-53');  if (target) { (function (event) { this.classList.remove('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-68');  if (target) { (function (event) { this.classList.remove('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-83');  if (target) { (function (event) { this.classList.remove('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-98');  if (target) { (function (event) { this.classList.remove('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-113'); if (target) { (function (event) { this.classList.remove('drag-active'); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-128'); if (target) { (function (event) { this.classList.remove('drag-active'); }).call(target, event); } }
  }, true);

  document.addEventListener('drop', function (event) {
    { const target = event.target.closest('.js-extracted-event-22');  if (target) { (function (event) { handleImgDrop(event); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-54');  if (target) { (function (event) { handleDrop(event); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-69');  if (target) { (function (event) { rawdaHandleDrop(event); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-84');  if (target) { (function (event) { healthHandleDrop(event); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-99');  if (target) { (function (event) { nusukHandleDrop(event); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-114'); if (target) { (function (event) { soknHandleDrop(event); }).call(target, event); } }
    { const target = event.target.closest('.js-extracted-event-129'); if (target) { (function (event) { meeqatHandleDrop(event); }).call(target, event); } }
  }, true);
  // new code that fixing sec2 uploaded photo
  function tafShowPreviews(files) {
  if (!files || !files.length) return;
  const grid = document.getElementById('taf-preview-grid');
  const area = document.getElementById('taf-preview-area');
  area.style.display = 'block';
  Array.from(files).forEach(function(file) {
    const reader = new FileReader();
    reader.onload = function(ev) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:90px;height:90px;border-radius:8px;overflow:hidden;border:2px solid var(--green-brand);display:flex;align-items:center;justify-content:center;background:#f2f5f3;';
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        wrap.appendChild(img);
      } else {
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:32px;text-align:center;';
        if (file.name.match(/\.pdf$/i)) icon.textContent = '📄';
        else if (file.name.match(/\.docx?$/i)) icon.textContent = '📝';
        else icon.textContent = '📎';
        const fname = document.createElement('div');
        fname.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.55);color:white;font-size:9px;padding:2px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        fname.textContent = file.name;
        wrap.appendChild(icon);
        wrap.appendChild(fname);
      }
      const del = document.createElement('button');
      del.innerHTML = '✕';
      del.style.cssText = 'position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:4px;width:20px;height:20px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      del.onclick = function() { wrap.remove(); if (!grid.children.length) area.style.display = 'none'; };
      wrap.appendChild(del);
      grid.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
  showToast('✓ تم رفع الملف بنجاح');
}
});

// ── Custom 24h time picker (popup with HH/MM columns) ──
(function () {
  let popup = null;
  let activeInput = null;

  function ensurePopup() {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.className = 'time-popup';
    popup.dir = 'ltr';
    const colH = document.createElement('div');
    colH.className = 'tp-col';
    const labH = document.createElement('div');
    labH.className = 'tp-label';
    labH.textContent = 'HH';
    const listH = document.createElement('div');
    listH.className = 'tp-list';
    listH.dataset.list = 'h';
    colH.appendChild(labH);
    colH.appendChild(listH);
    const colM = document.createElement('div');
    colM.className = 'tp-col';
    const labM = document.createElement('div');
    labM.className = 'tp-label';
    labM.textContent = 'MM';
    const listM = document.createElement('div');
    listM.className = 'tp-list';
    listM.dataset.list = 'm';
    colM.appendChild(labM);
    colM.appendChild(listM);
    popup.appendChild(colH);
    popup.appendChild(colM);
    for (let h = 0; h < 24; h++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tp-btn';
      b.dataset.kind = 'h';
      b.dataset.value = String(h).padStart(2, '0');
      b.textContent = String(h).padStart(2, '0');
      listH.appendChild(b);
    }
    for (let m = 0; m < 60; m++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tp-btn';
      b.dataset.kind = 'm';
      b.dataset.value = String(m).padStart(2, '0');
      b.textContent = String(m).padStart(2, '0');
      listM.appendChild(b);
    }
    document.body.appendChild(popup);
    popup.addEventListener('mousedown', function (e) { e.preventDefault(); });
    popup.addEventListener('click', function (e) {
      const btn = e.target.closest('.tp-btn');
      if (!btn || !activeInput) return;
      let cur = (activeInput.value || '').trim();
      let h = '00', m = '00';
      const match = cur.match(/^([0-9]{2}):([0-9]{2})$/);
      if (match) { h = match[1]; m = match[2]; }
      if (btn.dataset.kind === 'h') h = btn.dataset.value;
      else m = btn.dataset.value;
      activeInput.value = h + ':' + m;
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      highlightSelected();
    });
    return popup;
  }

  function highlightSelected() {
    if (!popup || !activeInput) return;
    const v = activeInput.value || '';
    const h = v.slice(0, 2), m = v.slice(3, 5);
    let scrolled = { h: false, m: false };
    popup.querySelectorAll('.tp-btn').forEach(function (b) {
      const matchH = (b.dataset.kind === 'h' && b.dataset.value === h);
      const matchM = (b.dataset.kind === 'm' && b.dataset.value === m);
      const sel = matchH || matchM;
      b.classList.toggle('selected', sel);
      if (sel && b.dataset.kind === 'h' && !scrolled.h) {
        b.scrollIntoView({ block: 'nearest' });
        scrolled.h = true;
      }
      if (sel && b.dataset.kind === 'm' && !scrolled.m) {
        b.scrollIntoView({ block: 'nearest' });
        scrolled.m = true;
      }
    });
  }

  function show(input) {
    activeInput = input;
    const p = ensurePopup();
    const r = input.getBoundingClientRect();
    p.style.top = (window.scrollY + r.bottom + 4) + 'px';
    p.style.left = (window.scrollX + r.left) + 'px';
    p.classList.add('open');
    setTimeout(highlightSelected, 0);
  }

  function hide() {
    if (popup) popup.classList.remove('open');
    activeInput = null;
  }

  document.addEventListener('focusin', function (e) {
    if (e.target && e.target.matches && e.target.matches('input[data-time-mask="1"]')) {
      show(e.target);
    }
  });
  document.addEventListener('focusout', function (e) {
    if (!e.target || !e.target.matches || !e.target.matches('input[data-time-mask="1"]')) return;
    setTimeout(function () {
      const within = popup && document.activeElement && popup.contains(document.activeElement);
      const onAnotherTimeInput = document.activeElement && document.activeElement.matches && document.activeElement.matches('input[data-time-mask="1"]');
      if (!within && !onAnotherTimeInput) hide();
    }, 100);
  });
  document.addEventListener('click', function (e) {
    if (!popup || !popup.classList.contains('open')) return;
    if (popup.contains(e.target)) return;
    if (e.target.matches && e.target.matches('input[data-time-mask="1"]')) return;
    hide();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', function () {
    if (activeInput && popup && popup.classList.contains('open')) {
      const r = activeInput.getBoundingClientRect();
      popup.style.top = (window.scrollY + r.bottom + 4) + 'px';
      popup.style.left = (window.scrollX + r.left) + 'px';
    }
  }, true);
})();