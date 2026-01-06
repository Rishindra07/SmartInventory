import Product from '../models/Product.js'
import redis from '../config/redis.js'

const RESERVATION_TTL = 300 // 5 minutes

// ---------------- GET INVENTORY ----------------
export const getInventory = async (req, res) => {
  const { sku } = req.params

  try {
    let stock = await redis.get(`product:${sku}:stock`)

    if (stock === null) {
      const product = await Product.findOne({ sku })
      if (!product) return res.status(404).json({ message: 'Product not found' })

      stock = product.stock
      await redis.set(`product:${sku}:stock`, stock)
    }

    res.json({ sku, availableStock: Number(stock) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const reserveInventory = async (req, res) => {
  const { sku, quantity, cartId } = req.body
  if (!sku || !quantity || !cartId)
    return res.status(400).json({ message: 'Missing fields' })

  const stockKey = `product:${sku}:stock`
  const reservationKey = `reservation:${sku}`
  const member = `${cartId}:${quantity}`
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + RESERVATION_TTL

  try {
    // 1️⃣ Lazy cleanup
    const expired = await redis.zrangebyscore(reservationKey, '-inf', now)

    for (const item of expired) {
      const qty = Number(item.split(':')[1])
      if (qty) await redis.incrby(stockKey, qty)
    }

    if (expired.length) {
      await redis.zremrangebyscore(reservationKey, '-inf', now)
    }

    // 2️⃣ Check idempotency
    const existing = await redis.zscore(reservationKey, member)
    if (existing) {
      await redis.zadd(reservationKey, { score: expiry, member })
      return res.status(200).json({ message: 'Inventory already reserved (refreshed)' })
    }

    // 3️⃣ Atomic reservation
    await redis.watch(stockKey)

    let stock = await redis.get(stockKey)
    if (stock === null) {
      const product = await Product.findOne({ sku })
      if (!product) return res.status(404).json({ message: 'Product not found' })
      stock = product.stock
      await redis.set(stockKey, stock)
    }

    if (Number(stock) < quantity) {
      await redis.unwatch()
      return res.status(400).json({ message: 'Not enough stock' })
    }

    const tx = redis.multi()
    tx.decrby(stockKey, quantity)
    tx.zadd(reservationKey, { score: expiry, member })

    const result = await tx.exec()
    if (!result) {
      return res.status(409).json({ message: 'Race condition, retry' })
    }

    return res.status(201).json({ message: 'Inventory reserved successfully', sku, quantity, cartId })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
