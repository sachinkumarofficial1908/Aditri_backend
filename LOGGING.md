# Activity Logging System Documentation

## Overview

The activity logging system provides comprehensive tracking of all application activities using **Winston** for structured logging and **Morgan** for HTTP request logging. All user activities are logged to both the database and log files.

---

## Components

### 1. **Winston Logger** (`src/utils/logger.js`)
Enhanced Winston logger with multiple transports:
- **Console**: Colorized output for development
- **error.log**: Error-level logs only
- **combined.log**: All log levels
- **activity.log**: User activity logs
- **http.log**: HTTP request logs
- **Daily rotation** (production): Automatic daily log file rotation

#### Log Levels
- `error`: Application errors
- `warn`: Warnings
- `info`: General information
- `http`: HTTP requests
- `debug`: Debug information (development only)

#### Usage
```javascript
const logger = require('./src/utils/logger');

logger.info('User logged in', { userId: '123', email: 'user@example.com' });
logger.error('Database connection failed', { error: 'Connection timeout' });
logger.warn('High memory usage detected', { memory: '1.2GB' });
logger.debug('Processing attendance data', { records: 500 });
```

---

### 2. **Morgan HTTP Logger** (`src/utils/morganLogger.js`)
Integrates Morgan with Winston for HTTP request logging.

#### Features
- Request/response time tracking
- User information capture
- Automatic health check and static file filtering
- Environment-specific formatting

#### Custom Tokens
- `:user` - Current user (email or ID)
- `:response-time-ms` - Response time in milliseconds

#### Formats
- **Development**: Concise format with method, URL, status, response time, user
- **Production**: Detailed format with request/response sizes, IP address

---

### 3. **Activity Logger Middleware** (`src/middleware/activityLogger.js`)
Middleware that captures and logs user activities to the database.

#### Key Functions

**`logActivity(params)`** - Log an activity to the database
```javascript
const { logActivity } = require('./src/middleware/activityLogger');

await logActivity({
  req,                    // Express request object
  userId: '123',         // User ID
  userName: 'John Doe',  // User name
  userEmail: 'john@example.com',
  userRole: 'admin',
  action: 'employee_create',
  targetType: 'employee',
  targetId: 'emp-001',
  targetName: 'Jane Smith',
  details: { department: 'IT', salary: 50000 },
  status: 'success',     // 'success' or 'failed'
  statusCode: 201,
  errorMessage: null,
});
```

**`trackActivity(req, action, targetType, targetId, targetName, details, status, errorMessage)`** - Helper for logging with automatic user info
```javascript
const { trackActivity } = require('./src/middleware/activityLogger');

await trackActivity(
  req,
  'employee_update',
  'employee',
  'emp-001',
  'Jane Smith',
  { changes: { salary: 55000 } },
  'success'
);
```

---

### 4. **Activity Tracker Utilities** (`src/utils/activityTracker.js`)
Predefined activity tracking functions for common operations.

#### Available Functions

**Authentication:**
```javascript
const tracker = require('./src/utils/activityTracker');

await tracker.logLogin(req, user);      // Log user login
await tracker.logLogout(req, user);     // Log user logout
```

**Employee Management:**
```javascript
await tracker.logEmployeeCreate(req, employee);
await tracker.logEmployeeUpdate(req, employee, changes);
await tracker.logEmployeeDelete(req, employee);
```

**Attendance:**
```javascript
await tracker.logAttendanceUpload(req, month, year, uploadType, count, status, error);
await tracker.logAttendanceGenerate(req, month, year, uploadType, count, status, error);
```

**Salary:**
```javascript
await tracker.logSalaryGenerate(req, salaryType, month, year, count, status, error);
await tracker.logSalaryApprove(req, salary);
```

**Projects:**
```javascript
await tracker.logProjectCreate(req, project);
await tracker.logProjectUpdate(req, project, changes);
await tracker.logProjectDelete(req, project);
```

**Wage Slips:**
```javascript
await tracker.logWageSlipGenerate(req, month, year, count, status, error);
```

**Reports:**
```javascript
await tracker.logReportGenerate(req, reportType, filters, status, error);
```

**Excel Operations:**
```javascript
await tracker.logExcelUpload(req, uploadType, fileName, recordCount, status, error);
```

**Data Export:**
```javascript
await tracker.logExportData(req, exportType, filters, recordCount, status);
```

---

## ActivityLog Model

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `userId` | ObjectId | Reference to User document |
| `userName` | String | User's display name |
| `userEmail` | String | User's email |
| `userRole` | String | User's role (admin, supervisor, etc.) |
| `action` | String | Action performed |
| `targetType` | String | Type of target (employee, salary, etc.) |
| `targetId` | String | ID of the target entity |
| `targetName` | String | Name/description of the target |
| `details` | Mixed | Additional details about the action |
| `method` | String | HTTP method (GET, POST, etc.) |
| `path` | String | API endpoint path |
| `ipAddress` | String | Client IP address |
| `userAgent` | String | Client user agent |
| `status` | String | Action status (success, failed) |
| `statusCode` | Number | HTTP status code |
| `errorMessage` | String | Error details if failed |
| `timestamp` | Date | When the activity occurred |

### Indexes
- `userId + timestamp` - Fast user activity queries
- `action + timestamp` - Fast action-based queries
- `targetType + timestamp` - Fast target-based queries
- `status + timestamp` - Fast status-based queries
- Text search - Name, email, target name, action

---

## ActivityLog Controller API

### Get All Logs
```
GET /api/activity-logs?page=1&limit=50&action=employee_create&userRole=admin&status=success
```

Query Parameters:
- `page` - Page number (default: 1)
- `limit` - Records per page (default: 50)
- `action` - Filter by action
- `targetType` - Filter by target type
- `userId` - Filter by user ID
- `userRole` - Filter by user role
- `status` - Filter by status
- `statusCode` - Filter by HTTP status code
- `method` - Filter by HTTP method
- `startDate` - Filter from date
- `endDate` - Filter to date
- `search` - Search in username, email, target name
- `sortBy` - Sort field (default: `-timestamp`)

### Get Log by ID
```
GET /api/activity-logs/:id
```

### Get Statistics
```
GET /api/activity-logs/stats?days=7&userRole=admin
```

Returns:
- Action statistics with success/failure counts
- Top 10 active users
- Target type distribution
- HTTP status code distribution
- User role distribution
- Overall success rate

### Get User Timeline
```
GET /api/activity-logs/timeline?userId=123&days=7
```

### Export Logs
```
GET /api/activity-logs/export?startDate=2024-01-01&endDate=2024-01-31&userRole=admin
```

Returns CSV file with all matching logs.

### Delete Old Logs
```
POST /api/activity-logs/delete
Body: { "days": 90 }
```

---

## Log Files Location

All logs are stored in the `logs/` directory:

```
logs/
├── error.log           # Errors only
├── combined.log        # All log levels
├── activity.log        # User activities
├── http.log            # HTTP requests
└── daily/              # Daily rotation files (production)
    ├── 2024-01-01.log
    ├── 2024-01-02.log
    └── ...
```

---

## Usage Examples

### Example 1: Log Employee Creation
```javascript
const tracker = require('./src/utils/activityTracker');

// In your employee controller
const employee = new Employee({ name: 'John Doe', ... });
await employee.save();

// Log the activity
await tracker.logEmployeeCreate(req, employee);
```

### Example 2: Log Failed Operation
```javascript
try {
  // Some operation
} catch (error) {
  await tracker.logError(req, 'salary_generate', 'salary', error.message);
}
```

### Example 3: Log Data Export
```javascript
const tracker = require('./src/utils/activityTracker');

const records = await SomeModel.find(filters);
await tracker.logExportData(req, 'employee', filters, records.length, 'success');
```

### Example 4: Query Logs Programmatically
```javascript
const ActivityLog = require('./src/models/ActivityLog');

// Get recent admin activities
const logs = await ActivityLog.find({
  userRole: 'admin',
  timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
}).sort({ timestamp: -1 }).limit(100);

// Get failed operations
const failures = await ActivityLog.find({ status: 'failed' });

// Get actions by user
const userActions = await ActivityLog.find({ userId: someUserId });
```

---

## Environment Variables

Configure logging behavior with these environment variables:

```env
# Log Level
NODE_ENV=development|production

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

---

## Best Practices

1. **Always use the tracker utilities** - Use predefined functions from `activityTracker.js` for consistency
2. **Include context** - Add relevant details to help diagnose issues
3. **Handle errors gracefully** - Logging failures shouldn't break the main operation
4. **Regular cleanup** - Remove old logs periodically using the delete endpoint
5. **Monitor production** - Set up alerts for error-level logs
6. **Export for audits** - Use the export functionality for compliance and audits

---

## Troubleshooting

### Logs not being written
- Check file permissions on `logs/` directory
- Ensure `logs/` directory exists
- Check disk space

### High disk usage
- Implement log rotation (automatic in production)
- Use the delete endpoint to clean old logs
- Reduce log level in production

### Performance impact
- Filter logs on read operations using efficient queries
- Use indexes appropriately
- Consider archiving old logs to separate storage

