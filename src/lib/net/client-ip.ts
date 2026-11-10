// Адрес посетителя для лимитов и IP-фильтров. Единственное место, где он
// определяется: раньше три копии этой функции брали первый элемент
// X-Forwarded-For, а его присылает сам клиент — Cloudflare и nginx лишь
// дописывают свой адрес в конец. Подставив заголовок, можно было обнулять
// лимиты на SMS-коды, запись и ИИ-чаты и пройти IP-фильтр вебхука ЮKassa.
//
// Порядок доверия:
//   1. CF-Connecting-IP — сервер принимает 80/443 только от Cloudflare (UFW),
//      а Cloudflare этот заголовок всегда перезаписывает своим значением.
//   2. X-Real-IP — его ставит nginx из $remote_addr (после real_ip по
//      CF-Connecting-IP): запросы самого сервера к себе и локальная разработка.
//   3. Последний элемент X-Forwarded-For — его дописал ближайший к нам прокси.
//      Первый элемент не берём никогда.
export function getClientIp(request: Request): string {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) {
      return nearest;
    }
  }

  return "unknown";
}

// Ключ для лимитов по адресу. IPv4 — сам адрес. IPv6 — подсеть /64: провайдер
// выдаёт абоненту целую /64, и лимит на отдельный адрес обходится простой
// сменой младших 64 бит.
export function rateLimitKeyForIp(ip: string): string {
  if (!ip.includes(":")) {
    return ip;
  }

  const [head, tail] = ip.toLowerCase().split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail === undefined ? [] : tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups =
    tail === undefined
      ? headGroups
      : [...headGroups, ...Array(Math.max(missing, 0)).fill("0"), ...tailGroups];

  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    // IPv4-mapped (::ffff:1.2.3.4) и прочие нестандартные формы — как есть.
    return ip;
  }

  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
