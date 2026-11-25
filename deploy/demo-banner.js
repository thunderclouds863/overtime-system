// Kotak "Akun Demo" untuk instance demo portfolio. File ini hanya disalin ke build demo.
(function () {
  var TOKEN_KEY = 'token';
  if (TOKEN_KEY && localStorage.getItem(TOKEN_KEY)) return;
  var accounts = [
    ['Karyawan', 'employee@demo.local', 'demo123'],
    ['Supervisor', 'spv@demo.local', 'demo123'],
    ['Manager', 'manager@demo.local', 'demo123'],
    ['Reviewer', 'reviewer@demo.local', 'demo123'],
    ['Admin', 'admin@demo.local', 'demo123']
  ];
  var note = 'Klik salah satu baris untuk mengisi email & kata sandi otomatis.';

  function fill(email, pwd) {
    var e = document.getElementById('email');
    var p = document.getElementById('password');
    if (e && p) {
      e.value = email;
      p.value = pwd;
      e.focus();
    }
  }

  function show() {
    var style = document.createElement('style');
    style.textContent =
      '#demo-akun{position:fixed;right:16px;bottom:16px;z-index:99999;font:12.5px/1.45 "Plus Jakarta Sans",system-ui,-apple-system,Segoe UI,sans-serif;color:#18203a;text-align:left}' +
      '#demo-akun .da-panel{width:324px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #cdd2dc;border-radius:12px;box-shadow:0 12px 32px -8px rgba(15,23,42,.22);padding:12px 14px}' +
      '#demo-akun .da-pill{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:999px;border:1px solid #cdd2dc;background:#fff;color:#18203a;font:600 12.5px/1 inherit;cursor:pointer;box-shadow:0 8px 22px -6px rgba(15,23,42,.2);transition:background-color .15s,border-color .15s}' +
      '#demo-akun .da-pill:hover{background:#eef1fa;border-color:#2b3d93;color:#2b3d93}' +
      '#demo-akun .da-dot{width:7px;height:7px;border-radius:50%;background:#2b3d93;flex:none}' +
      '#demo-akun tbody tr{cursor:pointer;border-top:1px solid #edf0f4;transition:background-color .12s}' +
      '#demo-akun tbody tr:hover,#demo-akun tbody tr:focus-visible{background:#eef1fa;outline:none}' +
      '#demo-akun .da-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:6px;background:none;color:#5b6478;cursor:pointer;font-size:16px;line-height:1;transition:background-color .15s,color .15s}' +
      '#demo-akun .da-icon-btn:hover{background:#f2f4f7;color:#18203a}';
    document.head.appendChild(style);

    var box = document.createElement('aside');
    box.id = 'demo-akun';
    box.setAttribute('aria-label', 'Akun demo');

    var collapsed = window.innerWidth < 1140;

    function render() {
      if (collapsed) {
        box.innerHTML =
          '<button type="button" class="da-pill" aria-expanded="false">' +
          '<span class="da-dot" aria-hidden="true"></span>' +
          '<span>Akun Demo</span>' +
          '</button>';
        box.querySelector('.da-pill').onclick = function () {
          collapsed = false;
          render();
        };
        return;
      }

      var rows = accounts.map(function (a, idx) {
        return '<tr data-idx="' + idx + '" tabindex="0" role="button">' +
          '<td style="padding:6px 4px;font-weight:600">' + a[0] + '</td>' +
          '<td style="padding:6px 4px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#2b3d93">' + a[1] + '</td>' +
          '<td style="padding:6px 4px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#5b6478">' + a[2] + '</td></tr>';
      }).join('');

      box.innerHTML =
        '<div class="da-panel">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<div><strong style="font-size:13px">Akun Demo</strong><span style="color:#5b6478"> · data contoh</span></div>' +
        '<div style="display:flex;align-items:center;gap:2px">' +
        '<button type="button" class="da-icon-btn" data-act="min" aria-label="Perkecil" title="Perkecil">&minus;</button>' +
        '<button type="button" class="da-icon-btn" data-act="close" aria-label="Tutup" title="Tutup">&times;</button>' +
        '</div>' +
        '</div>' +
        '<table style="border-collapse:collapse;width:100%;font-size:12px">' +
        '<thead><tr style="color:#858da0;font-size:11px;text-transform:uppercase;letter-spacing:.04em">' +
        '<th style="text-align:left;padding:2px 4px">Peran</th>' +
        '<th style="text-align:left;padding:2px 4px">Email</th>' +
        '<th style="text-align:left;padding:2px 4px">Sandi</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
        '<p class="da-note" style="margin:8px 0 0;font-size:11.5px;color:#5b6478">' + note + '</p>' +
        '</div>';

      box.querySelector('[data-act="min"]').onclick = function () {
        collapsed = true;
        render();
      };
      box.querySelector('[data-act="close"]').onclick = function () {
        box.remove();
      };
      box.querySelectorAll('tbody tr').forEach(function (tr) {
        function selectRow() {
          var a = accounts[Number(tr.getAttribute('data-idx'))];
          if (!a) return;
          fill(a[1], a[2]);
          var n = box.querySelector('.da-note');
          if (n) {
            n.textContent = 'Terisi: ' + a[0] + ' (' + a[1] + ')';
            n.style.color = '#0b6239';
          }
          if (window.innerWidth < 640) {
            collapsed = true;
            render();
          }
        }
        tr.onclick = selectRow;
        tr.onkeydown = function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            selectRow();
          }
        };
      });
    }

    render();
    document.body.appendChild(box);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();
