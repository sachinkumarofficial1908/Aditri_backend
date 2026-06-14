# Activity Logging System - Implementation Summary

## ✅ What Was Implemented

A comprehensive activity logging system for the Aditri backend using **Winston** for structured logging and **Morgan** for HTTP request logging.

---

## 📦 Files Created/Modified

### Core System Files

#### 1. **Enhanced Winston Logger** 
- **File**: `src/utils/logger.js` ✅ Modified
- **Features**:
  - Multiple transports (console, file, error-specific)
  - Structured JSON format
  - Separate activity and HTTP log files
  - Optional daily rotation for production
  - File rotation with size limits (5MB per file, max 15 files)

#### 2. **Morgan HTTP Logger Integration**
- **File**: `src/utils/morganLogger.js` ✅ Created
- **Features**:
  - Custom tokens for user and response time
  - Environment-specific formatting
  - Integration with Winston
  - Health check and static file filtering

#### 3. **Activity Logger Middleware**
- **File**: `src/middleware/activityLogger.js` ✅ Enhanced
- **Features**:
  - Captures user activities to database
  - Automatic IP and user-agent extraction
  - Request/response tracking
  - Helper functions for easy integration

#### 4. **Activity Tracker Utilities**
- **File**: `src/utils/activityTracker.js` ✅ Created
- **Features**:
  - Pre-built logging functions for common operations
  - Standardized activity tracking
  - Support for all major modules (auth, employees, attendance, salary, etc.)

#### 5. **Enhanced ActivityLog Model**
- **File**: `src/models/ActivityLog.js` ✅ Modified
- **Features**:
  - Expanded fields for comprehensive tracking
  - Role-based user information
  - HTTP method and path tracking
  - Automatic TTL (90 days)
  - Optimized indexes for fast queries

#### 6. **Enhanced ActivityLog Controller**
- **File**: `src/controllers/activityLogController.js` ✅ Enhanced
- **Features**:
  - Advanced filtering and pagination
  - Comprehensive statistics generation
  - User timeline tracking
  - CSV export functionality
  - Automatic log cleanup

#### 7. **Server Integration**
- **File**: `server.js` ✅ Modified
- **Features**:
  - Morgan middleware integrated
  - Activity logger middleware added
  - Proper middleware order for optimal logging

### Documentation Files

#### 1. **Complete Documentation**
- **File**: `LOGGING.md` ✅ Created
- **Content**:
  - System overview
  - Component descriptions
  - API endpoints
  - Database schema
  - Usage examples
  - Troubleshooting guide

#### 2. **Integration Guide**
- **File**: `LOGGING-SETUP.md` ✅ Created
- **Content**:
  - Step-by-step setup instructions
  - Controller integration examples
  - Log viewing methods
  - Advanced usage patterns

#### 3. **Quick Reference**
- **File**: `LOGGING-QUICKSTART.md` ✅ Created
- **Content**:
  - Quick start guide
  - Available functions reference
  - Integration checklist
  - Database queries examples

### Setup Script

#### **Database Initialization**
- **File**: `scripts/setupActivityLogging.js` ✅ Created
- **Features**:
  - Creates necessary database indexes
  - Sets up log directories
  - Validates collection statistics

---

## 🎯 Key Features

### 1. **Multiple Logging Levels**
- Error
- Warning
- Info
- HTTP
- Debug (development only)

### 2. **Log Storage**
- **Console**: For development
- **Files**: For persistence
- **Database**: For searchability and analytics
- **Structured Format**: JSON for easy parsing

### 3. **Activity Tracking**
Captures:
- User information (ID, name, email, role)
- Request details (method, path, IP, user-agent)
- Response information (status code, success/failure)
- Action context (target type, ID, name)
- Custom details for each operation

### 4. **Predefined Tracking Functions**
For common operations:
- Authentication (login, logout)
- Employee management (create, update, delete)
- Attendance operations (upload, generate)
- Salary operations (generate, approve)
- Project management
- Wage slip generation
- Report generation
- Excel uploads
- Data exports

### 5. **API Endpoints**
- `GET /api/activity-logs` - List all logs
- `GET /api/activity-logs/:id` - Get specific log
- `GET /api/activity-logs/stats` - Statistics
- `GET /api/activity-logs/timeline` - User timeline
- `GET /api/activity-logs/export` - CSV export
- `POST /api/activity-logs/delete` - Cleanup old logs

### 6. **Advanced Querying**
- Filter by action, target type, user role, status
- Date range filtering
- Search across user names, emails, targets
- Pagination support
- Multiple sorting options

### 7. **Statistics & Analytics**
- Action statistics with success/failure counts
- Top users by activity
- Target type distribution
- HTTP status code distribution
- User role distribution
- Overall success rate

---

## 🔧 How to Use

### 1. **Basic Usage in Controllers**

```javascript
const tracker = require('../utils/activityTracker');

// In your controller action
try {
  // ... perform operation ...
  await tracker.logEmployeeCreate(req, employee);
  res.json({ success: true, data: employee });
} catch (error) {
  await tracker.logError(req, 'employee_create', 'employee', error.message);
  next(error);
}
```

### 2. **View Logs**

```bash
# File logs
tail -f logs/activity.log
tail -f logs/http.log

# Database logs via API
curl http://localhost:5000/api/activity-logs?page=1&limit=50
```

### 3. **Query Logs Programmatically**

```javascript
const ActivityLog = require('./src/models/ActivityLog');

const logs = await ActivityLog.find({
  userRole: 'admin',
  timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
}).sort({ timestamp: -1 });
```

---

## 📊 Log File Structure

```
backend/logs/
├── error.log          (errors only)
├── combined.log       (all logs)
├── activity.log       (user activities)
├── http.log          (HTTP requests)
└── daily/            (production daily rotation)
    ├── 2024-01-01.log
    └── ...
```

---

## 🚀 Getting Started

### 1. **Server Auto-Initialization**
The logging system initializes automatically when the server starts:
```bash
npm run dev
```

### 2. **Manual Setup (Optional)**
Run the setup script to initialize database indexes:
```bash
node scripts/setupActivityLogging.js
```

### 3. **Start Logging**
Add to controllers:
```javascript
const tracker = require('../utils/activityTracker');

await tracker.logEmployeeCreate(req, employee);
```

### 4. **Monitor**
- Check files: `tail -f logs/activity.log`
- Check database: Use the API endpoints
- Check console: Development output shows structured logs

---

## 📋 Dependencies

All dependencies are already installed:
- ✅ `winston` - Structured logging
- ✅ `morgan` - HTTP request logging
- ✅ `mongoose` - Database ODM
- ✅ `express` - Web framework

Optional for production:
- `winston-daily-rotate-file` - For daily log rotation

---

## 🔍 Query Examples

### Get Recent Admin Activities
```javascript
const logs = await ActivityLog.find({
  userRole: 'admin'
}).sort({ timestamp: -1 }).limit(50);
```

### Get Failed Operations
```javascript
const failures = await ActivityLog.find({ status: 'failed' });
```

### Get Employee-Related Activities
```javascript
const employeeChanges = await ActivityLog.find({
  targetType: 'employee',
  action: { $in: ['employee_create', 'employee_update', 'employee_delete'] }
});
```

### Get User's Activity Timeline
```javascript
const userLogs = await ActivityLog.find({
  userId: userId
}).sort({ timestamp: -1 });
```

---

## 🛡️ Best Practices

1. ✅ **Use tracker utilities** - Maintain consistency
2. ✅ **Include context** - Add relevant details
3. ✅ **Handle errors** - Log failures appropriately
4. ✅ **Regular cleanup** - Remove old logs periodically
5. ✅ **Monitor production** - Set up alerts
6. ✅ **Export audits** - Use CSV for compliance

---

## 📚 Documentation

- **Detailed Guide**: See `LOGGING.md`
- **Integration Examples**: See `LOGGING-SETUP.md`
- **Quick Reference**: See `LOGGING-QUICKSTART.md`

---

## ✨ What's Next

1. ✅ Add logging to existing controllers
2. ✅ Test logging system
3. ✅ Set up log monitoring/alerts
4. ✅ Configure log rotation
5. ✅ Implement export functionality
6. ✅ Create dashboards for analytics

---

## 🎓 Integration Checklist

For each controller that needs logging:
- [ ] Import `activityTracker`
- [ ] Add success logging
- [ ] Add error logging
- [ ] Test in development
- [ ] Verify in logs and database
- [ ] Deploy to production

---

## 📞 Support Resources

- **Configuration**: `src/utils/logger.js`
- **Integration**: `src/middleware/activityLogger.js`
- **Tracker Functions**: `src/utils/activityTracker.js`
- **Database Schema**: `src/models/ActivityLog.js`
- **API Endpoints**: `src/routes/activityLogs.js`

---

## 🎉 Installation Complete!

Your Aditri backend now has enterprise-grade activity logging with:
- ✅ Structured logging to files
- ✅ HTTP request tracking
- ✅ User activity database tracking
- ✅ Advanced analytics and reporting
- ✅ Automatic cleanup and rotation
- ✅ CSV export functionality

**Start using it immediately** by adding tracking calls to your controllers!

---

Generated: 2024
