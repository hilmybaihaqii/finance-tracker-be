import { Router } from 'express';
import { getWallets, createWallet, getPockets, createPocket, getFinancialOverview, } from './wallets.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
const router = Router();
// Semua endpoint wajib diproteksi dengan JWT token
router.use(authenticateToken);
router.get('/overview', getFinancialOverview);
// Rute Dompet
router.get('/wallets', getWallets);
router.post('/wallets', createWallet);
// Rute Dana Darurat & Pos Tabungan
router.get('/pockets', getPockets);
router.post('/pockets', createPocket);
export default router;
//# sourceMappingURL=wallets.routes.js.map