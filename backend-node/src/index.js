import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import packagesRouter from './routes/packages.js';
import projectsRouter from './routes/projects.js';
import authRouter from './routes/auth.js';
import unitPricesRouter from './routes/unitPrices.js';
import productsRouter from './routes/products.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Make prisma available to routes
app.set('prisma', prisma);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/unit-prices', unitPricesRouter);
app.use('/api/products', productsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
