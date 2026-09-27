import { Router } from 'express';
import { getTransactions, createTransaction } from './transactions.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';
const router = Router();
router.use(authenticateToken);
router.get('/', getTransactions);
router.post('/', createTransaction);
export default router;
//# sourceMappingURL=transactions.routes.js.map