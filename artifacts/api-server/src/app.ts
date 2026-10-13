import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Express 5 forwards rejected promises from async handlers here.
// Log details server-side; never leak internals to the client.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal Server Error", message: "Something went wrong. Please try again." });
};
app.use(errorHandler);

export default app;
