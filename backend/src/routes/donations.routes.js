
import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import {
    authenticateToken,
    requireRole,
} from "../middleware/auth.middleware.js";

const router = Router();

const donationSchema = z.object({
    donorOrgId: z.string().min(1),
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().min(5).max(2000),
    category: z.enum([
        "MEALS",
        "BAKERY",
        "PRODUCE",
        "DAIRY",
        "PACKAGED",
        "OTHER",
    ]),
    quantity: z.number().positive(),
    quantityUnit: z.string().trim().min(1).max(30),
    servings: z.number().int().positive().optional(),
    dietaryTags: z.array(z.string().trim().min(1).max(40)).default([]),
    pickupStart: z.iso.datetime(),
    pickupEnd: z.iso.datetime(),
}).strict().refine(
    (data) => new Date(data.pickupEnd) > new Date(data.pickupStart),
    {
        message: "Pickup end must be after pickup start",
        path: ["pickupEnd"],
    },
).refine(
    (data) => new Date(data.pickupEnd) > new Date(),
    {
        message: "Pickup end must be in the future",
        path: ["pickupEnd"],
    },
);

// Create a donation from donor-confirmed details.
router.post("/", authenticateToken, requireRole("DONOR"), async (req, res, next) => {
    try {
        const parsed = donationSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Please correct the donation details",
                errors: parsed.error.issues,
            });
        }

        const data = parsed.data;

        const donor = await prisma.organization.findUnique({
            where: { id: data.donorOrgId },
        });

        if (!donor || !["DONOR", "BOTH"].includes(donor.type)) {
            return res.status(400).json({
                success: false,
                message: "A valid donor organization is required",
            });
        }

        const donation = await prisma.donation.create({
            data: {
                ...data,
                pickupStart: new Date(data.pickupStart),
                pickupEnd: new Date(data.pickupEnd),
            },
            include: { donor: true },
        });

        return res.status(201).json({
            success: true,
            message: "Donation created successfully",
            data: donation,
        });
    } catch (error) {
        next(error);
    }
});

// List donations, optionally filtered by status.
router.get("/", async (req, res, next) => {
    try {
        const allowedStatuses = [
            "AVAILABLE",
            "MATCHED",
            "RESERVED",
            "PICKED_UP",
            "COMPLETED",
            "CANCELLED",
            "EXPIRED",
        ];

        const status = req.query.status;

        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid donation status",
            });
        }

        const donations = await prisma.donation.findMany({
            where: status ? { status } : {},
            include: { donor: true },
            orderBy: { createdAt: "desc" },
        });

        return res.json({
            success: true,
            count: donations.length,
            data: donations,
        });
    } catch (error) {
        next(error);
    }
});

// Get one donation with its matches and pickup.
router.get("/:id", async (req, res, next) => {
    try {
        const donation = await prisma.donation.findUnique({
            where: { id: req.params.id },
            include: {
                donor: true,
                matches: true,
                pickup: true,
            },
        });

        if (!donation) {
            return res.status(404).json({
                success: false,
                message: "Donation not found",
            });
        }

        return res.json({ success: true, data: donation });
    } catch (error) {
        next(error);
    }
});

export default router;
