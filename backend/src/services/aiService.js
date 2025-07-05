const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const pdf2pic = require('pdf2pic');
const path = require('path');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.initialized = false;
    this.maxPageSize = 5000000; // 5MB max per page image
    this.maxTotalPages = 20; // Max pages to process for summary
  }

  /**
   * Initialize the Gemini AI service
   */
  async initialize() {
    try {
      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'placeholder_replace_with_real_key') {
        logger.warn('Gemini API key not configured. AI summarization will be disabled.');
        return false;
      }

      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      this.initialized = true;
      
      logger.info('Gemini AI service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Gemini AI:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Check if AI service is available
   */
  isAvailable() {
    return this.initialized && this.model;
  }

  /**
   * Summarize PDF content
   * @param {string} pdfPath - Path to PDF file
   * @param {Object} options - Summarization options
   * @returns {Promise<{success: boolean, summary?: string, error?: string}>}
   */
  async summarizePDF(pdfPath, options = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error('AI service not available. Please configure Gemini API key.');
      }

      logger.info(`Starting PDF summarization: ${pdfPath}`);

      // Convert PDF pages to images
      const pageImages = await this.convertPDFToImages(pdfPath);
      
      if (pageImages.length === 0) {
        throw new Error('No pages could be converted from PDF');
      }

      // Limit the number of pages to process
      const pagesToProcess = pageImages.slice(0, this.maxTotalPages);
      
      // Prepare the prompt
      const prompt = this.buildSummarizationPrompt(options);
      
      // Process pages in batches to avoid token limits
      const batchSize = 5;
      const summaries = [];
      
      for (let i = 0; i < pagesToProcess.length; i += batchSize) {
        const batch = pagesToProcess.slice(i, i + batchSize);
        const batchSummary = await this.processBatch(batch, prompt, i + 1);
        summaries.push(batchSummary);
      }
      
      // Combine all summaries
      const finalSummary = await this.combineSummaries(summaries, options);
      
      // Clean up temporary image files
      await this.cleanupImages(pageImages);
      
      logger.info('PDF summarization completed successfully');
      
      return {
        success: true,
        summary: finalSummary
      };

    } catch (error) {
      logger.error('PDF summarization failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert PDF to images for AI processing
   */
  async convertPDFToImages(pdfPath) {
    try {
      const outputDir = path.dirname(pdfPath);
      const baseName = path.basename(pdfPath, '.pdf');
      
      const convert = pdf2pic.fromPath(pdfPath, {
        density: 100, // DPI
        saveFilename: `${baseName}_page`,
        savePath: outputDir,
        format: 'jpeg',
        width: 800, // Reduce size for AI processing
        height: 1200
      });

      // Convert all pages
      const results = await convert.bulk(-1, { responseType: 'buffer' });
      
      const imageFiles = [];
      
      for (const result of results) {
        if (result.buffer) {
          const imagePath = path.join(outputDir, `${baseName}_page.${result.page}.jpeg`);
          await fs.writeFile(imagePath, result.buffer);
          imageFiles.push(imagePath);
        }
      }
      
      logger.info(`Converted ${imageFiles.length} pages to images`);
      return imageFiles;
      
    } catch (error) {
      logger.error('PDF to image conversion failed:', error);
      throw new Error(`Failed to convert PDF to images: ${error.message}`);
    }
  }

  /**
   * Process a batch of page images
   */
  async processBatch(imagePaths, basePrompt, startPage) {
    try {
      const parts = [
        {
          text: `${basePrompt}\n\nAnalyze the following PDF pages (starting from page ${startPage}):\n`
        }
      ];

      // Add images to the request
      for (let i = 0; i < imagePaths.length; i++) {
        const imageBuffer = await fs.readFile(imagePaths[i]);
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBuffer.toString('base64')
          }
        });
        parts.push({
          text: `Page ${startPage + i}:`
        });
      }

      const result = await this.model.generateContent(parts);
      const response = await result.response;
      
      return response.text();
      
    } catch (error) {
      logger.error('Batch processing failed:', error);
      return `Error processing pages ${startPage}-${startPage + imagePaths.length - 1}: ${error.message}`;
    }
  }

  /**
   * Combine multiple summaries into one
   */
  async combineSummaries(summaries, options) {
    if (summaries.length === 1) {
      return summaries[0];
    }

    try {
      const combinedText = summaries.join('\n\n---\n\n');
      
      const prompt = `
Please create a comprehensive summary by combining these section summaries from a PDF document:

${combinedText}

Requirements:
- Create a cohesive, well-structured summary
- Highlight the main topics and key points
- Maintain important details about tables, charts, and images mentioned
- Remove redundancy and inconsistencies
- Organize information logically
- Keep the summary concise but comprehensive
- Include section headings if appropriate

${options.includeMetrics ? 'Include any metrics, statistics, or numerical data mentioned.' : ''}
${options.detailLevel === 'detailed' ? 'Provide a detailed summary.' : 'Provide a concise summary.'}
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      return response.text();
      
    } catch (error) {
      logger.error('Summary combination failed:', error);
      // Fallback to joining summaries
      return summaries.join('\n\n');
    }
  }

  /**
   * Build summarization prompt based on options
   */
  buildSummarizationPrompt(options = {}) {
    const detailLevel = options.detailLevel || 'medium';
    const includeMetrics = options.includeMetrics !== false;
    const includeImages = options.includeImages !== false;
    const includeTables = options.includeTables !== false;
    const language = options.language || 'english';

    let prompt = `
You are an expert document analyst. Please analyze the provided PDF pages and create a comprehensive summary in ${language}.

Instructions:
1. Read and understand all text content
2. Identify main topics, themes, and key points
3. ${includeTables ? 'Analyze any tables, charts, or structured data' : 'Focus on text content'}
4. ${includeImages ? 'Describe relevant images, diagrams, or visual elements' : 'Focus on text-based content'}
5. ${includeMetrics ? 'Extract and highlight important metrics, statistics, and numerical data' : 'Focus on conceptual content'}

Summary requirements:
- ${detailLevel === 'brief' ? 'Keep it concise (2-3 paragraphs)' : detailLevel === 'detailed' ? 'Provide comprehensive details' : 'Provide balanced detail level'}
- Use clear, professional language
- Organize information logically with headings if needed
- Highlight the most important insights
- Maintain accuracy to the source material

Format the response as a well-structured summary with:
- Executive Summary (key points)
- Main Content (organized by topics)
- Important Details (tables, figures, metrics if present)
- Conclusions (if any)
`;

    return prompt;
  }

  /**
   * Clean up temporary image files
   */
  async cleanupImages(imagePaths) {
    for (const imagePath of imagePaths) {
      try {
        await fs.unlink(imagePath);
      } catch (error) {
        logger.warn(`Failed to cleanup image ${imagePath}:`, error);
      }
    }
  }

  /**
   * Extract text-only summary (fallback method)
   */
  async extractTextSummary(text, options = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error('AI service not available');
      }

      const prompt = `
Please summarize the following text content:

${text}

Requirements:
- Create a clear, concise summary
- Highlight main points and key information
- ${options.detailLevel === 'brief' ? 'Keep it brief' : 'Provide adequate detail'}
- Use professional language
- Organize with headings if appropriate
`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      return {
        success: true,
        summary: response.text()
      };
      
    } catch (error) {
      logger.error('Text summarization failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze document for specific questions
   */
  async analyzeDocument(pdfPath, questions, options = {}) {
    try {
      if (!this.isAvailable()) {
        throw new Error('AI service not available');
      }

      const pageImages = await this.convertPDFToImages(pdfPath);
      const pagesToProcess = pageImages.slice(0, this.maxTotalPages);

      const prompt = `
Please analyze the following PDF document and answer these specific questions:

${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Instructions:
- Provide clear, accurate answers based on the document content
- Reference specific sections or pages when possible
- If information is not available in the document, state that clearly
- Use professional, objective language
`;

      const parts = [{ text: prompt }];
      
      for (const imagePath of pagesToProcess) {
        const imageBuffer = await fs.readFile(imagePath);
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBuffer.toString('base64')
          }
        });
      }

      const result = await this.model.generateContent(parts);
      const response = await result.response;
      
      await this.cleanupImages(pageImages);
      
      return {
        success: true,
        analysis: response.text()
      };
      
    } catch (error) {
      logger.error('Document analysis failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get service status and configuration
   */
  getStatus() {
    return {
      available: this.isAvailable(),
      initialized: this.initialized,
      maxPages: this.maxTotalPages,
      hasApiKey: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'placeholder_replace_with_real_key'
    };
  }
}

module.exports = new AIService();