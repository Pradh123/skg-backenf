export function sendData(res, data, status = 200, meta) {
  const body = { data }
  if (meta !== undefined) body.meta = meta
  return res.status(status).json(body)
}

export function sendMessage(res, message, status = 200) {
  return sendData(res, { message }, status)
}
