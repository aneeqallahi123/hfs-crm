import { api } from '../api/client.js';
import { setSectionNames } from './metrics.js';

// Fetch the Library's category names so engagement pages label categories correctly.
export async function loadSectionNames(module = 'audit') {
  try {
    const data = await api.library.getFull(module);
    setSectionNames(Object.fromEntries((data?.sections || []).map((s) => [s.code, s.name])));
  } catch {
    // fall back to the built-in A–D names
  }
}
