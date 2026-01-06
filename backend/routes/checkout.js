import {Router} from "express";

const router = Router();

router.post('/checkout/confirm',checkoutConfirm)
router.post("/checkout/cancel",checkoutCancel)

export default router