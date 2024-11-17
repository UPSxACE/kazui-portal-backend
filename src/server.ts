import "dotenv/config";
import Server from "./core/server.js";
import authRouter from "./routes/auth.js";
import uploadRouter from "./routes/upload.js";
import userRouter from "./routes/user.js";

const PORT = process.env.PORT;
if (!PORT) throw new Error("PORT env missing");

const server = new Server(PORT);

const routes = { "/auth": authRouter };
const privateRoutes = { "/user": userRouter, "/upload": uploadRouter };

server
  .setupGlobalMiddlewares()
  .setupRoutes(routes)
  .setupPrivateRoutes(privateRoutes)
  .setupErrorHandler()
  .start();