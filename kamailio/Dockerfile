FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y gnupg2 curl ca-certificates && \
    curl -fsSL https://deb.kamailio.org/kamailiodebkey.gpg \
      | gpg --dearmor -o /usr/share/keyrings/kamailio.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/kamailio.gpg] http://deb.kamailio.org/kamailio57 bookworm main" \
      > /etc/apt/sources.list.d/kamailio.list && \
    apt-get update && apt-get install -y --no-install-recommends \
      kamailio \
      kamailio-mysql-modules \
      kamailio-tls-modules \
      kamailio-websocket-modules \
      kamailio-presence-modules \
      kamailio-rtpengine-modules \
      kamailio-json-modules \
      kamailio-utils \
      kamailio-redis-modules \
      kamailio-extra-modules \
    && rm -rf /var/lib/apt/lists/*

COPY cfg/ /etc/kamailio/

EXPOSE 5060/udp 5060/tcp 5061/tcp

CMD ["kamailio", "-DD", "-E", "-f", "/etc/kamailio/kamailio.cfg"]
