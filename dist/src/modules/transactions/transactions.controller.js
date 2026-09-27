import prisma from '../../config/db.js';
// 1. Ambil Riwayat Transaksi (Support Filter & Pagination Ringan)
export const getTransactions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, walletId, pocketId, limit = '50', page = '1' } = req.query;
        const take = parseInt(limit, 10);
        const skip = (parseInt(page, 10) - 1) * take;
        const whereClause = { userId };
        if (type)
            whereClause.type = type;
        if (walletId)
            whereClause.walletId = walletId;
        if (pocketId)
            whereClause.pocketId = pocketId;
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
                page: parseInt(page, 10),
                limit: take,
                totalPages: Math.ceil(total / take),
            },
            transactions,
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengambil riwayat transaksi', detail: error });
    }
};
// 2. Buat Transaksi Baru dengan ACID Transaction
export const createTransaction = async (req, res) => {
    try {
        const userId = req.user.id;
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
                if (!wallet)
                    throw new Error('Dompet tidak ditemukan atau bukan milik Anda');
            }
            // Validasi kepemilikan Pocket jika disertakan
            let pocket = null;
            if (pocketId) {
                pocket = await tx.pocket.findFirst({
                    where: { id: pocketId, userId },
                });
                if (!pocket)
                    throw new Error('Pos tabungan/dana darurat tidak ditemukan atau bukan milik Anda');
            }
            // Validasi logika bisnis saldo & mutasi
            switch (type) {
                case 'INCOME': {
                    if (!walletId)
                        throw new Error('Pemasukan wajib memilih dompet tujuan');
                    await tx.wallet.update({
                        where: { id: walletId },
                        data: { balance: { increment: numericAmount } },
                    });
                    break;
                }
                case 'EXPENSE': {
                    if (!walletId)
                        throw new Error('Pengeluaran wajib memilih dompet sumber dana');
                    if (Number(wallet.balance) < numericAmount) {
                        throw new Error(`Saldo dompet ${wallet.name} tidak mencukupi untuk pengeluaran ini`);
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
                    if (Number(wallet.balance) < numericAmount) {
                        throw new Error(`Saldo di ${wallet.name} tidak cukup untuk dialokasikan ke tabungan`);
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
                    if (Number(pocket.currentAmount) < numericAmount) {
                        throw new Error(`Saldo di ${pocket.name} tidak mencukupi untuk ditarik`);
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
    }
    catch (error) {
        res.status(400).json({ error: error.message || 'Gagal memproses transaksi' });
    }
};
//# sourceMappingURL=transactions.controller.js.map