import { Router } from 'express';
import { lammpsController } from '../controllers/lammps.controller.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  '/run-input', 
  upload.single('inputFile'), 
  lammpsController.runInputFile
);

router.post(
  '/upload-trajectory', 
  upload.single('trajectoryFile'), 
  lammpsController.uploadTrajectory
);

router.get(
  '/trajectory/:fileId', 
  lammpsController.getTrajectory
);

export default router;