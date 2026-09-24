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

const infoBox = (title, text, color = '#e0e7ff', border = '#c7d2fe', textColor = '#3730a3') => `
  <div style="background:${color};border:1px solid ${border};padding:14px;border-radius:12px;margin:16px 0">
    <p style="margin:0 0 6px;color:${textColor};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">${title}</p>
    <p style="margin:0;color:${textColor};font-size:13px;line-height:1.6">${text}</p>
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
    <td style="padding:8px;color:#475569;font-size:12px;width:120px;vertical-align:top">${label}</td>
    <td style="padding:8px;color:#0f172a;font-weight:500">${value}</td>
  </tr>
`;

const dataTable = (rows) => `
  <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
`;

export const templates = {

  // ==========================================
  // A. ALUR PENGAJUAN DARI STAFF (LEVEL 2)
  // ==========================================

  // A1. Email ke ATASAN LANGSUNG (level 3) — ACTION
  newRequestDirect: (d) => ({
    subject: `[Lembur] 🔔 Pengajuan dari ${d.employeeName} — perlu approval kamu`,
    html: wrap('🔔 Perlu Approval Kamu', '#4f46e5', `
      <p style="margin:0 0 16px;color:#0f172a">Pengajuan lembur baru dari <strong>${d.employeeName}</strong> (atasan langsung kamu):</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Level', d.employeeLevel || '-')}
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
      ], 'Setujui/Tolak berlaku 24 jam') : btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
      ${infoBox('Perlu diketahui', 'Setelah kamu approve, pengajuan akan diteruskan ke Manager (level 4+) untuk final approval. Lembur baru bisa jalan setelah Manager approve.', '#e0e7ff', '#c7d2fe', '#3730a3')}
    `, 'ACTION')
  }),

  // A2. Email ke FINAL APPROVER (level 4) — ACTION dengan opsi jump in
  newRequestFinal: (d) => ({
    subject: `[Lembur] 🔔 Pengajuan dari ${d.employeeName} — final approval`,
    html: wrap('🔔 Final Approval', '#4f46e5', `
      <p style="margin:0 0 16px;color:#0f172a">Ada pengajuan lembur yang butuh <strong>final approval</strong> kamu:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Level', d.employeeLevel || '-')}
        ${row('Atasan Langsung', d.directApproverName || '-')}
        ${row('Status Atasan Langsung', d.directApproved ? '✓ Sudah approve' : '⏳ Belum review')}
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
        ${row('Kategori', d.reason)}
      `)}
      ${!d.directApproved ? infoBox('⚠️ Atasan langsung belum review', `Kamu bisa <strong>jump in</strong> approve sekarang (lembur langsung jalan), atau tunggu <strong>${d.directApproverName}</strong> review dulu.`, '#fef3c7', '#fde68a', '#92400e') : infoBox('✓ Atasan langsung sudah approve', `Sekarang butuh approval kamu sebagai final approver. Setelah kamu approve, lembur bisa jalan.`, '#ecfdf5', '#a7f3d0', '#065f46')}
      ${d.approveUrl && d.rejectUrl ? btnGroup([
        { text: '✓ Approve Final', url: d.approveUrl, color: '#059669' },
        { text: '✕ Tolak', url: d.rejectUrl, color: '#dc2626' },
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ]) : btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // A3. Email ke STAFF (FYI: menunggu persetujuan)
  pendingApproval: (d) => ({
    subject: `[Lembur] ⏳ Pengajuan kamu sedang menunggu persetujuan`,
    html: wrap('⏳ Menunggu Persetujuan', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Pengajuan lembur kamu sudah <strong>terkirim</strong>. Mohon tunggu persetujuan.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
      `)}
      ${infoBox('Alur approval', 'Atasan langsung review dulu → baru Manager (level 4+) final approve. Kamu akan dapat email di setiap tahap.', '#e0e7ff', '#c7d2fe', '#3730a3')}
      ${btnGroup([
        { text: '📱 Cek Status', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  }),

  // A4. Email ke FINAL APPROVER setelah atasan langsung approve — ACTION
  directApprovedNotifyFinal: (d) => ({
    subject: `[Lembur] ✅ Atasan langsung sudah approve — giliran kamu final`,
    html: wrap('✅ Atasan Langsung Approve', '#059669', `
      <p style="margin:0 0 16px;color:#0f172a"><strong>${d.directApproverName}</strong> (atasan langsung) sudah <strong>approve</strong> pengajuan ini. Sekarang butuh final approval kamu:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Atasan Langsung', d.directApproverName)}
        ${row('Approved pada', d.directApprovedAt || '-')}
        ${row('Catatan', d.directNote || '-')}
        ${row('Tanggal Lembur', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
      `)}
      ${infoBox('⚡ Aksi kamu', 'Setelah kamu approve, lembur bisa langsung jalan. Timer auto-start akan aktif di jam yang ditentukan.', '#ecfdf5', '#a7f3d0', '#065f46')}
      ${d.approveUrl && d.rejectUrl ? btnGroup([
        { text: '✓ Approve Final', url: d.approveUrl, color: '#059669' },
        { text: '✕ Tolak', url: d.rejectUrl, color: '#dc2626' },
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ]) : btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // A5. Email FYI ke STAFF setelah atasan langsung approve
  partialApproval: (d) => ({
    subject: `[Lembur] ⏳ Atasan langsung sudah approve, tunggu final approval`,
    html: wrap('⏳ Persetujuan Bertahap', '#0ea5e9', `
      <p style="margin:0 0 16px;color:#0f172a">Kabar baik! <strong>${d.directApproverName}</strong> (atasan langsung) sudah approve pengajuan kamu.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Status', '1 dari 2 tahap selesai')}
      `)}
      ${infoBox('Langkah selanjutnya', 'Sekarang menunggu <strong>final approval</strong> dari Manager. Setelah itu lembur bisa jalan.', '#e0e7ff', '#c7d2fe', '#3730a3')}
      ${btnGroup([
        { text: '📱 Cek Status', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  }),

  // ==========================================
  // B. FINAL APPROVED / JUMP IN
  // ==========================================

  // B1. Email ke STAFF — approved (via alur normal)
  approved: (d) => ({
    subject: '[Lembur] ✅ Pengajuan kamu disetujui final',
    html: wrap('✅ Disetujui Final', '#059669', `
      <p style="margin:0 0 16px;color:#0f172a">Pengajuan lembur kamu telah <strong>disetujui final</strong> oleh Manager. Lembur siap jalan.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Final Approver', d.finalApproverName || '-')}
      `)}
      ${fyiBox('Timer akan otomatis berjalan saat jam tiba. Pastikan berada di area kantor (radius 100m) saat mulai.')}
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#059669' }
      ])}
    `, 'ACTION')
  }),

  // B2. Email ke STAFF — approved via jump in
  approvedJumpIn: (d) => ({
    subject: '[Lembur] ✅ Pengajuan kamu disetujui (jump in approve)',
    html: wrap('✅ Disetujui (Jump In)', '#059669', `
      <p style="margin:0 0 16px;color:#0f172a">Pengajuan lembur kamu telah <strong>disetujui langsung</strong> oleh <strong>${d.finalApproverName}</strong> (Manager).</p>
      ${infoBox('Catatan', `Manager <strong>jump in</strong> approve langsung tanpa menunggu atasan langsung <strong>${d.directApproverName || '-'}</strong> review. Di sistem akan tampil catatan bahwa atasan langsung belum review.`, '#fef3c7', '#fde68a', '#92400e')}
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Final Approver', d.finalApproverName)}
      `)}
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#059669' }
      ])}
    `, 'ACTION')
  }),

  // B3. Email FYI ke ATASAN LANGSUNG kalau di-jump-in
  jumpedInNotifyDirect: (d) => ({
    subject: `[Lembur] ℹ️ Manager sudah approve duluan — ${d.employeeName}`,
    html: wrap('ℹ️ Manager Sudah Approve', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Sebagai informasi, <strong>${d.finalApproverName}</strong> (Manager) sudah <strong>approve duluan</strong> pengajuan lembur dari <strong>${d.employeeName}</strong> tanpa menunggu review kamu.</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Approved oleh', d.finalApproverName)}
        ${row('Approved pada', d.finalApprovedAt || '-')}
        ${row('Tanggal Lembur', d.date)}
      `)}
      ${fyiBox(`Kamu tidak perlu approve lagi. Lembur sudah disetujui dan bisa jalan.`, '#e0e7ff', '#c7d2fe', '#3730a3')}
      ${btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  }),

  // ==========================================
  // C. REJECT / REVISI
  // ==========================================

  rejected: (d) => ({
    subject: '[Lembur] ❌ Pengajuan kamu ditolak',
    html: wrap('❌ Pengajuan Ditolak', '#dc2626', `
      <p style="margin:0 0 16px;color:#0f172a">Mohon maaf, pengajuan lembur kamu <strong>ditolak</strong>.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam', d.startTime)}
        ${row('Ditolak oleh', d.rejectedBy || '-')}
      `)}
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b"><strong>Alasan:</strong> ${d.note}</p>
      </div>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  revision: (d) => ({
    subject: '[Lembur] ✏️ Revisi pengajuan diminta',
    html: wrap('✏️ Revisi Diperlukan', '#d97706', `
      <p style="margin:0 0 16px;color:#0f172a">Atasan meminta kamu <strong>merevisi</strong> pengajuan lembur.</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#92400e"><strong>Catatan:</strong> ${d.note}</p>
      </div>
      ${infoBox('Diminta revisi oleh', d.requestedBy || 'Atasan', '#fef3c7', '#fde68a', '#92400e')}
      <p style="margin:0 0 16px;color:#0f172a">Kamu bisa mengubah <strong>tanggal, jam mulai, durasi</strong>, kategori, dan rencana pekerjaan.</p>
      ${btnGroup([
        { text: '✏️ Revisi Sekarang', url: APP_URL + '/employee.html', color: '#d97706' }
      ])}
    `, 'ACTION')
  }),

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

  revisionResubmittedFinal: (d) => ({
    subject: `[Lembur] 🔄 Revisi dari ${d.employeeName} — final approval`,
    html: wrap('🔄 Revisi (Final Approval)', '#4f46e5', `
      <p style="margin:0 0 16px;color:#0f172a"><strong>${d.employeeName}</strong> telah merevisi pengajuan lembur. Sebagai final approver, mohon review:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Atasan Langsung', d.directApproverName || '-')}
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
      `)}
      ${btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#4f46e5' }
      ])}
    `, 'FYI')
  }),

  // ==========================================
  // D. PELAKSANAAN
  // ==========================================

  startedEmployee: (d) => ({
    subject: '[Lembur] ▶️ Timer lembur kamu sudah mulai jalan',
    html: wrap('▶️ Timer Berjalan', '#0ea5e9', `
      <p style="margin:0 0 16px;color:#0f172a">Timer lembur kamu sudah <strong>otomatis berjalan</strong>.</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi Rencana', d.duration + ' jam')}
      `)}
      ${fyiBox('Jangan keluar dari radius kantor, nanti lembur dihentikan otomatis. Setelah selesai, upload bukti hasil kerja.', '#e0e7ff', '#c7d2fe', '#3730a3')}
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#0ea5e9' }
      ])}
    `, 'FYI')
  }),

  proofSubmitted: (d) => ({
    subject: `[Lembur] 🔍 Bukti dari ${d.employeeName} — perlu verifikasi`,
    html: wrap('🔍 Bukti Hasil Kerja', '#ea580c', `
      <p style="margin:0 0 16px;color:#0f172a">Karyawan telah selesai lembur dan upload bukti. Mohon verifikasi:</p>
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

  proofPendingFyi: (d) => ({
    subject: '[Lembur] ⏳ Bukti terkirim — menunggu verifikasi',
    html: wrap('⏳ Bukti Terkirim', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Bukti hasil kerja kamu sudah terkirim ke atasan. Mohon tunggu verifikasi.</p>
      ${dataTable(`
        ${row('Durasi Aktual', d.duration)}
        ${row('Waktu Submit', d.submittedAt || '-')}
      `)}
      ${fyiBox('Kamu akan dapat email setelah atasan verifikasi (approve, minta revisi, atau tolak).')}
    `, 'FYI')
  }),

  verifyApproved: (d) => ({
    subject: '[Lembur] ⭐ Hasil kerja kamu disetujui',
    html: wrap('⭐ Hasil Kerja Disetujui', '#059669', `
      <p style="margin:0 0 16px;color:#0f172a">Hasil lembur kamu telah <strong>diverifikasi dan disetujui</strong>.</p>
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

  proofRevision: (d) => ({
    subject: '[Lembur] 📎 Revisi bukti hasil kerja diminta',
    html: wrap('📎 Revisi Bukti', '#d97706', `
      <p style="margin:0 0 16px;color:#0f172a">Atasan meminta kamu <strong>merevisi bukti</strong> hasil kerja.</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#92400e"><strong>Catatan:</strong> ${d.note}</p>
      </div>
      ${btnGroup([
        { text: '📎 Upload Ulang', url: APP_URL + '/employee.html', color: '#d97706' }
      ])}
    `, 'ACTION')
  }),

  proofRevisionResubmitted: (d) => ({
    subject: `[Lembur] 📎 ${d.employeeName} kirim ulang bukti — perlu verifikasi`,
    html: wrap('📎 Bukti Revisi Dikirim', '#ea580c', `
      <p style="margin:0 0 16px;color:#0f172a"><strong>${d.employeeName}</strong> telah kirim ulang bukti. Mohon verifikasi:</p>
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

  verifyRejected: (d) => ({
    subject: '[Lembur] ❌ Hasil kerja kamu ditolak',
    html: wrap('❌ Hasil Ditolak', '#dc2626', `
      <p style="margin:0 0 16px;color:#0f172a">Hasil kerja lembur kamu <strong>ditolak</strong>.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b"><strong>Alasan:</strong> ${d.note}</p>
      </div>
      <p style="margin:0 0 16px;color:#0f172a">Lembur ini tidak akan dihitung.</p>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  // ==========================================
  // E. AUTO-STOP / TIDAK DIHITUNG
  // ==========================================

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

  notCountedManager: (d) => ({
    subject: `[Lembur] ⚠️ FYI: ${d.employeeName} — lembur tidak dihitung`,
    html: wrap('⚠️ Lembur Tidak Dihitung', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Sebagai informasi, lembur berikut tidak dihitung:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Tanggal', d.date || '-')}
        ${row('Durasi', d.duration || '-')}
      `)}
      ${fyiBox(`<strong>Alasan:</strong> ${d.reason}`, '#fef2f2', '#fecaca', '#991b1b')}
    `, 'FYI')
  }),

  autoStopEmployee: (d) => ({
    subject: '[Lembur] ⚠️ Lembur kamu dihentikan otomatis',
    html: wrap('⚠️ Lembur Dihentikan', '#dc2626', `
      <p style="margin:0 0 16px;color:#0f172a">Lembur kamu dihentikan otomatis karena:</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:14px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b;font-weight:600">${d.reason}</p>
      </div>
      ${dataTable(`
        ${row('Jarak dari Kantor', d.distance ? d.distance + 'm' : '-')}
        ${row('Waktu Berhenti', d.stoppedAt || '-')}
      `)}
      <p style="margin:0 0 16px;color:#0f172a">Lembur bisa diajukan ulang saat sudah kembali di area kantor.</p>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  autoStopManager: (d) => ({
    subject: `[Lembur] ⚠️ FYI: ${d.employeeName} keluar radius`,
    html: wrap('⚠️ Auto-Stop', '#64748b', `
      <p style="margin:0 0 16px;color:#0f172a">Lembur berikut dihentikan otomatis:</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Jarak', d.distance ? d.distance + 'm' : '-')}
        ${row('Waktu', d.stoppedAt || '-')}
      `)}
      ${fyiBox(`<strong>Alasan:</strong> ${d.reason}`, '#fef2f2', '#fecaca', '#991b1b')}
    `, 'FYI')
  }),

  // ==========================================
  // F. TUGASKAN LEMBUR
  // ==========================================

  assigned: (d) => ({
    subject: `[Lembur] 📌 Kamu ditugaskan lembur oleh ${d.managerName}`,
    html: wrap('📌 Penugasan Lembur', '#4f46e5', `
      <p style="margin:0 0 16px;color:#0f172a"><strong>${d.managerName}</strong> menugaskan kamu lembur:</p>
      ${dataTable(`
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
        ${row('Kategori', d.reason)}
        ${row('Instruksi', d.desc)}
      `)}
      ${fyiBox('Lembur ini sudah otomatis disetujui. Timer akan jalan saat jam tiba.')}
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#4f46e5' }
      ])}
    `, 'ACTION')
  }),

  assignedFyiManager: (d) => ({
    subject: `[Lembur] ✅ Penugasan terkirim ke ${d.employeeName}`,
    html: wrap('✅ Penugasan Terkirim', '#059669', `
      <p style="margin:0 0 16px;color:#0f172a">Penugasan berhasil dikirim ke <strong>${d.employeeName}</strong>.</p>
      ${dataTable(`
        ${row('Karyawan', d.employeeName)}
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
      `)}
    `, 'FYI')
  })
};
