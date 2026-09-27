import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper kirim email OTP
export const sendVerificationEmail = async (toEmail: string, code: string, subjectTitle: string = 'Verifikasi Akun'): Promise<void> => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`\n======================================================`);
    console.log(`[MOCK EMAIL] Dikirim ke: ${toEmail}`);
    console.log(`[MOCK EMAIL] Subjek: ${subjectTitle}`);
    console.log(`[MOCK EMAIL] Kode OTP: ${code}`);
    console.log(`======================================================\n`);
    return;
  }

  const mailOptions = {
    from: `"Finance Tracker Security" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `${subjectTitle} - Kode OTP: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0f172a; text-align: center; margin-bottom: 8px;">${subjectTitle}</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.5; text-align: center;">Gunakan kode verifikasi berikut untuk melanjutkan proses:</p>
        <div style="text-align: center; margin: 28px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2563eb; background: #eff6ff; padding: 12px 28px; border-radius: 8px; display: inline-block;">
            ${code}
          </span>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">Kode ini kedaluwarsa dalam 10 menit. Jangan berikan kode ini kepada siapapun.</p>
      </div>
    `,
  };

  await mailTransporter.sendMail(mailOptions);
};

// Helper kirim email Reset Password dengan Link Redirect Frontend
export const sendForgotPasswordEmail = async (toEmail: string, resetToken: string): Promise<void> => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(toEmail)}`;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`\n======================================================`);
    console.log(`[MOCK EMAIL] Forgot Password Link ke: ${toEmail}`);
    console.log(`[MOCK EMAIL] Link Reset: ${resetLink}`);
    console.log(`[MOCK EMAIL] Reset Token / OTP: ${resetToken}`);
    console.log(`======================================================\n`);
    return;
  }

  const mailOptions = {
    from: `"Finance Tracker Security" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Permintaan Reset Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #0f172a; text-align: center;">Reset Password Akun</h2>
        <p style="color: #475569; font-size: 14px;">Kami menerima permintaan untuk mereset kata sandi akun Finance Tracker Anda. Klik tombol di bawah untuk memasukkan kata sandi baru:</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Reset Password Saya
          </a>
        </div>
        <p style="color: #64748b; font-size: 12px;">Atau masukkan kode token ini secara manual: <b>${resetToken}</b></p>
        <p style="color: #94a3b8; font-size: 12px;">Tautan ini berlaku selama 15 menit. Jika Anda tidak meminta reset, abaikan email ini.</p>
      </div>
    `,
  };

  await mailTransporter.sendMail(mailOptions);
};