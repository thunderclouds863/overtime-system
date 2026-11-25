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
    if (e && p) { e.value = email; p.value = pwd; e.focus(); }
  }
  function show() {
    var box = document.createElement('aside');
    box.id = 'demo-akun';
    box.setAttribute('aria-label', 'Akun demo');
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;width:320px;max-width:calc(100vw - 32px);background:#ffffff;' +
      'border:1px solid #cdd2dc;border-radius:10px;box-shadow:0 10px 28px -8px rgba(15,23,42,.2);padding:12px 14px;' +
      'font:12.5px/1.45 "Plus Jakarta Sans",system-ui,-apple-system,Segoe UI,sans-serif;color:#18203a;text-align:left';
    var rows = accounts.map(function (a, idx) {
      return '<tr data-idx="' + idx + '" style="cursor:pointer;border-top:1px solid #edf0f4">' +
        '<td style="padding:5px 4px;font-weight:600">' + a[0] + '</td>' +
        '<td style="padding:5px 4px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#2b3d93">' + a[1] + '</td>' +
        '<td style="padding:5px 4px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:#5b6478">' + a[2] + '</td></tr>';
    }).join('');
    box.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
      '<div><strong style="font-size:13px">Akun Demo</strong><span style="color:#5b6478"> · data contoh</span></div>' +
      '<button type="button" aria-label="Tutup" style="border:0;background:none;font-size:18px;line-height:1;cursor:pointer;color:#5b6478;padding:2px 6px">&times;</button>' +
      '</div>' +
      '<table style="border-collapse:collapse;width:100%;font-size:12px">' +
      '<thead><tr style="color:#858da0;font-size:11px;text-transform:uppercase;letter-spacing:.04em"><th style="text-align:left;padding:2px 4px">Peran</th><th style="text-align:left;padding:2px 4px">Email</th><th style="text-align:left;padding:2px 4px">Sandi</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p style="margin:8px 0 0;font-size:11.5px;color:#5b6478">' + note + '</p>';
    box.querySelector('button').onclick = function () { box.remove(); };
    box.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.onclick = function () {
        var a = accounts[Number(tr.getAttribute('data-idx'))];
        if (a) fill(a[1], a[2]);
      };
    });
    document.body.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
