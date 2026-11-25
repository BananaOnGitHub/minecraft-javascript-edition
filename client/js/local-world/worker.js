import { serveLocalSession } from './session.js';
import { loadLocalWorld } from './server.js';

serveLocalSession(globalThis, loadLocalWorld);
