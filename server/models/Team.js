import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    leaderEntersOverallCollection: {
      type: Boolean,
      default: false,
      index: true
    },
    overallCollectedAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    overallCollectionNotes: {
      type: String,
      default: ''
    },
    overallCollectionUpdatedAt: {
      type: Date,
      default: null
    },
    overallCollectionUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Team', teamSchema);
