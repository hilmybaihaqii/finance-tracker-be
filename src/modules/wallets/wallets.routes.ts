import { Router } from 'express';
import { getWallets, createWallet, getFinancialOverview, updateWallet, deleteWallet } from './wallets.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';

const router = Router();

// Semua endpoint wajib diproteksi dengan JWT token
router.use(authenticateToken);

router.get('/overview', getFinancialOverview);

// Rute Dompet
router.get('/wallets', getWallets);
router.post('/wallets', createWallet);
router.put('/wallets/:id', updateWallet);
router.delete('/wallets/:id', deleteWallet);


export default router;