const libre = require('libreoffice-convert');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const logger = require('../utils/logger');

// Promisify libre.convert
const convertAsync = promisify(libre.convert);

class ConversionService {
  constructor() {
    this.supportedFormats = {
      // Office documents
      'doc': { converter: 'libre', outputFormat: 'pdf' },
      'docx': { converter: 'libre', outputFormat: 'pdf' },
      'ppt': { converter: 'libre', outputFormat: 'pdf' },
      'pptx': { converter: 'libre', outputFormat: 'pdf' },
      'xls': { converter: 'libre', outputFormat: 'pdf' },
      'xlsx': { converter: 'libre', outputFormat: 'pdf' },
      
      // Images
      'jpg': { converter: 'image', outputFormat: 'pdf' },
      'jpeg': { converter: 'image', outputFormat: 'pdf' },
      'png': { converter: 'image', outputFormat: 'pdf' },
      
      // PDF (no conversion needed)
      'pdf': { converter: 'none', outputFormat: 'pdf' }
    };
  }

  /**
   * Convert a file to PDF
   * @param {string} inputPath - Path to input file
   * @param {string} outputPath - Path for output file
   * @param {string} fileType - Type of input file
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<{success: boolean, outputPath?: string, error?: string}>}
   */
  async convertToPdf(inputPath, outputPath, fileType, progressCallback = null) {
    try {
      logger.info(`Starting conversion: ${inputPath} -> ${outputPath} (type: ${fileType})`);
      
      if (progressCallback) progressCallback(10);
      
      const converter = this.supportedFormats[fileType];
      if (!converter) {
        throw new Error(`Unsupported file type: ${fileType}`);
      }
      
      if (converter.converter === 'none') {
        // PDF file, just copy it
        await fs.copyFile(inputPath, outputPath);
        if (progressCallback) progressCallback(100);
        return { success: true, outputPath };
      }
      
      if (progressCallback) progressCallback(30);
      
      let result;
      switch (converter.converter) {
        case 'libre':
          result = await this.convertWithLibreOffice(inputPath, outputPath, progressCallback);
          break;
        case 'image':
          result = await this.convertImageToPdf(inputPath, outputPath, progressCallback);
          break;
        default:
          throw new Error(`Unknown converter: ${converter.converter}`);
      }
      
      if (progressCallback) progressCallback(100);
      logger.info(`Conversion completed: ${outputPath}`);
      
      return result;
    } catch (error) {
      logger.error(`Conversion failed for ${inputPath}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Convert office documents using LibreOffice
   */
  async convertWithLibreOffice(inputPath, outputPath, progressCallback = null) {
    try {
      if (progressCallback) progressCallback(40);
      
      // Read the input file
      const inputBuffer = await fs.readFile(inputPath);
      
      if (progressCallback) progressCallback(60);
      
      // Convert using LibreOffice
      const pdfBuffer = await convertAsync(inputBuffer, '.pdf', undefined);
      
      if (progressCallback) progressCallback(80);
      
      // Write the output file
      await fs.writeFile(outputPath, pdfBuffer);
      
      if (progressCallback) progressCallback(90);
      
      return { success: true, outputPath };
    } catch (error) {
      logger.error('LibreOffice conversion error:', error);
      throw new Error(`LibreOffice conversion failed: ${error.message}`);
    }
  }

  /**
   * Convert images to PDF using Sharp and PDF-lib
   */
  async convertImageToPdf(inputPath, outputPath, progressCallback = null) {
    try {
      const PDFDocument = require('pdf-lib').PDFDocument;
      
      if (progressCallback) progressCallback(40);
      
      // Process image with Sharp to ensure it's in a compatible format
      const processedImageBuffer = await sharp(inputPath)
        .jpeg({ quality: 85 }) // Convert to JPEG for smaller file size
        .toBuffer();
      
      if (progressCallback) progressCallback(60);
      
      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Embed the image
      const image = await pdfDoc.embedJpg(processedImageBuffer);
      
      if (progressCallback) progressCallback(70);
      
      // Get image dimensions
      const { width, height } = image.scale(1);
      
      // Calculate page size to fit image (max A4 size)
      const maxWidth = 595; // A4 width in points
      const maxHeight = 842; // A4 height in points
      
      let pageWidth = width;
      let pageHeight = height;
      
      // Scale down if image is larger than A4
      if (width > maxWidth || height > maxHeight) {
        const widthRatio = maxWidth / width;
        const heightRatio = maxHeight / height;
        const ratio = Math.min(widthRatio, heightRatio);
        
        pageWidth = width * ratio;
        pageHeight = height * ratio;
      }
      
      if (progressCallback) progressCallback(80);
      
      // Add page and draw image
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
      
      // Add metadata
      pdfDoc.setTitle(`Converted from ${path.basename(inputPath)}`);
      pdfDoc.setCreator('PDF Utility App');
      pdfDoc.setProducer('PDF Utility App');
      
      if (progressCallback) progressCallback(90);
      
      // Save PDF
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      
      return { success: true, outputPath };
    } catch (error) {
      logger.error('Image to PDF conversion error:', error);
      throw new Error(`Image conversion failed: ${error.message}`);
    }
  }

  /**
   * Get supported file types
   */
  getSupportedTypes() {
    return Object.keys(this.supportedFormats);
  }

  /**
   * Check if file type is supported
   */
  isSupported(fileType) {
    return fileType in this.supportedFormats;
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      
      return {
        size: stats.size,
        type: ext,
        supported: this.isSupported(ext),
        modified: stats.mtime
      };
    } catch (error) {
      logger.error('Error getting file info:', error);
      throw error;
    }
  }

  /**
   * Validate input file
   */
  async validateInputFile(filePath, fileType) {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Check if file type is supported
      if (!this.isSupported(fileType)) {
        throw new Error(`Unsupported file type: ${fileType}`);
      }
      
      // Check file size (max 50MB)
      const stats = await fs.stat(filePath);
      const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 50000000;
      
      if (stats.size > maxSize) {
        throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize} bytes)`);
      }
      
      return true;
    } catch (error) {
      logger.error('File validation error:', error);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePaths) {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    
    for (const filePath of paths) {
      try {
        await fs.unlink(filePath);
        logger.info(`Cleaned up file: ${filePath}`);
      } catch (error) {
        logger.warn(`Failed to cleanup file ${filePath}:`, error);
      }
    }
  }

  /**
   * Get conversion progress estimate based on file size and type
   */
  getEstimatedTime(fileSize, fileType) {
    // Rough estimates in seconds
    const baseTime = {
      'pdf': 1,
      'jpg': 2, 'jpeg': 2, 'png': 3,
      'doc': 5, 'docx': 5,
      'ppt': 8, 'pptx': 8,
      'xls': 6, 'xlsx': 6
    };
    
    const sizeMultiplier = Math.max(1, fileSize / 1000000); // Per MB
    return (baseTime[fileType] || 5) * sizeMultiplier;
  }
}

module.exports = new ConversionService();