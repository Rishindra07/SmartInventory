import Product from '../models/Product.js'
import redis from '../config/redis.js'

const RESERVATION_TTL = 300 

const cleanupExpired = async (sku) => {
  const reservationKey = `reservation:${sku}`
  const stockKey = `product:${sku}:stock`
  const now = Math.floor(Date.now() / 1000)

  const expired = await redis.zrange(reservationKey, 0, now, {
    byScore: true
  })

  for (const item of expired) {
    const qty = Number(item.split(':')[1])
    if (qty) {
      await redis.incrby(stockKey, qty)
    }
  }

  if (expired.length) {
    await redis.zremrangebyscore(reservationKey, '-inf', now)
  }
}

const RESERVE_LUA = `
local stockKey = KEYS[1]
local reservationKey = KEYS[2]

local quantity = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local member = ARGV[4]

-- Cleanup expired reservations
local expired = redis.call('ZRANGEBYSCORE', reservationKey, '-inf', now)
for _, item in ipairs(expired) do
  local qty = tonumber(string.match(item, ":(%d+)$"))
  if qty then
    redis.call('INCRBY', stockKey, qty)
  end
end
redis.call('ZREMRANGEBYSCORE', reservationKey, '-inf', now)

-- Idempotency
local existing = redis.call('ZSCORE', reservationKey, member)
if existing then
  redis.call('ZADD', reservationKey, now + ttl, member)
  return 0
end

-- Check stock
local stock = redis.call('GET', stockKey)
if not stock then
  return -1
end

stock = tonumber(stock)
if stock < quantity then
  return -2
end

-- Reserve
redis.call('DECRBY', stockKey, quantity)
redis.call('ZADD', reservationKey, now + ttl, member)

return 0
`

export const getInventory = async (req, res) => {
  const { sku } = req.params

  try {
    await cleanupExpired(sku)

    let stock = await redis.get(`product:${sku}:stock`)

    if (stock === null) {
      const product = await Product.findOne({ sku })
      if (!product) {
        return res.status(404).json({ message: 'Product not found' })
      }

      stock = product.stock
      await redis.set(`product:${sku}:stock`, stock)
    }

    return res.json({
      sku,
      availableStock: Number(stock)
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Internal server error' })
  }
}

export const reserveInventory = async (req, res) => {
  const { sku, quantity, cartId } = req.body
  if (!sku || !quantity || !cartId) {
    return res.status(400).json({ message: 'Missing fields' })
  }

  const stockKey = `product:${sku}:stock`
  const reservationKey = `reservation:${sku}`
  const member = `${cartId}:${quantity}`
  const now = Math.floor(Date.now() / 1000)

  try {
    const result = await redis.eval(
      RESERVE_LUA,
      [stockKey, reservationKey],
      [quantity, now, RESERVATION_TTL, member]
    )

    if (result === 0) {
      return res.status(201).json({
        message: 'Inventory reserved successfully',
        sku,
        quantity,
        cartId
      })
    }

    if (result === -1) {
      return res.status(500).json({ message: 'Stock not initialized' })
    }

    if (result === -2) {
      return res.status(400).json({ message: 'Not enough stock' })
    }

    return res.status(500).json({ message: 'Unknown reservation error' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
