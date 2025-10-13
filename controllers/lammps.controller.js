import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import mongoose from 'mongoose';
import multer from 'multer';
import { GridFSBucket } from 'mongodb';
import Trajectory from '../models/trajectory.model.js';

const storage = multer.memoryStorage();
export const upload = multer({ storage });

let gfsBucket;
mongoose.connection.once('open', () => {
  gfsBucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'trajectories'
  });
});

const saveTrajectoryContent = async (filename, content, originalInputFile = null) => {
  const contentSize = Buffer.byteLength(content, 'utf8');
  const MAX_DOC_SIZE = 15 * 1024 * 1024;
  
  if (contentSize > MAX_DOC_SIZE) {
    return new Promise((resolve, reject) => {
      const uploadStream = gfsBucket.openUploadStream(filename, {
        metadata: {
          originalInputFile,
          createdAt: new Date(),
          contentType: 'text/plain'
        }
      });
      
      uploadStream.end(Buffer.from(content, 'utf8'));
      
      uploadStream.on('finish', () => {
        resolve({
          _id: uploadStream.id,
          filename,
          isGridFS: true,
          size: contentSize,
          originalInputFile,
          createdAt: new Date()
        });
      });
      
      uploadStream.on('error', reject);
    });
  } else {
    const newTrajectory = new Trajectory({
      filename,
      content,
      originalInputFile,
      createdAt: new Date()
    });
    
    await newTrajectory.save();
    return {
      _id: newTrajectory._id,
      filename: newTrajectory.filename,
      isGridFS: false,
      originalInputFile: newTrajectory.originalInputFile,
      createdAt: newTrajectory.createdAt
    };
  }
};

export const lammpsController = {
  runInputFile: async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No input file uploaded.' });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lammps-run-'));
    const inputFileName = req.file.originalname;
    const baseName = inputFileName.includes('.') ? inputFileName.substring(0, inputFileName.lastIndexOf('.')) : inputFileName;
    const inputFilePath = path.join(tempDir, inputFileName);
    
    try {
      await fs.writeFile(inputFilePath, req.file.buffer);

      const fileNameParts = inputFileName.split('.');
      const outputFileName = fileNameParts.length > 1 ? `dump.${fileNameParts[1]}.lammpstrj` : 'dump.lammpstrj';
      
      const command = `cd "${tempDir}" && lmp -in "${inputFileName}"`;
      
      exec(command, async (error, stdout, stderr) => {
        try {
          if (error) {
            console.error(`LAMMPS Execution Error: ${error.message}`);
            await fs.rm(tempDir, { recursive: true, force: true });
            return res.status(500).json({ 
              success: false, 
              message: "LAMMPS simulation failed.", 
              error: error.message 
            });
          }

          if (stderr) {
            console.error(`LAMMPS stderr: ${stderr}`);
          }

          const dumpFilePath = path.join(tempDir, outputFileName);
          
          try {
            const trajectoryContent = await fs.readFile(dumpFilePath, 'utf8');
            
            const savedTrajectory = await saveTrajectoryContent(
              `${baseName}.lammpstrj`,
              trajectoryContent,
              inputFileName
            );
            
            await fs.rm(tempDir, { recursive: true, force: true });

            res.status(201).json({
              success: true,
              message: 'LAMMPS simulation completed and trajectory stored.',
              fileId: savedTrajectory._id,
              filename: savedTrajectory.filename,
              isGridFS: savedTrajectory.isGridFS,
              size: savedTrajectory.size
            });

          } catch (readError) {
            console.error('Failed to read dump file:', readError);
            await fs.rm(tempDir, { recursive: true, force: true });
            return res.status(500).json({ 
              success: false, 
              message: 'Simulation completed but failed to read output file.',
              error: 'Failed to read dump file'
            });
          }

        } catch (execError) {
          console.error('Error in exec callback:', execError);
          await fs.rm(tempDir, { recursive: true, force: true });
          res.status(500).json({ 
            success: false, 
            message: 'Server error during simulation process.' 
          });
        }
      });

    } catch (err) {
      console.error('Server error during simulation setup:', err);
      await fs.rm(tempDir, { recursive: true, force: true });
      res.status(500).json({ 
        success: false, 
        message: 'Server error during simulation setup.' 
      });
    }
  },

  uploadTrajectory: async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No trajectory file uploaded.' 
      });
    }
    
    try {
      const content = req.file.buffer.toString('utf8');
      const savedTrajectory = await saveTrajectoryContent(
        req.file.originalname,
        content
      );
      
      res.status(201).json({
        success: true,
        message: 'Trajectory file stored successfully.',
        fileId: savedTrajectory._id,
        isGridFS: savedTrajectory.isGridFS,
        size: savedTrajectory.size
      });
    } catch (error) {
      console.error('Error saving trajectory:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error while storing file.' 
      });
    }
  },
  
  getTrajectory: async (req, res) => {
    try {
      const { fileId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(fileId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid file ID format.' 
        });
      }

      const trajectory = await Trajectory.findById(fileId);
      
      if (trajectory) {
        return res.json({
          success: true,
          filename: trajectory.filename,
          content: trajectory.content,
          originalInputFile: trajectory.originalInputFile,
          createdAt: trajectory.createdAt,
          isGridFS: false
        });
      }

      try {
        const files = await gfsBucket.find({ _id: new mongoose.Types.ObjectId(fileId) }).toArray();
        
        if (files.length === 0) {
          return res.status(404).json({ 
            success: false, 
            message: 'File not found.' 
          });
        }

        const file = files[0];
        const downloadStream = gfsBucket.openDownloadStream(file._id);
        
        let content = '';
        downloadStream.on('data', (chunk) => {
          content += chunk.toString();
        });
        
        downloadStream.on('end', () => {
          res.json({
            success: true,
            filename: file.filename,
            content: content,
            originalInputFile: file.metadata?.originalInputFile,
            createdAt: file.metadata?.createdAt || file.uploadDate,
            isGridFS: true
          });
        });
        
        downloadStream.on('error', (error) => {
          console.error('GridFS download error:', error);
          res.status(500).json({ 
            success: false, 
            message: 'Error downloading file from GridFS.' 
          });
        });
        
      } catch (gridfsError) {
        console.error('GridFS error:', gridfsError);
        return res.status(404).json({ 
          success: false, 
          message: 'File not found.' 
        });
      }

    } catch (error) {
      console.error('Error fetching trajectory:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error while fetching file.' 
      });
    }
  }
};