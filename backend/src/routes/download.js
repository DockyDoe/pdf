const express = require('express');
const { requireAuthForDownload, identifyUser, checkResourceAccess } = require('../middleware/auth');
const File = require('../models/File');
const MergeJob = require('../models/MergeJob');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const router = express.Router();

router.use(identifyUser);

/**
 * Download converted file (requires authentication)
 */
router.get('/file/:id', requireAuthForDownload, checkResourceAccess(() => null), async (req, res) => {
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
    
    // Determine which file to download
    let filePath = file.path;
    let filename = file.filename;
    
    if (file.convertedFilePath && fs.existsSync(file.convertedFilePath)) {
      filePath = file.convertedFilePath;
      filename = `converted_${file.originalName}.pdf`;
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }
    
    // Update download count
    await file.incrementDownloadCount();
    
    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    logger.info(`File downloaded: ${filename} by user ${req.user.id}`);
    
  } catch (error) {
    logger.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download file'
    });
  }
});

/**
 * Download merged PDF (requires authentication)
 */
router.get('/merge/:jobId', requireAuthForDownload, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { user } = req;
    
    let query = { jobId };
    if (user.isAuthenticated) {
      query.userId = user.id;
    } else {
      query.sessionId = user.sessionId;
    }
    
    const mergeJob = await MergeJob.findOne(query);
    
    if (!mergeJob) {
      return res.status(404).json({
        success: false,
        message: 'Merge job not found'
      });
    }
    
    if (mergeJob.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Merge job not completed yet'
      });
    }
    
    if (!mergeJob.outputFilePath || !fs.existsSync(mergeJob.outputFilePath)) {
      return res.status(404).json({
        success: false,
        message: 'Merged file not found on server'
      });
    }
    
    // Update download count
    await mergeJob.incrementDownloadCount();
    
    // Set headers
    const filename = mergeJob.outputFilename || 'merged.pdf';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    
    // Stream file
    const fileStream = fs.createReadStream(mergeJob.outputFilePath);
    fileStream.pipe(res);
    
    logger.info(`Merged PDF downloaded: ${filename} by user ${user.id}`);
    
  } catch (error) {
    logger.error('Error downloading merged file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download merged file'
    });
  }
});

/**
 * Preview file (no authentication required)
 */
router.get('/preview/:id', checkResourceAccess(() => null), async (req, res) => {
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
    
    let filePath = file.path;
    if (file.convertedFilePath && fs.existsSync(file.convertedFilePath)) {
      filePath = file.convertedFilePath;
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }
    
    // Set headers for inline viewing
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    
    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    logger.error('Error previewing file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview file'
    });
  }
});

module.exports = router;