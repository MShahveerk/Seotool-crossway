import { fetchCompetitorHtmlDetails } from "../lib/competitorAnalysis.js";

async function main() {
  console.log("Testing fetchCompetitorHtmlDetails for crosswayconsulting.com...");
  const res1 = await fetchCompetitorHtmlDetails("https://crosswayconsulting.com");
  console.log("Result 1 (crosswayconsulting.com):", {
    title: res1.title,
    wordCount: res1.wordCount,
    headingsCount: res1.headings?.length,
    h1Count: res1.h1Count,
    h2Count: res1.h2Count,
    schemas: res1.schemas,
  });

  const res2 = await fetchCompetitorHtmlDetails("https://www.crosswayconsulting.com");
  console.log("Result 2 (www.crosswayconsulting.com):", {
    title: res2.title,
    wordCount: res2.wordCount,
    headingsCount: res2.headings?.length,
    h1Count: res2.h1Count,
    h2Count: res2.h2Count,
    schemas: res2.schemas,
  });
}

main().catch(console.error);
