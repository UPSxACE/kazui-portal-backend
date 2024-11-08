import "dotenv/config";
import express from "express";
const PORT = process.env.PORT;
if (!PORT)
    throw new Error("PORT env missing");
const router = express.Router({ mergeParams: true });
const homeMiddleware = (req, res, next) => {
    console.log("Entering path / right now!");
    next();
};
router.use(homeMiddleware);
router.get("/", (req, res) => {
    console.log("Processing...");
    res.status(200).send("Hi. All working.");
});
router.get("/error", (req, res) => {
    throw new Error("unexpected!");
});
router.get("/error-async", (req, res) => {
    throw new Error("unexpected!");
});
const app = express();
// global?
const logMiddleware = (req, res, next) => {
    console.log("New request!");
    const t0 = performance.now();
    res.once("finish", () => {
        const t1 = performance.now();
        const td = (t1 - t0).toFixed(2) + "ms";
        console.log("Took: ", td);
    });
    next();
};
app.use(logMiddleware);
app.use("/", router);
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).send("internal error!!!");
};
app.use(errorHandler);
app.listen(3005, () => {
    console.log(`Listening on port ${PORT}!`);
});
