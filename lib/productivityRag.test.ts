import assert from "node:assert/strict";
import test from "node:test";
import { productivityRag } from "./productivityRag.ts";

test("productivity RAG boundaries are exact", () => {
  assert.equal(productivityRag(10, 10), "green");
  assert.equal(productivityRag(10, 9.999), "amber");
  assert.equal(productivityRag(10, 10 / 1.1), "amber");
  assert.equal(productivityRag(10, 9), "red");
});

test("productivity RAG returns neutral states before evaluating performance", () => {
  assert.equal(productivityRag(undefined, 5), "baseline-missing");
  assert.equal(productivityRag(5, undefined), "no-actuals");
});

test("each activity is assessed independently so mixed units do not affect RAG", () => {
  assert.deepEqual([productivityRag(5, 5), productivityRag(20, 18)], ["green", "red"]);
});
