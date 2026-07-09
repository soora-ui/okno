// ЮKassa не подписывает вебхуки HMAC: официальный способ проверить подлинность
// уведомления — сверить IP отправителя с опубликованными диапазонами.
// Источник: https://yookassa.ru/developers/using-api/webhooks#ip
const YOOKASSA_IPV4_RANGES: Array<{ base: string; prefix: number }> = [
  { base: "185.71.76.0", prefix: 27 },
  { base: "185.71.77.0", prefix: 27 },
  { base: "77.75.153.0", prefix: 25 },
  { base: "77.75.156.11", prefix: 32 },
  { base: "77.75.156.35", prefix: 32 },
  { base: "77.75.154.128", prefix: 25 },
];

// 2a02:5180::/32 — первые два хекстета адреса.
const YOOKASSA_IPV6_PREFIX = ["2a02", "5180"];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");

  if (parts.length !== 4) {
    return null;
  }

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }

    const octet = Number(part);
    if (octet > 255) {
      return null;
    }

    result = result * 256 + octet;
  }

  return result;
}

function matchesIpv4Range(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);

  if (ipInt === null) {
    return false;
  }

  return YOOKASSA_IPV4_RANGES.some(({ base, prefix }) => {
    const baseInt = ipv4ToInt(base)!;
    const shift = 32 - prefix;
    return Math.floor(ipInt / 2 ** shift) === Math.floor(baseInt / 2 ** shift);
  });
}

function expandIpv6Hextets(ip: string): string[] | null {
  const [head, tail, extra] = ip.split("::");

  if (extra !== undefined) {
    return null;
  }

  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;

  if (tail === undefined && headParts.length !== 8) {
    return null;
  }

  if (tail !== undefined && missing < 0) {
    return null;
  }

  const hextets =
    tail === undefined
      ? headParts
      : [...headParts, ...Array<string>(missing).fill("0"), ...tailParts];

  if (hextets.some((part) => !/^[0-9a-fA-F]{1,4}$/.test(part))) {
    return null;
  }

  return hextets.map((part) => part.toLowerCase().padStart(4, "0"));
}

function matchesIpv6Range(ip: string): boolean {
  const hextets = expandIpv6Hextets(ip);

  if (!hextets) {
    return false;
  }

  return YOOKASSA_IPV6_PREFIX.every(
    (expected, index) => hextets[index] === expected.padStart(4, "0"),
  );
}

export function isYooKassaIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase();

  // IPv4-mapped IPv6 (::ffff:77.75.153.10) приходит от некоторых прокси.
  if (ip.startsWith("::ffff:")) {
    return matchesIpv4Range(ip.slice("::ffff:".length));
  }

  if (ip.includes(":")) {
    return matchesIpv6Range(ip);
  }

  return matchesIpv4Range(ip);
}
