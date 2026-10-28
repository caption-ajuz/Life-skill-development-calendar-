import mongoose from 'mongoose';

const stockAllocationSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
      index: true
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    type: {
      type: String,
      enum: ['team', 'member'],
      default: function () {
        return this.memberId ? 'member' : 'team';
      },
      index: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    allocatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    date: {
      type: Date,
      default: Date.now,
      index: true
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    clientId: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for query performance
stockAllocationSchema.index({ teamId: 1, type: 1, createdAt: -1 });
stockAllocationSchema.index({ memberId: 1, createdAt: -1 });

const StockAllocation = mongoose.model('StockAllocation', stockAllocationSchema);

// Safely drop the legacy unique index { teamId: 1, memberId: 1 } if it exists on the MongoDB collection
// so multiple allocation transactions can be logged per team / member over time
if (mongoose.connection) {
  const dropLegacyIndex = async () => {
    try {
      const collection = mongoose.connection.collection('stockallocations');
      if (collection) {
        const indexes = await collection.indexes();
        const legacyIndex = indexes.find((idx) => idx.name === 'teamId_1_memberId_1');
        if (legacyIndex) {
          await collection.dropIndex('teamId_1_memberId_1');
          console.log('Successfully dropped legacy unique index teamId_1_memberId_1');
        }
      }
    } catch (_) {
      // Ignore if index doesn't exist or collection hasn't been created yet
    }
  };

  if (mongoose.connection.readyState === 1) {
    dropLegacyIndex();
  } else {
    mongoose.connection.once('open', dropLegacyIndex);
  }
}

export default StockAllocation;
