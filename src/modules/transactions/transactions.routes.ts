import { Router } from 'express';
import { getTransactions, createTransaction, deleteTransaction, getTransactionAnalytics } from './transactions.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticateToken);
router.get('/analytics', getTransactionAnalytics);
router.get('/', getTransactions);
router.post('/', createTransaction);
router.delete('/:id', deleteTransaction);

export default router;