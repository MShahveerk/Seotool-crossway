import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalStudioUploadPath,
  studioGreetingHeadline,
  studioGreetingName,
} from "./studioProjectLabel.js";

test("studio greeting never uses a raw Facebook page id", () => {
  assert.equal(studioGreetingName("394580917081045"), "");
  assert.equal(studioGreetingName("394580917081045", "Facebook page"), "");
  assert.equal(studioGreetingName("394580917081045", "Unnamed page 394580917081045"), "");
  assert.equal(studioGreetingName("394580917081045", "Hala Jets"), "Hala Jets");
  assert.equal(studioGreetingHeadline("post", ""), "What should we post today?");
  assert.equal(
    studioGreetingHeadline("post", "Hala Jets"),
    "What should we post for Hala Jets today?"
  );
});

test("website projects keep the hostname", () => {
  assert.equal(studioGreetingName("https://www.halajets.com/"), "halajets.com");
  assert.equal(studioGreetingName("sc-domain:example.com"), "example.com");
});

test("operator image paths must be local uploads", () => {
  assert.equal(isLocalStudioUploadPath("/api/uploads/abc.png"), true);
  assert.equal(isLocalStudioUploadPath("https://evil.example/x.png"), false);
  assert.equal(isLocalStudioUploadPath("/api/uploads/../etc/passwd"), false);
});
