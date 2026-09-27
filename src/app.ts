import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './config/db.js';
import authRoutes from './modules/auth/auth.routes.js';
import walletRoutes from './modules/wallets/wallets.routes.js';
import pocketRoutes from './modules/pockets/pockets.routes.js';
import transactionRoutes from './modules/transactions/transactions.routes.js';
import categoryRoutes from './modules/categories/categories.routes.js';
import { authenticateToken, AuthRequest } from './middlewares/auth.middleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/finance', walletRoutes);
app.use('/api/pockets', pocketRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/categories', categoryRoutes);

// Health Check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'success',
      message: 'Server dan Database PostgreSQL berjalan normal!',
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database tidak dapat diakses',
      error,
    });
  }
});

// Profile Endpoint
app.get('/api/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        pockets: true,
      },
    });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data profil' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});