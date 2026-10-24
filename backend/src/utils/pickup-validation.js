export function isScheduledTimeValid(scheduledAt, pickupEnd) {
    const scheduled = new Date(scheduledAt).getTime();
    const deadline = new Date(pickupEnd).getTime();

    if (!Number.isFinite(scheduled) || !Number.isFinite(deadline)) {
        return false;
    }

    return scheduled <= deadline;
}

export function isPickupDeadlineFuture(pickupEnd, now = new Date()) {
    const deadline = new Date(pickupEnd).getTime();
    const currentTime = new Date(now).getTime();

    if (!Number.isFinite(deadline) || !Number.isFinite(currentTime)) {
        return false;
    }

    return deadline > currentTime;
}