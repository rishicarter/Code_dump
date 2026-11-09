import { describe, it, expect } from "vitest";
import YAML from "yaml";
import { applyPatch, describeOp } from "../yamlPatch.js";

const BASE = `models:
  containers:
    - id: UI1
      description: UI
`;

// applyPatch: the mutation engine behind "Apply changes". Every test drives it
// from YAML text in to YAML text out so the contract stays text-based.
describe("applyPatch", () => {
  it("test_applyPatch_addObjectKey_returnsKeyInYaml", () => {
    const result = applyPatch(BASE, [{ op: "add", path: "/models/version", value: 1 }]);
    // Assert on the parsed document: YAML re-quotes values like "1.0" to keep
    // them strings, so matching raw text here would test the serialiser.
    expect(YAML.parse(result).models.version).toBe(1);
  });

  it("test_applyPatch_appendToArray_usesDashAsLastSegment", () => {
    const result = applyPatch(BASE, [
      { op: "add", path: "/models/containers/-", value: { id: "UI2", description: "Another" } },
    ]);
    expect(result).toContain("id: UI2");
    expect(result.match(/id:/g)).toHaveLength(2);
  });

  it("test_applyPatch_insertAtIndex_placesValueBeforeExistingEntries", () => {
    const result = applyPatch(BASE, [{ op: "add", path: "/models/containers/0", value: { id: "UI0" } }]);
    expect(result.indexOf("UI0")).toBeLessThan(result.indexOf("UI1"));
  });

  it("test_applyPatch_replaceScalar_updatesExistingValue", () => {
    const result = applyPatch(BASE, [
      { op: "replace", path: "/models/containers/0/description", value: "Updated description" },
    ]);
    expect(result).toContain("description: Updated description");
    expect(result).not.toContain("description: UI\n");
  });

  it("test_applyPatch_removeArrayIndex_dropsTheEntry", () => {
    const result = applyPatch(BASE, [{ op: "remove", path: "/models/containers/0" }]);
    expect(result).not.toContain("UI1");
    expect(result).toContain("containers: []");
  });

  it("test_applyPatch_removeObjectKey_dropsTheKey", () => {
    const result = applyPatch(BASE, [{ op: "remove", path: "/models/containers/0/id" }]);
    expect(result).not.toContain("id:");
    expect(result).toContain("description: UI");
  });

  it("test_applyPatch_multipleOps_appliesEachInOrder", () => {
    const result = applyPatch(BASE, [
      { op: "add", path: "/models/containers/-", value: { id: "UI2", description: "Second" } },
      { op: "replace", path: "/models/containers/0/description", value: "Renamed" },
    ]);
    expect(result).toContain("id: UI2");
    expect(result).toContain("description: Renamed");
  });

  it("test_applyPatch_escapedPointerSegment_resolvesKeyContainingSlash", () => {
    const withSlash = "a:\n  b/c: 1\n";
    const result = applyPatch(withSlash, [{ op: "replace", path: "/a/b~1c", value: 2 }]);
    expect(result).toContain("b/c: 2");
  });

  it("test_applyPatch_emptyOpList_returnsNormalisedYaml", () => {
    expect(applyPatch(BASE, []).trim()).toBe(BASE.trim());
  });

  it("test_applyPatch_unknownOp_throwsSoBadPatchesSurface", () => {
    expect(() => applyPatch(BASE, [{ op: "move", path: "/models" }])).toThrow(/unsupported op/i);
  });

  it("test_applyPatch_missingIntermediateKey_throws", () => {
    expect(() => applyPatch(BASE, [{ op: "replace", path: "/nope/deep/key", value: 1 }])).toThrow();
  });

  it("test_applyPatch_nonNumericArrayIndex_throws", () => {
    expect(() => applyPatch(BASE, [{ op: "remove", path: "/models/containers/abc" }])).toThrow();
  });

  it("test_applyPatch_invalidYaml_throws", () => {
    expect(() => applyPatch("a:\n  - b\n c: broken\n", [])).toThrow();
  });
});

describe("describeOp", () => {
  it("test_describeOp_withValue_includesSerialisedValue", () => {
    expect(describeOp({ op: "add", path: "/a", value: { id: "UI2" } })).toBe('add /a  {"id":"UI2"}');
  });

  it("test_describeOp_withoutValue_omitsValueSegment", () => {
    expect(describeOp({ op: "remove", path: "/a" })).toBe("remove /a");
  });
});