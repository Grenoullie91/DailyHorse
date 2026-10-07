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
  new PlaceholderConnector("google_business", "Google Business Profile", "Not available through the official API: Google did not grant this project's Business Profile API access." , false),
  new GooglePlayConnector(),
  new PlaceholderConnector("google_groups", "Google Groups", "Not available through an official personal-groups analytics API.", false),
];
export const connectorById = new Map(connectors.map((connector) => [connector.id, connector]));
