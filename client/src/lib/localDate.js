// Format a Date as 'YYYY-MM-DD' from its LOCAL calendar parts (the user's
// browser day), NOT UTC. `date.toISOString().slice(0,10)` converts to UTC
// first, so in the evening (US Central) it yields TOMORROW's date — which is
// why dashboard default ranges and the week/month presets were off by a day
// after ~6-7 PM CT. The server now interprets the 'YYYY-MM-DD' it receives as a
// Central calendar day (see server/lib/period.js), so the client just needs to
// send the user's actual calendar day.
export function toLocalYMD(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
