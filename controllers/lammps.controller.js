import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import Trajectory from '../models/trajectory.model.js';

export const lammpsController = {
  runInputFile: async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No input file uploaded.' });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lammps-run-'));
    const inputFileName = 'in.lammps';
    const outputFileName = 'dump.lammpstrj';
    const inputFilePath = path.join(tempDir, inputFileName);
    
    try {
      await fs.writeFile(inputFilePath, req.file.buffer);

      const command = `cd "${tempDir}" && lmp -in "${inputFileName}" -var DUMPFILE "${outputFileName}"`;
      
      exec(command, async (error, stdout, stderr) => {
        if (error) {
          console.error(`LAMMPS Execution Error: ${stderr}`);
          await fs.rm(tempDir, { recursive: true, force: true });
          return res.status(500).json({ success: false, message: "LAMMPS simulation failed.", error: stderr });
        }

        const trajectoryContent = await fs.readFile(path.join(tempDir, outputFileName), 'utf8');

        const originalName = req.file.originalname;
        const baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
        
        const newTrajectory = new Trajectory({
          filename: `${baseName}.lammpstrj`,
          content: trajectoryContent,
        });
        await newTrajectory.save();
        
        await fs.rm(tempDir, { recursive: true, force: true });

        res.status(201).json({
          success: true,
          message: 'Simulation completed and trajectory stored.',
          fileId: newTrajectory._id,
        });
      });
    } catch (err) {
      console.error('Server error during simulation:', err);
      await fs.rm(tempDir, { recursive: true, force: true });
      res.status(500).json({ success: false, message: 'Server error during simulation process.' });
    }
  },

  uploadTrajectory: async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No trajectory file uploaded.' });
    }
    
    try {
      const newTrajectory = new Trajectory({
        filename: req.file.originalname,
        content: req.file.buffer.toString('utf8'),
      });

      await newTrajectory.save();
      
      res.status(201).json({
        success: true,
        message: 'Trajectory file stored successfully.',
        fileId: newTrajectory._id,
      });
    } catch (error) {
      console.error('Error saving trajectory to MongoDB:', error);
      res.status(500).json({ success: false, message: 'Server error while storing file.' });
    }
  },
  
  getTrajectory: async (req, res) => {
    try {
      const { fileId } = req.params;
      const trajectory = await Trajectory.findById(fileId);

      if (!trajectory) {
        return res.status(404).json({ success: false, message: 'File not found.' });
      }
      
      res.json({
        success: true,
        filename: trajectory.filename,
        content: trajectory.content,
      });
    } catch (error) {
      console.error('Error fetching trajectory from MongoDB:', error);
      res.status(500).json({ success: false, message: 'Server error while fetching file.' });
    }
  }
};