
import prisma from "../lib/prisma.js";

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return (
        earthRadiusKm *
        2 *
        Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    );
}

function scoreDistance(distanceKm) {
    if (distanceKm === null) return 5;
    if (distanceKm <= 5) return 30;
    if (distanceKm <= 10) return 25;
    if (distanceKm <= 20) return 18;
    if (distanceKm <= 50) return 10;
    return 2;
}

function scoreQuantity(servings, capacity) {
    if (servings == null || capacity == null) return 10;
    if (capacity <= 0) return 0;
    if (capacity >= servings) return 25;

    return Math.round((capacity / servings) * 25);
}

function scoreUrgency(pickupEnd) {
    const hoursRemaining =
        (new Date(pickupEnd).getTime() - Date.now()) / 3_600_000;

    if (hoursRemaining <= 2) return 25;
    if (hoursRemaining <= 6) return 20;
    if (hoursRemaining <= 12) return 15;
    if (hoursRemaining <= 24) return 10;
    return 5;
}

function normalizeTags(tags = []) {
    return new Set(tags.map((tag) => tag.trim().toUpperCase()));
}

function isEligibleRecipient(donation, recipient) {
    const acceptsCategory =
        recipient.acceptedCategories.length === 0 ||
        recipient.acceptedCategories.includes(donation.category);

    const donationTags = normalizeTags(donation.dietaryTags);
    const requirements = normalizeTags(recipient.dietaryRequirements);

    const requirementsMet = [...requirements].every((requirement) =>
        donationTags.has(requirement)
    );

    return acceptsCategory && requirementsMet;
}

export async function generateMatches(donationId) {
    const donation = await prisma.donation.findUnique({
        where: { id: donationId },
        include: { donor: true },
    });

    if (!donation) {
        const error = new Error("Donation not found");
        error.status = 404;
        throw error;
    }

    if (
        donation.status !== "AVAILABLE" ||
        new Date(donation.pickupEnd) <= new Date()
    ) {
        const error = new Error(
            "Only available donations with a future pickup deadline can be matched"
        );
        error.status = 400;
        throw error;
    }

    const recipients = await prisma.organization.findMany({
        where: {
            id: { not: donation.donorOrgId },
            type: { in: ["RECIPIENT", "BOTH"] },
        },
    });

    const eligibleRecipients = recipients.filter((recipient) =>
        isEligibleRecipient(donation, recipient)
    );

    const ranked = eligibleRecipients.map((recipient) => {
        const hasCoordinates =
            donation.donor.latitude != null &&
            donation.donor.longitude != null &&
            recipient.latitude != null &&
            recipient.longitude != null;

        const distanceKm = hasCoordinates
            ? calculateDistanceKm(
                donation.donor.latitude,
                donation.donor.longitude,
                recipient.latitude,
                recipient.longitude
            )
            : null;

        const distanceScore = scoreDistance(distanceKm);
        const quantityScore = scoreQuantity(
            donation.servings,
            recipient.capacity
        );
        const urgencyScore = scoreUrgency(donation.pickupEnd);
        const baseScore = 20;

        const score =
            distanceScore + quantityScore + urgencyScore + baseScore;

        const reasons = [];

        if (distanceKm !== null) {
            reasons.push(`approximately ${distanceKm.toFixed(1)} km away`);
        } else {
            reasons.push("distance could not be calculated because location data is missing");
        }

        if (donation.servings != null && recipient.capacity != null) {
            reasons.push(
                `listed capacity is ${recipient.capacity} servings for ${donation.servings} donation servings`
            );
        }

        reasons.push(
            `accepted food category: ${donation.category}`
        );

        reasons.push(
            `pickup urgency score: ${urgencyScore}/25`
        );

        return {
            recipient,
            distanceKm,
            score: Math.min(score, 100),
            explanation: reasons.join("; "),
        };
    });

    ranked.sort((a, b) => b.score - a.score);

    const eligibleIds = ranked.map(({ recipient }) => recipient.id);

    await prisma.$transaction(async (tx) => {
        // Remove outdated recommendations, without deleting decisions
        // already made by recipients.
        await tx.match.deleteMany({
            where: {
                donationId,
                status: "RECOMMENDED",
                ...(eligibleIds.length
                    ? { recipientOrgId: { notIn: eligibleIds } }
                    : {}),
            },
        });

        for (const item of ranked) {
            await tx.match.upsert({
                where: {
                    donationId_recipientOrgId: {
                        donationId,
                        recipientOrgId: item.recipient.id,
                    },
                },
                update: {
                    score: item.score,
                    explanation: item.explanation,
                },
                create: {
                    donationId,
                    recipientOrgId: item.recipient.id,
                    score: item.score,
                    explanation: item.explanation,
                    status: "RECOMMENDED",
                },
            });
        }
    });

    const savedMatches = await prisma.match.findMany({
        where: {
            donationId,
            recipientOrgId: { in: eligibleIds },
        },
        include: { recipient: true },
        orderBy: { score: "desc" },
    });

    return savedMatches.map((match) => ({
        ...match,
        distanceKm:
            ranked.find(
                (item) => item.recipient.id === match.recipientOrgId
            )?.distanceKm ?? null,
    }));
}
