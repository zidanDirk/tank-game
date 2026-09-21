// Explicit pagination also works with Ubuntu's older gh (without --slurp).
export function readPages(request, endpoint) {
  const items = [];
  for (let page = 1; page <= 1000; page++) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const batch = request(["api", `${endpoint}${separator}per_page=100&page=${page}`]);
    if (!Array.isArray(batch)) throw new Error("GitHub pagination expected an array");
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error("GitHub pagination exceeded safety limit");
}
