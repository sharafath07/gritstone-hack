
import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";

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
    dietaryTags: z.array(z.string().trim().min(1)).optional(),
    pickupStart: z.iso.datetime(),
    pickupEnd: z.iso.datetime(),
}).refine(
    (data) => new Date(data.pickupEnd) > new Date(data.pickupStart),
    {
        message: "Pickup end must be after pickup start",
        path: ["pickupEnd"],
    },
);

router.post("/", async (req, res) => {
    const parsed = donationSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid donation data",
            errors: parsed.error.issues,
        });
    }

    const donor = await prisma.organization.findUnique({
        where: { id: parsed.data.donorOrgId },
    });

    if (!donor || !["DONOR", "BOTH"].includes(donor.type)) {
        return res.status(400).json({
            success: false,
            message: "A valid donor organization is required",
        });
    }

    const donation = await prisma.donation.create({
        data: {
            ...parsed.data,
            pickupStart: new Date(parsed.data.pickupStart),
            pickupEnd: new Date(parsed.data.pickupEnd),
        },
        include: { donor: true },
    });

    return res.status(201).json({
        success: true,
        data: donation,
    });
});

router.get("/", async (req, res) => {
    const status = req.query.status;
    const allowedStatuses = [
        "AVAILABLE",
        "MATCHED",
        "RESERVED",
        "PICKED_UP",
        "COMPLETED",
        "CANCELLED",
        "EXPIRED",
    ];

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
});

router.get("/:id", async (req, res) => {
    const donation = await prisma.donation.findUnique({
        where: { id: req.params.id },
        include: { donor: true, matches: true, pickup: true },
    });

    if (!donation) {
        return res.status(404).json({
            success: false,
            message: "Donation not found",
        });
    }

    return res.json({ success: true, data: donation });
});

export default router;

