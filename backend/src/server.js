import "dotenv/config";
import express from "express";
import cors from "cors";
import prisma from "./lib/prisma.js";
import organizationsRouter from "./routes/organizations.routes.js";
import donationsRouter from "./routes/donations.routes.js";
import matchesRouter from "./routes/matches.routes.js";
import aiRouter from "./routes/ai.routes.js";
import pickupsRouter from "./routes/pickups.routes.js";
import authRouter from "./routes/auth.routes.js";
import impactRouter from "./routes/impact.routes.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
    cors({
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
    }),
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
    res.json({
        name: "SecondServe API",
        status: "running",
        version: "1.0.0",
    });
});

app.get("/api/health", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        res.json({
            success: true,
            message: "SecondServe API and database are healthy",
        });
    } catch {
        res.status(503).json({
            success: false,
            message: "Database connection failed",
        });
    }
});

app.use("/api/organizations", organizationsRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/matches", matchesRouter);
app.use("/api/ai", aiRouter);
app.use("/api/auth", authRouter);
app.use("/api/pickups", pickupsRouter);
app.use("/api/impact", impactRouter);

app.use((error, _req, res, _next) => {
    console.error(error);

    const status = Number.isInteger(error.status)
        ? error.status
        : 500;

    res.status(status).json({
        success: false,
        message:
            status < 500
                ? error.message
                : "Internal server error",
    });
});
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found",
    });
});

app.use((error, _req, res, _next) => {
    console.error(error);

    res.status(500).json({
        success: false,
        message: "Internal server error",
    });
});

const server = app.listen(PORT, () => {
    console.log(`SecondServe API running at http://localhost:${PORT}`);
});

async function shutdown() {
    server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
