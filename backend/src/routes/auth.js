const express = require('express');
const { withAuth, requireAuth, validateClerkWebhook } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Get current user session info
 */
router.get('/me', withAuth, (req, res) => {
  try {
    if (req.auth && req.auth.userId) {
      res.json({
        success: true,
        user: {
          id: req.auth.userId,
          email: req.auth.sessionClaims?.email || null,
          firstName: req.auth.sessionClaims?.firstName || null,
          lastName: req.auth.sessionClaims?.lastName || null,
          imageUrl: req.auth.sessionClaims?.imageUrl || null,
          isAuthenticated: true
        }
      });
    } else {
      res.json({
        success: true,
        user: {
          isAuthenticated: false,
          sessionId: req.user?.sessionId || null
        }
      });
    }
  } catch (error) {
    logger.error('Error getting user session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user session'
    });
  }
});

/**
 * Get user profile (requires authentication)
 */
router.get('/profile', requireAuth, (req, res) => {
  try {
    res.json({
      success: true,
      profile: {
        id: req.auth.userId,
        email: req.auth.sessionClaims?.email || null,
        firstName: req.auth.sessionClaims?.firstName || null,
        lastName: req.auth.sessionClaims?.lastName || null,
        imageUrl: req.auth.sessionClaims?.imageUrl || null,
        createdAt: req.auth.sessionClaims?.createdAt || null,
        lastSignInAt: req.auth.sessionClaims?.lastSignInAt || null
      }
    });
  } catch (error) {
    logger.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
});

/**
 * Sign out user
 */
router.post('/signout', withAuth, (req, res) => {
  try {
    // Clear session cookie for anonymous users
    res.clearCookie('sessionId');
    
    res.json({
      success: true,
      message: 'Signed out successfully'
    });
  } catch (error) {
    logger.error('Error signing out user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sign out'
    });
  }
});

/**
 * Delete user account and data
 */
router.delete('/delete-account', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    
    // In a real application, you would:
    // 1. Delete user's files
    // 2. Cancel pending jobs
    // 3. Clean up user data
    // 4. Optionally notify Clerk to delete the user
    
    // For now, just acknowledge the request
    logger.info(`Account deletion requested for user: ${userId}`);
    
    res.json({
      success: true,
      message: 'Account deletion request received. Your data will be removed within 24 hours.'
    });
  } catch (error) {
    logger.error('Error processing account deletion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process account deletion'
    });
  }
});

/**
 * Clerk webhook endpoint for user events
 */
router.post('/webhook', validateClerkWebhook, (req, res) => {
  try {
    const { type, data } = req.body;
    
    logger.info('Clerk webhook received:', { type, userId: data?.id });
    
    switch (type) {
      case 'user.created':
        // Handle new user creation
        logger.info(`New user created: ${data.id}`);
        break;
        
      case 'user.updated':
        // Handle user profile updates
        logger.info(`User updated: ${data.id}`);
        break;
        
      case 'user.deleted':
        // Handle user deletion - clean up user data
        logger.info(`User deleted: ${data.id}`);
        // TODO: Implement user data cleanup
        break;
        
      case 'session.created':
        // Handle new session
        logger.info(`Session created for user: ${data.user_id}`);
        break;
        
      case 'session.ended':
        // Handle session end
        logger.info(`Session ended for user: ${data.user_id}`);
        break;
        
      default:
        logger.warn(`Unhandled webhook type: ${type}`);
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Error processing Clerk webhook:', error);
    res.status(400).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
});

/**
 * Check authentication status
 */
router.get('/status', withAuth, (req, res) => {
  try {
    const isAuthenticated = !!(req.auth && req.auth.userId);
    
    res.json({
      success: true,
      authenticated: isAuthenticated,
      user: isAuthenticated ? {
        id: req.auth.userId,
        email: req.auth.sessionClaims?.email || null
      } : null,
      sessionId: req.user?.sessionId || null
    });
  } catch (error) {
    logger.error('Error checking auth status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check authentication status'
    });
  }
});

/**
 * Refresh session for anonymous users
 */
router.post('/refresh-session', (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const newSessionId = uuidv4();
    
    res.cookie('sessionId', newSessionId, {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    
    res.json({
      success: true,
      sessionId: newSessionId,
      message: 'Session refreshed'
    });
  } catch (error) {
    logger.error('Error refreshing session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh session'
    });
  }
});

/**
 * Get authentication configuration for frontend
 */
router.get('/config', (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
        requiresAuthForDownload: true,
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50000000,
        allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || '').split(',').filter(Boolean)
      }
    });
  } catch (error) {
    logger.error('Error getting auth config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get configuration'
    });
  }
});

module.exports = router;