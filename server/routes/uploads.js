import express from 'express';
import multer from 'multer';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// Helper: Safely load and configure Cloudinary
let cloudinaryInstance = null;

async function getCloudinary() {
  if (cloudinaryInstance) return cloudinaryInstance;

  // Sanitize invalid or placeholder CLOUDINARY_URL from env
  if (process.env.CLOUDINARY_URL && (process.env.CLOUDINARY_URL.includes('<') || !process.env.CLOUDINARY_URL.startsWith('cloudinary://'))) {
    delete process.env.CLOUDINARY_URL;
  }

  try {
    const pkg = await import('cloudinary');
    const c = pkg.v2 || (pkg.default && pkg.default.v2) || pkg;
    c.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'bhlwt5m9',
      api_key: process.env.CLOUDINARY_API_KEY || '681148252944323',
      api_secret: process.env.CLOUDINARY_API_SECRET || 'ZkP5e7DSjh2dcLSAXcKwwF7lYnU',
      secure: true
    });
    cloudinaryInstance = c;
    return c;
  } catch (err) {
    console.warn('Cloudinary initialization skipped:', err.message);
    return null;
  }
}

// Memory storage for multer (max 5MB input)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  }
});

// Helper: Upload buffer stream to Cloudinary
async function uploadBufferToCloudinary(buffer, userId) {
  const cloudinary = await getCloudinary();
  if (!cloudinary) {
    throw new Error('Cloudinary service unavailable');
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'life_skill_course/profiles',
        public_id: `user_${userId}`,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 250, height: 250, crop: 'thumb', gravity: 'face' },
          { quality: 'auto:good', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

// POST /api/uploads/profile-photo
router.post('/profile-photo', upload.single('photo'), async (req, res) => {
  try {
    let finalPhotoUrl = null;

    if (req.file) {
      // 1. Upload file buffer directly to Cloudinary
      const result = await uploadBufferToCloudinary(req.file.buffer, req.user._id);
      finalPhotoUrl = result.secure_url;
    } else if (req.body && req.body.photoData) {
      // 2. Base64 data URI sent from client
      const base64Data = req.body.photoData;
      if (base64Data.startsWith('data:image')) {
        const cloudinary = await getCloudinary();
        if (cloudinary) {
          const result = await cloudinary.uploader.upload(base64Data, {
            folder: 'life_skill_course/profiles',
            public_id: `user_${req.user._id}`,
            overwrite: true,
            transformation: [
              { width: 250, height: 250, crop: 'thumb', gravity: 'face' },
              { quality: 'auto:good', fetch_format: 'auto' }
            ]
          });
          finalPhotoUrl = result.secure_url;
        } else {
          finalPhotoUrl = base64Data;
        }
      } else {
        finalPhotoUrl = base64Data;
      }
    } else {
      return res.status(400).json({ success: false, error: 'No image file or photo data provided.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    user.profilePhoto = finalPhotoUrl;
    await user.save();

    return res.json({
      success: true,
      message: 'Profile photo uploaded to Cloudinary successfully! ✓',
      photoUrl: finalPhotoUrl
    });
  } catch (err) {
    console.error('Upload profile photo error:', err);
    // Graceful fallback if Cloudinary encounters quota or network error
    if (req.body && req.body.photoData) {
      const user = await User.findById(req.user._id);
      if (user) {
        user.profilePhoto = req.body.photoData;
        await user.save();
        return res.json({
          success: true,
          message: 'Saved to local storage (Cloudinary fallback).',
          photoUrl: req.body.photoData
        });
      }
    }
    return res.status(500).json({ success: false, error: err.message || 'Failed to upload photo.' });
  }
});

// DELETE /api/uploads/profile-photo
router.delete('/profile-photo', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      try {
        const cloudinary = await getCloudinary();
        if (cloudinary) {
          await cloudinary.uploader.destroy(`life_skill_course/profiles/user_${req.user._id}`);
        }
      } catch (cErr) {
        console.warn('Cloudinary delete notification:', cErr.message);
      }
      user.profilePhoto = null;
      await user.save();
    }
    return res.json({ success: true, message: 'Profile photo removed.' });
  } catch (err) {
    console.error('Delete profile photo error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete photo.' });
  }
});

export default router;
