import express, { RequestHandler } from "express";
export default function createRouter(...middlewares: RequestHandler[]) {
  const router = express.Router();
  middlewares.forEach((x) => {
    router.use(x);
  });
  return router;
}
