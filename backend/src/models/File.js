const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  // Basic file information
  filename: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  
  // File type and processing
  fileType: {
    type: String,
    enum: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'],
    required: true
  },
  processingStatus: {
    type: String,
    enum: ['uploaded', 'processing', 'completed', 'failed'],
    default: 'uploaded'
  },
  
  // Conversion information
  convertedTo: {
    type: String,
    enum: ['pdf'],
    default: null
  },
  convertedFilePath: {
    type: String,
    default: null
  },
  conversionJobId: {
    type: String,
    default: null
  },
  
  // User information (optional - for non-authenticated users)
  userId: {
    type: String, // Clerk user ID
    default: null
  },
  userEmail: {
    type: String,
    default: null
  },
  sessionId: {
    type: String, // For anonymous users
    default: null
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
  
  // PDF specific metadata
  pdfMetadata: {
    pages: {
      type: Number,
      default: null
    },
    title: {
      type: String,
      default: null
    },
    author: {
      type: String,
      default: null
    },
    subject: {
      type: String,
      default: null
    },
    creator: {
      type: String,
      default: null
    },
    producer: {
      type: String,
      default: null
    },
    creationDate: {
      type: Date,
      default: null
    }
  },
  
  // AI Summary
  aiSummary: {
    type: String,
    default: null
  },
  summaryGeneratedAt: {
    type: Date,
    default: null
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
fileSchema.index({ userId: 1, createdAt: -1 });
fileSchema.index({ sessionId: 1, createdAt: -1 });
fileSchema.index({ processingStatus: 1 });
fileSchema.index({ conversionJobId: 1 });
fileSchema.index({ expiresAt: 1 });

// Virtual for file URL
fileSchema.virtual('fileUrl').get(function() {
  return `/uploads/${this.filename}`;
});

fileSchema.virtual('convertedFileUrl').get(function() {
  if (this.convertedFilePath) {
    return `/uploads/${this.convertedFilePath.split('/').pop()}`;
  }
  return null;
});

// Methods
fileSchema.methods.updateProcessingStatus = function(status, errorMessage = null) {
  this.processingStatus = status;
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

fileSchema.methods.incrementDownloadCount = function() {
  this.downloadCount += 1;
  this.lastDownloaded = new Date();
  return this.save();
};

// Static methods
fileSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

fileSchema.statics.findBySession = function(sessionId) {
  return this.find({ sessionId }).sort({ createdAt: -1 });
};

fileSchema.statics.findProcessing = function() {
  return this.find({ processingStatus: 'processing' });
};

module.exports = mongoose.model('File', fileSchema);