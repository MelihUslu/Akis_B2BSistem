import express from 'express';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';
import { myDealers, mySummary, getMyVisits, createVisitPlan, checkInVisit, cancelVisitPlan } from '../controllers/plasiyerController.js';

const router = express.Router();
router.use(verifyToken, checkRole(['PLASIYER']));

router.get('/dealers', myDealers);
router.get('/summary', mySummary);
router.get('/visits', getMyVisits);
router.post('/visits', createVisitPlan);
router.post('/visits/check-in', checkInVisit);
router.post('/visits/:id/cancel', cancelVisitPlan);

export default router;
