FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ngcp-rtpengine \
    && rm -rf /var/lib/apt/lists/* \
    || (apt-get install -y curl && \
        curl -fsSL https://deb.sipwise.com/spce/pool/main/n/ngcp-rtpengine/ngcp-rtpengine_latest.deb -o /tmp/rtp.deb && \
        apt-get install -y /tmp/rtp.deb)

COPY rtpengine.conf /etc/rtpengine/rtpengine.conf

CMD ["rtpengine", "--config-file=/etc/rtpengine/rtpengine.conf"]
