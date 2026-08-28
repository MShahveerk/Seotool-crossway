import assert from "node:assert/strict";
import test from "node:test";
import { confirmedPitchCost } from "./prospectUnpaid.js";

test("a live write-for-us page with no paid language is unpaid", () => {
  assert.equal(
    confirmedPitchCost({ cost: "unknown", openKinds: ["contribute"] }),
    "unpaid"
  );
});

test("explicit free-listing copy is unpaid", () => {
  assert.equal(
    confirmedPitchCost({ cost: "unpaid", openKinds: ["listing"] }),
    "unpaid"
  );
});

test("paid language wins even when a contribute path exists", () => {
  assert.equal(
    confirmedPitchCost({ cost: "paid", openKinds: ["contribute"] }),
    "paid"
  );
  assert.equal(
    confirmedPitchCost({ cost: "unknown", paidOnly: true, openKinds: ["paid"] }),
    "paid"
  );
});

test("a listing or submit form without free copy stays unconfirmed", () => {
  assert.equal(
    confirmedPitchCost({ cost: "unknown", openKinds: ["listing"] }),
    "unknown"
  );
  assert.equal(
    confirmedPitchCost({ cost: "unknown", openKinds: ["submit"] }),
    "unknown"
  );
});
