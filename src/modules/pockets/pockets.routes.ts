import { Router } from 'express';
import {
  getPockets,
  createPocket,
  updatePocket,
  deletePocket,
} from './pockets.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticateToken);

router.get('/', getPockets);
router.post('/', createPocket);
router.put('/:id', updatePocket);
router.delete('/:id', deletePocket);

export default router;