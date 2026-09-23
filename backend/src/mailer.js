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
  sender: SENDER_EMAIL
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
      htmlContent: html
    });
    console.log(`✅ [OK] ${to} | ID: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`❌ [FAIL] ${to} | ${error.message}`);
    return { success: false, error: error.message };
  }
}

const row = (label, value) => `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;width:120px;vertical-align:top">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;font-weight:500">${value}</td>
  </tr>
`;

const button = (text, url, color) => `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0">
    <tr>
      <td style="border-radius:12px;background:${color}">
        <a href="${url}" target="_blank" style="display:inline-block;padding:12px 24px;color:white;text-decoration:none;font-weight:600;font-size:14px;border-radius:12px">${text}</a>
      </td>
    </tr>
  </table>
`;

const wrap = (title, emoji, color, content) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08)">
          <!-- Header -->
          <tr>
            <td style="background:${color};padding:28px 32px;color:white">
              <p style="margin:0;font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:0.85">Sistem Lembur Cimory</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:-0.3px">${emoji} ${title}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5">
                Email otomatis dari Sistem Monitoring Lembur<br>
                Jangan balas email ini
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const templates = {
  newRequest: (d) => ({
    subject: `[Lembur] Pengajuan baru dari ${d.employeeName}`,
    html: wrap('Pengajuan Lembur Baru', '📋', 'linear-gradient(135deg,#6366f1,#8b5cf6)', `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
        Ada pengajuan lembur baru yang perlu direview:
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:8px">
        ${row('Karyawan', d.employeeName)}
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
        ${row('Durasi', d.duration + ' jam')}
        ${row('Kategori', d.reason)}
        ${row('Rencana', d.desc)}
      </table>
      ${button('Buka Sistem →', APP_URL + '/manager.html', '#6366f1')}
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5">
        Login ke sistem untuk menyetujui atau menolak pengajuan ini.
      </p>
    `)
  }),

  approved: (d) => ({
    subject: '[Lembur] ✅ Pengajuan disetujui',
    html: wrap('Pengajuan Disetujui', '✅', 'linear-gradient(135deg,#10b981,#059669)', `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
        Pengajuan lembur Anda telah <strong style="color:#059669">disetujui</strong>.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${row('Tanggal', d.date)}
        ${row('Jam Mulai', d.startTime)}
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6">
        Timer akan otomatis berjalan saat jam yang ditentukan tiba. Jangan lupa buka sistem tepat waktu.
      </p>
    `)
  }),

  rejected: (d) => ({
    subject: '[Lembur] ❌ Pengajuan ditolak',
    html: wrap('Pengajuan Ditolak', '❌', 'linear-gradient(135deg,#ef4444,#dc2626)', `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
        Pengajuan lembur Anda <strong style="color:#dc2626">ditolak</strong>.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${row('Tanggal', d.date)}
        ${row('Jam', d.startTime)}
      </table>
      <div style="margin-top:20px;padding:16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:8px">
        <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6"><strong>Alasan:</strong> ${d.note}</p>
      </div>
    `)
  }),

  revision: (d) => ({
    subject: '[Lembur] ✏️ Revisi pengajuan diminta',
    html: wrap('Revisi Diperlukan', '✏️', 'linear-gradient(135deg,#f59e0b,#d97706)', `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
        Atasan meminta <strong style="color:#d97706">revisi</strong> untuk pengajuan lembur Anda.
      </p>
      <div style="padding:16px;background:#fffbeb;border-left:4px solid #d97706;border-radius:8px">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6"><strong>Catatan:</strong> ${d.note}</p>
      </div>
      ${button('Revisi Sekarang →', APP_URL + '/employee.html', '#d97706')}
    `)
  }),

  proofSubmitted: (d) => ({
    subject: `[Lembur] 🔍 Bukti dari ${d.employeeName} perlu verifikasi`,
    html: wrap('Bukti Hasil Kerja', '🔍', 'linear-gradient(135deg,#f97316,#ea580c)', `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
        Karyawan telah selesai lembur dan mengunggah bukti:
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${row('Karyawan', d.employeeName)}
        ${row('Durasi Aktual', d.duration)}
      </table>
      ${button('Verifikasi Sekarang →', APP_URL + '/manager.html', '#ea580c')}
    `)
  }),

  verifyApproved: (d) => ({
    subject: '[Lembur] ⭐ Hasil kerja disetujui',
    html: wrap('Hasil Kerja Disetujui', '⭐', 'linear-gradient(135deg,#10b981,#059669)', `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
        Hasil lembur Anda telah <strong style="color:#059669">diverifikasi dan disetujui</strong>.
      </p>
      <div style="margin:20px 0;padding:20px;background:#ecfdf5;border-radius:12px;text-align:center">
        <p style="margin:0;font-size:36px;letter-spacing:4px">${'★'.repeat(d.rating)}${'☆'.repeat(5 - d.rating)}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#065f46;font-weight:600">Rating: ${d.rating}/5</p>
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6">
        Lembur Anda akan masuk ke perhitungan penggajian.
      </p>
    `)
  }),

  proofRevision: (d) => ({
    subject: '[Lembur] 📎 Revisi bukti hasil kerja',
    html: wrap('Revisi Bukti', '📎', 'linear-gradient(135deg,#f59e0b,#d97706)', `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
        Atasan meminta <strong style="color:#d97706">revisi bukti</strong> hasil kerja Anda.
      </p>
      <div style="padding:16px;background:#fffbeb;border-left:4px solid #d97706;border-radius:8px">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6"><strong>Catatan:</strong> ${d.note}</p>
      </div>
      ${button('Upload Ulang →', APP_URL + '/employee.html', '#d97706')}
    `)
  }),

  verifyRejected: (d) => ({
    subject: '[Lembur] ❌ Hasil kerja ditolak',
    html: wrap('Hasil Ditolak', '❌', 'linear-gradient(135deg,#ef4444,#dc2626)', `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
        Hasil kerja lembur Anda <strong style="color:#dc2626">ditolak</strong>.
      </p>
      <div style="padding:16px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:8px">
        <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6"><strong>Alasan:</strong> ${d.note}</p>
      </div>
    `)
  })
};
