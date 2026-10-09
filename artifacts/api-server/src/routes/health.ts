import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/version", (_req, res) => {
  res.json({
    commit: process.env.BUILD_COMMIT ?? "dev",
    builtAt: process.env.BUILD_TIME ?? null,
    features: ["sessions", "alarm-events", "account-deletion", "privacy-page"],
  });
});

export default router;
