#!/bin/bash

hide_waybar() { killall -SIGUSR1 waybar; }
show_waybar() { killall -SIGUSR2 waybar; }

JQ_FILTER='select(has("OverviewOpenedOrClosed")).OverviewOpenedOrClosed.is_open'

while IFS= read -r overview; do
    if [[ "$overview" == "true" ]]; then
	show_waybar
    elif [[ "$overview" == "false" ]]; then
	hide_waybar
    fi
done < <(niri msg --json event-stream |
	 jq --unbuffered --raw-output "$JQ_FILTER")
