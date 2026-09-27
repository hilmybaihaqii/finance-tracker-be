import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware.js';
import prisma from '../../config/db.js';

// 1. Ambil Riwayat Transaksi (Support Filter & Pagination Ringan)
export const getTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { type, walletId, pocketId, limit = '50', page = '1' } = req.query;

    const take = parseInt(limit as string, 10);
    const skip = (parseInt(page as string, 10) - 1) * take;

    const whereClause: any = { userId };
    if (type) whereClause.type = type;
    if (walletId) whereClause.walletId = walletId;
    if (pocketId) whereClause.pocketId = pocketId;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: whereClause,
        include: {
          wallet: { select: { id: true, name: true } },
          pocket: { select: { id: true, name: true, isEmergency: true } },
          category: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take,
        skip,
      }),
      prisma.transaction.count({ where: whereClause }),
    ]);

    res.json({
      meta: {
        total,
        page: parseInt(page as string, 10),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
      transactions,
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil riwayat transaksi', detail: error });
  }
};

// 2. Buat Transaksi Baru dengan ACID Transaction
export const createTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { type, amount, description, walletId, pocketId, categoryId, date } = req.body;

    if (!type || !amount || Number(amount) <= 0) {
      res.status(400).json({ error: 'Jenis transaksi dan nominal (lebih dari 0) wajib diisi' });
      return;
    }

    const numericAmount = Number(amount);

    // Eksekusi mutasi dalam Prisma Interactive Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Validasi kepemilikan Wallet jika disertakan
      let wallet = null;
      if (walletId) {
        wallet = await tx.wallet.findFirst({
          where: { id: walletId, userId },
        });
        if (!wallet) throw new Error('Dompet tidak ditemukan atau bukan milik Anda');
      }

      // Validasi kepemilikan Pocket jika disertakan
      let pocket = null;
      if (pocketId) {
        pocket = await tx.pocket.findFirst({
          where: { id: pocketId, userId },
        });
        if (!pocket) throw new Error('Pos tabungan/dana darurat tidak ditemukan atau bukan milik Anda');
      }

      // Validasi logika bisnis saldo & mutasi
      switch (type) {
        case 'INCOME': {
          if (!walletId) throw new Error('Pemasukan wajib memilih dompet tujuan');
          await tx.wallet.update({
            where: { id: walletId },
            data: { balance: { increment: numericAmount } },
          });
          break;
        }

        case 'EXPENSE': {
          if (!walletId) throw new Error('Pengeluaran wajib memilih dompet sumber dana');
          if (Number(wallet!.balance) < numericAmount) {
            throw new Error(`Saldo dompet ${wallet!.name} tidak mencukupi untuk pengeluaran ini`);
          }
          await tx.wallet.update({
            where: { id: walletId },
            data: { balance: { decrement: numericAmount } },
          });
          break;
        }

        case 'EMERGENCY_DEPOSIT':
        case 'SAVING_DEPOSIT': {
          if (!walletId || !pocketId) {
            throw new Error('Alokasi tabungan memerlukan dompet sumber dan kantong tujuan');
          }
          if (Number(wallet!.balance) < numericAmount) {
            throw new Error(`Saldo di ${wallet!.name} tidak cukup untuk dialokasikan ke tabungan`);
          }
          // Kurangi saldo dompet, tambah saldo kantong tabungan
          await tx.wallet.update({
            where: { id: walletId },
            data: { balance: { decrement: numericAmount } },
          });
          await tx.pocket.update({
            where: { id: pocketId },
            data: { currentAmount: { increment: numericAmount } },
          });
          break;
        }

        case 'EMERGENCY_WITHDRAW':
        case 'SAVING_WITHDRAW': {
          if (!walletId || !pocketId) {
            throw new Error('Penarikan tabungan memerlukan kantong sumber dan dompet tujuan');
          }
          if (Number(pocket!.currentAmount) < numericAmount) {
            throw new Error(`Saldo di ${pocket!.name} tidak mencukupi untuk ditarik`);
          }
          // Kurangi saldo pos tabungan, masukkan kembali ke dompet cair
          await tx.pocket.update({
            where: { id: pocketId },
            data: { currentAmount: { decrement: numericAmount } },
          });
          await tx.wallet.update({
            where: { id: walletId },
            data: { balance: { increment: numericAmount } },
          });
          break;
        }

        default:
          throw new Error('Tipe transaksi tidak valid');
      }

      // Catat log histori transaksi
      const createdTx = await tx.transaction.create({
        data: {
          userId,
          type,
          amount: numericAmount,
          description: description || null,
          walletId: walletId || null,
          pocketId: pocketId || null,
          categoryId: categoryId || null,
          date: date ? new Date(date) : new Date(),
        },
      });

      return createdTx;
    });

    res.status(201).json({
      message: 'Transaksi berhasil dicatat dan saldo telah diperbarui',
      transaction: result,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Gagal memproses transaksi' });
  }
};

// 3. Hapus Transaksi dengan Reversal Saldo Otomatis (Rollback Saldo)
export const deleteTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    await prisma.$transaction(async (tx) => {
      // 1. Cari transaksi yang bersangkutan
      const transaction = await tx.transaction.findFirst({
        where: { id, userId },
      });

      if (!transaction) {
        throw new Error('Transaksi tidak ditemukan');
      }

      const amount = Number(transaction.amount);

      // 2. Balikkan saldo sesuai jenis transaksi
      switch (transaction.type) {
        case 'INCOME':
          // Karena tadinya bertambah, saat dihapus harus dikurangi kembali
          if (transaction.walletId) {
            await tx.wallet.update({
              where: { id: transaction.walletId },
              data: { balance: { decrement: amount } },
            });
          }
          break;

        case 'EXPENSE':
          // Karena tadinya berkurang, saat dihapus uang kembali ke dompet
          if (transaction.walletId) {
            await tx.wallet.update({
              where: { id: transaction.walletId },
              data: { balance: { increment: amount } },
            });
          }
          break;

        case 'EMERGENCY_DEPOSIT':
        case 'SAVING_DEPOSIT':
          // Kembalikan uang tabungan ke dompet cair
          if (transaction.walletId) {
            await tx.wallet.update({
              where: { id: transaction.walletId },
              data: { balance: { increment: amount } },
            });
          }
          if (transaction.pocketId) {
            await tx.pocket.update({
              where: { id: transaction.pocketId },
              data: { currentAmount: { decrement: amount } },
            });
          }
          break;

        case 'EMERGENCY_WITHDRAW':
        case 'SAVING_WITHDRAW':
          // Kembalikan uang dari dompet cair ke kantong tabungan
          if (transaction.walletId) {
            await tx.wallet.update({
              where: { id: transaction.walletId },
              data: { balance: { decrement: amount } },
            });
          }
          if (transaction.pocketId) {
            await tx.pocket.update({
              where: { id: transaction.pocketId },
              data: { currentAmount: { increment: amount } },
            });
          }
          break;
      }

      // 3. Hapus catatan transaksi
      await tx.transaction.delete({
        where: { id },
      });
    });

    res.json({ message: 'Transaksi berhasil dihapus dan saldo telah dikembalikan (reverted)' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Gagal menghapus transaksi' });
  }
};

// 4. Analitik Keuangan & Laporan Bulanan (High Performance Aggregation)
export const getTransactionAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, month, year } = req.query;

    let from: Date;
    let to: Date;

    if (month && year) {
      const m = parseInt(month as string, 10) - 1; // 0-indexed di JS
      const y = parseInt(year as string, 10);
      from = new Date(Date.UTC(y, m, 1, 0, 0, 0));
      to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
    } else if (startDate && endDate) {
      from = new Date(startDate as string);
      to = new Date(endDate as string);
    } else {
      // Default: 30 hari terakhir
      to = new Date();
      from = new Date();
      from.setDate(to.getDate() - 30);
    }

    // Eksekusi query analitik secara paralel
    const [incomeTotal, expenseTotal, categoryBreakdown, emergencyAllocated, savingAllocated] = await Promise.all([
      // Total Income
      prisma.transaction.aggregate({
        where: { userId, type: 'INCOME', date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      // Total Expense
      prisma.transaction.aggregate({
        where: { userId, type: 'EXPENSE', date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      // Breakdown Pengeluaran per Kategori (Tahu uang habis di mana saja)
      prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, type: 'EXPENSE', date: { gte: from, lte: to }, categoryId: { not: null } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Total Masuk ke Dana Darurat
      prisma.transaction.aggregate({
        where: { userId, type: 'EMERGENCY_DEPOSIT', date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      // Total Masuk ke Tabungan
      prisma.transaction.aggregate({
        where: { userId, type: 'SAVING_DEPOSIT', date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
    ]);

    // Ambil metadata nama kategori
    const categoryIds = categoryBreakdown.map((c) => c.categoryId as string);
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const formattedCategoryBreakdown = categoryBreakdown.map((item) => ({
      categoryId: item.categoryId,
      categoryName: categoryMap.get(item.categoryId!) || 'Tanpa Kategori',
      totalAmount: item._sum.amount || 0,
      transactionCount: item._count.id,
    }));

    const totalIn = Number(incomeTotal._sum.amount || 0);
    const totalOut = Number(expenseTotal._sum.amount || 0);

    res.json({
      period: { from, to },
      summary: {
        totalIncome: totalIn,
        totalExpense: totalOut,
        netCashflow: totalIn - totalOut,
        emergencyFundSaved: Number(emergencyAllocated._sum.amount || 0),
        savingsSaved: Number(savingAllocated._sum.amount || 0),
      },
      categoryBreakdown: formattedCategoryBreakdown,
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data analitik keuangan', detail: error });
  }
};