FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      asterisk \
      asterisk-modules \
      sngrep \
      curl \
    && rm -rf /var/lib/apt/lists/*

COPY conf/ /etc/asterisk/

RUN mkdir -p /var/spool/asterisk/monitor \
             /var/log/asterisk \
             /var/run/asterisk

EXPOSE 5080/udp 5080/tcp 8088/tcp 5038/tcp

CMD ["asterisk", "-f", "-C", "/etc/asterisk/asterisk.conf"]
