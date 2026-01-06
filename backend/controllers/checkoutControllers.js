import Product from '../models/Product.js'
import redis from '../config/redis.js'



export const checkoutConfirm = async (req, res) => {
    const { sku, quantity, cartId } = req.body
    if (!sku || !quantity || !cartId)
        return res.status(400).json({ message: 'Missing fields' })

    const reservationKey = `reservation:${sku}`
    const stockKey = `product:${sku}:stock`
    const member = `${cartId}:${quantity}`

    try {
        // Remove reservation (idempotent)
        const expiry = await redis.zscore(reservationKey, member)
        const now = Math.floor(Date.now() / 1000)

        if (!expiry || expiry < now) {
            await redis.zrem(reservationKey, member)
            return res.status(400).json({ message: 'Reservation expired' })
}


        // 🔑 Sync DB from Redis (single source of truth)
        const redisStock = await redis.get(stockKey)

        const product = await Product.findOne({ sku })
        if (!product) {
            console.error(`Product ${sku} missing during confirm`)
            return res.status(404).json({ message: 'Product not found' })
        }

        product.stock = Number(redisStock)
        await product.save()

        return res.status(200).json({ message: 'Order confirmed' })
    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: 'Internal server error' })
    }
}


export const checkoutCancel = async (req, res) => {
    const { sku, quantity, cartId } = req.body

    if (!sku || !quantity || !cartId) {
        return res.status(400).json({ message: 'Missing fields' })
    }

    const stockKey = `product:${sku}:stock`
    const reservationKey = `reservation:${sku}`
    const member = `${cartId}:${quantity}`

    try {
        // Atomically remove reservation
        const removed = await redis.zrem(reservationKey, member)

        if (removed) {
            // If reservation existed, restore stock to Redis
            await redis.incrby(stockKey, quantity)
            return res.status(200).json({ message: 'Reservation cancelled' })
        } else {
            return res.status(400).json({ message: 'Reservation not found or expired' })
        }
    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: 'Internal server error' })
    }
}