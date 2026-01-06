import { Router } from "express";
import {
    getInventory,
    reserveInventory
} from '../controllers/InventoryControllers.js'
const router = Router();


router.post("/reserve", reserveInventory);
router.get("/:sku", getInventory);


export default router