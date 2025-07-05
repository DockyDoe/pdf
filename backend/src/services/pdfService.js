const { PDFDocument, PDFPage, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class PDFService {
  constructor() {
    this.maxMergeFiles = 20; // Maximum number of files to merge
    this.maxTotalSize = 100000000; // 100MB max total size for merge operation
  }

  /**
   * Merge multiple PDF files into one
   * @param {Array} inputFiles - Array of {path: string, originalName: string}
   * @param {string} outputPath - Path for merged PDF
   * @param {Object} options - Merge options
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<{success: boolean, outputPath?: string, metadata?: Object, error?: string}>}
   */
  async mergePDFs(inputFiles, outputPath, options = {}, progressCallback = null) {
    try {
      logger.info(`Starting PDF merge: ${inputFiles.length} files -> ${outputPath}`);
      
      if (progressCallback) progressCallback(5);
      
      // Validate inputs
      this.validateMergeInputs(inputFiles);
      
      if (progressCallback) progressCallback(10);
      
      // Create new PDF document
      const mergedPdf = await PDFDocument.create();
      
      // Set metadata
      const metadata = {
        title: options.title || 'Merged PDF',
        author: options.author || 'PDF Utility App',
        subject: options.subject || 'Merged PDF Document',
        creator: 'PDF Utility App',
        producer: 'PDF Utility App',
        creationDate: new Date(),
        modificationDate: new Date()
      };
      
      mergedPdf.setTitle(metadata.title);
      mergedPdf.setAuthor(metadata.author);
      mergedPdf.setSubject(metadata.subject);
      mergedPdf.setCreator(metadata.creator);
      mergedPdf.setProducer(metadata.producer);
      
      if (progressCallback) progressCallback(15);
      
      let totalPages = 0;
      const progressPerFile = 70 / inputFiles.length;
      
      // Process each input file
      for (let i = 0; i < inputFiles.length; i++) {
        const file = inputFiles[i];
        logger.info(`Processing file ${i + 1}/${inputFiles.length}: ${file.originalName}`);
        
        try {
          // Read PDF file
          const pdfBytes = await fs.readFile(file.path);
          const sourcePdf = await PDFDocument.load(pdfBytes);
          
          // Get all pages from source PDF
          const pageCount = sourcePdf.getPageCount();
          const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
          
          // Copy pages to merged document
          const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);
          
          // Add pages to merged document
          copiedPages.forEach((page) => {
            mergedPdf.addPage(page);
          });
          
          totalPages += pageCount;
          
          // Add bookmark if requested
          if (options.bookmarks !== false) {
            // Note: pdf-lib doesn't have built-in bookmark support
            // This would require additional library or custom implementation
          }
          
          const progress = 15 + (i + 1) * progressPerFile;
          if (progressCallback) progressCallback(Math.round(progress));
          
        } catch (error) {
          logger.error(`Error processing file ${file.originalName}:`, error);
          throw new Error(`Failed to process ${file.originalName}: ${error.message}`);
        }
      }
      
      if (progressCallback) progressCallback(85);
      
      // Save merged PDF
      const mergedPdfBytes = await mergedPdf.save();
      await fs.writeFile(outputPath, mergedPdfBytes);
      
      if (progressCallback) progressCallback(95);
      
      // Get file size
      const stats = await fs.stat(outputPath);
      
      const result = {
        success: true,
        outputPath,
        metadata: {
          ...metadata,
          pages: totalPages,
          fileSize: stats.size,
          inputFiles: inputFiles.length
        }
      };
      
      if (progressCallback) progressCallback(100);
      logger.info(`PDF merge completed: ${totalPages} pages, ${stats.size} bytes`);
      
      return result;
      
    } catch (error) {
      logger.error('PDF merge failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract metadata from PDF
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<Object>} PDF metadata
   */
  async extractMetadata(filePath) {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdf = await PDFDocument.load(pdfBytes);
      
      const pageCount = pdf.getPageCount();
      
      // Get document info
      const title = pdf.getTitle() || null;
      const author = pdf.getAuthor() || null;
      const subject = pdf.getSubject() || null;
      const keywords = pdf.getKeywords() || null;
      const creator = pdf.getCreator() || null;
      const producer = pdf.getProducer() || null;
      const creationDate = pdf.getCreationDate() || null;
      const modificationDate = pdf.getModificationDate() || null;
      
      // Get file stats
      const stats = await fs.stat(filePath);
      
      // Get page dimensions (from first page)
      const pages = pdf.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage ? firstPage.getSize() : { width: 0, height: 0 };
      
      return {
        pages: pageCount,
        title,
        author,
        subject,
        keywords,
        creator,
        producer,
        creationDate,
        modificationDate,
        fileSize: stats.size,
        dimensions: {
          width: Math.round(width),
          height: Math.round(height)
        }
      };
      
    } catch (error) {
      logger.error('Error extracting PDF metadata:', error);
      throw new Error(`Failed to extract metadata: ${error.message}`);
    }
  }

  /**
   * Split PDF into individual pages
   * @param {string} inputPath - Path to input PDF
   * @param {string} outputDir - Directory for output files
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
   */
  async splitPDF(inputPath, outputDir, progressCallback = null) {
    try {
      logger.info(`Splitting PDF: ${inputPath}`);
      
      const pdfBytes = await fs.readFile(inputPath);
      const sourcePdf = await PDFDocument.load(pdfBytes);
      const pageCount = sourcePdf.getPageCount();
      
      if (progressCallback) progressCallback(10);
      
      const outputFiles = [];
      const progressPerPage = 80 / pageCount;
      
      for (let i = 0; i < pageCount; i++) {
        const newPdf = await PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(sourcePdf, [i]);
        newPdf.addPage(copiedPage);
        
        const outputFileName = `page_${i + 1}.pdf`;
        const outputPath = path.join(outputDir, outputFileName);
        
        const pdfBytes = await newPdf.save();
        await fs.writeFile(outputPath, pdfBytes);
        
        outputFiles.push({
          path: outputPath,
          filename: outputFileName,
          pageNumber: i + 1
        });
        
        const progress = 10 + (i + 1) * progressPerPage;
        if (progressCallback) progressCallback(Math.round(progress));
      }
      
      if (progressCallback) progressCallback(100);
      
      logger.info(`PDF split completed: ${pageCount} pages`);
      return { success: true, files: outputFiles };
      
    } catch (error) {
      logger.error('PDF split failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add watermark to PDF
   * @param {string} inputPath - Path to input PDF
   * @param {string} outputPath - Path for output PDF
   * @param {string} watermarkText - Watermark text
   * @param {Object} options - Watermark options
   * @returns {Promise<{success: boolean, outputPath?: string, error?: string}>}
   */
  async addWatermark(inputPath, outputPath, watermarkText, options = {}) {
    try {
      const pdfBytes = await fs.readFile(inputPath);
      const pdf = await PDFDocument.load(pdfBytes);
      const pages = pdf.getPages();
      
      const fontSize = options.fontSize || 50;
      const opacity = options.opacity || 0.3;
      const rotation = options.rotation || -45;
      
      for (const page of pages) {
        const { width, height } = page.getSize();
        
        page.drawText(watermarkText, {
          x: width / 2 - (watermarkText.length * fontSize) / 4,
          y: height / 2,
          size: fontSize,
          color: rgb(0.5, 0.5, 0.5),
          opacity: opacity,
          rotate: {
            type: 'degrees',
            angle: rotation,
          },
        });
      }
      
      const watermarkedPdfBytes = await pdf.save();
      await fs.writeFile(outputPath, watermarkedPdfBytes);
      
      return { success: true, outputPath };
      
    } catch (error) {
      logger.error('Watermark addition failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate merge inputs
   */
  validateMergeInputs(inputFiles) {
    if (!inputFiles || inputFiles.length === 0) {
      throw new Error('No input files provided');
    }
    
    if (inputFiles.length > this.maxMergeFiles) {
      throw new Error(`Too many files to merge. Maximum: ${this.maxMergeFiles}`);
    }
    
    // Validate each file
    for (const file of inputFiles) {
      if (!file.path || !file.originalName) {
        throw new Error('Invalid file object: missing path or originalName');
      }
    }
  }

  /**
   * Get PDF info without full metadata extraction
   */
  async getBasicInfo(filePath) {
    try {
      const pdfBytes = await fs.readFile(filePath);
      const pdf = await PDFDocument.load(pdfBytes);
      const stats = await fs.stat(filePath);
      
      return {
        pages: pdf.getPageCount(),
        fileSize: stats.size,
        isValid: true
      };
    } catch (error) {
      return {
        pages: 0,
        fileSize: 0,
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Optimize PDF file size
   */
  async optimizePDF(inputPath, outputPath, options = {}) {
    try {
      const pdfBytes = await fs.readFile(inputPath);
      const pdf = await PDFDocument.load(pdfBytes);
      
      // Basic optimization: save with compression
      const optimizedBytes = await pdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50,
      });
      
      await fs.writeFile(outputPath, optimizedBytes);
      
      const originalStats = await fs.stat(inputPath);
      const optimizedStats = await fs.stat(outputPath);
      
      const savings = originalStats.size - optimizedStats.size;
      const savingsPercent = Math.round((savings / originalStats.size) * 100);
      
      return {
        success: true,
        outputPath,
        originalSize: originalStats.size,
        optimizedSize: optimizedStats.size,
        savings,
        savingsPercent
      };
      
    } catch (error) {
      logger.error('PDF optimization failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PDFService();