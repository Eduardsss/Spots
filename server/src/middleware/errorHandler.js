export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true
  }
}

// Ekspresam pievienojams kā pēdējais middleware — uztver visas kļūdas.
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode ?? 500

  if (!err.isOperational) {
    console.error(`[${new Date().toISOString()}] Unexpected error on ${req.method} ${req.path}:`, err)
  }

  return res.status(statusCode).json({
    success: false,
    message: err.isOperational ? err.message : 'Iekšēja servera kļūda',
  })
}
