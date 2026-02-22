import { useState, useRef } from 'react';
import {
  Search, MapPin, Calendar, ArrowRight,
  LayoutGrid, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Artist, JamBaseEvent, MarketInsight, Venue } from './types';
import { searchArtists, getArtistProfile, getArtistWherePeopleListen, getEvents, getVenues, getRelatedArtists } from './services/api';

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 160, H = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = ((i / (data.length - 1)) * W).toFixed(1);
    const y = (H - 2 - ((v - min) / range) * (H - 4)).toFixed(1);
    return `${x},${y}`;
  });
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
  return (
    <svg width={W} height={H} className="overflow-visible">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGrad)" />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketInsight[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [events, setEvents] = useState<JamBaseEvent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [relatedArtists, setRelatedArtists] = useState<any[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [artistProfile, setArtistProfile] = useState<any | null>(null);
  const [mapZoom, setMapZoom] = useState({ scale: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const isDraggingRef = useRef(false);
  const toNumber = (val: any): number | null => {
    if (val == null) return null;
    const num = typeof val === "string" ? Number(val) : val;
    return Number.isFinite(num) ? Number(num) : null;
  };
  const pickNumber = (...vals: any[]) => {
    for (const v of vals) {
      const n = toNumber(v);
      if (n != null) return n;
    }
    return null;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    setSelectedArtist(null);
    setSelectedCity(null);

    try {
      const artists = await searchArtists(searchQuery);
      setSearchResults(artists.map((a: any) => ({
        id: a.id,
        name: a.name,
        image_url: a.image_url ?? null,
        score: a.cm_artist_score || 0,
        sp_followers: a.sp_followers ?? null,
        sp_monthly_listeners: a.sp_monthly_listeners ?? null,
        verified: a.verified ?? false,
        band: a.band ?? null,
        gender: a.gender ?? null,
        primary_genre_smart: a.primary_genre_smart ?? null,
        isni: a.isni ?? null,
      })));
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const selectArtist = async (artist: Artist) => {
    if (!artist || !artist.id) return;

    setSelectedArtist(artist);
    setSearchResults([]);
    setSearchQuery(artist.name);
    setSelectedCity(null);
    setMarkets([]);
    setArtistProfile(null);
    setRelatedArtists([]);
    setMapZoom({ scale: 1, panX: 0, panY: 0 });

    setIsLoadingMarkets(true);
    setIsLoadingRelated(true);
    try {
      const artistId = artist.id;
      const [profileData, markets, related] = await Promise.all([
        getArtistProfile(artistId),
        getArtistWherePeopleListen(artistId),
        getRelatedArtists(artistId),
      ]);

      const profileObj = profileData.obj ?? null;
      setArtistProfile(profileObj);
      if (profileObj?.id && profileObj?.name) {
        const profileFollowers = pickNumber(
          profileObj.sp_followers,
          profileObj.sp_follower_count,
          profileObj.spotify_followers,
          profileObj.spotify_followers_count,
          profileObj.followers_spotify,
        );
        const profileMonthly = pickNumber(
          profileObj.sp_monthly_listeners,
          profileObj.sp_monthly_listener_count,
          profileObj.spotify_monthly_listeners,
          profileObj.spotify_monthly_listeners_count,
          profileObj.monthly_listeners_spotify,
        );
        setSelectedArtist(prev => prev?.id === profileObj.id ? ({
          ...prev,
          name: profileObj.name,
          image_url: profileObj.image_url ?? prev.image_url,
          score: profileObj.cm_artist_score ?? prev.score,
          sp_followers: profileFollowers ?? prev.sp_followers,
          sp_monthly_listeners: profileMonthly ?? prev.sp_monthly_listeners,
          verified: profileObj.verified ?? prev.verified,
          band: profileObj.band ?? prev.band,
          gender: profileObj.gender ?? prev.gender,
          primary_genre_smart: profileObj.primary_genre_smart ?? prev.primary_genre_smart,
          isni: profileObj.isni ?? prev.isni,
        }) : prev);
      }
      setMarkets(markets.slice(0, 10)); // top 5 popular + 5 emerging
      setRelatedArtists(Array.isArray(related) ? related : []);
    } catch (error) {
      console.error('Markets fetch error:', error);
    } finally {
      setIsLoadingMarkets(false);
      setIsLoadingRelated(false);
    }
  };

  const fetchCityDetails = async (market: MarketInsight) => {
    const city = market.city;
    const countryCode = market.country && market.country.length === 2 ? market.country : undefined;
    console.log("[City] selected", { city, countryCode, lat: market.lat, lng: market.lng });
    setSelectedCity(city);
    setIsLoadingDetails(true);
    setEvents([]);
    setVenues([]);

    try {
      const [rawEvents, fetchedVenues] = await Promise.all([
        getEvents(city, countryCode, market.lat, market.lng),
        getVenues(city, countryCode, market.lat, market.lng),
      ]);

      const mappedEvents: JamBaseEvent[] = rawEvents.map((e: any) => ({
        id: e.identifier || Math.random().toString(),
        name: e.name,
        startDate: e.startDate,
        venue: { name: e.location?.name || 'Unknown Venue' },
        url: e.url,
        eventType: e.name.toLowerCase().includes('festival') ? 'Festival' : 'Concert'
      }));

      setEvents(mappedEvents.slice(0, 6));
      setVenues(fetchedVenues.slice(0, 6));

    } catch (error) {
      console.error('City details fetch error:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // --- Map pan/zoom helpers ---
  const zoomAtCenter = (delta: number) => {
    if (!mapContainerRef.current) return;
    const { width, height } = mapContainerRef.current.getBoundingClientRect();
    const cx = width / 2, cy = height / 2;
    setMapZoom(t => {
      const newScale = Math.max(1, Math.min(4, t.scale + delta));
      return {
        scale: newScale,
        panX: cx - (cx - t.panX) * (newScale / t.scale),
        panY: cy - (cy - t.panY) * (newScale / t.scale),
      };
    });
  };

  const zoomToCity = (market: MarketInsight) => {
    if (!mapContainerRef.current) return;
    const { width, height } = mapContainerRef.current.getBoundingClientRect();
    const cityX = ((market.lng + 180) / 360) * width;
    const cityY = ((90 - market.lat) / 180) * height;
    const newScale = 2.5;
    setMapZoom({ scale: newScale, panX: width / 2 - cityX * newScale, panY: height / 2 - cityY * newScale });
  };

  const onMapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: mapZoom.panX, panY: mapZoom.panY };
    isDraggingRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMapPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (!isDraggingRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      isDraggingRef.current = true;
      setIsDragging(true);
    }
    if (isDraggingRef.current) {
      const startPanX = dragStartRef.current.panX;
      const startPanY = dragStartRef.current.panY;
      setMapZoom(t => ({ ...t, panX: startPanX + dx, panY: startPanY + dy }));
    }
  };

  const onMapPointerUp = () => {
    dragStartRef.current = null;
    setIsDragging(false);
    setTimeout(() => { isDraggingRef.current = false; }, 0);
  };

  const selectedMarket = markets.find(m => m.city === selectedCity) ?? null;
  const selectedMarketIdx = selectedMarket ? markets.indexOf(selectedMarket) : -1;
  const selectedMarketIsPopular = selectedMarketIdx >= 0 && selectedMarketIdx < 5;
  const maxListeners = markets.length > 0 ? Math.max(...markets.map(m => m.listeners)) : 1;
  const topMarkets = markets.slice(0, 5);
  const emergingMarkets = markets.slice(5, 10);
  const rawTrend = selectedMarket?.trend ?? [];
  const firstNonZero = rawTrend.findIndex(v => v > 0);
  const selectedMarketTrend = firstNonZero >= 0 ? rawTrend.slice(firstNonZero) : rawTrend;
  const selectedMarketGrowth = selectedMarketTrend.length >= 2
    ? ((selectedMarketTrend[selectedMarketTrend.length - 1] - selectedMarketTrend[0]) / (selectedMarketTrend[0] || 1)) * 100
    : 0;
  const relatedTop = relatedArtists.slice(0, 6);
  const selectArtistById = (id: number, partial?: Partial<Artist>) => {
    const placeholder: Artist = {
      id,
      name: partial?.name ?? "Loading...",
      image_url: partial?.image_url ?? null,
      score: partial?.score ?? 0,
      sp_followers: partial?.sp_followers ?? null,
      sp_monthly_listeners: partial?.sp_monthly_listeners ?? null,
      verified: partial?.verified ?? false,
      band: partial?.band ?? null,
      gender: partial?.gender ?? null,
      primary_genre_smart: partial?.primary_genre_smart ?? null,
      isni: partial?.isni ?? null,
    };
    selectArtist(placeholder);
  };
  const toArtistFromRelated = (artist: any): Artist | null => {
    const core = artist?.artist ?? artist;
    const rawId = core?.id ?? core?.artist_id ?? core?.artistId ?? artist?.id ?? artist?.artist_id ?? artist?.artistId;
    const idNum = typeof rawId === "string" ? Number(rawId) : rawId;
    if (!Number.isFinite(idNum)) return null;
    return {
      id: idNum,
      name: core?.name ?? core?.artist_name ?? artist?.name ?? artist?.artist_name ?? 'Unknown Artist',
      image_url: core?.image_url ?? core?.imageUrl ?? artist?.image_url ?? artist?.imageUrl ?? null,
      score: core?.cm_artist_score ?? core?.score ?? artist?.cm_artist_score ?? artist?.score ?? 0,
      sp_followers: core?.sp_followers ?? artist?.sp_followers ?? null,
      sp_monthly_listeners: core?.sp_monthly_listeners ?? artist?.sp_monthly_listeners ?? null,
      verified: core?.verified ?? artist?.verified ?? false,
      band: core?.band ?? artist?.band ?? null,
      gender: core?.gender ?? artist?.gender ?? null,
      primary_genre_smart: core?.primary_genre_smart ?? artist?.primary_genre_smart ?? null,
      isni: core?.isni ?? artist?.isni ?? null,
    };
  };

  return (
    <div className="min-h-screen bg-bg text-text-main font-sans">
      <main className="p-8 max-w-[1600px] mx-auto space-y-12">
        {/* Search Section */}
        <section className="space-y-8">
          <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl card-shadow border border-border">
            <form onSubmit={handleSearch} className="flex-1 relative">
              <input
                type="text"
                placeholder="Enter artist name..."
                className="w-full pl-4 pr-12 py-2 bg-bg rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-text-muted hover:text-primary">
                {isSearching ? <div className="w-4 h-4 border-2 border-primary border-t-transparent animate-spin" /> : <Search size={18} />}
              </button>
            </form>

            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setSelectedArtist(null);
                setSelectedCity(null);
                setMarkets([]);
                setArtistProfile(null);
                setMapZoom({ scale: 1, panX: 0, panY: 0 });
              }}
              className="px-8 py-2 border border-primary text-primary rounded-xl text-sm font-bold hover:bg-primary/5 transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-2xl card-shadow border border-border overflow-hidden max-h-[400px] overflow-y-auto"
              >
                {searchResults.map(artist => (
                  <button
                    key={artist.id}
                    onClick={() => selectArtist(artist)}
                    className="w-full p-4 flex items-center gap-4 hover:bg-bg transition-colors text-left border-b border-border last:border-0"
                  >
                    <div className="shrink-0">
                      {artist.image_url ? (
                        <img src={artist.image_url} className="w-12 h-12 rounded-xl object-cover" alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                          {artist.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold uppercase">{artist.name}</p>
                      <p className="text-xs text-text-muted uppercase">SCORE: {artist.score}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Artist Profile Card */}
        {selectedArtist && (
          <motion.section
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl card-shadow border border-border p-6 flex items-center gap-6"
          >
            {selectedArtist.image_url ? (
              <img src={selectedArtist.image_url} className="w-20 h-20 rounded-2xl object-cover shrink-0" alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-3xl shrink-0">
                {selectedArtist.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-extrabold uppercase tracking-tight truncate">{selectedArtist.name}</h2>
                {selectedArtist.verified && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase rounded-full">Verified</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-6">
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">CM Score</p>
                  <p className="text-lg font-extrabold">{selectedArtist.score.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">Spotify Followers</p>
                  <p className="text-lg font-extrabold">{selectedArtist.sp_followers?.toLocaleString() ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase">Monthly Listeners</p>
                  <p className="text-lg font-extrabold">{selectedArtist.sp_monthly_listeners?.toLocaleString() ?? '—'}</p>
                </div>
                {artistProfile?.code2 && (
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase">Country</p>
                    <p className="text-lg font-extrabold uppercase">{artistProfile.code2}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {/* Heatmap Section */}
        {!selectedCity && selectedArtist && (
          <motion.section
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-extrabold tracking-tight uppercase">
                Audience Heatmap: {selectedArtist.name}
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-xs font-bold text-text-muted uppercase">High Density</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary/20" />
                  <span className="text-xs font-bold text-text-muted uppercase">Emerging</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-6">
              <div
                ref={mapContainerRef}
                className={`relative aspect-[21/9] bg-white rounded-[40px] card-shadow border border-border overflow-hidden ${mapZoom.scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
                onPointerDown={onMapPointerDown}
                onPointerMove={onMapPointerMove}
                onPointerUp={onMapPointerUp}
              >
                <div className="absolute inset-0 opacity-5 pointer-events-none">
                  <Globe className="w-full h-full text-primary" />
                </div>

                {/* Zoom controls */}
                <div className="absolute top-4 right-4 z-20 flex flex-col gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); zoomAtCenter(0.5); }}
                    className="w-8 h-8 bg-white rounded-lg card-shadow border border-border font-bold text-base leading-none flex items-center justify-center hover:bg-bg transition-colors"
                  >+</button>
                  <button
                    onClick={e => { e.stopPropagation(); setMapZoom({ scale: 1, panX: 0, panY: 0 }); }}
                    className="w-8 h-8 bg-white rounded-lg card-shadow border border-border text-text-muted text-sm font-bold flex items-center justify-center hover:bg-bg transition-colors"
                    title="Reset zoom"
                  >⌂</button>
                  <button
                    onClick={e => { e.stopPropagation(); zoomAtCenter(-0.5); }}
                    className="w-8 h-8 bg-white rounded-lg card-shadow border border-border font-bold text-base leading-none flex items-center justify-center hover:bg-bg transition-colors"
                  >−</button>
                </div>

                {isLoadingMarkets ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                    <p className="text-sm font-bold text-text-muted uppercase">Loading market data...</p>
                  </div>
                ) : markets.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-sm font-bold text-text-muted uppercase">No market data found for this artist.</p>
                  </div>
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      transform: `translate(${mapZoom.panX}px, ${mapZoom.panY}px) scale(${mapZoom.scale})`,
                      transformOrigin: '0 0',
                      transition: isDragging ? 'none' : 'transform 0.4s ease',
                    }}
                  >
                    {/* World map base */}
                    <img
                      src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/World_map_-_low_resolution.svg/2000px-World_map_-_low_resolution.svg.png"
                      className="w-full h-full object-cover opacity-10 grayscale"
                      alt="World Map"
                    />

                    {/* Glow blobs at real lat/lng positions */}
                    {markets.map((market, idx) => {
                      const x = ((market.lng + 180) / 360) * 100;
                      const y = ((90 - market.lat) / 180) * 100;
                      const isPopular = idx < 5;
                      const size = isPopular
                        ? 60 + (market.listeners / maxListeners) * 80
                        : 30 + (market.listeners / maxListeners) * 40;
                      return (
                        <motion.div
                          key={`blob-${market.city}`}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: isPopular ? 0.25 : 0.12, scale: 1 }}
                          className={`absolute rounded-full blur-2xl pointer-events-none ${isPopular ? 'bg-primary' : 'bg-primary/60'}`}
                          style={{
                            width: `${size}px`,
                            height: `${size}px`,
                            top: `${y}%`,
                            left: `${x}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                      );
                    })}

                    {/* Clickable city markers */}
                    {markets.map((market, idx) => {
                      const x = ((market.lng + 180) / 360) * 100;
                      const y = ((90 - market.lat) / 180) * 100;
                      const isPopular = idx < 5;
                      return (
                        <motion.button
                          key={market.city}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          onClick={() => {
                            if (isDraggingRef.current) return;
                            zoomToCity(market);
                            fetchCityDetails(market);
                          }}
                          className="absolute z-10 group"
                          style={{
                            top: `${y}%`,
                            left: `${x}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          {/* Dot */}
                          <div className={`rounded-full border-2 border-white shadow-lg group-hover:scale-150 transition-transform ${isPopular ? 'w-3 h-3 bg-primary' : 'w-2 h-2 bg-primary/40'}`} />
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center pointer-events-none">
                            <div className="bg-white rounded-xl card-shadow border border-border p-3 text-left min-w-35 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-bold uppercase">{market.city}</p>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${isPopular ? 'bg-primary/10 text-primary' : 'bg-text-muted/10 text-text-muted'}`}>
                                  {isPopular ? 'Popular' : 'Emerging'}
                                </span>
                              </div>
                              <p className="text-[10px] text-text-muted uppercase">{market.country}</p>
                              <div className="space-y-0.5">
                                <div className="flex justify-between text-[10px] font-bold text-text-muted uppercase">
                                  <span>Listeners</span>
                                  <span>{market.listeners.toLocaleString()}</span>
                                </div>
                                <div className="h-1 w-full bg-bg rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${isPopular ? 'bg-primary' : 'bg-primary/40'}`}
                                    style={{ width: `${(market.listeners / maxListeners) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="w-2 h-2 bg-white border-r border-b border-border rotate-45 -mt-1" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-[32px] card-shadow border border-border p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-extrabold uppercase tracking-tight">Top Cities</h3>
                    <span className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-1 rounded-full">Top 5</span>
                  </div>
                  <div className="space-y-3">
                    {topMarkets.map((market, idx) => (
                      <button
                        key={`top-${market.city}`}
                        onClick={() => { zoomToCity(market); fetchCityDetails(market); }}
                        className="w-full text-left p-4 rounded-2xl border border-border hover:border-primary hover:bg-bg transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="text-sm font-extrabold uppercase">{market.city}</p>
                              <p className="text-[10px] text-text-muted uppercase">{market.country}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-text-muted uppercase">Listeners</p>
                            <p className="text-sm font-extrabold">{market.listeners.toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 w-full bg-bg rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(market.listeners / maxListeners) * 100}%` }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-[32px] card-shadow border border-border p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-extrabold uppercase tracking-tight">Emerging Markets</h3>
                    <span className="text-[10px] font-bold text-text-muted uppercase bg-bg px-2 py-1 rounded-full">Next 5</span>
                  </div>
                  <div className="space-y-3">
                    {emergingMarkets.map((market, idx) => (
                      <button
                        key={`emerging-${market.city}`}
                        onClick={() => { zoomToCity(market); fetchCityDetails(market); }}
                        className="w-full text-left p-4 rounded-2xl border border-border hover:border-primary hover:bg-bg transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-text-muted/10 text-text-muted text-xs font-bold flex items-center justify-center">
                              {idx + 6}
                            </div>
                            <div>
                              <p className="text-sm font-extrabold uppercase">{market.city}</p>
                              <p className="text-[10px] text-text-muted uppercase">{market.country}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-text-muted uppercase">Listeners</p>
                            <p className="text-sm font-extrabold">{market.listeners.toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 w-full bg-bg rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/40"
                            style={{ width: `${(market.listeners / maxListeners) * 100}%` }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* Detail Dashboard Section */}
        <AnimatePresence>
          {selectedCity && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-5xl font-extrabold tracking-tight">{selectedCity}</h2>
                  <p className="text-sm font-bold text-text-muted uppercase tracking-widest">Market Intelligence Breakdown</p>
                </div>
                <button
                  onClick={() => { setSelectedCity(null); setMapZoom({ scale: 1, panX: 0, panY: 0 }); }}
                  className="flex items-center gap-2 px-6 py-3 bg-white border border-border rounded-2xl text-sm font-bold text-primary hover:bg-primary/5 transition-colors card-shadow"
                >
                  <ArrowRight className="rotate-180" size={18} />
                  BACK TO HEATMAP
                </button>
              </div>

              {/* Listener Stats Card */}
              {selectedMarket && (
                <section className="bg-white rounded-[32px] card-shadow border border-border p-6">
                  <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Chartmetric Audience Data</p>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${selectedMarketIsPopular ? 'bg-primary/10 text-primary' : 'bg-text-muted/10 text-text-muted'}`}>
                          {selectedMarketIsPopular ? 'Popular Market' : 'Emerging Market'}
                        </span>
                      </div>
                      <p className="text-4xl font-extrabold tabular-nums">{selectedMarket.listeners.toLocaleString()}</p>
                      <p className="text-xs font-bold text-text-muted uppercase">Listeners in {selectedCity}</p>
                    </div>
                    {selectedMarketTrend.length >= 2 && (
                      <div className="flex items-end gap-8">
                        <div className="space-y-1 text-right">
                          <p className="text-[10px] font-bold text-text-muted uppercase">Growth</p>
                          <p className={`text-2xl font-extrabold ${selectedMarketGrowth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {selectedMarketGrowth >= 0 ? '+' : ''}{selectedMarketGrowth.toFixed(1)}%
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-text-muted uppercase">Trend</p>
                          <div className={selectedMarketIsPopular ? 'text-primary' : 'text-text-muted'}>
                            <Sparkline data={selectedMarketTrend} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-extrabold tracking-tight">Related Artists</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {isLoadingRelated ? (
                      [1, 2, 3].map(i => <div key={i} className="aspect-video bg-white rounded-[32px] animate-pulse border border-border" />)
                    ) : relatedTop.length > 0 ? (
                      relatedTop.map((artist: any, idx: number) => {
                        const mapped = toArtistFromRelated(artist);
                        const canSelect = Boolean(mapped?.id);
                        const displayName = mapped?.name ?? artist?.name ?? artist?.artist_name ?? 'Unknown Artist';
                        const displayImage = mapped?.image_url ?? artist?.image_url ?? artist?.imageUrl ?? artist?.artist?.image_url ?? null;
                        const displayScore = mapped?.score ?? artist?.cm_artist_score ?? artist?.score ?? null;
                        return (
                        <button
                          key={`${mapped?.id ?? artist?.id ?? artist?.artist_id ?? idx}`}
                          onClick={() => {
                            if (!mapped) return;
                            console.log("[Related] selecting artist", { id: mapped.id });
                            selectArtistById(mapped.id, {
                              name: mapped.name,
                              image_url: mapped.image_url,
                              score: mapped.score,
                              sp_followers: mapped.sp_followers,
                              sp_monthly_listeners: mapped.sp_monthly_listeners,
                              verified: mapped.verified,
                              band: mapped.band,
                              gender: mapped.gender,
                              primary_genre_smart: mapped.primary_genre_smart,
                              isni: mapped.isni,
                            });
                          }}
                          disabled={!canSelect}
                          className={`text-left bg-white p-6 rounded-[32px] card-shadow border border-border space-y-4 transition-colors ${canSelect ? 'hover:border-primary hover:bg-bg' : 'opacity-60 cursor-not-allowed'}`}
                        >
                          <div className="flex items-center gap-4">
                            {displayImage ? (
                              <img
                                src={displayImage}
                                className="w-12 h-12 rounded-2xl object-cover"
                                alt=""
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                                {(displayName?.charAt(0) ?? '?').toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold uppercase truncate">{displayName}</p>
                              <p className="text-[10px] text-text-muted uppercase">Related</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-text-muted uppercase">CM Score</span>
                            <span className="text-sm font-extrabold">
                              {Number.isFinite(Number(displayScore))
                                ? Number(displayScore).toFixed(1)
                                : '—'}
                            </span>
                          </div>
                        </button>
                        );
                      })
                    ) : (
                      <div className="col-span-full p-12 text-center bg-white rounded-[32px] border border-border border-dashed">
                        <p className="text-sm font-bold text-text-muted uppercase">No related artists found.</p>
                      </div>
                    )}
                  </div>
                </section>

              {/* Event Section */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-extrabold tracking-tight">Events</h3>
                  <div className="flex items-center gap-4">
                    {isLoadingDetails && (
                      <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        Loading
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-4 py-2 bg-white border border-border rounded-xl">
                      <Calendar size={16} className="text-text-muted" />
                    </div>
                    <button className="px-8 py-2 bg-primary text-white rounded-xl text-sm font-bold">Search</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {isLoadingDetails ? (
                    [1, 2, 3].map(i => <div key={i} className="aspect-video rounded-[32px] border border-border shimmer" />)
                  ) : events.length > 0 ? (
                    events.map(event => (
                      <div key={event.id} className="bg-white p-6 rounded-[32px] card-shadow border border-border space-y-4 group hover:border-primary transition-colors">
                        <div className="flex justify-between items-start">
                          <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase">
                            {event.eventType}
                          </span>
                          <span className="text-[10px] font-bold text-text-muted uppercase">
                            {new Date(event.startDate).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="text-xl font-bold uppercase line-clamp-2">{event.name}</h4>
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <MapPin size={14} />
                          <span className="uppercase">{event.venue.name}</span>
                        </div>
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs font-bold text-primary group-hover:translate-x-1 transition-transform"
                        >
                          VIEW DETAILS <ArrowRight size={14} />
                        </a>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full p-12 text-center bg-white rounded-[32px] border border-border border-dashed">
                      <p className="text-sm font-bold text-text-muted uppercase">No upcoming events found.</p>
                    </div>
                  )}
                </div>
              </section>

            </motion.div>
          )}
        </AnimatePresence>

        {/* System Idle State */}
        {!selectedArtist && !selectedCity && (
          <div className="py-32 flex flex-col items-center justify-center text-center space-y-8">
            <div className="w-24 h-24 bg-white rounded-[32px] card-shadow border border-border flex items-center justify-center">
              <LayoutGrid size={40} className="text-primary/20" />
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-extrabold tracking-tight uppercase">SYSTEM IDLE</h3>
              <p className="text-sm font-bold text-text-muted uppercase tracking-widest">
                Search for an artist to begin market discovery analysis
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
