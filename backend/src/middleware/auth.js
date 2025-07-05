const { ClerkExpressRequireAuth, ClerkExpressWithAuth } = require('@clerk/express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Middleware that requires authentication (blocks requests without valid auth)
const requireAuth = ClerkExpressRequireAuth({
  onError: (error) => {
    logger.error('Clerk authentication error:', error);
    return {
      status: 401,
      message: 'Authentication required'
    };
  }
});

// Middleware that adds auth info but doesn't require it (optional auth)
const withAuth = ClerkExpressWithAuth({
  onError: (error) => {
    logger.warn('Clerk authentication warning:', error);
    // Don't block the request, just log the warning
  }
});

// Middleware to handle user identification (authenticated or anonymous)
const identifyUser = (req, res, next) => {
  // If user is authenticated via Clerk
  if (req.auth && req.auth.userId) {
    req.user = {
      id: req.auth.userId,
      email: req.auth.sessionClaims?.email || null,
      isAuthenticated: true
    };
    logger.info(`Authenticated user: ${req.user.id}`);
  } else {
    // For anonymous users, create or use session ID
    let sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
    
    if (!sessionId) {
      sessionId = uuidv4();
      // Set session cookie for 24 hours
      res.cookie('sessionId', sessionId, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
    
    req.user = {
      sessionId,
      isAuthenticated: false
    };
    logger.info(`Anonymous user session: ${sessionId}`);
  }
  
  next();
};

// Middleware to require authentication for downloads
const requireAuthForDownload = (req, res, next) => {
  if (!req.user || !req.user.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required for downloads. Please sign in to download files.',
      requiresAuth: true
    });
  }
  next();
};

// Middleware to optionally require authentication (configurable)
const optionalAuth = (required = false) => {
  return (req, res, next) => {
    if (required && (!req.user || !req.user.isAuthenticated)) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required for this action',
        requiresAuth: true
      });
    }
    next();
  };
};

// Middleware to check if user owns the resource or has access
const checkResourceAccess = (getResourceIdentifier) => {
  return async (req, res, next) => {
    try {
      const resourceId = getResourceIdentifier(req);
      
      // If user is authenticated, check by user ID
      if (req.user && req.user.isAuthenticated) {
        req.accessQuery = { userId: req.user.id };
      } else if (req.user && req.user.sessionId) {
        // If anonymous, check by session ID
        req.accessQuery = { sessionId: req.user.sessionId };
      } else {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      next();
    } catch (error) {
      logger.error('Resource access check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking resource access'
      });
    }
  };
};

// Middleware to validate Clerk webhook signatures
const validateClerkWebhook = (req, res, next) => {
  const signature = req.headers['svix-signature'];
  const timestamp = req.headers['svix-timestamp'];
  const payload = req.body;

  // In production, you should verify the webhook signature
  // For now, we'll just check if the required headers are present
  if (!signature || !timestamp) {
    return res.status(400).json({
      success: false,
      message: 'Invalid webhook signature'
    });
  }

  next();
};

module.exports = {
  requireAuth,
  withAuth,
  identifyUser,
  requireAuthForDownload,
  optionalAuth,
  checkResourceAccess,
  validateClerkWebhook
};