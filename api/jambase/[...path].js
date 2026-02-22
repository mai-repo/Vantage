const BASE_URL = "https://www.jambase.com/jb-api/v1";

export default async function handler(req, res) {
  try {
    const apiKey = process.env.JAMBASE_API_KEY;
    if (!apiKey) {
      throw new Error("JAMBASE_API_KEY is not configured");
    }

    const pathParam = req.query.path;
    const endpoint = Array.isArray(pathParam) ? pathParam.join("/") : (pathParam || "");
    const url = new URL(req.url || "", "http://localhost");

    const target = new URL(`${BASE_URL}/${endpoint}`);
    url.searchParams.forEach((value, key) => {
      if (key.toLowerCase() === "apikey") return;
      target.searchParams.set(key, value);
    });
    if (!target.searchParams.has("apikey")) {
      target.searchParams.set("apikey", apiKey);
    }

    const headers = {};
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

    const upstream = await fetch(target.toString(), init);
    const text = await upstream.text();
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-encoding") return;
      res.setHeader(key, value);
    });
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: error?.message || "JamBase proxy error" });
  }
}
