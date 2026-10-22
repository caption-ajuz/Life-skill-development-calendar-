import mongoose from 'mongoose';

const areaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    district: {
      type: String,
      trim: true,
      default: 'Palakkad',
      maxlength: 100
    },
    normalizedName: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    mergedIntoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Area',
      default: null,
      index: true
    },
    aliases: {
      type: [String],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

areaSchema.index({ normalizedName: 1, district: 1 });

export default mongoose.model('Area', areaSchema);
