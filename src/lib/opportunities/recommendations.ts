import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { publicationDomain } from "@/lib/substack/publicRadar";

export function recommendedDomains(html: string, source: string): string[] {
  const domains = new Set<string>();
  const visit = (node: DefaultTreeAdapterMap["node"]) => {
    if ("tagName" in node && node.tagName === "a") {
      const href = node.attrs.find(attr => attr.name === "href")?.value;
      try {
        const target = new URL(href ?? "", `https://${source}`);
        if (target.protocol === "https:" && !target.username && !target.password && target.searchParams.get("utm_source") === "recommendations_page") {
          const domain = publicationDomain(target.hostname);
          if (domain !== source && domain !== "substack.com") domains.add(domain);
        }
      } catch { /* Ignore malformed or non-public recommendation URLs. */ }
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  };
  visit(parse(html));
  return [...domains].slice(0, 20);
}
