const mongoose = require('mongoose');

const mergeJobSchema = new mongoose.Schema({
  // Job identification
  jobId: {
    type: String,
    required: true,
    unique: true
  },
  
  // User information
  userId: {
    type: String, // Clerk user ID
    default: null
  },
  sessionId: {
    type: String, // For anonymous users
    default: null
  },
  
  // Input files
  inputFiles: [{
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true
    },
    filePath: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    order: {
      type: Number,
      required: true
    }
  }],
  
  // Output file
  outputFilename: {
    type: String,
    default: null
  },
  outputFilePath: {
    type: String,
    default: null
  },
  outputFileSize: {
    type: Number,
    default: null
  },
  
  // Processing status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Progress tracking
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Processing metadata
  processingStartTime: {
    type: Date,
    default: null
  },
  processingEndTime: {
    type: Date,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  
  // Merge options
  options: {
    bookmarks: {
      type: Boolean,
      default: true
    },
    metadata: {
      title: {
        type: String,
        default: 'Merged PDF'
      },
      author: {
        type: String,
        default: 'PDF Utility App'
      },
      subject: {
        type: String,
        default: 'Merged PDF Document'
      }
    }
  },
  
  // Download tracking
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloaded: {
    type: Date,
    default: null
  },
  
  // Expiration (for cleanup)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true
});

// Indexes for performance
mergeJobSchema.index({ jobId: 1 });
mergeJobSchema.index({ userId: 1, createdAt: -1 });
mergeJobSchema.index({ sessionId: 1, createdAt: -1 });
mergeJobSchema.index({ status: 1 });
mergeJobSchema.index({ expiresAt: 1 });

// Virtual for output file URL
mergeJobSchema.virtual('outputFileUrl').get(function() {
  if (this.outputFilePath) {
    return `/uploads/${this.outputFilePath.split('/').pop()}`;
  }
  return null;
});

// Methods
mergeJobSchema.methods.updateStatus = function(status, errorMessage = null) {
  this.status = status;
  if (status === 'processing') {
    this.processingStartTime = new Date();
  } else if (status === 'completed' || status === 'failed') {
    this.processingEndTime = new Date();
  }
  if (errorMessage) {
    this.errorMessage = errorMessage;
  }
  return this.save();
};

mergeJobSchema.methods.updateProgress = function(progress) {
  this.progress = Math.min(100, Math.max(0, progress));
  return this.save();
};

mergeJobSchema.methods.incrementDownloadCount = function() {
  this.downloadCount += 1;
  this.lastDownloaded = new Date();
  return this.save();
};

// Static methods
mergeJobSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ createdAt: -1 }).populate('inputFiles.fileId');
};

mergeJobSchema.statics.findBySession = function(sessionId) {
  return this.find({ sessionId }).sort({ createdAt: -1 }).populate('inputFiles.fileId');
};

mergeJobSchema.statics.findPending = function() {
  return this.find({ status: 'pending' }).populate('inputFiles.fileId');
};

mergeJobSchema.statics.findProcessing = function() {
  return this.find({ status: 'processing' }).populate('inputFiles.fileId');
};

module.exports = mongoose.model('MergeJob', mergeJobSchema);