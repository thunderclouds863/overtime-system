import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

transporter.verify((err) => {
  if (err) console.error('❌ SMTP gagal:', err.message);
  else console.log('✅ SMTP siap');
});

export async function sendEmail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"Sistem Lembur" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log('✅ Email terkirim:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('❌ Email gagal:', error.message);
    return { success: false, error: error.message };
  }
}

export const templates = {
  newRequest: (d) => ({
    subject: `[Lembur] Pengajuan baru dari ${d.employeeName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#2563eb">Pengajuan Lembur Baru</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;color:#666">Karyawan</td><td style="padding:8px;font-weight:bold">${d.employeeName}</td></tr>
          <tr><td style="padding:8px;color:#666">Tanggal</td><td style="padding:8px">${d.date}</td></tr>
          <tr><td style="padding:8px;color:#666">Jam Mulai</td><td style="padding:8px">${d.startTime}</td></tr>
          <tr><td style="padding:8px;color:#666">Durasi</td><td style="padding:8px">${d.duration} jam</td></tr>
          <tr><td style="padding:8px;color:#666">Kategori</td><td style="padding:8px">${d.reason}</td></tr>
          <tr><td style="padding:8px;color:#666">Rencana</td><td style="padding:8px">${d.desc}</td></tr>
        </table>
        <p style="margin-top:20px">Silakan review di sistem.</p>
      </div>
    `
  }),
  approved: (d) => ({
    subject: '[Lembur] Pengajuan disetujui',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#059669">✓ Pengajuan Disetujui</h2>
        <p>Lembur Anda pada <strong>${d.date} jam ${d.startTime}</strong> telah disetujui.</p>
        <p>Timer akan otomatis berjalan pada jam yang ditentukan.</p>
      </div>
    `
  }),
  rejected: (d) => ({
    subject: '[Lembur] Pengajuan ditolak',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#dc2626">Pengajuan Ditolak</h2>
        <p>Lembur Anda pada <strong>${d.date} jam ${d.startTime}</strong> ditolak.</p>
        <p><strong>Alasan:</strong> ${d.note}</p>
      </div>
    `
  }),
  revision: (d) => ({
    subject: '[Lembur] Revisi pengajuan diminta',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#d97706">Revisi Diperlukan</h2>
        <p>Atasan meminta revisi untuk pengajuan lembur Anda.</p>
        <p><strong>Catatan:</strong> ${d.note}</p>
      </div>
    `
  }),
  proofSubmitted: (d) => ({
    subject: `[Lembur] Bukti dari ${d.employeeName} perlu verifikasi`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#ea580c">Bukti Hasil Kerja Terkirim</h2>
        <p><strong>Karyawan:</strong> ${d.employeeName}</p>
        <p><strong>Durasi aktual:</strong> ${d.duration}</p>
        <p>Silakan verifikasi hasil kerja di sistem.</p>
      </div>
    `
  }),
  verifyApproved: (d) => ({
    subject: '[Lembur] Hasil kerja disetujui',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#059669">✓ Hasil Kerja Disetujui</h2>
        <p>Lembur Anda telah diverifikasi dan akan dihitung.</p>
        <p><strong>Rating:</strong> ${'★'.repeat(d.rating)}${'☆'.repeat(5 - d.rating)}</p>
      </div>
    `
  }),
  proofRevision: (d) => ({
    subject: '[Lembur] Revisi bukti hasil kerja',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#d97706">Revisi Bukti Diminta</h2>
        <p>Atasan meminta revisi bukti hasil kerja Anda.</p>
        <p><strong>Catatan:</strong> ${d.note}</p>
      </div>
    `
  }),
  verifyRejected: (d) => ({
    subject: '[Lembur] Hasil kerja ditolak',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#dc2626">Hasil Kerja Ditolak</h2>
        <p>Hasil kerja lembur Anda ditolak. Lembur tidak akan dihitung.</p>
        <p><strong>Alasan:</strong> ${d.note}</p>
      </div>
    `
  })
};