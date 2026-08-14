/* ==================================================================
   MSI Vietnam · Dealers Detail  (module doc lap, them 14/08/2026)

   Muc tieu: dung lai khoi "Dealers detail" cua Looker Studio —
   9 bang breakdown, tat ca dung CHUNG mot bo cot:

     S/O shared | Sell Out | Sell In | S/I YoY | Dealers SOH | WOI
     | S/O Last 3 Wk | S/O Last 2 Wk | S/O Last Wk | WoW | Active Cus.

   Do do header cac sheet dong nhat, moi dimension chi la mot ten cot
   duy nhat trong ca monthly lan weekly -> mot ham render dung chung
   cho ca 9 bang, chi doi `field`.

   Cross-filter: ghi thang vao `filters` cua trang chinh roi goi
   renderAll(), nen click o day lan sang moi tab khac va nguoc lai.
   ================================================================== */
(function () {
  'use strict';

  // 9 breakdown giong Looker. `field` la ten cot chuan (xem CANON_DIMS ben GAS).
  var DIMS = [
    { field: 'disty',         label: 'Disty',        count: 'cus' },
    { field: 'series_group',  label: 'Series Group', count: 'cus' },
    { field: 'channel_type',  label: 'Channel Type', count: 'cus' },
    { field: 'sales_rep',     label: 'Sales Rep',    count: 'cus' },
    { field: 'customer',      label: 'Customer',     count: 'sku' },
    { field: 'marketing_sku', label: 'marketing_sku',count: 'cus' },
    { field: 'segment1',      label: 'SEGMENT1',     count: 'sku' },
    { field: 'gpu',           label: 'GPU',          count: 'cus', weeklyNeedsEnriched: true },
    { field: 'cpu_segment',   label: 'CPU Segment',  count: 'cus', weeklyNeedsEnriched: true }
  ];

  var WK = null;        // rows tu v_weekly_enriched (co gpu/cpu_segment)
  var wkState = 'idle'; // idle | loading | ok | fallback
  var topN = 15;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function fmt(v) { return (!v || isNaN(v)) ? '' : Math.round(v).toLocaleString('en-US'); }
  function pct(v) { return (v === null || v === undefined || isNaN(v)) ? '' : (v * 100).toFixed(1) + '%'; }
  function signed(v) {
    if (v === null || v === undefined || !isFinite(v)) return '<span class="dt-mut">—</span>';
    var c = v > 0 ? 'dt-pos' : (v < 0 ? 'dt-neg' : 'dt-mut');
    return '<span class="' + c + '">' + (v > 0 ? '+' : '') + Math.round(v * 100) + '%</span>';
  }
  function ratio(a, b) { return (!b) ? null : (a - b) / Math.abs(b); }

  /* ---------- nguon du lieu ---------- */

  // Monthly: dung RAW_M cua trang chinh, da ap filter san bang matchesFilters.
  function monthlyRows() { return (typeof RAW_M !== 'undefined' && Array.isArray(RAW_M)) ? RAW_M : []; }

  // Weekly: uu tien v_weekly_enriched (co spec), khong co thi lui ve RAW_W.
  function weeklyRows() {
    if (WK && WK.length) return WK;
    return (typeof RAW_W !== 'undefined' && Array.isArray(RAW_W)) ? RAW_W : [];
  }

  async function loadEnrichedWeekly() {
    if (wkState === 'loading' || wkState === 'ok') return;
    wkState = 'loading';
    try {
      var periods = (typeof periodsList === 'function') ? periodsList() : [];
      var all = [];
      for (var i = 0; i < periods.length; i++) {
        var j = await fetchView('v_weekly_enriched', periods[i].y, periods[i].q);
        if (j && j.ok && Array.isArray(j.rows)) all = all.concat(j.rows);
      }
      if (all.length) {
        // view giu ten cu year_label/week_label nen dung thang duoc
        WK = all;
        wkState = 'ok';
      } else { wkState = 'fallback'; }
    } catch (e) {
      console.warn('v_weekly_enriched chua san sang, dung RAW_W:', e && e.message);
      wkState = 'fallback';
    }
    render();
  }

  /* ---------- ap filter (dung chung helper cua trang chinh) ---------- */

  // Bo qua chinh chieu dang ve, de bang do van hien du cac lua chon khac
  // (giong Looker: click 1 dong khong lam bien mat cac dong con lai).
  function passes(r, exceptField) {
    var keys = Object.keys(filters);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === exceptField) continue;
      var arr = fArr(k);
      if (arr.length && arr.indexOf(r[k]) < 0) return false;
    }
    if (typeof presetPass === 'function' && !presetPass(r)) return false;
    return true;
  }

  /* ---------- tong hop ---------- */

  function weekKeys() {
    var rows = weeklyRows(), s = {};
    for (var i = 0; i < rows.length; i++) { var w = rows[i].week_label || rows[i].week; if (w) s[w] = 1; }
    return Object.keys(s).sort();
  }

  function build(field) {
    var acc = {}, mrows = monthlyRows();
    function slot(k) {
      if (!acc[k]) acc[k] = { key: k, si: 0, so: 0, soh: 0, siLY: 0, cus: {}, sku: {}, w1: 0, w2: 0, w3: 0, w4: 0 };
      return acc[k];
    }
    for (var i = 0; i < mrows.length; i++) {
      var r = mrows[i];
      if (!passes(r, field)) continue;
      var k = r[field]; if (k === null || k === undefined || k === '' || k === '\u2014') k = '(Unassigned)';
      var a = slot(k);
      a.si += num(r.sell_in); a.so += num(r.sell_out);
      if (r.is_soh_month) a.soh += num(r.on_hand);
      if (r.customer) a.cus[r.customer] = 1;
      if (r.marketing_sku) a.sku[r.marketing_sku] = 1;
    }

    // cot theo tuan
    var wks = weekKeys(), last = wks.slice(-4);
    var wrows = weeklyRows();
    for (var j = 0; j < wrows.length; j++) {
      var w = wrows[j];
      if (!passes(w, field)) continue;
      var kk = w[field];
      if (kk === null || kk === undefined || kk === '' || kk === '\u2014') {
        // bang GPU/CPU chi co du lieu tuan khi view enriched da san sang
        continue;
      }
      var b = acc[kk]; if (!b) continue;
      var wl = w[
        'week_label'] || w.week;
      var idx = last.indexOf(wl);
      if (idx < 0) continue;
      var v = num(w.sell_out);
      if (idx === 3) b.w1 += v; else if (idx === 2) b.w2 += v; else if (idx === 1) b.w3 += v; else b.w4 += v;
    }

    var out = [], totSo = 0;
    for (var key in acc) { totSo += acc[key].so; out.push(acc[key]); }
    for (var m = 0; m < out.length; m++) {
      var o = out[m];
      o.share = totSo ? o.so / totSo : 0;
      o.woi = o.so ? (o.soh / (o.so / 13)) : null;   // 13 tuan/quy
      o.wow = o.w2 ? (o.w1 - o.w2) / o.w2 : null;
      o.nCus = Object.keys(o.cus).length;
      o.nSku = Object.keys(o.sku).length;
    }
    out.sort(function (a, b) { return b.so - a.so; });
    return { rows: out, totSo: totSo, weeks: last };
  }

  /* ---------- ve ---------- */

  function tableHtml(dim) {
    var d = build(dim.field);
    var wk = d.weeks, rows = d.rows;
    var shown = rows.slice(0, topN);
    var cntLbl = dim.count === 'sku' ? 'SKUs' : 'Active Cus.';
    var noWeekly = dim.weeklyNeedsEnriched && wkState !== 'ok';

    var h = '<div class="dt-card"><div class="dt-h"><b>' + esc(dim.label) + '</b>';
    if (noWeekly) h += '<span class="dt-warn">cột tuần cần v_weekly_enriched</span>';
    if (rows.length > topN) h += '<span class="dt-mut">top ' + topN + '/' + rows.length + '</span>';
    h += '</div><div class="dt-scroll"><table class="dt-tbl"><thead><tr>' +
      '<th class="l">' + esc(dim.label) + '</th><th>S/O shared</th><th>Sell Out</th><th>Sell In</th>' +
      '<th>S/I YoY</th><th>Dealers SOH</th><th>WOI</th>' +
      '<th class="sep">' + (wk[1] || 'S/O L3') + '</th><th>' + (wk[2] || 'S/O L2') + '</th><th>' + (wk[3] || 'S/O LW') + '</th>' +
      '<th>WoW</th><th class="sep">' + cntLbl + '</th></tr></thead><tbody>';

    for (var i = 0; i < shown.length; i++) {
      var r = shown[i];
      var sel = fArr(dim.field).indexOf(r.key) >= 0;
      var dim2 = fActive(dim.field) && !sel;
      h += '<tr class="dt-row' + (sel ? ' on' : '') + (dim2 ? ' dim' : '') + '" data-f="' + esc(dim.field) + '" data-v="' + encodeURIComponent(r.key) + '">' +
        '<td class="l">' + esc(r.key) + '</td>' +
        '<td class="hl">' + pct(r.share) + '</td>' +
        '<td>' + fmt(r.so) + '</td>' +
        '<td>' + fmt(r.si) + '</td>' +
        '<td>' + signed(r.siYoY === undefined ? null : r.siYoY) + '</td>' +
        '<td>' + fmt(r.soh) + '</td>' +
        '<td>' + (r.woi == null ? '' : r.woi.toFixed(0)) + '</td>' +
        '<td class="sep">' + (noWeekly ? '<span class="dt-mut">—</span>' : fmt(r.w3)) + '</td>' +
        '<td>' + (noWeekly ? '' : fmt(r.w2)) + '</td>' +
        '<td>' + (noWeekly ? '' : fmt(r.w1)) + '</td>' +
        '<td>' + (noWeekly ? '' : signed(r.wow)) + '</td>' +
        '<td class="sep">' + (dim.count === 'sku' ? r.nSku : r.nCus) + '</td></tr>';
    }

    var t = { so: 0, si: 0, soh: 0, w1: 0, w2: 0, w3: 0 };
    for (var j = 0; j < rows.length; j++) { t.so += rows[j].so; t.si += rows[j].si; t.soh += rows[j].soh; t.w1 += rows[j].w1; t.w2 += rows[j].w2; t.w3 += rows[j].w3; }
    h += '</tbody><tfoot><tr><td class="l">Grand total</td><td class="hl">100%</td><td>' + fmt(t.so) + '</td><td>' + fmt(t.si) +
      '</td><td></td><td>' + fmt(t.soh) + '</td><td>' + (t.so ? (t.soh / (t.so / 13)).toFixed(0) : '') + '</td>' +
      '<td class="sep">' + (noWeekly ? '' : fmt(t.w3)) + '</td><td>' + (noWeekly ? '' : fmt(t.w2)) + '</td><td>' + (noWeekly ? '' : fmt(t.w1)) + '</td>' +
      '<td>' + (noWeekly ? '' : signed(ratio(t.w1, t.w2))) + '</td><td class="sep"></td></tr></tfoot></table></div></div>';
    return h;
  }

  function render() {
    var root = document.getElementById('detailGrid');
    if (!root) return;
    var html = '';
    for (var i = 0; i < DIMS.length; i++) html += tableHtml(DIMS[i]);
    root.innerHTML = html;

    root.querySelectorAll('tr.dt-row').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var f = tr.dataset.f, v = decodeURIComponent(tr.dataset.v);
        if (!Array.isArray(filters[f])) filters[f] = [];
        fToggle(f, v);
        if (typeof renderAll === 'function') renderAll();
        render();
      });
    });

    var st = document.getElementById('detailStatus');
    if (st) {
      st.innerHTML = wkState === 'ok'
        ? '<b style="color:var(--pos)">weekly live</b> · v_weekly_enriched'
        : (wkState === 'loading' ? 'đang tải weekly…' : '<span class="dt-warn">weekly fallback</span> · chạy runFullDataRefreshV2 để bật GPU/CPU theo tuần');
    }
  }

  /* ---------- API ra ngoai ---------- */
  window.MSIDetail = {
    render: render,
    init: function () { render(); loadEnrichedWeekly(); },
    reloadWeekly: function () { wkState = 'idle'; WK = null; loadEnrichedWeekly(); },
    setTopN: function (n) { topN = n; render(); }
  };
})();
