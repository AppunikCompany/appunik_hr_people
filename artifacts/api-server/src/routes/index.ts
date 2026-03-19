import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import employeesRouter from "./employees";
import attendanceRouter from "./attendance";
import leaveRouter from "./leave";
import onboardingRouter from "./onboarding";
import assetsRouter from "./assets";
import kraRouter from "./kra";
import reportsRouter from "./reports";
import adminRouter from "./admin";
import automationsRouter from "./automations";
import selfServiceRouter from "./selfservice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(employeesRouter);
router.use(attendanceRouter);
router.use(leaveRouter);
router.use(onboardingRouter);
router.use(assetsRouter);
router.use(kraRouter);
router.use(reportsRouter);
router.use(adminRouter);
router.use(automationsRouter);
router.use(selfServiceRouter);

export default router;
