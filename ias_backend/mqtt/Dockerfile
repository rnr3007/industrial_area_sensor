# syntax=docker/dockerfile:1
# MQTT broker for the IAS platform.
# Stands in for AWS IoT Core in local / on-prem deployments; the topic layout
# and credentials are identical, so devices need no change when switching.
FROM eclipse-mosquitto:2.0.18

COPY config/mosquitto.conf /mosquitto/config/mosquitto.conf
COPY entrypoint.sh /usr/local/bin/ias-entrypoint.sh

USER root
RUN sed -i 's/\r$//' /usr/local/bin/ias-entrypoint.sh \
  && chmod +x /usr/local/bin/ias-entrypoint.sh \
  && mkdir -p /mosquitto/data /mosquitto/log \
  && chown -R mosquitto:mosquitto /mosquitto
USER mosquitto

EXPOSE 1883 9001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD mosquitto_sub -h 127.0.0.1 -p 1883 -u "$MQTT_SERVICE_USER" -P "$MQTT_SERVICE_PASSWORD" -t '$SYS/broker/uptime' -C 1 -W 3 >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/ias-entrypoint.sh"]
