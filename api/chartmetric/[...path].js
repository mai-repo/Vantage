const BASE_URL = "https://api.chartmetric.com/api";

let cachedToken = "";
let cachedExpiry = 0;

async function getToken() {
  const refreshToken = process.env.CHARTMETRIC_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("CHARTMETRIC_REFRESH_TOKEN is not configured");
  }
  if (cachedToken && Date.now() < cachedExpiry) return cachedToken;

  const res = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshtoken: refreshToken }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Chartmetric token error: ${res.status} ${detail}`);
  }
  const data = await res.json();
  cachedToken = data.token;
  cachedExpiry = Date.now() + 3500 * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  try {
    const pathParam = req.query.path;
    const endpoint = Array.isArray(pathParam) ? pathParam.join("/") : (pathParam || "");
    const url = new URL(req.url || "", "http://localhost");
    const target = `${BASE_URL}/${endpoint}${url.search}`;

    const token = await getToken();
    const headers = {
      Authorization: `Bearer ${token}`,
    };
    if (req.headers["content-type"]) {
      headers["Content-Type"] = req.headers["content-type"];
    }

    const init = {
      method: req.method,
      headers,
    };
    if (req.method && !["GET", "HEAD"].includes(req.method)) {
      init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    }

    const upstream = await fetch(target, init);
    const text = await upstream.text();
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-encoding") return;
      res.setHeader(key, value);
    });
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: error?.message || "Chartmetric proxy error" });
  }
}
