import prisma from "./prisma";

export async function getSerperApiKey() {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: "serper_api_key" },
    });
    return row?.value || process.env.SERPER_API_KEY || "";
  } catch {
    return process.env.SERPER_API_KEY || "";
  }
}

export async function querySerper(endpoint, query, options = {}) {
  const apiKey = await getSerperApiKey();
  if (!apiKey) {
    throw new Error("Serper.dev API key is not configured. Please configure it in User Management (Admin Settings).");
  }

  // Map user-friendly tab names to exact serper.dev endpoint path
  // Endpoint list: search, images, videos, news, maps, autocomplete
  const subPath = endpoint === "web" ? "search" : endpoint;
  const url = `https://google.serper.dev/${subPath}`;

  const requestBody = {
    q: query,
    gl: options.gl || "us",
    hl: options.hl || "en",
    ...options,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Serper API returned invalid JSON: ${text.slice(0, 100)}`);
  }

  if (!response.ok) {
    throw new Error(data.message || `Serper.dev API returned status ${response.status}: ${text.slice(0, 100)}`);
  }

  return data;
}
