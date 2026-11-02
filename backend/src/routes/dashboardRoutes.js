import express from 'express';
import { getDashboard, getMenuCounts } from '../controllers/dashboardController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', verifyToken, checkRole(['ADMIN']), getDashboard);
router.get('/menu-counts', verifyToken, checkRole(['ADMIN']), getMenuCounts);

export default router;
