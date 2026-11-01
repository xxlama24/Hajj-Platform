(function () {
  'use strict';

  if (!MGR.guardPage(9)) return;
  MGR.renderShell(9);

  var dateInput = document.getElementById('report-date');
  var container = document.getElementById('report-container');
  var btnPrint = document.getElementById('btn-print-report');
  var chart = null;

  function todayISO() { return new Date().toISOString().slice(0, 10); }
  dateInput.value = MGR.params().date || todayISO();

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'style') n.setAttribute('style', attrs[k]);
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function fmtArabicHijriDate(iso) {
    try {
      var d = new Date(iso + 'T00:00:00');
      var hijri = d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      var greg = d.toLocaleDateString('ar-SA', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      return hijri + ' — ' + greg;
    } catch (e) {
      return iso;
    }
  }

  function fmt(n) {
    if (n == null || n === '' || n === '—') return '—';
    if (typeof n === 'number') return n.toLocaleString('en-US');
    var s = String(n);
    if (/^-?\d+$/.test(s)) return parseInt(s, 10).toLocaleString('en-US');
    var m = s.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (m) {
      var num = parseFloat(m[1]);
      if (!isNaN(num)) return num.toLocaleString('en-US', { maximumFractionDigits: 1 }) + (m[2] || '');
    }
    return s;
  }

  function buildHeader(dateStr) {
    return el('div', { class: 'rpt-header' }, [
      el('div', null, [
        el('h1', { class: 'rpt-header-title', text: 'تقرير اعمال الحج لعام 1447هـ' }),
        el('div', { class: 'rpt-header-date', text: fmtArabicHijriDate(dateStr) })
      ]),
      el('div', { class: 'rpt-logo' }, [
        el('img', { class: 'rpt-logo-img', src: 'logo.jpg', alt: 'شركة رحلات ومنافع' })
      ])
    ]);
  }

  function portCard(p) {
    return el('div', { class: 'rpt-port' }, [
      el('div', { class: 'rpt-port-name', text: p.display_name }),
      el('div', { class: 'rpt-port-row' }, [
        el('span', { class: 'rpt-port-label', text: 'عدد الرحلات' }),
        el('span', { class: 'rpt-port-value', text: fmt(p.total_trips) })
      ]),
      el('div', { class: 'rpt-port-row' }, [
        el('span', { class: 'rpt-port-label', text: 'إجمالي القادمين' }),
        el('span', { class: 'rpt-port-value', text: fmt(p.total_arrivals) })
      ]),
      el('div', { class: 'rpt-port-row' }, [
        el('span', { class: 'rpt-port-label', text: 'إجمالي المغادرين' }),
        el('span', { class: 'rpt-port-value', text: fmt(p.total_departures) })
      ])
    ]);
  }

  function metricRow(label, value) {
    return el('div', { class: 'rpt-metric' }, [
      el('span', { class: 'rpt-metric-label', text: label }),
      el('span', { class: 'rpt-metric-value', text: fmt(value) })
    ]);
  }

  function render(data) {
    while (container.firstChild) container.removeChild(container.firstChild);

    container.appendChild(buildHeader(data.date));

    container.appendChild(el('div', { class: 'rpt-section-title', text: 'القدوم والمغادرة' }));

    var portsRow = el('div', { class: 'rpt-ports' });
    data.ports.forEach(function (p) { portsRow.appendChild(portCard(p)); });
    container.appendChild(portsRow);

    var chartRow = el('div', { class: 'rpt-chart-row' });
    var chartCard = el('div', { class: 'rpt-chart' });
    var canvas = el('canvas', { id: 'rpt-natchart' });
    chartCard.appendChild(canvas);
    chartRow.appendChild(chartCard);

    var totals = el('div', { class: 'rpt-totals' }, [
      el('div', { class: 'rpt-total-card' }, [
        el('div', { class: 'rpt-total-num', text: fmt(data.total_arrivals_all_ports) }),
        el('div', { class: 'rpt-total-label', text: 'إجمالي القادمين من جميع المنافذ' })
      ]),
      el('div', { class: 'rpt-total-card' }, [
        el('div', { class: 'rpt-total-num', text: fmt(data.total_departures_all_ports) }),
        el('div', { class: 'rpt-total-label', text: 'إجمالي المغادرين من جميع المنافذ' })
      ])
    ]);
    chartRow.appendChild(totals);
    container.appendChild(chartRow);

    container.appendChild(el('div', { class: 'rpt-section-title', text: 'العمليات والحالات الطبية' }));

    var twoCol = el('div', { class: 'rpt-two-col' });
    var ops = data.operations || {};
    var opsBlock = el('div', { class: 'rpt-block' }, [
      el('div', { class: 'rpt-block-title', text: 'العمليات' }),
      metricRow('متوسط زمن إنهاء الرحلة بالمطار', ops.avg_flight_processing),
      metricRow('متوسط زمن إنهاء الرحلة بالقطار', ops.avg_train_processing),
      metricRow('متوسط زمن إنهاء إجراءات الحافلات بالميقات', ops.avg_bus_meeqat_processing),
      metricRow('متوسط زمن إنهاء إجراءات الحافلات في كيلو 9', ops.avg_bus_kilo9_processing),
      metricRow('متوسط زمن معالجة الشكاوى', ops.avg_complaints_processing_minutes != null ? (ops.avg_complaints_processing_minutes + ' د') : null),
      metricRow('متوسط زمن معالجة البلاغات', ops.avg_reports_processing_minutes != null ? (ops.avg_reports_processing_minutes + ' د') : null),
      metricRow('عدد زيارات الروضة الشريفة', ops.rawda_visitors),
      metricRow('أعلى نسبة تفويج بالأسبوع', ops.top_tafweej_percent != null ? (ops.top_tafweej_percent + '%') : null)
    ]);
    var h = data.health || {};
    var healthBlock = el('div', { class: 'rpt-block gold' }, [
      el('div', { class: 'rpt-block-title', text: 'الحالات الطبية' }),
      metricRow('عدد الحالات الطبية', h.cases),
      metricRow('عدد المنومين', h.admitted),
      metricRow('عدد زيارات المستشفيات', h.hospital_visits),
      metricRow('عدد الوفيات', h.deaths)
    ]);
    twoCol.appendChild(opsBlock);
    twoCol.appendChild(healthBlock);
    container.appendChild(twoCol);

    var et = data.expected_tomorrow || {};
    var footer = el('div', { class: 'rpt-footer' }, [
      el('div', { class: 'rpt-footer-card' }, [
        el('div', { class: 'rpt-footer-num', text: fmt(et.arrivals != null ? et.arrivals : 0) }),
        el('div', { class: 'rpt-footer-label', text: 'الحجاج المتوقع وصولهم غداً' })
      ]),
      el('div', { class: 'rpt-footer-card' }, [
        el('div', { class: 'rpt-footer-num', text: fmt(et.departures != null ? et.departures : 0) }),
        el('div', { class: 'rpt-footer-label', text: 'الحجاج المتوقع مغادرتهم غداً' })
      ])
    ]);
    container.appendChild(footer);

    if (chart) chart.destroy();
    var nat = data.nationality_breakdown || [];
    if (nat.length) {
      chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: nat.map(function (n) { return n.nationality; }),
          datasets: [
            { label: 'القادمين',  data: nat.map(function (n) { return n.arrivals; }),   backgroundColor: '#d64545', borderRadius: 3 },
            { label: 'المغادرين', data: nat.map(function (n) { return n.departures; }), backgroundColor: '#c9a84c', borderRadius: 3 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { position: 'top', labels: { font: { size: 10 } } },
            title:  { display: true, text: 'عدد القادمين والمغادرين من كل جنسية', font: { size: 11, weight: '500' }, color: '#0a2e1a' }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 9 } } },
            y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 9 } }, beginAtZero: true }
          }
        }
      });
    } else {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#9ab0a0';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('لا توجد بيانات للجنسيات في هذا التاريخ', canvas.width / 2, canvas.height / 2);
    }
  }

  function load() {
    var d = dateInput.value || todayISO();
    MGR.setParams({ date: d });
    MGR.showLoading('جارٍ تحميل التقرير…');
    fetch('/api/manager/daily-report?date=' + encodeURIComponent(d))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.status !== 'ok') { MGR.toast('فشل تحميل التقرير'); return; }
        render(data);
      })
      .catch(function () { MGR.toast('تعذر الاتصال بالخادم'); })
      .finally(function () { MGR.hideLoading(); });
  }

  dateInput.addEventListener('change', load);
  var printNoticeShown = false;
  btnPrint.addEventListener('click', function () {
    if (!printNoticeShown) {
      printNoticeShown = true;
      MGR.toast('في نافذة الطباعة، ألغِ تفعيل "الرؤوس والتذييلات" لإزالة العنوان من الورقة');
    }
    setTimeout(function () { window.print(); }, 250);
  });

  load();
})();
