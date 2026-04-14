export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const message = error.message || "Internal server error";
  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }
  res.status(status).json({ message });
}
