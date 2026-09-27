import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware.js';
import prisma from '../../config/db.js';

// 1. Ambil semua pos tabungan & dana darurat milik user
export const getPockets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const pockets = await prisma.pocket.findMany({
      where: { userId },
      orderBy: [{ isEmergency: 'desc' }, { createdAt: 'asc' }],
    });

    // Tambahkan kalkulasi persentase pencapaian (progress %)
    const pocketsWithProgress = pockets.map((p) => {
      const current = Number(p.currentAmount);
      const target = p.targetAmount ? Number(p.targetAmount) : null;
      const progress = target && target > 0 ? Math.min(Math.round((current / target) * 100), 100) : null;

      return {
        ...p,
        progressPercentage: progress,
      };
    });

    const emergencyFunds = pocketsWithProgress.filter((p) => p.isEmergency);
    const regularSavings = pocketsWithProgress.filter((p) => !p.isEmergency);

    res.json({
      emergencyFunds,
      regularSavings,
      totalPockets: pockets.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil pos tabungan', detail: error });
  }
};

// 2. Tambah pos tabungan / kantong dana darurat baru
export const createPocket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, targetAmount, isEmergency } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Nama pos tabungan wajib diisi' });
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

// 3. Update target atau nama pos tabungan
export const updatePocket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string; // <-- Berikan type assertion 'as string'
    const { name, targetAmount } = req.body;

    const existingPocket = await prisma.pocket.findFirst({
      where: { id, userId },
    });

    if (!existingPocket) {
      res.status(404).json({ error: 'Pos tabungan tidak ditemukan' });
      return;
    }

    const updated = await prisma.pocket.update({
      where: { id },
      data: {
        name: name || existingPocket.name,
        targetAmount: targetAmount !== undefined ? (targetAmount ? Number(targetAmount) : null) : existingPocket.targetAmount,
      },
    });

    res.json({ message: 'Pos tabungan berhasil diperbarui', pocket: updated });
  } catch (error) {
    res.status(500).json({ error: 'Gagal memperbarui pos tabungan', detail: error });
  }
};

// 4. Hapus pos tabungan (Hanya bisa dihapus jika saldo sudah 0)
export const deletePocket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string; // <-- Berikan type assertion 'as string'

    const existingPocket = await prisma.pocket.findFirst({
      where: { id, userId },
    });

    if (!existingPocket) {
      res.status(404).json({ error: 'Pos tabungan tidak ditemukan' });
      return;
    }

    if (Number(existingPocket.currentAmount) > 0) {
      res.status(400).json({
        error: `Pos tabungan masih memiliki saldo Rp ${existingPocket.currentAmount}. Tarik saldo ke dompet terlebih dahulu sebelum menghapus.`,
      });
      return;
    }

    await prisma.pocket.delete({
      where: { id },
    });

    res.json({ message: 'Pos tabungan berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus pos tabungan', detail: error });
  }
};