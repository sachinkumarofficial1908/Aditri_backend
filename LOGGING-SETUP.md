#!/bin/bash

# Activity Logging System - Setup and Integration Guide

## Quick Start

### 1. Database Migration
Run this migration script to ensure ActivityLog collection exists with proper indexes:

```bash
node scripts/setupActivityLogging.js
```

### 2. Environment Configuration
Update your `.env` file:

```env
NODE_ENV=development
LOG_LEVEL=debug
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### 3. Server Restart
The logging middleware is automatically integrated in server.js. Just restart the server:

```bash
npm run dev
```

---

## Integrating into Existing Controllers

### Step 1: Import the Activity Tracker
```javascript
const tracker = require('../utils/activityTracker');
```

### Step 2: Add Tracking to Your Controller

#### Employee Controller Example
```javascript
// src/controllers/employeeController.js

const tracker = require('../utils/activityTracker');

exports.createEmployee = async (req, res, next) => {
  try {
    const employee = new Employee(req.body);
    await employee.save();
    
    // Log the activity
    await tracker.logEmployeeCreate(req, employee);
    
    res.json({ success: true, data: employee });
  } catch (error) {
    await tracker.logError(req, 'employee_create', 'employee', error.message);
    next(error);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const changes = req.body;
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      changes,
      { new: true }
    );
    
    // Log the activity with changes
    await tracker.logEmployeeUpdate(req, employee, changes);
    
    res.json({ success: true, data: employee });
  } catch (error) {
    await tracker.logError(req, 'employee_update', 'employee', error.message);
    next(error);
  }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    await Employee.findByIdAndDelete(req.params.id);
    
    // Log the activity
    await tracker.logEmployeeDelete(req, employee);
    
    res.json({ success: true, message: 'Employee deleted' });
  } catch (error) {
    await tracker.logError(req, 'employee_delete', 'employee', error.message);
    next(error);
  }
};
```

#### Auth Controller Example
```javascript
// src/controllers/authController.js

const tracker = require('../utils/activityTracker');

exports.login = async (req, res, next) => {
  try {
    // ... login logic ...
    
    // Log the activity after successful login
    await tracker.logLogin(req, user);
    
    res.json({ success: true, token, user });
  } catch (error) {
    await tracker.logError(req, 'login', 'auth', error.message);
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    // Log the activity
    await tracker.logLogout(req, req.user);
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    await tracker.logError(req, 'logout', 'auth', error.message);
    next(error);
  }
};
```

#### Attendance Controller Example
```javascript
// src/controllers/attendanceController.js

const tracker = require('../utils/activityTracker');

exports.generateAttendance = async (req, res, next) => {
  try {
    const { month, year, uploadType } = req.body;
    
    // ... attendance generation logic ...
    
    const recordCount = result.length;
    
    // Log successful operation
    await tracker.logAttendanceGenerate(
      req,
      month,
      year,
      uploadType,
      recordCount,
      'success'
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    // Log failed operation
    await tracker.logAttendanceGenerate(
      req,
      req.body.month,
      req.body.year,
      req.body.uploadType,
      0,
      'failed',
      error.message
    );
    next(error);
  }
};
```

#### Salary Controller Example
```javascript
// src/controllers/salaryController.js

const tracker = require('../utils/activityTracker');

exports.generateSalary = async (req, res, next) => {
  try {
    const { salaryType, month, year } = req.body;
    
    // ... salary generation logic ...
    
    const salaries = result.data;
    
    // Log successful operation
    await tracker.logSalaryGenerate(
      req,
      salaryType,
      month,
      year,
      salaries.length,
      'success'
    );
    
    res.json({ success: true, data: salaries });
  } catch (error) {
    // Log failed operation
    await tracker.logSalaryGenerate(
      req,
      req.body.salaryType,
      req.body.month,
      req.body.year,
      0,
      'failed',
      error.message
    );
    next(error);
  }
};
```

---

## Viewing Logs

### 1. Via Database
```javascript
const ActivityLog = require('./src/models/ActivityLog');

// Get recent activities
const logs = await ActivityLog.find()
  .sort({ timestamp: -1 })
  .limit(100);

// Get user activities
const userLogs = await ActivityLog.find({ userId: userId })
  .sort({ timestamp: -1 });

// Get failed operations
const failures = await ActivityLog.find({ status: 'failed' });
```

### 2. Via API Endpoints
```bash
# Get all logs
curl http://localhost:5000/api/activity-logs?page=1&limit=50

# Get statistics
curl http://localhost:5000/api/activity-logs/stats?days=7

# Get user timeline
curl http://localhost:5000/api/activity-logs/timeline?userId=USER_ID&days=7

# Export to CSV
curl http://localhost:5000/api/activity-logs/export > logs.csv
```

### 3. Via Log Files
```bash
# View combined logs
tail -f logs/combined.log

# View activity logs
tail -f logs/activity.log

# View HTTP logs
tail -f logs/http.log

# View errors
tail -f logs/error.log
```

---

## Advanced Usage

### Custom Activity Logging
```javascript
const { trackActivity } = require('../middleware/activityLogger');

// Log custom activity
await trackActivity(
  req,
  'custom_action',
  'custom_target',
  'target-123',
  'Target Name',
  {
    customField1: 'value1',
    customField2: 'value2'
  },
  'success',
  null
);
```

### Using Winston Logger Directly
```javascript
const logger = require('../utils/logger');

// Log with metadata
logger.info('Batch operation completed', {
  operationType: 'salary_generation',
  count: 100,
  duration: '5s',
  status: 'success'
});

// Log errors with stack trace
logger.error('Database query failed', {
  query: 'employees.find()',
  error: error.message,
  stack: error.stack
});
```

---

## Monitoring and Alerts

### Set Up Log Monitoring
```javascript
// Monitor for errors
const errorStream = fs.createReadStream('./logs/error.log');
errorStream.on('data', (data) => {
  // Send alert to admin
  console.error('ERROR LOG UPDATE:', data);
});
```

### Cleanup Old Logs
```bash
# Delete logs older than 90 days via API
curl -X POST http://localhost:5000/api/activity-logs/delete \
  -H "Content-Type: application/json" \
  -d '{"days": 90}'
```

---

## Performance Tips

1. **Index Usage** - The model has optimized indexes for common queries
2. **Pagination** - Always use pagination when fetching logs
3. **Log Retention** - Implement automatic cleanup for old logs
4. **Async Logging** - All logging is asynchronous and non-blocking
5. **Batch Operations** - Errors in logging don't affect main operations

---

## Troubleshooting

### Logs not appearing in database
- Check user authentication (req.user is set)
- Verify ActivityLog model is properly initialized
- Check MongoDB connection

### High memory usage
- Implement log rotation
- Use pagination when querying
- Archive old logs periodically

### Performance degradation
- Optimize MongoDB indexes
- Reduce logging frequency
- Use efficient queries

