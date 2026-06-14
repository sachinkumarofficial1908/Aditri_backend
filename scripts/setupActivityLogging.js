#!/usr/bin/env node

/**
 * Activity Logging System Setup Script
 * Initializes database collections and indexes for activity logging
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const logger = require('../src/utils/logger');
const ActivityLog = require('../src/models/ActivityLog');

async function setupActivityLogging() {
  try {
    // Connect to database
    logger.info('Connecting to MongoDB...');
    
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    logger.info('MongoDB connected successfully');

    // Ensure ActivityLog collection exists
    logger.info('Creating ActivityLog collection...');
    await ActivityLog.collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
    logger.info('✓ TTL index created (90 days)');

    // Create compound indexes
    const indexes = [
      { userId: 1, timestamp: -1 },
      { action: 1, timestamp: -1 },
      { targetType: 1, timestamp: -1 },
      { userRole: 1, timestamp: -1 },
      { status: 1, timestamp: -1 },
      { path: 1, timestamp: -1 },
      { statusCode: 1, timestamp: -1 },
    ];

    for (const index of indexes) {
      try {
        await ActivityLog.collection.createIndex(index);
        logger.info(`✓ Index created: ${JSON.stringify(index)}`);
      } catch (err) {
        logger.warn(`Index already exists: ${JSON.stringify(index)}`);
      }
    }

    // Create logs directory
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      logger.info(`✓ Logs directory created: ${logsDir}`);
    }

    // Create daily logs directory for production
    if (process.env.NODE_ENV === 'production') {
      const dailyLogsDir = path.join(logsDir, 'daily');
      if (!fs.existsSync(dailyLogsDir)) {
        fs.mkdirSync(dailyLogsDir, { recursive: true });
        logger.info(`✓ Daily logs directory created: ${dailyLogsDir}`);
      }
    }

    logger.info('✓ Activity logging setup completed successfully!');
    
    // Display collection info
    const collectionStats = await ActivityLog.collection.stats();
    logger.info(`ActivityLog Collection Stats:`, {
      count: collectionStats.count,
      size: `${(collectionStats.size / 1024).toFixed(2)} KB`,
      indexes: collectionStats.nindexes,
    });

    console.log('\n✅ Activity Logging System is ready to use!\n');
    console.log('Key Features:');
    console.log('  • HTTP request logging with Morgan');
    console.log('  • Winston structured logging to files');
    console.log('  • User activity tracking to MongoDB');
    console.log('  • Automatic log rotation (production)');
    console.log('  • Audit trails and statistics\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error('Setup failed:', { error: error.message, stack: error.stack });
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setupActivityLogging();
