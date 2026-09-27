import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../config/db.js';
import { AuthRequest } from '../../middlewares/auth.middleware.js';
import { sendVerificationEmail, sendForgotPasswordEmail } from '../../config/mail.js';

// Helper membuat kode OTP acak 6 digit angka
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// 1. Registrasi Pengguna Baru
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Cek apakah email sudah pernah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      if (existingUser.isVerified) {
        res.status(409).json({ 
          error: 'Email sudah terdaftar dan terverifikasi. Silakan langsung login.' 
        });
        return;
      }

      // Jika akun sudah terdaftar tapi belum verifikasi, kirim ulang OTP
      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

      await prisma.emailVerification.deleteMany({
        where: { userId: existingUser.id },
      });

      await prisma.emailVerification.create({
        data: {
          userId: existingUser.id,
          code: otpCode,
          expiresAt,
        },
      });

      sendVerificationEmail(existingUser.email, otpCode, 'Verifikasi Akun Finance Tracker').catch((err) => {
        console.error('Email error:', err);
      });

      res.status(200).json({
        message: 'Akun sudah pernah didaftarkan namun belum diverifikasi. Kode OTP baru telah dikirimkan ke email Anda.',
        userId: existingUser.id,
      });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Buat User Baru
    const newUser = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        isVerified: false,
      },
    });

    // Inisialisasi Pos Awal "Dana Darurat"
    try {
      await prisma.pocket.create({
        data: {
          userId: newUser.id,
          name: 'Dana Darurat',
          targetAmount: 0,
          currentAmount: 0,
        },
      });
    } catch (pocketError) {
      console.warn('Pocket creation skipped:', pocketError);
    }

    // Buat OTP verifikasi pendaftaran 6 digit
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

    await prisma.emailVerification.create({
      data: {
        userId: newUser.id,
        code: otpCode,
        expiresAt,
      },
    });

    // Kirim email OTP
    sendVerificationEmail(newUser.email, otpCode, 'Verifikasi Akun Finance Tracker').catch((err) => {
      console.error('Email error:', err);
    });

    res.status(201).json({
      message: 'Registrasi berhasil. Silakan cek email Anda untuk memasukkan kode verifikasi 6 digit.',
      userId: newUser.id,
    });
  } catch (error: any) {
    console.error('Critical Register Error:', error);
    res.status(500).json({ 
      error: 'Terjadi kesalahan saat registrasi', 
      detail: error?.message || error 
    });
  }
};

// 2. Verifikasi Kode OTP Pendaftaran
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      res.status(400).json({ error: 'Email dan kode verifikasi wajib diisi' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      res.status(404).json({ error: 'Akun dengan email ini tidak ditemukan' });
      return;
    }

    if (user.isVerified) {
      res.status(400).json({ message: 'Akun sudah diverifikasi sebelumnya. Silakan login.' });
      return;
    }

    const verification = await prisma.emailVerification.findFirst({
      where: {
        userId: user.id,
        code: code.trim(),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      res.status(400).json({ error: 'Kode verifikasi salah' });
      return;
    }

    if (new Date() > verification.expiresAt) {
      res.status(400).json({ error: 'Kode verifikasi sudah kedaluwarsa. Silakan minta kode baru.' });
      return;
    }

    // Aktifkan akun
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    // Hapus kode OTP yang sudah selesai dipakai
    await prisma.emailVerification.deleteMany({
      where: { userId: user.id },
    });

    res.json({ message: 'Email berhasil diverifikasi! Anda sekarang dapat login.' });
  } catch (error: any) {
    console.error('Verify Email Error:', error);
    res.status(500).json({ error: 'Gagal memverifikasi kode', detail: error?.message || error });
  }
};

// 3. Login Pengguna
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email dan password wajib diisi' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      res.status(401).json({ error: 'Email atau kata sandi salah' });
      return;
    }

    if (!user.isVerified) {
      res.status(403).json({
        error: 'Email Anda belum diverifikasi. Silakan masukkan kode verifikasi OTP.',
        isVerified: false,
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Email atau kata sandi salah' });
      return;
    }

    const secret = process.env.JWT_SECRET || 'fallback_secret_key';
    const token = jwt.sign(
      { id: user.id, email: user.email },
      secret,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Terjadi kesalahan saat login', detail: error?.message || error });
  }
};

// 4. Request OTP untuk Ganti Password
export const requestChangePasswordOTP = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      return;
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit

    await prisma.emailVerification.deleteMany({
      where: { userId },
    });

    await prisma.emailVerification.create({
      data: {
        userId,
        code: otpCode,
        expiresAt,
      },
    });

    sendVerificationEmail(user.email, otpCode, 'Permintaan Ganti Password').catch((err) => {
      console.error('Change password email error:', err);
    });

    res.json({ message: 'Kode OTP untuk ganti password telah dikirim ke email Anda' });
  } catch (error: any) {
    console.error('Request Change Password OTP Error:', error);
    res.status(500).json({ error: 'Gagal mengirim OTP ganti password', detail: error?.message || error });
  }
};

// 5. Eksekusi Ganti Password
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { oldPassword, newPassword, otpCode } = req.body;

    if (!oldPassword || !newPassword || !otpCode) {
      res.status(400).json({ error: 'Password lama, password baru, dan kode OTP wajib diisi' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      return;
    }

    const isOldPasswordMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isOldPasswordMatch) {
      res.status(400).json({ error: 'Password lama Anda tidak sesuai' });
      return;
    }

    const validOTP = await prisma.emailVerification.findFirst({
      where: {
        userId,
        code: otpCode.trim(),
      },
    });

    if (!validOTP || new Date() > validOTP.expiresAt) {
      res.status(400).json({ error: 'Kode OTP tidak valid atau sudah kedaluwarsa' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await prisma.emailVerification.deleteMany({
      where: { userId },
    });

    res.json({ message: 'Kata sandi berhasil diperbarui' });
  } catch (error: any) {
    console.error('Change Password Error:', error);
    res.status(500).json({ error: 'Gagal mengganti kata sandi', detail: error?.message || error });
  }
};

// 6. Request Forgot Password
export const requestForgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email wajib diisi' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      res.json({ message: 'Jika email terdaftar, instruksi reset password telah dikirim ke email Anda.' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 menit

    await prisma.emailVerification.deleteMany({
      where: { userId: user.id },
    });

    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        code: resetToken,
        expiresAt,
      },
    });

    sendForgotPasswordEmail(user.email, resetToken).catch((err) => {
      console.error('Forgot password email error:', err);
    });

    res.json({ message: 'Jika email terdaftar, instruksi reset password telah dikirim ke email Anda.' });
  } catch (error: any) {
    console.error('Request Forgot Password Error:', error);
    res.status(500).json({ error: 'Gagal memproses permintaan reset password', detail: error?.message || error });
  }
};

// 7. Eksekusi Reset Password via Token
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      res.status(400).json({ error: 'Email, token verifikasi, dan kata sandi baru wajib diisi' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      res.status(400).json({ error: 'Permintaan reset password tidak valid' });
      return;
    }

    const validRecord = await prisma.emailVerification.findFirst({
      where: {
        userId: user.id,
        code: token.trim(),
      },
    });

    if (!validRecord || new Date() > validRecord.expiresAt) {
      res.status(400).json({ error: 'Token reset password tidak valid atau sudah kedaluwarsa' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    await prisma.emailVerification.deleteMany({
      where: { userId: user.id },
    });

    res.json({ message: 'Kata sandi berhasil direset! Silakan login dengan kata sandi baru Anda.' });
  } catch (error: any) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ error: 'Gagal mereset kata sandi', detail: error?.message || error });
  }
};

// 8. Delete Account Permanen
export const deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: 'Konfirmasi kata sandi wajib diisi untuk menghapus akun' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Kata sandi salah. Penghapusan akun dibatalkan.' });
      return;
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({ message: 'Akun Anda beserta seluruh data keuangan telah dihapus secara permanen.' });
  } catch (error: any) {
    console.error('Delete Account Error:', error);
    res.status(500).json({ error: 'Gagal menghapus akun', detail: error?.message || error });
  }
};