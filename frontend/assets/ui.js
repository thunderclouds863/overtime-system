// Sistem Lembur — shared UI helpers. Load synchronously in <head> (after theme.js)
// so page scripts can call UI.badge() etc. DOM enhancements run on DOMContentLoaded.
(function () {
  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
    check: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
    ok: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.16 3.19M6.6 6.6C3.6 8.6 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
    play: '<path d="m6 3 14 9-14 9V3Z"/>'
  };

  function icon(name, cls) {
    var p = ICONS[name];
    if (!p) return '';
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + p + '</svg>';
  }

  // Single source of truth for record status wording + tone (used by badges, tables, PDF, Excel).
  var STATUS = {
    pending:              ['Menunggu approval', 'wait'],
    approved:             ['Disetujui', 'info'],
    rejected:             ['Ditolak', 'bad'],
    revision:             ['Perlu revisi', 'attn'],
    active:               ['Sedang berjalan', 'live'],
    pending_verification: ['Menunggu verifikasi', 'wait'],
    proof_revision:       ['Revisi bukti', 'attn'],
    verify_rejected:      ['Hasil ditolak', 'bad'],
    completed:            ['Selesai', 'done'],
    cancelled:            ['Dibatalkan', 'neutral']
  };
  function statusText(s) { return (STATUS[s] || [s || '-'])[0]; }
  function badge(s) {
    var m = STATUS[s] || [s || '-', 'neutral'];
    return '<span class="badge tone-' + m[1] + '">' + m[0] + '</span>';
  }
  function dayTag(isHoliday) { return isHoliday ? '<span class="tag tag-holiday">Hari libur</span>' : ''; }
  function initials(name) {
    return String(name || '').trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase() || '–';
  }

  window.UI = { icon: icon, badge: badge, statusText: statusText, dayTag: dayTag, initials: initials };

  // ---------- DOM enhancements ----------
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function hydrateIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
      if (!el.firstElementChild) el.innerHTML = icon(el.getAttribute('data-icon'));
    });
  }

  function linkLabels() {
    document.querySelectorAll('label:not([for])').forEach(function (l) {
      if (l.querySelector('input,select,textarea')) return;
      var sib = l.nextElementSibling;
      if (!sib) return;
      var ctrl = sib.matches('input,select,textarea') ? sib : sib.querySelector('input,select,textarea');
      if (ctrl && ctrl.id) l.htmlFor = ctrl.id;
    });
  }

  function labelCloseButtons() {
    document.querySelectorAll('button').forEach(function (b) {
      if (b.textContent.trim() === '×' && !b.hasAttribute('aria-label')) {
        b.setAttribute('aria-label', 'Tutup');
        b.classList.add('icon-close');
      }
    });
  }

  function overlays() {
    return Array.prototype.slice.call(document.querySelectorAll('body > .fixed.inset-0'));
  }
  function isOpen(o) { return !o.classList.contains('hidden'); }
  function topOpen() { var open = overlays().filter(isOpen); return open[open.length - 1] || null; }

  function setupDialogs() {
    overlays().forEach(function (o, i) {
      var panel = o.querySelector('.bg-white') || o;
      var title = o.querySelector('h3, h2');
      o.setAttribute('role', 'dialog');
      o.setAttribute('aria-modal', 'true');
      if (title) {
        if (!title.id) title.id = (o.id || 'dialog' + i) + '-title';
        o.setAttribute('aria-labelledby', title.id);
      }
      panel.setAttribute('tabindex', '-1');
      panel.style.outline = 'none';
      var wasOpen = isOpen(o);
      new MutationObserver(function () {
        var nowOpen = isOpen(o);
        if (nowOpen === wasOpen) return;
        wasOpen = nowOpen;
        if (nowOpen) {
          o._returnFocus = document.activeElement;
          requestAnimationFrame(function () { panel.focus({ preventScroll: true }); });
        } else if (o._returnFocus && document.contains(o._returnFocus)) {
          o._returnFocus.focus({ preventScroll: true });
        }
        document.documentElement.style.overflow = overlays().some(isOpen) ? 'hidden' : '';
      }).observe(o, { attributes: true, attributeFilter: ['class'] });
    });

    document.addEventListener('keydown', function (e) {
      var o = topOpen();
      if (!o) return;
      if (e.key === 'Escape') {
        var closer = o.querySelector('button[onclick*="close"]');
        if (closer) closer.click(); else { o.classList.add('hidden'); o.classList.remove('flex'); }
        e.preventDefault();
      } else if (e.key === 'Tab') {
        var items = Array.prototype.filter.call(o.querySelectorAll(FOCUSABLE), function (el) { return el.offsetParent !== null; });
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (!o.contains(document.activeElement)) { first.focus(); e.preventDefault(); }
        else if (e.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    });
  }

  function fillInitials() {
    document.querySelectorAll('[data-initials-of]').forEach(function (el) {
      var src = document.querySelector(el.getAttribute('data-initials-of'));
      if (src) el.textContent = initials(src.textContent);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    hydrateIcons();
    linkLabels();
    labelCloseButtons();
    setupDialogs();
    fillInitials();
    var t = document.getElementById('toast');
    if (t) { t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); }
    ['#adminName', '#reviewerName'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim() !== '-') {
        document.querySelectorAll('[data-initials-of="' + sel + '"]').forEach(function (av) {
          av.textContent = initials(el.textContent);
        });
      }
    });
  });
})();
