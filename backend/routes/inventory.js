import Router from "express";
import {
    getInventory,
    reserveInventory
} from '../controllers/InventoryControllers.js'
const router = Router();


router.post("/inventory/reserve", reserveInventory);
router.get("/inventory/:sku", getInventory);

export default router