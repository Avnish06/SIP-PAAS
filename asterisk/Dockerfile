FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    asterisk \
    asterisk-mysql \
    asterisk-config \
    sngrep \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY conf/ /etc/asterisk/

RUN mkdir -p /var/spool/asterisk/monitor \
             /var/log/asterisk \
             /var/run/asterisk

EXPOSE 5080/udp 5080/tcp 8088/tcp 5038/tcp

CMD ["asterisk", "-f", "-C", "/etc/asterisk/asterisk.conf"]
