export function sendError(res, statusCode, message, code = 'ERROR', details = null) {
  const is500 = statusCode >= 500;
  const safeMessage = is500 ? 'Terjadi kesalahan internal pada server.' : message;
  
  if (is500 && message) {
    console.error(`[Server Error ${code}]`, message);
  }

  return res.status(statusCode).json({
    error: safeMessage,
    code,
    details
  });
}
