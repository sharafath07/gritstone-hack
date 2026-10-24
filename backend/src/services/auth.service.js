
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error("JWT_SECRET must be configured with a strong secret");
    }

    return secret;
}

function createToken(user) {
    return jwt.sign(
        {
            sub: user.id,
            role: user.role,
            organizationId: user.organizationId,
        },
        getJwtSecret(),
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "1d",
            issuer: "secondserve-api",
            audience: "secondserve-client",
        }
    );
}

export async function registerUser(input) {
    const email = input.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        const error = new Error("An account with this email already exists");
        error.status = 409;
        throw error;
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
            data: {
                name: input.organizationName.trim(),
                type: input.organizationType,
                address: input.address.trim(),
                city: input.city.trim(),
                phone: input.phone || null,
                latitude: input.latitude,
                longitude: input.longitude,
                capacity: input.capacity,
                acceptedCategories: input.acceptedCategories,
                dietaryRequirements: input.dietaryRequirements,
            },
        });

        const role =
            input.organizationType === "RECIPIENT"
                ? "RECIPIENT"
                : "DONOR";

        return tx.user.create({
            data: {
                name: input.name.trim(),
                email,
                passwordHash,
                role,
                organizationId: organization.id,
            },
            include: {
                organization: true,
            },
        });
    });

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
        },
        token: createToken(user),
    };
}

export async function loginUser(input) {
    const email = input.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
        where: { email },
        include: { organization: true },
    });

    const passwordMatches =
        user &&
        (await bcrypt.compare(input.password, user.passwordHash));

    if (!passwordMatches) {
        const error = new Error("Invalid email or password");
        error.status = 401;
        throw error;
    }

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
        },
        token: createToken(user),
    };
}
