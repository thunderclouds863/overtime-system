// Kotak "Akun Demo" untuk instance demo portfolio. File ini hanya disalin ke build demo.
(function () {
  var TOKEN_KEY = 'token';
  if (TOKEN_KEY && localStorage.getItem(TOKEN_KEY)) return; // sudah login
  var accounts = [["Karyawan","employee@demo.local","demo123"],["Supervisor","spv@demo.local","demo123"],["Manager","manager@demo.local","demo123"],["Reviewer","reviewer@demo.local","demo123"],["Admin","admin@demo.local","demo123"]];
  var note = 'Alur: Karyawan ajukan → Supervisor → Manager → Karyawan mulai/selesai → Manager verifikasi.';
  function show() {
    var box = document.createElement('div');
    box.id = 'demo-akun';
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;max-width:340px;background:#fffbe6;' +
      'border:1px solid #f0c36d;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:12px 14px;' +
      'font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#222;text-align:left';
    var rows = accounts.map(function (a) {
      return '<tr><td>' + a[0] + '</td><td><code>' + a[1] + '</code></td><td><code>' + a[2] + '</code></td></tr>';
    }).join('');
    box.innerHTML = '<button aria-label="Tutup" style="float:right;border:0;background:none;font-size:16px;cursor:pointer;color:#888">&times;</button>' +
      '<strong>Akun Demo</strong><span style="color:#777"> · data contoh, reset otomatis</span>' +
      '<table style="margin-top:6px;border-collapse:collapse;width:100%;font-size:12px">' +
      '<tr style="color:#777"><td>Role</td><td>User</td><td>Password</td></tr>' + rows + '</table>' +
      (note ? '<p style="margin:6px 0 0;font-size:12px;color:#555">' + note + '</p>' : '');
    box.querySelector('button').onclick = function () { box.remove(); };
    document.body.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
