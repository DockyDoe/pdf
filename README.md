# 🔥 PDF Utility App

A modern, responsive PDF utility web application that enables users to convert files to PDF, merge PDFs, view documents, and get AI-powered summaries using Google's Gemini API.

![PDF Utility App](https://img.shields.io/badge/Version-1.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)
![React](https://img.shields.io/badge/React-18.2.0-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## ✨ Features

### 🔄 File Conversion
- **Multiple Format Support**: Convert Word, PowerPoint, Excel, JPG, PNG, JPEG files to PDF
- **High-Quality Output**: Preserves formatting and image quality
- **Batch Processing**: Convert multiple files simultaneously
- **Progress Tracking**: Real-time conversion progress with WebSocket updates

### 📄 PDF Operations
- **PDF Merging**: Combine multiple PDFs into one document
- **Metadata Extraction**: Extract document properties, page counts, and creation info
- **PDF Viewer**: Built-in full-featured PDF viewer
- **File Preview**: Preview documents before download

### 🤖 AI-Powered Features
- **Smart Summarization**: AI-powered PDF content summarization using Gemini API
- **Multi-language Support**: Summarize documents in different languages
- **Content Analysis**: Extract key insights from tables, images, and text
- **Customizable Detail Levels**: Brief, medium, or detailed summaries

### 🔐 Authentication & Access
- **Clerk Integration**: Modern authentication with SSO support
- **Guest Access**: Use core features without signing in
- **Download Protection**: Authentication required for file downloads
- **Session Management**: Secure session handling for anonymous users

### 🎨 Modern UI/UX
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Dark/Light Mode**: GitHub-style theme switching
- **Smooth Animations**: Framer Motion and GSAP powered animations
- **Glass Morphism**: Modern design aesthetic with backdrop blur effects
- **Interactive Elements**: Drag-and-drop file uploads, progress indicators

### ⚡ Performance & Reliability
- **Queue System**: BullMQ + Redis for background job processing
- **Real-time Updates**: WebSocket connections for live progress tracking
- **File Management**: Automatic cleanup and expiration handling
- **Error Recovery**: Robust error handling and retry mechanisms

## 🏗️ Architecture

### Backend Stack
- **Runtime**: Node.js + Express.js
- **Database**: MongoDB with Mongoose ODM
- **Cache/Queue**: Redis + BullMQ for job processing
- **Authentication**: Clerk for user management
- **AI Integration**: Google Gemini API
- **File Processing**: LibreOffice, Sharp, PDF-lib
- **Real-time**: WebSocket (ws) for live updates
- **Logging**: Winston for structured logging

### Frontend Stack
- **Framework**: React 18 with hooks
- **Routing**: React Router DOM
- **Styling**: TailwindCSS with custom design system
- **Animations**: Framer Motion + GSAP
- **State Management**: Zustand
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **File Uploads**: React Dropzone
- **PDF Viewing**: React PDF

### Infrastructure
- **Containerization**: Docker support for Redis and MongoDB
- **Development**: Concurrent development servers
- **Build System**: Create React App with custom configurations
- **Environment**: Environment-based configuration

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- Docker and Docker Compose
- Git

### 1. Clone the Repository
```bash
git clone <repository-url>
cd pdf-utility-app
```

### 2. Start Services
```bash
# Start MongoDB and Redis using Docker
npm run docker:up

# Install all dependencies
npm run install:all
```

### 3. Environment Setup

#### Backend Configuration
```bash
cd backend
cp .env.example .env
```

Update the `.env` file with your API keys:
```env
# Required: Get these from your service providers
CLERK_SECRET_KEY=your_clerk_secret_key_here
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Customize as needed
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://admin:password@localhost:27017/pdf-utility?authSource=admin
REDIS_URL=redis://localhost:6379
```

#### Frontend Configuration
The frontend will automatically connect to the backend via the proxy configuration.

### 4. Start Development Servers
```bash
# Start both frontend and backend concurrently
npm run dev

# Or start them separately:
npm run dev:backend  # Starts on http://localhost:5000
npm run dev:frontend # Starts on http://localhost:3000
```

### 5. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **WebSocket**: ws://localhost:5001

## 🔧 Configuration

### API Keys Setup

#### Clerk Authentication
1. Sign up at [Clerk.dev](https://clerk.dev)
2. Create a new application
3. Copy the publishable and secret keys
4. Add to your environment variables

#### Google Gemini API
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create an API key
3. Add to your environment variables

### File Processing Requirements

#### LibreOffice (for Office document conversion)
```bash
# Ubuntu/Debian
sudo apt-get install libreoffice

# macOS
brew install --cask libreoffice

# Windows
# Download and install from https://www.libreoffice.org/
```

## 📁 Project Structure

```
pdf-utility-app/
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── config/         # Database and Redis connections
│   │   ├── middleware/     # Authentication, uploads, error handling
│   │   ├── models/         # MongoDB schemas
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic (conversion, PDF, AI, queue)
│   │   ├── utils/          # Utilities and helpers
│   │   ├── websocket/      # WebSocket handlers
│   │   └── server.js       # Main application entry
│   ├── uploads/            # File storage directory
│   ├── logs/               # Application logs
│   └── package.json
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Application pages
│   │   ├── hooks/          # Custom React hooks
│   │   ├── store/          # Zustand state management
│   │   ├── utils/          # Frontend utilities
│   │   ├── styles/         # Additional styles
│   │   └── App.js          # Main React component
│   ├── public/             # Static assets
│   └── package.json
├── docker-compose.yml      # Development services
└── package.json           # Root package.json
```

## 🎯 Usage Guide

### File Upload and Conversion
1. **Upload Files**: Drag and drop or click to select files
2. **Auto-Detection**: File types are automatically detected
3. **Convert**: Click convert to start the process
4. **Monitor Progress**: Watch real-time conversion progress
5. **Download**: Sign in to download converted files

### PDF Merging
1. **Upload PDFs**: Upload multiple PDF files
2. **Arrange Order**: Drag to reorder files
3. **Configure Options**: Set merge preferences
4. **Start Merge**: Begin the merging process
5. **Download Result**: Get the combined PDF

### AI Summarization
1. **Upload PDF**: Ensure file is converted to PDF
2. **Choose Options**: Select detail level and preferences
3. **Generate Summary**: AI processes the document
4. **View Results**: Read the generated summary
5. **Export**: Save or share the summary

### Viewing PDFs
- **Built-in Viewer**: Preview PDFs without downloading
- **Navigation**: Page-by-page navigation
- **Zoom Controls**: Zoom in/out for better viewing
- **Responsive**: Works on all device sizes

## 🔌 API Endpoints

### Authentication
- `GET /api/auth/me` - Get current user
- `GET /api/auth/status` - Check auth status
- `POST /api/auth/signout` - Sign out user

### Files
- `POST /api/files/upload` - Upload single file
- `POST /api/files/upload-multiple` - Upload multiple files
- `GET /api/files` - List user files
- `GET /api/files/:id` - Get file details
- `DELETE /api/files/:id` - Delete file

### Conversion
- `POST /api/conversion/convert/:id` - Start conversion
- `GET /api/conversion/status/:jobId` - Get conversion status
- `GET /api/conversion/supported-types` - Get supported file types
- `POST /api/conversion/batch-convert` - Batch convert files

### PDF Operations
- `POST /api/pdf/merge` - Start PDF merge
- `GET /api/pdf/merge/:jobId` - Get merge status
- `POST /api/pdf/summarize/:id` - Start AI summarization
- `GET /api/pdf/ai/status` - Get AI service status

### Downloads
- `GET /api/download/file/:id` - Download converted file (auth required)
- `GET /api/download/merge/:jobId` - Download merged PDF (auth required)
- `GET /api/download/preview/:id` - Preview file (no auth)

## 🧪 Testing

### Backend Testing
```bash
cd backend
npm test
```

### Frontend Testing
```bash
cd frontend
npm test
```

### Manual Testing
1. Start the development environment
2. Test file uploads and conversions
3. Verify PDF merging functionality
4. Test AI summarization (requires API key)
5. Check authentication flows
6. Test download functionality

## 🚢 Production Deployment

### Environment Variables
Ensure all production environment variables are set:
- Database connections
- API keys
- Security settings
- File storage paths

### Build Process
```bash
# Build frontend
npm run build:frontend

# Build backend (if needed)
npm run build:backend
```

### Docker Deployment
```bash
# Production services
docker-compose -f docker-compose.prod.yml up -d
```

### Performance Considerations
- Configure Redis for production
- Set up MongoDB with proper indexes
- Configure file cleanup jobs
- Set up proper logging
- Configure reverse proxy (nginx)
- Set up SSL certificates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Guidelines
- Follow the existing code style
- Add JSDoc comments for functions
- Update README for new features
- Test your changes thoroughly

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Clerk** for authentication services
- **Google** for Gemini AI API
- **LibreOffice** for document conversion
- **React** and **Node.js** communities
- **TailwindCSS** for the design system

## 📞 Support

For support, please:
1. Check the [Issues](issues) page
2. Create a new issue with detailed information
3. Include logs and error messages
4. Describe steps to reproduce

## 🗺️ Roadmap

### Planned Features
- [ ] OCR text extraction from images
- [ ] Batch PDF splitting
- [ ] Digital signature support
- [ ] Form filling capabilities
- [ ] Password protection for PDFs
- [ ] Cloud storage integration
- [ ] API rate limiting dashboard
- [ ] Advanced AI analysis features
- [ ] Mobile app (React Native)
- [ ] Collaboration features

### Performance Improvements
- [ ] CDN integration for file serving
- [ ] Advanced caching strategies
- [ ] Database optimization
- [ ] Horizontal scaling support

---

**Built with ❤️ using modern web technologies**