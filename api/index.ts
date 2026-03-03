import { handleRequest } from '../src/server.js';

function toWebHeaders(nodeHeaders: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  return headers;
}

export default async function handler(req: any, res: any) {
  const forwardedProto = req.headers?.['x-forwarded-proto'];
  const forwardedHost = req.headers?.['x-forwarded-host'];
  const host = forwardedHost || req.headers?.host || 'localhost';
  const protocol = forwardedProto || 'https';

  const url = new URL(req.url || '/', `${protocol}://${host}`);
  const request = new Request(url, {
    method: req.method || 'GET',
    headers: toWebHeaders(req.headers || {}),
  });

  const response = handleRequest(request);

  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if ((req.method || 'GET').toUpperCase() === 'HEAD') {
    res.end();
    return;
  }

  const body = await response.arrayBuffer();
  res.send(Buffer.from(body));
}
