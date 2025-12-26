#!/bin/sh
# Replicating acpi's brightness function

BRIGHTNESS_CACHE="$XDG_CACHE_HOME/brightness_cache"

# Set backlight in percent
set_backlight() {
  percent="$1"
  for backlight in /sys/class/backlight/*/; do
    [ -d "$backlight" ] || continue
    current_brightness=$(cat "$backlight/brightness")
    max_brightness=$(cat "$backlight/max_brightness")
    brightness=$(( percent*max_brightness/100 ))

    echo "$current_brightness" > "$BRIGHTNESS_CACHE"
    echo "$brightness" | sudo tee "$backlight/brightness"
  done
}

restore_backlight() {
  for backlight in /sys/class/backlight/*/; do
    [ -d "$backlight" ] || continue
    cat "$BRIGHTNESS_CACHE" | sudo tee "$backlight/brightness"
    rm "$BRIGHTNESS_CACHE"
  done
}

while getopts "b:r" opt; do
  case $opt in
    b)
    set_backlight 15
    swaylock -f
    ;;
    r)
    restore_backlight
    ;;
  esac
done
