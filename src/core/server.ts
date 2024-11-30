import cookieParser from "cookie-parser";
import cors from "cors";
import express, { ErrorRequestHandler, RequestHandler, Router } from "express";
import fileUpload from "express-fileupload";
import jwt from "jsonwebtoken";
import { z } from "zod";
import createRouter from "./create-router.js";
import newJwtToken from "./new-jwt-token.js";
import { setupWebsockets } from "./socket-io/socket-io.js";

export type CustomJwtPayload = {
  address: string;
} & jwt.JwtPayload;

declare module "express-serve-static-core" {
  interface Request {
    // filled by jwt middleware
    user?: CustomJwtPayload;
  }
}

export default class Server {
  private port: number;
  app: ReturnType<typeof express>;

  constructor(port: number | string) {
    this.port = Number(port);
    this.app = express();
  }

  setupGlobalMiddlewares() {
    const logMiddleware: RequestHandler = (req, res, next) => {
      const t0 = performance.now();

      res.once("finish", () => {
        const t1 = performance.now();
        const td = (t1 - t0).toFixed(2);
        console.log(
          `${req.method} | ${req.baseUrl} | ${res.statusCode} | request took: ${td}ms`
        );
      });

      next();
    };

    const jwtMiddleware: RequestHandler = (req, res, next) => {
      const authToken = req.cookies["authToken"];

      if (authToken) {
        try {
          const payload = jwt.verify(authToken, process.env.JWT_SECRET ?? "");
          const data: CustomJwtPayload = z
            .object({ address: z.string() })
            .passthrough()
            .parse(payload);

          const now = new Date().getTime();
          const hourInMs = 60 * 60 * 1000;

          if (data.exp && now - data.exp < hourInMs) {
            // refresh
            res.cookie(...newJwtToken(data.address));
          }

          req.user = data;
        } catch {}
      }

      next();
    };

    this.app.use(
      cors({
        origin: process.env.CORS_ORIGIN,
        optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
        credentials: true,
      })
    );
    this.app.use(express.json());
    this.app.use(logMiddleware);
    this.app.use(cookieParser());
    this.app.use(jwtMiddleware);
    this.app.use("/uploads", express.static("uploads"));
    this.app.use(
      fileUpload({
        limits: { fileSize: 10 * 1024 * 1024 }, // 10mb // TODO: limit based on subscription level
        createParentPath: true,
      })
    );

    return this;
  }

  setupRoutes(routes: Record<string, Router>) {
    Object.keys(routes).forEach((x) => {
      this.app.use(x, routes[x]);
    });

    return this;
  }

  setupPrivateRoutes(routes: Record<string, Router>) {
    const privateRouter = createRouter((req, res, next) => {
      if (!req.user) {
        next("NOT_AUTHORIZED");
        return;
      }
      next();
    });

    Object.keys(routes).forEach((x) => {
      privateRouter.use(x, routes[x]);
    });

    this.app.use(privateRouter);

    return this;
  }

  setupErrorHandler() {
    const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
      if (res.headersSent) {
        return next(err);
      }
      if (err === "NOT_AUTHORIZED") {
        res.status(401).send("Not Authorized.");
        return;
      }
      if (err === "FORBIDDEN") {
        res.status(403).send("Forbidden.");
        return;
      }
      if (err === "GATEWAY_TIMEOUT") {
        res.status(504).send("Gateway Timeout.");
        return;
      }
      res.status(500).send("Internal Error.");
    };

    this.app.use(errorHandler);
    return this;
  }

  async start() {
    // setup websockets
    const server = await setupWebsockets(this.app);

    server.listen(this.port, () => {
      console.log(`Listening on port ${this.port}!`);
    });
  }
}
