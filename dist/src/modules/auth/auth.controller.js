import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../config/db.js';
import { sendVerificationEmail } from '../../config/mail.js';
// Helper membuat OTP acak 6 digit angka
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
export const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
            return;
        }
        // 1. Cek apakah email sudah terdaftar
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });
        if (existingUser) {
            if (existingUser.isVerified) {
                res.status(409).json({ error: 'Email sudah terdaftar dan terverifikasi. Silakan langsung login.' });
                return;
            }
            else {
                // Jika akun pernah didaftarkan tapi belum diverifikasi, kirim ulang OTP baru
                const otpCode = generateOTP();
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 menit
                await prisma.emailVerification.deleteMany({ where: { userId: existingUser.id } });
                await prisma.emailVerification.create({
                    data: {
                        userId: existingUser.id,
                        code: otpCode,
                        expiresAt,
                    },
                });
                await sendVerificationEmail(existingUser.email, otpCode);
                res.status(200).json({
                    message: 'Akun sudah pernah didaftarkan namun belum diverifikasi. Kode verifikasi baru telah dikirimkan ke email Anda.',
                    userId: existingUser.id,
                });
                return;
            }
        }
        // 2. Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        // 3. Buat User baru (isVerified default false)
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash,
                isVerified: false,
                // Otomatis buatkan pos Dana Darurat
                pockets: {
                    create: {
                        name: 'Dana Darurat',
                        isEmergency: true,
                        currentAmount: 0.0,
                    },
                },
            },
        });
        // 4. Generate kode OTP 6 digit
        const otpCode = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Kadaluarsa dalam 10 menit
        await prisma.emailVerification.create({
            data: {
                userId: newUser.id,
                code: otpCode,
                expiresAt,
            },
        });
        // 5. Kirim email OTP
        await sendVerificationEmail(newUser.email, otpCode);
        res.status(201).json({
            message: 'Registrasi berhasil. Silakan cek email Anda untuk memasukkan kode verifikasi 6 digit.',
            userId: newUser.id,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Terjadi kesalahan saat registrasi', detail: error });
    }
};
// Endpoint: Verifikasi Kode OTP
export const verifyEmail = async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            res.status(400).json({ error: 'Email dan kode verifikasi wajib diisi' });
            return;
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(404).json({ error: 'Akun dengan email ini tidak ditemukan' });
            return;
        }
        if (user.isVerified) {
            res.status(400).json({ message: 'Akun sudah diverifikasi sebelumnya. Silakan login.' });
            return;
        }
        // Cari kode OTP yang valid
        const verification = await prisma.emailVerification.findFirst({
            where: {
                userId: user.id,
                code,
            },
            orderBy: { createdAt: 'desc' },
        });
        if (!verification) {
            res.status(400).json({ error: 'Kode verifikasi salah' });
            return;
        }
        // Cek apakah kode sudah kadaluarsa
        if (new Date() > verification.expiresAt) {
            res.status(400).json({ error: 'Kode verifikasi sudah kadaluarsa. Silakan minta kode baru.' });
            return;
        }
        // Update status user menjadi terverifikasi
        await prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true },
        });
        // Hapus kode OTP yang sudah terpakai
        await prisma.emailVerification.deleteMany({ where: { userId: user.id } });
        res.json({ message: 'Email berhasil diverifikasi! Anda sekarang dapat login.' });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal memverifikasi kode', detail: error });
    }
};
// Endpoint Login: Wajib Cek isVerified
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email dan password wajib diisi' });
            return;
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(401).json({ error: 'Email atau password salah' });
            return;
        }
        // Cegah login jika belum diverifikasi
        if (!user.isVerified) {
            res.status(403).json({
                error: 'Email Anda belum diverifikasi. Silakan masukkan kode verifikasi yang telah dikirim ke email Anda terlebih dahulu.',
                isVerified: false,
            });
            return;
        }
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            res.status(401).json({ error: 'Email atau password salah' });
            return;
        }
        const secret = process.env.JWT_SECRET || 'fallback_secret_key';
        const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '7d' });
        res.json({
            message: 'Login berhasil',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Terjadi kesalahan saat login', detail: error });
    }
};
//# sourceMappingURL=auth.controller.js.map