import 'dotenv/config';
import express from 'express';
import './config/passport.js';
import { registerMiddleware } from './middlewares/index.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

registerMiddleware(app);

app.use('/auth', authRoutes);

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
