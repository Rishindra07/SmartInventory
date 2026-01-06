import {Router} from "express";
import {
    checkoutConfirm,
    checkoutCancel
} from '../controllers/checkoutControllers.js'
const router = Router();

router.post("/confirm", checkoutConfirm);
router.post("/cancel", checkoutCancel);


export default router