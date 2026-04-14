import { env } from "../config/env.js";

function fallbackResults(query) {
  return [
    {
      title: `${query} - Overview`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      snippet: `General search results for "${query}".`,
      source: "Google"
    },
    {
      title: `${query} - Latest News`,
      url: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
      snippet: `Latest news and updates related to "${query}".`,
      source: "Google News"
    },
    {
      title: `${query} - Documentation`,
      url: `https://www.bing.com/search?q=${encodeURIComponent(`${query} documentation`)}`,
      snippet: `Reference documentation and learning resources for "${query}".`,
      source: "Bing"
    }
  ];
}

function parseGeminiResults(rawText) {
  try {
    const fencedMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/i);
    const jsonCandidate = fencedMatch ? fencedMatch[1] : rawText;
    const parsed = JSON.parse(jsonCandidate);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
      .slice(0, 18)
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet || "No description available.",
        source: item.source || "Gemini"
      }));
  } catch (_error) {
    return [];
  }
}

export async function getSmartSearchResults(query) {
  if (!env.geminiApiKey) return fallbackResults(query);

  const prompt = `
You are a search assistant. Return exactly a JSON array with up to 18 objects.
Each object must have:
- title: short result title
- url: direct URL
- snippet: 1-line summary
- source: source label like Google, Wikipedia, YouTube, GitHub, News, StackOverflow

Query: "${query}"

Rules:
- Include relevant and likely useful results.
- URLs must be valid and start with https://
- Do not include markdown or explanations, only JSON array.
  `.trim();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1600
        }
      })
    }
  );

  if (!response.ok) return fallbackResults(query);

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = parseGeminiResults(text);
  return parsed.length ? parsed : fallbackResults(query);
}
