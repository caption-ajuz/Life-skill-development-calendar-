import mongoose from 'mongoose';

const correctionSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: ['distribution', 'collection', 'transfer'],
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    oldValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: ['pending', 'resolved', 'rejected'],
      default: 'pending',
      index: true
    },
    resolvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Correction', correctionSchema);
