import express from 'express';
import { lammps } from '../controllers/lammps.controller.js';

const lammpsRouter = express.Router();
lammpsRouter.post('/run', lammps);

export default lammpsRouter;