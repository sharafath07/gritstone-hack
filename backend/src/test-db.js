import prisma from "./lib/prisma.js";

try {
    await prisma.$connect();

    const result = await prisma.$queryRaw`SELECT current_database() AS database`;

    console.log("Database connection successful:", result);
} catch (error) {
    console.error("Database connection failed:", error.message);
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}