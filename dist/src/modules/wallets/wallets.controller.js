import prisma from '../../config/db.js';
// --- WALLET CONTROLLER ---
// 1. Ambil semua dompet milik user yang sedang login
export const getWallets = async (req, res) => {
    try {
        const userId = req.user.id;
        const wallets = await prisma.wallet.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
        });
        res.json({ wallets });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengambil data dompet', detail: error });
    }
};
// 2. Tambah dompet baru
export const createWallet = async (req, res) => {
    try {
        const userId = req.user.id;
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
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal membuat dompet', detail: error });
    }
};
// --- POCKET (DANA DARURAT & TABUNGAN) CONTROLLER ---
// 3. Ambil semua kantong (Dana Darurat & Goals)
export const getPockets = async (req, res) => {
    try {
        const userId = req.user.id;
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
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengambil pos tabungan', detail: error });
    }
};
// 4. Tambah pos tabungan / goal baru
export const createPocket = async (req, res) => {
    try {
        const userId = req.user.id;
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
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal membuat pos tabungan', detail: error });
    }
};
// 5. Ringkasan Keuangan Lengkap untuk Dashboard
export const getFinancialOverview = async (req, res) => {
    try {
        const userId = req.user.id;
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
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengambil ringkasan keuangan', detail: error });
    }
};
//# sourceMappingURL=wallets.controller.js.map