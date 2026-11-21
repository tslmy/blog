// A tiny publish/subscribe channel: a figure publishes its current data, and figures that show the same data subscribe.
// A late subscriber gets the latest value at once, so the order in which figures load does not matter.
const channels = {};

export const channel = (name) => (channels[name] ??= {
  data: null,
  subs: [],
  publish(d) { this.data = d; this.subs.forEach((f) => f(d)); },
  subscribe(f) { this.subs.push(f); if (this.data) f(this.data); },
});
