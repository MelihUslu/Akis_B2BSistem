import express from 'express';
import { getDashboard } from '../controllers/dashboardController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', verifyToken, checkRole(['ADMIN']), getDashboard);

export default router;
