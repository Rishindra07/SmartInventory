import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import redis from './config/redis.js';
import inventoryRoutes from './routes/inventory.js';
import checkoutRoutes from './routes/checkout.js';

dotenv.config();

const app = express();

app.use(express.json());
await redis.set("app:name", "SmartInventory");
const name = await redis.get("app:name");

console.log(name); // SmartInventory


mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

app.use('/inventory', inventoryRoutes);
app.use('/checkout', checkoutRoutes);


app.get('/', (req, res) => {
    res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
