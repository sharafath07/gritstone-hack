
import { Router } from "express";
import prisma from "../lib/prisma.js";
import { generateMatches } from "../services/matching.service.js";

const router = Router();

// Generate and save ranked recipient recommendations.
router.post("/:donationId/generate", async (req, res, next) => {
    try {
        const matches = await generateMatches(req.params.donationId);

        return res.json({
            success: true,
            count: matches.length,
            message: matches.length
                ? "Recipient recommendations generated"
                : "No eligible recipient organizations found",
            data: matches,
        });
    } catch (error) {
        next(error);
    }
});

// Retrieve saved recommendations for a donation.
router.get("/:donationId", async (req, res, next) => {
    try {
        const donation = await prisma.donation.findUnique({
            where: { id: req.params.donationId },
            select: { id: true },
        });

        if (!donation) {
            return res.status(404).json({
                success: false,
                message: "Donation not found",
            });
        }

        const matches = await prisma.match.findMany({
            where: { donationId: req.params.donationId },
            include: { recipient: true },
            orderBy: { score: "desc" },
        });

        return res.json({
            success: true,
            count: matches.length,
            data: matches,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
