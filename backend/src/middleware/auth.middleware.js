import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

export async function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication token required",
        });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
        return res.status(500).json({
            success: false,
            message: "Authentication is not configured",
        });
    }

    try {
        const payload = jwt.verify(authorization.slice(7), secret, {
            issuer: "secondserve-api",
            audience: "secondserve-client",
        });

        if (
            typeof payload === "string" ||
            !payload.sub ||
            !payload.organizationId
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token",
            });
        }

        // Check the current database record instead of trusting
        // organization and role information from the token alone.
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                role: true,
                organizationId: true,
            },
        });

        if (!user || !user.organizationId) {
            return res.status(401).json({
                success: false,
                message: "User account is invalid or no longer active",
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError") {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired authentication token",
            });
        }

        next(error);
    }
}

export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to perform this action",
            });
        }

        next();
    };
}
