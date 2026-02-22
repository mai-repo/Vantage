import { Artist, MarketInsight, Venue } from "../types";

// Requests go through Vercel serverless in production.
const CM = "/api/chartmetric";
const JB_BASE = "/api/jambase";
const JB_API_KEY = import.meta.env.DEV ? import.meta.env.VITE_JAMBASE_API_KEY : "";

// --- Chartmetric token management ---
let cmToken = "";
let cmTokenExpiry = 0;

async function getChartmetricToken(): Promise<string> {
  if (import.meta.env.PROD) {
    throw new Error("Chartmetric token should be handled server-side in production");
  }
  if (cmToken && Date.now() < cmTokenExpiry) return cmToken;
  const refreshToken = import.meta.env.VITE_CHARTMETRIC_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("VITE_CHARTMETRIC_REFRESH_TOKEN is not configured");
  const res = await fetch(`${CM}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshtoken: refreshToken }),
  });
  const data = await res.json();
  cmToken = data.token;
  cmTokenExpiry = Date.now() + 3500 * 1000;
  return cmToken;
}

async function chartmetricFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  if (import.meta.env.DEV) {
    const token = await getChartmetricToken();
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${CM}${path}`, { ...init, headers });
}

export async function searchArtists(query: string): Promise<Artist[]> {
  const res = await chartmetricFetch(`/search?q=${encodeURIComponent(query)}&type=artists`);
  if (!res.ok) throw new Error("Failed to search artists");
  const data = await res.json();
  return data.obj?.artists || [];
}

export async function getArtistProfile(id: number): Promise<any> {
  const res = await chartmetricFetch(`/artist/${id}`);
  if (!res.ok) throw new Error("Failed to get artist profile");
  return res.json();
}

// Fallback lat/lng for major music markets when API doesn't include coordinates
const CITY_COORDS: Record<string, [number, number]> = {
  "Amsterdam": [52.3702, 4.8952],
  "Atlanta": [33.7490, -84.3880],
  "Austin": [30.2672, -97.7431],
  "Bangkok": [13.7563, 100.5018],
  "Barcelona": [41.3851, 2.1734],
  "Berlin": [52.5200, 13.4050],
  "Boston": [42.3601, -71.0589],
  "Brisbane": [-27.4698, 153.0251],
  "Brussels": [50.8503, 4.3517],
  "Buenos Aires": [-34.6037, -58.3816],
  "Chicago": [41.8781, -87.6298],
  "Copenhagen": [55.6761, 12.5683],
  "Dallas": [32.7767, -96.7970],
  "Dubai": [25.2048, 55.2708],
  "Frankfurt": [50.1109, 8.6821],
  "Hamburg": [53.5753, 10.0153],
  "Houston": [29.7604, -95.3698],
  "Istanbul": [41.0082, 28.9784],
  "Jakarta": [-6.2088, 106.8456],
  "Johannesburg": [-26.2041, 28.0473],
  "Lagos": [6.5244, 3.3792],
  "London": [51.5074, -0.1278],
  "Los Angeles": [34.0522, -118.2437],
  "Madrid": [40.4168, -3.7038],
  "Manila": [14.5995, 120.9842],
  "Melbourne": [-37.8136, 144.9631],
  "Mexico City": [19.4326, -99.1332],
  "Miami": [25.7617, -80.1918],
  "Milan": [45.4654, 9.1866],
  "Montreal": [45.5017, -73.5673],
  "Moscow": [55.7558, 37.6176],
  "Mumbai": [19.0760, 72.8777],
  "Munich": [48.1351, 11.5820],
  "Nairobi": [-1.2921, 36.8219],
  "Nashville": [36.1627, -86.7816],
  "New York": [40.7128, -74.0060],
  "Paris": [48.8566, 2.3522],
  "Phoenix": [33.4484, -112.0740],
  "Rome": [41.9028, 12.4964],
  "San Francisco": [37.7749, -122.4194],
  "Sao Paulo": [-23.5505, -46.6333],
  "São Paulo": [-23.5505, -46.6333],
  "Seoul": [37.5665, 126.9780],
  "Stockholm": [59.3293, 18.0686],
  "Sydney": [-33.8688, 151.2093],
  "Tokyo": [35.6762, 139.6503],
  "Toronto": [43.6532, -79.3832],
  "Vancouver": [49.2827, -123.1207],
  "Vienna": [48.2082, 16.3738],
  "Warsaw": [52.2297, 21.0122],
  "Zurich": [47.3769, 8.5417],
};

export async function getArtistWherePeopleListen(id: number): Promise<MarketInsight[]> {
  const res = await chartmetricFetch(`/artist/${id}/where-people-listen`);
  if (!res.ok) throw new Error("Failed to get where people listen");
  const data = await res.json();
  console.log("[WPL] raw response keys:", Object.keys(data));
  console.log("[WPL] data.obj keys:", data.obj ? Object.keys(data.obj) : "data.obj is null/undefined");

  const citiesObj: Record<string, any[]> = data.obj?.cities ?? data.cities ?? {};
  const cityNames = Object.keys(citiesObj);
  console.log("[WPL] city count:", cityNames.length, "| cities:", cityNames.slice(0, 10));

  if (cityNames.length > 0) {
    const firstCity = cityNames[0];
    const firstEntries = citiesObj[firstCity];
    console.log(`[WPL] "${firstCity}" has ${firstEntries?.length} entries. First entry:`, firstEntries?.[0], "Last entry:", firstEntries?.[firstEntries.length - 1]);
  }

  const results = Object.entries(citiesObj)
    .map(([cityName, entries]): MarketInsight | null => {
      if (!entries || entries.length === 0) return null;
      // Use most recent entry (last in array) for listener count and coords
      const latest = entries[entries.length - 1];
      const fallback = CITY_COORDS[cityName];
      const lat = latest.lat ?? fallback?.[0];
      const lng = latest.lng ?? fallback?.[1];
      if (lat == null || lng == null) {
        console.log(`[WPL] skipping "${cityName}" — no lat/lng in entry or fallback. Entry keys:`, Object.keys(latest));
        return null;
      }
      return {
        city: cityName,
        country: latest.code2 || latest.country || "",
        listeners: latest.listeners ?? latest.count ?? 0,
        lat,
        lng,
        trend: entries.map((e: any) => e.listeners ?? e.count ?? 0),
      };
    })
    .filter((m): m is MarketInsight => m !== null)
    .sort((a, b) => b.listeners - a.listeners);

  console.log("[WPL] final markets count:", results.length, "| top 3:", results.slice(0, 3).map(m => `${m.city}(${m.listeners})`));
  return results;
}

export async function getArtistStats(id: number): Promise<any> {
  const res = await chartmetricFetch(`/artist/${id}/stats`);
  if (!res.ok) throw new Error("Failed to get artist stats");
  return res.json();
}

export async function getRelatedArtists(id: number): Promise<any[]> {
  const query = new URLSearchParams({ limit: "12" });
  const res = await chartmetricFetch(`/artist/${id}/relatedartists?${query.toString()}`);
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      detail = "";
    }
    console.warn("[Related Artists] request failed", res.status, res.statusText, detail.slice(0, 500));
    return [];
  }
  const data = await res.json();
  console.log("[Related Artists] raw response", data);
  return data?.obj?.data ?? data?.obj ?? data?.data ?? [];
}

function buildJambaseUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URLSearchParams({ ...params });
  if (JB_API_KEY) url.set("apikey", JB_API_KEY);
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${JB_BASE}${path}?${url.toString()}`;
}

export async function getVenues(
  city: string,
  countryCode?: string,
  lat?: number,
  lng?: number,
): Promise<Venue[]> {
  const tryFetch = async (params: Record<string, string>) => {
    const url = buildJambaseUrl("/venues", params);
    const res = await fetch(url);
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
      console.warn(`[JamBase] venues ${res.status} ${res.statusText}`, detail.slice(0, 500));
      return null;
    }
    const data = await res.json();
    console.log("[JamBase] venues response", { count: data?.venues?.length ?? 0 });
    return data;
  };

  // Primary: lat/lng (most reliable for venues per JamBase geo params)
  let data = null;
  if (lat != null && lng != null) {
    data = await tryFetch({ geoLatitude: String(lat), geoLongitude: String(lng) });
    if (Array.isArray(data?.venues) && data.venues.length > 0) return data.venues;
  }

  const baseParams: Record<string, string> = {};
  if (countryCode && countryCode.length === 2) baseParams.geoCountryIso2 = countryCode;

  // Fallback 1: country-level geo
  data = await tryFetch(baseParams);
  if (Array.isArray(data?.venues) && data.venues.length > 0) return data.venues;

  // Fallback 2: cityName (not guaranteed supported for venues)
  if (city) {
    data = await tryFetch({ cityName: city });
    if (Array.isArray(data?.venues) && data.venues.length > 0) return data.venues;
  }

  return data?.venues || [];
}

export async function getEvents(
  city: string,
  countryCode?: string,
  lat?: number,
  lng?: number,
): Promise<any[]> {
  const baseParams: Record<string, string> = {};
  if (city) baseParams.geoCityName = city;
  if (countryCode && countryCode.length === 2) baseParams.geoCountryIso2 = countryCode;

  const tryFetch = async (params: Record<string, string>) => {
    const url = buildJambaseUrl("/events", params);
    const res = await fetch(url);
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
      console.warn(`[JamBase] events ${res.status} ${res.statusText}`, detail.slice(0, 500));
      return null;
    }
    const data = await res.json();
    console.log("[JamBase] events response", { count: data?.events?.length ?? 0 });
    return data;
  };

  // Primary: geoCityName (+ country code if available)
  let data = await tryFetch(baseParams);
  if (Array.isArray(data?.events) && data.events.length > 0) return data.events;

  // Fallback 1: cityName
  if (city) {
    data = await tryFetch({ cityName: city });
    if (Array.isArray(data?.events) && data.events.length > 0) return data.events;
  }

  // Fallback 2: lat/lng if provided (best-effort)
  if (lat != null && lng != null) {
    data = await tryFetch({ geoLatitude: String(lat), geoLongitude: String(lng) });
    if (Array.isArray(data?.events) && data.events.length > 0) return data.events;
  }

  return data?.events || [];
}
