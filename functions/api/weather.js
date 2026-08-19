/* WHERE THE CLASS IS, AND HOW WARM IT IS — WITHOUT THE CLASS TALKING TO
   ANYBODY BUT US.
   =====================================================================
   The obvious way to put a temperature on the page is to call a weather
   service from the student's browser. It works, it is free, and it hands
   thirteen teenagers' IP addresses to a company they have never heard of —
   because every request a browser makes tells the far end who is asking.

   So the call happens here instead, at Cloudflare's edge. The browser asks
   hiajar.com; hiajar.com asks the weather service. The student's address
   never leaves the network that was already serving them the page.

   Cloudflare fills request.cf with where the request entered its network —
   the city and the coordinates of the nearest data centre, not of a person.
   That is what goes out, and nothing else does: no name, no account, no
   identifier of any kind. There is nothing here to leak because nothing
   personal is ever in scope. */

const UPSTREAM = 'https://api.open-meteo.com/v1/forecast';

// Half an hour. The weather does not move faster than that, and this is what
// keeps thirteen phones in one room from becoming thirteen calls a minute.
const CACHE_SECONDS = 1800;

// A number that is not a temperature is a bug somewhere upstream, and drawing
// it would put nonsense on a classroom screen. Fahrenheit, because the class
// is in the United States.
const MIN_F = -80, MAX_F = 140;

function quiet(){
  /* An empty answer, cached briefly. The page draws nothing at all when this
     comes back — no error text, no "weather unavailable", because a broken
     widget in front of a class is worse than no widget. The short cache stops
     a service having a bad minute from turning into a retry storm. */
  return new Response(JSON.stringify({}), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' },
  });
}

export async function onRequestGet({ request }) {
  const cf = request.cf || {};
  const lat = Number(cf.latitude), lon = Number(cf.longitude);
  if (!isFinite(lat) || !isFinite(lon)) return quiet();

  const url = UPSTREAM
    + '?latitude=' + encodeURIComponent(lat.toFixed(2))
    + '&longitude=' + encodeURIComponent(lon.toFixed(2))
    + '&current=temperature_2m&temperature_unit=fahrenheit';

  let data;
  try {
    // Four seconds. A held-open request here is a held-open request on every
    // phone in the room.
    const upstream = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!upstream.ok) return quiet();
    data = await upstream.json();
  } catch (e) {
    return quiet();
  }

  const t = Number(data && data.current && data.current.temperature_2m);
  if (!isFinite(t) || t < MIN_F || t > MAX_F) return quiet();

  /* The city is Cloudflare's, and it is a string from outside this file, so
     it is bounded here rather than trusted downstream. The page escapes it
     again on the way to the screen — twice is the correct number of times for
     somebody else's text. */
  const city = typeof cf.city === 'string' ? cf.city.slice(0, 40) : '';

  return new Response(JSON.stringify({ city, tempF: Math.round(t) }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=' + CACHE_SECONDS,
      // Nothing here is per-person, so there is nothing to keep private —
      // but say so, rather than leaving it to be assumed.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
