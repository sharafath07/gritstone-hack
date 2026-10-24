import test from "node:test";
import assert from "node:assert/strict";

import {
    isScheduledTimeValid,
    isPickupDeadlineFuture,
} from "./pickup-validation.js";

test("accepts a pickup scheduled before the deadline", () => {
    assert.equal(
        isScheduledTimeValid(
            "2026-10-24T12:00:00.000Z",
            "2026-10-24T14:00:00.000Z"
        ),
        true
    );
});

test("accepts a pickup scheduled exactly at the deadline", () => {
    assert.equal(
        isScheduledTimeValid(
            "2026-10-24T14:00:00.000Z",
            "2026-10-24T14:00:00.000Z"
        ),
        true
    );
});

test("rejects a pickup scheduled after the deadline", () => {
    assert.equal(
        isScheduledTimeValid(
            "2026-10-24T15:00:00.000Z",
            "2026-10-24T14:00:00.000Z"
        ),
        false
    );
});

test("rejects invalid scheduling dates", () => {
    assert.equal(isScheduledTimeValid("invalid", "also-invalid"), false);
});

test("recognizes a future pickup deadline", () => {
    assert.equal(
        isPickupDeadlineFuture(
            "2026-10-24T14:00:00.000Z",
            "2026-10-24T10:00:00.000Z"
        ),
        true
    );
});

test("rejects a deadline that has already passed", () => {
    assert.equal(
        isPickupDeadlineFuture(
            "2026-10-24T09:00:00.000Z",
            "2026-10-24T10:00:00.000Z"
        ),
        false
    );
});

test("rejects invalid deadline dates", () => {
    assert.equal(isPickupDeadlineFuture("invalid", "2026-10-24T10:00:00.000Z"), false);
});