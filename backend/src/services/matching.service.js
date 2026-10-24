
import prisma from "../lib/prisma.js";

const EARTH_RADIUS_KM = 6371;

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return (
        EARTH_RADIUS_KM *
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

function scoreQuantity(donation, recipient) {
    if (!donation.servings || !recipient.capacity) {
        return 10;
    }

    if (recipient.capacity >= donation.servings) {
        return 25;
    }

    const fitRatio = recipient.capacity / donation.servings;
    return Math.round(25 * fitRatio);
}

function scoreUrgency(pickupEnd) {
    const hoursRemaining =
        (new Date(pickupEnd).getTime() - Date.now()) / 3_600_000;

    if (hoursRemaining <= 0) return 0;
    if (hoursRemaining <= 2) return 25;
    if (hoursRemaining <= 6) return 20;
    if (hoursRemaining <= 12) return 15;
    if (hoursRemaining <= 24) return 10;
    return 5;
}

function buildExplanation({
    distanceKm,
    quantityScore,
    urgencyScore,
    donation,
    recipient,
}) {
    const reasons = [];

    if (distanceKm !== null) {
        reasons.push(
            `approximately ${distanceKm.toFixed(1)} km from the donor`,
        );
    } else {
        reasons.push("distance could not be calculated because location coordinates are missing");
    }

    if (donation.servings && recipient.capacity) {
        if (recipient.capacity >= donation.servings) {
            reasons.push(
                `listed capacity of ${recipient.capacity} can accommodate ${donation.servings} servings`,
            );
        } else {
            reasons.push(
                `listed capacity of ${recipient.capacity} is below the ${donation.servings} servings offered`,
            );
        }
    } else {
        reasons.push("quantity fit could not be fully assessed because serving or capacity data is missing");
    }

    if (urgencyScore >= 20) {
        reasons.push("the pickup deadline is approaching");
    }

    return `Recommended based on available information: ${reasons.join("; ")}.`;
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

    if (donation.status !== "AVAILABLE") {
        const error = new Error(
            "Only available donations can be matched",
        );
        error.status = 409;
        throw error;
    }

    if (new Date(donation.pickupEnd) <= new Date()) {
        const error = new Error(
            "The donation pickup window has expired",
        );
        error.status = 409;
        throw error;
    }

    const recipients = await prisma.organization.findMany({
        where: {
            id: { not: donation.donorOrgId },
            type: { in: ["RECIPIENT", "BOTH"] },
        },
    });

    const ranked = recipients.map((recipient) => {
        const hasCoordinates =
            donation.donor.latitude !== null &&
            donation.donor.longitude !== null &&
            recipient.latitude !== null &&
            recipient.longitude !== null;

        const distanceKm = hasCoordinates
            ? getDistanceKm(
                donation.donor.latitude,
                donation.donor.longitude,
                recipient.latitude,
                recipient.longitude,
            )
            : null;

        const distanceScore = scoreDistance(distanceKm);
        const quantityScore = scoreQuantity(donation, recipient);
        const urgencyScore = scoreUrgency(donation.pickupEnd);

        const score = Math.min(
            100,
            distanceScore + quantityScore + urgencyScore + 20,
        );

        return {
            recipientOrgId: recipient.id,
            score,
            explanation: buildExplanation({
                distanceKm,
                quantityScore,
                urgencyScore,
                donation,
                recipient,
            }),
            distanceKm,
        };
    });

    ranked.sort((a, b) => b.score - a.score);

    const savedMatches = await prisma.$transaction(
        ranked.map((candidate) =>
            prisma.match.upsert({
                where: {
                    donationId_recipientOrgId: {
                        donationId,
                        recipientOrgId: candidate.recipientOrgId,
                    },
                },
                create: {
                    donationId,
                    recipientOrgId: candidate.recipientOrgId,
                    score: candidate.score,
                    explanation: candidate.explanation,
                },
                update: {
                    score: candidate.score,
                    explanation: candidate.explanation,
                },
                include: {
                    recipient: true,
                },
            }),
        ),
    );

    return savedMatches.map((match) => ({
        ...match,
        distanceKm:
            ranked.find(
                (candidate) =>
                    candidate.recipientOrgId === match.recipientOrgId,
            )?.distanceKm ?? null,
    })).sort((a, b) => b.score - a.score);
}
