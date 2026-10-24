
import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { getOrganizationImpact } from "../services/impact.service.js";

const router = Router();

router.use(authenticateToken);

router.get("/", async (req, res, next) => {
    try {
        const data = await getOrganizationImpact(
            req.user.organizationId
        );

        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
