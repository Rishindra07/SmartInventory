import redis from "../config/redis.js";
import Product from "../models/Product";

const confirmCheckout = async (req, res) => {
    const { cartId, sku } = req.body
    if (!cartId || !sku)
        return res.status(400).json({ message: "Missing fields" })

    try {
        const reservationKey = `reservation:${sku}`
        const stockKey = `product:${sku}:stock`
        const now = Math.floor(Date.now() / 1000)

        // Find reservation
        const reservations = await redis.zrange(reservationKey, 0, -1)
        const member = reservations.find(m => m.startsWith(`${cartId}:`))

        if (!member) {
            // Idempotent success
            return res.json({ message: "Checkout already confirmed" })
        }

        const expiry = await redis.zscore(reservationKey, member)
        if (expiry < now) {
            await redis.zrem(reservationKey, member)
            return res.status(400).json({ message: "Reservation expired" })
        }

        // Remove reservation (stock already reduced earlier)
        await redis.zrem(reservationKey, member)

        // Sync DB stock from Redis
        const redisStock = await redis.get(stockKey)

        const product = await Product.findOne({ sku })
        if (!product) {
            return res.status(404).json({ message: "Product not found" })
        }

        product.stock = Number(redisStock)
        await product.save()

        // Save order here (not shown)

        return res.json({ message: "Checkout confirmed successfully" })

    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: "Internal server error" })
    }
}



const cancelCheckout = async (req, res) => {
    const { cartId, sku } = req.body
    if (!cartId || !sku)
        return res.status(400).json({ message: "Missing fields" })

    try {
        const reservationKey = `reservation:${sku}`
        const stockKey = `product:${sku}:stock`

        const reservations = await redis.zrange(reservationKey, 0, -1)
        const member = reservations.find(m => m.startsWith(`${cartId}:`))

        if (!member) {
            // Idempotent cancel
            return res.json({ message: "Checkout already cancelled" })
        }

        const quantity = Number(member.split(":")[1])

        await redis.multi()
            .zrem(reservationKey, member)
            .incrby(stockKey, quantity)
            .exec()

        return res.status(200).json({ message: "Checkout cancelled and stock restored" })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: "Internal server error" })
    }
}

export {
    cancelCheckout,
    confirmCheckout
}