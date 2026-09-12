/**
 * Shared device matrix for the mobile perfection loop.
 * Portrait + landscape for each phone/tablet Rodrigo might use.
 */
export type MatrixDevice = {
  id: string;
  label: string;
  /** Playwright project name suffix, e.g. iphone-se-portrait */
  project: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  /** CSS user-agent brand hint for screenshots folders */
  folder: string;
};

type PhoneBase = {
  id: string;
  label: string;
  width: number;
  height: number;
  dpr: number;
  isMobile: boolean;
  hasTouch: boolean;
};

const PHONES: PhoneBase[] = [
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667, dpr: 2, isMobile: true, hasTouch: true },
  { id: "iphone-15", label: "iPhone 15", width: 393, height: 852, dpr: 3, isMobile: true, hasTouch: true },
  { id: "iphone-15-pro-max", label: "iPhone 15 Pro Max", width: 430, height: 932, dpr: 3, isMobile: true, hasTouch: true },
  { id: "pixel-8", label: "Pixel 8", width: 412, height: 915, dpr: 2.625, isMobile: true, hasTouch: true },
  { id: "ipad-mini", label: "iPad Mini", width: 744, height: 1133, dpr: 2, isMobile: true, hasTouch: true },
  { id: "ipad-pro", label: "iPad Pro", width: 1024, height: 1366, dpr: 2, isMobile: true, hasTouch: true },
];

export const MATRIX_DEVICES: MatrixDevice[] = PHONES.flatMap((d) => {
  const portrait: MatrixDevice = {
    id: d.id,
    label: `${d.label} portrait`,
    project: `${d.id}-portrait`,
    folder: `${d.id}/portrait`,
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.dpr,
    isMobile: d.isMobile,
    hasTouch: d.hasTouch,
  };
  const landscape: MatrixDevice = {
    id: d.id,
    label: `${d.label} landscape`,
    project: `${d.id}-landscape`,
    folder: `${d.id}/landscape`,
    viewport: { width: d.height, height: d.width },
    deviceScaleFactor: d.dpr,
    isMobile: d.isMobile,
    hasTouch: d.hasTouch,
  };
  return [portrait, landscape];
});

export const APP_ROUTES = [
  "/",
  "/warplan",
  "/exodus",
  "/realm",
  "/quests",
  "/pipeline",
  "/sponsors",
  "/treasury",
  "/oracle",
  "/chronicle",
  "/trophies",
  "/quality",
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

export const ROUTE_SLUG: Record<AppRoute, string> = {
  "/": "throne",
  "/warplan": "warplan",
  "/exodus": "exodus",
  "/realm": "realm",
  "/quests": "quests",
  "/pipeline": "pipeline",
  "/sponsors": "sponsors",
  "/treasury": "treasury",
  "/oracle": "oracle",
  "/chronicle": "chronicle",
  "/trophies": "trophies",
  "/quality": "quality",
};
