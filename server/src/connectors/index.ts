import { GitHubConnector } from "./github.js";
import { Ga4Connector, SearchConsoleConnector, YouTubeConnector } from "./google.js";
import { GooglePlayConnector } from "./google-play.js";
import { InstagramConnector } from "./instagram.js";
import { PlaceholderConnector } from "./placeholder.js";
export const connectors = [
  new GitHubConnector(),
  new Ga4Connector(),
  new SearchConsoleConnector(),
  new YouTubeConnector(),
  new InstagramConnector(),
  new PlaceholderConnector("google_business", "Google Business Profile", "Offizieller API-Zugang wurde für dieses Projekt nicht gewährt.", false, "permission_missing"),
  new GooglePlayConnector(),
  new PlaceholderConnector("google_groups", "Google Groups", "Die gewünschte Analytics-Funktion ist über keine geeignete offizielle persönliche Groups-API verfügbar.", false),
];
export const connectorById = new Map(connectors.map((connector) => [connector.id, connector]));
