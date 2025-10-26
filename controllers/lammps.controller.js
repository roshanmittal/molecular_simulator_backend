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

const detectLammpsCommand = async () => {
  const possibleCommands = ['lmp', 'lmp_serial', 'lmp_mpi', 'lammps'];
  for (const cmd of possibleCommands) {
    try {
      await new Promise((resolve, reject) => {
        exec(`${cmd} -help`, (error) => {
          if (error === null || error.code === 1) {
            resolve(true);
          } else {
            reject(new Error('Command not found'));
          }
        });
      });
      return cmd;
    } catch (err) {
    }
  }
  throw new Error('LAMMPS not found. Please use Docker setup.');
};

let lammpsCommand = null;
const getLammpsCommand = async () => {
  if (!lammpsCommand) {
    lammpsCommand = await detectLammpsCommand();
  }
  return lammpsCommand;
};

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
  healthCheck: async (req, res) => {
    try {
      const cmd = await getLammpsCommand();
      res.json({
        success: true,
        lammpsInstalled: true,
        lammpsCommand: cmd,
        message: `LAMMPS is installed and ready (using: ${cmd})`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        lammpsInstalled: false,
        error: error.message,
        message: 'LAMMPS not found. Please use Docker setup.'
      });
    }
  },

  runInputFile: async (req, res) => {
    const { inputFile } = req.body;
    if (!inputFile) {
      return res.status(400).json({ success: false, message: 'Input file is required' });
    }

    const inputFilePath = path.resolve(inputFile);
    const folderPath = path.dirname(inputFilePath);
    const fileName = path.basename(inputFilePath);
    
    console.log(`Running LAMMPS Conversion:`);
    console.log(`  Input File Path: ${inputFilePath}`);
    
    try {
      await fs.access(inputFilePath);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: `Input file not found on server: ${inputFilePath}` 
      });
    }

    try {
      const cmd = await getLammpsCommand();
      const command = `cd "${folderPath}" && ${cmd} -in "${fileName}"`;
      
      console.log(`Executing: ${command}`);
      
      exec(command, async (error, stdout, stderr) => {
        try {
          if (error) {
            console.error(`LAMMPS Execution Error: ${error.message}`);
            console.error(`Stdout: ${stdout}`);
            console.error(`Stderr: ${stderr}`);
            return res.status(500).json({ 
              success: false, 
              message: "LAMMPS simulation failed.", 
              error: error.message 
            });
          }

          if (stderr) {
            console.error(`LAMMPS stderr: ${stderr}`);
          }

          const files = await fs.readdir(folderPath);
          console.log(`Found files in directory: ${files.join(', ')}`);
          let dumpFiles = files.filter(f => f.endsWith('.lammpstrj'));
          
          if (dumpFiles.length === 0) {
            dumpFiles = files.filter(f => f.endsWith('.dump') || f.endsWith('.Dump') || f.endsWith('.trj') || f.endsWith('.output') );
          }

          if (dumpFiles.length === 0) {
            console.error(`No output file found in directory: ${folderPath}`);
            console.error(`Available files: ${files.join(', ')}`);
            return res.status(500).json({ 
              success: false, 
              message: 'Simulation completed but no output file found.',
              error: 'No trajectory file detected'
            });
          }

          let dumpFile = dumpFiles[0];
          let latestMtime = 0;
          for (const f of dumpFiles) {
            const filePath = path.join(folderPath, f);
            const stats = await fs.stat(filePath);
            if (stats.mtime.getTime() > latestMtime) {
              latestMtime = stats.mtime.getTime();
              dumpFile = f;
            }
          }

          const dumpFilePath = path.join(folderPath, dumpFile);
          try {
            console.log(`Reading Lammps Output file: ${dumpFilePath}`);
            const trajectoryContent = await fs.readFile(dumpFilePath, 'utf8');
            
            const savedTrajectory = await saveTrajectoryContent(
              dumpFile,
              trajectoryContent,
              fileName
            );

            console.log(`Trajectory saved with ID: ${savedTrajectory._id}`);

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
            return res.status(500).json({ 
              success: false, 
              message: 'Simulation completed but failed to read output file.',
              error: 'Failed to read dump file'
            });
          }

        } catch (execError) {
          console.error('Error in exec callback:', execError);
          res.status(500).json({ 
            success: false, 
            message: 'Server error during simulation process.' 
          });
        }
      });

    } catch (err) {
      res.status(500).json({ 
        success: false, 
        message: 'Server error during simulation setup.' 
      });
    }
  },

  uploadAndRunInputFile: async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No input file uploaded.' });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lammps-run-'));
    const inputFileName = req.file.originalname;
    const baseName = inputFileName.includes('.') ? inputFileName.substring(0, inputFileName.lastIndexOf('.')) : inputFileName;
    const inputFilePath = path.join(tempDir, inputFileName);
    
    try {
      await fs.writeFile(inputFilePath, req.file.buffer);

      console.log(`Running LAMMPS with uploaded file: ${inputFileName}`);
      console.log(`  Directory: ${tempDir}`);
      
      const cmd = await getLammpsCommand();
      const command = `cd "${tempDir}" && ${cmd} -in "${inputFileName}"`;
      console.log(`Executing: ${command}`);
      
      exec(command, async (error, stdout, stderr) => {
        try {
          if (error) {
            console.error(`LAMMPS Execution Error: ${error.message}`);
            console.error(`Stdout: ${stdout}`);
            console.error(`Stderr: ${stderr}`);
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

          const files = await fs.readdir(tempDir);
          console.log(`Found files in directory: ${files.join(', ')}`);
          let dumpFiles = files.filter(f => f.endsWith('.lammpstrj'));
          
          if (dumpFiles.length === 0) {
            dumpFiles = files.filter(f => f.endsWith('.dump') || f.endsWith('.Dump') || f.endsWith('.trj') || f.endsWith('.output'));
          }

          if (dumpFiles.length === 0) {
            console.error(`No output file found in directory: ${tempDir}`);
            console.error(`Available files: ${files.join(', ')}`);
            await fs.rm(tempDir, { recursive: true, force: true });
            return res.status(500).json({ 
              success: false, 
              message: 'Simulation completed but no output file found.',
              error: 'No trajectory file detected'
            });
          }

          let dumpFile = dumpFiles[0];
          let latestMtime = 0;
          for (const f of dumpFiles) {
            const filePath = path.join(tempDir, f);
            const stats = await fs.stat(filePath);
            if (stats.mtime.getTime() > latestMtime) {
              latestMtime = stats.mtime.getTime();
              dumpFile = f;
            }
          }

          const dumpFilePath = path.join(tempDir, dumpFile);
          try {
            console.log(`Reading Lammps Output file: ${dumpFilePath}`);
            const trajectoryContent = await fs.readFile(dumpFilePath, 'utf8');
            
            const savedTrajectory = await saveTrajectoryContent(
              dumpFile,
              trajectoryContent,
              inputFileName
            );

            console.log(`Trajectory saved with ID: ${savedTrajectory._id}`);
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