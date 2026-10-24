
import { Router } from "express";
import { z } from "zod";
import { extractDonationDetails } from "../services/ai.service.js";

const router = Router();

const requestSchema = z.object({
    description: z.string().trim().min(10).max(3000),
});

router.post("/parse-donation", async (req, res, next) => {
    try {
        const parsed = requestSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Provide a description between 10 and 3000 characters",
                errors: parsed.error.issues,
            });
        }

        const data = await extractDonationDetails(
            parsed.data.description,
        );

        return res.json({
            success: true,
            message: "Donation details extracted for review",
            requiresDonorConfirmation: true,
            data,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
