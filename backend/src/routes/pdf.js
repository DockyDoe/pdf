const express = require('express');
const { identifyUser, checkResourceAccess } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const File = require('../models/File');
const MergeJob = require('../models/MergeJob');
const queueService = require('../services/queueService');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

const router = express.Router();

router.use(identifyUser);

/**
 * Create PDF merge job
 */
router.post('/merge', async (req, res) => {
  try {
    const { fileIds, options = {} } = req.body;
    const { user } = req;
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 files are required for merging'
      });
    }
    
    // Get user's files
    let query = { _id: { $in: fileIds } };
    if (user.isAuthenticated) {
      query.userId = user.id;
    } else {
      query.sessionId = user.sessionId;
    }
    
    const files = await File.find(query);
    
    // Validate files are PDFs
    const pdfFiles = files.filter(file => 
      file.fileType === 'pdf' || file.convertedTo === 'pdf'
    );
    
    if (pdfFiles.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 PDF files are required'
      });
    }
    
    // Create merge job
    const jobId = uuidv4();
    const mergeJob = new MergeJob({
      jobId,
      userId: user.isAuthenticated ? user.id : null,
      sessionId: user.isAuthenticated ? null : user.sessionId,
      inputFiles: pdfFiles.map((file, index) => ({
        fileId: file._id,
        filePath: file.convertedFilePath || file.path,
        originalName: file.originalName,
        order: index
      })),
      options
    });
    
    await mergeJob.save();
    
    // Add to queue
    const queueResult = await queueService.addMergeJob(jobId);
    
    if (!queueResult.success) {
      await MergeJob.findByIdAndDelete(mergeJob._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to start merge operation'
      });
    }
    
    res.json({
      success: true,
      message: 'PDF merge started',
      mergeJobId: jobId,
      queueJobId: queueResult.jobId
    });
    
  } catch (error) {
    logger.error('Error creating merge job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create merge job'
    });
  }
});

/**
 * Get merge job status
 */
router.get('/merge/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { user } = req;
    
    let query = { jobId };
    if (user.isAuthenticated) {
      query.userId = user.id;
    } else {
      query.sessionId = user.sessionId;
    }
    
    const mergeJob = await MergeJob.findOne(query).populate('inputFiles.fileId');
    
    if (!mergeJob) {
      return res.status(404).json({
        success: false,
        message: 'Merge job not found'
      });
    }
    
    res.json({
      success: true,
      job: {
        id: mergeJob.jobId,
        status: mergeJob.status,
        progress: mergeJob.progress,
        inputFiles: mergeJob.inputFiles.length,
        outputFilename: mergeJob.outputFilename,
        outputFileUrl: mergeJob.outputFileUrl,
        error: mergeJob.errorMessage,
        createdAt: mergeJob.createdAt,
        completedAt: mergeJob.processingEndTime
      }
    });
    
  } catch (error) {
    logger.error('Error getting merge job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get merge job'
    });
  }
});

/**
 * Start AI summarization
 */
router.post('/summarize/:id', checkResourceAccess(() => null), async (req, res) => {
  try {
    const { id } = req.params;
    const { accessQuery } = req;
    const { options = {} } = req.body;
    
    const file = await File.findOne({ _id: id, ...accessQuery });
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Check if it's a PDF or converted PDF
    if (file.fileType !== 'pdf' && !file.convertedTo) {
      return res.status(400).json({
        success: false,
        message: 'File must be a PDF or converted to PDF first'
      });
    }
    
    // Check if AI service is available
    if (!aiService.isAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'AI summarization service is not available'
      });
    }
    
    // Add to AI queue
    const jobResult = await queueService.addAIJob(file._id, 'summarize', options);
    
    if (!jobResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to start summarization'
      });
    }
    
    res.json({
      success: true,
      message: 'AI summarization started',
      jobId: jobResult.jobId
    });
    
  } catch (error) {
    logger.error('Error starting summarization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start summarization'
    });
  }
});

/**
 * Get AI service status
 */
router.get('/ai/status', (req, res) => {
  try {
    const status = aiService.getStatus();
    
    res.json({
      success: true,
      status
    });
    
  } catch (error) {
    logger.error('Error getting AI status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AI status'
    });
  }
});

module.exports = router;