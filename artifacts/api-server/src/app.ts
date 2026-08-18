import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { MAX_UPLOAD_BYTES } from "./lib/uploads";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Generous limits: the docx export sends the whole study (all drafts + tables),
// and file uploads arrive as base64 JSON, which inflates a file ~4/3 over its
// raw size. The JSON body limit is derived from MAX_UPLOAD_BYTES so the body
// parser and the upload validator can never drift apart (base64 + 1 MB slack).
const JSON_BODY_LIMIT = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 1024 * 1024;
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

app.use("/api", router);

export default app;
