import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import alarmsRouter from "./alarms";
import charitiesRouter from "./charities";
import donationsRouter from "./donations";
import legalRouter from "./legal";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/alarms", alarmsRouter);
router.use("/charities", charitiesRouter);
router.use("/donations", donationsRouter);
router.use(legalRouter);

export default router;
