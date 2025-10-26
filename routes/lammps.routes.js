import { Router } from 'express';
import { lammpsController } from '../controllers/lammps.controller.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Run LAMMPS from server file path
// Health check
router.get(
  '/health',
  lammpsController.healthCheck
);

router.post(
  '/run-input', 
  lammpsController.runInputFile
);

// Upload and run input file
router.post(
  '/upload-run-input', 
  upload.single('inputFile'), 
  lammpsController.uploadAndRunInputFile
);

// Upload trajectory file
router.post(
  '/upload-trajectory', 
  upload.single('trajectoryFile'), 
  lammpsController.uploadTrajectory
);

// Get trajectory file
router.get(
  '/trajectory/:fileId', 
  lammpsController.getTrajectory
);

export default router;