# Activity Logging System - Quick Reference

## 🚀 Installation Complete!

Your Aditri application now has a comprehensive activity logging system with Winston and Morgan.

---

## 📋 What Was Installed

### Core Files
- ✅ **Winston Logger** (`src/utils/logger.js`) - Structured logging to files
- ✅ **Morgan Logger** (`src/utils/morganLogger.js`) - HTTP request logging
- ✅ **Activity Logger Middleware** (`src/middleware/activityLogger.js`) - Activity tracking
- ✅ **Activity Tracker** (`src/utils/activityTracker.js`) - Helper functions
- ✅ **Enhanced ActivityLog Model** (`src/models/ActivityLog.js`) - Database schema

### Documentation
- 📚 **LOGGING.md** - Complete system documentation
- 📚 **LOGGING-SETUP.md** - Integration guide
- 🔧 **scripts/setupActivityLogging.js** - Setup script

---

## ⚡ Quick Start

### 1. Initialize the System
```bash
cd backend
npm run dev
```

The system initializes automatically on server start.

### 2. Start Using Activity Logging

#### In Controllers:
```javascript
const tracker = require('../utils/activityTracker');

// Log employee creation
await tracker.logEmployeeCreate(req, employee);

// Log salary generation
await tracker.logSalaryGenerate(req, salaryType, month, year, count, 'success');

// Log errors
await tracker.logError(req, 'salary_generate', 'salary', error.message);
```

### 3. Monitor Activities

#### API Endpoints:
- `GET /api/activity-logs` - Get all logs
- `GET /api/activity-logs/stats` - Get statistics
- `GET /api/activity-logs/timeline?userId=123` - User timeline
- `GET /api/activity-logs/export` - Export to CSV

#### Log Files:
```bash
tail -f logs/combined.log      # All activities
tail -f logs/activity.log      # User activities
tail -f logs/http.log          # HTTP requests
tail -f logs/error.log         # Errors
```

---

## 🔍 Available Logging Functions

### Authentication
```javascript
tracker.logLogin(req, user)
tracker.logLogout(req, user)
```

### Employees
```javascript
tracker.logEmployeeCreate(req, employee)
tracker.logEmployeeUpdate(req, employee, changes)
tracker.logEmployeeDelete(req, employee)
```

### Attendance
```javascript
tracker.logAttendanceUpload(req, month, year, uploadType, count, status, error)
tracker.logAttendanceGenerate(req, month, year, uploadType, count, status, error)
```

### Salary
```javascript
tracker.logSalaryGenerate(req, salaryType, month, year, count, status, error)
tracker.logSalaryApprove(req, salary)
```

### Projects
```javascript
tracker.logProjectCreate(req, project)
tracker.logProjectUpdate(req, project, changes)
tracker.logProjectDelete(req, project)
```

### Wage Slips
```javascript
tracker.logWageSlipGenerate(req, month, year, count, status, error)
```

### Reports
```javascript
tracker.logReportGenerate(req, reportType, filters, status, error)
```

### Excel
```javascript
tracker.logExcelUpload(req, uploadType, fileName, count, status, error)
```

### Exports
```javascript
tracker.logExportData(req, exportType, filters, count, status)
```

### Errors
```javascript
tracker.logError(req, action, targetType, errorMessage)
```

---

## 📊 Log File Structure

```
backend/
├── logs/
│   ├── error.log          # Error-level logs
│   ├── combined.log       # All log levels
│   ├── activity.log       # User activities
│   ├── http.log          # HTTP requests
│   └── daily/            # Production daily rotation
│       ├── 2024-01-01.log
│       └── ...
```

---

## 🗄️ Database Schema

ActivityLog collection fields:
- `userId` - User who performed the action
- `userName` - User's display name
- `userEmail` - User's email
- `userRole` - User's role (admin, supervisor, etc.)
- `action` - Action performed
- `targetType` - Type of entity affected
- `targetId` - ID of the affected entity
- `targetName` - Name of the affected entity
- `details` - Additional context
- `method` - HTTP method
- `path` - API endpoint
- `ipAddress` - Client IP
- `userAgent` - Browser/client info
- `status` - success/failed
- `statusCode` - HTTP status code
- `errorMessage` - Error details if failed
- `timestamp` - When it happened

---

## 🔧 Integration Checklist

To add logging to a controller:

- [ ] Import tracker: `const tracker = require('../utils/activityTracker');`
- [ ] Add call in success path: `await tracker.log*(req, ...args)`
- [ ] Add error handling: `await tracker.logError(req, ...)`
- [ ] Test the logs appear in database and files

---

## 📈 Query Examples

```javascript
// Get recent admin activities
const logs = await ActivityLog.find({
  userRole: 'admin',
  timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
}).sort({ timestamp: -1 });

// Get failed operations
const failures = await ActivityLog.find({ status: 'failed' });

// Get employee-related activities
const employeeChanges = await ActivityLog.find({
  targetType: 'employee',
  action: { $in: ['employee_create', 'employee_update', 'employee_delete'] }
});

// Get specific user's actions
const userActions = await ActivityLog.find({ userId: userId });
```

---

## 🚨 Monitoring & Alerts

### Set Up Error Monitoring
```javascript
const fs = require('fs');

const errorStream = fs.createReadStream('./logs/error.log');
errorStream.on('data', (chunk) => {
  // Send alert to admin
  console.error('⚠️ Error detected:', chunk.toString());
});
```

### Clean Old Logs
```bash
curl -X POST http://localhost:5000/api/activity-logs/delete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 90}'
```

---

## 📚 Next Steps

1. **Read the full documentation**: See `LOGGING.md`
2. **Review integration guide**: See `LOGGING-SETUP.md`
3. **Add logging to controllers**: Start with auth and employee controllers
4. **Test the logs**: Check database and log files
5. **Set up monitoring**: Configure log rotation and cleanup

---

## 📞 Support

For issues or questions:
1. Check `LOGGING.md` for detailed documentation
2. Review `LOGGING-SETUP.md` for integration examples
3. Check `logs/error.log` for system errors
4. Review Winston logger configuration in `src/utils/logger.js`

---

## ✨ Features Enabled

- ✅ Structured logging with Winston
- ✅ HTTP request logging with Morgan
- ✅ User activity tracking to MongoDB
- ✅ File-based log storage with rotation
- ✅ Comprehensive statistics and reporting
- ✅ CSV export functionality
- ✅ Text search across logs
- ✅ Automatic log cleanup (TTL)
- ✅ Role-based filtering
- ✅ Error tracking and monitoring

---

Generated: $(date)
