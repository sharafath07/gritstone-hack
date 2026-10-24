
import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";

const router = Router();

const updateSchema = z.object({
    status: z.enum([
        "SCHEDULED",
        "IN_TRANSIT",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
    ]),
    scheduledAt: z.iso.datetime().optional(),
    notes: z.string().trim().max(1000).optional(),
}).strict();

const transitions = {
    PENDING: ["SCHEDULED", "FAILED", "CANCELLED"],
    SCHEDULED: ["IN_TRANSIT", "FAILED", "CANCELLED"],
    IN_TRANSIT: ["COMPLETED", "FAILED"],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
};

router.get("/", async (req, res, next) => {
    try {
        const pickups = await prisma.pickup.findMany({
            include: {
                donation: { include: { donor: true } },
                match: { include: { recipient: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        return res.json({
            success: true,
            count: pickups.length,
            data: pickups,
        });
    } catch (error) {
        next(error);
    }
});

router.get("/:pickupId", async (req, res, next) => {
    try {
        const pickup = await prisma.pickup.findUnique({
            where: { id: req.params.pickupId },
            include: {
                donation: { include: { donor: true } },
                match: { include: { recipient: true } },
            },
        });

        if (!pickup) {
            return res.status(404).json({
                success: false,
                message: "Pickup not found",
            });
        }

        return res.json({ success: true, data: pickup });
    } catch (error) {
        next(error);
    }
});

router.patch("/:pickupId/status", async (req, res, next) => {
    try {
        const parsed = updateSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid pickup update",
                errors: parsed.error.issues,
            });
        }

        const { status, scheduledAt, notes } = parsed.data;

        if (status === "SCHEDULED" && !scheduledAt) {
            return res.status(400).json({
                success: false,
                message: "scheduledAt is required when scheduling a pickup",
            });
        }

        if (
            scheduledAt &&
            !Number.isFinite(new Date(scheduledAt).getTime())
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid scheduledAt date",
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const pickup = await tx.pickup.findUnique({
                where: { id: req.params.pickupId },
                include: { donation: true },
            });

            if (!pickup) {
                const error = new Error("Pickup not found");
                error.status = 404;
                throw error;
            }

            if (!transitions[pickup.status]?.includes(status)) {
                const error = new Error(
                    `Cannot change pickup from ${pickup.status} to ${status}`
                );
                error.status = 409;
                throw error;
            }

            if (
                status === "SCHEDULED" &&
                new Date(scheduledAt) > new Date(pickup.donation.pickupEnd)
            ) {
                const error = new Error(
                    "Scheduled pickup must be before the donation pickup deadline"
                );
                error.status = 400;
                throw error;
            }

            const updatedPickup = await tx.pickup.update({
                where: { id: pickup.id },
                data: {
                    status,
                    ...(status === "SCHEDULED"
                        ? { scheduledAt: new Date(scheduledAt) }
                        : {}),
                    ...(notes !== undefined ? { notes } : {}),
                    ...(status === "COMPLETED"
                        ? { completedAt: new Date() }
                        : {}),
                },
                include: {
                    donation: true,
                    match: { include: { recipient: true } },
                },
            });

            if (status === "IN_TRANSIT") {
                await tx.donation.update({
                    where: { id: pickup.donationId },
                    data: { status: "PICKED_UP" },
                });
            }

            if (status === "COMPLETED") {
                await tx.donation.update({
                    where: { id: pickup.donationId },
                    data: { status: "COMPLETED" },
                });
            }

            // If the pickup is cancelled or fails, release the donation
            // for a new match only if its collection window remains open.
            if (status === "CANCELLED" || status === "FAILED") {
                const canBeOfferedAgain =
                    new Date(pickup.donation.pickupEnd) > new Date();

                await tx.donation.update({
                    where: { id: pickup.donationId },
                    data: {
                        status: canBeOfferedAgain ? "AVAILABLE" : "EXPIRED",
                    },
                });

                await tx.match.update({
                    where: { id: pickup.matchId },
                    data: { status: "REJECTED" },
                });
            }

            return updatedPickup;
        });

        return res.json({
            success: true,
            message: `Pickup status updated to ${status}`,
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
