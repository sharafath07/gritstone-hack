
import jwt from "jsonwebtoken";

export function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Authentication token required",
        });
    }

    const token = authorization.slice(7);
    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
        return res.status(500).json({
            success: false,
            message: "Authentication is not configured",
        });
    }

    try {
        const payload = jwt.verify(token, secret, {
            issuer: "secondserve-api",
            audience: "secondserve-client",
        });

        if (
            typeof payload === "string" ||
            !payload.sub ||
            !payload.organizationId ||
            !payload.role
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token",
            });
        }

        req.user = {
            id: payload.sub,
            role: payload.role,
            organizationId: payload.organizationId,
        };

        next();
    } catch {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token",
        });
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
