
export const pickupTransitions = {
    PENDING: ["SCHEDULED", "FAILED", "CANCELLED"],
    SCHEDULED: ["IN_TRANSIT", "FAILED", "CANCELLED"],
    IN_TRANSIT: ["COMPLETED", "FAILED"],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
};

export function canTransitionPickup(currentStatus, nextStatus) {
    return pickupTransitions[currentStatus]?.includes(nextStatus) ?? false;
}
