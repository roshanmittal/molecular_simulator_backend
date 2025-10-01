import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

export const lammps = async (req, res) => {
  // console.log('Received LAMMPS run request:', req.body);
  const { inputFile } = req.body;
  if (!inputFile) {
    return res.status(400).json({ success: false, message: 'Input file is required' });
  }
const folderPath = path.dirname(inputFile);
const fileName = path.basename(inputFile);
  const command = `cd ${folderPath} && lmp -in ${fileName}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`LAMMPS error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
    if (stderr) {
      console.error(`LAMMPS stderr: ${stderr}`);
    }
    // console.log(fileName.split('.')[1]);
    const outputfilename=fileName.split('.')[1];
    // console.log(`${folderPath}/dump.${outputfilename}.lammpstrj`);
    fs.readFile(`${folderPath}/dump.${outputfilename}.lammpstrj`, 'utf8', (readErr, fileContents) => {
      if (readErr) {
        return res.status(500).json({ success: false, error: 'Failed to read dump file' });
      }
      res.json({
        success: true,
        message: 'LAMMPS simulation completed',
        dumpFile: fileContents,
      });
    });
  });
};