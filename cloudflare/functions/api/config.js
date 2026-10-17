import { json } from '../_lib.js';

export async function onRequestGet({ env }) {
  return json({ clientId: env.GOOGLE_CLIENT_ID || null });
}