
import test from "node:test";
import assert from "node:assert/strict";

import {
    canTransitionPickup,
} from "./pickup-transitions.js";

test("PENDING can move to SCHEDULED", () => {
    assert.equal(
        canTransitionPickup("PENDING", "SCHEDULED"),
        true
    );
});

test("SCHEDULED can move to IN_TRANSIT", () => {
    assert.equal(
        canTransitionPickup("SCHEDULED", "IN_TRANSIT"),
        true
    );
});

test("IN_TRANSIT can move to COMPLETED", () => {
    assert.equal(
        canTransitionPickup("IN_TRANSIT", "COMPLETED"),
        true
    );
});

test("PENDING cannot move directly to COMPLETED", () => {
    assert.equal(
        canTransitionPickup("PENDING", "COMPLETED"),
        false
    );
});

test("COMPLETED cannot return to IN_TRANSIT", () => {
    assert.equal(
        canTransitionPickup("COMPLETED", "IN_TRANSIT"),
        false
    );
});

test("Unknown statuses are rejected", () => {
    assert.equal(
        canTransitionPickup("UNKNOWN", "COMPLETED"),
        false
    );
});
