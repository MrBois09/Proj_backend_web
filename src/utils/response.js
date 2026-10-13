export function success(res, data, message = 'Request completed successfully', statusCode = 200, pagination) {
  const body = { success: true, message, data };
  if (pagination) body.pagination = pagination;
  return res.status(statusCode).json(body);
}

export function paginated(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
