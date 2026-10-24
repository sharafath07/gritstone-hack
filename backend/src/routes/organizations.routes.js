
import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";

const router = Router();

const organizationSchema = z.object({
    name: z.string().trim().min(2).max(120),
    type: z.enum(["DONOR", "RECIPIENT", "BOTH"]),
    address: z.string().trim().min(3),
    city: z.string().trim().min(2),
    phone: z.string().trim().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    capacity: z.number().int().positive().optional(),
    acceptedCategories: z
        .array(z.enum([
            "MEALS",
            "BAKERY",
            "PRODUCE",
            "DAIRY",
            "PACKAGED",
            "OTHER",
        ]))
        .optional(),

    dietaryRequirements: z
        .array(z.string().trim().min(1).max(40))
        .optional(),
});

router.post("/", async (req, res) => {
    const parsed = organizationSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: "Invalid organization data",
            errors: parsed.error.issues,
        });
    }

    const organization = await prisma.organization.create({
        data: parsed.data,
    });

    return res.status(201).json({
        success: true,
        data: organization,
    });
});

router.get("/", async (_req, res) => {
    const organizations = await prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
    });

    return res.json({
        success: true,
        count: organizations.length,
        data: organizations,
    });
});

router.get("/:id", async (req, res) => {
    const organization = await prisma.organization.findUnique({
        where: { id: req.params.id },
    });

    if (!organization) {
        return res.status(404).json({
            success: false,
            message: "Organization not found",
        });
    }

    return res.json({ success: true, data: organization });
});

export default router;
