# 🚀 Quick Setup Guide

## Prerequisites
- Node.js 18+ installed
- Docker and Docker Compose installed
- Git

## 1. Start Infrastructure
```bash
# Start MongoDB and Redis containers
npm run docker:up
```

## 2. Install Dependencies
```bash
# Install all project dependencies
npm run install:all
```

## 3. Configure Environment
```bash
cd backend
cp .env.example .env
```

**Update backend/.env with your API keys:**
- Get Clerk keys from: https://clerk.dev
- Get Gemini API key from: https://aistudio.google.com/app/apikey

## 4. Start Development
```bash
# From project root
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- WebSocket: ws://localhost:5001

## 5. Test the Application
1. Upload a file (Word, Excel, PowerPoint, or image)
2. Convert it to PDF
3. Try merging multiple PDFs
4. Test AI summarization (requires Gemini API key)
5. Sign in to download files

## Production Notes
- Configure proper API keys
- Set up SSL certificates
- Configure reverse proxy
- Set up file cleanup jobs
- Monitor logs and performance

## Troubleshooting
- Ensure Docker containers are running
- Check API keys are valid
- Verify LibreOffice is installed for document conversion
- Check logs in backend/logs/ directory