import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

console.log('📧 Mailer config:', {
  user: process.env.GMAIL_USER ? '✓ set' : '✗ MISSING',
  pass: process.env.GMAIL_APP_PASSWORD ? '✓ set' : '✗ MISSING'
});

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// Verify saat startup
transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP GAGAL:', err.message);
    console.error('   Cek: GMAIL_USER, GMAIL_APP_PASSWORD di Render Environment');
  } else {
    console.log('✅ SMTP siap kirim email');
  }
});

export async function sendEmail({ to, subject, html }) {
  if (!to) {
    console.warn('⚠️ sendEmail: alamat email kosong, skip');
    return { success: false, error: 'no recipient' };
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('⚠️ sendEmail: Gmail credentials tidak di-set, skip');
    return { success: false, error: 'no credentials' };
  }

  try {
    console.log(`📧 Mengirim email ke ${to}...`);
    const info = await transporter.sendMail({
      from: `"Sistem Lembur Cimory" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log(`✅ Email terkirim ke ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Email GAGAL ke ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

const wrap = (title, color, content) => `
  <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:600px;margin:auto;background:#f7f7fb;padding:20px">
    <div style="background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,${color});padding:24px;color:white">
        <h2 style="margin:0;font-size:20px">${title}</h2>
        <p style="margin:4px 0 0;opacity:0.9;font-size:12px">Sistem Monitoring Lembur Cimory</p>
      </div>
      <div style="padding:24px;color:#1e293b;font-size:14px;line-height:1.6">
        ${content}
      </div>
      <div style="background:#f8fafc;padding:16px;text-align:center;font-size:11px;color:#94a3b8">
        Email otomatis dari Sistem Monitoring Lembur · Jangan balas email ini
      </div>
    </div>
  </div>
`;

export const templates = {
  newRequest: (d) => ({
    subject: `[Lembur] Pengajuan baru dari ${d.employeeName}`,
    html: wrap('📋 Pengajuan Lembur Baru', '#6366f1,#8b5cf6', `
      <p>Ada pengajuan lembur baru yang perlu direview:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Karyawan</td><td style="padding:8px;font-weight:bold">${d.employeeName}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Tanggal</td><td style="padding:8px">${d.date}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Jam Mulai</td><td style="padding:8px">${d.startTime}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Durasi</td><td style="padding:8px">${d.duration} jam</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Kategori</td><td style="padding:8px">${d.reason}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Rencana</td><td style="padding:8px">${d.desc}</td></tr>
      </table>
      <p>Silakan buka sistem untuk review.</p>
    `)
  }),

  approved: (d) => ({
    subject: '[Lembur] ✅ Pengajuan disetujui',
    html: wrap('✅ Pengajuan Disetujui', '#10b981,#059669', `
      <p>Pengajuan lembur Anda telah <strong>disetujui</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Tanggal</td><td style="padding:8px;font-weight:bold">${d.date}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Jam Mulai</td><td style="padding:8px">${d.startTime}</td></tr>
      </table>
      <p>Timer akan otomatis berjalan saat jam yang ditentukan tiba.</p>
    `)
  }),

  rejected: (d) => ({
    subject: '[Lembur] ❌ Pengajuan ditolak',
    html: wrap('❌ Pengajuan Ditolak', '#ef4444,#dc2626', `
      <p>Pengajuan lembur Anda <strong>ditolak</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Tanggal</td><td style="padding:8px">${d.date}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Jam</td><td style="padding:8px">${d.startTime}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Alasan</td><td style="padding:8px;color:#dc2626">${d.note}</td></tr>
      </table>
    `)
  }),

  revision: (d) => ({
    subject: '[Lembur] ✏️ Revisi pengajuan diminta',
    html: wrap('✏️ Revisi Diperlukan', '#f59e0b,#d97706', `
      <p>Atasan meminta <strong>revisi</strong> untuk pengajuan lembur Anda.</p>
      <div style="background:#fef3c7;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#92400e"><strong>Catatan:</strong> ${d.note}</p>
      </div>
      <p>Silakan login dan perbaiki pengajuan.</p>
    `)
  }),

  proofSubmitted: (d) => ({
    subject: `[Lembur] 🔍 Bukti dari ${d.employeeName} perlu verifikasi`,
    html: wrap('🔍 Bukti Hasil Kerja', '#f97316,#ea580c', `
      <p>Karyawan telah selesai lembur dan mengunggah bukti:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Karyawan</td><td style="padding:8px;font-weight:bold">${d.employeeName}</td></tr>
        <tr><td style="padding:8px;color:#64748b;font-size:12px">Durasi Aktual</td><td style="padding:8px">${d.duration}</td></tr>
      </table>
      <p>Silakan verifikasi hasil kerja di sistem.</p>
    `)
  }),

  verifyApproved: (d) => ({
    subject: '[Lembur] ⭐ Hasil kerja disetujui',
    html: wrap('⭐ Hasil Kerja Disetujui', '#10b981,#059669', `
      <p>Hasil lembur Anda telah <strong>diverifikasi dan disetujui</strong>.</p>
      <div style="background:#d1fae5;padding:16px;border-radius:12px;margin:16px 0;text-align:center">
        <p style="font-size:32px;margin:0">${'★'.repeat(d.rating)}${'☆'.repeat(5 - d.rating)}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#065f46">Rating: ${d.rating}/5</p>
      </div>
      <p>Lembur Anda akan masuk ke perhitungan penggajian.</p>
    `)
  }),

  proofRevision: (d) => ({
    subject: '[Lembur] 📎 Revisi bukti hasil kerja',
    html: wrap('📎 Revisi Bukti', '#f59e0b,#d97706', `
      <p>Atasan meminta <strong>revisi bukti</strong> hasil kerja Anda.</p>
      <div style="background:#fef3c7;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#92400e"><strong>Catatan:</strong> ${d.note}</p>
      </div>
    `)
  }),

  verifyRejected: (d) => ({
    subject: '[Lembur] ❌ Hasil kerja ditolak',
    html: wrap('❌ Hasil Ditolak', '#ef4444,#dc2626', `
      <p>Hasil kerja lembur Anda <strong>ditolak</strong>. Lembur tidak akan dihitung.</p>
      <div style="background:#fee2e2;padding:12px;border-radius:12px;margin:16px 0">
        <p style="margin:0;color:#991b1b"><strong>Alasan:</strong> ${d.note}</p>
      </div>
    `)
  })
};
