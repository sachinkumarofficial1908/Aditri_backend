/**
 * Response Handler Utility
 * Standardized response format for API endpoints
 */

/**
 * Send success response
 */
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

/**
 * Send error response
 */
const errorResponse = (res, message = 'Error', statusCode = 500, data = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data
  });
};

module.exports = {
  successResponse,
  errorResponse
};
