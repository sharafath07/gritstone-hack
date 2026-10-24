
import { Router } from "express";
import { z } from "zod";
import {
    registerUser,
    loginUser,
} from "../services/auth.service.js";

const router = Router();

const registerSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.email(),
    password: z.string().min(10).max(72),
    organizationName: z.string().trim().min(2).max(150),
    organizationType: z.enum(["DONOR", "RECIPIENT", "BOTH"]),
    address: z.string().trim().min(3).max(250),
    city: z.string().trim().min(2).max(100),
    phone: z.string().trim().max(30).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    capacity: z.number().int().positive().optional(),
    acceptedCategories: z.array(
        z.enum(["MEALS", "BAKERY", "PRODUCE", "DAIRY", "PACKAGED", "OTHER"])
    ).optional(),
    dietaryRequirements: z.array(
        z.string().trim().min(1).max(40)
    ).optional(),
}).strict().refine(
    (data) =>
        (data.latitude === undefined) ===
        (data.longitude === undefined),
    {
        message: "Latitude and longitude must be supplied together",
        path: ["latitude"],
    }
);

const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(1).max(72),
}).strict();

router.post("/register", async (req, res, next) => {
    try {
        const parsed = registerSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid registration details",
                errors: parsed.error.issues,
            });
        }

        const result = await registerUser(parsed.data);

        return res.status(201).json({
            success: true,
            message: "Account created successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

router.post("/login", async (req, res, next) => {
    try {
        const parsed = loginSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: "Invalid login details",
                errors: parsed.error.issues,
            });
        }

        const result = await loginUser(parsed.data);

        return res.json({
            success: true,
            message: "Login successful",
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
