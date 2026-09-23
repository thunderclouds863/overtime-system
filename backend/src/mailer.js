import { BrevoClient } from '@getbrevo/brevo';
import dotenv from 'dotenv';
dotenv.config();

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'hrdcimory1@gmail.com';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Sistem Lembur Cimory';
const APP_URL = process.env.APP_URL || 'https://overtime-system.desi-arr863.workers.dev';

console.log('📧 Mailer init:', {
  provider: 'Brevo API v6',
  apiKey: BREVO_API_KEY ? '✓ set' : '✗ MISSING',
  sender: SENDER_EMAIL,
  appUrl: APP_URL
});

let brevo = null;
if (BREVO_API_KEY) {
  brevo = new BrevoClient({ apiKey: BREVO_API_KEY });
  console.log('✅ Brevo API siap');
} else {
  console.error('❌ BREVO_API_KEY tidak di-set!');
}

export async function sendEmail({ to, subject, html }) {
  if (!to) return { success: false, error: 'no recipient' };
  if (!brevo) return { success: false, error: 'no api key' };

  try {
    console.log(`📧 [SEND] Ke: ${to} | Subj: ${subject}`);
    const result = await brevo.transactionalEmails.sendTransacEmail({
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      headers: { 'X-Mailin-custom': 'disable-tracking' },
      params: { trackClicks: false, trackOpens: false }
    });
    console.log(`✅ [OK] ${to} | ID: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`❌ [FAIL] ${to} | ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================
// KOMPONEN UI EMAIL
// ============================================

const btn = (text, url, bgColor) => `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto">
    <tr>
      <td style="border-radius:12px;background:${bgColor};padding:0">
        <a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;letter-spacing:0.3px">${text}</a>
      </td>
    </tr>
  </table>
`;

const btnGroup = (buttons, note = '') => `
  <div style="margin:24px 0;padding:20px;background:#f1f5f9;border-radius:16px;border:1px solid #e2e8f0;text-align:center">
    <p style="margin:0 0 14px;font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Aksi Cepat</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto">
      <tr>
        ${buttons.map(b => `<td style="padding:0 6px">${btn(b.text, b.url, b.color)}</td>`).join('')}
      </tr>
    </table>
    ${note ? `<p style="margin:14px 0 0;font-size:11px;color:#64748b">${note}</p>` : ''}
  </div>
`;

const fyiBox = (text, color = '#fef3c7', border = '#fde68a', textColor = '#92400e') => `
  <div style="background:${color};border:1px solid ${border};padding:14px;border-radius:12px;margin:16px 0">
    <p style="margin:0;color:${textColor};font-size:13px;line-height:1.6"><strong>ℹ️ FYI:</strong> ${text}</p>
  </div>
`;

const wrap = (title, color, content, badge = '') => `
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:600px;margin:auto;background:#f7f7fb;padding:20px">
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);border:1px solid #e2e8f0">
      <div style="background:${color};padding:24px">
        ${badge ? `<p style="margin:0 0 6px;display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:0.5px">${badge}</p>` : ''}
        <h2 style="margin:0;font-size:20px;color:#ffffff;font-weight:700;line-height:1.3">${title}</h2>
        <p style="margin:4px 0 0;color:#ffffff;opacity:0.9;font-size:12px">Sistem Monitoring Lembur Cimory</p>
      </div>
      <div style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6;background:#ffffff">
        ${content}
      </div>
      <div style="background:#f1f5f9;padding:20px;text-align:center;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 8px">Email otomatis dari Sistem Monitoring Lembur Cimory</p>
        <a href="${APP_URL}" style="color:#4f46e5;text-decoration:none;font-weight:600">${APP_URL}</a>
      </div>
    </div>
  </div>
`;

const row = (label, value) => `
  <tr>
    <td style="padding:8px;color:#475569;font-size:12px;width:100px;vertical-align:top">${label}</td>
    <td style="padding:8px;color:#0f172a;font-weight:500">${value}</td>
  </tr>
`;

const dataTable = (rows) => `
  <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
`;

// ============================================
// TEMPLATES
// ============================================
export const templates = {

  // ==========================================
  // A. ALUR PENGAJUAN DARI EMPLOYEE
  // ==========================================

  // A1. Email ke MANAGER saat employee ajukan
  newRequest: (d) => ({
    subject: `[Lembur] 🔔 Pengajuan baru dari ${d.employeeName}`,
    html: wrap('🔔 Pengajuan Lembur Baru', '#4f46e5', `
      <p style="margin:0 0 16px;color:#0f172a">Ada pengajuan lembur baru yang <strong>perlu persetujuan Anda</strong>:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
        ${row('Kategori', d.reason)}
        ${row('Rencana', d.desc)}
      `)}
      ${d.approveUrl && d.rejectUrl ? btnGroup([
        { text: '✓ Setujui', url: d.approveUrl, color: '#059669' },
        { text: '✕ Tolak', url: d.rejectUrl, color: '#dc2626' },
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ], 'Setujui/Tolak berlaku 24 jam · Satu kali pakai') : btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // A2. Email FYI ke EMPLOYEE saat pengajuan menunggu approval
  pendingApproval: (d) => ({
    subject: `[Lembur] ⏳ Pengajuan kamu sedang menunggu persetujuan`,
    html: wrap('⏳ Menunggu Persetujuan', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Pengajuan lembur kamu sudah <strong>terkirim ke atasan</strong>. Mohon tunggu persetujuan.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
        ${row('Atasan', d.managerName || 'Atasan')}
      `)}
      ${fyiBox('Kamu akan menerima email lagi begitu atasan memberi keputusan (disetujui, ditolak, atau minta revisi).')}
      ${btnGroup([
        { text: '📱 Cek Status', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  }),

  // A3. Email ke EMPLOYEE saat disetujui
  approved: (d) => ({
    subject: '[Lembur] ✅ Pengajuan kamu disetujui',
    html: wrap('✅ Pengajuan Disetujui', '#059669', `
      <p style="margin:0 0 16px;color:#0f172a">Selamat! Pengajuan lembur kamu telah <strong>disetujui</strong>.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
      `)}
      <p style="margin:0 0 16px;color:#0f172a">Timer akan otomatis berjalan saat jam tiba. Jangan lupa <strong>buka sistem tepat waktu</strong> dan pastikan berada di area kantor (radius 100m).</p>
      ${fyiBox('Lembur &lt; 1 jam tidak akan dihitung. Keluar radius kantor akan menghentikan lembur otomatis.', '#fef3c7', '#fde68a', '#92400e')}
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#059669' }
      ])}
    `, 'ACTION')
  }),

  // A4. Email ke EMPLOYEE saat ditolak
  rejected: (d) => ({
    subject: '[Lembur] ❌ Pengajuan kamu ditolak',
    html: wrap('❌ Pengajuan Ditolak', '#dc2626', `
      <p style="margin:0 0 16px;color:#0f172a">Mohon maaf, pengajuan lembur kamu <strong>ditolak</strong>.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam', d.startTime)}
      `)}
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b"><strong>Alasan:</strong> ${d.note}</p>
      </div>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // A5. Email ke EMPLOYEE saat minta revisi
  revision: (d) => ({
    subject: '[Lembur] ✏️ Revisi pengajuan diminta',
    html: wrap('✏️ Revisi Diperlukan', '#d97706', `
      <p style="margin:0 0 16px;color:#0f172a">Atasan meminta kamu <strong>merevisi</strong> pengajuan lembur ini.</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#92400e"><strong>Catatan:</strong> ${d.note}</p>
      </div>
      <p style="margin:0 0 16px;color:#0f172a">Kamu bisa mengubah <strong>tanggal, jam mulai, durasi</strong>, kategori, dan rencana pekerjaan sebelum kirim ulang.</p>
      ${btnGroup([
        { text: '✏️ Revisi Sekarang', url: APP_URL + '/employee.html', color: '#d97706' }
      ])}
    `, 'ACTION')
  }),

  // A6. Email ke MANAGER saat employee kirim revisi
  revisionResubmitted: (d) => ({
    subject: `[Lembur] 🔄 Revisi dari ${d.employeeName} — perlu review ulang`,
    html: wrap('🔄 Revisi Dikirim Ulang', '#4f46e5', `
      <p style="margin:0 0 16px;color:#0f172a"><strong>${d.employeeName}</strong> telah merevisi pengajuan lembur. Mohon review ulang:</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
        ${row('Kategori', d.reason)}
        ${row('Rencana', d.desc)}
      `)}
      ${d.approveUrl && d.rejectUrl ? btnGroup([
        { text: '✓ Setujui', url: d.approveUrl, color: '#059669' },
        { text: '✕ Tolak', url: d.rejectUrl, color: '#dc2626' },
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ]) : btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // ==========================================
  // B. ALUR PELAKSANAAN
  // ==========================================

  // B1. Email FYI ke EMPLOYEE saat timer auto-start (bukan ke atasan)
  startedEmployee: (d) => ({
    subject: '[Lembur] ▶️ Timer lembur kamu sudah mulai jalan',
    html: wrap('▶️ Timer Berjalan', '#0ea5e9', `
      <p style="margin:0 0 16px;color:#0f172a">Timer lembur kamu sudah <strong>otomatis berjalan</strong>.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi Rencana', d.duration + ' jam')}
        ${row('Verifikasi Lokasi', '✓ Dalam radius kantor')}
      `)}
      ${fyiBox('Jangan lupa: kalau kamu keluar dari radius kantor, lembur akan dihentikan otomatis. Setelah selesai, klik "Selesaikan & Upload Bukti" di sistem.', '#e0e7ff', '#c7d2fe', '#3730a3')}
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#0ea5e9' }
      ])}
    `, 'FYI')
  }),

  // B2. Email ke MANAGER saat employee upload bukti
  proofSubmitted: (d) => ({
    subject: `[Lembur] 🔍 Bukti dari ${d.employeeName} — perlu verifikasi`,
    html: wrap('🔍 Bukti Hasil Kerja', '#ea580c', `
      <p style="margin:0 0 16px;color:#0f172a">Karyawan telah <strong>menyelesaikan lembur</strong> dan mengunggah bukti. Mohon verifikasi:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Durasi Aktual', d.duration)}
        ${row('Bukti', d.proof || '-')}
      `)}
      ${btnGroup([
        { text: '🔍 Verifikasi Sekarang', url: APP_URL + '/manager.html', color: '#ea580c' }
      ])}
    `, 'ACTION')
  }),

  // B3. Email FYI ke EMPLOYEE saat bukti terkirim
  proofPendingFyi: (d) => ({
    subject: '[Lembur] ⏳ Bukti terkirim — menunggu verifikasi atasan',
    html: wrap('⏳ Bukti Terkirim', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Bukti hasil kerja kamu sudah <strong>terkirim ke atasan</strong>. Mohon tunggu verifikasi.</p>
      ${dataTable(`
        ${row('Durasi Aktual', d.duration)}
        ${row('Waktu Submit', d.submittedAt || '-')}
      `)}
      ${fyiBox('Kamu akan menerima email begitu atasan selesai verifikasi (disetujui, minta revisi bukti, atau tolak).')}
      ${btnGroup([
        { text: '📱 Cek Status', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  }),

  // B4. Email ke EMPLOYEE saat hasil disetujui
  verifyApproved: (d) => ({
    subject: '[Lembur] ⭐ Hasil kerja kamu disetujui',
    html: wrap('⭐ Hasil Kerja Disetujui', '#059669', `
      <p style="margin:0 0 16px;color:#0f172a">Selamat! Hasil lembur kamu telah <strong>diverifikasi dan disetujui</strong> oleh atasan.</p>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;padding:16px;border-radius:12px;margin:16px 0;text-align:center">
        <p style="font-size:32px;margin:0;color:#f59e0b;letter-spacing:4px">${'★'.repeat(d.rating)}${'☆'.repeat(5 - d.rating)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#065f46">Rating: ${d.rating}/5</p>
      </div>
      <p style="margin:0 0 16px;color:#0f172a">Lembur ini akan masuk ke perhitungan penggajian.</p>
      ${btnGroup([
        { text: '📱 Lihat Riwayat', url: APP_URL + '/employee.html', color: '#059669' }
      ])}
    `, 'ACTION')
  }),

  // B5. Email ke EMPLOYEE saat minta revisi bukti
  proofRevision: (d) => ({
    subject: '[Lembur] 📎 Revisi bukti hasil kerja diminta',
    html: wrap('📎 Revisi Bukti', '#d97706', `
      <p style="margin:0 0 16px;color:#0f172a">Atasan meminta kamu <strong>merevisi bukti hasil kerja</strong>.</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#92400e"><strong>Catatan atasan:</strong> ${d.note}</p>
      </div>
      <p style="margin:0 0 16px;color:#0f172a">Silakan upload ulang bukti yang lebih jelas / lengkap.</p>
      ${btnGroup([
        { text: '📎 Upload Ulang', url: APP_URL + '/employee.html', color: '#d97706' }
      ])}
    `, 'ACTION')
  }),

  // B6. Email ke MANAGER saat employee kirim revisi bukti
  proofRevisionResubmitted: (d) => ({
    subject: `[Lembur] 📎 ${d.employeeName} kirim ulang bukti — perlu verifikasi`,
    html: wrap('📎 Bukti Revisi Dikirim', '#ea580c', `
      <p style="margin:0 0 16px;color:#0f172a"><strong>${d.employeeName}</strong> telah mengirim ulang bukti hasil kerja. Mohon verifikasi:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Bukti Baru', d.proof || '-')}
        ${row('Waktu', d.submittedAt || '-')}
      `)}
      ${btnGroup([
        { text: '🔍 Verifikasi Sekarang', url: APP_URL + '/manager.html', color: '#ea580c' }
      ])}
    `, 'ACTION')
  }),

  // B7. Email ke EMPLOYEE saat hasil ditolak
  verifyRejected: (d) => ({
    subject: '[Lembur] ❌ Hasil kerja kamu ditolak',
    html: wrap('❌ Hasil Ditolak', '#dc2626', `
      <p style="margin:0 0 16px;color:#0f172a">Hasil kerja lembur kamu <strong>ditolak</strong> oleh atasan.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b"><strong>Alasan:</strong> ${d.note}</p>
      </div>
      <p style="margin:0 0 16px;color:#0f172a">Lembur ini <strong>tidak akan dihitung</strong>. Hubungi atasan kalau ada pertanyaan.</p>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // ==========================================
  // C. AUTO-STOP / TIDAK DIHITUNG
  // ==========================================

  // C1. Email ACTION ke EMPLOYEE saat durasi < 1 jam
  notCountedEmployee: (d) => ({
    subject: '[Lembur] ⚠️ Lembur kamu tidak dihitung',
    html: wrap('⚠️ Lembur Tidak Dihitung', '#dc2626', `
      <p style="margin:0 0 16px;color:#0f172a">Lembur kamu <strong>tidak dihitung</strong> karena:</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:14px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b;font-weight:600">${d.reason}</p>
      </div>
      ${dataTable(`
        ${row('Tanggal', d.date || '-')}
        ${row('Durasi', d.duration || '-')}
      `)}
      <p style="margin:0 0 16px;color:#0f172a">Hubungi atasan kalau kamu merasa ini keliru.</p>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // C2. Email FYI ke MANAGER saat durasi < 1 jam
  notCountedManager: (d) => ({
    subject: `[Lembur] ⚠️ FYI: ${d.employeeName} — lembur tidak dihitung`,
    html: wrap('⚠️ Lembur Tidak Dihitung', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Sebagai informasi, lembur berikut <strong>tidak dihitung</strong>:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Tanggal', d.date || '-')}
        ${row('Durasi', d.duration || '-')}
      `)}
      ${fyiBox(`<strong>Alasan:</strong> ${d.reason}`, '#fef2f2', '#fecaca', '#991b1b')}
      <p style="margin:0 0 16px;color:#0f172a;font-size:13px">Karyawan sudah menerima notifikasi ini.</p>
      ${btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  }),

  // C3. Email ACTION ke EMPLOYEE saat auto-stop keluar radius
  autoStopEmployee: (d) => ({
    subject: '[Lembur] ⚠️ Lembur kamu dihentikan otomatis',
    html: wrap('⚠️ Lembur Dihentikan', '#dc2626', `
      <p style="margin:0 0 16px;color:#0f172a">Lembur kamu <strong>dihentikan otomatis</strong> karena:</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:14px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b;font-weight:600">${d.reason}</p>
      </div>
      ${dataTable(`
        ${row('Jarak dari Kantor', d.distance ? d.distance + 'm' : '-')}
        ${row('Waktu Berhenti', d.stoppedAt || '-')}
      `)}
      <p style="margin:0 0 16px;color:#0f172a">Hubungi atasan kalau ada pertanyaan. Lembur bisa diajukan ulang saat sudah kembali di area kantor.</p>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // C4. Email FYI ke MANAGER saat auto-stop keluar radius
  autoStopManager: (d) => ({
    subject: `[Lembur] ⚠️ FYI: ${d.employeeName} keluar radius — lembur dihentikan`,
    html: wrap('⚠️ Auto-Stop Lembur', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Sebagai informasi, lembur berikut dihentikan otomatis:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Jarak dari Kantor', d.distance ? d.distance + 'm' : '-')}
        ${row('Waktu Berhenti', d.stoppedAt || '-')}
      `)}
      ${fyiBox(`<strong>Alasan:</strong> ${d.reason}`, '#fef2f2', '#fecaca', '#991b1b')}
      <p style="margin:0 0 16px;color:#0f172a;font-size:13px">Karyawan sudah menerima notifikasi ini.</p>
      ${btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  }),

  // ==========================================
  // D. ALUR TUGASKAN LEMBUR (dari atasan)
  // ==========================================

  // D1. Email ACTION ke EMPLOYEE saat ditugaskan
  assigned: (d) => ({
    subject: `[Lembur] 📌 Kamu ditugaskan lembur oleh ${d.managerName}`,
    html: wrap('📌 Penugasan Lembur', '#4f46e5', `
      <p style="margin:0 0 16px;color:#0f172a"><strong>${d.managerName}</strong> menugaskan kamu untuk lembur:</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
        ${row('Kategori', d.reason)}
        ${row('Instruksi', d.desc)}
      `)}
      ${fyiBox('Lembur ini sudah otomatis disetujui. Timer akan jalan saat jam tiba. Pastikan berada di area kantor.')}
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // D2. Email FYI ke MANAGER saat penugasan terkirim
  assignedFyiManager: (d) => ({
    subject: `[Lembur] ✅ Penugasan terkirim ke ${d.employeeName}`,
    html: wrap('✅ Penugasan Terkirim', '#059669', `
      <p style="margin:0 0 16px;color:#0f172a">Penugasan lembur berhasil dikirim ke <strong>${d.employeeName}</strong>.</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
      `)}
      ${fyiBox('Karyawan sudah menerima email penugasan. Kamu akan menerima notifikasi lagi saat karyawan mengunggah bukti hasil kerja.')}
      ${btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  })
};
