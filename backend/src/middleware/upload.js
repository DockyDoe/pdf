const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed file types and their MIME types
const allowedFileTypes = {
  // Office documents
  'application/msword': { ext: '.doc', type: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', type: 'docx' },
  'application/vnd.ms-powerpoint': { ext: '.ppt', type: 'ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: '.pptx', type: 'pptx' },
  'application/vnd.ms-excel': { ext: '.xls', type: 'xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: '.xlsx', type: 'xlsx' },
  
  // PDF
  'application/pdf': { ext: '.pdf', type: 'pdf' },
  
  // Images
  'image/jpeg': { ext: '.jpg', type: 'jpeg' },
  'image/jpg': { ext: '.jpg', type: 'jpg' },
  'image/png': { ext: '.png', type: 'png' }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const filename = `${uniqueSuffix}${fileExtension}`;
    cb(null, filename);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  logger.info(`File upload attempt: ${file.originalname}, MIME: ${file.mimetype}`);
  
  // Check if file type is allowed
  if (allowedFileTypes[file.mimetype]) {
    cb(null, true);
  } else {
    const error = new Error(`File type not supported: ${file.mimetype}`);
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50000000, // 50MB default
    files: 10 // Maximum 10 files at once
  }
});

// Middleware for single file upload
const uploadSingle = (fieldName = 'file') => {
  return (req, res, next) => {
    const singleUpload = upload.single(fieldName);
    
    singleUpload(req, res, (err) => {
      if (err) {
        return handleUploadError(err, req, res, next);
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      // Add file metadata
      req.file.fileType = allowedFileTypes[req.file.mimetype].type;
      logger.info(`File uploaded successfully: ${req.file.filename}`);
      next();
    });
  };
};

// Middleware for multiple file upload
const uploadMultiple = (fieldName = 'files', maxCount = 10) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);
    
    multipleUpload(req, res, (err) => {
      if (err) {
        return handleUploadError(err, req, res, next);
      }
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded'
        });
      }
      
      // Add file metadata to each file
      req.files = req.files.map(file => ({
        ...file,
        fileType: allowedFileTypes[file.mimetype].type
      }));
      
      logger.info(`${req.files.length} files uploaded successfully`);
      next();
    });
  };
};

// Error handler for upload errors
const handleUploadError = (err, req, res, next) => {
  logger.error('File upload error:', err);
  
  let message = 'File upload failed';
  let statusCode = 400;
  
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      message = `File too large. Maximum size is ${(parseInt(process.env.MAX_FILE_SIZE) || 50000000) / 1000000}MB`;
      statusCode = 413;
      break;
    case 'LIMIT_FILE_COUNT':
      message = 'Too many files. Maximum 10 files allowed';
      statusCode = 413;
      break;
    case 'LIMIT_UNEXPECTED_FILE':
      message = 'Unexpected file field';
      break;
    case 'INVALID_FILE_TYPE':
      message = `File type not supported. Allowed types: ${Object.values(allowedFileTypes).map(t => t.type).join(', ')}`;
      break;
    case 'LIMIT_PART_COUNT':
      message = 'Too many parts in multipart form';
      break;
    case 'LIMIT_FIELD_KEY':
      message = 'Field name too long';
      break;
    case 'LIMIT_FIELD_VALUE':
      message = 'Field value too long';
      break;
    case 'LIMIT_FIELD_COUNT':
      message = 'Too many fields';
      break;
    default:
      if (err.message) {
        message = err.message;
      }
  }
  
  res.status(statusCode).json({
    success: false,
    message: message,
    code: err.code
  });
};

// Cleanup function to remove uploaded files
const cleanupFiles = (files) => {
  if (!files) return;
  
  const fileList = Array.isArray(files) ? files : [files];
  
  fileList.forEach(file => {
    if (file && file.path && fs.existsSync(file.path)) {
      fs.unlink(file.path, (err) => {
        if (err) {
          logger.error(`Failed to cleanup file ${file.path}:`, err);
        } else {
          logger.info(`Cleaned up file: ${file.path}`);
        }
      });
    }
  });
};

// Middleware to validate file exists
const validateFileExists = (req, res, next) => {
  if (req.file && !fs.existsSync(req.file.path)) {
    return res.status(404).json({
      success: false,
      message: 'Uploaded file not found'
    });
  }
  
  if (req.files) {
    for (const file of req.files) {
      if (!fs.existsSync(file.path)) {
        return res.status(404).json({
          success: false,
          message: 'One or more uploaded files not found'
        });
      }
    }
  }
  
  next();
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  cleanupFiles,
  validateFileExists,
  allowedFileTypes
};