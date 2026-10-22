import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    action: {
      type: String,
      required: true,
      enum: ['create', 'update', 'delete', 'flag', 'correct', 'confirm', 'dispute', 'merge', 'allocate'],
      index: true
    },
    oldValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    ipAddress: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
