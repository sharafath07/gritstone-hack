
import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { generateMatches } from "../services/matching.service.js";

const router = Router();

const responseSchema = z.object({
    action: z.enum(["accept", "reject"]),
}).strict();

// Generate recommendations for a donation.
router.post("/:donationId/generate", async (req, res, next) => {
    try {
        const matches = await generateMatches(req.params.donationId);

        return res.json({
            success: true,
            count: matches.length,
            data: matches,
        });
    } catch (error) {
        next(error);
    }
});

// Retrieve recommendations for a donation.
router.get("/:donationId", async (req, res, next) => {
    try {
        const donation = await prisma.donation.findUnique({
            where: { id: req.params.donationId },
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

// Accept or reject a recommendation.
router.patch("/:matchId/respond", async (req, res, next) => {
    try {
        const parsed = responseSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Action must be accept or reject",
                errors: parsed.error.issues,
            });
        }

        const { action } = parsed.data;
        const matchId = req.params.matchId;

        if (action === "reject") {
            const result = await prisma.match.updateMany({
                where: {
                    id: matchId,
                    status: "RECOMMENDED",
                },
                data: {
                    status: "REJECTED",
                },
            });

            if (result.count === 0) {
                return res.status(409).json({
                    success: false,
                    message: "Match not found or it has already been responded to",
                });
            }

            return res.json({
                success: true,
                message: "Recommendation rejected",
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const match = await tx.match.findUnique({
                where: { id: matchId },
                include: { donation: true },
            });

            if (!match) {
                const error = new Error("Match not found");
                error.status = 404;
                throw error;
            }

            if (match.status !== "RECOMMENDED") {
                const error = new Error(
                    "This recommendation has already been responded to"
                );
                error.status = 409;
                throw error;
            }

            const now = new Date();

            if (new Date(match.donation.pickupEnd) <= now) {
                const error = new Error("The pickup deadline has passed");
                error.status = 409;
                throw error;
            }

            // Atomically claim the donation. Only one request can succeed.
            const claimed = await tx.donation.updateMany({
                where: {
                    id: match.donationId,
                    status: "AVAILABLE",
                    pickupEnd: { gt: now },
                },
                data: {
                    status: "RESERVED",
                },
            });

            if (claimed.count !== 1) {
                const error = new Error(
                    "This donation is no longer available for reservation"
                );
                error.status = 409;
                throw error;
            }

            const accepted = await tx.match.updateMany({
                where: {
                    id: matchId,
                    status: "RECOMMENDED",
                },
                data: {
                    status: "ACCEPTED",
                },
            });

            if (accepted.count !== 1) {
                const error = new Error(
                    "This recommendation has already been responded to"
                );
                error.status = 409;
                throw error;
            }

            // Expire competing recommendations for this donation.
            await tx.match.updateMany({
                where: {
                    donationId: match.donationId,
                    id: { not: matchId },
                    status: "RECOMMENDED",
                },
                data: {
                    status: "EXPIRED",
                },
            });

            const pickup = await tx.pickup.create({
                data: {
                    donationId: match.donationId,
                    matchId: match.id,
                    status: "PENDING",
                },
            });

            return { matchId: match.id, pickup };
        });

        return res.json({
            success: true,
            message: "Donation reserved and pickup created",
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
