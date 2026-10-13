import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import alarmsRouter from "./alarms";
import charitiesRouter from "./charities";
import donationsRouter from "./donations";
import legalRouter from "./legal";
import billingRouter from "./billing";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/alarms", alarmsRouter);
router.use("/charities", charitiesRouter);
router.use("/donations", donationsRouter);
router.use("/billing", billingRouter);
router.use("/admin", adminRouter);
router.use(legalRouter);

export default router;
