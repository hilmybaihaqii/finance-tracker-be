import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();
// Transporter email SMTP
export const mailTransporter = nodemailer.createTransport({
    service: 'gmail', // atau konfigurasi host/port SMTP lain
    auth: {
        user: process.env.EMAIL_USER, // Alamat Gmail pengirim
        pass: process.env.EMAIL_PASS, // 16 digit App Password dari Google Account
    },
});
export const sendVerificationEmail = async (toEmail, code) => {
    // Jika konfigurasi email belum diisi, kita tampilkan OTP di konsol untuk mempermudah dev lokal
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`\n======================================================`);
        console.log(`[MOCK EMAIL] Dikirim ke: ${toEmail}`);
        console.log(`[MOCK EMAIL] Kode Verifikasi OTP Anda: ${code}`);
        console.log(`======================================================\n`);
        return;
    }
    const mailOptions = {
        from: `"Finance Tracker Security" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `Kode Verifikasi Akun: ${code}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e293b; text-align: center;">Verifikasi Alamat Email Anda</h2>
        <p style="color: #475569; font-size: 14px;">Terima kasih telah mendaftar di Finance Tracker. Masukkan kode 6 digit di bawah ini untuk mengonfirmasi email Anda:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb; background: #eff6ff; padding: 10px 24px; border-radius: 6px; display: inline-block;">
            ${code}
          </span>
        </div>
        <p style="color: #64748b; font-size: 12px; text-align: center;">Kode ini hanya berlaku selama 10 menit. Jika Anda tidak merasa mendaftar akun ini, abaikan saja email ini.</p>
      </div>
    `,
    };
    await mailTransporter.sendMail(mailOptions);
};
//# sourceMappingURL=mail.js.map