import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    pinHash: {
      type: String,
      default: null,
      select: false
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    role: {
      type: String,
      required: true,
      enum: ['super_admin', 'usthad', 'team_leader', 'team_member'],
      index: true
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true
    },
    profilePhoto: {
      type: String, // base64 data URI (JPEG thumbnail ~30-60KB)
      default: null
    },
    passwordHint: {
      type: String,
      default: ''
    },
    pinHint: {
      type: String,
      default: ''
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Method to return safe JSON (omit passwordHash, pinHash, and hints)
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.pinHash;
  delete obj.passwordHint;
  delete obj.pinHint;
  return obj;
};

export default mongoose.model('User', userSchema);
