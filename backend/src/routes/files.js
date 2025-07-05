const express = require('express');
const { withAuth, identifyUser, checkResourceAccess } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, validateFileExists } = require('../middleware/upload');
const File = require('../models/File');
const pdfService = require('../services/pdfService');
const logger = require('../utils/logger');

const router = express.Router();

// Apply user identification middleware to all routes
router.use(identifyUser);

/**
 * Upload a single file
 */
router.post('/upload', uploadSingle('file'), validateFileExists, async (req, res) => {
  try {
    const { file } = req;
    const { user } = req;
    
    logger.info(`File upload: ${file.originalname} (${file.size} bytes)`);
    
    // Create file record
    const fileRecord = new File({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
      fileType: file.fileType,
      userId: user.isAuthenticated ? user.id : null,
      userEmail: user.email || null,
      sessionId: user.isAuthenticated ? null : user.sessionId,
      processingStatus: 'uploaded'
    });
    
    await fileRecord.save();
    
    // Extract PDF metadata if it's a PDF
    if (file.fileType === 'pdf') {
      try {
        const metadata = await pdfService.extractMetadata(file.path);
        fileRecord.pdfMetadata = metadata;
        await fileRecord.save();
      } catch (error) {
        logger.warn('Failed to extract PDF metadata:', error);
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        id: fileRecord._id,
        filename: fileRecord.filename,
        originalName: fileRecord.originalName,
        fileType: fileRecord.fileType,
        size: fileRecord.size,
        processingStatus: fileRecord.processingStatus,
        fileUrl: fileRecord.fileUrl,
        pdfMetadata: fileRecord.pdfMetadata,
        createdAt: fileRecord.createdAt
      }
    });
    
  } catch (error) {
    logger.error('File upload error:', error);
    res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: error.message
    });
  }
});

/**
 * Upload multiple files
 */
router.post('/upload-multiple', uploadMultiple('files'), async (req, res) => {
  try {
    const { files } = req;
    const { user } = req;
    
    logger.info(`Multiple file upload: ${files.length} files`);
    
    const fileRecords = [];
    
    for (const file of files) {
      const fileRecord = new File({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        fileType: file.fileType,
        userId: user.isAuthenticated ? user.id : null,
        userEmail: user.email || null,
        sessionId: user.isAuthenticated ? null : user.sessionId,
        processingStatus: 'uploaded'
      });
      
      await fileRecord.save();
      
      // Extract PDF metadata if it's a PDF
      if (file.fileType === 'pdf') {
        try {
          const metadata = await pdfService.extractMetadata(file.path);
          fileRecord.pdfMetadata = metadata;
          await fileRecord.save();
        } catch (error) {
          logger.warn(`Failed to extract PDF metadata for ${file.originalname}:`, error);
        }
      }
      
      fileRecords.push({
        id: fileRecord._id,
        filename: fileRecord.filename,
        originalName: fileRecord.originalName,
        fileType: fileRecord.fileType,
        size: fileRecord.size,
        processingStatus: fileRecord.processingStatus,
        fileUrl: fileRecord.fileUrl,
        pdfMetadata: fileRecord.pdfMetadata,
        createdAt: fileRecord.createdAt
      });
    }
    
    res.status(201).json({
      success: true,
      message: `${files.length} files uploaded successfully`,
      files: fileRecords
    });
    
  } catch (error) {
    logger.error('Multiple file upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Multiple file upload failed',
      error: error.message
    });
  }
});

/**
 * Get user's files
 */
router.get('/', async (req, res) => {
  try {
    const { user } = req;
    const { page = 1, limit = 20, status, fileType } = req.query;
    
    let query = {};
    
    // Filter by user or session
    if (user.isAuthenticated) {
      query.userId = user.id;
    } else {
      query.sessionId = user.sessionId;
    }
    
    // Additional filters
    if (status) {
      query.processingStatus = status;
    }
    
    if (fileType) {
      query.fileType = fileType;
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: '-path -convertedFilePath' // Don't expose file paths
    };
    
    const files = await File.find(query)
      .sort(options.sort)
      .limit(options.limit * options.page)
      .skip((options.page - 1) * options.limit)
      .select(options.select);
    
    const total = await File.countDocuments(query);
    
    res.json({
      success: true,
      files: files.map(file => ({
        id: file._id,
        filename: file.filename,
        originalName: file.originalName,
        fileType: file.fileType,
        size: file.size,
        processingStatus: file.processingStatus,
        convertedTo: file.convertedTo,
        fileUrl: file.fileUrl,
        convertedFileUrl: file.convertedFileUrl,
        pdfMetadata: file.pdfMetadata,
        aiSummary: file.aiSummary,
        summaryGeneratedAt: file.summaryGeneratedAt,
        downloadCount: file.downloadCount,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt
      })),
      pagination: {
        current: options.page,
        pages: Math.ceil(total / options.limit),
        total
      }
    });
    
  } catch (error) {
    logger.error('Error getting files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get files'
    });
  }
});

/**
 * Get file by ID
 */
router.get('/:id', checkResourceAccess(() => null), async (req, res) => {
  try {
    const { id } = req.params;
    const { accessQuery } = req;
    
    const file = await File.findOne({ _id: id, ...accessQuery });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    res.json({
      success: true,
      file: {
        id: file._id,
        filename: file.filename,
        originalName: file.originalName,
        fileType: file.fileType,
        size: file.size,
        processingStatus: file.processingStatus,
        convertedTo: file.convertedTo,
        fileUrl: file.fileUrl,
        convertedFileUrl: file.convertedFileUrl,
        pdfMetadata: file.pdfMetadata,
        aiSummary: file.aiSummary,
        summaryGeneratedAt: file.summaryGeneratedAt,
        downloadCount: file.downloadCount,
        lastDownloaded: file.lastDownloaded,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt
      }
    });
    
  } catch (error) {
    logger.error('Error getting file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get file'
    });
  }
});

/**
 * Delete file
 */
router.delete('/:id', checkResourceAccess(() => null), async (req, res) => {
  try {
    const { id } = req.params;
    const { accessQuery } = req;
    
    const file = await File.findOne({ _id: id, ...accessQuery });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Delete physical files
    const fs = require('fs');
    const filesToDelete = [file.path];
    
    if (file.convertedFilePath) {
      filesToDelete.push(file.convertedFilePath);
    }
    
    for (const filePath of filesToDelete) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`Deleted file: ${filePath}`);
        }
      } catch (error) {
        logger.warn(`Failed to delete file ${filePath}:`, error);
      }
    }
    
    // Delete database record
    await File.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
    
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file'
    });
  }
});

/**
 * Get file metadata
 */
router.get('/:id/metadata', checkResourceAccess(() => null), async (req, res) => {
  try {
    const { id } = req.params;
    const { accessQuery } = req;
    
    const file = await File.findOne({ _id: id, ...accessQuery });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    let metadata = file.pdfMetadata || {};
    
    // If no metadata exists and it's a PDF, try to extract it
    if ((!metadata || Object.keys(metadata).length === 0) && 
        (file.fileType === 'pdf' || file.convertedTo === 'pdf')) {
      
      try {
        const pdfPath = file.convertedFilePath || file.path;
        metadata = await pdfService.extractMetadata(pdfPath);
        
        // Update file record
        file.pdfMetadata = metadata;
        await file.save();
      } catch (error) {
        logger.warn('Failed to extract metadata:', error);
      }
    }
    
    res.json({
      success: true,
      metadata: {
        ...metadata,
        originalName: file.originalName,
        fileType: file.fileType,
        size: file.size,
        uploadedAt: file.createdAt
      }
    });
    
  } catch (error) {
    logger.error('Error getting file metadata:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get file metadata'
    });
  }
});

/**
 * Get file statistics
 */
router.get('/stats/overview', async (req, res) => {
  try {
    const { user } = req;
    
    let query = {};
    if (user.isAuthenticated) {
      query.userId = user.id;
    } else {
      query.sessionId = user.sessionId;
    }
    
    const [
      totalFiles,
      processedFiles,
      totalSize,
      recentFiles
    ] = await Promise.all([
      File.countDocuments(query),
      File.countDocuments({ ...query, processingStatus: 'completed' }),
      File.aggregate([
        { $match: query },
        { $group: { _id: null, totalSize: { $sum: '$size' } } }
      ]),
      File.find(query)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('originalName fileType size processingStatus createdAt')
    ]);
    
    res.json({
      success: true,
      stats: {
        totalFiles,
        processedFiles,
        totalSize: totalSize[0]?.totalSize || 0,
        recentFiles: recentFiles.map(file => ({
          id: file._id,
          originalName: file.originalName,
          fileType: file.fileType,
          size: file.size,
          processingStatus: file.processingStatus,
          createdAt: file.createdAt
        }))
      }
    });
    
  } catch (error) {
    logger.error('Error getting file stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get file statistics'
    });
  }
});

/**
 * Cleanup expired files
 */
router.post('/cleanup', withAuth, async (req, res) => {
  try {
    // Only allow authenticated users to trigger cleanup
    if (!req.auth || !req.auth.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const expiredFiles = await File.find({
      expiresAt: { $lt: new Date() }
    });
    
    let deletedCount = 0;
    const fs = require('fs');
    
    for (const file of expiredFiles) {
      try {
        // Delete physical files
        const filesToDelete = [file.path];
        if (file.convertedFilePath) {
          filesToDelete.push(file.convertedFilePath);
        }
        
        for (const filePath of filesToDelete) {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
        
        // Delete database record
        await File.findByIdAndDelete(file._id);
        deletedCount++;
      } catch (error) {
        logger.error(`Failed to cleanup file ${file._id}:`, error);
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} expired files`,
      deletedCount
    });
    
  } catch (error) {
    logger.error('Error during cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Cleanup failed'
    });
  }
});

module.exports = router;