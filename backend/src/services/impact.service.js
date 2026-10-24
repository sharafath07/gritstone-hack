
import prisma from "../lib/prisma.js";

export async function getOrganizationImpact(organizationId) {
    const [
        donationsCreated,
        activeDonations,
        completedPickups,
        totalPickups,
    ] = await prisma.$transaction([
        prisma.donation.count({
            where: { donorOrgId: organizationId },
        }),

        prisma.donation.count({
            where: {
                donorOrgId: organizationId,
                status: {
                    in: ["AVAILABLE", "MATCHED", "RESERVED", "PICKED_UP"],
                },
            },
        }),

        prisma.pickup.findMany({
            where: {
                status: "COMPLETED",
                OR: [
                    { donation: { donorOrgId: organizationId } },
                    { match: { recipientOrgId: organizationId } },
                ],
            },
            select: {
                donation: {
                    select: {
                        servings: true,
                        donorOrgId: true,
                    },
                },
                match: {
                    select: {
                        recipientOrgId: true,
                    },
                },
            },
        }),

        prisma.pickup.count({
            where: {
                OR: [
                    { donation: { donorOrgId: organizationId } },
                    { match: { recipientOrgId: organizationId } },
                ],
            },
        }),
    ]);

    const mealsRescued = completedPickups.reduce(
        (total, pickup) => total + (pickup.donation.servings ?? 0),
        0
    );

    const partnerIds = new Set();

    for (const pickup of completedPickups) {
        if (pickup.donation.donorOrgId !== organizationId) {
            partnerIds.add(pickup.donation.donorOrgId);
        }

        if (pickup.match.recipientOrgId !== organizationId) {
            partnerIds.add(pickup.match.recipientOrgId);
        }
    }

    const completedCount = completedPickups.length;

    const pickupCompletionRate =
        totalPickups === 0
            ? 0
            : Math.round((completedCount / totalPickups) * 100);

    return {
        organizationId,
        donationsCreated,
        activeDonations,
        completedPickups: completedCount,
        mealsRescued,
        partnersHelped: partnerIds.size,
        totalPickups,
        pickupCompletionRate,
        generatedAt: new Date().toISOString(),
    };
}
