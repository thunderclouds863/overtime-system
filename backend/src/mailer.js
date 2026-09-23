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
        <a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;color:white;text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;letter-spacing:0.3px">${text}</a>
      </td>
    </tr>
  </table>
`;

const btnGroup = (buttons, note = '') => `
  <div style="margin:24px 0;padding:20px;background:#f8fafc;border-radius:16px;border:1px solid #e2e8f0;text-align:center">
    <p style="margin:0 0 14px;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Aksi Cepat</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto">
      <tr>
        ${buttons.map(b => `<td style="padding:0 6px">${btn(b.text, b.url, b.color)}</td>`).join('')}
      </tr>
    </table>
    ${note ? `<p style="margin:14px 0 0;font-size:11px;color:#94a3b8">${note}</p>` : ''}
  </div>
`;

const wrap = (title, color, content) => `
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:600px;margin:auto;background:#f7f7fb;padding:20px">
    <div style="background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,${color});padding:24px;color:white">
        <h2 style="margin:0;font-size:20px">${title}</h2>
        <p style="margin:4px 0 0;opacity:0.9;font-size:12px">Sistem Monitoring Lembur Cimory</p>
      </div>
      <div style="padding:24px;color:#1e293b;font-size:14px;line-height:1.6">${content}</div>
      <div style="background:#f8fafc;padding:20px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 8px">Email otomatis dari Sistem Monitoring Lembur Cimory</p>
        <a href="${APP_URL}" style="color:#6366f1;text-decoration:none;font-weight:600">${APP_URL}</a>
      </div>
    </div>
  </div>
`;

const row = (label, value) => `
  <tr>
    <td style="padding:8px;color:#64748b;font-size:12px;width:100px;vertical-align:top">${label}</td>
    <td style="padding:8px;color:#1e293b;font-weight:500">${value}</td>
  </tr>
`;

export const templates = {
  newRequest: (d) => ({
    subject: `[Lembur] Pengajuan baru dari ${d.employeeName}`,
    html: wrap('📋 Pengajuan Lembur Baru', '#6366f1,#8b5cf6', `
      <p style="margin:0 0 16px">Ada pengajuan lembur baru yang perlu direview:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row('Karyawan', d.employeeName)}
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
        ${row('Kategori', d.reason)}
        ${row('Rencana', d.desc)}
      </table>
      ${d.approveUrl && d.rejectUrl ? btnGroup([
        { text: '✓ Setujui', url: d.approveUrl, color: '#10b981' },
        { text: '✕ Tolak', url: d.rejectUrl, color: '#ef4444' },
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#6366f1' }
      ], 'Setujui/Tolak berlaku 24 jam · Satu kali pakai') : btnGroup([
        { text: '🔍 Buka Sistem', url: APP_URL + '/manager.html', color: '#6366f1' }
      ])}
    `)
  }),

  approved: (d) => ({
    subject: '[Lembur] ✅ Pengajuan disetujui',
    html: wrap('✅ Pengajuan Disetujui', '#10b981,#059669', `
      <p style="margin:0 0 16px">Pengajuan lembur Anda telah <strong>disetujui</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
      </table>
      <p style="margin:0 0 16px">Timer akan otomatis berjalan saat jam tiba. Buka sistem tepat waktu untuk memulai.</p>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#10b981' }
      ])}
    `)
  }),

  rejected: (d) => ({
    subject: '[Lembur] ❌ Pengajuan ditolak',
    html: wrap('❌ Pengajuan Ditolak', '#ef4444,#dc2626', `
      <p style="margin:0 0 16px">Pengajuan lembur Anda <strong>ditolak</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row('Tanggal', d.date)}
        ${row('Jam', d.startTime)}
      </table>
      <div style="background:#fee2e2;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b"><strong>Alasan:</strong> ${d.note}</p>
      </div>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#6366f1' }
      ])}
    `)
  }),

  revision: (d) => ({
    subject: '[Lembur] ✏️ Revisi pengajuan diminta',
    html: wrap('✏️ Revisi Diperlukan', '#f59e0b,#d97706', `
      <p style="margin:0 0 16px">Atasan meminta <strong>revisi</strong> untuk pengajuan lembur Anda.</p>
      <div style="background:#fef3c7;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#92400e"><strong>Catatan:</strong> ${d.note}</p>
      </div>
      ${btnGroup([
        { text: '✏️ Revisi Sekarang', url: APP_URL + '/employee.html', color: '#d97706' }
      ])}
    `)
  }),

  proofSubmitted: (d) => ({
    subject: `[Lembur] 🔍 Bukti dari ${d.employeeName} perlu verifikasi`,
    html: wrap('🔍 Bukti Hasil Kerja', '#f97316,#ea580c', `
      <p style="margin:0 0 16px">Karyawan telah selesai lembur dan mengunggah bukti:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row('Karyawan', d.employeeName)}
        ${row('Durasi Aktual', d.duration)}
      </table>
      <p style="margin:0 0 16px">Silakan verifikasi hasil kerja di sistem.</p>
      ${btnGroup([
        { text: '🔍 Verifikasi Sekarang', url: APP_URL + '/manager.html', color: '#ea580c' }
      ])}
    `)
  }),

  verifyApproved: (d) => ({
    subject: '[Lembur] ⭐ Hasil kerja disetujui',
    html: wrap('⭐ Hasil Kerja Disetujui', '#10b981,#059669', `
      <p style="margin:0 0 16px">Hasil lembur Anda telah <strong>diverifikasi dan disetujui</strong>.</p>
      <div style="background:#d1fae5;padding:16px;border-radius:12px;margin:16px 0;text-align:center">
        <p style="font-size:32px;margin:0">${'★'.repeat(d.rating)}${'☆'.repeat(5 - d.rating)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#065f46">Rating: ${d.rating}/5</p>
      </div>
      <p style="margin:0 0 16px">Lembur Anda akan masuk ke perhitungan penggajian.</p>
      ${btnGroup([
        { text: '📱 Lihat Riwayat', url: APP_URL + '/employee.html', color: '#10b981' }
      ])}
    `)
  }),

  proofRevision: (d) => ({
    subject: '[Lembur] 📎 Revisi bukti hasil kerja',
    html: wrap('📎 Revisi Bukti', '#f59e0b,#d97706', `
      <p style="margin:0 0 16px">Atasan meminta <strong>revisi bukti</strong> hasil kerja Anda.</p>
      <div style="background:#fef3c7;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#92400e"><strong>Catatan:</strong> ${d.note}</p>
      </div>
      ${btnGroup([
        { text: '📎 Upload Ulang', url: APP_URL + '/employee.html', color: '#d97706' }
      ])}
    `)
  }),

  verifyRejected: (d) => ({
    subject: '[Lembur] ❌ Hasil kerja ditolak',
    html: wrap('❌ Hasil Ditolak', '#ef4444,#dc2626', `
      <p style="margin:0 0 16px">Hasil kerja lembur Anda <strong>ditolak</strong>. Lembur tidak akan dihitung.</p>
      <div style="background:#fee2e2;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b"><strong>Alasan:</strong> ${d.note}</p>
      </div>
      ${btnGroup([
        { text: '📱 Buka Sistem', url: APP_URL + '/employee.html', color: '#6366f1' }
      ])}
    `)
  })
};
