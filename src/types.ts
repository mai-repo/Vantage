export interface Artist {
  id: number;
  name: string;
  image_url: string | null;
  score: number;
  sp_followers: number | null;
  sp_monthly_listeners: number | null;
  verified: boolean;
  band: boolean | null;
  gender: string | null;
  primary_genre_smart: number | null;
  isni: string | null;
}

export interface Venue {
  venueId: string;
  name: string;
  address: {
    city: string;
    stateCode: string;
  };
  url: string;
}

export interface MarketInsight {
  city: string;
  country: string;
  listeners: number;
  lat: number;
  lng: number;
  trend: number[]; // listener counts over time, oldest → newest
}

export interface JamBaseEvent {
  id: string;
  name: string;
  startDate: string;
  venue: {
    name: string;
  };
  url: string;
  eventType: 'Showcase' | 'Festival' | 'Open Mic' | 'Concert';
}
