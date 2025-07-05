const { Queue, Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const logger = require('../utils/logger');
const conversionService = require('./conversionService');
const pdfService = require('./pdfService');
const aiService = require('./aiService');
const File = require('../models/File');
const MergeJob = require('../models/MergeJob');
const { broadcastJobProgress, broadcastJobStatus } = require('../websocket/handler');

class QueueService {
  constructor() {
    this.connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      // Add auth if needed
    };

    // Initialize queues
    this.conversionQueue = null;
    this.mergeQueue = null;
    this.aiQueue = null;
    
    // Initialize workers
    this.conversionWorker = null;
    this.mergeWorker = null;
    this.aiWorker = null;
    
    this.initialized = false;
  }

  /**
   * Initialize the queue service
   */
  async initialize() {
    try {
      // Create queues
      this.conversionQueue = new Queue('file-conversion', {
        connection: this.connection,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      this.mergeQueue = new Queue('pdf-merge', {
        connection: this.connection,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 50,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
        },
      });

      this.aiQueue = new Queue('ai-processing', {
        connection: this.connection,
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 20,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      });

      // Create workers
      await this.createWorkers();
      
      this.initialized = true;
      logger.info('Queue service initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize queue service:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Create workers for processing jobs
   */
  async createWorkers() {
    // Conversion worker
    this.conversionWorker = new Worker('file-conversion', async (job) => {
      return await this.processConversionJob(job);
    }, {
      connection: this.connection,
      concurrency: 3, // Process up to 3 conversion jobs simultaneously
    });

    // Merge worker
    this.mergeWorker = new Worker('pdf-merge', async (job) => {
      return await this.processMergeJob(job);
    }, {
      connection: this.connection,
      concurrency: 2, // Process up to 2 merge jobs simultaneously
    });

    // AI worker
    this.aiWorker = new Worker('ai-processing', async (job) => {
      return await this.processAIJob(job);
    }, {
      connection: this.connection,
      concurrency: 1, // Process one AI job at a time to manage API limits
    });

    // Set up event listeners
    this.setupWorkerEventListeners();
  }

  /**
   * Setup event listeners for workers
   */
  setupWorkerEventListeners() {
    const workers = [this.conversionWorker, this.mergeWorker, this.aiWorker];
    
    workers.forEach(worker => {
      worker.on('completed', (job) => {
        logger.info(`Job ${job.id} completed successfully`);
        broadcastJobStatus(job.id, 'completed', job.returnvalue);
      });

      worker.on('failed', (job, err) => {
        logger.error(`Job ${job.id} failed:`, err);
        broadcastJobStatus(job.id, 'failed', { error: err.message });
      });

      worker.on('progress', (job, progress) => {
        logger.debug(`Job ${job.id} progress: ${progress}%`);
        broadcastJobProgress(job.id, progress);
      });

      worker.on('error', (err) => {
        logger.error('Worker error:', err);
      });
    });
  }

  /**
   * Add a file conversion job
   */
  async addConversionJob(fileId, options = {}) {
    try {
      const jobId = uuidv4();
      const job = await this.conversionQueue.add('convert-file', {
        fileId,
        jobId,
        ...options
      }, {
        jobId,
        priority: options.priority || 0
      });

      logger.info(`Conversion job added: ${jobId} for file ${fileId}`);
      return { success: true, jobId: job.id };
    } catch (error) {
      logger.error('Failed to add conversion job:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add a PDF merge job
   */
  async addMergeJob(mergeJobId, options = {}) {
    try {
      const jobId = uuidv4();
      const job = await this.mergeQueue.add('merge-pdfs', {
        mergeJobId,
        jobId,
        ...options
      }, {
        jobId,
        priority: options.priority || 0
      });

      logger.info(`Merge job added: ${jobId} for merge ${mergeJobId}`);
      return { success: true, jobId: job.id };
    } catch (error) {
      logger.error('Failed to add merge job:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add an AI processing job
   */
  async addAIJob(fileId, type = 'summarize', options = {}) {
    try {
      const jobId = uuidv4();
      const job = await this.aiQueue.add('ai-process', {
        fileId,
        type,
        jobId,
        ...options
      }, {
        jobId,
        priority: options.priority || 0
      });

      logger.info(`AI job added: ${jobId} for file ${fileId} (type: ${type})`);
      return { success: true, jobId: job.id };
    } catch (error) {
      logger.error('Failed to add AI job:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process file conversion job
   */
  async processConversionJob(job) {
    const { fileId, jobId } = job.data;
    
    try {
      await job.updateProgress(5);
      
      // Get file from database
      const file = await File.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      await job.updateProgress(10);
      
      // Update file status
      await file.updateProcessingStatus('processing');
      
      // Generate output path
      const uploadsDir = process.env.UPLOAD_DIR || 'uploads';
      const outputFilename = `converted_${Date.now()}_${uuidv4()}.pdf`;
      const outputPath = path.join(uploadsDir, outputFilename);
      
      await job.updateProgress(20);
      
      // Convert file
      const result = await conversionService.convertToPdf(
        file.path,
        outputPath,
        file.fileType,
        (progress) => {
          // Scale progress from 20-90%
          const scaledProgress = 20 + (progress * 0.7);
          job.updateProgress(Math.round(scaledProgress));
        }
      );
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      await job.updateProgress(95);
      
      // Update file record
      file.convertedTo = 'pdf';
      file.convertedFilePath = outputPath;
      file.conversionJobId = jobId;
      await file.updateProcessingStatus('completed');
      
      await job.updateProgress(100);
      
      logger.info(`Conversion completed for file ${fileId}`);
      
      return {
        success: true,
        fileId,
        outputPath,
        convertedFilename: outputFilename
      };
      
    } catch (error) {
      logger.error(`Conversion job ${jobId} failed:`, error);
      
      // Update file status
      try {
        const file = await File.findById(fileId);
        if (file) {
          await file.updateProcessingStatus('failed', error.message);
        }
      } catch (dbError) {
        logger.error('Failed to update file status:', dbError);
      }
      
      throw error;
    }
  }

  /**
   * Process PDF merge job
   */
  async processMergeJob(job) {
    const { mergeJobId, jobId } = job.data;
    
    try {
      await job.updateProgress(5);
      
      // Get merge job from database
      const mergeJob = await MergeJob.findOne({ jobId: mergeJobId }).populate('inputFiles.fileId');
      if (!mergeJob) {
        throw new Error(`Merge job not found: ${mergeJobId}`);
      }

      await job.updateProgress(10);
      
      // Update merge job status
      await mergeJob.updateStatus('processing');
      
      // Prepare input files
      const inputFiles = mergeJob.inputFiles
        .sort((a, b) => a.order - b.order)
        .map(file => ({
          path: file.filePath,
          originalName: file.originalName
        }));
      
      // Generate output path
      const uploadsDir = process.env.UPLOAD_DIR || 'uploads';
      const outputFilename = `merged_${Date.now()}_${uuidv4()}.pdf`;
      const outputPath = path.join(uploadsDir, outputFilename);
      
      await job.updateProgress(20);
      
      // Merge PDFs
      const result = await pdfService.mergePDFs(
        inputFiles,
        outputPath,
        mergeJob.options,
        (progress) => {
          // Scale progress from 20-90%
          const scaledProgress = 20 + (progress * 0.7);
          job.updateProgress(Math.round(scaledProgress));
          mergeJob.updateProgress(Math.round(scaledProgress));
        }
      );
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      await job.updateProgress(95);
      
      // Update merge job record
      mergeJob.outputFilename = outputFilename;
      mergeJob.outputFilePath = outputPath;
      mergeJob.outputFileSize = result.metadata.fileSize;
      await mergeJob.updateStatus('completed');
      
      await job.updateProgress(100);
      
      logger.info(`Merge completed for job ${mergeJobId}`);
      
      return {
        success: true,
        mergeJobId,
        outputPath,
        outputFilename,
        metadata: result.metadata
      };
      
    } catch (error) {
      logger.error(`Merge job ${jobId} failed:`, error);
      
      // Update merge job status
      try {
        const mergeJob = await MergeJob.findOne({ jobId: mergeJobId });
        if (mergeJob) {
          await mergeJob.updateStatus('failed', error.message);
        }
      } catch (dbError) {
        logger.error('Failed to update merge job status:', dbError);
      }
      
      throw error;
    }
  }

  /**
   * Process AI job
   */
  async processAIJob(job) {
    const { fileId, type, jobId, options = {} } = job.data;
    
    try {
      await job.updateProgress(5);
      
      // Get file from database
      const file = await File.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      await job.updateProgress(10);
      
      // Determine the PDF path
      let pdfPath = file.path;
      if (file.fileType !== 'pdf' && file.convertedFilePath) {
        pdfPath = file.convertedFilePath;
      } else if (file.fileType !== 'pdf') {
        throw new Error('File must be converted to PDF first');
      }
      
      await job.updateProgress(20);
      
      let result;
      
      switch (type) {
        case 'summarize':
          result = await aiService.summarizePDF(pdfPath, options);
          break;
        case 'analyze':
          result = await aiService.analyzeDocument(pdfPath, options.questions || [], options);
          break;
        default:
          throw new Error(`Unknown AI job type: ${type}`);
      }
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      await job.updateProgress(90);
      
      // Update file record with AI results
      if (type === 'summarize') {
        file.aiSummary = result.summary;
        file.summaryGeneratedAt = new Date();
        await file.save();
      }
      
      await job.updateProgress(100);
      
      logger.info(`AI processing completed for file ${fileId} (type: ${type})`);
      
      return {
        success: true,
        fileId,
        type,
        result: result.summary || result.analysis
      };
      
    } catch (error) {
      logger.error(`AI job ${jobId} failed:`, error);
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId, queueName = null) {
    try {
      const queues = queueName ? 
        [this[`${queueName}Queue`]] : 
        [this.conversionQueue, this.mergeQueue, this.aiQueue];
      
      for (const queue of queues) {
        if (!queue) continue;
        
        const job = await queue.getJob(jobId);
        if (job) {
          return {
            id: job.id,
            name: job.name,
            data: job.data,
            progress: job.progress,
            state: await job.getState(),
            returnvalue: job.returnvalue,
            failedReason: job.failedReason,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn
          };
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get job status:', error);
      return null;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId, queueName = null) {
    try {
      const queues = queueName ? 
        [this[`${queueName}Queue`]] : 
        [this.conversionQueue, this.mergeQueue, this.aiQueue];
      
      for (const queue of queues) {
        if (!queue) continue;
        
        const job = await queue.getJob(jobId);
        if (job) {
          await job.remove();
          logger.info(`Job ${jobId} cancelled`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to cancel job:', error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      const stats = {};
      
      const queueNames = ['conversion', 'merge', 'ai'];
      
      for (const queueName of queueNames) {
        const queue = this[`${queueName}Queue`];
        if (queue) {
          const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getCompleted(),
            queue.getFailed()
          ]);
          
          stats[queueName] = {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length
          };
        }
      }
      
      return stats;
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      return {};
    }
  }

  /**
   * Clean up old jobs
   */
  async cleanup() {
    try {
      const queues = [this.conversionQueue, this.mergeQueue, this.aiQueue];
      
      for (const queue of queues) {
        if (queue) {
          await queue.clean(24 * 60 * 60 * 1000, 100, 'completed'); // Clean completed jobs older than 24 hours
          await queue.clean(48 * 60 * 60 * 1000, 50, 'failed'); // Clean failed jobs older than 48 hours
        }
      }
      
      logger.info('Queue cleanup completed');
    } catch (error) {
      logger.error('Queue cleanup failed:', error);
    }
  }

  /**
   * Close connections and workers
   */
  async close() {
    try {
      const workers = [this.conversionWorker, this.mergeWorker, this.aiWorker];
      const queues = [this.conversionQueue, this.mergeQueue, this.aiQueue];
      
      // Close workers
      await Promise.all(workers.filter(w => w).map(worker => worker.close()));
      
      // Close queues
      await Promise.all(queues.filter(q => q).map(queue => queue.close()));
      
      logger.info('Queue service closed');
    } catch (error) {
      logger.error('Failed to close queue service:', error);
    }
  }
}

module.exports = new QueueService();