#!/bin/sh
# Rebuild the password file from the environment on every boot so credentials
# live in the compose env instead of a checked-in secret.
set -e

PASSWD_FILE=/mosquitto/config/passwd

: "${MQTT_SERVICE_USER:=ias_service}"
: "${MQTT_SERVICE_PASSWORD:=ias_service_password}"
: "${MQTT_DEVICE_USER:=ias_device}"
: "${MQTT_DEVICE_PASSWORD:=ias_device_password}"

rm -f "$PASSWD_FILE"
touch "$PASSWD_FILE"
chmod 0600 "$PASSWD_FILE"

mosquitto_passwd -b "$PASSWD_FILE" "$MQTT_SERVICE_USER" "$MQTT_SERVICE_PASSWORD"
mosquitto_passwd -b "$PASSWD_FILE" "$MQTT_DEVICE_USER" "$MQTT_DEVICE_PASSWORD"

echo "[ias-mqtt] password file generated for users: $MQTT_SERVICE_USER, $MQTT_DEVICE_USER"

exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
