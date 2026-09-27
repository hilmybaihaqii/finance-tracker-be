import { Response } from 'express';

import { AuthRequest } from '../../middlewares/auth.middleware.js';
import prisma from '../../config/db.js';

// --- WALLET CONTROLLER ---

// Ambil semua dompet milik user yang sedang login
export const getWallets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const wallets = await prisma.wallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ wallets });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data dompet', detail: error });
  }
};

// Tambah dompet baru
export const createWallet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, balance } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Nama dompet wajib diisi' });
      return;
    }

    const wallet = await prisma.wallet.create({
      data: {
        userId,
        name,
        balance: balance ? Number(balance) : 0.0,
      },
    });

    res.status(201).json({ message: 'Dompet berhasil dibuat', wallet });
  } catch (error) {
    res.status(500).json({ error: 'Gagal membuat dompet', detail: error });
  }
};

// Update Dompet (Ganti nama)
export const updateWallet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const { name } = req.body;

    const existingWallet = await prisma.wallet.findFirst({
      where: { id, userId },
    });

    if (!existingWallet) {
      res.status(404).json({ error: 'Dompet tidak ditemukan' });
      return;
    }

    const updated = await prisma.wallet.update({
      where: { id },
      data: { name: name || existingWallet.name },
    });

    res.json({ message: 'Dompet berhasil diperbarui', wallet: updated });
  } catch (error) {
    res.status(500).json({ error: 'Gagal memperbarui dompet', detail: error });
  }
};

// Hapus Dompet (Hanya boleh dihapus jika saldo 0 dan tidak ada transaksi aktif)
export const deleteWallet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const existingWallet = await prisma.wallet.findFirst({
      where: { id, userId },
      include: { _count: { select: { transactions: true } } },
    });

    if (!existingWallet) {
      res.status(404).json({ error: 'Dompet tidak ditemukan' });
      return;
    }

    if (Number(existingWallet.balance) > 0) {
      res.status(400).json({
        error: `Dompet masih memiliki saldo Rp ${existingWallet.balance}. Pindahkan saldo terlebih dahulu sebelum menghapus.`,
      });
      return;
    }

    await prisma.wallet.delete({
      where: { id },
    });

    res.json({ message: 'Dompet berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus dompet', detail: error });
  }
};

// Ambil semua kantong (Dana Darurat & Goals)
export const getPockets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const pockets = await prisma.pocket.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    // Pisahkan Dana Darurat dengan Tabungan Biasa
    const emergencyFunds = pockets.filter((p) => p.isEmergency);
    const regularSavings = pockets.filter((p) => !p.isEmergency);

    res.json({
      emergencyFunds,
      regularSavings,
      allPockets: pockets,
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil pos tabungan', detail: error });
  }
};

// Tambah pos tabungan / goal baru
export const createPocket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, targetAmount, isEmergency } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Nama kantong/pos tabungan wajib diisi' });
      return;
    }

    const pocket = await prisma.pocket.create({
      data: {
        userId,
        name,
        targetAmount: targetAmount ? Number(targetAmount) : null,
        isEmergency: Boolean(isEmergency),
        currentAmount: 0.0,
      },
    });

    res.status(201).json({ message: 'Pos tabungan berhasil dibuat', pocket });
  } catch (error) {
    res.status(500).json({ error: 'Gagal membuat pos tabungan', detail: error });
  }
};

// Ringkasan Keuangan Lengkap untuk Dashboard
export const getFinancialOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const [wallets, pockets] = await Promise.all([
      prisma.wallet.findMany({ where: { userId } }),
      prisma.pocket.findMany({ where: { userId } }),
    ]);

    const totalLiquidCash = wallets.reduce((acc, curr) => acc + Number(curr.balance), 0);
    const emergencyFunds = pockets
      .filter((p) => p.isEmergency)
      .reduce((acc, curr) => acc + Number(curr.currentAmount), 0);
    const regularSavings = pockets
      .filter((p) => !p.isEmergency)
      .reduce((acc, curr) => acc + Number(curr.currentAmount), 0);

    res.json({
      overview: {
        totalLiquidCash,
        emergencyFunds,
        regularSavings,
        totalNetWorth: totalLiquidCash + emergencyFunds + regularSavings,
      },
      walletsCount: wallets.length,
      pocketsCount: pockets.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil ringkasan keuangan', detail: error });
  }
};

