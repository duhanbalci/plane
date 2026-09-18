import { describe, expect, it } from "vitest";
import { normalizeHtml } from "@/lib/html";
import { describeError } from "@/lib/plane-client";

describe("normalizeHtml", () => {
  it("decodes a body whose tags were entity-encoded", () => {
    expect(normalizeHtml("&lt;p&gt;&lt;strong&gt;Goal&lt;/strong&gt;: ship &amp; measure&lt;/p&gt;")).toBe(
      "<p><strong>Goal</strong>: ship & measure</p>"
    );
  });

  it("decodes quotes inside escaped attributes", () => {
    expect(normalizeHtml("&lt;a href=&quot;https://x.dev&quot;&gt;x&lt;/a&gt;")).toBe('<a href="https://x.dev">x</a>');
    expect(normalizeHtml("&lt;p&gt;it&#39;s &#x27;ok&#x27;&lt;/p&gt;")).toBe("<p>it's 'ok'</p>");
  });

  it("leaves real HTML alone, including entities it deliberately contains", () => {
    const html = "<p>Use &lt;div&gt; for layout &amp; spacing</p>";
    expect(normalizeHtml(html)).toBe(html);
  });

  it("leaves plain text alone, even with a less-than sign or an ampersand", () => {
    expect(normalizeHtml("a < b && c")).toBe("a < b && c");
    expect(normalizeHtml("R&amp;D budget")).toBe("R&amp;D budget");
  });

  it("decodes one level only, so a double-encoded body is not turned into markup twice", () => {
    expect(normalizeHtml("&lt;p&gt;&amp;lt;tag&amp;gt;&lt;/p&gt;")).toBe("<p>&lt;tag&gt;</p>");
  });
});

describe("describeError", () => {
  const roleDenial = { detail: "You do not have permission to perform this action." };
  const scopeDenial = { detail: "This token does not carry the scope required for this request." };

  it("blames project membership, not the write scope, when a read is refused", () => {
    const message = describeError(403, roleDenial, "GET");

    expect(message).toContain("project membership");
    expect(message).toContain("ask a project admin to add you");
    expect(message).not.toContain("mcp:write");
    expect(message).toContain("does not allow this read");
  });

  it("calls out a read-only token when a write fails the scope check", () => {
    const message = describeError(403, scopeDenial, "POST");

    expect(message).toContain("read-only");
    expect(message).toContain("mcp:write");
    expect(message).not.toContain("project admin");
  });

  it("names mcp:read when a read fails the scope check", () => {
    expect(describeError(403, scopeDenial, "GET")).toContain("mcp:read");
  });

  it("says change rather than read for a refused write", () => {
    expect(describeError(403, roleDenial, "PATCH")).toContain("does not allow this change");
  });

  it("never doubles the full stop Plane already ends its messages with", () => {
    for (const status of [400, 403, 404, 500]) {
      for (const method of ["GET", "POST"]) {
        expect(describeError(status, roleDenial, method)).not.toContain("..");
      }
    }
  });

  it("falls back to the raw payload when there is no detail field", () => {
    expect(describeError(400, { name: ["This field is required."] })).toBe(
      'Plane API error (400): {"name":["This field is required."]}'
    );
    expect(describeError(502, "Bad gateway")).toBe("Plane API error (502): Bad gateway");
  });
});
