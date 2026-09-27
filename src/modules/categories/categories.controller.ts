import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware.js';
import prisma from '../../config/db.js';

// Ambil Kategori Pengguna
export const getCategories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil kategori', detail: error });
  }
};

// Tambah Kategori Baru
export const createCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, type } = req.body; // type: "INCOME" atau "EXPENSE"

    if (!name || !type) {
      res.status(400).json({ error: 'Nama dan tipe kategori (INCOME/EXPENSE) wajib diisi' });
      return;
    }

    const category = await prisma.category.create({
      data: { userId, name, type },
    });

    res.status(201).json({ message: 'Kategori berhasil dibuat', category });
  } catch (error) {
    res.status(500).json({ error: 'Gagal membuat kategori', detail: error });
  }
};

// Update Kategori
export const updateCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const { name } = req.body;

    const existingCategory = await prisma.category.findFirst({
      where: { id, userId },
    });

    if (!existingCategory) {
      res.status(404).json({ error: 'Kategori tidak ditemukan' });
      return;
    }

    const updated = await prisma.category.update({
      where: { id },
      data: { name: name || existingCategory.name },
    });

    res.json({ message: 'Kategori berhasil diperbarui', category: updated });
  } catch (error) {
    res.status(500).json({ error: 'Gagal memperbarui kategori', detail: error });
  }
};

// Hapus Kategori
export const deleteCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const existingCategory = await prisma.category.findFirst({
      where: { id, userId },
    });

    if (!existingCategory) {
      res.status(404).json({ error: 'Kategori tidak ditemukan' });
      return;
    }

    await prisma.category.delete({
      where: { id },
    });

    res.json({ message: 'Kategori berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus kategori', detail: error });
  }
};