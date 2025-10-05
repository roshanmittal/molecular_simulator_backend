import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import './config/passport.js';
import { registerMiddleware } from './middlewares/index.js';
import authRoutes from './routes/auth.routes.js';
import lammpsRoutes from './routes/lammps.routes.js';

const app = express();

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => console.error('MongoDB connection error:', err));

registerMiddleware(app);
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/lammps', lammpsRoutes);

app.get('/', (req, res) => {
  res.json({ ok: true, name: 'molecular_simulator_backend' });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});