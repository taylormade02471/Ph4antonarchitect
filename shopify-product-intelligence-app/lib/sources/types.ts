export type RawProductObservation = {
  parentObservationId?: number | string;
  observationKind?: "DISCOVERY" | "VARIANT";
  sourceProductKey?: string;
  sourceVariantKey?: string;
  sourceUrl: string;
  brandRaw?: string;
  titleRaw?: string;
  concentrationRaw?: string;
  sizeRaw?: string;
  sourceSku?: string;
  sourceItemId?: string;
  currency?: string;
  currentPrice?: number;
  listPrice?: number;
  availabilityRaw?: string;
  rating?: number;
  reviewCount?: number;
  trendFlag?: string;
  sourcePosition?: number;
  promotionRaw?: string;
  rawPayload?: Record<string, unknown>;
};

export interface SourceAdapter {
  key: string;
  version: string;
  pagesRequested?: number;
  discover(): Promise<RawProductObservation[]>;
}
