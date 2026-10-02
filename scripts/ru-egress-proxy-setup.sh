#!/usr/bin/env bash
# Прокси в РФ для запросов okno к ЮKassa и Unisender (см. docs/ru-egress-proxy.md).
# Запускать от root на чистом российском VPS (Ubuntu/Debian):
#   OKNO_SERVER_IP=185.113.139.76 bash ru-egress-proxy-setup.sh
# В конце печатает RU_EGRESS_PROXY_URL для /opt/okno/.env.
set -euo pipefail

OKNO_SERVER_IP="${OKNO_SERVER_IP:?укажи OKNO_SERVER_IP — IP сервера okno}"
PROXY_PORT="${PROXY_PORT:-8888}"
PROXY_USER="okno"
PROXY_PASS="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq tinyproxy ufw curl >/dev/null

# Только домены, куда okno ходит из РФ. Всё остальное прокси отклоняет,
# чтобы он не превратился в открытый прокси, даже если пароль утечёт.
cat >/etc/tinyproxy/filter <<'EOF'
^api\.yookassa\.ru$
^yookassa\.ru$
^goapi\.unisender\.ru$
^go1\.unisender\.ru$
^go2\.unisender\.ru$
EOF

cat >/etc/tinyproxy/tinyproxy.conf <<EOF
User tinyproxy
Group tinyproxy
Port ${PROXY_PORT}
Timeout 60
LogLevel Warning
Syslog On
MaxClients 50
DisableViaHeader Yes
Allow ${OKNO_SERVER_IP}
BasicAuth ${PROXY_USER} ${PROXY_PASS}
ConnectPort 443
Filter "/etc/tinyproxy/filter"
FilterDefaultDeny Yes
EOF
chmod 640 /etc/tinyproxy/tinyproxy.conf
chgrp tinyproxy /etc/tinyproxy/tinyproxy.conf

systemctl enable tinyproxy >/dev/null 2>&1
systemctl restart tinyproxy

# Порт прокси открыт только для сервера okno; SSH не трогаем.
ufw allow OpenSSH >/dev/null
ufw allow from "${OKNO_SERVER_IP}" to any port "${PROXY_PORT}" proto tcp >/dev/null
ufw --force enable >/dev/null

# Сам VPS должен видеть ЮKassa; 401 значит «доступно, нужна авторизация».
echo "yookassa from this VPS: $(curl -s -o /dev/null -m 10 -w '%{http_code}' https://api.yookassa.ru/v3/me || echo FAIL)"
echo "tinyproxy: $(systemctl is-active tinyproxy)"
echo
echo "RU_EGRESS_PROXY_URL=http://${PROXY_USER}:${PROXY_PASS}@$(curl -s -4 -m 10 https://api.ipify.org):${PROXY_PORT}"
