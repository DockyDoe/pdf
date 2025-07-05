const express = require('express');
const { identifyUser, checkResourceAccess } = require('../middleware/auth');
const File = require('../models/File');
const queueService = require('../services/queueService');
const conversionService = require('../services/conversionService');
const logger = require('../utils/logger');

const router = express.Router();

// Apply user identification middleware
router.use(identifyUser);

/**
 * Start file conversion to PDF
 */
router.post('/convert/:id', checkResourceAccess(() => null), async (req, res) => {
  try {
    const { id } = req.params;
    const { accessQuery } = req;
    const { priority = 0 } = req.body;
    
    const file = await File.findOne({ _id: id, ...accessQuery });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Check if file is already a PDF
    if (file.fileType === 'pdf') {
      return res.status(400).json({
        success: false,
        message: 'File is already a PDF'
      });
    }
    
    // Check if conversion is already in progress or completed
    if (file.processingStatus === 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Conversion already in progress',
        jobId: file.conversionJobId
      });
    }
    
    if (file.processingStatus === 'completed' && file.convertedTo === 'pdf') {
      return res.status(400).json({
        success: false,
        message: 'File already converted to PDF',
        convertedFileUrl: file.convertedFileUrl
      });
    }
    
    // Check if file type is supported
    if (!conversionService.isSupported(file.fileType)) {
      return res.status(400).json({
        success: false,
        message: `File type ${file.fileType} is not supported for conversion`
      });
    }
    
    // Add conversion job to queue
    const jobResult = await queueService.addConversionJob(file._id, {
      priority: parseInt(priority)
    });
    
    if (!jobResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to start conversion',
        error: jobResult.error
      });
    }
    
    // Update file status
    file.conversionJobId = jobResult.jobId;
    await file.updateProcessingStatus('processing');
    
    logger.info(`Conversion started for file ${file._id}, job: ${jobResult.jobId}`);
    
    res.json({
      success: true,
      message: 'Conversion started',
      jobId: jobResult.jobId,
      estimatedTime: conversionService.getEstimatedTime(file.size, file.fileType)
    });
    
  } catch (error) {
    logger.error('Error starting conversion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start conversion'
    });
  }
});

/**
 * Get conversion status
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const jobStatus = await queueService.getJobStatus(jobId, 'conversion');
    
    if (!jobStatus) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      job: {
        id: jobStatus.id,
        state: jobStatus.state,
        progress: jobStatus.progress || 0,
        data: jobStatus.data,
        result: jobStatus.returnvalue,
        error: jobStatus.failedReason,
        processedOn: jobStatus.processedOn,
        finishedOn: jobStatus.finishedOn
      }
    });
    
  } catch (error) {
    logger.error('Error getting conversion status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversion status'
    });
  }
});

/**
 * Cancel conversion
 */
router.delete('/cancel/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const cancelled = await queueService.cancelJob(jobId, 'conversion');
    
    if (cancelled) {
      // Update file status
      const file = await File.findOne({ conversionJobId: jobId });
      if (file) {
        await file.updateProcessingStatus('uploaded', 'Conversion cancelled by user');
      }
      
      res.json({
        success: true,
        message: 'Conversion cancelled'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Job not found or could not be cancelled'
      });
    }
    
  } catch (error) {
    logger.error('Error cancelling conversion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel conversion'
    });
  }
});

/**
 * Get supported file types
 */
router.get('/supported-types', (req, res) => {
  try {
    const supportedTypes = conversionService.getSupportedTypes();
    
    res.json({
      success: true,
      supportedTypes: supportedTypes.map(type => ({
        type,
        supported: true,
        converter: conversionService.supportedFormats[type]?.converter || 'unknown'
      }))
    });
    
  } catch (error) {
    logger.error('Error getting supported types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get supported types'
    });
  }
});

/**
 * Batch convert multiple files
 */
router.post('/batch-convert', async (req, res) => {
  try {
    const { fileIds, priority = 0 } = req.body;
    const { user } = req;
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'File IDs are required'
      });
    }
    
    if (fileIds.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 10 files can be converted at once'
      });
    }
    
    // Get files for the user
    let query = { _id: { $in: fileIds } };
    if (user.isAuthenticated) {
      query.userId = user.id;
    } else {
      query.sessionId = user.sessionId;
    }
    
    const files = await File.find(query);
    
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No files found'
      });
    }
    
    const results = [];
    
    for (const file of files) {
      try {
        // Skip if already PDF or not supported
        if (file.fileType === 'pdf') {
          results.push({
            fileId: file._id,
            success: false,
            message: 'File is already a PDF',
            status: 'skipped'
          });
          continue;
        }
        
        if (!conversionService.isSupported(file.fileType)) {
          results.push({
            fileId: file._id,
            success: false,
            message: `File type ${file.fileType} is not supported`,
            status: 'unsupported'
          });
          continue;
        }
        
        // Skip if already processing
        if (file.processingStatus === 'processing') {
          results.push({
            fileId: file._id,
            success: false,
            message: 'Conversion already in progress',
            status: 'processing',
            jobId: file.conversionJobId
          });
          continue;
        }
        
        // Start conversion
        const jobResult = await queueService.addConversionJob(file._id, {
          priority: parseInt(priority)
        });
        
        if (jobResult.success) {
          file.conversionJobId = jobResult.jobId;
          await file.updateProcessingStatus('processing');
          
          results.push({
            fileId: file._id,
            success: true,
            message: 'Conversion started',
            status: 'started',
            jobId: jobResult.jobId
          });
        } else {
          results.push({
            fileId: file._id,
            success: false,
            message: 'Failed to start conversion',
            status: 'failed',
            error: jobResult.error
          });
        }
        
      } catch (error) {
        results.push({
          fileId: file._id,
          success: false,
          message: 'Error starting conversion',
          status: 'error',
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      message: `Started conversion for ${successCount} of ${files.length} files`,
      results
    });
    
  } catch (error) {
    logger.error('Error in batch conversion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start batch conversion'
    });
  }
});

/**
 * Get conversion queue statistics
 */
router.get('/queue/stats', async (req, res) => {
  try {
    const stats = await queueService.getQueueStats();
    
    res.json({
      success: true,
      stats: {
        conversion: stats.conversion || {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting queue stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue statistics'
    });
  }
});

/**
 * Retry failed conversion
 */
router.post('/retry/:id', checkResourceAccess(() => null), async (req, res) => {
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
    
    if (file.processingStatus !== 'failed') {
      return res.status(400).json({
        success: false,
        message: 'File conversion has not failed'
      });
    }
    
    // Reset file status and start new conversion
    file.errorMessage = null;
    file.conversionJobId = null;
    await file.updateProcessingStatus('uploaded');
    
    // Add new conversion job
    const jobResult = await queueService.addConversionJob(file._id);
    
    if (!jobResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retry conversion',
        error: jobResult.error
      });
    }
    
    file.conversionJobId = jobResult.jobId;
    await file.updateProcessingStatus('processing');
    
    res.json({
      success: true,
      message: 'Conversion retry started',
      jobId: jobResult.jobId
    });
    
  } catch (error) {
    logger.error('Error retrying conversion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry conversion'
    });
  }
});

/**
 * Get conversion history for user
 */
router.get('/history', async (req, res) => {
  try {
    const { user } = req;
    const { limit = 20 } = req.query;
    
    let query = {};
    if (user.isAuthenticated) {
      query.userId = user.id;
    } else {
      query.sessionId = user.sessionId;
    }
    
    // Only get files that have been processed
    query.processingStatus = { $in: ['completed', 'failed'] };
    
    const files = await File.find(query)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .select('originalName fileType convertedTo processingStatus errorMessage processingStartTime processingEndTime createdAt updatedAt');
    
    res.json({
      success: true,
      history: files.map(file => ({
        id: file._id,
        originalName: file.originalName,
        fileType: file.fileType,
        convertedTo: file.convertedTo,
        status: file.processingStatus,
        error: file.errorMessage,
        startTime: file.processingStartTime,
        endTime: file.processingEndTime,
        duration: file.processingStartTime && file.processingEndTime ? 
          file.processingEndTime - file.processingStartTime : null,
        createdAt: file.createdAt,
        completedAt: file.updatedAt
      }))
    });
    
  } catch (error) {
    logger.error('Error getting conversion history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversion history'
    });
  }
});

module.exports = router;