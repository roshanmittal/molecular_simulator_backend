import mongoose from 'mongoose';

const trajectorySchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  originalInputFile: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Trajectory = mongoose.model('Trajectory', trajectorySchema);

export default Trajectory;