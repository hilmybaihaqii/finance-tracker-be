import { Router } from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './categories.controller.js';
import { authenticateToken } from '../../middlewares/auth.middleware.js';

const router = Router();
router.use(authenticateToken);

router.get('/', getCategories);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;