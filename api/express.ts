// api/express.ts
const app = require("../server");  // ✅ CommonJS 모듈 가져오기

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createServer } from "http";
import createProxyServer from "http-proxy";  // ✅ 최신 문법 (default export)

export default (req: VercelRequest, res: VercelResponse) => {
  const server = createServer(app);
  server.listen(0, () => {
    const { port } = server.address() as any;
    const proxy = createProxyServer();
    proxy.web(req, res, { target: `http://127.0.0.1:${port}` });
  });
};
